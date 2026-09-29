// dashboard.js – Dashboard de asesorías IMMUJEL (solo admin / asesora).
// Lee únicamente columnas no personales de `solicitudes`: nunca cédula, teléfono, correo ni descripción.
(function () {
  'use strict';

  var M = window.DashboardMetrics;
  var C = window.DashboardCharts;

  var COLUMNAS = 'id, creado_en, estado, es_anonimo, parroquia, tipo_asesoria, asignada_a';
  var TAMANO_PAGINA = 1000;
  var MAX_PAGINAS = 20;
  var REFRESCO_MS = 60000;
  var PERIODOS = { '30': 30, '90': 90, '365': 365, all: null };
  var PERIODO_TEXTO = { '30': 'los últimos 30 días', '90': 'los últimos 90 días', '365': 'los últimos 12 meses', all: 'todo el histórico' };
  var PERIODO_COMPARA = { '30': 'vs. 30 días previos', '90': 'vs. 90 días previos', '365': 'vs. 12 meses previos' };

  var state = { rows: [], perfiles: {}, periodo: 'all', cargando: false, primeraVez: true, enVivo: false, ultima: null };
  var supabase = null;
  var nf = new Intl.NumberFormat('es-VE');

  function $(id) { return document.getElementById(id); }
  function setText(id, texto) { $(id).textContent = texto; }
  function plural(n, singular, pluralTxt) { return n === 1 ? singular : pluralTxt; }
  function pct(ratio) { return ratio === null ? '—' : Math.round(ratio * 100) + '%'; }

  // ===== Datos =====
  async function cargarSolicitudes() {
    var todas = [];
    for (var pagina = 0; pagina < MAX_PAGINAS; pagina++) {
      var desde = pagina * TAMANO_PAGINA;
      var res = await supabase
        .from('solicitudes')
        .select(COLUMNAS)
        .order('creado_en', { ascending: false })
        .order('id')
        .range(desde, desde + TAMANO_PAGINA - 1);
      if (res.error) throw res.error;
      todas = todas.concat(res.data);
      if (res.data.length < TAMANO_PAGINA) break;
    }
    return todas;
  }

  async function cargarAsesoras() {
    var res = await supabase.from('perfiles').select('id, nombre_completo, nombre_usuario').in('rol', ['admin', 'asesora']);
    if (res.error) throw res.error;
    var mapa = {};
    res.data.forEach(function (p) { mapa[p.id] = p.nombre_completo || p.nombre_usuario || 'Asesora'; });
    return mapa;
  }

  // ===== Render: KPIs =====
  function flecha(elemento, valor, tono, texto) {
    elemento.textContent = '';
    elemento.dataset.tone = tono;
    if (valor !== null && valor !== 0) {
      var icono = document.createElement('i');
      icono.className = 'fas ' + (valor > 0 ? 'fa-arrow-up' : 'fa-arrow-down');
      icono.setAttribute('aria-hidden', 'true');
      elemento.appendChild(icono);
    }
    elemento.appendChild(document.createTextNode(texto));
  }

  function renderTotal(k) {
    setText('kpi-total', nf.format(k.total));
    var delta = $('kpi-total-delta');
    if (state.periodo === 'all') return flecha(delta, null, 'flat', 'Acumulado histórico');
    if (k.variacionTotal === null) return flecha(delta, null, 'flat', 'Sin datos del periodo anterior');
    var v = Math.round(k.variacionTotal * 100);
    flecha(delta, k.variacionTotal, 'flat', Math.abs(v) + '% ' + PERIODO_COMPARA[state.periodo]);
  }

  function renderVencidas(k) {
    var tarjeta = $('kpi-vencidas-card');
    setText('kpi-vencidas', nf.format(k.pendientesVencidas));
    tarjeta.classList.toggle('kpi--alert', k.pendientesVencidas > 0);
    tarjeta.classList.toggle('kpi--ok', k.pendientesVencidas === 0);
    setText('kpi-vencidas-note', k.pendientesVencidas === 0
      ? 'Ninguna solicitud vencida hoy'
      : 'de ' + nf.format(k.pendientesTotal) + ' ' + plural(k.pendientesTotal, 'pendiente', 'pendientes') + ' en total, sin importar el periodo');
  }

  function renderTasa(k) {
    setText('kpi-tasa', pct(k.tasaFinalizacion));
    var delta = $('kpi-tasa-delta');
    if (state.periodo === 'all' || k.puntosTasa === null) {
      flecha(delta, null, 'flat', state.periodo === 'all' ? 'Acumulado histórico' : 'Sin datos del periodo anterior');
    } else {
      var puntos = Math.round(k.puntosTasa);
      flecha(delta, puntos, puntos > 0 ? 'good' : puntos < 0 ? 'bad' : 'flat', Math.abs(puntos) + ' pts ' + PERIODO_COMPARA[state.periodo]);
    }
    var fin = k.periodo.filter(function (r) { return r.estado === 'finalizado'; }).length;
    setText('kpi-tasa-note', nf.format(fin) + ' de ' + nf.format(k.total) + ' ' + plural(k.total, 'solicitud', 'solicitudes'));
  }

  function renderAnonimas(k) {
    setText('kpi-anon', pct(k.pctAnonimas));
    setText('kpi-anon-note', nf.format(k.anonimas) + ' de ' + nf.format(k.total) + ' ' + plural(k.total, 'solicitud', 'solicitudes'));
  }

  // ===== Render: titular =====
  function textoVariacion(v) {
    if (v === null) return '';
    if (v === 0) return ', igual que el periodo anterior';
    return ', ' + Math.round(Math.abs(v) * 100) + '% ' + (v > 0 ? 'más' : 'menos') + ' que el periodo anterior';
  }

  function renderHero(k) {
    var titular;
    if (state.rows.length === 0) {
      titular = 'Todavía no hay solicitudes registradas.';
    } else if (k.pendientesVencidas > 0) {
      var n = k.pendientesVencidas;
      titular = n + ' ' + plural(n, 'solicitud pendiente lleva', 'solicitudes pendientes llevan') + ' más de ' + M.DIAS_VENCIDA + ' días sin atención.';
    } else if (k.pendientesTotal > 0) {
      titular = 'Sin solicitudes vencidas: las ' + k.pendientesTotal + ' pendientes son de la última semana.';
    } else {
      titular = 'Todas las solicitudes registradas están atendidas.';
    }
    setText('hero-headline', titular);

    if (state.rows.length === 0) {
      setText('hero-detail', 'Cuando llegue la primera, este resumen se actualizará solo.');
    } else if (k.total === 0) {
      setText('hero-detail', 'No hubo solicitudes en ' + PERIODO_TEXTO[state.periodo] + '.');
    } else {
      setText('hero-detail', 'En ' + PERIODO_TEXTO[state.periodo] + ' se ' + plural(k.total, 'recibió ', 'recibieron ') + nf.format(k.total) + ' ' +
        plural(k.total, 'solicitud', 'solicitudes') + textoVariacion(k.variacionTotal) + '. ' + pct(k.pctAnonimas) + ' llegaron de forma anónima.');
    }
  }

  // ===== Render: estado, tabla =====
  function renderEstados(filas) {
    var items = M.porEstado(filas);
    var total = filas.length;
    var lista = $('estado-list');
    lista.textContent = '';
    items.forEach(function (item) {
      var fila = document.createElement('li');
      fila.className = 'estado-row';
      var nombre = document.createElement('span');
      nombre.className = 'estado-name';
      nombre.textContent = item.estado;
      var cuenta = document.createElement('span');
      cuenta.className = 'estado-count';
      cuenta.textContent = nf.format(item.cantidad) + ' ';
      var chico = document.createElement('small');
      chico.textContent = total ? Math.round((item.cantidad / total) * 100) + '%' : '—';
      cuenta.appendChild(chico);
      var pista = document.createElement('div');
      pista.className = 'estado-track';
      pista.setAttribute('aria-hidden', 'true');
      var relleno = document.createElement('div');
      relleno.className = 'estado-fill';
      relleno.dataset.estado = item.estado;
      relleno.style.width = total ? (item.cantidad / total) * 100 + '%' : '0%';
      pista.appendChild(relleno);
      fila.appendChild(nombre);
      fila.appendChild(cuenta);
      fila.appendChild(pista);
      lista.appendChild(fila);
    });

    var pendientes = items.filter(function (i) { return i.estado === 'pendiente'; })[0];
    var enProceso = items.filter(function (i) { return i.estado === 'en proceso'; })[0];
    var finalizadas = items.filter(function (i) { return i.estado === 'finalizado'; })[0];
    setText('estado-title', total === 0
      ? 'Sin solicitudes en este periodo'
      : pendientes.cantidad + ' ' + plural(pendientes.cantidad, 'pendiente', 'pendientes') + ' de ' + total + ' ' + plural(total, 'solicitud', 'solicitudes'));
    setText('estado-sub', nf.format(finalizadas.cantidad) + ' finalizadas · ' + nf.format(enProceso.cantidad) + ' en proceso');
  }

  function celda(fila, contenido, clase) {
    var td = document.createElement('td');
    if (clase) td.className = clase;
    if (typeof contenido === 'string') td.textContent = contenido;
    else td.appendChild(contenido);
    fila.appendChild(td);
    return td;
  }

  function textoTenue(texto) {
    var span = document.createElement('span');
    span.className = 'muted';
    span.textContent = texto;
    return span;
  }

  function chipEstado(estado) {
    var chip = document.createElement('span');
    chip.className = 'chip';
    chip.dataset.estado = estado;
    chip.textContent = estado;
    return chip;
  }

  function renderTabla(filas, ahora) {
    var cuerpo = $('recent-body');
    cuerpo.textContent = '';
    var recientes = M.recientes(filas, 10);
    if (recientes.length === 0) {
      var vacia = document.createElement('tr');
      var td = celda(vacia, textoTenue('Sin solicitudes en este periodo.'));
      td.colSpan = 6;
      cuerpo.appendChild(vacia);
      return;
    }
    recientes.forEach(function (r) {
      var tr = document.createElement('tr');
      celda(tr, new Date(r.creado_en).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' }));
      celda(tr, r.es_anonimo ? textoTenue('Anónima') : (r.parroquia || '—'));
      celda(tr, M.TIPOS[r.tipo_asesoria] || '—');
      celda(tr, chipEstado(r.estado));
      celda(tr, r.asignada_a ? (state.perfiles[r.asignada_a] || 'Asesora') : textoTenue('Sin asignar'));
      var abierta = r.estado === 'pendiente' || r.estado === 'en proceso';
      var dias = M.diasDesde(r, ahora);
      var tarde = r.estado === 'pendiente' && dias > M.DIAS_VENCIDA;
      celda(tr, abierta ? dias + (dias === 1 ? ' día' : ' días') : '—', 'num' + (tarde ? ' age-late' : ''));
      cuerpo.appendChild(tr);
    });
  }

  // ===== Render: gráficos =====
  function lideres(items) {
    return items.filter(function (i) { return i.cantidad === items[0].cantidad; });
  }

  function tituloLider(lista, vacio, unico, plural_) {
    if (lista.length === 0) return vacio;
    if (lista.length === 1) return unico(lista[0]);
    return lista.length + ' ' + plural_ + ' empatan con ' + lista[0].cantidad + ' ' + plural(lista[0].cantidad, 'solicitud', 'solicitudes');
  }

  function renderGraficos(k, ahora, animar) {
    if (typeof Chart === 'undefined') {
      mostrarError('No se pudo cargar la librería de gráficos. Recarga la página.');
      return;
    }
    var p = C.paleta();
    var filas = k.periodo;

    var serie = M.serieMensual(state.rows, ahora);
    var pico = serie.reduce(function (max, s) { return s.cantidad > max.cantidad ? s : max; }, serie[0]);
    setText('trend-title', pico.cantidad === 0 ? 'Aún no hay solicitudes en estos meses' : 'Más solicitudes en ' + pico.nombre + ': ' + nf.format(pico.cantidad));
    setText('trend-sub', 'Últimos ' + serie.length + ' meses. Es la serie histórica: el periodo elegido arriba no la modifica.');
    C.tendencia(serie, p, animar);
    C.sparkline($('kpi-spark'), serie);

    var parroquias = M.porParroquia(filas, 10);
    var topParroquias = lideres(parroquias.items);
    setText('parroquia-title', tituloLider(topParroquias, 'Sin solicitudes con parroquia en este periodo',
      function (l) { return l.etiqueta + ' es la parroquia con más solicitudes (' + l.cantidad + ')'; }, 'parroquias'));
    setText('parroquia-sub', parroquias.excluidas > 0
      ? 'No incluye ' + parroquias.excluidas + ' ' + plural(parroquias.excluidas, 'solicitud anónima', 'solicitudes anónimas') + ' (no registran parroquia).'
      : 'Solicitudes con parroquia registrada.');
    C.barras({ clave: 'parroquia', canvasId: 'chart-parroquia', cajaId: 'box-parroquia', items: parroquias.items, color: p.s1, paleta: p, animar: animar,
      mensajeVacio: 'Aún no hay solicitudes con parroquia.', descripcion: 'Gráfico de barras, solicitudes por parroquia' });

    var tipos = M.porTipo(filas);
    var clasificados = tipos.filter(function (t) { return t.etiqueta !== 'Sin tipo'; });
    var sinTipo = tipos.filter(function (t) { return t.etiqueta === 'Sin tipo'; })[0];
    setText('tipo-title', tipos.length === 0
      ? 'Sin solicitudes en este periodo'
      : tituloLider(lideres(clasificados), 'Ninguna solicitud tiene tipo de asesoría asignado',
        function (l) { return 'Asesoría ' + l.etiqueta.toLowerCase() + ' es la más solicitada entre las clasificadas (' + l.cantidad + ')'; }, 'tipos de asesoría'));
    setText('tipo-sub', sinTipo
      ? nf.format(sinTipo.cantidad) + ' ' + plural(sinTipo.cantidad, 'solicitud aún sin clasificar', 'solicitudes aún sin clasificar') + '.'
      : 'Todas las solicitudes están clasificadas.');
    C.barras({ clave: 'tipo', canvasId: 'chart-tipo', cajaId: 'box-tipo', items: tipos, color: p.s2, paleta: p, animar: animar,
      mensajeVacio: 'Aún no hay solicitudes.', descripcion: 'Gráfico de barras, solicitudes por tipo de asesoría' });

    var asesoras = M.porAsesora(filas, state.perfiles);
    setText('asesora-title', filas.length === 0
      ? 'Sin solicitudes en este periodo'
      : asesoras.sinAsignar > 0
        ? asesoras.sinAsignar + ' ' + plural(asesoras.sinAsignar, 'solicitud sin asesora asignada', 'solicitudes sin asesora asignada')
        : 'Todas las solicitudes tienen asesora asignada');
    setText('asesora-sub', 'Solicitudes según la asesora responsable.');
    C.barras({ clave: 'asesora', canvasId: 'chart-asesora', cajaId: 'box-asesora', items: asesoras.items, color: p.s1, paleta: p, animar: animar,
      mensajeVacio: 'Aún no hay solicitudes.', descripcion: 'Gráfico de barras, solicitudes por asesora' });
  }

  function render(animar) {
    var ahora = new Date();
    var k = M.kpis(state.rows, PERIODOS[state.periodo], ahora);
    renderHero(k);
    renderTotal(k);
    renderVencidas(k);
    renderTasa(k);
    renderAnonimas(k);
    renderEstados(k.periodo);
    renderTabla(k.periodo, ahora);
    renderGraficos(k, ahora, animar);
    document.body.classList.remove('dash-loading');
  }

  // ===== Estado de carga / errores =====
  function mostrarError(mensaje) {
    setText('dash-error-msg', mensaje);
    $('dash-error').hidden = false;
  }

  function ocultarError() { $('dash-error').hidden = true; }

  function etiquetaActualizacion(fecha) {
    var hora = fecha.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
    return 'Actualizado ' + hora + (state.enVivo ? ' · en vivo' : ' · se refresca cada minuto');
  }

  async function actualizar(manual) {
    if (state.cargando) return;
    state.cargando = true;
    $('btn-refresh').setAttribute('aria-busy', 'true');
    try {
      var resultado = await Promise.all([cargarSolicitudes(), cargarAsesoras()]);
      state.rows = resultado[0];
      state.perfiles = resultado[1];
      ocultarError();
      render(state.primeraVez);
      state.primeraVez = false;
      state.ultima = new Date();
      setText('updated-label', etiquetaActualizacion(state.ultima));
      if (manual) setText('sr-live', 'Datos actualizados.');
    } catch (err) {
      console.error('dashboard: error al cargar datos', err);
      mostrarError(state.rows.length
        ? 'No se pudo actualizar. Se muestran los últimos datos cargados.'
        : 'No se pudieron cargar los datos. Revisa tu conexión e inténtalo de nuevo.');
      setText('updated-label', 'Sin conexión con los datos');
    } finally {
      state.cargando = false;
      $('btn-refresh').setAttribute('aria-busy', 'false');
    }
  }

  // ===== Controles =====
  function periodoInicial() {
    var valor = new URLSearchParams(window.location.search).get('periodo');
    return Object.prototype.hasOwnProperty.call(PERIODOS, valor) ? valor : 'all';
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
    if (state.rows.length || !state.primeraVez) render(false);
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
    var toggle = $('theme-toggle');
    if (toggle) toggle.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle.click(); }
    });
  }

  // ===== Actualización automática =====
  function debounce(fn, ms) {
    var t;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  function suscribirTiempoReal() {
    try {
      supabase.channel('dashboard-solicitudes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitudes' }, debounce(function () { actualizar(false); }, 800))
        .subscribe(function (estado) {
          state.enVivo = estado === 'SUBSCRIBED';
          $('live-dot').dataset.live = String(state.enVivo);
          if (state.ultima) setText('updated-label', etiquetaActualizacion(state.ultima));
        });
    } catch (err) {
      console.warn('dashboard: tiempo real no disponible, se usa refresco periódico', err);
    }
  }

  function programarRefresco() {
    setInterval(function () {
      if (document.visibilityState === 'visible') actualizar(false);
    }, REFRESCO_MS);
  }

  function observarTema() {
    var pendiente = false;
    var oscuro = document.body.classList.contains('dark-theme');
    var recolorear = function () {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(function () {
        pendiente = false;
        if (state.rows.length) render(false);
      });
    };
    new MutationObserver(function () {
      var ahoraOscuro = document.body.classList.contains('dark-theme');
      if (ahoraOscuro === oscuro) return;
      oscuro = ahoraOscuro;
      recolorear();
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    var obs = new MutationObserver(recolorear);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme-event'] });
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

    enlazarControles();
    seleccionarPeriodo(periodoInicial(), false);
    observarTema();
    await actualizar(false);
    suscribirTiempoReal();
    programarRefresco();
  }

  document.addEventListener('DOMContentLoaded', iniciar);
})();
