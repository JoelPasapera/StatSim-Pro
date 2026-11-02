// @ts-check
// core/stats/multinivel.js — (2027.01.19) el modelo lineal mixto de intercepto aleatorio (dos niveles: personas dentro de
// grupos), y_ij = x_ijᵀβ + u_j + e_ij, por máxima verosimilitud restringida (REML, la de lme4 y SPSS MIXED por defecto). Con
// λ = σ²_u/σ²_e, la matriz de cada grupo es σ²_e(I + λ·11ᵀ), cuya inversa y determinante tienen forma cerrada
// (Sherman–Morrison): para cada λ, β por mínimos cuadrados generalizados y σ²_e en su máximo, así la verosimilitud queda en
// una sola dimensión, que se maximiza con Brent sobre ρ = λ/(1 + λ) ∈ [0, 1) (y se compara con ρ = 0, el borde).
// (2027.01.20, revisión) Con la dependiente y los predictores centrados en su media (la REML y las pendientes no cambian; la
// constante se recupera al final) y cada producto uᵀB⁻¹v como su parte DENTRO de los grupos, de los desvíos a las medias de
// cada grupo, más la de ENTRE ellos, Σ n_j·ū_j·v̄_j/(1 + λn_j): la forma directa, Σuv − Σ(λ/(1 + λn_j))(Σu)(Σv), restaba
// números grandes y, con una variable de media alta (un año, la edad en meses), sus derivadas numéricas daban unos gl de
// Satterthwaite hasta cinco veces mayores. Los gl, los de lmerTest (2·V²/(gᵀAg)): A, la inversa del hessiano de la REML en
// (σ²_u, σ²_e), por diferencias centrales con la extrapolación de Richardson; g, el gradiente de la varianza de cada
// coeficiente, exacto (∂C/∂σ²_u = −M⁻¹M′M⁻¹, ∂C/∂σ²_e = M⁻¹ + λM⁻¹M′M⁻¹, con M = XᵀB⁻¹X y M′ su derivada en λ). Y la CCI;
// el efecto de diseño (Kish, 1965); la prueba de razón de verosimilitud de σ²_u = 0 con la mezcla ½χ²₀ + ½χ²₁ (Self y
// Liang, 1987); los R² marginal y condicional de Nakagawa y Schielzeth (2013), y la log-verosimilitud por ML para comparar
// modelos. Lo que no se puede ajustar (predictores colineales, ningún grupo de dos casos, la dependiente sin variación dentro
// de los grupos) se dice en { error }. Sin DOM.
import { inversaYLogDet, inversaDefinidaPositiva } from '../linalg/cholesky.js';
import { maximizarBrent } from './optimizacion.js';
import { pTBilateral, pChiCuadrado, cuantilT } from './distribuciones.js';
import { media, varianza } from './descriptivos.js';

/**
 * @typedef {{ b: number, ee: number, t: number, gl: number, pValor: number, inferior: number, superior: number }} CoeficienteMultinivel
 * @typedef {{ n: number, G: number, p: number, tamanos: number[], niveles: unknown[], coeficientes: CoeficienteMultinivel[],
 *   s2u: number, s2e: number, icc: number, efectoDiseno: number, mediaTamano: number, lrt: number, pLrt: number,
 *   r2Marginal: number, r2Condicional: number, reml: number, ml: number, satterthwaite: boolean }} ResultadoMultinivel
 *   coeficientes: la constante y después los predictores, en la escala original de los datos
 * @typedef {{ n: number, p: number, m: number, G: number, tamanos: number[], medias: Float64Array, W: Float64Array[], centros: number[], cy: number }} Piezas
 *   las columnas 0 … p − 1 son las de X (la 0, la constante) y la p, la dependiente; medias[j·m + c], la del grupo j en la
 *   columna c; W[c][d], la suma de productos de los desvíos a las medias de cada grupo; centros, los de cada predictor
 */

/** El ρ más alto que se busca (CCI de 0,999999): por encima, la dependiente no varía dentro de los grupos. */
const RHO_MAXIMO = 0.999999;

/**
 * Los grupos de unos códigos (cualquier valor), en orden de aparición.
 * @param {ArrayLike<unknown>} codigos
 * @returns {{ indice: Int32Array, tamanos: number[], niveles: unknown[] }}
 */
export function agrupar(codigos) {
    /** @type {Map<unknown, number>} */ const mapa = new Map();
    const indice = new Int32Array(codigos.length), tamanos = [];
    for (let i = 0; i < codigos.length; i++) {
        let g = mapa.get(codigos[i]);
        if (g === undefined) { g = mapa.size; mapa.set(codigos[i], g); tamanos.push(0); }
        indice[i] = g; tamanos[g]++;
    }
    return { indice, tamanos, niveles: [...mapa.keys()] };
}

/**
 * Lo que no depende de las varianzas: los centros, las medias de cada grupo y las sumas de productos dentro de los grupos.
 * @param {ArrayLike<number>} y
 * @param {ArrayLike<number>[]} predictores
 * @param {{ indice: Int32Array, tamanos: number[] }} g
 * @returns {Piezas}
 */
function preparar(y, predictores, g) {
    const n = y.length, p = predictores.length + 1, m = p + 1, G = g.tamanos.length;
    const centros = [0, ...predictores.map(x => media(x))], cy = media(y);
    const columnas = [new Float64Array(n).fill(1), ...predictores.map((x, k) => Float64Array.from(x, v => v - /** @type {number} */ (centros[k + 1]))), Float64Array.from(y, v => v - cy)];
    const medias = new Float64Array(G * m);
    for (let i = 0; i < n; i++) { const o = /** @type {number} */ (g.indice[i]) * m; for (let c = 0; c < m; c++) medias[o + c] = /** @type {number} */ (medias[o + c]) + /** @type {number} */ (/** @type {Float64Array} */ (columnas[c])[i]); }
    for (let j = 0; j < G; j++) for (let c = 0; c < m; c++) medias[j * m + c] = /** @type {number} */ (medias[j * m + c]) / /** @type {number} */ (g.tamanos[j]);
    const W = Array.from({ length: m }, () => new Float64Array(m)), desvio = new Float64Array(m);
    for (let i = 0; i < n; i++) {
        const o = /** @type {number} */ (g.indice[i]) * m;
        for (let c = 1; c < m; c++) desvio[c] = /** @type {number} */ (/** @type {Float64Array} */ (columnas[c])[i]) - /** @type {number} */ (medias[o + c]);
        for (let c = 1; c < m; c++) { const fila = /** @type {Float64Array} */ (W[c]), dc = /** @type {number} */ (desvio[c]); for (let d = 1; d <= c; d++) fila[d] = /** @type {number} */ (fila[d]) + dc * /** @type {number} */ (desvio[d]); }
    }
    for (let c = 0; c < m; c++) for (let d = c + 1; d < m; d++) /** @type {Float64Array} */ (W[c])[d] = /** @type {number} */ (/** @type {Float64Array} */ (W[d])[c]);
    return { n, p, m, G, tamanos: g.tamanos, medias, W, centros, cy };
}

/**
 * Las cantidades de un λ: M = XᵀB⁻¹X, XᵀB⁻¹y, yᵀB⁻¹y (B = bloques I + λ·11ᵀ), Σ log(1 + λn_j) y, si se pide, M′ = dM/dλ.
 * Cada producto, su parte dentro de los grupos más la de entre ellos, con el peso w_j = n_j/(1 + λn_j).
 * @param {number} lambda
 * @param {Piezas} D
 * @param {boolean} [conDerivada]
 */
function cantidades(lambda, D, conDerivada = false) {
    const { p, m, G, tamanos, medias, W } = D;
    const XtX = Array.from({ length: p }, (_, u) => Float64Array.from({ length: p }, (_, v) => /** @type {number} */ (/** @type {Float64Array} */ (W[u])[v])));
    const Xty = Float64Array.from({ length: p }, (_, u) => /** @type {number} */ (/** @type {Float64Array} */ (W[u])[p]));
    const Mp = conDerivada ? Array.from({ length: p }, () => new Float64Array(p)) : null;
    let yty = /** @type {number} */ (/** @type {Float64Array} */ (W[p])[p]), logDetB = 0;
    for (let j = 0; j < G; j++) {
        const nj = /** @type {number} */ (tamanos[j]), w = nj / (1 + lambda * nj), o = j * m, my = /** @type {number} */ (medias[o + p]);
        logDetB += Math.log1p(lambda * nj);
        yty += w * my * my;
        for (let u = 0; u < p; u++) {
            const mu = /** @type {number} */ (medias[o + u]), fila = /** @type {Float64Array} */ (XtX[u]);
            Xty[u] = /** @type {number} */ (Xty[u]) + w * mu * my;
            for (let v = 0; v <= u; v++) fila[v] = /** @type {number} */ (fila[v]) + w * mu * /** @type {number} */ (medias[o + v]);
            if (Mp) { const filaP = /** @type {Float64Array} */ (Mp[u]); for (let v = 0; v <= u; v++) filaP[v] = /** @type {number} */ (filaP[v]) - w * w * mu * /** @type {number} */ (medias[o + v]); }
        }
    }
    for (let u = 0; u < p; u++) for (let v = u + 1; v < p; v++) {
        /** @type {Float64Array} */ (XtX[u])[v] = /** @type {number} */ (/** @type {Float64Array} */ (XtX[v])[u]);
        if (Mp) /** @type {Float64Array} */ (Mp[u])[v] = /** @type {number} */ (/** @type {Float64Array} */ (Mp[v])[u]);
    }
    return { XtX, Xty, yty, logDetB, Mp };
}

/**
 * β por mínimos cuadrados generalizados con un λ (en las columnas centradas), la suma de cuadrados ponderada de los residuos
 * y las log-verosimilitudes (REML y ML) perfiladas en σ²_e.
 * @param {number} lambda
 * @param {Piezas} D
 */
function perfil(lambda, D) {
    const { n, p } = D, C = cantidades(lambda, D), inv = inversaYLogDet(C.XtX);
    if (!inv) return null;
    const beta = inv.inv.map(f => { let s = 0; for (let v = 0; v < p; v++) s += /** @type {number} */ (f[v]) * /** @type {number} */ (C.Xty[v]); return s; });
    let rss = C.yty;
    for (let u = 0; u < p; u++) rss -= /** @type {number} */ (beta[u]) * /** @type {number} */ (C.Xty[u]);
    rss = Math.max(rss, 0);
    const s2Reml = rss / (n - p), s2Ml = rss / n, l2pi = Math.log(2 * Math.PI);
    const reml = -0.5 * ((n - p) * Math.log(s2Reml) + C.logDetB + inv.logDet + (n - p) * (1 + l2pi));
    const ml = -0.5 * (n * Math.log(s2Ml) + C.logDetB + n * (1 + l2pi));
    return { beta, s2Reml, s2Ml, reml, ml, inv: inv.inv };
}

/**
 * La log-verosimilitud REML en unas varianzas dadas (sin perfilar): la que deriva el hessiano de Satterthwaite.
 * @param {number} s2u
 * @param {number} s2e
 * @param {Piezas} D
 */
function remlEn(s2u, s2e, D) {
    const { n, p } = D, C = cantidades(s2u / s2e, D), inv = inversaYLogDet(C.XtX);
    if (!inv) return NaN;
    let rss = C.yty;
    for (let u = 0; u < p; u++) { let b = 0; const f = /** @type {Float64Array} */ (inv.inv[u]); for (let v = 0; v < p; v++) b += /** @type {number} */ (f[v]) * /** @type {number} */ (C.Xty[v]); rss -= b * /** @type {number} */ (C.Xty[u]); }
    return -0.5 * ((n - p) * Math.log(s2e) + C.logDetB + inv.logDet + Math.max(rss, 0) / s2e + (n - p) * Math.log(2 * Math.PI));
}

/**
 * El hessiano de una función de dos variables en th, por diferencias centrales con pasos relativos h·th y la extrapolación
 * de Richardson (h y h/2): error de truncamiento O(h⁴).
 * @param {(a: number, b: number) => number} f
 * @param {[number, number]} th
 * @param {number} [h]
 * @returns {number[][]}
 */
function hessiano(f, th, h = 1e-3) {
    const centro = f(th[0], th[1]);
    const conPaso = (/** @type {number} */ r) => {
        const d = [r * th[0], r * th[1]], H = [[0, 0], [0, 0]];
        const en = (/** @type {number} */ s0, /** @type {number} */ s1) => f(th[0] + s0 * /** @type {number} */ (d[0]), th[1] + s1 * /** @type {number} */ (d[1]));
        /** @type {number[]} */ (H[0])[0] = (en(1, 0) - 2 * centro + en(-1, 0)) / (/** @type {number} */ (d[0]) ** 2);
        /** @type {number[]} */ (H[1])[1] = (en(0, 1) - 2 * centro + en(0, -1)) / (/** @type {number} */ (d[1]) ** 2);
        /** @type {number[]} */ (H[0])[1] = /** @type {number[]} */ (H[1])[0] = (en(1, 1) - en(1, -1) - en(-1, 1) + en(-1, -1)) / (4 * /** @type {number} */ (d[0]) * /** @type {number} */ (d[1]));
        return H;
    };
    const H1 = conPaso(h), H2 = conPaso(h / 2);
    return H1.map((fila, a) => fila.map((v, b) => (4 * /** @type {number} */ (/** @type {number[]} */ (H2[a])[b]) - v) / 3));
}

/** ℓᵀ·S·ℓ. @param {ArrayLike<number>[]} S @param {ArrayLike<number>} l */
function formaCuadratica(S, l) {
    let s = 0;
    for (let u = 0; u < l.length; u++) { const lu = /** @type {number} */ (l[u]); if (lu === 0) continue; const f = /** @type {ArrayLike<number>} */ (S[u]); for (let v = 0; v < l.length; v++) s += lu * /** @type {number} */ (f[v]) * /** @type {number} */ (l[v]); }
    return s;
}

/**
 * El ajuste.
 * @param {ArrayLike<number>} y
 * @param {ArrayLike<number>[]} predictores sin la constante
 * @param {ArrayLike<unknown>} grupos el código del grupo de cada caso
 * @param {{ nivel?: number }} [opciones]
 * @returns {ResultadoMultinivel | { error: string }}
 */
export function ajustarInterceptoAleatorio(y, predictores, grupos, { nivel = 0.95 } = {}) {
    const n = y.length, g = agrupar(grupos), G = g.tamanos.length, p = predictores.length + 1;
    if (G < 2) return { error: 'Hacen falta al menos dos grupos.' };
    if (n <= p + 1) return { error: 'Hacen falta más casos que parámetros.' };
    if (!g.tamanos.some(t => t >= 2)) return { error: 'Ningún grupo tiene dos o más casos: no se puede separar la variación entre los grupos de la de dentro.' };
    const D = preparar(y, predictores, g);
    // el rango de X: su matriz de productos escalada a diagonal 1, con una tolerancia relativa (un pivote de 10⁻¹⁰: un
    // predictor explicado por los demás en más del 99,99999999 %); una columna sin variación, aparte
    const M0 = cantidades(0, D).XtX, diagonal = M0.map((f, u) => Math.sqrt(/** @type {number} */ (f[u])));
    if (diagonal.some(d => !(d > 0))) return { error: 'Algún predictor no varía.' };
    if (!inversaDefinidaPositiva(M0.map((f, u) => Float64Array.from(f, (v, w) => v / /** @type {number} */ (diagonal[u]) / /** @type {number} */ (diagonal[w]))), { tolerancia: 1e-10 })) {
        return { error: 'Los predictores son colineales: alguno es una combinación exacta de otros (por ejemplo, la media de grupo de uno que ya es de nivel 2).' };
    }
    // ρ = λ/(1 + λ): la REML perfilada, maximizada con Brent; el borde ρ = 0, aparte
    const objetivo = (/** @type {number} */ rho) => { const P = perfil(rho / (1 - rho), D); return P ? P.reml : -Infinity; };
    const max = maximizarBrent(objetivo, 0, RHO_MAXIMO, 1e-12);
    const borde = perfil(0, D);
    if (!borde) return { error: 'El modelo no se pudo ajustar.' };
    if (max.valor > borde.reml && max.x > RHO_MAXIMO - 1e-6) return { error: 'La dependiente casi no varía dentro de los grupos (CCI ≈ 1): no se puede estimar la varianza de dentro.' };
    // (el máximo con λ < 10⁻⁶ es, a efectos prácticos, el borde: el modelo lineal)
    const rho = max.valor > borde.reml && max.x / (1 - max.x) > 1e-6 ? max.x : 0, lambda = rho / (1 - rho);
    const P = /** @type {NonNullable<ReturnType<typeof perfil>>} */ (perfil(lambda, D));
    const s2e = P.s2Reml, s2u = lambda * s2e;
    // los gl de Satterthwaite: A = (−H)⁻¹ y, para cada coeficiente (ℓ: e_k, o (1, −c₁, …) para la constante en la escala
    // original), V = σ²_e·ℓᵀM⁻¹ℓ y su gradiente exacto en (σ²_u, σ²_e)
    /** @type {number[][] | null} */ let A = null;
    /** @type {Float64Array[] | null} */ let S = null;
    if (s2u > 0) {
        const H = hessiano((a, b) => remlEn(a, b, D), [s2u, s2e]);
        const h00 = /** @type {number} */ (/** @type {number[]} */ (H[0])[0]), h11 = /** @type {number} */ (/** @type {number[]} */ (H[1])[1]), h01 = /** @type {number} */ (/** @type {number[]} */ (H[0])[1]);
        const det = h00 * h11 - h01 * h01;
        if (det > 0 && h00 < 0) {
            A = [[-h11 / det, h01 / det], [h01 / det, -h00 / det]];
            const Mp = /** @type {Float64Array[]} */ (cantidades(lambda, D, true).Mp), Minv = P.inv;
            // S = M⁻¹·M′·M⁻¹
            const MpMinv = Mp.map(f => Float64Array.from({ length: p }, (_, v) => { let s = 0; for (let w = 0; w < p; w++) s += /** @type {number} */ (f[w]) * /** @type {number} */ (/** @type {Float64Array} */ (Minv[w])[v]); return s; }));
            S = Minv.map(f => Float64Array.from({ length: p }, (_, v) => { let s = 0; for (let w = 0; w < p; w++) s += /** @type {number} */ (f[w]) * /** @type {number} */ (/** @type {Float64Array} */ (MpMinv[w])[v]); return s; }));
        }
    }
    const L0 = Float64Array.from({ length: p }, (_, k) => (k === 0 ? 1 : -/** @type {number} */ (D.centros[k])));
    const coeficientes = Array.from({ length: p }, (_, k) => {
        const l = k === 0 ? L0 : Float64Array.from({ length: p }, (_, u) => (u === k ? 1 : 0));
        const q = formaCuadratica(P.inv, l), v = s2e * q, ee = Math.sqrt(v);
        let b = 0;
        for (let u = 0; u < p; u++) b += /** @type {number} */ (l[u]) * /** @type {number} */ (P.beta[u]);
        if (k === 0) b += D.cy;
        let gl = n - p;
        if (A && S) {
            const qS = formaCuadratica(S, l), gu = -qS, ge = q + lambda * qS;
            const forma = gu * gu * /** @type {number} */ (/** @type {number[]} */ (A[0])[0]) + 2 * gu * ge * /** @type {number} */ (/** @type {number[]} */ (A[0])[1]) + ge * ge * /** @type {number} */ (/** @type {number[]} */ (A[1])[1]);
            if (forma > 0) gl = 2 * v * v / forma;
        }
        const t = b / ee;
        return { b, ee, t, gl, pValor: pTBilateral(t, gl), ...intervalo(b, ee, gl, nivel) };
    });
    // la prueba de σ²_u = 0 (la misma parte fija; la mezcla de χ²) y los R² de Nakagawa y Schielzeth
    const lrt = Math.max(0, 2 * (P.reml - borde.reml));
    // σ²_f: la varianza muestral (n − 1) de la parte fija, la de performance::r2_nakagawa y MuMIn::r.squaredGLMM
    let s2f = 0;
    if (p > 1) {
        const ajuste = new Float64Array(n);
        for (let i = 0; i < n; i++) { let s = 0; for (let k = 1; k < p; k++) s += /** @type {number} */ (P.beta[k]) * (/** @type {number} */ (/** @type {ArrayLike<number>} */ (predictores[k - 1])[i]) - /** @type {number} */ (D.centros[k])); ajuste[i] = s; }
        s2f = varianza(ajuste);
    }
    const mediaTamano = n / G;
    return {
        n, G, p, tamanos: g.tamanos, niveles: g.niveles, coeficientes, s2u, s2e, icc: s2u / (s2u + s2e),
        efectoDiseno: 1 + (mediaTamano - 1) * (s2u / (s2u + s2e)), mediaTamano,
        lrt, pLrt: lrt > 0 ? 0.5 * pChiCuadrado(lrt, 1) : 1,
        r2Marginal: s2f / (s2f + s2u + s2e), r2Condicional: (s2f + s2u) / (s2f + s2u + s2e),
        reml: P.reml, ml: perfilML(D), satterthwaite: !!(A && S)
    };
}

/** El intervalo de un coeficiente con la t de sus gl (el cuantil de distribuciones.js). @param {number} b @param {number} ee @param {number} gl @param {number} nivel */
function intervalo(b, ee, gl, nivel) {
    const q = cuantilT(1 - (1 - nivel) / 2, gl);
    return { inferior: b - q * ee, superior: b + q * ee };
}

/**
 * La log-verosimilitud ML del modelo (para comparar modelos con distinta parte fija): maximizada en λ con Brent.
 * @param {Piezas} D
 */
function perfilML(D) {
    const f = (/** @type {number} */ rho) => { const P = perfil(rho / (1 - rho), D); return P ? P.ml : -Infinity; };
    const m = maximizarBrent(f, 0, RHO_MAXIMO, 1e-12), b = f(0);
    return Math.max(m.valor, b);
}
