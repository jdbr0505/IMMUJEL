const CACHE = 'immujel-v1';
const PRECACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/manifest.json',
  '/Images/LOGO IMMUJEL.png',
  '/Images/HEAD.svg',
  '/auth.js',
  '/animations.js',
  '/js/ui.js',
  '/Login/Login_supabase.js',
  '/NavBar/semanario.html',
  '/NavBar/noticiero.html',
  '/NavBar/publicacion.html',
  '/NavBar/Programas.html',
  '/NavBar/Sobre%20Nosotras.html',
  '/NavBar/FL.html',
  '/Forms/form.html',
  '/Login/login.html',
  '/Login/signup.html'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/rest/') || url.pathname.startsWith('/functions/')) {
    e.respondWith(networkFirst(e.request));
    return;
  }
  if (url.origin === location.origin) {
    e.respondWith(cacheFirst(e.request));
  }
});

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) { const cache = await caches.open(CACHE); cache.put(req, res.clone()); }
    return res;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res.ok) { const cache = await caches.open(CACHE); cache.put(req, res.clone()); }
    return res;
  } catch {
    const cached = await caches.match(req);
    return cached || new Response(JSON.stringify({ error: 'Offline' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
}

// ===== WEB PUSH =====
self.addEventListener('push', e => {
  let data = { titulo: 'IMMUJEL', cuerpo: 'Nueva publicación disponible', url: '/' };
  try {
    if (e.data) data = JSON.parse(e.data.text());
  } catch {}
  e.waitUntil(
    self.registration.showNotification(data.titulo, {
      body: data.cuerpo,
      icon: '/Images/LOGO IMMUJEL.png',
      badge: '/Images/HEAD.svg',
      data: { url: data.url },
      vibrate: [200, 100, 200],
      actions: [
        { action: 'open', title: 'Abrir' },
        { action: 'close', title: 'Cerrar' }
      ]
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'close') return;
  const url = e.notification.data?.url || '/';
  e.waitUntil(clients.openWindow(url));
});