// analizador/relaciones/diagnostico-forma.js — diagnóstico de la FORMA de la relación entre dos variables (sin DOM),
// según el «Atlas de relaciones entre variables»: coeficientes (r de Pearson, ρ de Spearman, τ-b de Kendall, correlación
// de distancias y η por tramos), comparación de formas por AICc (Hurvich y Tsai, 1989) con pesos de Akaike (Burnham y
// Anderson, 2002), clasificación de la curva ganadora (giros y curvatura en el rango observado) y recomendación del
// coeficiente y del análisis adecuados.
import { cdfNormal, betaRegularizada, cdfF } from '../psicometria/numerico.js';
import { pruebaDosRectas, pruebaLindMehlum, equivalenciaCorrelacion } from './confirmacion-forma.js';
import { pruebasPermutacionForma } from './pruebas-permutacion-forma.js';
import { media, malla, cuantil, cuantilPonderado, aicc, pearson, aleatorio, submuestraPares } from './util-numerico.js';
export { pearson };
import { diagnosticarNube } from './nube.js';

// ---------------------------------------------------------------- utilidades
function paresCompletos(xs, ys) {
    const x = [], y = [], filas = [];   // filas: número de fila original (desde 1) de cada par completo
    for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
        const a = Number(xs[i]), b = Number(ys[i]);
        if (Number.isFinite(a) && Number.isFinite(b) && xs[i] !== '' && ys[i] !== '' && xs[i] !== null && ys[i] !== null) { x.push(a); y.push(b); filas.push(i + 1); }
    }
    return { x: Float64Array.from(x), y: Float64Array.from(y), filas };
}
// p bilateral de una correlación con la t de Student (n − 2 gl): P(|T| > t) = I_{gl/(gl+t²)}(gl/2, 1/2)
export function pDeCorrelacion(r, n) {
    if (!(n > 2) || !Number.isFinite(r)) return NaN;
    if (Math.abs(r) >= 1) return 0;
    const gl = n - 2, t = (r * Math.sqrt(gl)) / Math.sqrt(1 - r * r);
    return betaRegularizada(gl / (gl + t * t), gl / 2, 0.5);
}
// IC por la transformación de Fisher; para ρ de Spearman, EE = √(1,06/(n − 3)) (Fieller, Hartley y Pearson, 1957)
export function icFisher(r, n, factor = 1) {
    if (!(n > 3) || !(Math.abs(r) < 1)) return [NaN, NaN];
    const z = Math.atanh(r), ee = Math.sqrt(factor / (n - 3));
    return [Math.tanh(z - 1.959963984540054 * ee), Math.tanh(z + 1.959963984540054 * ee)];
}
export function rangosMedios(v) {
    const n = v.length, o = new Uint32Array(n);
    for (let i = 0; i < n; i++) o[i] = i;
    o.sort((p, q) => v[p] - v[q]);
    const r = new Float64Array(n);
    for (let i = 0; i < n;) { let j = i; while (j + 1 < n && v[o[j + 1]] === v[o[i]]) j++; const m = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[o[k]] = m; i = j + 1; }
    return r;
}

// ---------------------------------------------------------------- τ-b de Kendall (Knight, 1966): O(n log n) con empates
export function kendallTauB(x, y) {
    const n = x.length, o = new Uint32Array(n);
    for (let i = 0; i < n; i++) o[i] = i;
    o.sort((p, q) => x[p] - x[q] || y[p] - y[q]);
    const n0 = (n * (n - 1)) / 2;
    let n1 = 0, n3 = 0, vt = 0, v1x = 0, v2x = 0;
    for (let i = 0; i < n;) {
        let j = i; while (j + 1 < n && x[o[j + 1]] === x[o[i]]) j++;
        const t = j - i + 1; n1 += (t * (t - 1)) / 2; vt += t * (t - 1) * (2 * t + 5); v1x += t * (t - 1); v2x += t * (t - 1) * (t - 2);
        for (let a = i; a <= j;) { let b = a; while (b + 1 <= j && y[o[b + 1]] === y[o[a]]) b++; const u = b - a + 1; n3 += (u * (u - 1)) / 2; a = b + 1; }
        i = j + 1;
    }
    // intercambios del ordenamiento por y (mergesort) = pares discordantes
    let arr = Float64Array.from(o, i => y[i]), tmp = new Float64Array(n), swaps = 0;
    for (let ancho = 1; ancho < n; ancho *= 2) {
        for (let lo = 0; lo < n; lo += 2 * ancho) {
            const mid = Math.min(lo + ancho, n), hi = Math.min(lo + 2 * ancho, n);
            let i = lo, j = mid, k = lo;
            while (i < mid && j < hi) { if (arr[i] <= arr[j]) tmp[k++] = arr[i++]; else { tmp[k++] = arr[j++]; swaps += mid - i; } }
            while (i < mid) tmp[k++] = arr[i++];
            while (j < hi) tmp[k++] = arr[j++];
        }
        [arr, tmp] = [tmp, arr];
    }
    let n2 = 0, vu = 0, v1y = 0, v2y = 0;
    for (let i = 0; i < n;) { let j = i; while (j + 1 < n && arr[j + 1] === arr[i]) j++; const u = j - i + 1; n2 += (u * (u - 1)) / 2; vu += u * (u - 1) * (2 * u + 5); v1y += u * (u - 1); v2y += u * (u - 1) * (u - 2); i = j + 1; }
    const S = n0 - n1 - n2 + n3 - 2 * swaps, den = Math.sqrt((n0 - n1) * (n0 - n2));
    const tau = den > 0 ? S / den : NaN;
    // varianza asintótica de S con empates (Kendall, 1970), la de scipy.stats.kendalltau(method='asymptotic')
    const varS = (n * (n - 1) * (2 * n + 5) - vt - vu) / 18 + (v1x * v1y) / (2 * n * (n - 1)) + (v2x * v2y) / (9 * n * (n - 1) * (n - 2));
    const z = varS > 0 ? S / Math.sqrt(varS) : NaN;
    return { tau, p: Number.isFinite(z) ? 2 * (1 - cdfNormal(Math.abs(z))) : NaN, S };
}

// ---------------------------------------------------------------- correlación de distancias (Székely et al., 2007)
// medias por fila de |v_i − v_j| en O(n log n) con sumas acumuladas sobre v ordenada
function mediasFila(v) {
    const n = v.length, o = new Uint32Array(n); for (let i = 0; i < n; i++) o[i] = i;
    o.sort((p, q) => v[p] - v[q]);
    const pref = new Float64Array(n + 1); for (let k = 0; k < n; k++) pref[k + 1] = pref[k] + v[o[k]];
    const m = new Float64Array(n);
    for (let k = 0; k < n; k++) { const vi = v[o[k]]; m[o[k]] = ((k * vi - pref[k]) + (pref[n] - pref[k + 1] - (n - k - 1) * vi)) / n; }
    return m;
}
function dcov2(x, y, ax, ay, perm = null) {
    const n = x.length;
    let s1 = 0;
    for (let i = 0; i < n; i++) { const xi = x[i], yi = y[perm ? perm[i] : i]; for (let j = 0; j < n; j++) s1 += Math.abs(xi - x[j]) * Math.abs(yi - y[perm ? perm[j] : j]); }
    s1 /= n * n;
    let s3 = 0, gx = 0, gy = 0;
    for (let i = 0; i < n; i++) { s3 += ax[i] * ay[perm ? perm[i] : i]; gx += ax[i]; gy += ay[i]; }
    return s1 + (gx / n) * (gy / n) - (2 * s3) / n;
}
export function correlacionDistancias(xs, ys, { maximo = 5000, maximoPermutacion = 1500, B = null, semilla = 20261028 } = {}) {
    const [x, y] = submuestraPares(xs, ys, maximo), ax = mediasFila(x), ay = mediasFila(y);
    const vxy = dcov2(x, y, ax, ay), vx = dcov2(x, x, ax, ax), vy = dcov2(y, y, ay, ay);
    const dcor = vx > 0 && vy > 0 ? Math.sqrt(Math.max(0, vxy) / Math.sqrt(vx * vy)) : 0;
    // prueba por permutaciones de Y (sobre una submuestra si hace falta: coste O(n²) por permutación)
    const [px, py] = submuestraPares(xs, ys, maximoPermutacion), pax = mediasFila(px), pay = mediasFila(py), m = px.length;
    const obs = dcov2(px, py, pax, pay), R = B || (m <= 800 ? 199 : 99), perm = new Uint32Array(m);
    let mayores = 0; const u01 = aleatorio(semilla);
    for (let r = 0; r < R; r++) {
        for (let i = 0; i < m; i++) perm[i] = i;
        for (let i = m - 1; i > 0; i--) { const j = Math.floor(u01() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
        if (dcov2(px, py, pax, pay, perm) >= obs - 1e-15) mayores++;
    }
    return { dcor, p: (1 + mayores) / (R + 1), B: R, n: x.length, nPermutacion: m };
}

// ---------------------------------------------------------------- η por tramos de X (razón de correlación)
export function etaPorTramos(x, y) {
    const n = x.length, unicos = [...new Set(x)].sort((a, b) => a - b);
    let grupos;
    if (unicos.length <= 10) grupos = unicos.map(u => { const idx = []; for (let i = 0; i < n; i++) if (x[i] === u) idx.push(i); return idx; });
    else {
        const k = Math.min(10, Math.max(3, Math.floor(n / 30))), r = rangosMedios(x);
        grupos = Array.from({ length: k }, () => []);
        for (let i = 0; i < n; i++) grupos[Math.min(k - 1, Math.floor(((r[i] - 0.5) / n) * k))].push(i);
        grupos = grupos.filter(g => g.length);
    }
    const my = media(y);
    let sst = 0, ssb = 0;
    for (let i = 0; i < n; i++) sst += (y[i] - my) ** 2;
    for (const g of grupos) { let s = 0; for (const i of g) s += y[i]; const mg = s / g.length; ssb += g.length * (mg - my) ** 2; }
    const k = grupos.length, eta = sst > 0 ? Math.sqrt(ssb / sst) : 0, F = k > 1 && n > k && sst > ssb ? (ssb / (k - 1)) / ((sst - ssb) / (n - k)) : NaN;
    return { eta, grupos: k, F, gl: [k - 1, n - k], p: Number.isFinite(F) ? 1 - cdfF(F, k - 1, n - k) : NaN };
}

// ---------------------------------------------------------------- modelos de forma por mínimos cuadrados
// X entra en cada modelo solo a través de sus columnas: los casos con el mismo valor de X se resumen en su número (w) y
// su suma de Y centrada (Sc), y el ajuste sobre los valores DISTINTOS es exacto (con puntajes enteros, unas decenas de
// valores aunque haya cientos de miles de casos; antes, 157 s con n = 200 000). Con más de 20 000 valores distintos
// (X continua en una base enorme) se ajusta sobre una submuestra determinista de 20 000 casos.
const MAXIMO_VALORES_AJUSTE = 20000;
function mcoPonderado(cols, w, Sc, tss) {
    const m = w.length, p = cols.length + 1, A = Array.from({ length: p }, () => new Float64Array(p)), b = new Float64Array(p);
    const col = a => (a === 0 ? null : cols[a - 1]);
    for (let a = 0; a < p; a++) {
        const ca = col(a); let sb = 0;
        for (let j = 0; j < m; j++) sb += (ca ? ca[j] : 1) * Sc[j];
        b[a] = sb;
        for (let c = a; c < p; c++) { const cc = col(c); let s = 0; for (let j = 0; j < m; j++) s += w[j] * (ca ? ca[j] : 1) * (cc ? cc[j] : 1); A[a][c] = A[c][a] = s; }
    }
    const L = Array.from({ length: p }, () => new Float64Array(p));
    for (let r = 0; r < p; r++) for (let c = 0; c <= r; c++) {
        let s = A[r][c]; for (let k = 0; k < c; k++) s -= L[r][k] * L[c][k];
        if (r === c) { if (!(s > 1e-10 * (A[r][r] || 1))) return null; L[r][r] = Math.sqrt(s); } else L[r][c] = s / L[c][c];
    }
    const v = new Float64Array(p); for (let r = 0; r < p; r++) { let s = b[r]; for (let k = 0; k < r; k++) s -= L[r][k] * v[k]; v[r] = s / L[r][r]; }
    const beta = new Float64Array(p); for (let r = p - 1; r >= 0; r--) { let s = v[r]; for (let k = r + 1; k < p; k++) s -= L[k][r] * beta[k]; beta[r] = s / L[r][r]; }
    let expl = 0; for (let a = 0; a < p; a++) expl += beta[a] * b[a];
    return { beta, rss: Math.max(0, tss - expl) };
}
// valores distintos de z (ordenados) con su número de casos y su suma de y
function valoresDistintos(z, y) {
    const n = z.length, o = new Uint32Array(n); for (let i = 0; i < n; i++) o[i] = i;
    o.sort((p, q) => z[p] - z[q]);
    const u = [], w = [], S = [];
    for (let k = 0; k < n;) { let j = k, s = 0; while (j < n && z[o[j]] === z[o[k]]) { s += y[o[j]]; j++; } u.push(z[o[k]]); w.push(j - k); S.push(s); k = j; }
    return { u: Float64Array.from(u), w: Float64Array.from(w), S: Float64Array.from(S) };
}
function perfil1D(rssDe, valores) {
    let mejor = { v: NaN, rss: Infinity };
    valores.forEach(v => { const r = rssDe(v); if (r < mejor.rss) mejor = { v, rss: r }; });
    const k = valores.indexOf(mejor.v);
    let lo = valores[Math.max(0, k - 1)], hi = valores[Math.min(valores.length - 1, k + 1)];
    const g = (Math.sqrt(5) - 1) / 2;
    for (let it = 0; it < 40 && hi - lo > 1e-9 * (1 + Math.abs(hi)); it++) {
        const c = hi - g * (hi - lo), d = lo + g * (hi - lo), rc = rssDe(c), rd = rssDe(d);
        if (rc < rd) hi = d; else lo = c;
        const m = (lo + hi) / 2, rm = rssDe(m); if (rm < mejor.rss) mejor = { v: m, rss: rm };
    }
    return mejor;
}

const NOMBRE_MODELO = { constante: 'Constante (sin relación)', lineal: 'Lineal', cuadratica: 'Cuadrática', cubica: 'Cúbica', potencia: 'Potencia o logarítmica (Box–Cox)', exponencial: 'Exponencial', sigmoide: 'Sigmoide (logística)', escalon: 'Escalón (umbral)', segmentada: 'Segmentada (dos rectas)', ciclica: 'Cíclica (cosinor)' };

export function ajustarModelos(xs, ys) {
    let x = xs, y = ys;
    if (new Set(xs).size > MAXIMO_VALORES_AJUSTE) {
        const paso = xs.length / MAXIMO_VALORES_AJUSTE, ix = Array.from({ length: MAXIMO_VALORES_AJUSTE }, (_, k) => Math.floor(k * paso));
        x = Float64Array.from(ix, i => xs[i]); y = Float64Array.from(ix, i => ys[i]);
    }
    const n = x.length, mx = media(x), sx = Math.sqrt(x.reduce((s, v) => s + (v - mx) ** 2, 0) / n) || 1, z = Float64Array.from(x, v => (v - mx) / sx);
    const { u, w, S } = valoresDistintos(z, y), m = u.length, my = media(y);
    let tss = 0; for (let i = 0; i < n; i++) tss += (y[i] - my) ** 2;
    const Sc = Float64Array.from(S, (s, j) => s - w[j] * my), zmin = u[0], rango = u[m - 1] - zmin || 1;
    const q10 = cuantilPonderado(u, w, 0.1), q90 = cuantilPonderado(u, w, 0.9), modelos = [];
    const agregar = (id, k, rss, pred, detalle = {}) => { if (!Number.isFinite(rss)) return; modelos.push({ id, nombre: NOMBRE_MODELO[id], k, n, rss, r2: tss > 0 ? 1 - rss / tss : 0, aicc: aicc(n, rss, k), predecir: xv => pred((xv - mx) / sx), detalle }); };
    const lineal = fs => mcoPonderado(fs.map(f => Float64Array.from(u, f)), w, Sc, tss);
    const conCols = (fs, beta) => zz => my + beta[0] + fs.reduce((s, f, a) => s + beta[a + 1] * f(zz), 0);
    agregar('constante', 2, tss, () => my);
    for (const [id, grados] of [['lineal', 1], ['cuadratica', 2], ['cubica', 3]]) {
        const fs = Array.from({ length: grados }, (_, g) => zz => zz ** (g + 1)), r = lineal(fs);
        if (r) agregar(id, grados + 2, r.rss, conCols(fs, r.beta), { beta: [my + r.beta[0], ...Array.from(r.beta).slice(1)] });
    }
    // potencia o logarítmica: y = a + b·g_λ(z − zmin + c), transformación de Box–Cox (λ = 0: logaritmo); λ y c perfilados
    {
        const g = (lam, c) => zz => { const t = zz - zmin + c; return Math.abs(lam) < 1e-9 ? Math.log(t) : (Math.pow(t, lam) - 1) / lam; };
        let mejor = { rss: Infinity };
        for (const c of malla(0.01 * rango, 2 * rango, 12, true)) {
            const r = perfil1D(lam => { const q = lineal([g(lam, c)]); return q ? q.rss : Infinity; }, malla(-2, 3, 26));
            if (r.rss < mejor.rss) mejor = { rss: r.rss, lam: r.v, c };
        }
        const f = g(mejor.lam, mejor.c), r = lineal([f]);
        if (r) agregar('potencia', 5, r.rss, conCols([f], r.beta), { lambda: mejor.lam, c: mejor.c * sx });
    }
    // exponencial: y = a + b·e^(κz) (κ > 0: se acelera; κ < 0 con b > 0: decae; con b < 0: satura)
    {
        const r = perfil1D(k => { const q = lineal([zz => Math.exp(k * zz)]); return q ? q.rss : Infinity; }, malla(-4, 4, 41).filter(v => Math.abs(v) > 0.05));
        const f = zz => Math.exp(r.v * zz), q = lineal([f]);
        if (q) agregar('exponencial', 4, q.rss, conCols([f], q.beta), { tasa: r.v / sx });
    }
    // sigmoide: y = a + b/(1 + e^(−κ(z − z₀))); κ y z₀ perfilados
    {
        let mejor = { rss: Infinity };
        for (const z0 of malla(q10, q90, 17)) {
            const r = perfil1D(k => { const q = lineal([zz => 1 / (1 + Math.exp(-k * (zz - z0)))]); return q ? q.rss : Infinity; }, malla(0.5, 30, 20, true));
            if (r.rss < mejor.rss) mejor = { rss: r.rss, k: r.v, z0 };
        }
        const f = zz => 1 / (1 + Math.exp(-mejor.k * (zz - mejor.z0))), q = lineal([f]);
        if (q) agregar('sigmoide', 5, q.rss, conCols([f], q.beta), { centro: mx + mejor.z0 * sx, pendiente: mejor.k / sx });
    }
    // escalón (búsqueda EXACTA en todos los umbrales entre los percentiles 10 y 90: suma de cuadrados de cada corte en O(1)
    // con sumas acumuladas por valor) y segmentada (dos rectas)
    {
        let esc = { rss: Infinity }, cw = 0, cs = 0, total = 0; for (let j = 0; j < m; j++) total += S[j];
        for (let j = 1; j < m; j++) {
            cw += w[j - 1]; cs += S[j - 1];
            if (u[j] < q10 || u[j] > q90) continue;
            const m1 = cs / cw, m2 = (total - cs) / (n - cw), rss = tss - ((cw * (n - cw)) / n) * (m1 - m2) ** 2;
            if (rss < esc.rss) esc = { rss, c: u[j] };
        }
        if (Number.isFinite(esc.rss)) { const f = zz => (zz >= esc.c ? 1 : 0), q = lineal([f]); if (q) agregar('escalon', 4, q.rss, conCols([f], q.beta), { umbral: mx + esc.c * sx }); }
        const enRango = Array.from(u).filter(v => v >= q10 && v <= q90), candidatos = enRango.length > 60 ? malla(enRango[0], enRango[enRango.length - 1], 60) : enRango;
        let seg = { rss: Infinity };
        for (const c of candidatos) { const s = lineal([zz => zz, zz => Math.max(zz - c, 0)]); if (s && s.rss < seg.rss) seg = { rss: s.rss, c }; }
        if (Number.isFinite(seg.rss)) {
            const refino = perfil1D(c => { const s = lineal([zz => zz, zz => Math.max(zz - c, 0)]); return s ? s.rss : Infinity; }, candidatos);
            const c = refino.rss <= seg.rss ? refino.v : seg.c, fs = [zz => zz, zz => Math.max(zz - c, 0)], s = lineal(fs);
            if (s) agregar('segmentada', 5, s.rss, conCols(fs, s.beta), { quiebre: mx + c * sx, pendientes: [s.beta[1] / sx, (s.beta[1] + s.beta[2]) / sx] });
        }
    }
    // cíclica (cosinor): y = a + b·cos(2πz/T) + c·sen(2πz/T), T entre ¼ y 2 veces el rango
    {
        const r = perfil1D(T => { const q = lineal([zz => Math.cos((2 * Math.PI * zz) / T), zz => Math.sin((2 * Math.PI * zz) / T)]); return q ? q.rss : Infinity; }, malla(rango / 4, 2 * rango, 40, true));
        const fs = [zz => Math.cos((2 * Math.PI * zz) / r.v), zz => Math.sin((2 * Math.PI * zz) / r.v)], q = lineal(fs);
        if (q) agregar('ciclica', 5, q.rss, conCols(fs, q.beta), { periodo: r.v * sx });
    }
    const minimo = Math.min(...modelos.map(q => q.aicc));
    modelos.forEach(q => { q.delta = q.aicc - minimo; });
    const sw = modelos.reduce((s, q) => s + Math.exp(-q.delta / 2), 0);
    modelos.forEach(q => { q.peso = Math.exp(-q.delta / 2) / sw; });
    return modelos.sort((a, b) => a.aicc - b.aicc);
}

// ---------------------------------------------------------------- clasificación de la curva (categorías del atlas)
// Los giros y la curvatura se leen donde hay datos, entre los percentiles 5 y 95 de X: en las colas, un modelo flexible
// (p. ej., el coseno) puede añadir giros que ningún dato respalda
function clasificarCurva(modelo, x) {
    const orden = Float64Array.from(x).sort(), lo = cuantil(orden, 0.05), hi = cuantil(orden, 0.95), K = 400;
    const xs = Array.from({ length: K + 1 }, (_, i) => lo + ((hi - lo) * i) / K), f = xs.map(v => modelo.predecir(v));
    const rango = Math.max(...f) - Math.min(...f) || 1, umbral = 0.004 * rango, giros = [];
    let signo = 0;
    for (let i = 0; i < K; i++) { const d = f[i + 1] - f[i]; if (Math.abs(d) < umbral / K * 10) continue; const s = Math.sign(d); if (signo && s !== signo) giros.push({ x: xs[i], tipo: s < 0 ? 'máximo' : 'mínimo' }); signo = s; }
    if (giros.length === 0) {
        const sube = f[K] > f[0];
        if (modelo.id === 'escalon') return { categoria: 'escalon', giros, sube };
        // meseta: sube (o baja) y DESPUÉS se aplana; un tramo plano al principio seguido de una subida fuerte es lo contrario
        // (se acelera, «palo de hockey») y se clasifica por su curvatura
        if (modelo.id === 'segmentada') { const [p1, p2] = modelo.detalle.pendientes; if (Math.abs(p2) < 0.25 * Math.abs(p1) && Math.sign(p1) === (sube ? 1 : -1)) return { categoria: 'meseta', giros, sube }; }
        let conv = 0, conc = 0;
        for (let i = 1; i < K; i++) { const c = f[i + 1] - 2 * f[i] + f[i - 1]; if (c > 1e-9 * rango) conv++; else if (c < -1e-9 * rango) conc++; }
        // S: convexa en la primera mitad y cóncava en la segunda (o al revés si baja)
        let c1 = 0, c2 = 0; for (let i = 1; i < K; i++) { const c = f[i + 1] - 2 * f[i] + f[i - 1]; if (i < K / 2) c1 += c; else c2 += c; }
        if (modelo.id === 'sigmoide' || (Math.sign(c1) !== Math.sign(c2) && Math.min(Math.abs(c1), Math.abs(c2)) > 0.25 * Math.max(Math.abs(c1), Math.abs(c2)))) return { categoria: 'sigmoide', giros, sube };
        const concava = conc > conv;
        return { categoria: sube ? (concava ? 'creciente-frena' : 'creciente-acelera') : (concava ? 'decreciente-acelera' : 'decreciente-frena'), giros, sube };
    }
    if (giros.length === 1) {
        // J (atlas: «un cambio de dirección con ramas muy desiguales»): la rama menor mide menos de un tercio de la mayor
        const fg = modelo.predecir(giros[0].x), izq = Math.abs(f[0] - fg), der = Math.abs(f[K] - fg), asimetria = Math.min(izq, der) / (Math.max(izq, der) || 1);
        return { categoria: asimetria < 1 / 3 ? 'j' : giros[0].tipo === 'máximo' ? 'u-invertida' : 'u', giros, asimetria };
    }
    return { categoria: giros.length === 2 ? 'cubica' : 'ciclica', giros };
}

const CATEGORIAS = {
    'sin-relacion': { nombre: 'sin relación apreciable', grupo: 'sin', coeficiente: 'ninguno' },
    lineal: { nombre: 'lineal', grupo: 'lineal', coeficiente: 'r' },
    'creciente-frena': { nombre: 'monotónica creciente que se frena (logarítmica, potencia compresiva o asintótica)', grupo: 'monotonica', coeficiente: 'ρ' },
    'creciente-acelera': { nombre: 'monotónica creciente que se acelera (exponencial o potencia expansiva)', grupo: 'monotonica', coeficiente: 'ρ' },
    'decreciente-frena': { nombre: 'monotónica decreciente que se frena (decaimiento o potencia decreciente)', grupo: 'monotonica', coeficiente: 'ρ' },
    'decreciente-acelera': { nombre: 'monotónica decreciente que se acelera', grupo: 'monotonica', coeficiente: 'ρ' },
    sigmoide: { nombre: 'sigmoide (en S)', grupo: 'monotonica', coeficiente: 'ρ' },
    escalon: { nombre: 'escalón (umbral)', grupo: 'monotonica', coeficiente: 'ρ' },
    meseta: { nombre: 'segmentada con meseta', grupo: 'monotonica', coeficiente: 'ρ' },
    'u-invertida': { nombre: 'en U invertida (∩)', grupo: 'no-monotonica', coeficiente: 'modelo' },
    u: { nombre: 'en U (∪)', grupo: 'no-monotonica', coeficiente: 'modelo' },
    j: { nombre: 'en J (un giro con ramas desiguales)', grupo: 'no-monotonica', coeficiente: 'modelo' },
    cubica: { nombre: 'cúbica (dos cambios de sentido)', grupo: 'no-monotonica', coeficiente: 'modelo' },
    ciclica: { nombre: 'cíclica', grupo: 'no-monotonica', coeficiente: 'modelo' }
};

// ---------------------------------------------------------------- diagnóstico completo
export function diagnosticarForma(xs, ys, opciones = {}) {
    const { x, y, filas } = paresCompletos(xs, ys), n = x.length;
    if (n < 10) return { error: `Hacen falta al menos 10 casos con ambas variables (hay ${n}).` };
    if (new Set(x).size < 3 || new Set(y).size < 2) return { error: 'Las variables necesitan variación: X al menos 3 valores distintos e Y al menos 2.' };
    const r = pearson(x, y), rho = pearson(rangosMedios(x), rangosMedios(y)), kt = kendallTauB(x, y);
    const coeficientes = {
        r: { valor: r, p: pDeCorrelacion(r, n), ic: icFisher(r, n) },
        rho: { valor: rho, p: pDeCorrelacion(rho, n), ic: icFisher(rho, n, 1.06) },
        tau: { valor: kt.tau, p: kt.p },
        dcor: correlacionDistancias(x, y, opciones),
        eta: etaPorTramos(x, y)
    };
    const modelos = ajustarModelos(x, y);
    // (2026.10.29) decisiones con el error controlado: si hay relación (prueba global) y si no es lineal (prueba de no
    // linealidad de Freedman y Lane), ambas por permutaciones con la búsqueda de parámetros incluida; el AICc solo elige
    // la forma entre las curvas. Antes, con reglas de parsimonia sobre el AICc, el ruido puro «tenía forma» en ≈ 20 % de
    // las bases y una recta débil se llamaba curva en ≈ 24 %.
    // opciones propias (no las de la dCor): un B pequeño pensado para acelerar la dCor no debe llegar a las pruebas que deciden
    const pruebas = pruebasPermutacionForma(x, y, { B: opciones.Bforma, maximo: opciones.maximoForma });
    const mejor = modelos.find(m => m.id !== 'constante' && m.id !== 'lineal');
    let clasificacion;
    if (pruebas.relacion.p >= 0.05) clasificacion = { categoria: 'sin-relacion', giros: [] };
    else if (pruebas.noLineal.p >= 0.05) clasificacion = { categoria: 'lineal', giros: [], sube: r > 0 };
    else clasificacion = clasificarCurva(mejor, x);
    const cat = CATEGORIAS[clasificacion.categoria];
    // τ-b de Kendall en lugar de ρ con muestras pequeñas o con una variable de pocas categorías (p. ej., un ítem Likert):
    // ahí hay muchos rangos empatados; con puntajes totales, ρ con rangos medios es adecuada
    const categoriasX = new Set(x).size, categoriasY = new Set(y).size, categoriasMin = Math.min(categoriasX, categoriasY), pocasCategorias = categoriasMin <= 7;
    // (2026.10.30) también si la relación es LINEAL: con una variable ordinal de pocas categorías, r supondría distancias
    // iguales entre ellas (antes se recomendaba r con un ítem Likert de 5 puntos)
    const coefRecomendado = (cat.coeficiente === 'ρ' && (pocasCategorias || n < 30)) || (cat.coeficiente === 'r' && pocasCategorias) ? 'τ' : cat.coeficiente;
    const modeloDescriptivo = cat.grupo === 'lineal' ? modelos.find(m => m.id === 'lineal') : cat.grupo === 'sin' ? modelos.find(m => m.id === 'constante') : mejor;
    // (2026.10.29) confirmaciones: el cambio de sentido de una U con la prueba de las dos rectas (sin suponer la forma) y con
    // Lind–Mehlum más el vértice de Fieller (suponiendo la cuadrática); la ausencia de relación, con una prueba de equivalencia
    let confirmacion = null;
    if (['u', 'u-invertida', 'j'].includes(clasificacion.categoria)) {
        const extremo = clasificacion.categoria === 'u' ? 'mínimo' : clasificacion.categoria === 'u-invertida' ? 'máximo' : clasificacion.giros[0].tipo;
        confirmacion = { tipo: 'cambio-sentido', extremo, dosRectas: pruebaDosRectas(x, y, extremo), lindMehlum: pruebaLindMehlum(x, y, extremo) };
    } else if (clasificacion.categoria === 'sin-relacion') confirmacion = { tipo: 'equivalencia', tost: equivalenciaCorrelacion(r, n, opciones.limiteEquivalencia ?? 0.1) };
    // curvas evaluadas (para el gráfico) y modelos sin funciones: el resultado viaja desde el Worker (clonado estructurado)
    const orden = Float64Array.from(x).sort(), K = 200, xg = Array.from({ length: K + 1 }, (_, i) => orden[0] + ((orden[orden.length - 1] - orden[0]) * i) / K);
    const curvas = { lineal: xg.map(v => modelos.find(m => m.id === 'lineal').predecir(v)), descriptiva: xg.map(v => modeloDescriptivo.predecir(v)), x: xg };
    // (2026.10.31) la nube de puntos, con los residuos de la forma elegida (una curva no debe pasar por abanico)
    const residuos = Float64Array.from(x, (v, i) => y[i] - modeloDescriptivo.predecir(v));
    const nube = diagnosticarNube(x, y, residuos, { signo: rho >= 0 ? 1 : -1, filas, B: opciones.Bnube, tendenciaNoMonotona: cat.grupo === 'no-monotonica' });
    modelos.forEach(m => { delete m.predecir; });
    return { nube, pruebas, confirmacion, curvas, n, coeficientes, modelos, mejor, modeloDescriptivo, clasificacion, categoria: clasificacion.categoria, descripcion: cat, coefRecomendado, categoriasMin, categorias: { x: categoriasX, y: categoriasY }, x, y };
}
