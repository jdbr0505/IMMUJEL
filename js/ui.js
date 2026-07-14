// UI compartida IMMUJEL: menú móvil, dropdown Servicios, tema oscuro y scroll-to-top
(function() {
    // ---------- MENÚ MÓVIL ----------
    const menuBtn = document.getElementById('menu-btn');
    const menu = document.getElementById('menu');
    if (menuBtn && menu) {
        menuBtn.addEventListener('click', () => menu.classList.toggle('hidden'));
    }

    // ---------- DROPDOWN SERVICIOS ----------
    const serviciosBtn = document.getElementById('servicios-btn');
    const serviciosDropdown = document.getElementById('servicios-dropdown');
    const serviciosArrow = document.getElementById('servicios-arrow');

    if (serviciosBtn && serviciosDropdown) {
        function abrirDropdown() {
            serviciosDropdown.classList.remove('opacity-0', 'scale-95', 'pointer-events-none');
            serviciosDropdown.classList.add('opacity-100', 'scale-100', 'pointer-events-auto');
            serviciosBtn.setAttribute('aria-expanded', 'true');
            if (serviciosArrow) serviciosArrow.classList.add('rotate-180');
        }

        function cerrarDropdown() {
            serviciosDropdown.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
            serviciosDropdown.classList.remove('opacity-100', 'scale-100', 'pointer-events-auto');
            serviciosBtn.setAttribute('aria-expanded', 'false');
            if (serviciosArrow) serviciosArrow.classList.remove('rotate-180');
        }

        serviciosBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const isOpen = serviciosBtn.getAttribute('aria-expanded') === 'true';
            if (isOpen) cerrarDropdown();
            else abrirDropdown();
        });

        // Cierra al hacer clic fuera del dropdown
        document.addEventListener('click', (e) => {
            if (!serviciosBtn.contains(e.target) && !serviciosDropdown.contains(e.target)) {
                cerrarDropdown();
            }
        });

        // Cierra con la tecla Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && serviciosBtn.getAttribute('aria-expanded') === 'true') {
                cerrarDropdown();
                serviciosBtn.focus();
            }
        });
    }

    // ---------- TEMA OSCURO ----------
    const body = document.body;
    const themeToggle = document.getElementById('theme-toggle');
    body.classList.remove('dark-theme');
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') body.classList.add('dark-theme');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            body.classList.toggle('dark-theme');
            localStorage.setItem('theme', body.classList.contains('dark-theme') ? 'dark' : 'light');
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
