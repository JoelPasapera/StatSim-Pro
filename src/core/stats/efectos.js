// @ts-check
// core/stats/efectos.js — (2027.01.17) los tamaños del efecto con su intervalo de confianza, como pide APA 7 (Appelbaum et
// al., 2018): por el método del parámetro de no centralidad (Steiger y Fouladi, 1997; Smithson, 2003; Steiger, 2004), el de
// las funciones de R effectsize y MBESS. La d de dos grupos y su g de Hedges, la dz de dos medidas de las mismas personas, η²
// (también la parcial de un diseño de medidas repetidas), ω², la V de Cramér y la razón de odds de una tabla 2 × 2.
import { lnGamma } from './especiales.js';
import { cuantilNormal } from './normal.js';
import { intervaloNoCentralidadT, intervaloNoCentralidadF, intervaloNoCentralidadChi2 } from './no-centrales.js';

/**
 * El factor de corrección del sesgo de la d (Hedges, 1981), exacto: J(gl) = Γ(gl/2)/(√(gl/2)·Γ((gl − 1)/2)).
 * @param {number} gl
 * @returns {number}
 */
export function correccionHedges(gl) {
    if (!(gl > 1)) return NaN;
    return Math.exp(lnGamma(gl / 2) - 0.5 * Math.log(gl / 2) - lnGamma((gl - 1) / 2));
}

/**
 * La d de dos grupos independientes desde la t de Student (d = t·√(1/n₁ + 1/n₂)), su g de Hedges y sus intervalos por la t no
 * central con gl = n₁ + n₂ − 2.
 * @param {number} t
 * @param {number} n1
 * @param {number} n2
 * @param {number} [nivel]
 * @returns {{ d: number, inferior: number, superior: number, g: number, gInferior: number, gSuperior: number, nivel: number }}
 */
export function intervaloDDosGrupos(t, n1, n2, nivel = 0.95) {
    const f = Math.sqrt(1 / n1 + 1 / n2), gl = n1 + n2 - 2, J = correccionHedges(gl);
    const nc = intervaloNoCentralidadT(t, gl, nivel);
    const d = t * f, inferior = nc.inferior * f, superior = nc.superior * f;
    return { d, inferior, superior, g: d * J, gInferior: inferior * J, gSuperior: superior * J, nivel };
}

/**
 * La dz de dos medidas de las mismas personas (la media de las diferencias entre su desviación típica: dz = t/√n), con su
 * intervalo por la t no central con gl = n − 1.
 * @param {number} t
 * @param {number} n
 * @param {number} [nivel]
 * @returns {{ dz: number, inferior: number, superior: number, nivel: number }}
 */
export function intervaloDz(t, n, nivel = 0.95) {
    const r = Math.sqrt(n), nc = intervaloNoCentralidadT(t, n - 1, nivel);
    return { dz: t / r, inferior: nc.inferior / r, superior: nc.superior / r, nivel };
}

/**
 * El intervalo de η² (o de la η² parcial de un efecto) desde su F: la no centralidad λ de la F no central, convertida en
 * λ/(λ + gl₁ + gl₂ + 1) (Steiger, 2004). Con una F que no llega a la cola, el límite inferior es 0.
 * @param {number} F
 * @param {number} gl1
 * @param {number} gl2
 * @param {number} [nivel]
 * @returns {{ inferior: number, superior: number, nivel: number }}
 */
export function intervaloEta2(F, gl1, gl2, nivel = 0.95) {
    const nc = intervaloNoCentralidadF(F, gl1, gl2, nivel), N = gl1 + gl2 + 1;
    const conv = (/** @type {number} */ l) => (Number.isFinite(l) ? l / (l + N) : NaN);
    return { inferior: conv(nc.inferior), superior: conv(nc.superior), nivel };
}

/**
 * ω² de un ANOVA de un factor desde su F: gl₁(F − 1)/(gl₁(F − 1) + N), N = gl₁ + gl₂ + 1 (Hays, 1963), menos sesgada que η²;
 * negativa (F < 1) se informa como 0.
 * @param {number} F
 * @param {number} gl1
 * @param {number} gl2
 * @returns {number}
 */
export function omega2(F, gl1, gl2) {
    if (!Number.isFinite(F)) return F === Infinity ? 1 : NaN;
    const num = gl1 * (F - 1);
    return Math.max(0, num / (num + gl1 + gl2 + 1));
}

/**
 * La V de Cramér de una χ² de independencia (V = √(χ²/(n·(m − 1))), m = mín(filas, columnas)) y su intervalo por la χ² no
 * central: cada límite de λ, convertido con la misma fórmula (Smithson, 2003; la de effectsize), sin pasar de 1.
 * @param {number} chi2
 * @param {number} gl
 * @param {number} n
 * @param {number} m
 * @param {number} [nivel]
 * @returns {{ V: number, inferior: number, superior: number, nivel: number }}
 */
export function intervaloCramerV(chi2, gl, n, m, nivel = 0.95) {
    const den = n * (m - 1), conv = (/** @type {number} */ x) => (Number.isFinite(x) ? Math.min(1, Math.sqrt(Math.max(0, x) / den)) : NaN);
    const nc = intervaloNoCentralidadChi2(chi2, gl, nivel);
    return { V: conv(chi2), inferior: conv(nc.inferior), superior: conv(nc.superior), nivel };
}

/**
 * La razón de odds de una tabla 2 × 2 [[a, b], [c, d]] (OR = ad/bc) con su intervalo de Woolf (1955), por el logaritmo; con
 * alguna casilla en 0, con la corrección de Haldane-Anscombe (½ en todas).
 * @param {number} a
 * @param {number} b
 * @param {number} c
 * @param {number} d
 * @param {number} [nivel]
 * @returns {{ or: number, inferior: number, superior: number, corregida: boolean, nivel: number }}
 */
export function intervaloOddsRatio(a, b, c, d, nivel = 0.95) {
    const corregida = a === 0 || b === 0 || c === 0 || d === 0;
    const [A, B, C, D] = corregida ? [a + 0.5, b + 0.5, c + 0.5, d + 0.5] : [a, b, c, d];
    const lor = Math.log((A * D) / (B * C)), ee = Math.sqrt(1 / A + 1 / B + 1 / C + 1 / D), z = cuantilNormal(1 - (1 - nivel) / 2);
    return { or: Math.exp(lor), inferior: Math.exp(lor - z * ee), superior: Math.exp(lor + z * ee), corregida, nivel };
}
