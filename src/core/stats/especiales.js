// @ts-check
// core/stats/especiales.js — funciones especiales: lnΓ (Lanczos, con reflexión y polos), gamma incompleta regularizada
// superior y beta incompleta regularizada (fracción continua de Lentz). Sin dependencias. Parte del núcleo numérico único.

// ln Γ(z) por la aproximación de Lanczos (g = 7, 9 coeficientes): error relativo ~1e-15
const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

/** @param {number} z @returns {number} */
export function lnGamma(z) {
    // (2026.12.09, revisión) en 0, −1, −2… Γ tiene un polo: sin(π·z) no da 0 exacto en coma flotante y la reflexión daba un número
    // finito sin sentido (lnGamma(−1) = 37,78); ahora +∞, como gammaln de SciPy
    if (z <= 0 && Number.isInteger(z)) return Infinity;
    if (z < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * z))) - lnGamma(1 - z);
    z -= 1;
    let x = LANCZOS[0];
    for (let i = 1; i < 9; i++) x += LANCZOS[i] / (z + i);
    const t = z + 7.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

// Q(a, x): gamma incompleta regularizada superior (serie si x < a + 1; si no, fracción continua de Lentz)
/** @param {number} a @param {number} x @returns {number} */
export function gammaRegularizadaQ(a, x) {
    if (!(a > 0) || !(x >= 0)) return NaN;
    if (x === 0) return 1;
    const pref = Math.exp(-x + a * Math.log(x) - lnGamma(a));
    if (x < a + 1) {
        let ap = a, suma = 1 / a, del = suma;
        for (let n = 1; n <= 10000; n++) { ap++; del *= x / ap; suma += del; if (Math.abs(del) < Math.abs(suma) * 1e-16) break; }
        return Math.max(0, 1 - suma * pref);
    }
    let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
    for (let i = 1; i <= 10000; i++) {
        const an = -i * (i - a);
        b += 2;
        d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
        c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
        d = 1 / d;
        const del = d * c;
        h *= del;
        if (Math.abs(del - 1) < 1e-16) break;
    }
    return pref * h;
}

// Beta incompleta regularizada I_x(a, b) (fracción continua de Lentz, como en Numerical Recipes) y distribución F
/** @param {number} a @param {number} b @param {number} x @returns {number} */
function fraccionBeta(a, b, x) {
    const MIN = 1e-300, qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - (qab * x) / qap;
    if (Math.abs(d) < MIN) d = MIN;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= 1000; m++) {
        const m2 = 2 * m;
        let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
        d = 1 + aa * d; if (Math.abs(d) < MIN) d = MIN; c = 1 + aa / c; if (Math.abs(c) < MIN) c = MIN; d = 1 / d; h *= d * c;
        aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
        d = 1 + aa * d; if (Math.abs(d) < MIN) d = MIN; c = 1 + aa / c; if (Math.abs(c) < MIN) c = MIN; d = 1 / d;
        const del = d * c; h *= del;
        if (Math.abs(del - 1) < 1e-15) break;
    }
    return h;
}

/** @param {number} x @param {number} a @param {number} b @returns {number} */
export function betaRegularizada(x, a, b) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? (bt * fraccionBeta(a, b, x)) / a : 1 - (bt * fraccionBeta(b, a, 1 - x)) / b;
}
