// @ts-check
// analizador/motor/fiabilidad-escalas.js — lo que el análisis general necesita de la fiabilidad de sus variables con
// dimensiones: el α de Cronbach de un conjunto de ítems (con el α del núcleo único, core/stats/fiabilidad.js) y los
// puntajes de cada dimensión con la regla del 80 % del Simulador. La fiabilidad completa (ω, IC, análisis de ítems) es la
// de la tarjeta de fiabilidad (fiabilidad.js). (2026.12.24, fase F6, paso 4) Antes, dentro de estadistica.js.
import { varianza } from '../../core/stats/descriptivos.js';
import { alfaCronbach } from '../../core/stats/fiabilidad.js';
import { aNumero, totalConProrrateo } from '../../core/data/celdas.js';
import { nivelFiabilidad } from './magnitudes.js';

/** @typedef {Record<string, unknown>} Fila */
/** @typedef {{ alfa: number, k: number, n: number, interpretacion: string }} AlfaEscala */

/**
 * Varianza muestral (n − 1); 0 con menos de 2 valores.
 * @param {number[]} valores
 * @returns {number}
 */
export function varianzaMuestral(valores) { return valores.length < 2 ? 0 : varianza(valores); }

/**
 * α de Cronbach de unos ítems (columnas de la base) con los casos que los tienen todos: k/(k − 1)·(1 − Σ σ²ᵢ / σ²ₜ).
 * null con menos de 2 ítems, menos de 2 casos completos o la varianza del total nula.
 * @param {Fila[]} datos
 * @param {string[]} items
 * @returns {AlfaEscala | null}
 */
export function alfaDeItems(datos, items) {
    const k = items.length;
    if (k < 2) return null;
    const filas = datos.map(fila => items.map(item => aNumero(fila[item]))).filter(fila => fila.every(v => Number.isFinite(v)));
    const n = filas.length;
    if (n < 2) return null;
    /** @type {number[]} */
    const varianzasItems = [];
    for (let j = 0; j < k; j++) varianzasItems.push(varianzaMuestral(filas.map(fila => /** @type {number} */ (fila[j]))));
    const varianzaTotal = varianzaMuestral(filas.map(fila => fila.reduce((a, b) => a + b, 0)));
    if (varianzaTotal === 0) return null;
    const alfa = alfaCronbach(varianzasItems, varianzaTotal);
    return { alfa, k, n, interpretacion: nivelFiabilidad(alfa) };
}

/**
 * Puntaje de una dimensión en cada fila: la suma de sus ítems con la regla del 80 % (si falta alguno pero se respondió al
 * menos el 80 %, prorrateo; si no, NaN). (2026.12.18) Antes, un ítem perdido sumaba 0.
 * @param {Fila[]} datos
 * @param {string[]} items
 * @returns {number[]}
 */
export function puntajesDimension(datos, items) {
    return datos.map(fila => totalConProrrateo(items.map(item => aNumero(fila[item]))));
}

/**
 * Fiabilidad de una variable con dimensiones: el α de la escala completa (todos sus ítems) y el de cada dimensión.
 * @param {Fila[]} datos
 * @param {Record<string, string[]>} dimensiones
 * @returns {{ escala: AlfaEscala | null, dimensiones: { nombre: string, items: string[], fiabilidad: AlfaEscala | null }[] }}
 */
export function fiabilidadPorDimensiones(datos, dimensiones) {
    const itemsEscala = Object.values(dimensiones).flat();
    const porDimension = Object.entries(dimensiones).map(([nombre, items]) => ({ nombre, items, fiabilidad: alfaDeItems(datos, items) }));
    return { escala: alfaDeItems(datos, itemsEscala), dimensiones: porDimension };
}
