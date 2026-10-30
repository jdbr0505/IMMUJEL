// sw.js – Service Worker de IMMUJEL: sitio disponible sin conexión, lecturas públicas guardadas y envío de solicitudes pendientes.
//
// Qué guarda y cómo (las reglas de decisión viven en js/offline-core.js, probadas en tests/offline-core.test.js):
//  - páginas:               red primero (con tiempo límite) y, si falla, la última copia; sin copia, /offline
//  - archivos propios:      con ?v= → caché primero; sin ?v= → se sirve lo guardado y se actualiza en segundo plano
//  - bibliotecas externas:  Tailwind, Font Awesome, Google Fonts, supabase-js, DOMPurify → igual que los archivos propios
//  - /api/config:           red primero; la copia permite iniciar Supabase (y enviar solicitudes) sin conexión
//  - lecturas públicas de Supabase (publicaciones, configuración visual): red primero, con copia por cuenta
//  - imágenes de publicaciones: caché primero, con tope
//  - nunca se guarda nada privado (solicitudes, perfiles, notas…): lo decide OfflineCore.clasificar
// La lista de lo que se precarga la genera scripts/generar-precache.js (sw-precache.js) y cambia sola cuando cambia un archivo.
importScripts('/sw-precache.js', '/js/offline-core.js', '/js/offline-db.js');

const VERSION = self.PRECACHE.version;
const CACHE = 'immujel-' + VERSION;            // páginas, archivos propios y bibliotecas: se reemplaza con cada versión
const CACHE_DATOS = 'immujel-datos-v1';        // lecturas públicas de Supabase
const CACHE_IMAGENES = 'immujel-imagenes-v1';  // imágenes de publicaciones
const MAX_DATOS = 120;
const MAX_IMAGENES = 80;
const ESPERA_PAGINA_MS = 4000;                 // con red lenta se muestra la última copia en vez de esperar
const ESPERA_DATOS_MS = 6000;

const Core = self.OfflineCore;
const DB = self.OfflineDB;

// ---------- utilidades ----------
function conTiempo(promesa, ms) {
  return new Promise((resolver, rechazar) => {
    const reloj = setTimeout(() => rechazar(new Error('tiempo agotado')), ms);
    promesa.then((v) => { clearTimeout(reloj); resolver(v); }, (e) => { clearTimeout(reloj); rechazar(e); });
  });
}

// Una respuesta que viene de una redirección no se puede entregar a una navegación: se vuelve a armar sin ese marcador.
async function sinRedireccion(res) {
  if (!res.redirected) return res;
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
}

// Guardar una copia nunca debe romper la respuesta que ya llegó bien (cuota llena, respuesta 206, Vary: *):
// si no se puede guardar, se sigue sin copia.
async function guardar(cache, clave, res) {
  try { await cache.put(clave, res); return true; } catch (error) { return false; }
}

// Cache.put rechaza las respuestas 206 y las listas paginadas de PostgREST (range) responden así: se guarda una copia 200
// con las mismas cabeceras (Content-Range incluido), que es lo que lee supabase-js para el total.
async function comoCompleta(res) {
  return new Response(await res.blob(), { status: 200, statusText: 'OK', headers: res.headers });
}

// Solo se guarda una configuración que el envío en segundo plano podría usar; una vacía no reemplaza a la buena.
async function esConfigValida(res) {
  try { return Core.configValida(await res.clone().json()); } catch (error) { return false; }
}

async function recortar(nombre, maximo) {
  const c = await caches.open(nombre);
  const claves = await c.keys();
  for (let i = 0; i < claves.length - maximo; i++) await c.delete(claves[i]);
}

function sinConexion() {
  return new Response('Sin conexión', { status: 503, statusText: 'Sin conexión', headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

// ---------- instalación: precarga ----------
async function precargar() {
  const cache = await caches.open(CACHE);
  const origen = self.location.origin;
  const { paginas, archivos, externos } = self.PRECACHE;
  const dinamicos = self.PRECACHE.dinamicos || [];
  const tareas = [];

  dinamicos.forEach((url) => tareas.push((async () => {
    const res = await fetch(origen + url, { cache: 'no-store' });
    if (res.ok && await esConfigValida(res)) await cache.put(new Request(origen + url), res);
  })()));

  paginas.forEach((ruta) => tareas.push((async () => {
    const res = await fetch(origen + ruta, { cache: 'no-cache' });
    if (res.ok) await cache.put(new Request(origen + ruta), await sinRedireccion(res));
  })()));

  archivos.forEach((url) => tareas.push((async () => {
    const res = await fetch(origen + url, { cache: 'no-cache' });
    if (res.ok) await cache.put(new Request(origen + url), res);
  })()));

  externos.forEach((url) => tareas.push((async () => {
    let res;
    try { res = await fetch(url, { mode: 'cors', credentials: 'omit' }); } catch (e) { res = await fetch(url, { mode: 'no-cors' }); }
    if (res.ok || res.type === 'opaque') await cache.put(url, res);
  })()));

  // Si algo no se pudo bajar (sin red, un CDN caído) no se cancela la instalación: se completa al visitar cada página.
  const resultados = await Promise.allSettled(tareas);
  const fallos = resultados.filter((r) => r.status === 'rejected').length;
  if (fallos) console.warn('Precarga incompleta: ' + fallos + ' de ' + tareas.length + ' recursos no se pudieron guardar.');
}

self.addEventListener('install', (e) => {
  // Sin skipWaiting() propio: sw-register.js lo pide por mensaje cuando la página ya tenía un Service Worker anterior.
  e.waitUntil(precargar());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const vigentes = [CACHE, CACHE_DATOS, CACHE_IMAGENES];
    const nombres = await caches.keys();
    await Promise.all(nombres.filter((n) => vigentes.indexOf(n) < 0).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  const accion = e.data && e.data.action;
  if (accion === 'skipWaiting') self.skipWaiting();
  if (accion === 'enviar-pendientes') e.waitUntil(DB.enviarPendientes().catch(() => {}));
});

// ---------- estrategias ----------
async function paginas(e) {
  const req = e.request;
  const ruta = Core.rutaDePagina(req.url);
  const clave = new Request(self.location.origin + ruta);
  const cache = await caches.open(CACHE);

  const red = fetch(req).then(async (res) => {
    // Las direcciones con .html las redirige Vercel a la limpia: esa respuesta se deja pasar y la limpia se guarda al pedirse.
    if (res.ok && res.type === 'basic') await guardar(cache, clave, await sinRedireccion(res.clone()));
    return res;
  });
  red.catch(() => {}); // si se agota el tiempo y la red falla después, no queda un error sin atender

  try {
    return await conTiempo(red, ESPERA_PAGINA_MS);
  } catch (error) {
    const guardada = await cache.match(clave);
    if (guardada) {
      e.waitUntil(red.catch(() => {})); // si la red responde después, la copia se renueva
      return guardada;
    }
    // Sin copia: si fue solo lentitud se espera la red; la página /offline es solo para cuando de verdad no hay conexión
    return red.catch(async () => (await cache.match(new Request(self.location.origin + '/offline'))) || sinConexion());
  }
}

async function primeroCache(req, nombre) {
  const cache = await caches.open(nombre);
  const guardada = await cache.match(req);
  if (guardada) return guardada;
  try {
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') await guardar(cache, req, res.clone());
    return res;
  } catch (error) {
    return Response.error();
  }
}

async function revalidar(e, nombre) {
  const req = e.request;
  const cache = await caches.open(nombre);
  const guardada = await cache.match(req);
  const actualizar = fetch(req).then(async (res) => {
    if (res.ok && res.type === 'basic') await guardar(cache, req, res.clone());
    return res;
  });
  if (guardada) {
    e.waitUntil(actualizar.catch(() => {}));
    return guardada;
  }
  try { return await actualizar; } catch (error) { return Response.error(); }
}

async function configuracion(e) {
  const req = e.request;
  const cache = await caches.open(CACHE);
  try {
    const res = await conTiempo(fetch(req), 3000);
    if (res.ok && res.type === 'basic') {
      if (await esConfigValida(res)) await guardar(cache, req, res.clone());
      return res;
    }
    // Un error del servidor no deja a Supabase sin configuración si ya había una copia buena
    return (await cache.match(req)) || res;
  } catch (error) {
    return (await cache.match(req)) || sinConexion();
  }
}

// Bibliotecas externas. Las que permiten CORS se guardan legibles y se renuevan en segundo plano; Tailwind no lo permite
// (respuesta opaca): se guarda la primera copia buena y se queda hasta la próxima versión del Service Worker.
async function biblioteca(e) {
  const url = e.request.url;
  const cache = await caches.open(CACHE);
  const guardada = await cache.match(url, { ignoreVary: true });
  if (guardada) {
    if (guardada.type !== 'opaque') {
      e.waitUntil(fetch(url, { mode: 'cors', credentials: 'omit' }).then((res) => { if (res.ok) return guardar(cache, url, res); }).catch(() => {}));
    }
    return guardada;
  }
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (res.ok) await guardar(cache, url, res.clone());
    return res;
  } catch (errorCors) {
    try {
      const res = await fetch(e.request);
      if (res.type === 'opaque' || res.ok) await guardar(cache, url, res.clone());
      return res;
    } catch (errorRed) {
      return Response.error();
    }
  }
}

async function imagenExterna(e) {
  const url = e.request.url;
  const cache = await caches.open(CACHE_IMAGENES);
  const guardada = await cache.match(url, { ignoreVary: true });
  if (guardada) return guardada;
  try {
    let res;
    try { res = await fetch(url, { mode: 'cors', credentials: 'omit' }); } catch (errorCors) { return await fetch(e.request); }
    if (res.ok && await guardar(cache, url, res.clone())) e.waitUntil(recortar(CACHE_IMAGENES, MAX_IMAGENES));
    return res;
  } catch (error) {
    return Response.error();
  }
}

async function datosPublicos(e) {
  const req = e.request;
  const cache = await caches.open(CACHE_DATOS);
  const clave = Core.claveDeDatos(req.url, req.headers);

  const red = fetch(req).then(async (res) => {
    if (clave && (res.status === 200 || res.status === 206)) {
      const copia = res.status === 206 ? await comoCompleta(res.clone()) : res.clone();
      if (await guardar(cache, new Request(clave), copia)) e.waitUntil(recortar(CACHE_DATOS, MAX_DATOS));
    }
    return res;
  });

  async function guardada() {
    for (const k of Core.clavesDeLectura(req.url, req.headers)) {
      const hit = await cache.match(new Request(k));
      if (hit) {
        const cabeceras = new Headers(hit.headers);
        cabeceras.set('X-Immujel-Cache', 'guardado');
        return new Response(await hit.blob(), { status: hit.status, statusText: hit.statusText, headers: cabeceras });
      }
    }
    return null;
  }

  try {
    return await conTiempo(red, ESPERA_DATOS_MS);
  } catch (error) {
    const copia = await guardada();
    if (copia) { e.waitUntil(red.catch(() => {})); return copia; }
    // Sin copia: si fue solo lentitud, se espera la red; si no hay red, el error llega a la página como siempre
    return red.catch(() => Response.error());
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const tipo = Core.clasificar(req.url, req.method, req.mode, self.location.origin);
  let respuesta = null;
  switch (tipo) {
    case 'navegacion': respuesta = paginas(e); break;
    case 'estatico-versionado': respuesta = primeroCache(req, CACHE); break;
    case 'estatico': respuesta = revalidar(e, CACHE); break;
    case 'config': respuesta = configuracion(e); break;
    case 'cdn': respuesta = biblioteca(e); break;
    case 'imagen-externa': respuesta = imagenExterna(e); break;
    case 'datos-publicos': respuesta = datosPublicos(e); break;
    default: return; // lo demás lo decide la red (escrituras a Supabase, autenticación, solicitudes, perfiles…)
  }
  // Si una estrategia falla por un error nuestro, la página sigue funcionando con la red de siempre
  e.respondWith(respuesta.catch(() => fetch(req)));
});

// ---------- sincronización en segundo plano ----------
// Las páginas registran 'enviar-solicitudes' al guardar una solicitud sin conexión; el navegador despierta este
// Service Worker cuando vuelve la red, aunque la pestaña esté cerrada. Si algo queda pendiente se lanza un error
// para que el navegador lo reintente. No se muestra ninguna notificación: el aviso de una solicitud de ayuda no debe
// aparecer en la pantalla de bloqueo.
self.addEventListener('sync', (e) => {
  if (e.tag !== 'enviar-solicitudes') return;
  e.waitUntil((async () => {
    const r = await DB.enviarPendientes();
    if (r.pendientes > 0) throw new Error('Quedan solicitudes por enviar');
  })());
});

// ---------- notificaciones push ----------
self.addEventListener('push', (e) => {
  let data = { titulo: 'Nueva publicación', cuerpo: 'IMMUJEL tiene contenido nuevo para ti.', url: '/' };
  try {
    if (e.data) data = e.data.json();
  } catch (error) { /* se usa el texto por defecto */ }

  const origin = self.location.origin;
  const icon = `${origin}/Images/LOGO%20IMMUJEL.png`;
  const badge = `${origin}/Images/HEAD.svg`;
  const title = data.titulo ? `IMMUJEL · ${data.titulo}` : 'IMMUJEL';

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
        { action: 'open', title: '📖 Ver publicación' },
        { action: 'close', title: 'Cerrar' }
      ]
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  if (e.action === 'close') return;
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then((abiertas) => {
      const ventana = abiertas.find((c) => c.url.includes(url));
      if (ventana) return ventana.focus();
      return clients.openWindow(url);
    })
  );
});
