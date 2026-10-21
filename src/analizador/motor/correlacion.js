// @ts-check
// analizador/motor/correlacion.js — la correlación entre dos variables tal como la informa el análisis general (la vista
// principal, el Word, la criba y el análisis por dimensiones): Pearson si las dos son normales y Spearman si no, con su p
// (t con n − 2 gl y la lateralidad de la prueba), su intervalo de confianza (z de Fisher; para ρ, el error típico de Bonett
// y Wright, 2000), la potencia a posteriori (Cohen, 1988), los descriptivos, la recta de regresión (solo con Pearson), la
// interpretación y la prueba de hipótesis. Los cálculos son los del núcleo único (core/stats/correlacion.js y
// regresion-simple.js); aquí se combinan y se les da el formato de la vista. (2026.12.24, fase F6, paso 4) Antes, dentro
// de estadistica.js.
import { correlacion, spearman, pCorrelacion, icCorrelacion, potenciaCorrelacion } from '../../core/stats/correlacion.js';
import { regresionSimple } from '../../core/stats/regresion-simple.js';
import { descriptivos } from './descriptivos.js';
import { evaluarNormalidad } from './normalidad.js';
import { fuerzaCorrelacion } from './magnitudes.js';
import { esConstante } from './datos.js';
import { textoP } from '../../shared/formato-numero.js';

/** @typedef {import('./descriptivos.js').Descriptivos} Descriptivos */
/** @typedef {import('./normalidad.js').NormalidadVista} NormalidadVista */
/** @typedef {{ coeficiente: number, pValor: number, n: number }} Coeficiente */
/** @typedef {{ fuerza: string, direccion: string, significancia: string, texto: string }} InterpretacionCorrelacion */
/**
 * @typedef {{ pendiente: number, intercepto: number, r2: number, errorEstandarEstimacion: number,
 *   errorEstandarPendiente: number, tPendiente: number, gl: number, pPendiente: number }} RectaVista
 */
/**
 * @typedef {Coeficiente & { tipoCorrelacion: string, normalidad1: NormalidadVista, normalidad2: NormalidadVista,
 *   interpretacion: InterpretacionCorrelacion, tipoPrueba: string, descriptivas1: Descriptivos, descriptivas2: Descriptivos,
 *   gl: number, r2: number, intervaloConfianza: { inferior: number, superior: number, nivel: number } | null,
 *   alfa: number, regresion?: RectaVista, poder: number | null, valoresPareados: { x: number[], y: number[] } }} ResultadoCorrelacion
 */

/**
 * p del contraste de r (y de ρ, su aproximación asintótica): t con n − 2 gl. El unilateral es la mitad del bilateral, como
 * en SPSS; sin indicar la lateralidad, bilateral.
 * @param {number} r
 * @param {number} n
 * @param {string} [tipoPrueba]  'unilateral' o cualquier otra cosa (bilateral)
 * @returns {number}
 */
export function pValorCorrelacion(r, n, tipoPrueba) { return pCorrelacion(r, n, { bilateral: tipoPrueba !== 'unilateral' }); }

/**
 * r de Pearson con su p.
 * @param {number[]} x
 * @param {number[]} y
 * @param {string} [tipoPrueba]
 * @returns {Coeficiente}
 */
export function correlacionPearson(x, y, tipoPrueba) {
    const n = x.length, r = correlacion(x, y);
    return { coeficiente: r, pValor: pValorCorrelacion(r, n, tipoPrueba), n };
}

/**
 * ρ de Spearman (Pearson sobre los rangos, con empates promediados) con su p.
 * @param {number[]} x
 * @param {number[]} y
 * @param {string} [tipoPrueba]
 * @returns {Coeficiente}
 */
export function correlacionSpearman(x, y, tipoPrueba) {
    const n = x.length, coeficiente = spearman(x, y);
    return { coeficiente, pValor: pValorCorrelacion(coeficiente, n, tipoPrueba), n };
}

/**
 * Intervalo de confianza del coeficiente por la z de Fisher con el valor crítico exacto; para Spearman, el error típico de
 * Bonett y Wright (2000), la convención de todo el programa. null si n ≤ 3, |r| ≥ 1 o r no es finito (la transformación no
 * está definida).
 * @param {number} r
 * @param {number} n
 * @param {unknown} tipoCorrelacion  'Pearson' o 'Spearman (Rho)'
 * @param {number} [nivel]
 * @returns {{ inferior: number, superior: number, nivel: number } | null}
 */
export function intervaloCorrelacion(r, n, tipoCorrelacion, nivel = 0.95) {
    return icCorrelacion(r, n, { spearman: typeof tipoCorrelacion === 'string' && tipoCorrelacion.includes('Spearman'), nivel });
}

/**
 * Potencia a posteriori del contraste de la correlación (aproximación de Cohen, 1988, la de pwr.r.test) con el α y la
 * lateralidad de la prueba. null si no está definida (n ≤ 3, |r| ≥ 1 o r no finito).
 * @param {number} r
 * @param {number} n
 * @param {number} [alfa]
 * @param {string} [tipoPrueba]
 * @returns {number | null}
 */
export function potenciaPosteriori(r, n, alfa = 0.05, tipoPrueba = 'bilateral') {
    const poder = potenciaCorrelacion(r, n, { alfa, bilateral: tipoPrueba !== 'unilateral' });
    return Number.isFinite(poder) ? poder : null;
}

/**
 * La interpretación de una correlación: su fuerza, su dirección y su significación (con los umbrales fijos .001, .01 y .05
 * de la redacción) y la frase que las une.
 * @param {number} r
 * @param {number} p
 * @returns {InterpretacionCorrelacion}
 */
export function interpretarCorrelacion(r, p) {
    const fuerza = fuerzaCorrelacion(r), direccion = r >= 0 ? 'positiva' : 'negativa';
    const significancia = p < 0.001 ? 'altamente significativa (p < .001)'
        : p < 0.01 ? 'muy significativa (p < .01)'
        : p < 0.05 ? 'significativa (p < .05)'
        : 'no significativa (p ≥ .05)';
    return { fuerza, direccion, significancia, texto: `Correlación ${fuerza} ${direccion} ${significancia}` };
}

/**
 * La recta de mínimos cuadrados que predice `y` a partir de `x` (core/stats/regresion-simple.js, la misma que dibuja el
 * diagrama de dispersión) en el formato de esta vista.
 * @param {number[]} x
 * @param {number[]} y
 * @returns {RectaVista}
 */
export function regresionLineal(x, y) {
    const r = regresionSimple(x, y);
    return { pendiente: r.pendiente, intercepto: r.intercepto, r2: r.r2, errorEstandarEstimacion: r.errorEstandarEstimacion,
        errorEstandarPendiente: r.errorEstandarPendiente, tPendiente: r.tPendiente, gl: r.gl, pPendiente: r.pPendiente };
}

/**
 * La correlación completa de dos variables con sus pares de valores (casos completos): el coeficiente según la normalidad
 * de las dos, su p, su interpretación, los descriptivos, gl, r², el intervalo de confianza, la recta (con Pearson), la
 * potencia y los pares. Lanza un error con menos de 3 pares o si alguna variable es constante (con su nombre).
 * @param {number[]} x
 * @param {number[]} y
 * @param {{ tipoPrueba: string, alfa: number, nombreX: string, nombreY: string }} opciones
 * @returns {ResultadoCorrelacion}
 */
export function analizarCorrelacion(x, y, { tipoPrueba, alfa, nombreX, nombreY }) {
    if (x.length < 3) {
        throw new Error('Se necesitan al menos 3 pares de valores válidos');
    }
    // una variable sin variabilidad deja el coeficiente indefinido (NaN): se avisa con un mensaje claro
    if (esConstante(x) || esConstante(y)) {
        const nombreConstante = esConstante(x) ? nombreX : nombreY;
        throw new Error(`La variable "${nombreConstante}" no tiene variabilidad (todos sus valores son iguales); no es posible calcular la correlación.`);
    }
    const normalidad1 = evaluarNormalidad(x), normalidad2 = evaluarNormalidad(y);
    const pearson = normalidad1.normal && normalidad2.normal;
    const coef = pearson ? correlacionPearson(x, y, tipoPrueba) : correlacionSpearman(x, y, tipoPrueba);
    const tipoCorrelacion = pearson ? 'Pearson' : 'Spearman (Rho)';
    // (2026.12.30) El IC con el nivel de la prueba: 1 − α si es bilateral (el 95 % de siempre con α = .05) y 1 − 2α si es
    // unilateral (el 90 %), el intervalo que excluye el cero cuando la prueba unilateral rechaza. Antes, siempre el 95 %
    // bilateral: una correlación «significativa» con la prueba unilateral salía con un IC que incluía el cero.
    const nivelIC = tipoPrueba === 'unilateral' ? 1 - 2 * alfa : 1 - alfa;
    return {
        ...coef,
        tipoCorrelacion,
        normalidad1,
        normalidad2,
        interpretacion: interpretarCorrelacion(coef.coeficiente, coef.pValor),
        tipoPrueba,
        descriptivas1: descriptivos(x),
        descriptivas2: descriptivos(y),
        gl: coef.n - 2,
        r2: coef.coeficiente * coef.coeficiente,
        intervaloConfianza: intervaloCorrelacion(coef.coeficiente, coef.n, tipoCorrelacion, nivelIC),
        alfa,
        // la recta solo con el método paramétrico, por coherencia con Pearson
        ...(pearson ? { regresion: regresionLineal(x, y) } : {}),
        // (2026.12.17) con el α del estudio y la MISMA lateralidad que el p
        poder: potenciaPosteriori(coef.coeficiente, coef.n, alfa, tipoPrueba),
        valoresPareados: { x, y }
    };
}

/**
 * La correlación entre los puntajes de dos dimensiones (casos completos), con el coeficiente según su normalidad.
 * Lanza el error de la normalidad con menos de 3 casos.
 * @param {number[]} x
 * @param {number[]} y
 * @param {string} tipoPrueba
 * @param {{ dimension1: string, dimension2: string, items1: string[], items2: string[] }} dimensiones
 * @returns {Coeficiente & { tipoCorrelacion: string, dimension1: string, dimension2: string, items1: string[],
 *   items2: string[], normalidad1: NormalidadVista, normalidad2: NormalidadVista, interpretacion: InterpretacionCorrelacion }}
 */
export function correlacionEntreDimensiones(x, y, tipoPrueba, { dimension1, dimension2, items1, items2 }) {
    const normalidad1 = evaluarNormalidad(x), normalidad2 = evaluarNormalidad(y);
    const pearson = normalidad1.normal && normalidad2.normal;
    const coef = pearson ? correlacionPearson(x, y, tipoPrueba) : correlacionSpearman(x, y, tipoPrueba);
    return {
        ...coef,
        tipoCorrelacion: pearson ? 'Pearson' : 'Spearman (Rho)',
        dimension1,
        dimension2,
        items1,
        items2,
        normalidad1,
        normalidad2,
        interpretacion: interpretarCorrelacion(coef.coeficiente, coef.pValor)
    };
}

/**
 * La prueba de hipótesis de una correlación con el α dado: la decisión y las conclusiones sobre H0 y H1.
 * @param {{ pValor: number, interpretacion: { direccion: string } }} resultado
 * @param {number} alfa
 * @returns {{ alpha: number, pValor: number, decision: 'rechazar' | 'no_rechazar', conclusionH0: string, conclusionH1: string }}
 */
export function pruebaHipotesis(resultado, alfa) {
    const decision = resultado.pValor < alfa ? 'rechazar' : 'no_rechazar';
    // (2026.12.30) sin que el redondeo cruce α: con p = .0496, «Se rechaza la hipótesis nula (p = 0.050 < α = 0.05)»
    const p = textoP(resultado.pValor, { alfa, ceroInicial: true });
    return {
        alpha: alfa,
        pValor: resultado.pValor,
        decision,
        conclusionH0: decision === 'rechazar'
            ? `Se rechaza la hipótesis nula (${p} < α = ${alfa})`
            : `No se rechaza la hipótesis nula (${p} ≥ α = ${alfa})`,
        conclusionH1: decision === 'rechazar'
            ? `Existe una relación estadísticamente significativa ${resultado.interpretacion.direccion}`
            : 'No existe evidencia suficiente de una relación estadísticamente significativa'
    };
}
