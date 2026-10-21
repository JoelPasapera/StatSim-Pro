// @ts-check
// core/stats/orden.js — estadísticos de orden: el k-ésimo menor por selección, la mediana (de una serie cualquiera o ya
// ordenada), una escala robusta, los rangos con empates promediados y los cuantiles de tipo 7. (2026.12.12) Antes, los
// rangos en ocho sitios, los cuantiles en ocho y la mediana en cuatro; (2026.12.24) la de una serie ya ordenada, en tres;
// (2026.12.25) la búsqueda binaria en una serie ordenada, en tres, y la selección del MCD, con su propia copia.
// Los NaN no tienen orden definido: quien llama los filtra antes.

/**
 * k-ésimo menor (0-based) por selección rápida (Hoare con pivote por mediana de tres, O(n) en promedio). REORDENA `a`:
 * pásale una copia de trabajo. Devuelve exactamente un elemento de la serie (el mismo que daría ordenarla).
 * @param {Float64Array | number[]} a
 * @param {number} k
 * @returns {number}
 */
export function kEsimo(a, k) {
    let lo = 0, hi = a.length - 1;
    while (hi > lo) {
        const m = (lo + hi) >> 1, v1 = /** @type {number} */ (a[lo]), v2 = /** @type {number} */ (a[m]), v3 = /** @type {number} */ (a[hi]);
        const piv = v1 < v2 ? (v2 < v3 ? v2 : v1 < v3 ? v3 : v1) : (v1 < v3 ? v1 : v2 < v3 ? v3 : v2);
        let i = lo, j = hi;
        while (i <= j) {
            while (/** @type {number} */ (a[i]) < piv) i++;
            while (/** @type {number} */ (a[j]) > piv) j--;
            if (i <= j) { const t = /** @type {number} */ (a[i]); a[i] = /** @type {number} */ (a[j]); a[j] = t; i++; j--; }
        }
        if (k <= j) hi = j; else if (k >= i) lo = i; else return /** @type {number} */ (a[k]);
    }
    return /** @type {number} */ (a[k]);
}

/**
 * Mediana (con n par, la media de los dos centrales), por selección: no ordena la serie ni la modifica.
 * @param {ArrayLike<number>} v
 * @returns {number}
 */
export function mediana(v) {
    const n = v.length, h = n >> 1;
    if (!n) return NaN;
    const alto = kEsimo(Float64Array.from(v), h);
    return n % 2 ? alto : (kEsimo(Float64Array.from(v), h - 1) + alto) / 2;
}

/**
 * (2026.12.24) Mediana de una serie YA ORDENADA de menor a mayor (con n par, la media de los dos centrales; NaN si está
 * vacía): para quien ordena la serie de todos modos (los descriptivos del Analizador, el informe del Simulador y el MCD).
 * Da el mismo valor que mediana(), que elige los mismos elementos sin ordenar (a lo sumo, otro signo de un cero).
 * @param {ArrayLike<number>} ordenados
 * @returns {number}
 */
export function medianaOrdenada(ordenados) {
    const n = ordenados.length;
    if (!n) return NaN;
    return n % 2 === 0
        ? (/** @type {number} */ (ordenados[n / 2 - 1]) + /** @type {number} */ (ordenados[n / 2])) / 2
        : /** @type {number} */ (ordenados[Math.floor(n / 2)]);
}

/**
 * (2026.12.23) Una escala robusta: la mediana de las desviaciones absolutas NO NULAS al centro (por defecto, la mediana):
 * en una variable continua, la MAD sin su constante; en una ficticia 0/1, 1 aunque más de la mitad de sus valores sean
 * iguales; 1 si la serie es constante. No la mueve un valor extremo (un código de perdido de 10⁸ multiplica la DE por
 * 10⁷). La usa la prueba exacta de la separación (core/stats/separacion.js) para escalar los predictores.
 * @param {ArrayLike<number>} v
 * @param {number} [centro]
 * @returns {number}
 */
export function escalaRobusta(v, centro = mediana(v)) {
    const desv = [];
    for (let i = 0; i < v.length; i++) { const a = Math.abs(/** @type {number} */ (v[i]) - centro); if (a > 0) desv.push(a); }
    const s = desv.length ? mediana(desv) : 1;
    return s > 0 && Number.isFinite(s) ? s : 1;
}

/**
 * Rangos de 1 a n con el rango medio para los empates (los de Spearman, Mann-Whitney y Kruskal-Wallis).
 * @param {ArrayLike<number>} v
 * @returns {Float64Array}
 */
export function rangosPromedio(v) {
    const n = v.length, o = new Uint32Array(n);
    for (let i = 0; i < n; i++) o[i] = i;
    o.sort((p, q) => /** @type {number} */ (v[p]) - /** @type {number} */ (v[q]));
    const r = new Float64Array(n);
    for (let i = 0; i < n;) {
        let j = i;
        while (j + 1 < n && v[/** @type {number} */ (o[j + 1])] === v[/** @type {number} */ (o[i])]) j++;
        const m = (i + j) / 2 + 1;
        for (let k = i; k <= j; k++) r[/** @type {number} */ (o[k])] = m;
        i = j + 1;
    }
    return r;
}

/**
 * Cuantil de tipo 7 (interpolación lineal: el de R y NumPy por defecto) de una serie YA ORDENADA de menor a mayor.
 * p se acota a [0, 1]; NaN con la serie vacía.
 * @param {ArrayLike<number>} ordenados
 * @param {number} p
 * @returns {number}
 */
export function cuantilOrdenado(ordenados, p) {
    const n = ordenados.length;
    if (!n) return NaN;
    const h = (n - 1) * Math.min(1, Math.max(0, p)), i = Math.floor(h), j = Math.min(n - 1, i + 1);
    const bajo = /** @type {number} */ (ordenados[i]);
    return bajo + (h - i) * (/** @type {number} */ (ordenados[j]) - bajo);
}

/**
 * Búsqueda binaria en una serie ordenada de menor a mayor: cuántos valores son menores que `valor` (el primer índice
 * cuyo valor no lo es).
 * @param {ArrayLike<number>} ordenados
 * @param {number} valor
 * @returns {number}
 */
export function cotaInferior(ordenados, valor) {
    let lo = 0, hi = ordenados.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (/** @type {number} */ (ordenados[m]) < valor) lo = m + 1; else hi = m; }
    return lo;
}

/**
 * Búsqueda binaria en una serie ordenada de menor a mayor: cuántos valores son menores o iguales que `valor` (el primer
 * índice cuyo valor es mayor). Con `cotaInferior`, la diferencia cuenta los empates.
 * @param {ArrayLike<number>} ordenados
 * @param {number} valor
 * @returns {number}
 */
export function cotaSuperior(ordenados, valor) {
    let lo = 0, hi = ordenados.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (/** @type {number} */ (ordenados[m]) <= valor) lo = m + 1; else hi = m; }
    return lo;
}
