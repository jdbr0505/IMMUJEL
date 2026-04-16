// signup.js - Registro con teléfono, modal de confirmación y validación de contraseña
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('signup-form');
    const fullnameInput = document.getElementById('fullname');
    const emailInput = document.getElementById('email');
    const usernameInput = document.getElementById('username');
    const phoneInput = document.getElementById('phone');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirm-password');
    const submitBtn = document.getElementById('submit-btn');
    const errorDiv = document.getElementById('error-message');
    const successDiv = document.getElementById('success-message');
    const togglePasswordBtn = document.getElementById('toggle-password');
    const modal = document.getElementById('confirmation-modal');
    const modalEmailSpan = document.getElementById('modal-email');
    const closeModalBtn = document.getElementById('close-modal');

    // Indicador de fortaleza de contraseña
    const strengthDiv = document.getElementById('password-strength');
    function checkPasswordStrength(password) {
        let strength = 0;
        if (password.length >= 8) strength++;
        if (/[A-Z]/.test(password)) strength++;
        if (/[0-9]/.test(password)) strength++;
        if (/[^A-Za-z0-9]/.test(password)) strength++;
        if (strength === 0) return { text: 'Muy débil', color: 'text-red-500' };
        if (strength === 1) return { text: 'Débil', color: 'text-orange-500' };
        if (strength === 2) return { text: 'Media', color: 'text-yellow-500' };
        if (strength === 3) return { text: 'Fuerte', color: 'text-green-500' };
        return { text: 'Muy fuerte', color: 'text-green-600' };
    }
    passwordInput.addEventListener('input', () => {
        const result = checkPasswordStrength(passwordInput.value);
        strengthDiv.innerHTML = `<span class="${result.color}">${result.text}</span>`;
    });

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

    // Validación de teléfono venezolano (opcional)
    function isValidVenezuelaPhone(phone) {
        if (!phone) return true; // opcional
        const clean = phone.replace(/[\s\-\(\)]/g, '');
        const regex = /^(?:(?:\(?0?4(?:1[246]|2[46]|4[046]|6[046]|2[346]))?\)?[\s\-]?\d{7}|(?:\+?58)?4(?:1[246]|2[46]|4[046]|6[046]|2[346])\d{7})$/;
        return regex.test(clean);
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorDiv.classList.add('hidden');
        successDiv.classList.add('hidden');
        
        const fullName = fullnameInput.value.trim();
        const email = emailInput.value.trim();
        const username = usernameInput.value.trim();
        const phone = phoneInput.value.trim();
        const password = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        // Validaciones
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

            // 2. Insertar perfil (incluyendo teléfono)
            if (data.user) {
                await window.supabase
                    .from('profiles')
                    .upsert({
                        id: data.user.id,
                        full_name: fullName,
                        user_name: username,
                        phone: phone || null
                    });
            }

            // Mostrar modal en lugar de mensaje inline
            modalEmailSpan.textContent = email;
            modal.classList.remove('hidden');
            form.reset();
            
            // Redirigir al login cuando se cierre el modal
            closeModalBtn.onclick = () => {
                modal.classList.add('hidden');
                window.location.href = 'login.html';
            };
        } catch (error) {
            errorDiv.textContent = error.message || 'Error al registrarse. Intenta de nuevo.';
            errorDiv.classList.remove('hidden');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Registrarse';
        }
    });
});