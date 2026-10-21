// @ts-check
// proyecto/paquete.js — (2026.12.31) el archivo de proyecto de StatSim Pro (.statsim): un ZIP (core/data/zip) con un
// manifiesto («proyecto.json»: qué programa y qué versión lo guardaron, cuándo, y qué secciones trae con sus archivos) y,
// en una carpeta por sección, lo que cada una guardó de sí misma (shared/proyecto.js). Escribirlo, y leerlo comprobando
// que es un proyecto, que una versión más nueva no lo guardó con otro formato y que no le falta nada. Sin DOM.
// (2026.12.31, revisión) Y con topes, antes de extraer nada: lo que ocupa sin comprimir cada archivo y todos juntos (un
// proyecto puede ser de otra persona, y uno manipulado podría declarar gigas que no caben en la memoria del navegador), y
// sin secciones ni archivos repetidos en el manifiesto. (Cuarta revisión) El manifiesto, medido antes de leerlo
// (core/data/json-acotado.js), como los JSON de cada sección.

import { esZip, extraerZip, listarZip } from '../core/data/zip/lector.js';
import { escribirZip } from '../core/data/zip/escritor.js';
import { tamanoLegible } from '../core/data/tamano.js';
import { excesoDeJson } from '../core/data/json-acotado.js';

/**
 * @typedef {import('../shared/proyecto.js').ArchivosDeParte} ArchivosDeParte
 * @typedef {{ seccion: string, titulo: string, resumen: string, archivos: ArchivosDeParte }} ParteDelProyecto
 * @typedef {{ seccion: string, titulo: string, resumen: string, archivos: Map<string, Uint8Array> }} ParteLeida
 * @typedef {{
 *   formato: string, versionFormato: number, programa: string, version: string, guardado: string,
 *   secciones: Array<{ seccion: string, titulo: string, resumen: string, archivos: string[] }>
 * }} Manifiesto
 */

/** Lo que dice el manifiesto que es (y así se reconoce un proyecto). */
export const FORMATO_PROYECTO = 'StatSim Pro — proyecto';
/** La versión del formato que se escribe; se leen esta y las anteriores. */
export const VERSION_FORMATO = 1;
export const EXTENSION_PROYECTO = '.statsim';
const MANIFIESTO = 'proyecto.json';
/** Los topes sin comprimir: el manifiesto, 16 MB; cada archivo, 512 MB (lo más que cabe en una cadena del navegador); todos, 1 GB. */
export const MAXIMO_MANIFIESTO = 16 * 1024 * 1024;
export const MAXIMO_ARCHIVO = 512 * 1024 * 1024;
export const MAXIMO_PROYECTO = 1024 * 1024 * 1024;
/**
 * Lo más que trae un manifiesto: unas pocas secciones, cada una con la lista de sus archivos (la base del Simulador, uno
 * por columna); con holgura. @type {import('../core/data/json-acotado.js').TopesJson}
 */
const TOPES_JSON_MANIFIESTO = { profundidad: 6, contenedores: 1000, elementos: 1000000 };

const NO_ES_PROYECTO = 'No es un proyecto de StatSim Pro (.statsim): ábrelo con «Abrir proyecto» solo si lo guardó «Guardar proyecto»';

/** ¿Es una ruta segura dentro del proyecto (sin «..», sin «/» al principio, sin barras invertidas)? @param {string} ruta */
const rutaSegura = ruta => typeof ruta === 'string' && ruta !== '' && !ruta.startsWith('/') && !ruta.includes('\\') && ruta.split('/').every(p => p !== '' && p !== '.' && p !== '..');

/**
 * El archivo de proyecto, por trozos (new Blob(trozos) es el .statsim).
 * @param {ParteDelProyecto[]} partes
 * @param {{ version: string, fecha?: Date, comprimir?: boolean }} opciones version: la del programa
 * @returns {Promise<Uint8Array[]>}
 */
export async function escribirProyecto(partes, opciones) {
    const fecha = opciones.fecha instanceof Date ? opciones.fecha : new Date();
    /** @type {Manifiesto} */
    const manifiesto = {
        formato: FORMATO_PROYECTO, versionFormato: VERSION_FORMATO, programa: 'StatSim Pro', version: opciones.version, guardado: fecha.toISOString(),
        secciones: partes.map(p => ({ seccion: p.seccion, titulo: p.titulo, resumen: p.resumen, archivos: Object.keys(p.archivos) }))
    };
    /** @type {import('../core/data/zip/escritor.js').EntradaNueva[]} */
    const entradas = [{ nombre: MANIFIESTO, contenido: JSON.stringify(manifiesto, null, 1) }];
    for (const p of partes) {
        if (!/^[a-z][a-z0-9-]*$/.test(p.seccion)) throw new Error(`Proyecto: «${p.seccion}» no es un nombre de sección válido`);
        for (const [ruta, contenido] of Object.entries(p.archivos)) {
            if (!rutaSegura(ruta)) throw new Error(`Proyecto: «${ruta}» no es una ruta válida`);
            entradas.push({ nombre: `${p.seccion}/${ruta}`, contenido });
        }
    }
    return escribirZip(entradas, { fecha, comprimir: opciones.comprimir });
}

/**
 * Lee un archivo de proyecto.
 * @param {Uint8Array} bytes
 * @param {{ topes?: { archivo?: number, proyecto?: number } }} [opciones] topes: otros (más bajos) que MAXIMO_ARCHIVO y
 *   MAXIMO_PROYECTO, para las pruebas
 * @returns {Promise<{ manifiesto: Manifiesto, partes: ParteLeida[] }>}
 */
export async function leerProyecto(bytes, opciones = {}) {
    const maximoArchivo = opciones.topes?.archivo ?? MAXIMO_ARCHIVO, maximoProyecto = opciones.topes?.proyecto ?? MAXIMO_PROYECTO;
    if (!esZip(bytes)) throw new Error(NO_ES_PROYECTO);
    /** @type {import('../core/data/zip/lector.js').EntradaZip[]} */
    let entradas;
    try { entradas = listarZip(bytes); } catch (e) { throw new Error(`El proyecto está dañado o incompleto (${String(e instanceof Error ? e.message : e).replace(/^ZIP: /, '')}): vuelve a descargarlo o a guardarlo`); }
    const porNombre = new Map(entradas.map(e => [e.nombre, e]));
    /** @param {import('../core/data/zip/lector.js').EntradaZip} e */
    const leer = async e => {
        try { return await extraerZip(bytes, e); } catch (err) { throw new Error(`El proyecto está dañado: ${String(err instanceof Error ? err.message : err).replace(/^ZIP: /, '')}`); }
    };
    const entradaManifiesto = porNombre.get(MANIFIESTO);
    if (!entradaManifiesto) throw new Error(NO_ES_PROYECTO);
    if (entradaManifiesto.tamano > MAXIMO_MANIFIESTO) throw new Error('El proyecto está dañado: su manifiesto es demasiado grande');
    /** @type {any} */
    let manifiesto;
    const textoManifiesto = new TextDecoder().decode(await leer(entradaManifiesto));
    if (excesoDeJson(textoManifiesto, TOPES_JSON_MANIFIESTO)) throw new Error('El proyecto está dañado: su manifiesto no tiene la forma esperada');
    try { manifiesto = JSON.parse(textoManifiesto); } catch (e) { throw new Error(NO_ES_PROYECTO); }
    if (!manifiesto || manifiesto.formato !== FORMATO_PROYECTO || !Number.isInteger(manifiesto.versionFormato) || !Array.isArray(manifiesto.secciones)) throw new Error(NO_ES_PROYECTO);
    if (manifiesto.versionFormato > VERSION_FORMATO) {
        throw new Error(`El proyecto lo guardó una versión más nueva de StatSim Pro (${String(manifiesto.version || '¿?')}), con un formato que esta no conoce: recarga la página sin caché (Ayuda → Recargar sin caché) y vuelve a abrirlo`);
    }
    // primero, todo comprobado (la forma del manifiesto, que no le falte nada y lo que ocupa), sin extraer nada
    const danado = 'El proyecto está dañado: su manifiesto no tiene la forma esperada';
    const secciones = new Set();
    /** @type {Array<{ s: any, archivos: Array<[string, import('../core/data/zip/lector.js').EntradaZip]> }>} */
    const plan = [];
    let total = 0;
    for (const s of manifiesto.secciones) {
        if (!s || typeof s.seccion !== 'string' || !/^[a-z][a-z0-9-]*$/.test(s.seccion) || !Array.isArray(s.archivos) || secciones.has(s.seccion)) throw new Error(danado);
        secciones.add(s.seccion);
        const rutas = new Set();
        /** @type {Array<[string, import('../core/data/zip/lector.js').EntradaZip]>} */
        const archivos = [];
        for (const ruta of s.archivos) {
            if (!rutaSegura(ruta)) throw new Error('El proyecto está dañado: su manifiesto nombra una ruta que no es válida');
            if (rutas.has(ruta)) throw new Error(danado);
            rutas.add(ruta);
            const e = porNombre.get(`${s.seccion}/${ruta}`);
            if (!e) throw new Error(`El proyecto está incompleto: le falta «${s.seccion}/${ruta}»`);
            if (e.tamano > maximoArchivo) throw new Error(`El proyecto es demasiado grande para abrirlo aquí: «${s.seccion}/${ruta}» ocupa ${tamanoLegible(e.tamano)} sin comprimir`);
            total += e.tamano;
            if (total > maximoProyecto) throw new Error(`El proyecto es demasiado grande para abrirlo aquí: sus archivos ocupan más de ${tamanoLegible(maximoProyecto)} sin comprimir`);
            archivos.push([ruta, e]);
        }
        plan.push({ s, archivos });
    }
    // después, extraído
    /** @type {ParteLeida[]} */
    const partes = [];
    for (const { s, archivos: lista } of plan) {
        /** @type {Map<string, Uint8Array>} */
        const archivos = new Map();
        for (const [ruta, e] of lista) archivos.set(ruta, await leer(e));
        partes.push({ seccion: s.seccion, titulo: typeof s.titulo === 'string' ? s.titulo : s.seccion, resumen: typeof s.resumen === 'string' ? s.resumen : '', archivos });
    }
    return { manifiesto: /** @type {Manifiesto} */ (manifiesto), partes };
}

/** El texto UTF-8 de un archivo del proyecto. @param {Uint8Array | undefined} bytes @returns {string | null} */
export function textoDe(bytes) {
    return bytes ? new TextDecoder().decode(bytes) : null;
}
