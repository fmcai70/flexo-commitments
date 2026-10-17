// ActionRegister service worker. It exists so phones offer "Install app"; it caches nothing,
// so people always get the latest version. Pages always come from the network; when there is
// no connection it shows a short "you're offline" page instead of the browser's error.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return; // everything else goes straight to the network
  e.respondWith(fetch(e.request).catch(() => new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>ActionRegister</title><body style="font-family:system-ui,sans-serif;background:#EDF0F4;color:#15223B;' +
    'display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;text-align:center;padding:24px">' +
    '<div><h1 style="font-size:22px">You\'re offline</h1><p>ActionRegister needs an internet connection.</p>' +
    '<p><button onclick="location.reload()" style="font:inherit;padding:10px 18px;border:0;border-radius:8px;' +
    'background:#1C3F73;color:#fff">Try again</button></p></div>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});
