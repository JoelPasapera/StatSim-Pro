// @ts-check
// tests/navegador/acciones.mjs — lo que hace una persona en la página, para los recorridos en Chromium (entorno.mjs): ir a
// una sección, esperar el aviso que da la página, pulsar un botón que descarga, subir un archivo e imprimir en PDF con el
// motor de impresión de Chromium (el de «Imprimir → Guardar como PDF»). Cada acción falla con un mensaje que dice qué
// esperaba, para que un recorrido roto se lea sin depurar.
import fs from 'node:fs';

/**
 * Va a una sección de la página como el menú (por la dirección «#seccion») y espera a que esté activa. La portada de
 * bienvenida, que tapa la página la primera vez, se cierra.
 * @param {any} pagina
 * @param {string} seccion «simulador», «analizador», «ayuda»…
 */
export async function irA(pagina, seccion) {
    await pagina.evaluate(/** @param {string} s */ s => {
        const portada = document.getElementById('heroPortada');
        if (portada) portada.style.display = 'none';
        location.hash = '#' + s;
    }, seccion);
    await pagina.waitForFunction(/** @param {string} s */ s => {
        const el = document.getElementById(s);
        return !!el && el.classList.contains('active');
    }, seccion, { timeout: 30000 });
}

/**
 * El texto del aviso emergente (#toast) en cuanto encaja con un patrón.
 * @param {any} pagina
 * @param {RegExp} patron
 * @param {number} [ms]
 * @returns {Promise<string>}
 */
export async function esperarAviso(pagina, patron, ms = 120000) {
    try {
        await pagina.waitForFunction(/** @param {[string, string]} p */ ([fuente, banderas]) => {
            const t = document.getElementById('toast');
            return !!t && new RegExp(fuente, banderas).test(t.textContent || '');
        }, [patron.source, patron.flags], { timeout: ms });
    } catch (e) {
        const visto = await pagina.evaluate(() => (document.getElementById('toast') || {}).textContent || '');
        throw new Error(`no apareció el aviso ${patron} (el último: «${String(visto).slice(0, 200)}»)`);
    }
    return pagina.evaluate(() => /** @type {HTMLElement} */ (document.getElementById('toast')).textContent || '');
}

/**
 * Lo que descarga una acción (pulsar un botón): el nombre que propone la página y los bytes.
 * @param {any} pagina
 * @param {() => Promise<unknown>} accion
 * @param {number} [ms]
 * @returns {Promise<{ nombre: string, bytes: Buffer }>}
 */
export async function descargar(pagina, accion, ms = 120000) {
    const [descarga] = await Promise.all([pagina.waitForEvent('download', { timeout: ms }), accion()]);
    const error = await descarga.failure();
    if (error) throw new Error(`la descarga «${descarga.suggestedFilename()}» falló: ${error}`);
    return { nombre: descarga.suggestedFilename(), bytes: fs.readFileSync(await descarga.path()) };
}

/**
 * Pulsa un botón que descarga (por su selector), esperando a que esté activo.
 * @param {any} pagina
 * @param {string} selector
 * @returns {Promise<{ nombre: string, bytes: Buffer }>}
 */
export async function descargarCon(pagina, selector) {
    await pagina.waitForSelector(`${selector}:not([disabled])`, { timeout: 120000 });
    return descargar(pagina, () => pagina.click(selector));
}

/**
 * Sube un archivo a un selector de archivos de la página, como si se eligiera en el diálogo.
 * @param {any} pagina
 * @param {string} selector
 * @param {{ nombre: string, bytes: Buffer | Uint8Array | string, tipo?: string }} archivo
 */
export async function subirArchivo(pagina, selector, { nombre, bytes, tipo = 'application/octet-stream' }) {
    const buffer = typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : Buffer.from(bytes);
    await pagina.setInputFiles(selector, { name: nombre, mimeType: tipo, buffer });
}

/**
 * @typedef {{ bytes: Buffer, texto: string }} Impreso
 *   bytes: el PDF; texto: lo que dice el papel (el texto de la página con los estilos de impresión: sin lo que estos ocultan)
 */

/**
 * La página impresa en PDF por Chromium, como «Imprimir → Guardar como PDF»: los avisos beforeprint y afterprint que da el
 * navegador al imprimir y los estilos de impresión de la página (@media print), en A4 y con los fondos. (2027.01.01) Con su
 * texto impreso: dos impresiones de la misma página dan el mismo dibujo, pero no siempre los mismos bytes (el orden en
 * que Chromium escribe lo dibujado y las coordenadas de los destinos de los enlaces dependen de dónde quedaron el
 * desplazamiento y el ratón), así que de un PDF se compara su texto impreso y su número de páginas (comparar.mjs).
 * @param {any} pagina
 * @returns {Promise<Impreso>}
 */
export async function imprimirPDF(pagina) {
    await pagina.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await pagina.emulateMedia({ media: 'print' });
    try {
        const texto = await pagina.evaluate(() => document.fonts.ready.then(() => document.body.innerText));
        const bytes = await pagina.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
        return { bytes, texto };
    } finally {
        await pagina.emulateMedia({ media: 'screen' });
        await pagina.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    }
}
