// @ts-check
// core/data/zip/inflate.js — (2026.12.31) descompresor DEFLATE (RFC 1951) propio, para los archivos .xlsx (ZIP) cuando el
// navegador no tiene DecompressionStream('deflate-raw') (core/data/zip/lector.js usa el nativo si existe). Bloques
// almacenados, con códigos fijos y con códigos dinámicos; los códigos de Huffman se decodifican con una tabla directa
// indexada por los bits siguientes del flujo (una consulta por símbolo), no bit a bit. Sin dependencias ni DOM.

/** Orden en que llegan las longitudes del código de longitudes (RFC 1951, 3.2.7). */
const ORDEN_CL = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
/** Longitudes de copia: base y bits extra de los símbolos 257…285. */
const BASE_LONGITUD = new Uint16Array([3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258]);
const EXTRA_LONGITUD = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]);
/** Distancias: base y bits extra de los símbolos 0…29. */
const BASE_DISTANCIA = new Uint16Array([1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577]);
const EXTRA_DISTANCIA = new Uint8Array([0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]);

/**
 * La tabla de decodificación de un código de Huffman canónico: indexada por los `bits` siguientes del flujo (el primero,
 * el bit menos significativo), cada entrada guarda (símbolo << 4) | longitud; 0 donde no hay código (un código incompleto,
 * permitido por la RFC para la distancia con un solo símbolo).
 * @typedef {{ tabla: Int32Array, bits: number }} TablaHuffman
 * @param {Uint8Array} longitudes la longitud del código de cada símbolo (0: el símbolo no se usa)
 * @returns {TablaHuffman}
 */
function construirTabla(longitudes) {
    let maximo = 0;
    for (let s = 0; s < longitudes.length; s++) if (longitudes[s] > maximo) maximo = longitudes[s];
    if (maximo === 0) return { tabla: new Int32Array(1), bits: 0 };
    const cuenta = new Uint16Array(16);
    for (let s = 0; s < longitudes.length; s++) cuenta[longitudes[s]]++;
    cuenta[0] = 0;
    // primer código de cada longitud (RFC 1951, 3.2.2) y comprobación de que no sobran códigos (Kraft)
    const siguiente = new Uint16Array(16);
    let codigo = 0, disponibles = 1;
    for (let l = 1; l <= 15; l++) {
        disponibles = (disponibles << 1) - cuenta[l];
        if (disponibles < 0) throw new Error('DEFLATE: un código de Huffman con más símbolos de los que caben');
        codigo = (codigo + cuenta[l - 1]) << 1;
        siguiente[l] = codigo;
    }
    const tabla = new Int32Array(1 << maximo);
    for (let s = 0; s < longitudes.length; s++) {
        const l = longitudes[s];
        if (!l) continue;
        const c = siguiente[l]++;
        // el código se lee bit a bit desde el más significativo: en la tabla va invertido
        let invertido = 0;
        for (let k = 0; k < l; k++) invertido |= ((c >>> k) & 1) << (l - 1 - k);
        const entrada = (s << 4) | l;
        for (let r = invertido; r < tabla.length; r += 1 << l) tabla[r] = entrada;
    }
    return { tabla, bits: maximo };
}

/** Las tablas de los bloques con códigos fijos (RFC 1951, 3.2.6), una sola vez. */
let FIJAS = /** @type {{ literales: TablaHuffman, distancias: TablaHuffman } | null} */ (null);
function tablasFijas() {
    if (FIJAS) return FIJAS;
    const l = new Uint8Array(288);
    l.fill(8, 0, 144); l.fill(9, 144, 256); l.fill(7, 256, 280); l.fill(8, 280, 288);
    const d = new Uint8Array(30).fill(5);
    FIJAS = { literales: construirTabla(l), distancias: construirTabla(d) };
    return FIJAS;
}

/**
 * Descomprime un flujo DEFLATE crudo (sin la cabecera de zlib ni la de gzip).
 * @param {Uint8Array} entrada
 * @param {number} [tamanoEsperado] el tamaño descomprimido si se conoce (el del directorio del ZIP): la salida se reserva
 *   de una vez y se comprueba al final
 * @returns {Uint8Array}
 */
export function inflarDeflate(entrada, tamanoEsperado) {
    const n = entrada.length;
    let pos = 0, bitbuf = 0, bitcnt = 0;
    let salida = new Uint8Array(tamanoEsperado !== undefined && tamanoEsperado >= 0 ? tamanoEsperado : Math.max(1024, n * 4));
    let fuera = 0;
    /** @param {number} minimo */
    const asegurar = minimo => {
        if (minimo <= salida.length) return;
        if (tamanoEsperado !== undefined) throw new Error('DEFLATE: los datos descomprimidos son más largos de lo que declara el archivo');
        let nuevo = salida.length * 2;
        while (nuevo < minimo) nuevo *= 2;
        const mayor = new Uint8Array(nuevo); mayor.set(salida.subarray(0, fuera)); salida = mayor;
    };
    // Lee `k` bits (k ≤ 24). Más allá del final se leen ceros: así el último símbolo puede pedir los bits de la tabla
    // aunque su código sea más corto; al final se comprueba que no se consumió nada inventado. (2026.12.31, revisión) Nunca
    // más de dos bytes inventados a la vez (los que pide una tabla de 15 bits): un tercero solo se pediría tras consumir
    // alguno, y un flujo cortado se rechaza ahí, sin seguir produciendo con ceros hasta el tamaño declarado.
    const cortado = () => new Error('DEFLATE: el flujo comprimido está cortado');
    /** @param {number} k */
    const bits = k => {
        while (bitcnt < k) { if (pos < n) bitbuf |= entrada[pos] << bitcnt; else if (pos >= n + 2) throw cortado(); pos++; bitcnt += 8; }
        const v = bitbuf & ((1 << k) - 1);
        bitbuf >>>= k; bitcnt -= k;
        return v;
    };
    /** @param {TablaHuffman} t */
    const simbolo = t => {
        while (bitcnt < t.bits) { if (pos < n) bitbuf |= entrada[pos] << bitcnt; else if (pos >= n + 2) throw cortado(); pos++; bitcnt += 8; }
        const e = t.tabla[bitbuf & ((1 << t.bits) - 1)];
        if (e === 0) throw new Error('DEFLATE: un código de Huffman que no existe');
        const l = e & 15;
        bitbuf >>>= l; bitcnt -= l;
        return e >>> 4;
    };
    let final = 0;
    do {
        final = bits(1);
        const tipo = bits(2);
        if (tipo === 0) {
            // almacenado: se descartan los bits hasta el byte siguiente; LEN y su complemento NLEN
            bitbuf = 0; pos -= bitcnt >>> 3; bitcnt = 0;
            if (pos + 4 > n) throw new Error('DEFLATE: un bloque almacenado cortado');
            const len = entrada[pos] | (entrada[pos + 1] << 8), nlen = entrada[pos + 2] | (entrada[pos + 3] << 8);
            if ((len ^ 0xFFFF) !== nlen) throw new Error('DEFLATE: la longitud de un bloque almacenado no coincide con su complemento');
            pos += 4;
            if (pos + len > n) throw new Error('DEFLATE: un bloque almacenado cortado');
            asegurar(fuera + len);
            salida.set(entrada.subarray(pos, pos + len), fuera);
            fuera += len; pos += len;
            continue;
        }
        let literales, distancias;
        if (tipo === 1) ({ literales, distancias } = tablasFijas());
        else if (tipo === 2) {
            const hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4;
            if (hlit > 286 || hdist > 30) throw new Error('DEFLATE: un bloque dinámico con demasiados códigos');
            const lcl = new Uint8Array(19);
            for (let k = 0; k < hclen; k++) lcl[ORDEN_CL[k]] = bits(3);
            const cl = construirTabla(lcl);
            const longitudes = new Uint8Array(hlit + hdist);
            for (let k = 0; k < hlit + hdist;) {
                const s = simbolo(cl);
                if (s < 16) { longitudes[k++] = s; continue; }
                let repetir, valor = 0;
                if (s === 16) { if (k === 0) throw new Error('DEFLATE: repetición sin longitud anterior'); valor = longitudes[k - 1]; repetir = 3 + bits(2); }
                else if (s === 17) repetir = 3 + bits(3);
                else repetir = 11 + bits(7);
                if (k + repetir > hlit + hdist) throw new Error('DEFLATE: demasiadas longitudes de código');
                longitudes.fill(valor, k, k + repetir); k += repetir;
            }
            if (longitudes[256] === 0) throw new Error('DEFLATE: un bloque sin el símbolo de fin');
            literales = construirTabla(longitudes.subarray(0, hlit));
            distancias = construirTabla(longitudes.subarray(hlit));
        } else throw new Error('DEFLATE: un tipo de bloque reservado (3)');
        // los símbolos del bloque. (El bucle caliente, con el estado de lectura en variables locales: con las funciones de
        // arriba, que lo comparten por cierre, iba a la tercera parte de velocidad.)
        const tL = literales.tabla, bL = literales.bits, mL = (1 << bL) - 1;
        const tD = distancias.tabla, bD = distancias.bits, mD = (1 << bD) - 1;
        let b = bitbuf, c = bitcnt, p = pos, o = fuera, sal = salida;
        for (;;) {
            while (c < bL) { if (p < n) b |= entrada[p] << c; else if (p >= n + 2) throw cortado(); p++; c += 8; }
            let e = tL[b & mL];
            if (e === 0) throw new Error('DEFLATE: un código de Huffman que no existe');
            let l = e & 15; b >>>= l; c -= l;
            const s = e >>> 4;
            if (s < 256) {
                if (o >= sal.length) { fuera = o; asegurar(o + 1); sal = salida; }
                sal[o++] = s;
                continue;
            }
            if (s === 256) break;
            const iL = s - 257;
            if (iL >= 29) throw new Error('DEFLATE: un símbolo de longitud inválido');
            let largo = BASE_LONGITUD[iL];
            const xl = EXTRA_LONGITUD[iL];
            if (xl) { while (c < xl) { if (p < n) b |= entrada[p] << c; else if (p >= n + 2) throw cortado(); p++; c += 8; } largo += b & ((1 << xl) - 1); b >>>= xl; c -= xl; }
            if (!bD) throw new Error('DEFLATE: una copia en un bloque sin distancias');
            while (c < bD) { if (p < n) b |= entrada[p] << c; else if (p >= n + 2) throw cortado(); p++; c += 8; }
            e = tD[b & mD];
            if (e === 0) throw new Error('DEFLATE: un código de Huffman que no existe');
            l = e & 15; b >>>= l; c -= l;
            const iD = e >>> 4;
            if (iD >= 30) throw new Error('DEFLATE: un símbolo de distancia inválido');
            let distancia = BASE_DISTANCIA[iD];
            const xd = EXTRA_DISTANCIA[iD];
            if (xd) { while (c < xd) { if (p < n) b |= entrada[p] << c; else if (p >= n + 2) throw cortado(); p++; c += 8; } distancia += b & ((1 << xd) - 1); b >>>= xd; c -= xd; }
            if (distancia > o) throw new Error('DEFLATE: una distancia que apunta antes del principio');
            if (o + largo > sal.length) { fuera = o; asegurar(o + largo); sal = salida; }
            let desde = o - distancia;
            // la copia puede solaparse con lo que escribe (distancia < largo): byte a byte
            for (const fin = o + largo; o < fin;) sal[o++] = sal[desde++];
        }
        bitbuf = b; bitcnt = c; pos = p; fuera = o;
    } while (!final);
    // los bits que se consumieron no pueden pasar del final real del flujo
    if (pos - (bitcnt >>> 3) > n) throw cortado();
    if (tamanoEsperado !== undefined && fuera !== tamanoEsperado) throw new Error(`DEFLATE: se esperaban ${tamanoEsperado} bytes y salieron ${fuera}`);
    return fuera === salida.length ? salida : salida.slice(0, fuera);
}
