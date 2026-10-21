// @ts-check
// core/linalg/autovalores.js — autovalores y autovectores de una matriz simétrica (Jacobi cíclico) y lo que se construye
// con ellos: el suavizado de una matriz de correlaciones que no es definida positiva (la matriz válida más cercana, con un
// piso para los autovalores) y el factor polar (la matriz ortogonal más cercana). (2026.12.25, cierre de la fase F6)
// Estaban en analizador/psicometria/algebra.js; el Simulador tenía otro Jacobi, con un criterio de parada absoluto
// (10⁻¹⁴ sobre la suma de cuadrados fuera de la diagonal, que depende de la escala), para proyectar una matriz de
// correlaciones pedida imposible: ahora usa este, con el criterio relativo a la norma de la matriz.
import { cholesky } from './cholesky.js';
import { multiplicar, traspuesta } from './matrices.js';

/** @typedef {ArrayLike<ArrayLike<number>>} MatrizLeible */

/**
 * A = V·diag(valores)·Vᵀ por el método de Jacobi cíclico (hasta 100 barridos o hasta que la suma de cuadrados fuera de la
 * diagonal sea menor que 10⁻³⁰ veces la de toda la matriz): los autovalores de mayor a menor y `vectores[f]`, el
 * autovector del f-ésimo.
 * @param {MatrizLeible} A  simétrica
 * @returns {{ valores: number[], vectores: Float64Array[] }}
 */
export function autovaloresSimetrica(A) {
    const n = A.length;
    const a = Array.from({ length: n }, (_, i) => Float64Array.from(/** @type {ArrayLike<number>} */ (A[i])));
    const V = Array.from({ length: n }, (_, i) => { const f = new Float64Array(n); f[i] = 1; return f; });
    /** @param {number} i @param {number} j */
    const x = (i, j) => /** @type {number} */ (/** @type {Float64Array} */ (a[i])[j]);
    let norma = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) norma += x(i, j) * x(i, j);
    for (let barrido = 0; barrido < 100; barrido++) {
        let fuera = 0;
        for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) fuera += x(p, q) * x(p, q);
        if (fuera <= 1e-30 * norma || fuera === 0) break;
        for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) {
            const ap = /** @type {Float64Array} */ (a[p]), aq = /** @type {Float64Array} */ (a[q]), apq = /** @type {number} */ (ap[q]);
            if (Math.abs(apq) < 1e-300) continue;
            const theta = (/** @type {number} */ (aq[q]) - /** @type {number} */ (ap[p])) / (2 * apq);
            const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
            const c = 1 / Math.sqrt(t * t + 1), s = t * c;
            for (let k = 0; k < n; k++) {
                if (k === p || k === q) continue;
                const ak = /** @type {Float64Array} */ (a[k]), akp = /** @type {number} */ (ak[p]), akq = /** @type {number} */ (ak[q]);
                ak[p] = ap[k] = c * akp - s * akq;
                ak[q] = aq[k] = s * akp + c * akq;
            }
            ap[p] = /** @type {number} */ (ap[p]) - t * apq; aq[q] = /** @type {number} */ (aq[q]) + t * apq; ap[q] = aq[p] = 0;
            for (let k = 0; k < n; k++) {
                const Vk = /** @type {Float64Array} */ (V[k]), vp = /** @type {number} */ (Vk[p]), vq = /** @type {number} */ (Vk[q]);
                Vk[p] = c * vp - s * vq; Vk[q] = s * vp + c * vq;
            }
        }
    }
    const orden = Array.from({ length: n }, (_, i) => i).sort((i, j) => x(j, j) - x(i, i));
    return { valores: orden.map(i => x(i, i)), vectores: orden.map(i => Float64Array.from(V, fila => /** @type {number} */ (fila[i]))) };
}

/**
 * Suavizado por autovalores de una matriz de correlaciones: los autovalores menores que `minimo` pasan a `minimo` y la
 * matriz se reescala a diagonal unitaria. Si ya es definida positiva con ese margen (autovalor mínimo ≥ minimo), se
 * devuelve una copia intacta. La suavizada es simétrica exacta: cada elemento se calcula una vez (el triángulo superior,
 * con la aritmética de siempre) y se refleja; antes, el inferior se calculaba aparte y podía diferir en el último bit.
 * @param {MatrizLeible} R
 * @param {number} [minimo]
 * @returns {{ R: number[][], suavizada: boolean, minAutovalor: number }}
 */
export function suavizarCorrelacion(R, minimo = 1e-6) {
    const { valores, vectores } = autovaloresSimetrica(R);
    const minAutovalor = /** @type {number} */ (valores[valores.length - 1]);
    if (minAutovalor >= minimo) return { R: Array.from({ length: R.length }, (_, i) => Array.from(/** @type {ArrayLike<number>} */ (R[i]))), suavizada: false, minAutovalor };
    const n = R.length, e = valores.map(v => Math.max(v, minimo));
    /** @param {number} f @param {number} i */
    const v = (f, i) => /** @type {number} */ (/** @type {Float64Array} */ (vectores[f])[i]);
    /** @type {number[][]} */ const S = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) for (let j = i; j < n; j++) {
        let s = 0;
        for (let f = 0; f < n; f++) s += v(f, i) * /** @type {number} */ (e[f]) * v(f, j);
        /** @type {number[]} */ (S[i])[j] = /** @type {number[]} */ (S[j])[i] = s;
    }
    const d = S.map((f, i) => Math.sqrt(/** @type {number} */ (f[i])));
    return { R: S.map((f, i) => f.map((x, j) => (i === j ? 1 : x / (/** @type {number} */ (d[i]) * /** @type {number} */ (d[j]))))), suavizada: true, minAutovalor };
}

/**
 * ¿Es R − margen·I definida positiva (todos los autovalores mayores que el margen)? Con un Cholesky: mucho más barato que
 * Jacobi.
 * @param {MatrizLeible} R
 * @param {number} [margen]
 * @returns {boolean}
 */
export function definidaPositivaCon(R, margen = 1e-6) {
    return cholesky(Array.from({ length: R.length }, (_, i) => Array.from(/** @type {ArrayLike<number>} */ (R[i]), (v, j) => (i === j ? v - margen : v)))) !== null;
}

/**
 * Factor polar U·Vᵀ de X (la matriz ortogonal más cercana): X·(XᵀX)^(−1/2).
 * @param {ArrayLike<number>[]} X
 * @returns {number[][]}
 */
export function factorPolar(X) {
    const { valores, vectores } = autovaloresSimetrica(multiplicar(traspuesta(X), X));
    const n = /** @type {ArrayLike<number>} */ (X[0]).length;
    /** @param {number} f @param {number} i */
    const v = (f, i) => /** @type {number} */ (/** @type {Float64Array} */ (vectores[f])[i]);
    const raizInv = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => { let s = 0; for (let f = 0; f < n; f++) s += v(f, i) * v(f, j) / Math.sqrt(/** @type {number} */ (valores[f])); return s; }));
    return multiplicar(X, raizInv);
}
