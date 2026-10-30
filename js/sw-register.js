(function() {
  if ('serviceWorker' in navigator) {
    const swPath = (function() {
      const scripts = document.getElementsByTagName('script');
      const current = document.currentScript || scripts[scripts.length - 1];
      const base = current.src.substring(0, current.src.lastIndexOf('/js/'));
      return base + '/sw.js';
    })();

    navigator.serviceWorker.register(swPath, { scope: '/' })
      .then(reg => {
        reg.addEventListener('updatefound', () => {
          const newSW = reg.installing;
          newSW.addEventListener('statechange', () => {
            // La versión nueva del Service Worker solo cambia qué se guarda y cómo se atienden las peticiones: las páginas
            // siguen pidiéndose a la red primero. Se activa sola, sin preguntar y sin recargar, para que las mejoras
            // (y las solicitudes pendientes) no dependan de que alguien acepte un aviso en cada actualización del sitio.
            if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
              newSW.postMessage({ action: 'skipWaiting' });
            }
          });
        });
      })
      .catch(() => {});
  }
})();
