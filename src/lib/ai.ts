/**
 * Single-shot chat-completion wrapper used by every AI feature.
 *
 * Provider priority:
 *   1. Groq (Llama 3.3 70B) when GROQ_API_KEY is set — fast, generous
 *      free tier (30 req/min, 14k req/day).
 *   2. Pollinations text API as anonymous fallback — no key, OpenAI-
 *      compatible. Slower and rate-limited, but lets the app work
 *      out-of-the-box.
 *
 * All AI features are graceful — if both providers fail, the caller
 * gets `null` and surfaces a friendly toast.
 */

export interface ChatMsg {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const POLLINATIONS_URL = 'https://text.pollinations.ai/openai';
// Only model on the anonymous tier as of 2026-05 — GPT-OSS 20B served via OVH.
// Pollinations' /models endpoint lists this as the sole option without a key.
const POLLINATIONS_MODEL = 'openai-fast';
const TIMEOUT_MS = 40_000;

export async function chat(
  messages: ChatMsg[],
  opts: { maxTokens?: number; temperature?: number; retries?: number } = {},
): Promise<string | null> {
  const groqKey = process.env.GROQ_API_KEY;
  // Groq is rock-solid; 2 retries is plenty. Pollinations needs more.
  if (groqKey) {
    const groqRetries = opts.retries ?? 2;
    for (let i = 0; i <= groqRetries; i++) {
      const out = await callOpenAI(GROQ_URL, GROQ_MODEL, messages, {
        authHeader: `Bearer ${groqKey}`,
        ...opts,
      });
      if (out) return out;
      if (i < groqRetries) await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
  // Pollinations anonymous tier is fragile under shared load. Try with
  // staggered backoff up to 4 times, and on later attempts try the
  // `openai` alias which sometimes routes through a different upstream.
  const FALLBACK_MODELS = [POLLINATIONS_MODEL, 'openai', POLLINATIONS_MODEL, 'openai'];
  for (let i = 0; i < FALLBACK_MODELS.length; i++) {
    const out = await callOpenAI(
      POLLINATIONS_URL,
      FALLBACK_MODELS[i],
      messages,
      opts,
    );
    if (out) return out;
    // 700 → 1400 → 2100 → 2800 ms with ±300ms jitter
    if (i < FALLBACK_MODELS.length - 1) {
      const ms = 700 * (i + 1) + Math.random() * 600 - 300;
      await new Promise((r) => setTimeout(r, ms));
    }
  }
  return null;
}

interface CallOpts {
  authHeader?: string;
  maxTokens?: number;
  temperature?: number;
}

async function callOpenAI(
  url: string,
  model: string,
  messages: ChatMsg[],
  opts: CallOpts,
): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(opts.authHeader ? { authorization: opts.authHeader } : {}),
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: opts.temperature ?? 0.4,
        max_tokens: opts.maxTokens ?? 600,
        stream: false,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ─────────── High-level helpers ─────────── */

export async function translateText(
  text: string,
  targetLang = 'ru',
): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return chat(
    [
      {
        role: 'system',
        content:
          `You are a translator. Translate the user's text into ${targetLang}. ` +
          `Output ONLY the translation — no explanations, no quotes, no language tags. ` +
          `Preserve emojis and proper nouns. If the text is already in ${targetLang}, ` +
          `return it as-is.`,
      },
      { role: 'user', content: trimmed.slice(0, 4000) },
    ],
    { temperature: 0.1, maxTokens: 1200 },
  );
}

export async function summarizeMessages(
  lines: Array<{ author: string; text: string }>,
): Promise<string | null> {
  if (lines.length === 0) return null;
  // Anonymous Pollinations chokes on big payloads — cap inputs aggressively
  // and trim per-line so a wall of long messages doesn't tip it over.
  const block = lines
    .slice(-60)
    .map((l) => `${l.author}: ${l.text.slice(0, 200)}`)
    .join('\n');
  return chat(
    [
      {
        role: 'system',
        content:
          'Ты — помощник который кратко пересказывает чаты по-русски. ' +
          'Дай 3-5 коротких пунктов о том, что обсуждалось. ' +
          'Только пункты — никаких вступлений и комментариев.',
      },
      { role: 'user', content: block.slice(0, 3500) },
    ],
    { temperature: 0.3, maxTokens: 600, retries: 2 },
  );
}

export async function smartReplies(
  lastIncoming: string,
  conversationHint?: string,
): Promise<string[]> {
  const text = lastIncoming.trim();
  if (!text) return [];
  const raw = await chat(
    [
      {
        role: 'system',
        content:
          'Ты предлагаешь короткие варианты ответа на сообщение собеседника. ' +
          'Верни ровно 3 варианта на русском, каждый на новой строке, без нумерации, ' +
          'без кавычек, не длиннее 6 слов. Ответы должны быть естественными и разными ' +
          'по тону (короткое да/нет, нейтральный, развёрнутый).',
      },
      {
        role: 'user',
        content:
          (conversationHint ? `Контекст: ${conversationHint}\n\n` : '') +
          `Сообщение: ${text.slice(0, 600)}`,
      },
    ],
    // GPT-OSS 20B (Pollinations anonymous) is a reasoning model — it
    // burns tokens on hidden chain-of-thought before any visible content,
    // so we need a generous budget or the visible reply is empty.
    { temperature: 0.7, maxTokens: 400 },
  );
  if (!raw) return [];
  return raw
    .split('\n')
    .map((l) =>
      l
        .replace(/^[\d.\-)\s•]+/, '')
        .replace(/^["'«»]+|["'«»]+$/g, '')
        .trim(),
    )
    .filter((l) => l.length > 0 && l.length <= 80)
    .slice(0, 3);
}
