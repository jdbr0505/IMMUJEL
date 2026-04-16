// login.js - Mejorado con modal de recuperación y manejo de errores
document.addEventListener('DOMContentLoaded', () => {
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

    // Mostrar/ocultar contraseña
    if (togglePassword) {
        togglePassword.addEventListener('click', () => {
            const type = passwordInput.type === 'password' ? 'text' : 'password';
            passwordInput.type = type;
            const icon = togglePassword.querySelector('i');
            icon.classList.toggle('fa-eye');
            icon.classList.toggle('fa-eye-slash');
        });
    }

    // Abrir modal de recuperación
    forgotBtn.addEventListener('click', () => {
        resetModal.classList.remove('hidden');
        resetEmail.value = emailInput.value.trim() || '';
    });

    // Cerrar modal
    closeResetModal.addEventListener('click', () => resetModal.classList.add('hidden'));
    // Cerrar al hacer clic fuera del contenido
    resetModal.addEventListener('click', (e) => {
        if (e.target === resetModal) resetModal.classList.add('hidden');
    });

    // Enviar enlace de restablecimiento
    sendResetLink.addEventListener('click', async () => {
        const email = resetEmail.value.trim();
        if (!email) {
            alert('Por favor ingresa tu correo electrónico.');
            return;
        }
        sendResetLink.disabled = true;
        sendResetLink.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Enviando...';
        try {
            const { error } = await window.supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + '/Login/update-password.html' // Página para nueva contraseña
            });
            if (error) throw error;
            alert('Se ha enviado un enlace de restablecimiento a tu correo electrónico.');
            resetModal.classList.add('hidden');
        } catch (error) {
            alert('Error: ' + error.message);
        } finally {
            sendResetLink.disabled = false;
            sendResetLink.innerHTML = 'Enviar enlace';
        }
    });

    // Inicio de sesión
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        submitBtn.disabled = true;
        submitBtn.textContent = 'Iniciando sesión...';
        errorDiv.classList.add('hidden');

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        try {
            const { data, error } = await window.supabase.auth.signInWithPassword({
                email,
                password
            });
            if (error) throw error;

            // Redirigir al inicio (o a la página anterior)
            window.location.href = '../index.html';
        } catch (error) {
            errorDiv.textContent = error.message || 'Error al iniciar sesión. Verifica tus credenciales.';
            errorDiv.classList.remove('hidden');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Iniciar Sesión';
        }
    });
});