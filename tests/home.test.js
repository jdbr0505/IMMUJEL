const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../js/home.js');

test('posicion: la lámina actual va al centro, la siguiente a la derecha y la anterior a la izquierda', () => {
  assert.equal(H.posicion(0, 0, 8), '0');
  assert.equal(H.posicion(1, 0, 8), '1');
  assert.equal(H.posicion(7, 0, 8), '-1');
});

test('posicion: las demás láminas esperan fuera de cuadro del lado que les toca', () => {
  assert.equal(H.posicion(2, 0, 8), 'out-r');
  assert.equal(H.posicion(3, 0, 8), 'out-r');
  assert.equal(H.posicion(4, 0, 8), 'out-l');
  assert.equal(H.posicion(6, 0, 8), 'out-l');
});

test('posicion: da la vuelta al llegar al final sin saltar por todas las láminas', () => {
  assert.equal(H.posicion(0, 7, 8), '1');
  assert.equal(H.posicion(6, 7, 8), '-1');
  assert.equal(H.posicion(7, 7, 8), '0');
});

test('posicion: funciona con cantidades impares y con una sola lámina', () => {
  assert.equal(H.posicion(2, 0, 5), 'out-r');
  assert.equal(H.posicion(3, 0, 5), 'out-l');
  assert.equal(H.posicion(0, 0, 1), '0');
});

test('siguiente: avanza y retrocede dando la vuelta', () => {
  assert.equal(H.siguiente(3, 8, 1), 4);
  assert.equal(H.siguiente(7, 8, 1), 0);
  assert.equal(H.siguiente(0, 8, -1), 7);
  assert.equal(H.siguiente(0, 0, 1), 0);
});

test('decidirSwipe: un arrastre largo cambia de lámina hacia el lado del arrastre', () => {
  assert.equal(H.decidirSwipe(-120, 400, 300), 'next');
  assert.equal(H.decidirSwipe(120, 400, 300), 'prev');
});

test('decidirSwipe: un arrastre corto y lento deja la lámina donde está', () => {
  assert.equal(H.decidirSwipe(-30, 400, 400), 'stay');
  assert.equal(H.decidirSwipe(30, 400, 400), 'stay');
});

test('decidirSwipe: un gesto corto pero rápido también cambia de lámina', () => {
  assert.equal(H.decidirSwipe(-40, 400, 100), 'next');
  assert.equal(H.decidirSwipe(40, 400, 100), 'prev');
});

test('decidirSwipe: un roce mínimo no cuenta aunque sea veloz', () => {
  assert.equal(H.decidirSwipe(-10, 400, 10), 'stay');
});

test('decidirSwipe: sin tiempo o sin ancho medible no cambia nada', () => {
  assert.equal(H.decidirSwipe(-30, 400, 0), 'stay');
  assert.equal(H.decidirSwipe(-300, 0, 200), 'stay');
});

test('valorContador: empieza en 0 y termina exactamente en el objetivo', () => {
  assert.equal(H.valorContador(0, 2800), 0);
  assert.equal(H.valorContador(1, 2800), 2800);
});

test('valorContador: no se sale del rango aunque el progreso se pase', () => {
  assert.equal(H.valorContador(-0.5, 85), 0);
  assert.equal(H.valorContador(1.7, 85), 85);
});

test('valorContador: arranca rápido y frena al final (ease-out) y nunca retrocede', () => {
  assert.ok(H.valorContador(0.5, 1000) > 500);
  let previo = -1;
  for (let i = 0; i <= 20; i++) {
    const valor = H.valorContador(i / 20, 150);
    assert.ok(valor >= previo, 'el contador no debe retroceder');
    previo = valor;
  }
});
