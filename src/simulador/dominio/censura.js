// simulador/dominio/censura.js — techo y suelo de una escala (Atlas de relaciones, dimensión B2; sin DOM).
// Un techo es el recorte del instrumento: una latente normal que sobrepasa el máximo de la escala se corta ahí. La latente
// se infla (media μ*, DE σ*) para que, TRAS el recorte, la media y la DE observadas sean las pedidas:
//   Y = mín(L, máx), L = μ* + σ*·Z  ⇒  Y = μ* + σ*·mín(Z, c),  c = (máx − μ*)/σ*
//   E[Y] = M y DE[Y] = DE  ⇒  (máx − M)/DE = H(c) = E[(c − Z)₊] / DE[(c − Z)₊], creciente de 0 a ∞
// La proporción en el límite no es un parámetro libre: la fijan la media, la DE y el límite (1 − Φ(c)). El suelo es el
// espejo. Las correlaciones con una variable censurada se hacen exactas con la serie de Hermite (fórmula de Mehler):
//   Cov(g(Z₁), h(Z₂)) = Σ_k E[g⁽ᵏ⁾]·E[h⁽ᵏ⁾]·ρᵏ/k!,  con E[g'] = Φ(c) y E[g⁽ᵏ⁾] = −φ(c)·Heₖ₋₂(c) (k ≥ 2) para g = mín(z, c)
const RAIZ_2PI = Math.sqrt(2 * Math.PI);
const phi = z => Math.exp(-0.5 * z * z) / RAIZ_2PI;
// erfc con error RELATIVO < 1,2·10⁻⁷ también en las colas (Press et al., «erfcc»): la aproximación de Abramowitz y
// Stegun tiene error absoluto y falla justo en las colas que aquí importan
function erfc(x) {
    const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
    const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
    return x >= 0 ? r : 2 - r;
}
export const Phi = z => 0.5 * erfc(-z / Math.SQRT2);
const C_MIN = -3.5, C_MAX = 6;   // proporciones en el límite entre ≈ 10⁻⁹ y 99,98 %

// momentos de mín(Z, c) a través de (c − Z)₊ (sin cancelaciones en las colas)
function momentos(c) {
    const P = Phi(c), f = phi(c), e1 = c * P + f, e2 = (c * c + 1) * P + c * f;
    return { mu: c - e1, sigma: Math.sqrt(Math.max(1e-300, e2 - e1 * e1)), h: e1 / Math.sqrt(Math.max(1e-300, e2 - e1 * e1)) };
}
export const distanciaTecho = c => momentos(c).h;   // H(c)
function cDesdeDistancia(d) {
    let lo = C_MIN, hi = C_MAX;
    if (distanciaTecho(hi) <= d) return C_MAX;
    if (distanciaTecho(lo) >= d) return C_MIN;
    for (let k = 0; k < 100; k++) { const mid = (lo + hi) / 2; if (distanciaTecho(mid) < d) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
}

// parámetros de una escala con techo o suelo (totales en [minTotal, maxTotal]); null si no es posible
export function parametrosCensura(lado, M, DE, minTotal, maxTotal) {
    if (!(DE > 0) || !(maxTotal > minTotal) || !(M > minTotal && M < maxTotal)) return null;
    const suelo = lado === 'suelo', d = suelo ? (M - minTotal) / DE : (maxTotal - M) / DE, c = cDesdeDistancia(d), m = momentos(c);
    const deLatente = DE / m.sigma, muLatente = suelo ? M + deLatente * m.mu : M - deLatente * m.mu, limite = suelo ? minTotal : maxTotal;
    return {
        lado: suelo ? 'suelo' : 'techo', c, d, mu: m.mu, sigma: m.sigma, muLatente, deLatente, limite, p: 1 - Phi(c),
        // tras redondear el total a entero, también quedan en el límite los que caen a menos de medio punto de él
        pRedondeo: suelo ? Phi((minTotal + 0.5 - muLatente) / deLatente) : 1 - Phi((maxTotal - 0.5 - muLatente) / deLatente),
        // la latente inflada también puede chocar con el OTRO límite de la escala
        pOtro: suelo ? 1 - Phi((maxTotal - muLatente) / deLatente) : Phi((minTotal - muLatente) / deLatente)
    };
}
// DE que da una proporción p en el límite con esa media (para sugerirla en la validación)
export function deParaProporcion(p, lado, M, minTotal, maxTotal) {
    const c = -inversaPhi(p), d = distanciaTecho(c);
    return (lado === 'suelo' ? M - minTotal : maxTotal - M) / d;
}
function inversaPhi(p) { let lo = -9, hi = 9; for (let k = 0; k < 100; k++) { const mid = (lo + hi) / 2; if (Phi(mid) < p) lo = mid; else hi = mid; } return (lo + hi) / 2; }
// forma estandarizada (media 0, DE 1) del total censurado: la escala la aplica siempre al final (formaTotal); sin
// propiedad «sigma», que reservaría la rama de la beta-binomial
export function formaCensurada(par) {
    const { c, mu, sigma } = par;
    const f = par.lado === 'suelo' ? (z => (Math.max(z, -c) + mu) / sigma) : (z => (Math.min(z, c) - mu) / sigma);
    f.censura = par;
    return f;
}

// ---- correlaciones exactas con una variable censurada: serie de Hermite
const K_HERMITE = 90;
const cacheHermite = new Map();
// a_k = E[g⁽ᵏ⁾(Z)]/√k! de cada forma marginal del generador, y la varianza de g(Z)
function hermiteForma(fm) {
    const clave = `${fm.forma}|${fm.sigma || 0}|${fm.c || 0}|${fm.lado || ''}`;
    if (cacheHermite.has(clave)) return cacheHermite.get(clave);
    const a = new Float64Array(K_HERMITE + 1); let varianza = 1;
    if (fm.forma === 'lognormal') {
        const s = fm.sigma; let t = Math.exp((s * s) / 2);
        for (let k = 1; k <= K_HERMITE; k++) { t *= s / Math.sqrt(k); a[k] = t; }
        varianza = Math.expm1(s * s) * Math.exp(s * s);
    } else if (fm.forma === 'censurada') {
        // techo: g = mín(z, c); suelo: g = máx(z, −c) (mismo c del espejo): a₁ = Φ(c), a_k = ∓φ(c)·h_{k−2}(±c)/√(k(k−1))
        const suelo = fm.lado === 'suelo', cc = suelo ? -fm.c : fm.c, f = phi(cc), signo = suelo ? 1 : -1;
        a[1] = suelo ? 1 - Phi(cc) : Phi(cc);
        let h0 = 1, h1 = cc;   // h_m = He_m(c)/√m!
        for (let k = 2; k <= K_HERMITE; k++) {
            const hm = k === 2 ? h0 : k === 3 ? h1 : null;
            if (k >= 4) { const h2 = (cc * h1 - Math.sqrt(k - 3) * h0) / Math.sqrt(k - 2); h0 = h1; h1 = h2; }
            a[k] = (signo * f * (hm !== null ? hm : h1)) / Math.sqrt(k * (k - 1));
        }
        varianza = momentos(fm.c).sigma ** 2;
    } else if (fm.forma === 'uniforme') {
        // g = Φ(z): cuadratura (integrando suave) de E[g(Z)·He_k(Z)/√k!]
        const paso = 0.004;
        for (let z = -9; z <= 9 + 1e-9; z += paso) {
            const w = phi(z) * paso * Phi(z); let h0 = 1, h1 = z;
            a[1] += w * h1;
            for (let k = 2; k <= K_HERMITE; k++) { const h2 = (z * h1 - Math.sqrt(k - 1) * h0) / Math.sqrt(k); h0 = h1; h1 = h2; a[k] += w * h1; }
        }
        varianza = 1 / 12;
    } else a[1] = 1;   // normal
    const salida = { a, varianza };
    cacheHermite.set(clave, salida);
    return salida;
}
// Pearson entre g(Z₁) y h(Z₂) cuando corr(Z₁, Z₂) = ρ
export function rHermite(fa, fb, rho) {
    const A = hermiteForma(fa), B = hermiteForma(fb); let s = 0, rk = 1;
    for (let k = 1; k <= K_HERMITE; k++) { rk *= rho; s += A.a[k] * B.a[k] * rk; }
    return s / Math.sqrt(A.varianza * B.varianza);
}
// ρ del espacio normal que produce la Pearson r (±Infinity si no es alcanzable con esas formas)
export function rhoHermite(fa, fb, r, tope = 0.99) {
    if (r > rHermite(fa, fb, tope)) return Infinity;
    if (r < rHermite(fa, fb, -tope)) return -Infinity;
    let lo = -tope, hi = tope;
    for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (rHermite(fa, fb, mid) < r) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
}
