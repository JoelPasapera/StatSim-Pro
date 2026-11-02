// @ts-check
// core/stats/logit-ordinal.js — (2027.01.19) la regresión logística ordinal de odds proporcionales (McCullagh, 1980):
// logit P(Y ≤ k − 1) = α_k − xβ, k = 1 … K − 1 (la parametrización de polr de MASS y de PLUM de SPSS), con K = 2 la logística
// binaria. Por puntuación de Fisher (la información esperada, siempre definida positiva) con medio paso si la verosimilitud
// baja o los umbrales se desordenan; los errores típicos, de esa información en el máximo. Y el R² de Nagelkerke (1991) frente
// al modelo de solo umbrales. La usa el DIF por regresión logística (core/stats/dif.js). Sin DOM.
// (2027.01.20, revisión) Amortiguada como Levenberg–Marquardt: si la información no se puede invertir (un grupo de una
// persona, cuyo indicador y cuya interacción son proporcionales) o el paso no mejora, se resuelve (I + μ·diag I)·paso = g con
// μ creciente; antes, el ajuste se detenía en el arranque y su log-verosimilitud, más baja que la del modelo anidado, daba un
// χ² de 0. Con una información invertible y pasos que mejoran, μ = 0 y el recorrido es el de siempre.
import { inversaDefinidaPositiva } from '../linalg/cholesky.js';

/** La logística. @param {number} x */
const sigma = x => (x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x)));

/**
 * La log-verosimilitud del modelo de solo umbrales (las proporciones de cada categoría).
 * @param {ArrayLike<number>} y categorías 0 … K − 1
 * @param {number} K
 */
export function logVerosimilitudNula(y, K) {
    const f = new Array(K).fill(0);
    for (let i = 0; i < y.length; i++) f[/** @type {number} */ (y[i])]++;
    let ll = 0;
    for (const c of f) if (c > 0) ll += c * Math.log(c / y.length);
    return ll;
}

/**
 * El R² de Nagelkerke: el de Cox y Snell dividido entre su máximo.
 * @param {number} ll log-verosimilitud del modelo
 * @param {number} ll0 la del modelo nulo
 * @param {number} n
 */
export function r2Nagelkerke(ll, ll0, n) {
    const cs = 1 - Math.exp(2 * (ll0 - ll) / n), max = 1 - Math.exp(2 * ll0 / n);
    return max > 0 ? cs / max : NaN;
}

/**
 * El ajuste.
 * @param {ArrayLike<number>} y categorías 0 … K − 1 (todas presentes)
 * @param {ArrayLike<number>[]} columnas los predictores
 * @param {{ maxIteraciones?: number, tolerancia?: number }} [opciones]
 * @returns {{ alfa: number[], beta: number[], ee: number[], logVerosimilitud: number, convergio: boolean, iteraciones: number, K: number } | null}
 *   ee: los de alfa y después los de beta; null si alguna categoría no aparece
 */
export function ajustarLogitOrdinal(y, columnas, { maxIteraciones = 100, tolerancia = 1e-10 } = {}) {
    const n = y.length, p = columnas.length;
    let K = 0;
    for (let i = 0; i < n; i++) K = Math.max(K, /** @type {number} */ (y[i]) + 1);
    const f = new Array(K).fill(0);
    for (let i = 0; i < n; i++) f[/** @type {number} */ (y[i])]++;
    if (K < 2 || f.some(c => c === 0)) return null;
    // el arranque: los umbrales de las proporciones acumuladas y las pendientes en 0
    let acum = 0;
    /** @type {number[]} */ let th = [];
    for (let k = 1; k < K; k++) { acum += /** @type {number} */ (f[k - 1]); const q = acum / n; th.push(Math.log(q / (1 - q))); }
    th = [...th, ...new Array(p).fill(0)];
    const m = K - 1 + p;
    /** La log-verosimilitud, el gradiente y la información esperada en th. */
    const evaluar = (/** @type {number[]} */ t) => {
        let ll = 0; const g = new Array(m).fill(0), I = Array.from({ length: m }, () => new Array(m).fill(0));
        const Pe = new Array(K + 1), W = new Array(K + 1), dP = Array.from({ length: K }, () => new Array(m).fill(0));
        for (let i = 0; i < n; i++) {
            let eta = 0;
            for (let j = 0; j < p; j++) eta += /** @type {number} */ (t[K - 1 + j]) * /** @type {number} */ (/** @type {ArrayLike<number>} */ (columnas[j])[i]);
            Pe[0] = 1; W[0] = 0; Pe[K] = 0; W[K] = 0;
            for (let k = 1; k < K; k++) { const q = sigma(eta - /** @type {number} */ (t[k - 1])); Pe[k] = q; W[k] = q * (1 - q); }
            const P = [];
            for (let c = 0; c < K; c++) {
                P.push(Math.max(1e-300, Pe[c] - Pe[c + 1]));
                const d = /** @type {number[]} */ (dP[c]);
                d.fill(0);
                if (c >= 1) d[c - 1] = -W[c];            // ∂P*_c/∂α_c = −W_c
                if (c + 1 <= K - 1) d[c] = W[c + 1];      // −∂P*_{c+1}/∂α_{c+1} = +W_{c+1}
                for (let j = 0; j < p; j++) d[K - 1 + j] = /** @type {number} */ (/** @type {ArrayLike<number>} */ (columnas[j])[i]) * (W[c] - W[c + 1]);
            }
            const c = /** @type {number} */ (y[i]), Pc = /** @type {number} */ (P[c]), dc = /** @type {number[]} */ (dP[c]);
            ll += Math.log(Pc);
            for (let u = 0; u < m; u++) g[u] += /** @type {number} */ (dc[u]) / Pc;
            for (let s = 0; s < K; s++) { const ds = /** @type {number[]} */ (dP[s]), Ps = /** @type {number} */ (P[s]); for (let u = 0; u < m; u++) { const du = /** @type {number} */ (ds[u]); if (du === 0) continue; for (let v = 0; v <= u; v++) /** @type {number[]} */ (I[u])[v] += du * /** @type {number} */ (ds[v]) / Ps; } }
        }
        for (let u = 0; u < m; u++) for (let v = u + 1; v < m; v++) /** @type {number[]} */ (I[u])[v] = /** @type {number} */ (/** @type {number[]} */ (I[v])[u]);
        return { ll, g, I };
    };
    const ordenados = (/** @type {number[]} */ t) => { for (let k = 1; k < K - 1; k++) if (!(/** @type {number} */ (t[k]) > /** @type {number} */ (t[k - 1]))) return false; return true; };
    /** La inversa de I + μ·diag(I) (con μ = 0, la de I), o null. @param {number[][]} I @param {number} mu */
    const inversaAmortiguada = (I, mu) => inversaDefinidaPositiva(mu > 0 ? I.map((f, u) => f.map((v, w) => (u === w ? v * (1 + mu) + mu * 1e-12 : v))) : I, { tolerancia: 1e-14 });
    let E = evaluar(th), iteraciones = 0, convergio = false, mu = 0;
    while (iteraciones < maxIteraciones) {
        iteraciones++;
        let aceptado = false;
        // μ = 0 primero; si la información no se invierte o ningún medio paso mejora, μ = 10⁻⁶, 10⁻⁵, … hasta 10⁶
        for (; !aceptado && mu <= 1e6; mu = mu === 0 ? 1e-6 : mu * 10) {
            const inv = inversaAmortiguada(E.I, mu);
            if (!inv) continue;
            const paso = th.map((_, u) => { let s = 0; for (let v = 0; v < m; v++) s += /** @type {number} */ (/** @type {ArrayLike<number>} */ (inv[u])[v]) * /** @type {number} */ (E.g[v]); return s; });
            for (let h = 0, fct = 1; h < 30; h++, fct /= 2) {
                const nuevo = th.map((t, u) => t + fct * /** @type {number} */ (paso[u]));
                if (!ordenados(nuevo)) continue;
                const En = evaluar(nuevo);
                if (En.ll >= E.ll - 1e-12) {
                    const dif = Math.max(...nuevo.map((v, u) => Math.abs(v - /** @type {number} */ (th[u]))));
                    th = nuevo; E = En; aceptado = true;
                    if (dif < tolerancia) convergio = true;
                    break;
                }
            }
            if (aceptado) break;
        }
        // tras un paso aceptado con amortiguación, el siguiente la prueba diez veces menor (y sin ella, desde 10⁻⁶)
        if (aceptado) mu = mu <= 1e-6 ? 0 : mu / 10;
        if (!aceptado || convergio) { convergio = convergio || Math.max(...E.g.map(Math.abs)) < 1e-8; break; }
    }
    const inv = inversaDefinidaPositiva(E.I, { tolerancia: 1e-14 });
    const ee = th.map((_, u) => (inv ? Math.sqrt(/** @type {number} */ (/** @type {ArrayLike<number>} */ (inv[u])[u])) : NaN));
    return { alfa: th.slice(0, K - 1), beta: th.slice(K - 1), ee, logVerosimilitud: E.ll, convergio, iteraciones, K };
}
