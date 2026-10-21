// @ts-check
// simulador/dominio/hermite-numerica.js — correlación entre transformaciones de normales correlacionadas, por la serie de Hermite
// con coeficientes NUMÉRICOS (sin DOM ni estado). Para una transformación T de la normal estándar, sus coeficientes normalizados son
//     c_k = E[(T(Z) − μ_T)·He_k(Z)] / (σ_T·√k!)
// y la fórmula de Mehler da la r entre T₁(Z₁) y T₂(Z₂) cuando r(Z₁, Z₂) = ρ:  r(ρ) = Σ_k c₁ₖ·c₂ₖ·ρᵏ.
// Las esperanzas se calculan en una malla fina, no con una cuadratura de Gauss: así valen también para funciones ESCALONADAS, como
// el total discreto de una escala de acierto/error con pocos ítems (con 4, solo 5 valores), cuya correlación se atenúa respecto a
// la de sus latentes (2026.12.03: una estabilidad de 0,76 salía 0,69 en modo no exacto).
import { biseccion } from '../../core/stats/optimizacion.js';

export const ORDEN_HERMITE = 30;
const PASO = 0.002, LIMITE = 8.5;

/**
 * Coeficientes normalizados c₁…c_K de una transformación de la normal estándar.
 * @param {(z: number) => number} T
 * @param {number} [K]
 * @returns {Float64Array}  índice 0 = orden 1
 */
export function coeficientesHermite(T, K = ORDEN_HERMITE) {
    const n = Math.round((2 * LIMITE) / PASO) + 1, z = new Float64Array(n), w = new Float64Array(n), t = new Float64Array(n);
    let sw = 0;
    for (let i = 0; i < n; i++) { z[i] = -LIMITE + i * PASO; w[i] = Math.exp(-0.5 * z[i] * z[i]); sw += w[i]; }
    let mu = 0;
    for (let i = 0; i < n; i++) { w[i] /= sw; t[i] = T(z[i]); mu += w[i] * t[i]; }
    let v = 0;
    for (let i = 0; i < n; i++) v += w[i] * (t[i] - mu) ** 2;
    const sd = Math.sqrt(v), c = new Float64Array(K);
    if (!(sd > 0)) return c;
    // polinomios de Hermite normalizados h_k = He_k/√k!: h_{k+1} = (z·h_k − √k·h_{k−1})/√(k+1) (sin desbordes en los órdenes altos)
    const previo = new Float64Array(n).fill(1), h = Float64Array.from(z);
    for (let k = 1; k <= K; k++) {
        let s = 0;
        for (let i = 0; i < n; i++) s += w[i] * (t[i] - mu) * h[i];
        c[k - 1] = s / sd;
        for (let i = 0; i < n; i++) { const siguiente = (z[i] * h[i] - Math.sqrt(k) * previo[i]) / Math.sqrt(k + 1); previo[i] = h[i]; h[i] = siguiente; }
    }
    return c;
}

/**
 * r entre las dos transformaciones cuando la de sus latentes es ρ.
 * @param {ArrayLike<number>} c1
 * @param {ArrayLike<number>} c2
 * @param {number} rho
 * @returns {number}
 */
export function rDeCoeficientes(c1, c2, rho) {
    let r = 0, p = 1;
    for (let k = 0; k < Math.min(c1.length, c2.length); k++) { p *= rho; r += c1[k] * c2[k] * p; }
    return r;
}

/**
 * La ρ de las latentes que da la r pedida entre las transformaciones (bisección: r(ρ) es creciente si las dos lo son).
 * @param {ArrayLike<number>} c1
 * @param {ArrayLike<number>} c2
 * @param {number} r
 * @param {number} [tope]
 * @returns {{ rho: number, limitada: boolean }}  limitada: la r pedida no se alcanza ni con |ρ| = tope
 */
export function rhoDeCoeficientes(c1, c2, r, tope = 0.99) {
    if (r >= rDeCoeficientes(c1, c2, tope)) return { rho: tope, limitada: r > rDeCoeficientes(c1, c2, tope) + 1e-12 };
    if (r <= rDeCoeficientes(c1, c2, -tope)) return { rho: -tope, limitada: r < rDeCoeficientes(c1, c2, -tope) - 1e-12 };
    return { rho: biseccion(rho => rDeCoeficientes(c1, c2, rho), r, -tope, tope, 60), limitada: false };   // (2026.12.25) la del núcleo
}
