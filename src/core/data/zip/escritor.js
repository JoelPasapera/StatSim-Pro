// @ts-check
// core/data/zip/escritor.js — (2026.12.31) escritura de archivos ZIP (el contenedor de los .xlsx). Cada entrada llega por
// trozos (un generador de textos o de bytes: una hoja de un millón de filas no cabe en una sola cadena) y se comprime con
// el CompressionStream('deflate-raw') del navegador o de Node mientras se calcula su CRC-32; sin compresor nativo, se
// guarda sin comprimir (un ZIP válido que Excel abre igual, solo que más grande). El resultado son los trozos del archivo,
// para un Blob (o unidos, para las pruebas). Sin DOM.

import { crc32 } from './crc32.js';

/**
 * @typedef {string | Uint8Array} TrozoZip
 * @typedef {{ nombre: string, contenido: TrozoZip | Iterable<TrozoZip> | AsyncIterable<TrozoZip>, comprimir?: boolean }} EntradaNueva
 * @typedef {{ fecha?: Date, comprimir?: boolean }} OpcionesZip
 *   fecha: la de las entradas (por omisión, ahora; las pruebas la fijan); comprimir: false guarda todo sin comprimir
 */

const MAXIMO_32 = 0xFFFFFFFF;

/** ¿Hay CompressionStream con 'deflate-raw'? */
function hayCompresorNativo() {
    try { return typeof CompressionStream === 'function' && !!new CompressionStream('deflate-raw'); } catch (e) { return false; }
}

/** La fecha y la hora de MS-DOS de una fecha (resolución de 2 s; desde 1980). @param {Date} f */
function fechaDos(f) {
    const anio = Math.min(2107, Math.max(1980, f.getFullYear()));
    return {
        hora: (f.getHours() << 11) | (f.getMinutes() << 5) | Math.floor(f.getSeconds() / 2),
        dia: ((anio - 1980) << 9) | ((f.getMonth() + 1) << 5) | f.getDate()
    };
}

/** Los trozos de un contenido, como bytes. @param {EntradaNueva['contenido']} contenido @returns {AsyncGenerator<Uint8Array>} */
async function* trozos(contenido) {
    const codificador = new TextEncoder();
    if (typeof contenido === 'string') { yield codificador.encode(contenido); return; }
    if (contenido instanceof Uint8Array) { yield contenido; return; }
    for await (const t of /** @type {AsyncIterable<TrozoZip>} */ (contenido)) yield typeof t === 'string' ? codificador.encode(t) : t;
}

/**
 * Comprime (o no) una entrada: sus bytes de salida, su CRC-32 y sus tamaños.
 * @param {EntradaNueva['contenido']} contenido
 * @param {boolean} comprimir
 * @returns {Promise<{ partes: Uint8Array[], crc: number, tamano: number, comprimido: number }>}
 */
async function prepararEntrada(contenido, comprimir) {
    let crc = 0, tamano = 0, comprimido = 0;
    /** @type {Uint8Array[]} */
    const partes = [];
    if (!comprimir) {
        for await (const t of trozos(contenido)) { crc = crc32(t, crc); tamano += t.length; comprimido += t.length; partes.push(t); }
        return { partes, crc, tamano, comprimido };
    }
    const compresor = new CompressionStream('deflate-raw');
    const escritor = compresor.writable.getWriter();
    // se lee la salida a la vez que se escribe la entrada (si no, el flujo se llena y se detiene)
    const lectura = (async () => {
        const lector = compresor.readable.getReader();
        for (;;) {
            const { value, done } = await lector.read();
            if (done) break;
            partes.push(value); comprimido += value.length;
        }
    })();
    for await (const t of trozos(contenido)) {
        crc = crc32(t, crc); tamano += t.length;
        await escritor.write(/** @type {BufferSource} */ (/** @type {unknown} */ (t)));
    }
    await escritor.close();
    await lectura;
    return { partes, crc, tamano, comprimido };
}

/**
 * Un archivo ZIP con las entradas dadas, en ese orden.
 * @param {EntradaNueva[]} entradas
 * @param {OpcionesZip} [opciones]
 * @returns {Promise<Uint8Array[]>} los trozos del archivo (new Blob(trozos) es el .zip)
 */
export async function escribirZip(entradas, opciones = {}) {
    const { hora, dia } = fechaDos(opciones.fecha instanceof Date ? opciones.fecha : new Date());
    const conCompresor = opciones.comprimir !== false && hayCompresorNativo();
    const codificador = new TextEncoder();
    /** @type {Uint8Array[]} */
    const salida = [];
    /** @type {Uint8Array[]} */
    const central = [];
    let desplazamiento = 0;
    for (const e of entradas) {
        const nombre = codificador.encode(e.nombre);
        const utf8 = /[^\x20-\x7e]/.test(e.nombre) ? 0x800 : 0;
        const comprimir = conCompresor && e.comprimir !== false;
        const { partes, crc, tamano, comprimido } = await prepararEntrada(e.contenido, comprimir);
        if (tamano > MAXIMO_32 || comprimido > MAXIMO_32 || desplazamiento > MAXIMO_32) throw new Error('El archivo pasaría de 4 GB, el máximo de un ZIP sin ZIP64: genera una base más pequeña o descárgala en CSV');
        const metodo = comprimir ? 8 : 0;
        const local = new Uint8Array(30 + nombre.length);
        const v = new DataView(local.buffer);
        v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, utf8, true); v.setUint16(8, metodo, true);
        v.setUint16(10, hora, true); v.setUint16(12, dia, true); v.setUint32(14, crc, true);
        v.setUint32(18, comprimido, true); v.setUint32(22, tamano, true); v.setUint16(26, nombre.length, true); v.setUint16(28, 0, true);
        local.set(nombre, 30);
        const reg = new Uint8Array(46 + nombre.length);
        const w = new DataView(reg.buffer);
        w.setUint32(0, 0x02014b50, true); w.setUint16(4, 20, true); w.setUint16(6, 20, true); w.setUint16(8, utf8, true);
        w.setUint16(10, metodo, true); w.setUint16(12, hora, true); w.setUint16(14, dia, true); w.setUint32(16, crc, true);
        w.setUint32(20, comprimido, true); w.setUint32(24, tamano, true); w.setUint16(28, nombre.length, true);
        w.setUint32(42, desplazamiento, true);
        reg.set(nombre, 46);
        salida.push(local, ...partes);
        central.push(reg);
        desplazamiento += local.length + comprimido;
    }
    const tamanoCentral = central.reduce((s, r) => s + r.length, 0);
    if (entradas.length > 0xFFFF || desplazamiento > MAXIMO_32) throw new Error('El archivo pasaría de los límites de un ZIP sin ZIP64');
    const fin = new Uint8Array(22);
    const f = new DataView(fin.buffer);
    f.setUint32(0, 0x06054b50, true); f.setUint16(8, entradas.length, true); f.setUint16(10, entradas.length, true);
    f.setUint32(12, tamanoCentral, true); f.setUint32(16, desplazamiento, true);
    return [...salida, ...central, fin];
}

/** Une los trozos en un solo bloque (las pruebas; en la página, new Blob(trozos)). @param {Uint8Array[]} partes */
export function unirTrozos(partes) {
    const total = partes.reduce((s, p) => s + p.length, 0);
    const u = new Uint8Array(total);
    let o = 0;
    for (const p of partes) { u.set(p, o); o += p.length; }
    return u;
}
