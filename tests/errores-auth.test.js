const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../Login/errores-auth.js');

const CONTACTO = 'immujel2024@hotmail.com';

test('credenciales incorrectas, por código y por texto', () => {
  assert.match(E.mensaje({ code: 'invalid_credentials', message: 'Invalid login credentials' }), /Usuario o contraseña incorrectos/);
  assert.match(E.mensaje({ message: 'Invalid login credentials' }), /Usuario o contraseña incorrectos/);
});

test('correo sin confirmar', () => {
  assert.match(E.mensaje({ code: 'email_not_confirmed', message: 'Email not confirmed' }), /confirmar tu correo/);
  assert.match(E.mensaje({ message: 'Email not confirmed' }), /confirmar tu correo/);
});

test('cuenta que ya existe', () => {
  assert.match(E.mensaje({ code: 'user_already_exists', message: 'User already registered' }), /Ya existe una cuenta/);
  assert.match(E.mensaje({ message: 'User already registered' }), /Ya existe una cuenta/);
});

test('contraseña corta o débil nombra el mínimo que pide Supabase', () => {
  assert.match(E.mensaje({ code: 'weak_password', message: 'Password should be at least 8 characters.' }), /al menos 8 caracteres/);
  assert.match(E.mensaje({ message: 'Password should be at least 6 characters' }), /al menos 6 caracteres/);
  assert.match(E.mensaje({ code: 'weak_password', message: 'Password is known to be weak and easy to guess, please choose a different one.' }), /muy común/);
});

test('la contraseña nueva debe ser distinta de la anterior', () => {
  assert.match(E.mensaje({ code: 'same_password', message: 'New password should be different from the old password.' }), /distinta a la anterior/);
});

test('espera por seguridad conserva los segundos', () => {
  const m = E.mensaje({ status: 429, message: 'For security purposes, you can only request this after 42 seconds.' });
  assert.match(m, /42 segundos/);
});

test('límite de correos y de solicitudes', () => {
  assert.match(E.mensaje({ code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' }), /demasiados correos/);
  assert.match(E.mensaje({ message: 'Email rate limit exceeded' }), /demasiados correos/);
  assert.match(E.mensaje({ code: 'over_request_rate_limit', message: 'Request rate limit reached' }), /Demasiados intentos/);
});

test('correo con formato no válido', () => {
  assert.match(E.mensaje({ code: 'email_address_invalid', message: 'Email address "a@b" is invalid' }), /no es válido/);
  assert.match(E.mensaje({ message: 'Unable to validate email address: invalid format' }), /no es válido/);
});

test('sesión o enlace vencidos', () => {
  assert.match(E.mensaje({ message: 'Auth session missing!' }), /sesión venció/);
  assert.match(E.mensaje({ code: 'otp_expired', message: 'Email link is invalid or has expired' }), /enlace venció/);
});

test('fallo al enviar el correo indica a quién escribir', () => {
  for (const msg of ['Error sending recovery email', 'Error sending confirmation email']) {
    const m = E.mensaje({ status: 500, message: msg });
    assert.match(m, /No pudimos enviar el correo/);
    assert.ok(m.includes(CONTACTO), 'incluye el correo de contacto');
  }
});

test('tiempo de espera del servidor (504) y caídas', () => {
  assert.match(E.mensaje({ status: 504, message: 'HTTP 504' }), /tardó demasiado/);
  assert.match(E.mensaje({ status: 502, message: '' }), /tardó demasiado/);
  assert.match(E.mensaje({ message: 'HTTP 503' }), /tardó demasiado/);
});

test('sin conexión', () => {
  assert.match(E.mensaje({ message: 'Failed to fetch' }), /conexión a internet/);
  assert.match(E.mensaje(new TypeError('NetworkError when attempting to fetch resource.')), /conexión a internet/);
  assert.match(E.mensaje({ message: 'Load failed' }), /conexión a internet/);
});

test('error al guardar el usuario nuevo', () => {
  assert.match(E.mensaje({ status: 500, message: 'Database error saving new user' }), /No pudimos crear tu cuenta/);
});

test('un error desconocido en inglés nunca llega tal cual a la pantalla', () => {
  const crudo = 'Something odd happened in the auth server';
  assert.equal(E.mensaje({ message: crudo }, 'Error al registrarse. Intenta de nuevo.'), 'Error al registrarse. Intenta de nuevo.');
  const sinFallback = E.mensaje({ message: crudo });
  assert.ok(!sinFallback.includes(crudo));
  assert.match(sinFallback, /Inténtalo de nuevo/);
});

test('entradas vacías no rompen', () => {
  assert.match(E.mensaje(null), /Inténtalo de nuevo/);
  assert.match(E.mensaje(undefined, 'Hubo un problema.'), /Hubo un problema\./);
  assert.match(E.mensaje({}), /Inténtalo de nuevo/);
  assert.match(E.mensaje('Invalid login credentials'), /Usuario o contraseña incorrectos/);
});

test('el código manda sobre el texto', () => {
  assert.match(E.mensaje({ code: 'same_password', message: 'cualquier cosa' }), /distinta a la anterior/);
});
