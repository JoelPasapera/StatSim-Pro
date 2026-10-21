// @ts-check
// core/stats/fiabilidad.js — el estimador de fiabilidad ÚNICO: α de Cronbach y ω de McDonald por ejes principales iterados
// de un factor HASTA LA CONVERGENCIA. (2026.12.13) Antes había tres motores: el de la fiabilidad del Analizador (hasta 50
// iteraciones, 100 pasos de potencias desde cero y parada cuando las comunalidades cambiaban menos de 1e−6), su réplica en el
// Simulador para calibrar (25 y 40) y el del AFE y la ω ordinal (1000 y 1e−10). Los ejes principales convergen linealmente,
// a veces muy despacio (3 o 4 ítems con cargas modestas: miles de iteraciones), y un cambio pequeño por iteración no implica
// estar cerca del punto fijo: la ω de la fiabilidad salía hasta 0,02 por debajo de la solución (comprobado contra la solución
// exacta con k = 3 y contra los ejes principales iterados hasta 1e−14 desde dos arranques distintos) y el Simulador calibraba
// contra un número hasta 0,027 distinto del que mostraba el Analizador.
import { inversaDefinidaPositiva } from '../linalg/cholesky.js';

/** Tope de las comunalidades ante casos Heywood (comunalidad ≥ 1). */
export const COMUNALIDAD_MAXIMA = 0.999;

// Comunalidades iniciales: correlación múltiple al cuadrado (1 − 1/diag(R⁻¹)); si R no es invertible, el mayor |r| de la fila
/**
 * @param {number[][]} R
 * @returns {number[]}
 */
export function comunalidadesIniciales(R) {
    const inv = inversaDefinidaPositiva(R);
    if (inv) return R.map((_, i) => Math.min(COMUNALIDAD_MAXIMA, Math.max(0.005, 1 - 1 / inv[i][i])));
    return R.map((f, i) => Math.min(COMUNALIDAD_MAXIMA, Math.max(0.005, ...f.filter((_, j) => j !== i).map(Math.abs))));
}

/**
 * Ejes principales iterados de UN factor sobre una matriz de correlaciones, hasta que las comunalidades cambian menos de
 * `tol` (con un tope de iteraciones muy holgado: los casos lentos necesitan miles). El autovector dominante sale por
 * potencias sobre R* + I (autovalores desplazados +1, todos positivos) partiendo del de la iteración anterior: O(k²) por paso.
 * Las cargas salen con el signo global de suma positiva (el de cada carga se conserva: los ítems inversos se ven).
 * @param {number[][]} R
 * @param {{ maxIter?: number, tol?: number }} [opciones]
 * @returns {{ cargas: number[], comunalidades: number[], heywood: boolean, convergio: boolean, iteraciones: number, estimable: boolean }}
 */
export function ejesPrincipalesUnFactor(R, { maxIter = 50000, tol = 1e-10 } = {}) {
    const k = R.length;
    const h2 = comunalidadesIniciales(R), v = new Float64Array(k).fill(1 / Math.sqrt(k)), cargas = new Float64Array(k);
    let lambda = 0, cambio = Infinity, iter = 0, heywood = false, estimable = true;
    while (iter < maxIter) {
        iter++;
        for (let p = 0; p < 5000; p++) {
            const w = new Float64Array(k);
            for (let i = 0; i < k; i++) { let s = /** @type {number} */ (v[i]); const f = /** @type {number[]} */ (R[i]); for (let j = 0; j < k; j++) s += (i === j ? /** @type {number} */ (h2[i]) : /** @type {number} */ (f[j])) * /** @type {number} */ (v[j]); w[i] = s; }
            let norma = 0; for (let i = 0; i < k; i++) norma += /** @type {number} */ (w[i]) * /** @type {number} */ (w[i]);
            norma = Math.sqrt(norma);
            if (!(norma > 0) || !Number.isFinite(norma)) { estimable = false; break; }
            let dif = 0; for (let i = 0; i < k; i++) { const x = /** @type {number} */ (w[i]) / norma; dif = Math.max(dif, Math.abs(x - /** @type {number} */ (v[i]))); v[i] = x; }
            lambda = norma - 1;
            if (dif < 1e-13) break;
        }
        if (!estimable || !(lambda > 0)) { estimable = false; break; }
        let nuevo = 0;
        for (let i = 0; i < k; i++) {
            cargas[i] = /** @type {number} */ (v[i]) * Math.sqrt(lambda);
            let h = /** @type {number} */ (cargas[i]) * /** @type {number} */ (cargas[i]);
            if (h > COMUNALIDAD_MAXIMA) { heywood = true; h = COMUNALIDAD_MAXIMA; }
            nuevo = Math.max(nuevo, Math.abs(h - /** @type {number} */ (h2[i])));
            h2[i] = h;
        }
        cambio = nuevo;
        if (cambio < tol) break;
    }
    let suma = 0; for (let i = 0; i < k; i++) suma += /** @type {number} */ (cargas[i]);
    if (suma < 0) for (let i = 0; i < k; i++) cargas[i] = -/** @type {number} */ (cargas[i]);
    return { cargas: Array.from(cargas), comunalidades: Array.from(h2), heywood, convergio: cambio < tol, iteraciones: iter, estimable };
}

/**
 * ω de un factor en la métrica estandarizada: (Σλ)² / [(Σλ)² + Σ(1 − h²)] (McDonald, 1999).
 * @param {number[]} cargas
 * @param {number[]} comunalidades
 * @returns {number}
 */
export function omegaDeCargas(cargas, comunalidades) {
    let suma = 0, unicidades = 0;
    for (let i = 0; i < cargas.length; i++) { suma += /** @type {number} */ (cargas[i]); unicidades += 1 - /** @type {number} */ (comunalidades[i]); }
    return (suma * suma) / (suma * suma + unicidades);
}

/**
 * ω en la métrica de la puntuación total observada: cargas (parte positiva) y unicidades reescaladas por las varianzas de
 * los ítems. Es la que muestran la fiabilidad del Analizador y contra la que calibra el Simulador.
 * @param {number[]} cargas estandarizadas
 * @param {number[]} varianzas de los ítems
 * @returns {number}
 */
export function omegaCovarianzas(cargas, varianzas) {
    let sl = 0, st = 0;
    for (let i = 0; i < cargas.length; i++) {
        const l = /** @type {number} */ (cargas[i]), v = /** @type {number} */ (varianzas[i]);
        sl += Math.max(l, 0) * Math.sqrt(v);
        st += (1 - Math.min(l * l, COMUNALIDAD_MAXIMA)) * v;
    }
    return (sl * sl) / ((sl * sl) + st);
}

/**
 * α de Cronbach: k/(k − 1) · (1 − Σ varianzas de los ítems / varianza del total).
 * @param {number[]} varianzas de los ítems
 * @param {number} varianzaTotal
 * @returns {number}
 */
export function alfaCronbach(varianzas, varianzaTotal) {
    const k = varianzas.length;
    let s = 0;
    for (let i = 0; i < k; i++) s += /** @type {number} */ (varianzas[i]);
    return (k / (k - 1)) * (1 - s / varianzaTotal);
}
