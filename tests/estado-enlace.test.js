const test = require('node:test');
const assert = require('node:assert/strict');
const { estadoDeEnlace } = require('../Login/estado-enlace.js');

test('enlace de registro confirmado (flujo con token en el hash)', () => {
  assert.equal(estadoDeEnlace('#access_token=abc&expires_in=3600&refresh_token=xyz&token_type=bearer&type=signup', ''), 'confirmado');
  assert.equal(estadoDeEnlace('access_token=abc&type=signup', ''), 'confirmado', 'sin el # inicial');
});

test('confirmación de correo con type=email también cuenta', () => {
  assert.equal(estadoDeEnlace('#access_token=abc&type=email', ''), 'confirmado');
});

test('flujo con código en la dirección (PKCE)', () => {
  assert.equal(estadoDeEnlace('', '?code=9f2c1d3e'), 'confirmado');
});

test('enlace vencido o ya usado', () => {
  assert.equal(estadoDeEnlace('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired', ''), 'vencido');
  assert.equal(estadoDeEnlace('', '?error=access_denied&error_code=otp_expired'), 'vencido');
  assert.equal(estadoDeEnlace('', '?error_description=Email+link+is+invalid+or+has+expired'), 'vencido');
});

test('otros errores del enlace', () => {
  assert.equal(estadoDeEnlace('#error=server_error&error_code=unexpected_failure&error_description=Error+confirming+user', ''), 'error');
});

test('un enlace de restablecer contraseña no es una confirmación de registro', () => {
  assert.equal(estadoDeEnlace('#access_token=abc&type=recovery', ''), 'sin-datos');
});

test('sin datos o con datos incompletos no se da por confirmado', () => {
  assert.equal(estadoDeEnlace('', ''), 'sin-datos');
  assert.equal(estadoDeEnlace(undefined, undefined), 'sin-datos');
  assert.equal(estadoDeEnlace('#type=signup', ''), 'sin-datos', 'sin token');
  assert.equal(estadoDeEnlace('#foo=bar', '?x=1'), 'sin-datos');
});

test('un error manda sobre un token', () => {
  assert.equal(estadoDeEnlace('#access_token=abc&type=signup&error=access_denied&error_code=otp_expired', ''), 'vencido');
});
