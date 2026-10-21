// @ts-check
// core/stats/optimizacion.js — búsqueda unidimensional: el máximo de una función y la raíz en un intervalo (Brent), la
// raíz de una función creciente por bisección y el mínimo de una función unimodal por sección áurea. Sin dependencias.
// Parte del núcleo numérico único (core/stats/numerico.js). (2026.12.25, cierre de la fase F6) La bisección y la sección
// áurea estaban copiadas: nueve bisecciones en el Simulador (la censura, la serie de Hermite, el conteo de un desenlace,
// el atípico influyente, la d de las dimensiones de un General, la α teórica y las cargas con la fiabilidad pedida, esta
// también en el panel de la tarjeta VII), más una que invertía Φ (ahora, el cuantil normal del núcleo), y dos secciones
// áureas (la nube y el refinamiento del diagnóstico de forma, que evaluaba tres puntos por paso en vez de uno). Quedan
// fuera las búsquedas que no son una bisección pura: las calibraciones por simulación de las cargas y de la fiabilidad
// (con efectos sobre el estado y corte si una réplica falla) y la η máxima sin recorte (devuelve el extremo factible).

// Máximo de una función unimodal en [a, b]: método de Brent (1973), sección áurea con interpolación parabólica
/**
 * @param {(x: number) => number} f
 * @param {number} a
 * @param {number} b
 * @param {number} [tol]
 * @param {number} [maxIter]
 * @returns {{ x: number, valor: number, iteraciones: number }}
 */
export function maximizarBrent(f, a, b, tol = 1e-10, maxIter = 200) {
    const C = 0.3819660112501051;
    let x = a + C * (b - a), w = x, v = x, fx = -f(x), fw = fx, fv = fx, d = 0, e = 0, iter = 0;
    for (; iter < maxIter; iter++) {
        const m = 0.5 * (a + b), tol1 = tol * Math.abs(x) + 1e-12, tol2 = 2 * tol1;
        if (Math.abs(x - m) <= tol2 - 0.5 * (b - a)) break;
        let parabola = false;
        if (Math.abs(e) > tol1) {
            let r = (x - w) * (fx - fv), q = (x - v) * (fx - fw), p = (x - v) * q - (x - w) * r;
            q = 2 * (q - r); if (q > 0) p = -p; else q = -q;
            if (Math.abs(p) < Math.abs(0.5 * q * e) && p > q * (a - x) && p < q * (b - x)) {
                e = d; d = p / q; parabola = true;
                const u = x + d; if (u - a < tol2 || b - u < tol2) d = x < m ? tol1 : -tol1;
            }
        }
        if (!parabola) { e = (x < m ? b : a) - x; d = C * e; }
        const u = Math.abs(d) >= tol1 ? x + d : x + (d > 0 ? tol1 : -tol1);
        const fu = -f(u);
        if (fu <= fx) { if (u < x) b = x; else a = x; v = w; fv = fw; w = x; fw = fx; x = u; fx = fu; }
        else { if (u < x) a = u; else b = u;
            if (fu <= fw || w === x) { v = w; fv = fw; w = u; fw = fu; } else if (fu <= fv || v === x || v === w) { v = u; fv = fu; } }
    }
    return { x, valor: -fx, iteraciones: iter };
}

// Raíz de f en [a, b] con cambio de signo: método de Brent–Dekker (zeroin). Precisión completa: se usa para
// resolver ecuaciones de puntuación (derivada = 0) en lugar de maximizar, que solo localiza el máximo a ~1e-8.
/**
 * @param {(x: number) => number} f
 * @param {number} a
 * @param {number} b
 * @param {number} [tol]
 * @param {number} [maxIter]
 * @returns {{ x: number, iteraciones: number } | null} null si f(a) y f(b) tienen el mismo signo
 */
export function raizBrent(f, a, b, tol = 1e-14, maxIter = 200) {
    let fa = f(a), fb = f(b);
    if (fa === 0) return { x: a, iteraciones: 0 };
    if (fb === 0) return { x: b, iteraciones: 0 };
    if (fa * fb > 0) return null;
    let c = a, fc = fa, d = b - a, e = d;
    for (let iter = 1; iter <= maxIter; iter++) {
        if (fb * fc > 0) { c = a; fc = fa; d = b - a; e = d; }
        if (Math.abs(fc) < Math.abs(fb)) { a = b; b = c; c = a; fa = fb; fb = fc; fc = fa; }
        const tol1 = 2 * 2.220446049250313e-16 * Math.abs(b) + 0.5 * tol, xm = 0.5 * (c - b);
        if (Math.abs(xm) <= tol1 || fb === 0) return { x: b, iteraciones: iter };
        if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
            const s = fb / fa;
            let p, q;
            if (a === c) { p = 2 * xm * s; q = 1 - s; }
            else { q = fa / fc; const r = fb / fc; p = s * (2 * xm * q * (q - r) - (b - a) * (r - 1)); q = (q - 1) * (r - 1) * (s - 1); }
            if (p > 0) q = -q; else p = -p;
            if (2 * p < Math.min(3 * xm * q - Math.abs(tol1 * q), Math.abs(e * q))) { e = d; d = p / q; } else { d = xm; e = d; }
        } else { d = xm; e = d; }
        a = b; fa = fb;
        b += Math.abs(d) > tol1 ? d : (xm > 0 ? tol1 : -tol1);
        fb = f(b);
    }
    return { x: b, iteraciones: maxIter };
}

/**
 * Bisección de una función creciente en [lo, hi]: en cada paso, si f(medio) < objetivo, la raíz está a la derecha. Tras
 * `iteraciones` mitades (el número de pasos fija la precisión: (hi − lo)/2ⁿ), el punto medio del intervalo final.
 * @param {(x: number) => number} f  creciente en [lo, hi]
 * @param {number} objetivo
 * @param {number} lo
 * @param {number} hi
 * @param {number} iteraciones
 * @returns {number}
 */
export function biseccion(f, objetivo, lo, hi, iteraciones) {
    for (let k = 0; k < iteraciones; k++) {
        const medio = (lo + hi) / 2;
        if (f(medio) < objetivo) lo = medio; else hi = medio;
    }
    return (lo + hi) / 2;
}

/**
 * Mínimo de una función unimodal en [lo, hi] por sección áurea: `iteraciones` reducciones del intervalo por 0,618 (cada
 * una evalúa un punto nuevo y reutiliza el otro); devuelve el punto medio del intervalo final.
 * @param {(x: number) => number} f
 * @param {number} lo
 * @param {number} hi
 * @param {number} iteraciones
 * @returns {number}
 */
export function minimizarSeccionAurea(f, lo, hi, iteraciones) {
    const g = (Math.sqrt(5) - 1) / 2;
    let c = hi - g * (hi - lo), d = lo + g * (hi - lo), fc = f(c), fd = f(d);
    for (let it = 0; it < iteraciones; it++) {
        if (fc <= fd) { hi = d; d = c; fd = fc; c = hi - g * (hi - lo); fc = f(c); } else { lo = c; c = d; fc = fd; d = lo + g * (hi - lo); fd = f(d); }
    }
    return (lo + hi) / 2;
}
