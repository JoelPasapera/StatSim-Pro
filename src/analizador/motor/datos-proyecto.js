// @ts-check
// analizador/motor/datos-proyecto.js — (2026.12.31) la base del Analizador (filas-objeto) por columnas y de vuelta, para el
// archivo de proyecto (analizador/ui/proyecto.js): los nombres una sola vez y los valores de cada columna en una lista,
// en lugar de repetir cada nombre en cada fila. Comprueba la forma al volver. Sin DOM.
// (2026.12.31, revisión) Y lo que un proyecto, que puede ser de otra persona, trae con los datos: los topes de casos y de
// celdas (comprobados antes de construir las filas: unos pocos KB de ceros comprimidos se convertían en decenas de millones
// de filas y la pestaña se caía), y la forma de sus etiquetas y de su estructura de pruebas.
// (2026.12.31, cuarta revisión) «datos.json» y «etiquetas.json», medidos antes de leerlos (core/data/json-acotado.js:
// JSON.parse construía la estructura entera antes de que nada la comprobara, y unas listas anidadas tumbaban la pestaña), y
// «datos.json» en JSON simple: cada celda, un número finito, un texto o null, y los números que JSON no tiene (NaN, ±∞,
// −0), como textos marcados (con core/data/json-fiel.js eran un objeto por celda: una base con muchos perdidos, millones
// de objetos al abrirla).

import { medirJson } from '../../core/data/json-acotado.js';

/**
 * @typedef {Record<string, unknown>} Fila
 * @typedef {{ columnas: string[], valores: unknown[][] }} BasePorColumnas
 * @typedef {import('../../core/data/json-acotado.js').TopesJson} TopesJson
 */

/**
 * Las filas por columnas: las columnas, en el orden en que aparecen (las de la primera fila y, si alguna fila trae otra,
 * a continuación); la celda que una fila no tiene, null.
 * @param {Fila[]} filas
 * @returns {BasePorColumnas}
 */
export function filasAColumnas(filas) {
    /** @type {string[]} */
    const columnas = [];
    const vistas = new Set();
    for (const f of filas) for (const k of Object.keys(f)) if (!vistas.has(k)) { vistas.add(k); columnas.push(k); }
    const valores = columnas.map(c => filas.map(f => (Object.prototype.hasOwnProperty.call(f, c) ? f[c] : null)));
    return { columnas, valores };
}

/** Los topes de los datos del Analizador en un proyecto: dos millones de casos, veinte millones de celdas y un millón de variables. */
export const MAXIMO_CASOS_ANALIZADOR = 2000000;
export const MAXIMO_CELDAS_ANALIZADOR = 20000000;
export const MAXIMO_VARIABLES_ANALIZADOR = 1000000;

/** La marca de una celda que JSON no tiene, delante de su nombre: U+0000 («\u0000NaN»). */
const MARCA = '\u0000';
/** @type {Record<string, number>} */
const ESPECIALES = { NaN: NaN, Infinity: Infinity, '-Infinity': -Infinity, '-0': -0 };

/**
 * Una celda como valor de «datos.json»: NaN, ±∞ y −0, como textos con la marca delante («\u0000NaN», «\u0000-0»); un texto
 * que ya empiece por ella lleva otra delante. Lo demás (números finitos, textos, null), igual.
 * @param {unknown} v
 * @returns {unknown}
 */
export function celdaAJson(v) {
    if (typeof v === 'number') {
        if (Number.isFinite(v)) return Object.is(v, -0) ? MARCA + '-0' : v;
        return MARCA + (Number.isNaN(v) ? 'NaN' : v > 0 ? 'Infinity' : '-Infinity');
    }
    if (typeof v === 'string' && v.startsWith(MARCA)) return MARCA + v;
    return v;
}

/**
 * La celda que escribió celdaAJson (lo demás, igual); undefined si lleva una marca que no se conoce.
 * @param {unknown} v
 * @returns {unknown}
 */
export function celdaDeJson(v) {
    if (typeof v !== 'string' || !v.startsWith(MARCA)) return v;
    const resto = v.slice(1);
    if (resto.startsWith(MARCA)) return resto;
    return Object.prototype.hasOwnProperty.call(ESPECIALES, resto) ? ESPECIALES[resto] : undefined;
}

/**
 * La base por columnas como texto de «datos.json», con cada celda como la escribe celdaAJson.
 * @param {BasePorColumnas} base
 * @returns {string}
 */
export function columnasAJson(base) {
    return JSON.stringify({ columnas: base.columnas, valores: base.valores.map(columna => columna.map(celdaAJson)) });
}

/** El error de unos datos más grandes que los topes. @param {number} casos @param {number} variables */
const demasiados = (casos, variables) => new Error(`los datos guardados (${casos.toLocaleString('es')} casos y ${variables.toLocaleString('es')} variables) son más de lo que el Analizador abre aquí (${MAXIMO_CASOS_ANALIZADOR.toLocaleString('es')} casos o ${MAXIMO_CELDAS_ANALIZADOR.toLocaleString('es')} celdas): cárgalos como CSV`);

/**
 * Las filas que guardó filasAColumnas (con sus celdas como las escribió celdaAJson, o tal cual).
 * @param {unknown} base
 * @param {{ casos?: number, celdas?: number }} [topes] otros (más bajos) que los de arriba, para las pruebas
 * @returns {Fila[]}
 */
export function columnasAFilas(base, topes = {}) {
    const b = /** @type {any} */ (base);
    if (!b || !Array.isArray(b.columnas) || !Array.isArray(b.valores) || b.columnas.length !== b.valores.length) throw new Error('los datos del Analizador no tienen la forma esperada');
    const n = b.valores.length ? (Array.isArray(b.valores[0]) ? b.valores[0].length : 0) : 0;
    // antes de recorrer nada: lo que se construiría
    if (n > (topes.casos ?? MAXIMO_CASOS_ANALIZADOR) || n * b.columnas.length > (topes.celdas ?? MAXIMO_CELDAS_ANALIZADOR)) throw demasiados(n, b.columnas.length);
    const vistas = new Set();
    b.columnas.forEach((/** @type {unknown} */ c, /** @type {number} */ j) => {
        if (typeof c !== 'string' || vistas.has(c)) throw new Error('los datos del Analizador traen una columna sin nombre o repetida');
        vistas.add(c);
        if (!Array.isArray(b.valores[j]) || b.valores[j].length !== n) throw new Error(`la columna «${c}» de los datos del Analizador no tiene ${n} valores`);
        for (const x of b.valores[j]) {
            const v = celdaDeJson(x);
            if (v !== null && typeof v !== 'number' && typeof v !== 'string') throw new Error(`la columna «${c}» de los datos del Analizador tiene un valor que no es un número ni un texto`);
        }
    });
    /** @type {Fila[]} */
    const filas = new Array(n);
    for (let i = 0; i < n; i++) {
        /** @type {Fila} */
        const f = {};
        for (let j = 0; j < b.columnas.length; j++) {
            const c = b.columnas[j], v = celdaDeJson(b.valores[j][i]);
            // como propiedad propia: una columna llamada «__proto__» no cambia el prototipo de la fila
            if (c === '__proto__') Object.defineProperty(f, c, { value: v, enumerable: true, writable: true, configurable: true });
            else f[c] = v;
        }
        filas[i] = f;
    }
    return filas;
}

/**
 * Las filas de un texto de «datos.json», medido antes de leerlo: un «datos.json» bien formado («{"columnas":[…],
 * "valores":[[…],…]}») tiene tres niveles, una lista por variable y, en sus comas, las celdas (las comas menos las listas,
 * más cuatro); uno que pasa de los topes ni se lee (unos KB de ceros comprimidos eran decenas de millones de valores).
 * @param {string} texto
 * @param {{ casos?: number, celdas?: number }} [topes] otros (más bajos), para las pruebas
 * @returns {Fila[]}
 */
export function datosDeJson(texto, topes = {}) {
    const celdas = topes.celdas ?? MAXIMO_CELDAS_ANALIZADOR;
    const m = medirJson(texto, 3);
    if (m.profundidad > 3) throw new Error('los datos guardados («datos.json») no tienen la forma esperada');
    if (m.contenedores > MAXIMO_VARIABLES_ANALIZADOR + 3) throw new Error(`los datos guardados («datos.json») traen más de ${MAXIMO_VARIABLES_ANALIZADOR.toLocaleString('es')} variables: más de lo que el Analizador abre aquí; cárgalos como CSV`);
    if (m.comas - m.contenedores + 4 > celdas) throw new Error(`los datos guardados («datos.json») traen más de ${celdas.toLocaleString('es')} valores: más de lo que el Analizador abre aquí; cárgalos como CSV`);
    let guardados;
    try { guardados = JSON.parse(texto); } catch (e) { throw new Error('los datos guardados («datos.json») no son JSON válido'); }
    return columnasAFilas(guardados, topes);
}

/** Un texto de un largo razonable (o nada). @param {unknown} x @param {number} [maximo] */
const textoOpcional = (x, maximo = 1000) => x === undefined || x === null || (typeof x === 'string' && x.length <= maximo);
/** @param {unknown} x @returns {x is Record<string, any>} */
const esObjeto = x => !!x && typeof x === 'object' && !Array.isArray(x);

/**
 * Los topes de la estructura de pruebas de un proyecto: los de la configuración con que el Simulador genera
 * (simulador/dominio/generacion-guardada.js, 5000 escalas), para las pruebas y para sus dimensiones, todas juntas; y
 * (cuarta revisión) el largo de una sigla y de la columna de una dimensión: el Simulador escribe siglas de hasta 10
 * letras y columnas «Dimension_» o «General_» con su sigla (con 1000 caracteres, las siglas encadenadas —«T», «T1»,
 * «T11»…— hacían que cada una recorriera las columnas de las demás).
 */
export const MAXIMO_PRUEBAS_ESTRUCTURA = 5000;
export const MAXIMO_DIMENSIONES_ESTRUCTURA = 5000;
export const LARGO_SIGLA_ESTRUCTURA = 32;
export const LARGO_COLUMNA_ESTRUCTURA = 64;
/** Las etiquetas de variable de un proyecto: hasta 200 000. */
export const MAXIMO_ETIQUETAS = 200000;

/**
 * ¿Tiene la estructura de pruebas de un proyecto la forma que escriben el Simulador (obtenerEstructuraEscalas) y las
 * etiquetas (shared/etiquetas-variables.js)? Una lista de pruebas con sus textos (nombre, variable, columna, etiqueta y
 * sigla de la general) y la lista de sus dimensiones (columna, etiqueta y sigla), de un largo razonable.
 * (2026.12.31, tercera revisión) Con las dimensiones acotadas entre todas las pruebas (antes, cada lista: 5000 pruebas de
 * 5000 dimensiones eran 25 millones), y siempre en una lista, como las escribe el Simulador: sin ella, el análisis por
 * dimensiones fallaba con un error de JavaScript.
 * @param {unknown} estructura
 * @returns {boolean}
 */
export function estructuraValida(estructura) {
    if (!Array.isArray(estructura) || estructura.length > MAXIMO_PRUEBAS_ESTRUCTURA) return false;
    let dimensiones = 0;
    return estructura.every(p => esObjeto(p) && textoOpcional(p.prueba) && textoOpcional(p.variable) && textoOpcional(p.columnaGeneral, LARGO_COLUMNA_ESTRUCTURA)
        && textoOpcional(p.etiquetaGeneral) && textoOpcional(p.siglaGeneral, LARGO_SIGLA_ESTRUCTURA) && (p.unidimensional === undefined || typeof p.unidimensional === 'boolean')
        && Array.isArray(p.dimensiones) && (dimensiones += p.dimensiones.length) <= MAXIMO_DIMENSIONES_ESTRUCTURA
        && p.dimensiones.every((/** @type {unknown} */ d) => esObjeto(d) && textoOpcional(d.columna, LARGO_COLUMNA_ESTRUCTURA) && textoOpcional(d.etiqueta) && textoOpcional(d.sigla, LARGO_SIGLA_ESTRUCTURA)));
}

/**
 * ¿Son las etiquetas de variable de un proyecto un diccionario de textos (columna → etiqueta), de un largo razonable?
 * @param {unknown} etiquetas
 * @returns {boolean}
 */
export function etiquetasValidas(etiquetas) {
    if (!esObjeto(etiquetas)) return false;
    const claves = Object.keys(etiquetas);
    return claves.length <= MAXIMO_ETIQUETAS && claves.every(k => k.length <= 1000 && typeof etiquetas[k] === 'string' && etiquetas[k].length <= 10000);
}

/**
 * Lo más que puede traer un «etiquetas.json» (las etiquetas, la estructura y el origen), para medirlo antes de leerlo: cada
 * prueba, un objeto con su lista de dimensiones y siete campos; cada dimensión, un objeto con tres; con holgura.
 * @type {TopesJson}
 */
export const TOPES_JSON_ETIQUETAS = {
    profundidad: 8,
    contenedores: 3 * MAXIMO_PRUEBAS_ESTRUCTURA + 2 * MAXIMO_DIMENSIONES_ESTRUCTURA + 100,
    elementos: 2 * MAXIMO_ETIQUETAS + 10 * MAXIMO_PRUEBAS_ESTRUCTURA + 5 * MAXIMO_DIMENSIONES_ESTRUCTURA + 1000
};
