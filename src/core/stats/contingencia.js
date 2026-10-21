// @ts-check
// core/stats/contingencia.js — la prueba χ² de independencia de Pearson sobre una tabla de contingencia de frecuencias
// observadas (2026.12.24, fase F6, paso 4): las frecuencias esperadas bajo independencia, χ², sus grados de libertad, el
// p (la cola superior de la χ²), la V de Cramér y cuántas esperadas son menores que 5 (el supuesto de la prueba). Antes
// vivía dentro de analizador/estadistica.js, mezclada con la lectura de las categorías; sin corrección por continuidad,
// como chisq.test(correct = FALSE) de R y la «Chi-cuadrado de Pearson» de SPSS.
import { pChiCuadrado } from './distribuciones.js';

/**
 * @typedef {{ totalFila: number[], totalColumna: number[], n: number, esperadas: number[][], chiCuadrado: number,
 *   gl: number, pValor: number, cramerV: number, esperadasBajas: number }} PruebaIndependencia
 */

/**
 * χ² de independencia de una tabla f × c de frecuencias observadas (f, c ≥ 2; enteros ≥ 0, con algún caso). Una celda
 * cuya esperada es 0 (una fila o una columna vacía) no suma a χ². Con χ² = 0, p = 1.
 * @param {number[][]} observadas  observadas[i][j]: casos con la categoría i de la primera variable y la j de la segunda
 * @returns {PruebaIndependencia}
 */
export function pruebaIndependencia(observadas) {
    const f = observadas.length, c = /** @type {number[]} */ (observadas[0]).length;
    const totalFila = observadas.map(fila => fila.reduce((a, b) => a + b, 0));
    const totalColumna = Array.from({ length: c }, (_, j) => observadas.reduce((s, fila) => s + /** @type {number} */ (fila[j]), 0));
    const n = totalFila.reduce((a, b) => a + b, 0);
    const esperadas = Array.from({ length: f }, () => new Array(c).fill(0));
    let chiCuadrado = 0, esperadasBajas = 0;
    for (let i = 0; i < f; i++) {
        const fila = /** @type {number[]} */ (observadas[i]), esp = /** @type {number[]} */ (esperadas[i]);
        for (let j = 0; j < c; j++) {
            const e = (/** @type {number} */ (totalFila[i]) * /** @type {number} */ (totalColumna[j])) / n;
            esp[j] = e;
            if (e < 5) esperadasBajas++;
            if (e > 0) chiCuadrado += Math.pow(/** @type {number} */ (fila[j]) - e, 2) / e;
        }
    }
    const gl = (f - 1) * (c - 1);
    const pValor = chiCuadrado <= 0 ? 1 : pChiCuadrado(chiCuadrado, gl);
    const cramerV = Math.sqrt(chiCuadrado / (n * Math.min(f - 1, c - 1)));
    return { totalFila, totalColumna, n, esperadas, chiCuadrado, gl, pValor, cramerV, esperadasBajas };
}
