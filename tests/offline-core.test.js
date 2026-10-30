const test = require('node:test');
const assert = require('node:assert/strict');
const O = require('../js/offline-core.js');

const ORIGEN = 'https://immujel.vercel.app';
const SUPA = 'https://vhgfyqodiieblhfwbama.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.firma';

function jwt(payload) {
  return 'x.' + Buffer.from(JSON.stringify(payload)).toString('base64url') + '.y';
}
function cab(obj) {
  const m = new Map(Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (k) => (m.has(k.toLowerCase()) ? m.get(k.toLowerCase()) : null) };
}

// ---------- clasificar ----------
test('clasificar: navegación a una página propia', () => {
  assert.equal(O.clasificar(ORIGEN + '/navegacion/Programas', 'GET', 'navigate', ORIGEN), 'navegacion');
  assert.equal(O.clasificar(ORIGEN + '/Forms/form.html', 'GET', 'navigate', ORIGEN), 'navegacion');
});

test('clasificar: archivos propios con versión van cache-first, sin versión se revalidan', () => {
  assert.equal(O.clasificar(ORIGEN + '/nav.css?v=1', 'GET', 'no-cors', ORIGEN), 'estatico-versionado');
  assert.equal(O.clasificar(ORIGEN + '/js/auth.js?v=3', 'GET', 'no-cors', ORIGEN), 'estatico-versionado');
  assert.equal(O.clasificar(ORIGEN + '/styles.css', 'GET', 'no-cors', ORIGEN), 'estatico');
  assert.equal(O.clasificar(ORIGEN + '/js/ui.js', 'GET', 'no-cors', ORIGEN), 'estatico');
  assert.equal(O.clasificar(ORIGEN + '/manifest.json', 'GET', 'cors', ORIGEN), 'estatico');
});

test('clasificar: imágenes y fuentes propias no cambian de contenido: cache-first', () => {
  assert.equal(O.clasificar(ORIGEN + '/Images/HEAD.svg', 'GET', 'no-cors', ORIGEN), 'estatico-versionado');
  assert.equal(O.clasificar(ORIGEN + '/Images/Third%20Slade.webp', 'GET', 'no-cors', ORIGEN), 'estatico-versionado');
});

test('clasificar: /api/config se guarda para poder iniciar Supabase sin conexión; otras funciones no', () => {
  assert.equal(O.clasificar(ORIGEN + '/api/config', 'GET', 'cors', ORIGEN), 'config');
  assert.equal(O.clasificar(ORIGEN + '/api/otra', 'GET', 'cors', ORIGEN), 'ignorar');
});

test('clasificar: solo las bibliotecas externas conocidas se guardan', () => {
  assert.equal(O.clasificar('https://cdn.tailwindcss.com/', 'GET', 'no-cors', ORIGEN), 'cdn');
  assert.equal(O.clasificar('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css', 'GET', 'no-cors', ORIGEN), 'cdn');
  assert.equal(O.clasificar('https://fonts.googleapis.com/css2?family=Montserrat:wght@400', 'GET', 'no-cors', ORIGEN), 'cdn');
  assert.equal(O.clasificar('https://fonts.gstatic.com/s/montserrat/v26/x.woff2', 'GET', 'cors', ORIGEN), 'cdn');
  assert.equal(O.clasificar('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', 'GET', 'no-cors', ORIGEN), 'cdn');
  assert.equal(O.clasificar('https://example.com/x.js', 'GET', 'no-cors', ORIGEN), 'ignorar');
  assert.equal(O.clasificar('https://www.instagram.com/immujellags_/', 'GET', 'navigate', ORIGEN), 'ignorar');
});

test('clasificar: imágenes de publicaciones (Storage público y Unsplash) con tope', () => {
  assert.equal(O.clasificar(SUPA + '/storage/v1/object/public/publicacion-imagenes/a.png', 'GET', 'no-cors', ORIGEN), 'imagen-externa');
  assert.equal(O.clasificar('https://images.unsplash.com/photo-1559027615-cd4628902d4a?w=800', 'GET', 'no-cors', ORIGEN), 'imagen-externa');
  assert.equal(O.clasificar(SUPA + '/storage/v1/object/authenticated/privado/a.png', 'GET', 'no-cors', ORIGEN), 'ignorar');
});

test('clasificar: solo las tablas públicas de Supabase se guardan; el resto (solicitudes, perfiles…) nunca', () => {
  assert.equal(O.clasificar(SUPA + '/rest/v1/publicaciones?select=*', 'GET', 'cors', ORIGEN), 'datos-publicos');
  assert.equal(O.clasificar(SUPA + '/rest/v1/configuracion_visual?select=modo&id=eq.global', 'GET', 'cors', ORIGEN), 'datos-publicos');
  for (const t of ['solicitudes', 'perfiles', 'notas_solicitud', 'personal_asesoria', 'asignaciones_caso', 'push_subscriptions']) {
    assert.equal(O.clasificar(SUPA + '/rest/v1/' + t + '?select=*', 'GET', 'cors', ORIGEN), 'ignorar', t);
  }
  assert.equal(O.clasificar(SUPA + '/auth/v1/user', 'GET', 'cors', ORIGEN), 'ignorar');
  assert.equal(O.clasificar(SUPA + '/rest/v1/rpc/asignar_caso', 'POST', 'cors', ORIGEN), 'ignorar');
});

test('clasificar: cualquier método distinto de GET se deja pasar', () => {
  assert.equal(O.clasificar(ORIGEN + '/nav.css?v=1', 'POST', 'cors', ORIGEN), 'ignorar');
  assert.equal(O.clasificar(SUPA + '/rest/v1/publicaciones', 'DELETE', 'cors', ORIGEN), 'ignorar');
});

// ---------- nivel de acceso y clave de datos ----------
test('nivelDeAcceso: anónimo cuando el token es la clave pública o no hay token', () => {
  assert.equal(O.nivelDeAcceso(ANON, 'Bearer ' + ANON), 'a');
  assert.equal(O.nivelDeAcceso(ANON, null), 'a');
  assert.equal(O.nivelDeAcceso(null, null), 'a');
});

test('nivelDeAcceso: con sesión, un nivel por cuenta; un token ilegible no se guarda', () => {
  assert.equal(O.nivelDeAcceso(ANON, 'Bearer ' + jwt({ sub: 'u-123', role: 'authenticated' })), 'u:u-123');
  assert.equal(O.nivelDeAcceso(ANON, 'Bearer basura'), null);
  assert.equal(O.nivelDeAcceso(ANON, 'Bearer ' + jwt({ role: 'authenticated' })), null, 'sin sub');
});

test('claveDeDatos: separa por nivel, por Accept y por Prefer; nunca incluye el token', () => {
  const url = SUPA + '/rest/v1/publicaciones?select=*&id=eq.5';
  const anon = O.claveDeDatos(url, cab({ apikey: ANON, authorization: 'Bearer ' + ANON, accept: 'application/json' }));
  const unico = O.claveDeDatos(url, cab({ apikey: ANON, authorization: 'Bearer ' + ANON, accept: 'application/vnd.pgrst.object+json' }));
  const usuaria = O.claveDeDatos(url, cab({ apikey: ANON, authorization: 'Bearer ' + jwt({ sub: 'u1' }), accept: 'application/json' }));
  assert.notEqual(anon, unico);
  assert.notEqual(anon, usuaria);
  assert.ok(!anon.includes(ANON) && !usuaria.includes('firma'));
  assert.equal(anon, O.claveDeDatos(url, cab({ apikey: ANON, authorization: 'Bearer ' + ANON, accept: 'application/json' })), 'estable');
  assert.match(anon, /^https:\/\/vhgfyqodiieblhfwbama\.supabase\.co\/rest\/v1\/publicaciones\?select=\*&id=eq\.5&__k=/);
});

test('claveDeDatos: sin token legible no hay clave', () => {
  assert.equal(O.claveDeDatos(SUPA + '/rest/v1/publicaciones', cab({ apikey: ANON, authorization: 'Bearer basura' })), null);
});

test('clavesDeLectura: la usuaria lee primero lo suyo y luego lo anónimo; el anónimo solo lo anónimo', () => {
  const url = SUPA + '/rest/v1/publicaciones?select=*';
  const h = { apikey: ANON, accept: 'application/json' };
  const claves = O.clavesDeLectura(url, cab(Object.assign({ authorization: 'Bearer ' + jwt({ sub: 'u1' }) }, h)));
  assert.equal(claves.length, 2);
  assert.match(claves[0], /u%3Au1/);
  assert.match(claves[1], /__k=a/);
  assert.equal(O.clavesDeLectura(url, cab(Object.assign({ authorization: 'Bearer ' + ANON }, h))).length, 1);
});

// ---------- normalizar rutas de navegación ----------
test('rutaDePagina: .html e index se igualan a la dirección limpia y se ignora la búsqueda', () => {
  assert.equal(O.rutaDePagina(ORIGEN + '/navegacion/Programas.html'), '/navegacion/Programas');
  assert.equal(O.rutaDePagina(ORIGEN + '/navegacion/Programas'), '/navegacion/Programas');
  assert.equal(O.rutaDePagina(ORIGEN + '/navegacion/publicacion?id=7'), '/navegacion/publicacion');
  assert.equal(O.rutaDePagina(ORIGEN + '/index.html'), '/');
  assert.equal(O.rutaDePagina(ORIGEN + '/'), '/');
  assert.equal(O.rutaDePagina(ORIGEN + '/Login/login.html#x'), '/Login/login');
  assert.equal(O.rutaDePagina(ORIGEN + '/navegacion/Sobre%20Nosotras.html'), '/navegacion/Sobre%20Nosotras');
  assert.equal(O.rutaDePagina(ORIGEN + '/navegacion/Programas/'), '/navegacion/Programas', 'con barra final');
  assert.equal(O.rutaDePagina(ORIGEN + '/Forms/index.html'), '/Forms', 'trailingSlash: false en vercel.json');
});

// ---------- validación de la solicitud ----------
const SOLICITUD = {
  usuario_id: null, nombre_completo: 'María Pérez', cedula: 'V-12345678', telefono: '0412-1234567',
  correo: 'maria@correo.com', parroquia: 'Alonso de Ojeda', descripcion: 'Necesito orientación.', es_anonimo: false, estado: 'pendiente'
};

test('validarSolicitud: deja solo las columnas conocidas y fija el estado', () => {
  const r = O.validarSolicitud(Object.assign({}, SOLICITUD, { rol: 'admin', asignada_a: 'x', estado: 'finalizada', id: 99 }));
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.datos).sort(), ['cedula', 'correo', 'descripcion', 'es_anonimo', 'estado', 'nombre_completo', 'parroquia', 'telefono', 'usuario_id']);
  assert.equal(r.datos.estado, 'pendiente');
});

test('validarSolicitud: el teléfono es obligatorio y con el formato del formulario', () => {
  assert.equal(O.validarSolicitud(Object.assign({}, SOLICITUD, { telefono: '' })).ok, false);
  assert.equal(O.validarSolicitud(Object.assign({}, SOLICITUD, { telefono: 'abc' })).ok, false);
  assert.equal(O.validarSolicitud(Object.assign({}, SOLICITUD, { telefono: '04121234567' })).ok, true);
});

test('validarSolicitud: anónima no lleva nombre, cédula, correo ni parroquia', () => {
  const r = O.validarSolicitud(Object.assign({}, SOLICITUD, { es_anonimo: true }));
  assert.equal(r.ok, true);
  assert.equal(r.datos.nombre_completo, null);
  assert.equal(r.datos.cedula, null);
  assert.equal(r.datos.correo, null);
  assert.equal(r.datos.parroquia, null);
});

test('validarSolicitud: no anónima exige nombre y parroquia; los textos largos se rechazan', () => {
  assert.equal(O.validarSolicitud(Object.assign({}, SOLICITUD, { nombre_completo: 'ab' })).ok, false);
  assert.equal(O.validarSolicitud(Object.assign({}, SOLICITUD, { parroquia: '' })).ok, false);
  assert.equal(O.validarSolicitud(Object.assign({}, SOLICITUD, { descripcion: 'x'.repeat(5001) })).ok, false);
  assert.equal(O.validarSolicitud(null).ok, false);
  assert.equal(O.validarSolicitud('texto').ok, false);
});

test('validarSolicitud: el usuario_id solo puede ser un uuid o null', () => {
  assert.equal(O.validarSolicitud(Object.assign({}, SOLICITUD, { usuario_id: '123e4567-e89b-12d3-a456-426614174000' })).ok, true);
  assert.equal(O.validarSolicitud(Object.assign({}, SOLICITUD, { usuario_id: "1'; drop table" })).ok, false);
});

const CLIENT_ID = '123E4567-E89B-42D3-A456-426614174000';

test('validarSolicitud: el client_id es opcional, solo puede ser un uuid y se guarda en minúsculas', () => {
  assert.equal('client_id' in O.validarSolicitud(SOLICITUD).datos, false, 'sin client_id no se agrega la columna');
  assert.equal(O.validarSolicitud(Object.assign({}, SOLICITUD, { client_id: null })).ok, true);
  const r = O.validarSolicitud(Object.assign({}, SOLICITUD, { client_id: CLIENT_ID }));
  assert.equal(r.ok, true);
  assert.equal(r.datos.client_id, CLIENT_ID.toLowerCase());
  assert.equal(O.validarSolicitud(Object.assign({}, SOLICITUD, { client_id: "x'; drop table" })).ok, false);
  assert.equal(O.validarSolicitud(Object.assign({}, SOLICITUD, { client_id: 123 })).ok, false);
});

// ---------- configuración y petición ----------
test('configValida: https de Supabase (o localhost para pruebas) y claves ASCII', () => {
  assert.equal(O.configValida({ url: SUPA, anonKey: ANON }), true);
  assert.equal(O.configValida({ url: 'http://localhost:5500', anonKey: ANON }), true);
  assert.equal(O.configValida({ url: 'http://evil.example', anonKey: ANON }), false);
  assert.equal(O.configValida({ url: 'https://evil.example', anonKey: ANON }), false);
  assert.equal(O.configValida({ url: SUPA, anonKey: '' }), false);
  assert.equal(O.configValida({ url: SUPA, anonKey: 'clavé' }), false);
  assert.equal(O.configValida(null), false);
});

test('peticionDeSolicitud: POST a la tabla solicitudes con la clave pública y sin pedir de vuelta la fila', () => {
  const p = O.peticionDeSolicitud({ url: SUPA + '/', anonKey: ANON }, SOLICITUD);
  assert.equal(p.url, SUPA + '/rest/v1/solicitudes');
  assert.equal(p.init.method, 'POST');
  assert.equal(p.init.headers.apikey, ANON);
  assert.equal(p.init.headers.Authorization, 'Bearer ' + ANON);
  assert.equal(p.init.headers.Prefer, 'return=minimal');
  assert.equal(p.init.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(p.init.body), [SOLICITUD]);
});

test('peticionDeSolicitud: el client_id viaja en el cuerpo; no se usa ON CONFLICT (exige permiso de lectura que el público no tiene)', () => {
  const datos = Object.assign({}, SOLICITUD, { client_id: CLIENT_ID.toLowerCase() });
  const p = O.peticionDeSolicitud({ url: SUPA, anonKey: ANON }, datos);
  assert.equal(p.url, SUPA + '/rest/v1/solicitudes');
  assert.equal(p.init.headers.Prefer, 'return=minimal');
  assert.equal(JSON.parse(p.init.body)[0].client_id, CLIENT_ID.toLowerCase());
});

test('esRepetidaPorClientId: solo el 409 del índice único de client_id cuenta como ya recibida', () => {
  const msg = '{"code":"23505","details":"Key (client_id)=(123e4567-e89b-42d3-a456-426614174000) already exists.","hint":null,"message":"duplicate key value violates unique constraint \\"solicitudes_client_id_key\\""}';
  assert.equal(O.esRepetidaPorClientId(409, msg), true);
  assert.equal(O.esRepetidaPorClientId(409, '{"code":"23503","message":"violates foreign key constraint \\"solicitudes_usuario_id_fkey\\""}'), false);
  assert.equal(O.esRepetidaPorClientId(422, msg), false);
  assert.equal(O.esRepetidaPorClientId(409, undefined), false);
});

test('veredictoDeEstado: éxito, error permanente (4xx) y error pasajero', () => {
  assert.equal(O.veredictoDeEstado(201), 'ok');
  assert.equal(O.veredictoDeEstado(204), 'ok');
  for (const s of [400, 401, 403, 404, 409, 422]) assert.equal(O.veredictoDeEstado(s), 'permanente', String(s));
  for (const s of [408, 425, 429, 500, 502, 503, 504]) assert.equal(O.veredictoDeEstado(s), 'pasajero', String(s));
});

test('proximoIntentoMs: espera creciente con tope', () => {
  const e = [0, 1, 2, 3, 4, 5, 6, 20].map(O.proximoIntentoMs);
  for (let i = 1; i < e.length; i++) assert.ok(e[i] >= e[i - 1], 'no decrece');
  assert.equal(e[0], 60 * 1000);
  assert.equal(e[6], e[7], 'con tope');
  assert.ok(e[7] <= 12 * 3600 * 1000);
});

// ---------- cola ----------
function almacenEnMemoria() {
  const filas = new Map();
  return {
    filas,
    async listar() { return [...filas.values()].map((x) => JSON.parse(JSON.stringify(x))); },
    async obtener(id) { return filas.has(id) ? JSON.parse(JSON.stringify(filas.get(id))) : null; },
    async guardar(item) { filas.set(item.id, JSON.parse(JSON.stringify(item))); },
    async borrar(id) { filas.delete(id); },
    async guardarSiReclamada(item, marca) {
      const f = filas.get(item.id);
      if (f && f.estado === 'enviando' && f.reclamadoEn === marca) filas.set(item.id, JSON.parse(JSON.stringify(item)));
    },
    async reclamar(id, ahora, ttl) {
      const f = filas.get(id);
      if (!f) return null;
      const libre = f.estado === 'pendiente' || (f.estado === 'enviando' && f.reclamadoEn + ttl <= ahora);
      if (!libre) return null;
      f.estado = 'enviando'; f.reclamadoEn = ahora;
      return JSON.parse(JSON.stringify(f));
    }
  };
}
const T0 = 1700000000000;

test('nuevoPendiente: queda pendiente, con fecha y sin intentos', () => {
  const p = O.nuevoPendiente(SOLICITUD, T0, 'id-1');
  assert.equal(p.id, 'id-1');
  assert.equal(p.estado, 'pendiente');
  assert.equal(p.intentos, 0);
  assert.equal(p.creadoEn, T0);
  assert.equal(p.proximoIntento, T0);
  assert.deepEqual(p.datos, SOLICITUD);
});

test('procesarCola: envía en orden de llegada y borra lo enviado', async () => {
  const s = almacenEnMemoria();
  await s.guardar(O.nuevoPendiente(SOLICITUD, T0 + 10, 'b'));
  await s.guardar(O.nuevoPendiente(SOLICITUD, T0, 'a'));
  const orden = [];
  const r = await O.procesarCola({ store: s, ahora: T0 + 20, enviar: async (d) => { orden.push(d.telefono); return { estado: 201 }; } });
  assert.equal(r.enviadas, 2);
  assert.equal(s.filas.size, 0);
  assert.equal(orden.length, 2);
});

test('procesarCola: sin conexión deja todo pendiente, sin alargar la espera, y no sigue intentando', async () => {
  const s = almacenEnMemoria();
  await s.guardar(O.nuevoPendiente(SOLICITUD, T0, 'a'));
  await s.guardar(O.nuevoPendiente(SOLICITUD, T0 + 1, 'b'));
  let llamadas = 0;
  const r = await O.procesarCola({ store: s, ahora: T0 + 5, enviar: async () => { llamadas++; throw new TypeError('Failed to fetch'); } });
  assert.equal(llamadas, 1, 'al primer fallo de red se detiene');
  assert.equal(r.enviadas, 0);
  assert.equal(r.pendientes, 2);
  const a = s.filas.get('a');
  assert.equal(a.estado, 'pendiente');
  assert.equal(a.intentos, 1);
  assert.equal(a.proximoIntento, T0 + 5, 'sin red no hay espera: se reintenta apenas vuelva la conexión');
  assert.equal(s.filas.get('b').intentos, 0, 'la segunda no se tocó');
  let otra = 0;
  await O.procesarCola({ store: s, ahora: T0 + 6, enviar: async () => { otra++; return { estado: 201 }; } });
  assert.equal(otra, 2, 'el siguiente intento no tiene que esperar minutos');
});

test('procesarCola: "forzar" ignora la espera entre intentos de un servidor ocupado', async () => {
  const s = almacenEnMemoria();
  await s.guardar(O.nuevoPendiente(SOLICITUD, T0, 'a'));
  await O.procesarCola({ store: s, ahora: T0, enviar: async () => ({ estado: 503 }) });
  assert.ok(s.filas.get('a').proximoIntento > T0 + 1000);
  let llamadas = 0;
  const enviar = async () => { llamadas++; return { estado: 201 }; };
  await O.procesarCola({ store: s, ahora: T0 + 1000, enviar });
  assert.equal(llamadas, 0, 'sin forzar respeta la espera');
  const r = await O.procesarCola({ store: s, ahora: T0 + 1000, enviar, forzar: true });
  assert.equal(llamadas, 1);
  assert.equal(r.enviadas, 1);
});

test('procesarCola: si la usuaria descarta una solicitud mientras se envía, un fallo no la vuelve a crear', async () => {
  const s = almacenEnMemoria();
  await s.guardar(O.nuevoPendiente(SOLICITUD, T0, 'a'));
  await O.procesarCola({ store: s, ahora: T0, enviar: async () => { await s.borrar('a'); throw new TypeError('Failed to fetch'); } });
  assert.equal(s.filas.has('a'), false, 'los datos personales descartados no reaparecen');
  await s.guardar(O.nuevoPendiente(SOLICITUD, T0, 'b'));
  await O.procesarCola({ store: s, ahora: T0, enviar: async () => { await s.borrar('b'); return { estado: 422 }; } });
  assert.equal(s.filas.has('b'), false);
});

test('procesarCola: no reintenta antes de la hora indicada', async () => {
  const s = almacenEnMemoria();
  const p = O.nuevoPendiente(SOLICITUD, T0, 'a'); p.proximoIntento = T0 + 60000; await s.guardar(p);
  let llamadas = 0;
  await O.procesarCola({ store: s, ahora: T0 + 1000, enviar: async () => { llamadas++; return { estado: 201 }; } });
  assert.equal(llamadas, 0);
  await O.procesarCola({ store: s, ahora: T0 + 60000, enviar: async () => { llamadas++; return { estado: 201 }; } });
  assert.equal(llamadas, 1);
});

test('procesarCola: un 4xx deja la solicitud como fallida (sin reintentos) y sigue con las demás', async () => {
  const s = almacenEnMemoria();
  await s.guardar(O.nuevoPendiente(SOLICITUD, T0, 'a'));
  await s.guardar(O.nuevoPendiente(SOLICITUD, T0 + 1, 'b'));
  let n = 0;
  const r = await O.procesarCola({ store: s, ahora: T0 + 5, enviar: async () => (++n === 1 ? { estado: 422, mensaje: 'violates check' } : { estado: 201 }) });
  assert.equal(r.fallidas, 1);
  assert.equal(r.enviadas, 1);
  assert.equal(s.filas.get('a').estado, 'fallida');
  assert.match(s.filas.get('a').ultimoError, /422/);
  assert.equal(s.filas.has('b'), false);
  let llamadas = 0;
  await O.procesarCola({ store: s, ahora: T0 + 10 ** 7, enviar: async () => { llamadas++; return { estado: 201 }; } });
  assert.equal(llamadas, 0, 'una fallida no se vuelve a enviar sola');
});

test('procesarCola: un 409 por client_id repetido significa que el servidor ya la tenía: se da por enviada', async () => {
  const s = almacenEnMemoria();
  await s.guardar(O.nuevoPendiente(Object.assign({}, SOLICITUD, { client_id: CLIENT_ID.toLowerCase() }), T0, 'a'));
  await s.guardar(O.nuevoPendiente(SOLICITUD, T0 + 1, 'b'));
  const r = await O.procesarCola({ store: s, ahora: T0 + 5, enviar: async (d) => (d.client_id ? { estado: 409, mensaje: 'duplicate key value violates unique constraint "solicitudes_client_id_key"' } : { estado: 409, mensaje: 'violates foreign key constraint' }) });
  assert.equal(r.enviadas, 1);
  assert.equal(s.filas.has('a'), false, 'la repetida se borra del dispositivo');
  assert.equal(s.filas.get('b').estado, 'fallida', 'otro 409 sigue siendo un rechazo');
});

test('procesarCola: un 5xx cuenta como pasajero y se reintenta más tarde', async () => {
  const s = almacenEnMemoria();
  await s.guardar(O.nuevoPendiente(SOLICITUD, T0, 'a'));
  await O.procesarCola({ store: s, ahora: T0, enviar: async () => ({ estado: 503 }) });
  assert.equal(s.filas.get('a').estado, 'pendiente');
  assert.equal(s.filas.get('a').intentos, 1);
});

test('procesarCola: dos procesos a la vez no envían la misma solicitud dos veces', async () => {
  const s = almacenEnMemoria();
  await s.guardar(O.nuevoPendiente(SOLICITUD, T0, 'a'));
  let envios = 0;
  const enviar = async () => { envios++; await new Promise((r) => setTimeout(r, 15)); return { estado: 201 }; };
  const [r1, r2] = await Promise.all([O.procesarCola({ store: s, ahora: T0, enviar }), O.procesarCola({ store: s, ahora: T0, enviar })]);
  assert.equal(envios, 1);
  assert.equal(r1.enviadas + r2.enviadas, 1);
});

test('procesarCola: una reclamación vieja (proceso que murió) se puede retomar', async () => {
  const s = almacenEnMemoria();
  const p = O.nuevoPendiente(SOLICITUD, T0, 'a'); p.estado = 'enviando'; p.reclamadoEn = T0; await s.guardar(p);
  let llamadas = 0;
  await O.procesarCola({ store: s, ahora: T0 + 1000, enviar: async () => { llamadas++; return { estado: 201 }; } });
  assert.equal(llamadas, 0, 'todavía la tiene otro');
  await O.procesarCola({ store: s, ahora: T0 + O.TTL_RECLAMO_MS + 1, enviar: async () => { llamadas++; return { estado: 201 }; } });
  assert.equal(llamadas, 1);
});

test('procesarCola: lo que pasó de la vigencia no se envía, pierde sus datos personales y deja una marca para avisar', async () => {
  const s = almacenEnMemoria();
  await s.guardar(O.nuevoPendiente(SOLICITUD, T0, 'vieja'));
  await s.guardar(O.nuevoPendiente(SOLICITUD, T0 + O.VIGENCIA_PENDIENTE_MS, 'nueva'));
  let llamadas = 0;
  const r = await O.procesarCola({ store: s, ahora: T0 + O.VIGENCIA_PENDIENTE_MS + 1, enviar: async () => { llamadas++; return { estado: 201 }; } });
  assert.equal(r.vencidas, 1);
  assert.equal(llamadas, 1, 'solo se envía la vigente');
  assert.equal(s.filas.size, 1);
  const marca = s.filas.get('vieja');
  assert.equal(marca.estado, 'vencida');
  assert.equal(marca.datos, null, 'no queda ningún dato personal');
  assert.equal(r.pendientes, 0, 'la marca no cuenta como pendiente (el Service Worker no reintenta por ella)');
  assert.deepEqual(O.resumenDeCola([marca]), { pendientes: 0, fallidas: 0, vencidas: 1, total: 1 });
  const otra = await O.procesarCola({ store: s, ahora: T0 + O.VIGENCIA_PENDIENTE_MS * 3, enviar: async () => { llamadas++; return { estado: 201 }; } });
  assert.equal(otra.vencidas, 0, 'la marca se queda hasta que la usuaria la cierre');
  assert.equal(s.filas.has('vieja'), true);
});

test('procesarCola: una solicitud con datos alterados no se envía y queda fallida', async () => {
  const s = almacenEnMemoria();
  const p = O.nuevoPendiente(Object.assign({}, SOLICITUD, { telefono: '' }), T0, 'a');
  await s.guardar(p);
  let llamadas = 0;
  await O.procesarCola({ store: s, ahora: T0, enviar: async () => { llamadas++; return { estado: 201 }; } });
  assert.equal(llamadas, 0);
  assert.equal(s.filas.get('a').estado, 'fallida');
});

test('resumenDeCola: cuenta pendientes y fallidas', () => {
  const lista = [O.nuevoPendiente(SOLICITUD, T0, 'a'), Object.assign(O.nuevoPendiente(SOLICITUD, T0, 'b'), { estado: 'fallida' }), Object.assign(O.nuevoPendiente(SOLICITUD, T0, 'c'), { estado: 'enviando' })];
  assert.deepEqual(O.resumenDeCola(lista), { pendientes: 2, fallidas: 1, vencidas: 0, total: 3 });
  assert.deepEqual(O.resumenDeCola([]), { pendientes: 0, fallidas: 0, vencidas: 0, total: 0 });
});

test('esErrorDeRed: reconoce los fallos de conexión de fetch en los navegadores', () => {
  assert.equal(O.esErrorDeRed(new TypeError('Failed to fetch')), true);
  assert.equal(O.esErrorDeRed(new TypeError('NetworkError when attempting to fetch resource.')), true);
  assert.equal(O.esErrorDeRed(new TypeError('Load failed')), true);
  assert.equal(O.esErrorDeRed({ message: 'TypeError: Failed to fetch' }), true);
  assert.equal(O.esErrorDeRed(new Error('duplicate key')), false);
  assert.equal(O.esErrorDeRed(null), false);
});
