// @ts-check
// core/stats/mco.js — EL motor de mínimos cuadrados ordinarios del programa (2026.12.21): la regresión múltiple de la
// vista principal y su VIF, la regresión avanzada (con interacción, término cuadrático y bloques jerárquicos), el ANCOVA,
// la selección del mejor modelo de dos variables, la prueba de Breusch–Pagan y la recta del techo de la nube, los modelos
// de forma del diagnóstico de relaciones (ponderado), las confirmaciones de forma (dos rectas y Lind–Mehlum, con su (X'X)⁻¹
// para HC3) y la RESET del cribado. Hasta la 2026.12.20 había ocho copias: cuatro en analizador/regresion.js (la regresión,
// su VIF, el mejor modelo y la avanzada) que formaban X'X y la invertían por Gauss-Jordan con un pivote mínimo ABSOLUTO de
// 10⁻¹² (que depende de las unidades: con predictores grandes no detectaba la colinealidad, con un polinomio de un año daba
// un ajuste erróneo sin avisar), y cuatro por Cholesky de X'X con criterios relativos distintos (relaciones/util-numerico.js,
// confirmacion-forma.js y cribado-forma.js, 10⁻¹²; diagnostico-forma.js, 10⁻¹⁰). Ahora todas resuelven por la QR de
// Householder de X (core/linalg/qr.js) con los predictores centrados y un solo criterio de colinealidad (el número de lm de
// R, sobre la variación de cada predictor). Desde la 2026.12.22 también la logística y Poisson: cada paso de su IRLS es un
// ajuste ponderado de esta función (core/stats/mlg.js). (2026.12.25, cierre de la fase F6) También el Simulador: los
// coeficientes estandarizados de su informe y la residualización con que hace sus variables ortogonales a los códigos de
// grupo y a otras (proyectorResiduos; antes, por las ecuaciones normales con su Cholesky forzado), con las mismas bases
// para la misma semilla. Los sistemas penalizados del P-spline no son mínimos cuadrados ordinarios: los resuelve la
// inversa definida positiva del núcleo (core/linalg/cholesky.js).
// La recta de un solo predictor con su banda de confianza tiene su forma cerrada en regresion-simple.js (la misma
// solución: una prueba lo comprueba).
import { factorQR, aplicarQt, aplicarQ, resolverR, inversaXtX } from '../linalg/qr.js';
import { media, desviacion } from './descriptivos.js';
import { pTBilateral, colaSuperiorF, cuantilT } from './distribuciones.js';

/**
 * Tolerancia de colinealidad: un predictor (centrado) es colineal si la parte que no explican los anteriores tiene una norma
 * menor que 10⁻⁷ veces la suya, es decir, si su R² con ellos supera 1 − 10⁻¹⁴ (el número de lm de R, que lo aplica a la
 * columna sin centrar).
 */
export const TOLERANCIA_COLINEALIDAD = 1e-7;

/**
 * El ajuste por mínimos cuadrados con constante (ponderados si se dan pesos): minimiza Σ wᵢ(yᵢ − b₀ − Σⱼ bⱼxᵢⱼ)². Los
 * predictores se CENTRAN en su media (ponderada) antes de la QR y la constante se recupera después: la colinealidad se
 * juzga por la variación de cada predictor y no por su tamaño (una fecha AAAAMMDD de unos días, que varía en 10⁻⁷ de su
 * valor, sería «colineal con la constante» sin centrar, como en lm de R), y los ajustados no arrastran la cancelación de
 * una constante grande. Las pendientes y su (X'X)⁻¹ son las del modelo en crudo; la fila de la constante se transforma
 * (b₀ = b₀c − Σ bⱼx̄ⱼ y su varianza con la de las pendientes).
 * @param {ArrayLike<number>} y
 * @param {ArrayLike<number>[]} columnas los k predictores (la constante la añade la función)
 * @param {{ pesos?: ArrayLike<number> | null, tolerancia?: number, conInversa?: boolean }} [opciones] conInversa: añade
 *   (X'X)⁻¹ completa (para las covarianzas «sándwich» y la palanca)
 * @returns {{ n: number, p: number, beta: Float64Array, ajustados: Float64Array, residuos: Float64Array, sce: number,
 *   diagInversa: Float64Array, inversa?: Float64Array[] } | null} null si hay menos casos que coeficientes o algún predictor
 *   es colineal con la constante y los anteriores; con pesos, sce = Σ wᵢeᵢ² y la inversa es la de (X'WX)⁻¹
 */
export function ajustarMco(y, columnas, { pesos = null, tolerancia = TOLERANCIA_COLINEALIDAD, conInversa = false } = {}) {
    const n = y.length, k = columnas.length, p = k + 1;
    if (n < p) return null;
    // (2026.12.22) con bucles explícitos: Float64Array.from con una función por elemento era 15 veces más lento que la QR
    // misma (con n = 100 000, 60 ms frente a 4); las cuentas son las mismas, en el mismo orden
    const raiz = new Float64Array(n);   // √wᵢ: escalar las filas convierte los mínimos cuadrados ponderados en ordinarios
    let sw = 0;
    for (let i = 0; i < n; i++) { const w = pesos ? /** @type {number} */ (pesos[i]) : 1; sw += w; raiz[i] = Math.sqrt(w); }
    const medias = new Float64Array(k);
    /** @type {Float64Array[]} */ const centradas = [], X = [raiz];   // factorQR no modifica sus columnas
    for (let j = 0; j < k; j++) {
        const c = /** @type {ArrayLike<number>} */ (columnas[j]), cc = new Float64Array(n), xc = new Float64Array(n);
        let s = 0;
        for (let i = 0; i < n; i++) s += (pesos ? /** @type {number} */ (pesos[i]) : 1) * /** @type {number} */ (c[i]);
        const m = s / sw; medias[j] = m;
        for (let i = 0; i < n; i++) { const d = /** @type {number} */ (c[i]) - m; cc[i] = d; xc[i] = d * /** @type {number} */ (raiz[i]); }
        centradas.push(cc); X.push(xc);
    }
    const f = factorQR(X, { tolerancia });
    if (f.rango < p) return null;
    const yw = new Float64Array(n);
    for (let i = 0; i < n; i++) yw[i] = /** @type {number} */ (y[i]) * /** @type {number} */ (raiz[i]);
    const bc = resolverR(f, aplicarQt(f, yw));
    const ajustados = new Float64Array(n), residuos = new Float64Array(n);
    let sce = 0;
    for (let i = 0; i < n; i++) {
        let a = /** @type {number} */ (bc[0]);
        for (let j = 0; j < k; j++) a += /** @type {number} */ (bc[j + 1]) * /** @type {number} */ (/** @type {Float64Array} */ (centradas[j])[i]);
        const e = /** @type {number} */ (y[i]) - a;
        ajustados[i] = a; residuos[i] = e; sce += (pesos ? /** @type {number} */ (pesos[i]) : 1) * e * e;
    }
    // de los coeficientes centrados a los crudos: b = T·bc con T = [[1, −x̄ᵀ], [0, I]], y (X'X)⁻¹ = T·C·Tᵀ
    const beta = Float64Array.from(bc), C = inversaXtX(f);
    for (let j = 0; j < k; j++) beta[0] -= /** @type {number} */ (bc[j + 1]) * /** @type {number} */ (medias[j]);
    const fila0 = Float64Array.from({ length: p }, (_, c) => { let s = /** @type {number} */ (/** @type {Float64Array} */ (C[0])[c]); for (let j = 0; j < k; j++) s -= /** @type {number} */ (medias[j]) * /** @type {number} */ (/** @type {Float64Array} */ (C[j + 1])[c]); return s; });
    let c00 = /** @type {number} */ (fila0[0]); for (let j = 0; j < k; j++) c00 -= /** @type {number} */ (fila0[j + 1]) * /** @type {number} */ (medias[j]);
    const inversa = C.map((filaC, a) => a === 0 ? Float64Array.from(fila0, (v, c) => c === 0 ? c00 : v) : Float64Array.from(filaC, (v, c) => c === 0 ? /** @type {number} */ (fila0[a]) : v));
    const diagInversa = Float64Array.from(inversa, (fila, j) => /** @type {number} */ (fila[j]));
    return conInversa ? { n, p, beta, ajustados, residuos, sce, diagInversa, inversa } : { n, p, beta, ajustados, residuos, sce, diagInversa };
}

/**
 * Lo que queda de un vector al quitarle su parte lineal en la constante y en unas columnas: los residuos de su proyección
 * ortogonal sobre ese espacio, por la QR de la constante y las columnas centradas. Nunca falla: una columna colineal con
 * las anteriores no añade nada al espacio y la QR la omite (con el mismo criterio que el ajuste). Devuelve una función que
 * proyecta cada vector: la factorización se hace una sola vez. (2026.12.25) La usa el Simulador para hacer sus variables
 * generadas ortogonales a los códigos de grupo y a otras variables; antes, por las ecuaciones normales con su Cholesky
 * forzado, que cuadra el número de condición.
 * @param {ArrayLike<number>[]} columnas  de longitud n
 * @param {number} n  número de casos (el de los vectores que se proyectarán)
 * @returns {(y: ArrayLike<number>) => Float64Array}
 */
export function proyectorResiduos(columnas, n) {
    /** @type {Float64Array[]} */ const X = [new Float64Array(n).fill(1)];
    for (const c of columnas) {
        let s = 0;
        for (let i = 0; i < n; i++) s += /** @type {number} */ (c[i]);
        const m = s / n, xc = new Float64Array(n);
        for (let i = 0; i < n; i++) xc[i] = /** @type {number} */ (c[i]) - m;
        X.push(xc);
    }
    const f = factorQR(X);
    return y => {
        const z = aplicarQt(f, y);
        for (let l = 0; l < f.rango; l++) z[l] = 0;
        return aplicarQ(f, z);
    };
}

/**
 * La regresión lineal múltiple con constante y su inferencia clásica (errores normales e independientes de varianza
 * constante): coeficientes con su error típico, t, p bilateral e IC con la t de n − p gl; R², R² ajustado, la F del
 * modelo con su p, el error típico de estimación, los β estandarizados (con las DE muestrales) y el VIF de cada predictor,
 * por la identidad VIFⱼ = SCⱼ·[(X'X)⁻¹]ⱼⱼ (= 1/(1 − R²ⱼ) de la regresión de xⱼ sobre los demás, sin ajustarla), acotado
 * en 10⁹; con un solo predictor, 1.
 * @param {ArrayLike<number>} y
 * @param {ArrayLike<number>[]} columnas
 * @param {{ nivel?: number, tolerancia?: number }} [opciones] nivel del IC (0.95)
 * @returns {{ n: number, k: number, gl: number, beta: Float64Array, ee: Float64Array, t: Float64Array,
 *   pValores: Float64Array, ic: Array<[number, number]>, betaEstandarizado: Float64Array, vif: Float64Array,
 *   ajustados: Float64Array, residuos: Float64Array, sce: number, sct: number, r2: number, r2aj: number, F: number,
 *   pF: number, sigma2: number, errorTipico: number } | null} null si el modelo no puede estimarse (colinealidad) o la y es
 *   constante
 */
export function regresionMco(y, columnas, { nivel = 0.95, tolerancia = TOLERANCIA_COLINEALIDAD } = {}) {
    // con una y constante no hay nada que explicar: t, F y β estandarizados saldrían del ruido de redondeo
    let constante = true; for (let i = 1; i < y.length && constante; i++) constante = y[i] === y[0];
    if (constante) return null;
    const a = ajustarMco(y, columnas, { tolerancia });
    if (!a) return null;
    const n = a.n, k = columnas.length, p = k + 1, gl = n - p, my = media(y);
    let sct = 0; for (let i = 0; i < n; i++) sct += (/** @type {number} */ (y[i]) - my) ** 2;
    const r2 = sct > 0 ? 1 - a.sce / sct : 0, sigma2 = a.sce / gl;
    const F = k > 0 ? ((sct - a.sce) / k) / (a.sce / gl) : NaN, tc = cuantilT(1 - (1 - nivel) / 2, gl);
    const ee = Float64Array.from(a.diagInversa, d => Math.sqrt(sigma2 * d));
    const t = Float64Array.from(a.beta, (b, j) => b / /** @type {number} */ (ee[j]));
    const deY = desviacion(y);
    const sc = columnas.map(c => { const m = media(c); let s = 0; for (let i = 0; i < c.length; i++) s += (/** @type {number} */ (c[i]) - m) ** 2; return s; });
    return {
        n, k, gl, beta: a.beta, ee, t, pValores: Float64Array.from(t, v => pTBilateral(v, gl)),
        ic: Array.from(a.beta, (b, j) => /** @type {[number, number]} */ ([b - tc * /** @type {number} */ (ee[j]), b + tc * /** @type {number} */ (ee[j])])),
        betaEstandarizado: Float64Array.from(columnas, (c, j) => /** @type {number} */ (a.beta[j + 1]) * desviacion(c) / deY),
        vif: Float64Array.from(sc, (s, j) => k >= 2 ? Math.min(1e9, s * /** @type {number} */ (a.diagInversa[j + 1])) : 1),
        ajustados: a.ajustados, residuos: a.residuos, sce: a.sce, sct, r2, r2aj: 1 - (1 - r2) * (n - 1) / gl,
        F, pF: F > 0 ? colaSuperiorF(F, k, gl) : 1, sigma2, errorTipico: Math.sqrt(sigma2)
    };
}
