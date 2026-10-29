// errores-auth.js – Traduce los errores de Supabase Auth a mensajes en español (sin DOM ni red).
// Se usa en el navegador (window.ErroresAuth) en las páginas de ingreso, registro y cambio de contraseña, y en Node para las pruebas.
// Un error que no se reconoce nunca se muestra en inglés: se usa el texto de respaldo de cada pantalla.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ErroresAuth = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var CONTACTO = 'immujel2024@hotmail.com';
  var GENERICO = 'No se pudo completar la acción. Inténtalo de nuevo en unos minutos.';

  var MSG = {
    credenciales: 'Usuario o contraseña incorrectos. Si aún no te has registrado, crea una cuenta primero.',
    sinConfirmar: 'Debes confirmar tu correo electrónico antes de iniciar sesión. Revisa tu bandeja de entrada.',
    yaExiste: 'Ya existe una cuenta con ese correo. Inicia sesión o restablece tu contraseña.',
    contrasenaComun: 'Esa contraseña es muy común y fácil de adivinar. Elige otra.',
    contrasenaIgual: 'La nueva contraseña debe ser distinta a la anterior.',
    demasiadosCorreos: 'Se enviaron demasiados correos en poco tiempo. Espera unos minutos e inténtalo de nuevo.',
    demasiadosIntentos: 'Demasiados intentos seguidos. Espera un momento e inténtalo de nuevo.',
    correoInvalido: 'El correo electrónico no es válido. Revísalo e inténtalo de nuevo.',
    sesionVencida: 'Tu sesión venció. Abre de nuevo el enlace del correo o solicita uno nuevo.',
    enlaceVencido: 'El enlace venció o ya se usó. Solicita uno nuevo.',
    registroCerrado: 'El registro de cuentas está desactivado por ahora.',
    correoNoEnviado: 'No pudimos enviar el correo en este momento. Inténtalo de nuevo en unos minutos o escribe a ' + CONTACTO + '.',
    servidorLento: 'El servicio tardó demasiado en responder. Inténtalo de nuevo en unos minutos.',
    sinConexion: 'No se pudo conectar. Revisa tu conexión a internet e inténtalo de nuevo.',
    cuentaNoCreada: 'No pudimos crear tu cuenta en este momento. Inténtalo de nuevo en unos minutos.'
  };

  // Por código de Supabase Auth (error.code): es lo más estable.
  var POR_CODIGO = {
    invalid_credentials: 'credenciales',
    email_not_confirmed: 'sinConfirmar',
    user_already_exists: 'yaExiste',
    email_exists: 'yaExiste',
    same_password: 'contrasenaIgual',
    over_email_send_rate_limit: 'demasiadosCorreos',
    over_request_rate_limit: 'demasiadosIntentos',
    email_address_invalid: 'correoInvalido',
    session_not_found: 'sesionVencida',
    otp_expired: 'enlaceVencido',
    signup_disabled: 'registroCerrado',
    email_provider_disabled: 'registroCerrado'
  };

  function texto(error) {
    if (error == null) return '';
    if (typeof error === 'string') return error;
    return String(error.message || error.msg || error.error_description || '');
  }

  function segundosDeEspera(msg) {
    var m = /after\s+(\d+)\s+seconds?/i.exec(msg);
    return m ? Number(m[1]) : null;
  }

  function porTexto(msg, status) {
    var m;
    if (/invalid login credentials/i.test(msg)) return MSG.credenciales;
    if (/email not confirmed/i.test(msg)) return MSG.sinConfirmar;
    if (/user already registered|already been registered/i.test(msg)) return MSG.yaExiste;
    if (/known to be weak|easy to guess/i.test(msg)) return MSG.contrasenaComun;
    if ((m = /password should be at least (\d+) characters?/i.exec(msg))) {
      return 'La contraseña es demasiado corta. Usa al menos ' + m[1] + ' caracteres.';
    }
    if (/different from the old password/i.test(msg)) return MSG.contrasenaIgual;
    if (/for security purposes/i.test(msg)) {
      var s = segundosDeEspera(msg);
      return s ? 'Por seguridad, espera ' + s + ' segundos antes de volver a pedirlo.' : MSG.demasiadosIntentos;
    }
    if (/email rate limit exceeded/i.test(msg)) return MSG.demasiadosCorreos;
    if (/request rate limit/i.test(msg) || status === 429) return MSG.demasiadosIntentos;
    if (/unable to validate email address|email address .* is invalid|invalid format/i.test(msg)) return MSG.correoInvalido;
    if (/auth session missing/i.test(msg)) return MSG.sesionVencida;
    if (/invalid or has expired|otp.*expired/i.test(msg)) return MSG.enlaceVencido;
    if (/signups? not allowed|signup is disabled/i.test(msg)) return MSG.registroCerrado;
    if (/error sending .*email/i.test(msg)) return MSG.correoNoEnviado;
    if (/database error saving new user/i.test(msg)) return MSG.cuentaNoCreada;
    if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) return MSG.sinConexion;
    if (status === 502 || status === 503 || status === 504 || /^http\s*50[234]\b/i.test(msg)) return MSG.servidorLento;
    return null;
  }

  // Devuelve el mensaje en español para un error de Supabase Auth; `respaldo` es lo que se muestra si no se reconoce.
  function mensaje(error, respaldo) {
    var codigo = error && typeof error === 'object' ? error.code : null;
    var status = error && typeof error === 'object' ? Number(error.status) || null : null;
    if (codigo && POR_CODIGO[codigo]) return MSG[POR_CODIGO[codigo]];
    if (codigo === 'weak_password') {
      var debil = porTexto(texto(error), status);
      return debil || 'La contraseña es demasiado débil. Elige una más larga y menos común.';
    }
    return porTexto(texto(error), status) || respaldo || GENERICO;
  }

  return { mensaje: mensaje, CONTACTO: CONTACTO };
});
