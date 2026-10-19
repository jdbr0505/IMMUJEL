// dashboard-ui.js – Utilidades de interfaz compartidas por los módulos de render del dashboard.
// Todo texto que viene de la base de datos entra al DOM con textContent, nunca con innerHTML.
(function () {
  'use strict';

  var M = window.DashboardMetrics;

  var DIAS_PERIODO = { '30': 30, '90': 90, '365': 365, all: null };
  var PERIODO_TEXTO = { '30': 'los últimos 30 días', '90': 'los últimos 90 días', '365': 'los últimos 12 meses', all: 'todo el histórico' };
  var PERIODO_COMPARA = { '30': 'vs. 30 días previos', '90': 'vs. 90 días previos', '365': 'vs. 12 meses previos' };

  var nf = new Intl.NumberFormat('es-VE');
  var nfDecimal = new Intl.NumberFormat('es-VE', { maximumFractionDigits: 1 });

  function $(id) { return document.getElementById(id); }
  function setText(id, texto) { $(id).textContent = texto; }
  function plural(n, singular, pluralTxt) { return n === 1 ? singular : pluralTxt; }
  var SIN_DATO = 'n/d';
  function pct(ratio) { return ratio === null ? SIN_DATO : Math.round(ratio * 100) + '%'; }

  function nodo(etiqueta, clase, texto) {
    var el = document.createElement(etiqueta);
    if (clase) el.className = clase;
    if (texto !== undefined && texto !== null) el.textContent = texto;
    return el;
  }

  function fechaCorta(valor) {
    return M.fechaLocal(valor).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function dias(n) { return n + (n === 1 ? ' día' : ' días'); }

  function chip(texto, tono) {
    var c = nodo('span', 'chip', texto);
    c.dataset.tono = tono;
    return c;
  }

  function chipEstado(estado) {
    var c = nodo('span', 'chip', estado);
    c.dataset.estado = estado;
    return c;
  }

  // Indicador de cambio: la flecha va siempre acompañada de texto, el color nunca es la única señal.
  function indicador(elemento, valor, tono, texto) {
    elemento.textContent = '';
    elemento.dataset.tone = tono;
    if (valor !== null && valor !== 0) {
      var icono = nodo('i', 'fas ' + (valor > 0 ? 'fa-arrow-up' : 'fa-arrow-down'));
      icono.setAttribute('aria-hidden', 'true');
      elemento.appendChild(icono);
    }
    if (texto) elemento.appendChild(document.createTextNode(texto));
  }

  // Cambia las clases de Tailwind de un elemento: quita las de `quitar` y pone las de `poner`.
  function cambiarClases(elemento, quitar, poner) {
    quitar.split(' ').forEach(function (c) { if (c) elemento.classList.remove(c); });
    poner.split(' ').forEach(function (c) { if (c) elemento.classList.add(c); });
  }

  function textoVariacion(v) {
    if (v === null) return '';
    if (v === 0) return 'igual que el periodo anterior';
    return Math.round(Math.abs(v) * 100) + '% ' + (v > 0 ? 'más' : 'menos') + ' que el periodo anterior';
  }

  // Mes con más registros de una serie mensual (o el primero si todos valen cero).
  function mesPico(serie) {
    return serie.reduce(function (max, s) { return s.cantidad > max.cantidad ? s : max; }, serie[0]);
  }

  window.DashboardUI = {
    DIAS_PERIODO: DIAS_PERIODO,
    PERIODO_TEXTO: PERIODO_TEXTO,
    PERIODO_COMPARA: PERIODO_COMPARA,
    SIN_DATO: SIN_DATO,
    nf: nf,
    nfDecimal: nfDecimal,
    $: $,
    setText: setText,
    plural: plural,
    pct: pct,
    nodo: nodo,
    fechaCorta: fechaCorta,
    dias: dias,
    chip: chip,
    chipEstado: chipEstado,
    indicador: indicador,
    cambiarClases: cambiarClases,
    textoVariacion: textoVariacion,
    mesPico: mesPico
  };
})();
