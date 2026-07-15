const CACHE = 'immujel-v3';
const STATIC_CACHE = 'immujel-static-v3';

const PRECACHE = [
  '/',
  '/index.html',
  '/404.html',
  '/offline.html',
  '/styles.css',
  '/manifest.json',
  '/Images/LOGO IMMUJEL.png',
  '/Images/HEAD.svg',
  '/auth.js',
  '/animations.js',
  '/js/ui.js',
  '/Login/Login_supabase.js',
  "NavBar's/semanario.html",
  "NavBar's/noticiero.html",
  "NavBar's/publicacion.html",
  "NavBar's/Programas.html",
  "NavBar's/Sobre Nosotras.html",
  "NavBar's/FL.html",
  '/Forms/form.html',
  '/Login/login.html',
  '/Login/signup.html',
  '/Login/update-password.html'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => {
      return c.addAll(PRECACHE.map(url => {
        return new Request(url, { cache: 'no-cache' });
      })).catch(err => {
        console.warn('Precache falló para algunos recursos:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE && k !== STATIC_CACHE).map(k => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data?.action === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  if (url.origin !== location.origin) return;

  const path = url.pathname;

  // Funciones serverless → nunca cachear
  if (path.startsWith('/api/')) return;

  // API Supabase → Network First
  if (path.startsWith('/rest/') || path.startsWith('/functions/')) {
    return e.respondWith(networkFirst(e.request));
  }

  // Navegación (páginas HTML) → Network First con fallback a cache
  if (e.request.mode === 'navigate') {
    return e.respondWith(networkFirst(e.request, '/404.html'));
  }

  // Estáticos (CSS, JS, imágenes, fuentes) → Cache First
  if (/\.(css|js|json|png|webp|jpg|svg|ico|woff2?|ttf|eot)$/i.test(path)) {
    return e.respondWith(cacheFirst(e.request));
  }

  // Otros → Network First
  e.respondWith(networkFirst(e.request));
});

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(req, fallbackUrl) {
  try {
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') {
      const cache = await caches.open(CACHE);
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    const cached = await caches.match(req);
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl);
      if (fallback) return fallback;
    }
    if (req.headers.get('accept')?.includes('application/json')) {
      return new Response(JSON.stringify({ error: 'Offline' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('Offline', { status: 503 });
  }
}

self.addEventListener('push', e => {
  let data = { titulo: 'Nueva publicación', cuerpo: 'IMMUJEL tiene contenido nuevo para ti.', url: '/' };
  try {
    if (e.data) data = e.data.json();
  } catch {}

  const origin = self.location.origin;
  const icon   = `${origin}/Images/LOGO%20IMMUJEL.png`;
  const badge  = `${origin}/Images/HEAD.svg`;
  const title  = data.titulo ? `IMMUJEL · ${data.titulo}` : 'IMMUJEL';

  e.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || data.cuerpo,
      icon,
      badge,
      image: icon,
      data: { url: data.url || '/' },
      vibrate: [200, 100, 200],
      requireInteraction: false,
      tag: 'immujel-publicacion',
      actions: [
        { action: 'open',  title: '📖 Ver publicación' },
        { action: 'close', title: 'Cerrar' }
      ]
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'close') return;
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(clients => {
      const client = clients.find(c => c.url.includes(url));
      if (client) return client.focus();
      return clients.openWindow(url);
    })
  );
});
