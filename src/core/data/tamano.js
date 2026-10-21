// @ts-check
// core/data/tamano.js — (2026.12.31, revisión) el tamaño de un archivo o de una de sus partes, legible en los mensajes
// («300 MB», «12 KB»): lo usan los topes del lector de Excel (core/data/xlsx/lector.js) y del proyecto (proyecto/). Sin DOM.

/**
 * Un tamaño en bytes como lo lee una persona: en megabytes desde 1 MB (redondeado) y, por debajo, en kilobytes (al menos 1).
 * @param {number} bytes
 * @returns {string}
 */
export function tamanoLegible(bytes) {
    return bytes >= 1048576 ? `${Math.round(bytes / 1048576)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
