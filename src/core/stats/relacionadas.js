// @ts-check
// core/stats/relacionadas.js — (2027.01.17) las pruebas para muestras relacionadas: las mismas personas medidas dos o más
// veces (antes y después, varias ondas) o en dos o más condiciones. Hasta la 2027.01.16 el Simulador generaba pre-post y
// ondas, pero el Analizador no podía analizarlas.
//   · dos medidas: la t de Student para muestras relacionadas (con la dz) y la prueba de los rangos con signo de Wilcoxon
//     (con la correlación biserial de rangos de Kerby, 2014);
//   · tres o más: el ANOVA de medidas repetidas, con la prueba de esfericidad de Mauchly y las correcciones de
//     Greenhouse-Geisser y Huynh-Feldt (con la de Lecoutre, 1991), y la prueba de Friedman (con la W de Kendall);
//   · medidas dicotómicas: McNemar (dos, por la binomial exacta) y la Q de Cochran (tres o más);
//   · un factor entre sujetos y uno de medidas repetidas: el ANOVA mixto, por el modelo lineal sobre los contrastes
//     ortonormales de las medidas (sumas de cuadrados de tipo III, las de SPSS), con la M de Box;
//   · y las comparaciones por pares de cada prueba global, con su mismo modelo de error.
// Los cálculos son los de las fórmulas: los casos degenerados (sin variación) los resuelve cada función como se dice.
import { suma, media, desviacion, varianza, matrizCovarianzas } from './descriptivos.js';
import { rangosPromedio } from './orden.js';
import { pTBilateral, colaSuperiorF, pChiCuadrado, cuantilT } from './distribuciones.js';
import { colaSuperiorNormal } from './normal.js';
import { betaRegularizada } from './especiales.js';
import { raizBrent } from './optimizacion.js';
import { logDeterminante } from '../linalg/cholesky.js';
import { inversaGeneral } from '../linalg/gauss.js';
import { multiplicar, traspuesta } from '../linalg/matrices.js';
import { ajustarHolm } from './multiples.js';
import { levene } from './contrastes.js';

/** @typedef {ArrayLike<number>} Serie */

/**
 * Las k − 1 columnas de unos contrastes ortonormales de k medidas (los de Helmert normalizados): ortogonales entre sí y a la
 * constante. Las pruebas que dependen de ellos (Mauchly, ε) no dependen de cuáles se elijan.
 * @param {number} k
 * @returns {number[][]} k filas × (k − 1) columnas
 */
export function contrastesOrtonormales(k) {
    const C = Array.from({ length: k }, () => new Array(k - 1).fill(0));
    for (let m = 1; m < k; m++) {
        const norma = Math.sqrt(m * (m + 1));
        for (let i = 0; i < m; i++) /** @type {number[]} */ (C[i])[m - 1] = 1 / norma;
        /** @type {number[]} */ (C[m])[m - 1] = -m / norma;
    }
    return C;
}

/** @param {number[][]} A @returns {number} */
const traza = A => A.reduce((s, f, i) => s + /** @type {number} */ (f[i]), 0);

/**
 * (2027.01.20, revisión) El ruido de redondeo de una suma de cuadrados de residuos de unos datos: la de n·k residuos de
 * 10⁻¹³ veces el mayor valor absoluto (unos cientos de ulps). Una SC del error por debajo es 0: los datos no tienen error
 * (todas las personas cambian exactamente lo mismo), y el redondeo daba una F de 10¹⁶ cuya no centralidad colgaba la página.
 * @param {ArrayLike<number>[]} Y
 */
export function ruidoSC(Y) {
    let escala = 0, cuantos = 0;
    for (const f of Y) for (let j = 0; j < f.length; j++) { const a = Math.abs(/** @type {number} */ (f[j])); if (a > escala) escala = a; cuantos++; }
    return cuantos * (1e-13 * escala) ** 2;
}

/** (2027.01.20) Por debajo de qué W la matriz de los contrastes es singular (alguna diferencia no varía o depende de otras). */
const W_SINGULAR = 1e-12;

/**
 * La esfericidad de unos contrastes ortonormales, desde su matriz de sumas de cuadrados y productos del error E (p × p) con
 * glError grados de libertad (n − 1 en un diseño de un factor; N − g con g grupos): la W de Mauchly (1940) con su χ²
 * (gl = p(p + 1)/2 − 1), y las ε de Greenhouse-Geisser (1959), de Huynh-Feldt (1976) con la corrección de Lecoutre (1991),
 * ε̃ = ((N − g + 1)·p·ε̂ − 2)/(p·(N − g − p·ε̂)) sin pasar de 1 (la de car y afex de R; SPSS usa la original de Huynh y
 * Feldt, con N en lugar de N − g + 1, que con dos o más grupos sobrestima ε; con un solo grupo son la misma), y el límite
 * inferior 1/p. Con menos casos que contrastes (glError < p) la matriz es singular: W = 0 y su χ², indefinida (NaN), como
 * la ε̃ cuando su fórmula no da un número entre 0 y 1 (pocos casos). (2027.01.20, revisión) Con casos de sobra pero una
 * matriz singular (alguna diferencia entre medidas no varía o es combinación exacta de otras: W < 10⁻¹², el redondeo de 0),
 * W = 0, χ² = ∞ y p = 0, con `singular` (antes, la χ² del redondeo, «χ²(2) = 698.95»). Con p = 1 (dos medidas) la
 * esfericidad se cumple siempre: null.
 * @param {number[][]} E
 * @param {number} glError
 * @param {number} N
 * @param {number} g
 * @returns {{ W: number, chi2: number, gl: number, pValor: number, gg: number, hf: number, lb: number, singular: boolean } | null}
 */
export function esfericidad(E, glError, N, g) {
    const p = E.length;
    if (p < 2) return null;
    const S = E.map(f => f.map(x => x / glError));
    const trS = traza(S), trS2 = traza(multiplicar(S, S));
    const gg = trS * trS / (p * trS2);
    const numHF = (N - g + 1) * p * gg - 2, denHF = p * (N - g - p * gg), hf = numHF > 0 && denHF > 0 ? Math.min(1, numHF / denHF) : NaN;
    const ld = glError >= p ? logDeterminante(S) : null;
    const bruto = ld === null ? 0 : Math.exp(ld - p * Math.log(trS / p));
    const singular = ld !== null && !(bruto >= W_SINGULAR), W = singular ? 0 : bruto;
    const gl = p * (p + 1) / 2 - 1;
    const chi2 = singular ? Infinity : W > 0 ? -(glError - (2 * p * p + p + 2) / (6 * p)) * Math.log(W) : NaN;
    return { W, chi2, gl, pValor: chi2 === Infinity ? 0 : Number.isFinite(chi2) ? pChiCuadrado(Math.max(0, chi2), gl) : NaN, gg, hf, lb: 1 / p, singular };
}

/**
 * La t de Student para dos muestras relacionadas: sobre las diferencias x − y, su media, su desviación típica, el intervalo de
 * la media y la dz (la media de las diferencias entre su DE). Sin variación en las diferencias: t = 0 con p = 1 si su media
 * es 0, y ±∞ con p = 0 si no.
 * @param {Serie} x
 * @param {Serie} y
 * @param {{ nivel?: number }} [opciones]
 */
export function tPareada(x, y, { nivel = 0.95 } = {}) {
    const n = x.length, d = Float64Array.from({ length: n }, (_, i) => /** @type {number} */ (x[i]) - /** @type {number} */ (y[i]));
    // (2027.01.20, revisión) una DE de las diferencias del orden del redondeo es 0 (todas cambian lo mismo): antes daba una t de
    // 10¹⁵ (dz = 7468375084986164) y su intervalo colgaba la página
    const md = media(d), bruta = desviacion(d), sd = bruta * bruta * (n - 1) > ruidoSC([x, y]) ? bruta : 0, gl = n - 1, ee = sd / Math.sqrt(n);
    let t, dz;
    if (sd > 0) { t = md / ee; dz = md / sd; }
    else { t = md === 0 ? 0 : (md > 0 ? Infinity : -Infinity); dz = t; }
    const pValor = Number.isFinite(t) ? pTBilateral(Math.abs(t), gl) : 0;
    const tc = cuantilT(1 - (1 - nivel) / 2, gl);
    return { n, mediaDiferencia: md, deDiferencia: sd, ee, t, gl, pValor, ic: /** @type {[number, number]} */ ([md - tc * ee, md + tc * ee]), dz, nivel };
}

/**
 * La prueba de los rangos con signo de Wilcoxon (1945) para dos muestras relacionadas, la de SPSS: sin las diferencias nulas,
 * con los rangos promedio de |x − y|, por la aproximación normal con la corrección de empates y sin corrección por
 * continuidad: z = (T − μ)/σ ≤ 0 con T = mín(T₊, T₋). El tamaño del efecto, la correlación biserial de rangos para muestras
 * relacionadas, r = (T₊ − T₋)/(T₊ + T₋) (Kerby, 2014), de −1 a 1 (positiva si x tiende a ser mayor que y).
 * @param {Serie} x
 * @param {Serie} y
 */
export function wilcoxon(x, y) {
    /** @type {number[]} */ const d = [];
    let empates = 0;
    for (let i = 0; i < x.length; i++) { const v = /** @type {number} */ (x[i]) - /** @type {number} */ (y[i]); if (v === 0) empates++; else d.push(v); }
    const n = d.length;
    if (n === 0) return { n, positivos: 0, negativos: 0, empates, Tmas: 0, Tmenos: 0, T: 0, z: 0, pValor: 1, rbc: 0 };
    const rangos = rangosPromedio(d.map(Math.abs));
    let Tmas = 0, Tmenos = 0, positivos = 0;
    d.forEach((v, i) => { if (v > 0) { Tmas += /** @type {number} */ (rangos[i]); positivos++; } else Tmenos += /** @type {number} */ (rangos[i]); });
    /** @type {Map<number, number>} */ const conteo = new Map();
    d.forEach(v => { const a = Math.abs(v); conteo.set(a, (conteo.get(a) || 0) + 1); });
    let corr = 0; conteo.forEach(t => { if (t > 1) corr += t * t * t - t; });
    const mu = n * (n + 1) / 4, sigma2 = n * (n + 1) * (2 * n + 1) / 24 - corr / 48, T = Math.min(Tmas, Tmenos);
    const z = sigma2 > 0 ? (T - mu) / Math.sqrt(sigma2) : 0;
    return { n, positivos, negativos: n - positivos, empates, Tmas, Tmenos, T, z, pValor: Math.min(1, 2 * colaSuperiorNormal(Math.abs(z))), rbc: (Tmas - Tmenos) / (n * (n + 1) / 2) };
}

/**
 * La media de cada columna de una matriz de casos × medidas.
 * @param {number[][]} Y
 * @returns {number[]}
 */
const mediasDeColumnas = Y => Array.from({ length: /** @type {number[]} */ (Y[0]).length }, (_, j) => media(Y.map(f => /** @type {number} */ (f[j]))));

/**
 * El ANOVA de un factor de medidas repetidas (n casos × k medidas, sin perdidos): SC de las medidas, de los sujetos y del
 * error, F con gl (k − 1, (n − 1)(k − 1)), la esfericidad (con k ≥ 3) y los p con cada corrección; η² parcial y η²
 * generalizada (Olejnik y Algina, 2003; Bakeman, 2005), SC_medidas/(SC_medidas + SC_sujetos + SC_error), la que conviene
 * comparar entre diseños. Sin error (SC_error = 0): F = ∞ con p = 0 si las medias difieren, y F = 0 con p = 1 si no.
 * @param {number[][]} Y
 */
export function anovaMedidasRepetidas(Y) {
    const n = Y.length, k = /** @type {number[]} */ (Y[0]).length, p = k - 1;
    const mCol = mediasDeColumnas(Y), mFila = Y.map(f => media(f)), mTotal = media(mCol);
    let scMedidas = 0, scSujetos = 0, scTotal = 0;
    for (const m of mCol) scMedidas += n * (m - mTotal) ** 2;
    for (const m of mFila) scSujetos += k * (m - mTotal) ** 2;
    for (const f of Y) for (const y of f) scTotal += (y - mTotal) ** 2;
    // (2027.01.20, revisión) la SC del error, de los residuos (no por diferencia: la resta deja el redondeo de la SC total), y
    // 0 si es la del redondeo; sin error, la esfericidad no se puede contrastar ni hace falta (null)
    let scError = 0;
    Y.forEach((f, i) => f.forEach((y, j) => { scError += (y - /** @type {number} */ (mFila[i]) - /** @type {number} */ (mCol[j]) + mTotal) ** 2; }));
    if (scError <= ruidoSC(Y)) scError = 0;
    const gl1 = p, gl2 = p * (n - 1);
    const F = scError > 0 ? (scMedidas / gl1) / (scError / gl2) : (scMedidas > 0 ? Infinity : 0);
    const pDe = (/** @type {number} */ e) => (Number.isFinite(F) ? (F > 0 ? colaSuperiorF(F, gl1 * e, gl2 * e) : 1) : 0);
    const C = contrastesOrtonormales(k), Z = multiplicar(Y, C), mZ = mediasDeColumnas(Z);
    const R = Z.map(f => f.map((z, m) => z - /** @type {number} */ (mZ[m])));
    const esf = k >= 3 && scError > 0 ? esfericidad(multiplicar(traspuesta(R), R), n - 1, n, 1) : null;
    const correcciones = esf ? Object.fromEntries(/** @type {const} */ (['gg', 'hf', 'lb']).map(c => [c, { epsilon: esf[c], gl1: gl1 * esf[c], gl2: gl2 * esf[c], pValor: pDe(esf[c]) }])) : null;
    return {
        n, k, medias: mCol, sc: { medidas: scMedidas, sujetos: scSujetos, error: scError, total: scTotal },
        gl1, gl2, F, pValor: pDe(1), esfericidad: esf, correcciones,
        eta2p: scMedidas + scError > 0 ? scMedidas / (scMedidas + scError) : 0,
        eta2G: scTotal > 0 ? scMedidas / (scMedidas + scSujetos + scError) : 0
    };
}

/**
 * La prueba de Friedman (1937) de k medidas relacionadas: los rangos dentro de cada caso (promedio en los empates), con la
 * corrección de empates (la de SPSS, R y SciPy), χ² con k − 1 gl; y la W de Kendall, χ²/(n(k − 1)). Con todos los casos
 * empatados en todas sus medidas, χ² = 0 y p = 1.
 * @param {number[][]} Y
 */
export function friedman(Y) {
    const n = Y.length, k = /** @type {number[]} */ (Y[0]).length;
    const R = new Array(k).fill(0);
    let corr = 0;
    for (const f of Y) {
        const r = rangosPromedio(f);
        for (let j = 0; j < k; j++) R[j] += /** @type {number} */ (r[j]);
        /** @type {Map<number, number>} */ const conteo = new Map();
        f.forEach(v => conteo.set(v, (conteo.get(v) || 0) + 1));
        conteo.forEach(t => { if (t > 1) corr += t * t * t - t; });
    }
    const den = 1 - corr / (n * k * (k * k - 1));
    let sR2 = 0; for (const r of R) sR2 += r * r;
    const bruto = 12 / (n * k * (k + 1)) * sR2 - 3 * n * (k + 1);
    const chi2 = den > 1e-12 ? Math.max(0, bruto / den) : 0, gl = k - 1;
    return { n, k, chi2, gl, pValor: chi2 > 0 ? pChiCuadrado(chi2, gl) : 1, W: chi2 / (n * (k - 1)), rangosMedios: R.map(r => r / n) };
}

/**
 * P(X ≤ k) de una binomial(m, ½): I_½(m − k, k + 1).
 * @param {number} k
 * @param {number} m
 */
const binomialMitadHasta = (k, m) => (k >= m ? 1 : betaRegularizada(0.5, m - k, k + 1));

/**
 * El cuantil de una beta(a, b) (para los límites exactos de Clopper-Pearson): Brent sobre la beta incompleta regularizada.
 * @param {number} q
 * @param {number} a
 * @param {number} b
 */
function cuantilBeta(q, a, b) {
    const r = raizBrent(x => betaRegularizada(x, a, b) - q, 0, 1, 1e-14);
    return r ? r.x : NaN;
}

/**
 * McNemar (1947) para dos medidas dicotómicas de las mismas personas (0/1): solo cuentan los que cambian, b (1 → 0) y c (0 → 1).
 * El p, por la binomial exacta, min(1, 2·P(X ≤ mín(b, c))) con X ~ B(b + c, ½) (la de SPSS con dos categorías; vale con
 * cualquier n); y, como referencia, la χ² con la corrección por continuidad de Edwards, (|b − c| − 1)²/(b + c). El tamaño del
 * efecto: la razón de odds condicional b/c con su intervalo exacto (Clopper-Pearson de b/(b + c)) y la g de Cohen,
 * |b/(b + c) − ½|.
 * @param {Serie} a la primera medida (0/1)
 * @param {Serie} b la segunda (0/1)
 * @param {{ nivel?: number }} [opciones]
 */
export function mcnemar(a, b, { nivel = 0.95 } = {}) {
    let n11 = 0, n10 = 0, n01 = 0, n00 = 0;
    for (let i = 0; i < a.length; i++) {
        const x = a[i], y = b[i];
        if (x === 1 && y === 1) n11++; else if (x === 1) n10++; else if (y === 1) n01++; else n00++;
    }
    const m = n10 + n01, menor = Math.min(n10, n01);
    const pValor = m === 0 ? 1 : Math.min(1, 2 * binomialMitadHasta(menor, m));
    const chi2 = m > 0 ? Math.max(0, Math.abs(n10 - n01) - 1) ** 2 / m : 0;
    const al = (1 - nivel) / 2;
    const piInf = n10 === 0 ? 0 : cuantilBeta(al, n10, n01 + 1), piSup = n01 === 0 ? 1 : cuantilBeta(1 - al, n10 + 1, n01);
    const odds = (/** @type {number} */ q) => (q >= 1 ? Infinity : q / (1 - q));
    return {
        n: a.length, n11, n10, n01, n00, discordantes: m, pValor, chi2, pChi2: m > 0 ? pChiCuadrado(chi2, 1) : 1,
        oddsRatio: n01 > 0 ? n10 / n01 : (n10 > 0 ? Infinity : NaN), icOddsRatio: /** @type {[number, number]} */ ([odds(piInf), odds(piSup)]),
        gCohen: m > 0 ? Math.abs(n10 / m - 0.5) : 0, nivel
    };
}

/**
 * La Q de Cochran (1950) de k medidas dicotómicas de las mismas personas (0/1): Q = (k − 1)(k·ΣCⱼ² − N²)/(k·N − ΣRᵢ²), con
 * k − 1 gl (Cⱼ: los 1 de cada medida; Rᵢ: los de cada caso; N: todos). Sin casos que varíen, Q = 0 y p = 1. La proporción de
 * cada medida y un tamaño del efecto, η²_Q = Q/(n(k − 1)) (Serlin, Carr y Marascuilo, 1982).
 * @param {number[][]} Y
 */
export function cochranQ(Y) {
    const n = Y.length, k = /** @type {number[]} */ (Y[0]).length;
    const C = new Array(k).fill(0);
    let N = 0, sR2 = 0;
    for (const f of Y) { let r = 0; f.forEach((v, j) => { C[j] += v; r += v; }); N += r; sR2 += r * r; }
    let sC2 = 0; for (const c of C) sC2 += c * c;
    const den = k * N - sR2, Q = den > 0 ? (k - 1) * (k * sC2 - N * N) / den : 0, gl = k - 1;
    return { n, k, Q, gl, pValor: Q > 0 ? pChiCuadrado(Q, gl) : 1, proporciones: C.map(c => c / n), eta2Q: Q / (n * (k - 1)), denominador: den };
}

/** @typedef {'tpareada' | 'wilcoxon' | 'mcnemar' | 'friedman' | 'cochran'} MetodoPares */

/**
 * Las comparaciones por pares de k medidas relacionadas, con el p bilateral sin ajustar (Holm, después). Las tres primeras
 * son la prueba de dos medidas aplicada a cada par, y no dependen de las demás medidas: 'tpareada' (la t de cada par, con la
 * DE de sus diferencias: la que recomiendan Maxwell y Delaney, 2004, porque no supone la esfericidad), 'wilcoxon' y
 * 'mcnemar' (por la binomial exacta; estadístico: la diferencia de proporciones). Las otras dos usan los rangos medios o las
 * proporciones de la prueba global, como SPSS, y por eso cambian si se añade o se quita otra medida (Benavoli, Corani y
 * Mangili, 2016): 'friedman', z = (R̄ⱼ − R̄ᵢ)/√(k(k + 1)/(6n)), y 'cochran', z = (pⱼ − pᵢ)/√(2(k·N − ΣRᵢ²)/(n²·k·(k − 1))).
 * Cada par (i, j), en el orden (0, 1), (0, 2), …, (1, 2), …, es el cambio de la medida i a la j: los estadísticos con signo
 * y el efecto de cada par (la dz, la biserial de rangos o la diferencia de proporciones) son positivos si la j es mayor (la
 * z de Wilcoxon, como la de SPSS y SciPy, es la de la menor de las dos sumas de rangos: siempre ≤ 0).
 * @param {number[][]} Y
 * @param {MetodoPares} metodo
 * @returns {{ i: number, j: number, estadistico: number, gl: number | null, pValor: number, efecto: number }[]}
 */
export function comparacionesRelacionadas(Y, metodo) {
    const n = Y.length, k = /** @type {number[]} */ (Y[0]).length, col = (/** @type {number} */ j) => Y.map(f => /** @type {number} */ (f[j]));
    /** @type {{ i: number, j: number, estadistico: number, gl: number | null, pValor: number, efecto: number }[]} */ const pares = [];
    const fr = metodo === 'friedman' ? friedman(Y) : null, co = metodo === 'cochran' ? cochranQ(Y) : null;
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
        if (metodo === 'tpareada') { const r = tPareada(col(j), col(i)); pares.push({ i, j, estadistico: r.t, gl: r.gl, pValor: r.pValor, efecto: r.dz }); }
        else if (metodo === 'wilcoxon') { const r = wilcoxon(col(j), col(i)); pares.push({ i, j, estadistico: r.z, gl: null, pValor: r.pValor, efecto: r.rbc }); }
        else if (metodo === 'mcnemar') { const r = mcnemar(col(j), col(i)), dif = (r.n10 - r.n01) / n; pares.push({ i, j, estadistico: dif, gl: null, pValor: r.pValor, efecto: dif }); }
        else if (fr) {
            const ee = Math.sqrt(k * (k + 1) / (6 * n)), z = (/** @type {number} */ (fr.rangosMedios[j]) - /** @type {number} */ (fr.rangosMedios[i])) / ee;
            pares.push({ i, j, estadistico: z, gl: null, pValor: Math.min(1, 2 * colaSuperiorNormal(Math.abs(z))), efecto: NaN });
        } else if (co) {
            const ee = Math.sqrt(2 * co.denominador / (n * n * k * (k - 1)));
            const dif = /** @type {number} */ (co.proporciones[j]) - /** @type {number} */ (co.proporciones[i]), z = ee > 0 ? dif / ee : 0;
            pares.push({ i, j, estadistico: z, gl: null, pValor: Math.min(1, 2 * colaSuperiorNormal(Math.abs(z))), efecto: dif });
        }
    }
    return pares;
}

/**
 * Las comparaciones por pares con la corrección de Holm.
 * @param {number[][]} Y
 * @param {MetodoPares} metodo
 * @param {{ alfa?: number }} [opciones]
 */
export function paresRelacionadosHolm(Y, metodo, { alfa = 0.05 } = {}) {
    const pares = comparacionesRelacionadas(Y, metodo), holm = ajustarHolm(pares.map(p => p.pValor));
    return pares.map((p, a) => { const pHolm = /** @type {number} */ (holm[a]); return { ...p, pHolm, significativa: pHolm < alfa }; });
}

/**
 * La M de Box (1949) de la igualdad de las matrices de covarianzas de k medidas entre g grupos, con su aproximación F (la que
 * da SPSS) y la χ². Necesita más casos que medidas en cada grupo: si no, null.
 * @param {number[][][]} porGrupo los casos de cada grupo (n_g × k)
 */
export function mBox(porGrupo) {
    const g = porGrupo.length, k = /** @type {number[]} */ (/** @type {number[][]} */ (porGrupo[0])[0]).length;
    if (g < 2 || porGrupo.some(Y => Y.length <= k)) return null;
    const cols = (/** @type {number[][]} */ Y) => Array.from({ length: k }, (_, j) => Y.map(f => /** @type {number} */ (f[j])));
    const S = porGrupo.map(Y => matrizCovarianzas(cols(Y))), ns = porGrupo.map(Y => Y.length), N = suma(ns);
    const Sp = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => S.reduce((s, Sg, a) => s + (/** @type {number} */ (ns[a]) - 1) * /** @type {number} */ (/** @type {number[]} */ (Sg[i])[j]), 0) / (N - g)));
    const lds = S.map(Sg => logDeterminante(Sg)), ldp = logDeterminante(Sp);
    if (ldp === null || lds.some(l => l === null)) return null;
    let M = (N - g) * ldp;
    lds.forEach((l, a) => { M -= (/** @type {number} */ (ns[a]) - 1) * /** @type {number} */ (l); });
    const s1 = ns.reduce((s, x) => s + 1 / (x - 1), 0), s2 = ns.reduce((s, x) => s + 1 / ((x - 1) ** 2), 0);
    const c1 = (s1 - 1 / (N - g)) * (2 * k * k + 3 * k - 1) / (6 * (k + 1) * (g - 1));
    const c2 = (s2 - 1 / ((N - g) ** 2)) * (k - 1) * (k + 2) / (6 * (g - 1));
    const gl1 = k * (k + 1) * (g - 1) / 2, chi2 = M * (1 - c1);
    let F, gl2;
    if (c2 - c1 * c1 > 0) { gl2 = (gl1 + 2) / (c2 - c1 * c1); const b = gl1 / (1 - c1 - gl1 / gl2); F = M / b; }
    else { gl2 = (gl1 + 2) / (c1 * c1 - c2); const b = gl2 / (1 - c1 + 2 / gl2); F = gl2 * M / (gl1 * (b - M)); }
    return { M, F, gl1, gl2, pValor: F > 0 ? colaSuperiorF(F, gl1, gl2) : 1, chi2, pChi2: chi2 > 0 ? pChiCuadrado(chi2, gl1) : 1 };
}

/**
 * El ANOVA mixto de un factor entre sujetos (g grupos) y uno de medidas repetidas (k medidas), por el modelo lineal general
 * sobre la suma de las medidas (entre sujetos) y sobre sus contrastes ortonormales (intra sujetos), con la codificación de
 * efectos: sumas de cuadrados de tipo III (las de SPSS), que con grupos de distinto tamaño dan a cada grupo el mismo peso en
 * el efecto de las medidas. Entre sujetos: el grupo contra los sujetos dentro de los grupos. Intra: las medidas y la
 * interacción contra el error, con la esfericidad (sobre el error conjunto de los grupos) y sus correcciones. η² parcial y
 * η² generalizada (Olejnik y Algina, 2003; el factor entre sujetos se toma como manipulado, como ezANOVA por defecto).
 * También Levene en cada medida y la M de Box.
 * @param {number[][]} Y n casos × k medidas, sin perdidos
 * @param {number[]} grupos el grupo de cada caso, de 0 a g − 1
 */
export function anovaMixta(Y, grupos) {
    const N = Y.length, k = /** @type {number[]} */ (Y[0]).length, p = k - 1, g = Math.max(...grupos) + 1;
    // diseño con codificación de efectos: [1, e₁ … e_{g−1}] (el último grupo, −1 en todas)
    const X = grupos.map(gr => [1, ...Array.from({ length: g - 1 }, (_, j) => (gr === j ? 1 : (gr === g - 1 ? -1 : 0)))]);
    const Xt = traspuesta(X), XtXi = inversaGeneral(multiplicar(Xt, X));
    if (!XtXi) throw new Error('El ANOVA mixto necesita casos en todos los grupos.');
    /** @param {number[][]} Z */
    const ajuste = Z => { const B = multiplicar(XtXi, multiplicar(Xt, Z)), Ajust = multiplicar(X, B); return { B, R: Z.map((f, i) => f.map((z, m) => z - /** @type {number} */ (/** @type {number[]} */ (Ajust[i])[m]))) }; };
    // entre sujetos: la suma de las medidas / √k (así su SC es k veces la de las medias de cada caso)
    const s = Y.map(f => [suma(f) / Math.sqrt(k)]);
    const entre = ajuste(s), mS = media(s.map(f => /** @type {number} */ (f[0])));
    let scTotalEntre = 0; for (const f of s) scTotalEntre += (/** @type {number} */ (f[0]) - mS) ** 2;
    let scSujetosEnGrupos = 0; for (const f of entre.R) scSujetosEnGrupos += /** @type {number} */ (f[0]) ** 2;
    const scGrupo = scTotalEntre - scSujetosEnGrupos;
    // intra sujetos: los contrastes ortonormales
    const C = contrastesOrtonormales(k), Z = multiplicar(Y, C), intra = ajuste(Z);
    const E = multiplicar(traspuesta(intra.R), intra.R), scErrorBruto = traza(E), scError = scErrorBruto > ruidoSC(Y) ? scErrorBruto : 0;   // (2027.01.20) sin el redondeo
    const b0 = /** @type {number[]} */ (intra.B[0]), c00 = /** @type {number} */ (/** @type {number[]} */ (XtXi[0])[0]);
    const scMedidas = b0.reduce((a, b) => a + b * b, 0) / c00;
    let scInteraccion = 0;
    if (g > 1) {
        const B1 = intra.B.slice(1), L = XtXi.slice(1).map(f => f.slice(1)), Li = inversaGeneral(L);
        if (Li) scInteraccion = traza(multiplicar(traspuesta(B1), multiplicar(Li, B1)));
    }
    const glG = g - 1, glSG = N - g, glM = p, glMG = p * (g - 1), glE = p * (N - g);
    const F = (/** @type {number} */ sc, /** @type {number} */ gl, /** @type {number} */ scErr, /** @type {number} */ glErr) =>
        (scErr > 0 ? (sc / gl) / (scErr / glErr) : (sc > 0 ? Infinity : 0));
    const esf = k >= 3 && scError > 0 ? esfericidad(E, N - g, N, g) : null;
    const pF = (/** @type {number} */ f, /** @type {number} */ a, /** @type {number} */ b) => (Number.isFinite(f) ? (f > 0 ? colaSuperiorF(f, a, b) : 1) : 0);
    const efectoIntra = (/** @type {number} */ sc, /** @type {number} */ gl) => {
        const f = F(sc, gl, scError, glE);
        return {
            sc, gl1: gl, gl2: glE, F: f, pValor: pF(f, gl, glE),
            correcciones: esf ? Object.fromEntries(/** @type {const} */ (['gg', 'hf', 'lb']).map(c => [c, { epsilon: esf[c], gl1: gl * esf[c], gl2: glE * esf[c], pValor: pF(f, gl * esf[c], glE * esf[c]) }])) : null,
            eta2p: sc + scError > 0 ? sc / (sc + scError) : 0,
            eta2G: sc / (sc + scSujetosEnGrupos + scError)
        };
    };
    const fG = F(scGrupo, glG, scSujetosEnGrupos, glSG);
    // supuestos: Levene en cada medida y la M de Box
    const porGrupo = Array.from({ length: g }, (_, a) => Y.filter((_, i) => grupos[i] === a));
    const leveneMedidas = Array.from({ length: k }, (_, j) => levene(porGrupo.map(Yg => Yg.map(f => /** @type {number} */ (f[j])))));
    return {
        N, k, g, ns: porGrupo.map(Yg => Yg.length),
        grupo: { sc: scGrupo, gl1: glG, gl2: glSG, F: fG, pValor: pF(fG, glG, glSG), eta2p: scGrupo + scSujetosEnGrupos > 0 ? scGrupo / (scGrupo + scSujetosEnGrupos) : 0, eta2G: scGrupo / (scGrupo + scSujetosEnGrupos + scError) },
        medidas: efectoIntra(scMedidas, glM),
        interaccion: efectoIntra(scInteraccion, glMG),
        error: { sujetosEnGrupos: scSujetosEnGrupos, glSujetos: glSG, intra: scError, glIntra: glE },
        esfericidad: esf, leveneMedidas, box: mBox(porGrupo),
        medias: porGrupo.map(Yg => mediasDeColumnas(Yg)), des: porGrupo.map(Yg => Array.from({ length: k }, (_, j) => Math.sqrt(varianza(Yg.map(f => /** @type {number} */ (f[j]))))))
    };
}
