// simulador/dominio/formas-relacion.js — tipos de relación entre dos variables: dimensión A («forma de la tendencia»)
// del «Atlas de relaciones entre variables en psicología». E[Y | X] = f(u), con u = X reescalada a [0, 1] sobre una
// ventana centrada en la mediana de X que abarca de su percentil 1 al 99 (fuera de ella, u se recorta): un caso extremo
// no mueve la curva, y el vértice de una U o el umbral de un escalón caen en los niveles intermedios de X. Las funciones son las mismas con que el atlas dibuja cada lámina (sus constantes de posición y escala
// no importan: la curva se estandariza). La fuerza η es la correlación entre Y y la curva: con «Lineal», |r|.
export const FORMAS_RELACION = [
    { id: 'lineal', nombre: 'Lineal', grupo: 'Monotónica', etiqueta: 'r sirve', f: u => u },
    { id: 'logaritmica', nombre: 'Logarítmica (se frena)', grupo: 'Monotónica creciente', etiqueta: 'ρ y τ sirven', f: u => Math.log(1 + 14 * u) / Math.log(15) },
    { id: 'potencia', nombre: 'Potencia compresiva (n < 1)', grupo: 'Monotónica creciente', etiqueta: 'ρ y τ sirven', f: u => Math.pow(u, 0.38) },
    { id: 'asintotica', nombre: 'Exponencial asintótica (con techo)', grupo: 'Monotónica creciente', etiqueta: 'ρ y τ sirven', f: u => 1 - Math.exp(-3.2 * u) },
    { id: 'hiperbolica-sat', nombre: 'Hiperbólica saturante', grupo: 'Monotónica creciente', etiqueta: 'ρ y τ sirven', f: u => u / (0.22 + u) },
    { id: 'meseta', nombre: 'Segmentada con meseta', grupo: 'Monotónica creciente', etiqueta: 'ρ y τ sirven', f: u => Math.min(u / 0.45, 1) },
    { id: 'exponencial', nombre: 'Exponencial (se acelera)', grupo: 'Monotónica creciente', etiqueta: 'ρ y τ sirven', f: u => (Math.exp(3.4 * u) - 1) / (Math.exp(3.4) - 1) },
    { id: 'potencia-exp', nombre: 'Potencia expansiva (n > 1)', grupo: 'Monotónica creciente', etiqueta: 'ρ y τ sirven', f: u => Math.pow(u, 3.2) },
    { id: 'sigmoide', nombre: 'Sigmoide (en S)', grupo: 'Monotónica creciente', etiqueta: 'ρ y τ sirven', f: u => 1 / (1 + Math.exp(-14 * (u - 0.5))) },
    { id: 'escalon', nombre: 'Escalón (umbral, todo o nada)', grupo: 'Monotónica creciente', etiqueta: 'ρ y τ sirven', f: u => (u < 0.5 ? 0 : 1) },
    { id: 'decaimiento', nombre: 'Decaimiento exponencial', grupo: 'Monotónica decreciente', etiqueta: 'ρ y τ sirven', f: u => Math.exp(-4 * u) },
    { id: 'potencia-dec', nombre: 'Potencia decreciente', grupo: 'Monotónica decreciente', etiqueta: 'ρ y τ sirven', f: u => Math.pow(1 + 12 * u, -0.9) },
    { id: 'hiperbolica-dec', nombre: 'Hiperbólica decreciente (descuento)', grupo: 'Monotónica decreciente', etiqueta: 'ρ y τ sirven', f: u => 1 / (1 + 9 * u) },
    { id: 'u-invertida', nombre: 'U invertida (∩)', grupo: 'No monotónica', etiqueta: 'r y ρ fallan', f: u => 1 - Math.pow(2 * u - 1, 2) },
    { id: 'u', nombre: 'U (∪)', grupo: 'No monotónica', etiqueta: 'r y ρ fallan', f: u => Math.pow(2 * u - 1, 2) },
    { id: 'j', nombre: 'Curva en J', grupo: 'No monotónica', etiqueta: 'r y ρ fallan', f: u => Math.pow(u - 0.25, 2) },
    // (revisión 2026.10.25) polinomio de tercer grado, la ecuación del atlas (Y = b₀ + b₁X + b₂X² + b₃X³); antes se usaba la
    // función con que el atlas DIBUJA la lámina (recta con un hundimiento gaussiano), que no es una cúbica. Giros en u = ¼ y ¾
    { id: 'cubica', nombre: 'Cúbica (dos cambios de sentido)', grupo: 'No monotónica', etiqueta: 'r y ρ fallan', f: u => { const t = 2 * u - 1; return t * t * t - 0.75 * t; } },
    { id: 'ciclica', nombre: 'Cíclica (periódica)', grupo: 'No monotónica', etiqueta: 'r y ρ fallan', f: u => -Math.cos(4 * Math.PI * u) },
    { id: 'nula', nombre: 'Plana (sin relación)', grupo: 'Sin tendencia', etiqueta: 'r y ρ ≈ 0', f: () => 0 }
];
// Nombre dentro de una frase: minúscula inicial, salvo las formas que son una letra (U, J)
export const nombreEnFrase = id => { const n = (formaPorId(id) || { nombre: id }).nombre; return /^[A-Z](\s|$)/.test(n) ? n : n.charAt(0).toLowerCase() + n.slice(1); };
export const GRUPOS_FORMA = ['Monotónica creciente', 'Monotónica decreciente', 'No monotónica', 'Sin tendencia'];
const porId = new Map(FORMAS_RELACION.map(f => [f.id, f]));
export const formaPorId = id => porId.get(id) || null;
// «Lineal» y «Plana» usan el motor de correlaciones de siempre (r con signo; r = 0); las demás se componen
export const esFormaCompuesta = id => porId.has(id) && id !== 'lineal' && id !== 'nula';
// (Atlas, dimensión B) formas INTERNAS, fuera del catálogo que ve el usuario: una fila «Lineal» o «Plana» con una nube no
// homogénea se compone como una recta (creciente o decreciente) para que la nube pueda vivir en su residuo
for (const F of [{ id: 'recta', nombre: 'Lineal', grupo: 'Monotónica', etiqueta: 'r sirve', f: u => u, interna: true }, { id: 'recta-dec', nombre: 'Lineal decreciente', grupo: 'Monotónica', etiqueta: 'r sirve', f: u => 1 - u, interna: true }]) porId.set(F.id, F);
// posición u ∈ [0, 1] de cada caso en la ventana de la forma (la misma que usa aplicarForma)
export function uVentana(x) { const [lo, hi] = ventanaForma(x), rango = hi - lo; return Float64Array.from(x, v => (rango > 0 ? Math.min(1, Math.max(0, (v - lo) / rango)) : 0.5)); }

// Ventana de la forma: centrada en la mediana de X, con semiamplitud hasta el más lejano de sus percentiles 1 y 99
// (interpolación lineal); si X apenas varía, el rango completo
const PERCENTIL_VENTANA = 0.01;
export function ventanaForma(x) {
    const o = Float64Array.from(x).sort(), q = p => { const h = (o.length - 1) * p, i = Math.floor(h); return o[i] + (h - i) * (o[Math.min(i + 1, o.length - 1)] - o[i]); };
    const med = q(0.5), h = Math.max(med - q(PERCENTIL_VENTANA), q(1 - PERCENTIL_VENTANA) - med);
    return h > 0 ? [med - h, med + h] : [o[0], o[o.length - 1]];
}
// f evaluada en los valores de X reescalados a [0, 1] sobre la ventana (X constante: 0)
export function aplicarForma(id, x) {
    const F = formaPorId(id), [lo, hi] = ventanaForma(x), rango = hi - lo;
    return Float64Array.from(x, v => (rango > 0 ? F.f(Math.min(1, Math.max(0, (v - lo) / rango))) : 0));
}

// Recorte esperado de Y (revisión 2026.10.25): Y = η·z_f + √(1 − η²)·ε, con z_f la curva estandarizada sobre la
// distribución de X (driver normal por la transformación tx de su forma marginal, ventana de percentiles como en
// aplicarForma) y ε normal. Devuelve la fracción de Y fuera de [zLo, zHi] (límites de su escala en unidades de DE):
// con formas asimétricas y η alta, Y hereda la asimetría y choca con esos límites.
// Curva teórica sobre la distribución REAL de X (driver normal por su transformación tx): ventana (mediana ± el más lejano
// de los percentiles 1 y 99, como aplicarForma sobre una muestra) y momentos de f; la usan el modo no exacto (fila a fila,
// sin muestra), el diagnóstico de recorte y la cota de las correlaciones (κ con la X real, no con una normal)
const cacheCurvas = new Map();
export function curvaTeorica(id, tx, clave = null) {
    const k = clave !== null ? `${id}|${clave}` : null;
    if (k && cacheCurvas.has(k)) return cacheCurvas.get(k);
    const F = formaPorId(id), m = 4001, lim = 5, zs = [], xs = [], ws = [];
    let sw = 0;
    for (let i = 0; i < m; i++) { const z = -lim + (2 * lim * i) / (m - 1), w = Math.exp(-z * z / 2); zs.push(z); xs.push(tx(z)); ws.push(w); sw += w; }
    for (let i = 0; i < m; i++) ws[i] /= sw;
    const orden = xs.map((x, i) => [x, ws[i]]).sort((a, b) => a[0] - b[0]), cuantil = q => { let c = 0; for (const [x, w] of orden) { c += w; if (c >= q) return x; } return orden[orden.length - 1][0]; };
    const med = cuantil(0.5), h = Math.max(med - cuantil(PERCENTIL_VENTANA), cuantil(1 - PERCENTIL_VENTANA) - med) || 1;
    const u = x => Math.min(1, Math.max(0, (x - (med - h)) / (2 * h)));
    let mf = 0, mx = 0; const f = xs.map(x => F.f(u(x)));
    for (let i = 0; i < m; i++) { mf += ws[i] * f[i]; mx += ws[i] * xs[i]; }
    let vf = 0, vx = 0, cfx = 0;
    for (let i = 0; i < m; i++) { vf += ws[i] * (f[i] - mf) ** 2; vx += ws[i] * (xs[i] - mx) ** 2; cfx += ws[i] * (f[i] - mf) * (xs[i] - mx); }
    const salida = { u, media: mf, de: Math.sqrt(vf) || 1, kappa: vf > 0 && vx > 0 ? cfx / Math.sqrt(vf * vx) : 0, puntos: xs.map((x, i) => ({ w: ws[i], zf: (f[i] - mf) / (Math.sqrt(vf) || 1), u: u(x) })) };
    if (k) cacheCurvas.set(k, salida);
    return salida;
}
function curvaEstandarizada(id, tx) { return curvaTeorica(id, tx).puntos; }
// (revisión 2026.11.05) con una nube (dimensión B), «nube» = { g, norma, acotada }: la dispersión condicional es s·g(u)/norma;
// si el residuo es acotado (triángulo, uniforme en ±½), cuenta la fracción de su intervalo que cae fuera de la escala
export function recorteEsperado(id, eta, tx, zLo, zHi, Phi, nube = null) {
    if (!esFormaCompuesta(id)) return 0;
    const s = Math.sqrt(Math.max(1e-12, 1 - eta * eta));
    return curvaEstandarizada(id, tx).reduce((acc, p) => {
        const m = eta * p.zf;
        if (!nube) return acc + p.w * (Phi((zLo - m) / s) + 1 - Phi((zHi - m) / s));
        const sc = (s * nube.g(p.u)) / nube.norma;
        if (!nube.acotada) return acc + p.w * (Phi((zLo - m) / sc) + 1 - Phi((zHi - m) / sc));
        const a = sc / 2, fuera = Math.max(0, zLo - (m - a)) + Math.max(0, m + a - zHi);
        return acc + p.w * Math.min(1, fuera / (2 * a || 1));
    }, 0);
}
// Mayor η (hasta 0,97) con recorte esperado ≤ tope (bisección: el recorte crece con η)
export function etaMaximaSinRecorte(id, tx, zLo, zHi, Phi, tope = 0.01, nube = null) {
    if (recorteEsperado(id, 0.97, tx, zLo, zHi, Phi, nube) <= tope) return 0.97;
    let lo = 0, hi = 0.97;
    for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (recorteEsperado(id, mid, tx, zLo, zHi, Phi, nube) <= tope) lo = mid; else hi = mid; }
    return lo;
}
// ρ de Spearman con rangos medios para los empates (índices en un Uint32Array: sin un arreglo por elemento)
function rangos(v) {
    const n = v.length, o = new Uint32Array(n);
    for (let i = 0; i < n; i++) o[i] = i;
    o.sort((p, q) => v[p] - v[q]);
    const r = new Float64Array(n);
    for (let i = 0; i < n;) { let j = i; while (j + 1 < n && v[o[j + 1]] === v[o[i]]) j++; const m = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[o[k]] = m; i = j + 1; }
    return r;
}
export function pearsonVec(a, b) {
    const n = a.length; let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n;
    let ab = 0, aa = 0, bb = 0; for (let i = 0; i < n; i++) { const da = a[i] - ma, db = b[i] - mb; ab += da * db; aa += da * da; bb += db * db; }
    return aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : NaN;
}
export const spearman = (a, b) => pearsonVec(rangos(a), rangos(b));

// ρ de Spearman ESPERADA bajo la forma y la fuerza pedidas, condicionada a la muestra (revisión 2026.10.26): con los
// mismos valores de X y su curva f(X), se simulan residuos como los construye el motor (en modo exacto, ortogonales a X
// y a f(X) en la muestra) y cada Y simulada se lleva, por rangos, al marginal OBSERVADO de Y (mismos empates por
// redondeo y recorte). Devuelve la media y la DE de la ρ simulada: la media es lo esperado y la DE fija la tolerancia.
// La ρ no tiene una identidad exacta como la de r; esta es su distribución de referencia. Semilla fija: reproducible.
export const MAXIMO_RHO_ESPERADA = 20000;
// (dimensión B) con una nube, «residuo» = { g: g(X) de cada caso, acotada }: el residuo simulado es g·φ(e), como en el motor
const phiNormal = z => { const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2), e = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2); return z >= 0 ? 0.5 * (1 + e) : 0.5 * (1 - e); };   // Abramowitz y Stegun 7.1.26
export function rhoEsperadaForma(x, fx, y, eta, { exacto = true, reps = null, semilla = 20261026, residuo = null } = {}) {
    // por encima de 20 000 casos, submuestra determinista (paso fijo): la media de ρ apenas depende de n y la tolerancia
    // la fija su mínimo (0.02); así el informe no bloquea la página con bases de hasta 1 000 000 de casos
    if (x.length > MAXIMO_RHO_ESPERADA) {
        const paso = x.length / MAXIMO_RHO_ESPERADA, sel = Array.from({ length: MAXIMO_RHO_ESPERADA }, (_, k) => Math.floor(k * paso));
        return rhoEsperadaForma(sel.map(i => x[i]), sel.map(i => fx[i]), sel.map(i => y[i]), eta, { exacto, reps, semilla, residuo: residuo ? { g: sel.map(i => residuo.g[i]), acotada: residuo.acotada } : null });
    }
    const n = x.length;
    const est = v => { let m = 0; for (let i = 0; i < n; i++) m += v[i]; m /= n; let s = 0; for (let i = 0; i < n; i++) s += (v[i] - m) ** 2; s = Math.sqrt(s / n) || 1; return Float64Array.from(v, t => (t - m) / s); };
    const zx = est(x), zf = est(fx), rx = rangos(x), ordenY = Float64Array.from(y).sort();
    // base ortonormal de [x̃, z̃_f] (Gram–Schmidt) para ortogonalizar el residuo como el modo exacto
    const q1 = zx, p = zf.reduce((s, v, i) => s + v * q1[i], 0) / n, q2raw = Float64Array.from(zf, (v, i) => v - p * q1[i]);
    const nq2 = Math.sqrt(q2raw.reduce((s, v) => s + v * v, 0) / n), q2 = nq2 > 1e-9 ? Float64Array.from(q2raw, v => v / nq2) : null;
    let a = semilla >>> 0;
    const u01 = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };   // mulberry32
    let guardado = null;   // Box–Muller: se aprovechan los dos valores de cada par
    const normal = () => { if (guardado !== null) { const g = guardado; guardado = null; return g; } let u = 0; while (u === 0) u = u01(); const m = Math.sqrt(-2 * Math.log(u)), t = 2 * Math.PI * u01(); guardado = m * Math.sin(t); return m * Math.cos(t); };
    const R = reps || (n <= 1000 ? 300 : n <= 5000 ? 100 : 40), valores = new Float64Array(R), ys = new Float64Array(n), idx = new Uint32Array(n);
    const eps = new Float64Array(n);
    // rango medio (con empates) de cada POSICIÓN del marginal ordenado de Y: los rangos de la Y simulada salen sin reordenar
    const rangoPos = new Float64Array(n);
    for (let i = 0; i < n;) { let j = i; while (j + 1 < n && ordenY[j + 1] === ordenY[i]) j++; for (let k = i; k <= j; k++) rangoPos[k] = (i + j) / 2 + 1; i = j + 1; }
    const ry = new Float64Array(n);
    for (let r = 0; r < R; r++) {
        let m = 0; for (let i = 0; i < n; i++) { const e0 = normal(); eps[i] = residuo ? residuo.g[i] * (residuo.acotada ? phiNormal(e0) - 0.5 : e0) : e0; m += eps[i]; } m /= n;
        for (let i = 0; i < n; i++) eps[i] -= m;
        if (exacto) {
            for (const q of [q1, q2]) { if (!q) continue; const c = eps.reduce((s, v, i) => s + v * q[i], 0) / n; for (let i = 0; i < n; i++) eps[i] -= c * q[i]; }
        }
        const sd = Math.sqrt(eps.reduce((s, v) => s + v * v, 0) / n) || 1, c = Math.sqrt(Math.max(0, 1 - eta * eta)) / sd;
        for (let i = 0; i < n; i++) { ys[i] = eta * zf[i] + c * eps[i]; idx[i] = i; }
        idx.sort((i, j) => ys[i] - ys[j]);
        for (let k = 0; k < n; k++) ry[idx[k]] = rangoPos[k];   // al marginal observado de Y (sus rangos, con empates)
        valores[r] = pearsonVec(rx, ry);
    }
    let media = 0; for (const v of valores) media += v; media /= R;
    let de = 0; for (const v of valores) de += (v - media) ** 2; de = Math.sqrt(de / (R - 1));
    return { media, de, reps: R };
}

// κ con X normal (nota previa de la interfaz, que lo dice): la misma curva teórica, con X = Z
export function kappaForma(id) {
    if (!esFormaCompuesta(id)) return id === 'nula' ? 0 : 1;
    return curvaTeorica(id, z => z, 'normal').kappa;
}
