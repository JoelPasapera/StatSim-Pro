// @ts-check
// core/data/xlsx/referencias.js — (2026.12.31) las referencias de celda de una hoja de Excel: la columna en letras
// («A»…«XFD», la 16 384) y la fila en número desde 1, como en «AB12». Las usan el lector (core/data/xlsx/lector.js), el
// escritor (core/data/xlsx/escritor.js) y los avisos que nombran una columna. Sin DOM.

/** Las columnas y las filas que admite una hoja de Excel (desde Excel 2007). */
export const MAXIMO_COLUMNAS = 16384, MAXIMO_FILAS = 1048576;

/**
 * La columna en letras: 0 → «A», 25 → «Z», 26 → «AA», 16383 → «XFD».
 * @param {number} columna desde 0
 * @returns {string}
 */
export function letrasDeColumna(columna) {
    let n = columna + 1, letras = '';
    while (n > 0) {
        const r = (n - 1) % 26;
        letras = String.fromCharCode(65 + r) + letras;
        n = (n - 1 - r) / 26;
    }
    return letras;
}

/**
 * Una referencia como fila y columna desde 0: «AB12» → { fila: 11, columna: 27 }; null si no es una referencia de celda
 * (las letras, en mayúsculas o minúsculas, seguidas de la fila; sin «$»: en las hojas no se usan).
 * @param {string} ref
 * @returns {{ fila: number, columna: number } | null}
 */
export function referenciaACelda(ref) {
    let columna = 0, i = 0;
    for (; i < ref.length; i++) {
        const c = ref.charCodeAt(i) | 0x20;   // a minúscula
        if (c >= 97 && c <= 122) columna = columna * 26 + (c - 96);
        else break;
    }
    if (i === 0 || i === ref.length || i > 3) return null;
    let fila = 0;
    for (let j = i; j < ref.length; j++) {
        const d = ref.charCodeAt(j) - 48;
        if (d < 0 || d > 9) return null;
        fila = fila * 10 + d;
    }
    return fila >= 1 && fila <= MAXIMO_FILAS && columna <= MAXIMO_COLUMNAS ? { fila: fila - 1, columna: columna - 1 } : null;
}
