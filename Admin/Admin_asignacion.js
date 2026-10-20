// Admin_asignacion.js – Personal de asesorías (pestaña Usuarias) y asignación de casos (pestaña Asesorías).
// Las reglas viven en asignacion.js (probadas en tests/) y la base de datos las vuelve a exigir
// (supabase-sql/setup_asignacion_casos.sql): aquí solo se pinta y se llama a Supabase.
//   · La administradora agrega, retira y reincorpora personal.
//   · Solo la abogada institucional asigna casos, de a una o dos personas (responsable y apoyo).
(function () {
  var A = window.Asignacion;
  if (!A) return;
  var esc = A.escapar;

  var COLUMNAS_PERSONAL = 'id, perfil_id, cargo, activa, agregada_en, retirada_en, perfil:perfiles!perfil_id(id, nombre_completo, nombre_usuario, email, telefono, rol)';
  var COLUMNAS_ASIGNACION = 'id, solicitud_id, personal_id, posicion, asignada_por, asignada_en, solicitud:solicitudes!solicitud_id(estado)';
  var SIN_CONFIGURAR = 'La asignación de casos todavía no está activada en la base de datos. La administradora debe ejecutar supabase-sql/setup_asignacion_casos.sql en Supabase.';
  var SIN_PERMISO = { code: '42501', message: 'permission denied' };

  var ctx = null;
  var estado = {
    disponible: true,        // false = faltan las tablas o la función: se despliega la página antes de correr el SQL
    personal: [],            // todas las filas de personal_asesoria (activas y retiradas) con su cuenta
    asignaciones: [],        // asignaciones vigentes con el estado de su solicitud
    porCaso: {},             // asignaciones vigentes agrupadas por solicitud
    equipos: {},             // equipo de cada caso (nombre, cargo, rol, si fue retirada), calculado una vez por carga
    cuentas: [],             // cuentas registradas (solo las conoce la administradora)
    cuentaPorTexto: {}       // texto del buscador → id de la cuenta
  };

  function el(id) { return document.getElementById(id); }
  // showToast pinta HTML: todo mensaje que llega aquí es texto plano y se escapa antes de entregarlo.
  function avisar(mensaje, tipo) { if (ctx && ctx.notify) ctx.notify(esc(mensaje), tipo); }
  function fecha(valor) {
    return valor ? new Date(valor).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
  }
  function porId(filas) {
    return filas.reduce(function (mapa, fila) { mapa[fila.id] = fila; return mapa; }, {});
  }

  function iniciar(contexto) {
    ctx = contexto;
    var formulario = el('personal-form');
    if (formulario) formulario.addEventListener('submit', agregarPersonal);
    var cargo = el('personal-cargo');
    if (cargo) cargo.addEventListener('change', mostrarAyudaDelCargo);
    var cuerpo = el('personal-tbody');
    if (cuerpo) cuerpo.addEventListener('click', accionEnFila);
  }

  // ---------- Datos ----------

  function registrarFallo(error) {
    if (A.faltaConfigurar(error)) estado.disponible = false;
    else console.error('Asignación de casos:', error);
  }

  // Equipo de cada caso con nombres y cargos: se calcula una vez por carga y no en cada fila de la tabla.
  function recalcularEquipos() {
    var mapa = {};
    Object.keys(estado.porCaso).forEach(function (clave) {
      mapa[clave] = A.equipoDeCaso(estado.porCaso[clave], estado.personal);
    });
    estado.equipos = mapa;
  }

  async function cargarPersonal(cuentas) {
    if (Array.isArray(cuentas)) {
      estado.cuentas = cuentas;
      prepararBuscador();
    }
    var res = await ctx.supabase.from('personal_asesoria').select(COLUMNAS_PERSONAL).order('agregada_en', { ascending: true });
    if (res.error) {
      registrarFallo(res.error);
      estado.personal = [];
    } else {
      estado.disponible = true;
      estado.personal = res.data || [];
    }
    recalcularEquipos();
    renderPersonal();
    return !res.error;
  }

  async function cargarAsignaciones() {
    if (!estado.disponible) {
      estado.asignaciones = [];
      estado.porCaso = {};
      recalcularEquipos();
      return false;
    }
    var res = await ctx.supabase.from('asignaciones_caso').select(COLUMNAS_ASIGNACION).is('liberada_en', null);
    if (res.error) {
      registrarFallo(res.error);
      estado.asignaciones = [];
    } else {
      estado.asignaciones = res.data || [];
    }
    estado.porCaso = A.agruparPorCaso(estado.asignaciones);
    recalcularEquipos();
    return !res.error;
  }

  async function cargar() {
    await cargarPersonal();
    await cargarAsignaciones();
    renderPersonal();
  }

  function puedeAsignar() { return estado.disponible && A.puedeAsignar(estado.personal, ctx && ctx.userId); }
  function disponible() { return estado.disponible; }

  // Mis filas de personal (activas): sirven para el filtro "Asignadas a mí".
  function misPersonalIds() {
    return estado.personal
      .filter(function (f) { return f.activa && f.perfil_id === ctx.userId; })
      .map(function (f) { return f.id; });
  }

  function equipoDe(solicitudId) { return estado.equipos[String(solicitudId)] || []; }

  function filtrar(solicitudes, filtro) {
    return A.filtrarPorAsignacion(solicitudes, estado.equipos, filtro, misPersonalIds());
  }

  function contarSinAsignar(solicitudes) { return A.contarSinAsignar(solicitudes, estado.equipos); }

  function nombreDeCuenta(idCuenta) {
    if (!idCuenta) return '—';
    var fila = estado.personal.filter(function (f) { return f.perfil_id === idCuenta; })[0];
    if (fila) return A.nombreDePersonal(fila);
    var cuenta = estado.cuentas.filter(function (c) { return c.id === idCuenta; })[0];
    return cuenta ? A.nombreDePerfil(cuenta) : '—';
  }

  // ---------- Tabla de asesorías: columna "Personal asignado" ----------

  function insigniaPendiente(texto) {
    return '<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs rounded-full font-semibold bg-amber-100 text-amber-800">' +
      '<span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>' + esc(texto) + '</span>';
  }

  // anterior = nombre de quien figura en solicitudes.asignada_a por la asignación de antes de este módulo.
  function celdaEquipo(solicitud, anterior) {
    var equipo = estado.disponible ? equipoDe(solicitud.id) : [];
    if (equipo.length) {
      var lista = '<div class="flex flex-col gap-1.5">' + equipo.map(function (e) {
        return '<div class="leading-tight"><span class="font-medium text-gray-800">' + esc(e.nombre) + '</span>' +
          (e.retirada ? ' <span class="text-xs text-amber-700">(retirada)</span>' : '') +
          '<span class="block text-xs text-gray-500">' + esc(e.cargoEtiqueta) + ' · ' + esc(e.rol) + '</span></div>';
      }).join('') + '</div>';
      return A.estaSinAsignar(solicitud, estado.equipos) ? lista + '<div class="mt-1.5">' + insigniaPendiente('Reasignar') + '</div>' : lista;
    }
    if (anterior) {
      return '<div class="leading-tight"><span class="font-medium text-gray-800">' + esc(anterior) + '</span>' +
        '<span class="block text-xs text-gray-500">Asignación anterior</span></div>';
    }
    if (estado.disponible && A.estaSinAsignar(solicitud, estado.equipos)) return insigniaPendiente('Sin asignar');
    return '<span class="text-gray-400">—</span>';
  }

  // Resumen de una línea bajo el nombre, para pantallas pequeñas donde la columna de personal queda fuera de vista.
  function resumenCorto(solicitud, anterior) {
    if (estado.disponible && A.estaSinAsignar(solicitud, estado.equipos)) return insigniaPendiente('Sin asignar');
    var activos = estado.disponible ? equipoDe(solicitud.id).filter(function (e) { return !e.retirada; }) : [];
    if (activos.length) {
      return '<span class="text-xs text-gray-500">' + esc(activos[0].nombre) + (activos.length > 1 ? ' +' + (activos.length - 1) : '') + '</span>';
    }
    return anterior ? '<span class="text-xs text-gray-500">' + esc(anterior) + '</span>' : '';
  }

  // "Asignar" resalta los casos abiertos que la abogada institucional todavía no repartió (o que perdieron a su personal).
  function etiquetaDeAccion(solicitud) {
    return puedeAsignar() && A.estaSinAsignar(solicitud, estado.equipos) ? 'Asignar' : 'Ver';
  }

  // ---------- Modal del caso ----------

  function opcionesHtml(grupos, seleccionado, vacio) {
    return '<option value="">' + esc(vacio) + '</option>' + grupos.map(function (grupo) {
      return '<optgroup label="' + esc(grupo.etiqueta) + '">' + grupo.items.map(function (item) {
        var carga = item.abiertos === 1 ? '1 caso abierto' : item.abiertos + ' casos abiertos';
        return '<option value="' + esc(item.id) + '"' + (item.id === seleccionado ? ' selected' : '') + '>' + esc(item.nombre) + ' · ' + carga + '</option>';
      }).join('') + '</optgroup>';
    }).join('');
  }

  function equipoActualHtml(equipo, anterior) {
    if (!equipo.length && anterior) {
      return '<p class="text-sm text-gray-600">Asignación anterior: <span class="font-medium text-gray-800">' + esc(anterior) + '</span>. Al asignar de nuevo, esta se reemplaza.</p>';
    }
    if (!equipo.length) return '<p class="text-sm text-gray-500">Este caso todavía no tiene personal asignado.</p>';
    return '<ul class="space-y-1.5">' + equipo.map(function (e) {
      return '<li class="flex flex-wrap items-baseline gap-x-2 text-sm"><span class="font-medium text-gray-800">' + esc(e.nombre) + '</span>' +
        '<span class="text-xs text-gray-500">' + esc(e.cargoEtiqueta) + ' · ' + esc(e.rol) + '</span>' +
        (e.retirada ? '<span class="text-xs text-amber-700">ya no está en el personal</span>' : '') + '</li>';
    }).join('') + '</ul>';
  }

  function formularioAsignarHtml(equipo) {
    var carga = A.casosAbiertosPorPersona(estado.asignaciones);
    var grupos = A.opcionesDeAsignacion(estado.personal, carga);
    if (!grupos.length) return '<p class="text-sm text-amber-700">No hay personal activo para asignar. La administradora debe agregarlo en Usuarias.</p>';
    // Quien ya fue retirada no aparece en las listas: queda en blanco y hay que elegir a su reemplazo.
    var responsable = equipo[0] && !equipo[0].retirada ? equipo[0].personalId : '';
    var apoyo = equipo[1] && !equipo[1].retirada ? equipo[1].personalId : '';
    var etiqueta = 'block text-xs text-gray-500 mb-1';
    var campo = 'w-full text-sm border border-gray-300 rounded-lg p-2 focus:ring-purple-500 focus:border-purple-500';
    return '<div class="grid gap-3 sm:grid-cols-2">' +
      '<div><label for="asig-responsable" class="' + etiqueta + '">Responsable</label>' +
      '<select id="asig-responsable" class="' + campo + '">' + opcionesHtml(grupos, responsable, 'Sin asignar') + '</select></div>' +
      '<div><label for="asig-apoyo" class="' + etiqueta + '">Apoyo (opcional)</label>' +
      '<select id="asig-apoyo" class="' + campo + '">' + opcionesHtml(grupos, apoyo, 'Ninguno') + '</select></div></div>' +
      '<p class="mt-2 text-xs text-gray-500">Un caso lleva hasta dos personas. Si hace falta seguimiento a los órganos receptores de denuncias, asigna a la abogada comunal; si ella no puede, a una defensora.</p>' +
      '<button type="button" id="btn-asignar" class="mt-2 w-full bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium py-2 rounded-lg transition">Guardar asignación</button>';
  }

  function avisoSoloLecturaHtml() {
    var institucional = A.abogadaInstitucional(estado.personal);
    var texto = institucional
      ? 'Solo la abogada institucional (' + esc(A.nombreDePersonal(institucional)) + ') asigna los casos.'
      : 'Todavía no hay abogada institucional activa. La administradora debe agregarla en Usuarias → Personal de asesorías.';
    return '<p class="text-sm text-gray-500"><i class="fas fa-lock mr-1.5 text-gray-400"></i>' + texto + '</p>';
  }

  // Bloque "Personal asignado" del detalle del caso. Los datos del solicitante los pinta Admin.js.
  // anterior = nombre de quien figura en solicitudes.asignada_a por la asignación de antes de este módulo.
  function bloqueModal(solicitud, anterior) {
    var titulo = '<p class="text-xs text-gray-400 mb-2">Personal asignado</p>';
    if (!estado.disponible) {
      return '<div class="mt-3 pt-3 border-t border-gray-100">' + titulo + equipoActualHtml([], anterior) +
        '<p class="mt-2 text-sm text-amber-700">' + esc(SIN_CONFIGURAR) + '</p></div>';
    }
    var equipo = equipoDe(solicitud.id);
    return '<div class="mt-3 pt-3 border-t border-gray-100" id="asignacion-bloque">' + titulo + equipoActualHtml(equipo, anterior) +
      '<div class="mt-3">' + (puedeAsignar() ? formularioAsignarHtml(equipo) : avisoSoloLecturaHtml()) + '</div>' +
      '<details class="mt-3 text-sm"><summary class="cursor-pointer text-xs text-gray-500 hover:text-gray-700">Historial de asignaciones</summary>' +
      '<div id="asig-historial" class="mt-2 text-xs text-gray-500">Cargando…</div></details></div>';
  }

  async function pintarHistorial(solicitudId) {
    var destino = el('asig-historial');
    if (!destino) return;
    var res = await ctx.supabase.from('asignaciones_caso')
      .select('personal_id, posicion, asignada_por, asignada_en, liberada_en, liberada_por')
      .eq('solicitud_id', solicitudId)
      .order('asignada_en', { ascending: false });
    if (res.error) { destino.textContent = 'No se pudo cargar el historial.'; return; }
    if (!res.data || !res.data.length) { destino.textContent = 'Aún no se ha asignado a nadie.'; return; }
    var personal = porId(estado.personal);
    destino.innerHTML = '<ul class="space-y-1">' + res.data.map(function (fila) {
      var persona = personal[fila.personal_id];
      var nombre = persona ? A.nombreDePersonal(persona) + ' (' + A.etiquetaCargo(persona.cargo) + ')' : 'Persona no encontrada';
      var rol = fila.posicion === 1 ? 'responsable' : 'apoyo';
      var cierre = fila.liberada_en ? 'liberada el ' + fecha(fila.liberada_en) : 'vigente';
      return '<li>' + esc(nombre) + ', ' + rol + ': asignada por ' + esc(nombreDeCuenta(fila.asignada_por)) + ' el ' + esc(fecha(fila.asignada_en)) + ' · ' + esc(cierre) + '</li>';
    }).join('') + '</ul>';
  }

  // Engancha el botón y el historial del bloque recién pintado. alGuardar() refresca el modal y la tabla.
  function enlazarModal(solicitudId, alGuardar) {
    if (!estado.disponible) return;
    pintarHistorial(solicitudId);
    var boton = el('btn-asignar');
    if (!boton) return;
    boton.addEventListener('click', async function () {
      var validacion = A.validarEquipo([el('asig-responsable').value, el('asig-apoyo').value], estado.personal);
      if (!validacion.ok) { avisar(validacion.motivo, 'warning'); return; }
      boton.disabled = true;
      var res = await ctx.supabase.rpc('asignar_caso', { p_solicitud: String(solicitudId), p_personal: validacion.ids });
      boton.disabled = false;
      if (res.error) { avisar(A.mensajeDeError(res.error), 'error'); return; }
      avisar(validacion.ids.length ? 'Asignación guardada.' : 'El caso quedó sin asignar.', 'success');
      await cargarAsignaciones();
      if (alGuardar) await alGuardar();
    });
  }

  // ---------- Pestaña Usuarias: personal de asesorías ----------

  function etiquetaCuenta(cuenta) {
    var nombre = A.nombreDePerfil(cuenta);
    return cuenta.email ? nombre + ' · ' + cuenta.email : nombre;
  }

  function prepararBuscador() {
    var lista = el('personal-cuentas');
    estado.cuentaPorTexto = {};
    if (!lista) return;
    lista.innerHTML = estado.cuentas.map(function (cuenta) {
      var texto = etiquetaCuenta(cuenta);
      estado.cuentaPorTexto[texto] = cuenta.id;
      return '<option value="' + esc(texto) + '"></option>';
    }).join('');
  }

  function mostrarAyudaDelCargo() {
    var ayuda = el('personal-cargo-ayuda');
    var cargo = el('personal-cargo');
    if (!ayuda || !cargo) return;
    ayuda.textContent = A.CARGOS[cargo.value] ? A.CARGOS[cargo.value].ayuda : '';
  }

  function avisoDePersonal() {
    var aviso = el('personal-aviso');
    if (!aviso) return;
    var mensaje = '';
    if (!estado.disponible) mensaje = SIN_CONFIGURAR;
    else if (!A.abogadaInstitucional(estado.personal)) {
      mensaje = 'No hay abogada institucional activa, así que nadie puede asignar casos. Agrégala con el cargo «Abogada institucional».';
    }
    aviso.textContent = mensaje;
    aviso.classList.toggle('hidden', !mensaje);
  }

  function resumenPorCargo() {
    var destino = el('personal-resumen');
    if (!destino) return;
    destino.innerHTML = A.CARGOS_ORDENADOS.map(function (cargo) {
      var n = estado.personal.filter(function (f) { return f.activa && f.cargo === cargo; }).length;
      return '<span class="inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded-full bg-purple-50 text-purple-800 font-semibold">' +
        esc(A.etiquetaCargo(cargo)) + '<span class="font-black">' + n + '</span></span>';
    }).join('');
  }

  function filaPersonal(fila, carga) {
    var nombre = A.nombreDePersonal(fila);
    var perfil = fila.perfil || {};
    var aviso = fila.activa ? A.avisoDeAcceso(fila) : null;
    var abiertos = carga[fila.id] || 0;
    var botonAcceso = ' <button type="button" class="underline font-semibold" data-accion="dar-acceso" data-perfil="' + esc(fila.perfil_id) + '" data-nombre="' + esc(nombre) + '">Dar rol Asesora</button>';
    var estadoHtml = fila.activa
      ? '<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs rounded-full font-semibold bg-green-100 text-green-800"><span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>Disponible</span>'
      : '<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs rounded-full font-semibold bg-gray-200 text-gray-900"><span class="w-1.5 h-1.5 rounded-full bg-gray-500"></span>Retirada' + (fila.retirada_en ? ' el ' + esc(fecha(fila.retirada_en)) : '') + '</span>';
    var boton = fila.activa
      ? '<button type="button" class="text-red-600 hover:text-red-800 hover:underline text-sm font-medium" data-accion="quitar" data-id="' + esc(fila.id) + '">Quitar</button>'
      : '<button type="button" class="text-purple-700 hover:text-purple-900 hover:underline text-sm font-medium" data-accion="reincorporar" data-id="' + esc(fila.id) + '">Reincorporar</button>';
    return '<tr class="hover:bg-gray-50 transition' + (fila.activa ? '' : ' opacity-70') + '">' +
      '<td class="px-4 py-3 font-medium">' + esc(nombre) +
      (aviso ? '<p class="text-xs text-amber-700 font-normal mt-1"><i class="fas fa-exclamation-triangle mr-1"></i>' + esc(aviso) + botonAcceso + '</p>' : '') + '</td>' +
      '<td class="px-4 py-3 text-sm">' + esc(A.etiquetaCargo(fila.cargo)) + '</td>' +
      '<td class="px-4 py-3 text-sm">' + esc(perfil.email || '—') + '</td>' +
      '<td class="px-4 py-3 text-sm capitalize">' + esc(perfil.rol || 'usuaria') + '</td>' +
      '<td class="px-4 py-3 text-sm text-center">' + abiertos + '</td>' +
      '<td class="px-4 py-3">' + estadoHtml + '</td>' +
      '<td class="px-4 py-3 text-center whitespace-nowrap">' + boton + '</td></tr>';
  }

  function renderPersonal() {
    var cuerpo = el('personal-tbody');
    if (!cuerpo) return;
    var cargando = el('personal-loading');
    var vacio = el('personal-empty');
    if (cargando) cargando.classList.add('hidden');
    avisoDePersonal();
    resumenPorCargo();
    var formulario = el('personal-form');
    if (formulario) formulario.classList.toggle('hidden', !estado.disponible);
    var filas = estado.personal.slice().sort(function (a, b) {
      if (a.activa !== b.activa) return a.activa ? -1 : 1;
      var porCargo = A.CARGOS_ORDENADOS.indexOf(a.cargo) - A.CARGOS_ORDENADOS.indexOf(b.cargo);
      return porCargo || A.nombreDePersonal(a).localeCompare(A.nombreDePersonal(b), 'es');
    });
    var carga = A.casosAbiertosPorPersona(estado.asignaciones);
    cuerpo.innerHTML = filas.map(function (fila) { return filaPersonal(fila, carga); }).join('');
    if (vacio) vacio.classList.toggle('hidden', filas.length > 0 || !estado.disponible);
  }

  // Tras cambiar el personal basta recargar el personal y las asignaciones; si además cambió el rol de una cuenta,
  // Admin.js recarga también la tabla de usuarias (y esta vuelve a pedir el personal).
  async function recargarPersonal() {
    await cargarPersonal();
    await cargarAsignaciones();
    renderPersonal();
  }

  async function recargarCuentas() {
    if (window.recargarUsuarias) await window.recargarUsuarias();
    await cargarAsignaciones();
    renderPersonal();
  }

  async function agregarPersonal(evento) {
    evento.preventDefault();
    var entrada = el('personal-persona');
    var cargo = el('personal-cargo').value;
    var idCuenta = estado.cuentaPorTexto[entrada.value.trim()] || '';
    var validacion = A.validarAlta(estado.personal, idCuenta, cargo);
    if (!validacion.ok) { avisar(validacion.motivo, 'warning'); return; }

    var cuenta = estado.cuentas.filter(function (c) { return c.id === idCuenta; })[0] || {};
    var nombre = A.nombreDePerfil(cuenta);
    var boton = el('personal-agregar');
    boton.disabled = true;
    var error = await guardarAlta(idCuenta, cargo);
    if (error) {
      boton.disabled = false;
      avisar(A.mensajeDeError(error), 'error');
      return;
    }
    var ascendida = await ofrecerAccesoAlPanel(idCuenta, cargo, cuenta, nombre);
    boton.disabled = false;

    entrada.value = '';
    el('personal-cargo').value = '';
    mostrarAyudaDelCargo();
    avisar(nombre + ' ahora figura como ' + A.etiquetaCargo(cargo).toLowerCase() + '.', 'success');
    if (ascendida) await recargarCuentas();
    else await recargarPersonal();
  }

  // Si ya estuvo en el personal con ese mismo cargo se reincorpora su fila (así se conserva su historial).
  async function guardarAlta(idCuenta, cargo) {
    var previa = estado.personal.filter(function (f) { return f.perfil_id === idCuenta && f.cargo === cargo && !f.activa; })[0];
    var res = previa
      ? await ctx.supabase.from('personal_asesoria').update({ activa: true }).eq('id', previa.id).select('id')
      : await ctx.supabase.from('personal_asesoria').insert({ perfil_id: idCuenta, cargo: cargo }).select('id');
    if (res.error) return res.error;
    return res.data && res.data.length ? null : SIN_PERMISO;
  }

  // La abogada institucional asigna desde el panel: sin rol Asesora o Admin no podría entrar.
  async function ofrecerAccesoAlPanel(idCuenta, cargo, cuenta, nombre) {
    var sinPanel = cargo === A.INSTITUCIONAL && cuenta.rol !== 'admin' && cuenta.rol !== 'asesora';
    if (!sinPanel) return false;
    var pregunta = nombre + ' todavía no puede entrar al panel (su rol es «' + (cuenta.rol || 'usuaria') + '»). Sin eso no podrá asignar casos.\n\n¿Darle rol Asesora ahora?';
    if (!window.confirm(pregunta)) return false;
    return cambiarRol(idCuenta, 'asesora', 'Se agregó al personal, pero no se pudo cambiar su rol. Hazlo en la tabla de usuarias.');
  }

  async function cambiarRol(idCuenta, rol, mensajeDeFallo) {
    var res = await ctx.supabase.from('perfiles').update({ rol: rol }).eq('id', idCuenta).select('id');
    if (res.error || !res.data || !res.data.length) {
      avisar(mensajeDeFallo, 'warning');
      return false;
    }
    return true;
  }

  async function accionEnFila(evento) {
    var boton = evento.target.closest('button[data-accion]');
    if (!boton || !ctx.isAdmin) return;
    var accion = boton.dataset.accion;
    if (accion === 'dar-acceso') return darAcceso(boton.dataset.perfil, boton.dataset.nombre);
    var fila = estado.personal.filter(function (f) { return f.id === boton.dataset.id; })[0];
    if (!fila) return;
    if (accion === 'quitar') return quitar(fila);
    if (accion === 'reincorporar') return reincorporar(fila);
  }

  function textoDeConfirmacionDeRetiro(fila) {
    var abiertos = A.casosAbiertosPorPersona(estado.asignaciones)[fila.id] || 0;
    var texto = '¿Quitar a ' + A.nombreDePersonal(fila) + ' del personal de asesorías?';
    if (abiertos) texto += '\n\nTiene ' + abiertos + (abiertos === 1 ? ' caso abierto asignado' : ' casos abiertos asignados') + '. Seguirán a su nombre hasta que la abogada institucional los reasigne.';
    if (fila.cargo === A.INSTITUCIONAL) texto += '\n\nSin abogada institucional activa nadie podrá asignar casos hasta que agregues a otra.';
    return texto;
  }

  async function cambiarActiva(fila, activa) {
    var res = await ctx.supabase.from('personal_asesoria').update({ activa: activa }).eq('id', fila.id).select('id');
    var error = res.error || (res.data && res.data.length ? null : SIN_PERMISO);
    if (error) avisar(A.mensajeDeError(error), 'error');
    return !error;
  }

  async function quitar(fila) {
    if (!window.confirm(textoDeConfirmacionDeRetiro(fila))) return;
    if (!(await cambiarActiva(fila, false))) return;
    avisar(A.nombreDePersonal(fila) + ' ya no figura en el personal.', 'success');
    await recargarPersonal();
  }

  async function reincorporar(fila) {
    var validacion = A.validarAlta(estado.personal, fila.perfil_id, fila.cargo);
    if (!validacion.ok) { avisar(validacion.motivo, 'warning'); return; }
    if (!(await cambiarActiva(fila, true))) return;
    avisar(A.nombreDePersonal(fila) + ' volvió al personal.', 'success');
    await recargarPersonal();
  }

  async function darAcceso(idCuenta, nombre) {
    if (!window.confirm('¿Cambiar el rol de «' + nombre + '» a Asesora? Podrá entrar al panel y ver las solicitudes.')) return;
    if (!(await cambiarRol(idCuenta, 'asesora', 'No se pudo cambiar el rol.'))) return;
    avisar('Rol de «' + nombre + '» cambiado a asesora.', 'success');
    await recargarCuentas();
  }

  window.AsignacionPanel = {
    iniciar: iniciar,
    cargar: cargar,
    cargarPersonal: cargarPersonal,
    cargarAsignaciones: cargarAsignaciones,
    disponible: disponible,
    puedeAsignar: puedeAsignar,
    filtrar: filtrar,
    contarSinAsignar: contarSinAsignar,
    celdaEquipo: celdaEquipo,
    resumenCorto: resumenCorto,
    etiquetaDeAccion: etiquetaDeAccion,
    bloqueModal: bloqueModal,
    enlazarModal: enlazarModal,
    nombreDeCuenta: nombreDeCuenta,
    mensajeSinConfigurar: SIN_CONFIGURAR
  };
})();
