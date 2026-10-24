// @ts-check
// ejemplos/paquete.js — (2027.01.02) «Descargar todo»: el caso entero en un .zip (su README, su verificacion.json y todos sus
// archivos, dentro de una carpeta con el nombre del caso), con los archivos tal como están en el sitio. Cada uno se compara
// con el tamaño que dice el catálogo: si el navegador sirviera uno de otra versión (su caché), se dice, en lugar de meterlo
// en el .zip. Los que ya vienen comprimidos (PDF, Word, Excel, el proyecto) van sin volver a comprimir. Sin DOM.

import { escribirZip } from '../core/data/zip/escritor.js';
import { ACOMPANANTES, bytesDelArchivo } from './catalogo.js';

/** Los que ya vienen comprimidos: comprimirlos otra vez solo gasta tiempo. */
const YA_COMPRIMIDOS = /\.(pdf|docx|xlsx|statsim|zip)$/i;

/** El nombre del .zip de un caso. @param {import('./catalogo.js').Ejemplo} e */
export const nombreDelPaquete = e => `ejemplo-${e.carpeta}.zip`;

/** Las rutas que lleva el .zip de un caso, en orden: su README, su verificación y sus archivos. @param {import('./catalogo.js').Ejemplo} e */
export const rutasDelPaquete = e => [...ACOMPANANTES, ...e.archivos.map(a => a.ruta)];

/**
 * El .zip de un caso, en trozos (new Blob(trozos) es el archivo).
 * @param {import('./catalogo.js').Ejemplo} e
 * @param {{ obtener: import('./catalogo.js').Obtener, version: string, alAvanzar?: (hechos: number, total: number) => void, fecha?: Date }} op
 *   alAvanzar: cuántos archivos van descargados (para decirlo mientras tanto)
 * @returns {Promise<Uint8Array[]>}
 */
export async function paqueteDelCaso(e, { obtener, version, alAvanzar, fecha }) {
    const rutas = rutasDelPaquete(e);
    /** @type {import('../core/data/zip/escritor.js').EntradaNueva[]} */
    const entradas = [];
    for (let i = 0; i < rutas.length; i++) {
        if (alAvanzar) alAvanzar(i, rutas.length);
        const bytes = await bytesDelArchivo(e, rutas[i], { obtener, version });
        entradas.push({ nombre: `${e.carpeta}/${rutas[i]}`, contenido: bytes, comprimir: !YA_COMPRIMIDOS.test(rutas[i]) });
    }
    if (alAvanzar) alAvanzar(rutas.length, rutas.length);
    return escribirZip(entradas, fecha ? { fecha } : {});
}
