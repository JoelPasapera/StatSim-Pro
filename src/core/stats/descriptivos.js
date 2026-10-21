// @ts-check
// core/stats/descriptivos.js — momentos de una muestra: suma, media, varianza, desviación típica, covarianza, asimetría y
// curtosis; las desviaciones a la media, las puntuaciones típicas y las matrices de covarianzas (las tres, 2026.12.25).
// (2026.12.19) La asimetría y la curtosis estaban en la vista principal (las de SPSS, ajustadas) y en la lectura de los
// gráficos y la normalidad de respaldo (los momentos sin ajustar): la misma variable tenía dos asimetrías.
// (2026.12.12) Antes, la misma función en una docena de sitios (la media en nueve). Todo en dos pasadas: primero la media,
// después las desviaciones, sin la cancelación de Σx² − (Σx)²/n. Los NaN se propagan; quien llama los filtra antes.
// En V8, d ** 2 y d * d son idénticos bit a bit (comprobado con doce millones de valores): unificar ambas escrituras no
// altera ningún resultado.

/** @typedef {ArrayLike<number>} Serie */

/**
 * Suma de izquierda a derecha (el mismo orden que reduce: resultados idénticos bit a bit).
 * @param {Serie} v
 * @returns {number}
 */
export function suma(v) {
    let s = 0;
    for (let i = 0; i < v.length; i++) s += v[i];
    return s;
}

/**
 * Media aritmética (NaN con la serie vacía). (2026.12.23) Con todos los valores iguales, ese valor exacto: la suma
 * redondeada daba una media que difería en la última cifra (42,1 repetido 60 veces: 42,1 − 5·10⁻¹⁴), y las desviaciones a
 * ella, la varianza y las pruebas que las usan salían de ese ruido (con dos grupos constantes y distintos, una t de 10¹⁴ y
 * una d de 10¹³ en lugar de ∞, y una F de Levene infinita en lugar de 0/0). En los demás casos, la misma suma de izquierda
 * a derecha: el resultado no cambia en ningún bit.
 * @param {Serie} v
 * @returns {number}
 */
export function media(v) {
    const n = v.length, v0 = v[0];
    let s = 0, constante = true;
    for (let i = 0; i < n; i++) { const x = v[i]; s += x; if (x !== v0) constante = false; }
    return constante && n > 0 ? /** @type {number} */ (v0) : s / n;
}

/**
 * Suma de los cuadrados de las desviaciones a la media, en dos pasadas.
 * @param {Serie} v
 * @returns {number}
 */
function sumaCuadrados(v) {
    const m = media(v);
    let s = 0;
    for (let i = 0; i < v.length; i++) { const d = v[i] - m; s += d * d; }
    return s;
}

// (2026.12.12, revisión) Sin parámetros opcionales: una primera versión tenía varianza(v, ddof = 1), y `cols.map(varianza)`
// le pasaba el ÍNDICE de cada columna como ddof (las varianzas de los ítems salían mal y con ellas el α del informe de R12;
// lo atrapó el oráculo NumPy). Las funciones de un solo parámetro son seguras como callback; la poblacional, explícita.

/**
 * Varianza muestral (n − 1).
 * @param {Serie} v
 * @returns {number}
 */
export function varianza(v) { return sumaCuadrados(v) / (v.length - 1); }

/**
 * Varianza poblacional (n).
 * @param {Serie} v
 * @returns {number}
 */
export function varianzaPoblacional(v) { return sumaCuadrados(v) / v.length; }

/**
 * Desviación típica muestral (n − 1).
 * @param {Serie} v
 * @returns {number}
 */
export function desviacion(v) { return Math.sqrt(varianza(v)); }

/**
 * Desviación típica poblacional (n).
 * @param {Serie} v
 * @returns {number}
 */
export function desviacionPoblacional(v) { return Math.sqrt(varianzaPoblacional(v)); }

/**
 * Desviaciones a la media, v − media(v). Una serie constante da ceros exactos (su media es exacta). (2026.12.25) Antes, a
 * mano en el informe del Simulador (dos veces), en sus coeficientes estandarizados y en la regresión con términos
 * centrados del Analizador.
 * @param {Serie} v
 * @returns {Float64Array}
 */
export function centrar(v) {
    const m = media(v);
    return Float64Array.from(v, x => x - m);
}

/**
 * Puntuaciones típicas, z = (v − media)/DE, con la DE poblacional (n, por omisión) o la muestral (n − 1), en dos pasadas.
 * Devuelve también la media y la DE: hacen falta para volver a la escala original y para decidir qué hacer con una serie
 * sin varianza. Si la DE es 0 o no es un número, z se divide por 1: una serie constante da ceros exactos (su media es
 * exacta) y una con NaN, NaN; quien necesite otra cosa lo comprueba con `de` (de > 0). (2026.12.25, cierre de la fase F6)
 * Antes, escrita a mano en trece sitios, con la misma aritmética: en el Simulador, sus coeficientes estandarizados, cuatro
 * filas de su informe, la forma de una variable con correlaciones exactas, la composición de una forma y de una moderación,
 * el efecto de conglomerado de un CCI y el ρ esperado de una forma; en el Analizador, las tres pruebas de forma (el cribado,
 * el diagnóstico y sus permutaciones). Con una serie constante, su media redondeada dejaba un residuo igual en todos los
 * casos, y dividirlo por la DE de ese residuo daba puntuaciones de ≈ ±1 (42,1 repetido 60 veces: una DE de 5·10⁻¹⁴ y
 * z = 1 en todos).
 * @param {Serie} v
 * @param {{ muestral?: boolean }} [opciones]
 * @returns {{ z: Float64Array, media: number, de: number }}
 */
export function estandarizar(v, { muestral = false } = {}) {
    const n = v.length, m = media(v);
    let s = 0;
    for (let i = 0; i < n; i++) { const d = /** @type {number} */ (v[i]) - m; s += d * d; }
    const de = Math.sqrt(s / (muestral ? n - 1 : n)), divisor = de || 1;
    return { z: Float64Array.from(v, x => (x - m) / divisor), media: m, de };
}

/**
 * Covarianza muestral (n − 1), en dos pasadas.
 * @param {Serie} a
 * @param {Serie} b
 * @returns {number}
 */
export function covarianza(a, b) {
    const ma = media(a), mb = media(b);
    let s = 0;
    for (let i = 0; i < a.length; i++) s += (a[i] - ma) * (b[i] - mb);
    return s / (a.length - 1);
}

/**
 * Las sumas de productos cruzados de las desviaciones a la media de unas columnas de la misma longitud (simétrica: cada
 * elemento se calcula una vez).
 * @param {Serie[]} columnas
 * @returns {number[][]}
 */
function productosCruzados(columnas) {
    const k = columnas.length, medias = columnas.map(c => media(c));
    const S = Array.from({ length: k }, () => new Array(k).fill(0));
    for (let i = 0; i < k; i++) for (let j = i; j < k; j++) {
        const a = /** @type {Serie} */ (columnas[i]), b = /** @type {Serie} */ (columnas[j]);
        const ma = /** @type {number} */ (medias[i]), mb = /** @type {number} */ (medias[j]);
        let s = 0;
        for (let t = 0; t < a.length; t++) s += (/** @type {number} */ (a[t]) - ma) * (/** @type {number} */ (b[t]) - mb);
        /** @type {number[]} */ (S[i])[j] = /** @type {number[]} */ (S[j])[i] = s;
    }
    return S;
}

/**
 * Matriz de covarianzas muestral (n − 1) de unas columnas de la misma longitud: el elemento (i, j) es la covarianza de las
 * columnas i y j, con las sumas en el orden de los casos. (2026.12.25) La del SEM; antes, una copia en su motor.
 * @param {Serie[]} columnas
 * @returns {number[][]}
 */
export function matrizCovarianzas(columnas) {
    const n = columnas.length ? /** @type {Serie} */ (columnas[0]).length : 0;
    return productosCruzados(columnas).map(f => f.map(s => s / (n - 1)));
}

/**
 * Matriz de covarianzas poblacional (n), la de máxima verosimilitud. (2026.12.25) La de la invarianza; antes, una copia.
 * @param {Serie[]} columnas
 * @returns {number[][]}
 */
export function matrizCovarianzasPoblacional(columnas) {
    const n = columnas.length ? /** @type {Serie} */ (columnas[0]).length : 0;
    return productosCruzados(columnas).map(f => f.map(s => s / n));
}

/**
 * Momentos centrales m2, m3 y m4 (con n en el denominador), en dos pasadas.
 * @param {Serie} v
 * @returns {[number, number, number]}
 */
function momentosCentrales(v) {
    const n = v.length, m = media(v);
    let m2 = 0, m3 = 0, m4 = 0;
    for (let i = 0; i < n; i++) { const d = v[i] - m, d2 = d * d; m2 += d2; m3 += d2 * d; m4 += d2 * d2; }
    return [m2 / n, m3 / n, m4 / n];
}

/**
 * Asimetría muestral ajustada de Fisher-Pearson, G1 = g1·√(n(n − 1))/(n − 2), con g1 = m3/m2^(3/2): la de SPSS y Excel
 * (en SciPy, skew con bias=False). 0 si la serie es constante; NaN con menos de 3 valores.
 * @param {Serie} v
 * @returns {number}
 */
export function asimetria(v) {
    const n = v.length;
    if (n < 3) return NaN;
    const [m2, m3] = momentosCentrales(v);
    return m2 === 0 ? 0 : ((m3 / Math.pow(m2, 1.5)) * Math.sqrt(n * (n - 1))) / (n - 2);
}

/**
 * Curtosis muestral ajustada (exceso), G2 = ((n + 1)·g2 + 6)·(n − 1)/((n − 2)(n − 3)), con g2 = m4/m2² − 3: la de SPSS y
 * Excel (en SciPy, kurtosis con bias=False). 0 si la serie es constante; NaN con menos de 4 valores.
 * @param {Serie} v
 * @returns {number}
 */
export function curtosis(v) {
    const n = v.length;
    if (n < 4) return NaN;
    const [m2, , m4] = momentosCentrales(v);
    return m2 === 0 ? 0 : (((n + 1) * (m4 / (m2 * m2) - 3) + 6) * (n - 1)) / ((n - 2) * (n - 3));
}
