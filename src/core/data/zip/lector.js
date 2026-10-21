// @ts-check
// core/data/zip/lector.js — (2026.12.31) lectura de archivos ZIP (el contenedor de los .xlsx): el directorio central (con
// sus extensiones ZIP64), las entradas almacenadas y las comprimidas con DEFLATE, y la comprobación del CRC-32 de cada una.
// Descomprime con DecompressionStream('deflate-raw') del navegador (o de Node) si existe y, si no, con el descompresor
// propio (core/data/zip/inflate.js). Sin DOM: funciona en la página, en un Worker y en Node.
// (2026.12.31, revisión) Contra los archivos hechos para agotar la memoria: dos entradas no pueden compartir sus datos, una
// entrada no puede declarar más de lo que DEFLATE puede dar de sus bytes (unas 1032 veces) y la descompresión se detiene
// en lo que declara. El tope de lo que se declara lo ponen quienes leen (el libro de Excel, el proyecto), antes de extraer.

import { crc32 } from './crc32.js';
import { inflarDeflate } from './inflate.js';
import { DEMASIADO_LARGA, hayDescompresorNativo, inflarNativo, tamanoPosible } from './nativo.js';

/**
 * @typedef {{
 *   nombre: string, metodo: number, banderas: number, crc: number,
 *   comprimido: number, tamano: number, cabeceraLocal: number
 * }} EntradaZip
 *   metodo: 0 almacenada, 8 DEFLATE; comprimido y tamano, en bytes; cabeceraLocal: dónde empieza su cabecera local
 */

const FIRMA_FIN = 0x06054b50, FIRMA_FIN64 = 0x06064b50, FIRMA_LOCALIZADOR64 = 0x07064b50;
const FIRMA_CENTRAL = 0x02014b50, FIRMA_LOCAL = 0x04034b50;

/** @param {Uint8Array} b @param {number} i */
const u16 = (b, i) => b[i] | (b[i + 1] << 8);
/** @param {Uint8Array} b @param {number} i */
const u32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
/** Un entero de 64 bits que cabe en un número de JavaScript (los tamaños de un ZIP real). @param {Uint8Array} b @param {number} i */
const u64 = (b, i) => {
    const alto = u32(b, i + 4);
    if (alto >= 0x200000) throw new Error('ZIP: un tamaño de más de 2⁵³ bytes');
    return alto * 0x100000000 + u32(b, i);
};

/** ¿Empieza aquí un ZIP? (la firma de una cabecera local o, en un ZIP vacío, la del final) @param {Uint8Array} bytes */
export function esZip(bytes) {
    return bytes.length >= 4 && (u32(bytes, 0) === FIRMA_LOCAL || u32(bytes, 0) === FIRMA_FIN);
}

/**
 * Las entradas del ZIP, según su directorio central (el que manda: las cabeceras locales pueden llevar los tamaños a
 * cero si se escribieron con descriptor de datos).
 * @param {Uint8Array} bytes
 * @returns {EntradaZip[]}
 */
export function listarZip(bytes) {
    const n = bytes.length;
    // el registro del final: 22 bytes, más un comentario de hasta 65 535
    let fin = -1;
    for (let i = n - 22; i >= Math.max(0, n - 22 - 0xFFFF); i--) {
        if (bytes[i] === 0x50 && u32(bytes, i) === FIRMA_FIN && i + 22 + u16(bytes, i + 20) <= n) { fin = i; break; }
    }
    if (fin < 0) throw new Error('ZIP: le falta el directorio central del ZIP');
    let total = u16(bytes, fin + 10), inicio = u32(bytes, fin + 16);
    // ZIP64: el localizador justo antes del registro del final apunta al registro de final de 64 bits
    if ((total === 0xFFFF || inicio === 0xFFFFFFFF) && fin >= 20 && u32(bytes, fin - 20) === FIRMA_LOCALIZADOR64) {
        const fin64 = u64(bytes, fin - 12);
        if (fin64 + 56 > n || u32(bytes, fin64) !== FIRMA_FIN64) throw new Error('ZIP: el registro de final de 64 bits no está donde dice su localizador');
        total = u64(bytes, fin64 + 32); inicio = u64(bytes, fin64 + 48);
    }
    /** @type {EntradaZip[]} */
    const entradas = [];
    let i = inicio;
    const decodificador = new TextDecoder('utf-8');
    for (let k = 0; k < total; k++) {
        if (i + 46 > n || u32(bytes, i) !== FIRMA_CENTRAL) throw new Error('ZIP: el directorio central está dañado');
        const banderas = u16(bytes, i + 8), metodo = u16(bytes, i + 10), crc = u32(bytes, i + 16);
        let comprimido = u32(bytes, i + 20), tamano = u32(bytes, i + 24);
        const largoNombre = u16(bytes, i + 28), largoExtra = u16(bytes, i + 30), largoComentario = u16(bytes, i + 32);
        let cabeceraLocal = u32(bytes, i + 42);
        const crudo = bytes.subarray(i + 46, i + 46 + largoNombre);
        // el nombre: UTF-8 si lo dice la bandera 11; si no, CP437, que en los nombres de un .xlsx es ASCII
        const nombre = (banderas & 0x800) ? decodificador.decode(crudo) : String.fromCharCode(...crudo);
        // el campo extra de ZIP64 (0x0001) trae, en este orden, los valores que en el registro valen 0xFFFFFFFF
        for (let e = i + 46 + largoNombre, finExtra = e + largoExtra; e + 4 <= finExtra;) {
            const id = u16(bytes, e), largo = u16(bytes, e + 2);
            if (id === 0x0001) {
                let q = e + 4;
                if (tamano === 0xFFFFFFFF) { tamano = u64(bytes, q); q += 8; }
                if (comprimido === 0xFFFFFFFF) { comprimido = u64(bytes, q); q += 8; }
                if (cabeceraLocal === 0xFFFFFFFF) { cabeceraLocal = u64(bytes, q); }
            }
            e += 4 + largo;
        }
        entradas.push({ nombre: nombre.replace(/\\/g, '/'), metodo, banderas, crc, comprimido, tamano, cabeceraLocal });
        i += 46 + largoNombre + largoExtra + largoComentario;
    }
    // dos entradas no comparten sus datos: cada una empieza después de la cabecera local (30 bytes, al menos) y los datos de
    // la anterior. Así son las «bombas» que repiten un mismo bloque comprimido en muchas entradas, cada una con su tamaño
    // honrado; ningún programa escribe un ZIP así
    const orden = entradas.map((_, k) => k).sort((a, b) => /** @type {EntradaZip} */ (entradas[a]).cabeceraLocal - /** @type {EntradaZip} */ (entradas[b]).cabeceraLocal);
    for (let k = 1; k < orden.length; k++) {
        const previa = /** @type {EntradaZip} */ (entradas[/** @type {number} */ (orden[k - 1])]), esta = /** @type {EntradaZip} */ (entradas[/** @type {number} */ (orden[k])]);
        if (esta.cabeceraLocal < previa.cabeceraLocal + 30 + previa.comprimido) throw new Error('ZIP: dos entradas comparten sus datos (el archivo está dañado o manipulado)');
    }
    return entradas;
}


/**
 * El contenido de una entrada, descomprimido y comprobado (tamaño y CRC-32).
 * @param {Uint8Array} bytes el ZIP entero
 * @param {EntradaZip} entrada
 * @param {{ nativo?: boolean }} [opciones] nativo: false obliga al descompresor propio (las pruebas)
 * @returns {Promise<Uint8Array>}
 */
export async function extraerZip(bytes, entrada, opciones = {}) {
    const h = entrada.cabeceraLocal;
    if (h + 30 > bytes.length || u32(bytes, h) !== FIRMA_LOCAL) throw new Error(`ZIP: la entrada «${entrada.nombre}» no está donde dice el directorio`);
    if (entrada.banderas & 1) throw new Error(`ZIP: la entrada «${entrada.nombre}» está cifrada`);
    const datosDesde = h + 30 + u16(bytes, h + 26) + u16(bytes, h + 28);
    if (datosDesde + entrada.comprimido > bytes.length) throw new Error(`ZIP: la entrada «${entrada.nombre}» está cortada`);
    const datos = bytes.subarray(datosDesde, datosDesde + entrada.comprimido);
    let salida;
    if (entrada.metodo === 0) salida = datos;
    else if (entrada.metodo === 8) {
        // lo que declara, imposible con esos bytes: dañada o manipulada (sin reservar la memoria que dice)
        if (!tamanoPosible(entrada.tamano, entrada.comprimido)) throw new Error(`ZIP: la entrada «${entrada.nombre}» no tiene el tamaño que declara`);
        if (opciones.nativo !== false && hayDescompresorNativo('deflate-raw')) {
            // el error del navegador llega en inglés y sin decir qué entrada
            try { salida = await inflarNativo(datos, entrada.tamano); } catch (e) {
                throw new Error(e instanceof Error && e.message === DEMASIADO_LARGA ? `ZIP: la entrada «${entrada.nombre}» no tiene el tamaño que declara` : `ZIP: la entrada «${entrada.nombre}» no se puede descomprimir`);
            }
        } else {
            try { salida = inflarDeflate(datos, entrada.tamano); } catch (e) { throw new Error(`ZIP: la entrada «${entrada.nombre}» no se puede descomprimir: ${/** @type {Error} */ (e).message.replace(/^DEFLATE: /, '')}`); }
        }
    } else throw new Error(`ZIP: la entrada «${entrada.nombre}» usa un método de compresión que no se admite (${entrada.metodo})`);
    if (salida.length !== entrada.tamano) throw new Error(`ZIP: la entrada «${entrada.nombre}» no tiene el tamaño que declara`);
    if (crc32(salida) !== entrada.crc) throw new Error(`ZIP: el CRC-32 de la entrada «${entrada.nombre}» no coincide`);
    return salida;
}
