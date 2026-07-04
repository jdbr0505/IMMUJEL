// auth.js – Control de sesión, panel izquierdo y navbar dinámico
(async function() {
  const supabase = window.supabase;
  if (!supabase) return;

  // No ejecutar en páginas de autenticación
  const loginPaths = ['/Login/login.html', '/Login/signup.html', '/Login/update-password.html'];
  if (loginPaths.some(p => window.location.pathname.includes(p))) return;

  const panelLink = document.getElementById('panel-link');
  const sessionBtn = document.getElementById('auth-section') || document.getElementById('auth-buttons');
  if (!sessionBtn && !panelLink) return;

  const pathDepth = (window.location.pathname.match(/\//g) || []).length;
  const basePath = pathDepth > 1 ? '../' : './';

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

      const nombre = profile?.nombre_completo || profile?.nombre_usuario || user.email;
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
        sessionBtn.innerHTML = `
          <div class="flex items-center space-x-3">
            <span class="text-sm font-medium text-gray-700"><i class="fas fa-user mr-1"></i>${nombreUsuario}</span>
            <button id="logout-btn" class="border border-purple-600 text-purple-700 hover:bg-purple-50 font-semibold py-2 px-4 rounded-full transition text-sm">Cerrar sesión</button>
          </div>`;

        document.getElementById('logout-btn').addEventListener('click', async () => {
          await supabase.auth.signOut();
          window.location.href = basePath + 'index.html';
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
