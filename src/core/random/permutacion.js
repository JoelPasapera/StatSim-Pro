// @ts-check
// core/random/permutacion.js — permutaciones aleatorias con un generador uniforme dado: el barajado de Fisher–Yates en su
// sitio (la versión de Durstenfeld, 1964) y la muestra sin reemplazo (el mismo barajado, parcial). (2026.12.25, cierre de
// la fase F6) El barajado estaba copiado en cuatro sitios del Analizador: tres pruebas por permutaciones (la condición
// necesaria de la nube, la distancia de correlación y las decisiones del diagnóstico de forma) y el análisis paralelo del
// AFE (con el entero de sfc32, ⌊siguiente()·(i + 1)⌋: los mismos números); la muestra, en el generador del Simulador. Sin
// dependencias.

/**
 * Baraja `v` en su sitio y lo devuelve: para i = n − 1, …, 1, intercambia v[i] con v[j], j = ⌊u()·(i + 1)⌋ (uniforme
 * en {0, …, i}). Todas las permutaciones son equiprobables; consume n − 1 números de `u`.
 * @template {{ length: number, [indice: number]: unknown }} V
 * @param {V} v
 * @param {() => number} u  generador uniforme de [0, 1)
 * @returns {V}
 */
export function barajar(v, u) {
    for (let i = v.length - 1; i > 0; i--) {
        const j = Math.floor(u() * (i + 1)), t = v[i];
        v[i] = v[j];
        v[j] = t;
    }
    return v;
}

/**
 * Muestra sin reemplazo de k índices de {0, …, n − 1}: los k primeros de un barajado parcial ascendente (para j = 0, …,
 * k − 1, intercambia la posición j con una uniforme de {j, …, n − 1}). O(n) de memoria y k números de `u`; k se acota a
 * [0, n]. Sustituye a ordenar con un comparador aleatorio, que no baraja uniformemente.
 * @param {number} n
 * @param {number} k
 * @param {() => number} u  generador uniforme de [0, 1)
 * @returns {Int32Array}
 */
export function muestraSinReemplazo(n, k, u) {
    const idx = new Int32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    const tope = Math.max(0, Math.min(k, n));
    for (let j = 0; j < tope; j++) {
        const r = j + Math.floor(u() * (n - j)), t = /** @type {number} */ (idx[j]);
        idx[j] = /** @type {number} */ (idx[r]);
        idx[r] = t;
    }
    return idx.subarray(0, tope);
}
