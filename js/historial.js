// historial.js – Historial de publicaciones vistas (requiere consentimiento funcional)

const HISTORIAL_KEY = 'immujel_historial';
const HISTORIAL_MAX = 20;

function getHistorial() {
  try { return JSON.parse(localStorage.getItem(HISTORIAL_KEY)) || []; } catch (e) { return []; }
}

function registrarVisita(pub) {
  // pub: { id, titulo, tipo, url }
  if (!window.CookieUtil || !window.CookieUtil.hasFunctionalConsent()) return;
  if (!pub || !pub.id) return;

  let historial = getHistorial().filter(h => h.id !== pub.id);
  historial.unshift({ ...pub, visto_en: new Date().toISOString() });
  historial = historial.slice(0, HISTORIAL_MAX);
  localStorage.setItem(HISTORIAL_KEY, JSON.stringify(historial));
}

function borrarHistorial() {
  localStorage.removeItem(HISTORIAL_KEY);
}

function renderHistorial(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const historial = getHistorial();

  if (!window.CookieUtil || !window.CookieUtil.hasFunctionalConsent()) {
    el.innerHTML = '<p class="text-sm text-gray-400">Activa las cookies funcionales para ver tu historial.</p>';
    return;
  }
  if (historial.length === 0) {
    el.innerHTML = '<p class="text-sm text-gray-400">Aún no has visto publicaciones.</p>';
    return;
  }

  el.innerHTML = historial.map(h => `
    <a href="${h.url}" class="block px-3 py-2 rounded-lg hover:bg-purple-50 transition text-sm">
      <span class="font-medium text-gray-800">${h.titulo}</span>
      <span class="text-xs text-gray-400 block">${h.tipo === 'semanario' ? 'Semanario' : 'Noticiero'} · ${new Date(h.visto_en).toLocaleDateString('es-ES')}</span>
    </a>
  `).join('');
}

window.HistorialUtil = { getHistorial, registrarVisita, borrarHistorial, renderHistorial };
