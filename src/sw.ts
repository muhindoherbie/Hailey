/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: any };

// App shell: precached so Hailey opens offline. API data is cached by the app in IndexedDB.
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//, /^\/ics\//] }));

// Items shared from other apps' Share menu. They are kept in a cache on this device only until
// the user picks what to do with them on /share; nothing is sent to the server before that.
const SHARE_CACHE = 'hailey-share';
registerRoute(
  ({ url, request }) => url.pathname === '/share-target' && request.method === 'POST',
  async ({ request }) => {
    try {
      const form = await request.formData();
      const id = crypto.randomUUID();
      const cache = await caches.open(SHARE_CACHE);
      const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0).slice(0, 5);
      const meta = {
        title: String(form.get('title') ?? ''), text: String(form.get('text') ?? ''), url: String(form.get('url') ?? ''),
        files: files.map((f, i) => ({ index: i, name: f.name || `shared-${i + 1}`, type: f.type, size: f.size })),
        at: Date.now(),
      };
      await cache.put(`/share-data/${id}/meta`, new Response(JSON.stringify(meta), { headers: { 'content-type': 'application/json' } }));
      await Promise.all(files.map((f, i) => cache.put(`/share-data/${id}/file/${i}`, new Response(f, { headers: { 'content-type': f.type || 'application/octet-stream' } }))));
      return Response.redirect(`/share?id=${id}`, 303);
    } catch {
      return Response.redirect('/share?error=read', 303);
    }
  },
  'POST',
);

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// Reminders and briefings sent by the Hailey server.
self.addEventListener('push', (event) => {
  let data: { title?: string; body?: string; url?: string; tag?: string } = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Hailey', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: data.tag,
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of clients) {
        if (new URL(c.url).origin === self.location.origin) {
          await (c as WindowClient).focus();
          (c as WindowClient).postMessage({ type: 'NAVIGATE', url });
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
