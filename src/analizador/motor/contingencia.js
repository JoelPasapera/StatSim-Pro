// @ts-check
// analizador/motor/contingencia.js — la asociación de dos variables categóricas en el análisis general: la tabla de
// contingencia de sus categorías y la prueba χ² de independencia (la de core/stats/contingencia.js), con la decisión al α
// del estudio. (2026.12.24, fase F6, paso 4) Antes, el cálculo entero dentro de estadistica.js.
import { esPerdido } from '../../core/data/celdas.js';
import { pruebaIndependencia } from '../../core/stats/contingencia.js';

/** Máximo de categorías por variable: con más, la variable no es categórica (una continua, un identificador). */
export const MAX_CATEGORIAS = 15;

/**
 * Categorías distintas de una variable, en orden numérico si las dos que se comparan son números y alfabético si no.
 * @param {string[]} valores
 * @returns {string[]}
 */
function categorias(valores) {
    return [...new Set(valores)].sort((x, y) => {
        const nx = parseFloat(x), ny = parseFloat(y);
        return (isFinite(nx) && isFinite(ny)) ? nx - ny : x.localeCompare(y);
    });
}

/**
 * χ² de independencia entre dos variables categóricas, emparejadas por posición (hasta la más corta de las dos): un caso
 * con alguna de las dos perdida (sin valor, NaN o texto vacío) no cuenta, y cada valor es una categoría por su texto.
 * Devuelve las categorías, las frecuencias observadas y esperadas, los totales, n, χ², gl, p, la V de Cramér, cuántas
 * esperadas son menores que 5 y la decisión con `alfa`. Lanza un error con menos de 2 casos, con menos de 2 categorías en
 * alguna variable o con más de MAX_CATEGORIAS.
 * @param {ArrayLike<unknown>} valores1
 * @param {ArrayLike<unknown>} valores2
 * @param {number} alfa
 */
export function chiCuadradoIndependencia(valores1, valores2, alfa) {
    const n = Math.min(valores1.length, valores2.length);
    /** @type {[string, string][]} */
    const pares = [];
    for (let i = 0; i < n; i++) {
        const a = valores1[i], b = valores2[i];
        // (2026.12.18) un perdido no es una categoría: antes, el NaN del Simulador entraba en la tabla como «NaN»
        if (!esPerdido(a) && !esPerdido(b)) pares.push([String(a), String(b)]);
    }
    if (pares.length < 2) {
        throw new Error('No hay suficientes datos para la prueba de chi-cuadrado');
    }
    const categorias1 = categorias(pares.map(p => p[0])), categorias2 = categorias(pares.map(p => p[1]));
    const f = categorias1.length, c = categorias2.length;
    if (f < 2 || c < 2) {
        throw new Error('Cada variable debe tener al menos 2 categorías distintas para la prueba de chi-cuadrado');
    }
    if (f > MAX_CATEGORIAS || c > MAX_CATEGORIAS) {
        throw new Error('Alguna variable tiene demasiadas categorías para una tabla de contingencia; usa variables categóricas (no continuas).');
    }
    /** @type {Record<string, number>} */ const indice1 = {};
    categorias1.forEach((v, i) => { indice1[v] = i; });
    /** @type {Record<string, number>} */ const indice2 = {};
    categorias2.forEach((v, i) => { indice2[v] = i; });
    /** @type {number[][]} */
    const observadas = Array.from({ length: f }, () => new Array(c).fill(0));
    pares.forEach(([a, b]) => {
        const fila = /** @type {number[]} */ (observadas[/** @type {number} */ (indice1[a])]), j = /** @type {number} */ (indice2[b]);
        fila[j] = /** @type {number} */ (fila[j]) + 1;
    });
    const P = pruebaIndependencia(observadas);
    return {
        categorias1,
        categorias2,
        observadas,
        esperadas: P.esperadas,
        totalFila: P.totalFila,
        totalColumna: P.totalColumna,
        n: P.n,
        chiCuadrado: P.chiCuadrado,
        gl: P.gl,
        pValor: P.pValor,
        cramerV: P.cramerV,
        esperadasBajas: P.esperadasBajas,
        decision: P.pValor < alfa ? 'rechazar' : 'no_rechazar'
    };
}
