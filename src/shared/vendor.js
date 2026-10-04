// shared/vendor.js — carga a demanda de los terceros de assets/vendor/ (solo cuando una acción los necesita).
// Cada carga devuelve la misma promesa si se repite; el script se inyecta una sola vez.
const promesas = new Map();

export function cargarScript(url, comprobar) {
    if (typeof comprobar === 'function' && comprobar()) return Promise.resolve(true);
    if (promesas.has(url)) return promesas.get(url);
    const p = new Promise((resolver, rechazar) => {
        const s = document.createElement('script');
        s.src = url; s.async = true;
        s.onload = () => resolver(true);
        s.onerror = () => { promesas.delete(url); rechazar(new Error('No se pudo cargar ' + url)); };
        document.head.appendChild(s);
    });
    promesas.set(url, p);
    return p;
}

// html-docx (conversión HTML → .docx) sólo cuando se exporta el capítulo a Word
export function asegurarHtmlDocx() {
    return cargarScript('assets/vendor/html-docx.min.js', () => typeof htmlDocx !== 'undefined' && !!htmlDocx.asBlob).then(() => (typeof htmlDocx !== 'undefined' ? htmlDocx : null)).catch(() => null);
}

