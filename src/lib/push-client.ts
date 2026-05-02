/**
 * Browser-side helpers for registering the service worker and subscribing
 * to Web Push. Returns true on a successful subscription, false when the
 * environment is unsupported / permission denied / VAPID key missing.
 */

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    return reg;
  } catch {
    return null;
  }
}

/**
 * Wait for an active service worker, registering /sw.js first if no
 * registration exists yet. Without this, calling
 * `navigator.serviceWorker.ready` on a fresh load hangs indefinitely
 * because there's nothing to become "ready". Bounded with a 10s timeout
 * so the UI never sits on a forever-spinner.
 */
async function ensureActiveRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  let reg = await navigator.serviceWorker.getRegistration();
  if (!reg) {
    reg = await navigator.serviceWorker.register('/sw.js').catch(() => null as never);
    if (!reg) return null;
  }
  // If already active, return immediately.
  if (reg.active) return reg;
  // Otherwise wait for activation, up to 10s.
  return await Promise.race<ServiceWorkerRegistration | null>([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000)),
  ]);
}

export async function subscribeToPush(): Promise<boolean> {
  if (!pushSupported()) return false;
  if (Notification.permission === 'denied') return false;
  // Ask permission if needed. We do this only after the user has performed
  // a gesture (e.g. clicking "включить уведомления").
  if (Notification.permission === 'default') {
    const res = await Notification.requestPermission();
    if (res !== 'granted') return false;
  }
  const reg = await ensureActiveRegistration();
  if (!reg) return false;

  const keyRes = await fetch('/api/push/vapid-public-key');
  const { key } = await keyRes.json();
  if (!key) return false;

  // Reuse an existing subscription if it points to the same key, otherwise
  // unsubscribe and re-subscribe so the server has the latest p256dh / auth.
  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    const opt = sub.options as PushSubscriptionOptions & {
      applicationServerKey?: ArrayBuffer | null;
    };
    const same =
      opt.applicationServerKey &&
      bufferToBase64(opt.applicationServerKey) === key;
    if (!same) {
      await sub.unsubscribe().catch(() => {});
      sub = null;
    }
  }
  if (!sub) {
    // Cast to BufferSource — TS strictness around SharedArrayBuffer makes
    // the raw Uint8Array unhappy with PushSubscriptionOptionsInit's union.
    const appKey = urlBase64ToUint8Array(key) as unknown as BufferSource;
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: appKey,
    });
  }

  const json = sub.toJSON() as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
  const ok = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...json, userAgent: navigator.userAgent }),
  })
    .then((r) => r.ok)
    .catch(() => false);
  return ok;
}

export async function unsubscribeFromPush(): Promise<boolean> {
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return true;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return true;
  await fetch('/api/push/subscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
  return true;
}

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
