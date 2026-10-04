// shared/navegacion.js — navegación entre secciones de la cáscara.
// Extraído de app.js (Fase 2) sin cambiar comportamiento; importaciones explícitas entre módulos.

function configurarNavegacion() {
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href').substring(1);
            // Actualizar navegación activa
            navLinks.forEach(l => {
                l.classList.remove('active');
                l.removeAttribute('aria-current');
            });
            this.classList.add('active');
            this.setAttribute('aria-current', 'page');
            // Mostrar sección correspondiente
            document.querySelectorAll('.section').forEach(section => {
                section.classList.remove('active');
            });
            document.getElementById(targetId).classList.add('active');
        });
    });
}

export { configurarNavegacion };
