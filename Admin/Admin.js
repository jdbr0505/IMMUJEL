// admin.js – Panel de administración de asesorías

if (typeof window.showToast === 'undefined') {
  window.showToast = function(message, type) {
    var container = document.getElementById('toast-container');
    if (!container) { container = document.createElement('div'); container.id = 'toast-container'; container.style.cssText = 'position:fixed;bottom:1.5rem;right:1.5rem;z-index:100;display:flex;flex-direction:column;gap:8px;'; document.body.appendChild(container); }
    var t = document.createElement('div');
    var bg = type === 'error' ? 'linear-gradient(135deg,#EF4444,#DC2626)' : type === 'warning' ? 'linear-gradient(135deg,#f59e0b,#d97706)' : 'linear-gradient(135deg,#10B981,#059669)';
    var icon = type === 'error' ? 'fa-times-circle' : type === 'warning' ? 'fa-exclamation-triangle' : 'fa-check-circle';
    t.className = 'toast toast-' + (type || 'success');
    t.style.background = bg;
    t.innerHTML = '<i class="fas ' + icon + '"></i><span>' + message + '</span>';
    container.appendChild(t);
    setTimeout(function() { t.classList.add('toast-leaving'); setTimeout(function() { t.remove(); }, 300); }, 4000);
  };
}

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

  // Mostrar tab de Usuarias solo para admin
  const tabUsuarios = document.getElementById('tab-usuarios');
  if (tabUsuarios) {
    if (isAdmin) tabUsuarios.classList.remove('hidden');
    else tabUsuarios.classList.add('hidden');
  }

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

  // Cargar lista de asesoras para asignación
  async function loadAsesoras() {
    const { data, error } = await supabase
      .from('perfiles')
      .select('id, nombre_completo, nombre_usuario')
      .in('rol', ['admin', 'asesora']);
    if (error) console.error('Error cargando asesoras:', error);
    asesorasCache = data || [];
  }

  // Total stats (unfiltered) para KPIs
  async function updateKPIGlobal() {
    const { count: total } = await supabase.from('solicitudes').select('*', { count: 'exact', head: true });
    const { count: pend } = await supabase.from('solicitudes').select('*', { count: 'exact', head: true }).eq('estado', 'pendiente');
    const { count: prog } = await supabase.from('solicitudes').select('*', { count: 'exact', head: true }).eq('estado', 'en proceso');
    const { count: fin } = await supabase.from('solicitudes').select('*', { count: 'exact', head: true }).eq('estado', 'finalizado');
    if (kpiTotal) kpiTotal.textContent = total ?? 0;
    if (kpiPendiente) kpiPendiente.textContent = pend ?? 0;
    if (kpiEnProceso) kpiEnProceso.textContent = prog ?? 0;
    if (kpiFinalizado) kpiFinalizado.textContent = fin ?? 0;
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
      if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-red-500">
        <i class="fas fa-exclamation-circle mr-2"></i>Error: ${error.message}</td></tr>`;
      if (loading) loading.classList.add('hidden');
      return;
    }

    allReports = data || [];
    updateKPIGlobal();

    // Cargar nombres de quien asignó
    const userIds = [...new Set(allReports.flatMap(r => [r.asignada_por, r.asignada_a].filter(Boolean)))];
    let usersMap = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase.from('perfiles').select('id, nombre_completo').in('id', userIds);
      if (users) {
        users.forEach(u => { usersMap[u.id] = u.nombre_completo; });
      }
    }

    if (tbody) {
      if (allReports.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-10 text-gray-400">
          <i class="fas fa-inbox text-3xl mb-2 block"></i>No hay solicitudes registradas aún</td></tr>`;
      } else {
        tbody.innerHTML = allReports.map(r => {
          const asignadaPorNombre = r.asignada_por ? (usersMap[r.asignada_por] || '—') : '—';
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
            <td class="px-4 py-3 text-sm">${asignadaPorNombre}</td>
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
      window.showToast('No se pudo cargar el detalle.', 'error');
      return;
    }

    await loadAsesoras();

    const asesorasOptions = asesorasCache.map(a =>
      `<option value="${a.id}" ${report.asignada_a === a.id ? 'selected' : ''}>${a.nombre_completo || a.nombre_usuario}</option>`
    ).join('');

    if (reportDetail) {
      const asigPorName = report.asignada_por ? (asesorasCache.find(a => a.id === report.asignada_por)?.nombre_completo || '—') : '—';
      const asigAName = report.asignada_a ? (asesorasCache.find(a => a.id === report.asignada_a)?.nombre_completo || '—') : '—';
      reportDetail.innerHTML = `
        <div class="grid grid-cols-2 gap-3">
          <div><p class="text-xs text-gray-400">Nombre</p><p class="font-medium">${report.nombre_completo || 'Anónimo'}</p></div>
          ${report.cedula ? `<div><p class="text-xs text-gray-400">Cédula</p><p class="font-medium">${report.cedula}</p></div>` : ''}
          <div><p class="text-xs text-gray-400">Teléfono</p><p class="font-medium">${report.telefono || 'N/A'}</p></div>
          <div><p class="text-xs text-gray-400">Correo</p><p class="font-medium">${report.correo || 'N/A'}</p></div>
          <div><p class="text-xs text-gray-400">Parroquia</p><p class="font-medium">${report.parroquia || 'N/A'}</p></div>
          <div><p class="text-xs text-gray-400">Estado</p><p class="font-medium capitalize">${report.estado}</p></div>
          ${report.tipo_asesoria ? `<div><p class="text-xs text-gray-400">Tipo</p><p class="font-medium capitalize">${report.tipo_asesoria}</p></div>` : ''}
          <div><p class="text-xs text-gray-400">Asignada por</p><p class="font-medium">${asigPorName}</p></div>
          <div><p class="text-xs text-gray-400">Asignada a</p><p class="font-medium">${asigAName}</p></div>
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
        await openModal(currentReportId);
        await loadReports({});
      });
    }

    if (modal) {
      modal.classList.remove('hidden');
      modal.querySelector('button, input, select, textarea, a')?.focus();
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
    }
    // Guardar elemento que abrió el modal para devolver foco al cerrar
    window._lastFocused = document.activeElement;
  };

  function closeModal() {
    if (modal) modal.classList.add('hidden');
    if (window._lastFocused) setTimeout(() => window._lastFocused.focus(), 100);
  }

  const closeModalBtn = document.getElementById('close-modal');
  if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
  if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) closeModal(); });

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
        window.showToast('Error al agregar nota: ' + error.message, 'error');
        return;
      }
      if (newNote) newNote.value = '';
      window.showToast('Nota agregada correctamente.', 'success');
      await openModal(currentReportId);
    });
  }

  // 5. Cambios de estado
  const markInProgress = document.getElementById('mark-in-progress');
  const markFinalized = document.getElementById('mark-finalized');
  const markCancelled = document.getElementById('mark-cancelled');

  async function updateEstado(estado) {
    const { error } = await supabase.from('solicitudes').update({ estado }).eq('id', currentReportId);
    if (error) {
      window.showToast('Error al actualizar: ' + error.message, 'error');
      return;
    }
    if (modal) modal.classList.add('hidden');
    window.showToast('Estado actualizado a "' + estado + '".', 'success');
    await loadReports({});
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

  // 8. Nueva Asesoría manual
  const btnNuevaAsesoria = document.getElementById('btn-nueva-asesoria');
  const naModal = document.getElementById('nueva-asesoria-modal');
  const naForm = document.getElementById('nueva-asesoria-form');

  if (btnNuevaAsesoria && naModal) {
    btnNuevaAsesoria.addEventListener('click', () => {
      naModal.classList.remove('hidden');
      naForm.reset();
    });
  }

  document.getElementById('close-nueva-asesoria')?.addEventListener('click', () => naModal?.classList.add('hidden'));
  document.getElementById('cancelar-na')?.addEventListener('click', () => naModal?.classList.add('hidden'));
  if (naModal) naModal.addEventListener('click', (e) => { if (e.target === naModal) naModal.classList.add('hidden'); });

  if (naForm) {
    naForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const getVal = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
      const getSel = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
      const getChk = (id) => { const el = document.getElementById(id); return el ? el.checked : false; };
      const nombre = getVal('na-nombre');
      const cedula = getVal('na-cedula');
      const telefono = getVal('na-telefono');
      const correo = getVal('na-correo');
      const parroquia = getSel('na-parroquia');
      const tipo = getSel('na-tipo');
      const descripcion = getVal('na-descripcion');
      const anonimo = getChk('na-anonimo');

      if (!nombre || !telefono || !parroquia) {
        window.showToast('Completa los campos obligatorios.', 'warning');
        return;
      }

      const btn = document.getElementById('guardar-na');
      if (!btn) return;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Creando...';

      const { error } = await supabase.from('solicitudes').insert({
        nombre_completo: anonimo ? null : nombre,
        cedula: anonimo ? null : (cedula || null),
        telefono,
        correo: anonimo ? null : (correo || null),
        parroquia: anonimo ? null : parroquia,
        descripcion: descripcion || null,
        es_anonimo: anonimo,
        tipo_asesoria: tipo,
        estado: 'pendiente',
        asignada_por: currentUserId,
        creado_en: new Date().toISOString()
      });

      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-save mr-1"></i> Crear asesoría';

      if (error) {
        window.showToast('Error al crear: ' + error.message, 'error');
        return;
      }

      naModal.classList.add('hidden');
      window.showToast('Asesoría creada correctamente.', 'success');
      await loadReports({});
    });
  }

  // 9. Gestión de Usuarias (solo admin)
  const usuariosTbody = document.getElementById('usuarios-tbody');
  const usuariosLoading = document.getElementById('usuarios-loading');
  const usuariosEmpty = document.getElementById('usuarios-empty');
  const usuSearch = document.getElementById('usu-search');
  const usuFilterRol = document.getElementById('usu-filter-rol');
  const usuApplyFilter = document.getElementById('usu-apply-filter');
  const usuResetFilter = document.getElementById('usu-reset-filter');

  // KPIs de usuarias
  const usuKpiTotal = document.getElementById('usu-kpi-total');
  const usuKpiAsesora = document.getElementById('usu-kpi-asesora');
  const usuKpiAdmin = document.getElementById('usu-kpi-admin');
  const usuKpiUsuaria = document.getElementById('usu-kpi-usuaria');

  let allUsersCache = [];

  function updateUsuKPI(users) {
    const total = users.length;
    const asesoras = users.filter(u => u.rol === 'asesora').length;
    const admins = users.filter(u => u.rol === 'admin').length;
    const usuarias = users.filter(u => u.rol === 'usuaria' || !u.rol).length;
    if (usuKpiTotal) usuKpiTotal.textContent = total;
    if (usuKpiAsesora) usuKpiAsesora.textContent = asesoras;
    if (usuKpiAdmin) usuKpiAdmin.textContent = admins;
    if (usuKpiUsuaria) usuKpiUsuaria.textContent = usuarias;
  }

  function filterUsers(users, searchTerm, rolFilter) {
    return users.filter(u => {
      if (rolFilter && u.rol !== rolFilter) return false;
      if (!searchTerm) return true;
      const s = searchTerm.toLowerCase();
      return (u.nombre_completo || '').toLowerCase().includes(s)
        || (u.nombre_usuario || '').toLowerCase().includes(s)
        || (u.email || '').toLowerCase().includes(s);
    });
  }

  function renderUsuarios(users) {
    if (!usuariosTbody) return;
    if (users.length === 0) {
      usuariosTbody.innerHTML = '';
      if (usuariosEmpty) usuariosEmpty.classList.remove('hidden');
      return;
    }
    if (usuariosEmpty) usuariosEmpty.classList.add('hidden');

    const roles = ['usuaria', 'asesora', 'admin'];
    const roleColors = {
      admin: 'bg-purple-100 text-purple-800',
      asesora: 'bg-blue-100 text-blue-800',
      usuaria: 'bg-gray-100 text-gray-700'
    };

    usuariosTbody.innerHTML = users.map(u => {
      const isSelf = u.id === currentUserId;
      return `<tr class="hover:bg-gray-50 transition">
        <td class="px-4 py-3 font-medium">${u.nombre_completo || '—'}</td>
        <td class="px-4 py-3 text-sm font-mono">${u.nombre_usuario || '—'}</td>
        <td class="px-4 py-3 text-sm">${u.email || '—'}</td>
        <td class="px-4 py-3 text-sm">${u.telefono || '—'}</td>
        <td class="px-4 py-3">
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full font-semibold ${roleColors[u.rol] || 'bg-gray-100 text-gray-700'}">
            <span class="w-1.5 h-1.5 rounded-full ${u.rol === 'admin' ? 'bg-purple-500' : u.rol === 'asesora' ? 'bg-blue-500' : 'bg-gray-500'}"></span>
            ${u.rol || 'usuaria'}
          </span>
        </td>
        <td class="px-4 py-3 text-center">
          ${isSelf
            ? '<span class="text-xs text-gray-400 italic">(tú, no puedes cambiarte)</span>'
            : `<select class="rol-select text-xs border border-gray-300 rounded-lg p-1.5 focus:ring-purple-500 focus:border-purple-500 min-w-[110px]" data-userid="${u.id}" data-current="${u.rol || 'usuaria'}" data-name="${u.nombre_completo || u.nombre_usuario || 'usuaria'}">
                ${roles.map(r => `<option value="${r}" ${(u.rol || 'usuaria') === r ? 'selected' : ''}>${r === 'admin' ? '👑 Admin' : r === 'asesora' ? '🛡️ Asesora' : '👤 Usuaria'}</option>`).join('')}
              </select>`
          }
        </td>
      </tr>`;
    }).join('');

    // Handler para cambio de rol
    document.querySelectorAll('.rol-select').forEach(sel => {
      sel.addEventListener('change', async function() {
        const newRol = this.value;
        const userId = this.dataset.userid;
        const current = this.dataset.current;
        const userName = this.dataset.name;

        if (!confirm(`¿Estás segura de cambiar el rol de "${userName}" a "${newRol}"?`)) {
          this.value = current;
          return;
        }

        const { error } = await supabase.from('perfiles').update({ rol: newRol }).eq('id', userId);
        if (error) {
          window.showToast('Error al cambiar rol: ' + error.message, 'error');
          this.value = current;
          return;
        }

        this.dataset.current = newRol;
        window.showToast(`Rol de "${userName}" cambiado a "${newRol}"`, 'success');
        allUsersCache = [];
        await loadUsuarios();
      });
    });
  }

  async function loadUsuarios(searchTerm, rolFilter) {
    if (!isAdmin || !usuariosTbody) return;
    if (usuariosLoading) usuariosLoading.classList.remove('hidden');
    if (usuariosEmpty) usuariosEmpty.classList.add('hidden');

    // Only fetch from server if cache is empty or no filters provided
    if (allUsersCache.length === 0) {
      const { data: users, error } = await supabase
        .from('perfiles')
        .select('*')
        .order('nombre_completo', { ascending: true });

      if (error) {
        console.error('Error al cargar usuarias:', error);
        usuariosTbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-red-500">
          <i class="fas fa-exclamation-circle mr-2"></i>Error: ${error.message}</td></tr>`;
        if (usuariosLoading) usuariosLoading.classList.add('hidden');
        return;
      }
      allUsersCache = users || [];
    }

    if (usuariosLoading) usuariosLoading.classList.add('hidden');

    let filtered = [...allUsersCache];
    if (searchTerm || rolFilter) {
      filtered = filterUsers(filtered, searchTerm, rolFilter);
    }

    updateUsuKPI(filtered);
    renderUsuarios(filtered);
  }

  // Search handlers with debounce
  let searchDebounceTimer;
  if (usuSearch) {
    usuSearch.addEventListener('input', () => {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        loadUsuarios(usuSearch.value, usuFilterRol?.value || '');
      }, 350);
    });
    // Enter key triggers search immediately
    usuSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        clearTimeout(searchDebounceTimer);
        loadUsuarios(usuSearch.value, usuFilterRol?.value || '');
      }
    });
  }

  if (usuApplyFilter) {
    usuApplyFilter.addEventListener('click', () => {
      clearTimeout(searchDebounceTimer);
      loadUsuarios(usuSearch?.value || '', usuFilterRol?.value || '');
    });
  }

  if (usuResetFilter) {
    usuResetFilter.addEventListener('click', () => {
      if (usuSearch) usuSearch.value = '';
      if (usuFilterRol) usuFilterRol.value = '';
      clearTimeout(searchDebounceTimer);
      loadUsuarios('', '');
    });
  }

  // Botón Refresh: limpia caché y recarga del servidor
  document.getElementById('usu-refresh')?.addEventListener('click', () => {
    allUsersCache = [];
    loadUsuarios(usuSearch?.value || '', usuFilterRol?.value || '');
  });

  // Carga inicial
  await loadAsesoras();
  await loadReports({});
  if (isAdmin) await loadUsuarios('', '');
});

// Función global para cambiar de tab (llamada por onclick en HTML)
window.switchTab = async function(tab) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('bg-purple-600', 'text-white');
    btn.classList.add('text-gray-600', 'hover:text-purple-700', 'hover:bg-purple-50');
  });
  document.getElementById(`tab-${tab}`)?.classList.add('bg-purple-600', 'text-white');
  document.getElementById(`tab-${tab}`)?.classList.remove('text-gray-600', 'hover:text-purple-700', 'hover:bg-purple-50');

  document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
  document.getElementById(`section-${tab}`)?.classList.remove('hidden');

  if (tab === 'asesorias') {
    await loadAsesoras();
    await loadReports({});
  } else if (tab === 'usuarios' && isAdmin) {
    await loadUsuarios('', '');
  }
};
