// analizador/relaciones/nube.js — diagnóstico de la NUBE de puntos (dimensión B del Atlas de relaciones; sin DOM):
//  · abanico: Breusch–Pagan en la versión de Koenker (1981) sobre los residuos de la forma elegida (con X; y con X y X²,
//    como la prueba de White, 1980), para que una curva no se confunda con un cambio de dispersión;
//  · bordes de la nube: regresión de cuantiles (Koenker y Bassett, 1978) en τ = .10, .50 y .90 con IC por remuestreo de
//    pares; distinguen una nube de bordes paralelos, un abanico, un triángulo con techo (borde superior inclinado, el
//    inferior plano) o con suelo;
//  · condición necesaria (NCA; Dul, 2016): techos CE-FDH y CR-FDH, tamaño del efecto d y prueba por permutaciones (Dul,
//    van der Laan y Kuik, 2020). Esa prueba contrasta la independencia, así que una simple correlación ya deja vacía la
//    esquina: solo se interpreta como necesidad si la nube es triangular;
//  · efecto techo o suelo de la medida: casos en el valor extremo observado (más del 15 %; Terwee et al., 2007);
//  · atípicos influyentes en la recta de Y sobre X: distancia de Cook (1977), residuos estudentizados eliminados con
//    Bonferroni, y cambio de r al retirar los casos con D > 4/n.
import { gammaRegularizadaQ, betaRegularizada, cuantilF } from '../psicometria/numerico.js';
import { calibrarInfluencia } from './mcd.js';
import { media, regresionMCO, cuantil, pearson, aleatorio, submuestraPares as submuestra } from './util-numerico.js';


// ---------------------------------------------------------------- abanico: Breusch–Pagan (Koenker)
export function breuschPaganKoenker(e, cols) {
    const n = e.length, e2 = Float64Array.from(e, v => v * v), f = regresionMCO(cols, e2);
    if (!f) return { error: 'Los regresores no tienen variación suficiente.' };
    const lm = n * f.r2, gl = cols.length;
    return { lm, gl, p: gammaRegularizadaQ(gl / 2, lm / 2), sube: f.beta[1] > 0 };
}

// ---------------------------------------------------------------- regresión de cuantiles
// k-ésimo menor (0-based) por selección rápida (Hoare con mediana de tres), sobre una copia de trabajo
function seleccionar(a, k) {
    let lo = 0, hi = a.length - 1;
    while (hi > lo) {
        const m = (lo + hi) >> 1, v1 = a[lo], v2 = a[m], v3 = a[hi];
        const piv = v1 < v2 ? (v2 < v3 ? v2 : v1 < v3 ? v3 : v1) : (v1 < v3 ? v1 : v2 < v3 ? v3 : v2);
        let i = lo, j = hi;
        while (i <= j) { while (a[i] < piv) i++; while (a[j] > piv) j--; if (i <= j) { const t = a[i]; a[i] = a[j]; a[j] = t; i++; j--; } }
        if (k <= j) hi = j; else if (k >= i) lo = i; else return a[k];
    }
    return a[k];
}
// Para una pendiente b, la constante óptima es un cuantil τ de y − b·x y la pérdida es convexa en b (minimización parcial
// de una función convexa): la pendiente se busca por sección áurea y el resultado es la solución exacta de la programación
// lineal de Koenker y Bassett (1978), comprobada contra scipy.optimize.linprog
// iteraciones: 80 bastan para la precisión de doble (2M·0,618⁸⁰ ≈ 10⁻¹⁴); en las réplicas del remuestreo, 45 (≈ 10⁻⁷)
export function regresionCuantil(x, y, tau, iteraciones = 80) {
    const n = x.length, r = new Float64Array(n), trabajo = new Float64Array(n), k = Math.max(0, Math.ceil(tau * n) - 1);
    const perdida = b => {
        for (let i = 0; i < n; i++) r[i] = y[i] - b * x[i];
        trabajo.set(r); const a = seleccionar(trabajo, k); let s = 0;
        for (let i = 0; i < n; i++) { const u = r[i] - a; s += u >= 0 ? tau * u : (tau - 1) * u; }
        return { a, s };
    };
    const mx = media(x), my = media(y); let sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
    const M = 100 * Math.sqrt(syy / (sxx || 1)) + 1, g = (Math.sqrt(5) - 1) / 2;
    let lo = -M, hi = M, c = hi - g * (hi - lo), d = lo + g * (hi - lo), fc = perdida(c).s, fd = perdida(d).s;
    for (let it = 0; it < iteraciones; it++) {
        if (fc <= fd) { hi = d; d = c; fd = fc; c = hi - g * (hi - lo); fc = perdida(c).s; } else { lo = c; c = d; fc = fd; d = lo + g * (hi - lo); fd = perdida(d).s; }
    }
    const b = (lo + hi) / 2, { a, s } = perdida(b);
    return { tau, a, b, perdida: s };
}
function cuantilesNube(xs, ys, { B = 200, semilla = 20261031, maximo = 20000, maximoRemuestreo = 2000 } = {}) {
    const taus = [0.1, 0.5, 0.9], [x, y] = submuestra(xs, ys, maximo), est = taus.map(t => regresionCuantil(x, y, t));
    const [xb, yb] = submuestra(xs, ys, maximoRemuestreo), m = xb.length, u = aleatorio(semilla), pend = taus.map(() => []), dif = [];
    const bx = new Float64Array(m), by = new Float64Array(m);
    for (let r = 0; r < B; r++) {
        for (let i = 0; i < m; i++) { const j = Math.floor(u() * m); bx[i] = xb[j]; by[i] = yb[j]; }
        const b = taus.map(t => regresionCuantil(bx, by, t, 45).b); b.forEach((v, k) => pend[k].push(v)); dif.push(b[2] - b[0]);
    }
    const ic = v => { const o = Float64Array.from(v).sort(); return [cuantil(o, 0.025), cuantil(o, 0.975)]; };
    return { taus, rectas: est.map(e => ({ a: e.a, b: e.b })), pendientes: est.map(e => e.b), ic: pend.map(ic), diferencia: { valor: est[2].b - est[0].b, ic: ic(dif) }, B, n: x.length, nRemuestreo: m };
}
// patrón de los bordes: paralela, abanico, triángulo con techo (condición necesaria) o con suelo. Un patrón distinto de
// «paralela» exige que la dispersión cambie (Breusch–Pagan significativa: error controlado) y que los bordes se separen
// (IC de la diferencia de pendientes sin el 0). Un borde es «plano» si su pendiente es pequeña frente a la del otro (menos
// de un cuarto): no se exige que sea compatible con 0 (en el triángulo y = x·U(0, 1) el borde inferior sube a 0,1·x) ni
// basta con no encontrarle pendiente (ausencia de evidencia no es evidencia).
function patronNube(q, dispersionCambia) {
    const [ic10, , ic90] = q.ic, [b10, , b90] = q.pendientes, contiene0 = ic => ic[0] <= 0 && ic[1] >= 0;
    if (!dispersionCambia || contiene0(q.diferencia.ic)) return { patron: 'paralela' };
    const dispersion = q.diferencia.valor > 0 ? 'crece' : 'decrece';
    if (Math.abs(b10) <= 0.25 * Math.abs(b90) && !contiene0(ic90)) return { patron: 'techo', direccion: Math.sign(b90), dispersion };
    if (Math.abs(b90) <= 0.25 * Math.abs(b10) && !contiene0(ic10)) return { patron: 'suelo', direccion: Math.sign(b10), dispersion };
    return { patron: 'abanico', dispersion };
}

// ---------------------------------------------------------------- condición necesaria (NCA)
// direccion 1: sin X alta no hay Y alta (esquina superior izquierda vacía); −1: sin X BAJA no hay Y alta (superior derecha)
function zonaTecho(u, maxPorValor, ymax) {   // CE-FDH: techo escalonado = máximo acumulado de Y hasta cada valor de X
    let R = -Infinity, zona = 0; const pares = [];
    for (let j = 0; j < u.length; j++) { if (maxPorValor[j] > R) { R = maxPorValor[j]; pares.push([u[j], R]); } if (j < u.length - 1) zona += (ymax - R) * (u[j + 1] - u[j]); }
    return { zona, pares };
}
function zonaSobreRecta(a, b, x0, x1, ymin, ymax) {   // ∫ (ymax − recorte(a + b·x, ymin, ymax)) dx en [x0, x1], por tramos
    const cortes = [x0, x1]; if (b !== 0) for (const v of [(ymin - a) / b, (ymax - a) / b]) if (v > x0 && v < x1) cortes.push(v);
    cortes.sort((p, q) => p - q); let s = 0;
    for (let k = 0; k < cortes.length - 1; k++) { const p = cortes[k], q = cortes[k + 1], mid = a + b * ((p + q) / 2); if (mid >= ymax) continue; if (mid <= ymin) { s += (ymax - ymin) * (q - p); continue; } s += (ymax - a) * (q - p) - (b * (q * q - p * p)) / 2; }
    return s;
}
export function analisisNecesidad(x0, y, { direccion = 1, B = null, semilla = 20261031 } = {}) {
    const n = x0.length, x = direccion < 0 ? Float64Array.from(x0, v => -v) : x0, o = new Uint32Array(n); for (let i = 0; i < n; i++) o[i] = i;
    o.sort((p, q) => x[p] - x[q]);
    const uL = [], grupo = new Int32Array(n); for (let k = 0; k < n;) { let j = k; while (j < n && x[o[j]] === x[o[k]]) { grupo[o[j]] = uL.length; j++; } uL.push(x[o[k]]); k = j; }
    const u = Float64Array.from(uL), m = u.length; let ymin = Infinity, ymax = -Infinity; for (const v of y) { if (v < ymin) ymin = v; if (v > ymax) ymax = v; }
    const alcance = (u[m - 1] - u[0]) * (ymax - ymin);
    if (!(alcance > 0) || m < 3) return { error: 'Hacen falta al menos 3 valores distintos de X y variación en Y.' };
    const maxPor = yy => { const M = new Float64Array(m).fill(-Infinity); for (let i = 0; i < n; i++) if (yy[i] > M[grupo[i]]) M[grupo[i]] = yy[i]; return M; };
    const { zona, pares } = zonaTecho(u, maxPor(y), ymax), d = zona / alcance;
    // CR-FDH: recta por mínimos cuadrados que pasa por las esquinas superiores del techo escalonado
    let dCR = NaN, recta = null;
    if (pares.length >= 2) { const f = regresionMCO([Float64Array.from(pares, p => p[0])], Float64Array.from(pares, p => p[1])); if (f) { recta = { a: f.beta[0], b: f.beta[1] }; dCR = zonaSobreRecta(recta.a, recta.b, u[0], u[m - 1], ymin, ymax) / alcance; } }
    // prueba por permutaciones de Y (Dul et al., 2020): el alcance no cambia al permutar
    const R = B || (n <= 20000 ? 999 : n <= 100000 ? 199 : 99), aleat = aleatorio(semilla), yp = Float64Array.from(y); let mayores = 0;
    for (let r = 0; r < R; r++) { for (let i = n - 1; i > 0; i--) { const j = Math.floor(aleat() * (i + 1)); const t = yp[i]; yp[i] = yp[j]; yp[j] = t; } if (zonaTecho(u, maxPor(yp), ymax).zona >= zona - 1e-12 * alcance) mayores++; }
    const tamano = d < 0.1 ? 'pequeño' : d < 0.3 ? 'mediano' : d < 0.5 ? 'grande' : 'muy grande';
    const techo = pares.map(([xx, yy]) => [direccion < 0 ? -xx : xx, yy]);
    return { direccion, d, dCR, tamano, p: (1 + mayores) / (R + 1), B: R, esquinas: pares.length, techo, recta: recta && direccion < 0 ? { a: recta.a, b: -recta.b } : recta };
}

// ---------------------------------------------------------------- efecto techo o suelo de la medida
export function techoSuelo(v) {
    const n = v.length; let min = Infinity, max = -Infinity; for (const t of v) { if (t < min) min = t; if (t > max) max = t; }
    let enMax = 0, enMin = 0; for (const t of v) { if (t === max) enMax++; if (t === min) enMin++; }
    return { min, max, pMax: enMax / n, pMin: enMin / n, techo: enMax / n > 0.15, suelo: enMin / n > 0.15 };
}

// ---------------------------------------------------------------- atípicos influyentes en la recta de Y sobre X
// Cook (1977): pendiente, residuos, palancas y distancias, y la r sin los casos con D > 4/n; común al diagnóstico y a las
// muestras de la nula de la calibración (revisión 2026.11.12)
function cookBasico(x, y) {
    const n = x.length, mx = media(x), my = media(y); let sxx = 0, sxy = 0; for (let i = 0; i < n; i++) { sxx += (x[i] - mx) ** 2; sxy += (x[i] - mx) * (y[i] - my); }
    const b = sxy / sxx, a = my - b * mx, e = Float64Array.from(y, (v, i) => v - a - b * x[i]); let rss = 0; for (const v of e) rss += v * v;
    const s2 = rss / (n - 2), D = new Float64Array(n), hs = new Float64Array(n), umbral = 4 / n, resto = [];
    for (let i = 0; i < n; i++) { const h = 1 / n + (x[i] - mx) ** 2 / sxx; hs[i] = h; D[i] = (e[i] * e[i] * h) / (2 * s2 * (1 - h) ** 2); if (D[i] <= umbral) resto.push(i); }
    const rTodos = pearson(x, y), rSin = resto.length >= 10 ? pearson(Float64Array.from(resto, i => x[i]), Float64Array.from(resto, i => y[i])) : NaN;
    return { e, hs, s2, D, umbral, rTodos, rSin };
}
export function influenciaLineal(x, y, filas = null, { B = null } = {}) {
    const n = x.length; if (n < 10) return { error: 'Hacen falta al menos 10 casos.' };
    const { e, hs, s2, D, umbral, rTodos, rSin } = cookBasico(x, y), t = new Float64Array(n), pB = new Float64Array(n), gl = n - 3;
    const pBonf = ti => Math.min(1, n * betaRegularizada(gl / (gl + ti * ti), gl / 2, 0.5));
    for (let i = 0; i < n; i++) {
        const h = hs[i], s2i = ((n - 2) * s2 - (e[i] * e[i]) / (1 - h)) / (n - 3); t[i] = e[i] / Math.sqrt(s2i * (1 - h));
        // con n ≥ 20, un caso con |t| ≤ 3 nunca es atípico según Bonferroni (n·p > .05): su p solo se calcula si hace falta
        pB[i] = n >= 20 && Math.abs(t[i]) <= 3 ? NaN : pBonf(t[i]);
    }
    // recuentos y los 5 casos de mayor D en pasadas lineales (antes se ordenaban las n distancias: ≈ 1 s con n = 10⁶)
    const fMediana = cuantilF(0.5, 2, n - 2), top = [], filasMuy = [], filasAtip = [];
    let nInfluyentes = 0, nMuy = 0, nAtip = 0;
    for (let i = 0; i < n; i++) {
        if (D[i] > umbral) nInfluyentes++;
        if (D[i] > fMediana) { nMuy++; if (filasMuy.length < 10) filasMuy.push(filas ? filas[i] : i + 1); }
        if (pB[i] < 0.05) { nAtip++; if (filasAtip.length < 10) filasAtip.push(filas ? filas[i] : i + 1); }   // NaN < .05 es falso
        if (top.length < 5 || D[i] > D[top[top.length - 1]]) { top.push(i); top.sort((p, q) => D[q] - D[p]); if (top.length > 5) top.pop(); }
    }
    const caso = i => ({ fila: filas ? filas[i] : i + 1, x: x[i], y: y[i], D: D[i], t: t[i], pBonferroni: Number.isNaN(pB[i]) ? pBonf(t[i]) : pB[i] });
    // (revisión 2026.11.12) «la r depende de pocos casos», calibrado con las mismas remuestras de la nula (mcd.js): caso a caso
    // (algún caso destaca según Cook o Bonferroni, quitar los de D > 4/n mueve la r ≥ .10 y eso es inusual para estas
    // marginales) o en grupo (MCD: un grupo de casos juntos se enmascara caso a caso)
    // remuestras: 199 hasta n = 1000 y 99 por encima (revisión 2026.11.14: con n = 5000 y 199, 4,5 s; el p mínimo de 99, .01,
    // sigue por debajo del 2,5 % de la decisión, y con n grande los efectos que importan son claros)
    const cal = calibrarInfluencia(x, y, { B: B || (n > 1000 ? 99 : 199), casoACaso: (xx, yy) => { const k = cookBasico(xx, yy); return Math.abs(k.rSin - k.rTodos); } });
    // las dos pruebas al 2,5 % (Bonferroni): su unión no pasa del 5 % (cada una al 5 % llegaba al 10 % con n = 100)
    const g = cal.grupo, porGrupo = g.aplica && g.p !== null && g.p < 0.025 && g.delta >= 0.1;
    const porCaso = (nMuy > 0 || nAtip > 0) && Math.abs(rSin - rTodos) >= 0.1 && (cal.caso.p === null || cal.caso.p < 0.025);
    return { n, umbral, fMediana, nInfluyentes, nMuyInfluyentes: nMuy, nAtipicos: nAtip,
        maxD: D[top[0]], rTodos, rSin, cambio: rSin - rTodos, principales: top.map(caso), filasMuyInfluyentes: filasMuy, filasAtipicas: filasAtip,
        sensible: porCaso || porGrupo, porCaso, porGrupo, pCaso: cal.caso.p,
        grupo: g.aplica ? { p: g.p, delta: g.delta, rMayoria: g.rMayoria, rRobusta: g.rRobusta, nFuera: g.fuera.length, filas: g.fuera.slice(0, 10).map(i => (filas ? filas[i] : i + 1)) } : { aplica: false, motivo: g.motivo },
        enmascarados: porGrupo && !porCaso };
}

// ---------------------------------------------------------------- diagnóstico completo de la nube
// Variables con pocos valores distintos (p. ej., un ítem Likert): sus cuantiles son saltos, no bordes, y amontonarse en la
// categoría extrema es lo habitual (el criterio del 15 % es para puntajes de escala). Con menos de 8 valores distintos no se
// evalúan los bordes ni la condición necesaria (si es Y) ni el techo o suelo de esa variable (revisión 2026.11.01: con un
// ítem de 5 puntos se declaraba «efecto techo» en 29 de 30 bases).
const MINIMO_VALORES_NUBE = 8;
// (revisión 2026.11.04) si la tendencia cambia de sentido (U, J, cúbica, cíclica), los bordes RECTOS de cuantil no la describen
// (una U con abanico salía «suelo»): se evalúan la dispersión y la influencia, pero no los bordes ni la condición necesaria
export function diagnosticarNube(x, y, residuos, { signo = 1, filas = null, B = null, tendenciaNoMonotona = false } = {}) {
    const mx = media(x), cuadrado = Float64Array.from(x, v => (v - mx) ** 2);   // X centrada: mismo espacio de columnas, mejor condicionado
    const bp = breuschPaganKoenker(residuos, [x]), white = breuschPaganKoenker(residuos, [x, cuadrado]);
    const valoresX = new Set(x).size, valoresY = new Set(y).size, bordes = valoresY >= MINIMO_VALORES_NUBE && !tendenciaNoMonotona;
    const cuantiles = bordes ? cuantilesNube(x, y) : null, patron = bordes ? patronNube(cuantiles, !bp.error && bp.p < 0.05) : { patron: 'no-aplica', valoresY, motivo: tendenciaNoMonotona ? 'no-monotona' : 'pocos-valores' };
    const direccionNCA = patron.patron === 'techo' ? (patron.direccion || 1) : signo >= 0 ? 1 : -1;
    const necesidad = bordes ? analisisNecesidad(x, y, { direccion: direccionNCA, B }) : { noAplica: true, valoresY, motivo: tendenciaNoMonotona ? 'no-monotona' : 'pocos-valores' };
    // se interpreta como condición necesaria solo con techo triangular, dispersión que cambia (Breusch–Pagan) y NCA
    // significativa con un efecto de al menos .10 (Dul et al., 2020)
    const necesaria = patron.patron === 'techo' && !bp.error && bp.p < 0.05 && !necesidad.error && !necesidad.noAplica && necesidad.p < 0.05 && necesidad.d >= 0.1;
    const extremos = (v, k) => (k >= MINIMO_VALORES_NUBE ? techoSuelo(v) : { noAplica: true, valores: k });
    return { heterocedasticidad: { bp, white, hay: !bp.error && bp.p < 0.05 }, cuantiles, patron, necesidad, necesaria, techoSuelo: { x: extremos(x, valoresX), y: extremos(y, valoresY) }, influencia: influenciaLineal(x, y, filas) };
}
