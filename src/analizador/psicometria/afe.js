// analizador/psicometria/afe.js — análisis factorial exploratorio (AFE), núcleo de cálculo puro (sin DOM; lo ejecuta el
// Worker o, sin él, el hilo principal). Sigue las recomendaciones de Lloret-Segura et al. (2014):
//   · adecuación: KMO global y MSA por ítem (Kaiser, 1974) y esfericidad de Bartlett (1950);
//   · número de factores: análisis paralelo por permutaciones (Horn, 1965; Buja y Eyuboglu, 1992; percentil 95,
//     Glorfeld, 1995), con la misma correlación que el análisis (Pearson o policórica);
//   · extracción: ejes principales iterados (al converger, la solución de mínimos cuadrados no ponderados);
//   · rotación: oblimin directo (γ = 0) y varimax por gradiente proyectado (Jennrich, 2002; Bernaards y Jennrich, 2005)
//     y promax (κ = 4; Hendrickson y White, 1964), con normalización de Kaiser.
import { eigenSimetrica, inversaDefinidaPositiva, suavizarCorrelacion, traspuesta, identidad, multiplicar, inversaGeneral, factorPolar, logDeterminante } from './algebra.js';
import { ejesPrincipales } from './factorial.js';
import { pChiCuadrado } from './numerico.js';
import { crearAleatorio } from './aleatorio.js';
import { cuantilLineal } from './bootstrap.js';
import { matrizCorrelaciones } from './clasica.js';
import { matrizPolicorica, tipoDeItems } from './ordinal.js';
import { policoricaDesde } from './policorica.js';

// ---------------------------------------------------------------- adecuación muestral
export function kmo(R) {
    const inv = inversaDefinidaPositiva(R);
    if (!inv) return null;
    const p = R.length, msa = [];
    let sr = 0, sa = 0;
    for (let i = 0; i < p; i++) {
        let ri = 0, ai = 0;
        for (let j = 0; j < p; j++) {
            if (i === j) continue;
            const parcial = -inv[i][j] / Math.sqrt(inv[i][i] * inv[j][j]);
            ri += R[i][j] * R[i][j]; ai += parcial * parcial;
        }
        msa.push(ri / (ri + ai)); sr += ri; sa += ai;
    }
    return { kmo: sr / (sr + sa), msa };
}
export function interpretarKMO(k) {   // Kaiser (1974), sobre el valor redondeado a 2 decimales (el que se reporta: .90 es «excelente»)
    k = Math.round(k * 100) / 100;
    return k >= 0.9 ? 'excelente' : k >= 0.8 ? 'meritorio' : k >= 0.7 ? 'aceptable' : k >= 0.6 ? 'mediocre' : k >= 0.5 ? 'bajo' : 'inaceptable';
}
export function bartlett(R, n) {
    const lnDet = logDeterminante(R);
    if (lnDet === null) return null;
    const p = R.length, chi2 = -(n - 1 - (2 * p + 5) / 6) * lnDet, gl = (p * (p - 1)) / 2;
    return { chi2, gl, p: pChiCuadrado(chi2, gl), determinante: Math.exp(lnDet) };
}

// ---------------------------------------------------------------- matrices y número de factores
export function matrizDe(cols, tipo) {
    return tipo === 'policorica' ? matrizPolicorica(cols).R : matrizCorrelaciones(cols);
}
function matrizRapida(cols, tipo) {   // para las permutaciones: las policóricas parten de 0 (datos sin estructura)
    if (tipo !== 'policorica') return matrizCorrelaciones(cols);
    const k = cols.length, R = identidad(k);
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) { const r = policoricaDesde(cols[i], cols[j], 0).rho; R[i][j] = R[j][i] = Number.isFinite(r) ? r : 0; }
    return R;
}

// Autovalores de B matrices de datos permutados columna a columna (Fisher–Yates con la semilla): conservan las
// distribuciones marginales de cada ítem y destruyen las correlaciones (Buja y Eyuboglu, 1992)
export function analisisParalelo(cols, tipo, { B = 200, semilla = 2026, percentil = 0.95, alProgreso = null } = {}) {
    const rng = crearAleatorio(semilla), n = cols[0].length, p = cols.length;
    const perm = cols.map(c => Float64Array.from(c)), valores = Array.from({ length: p }, () => []);
    for (let b = 0; b < B; b++) {
        for (const v of perm) for (let i = n - 1; i > 0; i--) { const r = rng.entero(i + 1), t = v[i]; v[i] = v[r]; v[r] = t; }
        eigenSimetrica(matrizRapida(perm, tipo)).valores.forEach((v, k) => valores[k].push(v));
        if (alProgreso && ((b + 1) % 5 === 0 || b === B - 1)) alProgreso(b + 1, B);
    }
    return valores.map(vs => { const o = Float64Array.from(vs).sort(); return { media: vs.reduce((s, x) => s + x, 0) / vs.length, percentil: cuantilLineal(o, percentil) }; });
}
// Se retienen los factores cuyo autovalor observado supera el de referencia, en orden, hasta el primero que no lo hace
export function factoresSugeridos(observados, referencia) {
    let m = 0;
    while (m < observados.length && observados[m] > referencia[m].percentil) m++;
    return m;
}
// Máximo de factores identificables (cota de Ledermann): (p − m)² ≥ p + m
export function maximoFactores(p) {
    let m = 0;
    while ((p - (m + 1)) ** 2 >= p + m + 1) m++;
    return m;
}

// ---------------------------------------------------------------- rotaciones
const vgqOblimin = L => {   // oblimin directo, γ = 0 (cuartimín): f = Σ_i Σ_{j≠k} λ²ᵢⱼλ²ᵢₖ / 4
    const m = L[0].length, Gq = [], s = L.map(f => f.map(x => x * x));
    let f = 0;
    for (let i = 0; i < L.length; i++) {
        const fila = [], tot = s[i].reduce((a, x) => a + x, 0);
        for (let j = 0; j < m; j++) { const X = tot - s[i][j]; fila.push(L[i][j] * X); f += s[i][j] * X; }
        Gq.push(fila);
    }
    return { f: f / 4, Gq };
};
const vgqVarimax = L => {   // varimax: f = −Σ_j Σ_i (λ²ᵢⱼ − media_j)² / 4
    const p = L.length, m = L[0].length, s = L.map(f => f.map(x => x * x));
    const medias = Array.from({ length: m }, (_, j) => s.reduce((a, f) => a + f[j], 0) / p);
    let f = 0;
    const Gq = L.map((fila, i) => fila.map((x, j) => { const q = s[i][j] - medias[j]; f += q * q; return -x * q; }));
    return { f: -f / 4, Gq };
};
const normaFrob = M => Math.sqrt(M.reduce((s, f) => s + f.reduce((a, x) => a + x * x, 0), 0));

// Gradiente proyectado oblicuo (GPFoblq de Bernaards y Jennrich, 2005): L = A·(Tᵀ)⁻¹, Φ = TᵀT
function gpaOblicua(A, vgq, eps, maxit) {
    const m = A[0].length;
    let T = identidad(m), Ti = identidad(m), L = A.map(f => f.slice()), v = vgq(L);
    const gradiente = (L, Gq, Ti) => traspuesta(multiplicar(multiplicar(traspuesta(L), Gq), Ti)).map(f => f.map(x => -x));
    let G = gradiente(L, v.Gq, Ti), f = v.f, al = 1, s = Infinity, iter = 0;
    for (; iter <= maxit; iter++) {
        const d = new Array(m).fill(0);
        for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) d[j] += T[i][j] * G[i][j];
        const Gp = G.map((fila, i) => fila.map((g, j) => g - T[i][j] * d[j]));
        s = normaFrob(Gp);
        if (s < eps) break;
        al *= 2;
        let Tt, Tit, Lt, vt;
        for (let k = 0; k <= 10; k++) {
            const X = T.map((fila, i) => fila.map((t, j) => t - al * Gp[i][j]));
            const cn = new Array(m).fill(0);
            for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) cn[j] += X[i][j] * X[i][j];
            Tt = X.map(fila => fila.map((x, j) => x / Math.sqrt(cn[j])));
            Tit = inversaGeneral(Tt);
            if (!Tit) { al /= 2; continue; }   // paso que deja T singular: se acorta
            Lt = multiplicar(A, traspuesta(Tit));
            vt = vgq(Lt);
            if (f - vt.f > 0.5 * s * s * al) break;
            al /= 2;
        }
        T = Tt; Ti = Tit; L = Lt; f = vt.f;
        G = gradiente(L, vt.Gq, Ti);
    }
    return { L, Phi: multiplicar(traspuesta(T), T), convergio: s < eps, iteraciones: iter };
}

// Gradiente proyectado ortogonal (GPForth): L = A·T, T ortogonal (factor polar en cada paso)
function gpaOrtogonal(A, vgq, eps, maxit) {
    const m = A[0].length;
    let T = identidad(m), L = A.map(f => f.slice()), v = vgq(L);
    let G = multiplicar(traspuesta(A), v.Gq), f = v.f, al = 1, s = Infinity, iter = 0;
    for (; iter <= maxit; iter++) {
        const M = multiplicar(traspuesta(T), G), S = M.map((fila, i) => fila.map((x, j) => (x + M[j][i]) / 2));
        const TS = multiplicar(T, S), Gp = G.map((fila, i) => fila.map((g, j) => g - TS[i][j]));
        s = normaFrob(Gp);
        if (s < eps) break;
        al *= 2;
        let Tt, Lt, vt;
        for (let k = 0; k <= 10; k++) {
            Tt = factorPolar(T.map((fila, i) => fila.map((t, j) => t - al * Gp[i][j])));
            Lt = multiplicar(A, Tt);
            vt = vgq(Lt);
            if (vt.f < f - 0.5 * s * s * al) break;
            al /= 2;
        }
        T = Tt; L = Lt; f = vt.f;
        G = multiplicar(traspuesta(A), vt.Gq);
    }
    return { L, T, Phi: identidad(m), convergio: s < eps, iteraciones: iter };
}

// Normalización de Kaiser: cada fila se divide por √h² antes de rotar y se multiplica después
function conKaiser(A, rotacion) {
    const w = A.map(f => Math.sqrt(f.reduce((s, x) => s + x * x, 0)) || 1);
    const r = rotacion(A.map((f, i) => f.map(x => x / w[i])));
    return { ...r, L: r.L.map((f, i) => f.map(x => x * w[i])) };
}

export const ROTACIONES = { oblimin: 'Oblimin directo (γ = 0)', promax: 'Promax (κ = 4)', varimax: 'Varimax', ninguna: 'Sin rotación' };
export function rotar(A, metodo = 'oblimin', { eps = 1e-6, maxit = 5000 } = {}) {   // eps sobre la norma del gradiente proyectado (GPArotation usa 1e-5)
    const m = A[0].length;
    if (m < 2 || metodo === 'ninguna') return { L: A.map(f => f.slice()), Phi: identidad(m), convergio: true, iteraciones: 0, oblicua: false };
    if (metodo === 'oblimin') return { ...conKaiser(A, X => gpaOblicua(X, vgqOblimin, eps, maxit)), oblicua: true };
    const vari = conKaiser(A, X => gpaOrtogonal(X, vgqVarimax, eps, maxit));
    if (metodo === 'varimax') return { ...vari, oblicua: false };
    // promax (Hendrickson y White, 1964), como stats::promax de R: objetivo Q = x·|x|³ desde varimax
    const x = vari.L, Q = x.map(f => f.map(v => v * Math.abs(v) ** 3));
    const xt = traspuesta(x);
    let U = multiplicar(inversaGeneral(multiplicar(xt, x)), multiplicar(xt, Q));
    const d = inversaGeneral(multiplicar(traspuesta(U), U)).map((f, i) => f[i]);
    U = U.map(f => f.map((v, j) => v * Math.sqrt(d[j])));
    const Ut = multiplicar(vari.T, U), Ui = inversaGeneral(Ut);
    return { L: multiplicar(x, U), Phi: multiplicar(Ui, traspuesta(Ui)), convergio: vari.convergio, iteraciones: vari.iteraciones, oblicua: true };
}

// Factores ordenados por suma de cargas² del patrón (de mayor a menor) y con signo que hace positiva la suma de cargas
export function ordenarFactores(L, Phi) {
    const m = L[0].length;
    const ss = Array.from({ length: m }, (_, j) => L.reduce((s, f) => s + f[j] * f[j], 0));
    const orden = Array.from({ length: m }, (_, j) => j).sort((a, b) => ss[b] - ss[a]);
    const signo = orden.map(j => (L.reduce((s, f) => s + f[j], 0) < 0 ? -1 : 1));
    return {
        L: L.map(f => orden.map((j, q) => f[j] * signo[q])),
        Phi: orden.map((a, q) => orden.map((b, r) => Phi[a][b] * signo[q] * signo[r])),
        ss: orden.map(j => ss[j])
    };
}

// ---------------------------------------------------------------- análisis completo
/**
 * cols: columnas completas de los ítems; nombres: sus nombres. opciones: { correlacion: 'auto' | 'pearson' | 'policorica',
 * factores: 'paralelo' | número, rotacion, B, semilla }. Devuelve datos planos (se transfieren desde el Worker).
 */
export function analizarAFE(cols, nombres, opciones = {}, alProgreso = null) {
    const p = cols.length, n = cols[0].length, avisos = [];
    if (p < 3) return { error: 'El AFE necesita al menos 3 ítems.' };
    if (n < p + 1) return { error: `Hay ${n} casos para ${p} ítems: se necesitan más casos que ítems (idealmente 200 o más).` };
    const constantes = nombres.filter((_, j) => cols[j].every(v => v === cols[j][0]));
    if (constantes.length) return { error: `Sin variación (todas las respuestas iguales): ${constantes.join(', ')}. Quítalos del análisis.` };
    const clase = tipoDeItems(cols).tipo;
    const tipo = opciones.correlacion && opciones.correlacion !== 'auto' ? opciones.correlacion : (clase === 'continuo' ? 'pearson' : 'policorica');
    const Rcruda = matrizDe(cols, tipo);
    const sv = suavizarCorrelacion(Rcruda), R = sv.R;
    if (sv.suavizada) avisos.push(`La matriz ${tipo === 'policorica' ? 'policórica' : 'de correlaciones'} no era definida positiva (autovalor mínimo ${sv.minAutovalor.toFixed(3)}): se suavizó por autovalores antes de analizarla.`);
    if (n < 200) avisos.push(`Con ${n} casos la estimación es inestable; se recomiendan al menos 200 (Lloret-Segura et al., 2014).`);
    const adecuacion = { kmo: kmo(R), bartlett: bartlett(R, n) };
    if (tipo === 'policorica' && adecuacion.bartlett) avisos.push('La prueba de Bartlett supone normalidad multivariante; con correlaciones policóricas es orientativa.');
    const autovalores = eigenSimetrica(R).valores;
    const B = opciones.B || 200, semilla = opciones.semilla || 2026;
    const paralelo = analisisParalelo(cols, tipo, { B, semilla, alProgreso });
    const sugeridosReales = factoresSugeridos(autovalores, paralelo), sugeridos = Math.max(1, sugeridosReales);
    if (sugeridosReales === 0) avisos.push('Ningún autovalor supera al del análisis paralelo: los ítems no muestran una estructura factorial clara. Se extrae un factor solo para describirla.');
    const kaiser = autovalores.filter(v => v > 1).length;
    const mMax = Math.max(1, maximoFactores(p));
    let m = opciones.factores === 'paralelo' || !opciones.factores ? sugeridos : Math.round(Number(opciones.factores));
    if (!(m >= 1)) m = sugeridos;
    if (m > mMax) { avisos.push(`Con ${p} ítems se pueden identificar como máximo ${mMax} factores (cota de Ledermann): se usan ${mMax}.`); m = mMax; }
    const ep = ejesPrincipales(R, m);
    if (!ep.convergio) avisos.push('La extracción no convergió en 1000 iteraciones: interprete la solución con cautela.');
    if (ep.heywood) avisos.push('Caso Heywood: alguna comunalidad llegó al límite (.999). Suele indicar demasiados factores o ítems redundantes.');
    const A = ep.cargas;
    const extraida = Array.from({ length: m }, (_, j) => A.reduce((s, f) => s + f[j] * f[j], 0));
    const metodo = m === 1 ? 'ninguna' : (opciones.rotacion || 'oblimin');
    const rot = rotar(A, metodo);
    if (!rot.convergio) avisos.push('La rotación no convergió: interprete la solución con cautela.');
    const ord = ordenarFactores(rot.L, rot.Phi);
    const estructura = multiplicar(ord.L, ord.Phi);
    const items = nombres.map((nombre, i) => {
        const cargas = ord.L[i], abs = cargas.map(Math.abs), orden = abs.map((v, j) => j).sort((a, b) => abs[b] - abs[a]);
        const principal = orden[0], segunda = orden.length > 1 ? abs[orden[1]] : 0;
        return { nombre, cargas, comunalidad: ep.comunalidades[i], factor: principal, msa: adecuacion.kmo ? adecuacion.kmo.msa[i] : null,
            bajaCarga: abs[principal] < 0.40, cruzada: segunda >= 0.30, bajaComunalidad: ep.comunalidades[i] < 0.30 };
    });
    return {
        n, p, tipo, clase, avisos, adecuacion, autovalores, paralelo, B, semilla, sugeridos, sugeridosReales, kaiser, m, mMax, fijado: m !== sugeridos,
        extraccion: { varianza: extraida, porcentaje: extraida.map(v => (100 * v) / p), iteraciones: ep.iteraciones, convergio: ep.convergio, heywood: ep.heywood },
        rotacion: { metodo, nombre: ROTACIONES[metodo], oblicua: rot.oblicua, convergio: rot.convergio, iteraciones: rot.iteraciones },
        patron: ord.L, phi: ord.Phi, estructura, ssRotadas: ord.ss, items
    };
}
