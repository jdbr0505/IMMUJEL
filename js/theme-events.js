// theme-events.js – Temas visuales por evento/fecha especial IMMUJEL
// Aplica html[data-theme-event="..."] muy temprano en la carga para evitar
// parpadeo. Fuente de verdad: tabla configuracion_visual en Supabase
// (modo automático = reglas de fecha; manual = elegido por administradora).

(function () {
  var TEMAS_VALIDOS = ['institucional', 'dia-naranja', 'octubre-rosa', 'activismo-16dias'];

  // ===== REGLAS DE CALENDARIO (modo automático) =====
  // Orden de prioridad: fechas puntuales (más específicas) antes que
  // campañas de mes completo, para que el 25 de octubre, por ejemplo,
  // se vea como Día Naranja y no como Octubre Rosa.
  function temaPorFecha(fecha) {
    var mes = fecha.getMonth() + 1; // 1-12
    var dia = fecha.getDate();

    // Día de la Mujer (8 de marzo) — misma paleta que Activismo
    if (mes === 3 && dia === 8) return 'activismo-16dias';

    // Día Naranja: 25 de cada mes (incluye el 25 de septiembre,
    // Día Internacional de la Eliminación de la Violencia contra la Mujer)
    if (dia === 25) return 'dia-naranja';

    // 16 días de activismo contra la violencia de género (25 nov - 10 dic)
    if ((mes === 11 && dia >= 25) || (mes === 12 && dia <= 10)) return 'activismo-16dias';

    // Octubre Rosa (mes completo)
    if (mes === 10) return 'octubre-rosa';

    return 'institucional';
  }

  function aplicarTema(temaId) {
    var root = document.documentElement;
    if (!temaId || temaId === 'institucional' || TEMAS_VALIDOS.indexOf(temaId) === -1) {
      root.removeAttribute('data-theme-event');
    } else {
      root.setAttribute('data-theme-event', temaId);
    }
  }

  // 1) Aplicar de inmediato por fecha local (evita parpadeo mientras
  //    llega la respuesta de Supabase, que puede tardar unos ms).
  aplicarTema(temaPorFecha(new Date()));

  // 2) Confirmar/corregir con la configuración real de Supabase en cuanto
  //    el cliente esté listo (respeta modo manual o "ninguno" del admin).
  if (window.supabaseReady) {
    window.supabaseReady.then(function (supabase) {
      return supabase
        .from('configuracion_visual')
        .select('modo, tema_manual')
        .eq('id', 'global')
        .single();
    }).then(function (result) {
      var cfg = result && result.data;
      if (!cfg) return;
      if (cfg.modo === 'ninguno') { aplicarTema('institucional'); return; }
      if (cfg.modo === 'manual' && cfg.tema_manual) { aplicarTema(cfg.tema_manual); return; }
      aplicarTema(temaPorFecha(new Date())); // modo automático
    }).catch(function () {
      // Sin conexión o tabla no disponible: se queda con la regla de fecha ya aplicada.
    });
  }

  window.ThemeEventsUtil = { temaPorFecha: temaPorFecha, aplicarTema: aplicarTema, TEMAS_VALIDOS: TEMAS_VALIDOS };
})();
