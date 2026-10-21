// @ts-check
// core/linalg/qr.js — factorización QR de Householder (2026.12.21), la base de los mínimos cuadrados del programa
// (core/stats/mco.js). Resuelve el problema sobre X sin formar X'X, cuyo número de condición es el CUADRADO del de X: con
// un polinomio cúbico de un año (1990–2024), X'X es singular en doble precisión y X todavía no; las ecuaciones normales
// que se usaban hasta la 2026.12.20 daban allí una suma de cuadrados residual 52 veces mayor que la mínima sin avisar.
// El rango se decide con el criterio de R (el pivoteo limitado de dqrdc2, LINPACK, el de lm): las columnas se procesan
// en su orden, y una cuya parte no explicada por las anteriores tiene una norma menor que tolerancia × su norma original
// es colineal y pasa al final. Es invariante a la escala de cada columna (el de las ecuaciones normales, un pivote menor
// que 10⁻¹², dependía de las unidades). Sin dependencias.

/**
 * La factorización: los reflectores, la R y el rango.
 * @typedef {{ n: number, p: number, rango: number, columnas: Float64Array[], tau: Float64Array, diagonal: Float64Array,
 *   pivote: number[], colineales: number[] }} FactorQR
 *   columnas[l] guarda, en las filas l..n − 1, el vector del reflector l (y, en las filas < l, la columna l de R);
 *   diagonal[l] = R[l][l]; pivote[l] = la columna original que ocupa la posición l; colineales = las columnas originales
 *   declaradas colineales, en el orden en que se detectaron.
 */

/**
 * Norma euclídea de las filas desde..n − 1 de una columna.
 * @param {Float64Array} c
 * @param {number} desde
 * @returns {number}
 */
function normaDesde(c, desde) {
    let s = 0;
    for (let i = desde; i < c.length; i++) s += c[i] * c[i];
    return Math.sqrt(s);
}

/**
 * Factorización QR de Householder de la matriz n × p dada por columnas, con el pivoteo limitado de dqrdc2.
 * @param {ArrayLike<number>[]} columnas p columnas de longitud n (no se modifican)
 * @param {{ tolerancia?: number }} [opciones] tolerancia relativa de colinealidad (1e-7, la de lm de R)
 * @returns {FactorQR}
 */
export function factorQR(columnas, { tolerancia = 1e-7 } = {}) {
    const p = columnas.length, n = p ? /** @type {ArrayLike<number>} */ (columnas[0]).length : 0;
    /** @type {Float64Array[]} */ const A = columnas.map(c => Float64Array.from(c));
    const original = A.map(c => normaDesde(c, 0) || 1);   // una columna nula cuenta como de norma 1 (dqrdc2): es colineal
    const pivote = Array.from({ length: p }, (_, j) => j), colineales = [];
    const tau = new Float64Array(p), diagonal = new Float64Array(p);
    let k = p;   // las posiciones k..p − 1 son las colineales
    const lmax = Math.min(n, p);
    let l = 0;
    for (; l < lmax; l++) {
        while (l < k && !(normaDesde(/** @type {Float64Array} */ (A[l]), l) >= tolerancia * /** @type {number} */ (original[l]))) {
            // la columna l es (numéricamente) combinación lineal de las anteriores: al final
            A.push(/** @type {Float64Array} */ (A.splice(l, 1)[0])); original.push(/** @type {number} */ (original.splice(l, 1)[0]));
            const q = /** @type {number} */ (pivote.splice(l, 1)[0]); pivote.push(q); colineales.push(q); k--;
        }
        if (l >= k) break;
        const v = /** @type {Float64Array} */ (A[l]);
        let s = 0; for (let i = l; i < n; i++) s += v[i] * v[i];
        const x0 = /** @type {number} */ (v[l]), alfa = x0 >= 0 ? -Math.sqrt(s) : Math.sqrt(s);   // el signo que evita la cancelación
        v[l] = x0 - alfa;
        const vtv = s - x0 * x0 + v[l] * v[l], t = vtv > 0 ? 2 / vtv : 0;
        tau[l] = t; diagonal[l] = alfa;
        for (let j = l + 1; j < p; j++) {
            const c = /** @type {Float64Array} */ (A[j]);
            let d = 0; for (let i = l; i < n; i++) d += v[i] * c[i];
            d *= t; for (let i = l; i < n; i++) c[i] -= d * v[i];
        }
    }
    return { n, p, rango: Math.min(k, l), columnas: A, tau, diagonal, pivote, colineales };
}

/**
 * Qᵀ·z (los reflectores aplicados en orden), sobre una copia.
 * @param {FactorQR} f
 * @param {ArrayLike<number>} z vector de longitud n
 * @returns {Float64Array}
 */
export function aplicarQt(f, z) {
    const w = Float64Array.from(z), n = f.n;
    for (let l = 0; l < f.rango; l++) {
        const v = /** @type {Float64Array} */ (f.columnas[l]), t = /** @type {number} */ (f.tau[l]);
        let d = 0; for (let i = l; i < n; i++) d += v[i] * w[i];
        d *= t; for (let i = l; i < n; i++) w[i] -= d * v[i];
    }
    return w;
}

/**
 * Q·z (los reflectores aplicados en el orden inverso), sobre una copia: deshace aplicarQt. (2026.12.25) Para los residuos
 * de una proyección (core/stats/mco.js, proyectorResiduos).
 * @param {FactorQR} f
 * @param {ArrayLike<number>} z vector de longitud n
 * @returns {Float64Array}
 */
export function aplicarQ(f, z) {
    const w = Float64Array.from(z), n = f.n;
    for (let l = f.rango - 1; l >= 0; l--) {
        const v = /** @type {Float64Array} */ (f.columnas[l]), t = /** @type {number} */ (f.tau[l]);
        let d = 0; for (let i = l; i < n; i++) d += v[i] * w[i];
        d *= t; for (let i = l; i < n; i++) w[i] -= d * v[i];
    }
    return w;
}

/**
 * Elemento R[i][j] (i ≤ j < rango) del factor triangular.
 * @param {FactorQR} f
 * @param {number} i
 * @param {number} j
 * @returns {number}
 */
export function elementoR(f, i, j) {
    return i === j ? /** @type {number} */ (f.diagonal[i]) : /** @type {number} */ (/** @type {Float64Array} */ (f.columnas[j])[i]);
}

/**
 * Solución de R·b = c (los primeros «rango» elementos de c) por sustitución hacia atrás.
 * @param {FactorQR} f
 * @param {ArrayLike<number>} c
 * @returns {Float64Array}
 */
export function resolverR(f, c) {
    const r = f.rango, b = new Float64Array(r);
    for (let i = r - 1; i >= 0; i--) {
        let s = /** @type {number} */ (c[i]);
        for (let j = i + 1; j < r; j++) s -= elementoR(f, i, j) * /** @type {number} */ (b[j]);
        b[i] = s / elementoR(f, i, i);
    }
    return b;
}

/**
 * R⁻¹, triangular superior (por sustitución hacia atrás, columna a columna).
 * @param {FactorQR} f
 * @returns {Float64Array[]} r × r, por filas
 */
function inversaR(f) {
    const r = f.rango, inv = Array.from({ length: r }, () => new Float64Array(r));
    for (let c = 0; c < r; c++) {
        for (let i = c; i >= 0; i--) {
            let s = i === c ? 1 : 0;
            for (let j = i + 1; j <= c; j++) s -= elementoR(f, i, j) * /** @type {number} */ (/** @type {Float64Array} */ (inv[j])[c]);
            /** @type {Float64Array} */ (inv[i])[c] = s / elementoR(f, i, i);
        }
    }
    return inv;
}

/**
 * Diagonal de (X'X)⁻¹ = R⁻¹R⁻ᵀ: la suma de los cuadrados de cada fila de R⁻¹ (sin formar X'X).
 * @param {FactorQR} f
 * @returns {Float64Array}
 */
export function diagonalInversaXtX(f) {
    const r = f.rango;
    return Float64Array.from(inversaR(f), fila => { let s = 0; for (let c = 0; c < r; c++) s += /** @type {number} */ (fila[c]) ** 2; return s; });
}

/**
 * (X'X)⁻¹ = R⁻¹R⁻ᵀ completa, simétrica (para las covarianzas «sándwich» y la palanca), sin formar X'X.
 * @param {FactorQR} f
 * @returns {Float64Array[]} r × r, por filas
 */
export function inversaXtX(f) {
    const r = f.rango, Ri = inversaR(f), inv = Array.from({ length: r }, () => new Float64Array(r));
    for (let a = 0; a < r; a++) for (let b = a; b < r; b++) {
        const fa = /** @type {Float64Array} */ (Ri[a]), fb = /** @type {Float64Array} */ (Ri[b]);
        let s = 0; for (let c = b; c < r; c++) s += /** @type {number} */ (fa[c]) * /** @type {number} */ (fb[c]);   // las filas de R⁻¹ son nulas antes de su diagonal
        /** @type {Float64Array} */ (inv[a])[b] = s; /** @type {Float64Array} */ (inv[b])[a] = s;
    }
    return inv;
}
