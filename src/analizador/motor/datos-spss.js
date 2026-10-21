// @ts-check
// analizador/motor/datos-spss.js — una base de SPSS (.sav o .zsav), leída por core/data/sav/lector.js, como la espera el
// Analizador: una fila-objeto por caso, con números, textos y fechas, y el diccionario de etiquetas de variable. (2026.12.29)
// Sin DOM.
//
// Cómo se traduce cada variable (docs/LIMITACIONES.md):
//   · Perdidos (el del sistema y los declarados por el usuario) → null, la celda vacía del Analizador.
//   · Cadenas → texto (sin los espacios del final); un valor con etiqueta de valor, la etiqueta (como lo muestra SPSS).
//   · Fechas (DATE, ADATE, EDATE, SDATE, DATETIME…) → 'AAAA-MM-DD' (con la hora, si el formato la tiene). TIME y DTIME
//     son duraciones: siguen siendo segundos.
//   · Numéricas con etiquetas de valor → texto con la etiqueta (una categoría, como el Simulador escribe Sexo o Grado)
//     cuando no son de escala, TODOS sus valores observados tienen etiqueta y su conjunto de etiquetas no lo comparten tres o
//     más variables (los ítems de un instrumento comparten las anclas, «1 = Nunca … 5 = Siempre», y deben seguir siendo
//     números para sumarlos y calcular su fiabilidad). Si no, siguen siendo números. Dos conjuntos se comparten si uno
//     contiene al otro con las mismas etiquetas (el ítem que añade «9 = No responde» sigue siendo un ítem). En los archivos
//     del Simulador (producto «StatSim Pro - Simulador») no hay excepción: sus ítems no llevan etiquetas de valor, así que
//     todo lo que las lleva es una categoría, como en su CSV (los estados de la histéresis, el riesgo y sus jueces).
//   · El resto, números.
// Los nombres, las etiquetas y los textos, sin «<» ni «>» (core/data/texto.js: el Analizador los pinta en sus informes), y
// sin nombres repetidos (un archivo dañado podría traerlos: el segundo pasa a «X (2)»).

import { esPerdidoSav } from '../../core/data/sav/lector.js';
import { segundosAFecha } from '../../core/data/sav/formato.js';
import { sinMarcado } from '../../core/data/texto.js';

/**
 * @typedef {import('../../core/data/sav/lector.js').ArchivoSav} ArchivoSav
 * @typedef {import('../../core/data/sav/lector.js').VariableLeida} VariableLeida
 * @typedef {Record<string, number | string | null>} FilaSav
 * @typedef {{
 *   filas: FilaSav[], etiquetas: Record<string, string>,
 *   categoricas: string[], numericas: string[], textos: string[], fechas: string[], avisos: string[]
 * }} BaseDesdeSav
 *   categoricas: las numéricas con etiquetas que pasan a texto; textos: las cadenas; avisos: lo que conviene saber
 */

/** @param {Array<[number | string, string]>} etiquetas La clave de un conjunto de etiquetas de valor numéricas: «código→etiqueta», ordenado. */
function claveDeEtiquetas(etiquetas) {
    return JSON.stringify(etiquetas.filter(([x]) => typeof x === 'number').map(([x, e]) => [x, e.trim()]).sort((a, b) => Number(a[0]) - Number(b[0])));
}

/**
 * Cuántas variables numéricas comparten el conjunto de etiquetas de cada una (por su clave): las que tienen exactamente
 * ese conjunto, más las que tienen uno que lo contiene o que está contenido en él con las mismas etiquetas (al menos dos
 * códigos en común). Se comparan los conjuntos distintos, no las variables: un instrumento con cien ítems y las mismas
 * anclas es un solo conjunto.
 * @param {VariableLeida[]} variables
 * @returns {Map<string, number>}
 */
function conjuntosCompartidos(variables) {
    /** @type {Map<string, { n: number, mapa: Map<number, string> }>} */
    const grupos = new Map();
    for (const v of variables) {
        if (v.tipo !== 'numerica' || !v.etiquetasValor.length) continue;
        const k = claveDeEtiquetas(v.etiquetasValor);
        const g = grupos.get(k);
        if (g) { g.n++; continue; }
        /** @type {Map<number, string>} */
        const mapa = new Map();
        v.etiquetasValor.forEach(([x, e]) => { if (typeof x === 'number') mapa.set(x, e.trim()); });
        grupos.set(k, { n: 1, mapa });
    }
    /** ¿El conjunto `a` está contenido en `b` con las mismas etiquetas? @param {Map<number, string>} a @param {Map<number, string>} b */
    const contenido = (a, b) => { for (const [x, e] of a) if (b.get(x) !== e) return false; return true; };
    const lista = [...grupos.entries()];
    /** @type {Map<string, number>} */
    const cuenta = new Map();
    for (const [k, g] of lista) {
        let total = g.n;
        for (const [k2, g2] of lista) {
            if (k2 === k || Math.min(g.mapa.size, g2.mapa.size) < 2) continue;
            if (g.mapa.size <= g2.mapa.size ? contenido(g.mapa, g2.mapa) : contenido(g2.mapa, g.mapa)) total += g2.n;
        }
        cuenta.set(k, total);
    }
    return cuenta;
}

/**
 * La base de un archivo .sav como filas-objeto para el Analizador.
 * @param {ArchivoSav} archivo
 * @returns {BaseDesdeSav}
 */
export function baseDesdeSav(archivo) {
    const { variables, datos, n } = archivo;
    /** @type {string[]} */
    const avisos = [...archivo.avisos];
    // Los nombres de la base: sin «<» ni «>», y únicos.
    const usados = new Set();
    const nombres = variables.map((v, k) => {
        let nombre = sinMarcado(v.nombre).trim() || `V${k + 1}`;
        if (usados.has(nombre)) { let s = 2; while (usados.has(`${nombre} (${s})`)) s++; nombre = `${nombre} (${s})`; }
        usados.add(nombre);
        if (nombre !== v.nombre) avisos.push(`la variable «${sinMarcado(v.nombre)}» se llama «${nombre}»`);
        return nombre;
    });
    const compartidos = conjuntosCompartidos(variables);
    const claveConjunto = (/** @type {VariableLeida} */ v) => claveDeEtiquetas(v.etiquetasValor);
    const delSimulador = /StatSim Pro - Simulador/.test(archivo.producto || '');   // simulador/dominio/exportacion-spss.js
    /** @type {string[]} */ const categoricas = [];
    /** @type {string[]} */ const numericas = [];
    /** @type {string[]} */ const textos = [];
    /** @type {string[]} */ const fechas = [];
    // Cómo se presenta cada celda de cada variable.
    const presentar = variables.map((v, k) => {
        const col = datos[k];
        if (v.tipo === 'texto') {
            textos.push(nombres[k]);
            /** @type {Map<string, string>} */
            const mapa = new Map();
            v.etiquetasValor.forEach(([valor, etiqueta]) => { if (typeof valor === 'string' && etiqueta.trim()) mapa.set(valor, sinMarcado(etiqueta.trim())); });
            return (/** @type {number} */ i) => {
                const t = /** @type {string[]} */ (col)[i];
                return esPerdidoSav(v, t) ? null : (mapa.get(t) ?? sinMarcado(t));
            };
        }
        const nums = /** @type {Float64Array} */ (col);
        if (v.fecha) {
            fechas.push(nombres[k]);
            return (/** @type {number} */ i) => (esPerdidoSav(v, nums[i]) ? null : (segundosAFecha(nums[i], v.conHora) || null));
        }
        if (v.etiquetasValor.length && v.medida !== 'escala' && (delSimulador || (compartidos.get(claveConjunto(v)) || 0) < 3)) {
            /** @type {Map<number, string>} */
            const mapa = new Map();
            v.etiquetasValor.forEach(([valor, etiqueta]) => { if (typeof valor === 'number' && etiqueta.trim()) mapa.set(valor, sinMarcado(etiqueta.trim())); });
            let todos = mapa.size > 0;
            for (let i = 0; i < n && todos; i++) { const x = nums[i]; if (!esPerdidoSav(v, x) && !mapa.has(x)) todos = false; }
            if (todos) {
                categoricas.push(nombres[k]);
                return (/** @type {number} */ i) => (esPerdidoSav(v, nums[i]) ? null : /** @type {string} */ (mapa.get(nums[i])));
            }
        }
        numericas.push(nombres[k]);
        return (/** @type {number} */ i) => (esPerdidoSav(v, nums[i]) ? null : nums[i]);
    });
    /** @type {FilaSav[]} */
    const filas = new Array(n);
    for (let i = 0; i < n; i++) {
        /** @type {FilaSav} */
        const fila = {};
        for (let k = 0; k < variables.length; k++) fila[/** @type {string} */ (nombres[k])] = presentar[k](i);
        filas[i] = fila;
    }
    /** @type {Record<string, string>} */
    const etiquetas = {};
    variables.forEach((v, k) => { const e = sinMarcado(v.etiqueta.trim()), nombre = /** @type {string} */ (nombres[k]); if (e && e !== nombre) etiquetas[nombre] = e; });
    if (archivo.ponderacion) avisos.push(`el archivo pondera los casos por «${sinMarcado(archivo.ponderacion)}», y el Analizador no pondera: cada fila cuenta una vez`);
    return { filas, etiquetas, categoricas, numericas, textos, fechas, avisos };
}
