// @ts-check
// core/linalg/cholesky.js — la factorización de Cholesky ÚNICA del programa y lo que se calcula con ella: el factor
// estricto (null si la matriz no es definida positiva, con una tolerancia relativa o absoluta opcional), el forzado del
// Simulador (nunca falla: un pivote menor que el piso se sustituye por él y se informa, como con una correlación pedida
// imposible), la inversa de un factor triangular inferior, la inversa de una matriz definida positiva (L⁻ᵀ·L⁻¹) y su
// log-determinante. (2026.12.25, cierre de la fase F6) Había seis factorizaciones: la del núcleo (2026.12.13), la forzada y
// la comprobación del Simulador, las de la RESET del cribado y de las confirmaciones de forma, y la de la selección del
// Simulador, con dos aritméticas. Cada elemento se calcula ahora como lo hacía el generador del Simulador: el de A menos la
// suma de los productos de lo ya calculado (primero la suma, después una resta), de modo que las bases que genera con una
// semilla no cambian. Las demás (la del núcleo, la de la selección y las del Analizador) restaban los productos uno a uno, y
// su factor cambia en las últimas cifras, tanto más cuanto peor condicionada está la matriz (en la selección, solo lo
// esperado del informe, que se muestra redondeado). Sin dependencias.

/** @typedef {ArrayLike<ArrayLike<number>>} MatrizLeible */

/**
 * El recorrido común de las dos factorizaciones: la misma aritmética en las dos.
 * @template {number[] | Float64Array} F
 * @param {MatrizLeible} A
 * @param {(i: number, d: number) => number | null} pivote  la raíz del pivote d de la fila i, o null para abandonar
 * @param {(n: number) => F} crearFila
 * @returns {F[] | null}
 */
function factorizar(A, pivote, crearFila) {
    const n = A.length, L = Array.from({ length: n }, () => crearFila(n));
    for (let i = 0; i < n; i++) {
        const Ai = /** @type {ArrayLike<number>} */ (A[i]), Li = /** @type {F} */ (L[i]);
        for (let j = 0; j <= i; j++) {
            const Lj = /** @type {F} */ (L[j]);
            let suma = 0;
            for (let k = 0; k < j; k++) suma += /** @type {number} */ (Li[k]) * /** @type {number} */ (Lj[k]);
            if (i === j) {
                const raiz = pivote(i, /** @type {number} */ (Ai[i]) - suma);
                if (raiz === null) return null;
                Li[i] = raiz;
            } else Li[j] = (/** @type {number} */ (Ai[j]) - suma) / (/** @type {number} */ (Lj[j]) || 1e-9);
        }
    }
    return L;
}

/**
 * Factor de Cholesky L (A = L·Lᵀ), o null si A no es definida positiva: un pivote que no supera 0 o, con `tolerancia`,
 * que no supera tolerancia·|aᵢᵢ| (relativa; |aᵢᵢ| = 0 cuenta como 1) o la propia tolerancia (si `absoluta`). Un pivote
 * no numérico también falla.
 * @param {MatrizLeible} A  simétrica (se lee su triángulo inferior)
 * @param {{ tolerancia?: number, absoluta?: boolean }} [opciones]
 * @returns {Float64Array[] | null}
 */
export function cholesky(A, { tolerancia = 0, absoluta = false } = {}) {
    return factorizar(A, (i, d) => {
        const umbral = tolerancia > 0 ? (absoluta ? tolerancia : tolerancia * (Math.abs(/** @type {number} */ (/** @type {ArrayLike<number>} */ (A[i])[i])) || 1)) : 0;
        return d > umbral ? Math.sqrt(d) : null;
    }, n => new Float64Array(n));
}

/**
 * Cholesky forzado (el del Simulador): nunca falla. Un pivote menor que `piso` se sustituye por él (la matriz queda
 * «forzada»: lo pedido era imposible) y uno que no es positivo marca la matriz como no definida positiva. Filas de tipo
 * Array, como siempre.
 * @param {MatrizLeible} A
 * @param {number} [piso]
 * @returns {{ L: number[][], forzada: boolean, noDefinidaPositiva: boolean }}
 */
export function choleskyForzado(A, piso = 1e-9) {
    let forzada = false, noDefinidaPositiva = false;
    const L = /** @type {number[][]} */ (factorizar(A, (_, d) => {
        if (d <= 0) noDefinidaPositiva = true;
        if (d < piso) forzada = true;
        return Math.sqrt(Math.max(d, piso));
    }, n => new Array(n).fill(0)));
    return { L, forzada, noDefinidaPositiva };
}

/**
 * ¿Es A definida positiva? (su factorización estricta, con las mismas opciones, no falla).
 * @param {MatrizLeible} A
 * @param {{ tolerancia?: number, absoluta?: boolean }} [opciones]
 * @returns {boolean}
 */
export function esDefinidaPositiva(A, opciones) { return cholesky(A, opciones) !== null; }

/**
 * Inversa de una matriz triangular inferior S (la de un factor de Cholesky). Una diagonal nula o no numérica se toma como
 * 10⁻⁹, la guarda del Simulador (un factor forzado nunca la tiene; uno estricto, tampoco). Filas de tipo Array.
 * @param {MatrizLeible} S
 * @returns {number[][]}
 */
export function inversaTriangularInferior(S) {
    const m = S.length, inv = Array.from({ length: m }, () => new Array(m).fill(0));
    for (let i = 0; i < m; i++) {
        const Si = /** @type {ArrayLike<number>} */ (S[i]), invI = /** @type {number[]} */ (inv[i]), d = /** @type {number} */ (Si[i]) || 1e-9;
        invI[i] = 1 / d;
        for (let j = 0; j < i; j++) {
            let s = 0;
            for (let k = j; k < i; k++) s += /** @type {number} */ (Si[k]) * /** @type {number} */ (/** @type {number[]} */ (inv[k])[j]);
            invI[j] = -s / d;
        }
    }
    return inv;
}

/**
 * Producto (L⁻¹)ᵀ·L⁻¹ de la inversa de un factor triangular inferior: la inversa de A = L·Lᵀ. Solo suma los términos no
 * nulos (desde máx(i, j)), con el mismo resultado que la suma completa.
 * @param {MatrizLeible} Li
 * @returns {Float64Array[]}
 */
export function productoTriangularTraspuesto(Li) {
    const p = Li.length;
    return Array.from({ length: p }, (_, i) => Float64Array.from({ length: p }, (_, j) => {
        let s = 0;
        for (let k = Math.max(i, j); k < p; k++) {
            const fila = /** @type {ArrayLike<number>} */ (Li[k]);
            s += /** @type {number} */ (fila[i]) * /** @type {number} */ (fila[j]);
        }
        return s;
    }));
}

/**
 * Inversa de una matriz definida positiva por su factor de Cholesky (L⁻ᵀ·L⁻¹), o null si no lo es (con las opciones de
 * `cholesky`).
 * @param {MatrizLeible} A
 * @param {{ tolerancia?: number, absoluta?: boolean }} [opciones]
 * @returns {Float64Array[] | null}
 */
export function inversaDefinidaPositiva(A, opciones) {
    const L = cholesky(A, opciones);
    return L ? productoTriangularTraspuesto(inversaTriangularInferior(L)) : null;
}

/**
 * log|A| a partir de su factor de Cholesky: 2·Σ ln Lᵢᵢ.
 * @param {MatrizLeible} L
 * @returns {number}
 */
export function logDeterminanteDeFactor(L) {
    let s = 0;
    for (let i = 0; i < L.length; i++) s += 2 * Math.log(/** @type {number} */ (/** @type {ArrayLike<number>} */ (L[i])[i]));
    return s;
}

/**
 * log|A| de una matriz definida positiva, o null si no lo es.
 * @param {MatrizLeible} A
 * @returns {number | null}
 */
export function logDeterminante(A) {
    const L = cholesky(A);
    return L ? logDeterminanteDeFactor(L) : null;
}

/**
 * Inversa y log-determinante de una matriz definida positiva con una sola factorización, o null si no lo es.
 * @param {MatrizLeible} A
 * @returns {{ inv: Float64Array[], logDet: number } | null}
 */
export function inversaYLogDet(A) {
    const L = cholesky(A);
    if (!L) return null;
    return { inv: productoTriangularTraspuesto(inversaTriangularInferior(L)), logDet: logDeterminanteDeFactor(L) };
}
