// offline-db.js – Datos locales para trabajar sin conexión: cola de solicitudes pendientes (IndexedDB) y su envío.
// Lo cargan las páginas (window.OfflineDB) y el Service Worker (importScripts): los dos usan la misma cola y la misma lógica
// (offline-core.js), y la reclamación atómica de cada solicitud evita que se envíe dos veces si ambos corren a la vez.
//
// Privacidad: una solicitud guardada contiene datos personales. Solo vive aquí hasta que se envía, se descarta a mano o
// vence (OfflineCore.VIGENCIA_PENDIENTE_MS); al enviarse se borra de inmediato.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./offline-core.js'));
  else root.OfflineDB = factory(root.OfflineCore);
})(typeof self !== 'undefined' ? self : this, function (core) {
  var NOMBRE_DB = 'immujel-offline';
  var VERSION_DB = 1;
  var TIEMPO_ENVIO_MS = 20000;
  var TIEMPO_CONFIG_MS = 8000;
  var canal = null;

  function avisar(mensaje) {
    try {
      if (!canal && typeof BroadcastChannel !== 'undefined') canal = new BroadcastChannel('immujel-offline');
      if (canal) canal.postMessage(mensaje);
    } catch (e) { /* sin canal: la interfaz se refresca al volver a la página */ }
  }

  function abrir() {
    return new Promise(function (resolver, rechazar) {
      var req = indexedDB.open(NOMBRE_DB, VERSION_DB);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('cola')) db.createObjectStore('cola', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'clave' });
      };
      req.onsuccess = function () { resolver(req.result); };
      req.onerror = function () { rechazar(req.error); };
    });
  }

  // Ejecuta `fn(tienda)` en una transacción y resuelve con su resultado cuando la transacción termina.
  function transaccion(nombre, modo, fn) {
    return abrir().then(function (db) {
      return new Promise(function (resolver, rechazar) {
        var tx = db.transaction(nombre, modo);
        var resultado;
        try { resultado = fn(tx.objectStore(nombre), tx); } catch (e) { rechazar(e); db.close(); return; }
        // Una lectura que no encontró nada deja __valor en undefined: debe resolver con eso, no con la caja que lo envuelve
        tx.oncomplete = function () { db.close(); resolver(resultado && typeof resultado === 'object' && '__valor' in resultado ? resultado.__valor : resultado); };
        tx.onerror = function () { db.close(); rechazar(tx.error); };
        tx.onabort = function () { db.close(); rechazar(tx.error || new Error('Transacción cancelada')); };
      });
    });
  }

  function pedir(req, caja) {
    req.onsuccess = function () { caja.__valor = req.result; };
    return caja;
  }

  var store = {
    listar: function () { return transaccion('cola', 'readonly', function (t) { return pedir(t.getAll(), {}); }).then(function (v) { return v || []; }); },
    obtener: function (id) { return transaccion('cola', 'readonly', function (t) { return pedir(t.get(id), {}); }).then(function (v) { return v || null; }); },
    guardar: function (item) { return transaccion('cola', 'readwrite', function (t) { t.put(item); }); },
    borrar: function (id) { return transaccion('cola', 'readwrite', function (t) { t.delete(id); }); },
    // Guarda el resultado de un intento solo si la solicitud sigue existiendo y sigue reclamada por quien la envió
    // (si la usuaria la descartó mientras se enviaba, no reaparece con sus datos personales).
    guardarSiReclamada: function (item, marca) {
      return transaccion('cola', 'readwrite', function (t) {
        var lectura = t.get(item.id);
        lectura.onsuccess = function () {
          var f = lectura.result;
          if (f && f.estado === 'enviando' && f.reclamadoEn === marca) t.put(item);
        };
      });
    },
    // Atómico: lee y marca en la misma transacción; solo uno de dos procesos simultáneos se queda con la solicitud.
    reclamar: function (id, ahora, ttl) {
      return transaccion('cola', 'readwrite', function (t) {
        var caja = { __valor: null };
        var lectura = t.get(id);
        lectura.onsuccess = function () {
          var f = lectura.result;
          if (!f) return;
          var libre = f.estado === 'pendiente' || (f.estado === 'enviando' && f.reclamadoEn + ttl <= ahora);
          if (!libre) return;
          f.estado = 'enviando'; f.reclamadoEn = ahora;
          t.put(f);
          caja.__valor = f;
        };
        return caja;
      }).then(function (v) { return v || null; });
    }
  };

  // ---------- configuración de Supabase (para poder enviar aunque la página ya no esté abierta) ----------
  function guardarConfig(cfg) {
    return transaccion('meta', 'readwrite', function (t) { t.put({ clave: 'config', valor: cfg }); });
  }
  function leerConfig() {
    return transaccion('meta', 'readonly', function (t) { return pedir(t.get('config'), {}); }).then(function (f) { return f ? f.valor : null; });
  }
  async function obtenerConfig() {
    try {
      // Con tiempo límite: en el Service Worker, una petición colgada dejaría la solicitud reclamada hasta que venza el reclamo
      var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var reloj = ctl ? setTimeout(function () { ctl.abort(); }, TIEMPO_CONFIG_MS) : null;
      var r;
      try { r = await fetch('/api/config', ctl ? { cache: 'no-store', signal: ctl.signal } : { cache: 'no-store' }); } finally { if (reloj) clearTimeout(reloj); }
      if (r.ok) {
        var cfg = await r.json();
        if (core.configValida(cfg)) { await guardarConfig(cfg).catch(function () {}); return cfg; }
      }
    } catch (e) { /* sin red: se usa la última configuración conocida */ }
    var guardada = await leerConfig().catch(function () { return null; });
    return core.configValida(guardada) ? guardada : null;
  }

  // ---------- operaciones de alto nivel ----------
  function nuevoId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  async function encolarSolicitud(datos) {
    var v = core.validarSolicitud(datos);
    if (!v.ok) return { ok: false, error: v.error };
    var item = core.nuevoPendiente(v.datos, Date.now(), nuevoId());
    await store.guardar(item);
    avisar({ tipo: 'cola' });
    return { ok: true, id: item.id };
  }

  async function resumen() { return core.resumenDeCola(await store.listar()); }

  async function descartar(id) { await store.borrar(id); avisar({ tipo: 'cola' }); }

  async function reintentar(id) {
    var it = await store.obtener(id);
    if (!it) return;
    it.estado = 'pendiente'; it.intentos = 0; it.proximoIntento = Date.now(); it.reclamadoEn = null; it.ultimoError = null;
    await store.guardar(it);
    avisar({ tipo: 'cola' });
  }

  async function enviar(datos) {
    var cfg = await obtenerConfig();
    if (!cfg) throw new TypeError('Failed to fetch: sin configuración');
    var p = core.peticionDeSolicitud(cfg, datos);
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var reloj = ctl ? setTimeout(function () { ctl.abort(); }, TIEMPO_ENVIO_MS) : null;
    try {
      var init = Object.assign({}, p.init, ctl ? { signal: ctl.signal } : {});
      var res = await fetch(p.url, init);
      var mensaje = '';
      if (!res.ok) { try { mensaje = (await res.text()).slice(0, 200); } catch (e) { /* sin cuerpo */ } }
      return { estado: res.status, mensaje: mensaje };
    } finally {
      if (reloj) clearTimeout(reloj);
    }
  }

  // opciones.forzar: ignora la espera entre intentos (botón "Enviar ahora")
  async function enviarPendientes(opciones) {
    var r = await core.procesarCola({ store: store, enviar: enviar, ahora: Date.now(), forzar: !!(opciones && opciones.forzar) });
    avisar({ tipo: 'cola', enviadas: r.enviadas });
    return r;
  }

  return {
    store: store,
    abrir: abrir,
    guardarConfig: guardarConfig,
    leerConfig: leerConfig,
    obtenerConfig: obtenerConfig,
    encolarSolicitud: encolarSolicitud,
    listar: store.listar,
    resumen: resumen,
    descartar: descartar,
    reintentar: reintentar,
    enviarPendientes: enviarPendientes,
    avisar: avisar
  };
});
