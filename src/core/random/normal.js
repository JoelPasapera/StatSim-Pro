// @ts-check
// core/random/normal.js — normales estándar a partir de un generador uniforme de [0, 1), por la transformación de
// Box-Muller: una por llamada (la del Simulador: dos uniformes, el coseno) o por pares (el seno de cada par se guarda para
// la llamada siguiente: la mitad de uniformes por normal). Una uniforme igual a 0 se vuelve a sacar (log 0 = −∞).
// (2026.12.25, cierre de la fase F6) Había seis copias en tres variantes de la guarda del 0 (repetir, 10⁻³⁰⁰ o un mínimo de
// 10⁻¹²): las secuencias solo podían diferir cuando el generador da exactamente 0, una vez cada 2³² números.

/**
 * Una normal estándar: u₁ y u₂ en ese orden (si u₁ = 0, se saca otra), √(−2 ln u₁)·cos(2π u₂).
 * @param {() => number} u  generador uniforme de [0, 1)
 * @returns {number}
 */
export function normalBoxMuller(u) {
    let u1 = u();
    const u2 = u();
    while (u1 === 0) u1 = u();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Un generador de normales estándar por pares: cada par usa dos uniformes (la primera, distinta de 0) y devuelve
 * √(−2 ln u₁)·cos(2π u₂) y, en la llamada siguiente, √(−2 ln u₁)·sin(2π u₂).
 * @param {() => number} u  generador uniforme de [0, 1)
 * @returns {() => number}
 */
export function generadorNormales(u) {
    /** @type {number | null} */
    let guardado = null;
    return () => {
        if (guardado !== null) { const g = guardado; guardado = null; return g; }
        let v = 0;
        while (v === 0) v = u();
        const m = Math.sqrt(-2 * Math.log(v)), t = 2 * Math.PI * u();
        guardado = m * Math.sin(t);
        return m * Math.cos(t);
    };
}
