// analizador/psicometria/policorica.js — correlaciones policóricas (y tetracóricas, su caso 2 × 2) por máxima
// verosimilitud en dos pasos (Olsson, 1979): umbrales fijados por las proporciones marginales y ρ que maximiza
//   L(ρ) = Σᵢⱼ nᵢⱼ · ln πᵢⱼ(ρ),  πᵢⱼ = Φ₂(aᵢ₊₁, bⱼ₊₁) − Φ₂(aᵢ, bⱼ₊₁) − Φ₂(aᵢ₊₁, bⱼ) + Φ₂(aᵢ, bⱼ)
// con Φ₂ la normal bivariante (numerico.js). Las categorías sin casos no generan umbral.
import { cuantilNormal, cdfNormal, cdfNormalBivariada, densidadNormalBivariada, maximizarBrent, raizBrent } from './numerico.js';

export const RHO_MAXIMO = 0.9999;

export function tablaDeContingencia(x, y) {
    // vía rápida (lo habitual: ítems con pocas categorías enteras): conteo directo por desplazamiento, sin Map
    const rango = v => { let lo = Infinity, hi = -Infinity; for (let i = 0; i < v.length; i++) { const a = v[i]; if (!Number.isInteger(a)) return null; if (a < lo) lo = a; if (a > hi) hi = a; } return hi - lo <= 64 ? [lo, hi] : null; };
    const rx = rango(x), ry = rx && rango(y);
    if (rx && ry) {
        const W = ry[1] - ry[0] + 1, crudo = new Float64Array((rx[1] - rx[0] + 1) * W);
        for (let t = 0; t < x.length; t++) crudo[(x[t] - rx[0]) * W + (y[t] - ry[0])]++;
        const filasUsadas = [], colsUsadas = [];
        for (let i = 0; i <= rx[1] - rx[0]; i++) { let s = 0; for (let j = 0; j < W; j++) s += crudo[i * W + j]; if (s) filasUsadas.push(i); }
        for (let j = 0; j < W; j++) { let s = 0; for (let i = 0; i <= rx[1] - rx[0]; i++) s += crudo[i * W + j]; if (s) colsUsadas.push(j); }
        const n = filasUsadas.map(i => Float64Array.from(colsUsadas, j => crudo[i * W + j]));
        return { categoriasX: filasUsadas.map(i => i + rx[0]), categoriasY: colsUsadas.map(j => j + ry[0]), n, total: x.length };
    }
    const cx = [...new Set(x)].sort((a, b) => a - b), cy = [...new Set(y)].sort((a, b) => a - b);
    const ix = new Map(cx.map((v, i) => [v, i])), iy = new Map(cy.map((v, j) => [v, j]));
    const n = Array.from({ length: cx.length }, () => new Float64Array(cy.length));
    for (let t = 0; t < x.length; t++) n[ix.get(x[t])][iy.get(y[t])]++;
    return { categoriasX: cx, categoriasY: cy, n, total: x.length };
}

// [−∞, τ₁, …, τ_{c−1}, +∞] a partir de las frecuencias marginales
export function umbralesDe(frecuencias) {
    const total = frecuencias.reduce((s, v) => s + v, 0);
    const u = [-Infinity];
    let acumulado = 0;
    for (let i = 0; i < frecuencias.length - 1; i++) { acumulado += frecuencias[i]; u.push(cuantilNormal(acumulado / total)); }
    u.push(Infinity);
    return u;
}

// Log-verosimilitud de ρ para una tabla con umbrales dados: Φ₂ solo en los puntos interiores de la rejilla
export function logVerosimilitud(tabla, a, b, rho) {
    const I = a.length, J = b.length;
    const G = Array.from({ length: I }, (_, i) => new Float64Array(J));
    for (let i = 0; i < I; i++) for (let j = 0; j < J; j++) {
        if (i === 0 || j === 0) G[i][j] = 0;
        else if (i === I - 1) G[i][j] = cdfNormal(b[j]);
        else if (j === J - 1) G[i][j] = cdfNormal(a[i]);
        else G[i][j] = cdfNormalBivariada(a[i], b[j], rho);
    }
    let L = 0;
    for (let i = 0; i < I - 1; i++) for (let j = 0; j < J - 1; j++) {
        const nij = tabla[i][j];
        if (nij === 0) continue;
        const p = G[i + 1][j + 1] - G[i][j + 1] - G[i + 1][j] + G[i][j];
        L += nij * Math.log(Math.max(p, 1e-300));
    }
    return L;
}

// Puntuación dL/dρ = Σ nᵢⱼ/πᵢⱼ · ∂πᵢⱼ/∂ρ, con ∂Φ₂(h, k; ρ)/∂ρ = φ₂(h, k; ρ) (densidad bivariante)
export function puntuacion(tabla, a, b, rho) {
    const I = a.length, J = b.length;
    const G = Array.from({ length: I }, () => new Float64Array(J)), D = Array.from({ length: I }, () => new Float64Array(J));
    for (let i = 1; i < I; i++) for (let j = 1; j < J; j++) {
        if (i === I - 1) G[i][j] = cdfNormal(b[j]); else if (j === J - 1) G[i][j] = cdfNormal(a[i]);
        else { G[i][j] = cdfNormalBivariada(a[i], b[j], rho); D[i][j] = densidadNormalBivariada(a[i], b[j], rho); }
    }
    let s = 0;
    for (let i = 0; i < I - 1; i++) for (let j = 0; j < J - 1; j++) {
        const nij = tabla[i][j];
        if (nij === 0) continue;
        const p = G[i + 1][j + 1] - G[i][j + 1] - G[i + 1][j] + G[i][j];
        const dp = D[i + 1][j + 1] - D[i][j + 1] - D[i + 1][j] + D[i][j];
        s += nij * dp / Math.max(p, 1e-300);
    }
    return s;
}

/**
 * Correlación policórica de dos variables ordinales (pares completos).
 * → { rho, n, categorias: [cx, cy], umbrales: [a, b], logVerosimilitud, enElLimite, tipo, error }
 */
// opciones.corregirCeros (solo WLSMV): en una tabla 2 × 2 con una celda vacía suma 0,5 a esa celda y ajusta las demás
// conservando los márgenes (umbrales intactos), como lavaan por defecto (zero.add = 0.5, zero.keep.margins = TRUE)
export function policorica(x, y, { corregirCeros = false } = {}) {
    if (x.length !== y.length || x.length < 3) return { rho: NaN, error: 'Se necesitan al menos 3 pares completos.' };
    const t = tablaDeContingencia(x, y);
    if (t.categoriasX.length < 2 || t.categoriasY.length < 2) return { rho: NaN, error: 'Una de las variables no varía (una sola categoría).' };
    const a = umbralesDe(t.n.map(f => f.reduce((s, v) => s + v, 0)));
    const b = umbralesDe(t.categoriasY.map((_, j) => t.n.reduce((s, f) => s + f[j], 0)));
    let rho;
    if (t.categoriasX.length === 2 && t.categoriasY.length === 2) {
        // 2 × 2 (tetracórica): con los umbrales fijos, la MV reproduce exactamente la celda (1, 1): Φ₂(a₁, b₁; ρ) = n₁₁/N,
        // una ecuación monótona en ρ con solución única (o en el límite si la proporción es inalcanzable)
        // Con una celda vacía la proporción está en su cota y la MV es ±1: se deja en el límite y se señala (sin
        // evaluar Φ₂ junto a |ρ| = 1, donde la diferencia con la cota cae por debajo de la precisión de doble).
        const [[n11, n12], [n21, n22]] = t.n;
        if (corregirCeros && (n11 === 0 || n12 === 0 || n21 === 0 || n22 === 0)) {
            const p11 = (n12 === 0 || n21 === 0 ? n11 - 0.5 : n11 === 0 ? 0.5 : n11 + 0.5) / t.total;
            const r = raizBrent(q => cdfNormalBivariada(a[1], b[1], q) - p11, -RHO_MAXIMO, RHO_MAXIMO, 1e-15);
            // frecuencia esperada de la celda vacía si los ítems fueran independientes: si es < 0,5, el vacío es esperable
            // por azar, la tabla apenas informa de la relación y la corrección domina la estimación (puede invertir el signo)
            const fil = [n11 + n12, n21 + n22], col = [n11 + n21, n12 + n22], vacia = [[n11, n12], [n21, n22]].flatMap((f, i) => f.map((v, j) => [v, i, j])).find(([v]) => v === 0);
            return { rho: r ? r.x : NaN, corregida: true, esperada: (fil[vacia[1]] * col[vacia[2]]) / t.total };
        }
        if (n12 === 0 || n21 === 0) rho = RHO_MAXIMO;
        else if (n11 === 0 || n22 === 0) rho = -RHO_MAXIMO;
        else { const p11 = n11 / t.total; rho = raizBrent(r => cdfNormalBivariada(a[1], b[1], r) - p11, -RHO_MAXIMO, RHO_MAXIMO, 1e-15).x; }
    } else {
        // general: el máximo de L(ρ) se localiza con Brent (robusto, sin evaluar la puntuación en los bordes, donde
        // las celdas con π ≈ 0 la vuelven inestable) y se afina resolviendo la ecuación de puntuación cerca de él
        const x0 = maximizarBrent(r => logVerosimilitud(t.n, a, b, r), -RHO_MAXIMO, RHO_MAXIMO, 1e-10).x;
        const lo = Math.max(-RHO_MAXIMO, x0 - 1e-3), hi = Math.min(RHO_MAXIMO, x0 + 1e-3);
        const fina = puntuacion(t.n, a, b, lo) > 0 && puntuacion(t.n, a, b, hi) < 0 ? raizBrent(r => puntuacion(t.n, a, b, r), lo, hi, 1e-15) : null;
        rho = fina ? fina.x : x0;
    }
    return {
        rho, n: t.total, categorias: [t.categoriasX, t.categoriasY], umbrales: [a, b], logVerosimilitud: logVerosimilitud(t.n, a, b, rho),
        enElLimite: Math.abs(rho) >= 0.999,   // en la práctica, en el borde (tablas sin casos discordantes)
        tipo: t.categoriasX.length === 2 && t.categoriasY.length === 2 ? 'tetracórica' : 'policórica'
    };
}

// Puntuación, información esperada y log-verosimilitud en un solo recorrido de la rejilla (para Fisher scoring)
function puntuacionEInformacion(tabla, a, b, rho, total) {
    const I = a.length, J = b.length;
    const G = Array.from({ length: I }, () => new Float64Array(J)), D = Array.from({ length: I }, () => new Float64Array(J));
    for (let i = 1; i < I; i++) for (let j = 1; j < J; j++) {
        if (i === I - 1) G[i][j] = cdfNormal(b[j]); else if (j === J - 1) G[i][j] = cdfNormal(a[i]);
        else { G[i][j] = cdfNormalBivariada(a[i], b[j], rho); D[i][j] = densidadNormalBivariada(a[i], b[j], rho); }
    }
    let s = 0, info = 0, L = 0;
    for (let i = 0; i < I - 1; i++) for (let j = 0; j < J - 1; j++) {
        const p = Math.max(G[i + 1][j + 1] - G[i][j + 1] - G[i + 1][j] + G[i][j], 1e-300);
        const dp = D[i + 1][j + 1] - D[i][j + 1] - D[i + 1][j] + D[i][j];
        info += (dp * dp) / p;
        const nij = tabla[i][j];
        if (nij) { s += nij * dp / p; L += nij * Math.log(p); }
    }
    return { s, info: info * total, L };
}

// Policórica rápida para el bootstrap: la misma estimación de máxima verosimilitud (umbrales de la remuestra y ρ que
// anula la puntuación), por Fisher scoring desde un valor inicial cercano (la ρ de la muestra completa). Converge en
// 3–5 pasos; si no lo logra, recurre a la estimación completa.
export function policoricaDesde(x, y, rhoInicial = 0) {
    const t = tablaDeContingencia(x, y);
    if (t.categoriasX.length < 2 || t.categoriasY.length < 2) return { rho: NaN };
    if (t.categoriasX.length === 2 && t.categoriasY.length === 2) {
        // 2 × 2: Newton sobre Φ₂(a₁, b₁; ρ) − n₁₁/N, cuya derivada es φ₂ (analítica); 3–4 pasos desde la ρ inicial
        const [[n11, n12], [n21, n22]] = t.n;
        if (n12 === 0 || n21 === 0) return { rho: RHO_MAXIMO, enElLimite: true };
        if (n11 === 0 || n22 === 0) return { rho: -RHO_MAXIMO, enElLimite: true };
        const a1 = cuantilNormal((n11 + n12) / t.total), b1 = cuantilNormal((n11 + n21) / t.total), p11 = n11 / t.total;
        let r = Math.max(-RHO_MAXIMO, Math.min(RHO_MAXIMO, Number.isFinite(rhoInicial) ? rhoInicial : 0));
        for (let it = 0; it < 30; it++) {
            const d = densidadNormalBivariada(a1, b1, r);
            if (!(d > 0)) break;
            const nuevo = Math.max(-RHO_MAXIMO, Math.min(RHO_MAXIMO, r - (cdfNormalBivariada(a1, b1, r) - p11) / d));
            if (Math.abs(nuevo - r) < 1e-12) return { rho: nuevo, enElLimite: Math.abs(nuevo) >= 0.999 };
            r = nuevo;
        }
        return policorica(x, y);   // sin convergencia (muy raro): solución exacta por Brent
    }
    const a = umbralesDe(t.n.map(f => f.reduce((s, v) => s + v, 0)));
    const b = umbralesDe(t.categoriasY.map((_, j) => t.n.reduce((s, f) => s + f[j], 0)));
    const acotar = r => Math.max(-RHO_MAXIMO, Math.min(RHO_MAXIMO, r));
    let rho = acotar(Number.isFinite(rhoInicial) ? rhoInicial : 0);
    let actual = puntuacionEInformacion(t.n, a, b, rho, t.total);
    for (let it = 0; it < 30; it++) {
        if (!(actual.info > 0)) break;
        let paso = actual.s / actual.info, nuevo = acotar(rho + paso), cand = puntuacionEInformacion(t.n, a, b, nuevo, t.total);
        for (let m = 0; m < 30 && cand.L < actual.L - 1e-12; m++) { paso /= 2; nuevo = acotar(rho + paso); cand = puntuacionEInformacion(t.n, a, b, nuevo, t.total); }
        const dif = Math.abs(nuevo - rho);
        rho = nuevo; actual = cand;
        if (dif < 1e-11) return { rho, enElLimite: Math.abs(rho) >= 0.999 };   // de sobra para un intervalo
    }
    return policorica(x, y);   // no convergió: estimación completa
}
