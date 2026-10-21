// @ts-check
// core/stats/normalidad.js — las pruebas de normalidad ÚNICAS y la regla con que el programa elige entre ellas.
// Shapiro-Wilk por el algoritmo de Royston (1992, AS R94), el de R y SPSS, y Kolmogórov-Smirnov con la corrección de
// Lilliefors (Dallal-Wilkinson en la cola, aproximación polinómica en el centro), como nortest::lillie.test de R.
// Regla: Shapiro-Wilk con n < 50 y Kolmogórov-Smirnov (Lilliefors) con n ≥ 50 (convención intencional del Analizador).
// (2026.12.16) Antes vivían en estadistica.js, y la regla estaba copiada en seis sitios (la regresión tres veces, la
// comparación de grupos, los gráficos y el propio evaluarNormalidad), todos pidiéndole las pruebas al objeto de estadística.
// El código es el de entonces, trasladado sin cambios de cálculo (comprobado bit a bit), con dos correcciones explícitas:
// con n = 3, Shapiro-Wilk usa los pesos fijos de Royston (antes, W y p salían NaN), y su p se calcula con la cola superior
// directa de la normal, sin restar de 1 (en la cola profunda, p ≈ 1e−11, el error relativo era de 3e−6; ahora, 1e−14).
// (2026.12.23) Una muestra constante (todos los valores iguales) no es normal, con un estadístico fijo: Shapiro-Wilk, W = 0
// (con la media exacta de core/stats/descriptivos.js, también para 42,1 repetido, cuya suma redondeada daba antes un W de
// ruido), y Kolmogórov-Smirnov, D = ½, el límite cuando la DE tiende a 0 (antes, 0/0: D y p NaN, y la vista principal
// mostraba «NaN»).
import { cuantilNormal, cdfNormal, colaSuperiorNormal } from './normal.js';
import { media, desviacion } from './descriptivos.js';

/** Umbral de la regla: Shapiro-Wilk con n por debajo; Kolmogórov-Smirnov (Lilliefors) desde aquí. */
export const N_MINIMO_KOLMOGOROV = 50;

/**
 * Polinomio Σ coef[k]·valor^k (la forma de los coeficientes de Royston).
 * @param {number[]} coef
 * @param {number} valor
 * @returns {number}
 */
function polinomio(coef, valor) { return coef.reduce((acc, c, idx) => acc + c * Math.pow(valor, idx), 0); }

/**
 * Shapiro-Wilk según Royston (1992, AS R94): pesos aᵢ a partir de las puntuaciones normales esperadas (Blom) con las
 * correcciones polinómicas de Royston, W = (Σ aᵢ·x₍ᵢ₎)² / Σ (xᵢ − x̄)², y su p con pValorShapiroWilk.
 * @param {ArrayLike<number>} valores
 * @returns {{ estadistico: number, pValor: number }}
 */
export function shapiroWilk(valores) {
    const n = valores.length;
    const x = Array.from(valores).sort((a, b) => a - b);

    // Puntuaciones normales esperadas m_i y su norma
    /** @type {number[]} */
    const m = new Array(n);
    for (let i = 0; i < n; i++) m[i] = cuantilNormal((i + 1 - 0.375) / (n + 0.25));
    const ssm = m.reduce((acc, v) => acc + v * v, 0);
    const sqrtSsm = Math.sqrt(ssm);
    const rsn = 1 / Math.sqrt(n);
    const c1 = [0, 0.221157, -0.147981, -2.071190, 4.434685, -2.706056];
    const c2 = [0, 0.042981, -0.293762, -1.752461, 5.682633, -3.582633];

    // Pesos a_i (antisimétricos: a[n-1-i] = -a[i])
    /** @type {number[]} */
    const a = new Array(n).fill(0);
    if (n === 3) {
        // (2026.12.16) con n = 3 los pesos son fijos, a = (−√½, 0, √½), como en swilk.f (el de R y SciPy): la fórmula general
        // da un factor nulo (las puntuaciones esperadas son simétricas) y el peso central salía 0/0, con W y p NaN
        a[0] = -Math.SQRT1_2; a[2] = Math.SQRT1_2;
    } else {
        let aUltimo = /** @type {number} */ (m[n - 1]) / sqrtSsm;
        let phi, indiceMedio;
        if (n > 5) {
            let aPenultimo = /** @type {number} */ (m[n - 2]) / sqrtSsm;
            aUltimo = polinomio(c1, rsn) + aUltimo;
            aPenultimo = polinomio(c2, rsn) + aPenultimo;
            phi = (ssm - 2 * /** @type {number} */ (m[n - 1]) * /** @type {number} */ (m[n - 1]) - 2 * /** @type {number} */ (m[n - 2]) * /** @type {number} */ (m[n - 2])) /
                (1 - 2 * aUltimo * aUltimo - 2 * aPenultimo * aPenultimo);
            a[n - 1] = aUltimo; a[0] = -aUltimo;
            a[n - 2] = aPenultimo; a[1] = -aPenultimo;
            indiceMedio = 2;
        } else {
            aUltimo = polinomio(c1, rsn) + aUltimo;
            phi = (ssm - 2 * /** @type {number} */ (m[n - 1]) * /** @type {number} */ (m[n - 1])) / (1 - 2 * aUltimo * aUltimo);
            a[n - 1] = aUltimo; a[0] = -aUltimo;
            indiceMedio = 1;
        }
        const sqrtPhi = Math.sqrt(phi);
        for (let i = indiceMedio; i < n - indiceMedio; i++) a[i] = /** @type {number} */ (m[i]) / sqrtPhi;
    }

    // Estadístico W = (Σ a_i x_(i))² / Σ (x_i - x̄)²
    const mx = media(x);   // la suma de izquierda a derecha sobre los datos ordenados, como antes
    let numerador = 0, denominador = 0;
    for (let i = 0; i < n; i++) {
        const xi = /** @type {number} */ (x[i]);
        numerador += /** @type {number} */ (a[i]) * xi;
        denominador += (xi - mx) * (xi - mx);
    }
    const W = denominador > 0 ? (numerador * numerador) / denominador : 0;   // constante: W = 0
    return { estadistico: W, pValor: pValorShapiroWilk(W, n) };
}

/**
 * p de Shapiro-Wilk por la transformación de Royston (1992), con sus ramas n = 3 (exacta), 4 ≤ n ≤ 11 y n ≥ 12.
 * @param {number} W
 * @param {number} n
 * @returns {number}
 */
export function pValorShapiroWilk(W, n) {
    if (W <= 0 || W >= 1) return W >= 1 ? 1 : 0;
    if (n === 3) {   // caso exacto (Royston)
        const p = (6 / Math.PI) * (Math.asin(Math.sqrt(W)) - Math.asin(Math.sqrt(0.75)));
        return Math.max(0, Math.min(1, p));
    }
    let w1, mu, sigma;
    if (n <= 11) {
        const gamma = polinomio([-2.273, 0.459], n);
        w1 = -Math.log(gamma - Math.log(1 - W));
        mu = polinomio([0.5440, -0.39978, 0.025054, -0.0006714], n);
        sigma = Math.exp(polinomio([1.3822, -0.77857, 0.062767, -0.0020322], n));
    } else {
        const ln = Math.log(n);
        w1 = Math.log(1 - W);
        mu = polinomio([-1.5861, -0.31082, -0.083751, 0.0038915], ln);
        sigma = Math.exp(polinomio([-0.4803, -0.082676, 0.0030302], ln));
    }
    const z = (w1 - mu) / sigma;
    const p = colaSuperiorNormal(z);   // (2026.12.16) la cola directa: antes, 1 − Φ(z), que perdía precisión en la cola profunda
    return Math.max(0, Math.min(1, p));
}

/**
 * Kolmogórov-Smirnov frente a la normal con la media y la DE de la muestra (= la prueba de Lilliefors): D y su p. Con una
 * muestra constante, D = ½: la normal de DE → 0 vale Φ(0) = ½ en el único valor, donde la empírica salta de 0 a 1.
 * @param {ArrayLike<number>} valores
 * @returns {{ estadistico: number, pValor: number }}
 */
export function kolmogorovSmirnov(valores) {
    const n = valores.length;
    const ordenados = Array.from(valores).sort((a, b) => a - b);
    if (n > 0 && ordenados[0] === ordenados[n - 1]) return { estadistico: 0.5, pValor: pValorLilliefors(0.5, n) };
    const m = media(valores), s = desviacion(valores);
    let D = 0;
    for (let i = 0; i < n; i++) {
        const z = (/** @type {number} */ (ordenados[i]) - m) / s;
        const Fn = (i + 1) / n;
        const Fz = cdfNormal(z);
        D = Math.max(D, Math.abs(Fn - Fz), Math.abs(Fz - i / n));
    }
    return { estadistico: D, pValor: pValorLilliefors(D, n) };
}

/**
 * p de Kolmogórov-Smirnov con parámetros estimados (Lilliefors): la distribución de Kolmogorov es demasiado conservadora
 * al estimar la media y la DE, así que se usa la aproximación de Dallal-Wilkinson (cola, p ≤ 0,1) y una polinómica en el
 * estadístico modificado (zona central), como nortest::lillie.test de R.
 * @param {number} D
 * @param {number} n
 * @returns {number}
 */
export function pValorLilliefors(D, n) {
    let dMod = D, nMod = n;
    if (n > 100) {
        dMod = D * Math.pow(n / 100, 0.49);
        nMod = 100;
    }
    // Aproximación de Dallal-Wilkinson (precisa en la cola, p ≤ 0.1)
    let p = Math.exp(
        -7.01256 * dMod * dMod * (nMod + 2.78019)
        + 2.99587 * dMod * Math.sqrt(nMod + 2.78019)
        - 0.122119 + 0.974598 / Math.sqrt(nMod) + 1.67997 / nMod
    );
    // Para p > 0.1, aproximación polinómica sobre el estadístico modificado (la cola de Dallal-Wilkinson deja de ser fiable)
    if (p > 0.1) {
        const kk = (Math.sqrt(n) - 0.01 + 0.85 / Math.sqrt(n)) * D;
        const k2 = kk * kk, k3 = k2 * kk, k4 = k3 * kk;
        if (kk <= 0.302) p = 1;
        else if (kk <= 0.5) p = 2.76773 - 19.828315 * kk + 80.709644 * k2 - 138.55152 * k3 + 81.218052 * k4;
        else if (kk <= 0.9) p = -4.901232 + 40.662806 * kk - 97.490286 * k2 + 94.029866 * k3 - 32.355711 * k4;
        else if (kk <= 1.31) p = 6.198765 - 19.558097 * kk + 23.186922 * k2 - 12.234627 * k3 + 2.423045 * k4;
        else p = 0;
    }
    return Math.max(0, Math.min(1, p));
}

/**
 * La prueba de normalidad del programa: Shapiro-Wilk con n < 50 y Kolmogórov-Smirnov (Lilliefors) con n ≥ 50, con el
 * nombre completo (el de la vista principal y sus textos) y el abreviado (el de las tablas de la regresión y la
 * comparación de grupos). No comprueba un mínimo de casos: lo decide cada vista.
 * @param {ArrayLike<number>} valores
 * @returns {{ prueba: 'Shapiro-Wilk' | 'Kolmogorov-Smirnov (Lilliefors)', abreviatura: 'Shapiro-Wilk' | 'K-S (Lilliefors)', estadistico: number, pValor: number, n: number, normal: boolean }}
 */
export function pruebaNormalidad(valores) {
    const n = valores.length, conShapiro = n < N_MINIMO_KOLMOGOROV;
    const r = conShapiro ? shapiroWilk(valores) : kolmogorovSmirnov(valores);
    return { prueba: conShapiro ? 'Shapiro-Wilk' : 'Kolmogorov-Smirnov (Lilliefors)', abreviatura: conShapiro ? 'Shapiro-Wilk' : 'K-S (Lilliefors)',
             estadistico: r.estadistico, pValor: r.pValor, n, normal: r.pValor > 0.05 };
}
