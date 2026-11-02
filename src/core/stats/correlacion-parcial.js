// @ts-check
// core/stats/correlacion-parcial.js — (2027.01.17) la correlación parcial y la semiparcial: la relación de dos variables
// descontando una o más de control. La parcial correlaciona lo que de X y de Y no explican las de control (los residuos de
// ambas, por la QR de mco.js); la semiparcial (o «parte»), Y entera con lo que de X no explican las de control: su cuadrado
// es la varianza de Y que solo X explica (la contribución única de X en la regresión de Y sobre X y las de control). Las dos
// se contrastan con la misma t, la del coeficiente de X en esa regresión, con n − 2 − q gl (q de control). El intervalo de
// la parcial, por la z de Fisher con el error típico 1/√(n − 3 − q) (el de la de Spearman, √((1 + r²/2)/(n − 3 − q)), el de
// Bonett y Wright, 2000). Con Spearman, todo sobre los rangos. Y la matriz de correlaciones parciales de un conjunto de
// variables, cada par descontando todas las demás (la inversa de la matriz de correlaciones: −Pᵢⱼ/√(PᵢᵢPⱼⱼ)).
import { correlacion, matrizCorrelaciones } from './correlacion.js';
import { rangosPromedio } from './orden.js';
import { proyectorResiduos } from './mco.js';
import { pTBilateral } from './distribuciones.js';
import { cuantilNormal } from './normal.js';
import { inversaGeneral } from '../linalg/gauss.js';

/** @typedef {ArrayLike<number>} Serie */

/**
 * La t de una correlación parcial con gl grados de libertad y su p bilateral (|r| = 1: t infinita, p = 0).
 * @param {number} r
 * @param {number} gl
 */
function pruebaParcial(r, gl) {
    if (!(gl > 0) || !Number.isFinite(r)) return { t: NaN, pValor: NaN };
    if (Math.abs(r) >= 1) return { t: Math.sign(r) * Infinity, pValor: 0 };
    const t = r * Math.sqrt(gl / (1 - r * r));
    return { t, pValor: pTBilateral(Math.abs(t), gl) };
}

/**
 * La correlación parcial y las dos semiparciales de X e Y con las variables de control Z (sin perdidos; misma longitud).
 * @param {Serie} x
 * @param {Serie} y
 * @param {Serie[]} Z las de control (una o más)
 * @param {{ spearman?: boolean, nivel?: number }} [opciones]
 * @returns {{ n: number, q: number, gl: number, ordenCero: number, parcial: number, t: number, pValor: number,
 *   ic: { inferior: number, superior: number } | null, semiparcialX: number, semiparcialY: number, nivel: number,
 *   spearman: boolean } | null} null si las de control explican del todo a X o a Y (no queda nada que correlacionar) o si
 *   hay menos casos que los necesarios (n − 3 − q ≤ 0)
 */
export function correlacionParcial(x, y, Z, { spearman = false, nivel = 0.95 } = {}) {
    const n = x.length, q = Z.length, gl = n - 2 - q;
    if (gl < 1) return null;
    const X = spearman ? rangosPromedio(x) : Float64Array.from(x), Y = spearman ? rangosPromedio(y) : Float64Array.from(y);
    const C = Z.map(z => (spearman ? rangosPromedio(z) : Float64Array.from(z)));
    const residuos = proyectorResiduos(C, n), ex = residuos(X), ey = residuos(Y);
    const r = correlacion(ex, ey);
    if (!Number.isFinite(r)) return null;
    const { t, pValor } = pruebaParcial(r, gl);
    let ic = null;
    if (n - 3 - q > 0 && Math.abs(r) < 1) {
        const ee = spearman ? Math.sqrt((1 + r * r / 2) / (n - 3 - q)) : 1 / Math.sqrt(n - 3 - q), c = cuantilNormal(1 - (1 - nivel) / 2) * ee, zf = Math.atanh(r);
        ic = { inferior: Math.tanh(zf - c), superior: Math.tanh(zf + c) };
    }
    return { n, q, gl, ordenCero: correlacion(X, Y), parcial: r, t, pValor, ic, semiparcialX: correlacion(Y, ex), semiparcialY: correlacion(X, ey), nivel, spearman };
}

/**
 * La matriz de correlaciones parciales de k variables (sin perdidos): cada par, descontando las k − 2 restantes, con su p
 * (gl = n − k). null si la matriz de correlaciones es singular (una variable es combinación de las demás).
 * @param {Serie[]} columnas
 * @param {{ spearman?: boolean }} [opciones]
 * @returns {{ parciales: number[][], pValores: number[][], gl: number } | null}
 */
export function matrizParciales(columnas, { spearman = false } = {}) {
    const k = columnas.length, n = k ? /** @type {Serie} */ (columnas[0]).length : 0, gl = n - k;
    if (k < 3 || gl < 1) return null;
    const R = matrizCorrelaciones(spearman ? columnas.map(c => rangosPromedio(c)) : columnas), P = inversaGeneral(R);
    if (!P) return null;
    const d = (/** @type {number} */ i) => /** @type {number} */ (/** @type {number[]} */ (P[i])[i]);
    if (Array.from({ length: k }, (_, i) => d(i)).some(v => !(v > 0))) return null;
    const parciales = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => (i === j ? 1 : -/** @type {number} */ (/** @type {number[]} */ (P[i])[j]) / Math.sqrt(d(i) * d(j)))));
    const pValores = parciales.map((f, i) => f.map((r, j) => (i === j ? 0 : pruebaParcial(r, gl).pValor)));
    return { parciales, pValores, gl };
}
