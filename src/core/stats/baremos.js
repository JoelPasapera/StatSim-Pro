// @ts-check
// core/stats/baremos.js — (2027.01.18) los baremos de una escala: la tabla que convierte cada puntuación directa en
// su posición en la muestra normativa. Por cada puntuación observada: su frecuencia, la acumulada, el percentil (por el punto
// medio: el porcentaje de casos por debajo más la mitad de los que la tienen, el «mean» de scipy.stats.percentileofscore,
// que no da 0 ni 100), la z normalizada (Φ⁻¹ del percentil: la de una distribución normal con el mismo orden), la T
// normalizada (50 + 10z), el eneatipo (sus cortes convencionales: 4, 11, 23, 40, 60, 77, 89 y 96 % acumulados) y el
// decatipo (Canfield, 1951: z en medios puntos, de −2 a 2); y la z y la T típicas (lineales, con la media y la DE). Y las categorías por
// percentiles (bajo, medio y alto con los cortes elegidos: por defecto 25 y 75), con la puntuación directa de cada corte.
import { media, desviacion } from './descriptivos.js';
import { cuantilNormal } from './normal.js';
import { cuantilOrdenado } from './orden.js';

/** Los porcentajes acumulados que separan los nueve eneatipos (los convencionales: 4, 7, 12, 17, 20, 17, 12, 7 y 4 % en cada uno). */
export const CORTES_ENEATIPOS = Object.freeze([4, 11, 23, 40, 60, 77, 89, 96]);

/**
 * El eneatipo de un percentil: 1 por debajo del 4 %, 9 desde el 96 %.
 * @param {number} pc
 */
export function eneatipo(pc) {
    let e = 1;
    for (const c of CORTES_ENEATIPOS) if (pc >= c) e++;
    return e;
}

/**
 * El decatipo de una z normalizada: 2z + 5,5 redondeado (medios hacia arriba), de 1 a 10 (cortes en z = −2, −1,5, …, 2).
 * @param {number} z
 */
export function decatipo(z) {
    return Math.min(10, Math.max(1, Math.round(2 * z + 5.5)));
}

/**
 * La tabla de baremos de unas puntuaciones (sin perdidos), una fila por puntuación distinta, de menor a mayor.
 * @param {ArrayLike<number>} valores
 * @returns {{ n: number, media: number, de: number, filas: { pd: number, f: number, fa: number, pc: number, z: number,
 *   t: number, eneatipo: number, decatipo: number, zTipica: number, tTipica: number }[] }}
 */
export function tablaBaremos(valores) {
    const n = valores.length, m = media(valores), de = desviacion(valores);
    /** @type {Map<number, number>} */ const frec = new Map();
    for (let i = 0; i < n; i++) { const v = /** @type {number} */ (valores[i]); frec.set(v, (frec.get(v) || 0) + 1); }
    const distintos = [...frec.keys()].sort((a, b) => a - b);
    let debajo = 0;
    const filas = distintos.map(pd => {
        const f = /** @type {number} */ (frec.get(pd)), pc = 100 * (debajo + f / 2) / n;
        debajo += f;
        const z = cuantilNormal(pc / 100), zTipica = de > 0 ? (pd - m) / de : 0;
        return { pd, f, fa: debajo, pc, z, t: 50 + 10 * z, eneatipo: eneatipo(pc), decatipo: decatipo(z), zTipica, tTipica: 50 + 10 * zTipica };
    });
    return { n, media: m, de, filas };
}

/**
 * Las categorías por percentiles: los puntos de corte en la escala de las puntuaciones directas (el cuantil de tipo 7 de
 * cada percentil de corte) y cuántos caen en cada una (bajo: hasta el primer corte; alto: desde el último). Con puntuaciones
 * enteras, el corte se expresa como el entero de abajo (x ≤ 22,25 es x ≤ 22 si x es entero): clasifica igual y se lee mejor.
 * @param {ArrayLike<number>} valores
 * @param {number[]} [cortes] percentiles de corte, crecientes (25 y 75)
 * @param {string[]} [nombres] uno más que cortes ('Bajo', 'Medio', 'Alto')
 */
export function categoriasPorPercentiles(valores, cortes = [25, 75], nombres = ['Bajo', 'Medio', 'Alto']) {
    const o = Float64Array.from(valores).sort(), n = o.length, enteros = o.every(Number.isInteger);
    const puntos = cortes.map(c => { const q = cuantilOrdenado(o, c / 100); return enteros ? Math.floor(q) : q; });
    const cuenta = new Array(nombres.length).fill(0);
    for (const v of o) { let k = 0; while (k < puntos.length && v > /** @type {number} */ (puntos[k])) k++; cuenta[k]++; }
    return nombres.map((nombre, k) => ({
        nombre, desde: k === 0 ? /** @type {number} */ (o[0]) : /** @type {number} */ (puntos[k - 1]), hasta: k === nombres.length - 1 ? /** @type {number} */ (o[n - 1]) : /** @type {number} */ (puntos[k]),
        n: cuenta[k], porcentaje: 100 * cuenta[k] / n
    }));
}
