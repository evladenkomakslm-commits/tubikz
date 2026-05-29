import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * Verbose TURN diagnostic for Cloudflare Realtime. Shows whether the env
 * vars are visible, the HTTP status of the credentials request, and a
 * truncated response body — so any misconfig is obvious from the profile
 * panel without server logs. Auth-gated, debugging only.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const tokenId = process.env.CLOUDFLARE_TURN_TOKEN_ID ?? null;
  const apiToken = process.env.CLOUDFLARE_TURN_API_TOKEN ?? null;

  const out: Record<string, unknown> = {
    cf_token_id_set: !!tokenId,
    cf_token_id_first_chars: tokenId ? tokenId.slice(0, 8) + '…' : null,
    cf_api_token_set: !!apiToken,
    cf_api_token_length: apiToken ? apiToken.length : 0,
    manual_turn_set:
      !!process.env.TURN_URL &&
      !!process.env.TURN_USERNAME &&
      !!process.env.TURN_CREDENTIAL,
  };

  if (tokenId && apiToken) {
    const url = `https://rtc.live.cloudflare.com/v1/turn/keys/${tokenId}/credentials/generate-ice-servers`;
    out.cf_url_tried = url;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ ttl: 86400 }),
      });
      out.cf_status = res.status;
      out.cf_status_text = res.statusText;
      const text = await res.text();
      out.cf_body_first_500 = text.slice(0, 500);
      try {
        const parsed = JSON.parse(text) as {
          iceServers?: { urls?: string | string[] };
        };
        const urls = parsed.iceServers?.urls;
        out.turn_urls = Array.isArray(urls) ? urls : urls ? [urls] : [];
      } catch {
        out.parse_error = 'response was not valid JSON';
      }
    } catch (e) {
      out.fetch_error = e instanceof Error ? e.message : 'unknown';
    }
  }

  return NextResponse.json(out, {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
