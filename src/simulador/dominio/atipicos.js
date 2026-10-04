// simulador/dominio/atipicos.js — el atípico influyente (Atlas de relaciones, dimensión B4; sin DOM).
// Unos pocos casos alejados de la nube cambian la r por sí solos: la CREAN (la mayoría sin relación y unos casos en un
// rincón de la diagonal) o la DESTRUYEN (en la antidiagonal). Con k casos a d DE de la media de la mayoría, en la dirección
// s = +1 (diagonal) o s = −1 (antidiagonal), y w = k/N:
//     r = (r_mayoría + s·w·d²) / (1 + w·d²)        ⇒        d² = (r − r_mayoría) / (w·(s − r))
// La posición no se elige: se resuelve para que la r con los atípicos sea la pedida. Las escalas están acotadas y la
// distancia necesaria puede no caber en el rango (un solo caso que lleve r de .05 a .50 con N = 50 tendría que estar a
// 6,7 DE): la validación lo anuncia y dice cuántos casos harían falta.

// límites de los totales de una escala; sin rango (mínimo o máximo por ítem vacíos) no está acotada: se usan ±8 DE como tope
// práctico (revisión 2026.11.11: antes salían [0, 0] y los atípicos se fijaban en 0, a 5 DE, por accidente)
export function limitesEscala(p) {
    const acotada = p.minimo !== null && p.minimo !== undefined && p.maximo !== null && p.maximo !== undefined && Number.isFinite(p.minimo) && Number.isFinite(p.maximo);
    return acotada ? [p.numItems * p.minimo, p.numItems * p.maximo] : [p.media - 8 * p.desviacion, p.media + 8 * p.desviacion];
}
// distancia (en DE de la mayoría) a la que k casos idénticos llevan la r de rMayoria a rObjetivo, con N casos en total
export function distanciaNecesaria(rMayoria, rObjetivo, k, N) {
    const w = k / N, s = rObjetivo > rMayoria ? 1 : -1;
    return { d: Math.sqrt(Math.max(0, (rObjetivo - rMayoria) / (w * (s - rObjetivo)))), signo: s };
}
// recorrido máximo (en DE) hasta el rincón más lejano en la dirección s, con la media, la DE y los límites de X e Y
export function recorridoMaximo(signo, mx, dx, [xLo, xHi], my, dy, [yLo, yHi]) {
    const hueco = (g, m, de, lo, hi) => (g > 0 ? (hi - m) / de : (m - lo) / de);
    return [[1, signo], [-1, -signo]].map(([gx, gy]) => ({ gx, gy, dMax: Math.min(hueco(gx, mx, dx, xLo, xHi), hueco(gy, my, dy, yLo, yHi)) })).sort((a, b) => b.dMax - a.dMax)[0];
}
// el menor número de casos (hasta el 10 % de N) que cabe en el recorrido; null si ninguno
export function casosNecesarios(rMayoria, rObjetivo, N, dMax) {
    for (let k = 1; k <= Math.max(1, Math.floor(N / 10)); k++) if (distanciaNecesaria(rMayoria, rObjetivo, k, N).d <= dMax) return k;
    return null;
}
// r de Pearson de la mayoría (sus sumas) más unos puntos
function rConPuntos({ n, sx, sy, sxx, syy, sxy }, puntos) {
    let N = n, Sx = sx, Sy = sy, Sxx = sxx, Syy = syy, Sxy = sxy;
    for (const [x, y] of puntos) { N++; Sx += x; Sy += y; Sxx += x * x; Syy += y * y; Sxy += x * y; }
    const mx = Sx / N, my = Sy / N;
    return (Sxy / N - mx * my) / Math.sqrt(Math.max(1e-300, (Sxx / N - mx * mx) * (Syy / N - my * my)));
}
// Posiciones de los k casos: su centro a d DE en la dirección del rincón con más recorrido, y un pequeño desplazamiento
// entre ellos en la perpendicular (el centro no se mueve y no se superponen en el gráfico). d se resuelve por bisección;
// después, los totales enteros se ajustan con una búsqueda local de ±2 puntos alrededor del centro
export function resolverAtipicos({ mayoria, k, rObjetivo, limitesX, limitesY }) {
    const { n, sx, sy, sxx, syy, sxy } = mayoria, mx = sx / n, my = sy / n;
    const dx = Math.sqrt(Math.max(1e-12, sxx / n - mx * mx)), dy = Math.sqrt(Math.max(1e-12, syy / n - my * my));
    const rMayoria = (sxy / n - mx * my) / (dx * dy), s = rObjetivo > rMayoria ? 1 : -1;
    const { gx, gy, dMax } = recorridoMaximo(s, mx, dx, limitesX, my, dy, limitesY);
    const desp = [0, 1, -1, 2, -2, 3, -3].slice(0, k);
    const dentro = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));
    const puntosEn = d => desp.map(o => [dentro(mx + gx * d * dx + o, limitesX), dentro(my + gy * d * dy - s * o, limitesY)]);
    const f = d => rConPuntos(mayoria, puntosEn(d)) - rObjetivo;
    let d = dMax, alcanzable = s * f(dMax) >= 0;
    if (alcanzable) { let lo = 0, hi = dMax; for (let it = 0; it < 60; it++) { const mid = (lo + hi) / 2; if (s * f(mid) < 0) lo = mid; else hi = mid; } d = (lo + hi) / 2; }
    const centro = puntosEn(d).map(([x, y]) => [Math.round(x), Math.round(y)]);
    let mejor = null;
    for (let ax = -2; ax <= 2; ax++) for (let ay = -2; ay <= 2; ay++) {
        const pts = centro.map(([x, y]) => [dentro(x + ax, limitesX), dentro(y + ay, limitesY)]), r = rConPuntos(mayoria, pts);
        if (!mejor || Math.abs(r - rObjetivo) < Math.abs(mejor.r - rObjetivo)) mejor = { puntos: pts, r };
    }
    return { ...mejor, d, dMax, alcanzable, rMayoria, direccion: [gx, gy] };
}
