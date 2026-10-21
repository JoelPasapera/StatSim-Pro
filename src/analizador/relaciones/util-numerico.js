import { media } from '../../core/stats/descriptivos.js';
import { cuantilOrdenado } from '../../core/stats/orden.js';
import { correlacion } from '../../core/stats/correlacion.js';
import { ajustarMco } from '../../core/stats/mco.js';
// analizador/relaciones/util-numerico.js — utilidades numéricas compartidas por el diagnóstico de forma (sin DOM): una
// sola definición de la media, las mallas, el cuantil de tipo 7 (el de R y NumPy) y el AICc.
export { media };   // (2026.12.12) del núcleo único;
export const malla = (a, b, k, log = false) => Array.from({ length: k }, (_, i) => (log ? Math.exp(Math.log(a) + ((Math.log(b) - Math.log(a)) * i) / (k - 1)) : a + ((b - a) * i) / (k - 1)));
// cuantil de tipo 7 sobre un vector ORDENADO
export const cuantil = cuantilOrdenado;   // tipo 7 sobre datos ordenados, del núcleo único;
// cuantil de tipo 7 de los CASOS a partir de sus valores distintos (ordenados) y el número de casos de cada uno
export function cuantilPonderado(u, w, q) {
    let n = 0; for (const v of w) n += v;
    const h = (n - 1) * q, i = Math.floor(h), f = h - i;
    const estadistico = k => { let c = 0; for (let j = 0; j < u.length; j++) { c += w[j]; if (k < c) return u[j]; } return u[u.length - 1]; };
    const a = estadistico(i); return a + f * (estadistico(Math.min(i + 1, n - 1)) - a);
}
// criterio de Akaike corregido para muestras pequeñas (Hurvich y Tsai, 1989); k incluye la varianza del error
export const aicc = (n, rss, k) => n * Math.log(Math.max(rss, 1e-300) / n) + 2 * k + (2 * k * (k + 1)) / Math.max(1, n - k - 1);
// MCO con constante: coeficientes, suma de cuadrados residual y R². (2026.12.21) Del núcleo único (core/stats/mco.js, por
// la QR de X, con el criterio de colinealidad de lm de R); antes, ecuaciones normales con Cholesky y un pivote mínimo
// relativo de 10⁻¹² (una norma relativa de 10⁻⁶), otro criterio que el de la regresión
export function regresionMCO(cols, y) {
    const f = ajustarMco(y, cols);
    if (!f) return null;
    const my = media(y); let tss = 0; for (let i = 0; i < y.length; i++) tss += (y[i] - my) ** 2;
    return { beta: f.beta, rss: f.sce, tss, r2: tss > 0 ? 1 - f.sce / tss : 0 };
}
// correlación de Pearson (NaN si una variable no varía)
export const pearson = correlacion;   // NaN si alguna serie es constante, como antes
// generador pseudoaleatorio mulberry32 con semilla fija (resultados reproducibles): devuelve una función u ∈ [0, 1)
export { mulberry32 as aleatorio } from '../../core/random/mulberry32.js';   // (2026.12.25) del núcleo único
// submuestra determinista de pares (paso fijo) si hay más de «maximo» casos
export function submuestraPares(x, y, maximo) {
    if (x.length <= maximo) return [x, y];
    const paso = x.length / maximo, ix = Array.from({ length: maximo }, (_, k) => Math.floor(k * paso));
    return [Float64Array.from(ix, i => x[i]), Float64Array.from(ix, i => y[i])];
}
