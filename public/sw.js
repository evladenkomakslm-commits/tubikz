/* ₮ubikz service worker — handles Web Push only. */
/* eslint-disable */

self.addEventListener('install', (event) => {
  // Take over immediately so push works on first subscription.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: '₮ubikz', body: event.data.text?.() ?? '' };
  }
  const title = payload.title || '₮ubikz';
  const isCall = payload?.data?.kind === 'call';
  const options = {
    body: payload.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.tag || 'tubikz',
    renotify: true,
    requireInteraction: !!payload.requireInteraction,
    actions: payload.actions || [],
    // Calls vibrate in a "ring-ring" pattern — distinct from chat pings.
    vibrate: isCall ? [400, 200, 400, 200, 400, 200, 400] : undefined,
    data: {
      url: payload.url || '/chat',
      ...(payload.data || {}),
    },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data || {};
  const action = event.action || '';
  const isCall = data.kind === 'call';

  event.notification.close();

  // For call decline action — fire-and-forget DELETE; no need to open the app.
  if (isCall && action === 'decline') {
    event.waitUntil(
      fetch('/api/calls/decline-from-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callId: data.callId,
          callerId: data.callerId,
          conversationId: data.conversationId,
        }),
        credentials: 'include',
      }).catch(() => {}),
    );
    return;
  }

  // Decide where to navigate:
  //   - call answer → conversation page with ?call=<id>&action=answer so
  //     CallProvider auto-accepts on mount.
  //   - everything else → notification's stored url.
  let target = data.url || '/chat';
  if (isCall && action === 'answer' && data.conversationId) {
    target = `/chat/${data.conversationId}?call=${data.callId || ''}&action=answer`;
  } else if (isCall && data.conversationId) {
    target = `/chat/${data.conversationId}?call=${data.callId || ''}`;
  }

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((wins) => {
        for (const w of wins) {
          try {
            const u = new URL(w.url);
            if (u.origin === self.location.origin) {
              w.focus();
              if ('navigate' in w) w.navigate(target);
              return;
            }
          } catch {}
        }
        return self.clients.openWindow(target);
      }),
  );
});
