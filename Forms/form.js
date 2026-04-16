// form.js - Mejorado con carga de perfil, validación avanzada y modal
document.addEventListener('DOMContentLoaded', async () => {
    // Elementos del DOM
    const form = document.getElementById('report-form');
    const incognitoCheck = document.getElementById('incognito');
    const fullPersonalInfo = document.getElementById('full-personal-info');
    const phoneInput = document.getElementById('phone');
    const phoneRequiredIndicator = document.getElementById('phone-required-indicator');
    const nameInput = document.getElementById('name');
    const idInput = document.getElementById('id-number');
    const emailInput = document.getElementById('email');
    const abuseSelect = document.getElementById('abuse_type');
    const descriptionTextarea = document.getElementById('description');
    const errorDiv = document.getElementById('error-message');
    const successDiv = document.getElementById('success-message');
    const submitBtn = document.getElementById('submit-btn');
    const modal = document.getElementById('confirmation-modal');
    const modalPhoneSpan = document.getElementById('modal-phone');
    const userGreeting = document.getElementById('user-greeting');

    // Variables de sesión
    let currentUser = null;
    let userProfile = null;

    // 1. Obtener usuario actual y su perfil
    try {
        const { data: { user } } = await window.supabase.auth.getUser();
        if (user) {
            currentUser = user;
            // Obtener perfil desde tabla profiles
            const { data: profile, error } = await window.supabase
                .from('profiles')
                .select('full_name, user_name, phone')
                .eq('id', user.id)
                .single();
            if (!error && profile) {
                userProfile = profile;
                // Pre-llenar campos si no está en modo incógnito
                nameInput.value = profile.full_name || '';
                if (profile.phone) phoneInput.value = profile.phone;
                // Mostrar mensaje de bienvenida
                userGreeting.textContent = `✨ Hola ${profile.full_name || profile.user_name}, tus datos se han cargado automáticamente.`;
                userGreeting.classList.remove('hidden');
            } else {
                // Si no tiene perfil, al menos rellenar email desde auth
                emailInput.value = user.email || '';
            }
        }
    } catch (err) {
        console.warn('No se pudo cargar sesión:', err);
    }

    // 2. Función para validar teléfono venezolano (flexible)
    function isValidVenezuelaPhone(phone) {
        // Eliminar espacios, guiones, paréntesis
        const clean = phone.replace(/[\s\-\(\)]/g, '');
        // Acepta: 04121234567, +584124123456, 0412-1234567, 584124123456
        const regex = /^(?:(?:\(?0?4(?:1[246]|2[46]|4[046]|6[046]|2[346]))?\)?[\s\-]?\d{7}|(?:\+?58)?4(?:1[246]|2[46]|4[046]|6[046]|2[346])\d{7})$/;
        return regex.test(clean);
    }

    // 3. Actualizar UI según modo incógnito
    function updateIncognitoMode() {
        const isIncognito = incognitoCheck.checked;
        if (isIncognito) {
            fullPersonalInfo.style.display = 'none';
            phoneInput.required = true;
            phoneRequiredIndicator.classList.remove('hidden');
            // Limpiar campos ocultos (para que no se envíen)
            nameInput.value = '';
            idInput.value = '';
            emailInput.value = '';
        } else {
            fullPersonalInfo.style.display = 'block';
            phoneInput.required = false;
            phoneRequiredIndicator.classList.add('hidden');
            // Restaurar datos del perfil si existen
            if (userProfile) {
                nameInput.value = userProfile.full_name || '';
                if (userProfile.phone && !phoneInput.value) phoneInput.value = userProfile.phone;
            }
            if (currentUser?.email && !emailInput.value) emailInput.value = currentUser.email;
        }
    }

    incognitoCheck.addEventListener('change', updateIncognitoMode);
    updateIncognitoMode();

    // 4. Envío del formulario
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Limpiar mensajes previos
        errorDiv.classList.add('hidden');
        successDiv.classList.add('hidden');

        const incognito = incognitoCheck.checked;
        const phone = phoneInput.value.trim();
        const abuseType = abuseSelect.value;
        const description = descriptionTextarea.value.trim();

        // Validaciones
        if (!abuseType) {
            errorDiv.textContent = 'Por favor selecciona el tipo de violencia.';
            errorDiv.classList.remove('hidden');
            abuseSelect.focus();
            return;
        }

        if (!phone) {
            errorDiv.textContent = 'El número de teléfono es obligatorio.';
            errorDiv.classList.remove('hidden');
            phoneInput.focus();
            return;
        }

        if (!isValidVenezuelaPhone(phone)) {
            errorDiv.textContent = 'Ingresa un número de teléfono venezolano válido (ej: 0412-1234567 o +584124123456).';
            errorDiv.classList.remove('hidden');
            phoneInput.focus();
            return;
        }

        let full_name = null, id_number = null, email = null;
        if (!incognito) {
            full_name = nameInput.value.trim();
            id_number = idInput.value.trim();
            email = emailInput.value.trim();

            if (!full_name) {
                errorDiv.textContent = 'El nombre completo es obligatorio.';
                errorDiv.classList.remove('hidden');
                nameInput.focus();
                return;
            }
            if (email && !/^\S+@\S+\.\S+$/.test(email)) {
                errorDiv.textContent = 'Ingresa un correo electrónico válido.';
                errorDiv.classList.remove('hidden');
                emailInput.focus();
                return;
            }
        }

        // Deshabilitar botón
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Enviando...';

        try {
            const { data: { user } } = await window.supabase.auth.getUser();
            const user_id = user ? user.id : null;

            const { error } = await window.supabase
                .from('reports')
                .insert([{
                    user_id: user_id,
                    full_name: full_name,
                    id_number: id_number,
                    phone: phone,
                    email: email,
                    abuse_type: abuseType,
                    description: description || null,
                    is_anonymous: incognito
                }]);

            if (error) throw error;

            // Mostrar modal con el teléfono
            modalPhoneSpan.textContent = phone;
            modal.classList.remove('hidden');

            // Limpiar formulario
            form.reset();
            updateIncognitoMode(); // Restaurar vista

            // Cerrar modal al hacer clic
            document.getElementById('close-modal').onclick = () => {
                modal.classList.add('hidden');
                // Opcional: redirigir o recargar
            };

        } catch (error) {
            console.error('Error al enviar:', error);
            errorDiv.textContent = 'Ocurrió un error al enviar el reporte. Por favor intenta de nuevo.';
            errorDiv.classList.remove('hidden');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-paper-plane mr-2"></i> Enviar reporte';
        }
    });
});