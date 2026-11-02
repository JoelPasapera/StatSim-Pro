// @ts-check
// core/random/gamma.js — (2027.01.18) variables gamma y χ² aleatorias a partir de un generador uniforme y uno normal, por el
// método de rechazo de Marsaglia y Tsang (2000): una normal y una uniforme por intento, con la cota rápida 1 − 0,0331x⁴ y la
// exacta del logaritmo; forma < 1, por la de forma + 1 multiplicada por U^(1/forma). La χ² con ν gl es 2·Gamma(ν/2). Las
// usa la imputación múltiple (el sorteo de la varianza residual de la regresión bayesiana). Sin dependencias.

/**
 * Una Gamma(forma, 1).
 * @param {number} forma > 0
 * @param {() => number} u uniforme de [0, 1)
 * @param {() => number} normal normal estándar
 * @returns {number}
 */
export function gammaAleatoria(forma, u, normal) {
    if (!(forma > 0)) return NaN;
    if (forma < 1) {
        const g = gammaAleatoria(forma + 1, u, normal);
        let v = 0;
        while (v === 0) v = u();
        return g * Math.pow(v, 1 / forma);
    }
    const d = forma - 1 / 3, c = 1 / (3 * Math.sqrt(d));   // 1/√(9d)
    for (;;) {
        let x = 0, v = 0;
        do { x = normal(); v = 1 + c * x; } while (v <= 0);
        v = v * v * v;
        const w = u(), x2 = x * x;
        if (w < 1 - 0.0331 * x2 * x2) return d * v;
        if (w > 0 && Math.log(w) < 0.5 * x2 + d * (1 - v + Math.log(v))) return d * v;
    }
}

/**
 * Una χ² con `gl` grados de libertad.
 * @param {number} gl
 * @param {() => number} u
 * @param {() => number} normal
 */
export function chiCuadradoAleatoria(gl, u, normal) { return 2 * gammaAleatoria(gl / 2, u, normal); }
