// @ts-check
// core/data/zip/nativo.js — (2026.12.31, revisión) la descompresión con el DecompressionStream del entorno (el navegador o
// Node), con un límite: se detiene en cuanto la salida pasa del tamaño que declara el archivo, sin reservar más. La usan el
// lector de ZIP (core/data/zip/lector.js, DEFLATE crudo) y el de .zsav (core/data/sav/lector.js, zlib). Y la proporción
// máxima de DEFLATE, con la que los dos rechazan un tamaño declarado imposible antes de descomprimir nada. Sin DOM.

/** Lo más que DEFLATE puede dar por byte comprimido: 258 bytes cada 2 bits (las cabeceras, aparte: el margen de 1024). */
export const PROPORCION_MAXIMA = 1032;

/**
 * ¿Puede este tamaño declarado salir de tantos bytes comprimidos con DEFLATE (o zlib, que lo envuelve)?
 * @param {number} declarado @param {number} comprimido
 */
export const tamanoPosible = (declarado, comprimido) => declarado >= 0 && declarado <= comprimido * PROPORCION_MAXIMA + 1024;

/** El mensaje con que inflarNativo se detiene al pasar del límite. */
export const DEMASIADO_LARGA = 'más larga de lo que declara';

/** @type {Map<string, boolean>} */
const hay = new Map();

/**
 * ¿Hay DecompressionStream con este formato? (se averigua una vez por formato)
 * @param {'deflate-raw' | 'deflate'} formato
 */
export function hayDescompresorNativo(formato) {
    if (!hay.has(formato)) {
        let si = false;
        try { si = typeof DecompressionStream === 'function' && !!new DecompressionStream(formato); } catch (e) { si = false; }
        hay.set(formato, si);
    }
    return /** @type {boolean} */ (hay.get(formato));
}

/**
 * Descomprime con el DecompressionStream del entorno, escribiendo y leyendo a la vez (sin Blob ni Response: así funciona
 * también donde Blob no tiene stream()), y se detiene en cuanto la salida pasa de `limite` (con el error DEMASIADO_LARGA).
 * Los demás errores son los del navegador, en inglés: quien llama los dice a su manera.
 * @param {Uint8Array} datos
 * @param {number} limite el tamaño que declara el archivo
 * @param {'deflate-raw' | 'deflate'} [formato] DEFLATE crudo (ZIP) o con la envoltura de zlib (.zsav)
 * @returns {Promise<Uint8Array>}
 */
export async function inflarNativo(datos, limite, formato = 'deflate-raw') {
    const flujo = new DecompressionStream(formato);
    const escritor = flujo.writable.getWriter();
    // sin esperar a la escritura: se espera leyendo (si no, el flujo se llena y se detiene); sus errores llegan al leer
    escritor.write(/** @type {BufferSource} */ (/** @type {unknown} */ (datos))).catch(() => {});
    escritor.close().catch(() => {});
    const lector = flujo.readable.getReader();
    /** @type {Uint8Array[]} */
    const partes = [];
    let total = 0;
    for (;;) {
        const { value, done } = await lector.read();
        if (done) break;
        total += value.length;
        if (total > limite) { lector.cancel().catch(() => {}); throw new Error(DEMASIADO_LARGA); }
        partes.push(value);
    }
    if (partes.length === 1) return /** @type {Uint8Array} */ (partes[0]);
    const salida = new Uint8Array(total);
    let o = 0;
    for (const p of partes) { salida.set(p, o); o += p.length; }
    return salida;
}
