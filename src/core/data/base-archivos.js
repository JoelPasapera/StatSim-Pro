// @ts-check
// core/data/base-archivos.js — (2026.12.31) la base del Simulador (core/data/base-columnar.js) como archivos de un
// proyecto (proyecto/), sin perder un bit: un índice JSON con n y, por columna, su nombre, si es entera, sus etiquetas de
// valor y su formato, y los valores de cada columna en binario (Float32 si es entera, Float64 si no; en little-endian, el
// orden de los bytes de casi todos los equipos, y se convierte si el equipo es big-endian). Leerlos comprueba que todo
// cuadra antes de crear la base (y, cuarta revisión, mide el índice antes de leerlo: core/data/json-acotado.js). Sin DOM.

import { BaseColumnar } from './base-columnar.js';
import { leerJsonAcotado } from './json-acotado.js';

/**
 * Lo más que trae el índice de una base: por columna, un objeto con su nombre, su tipo, su formato y sus etiquetas de valor
 * (cientos de miles de columnas, con holgura). @type {import('./json-acotado.js').TopesJson}
 */
const TOPES_JSON_INDICE = { profundidad: 6, contenedores: 1000000, elementos: 10000000 };

/** ¿Guarda este equipo los números en little-endian? */
const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

/**
 * Los bytes de un arreglo tipado en little-endian (una copia).
 * @param {Float32Array | Float64Array} arreglo
 * @returns {Uint8Array}
 */
function bytesLE(arreglo) {
    const bytes = new Uint8Array(arreglo.buffer.slice(arreglo.byteOffset, arreglo.byteOffset + arreglo.byteLength));
    if (!LITTLE_ENDIAN) invertirPorElemento(bytes, arreglo.BYTES_PER_ELEMENT);
    return bytes;
}

/** Invierte el orden de los bytes de cada elemento. @param {Uint8Array} bytes @param {number} ancho */
function invertirPorElemento(bytes, ancho) {
    for (let i = 0; i < bytes.length; i += ancho) bytes.subarray(i, i + ancho).reverse();
}

/**
 * La base como archivos: «<carpeta>.json» (el índice) y «<carpeta>/<k>.bin» (los valores de la columna k).
 * @param {BaseColumnar} base
 * @param {string} [carpeta]
 * @returns {Record<string, string | Uint8Array>}
 */
export function baseAArchivos(base, carpeta = 'base') {
    /** @type {Record<string, string | Uint8Array>} */
    const archivos = {};
    const columnas = base.columnas.map((/** @type {any} */ c, /** @type {number} */ k) => {
        const archivo = `${carpeta}/${k}.bin`;
        archivos[archivo] = bytesLE(c.datos);
        return { nombre: c.nombre, entera: !!c.entera, etiquetas: c.etiquetas || null, formato: c.formato || null, archivo };
    });
    archivos[`${carpeta}.json`] = JSON.stringify({ formato: 1, n: base.n, columnas });
    return archivos;
}

/**
 * La base que guardó baseAArchivos.
 * @param {Map<string, Uint8Array>} archivos
 * @param {string} [carpeta]
 * @param {{ maximoFilas?: number }} [topes] (2026.12.31, revisión) maximoFilas: las que admite quien la abre, comprobadas
 *   antes de leer ninguna columna
 * @returns {BaseColumnar}
 */
export function baseDesdeArchivos(archivos, carpeta = 'base', topes = {}) {
    const crudo = archivos.get(`${carpeta}.json`);
    if (!crudo) throw new Error(`falta el índice de la base («${carpeta}.json»)`);
    /** @type {any} */
    const indice = leerJsonAcotado(new TextDecoder().decode(crudo), TOPES_JSON_INDICE, { forma: `el índice de la base («${carpeta}.json») no tiene la forma esperada`, invalido: `el índice de la base («${carpeta}.json») no es JSON válido` });
    if (!indice || indice.formato !== 1 || !Number.isInteger(indice.n) || indice.n < 0 || !Array.isArray(indice.columnas)) throw new Error(`el índice de la base («${carpeta}.json») no tiene la forma esperada`);
    const n = indice.n;
    if (topes.maximoFilas !== undefined && n > topes.maximoFilas) throw new Error(`la base guardada tiene ${n.toLocaleString('es')} filas, más de las ${topes.maximoFilas.toLocaleString('es')} que admite`);
    const vistos = new Set(), archivosVistos = new Set();
    const columnas = indice.columnas.map((/** @type {any} */ c) => {
        if (!c || typeof c.nombre !== 'string' || !c.nombre || vistos.has(c.nombre)) throw new Error('la base trae una columna sin nombre o repetida');
        vistos.add(c.nombre);
        // (2026.12.31, quinta revisión) cada columna, con su archivo (como los escribe baseAArchivos): con miles de columnas
        // sobre el mismo, cada una se llevaba su copia y un proyecto de 13 KB pedía 3 GB
        const archivo = String(c.archivo);
        if (archivosVistos.has(archivo)) throw new Error(`la base trae dos columnas con el mismo archivo de valores («${archivo}»)`);
        archivosVistos.add(archivo);
        const bytes = archivos.get(archivo);
        if (!bytes) throw new Error(`faltan los valores de la columna «${c.nombre}»`);
        const ancho = c.entera ? 4 : 8;
        if (bytes.length !== n * ancho) throw new Error(`la columna «${c.nombre}» no tiene ${n} valores`);
        const propios = bytes.slice();
        if (!LITTLE_ENDIAN) invertirPorElemento(propios, ancho);
        const datos = c.entera ? new Float32Array(propios.buffer) : new Float64Array(propios.buffer);
        /** @type {Record<string, string> | null} */
        let etiquetas = null;
        if (c.etiquetas !== null && c.etiquetas !== undefined) {
            if (typeof c.etiquetas !== 'object' || Array.isArray(c.etiquetas) || Object.values(c.etiquetas).some(e => typeof e !== 'string')) throw new Error(`las etiquetas de valor de «${c.nombre}» no tienen la forma esperada`);
            etiquetas = c.etiquetas;
        }
        if (c.formato !== null && c.formato !== undefined && c.formato !== 'fecha') throw new Error(`la columna «${c.nombre}» tiene un formato desconocido (${String(c.formato)})`);
        return { nombre: c.nombre, entera: !!c.entera, buffer: datos.buffer, etiquetas, formato: c.formato || null };
    });
    return BaseColumnar.desdeSerializado({ n, columnas });
}
