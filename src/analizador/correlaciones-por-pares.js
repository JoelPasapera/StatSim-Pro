// @ts-check
// analizador/correlaciones-por-pares.js — la matriz de correlaciones con eliminación POR PARES que comparten el mapa de
// correlaciones de los gráficos y la matriz del capítulo de Word (sin DOM). (2026.12.17) Antes cada uno filtraba cada
// columna por separado y emparejaba las listas por posición: con valores perdidos, a partir del primero de una sola
// variable cada par unía a un participante con el siguiente (y en el Word, además, la celda vacía de un CSV contaba como
// 0). El coeficiente de cada par es el del análisis: Pearson si las dos variables son normales (la prueba y la regla del
// núcleo), Spearman si no.
import { correlacion, paresCompletos } from '../core/stats/correlacion.js';
import { varianza, asimetria as asimetriaNucleo, curtosis as curtosisNucleo } from '../core/stats/descriptivos.js';
import { rangosPromedio } from '../core/stats/orden.js';
import { pruebaNormalidad } from '../core/stats/normalidad.js';
import { columnaNumerica } from '../core/data/celdas.js';

/**
 * r de Pearson de dos listas, truncadas a la menor; 0 si alguna variable es constante o hay menos de 2 pares, NaN con un
 * dato inválido. (La matriz le pasa pares completos: la truncación ya no empareja casos distintos.)
 * @param {number[] | Float64Array} a
 * @param {number[] | Float64Array} b
 * @returns {number}
 */
export function correlacionPearsonSimple(a, b) {
    const n = Math.min(a.length, b.length);
    if (n < 2) return 0;
    const x = a.length === n ? a : a.slice(0, n), y = b.length === n ? b : b.slice(0, n), r = correlacion(x, y);
    if (!Number.isNaN(r)) return r;
    return varianza(x) === 0 || varianza(y) === 0 ? 0 : NaN;   // (2026.12.12) del núcleo; 0 si alguna es constante, como antes
}

/**
 * ρ de Spearman simple: Pearson sobre los rangos (empates promediados), con las mismas reglas que la de Pearson.
 * @param {number[] | Float64Array} a
 * @param {number[] | Float64Array} b
 * @returns {number}
 */
export function correlacionSpearmanSimple(a, b) {
    const n = Math.min(a.length, b.length);
    if (n < 2) return 0;
    return correlacionPearsonSimple(rangosPromedio(a.slice(0, n)), rangosPromedio(b.slice(0, n)));   // (2026.12.12) del núcleo único
}

/**
 * Normalidad aproximada para elegir el coeficiente coherente con el análisis (Pearson si ambas variables son normales;
 * Spearman si no): la prueba y la regla del núcleo (Shapiro-Wilk o Kolmogórov-Smirnov con Lilliefors) y, si no puede
 * calcularse, los momentos (|asimetría| < 2 y |curtosis| < 7). Con menos de 3 valores o sin variabilidad, normal.
 * @param {number[]} v
 * @returns {boolean}
 */
export function esAproxNormalSimple(v) {
    const n = v.length;
    if (n < 3) return true;
    if (varianza(v) === 0) return true;
    try {
        const r = pruebaNormalidad(v);   // (2026.12.16) la prueba y la regla del núcleo único
        if (Number.isFinite(r.pValor)) return r.normal;
    } catch (e) { /* respaldo por momentos */ }
    // respaldo: asimetría y curtosis ajustadas del núcleo (2026.12.19; antes, los momentos sin ajustar)
    const a = asimetriaNucleo(v), c = curtosisNucleo(v);
    return !(Math.abs(a) >= 2) && !(Math.abs(c) >= 7);
}

/**
 * Valores finitos de una columna alineada (para la normalidad, las cajas y la distribución).
 * @param {ArrayLike<number>} columna
 * @returns {number[]}
 */
export function valoresFinitos(columna) { return Array.prototype.filter.call(columna, Number.isFinite); }

/**
 * @typedef {object} MatrizPorPares
 * @property {boolean[]} normales     normalidad de cada variable (con todos sus valores)
 * @property {number[][]} r           coeficiente exacto de cada par (1 en la diagonal)
 * @property {number[][]} n           número de pares completos de cada par (en la diagonal, los valores de la variable)
 * @property {boolean[][]} pearson    true si el par usa Pearson; false, Spearman
 */

/**
 * Matriz de correlaciones con eliminación por pares (SPSS, por defecto): cada celda con los casos que tienen las DOS
 * variables. La normalidad de cada variable se evalúa con todos sus valores, como en el resto de la matriz.
 * @param {ArrayLike<Record<string, any>>} datos
 * @param {string[]} columnas
 * @returns {MatrizPorPares}
 */
export function matrizPorPares(datos, columnas) {
    // las columnas alineadas por fila con la conversión de todo el Analizador (core/data/celdas.js: NaN si falta o no es
    // un número; +valor, que usaba el Word, convertía en 0 la celda vacía de un CSV)
    const cols = columnas.map(c => columnaNumerica(datos, c)), finitos = cols.map(valoresFinitos), normales = finitos.map(esAproxNormalSimple);
    const k = cols.length, r = Array.from({ length: k }, () => new Array(k).fill(1)), n = Array.from({ length: k }, (_, i) => new Array(k).fill(finitos[i].length));
    const pearson = Array.from({ length: k }, () => new Array(k).fill(true));
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
        const { x, y } = paresCompletos(cols[i], cols[j]), usarPearson = normales[i] && normales[j];
        const v = usarPearson ? correlacionPearsonSimple(x, y) : correlacionSpearmanSimple(x, y);
        r[i][j] = r[j][i] = v; n[i][j] = n[j][i] = x.length; pearson[i][j] = pearson[j][i] = usarPearson;
    }
    return { normales, r, n, pearson };
}
