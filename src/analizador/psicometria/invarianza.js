// analizador/psicometria/invarianza.js — invarianza de medición por AFC multigrupo con estructura de medias, estimada por
// máxima verosimilitud (sin DOM). Por grupo: Σ_g = Λ_g·Φ_g·Λ_gᵀ + Θ_g y μ_g = ν_g + Λ_g·κ_g, con la primera carga de cada
// factor fija en 1. Niveles anidados (Meredith, 1993; Vandenberg y Lance, 2000):
//   configural — misma estructura, todo libre por grupo (κ = 0);   métrica — cargas iguales;
//   escalar — además interceptos iguales (κ libre salvo en el grupo de referencia);   estricta — además residuos iguales.
// F = Σ_g (n_g/N)·[log|Σ_g| + tr(S_g·Σ_g⁻¹) + (x̄_g − μ_g)ᵀΣ_g⁻¹(x̄_g − μ_g) − log|S_g| − p], con S_g de divisor n_g, y
// χ² = N·F. Gradiente analítico, BFGS y errores estándar por la hessiana (diferencias centrales del gradiente).
import { inversaYLogDet, inversaDefinidaPositiva } from './algebra.js';
import { bfgs } from './optimizacion.js';
import { gammaRegularizadaQ, ncpParaProbabilidad, cdfNormal } from './numerico.js';

export const NIVELES = [
    { clave: 'configural', nombre: 'Configural', cargas: false, interceptos: false, residuos: false },
    { clave: 'metrica', nombre: 'Métrica', cargas: true, interceptos: false, residuos: false },
    { clave: 'escalar', nombre: 'Escalar', cargas: true, interceptos: true, residuos: false },
    { clave: 'estricta', nombre: 'Estricta', cargas: true, interceptos: true, residuos: true }
];
// Chen (2007): la invarianza no se sostiene si el CFI cae .010 o más y, además, el RMSEA sube .015 o más o el SRMR
// sube .030 (cargas) o .010 (interceptos y residuos) o más
export const CRITERIOS_CHEN = { dCFI: -0.010, dRMSEA: 0.015, dSRMR: { metrica: 0.030, escalar: 0.010, estricta: 0.010 } };

const pChi2 = (x, gl) => (gl > 0 ? gammaRegularizadaQ(gl / 2, Math.max(x, 0) / 2) : NaN);   // cola superior

// ---------------------------------------------------------------- datos por grupo
export function estadisticosPorGrupo(filas, items, variableGrupo, { minimoPorGrupo = null } = {}) {
    const p = items.length, porGrupo = new Map();
    let excluidos = 0;
    for (const f of filas) {
        const gv = f[variableGrupo], x = items.map(c => { const v = f[c]; return v === '' || v === null || v === undefined ? NaN : typeof v === 'string' ? Number(v.trim().replace(',', '.')) : Number(v); });
        if (gv === '' || gv === null || gv === undefined || x.some(v => !Number.isFinite(v))) { excluidos++; continue; }
        const k = String(gv);
        (porGrupo.get(k) || porGrupo.set(k, []).get(k)).push(x);
    }
    const claves = [...porGrupo.keys()].sort((a, b) => (Number.isFinite(+a) && Number.isFinite(+b) ? a - b : a.localeCompare(b, 'es')));
    if (claves.length < 2) return { error: `La variable «${variableGrupo}» necesita al menos 2 grupos con datos completos.` };
    if (claves.length > 8) return { error: `La variable «${variableGrupo}» tiene ${claves.length} grupos: la invarianza admite hasta 8.` };
    const minimo = minimoPorGrupo ?? p + 5, grupos = [];
    for (const nombre of claves) {
        const X = porGrupo.get(nombre), n = X.length;
        if (n < minimo) return { error: `El grupo «${nombre}» tiene ${n} casos completos; hacen falta al menos ${minimo} para ${p} ítems.` };
        const media = items.map((_, j) => X.reduce((s, x) => s + x[j], 0) / n);
        const S = items.map((_, i) => items.map((_, j) => X.reduce((s, x) => s + (x[i] - media[i]) * (x[j] - media[j]), 0) / n));
        const inv = inversaYLogDet(S);
        if (!inv) {
            const constante = items.filter((_, j) => S[j][j] <= 1e-12);
            return { error: `En el grupo «${nombre}» la matriz de covarianzas no es definida positiva${constante.length ? ` (sin variación: ${constante.join(', ')})` : ' (ítems redundantes o muy pocos casos)'}.` };
        }
        grupos.push({ nombre, n, media, S, logDetS: inv.logDet });
    }
    return { grupos, excluidos, N: grupos.reduce((s, g) => s + g.n, 0) };
}

// ---------------------------------------------------------------- especificación de un nivel
export function especificar(modelo, items, G, nivel) {
    const factores = Object.keys(modelo.latentes), p = items.length, m = factores.length, pos = new Map(items.map((v, i) => [v, i]));
    const claves = new Map(), libres = [];
    const indice = (clave, info) => { if (!claves.has(clave)) { claves.set(clave, libres.length); libres.push({ clave, ...info }); } return claves.get(clave); };
    const marcadores = factores.map(f => pos.get(modelo.latentes[f][0]));
    const vistos = new Set(), covs = [];
    for (const [a, b] of modelo.covars || []) {
        if (!pos.has(a) || !pos.has(b) || a === b) continue;
        const i = Math.min(pos.get(a), pos.get(b)), j = Math.max(pos.get(a), pos.get(b));
        if (!vistos.has(`${i}:${j}`)) { vistos.add(`${i}:${j}`); covs.push([items[i], items[j]]); }
    }
    const grupos = Array.from({ length: G }, (_, g) => {
        const L = [], F = [], T = [], N = [], K = [];
        factores.forEach((f, jf) => modelo.latentes[f].forEach((it, r) => {
            const i = pos.get(it);
            if (r === 0) L.push({ i, j: jf, valor: 1 });
            else L.push({ i, j: jf, k: indice(nivel.cargas ? `L:${i}:${jf}` : `${g}:L:${i}:${jf}`, { tipo: 'carga', i, j: jf, grupo: nivel.cargas ? null : g }) });
        }));
        for (let a = 0; a < m; a++) for (let b = a; b < m; b++) F.push({ i: a, j: b, k: indice(`${g}:F:${a}:${b}`, { tipo: a === b ? 'varLatente' : 'covLatente', i: a, j: b, grupo: g }) });
        for (let i = 0; i < p; i++) T.push({ i, j: i, k: indice(nivel.residuos ? `T:${i}` : `${g}:T:${i}`, { tipo: 'varResidual', i, j: i, grupo: nivel.residuos ? null : g }) });
        for (const [a, b] of covs) { const i = pos.get(a), j = pos.get(b); T.push({ i, j, k: indice(`${g}:T:${i}:${j}`, { tipo: 'covResidual', i, j, grupo: g }) }); }
        for (let i = 0; i < p; i++) N.push({ i, k: indice(nivel.interceptos ? `N:${i}` : `${g}:N:${i}`, { tipo: 'intercepto', i, grupo: nivel.interceptos ? null : g }) });
        for (let jf = 0; jf < m; jf++) K.push(nivel.interceptos && g > 0 ? { i: jf, k: indice(`${g}:K:${jf}`, { tipo: 'mediaLatente', i: jf, grupo: g }) } : { i: jf, valor: 0 });
        return { L, F, T, N, K };
    });
    return { factores, items, p, m, marcadores, grupos, libres, q: libres.length, nivel };
}

function iniciales(esp, datos) {
    return esp.libres.map(pl => {
        const gs = pl.grupo === null ? datos.map((_, g) => g) : [pl.grupo];
        const prom = fn => gs.reduce((s, g) => s + fn(datos[g]), 0) / gs.length;
        if (pl.tipo === 'carga') return 1;
        if (pl.tipo === 'varLatente') { const mk = esp.marcadores[pl.i]; return 0.5 * prom(d => d.S[mk][mk]); }
        if (pl.tipo === 'varResidual') return 0.5 * prom(d => d.S[pl.i][pl.i]);
        if (pl.tipo === 'intercepto') return prom(d => d.media[pl.i]);
        return 0;
    });
}

// ---------------------------------------------------------------- función de ajuste y gradiente analítico
function matrices(esp, g, x) {
    const { p, m } = esp, e = esp.grupos[g];
    const L = Array.from({ length: p }, () => new Float64Array(m)), F = Array.from({ length: m }, () => new Float64Array(m)), T = Array.from({ length: p }, () => new Float64Array(p));
    for (const s of e.L) L[s.i][s.j] = s.k === undefined ? s.valor : x[s.k];
    for (const s of e.F) F[s.i][s.j] = F[s.j][s.i] = x[s.k];
    for (const s of e.T) T[s.i][s.j] = T[s.j][s.i] = x[s.k];
    return { L, F, T, nu: e.N.map(s => x[s.k]), ka: e.K.map(s => (s.k === undefined ? s.valor : x[s.k])) };
}
function implicadas({ L, F, T, nu, ka }, p, m) {
    const LF = L.map(f => Array.from({ length: m }, (_, b) => f.reduce((s, v, a) => s + v * F[a][b], 0)));
    const Sigma = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => LF[i].reduce((s, v, a) => s + v * L[j][a], 0) + T[i][j]));
    const mu = nu.map((v, i) => v + L[i].reduce((s, l, a) => s + l * ka[a], 0));
    return { LF, Sigma, mu };
}

export function evaluar(esp, datos, N, x, conGradiente = true) {
    const { p, m } = esp, grad = conGradiente ? new Float64Array(esp.q) : null;
    let f = 0;
    for (let g = 0; g < datos.length; g++) {
        const D = datos[g], w = D.n / N, mt = matrices(esp, g, x), { LF, Sigma, mu } = implicadas(mt, p, m);
        const iv = inversaYLogDet(Sigma);
        if (!iv) return { f: 1e10, grad: conGradiente ? new Float64Array(esp.q).fill(NaN) : null };
        const A = iv.inv, d = D.media.map((v, i) => v - mu[i]), Ad = A.map(fila => fila.reduce((s, v, j) => s + v * d[j], 0));
        let trSA = 0;
        for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) trSA += D.S[i][j] * A[j][i];
        f += w * (iv.logDet + trSA + d.reduce((s, v, i) => s + v * Ad[i], 0) - D.logDetS - p);
        if (!conGradiente) continue;
        // M = Σ⁻¹ − Σ⁻¹(S + d·dᵀ)Σ⁻¹;  ∂F/∂Λ = 2·M·Λ·Φ − 2·Σ⁻¹d·κᵀ;  ∂F/∂Φ = ΛᵀMΛ;  ∂F/∂Θ = M;  ∂F/∂ν = −2Σ⁻¹d;  ∂F/∂κ = −2ΛᵀΣ⁻¹d
        const SA = D.S.map((fila, i) => Array.from({ length: p }, (_, j) => fila.reduce((s, v, k) => s + v * A[k][j], 0) + d[i] * Ad[j]));
        const M = A.map((fila, i) => Array.from({ length: p }, (_, j) => fila[j] - fila.reduce((s, v, k) => s + v * SA[k][j], 0)));
        const ML = M.map(fila => Array.from({ length: m }, (_, a) => fila.reduce((s, v, k) => s + v * mt.L[k][a], 0)));
        for (const s of esp.grupos[g].L) if (s.k !== undefined) grad[s.k] += w * (2 * ML[s.i].reduce((t, v, a) => t + v * mt.F[a][s.j], 0) - 2 * Ad[s.i] * mt.ka[s.j]);
        for (const s of esp.grupos[g].F) { const v = mt.L.reduce((t, fila, k) => t + fila[s.i] * ML[k][s.j], 0); grad[s.k] += w * (s.i === s.j ? v : 2 * v); }
        for (const s of esp.grupos[g].T) grad[s.k] += w * (s.i === s.j ? M[s.i][s.i] : 2 * M[s.i][s.j]);
        for (const s of esp.grupos[g].N) grad[s.k] += w * -2 * Ad[s.i];
        for (const s of esp.grupos[g].K) if (s.k !== undefined) grad[s.k] += w * -2 * mt.L.reduce((t, fila, k) => t + fila[s.i] * Ad[k], 0);
        void LF;
    }
    return { f, grad };
}

// ---------------------------------------------------------------- ajuste de un nivel
function srmrGrupo(D, Sigma, mu) {
    const p = D.media.length, sd = D.S.map((f, i) => Math.sqrt(f[i]));
    let s = 0;
    for (let i = 0; i < p; i++) { for (let j = 0; j <= i; j++) s += ((D.S[i][j] - Sigma[i][j]) / (sd[i] * sd[j])) ** 2; s += ((D.media[i] - mu[i]) / sd[i]) ** 2; }
    return Math.sqrt(s / (p * (p + 1) / 2 + p));
}

export function ajustarNivel(modelo, items, datos, nivel, { maxIter = 5000, conErrores = nivel.clave === 'escalar' } = {}) {
    const G = datos.length, N = datos.reduce((s, d) => s + d.n, 0), esp = especificar(modelo, items, G, nivel), p = esp.p;
    const f = x => evaluar(esp, datos, N, x, false).f, g = x => evaluar(esp, datos, N, x, true).grad;
    const opt = bfgs(f, g, iniciales(esp, datos), { maxIter, tolGrad: 1e-8 });
    const x = opt.x, chi2 = N * opt.f, gl = G * (p * (p + 1) / 2 + p) - esp.q;
    // errores estándar: Cov(θ̂) = (2/N)·H⁻¹, con H la hessiana de F por diferencias centrales del gradiente analítico
    let se = null;
    if (conErrores) {
        const H = esp.libres.map((_, k) => { const h = 1e-5 * Math.max(1, Math.abs(x[k])), a = x.slice(), b = x.slice(); a[k] += h; b[k] -= h; const ga = g(a), gb = g(b); return Array.from(ga, (v, i) => (v - gb[i]) / (2 * h)); });
        const Hs = H.map((fila, i) => fila.map((v, j) => (v + H[j][i]) / 2)), Hi = inversaDefinidaPositiva(Hs);
        se = esp.libres.map((_, k) => (Hi && Hi[k][k] > 0 ? Math.sqrt((2 / N) * Hi[k][k]) : NaN));
    }
    let srmr = 0, heywood = [];
    datos.forEach((D, gi) => {
        const mt = matrices(esp, gi, x), { Sigma, mu } = implicadas(mt, p, esp.m);
        srmr += (D.n / N) * srmrGrupo(D, Sigma, mu);
        mt.T.forEach((fila, i) => { if (fila[i] < 0) heywood.push(`${items[i]} (${D.nombre})`); });
        mt.F.forEach((fila, a) => { if (fila[a] <= 0) heywood.push(`varianza de ${esp.factores[a]} (${D.nombre})`); });
        mt.F.forEach((fila, a) => fila.forEach((v, b) => { if (b > a && fila[a] > 0 && mt.F[b][b] > 0 && Math.abs(v / Math.sqrt(fila[a] * mt.F[b][b])) > 1) heywood.push(`correlación ${esp.factores[a]}–${esp.factores[b]} mayor que 1 (${D.nombre})`); }));
    });
    return { nivel: nivel.clave, nombre: nivel.nombre, esp, x, se, chi2, gl, q: esp.q, N, G, srmr, convergio: opt.convergio,
             iteraciones: opt.iteraciones, heywood: [...new Set(heywood)] };
}

// Índices de ajuste de un nivel (línea base: covarianzas nulas con medias y varianzas libres en cada grupo)
export function indicesAjuste(R, datos) {
    const p = datos[0].media.length, G = datos.length, N = R.N;
    const chi2b = datos.reduce((s, D) => s + D.n * (D.S.reduce((t, f, i) => t + Math.log(f[i]), 0) - D.logDetS), 0), glb = G * p * (p - 1) / 2;
    const CFI = 1 - Math.max(R.chi2 - R.gl, 0) / Math.max(chi2b - glb, R.chi2 - R.gl, 1e-12);
    const TLI = (chi2b / glb - R.chi2 / R.gl) / (chi2b / glb - 1);
    if (R.gl === 0) return { chi2b, glb, CFI: 1, TLI: 1, p: NaN, RMSEA: 0, RMSEAic: [0, 0], saturado: true };   // reproduce los datos exactamente
    const rm = ncp => Math.sqrt(Math.max(ncp, 0) / (N * R.gl)) * Math.sqrt(G);   // corrección multigrupo (Steiger, 1998)
    return { chi2b, glb, CFI, TLI, p: pChi2(R.chi2, R.gl), RMSEA: rm(R.chi2 - R.gl),
             RMSEAic: [rm(ncpParaProbabilidad(R.chi2, R.gl, 0.95)), rm(ncpParaProbabilidad(R.chi2, R.gl, 0.05))] };
}

// ---------------------------------------------------------------- análisis completo
// Validación común (ML y WLSMV): solo modelos de medida con ítems presentes en la base → { items } o { error }
export function validarModeloDeMedida(modelo, filas) {
    if (!modelo || !Object.keys(modelo.latentes || {}).length) return { error: 'El modelo necesita al menos un factor (F =~ ítem1 + ítem2 + …).' };
    if ((modelo.regresiones || []).length) return { error: 'La invarianza se evalúa sobre el modelo de medida: quita las regresiones (~) y deja solo factores (=~) y covarianzas (~~).' };
    const items = [...new Set(Object.values(modelo.latentes).flat())];
    if (Object.values(modelo.latentes).some(l => l.length < 2)) return { error: 'Cada factor necesita al menos 2 ítems.' };
    const latentes = new Set(Object.keys(modelo.latentes));
    if (items.some(i => latentes.has(i))) return { error: 'Los factores de segundo orden no se admiten en la invarianza.' };
    const malas = (modelo.covars || []).filter(([a, b]) => latentes.has(a) !== latentes.has(b));
    if (malas.length) return { error: `Covarianza entre un factor y un ítem no admitida: ${malas.map(c => c.join(' ~~ ')).join(', ')}.` };
    const faltan = items.filter(c => !filas.length || !(c in filas[0]));
    if (faltan.length) return { error: `No están en la base: ${faltan.join(', ')}.` };
    return { items };
}

export function analizarInvarianza(modelo, filas, variableGrupo, { estricta = false } = {}, alProgreso = null) {
    const val = validarModeloDeMedida(modelo, filas);
    if (val.error) return val;
    const items = val.items, est = estadisticosPorGrupo(filas, items, variableGrupo);
    if (est.error) return est;
    const G = est.grupos.length, p = items.length, glConfigural = G * (p * (p + 1) / 2 + p) - especificar(modelo, items, G, NIVELES[0]).q;
    if (glConfigural < 0) return { error: `El modelo no está identificado (gl = ${glConfigural} en el modelo configural): cada factor necesita al menos 3 ítems, o 2 si covaría con otro factor.` };
    const lista = NIVELES.filter(n => estricta || n.clave !== 'estricta');
    const niveles = lista.map((nv, k) => {
        if (alProgreso) alProgreso(k, lista.length, nv.nombre);
        const R = ajustarNivel(modelo, items, est.grupos, nv);
        return { ...R, ...indicesAjuste(R, est.grupos) };
    });
    if (alProgreso) alProgreso(lista.length, lista.length, '');
    // Comparaciones sucesivas: Δχ² (anidados, ML) y cambios en CFI, RMSEA y SRMR con los criterios de Chen (2007)
    let sostenido = true;
    const grupoPequeno = est.grupos.some(g => g.n < 300);
    niveles.forEach((R, k) => {
        if (k === 0) { R.decision = R.convergio ? 'base' : 'sin converger'; return; }
        const A = niveles[k - 1], dChi2 = R.chi2 - A.chi2, dGl = R.gl - A.gl;
        R.delta = { chi2: dChi2, gl: dGl, p: pChi2(dChi2, dGl), CFI: R.CFI - A.CFI, RMSEA: R.RMSEA - A.RMSEA, SRMR: R.srmr - A.srmr };
        const rechaza = R.delta.CFI <= CRITERIOS_CHEN.dCFI && (R.delta.RMSEA >= CRITERIOS_CHEN.dRMSEA || R.delta.SRMR >= CRITERIOS_CHEN.dSRMR[R.nivel]);
        R.decision = !sostenido ? 'no interpretable' : rechaza ? 'no se sostiene' : 'se sostiene';
        R.delta.estricto = grupoPequeno && R.decision === 'se sostiene' && R.delta.CFI <= -0.005 && R.delta.RMSEA >= 0.010;
        if (rechaza) sostenido = false;
    });
    // Medias latentes (modelo escalar, si se sostiene): diferencia con el grupo de referencia y d latente
    const esc = niveles.find(R => R.nivel === 'escalar');
    const medias = esc && esc.decision === 'se sostiene' ? esc.esp.libres.map((pl, k) => ({ pl, k })).filter(({ pl }) => pl.tipo === 'mediaLatente').map(({ pl, k }) => {
        const kVar = esc.esp.libres.findIndex(o => o.tipo === 'varLatente' && o.i === pl.i && o.j === pl.i && o.grupo === 0);
        const z = esc.x[k] / esc.se[k];
        return { factor: esc.esp.factores[pl.i], grupo: est.grupos[pl.grupo].nombre, referencia: est.grupos[0].nombre, kappa: esc.x[k], se: esc.se[k], z,
                 p: 2 * (1 - cdfNormal(Math.abs(z))), d: esc.x[k] / Math.sqrt(esc.x[kVar]) };
    }) : [];
    return { items, factores: Object.keys(modelo.latentes), grupos: est.grupos.map(g => ({ nombre: g.nombre, n: g.n })), N: est.N, excluidos: est.excluidos,
             variableGrupo, niveles, medias, grupoPequeno };
}
