const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../Admin/dashboard-metrics.js');

const AHORA = new Date('2026-09-29T12:00:00Z');

function dias(n) {
  return new Date(AHORA.getTime() - n * 86400000).toISOString();
}

function fila(sobrescribir) {
  return Object.assign({
    id: 'x',
    creado_en: dias(1),
    estado: 'pendiente',
    es_anonimo: false,
    parroquia: 'Libertad',
    tipo_asesoria: 'juridica',
    asignada_a: null
  }, sobrescribir);
}

test('kpis: cuenta total, tasa de finalización y % de anónimas del periodo', () => {
  const rows = [
    fila({ estado: 'finalizado', es_anonimo: true, parroquia: null }),
    fila({ estado: 'finalizado' }),
    fila({ estado: 'pendiente' }),
    fila({ estado: 'en proceso', es_anonimo: true, parroquia: null })
  ];
  const k = M.kpis(rows, null, AHORA);
  assert.equal(k.total, 4);
  assert.equal(k.tasaFinalizacion, 0.5);
  assert.equal(k.pctAnonimas, 0.5);
  assert.equal(k.anonimas, 2);
  assert.equal(k.variacionTotal, null);
});

test('kpis: sin datos devuelve null en los porcentajes en vez de NaN', () => {
  const k = M.kpis([], null, AHORA);
  assert.equal(k.total, 0);
  assert.equal(k.tasaFinalizacion, null);
  assert.equal(k.pctAnonimas, null);
});

test('kpis: compara contra el periodo anterior de igual duración', () => {
  const rows = [
    fila({ creado_en: dias(5) }),
    fila({ creado_en: dias(10) }),
    fila({ creado_en: dias(40) }),
    fila({ creado_en: dias(100) })
  ];
  const k = M.kpis(rows, 30, AHORA);
  assert.equal(k.total, 2);
  assert.equal(k.totalPrevio, 1);
  assert.equal(k.variacionTotal, 1);
});

test('kpis: la variación es null cuando el periodo anterior está vacío', () => {
  const k = M.kpis([fila({ creado_en: dias(3) })], 30, AHORA);
  assert.equal(k.totalPrevio, 0);
  assert.equal(k.variacionTotal, null);
});

test('dividirPorPeriodo: el límite del periodo pertenece al periodo anterior', () => {
  const rows = [fila({ creado_en: dias(30) }), fila({ creado_en: dias(29) })];
  const p = M.dividirPorPeriodo(rows, 30, AHORA);
  assert.equal(p.actual.length, 1);
  assert.equal(p.anterior.length, 1);
});

test('pendientes vencidas: cuenta solo pendientes con más de 7 días, sin importar el periodo', () => {
  const rows = [
    fila({ estado: 'pendiente', creado_en: dias(8) }),
    fila({ estado: 'pendiente', creado_en: dias(7) }),
    fila({ estado: 'pendiente', creado_en: dias(200) }),
    fila({ estado: 'finalizado', creado_en: dias(50) })
  ];
  const k = M.kpis(rows, 30, AHORA);
  assert.equal(k.pendientesVencidas, 2);
  assert.equal(k.pendientesTotal, 3);
});

test('serieMensual: rellena meses vacíos con cero y usa al menos 6 meses', () => {
  const serie = M.serieMensual([fila({ creado_en: dias(2) })], AHORA);
  assert.equal(serie.length, 6);
  assert.equal(serie[serie.length - 1].clave, '2026-09');
  assert.equal(serie[serie.length - 1].cantidad, 1);
  assert.equal(serie[0].cantidad, 0);
});

test('serieMensual: limita a 12 meses aunque haya datos más antiguos', () => {
  const serie = M.serieMensual([fila({ creado_en: dias(900) })], AHORA);
  assert.equal(serie.length, 12);
});

test('porEstado: oculta cancelado cuando no hay ninguna', () => {
  const estados = M.porEstado([fila({ estado: 'pendiente' })]).map((e) => e.estado);
  assert.deepEqual(estados, ['pendiente', 'en proceso', 'finalizado']);
});

test('porEstado: incluye cancelado cuando existe', () => {
  const estados = M.porEstado([fila({ estado: 'cancelado' })]).map((e) => e.estado);
  assert.ok(estados.includes('cancelado'));
});

test('porParroquia: excluye anónimas y reporta cuántas quedaron fuera', () => {
  const rows = [
    fila({ parroquia: 'Libertad' }),
    fila({ parroquia: 'Libertad' }),
    fila({ parroquia: 'Campo Lara' }),
    fila({ es_anonimo: true, parroquia: null })
  ];
  const r = M.porParroquia(rows, 10);
  assert.deepEqual(r.items, [
    { etiqueta: 'Libertad', cantidad: 2 },
    { etiqueta: 'Campo Lara', cantidad: 1 }
  ]);
  assert.equal(r.excluidas, 1);
});

test('porParroquia: respeta el límite de elementos', () => {
  const rows = ['A', 'B', 'C'].map((p) => fila({ parroquia: p }));
  assert.equal(M.porParroquia(rows, 2).items.length, 2);
});

test('porTipo: traduce los valores y agrupa los vacíos como "Sin tipo"', () => {
  const rows = [
    fila({ tipo_asesoria: 'psicologica' }),
    fila({ tipo_asesoria: null }),
    fila({ tipo_asesoria: null })
  ];
  assert.deepEqual(M.porTipo(rows), [
    { etiqueta: 'Sin tipo', cantidad: 2 },
    { etiqueta: 'Psicológica', cantidad: 1 }
  ]);
});

test('porAsesora: usa el nombre del perfil y cuenta las sin asignar', () => {
  const rows = [
    fila({ asignada_a: 'u1' }),
    fila({ asignada_a: 'u1' }),
    fila({ asignada_a: null })
  ];
  const r = M.porAsesora(rows, { u1: 'Ana Pérez' });
  assert.equal(r.sinAsignar, 1);
  assert.equal(r.items[0].etiqueta, 'Ana Pérez');
  assert.equal(r.items[0].cantidad, 2);
});

test('recientes: ordena de más nueva a más antigua sin mutar la entrada', () => {
  const rows = [fila({ id: 'a', creado_en: dias(5) }), fila({ id: 'b', creado_en: dias(1) })];
  const r = M.recientes(rows, 1);
  assert.equal(r[0].id, 'b');
  assert.equal(rows[0].id, 'a');
});
