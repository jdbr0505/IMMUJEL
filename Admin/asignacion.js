// asignacion.js – Reglas puras de la asignación de casos (sin DOM ni red).
// Se usa en el navegador (window.Asignacion) y en Node para las pruebas.
//
// Modelo: el personal de asesorías (tabla personal_asesoria) lo administra la administradora; los casos los asigna
// únicamente la abogada institucional, de a una o dos personas por caso (responsable y apoyo).
// La base de datos hace cumplir estas mismas reglas (supabase-sql/setup_asignacion_casos.sql); aquí se repiten
// para avisar a tiempo y para pintar la interfaz.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Asignacion = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var MAX_POR_CASO = 2;
  var INSTITUCIONAL = 'abogada_institucional';
  var CARGOS_ORDENADOS = [INSTITUCIONAL, 'abogada_comunal', 'psicologa', 'defensora'];
  var CARGOS = {
    abogada_institucional: { etiqueta: 'Abogada institucional', ayuda: 'Recibe todos los casos y es la única que los asigna.' },
    abogada_comunal: { etiqueta: 'Abogada comunal', ayuda: 'Da seguimiento a los órganos receptores de denuncias.' },
    psicologa: { etiqueta: 'Psicóloga', ayuda: 'Acompañamiento psicológico.' },
    defensora: { etiqueta: 'Defensora', ayuda: 'Cubre el seguimiento cuando la abogada comunal no puede.' }
  };
  var ROLES_EN_CASO = { 1: 'Responsable', 2: 'Apoyo' };
  var ESTADOS_ABIERTOS = ['pendiente', 'en proceso'];
  var ROLES_CON_PANEL = ['admin', 'asesora'];
  var CODIGOS_SIN_CONFIGURAR = ['PGRST205', 'PGRST202', '42P01', '42883'];

  function texto(valor) { return typeof valor === 'string' ? valor.trim() : ''; }
  function esCargo(cargo) { return typeof cargo === 'string' && CARGOS_ORDENADOS.indexOf(cargo) !== -1; }
  function esActiva(fila) { return !!fila && !!fila.activa; }
  function lista(valor) { return Array.isArray(valor) ? valor : []; }
  function porNombre(a, b) { return a.nombre.localeCompare(b.nombre, 'es'); }

  function etiquetaCargo(cargo) { return esCargo(cargo) ? CARGOS[cargo].etiqueta : 'Sin cargo'; }

  function nombreDePerfil(perfil) {
    if (!perfil) return 'Sin nombre';
    return texto(perfil.nombre_completo) || texto(perfil.nombre_usuario) || texto(perfil.email) || 'Sin nombre';
  }
  function nombreDePersonal(fila) { return nombreDePerfil(fila && fila.perfil); }

  function indexarPersonal(personal) {
    var mapa = {};
    lista(personal).forEach(function (fila) { mapa[fila.id] = fila; });
    return mapa;
  }

  // ---------- Quién puede asignar ----------

  function abogadaInstitucional(personal) {
    return lista(personal).filter(function (f) { return esActiva(f) && f.cargo === INSTITUCIONAL; })[0] || null;
  }

  function puedeAsignar(personal, idCuenta) {
    if (!idCuenta) return false;
    return lista(personal).some(function (f) { return esActiva(f) && f.cargo === INSTITUCIONAL && f.perfil_id === idCuenta; });
  }

  // La abogada institucional asigna desde el panel, así que su cuenta necesita rol Asesora o Admin.
  function avisoDeAcceso(fila) {
    if (!fila || fila.cargo !== INSTITUCIONAL) return null;
    var rol = fila.perfil && fila.perfil.rol;
    if (ROLES_CON_PANEL.indexOf(rol) !== -1) return null;
    return 'Todavía no puede entrar al panel: cambia su rol a Asesora en la tabla de usuarias.';
  }

  // ---------- Alta de personal ----------

  function validarAlta(personal, idCuenta, cargo) {
    if (!idCuenta) return { ok: false, motivo: 'Elige a una persona de la lista.' };
    if (!esCargo(cargo)) return { ok: false, motivo: 'Elige un cargo.' };
    var activos = lista(personal).filter(esActiva);
    var repetida = activos.some(function (f) { return f.perfil_id === idCuenta && f.cargo === cargo; });
    if (repetida) return { ok: false, motivo: 'Esa persona ya está en el personal con ese cargo.' };
    if (cargo === INSTITUCIONAL) {
      var actual = activos.filter(function (f) { return f.cargo === INSTITUCIONAL; })[0];
      if (actual) {
        return { ok: false, motivo: 'Ya hay una abogada institucional activa: ' + nombreDePersonal(actual) + '. Retírala antes de agregar a otra.' };
      }
    }
    return { ok: true };
  }

  // ---------- Equipo de un caso ----------

  // ids = personal elegido (responsable primero, apoyo después). Los vacíos se descartan: si solo se eligió el apoyo,
  // pasa a ser el responsable.
  function validarEquipo(ids, personal) {
    var elegidos = lista(ids).filter(function (v) { return v !== null && v !== undefined && String(v).trim() !== ''; });
    if (elegidos.length > MAX_POR_CASO) return { ok: false, motivo: 'Un caso admite como máximo dos personas.' };
    var activos = indexarPersonal(lista(personal).filter(esActiva));
    for (var i = 0; i < elegidos.length; i++) {
      if (elegidos.indexOf(elegidos[i]) !== i) return { ok: false, motivo: 'No puedes elegir a la misma persona dos veces.' };
      if (!activos[elegidos[i]]) return { ok: false, motivo: 'Una de las personas elegidas ya no está disponible.' };
    }
    return { ok: true, ids: elegidos };
  }

  // Asignaciones vigentes agrupadas por solicitud (clave = id como texto), cada grupo ordenado por posición.
  function agruparPorCaso(filas) {
    var grupos = {};
    lista(filas).forEach(function (fila) {
      if (fila.liberada_en) return;
      var clave = String(fila.solicitud_id);
      (grupos[clave] = grupos[clave] || []).push(fila);
    });
    Object.keys(grupos).forEach(function (clave) {
      grupos[clave].sort(function (a, b) { return a.posicion - b.posicion; });
    });
    return grupos;
  }

  function equipoDeCaso(filas, personal) {
    var porId = indexarPersonal(personal);
    return lista(filas)
      .filter(function (fila) { return !fila.liberada_en; })
      .sort(function (a, b) { return a.posicion - b.posicion; })
      .map(function (fila) {
        var persona = porId[fila.personal_id];
        return {
          personalId: fila.personal_id,
          posicion: fila.posicion,
          rol: ROLES_EN_CASO[fila.posicion] || 'Apoyo',
          nombre: persona ? nombreDePersonal(persona) : 'Persona no encontrada',
          cargo: persona ? persona.cargo : null,
          cargoEtiqueta: persona ? etiquetaCargo(persona.cargo) : 'Sin cargo',
          retirada: persona ? !persona.activa : true
        };
      });
  }

  // ---------- Carga de trabajo y opciones del selector ----------

  // filas = asignaciones con su solicitud embebida ({ solicitud: { estado } }). Devuelve { personalId: casosAbiertos }.
  function casosAbiertosPorPersona(filas) {
    var cuenta = {};
    lista(filas).forEach(function (fila) {
      if (fila.liberada_en) return;
      var estado = fila.solicitud && fila.solicitud.estado;
      if (ESTADOS_ABIERTOS.indexOf(estado) === -1) return;
      cuenta[fila.personal_id] = (cuenta[fila.personal_id] || 0) + 1;
    });
    return cuenta;
  }

  // Personal activo agrupado por cargo, con cuántos casos abiertos lleva cada quien (para repartir con criterio).
  function opcionesDeAsignacion(personal, carga) {
    var cargaPor = carga || {};
    return CARGOS_ORDENADOS.map(function (cargo) {
      var items = lista(personal)
        .filter(function (f) { return esActiva(f) && f.cargo === cargo; })
        .map(function (f) { return { id: f.id, nombre: nombreDePersonal(f), abiertos: cargaPor[f.id] || 0 }; })
        .sort(porNombre);
      return { cargo: cargo, etiqueta: etiquetaCargo(cargo), items: items };
    }).filter(function (grupo) { return grupo.items.length > 0; });
  }

  // ---------- Cola de la abogada institucional ----------

  function estaAbierta(solicitud) { return !!solicitud && ESTADOS_ABIERTOS.indexOf(solicitud.estado) !== -1; }

  // Cuenta solo al personal que sigue activo: si a quien tenía el caso la retiraron, el caso vuelve a esperar reasignación.
  function tieneEquipo(solicitud, equipos) {
    var equipo = equipos && equipos[String(solicitud.id)];
    return !!equipo && equipo.some(function (e) { return !e.retirada; });
  }

  function estaSinAsignar(solicitud, equipos) { return estaAbierta(solicitud) && !tieneEquipo(solicitud, equipos); }

  function contarSinAsignar(solicitudes, equipos) {
    return lista(solicitudes).filter(function (s) { return estaSinAsignar(s, equipos); }).length;
  }

  // filtro: 'sin-asignar' | 'mias' (casos donde figura alguna de mis filas de personal) | cualquier otro valor = todas.
  function filtrarPorAsignacion(solicitudes, equipos, filtro, misPersonalIds) {
    var todas = lista(solicitudes);
    if (filtro === 'sin-asignar') return todas.filter(function (s) { return estaSinAsignar(s, equipos); });
    if (filtro === 'mias') {
      var mias = lista(misPersonalIds);
      return todas.filter(function (s) {
        var equipo = equipos && equipos[String(s.id)];
        return !!equipo && equipo.some(function (e) { return mias.indexOf(e.personalId) !== -1; });
      });
    }
    return todas.slice();
  }

  // ---------- Texto seguro y errores ----------

  var ENTIDADES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function escapar(valor) {
    if (valor === null || valor === undefined) return '';
    return String(valor).replace(/[&<>"']/g, function (c) { return ENTIDADES[c]; });
  }

  // Las tablas o la función aún no existen: se desplegó la página pero falta correr el script en Supabase.
  function faltaConfigurar(error) {
    return !!error && CODIGOS_SIN_CONFIGURAR.indexOf(error.code) !== -1;
  }

  function mensajeDeError(error) {
    if (!error) return 'Ocurrió un error inesperado. Intenta de nuevo.';
    if (faltaConfigurar(error)) {
      return 'Falta activar la asignación de casos en la base de datos: ejecuta supabase-sql/setup_asignacion_casos.sql en Supabase.';
    }
    if (error.code === '23505') return 'Esa persona ya figura con ese cargo, o ya hay una abogada institucional activa.';
    if (error.code === '42501') {
      return /abogada institucional/i.test(error.message || '') ? error.message : 'No tienes permiso para hacer esto.';
    }
    return error.message || 'Ocurrió un error inesperado. Intenta de nuevo.';
  }

  return {
    MAX_POR_CASO: MAX_POR_CASO,
    INSTITUCIONAL: INSTITUCIONAL,
    CARGOS: CARGOS,
    CARGOS_ORDENADOS: CARGOS_ORDENADOS,
    ESTADOS_ABIERTOS: ESTADOS_ABIERTOS,
    etiquetaCargo: etiquetaCargo,
    nombreDePerfil: nombreDePerfil,
    nombreDePersonal: nombreDePersonal,
    abogadaInstitucional: abogadaInstitucional,
    puedeAsignar: puedeAsignar,
    avisoDeAcceso: avisoDeAcceso,
    validarAlta: validarAlta,
    validarEquipo: validarEquipo,
    agruparPorCaso: agruparPorCaso,
    equipoDeCaso: equipoDeCaso,
    casosAbiertosPorPersona: casosAbiertosPorPersona,
    opcionesDeAsignacion: opcionesDeAsignacion,
    estaSinAsignar: estaSinAsignar,
    contarSinAsignar: contarSinAsignar,
    filtrarPorAsignacion: filtrarPorAsignacion,
    escapar: escapar,
    faltaConfigurar: faltaConfigurar,
    mensajeDeError: mensajeDeError
  };
});
