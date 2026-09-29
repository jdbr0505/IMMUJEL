// dashboard-metrics.js – Cálculos puros del dashboard de asesorías (sin DOM ni red).
// Se usa en el navegador (window.DashboardMetrics) y en Node para las pruebas.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DashboardMetrics = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var MS_DIA = 86400000;
  var DIAS_VENCIDA = 7;

  var ESTADOS = ['pendiente', 'en proceso', 'finalizado', 'cancelado'];
  var TIPOS = {
    juridica: 'Jurídica',
    psicologica: 'Psicológica',
    social: 'Social',
    general: 'General'
  };
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  function fecha(row) {
    return new Date(row.creado_en);
  }

  function diasDesde(row, ahora) {
    return Math.floor((ahora.getTime() - fecha(row).getTime()) / MS_DIA);
  }

  function ratio(parte, total) {
    return total === 0 ? null : parte / total;
  }

  // periodoDias: número de días o null (todo el histórico).
  // Devuelve el periodo actual y el inmediatamente anterior de igual duración.
  function dividirPorPeriodo(rows, periodoDias, ahora) {
    if (periodoDias === null) return { actual: rows.slice(), anterior: null };
    var fin = ahora.getTime();
    var inicio = fin - periodoDias * MS_DIA;
    var inicioPrevio = inicio - periodoDias * MS_DIA;
    var actual = [];
    var anterior = [];
    rows.forEach(function (r) {
      var t = fecha(r).getTime();
      if (t > inicio && t <= fin) actual.push(r);
      else if (t > inicioPrevio && t <= inicio) anterior.push(r);
    });
    return { actual: actual, anterior: anterior };
  }

  function resumen(rows) {
    var total = rows.length;
    var finalizadas = rows.filter(function (r) { return r.estado === 'finalizado'; }).length;
    var anonimas = rows.filter(function (r) { return r.es_anonimo === true; }).length;
    return {
      total: total,
      finalizadas: finalizadas,
      anonimas: anonimas,
      tasaFinalizacion: ratio(finalizadas, total),
      pctAnonimas: ratio(anonimas, total)
    };
  }

  function variacion(actual, anterior) {
    if (anterior === null || anterior === 0) return null;
    return (actual - anterior) / anterior;
  }

  // Pendientes vencidas: foto de hoy sobre TODO el histórico, no depende del periodo elegido.
  function pendientesVencidas(rows, ahora) {
    var pendientes = rows.filter(function (r) { return r.estado === 'pendiente'; });
    var vencidas = pendientes.filter(function (r) { return diasDesde(r, ahora) > DIAS_VENCIDA; });
    return { vencidas: vencidas.length, pendientes: pendientes.length };
  }

  function kpis(rows, periodoDias, ahora) {
    var partes = dividirPorPeriodo(rows, periodoDias, ahora);
    var actual = resumen(partes.actual);
    var previo = partes.anterior ? resumen(partes.anterior) : null;
    var cola = pendientesVencidas(rows, ahora);
    return {
      total: actual.total,
      variacionTotal: previo ? variacion(actual.total, previo.total) : null,
      totalPrevio: previo ? previo.total : null,
      tasaFinalizacion: actual.tasaFinalizacion,
      puntosTasa: previo && previo.tasaFinalizacion !== null && actual.tasaFinalizacion !== null
        ? (actual.tasaFinalizacion - previo.tasaFinalizacion) * 100
        : null,
      pctAnonimas: actual.pctAnonimas,
      anonimas: actual.anonimas,
      pendientesVencidas: cola.vencidas,
      pendientesTotal: cola.pendientes,
      periodo: partes.actual
    };
  }

  function claveMes(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  // Serie mensual rellenada con ceros. Entre 6 y 12 meses terminando en el mes actual.
  function serieMensual(rows, ahora) {
    var primero = rows.reduce(function (min, r) {
      var t = fecha(r).getTime();
      return t < min ? t : min;
    }, ahora.getTime());
    var d0 = new Date(primero);
    var meses = (ahora.getFullYear() - d0.getFullYear()) * 12 + (ahora.getMonth() - d0.getMonth()) + 1;
    meses = Math.max(6, Math.min(12, meses));

    var serie = [];
    for (var i = meses - 1; i >= 0; i--) {
      var d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
      serie.push({
        clave: claveMes(d),
        etiqueta: MESES[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2),
        nombre: MESES_LARGOS[d.getMonth()],
        cantidad: 0
      });
    }
    var porClave = {};
    serie.forEach(function (s) { porClave[s.clave] = s; });
    rows.forEach(function (r) {
      var s = porClave[claveMes(fecha(r))];
      if (s) s.cantidad += 1;
    });
    return serie;
  }

  function porEstado(rows) {
    var conteo = {};
    rows.forEach(function (r) { conteo[r.estado] = (conteo[r.estado] || 0) + 1; });
    return ESTADOS
      .filter(function (e) { return e !== 'cancelado' || conteo[e] > 0; })
      .map(function (e) { return { estado: e, cantidad: conteo[e] || 0 }; });
  }

  function ordenar(items) {
    return items.sort(function (a, b) {
      return b.cantidad - a.cantidad || a.etiqueta.localeCompare(b.etiqueta, 'es');
    });
  }

  function agrupar(rows, obtenerEtiqueta) {
    var conteo = {};
    rows.forEach(function (r) {
      var etiqueta = obtenerEtiqueta(r);
      conteo[etiqueta] = (conteo[etiqueta] || 0) + 1;
    });
    return ordenar(Object.keys(conteo).map(function (k) { return { etiqueta: k, cantidad: conteo[k] }; }));
  }

  // Las anónimas no registran parroquia por diseño del formulario: se cuentan aparte.
  function porParroquia(rows, limite) {
    var identificadas = rows.filter(function (r) { return r.es_anonimo !== true; });
    var excluidas = rows.length - identificadas.length;
    var lista = agrupar(identificadas, function (r) { return r.parroquia || 'Sin parroquia'; });
    return { items: lista.slice(0, limite || 10), excluidas: excluidas };
  }

  function porTipo(rows) {
    return agrupar(rows, function (r) { return TIPOS[r.tipo_asesoria] || 'Sin tipo'; });
  }

  // perfiles: objeto { [id]: nombre }
  function porAsesora(rows, perfiles) {
    var lista = agrupar(rows, function (r) {
      if (!r.asignada_a) return 'Sin asignar';
      return perfiles[r.asignada_a] || 'Asesora';
    });
    var sinAsignar = lista.filter(function (i) { return i.etiqueta === 'Sin asignar'; })[0];
    return { items: lista, sinAsignar: sinAsignar ? sinAsignar.cantidad : 0 };
  }

  function recientes(rows, cantidad) {
    return rows.slice().sort(function (a, b) { return fecha(b) - fecha(a); }).slice(0, cantidad);
  }

  return {
    DIAS_VENCIDA: DIAS_VENCIDA,
    ESTADOS: ESTADOS,
    TIPOS: TIPOS,
    MESES_LARGOS: MESES_LARGOS,
    diasDesde: diasDesde,
    dividirPorPeriodo: dividirPorPeriodo,
    kpis: kpis,
    serieMensual: serieMensual,
    porEstado: porEstado,
    porParroquia: porParroquia,
    porTipo: porTipo,
    porAsesora: porAsesora,
    recientes: recientes
  };
});
