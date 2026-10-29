// confirmado.js – Pantalla a la que llega la usuaria desde el botón del correo de confirmación de cuenta.
// El estado (confirmado, vencido, error o sin datos) sale de la dirección (estado-enlace.js); si está confirmado se completa
// con el nombre y la sesión que Supabase abre al volver del enlace.
// Va dentro de DOMContentLoaded porque Login_supabase.js (window.supabaseReady) se carga al final de la página.
document.addEventListener('DOMContentLoaded', function () {
  var secciones = document.querySelectorAll('[data-estado]');

  function mostrar(estado) {
    secciones.forEach(function (s) { s.classList.toggle('hidden', s.dataset.estado !== estado); });
    var activa = document.querySelector('[data-estado="' + estado + '"]');
    var titulo = activa && activa.querySelector('[data-titulo]');
    if (titulo) {
      document.title = titulo.textContent + ' | IMMUJEL';
      titulo.focus();
    }
  }

  // Los tokens del enlace no deben quedar a la vista en la barra de direcciones ni en el historial
  function limpiarDireccion() {
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* sin historial: no importa */ }
  }

  var estado = window.EstadoEnlace.estadoDeEnlace(location.hash, location.search);
  if (estado !== 'confirmado') {
    mostrar(estado);
    limpiarDireccion();
    return;
  }

  // El correo ya quedó confirmado en Supabase antes de volver aquí: se muestra de inmediato
  mostrar('confirmado');

  var acciones = document.getElementById('acciones-confirmado');
  var btnAsesoria = document.getElementById('btn-asesoria');
  var btnLogin = document.getElementById('btn-login');
  var saludo = document.getElementById('saludo');

  function mostrarAcciones(haySesion) {
    btnAsesoria.classList.toggle('hidden', !haySesion);
    btnLogin.classList.toggle('hidden', haySesion);
    acciones.classList.remove('hidden');
  }

  (async function () {
    var haySesion = false;
    try {
      var supabase = await window.supabaseReady;
      // getSession espera a que el cliente termine de leer el hash del enlace
      var respuesta = await supabase.auth.getSession();
      var sesion = respuesta && respuesta.data && respuesta.data.session;
      haySesion = !!sesion;
      if (sesion) {
        var perfil = await supabase.from('perfiles').select('nombre_completo').eq('id', sesion.user.id).maybeSingle();
        var nombre = perfil && perfil.data && perfil.data.nombre_completo;
        if (nombre) {
          saludo.textContent = 'Hola, ' + String(nombre).trim().split(/\s+/)[0] + '.';
          saludo.classList.remove('hidden');
        }
      }
    } catch (error) {
      console.error('Confirmación: no se pudo leer la sesión:', error);
    } finally {
      mostrarAcciones(haySesion);
      limpiarDireccion();
    }
  })();
});
