// @ts-check
// core/linalg/simplex.js — la fase 1 del método símplex revisado (2026.12.23): ¿existe x ≥ 0 con A·x = b? Es la pieza de
// programación lineal que decide, de forma exacta, si un modelo lineal generalizado tiene estimación finita
// (core/stats/separacion.js). Con m filas pequeñas (una por coeficiente) y muchas columnas (una por caso), cada iteración
// cuesta O(m·columnas) y la base se guarda como B⁻¹ densa de m × m. Pivoteo de Dantzig (la columna de coste reducido más
// negativo) y, tras una racha de pivotes degenerados, la regla de Bland, que no cicla; B⁻¹ se recalcula desde la base cada
// 50 iteraciones para no acumular redondeo, con la inversa de Gauss-Jordan del núcleo (gauss.js; hasta la 2026.12.24, una
// copia aquí).
import { gaussJordan } from './gauss.js';

/**
 * El resultado: si el sistema es factible, la x básica; si no, el vector y de la última iteración (las variables duales en
 * las coordenadas originales), con Aᵀy ≤ tolerancia y bᵀy = residuo > 0: el certificado de Farkas de que no hay solución.
 * @typedef {{ factible: boolean, x: Float64Array, y: Float64Array, residuo: number, iteraciones: number }} ResultadoFase1
 */

/**
 * Inversa de la matriz m × m (por filas) por Gauss-Jordan con pivoteo parcial; null si es (numéricamente) singular (un
 * pivote menor que 10⁻¹³ en valor absoluto). Filas Float64Array.
 * @param {Float64Array[]} M
 * @returns {Float64Array[] | null}
 */
function invertir(M) {
    const r = gaussJordan(M, 1e-13);
    return r ? r.inversa.map(f => Float64Array.from(f)) : null;
}

/**
 * Fase 1 del símplex revisado: minimiza la suma de m variables artificiales en A·x + s = b (filas de b negativas cambiadas
 * de signo), con x, s ≥ 0. El sistema A·x = b, x ≥ 0 es factible si el mínimo es 0.
 * @param {Float64Array} A la matriz m × nCol por columnas: A[j·m + r]
 * @param {number} m
 * @param {number} nCol
 * @param {ArrayLike<number>} b
 * @param {{ tolerancia?: number, maxIteraciones?: number }} [opciones] tolerancia de los costes reducidos y de los pivotes
 *   (en las unidades de las columnas, que conviene escalar a O(1)); la de factibilidad es tolerancia·(1 + ‖b‖₁)
 * @returns {ResultadoFase1 | null} null si no se pudo decidir (iteraciones agotadas o una base singular)
 */
export function fase1(A, m, nCol, b, { tolerancia = 1e-9, maxIteraciones = 20000 } = {}) {
    const signo = Float64Array.from(b, v => (v < 0 ? -1 : 1));
    const rhs = Float64Array.from(b, (v, r) => v * /** @type {number} */ (signo[r]));
    const tolFactible = tolerancia * (1 + rhs.reduce((s, v) => s + v, 0));
    /** columna j (estructural o artificial nCol + r) con el signo de las filas, en destino */
    const columna = (/** @type {number} */ j, /** @type {Float64Array} */ destino) => {
        if (j >= nCol) { destino.fill(0); destino[j - nCol] = 1; return; }
        for (let r = 0; r < m; r++) destino[r] = /** @type {number} */ (A[j * m + r]) * /** @type {number} */ (signo[r]);
    };
    const base = Int32Array.from({ length: m }, (_, r) => nCol + r), enBase = new Uint8Array(nCol);
    /** @type {Float64Array[]} */ let Binv = Array.from({ length: m }, (_, r) => { const f = new Float64Array(m); f[r] = 1; return f; });
    let xB = Float64Array.from(rhs);
    const pi = new Float64Array(m), u = new Float64Array(m), aj = new Float64Array(m);
    const residuo = () => { let w = 0; for (let r = 0; r < m; r++) if (/** @type {number} */ (base[r]) >= nCol) w += /** @type {number} */ (xB[r]); return w; };
    const salida = (/** @type {boolean} */ factible, /** @type {number} */ iteraciones) => {
        const x = new Float64Array(nCol);
        for (let r = 0; r < m; r++) { const j = /** @type {number} */ (base[r]); if (j < nCol) x[j] = Math.max(0, /** @type {number} */ (xB[r])); }
        return { factible, x, y: Float64Array.from(pi, (v, r) => v * /** @type {number} */ (signo[r])), residuo: residuo(), iteraciones };
    };
    let degenerados = 0, bland = false;
    for (let it = 0; it < maxIteraciones; it++) {
        if (residuo() <= tolFactible) return salida(true, it);
        if (it > 0 && it % 50 === 0) {   // refactorizar: B⁻¹ y x_B desde la base
            const B = Array.from({ length: m }, () => new Float64Array(m));
            for (let c = 0; c < m; c++) { columna(/** @type {number} */ (base[c]), aj); for (let r = 0; r < m; r++) /** @type {Float64Array} */ (B[r])[c] = /** @type {number} */ (aj[r]); }
            const inv = invertir(B);
            if (!inv) return null;
            Binv = inv;
            for (let r = 0; r < m; r++) { let s = 0; for (let c = 0; c < m; c++) s += /** @type {number} */ (/** @type {Float64Array} */ (Binv[r])[c]) * /** @type {number} */ (rhs[c]); xB[r] = s; }
        }
        // las variables duales: π = c_Bᵀ·B⁻¹ (coste 1 en las artificiales, 0 en las estructurales)
        pi.fill(0);
        for (let r = 0; r < m; r++) if (/** @type {number} */ (base[r]) >= nCol) { const f = /** @type {Float64Array} */ (Binv[r]); for (let c = 0; c < m; c++) pi[c] = /** @type {number} */ (pi[c]) + /** @type {number} */ (f[c]); }
        // la columna que entra: coste reducido −πᵀa_j < −tolerancia (las artificiales que salieron no vuelven)
        let entra = -1, mejor = -tolerancia;
        for (let j = 0; j < nCol; j++) {
            if (enBase[j]) continue;
            let rc = 0; for (let r = 0; r < m; r++) rc -= /** @type {number} */ (pi[r]) * /** @type {number} */ (A[j * m + r]) * /** @type {number} */ (signo[r]);
            if (rc < mejor) { entra = j; if (bland) break; mejor = rc; }
        }
        if (entra < 0) return salida(residuo() <= tolFactible, it);   // óptimo de la fase 1
        columna(entra, aj);
        for (let r = 0; r < m; r++) { let s = 0; const f = /** @type {Float64Array} */ (Binv[r]); for (let c = 0; c < m; c++) s += /** @type {number} */ (f[c]) * /** @type {number} */ (aj[c]); u[r] = s; }
        // la que sale: el menor cociente x_B/u con u > tolerancia; entre los empatados, con la regla de Bland el menor índice
        // y, si no, una artificial (para sacarlas cuanto antes) y después el menor índice
        let theta = Infinity;
        for (let r = 0; r < m; r++) { const ur = /** @type {number} */ (u[r]); if (ur > tolerancia) theta = Math.min(theta, Math.max(0, /** @type {number} */ (xB[r])) / ur); }
        if (theta === Infinity) return null;   // no acotado: imposible en la fase 1 salvo por redondeo
        let sale = -1;
        for (let r = 0; r < m; r++) {
            const ur = /** @type {number} */ (u[r]);
            if (ur <= tolerancia || Math.max(0, /** @type {number} */ (xB[r])) / ur > theta * (1 + 1e-9) + 1e-14) continue;
            if (sale < 0) { sale = r; continue; }
            const jr = /** @type {number} */ (base[r]), js = /** @type {number} */ (base[sale]), ar = jr >= nCol, as = js >= nCol;
            if (bland ? jr < js : (ar && !as) || (ar === as && jr < js)) sale = r;
        }
        degenerados = theta <= 1e-14 ? degenerados + 1 : 0;
        if (degenerados > 2 * m + 10) bland = true;
        // el pivote: x_B, B⁻¹ y la base
        for (let r = 0; r < m; r++) xB[r] = /** @type {number} */ (xB[r]) - theta * /** @type {number} */ (u[r]);
        xB[sale] = theta;
        const fs = /** @type {Float64Array} */ (Binv[sale]), us = /** @type {number} */ (u[sale]);
        for (let c = 0; c < m; c++) fs[c] = /** @type {number} */ (fs[c]) / us;
        for (let r = 0; r < m; r++) {
            if (r === sale) continue;
            const fr = /** @type {Float64Array} */ (Binv[r]), ur = /** @type {number} */ (u[r]);
            if (ur !== 0) for (let c = 0; c < m; c++) fr[c] = /** @type {number} */ (fr[c]) - ur * /** @type {number} */ (fs[c]);
        }
        const saleJ = /** @type {number} */ (base[sale]);
        if (saleJ < nCol) enBase[saleJ] = 0;
        base[sale] = entra; enBase[entra] = 1;
    }
    return null;
}
