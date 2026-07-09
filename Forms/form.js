// form.js – Lógica de envío del formulario de asesoría + validación en tiempo real
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

    // ===== VALIDACIÓN EN TIEMPO REAL =====
      name: v => v.trim().length >= 3 || !v,
      'id-number': v => !v || /^[VEJPGvejpg]-?\d{5,10}$/.test(v.trim()),
      email: v => !v || /^\S+@\S+\.\S+$/.test(v),
      phone: v => /^[0-9+\-\s]{7,15}$/.test(v),
      parroquia: v => !v || v !== ''
    };

    const errors = {
      name: 'Mínimo 3 caracteres',
      'id-number': 'Formato: V-12345678',
      email: 'Correo inválido',
      phone: 'Teléfono inválido (ej: 0412-1234567)'
    };

    nameInput.addEventListener('input', () => validField(nameInput, 'name'));
    idInput.addEventListener('input', () => validField(idInput, 'id-number'));
    emailInput.addEventListener('input', () => validField(emailInput, 'email'));
    phoneInput.addEventListener('input', () => validField(phoneInput, 'phone'));

    function validField(input, field) {
      const container = input.closest('div');
      let fb = container.querySelector('.field-feedback');
      if (!fb) { fb = document.createElement('span'); fb.className = 'field-feedback text-xs mt-1 block'; container.appendChild(fb); }
      const ok = validators[field](input.value);
      input.classList.toggle('border-red-400', !ok && input.value);
      input.classList.toggle('border-green-400', ok && input.value);
      fb.textContent = ok || !input.value ? '' : errors[field];
      fb.style.color = '#ef4444';
    }

    incognitoCheck.addEventListener('change', () => {
      const personal = document.getElementById('full-personal-info');
      personal.style.display = incognitoCheck.checked ? 'none' : 'block';
    });

    // ===== ENVÍO =====
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorDiv.classList.add('hidden');
        successDiv.classList.add('hidden');

        const incognito = incognitoCheck.checked;
        const phone = phoneInput.value.trim();
        const description = descriptionTextarea.value.trim();

        if (!phone) {
            errorDiv.innerHTML = '<i class="fas fa-exclamation-circle mr-1"></i> El número de teléfono es obligatorio.';
            errorDiv.classList.remove('hidden');
            phoneInput.focus();
            return;
        }
        if (!/^[0-9+\-\s]{7,15}$/.test(phone)) {
            errorDiv.innerHTML = '<i class="fas fa-exclamation-circle mr-1"></i> Ingresa un número de teléfono válido (ej: 0412-1234567).';
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

            if (!full_name || full_name.length < 3) {
                errorDiv.innerHTML = '<i class="fas fa-exclamation-circle mr-1"></i> El nombre completo es obligatorio (mínimo 3 caracteres).';
                errorDiv.classList.remove('hidden');
                nameInput.focus();
                return;
            }
            if (!parroquia) {
                errorDiv.innerHTML = '<i class="fas fa-exclamation-circle mr-1"></i> Selecciona tu parroquia.';
                errorDiv.classList.remove('hidden');
                parroquiaSelect.focus();
                return;
            }
            if (email && !/^\S+@\S+\.\S+$/.test(email)) {
                errorDiv.innerHTML = '<i class="fas fa-exclamation-circle mr-1"></i> Ingresa un correo electrónico válido.';
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
            [nameInput, idInput, emailInput, phoneInput].forEach(i => { i.classList.remove('border-green-400', 'border-red-400'); });

            successDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (error) {
            console.error(error);
            let mensaje = '<i class="fas fa-exclamation-circle mr-1"></i> Ocurrió un error al enviar tu solicitud.';
            if (error.message?.includes('duplicate')) {
                mensaje = '<i class="fas fa-exclamation-circle mr-1"></i> Ya existe una solicitud con estos datos.';
            } else if (error.message?.includes('network') || error.message?.includes('fetch')) {
                mensaje = '<i class="fas fa-exclamation-circle mr-1"></i> Error de conexión. Verifica tu internet e intenta de nuevo.';
            } else if (error.message) {
                mensaje = '<i class="fas fa-exclamation-circle mr-1"></i> ' + error.message;
            }
            errorDiv.innerHTML = mensaje;
            errorDiv.classList.remove('hidden');
            errorDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-paper-plane mr-2"></i> Solicitar asesoría';
        }
    });
});
