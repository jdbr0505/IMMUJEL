// dashboard.js – Dashboard IMMUJEL (solo admin / asesora): carga de datos, controles,
// actualización en vivo, exportar e imprimir. Los cálculos viven en dashboard-metrics.js
// y el dibujo en dashboard-render*.js.
//
// Privacidad: de `solicitudes` solo se leen columnas no personales (nunca cédula, teléfono,
// correo ni descripción); de `perfiles`, solo rol y fecha de registro.
(function () {
  'use strict';

  var M = window.DashboardMetrics;
  var X = window.DashboardExport;
  var C = window.DashboardCharts;
  var U = window.DashboardUI;
  var R = window.DashboardRender;
  var RX = window.DashboardRenderExtra;
  var $ = U.$;
  var setText = U.setText;

  var TAMANO_PAGINA = 1000;
  var MAX_PAGINAS = 20;
  var REFRESCO_MS = 60000;

  // Se prueba cada lista en orden: si la base aún no tiene una columna, se usa la siguiente.
  var COLUMNAS = {
    solicitudes: [
      'id, creado_en, estado, es_anonimo, parroquia, tipo_asesoria, asignada_a, finalizado_en',
      'id, creado_en, estado, es_anonimo, parroquia, tipo_asesoria, asignada_a'
    ],
    perfiles: ['rol, created_at', 'rol, creado_en', 'rol'],
    publicaciones: ['tipo, publicado, fecha_publicacion, creado_en', 'tipo, publicado, creado_en']
  };
  var ORDEN = {
    solicitudes: [['creado_en', false], ['id', true]],
    perfiles: [['id', true]],
    publicaciones: [['id', true]]
  };

  var state = {
    solicitudes: [],
    equipo: {},
    perfiles: null,
    publicaciones: null,
    errores: { equipo: false, usuarias: false, publicaciones: false },
    columnas: {},
    tieneCierre: false,
    esAdmin: false,
    periodo: 'all',
    cargando: false,
    primeraVez: true,
    enVivo: false,
    ultima: null,
    vista: null
  };
  var supabase = null;

  // ===== Carga de datos =====
  function columnaInexistente(error) {
    return !!error && (error.code === '42703' || /column .* does not exist/i.test(error.message || ''));
  }

  async function leerTodo(tabla, columnas) {
    var todas = [];
    for (var pagina = 0; pagina < MAX_PAGINAS; pagina++) {
      var desde = pagina * TAMANO_PAGINA;
      var consulta = supabase.from(tabla).select(columnas);
      ORDEN[tabla].forEach(function (o) { consulta = consulta.order(o[0], { ascending: o[1] }); });
      var res = await consulta.range(desde, desde + TAMANO_PAGINA - 1);
      if (res.error) throw res.error;
      todas = todas.concat(res.data);
      if (res.data.length < TAMANO_PAGINA) break;
    }
    return todas;
  }

  async function cargarTabla(tabla) {
    var listas = COLUMNAS[tabla];
    for (var i = state.columnas[tabla] || 0; i < listas.length; i++) {
      try {
        var filas = await leerTodo(tabla, listas[i]);
        state.columnas[tabla] = i;
        return { filas: filas, columnas: listas[i] };
      } catch (err) {
        if (!columnaInexistente(err) || i === listas.length - 1) throw err;
      }
    }
  }

  async function cargarEquipo() {
    var res = await supabase.from('perfiles').select('id, nombre_completo, nombre_usuario').in('rol', ['admin', 'asesora']);
    if (res.error) throw res.error;
    var mapa = {};
    res.data.forEach(function (p) { mapa[p.id] = p.nombre_completo || p.nombre_usuario || 'Asesora'; });

    // El personal de asesorías también puede ser responsable de un caso aunque su rol sea "usuaria" (las defensoras, por
    // ejemplo). Si la tabla todavía no existe o falla, se sigue con los nombres de arriba: es solo un complemento.
    var personal = await supabase.from('personal_asesoria').select('perfil:perfiles!perfil_id(id, nombre_completo, nombre_usuario)');
    if (!personal.error && personal.data) {
      personal.data.forEach(function (fila) {
        var p = fila.perfil;
        if (p && !mapa[p.id]) mapa[p.id] = p.nombre_completo || p.nombre_usuario || 'Asesora';
      });
    }
    return mapa;
  }

  function normalizarPerfiles(filas) {
    return filas.map(function (f) { return { rol: f.rol || 'usuaria', creado_en: f.created_at || f.creado_en || null }; });
  }

  function normalizarPublicaciones(filas) {
    return filas.map(function (f) {
      return { tipo: f.tipo, publicado: f.publicado === true, fecha: f.fecha_publicacion || f.creado_en || null };
    });
  }

  // Solo las solicitudes son imprescindibles: si fallan, se informa el error; lo demás degrada por sección.
  async function cargarTodo() {
    var r = await Promise.allSettled([
      cargarTabla('solicitudes'),
      cargarEquipo(),
      state.esAdmin ? cargarTabla('perfiles') : Promise.resolve(null),
      cargarTabla('publicaciones')
    ]);
    if (r[0].status === 'rejected') throw r[0].reason;

    state.solicitudes = r[0].value.filas;
    state.tieneCierre = /finalizado_en/.test(r[0].value.columnas);
    if (r[1].status === 'fulfilled') state.equipo = r[1].value;
    state.perfiles = r[2].status === 'fulfilled' && r[2].value ? normalizarPerfiles(r[2].value.filas) : null;
    state.publicaciones = r[3].status === 'fulfilled' ? normalizarPublicaciones(r[3].value.filas) : null;
    state.errores = {
      equipo: r[1].status === 'rejected',
      usuarias: r[2].status === 'rejected',
      publicaciones: r[3].status === 'rejected'
    };
    r.slice(1).forEach(function (x) { if (x.status === 'rejected') console.error('dashboard: no se pudo cargar una sección', x.reason); });
  }

  // ===== Pintar =====
  function mostrarError(mensaje) {
    setText('dash-error-msg', mensaje);
    $('dash-error').hidden = false;
  }

  function ocultarError() { $('dash-error').hidden = true; }

  // Si la primera carga falla, los marcadores de carga se reemplazan por un estado claro en vez de quedar como bloques vacíos.
  var CIFRAS = ['kpi-total', 'kpi-vencidas', 'kpi-tasa', 'kpi-anon', 'resol-valor', 'usu-registradas', 'usu-nuevas', 'usu-equipo', 'pub-publicadas', 'pub-borradores', 'pub-ultima'];

  function mostrarSinDatos() {
    CIFRAS.forEach(function (id) { setText(id, U.SIN_DATO); });
    setText('hero-headline', 'No se pudo cargar el resumen.');
    setText('hero-detail', 'Pulsa Reintentar cuando tengas conexión.');
    document.body.classList.remove('dash-loading');
  }

  function avisarFallosParciales() {
    var fallidos = [];
    if (state.errores.usuarias) fallidos.push('usuarias');
    if (state.errores.publicaciones) fallidos.push('publicaciones');
    if (state.errores.equipo) fallidos.push('nombres de asesoras');
    if (fallidos.length === 0) return ocultarError();
    mostrarError('No se pudieron cargar: ' + fallidos.join(', ') + '. El resto del dashboard está al día.');
  }

  function pintar(animar) {
    var ahora = new Date();
    var vista = M.construirVista({
      solicitudes: state.solicitudes,
      equipo: state.equipo,
      perfiles: state.perfiles,
      publicaciones: state.publicaciones,
      periodoDias: U.DIAS_PERIODO[state.periodo],
      ahora: ahora
    });
    state.vista = vista;

    var ctx = {
      periodo: state.periodo,
      equipo: state.equipo,
      tieneCierre: state.tieneCierre,
      errores: state.errores,
      animar: animar,
      ahora: ahora,
      paleta: C.paleta()
    };
    var graficosOk = R.asesorias(vista, ctx);
    if (state.esAdmin) RX.usuarias(vista, ctx);
    RX.publicaciones(vista, ctx);
    if (!graficosOk) mostrarError('No se pudo cargar la librería de gráficos. Recarga la página.');
    document.body.classList.remove('dash-loading');
  }

  function etiquetaActualizacion(fecha) {
    var hora = fecha.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
    return 'Actualizado ' + hora + (state.enVivo ? ' · en vivo' : ' · se refresca cada minuto');
  }

  async function actualizar(manual) {
    if (state.cargando) return;
    state.cargando = true;
    if (manual) state.columnas = {};
    $('btn-refresh').setAttribute('aria-busy', 'true');
    try {
      await cargarTodo();
      state.ultima = new Date();
      avisarFallosParciales();
      pintar(state.primeraVez);
      state.primeraVez = false;
      setText('updated-label', etiquetaActualizacion(state.ultima));
      if (manual) setText('sr-live', 'Datos actualizados.');
    } catch (err) {
      console.error('dashboard: error al cargar datos', err);
      mostrarError(state.ultima
        ? 'No se pudo actualizar. Se muestran los últimos datos cargados.'
        : 'No se pudieron cargar los datos. Revisa tu conexión e inténtalo de nuevo.');
      if (!state.ultima) mostrarSinDatos();
      setText('updated-label', 'Sin conexión con los datos');
    } finally {
      state.cargando = false;
      $('btn-refresh').setAttribute('aria-busy', 'false');
    }
  }

  // ===== Controles =====
  function periodoInicial() {
    var valor = new URLSearchParams(window.location.search).get('periodo');
    return Object.prototype.hasOwnProperty.call(U.DIAS_PERIODO, valor) ? valor : 'all';
  }

  function seleccionarPeriodo(valor, enfocar) {
    state.periodo = valor;
    document.querySelectorAll('#periodo-control button').forEach(function (b) {
      var activo = b.dataset.periodo === valor;
      b.setAttribute('aria-checked', String(activo));
      b.tabIndex = activo ? 0 : -1;
      if (activo && enfocar) b.focus();
    });
    var url = new URL(window.location.href);
    if (valor === 'all') url.searchParams.delete('periodo');
    else url.searchParams.set('periodo', valor);
    window.history.replaceState(null, '', url);
    if (state.ultima) pintar(false);
  }

  function exportarCsv() {
    if (!state.vista) return;
    var ahora = new Date();
    var csv = X.construirCsv(X.bloquesDesdeVista(state.vista, {
      periodoTexto: U.PERIODO_TEXTO[state.periodo],
      generado: ahora,
      incluirUsuarias: state.esAdmin
    }));
    X.descargar(csv, X.nombreArchivo(ahora, state.periodo));
    setText('sr-live', 'Resumen descargado.');
  }

  // Al imprimir se fuerza el tema claro (papel) y se redibujan los gráficos con esos colores.
  var enImpresion = false;
  var eraOscuro = false;

  function prepararImpresion() {
    if (enImpresion) return;
    enImpresion = true;
    eraOscuro = document.body.classList.contains('dark-theme');
    document.body.classList.remove('dark-theme');
    var ahora = new Date();
    setText('print-meta', 'Periodo: ' + U.PERIODO_TEXTO[state.periodo] + ' · Generado el ' +
      ahora.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' a las ' +
      ahora.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }));
    if (state.ultima) pintar(false);
  }

  function restaurarTema() {
    if (!enImpresion) return;
    enImpresion = false;
    if (eraOscuro) document.body.classList.add('dark-theme');
    eraOscuro = false;
  }

  function enlazarControles() {
    var botones = Array.prototype.slice.call(document.querySelectorAll('#periodo-control button'));
    botones.forEach(function (b, i) {
      b.addEventListener('click', function () { seleccionarPeriodo(b.dataset.periodo, false); });
      b.addEventListener('keydown', function (e) {
        var salto = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (!salto) return;
        e.preventDefault();
        seleccionarPeriodo(botones[(i + salto + botones.length) % botones.length].dataset.periodo, true);
      });
    });
    $('btn-refresh').addEventListener('click', function () { actualizar(true); });
    $('dash-error-retry').addEventListener('click', function () { actualizar(true); });
    $('btn-csv').addEventListener('click', exportarCsv);
    $('btn-print').addEventListener('click', function () { window.print(); });
    window.addEventListener('beforeprint', prepararImpresion);
    window.addEventListener('afterprint', restaurarTema);

    var toggle = $('theme-toggle');
    if (toggle) toggle.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle.click(); }
    });
  }

  // Igual que en Admin.js: Usuarias y Estilo son solo para administradoras.
  function mostrarSeccionesPorRol() {
    $('usuarias').hidden = !state.esAdmin;
    $('jump-usuarias').hidden = !state.esAdmin;
    ['tab-usuarios', 'tab-estilo'].forEach(function (id) { $(id).classList.toggle('hidden', !state.esAdmin); });
  }

  // ===== Actualización automática =====
  function debounce(fn, ms) {
    var t;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  function suscribirTiempoReal() {
    try {
      var refrescar = debounce(function () { actualizar(false); }, 800);
      var canal = supabase.channel('dashboard-cambios');
      ['solicitudes', 'publicaciones'].concat(state.esAdmin ? ['perfiles'] : []).forEach(function (tabla) {
        canal = canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla }, refrescar);
      });
      canal.subscribe(function (estado) {
        state.enVivo = estado === 'SUBSCRIBED';
        $('live-dot').dataset.live = String(state.enVivo);
        if (state.ultima) setText('updated-label', etiquetaActualizacion(state.ultima));
      });
    } catch (err) {
      console.warn('dashboard: tiempo real no disponible, se usa el refresco periódico', err);
    }
  }

  function programarRefresco() {
    setInterval(function () {
      if (document.visibilityState === 'visible') actualizar(false);
    }, REFRESCO_MS);
    document.addEventListener('visibilitychange', function () {
      var vencido = state.ultima && Date.now() - state.ultima.getTime() > REFRESCO_MS;
      if (document.visibilityState === 'visible' && vencido) actualizar(false);
    });
  }

  function observarTema() {
    var pendiente = false;
    var oscuro = document.body.classList.contains('dark-theme');
    var recolorear = function () {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(function () {
        pendiente = false;
        if (state.ultima && !enImpresion) pintar(false);
      });
    };
    new MutationObserver(function () {
      var ahoraOscuro = document.body.classList.contains('dark-theme');
      if (ahoraOscuro === oscuro) return;
      oscuro = ahoraOscuro;
      recolorear();
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    new MutationObserver(recolorear).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme-event'] });
  }

  // ===== Arranque =====
  async function iniciar() {
    supabase = await window.supabaseReady;

    var sesion = await supabase.auth.getUser();
    if (sesion.error || !sesion.data.user) {
      window.location.href = '../Login/login.html';
      return;
    }
    var perfil = await supabase.from('perfiles').select('rol').eq('id', sesion.data.user.id).single();
    if (perfil.error || !perfil.data || (perfil.data.rol !== 'admin' && perfil.data.rol !== 'asesora')) {
      window.location.href = '../index.html';
      return;
    }
    state.esAdmin = perfil.data.rol === 'admin';

    mostrarSeccionesPorRol();
    enlazarControles();
    seleccionarPeriodo(periodoInicial(), false);
    observarTema();
    await actualizar(false);
    suscribirTiempoReal();
    programarRefresco();
  }

  document.addEventListener('DOMContentLoaded', iniciar);
})();
