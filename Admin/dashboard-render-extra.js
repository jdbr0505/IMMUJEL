// dashboard-render-extra.js – Secciones de usuarias y publicaciones.
(function () {
  'use strict';

  var C = window.DashboardCharts;
  var U = window.DashboardUI;
  var $ = U.$;
  var setText = U.setText;
  var plural = U.plural;
  var nf = U.nf;

  function sinDatos(ids, tituloId, subId, cajaClave, mensaje) {
    ids.forEach(function (id) { setText(id, U.SIN_DATO); });
    setText(tituloId, 'Datos no disponibles');
    setText(subId, mensaje);
    if (typeof Chart !== 'undefined') C.vacio(Object.assign({ mensaje: 'No hay datos para mostrar.' }, cajaClave));
  }

  function tituloPico(serie, palabra) {
    var pico = U.mesPico(serie);
    return pico.cantidad === 0
      ? 'Aún no hay ' + palabra + ' en estos meses'
      : 'Más ' + palabra + ' en ' + pico.nombre + ': ' + nf.format(pico.cantidad);
  }

  function usuarias(v, ctx) {
    var u = v.usuarias;
    var grafico = { clave: 'usuarias', canvasId: 'chart-usuarias', cajaId: 'box-usuarias' };
    $('usu-nuevas-item').hidden = ctx.periodo === 'all';

    if (!u) {
      setText('usu-registradas-nota', '');
      setText('usu-equipo-nota', '');
      U.indicador($('usu-nuevas-delta'), null, 'flat', '');
      sinDatos(['usu-registradas', 'usu-nuevas', 'usu-equipo'], 'usu-chart-title', 'usu-chart-sub', grafico,
        ctx.errores.usuarias ? 'No se pudieron cargar las usuarias. Prueba con Actualizar.' : 'Todavía no hay datos de usuarias.');
      return;
    }

    setText('usu-registradas', nf.format(u.registradas));
    setText('usu-registradas-nota', ctx.periodo === 'all'
      ? 'Personas con cuenta en la app'
      : nf.format(u.nuevas) + ' ' + plural(u.nuevas, 'nueva', 'nuevas') + ' en ' + U.PERIODO_TEXTO[ctx.periodo]);

    setText('usu-nuevas', nf.format(u.nuevas));
    var delta = $('usu-nuevas-delta');
    if (u.variacion !== null) U.indicador(delta, u.variacion, 'flat', U.textoVariacion(u.variacion));
    else U.indicador(delta, null, 'flat', u.nuevasPrevias === 0 ? 'Sin registros en el periodo anterior' : '');

    setText('usu-equipo', nf.format(u.equipo));
    setText('usu-equipo-nota', nf.format(u.asesoras) + ' ' + plural(u.asesoras, 'asesora', 'asesoras') + ' · ' + nf.format(u.admins) + ' admin');

    setText('usu-chart-title', u.conFecha ? tituloPico(u.serie, 'registros') : 'Las fechas de registro no están disponibles');
    setText('usu-chart-sub', 'Usuarias con cuenta por mes de registro. Serie histórica: el periodo elegido no la modifica.');
    if (typeof Chart === 'undefined') return;
    if (!u.conFecha) {
      C.vacio(Object.assign({ mensaje: 'Las fechas de registro no están disponibles.' }, grafico));
      return;
    }
    C.columnas(Object.assign({
      serie: u.serie, color: ctx.paleta.s2, paleta: ctx.paleta, animar: ctx.animar, unidad: ['registro', 'registros'],
      mensajeVacio: 'Aún no hay registros en estos meses.', descripcion: 'Gráfico de columnas, registros de usuarias por mes'
    }, grafico));
  }

  function publicaciones(v, ctx) {
    var p = v.publicaciones;
    var grafico = { clave: 'publicaciones', canvasId: 'chart-publicaciones', cajaId: 'box-publicaciones' };

    if (!p) {
      setText('pub-publicadas-nota', '');
      setText('pub-borradores-nota', '');
      setText('pub-ultima-nota', '');
      sinDatos(['pub-publicadas', 'pub-borradores', 'pub-ultima'], 'pub-chart-title', 'pub-chart-sub', grafico,
        ctx.errores.publicaciones ? 'No se pudieron cargar las publicaciones. Prueba con Actualizar.' : 'Todavía no hay datos de publicaciones.');
      return;
    }

    setText('pub-publicadas', nf.format(p.publicadas));
    setText('pub-publicadas-nota', ctx.periodo === 'all'
      ? 'de ' + nf.format(p.total) + ' ' + plural(p.total, 'publicación', 'publicaciones') + ' en total'
      : nf.format(p.publicadasPeriodo) + ' en ' + U.PERIODO_TEXTO[ctx.periodo]);

    setText('pub-borradores', nf.format(p.borradores));
    setText('pub-borradores-nota', p.borradores === 0 ? 'Nada pendiente de publicar' : 'Todavía sin publicar');

    if (p.ultima) {
      setText('pub-ultima', p.ultima.dias <= 0 ? 'Hoy' : 'Hace ' + U.dias(p.ultima.dias));
      setText('pub-ultima-nota', 'Publicada el ' + U.fechaCorta(p.ultima.fecha));
    } else {
      setText('pub-ultima', 'Ninguna');
      setText('pub-ultima-nota', 'Aún no hay publicaciones');
    }

    var atrasada = p.ultima && p.ultima.dias > 30;
    setText('pub-chart-title', atrasada ? 'Sin publicar desde hace ' + U.dias(p.ultima.dias) : tituloPico(p.serie, 'publicaciones'));
    setText('pub-chart-sub', p.porTipo.map(function (t) { return t.etiqueta + ': ' + nf.format(t.publicadas) + ' ' + plural(t.publicadas, 'publicada', 'publicadas'); }).join(' · ') +
      '. Serie histórica por fecha de publicación.');
    if (typeof Chart === 'undefined') return;
    C.columnas(Object.assign({
      serie: p.serie, color: ctx.paleta.s1, paleta: ctx.paleta, animar: ctx.animar, unidad: ['publicación', 'publicaciones'],
      mensajeVacio: 'Aún no hay publicaciones en estos meses.', descripcion: 'Gráfico de columnas, publicaciones por mes'
    }, grafico));
  }

  window.DashboardRenderExtra = { usuarias: usuarias, publicaciones: publicaciones };
})();
