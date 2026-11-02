// @ts-check
// core/stats/roc.js — (2027.01.18) la curva ROC de una puntuación frente a un criterio dicotómico (la validez de criterio de un
// test de cribado): el área bajo la curva (AUC = P(caso > no caso) + ½ P(empate), la U de Mann-Whitney entre n₁n₀) con su
// error típico de DeLong, DeLong y Clarke-Pearson (1988) por sus componentes estructurales (calculados con rangos medios, como
// Sun y Xu, 2014) y su intervalo (el de pROC por defecto: AUC ± z·EE, dentro de [0, 1]); la prueba de AUC = .5 (la de
// Mann-Whitney, con la corrección por empates); y cada punto de corte (positivo si la puntuación es ≥ el corte, o ≤ si las
// puntuaciones bajas indican el caso) con su sensibilidad, especificidad, índice de Youden (1950), valores predictivos con la
// prevalencia de la muestra y razones de verosimilitud; el óptimo, el de mayor J, con los intervalos de Wilson (1927). Sin DOM.
import { rangosPromedio } from './orden.js';
import { varianza } from './descriptivos.js';
import { mannWhitney } from './contrastes.js';
import { zBilateral } from './normal.js';

/** @typedef {'mayor' | 'menor'} SentidoROC mayor: las puntuaciones altas indican el caso (positivo si ≥ corte) */

/**
 * El intervalo de Wilson de una proporción.
 * @param {number} exitos
 * @param {number} n
 * @param {number} [nivel]
 * @returns {[number, number]}
 */
export function intervaloWilson(exitos, n, nivel = 0.95) {
    if (!(n > 0)) return [NaN, NaN];
    const z = zBilateral(nivel), p = exitos / n, z2 = z * z, den = 1 + z2 / n;
    const centro = (p + z2 / (2 * n)) / den, medio = z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n)) / den;
    return [Math.max(0, centro - medio), Math.min(1, centro + medio)];
}

/**
 * El AUC con su error típico de DeLong.
 * @param {ArrayLike<number>} casos las puntuaciones de los casos (positivos del criterio)
 * @param {ArrayLike<number>} noCasos las de los no casos
 * @returns {{ auc: number, ee: number, v10: Float64Array, v01: Float64Array }}
 */
export function aucDeLong(casos, noCasos) {
    const n1 = casos.length, n0 = noCasos.length;
    const todos = [...Array.from(casos), ...Array.from(noCasos)];
    const rTodos = rangosPromedio(todos), rCasos = rangosPromedio(casos), rNo = rangosPromedio(noCasos);
    // V10ᵢ: la proporción de no casos por debajo del caso i (los empates, ½); V01ⱼ: la de casos por encima del no caso j
    const v10 = Float64Array.from({ length: n1 }, (_, i) => (/** @type {number} */ (rTodos[i]) - /** @type {number} */ (rCasos[i])) / n0);
    const v01 = Float64Array.from({ length: n0 }, (_, j) => 1 - (/** @type {number} */ (rTodos[n1 + j]) - /** @type {number} */ (rNo[j])) / n1);
    let auc = 0;
    for (let i = 0; i < n1; i++) auc += /** @type {number} */ (v10[i]);
    auc /= n1;
    const ee = Math.sqrt((n1 > 1 ? varianza(v10) / n1 : 0) + (n0 > 1 ? varianza(v01) / n0 : 0));
    return { auc, ee, v10, v01 };
}

/**
 * Un punto de corte: la tabla 2 × 2 y sus índices.
 * @param {number} vp verdaderos positivos @param {number} fn @param {number} fp @param {number} vn
 */
function indices(vp, fn, fp, vn) {
    const sensibilidad = vp / (vp + fn), especificidad = vn / (vn + fp);
    return {
        vp, fn, fp, vn, sensibilidad, especificidad, youden: sensibilidad + especificidad - 1,
        vpp: vp + fp > 0 ? vp / (vp + fp) : NaN, vpn: vn + fn > 0 ? vn / (vn + fn) : NaN,
        rvPositiva: especificidad < 1 ? sensibilidad / (1 - especificidad) : Infinity, rvNegativa: especificidad > 0 ? (1 - sensibilidad) / especificidad : Infinity,
        exactitud: (vp + vn) / (vp + fn + fp + vn)
    };
}

/**
 * La curva ROC completa.
 * @param {ArrayLike<number>} puntuaciones
 * @param {ArrayLike<boolean>} esCaso
 * @param {{ sentido?: SentidoROC | 'auto', nivel?: number }} [opciones] auto: el sentido con AUC ≥ .5
 * @returns {{ n1: number, n0: number, sentido: SentidoROC, invertido: boolean, auc: number, ee: number, inferior: number, superior: number,
 *   mannWhitney: { U: number, z: number, pValor: number }, cortes: (ReturnType<typeof indices> & { corte: number })[],
 *   optimo: ReturnType<typeof indices> & { corte: number, icSensibilidad: [number, number], icEspecificidad: [number, number],
 *   icVpp: [number, number], icVpn: [number, number] }, curva: { fpr: number, tpr: number, corte: number | null }[], prevalencia: number, nivel: number } | null}
 *   null si falta alguno de los dos grupos; cortes, del más exigente al menos (de la esquina (0, 0) a la (1, 1)); invertido:
 *   el sentido automático resultó «menor»
 */
export function curvaROC(puntuaciones, esCaso, { sentido = 'auto', nivel = 0.95 } = {}) {
    /** @type {number[]} */ const casos = [];
    /** @type {number[]} */ const noCasos = [];
    for (let i = 0; i < puntuaciones.length; i++) (esCaso[i] ? casos : noCasos).push(/** @type {number} */ (puntuaciones[i]));
    const n1 = casos.length, n0 = noCasos.length;
    if (!n1 || !n0) return null;
    let D = aucDeLong(casos, noCasos), s = /** @type {SentidoROC} */ (sentido === 'menor' ? 'menor' : 'mayor');
    if (sentido === 'auto' && D.auc < 0.5) { s = 'menor'; }
    if (s === 'menor') D = aucDeLong(casos.map(x => -x), noCasos.map(x => -x));
    const z = zBilateral(nivel);
    const mw = mannWhitney(casos, noCasos);
    // los cortes: cada valor distinto; positivo si x ≥ c (sentido mayor) o x ≤ c (menor), del más exigente al menos
    const distintos = [...new Set([...casos, ...noCasos])].sort((a, b) => (s === 'mayor' ? b - a : a - b));
    const positivo = (/** @type {number} */ x, /** @type {number} */ c) => (s === 'mayor' ? x >= c : x <= c);
    const cortes = distintos.map(c => {
        let vp = 0, fp = 0;
        for (const x of casos) if (positivo(x, c)) vp++;
        for (const x of noCasos) if (positivo(x, c)) fp++;
        return { corte: c, ...indices(vp, n1 - vp, fp, n0 - fp) };
    });
    // el óptimo: el mayor J; a igualdad, el más cercano a la esquina (0, 1) y, después, el más exigente
    let mejor = /** @type {(typeof cortes)[number]} */ (cortes[0]);
    const distancia = (/** @type {(typeof cortes)[number]} */ k) => (1 - k.sensibilidad) ** 2 + (1 - k.especificidad) ** 2;
    for (const k of cortes) if (k.youden > mejor.youden + 1e-12 || (Math.abs(k.youden - mejor.youden) <= 1e-12 && distancia(k) < distancia(mejor) - 1e-12)) mejor = k;
    const optimo = { ...mejor, icSensibilidad: intervaloWilson(mejor.vp, n1, nivel), icEspecificidad: intervaloWilson(mejor.vn, n0, nivel), icVpp: intervaloWilson(mejor.vp, mejor.vp + mejor.fp, nivel), icVpn: intervaloWilson(mejor.vn, mejor.vn + mejor.fn, nivel) };
    const curva = [{ fpr: 0, tpr: 0, corte: null }, ...cortes.map(k => ({ fpr: 1 - k.especificidad, tpr: k.sensibilidad, corte: k.corte }))];
    return {
        n1, n0, sentido: s, invertido: sentido === 'auto' && s === 'menor', auc: D.auc, ee: D.ee,
        inferior: Math.max(0, D.auc - z * D.ee), superior: Math.min(1, D.auc + z * D.ee),
        mannWhitney: { U: mw.U, z: mw.z, pValor: mw.pValor }, cortes, optimo, curva, prevalencia: n1 / (n1 + n0), nivel
    };
}
