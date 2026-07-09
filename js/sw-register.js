(function() {
  if ('serviceWorker' in navigator) {
    const swPath = (function() {
      const scripts = document.getElementsByTagName('script');
      const current = scripts[scripts.length - 1];
      const base = current.src.substring(0, current.src.lastIndexOf('/js/'));
      return base + '/sw.js';
    })();

    navigator.serviceWorker.register(swPath, { scope: '/' })
      .then(reg => {
        reg.addEventListener('updatefound', () => {
          const newSW = reg.installing;
          newSW.addEventListener('statechange', () => {
            if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
              if (confirm('Nueva versión disponible. ¿Actualizar?')) {
                newSW.postMessage({ action: 'skipWaiting' });
              }
            }
          });
        });
      })
      .catch(() => {});

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }
})();