// @ts-check
// core/data/celdas.js — qué es un valor perdido y cómo se lee un número de una celda: una sola convención para todo el
// Analizador (2026.12.18). Antes convivían cinco: parseFloat (el cargador de CSV, la vista principal, la fiabilidad, el AFE),
// que leía «3ro», «5 años» o «2024-05-01» como 3, 5 y 2024; +valor (la regresión, el SEM, la pestaña de grupos y las dos
// cribas), que convierte en 0 la celda vacía de un CSV y la contaba como un dato; y tres versiones estrictas locales (el
// diagnóstico de forma, la invarianza y la concordancia), que son la base de la de aquí. Sin DOM.

/**
 * Celda perdida: sin valor (undefined o null), NaN (el perdido del Simulador) o texto vacío (la celda vacía de un CSV).
 * @param {unknown} v
 * @returns {boolean}
 */
export function esPerdido(v) {
    return v === undefined || v === null || (typeof v === 'number' && Number.isNaN(v)) || (typeof v === 'string' && v.trim() === '');
}

const DECIMAL = /^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/, COMA_DECIMAL = /^[-+]?\d*,\d+$/;

/**
 * Número de una celda, o NaN si está perdida o no contiene un número COMPLETO: un número tal cual, o un texto con un
 * número decimal, con punto o con una coma decimal («3,5»), con o sin espacios alrededor. «3ro», «5 años», «45 %»,
 * «1.234,5» o «2024-05-01» no son números (parseFloat los leía como 3, 5, 45, 1,234 y 2024); tampoco «0x1A» ni «Infinity».
 * @param {unknown} v
 * @returns {number}
 */
export function aNumero(v) {
    if (typeof v === 'number') return v;
    if (typeof v !== 'string') return NaN;
    const t = v.trim();
    return DECIMAL.test(t) ? Number(t) : COMA_DECIMAL.test(t) ? Number(t.replace(',', '.')) : NaN;
}

/**
 * Primer valor no perdido de una columna (undefined si todos lo están). El tipo de una columna se decide con él: con la
 * primera fila, un perdido en el primer participante la hacía desaparecer o cambiar de tipo.
 * @param {ArrayLike<Record<string, unknown>>} datos
 * @param {string} columna
 * @returns {unknown}
 */
export function primerValor(datos, columna) {
    for (let i = 0; i < datos.length; i++) { const v = datos[i][columna]; if (!esPerdido(v)) return v; }
    return undefined;
}

/**
 * Columna numérica: su primer valor no perdido es un número.
 * @param {ArrayLike<Record<string, unknown>>} datos
 * @param {string} columna
 * @returns {boolean}
 */
export function esColumnaNumerica(datos, columna) { return Number.isFinite(aNumero(primerValor(datos, columna))); }

const FECHA = /^(\d{4}-\d{1,2}-\d{1,2}([ T]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?)?|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})$/;

/**
 * Texto con forma de fecha (AAAA-MM-DD, con o sin hora, o DD/MM/AAAA): no es un número (parseFloat leía el año, o el día)
 * ni una categoría (cada fecha sería un nivel). Las fechas de nacimiento del Simulador llegan así. (2026.12.29, revisión)
 * Con fracciones de segundo también («2024-05-01 10:00:00.250»: un DATETIME23.2 de SPSS, o un CSV con milisegundos):
 * sin ellas, cada fecha-hora era una categoría.
 * @param {unknown} v
 * @returns {boolean}
 */
export function esFecha(v) { return typeof v === 'string' && FECHA.test(v.trim()); }

/**
 * Columna de texto (categórica): su primer valor no perdido es un texto que no es un número ni una fecha.
 * @param {ArrayLike<Record<string, unknown>>} datos
 * @param {string} columna
 * @returns {boolean}
 */
export function esColumnaTexto(datos, columna) { const v = primerValor(datos, columna); return typeof v === 'string' && Number.isNaN(aNumero(v)) && !esFecha(v); }

/**
 * Columna numérica alineada por fila: NaN donde la celda está perdida o no es un número.
 * @param {ArrayLike<Record<string, unknown>>} datos
 * @param {string} columna
 * @returns {Float64Array}
 */
export function columnaNumerica(datos, columna) {
    const n = datos.length, c = new Float64Array(n);
    for (let i = 0; i < n; i++) c[i] = aNumero(datos[i][columna]);
    return c;
}

/**
 * Total de una escala con la regla del 80 % (la del Simulador): la suma si están todos los ítems; si falta alguno pero se
 * respondió al menos el 80 %, la media de los respondidos por el número de ítems (prorrateo); si no, NaN. Antes, el
 * Analizador sumaba los ítems respondidos como si los perdidos valieran 0.
 * @param {ArrayLike<number>} valores  ítems de una persona (NaN donde falta)
 * @param {number} [k]                 número de ítems de la escala
 * @param {number} [minimo]            proporción mínima de ítems respondidos
 * @returns {number}
 */
export function totalConProrrateo(valores, k = valores.length, minimo = 0.8) {
    let suma = 0, m = 0;
    for (let i = 0; i < valores.length; i++) { const v = /** @type {number} */ (valores[i]); if (Number.isFinite(v)) { suma += v; m++; } }
    if (m === 0 || m < minimo * k) return NaN;
    return m < k ? (suma / m) * k : suma;
}
