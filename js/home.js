// home.js – Carrusel de láminas, contadores y aparición escalonada de la página principal.
// La lógica pura (posicion, siguiente, decidirSwipe, valorContador) se prueba en Node; el resto toca el DOM.
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  root.HomeUI = api;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', api.iniciar);
  else api.iniciar();
})(typeof self !== 'undefined' ? self : this, function (root) {
  var INTERVALO_MS = 6000;
  var DURACION_CONTADOR_MS = 1600;
  var SWIPE_FRACCION = 0.22;   // arrastre largo: más del 22 % del ancho de la lámina
  var SWIPE_VELOCIDAD = 0.3;   // gesto rápido: píxeles por milisegundo
  var SWIPE_MINIMO_PX = 24;    // y que se haya movido al menos esto

  // ---------- Lógica pura ----------

  // Dónde está cada lámina respecto a la actual. Solo la anterior, la actual y la siguiente
  // se ven; el resto espera fuera de cuadro del lado que le toca, así al dar la vuelta
  // no cruza todo el carrusel.
  function posicion(indice, actual, total) {
    if (total < 2) return '0';
    var mitad = Math.floor(total / 2);
    var distancia = ((((indice - actual + mitad + total) % total) + total) % total) - mitad;
    if (distancia === 0) return '0';
    if (distancia === 1) return '1';
    if (distancia === -1) return '-1';
    return distancia > 0 ? 'out-r' : 'out-l';
  }

  function siguiente(actual, total, paso) {
    if (!(total > 0)) return 0;
    return (((actual + paso) % total) + total) % total;
  }

  // Cambia de lámina si el arrastre fue largo o si fue un gesto corto pero rápido (un deslizón con el pulgar).
  function decidirSwipe(dx, ancho, ms) {
    if (!(ancho > 0)) return 'stay';
    var distancia = Math.abs(dx);
    var velocidad = ms > 0 ? distancia / ms : 0;
    var largo = distancia >= ancho * SWIPE_FRACCION;
    var rapido = velocidad >= SWIPE_VELOCIDAD && distancia >= SWIPE_MINIMO_PX;
    if (!largo && !rapido) return 'stay';
    return dx < 0 ? 'next' : 'prev';
  }

  // Cuenta rápido al principio y frena al llegar (ease-out exponencial).
  function valorContador(progreso, objetivo) {
    var p = Math.min(1, Math.max(0, progreso));
    var suave = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
    return Math.round(objetivo * suave);
  }

  // ---------- DOM ----------

  function reducirMovimiento() {
    return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function iniciarCarrusel() {
    var raiz = document.querySelector('[data-poster]');
    if (!raiz) return;
    var visor = raiz.querySelector('.poster-viewport');
    var slides = Array.prototype.slice.call(raiz.querySelectorAll('.poster-slide'));
    var contenedorPuntos = raiz.querySelector('.poster-dots');
    var botonAnterior = raiz.querySelector('.poster-prev');
    var botonSiguiente = raiz.querySelector('.poster-next');
    var botonPausa = raiz.querySelector('.poster-pause');
    var numero = raiz.querySelector('.poster-n');
    var total = slides.length;
    if (!visor || total < 2) return;

    var actual = 0;
    var pausaUsuaria = reducirMovimiento();
    var pausaTemporal = false;
    var temporizador = null;
    var arrastre = null;
    var puntos = [];

    // Las imágenes pesan ~200 KB cada una: solo se piden la actual y sus vecinas.
    function cargar(i) {
      var img = slides[i].querySelector('img[data-src]');
      if (!img) return;
      img.src = img.getAttribute('data-src');
      img.removeAttribute('data-src');
    }

    function reprogramar() {
      clearTimeout(temporizador);
      if (pausaUsuaria || pausaTemporal || document.hidden) return;
      temporizador = setTimeout(function () { mostrar(actual + 1); }, INTERVALO_MS);
    }

    function mostrar(indice) {
      actual = siguiente(indice, total, 0);
      slides.forEach(function (slide, i) {
        var pos = posicion(i, actual, total);
        var activa = pos === '0';
        slide.setAttribute('data-pos', pos);
        slide.setAttribute('aria-hidden', activa ? 'false' : 'true');
        if (activa) slide.removeAttribute('inert'); else slide.setAttribute('inert', '');
        if (pos === '0' || pos === '1' || pos === '-1') cargar(i);
      });
      puntos.forEach(function (punto, i) {
        if (i === actual) punto.setAttribute('aria-current', 'true');
        else punto.removeAttribute('aria-current');
      });
      if (numero) numero.textContent = String(actual + 1);
      reprogramar();
    }

    function actualizarBotonPausa() {
      visor.setAttribute('aria-live', pausaUsuaria ? 'polite' : 'off');
      if (!botonPausa) return;
      botonPausa.setAttribute('aria-pressed', pausaUsuaria ? 'true' : 'false');
      botonPausa.setAttribute('aria-label', pausaUsuaria ? 'Reanudar el cambio automático de láminas' : 'Pausar el cambio automático de láminas');
      var icono = botonPausa.querySelector('i');
      if (icono) icono.className = pausaUsuaria ? 'fa-solid fa-play' : 'fa-solid fa-pause';
    }

    if (contenedorPuntos) {
      slides.forEach(function (_, i) {
        var punto = document.createElement('button');
        punto.type = 'button';
        punto.tabIndex = -1; // con teclado se usan anterior/siguiente y las flechas; los puntos son para ratón y dedo
        punto.className = 'poster-dot';
        punto.setAttribute('aria-label', 'Ir a la lámina ' + (i + 1) + ' de ' + total);
        punto.addEventListener('click', function () { mostrar(i); });
        contenedorPuntos.appendChild(punto);
        puntos.push(punto);
      });
    }

    if (botonAnterior) botonAnterior.addEventListener('click', function () { mostrar(actual - 1); });
    if (botonSiguiente) botonSiguiente.addEventListener('click', function () { mostrar(actual + 1); });
    if (botonPausa) {
      botonPausa.addEventListener('click', function () {
        pausaUsuaria = !pausaUsuaria;
        actualizarBotonPausa();
        reprogramar();
      });
    }

    // Pausa mientras la persona mira o interactúa (ratón encima, foco dentro) o la pestaña está oculta.
    raiz.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') { pausaTemporal = true; reprogramar(); } });
    raiz.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') { pausaTemporal = false; reprogramar(); } });
    raiz.addEventListener('focusin', function () { pausaTemporal = true; reprogramar(); });
    raiz.addEventListener('focusout', function () {
      setTimeout(function () {
        if (!raiz.contains(document.activeElement)) { pausaTemporal = false; reprogramar(); }
      }, 0);
    });
    document.addEventListener('visibilitychange', reprogramar);

    raiz.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); mostrar(actual - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); mostrar(actual + 1); }
    });

    // Arrastre con dedo o ratón: las láminas siguen al puntero y al soltar se decide por distancia o velocidad.
    visor.addEventListener('dragstart', function (e) { e.preventDefault(); });
    visor.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      arrastre = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), eje: null, dx: 0 };
    });
    visor.addEventListener('pointermove', function (e) {
      if (!arrastre || e.pointerId !== arrastre.id) return;
      var dx = e.clientX - arrastre.x0;
      var dy = e.clientY - arrastre.y0;
      if (arrastre.eje === null && Math.hypot(dx, dy) > 6) {
        arrastre.eje = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        if (arrastre.eje === 'x') {
          try { visor.setPointerCapture(e.pointerId); } catch (err) { /* el puntero ya terminó */ }
          visor.classList.add('is-dragging');
          clearTimeout(temporizador);
        }
      }
      if (arrastre.eje === 'x') {
        arrastre.dx = dx;
        visor.style.setProperty('--drag', dx + 'px');
      }
    });
    function soltar(e) {
      if (!arrastre || e.pointerId !== arrastre.id) return;
      var gesto = arrastre;
      arrastre = null;
      if (gesto.eje !== 'x') return;
      visor.classList.remove('is-dragging');
      visor.style.setProperty('--drag', '0px');
      var decision = e.type === 'pointercancel' ? 'stay' : decidirSwipe(gesto.dx, visor.clientWidth, performance.now() - gesto.t0);
      if (decision === 'next') mostrar(actual + 1);
      else if (decision === 'prev') mostrar(actual - 1);
      else reprogramar();
    }
    visor.addEventListener('pointerup', soltar);
    visor.addEventListener('pointercancel', soltar);

    actualizarBotonPausa();
    mostrar(0);
  }

  // Los números cuentan desde 0 solo cuando el banner entra en pantalla. Sin JS (o con movimiento reducido)
  // quedan los valores finales que trae el HTML.
  function iniciarContadores() {
    var contadores = Array.prototype.slice.call(document.querySelectorAll('.counter[data-target]'));
    if (!contadores.length || reducirMovimiento() || !('IntersectionObserver' in root)) return;
    var panel = contadores[0].closest('.impact-panel') || contadores[0].parentElement;
    contadores.forEach(function (c) { c.textContent = '0'; });

    function animar() {
      var inicio = null;
      function paso(ahora) {
        if (inicio === null) inicio = ahora;
        var progreso = Math.min(1, (ahora - inicio) / DURACION_CONTADOR_MS);
        contadores.forEach(function (c) {
          c.textContent = String(valorContador(progreso, Number(c.getAttribute('data-target')) || 0));
        });
        if (progreso < 1) requestAnimationFrame(paso);
      }
      requestAnimationFrame(paso);
    }

    var observador = new IntersectionObserver(function (entradas) {
      if (!entradas.some(function (e) { return e.isIntersecting; })) return;
      observador.disconnect();
      animar();
    }, { threshold: 0.35 });
    observador.observe(panel);
  }

  // Los grupos [data-stagger] muestran a sus hijos de uno en uno al entrar en pantalla (el CSS pone el retraso).
  function iniciarAparicion() {
    var grupos = Array.prototype.slice.call(document.querySelectorAll('[data-stagger]'));
    if (!grupos.length) return;
    if (!('IntersectionObserver' in root)) {
      grupos.forEach(function (g) { g.classList.add('is-in'); });
      return;
    }
    var observador = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        observador.unobserve(e.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    grupos.forEach(function (g) { observador.observe(g); });
  }

  function iniciar() {
    iniciarCarrusel();
    iniciarContadores();
    iniciarAparicion();
  }

  return {
    posicion: posicion,
    siguiente: siguiente,
    decidirSwipe: decidirSwipe,
    valorContador: valorContador,
    iniciar: iniciar
  };
});
