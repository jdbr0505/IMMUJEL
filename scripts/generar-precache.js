// generar-precache.js – Escribe sw-precache.js: qué guarda el Service Worker al instalarse para que el sitio abra sin conexión.
// Lee las páginas públicas, saca de cada una los archivos propios (con su ?v=, tal cual los pide la página) y las bibliotecas
// externas, y calcula una versión a partir del contenido: cuando cambia algún archivo, cambia la versión y el Service Worker
// descarta la caché vieja. tests/precache.test.js falla si este archivo quedó desactualizado.
//
// Uso:  node scripts/generar-precache.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RAIZ = path.resolve(__dirname, '..');
const SALIDA = path.join(RAIZ, 'sw-precache.js');

// Páginas públicas que deben abrir sin conexión (el panel y las plantillas de correo no).
const PAGINAS_FIJAS = ['index.html', '404.html', 'offline.html', 'Forms/form.html', 'Login/login.html', 'Login/signup.html', 'Login/update-password.html', 'Login/confirmado.html'];
const CARPETAS_DE_PAGINAS = ['navegacion'];
// Archivos que hay que guardar aunque ninguna página los nombre (hoy ninguno: las páginas ya piden todo lo que usan).
const ARCHIVOS_EXTRA = [];
// Respuestas dinámicas que el sitio necesita para iniciar sin conexión (la clave pública de Supabase): se guardan al instalar y se renuevan con la red.
const DINAMICOS = ['/api/config'];
const HOSTS_EXTERNOS =['cdn.tailwindcss.com', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'cdn.jsdelivr.net'];

function listarPaginas() {
  const todas = PAGINAS_FIJAS.slice();
  CARPETAS_DE_PAGINAS.forEach((c) => {
    fs.readdirSync(path.join(RAIZ, c)).filter((f) => f.endsWith('.html')).sort().forEach((f) => todas.push(c + '/' + f));
  });
  return todas.filter((p) => fs.existsSync(path.join(RAIZ, p)));
}

function rutaLimpia(paginaRel) {
  let p = '/' + paginaRel.replace(/\.html$/i, '');
  if (/\/index$/i.test(p)) p = p.replace(/\/index$/i, '/');
  return encodeURI(p);
}

function atributo(etiqueta, nombre) {
  const m = new RegExp('(?:^|[\\s<])' + nombre + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')', 'i').exec(etiqueta);
  return m ? (m[2] !== undefined ? m[2] : m[3]) : null;
}

// Devuelve { locales: [url con ?v=], externos: [url] } de una página.
function referenciasDe(paginaRel, html) {
  const locales = new Set();
  const externos = new Set();
  const dirPagina = path.posix.dirname('/' + paginaRel);
  // Sin comentarios ni el código de los <script> en línea (sus plantillas de texto parecen etiquetas: <img src="${foto}">)
  const sinComentarios = html.replace(/<!--[\s\S]*?-->/g, '').replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/gi, '$1$2');
  const etiquetas = sinComentarios.match(/<(script|link|img)\b[^>]*>/gi) || [];

  etiquetas.forEach((et) => {
    const tipo = /^<(\w+)/.exec(et)[1].toLowerCase();
    const ref = tipo === 'link' ? atributo(et, 'href') : atributo(et, 'src');
    if (!ref || /^(data:|mailto:|tel:|#|javascript:)/i.test(ref)) return;
    if (tipo === 'link') {
      const rel = (atributo(et, 'rel') || '').toLowerCase();
      if (!/(stylesheet|icon|manifest|apple-touch)/.test(rel)) return;
    }
    if (/^https?:\/\//i.test(ref)) {
      const host = new URL(ref).hostname;
      const util = tipo === 'script' || (tipo === 'link' && /stylesheet/i.test(atributo(et, 'rel') || ''));
      if (util && HOSTS_EXTERNOS.indexOf(host) >= 0) externos.add(ref);
      return;
    }
    const [sinFragmento] = ref.split('#');
    const [ruta, consulta] = sinFragmento.split('?');
    const absoluta = ruta.startsWith('/') ? path.posix.normalize(ruta) : path.posix.resolve(dirPagina, ruta);
    locales.add(encodeURI(decodeURI(absoluta)) + (consulta ? '?' + consulta : ''));
  });
  return { locales: [...locales], externos: [...externos] };
}

function sha1(buf) { return crypto.createHash('sha1').update(buf).digest('hex'); }

function construir() {
  const paginas = listarPaginas();
  const archivos = new Set(ARCHIVOS_EXTRA);
  const externos = new Set();
  paginas.forEach((p) => {
    const { locales, externos: ext } = referenciasDe(p, fs.readFileSync(path.join(RAIZ, p), 'utf8'));
    locales.forEach((l) => archivos.add(l));
    ext.forEach((e) => externos.add(e));
  });

  const lista = [...archivos].sort();
  const huellas = [];
  lista.forEach((url) => {
    const ruta = path.join(RAIZ, decodeURI(url.split('?')[0]));
    if (!fs.existsSync(ruta)) throw new Error('Una página pide un archivo que no existe: ' + url);
    huellas.push(url + ':' + sha1(fs.readFileSync(ruta)));
  });
  const rutasDePaginas = paginas.map((p) => {
    huellas.push(rutaLimpia(p) + ':' + sha1(fs.readFileSync(path.join(RAIZ, p))));
    return rutaLimpia(p);
  }).sort();
  const listaExternos = [...externos].sort();
  const version = sha1(huellas.concat(DINAMICOS, listaExternos).join('\n')).slice(0, 10);
  return { version, paginas: rutasDePaginas, archivos: lista, dinamicos: DINAMICOS.slice(), externos: listaExternos };
}

function texto(obj) {
  return '// Generado por scripts/generar-precache.js (node scripts/generar-precache.js). No se edita a mano:\n' +
    '// tests/precache.test.js falla si no coincide con las páginas y archivos actuales.\n' +
    'self.PRECACHE = ' + JSON.stringify(obj, null, 2) + ';\n';
}

if (require.main === module) {
  const obj = construir();
  fs.writeFileSync(SALIDA, texto(obj));
  console.log('sw-precache.js: versión ' + obj.version + ' · ' + obj.paginas.length + ' páginas · ' + obj.archivos.length + ' archivos · ' + obj.externos.length + ' externos');
}

module.exports = { construir, texto, referenciasDe, rutaLimpia, SALIDA, RAIZ };
