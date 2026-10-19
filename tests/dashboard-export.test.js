const test = require('node:test');
const assert = require('node:assert/strict');
const X = require('../Admin/dashboard-export.js');

test('construirCsv: separa con punto y coma y usa saltos de línea de Windows', () => {
  const csv = X.construirCsv([{ titulo: 'Resumen', columnas: ['Indicador', 'Valor'], filas: [['Total', 12]] }]);
  assert.equal(csv, 'Resumen\r\nIndicador;Valor\r\nTotal;12\r\n');
});

test('construirCsv: separa los bloques con una línea en blanco', () => {
  const csv = X.construirCsv([
    { titulo: 'A', columnas: ['x'], filas: [[1]] },
    { titulo: 'B', columnas: ['y'], filas: [[2]] }
  ]);
  assert.equal(csv, 'A\r\nx\r\n1\r\n\r\nB\r\ny\r\n2\r\n');
});

test('construirCsv: entrecomilla textos con separador, comillas o saltos de línea', () => {
  const csv = X.construirCsv([{ titulo: 't', columnas: ['c'], filas: [['a;b'], ['dice "hola"'], ['uno\ndos']] }]);
  assert.equal(csv, 't\r\nc\r\n"a;b"\r\n"dice ""hola"""\r\n"uno\ndos"\r\n');
});

test('construirCsv: neutraliza fórmulas de hoja de cálculo en los textos', () => {
  const csv = X.construirCsv([{ titulo: 't', columnas: ['c'], filas: [['=HYPERLINK("http://x")'], ['+1'], ['-2'], ['@SUM(A1)']] }]);
  const lineas = csv.split('\r\n');
  assert.equal(lineas[2], '"\'=HYPERLINK(""http://x"")"');
  assert.equal(lineas[3], "'+1");
  assert.equal(lineas[4], "'-2");
  assert.equal(lineas[5], "'@SUM(A1)");
});

test('construirCsv: conserva los números negativos y deja vacíos null y undefined', () => {
  const csv = X.construirCsv([{ titulo: 't', columnas: ['a', 'b', 'c'], filas: [[-5, null, undefined]] }]);
  assert.equal(csv, 't\r\na;b;c\r\n-5;;\r\n');
});

function vistaMinima() {
  return {
    k: { total: 12, pendientesVencidas: 2, tasaFinalizacion: 5 / 12, pctAnonimas: 0.75 },
    resolucion: { n: 0, promedioDias: null, medianaDias: null },
    serie: [{ etiqueta: 'sep 26', cantidad: 6 }],
    estados: [{ estado: 'pendiente', cantidad: 3 }],
    parroquias: { items: [{ etiqueta: 'Libertad', cantidad: 2 }, { etiqueta: 'Venezuela', cantidad: 0 }] },
    tipos: [{ etiqueta: 'Sin tipo', cantidad: 9 }],
    asesoras: { items: [{ etiqueta: 'Sin asignar', cantidad: 5 }] },
    usuarias: { conFecha: true, serie: [{ etiqueta: 'sep 26', cantidad: 4 }] },
    publicaciones: { serie: [{ etiqueta: 'sep 26', cantidad: 1 }] }
  };
}

const CONTEXTO = { periodoTexto: 'todo el histórico', generado: new Date(2026, 8, 30, 9, 5), incluirUsuarias: true };

function titulos(bloques) {
  return bloques.map((b) => b.titulo);
}

test('bloquesDesdeVista: incluye el resumen con los porcentajes redondeados', () => {
  const resumen = X.bloquesDesdeVista(vistaMinima(), CONTEXTO)[0];
  assert.equal(resumen.titulo, 'Resumen');
  const valores = Object.fromEntries(resumen.filas);
  assert.equal(valores['Periodo'], 'todo el histórico');
  assert.equal(valores['Solicitudes recibidas'], 12);
  assert.equal(valores['Pendientes hace más de 7 días'], 2);
  assert.equal(valores['Tasa de finalización (%)'], 42);
  assert.equal(valores['Solicitudes anónimas (%)'], 75);
  assert.equal(valores['Tiempo medio de resolución (días)'], '');
});

test('bloquesDesdeVista: no exporta datos personales ni filas individuales', () => {
  const csv = X.construirCsv(X.bloquesDesdeVista(vistaMinima(), CONTEXTO));
  assert.ok(!/cedula|cédula|telefono|teléfono|correo/i.test(csv));
  assert.ok(csv.includes('Libertad;2'));
  assert.ok(csv.includes('Venezuela;0'));
});

test('bloquesDesdeVista: omite usuarias si no se permiten o no hay datos', () => {
  const v = vistaMinima();
  assert.ok(titulos(X.bloquesDesdeVista(v, CONTEXTO)).includes('Usuarias registradas por mes'));
  assert.ok(!titulos(X.bloquesDesdeVista(v, Object.assign({}, CONTEXTO, { incluirUsuarias: false }))).includes('Usuarias registradas por mes'));
  assert.ok(!titulos(X.bloquesDesdeVista(Object.assign({}, v, { usuarias: null }), CONTEXTO)).includes('Usuarias registradas por mes'));
});

test('bloquesDesdeVista: incluye publicaciones solo cuando hay datos', () => {
  assert.ok(titulos(X.bloquesDesdeVista(vistaMinima(), CONTEXTO)).includes('Publicaciones por mes'));
  const sinPublicaciones = Object.assign(vistaMinima(), { publicaciones: null });
  assert.ok(!titulos(X.bloquesDesdeVista(sinPublicaciones, CONTEXTO)).includes('Publicaciones por mes'));
});

test('bloquesDesdeVista: informa el tiempo de resolución cuando existe', () => {
  const v = vistaMinima();
  v.resolucion = { n: 3, promedioDias: 5.25, medianaDias: 4 };
  const valores = Object.fromEntries(X.bloquesDesdeVista(v, CONTEXTO)[0].filas);
  assert.equal(valores['Tiempo medio de resolución (días)'], 5.3);
});

test('nombreArchivo: usa la fecha local y el periodo elegido', () => {
  const fecha = new Date(2026, 8, 30, 23, 59);
  assert.equal(X.nombreArchivo(fecha, 'all'), 'dashboard-immujel-2026-09-30-todo.csv');
  assert.equal(X.nombreArchivo(fecha, '30'), 'dashboard-immujel-2026-09-30-30-dias.csv');
  assert.equal(X.nombreArchivo(fecha, '365'), 'dashboard-immujel-2026-09-30-12-meses.csv');
});
