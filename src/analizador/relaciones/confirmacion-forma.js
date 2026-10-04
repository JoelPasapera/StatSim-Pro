// analizador/relaciones/confirmacion-forma.js — confirmaciones de la forma (sin DOM):
//  · prueba de las dos rectas para relaciones en U (Simonsohn, 2018): spline cúbico penalizado (P-spline; Eilers y Marx,
//    1996) con el suavizado elegido por GCV (Craven y Wahba, 1979), corte por el algoritmo Robin Hood y regresión
//    interrumpida con errores típicos robustos HC3 (MacKinnon y White, 1985);
//  · prueba de Lind y Mehlum (2010) sobre las pendientes del modelo cuadrático en los extremos de los datos (Sasabuchi,
//    1980) e IC de Fieller (1954) para la ubicación del vértice;
//  · prueba de equivalencia TOST para la correlación (Lakens, 2017).
import { cdfNormal, cuantilNormal, betaRegularizada, cuantilF } from '../psicometria/numerico.js';
import { cuantil } from './util-numerico.js';

// ---------------------------------------------------------------- álgebra pequeña
function inversaSimetrica(A) {
    const p = A.length, L = Array.from({ length: p }, () => new Float64Array(p));
    for (let i = 0; i < p; i++) for (let j = 0; j <= i; j++) {
        let s = A[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
        if (i === j) { if (!(s > 1e-12 * (Math.abs(A[i][i]) || 1))) return null; L[i][i] = Math.sqrt(s); } else L[i][j] = s / L[j][j];
    }
    const Li = Array.from({ length: p }, () => new Float64Array(p));
    for (let i = 0; i < p; i++) { Li[i][i] = 1 / L[i][i]; for (let j = 0; j < i; j++) { let s = 0; for (let k = j; k < i; k++) s -= L[i][k] * Li[k][j]; Li[i][j] = s / L[i][i]; } }
    const inv = Array.from({ length: p }, () => new Float64Array(p));
    for (let i = 0; i < p; i++) for (let j = 0; j <= i; j++) { let s = 0; for (let k = i; k < p; k++) s += Li[k][i] * Li[k][j]; inv[i][j] = inv[j][i] = s; }
    return inv;
}
// MCO con constante: β, residuos, (XᵀX)⁻¹ y las filas de X (para HC3)
function mcoCompleto(cols, y) {
    const n = y.length, p = cols.length + 1, fila = i => [1, ...cols.map(c => c[i])];
    const A = Array.from({ length: p }, () => new Float64Array(p)), b = new Float64Array(p);
    for (let i = 0; i < n; i++) { const f = fila(i); for (let a = 0; a < p; a++) { b[a] += f[a] * y[i]; for (let c = a; c < p; c++) A[a][c] += f[a] * f[c]; } }
    for (let a = 0; a < p; a++) for (let c = 0; c < a; c++) A[a][c] = A[c][a];
    const inv = inversaSimetrica(A); if (!inv) return null;
    const beta = Array.from({ length: p }, (_, a) => inv[a].reduce((s, v, c) => s + v * b[c], 0)), resid = new Float64Array(n);
    let rss = 0; for (let i = 0; i < n; i++) { const f = fila(i); resid[i] = y[i] - f.reduce((s, v, a) => s + v * beta[a], 0); rss += resid[i] ** 2; }
    return { beta, inv, resid, rss, n, p, fila };
}
const pBilateralT = (t, gl) => (Number.isFinite(t) ? betaRegularizada(gl / (gl + t * t), gl / 2, 0.5) : NaN);
const pSuperiorT = (t, gl) => (t >= 0 ? pBilateralT(t, gl) / 2 : 1 - pBilateralT(t, gl) / 2);   // P(T > t)
const tCritico = gl => Math.sqrt(cuantilF(0.95, 1, gl));                                 // t de 0,975

// ---------------------------------------------------------------- P-spline (Eilers y Marx, 1996)
const LAMBDAS_PSPLINE = Array.from({ length: 41 }, (_, i) => Math.pow(10, -3 + i / 4));
// valores de las 4 B-splines cúbicas no nulas en x (algoritmo de Cox–de Boor en su forma no recursiva)
function funcionesBase(x, t, j) {
    const N = [1, 0, 0, 0], izq = [0, 0, 0, 0], der = [0, 0, 0, 0];
    for (let k = 1; k <= 3; k++) {
        izq[k] = x - t[j + 1 - k]; der[k] = t[j + k] - x; let guardado = 0;
        for (let r = 0; r < k; r++) { const tmp = N[r] / (der[r + 1] + izq[k - r]); N[r] = guardado + der[r + 1] * tmp; guardado = izq[k - r] * tmp; }
        N[k] = guardado;
    }
    return N;
}
function nudosPSpline(x, nseg = 20) {
    let lo = Infinity, hi = -Infinity; for (const v of x) { if (v < lo) lo = v; if (v > hi) hi = v; }
    hi += 1e-9 * (hi - lo || 1);
    const h = (hi - lo) / nseg;
    return { t: Float64Array.from({ length: nseg + 7 }, (_, i) => lo + (i - 3) * h), lo, h, nseg, K: nseg + 3 };
}
function pSpline(x, y, { nseg = 20, lambdas = LAMBDAS_PSPLINE } = {}) {
    const n = x.length, { t, lo, h, K } = nudosPSpline(x, nseg), span = v => Math.min(nseg + 2, Math.max(3, 3 + Math.floor((v - lo) / h)));
    const BtB = Array.from({ length: K }, () => new Float64Array(K)), Bty = new Float64Array(K), bases = new Float64Array(4 * n), inicio = new Int32Array(n);
    for (let i = 0; i < n; i++) {
        const j = span(x[i]), N = funcionesBase(x[i], t, j); inicio[i] = j - 3;
        for (let a = 0; a < 4; a++) { bases[4 * i + a] = N[a]; Bty[j - 3 + a] += N[a] * y[i]; for (let c = 0; c < 4; c++) BtB[j - 3 + a][j - 3 + c] += N[a] * N[c]; }
    }
    const P = Array.from({ length: K }, () => new Float64Array(K));   // DᵀD, diferencias de segundo orden
    for (let r = 0; r < K - 2; r++) { const d = [1, -2, 1]; for (let a = 0; a < 3; a++) for (let c = 0; c < 3; c++) P[r + a][r + c] += d[a] * d[c]; }
    const ajustar = lambda => {
        const M = BtB.map((fila, a) => fila.map((v, c) => v + lambda * P[a][c])), Mi = inversaSimetrica(M); if (!Mi) return null;
        const beta = Mi.map(fila => fila.reduce((s, v, c) => s + v * Bty[c], 0));
        let edf = 0; for (let a = 0; a < K; a++) for (let c = 0; c < K; c++) edf += Mi[a][c] * BtB[c][a];
        const aj = new Float64Array(n); let rss = 0;
        for (let i = 0; i < n; i++) { let f = 0; for (let a = 0; a < 4; a++) f += bases[4 * i + a] * beta[inicio[i] + a]; aj[i] = f; rss += (y[i] - f) ** 2; }
        return { lambda, beta, Mi, edf, rss, aj, gcv: (n * rss) / (n - edf) ** 2 };
    };
    let mejor = null;
    for (const l of lambdas) { const r = ajustar(l); if (r && (!mejor || r.gcv < mejor.gcv)) mejor = r; }
    const s2 = mejor.rss / (n - mejor.edf), ee = new Float64Array(n);
    for (let i = 0; i < n; i++) { let q = 0; for (let a = 0; a < 4; a++) for (let c = 0; c < 4; c++) q += bases[4 * i + a] * mejor.Mi[inicio[i] + a][inicio[i] + c] * bases[4 * i + c]; ee[i] = Math.sqrt(s2 * q); }
    return { ajustados: mejor.aj, ee, lambda: mejor.lambda, edf: mejor.edf, gcv: mejor.gcv };
}

// ---------------------------------------------------------------- regresión interrumpida con HC3
function regresionInterrumpida(x, y, corte) {
    const n = x.length, bajo = [], alto = [], xl = new Float64Array(n), xh = new Float64Array(n), d = new Float64Array(n);
    for (let i = 0; i < n; i++) { if (x[i] <= corte) { xl[i] = x[i] - corte; bajo.push(x[i]); } else { xh[i] = x[i] - corte; d[i] = 1; alto.push(x[i]); } }
    if (bajo.length < 3 || alto.length < 3 || new Set(bajo).size < 2 || new Set(alto).size < 2) return { error: 'Cada tramo necesita al menos 3 casos y 2 valores distintos de X.' };
    const f = mcoCompleto([xl, xh, d], y); if (!f) return { error: 'La regresión interrumpida no se pudo estimar.' };
    const p = 4, carne = Array.from({ length: p }, () => new Float64Array(p));
    for (let i = 0; i < n; i++) {
        const fi = f.fila(i); let h = 0; for (let a = 0; a < p; a++) for (let c = 0; c < p; c++) h += fi[a] * f.inv[a][c] * fi[c];
        const w = f.resid[i] ** 2 / Math.max(1e-12, (1 - h) ** 2);
        for (let a = 0; a < p; a++) for (let c = 0; c < p; c++) carne[a][c] += w * fi[a] * fi[c];
    }
    const V = f.inv.map((fila, a) => Array.from({ length: p }, (_, c) => { let s = 0; for (let k = 0; k < p; k++) for (let m = 0; m < p; m++) s += fila[k] * carne[k][m] * f.inv[m][c]; return s; }));
    const gl = n - p, lado = k => { const b = f.beta[k], ee = Math.sqrt(V[k][k]), t = b / ee; return { b, ee, t, p: pBilateralT(t, gl) }; };
    return { corte, gl, bajo: { ...lado(1), n: bajo.length }, alto: { ...lado(2), n: alto.length } };
}

// ---------------------------------------------------------------- prueba de las dos rectas (Simonsohn, 2018)
export function pruebaDosRectas(x, y, extremo) {
    const n = x.length;
    if (n < 20) return { error: 'La prueba de las dos rectas necesita al menos 20 casos.' };
    const sp = pSpline(x, y);
    let lo = Infinity, hi = -Infinity; for (const v of x) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const signo = extremo === 'mínimo' ? -1 : 1;
    let iExt = -1;   // valor ajustado más extremo en el INTERIOR del rango (se excluyen los casos en el mínimo y el máximo de X)
    for (let i = 0; i < n; i++) { if (x[i] === lo || x[i] === hi) continue; if (iExt < 0 || signo * sp.ajustados[i] > signo * sp.ajustados[iExt]) iExt = i; }
    if (iExt < 0) return { error: 'X no tiene valores interiores.' };
    const yExt = sp.ajustados[iExt], eeExt = sp.ee[iExt], plana = [];
    for (let i = 0; i < n; i++) if (Math.abs(sp.ajustados[i] - yExt) <= eeExt) plana.push(x[i]);
    plana.sort((a, b) => a - b);
    // si el extremo cae en un borde del rango, uno de los tramos se queda sin datos: no hay cambio de sentido que
    // contrastar, lo que es una RESPUESTA (no se confirma: la relación parece monotónica), no un error del cálculo
    const comun = { extremo, xExtremo: x[iExt], regionPlana: [plana[0], plana[plana.length - 1]], nPlana: plana.length, lambda: sp.lambda, edf: sp.edf };
    const sinTramos = motivo => ({ ...comun, confirmada: false, noAplicable: `el ${extremo} de la curva queda en un borde del rango de X (${motivo.charAt(0).toLowerCase() + motivo.slice(1).replace(/\.$/, '')}), así que no hay dos tramos que contrastar y la relación parece monotónica` });
    const corte1 = cuantil(plana, 0.5), r1 = regresionInterrumpida(x, y, corte1);
    if (r1.error) return sinTramos(r1.error);
    const t1 = Math.abs(r1.bajo.t), t2 = Math.abs(r1.alto.t), q = t1 + t2 > 0 ? t2 / (t1 + t2) : 0.5;
    const corte = cuantil(plana, q), r = regresionInterrumpida(x, y, corte);
    if (r.error) return sinTramos(r.error);
    const esperado = extremo === 'mínimo' ? [-1, 1] : [1, -1];
    const confirmada = r.bajo.p < 0.05 && r.alto.p < 0.05 && Math.sign(r.bajo.b) === esperado[0] && Math.sign(r.alto.b) === esperado[1];
    return { ...r, ...comun, corteInicial: corte1, cuantilCorte: q, confirmada };
}

// ---------------------------------------------------------------- Lind y Mehlum (2010) + Fieller (1954)
export function pruebaLindMehlum(x, y, extremo) {
    const n = x.length; if (n < 10) return { error: 'Hacen falta al menos 10 casos.' };
    let m = 0; for (const v of x) m += v; m /= n;
    const u = Float64Array.from(x, v => v - m), f = mcoCompleto([u, Float64Array.from(u, v => v * v)], y);
    if (!f) return { error: 'El modelo cuadrático no se pudo estimar.' };
    const [, b, c] = f.beta, gl = n - 3, s2 = f.rss / gl, Vbb = s2 * f.inv[1][1], Vcc = s2 * f.inv[2][2], Vbc = s2 * f.inv[1][2];
    let uL = Infinity, uH = -Infinity; for (const v of u) { if (v < uL) uL = v; if (v > uH) uH = v; }
    const pend = uu => { const s = b + 2 * c * uu, ee = Math.sqrt(Vbb + 4 * uu * uu * Vcc + 4 * uu * Vbc); return { s, ee, t: s / ee }; };
    const izq = pend(uL), der = pend(uH), minimo = extremo === 'mínimo';
    const T = minimo ? Math.min(-izq.t, der.t) : Math.min(izq.t, -der.t);   // Sasabuchi: ambos extremos a la vez
    const tc = tCritico(gl), A = 4 * c * c - 4 * tc * tc * Vcc, B = 4 * b * c - 4 * tc * tc * Vbc, C = b * b - tc * tc * Vbb, disc = B * B - 4 * A * C;
    const acotado = A > 0 && disc >= 0, ic = acotado ? [m + (-B - Math.sqrt(disc)) / (2 * A), m + (-B + Math.sqrt(disc)) / (2 * A)] : null;
    const vertice = c !== 0 ? m - b / (2 * c) : NaN;
    return { extremo, gl, izquierda: { x: m + uL, ...izq }, derecha: { x: m + uH, ...der }, t: T, p: pSuperiorT(T, gl), vertice, ic, acotado, dentro: vertice >= m + uL && vertice <= m + uH };
}

// ---------------------------------------------------------------- equivalencia TOST de una correlación (Lakens, 2017)
export function equivalenciaCorrelacion(r, n, limite = 0.1, alfa = 0.05) {
    if (!(n > 3) || !(Math.abs(r) < 1) || !(limite > 0 && limite < 1)) return { error: 'Datos insuficientes para la prueba de equivalencia.' };
    const z = Math.atanh(r), ee = 1 / Math.sqrt(n - 3), zl = Math.atanh(limite), zc = cuantilNormal(1 - alfa);
    const pInferior = 1 - cdfNormal((z + zl) / ee), pSuperior = cdfNormal((z - zl) / ee), p = Math.max(pInferior, pSuperior);
    return { r, n, limite, alfa, p, pInferior, pSuperior, equivalente: p < alfa, ic: [Math.tanh(z - zc * ee), Math.tanh(z + zc * ee)], confianza: 1 - 2 * alfa, limiteMinimo: Math.tanh(Math.abs(z) + zc * ee) };
}
