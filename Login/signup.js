// signup.js – Registro con teléfono, manejo de errores y campo opcional
document.addEventListener('DOMContentLoaded', async () => {
  await window.supabaseReady;
  const form = document.getElementById('signup-form');
  const fullnameInput = document.getElementById('fullname');
  const emailInput = document.getElementById('email');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const confirmPasswordInput = document.getElementById('confirm-password');
  const submitBtn = document.getElementById('submit-btn');
  const errorDiv = document.getElementById('error-message');
  const successDiv = document.getElementById('success-message');
  const togglePasswordBtn = document.getElementById('toggle-password');

  // Campo teléfono (puede no existir, lo manejamos con seguridad)
  const phoneInput = document.getElementById('phone');

  // Mostrar/ocultar contraseña
  if (togglePasswordBtn) {
    togglePasswordBtn.addEventListener('click', () => {
      const type = passwordInput.type === 'password' ? 'text' : 'password';
      passwordInput.type = type;
      const icon = togglePasswordBtn.querySelector('i');
      icon.classList.toggle('fa-eye');
      icon.classList.toggle('fa-eye-slash');
    });
  }

  // Validación de teléfono venezolano
  function isValidVenezuelaPhone(phone) {
    if (!phone) return true; // opcional
    const clean = phone.replace(/[\s\-\(\)]/g, '');
    return /^(04(1[246]|2[46]|4[046]|6[046]|2[346])\d{7})$/.test(clean);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorDiv.classList.add('hidden');
    successDiv.classList.add('hidden');

    const fullName = fullnameInput.value.trim();
    const email = emailInput.value.trim();
    const username = usernameInput.value.trim();
    const phone = phoneInput ? phoneInput.value.trim() : '';
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    // Validaciones básicas
    if (!fullName || !email || !username || !password) {
      errorDiv.textContent = 'Todos los campos obligatorios deben estar llenos.';
      errorDiv.classList.remove('hidden');
      return;
    }
    if (password.length < 6) {
      errorDiv.textContent = 'La contraseña debe tener al menos 6 caracteres.';
      errorDiv.classList.remove('hidden');
      return;
    }
    if (password !== confirmPassword) {
      errorDiv.textContent = 'Las contraseñas no coinciden.';
      errorDiv.classList.remove('hidden');
      return;
    }
    if (phone && !isValidVenezuelaPhone(phone)) {
      errorDiv.textContent = 'Ingresa un número de teléfono venezolano válido (ej: 0412-1234567).';
      errorDiv.classList.remove('hidden');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Registrando...';

    try {
      // 1. Registrar en Supabase Auth
      const { data, error } = await window.supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            user_name: username,
            phone: phone || null
          }
        }
      });
      if (error) throw error;

      if (data.user) {
      await window.supabase
      .from('perfiles')
      .upsert({
        id: data.user.id,
        nombre_completo: fullName,
        nombre_usuario: username,
        email: email,
        telefono: phone || null,
        rol: 'usuaria'    // ← indispensable
      });
      }

      successDiv.innerHTML = '<i class="fas fa-check-circle mr-2"></i> Cuenta creada con éxito. Redirigiendo al inicio de sesión...';
      successDiv.classList.remove('hidden');
      form.reset();

      setTimeout(() => {
        window.location.href = 'login.html';
      }, 3000);
    } catch (error) {
      errorDiv.textContent = error.message || 'Error al registrarse. Intenta de nuevo.';
      errorDiv.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Registrarse';
    }
  });
});