// @ts-check
// core/stats/regresion-simple.js — la recta de mínimos cuadrados de y sobre x, con la inferencia de su pendiente y su banda
// de confianza. (2026.12.19) Estaba en la vista principal (estadistica.js) y repetida en el diagrama de dispersión
// (graficas.js), que además aproximaba la t crítica de la banda con 1,96 + 2,4/gl (con n = 5, 2,76 en lugar de 3,18; con
// n = 12, 2,20 en lugar de 2,23).
import { media } from './descriptivos.js';
import { pTBilateral, cuantilT } from './distribuciones.js';

/**
 * @typedef {object} RectaMCO
 * @property {number} n
 * @property {number} pendiente                 NaN si x es constante
 * @property {number} intercepto
 * @property {number} r2
 * @property {number} errorEstandarEstimacion   √(SC residual/(n − 2)); 0 con n ≤ 2
 * @property {number} errorEstandarPendiente
 * @property {number} tPendiente                0 si el error típico de la pendiente es 0
 * @property {number} gl                        n − 2
 * @property {number} pPendiente                bilateral
 * @property {number} mediaX
 * @property {number} sxx                       Σ(x − x̄)²
 */

/**
 * Regresión lineal simple de y sobre x por mínimos cuadrados, con la t de la pendiente (n − 2 gl).
 * @param {ArrayLike<number>} x
 * @param {ArrayLike<number>} y
 * @returns {RectaMCO}
 */
export function regresionSimple(x, y) {
    const n = x.length, mediaX = media(x), mediaY = media(y);
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) {
        const dx = /** @type {number} */ (x[i]) - mediaX, dy = /** @type {number} */ (y[i]) - mediaY;
        sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
    }
    const pendiente = sxy / sxx, intercepto = mediaY - pendiente * mediaX, r2 = (sxy * sxy) / (sxx * syy);
    const scResidual = Math.max(0, syy - pendiente * sxy);
    const errorEstandarEstimacion = n > 2 ? Math.sqrt(scResidual / (n - 2)) : 0;
    const errorEstandarPendiente = errorEstandarEstimacion / Math.sqrt(sxx);
    const tPendiente = errorEstandarPendiente > 0 ? pendiente / errorEstandarPendiente : 0;
    return { n, pendiente, intercepto, r2, errorEstandarEstimacion, errorEstandarPendiente, tPendiente, gl: n - 2, pPendiente: pTBilateral(Math.abs(tPendiente), n - 2), mediaX, sxx };
}

/**
 * Banda de confianza de la recta (la media de y para cada x): ŷ ± t·s·√(1/n + (x − x̄)²/Sxx), con la t de Student de n − 2
 * gl (exacta). Límites NaN con n ≤ 2.
 * @param {RectaMCO} recta
 * @param {ArrayLike<number>} xs
 * @param {{ nivel?: number }} [opciones]
 * @returns {{ x: number, y: number, inferior: number, superior: number }[]}
 */
export function bandaConfianzaRecta(recta, xs, { nivel = 0.95 } = {}) {
    const t = recta.gl > 0 ? cuantilT(1 - (1 - nivel) / 2, recta.gl) : NaN, s = recta.errorEstandarEstimacion;
    return Array.from(xs, x => {
        const y = recta.intercepto + recta.pendiente * x, palanca = recta.sxx > 0 ? ((x - recta.mediaX) ** 2) / recta.sxx : 0;
        const medio = t * s * Math.sqrt(1 / recta.n + palanca);
        return { x, y, inferior: y - medio, superior: y + medio };
    });
}
