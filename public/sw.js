/* UnStevened Social — shows notifications (works even when the site is closed). No caching, so it costs nothing. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data.json(); } catch {}
  e.waitUntil(self.registration.showNotification(d.title || 'UnStevened Social', {
    body: d.body || '', icon: '/icons/app-192.png', badge: '/icons/app-192.png', tag: d.tag, renotify: !!d.tag,
    requireInteraction: !!d.call, vibrate: d.call ? [300, 150, 300, 150, 300] : [120], data: { url: d.url || '/' }
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/', self.location.origin).href;
  e.waitUntil((async () => {
    for (const c of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) {
      if (new URL(c.url).origin === self.location.origin) { await c.focus(); c.postMessage({ type: 'uss-open', url }); return; }
    }
    await self.clients.openWindow(url);
  })());
});
