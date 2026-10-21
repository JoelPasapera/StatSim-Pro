// @ts-check
// shared/proyecto.js — (2026.12.31) el registro de lo que entra en un proyecto de StatSim Pro («Guardar proyecto» y «Abrir
// proyecto», en Ayuda: proyecto/). Cada sección se inscribe con lo que sabe guardar y restaurar de sí misma, y el
// proyecto las recorre sin importar ninguna, como el bus de eventos (shared/eventos.js). Sin DOM.

/**
 * @typedef {Record<string, string | Uint8Array>} ArchivosDeParte
 *   ruta (relativa a la carpeta de la sección: «base.json», «base/0.bin») → contenido (un texto se guarda en UTF-8)
 * @typedef {{ archivos: ArchivosDeParte, resumen: string }} ParteCapturada
 *   resumen: qué se guardó, en una frase («la configuración del Simulador y su base generada (n = 300)»)
 * @typedef {{
 *   seccion: string, titulo: string, orden: number,
 *   capturar: () => ParteCapturada | null | Promise<ParteCapturada | null>,
 *   restaurar: (archivos: Map<string, Uint8Array>) => string | Promise<string>
 * }} ParticipanteProyecto
 *   seccion: la carpeta de sus archivos en el proyecto (minúsculas, «simulador»); titulo: cómo se le nombra al usuario
 *   («el Simulador»); orden: el de restauración (el Simulador, antes que el Analizador); capturar: lo que guarda (null si
 *   no tiene nada); restaurar: lo aplica y devuelve qué restauró, en una frase
 */

/** @type {Map<string, ParticipanteProyecto>} */
const participantes = new Map();

/**
 * Inscribe (o reemplaza) lo que una sección guarda en el proyecto.
 * @param {ParticipanteProyecto} participante
 */
export function inscribirEnProyecto(participante) {
    if (!/^[a-z][a-z0-9-]*$/.test(participante.seccion)) throw new Error(`Proyecto: «${participante.seccion}» no es un nombre de sección válido`);
    participantes.set(participante.seccion, participante);
}

/**
 * Las secciones inscritas, en su orden de restauración.
 * @returns {ParticipanteProyecto[]}
 */
export function participantesDelProyecto() {
    return [...participantes.values()].sort((a, b) => a.orden - b.orden);
}
