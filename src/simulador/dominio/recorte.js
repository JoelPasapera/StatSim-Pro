// @ts-check
// simulador/dominio/recorte.js — compensación del recorte al rango de una escala (sin DOM ni estado).
// El total de una escala Likert se recorta al rango alcanzable [k·mín, k·máx] y se redondea. Con la forma asimétrica eso no
// «solo afecta a la cola extrema»: su forma tipificada vale 12,5 DE en z = 4, y aunque solo un 1–3 % de los casos quede fuera del
// rango, esos casos llevan mucha varianza (2026.12.04: con la media en el centro del rango la DE obtenida quedaba un 6 % por debajo
// de la pedida; con la media a 2,4 DE del máximo, un 14 %). Se compensa como el techo: la forma del total pasa a ser a + b·T(z), con
// a y b tales que, TRAS el recorte y el redondeo, la media y la DE son las pedidas.

/**
 * Busca a y b (punto fijo: b ← b·DE/s, a ← a + (M − m)/DE) con las esperanzas por integración en una malla fina de la normal.
 * @param {{ media: number, de: number, minimo: number, maximo: number, forma: (z: number) => number }} e  forma: la tipificada (media 0, DE 1)
 * @returns {{ a: number, b: number, iteraciones: number } | null}  null si no hace falta compensar o no converge (la DE no cabe en el rango)
 */
export function compensarRecorte({ media, de, minimo, maximo, forma }) {
    if (!(de > 0) || !(maximo > minimo)) return null;
    /** @type {number[]} */
    const t = [];
    /** @type {number[]} */
    const w = [];
    let sw = 0;
    for (let x = -8; x <= 8; x += 0.002) { t.push(forma(x)); const p = Math.exp(-0.5 * x * x); w.push(p); sw += p; }
    for (let i = 0; i < w.length; i++) w[i] /= sw;
    /** @param {number} a @param {number} b */
    const momentos = (a, b) => {
        let s1 = 0, s2 = 0;
        for (let i = 0; i < t.length; i++) { const v = Math.round(Math.max(minimo, Math.min(maximo, media + de * (a + b * t[i])))); s1 += w[i] * v; s2 += w[i] * v * v; }
        return { m: s1, s: Math.sqrt(Math.max(0, s2 - s1 * s1)) };
    };
    let a = 0, b = 1;
    for (let it = 1; it <= 60; it++) {
        const { m, s } = momentos(a, b);
        if (Math.abs(m - media) < 1e-3 * de && Math.abs(s - de) < 1e-3 * de) return it === 1 ? null : { a, b, iteraciones: it };
        if (!(s > 0)) return null;
        b *= de / s; a += (media - m) / de;
        if (!(b < 3) || !isFinite(a)) return null;
    }
    return null;
}
