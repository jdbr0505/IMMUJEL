// dashboard-metrics.js – Cálculos puros del dashboard (sin DOM ni red).
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
  var TIPOS_PUBLICACION = [
    { tipo: 'semanario', etiqueta: 'Semanario' },
    { tipo: 'noticiero', etiqueta: 'Noticiero' }
  ];
  // Mismas opciones (y mismo texto) que el selector del formulario de asesorías.
  var PARROQUIAS = ['Alonso de Ojeda (Paraute)', 'Libertad', 'Campo Lara', 'Eleazar López Contreras', 'Venezuela'];
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  // Una fecha sin hora ("2026-09-10") se toma como día local; new Date() la leería como UTC
  // y en Venezuela mostraría el día anterior.
  function fechaLocal(valor) {
    if (valor instanceof Date) return valor;
    if (typeof valor === 'string') {
      var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
      if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }
    return new Date(valor);
  }

  function tiempoDe(row, campo) {
    var valor = row[campo || 'creado_en'];
    if (valor === null || valor === undefined || valor === '') return null;
    var t = fechaLocal(valor).getTime();
    return isNaN(t) ? null : t;
  }

  function diasDesde(row, ahora, campo) {
    return Math.floor((ahora.getTime() - tiempoDe(row, campo)) / MS_DIA);
  }

  function ratio(parte, total) {
    return total === 0 ? null : parte / total;
  }

  // periodoDias: número de días o null (todo el histórico).
  // Devuelve el periodo actual y el inmediatamente anterior de igual duración.
  function dividirPorPeriodo(rows, periodoDias, ahora, campo) {
    if (periodoDias === null) return { actual: rows.slice(), anterior: null };
    var fin = ahora.getTime();
    var inicio = fin - periodoDias * MS_DIA;
    var inicioPrevio = inicio - periodoDias * MS_DIA;
    var actual = [];
    var anterior = [];
    rows.forEach(function (r) {
      var t = tiempoDe(r, campo);
      if (t === null) return;
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
  function serieMensual(rows, ahora, campo) {
    var tiempos = rows.map(function (r) { return tiempoDe(r, campo); }).filter(function (t) { return t !== null; });
    var primero = tiempos.reduce(function (min, t) { return t < min ? t : min; }, ahora.getTime());
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
    tiempos.forEach(function (t) {
      var s = porClave[claveMes(new Date(t))];
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
  // Con `oficiales`, las parroquias sin solicitudes también aparecen (en cero).
  function porParroquia(rows, limite, oficiales) {
    var identificadas = rows.filter(function (r) { return r.es_anonimo !== true; });
    var excluidas = rows.length - identificadas.length;
    var lista = agrupar(identificadas, function (r) { return r.parroquia || 'Sin parroquia'; });

    if (oficiales) {
      var presentes = {};
      lista.forEach(function (i) { presentes[i.etiqueta] = true; });
      oficiales.forEach(function (nombre) {
        if (!presentes[nombre]) lista.push({ etiqueta: nombre, cantidad: 0 });
      });
      ordenar(lista);
    }
    var sinSolicitudes = oficiales
      ? lista.filter(function (i) { return i.cantidad === 0; }).map(function (i) { return i.etiqueta; })
      : [];
    return { items: lista.slice(0, limite || 10), excluidas: excluidas, sinSolicitudes: sinSolicitudes };
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
    return rows.slice().sort(function (a, b) { return (tiempoDe(b) || 0) - (tiempoDe(a) || 0); }).slice(0, cantidad);
  }

  // Cola de trabajo: pendientes de la más antigua a la más reciente. Sin nombre, cédula ni contacto.
  function pendientesAntiguas(rows, ahora, limite) {
    var pendientes = rows
      .filter(function (r) { return r.estado === 'pendiente' && tiempoDe(r) !== null; })
      .sort(function (a, b) { return tiempoDe(a) - tiempoDe(b) || String(a.id).localeCompare(String(b.id)); });

    return {
      items: pendientes.slice(0, limite).map(function (r) {
        var dias = diasDesde(r, ahora);
        return {
          id: r.id,
          creado_en: r.creado_en,
          dias: dias,
          vencida: dias > DIAS_VENCIDA,
          anonima: r.es_anonimo === true,
          parroquia: r.parroquia || null,
          tipo: TIPOS[r.tipo_asesoria] || null,
          asignadaA: r.asignada_a || null
        };
      }),
      total: pendientes.length,
      vencidas: pendientes.filter(function (r) { return diasDesde(r, ahora) > DIAS_VENCIDA; }).length,
      sinAsignar: pendientes.filter(function (r) { return !r.asignada_a; }).length
    };
  }

  // Días entre la creación y el cierre. Solo cuenta solicitudes que tienen fecha de cierre registrada.
  function tiempoResolucion(rows) {
    var duraciones = rows
      .filter(function (r) { return r.estado === 'finalizado' && r.finalizado_en && tiempoDe(r) !== null; })
      .map(function (r) { return Math.max(0, (fechaLocal(r.finalizado_en).getTime() - tiempoDe(r)) / MS_DIA); })
      .filter(function (d) { return isFinite(d); })
      .sort(function (a, b) { return a - b; });

    if (duraciones.length === 0) return { n: 0, promedioDias: null, medianaDias: null };
    var suma = duraciones.reduce(function (acc, d) { return acc + d; }, 0);
    var medio = Math.floor(duraciones.length / 2);
    var mediana = duraciones.length % 2 === 1 ? duraciones[medio] : (duraciones[medio - 1] + duraciones[medio]) / 2;
    return { n: duraciones.length, promedioDias: suma / duraciones.length, medianaDias: mediana };
  }

  function esEquipo(rol) {
    return rol === 'admin' || rol === 'asesora';
  }

  // perfiles: [{ rol, creado_en }]. Un rol vacío cuenta como usuaria, igual que en el panel de usuarias.
  function usuarias(perfiles, periodoDias, ahora) {
    var asesoras = perfiles.filter(function (p) { return p.rol === 'asesora'; }).length;
    var admins = perfiles.filter(function (p) { return p.rol === 'admin'; }).length;
    var soloUsuarias = perfiles.filter(function (p) { return !esEquipo(p.rol); });
    var partes = dividirPorPeriodo(soloUsuarias, periodoDias, ahora);
    var nuevas = partes.actual.length;
    var previas = partes.anterior ? partes.anterior.length : null;

    return {
      total: perfiles.length,
      registradas: soloUsuarias.length,
      asesoras: asesoras,
      admins: admins,
      equipo: asesoras + admins,
      nuevas: nuevas,
      nuevasPrevias: previas,
      variacion: previas === null ? null : variacion(nuevas, previas),
      serie: serieMensual(soloUsuarias, ahora),
      conFecha: soloUsuarias.length === 0 || soloUsuarias.some(function (p) { return tiempoDe(p) !== null; })
    };
  }

  // rows: [{ tipo, publicado, fecha }]
  function publicaciones(rows, periodoDias, ahora) {
    var publicadas = rows.filter(function (r) { return r.publicado === true; });
    var partes = dividirPorPeriodo(publicadas, periodoDias, ahora, 'fecha');
    var previas = partes.anterior ? partes.anterior.length : null;

    var ultimaMs = publicadas
      .map(function (r) { return tiempoDe(r, 'fecha'); })
      .filter(function (t) { return t !== null && t <= ahora.getTime(); })
      .reduce(function (max, t) { return max === null || t > max ? t : max; }, null);

    return {
      total: rows.length,
      publicadas: publicadas.length,
      borradores: rows.length - publicadas.length,
      porTipo: TIPOS_PUBLICACION.map(function (t) {
        return {
          tipo: t.tipo,
          etiqueta: t.etiqueta,
          publicadas: publicadas.filter(function (r) { return r.tipo === t.tipo; }).length,
          borradores: rows.filter(function (r) { return r.publicado !== true && r.tipo === t.tipo; }).length
        };
      }),
      publicadasPeriodo: partes.actual.length,
      publicadasPrevias: previas,
      variacion: previas === null ? null : variacion(partes.actual.length, previas),
      ultima: ultimaMs === null ? null : { fecha: new Date(ultimaMs), dias: Math.floor((ahora.getTime() - ultimaMs) / MS_DIA) },
      serie: serieMensual(publicadas, ahora, 'fecha')
    };
  }

  // Todo lo que el dashboard muestra, calculado una sola vez para pantalla, CSV e impresión.
  function construirVista(datos) {
    var ahora = datos.ahora || new Date();
    var solicitudes = datos.solicitudes || [];
    var k = kpis(solicitudes, datos.periodoDias, ahora);
    var filas = k.periodo;

    return {
      totalHistorico: solicitudes.length,
      k: k,
      serie: serieMensual(solicitudes, ahora),
      estados: porEstado(filas),
      parroquias: porParroquia(filas, 10, datos.parroquias || PARROQUIAS),
      tipos: porTipo(filas),
      asesoras: porAsesora(filas, datos.equipo || {}),
      cola: pendientesAntiguas(solicitudes, ahora, 5),
      recientes: recientes(filas, 10),
      resolucion: tiempoResolucion(filas),
      usuarias: datos.perfiles ? usuarias(datos.perfiles, datos.periodoDias, ahora) : null,
      publicaciones: datos.publicaciones ? publicaciones(datos.publicaciones, datos.periodoDias, ahora) : null
    };
  }

  return {
    DIAS_VENCIDA: DIAS_VENCIDA,
    ESTADOS: ESTADOS,
    TIPOS: TIPOS,
    PARROQUIAS: PARROQUIAS,
    MESES_LARGOS: MESES_LARGOS,
    fechaLocal: fechaLocal,
    diasDesde: diasDesde,
    dividirPorPeriodo: dividirPorPeriodo,
    kpis: kpis,
    serieMensual: serieMensual,
    porEstado: porEstado,
    porParroquia: porParroquia,
    porTipo: porTipo,
    porAsesora: porAsesora,
    recientes: recientes,
    pendientesAntiguas: pendientesAntiguas,
    tiempoResolucion: tiempoResolucion,
    usuarias: usuarias,
    publicaciones: publicaciones,
    construirVista: construirVista
  };
});
