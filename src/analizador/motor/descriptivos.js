// @ts-check
// analizador/motor/descriptivos.js — los estadísticos descriptivos de una variable tal como los informa el análisis general
// (la tabla de descriptivos, la correlación y la comparación de grupos), con las fórmulas del núcleo único: la media y la
// varianza muestral (core/stats/descriptivos.js), la mediana y los cuartiles de tipo 7 (core/stats/orden.js) y la
// asimetría y la curtosis ajustadas, G1 y G2, las de SPSS. (2026.12.24, fase F6, paso 4) Antes, dentro de estadistica.js.
import { media, varianza, asimetria, curtosis } from '../../core/stats/descriptivos.js';
import { cuantilOrdenado, medianaOrdenada } from '../../core/stats/orden.js';

/**
 * @typedef {{ n: number, media: number, desviacion: number, varianza: number, errorEstandar: number, min: number,
 *   max: number, rango: number, mediana: number, q1: number, q3: number, iqr: number, asimetria: number,
 *   curtosis: number }} Descriptivos
 */

/**
 * Percentil de tipo 7 (el de R y NumPy por defecto) de una serie YA ORDENADA, con el percentil de 0 a 100.
 * @param {ArrayLike<number>} ordenados
 * @param {number} p
 * @returns {number}
 */
export function percentil(ordenados, p) { return cuantilOrdenado(ordenados, p / 100); }

/**
 * Descriptivos de una serie de valores numéricos (sin perdidos: quien llama los filtra): n, media, DE y varianza
 * muestrales, error estándar de la media, mínimo, máximo, rango, mediana, cuartiles (tipo 7), rango intercuartílico,
 * asimetría y curtosis ajustadas. Lanza un error con la serie vacía.
 * @param {number[]} valores
 * @returns {Descriptivos}
 */
export function descriptivos(valores) {
    if (valores.length === 0) {
        throw new Error('No hay valores numéricos para calcular las estadísticas descriptivas');
    }
    const n = valores.length;
    const m = media(valores), v = varianza(valores);
    const desviacion = Math.sqrt(v);
    const ordenados = [...valores].sort((a, b) => a - b);
    const min = /** @type {number} */ (ordenados[0]), max = /** @type {number} */ (ordenados[n - 1]);
    const q1 = percentil(ordenados, 25), q3 = percentil(ordenados, 75);
    return {
        n,
        media: m,
        desviacion,
        varianza: v,
        errorEstandar: desviacion / Math.sqrt(n),
        min,
        max,
        rango: max - min,
        mediana: medianaOrdenada(ordenados),
        q1,
        q3,
        iqr: q3 - q1,
        asimetria: asimetria(valores),
        curtosis: curtosis(valores)
    };
}
