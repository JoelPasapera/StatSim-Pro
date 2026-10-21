// @ts-check
// core/linalg/gauss.js — eliminación gaussiana con pivoteo parcial para matrices cuadradas cualesquiera: la inversa de
// Gauss-Jordan con el log-determinante y su signo, y el determinante. (2026.12.25, cierre de la fase F6) Estaban en
// analizador/psicometria/algebra.js (la inversa general, con un pivote mínimo de 10⁻¹⁴), en el motor del SEM (la inversa
// con el log-determinante, con 10⁻¹²) y en la regresión (el determinante de la Λ de Wilks). Para una matriz definida
// positiva, mejor su factor de Cholesky (cholesky.js). También la usa el símplex (simplex.js), que tenía su propia copia.
// Sin dependencias.

/** @typedef {ArrayLike<ArrayLike<number>>} MatrizLeible */

/**
 * Inversa de una matriz cuadrada por Gauss-Jordan con pivoteo parcial, con ln|det| y su signo; null si algún pivote
 * tiene un valor absoluto menor que `pivoteMinimo` (la matriz es singular a efectos prácticos) o no es numérico.
 * @param {MatrizLeible} A
 * @param {number} pivoteMinimo
 * @returns {{ inversa: number[][], logDetAbs: number, signo: number } | null}
 */
export function gaussJordan(A, pivoteMinimo) {
    const n = A.length;
    const M = Array.from({ length: n }, (_, i) => [...Array.from(/** @type {ArrayLike<number>} */ (A[i])), ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
    let logDetAbs = 0, signo = 1;
    for (let c = 0; c < n; c++) {
        let piv = c;
        for (let r = c + 1; r < n; r++) if (Math.abs(/** @type {number} */ (/** @type {number[]} */ (M[r])[c])) > Math.abs(/** @type {number} */ (/** @type {number[]} */ (M[piv])[c]))) piv = r;
        if (!(Math.abs(/** @type {number} */ (/** @type {number[]} */ (M[piv])[c])) >= pivoteMinimo)) return null;   // también NaN
        if (piv !== c) { const t = /** @type {number[]} */ (M[c]); M[c] = /** @type {number[]} */ (M[piv]); M[piv] = t; signo = -signo; }
        const Mc = /** @type {number[]} */ (M[c]), d = /** @type {number} */ (Mc[c]);
        logDetAbs += Math.log(Math.abs(d));
        if (d < 0) signo = -signo;
        for (let j = 0; j < 2 * n; j++) Mc[j] = /** @type {number} */ (Mc[j]) / d;
        for (let r = 0; r < n; r++) {
            if (r === c) continue;
            const Mr = /** @type {number[]} */ (M[r]), f = /** @type {number} */ (Mr[c]);
            if (f === 0) continue;
            for (let j = 0; j < 2 * n; j++) Mr[j] = /** @type {number} */ (Mr[j]) - f * /** @type {number} */ (Mc[j]);
        }
    }
    return { inversa: M.map(f => f.slice(n)), logDetAbs, signo };
}

/**
 * Inversa de una matriz cuadrada cualquiera (Gauss-Jordan con pivoteo parcial); null si es singular (un pivote menor
 * que 10⁻¹⁴ en valor absoluto).
 * @param {MatrizLeible} A
 * @returns {number[][] | null}
 */
export function inversaGeneral(A) {
    const r = gaussJordan(A, 1e-14);
    return r ? r.inversa : null;
}

/**
 * Determinante de una matriz cuadrada por eliminación gaussiana con pivoteo parcial (el producto de los pivotes, con el
 * signo de las permutaciones); 0 si un pivote es menor que 10⁻³⁰⁰ en valor absoluto.
 * @param {MatrizLeible} M
 * @returns {number}
 */
export function determinante(M) {
    const n = M.length, A = Array.from({ length: n }, (_, i) => Array.from(/** @type {ArrayLike<number>} */ (M[i])));
    let det = 1;
    for (let c = 0; c < n; c++) {
        let piv = c;
        for (let r = c + 1; r < n; r++) if (Math.abs(/** @type {number} */ (/** @type {number[]} */ (A[r])[c])) > Math.abs(/** @type {number} */ (/** @type {number[]} */ (A[piv])[c]))) piv = r;
        if (Math.abs(/** @type {number} */ (/** @type {number[]} */ (A[piv])[c])) < 1e-300) return 0;
        if (piv !== c) { const t = /** @type {number[]} */ (A[c]); A[c] = /** @type {number[]} */ (A[piv]); A[piv] = t; det = -det; }
        const Ac = /** @type {number[]} */ (A[c]), pivote = /** @type {number} */ (Ac[c]);
        det *= pivote;
        for (let r = c + 1; r < n; r++) {
            const Ar = /** @type {number[]} */ (A[r]), f = /** @type {number} */ (Ar[c]) / pivote;
            for (let j = c; j < n; j++) Ar[j] = /** @type {number} */ (Ar[j]) - f * /** @type {number} */ (Ac[j]);
        }
    }
    return det;
}
