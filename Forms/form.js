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

    // ===== MENSAJES, SESIÓN Y SOLICITUDES SIN CONEXIÓN =====
    // Los mensajes se arman con textContent: lo que llega del servidor nunca se interpreta como HTML.
    function pintarMensaje(caja, claseIcono, texto) {
        caja.textContent = '';
        const icono = document.createElement('i');
        icono.className = 'fas ' + claseIcono + ' mr-2';
        icono.setAttribute('aria-hidden', 'true');
        caja.appendChild(icono);
        caja.appendChild(document.createTextNode(' ' + texto));
        caja.classList.remove('hidden');
    }
    const mostrarExito = (claseIcono, texto) => pintarMensaje(successDiv, claseIcono, texto);
    const mostrarError = (texto) => pintarMensaje(errorDiv, 'fa-exclamation-circle', texto);

    function textoDeError(error) {
        if (error && error.paraLaUsuaria) return error.paraLaUsuaria;
        const m = String((error && error.message) || '');
        if (/duplicate/i.test(m)) return 'Ya existe una solicitud con estos datos.';
        if (/row-level security|permission denied/i.test(m)) return 'No pudimos registrar tu solicitud en este momento. Escríbenos por WhatsApp al 0424-6540241.';
        return 'Ocurrió un error al enviar tu solicitud. Inténtalo de nuevo en unos minutos.';
    }

    // Fallos que se arreglan solos con el tiempo: sin red, servidor ocupado o caído
    function esFalloPasajero(error, status) {
        const deRed = window.OfflineCore ? window.OfflineCore.esErrorDeRed(error) : /failed to fetch|networkerror|load failed/i.test(String((error && error.message) || ''));
        return deRed || status >= 500 || status === 408 || status === 429;
    }

    // Marca única de cada solicitud: si un envío llega al servidor pero la respuesta se pierde, el reenvío desde la cola
    // lleva la misma marca y la base lo ignora en vez de crear una segunda solicitud (supabase-sql/add_client_id_solicitudes.sql)
    function nuevoClientId() {
        const c = window.crypto;
        if (c && c.randomUUID) return c.randomUUID();
        if (c && c.getRandomValues) {
            const b = c.getRandomValues(new Uint8Array(16));
            b[6] = (b[6] & 0x0f) | 0x40;
            b[8] = (b[8] & 0x3f) | 0x80;
            const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
            return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20)].join('-');
        }
        return null;
    }

    // window.supabase es la biblioteca hasta que Login_supabase.js crea el cliente; sin la configuración no hay cliente
    const clienteListo = () => !!(window.supabase && typeof window.supabase.from === 'function');

    // Con conexión se valida la sesión en el servidor; sin ella basta con la sesión guardada en el dispositivo
    async function usuarioActual() {
        if (!clienteListo()) return null;
        try {
            if (navigator.onLine) {
                // Si la consulta falla (sin red de verdad) viene con `error`, no lanza: entonces se usa la sesión guardada
                const { data, error } = await window.supabase.auth.getUser();
                if (!error) return data && data.user ? data.user.id : null;
            }
        } catch (e) { /* se prueba con la sesión local */ }
        try {
            const { data: { session } } = await window.supabase.auth.getSession();
            return session && session.user ? session.user.id : null;
        } catch (e) {
            return null;
        }
    }

    async function guardarParaDespues(datos) {
        const sinCola = () => Object.assign(new Error('Sin cola de solicitudes'), { paraLaUsuaria: 'No hay conexión y no pudimos guardar tu solicitud en este dispositivo. Inténtalo de nuevo cuando vuelva la conexión.' });
        if (!window.OfflineDB) throw sinCola();
        let r;
        try { r = await window.OfflineDB.encolarSolicitud(datos); } catch (e) { throw sinCola(); }
        if (!r.ok) throw Object.assign(new Error(r.error), { paraLaUsuaria: r.error });
        let conSincronizacion = false;
        if (window.OfflineUI) {
            conSincronizacion = await window.OfflineUI.registrarSincronizacion();
            window.OfflineUI.actualizarEstado();
        }
        return { conSincronizacion };
    }

    // Con conexión pero antes de que Supabase termine de iniciar: se espera un momento (el envío guardado no depende del cliente)
    async function esperarCliente() {
        if (clienteListo() || !window.supabaseReady) return;
        try { await Promise.race([window.supabaseReady, new Promise((r) => setTimeout(r, 4000))]); } catch (e) { /* se guarda y se envía por la cola */ }
    }

    // ===== VALIDACIÓN EN TIEMPO REAL =====
    const validators = {
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
            const datos = {
                usuario_id: await usuarioActual(),
                client_id: nuevoClientId(),
                nombre_completo: full_name,
                cedula: id_number,
                telefono: phone,
                correo: email,
                parroquia,
                descripcion: description || null,
                es_anonimo: incognito,
                estado: 'pendiente'
            };

            // Sin conexión (o con el servidor caído) la solicitud se guarda en este dispositivo y se envía sola al volver la red
            let resultado = 'enviada';
            let enviarYa = false; // hay conexión pero el cliente de Supabase no terminó de iniciar: se guarda y se envía por la cola
            if (!navigator.onLine) {
                resultado = 'guardada';
            } else {
                await esperarCliente();
                if (!clienteListo()) {
                    resultado = 'guardada';
                    enviarYa = true;
                } else {
                    const { error, status } = await window.supabase.from('solicitudes').insert([datos]);
                    // Un 23505 sobre client_id significa que esta misma solicitud ya llegó: no hay nada que reintentar
                    const yaRecibida = error && error.code === '23505' && /client_id/.test(String(error.message || '') + String(error.details || ''));
                    if (error && !yaRecibida) {
                        if (esFalloPasajero(error, status)) resultado = 'guardada';
                        else throw error;
                    }
                }
            }
            let conSincronizacion = false;
            if (resultado === 'guardada') {
                ({ conSincronizacion } = await guardarParaDespues(datos));
                if (enviarYa && window.OfflineUI) {
                    const r = await window.OfflineUI.enviarAhora(true);
                    if (r && r.enviadas > 0) resultado = 'enviada';
                }
            }

            if (resultado === 'guardada') {
                mostrarExito('fa-clock', 'Tu solicitud quedó guardada en este dispositivo y se enviará sola cuando vuelva la conexión.' +
                    (conSincronizacion ? '' : ' Si cierras el sitio, ábrelo de nuevo con conexión para que se envíe.') +
                    ' Se borra de aquí en cuanto se envía. Si compartes este dispositivo, puedes descartarla en el aviso de arriba.');
            } else {
                mostrarExito('fa-check-circle', 'Tu solicitud ha sido enviada con éxito. Pronto nos pondremos en contacto contigo.');
            }
            form.reset();
            document.getElementById('full-personal-info').style.display = 'block';
            [nameInput, idInput, emailInput, phoneInput].forEach(i => { i.classList.remove('border-green-400', 'border-red-400'); });

            successDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (error) {
            console.error(error);
            mostrarError(textoDeError(error));
            errorDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-paper-plane mr-2"></i> Solicitar asesoría';
        }
    });
});
