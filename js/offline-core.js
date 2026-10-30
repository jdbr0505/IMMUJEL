// offline-core.js – Reglas puras del modo sin conexión (sin DOM, sin red, sin IndexedDB).
// Las usan el Service Worker (importScripts), las páginas (window.OfflineCore) y Node para las pruebas.
//
// Qué decide:
//  - cómo se atiende cada petición (clasificar): páginas, archivos propios, bibliotecas externas, imágenes de publicaciones y
//    las pocas tablas públicas de Supabase que se pueden guardar; nada privado (solicitudes, perfiles…) se guarda jamás;
//  - la clave con la que se guardan esas lecturas, separada por cuenta para que nadie lea lo de otra persona;
//  - la cola de solicitudes que se envían solas al volver la conexión (validación, reintentos con espera, vigencia).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OfflineCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var HOSTS_CDN = ['cdn.tailwindcss.com', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'];
  var HOSTS_IMAGENES = ['images.unsplash.com'];
  // Solo contenido que ya es público por diseño (RLS): las publicaciones y la configuración visual.
  var TABLAS_PUBLICAS = ['publicaciones', 'configuracion_visual'];

  // Una solicitud guardada en el dispositivo se descarta pasado este tiempo (datos personales: no deben quedarse para siempre).
  var VIGENCIA_PENDIENTE_MS = 3 * 24 * 3600 * 1000;
  // Si un proceso reclamó una solicitud y no terminó (cerraron la pestaña), otro puede retomarla pasado este tiempo.
  var TTL_RECLAMO_MS = 2 * 60 * 1000;
  var ESPERAS_MS = [60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000, 3600 * 1000, 6 * 3600 * 1000, 12 * 3600 * 1000];

  var EXT_IMAGEN_O_FUENTE = /\.(png|webp|jpe?g|gif|avif|svg|ico|woff2?|ttf|eot)$/i;
  var EXT_CODIGO = /\.(css|js|json)$/i;

  function esSupabase(host) { return /\.supabase\.co$/i.test(host); }

  // 'navegacion' | 'estatico-versionado' | 'estatico' | 'config' | 'cdn' | 'imagen-externa' | 'datos-publicos' | 'ignorar'
  function clasificar(urlStr, metodo, modo, origenPropio) {
    if (String(metodo || 'GET').toUpperCase() !== 'GET') return 'ignorar';
    var u;
    try { u = new URL(urlStr); } catch (e) { return 'ignorar'; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'ignorar';
    var path = u.pathname;

    if (u.origin === origenPropio) {
      if (modo === 'navigate') return 'navegacion';
      if (path === '/api/config') return 'config';
      if (path.indexOf('/api/') === 0) return 'ignorar';
      if (EXT_IMAGEN_O_FUENTE.test(path)) return 'estatico-versionado';
      if (EXT_CODIGO.test(path)) return u.searchParams.has('v') ? 'estatico-versionado' : 'estatico';
      return 'ignorar';
    }

    if (HOSTS_CDN.indexOf(u.hostname) >= 0) return 'cdn';
    if (HOSTS_IMAGENES.indexOf(u.hostname) >= 0) return 'imagen-externa';
    if (esSupabase(u.hostname)) {
      if (path.indexOf('/storage/v1/object/public/') === 0) return 'imagen-externa';
      var m = /^\/rest\/v1\/([a-z_]+)$/.exec(path);
      if (m && TABLAS_PUBLICAS.indexOf(m[1]) >= 0) return 'datos-publicos';
    }
    return 'ignorar';
  }

  // '/navegacion/Programas.html?x=1' → '/navegacion/Programas'; '/index.html' → '/'. Vercel sirve las páginas sin .html y los
  // enlaces del sitio llevan .html: con esta clave las dos formas encuentran la misma página guardada.
  function rutaDePagina(urlStr) {
    var p = new URL(urlStr).pathname.replace(/\.html$/i, '');
    if (/\/index$/i.test(p)) p = p.replace(/\/index$/i, '/');
    if (p.length > 1) p = p.replace(/\/+$/, '');
    return p === '' ? '/' : p;
  }

  // ---------- claves de las lecturas guardadas ----------
  function decodificarJwt(token) {
    try {
      var partes = String(token).split('.');
      if (partes.length !== 3) return null;
      var b64 = partes[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      var bin = atob(b64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch (e) { return null; }
  }

  // 'a' (anónimo: el token es la clave pública), 'u:<id de la cuenta>' o null si no se puede saber de quién es.
  function nivelDeAcceso(apikey, authorization) {
    var m = authorization ? /^Bearer\s+(.+)$/i.exec(authorization) : null;
    var token = m ? m[1].trim() : null;
    if (!token) return 'a';
    if (apikey && token === apikey) return 'a';
    var payload = decodificarJwt(token);
    if (!payload || !payload.sub) return null;
    return 'u:' + payload.sub;
  }

  function claveConNivel(urlStr, nivel, h) {
    var sufijo = [nivel, h.get('accept') || '', h.get('prefer') || '', h.get('range') || ''].join('|');
    return urlStr + (urlStr.indexOf('?') >= 0 ? '&' : '?') + '__k=' + encodeURIComponent(sufijo);
  }

  // La clave no lleva el token. Es una dirección ficticia: solo identifica la entrada en la caché.
  function claveDeDatos(urlStr, headers) {
    var nivel = nivelDeAcceso(headers.get('apikey'), headers.get('authorization'));
    return nivel === null ? null : claveConNivel(urlStr, nivel, headers);
  }

  // Dónde buscar al estar sin conexión: primero lo de la propia cuenta, luego lo anónimo (que es público).
  function clavesDeLectura(urlStr, headers) {
    var nivel = nivelDeAcceso(headers.get('apikey'), headers.get('authorization'));
    if (nivel === null) return [];
    var claves = [claveConNivel(urlStr, nivel, headers)];
    if (nivel !== 'a') claves.push(claveConNivel(urlStr, 'a', headers));
    return claves;
  }

  // ---------- solicitud de asesoría ----------
  var RE_TELEFONO = /^[0-9+\-\s]{7,15}$/;
  var RE_CORREO = /^\S+@\S+\.\S+$/;
  var RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function texto(v, max) {
    if (v == null) return null;
    var s = String(v).trim();
    if (s === '') return null;
    return s.length > max ? undefined : s;
  }

  // Misma regla que Forms/form.js al enviar; deja solo las columnas conocidas y fija el estado.
  function validarSolicitud(d) {
    if (!d || typeof d !== 'object') return { ok: false, error: 'Faltan los datos de la solicitud.' };
    var telefono = String(d.telefono == null ? '' : d.telefono).trim();
    if (!RE_TELEFONO.test(telefono)) return { ok: false, error: 'El teléfono no es válido.' };
    var anonima = d.es_anonimo === true;
    var nombre = null, cedula = null, correo = null, parroquia = null;
    if (!anonima) {
      nombre = texto(d.nombre_completo, 200);
      if (!nombre || nombre.length < 3) return { ok: false, error: 'El nombre debe tener al menos 3 caracteres.' };
      parroquia = texto(d.parroquia, 100);
      if (!parroquia) return { ok: false, error: 'Falta la parroquia.' };
      cedula = texto(d.cedula, 20);
      if (cedula === undefined) return { ok: false, error: 'La cédula es demasiado larga.' };
      correo = texto(d.correo, 200);
      if (correo === undefined || (correo && !RE_CORREO.test(correo))) return { ok: false, error: 'El correo no es válido.' };
    }
    var descripcion = texto(d.descripcion, 5000);
    if (descripcion === undefined) return { ok: false, error: 'La descripción es demasiado larga.' };
    var usuario = d.usuario_id == null || d.usuario_id === '' ? null : String(d.usuario_id);
    if (usuario !== null && !RE_UUID.test(usuario)) return { ok: false, error: 'La cuenta no es válida.' };
    return {
      ok: true,
      datos: {
        usuario_id: usuario, nombre_completo: nombre, cedula: cedula, telefono: telefono, correo: correo,
        parroquia: parroquia, descripcion: descripcion, es_anonimo: anonima, estado: 'pendiente'
      }
    };
  }

  // Solo se envían datos a Supabase (https) o a localhost (pruebas), nunca a una dirección cualquiera.
  function configValida(cfg) {
    if (!cfg || typeof cfg.url !== 'string' || typeof cfg.anonKey !== 'string') return false;
    if (!/^[\x21-\x7E]{20,}$/.test(cfg.anonKey)) return false;
    var u;
    try { u = new URL(cfg.url); } catch (e) { return false; }
    if (u.protocol === 'https:' && esSupabase(u.hostname)) return true;
    return (u.protocol === 'http:' || u.protocol === 'https:') && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
  }

  function peticionDeSolicitud(cfg, datos) {
    return {
      url: cfg.url.replace(/\/+$/, '') + '/rest/v1/solicitudes',
      init: {
        method: 'POST',
        headers: { apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.anonKey, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify([datos])
      }
    };
  }

  // 'ok' | 'permanente' (datos o permisos mal: reintentar no ayuda) | 'pasajero' (servidor ocupado o sin conexión)
  function veredictoDeEstado(estado) {
    if (estado >= 200 && estado < 300) return 'ok';
    if (estado === 408 || estado === 425 || estado === 429) return 'pasajero';
    if (estado >= 400 && estado < 500) return 'permanente';
    return 'pasajero';
  }

  function proximoIntentoMs(intentos) {
    return ESPERAS_MS[Math.min(Math.max(intentos, 0), ESPERAS_MS.length - 1)];
  }

  function esErrorDeRed(e) {
    if (!e) return false;
    return /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(String(e.message || e));
  }

  // ---------- cola ----------
  function nuevoPendiente(datos, ahora, id) {
    return { id: id, tipo: 'solicitud', datos: datos, creadoEn: ahora, intentos: 0, proximoIntento: ahora, estado: 'pendiente', reclamadoEn: null, ultimoError: null };
  }

  // Lo que venció sin enviarse: los datos personales se borran, pero queda una marca para avisarle a la usuaria (estado 'vencida').
  function marcaDeVencida(it) {
    return { id: it.id, tipo: it.tipo, datos: null, creadoEn: it.creadoEn, intentos: it.intentos, proximoIntento: 0, estado: 'vencida', reclamadoEn: null, ultimoError: null };
  }

  function resumenDeCola(lista) {
    var r = { pendientes: 0, fallidas: 0, vencidas: 0, total: lista.length };
    lista.forEach(function (it) {
      if (it.estado === 'fallida') r.fallidas++;
      else if (it.estado === 'vencida') r.vencidas++;
      else r.pendientes++;
    });
    return r;
  }

  // Guarda el resultado de un intento solo si la solicitud sigue siendo la que este proceso reclamó: si mientras tanto la usuaria
  // la descartó (o la tomó otro proceso), no se vuelve a crear con sus datos personales.
  function guardarSiSigue(store, item, marca) {
    return store.guardarSiReclamada ? store.guardarSiReclamada(item, marca) : store.guardar(item);
  }

  // Envía lo que toque. `store`: listar/obtener/guardar/borrar/reclamar. `enviar(datos)` devuelve { estado, mensaje } o lanza si no hay red.
  // `forzar` (botón "Enviar ahora") ignora la espera entre intentos.
  async function procesarCola(op) {
    var store = op.store, enviar = op.enviar;
    var ahora = op.ahora == null ? Date.now() : op.ahora;
    var forzar = op.forzar === true;
    var res = { enviadas: 0, fallidas: 0, pendientes: 0, vencidas: 0 };

    var items = (await store.listar()).sort(function (a, b) { return a.creadoEn - b.creadoEn; });
    var elegibles = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.estado === 'vencida') continue; // solo queda la marca; la usuaria la descarta
      if (ahora - it.creadoEn > VIGENCIA_PENDIENTE_MS) { await store.guardar(marcaDeVencida(it)); res.vencidas++; continue; }
      if (it.estado === 'enviando' || (it.estado === 'pendiente' && (forzar || it.proximoIntento <= ahora))) elegibles.push(it);
    }

    for (var j = 0; j < elegibles.length; j++) {
      var r = await store.reclamar(elegibles[j].id, ahora, TTL_RECLAMO_MS);
      if (!r) continue; // otro proceso la tiene
      var marca = r.reclamadoEn;

      var v = validarSolicitud(r.datos);
      if (!v.ok) {
        r.estado = 'fallida'; r.reclamadoEn = null; r.ultimoError = 'Datos no válidos: ' + v.error;
        await guardarSiSigue(store, r, marca); res.fallidas++;
        continue;
      }

      var resp;
      try {
        resp = await enviar(v.datos);
      } catch (e) {
        // Sin red no se alarga la espera: se vuelve a intentar apenas haya señal de conexión (evento online, volver a la pestaña, abrir una página)
        r.estado = 'pendiente'; r.reclamadoEn = null; r.intentos++;
        r.proximoIntento = ahora; r.ultimoError = 'Sin conexión';
        await guardarSiSigue(store, r, marca);
        break; // lo más probable es que sigamos sin red: no se insiste con las demás
      }

      var veredicto = veredictoDeEstado(resp && resp.estado);
      if (veredicto === 'ok') {
        await store.borrar(r.id); res.enviadas++;
      } else if (veredicto === 'permanente') {
        r.estado = 'fallida'; r.reclamadoEn = null;
        r.ultimoError = 'Rechazada (' + resp.estado + ')' + (resp.mensaje ? ': ' + String(resp.mensaje).slice(0, 200) : '');
        await guardarSiSigue(store, r, marca); res.fallidas++;
      } else {
        r.estado = 'pendiente'; r.reclamadoEn = null; r.intentos++;
        r.proximoIntento = ahora + proximoIntentoMs(r.intentos - 1); r.ultimoError = 'Servidor no disponible (' + resp.estado + ')';
        await guardarSiSigue(store, r, marca);
        break;
      }
    }

    var restantes = await store.listar();
    res.pendientes = restantes.filter(function (x) { return x.estado !== 'fallida' && x.estado !== 'vencida'; }).length;
    return res;
  }

  return {
    HOSTS_CDN: HOSTS_CDN,
    TABLAS_PUBLICAS: TABLAS_PUBLICAS,
    VIGENCIA_PENDIENTE_MS: VIGENCIA_PENDIENTE_MS,
    TTL_RECLAMO_MS: TTL_RECLAMO_MS,
    clasificar: clasificar,
    rutaDePagina: rutaDePagina,
    nivelDeAcceso: nivelDeAcceso,
    claveDeDatos: claveDeDatos,
    clavesDeLectura: clavesDeLectura,
    validarSolicitud: validarSolicitud,
    configValida: configValida,
    peticionDeSolicitud: peticionDeSolicitud,
    veredictoDeEstado: veredictoDeEstado,
    proximoIntentoMs: proximoIntentoMs,
    esErrorDeRed: esErrorDeRed,
    nuevoPendiente: nuevoPendiente,
    resumenDeCola: resumenDeCola,
    procesarCola: procesarCola
  };
});
