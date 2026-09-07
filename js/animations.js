// ===== SCROLL REVEAL ANIMATIONS =====
(function() {
    'use strict';
    
    function isInViewport(el, offset) {
        if (!offset) offset = 80;
        var rect = el.getBoundingClientRect();
        var viewHeight = window.innerHeight || document.documentElement.clientHeight;
        return rect.top <= viewHeight - offset;
    }
    
    var revealElements = document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale');
    
    if ('IntersectionObserver' in window) {
        var observer = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('revealed');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.15, rootMargin: '0px 0px -50px 0px' });
        
        revealElements.forEach(function(el) { observer.observe(el); });
    } else {
        // Fallback for older browsers
        function checkVisibility() {
            revealElements.forEach(function(el) {
                if (!el.classList.contains('revealed') && isInViewport(el)) {
                    el.classList.add('revealed');
                }
            });
        }
        window.addEventListener('scroll', checkVisibility);
        window.addEventListener('resize', checkVisibility);
        checkVisibility();
    }
})();
