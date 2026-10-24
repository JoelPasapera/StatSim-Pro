// @ts-check
// ejemplos/abrir.js — (2027.01.02) «Abrir en StatSim»: baja del sitio el proyecto del caso (su proyecto.statsim) y lo abre
// como «Abrir proyecto» de Ayuda (proyecto/ui.js), con una confirmación que nombra el caso y recuerda guardar antes lo que
// haya. Dice si se abrió.

import { abrirProyecto } from '../proyecto/ui.js';
import { PROYECTO_DEL_CASO, bytesDelArchivo, numeroDe } from './catalogo.js';

/**
 * La pregunta antes de abrir un caso.
 * @param {import('./catalogo.js').Ejemplo} e
 * @param {string} secciones lo que se reemplazará («el Simulador y el Analizador»)
 */
export const preguntaDelCaso = (e, secciones) => `Abrir el caso ${numeroDe(e)} («${e.titulo}») reemplazará lo que tienes ahora en ${secciones}. Si tienes trabajo sin guardar, cancela y guárdalo antes con Ayuda → «Guardar proyecto». ¿Continuar?`;

/**
 * Abre el proyecto de un caso en la página.
 * @param {import('./catalogo.js').Ejemplo} e
 * @param {{ obtener: import('./catalogo.js').Obtener, version: string, abrir?: typeof abrirProyecto }} op
 *   abrir: el de proyecto/ui.js (las pruebas pueden darle otro)
 * @returns {Promise<boolean>} si se abrió (false: se canceló o no se pudo, y ya se dijo por qué)
 */
export async function abrirEjemplo(e, { obtener, version, abrir = abrirProyecto }) {
    if (!e.archivos.some(a => a.ruta === PROYECTO_DEL_CASO)) throw new Error(`El caso ${numeroDe(e)} no trae su proyecto («${PROYECTO_DEL_CASO}»).`);
    const bytes = await bytesDelArchivo(e, PROYECTO_DEL_CASO, { obtener, version });
    const datos = /** @type {ArrayBuffer} */ (bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    return abrir({ name: PROYECTO_DEL_CASO, size: datos.byteLength, arrayBuffer: async () => datos }, { pregunta: s => preguntaDelCaso(e, s) });
}
