// dashboard-render.js – Pinta la sección de asesorías a partir de la vista calculada (DashboardMetrics.construirVista).
(function () {
  'use strict';

  var M = window.DashboardMetrics;
  var C = window.DashboardCharts;
  var U = window.DashboardUI;
  var $ = U.$;
  var setText = U.setText;
  var plural = U.plural;
  var pct = U.pct;
  var nf = U.nf;
  var nodo = U.nodo;

  // ===== Titular =====
  function titularHero(v) {
    var k = v.k;
    if (v.totalHistorico === 0) return 'Todavía no hay solicitudes registradas.';
    if (k.pendientesVencidas > 0) {
      var n = k.pendientesVencidas;
      return n + ' ' + plural(n, 'solicitud pendiente lleva', 'solicitudes pendientes llevan') + ' más de ' + M.DIAS_VENCIDA + ' días sin atención.';
    }
    if (k.pendientesTotal === 1) return 'Sin solicitudes vencidas: la única pendiente es de la última semana.';
    if (k.pendientesTotal > 1) return 'Sin solicitudes vencidas: las ' + k.pendientesTotal + ' pendientes son de la última semana.';
    return 'Todas las solicitudes registradas están atendidas.';
  }

  function detalleHero(v, ctx) {
    var k = v.k;
    var periodo = U.PERIODO_TEXTO[ctx.periodo];
    if (v.totalHistorico === 0) return 'Cuando llegue la primera, este resumen se actualizará solo.';
    if (k.total === 0) return 'No hubo solicitudes en ' + periodo + '.';
    var variacion = U.textoVariacion(k.variacionTotal);
    return 'En ' + periodo + ' se ' + plural(k.total, 'recibió ', 'recibieron ') + nf.format(k.total) + ' ' +
      plural(k.total, 'solicitud', 'solicitudes') + (variacion ? ', ' + variacion : '') + '. ' +
      pct(k.pctAnonimas) + ' llegaron de forma anónima.';
  }

  // La tarjeta de aviso cambia de color según la urgencia (mismos bordes superiores que las tarjetas del Admin).
  var TONOS_AVISO = {
    neutro: { borde: 'border-purple-600', icono: 'fa-circle-info text-purple-500' },
    alerta: { borde: 'border-red-500', icono: 'fa-triangle-exclamation text-red-500' },
    pendiente: { borde: 'border-yellow-500', icono: 'fa-hourglass-half text-yellow-500' },
    ok: { borde: 'border-green-600', icono: 'fa-circle-check text-green-500' }
  };
  var BORDES_AVISO = Object.keys(TONOS_AVISO).map(function (k) { return TONOS_AVISO[k].borde; }).join(' ');
  var ICONOS_AVISO = Object.keys(TONOS_AVISO).map(function (k) { return TONOS_AVISO[k].icono; }).join(' ');

  function tonoAviso(v) {
    if (v.totalHistorico === 0) return 'neutro';
    if (v.k.pendientesVencidas > 0) return 'alerta';
    if (v.k.pendientesTotal > 0) return 'pendiente';
    return 'ok';
  }

  function renderHero(v, ctx) {
    setText('hero-headline', titularHero(v));
    setText('hero-detail', detalleHero(v, ctx));
    var tono = TONOS_AVISO[tonoAviso(v)];
    U.cambiarClases($('insight-card'), BORDES_AVISO, tono.borde);
    U.cambiarClases($('insight-icon'), ICONOS_AVISO, tono.icono);
  }

  // ===== Indicadores =====
  function renderTotal(v, ctx) {
    var k = v.k;
    setText('kpi-total', nf.format(k.total));
    var delta = $('kpi-total-delta');
    if (ctx.periodo === 'all') return U.indicador(delta, null, 'flat', 'Acumulado histórico');
    if (k.variacionTotal === null) return U.indicador(delta, null, 'flat', 'Sin datos del periodo anterior');
    U.indicador(delta, k.variacionTotal, 'flat', Math.abs(Math.round(k.variacionTotal * 100)) + '% ' + U.PERIODO_COMPARA[ctx.periodo]);
  }

  function renderVencidas(v) {
    var k = v.k;
    var alerta = k.pendientesVencidas > 0;
    setText('kpi-vencidas', nf.format(k.pendientesVencidas));
    U.cambiarClases($('kpi-vencidas-card'), 'border-red-500 border-green-600', alerta ? 'border-red-500' : 'border-green-600');
    U.cambiarClases($('kpi-vencidas-icon'), 'fa-hourglass-half fa-circle-check text-red-500 text-green-500',
      alerta ? 'fa-hourglass-half text-red-500' : 'fa-circle-check text-green-500');
    U.cambiarClases($('kpi-vencidas'), 'tone-bad text-gray-800', alerta ? 'tone-bad' : 'text-gray-800');
    setText('kpi-vencidas-note', alerta
      ? 'de ' + nf.format(k.pendientesTotal) + ' ' + plural(k.pendientesTotal, 'pendiente', 'pendientes') + ' en total, sin importar el periodo'
      : 'Ninguna solicitud vencida hoy');
  }

  function renderTasa(v, ctx) {
    var k = v.k;
    setText('kpi-tasa', pct(k.tasaFinalizacion));
    var delta = $('kpi-tasa-delta');
    if (ctx.periodo === 'all' || k.puntosTasa === null) {
      U.indicador(delta, null, 'flat', ctx.periodo === 'all' ? 'Acumulado histórico' : 'Sin datos del periodo anterior');
    } else {
      var puntos = Math.round(k.puntosTasa);
      U.indicador(delta, puntos, puntos > 0 ? 'good' : puntos < 0 ? 'bad' : 'flat', Math.abs(puntos) + ' pts ' + U.PERIODO_COMPARA[ctx.periodo]);
    }
    var finalizadas = k.periodo.filter(function (r) { return r.estado === 'finalizado'; }).length;
    setText('kpi-tasa-note', nf.format(finalizadas) + ' de ' + nf.format(k.total) + ' ' + plural(k.total, 'solicitud', 'solicitudes'));
  }

  function renderAnonimas(v) {
    var k = v.k;
    setText('kpi-anon', pct(k.pctAnonimas));
    setText('kpi-anon-note', nf.format(k.anonimas) + ' de ' + nf.format(k.total) + ' ' + plural(k.total, 'solicitud', 'solicitudes'));
  }

  // ===== Estado de las solicitudes y tiempo de resolución =====
  function renderEstados(v) {
    var total = v.k.total;
    var lista = $('estado-list');
    lista.textContent = '';
    v.estados.forEach(function (item) {
      var fila = nodo('li', 'estado-row');
      var cuenta = nodo('span', 'estado-count', nf.format(item.cantidad) + ' ');
      cuenta.appendChild(nodo('small', null, total ? Math.round((item.cantidad / total) * 100) + '%' : ''));
      var pista = nodo('div', 'estado-track');
      pista.setAttribute('aria-hidden', 'true');
      var relleno = nodo('div', 'estado-fill');
      relleno.dataset.estado = item.estado;
      relleno.style.width = total ? (item.cantidad / total) * 100 + '%' : '0%';
      pista.appendChild(relleno);
      fila.appendChild(nodo('span', 'estado-name', item.estado));
      fila.appendChild(cuenta);
      fila.appendChild(pista);
      lista.appendChild(fila);
    });

    var cantidad = function (estado) {
      var item = v.estados.filter(function (i) { return i.estado === estado; })[0];
      return item ? item.cantidad : 0;
    };
    var pendientes = cantidad('pendiente');
    setText('estado-title', total === 0
      ? 'Sin solicitudes en este periodo'
      : pendientes + ' ' + plural(pendientes, 'pendiente', 'pendientes') + ' de ' + total + ' ' + plural(total, 'solicitud', 'solicitudes'));
    setText('estado-sub', nf.format(cantidad('finalizado')) + ' finalizadas · ' + nf.format(cantidad('en proceso')) + ' en proceso');
  }

  function renderResolucion(v, ctx) {
    var r = v.resolucion;
    if (!ctx.tieneCierre) {
      setText('resol-valor', U.SIN_DATO);
      setText('resol-nota', 'Aún no se registra la fecha de cierre de cada solicitud.');
      return;
    }
    if (r.n === 0) {
      setText('resol-valor', U.SIN_DATO);
      setText('resol-nota', 'Todavía no hay solicitudes finalizadas con fecha de cierre.');
      return;
    }
    setText('resol-valor', r.promedioDias < 1 ? 'Menos de 1 día' : U.nfDecimal.format(r.promedioDias) + ' días');
    setText('resol-nota', 'Promedio de ' + r.n + ' ' + plural(r.n, 'solicitud finalizada', 'solicitudes finalizadas') +
      '. La mitad se resolvió en ' + U.nfDecimal.format(r.medianaDias) + ' ' + plural(r.medianaDias, 'día', 'días') + ' o menos.');
  }

  // ===== Pendientes por atender =====
  function itemCola(item, ctx) {
    var li = nodo('li', 'queue-item');
    li.dataset.vencida = String(item.vencida);

    var dias = Math.max(0, item.dias);
    var edad = nodo('div', 'queue-age');
    edad.appendChild(nodo('strong', null, String(dias)));
    edad.appendChild(nodo('span', null, dias === 1 ? 'día' : 'días'));

    var principal = nodo('div', 'queue-main');
    principal.appendChild(nodo('p', 'queue-title', item.anonima
      ? 'Solicitud anónima'
      : 'Solicitud de ' + (item.parroquia || 'parroquia sin registrar')));
    var meta = nodo('div', 'queue-meta');
    meta.appendChild(nodo('span', null, 'Recibida el ' + U.fechaCorta(item.creado_en)));
    if (item.tipo) meta.appendChild(U.chip(item.tipo, 'neutral'));
    meta.appendChild(item.asignadaA
      ? U.chip('Asignada a ' + (ctx.equipo[item.asignadaA] || 'una asesora'), 'neutral')
      : U.chip('Sin asesora', 'warn'));
    principal.appendChild(meta);

    li.appendChild(edad);
    li.appendChild(principal);
    return li;
  }

  function renderCola(v, ctx) {
    var cola = v.cola;
    var lista = $('queue-list');
    lista.textContent = '';

    if (cola.total === 0) {
      setText('queue-title', 'No hay solicitudes pendientes');
      setText('queue-sub', 'Todas están en proceso, finalizadas o canceladas.');
      lista.appendChild(nodo('li', 'queue-empty', 'Nada por atender por ahora.'));
      $('queue-more').hidden = true;
      return;
    }

    var masAntigua = Math.max(0, cola.items[0].dias);
    setText('queue-title', masAntigua === 0
      ? plural(cola.total, 'La única pendiente llegó hoy', 'Todas las pendientes llegaron hoy')
      : 'La pendiente más antigua lleva ' + U.dias(masAntigua));

    var partes = [cola.total + ' ' + plural(cola.total, 'pendiente', 'pendientes')];
    if (cola.vencidas > 0) partes.push(cola.vencidas + ' con más de ' + M.DIAS_VENCIDA + ' días');
    if (cola.sinAsignar > 0) partes.push(cola.sinAsignar + ' sin asesora');
    setText('queue-sub', partes.join(' · ') + '. No cambia con el periodo elegido.');

    cola.items.forEach(function (item) { lista.appendChild(itemCola(item, ctx)); });
    var restantes = cola.total - cola.items.length;
    $('queue-more').hidden = restantes <= 0;
    if (restantes > 0) setText('queue-more-text', 'y ' + restantes + ' más en la gestión de asesorías');
  }

  // ===== Tabla de recientes =====
  function celda(fila, contenido, clase) {
    var td = nodo('td', 'px-4 py-3 text-sm' + (clase ? ' ' + clase : ''));
    if (typeof contenido === 'string') td.textContent = contenido;
    else td.appendChild(contenido);
    fila.appendChild(td);
    return td;
  }

  function renderTabla(v, ctx) {
    var cuerpo = $('recent-body');
    cuerpo.textContent = '';
    if (v.recientes.length === 0) {
      var vacia = nodo('tr');
      var td = celda(vacia, nodo('span', 'muted', 'Sin solicitudes en este periodo.'), 'text-center');
      td.colSpan = 6;
      cuerpo.appendChild(vacia);
      return;
    }
    v.recientes.forEach(function (r) {
      var tr = nodo('tr', 'transition');
      celda(tr, U.fechaCorta(r.creado_en), 'whitespace-nowrap');
      celda(tr, r.es_anonimo ? nodo('span', 'muted', 'Anónima') : (r.parroquia || nodo('span', 'muted', 'Sin parroquia')));
      celda(tr, M.TIPOS[r.tipo_asesoria] || nodo('span', 'muted', 'Sin tipo'));
      celda(tr, U.chipEstado(r.estado));
      celda(tr, r.asignada_a ? (ctx.equipo[r.asignada_a] || 'Asesora') : nodo('span', 'muted', 'Sin asignar'));
      var abierta = r.estado === 'pendiente' || r.estado === 'en proceso';
      var dias = Math.max(0, M.diasDesde(r, ctx.ahora));
      var tarde = r.estado === 'pendiente' && dias > M.DIAS_VENCIDA;
      celda(tr, abierta ? U.dias(dias) : nodo('span', 'muted', r.estado === 'cancelado' ? 'Cancelada' : 'Cerrada'),
        'text-right whitespace-nowrap' + (tarde ? ' age-late' : ''));
      cuerpo.appendChild(tr);
    });
  }

  // ===== Gráficos =====
  function lideres(items) {
    return items.filter(function (i) { return i.cantidad === items[0].cantidad; });
  }

  function tituloLider(lista, vacio, unico, plural_) {
    if (lista.length === 0) return vacio;
    if (lista.length === 1) return unico(lista[0]);
    return lista.length + ' ' + plural_ + ' empatan con ' + lista[0].cantidad + ' ' + plural(lista[0].cantidad, 'solicitud', 'solicitudes');
  }

  function nombresEnTexto(nombres) {
    if (nombres.length === 1) return nombres[0];
    if (nombres.length === 2) return nombres[0] + ' y ' + nombres[1];
    return nombres.length + ' parroquias';
  }

  function renderTendencia(v, ctx) {
    var pico = U.mesPico(v.serie);
    setText('trend-title', pico.cantidad === 0
      ? 'Aún no hay solicitudes en estos meses'
      : 'Más solicitudes en ' + pico.nombre + ': ' + nf.format(pico.cantidad));
    setText('trend-sub', 'Últimos ' + v.serie.length + ' meses. Es la serie histórica: el periodo elegido arriba no la modifica.');
    C.tendencia(v.serie, ctx.paleta, ctx.animar);
  }

  function renderParroquias(v, ctx) {
    var par = v.parroquias;
    var conSolicitudes = par.items.filter(function (i) { return i.cantidad > 0; });

    var titulo;
    if (v.k.total === 0) titulo = 'Sin solicitudes en este periodo';
    else if (conSolicitudes.length === 0) titulo = 'Ninguna solicitud del periodo registró parroquia';
    else if (par.sinSolicitudes.length > 0) titulo = 'Sin solicitudes en ' + nombresEnTexto(par.sinSolicitudes);
    else titulo = tituloLider(lideres(par.items), '', function (l) { return l.etiqueta + ' es la parroquia con más solicitudes (' + l.cantidad + ')'; }, 'parroquias');
    setText('parroquia-title', titulo);

    var nota = par.excluidas > 0
      ? 'No incluye ' + par.excluidas + ' ' + plural(par.excluidas, 'solicitud anónima', 'solicitudes anónimas') + ', que no registran parroquia.'
      : 'Solo solicitudes con parroquia registrada.';
    setText('parroquia-sub', nota + (par.sinSolicitudes.length > 0 && v.k.total > 0 ? ' Un cero no significa que no haya casos allí.' : ''));

    if (v.k.total === 0) {
      C.vacio({ clave: 'parroquia', canvasId: 'chart-parroquia', cajaId: 'box-parroquia', mensaje: 'Aún no hay solicitudes.' });
      return;
    }
    C.barras({ clave: 'parroquia', canvasId: 'chart-parroquia', cajaId: 'box-parroquia', items: par.items, color: ctx.paleta.s1, paleta: ctx.paleta, animar: ctx.animar,
      mensajeVacio: 'Aún no hay solicitudes con parroquia.', descripcion: 'Gráfico de barras, solicitudes por parroquia' });
  }

  function renderTipos(v, ctx) {
    var tipos = v.tipos;
    var clasificados = tipos.filter(function (t) { return t.etiqueta !== 'Sin tipo'; });
    var sinTipo = tipos.filter(function (t) { return t.etiqueta === 'Sin tipo'; })[0];

    setText('tipo-title', tipos.length === 0
      ? 'Sin solicitudes en este periodo'
      : tituloLider(lideres(clasificados), 'Ninguna solicitud tiene tipo de asesoría asignado',
        function (l) { return 'Asesoría ' + l.etiqueta.toLowerCase() + ' es la más solicitada entre las clasificadas (' + l.cantidad + ')'; }, 'tipos de asesoría'));
    setText('tipo-sub', sinTipo
      ? nf.format(sinTipo.cantidad) + ' ' + plural(sinTipo.cantidad, 'solicitud aún sin clasificar', 'solicitudes aún sin clasificar') + '.'
      : 'Todas las solicitudes están clasificadas.');
    C.barras({ clave: 'tipo', canvasId: 'chart-tipo', cajaId: 'box-tipo', items: tipos, color: ctx.paleta.s2, paleta: ctx.paleta, animar: ctx.animar,
      mensajeVacio: 'Aún no hay solicitudes.', descripcion: 'Gráfico de barras, solicitudes por tipo de asesoría' });
  }

  function renderAsesoras(v, ctx) {
    var asesoras = v.asesoras;
    setText('asesora-title', v.k.total === 0
      ? 'Sin solicitudes en este periodo'
      : asesoras.sinAsignar > 0
        ? asesoras.sinAsignar + ' ' + plural(asesoras.sinAsignar, 'solicitud sin asesora asignada', 'solicitudes sin asesora asignada')
        : 'Todas las solicitudes tienen asesora asignada');
    setText('asesora-sub', 'Solicitudes según la asesora responsable.');
    C.barras({ clave: 'asesora', canvasId: 'chart-asesora', cajaId: 'box-asesora', items: asesoras.items, color: ctx.paleta.s1, paleta: ctx.paleta, animar: ctx.animar,
      mensajeVacio: 'Aún no hay solicitudes.', descripcion: 'Gráfico de barras, solicitudes por asesora' });
  }

  // Devuelve false si la librería de gráficos no cargó (el resto de la sección sí se pinta).
  function asesorias(v, ctx) {
    renderHero(v, ctx);
    renderTotal(v, ctx);
    renderVencidas(v);
    renderTasa(v, ctx);
    renderAnonimas(v);
    renderEstados(v);
    renderResolucion(v, ctx);
    renderCola(v, ctx);
    renderTabla(v, ctx);
    if (typeof Chart === 'undefined') return false;
    renderTendencia(v, ctx);
    renderParroquias(v, ctx);
    renderTipos(v, ctx);
    renderAsesoras(v, ctx);
    return true;
  }

  window.DashboardRender = { asesorias: asesorias };
})();
