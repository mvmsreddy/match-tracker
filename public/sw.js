// Minimal Web Push service worker (Phase 3, item 7). Only handles the two
// events push notifications need — no offline caching/asset strategy here,
// this app doesn't have a PWA manifest or install flow to go with one.

self.addEventListener('push', (event) => {
  let data = { title: 'Tennis Tracker', body: '', link: '/' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // Non-JSON payload — fall back to the defaults above.
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/favicon.ico',
      data: { link: data.link },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.link || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(link) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(link);
    }),
  );
});
