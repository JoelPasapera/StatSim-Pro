// @ts-check
// shared/navegacion.js — navegación entre secciones de la cáscara.
// Extraído de app.js (Fase 2) sin cambiar comportamiento; importaciones explícitas entre módulos.
// (2026.12.30) Con la sección en la dirección: el menú escribe «#buscador» en la barra (y en el historial: «Atrás» vuelve a
// la sección anterior), y un enlace profundo («index.html#analizador») abre esa sección, sin la portada. Hasta la 2026.12.29
// el menú no tocaba la dirección y el enlace profundo abría la portada con el Simulador detrás.

/** @returns {HTMLAnchorElement[]} */
const enlacesDelMenu = () => /** @type {HTMLAnchorElement[]} */ ([...document.querySelectorAll('.nav-link')]);

/** El id de la sección a la que apunta un «#id» si es una sección del menú; si no, null. @param {string} hash */
function seccionDe(hash) {
    let id = '';
    // (revisión 2026.12.30) un «#100%» o «#%E1lisis» (mal codificado) hacía lanzar a decodeURIComponent, y la página
    // arrancaba sin montar el Simulador ni el Analizador: no es una sección, y ya
    try { id = decodeURIComponent(String(hash || '').replace(/^#/, '')); } catch (e) { return null; }
    if (!id) return null;
    const enMenu = enlacesDelMenu().some(l => l.getAttribute('href') === '#' + id);
    const seccion = document.getElementById(id);
    return enMenu && seccion && seccion.classList.contains('section') ? id : null;
}

/** Marca el enlace del menú y muestra la sección `id` (sin tocar la dirección). @param {string} id */
function mostrarSeccion(id) {
    enlacesDelMenu().forEach(l => {
        const es = l.getAttribute('href') === '#' + id;
        l.classList.toggle('active', es);
        if (es) l.setAttribute('aria-current', 'page'); else l.removeAttribute('aria-current');
    });
    document.querySelectorAll('.section').forEach(section => section.classList.toggle('active', section.id === id));
}

/** La sección del menú marcada en el HTML (la de arranque), para volver a ella con «Atrás» hasta la dirección sin «#». */
function seccionInicial() {
    const marcado = enlacesDelMenu().find(l => l.classList.contains('active'));
    return marcado ? seccionDe(marcado.getAttribute('href') || '') : null;
}

function configurarNavegacion() {
    const inicial = seccionInicial();
    // (revisión 2026.12.30) mientras se sigue a la dirección («Atrás», «Adelante», un enlace «#seccion»), el clic que
    // muestra la sección no escribe en el historial: con la entrada inicial (sin «#»), el clic añadía «#simulador», que
    // borraba la de «Adelante» y atrapaba al usuario en la página (cada «Atrás» volvía a añadirla)
    let siguiendoLaDireccion = false;
    enlacesDelMenu().forEach(link => {
        link.addEventListener('click', function (e) {
            e.preventDefault();
            const id = seccionDe(this.getAttribute('href') || '');
            if (!id) return;
            mostrarSeccion(id);
            // en la dirección y en el historial, salvo que ya esté (el enlace profundo, o el mismo enlace dos veces) o que
            // el clic venga de la propia dirección
            if (!siguiendoLaDireccion && location.hash !== '#' + id) {
                try { history.pushState(null, '', '#' + id); } catch (err) { /* file:// u otro origen sin historial: sin dirección */ }
            }
        });
    });
    // «Atrás» y «Adelante», y los enlaces «#seccion» de la propia página que no son del menú
    const alCambiarDireccion = () => {
        const id = seccionDe(location.hash) || (location.hash ? null : inicial);
        if (!id) return;
        const enlace = enlacesDelMenu().find(l => l.getAttribute('href') === '#' + id);
        // el clic del enlace también oculta la portada (su propio oyente, en index.html)
        if (!enlace) { mostrarSeccion(id); return; }
        siguiendoLaDireccion = true;
        try { enlace.click(); } finally { siguiendoLaDireccion = false; }
    };
    window.addEventListener('popstate', alCambiarDireccion);
    window.addEventListener('hashchange', alCambiarDireccion);
    // el enlace profundo
    if (seccionDe(location.hash)) alCambiarDireccion();
}

export { configurarNavegacion, mostrarSeccion, seccionDe };
