// @ts-check
// core/linalg/matrices.js — las operaciones elementales con matrices densas (filas de números): ceros, identidad,
// traspuesta y producto. (2026.12.25, cierre de la fase F6) Estaban en analizador/psicometria/algebra.js y, repetidas,
// en el motor del SEM (sem-motor.js). Sin dependencias.

/** @typedef {ArrayLike<ArrayLike<number>>} MatrizLeible */

/**
 * Matriz r × c de ceros.
 * @param {number} r
 * @param {number} c
 * @returns {number[][]}
 */
export function ceros(r, c) { return Array.from({ length: r }, () => new Array(c).fill(0)); }

/**
 * Matriz identidad n × n.
 * @param {number} n
 * @returns {number[][]}
 */
export function identidad(n) { return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))); }

/**
 * Traspuesta de A (al menos una fila).
 * @param {ArrayLike<number>[]} A
 * @returns {number[][]}
 */
export function traspuesta(A) {
    return Array.from(/** @type {ArrayLike<number>} */ (A[0]), (_, j) => A.map(f => /** @type {number} */ (f[j])));
}

/**
 * Producto A·B (A de n × k, B de k × m). Salta los ceros de A: con matrices de diseño o de selección dispersas ahorra la
 * mayor parte del trabajo y el resultado es el mismo.
 * @param {MatrizLeible} A
 * @param {MatrizLeible} B
 * @returns {number[][]}
 */
export function multiplicar(A, B) {
    const n = A.length, k = B.length, m = /** @type {ArrayLike<number>} */ (B[0]).length;
    const C = ceros(n, m);
    for (let i = 0; i < n; i++) {
        const Ci = /** @type {number[]} */ (C[i]), Ai = /** @type {ArrayLike<number>} */ (A[i]);
        for (let t = 0; t < k; t++) {
            const a = /** @type {number} */ (Ai[t]);
            if (a === 0) continue;
            const Bt = /** @type {ArrayLike<number>} */ (B[t]);
            for (let j = 0; j < m; j++) Ci[j] = /** @type {number} */ (Ci[j]) + a * /** @type {number} */ (Bt[j]);
        }
    }
    return C;
}
