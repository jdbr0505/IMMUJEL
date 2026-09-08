(function() {
  if ('serviceWorker' in navigator) {
    const swPath = (function() {
      const scripts = document.getElementsByTagName('script');
      const current = scripts[scripts.length - 1];
      const base = current.src.substring(0, current.src.lastIndexOf('/js/'));
      return base + '/sw.js';
    })();

    let userInitiatedUpdate = false;

    navigator.serviceWorker.register(swPath, { scope: '/' })
      .then(reg => {
        reg.addEventListener('updatefound', () => {
          const newSW = reg.installing;
          newSW.addEventListener('statechange', () => {
            if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
              if (confirm('Nueva versión disponible. ¿Actualizar?')) {
                userInitiatedUpdate = true;
                newSW.postMessage({ action: 'skipWaiting' });
              }
            }
          });
        });
      })
      .catch(() => {});

    // El primer control (self.clients.claim() en la primera activación) también
    // dispara 'controllerchange', aunque no haya ninguna actualización real.
    // Solo recargamos si el propio usuario confirmó una actualización.
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!userInitiatedUpdate || refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }
})();