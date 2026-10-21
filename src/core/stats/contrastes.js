// @ts-check
// core/stats/contrastes.js — las pruebas de comparación de grupos ÚNICAS: t de Student y de Welch, d de Cohen, U de
// Mann-Whitney, Levene, ANOVA de un factor y Kruskal-Wallis. (2026.12.14) Antes había dos motores: el de estadistica.js
// (la vista principal de análisis, los resultados y la criba sociodemográfica) y el de comparacion-grupos.js (su pestaña y
// el informe de Word). Daban lo mismo salvo en tres puntos: Mann-Whitney con y sin corrección por continuidad, Levene
// centrada en la mediana (Brown-Forsythe) o en la media, y el ε² de Kruskal-Wallis, que la pestaña calculaba con la fórmula
// de otra medida (η²_H). Las dos primeras eran convenciones legítimas; desde la 2026.12.15 todo el programa usa las de SPSS
// (Levene centrada en la media; Mann-Whitney sin corrección por continuidad), que son los valores por defecto de aquí: quien
// llama no las elige, para que las vistas no vuelvan a divergir. La tercera era un error, corregido en la 2026.12.14.
// (2026.12.20) También el ANOVA de Welch y las comparaciones por pares de los post-hoc, cada una con el modelo de error de su
// prueba global: las elige core/stats/protocolo-grupos.js, el protocolo único de todas las vistas.
// Las guardas de los casos degenerados (grupos constantes) las decide cada módulo: aquí los cálculos son los de la fórmula.
import { media, varianza } from './descriptivos.js';
import { mediana, rangosPromedio } from './orden.js';
import { pTBilateral, colaSuperiorF, pChiCuadrado } from './distribuciones.js';
import { colaSuperiorNormal } from './normal.js';

/**
 * Varianza combinada de dos grupos.
 * @param {ArrayLike<number>} a
 * @param {ArrayLike<number>} b
 * @returns {number}
 */
function varianzaCombinada(a, b) { return ((a.length - 1) * varianza(a) + (b.length - 1) * varianza(b)) / (a.length + b.length - 2); }

/**
 * d de Cohen con la DE combinada.
 * @param {ArrayLike<number>} a
 * @param {ArrayLike<number>} b
 * @returns {number}
 */
export function dCohen(a, b) { return (media(a) - media(b)) / Math.sqrt(varianzaCombinada(a, b)); }

/**
 * t de Student (varianzas iguales), con su p bilateral y la d de Cohen.
 * @param {ArrayLike<number>} a
 * @param {ArrayLike<number>} b
 * @returns {{ t: number, gl: number, pValor: number, d: number }}
 */
export function tStudent(a, b) {
    const n1 = a.length, n2 = b.length, m1 = media(a), m2 = media(b), sp2 = varianzaCombinada(a, b);
    const t = (m1 - m2) / Math.sqrt(sp2 * (1 / n1 + 1 / n2)), gl = n1 + n2 - 2;
    return { t, gl, pValor: pTBilateral(Math.abs(t), gl), d: (m1 - m2) / Math.sqrt(sp2) };
}

/**
 * t de Welch (varianzas desiguales; gl de Satterthwaite), con su p bilateral y la d de Cohen.
 * @param {ArrayLike<number>} a
 * @param {ArrayLike<number>} b
 * @returns {{ t: number, gl: number, pValor: number, d: number }}
 */
export function tWelch(a, b) {
    const n1 = a.length, n2 = b.length, m1 = media(a), m2 = media(b), v1 = varianza(a), v2 = varianza(b);
    const se2 = v1 / n1 + v2 / n2, t = (m1 - m2) / Math.sqrt(se2);
    const gl = se2 * se2 / ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1));
    return { t, gl, pValor: pTBilateral(Math.abs(t), gl), d: (m1 - m2) / Math.sqrt(varianzaCombinada(a, b)) };
}

/**
 * U de Mann-Whitney por la aproximación normal con corrección de empates. Por defecto, sin corrección por continuidad (la
 * convención de SPSS, la de todo el programa): z = (U − μ)/σ ≤ 0, con U = mín(U₁, U₂); con ella (la de R y SciPy por
 * defecto), z = (|U − μ| − ½)/σ ≥ 0.
 * @param {ArrayLike<number>} a
 * @param {ArrayLike<number>} b
 * @param {{ continuidad?: boolean }} [opciones]
 * @returns {{ U: number, z: number, pValor: number, r: number }}
 */
export function mannWhitney(a, b, { continuidad = false } = {}) {
    const n1 = a.length, n2 = b.length, N = n1 + n2, todos = [...Array.from(a), ...Array.from(b)];
    const rangos = rangosPromedio(todos);
    let R1 = 0; for (let i = 0; i < n1; i++) R1 += /** @type {number} */ (rangos[i]);
    const U1 = R1 - n1 * (n1 + 1) / 2, U = Math.min(U1, n1 * n2 - U1), mu = n1 * n2 / 2;
    /** @type {Map<number, number>} */ const conteo = new Map();
    todos.forEach(x => conteo.set(x, (conteo.get(x) || 0) + 1));
    let empates = 0; conteo.forEach(t => { if (t > 1) empates += t * t * t - t; });
    const sigma2 = n1 * n2 / 12 * ((N + 1) - empates / (N * (N - 1)));
    const z = sigma2 > 0 ? (continuidad ? (Math.abs(U - mu) - 0.5) : (U - mu)) / Math.sqrt(sigma2) : 0;
    return { U, z, pValor: Math.min(1, 2 * colaSuperiorNormal(Math.abs(z))), r: Math.abs(z) / Math.sqrt(N) };
}

/**
 * ANOVA de un factor, con η² = SC entre / SC total.
 * @param {ArrayLike<number>[]} grupos
 * @returns {{ F: number, gl1: number, gl2: number, pValor: number, eta2: number }}
 */
export function anova(grupos) {
    const k = grupos.length, todos = grupos.flatMap(g => Array.from(g)), N = todos.length, mG = media(todos);
    let ssb = 0, ssw = 0;
    for (const g of grupos) { const m = media(g); ssb += g.length * (m - mG) ** 2; for (let i = 0; i < g.length; i++) ssw += (/** @type {number} */ (g[i]) - m) ** 2; }
    const gl1 = k - 1, gl2 = N - k, F = (ssb / gl1) / (ssw / gl2);
    return { F, gl1, gl2, pValor: F > 0 ? colaSuperiorF(F, gl1, gl2) : 1, eta2: ssb / (ssb + ssw) };
}

/**
 * ANOVA de Welch (1951): la igualdad de k medias SIN suponer varianzas iguales (en SPSS, la «prueba robusta de igualdad de
 * medias» de Welch; en R, oneway.test con su opción por defecto). Pondera cada media por su precisión, wᵢ = nᵢ/sᵢ²:
 *   F = [Σ wᵢ(x̄ᵢ − x̄_w)² / (k − 1)] / [1 + 2(k − 2)Λ/(k² − 1)],  x̄_w = Σ wᵢx̄ᵢ / W,  W = Σ wᵢ,  Λ = Σ (1 − wᵢ/W)²/(nᵢ − 1),
 *   gl₁ = k − 1,  gl₂ = (k² − 1)/(3Λ).
 * Con dos grupos, F es el cuadrado de la t de Welch y gl₂ su gl de Satterthwaite. El η² que la acompaña es el descriptivo
 * (SC entre / SC total), el mismo del ANOVA clásico: la prueba cambia, la proporción de varianza explicada no.
 * Indefinida (F, gl₂ y p NaN) si algún grupo tiene varianza 0 o menos de dos casos.
 * @param {ArrayLike<number>[]} grupos
 * @returns {{ F: number, gl1: number, gl2: number, pValor: number, eta2: number }}
 */
export function anovaWelch(grupos) {
    const k = grupos.length, w = new Float64Array(k), m = new Float64Array(k), gl1 = k - 1, eta2 = anova(grupos).eta2;
    let W = 0, sumaWM = 0;
    for (let i = 0; i < k; i++) {
        const g = /** @type {ArrayLike<number>} */ (grupos[i]);
        m[i] = media(g); w[i] = g.length / varianza(g);
        if (!Number.isFinite(w[i])) return { F: NaN, gl1, gl2: NaN, pValor: NaN, eta2 };
        W += w[i]; sumaWM += w[i] * m[i];
    }
    const mW = sumaWM / W;
    let entre = 0, lambda = 0;
    for (let i = 0; i < k; i++) {
        entre += w[i] * (m[i] - mW) ** 2;
        lambda += (1 - w[i] / W) ** 2 / (/** @type {ArrayLike<number>} */ (grupos[i]).length - 1);
    }
    const F = (entre / gl1) / (1 + 2 * (k - 2) * lambda / (k * k - 1)), gl2 = (k * k - 1) / (3 * lambda);
    return { F, gl1, gl2, pValor: F > 0 ? colaSuperiorF(F, gl1, gl2) : 1, eta2 };
}

/**
 * Comparaciones por pares de un post-hoc, cada una con el MISMO modelo de error que su prueba global, y su p bilateral SIN
 * ajustar (el ajuste por comparaciones múltiples, Holm, lo aplica quien llama):
 *  - 'mce', tras el ANOVA clásico: t = (x̄ᵢ − x̄ⱼ)/√(MCE·(1/nᵢ + 1/nⱼ)), con la media cuadrática del error de TODOS los grupos
 *    y gl = N − k (la DMS de Fisher; la base de la Bonferroni del ANOVA de SPSS; pairwise.t.test de R por defecto);
 *  - 'welch', tras el ANOVA de Welch: la t de Welch de cada par, que no supone varianzas iguales (pairwise.t.test de R con
 *    pool.sd = FALSE; la t de la T2 de Tamhane);
 *  - 'dunn', tras Kruskal-Wallis: la z de Dunn (1964), z = (R̄ᵢ − R̄ⱼ)/√([N(N + 1)/12 − Σ(t³ − t)/(12(N − 1))]·(1/nᵢ + 1/nⱼ)),
 *    con los rangos promedio de la ordenación CONJUNTA de los k grupos (los de la H) y la corrección de empates: la de las
 *    comparaciones por parejas de Kruskal-Wallis en SPSS (que ajusta por Bonferroni) y la de dunnTest de R (por Holm). Con
 *    todos los valores empatados, z = 0 y p = 1.
 * Los pares van en el orden (0, 1), (0, 2), …, (1, 2), …; el signo del estadístico es el de grupo i − grupo j.
 * @param {ArrayLike<number>[]} grupos
 * @param {'mce' | 'welch' | 'dunn'} metodo
 * @returns {{ i: number, j: number, estadistico: number, gl: number | null, pValor: number }[]}
 */
export function comparacionesPorPares(grupos, metodo) {
    const k = grupos.length, n = grupos.map(g => g.length);
    /** @type {{ i: number, j: number, estadistico: number, gl: number | null, pValor: number }[]} */ const pares = [];
    if (metodo === 'welch') {
        for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
            const r = tWelch(/** @type {ArrayLike<number>} */ (grupos[i]), /** @type {ArrayLike<number>} */ (grupos[j]));
            pares.push({ i, j, estadistico: r.t, gl: r.gl, pValor: r.pValor });
        }
        return pares;
    }
    if (metodo === 'mce') {
        const m = grupos.map(g => media(g));
        let N = 0, sce = 0;
        grupos.forEach((g, a) => { N += g.length; for (let i = 0; i < g.length; i++) sce += (/** @type {number} */ (g[i]) - /** @type {number} */ (m[a])) ** 2; });
        const gl = N - k, mce = sce / gl;
        for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
            const t = (/** @type {number} */ (m[i]) - /** @type {number} */ (m[j])) / Math.sqrt(mce * (1 / /** @type {number} */ (n[i]) + 1 / /** @type {number} */ (n[j])));
            pares.push({ i, j, estadistico: t, gl, pValor: pTBilateral(Math.abs(t), gl) });
        }
        return pares;
    }
    if (metodo === 'dunn') {
        const todos = grupos.flatMap(g => Array.from(g)), N = todos.length, rangos = rangosPromedio(todos), rMedio = new Float64Array(k);
        let off = 0;
        for (let a = 0; a < k; a++) { const na = /** @type {number} */ (n[a]); let s = 0; for (let i = 0; i < na; i++) s += /** @type {number} */ (rangos[off + i]); rMedio[a] = s / na; off += na; }
        /** @type {Map<number, number>} */ const conteo = new Map();
        todos.forEach(x => conteo.set(x, (conteo.get(x) || 0) + 1));
        let empates = 0; conteo.forEach(t => { if (t > 1) empates += t * t * t - t; });
        const s2 = N * (N + 1) / 12 - empates / (12 * (N - 1));
        for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
            const ee = Math.sqrt(s2 * (1 / /** @type {number} */ (n[i]) + 1 / /** @type {number} */ (n[j])));
            const z = ee > 0 ? (/** @type {number} */ (rMedio[i]) - /** @type {number} */ (rMedio[j])) / ee : 0;
            pares.push({ i, j, estadistico: z, gl: null, pValor: Math.min(1, 2 * colaSuperiorNormal(Math.abs(z))) });
        }
        return pares;
    }
    throw new Error(`Comparaciones por pares: método desconocido «${metodo}» (se esperaba 'mce', 'welch' o 'dunn').`);
}

/**
 * Levene: ANOVA sobre las desviaciones absolutas al centro de cada grupo. Por defecto, centrada en la media: la clásica, la
 * de SPSS y la de todo el programa; en la mediana, la de Brown-Forsythe (la de R y SciPy por defecto).
 * @param {ArrayLike<number>[]} grupos
 * @param {{ centro?: 'media' | 'mediana' }} [opciones]
 * @returns {{ F: number, gl1: number, gl2: number, pValor: number }}
 */
export function levene(grupos, { centro = 'media' } = {}) {
    const desv = grupos.map(g => { const c = centro === 'mediana' ? mediana(g) : media(g); return Array.from(g, x => Math.abs(x - c)); });
    const { F, gl1, gl2, pValor } = anova(desv);
    return { F, gl1, gl2, pValor };
}

/**
 * Kruskal-Wallis con corrección de empates, y su ε² = H/(n − 1) (Tomczak y Tomczak, 2014).
 * @param {ArrayLike<number>[]} grupos
 * @returns {{ H: number, gl: number, pValor: number, epsilon2: number }}
 */
export function kruskal(grupos) {
    const k = grupos.length, todos = grupos.flatMap(g => Array.from(g)), N = todos.length, rangos = rangosPromedio(todos);
    let off = 0, H = 0;
    for (const g of grupos) { let Ri = 0; for (let i = 0; i < g.length; i++) Ri += /** @type {number} */ (rangos[off + i]); H += Ri * Ri / g.length; off += g.length; }
    H = 12 / (N * (N + 1)) * H - 3 * (N + 1);
    /** @type {Map<number, number>} */ const conteo = new Map();
    todos.forEach(x => conteo.set(x, (conteo.get(x) || 0) + 1));
    let empates = 0; conteo.forEach(t => { if (t > 1) empates += t * t * t - t; });
    const C = 1 - empates / (N * N * N - N);
    if (C > 0) H = H / C;
    const gl = k - 1;
    return { H, gl, pValor: H > 0 ? pChiCuadrado(H, gl) : 1, epsilon2: N > 1 ? H / (N - 1) : 0 };
}
