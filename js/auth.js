// auth.js – Control de sesión, panel izquierdo, navbar dinámico y push subscriptions
(async function() {
  // El enlace del correo de registro puede caer en otra página (si Supabase no tiene permitida la dirección de confirmación, vuelve a la
  // raíz del sitio): se lleva a la pantalla de confirmación con el mismo hash, antes de que el cliente de Supabase lo consuma.
  if (!/\/Login\//i.test(window.location.pathname) && /[#&](type=signup|error_code=otp_expired)(&|$)/.test(window.location.hash)) {
    const profundidad = (window.location.pathname.match(/\//g) || []).length;
    window.location.replace((profundidad > 1 ? '../' : './') + 'Login/confirmado' + window.location.hash);
    return;
  }

  const supabase = await window.supabaseReady;

  const loginPaths = ['/Login/login.html', '/Login/signup.html', '/Login/update-password.html'];
  if (loginPaths.some(p => window.location.pathname.includes(p))) return;

  const panelLink = document.getElementById('panel-link');
  const sessionBtn = document.getElementById('auth-section');
  if (!sessionBtn && !panelLink) return;

  const pathDepth = (window.location.pathname.match(/\//g) || []).length;
  const basePath = pathDepth > 1 ? '../' : './';

  // El nombre de usuario lo escribe la propia usuaria al registrarse: se escapa antes de ir a innerHTML
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Visitante sin sesión (también es lo que se muestra si falla la consulta de sesión)
  const marcaDeVisitante = () => `
    <div class="nav-actions">
      <a href="${basePath}Login/login.html" class="nav-btn nav-btn--solid">Iniciar sesión</a>
      <a href="${basePath}Login/signup.html" class="nav-btn nav-btn--outline">Registrarse</a>
    </div>`;

  async function subscribePush(userId, swReg) {
    try {
      const sub = await swReg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array('BNTnC-YiVVvaEr3O-XcQRukVQGLx7urVO3J99rKpsWYrwaaVy4qMLNHpA7xHT2NHGvlDhFMdBsxHx-wtTEPbXb0')
      });
      const json = sub.toJSON();
      await supabase.from('push_subscriptions').upsert({
        user_id: userId,
        endpoint: json.endpoint,
        auth: json.keys.auth,
        p256dh: json.keys.p256dh
      }, { onConflict: 'endpoint' });
    } catch {}
  }

  async function unsubscribeAll(swBase) {
    try {
      const reg = await navigator.serviceWorker.ready;
      const subs = await reg.pushManager.getSubscription();
      if (subs) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', subs.endpoint);
        await subs.unsubscribe();
      }
    } catch {}
  }

  function urlBase64ToUint8Array(base) {
    const pad = base.replace(/=+$/, '');
    const str = atob(pad.replace(/-/g, '+').replace(/_/g, '/'));
    return new Uint8Array([...str].map(c => c.charCodeAt(0)));
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { data: profile, error: profileError } = await supabase
        .from('perfiles')
        .select('nombre_completo, nombre_usuario, rol')
        .eq('id', user.id)
        .single();

      if (profileError) {
        console.warn('auth.js: Error al obtener perfil:', profileError.message);
      }

      const nombreUsuario = profile?.nombre_usuario || user.email;
      const rol = profile?.rol || 'usuaria';

      if (panelLink) {
        if (rol === 'admin' || rol === 'asesora') {
          panelLink.innerHTML = `
            <a href="${basePath}Admin/Admin.html" class="nav-admin" title="Ir al panel de administración">
              <span class="nav-admin__icon"><i class="fas fa-crown" aria-hidden="true"></i></span>
              <span>Admin</span>
              <span class="nav-dot" aria-hidden="true"></span>
            </a>`;
        } else {
          panelLink.innerHTML = '';
        }
      }

      if (sessionBtn) {
        let notifActive = false;
        if ('serviceWorker' in navigator && 'PushManager' in window) {
          try {
            const swReg = await navigator.serviceWorker.ready;
            notifActive = !!(await swReg.pushManager.getSubscription());
          } catch {}
        }

        function updateNotifBtn(active) {
          const btn = document.getElementById('notif-btn');
          if (!btn) return;
          btn.className = 'nav-btn nav-btn--bell ' + (active ? 'nav-btn--solid' : 'nav-btn--ghost');
          btn.title = active ? 'Notificaciones activas · Clic para desactivar' : 'Activar notificaciones push';
          btn.innerHTML = active
            ? '<i class="fas fa-bell" aria-hidden="true"></i><span class="nav-btn-label">Desactivar notificaciones</span><span class="nav-dot" aria-hidden="true"></span>'
            : '<i class="fas fa-bell-slash" aria-hidden="true"></i><span class="nav-btn-label">Activar notificaciones</span>';
        }

        const nombreSeguro = esc(nombreUsuario);
        const inicial = esc(Array.from(String(nombreUsuario).trim())[0] || '?');
        sessionBtn.innerHTML = `
          <div class="nav-actions nav-actions--session">
            <span class="nav-user" title="Sesión iniciada como ${nombreSeguro}">
              <span class="nav-avatar" aria-hidden="true">${inicial}</span>
              <span class="nav-user-name">${nombreSeguro}</span>
            </span>
            <button type="button" id="notif-btn" class="nav-btn nav-btn--bell nav-btn--ghost"></button>
            <button type="button" id="logout-btn" class="nav-btn nav-btn--logout nav-btn--outline" title="Cerrar sesión">
              <i class="fas fa-sign-out-alt" aria-hidden="true"></i><span class="nav-btn-label">Cerrar sesión</span>
            </button>
          </div>`;

        updateNotifBtn(notifActive);

        document.getElementById('notif-btn').addEventListener('click', async function() {
          if ('Notification' in window && Notification.permission !== 'granted') {
            const perm = await Notification.requestPermission();
            if (perm !== 'granted') return;
          }
          if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.ready;
            const existing = await reg.pushManager.getSubscription();
            if (existing) {
              await unsubscribeAll();
              notifActive = false;
            } else {
              await subscribePush(user.id, reg);
              notifActive = true;
            }
            updateNotifBtn(notifActive);
          }
        });

        document.getElementById('logout-btn').addEventListener('click', async () => {
          if (!document.getElementById('logout-modal')) createLogoutModal();
          document.getElementById('logout-modal').classList.remove('hidden');
        });
      }
    } else {
      if (panelLink) panelLink.innerHTML = '';
      if (sessionBtn) sessionBtn.innerHTML = marcaDeVisitante();
    }
  } catch (err) {
    console.error('auth.js: Error general:', err);
    if (sessionBtn) sessionBtn.innerHTML = marcaDeVisitante();
  }
})();

function createLogoutModal() {
  const div = document.createElement('div');
  div.innerHTML = `
    <div id="logout-modal" class="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm hidden" role="dialog" aria-modal="true" aria-label="Confirmar cierre de sesión">
      <div class="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center animate-scale-in" style="animation: scaleIn 0.25s ease-out;">
        <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-purple-100 flex items-center justify-center">
          <i class="fas fa-sign-out-alt text-2xl text-purple-600"></i>
        </div>
        <h2 class="text-xl font-bold text-gray-800 mb-2">Cerrar sesión</h2>
        <p class="text-gray-500 mb-6">¿Estás segura de que deseas salir de tu cuenta?</p>
        <div class="flex gap-3 justify-center">
          <button class="logout-cancel-btn px-6 py-2.5 border border-gray-300 text-gray-600 rounded-xl hover:bg-gray-50 font-medium transition text-sm">Cancelar</button>
          <button class="logout-confirm-btn px-6 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl hover:from-purple-700 hover:to-blue-700 font-medium transition shadow-md text-sm">
            <i class="fas fa-check mr-1"></i> Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(div.firstElementChild);
  const modal = document.getElementById('logout-modal');

  modal.querySelector('.logout-cancel-btn').addEventListener('click', () => modal.classList.add('hidden'));
  modal.querySelector('.logout-confirm-btn').addEventListener('click', async () => {
    modal.classList.add('hidden');
    const sb = window.supabase;
    if (sb) await sb.auth.signOut();
    const depth = (window.location.pathname.match(/\//g) || []).length;
    window.location.href = (depth > 1 ? '../' : './') + 'index.html';
  });
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
  document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape' && !modal.classList.contains('hidden')) { modal.classList.add('hidden'); } });

  setTimeout(() => modal.querySelector('.logout-cancel-btn').focus(), 100);
}
