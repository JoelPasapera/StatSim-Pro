// @ts-check
// simulador/dominio/tolerancias.js — errores típicos de muestreo para el informe «pedido vs. obtenido» (sin DOM ni estado).
// En modo exacto la base fija la media, la DE y las correlaciones; en el no exacto varían por muestreo, y cada fila compara con
// Z_TOLERANCIA errores típicos de su estadístico (sin bajar del piso del modo exacto). Con 3, una fila correcta sale ✗ el 0,27 %
// de las veces si su estadístico es aproximadamente normal.
import { desviacion } from '../../core/stats/descriptivos.js';

export const Z_TOLERANCIA = 3;

/**
 * Curtosis (no en exceso: 3 en una normal) de una muestra.
 * @param {ArrayLike<number>} v
 * @returns {number}
 */
export function curtosis(v) {
    const n = v.length;
    if (n < 4) return 3;
    let m = 0; for (let i = 0; i < n; i++) m += v[i]; m /= n;
    let m2 = 0, m4 = 0; for (let i = 0; i < n; i++) { const d = (v[i] - m) * (v[i] - m); m2 += d; m4 += d * d; }
    m2 /= n; m4 /= n;
    return m2 > 0 ? m4 / (m2 * m2) : 3;
}

/**
 * Error típico de la media.
 * @param {number} de  DE de la muestra
 * @param {number} n
 * @returns {number}
 */
export const eeMedia = (de, n) => de / Math.sqrt(Math.max(1, n));

/**
 * Error típico de la DE: DE·√((κ − 1)/(4n)), con la curtosis κ de la propia muestra (en una normal, DE/√(2n)); κ se acota por
 * debajo en 1,8 (la de la uniforme) para que una muestra pequeña no dé un error típico casi nulo.
 * @param {ArrayLike<number>} v
 * @returns {number}
 */
export function eeDE(v) {
    const n = v.length;
    if (n < 4) return Infinity;
    const de = desviacion(v);   // (2026.12.25) del núcleo único
    return de * Math.sqrt((Math.max(1.8, curtosis(v)) - 1) / (4 * n));
}

/**
 * Error típico de la r de Pearson también con datos no normales (método delta con los momentos de cuarto orden de la muestra):
 * Var(r) ≈ [(1 + r²/2)·μ22 − r·(μ31 + μ13) + (r²/4)·(μ40 + μ04)] / n, con las variables tipificadas; con normales, (1 − r²)²/n.
 * @param {ArrayLike<number>} x
 * @param {ArrayLike<number>} y
 * @returns {number}
 */
export function eeCorrelacion(x, y) {
    const n = Math.min(x.length, y.length);
    if (n < 4) return Infinity;
    let mx = 0, my = 0; for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; } mx /= n; my /= n;
    let sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
    const dx = Math.sqrt(sxx / n), dy = Math.sqrt(syy / n);
    if (!(dx > 0) || !(dy > 0)) return Infinity;
    let r = 0, m22 = 0, m31 = 0, m13 = 0, m40 = 0, m04 = 0;
    for (let i = 0; i < n; i++) { const a = (x[i] - mx) / dx, b = (y[i] - my) / dy; r += a * b; m22 += a * a * b * b; m31 += a * a * a * b; m13 += a * b * b * b; m40 += a ** 4; m04 += b ** 4; }
    r /= n; m22 /= n; m31 /= n; m13 /= n; m40 /= n; m04 /= n;
    const v = (1 + (r * r) / 2) * m22 - r * (m31 + m13) + ((r * r) / 4) * (m40 + m04);
    return Math.sqrt(Math.max(1e-12, v) / n);
}

/**
 * Error típico de α (Feldt), que vale también para ω y el KR-20.
 * @param {number} alfa
 * @param {number} k  ítems
 * @param {number} n
 * @returns {number}
 */
export const eeFiabilidad = (alfa, k, n) => (1 - alfa) * Math.sqrt((2 * k) / ((k - 1) * Math.max(1, n)));

/**
 * Curtosis de la POBLACIÓN del total de una escala, con su forma real, el recorte al rango y el redondeo (integración numérica sobre
 * la normal). Con muestras pequeñas la curtosis muestral de una forma de cola pesada sale muy por debajo (la muestra casi nunca
 * contiene los extremos) y con ella los errores típicos de la DE y de la fiabilidad (2026.12.04: con n = 40 y la forma asimétrica,
 * 7 de cada 100 DE y 9 de cada 100 α correctos salían ✗); el generador conoce la población y la usa como suelo.
 * @param {(z: number) => number} T  forma tipificada (media 0, DE 1)
 * @param {number} media
 * @param {number} de
 * @param {number} minimo  total mínimo alcanzable
 * @param {number} maximo  total máximo alcanzable
 * @returns {number}
 */
export function curtosisPoblacional(T, media, de, minimo, maximo) {
    let sw = 0, s1 = 0, s2 = 0;
    const v = [], w = [];
    for (let x = -8; x <= 8; x += 0.002) { const p = Math.exp(-0.5 * x * x), y = Math.round(Math.max(minimo, Math.min(maximo, media + de * T(x)))); v.push(y); w.push(p); sw += p; s1 += p * y; }
    const m = s1 / sw;
    let m4 = 0;
    for (let i = 0; i < v.length; i++) { const d = (v[i] - m) * (v[i] - m); s2 += w[i] * d; m4 += w[i] * d * d; }
    s2 /= sw; m4 /= sw;
    return s2 > 0 ? m4 / (s2 * s2) : 3;
}

