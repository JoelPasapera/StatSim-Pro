// @ts-check
// analizador/relacionadas/deteccion.js — (2027.01.17) qué columnas de una base son medidas repetidas de lo mismo, qué
// columnas pueden ser el factor entre sujetos de un diseño mixto, y la matriz de casos completos que se analiza. Sin DOM.
//   · las ondas del Simulador: la onda 1 con su nombre y las demás con «_T2», «_T3»… (General_ST, General_ST_T2);
//   · cualquier «_T1», «_T2»… (también «_t1», «-T1» o « T1», siempre con un separador);
//   · antes y después: «_pre» y «_post» (o «_pos», «_postest», «_pretest»; con o sin guion bajo, al final o al principio:
//     «Pre_Ansiedad», «Post_Ansiedad»), con un «_seguimiento» opcional al final.
import { aNumero, esPerdido } from '../../core/data/celdas.js';
import { MAX_GRUPOS } from '../../core/stats/protocolo-grupos.js';
import { MAX_MEDIDAS } from '../../core/stats/protocolo-relacionadas.js';

/** @typedef {Record<string, unknown>} Fila */
/** @typedef {{ clave: string, base: string, columnas: string[], nombres: string[], tipo: 'puntaje' | 'otra' | 'item' }} ConjuntoMedidas */

// (con un separador delante del momento: sin él, el ítem «ST12» sería la onda 12 de «S» y «Compre», el «pre» de «Com»)
const ONDA = /^(.+?)[_\- ][Tt](\d{1,2})$/;
const PRE_POST_FINAL = /^(.+?)[_\- ](pre|pretest|pos|post|postest|posttest|seguimiento)$/i;
const PRE_POST_INICIO = /^(pre|pretest|pos|post|postest|posttest|seguimiento)[_\- ](.+)$/i;
/** El orden de los momentos de un antes y después. @param {string} m */
const ordenMomento = m => (/^pre/i.test(m) ? 0 : /^seg/i.test(m) ? 2 : 1);
/** El nombre que se muestra de cada momento. @param {string} m */
const nombreMomento = m => (/^pre/i.test(m) ? 'Pre' : /^seg/i.test(m) ? 'Seguimiento' : 'Post');

/**
 * El tipo de lo medido, para ordenar la lista: los puntajes (General_, Dimension_, Total_, PC_) primero, los ítems
 * (sigla + número: «ST12») al final.
 * @param {string} base
 * @returns {'puntaje' | 'otra' | 'item'}
 */
function tipoDe(base) {
    if (/^(General|Dimension|Dimensión|Total|Puntaje|PC)_/i.test(base)) return 'puntaje';
    return /^[A-Za-zÁÉÍÓÚÑáéíóúñ]{1,6}_?\d{1,3}$/.test(base) ? 'item' : 'otra';
}

/**
 * Los conjuntos de medidas repetidas que se reconocen por el nombre de las columnas, de dos medidas o más (hasta
 * MAX_MEDIDAS), en el orden de sus momentos. Cada columna entra en un solo conjunto.
 * @param {string[]} columnas
 * @returns {ConjuntoMedidas[]}
 */
export function detectarConjuntosMedidas(columnas) {
    const existe = new Set(columnas), usadas = new Set();
    /** @type {ConjuntoMedidas[]} */ const conjuntos = [];
    /** @param {string} base @param {[number, string, string][]} miembros [orden, columna, nombre] @param {string} clave */
    const agregar = (base, miembros, clave) => {
        const libres = miembros.filter(([, c]) => !usadas.has(c)).sort((a, b) => a[0] - b[0]).slice(0, MAX_MEDIDAS);
        if (libres.length < 2) return;
        libres.forEach(([, c]) => usadas.add(c));
        conjuntos.push({ clave, base, columnas: libres.map(m => m[1]), nombres: libres.map(m => m[2]), tipo: tipoDe(base) });
    };
    // las ondas: «X» (onda 1, la del Simulador) o «X_T1», y «X_T2», «X_T3»…
    /** @type {Map<string, [number, string, string][]>} */ const ondas = new Map();
    for (const c of columnas) {
        const m = ONDA.exec(c);
        if (!m || !m[1]) continue;
        const base = /** @type {string} */ (m[1]), k = Number(m[2]);
        (ondas.get(base) || ondas.set(base, []).get(base) || []).push([k, c, `T${k}`]);
    }
    for (const [base, miembros] of ondas) {
        if (!miembros.some(([k]) => k === 1) && existe.has(base)) miembros.push([1, base, 'T1']);
        agregar(base, miembros, `ondas:${base}`);
    }
    // antes y después, al final o al principio del nombre
    /** @type {Map<string, [number, string, string][]>} */ const prePost = new Map();
    for (const c of columnas) {
        if (usadas.has(c)) continue;
        const f = PRE_POST_FINAL.exec(c), i = f ? null : PRE_POST_INICIO.exec(c);
        const base = f ? f[1] : i ? i[2] : null, momento = f ? f[2] : i ? i[1] : null;
        if (!base || !momento) continue;
        (prePost.get(base) || prePost.set(base, []).get(base) || []).push([ordenMomento(momento), c, nombreMomento(momento)]);
    }
    for (const [base, miembros] of prePost) if (new Set(miembros.map(m => m[0])).size === miembros.length) agregar(base, miembros, `prepost:${base}`);
    const peso = { puntaje: 0, otra: 1, item: 2 };
    return conjuntos.sort((a, b) => peso[a.tipo] - peso[b.tipo]);
}

/**
 * Los valores distintos no perdidos de una columna, como texto, hasta pasar de `tope`.
 * @param {Fila[]} filas
 * @param {string} columna
 * @param {number} tope
 * @returns {string[] | null} null si pasa de `tope` o si hay números no enteros (una variable continua)
 */
function valoresDistintos(filas, columna, tope) {
    const vistos = new Set();
    for (const f of filas) {
        const v = f[columna];
        if (esPerdido(v)) continue;
        const x = aNumero(v);
        if (Number.isFinite(x) && !Number.isInteger(x)) return null;
        vistos.add(String(v).trim());
        if (vistos.size > tope) return null;
    }
    return [...vistos];
}

/**
 * Las columnas que pueden ser el factor entre sujetos: de 2 a MAX_GRUPOS valores distintos (texto o enteros), salvo las que
 * se excluyen (las medidas, el identificador).
 * @param {Fila[]} filas
 * @param {string[]} [excluir]
 * @returns {{ columna: string, niveles: string[] }[]}
 */
export function candidatosFactorEntre(filas, excluir = []) {
    if (!filas.length) return [];
    const fuera = new Set(['ID', ...excluir]);
    return Object.keys(/** @type {Fila} */ (filas[0])).filter(c => !fuera.has(c)).flatMap(c => {
        const v = valoresDistintos(filas, c, MAX_GRUPOS);
        return v && v.length >= 2 ? [{ columna: c, niveles: v }] : [];
    });
}

/**
 * La matriz de casos completos de unas medidas (y del factor, si lo hay): los casos con alguna medida perdida o sin grupo
 * quedan fuera (eliminación por lista, la de SPSS en el modelo lineal general de medidas repetidas). Los grupos, en el orden
 * de sus niveles (numérico si todos son números; si no, alfabético).
 * @param {Fila[]} filas
 * @param {string[]} columnas
 * @param {string | null} [factor]
 * @returns {{ Y: number[][], grupos: number[] | null, niveles: string[], excluidos: number, noNumericas: string[] }}
 */
export function extraerMatriz(filas, columnas, factor = null) {
    const noNumericas = columnas.filter(c => filas.some(f => !esPerdido(f[c]) && !Number.isFinite(aNumero(f[c]))));
    if (noNumericas.length) return { Y: [], grupos: null, niveles: [], excluidos: filas.length, noNumericas };
    /** @type {number[][]} */ const Y = [];
    /** @type {string[]} */ const etiquetas = [];
    for (const f of filas) {
        const fila = columnas.map(c => aNumero(f[c]));
        if (!fila.every(Number.isFinite)) continue;
        if (factor) { const g = f[factor]; if (esPerdido(g)) continue; etiquetas.push(String(g).trim()); }
        Y.push(fila);
    }
    if (!factor) return { Y, grupos: null, niveles: [], excluidos: filas.length - Y.length, noNumericas };
    const distintos = [...new Set(etiquetas)];
    const numericos = distintos.every(s => Number.isFinite(aNumero(s)));
    const niveles = distintos.sort(numericos ? (a, b) => aNumero(a) - aNumero(b) : (a, b) => a.localeCompare(b, 'es'));
    const indice = new Map(niveles.map((s, i) => [s, i]));
    return { Y, grupos: etiquetas.map(s => /** @type {number} */ (indice.get(s))), niveles, excluidos: filas.length - Y.length, noNumericas };
}
