// @ts-check
// core/stats/tri.js — (2027.01.19) la teoría de respuesta al ítem unidimensional por máxima verosimilitud marginal (Bock y
// Aitkin, 1981), con el algoritmo EM sobre una cuadratura fija: 61 puntos equiespaciados de −6 a 6 con los pesos de la normal
// estándar (la de mirt por defecto). Modelos:
//   · Rasch (ítems dicotómicos): una pendiente común a todos; con el rasgo en la escala de Rasch (θ = a·z, de media 0 y
//     DE a), P = σ(θ − b) con b = −d, y la DE del rasgo es esa pendiente;
//   · 2PL (dicotómicos): P = σ(a·z + d), con la dificultad b = −d/a;
//   · respuesta graduada de Samejima (1969; GRM, politómicos ordenados): P(X ≥ k) = σ(a·z + d_k), d₁ > d₂ > …, b_k = −d_k/a.
// El paso M de cada ítem (en el de Rasch, de todos a la vez), por puntuación de Fisher con la información esperada de sus
// recuentos esperados, con medio paso si la verosimilitud baja o los umbrales se desordenan. Los errores típicos, por el
// producto cruzado de los gradientes de cada persona (la identidad de Fisher: Cov ≈ (Σ gᵢgᵢᵀ)⁻¹; el «crossprod» de mirt), y
// los de b por el método delta. Las puntuaciones, EAP con su DE posterior; la fiabilidad marginal empírica; la información de
// cada ítem y del test; −2LL, AIC y BIC. Los perdidos no cuentan en la verosimilitud de la persona. El modelo es el de mirt
// (Chalmers, 2012) con su cuadratura por defecto: los parámetros coinciden con los suyos en las primeras cifras.
// La forma del cálculo (la que midió docs/EVALUACION-WASM.md): tablas planas (Float64Array) para las log-probabilidades, la
// posterior y los recuentos esperados, y en el paso M y en los errores típicos solo los términos no nulos de las derivadas
// de cada categoría (las de a, d_c y d_{c+1}), sin crear objetos por nodo; con las mismas operaciones, en el mismo orden, que
// la forma directa. Sin DOM.
import { inversaDefinidaPositiva } from '../linalg/cholesky.js';

/** @typedef {'rasch' | '2pl' | 'grm'} ModeloTRI */

/** La cuadratura: 61 nodos equiespaciados de −6 a 6 con los pesos de la normal estándar, normalizados. */
export function cuadratura(puntos = 61, limite = 6) {
    const nodos = Array.from({ length: puntos }, (_, q) => -limite + 2 * limite * q / (puntos - 1));
    const d = nodos.map(z => Math.exp(-0.5 * z * z)), s = d.reduce((a, b) => a + b, 0);
    return { nodos, pesos: d.map(v => v / s) };
}

/** La logística. @param {number} x */
const sigma = x => (x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x)));

/**
 * Las probabilidades acumuladas de un ítem en z y sus pendientes, en unos búferes: Pe[k] = P(X ≥ k) = σ(a·z + d_k), con
 * Pe[0] = 1 y Pe[K] = 0, y W[k] = Pe[k]·(1 − Pe[k]).
 * @param {number} a
 * @param {ArrayLike<number>} d
 * @param {number} z
 * @param {Float64Array | number[]} Pe K + 1 casillas
 * @param {Float64Array | number[]} W K + 1 casillas
 */
function acumuladas(a, d, z, Pe, W) {
    const K = d.length + 1;
    Pe[0] = 1; W[0] = 0; Pe[K] = 0; W[K] = 0;
    for (let k = 1; k < K; k++) { const p = sigma(a * z + /** @type {number} */ (d[k - 1])); Pe[k] = p; W[k] = p * (1 - p); }
}

/** La probabilidad de la categoría c (con un piso para el logaritmo). @param {ArrayLike<number>} Pe @param {number} c */
const probabilidad = (Pe, c) => Math.max(1e-300, /** @type {number} */ (Pe[c]) - /** @type {number} */ (Pe[c + 1]));

/**
 * Las probabilidades de cada categoría de un ítem en un punto z, con sus derivadas respecto de (a, d₁, …, d_{K−1}).
 * @param {number} a
 * @param {ArrayLike<number>} d
 * @param {number} z
 * @returns {{ P: number[], dP: number[][] }} P[c]; dP[c][0] = ∂P_c/∂a, dP[c][k] = ∂P_c/∂d_k
 */
export function categorias(a, d, z) {
    const K = d.length + 1, Pe = new Array(K + 1), W = new Array(K + 1);
    acumuladas(a, d, z, Pe, W);
    const P = new Array(K), dP = new Array(K);
    for (let c = 0; c < K; c++) {
        P[c] = probabilidad(Pe, c);
        const g = new Array(K).fill(0);
        g[0] = z * (W[c] - W[c + 1]);
        if (c >= 1) g[c] += W[c];
        if (c + 1 <= K - 1) g[c + 1] -= W[c + 1];
        dP[c] = g;
    }
    return { P, dP };
}

/**
 * Las respuestas de unos ítems como categorías 0, 1, …, K − 1 (los valores observados distintos de cada ítem, en orden).
 * @param {ArrayLike<number>[]} columnas
 * @returns {{ X: Int8Array[], categorias: number[][] }} X[j][i]: la categoría, o −1 si falta
 */
export function prepararRespuestas(columnas) {
    const categorias = columnas.map(c => [...new Set(Array.from(c).filter(Number.isFinite))].sort((a, b) => a - b));
    const X = columnas.map((c, j) => {
        const indice = new Map(/** @type {number[]} */ (categorias[j]).map((v, k) => [v, k]));
        return Int8Array.from(c, v => (Number.isFinite(v) ? /** @type {number} */ (indice.get(v)) : -1));
    });
    return { X, categorias };
}

/**
 * El ajuste.
 * @param {Int8Array[]} X J ítems × n personas, categorías 0 … K_j − 1 (−1: perdido)
 * @param {{ modelo?: ModeloTRI, tolerancia?: number, maxIteraciones?: number, puntos?: number,
 *   alProgreso?: ((hechas: number, total: number) => void) | null }} [opciones] tolerancia: el mayor cambio de un parámetro
 *   entre dos iteraciones del EM para darlo por convergido (la de mirt); alProgreso: tras cada iteración
 */
export function ajustarTRI(X, { modelo = 'grm', tolerancia = 1e-4, maxIteraciones = 500, puntos = 61, alProgreso = null } = {}) {
    const J = X.length, n = J ? /** @type {Int8Array} */ (X[0]).length : 0;
    const K = X.map(x => { let m = 0; for (const v of x) if (v > m) m = v; return m + 1; });
    if (K.some(k => k < 2)) throw new Error('Cada ítem necesita al menos dos categorías observadas');
    if (modelo !== 'grm' && K.some(k => k > 2)) throw new Error('Rasch y 2PL son para ítems dicotómicos');
    const { nodos, pesos } = cuadratura(puntos), Q = nodos.length, logPesos = Float64Array.from(pesos, Math.log);
    let Kmax = 2;
    for (const k of K) if (k > Kmax) Kmax = k;
    // los valores iniciales: a = 1 y los umbrales por los logits de las proporciones acumuladas
    /** @type {number[]} */ const a = new Array(J).fill(1);
    /** @type {number[][]} */ const d = X.map((x, j) => {
        const f = new Array(K[j]).fill(0); let t = 0;
        for (const v of x) if (v >= 0) { f[v]++; t++; }
        return Array.from({ length: /** @type {number} */ (K[j]) - 1 }, (_, k) => { let s = 0; for (let c = k + 1; c < /** @type {number} */ (K[j]); c++) s += f[c]; const p = Math.min(0.995, Math.max(0.005, s / t)); return Math.log(p / (1 - p)); });
    });
    // las tablas planas: log P[(j·Q + q)·Kmax + c], la log-verosimilitud y la posterior [i·Q + q], los recuentos [(j·Kmax + c)·Q + q]
    const logP = new Float64Array(J * Q * Kmax), logL = new Float64Array(n * Q), w = new Float64Array(n * Q), r = new Float64Array(J * Kmax * Q);
    const Pe = new Float64Array(Kmax + 1), W = new Float64Array(Kmax + 1);
    let iteraciones = 0, convergio = false, logVero = -Infinity;
    /** La log-verosimilitud de cada persona en cada nodo, y la posterior; devuelve la log-verosimilitud marginal. */
    const pasoE = () => {
        for (let j = 0; j < J; j++) for (let q = 0; q < Q; q++) {
            acumuladas(/** @type {number} */ (a[j]), /** @type {number[]} */ (d[j]), /** @type {number} */ (nodos[q]), Pe, W);
            const o = (j * Q + q) * Kmax;
            for (let c = 0; c < /** @type {number} */ (K[j]); c++) logP[o + c] = Math.log(probabilidad(Pe, c));
        }
        logL.fill(0);
        for (let j = 0; j < J; j++) {
            const x = /** @type {Int8Array} */ (X[j]), oT = j * Q * Kmax;
            for (let i = 0; i < n; i++) {
                const c = /** @type {number} */ (x[i]);
                if (c < 0) continue;
                const oL = i * Q;
                for (let q = 0; q < Q; q++) logL[oL + q] = /** @type {number} */ (logL[oL + q]) + /** @type {number} */ (logP[oT + q * Kmax + c]);
            }
        }
        let total = 0;
        for (let i = 0; i < n; i++) {
            const base = i * Q; let m = -Infinity;
            for (let q = 0; q < Q; q++) { const v = /** @type {number} */ (logL[base + q]) + /** @type {number} */ (logPesos[q]); if (v > m) m = v; }
            let s = 0;
            for (let q = 0; q < Q; q++) { const e = Math.exp(/** @type {number} */ (logL[base + q]) + /** @type {number} */ (logPesos[q]) - m); w[base + q] = e; s += e; }
            for (let q = 0; q < Q; q++) w[base + q] = /** @type {number} */ (w[base + q]) / s;
            total += m + Math.log(s);
        }
        return total;
    };
    /** Los recuentos esperados de cada categoría de cada ítem en cada nodo. */
    const recuentos = () => {
        r.fill(0);
        for (let j = 0; j < J; j++) {
            const x = /** @type {Int8Array} */ (X[j]), oR = j * Kmax * Q;
            for (let i = 0; i < n; i++) {
                const c = /** @type {number} */ (x[i]);
                if (c < 0) continue;
                const oRc = oR + c * Q, base = i * Q;
                for (let q = 0; q < Q; q++) r[oRc + q] = /** @type {number} */ (r[oRc + q]) + /** @type {number} */ (w[base + q]);
            }
        }
    };
    /**
     * La log-verosimilitud esperada del ítem j con (aj, dj), y (si no `soloLl`) su gradiente y su información esperada.
     * De ∂P_c solo los términos no nulos: ∂/∂a = z·(W_c − W_{c+1}); ∂/∂d_c = W_c (c ≥ 1); ∂/∂d_{c+1} = −W_{c+1} (c + 1 < K).
     * @param {number} aj @param {number[]} dj @param {number} j @param {boolean} [soloLl]
     */
    const derivadasItem = (aj, dj, j, soloLl = false) => {
        const p = dj.length + 1, oR = j * Kmax * Q;
        let ll = 0; const g = new Float64Array(p), I = Array.from({ length: p }, () => new Float64Array(p));
        for (let q = 0; q < Q; q++) {
            const z = /** @type {number} */ (nodos[q]);
            acumuladas(aj, dj, z, Pe, W);
            let nq = 0;
            for (let c = 0; c < p; c++) {
                const rc = /** @type {number} */ (r[oR + c * Q + q]), Pc = probabilidad(Pe, c);
                nq += rc; ll += rc * Math.log(Pc);
                if (soloLl) continue;
                g[0] = /** @type {number} */ (g[0]) + rc * (z * (/** @type {number} */ (W[c]) - /** @type {number} */ (W[c + 1]))) / Pc;
                if (c >= 1) g[c] = /** @type {number} */ (g[c]) + rc * /** @type {number} */ (W[c]) / Pc;
                if (c + 1 <= p - 1) g[c + 1] = /** @type {number} */ (g[c + 1]) + rc * -/** @type {number} */ (W[c + 1]) / Pc;
            }
            if (soloLl) continue;
            for (let c = 0; c < p; c++) {
                const Pc = probabilidad(Pe, c), d0 = z * (/** @type {number} */ (W[c]) - /** @type {number} */ (W[c + 1]));
                const I0 = /** @type {Float64Array} */ (I[0]);
                I0[0] = /** @type {number} */ (I0[0]) + nq * d0 * d0 / Pc;
                if (c >= 1) {
                    const dc = /** @type {number} */ (W[c]), Ic = /** @type {Float64Array} */ (I[c]);
                    Ic[0] = /** @type {number} */ (Ic[0]) + nq * dc * d0 / Pc;
                    Ic[c] = /** @type {number} */ (Ic[c]) + nq * dc * dc / Pc;
                }
                if (c + 1 <= p - 1) {
                    const dc1 = -/** @type {number} */ (W[c + 1]), Ic1 = /** @type {Float64Array} */ (I[c + 1]);
                    Ic1[0] = /** @type {number} */ (Ic1[0]) + nq * dc1 * d0 / Pc;
                    if (c >= 1) Ic1[c] = /** @type {number} */ (Ic1[c]) + nq * dc1 * /** @type {number} */ (W[c]) / Pc;
                    Ic1[c + 1] = /** @type {number} */ (Ic1[c + 1]) + nq * dc1 * dc1 / Pc;
                }
            }
        }
        for (let u = 0; u < p; u++) for (let v = u + 1; v < p; v++) /** @type {Float64Array} */ (I[u])[v] = /** @type {number} */ (/** @type {Float64Array} */ (I[v])[u]);
        return { ll, g, I };
    };
    const ordenados = (/** @type {number[]} */ dj) => dj.every((v, k) => k === 0 || v < /** @type {number} */ (dj[k - 1]));
    /** Un paso de Fisher sobre un vector de parámetros, con medio paso hasta que la verosimilitud no baje. */
    const pasoFisher = (/** @type {number[]} */ th, /** @type {ArrayLike<number>} */ g, /** @type {ArrayLike<number>[]} */ I, /** @type {(t: number[]) => number} */ ll, /** @type {(t: number[]) => boolean} */ valido) => {
        const inv = inversaDefinidaPositiva(I, { tolerancia: 1e-12 });
        if (!inv) return th;
        const paso = th.map((_, u) => { let s = 0; for (let v = 0; v < th.length; v++) s += /** @type {number} */ (/** @type {ArrayLike<number>} */ (inv[u])[v]) * /** @type {number} */ (g[v]); return s; });
        const ll0 = ll(th);
        for (let h = 0, f = 1; h < 25; h++, f /= 2) {
            const nuevo = th.map((t, u) => t + f * /** @type {number} */ (paso[u]));
            if (valido(nuevo) && ll(nuevo) >= ll0 - 1e-12) return nuevo;
        }
        return th;
    };
    while (iteraciones < maxIteraciones) {
        iteraciones++;
        logVero = pasoE();
        recuentos();
        let cambio = 0;
        if (modelo === 'rasch') {
            // la pendiente común y los J interceptos a la vez
            for (let interno = 0; interno < 5; interno++) {
                const th = [/** @type {number} */ (a[0]), ...d.map(dj => /** @type {number} */ (dj[0]))], p = J + 1;
                const g = new Array(p).fill(0), I = Array.from({ length: p }, () => new Array(p).fill(0));
                const llTotal = (/** @type {number[]} */ t) => { let s = 0; for (let j = 0; j < J; j++) s += derivadasItem(/** @type {number} */ (t[0]), [/** @type {number} */ (t[j + 1])], j, true).ll; return s; };
                for (let j = 0; j < J; j++) {
                    const D = derivadasItem(/** @type {number} */ (th[0]), [/** @type {number} */ (th[j + 1])], j);
                    const D0 = /** @type {Float64Array} */ (D.I[0]), D1 = /** @type {Float64Array} */ (D.I[1]);
                    g[0] += /** @type {number} */ (D.g[0]); g[j + 1] += /** @type {number} */ (D.g[1]);
                    /** @type {number[]} */ (I[0])[0] += /** @type {number} */ (D0[0]);
                    /** @type {number[]} */ (I[0])[j + 1] += /** @type {number} */ (D0[1]); /** @type {number[]} */ (I[j + 1])[0] += /** @type {number} */ (D1[0]);
                    /** @type {number[]} */ (I[j + 1])[j + 1] += /** @type {number} */ (D1[1]);
                }
                const nuevo = pasoFisher(th, g, I, llTotal, t => /** @type {number} */ (t[0]) > 0);
                let dif = 0;
                nuevo.forEach((v, u) => { const x = Math.abs(v - /** @type {number} */ (th[u])); if (x > dif) dif = x; });
                for (let j = 0; j < J; j++) { a[j] = /** @type {number} */ (nuevo[0]); /** @type {number[]} */ (d[j])[0] = /** @type {number} */ (nuevo[j + 1]); }
                cambio = Math.max(cambio, dif);
                if (dif < 1e-10) break;
            }
        } else {
            for (let j = 0; j < J; j++) {
                for (let interno = 0; interno < 5; interno++) {
                    const th = [/** @type {number} */ (a[j]), .../** @type {number[]} */ (d[j])];
                    const D = derivadasItem(/** @type {number} */ (th[0]), th.slice(1), j);
                    const nuevo = pasoFisher(th, D.g, D.I, t => derivadasItem(/** @type {number} */ (t[0]), t.slice(1), j, true).ll, t => ordenados(t.slice(1)));
                    let dif = 0;
                    nuevo.forEach((v, u) => { const x = Math.abs(v - /** @type {number} */ (th[u])); if (x > dif) dif = x; });
                    a[j] = /** @type {number} */ (nuevo[0]); d[j] = nuevo.slice(1);
                    cambio = Math.max(cambio, dif);
                    if (dif < 1e-10) break;
                }
            }
        }
        if (alProgreso) alProgreso(iteraciones, maxIteraciones);
        if (cambio < tolerancia) { convergio = true; break; }
    }
    logVero = pasoE();
    // los errores típicos: el producto cruzado de los gradientes de cada persona (de ∂P_c, sus términos no nulos)
    const indice = modelo === 'rasch' ? null : X.map((_, j) => { let s = 0; for (let t = 0; t < j; t++) s += /** @type {number} */ (K[t]); return s; });
    const p = modelo === 'rasch' ? J + 1 : K.reduce((s, k) => s + k, 0);
    const XPD = Array.from({ length: p }, () => new Float64Array(p));
    const PeT = new Float64Array(J * Q * (Kmax + 1)), WT = new Float64Array(J * Q * (Kmax + 1));
    for (let j = 0; j < J; j++) for (let q = 0; q < Q; q++) {
        acumuladas(/** @type {number} */ (a[j]), /** @type {number[]} */ (d[j]), /** @type {number} */ (nodos[q]), Pe, W);
        const o = (j * Q + q) * (Kmax + 1);
        for (let k = 0; k <= /** @type {number} */ (K[j]); k++) { PeT[o + k] = /** @type {number} */ (Pe[k]); WT[o + k] = /** @type {number} */ (W[k]); }
    }
    // (2027.01.20, revisión) el producto cruzado, solo con los términos no nulos del gradiente de cada persona (unos 3 por
    // ítem respondido de los K de cada uno): sumar un 0 no cambia la suma, así que el resultado es el mismo bit a bit
    const gi = new Float64Array(p), nz = new Int32Array(p);
    for (let i = 0; i < n; i++) {
        gi.fill(0);
        const base = i * Q;
        for (let j = 0; j < J; j++) {
            const c = /** @type {number} */ (/** @type {Int8Array} */ (X[j])[i]);
            if (c < 0) continue;
            const Kj = /** @type {number} */ (K[j]), o = modelo === 'rasch' ? 0 : /** @type {number} */ (/** @type {number[]} */ (indice)[j]);
            for (let q = 0; q < Q; q++) {
                const wq = /** @type {number} */ (w[base + q]);
                if (wq < 1e-300) continue;
                const oT = (j * Q + q) * (Kmax + 1), z = /** @type {number} */ (nodos[q]);
                const Pc = Math.max(1e-300, /** @type {number} */ (PeT[oT + c]) - /** @type {number} */ (PeT[oT + c + 1])), Wc = /** @type {number} */ (WT[oT + c]), Wc1 = /** @type {number} */ (WT[oT + c + 1]);
                const d0 = z * (Wc - Wc1);
                if (modelo === 'rasch') {
                    // ∂P_c/∂d: −W₁ en la categoría 0, W₁ en la 1
                    gi[0] = /** @type {number} */ (gi[0]) + wq * d0 / Pc;
                    gi[j + 1] = /** @type {number} */ (gi[j + 1]) + wq * (c === 0 ? -Wc1 : Wc) / Pc;
                } else {
                    gi[o] = /** @type {number} */ (gi[o]) + wq * d0 / Pc;
                    if (c >= 1) gi[o + c] = /** @type {number} */ (gi[o + c]) + wq * Wc / Pc;
                    if (c + 1 <= Kj - 1) gi[o + c + 1] = /** @type {number} */ (gi[o + c + 1]) + wq * -Wc1 / Pc;
                }
            }
        }
        let m = 0;
        for (let u = 0; u < p; u++) if (/** @type {number} */ (gi[u]) !== 0) nz[m++] = u;
        for (let s = 0; s < m; s++) {
            const u = /** @type {number} */ (nz[s]), gu = /** @type {number} */ (gi[u]), fila = /** @type {Float64Array} */ (XPD[u]);
            for (let t = 0; t <= s; t++) { const v = /** @type {number} */ (nz[t]); fila[v] = /** @type {number} */ (fila[v]) + gu * /** @type {number} */ (gi[v]); }
        }
    }
    for (let u = 0; u < p; u++) for (let v = u + 1; v < p; v++) /** @type {Float64Array} */ (XPD[u])[v] = /** @type {number} */ (/** @type {Float64Array} */ (XPD[v])[u]);
    const cov = inversaDefinidaPositiva(XPD, { tolerancia: 1e-12 });
    const varDe = (/** @type {number} */ u, /** @type {number} */ v) => (cov ? /** @type {number} */ (/** @type {ArrayLike<number>} */ (cov[u])[v]) : NaN);
    // los parámetros que se informan, con sus errores típicos
    const items = X.map((_, j) => {
        const aj = /** @type {number} */ (a[j]), dj = /** @type {number[]} */ (d[j]);
        if (modelo === 'rasch') {
            return { a: 1, eeA: NaN, d: dj, b: dj.map(v => -v), eeB: [Math.sqrt(varDe(j + 1, j + 1))], eeD: [Math.sqrt(varDe(j + 1, j + 1))] };
        }
        const o = /** @type {number[]} */ (indice)[j], oa = /** @type {number} */ (o);
        const eeB = dj.map((dk, k) => {
            const ok = oa + 1 + k, ga = dk / (aj * aj), gd = -1 / aj;   // b = −d/a: ∂b/∂a = d/a², ∂b/∂d = −1/a
            return Math.sqrt(ga * ga * varDe(oa, oa) + gd * gd * varDe(ok, ok) + 2 * ga * gd * varDe(oa, ok));
        });
        return { a: aj, eeA: Math.sqrt(varDe(oa, oa)), d: dj, b: dj.map(dk => -dk / aj), eeB, eeD: dj.map((_, k) => Math.sqrt(varDe(oa + 1 + k, oa + 1 + k))) };
    });
    // las puntuaciones EAP (en la escala de Rasch, multiplicadas por su DE)
    const escala = modelo === 'rasch' ? /** @type {number} */ (a[0]) : 1;
    const eap = new Float64Array(n), dePost = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const base = i * Q; let m = 0, m2 = 0;
        for (let q = 0; q < Q; q++) { const wq = /** @type {number} */ (w[base + q]), z = /** @type {number} */ (nodos[q]); m += wq * z; m2 += wq * z * z; }
        eap[i] = escala * m; dePost[i] = escala * Math.sqrt(Math.max(0, m2 - m * m));
    }
    let me = 0, ve = 0, v2 = 0;
    for (let i = 0; i < n; i++) me += /** @type {number} */ (eap[i]);
    me /= n;
    for (let i = 0; i < n; i++) { ve += (/** @type {number} */ (eap[i]) - me) ** 2; v2 += /** @type {number} */ (dePost[i]) ** 2; }
    ve /= n - 1; v2 /= n;
    const parametros = modelo === 'rasch' ? J + 1 : K.reduce((s, k) => s + k, 0);
    return {
        modelo, n, J, K, items, deRasgo: modelo === 'rasch' ? { valor: escala, ee: Math.sqrt(varDe(0, 0)) } : null,
        eap, dePosterior: dePost, fiabilidadMarginal: ve / (ve + v2),
        logVerosimilitud: logVero, menos2LL: -2 * logVero, parametros, aic: -2 * logVero + 2 * parametros, bic: -2 * logVero + parametros * Math.log(n),
        iteraciones, convergio, covarianza: cov, nodos, pesos
    };
}

/**
 * La información de cada ítem y del test en una rejilla de θ (en la escala de las puntuaciones: z, o la de Rasch).
 * @param {ReturnType<typeof ajustarTRI>} R
 * @param {number[]} thetas
 * @returns {{ items: number[][], test: number[] }}
 */
export function informacion(R, thetas) {
    const escala = R.deRasgo ? R.deRasgo.valor : 1;
    const items = R.items.map(it => {
        const K = it.d.length + 1, Pe = new Float64Array(K + 1), W = new Float64Array(K + 1);
        return thetas.map(t => {
            // ∂P_c/∂θ = a·(W_c − W_{c+1})/escala; la información, Σ (∂P_c/∂θ)²/P_c
            const z = t / escala, a = R.deRasgo ? escala : it.a;
            acumuladas(a, it.d, z, Pe, W);
            let I = 0;
            for (let c = 0; c < K; c++) {
                const dc = a * (/** @type {number} */ (W[c]) - /** @type {number} */ (W[c + 1])) / escala;
                I += dc * dc / probabilidad(Pe, c);
            }
            return I;
        });
    });
    return { items, test: thetas.map((_, k) => items.reduce((s, f) => s + /** @type {number} */ (f[k]), 0)) };
}
