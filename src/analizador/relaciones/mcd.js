// analizador/relaciones/mcd.js — influencia EN GRUPO (revisión 2026.11.12, a raíz de la fase B4 del Simulador). Unos pocos
// casos juntos se ocultan entre sí en el análisis caso a caso (Cook, Bonferroni): quitar uno deja a los demás sosteniendo la
// recta (enmascaramiento). Aquí:
//  · MCD de dos variables (Rousseeuw, 1984) con un 25 % de ruptura: el 75 % de los casos cuya elipse de covarianza tiene el
//    menor volumen, en su versión determinista (DetMCD; Hubert, Rousseeuw y Verdonck, 2012): cinco arranques robustos y pasos
//    de concentración (Rousseeuw y Van Driessen, 1999), reponderado (fuera, d² > χ²₂;.975);
//  · Δ = |r de todos − r de la mayoría que deja el MCD|;
//  · p por remuestreo bajo la nula: cópula gaussiana con la correlación de la mayoría (en puntuaciones normales) y las
//    distribuciones MARGINALES observadas, empates y asimetrías incluidos: ¿es inusual que unos pocos casos muevan la r tanto,
//    dadas estas marginales? (una detección robusta sin calibrar daba un 13 % de falsas alarmas con n = 30)
import { pearson, aleatorio } from './util-numerico.js';
import { generadorNormales } from '../../core/random/normal.js';
import { limitesAjustados } from './asimetria.js';
import { cuantilNormal, cdfNormal } from '../../core/stats/numerico.js';
import { mediana, medianaOrdenada, rangosPromedio as rangos, kEsimo } from '../../core/stats/orden.js';
import { desviacion } from '../../core/stats/descriptivos.js';

const Q2 = p => -2 * Math.log(1 - p);                       // cuantil de la χ² con 2 gl
const F4 = q => 1 - Math.exp(-q / 2) * (1 + q / 2);          // distribución de la χ² con 4 gl (factores de consistencia)
const CORTE = Q2(0.975);
function escala(v) { const m = mediana(v), mad = 1.4826 * mediana(Array.from(v, t => Math.abs(t - m))); if (mad > 0) return mad; return desviacion(v) || 1; }   // (2026.12.25) la DE del núcleo único
const inversaNormal = cuantilNormal;
const phi = cdfNormal;

// media y covarianza (divisor h) de un subconjunto
function momentos(x, y, idx) {
    let mx = 0, my = 0; for (const i of idx) { mx += x[i]; my += y[i]; } mx /= idx.length; my /= idx.length;
    let sxx = 0, syy = 0, sxy = 0; for (const i of idx) { const a = x[i] - mx, b = y[i] - my; sxx += a * a; syy += b * b; sxy += a * b; }
    const k = idx.length; return { mx, my, sxx: sxx / k, syy: syy / k, sxy: sxy / k };
}
function distancias(x, y, m, c = 1) {
    const det = (m.sxx * m.syy - m.sxy * m.sxy) * c * c || 1e-300, ixx = (m.syy * c) / det, iyy = (m.sxx * c) / det, ixy = (-m.sxy * c) / det, d2 = new Float64Array(x.length);
    for (let i = 0; i < x.length; i++) { const a = x[i] - m.mx, b = y[i] - m.my; d2[i] = a * a * ixx + 2 * a * b * ixy + b * b * iyy; }
    return d2;
}
// índices de los h casos de menor d²: el h-ésimo valor por selección (O(n); 2026.12.25: la del núcleo único, antes una
// copia) y la recogida, con los empates en orden
function menores(d2, h) {
    const umbral = kEsimo(Float64Array.from(d2), h - 1), out = []; for (let i = 0; i < d2.length && out.length < h; i++) if (d2[i] < umbral) out.push(i);
    for (let i = 0; i < d2.length && out.length < h; i++) if (d2[i] === umbral) out.push(i);
    return out;
}
// pasos de concentración: el determinante de la covarianza del subconjunto nunca crece; se para cuando deja de bajar
function concentrar(x, y, h, idx) {
    let m = momentos(x, y, idx), det = m.sxx * m.syy - m.sxy * m.sxy;
    for (let it = 0; it < 60; it++) {
        const nuevos = menores(distancias(x, y, m), h), m2 = momentos(x, y, nuevos), det2 = m2.sxx * m2.syy - m2.sxy * m2.sxy;
        if (!(det2 < det * (1 - 1e-12))) break;
        m = m2; det = det2; idx = nuevos;
    }
    return { idx, m, det };
}
// autovectores de una matriz simétrica 2 × 2 (forma cerrada)
function autovectores(a, b, c) { const t = 0.5 * Math.atan2(2 * b, a - c); return [[Math.cos(t), Math.sin(t)], [-Math.sin(t), Math.cos(t)]]; }

// MCD de dos variables, determinista y reponderado: correlación robusta, casos dentro y distancias finales
export function mcd2d(x, y, fraccion = 0.75) {
    const n = x.length, h = Math.max(3, Math.ceil(fraccion * n)), mx = mediana(x), my = mediana(y), sx = escala(x), sy = escala(y);
    const zx = Float64Array.from(x, v => (v - mx) / sx), zy = Float64Array.from(y, v => (v - my) / sy);
    const rx = rangos(x), ry = rangos(y), nsx = Float64Array.from(rx, r => inversaNormal((r - 1 / 3) / (n + 1 / 3))), nsy = Float64Array.from(ry, r => inversaNormal((r - 1 / 3) / (n + 1 / 3)));
    // cinco matrices de dispersión iniciales en la escala z (DetMCD, sin la OGK)
    const corr = r => [1, r, 1], iniciales = [corr(pearson(zx.map(Math.tanh), zy.map(Math.tanh))), corr(pearson(rx, ry)), corr(pearson(nsx, nsy))];
    { let a = 0, b = 0, c = 0; for (let i = 0; i < n; i++) { const nr = Math.hypot(zx[i], zy[i]) || 1; a += (zx[i] / nr) ** 2; b += (zx[i] * zy[i]) / nr ** 2; c += (zy[i] / nr) ** 2; } iniciales.push([a / n, b / n, c / n]); }
    { const cerca = menores(Float64Array.from(zx, (v, i) => v * v + zy[i] * zy[i]), Math.ceil(n / 2)), m = momentos(zx, zy, cerca); iniciales.push([m.sxx, m.sxy, m.syy]); }
    let mejor = null;
    for (const [a, b, c] of iniciales) {
        // proyectar sobre los autovectores, escalas robustas: dispersión y centro iniciales, en unidades originales
        const [e1, e2] = autovectores(a, b, c), p1 = Float64Array.from(zx, (v, i) => e1[0] * v + e1[1] * zy[i]), p2 = Float64Array.from(zx, (v, i) => e2[0] * v + e2[1] * zy[i]);
        const l1 = escala(p1) ** 2, l2 = escala(p2) ** 2, c1 = mediana(p1), c2 = mediana(p2);
        const Sz = { sxx: l1 * e1[0] ** 2 + l2 * e2[0] ** 2, sxy: l1 * e1[0] * e1[1] + l2 * e2[0] * e2[1], syy: l1 * e1[1] ** 2 + l2 * e2[1] ** 2 };
        const m0 = { mx: mx + sx * (c1 * e1[0] + c2 * e2[0]), my: my + sy * (c1 * e1[1] + c2 * e2[1]), sxx: Sz.sxx * sx * sx, sxy: Sz.sxy * sx * sy, syy: Sz.syy * sy * sy };
        const r = concentrar(x, y, h, menores(distancias(x, y, m0), h));
        if (!mejor || r.det < mejor.det) mejor = r;
    }
    // consistencia del crudo, reponderado con el corte de la χ²₂;.975 y consistencia del reponderado
    const cCrudo = (h / n) / F4(Q2(h / n)), d2c = distancias(x, y, mejor.m, cCrudo), dentro = new Uint8Array(n), idx = [];
    for (let i = 0; i < n; i++) if (d2c[i] <= CORTE) { dentro[i] = 1; idx.push(i); }
    const mr = momentos(x, y, idx), d2 = distancias(x, y, mr, 0.975 / F4(CORTE));
    return { r: mr.sxy / Math.sqrt(mr.sxx * mr.syy), dentro, d2, centro: [mr.mx, mr.my], h, nDentro: idx.length, detCrudo: mejor.det, subconjunto: mejor.idx };
}

const rDentro = (x, y, dentro) => { const a = [], b = []; for (let i = 0; i < x.length; i++) if (dentro[i]) { a.push(x[i]); b.push(y[i]); } return pearson(Float64Array.from(a), Float64Array.from(b)); };
// Casos groseramente alejados: fuera de la elipse robusta del 99,9 %, calculada sobre puntuaciones tipificadas CON LA ASIMETRÍA de
// cada marginal (a cada lado de la mediana, la distancia al límite del boxplot ajustado de Hubert y Vandervieren, 2008, vale 2,698,
// el valor del límite de Tukey en una normal). Revisión 2026.11.25. Con marginales simétricas NO es la regla anterior (revisión de
// la 2026.11.27, que corrigió esta afirmación): el medcouple de una muestra pequeña es ruidoso y la tipificación tiene pendientes
// algo distintas a cada lado, así que acota más casos (con n = 30, cuatro veces más), pero sus decisiones son las mismas que las
// de la regla anterior (ninguna discrepancia en 800 muestras normales con n = 30 y 60). Con una marginal asimétrica, la cola legítima ya no queda fuera
// de la elipse (antes se acotaba en la nula y la muestra real parecía más influyente: 9–10 % de falsas alarmas con una lognormal
// de σ .6, ≈ 6 % ahora). Se probó también juzgar cada marginal por separado (sus límites ajustados): igualaba las falsas alarmas
// pero perdía detección, porque un grupo plantado en la esquina alta tiene valores que de uno en uno no son extremos y en
// conjunto sí. Si una marginal no tiene límites (RIC = 0), se usa la regla anterior.
function casosGroseros(x, y, m, q999) {
    const anterior = () => Uint8Array.from({ length: x.length }, (_, i) => (m.d2[i] > q999 ? 1 : 0));
    const mediana = v => medianaOrdenada(Float64Array.from(v).sort());   // (2026.12.24) la del núcleo, sobre la serie ordenada (NaN al final, como antes)
    const tipificar = v => {
        const l = limitesAjustados(v), md = mediana(v);
        if (!Number.isFinite(l.alto) || !Number.isFinite(l.bajo) || !(l.alto > md) || !(md > l.bajo)) return null;
        return Float64Array.from(v, w => 2.698 * (w >= md ? (w - md) / (l.alto - md) : (w - md) / (md - l.bajo)));
    };
    const zx = tipificar(x), zy = tipificar(y);
    if (!zx || !zy) return anterior();
    const ma = mcd2d(zx, zy);
    return Uint8Array.from({ length: x.length }, (_, i) => (ma.d2[i] > q999 ? 1 : 0));
}

// Calibración común de la influencia (revisión 2026.11.12). Con las MISMAS remuestras de la nula (cópula gaussiana con la
// correlación de la mayoría y las marginales observadas) da dos valores p: el del grupo (Δ = |r − r de la mayoría del MCD|) y
// el del estadístico caso a caso que se le pasa (casoACaso(x, y), el cambio de r al quitar los casos con D > 4/n). Con
// marginales asimétricas la cola es legítima y mueve la r en cualquier muestra: sin calibrar, la regla caso a caso saltaba en
// el 30–35 % de las muestras con n = 30. Solo se remuestrea si algún cambio llega a .10 (sin él no hay influencia práctica);
// entre 20 y 5000 casos (con menos no hay mayoría fiable; con más, unos pocos casos no mueven la r)
export function calibrarInfluencia(x, y, { B = 199, semilla = 20261112, minimo = 0.1, casoACaso = null } = {}) {
    const n = x.length;
    if (n < 20 || n > 5000) return { grupo: { aplica: false, motivo: n < 20 ? 'pocos-casos' : 'muchos-casos' }, caso: { p: null } };
    // los casos fuera de la elipse de la mayoría, de más a menos alejados (los atípicos primero; la cola corriente, después)
    const m = mcd2d(x, y), fuera = []; for (let i = 0; i < n; i++) if (!m.dentro[i]) fuera.push(i);
    fuera.sort((a, b) => m.d2[b] - m.d2[a]);
    const rTodos = pearson(x, y), rMayoria = fuera.length ? rDentro(x, y, m.dentro) : rTodos, delta = Math.abs(rTodos - rMayoria);
    const dCaso = casoACaso ? casoACaso(x, y) : NaN;
    const grupo = { aplica: true, delta, rTodos, rMayoria, rRobusta: m.r, fuera, p: null }, caso = { delta: dCaso, p: null };
    const pideGrupo = delta >= minimo, pideCaso = dCaso >= minimo;
    if (!pideGrupo && !pideCaso) return { grupo, caso };
    // correlación de la mayoría en puntuaciones normales (rangos de TODOS los casos): la de la cópula de la nula
    const rx = rangos(x), ry = rangos(y), ns = r => inversaNormal((r - 1 / 3) / (n + 1 / 3)), a = [], b = [];
    for (let i = 0; i < n; i++) if (m.dentro[i]) { a.push(ns(rx[i])); b.push(ns(ry[i])); }
    const rho0 = Math.max(-0.99, Math.min(0.99, pearson(Float64Array.from(a), Float64Array.from(b)))), c = Math.sqrt(1 - rho0 * rho0);
    // marginales de la nula: las observadas, con los casos groseramente alejados (ver casosGroseros) ACOTADOS al rango de los
    // demás. Con todos tal cual, el valor extremo del propio atípico seguía en la nula con su palanca y se «comía» la señal (un
    // atípico grosero dejaba de detectarse); excluyéndolos, la nula perdía también las colas legítimas de una marginal
    // asimétrica; acotándolos, conserva cuántos casos hay en la cola
    const q999 = Q2(0.999), gx = casosGroseros(x, y, m, q999), gy = gx;
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (let i = 0; i < n; i++) { if (!gx[i]) { xMin = Math.min(xMin, x[i]); xMax = Math.max(xMax, x[i]); } if (!gy[i]) { yMin = Math.min(yMin, y[i]); yMax = Math.max(yMax, y[i]); } }
    const acotar = (v, lo, hi) => (Number.isFinite(lo) ? Math.min(hi, Math.max(lo, v)) : v);
    const xs = Float64Array.from(x, (v, i) => (gx[i] ? acotar(v, xMin, xMax) : v)).sort(), ys = Float64Array.from(y, (v, i) => (gy[i] ? acotar(v, yMin, yMax) : v)).sort(), nb = n, azar = aleatorio(semilla);
    const normal = generadorNormales(azar);   // (2026.12.25) Box-Muller por pares, del núcleo único
    const xb = new Float64Array(n), yb = new Float64Array(n); let exGrupo = 0, exCaso = 0;
    for (let rep = 0; rep < B; rep++) {
        for (let i = 0; i < n; i++) { const z1 = normal(), z2 = rho0 * z1 + c * normal(); xb[i] = xs[Math.min(nb - 1, Math.floor(phi(z1) * nb))]; yb[i] = ys[Math.min(nb - 1, Math.floor(phi(z2) * nb))]; }
        if (pideGrupo) { const mb = mcd2d(xb, yb); if (Math.abs(pearson(xb, yb) - rDentro(xb, yb, mb.dentro)) >= delta) exGrupo++; }
        if (pideCaso && casoACaso(xb, yb) >= dCaso) exCaso++;
    }
    if (pideGrupo) grupo.p = (exGrupo + 1) / (B + 1);
    if (pideCaso) caso.p = (exCaso + 1) / (B + 1);
    return { grupo, caso };
}
