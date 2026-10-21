// @ts-check
// analizador/motor/normalidad.js — la normalidad de una variable en el formato del análisis general (la vista principal, la
// comparación de grupos, la criba y el Word): la prueba y la regla que la elige son las del núcleo único
// (core/stats/normalidad.js: Shapiro-Wilk con n < 50, Kolmogórov-Smirnov con la corrección de Lilliefors con n ≥ 50, la
// convención del programa). (2026.12.24, fase F6, paso 4) Antes, dentro de estadistica.js.
import { pruebaNormalidad } from '../../core/stats/normalidad.js';

/**
 * @typedef {{ estadistico: number, pValor: number, prueba: string, razon: string, n: number, normal: boolean,
 *   decision: string }} NormalidadVista
 */

/**
 * Una prueba de normalidad del núcleo en el formato de esta vista: la regla que la eligió y la decisión en palabras.
 * @param {{ estadistico: number, pValor: number, prueba: string, n: number, normal: boolean }} r
 * @returns {NormalidadVista}
 */
export function formatoNormalidad(r) {
    return {
        estadistico: r.estadistico, pValor: r.pValor, prueba: r.prueba, razon: r.prueba === 'Shapiro-Wilk' ? 'n < 50' : 'n ≥ 50', n: r.n, normal: r.normal,
        decision: r.normal ? 'Los datos siguen una distribución normal (p > 0.05)' : 'Los datos NO siguen una distribución normal (p ≤ 0.05)'
    };
}

/**
 * Normalidad de una serie de valores numéricos (sin perdidos). Lanza un error con menos de 3 valores.
 * @param {number[]} valores
 * @returns {NormalidadVista}
 */
export function evaluarNormalidad(valores) {
    if (valores.length < 3) {
        throw new Error('Se necesitan al menos 3 observaciones para la prueba de normalidad');
    }
    return formatoNormalidad(pruebaNormalidad(valores));
}
