// @ts-check
// core/stats/imputacion.js — (2027.01.18) la imputación múltiple por ecuaciones encadenadas (MICE; van Buuren y
// Groothuis-Oudshoorn, 2011) con emparejamiento predictivo de medias (PMM), la de mice::mice por defecto para variables
// numéricas. Cada cadena arranca rellenando cada perdido con un valor observado de su variable al azar y, en cada iteración,
// recorre las variables con perdidos de izquierda a derecha: regresa la variable sobre todas las demás (con los valores
// imputados del momento) en los casos donde se observó; sortea la varianza residual (σ*² = SCE/χ²(n − p)) y los coeficientes
// (β* ~ N(β̂, σ*²(X'X)⁻¹)), la regresión bayesiana de mice («norm.draw»); predice los observados con β̂ y los perdidos con β*
// (el emparejamiento de tipo 1) y a cada perdido le da el valor OBSERVADO de uno de sus `donantes` vecinos más cercanos en
// la predicción, al azar (Morris, White y Royston, 2014: 5 por defecto). Así los imputados son siempre valores posibles
// (enteros en una escala Likert). Con predictores colineales, la penalización de cresta de mice (10⁻⁵ de la diagonal de X'X).
// Cada cadena tiene su propio generador sfc32, sembrado con la semilla y su número: la cadena l da lo mismo se calcule sola o
// con las demás, en un Worker o en otro (lo que permite repartirlas). Sin DOM.
import { sfc32, semillaCadena } from '../random/sfc32.js';
import { generadorNormales } from '../random/normal.js';
import { chiCuadradoAleatoria } from '../random/gamma.js';
import { ajustarMco } from './mco.js';
import { cholesky, choleskyForzado, inversaDefinidaPositiva } from '../linalg/cholesky.js';
import { cotaInferior } from './orden.js';
import { media, varianza } from './descriptivos.js';
import { correlacion } from './correlacion.js';
import { reglasRubin } from './perdidos.js';

/** Los donantes de cada perdido (los de mice). */
export const DONANTES = 5;
/** La penalización de cresta de mice, si X'X no se puede invertir. */
const CRESTA = 1e-5;

/** @typedef {ArrayLike<number>[]} Columnas */

/**
 * La regresión bayesiana de mice: β̂ por mínimos cuadrados y un sorteo β* de su posterior (con la varianza residual sorteada).
 * @param {Float64Array} y
 * @param {Float64Array[]} columnas
 * @param {() => number} u
 * @param {() => number} normal
 * @returns {{ beta: ArrayLike<number>, betaSorteada: number[], sigma: number }}
 */
function regresionSorteada(y, columnas, u, normal) {
    const n = y.length, p = columnas.length + 1;
    let beta, V, sce;
    const a = ajustarMco(y, columnas, { conInversa: true });
    if (a && a.inversa) { beta = a.beta; V = a.inversa; sce = a.sce; } else {
        // (X'X + κ·diag(X'X))⁻¹ X'y, con la constante como primera columna
        const X = [new Float64Array(n).fill(1), ...columnas];
        const XtX = X.map(ca => X.map(cb => { let s = 0; for (let i = 0; i < n; i++) s += /** @type {number} */ (ca[i]) * /** @type {number} */ (cb[i]); return s; }));
        XtX.forEach((f, j) => { f[j] = /** @type {number} */ (f[j]) * (1 + CRESTA) + (/** @type {number} */ (f[j]) === 0 ? CRESTA : 0); });
        const inv = inversaDefinidaPositiva(XtX);
        const Xty = X.map(c => { let s = 0; for (let i = 0; i < n; i++) s += /** @type {number} */ (c[i]) * /** @type {number} */ (y[i]); return s; });
        V = inv ? inv : XtX.map((f, j) => f.map((_, b) => (j === b ? 1 / Math.max(/** @type {number} */ (f[j]), CRESTA) : 0)));
        beta = V.map(f => { let s = 0; for (let b = 0; b < p; b++) s += /** @type {number} */ (f[b]) * /** @type {number} */ (Xty[b]); return s; });
        sce = 0;
        for (let i = 0; i < n; i++) { let yh = 0; for (let b = 0; b < p; b++) yh += /** @type {number} */ (beta[b]) * /** @type {number} */ (/** @type {ArrayLike<number>} */ (X[b])[i]); const e = /** @type {number} */ (y[i]) - yh; sce += e * e; }
    }
    const gl = Math.max(n - p, 1), sigma = Math.sqrt(sce / chiCuadradoAleatoria(gl, u, normal));
    const L = cholesky(V) || choleskyForzado(V).L;
    const z = Array.from({ length: p }, () => normal());
    const betaSorteada = Array.from({ length: p }, (_, i) => { let s = 0; for (let j = 0; j <= i; j++) s += /** @type {number} */ (/** @type {ArrayLike<number>} */ (L[i])[j]) * /** @type {number} */ (z[j]); return /** @type {number} */ (beta[i]) + sigma * s; });
    return { beta, betaSorteada, sigma };
}

/** La predicción de una regresión en unos casos. @param {ArrayLike<number>} b @param {Float64Array[]} columnas @param {number} n */
function predecir(b, columnas, n) {
    const yh = new Float64Array(n).fill(/** @type {number} */ (b[0]));
    columnas.forEach((c, j) => { const bj = /** @type {number} */ (b[j + 1]); for (let i = 0; i < n; i++) yh[i] += bj * /** @type {number} */ (c[i]); });
    return yh;
}

/**
 * El emparejamiento: para cada predicción de un perdido, los `donantes` observados con la predicción más cercana, y el valor
 * observado de uno de ellos al azar.
 * @param {Float64Array} yhatObs
 * @param {Float64Array} yObs
 * @param {Float64Array} yhatMis
 * @param {number} donantes
 * @param {(n: number) => number} entero
 * @returns {Float64Array}
 */
export function emparejar(yhatObs, yObs, yhatMis, donantes, entero) {
    const nObs = yhatObs.length, d = Math.min(donantes, nObs);
    // (2027.01.20, revisión) los empates de la predicción, en un orden al azar, como mice::matchindex («shuffle records to
    // remove effects of ties»): se baraja y después se ordena de forma estable. Antes, el número de fila deshacía los empates y,
    // con un predictor discreto (un ítem Likert), los donantes eran siempre los primeros o los últimos del bloque: 10 de 33 a
    // 52 posibles en 20 imputaciones, la varianza entre imputaciones subestimada y, con una base ordenada, un sesgo
    const orden = Array.from({ length: nObs }, (_, i) => i);
    for (let i = nObs - 1; i > 0; i--) { const j = entero(i + 1), t = /** @type {number} */ (orden[i]); orden[i] = /** @type {number} */ (orden[j]); orden[j] = t; }
    orden.sort((a, b) => /** @type {number} */ (yhatObs[a]) - /** @type {number} */ (yhatObs[b]));
    const ordenados = Float64Array.from(orden, i => /** @type {number} */ (yhatObs[i]));
    const salida = new Float64Array(yhatMis.length), vecinos = new Array(d);
    for (let r = 0; r < yhatMis.length; r++) {
        const v = /** @type {number} */ (yhatMis[r]);
        let hi = cotaInferior(ordenados, v), lo = hi - 1, t = 0;
        while (t < d) {
            if (lo < 0) vecinos[t++] = hi++;
            else if (hi >= nObs) vecinos[t++] = lo--;
            else if (v - /** @type {number} */ (ordenados[lo]) <= /** @type {number} */ (ordenados[hi]) - v) vecinos[t++] = lo--;
            else vecinos[t++] = hi++;
        }
        salida[r] = /** @type {number} */ (yObs[/** @type {number} */ (orden[vecinos[entero(d)]])]);
    }
    return salida;
}

/**
 * La imputación múltiple por PMM.
 * @param {Columnas} X las k variables (NaN: perdido); todas entran como predictoras de las demás
 * @param {{ m?: number, iteraciones?: number, donantes?: number, semilla?: number, cadenas?: number[] | null, metodo?: 'pmm' | 'norm',
 *   alProgreso?: ((hechas: number, total: number) => void) | null }} [opciones] cadenas: cuáles calcular (por defecto, las m);
 *   metodo: 'pmm' (el de mice por defecto) o 'norm' (la predicción con β* más un residuo normal sorteado: el «norm» de mice,
 *   que puede dar valores imposibles, pero no sufre cuando los perdidos están en una cola sin donantes cerca)
 * @returns {{ imputaciones: { cadena: number, columnas: Float64Array[] }[], imputadas: number[], traza: number[][][], m: number,
 *   iteraciones: number, donantes: number, semilla: number }} imputadas: las variables con perdidos; traza[cadena][iteración][v]:
 *   la media de los valores imputados de la variable imputadas[v] (para ver la convergencia de las cadenas)
 */
export function imputarPMM(X, { m = 20, iteraciones = 10, donantes = DONANTES, semilla = 2027, cadenas = null, metodo = 'pmm', alProgreso = null } = {}) {
    const k = X.length, n = k ? /** @type {ArrayLike<number>} */ (X[0]).length : 0;
    const perdidos = X.map(c => { const f = []; for (let i = 0; i < n; i++) if (!Number.isFinite(c[i])) f.push(i); return f; });
    const observados = X.map(c => { const f = []; for (let i = 0; i < n; i++) if (Number.isFinite(c[i])) f.push(i); return f; });
    const imputadas = perdidos.flatMap((f, j) => (f.length ? [j] : []));
    for (const j of imputadas) if (/** @type {number[]} */ (observados[j]).length < 2) throw new Error(`La variable ${j + 1} tiene menos de dos valores observados: no se puede imputar`);
    const lista = cadenas || Array.from({ length: m }, (_, l) => l);
    const total = lista.length * iteraciones;
    /** @type {{ cadena: number, columnas: Float64Array[] }[]} */ const imputaciones = [];
    /** @type {number[][][]} */ const traza = [];
    let hechas = 0;
    for (const l of lista) {
        const rng = sfc32(semillaCadena(semilla, l)), u = rng.siguiente, normal = generadorNormales(u);
        const cols = X.map(c => Float64Array.from(c));
        for (const j of imputadas) {
            const obs = /** @type {number[]} */ (observados[j]), col = /** @type {Float64Array} */ (cols[j]);
            for (const i of /** @type {number[]} */ (perdidos[j])) col[i] = /** @type {number} */ (col[/** @type {number} */ (obs[rng.entero(obs.length)])]);
        }
        /** @type {number[][]} */ const trazaCadena = [];
        for (let it = 0; it < iteraciones; it++) {
            for (const j of imputadas) {
                const filasObs = /** @type {number[]} */ (observados[j]), filasMis = /** @type {number[]} */ (perdidos[j]), col = /** @type {Float64Array} */ (cols[j]);
                const otras = cols.filter((_, t) => t !== j);
                const yObs = Float64Array.from(filasObs, i => /** @type {number} */ (col[i]));
                const predObs = otras.map(c => Float64Array.from(filasObs, i => /** @type {number} */ (c[i])));
                const predMis = otras.map(c => Float64Array.from(filasMis, i => /** @type {number} */ (c[i])));
                const { beta, betaSorteada, sigma } = regresionSorteada(yObs, predObs, u, normal);
                const yhatMis = predecir(betaSorteada, predMis, filasMis.length);
                const valores = metodo === 'norm' ? yhatMis.map(v => v + sigma * normal()) : emparejar(predecir(beta, predObs, filasObs.length), yObs, yhatMis, donantes, rng.entero);
                filasMis.forEach((i, r) => { col[i] = /** @type {number} */ (valores[r]); });
            }
            trazaCadena.push(imputadas.map(j => media(/** @type {number[]} */ (perdidos[j]).map(i => /** @type {number} */ (/** @type {Float64Array} */ (cols[j])[i])))));
            hechas++;
            if (alProgreso) alProgreso(hechas, total);
        }
        imputaciones.push({ cadena: l, columnas: cols });
        traza.push(trazaCadena);
    }
    return { imputaciones, imputadas, traza, m: lista.length, iteraciones, donantes, semilla };
}

/**
 * La media de una variable combinada por las reglas de Rubin (U = s²/n, gl de los completos n − 1).
 * @param {{ columnas: ArrayLike<number>[] }[]} imputaciones
 * @param {number} j
 * @param {{ nivel?: number }} [opciones]
 */
export function mediaCombinada(imputaciones, j, { nivel = 0.95 } = {}) {
    const n = /** @type {ArrayLike<number>} */ (/** @type {{ columnas: ArrayLike<number>[] }} */ (imputaciones[0]).columnas[j]).length;
    const Q = imputaciones.map(I => media(/** @type {ArrayLike<number>} */ (I.columnas[j])));
    const U = imputaciones.map(I => varianza(/** @type {ArrayLike<number>} */ (I.columnas[j])) / n);
    const de = media(imputaciones.map(I => Math.sqrt(varianza(/** @type {ArrayLike<number>} */ (I.columnas[j])))));
    return { ...reglasRubin(Q, U, { glCompletos: n - 1, nivel }), de };
}

/**
 * La correlación de Pearson de dos variables combinada en la escala z de Fisher (U = 1/(n − 3)) y devuelta a r (con su
 * intervalo); la p, la de la prueba de r = 0 en esa escala.
 * @param {{ columnas: ArrayLike<number>[] }[]} imputaciones
 * @param {number} a
 * @param {number} b
 * @param {{ nivel?: number }} [opciones]
 */
export function correlacionCombinada(imputaciones, a, b, { nivel = 0.95 } = {}) {
    const n = /** @type {ArrayLike<number>} */ (/** @type {{ columnas: ArrayLike<number>[] }} */ (imputaciones[0]).columnas[a]).length;
    const Q = imputaciones.map(I => Math.atanh(correlacion(/** @type {ArrayLike<number>} */ (I.columnas[a]), /** @type {ArrayLike<number>} */ (I.columnas[b]))));
    const R = reglasRubin(Q, Q.map(() => 1 / (n - 3)), { nivel });
    return { r: Math.tanh(R.estimacion), inferior: Math.tanh(R.inferior), superior: Math.tanh(R.superior), pValor: R.pValor, fmi: R.fmi, gl: R.gl };
}
