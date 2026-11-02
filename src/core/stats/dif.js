// @ts-check
// core/stats/dif.js — (2027.01.19) el funcionamiento diferencial de los ítems (DIF) por regresión logística (Swaminathan y
// Rogers, 1990; Zumbo, 1999), ordinal para los ítems politómicos (core/stats/logit-ordinal.js): para cada ítem, tres modelos
// anidados con el puntaje total del instrumento como criterio de emparejamiento —M1: total; M2: total + grupo; M3: total +
// grupo + total × grupo— y sus razones de verosimilitud: el DIF total (M3 frente a M1), el uniforme (M2 frente a M1) y el no
// uniforme (M3 frente a M2), con G − 1 gl cada parte para G grupos; el tamaño, el ΔR² de Nagelkerke de M1 a M3, con la
// clasificación de Jodoin y Gierl (2001): insignificante (A) si no es significativo o ΔR² < .035, moderado (B) hasta .070 y
// grande (C) desde .070; la significación, la del DIF total con la p ajustada por Holm entre los ítems. El total, con la regla
// del 80 % del Analizador (core/data/celdas.js: si falta algún ítem, la media de los respondidos por el número de ítems); en
// cada ítem, las personas que lo respondieron. Sin DOM.
// (2027.01.20, revisión) El total, con los valores de las respuestas (los de cada categoría, si se dan: el mismo que el del
// Analizador; con las categorías 0 … K − 1 de cada ítem, un ítem que no usa su opción más baja, o una intermedia, cambiaba el
// total de algunas personas); los grupos de menos de 10 personas, fuera (con 1 o 2, el indicador del grupo y su interacción
// se confunden y el χ² salía 0), con su aviso; un ítem cuyos modelos anidados no ajustan como tales (M2 o M3 por debajo del
// anterior), no calculable; el DIF de un ítem cuyas dos partes no son significativas por separado, de tipo «no determinado»
// (antes, «uniforme»); y el progreso por ítem, para el Worker.
import { ajustarLogitOrdinal, logVerosimilitudNula, r2Nagelkerke } from './logit-ordinal.js';
import { pChiCuadrado } from './distribuciones.js';
import { ajustarHolm } from './multiples.js';
import { totalConProrrateo } from '../data/celdas.js';

/** Los cortes de ΔR² de Jodoin y Gierl (2001). */
export const CORTES_JODOIN_GIERL = Object.freeze({ moderado: 0.035, grande: 0.07 });

/** Las personas que necesita un grupo para entrar en el DIF. */
export const MINIMO_GRUPO_DIF = 10;

/**
 * @typedef {{ item: number, K: number, n: number, valido: false, motivo: string } | {
 *   item: number, K: number, n: number, valido: true, convergio: boolean,
 *   chi2Total: number, glTotal: number, pTotal: number, pHolm: number,
 *   chi2Uniforme: number, glUniforme: number, pUniforme: number,
 *   chi2NoUniforme: number, glNoUniforme: number, pNoUniforme: number,
 *   r2: [number, number, number], deltaR2: number, deltaR2Uniforme: number,
 *   logVerosimilitud: [number, number, number], efectoGrupo: number[], tipo: 'uniforme' | 'no uniforme' | 'mixto' | 'no determinado',
 *   clasificacion: 'A' | 'B' | 'C' }} ItemDIF
 *   efectoGrupo: el de cada grupo frente al primero en M2 (en logits: positivo, el grupo puntúa más alto a igual total);
 *   tipo: uniforme si solo lo es el efecto del grupo; no uniforme si solo la interacción; mixto si las dos; no determinado si
 *   ninguna por separado (el DIF total puede serlo); motivo: por qué un ítem no se pudo calcular
 */

/**
 * El DIF de unos ítems.
 * @param {Int8Array[]} X J ítems × n personas, categorías 0 … K_j − 1 (−1: perdido)
 * @param {ArrayLike<number>} grupo el grupo de cada persona, un entero desde 0 (−1: sin grupo)
 * @param {{ alfa?: number, minimo?: number, categorias?: ArrayLike<number>[] | null, minimoGrupo?: number,
 *   alProgreso?: ((hecho: number, total: number) => void) | null }} [opciones] minimo: la proporción de ítems respondidos
 *   para calcular el total; categorias: el valor de cada categoría de cada ítem (los de prepararRespuestas), con los que se
 *   suma el total (sin ellos, las categorías); minimoGrupo: las personas que necesita un grupo para entrar
 * @returns {{ n: number, G: number, grupos: number[], tamanos: number[], excluidos: { grupo: number, n: number }[],
 *   items: ItemDIF[], alfa: number }} grupos: los códigos presentes, en orden (el primero, el de referencia); tamanos: las
 *   personas de cada uno; excluidos: los grupos con menos de minimoGrupo personas (fuera del análisis)
 */
export function difRegresionLogistica(X, grupo, { alfa = 0.05, minimo = 0.8, categorias = null, minimoGrupo = MINIMO_GRUPO_DIF, alProgreso = null } = {}) {
    const J = X.length, n = J ? /** @type {Int8Array} */ (X[0]).length : 0;
    const valor = (/** @type {number} */ j, /** @type {number} */ c) => (categorias ? /** @type {number} */ (/** @type {ArrayLike<number>} */ (categorias[j])[c]) : c);
    // las personas con grupo y con el total (la regla del 80 %)
    /** @type {number[]} */ let filas = [];
    /** @type {number[]} */ let totales = [];
    const fila = new Float64Array(J);
    for (let i = 0; i < n; i++) {
        if (!(/** @type {number} */ (grupo[i]) >= 0)) continue;
        for (let j = 0; j < J; j++) { const c = /** @type {number} */ (/** @type {Int8Array} */ (X[j])[i]); fila[j] = c >= 0 ? valor(j, c) : NaN; }
        const t = totalConProrrateo(fila, J, minimo);
        if (Number.isFinite(t)) { filas.push(i); totales.push(t); }
    }
    // los grupos con al menos minimoGrupo personas (los demás, fuera), con códigos consecutivos (el primero, de referencia)
    /** @type {Map<number, number>} */ const cuenta = new Map();
    for (const i of filas) { const g = /** @type {number} */ (grupo[i]); cuenta.set(g, (cuenta.get(g) || 0) + 1); }
    const excluidos = [...cuenta.entries()].filter(([, m]) => m < minimoGrupo).sort((a, b) => a[0] - b[0]).map(([g, m]) => ({ grupo: g, n: m }));
    if (excluidos.length) {
        const fuera = new Set(excluidos.map(e => e.grupo)), quedan = filas.map((i, r) => (fuera.has(/** @type {number} */ (grupo[i])) ? -1 : r)).filter(r => r >= 0);
        filas = quedan.map(r => /** @type {number} */ (filas[r])); totales = quedan.map(r => /** @type {number} */ (totales[r]));
    }
    const grupos = [...new Set(filas.map(i => /** @type {number} */ (grupo[i])))].sort((a, b) => a - b), codigo = new Map(grupos.map((g, k) => [g, k]));
    const G = grupos.length;
    if (G < 2) throw new Error(`El DIF necesita al menos dos grupos con ${minimoGrupo} personas o más que respondan`);
    const tamanos = new Array(G).fill(0);
    for (const i of filas) tamanos[/** @type {number} */ (codigo.get(/** @type {number} */ (grupo[i])))]++;
    // el total centrado (la interacción no se confunde con los efectos principales)
    let mt = 0;
    for (const t of totales) mt += t;
    mt /= totales.length;
    /** @type {ItemDIF[]} */ const items = [];
    for (let j = 0; j < J; j++) {
        const x = /** @type {Int8Array} */ (X[j]), usadas = [];
        for (let r = 0; r < filas.length; r++) if (/** @type {number} */ (x[/** @type {number} */ (filas[r])]) >= 0) usadas.push(r);
        // las categorías presentes en los casos usados, consecutivas
        const presentes = [...new Set(usadas.map(r => /** @type {number} */ (x[/** @type {number} */ (filas[r])])))].sort((a, b) => a - b), mapa = new Map(presentes.map((c, k) => [c, k]));
        const N = usadas.length, K = presentes.length;
        const g = Int32Array.from(usadas, r => /** @type {number} */ (codigo.get(/** @type {number} */ (grupo[/** @type {number} */ (filas[r])]))));
        if (K < 2 || new Set(g).size < G) { items.push({ item: j, K, n: N, valido: false, motivo: K < 2 ? 'una sola respuesta' : 'algún grupo no lo respondió' }); if (alProgreso) alProgreso(j + 1, J); continue; }
        const y = Int8Array.from(usadas, r => /** @type {number} */ (mapa.get(/** @type {number} */ (x[/** @type {number} */ (filas[r])]))));
        const tc = Float64Array.from(usadas, r => /** @type {number} */ (totales[r]) - mt);
        const indicadores = Array.from({ length: G - 1 }, (_, k) => Float64Array.from(g, v => (v === k + 1 ? 1 : 0)));
        const interacciones = indicadores.map(ind => Float64Array.from(ind, (v, r) => v * /** @type {number} */ (tc[r])));
        const m1 = ajustarLogitOrdinal(y, [tc]), m2 = ajustarLogitOrdinal(y, [tc, ...indicadores]), m3 = ajustarLogitOrdinal(y, [tc, ...indicadores, ...interacciones]);
        // los modelos anidados no pueden ajustar peor que el anterior (salvo el redondeo): si lo hacen, alguno no llegó al máximo
        if (!m1 || !m2 || !m3 || m2.logVerosimilitud < m1.logVerosimilitud - 1e-6 || m3.logVerosimilitud < m2.logVerosimilitud - 1e-6) {
            items.push({ item: j, K, n: N, valido: false, motivo: 'las regresiones no convergieron' }); if (alProgreso) alProgreso(j + 1, J); continue;
        }
        const ll0 = logVerosimilitudNula(y, K);
        const r2 = /** @type {[number, number, number]} */ ([m1, m2, m3].map(m => r2Nagelkerke(m.logVerosimilitud, ll0, N)));
        const chi2Total = Math.max(0, 2 * (m3.logVerosimilitud - m1.logVerosimilitud)), chi2U = Math.max(0, 2 * (m2.logVerosimilitud - m1.logVerosimilitud)), chi2NU = Math.max(0, 2 * (m3.logVerosimilitud - m2.logVerosimilitud));
        const gl = G - 1, pU = pChiCuadrado(chi2U, gl), pNU = pChiCuadrado(chi2NU, gl);
        items.push({
            item: j, K, n: N, valido: true, convergio: m1.convergio && m2.convergio && m3.convergio,
            chi2Total, glTotal: 2 * gl, pTotal: pChiCuadrado(chi2Total, 2 * gl), pHolm: NaN,
            chi2Uniforme: chi2U, glUniforme: gl, pUniforme: pU, chi2NoUniforme: chi2NU, glNoUniforme: gl, pNoUniforme: pNU,
            r2, deltaR2: r2[2] - r2[0], deltaR2Uniforme: r2[1] - r2[0],
            logVerosimilitud: [m1.logVerosimilitud, m2.logVerosimilitud, m3.logVerosimilitud], efectoGrupo: m2.beta.slice(1),
            tipo: pNU < alfa ? (pU < alfa ? 'mixto' : 'no uniforme') : pU < alfa ? 'uniforme' : 'no determinado', clasificacion: 'A'
        });
        if (alProgreso) alProgreso(j + 1, J);
    }
    // la p del DIF total ajustada por Holm entre los ítems, y la clasificación con ella
    const validos = /** @type {Extract<ItemDIF, { valido: true }>[]} */ (items.filter(it => it.valido));
    const ajustadas = ajustarHolm(validos.map(it => it.pTotal));
    validos.forEach((it, k) => {
        it.pHolm = /** @type {number} */ (ajustadas[k]);
        it.clasificacion = !(it.pHolm < alfa) || it.deltaR2 < CORTES_JODOIN_GIERL.moderado ? 'A' : it.deltaR2 < CORTES_JODOIN_GIERL.grande ? 'B' : 'C';
    });
    return { n: filas.length, G, grupos, tamanos, excluidos, items, alfa };
}
