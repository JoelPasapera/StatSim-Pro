// analizador/psicometria/numerico.js — utilidades numéricas de los módulos psicométricos, escritas desde cero.
// Cada función está verificada contra SciPy en tests/oracle (sin dependencias en el sitio).

// Cuantil de la normal estándar: Φ⁻¹(p). Algoritmo AS241 (PPND16) de Wichura (1988),
// error relativo < 1e-16 en todo el rango; es el mismo que usa R en qnorm().
export function cuantilNormal(p) {
    if (!(p >= 0 && p <= 1)) return NaN;
    if (p === 0) return -Infinity;
    if (p === 1) return Infinity;
    const q = p - 0.5;
    let r, val;
    if (Math.abs(q) <= 0.425) {
        r = 0.180625 - q * q;
        return q * (((((((r * 2509.0809287301226727 + 33430.575583588128105) * r + 67265.770927008700853) * r
            + 45921.953931549871457) * r + 13731.693765509461125) * r + 1971.5909503065514427) * r
            + 133.14166789178437745) * r + 3.387132872796366608)
            / (((((((r * 5226.495278852545925 + 28729.085735721942674) * r + 39307.89580009271061) * r
            + 21213.794301586595867) * r + 5394.1960214247511077) * r + 687.1870074920579083) * r
            + 42.313330701600911252) * r + 1.0);
    }
    r = Math.sqrt(-Math.log(q < 0 ? p : 1 - p));
    if (r <= 5) {
        r -= 1.6;
        val = (((((((r * 7.7454501427834140764e-4 + 0.0227238449892691845833) * r + 0.24178072517745061177) * r
            + 1.27045825245236838258) * r + 3.64784832476320460504) * r + 5.7694972214606914055) * r
            + 4.6303378461565452959) * r + 1.42343711074968357734)
            / (((((((r * 1.05075007164441684324e-9 + 5.475938084995344946e-4) * r + 0.0151986665636164571966) * r
            + 0.14810397642748007459) * r + 0.68976733498510000455) * r + 1.6763848301838038494) * r
            + 2.05319162663775882187) * r + 1.0);
    } else {
        r -= 5;
        val = (((((((r * 2.01033439929228813265e-7 + 2.71155556874348757815e-5) * r + 0.0012426609473880784386) * r
            + 0.026532189526576123093) * r + 0.29656057182850489123) * r + 1.7848265399172913358) * r
            + 5.4637849111641143699) * r + 6.6579046435011037772)
            / (((((((r * 2.04426310338993978564e-15 + 1.4215117583164458887e-7) * r + 1.8463183175100546818e-5) * r
            + 7.868691311456132591e-4) * r + 0.0148753612908506148525) * r + 0.13692988092273580531) * r
            + 0.59983220655588793769) * r + 1.0);
    }
    return q < 0 ? -val : val;
}

// z bilateral para un nivel de confianza (0.95 → 1.959963984540054)
export function zBilateral(confianza) {
    return cuantilNormal(1 - (1 - confianza) / 2);
}

// Φ(x): función de distribución de la normal estándar con precisión de doble en todo el rango (algoritmo de
// W. J. Cody, 1969, el que usa R en pnorm). Devuelve [Φ(x), 1 − Φ(x)] sin cancelación en las colas.
const A_N = [2.2352520354606839287, 161.02823106855587881, 1067.6894854603709582, 18154.981253343561249, 0.065682337918207449113];
const B_N = [47.20258190468824187, 976.09855173777669322, 10260.932208618978205, 45507.789335026729956];
const C_N = [0.39894151208813466764, 8.8831497943883759412, 93.506656132177855979, 597.27027639480026226, 2494.5375852903726711, 6848.1904505362823326, 11602.651437647350124, 9842.7148383839780218, 1.0765576773720192317e-8];
const D_N = [22.266688044328115691, 235.38790178262499861, 1519.377599407554805, 6485.558298266760755, 18615.571640885098091, 34900.952721145977266, 38912.003286093271411, 19685.429676859990727];
const P_N = [0.21589853405795699, 0.1274011611602473639, 0.022235277870649807, 0.001421619193227893466, 2.9112874951168792e-5, 0.02307344176494017303];
const Q_N = [1.28426009614491121, 0.468238212480865118, 0.0659881378689285515, 0.00378239633202758244, 7.29751555083966205e-5];
const INV_SQRT_2PI = 0.398942280401432677939946059934;
function colasNormal(x) {
    if (Number.isNaN(x)) return [NaN, NaN];
    if (x === Infinity) return [1, 0];
    if (x === -Infinity) return [0, 1];
    const y = Math.abs(x);
    let cum, ccum;
    const conExponencial = (z, temp) => {   // exp(−z²/2) partido en dos para no perder dígitos
        const zr = Math.trunc(z * 16) / 16, del = (z - zr) * (z + zr);
        cum = Math.exp(-zr * zr * 0.5) * Math.exp(-del * 0.5) * temp; ccum = 1 - cum;
        if (x > 0) { const t = cum; cum = ccum; ccum = t; }
    };
    if (y <= 0.67448975) {
        let xnum = 0, xden = 0;
        if (y > 1.1102230246251565e-16) {
            const xsq = x * x; xnum = A_N[4] * xsq; xden = xsq;
            for (let i = 0; i < 3; i++) { xnum = (xnum + A_N[i]) * xsq; xden = (xden + B_N[i]) * xsq; }
        }
        const temp = x * (xnum + A_N[3]) / (xden + B_N[3]);
        cum = 0.5 + temp; ccum = 0.5 - temp;
    } else if (y <= 5.656854249492380195206754896838) {
        let xnum = C_N[8] * y, xden = y;
        for (let i = 0; i < 7; i++) { xnum = (xnum + C_N[i]) * y; xden = (xden + D_N[i]) * y; }
        conExponencial(y, (xnum + C_N[7]) / (xden + D_N[7]));
    } else if (y < 37.5193) {
        const xsq = 1 / (x * x);
        let xnum = P_N[5] * xsq, xden = xsq;
        for (let i = 0; i < 4; i++) { xnum = (xnum + P_N[i]) * xsq; xden = (xden + Q_N[i]) * xsq; }
        let temp = xsq * (xnum + P_N[4]) / (xden + Q_N[4]);
        temp = (INV_SQRT_2PI - temp) / y;
        conExponencial(x, temp);
    } else if (x > 0) { cum = 1; ccum = 0; } else { cum = 0; ccum = 1; }
    return [cum, ccum];
}
export const cdfNormal = x => colasNormal(x)[0];
export const densidadNormal = x => INV_SQRT_2PI * Math.exp(-0.5 * x * x);

// Φ₂(h, k; ρ) = P(X ≤ h, Y ≤ k) de la normal bivariante estándar. Método de Drezner y Wesolowsky (1990) con las
// modificaciones de doble precisión de Genz (2004): cuadratura de Gauss–Legendre de 6, 12 o 20 nodos según |ρ| y
// tratamiento especial de |ρ| próximo a 1. Error absoluto del orden de 1e-15.
const GL = [
    { w: [0.1713244923791705, 0.3607615730481384, 0.4679139345726904], x: [0.9324695142031522, 0.6612093864662647, 0.2386191860831970] },
    { w: [0.04717533638651177, 0.1069393259953183, 0.1600783285433464, 0.2031674267230659, 0.2334925365383547, 0.2491470458134029],
      x: [0.9815606342467191, 0.9041172563704750, 0.7699026741943050, 0.5873179542866171, 0.3678314989981802, 0.1252334085114692] },
    { w: [0.01761400713915212, 0.04060142980038694, 0.06267204833410906, 0.08327674157670475, 0.1019301198172404, 0.1181945319615184, 0.1316886384491766, 0.1420961093183821, 0.1491729864726037, 0.1527533871307259],
      x: [0.9931285991850949, 0.9639719272779138, 0.9122344282513259, 0.8391169718222188, 0.7463319064601508, 0.6360536807265150, 0.5108670019508271, 0.3737060887154196, 0.2277858511416451, 0.07652652113349733] }
];
// P(X > dh, Y > dk) — bvnu de Genz
function bvnu(dh, dk, r) {
    if (dh === Infinity || dk === Infinity) return 0;
    if (dh === -Infinity) return dk === -Infinity ? 1 : cdfNormal(-dk);
    if (dk === -Infinity) return cdfNormal(-dh);
    if (r === 0) return cdfNormal(-dh) * cdfNormal(-dk);
    const tp = 2 * Math.PI;
    let h = dh, k = dk, hk = h * k, bvn = 0;
    const ar = Math.abs(r);
    const g = ar < 0.3 ? GL[0] : ar < 0.75 ? GL[1] : GL[2];
    const W = g.w.concat(g.w), X = g.x.map(v => 1 - v).concat(g.x.map(v => 1 + v));
    if (ar < 0.925) {
        const hs = (h * h + k * k) / 2, asr = Math.asin(r) / 2;
        for (let i = 0; i < X.length; i++) { const sn = Math.sin(asr * X[i]); bvn += W[i] * Math.exp((sn * hk - hs) / (1 - sn * sn)); }
        bvn = bvn * asr / tp + cdfNormal(-h) * cdfNormal(-k);
    } else {
        if (r < 0) { k = -k; hk = -hk; }
        if (ar < 1) {
            const as = 1 - r * r;
            let a = Math.sqrt(as);
            const bs = (h - k) * (h - k), c = (4 - hk) / 8, d = (12 - hk) / 80;
            let asr = -(bs / as + hk) / 2;
            if (asr > -100) bvn = a * Math.exp(asr) * (1 - c * (bs - as) * (1 - d * bs) / 3 + c * d * as * as);
            if (hk > -100) {
                const b = Math.sqrt(bs), sp = Math.sqrt(tp) * cdfNormal(-b / a);
                bvn -= Math.exp(-hk / 2) * sp * b * (1 - c * bs * (1 - d * bs) / 3);
            }
            a /= 2;
            let suma = 0;
            for (let i = 0; i < X.length; i++) {
                const xs = (a * X[i]) * (a * X[i]);
                const asr2 = -(bs / xs + hk) / 2;
                if (asr2 <= -100) continue;
                const sp = 1 + c * xs * (1 + 5 * d * xs), rs = Math.sqrt(1 - xs);
                const ep = Math.exp(-(hk / 2) * xs / ((1 + rs) * (1 + rs))) / rs;
                suma += W[i] * Math.exp(asr2) * (sp - ep);
            }
            bvn = (a * suma - bvn) / tp;
        }
        if (r > 0) bvn += cdfNormal(-Math.max(h, k));
        else if (h >= k) bvn = -bvn;
        else { const L = h < 0 ? cdfNormal(k) - cdfNormal(h) : cdfNormal(-h) - cdfNormal(-k); bvn = L - bvn; }
    }
    return Math.max(0, Math.min(1, bvn));
}
export function cdfNormalBivariada(h, k, rho) {
    if (h === -Infinity || k === -Infinity) return 0;
    if (h === Infinity) return cdfNormal(k);
    if (k === Infinity) return cdfNormal(h);
    if (rho >= 1) return cdfNormal(Math.min(h, k));
    if (rho <= -1) return Math.max(0, cdfNormal(h) - cdfNormal(-k));
    return bvnu(-h, -k, rho);
}
// φ₂(h, k; ρ): densidad de la normal bivariante estándar (0 si algún argumento es infinito)
export function densidadNormalBivariada(h, k, rho) {
    if (!Number.isFinite(h) || !Number.isFinite(k)) return 0;
    const s = 1 - rho * rho;
    return Math.exp(-(h * h - 2 * rho * h * k + k * k) / (2 * s)) / (2 * Math.PI * Math.sqrt(s));
}

// Máximo de una función unimodal en [a, b]: método de Brent (1973), sección áurea con interpolación parabólica
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

// ln Γ(z) por la aproximación de Lanczos (g = 7, 9 coeficientes): error relativo ~1e-15
const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
export function lnGamma(z) {
    if (z < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * z))) - lnGamma(1 - z);
    z -= 1;
    let x = LANCZOS[0];
    for (let i = 1; i < 9; i++) x += LANCZOS[i] / (z + i);
    const t = z + 7.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

// Q(a, x): gamma incompleta regularizada superior (serie si x < a + 1; si no, fracción continua de Lentz)
export function gammaRegularizadaQ(a, x) {
    if (!(a > 0) || !(x >= 0)) return NaN;
    if (x === 0) return 1;
    const pref = Math.exp(-x + a * Math.log(x) - lnGamma(a));
    if (x < a + 1) {
        let ap = a, suma = 1 / a, del = suma;
        for (let n = 1; n <= 10000; n++) { ap++; del *= x / ap; suma += del; if (Math.abs(del) < Math.abs(suma) * 1e-16) break; }
        return Math.max(0, 1 - suma * pref);
    }
    let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
    for (let i = 1; i <= 10000; i++) {
        const an = -i * (i - a);
        b += 2;
        d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
        c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
        d = 1 / d;
        const del = d * c;
        h *= del;
        if (Math.abs(del - 1) < 1e-16) break;
    }
    return pref * h;
}
// p de cola derecha de una χ² con gl grados de libertad
export const pChiCuadrado = (chi2, gl) => gammaRegularizadaQ(gl / 2, chi2 / 2);

// Beta incompleta regularizada I_x(a, b) (fracción continua de Lentz, como en Numerical Recipes) y distribución F
function fraccionBeta(a, b, x) {
    const MIN = 1e-300, qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - (qab * x) / qap;
    if (Math.abs(d) < MIN) d = MIN;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= 1000; m++) {
        const m2 = 2 * m;
        let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
        d = 1 + aa * d; if (Math.abs(d) < MIN) d = MIN; c = 1 + aa / c; if (Math.abs(c) < MIN) c = MIN; d = 1 / d; h *= d * c;
        aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
        d = 1 + aa * d; if (Math.abs(d) < MIN) d = MIN; c = 1 + aa / c; if (Math.abs(c) < MIN) c = MIN; d = 1 / d;
        const del = d * c; h *= del;
        if (Math.abs(del - 1) < 1e-15) break;
    }
    return h;
}
export function betaRegularizada(x, a, b) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? (bt * fraccionBeta(a, b, x)) / a : 1 - (bt * fraccionBeta(b, a, 1 - x)) / b;
}
export const cdfF = (f, d1, d2) => (f <= 0 ? 0 : betaRegularizada((d1 * f) / (d1 * f + d2), d1 / 2, d2 / 2));
export function cuantilF(p, d1, d2) {
    let hi = 1;
    while (cdfF(hi, d1, d2) < p && hi < 1e12) hi *= 2;
    const r = raizBrent(f => cdfF(f, d1, d2) - p, 0, hi, 1e-13);
    return r ? r.x : NaN;
}

// χ² no central por mezcla de Poisson con pesos en escala logarítmica centrados en la moda (sin desbordamiento para
// ncp grandes, donde e^(−ncp/2) ya es 0 en doble precisión); CDF y búsqueda del ncp para el IC del RMSEA (Browne y
// Cudeck, 1993)
export function cdfChi2NoCentral(x, df, ncp) {
    if (!(x > 0)) return 0;
    if (!(ncp > 0)) return 1 - gammaRegularizadaQ(df / 2, x / 2);
    const lam = ncp / 2, moda = Math.floor(lam), ancho = Math.ceil(12 * Math.sqrt(lam) + 40);
    let suma = 0;
    for (let j = Math.max(0, moda - ancho); j <= moda + ancho; j++) {
        const lw = -lam + j * Math.log(lam) - lnGamma(j + 1);
        if (lw < -745) continue;
        suma += Math.exp(lw) * (1 - gammaRegularizadaQ(df / 2 + j, x / 2));
    }
    return Math.min(1, suma);
}
export function ncpParaProbabilidad(x, df, objetivo) {
    if (cdfChi2NoCentral(x, df, 0) <= objetivo) return 0;
    let lo = 0, hi = Math.max(x * 3, 50);
    while (cdfChi2NoCentral(x, df, hi) > objetivo && hi < 1e8) hi *= 2;
    for (let i = 0; i < 200 && hi - lo > 1e-10 * Math.max(1, hi); i++) { const mid = (lo + hi) / 2; if (cdfChi2NoCentral(x, df, mid) > objetivo) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
}
