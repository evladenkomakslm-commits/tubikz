/**
 * Per-conversation draft storage — pure client. We don't sync drafts to
 * the server because they're inherently local-to-this-device (you don't
 * want your half-typed message to suddenly appear on another logged-in
 * client).
 */
const KEY = (conversationId: string) => `tk:draft:${conversationId}`;

export function loadDraft(conversationId: string): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(KEY(conversationId)) ?? '';
  } catch {
    return '';
  }
}

export function saveDraft(conversationId: string, value: string) {
  if (typeof window === 'undefined') return;
  try {
    if (value.trim()) {
      window.localStorage.setItem(KEY(conversationId), value);
    } else {
      window.localStorage.removeItem(KEY(conversationId));
    }
  } catch {
    // Quota / private mode — silently ignore.
  }
}

export function clearDraft(conversationId: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KEY(conversationId));
  } catch {
    /* ignore */
  }
}

/** Read drafts for a list of conv ids in one pass — used by ChatList preview. */
export function loadAllDrafts(ids: string[]): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const out: Record<string, string> = {};
  for (const id of ids) {
    const v = loadDraft(id);
    if (v) out[id] = v;
  }
  return out;
}
