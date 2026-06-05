// form.js – Lógica de envío del formulario de asesoría (tablas en español)
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('report-form');
    const incognitoCheck = document.getElementById('incognito');
    const phoneInput = document.getElementById('phone');
    const nameInput = document.getElementById('name');
    const idInput = document.getElementById('id-number');
    const emailInput = document.getElementById('email');
    const parroquiaSelect = document.getElementById('parroquia');
    const descriptionTextarea = document.getElementById('description');
    const errorDiv = document.getElementById('error-message');
    const successDiv = document.getElementById('success-message');
    const submitBtn = document.getElementById('submit-btn');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorDiv.classList.add('hidden');
        successDiv.classList.add('hidden');

        const incognito = incognitoCheck.checked;
        const phone = phoneInput.value.trim();
        const description = descriptionTextarea.value.trim();

        if (!phone) {
            errorDiv.textContent = 'El número de teléfono es obligatorio.';
            errorDiv.classList.remove('hidden');
            phoneInput.focus();
            return;
        }
        const phoneRegex = /^[0-9+\-\s]{7,15}$/;
        if (!phoneRegex.test(phone)) {
            errorDiv.textContent = 'Ingresa un número de teléfono válido (ej: 0412-1234567).';
            errorDiv.classList.remove('hidden');
            phoneInput.focus();
            return;
        }

        let full_name = null, id_number = null, email = null, parroquia = null;

        if (!incognito) {
            full_name = nameInput.value.trim();
            id_number = idInput.value.trim();
            email = emailInput.value.trim();
            parroquia = parroquiaSelect.value;

            if (!full_name) {
                errorDiv.textContent = 'El nombre completo es obligatorio.';
                errorDiv.classList.remove('hidden');
                nameInput.focus();
                return;
            }
            if (!parroquia) {
                errorDiv.textContent = 'Selecciona tu parroquia.';
                errorDiv.classList.remove('hidden');
                parroquiaSelect.focus();
                return;
            }
            if (email && !/^\S+@\S+\.\S+$/.test(email)) {
                errorDiv.textContent = 'Ingresa un correo electrónico válido.';
                errorDiv.classList.remove('hidden');
                emailInput.focus();
                return;
            }
        } else {
            parroquia = null;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Enviando solicitud...';

        try {
            const { data: { user } } = await window.supabase.auth.getUser();
            const usuario_id = user ? user.id : null;

            const { error } = await window.supabase
                .from('solicitudes')
                .insert([{
                    usuario_id,
                    nombre_completo: full_name,
                    cedula: id_number,
                    telefono: phone,
                    correo: email,
                    parroquia,
                    descripcion: description || null,
                    es_anonimo: incognito,
                    estado: 'pendiente'
                }]);

            if (error) throw error;

            successDiv.innerHTML = '<i class="fas fa-check-circle mr-2"></i> Tu solicitud ha sido enviada con éxito. Pronto nos pondremos en contacto contigo.';
            successDiv.classList.remove('hidden');
            form.reset();
            document.getElementById('full-personal-info').style.display = 'block';
            phoneInput.required = true;
            document.getElementById('phone-required-indicator')?.classList.add('hidden');

            // Scroll suave al mensaje
            successDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (error) {
            console.error(error);
            let mensaje = 'Ocurrió un error al enviar tu solicitud.';
            if (error.message?.includes('duplicate')) {
                mensaje = 'Ya existe una solicitud con estos datos.';
            } else if (error.message?.includes('network')) {
                mensaje = 'Error de conexión. Verifica tu internet e intenta de nuevo.';
            } else if (error.message) {
                mensaje = error.message;
            }
            errorDiv.textContent = mensaje;
            errorDiv.classList.remove('hidden');
            errorDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-paper-plane mr-2"></i> Solicitar asesoría';
        }
    });
});
