// analizador/relaciones/pruebas-permutacion-forma.js — decisiones del diagnóstico con el error controlado (sin DOM).
// Buscar el mejor umbral, periodo o curvatura entre cientos de candidatos mejora el ajuste por azar, y el AICc no lo
// cobra (en ruido puro, alguna forma «ganaba» en ≈ 20 % de las bases). Aquí el estadístico incluye la búsqueda entera y
// se calibra por permutaciones:
//  · prueba de relación: combina, por el mínimo p de Westfall y Young (1993), la mejora de la RECTA y la del mejor modelo
//    sobre el modelo sin relación, permutando Y (error exacto del 5 %);
//  · prueba de no linealidad: mejora de la mejor curva sobre la recta, por bootstrap salvaje de los residuos de la recta
//    (signos de Rademacher; Davidson y Flachaire, 2008): cada residuo sigue unido a su X, así que es válido aunque la
//    dispersión cambie. Hasta la 2026.10.31 se permutaban los residuos (Freedman y Lane, 1983), lo que supone varianza
//    constante: con una nube triangular de media recta declaraba curva en el 18,8 % de las bases (ahora, 6,3 %).
// Los diseños dependen solo de X: se construyen sobre sus valores DISTINTOS (exacto) y cada permutación cuesta una suma
// por caso más un producto por columna y valor, así que se usa la base completa (revisión 2026.10.30: antes se decidía
// sobre una submuestra de 1 500 casos y, con n = 50 000 y r = .04, p = 3·10⁻²³, salía «sin relación»). Solo con más de
// 2 000 valores distintos (X continua) se submuestrea, y entonces la prueba de relación se combina por Bonferroni con la
// r de Pearson de la base completa, para que la decisión nunca contradiga a la tabla de coeficientes.
import { betaRegularizada } from '../psicometria/numerico.js';
import { media, malla, cuantilPonderado, aicc, pearson, aleatorio } from './util-numerico.js';

const MAXIMO_VALORES_PERMUTACION = 2000;

// diseños candidatos (sin la constante) sobre los valores distintos de X; producto interno ponderado por su número de casos
function disenosCandidatos(x) {
    const n = x.length, mx = media(x), sx = Math.sqrt(x.reduce((s, v) => s + (v - mx) ** 2, 0) / n) || 1, z = Float64Array.from(x, v => (v - mx) / sx);
    const o = new Uint32Array(n); for (let i = 0; i < n; i++) o[i] = i;
    o.sort((p, q) => z[p] - z[q]);
    const uL = [], wL = [], grupo = new Int32Array(n);
    for (let k = 0; k < n;) { let j = k; while (j < n && z[o[j]] === z[o[k]]) { grupo[o[j]] = uL.length; j++; } uL.push(z[o[k]]); wL.push(j - k); k = j; }
    const u = Float64Array.from(uL), w = Float64Array.from(wL), m = u.length, zmin = u[0], rango = u[m - 1] - zmin || 1;
    const q10 = cuantilPonderado(u, w, 0.1), q90 = cuantilPonderado(u, w, 0.9), lista = [];
    const ortonormal = fs => {
        const Q = [];
        for (const f of fs) {
            const v = Float64Array.from(u, f); let mv = 0; for (let j = 0; j < m; j++) mv += w[j] * v[j]; mv /= n;
            for (let j = 0; j < m; j++) v[j] -= mv;
            for (const q of Q) { let d = 0; for (let j = 0; j < m; j++) d += w[j] * q[j] * v[j]; for (let j = 0; j < m; j++) v[j] -= d * q[j]; }
            let s = 0; for (let j = 0; j < m; j++) s += w[j] * v[j] * v[j];
            if (!(s > 1e-10 * n)) return null;
            const r = Math.sqrt(s); for (let j = 0; j < m; j++) v[j] /= r;
            Q.push(v);
        }
        return Q;
    };
    const agregar = (familia, k, fs) => { const Q = ortonormal(fs); if (Q) lista.push({ familia, k, Q }); };
    agregar('lineal', 3, [t => t]); agregar('cuadratica', 4, [t => t, t => t * t]); agregar('cubica', 5, [t => t, t => t * t, t => t ** 3]);
    for (const c of malla(0.01 * rango, 2 * rango, 12, true)) for (const lam of malla(-2, 3, 26)) agregar('potencia', 5, [t => { const s = t - zmin + c; return Math.abs(lam) < 1e-9 ? Math.log(s) : (Math.pow(s, lam) - 1) / lam; }]);
    for (const k of malla(-4, 4, 41).filter(v => Math.abs(v) > 0.05)) agregar('exponencial', 4, [t => Math.exp(k * t)]);
    for (const z0 of malla(q10, q90, 17)) for (const k of malla(0.5, 30, 20, true)) agregar('sigmoide', 5, [t => 1 / (1 + Math.exp(-k * (t - z0)))]);
    const enRango = Array.from(u).filter(v => v >= q10 && v <= q90), candidatos = enRango.length > 60 ? malla(enRango[0], enRango[enRango.length - 1], 60) : enRango;
    for (const c of candidatos) agregar('segmentada', 5, [t => t, t => Math.max(t - c, 0)]);
    for (const T of malla(rango / 4, 2 * rango, 40, true)) agregar('ciclica', 5, [t => Math.cos((2 * Math.PI * t) / T), t => Math.sin((2 * Math.PI * t) / T)]);
    const cortes = []; for (let j = 1; j < m; j++) if (u[j] >= q10 && u[j] <= q90) cortes.push(j);   // escalón: índices de corte
    return { n, m, w, grupo, lista, cortes };
}
// AICc mínimo por familia para un vector y (la búsqueda completa en cada evaluación)
function mejoresAICc(d, y) {
    const { n, m, w, grupo } = d, S = new Float64Array(m);
    let sy = 0; for (let i = 0; i < n; i++) { S[grupo[i]] += y[i]; sy += y[i]; }
    const my = sy / n; let tss = 0; for (let i = 0; i < n; i++) tss += (y[i] - my) ** 2;
    const mejor = { constante: aicc(n, tss, 2) };
    for (const { familia, k, Q } of d.lista) {
        let expl = 0; for (const q of Q) { let s = 0; for (let j = 0; j < m; j++) s += q[j] * S[j]; expl += s * s; }
        const v = aicc(n, tss - expl, k); if (!(mejor[familia] <= v)) mejor[familia] = v;
    }
    let rssEsc = Infinity, cw = 0, cs = 0, c = 0;
    for (const j of d.cortes) { while (c < j) { cw += w[c]; cs += S[c]; c++; } const m1 = cs / cw, m2 = (sy - cs) / (n - cw), r = tss - ((cw * (n - cw)) / n) * (m1 - m2) ** 2; if (r < rssEsc) rssEsc = r; }
    if (Number.isFinite(rssEsc)) mejor.escalon = aicc(n, rssEsc, 4);
    return mejor;
}
const NO_LINEALES = ['cuadratica', 'cubica', 'potencia', 'exponencial', 'sigmoide', 'escalon', 'segmentada', 'ciclica'];
const estadisticoGlobal = m => m.constante - Math.min(...Object.entries(m).filter(([f]) => f !== 'constante').map(([, v]) => v));
const estadisticoNoLineal = m => m.lineal - Math.min(...NO_LINEALES.filter(f => f in m).map(f => m[f]));

function pPearson(x, y) {
    const n = x.length, r = pearson(x, y), gl = n - 2, t = (r * Math.sqrt(gl)) / Math.sqrt(Math.max(1e-300, 1 - r * r));
    return Math.abs(r) >= 1 ? 0 : betaRegularizada(gl / (gl + t * t), gl / 2, 0.5);
}
export function pruebasPermutacionForma(xs, ys, { maximoValores = MAXIMO_VALORES_PERMUTACION, B = null, semilla = 20261029 } = {}) {
    let x = Float64Array.from(xs), y = Float64Array.from(ys), submuestra = false;
    if (new Set(x).size > maximoValores) {
        const paso = x.length / maximoValores, ix = Array.from({ length: maximoValores }, (_, k) => Math.floor(k * paso));
        x = Float64Array.from(ix, i => xs[i]); y = Float64Array.from(ix, i => ys[i]); submuestra = true;
    }
    // al menos 99 permutaciones: estas pruebas DECIDEN, y con menos la p mínima (1/(B + 1)) podría no bajar de .05
    const n = x.length, d = disenosCandidatos(x), R = Math.max(99, B || (n <= 800 ? 199 : 99));
    const u01 = aleatorio(semilla);
    const barajar = v => { for (let i = v.length - 1; i > 0; i--) { const j = Math.floor(u01() * (i + 1)); const t = v[i]; v[i] = v[j]; v[j] = t; } return v; };
    const obs = mejoresAICc(d, y), Tg = estadisticoGlobal(obs), Tl = obs.constante - obs.lineal, Tnl = estadisticoNoLineal(obs);
    const Ag = new Float64Array(R + 1), Al = new Float64Array(R + 1); Ag[0] = Tg; Al[0] = Tl;
    // ajuste lineal (para el bootstrap salvaje): ŷ y residuos
    const ql = d.lista.find(e => e.familia === 'lineal').Q[0], my = media(y); let b = 0; for (let i = 0; i < n; i++) b += ql[d.grupo[i]] * y[i];
    const ajuste = Float64Array.from(d.grupo, g => my + b * ql[g]), resid = Float64Array.from(y, (v, i) => v - ajuste[i]);
    let mayNL = 0; const yp = new Float64Array(n);
    for (let r = 0; r < R; r++) {
        yp.set(y); barajar(yp); const mp = mejoresAICc(d, yp); Ag[r + 1] = estadisticoGlobal(mp); Al[r + 1] = mp.constante - mp.lineal;
        for (let i = 0; i < n; i++) yp[i] = ajuste[i] + (u01() < 0.5 ? -resid[i] : resid[i]);   // bootstrap salvaje (Rademacher)
        if (estadisticoNoLineal(mejoresAICc(d, yp)) >= Tnl - 1e-9) mayNL++;
    }
    // mínimo p en una sola etapa (Westfall y Young, 1993): el conjunto de referencia son lo observado y las R permutaciones
    const pDe = A => { const orden = Float64Array.from(A).sort(), k = A.length; return Float64Array.from(A, t => { let lo = 0, hi = k; while (lo < hi) { const mid = (lo + hi) >> 1; if (orden[mid] >= t - 1e-9) hi = mid; else lo = mid + 1; } return (k - lo) / k; }); };
    const pg = pDe(Ag), pl = pDe(Al), minimo = Float64Array.from(pg, (v, i) => Math.min(v, pl[i]));
    let bajos = 0; for (let i = 0; i <= R; i++) if (minimo[i] <= minimo[0] + 1e-12) bajos++;
    const pMinimo = bajos / (R + 1), pRecta = submuestra ? pPearson(Float64Array.from(xs), Float64Array.from(ys)) : null;
    const relacion = submuestra ? { p: Math.min(1, 2 * Math.min(pMinimo, pRecta)), metodo: 'bonferroni', pMinimo, pRectaCompleta: pRecta } : { p: pMinimo, metodo: 'minimo-p' };
    return { relacion, global: { estadistico: Tg, p: pg[0] }, lineal: { estadistico: Tl, p: pl[0] }, noLineal: { estadistico: Tnl, p: (1 + mayNL) / (R + 1) }, B: R, n, nTotal: xs.length, valores: d.m, submuestra };
}
