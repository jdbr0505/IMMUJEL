// offline-ui.js – Lo que ve la usuaria cuando falla la conexión: aviso de estado, solicitudes guardadas y envío automático.
// Va en las páginas públicas después de offline-core.js y offline-db.js.
//  - Aviso arriba de la página mientras no hay conexión (y al volver).
//  - Al volver la conexión, al abrir una página con internet o al regresar a la pestaña se envían las solicitudes guardadas;
//    en navegadores con Sincronización en segundo plano también se envían con la pestaña cerrada (lo hace sw.js).
//  - En el formulario de asesoría (#solicitudes-pendientes) se listan las guardadas, con "Enviar ahora", "Reintentar" y "Descartar".
(function () {
  var Core = window.OfflineCore;
  var DB = window.OfflineDB;
  if (!Core || !DB) return;

  var barra = null;
  var temporizador = null;
  var panel = null;
  var enviando = false;

  function crearEstilos() {
    var s = document.createElement('style');
    s.textContent =
      '#estado-conexion{position:relative;z-index:60;padding:.5rem 1rem;font:600 .875rem/1.4 "Segoe UI",Arial,sans-serif;text-align:center}' +
      '#estado-conexion[data-tipo="sin-conexion"],#estado-conexion[data-tipo="pendiente"]{background:#fef3c7;color:#78350f;border-bottom:1px solid #fcd34d}' +
      '#estado-conexion[data-tipo="restablecida"]{background:#dcfce7;color:#14532d;border-bottom:1px solid #86efac}' +
      '#solicitudes-pendientes .pend-item{border:1px solid #e9d5ff;border-radius:.75rem;padding:.75rem 1rem;margin-bottom:.5rem;background:#faf5ff;color:#1f2937}' +
      '#solicitudes-pendientes .pend-item[data-estado="fallida"]{border-color:#fca5a5;background:#fef2f2}' +
      '#solicitudes-pendientes .pend-titulo{font-weight:700;font-size:.9rem}' +
      '#solicitudes-pendientes .pend-detalle{font-size:.8125rem;color:#4b5563;margin:.125rem 0 .5rem}' +
      '#solicitudes-pendientes .pend-acciones{display:flex;gap:.5rem;flex-wrap:wrap}' +
      '#solicitudes-pendientes button{font:600 .8125rem "Segoe UI",Arial,sans-serif;padding:.375rem .875rem;border-radius:9999px;border:1px solid #7d0585;background:#fff;color:#7d0585;cursor:pointer}' +
      '#solicitudes-pendientes button:hover{background:#f6e9fb}' +
      '#solicitudes-pendientes button[data-accion="descartar"]{border-color:#9ca3af;color:#4b5563}' +
      '@media (prefers-reduced-motion:no-preference){#estado-conexion{transition:opacity .2s}}';
    document.head.appendChild(s);
  }

  function mostrarAviso(tipo, texto, duracionMs) {
    if (!barra) {
      barra = document.createElement('div');
      barra.id = 'estado-conexion';
      barra.setAttribute('role', 'status');
      barra.setAttribute('aria-live', 'polite');
      var primero = document.body.firstElementChild;
      var tras = primero && primero.classList.contains('skip-link') ? primero.nextSibling : document.body.firstChild;
      document.body.insertBefore(barra, tras);
    }
    barra.dataset.tipo = tipo;
    barra.textContent = texto;
    clearTimeout(temporizador);
    if (duracionMs) temporizador = setTimeout(function () { quitarAviso(); actualizarEstado(); }, duracionMs);
  }

  function quitarAviso() {
    if (barra && barra.parentNode) barra.parentNode.removeChild(barra);
    barra = null;
  }

  function textoDePendientes(n) {
    return n === 1 ? ' Tienes 1 solicitud guardada: se enviará sola al volver la conexión.' : ' Tienes ' + n + ' solicitudes guardadas: se enviarán solas al volver la conexión.';
  }

  // Con conexión, lo que sigue sin enviarse se avisa en todas las páginas (en el formulario ya está el panel con los botones)
  function textoSinEnviar(r) {
    var partes = [];
    if (r.pendientes) partes.push(r.pendientes === 1 ? 'Tienes 1 solicitud guardada sin enviar.' : 'Tienes ' + r.pendientes + ' solicitudes guardadas sin enviar.');
    if (r.fallidas) partes.push('No pudimos enviar una solicitud guardada.');
    if (r.vencidas) partes.push('Una solicitud guardada venció sin enviarse.');
    partes.push(r.vencidas && !r.pendientes && !r.fallidas
      ? 'Vuelve a llenar el formulario de asesoría.'
      : 'Abre «Solicitar asesoría» con conexión para enviarla, reintentarla o descartarla.');
    return partes.join(' ');
  }

  async function actualizarEstado() {
    var r = { pendientes: 0, fallidas: 0, vencidas: 0 };
    try { r = await DB.resumen(); } catch (e) { /* IndexedDB no disponible (modo privado antiguo): se sigue sin cola */ }
    if (!navigator.onLine) {
      mostrarAviso('sin-conexion', 'Sin conexión. Puedes seguir leyendo lo que ya visitaste.' + (r.pendientes ? textoDePendientes(r.pendientes) : ''));
    } else if (!document.getElementById('solicitudes-pendientes') && (r.pendientes || r.fallidas || r.vencidas)) {
      if (!barra || barra.dataset.tipo === 'pendiente') mostrarAviso('pendiente', textoSinEnviar(r));
    } else if (barra && barra.dataset.tipo === 'pendiente') {
      quitarAviso();
    }
    pintarPanel();
    return r;
  }

  // ---------- panel de solicitudes guardadas (formulario) ----------
  function fechaCorta(ms) {
    try { return new Date(ms).toLocaleString('es-VE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; }
  }

  function boton(texto, accion, id) {
    var b = document.createElement('button');
    b.type = 'button'; b.dataset.accion = accion; b.dataset.id = id; b.textContent = texto;
    return b;
  }

  async function pintarPanel() {
    panel = panel || document.getElementById('solicitudes-pendientes');
    if (!panel) return;
    var lista = [];
    try { lista = await DB.listar(); } catch (e) { /* sin IndexedDB */ }
    lista.sort(function (a, b) { return a.creadoEn - b.creadoEn; });
    panel.textContent = '';
    panel.hidden = lista.length === 0;
    lista.forEach(function (it) {
      var caja = document.createElement('div');
      caja.className = 'pend-item';
      var vencida = it.estado === 'vencida';
      var fallida = it.estado === 'fallida';
      caja.dataset.estado = vencida || fallida ? 'fallida' : 'pendiente';
      var titulo = document.createElement('div');
      titulo.className = 'pend-titulo';
      titulo.textContent = vencida ? 'Una solicitud guardada venció sin enviarse'
        : fallida ? 'No pudimos enviar una solicitud guardada' : 'Solicitud guardada en este dispositivo';
      var detalle = document.createElement('div');
      detalle.className = 'pend-detalle';
      detalle.textContent = vencida
        ? 'Guardada el ' + fechaCorta(it.creadoEn) + '. No se pudo enviar en 3 días y sus datos se borraron de este dispositivo. Vuelve a llenar el formulario.'
        : fallida
          ? 'Guardada el ' + fechaCorta(it.creadoEn) + '. ' + (it.ultimoError || '') + ' Puedes reintentar o descartarla.'
          : 'Guardada el ' + fechaCorta(it.creadoEn) + '. Se envía sola al volver la conexión; si prefieres, puedes enviarla ahora o descartarla.';
      var acciones = document.createElement('div');
      acciones.className = 'pend-acciones';
      if (!vencida) acciones.appendChild(boton(fallida ? 'Reintentar' : 'Enviar ahora', fallida ? 'reintentar' : 'enviar', it.id));
      acciones.appendChild(boton(vencida ? 'Entendido' : 'Descartar', vencida ? 'cerrar' : 'descartar', it.id));
      caja.appendChild(titulo); caja.appendChild(detalle); caja.appendChild(acciones);
      panel.appendChild(caja);
    });
  }

  async function alPulsarPanel(e) {
    var b = e.target.closest('button[data-accion]');
    if (!b) return;
    var id = b.dataset.id;
    if (b.dataset.accion === 'cerrar') {
      await DB.descartar(id); // la marca de una solicitud vencida ya no tiene datos personales: no pide confirmación
    } else if (b.dataset.accion === 'descartar') {
      if (!confirm('¿Descartar esta solicitud guardada? No se enviará y se borrará de este dispositivo.')) return;
      await DB.descartar(id);
    } else {
      if (b.dataset.accion === 'reintentar') await DB.reintentar(id);
      await enviarAhora(true);
    }
    actualizarEstado();
  }

  // ---------- envío ----------
  // Devuelve true si el navegador enviará la solicitud aunque se cierre la página (Sincronización en segundo plano)
  async function registrarSincronizacion() {
    try {
      if (!('serviceWorker' in navigator)) return false;
      // `ready` no se resuelve nunca si no hay Service Worker registrado: no se espera más de 2 s
      var reg = await Promise.race([navigator.serviceWorker.ready, new Promise(function (r) { setTimeout(function () { r(null); }, 2000); })]);
      if (reg && reg.sync) { await reg.sync.register('enviar-solicitudes'); return true; }
    } catch (e) { /* sin Sincronización en segundo plano: se envía al abrir una página o al volver la conexión */ }
    return false;
  }

  async function enviarAhora(avisarResultado) {
    if (enviando) return null;
    enviando = true;
    try {
      var antes = await DB.resumen();
      if (!antes.pendientes) return null;
      var r = await DB.enviarPendientes({ forzar: avisarResultado === true });
      if (r.enviadas > 0) {
        mostrarAviso('restablecida', r.enviadas === 1 ? 'Tu solicitud guardada se envió. Pronto nos pondremos en contacto contigo.' : 'Se enviaron ' + r.enviadas + ' solicitudes guardadas. Pronto nos pondremos en contacto contigo.', 8000);
      } else if (avisarResultado && !navigator.onLine) {
        mostrarAviso('sin-conexion', 'Todavía no hay conexión: la solicitud sigue guardada y se enviará sola.');
      }
      return r;
    } catch (e) {
      console.error('No se pudieron enviar las solicitudes guardadas:', e);
      return null;
    } finally {
      enviando = false;
      actualizarEstado();
    }
  }

  function alVolverLaConexion() {
    mostrarAviso('restablecida', 'Conexión restablecida.', 3500);
    enviarAhora(false).then(actualizarEstado);
    // La configuración de Supabase se renueva para que el envío en segundo plano la tenga a mano
    DB.obtenerConfig().catch(function () {});
  }

  function iniciar() {
    crearEstilos();
    panel = document.getElementById('solicitudes-pendientes');
    if (panel) panel.addEventListener('click', alPulsarPanel);

    window.addEventListener('offline', actualizarEstado);
    window.addEventListener('online', alVolverLaConexion);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && navigator.onLine) enviarAhora(false).then(actualizarEstado);
    });
    try {
      var canal = new BroadcastChannel('immujel-offline');
      canal.onmessage = function () { actualizarEstado(); };
    } catch (e) { /* sin BroadcastChannel */ }

    actualizarEstado();
    if (navigator.onLine) {
      DB.obtenerConfig().catch(function () {});
      enviarAhora(false);
    }
  }

  window.OfflineUI = { actualizarEstado: actualizarEstado, enviarAhora: enviarAhora, registrarSincronizacion: registrarSincronizacion, pintarPanel: pintarPanel };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
