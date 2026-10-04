// analizador/relaciones/util-numerico.js — utilidades numéricas compartidas por el diagnóstico de forma (sin DOM): una
// sola definición de la media, las mallas, el cuantil de tipo 7 (el de R y NumPy) y el AICc.
export const media = v => { let s = 0; for (let i = 0; i < v.length; i++) s += v[i]; return s / v.length; };
export const malla = (a, b, k, log = false) => Array.from({ length: k }, (_, i) => (log ? Math.exp(Math.log(a) + ((Math.log(b) - Math.log(a)) * i) / (k - 1)) : a + ((b - a) * i) / (k - 1)));
// cuantil de tipo 7 sobre un vector ORDENADO
export const cuantil = (orden, q) => { const h = (orden.length - 1) * q, i = Math.floor(h); return orden[i] + (h - i) * (orden[Math.min(i + 1, orden.length - 1)] - orden[i]); };
// cuantil de tipo 7 de los CASOS a partir de sus valores distintos (ordenados) y el número de casos de cada uno
export function cuantilPonderado(u, w, q) {
    let n = 0; for (const v of w) n += v;
    const h = (n - 1) * q, i = Math.floor(h), f = h - i;
    const estadistico = k => { let c = 0; for (let j = 0; j < u.length; j++) { c += w[j]; if (k < c) return u[j]; } return u[u.length - 1]; };
    const a = estadistico(i); return a + f * (estadistico(Math.min(i + 1, n - 1)) - a);
}
// criterio de Akaike corregido para muestras pequeñas (Hurvich y Tsai, 1989); k incluye la varianza del error
export const aicc = (n, rss, k) => n * Math.log(Math.max(rss, 1e-300) / n) + 2 * k + (2 * k * (k + 1)) / Math.max(1, n - k - 1);
// MCO pequeño con constante (p ≤ 4, ecuaciones normales con Cholesky): coeficientes, suma de cuadrados residual y R²
export function regresionMCO(cols, y) {
    const n = y.length, p = cols.length + 1, A = Array.from({ length: p }, () => new Float64Array(p)), b = new Float64Array(p);
    const valor = (a, i) => (a === 0 ? 1 : cols[a - 1][i]);
    for (let a = 0; a < p; a++) { let s = 0; for (let i = 0; i < n; i++) s += valor(a, i) * y[i]; b[a] = s; for (let c = a; c < p; c++) { let t = 0; for (let i = 0; i < n; i++) t += valor(a, i) * valor(c, i); A[a][c] = A[c][a] = t; } }
    const L = Array.from({ length: p }, () => new Float64Array(p));
    for (let r = 0; r < p; r++) for (let c = 0; c <= r; c++) {
        let s = A[r][c]; for (let k = 0; k < c; k++) s -= L[r][k] * L[c][k];
        if (r === c) { if (!(s > 1e-12 * (A[r][r] || 1))) return null; L[r][r] = Math.sqrt(s); } else L[r][c] = s / L[c][c];
    }
    const v = new Float64Array(p); for (let r = 0; r < p; r++) { let s = b[r]; for (let k = 0; k < r; k++) s -= L[r][k] * v[k]; v[r] = s / L[r][r]; }
    const beta = new Float64Array(p); for (let r = p - 1; r >= 0; r--) { let s = v[r]; for (let k = r + 1; k < p; k++) s -= L[k][r] * beta[k]; beta[r] = s / L[r][r]; }
    const my = media(y); let rss = 0, tss = 0;
    for (let i = 0; i < n; i++) { let f = 0; for (let a = 0; a < p; a++) f += beta[a] * valor(a, i); rss += (y[i] - f) ** 2; tss += (y[i] - my) ** 2; }
    return { beta, rss, tss, r2: tss > 0 ? 1 - rss / tss : 0 };
}
// correlación de Pearson (NaN si una variable no varía)
export function pearson(a, b) {
    const n = a.length, ma = media(a), mb = media(b);
    let ab = 0, aa = 0, bb = 0;
    for (let i = 0; i < n; i++) { const da = a[i] - ma, db = b[i] - mb; ab += da * db; aa += da * da; bb += db * db; }
    return aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : NaN;
}
// generador pseudoaleatorio mulberry32 con semilla fija (resultados reproducibles): devuelve una función u ∈ [0, 1)
export const aleatorio = semilla => { let a = semilla >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
// submuestra determinista de pares (paso fijo) si hay más de «maximo» casos
export function submuestraPares(x, y, maximo) {
    if (x.length <= maximo) return [x, y];
    const paso = x.length / maximo, ix = Array.from({ length: maximo }, (_, k) => Math.floor(k * paso));
    return [Float64Array.from(ix, i => x[i]), Float64Array.from(ix, i => y[i])];
}
