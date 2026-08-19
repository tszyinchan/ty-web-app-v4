/* Jaxfr push service worker. Network-only; no offline cache. */
const ICON = '/favicon.svg';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  event.waitUntil(handlePush(event));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data;
  const url =
    data && typeof data.url === 'string' && data.url.length > 0
      ? data.url
      : '/chat';
  event.waitUntil(openUrl(url));
});

async function handlePush(event) {
  let title = 'Jaxfr';
  let body = 'New message';
  let url = '/chat';

  try {
    if (event.data) {
      const payload = event.data.json();
      if (payload && typeof payload === 'object') {
        if (typeof payload.title === 'string' && payload.title) {
          title = payload.title;
        }
        if (typeof payload.body === 'string' && payload.body) {
          body = payload.body;
        }
        if (typeof payload.url === 'string' && payload.url) {
          url = payload.url;
        }
      }
    }
  } catch {
    // Non-JSON payloads still show a generic notification.
  }

  // iOS/iPadOS requires every push event to call showNotification().
  // Skipping it (even when the app is focused) is treated as a silent push
  // and Apple will stop delivering to this subscription.
  await self.registration.showNotification(title, {
    body,
    icon: ICON,
    data: { url },
    tag: url,
    renotify: true,
  });

  const ua = self.navigator.userAgent || '';
  const isIos =
    /iphone|ipad|ipod/i.test(ua) ||
    (self.navigator.platform === 'MacIntel' && self.navigator.maxTouchPoints > 1);
  if (isIos) return;

  const windows = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  });
  if (!windows.some((client) => client.focused)) return;

  const notes = await self.registration.getNotifications({ tag: url });
  for (const note of notes) {
    note.close();
  }
}

async function openUrl(url) {
  const windows = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  });
  for (const client of windows) {
    if ('focus' in client) {
      await client.focus();
      client.postMessage({ type: 'PUSH_NAVIGATE', url });
      return;
    }
  }
  await self.clients.openWindow(url);
}
