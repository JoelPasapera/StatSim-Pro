// @ts-check
// shared/archivos.js — (2026.12.29) leer el archivo que el usuario elige en un selector: sus bytes y, si es texto, el
// texto con la codificación con que lo guardó su programa (core/data/codificacion.js: UTF-8, UTF-16 o el ANSI de Excel en
// español). Antes se leía siempre como UTF-8 (FileReader.readAsText) y, en un CSV guardado por Excel en español, cada tilde
// y cada eñe salían como «�».
import { avisoDeCodificacion, decodificarTexto } from '../core/data/codificacion.js';

/**
 * Los bytes de un archivo (con Blob.arrayBuffer o, en un navegador que no lo tenga, con FileReader).
 * @param {Blob} archivo
 * @returns {Promise<Uint8Array>}
 */
export async function leerBytes(archivo) {
    if (typeof archivo.arrayBuffer === 'function') return new Uint8Array(await archivo.arrayBuffer());
    return new Promise((resolver, rechazar) => {
        const lector = new FileReader();
        lector.onload = () => resolver(new Uint8Array(/** @type {ArrayBuffer} */ (lector.result)));
        lector.onerror = () => rechazar(lector.error || new Error('No se pudo leer el archivo'));
        lector.readAsArrayBuffer(archivo);
    });
}

/**
 * El texto de un archivo, la codificación con que se leyó, cuántos caracteres dañados lleva y, si no se leyó limpio, el
 * aviso para el usuario (2026.12.30: las importaciones del Simulador y de Aiken no avisaban).
 * @param {Blob} archivo
 * @returns {Promise<{ texto: string, codificacion: import('../core/data/codificacion.js').CodificacionTexto, invalidos: number, aviso: string }>}
 */
export async function leerArchivoComoTexto(archivo) {
    const lectura = decodificarTexto(await leerBytes(archivo));
    return { ...lectura, aviso: avisoDeCodificacion(lectura) };
}
