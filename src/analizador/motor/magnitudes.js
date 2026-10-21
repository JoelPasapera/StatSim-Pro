// @ts-check
// analizador/motor/magnitudes.js — las bandas con que el Analizador nombra la magnitud de un resultado (2026.12.24, fase F6,
// paso 4): el tamaño del efecto según Cohen (1988) —d, r y η² o ε²—, la fuerza de una correlación (la escala de la vista
// principal y su tabla del Word, la de los gráficos y la del diagrama de dispersión del Word), la asociación según la V de
// Cramér y la fiabilidad según George y Mallery (2003). Una sola definición de cada banda: estaban repetidas en
// estadistica.js, en la pestaña de grupos (comparacion-grupos.js), en la de fiabilidad (fiabilidad.js), en los dos módulos de
// los gráficos (graficas.js y analisis-graficos.js) y en la redacción (interpretaciones.js), o sueltas en la interfaz y en el
// Word. Un valor no numérico (NaN) cae, como siempre, en la última banda de cada escala de efectos y en «inaceptable» en la
// de fiabilidad. Las bandas propias de un análisis especializado (el KMO del AFE, κ y CCI de la concordancia, el tamaño del
// efecto del NCA) siguen en su módulo, cada una una sola vez.

/** @typedef {'trivial' | 'pequeño' | 'mediano' | 'grande'} MagnitudEfecto */

/**
 * d de Cohen (en valor absoluto): .20 pequeño, .50 mediano, .80 grande.
 * @param {number} d
 * @returns {MagnitudEfecto}
 */
export function magnitudD(d) {
    const a = Math.abs(d);
    return a < 0.2 ? 'trivial' : a < 0.5 ? 'pequeño' : a < 0.8 ? 'mediano' : 'grande';
}

/**
 * r como tamaño del efecto (en valor absoluto; también la r de rangos, |z|/√N): .10, .30 y .50.
 * @param {number} r
 * @returns {MagnitudEfecto}
 */
export function magnitudR(r) {
    const a = Math.abs(r);
    return a < 0.1 ? 'trivial' : a < 0.3 ? 'pequeño' : a < 0.5 ? 'mediano' : 'grande';
}

/**
 * η² o ε² (proporción de varianza; en valor absoluto): .01, .06 y .14.
 * @param {number} v
 * @returns {MagnitudEfecto}
 */
export function magnitudEta2(v) {
    const a = Math.abs(v);
    return a < 0.01 ? 'trivial' : a < 0.06 ? 'pequeño' : a < 0.14 ? 'mediano' : 'grande';
}

/**
 * Fuerza de una correlación (en valor absoluto), la de la redacción del análisis de dos variables: .10, .30, .50, .70 y .90.
 * @param {number} r
 * @returns {'nula o muy débil' | 'débil' | 'moderada' | 'moderada-fuerte' | 'fuerte' | 'muy fuerte'}
 */
export function fuerzaCorrelacion(r) {
    const a = Math.abs(r);
    if (a < 0.1) return 'nula o muy débil';
    if (a < 0.3) return 'débil';
    if (a < 0.5) return 'moderada';
    if (a < 0.7) return 'moderada-fuerte';
    if (a < 0.9) return 'fuerte';
    return 'muy fuerte';
}

/**
 * Fuerza de una correlación (en valor absoluto) con las bandas de Cohen, .10, .30 y .50, la de la lectura de los gráficos
 * (la ventana de cada celda del mapa de correlaciones y el análisis de los gráficos).
 * @param {number} r
 * @returns {'despreciable' | 'débil' | 'moderada' | 'fuerte'}
 */
export function fuerzaCorrelacionGrafico(r) {
    const a = Math.abs(r);
    return a < 0.1 ? 'despreciable' : a < 0.3 ? 'débil' : a < 0.5 ? 'moderada' : 'fuerte';
}

/**
 * Fuerza de una correlación (en valor absoluto) en la lectura del diagrama de dispersión del Word: .10, .30, .50 y .70.
 * @param {number} r
 * @returns {'prácticamente nula' | 'débil' | 'moderada' | 'considerable' | 'fuerte'}
 */
export function fuerzaCorrelacionDispersion(r) {
    const a = Math.abs(r);
    return a < 0.1 ? 'prácticamente nula' : a < 0.3 ? 'débil' : a < 0.5 ? 'moderada' : a < 0.7 ? 'considerable' : 'fuerte';
}

/**
 * La asociación que expresa una V de Cramér, con las bandas de Cohen para gl* = 1 (.10, .30 y .50; una guía general).
 * @param {number} v
 * @returns {'asociación nula o muy débil' | 'asociación débil' | 'asociación moderada' | 'asociación fuerte'}
 */
export function asociacionCramerV(v) {
    if (v < 0.1) return 'asociación nula o muy débil';
    if (v < 0.3) return 'asociación débil';
    if (v < 0.5) return 'asociación moderada';
    return 'asociación fuerte';
}

/**
 * Fiabilidad (α u ω) según George y Mallery (2003): .90 excelente, .80 buena, .70 aceptable, .60 cuestionable, .50 pobre.
 * @param {number} coeficiente
 * @returns {'excelente' | 'buena' | 'aceptable' | 'cuestionable' | 'pobre' | 'inaceptable'}
 */
export function nivelFiabilidad(coeficiente) {
    if (coeficiente >= 0.9) return 'excelente';
    if (coeficiente >= 0.8) return 'buena';
    if (coeficiente >= 0.7) return 'aceptable';
    if (coeficiente >= 0.6) return 'cuestionable';
    if (coeficiente >= 0.5) return 'pobre';
    return 'inaceptable';
}
