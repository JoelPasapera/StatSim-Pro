// @ts-check
// core/stats/protocolo-grupos.js — EL protocolo de comparación de grupos independientes (2026.12.20): una sola regla para la
// vista principal del Analizador, su pestaña de comparación de grupos, el informe de Word y la criba sociodemográfica.
// Hasta la 2026.12.19 cada vista decidía por su cuenta y, con tres o más grupos, divergían en dos puntos. Con grupos normales
// pero varianzas desiguales (Levene p ≤ .05), la vista principal aplicaba el ANOVA clásico, cuyo p pierde la calibración
// (sobre todo con grupos de tamaños distintos), y la pestaña pasaba a Kruskal-Wallis, que tampoco la conserva: contrasta si
// las distribuciones son iguales, y con varianzas distintas no lo son aunque las medias coincidan. Y los post-hoc eran t de
// Student por pares con Bonferroni en una vista y t de Welch con Holm en la otra. Ahora, en todas:
//   · 2 grupos: t de Student (normales y Levene p > .05), t de Welch (normales y Levene p ≤ .05) o U de Mann-Whitney (alguno
//     no normal), como hasta ahora;
//   · 3 o más: ANOVA de un factor, ANOVA de Welch (lo análogo a la t de Welch: la «prueba robusta» de SPSS, oneway.test de R)
//     o Kruskal-Wallis, con la misma regla; si la prueba global es significativa, comparaciones por pares con el MISMO modelo
//     de error que ella (t con la MCE del ANOVA, t de Welch, z de Dunn) y la corrección de Holm, que controla la tasa de
//     error familiar como Bonferroni y es uniformemente más potente.
// La normalidad es la del núcleo (Shapiro-Wilk con n < 50, Lilliefors con n ≥ 50) y la homogeneidad, la Levene centrada en
// la media (la de SPSS). Los dos supuestos se contrastan a .05, el nivel convencional, con independencia del α del estudio,
// que solo decide la significación de la prueba global y de los pares. Los nombres de las pruebas globales y la redacción
// son de cada vista; los de los post-hoc, comunes (NOMBRE_POSTHOC).
import { pruebaNormalidad } from './normalidad.js';
import { levene, tStudent, tWelch, mannWhitney, anova, anovaWelch, kruskal, comparacionesPorPares } from './contrastes.js';
import { ajustarHolm } from './multiples.js';

/** Nivel al que se contrastan los supuestos: la normalidad de cada grupo y la homogeneidad de varianzas (Levene). */
export const ALFA_SUPUESTOS = 0.05;

/**
 * Máximo de grupos que el programa compara (el de la vista principal desde siempre; desde la 2026.12.20, también el de la
 * pestaña, el Word y la criba): con más, la variable no es de agrupación (un identificador, un texto libre) o conviene
 * reunir sus categorías, y el post-hoc pasaría de 45 pares.
 */
export const MAX_GRUPOS = 10;

/** @typedef {'student' | 'welch' | 'mann-whitney' | 'anova' | 'anova-welch' | 'kruskal-wallis'} ClavePrueba */
/** @typedef {'mce' | 'welch' | 'dunn'} ClavePostHoc */
/**
 * El resultado de la prueba global, tal como lo da core/stats/contrastes.js: { t, gl, pValor, d } (Student, Welch),
 * { U, z, pValor, r } (Mann-Whitney), { F, gl1, gl2, pValor, eta2 } (ANOVA y ANOVA de Welch) o { H, gl, pValor, epsilon2 }
 * (Kruskal-Wallis).
 * @typedef {ReturnType<typeof tStudent> | ReturnType<typeof mannWhitney> | ReturnType<typeof anova> | ReturnType<typeof kruskal>} ResultadoGlobal
 */
/** @typedef {{ i: number, j: number, estadistico: number, gl: number | null, pValor: number, pHolm: number, significativa: boolean }} ParPostHoc */

/** El nombre de la prueba de cada post-hoc, el mismo en todas las vistas. */
export const NOMBRE_POSTHOC = Object.freeze({ mce: 't de Student (MCE)', welch: 't de Welch', dunn: 'z de Dunn' });

/**
 * La regla de elección de la prueba global.
 * @param {number} k número de grupos (2 o más)
 * @param {boolean} todasNormales todos los grupos pasan la prueba de normalidad
 * @param {boolean} homogeneas Levene no rechaza la igualdad de varianzas
 * @returns {ClavePrueba}
 */
export function elegirPrueba(k, todasNormales, homogeneas) {
    if (!todasNormales) return k === 2 ? 'mann-whitney' : 'kruskal-wallis';
    if (homogeneas) return k === 2 ? 'student' : 'anova';
    return k === 2 ? 'welch' : 'anova-welch';
}

/**
 * El post-hoc que acompaña a cada prueba global de tres o más grupos: el de su mismo modelo de error.
 * @param {ClavePrueba} prueba
 * @returns {ClavePostHoc | null} null para las pruebas de dos grupos, que no lo necesitan
 */
export function postHocDe(prueba) {
    switch (prueba) {
        case 'anova': return 'mce';
        case 'anova-welch': return 'welch';
        case 'kruskal-wallis': return 'dunn';
        default: return null;
    }
}

/**
 * Comparaciones por pares con la corrección de Holm (core/stats/multiples.js), en el orden (0, 1), (0, 2), …, (1, 2), …
 * @param {ArrayLike<number>[]} grupos
 * @param {ClavePostHoc} metodo
 * @param {{ alfa?: number }} [opciones] alfa: el nivel con el que se juzga cada p ajustado (0.05 por defecto)
 * @returns {ParPostHoc[]}
 */
export function postHocHolm(grupos, metodo, { alfa = 0.05 } = {}) {
    const pares = comparacionesPorPares(grupos, metodo), holm = ajustarHolm(pares.map(p => p.pValor));
    return pares.map((p, a) => { const pHolm = /** @type {number} */ (holm[a]); return { ...p, pHolm, significativa: pHolm < alfa }; });
}

/**
 * @param {ClavePrueba} prueba
 * @param {ArrayLike<number>[]} grupos
 * @returns {ResultadoGlobal}
 */
function ejecutar(prueba, grupos) {
    const [a, b] = /** @type {[ArrayLike<number>, ArrayLike<number>]} */ (grupos);
    switch (prueba) {
        case 'student': return tStudent(a, b);
        case 'welch': return tWelch(a, b);
        case 'mann-whitney': return mannWhitney(a, b);
        case 'anova': return anova(grupos);
        case 'anova-welch': return anovaWelch(grupos);
        default: return kruskal(grupos);
    }
}

/**
 * El protocolo completo: supuestos, elección, prueba global y, con tres o más grupos y la global significativa, el post-hoc
 * con Holm. Cada vista traduce el resultado a su formato y a su redacción.
 * @param {ArrayLike<number>[]} grupos dos o más grupos de al menos tres casos; qué hacer con los pequeños lo decide quien llama
 *   (la vista principal los rechaza; la pestaña, el Word y la criba los excluyen)
 * @param {{ alfa?: number }} [opciones] alfa: el nivel de significación del estudio (0.05 por defecto)
 * @returns {{ k: number, normalidad: ReturnType<typeof pruebaNormalidad>[], todasNormales: boolean,
 *   levene: ReturnType<typeof levene>, homogeneas: boolean, prueba: ClavePrueba, rama: 'parametrica' | 'noparametrica',
 *   global: ResultadoGlobal, significativa: boolean,
 *   postHoc: { metodo: ClavePostHoc, nombre: string, ajuste: 'Holm', pares: ParPostHoc[] } | null }}
 */
export function protocoloGrupos(grupos, { alfa = 0.05 } = {}) {
    const k = grupos.length;
    if (k < 2) throw new Error('La comparación de grupos necesita al menos dos grupos.');
    if (grupos.some(g => g.length < 3)) throw new Error('Cada grupo necesita al menos 3 observaciones');
    const normalidad = grupos.map(g => pruebaNormalidad(g));
    const todasNormales = normalidad.every(r => r.normal);
    const lev = levene(grupos), homogeneas = lev.pValor > ALFA_SUPUESTOS;
    const prueba = elegirPrueba(k, todasNormales, homogeneas), global = ejecutar(prueba, grupos);
    const significativa = global.pValor < alfa, metodo = k >= 3 && significativa ? postHocDe(prueba) : null;
    return {
        k, normalidad, todasNormales, levene: lev, homogeneas, prueba, rama: todasNormales ? 'parametrica' : 'noparametrica',
        global, significativa,
        postHoc: metodo ? { metodo, nombre: NOMBRE_POSTHOC[metodo], ajuste: 'Holm', pares: postHocHolm(grupos, metodo, { alfa }) } : null
    };
}
