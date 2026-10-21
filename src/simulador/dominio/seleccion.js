// @ts-check
// simulador/dominio/seleccion.js — restricción de rango por selección de la muestra (Atlas de relaciones, dimensión B3;
// sin DOM). La base contiene solo a los seleccionados por su puntuación en X (el p superior o inferior de la población).
// La selección directa sobre X reduce su DE (u = DE seleccionada / DE poblacional) y atenúa sus correlaciones SIN cambiar
// la recta de regresión de Y sobre X (Thorndike, 1949, Caso II):
//   r = ρ·u / √(1 − ρ² + ρ²u²)      ρ = (r/u) / √(1 − r² + r²/u²)
// Lo esperado tras la selección se calcula con el propio modelo generador: drivers con la matriz intermedia (su
// factorización), selección por el driver de X y la forma de cada variable, en una simulación determinista; vale para
// cualquier forma marginal y, con formas normales, coincide con las fórmulas cerradas de Pearson y Lawley.
import { cuantilNormal, densidadNormal } from '../../core/stats/numerico.js';
import { choleskyForzado } from '../../core/linalg/cholesky.js';
import { mulberry32 } from '../../core/random/mulberry32.js';
import { generadorNormales } from '../../core/random/normal.js';

/**
 * @param {number} rho  r en la población
 * @param {number} u  DE seleccionada / DE poblacional de X
 * @returns {number}
 */
export const atenuarThorndike = (rho, u) => (rho * u) / Math.sqrt(1 - rho * rho + rho * rho * u * u);
/**
 * @param {number} r  r en la muestra seleccionada
 * @param {number} u
 * @returns {number}
 */
export const corregirThorndike = (r, u) => (r / u) / Math.sqrt(1 - r * r + (r * r) / (u * u));
// fiabilidad tras la selección con la varianza de error constante: 1 − (1 − α)·σ²_pob/σ²_sel
/**
 * @param {number} alfa
 * @param {number} razonVarianzas  σ²_sel / σ²_pob
 * @returns {number}
 */
export const alfaTrasSeleccion = (alfa, razonVarianzas) => 1 - (1 - alfa) / razonVarianzas;
// casos de la población que hay que generar para quedarse con n seleccionados
/**
 * @param {number} n
 * @param {number} p  proporción seleccionada
 * @returns {number}
 */
export const tamanoPoblacion = (n, p) => Math.ceil(n / p);

// inversa de la normal, del núcleo único (core/stats/numerico.js: AS241, error relativo < 1e-16)
/**
 * @param {number} q  en (0, 1)
 * @returns {number}
 */
function normalInversa(q) { return cuantilNormal(q); }
// u con X normal (fórmula cerrada de la normal truncada): la usa la nota de la interfaz
/**
 * @param {number} p
 * @returns {number}
 */
export function uSeleccionNormal(p) {
    const c = normalInversa(1 - p), lambda = densidadNormal(c) / p;   // (2026.12.25) la densidad del núcleo
    return Math.sqrt(Math.max(0, 1 + c * lambda - lambda * lambda));
}
// índices (en orden de generación) de los n casos con los valores más altos (o más bajos) de la variable de selección
/**
 * @param {ArrayLike<number>} valores
 * @param {number} n
 * @param {string} lado  'superior' o 'inferior'
 * @returns {number[]}
 */
export function indicesSeleccionados(valores, n, lado) {
    const idx = Array.from({ length: valores.length }, (_, i) => i);
    idx.sort((a, b) => (lado === 'inferior' ? valores[a] - valores[b] : valores[b] - valores[a]) || a - b);
    return idx.slice(0, n).sort((a, b) => a - b);
}
// Lo esperado tras la selección, en unidades estandarizadas de cada variable (media 0 y DE 1 en la población): medias, DE y
// correlaciones de las formas transformadas. R* = L·Lᵀ se reordena con X delante: su factorización da Z_X = ε₀ y el resto
// condicionado a ε₀, así que la cola seleccionada se muestrea DIRECTAMENTE, sin rechazo, con cuantiles estratificados de
// la normal truncada (los momentos de X salen casi exactos y el coste no depende de p); solo los residuos son aleatorios.
// Con k = 100 000, el error de Monte Carlo de una r entre variables no seleccionadas es ≈ (1 − r²)/√k ≈ .003
export const K_ESPERADO = 100000;
/**
 * Lo esperado tras la selección, en unidades estandarizadas de cada variable.
 * @typedef {object} EsperadoSeleccion
 * @property {number[]} medias
 * @property {number[]} des
 * @property {number[][]} corr
 * @property {number} k  puntos de la simulación
 * @property {number[]} curtosis  de cada variable en la muestra seleccionada
 * @property {(i: number, n: number) => number} eeDE  error típico de la DE con n casos
 * @property {(i: number, j: number, n: number) => number} eeR  error típico de la r con n casos
 */
/**
 * @param {{ L: ArrayLike<ArrayLike<number>>, iSeleccion: number, lado: string, p: number, transformaciones: Array<(z: number) => number>, k?: number, semilla?: number }} opciones  L, la factorización de la matriz intermedia
 * @returns {EsperadoSeleccion}
 */
export function esperadoTrasSeleccion({ L, iSeleccion, lado, p, transformaciones, k = K_ESPERADO, semilla = 20261108 }) {
    const m = L.length, orden = [iSeleccion, ...Array.from({ length: m }, (_, i) => i).filter(i => i !== iSeleccion)];
    const R = (/** @type {number} */ i, /** @type {number} */ j) => { let s = 0; for (let t = 0; t <= Math.min(i, j); t++) s += L[i][t] * L[j][t]; return s; };
    // (2026.12.25) el Cholesky forzado del núcleo único (con un piso de 10⁻¹² para los pivotes); antes, una copia
    const Lp = choleskyForzado(orden.map(a => orden.map(b => R(a, b))), 1e-12).L;
    // (2026.12.25) el generador y las normales por pares del núcleo único (core/random/)
    const u01 = mulberry32(semilla), normal = generadorNormales(u01);
    // se guardan los valores (k × m) para los momentos de cuarto orden: la cola seleccionada es asimétrica (tiende a una
    // exponencial cuanto más extrema) y sus estadísticos varían más que en una normal (revisión 2026.11.09: con errores
    // típicos de la normal, 2 de 20 informes daban una falsa alarma con el 20 % inferior)
    const valores = new Float64Array(k * m), z = new Float64Array(m), s1 = new Float64Array(m);
    for (let c = 0; c < k; c++) {
        const q = (c + 0.5) / k;
        z[0] = lado === 'inferior' ? normalInversa(p * q) : normalInversa(1 - p + p * q);
        for (let i = 1; i < m; i++) z[i] = normal();
        for (let i = 0; i < m; i++) { let s = 0; for (let j = 0; j <= i; j++) s += Lp[i][j] * z[j]; const t = transformaciones[orden[i]](s); valores[c * m + orden[i]] = t; s1[orden[i]] += t; }
    }
    const medias = Array.from(s1, s => s / k), c2 = new Float64Array(m * m);
    for (let c = 0; c < k; c++) for (let i = 0; i < m; i++) { const di = valores[c * m + i] - medias[i]; for (let j = 0; j <= i; j++) c2[i * m + j] += di * (valores[c * m + j] - medias[j]); }
    const cov = (/** @type {number} */ i, /** @type {number} */ j) => c2[Math.max(i, j) * m + Math.min(i, j)] / k, des = medias.map((_, i) => Math.sqrt(Math.max(0, cov(i, i))));
    const corr = medias.map((_, i) => medias.map((__, j) => (i === j ? 1 : cov(i, j) / (des[i] * des[j] || 1))));
    // momentos de las variables ESTANDARIZADAS: curtosis κ de cada una y, por pareja, el factor de la varianza asintótica de r
    // con datos no normales: (1 + r²/2)·μ22 − r·(μ31 + μ13) + (r²/4)·(μ40 + μ04), que con normales es (1 − r²)²
    const m4 = new Float64Array(m), m22 = new Float64Array(m * m), m31 = new Float64Array(m * m);
    for (let c = 0; c < k; c++) for (let i = 0; i < m; i++) {
        const xi = (valores[c * m + i] - medias[i]) / (des[i] || 1), xi2 = xi * xi;
        m4[i] += xi2 * xi2;
        for (let j = 0; j < m; j++) { if (j === i) continue; const xj = (valores[c * m + j] - medias[j]) / (des[j] || 1); m22[i * m + j] += xi2 * xj * xj; m31[i * m + j] += xi2 * xi * xj; }
    }
    const curtosis = Array.from(m4, s => s / k);
    const factorR = (/** @type {number} */ i, /** @type {number} */ j) => { const r = corr[i][j], u22 = m22[i * m + j] / k, u31 = m31[i * m + j] / k, u13 = m31[j * m + i] / k; return Math.max(1e-6, (1 + r * r / 2) * u22 - r * (u31 + u13) + (r * r / 4) * (curtosis[i] + curtosis[j])); };
    return {
        medias, des, corr, k, curtosis,
        // errores típicos de muestreo con n casos (en unidades estandarizadas de la variable para la DE)
        eeDE: (i, n) => des[i] * Math.sqrt(Math.max(0, curtosis[i] - 1) / (4 * n)),
        eeR: (i, j, n) => Math.sqrt(factorR(i, j) / n)
    };
}
