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
  const options = {
    body: payload.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.tag || 'tubikz',
    renotify: true,
    data: { url: payload.url || '/chat' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/chat';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      // Focus an existing window if it's already open.
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
      // Otherwise open a new one.
      return self.clients.openWindow(target);
    }),
  );
});
