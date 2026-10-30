const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const G = require('../scripts/generar-precache.js');

test('sw-precache.js está al día con las páginas y archivos actuales (si falla: node scripts/generar-precache.js)', () => {
  const esperado = G.texto(G.construir());
  const actual = fs.existsSync(G.SALIDA) ? fs.readFileSync(G.SALIDA, 'utf8').replace(/\r\n/g, '\n') : '';
  assert.equal(actual, esperado);
});

test('referenciasDe: archivos propios con su ?v=, rutas relativas resueltas y bibliotecas externas conocidas', () => {
  const html = `
    <link rel="stylesheet" href="../styles.css">
    <link rel="stylesheet" href="../ds.css?v=2">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css" media="print" onload="this.media='all'">
    <link rel="preconnect" href="https://cdn.tailwindcss.com">
    <link rel="icon" href="../Images/HEAD.svg" type="image/svg+xml">
    <link rel="manifest" href="../manifest.json">
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="../js/ui.js?v=2" defer></script>
    <script src='./form.js'></script>
    <img src="../Images/LOGO IMMUJEL.png" alt="">
    <img src="data:image/gif;base64,AAAA" data-src="../Images/Second Slade.webp">
    <a href="./Programas.html">enlace</a>
    <!-- <script src="../js/comentado.js"></script> -->
    <script src="https://example.com/otro.js"></script>`;
  const r = G.referenciasDe('Forms/form.html', html);
  assert.deepEqual(r.locales.sort(), ['/Forms/form.js', '/Images/HEAD.svg', '/Images/LOGO%20IMMUJEL.png', '/ds.css?v=2', '/js/ui.js?v=2', '/manifest.json', '/styles.css'].sort());
  assert.deepEqual(r.externos.sort(), ['https://cdn.tailwindcss.com', 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css'].sort());
});

test('referenciasDe: la imagen que se carga perezosa (data-src) no entra en la precarga', () => {
  const r = G.referenciasDe('index.html', '<img src="data:image/gif;base64,AAAA" data-src="./Images/Second Slade.webp">');
  assert.deepEqual(r.locales, []);
});

test('rutaLimpia: igual que la dirección que sirve Vercel', () => {
  assert.equal(G.rutaLimpia('index.html'), '/');
  assert.equal(G.rutaLimpia('navegacion/Programas.html'), '/navegacion/Programas');
  assert.equal(G.rutaLimpia('navegacion/Sobre Nosotras.html'), '/navegacion/Sobre%20Nosotras');
  assert.equal(G.rutaLimpia('Forms/form.html'), '/Forms/form');
});

test('la precarga incluye las páginas públicas y no el panel ni las plantillas de correo', () => {
  const { paginas } = G.construir();
  for (const p of ['/', '/offline', '/Forms/form', '/navegacion/semanario', '/navegacion/publicacion', '/Login/login', '/Login/confirmado']) {
    assert.ok(paginas.includes(p), p);
  }
  for (const p of ['/Admin/Admin', '/Admin/Dashboard', '/Login/email-confirmacion', '/Login/reset-password-email', '/Dashboard%20IMMUJEL']) {
    assert.ok(!paginas.includes(p), p);
  }
});

test('todo archivo que piden las páginas existe en el repositorio', () => {
  const { archivos } = G.construir(); // lanza si falta alguno
  archivos.forEach((u) => assert.ok(fs.existsSync(path.join(G.RAIZ, decodeURI(u.split('?')[0]))), u));
});

test('la precarga trae los archivos con la versión que piden las páginas (antes solo guardaba los nombres sin ?v=, que nadie pedía)', () => {
  const { archivos } = G.construir();
  assert.ok(archivos.some((a) => /^\/nav\.css\?v=\d+$/.test(a)), 'nav.css con versión');
  assert.ok(archivos.some((a) => /^\/js\/auth\.js\?v=\d+$/.test(a)), 'auth.js con versión');
  assert.ok(archivos.some((a) => /^\/js\/offline-ui\.js\?v=\d+$/.test(a)), 'offline-ui.js con versión');
  assert.ok(archivos.includes('/styles.css'), 'styles.css (sin versión, se revalida solo)');
});

test('la precarga guarda /api/config para poder iniciar Supabase sin conexión', () => {
  assert.deepEqual(G.construir().dinamicos, ['/api/config']);
});

test('las bibliotecas externas de la precarga son solo las conocidas', () => {
  const { externos } = G.construir();
  externos.forEach((e) => assert.ok(['cdn.tailwindcss.com', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'cdn.jsdelivr.net'].includes(new URL(e).hostname), e));
  assert.ok(externos.some((e) => e.includes('tailwindcss')));
  assert.ok(externos.some((e) => e.includes('supabase-js')));
});
