// @ts-check
// core/stats/distribuciones.js — las distribuciones que se contrastan: χ² (también la no central), F y t de Student, con
// sus colas calculadas sin restar y sus inversas. Parte del núcleo numérico único (core/stats/numerico.js).
import { lnGamma, gammaRegularizadaQ, betaRegularizada } from './especiales.js';
import { raizBrent } from './optimizacion.js';

// p de cola derecha de una χ² con gl grados de libertad
/** Cola superior de la χ²: P(X ≥ chi2) con gl grados de libertad. @param {number} chi2 @param {number} gl @returns {number} */
export const pChiCuadrado = (chi2, gl) => gammaRegularizadaQ(gl / 2, chi2 / 2);

// χ² no central por mezcla de Poisson con pesos en escala logarítmica centrados en la moda (sin desbordamiento para
// ncp grandes, donde e^(−ncp/2) ya es 0 en doble precisión); CDF y búsqueda del ncp para el IC del RMSEA (Browne y
// Cudeck, 1993)
/** @param {number} x @param {number} df @param {number} ncp @returns {number} */
export function cdfChi2NoCentral(x, df, ncp) {
    if (!(x > 0)) return 0;
    if (!(ncp > 0)) return 1 - gammaRegularizadaQ(df / 2, x / 2);
    const lam = ncp / 2, moda = Math.floor(lam), ancho = Math.ceil(12 * Math.sqrt(lam) + 40);
    let suma = 0;
    for (let j = Math.max(0, moda - ancho); j <= moda + ancho; j++) {
        const lw = -lam + j * Math.log(lam) - lnGamma(j + 1);
        if (lw < -745) continue;
        suma += Math.exp(lw) * (1 - gammaRegularizadaQ(df / 2 + j, x / 2));
    }
    return Math.min(1, suma);
}

/** @param {number} x @param {number} df @param {number} objetivo @returns {number} */
export function ncpParaProbabilidad(x, df, objetivo) {
    if (cdfChi2NoCentral(x, df, 0) <= objetivo) return 0;
    let lo = 0, hi = Math.max(x * 3, 50);
    while (cdfChi2NoCentral(x, df, hi) > objetivo && hi < 1e8) hi *= 2;
    for (let i = 0; i < 200 && hi - lo > 1e-10 * Math.max(1, hi); i++) { const mid = (lo + hi) / 2; if (cdfChi2NoCentral(x, df, mid) > objetivo) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
}


/** CDF de la F (cola inferior). @param {number} f @param {number} d1 @param {number} d2 @returns {number} */
export const cdfF = (f, d1, d2) => (f <= 0 ? 0 : betaRegularizada((d1 * f) / (d1 * f + d2), d1 / 2, d2 / 2));

/**
 * Cola superior de la F, I_{d2/(d2 + d1·f)}(d2/2, d1/2), sin la pérdida de precisión de 1 − CDF.
 * @param {number} f
 * @param {number} d1
 * @param {number} d2
 * @returns {number}
 */
export const colaSuperiorF = (f, d1, d2) => (f <= 0 ? 1 : betaRegularizada(d2 / (d2 + d1 * f), d2 / 2, d1 / 2));

/** @param {number} p @param {number} d1 @param {number} d2 @returns {number} */
export function cuantilF(p, d1, d2) {
    // (2026.12.09, revisión) bordes exactos: con p = 1 la CDF redondea a 1 en coma flotante y la búsqueda se paraba ahí (daba 64)
    if (p === 0) return 0;
    if (p === 1) return Infinity;
    if (!(p > 0 && p < 1)) return NaN;
    // por encima de la mediana se invierte la cola superior, calculada sin restar: la CDF usa d1·f/(d1·f + d2), que se redondea
    // a 1 cuando f pasa de ≈ 2⁵³, y con colas pesadas (F(1, 1)) la inversa se quedaba en 9·10¹⁵ en lugar de 4·10²³
    const superior = p > 0.5, q = 1 - p;
    const g = superior ? (/** @type {number} */ f) => colaSuperiorF(f, d1, d2) - q : (/** @type {number} */ f) => cdfF(f, d1, d2) - p;
    let hi = 1;
    while (g(hi) > 0 === superior && hi < 1e300) hi *= 2;
    const r = raizBrent(g, 0, hi, 0);   // tolerancia solo relativa (2·ε·|x|): con una absoluta, las raíces menores que ella daban 0
    return r ? r.x : NaN;
}

/**
 * p bilateral de la t de Student: P(|T| ≥ |t|) = I_{df/(df + t²)}(df/2, 1/2).
 * @param {number} t
 * @param {number} df
 * @returns {number}
 */
export function pTBilateral(t, df) { return betaRegularizada(df / (df + t * t), df / 2, 0.5); }

/**
 * CDF de la t de Student.
 * @param {number} t
 * @param {number} df
 * @returns {number}
 */
export function cdfT(t, df) { const p = 0.5 * pTBilateral(t, df); return t >= 0 ? 1 - p : p; }

/**
 * Cuantil de la t de Student (inversa de la CDF): Brent sobre la CDF, con un intervalo que se amplía hasta contener la raíz.
 * @param {number} p
 * @param {number} df
 * @returns {number}
 */
export function cuantilT(p, df) {
    if (p === 0) return -Infinity;
    if (p === 1) return Infinity;
    if (!(p > 0 && p < 1) || !(df > 0)) return NaN;
    if (p === 0.5) return 0;
    // (revisión) por simetría se resuelve en la cola, P(T > t) = pTBilateral(t)/2 = mín(p, 1 − p), sin restar de 1: con la CDF,
    // cerca de 1 se perdía precisión (error relativo 4·10⁻⁵ con p = 1 − 10⁻¹²); tolerancia solo relativa, como en cuantilF
    const q = Math.min(p, 1 - p);
    let b = 1;
    while (0.5 * pTBilateral(b, df) > q && b < 1e300) b *= 2;
    const r = raizBrent((/** @type {number} */ t) => 0.5 * pTBilateral(t, df) - q, 0, b, 0);
    if (!r) return NaN;
    return p < 0.5 ? -r.x : r.x;
}
