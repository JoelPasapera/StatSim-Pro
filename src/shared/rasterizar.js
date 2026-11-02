// @ts-check
// shared/rasterizar.js — (2027.01.17) un SVG convertido en PNG (data URI) al doble de resolución, sobre blanco: Word no
// pinta un SVG dentro del HTML que convierte, pero sí un <img> con un PNG. Era ExportadorWord._rasterizar; ahora la usan
// también los informes de las tarjetas del Analizador. Sin dependencias.

/**
 * @param {string} svg el SVG serializado, con su ancho y su alto
 * @param {number} ancho en píxeles CSS
 * @param {number} alto en píxeles CSS
 * @returns {Promise<{ url: string, w: number, h: number } | null>} null ante cualquier fallo (sin navegador, sin canvas, un
 *   SVG que no se puede cargar): quien la usa omite la figura sin romper el documento
 */
export function rasterizarSVG(svg, ancho, alto) {
    return new Promise(resolve => {
        try {
            if (typeof Image === 'undefined' || typeof document === 'undefined') { resolve(null); return; }
            const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
            const img = new Image();
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = ancho * 2; canvas.height = alto * 2;
                    const c = canvas.getContext('2d');
                    if (!c) { URL.revokeObjectURL(url); resolve(null); return; }
                    c.fillStyle = '#ffffff';
                    c.fillRect(0, 0, canvas.width, canvas.height);
                    c.scale(2, 2);
                    c.drawImage(img, 0, 0, ancho, alto);
                    URL.revokeObjectURL(url);
                    resolve({ url: canvas.toDataURL('image/png'), w: ancho, h: alto });
                } catch (e) { URL.revokeObjectURL(url); resolve(null); }
            };
            img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
            img.src = url;
        } catch (e) { resolve(null); }
    });
}
