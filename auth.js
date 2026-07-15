// auth.js – Control de sesión, panel izquierdo, navbar dinámico y push subscriptions
(async function() {
  const supabase = await window.supabaseReady;

  const loginPaths = ['/Login/login.html', '/Login/signup.html', '/Login/update-password.html'];
  if (loginPaths.some(p => window.location.pathname.includes(p))) return;

  const panelLink = document.getElementById('panel-link');
  const sessionBtn = document.getElementById('auth-section');
  if (!sessionBtn && !panelLink) return;

  const pathDepth = (window.location.pathname.match(/\//g) || []).length;
  const basePath = pathDepth > 1 ? '../' : './';

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
            <a href="${basePath}Admin/Admin.html" class="group relative inline-flex items-center gap-2 bg-gradient-to-r from-purple-700 to-indigo-700 text-white font-semibold py-2 px-4 rounded-xl shadow-lg hover:shadow-xl hover:from-purple-600 hover:to-indigo-600 transition-all duration-300 text-sm">
              <span class="flex items-center justify-center w-7 h-7 rounded-lg bg-white/15 group-hover:bg-white/25 transition">
                <i class="fas fa-crown text-xs"></i>
              </span>
              <span class="tracking-wide">Admin</span>
              <span class="absolute -top-1.5 -right-1.5 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-white animate-pulse" style="border-color: white;"></span>
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
          if (active) {
            btn.className = 'relative inline-flex items-center gap-1.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold py-2 px-3 rounded-full transition-all text-xs shadow-md hover:from-purple-700 hover:to-blue-700';
            btn.title = 'Notificaciones activas · Clic para desactivar';
            btn.innerHTML = '<i class="fas fa-bell"></i><span class="hidden sm:inline ml-0.5">Activas</span><span class="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-white"></span>';
          } else {
            btn.className = 'inline-flex items-center gap-1.5 border border-purple-300 text-purple-600 hover:bg-purple-50 font-semibold py-2 px-3 rounded-full transition-all text-xs';
            btn.title = 'Activar notificaciones push';
            btn.innerHTML = '<i class="fas fa-bell-slash"></i><span class="hidden sm:inline ml-0.5">Notificar</span>';
          }
        }

        sessionBtn.innerHTML = `
          <div class="flex items-center space-x-3">
            <span class="text-sm font-medium text-gray-700 flex items-center gap-1">
              <i class="fas fa-user-circle text-purple-500"></i>${nombreUsuario}
            </span>
            <button id="notif-btn" class="inline-flex items-center gap-1.5 border border-purple-300 text-purple-600 hover:bg-purple-50 font-semibold py-2 px-3 rounded-full transition-all text-xs">
              <i class="fas fa-bell-slash"></i>
            </button>
            <button id="logout-btn" class="flex items-center gap-1.5 border border-purple-600 text-purple-700 hover:bg-purple-50 font-semibold py-2 px-4 rounded-full transition text-sm">
              <i class="fas fa-sign-out-alt"></i><span class="hidden sm:inline">Cerrar sesión</span>
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
      if (sessionBtn) {
        sessionBtn.innerHTML = `
          <div class="flex gap-2">
            <a href="${basePath}Login/login.html" class="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold py-2 px-4 rounded-full transition shadow-md text-sm">Iniciar Sesión</a>
            <a href="${basePath}Login/signup.html" class="border border-purple-600 text-purple-700 hover:bg-purple-50 font-semibold py-2 px-4 rounded-full transition text-sm">Registrarse</a>
          </div>`;
      }
    }
  } catch (err) {
    console.error('auth.js: Error general:', err);
    if (sessionBtn) {
      sessionBtn.innerHTML = `
        <div class="flex gap-2">
          <a href="${basePath}Login/login.html" class="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold py-2 px-4 rounded-full transition shadow-md text-sm">Iniciar Sesión</a>
          <a href="${basePath}Login/signup.html" class="border border-purple-600 text-purple-700 hover:bg-purple-50 font-semibold py-2 px-4 rounded-full transition text-sm">Registrarse</a>
        </div>`;
    }
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
