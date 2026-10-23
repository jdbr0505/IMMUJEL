// UI compartida IMMUJEL: menú móvil, dropdown Servicios, tema oscuro y scroll-to-top
(function() {
    // ---------- MENÚ MÓVIL ----------
    const menuBtn = document.getElementById('menu-btn');
    const menu = document.getElementById('menu');
    const esEscritorio = window.matchMedia('(min-width: 1024px)');

    function ponerMenu(abierto) {
        menu.classList.toggle('is-open', abierto);
        menuBtn.setAttribute('aria-expanded', String(abierto));
        menuBtn.setAttribute('aria-label', abierto ? 'Cerrar menú' : 'Abrir menú');
    }

    if (menuBtn && menu) {
        menuBtn.addEventListener('click', () => ponerMenu(!menu.classList.contains('is-open')));
    }

    // ---------- DROPDOWN SERVICIOS ----------
    const serviciosBtn = document.getElementById('servicios-btn');
    const serviciosDropdown = document.getElementById('servicios-dropdown');
    const serviciosItem = serviciosBtn && serviciosBtn.closest('.nav-dropdown');

    function ponerDropdown(abierto) {
        serviciosItem.classList.toggle('is-open', abierto);
        serviciosBtn.setAttribute('aria-expanded', String(abierto));
    }

    if (serviciosBtn && serviciosDropdown && serviciosItem) {
        serviciosBtn.addEventListener('click', (e) => {
            e.preventDefault();
            ponerDropdown(serviciosBtn.getAttribute('aria-expanded') !== 'true');
        });

        // Cierra al hacer clic fuera del dropdown
        document.addEventListener('click', (e) => {
            if (!serviciosItem.contains(e.target)) ponerDropdown(false);
        });
    }

    // Al cruzar el ancho de escritorio todo queda cerrado: el panel móvil deja de existir y el dropdown cambia de forma (acordeón / flotante)
    esEscritorio.addEventListener('change', () => {
        if (menu && menuBtn) ponerMenu(false);
        if (serviciosItem) ponerDropdown(false);
    });

    // Escape cierra primero el dropdown de Servicios y, si no hay uno abierto, el menú móvil
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (serviciosItem && serviciosBtn.getAttribute('aria-expanded') === 'true') {
            ponerDropdown(false);
            serviciosBtn.focus();
        } else if (menu && menu.classList.contains('is-open') && !esEscritorio.matches) {
            ponerMenu(false);
            menuBtn.focus();
        }
    });

    // ---------- TEMA OSCURO ----------
    const body = document.body;
    const themeToggle = document.getElementById('theme-toggle');
    body.classList.remove('dark-theme');
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') body.classList.add('dark-theme');
    if (themeToggle) {
        const reflejarTema = () => themeToggle.setAttribute('aria-pressed', String(body.classList.contains('dark-theme')));
        reflejarTema();
        themeToggle.addEventListener('click', () => {
            body.classList.toggle('dark-theme');
            localStorage.setItem('theme', body.classList.contains('dark-theme') ? 'dark' : 'light');
            reflejarTema();
        });
    }

    // ---------- SCROLL TO TOP ----------
    const scrollBtn = document.getElementById('scrollToTop');
    if (scrollBtn) {
        let ticking = false;
        window.addEventListener('scroll', () => {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    scrollBtn.classList.toggle('visible', window.scrollY > 300);
                    ticking = false;
                });
                ticking = true;
            }
        });
        scrollBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

})();
