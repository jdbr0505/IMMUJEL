// Prueba sw.js completo con un entorno simulado: Cache API en memoria, fetch controlable y eventos del Service Worker.
// Los temporizadores de espera (4 s, 6 s) se acortan para no hacer lenta la prueba.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.resolve(__dirname, '..');
const ORIGEN = 'https://immujel.vercel.app';
const SUPA = 'https://vhgfyqodiieblhfwbama.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.firma';

function jwt(payload) { return 'x.' + Buffer.from(JSON.stringify(payload)).toString('base64url') + '.y'; }

class Resp {
  constructor(o = {}) {
    this.status = o.status === undefined ? 200 : o.status;
    this.type = o.type || 'basic';
    this.redirected = !!o.redirected;
    this.statusText = o.statusText || '';
    this._body = o.body === undefined ? 'ok' : o.body;
    this.headers = new Headers(o.headers || {});
  }
  get ok() { return this.status >= 200 && this.status < 300; }
  clone() { return new Resp({ status: this.status, type: this.type, redirected: this.redirected, statusText: this.statusText, body: this._body, headers: Object.fromEntries(this.headers) }); }
  async blob() { return new Blob([this._body]); }
  async text() { return String(this._body); }
}

function crearCaches() {
  const almacenes = new Map();
  const clave = (r) => (typeof r === 'string' ? r : r.url).split('#')[0];
  const abrir = (n) => {
    if (!almacenes.has(n)) almacenes.set(n, new Map());
    const m = almacenes.get(n);
    return {
      async match(r) { const v = m.get(clave(r)); return v ? v.clone() : undefined; },
      async put(r, res) { m.set(clave(r), res); },
      async keys() { return [...m.keys()].map((u) => ({ url: u })); },
      async delete(r) { return m.delete(clave(r)); }
    };
  };
  return {
    almacenes,
    open: async (n) => abrir(n),
    keys: async () => [...almacenes.keys()],
    delete: async (n) => almacenes.delete(n),
    match: async (r) => { for (const m of almacenes.values()) { const v = m.get(clave(r)); if (v) return v.clone(); } return undefined; }
  };
}

// Devuelve { sw, caches, llamadas, ctx } con sw.js cargado en un contexto aislado.
function cargarSW() {
  const manejadores = {};
  const caches = crearCaches();
  const llamadas = [];
  const ctx = vm.createContext({});
  ctx.self = ctx;
  ctx.location = { origin: ORIGEN };
  ctx.addEventListener = (tipo, fn) => { (manejadores[tipo] = manejadores[tipo] || []).push(fn); };
  ctx.caches = caches;
  ctx.clients = { claim: async () => {}, matchAll: async () => [], openWindow: async () => {} };
  ctx.registration = { showNotification: async () => {} };
  ctx.skipWaiting = () => { ctx.__salto = true; };
  Object.assign(ctx, { Request, Response, Headers, URL, URLSearchParams, Blob, TextDecoder, atob, console, Promise, Date, Uint8Array, JSON, Error, TypeError, Math, Set, Map, Array, Object, String, Number, RegExp, clearTimeout });
  // setTimeout: las esperas largas del Service Worker vencen de inmediato; las cortas son reales
  ctx.setTimeout = (fn, ms) => (ms >= 3000 ? setImmediate(fn) : setTimeout(fn, ms));
  ctx.fetch = async (r, init) => { llamadas.push({ url: typeof r === 'string' ? r : r.url, init: init || {} }); return ctx.__fetch(r, init); };
  ctx.__fetch = async () => new Resp();
  ctx.importScripts = (...archivos) => archivos.forEach((a) => vm.runInContext(fs.readFileSync(path.join(RAIZ, a), 'utf8'), ctx, { filename: a }));
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8'), ctx, { filename: 'sw.js' });
  return { manejadores, caches, llamadas, ctx, version: ctx.PRECACHE.version, nombreCache: 'immujel-' + ctx.PRECACHE.version };
}

function peticion(url, extra = {}) {
  return { url, method: 'GET', mode: 'no-cors', headers: new Headers(extra.headers || {}), ...extra, headers: new Headers(extra.headers || {}) };
}

// Dispara un 'fetch' y devuelve { atendido, respuesta, esperas }
async function pedir(sw, req) {
  let promesa; const esperas = [];
  const ev = { request: req, respondWith: (p) => { promesa = p; }, waitUntil: (p) => esperas.push(p) };
  sw.manejadores.fetch.forEach((h) => h(ev));
  if (!promesa) return { atendido: false, esperas };
  let respuesta, error;
  try { respuesta = await promesa; } catch (e) { error = e; }
  // Las tareas en segundo plano terminan solas; una red que nunca responde no debe colgar la prueba
  await Promise.race([Promise.allSettled(esperas), new Promise((r) => setTimeout(r, 100))]);
  return { atendido: true, respuesta, error, esperas };
}

async function disparar(sw, tipo, ev) {
  const esperas = [];
  const evento = Object.assign({ waitUntil: (p) => esperas.push(p) }, ev);
  (sw.manejadores[tipo] || []).forEach((h) => h(evento));
  const r = await Promise.allSettled(esperas);
  return r;
}

const sinRed = async () => { throw new TypeError('Failed to fetch'); };

// ---------- instalación y activación ----------
test('instalar: guarda páginas, archivos propios y bibliotecas externas', async () => {
  const sw = cargarSW();
  sw.ctx.__fetch = async (r, init) => {
    const url = typeof r === 'string' ? r : r.url;
    if (url.includes('cdn.tailwindcss.com') && init && init.mode === 'cors') throw new TypeError('Failed to fetch'); // sin CORS
    if (url.includes('cdn.tailwindcss.com')) return new Resp({ status: 0, type: 'opaque' });
    return new Resp({ body: 'contenido de ' + url });
  };
  const r = await disparar(sw, 'install', {});
  assert.equal(r[0].status, 'fulfilled');
  const c = sw.caches.almacenes.get(sw.nombreCache);
  const P = sw.ctx.PRECACHE;
  P.paginas.forEach((ruta) => assert.ok(c.has(ORIGEN + ruta), 'página ' + ruta));
  P.archivos.forEach((u) => assert.ok(c.has(ORIGEN + u), 'archivo ' + u));
  P.externos.forEach((u) => assert.ok(c.has(u), 'externo ' + u));
  assert.ok(c.has(ORIGEN + '/api/config'), 'la configuración de Supabase');
  assert.equal(c.get('https://cdn.tailwindcss.com').type, 'opaque', 'Tailwind se guarda aunque no permita CORS');
});

test('instalar: una página que llega por redirección se guarda sin la marca de redirección', async () => {
  const sw = cargarSW();
  sw.ctx.__fetch = async (r) => new Resp({ redirected: true, body: 'página' });
  await disparar(sw, 'install', {});
  const guardada = sw.caches.almacenes.get(sw.nombreCache).get(ORIGEN + '/navegacion/semanario');
  assert.ok(guardada);
  assert.equal(guardada.redirected, false);
  assert.equal(await guardada.text(), 'página');
});

test('instalar: si algo no se puede bajar, la instalación no se cancela', async () => {
  const sw = cargarSW();
  sw.ctx.__fetch = async (r) => { const u = typeof r === 'string' ? r : r.url; if (u.includes('/Forms/form')) throw new TypeError('Failed to fetch'); return new Resp(); };
  const r = await disparar(sw, 'install', {});
  assert.equal(r[0].status, 'fulfilled');
  const c = sw.caches.almacenes.get(sw.nombreCache);
  assert.ok(c.has(ORIGEN + '/navegacion/semanario'));
  assert.ok(!c.has(ORIGEN + '/Forms/form'));
});

test('activar: borra las cachés viejas y conserva las vigentes, las de datos y las de imágenes', async () => {
  const sw = cargarSW();
  for (const n of ['immujel-v5', 'immujel-static-v5', 'immujel-otraversion', sw.nombreCache, 'immujel-datos-v1', 'immujel-imagenes-v1']) await sw.caches.open(n);
  await disparar(sw, 'activate', {});
  assert.deepEqual([...sw.caches.almacenes.keys()].sort(), [sw.nombreCache, 'immujel-datos-v1', 'immujel-imagenes-v1'].sort());
});

test('mensaje skipWaiting activa la versión nueva', async () => {
  const sw = cargarSW();
  await disparar(sw, 'message', { data: { action: 'skipWaiting' } });
  assert.equal(sw.ctx.__salto, true);
});

// ---------- páginas ----------
test('página con conexión: se entrega y se guarda con la dirección limpia', async () => {
  const sw = cargarSW();
  sw.ctx.__fetch = async () => new Resp({ body: 'semanario' });
  const r = await pedir(sw, peticion(ORIGEN + '/navegacion/semanario', { mode: 'navigate' }));
  assert.equal(await r.respuesta.text(), 'semanario');
  assert.ok(sw.caches.almacenes.get(sw.nombreCache).has(ORIGEN + '/navegacion/semanario'));
});

test('página pedida con .html: la redirección se deja pasar y no se guarda', async () => {
  const sw = cargarSW();
  sw.ctx.__fetch = async () => new Resp({ status: 0, type: 'opaqueredirect' });
  const r = await pedir(sw, peticion(ORIGEN + '/navegacion/Programas.html', { mode: 'navigate' }));
  assert.equal(r.respuesta.type, 'opaqueredirect');
  assert.equal(sw.caches.almacenes.size === 0 || !sw.caches.almacenes.get(sw.nombreCache).has(ORIGEN + '/navegacion/Programas'), true);
});

test('sin conexión: la página guardada abre con .html, sin él y con búsqueda', async () => {
  const sw = cargarSW();
  const c = await sw.caches.open(sw.nombreCache);
  await c.put(ORIGEN + '/navegacion/publicacion', new Resp({ body: 'detalle' }));
  sw.ctx.__fetch = sinRed;
  for (const u of ['/navegacion/publicacion', '/navegacion/publicacion.html', '/navegacion/publicacion?id=7', '/navegacion/publicacion.html?id=7']) {
    const r = await pedir(sw, peticion(ORIGEN + u, { mode: 'navigate' }));
    assert.equal(await r.respuesta.text(), 'detalle', u);
  }
});

test('sin conexión y sin copia: se muestra /offline; sin eso, un aviso 503', async () => {
  const sw = cargarSW();
  sw.ctx.__fetch = sinRed;
  let r = await pedir(sw, peticion(ORIGEN + '/navegacion/Programas', { mode: 'navigate' }));
  assert.equal(r.respuesta.status, 503);
  const c = await sw.caches.open(sw.nombreCache);
  await c.put(ORIGEN + '/offline', new Resp({ body: 'página sin conexión' }));
  r = await pedir(sw, peticion(ORIGEN + '/navegacion/Programas', { mode: 'navigate' }));
  assert.equal(await r.respuesta.text(), 'página sin conexión');
});

test('red lenta: se entrega la copia guardada sin esperar y la red la renueva después', async () => {
  const sw = cargarSW();
  const c = await sw.caches.open(sw.nombreCache);
  await c.put(ORIGEN + '/', new Resp({ body: 'copia vieja' }));
  let liberar;
  sw.ctx.__fetch = () => new Promise((ok) => { liberar = () => ok(new Resp({ body: 'copia nueva' })); });
  const p = pedir(sw, peticion(ORIGEN + '/', { mode: 'navigate' }));
  await new Promise((r) => setTimeout(r, 30));
  liberar();
  const r = await p;
  assert.equal(await r.respuesta.text(), 'copia vieja');
  assert.equal(await (await c.match(ORIGEN + '/')).text(), 'copia nueva');
});

// ---------- archivos propios ----------
test('archivo con versión: caché primero (no vuelve a la red)', async () => {
  const sw = cargarSW();
  const c = await sw.caches.open(sw.nombreCache);
  await c.put(ORIGEN + '/nav.css?v=1', new Resp({ body: 'css guardado' }));
  sw.ctx.__fetch = async () => { throw new Error('no debería pedirse'); };
  const r = await pedir(sw, peticion(ORIGEN + '/nav.css?v=1'));
  assert.equal(await r.respuesta.text(), 'css guardado');
  assert.equal(sw.llamadas.length, 0);
});

test('archivo con versión sin copia: se pide y se guarda; sin red, error de red', async () => {
  const sw = cargarSW();
  sw.ctx.__fetch = async () => new Resp({ body: 'nuevo' });
  let r = await pedir(sw, peticion(ORIGEN + '/js/ui.js?v=2'));
  assert.equal(await r.respuesta.text(), 'nuevo');
  assert.ok(sw.caches.almacenes.get(sw.nombreCache).has(ORIGEN + '/js/ui.js?v=2'));
  sw.ctx.__fetch = sinRed;
  r = await pedir(sw, peticion(ORIGEN + '/js/otro.js?v=2'));
  assert.equal(r.respuesta.type, 'error');
});

test('archivo sin versión: se entrega lo guardado y se actualiza en segundo plano', async () => {
  const sw = cargarSW();
  const c = await sw.caches.open(sw.nombreCache);
  await c.put(ORIGEN + '/styles.css', new Resp({ body: 'viejo' }));
  sw.ctx.__fetch = async () => new Resp({ body: 'nuevo' });
  const r = await pedir(sw, peticion(ORIGEN + '/styles.css'));
  assert.equal(await r.respuesta.text(), 'viejo');
  assert.equal(await (await c.match(ORIGEN + '/styles.css')).text(), 'nuevo');
});

test('archivo sin versión y sin red: sigue funcionando con lo guardado', async () => {
  const sw = cargarSW();
  const c = await sw.caches.open(sw.nombreCache);
  await c.put(ORIGEN + '/styles.css', new Resp({ body: 'guardado' }));
  sw.ctx.__fetch = sinRed;
  const r = await pedir(sw, peticion(ORIGEN + '/styles.css'));
  assert.equal(await r.respuesta.text(), 'guardado');
});

// ---------- configuración de Supabase ----------
test('/api/config: con red se guarda; sin red se usa la copia; sin copia, 503', async () => {
  const sw = cargarSW();
  sw.ctx.__fetch = async () => new Resp({ body: '{"url":"u","anonKey":"k"}' });
  await pedir(sw, peticion(ORIGEN + '/api/config', { mode: 'cors' }));
  sw.ctx.__fetch = sinRed;
  let r = await pedir(sw, peticion(ORIGEN + '/api/config', { mode: 'cors' }));
  assert.equal(await r.respuesta.text(), '{"url":"u","anonKey":"k"}');
  const otro = cargarSW();
  otro.ctx.__fetch = sinRed;
  r = await pedir(otro, peticion(ORIGEN + '/api/config', { mode: 'cors' }));
  assert.equal(r.respuesta.status, 503);
});

// ---------- bibliotecas externas ----------
test('biblioteca con CORS: se guarda legible y se renueva en segundo plano', async () => {
  const sw = cargarSW();
  const url = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css';
  sw.ctx.__fetch = async () => new Resp({ type: 'cors', body: 'v1' });
  let r = await pedir(sw, peticion(url));
  assert.equal(await r.respuesta.text(), 'v1');
  sw.ctx.__fetch = async () => new Resp({ type: 'cors', body: 'v2' });
  r = await pedir(sw, peticion(url));
  assert.equal(await r.respuesta.text(), 'v1', 'responde con lo guardado');
  assert.equal(await (await sw.caches.match(url)).text(), 'v2', 'y lo renueva');
});

test('biblioteca sin CORS (Tailwind): se guarda opaca y no se vuelve a pedir', async () => {
  const sw = cargarSW();
  sw.ctx.__fetch = async (r, init) => {
    if (init && init.mode === 'cors') throw new TypeError('Failed to fetch');
    return new Resp({ status: 0, type: 'opaque' });
  };
  let r = await pedir(sw, peticion('https://cdn.tailwindcss.com/'));
  assert.equal(r.respuesta.type, 'opaque');
  const antes = sw.llamadas.length;
  sw.ctx.__fetch = sinRed;
  r = await pedir(sw, peticion('https://cdn.tailwindcss.com/'));
  assert.equal(r.respuesta.type, 'opaque');
  assert.equal(sw.llamadas.length, antes, 'no revalida una copia opaca');
});

test('biblioteca desconocida: no se toca', async () => {
  const sw = cargarSW();
  const r = await pedir(sw, peticion('https://example.com/x.js'));
  assert.equal(r.atendido, false);
});

// ---------- imágenes de publicaciones ----------
test('imágenes de publicaciones: se guardan y hay un tope', async () => {
  const sw = cargarSW();
  sw.ctx.__fetch = async () => new Resp({ type: 'cors', body: 'img' });
  for (let i = 0; i < 85; i++) await pedir(sw, peticion(SUPA + '/storage/v1/object/public/publicacion-imagenes/' + i + '.png'));
  const c = sw.caches.almacenes.get('immujel-imagenes-v1');
  assert.ok(c.size <= 80, 'tope: ' + c.size);
  sw.ctx.__fetch = sinRed;
  const r = await pedir(sw, peticion(SUPA + '/storage/v1/object/public/publicacion-imagenes/84.png'));
  assert.equal(await r.respuesta.text(), 'img');
});

// ---------- lecturas públicas de Supabase ----------
function lecturaPublica(cabeceras = {}) {
  return peticion(SUPA + '/rest/v1/publicaciones?select=id,titulo&publicado=eq.true', { mode: 'cors', headers: Object.assign({ apikey: ANON, authorization: 'Bearer ' + ANON, accept: 'application/json' }, cabeceras) });
}

test('lecturas públicas anónimas: se guardan y sin conexión se sirven con la marca de copia', async () => {
  const sw = cargarSW();
  sw.ctx.__fetch = async () => new Resp({ type: 'cors', body: '[{"id":1}]', headers: { 'content-type': 'application/json', 'content-range': '0-0/1' } });
  let r = await pedir(sw, lecturaPublica());
  assert.equal(await r.respuesta.text(), '[{"id":1}]');
  sw.ctx.__fetch = sinRed;
  r = await pedir(sw, lecturaPublica());
  assert.equal(await r.respuesta.text(), '[{"id":1}]');
  assert.equal(r.respuesta.headers.get('x-immujel-cache'), 'guardado');
  assert.equal(r.respuesta.headers.get('content-range'), '0-0/1', 'conserva el total para la paginación');
});

test('lecturas públicas: una usuaria lee primero lo suyo, luego lo anónimo, y nunca lo de otra cuenta', async () => {
  const sw = cargarSW();
  const usuaria = (id) => lecturaPublica({ authorization: 'Bearer ' + jwt({ sub: id }) });
  sw.ctx.__fetch = async () => new Resp({ type: 'cors', body: 'anonimo' });
  await pedir(sw, lecturaPublica());
  sw.ctx.__fetch = async () => new Resp({ type: 'cors', body: 'de u1' });
  await pedir(sw, usuaria('u1'));
  sw.ctx.__fetch = sinRed;
  assert.equal(await (await pedir(sw, usuaria('u1'))).respuesta.text(), 'de u1');
  assert.equal(await (await pedir(sw, usuaria('u2'))).respuesta.text(), 'anonimo', 'otra cuenta solo ve lo anónimo');
  assert.equal(await (await pedir(sw, lecturaPublica())).respuesta.text(), 'anonimo', 'un anónimo no ve lo de u1');
});

test('lecturas públicas sin copia y sin red: el error llega a la página', async () => {
  const sw = cargarSW();
  sw.ctx.__fetch = sinRed;
  const r = await pedir(sw, lecturaPublica());
  assert.equal(r.respuesta.type, 'error');
});

test('lecturas públicas: no se guardan los errores ni las respuestas con token ilegible', async () => {
  const sw = cargarSW();
  sw.ctx.__fetch = async () => new Resp({ type: 'cors', status: 401, body: 'no autorizado' });
  await pedir(sw, lecturaPublica());
  sw.ctx.__fetch = async () => new Resp({ type: 'cors', body: 'ok' });
  await pedir(sw, lecturaPublica({ authorization: 'Bearer basura' }));
  const c = sw.caches.almacenes.get('immujel-datos-v1');
  assert.equal(c ? c.size : 0, 0);
});

test('lecturas públicas con red lenta: se entrega la copia guardada', async () => {
  const sw = cargarSW();
  sw.ctx.__fetch = async () => new Resp({ type: 'cors', body: 'guardada' });
  await pedir(sw, lecturaPublica());
  sw.ctx.__fetch = () => new Promise(() => {}); // nunca responde
  const r = await pedir(sw, lecturaPublica());
  assert.equal(await r.respuesta.text(), 'guardada');
});

// ---------- lo que nunca se intercepta ----------
test('no se intercepta nada privado ni de escritura', async () => {
  const sw = cargarSW();
  const casos = [
    peticion(SUPA + '/rest/v1/solicitudes?select=*', { mode: 'cors', headers: { apikey: ANON, authorization: 'Bearer ' + ANON } }),
    peticion(SUPA + '/rest/v1/perfiles?select=rol', { mode: 'cors' }),
    peticion(SUPA + '/rest/v1/solicitudes', { mode: 'cors', method: 'POST' }),
    peticion(SUPA + '/rest/v1/publicaciones', { mode: 'cors', method: 'DELETE' }),
    peticion(SUPA + '/auth/v1/user', { mode: 'cors' }),
    peticion(SUPA + '/rest/v1/rpc/asignar_caso', { mode: 'cors', method: 'POST' }),
    peticion(ORIGEN + '/api/otra', { mode: 'cors' }),
    peticion(ORIGEN + '/nav.css?v=1', { method: 'POST' })
  ];
  for (const req of casos) assert.equal((await pedir(sw, req)).atendido, false, req.method + ' ' + req.url);
});

// ---------- sincronización en segundo plano ----------
test('sync: solo atiende la etiqueta de solicitudes y reintenta si queda algo pendiente', async () => {
  const sw = cargarSW();
  let llamadas = 0;
  sw.ctx.OfflineDB.enviarPendientes = async () => { llamadas++; return { enviadas: 0, pendientes: 1, fallidas: 0, vencidas: 0 }; };
  let r = await disparar(sw, 'sync', { tag: 'otra-cosa' });
  assert.equal(llamadas, 0);
  r = await disparar(sw, 'sync', { tag: 'enviar-solicitudes' });
  assert.equal(llamadas, 1);
  assert.equal(r[0].status, 'rejected', 'el error hace que el navegador lo reintente');
  sw.ctx.OfflineDB.enviarPendientes = async () => ({ enviadas: 1, pendientes: 0, fallidas: 0, vencidas: 0 });
  r = await disparar(sw, 'sync', { tag: 'enviar-solicitudes' });
  assert.equal(r[0].status, 'fulfilled');
});

test('el Service Worker no muestra notificaciones por las solicitudes enviadas en segundo plano', async () => {
  const sw = cargarSW();
  let avisos = 0;
  sw.ctx.registration.showNotification = async () => { avisos++; };
  sw.ctx.OfflineDB.enviarPendientes = async () => ({ enviadas: 2, pendientes: 0, fallidas: 0, vencidas: 0 });
  await disparar(sw, 'sync', { tag: 'enviar-solicitudes' });
  assert.equal(avisos, 0);
});
