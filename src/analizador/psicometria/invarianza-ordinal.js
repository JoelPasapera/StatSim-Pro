// analizador/psicometria/invarianza-ordinal.js — invarianza de medición con ítems ordinales por WLSMV (sin DOM).
// Parametrización delta y secuencia de identificación de Wu y Estabrook (2016), para ítems de 3 o más categorías:
//   configural — todo libre por grupo; interceptos ν = 0 y escalas s = 1 en todos los grupos; medias latentes 0;
//   umbrales   — umbrales iguales; ν y s libres salvo en el grupo de referencia (con 3 categorías equivale al configural);
//   métrica    — además, cargas iguales;
//   escalar    — además, interceptos iguales (ν = 0 en todos) y medias latentes libres salvo en la referencia.
// Grupo g: umbral estandarizado τ̃_jk = s_j·(τ_jk − ν_j − λ_jᵀκ) y correlación policórica ρ_jl = s_j·s_l·(λ_jᵀΦλ_l + θ_jl).
// DWLS con W_g = diag(Γ_g)⁻¹ sobre umbrales y correlaciones de cada grupo (Γ_g completa de wlsmv.js); errores estándar
// robustos; χ² corregido en media y varianza (Asparouhov y Muthén, 2010) y DIFFTEST entre niveles sucesivos (Asparouhov
// y Muthén, 2006): diferencia de los χ² DWLS con la corrección calculada con U₀ − U₁.
import { estadisticosOrdinales } from './wlsmv.js';
import { multiplicar, traspuesta, inversaDefinidaPositiva } from './algebra.js';
import { bfgs } from './optimizacion.js';
import { gammaRegularizadaQ, ncpParaProbabilidad, cdfNormal } from './numerico.js';
import { CRITERIOS_CHEN, validarModeloDeMedida } from './invarianza.js';

export const NIVELES_ORDINALES = [
    { clave: 'configural', nombre: 'Configural', umbrales: false, cargas: false, interceptos: false },
    { clave: 'umbrales', nombre: 'Umbrales', umbrales: true, cargas: false, interceptos: false },
    { clave: 'metrica', nombre: 'Métrica', umbrales: true, cargas: true, interceptos: false },
    { clave: 'escalar', nombre: 'Escalar', umbrales: true, cargas: true, interceptos: true }
];
const pChi2 = (x, gl) => (gl > 0 ? gammaRegularizadaQ(gl / 2, Math.max(x, 0) / 2) : NaN);
const traza = A => A.reduce((s, f, i) => s + f[i], 0);
const trazaProducto = (A, B) => { let s = 0; for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) s += A[i][j] * B[j][i]; return s; };

// ---------------------------------------------------------------- especificación de un nivel
export function especificarOrdinal(modelo, items, cats, G, nivel) {
    const factores = Object.keys(modelo.latentes), p = items.length, m = factores.length, pos = new Map(items.map((v, i) => [v, i]));
    const claves = new Map(), libres = [];
    const indice = (clave, info) => { if (!claves.has(clave)) { claves.set(clave, libres.length); libres.push({ clave, ...info }); } return claves.get(clave); };
    const vistos = new Set(), covs = [];
    for (const [a, b] of modelo.covars || []) {
        if (!pos.has(a) || !pos.has(b) || a === b) continue;
        const i = Math.min(pos.get(a), pos.get(b)), j = Math.max(pos.get(a), pos.get(b));
        if (!vistos.has(`${i}:${j}`)) { vistos.add(`${i}:${j}`); covs.push([i, j]); }
    }
    const grupos = Array.from({ length: G }, (_, g) => {
        const L = [], F = [], T = [], N = [], S = [], K = [], C = [];
        factores.forEach((f, jf) => modelo.latentes[f].forEach((it, r) => {
            const i = pos.get(it);
            if (r === 0) L.push({ i, j: jf, valor: 1 });
            else L.push({ i, j: jf, k: indice(nivel.cargas ? `L:${i}:${jf}` : `${g}:L:${i}:${jf}`, { tipo: 'carga', i, j: jf, grupo: nivel.cargas ? null : g }) });
        }));
        for (let a = 0; a < m; a++) for (let b = a; b < m; b++) F.push({ i: a, j: b, k: indice(`${g}:F:${a}:${b}`, { tipo: a === b ? 'varLatente' : 'covLatente', i: a, j: b, grupo: g }) });
        for (let i = 0; i < p; i++) for (let c = 0; c < cats[i] - 1; c++) T.push({ i, c, k: indice(nivel.umbrales ? `T:${i}:${c}` : `${g}:T:${i}:${c}`, { tipo: 'umbral', i, c, grupo: nivel.umbrales ? null : g }) });
        const libreNS = nivel.umbrales && g > 0;
        for (let i = 0; i < p; i++) {
            N.push(libreNS && !nivel.interceptos ? { i, k: indice(`${g}:N:${i}`, { tipo: 'intercepto', i, grupo: g }) } : { i, valor: 0 });
            S.push(libreNS ? { i, k: indice(`${g}:S:${i}`, { tipo: 'escala', i, grupo: g }) } : { i, valor: 1 });
        }
        for (let jf = 0; jf < m; jf++) K.push(nivel.interceptos && g > 0 ? { i: jf, k: indice(`${g}:K:${jf}`, { tipo: 'mediaLatente', i: jf, grupo: g }) } : { i: jf, valor: 0 });
        for (const [i, j] of covs) C.push({ i, j, k: indice(`${g}:C:${i}:${j}`, { tipo: 'covResidual', i, j, grupo: g }) });
        // índices de parámetro por posición (−1 = fijo), para el recorrido de derivadas
        const slotL = Array.from({ length: p }, () => new Int32Array(m).fill(-1)), slotF = Array.from({ length: m }, () => new Int32Array(m).fill(-1));
        const slotT = Array.from({ length: p }, (_, i) => new Int32Array(cats[i] - 1)), slotN = new Int32Array(p).fill(-1), slotS = new Int32Array(p).fill(-1), slotK = new Int32Array(m).fill(-1), slotC = new Map();
        L.forEach(s => { if (s.k !== undefined) slotL[s.i][s.j] = s.k; }); F.forEach(s => { slotF[s.i][s.j] = slotF[s.j][s.i] = s.k; });
        T.forEach(s => { slotT[s.i][s.c] = s.k; }); N.forEach(s => { if (s.k !== undefined) slotN[s.i] = s.k; }); S.forEach(s => { if (s.k !== undefined) slotS[s.i] = s.k; });
        K.forEach(s => { if (s.k !== undefined) slotK[s.i] = s.k; }); C.forEach(s => slotC.set(s.i * p + s.j, s.k));
        return { L, F, T, N, S, K, C, slotL, slotF, slotT, slotN, slotS, slotK, slotC };
    });
    return { factores, items, p, m, cats, grupos, libres, q: libres.length, nivel };
}

function valores(esp, g, x) {
    const { p, m } = esp, e = esp.grupos[g], val = s => (s.k === undefined ? s.valor : x[s.k]);
    const L = Array.from({ length: p }, () => new Float64Array(m)), F = Array.from({ length: m }, () => new Float64Array(m));
    e.L.forEach(s => { L[s.i][s.j] = val(s); }); e.F.forEach(s => { F[s.i][s.j] = F[s.j][s.i] = x[s.k]; });
    const tau = esp.cats.map(c => new Float64Array(c - 1)); e.T.forEach(s => { tau[s.i][s.c] = x[s.k]; });
    const nu = new Float64Array(p), sc = new Float64Array(p), ka = new Float64Array(m), th = new Map();
    e.N.forEach(s => { nu[s.i] = val(s); }); e.S.forEach(s => { sc[s.i] = val(s); }); e.K.forEach(s => { ka[s.i] = val(s); }); e.C.forEach(s => th.set(s.i * p + s.j, x[s.k]));
    const PL = L.map(l => Array.from({ length: m }, (_, a) => l.reduce((t, v, b) => t + v * F[b][a], 0)));
    const lk = L.map(l => l.reduce((t, v, a) => t + v * ka[a], 0));
    return { L, F, tau, nu, sc, ka, th, PL, lk };
}

// Recorre los estadísticos del grupo g (umbrales ítem a ítem y luego correlaciones j < l, el orden de Γ) con su valor
// implicado y sus derivadas no nulas: una sola fuente para la función, el gradiente y la jacobiana
function recorrer(esp, g, v, fn) {
    const { p, m } = esp, e = esp.grupos[g];
    let a = 0;
    for (let i = 0; i < p; i++) for (let c = 0; c < esp.cats[i] - 1; c++) {
        const s = v.sc[i], base = v.tau[i][c] - v.nu[i] - v.lk[i], der = [[e.slotT[i][c], s]];
        if (e.slotS[i] >= 0) der.push([e.slotS[i], base]);
        if (e.slotN[i] >= 0) der.push([e.slotN[i], -s]);
        for (let f = 0; f < m; f++) { if (e.slotL[i][f] >= 0 && v.ka[f] !== 0) der.push([e.slotL[i][f], -s * v.ka[f]]); if (e.slotK[f] >= 0 && v.L[i][f] !== 0) der.push([e.slotK[f], -s * v.L[i][f]]); }
        fn(a++, s * base, der);
    }
    for (let j = 0; j < p; j++) for (let l = j + 1; l < p; l++) {
        const kc = e.slotC.get(j * p + l), cov = v.L[j].reduce((t, x, f) => t + x * v.PL[l][f], 0) + (kc === undefined ? 0 : v.th.get(j * p + l));
        const ss = v.sc[j] * v.sc[l], der = [];
        if (e.slotS[j] >= 0) der.push([e.slotS[j], v.sc[l] * cov]);
        if (e.slotS[l] >= 0) der.push([e.slotS[l], v.sc[j] * cov]);
        for (let f = 0; f < m; f++) { if (e.slotL[j][f] >= 0) der.push([e.slotL[j][f], ss * v.PL[l][f]]); if (e.slotL[l][f] >= 0) der.push([e.slotL[l][f], ss * v.PL[j][f]]); }
        for (let x = 0; x < m; x++) for (let y = x; y < m; y++) {
            const d = x === y ? v.L[j][x] * v.L[l][x] : v.L[j][x] * v.L[l][y] + v.L[j][y] * v.L[l][x];
            if (d !== 0) der.push([e.slotF[x][y], ss * d]);
        }
        if (kc !== undefined) der.push([kc, ss]);
        fn(a++, ss * cov, der);
    }
}

export function evaluarOrdinal(esp, datos, N, x, conGradiente = true) {
    const grad = conGradiente ? new Float64Array(esp.q) : null;
    let f = 0;
    datos.forEach((D, g) => {
        const v = valores(esp, g, x), w = D.n / N;
        recorrer(esp, g, v, (a, sig, der) => {
            const e = D.s[a] - sig, we = D.w[a] * e;
            f += w * we * e;
            if (conGradiente) for (const [k, d] of der) grad[k] -= 2 * w * we * d;
        });
    });
    return { f, grad };
}

// ---------------------------------------------------------------- ajuste e inferencia robusta de un nivel
function iniciales(esp, datos) {
    return esp.libres.map(pl => {
        const gs = pl.grupo === null ? datos.map((_, g) => g) : [pl.grupo];
        if (pl.tipo === 'carga' || pl.tipo === 'escala') return 1;
        if (pl.tipo === 'varLatente') return 0.4;
        if (pl.tipo === 'umbral') return gs.reduce((s, g) => s + datos[g].tau[pl.i][pl.c], 0) / gs.length;
        return 0;
    });
}

export function ajustarNivelOrdinal(modelo, items, cats, datos, nivel, { maxIter = 5000 } = {}) {
    const G = datos.length, N = datos.reduce((s, d) => s + d.n, 0), esp = especificarOrdinal(modelo, items, cats, G, nivel), q = esp.q;
    const f = x => evaluarOrdinal(esp, datos, N, x, false).f, g = x => evaluarOrdinal(esp, datos, N, x, true).grad;
    const opt = bfgs(f, g, iniciales(esp, datos), { maxIter, tolGrad: 1e-8 }), x = opt.x;
    // Jacobiana apilada y pesos globales: W = (n_g/N)·W_g, Γ = (N/n_g)·Γ_g (bloques)
    const bloques = [], WD = [];
    let srmr = 0;
    const heywood = [], p = esp.p;
    datos.forEach((D, gi) => {
        const v = valores(esp, gi, x), filas = Array.from({ length: D.s.length }, () => new Float64Array(q)), w = D.n / N, sig = new Float64Array(D.s.length);
        recorrer(esp, gi, v, (a, s, der) => { sig[a] = s; for (const [k, d] of der) filas[a][k] += d; });
        filas.forEach((fila, a) => WD.push(Array.from(fila, d => w * D.w[a] * d)));
        bloques.push({ desde: WD.length - D.s.length, D, escala: N / D.n, filasDelta: filas });
        let s2 = 0;
        for (let a = D.K; a < D.s.length; a++) s2 += (D.s[a] - sig[a]) ** 2;
        srmr += w * Math.sqrt(s2 / (D.s.length - D.K));
        for (let i = 0; i < p; i++) { const com = v.L[i].reduce((t, l, a) => t + l * v.PL[i][a], 0); if (1 / (v.sc[i] ** 2) - com < 0) heywood.push(`${items[i]} (${D.nombre})`); }
        v.F.forEach((fila, a) => { if (fila[a] <= 0) heywood.push(`varianza de ${esp.factores[a]} (${D.nombre})`); fila.forEach((c, b) => { if (b > a && fila[a] > 0 && v.F[b][b] > 0 && Math.abs(c / Math.sqrt(fila[a] * v.F[b][b])) > 1) heywood.push(`correlación ${esp.factores[a]}–${esp.factores[b]} mayor que 1 (${D.nombre})`); }); });
    });
    const Delta = bloques.flatMap(b => b.filasDelta.map(fila => Array.from(fila)));
    const H = multiplicar(traspuesta(Delta), WD), Hi = inversaDefinidaPositiva(H);
    // Γ·W·Δ por bloques; tr(WΓ) y tr((WΓ)²) no dependen de los pesos de grupo (se cancelan)
    const GWD = [];
    let trWG = 0, trWG2 = 0;
    for (const { desde, D, escala } of bloques) {
        const n = D.s.length;
        for (let a = 0; a < n; a++) {
            const fila = new Float64Array(q), Ga = D.Gamma[a];
            for (let b = 0; b < n; b++) { const gab = escala * Ga[b]; if (gab === 0) continue; const wd = WD[desde + b]; for (let k = 0; k < q; k++) fila[k] += gab * wd[k]; }
            GWD.push(Array.from(fila));
            trWG += D.w[a] * Ga[a];
            for (let b = 0; b < n; b++) trWG2 += D.w[a] * Ga[b] * D.w[b] * D.Gamma[b][a];
        }
    }
    const T = N * opt.f, gl = datos.reduce((s, D) => s + D.s.length, 0) - q;
    const R = { nivel: nivel.clave, nombre: nivel.nombre, esp, x, T, gl, q, N, G, srmr, convergio: opt.convergio, iteraciones: opt.iteraciones, heywood: [...new Set(heywood)], trWG2 };
    if (!Hi) return { ...R, error: 'La matriz de información no es invertible: el modelo no está identificado con estos datos.' };
    const M = multiplicar(traspuesta(WD), GWD), HiM = multiplicar(Hi, M);
    const pesos = bloques.flatMap(({ D }) => Array.from(D.w, w => (D.n / D.N) * w));
    const Nm = multiplicar(traspuesta(GWD), GWD.map((fila, r) => fila.map(v => v * pesos[r])));
    const trHiN = trazaProducto(Hi, Nm), a = trWG - traza(HiM), b = trWG2 - 2 * trHiN + trazaProducto(HiM, HiM);
    const Vr = multiplicar(HiM, Hi), se = Vr.map((fila, k) => (fila[k] > 0 ? Math.sqrt(fila[k] / N) : NaN));
    const chi2 = gl > 0 ? Math.sqrt(gl / b) * T + gl - Math.sqrt((gl * a * a) / b) : T;
    return { ...R, se, chi2, a, b, WD, GWD, Hi, trHiN };
}

// DIFFTEST: R0 más restringido, R1 menos; T_d = T₀ − T₁ con la corrección en media y varianza de U_d = U₀ − U₁
export function difftest(R0, R1) {
    const d = R0.gl - R1.gl;
    if (d === 0) return { gl: 0, equivalente: true, chi2: NaN, p: NaN, bruto: R0.T - R1.T };
    if (d < 0 || !R0.Hi || !R1.Hi) return { gl: d, chi2: NaN, p: NaN };
    const M01 = multiplicar(traspuesta(R0.WD), R1.GWD);
    const t4 = trazaProducto(multiplicar(R0.Hi, M01), multiplicar(R1.Hi, traspuesta(M01)));
    const c01 = R0.trWG2 - R1.trHiN - R0.trHiN + t4, ad = R0.a - R1.a, bd = R0.b - 2 * c01 + R1.b, Td = R0.T - R1.T;
    if (!(ad > 0 && bd > 0)) return { gl: d, chi2: NaN, p: NaN, bruto: Td };
    const chi2 = Math.sqrt(d / bd) * Td + d - Math.sqrt((d * ad * ad) / bd);
    return { gl: d, chi2, p: pChi2(chi2, d), bruto: Td, a: ad, b: bd };
}

// Índices con el χ² corregido; línea base: correlaciones nulas con umbrales libres en cada grupo
export function indicesOrdinales(R, datos) {
    let Tb = 0, glb = 0, ab = 0, bb = 0;
    for (const D of datos) {
        for (let a = D.K; a < D.s.length; a++) { Tb += D.n * D.w[a] * D.s[a] ** 2; glb++; ab += D.w[a] * D.Gamma[a][a]; for (let b = D.K; b < D.s.length; b++) bb += D.w[a] * D.Gamma[a][b] * D.w[b] * D.Gamma[b][a]; }
    }
    const chi2b = Math.sqrt(glb / bb) * Tb + glb - Math.sqrt((glb * ab * ab) / bb), G = datos.length, N = R.N;
    if (R.gl === 0) return { chi2b, glb, CFI: 1, TLI: 1, p: NaN, RMSEA: 0, RMSEAic: [0, 0], saturado: true };
    const CFI = 1 - Math.max(R.chi2 - R.gl, 0) / Math.max(chi2b - glb, R.chi2 - R.gl, 1e-12), TLI = (chi2b / glb - R.chi2 / R.gl) / (chi2b / glb - 1);
    const rm = ncp => Math.sqrt(Math.max(ncp, 0) / (N * R.gl)) * Math.sqrt(G);
    return { chi2b, glb, CFI, TLI, p: pChi2(R.chi2, R.gl), RMSEA: rm(R.chi2 - R.gl), RMSEAic: [rm(ncpParaProbabilidad(R.chi2, R.gl, 0.95)), rm(ncpParaProbabilidad(R.chi2, R.gl, 0.05))] };
}

// ---------------------------------------------------------------- datos por grupo
export function estadisticosOrdinalesPorGrupo(filas, items, variableGrupo, { minimo = 50, agrupar = false } = {}) {
    const porGrupo = new Map();
    let excluidos = 0;
    for (const f of filas) {
        const gv = f[variableGrupo], x = items.map(c => { const v = f[c]; return v === '' || v === null || v === undefined ? NaN : Number(typeof v === 'string' ? v.trim().replace(',', '.') : v); });
        if (gv === '' || gv === null || gv === undefined || x.some(v => !Number.isFinite(v))) { excluidos++; continue; }
        const k = String(gv);
        (porGrupo.get(k) || porGrupo.set(k, []).get(k)).push(x);
    }
    const claves = [...porGrupo.keys()].sort((a, b) => (Number.isFinite(+a) && Number.isFinite(+b) ? a - b : a.localeCompare(b, 'es')));
    if (claves.length < 2) return { error: `La variable «${variableGrupo}» necesita al menos 2 grupos con datos completos.` };
    if (claves.length > 8) return { error: `La variable «${variableGrupo}» tiene ${claves.length} grupos: la invarianza admite hasta 8.` };
    const categoriasDe = j => [...new Set(claves.flatMap(k => porGrupo.get(k).map(x => x[j])))].sort((a, b) => a - b);
    const noOrd = items.filter((_, j) => { const c = categoriasDe(j); return !c.every(Number.isInteger) || c.length > 10; });
    if (noOrd.length) return { error: `WLSMV es para ítems ordinales (enteros, hasta 10 categorías); no lo son: ${noOrd.join(', ')}. Usa ML.` };
    // Opción: una categoría sin respuestas en algún grupo se agrupa con la contigua EN TODOS los grupos (la extrema, con su
    // vecina; una intermedia, con la vecina más frecuente), hasta que todas las categorías estén en todos los grupos
    const agrupadas = [];
    if (agrupar) items.forEach((it, j) => {
        for (;;) {
            const cats = categoriasDe(j), vacia = cats.find(c => claves.some(k => !porGrupo.get(k).some(x => x[j] === c)));
            if (vacia === undefined || cats.length <= 2) break;
            const i = cats.indexOf(vacia), total = c => claves.reduce((s, k) => s + porGrupo.get(k).filter(x => x[j] === c).length, 0);
            const destino = i === 0 ? cats[1] : i === cats.length - 1 ? cats[i - 1] : total(cats[i - 1]) >= total(cats[i + 1]) ? cats[i - 1] : cats[i + 1];
            claves.forEach(k => porGrupo.get(k).forEach(x => { if (x[j] === vacia) x[j] = destino; }));
            agrupadas.push({ item: it, de: vacia, en: destino });
        }
    });
    const todas = items.map((_, j) => categoriasDe(j));
    const dic = items.filter((_, j) => todas[j].length < 3);
    if (dic.length) return { error: `Ítems con menos de 3 categorías: ${dic.join(', ')}. Con ítems dicotómicos la secuencia de Wu y Estabrook (2016) necesita otra identificación, que no está disponible.` };
    const N = claves.reduce((s, k) => s + porGrupo.get(k).length, 0), grupos = [];
    for (const nombre of claves) {
        const X = porGrupo.get(nombre);
        if (X.length < minimo) return { error: `El grupo «${nombre}» tiene ${X.length} casos completos; con WLSMV hacen falta al menos ${minimo}.` };
        for (let j = 0; j < items.length; j++) {
            const presentes = new Set(X.map(x => x[j])), faltan = todas[j].filter(c => !presentes.has(c));
            if (faltan.length) return { error: `En el grupo «${nombre}», el ítem «${items[j]}» no tiene respuestas en la categoría ${faltan.join(', ')}: los umbrales no pueden compararse. Agrupa las categorías poco frecuentes (en todos los grupos) antes de evaluar la invarianza.` };
        }
        const sm = estadisticosOrdinales(items.map((_, j) => X.map(x => x[j])), { completa: true });
        if (sm.error) return { error: `Grupo «${nombre}»: ${sm.error}` };
        const s = Float64Array.from([...sm.umbrales, ...sm.pares.map(([j, l]) => sm.R[j][l])]);
        grupos.push({ nombre, n: X.length, N, s, K: sm.K, Gamma: sm.GammaCompleta, w: Float64Array.from(sm.GammaCompleta, (f, a) => 1 / f[a]), tau: sm.items.map(it => it.tau), corregidas: sm.corregidas.length });
    }
    return { grupos, excluidos, N, cats: todas.map(c => c.length), agrupadas };
}

// ---------------------------------------------------------------- análisis completo
export function analizarInvarianzaOrdinal(modelo, filas, variableGrupo, opciones = {}, alProgreso = null) {
    const val = validarModeloDeMedida(modelo, filas);
    if (val.error) return val;
    const items = val.items, est = estadisticosOrdinalesPorGrupo(filas, items, variableGrupo, { agrupar: !!opciones.agrupar });
    if (est.error) return est;
    const G = est.grupos.length, glConfigural = est.grupos.reduce((s, D) => s + D.s.length, 0) - especificarOrdinal(modelo, items, est.cats, G, NIVELES_ORDINALES[0]).q;
    if (glConfigural < 0) return { error: `El modelo no está identificado (gl = ${glConfigural} en el modelo configural): cada factor necesita al menos 3 ítems, o 2 si covaría con otro factor.` };
    const niveles = NIVELES_ORDINALES.map((nv, k) => {
        if (alProgreso) alProgreso(k, NIVELES_ORDINALES.length);
        const R = ajustarNivelOrdinal(modelo, items, est.cats, est.grupos, nv);
        return { ...R, ...(R.error ? {} : indicesOrdinales(R, est.grupos)) };
    });
    if (alProgreso) alProgreso(NIVELES_ORDINALES.length, NIVELES_ORDINALES.length);
    const fallo = niveles.find(R => R.error);
    if (fallo) return { error: `Modelo ${fallo.nombre.toLowerCase()}: ${fallo.error}` };
    let sostenido = true;
    const grupoPequeno = est.grupos.some(g => g.n < 300);
    niveles.forEach((R, k) => {
        if (k === 0) { R.decision = R.convergio ? 'base' : 'sin converger'; return; }
        const A = niveles[k - 1], dt = difftest(R, A);
        R.delta = { chi2: dt.chi2, gl: dt.gl, p: dt.p, equivalente: !!dt.equivalente, CFI: R.CFI - A.CFI, RMSEA: R.RMSEA - A.RMSEA, SRMR: R.srmr - A.srmr };
        const umbralSRMR = CRITERIOS_CHEN.dSRMR[R.nivel] ?? CRITERIOS_CHEN.dSRMR.escalar;
        const rechaza = !dt.equivalente && R.delta.CFI <= CRITERIOS_CHEN.dCFI && (R.delta.RMSEA >= CRITERIOS_CHEN.dRMSEA || R.delta.SRMR >= umbralSRMR);
        R.decision = !sostenido ? 'no interpretable' : rechaza ? 'no se sostiene' : dt.equivalente ? 'equivalente' : 'se sostiene';
        R.delta.estricto = grupoPequeno && R.decision === 'se sostiene' && R.delta.CFI <= -0.005 && R.delta.RMSEA >= 0.010;
        if (rechaza) sostenido = false;
    });
    const esc = niveles.find(R => R.nivel === 'escalar');
    const medias = esc.decision === 'se sostiene' || esc.decision === 'equivalente' ? esc.esp.libres.map((pl, k) => ({ pl, k })).filter(({ pl }) => pl.tipo === 'mediaLatente').map(({ pl, k }) => {
        const kVar = esc.esp.libres.findIndex(o => o.tipo === 'varLatente' && o.i === pl.i && o.j === pl.i && o.grupo === 0), z = esc.x[k] / esc.se[k];
        return { factor: esc.esp.factores[pl.i], grupo: est.grupos[pl.grupo].nombre, referencia: est.grupos[0].nombre, kappa: esc.x[k], se: esc.se[k], z,
                 p: 2 * (1 - cdfNormal(Math.abs(z))), d: esc.x[k] / Math.sqrt(esc.x[kVar]) };
    }) : [];
    // lo que no hace falta fuera del motor (matrices grandes) no viaja al hilo principal
    niveles.forEach(R => { delete R.WD; delete R.GWD; delete R.Hi; });
    return { estimador: 'WLSMV', items, factores: Object.keys(modelo.latentes), grupos: est.grupos.map(g => ({ nombre: g.nombre, n: g.n })), N: est.N, excluidos: est.excluidos,
             variableGrupo, niveles, medias, grupoPequeno, tablasCorregidas: est.grupos.reduce((s, g) => s + g.corregidas, 0), agrupadas: est.agrupadas };
}
