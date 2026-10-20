const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../Admin/asignacion.js');

function perfil(id, nombre, rol) {
  return { id, nombre_completo: nombre, nombre_usuario: nombre ? nombre.split(' ')[0].toLowerCase() : null, email: id + '@correo.test', rol: rol || 'asesora' };
}

function persona(id, perfilId, cargo, nombre, extra) {
  return Object.assign({ id, perfil_id: perfilId, cargo, activa: true, perfil: perfil(perfilId, nombre) }, extra || {});
}

const DAHIZE = persona('p1', 'u1', 'abogada_institucional', 'Dahize Barrada');
const COMUNAL = persona('p2', 'u2', 'abogada_comunal', 'Marta Colina');
const PSICOLOGA = persona('p3', 'u3', 'psicologa', 'Lucía Fuenmayor');
const DEFENSORA = persona('p4', 'u4', 'defensora', 'Ana Ríos', { perfil: perfil('u4', 'Ana Ríos', 'usuaria') });
const PERSONAL = [DAHIZE, COMUNAL, PSICOLOGA, DEFENSORA];

function asig(id, solicitud, personal, posicion, extra) {
  return Object.assign({ id, solicitud_id: solicitud, personal_id: personal, posicion, liberada_en: null, solicitud: { estado: 'pendiente' } }, extra || {});
}

// ---------- Cargos y nombres ----------

test('etiquetaCargo: da el texto de cada cargo y no se rompe con uno desconocido', () => {
  assert.equal(A.etiquetaCargo('abogada_institucional'), 'Abogada institucional');
  assert.equal(A.etiquetaCargo('abogada_comunal'), 'Abogada comunal');
  assert.equal(A.etiquetaCargo('psicologa'), 'Psicóloga');
  assert.equal(A.etiquetaCargo('defensora'), 'Defensora');
  assert.equal(A.etiquetaCargo('otra'), 'Sin cargo');
  assert.equal(A.etiquetaCargo(null), 'Sin cargo');
});

test('CARGOS: son exactamente los cuatro del instituto y la institucional va primero', () => {
  assert.deepEqual(A.CARGOS_ORDENADOS, ['abogada_institucional', 'abogada_comunal', 'psicologa', 'defensora']);
});

test('nombreDePerfil: usa el nombre completo, luego el usuario, luego el correo', () => {
  assert.equal(A.nombreDePerfil({ nombre_completo: 'Ana Ríos', nombre_usuario: 'ana', email: 'a@b.c' }), 'Ana Ríos');
  assert.equal(A.nombreDePerfil({ nombre_completo: '  ', nombre_usuario: 'ana', email: 'a@b.c' }), 'ana');
  assert.equal(A.nombreDePerfil({ nombre_completo: null, nombre_usuario: null, email: 'a@b.c' }), 'a@b.c');
  assert.equal(A.nombreDePerfil({}), 'Sin nombre');
  assert.equal(A.nombreDePerfil(null), 'Sin nombre');
});

test('nombreDePersonal: toma el nombre de la cuenta enlazada', () => {
  assert.equal(A.nombreDePersonal(DAHIZE), 'Dahize Barrada');
  assert.equal(A.nombreDePersonal({ id: 'x' }), 'Sin nombre');
});

// ---------- Quién puede asignar ----------

test('abogadaInstitucional: devuelve solo a la que está activa', () => {
  assert.equal(A.abogadaInstitucional(PERSONAL).id, 'p1');
  assert.equal(A.abogadaInstitucional([Object.assign({}, DAHIZE, { activa: false }), COMUNAL]), null);
  assert.equal(A.abogadaInstitucional([]), null);
  assert.equal(A.abogadaInstitucional(null), null);
});

test('puedeAsignar: solo la cuenta de la abogada institucional activa', () => {
  assert.equal(A.puedeAsignar(PERSONAL, 'u1'), true);
  assert.equal(A.puedeAsignar(PERSONAL, 'u2'), false, 'la abogada comunal no asigna');
  assert.equal(A.puedeAsignar(PERSONAL, 'u3'), false, 'la psicóloga no asigna');
  assert.equal(A.puedeAsignar(PERSONAL, 'otra-cuenta'), false);
  assert.equal(A.puedeAsignar(PERSONAL, null), false);
  assert.equal(A.puedeAsignar(PERSONAL, undefined), false);
});

test('puedeAsignar: si la institucional fue retirada, nadie asigna', () => {
  const retirada = [Object.assign({}, DAHIZE, { activa: false }), COMUNAL];
  assert.equal(A.puedeAsignar(retirada, 'u1'), false);
  assert.equal(A.puedeAsignar([], 'u1'), false);
  assert.equal(A.puedeAsignar(null, 'u1'), false);
});

test('avisoDeAcceso: la abogada institucional necesita rol Asesora o Admin para entrar al panel y asignar', () => {
  const sinAcceso = persona('p1', 'u1', 'abogada_institucional', 'Dahize Barrada', { perfil: perfil('u1', 'Dahize Barrada', 'usuaria') });
  assert.match(A.avisoDeAcceso(sinAcceso), /panel/i);
  assert.equal(A.avisoDeAcceso(DAHIZE), null);
  const admin = persona('p1', 'u1', 'abogada_institucional', 'Dahize Barrada', { perfil: perfil('u1', 'Dahize Barrada', 'admin') });
  assert.equal(A.avisoDeAcceso(admin), null);
});

test('avisoDeAcceso: los demás cargos no necesitan entrar al panel para figurar en el personal', () => {
  assert.equal(A.avisoDeAcceso(DEFENSORA), null);
  assert.equal(A.avisoDeAcceso(persona('p9', 'u9', 'psicologa', 'Sin Panel', { perfil: perfil('u9', 'Sin Panel', 'usuaria') })), null);
});

// ---------- Alta de personal ----------

test('validarAlta: pide persona y cargo', () => {
  assert.equal(A.validarAlta(PERSONAL, '', 'psicologa').ok, false);
  assert.equal(A.validarAlta(PERSONAL, null, 'psicologa').ok, false);
  assert.equal(A.validarAlta(PERSONAL, 'u9', '').ok, false);
  assert.equal(A.validarAlta(PERSONAL, 'u9', 'enfermera').ok, false);
});

test('validarAlta: acepta a una persona nueva con un cargo válido', () => {
  assert.deepEqual(A.validarAlta(PERSONAL, 'u9', 'psicologa'), { ok: true });
  assert.deepEqual(A.validarAlta([], 'u1', 'abogada_institucional'), { ok: true });
});

test('validarAlta: no repite a la misma persona con el mismo cargo mientras esté activa', () => {
  const r = A.validarAlta(PERSONAL, 'u3', 'psicologa');
  assert.equal(r.ok, false);
  assert.match(r.motivo, /ya está/i);
});

test('validarAlta: permite reincorporar a quien fue retirada y darle otro cargo', () => {
  const conRetirada = [Object.assign({}, PSICOLOGA, { activa: false })];
  assert.equal(A.validarAlta(conRetirada, 'u3', 'psicologa').ok, true);
  assert.equal(A.validarAlta(PERSONAL, 'u3', 'defensora').ok, true);
});

test('validarAlta: solo puede haber una abogada institucional activa y el aviso dice quién es', () => {
  const r = A.validarAlta(PERSONAL, 'u9', 'abogada_institucional');
  assert.equal(r.ok, false);
  assert.match(r.motivo, /Dahize Barrada/);
  assert.match(r.motivo, /institucional/i);
});

test('validarAlta: la institucional retirada se puede reemplazar', () => {
  const retirada = [Object.assign({}, DAHIZE, { activa: false })];
  assert.equal(A.validarAlta(retirada, 'u9', 'abogada_institucional').ok, true);
});

// ---------- Equipo de un caso ----------

test('validarEquipo: sin nadie es válido (deja el caso sin asignar)', () => {
  assert.deepEqual(A.validarEquipo([], PERSONAL), { ok: true, ids: [] });
  assert.deepEqual(A.validarEquipo(['', null, undefined], PERSONAL), { ok: true, ids: [] });
  assert.deepEqual(A.validarEquipo(null, PERSONAL), { ok: true, ids: [] });
});

test('validarEquipo: acepta una o dos personas y conserva el orden', () => {
  assert.deepEqual(A.validarEquipo(['p3'], PERSONAL), { ok: true, ids: ['p3'] });
  assert.deepEqual(A.validarEquipo(['p3', 'p2'], PERSONAL), { ok: true, ids: ['p3', 'p2'] });
});

test('validarEquipo: si solo se elige el apoyo, pasa a ser el responsable', () => {
  assert.deepEqual(A.validarEquipo(['', 'p2'], PERSONAL), { ok: true, ids: ['p2'] });
});

test('validarEquipo: rechaza repetir a la misma persona', () => {
  const r = A.validarEquipo(['p3', 'p3'], PERSONAL);
  assert.equal(r.ok, false);
  assert.match(r.motivo, /misma persona/i);
});

test('validarEquipo: un caso admite como máximo dos personas', () => {
  const r = A.validarEquipo(['p1', 'p2', 'p3'], PERSONAL);
  assert.equal(r.ok, false);
  assert.match(r.motivo, /dos/i);
  assert.equal(A.MAX_POR_CASO, 2);
});

test('validarEquipo: rechaza personal retirado o que no existe', () => {
  const conRetirada = PERSONAL.map(function (p) { return p.id === 'p3' ? Object.assign({}, p, { activa: false }) : p; });
  assert.equal(A.validarEquipo(['p3'], conRetirada).ok, false);
  assert.equal(A.validarEquipo(['nadie'], PERSONAL).ok, false);
});

// ---------- Asignaciones por caso ----------

test('agruparPorCaso: separa por solicitud, ordena por posición y deja fuera lo liberado', () => {
  const filas = [
    asig('a1', 's1', 'p3', 2),
    asig('a2', 's1', 'p2', 1),
    asig('a3', 's2', 'p4', 1),
    asig('a4', 's1', 'p1', 1, { liberada_en: '2026-10-01T00:00:00Z' })
  ];
  const g = A.agruparPorCaso(filas);
  assert.deepEqual(g.s1.map(function (x) { return x.personal_id; }), ['p2', 'p3']);
  assert.deepEqual(g.s2.map(function (x) { return x.personal_id; }), ['p4']);
});

test('agruparPorCaso: las claves son texto aunque el id de la solicitud sea numérico', () => {
  const g = A.agruparPorCaso([asig('a1', 7, 'p3', 1)]);
  assert.ok(g['7']);
  assert.equal(g['7'].length, 1);
  assert.deepEqual(A.agruparPorCaso(null), {});
});

test('equipoDeCaso: marca responsable y apoyo con nombre y cargo', () => {
  const filas = [asig('a1', 's1', 'p3', 2), asig('a2', 's1', 'p2', 1)];
  const eq = A.equipoDeCaso(filas, PERSONAL);
  assert.equal(eq.length, 2);
  assert.deepEqual(eq[0], { personalId: 'p2', posicion: 1, rol: 'Responsable', nombre: 'Marta Colina', cargo: 'abogada_comunal', cargoEtiqueta: 'Abogada comunal', retirada: false });
  assert.equal(eq[1].rol, 'Apoyo');
  assert.equal(eq[1].cargoEtiqueta, 'Psicóloga');
});

test('equipoDeCaso: si la persona fue retirada del personal lo avisa pero conserva el nombre', () => {
  const personal = PERSONAL.map(function (p) { return p.id === 'p3' ? Object.assign({}, p, { activa: false }) : p; });
  const eq = A.equipoDeCaso([asig('a1', 's1', 'p3', 1)], personal);
  assert.equal(eq[0].retirada, true);
  assert.equal(eq[0].nombre, 'Lucía Fuenmayor');
});

test('equipoDeCaso: una asignación cuyo personal ya no se encuentra no rompe la lista', () => {
  const eq = A.equipoDeCaso([asig('a1', 's1', 'fantasma', 1)], PERSONAL);
  assert.equal(eq.length, 1);
  assert.equal(eq[0].nombre, 'Persona no encontrada');
  assert.equal(eq[0].retirada, true);
});

// ---------- Carga de trabajo ----------

test('casosAbiertosPorPersona: cuenta solo casos pendientes o en proceso y no los liberados', () => {
  const filas = [
    asig('a1', 's1', 'p3', 1, { solicitud: { estado: 'pendiente' } }),
    asig('a2', 's2', 'p3', 1, { solicitud: { estado: 'en proceso' } }),
    asig('a3', 's3', 'p3', 1, { solicitud: { estado: 'finalizado' } }),
    asig('a4', 's4', 'p3', 1, { solicitud: { estado: 'cancelado' } }),
    asig('a5', 's5', 'p3', 1, { liberada_en: '2026-10-01T00:00:00Z' }),
    asig('a6', 's6', 'p2', 2, { solicitud: { estado: 'pendiente' } })
  ];
  const c = A.casosAbiertosPorPersona(filas);
  assert.equal(c.p3, 2);
  assert.equal(c.p2, 1);
  assert.equal(c.p1, undefined);
});

test('opcionesDeAsignacion: agrupa por cargo, deja fuera al personal retirado y muestra la carga', () => {
  const personal = PERSONAL.concat([persona('p5', 'u5', 'psicologa', 'Beatriz Mora', { activa: false }), persona('p6', 'u6', 'psicologa', 'Alicia Pérez')]);
  const grupos = A.opcionesDeAsignacion(personal, { p3: 2 });
  assert.deepEqual(grupos.map(function (g) { return g.cargo; }), ['abogada_institucional', 'abogada_comunal', 'psicologa', 'defensora']);
  const psico = grupos[2];
  assert.equal(psico.etiqueta, 'Psicóloga');
  assert.deepEqual(psico.items.map(function (i) { return i.nombre; }), ['Alicia Pérez', 'Lucía Fuenmayor']);
  assert.equal(psico.items[1].abiertos, 2);
  assert.equal(psico.items[0].abiertos, 0);
});

test('opcionesDeAsignacion: sin personal no hay grupos', () => {
  assert.deepEqual(A.opcionesDeAsignacion([], {}), []);
  assert.deepEqual(A.opcionesDeAsignacion(null, null), []);
});

// ---------- Cola de la abogada institucional ----------

const S_ABIERTA = { id: 's1', estado: 'pendiente' };
const S_PROCESO = { id: 's2', estado: 'en proceso' };
const S_CERRADA = { id: 's3', estado: 'finalizado' };
const S_CANCELADA = { id: 's4', estado: 'cancelado' };

test('estaSinAsignar: solo los casos abiertos sin nadie asignado', () => {
  const equipos = { s2: [{ personalId: 'p3' }] };
  assert.equal(A.estaSinAsignar(S_ABIERTA, equipos), true);
  assert.equal(A.estaSinAsignar(S_PROCESO, equipos), false);
  assert.equal(A.estaSinAsignar(S_CERRADA, equipos), false);
  assert.equal(A.estaSinAsignar(S_CANCELADA, equipos), false);
});

test('estaSinAsignar: si todo el personal asignado fue retirado, el caso vuelve a la cola para reasignarlo', () => {
  const soloRetiradas = { s1: [{ personalId: 'p3', retirada: true }] };
  assert.equal(A.estaSinAsignar(S_ABIERTA, soloRetiradas), true);
  const unaVigente = { s1: [{ personalId: 'p3', retirada: true }, { personalId: 'p2', retirada: false }] };
  assert.equal(A.estaSinAsignar(S_ABIERTA, unaVigente), false);
  assert.equal(A.contarSinAsignar([S_ABIERTA, S_PROCESO], { s1: soloRetiradas.s1, s2: [{ personalId: 'p2' }] }), 1);
});

test('contarSinAsignar y filtrarPorAsignacion: sin asignar, mías y todas', () => {
  const solicitudes = [S_ABIERTA, S_PROCESO, S_CERRADA, S_CANCELADA];
  const equipos = { s2: [{ personalId: 'p3' }], s3: [{ personalId: 'p3' }] };
  assert.equal(A.contarSinAsignar(solicitudes, equipos), 1);
  assert.deepEqual(A.filtrarPorAsignacion(solicitudes, equipos, 'sin-asignar', []).map(function (s) { return s.id; }), ['s1']);
  assert.deepEqual(A.filtrarPorAsignacion(solicitudes, equipos, 'mias', ['p3']).map(function (s) { return s.id; }), ['s2', 's3']);
  assert.deepEqual(A.filtrarPorAsignacion(solicitudes, equipos, 'mias', []).map(function (s) { return s.id; }), []);
  assert.equal(A.filtrarPorAsignacion(solicitudes, equipos, '', []).length, 4);
  assert.equal(A.filtrarPorAsignacion(solicitudes, equipos, 'todas', []).length, 4);
});

// ---------- Texto seguro y errores ----------

test('escapar: neutraliza HTML y comillas y tolera nulos y números', () => {
  assert.equal(A.escapar('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(A.escapar('a & "b" \'c\''), 'a &amp; &quot;b&quot; &#39;c&#39;');
  assert.equal(A.escapar(null), '');
  assert.equal(A.escapar(undefined), '');
  assert.equal(A.escapar(42), '42');
});

test('faltaConfigurar: reconoce que las tablas o la función de asignación no existen todavía', () => {
  assert.equal(A.faltaConfigurar({ code: 'PGRST205', message: "Could not find the table 'public.personal_asesoria' in the schema cache" }), true);
  assert.equal(A.faltaConfigurar({ code: '42P01', message: 'relation "personal_asesoria" does not exist' }), true);
  assert.equal(A.faltaConfigurar({ code: 'PGRST202', message: 'Could not find the function public.asignar_caso' }), true);
  assert.equal(A.faltaConfigurar({ code: '42501', message: 'permission denied' }), false);
  assert.equal(A.faltaConfigurar(null), false);
});

test('mensajeDeError: explica en español los fallos más comunes', () => {
  assert.match(A.mensajeDeError({ code: '42P01', message: 'x' }), /setup_asignacion_casos\.sql/);
  assert.match(A.mensajeDeError({ code: '23505', message: 'duplicate key' }), /ya/i);
  assert.match(A.mensajeDeError({ code: '42501', message: 'permission denied for table' }), /permiso/i);
  assert.equal(A.mensajeDeError({ code: 'P0001', message: 'Solo la abogada institucional puede asignar casos.' }), 'Solo la abogada institucional puede asignar casos.');
  assert.match(A.mensajeDeError(null), /inesperado/i);
  assert.match(A.mensajeDeError({}), /inesperado/i);
});
