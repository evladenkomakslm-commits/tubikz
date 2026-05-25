/**
 * Tiny in-memory sliding-window rate limiter for AI endpoints. Keeps
 * one Groq runaway-loop from burning the entire daily quota.
 *
 * Per-user cap: 30 requests / 60s. Process-local — survives a single
 * Render instance's lifetime, resets on restart, which is fine for an
 * abuse-mitigation knob.
 */

const WINDOW_MS = 60_000;
const LIMIT = 30;

const buckets = new Map<string, number[]>();

export function aiRateLimit(userId: string): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  const arr = buckets.get(userId) ?? [];
  const fresh = arr.filter((t) => now - t < WINDOW_MS);
  if (fresh.length >= LIMIT) {
    const retryAfter = Math.max(1, Math.ceil((WINDOW_MS - (now - fresh[0])) / 1000));
    buckets.set(userId, fresh);
    return { ok: false, retryAfter };
  }
  fresh.push(now);
  buckets.set(userId, fresh);
  return { ok: true };
}
