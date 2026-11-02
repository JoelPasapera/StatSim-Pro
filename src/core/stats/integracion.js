// @ts-check
// core/stats/integracion.js — (2027.01.18) la integración numérica del núcleo: la cuadratura adaptativa de Gauss–Kronrod de
// 15 puntos (la G7–K15 de QUADPACK, Piessens et al., 1983): en cada subintervalo, la regla de Kronrod da el valor y su
// diferencia con la de Gauss de 7 puntos, el error; se parte siempre el subintervalo de mayor error hasta que el total queda
// por debajo de la tolerancia. La usa la potencia exacta de la correlación (core/stats/potencia.js), que integra la densidad
// de r. Sin dependencias.

/** Nodos de Kronrod (los impares, 1, 3 y 5, más el 7 central, son los de Gauss), de QUADPACK. */
const XK = [0.991455371120812639206854697526329, 0.949107912342758524526189684047851, 0.864864423359769072789712788640926, 0.741531185599394439863864773280788,
    0.586087235467691130294144845693013, 0.405845151377397166906606412076961, 0.207784955007898467600689403773245, 0];
const WK = [0.022935322010529224963732008058970, 0.063092092629978553290700663189204, 0.104790010322250183839876322541518, 0.140653259715525918745189590510238,
    0.169004726639267902826583426598550, 0.190350578064785409913256402421014, 0.204432940075298892414161999234649, 0.209482141084727828012999174891714];
/** Pesos de Gauss de los nodos XK[1], XK[3], XK[5] y XK[7]. */
const WG = [0.129484966168869693270611432679082, 0.279705391489276667901467771423780, 0.381830050505118944950369775488975, 0.417959183673469387755102040816327];

/**
 * La regla G7–K15 en [a, b]: el valor de Kronrod y la diferencia con el de Gauss.
 * @param {(x: number) => number} f
 * @param {number} a
 * @param {number} b
 */
function reglaGK15(f, a, b) {
    const c = (a + b) / 2, h = (b - a) / 2, fc = f(c);
    let k = WK[7] * fc, g = WG[3] * fc;
    for (let j = 0; j < 7; j++) {
        const x = h * /** @type {number} */ (XK[j]), s = f(c - x) + f(c + x);
        k += /** @type {number} */ (WK[j]) * s;
        if (j % 2 === 1) g += /** @type {number} */ (WG[(j - 1) / 2]) * s;
    }
    return { valor: k * h, error: Math.abs((k - g) * h) };
}

/**
 * ∫ₐᵇ f(x) dx por cuadratura adaptativa de Gauss–Kronrod.
 * @param {(x: number) => number} f integrando finito en [a, b] (los extremos no se evalúan)
 * @param {number} a
 * @param {number} b
 * @param {{ tolerancia?: number, toleranciaRelativa?: number, maxSubintervalos?: number }} [opciones]
 * @returns {{ valor: number, error: number, subintervalos: number }}
 */
export function integrar(f, a, b, { tolerancia = 1e-13, toleranciaRelativa = 1e-11, maxSubintervalos = 500 } = {}) {
    if (a === b) return { valor: 0, error: 0, subintervalos: 0 };
    if (a > b) { const r = integrar(f, b, a, { tolerancia, toleranciaRelativa, maxSubintervalos }); return { ...r, valor: -r.valor }; }
    /** @type {{ a: number, b: number, valor: number, error: number }[]} */ const tramos = [{ a, b, ...reglaGK15(f, a, b) }];
    let valor = /** @type {{ valor: number }} */ (tramos[0]).valor, error = /** @type {{ error: number }} */ (tramos[0]).error;
    while (error > Math.max(tolerancia, toleranciaRelativa * Math.abs(valor)) && tramos.length < maxSubintervalos) {
        let peor = 0;
        for (let i = 1; i < tramos.length; i++) if (/** @type {{ error: number }} */ (tramos[i]).error > /** @type {{ error: number }} */ (tramos[peor]).error) peor = i;
        const t = /** @type {{ a: number, b: number, valor: number, error: number }} */ (tramos[peor]), m = (t.a + t.b) / 2;
        const izq = { a: t.a, b: m, ...reglaGK15(f, t.a, m) }, der = { a: m, b: t.b, ...reglaGK15(f, m, t.b) };
        valor += izq.valor + der.valor - t.valor; error += izq.error + der.error - t.error;
        tramos.splice(peor, 1, izq, der);
    }
    // la suma de los tramos, de nuevo, sin el arrastre de las restas
    valor = 0; error = 0;
    for (const t of tramos) { valor += t.valor; error += t.error; }
    return { valor, error, subintervalos: tramos.length };
}
