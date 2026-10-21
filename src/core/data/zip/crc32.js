// @ts-check
// core/data/zip/crc32.js — (2026.12.31) el CRC-32 de ZIP, gzip y PNG (polinomio reflejado 0xEDB88320, ISO 3309), por
// tablas de 8 bytes a la vez («slicing-by-8»: ocho tablas de 256 entradas, una consulta por byte sin dependencia entre
// los ocho). Incremental: crc32(b, crc32(a)) es el CRC de a seguido de b. Sin dependencias ni DOM.

/** Las ocho tablas, en un solo bloque: T[k·256 + b]. */
const T = (() => {
    const t = new Int32Array(8 * 256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c;
    }
    for (let n = 0; n < 256; n++) {
        let c = t[n];
        for (let k = 1; k < 8; k++) { c = t[c & 0xFF] ^ (c >>> 8); t[k * 256 + n] = c; }
    }
    return t;
})();

/**
 * El CRC-32 de `datos` (continuando `previo`, el CRC de lo anterior; 0 para empezar).
 * @param {Uint8Array} datos
 * @param {number} [previo]
 * @returns {number} sin signo (0 … 2³² − 1)
 */
export function crc32(datos, previo = 0) {
    let c = ~previo;
    const n = datos.length;
    let i = 0;
    for (const fin8 = n - (n & 7); i < fin8; i += 8) {
        c ^= datos[i] | (datos[i + 1] << 8) | (datos[i + 2] << 16) | (datos[i + 3] << 24);
        c = T[1792 + (c & 0xFF)] ^ T[1536 + ((c >>> 8) & 0xFF)] ^ T[1280 + ((c >>> 16) & 0xFF)] ^ T[1024 + (c >>> 24)]
            ^ T[768 + datos[i + 4]] ^ T[512 + datos[i + 5]] ^ T[256 + datos[i + 6]] ^ T[datos[i + 7]];
    }
    for (; i < n; i++) c = T[(c ^ datos[i]) & 0xFF] ^ (c >>> 8);
    return ~c >>> 0;
}
