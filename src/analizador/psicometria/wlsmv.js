// analizador/psicometria/wlsmv.js — AFC/SEM para ítems ordinales por WLSMV (sin DOM).
//
// 1) Estadísticos muestrales: umbrales τ̂ (proporciones acumuladas) y correlaciones policóricas ρ̂ (dos pasos; Olsson, 1979).
// 2) Γ, covarianza asintótica de √n·(ρ̂ − ρ), por las ecuaciones de estimación de Muthén (1984): con las puntuaciones por
//    caso de umbrales (s_τ) y de cada correlación (s_ρ) y las matrices A (esperanza de sus derivadas: productos de primeras
//    derivadas, sin segundas), la función de influencia de cada ρ̂ es ψ_ρ = I_ρ⁻¹·(s_ρ + A_ρτ·ψ_τ), con ψ_τ = I_τ⁻¹·s_τ;
//    Γ = media de ψ·ψᵀ. Así Γ incorpora que los umbrales también se estiman.
// 3) DWLS: F(θ) = (ρ̂ − ρ(θ))ᵀ·W·(ρ̂ − ρ(θ)), W = diag(Γ)⁻¹, con ρ(θ) fuera de la diagonal de Σ* = Λ·Φ·Λᵀ (parametrización
//    delta: varianzas de y* iguales a 1). Errores estándar robustos (sándwich) y χ² corregido en media y varianza
//    («scaled-shifted»; Asparouhov y Muthén, 2010), con el que se calculan CFI, TLI y RMSEA.
import { cuantilNormal, cdfNormal, densidadNormal, cdfNormalBivariada, densidadNormalBivariada } from './numerico.js';
import { policorica } from './policorica.js';
import { multiplicar, traspuesta, inversaDefinidaPositiva } from './algebra.js';
import { implicada, derivadasSigma } from './ram.js';
import { bfgs } from './optimizacion.js';

// ---------------------------------------------------------------- umbrales e influencia de cada ítem
export function codificar(col) {
    const cats = [...new Set(col)].sort((a, b) => a - b), pos = new Map(cats.map((c, i) => [c, i]));
    const cod = Int32Array.from(col, v => pos.get(v)), frec = new Float64Array(cats.length);
    for (const c of cod) frec[c]++;
    const tau = [];
    let acum = 0;
    for (let c = 0; c < cats.length - 1; c++) { acum += frec[c]; tau.push(cuantilNormal(acum / col.length)); }
    return { cod, C: cats.length, tau, frec, categorias: cats };
}

// ψ_τ(c) = I_τ⁻¹·s_τ(c) para cada categoría c: la información de los umbrales es tridiagonal
function influenciaUmbrales(it) {
    const K = it.C - 1, lim = [-Infinity, ...it.tau, Infinity];
    const P = Array.from({ length: it.C }, (_, c) => cdfNormal(lim[c + 1]) - cdfNormal(lim[c]));
    const ph = it.tau.map(densidadNormal);
    const I = Array.from({ length: K }, () => new Array(K).fill(0));
    for (let k = 0; k < K; k++) {
        I[k][k] = ph[k] * ph[k] * (1 / P[k] + 1 / P[k + 1]);
        if (k + 1 < K) I[k][k + 1] = I[k + 1][k] = -ph[k] * ph[k + 1] / P[k + 1];
    }
    const Ii = inversaDefinidaPositiva(I);
    return Array.from({ length: it.C }, (_, c) => {
        const s = new Float64Array(K);
        if (c < K) s[c] = ph[c] / P[c];
        if (c > 0) s[c - 1] = -ph[c - 1] / P[c];
        return Ii.map(fila => fila.reduce((acc, v, m) => acc + v * s[m], 0));
    });
}

// Tabla ψ_ρ[a][b] de una pareja (j, l) evaluada en ρ̂: se usa por caso según sus categorías (a, b)
function influenciaPareja(itJ, itL, rho, psiJ, psiL) {
    const ta = [-Infinity, ...itJ.tau, Infinity], tb = [-Infinity, ...itL.tau, Infinity], raiz = Math.sqrt(1 - rho * rho);
    const I1 = ta.length, J1 = tb.length;
    const G = Array.from({ length: I1 }, () => new Float64Array(J1)), D = Array.from({ length: I1 }, () => new Float64Array(J1));
    const Gh = Array.from({ length: I1 }, () => new Float64Array(J1)), Gk = Array.from({ length: I1 }, () => new Float64Array(J1));
    for (let i = 0; i < I1; i++) for (let j = 0; j < J1; j++) {
        const h = ta[i], k = tb[j];
        G[i][j] = cdfNormalBivariada(h, k, rho);
        D[i][j] = densidadNormalBivariada(h, k, rho);
        // ∂Φ₂(h, k)/∂h = φ(h)·Φ((k − ρh)/√(1 − ρ²));  ∂Φ₂/∂k análogo (0 si la cota derivada es infinita)
        if (Number.isFinite(h)) Gh[i][j] = k === Infinity ? densidadNormal(h) : k === -Infinity ? 0 : densidadNormal(h) * cdfNormal((k - rho * h) / raiz);
        if (Number.isFinite(k)) Gk[i][j] = h === Infinity ? densidadNormal(k) : h === -Infinity ? 0 : densidadNormal(k) * cdfNormal((h - rho * k) / raiz);
    }
    const Kj = itJ.C - 1, Kl = itL.C - 1, celdas = [];
    let Irho = 0;
    const Aj = new Float64Array(Kj), Al = new Float64Array(Kl);
    for (let a = 0; a < itJ.C; a++) for (let b = 0; b < itL.C; b++) {
        const pi = Math.max(G[a + 1][b + 1] - G[a][b + 1] - G[a + 1][b] + G[a][b], 1e-300);
        const pr = D[a + 1][b + 1] - D[a][b + 1] - D[a + 1][b] + D[a][b];
        Irho += (pr * pr) / pi;
        // derivadas de π_ab respecto de los umbrales que la delimitan (superior a e inferior a − 1 de cada ítem)
        if (a < Kj) Aj[a] -= (pr * (Gh[a + 1][b + 1] - Gh[a + 1][b])) / pi;
        if (a > 0) Aj[a - 1] -= (pr * -(Gh[a][b + 1] - Gh[a][b])) / pi;
        if (b < Kl) Al[b] -= (pr * (Gk[a + 1][b + 1] - Gk[a][b + 1])) / pi;
        if (b > 0) Al[b - 1] -= (pr * -(Gk[a + 1][b] - Gk[a][b])) / pi;
        celdas.push({ a, b, s: pr / pi });
    }
    const tabla = Array.from({ length: itJ.C }, () => new Float64Array(itL.C));
    for (const { a, b, s } of celdas) {
        let v = s;
        for (let k = 0; k < Kj; k++) v += Aj[k] * psiJ[a][k];
        for (let m = 0; m < Kl; m++) v += Al[m] * psiL[b][m];
        tabla[a][b] = v / Irho;
    }
    return { tabla, informacion: Irho };
}

/**
 * Estadísticos muestrales para WLSMV: ρ̂ (matriz p×p), sus parejas [j, l] en orden y Γ (covarianza asintótica de √n·ρ̂).
 * cols: columnas completas de ítems enteros.
 */
// opciones.completa: Γ también con los umbrales (primero, ítem a ítem) — la usa la invarianza ordinal, que los restringe
export function estadisticosOrdinales(cols, { completa = false } = {}) {
    const p = cols.length, n = cols[0].length;
    const items = cols.map(codificar);
    const sinVariacion = items.map((it, j) => (it.C < 2 ? j : -1)).filter(j => j >= 0);
    if (sinVariacion.length) return { error: 'Hay ítems sin variación (una sola categoría).', sinVariacion };
    const psiTau = items.map(influenciaUmbrales);
    const R = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => (i === j ? 1 : 0)));
    const pares = [], tablas = [], corregidas = [];
    for (let j = 0; j < p; j++) for (let l = j + 1; l < p; l++) {
        const pc = policorica(cols[j], cols[l], { corregirCeros: true }), rho = pc.rho;
        if (pc.corregida) corregidas.push([j, l, pc.esperada]);
        if (!Number.isFinite(rho)) return { error: `No se pudo estimar la correlación policórica entre los ítems ${j + 1} y ${l + 1}.` };
        R[j][l] = R[l][j] = rho;
        pares.push([j, l]);
        tablas.push(influenciaPareja(items[j], items[l], rho, psiTau[j], psiTau[l]).tabla);
    }
    // Γ = media de (ψ − ψ̄)(ψ − ψ̄)ᵀ sobre los casos (ψ̄ ≈ 0: ρ̂ y τ̂ anulan sus ecuaciones); con «completa», las columnas
    // de los umbrales (ψ_τ de cada ítem) van delante de las de las correlaciones
    const P = pares.length, offs = [];
    const K = completa ? items.reduce((s, it) => { offs.push(s); return s + it.C - 1; }, 0) : 0, D = K + P;
    const V = Array.from({ length: n }, () => new Float64Array(D)), media = new Float64Array(D);
    for (let i = 0; i < n; i++) {
        const v = V[i];
        if (completa) items.forEach((it, j) => { const ps = psiTau[j][it.cod[i]]; for (let k = 0; k < ps.length; k++) v[offs[j] + k] = ps[k]; });
        for (let r = 0; r < P; r++) { const [j, l] = pares[r]; v[K + r] = tablas[r][items[j].cod[i]][items[l].cod[i]]; }
        for (let a = 0; a < D; a++) media[a] += v[a] / n;
    }
    const GammaCompleta = Array.from({ length: D }, () => new Float64Array(D));
    for (let i = 0; i < n; i++) {
        const v = V[i];
        for (let r = 0; r < D; r++) { const d = v[r] - media[r]; if (d === 0) continue; const Gr = GammaCompleta[r]; for (let s = r; s < D; s++) Gr[s] += d * (v[s] - media[s]); }
    }
    for (let r = 0; r < D; r++) for (let s = r; s < D; s++) { GammaCompleta[r][s] /= n; GammaCompleta[s][r] = GammaCompleta[r][s]; }
    const Gamma = K ? GammaCompleta.slice(K).map(f => f.slice(K)) : GammaCompleta;
    const mala = pares.findIndex((_, r) => !(Gamma[r][r] > 0 && Number.isFinite(Gamma[r][r])));
    if (mala >= 0) return { error: `La correlación policórica entre los ítems ${pares[mala][0] + 1} y ${pares[mala][1] + 1} está en el límite (±1) y su varianza asintótica no es válida: agrupa categorías poco frecuentes o revisa esos ítems.` };
    return { R, pares, Gamma, n, items, corregidas, ...(completa ? { GammaCompleta, K, offs, umbrales: items.flatMap(it => it.tau) } : {}) };
}

// ---------------------------------------------------------------- ajuste DWLS
// Parámetros libres del WLSMV: los del modelo RAM salvo las varianzas residuales de los ítems (las fija la escala de y*)
export function parametrosWLSMV(est) {
    return est.libres.map((pl, k) => k).filter(k => { const pl = est.libres[k]; return !(pl.mat === 'S' && pl.i === pl.j && pl.i < est.nObs); });
}

export function ajustarDWLS(est, sm, { maxIter = 3000, tolGrad = 1e-8 } = {}) {
    const libres = parametrosWLSMV(est), q = libres.length, P = sm.pares.length;
    const w = sm.pares.map((_, r) => 1 / sm.Gamma[r][r]), rhoObs = sm.pares.map(([j, l]) => sm.R[j][l]);
    const completo = t => { const th = est.libres.map(() => 0); libres.forEach((k, a) => { th[k] = t[a]; }); return th; };   // residuales en 0: diag(E) = comunalidad
    const residuo = t => { const m = implicada(est, completo(t)); return m ? { m, e: sm.pares.map(([j, l], r) => rhoObs[r] - m.E[j][l]) } : null; };
    const f = t => { const x = residuo(t); if (!x) return 1e10; let s = 0; x.e.forEach((e, r) => { s += w[r] * e * e; }); return s; };
    const delta = m => { const D = derivadasSigma(est, m); return sm.pares.map(([j, l]) => libres.map(k => D[k][j][l])); };   // P × q
    const g = t => {
        const x = residuo(t);
        if (!x) return new Array(q).fill(NaN);
        const Dl = delta(x.m), grad = new Array(q).fill(0);
        for (let r = 0; r < P; r++) { const c = -2 * w[r] * x.e[r]; for (let a = 0; a < q; a++) grad[a] += c * Dl[r][a]; }
        return grad;
    };
    const t0 = libres.map(k => est.libres[k].ini);
    const opt = bfgs(f, g, t0, { maxIter, tolGrad });
    const x = residuo(opt.x), Dl = delta(x.m);
    return { opt, theta: completo(opt.x), libres, w, rhoObs, residuos: x.e, Delta: Dl, E: x.m.E, Fmin: opt.f, funciones: { f, g } };
}

// ---------------------------------------------------------------- inferencia robusta y ajuste
const traza = M => M.reduce((s, f, i) => s + f[i], 0);

export function inferenciaWLSMV(sm, fit) {
    const n = sm.n, P = sm.pares.length, q = fit.libres.length, W = fit.w, G = sm.Gamma, D = fit.Delta;
    const WD = D.map((fila, r) => fila.map(v => v * W[r]));                     // W·Δ (P × q)
    const H = multiplicar(traspuesta(D), WD);                                   // Δᵀ·W·Δ (q × q)
    const Hi = inversaDefinidaPositiva(H);
    if (!Hi) return { error: 'La matriz Δᵀ·W·Δ no es invertible: el modelo no está identificado con estos datos.' };
    const GWD = multiplicar(G.map(f => Array.from(f)), WD);                    // Γ·W·Δ (P × q)
    const M = multiplicar(traspuesta(WD), GWD);                                 // Δᵀ·W·Γ·W·Δ
    const Vr = multiplicar(multiplicar(Hi, M), Hi);                             // covarianza robusta de √n·θ̂
    const se = Vr.map((f, i) => (f[i] > 0 ? Math.sqrt(f[i] / n) : NaN));
    // U = W − W·Δ·H⁻¹·Δᵀ·W;  a = tr(UΓ) y b = tr((UΓ)²) sin formar U (O(P² + P·q²) en vez de O(P³)):
    //   tr(UΓ) = tr(WΓ) − tr(H⁻¹M);  tr((UΓ)²) = tr((WΓ)²) − 2·tr(H⁻¹·(ΓWΔ)ᵀ·W·(ΓWΔ)) + tr((H⁻¹M)²)
    let trWG = 0, trWG2 = 0;
    for (let r = 0; r < P; r++) { trWG += W[r] * G[r][r]; for (let s = 0; s < P; s++) trWG2 += W[r] * G[r][s] * W[s] * G[s][r]; }
    const HiM = multiplicar(Hi, M), N = multiplicar(traspuesta(GWD), GWD.map((fila, r) => fila.map(v => v * W[r])));
    const a = trWG - traza(HiM);
    const b = trWG2 - 2 * traza(multiplicar(Hi, N)) + HiM.reduce((s, f, i) => s + f.reduce((t, v, j) => t + v * HiM[j][i], 0), 0);
    const gl = P - q, T = n * fit.Fmin;
    const corregir = (T, gl, a, b) => (gl > 0 ? Math.sqrt(gl / b) * T + gl - Math.sqrt((gl * a * a) / b) : T);
    // Línea base: correlaciones nulas (umbrales libres): U = W
    const Tb = n * sm.pares.reduce((s, [j, l], r) => s + W[r] * sm.R[j][l] ** 2, 0);
    const chi2 = corregir(T, gl, a, b), chi2b = corregir(Tb, P, trWG, trWG2);   // línea base: U = W
    const CFI = gl > 0 ? 1 - Math.max(chi2 - gl, 0) / Math.max(chi2b - P, chi2 - gl, 1e-12) : 1;
    const TLI = gl > 0 ? ((chi2b / P) - (chi2 / gl)) / ((chi2b / P) - 1) : NaN;
    const RMSEA = gl > 0 ? Math.sqrt(Math.max(chi2 - gl, 0) / (gl * n)) : 0;
    const SRMR = Math.sqrt(fit.residuos.reduce((s, e) => s + e * e, 0) / P);
    return { se, T, chi2, gl, chi2b, glb: P, CFI, TLI, RMSEA, SRMR, correccion: { a, b }, Tb };
}
