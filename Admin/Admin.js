// admin.js – Panel de administración de asesorías
document.addEventListener('DOMContentLoaded', async () => {
  const supabase = window.supabase;
  if (!supabase) return;

  // 1. Verificar sesión y rol
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    window.location.href = '../Login/login.html';
    return;
  }

  const { data: profile, error: profileError } = await supabase
    .from('perfiles')
    .select('rol, nombre_completo, nombre_usuario, id')
    .eq('id', user.id)
    .single();

  if (profileError || !profile || (profile.rol !== 'admin' && profile.rol !== 'asesora')) {
    alert('Acceso denegado.');
    window.location.href = '../index.html';
    return;
  }

  const currentUserId = user.id;
  const isAdmin = profile.rol === 'admin';

  const userNameEl = document.getElementById('user-name');
  if (userNameEl) {
    userNameEl.textContent = profile.nombre_usuario || profile.nombre_completo || 'Asesora';
  }

  // 2. Elementos del DOM
  const tbody = document.getElementById('reports-tbody');
  const loading = document.getElementById('loading');
  const modal = document.getElementById('report-modal');
  const reportDetail = document.getElementById('report-detail-content');
  const newNote = document.getElementById('new-note');
  let currentReportId = null;
  let allReports = [];
  let asesorasCache = [];

  // KPIs
  const kpiTotal = document.getElementById('kpi-total');
  const kpiPendiente = document.getElementById('kpi-pendiente');
  const kpiEnProceso = document.getElementById('kpi-enproceso');
  const kpiFinalizado = document.getElementById('kpi-finalizado');

  function updateKPI(data) {
    const total = data.length;
    const pendientes = data.filter(r => r.estado === 'pendiente').length;
    const enProceso = data.filter(r => r.estado === 'en proceso').length;
    const finalizados = data.filter(r => r.estado === 'finalizado').length;
    const cancelados = data.filter(r => r.estado === 'cancelado').length;
    if (kpiTotal) kpiTotal.textContent = total;
    if (kpiPendiente) kpiPendiente.textContent = pendientes;
    if (kpiEnProceso) kpiEnProceso.textContent = enProceso;
    if (kpiFinalizado) kpiFinalizado.textContent = finalizados;
  }

  // Cargar lista de asesoras para asignación
  async function loadAsesoras() {
    if (!isAdmin) return;
    const { data } = await supabase
      .from('perfiles')
      .select('id, nombre_completo, nombre_usuario')
      .in('rol', ['admin', 'asesora']);
    asesorasCache = data || [];
  }

  // 3. Cargar solicitudes
  async function loadReports(filters = {}) {
    if (loading) loading.classList.remove('hidden');
    let query = supabase
      .from('solicitudes')
      .select('*')
      .order('creado_en', { ascending: false });

    if (filters.parroquia) query = query.eq('parroquia', filters.parroquia);
    if (filters.estado) query = query.eq('estado', filters.estado);

    const { data, error } = await query;
    if (error) {
      console.error('Error al cargar solicitudes:', error);
      if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-red-500">
        <i class="fas fa-exclamation-circle mr-2"></i>Error: ${error.message}</td></tr>`;
      if (loading) loading.classList.add('hidden');
      return;
    }

    allReports = data || [];
    updateKPI(allReports);

    // Cargar nombres de quien asignó
    const userIds = [...new Set(allReports.filter(r => r.asignada_por || r.asignada_a).map(r => r.asignada_por || r.asignada_a).filter(Boolean))];
    let usersMap = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase.from('perfiles').select('id, nombre_completo').in('id', userIds);
      if (users) {
        users.forEach(u => { usersMap[u.id] = u.nombre_completo; });
      }
    }

    if (tbody) {
      if (allReports.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-gray-400">
          <i class="fas fa-inbox text-3xl mb-2 block"></i>No hay solicitudes registradas aún</td></tr>`;
      } else {
        tbody.innerHTML = allReports.map(r => {
          const asignadaNombre = r.asignada_a ? (usersMap[r.asignada_a] || '—') : '—';
          return `<tr class="hover:bg-gray-50 transition">
            <td class="px-4 py-3 text-sm whitespace-nowrap">${r.creado_en ? new Date(r.creado_en).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'N/A'}</td>
            <td class="px-4 py-3 font-medium">${r.nombre_completo || (r.es_anonimo ? '<em class="text-gray-400">Anónimo</em>' : 'N/A')}</td>
            <td class="px-4 py-3">${r.telefono || 'N/A'}</td>
            <td class="px-4 py-3">${r.parroquia || 'N/A'}</td>
            <td class="px-4 py-3 capitalize">
              <span class="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs rounded-full font-medium ${
                r.estado === 'pendiente' ? 'bg-yellow-100 text-yellow-800' :
                r.estado === 'en proceso' ? 'bg-blue-100 text-blue-800' :
                r.estado === 'finalizado' ? 'bg-green-100 text-green-800' :
                'bg-gray-100 text-gray-800'
              }">
                <span class="w-1.5 h-1.5 rounded-full ${r.estado === 'pendiente' ? 'bg-yellow-500' : r.estado === 'en proceso' ? 'bg-blue-500' : r.estado === 'finalizado' ? 'bg-green-500' : 'bg-gray-500'}"></span>
                ${r.estado}
              </span>
            </td>
            <td class="px-4 py-3 text-sm">${asignadaNombre}</td>
            <td class="px-4 py-3 text-center">
              <button onclick="openModal('${r.id}')" class="text-indigo-600 hover:text-indigo-800 hover:underline text-sm font-medium">Ver</button>
            </td>
          </tr>`;
        }).join('');
      }
    }
    if (loading) loading.classList.add('hidden');
  }

  // 4. Modal con detalles y notas
  window.openModal = async (reportId) => {
    currentReportId = reportId;
    const { data: report, error } = await supabase
      .from('solicitudes')
      .select('*, notas:notas_solicitud(contenido, creado_en)')
      .eq('id', reportId)
      .single();

    if (error || !report) {
      alert('No se pudo cargar el detalle.');
      return;
    }

    await loadAsesoras();

    const asesorasOptions = asesorasCache.map(a =>
      `<option value="${a.id}" ${report.asignada_a === a.id ? 'selected' : ''}>${a.nombre_completo || a.nombre_usuario}</option>`
    ).join('');

    if (reportDetail) {
      reportDetail.innerHTML = `
        <div class="grid grid-cols-2 gap-3">
          <div><p class="text-xs text-gray-400">Nombre</p><p class="font-medium">${report.nombre_completo || 'Anónimo'}</p></div>
          ${report.cedula ? `<div><p class="text-xs text-gray-400">Cédula</p><p class="font-medium">${report.cedula}</p></div>` : ''}
          <div><p class="text-xs text-gray-400">Teléfono</p><p class="font-medium">${report.telefono || 'N/A'}</p></div>
          <div><p class="text-xs text-gray-400">Correo</p><p class="font-medium">${report.correo || 'N/A'}</p></div>
          <div><p class="text-xs text-gray-400">Parroquia</p><p class="font-medium">${report.parroquia || 'N/A'}</p></div>
          <div><p class="text-xs text-gray-400">Estado</p><p class="font-medium capitalize">${report.estado}</p></div>
        </div>
        <div class="mt-3 pt-3 border-t border-gray-100">
          <p class="text-xs text-gray-400 mb-1">Descripción</p>
          <p class="text-gray-700 bg-gray-50 p-3 rounded-lg text-sm">${report.descripcion || 'Sin descripción'}</p>
        </div>
        <div class="mt-3 pt-3 border-t border-gray-100">
          <p class="text-xs text-gray-400 mb-2">Notas internas</p>
          <div class="space-y-1 max-h-32 overflow-y-auto">
            ${report.notas?.length
              ? report.notas.map(n => `<div class="flex items-start gap-2 text-sm"><span class="text-purple-400 mt-1"><i class="fas fa-comment-dots text-xs"></i></span><div><p class="text-gray-600">${n.contenido}</p><p class="text-gray-400 text-xs">${new Date(n.creado_en).toLocaleString('es-ES')}</p></div></div>`).join('')
              : '<span class="text-gray-400 text-sm">Ninguna nota aún</span>'}
          </div>
        </div>
        ${isAdmin ? `
        <div class="mt-3 pt-3 border-t border-gray-100">
          <p class="text-xs text-gray-400 mb-1">Asignar a</p>
          <select id="asignar-asesora" class="w-full text-sm border border-gray-300 rounded-lg p-2 focus:ring-purple-500 focus:border-purple-500">
            <option value="">Sin asignar</option>
            ${asesorasOptions}
          </select>
          <button id="btn-asignar" class="mt-2 w-full bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium py-2 rounded-lg transition">Asignar</button>
        </div>` : ''}
      `;
    }

    // Handler de asignación
    const btnAsignar = document.getElementById('btn-asignar');
    if (btnAsignar) {
      btnAsignar.addEventListener('click', async () => {
        const asignarA = document.getElementById('asignar-asesora').value;
        await supabase.from('solicitudes').update({
          asignada_a: asignarA || null,
          asignada_por: currentUserId
        }).eq('id', currentReportId);
        openModal(currentReportId);
        loadReports({});
      });
    }

    if (modal) modal.classList.remove('hidden');
  };

  const closeModalBtn = document.getElementById('close-modal');
  if (closeModalBtn) closeModalBtn.addEventListener('click', () => { if (modal) modal.classList.add('hidden'); });
  if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

  const addNoteBtn = document.getElementById('add-note-btn');
  if (addNoteBtn) {
    addNoteBtn.addEventListener('click', async () => {
      const contenido = newNote?.value.trim();
      if (!contenido || !currentReportId) return;
      const { error } = await supabase.from('notas_solicitud').insert({
        solicitud_id: currentReportId,
        contenido
      });
      if (error) {
        alert('Error al agregar nota: ' + error.message);
        return;
      }
      if (newNote) newNote.value = '';
      openModal(currentReportId);
    });
  }

  // 5. Cambios de estado
  const markInProgress = document.getElementById('mark-in-progress');
  const markFinalized = document.getElementById('mark-finalized');
  const markCancelled = document.getElementById('mark-cancelled');

  async function updateEstado(estado) {
    const { error } = await supabase.from('solicitudes').update({ estado }).eq('id', currentReportId);
    if (error) {
      alert('Error al actualizar: ' + error.message);
      return;
    }
    if (modal) modal.classList.add('hidden');
    loadReports({});
  }

  if (markInProgress) markInProgress.addEventListener('click', () => updateEstado('en proceso'));
  if (markFinalized) markFinalized.addEventListener('click', () => updateEstado('finalizado'));
  if (markCancelled) markCancelled.addEventListener('click', () => updateEstado('cancelado'));

  // 6. Filtros
  const applyFilter = document.getElementById('apply-filter');
  const resetFilter = document.getElementById('reset-filter');
  const filterParroquia = document.getElementById('filter-parroquia');
  const filterStatus = document.getElementById('filter-status');

  if (applyFilter) {
    applyFilter.addEventListener('click', () => {
      loadReports({
        parroquia: filterParroquia?.value || '',
        estado: filterStatus?.value || ''
      });
    });
  }
  if (resetFilter) {
    resetFilter.addEventListener('click', () => {
      if (filterParroquia) filterParroquia.value = '';
      if (filterStatus) filterStatus.value = '';
      loadReports({});
    });
  }

  // 7. Cerrar sesión (también manejado por auth.js)
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await supabase.auth.signOut();
      window.location.href = '../Login/login.html';
    });
  }

  // Carga inicial
  await loadAsesoras();
  loadReports({});
});
