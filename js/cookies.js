// cookies.js – Utilidades de cookies + banner de consentimiento (RGPD-style)

const COOKIE_CONSENT_KEY = 'immujel_cookie_consent';

function setCookie(name, value, days) {
  const expires = days ? `; expires=${new Date(Date.now() + days * 864e5).toUTCString()}` : '';
  document.cookie = `${name}=${encodeURIComponent(value)}${expires}; path=/; SameSite=Lax`;
}

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

function deleteCookie(name) {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
}

function getConsent() {
  try { return JSON.parse(localStorage.getItem(COOKIE_CONSENT_KEY)); } catch (e) { return null; }
}

function setConsent(prefs) {
  localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify({ ...prefs, ts: Date.now() }));
}

function hasFunctionalConsent() {
  const c = getConsent();
  return !!(c && c.funcional);
}

function injectBanner() {
  if (document.getElementById('cookie-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'cookie-banner';
  banner.setAttribute('role', 'dialog');
  banner.setAttribute('aria-label', 'Preferencias de cookies');
  banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:200;background:#ffffff;border-top:4px solid #A506AD;box-shadow:0 -8px 30px rgba(165,6,173,0.15);padding:20px;display:flex;flex-wrap:wrap;align-items:center;gap:16px;justify-content:center;font-family:Arial,sans-serif;';
  banner.innerHTML = `
    <p style="flex:1;min-width:240px;margin:0;font-size:14px;color:#1f2937;max-width:640px;">
      Usamos cookies esenciales para el funcionamiento del sitio y, si lo permites, cookies funcionales para guardar tu historial de publicaciones vistas y tus preferencias. No usamos cookies de publicidad ni rastreo externo.
      <a href="/navegacion/privacidad.html" style="color:#A506AD;font-weight:600;text-decoration:underline;">Más información</a>
    </p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      <button id="cookie-reject" style="padding:10px 18px;border-radius:10px;border:1px solid #D1D5DB;background:#fff;color:#374151;font-weight:600;cursor:pointer;">Solo esenciales</button>
      <button id="cookie-accept" style="padding:10px 22px;border-radius:10px;border:none;background:linear-gradient(135deg,#A506AD,#0362CF);color:#fff;font-weight:700;cursor:pointer;">Aceptar todas</button>
    </div>
  `;
  document.body.appendChild(banner);

  document.getElementById('cookie-accept').addEventListener('click', () => {
    setConsent({ esencial: true, funcional: true });
    banner.remove();
  });
  document.getElementById('cookie-reject').addEventListener('click', () => {
    setConsent({ esencial: true, funcional: false });
    banner.remove();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  if (!getConsent()) injectBanner();
});

window.CookieUtil = { setCookie, getCookie, deleteCookie, getConsent, setConsent, hasFunctionalConsent };
