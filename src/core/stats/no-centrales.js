// @ts-check
// core/stats/no-centrales.js — (2027.01.17) las distribuciones t y F no centrales y la inversión de su parámetro de no
// centralidad, con la que se construyen los intervalos de confianza de los tamaños del efecto (el «método del parámetro de no
// centralidad» de Steiger y Fouladi, 1997; Smithson, 2003; Steiger, 2004): el de d, g y dz por la t no central, el de η² por
// la F no central y el de la V de Cramér por la χ² no central (la de distribuciones.js). Parte del núcleo numérico único.
//
// Las dos CDF son mezclas de Poisson de betas incompletas, sumadas en una ventana alrededor de la moda de la Poisson con los
// pesos en escala logarítmica, como la χ² no central de distribuciones.js: así no se desbordan con no centralidades grandes
// (e^(−λ/2) ya es 0 en doble precisión con λ > 1490, y el algoritmo AS 243, que empieza la serie en el término 0, pierde
// toda la precisión mucho antes, con δ ≈ 38).
// (2027.01.20, revisión) Pero la ventana crece con la no centralidad (unos 34·|δ| términos por evaluación): con una t o una F
// enormes (unos datos casi sin error, por redondeo) la inversión hacía miles de millones de betas y la página se colgaba. Con
// |δ| > DELTA_GRANDE, la t no central se calcula por una integral sobre su denominador (exacta), y con una F de no centralidad
// del orden del millón, su intervalo, con el numerador ya sin variación.
import { lnGamma, betaRegularizada, gammaRegularizadaQ } from './especiales.js';
import { cdfNormal } from './normal.js';
import { cdfT, cdfF, colaSuperiorF, cdfChi2NoCentral, cuantilChi2 } from './distribuciones.js';
import { raizBrent } from './optimizacion.js';
import { integrar } from './integracion.js';

/** A partir de qué |δ| la t no central se calcula por la integral (la serie tendría más de 2700 términos). */
export const DELTA_GRANDE = 80;
/** A partir de qué F·d₁ (la no centralidad que hace falta, más o menos) el intervalo de la F no central es el asintótico. */
const LAMBDA_GRANDE = 1e6;

/**
 * (2027.01.20) P(T ≤ t | δ) con t > 0 por la integral sobre S = √(V/df), V ~ χ²(df): P(Z + δ ≤ t·S) = ∫ Φ(t·s − δ) f_S(s) ds,
 * con ln f_S(s) = (df/2)·ln df + (1 − df/2)·ln 2 − ln Γ(df/2) + (df − 1)·ln s − df·s²/2. Fuera de la ventana s* ± 9/t
 * (s* = δ/t), Φ ya es 0 o 1 (Φ(−9) ≈ 10⁻¹⁹): por encima, la cola de la χ². Dentro, Gauss–Kronrod adaptativa, solo donde S
 * tiene masa (la cota de Laurent y Massart, 2000, deja fuera menos de 10⁻¹⁹: df ± 2√(45·df) + 90) y partida en su moda, para
 * que la cuadratura no salte un pico estrecho (con df grande, S casi no varía).
 * @param {number} t
 * @param {number} df
 * @param {number} delta
 */
export function cdfTNoCentralIntegral(t, df, delta) {
    const centro = delta / t, ancho = 9 / t, desde = Math.max(0, centro - ancho), hasta = centro + ancho;
    if (hasta <= 0) return 1;
    const lnC = (df / 2) * Math.log(df) + (1 - df / 2) * Math.LN2 - lnGamma(df / 2);
    const densidad = (/** @type {number} */ s) => (s > 0 ? Math.exp(lnC + (df - 1) * Math.log(s) - df * s * s / 2) : 0);
    const arriba = gammaRegularizadaQ(df / 2, df * hasta * hasta / 2);
    const sMin = Math.sqrt(Math.max(0, df - 2 * Math.sqrt(45 * df)) / df), sMax = Math.sqrt((df + 2 * Math.sqrt(45 * df) + 90) / df);
    const a = Math.max(desde, sMin), b = Math.min(hasta, sMax);
    if (!(b > a)) return Math.min(1, Math.max(0, arriba));
    const f = (/** @type {number} */ s) => cdfNormal(t * s - delta) * densidad(s), opciones = { tolerancia: 1e-15, toleranciaRelativa: 1e-12 };
    const moda = df > 1 ? Math.sqrt((df - 1) / df) : 0;
    const medio = moda > a && moda < b ? integrar(f, a, moda, opciones).valor + integrar(f, moda, b, opciones).valor : integrar(f, a, b, opciones).valor;
    return Math.min(1, Math.max(0, arriba + medio));
}

/**
 * La ventana de términos de una Poisson de media μ que importan en doble precisión: de la moda, 12·√μ + 40 a cada lado.
 * @param {number} mu
 * @returns {[number, number]}
 */
function ventanaPoisson(mu) {
    const moda = Math.floor(mu), ancho = Math.ceil(12 * Math.sqrt(mu) + 40);
    return [Math.max(0, moda - ancho), moda + ancho];
}

/**
 * CDF de la t no central, P(T ≤ t) con df grados de libertad y no centralidad δ. Para t ≥ 0 (Guenther, 1978):
 *   P(T ≤ t) = Φ(−δ) + ½ Σⱼ [pⱼ·I_x(j + ½, df/2) + qⱼ·I_x(j + 1, df/2)],  x = t²/(t² + df),
 *   pⱼ = e^(−δ²/2)(δ²/2)ʲ/j!,  qⱼ = δ·e^(−δ²/2)(δ²/2)ʲ/(√2·Γ(j + 3/2));
 * para t < 0, por simetría, 1 − P(T ≤ −t | −δ).
 * @param {number} t
 * @param {number} df
 * @param {number} delta
 * @returns {number}
 */
export function cdfTNoCentral(t, df, delta) {
    if (!(df > 0) || Number.isNaN(t) || !Number.isFinite(delta)) return NaN;
    if (t === Infinity) return 1;
    if (t === -Infinity) return 0;
    if (delta === 0) return cdfT(t, df);
    if (t < 0) return 1 - cdfTNoCentral(-t, df, -delta);
    const base = cdfNormal(-delta);
    if (t === 0) return base;
    if (Math.abs(delta) > DELTA_GRANDE) return cdfTNoCentralIntegral(t, df, delta);
    const x = t * t / (t * t + df), mu = delta * delta / 2, lnMu = Math.log(mu), b = df / 2;
    const signo = Math.sign(delta), lnQ0 = Math.log(Math.abs(delta)) - 0.5 * Math.LN2;
    const [desde, hasta] = ventanaPoisson(mu);
    let suma = 0;
    for (let j = desde; j <= hasta; j++) {
        const comun = -mu + j * lnMu;
        const lp = comun - lnGamma(j + 1), lq = lnQ0 + comun - lnGamma(j + 1.5);
        if (lp > -745) suma += Math.exp(lp) * betaRegularizada(x, j + 0.5, b);
        if (lq > -745) suma += signo * Math.exp(lq) * betaRegularizada(x, j + 1, b);
    }
    return Math.min(1, Math.max(0, base + 0.5 * suma));
}

/**
 * CDF de la F no central, P(F ≤ f) con d1 y d2 grados de libertad y no centralidad λ:
 *   Σⱼ e^(−λ/2)(λ/2)ʲ/j! · I_x(d1/2 + j, d2/2),  x = d1·f/(d1·f + d2).
 * @param {number} f
 * @param {number} d1
 * @param {number} d2
 * @param {number} lambda
 * @returns {number}
 */
export function cdfFNoCentral(f, d1, d2, lambda) {
    if (!(d1 > 0) || !(d2 > 0) || Number.isNaN(f) || !(lambda >= 0)) return NaN;
    if (!(f > 0)) return 0;
    if (f === Infinity) return 1;
    if (lambda === 0) return cdfF(f, d1, d2);
    return 1 - colaSuperiorFNoCentral(f, d1, d2, lambda);
}

/**
 * Cola superior de la F no central, P(F ≥ f), sumada sin restar: Σⱼ e^(−λ/2)(λ/2)ʲ/j! · I_{1−x}(d2/2, d1/2 + j).
 * @param {number} f
 * @param {number} d1
 * @param {number} d2
 * @param {number} lambda
 * @returns {number}
 */
export function colaSuperiorFNoCentral(f, d1, d2, lambda) {
    if (!(d1 > 0) || !(d2 > 0) || Number.isNaN(f) || !(lambda >= 0)) return NaN;
    if (!(f > 0)) return 1;
    if (f === Infinity) return 0;
    if (lambda === 0) return colaSuperiorF(f, d1, d2);
    const y = d2 / (d1 * f + d2), mu = lambda / 2, lnMu = Math.log(mu);
    const [desde, hasta] = ventanaPoisson(mu);
    let suma = 0;
    for (let j = desde; j <= hasta; j++) {
        const lw = -mu + j * lnMu - lnGamma(j + 1);
        if (lw > -745) suma += Math.exp(lw) * betaRegularizada(y, d2 / 2, d1 / 2 + j);
    }
    return Math.min(1, Math.max(0, suma));
}

/**
 * La no centralidad δ con P(T ≤ tObs | δ) = objetivo (decreciente en δ): Brent con un intervalo que se amplía hasta
 * contener la raíz.
 * @param {number} tObs
 * @param {number} df
 * @param {number} objetivo
 * @returns {number}
 */
function deltaParaProbabilidad(tObs, df, objetivo) {
    const g = (/** @type {number} */ d) => cdfTNoCentral(tObs, df, d) - objetivo;
    let paso = Math.max(1, Math.abs(tObs) / 4), a = tObs - paso, b = tObs + paso;
    for (let i = 0; i < 60 && g(a) < 0; i++) { paso *= 2; a = tObs - paso; }
    for (let i = 0; i < 60 && g(b) > 0; i++) { paso *= 2; b = tObs + paso; }
    const r = raizBrent(g, a, b, 1e-12 * Math.max(1, Math.abs(tObs)));
    return r ? r.x : NaN;
}

/**
 * Intervalo de confianza de la no centralidad de una t observada (Steiger y Fouladi, 1997): [δ_inf, δ_sup] con
 * P(T ≤ t | δ_inf) = 1 − α/2 y P(T ≤ t | δ_sup) = α/2.
 * @param {number} tObs
 * @param {number} df
 * @param {number} [nivel]
 * @returns {{ inferior: number, superior: number }}
 */
export function intervaloNoCentralidadT(tObs, df, nivel = 0.95) {
    if (!Number.isFinite(tObs) || !(df > 0)) return { inferior: NaN, superior: NaN };
    const a = (1 - nivel) / 2;
    return { inferior: deltaParaProbabilidad(tObs, df, 1 - a), superior: deltaParaProbabilidad(tObs, df, a) };
}

/**
 * La no centralidad λ ≥ 0 con P(F ≤ fObs | λ) = objetivo (decreciente en λ), o 0 si ya con λ = 0 la probabilidad no llega.
 * @param {number} fObs
 * @param {number} d1
 * @param {number} d2
 * @param {number} objetivo
 * @returns {number}
 */
function lambdaParaProbabilidad(fObs, d1, d2, objetivo) {
    if (cdfF(fObs, d1, d2) <= objetivo) return 0;
    const g = (/** @type {number} */ l) => cdfFNoCentral(fObs, d1, d2, l) - objetivo;
    let b = Math.max(10, fObs * d1 * 2);
    for (let i = 0; i < 80 && g(b) > 0; i++) b *= 2;
    const r = raizBrent(g, 0, b, 1e-10);
    return r ? r.x : NaN;
}

/**
 * Intervalo de confianza de la no centralidad de una F observada: [λ_inf, λ_sup], cada uno 0 si la F no llega a su cola.
 * @param {number} fObs
 * @param {number} d1
 * @param {number} d2
 * @param {number} [nivel]
 * @returns {{ inferior: number, superior: number }}
 */
export function intervaloNoCentralidadF(fObs, d1, d2, nivel = 0.95) {
    if (!(fObs >= 0) || !Number.isFinite(fObs) || !(d1 > 0) || !(d2 > 0)) return { inferior: NaN, superior: NaN };
    const a = (1 - nivel) / 2;
    // (2027.01.20) con λ del orden del millón, el numerador ya no varía (su coeficiente de variación es 2/√λ): la F es
    // (d₁ + λ)/d₁ · d₂/V con V ~ χ²(d₂), y P(F ≤ f | λ) = p da λ = d₁·f·χ²₁₋ₚ(d₂)/d₂ − d₁
    if (fObs * d1 > LAMBDA_GRANDE) {
        const lambda = (/** @type {number} */ q) => Math.max(0, d1 * fObs * cuantilChi2(q, d2) / d2 - d1);
        return { inferior: lambda(a), superior: lambda(1 - a) };
    }
    return { inferior: lambdaParaProbabilidad(fObs, d1, d2, 1 - a), superior: lambdaParaProbabilidad(fObs, d1, d2, a) };
}

/**
 * Intervalo de confianza de la no centralidad de una χ² observada: [λ_inf, λ_sup], cada uno 0 si la χ² no llega a su cola.
 * @param {number} chi2
 * @param {number} gl
 * @param {number} [nivel]
 * @returns {{ inferior: number, superior: number }}
 */
export function intervaloNoCentralidadChi2(chi2, gl, nivel = 0.95) {
    if (!(chi2 >= 0) || !Number.isFinite(chi2) || !(gl > 0)) return { inferior: NaN, superior: NaN };
    const a = (1 - nivel) / 2;
    /** @param {number} objetivo */
    const lambda = objetivo => {
        if (cdfChi2NoCentral(chi2, gl, 0) <= objetivo) return 0;
        const g = (/** @type {number} */ l) => cdfChi2NoCentral(chi2, gl, l) - objetivo;
        let b = Math.max(10, chi2 * 2);
        for (let i = 0; i < 80 && g(b) > 0; i++) b *= 2;
        const r = raizBrent(g, 0, b, 1e-10);
        return r ? r.x : NaN;
    };
    return { inferior: lambda(1 - a), superior: lambda(a) };
}
