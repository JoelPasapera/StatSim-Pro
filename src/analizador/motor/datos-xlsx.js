// @ts-check
// analizador/motor/datos-xlsx.js — (2026.12.31) una hoja de un libro de Excel (.xlsx), leído por core/data/xlsx/lector.js,
// como la espera el Analizador: una fila-objeto por caso, con números, textos y fechas, y las etiquetas de variable si el
// libro es del Simulador (su hoja «Diccionario»). Sin DOM.
//
// Cómo se traduce cada hoja (docs/LIMITACIONES.md):
//   · Los encabezados: la primera fila con datos, salvo las de título que la preceden (una sola celda de texto seguida de
//     una fila de encabezados de texto, como «Encuesta de satisfacción 2024» sobre la tabla), que se saltan y se avisan.
//     Sin «<» ni «>» (core/data/texto.js), sin repetir («X (2)») y, el que falta, «Columna_C» (la letra de su columna). Las
//     columnas sin encabezado ni datos no entran.
//   · Las celdas: los números, números; los textos, recortados y sin «<» ni «>», salvo los que son un número completo
//     («3,5», «12» guardados como texto en Excel), que pasan a número, como en un CSV; verdadero y falso, «VERDADERO» y
//     «FALSO» (una categoría); las fechas, «AAAA-MM-DD» (con la hora si la tienen), como en un .sav; los errores de Excel
//     y las fórmulas sin un resultado guardado, celdas vacías (se avisan).
//   · Las filas vacías entre los datos son casos con todos sus valores perdidos (como las «;;;» de un CSV): se avisan.

import { aNumero } from '../../core/data/celdas.js';
import { sinMarcado } from '../../core/data/texto.js';
import { letrasDeColumna } from '../../core/data/xlsx/referencias.js';
import { ENCABEZADO_DICCIONARIO, HOJAS_LIBRO } from '../../shared/diccionario-xlsx.js';

/**
 * @typedef {import('../../core/data/xlsx/lector.js').LibroXlsx} LibroXlsx
 * @typedef {import('../../core/data/xlsx/lector.js').HojaXlsx} HojaXlsx
 * @typedef {import('../../core/data/xlsx/lector.js').CeldaXlsx} CeldaXlsx
 * @typedef {Record<string, number | string | null>} FilaXlsx
 * @typedef {{ indice: number, nombre: string, oculta: boolean, filas: number, columnas: number }} HojaConDatos
 *   indice: su posición en libro.hojas; filas y columnas: las de la hoja (con los encabezados)
 * @typedef {{
 *   filas: FilaXlsx[], columnas: string[], etiquetas: Record<string, string>, fechas: string[],
 *   delSimulador: boolean, avisos: string[]
 * }} BaseDesdeXlsx
 *   fechas: las columnas de fechas; delSimulador: el libro trae el diccionario del Simulador (las etiquetas salen de él)
 */

/** ¿Tiene valor la celda? @param {CeldaXlsx | undefined} v */
const conValor = v => v !== null && v !== undefined && v !== '';

/** Cuántas celdas con valor tiene una fila. @param {CeldaXlsx[] | null | undefined} fila */
function celdasCon(fila) {
    let k = 0;
    if (fila) for (const v of fila) if (conValor(v)) k++;
    return k;
}

/** ¿Es una fila de encabezados? Dos o más celdas, todas de texto. @param {CeldaXlsx[] | null | undefined} fila */
function pareceEncabezado(fila) {
    if (!fila || celdasCon(fila) < 2) return false;
    for (const v of fila) if (conValor(v) && typeof v !== 'string') return false;
    return true;
}

/**
 * Las hojas del libro que tienen datos, en el orden en que se ofrecen: primero las visibles, en el orden del libro.
 * @param {LibroXlsx} libro
 * @returns {HojaConDatos[]}
 */
export function hojasConDatos(libro) {
    const conDatos = libro.hojas.map((h, indice) => ({ indice, nombre: h.nombre, oculta: h.oculta, filas: h.filas.filter(f => celdasCon(f) > 0).length, columnas: h.columnas }))
        .filter(h => h.filas > 0);
    return [...conDatos.filter(h => !h.oculta), ...conDatos.filter(h => h.oculta)];
}

/**
 * La hoja que se carga primero: la de datos de un libro del Simulador o, si no, la primera visible con datos.
 * @param {LibroXlsx} libro
 * @returns {HojaConDatos | null}
 */
export function hojaPorOmision(libro) {
    const opciones = hojasConDatos(libro);
    if (diccionarioDelSimulador(libro)) {
        const datos = opciones.find(h => h.nombre === HOJAS_LIBRO.DATOS);
        if (datos) return datos;
    }
    return opciones[0] || null;
}

/**
 * Las etiquetas de variable del diccionario de un libro del Simulador (la hoja «Diccionario», con «Variable» y «Etiqueta»
 * como primeros encabezados): nombre → etiqueta. null si el libro no lo trae.
 * @param {LibroXlsx} libro
 * @returns {Map<string, string> | null}
 */
function diccionarioDelSimulador(libro) {
    const hoja = libro.hojas.find(h => h.nombre === HOJAS_LIBRO.DICCIONARIO);
    const encabezado = hoja && hoja.filas[0];
    if (!hoja || !encabezado || encabezado[0] !== ENCABEZADO_DICCIONARIO[0] || encabezado[1] !== ENCABEZADO_DICCIONARIO[1]) return null;
    /** @type {Map<string, string>} */
    const etiquetas = new Map();
    for (const fila of hoja.filas.slice(1)) {
        if (!fila || typeof fila[0] !== 'string') continue;
        const e = typeof fila[1] === 'string' ? fila[1].trim() : '';
        if (e) etiquetas.set(sinMarcado(fila[0].trim()), sinMarcado(e));
    }
    return etiquetas;
}

const ES_FECHA = /^(\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?|\d{2}:\d{2}:\d{2})$/;

/** Lista breve de nombres: «A», «A y B», «A, B y C», o los cinco primeros y «…». @param {string[]} nombres */
function listaBreve(nombres) {
    const muestra = nombres.slice(0, 5).map(n => `«${n}»`);
    if (nombres.length > 5) return muestra.join(', ') + '…';
    return muestra.length > 1 ? `${muestra.slice(0, -1).join(', ')} y ${muestra[muestra.length - 1]}` : (muestra[0] || '');
}

/**
 * Una hoja del libro como base del Analizador.
 * @param {LibroXlsx} libro
 * @param {number} indice la posición de la hoja en libro.hojas
 * @returns {BaseDesdeXlsx}
 */
export function baseDesdeXlsx(libro, indice) {
    const hoja = libro.hojas[indice];
    if (!hoja) throw new Error('Esa hoja no está en el libro de Excel');
    const filas = hoja.filas;
    /** @type {string[]} */
    const avisos = [];
    let k = filas.findIndex(f => celdasCon(f) > 0);
    if (k < 0) throw new Error(`La hoja «${sinMarcado(hoja.nombre)}» está vacía`);
    // las filas de título sobre la tabla (hasta cinco): una celda de texto, y la siguiente fila con algo, de encabezados
    /** @type {Array<{ fila: number, texto: string }>} */
    const titulos = [];
    while (titulos.length < 5) {
        const fila = /** @type {CeldaXlsx[]} */ (filas[k]);
        if (celdasCon(fila) !== 1) break;
        const texto = fila.find(conValor);
        if (typeof texto !== 'string') break;
        let siguiente = k + 1;
        while (siguiente < filas.length && celdasCon(filas[siguiente]) === 0) siguiente++;
        if (siguiente >= filas.length || !pareceEncabezado(filas[siguiente])) break;
        titulos.push({ fila: k + 1, texto: sinMarcado(texto.trim()) });
        k = siguiente;
    }
    const encabezado = /** @type {CeldaXlsx[]} */ (filas[k]);
    const datos = filas.slice(k + 1);
    // las columnas: las que tienen encabezado o algún dato, en una sola pasada por las filas. (2026.12.31, revisión) Antes, una
    // pasada por columna: una sola celda en la columna XFD (un pegado accidental) hacía recorrer 16 384 veces todas las filas
    const conAlgo = new Uint8Array(hoja.columnas);
    for (let j = 0; j < encabezado.length; j++) if (conValor(encabezado[j])) conAlgo[j] = 1;
    for (const f of datos) if (f) for (let j = 0; j < f.length; j++) if (!conAlgo[j] && conValor(f[j])) conAlgo[j] = 1;
    /** @type {number[]} */
    const usadas = [];
    for (let j = 0; j < hoja.columnas; j++) if (conAlgo[j]) usadas.push(j);
    /** @type {string[]} */
    const columnas = [];
    /** @type {Array<[string, string]>} */
    const renombradas = [];
    /** @type {Array<[string, string]>} */
    const sinNombre = [];
    const usados = new Set();
    for (const j of usadas) {
        const h = encabezado[j];
        const original = !conValor(h) ? '' : typeof h === 'boolean' ? (h ? 'VERDADERO' : 'FALSO') : String(h).trim();
        let nombre = sinMarcado(original) || `Columna_${letrasDeColumna(j)}`;
        if (usados.has(nombre)) { let s = 2; while (usados.has(`${nombre} (${s})`)) s++; nombre = `${nombre} (${s})`; }
        usados.add(nombre);
        columnas.push(nombre);
        if (original === '') sinNombre.push([letrasDeColumna(j), nombre]);
        else if (nombre !== original) renombradas.push([original, nombre]);
    }
    // las celdas
    const comoTexto = new Array(columnas.length).fill(0);
    let vacias = 0;
    /** @type {FilaXlsx[]} */
    const base = datos.map(f => {
        /** @type {FilaXlsx} */
        const fila = {};
        if (!f || celdasCon(f) === 0) vacias++;
        usadas.forEach((j, c) => {
            const v = f ? f[j] : null;
            /** @type {number | string | null} */
            let valor = null;
            if (typeof v === 'number') valor = v;
            else if (typeof v === 'boolean') valor = v ? 'VERDADERO' : 'FALSO';
            else if (typeof v === 'string') {
                const t = v.trim();
                if (t) {
                    const x = aNumero(t);
                    if (Number.isNaN(x)) valor = sinMarcado(t);
                    else { valor = x; comoTexto[c]++; }
                }
            }
            const nombre = /** @type {string} */ (columnas[c]);
            // como propiedad propia: un encabezado «__proto__» no cambia el prototipo de la fila
            if (nombre === '__proto__') Object.defineProperty(fila, nombre, { value: valor, enumerable: true, writable: true, configurable: true });
            else fila[nombre] = valor;
        });
        return fila;
    });
    // las fechas: las columnas cuyos valores son todos fechas (como las escribe el lector)
    const fechas = columnas.filter(c => {
        let alguna = false;
        for (const f of base) { const v = f[c]; if (v === null) continue; if (typeof v !== 'string' || !ES_FECHA.test(v)) return false; alguna = true; }
        return alguna;
    });
    // las etiquetas del diccionario del Simulador, si el libro lo trae y la hoja no es el propio diccionario
    const diccionario = hoja.nombre !== HOJAS_LIBRO.DICCIONARIO ? diccionarioDelSimulador(libro) : null;
    /** @type {Record<string, string>} */
    const etiquetas = {};
    if (diccionario) for (const c of columnas) { const e = diccionario.get(c); if (e && e !== c) Object.defineProperty(etiquetas, c, { value: e, enumerable: true, writable: true, configurable: true }); }

    if (hoja.oculta) avisos.push(`la hoja «${sinMarcado(hoja.nombre)}» está oculta en el libro`);
    titulos.forEach(t => avisos.push(`se saltó la fila ${t.fila} («${t.texto.length > 60 ? t.texto.slice(0, 57) + '…' : t.texto}»), que parece un título: los encabezados son los de la fila ${k + 1}`));
    if (vacias) avisos.push(`${vacias} fila(s) vacías entre los datos se conservan como casos con todos sus valores perdidos`);
    if (hoja.errores) avisos.push(`${hoja.errores} celda(s) con un error de Excel (#N/A, #DIV/0!…) quedan vacías`);
    if (hoja.formulasSinValor) avisos.push(`${hoja.formulasSinValor} fórmula(s) sin su resultado guardado quedan vacías (el libro lo escribió un programa que no calcula: ábrelo en Excel o en LibreOffice y vuelve a guardarlo)`);
    sinNombre.forEach(([letra, b]) => avisos.push(`la columna ${letra} no tiene nombre: se llama «${b}»`));
    renombradas.forEach(([a, b]) => avisos.push(`la columna «${sinMarcado(a)}» se llama «${b}» (${a !== sinMarcado(a) ? 'sin < ni >' : 'el nombre estaba repetido'})`));
    const conNumerosDeTexto = columnas.filter((_, c) => comoTexto[c] > 0);
    if (conNumerosDeTexto.length) avisos.push(`en ${listaBreve(conNumerosDeTexto)}, números guardados como texto en Excel se leyeron como números`);
    return { filas: base, columnas, etiquetas, fechas, delSimulador: !!diccionario, avisos };
}
