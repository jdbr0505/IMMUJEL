// update-password.js
document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('update-password-form');
    const newPasswordInput = document.getElementById('new-password');
    const confirmPasswordInput = document.getElementById('confirm-password');
    const submitBtn = document.getElementById('submit-btn');
    const errorDiv = document.getElementById('error-message');
    const successDiv = document.getElementById('success-message');
    const togglePassword = document.getElementById('toggle-password');
    const strengthDiv = document.getElementById('password-strength');

    // Verificar si hay token en la URL (hash)
    const hash = window.location.hash;
    let accessToken = null;
    if (hash && hash.includes('access_token')) {
        const params = new URLSearchParams(hash.substring(1));
        accessToken = params.get('access_token');
    }
    if (!accessToken) {
        errorDiv.textContent = 'Enlace inválido o expirado. Solicita un nuevo restablecimiento.';
        errorDiv.classList.remove('hidden');
        submitBtn.disabled = true;
        return;
    }

    // Establecer la sesión con el token (necesario para poder actualizar)
    try {
        const { error } = await window.supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: '' // no tenemos refresh, pero Supabase lo manejará
        });
        if (error) throw error;
    } catch (err) {
        console.warn('Error al establecer sesión:', err);
        errorDiv.textContent = 'Enlace inválido o expirado.';
        errorDiv.classList.remove('hidden');
        submitBtn.disabled = true;
        return;
    }

    // Mostrar/ocultar contraseña
    if (togglePassword) {
        togglePassword.addEventListener('click', () => {
            const type = newPasswordInput.type === 'password' ? 'text' : 'password';
            newPasswordInput.type = type;
            const icon = togglePassword.querySelector('i');
            icon.classList.toggle('fa-eye');
            icon.classList.toggle('fa-eye-slash');
        });
    }

    // Fortaleza de contraseña
    function checkStrength(password) {
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
    newPasswordInput.addEventListener('input', () => {
        const result = checkStrength(newPasswordInput.value);
        strengthDiv.innerHTML = `<span class="${result.color}">${result.text}</span>`;
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorDiv.classList.add('hidden');
        successDiv.classList.add('hidden');

        const newPassword = newPasswordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        if (newPassword.length < 6) {
            errorDiv.textContent = 'La contraseña debe tener al menos 6 caracteres.';
            errorDiv.classList.remove('hidden');
            return;
        }
        if (newPassword !== confirmPassword) {
            errorDiv.textContent = 'Las contraseñas no coinciden.';
            errorDiv.classList.remove('hidden');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Actualizando...';

        try {
            const { error } = await window.supabase.auth.updateUser({
                password: newPassword
            });
            if (error) throw error;

            successDiv.innerHTML = '<i class="fas fa-check-circle mr-2"></i> Contraseña actualizada correctamente. Redirigiendo al inicio de sesión...';
            successDiv.classList.remove('hidden');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 2000);
        } catch (error) {
            errorDiv.textContent = error.message || 'Error al actualizar la contraseña. Intenta de nuevo.';
            errorDiv.classList.remove('hidden');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Actualizar contraseña';
        }
    });
});