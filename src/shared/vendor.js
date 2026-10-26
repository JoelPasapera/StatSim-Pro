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


// ExcelJS (leer y escribir .xlsx) solo cuando se exporta o importa una hoja: el Buscador, el Ranking de revistas y las
// fuentes del Redactor, todos con la copia local (2026.12.30: hasta entonces, un cargador por módulo —el del Redactor,
// desde dos CDN— y el «⬇ Excel» del Ranking sin ninguno, que avisaba «ExcelJS no está cargado» y no descargaba nada).
// Rechaza con un mensaje para el usuario si no se pudo descargar; se puede reintentar.
export function asegurarExcelJS() {
    const lista = () => typeof ExcelJS !== 'undefined';
    return cargarScript('assets/vendor/exceljs.min.js', lista).then(
        () => { if (!lista()) throw new Error('El módulo de Excel se descargó, pero no se pudo iniciar. Recarga la página e inténtalo de nuevo.'); },
        () => { throw new Error('No se pudo descargar el módulo de Excel. Revisa tu conexión e inténtalo de nuevo.'); });
}
