const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../Admin/dashboard-metrics.js');

// Mediodía local: las pruebas con fechas "YYYY-MM-DD" no dependen de la zona horaria del equipo.
const AHORA = new Date(2026, 8, 29, 12, 0, 0);
const DIA = 86400000;

function iso(diasAtras) {
  return new Date(AHORA.getTime() - diasAtras * DIA).toISOString();
}

function ymd(diasAtras) {
  const d = new Date(2026, 8, 29 - diasAtras);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function solicitud(sobrescribir) {
  return Object.assign({
    id: 's',
    creado_en: iso(1),
    estado: 'pendiente',
    es_anonimo: false,
    parroquia: 'Libertad',
    tipo_asesoria: null,
    asignada_a: null
  }, sobrescribir);
}

// ===== fechas =====

test('fechaLocal: interpreta YYYY-MM-DD como fecha local sin desfase de zona horaria', () => {
  const f = M.fechaLocal('2026-09-10');
  assert.equal(f.getFullYear(), 2026);
  assert.equal(f.getMonth(), 8);
  assert.equal(f.getDate(), 10);
  assert.equal(f.getHours(), 0);
});

test('fechaLocal: conserva los timestamps ISO completos', () => {
  const texto = '2026-09-10T15:30:00Z';
  assert.equal(M.fechaLocal(texto).getTime(), new Date(texto).getTime());
});

test('serieMensual: permite elegir el campo de fecha e ignora filas sin fecha', () => {
  const rows = [{ fecha: ymd(2) }, { fecha: ymd(3) }, { fecha: null }];
  const serie = M.serieMensual(rows, AHORA, 'fecha');
  assert.equal(serie[serie.length - 1].cantidad, 2);
});

test('dividirPorPeriodo: con un campo propio deja fuera las filas sin fecha', () => {
  const rows = [{ fecha: ymd(5) }, { fecha: null }];
  const p = M.dividirPorPeriodo(rows, 30, AHORA, 'fecha');
  assert.equal(p.actual.length, 1);
  assert.equal(p.anterior.length, 0);
});

// ===== usuarias =====

function perfil(rol, diasAtras) {
  return { rol: rol, creado_en: diasAtras === null ? null : iso(diasAtras) };
}

test('usuarias: cuenta por rol y trata el rol vacío como usuaria', () => {
  const r = M.usuarias([perfil('usuaria', 1), perfil(null, 2), perfil('asesora', 3), perfil('admin', 4)], null, AHORA);
  assert.equal(r.total, 4);
  assert.equal(r.registradas, 2);
  assert.equal(r.asesoras, 1);
  assert.equal(r.admins, 1);
  assert.equal(r.equipo, 2);
});

test('usuarias: las nuevas del periodo solo cuentan usuarias y se comparan con el periodo anterior', () => {
  const r = M.usuarias([
    perfil('usuaria', 5),
    perfil('usuaria', 10),
    perfil('usuaria', 40),
    perfil('asesora', 5)
  ], 30, AHORA);
  assert.equal(r.nuevas, 2);
  assert.equal(r.nuevasPrevias, 1);
  assert.equal(r.variacion, 1);
});

test('usuarias: en todo el histórico no hay periodo anterior', () => {
  const r = M.usuarias([perfil('usuaria', 5)], null, AHORA);
  assert.equal(r.nuevasPrevias, null);
  assert.equal(r.variacion, null);
});

test('usuarias: la serie mensual cuenta solo usuarias', () => {
  const r = M.usuarias([perfil('usuaria', 1), perfil('usuaria', 2), perfil('admin', 1)], null, AHORA);
  assert.equal(r.serie[r.serie.length - 1].cantidad, 2);
});

test('usuarias: sin fechas de registro marca conFecha en falso', () => {
  assert.equal(M.usuarias([perfil('usuaria', null)], null, AHORA).conFecha, false);
  assert.equal(M.usuarias([perfil('usuaria', 3)], null, AHORA).conFecha, true);
});

// ===== publicaciones =====

function pub(tipo, publicado, fecha) {
  return { tipo: tipo, publicado: publicado, fecha: fecha };
}

test('publicaciones: separa publicadas de borradores y cuenta por tipo', () => {
  const r = M.publicaciones([
    pub('semanario', true, ymd(4)),
    pub('semanario', false, ymd(3)),
    pub('noticiero', true, ymd(2)),
    pub('noticiero', true, ymd(9))
  ], null, AHORA);
  assert.equal(r.total, 4);
  assert.equal(r.publicadas, 3);
  assert.equal(r.borradores, 1);
  assert.deepEqual(r.porTipo.map((t) => [t.tipo, t.publicadas, t.borradores]), [
    ['semanario', 1, 1],
    ['noticiero', 2, 0]
  ]);
});

test('publicaciones: la última publicación es la más reciente que ya pasó', () => {
  const r = M.publicaciones([
    pub('semanario', true, ymd(10)),
    pub('noticiero', true, ymd(3)),
    pub('noticiero', true, ymd(-5)),
    pub('semanario', false, ymd(1))
  ], null, AHORA);
  assert.equal(r.ultima.dias, 3);
});

test('publicaciones: sin publicadas la última es null', () => {
  assert.equal(M.publicaciones([pub('semanario', false, ymd(1))], null, AHORA).ultima, null);
  assert.equal(M.publicaciones([], null, AHORA).ultima, null);
});

test('publicaciones: compara las publicadas del periodo con las del periodo anterior', () => {
  const r = M.publicaciones([
    pub('semanario', true, ymd(3)),
    pub('semanario', true, ymd(10)),
    pub('noticiero', true, ymd(45)),
    pub('noticiero', false, ymd(2))
  ], 30, AHORA);
  assert.equal(r.publicadasPeriodo, 2);
  assert.equal(r.publicadasPrevias, 1);
  assert.equal(r.variacion, 1);
});

test('publicaciones: la serie mensual solo cuenta las publicadas', () => {
  const r = M.publicaciones([pub('semanario', true, ymd(2)), pub('semanario', false, ymd(2))], null, AHORA);
  assert.equal(r.serie[r.serie.length - 1].cantidad, 1);
});

// ===== pendientes más antiguas =====

test('pendientesAntiguas: ordena de la más antigua a la más reciente y respeta el límite', () => {
  const rows = [
    solicitud({ id: 'a', creado_en: iso(2) }),
    solicitud({ id: 'b', creado_en: iso(20) }),
    solicitud({ id: 'c', creado_en: iso(9) })
  ];
  const r = M.pendientesAntiguas(rows, AHORA, 2);
  assert.deepEqual(r.items.map((i) => i.id), ['b', 'c']);
  assert.equal(r.total, 3);
});

test('pendientesAntiguas: marca las vencidas y cuenta las sin asignar', () => {
  const rows = [
    solicitud({ id: 'a', creado_en: iso(8), asignada_a: 'u1' }),
    solicitud({ id: 'b', creado_en: iso(7) }),
    solicitud({ id: 'c', creado_en: iso(1) })
  ];
  const r = M.pendientesAntiguas(rows, AHORA, 5);
  assert.equal(r.vencidas, 1);
  assert.equal(r.sinAsignar, 2);
  assert.equal(r.items[0].vencida, true);
  assert.equal(r.items[0].asignadaA, 'u1');
  assert.equal(r.items[1].vencida, false);
});

test('pendientesAntiguas: ignora lo que no está pendiente y describe la solicitud sin datos personales', () => {
  const rows = [
    solicitud({ id: 'a', estado: 'finalizado' }),
    solicitud({ id: 'b', es_anonimo: true, parroquia: null, tipo_asesoria: 'juridica' })
  ];
  const r = M.pendientesAntiguas(rows, AHORA, 5);
  assert.equal(r.total, 1);
  assert.deepEqual(Object.keys(r.items[0]).sort(), ['anonima', 'asignadaA', 'creado_en', 'dias', 'id', 'parroquia', 'tipo', 'vencida']);
  assert.equal(r.items[0].anonima, true);
  assert.equal(r.items[0].tipo, 'Jurídica');
});

test('pendientesAntiguas: sin pendientes devuelve una lista vacía', () => {
  const r = M.pendientesAntiguas([solicitud({ estado: 'finalizado' })], AHORA, 5);
  assert.deepEqual(r, { items: [], total: 0, vencidas: 0, sinAsignar: 0 });
});

// ===== cobertura por parroquia =====

test('porParroquia: con parroquias oficiales incluye las que no tienen solicitudes', () => {
  const r = M.porParroquia([solicitud({ parroquia: 'Libertad' })], 10, ['Libertad', 'Venezuela', 'Campo Lara']);
  assert.deepEqual(r.items, [
    { etiqueta: 'Libertad', cantidad: 1 },
    { etiqueta: 'Campo Lara', cantidad: 0 },
    { etiqueta: 'Venezuela', cantidad: 0 }
  ]);
  assert.deepEqual(r.sinSolicitudes, ['Campo Lara', 'Venezuela']);
});

test('porParroquia: conserva las parroquias que no están en la lista oficial', () => {
  const r = M.porParroquia([solicitud({ parroquia: 'Otra' }), solicitud({ parroquia: null })], 10, ['Libertad']);
  assert.deepEqual(r.items.map((i) => i.etiqueta).sort(), ['Libertad', 'Otra', 'Sin parroquia']);
  assert.deepEqual(r.sinSolicitudes, ['Libertad']);
});

test('porParroquia: las anónimas no cuentan como cobertura', () => {
  const r = M.porParroquia([solicitud({ es_anonimo: true, parroquia: null })], 10, ['Libertad']);
  assert.equal(r.excluidas, 1);
  assert.deepEqual(r.sinSolicitudes, ['Libertad']);
});

test('PARROQUIAS: son las seis del municipio y coinciden con las opciones del formulario de asesorías', () => {
  assert.deepEqual(M.PARROQUIAS, [
    'Alonso de Ojeda (Paraute)',
    'Libertad',
    'Campo Lara',
    'Eleazar López Contreras',
    'Venezuela',
    'El Danto'
  ]);
});

// ===== tiempo de resolución =====

function cerrada(creadaHace, cerradaHace, sobrescribir) {
  return solicitud(Object.assign({
    estado: 'finalizado',
    creado_en: iso(creadaHace),
    finalizado_en: iso(cerradaHace)
  }, sobrescribir));
}

test('tiempoResolucion: promedio, mediana y cantidad de las finalizadas con fecha de cierre', () => {
  const r = M.tiempoResolucion([
    cerrada(10, 6),
    cerrada(20, 10),
    cerrada(30, 29),
    solicitud({ estado: 'pendiente', finalizado_en: null }),
    solicitud({ estado: 'finalizado', finalizado_en: null })
  ]);
  assert.equal(r.n, 3);
  assert.equal(r.promedioDias, 5);
  assert.equal(r.medianaDias, 4);
});

test('tiempoResolucion: sin datos devuelve n 0 y valores nulos', () => {
  assert.deepEqual(M.tiempoResolucion([]), { n: 0, promedioDias: null, medianaDias: null });
  assert.deepEqual(M.tiempoResolucion([solicitud({ estado: 'finalizado' })]), { n: 0, promedioDias: null, medianaDias: null });
});

test('tiempoResolucion: nunca devuelve duraciones negativas', () => {
  const r = M.tiempoResolucion([cerrada(5, 9)]);
  assert.equal(r.promedioDias, 0);
});

test('tiempoResolucion: la mediana de una cantidad par promedia los dos valores centrales', () => {
  const r = M.tiempoResolucion([cerrada(10, 8), cerrada(10, 4), cerrada(10, 6), cerrada(10, 0)]);
  assert.equal(r.medianaDias, 5);
});

// ===== vista completa =====

test('construirVista: junta las métricas de todas las secciones', () => {
  const v = M.construirVista({
    solicitudes: [
      solicitud({ id: 'a', creado_en: iso(9), asignada_a: 'u1' }),
      solicitud({ id: 'b', creado_en: iso(2), estado: 'finalizado', es_anonimo: true, parroquia: null })
    ],
    equipo: { u1: 'Ana Pérez' },
    perfiles: [perfil('usuaria', 3), perfil('admin', 30)],
    publicaciones: [pub('semanario', true, ymd(4))],
    periodoDias: null,
    ahora: AHORA
  });
  assert.equal(v.totalHistorico, 2);
  assert.equal(v.k.total, 2);
  assert.equal(v.cola.total, 1);
  assert.equal(v.cola.items[0].vencida, true);
  assert.equal(v.parroquias.sinSolicitudes.length, M.PARROQUIAS.length - 1); // todas las oficiales menos Libertad, que tiene una solicitud
  assert.equal(v.asesoras.items[0].etiqueta, 'Ana Pérez');
  assert.equal(v.usuarias.registradas, 1);
  assert.equal(v.publicaciones.publicadas, 1);
  assert.equal(v.recientes.length, 2);
  assert.equal(v.resolucion.n, 0);
});

test('construirVista: usuarias y publicaciones son null cuando no hay datos', () => {
  const v = M.construirVista({ solicitudes: [], equipo: {}, perfiles: null, publicaciones: null, periodoDias: 30, ahora: AHORA });
  assert.equal(v.usuarias, null);
  assert.equal(v.publicaciones, null);
  assert.equal(v.k.total, 0);
  assert.equal(v.cola.total, 0);
});
