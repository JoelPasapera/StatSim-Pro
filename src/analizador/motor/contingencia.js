// @ts-check
// analizador/motor/contingencia.js — la asociación de dos variables categóricas en el análisis general: la tabla de
// contingencia de sus categorías y la prueba χ² de independencia (la de core/stats/contingencia.js), con la decisión al α
// del estudio. (2026.12.24, fase F6, paso 4) Antes, el cálculo entero dentro de estadistica.js.
import { esPerdido } from '../../core/data/celdas.js';
import { pruebaIndependencia } from '../../core/stats/contingencia.js';
import { fisherExacta, fisherSiEnumerable, residuosCorregidos } from '../../core/stats/exactas.js';
import { intervaloCramerV } from '../../core/stats/efectos.js';

/**
 * (2027.01.17) ¿Decide la exacta de Fisher en lugar de la χ²? Con la regla de Cochran (1954), la de SPSS y la de los
 * manuales: la aproximación de la χ² no vale si más del 20 % de las casillas tienen una esperada menor que 5 o alguna, menor
 * que 1. Hasta la 2027.01.16 la vista lo advertía y decidía igual con la χ².
 * @param {number[][]} esperadas
 * @returns {boolean}
 */
export function decideFisher(esperadas) {
    const todas = esperadas.flat();
    return todas.filter(e => e < 5).length > 0.2 * todas.length || todas.some(e => e < 1);
}

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
 * Devuelve las categorías, las frecuencias observadas y esperadas, los totales, n, χ², gl, p, la V de Cramér (y, desde la
 * 2027.01.17, su intervalo), cuántas esperadas son menores que 5, los residuos corregidos, la exacta de Fisher, si decide
 * ella (decideFisher) y la decisión con `alfa` (con el p de la prueba que decide). Lanza un error con menos de 2 casos, con menos de 2 categorías en
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
    // (2027.01.17) la exacta de Fisher (exacta si las tablas posibles son pocas; si no, Monte Carlo con semilla), los residuos
    // tipificados corregidos de Haberman, el intervalo de la V de Cramér (por la χ² no central) y, en una 2 × 2, la razón de odds
    // (2027.01.20, revisión) con todas las esperadas ≥ 5 en una tabla mayor que 2 × 2, la χ² basta: Fisher solo si se enumera
    // enseguida (si no, null: su Monte Carlo costaba de medio segundo a dos en cada χ²)
    const necesaria = P.esperadasBajas > 0 || (f === 2 && c === 2);
    const fisher = necesaria ? fisherExacta(observadas) : fisherSiEnumerable(observadas), usarFisher = decideFisher(P.esperadas);
    const ic = intervaloCramerV(P.chiCuadrado, P.gl, P.n, Math.min(f, c));
    const pDecision = usarFisher && fisher ? fisher.pValor : P.pValor;
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
        cramerVIC: { inferior: ic.inferior, superior: ic.superior, nivel: ic.nivel },
        esperadasBajas: P.esperadasBajas,
        residuos: residuosCorregidos(observadas),
        fisher,
        usarFisher,
        decision: pDecision < alfa ? 'rechazar' : 'no_rechazar'
    };
}
