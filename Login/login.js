// login.js – Inicio de sesión con usuario o correo
document.addEventListener('DOMContentLoaded', async () => {
  await window.supabaseReady;
  const form = document.getElementById('login-form');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const errorDiv = document.getElementById('error-message');
  const submitBtn = document.getElementById('submit-btn');
  const togglePassword = document.getElementById('toggle-password');
  const forgotBtn = document.getElementById('forgot-password');
  const resetModal = document.getElementById('reset-modal');
  const resetEmail = document.getElementById('reset-email');
  const closeResetModal = document.getElementById('close-reset-modal');
  const sendResetLink = document.getElementById('send-reset-link');
  const resetMessage = document.getElementById('reset-message');

  if (togglePassword) {
    togglePassword.addEventListener('click', () => {
      const type = passwordInput.type === 'password' ? 'text' : 'password';
      passwordInput.type = type;
      const icon = togglePassword.querySelector('i');
      icon.classList.toggle('fa-eye');
      icon.classList.toggle('fa-eye-slash');
    });
  }

  forgotBtn.addEventListener('click', () => {
    resetModal.classList.remove('hidden');
    resetEmail.value = emailInput.value.trim() || '';
  });

  closeResetModal.addEventListener('click', () => resetModal.classList.add('hidden'));
  resetModal.addEventListener('click', (e) => {
    if (e.target === resetModal) resetModal.classList.add('hidden');
  });

  sendResetLink.addEventListener('click', async () => {
    const email = resetEmail.value.trim();
    if (!email) {
      if (resetMessage) {
        resetMessage.textContent = 'Por favor ingresa tu correo electrónico.';
        resetMessage.className = 'text-sm mb-4 text-center text-red-500';
        resetMessage.classList.remove('hidden');
      }
      return;
    }
    if (resetMessage) resetMessage.classList.add('hidden');
    sendResetLink.disabled = true;
    sendResetLink.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Enviando...';
    try {
      const { error } = await window.supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/Login/update-password.html'
      });
      if (error) throw error;
      if (resetMessage) {
        resetMessage.textContent = 'Revisa tu correo para restablecer la contraseña.';
        resetMessage.className = 'text-sm mb-4 text-center text-green-600';
        resetMessage.classList.remove('hidden');
      }
      setTimeout(() => resetModal.classList.add('hidden'), 3000);
    } catch (error) {
      if (resetMessage) {
        resetMessage.textContent = 'Error: ' + error.message;
        resetMessage.className = 'text-sm mb-4 text-center text-red-500';
        resetMessage.classList.remove('hidden');
      }
    } finally {
      sendResetLink.disabled = false;
      sendResetLink.innerHTML = 'Enviar enlace';
    }
  });

  // Resolver email a partir de nombre de usuario
  async function resolveEmail(input) {
    if (input.includes('@')) return input; // ya es email
    // Buscar en perfiles por nombre_usuario
    const { data, error } = await window.supabase
      .from('perfiles')
      .select('email')
      .eq('nombre_usuario', input)
      .maybeSingle();
    if (error || !data) return null;
    return data.email;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    submitBtn.disabled = true;
    submitBtn.textContent = 'Iniciando sesión...';
    errorDiv.classList.add('hidden');

    const rawInput = emailInput.value.trim();
    const password = passwordInput.value;

    if (!rawInput) {
      errorDiv.textContent = 'Ingresa tu usuario o correo electrónico.';
      errorDiv.classList.remove('hidden');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Iniciar Sesión';
      return;
    }

    try {
      // Resolver email si es usuario
      const email = await resolveEmail(rawInput);
      if (!email) {
        errorDiv.textContent = 'Usuario o correo no encontrado. Verifica tus datos.';
        errorDiv.classList.remove('hidden');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Iniciar Sesión';
        return;
      }

      const { data, error } = await window.supabase.auth.signInWithPassword({
        email,
        password
      });
      if (error) throw error;

      const { data: profile } = await window.supabase
        .from('perfiles')
        .select('rol')
        .eq('id', data.user.id)
        .single();

      if (profile?.rol === 'admin' || profile?.rol === 'asesora') {
        window.location.href = '../Admin/Admin.html';
      } else {
        window.location.href = '../index.html';
      }
    } catch (error) {
      let mensaje = '';
      if (error.message === 'Invalid login credentials') {
        mensaje = 'Usuario o contraseña incorrectos. Si aún no te has registrado, crea una cuenta primero.';
      } else if (error.message.includes('Email not confirmed')) {
        mensaje = 'Debes confirmar tu correo electrónico antes de iniciar sesión. Revisa tu bandeja de entrada.';
      } else {
        mensaje = error.message;
      }
      errorDiv.textContent = mensaje;
      errorDiv.classList.remove('hidden');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Iniciar Sesión';
      console.error('Error de inicio de sesión:', error);
    }
  });
});
