// Admin_cms.js – Gestión de publicaciones (Semanario + Noticiero) - Enhanced
document.addEventListener('DOMContentLoaded', () => {
  const supabase = window.supabase;
  if (!supabase) return;
  if (!document.getElementById('section-cms')) return;

  // ===== TOAST SYSTEM =====
  function createToastContainer() {
    let c = document.getElementById('toast-container');
    if (!c) { c = document.createElement('div'); c.id = 'toast-container'; document.body.appendChild(c); }
    return c;
  }
  function showToast(msg, type, duration) {
    if (!type) type = 'success';
    if (!duration) duration = 4000;
    const c = createToastContainer();
    const t = document.createElement('div');
    t.className = 'toast toast-' + type;
    const icons = {success:'fa-check-circle',error:'fa-exclamation-circle',warning:'fa-exclamation-triangle',info:'fa-info-circle'};
    t.innerHTML = '<i class="fas ' + (icons[type]||icons.info) + ' toast-icon"></i><span>' + msg + '</span>';
    c.appendChild(t);
    setTimeout(function() { t.classList.add('toast-leaving'); setTimeout(function() { t.remove(); }, 300); }, duration);
  }

  // ===== CONFIRMATION DIALOG =====
  function createConfirmDialog() {
    var d = document.getElementById('confirm-dialog');
    if (!d) {
      d = document.createElement('div'); d.id = 'confirm-dialog'; d.className = 'hidden';
      d.innerHTML = '<div class="confirm-panel"><h3 id="confirm-title">Estas segura?</h3><p id="confirm-message">Esta accion no se puede deshacer.</p><div class="confirm-actions"><button id="confirm-cancel" class="btn-secondary">Cancelar</button><button id="confirm-ok" class="btn-danger">Confirmar</button></div></div>';
      document.body.appendChild(d);
    }
    return d;
  }
  function showConfirm(title, message, confirmText, confirmClass) {
    if (!confirmText) confirmText = 'Confirmar';
    if (!confirmClass) confirmClass = 'btn-danger';
    return new Promise(function(resolve) {
      var d = createConfirmDialog();
      document.getElementById('confirm-title').textContent = title;
      document.getElementById('confirm-message').textContent = message;
      var ok = document.getElementById('confirm-ok');
      ok.textContent = confirmText; ok.className = confirmClass;
      d.classList.remove('hidden');
      var cancel = document.getElementById('confirm-cancel');
      function cleanup() { d.classList.add('hidden'); ok.removeEventListener('click', handleOk); cancel.removeEventListener('click', handleCancel); }
      function handleOk() { cleanup(); resolve(true); }
      function handleCancel() { cleanup(); resolve(false); }
      ok.addEventListener('click', handleOk);
      cancel.addEventListener('click', handleCancel);
    });
  }

  // ===== DOM ELEMENTS =====
  function $(id) { return document.getElementById(id); }
  var cmsTbody = $('cms-tbody'), cmsLoading = $('cms-loading'), cmsEmpty = $('cms-empty');
  var cmsModal = $('cms-modal'), cmsForm = $('cms-form'), cmsModalTitle = $('cms-modal-title');
  var cmsEditId = $('cms-edit-id'), cmsTitulo = $('cms-titulo'), cmsTipo = $('cms-tipo');
  var cmsResumen = $('cms-resumen'), cmsContenido = $('cms-contenido');
  var cmsImagen = $('cms-imagen'), cmsPdf = $('cms-pdf'), cmsFecha = $('cms-fecha');
  var cmsPublicado = $('cms-publicado'), cmsSearch = $('cms-search');
  var cmsFilterTipo = $('cms-filter-tipo'), cmsApplyFilter = $('cms-apply-filter');
  var cmsClearSearch = $('cms-clear-search'), cmsSelectAll = $('cms-select-all');
  var cmsBulkBar = $('cms-bulk-bar'), cmsSelectedCount = $('cms-selected-count');
  var cmsBulkPublish = $('cms-bulk-publish'), cmsBulkUnpublish = $('cms-bulk-unpublish');
  var cmsBulkDelete = $('cms-bulk-delete'), cmsCreateBtn = $('cms-create-btn');
  var cmsCloseModal = $('cms-close-modal'), cmsCancelBtn = $('cms-cancel-btn');
  var cmsImagenPreview = $('cms-imagen-preview'), cmsImagenPreviewContainer = $('cms-imagen-preview-container');
  var cmsPdfInfo = $('cms-pdf-info');

  var allPublications = [];
  var selectedIds = {};
  var cmsTabs = document.querySelectorAll('.cms-tab');
  var cmsTabPanels = document.querySelectorAll('.cms-tab-panel');

  // ===== RICH TEXT EDITOR =====
  function initRichTextEditor() {
    var ed = document.getElementById('cms-contenido-editor');
    if (!ed || !cmsContenido) return;
    var tb = ed.previousElementSibling;
    if (tb) {
      tb.addEventListener('click', function(e) {
        var btn = e.target.closest('[data-cmd]');
        if (!btn) return;
        e.preventDefault();
        document.execCommand(btn.dataset.cmd, false, btn.dataset.value || null);
        ed.focus();
      });
    }
    ed.addEventListener('input', function() { cmsContenido.value = ed.innerHTML; });
    ed.addEventListener('paste', function(e) {
      e.preventDefault();
      var txt = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, txt);
    });
    if (cmsContenido.value) ed.innerHTML = cmsContenido.value;
  }
  function setEditorContent(html) {
    var ed = document.getElementById('cms-contenido-editor');
    if (ed) ed.innerHTML = html || '';
    if (cmsContenido) cmsContenido.value = html || '';
  }
  function getEditorContent() {
    var ed = document.getElementById('cms-contenido-editor');
    return ed ? ed.innerHTML : (cmsContenido ? cmsContenido.value : '');
  }

  // ===== IMAGE PREVIEW =====
  function initImagePreview() {
    if (!cmsImagen || !cmsImagenPreviewContainer || !cmsImagenPreview) return;
    cmsImagen.addEventListener('input', function() {
      var url = cmsImagen.value.trim();
      if (url) {
        cmsImagenPreview.src = url;
        cmsImagenPreview.onload = function() { cmsImagenPreviewContainer.classList.remove('hidden'); };
        cmsImagenPreview.onerror = function() { cmsImagenPreviewContainer.classList.add('hidden'); };
      } else {
        cmsImagenPreviewContainer.classList.add('hidden');
      }
    });
  }

  // ===== PDF VALIDATION =====
  function validatePdfUrl(url) {
    if (!url) return { valid: true };
    try {
      var p = new URL(url).pathname.toLowerCase();
      if (!p.endsWith('.pdf') && !url.includes('drive.google.com') && !url.includes('docs.google.com'))
        return { valid: false, message: 'La URL no parece apuntar a un PDF. Verifica que termine en .pdf' };
      return { valid: true };
    } catch(e) { return { valid: false, message: 'La URL no es valida' }; }
  }
  function initPdfValidation() {
    if (!cmsPdf || !cmsPdfInfo) return;
    cmsPdf.addEventListener('input', function() {
      var url = cmsPdf.value.trim();
      if (!url) { cmsPdfInfo.classList.add('hidden'); cmsPdf.classList.remove('input-error','input-success'); return; }
      var r = validatePdfUrl(url);
      if (r.valid) {
        cmsPdfInfo.className = 'cms-pdf-info valid';
        cmsPdfInfo.innerHTML = '<i class="fas fa-check-circle"></i> URL de PDF valida';
        cmsPdfInfo.classList.remove('hidden');
        cmsPdf.classList.remove('input-error'); cmsPdf.classList.add('input-success');
      } else {
        cmsPdfInfo.className = 'cms-pdf-info invalid';
        cmsPdfInfo.innerHTML = '<i class="fas fa-exclamation-circle"></i> ' + r.message;
        cmsPdfInfo.classList.remove('hidden');
        cmsPdf.classList.remove('input-success'); cmsPdf.classList.add('input-error');
      }
    });
  }

  // ===== FORM VALIDATION =====
  function showFieldError(input, msg) {
    var el = document.createElement('p'); el.className = 'field-error'; el.textContent = msg;
    input.classList.add('input-error');
    input.parentNode.appendChild(el);
  }
  function validateForm() {
    var valid = true;
    var errs = document.querySelectorAll('.field-error');
    for (var i = 0; i < errs.length; i++) errs[i].remove();
    var errInputs = document.querySelectorAll('.input-error');
    for (var i = 0; i < errInputs.length; i++) errInputs[i].classList.remove('input-error');
    if (!cmsTitulo.value.trim()) { showFieldError(cmsTitulo, 'El titulo es obligatorio'); valid = false; }
    if (!cmsTipo.value) { showFieldError(cmsTipo, 'Selecciona un tipo'); valid = false; }
    if (!cmsFecha.value) { showFieldError(cmsFecha, 'La fecha es obligatoria'); valid = false; }
    if (cmsImagen.value.trim()) { try { new URL(cmsImagen.value.trim()); } catch(e) { showFieldError(cmsImagen, 'URL de imagen no valida'); valid = false; } }
    if (cmsPdf.value.trim()) { var r = validatePdfUrl(cmsPdf.value.trim()); if (!r.valid) { showFieldError(cmsPdf, r.message); valid = false; } }
    return valid;
  }

  // ===== STATS =====
  function updateStats(pubs) {
    function setStat(id, v) { var el = $(id); if (el) el.textContent = v; }
    setStat('cms-stat-total', pubs.length);
    setStat('cms-stat-published', pubs.filter(function(p) { return p.publicado; }).length);
    setStat('cms-stat-drafts', pubs.filter(function(p) { return !p.publicado; }).length);
    setStat('cms-stat-semanario', pubs.filter(function(p) { return p.tipo === 'semanario'; }).length);
    setStat('cms-stat-noticiero', pubs.filter(function(p) { return p.tipo === 'noticiero'; }).length);
  }

  function escapeHtml(t) { if (!t) return ''; var d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

  // ===== SKELETONS =====
  function generateSkeletons(n) {
    var s = '';
    for (var i = 0; i < n; i++) {
      s += '<tr class="skeleton-row">' +
        '<td class="cms-td cms-check-col"><div class="skeleton-box" style="width:18px;height:18px;border-radius:4px;margin:0 auto;"></div></td>' +
        '<td class="cms-td cms-img-col"><div class="skeleton-box" style="width:48px;height:36px;border-radius:8px;"></div></td>' +
        '<td class="cms-td cms-title-col"><div class="skeleton-box" style="width:60%;height:16px;border-radius:8px;margin-bottom:6px;"></div><div class="skeleton-box" style="width:40%;height:12px;border-radius:8px;"></div></td>' +
        '<td class="cms-td cms-type-col"><div class="skeleton-box" style="width:80px;height:24px;border-radius:12px;"></div></td>' +
        '<td class="cms-td cms-date-col"><div class="skeleton-box" style="width:90px;height:16px;border-radius:8px;"></div></td>' +
        '<td class="cms-td cms-status-col"><div class="skeleton-box" style="width:80px;height:24px;border-radius:12px;"></div></td>' +
        '<td class="cms-td cms-actions-col"><div class="skeleton-box" style="width:120px;height:32px;border-radius:8px;margin:0 auto;"></div></td>' +
        '</tr>';
    }
    return s;
  }

  // ===== RENDER TABLE =====
  function renderTable(pubs) {
    if (!cmsTbody) return;
    if (pubs.length === 0) {
      cmsTbody.innerHTML = '';
      if (cmsEmpty) {
        cmsEmpty.classList.remove('hidden');
        var isFiltered = (cmsSearch && cmsSearch.value.trim()) || (cmsFilterTipo && cmsFilterTipo.value);
        cmsEmpty.innerHTML = isFiltered
          ? '<div class="text-center py-16 text-gray-400"><i class="fas fa-search text-5xl mb-4 block text-gray-300"></i><p class="text-lg font-medium text-gray-500 mb-1">Sin resultados</p><p class="text-sm">Intenta con otros terminos de busqueda</p></div>'
          : '<div class="text-center py-16 text-gray-400"><i class="fas fa-newspaper text-5xl mb-4 block text-gray-300"></i><p class="text-lg font-medium text-gray-500 mb-1">No hay publicaciones aun</p><p class="text-sm">Crea la primera publicacion!</p></div>';
      }
      return;
    }
    if (cmsEmpty) cmsEmpty.classList.add('hidden');
    var html = '';
    for (var i = 0; i < pubs.length; i++) {
      var p = pubs[i];
      var sel = selectedIds[p.id] ? true : false;
      var img = p.imagen_url || '';
      var imgHtml = img
        ? '<img src="' + escapeHtml(img) + '" alt="" class="cms-thumb-img" loading="lazy" onerror="this.parentElement.innerHTML=\'<div class=\\\\\'cms-thumb-placeholder\\\\\'><i class=\\\\\'fas fa-image\\\\\'></i></div>\'">'
        : '<div class="cms-thumb-placeholder"><i class="fas fa-image"></i></div>';
      var tl = p.tipo === 'semanario' ? 'Semanario' : 'Noticiero';
      var tc = p.tipo === 'semanario' ? 'type-semanario' : 'type-noticiero';
      var ti = p.tipo === 'semanario' ? 'fa-newspaper' : 'fa-bullhorn';
      var sl = p.publicado ? 'Publicado' : 'Borrador';
      var sc = p.publicado ? 'status-published' : 'status-draft';
      var ds = p.fecha_publicacion || '\u2014';
      html += '<tr class="cms-row' + (sel ? ' selected' : '') + '" data-id="' + p.id + '">' +
        '<td class="cms-td cms-check-col" data-label=""><input type="checkbox" class="cms-row-checkbox" data-id="' + p.id + '"' + (sel ? ' checked' : '') + '></td>' +
        '<td class="cms-td cms-img-col" data-label="Imagen"><div class="cms-thumb-wrapper">' + imgHtml + '</div></td>' +
        '<td class="cms-td cms-title-col" data-label="Titulo"><div class="cms-title-cell"><p class="cms-title-text">' + escapeHtml(p.titulo) + '</p>' + (p.resumen ? '<p class="cms-summary-text">' + escapeHtml(p.resumen) + '</p>' : '') + '</div></td>' +
        '<td class="cms-td cms-type-col" data-label="Tipo"><span class="cms-type-badge ' + tc + '"><i class="fas ' + ti + '"></i> ' + tl + '</span></td>' +
        '<td class="cms-td cms-date-col" data-label="Fecha"><span class="cms-date-text">' + ds + '</span></td>' +
        '<td class="cms-td cms-status-col" data-label="Estado"><span class="cms-status-badge ' + sc + '"><span class="status-dot ' + (p.publicado ? 'dot-green' : 'dot-gray') + '"></span> ' + sl + '</span></td>' +
        '<td class="cms-td cms-actions-col" data-label="Acciones"><div class="cms-actions">' +
        '<button onclick="editCMS(\'' + p.id + '\')" class="cms-action-btn edit" title="Editar"><i class="fas fa-edit"></i></button>' +
        '<button onclick="togglePublishCMS(\'' + p.id + '\',' + p.publicado + ')" class="cms-action-btn ' + (p.publicado ? 'unpublish' : 'publish') + '" title="' + (p.publicado ? 'Ocultar' : 'Publicar') + '"><i class="fas ' + (p.publicado ? 'fa-eye-slash' : 'fa-eye') + '"></i></button>' +
        '<button onclick="viewCMS(\'' + p.id + '\')" class="cms-action-btn view" title="Vista previa"><i class="fas fa-external-link-alt"></i></button>' +
        '<button onclick="deleteCMS(\'' + p.id + '\')" class="cms-action-btn delete" title="Eliminar"><i class="fas fa-trash"></i></button>' +
        '</div></td></tr>';
    }
    cmsTbody.innerHTML = html;
    var checkboxes = document.querySelectorAll('.cms-row-checkbox');
    for (var i = 0; i < checkboxes.length; i++) {
      checkboxes[i].addEventListener('change', handleRowCheckboxChange);
    }
    updateBulkBar();
  }

  // ===== SEARCH / FILTER =====
  function handleSearchFilter() {
    var term = cmsSearch ? cmsSearch.value.trim().toLowerCase() : '';
    var tipo = cmsFilterTipo ? cmsFilterTipo.value : '';
    var filtered = [];
    for (var i = 0; i < allPublications.length; i++) {
      var p = allPublications[i];
      if (tipo && p.tipo !== tipo) continue;
      if (term) {
        var match = (p.titulo && p.titulo.toLowerCase().indexOf(term) >= 0) ||
                    (p.resumen && p.resumen.toLowerCase().indexOf(term) >= 0) ||
                    (p.tipo && p.tipo.toLowerCase().indexOf(term) >= 0);
        if (!match) continue;
      }
      filtered.push(p);
    }
    renderTable(filtered);
    if (cmsClearSearch) {
      if (!term && !tipo) cmsClearSearch.classList.add('hidden');
      else cmsClearSearch.classList.remove('hidden');
    }
  }

  // ===== BULK ACTIONS =====
  function handleRowCheckboxChange(e) {
    var id = e.target.dataset.id;
    if (e.target.checked) selectedIds[id] = true;
    else { delete selectedIds[id]; if (cmsSelectAll) cmsSelectAll.checked = false; }
    updateBulkBar();
  }
  function updateBulkBar() {
    var count = 0;
    for (var k in selectedIds) { if (selectedIds.hasOwnProperty(k)) count++; }
    if (cmsBulkBar) {
      if (count === 0) { cmsBulkBar.classList.add('hidden'); cmsBulkBar.classList.remove('flex'); }
      else { cmsBulkBar.classList.remove('hidden'); cmsBulkBar.classList.add('flex'); }
    }
    if (cmsSelectedCount) cmsSelectedCount.textContent = count;
  }
  function getSelectedArray() {
    var arr = [];
    for (var k in selectedIds) { if (selectedIds.hasOwnProperty(k)) arr.push(k); }
    return arr;
  }
  async function handleBulkPublish() {
    var ids = getSelectedArray();
    if (ids.length === 0) return;
    if (!(await showConfirm('Publicar seleccionados', 'Publicar ' + ids.length + ' publicacion(es)?', 'Publicar', 'btn-success'))) return;
    var result = await supabase.from('publicaciones').update({ publicado: true }).in('id', ids);
    if (result.error) { showToast('Error: ' + result.error.message, 'error'); return; }
    showToast(ids.length + ' publicacion(es) publicada(s)', 'success');
    selectedIds = {}; await loadPublications();
  }
  async function handleBulkUnpublish() {
    var ids = getSelectedArray();
    if (ids.length === 0) return;
    if (!(await showConfirm('Ocultar seleccionados', 'Ocultar ' + ids.length + ' publicacion(es)?', 'Ocultar', 'btn-warning'))) return;
    var result = await supabase.from('publicaciones').update({ publicado: false }).in('id', ids);
    if (result.error) { showToast('Error: ' + result.error.message, 'error'); return; }
    showToast(ids.length + ' publicacion(es) ocultada(s)', 'success');
    selectedIds = {}; await loadPublications();
  }
  async function handleBulkDelete() {
    var ids = getSelectedArray();
    if (ids.length === 0) return;
    if (!(await showConfirm('Eliminar seleccionados', 'Eliminar ' + ids.length + ' publicacion(es)? Esta accion no se puede deshacer.', 'Eliminar', 'btn-danger'))) return;
    var result = await supabase.from('publicaciones').delete().in('id', ids);
    if (result.error) { showToast('Error: ' + result.error.message, 'error'); return; }
    showToast(ids.length + ' publicacion(es) eliminada(s)', 'success');
    selectedIds = {}; await loadPublications();
  }

  // ===== AUTO-SAVE DRAFTS =====
  var DRAFT_KEY = 'cms_draft';
  var draftTimeout = null;
  function autoSaveDraft() {
    if (!cmsEditId.value) {
      var draft = {
        titulo: cmsTitulo ? cmsTitulo.value : '',
        tipo: cmsTipo ? cmsTipo.value : '',
        resumen: cmsResumen ? cmsResumen.value : '',
        contenido: getEditorContent(),
        imagen_url: cmsImagen ? cmsImagen.value : '',
        pdf_url: cmsPdf ? cmsPdf.value : '',
        fecha: cmsFecha ? cmsFecha.value : '',
        publicado: cmsPublicado ? cmsPublicado.checked : false,
        savedAt: new Date().toISOString()
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    }
  }
  function scheduleAutoSave() { if (draftTimeout) clearTimeout(draftTimeout); draftTimeout = setTimeout(autoSaveDraft, 2000); }
  function restoreDraft() {
    try {
      var saved = localStorage.getItem(DRAFT_KEY);
      if (!saved) return false;
      var draft = JSON.parse(saved);
      if (!draft.titulo && !draft.contenido) return false;
      if ((new Date() - new Date(draft.savedAt)) / 3600000 > 24) { localStorage.removeItem(DRAFT_KEY); return false; }
      return draft;
    } catch(e) { return false; }
  }
  function clearDraft() { localStorage.removeItem(DRAFT_KEY); }

  // ===== MODAL TABS =====
  function initModalTabs() {
    for (var i = 0; i < cmsTabs.length; i++) {
      var tab = cmsTabs[i];
      tab.addEventListener('click', function() {
        for (var j = 0; j < cmsTabs.length; j++) cmsTabs[j].classList.remove('active');
        this.classList.add('active');
        for (var j = 0; j < cmsTabPanels.length; j++) cmsTabPanels[j].classList.remove('active');
        var panel = document.getElementById('tab-' + this.dataset.tab);
        if (panel) panel.classList.add('active');
      });
    }
  }

  // ===== LOAD PUBLICATIONS =====
  async function loadPublications() {
    if (cmsTbody) cmsTbody.innerHTML = generateSkeletons(5);
    if (cmsLoading) cmsLoading.classList.remove('hidden');
    if (cmsEmpty) cmsEmpty.classList.add('hidden');
    var query = supabase.from('publicaciones').select('*').order('fecha_publicacion', { ascending: false, nullsFirst: false }).order('creado_en', { ascending: false });
    var tipo = cmsFilterTipo ? cmsFilterTipo.value : '';
    if (tipo) query = query.eq('tipo', tipo);
    var result = await query;
    if (cmsLoading) cmsLoading.classList.add('hidden');
    if (result.error) {
      if (cmsTbody) cmsTbody.innerHTML = '<tr class="error-row"><td colspan="7" class="text-center py-10 text-red-500"><i class="fas fa-exclamation-circle text-3xl mb-2 block"></i>Error: ' + result.error.message + '</td></tr>';
      return;
    }
    allPublications = result.data || [];
    updateStats(allPublications);
    handleSearchFilter();
  }

  // ===== EVENT HANDLERS =====
  window.viewCMS = function(id) { window.open('../publicacion.html?id=' + id, '_blank'); };

  window.togglePublishCMS = async function(id, currentStatus) {
    await supabase.from('publicaciones').update({ publicado: !currentStatus }).eq('id', id);
    showToast(currentStatus ? 'Publicacion oculta' : 'Publicacion publicada', 'success');
    delete selectedIds[id]; await loadPublications();
  };

  // Create button
  if (cmsCreateBtn) {
    cmsCreateBtn.addEventListener('click', function() {
      cmsForm.reset(); cmsEditId.value = '';
      if (cmsModalTitle) cmsModalTitle.textContent = 'Nueva publicacion';
      setEditorContent('');
      if (cmsFecha) { var t = new Date(); cmsFecha.value = t.toISOString().split('T')[0]; }
      if (cmsPublicado) cmsPublicado.checked = true;
      if (cmsImagenPreviewContainer) cmsImagenPreviewContainer.classList.add('hidden');
      if (cmsPdfInfo) cmsPdfInfo.classList.add('hidden');
      var errs = document.querySelectorAll('.field-error');
      for (var i = 0; i < errs.length; i++) errs[i].remove();
      var errInputs = document.querySelectorAll('.input-error');
      for (var i = 0; i < errInputs.length; i++) errInputs[i].classList.remove('input-error');
      var ft = cmsTabs[0]; if (ft) ft.click();
      var draft = restoreDraft();
      if (draft) {
        showToast('Borrador recuperado de la sesion anterior', 'info');
        if (cmsTitulo) cmsTitulo.value = draft.titulo || '';
        if (cmsTipo) cmsTipo.value = draft.tipo || 'semanario';
        if (cmsResumen) cmsResumen.value = draft.resumen || '';
        setEditorContent(draft.contenido || '');
        if (cmsImagen) cmsImagen.value = draft.imagen_url || '';
        if (cmsPdf) cmsPdf.value = draft.pdf_url || '';
        if (cmsFecha) cmsFecha.value = draft.fecha || '';
        if (cmsPublicado) cmsPublicado.checked = draft.publicado !== undefined ? draft.publicado : true;
        if (draft.imagen_url) { var ev = new Event('input'); cmsImagen.dispatchEvent(ev); }
      }
      if (cmsModal) cmsModal.classList.remove('hidden');
    });
  }

  // Edit
  window.editCMS = async function(id) {
    var result = await supabase.from('publicaciones').select('*').eq('id', id).single();
    if (result.error || !result.data) { showToast('Error al cargar la publicacion', 'error'); return; }
    var data = result.data;
    cmsEditId.value = id; cmsTitulo.value = data.titulo || ''; cmsTipo.value = data.tipo || 'semanario';
    cmsResumen.value = data.resumen || ''; setEditorContent(data.contenido || '');
    cmsImagen.value = data.imagen_url || ''; cmsPdf.value = data.pdf_url || '';
    cmsFecha.value = data.fecha_publicacion || ''; cmsPublicado.checked = data.publicado || false;
    if (cmsModalTitle) cmsModalTitle.textContent = 'Editar publicacion';
    if (data.imagen_url) { var ev = new Event('input'); cmsImagen.dispatchEvent(ev); }
    var ft = cmsTabs[0]; if (ft) ft.click();
    var errs = document.querySelectorAll('.field-error');
    for (var i = 0; i < errs.length; i++) errs[i].remove();
    var errInputs = document.querySelectorAll('.input-error');
    for (var i = 0; i < errInputs.length; i++) errInputs[i].classList.remove('input-error');
    if (cmsModal) cmsModal.classList.remove('hidden');
  };

  // Delete
  window.deleteCMS = async function(id) {
    if (!(await showConfirm('Eliminar publicacion', 'Estas segura de eliminar esta publicacion? Esta accion no se puede deshacer.', 'Eliminar', 'btn-danger'))) return;
    var result = await supabase.from('publicaciones').delete().eq('id', id);
    if (result.error) { showToast('Error: ' + result.error.message, 'error'); return; }
    showToast('Publicacion eliminada', 'success');
    delete selectedIds[id]; await loadPublications();
  };

  // Submit form
  if (cmsForm) {
    cmsForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      var ed = document.getElementById('cms-contenido-editor');
      if (ed && cmsContenido) cmsContenido.value = ed.innerHTML;
      if (!validateForm()) { showToast('Corrige los errores en el formulario', 'error'); return; }
      var sb = $('cms-save-btn');
      var obh = sb ? sb.innerHTML : '';
      if (sb) { sb.disabled = true; sb.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...'; }
      var payload = {
        titulo: cmsTitulo.value.trim(),
        tipo: cmsTipo.value,
        resumen: cmsResumen.value.trim() || null,
        contenido: (cmsContenido ? cmsContenido.value.trim() : '') || null,
        imagen_url: cmsImagen.value.trim() || null,
        pdf_url: cmsPdf.value.trim() || null,
        fecha_publicacion: cmsFecha.value || null,
        publicado: cmsPublicado.checked
      };
      var eid = cmsEditId.value;
      var result;
      if (eid) { result = await supabase.from('publicaciones').update(payload).eq('id', eid); }
      else { result = await supabase.from('publicaciones').insert(payload); }
      if (result.error) { showToast('Error al guardar: ' + result.error.message, 'error'); if (sb) { sb.disabled = false; sb.innerHTML = obh; } return; }
      showToast(eid ? 'Publicacion actualizada' : 'Publicacion creada', 'success');
      clearDraft();
      if (cmsModal) cmsModal.classList.add('hidden');
      if (sb) { sb.disabled = false; sb.innerHTML = obh; }
      await loadPublications();
    });
  }

  // Close modal
  if (cmsCloseModal) cmsCloseModal.addEventListener('click', function() { if (cmsModal) cmsModal.classList.add('hidden'); });
  if (cmsCancelBtn) cmsCancelBtn.addEventListener('click', function() { if (cmsModal) cmsModal.classList.add('hidden'); });
  if (cmsModal) cmsModal.addEventListener('click', function(e) { if (e.target === cmsModal) cmsModal.classList.add('hidden'); });

  // Filter
  if (cmsApplyFilter) cmsApplyFilter.addEventListener('click', handleSearchFilter);
  if (cmsSearch) cmsSearch.addEventListener('input', handleSearchFilter);
  if (cmsClearSearch) {
    cmsClearSearch.addEventListener('click', function() {
      if (cmsSearch) cmsSearch.value = '';
      if (cmsFilterTipo) cmsFilterTipo.value = '';
      handleSearchFilter();
    });
  }

  // Select all
  if (cmsSelectAll) {
    cmsSelectAll.addEventListener('change', function() {
      var cbs = document.querySelectorAll('.cms-row-checkbox');
      for (var i = 0; i < cbs.length; i++) {
        cbs[i].checked = cmsSelectAll.checked;
        if (cmsSelectAll.checked) selectedIds[cbs[i].dataset.id] = true;
        else delete selectedIds[cbs[i].dataset.id];
      }
      updateBulkBar();
    });
  }

  // Bulk actions
  if (cmsBulkPublish) cmsBulkPublish.addEventListener('click', handleBulkPublish);
  if (cmsBulkUnpublish) cmsBulkUnpublish.addEventListener('click', handleBulkUnpublish);
  if (cmsBulkDelete) cmsBulkDelete.addEventListener('click', handleBulkDelete);

  // ===== KEYBOARD SHORTCUTS =====
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && cmsModal && !cmsModal.classList.contains('hidden')) cmsModal.classList.add('hidden');
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      if (cmsModal && !cmsModal.classList.contains('hidden')) { e.preventDefault(); cmsForm.dispatchEvent(new Event('submit')); }
    }
  });

  // ===== AUTO-SAVE ON CHANGES =====
  var autoSaveFields = [cmsTitulo, cmsTipo, cmsResumen, cmsImagen, cmsPdf, cmsFecha, cmsPublicado];
  for (var i = 0; i < autoSaveFields.length; i++) {
    var f = autoSaveFields[i];
    if (f) {
      f.addEventListener('input', scheduleAutoSave);
      f.addEventListener('change', scheduleAutoSave);
    }
  }
  var ed = document.getElementById('cms-contenido-editor');
  if (ed) ed.addEventListener('input', scheduleAutoSave);

  // ===== INIT =====
  initRichTextEditor();
  initImagePreview();
  initPdfValidation();
  initModalTabs();
  loadPublications();
});
