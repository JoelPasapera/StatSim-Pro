// @ts-check
// proyecto/ui.js — (2026.12.31) «Guardar proyecto» y «Abrir proyecto» (la tarjeta «Proyecto completo» de Ayuda): un solo
// archivo (.statsim, proyecto/paquete.js) con todo lo que las secciones saben guardar de sí mismas (shared/proyecto.js): la
// configuración y la base del Simulador, los datos del Analizador con sus etiquetas, la V de Aiken, la última redacción y
// el protocolo de búsqueda con su flujo PRISMA. Abrirlo reemplaza, tras confirmarlo, lo que hay en esas secciones.
// No guarda la clave de Web of Science (es tuya: un proyecto se comparte) ni los datos que el navegador vuelve a
// descargar solo (el ranking de revistas, el estado de los proxies).

import { participantesDelProyecto } from '../shared/proyecto.js';
import { EXTENSION_PROYECTO, MAXIMO_PROYECTO, escribirProyecto, leerProyecto } from './paquete.js';
import { tamanoLegible } from '../core/data/tamano.js';
import { leerBytes } from '../shared/archivos.js';
import { descargarBlob } from '../shared/descargas.js';
import { mostrarToast } from '../shared/toast.js';
import { bus, EVENTOS } from '../shared/eventos.js';
import { VERSION } from '../version.js';

let ocupado = false;
/** (2027.01.02) Lo que se dice si se pide otro mientras se abre o se guarda uno (antes no se decía nada). */
const avisarOcupado = () => mostrarToast('Ya se está abriendo o guardando un proyecto: espera a que termine.', 'warning', 5000);

/** «2026-10-20», en la hora local. @param {Date} f */
function fechaCorta(f) {
    return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
}

/** Una lista en español: «a», «a y b», «a, b y c». @param {string[]} l */
const enumerar = l => (l.length > 1 ? `${l.slice(0, -1).join(', ')} y ${l[l.length - 1]}` : l[0] || '');

/**
 * Guarda el proyecto: lo que tiene cada sección, en un .statsim que se descarga.
 * @returns {Promise<void>}
 */
async function guardarProyecto() {
    if (ocupado) { avisarOcupado(); return; }
    ocupado = true;
    try {
        /** @type {import('./paquete.js').ParteDelProyecto[]} */
        const partes = [];
        /** @type {string[]} */
        const avisos = [];
        for (const p of participantesDelProyecto()) {
            try {
                const c = await p.capturar();
                if (c && Object.keys(c.archivos).length) partes.push({ seccion: p.seccion, titulo: p.titulo, resumen: c.resumen, archivos: c.archivos });
            } catch (e) {
                avisos.push(`${p.titulo} no se pudo guardar (${e instanceof Error ? e.message : e})`);
            }
        }
        if (!partes.length) {
            mostrarToast(avisos.length ? `No se pudo guardar el proyecto: ${avisos.join('; ')}` : 'Aún no hay nada que guardar: configura el Simulador, genera una base o carga datos en el Analizador', avisos.length ? 'error' : 'warning', 7000);
            return;
        }
        const fecha = new Date();
        const trozos = await escribirProyecto(partes, { version: VERSION, fecha });
        descargarBlob(new Blob(/** @type {BlobPart[]} */ (/** @type {unknown} */ (trozos)), { type: 'application/zip' }), `proyecto_statsim_${fechaCorta(fecha)}${EXTENSION_PROYECTO}`);
        const resumen = `Proyecto guardado: ${enumerar(partes.map(p => p.resumen))}. Ábrelo otro día con «Abrir proyecto»`;
        mostrarToast(avisos.length ? `${resumen}. Ten en cuenta: ${avisos.join('; ')}.` : resumen, avisos.length ? 'warning' : 'success', 9000);
    } catch (e) {
        mostrarToast(`No se pudo guardar el proyecto: ${e instanceof Error ? e.message : e}`, 'error', 7000);
    } finally {
        ocupado = false;
    }
}

/**
 * Abre un proyecto: lo lee, pide confirmación (reemplaza lo que hay en las secciones que trae) y lo restaura, sección por
 * sección (si una falla, las demás se restauran igual y se avisa).
 * (2027.01.02) Con `opciones.pregunta`, la pregunta de la confirmación (la pestaña «Ejemplos» nombra el caso); y dice si
 * abrió algo (true) o no (se canceló, falló o ya se estaba abriendo otro).
 * @param {{ name?: string, size?: number, arrayBuffer?: () => Promise<ArrayBuffer> } | Blob} archivo
 * @param {{ pregunta?: (secciones: string) => string }} [opciones]
 * @returns {Promise<boolean>}
 */
async function abrirProyecto(archivo, opciones = {}) {
    if (ocupado) { avisarOcupado(); return false; }
    ocupado = true;
    try {
        // (revisión) uno más grande que todo lo que se puede abrir, ni se lee (el navegador fallaría con un error en inglés)
        if (typeof /** @type {Blob} */ (archivo).size === 'number' && /** @type {Blob} */ (archivo).size > MAXIMO_PROYECTO) {
            throw new Error(`El proyecto es demasiado grande para abrirlo aquí: ocupa ${tamanoLegible(/** @type {Blob} */ (archivo).size)}`);
        }
        const bytes = await leerBytes(/** @type {Blob} */ (archivo));
        const { manifiesto, partes } = await leerProyecto(bytes);
        const conocidos = new Map(participantesDelProyecto().map(p => [p.seccion, p]));
        const aRestaurar = participantesDelProyecto().filter(p => partes.some(s => s.seccion === p.seccion));
        /** @type {string[]} */
        const avisos = partes.filter(s => !conocidos.has(s.seccion)).map(s => `trae «${s.titulo}», que esta versión no sabe abrir`);
        if (!aRestaurar.length) {
            mostrarToast(avisos.length ? `El proyecto no trae nada que esta versión sepa abrir: ${avisos.join('; ')}` : 'El proyecto está vacío', 'warning', 7000);
            return false;
        }
        const guardado = new Date(manifiesto.guardado);
        const cuando = Number.isNaN(guardado.getTime()) ? '' : ` (guardado el ${fechaCorta(guardado)} con la versión ${manifiesto.version})`;
        const secciones = enumerar(aRestaurar.map(p => p.titulo));
        const pregunta = opciones.pregunta ? opciones.pregunta(secciones) : `Abrir este proyecto${cuando} reemplazará lo que tienes ahora en ${secciones}. ¿Continuar?`;
        if (typeof window.confirm === 'function' && !window.confirm(pregunta)) return false;
        /** @type {string[]} */
        const hechos = [];
        for (const p of aRestaurar) {
            const parte = /** @type {import('./paquete.js').ParteLeida} */ (partes.find(s => s.seccion === p.seccion));
            try {
                hechos.push(await p.restaurar(parte.archivos));
            } catch (e) {
                avisos.push(`${p.titulo} no se pudo restaurar (${e instanceof Error ? e.message : e})`);
            }
        }
        if (!hechos.length) {
            mostrarToast(`No se pudo abrir el proyecto: ${avisos.join('; ')}`, 'error', 9000);
            return false;
        }
        const resumen = `Proyecto abierto: ${enumerar(hechos)}`;
        mostrarToast(avisos.length ? `${resumen}. Ten en cuenta: ${avisos.join('; ')}.` : resumen, avisos.length ? 'warning' : 'success', 9000);
        bus.emit(EVENTOS.PROYECTO_ABIERTO, {});
        return true;
    } catch (e) {
        mostrarToast(e instanceof Error ? e.message : String(e), 'error', 9000);
        return false;
    } finally {
        ocupado = false;
    }
}

/** Los botones de la tarjeta «Proyecto completo». */
function montarProyecto() {
    const guardar = document.getElementById('btnGuardarProyecto');
    const entrada = document.getElementById('archivoProyecto');
    if (guardar) guardar.addEventListener('click', () => { guardarProyecto(); });
    if (entrada) entrada.addEventListener('change', e => {
        const t = /** @type {HTMLInputElement} */ (e.target);
        const archivo = t.files && t.files[0];
        try { t.value = ''; } catch (err) { /* algunos navegadores antiguos no lo permiten */ }
        if (archivo) abrirProyecto(archivo);
    });
}

export { montarProyecto, guardarProyecto, abrirProyecto };
