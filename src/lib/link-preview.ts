import { prisma } from '@/lib/db';

const URL_RE = /\bhttps?:\/\/[^\s<>()"']+/gi;
const STALE_DAYS = 7;
const FETCH_TIMEOUT_MS = 4_000;
const MAX_RESPONSE_BYTES = 256 * 1024;

/** Pull all http(s) URLs out of a chat message body. */
export function extractUrls(text: string | null | undefined): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  for (const m of text.matchAll(URL_RE)) {
    const cleaned = trimTrailingPunct(m[0]);
    seen.add(cleaned);
    if (seen.size >= 4) break; // hard cap so a wall of links doesn't blow up
  }
  return [...seen];
}

function trimTrailingPunct(u: string): string {
  // Strip the kind of trailing chars markdown leaves on the URL
  // ("https://x.com.", ").", "!").
  return u.replace(/[\)\].,;:!?'"`>]+$/, '');
}

export interface LinkPreviewView {
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
}

/**
 * Resolve previews for a list of urls. Cached rows fresher than STALE_DAYS
 * are returned immediately; stale or missing ones get fetched in parallel
 * and upserted. Failures are silent — bad links just return nothing.
 */
export async function resolvePreviews(
  urls: string[],
): Promise<LinkPreviewView[]> {
  if (urls.length === 0) return [];

  const cached = await prisma.linkPreview.findMany({
    where: { url: { in: urls } },
  });
  const cachedMap = new Map(cached.map((c) => [c.url, c]));
  const stale = (d: Date) =>
    Date.now() - d.getTime() > STALE_DAYS * 24 * 60 * 60 * 1000;

  const toFetch = urls.filter((u) => {
    const c = cachedMap.get(u);
    return !c || stale(c.fetchedAt);
  });

  const fetched = await Promise.all(toFetch.map(fetchOg));

  for (let i = 0; i < toFetch.length; i++) {
    const url = toFetch[i];
    const data = fetched[i];
    if (!data) continue;
    try {
      const row = await prisma.linkPreview.upsert({
        where: { url },
        create: { url, ...data },
        update: { ...data, fetchedAt: new Date() },
      });
      cachedMap.set(url, row);
    } catch {
      // Silently ignore — a flaky DB shouldn't break message creation.
    }
  }

  return urls
    .map((u) => cachedMap.get(u))
    .filter((c): c is NonNullable<typeof c> => !!c)
    .map((c) => ({
      url: c.url,
      title: c.title,
      description: c.description,
      imageUrl: c.imageUrl,
      siteName: c.siteName,
    }));
}

interface OgData {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
}

async function fetchOg(url: string): Promise<OgData | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'user-agent': 'TubikzBot/1.0 (link-preview)',
        accept: 'text/html,*/*',
      },
      redirect: 'follow',
    }).catch(() => null);
    clearTimeout(timer);
    if (!res || !res.ok) return null;
    const ctype = res.headers.get('content-type') ?? '';
    if (!ctype.includes('html') && !ctype.includes('xml')) return null;

    // Cap how much HTML we read — big pages don't put OG tags past <head>.
    const reader = res.body?.getReader();
    if (!reader) return null;
    const decoder = new TextDecoder('utf-8');
    let html = '';
    let total = 0;
    while (total < MAX_RESPONSE_BYTES) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      html += decoder.decode(value, { stream: true });
      // Cheap early-out — once </head> is in the buffer, we have enough.
      if (html.includes('</head>')) break;
    }
    reader.cancel?.().catch(() => {});

    return parseOg(html, url);
  } catch {
    return null;
  }
}

/** Tiny HTML head parser — looks for OG / twitter / fallback meta. */
function parseOg(html: string, baseUrl: string): OgData {
  const head = html.split('</head>')[0] ?? html;
  const meta = (key: string) => {
    // Match <meta property="og:title" content="..."> in either order.
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${escape(key)}["'][^>]*content=["']([^"']+)["']`,
      'i',
    );
    const re2 = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${escape(key)}["']`,
      'i',
    );
    return decode(head.match(re)?.[1] ?? head.match(re2)?.[1] ?? '') || null;
  };
  const titleTag = decode(head.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? '');
  const title =
    meta('og:title') ?? meta('twitter:title') ?? titleTag ?? null;
  const description =
    meta('og:description') ?? meta('twitter:description') ?? meta('description');
  let imageUrl = meta('og:image') ?? meta('twitter:image');
  if (imageUrl) imageUrl = absolute(imageUrl, baseUrl);
  const siteName = meta('og:site_name');
  return { title, description, imageUrl, siteName };
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function absolute(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}
