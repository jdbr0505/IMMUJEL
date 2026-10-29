// estado-enlace.js – Decide qué pantalla mostrar al llegar desde el enlace del correo de confirmación (sin DOM ni red).
// Se usa en el navegador (window.EstadoEnlace) y en Node para las pruebas.
//
// Supabase redirige con los datos en el hash (#access_token=...&type=signup) o, en el flujo con código, en la dirección (?code=...).
// Si el enlace venció o ya se usó, redirige con #error=access_denied&error_code=otp_expired.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EstadoEnlace = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var TIPOS_DE_CONFIRMACION = ['signup', 'email'];

  function parametros(cadena) {
    var limpia = String(cadena || '').replace(/^[#?]/, '');
    var res = {};
    if (!limpia) return res;
    limpia.split('&').forEach(function (par) {
      if (!par) return;
      var i = par.indexOf('=');
      var clave = i < 0 ? par : par.slice(0, i);
      var valor = i < 0 ? '' : par.slice(i + 1);
      try { res[decodeURIComponent(clave)] = decodeURIComponent(valor.replace(/\+/g, ' ')); } catch (e) { res[clave] = valor; }
    });
    return res;
  }

  // 'confirmado' | 'vencido' | 'error' | 'sin-datos'
  function estadoDeEnlace(hash, busqueda) {
    var h = parametros(hash);
    var q = parametros(busqueda);
    var error = h.error || q.error;
    var codigoError = h.error_code || q.error_code;
    var descripcion = h.error_description || q.error_description || '';

    if (error || codigoError || descripcion) {
      var vencido = codigoError === 'otp_expired' || error === 'access_denied' || /invalid|expired/i.test(descripcion);
      return vencido ? 'vencido' : 'error';
    }
    if (h.access_token && TIPOS_DE_CONFIRMACION.indexOf(h.type) >= 0) return 'confirmado';
    if (q.code) return 'confirmado';
    return 'sin-datos';
  }

  return { estadoDeEnlace: estadoDeEnlace };
});
