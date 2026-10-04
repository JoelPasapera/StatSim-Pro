// analizador/relaciones/cribado-forma.js — cribado de la FORMA de muchos pares a la vez (sin DOM), para marcar en la
// criba, en los objetivos específicos y en la matriz de correlaciones los pares cuya relación no es lineal.
// Prueba: RESET de Ramsey (1969) robusta: se añaden X² y X³ a la recta de Y sobre X y se contrasta con errores típicos
// HC3 (MacKinnon y White, 1985) que aporten algo; así la heterocedasticidad no fabrica curvas. La forma es la de Y en
// función de X, en el orden del análisis (variable 1 → 2; dimensión → escala), como en la tarjeta 7: contrastar también
// la dirección inversa marcaba como curvas el 87 % de las rectas con nube triangular y el 92 % con X asimétrica, porque
// si E[Y|X] es recta, E[X|Y] casi nunca lo es. Si la cúbica sugiere un giro, se confirma con la prueba de las dos rectas
// (Simonsohn, 2018): la cúbica «inventa» un máximo en las curvas que se frenan (56 % de las logarítmicas). Con muchos pares, el
// error de la familia se controla con Holm (1979), la misma corrección que usan los objetivos específicos: una marca
// falsa («no es lineal») engaña más que perder una curva sutil, que la tarjeta 7 examina a fondo (con Benjamini y
// Hochberg, la tasa real de falsos descubrimientos llegó al 10 %). La p de cada par se calibra por bootstrap (abajo), con una semilla estable por par.
// Es un CRIBADO: la forma exacta la decide el diagnóstico completo de la tarjeta 7.
import { cdfF } from '../psicometria/numerico.js';
import { media, cuantilPonderado, aleatorio, submuestraPares } from './util-numerico.js';
import { pruebaDosRectas } from './confirmacion-forma.js';

const MINIMO_CASOS = 20;
function inversa(A) {   // matriz simétrica definida positiva pequeña (Cholesky); null si es singular
    const p = A.length, L = Array.from({ length: p }, () => new Float64Array(p));
    for (let i = 0; i < p; i++) for (let j = 0; j <= i; j++) {
        let s = A[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
        if (i === j) { if (!(s > 1e-12 * (Math.abs(A[i][i]) || 1))) return null; L[i][i] = Math.sqrt(s); } else L[i][j] = s / L[j][j];
    }
    const Li = Array.from({ length: p }, () => new Float64Array(p));
    for (let i = 0; i < p; i++) { Li[i][i] = 1 / L[i][i]; for (let j = 0; j < i; j++) { let s = 0; for (let k = j; k < i; k++) s -= L[i][k] * Li[k][j]; Li[i][j] = s / L[i][i]; } }
    return Array.from({ length: p }, (_, i) => Float64Array.from({ length: p }, (_, j) => { let s = 0; for (let k = Math.max(i, j); k < p; k++) s += Li[k][i] * Li[k][j]; return s; }));
}
// RESET robusta de Y sobre X: H0 «X² y X³ no aportan» (solo X² si X tiene 3 valores distintos). El estadístico es el de
// Wald con HC3 y su p se calibra por bootstrap salvaje con residuos restringidos (Davidson y Flachaire, 2008): datos
// generados bajo la recta, con la heterocedasticidad y la asimetría de sus residuos. La p asintótica (F) fallaba en la
// cola, justo donde decide Benjamini–Hochberg: 8,1 % de error con ruido asimétrico y 15 % de falsos descubrimientos.
export function resetRobusta(xs, ys, { B = 999, semilla = 20261102, maximo = 2000 } = {}) {
    const [x, y] = submuestraPares(xs, ys, maximo);   // la calibración cuesta B réplicas: con bases enormes basta una submuestra
    const n = x.length, distintos = new Set(x).size;
    if (n < MINIMO_CASOS || distintos < 3) return { evaluable: false, motivo: n < MINIMO_CASOS ? `menos de ${MINIMO_CASOS} casos` : 'menos de 3 valores distintos' };
    const grado = distintos >= 4 ? 3 : 2, p = grado + 1, mx = media(x), sx = Math.sqrt(x.reduce((s, v) => s + (v - mx) ** 2, 0) / n) || 1;
    const z = Float64Array.from(x, v => (v - mx) / sx);
    // (revisión 2026.11.03) todo lo que depende de X se calcula por VALOR DISTINTO (diseño, (XᵀX)⁻¹, palanca h): cada réplica
    // solo necesita, por valor, la suma de Y y la de Y², con las que el «sándwich» HC3 se reconstruye EXACTAMENTE
    // (Σ e² del grupo = ΣY² − 2ŷΣY + w·ŷ²). Antes cada réplica recorría los n casos con p² productos: 7 s con 20 pares.
    const o = new Uint32Array(n); for (let i = 0; i < n; i++) o[i] = i;
    o.sort((a, b) => z[a] - z[b]);
    const uL = [], wL = [], grupo = new Int32Array(n);
    for (let k = 0; k < n;) { let j = k; while (j < n && z[o[j]] === z[o[k]]) { grupo[o[j]] = uL.length; j++; } uL.push(z[o[k]]); wL.push(j - k); k = j; }
    const u = Float64Array.from(uL), w = Float64Array.from(wL), m = u.length, X = Array.from({ length: p }, (_, k) => Float64Array.from(u, v => v ** k));
    const A = Array.from({ length: p }, (_, a) => Float64Array.from({ length: p }, (_, c) => { let s = 0; for (let j = 0; j < m; j++) s += w[j] * X[a][j] * X[c][j]; return s; }));
    const Ai = inversa(A); if (!Ai) return { evaluable: false, motivo: 'diseño singular' };
    const h = new Float64Array(m); for (let j = 0; j < m; j++) { let s = 0; for (let a = 0; a < p; a++) for (let c = 0; c < p; c++) s += X[a][j] * Ai[a][c] * X[c][j]; h[j] = s; }
    const idx = Array.from({ length: grado - 1 }, (_, k) => k + 2), S = new Float64Array(m), Q = new Float64Array(m);
    const wald = yy => {
        S.fill(0); Q.fill(0); for (let i = 0; i < n; i++) { const g = grupo[i], v = yy[i]; S[g] += v; Q[g] += v * v; }
        const Xty = X.map(col => { let s = 0; for (let j = 0; j < m; j++) s += col[j] * S[j]; return s; }), beta = Ai.map(fila => fila.reduce((s, v, c) => s + v * Xty[c], 0));
        const carne = Array.from({ length: p }, () => new Float64Array(p));
        for (let j = 0; j < m; j++) {
            let yh = 0; for (let a = 0; a < p; a++) yh += beta[a] * X[a][j];
            const peso = Math.max(0, Q[j] - 2 * yh * S[j] + w[j] * yh * yh) / Math.max(1e-12, (1 - h[j]) ** 2);
            for (let a = 0; a < p; a++) { const pa = peso * X[a][j]; for (let c = a; c < p; c++) carne[a][c] += pa * X[c][j]; }
        }
        for (let a = 0; a < p; a++) for (let c = 0; c < a; c++) carne[a][c] = carne[c][a];
        const V = idx.map(r => Float64Array.from(idx, c => { let s = 0; for (let k = 0; k < p; k++) for (let q2 = 0; q2 < p; q2++) s += Ai[r][k] * carne[k][q2] * Ai[q2][c]; return s; }));
        const Vi = inversa(V); if (!Vi) return { W: NaN, beta };
        let W = 0; for (let a = 0; a < idx.length; a++) for (let c = 0; c < idx.length; c++) W += beta[idx[a]] * Vi[a][c] * beta[idx[c]];
        return { W, beta };
    };
    const obs = wald(y); if (!Number.isFinite(obs.W)) return { evaluable: false, motivo: 'covarianza singular' };
    // modelo restringido (la recta) para el bootstrap salvaje; residuos reescalados por 1/√(1 − h) de la recta
    let my = 0, sxy = 0, szz = 0; for (let i = 0; i < n; i++) my += y[i]; my /= n; for (let i = 0; i < n; i++) { sxy += z[i] * (y[i] - my); szz += z[i] * z[i]; }
    const b1 = sxy / szz, y0 = Float64Array.from(z, v => my + b1 * v), e0 = Float64Array.from(y, (v, i) => (v - y0[i]) / Math.sqrt(Math.max(1e-12, 1 - 1 / n - (z[i] * z[i]) / szz))), azar = aleatorio(semilla), yb = new Float64Array(n);
    let mayores = 0;
    for (let r = 0; r < B; r++) { for (let i = 0; i < n; i++) yb[i] = y0[i] + (azar() < 0.5 ? -e0[i] : e0[i]); if (wald(yb).W >= obs.W - 1e-12 * Math.abs(obs.W)) mayores++; }
    const q = idx.length, pAsintotica = Math.max(0, 1 - cdfF(obs.W / q, q, n - p));
    // giros dentro del rango (percentiles 5–95 de los casos), con su tipo por la segunda derivada (f'' < 0: máximo)
    const lo = cuantilPonderado(u, w, 0.05), hi = cuantilPonderado(u, w, 0.95), [, c1, c2, c3 = 0] = obs.beta;
    let raices = [];
    if (Math.abs(c3) > 1e-12) { const disc = 4 * c2 * c2 - 12 * c1 * c3; if (disc > 0) raices = [(-2 * c2 - Math.sqrt(disc)) / (6 * c3), (-2 * c2 + Math.sqrt(disc)) / (6 * c3)]; }
    else if (Math.abs(c2) > 1e-12) raices = [-c1 / (2 * c2)];
    const giros = raices.filter(r => r > lo && r < hi).map(r => ({ x: mx + r * sx, tipo: 2 * c2 + 6 * c3 * r < 0 ? 'máximo' : 'mínimo' }));
    return { evaluable: true, n, grado, W: obs.W, q, p: (1 + mayores) / (B + 1), pAsintotica, B, monotona: giros.length === 0, giros, beta: obs.beta, x, y };
}
// semilla estable por par (FNV-1a del par ordenado): la misma p en cualquier familia (antes dependía de su posición)
const semillaDelPar = (a, b) => { let hsh = 0x811c9dc5; for (const ch of `${a}\u0001${b}`) { hsh ^= ch.codePointAt(0); hsh = Math.imul(hsh, 0x01000193) >>> 0; } return hsh; };
// forma de Y en función de X para un par; si la cúbica sugiere un giro (y hay indicio de curva), las dos rectas deciden
function formaPar(xs, ys, opciones = {}) {
    const x = [], y = [];
    // la misma conversión que la correlación principal (parseFloat): las marcas se refieren exactamente a sus datos
    for (let i = 0; i < Math.min(xs.length, ys.length); i++) { const a = parseFloat(xs[i]), b = parseFloat(ys[i]); if (Number.isFinite(a) && Number.isFinite(b)) { x.push(a); y.push(b); } }
    const r = resetRobusta(Float64Array.from(x), Float64Array.from(y), opciones);
    if (!r.evaluable) return { evaluable: false, motivo: r.motivo, n: x.length };
    let giro = null;
    if (r.p < 0.05) for (const g of r.giros) { const dr = pruebaDosRectas(r.x, r.y, g.tipo); if (dr.confirmada) { giro = { x: dr.corte, tipo: g.tipo }; break; } }
    return { evaluable: true, n: x.length, p: r.p, pAsintotica: r.pAsintotica, B: r.B, monotona: !giro, giro };
}
// Holm (1979): p ajustados que controlan la probabilidad de alguna marca falsa en la familia, con cualquier dependencia
export function ajustarHolm(ps) {
    const m = ps.length, orden = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]), ajust = new Array(m);
    let maximo = 0;
    orden.forEach(([p, i], k) => { maximo = Math.max(maximo, Math.min(1, (m - k) * p)); ajust[i] = maximo; });
    return ajust;
}
export const claveParForma = (a, b) => [a, b].sort().join('\u0001');
// cribado de una familia de pares {a, b} (nombres de columna) sobre filas de objetos; devuelve un Map clave → resultado
export function cribarFormas(filasTodas, pares, { alfa = 0.05 } = {}) {
    // con bases enormes, filas elegidas a paso fijo ANTES de convertir (la RESET usa a lo sumo 2 000 casos completos):
    // convertir el millón de filas de cada par costaba más que la propia prueba
    const filas = filasTodas.length > 20000 ? Array.from({ length: 20000 }, (_, k) => filasTodas[Math.floor((k * filasTodas.length) / 20000)]) : filasTodas;
    // cada par, en la dirección en que aparece PRIMERO (new Map(...) conservaría la última: la matriz del Word, añadida al
    // final, invertía la dirección de la criba y una U de Y sobre X se evaluaba como X sobre Y, donde es plana)
    const unicos = []; const vistos = new Set();
    for (const pr of pares) { const k = claveParForma(pr.a, pr.b); if (!vistos.has(k)) { vistos.add(k); unicos.push(pr); } }
    // B suficiente para que Holm pueda rechazar: 1/(B + 1) ≤ α/(2m)
    const B = Math.max(999, Math.ceil((2 * unicos.length) / alfa) - 1);
    const res = unicos.map(pr => ({ ...pr, ...formaPar(filas.map(f => f[pr.a]), filas.map(f => f[pr.b]), { B, semilla: semillaDelPar(pr.a, pr.b) }) }));
    const evaluables = res.filter(r => r.evaluable), ajust = ajustarHolm(evaluables.map(r => r.p));
    evaluables.forEach((r, k) => { r.pAjustada = ajust[k]; r.noLineal = ajust[k] < alfa; r.tipo = r.noLineal ? (r.monotona ? 'curva-monotona' : 'no-monotona') : 'recta'; });
    res.filter(r => !r.evaluable).forEach(r => { r.tipo = 'no-evaluable'; r.noLineal = false; });
    return { alfa, m: evaluables.length, B, resultados: new Map(res.map(r => [claveParForma(r.a, r.b), r])) };
}
// pares que aparecen en un análisis de correlación: el principal, los de la criba y los de la matriz del Word
// (variables principales + columnas de los objetivos seleccionados, todos contra todos). Cada par se evalúa en la
// dirección en que aparece primero: {a: X, b: Y}
export function paresDelAnalisis(var1, var2, criba) {
    const pares = [{ a: var1, b: var2 }], columnas = [var1, var2];
    for (const e of (criba && criba.evaluados) || []) if (e.columnaX && e.columnaY) pares.push({ a: e.columnaX, b: e.columnaY });
    for (const s of (criba && criba.seleccionados) || []) for (const c of [s.columnaX, s.columnaY]) if (c && !columnas.includes(c)) columnas.push(c);
    for (let i = 0; i < columnas.length; i++) for (let j = i + 1; j < columnas.length; j++) pares.push({ a: columnas[i], b: columnas[j] });
    return pares;
}
