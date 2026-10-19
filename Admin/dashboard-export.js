// dashboard-export.js – Exportación del dashboard a CSV (solo datos agregados, nunca filas de solicitudes).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DashboardExport = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var SEPARADOR = ';';
  var SALTO = '\r\n';
  var SUFIJO_PERIODO = { all: 'todo', '30': '30-dias', '90': '90-dias', '365': '12-meses' };

  // Un texto que empieza con = + - @ lo interpreta Excel como fórmula: se neutraliza con un apóstrofo.
  function celda(valor) {
    if (valor === null || valor === undefined) return '';
    var texto = String(valor);
    if (typeof valor === 'string' && /^[=+\-@\t\r]/.test(texto)) texto = "'" + texto;
    if (/[;"\r\n]/.test(texto)) texto = '"' + texto.replace(/"/g, '""') + '"';
    return texto;
  }

  function construirCsv(bloques) {
    return bloques.map(function (bloque) {
      var lineas = [celda(bloque.titulo), bloque.columnas.map(celda).join(SEPARADOR)];
      bloque.filas.forEach(function (fila) { lineas.push(fila.map(celda).join(SEPARADOR)); });
      return lineas.join(SALTO);
    }).join(SALTO + SALTO) + SALTO;
  }

  function porcentaje(ratio) {
    return ratio === null || ratio === undefined ? '' : Math.round(ratio * 100);
  }

  function unDecimal(n) {
    return n === null || n === undefined ? '' : Math.round(n * 10) / 10;
  }

  function dosColumnas(titulo, cabecera, items, etiqueta, cantidad) {
    return {
      titulo: titulo,
      columnas: cabecera,
      filas: items.map(function (i) { return [i[etiqueta], i[cantidad]]; })
    };
  }

  function formatoFecha(fecha) {
    return fecha.getFullYear() + '-' + String(fecha.getMonth() + 1).padStart(2, '0') + '-' + String(fecha.getDate()).padStart(2, '0');
  }

  function bloquesDesdeVista(vista, contexto) {
    var k = vista.k;
    var bloques = [{
      titulo: 'Resumen',
      columnas: ['Indicador', 'Valor'],
      filas: [
        ['Periodo', contexto.periodoTexto],
        ['Generado', formatoFecha(contexto.generado)],
        ['Solicitudes recibidas', k.total],
        ['Pendientes hace más de 7 días', k.pendientesVencidas],
        ['Tasa de finalización (%)', porcentaje(k.tasaFinalizacion)],
        ['Solicitudes anónimas (%)', porcentaje(k.pctAnonimas)],
        ['Tiempo medio de resolución (días)', unDecimal(vista.resolucion.promedioDias)]
      ]
    }];

    bloques.push(dosColumnas('Solicitudes por mes', ['Mes', 'Solicitudes'], vista.serie, 'etiqueta', 'cantidad'));
    bloques.push(dosColumnas('Solicitudes por estado', ['Estado', 'Solicitudes'], vista.estados, 'estado', 'cantidad'));
    bloques.push(dosColumnas('Solicitudes por parroquia (sin anónimas)', ['Parroquia', 'Solicitudes'], vista.parroquias.items, 'etiqueta', 'cantidad'));
    bloques.push(dosColumnas('Solicitudes por tipo de asesoría', ['Tipo', 'Solicitudes'], vista.tipos, 'etiqueta', 'cantidad'));
    bloques.push(dosColumnas('Solicitudes por asesora', ['Asesora', 'Solicitudes'], vista.asesoras.items, 'etiqueta', 'cantidad'));

    if (contexto.incluirUsuarias && vista.usuarias && vista.usuarias.conFecha) {
      bloques.push(dosColumnas('Usuarias registradas por mes', ['Mes', 'Registros'], vista.usuarias.serie, 'etiqueta', 'cantidad'));
    }
    if (vista.publicaciones) {
      bloques.push(dosColumnas('Publicaciones por mes', ['Mes', 'Publicadas'], vista.publicaciones.serie, 'etiqueta', 'cantidad'));
    }
    return bloques;
  }

  function nombreArchivo(fecha, periodoClave) {
    return 'dashboard-immujel-' + formatoFecha(fecha) + '-' + (SUFIJO_PERIODO[periodoClave] || 'todo') + '.csv';
  }

  // Solo navegador. El BOM hace que Excel reconozca las tildes.
  function descargar(csv, nombre) {
    var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombre;
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  return {
    construirCsv: construirCsv,
    bloquesDesdeVista: bloquesDesdeVista,
    nombreArchivo: nombreArchivo,
    descargar: descargar
  };
});
