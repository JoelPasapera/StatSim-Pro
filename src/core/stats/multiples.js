// @ts-check
// core/stats/multiples.js — corrección por comparaciones múltiples. (2026.12.17) La de Holm estaba en dos módulos, el
// Analizador (estadistica.js: criba, objetivos específicos, matriz de correlaciones, post-hoc de la pestaña de grupos y
// el Word) y el cribado de forma (cribado-forma.js), con los mismos ajustados para p finitos.

/**
 * p ajustados por Holm (1979): con los p ordenados de menor a mayor, p̃₍ₖ₎ = máx_{j ≤ k} mín(1, (m − j + 1)·p₍ⱼ₎).
 * Controlan la probabilidad de alguna falsa significación en la familia con cualquier dependencia entre las pruebas y
 * son uniformemente más potentes que los de Bonferroni. Se devuelven en el orden de entrada; los empates reciben el mismo
 * ajustado, sea cual sea su orden. Un p no finito (una prueba que no pudo calcularse) cuenta como 1: sigue en la familia
 * (m no cambia) y su ajustado es 1.
 * @param {ArrayLike<number>} ps
 * @returns {number[]}
 */
export function ajustarHolm(ps) {
    const m = ps.length, orden = Array.from(ps, (p, i) => ({ p: Number.isFinite(p) ? p : 1, i })).sort((a, b) => a.p - b.p);
    const ajustados = new Array(m).fill(1);
    let acumulado = 0;
    orden.forEach((o, k) => { acumulado = Math.max(acumulado, Math.min((m - k) * o.p, 1)); ajustados[o.i] = acumulado; });
    return ajustados;
}
