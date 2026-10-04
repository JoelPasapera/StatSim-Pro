// simulador/dominio/nubes-relacion.js — la NUBE de una relación (Atlas de relaciones, dimensión B; sin DOM).
// La forma de la tendencia (dimensión A) decide E[Y|X]; la nube decide cómo se reparte la dispersión alrededor. En la
// composición exacta z_Y = η·z_f + c·ẽ, la nube vive en el residuo: antes de hacerlo ortogonal a X y a f(X) y de
// reescalarlo, se multiplica por g(X). Así la fuerza η y la r siguen siendo exactas en la muestra.
//  · abanico que se abre / se cierra: g crece / decrece con X (3:1 entre los extremos de la ventana de X);
//  · triángulo (condición necesaria): g crece desde casi 0 y el residuo se acota por abajo (φ = Φ(e) − ½, uniforme),
//    de modo que el borde inferior queda plano y solo sube el superior; sigue el sentido de la relación.
// Multiplicar por g atenúa las correlaciones del residuo con terceras variables por κ = E[g]·E[φ·e]/√(E[g²]·E[φ²]);
// el motor lo compensa al pasar la matriz objetivo al espacio del residuo.
import { curvaTeorica } from './formas-relacion.js';

export const NUBES = [
    { id: 'homogenea', etiqueta: 'Homogénea', g: null },
    { id: 'abanico-abre', etiqueta: 'Abanico que se abre', g: u => 1 + 2 * u },
    { id: 'abanico-cierra', etiqueta: 'Abanico que se cierra', g: u => 3 - 2 * u },
    { id: 'triangulo', etiqueta: 'Triángulo (condición necesaria)', g: u => 0.02 + u, acotada: true },
    // (dimensión B4) no vive en el residuo (g nula): unas pocas filas se reescriben como casos atípicos (atipicos-motor.js)
    { id: 'atipico', etiqueta: 'Atípico influyente', g: null, atipico: true }
];
const porId = new Map(NUBES.map(n => [n.id, n]));
export const nubePorId = id => porId.get(id) || porId.get('homogenea');
export const esNubeCompuesta = id => !!(porId.get(id) && porId.get(id).g);
// g en la posición u ∈ [0, 1] de X en su ventana; el triángulo se abre hacia donde crece la relación
export const gNube = (id, u, sentido = 1) => { const N = nubePorId(id); return N.g ? N.g(N.acotada && sentido < 0 ? 1 - u : u) : 1; };
// momentos de φ: normal (φ = e) o acotada (φ = Φ(e) − ½): E[φ·e] = 1/(2√π), E[φ²] = 1/12
const MOMENTOS_PHI = { normal: { cruzado: 1, cuadrado: 1 }, acotada: { cruzado: 1 / (2 * Math.sqrt(Math.PI)), cuadrado: 1 / 12 } };

// sobre la distribución REAL de X (malla ponderada de la curva teórica): κ de atenuación, norma teórica de g·φ
export function momentosNube(idNube, forma, tx, clave = null, sentido = 1) {
    const N = nubePorId(idNube); if (!N.g) return null;
    const c = curvaTeorica(forma, tx, clave), m = N.acotada ? MOMENTOS_PHI.acotada : MOMENTOS_PHI.normal;
    let eg = 0, eg2 = 0; for (const p of c.puntos) { const g = gNube(idNube, p.u, sentido); eg += p.w * g; eg2 += p.w * g * g; }
    return { kappa: (eg * m.cruzado) / Math.sqrt(eg2 * m.cuadrado), norma: Math.sqrt(eg2 * m.cuadrado) };
}
// razón esperada entre la DE del residuo en el tercio alto y en el tercio bajo de X
export function razonDispersionEsperada(idNube, forma, tx, clave = null, sentido = 1) {
    const N = nubePorId(idNube); if (!N.g) return 1;
    const c = curvaTeorica(forma, tx, clave), t = [[0, 0], [0, 0]];
    let acum = 0;
    for (const p of c.puntos) { const q = acum + p.w / 2; acum += p.w; const g2 = gNube(idNube, p.u, sentido) ** 2; if (q <= 1 / 3) { t[0][0] += p.w * g2; t[0][1] += p.w; } else if (q >= 2 / 3) { t[1][0] += p.w * g2; t[1][1] += p.w; } }
    return Math.sqrt((t[1][0] / t[1][1]) / (t[0][0] / t[0][1]));
}
// fuerza «natural» del triángulo: la que deja plano su borde inferior (η·Δz_f = √(1 − η²)·Δg/(2·norma) entre los
// percentiles 5 y 95 de X); con otra fuerza el borde inferior se inclina y el triángulo se acerca a un abanico
export function etaNaturalTriangulo(forma, tx, clave = null, sentido = 1) {
    const c = curvaTeorica(forma, tx, clave), mom = momentosNube('triangulo', forma, tx, clave, sentido);
    let acum = 0, lo = null, hi = null;
    for (const p of c.puntos) { acum += p.w; if (lo === null && acum >= 0.05) lo = p; if (hi === null && acum >= 0.95) hi = p; }
    const A = Math.abs(hi.zf - lo.zf), Bc = Math.abs(gNube('triangulo', hi.u, sentido) - gNube('triangulo', lo.u, sentido)) / (2 * mom.norma);
    return Bc / Math.sqrt(A * A + Bc * Bc);
}

// razón PREVISTA entre las pendientes de los bordes del triángulo (cuantil .10 / cuantil .90) para una fuerza η: los
// cuantiles del residuo acotado (uniforme) son ∓0,4·c·g(u), con g' = 1 y z_f = (u − ū)/sd_u en la recta, así que
// b10/b90 = (η/sd_u − 0,4c)/(η/sd_u + 0,4c), c = √(1 − η²)/norma. Comprobada con bases generadas (X normal y uniforme,
// η de .45 a .80): la usan la validación (aviso si la nube no se leerá como triángulo) y el informe (pedido vs. obtenido)
export function razonBordesTriangulo(eta, forma, tx, clave = null, sentido = 1) {
    const c = curvaTeorica(forma, tx, clave); let mu = 0, m2 = 0;
    for (const p of c.puntos) { mu += p.w * p.u; m2 += p.w * p.u * p.u; }
    const sdU = Math.sqrt(Math.max(1e-12, m2 - mu * mu)), mom = momentosNube('triangulo', forma, tx, clave, sentido);
    const pend = eta / sdU, q = (0.4 * Math.sqrt(Math.max(0, 1 - eta * eta))) / mom.norma;
    return (pend - q) / (pend + q);
}

// ---- comprobaciones sobre la base generada (para el informe «pedido vs. obtenido»)
const ordenPor = v => Array.from(v, (_, i) => i).sort((a, b) => v[a] - v[b]);
// razón observada: DE de los residuos de Y sobre f(X) en el tercio alto de X frente al tercio bajo
export function razonDispersionObservada(x, y, fx) {
    const n = x.length; let mf = 0, my = 0; for (let i = 0; i < n; i++) { mf += fx[i]; my += y[i]; } mf /= n; my /= n;
    let sff = 0, sfy = 0; for (let i = 0; i < n; i++) { sff += (fx[i] - mf) ** 2; sfy += (fx[i] - mf) * (y[i] - my); }
    const b = sff > 0 ? sfy / sff : 0, e = Float64Array.from(y, (v, i) => v - my - b * (fx[i] - mf)), o = ordenPor(x), k = Math.floor(n / 3);
    const de = idx => { let m = 0; for (const i of idx) m += e[i]; m /= idx.length; let s = 0; for (const i of idx) s += (e[i] - m) ** 2; return Math.sqrt(s / (idx.length - 1)); };
    return de(o.slice(n - k)) / de(o.slice(0, k));
}
// bordes de la nube por tramos: 5 tramos de X; en cada uno, los cuantiles .10 y .90 de Y; pendientes frente a la media de X
export function bordesPorTramos(x, y) {
    const n = x.length, o = ordenPor(x), tramos = 5, cx = [], c10 = [], c90 = [];
    const cuantil = (v, q) => { const s = [...v].sort((a, b) => a - b), h = (s.length - 1) * q, i = Math.floor(h); return s[i] + (h - i) * (s[Math.min(i + 1, s.length - 1)] - s[i]); };
    for (let t = 0; t < tramos; t++) { const idx = o.slice(Math.floor((t * n) / tramos), Math.floor(((t + 1) * n) / tramos)); cx.push(idx.reduce((s, i) => s + x[i], 0) / idx.length); const yy = idx.map(i => y[i]); c10.push(cuantil(yy, 0.1)); c90.push(cuantil(yy, 0.9)); }
    const pend = c => { const mx = cx.reduce((s, v) => s + v, 0) / tramos, mc = c.reduce((s, v) => s + v, 0) / tramos; let a = 0, b = 0; for (let t = 0; t < tramos; t++) { a += (cx[t] - mx) * (c[t] - mc); b += (cx[t] - mx) ** 2; } return b > 0 ? a / b : 0; };
    return { b10: pend(c10), b90: pend(c90) };
}
