// dashboard-charts.js – Gráficos del dashboard (Chart.js + sparkline SVG).
// Los colores se leen de los tokens CSS activos, así que siguen el tema oscuro y los estacionales.
(function () {
  'use strict';

  var FUENTE = "'Montserrat', 'Arial Nova', Arial, sans-serif";
  var instancias = {};
  var firmas = {};
  var configurado = false;

  function resolverColor(nombreVar) {
    var sonda = document.createElement('span');
    sonda.style.display = 'none';
    sonda.style.color = 'var(' + nombreVar + ')';
    var host = document.querySelector('.dash') || document.body;
    host.appendChild(sonda);
    var color = getComputedStyle(sonda).color;
    host.removeChild(sonda);
    return color;
  }

  function conAlfa(rgb, alfa) {
    var n = rgb.match(/[\d.]+/g);
    if (!n || n.length < 3) return rgb;
    return 'rgba(' + n[0] + ', ' + n[1] + ', ' + n[2] + ', ' + alfa + ')';
  }

  function paleta() {
    var oscuro = document.body.classList.contains('dark-theme');
    return {
      s1: resolverColor('--s1'),
      s2: resolverColor('--s2'),
      texto: resolverColor('--d-text'),
      tenue: resolverColor('--d-muted'),
      tooltipTexto: oscuro ? '#0A0518' : '#FFFFFF'
    };
  }

  function configurarChart() {
    if (configurado) return;
    Chart.defaults.font.family = FUENTE;
    Chart.defaults.font.size = 12;
    configurado = true;
  }

  function animacion(animar) {
    var reducir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return animar && !reducir ? { duration: 600 } : false;
  }

  function tooltip(p, etiqueta) {
    return {
      backgroundColor: p.texto,
      titleColor: p.tooltipTexto,
      bodyColor: p.tooltipTexto,
      cornerRadius: 8,
      padding: 10,
      displayColors: false,
      callbacks: { label: etiqueta }
    };
  }

  function textoSolicitudes(n) {
    return n + (n === 1 ? ' solicitud' : ' solicitudes');
  }

  // Reutiliza la instancia si ni los datos ni los colores cambiaron (evita parpadeo en cada refresco).
  function montar(clave, canvasId, config, firma) {
    if (instancias[clave] && firmas[clave] === firma) return;
    configurarChart();
    if (instancias[clave]) instancias[clave].destroy();
    instancias[clave] = new Chart(document.getElementById(canvasId), config);
    firmas[clave] = firma;
  }

  function quitar(clave) {
    if (!instancias[clave]) return;
    instancias[clave].destroy();
    delete instancias[clave];
    delete firmas[clave];
  }

  function tendencia(serie, p, animar) {
    var canvas = document.getElementById('chart-trend');
    var alto = canvas.parentElement.clientHeight || 260;
    var relleno = canvas.getContext('2d').createLinearGradient(0, 0, 0, alto);
    relleno.addColorStop(0, conAlfa(p.s1, 0.32));
    relleno.addColorStop(1, conAlfa(p.s1, 0));
    var ultimo = serie.length - 1;

    var config = {
      type: 'line',
      data: {
        labels: serie.map(function (e) { return e.etiqueta; }),
        datasets: [{
          data: serie.map(function (e) { return e.cantidad; }),
          borderColor: p.s1,
          backgroundColor: relleno,
          fill: true,
          tension: 0.35,
          borderWidth: 2.5,
          pointRadius: serie.map(function (e, i) { return i === ultimo ? 5 : 3; }),
          pointBackgroundColor: p.s1,
          pointBorderColor: p.s1,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: animacion(animar),
        plugins: {
          legend: { display: false },
          tooltip: tooltip(p, function (ctx) { return textoSolicitudes(ctx.parsed.y); })
        },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { color: p.tenue } },
          y: {
            beginAtZero: true,
            suggestedMax: 4,
            border: { display: false },
            grid: { color: conAlfa(p.tenue, 0.2) },
            ticks: { color: p.tenue, precision: 0 }
          }
        }
      }
    };
    montar('tendencia', 'chart-trend', config, JSON.stringify([serie, p.s1, p.tenue]));
    canvas.setAttribute('aria-label', 'Gráfico de área, solicitudes por mes: ' +
      serie.map(function (e) { return e.etiqueta + ' ' + e.cantidad; }).join(', '));
  }

  var etiquetasValor = {
    id: 'etiquetasValor',
    afterDatasetsDraw: function (chart, args, opciones) {
      var ctx = chart.ctx;
      ctx.save();
      ctx.font = '700 12px ' + FUENTE;
      ctx.fillStyle = opciones.color;
      ctx.textBaseline = 'middle';
      chart.getDatasetMeta(0).data.forEach(function (barra, i) {
        ctx.fillText(String(chart.data.datasets[0].data[i]), barra.x + 8, barra.y);
      });
      ctx.restore();
    }
  };

  function recortar(texto) {
    return texto.length > 20 ? texto.slice(0, 19) + '…' : texto;
  }

  function mostrarVacio(caja, canvas, mensaje) {
    var vacio = caja.querySelector('.empty');
    if (!vacio) {
      vacio = document.createElement('div');
      vacio.className = 'empty';
      caja.appendChild(vacio);
    }
    vacio.textContent = mensaje;
    vacio.hidden = false;
    canvas.hidden = true;
  }

  function ocultarVacio(caja, canvas) {
    var vacio = caja.querySelector('.empty');
    if (vacio) vacio.hidden = true;
    canvas.hidden = false;
  }

  function barras(opciones) {
    var caja = document.getElementById(opciones.cajaId);
    var canvas = document.getElementById(opciones.canvasId);
    var items = opciones.items;
    var p = opciones.paleta;

    if (items.length === 0) {
      quitar(opciones.clave);
      mostrarVacio(caja, canvas, opciones.mensajeVacio);
      canvas.setAttribute('aria-label', opciones.mensajeVacio);
      return;
    }
    ocultarVacio(caja, canvas);
    caja.style.height = Math.max(160, items.length * 38 + 16) + 'px';

    var config = {
      type: 'bar',
      data: {
        labels: items.map(function (i) { return i.etiqueta; }),
        datasets: [{
          data: items.map(function (i) { return i.cantidad; }),
          backgroundColor: opciones.color,
          borderRadius: 6,
          borderSkipped: false,
          maxBarThickness: 22
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: animacion(opciones.animar),
        layout: { padding: { right: 32 } },
        plugins: {
          legend: { display: false },
          etiquetasValor: { color: p.texto },
          tooltip: tooltip(p, function (ctx) { return textoSolicitudes(ctx.parsed.x); })
        },
        scales: {
          x: { display: false, beginAtZero: true },
          y: {
            grid: { display: false },
            border: { display: false },
            ticks: {
              color: p.texto,
              font: { weight: '600' },
              callback: function (valor) { return recortar(this.getLabelForValue(valor)); }
            }
          }
        }
      },
      plugins: [etiquetasValor]
    };
    montar(opciones.clave, opciones.canvasId, config, JSON.stringify([items, opciones.color, p.texto]));
    canvas.setAttribute('aria-label', opciones.descripcion + ': ' +
      items.map(function (i) { return i.etiqueta + ' ' + i.cantidad; }).join(', '));
  }

  function sparkline(contenedor, serie) {
    var NS = 'http://www.w3.org/2000/svg';
    var ANCHO = 200;
    var ALTO = 48;
    var margen = 4;
    var max = Math.max.apply(null, serie.map(function (e) { return e.cantidad; }).concat(1));
    var paso = serie.length > 1 ? (ANCHO - margen * 2) / (serie.length - 1) : 0;
    var puntos = serie.map(function (e, i) {
      return [margen + i * paso, ALTO - margen - (e.cantidad / max) * (ALTO - margen * 2)];
    });
    var linea = 'M' + puntos.map(function (pt) { return pt[0].toFixed(1) + ' ' + pt[1].toFixed(1); }).join(' L');
    var ultimo = puntos[puntos.length - 1];
    var area = linea + ' L' + ultimo[0].toFixed(1) + ' ' + ALTO + ' L' + puntos[0][0].toFixed(1) + ' ' + ALTO + ' Z';

    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + ANCHO + ' ' + ALTO);
    svg.setAttribute('preserveAspectRatio', 'none');
    var rellenoPath = document.createElementNS(NS, 'path');
    rellenoPath.setAttribute('d', area);
    rellenoPath.setAttribute('fill', 'currentColor');
    rellenoPath.setAttribute('fill-opacity', '0.14');
    var lineaPath = document.createElementNS(NS, 'path');
    lineaPath.setAttribute('d', linea);
    lineaPath.setAttribute('fill', 'none');
    lineaPath.setAttribute('stroke', 'currentColor');
    lineaPath.setAttribute('stroke-width', '2');
    lineaPath.setAttribute('stroke-linejoin', 'round');
    lineaPath.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.appendChild(rellenoPath);
    svg.appendChild(lineaPath);
    contenedor.textContent = '';
    contenedor.appendChild(svg);
  }

  window.DashboardCharts = { paleta: paleta, tendencia: tendencia, barras: barras, sparkline: sparkline };
})();
