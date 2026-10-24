// @ts-check
// ejemplos/index.js — (2027.01.02) la pestaña «Ejemplos»: los casos resueltos de ejemplos/ (los hizo la propia página en un
// navegador de verdad: ejemplos/README.md) en una galería; cada uno con su vista (sus archivos, para bajarlos uno a uno o
// todos en un .zip, y su README) y con «Abrir en StatSim», que carga su proyecto, lleva al Analizador y deja a la vista sus
// pasos (guia.js; desde la 2027.01.03, con «Muéstrame» y «Hazlo por mí», que bajan del sitio lo que suben: los archivos del
// caso). Lee el catálogo, ejemplos/indice.json (catalogo.js): un caso nuevo aparece solo. Se monta al importarse:
// main.js lo carga la primera vez que se muestra la pestaña (y, si no pudiera, lo dice en ella). Sin la carpeta en el sitio,
// o sin red, lo dice y deja volver a intentarlo. Aquí solo se reparte el trabajo: el HTML lo arman galeria.js y caso.js; el
// .zip, paquete.js; la apertura, abrir.js. Los botones ocupados no se desactivan (aria-disabled): uno desactivado suelta el
// foco, que vuelve al principio de la página.

import { VERSION } from '../version.js';
import { irASeccion } from '../shared/navegacion.js';
import { mostrarToast } from '../shared/toast.js';
import { descargarBlob } from '../shared/descargas.js';
import { bytesDelArchivo, cargarCatalogo, numeroDe } from './catalogo.js';
import { htmlDeLaGaleria } from './galeria.js';
import { htmlDelCaso } from './caso.js';
import { abrirEjemplo } from './abrir.js';
import { nombreDelPaquete, paqueteDelCaso } from './paquete.js';
import { mostrarGuia } from './guia.js';

/** Los archivos del sitio, con fetch (se resuelve al pedir: las pruebas lo sustituyen). @type {import('./catalogo.js').Obtener} */
const obtenerDelSitio = url => fetch(url);

/** El texto de un error. @param {unknown} e */
const mensaje = e => (e instanceof Error ? e.message : String(e));

/** Marca unos botones como ocupados (o libres), sin desactivarlos. @param {HTMLElement[]} botones @param {boolean} ocupados */
const ocupar = (botones, ocupados) => botones.forEach(b => {
    if (ocupados) b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled');
});

/**
 * Lleva un elemento al principio de la pantalla, bajo la cabecera fija (que en un teléfono mide el doble: se mide).
 * @param {HTMLElement} el
 */
function irA(el) {
    const cabecera = document.querySelector('.header');
    const alto = cabecera ? cabecera.getBoundingClientRect().height : 0;
    el.style.scrollMarginTop = `${Math.ceil(alto) + 16}px`;
    el.scrollIntoView({ block: 'start' });
}

/**
 * @typedef {object} PestanaEjemplos lo que hace la pestaña (lo usan sus botones y las pruebas)
 * @property {() => Promise<import('./catalogo.js').Catalogo | null>} cargar pide el catálogo y pinta la galería
 * @property {(carpeta: string) => Promise<boolean>} verCaso muestra la vista de un caso
 * @property {(carpeta?: string) => void} volver de la vista de un caso a la galería
 * @property {(carpeta: string) => Promise<boolean>} abrir «Abrir en StatSim»
 * @property {(carpeta: string) => Promise<boolean>} descargarTodo el .zip del caso
 */

/**
 * Monta la pestaña «Ejemplos» (una sola vez) y pide su catálogo.
 * @param {{ obtener?: import('./catalogo.js').Obtener, version?: string }} [opciones]
 * @returns {PestanaEjemplos | null} null si la página no tiene la pestaña (o ya estaba montada)
 */
export function montarEjemplos({ obtener = obtenerDelSitio, version = VERSION } = {}) {
    // (los cuatro, o ninguno: se comprueba aquí mismo)
    const [seccion, estado, galeria, vista] = /** @type {HTMLElement[]} */ (['ejemplos', 'ejemplosEstado', 'ejemplosGaleria', 'ejemplosCaso'].map(id => document.getElementById(id)));
    if (!seccion || !estado || !galeria || !vista || seccion.dataset.montado === '1') return null;
    seccion.dataset.montado = '1';

    /** @type {import('./catalogo.js').Catalogo | null} */
    let catalogo = null;
    /** @type {Promise<import('./catalogo.js').Catalogo | null> | null} */
    let pidiendo = null;
    /** @type {Map<string, string>} los README ya leídos, por carpeta */
    const leemes = new Map();
    /** Lo que está en curso: un caso abriéndose y los .zip que se preparan (por carpeta). */
    let abriendo = false;
    const empaquetando = new Set();
    /** El turno de la vista: si se pide otro caso (o se vuelve a la galería) mientras llega un README, el viejo no se pinta. */
    let turno = 0;

    /**
     * El aviso de la pestaña. Vacío, no ocupa sitio, pero no se oculta: así un lector de pantalla lee lo que se escriba en él
     * después (un aviso que aparece junto con su texto puede no leerse).
     * @param {string} texto @param {boolean} [error]
     */
    const avisar = (texto, error = false) => {
        estado.hidden = false;
        estado.textContent = texto;
        estado.classList.toggle('aviso-error', error);
    };

    /** Los botones de una acción sobre un caso (los de la galería y los de su vista). @param {string} accion @param {string} carpeta */
    const botonesDe = (accion, carpeta) => /** @type {HTMLButtonElement[]} */ ([...seccion.querySelectorAll(`[data-accion-ejemplo="${accion}"]`)])
        .filter(b => b.getAttribute('data-carpeta') === carpeta);

    async function cargar() {
        if (pidiendo) return pidiendo;
        // si el foco estaba en la galería («Volver a intentarlo»), vuelve a ella al terminar: al repintarla se perdería
        const conFoco = galeria.contains(document.activeElement);
        avisar('Cargando los ejemplos…');
        pidiendo = (async () => {
            try {
                catalogo = await cargarCatalogo(obtener, version);
                galeria.innerHTML = htmlDeLaGaleria(catalogo);
                avisar('');
                return catalogo;
            } catch (e) {
                avisar(mensaje(e), true);
                galeria.innerHTML = '<p class="ejemplos-reintentar"><button type="button" class="btn btn-outline" data-accion-ejemplo="reintentar">Volver a intentarlo</button></p>';
                return null;
            } finally {
                pidiendo = null;
                const primero = /** @type {HTMLElement | null} */ (galeria.querySelector('[data-accion-ejemplo]'));
                if (conFoco && primero) primero.focus();
            }
        })();
        return pidiendo;
    }

    /** El caso de una carpeta (pide el catálogo si aún no está). @param {string} carpeta */
    async function casoDe(carpeta) {
        const c = catalogo || (await cargar());
        return (c && c.casos.find(x => x.carpeta === carpeta)) || null;
    }

    /** @param {string} carpeta */
    async function verCaso(carpeta) {
        const mio = ++turno;
        const e = await casoDe(carpeta);
        if (!e || mio !== turno) return false;
        let leeme = leemes.get(carpeta) ?? null, aviso = '';
        if (leeme === null) {
            avisar(`Abriendo el caso ${numeroDe(e)}…`);
            try {
                leeme = new TextDecoder().decode(await bytesDelArchivo(e, 'README.md', { obtener, version }));
                leemes.set(carpeta, leeme);
            } catch (err) {
                aviso = mensaje(err);   // la vista sale igual: sus archivos se pueden bajar
            }
            avisar('');
            if (mio !== turno) return false;   // entretanto se pidió otro caso, o se volvió a la galería
        }
        vista.innerHTML = htmlDelCaso(e, leeme, version, aviso);
        galeria.hidden = true;
        vista.hidden = false;
        // si su .zip se está preparando (se pidió antes de volver a la galería), su botón sigue ocupado
        if (empaquetando.has(carpeta)) {
            ocupar(botonesDe('zip', carpeta), true);
            decir(carpeta, 'Preparando el .zip…');
        }
        irA(vista);
        const titulo = /** @type {HTMLElement | null} */ (vista.querySelector('.ejemplo-caso-titulo'));
        if (titulo) titulo.focus({ preventScroll: true });
        return true;
    }

    /** @param {string} [carpeta] el caso del que se vuelve (el foco va a su tarjeta) */
    function volver(carpeta) {
        turno++;
        vista.hidden = true;
        vista.innerHTML = '';
        galeria.hidden = false;
        const boton = carpeta ? botonesDe('ver', carpeta)[0] : null;
        if (boton) {
            boton.scrollIntoView({ block: 'center' });
            boton.focus({ preventScroll: true });
        } else seccion.scrollIntoView({ block: 'start' });
    }

    /** Lo que va pasando con el .zip de un caso, en su vista (si es la que está abierta). @param {string} carpeta @param {string} texto */
    function decir(carpeta, texto) {
        const p = vista.querySelector(`.ejemplo-caso[data-carpeta="${carpeta}"] .ejemplo-progreso`);
        if (p) p.textContent = texto;
    }

    /** @param {string} carpeta */
    async function abrir(carpeta) {
        const e = await casoDe(carpeta);
        if (!e || abriendo) return false;
        abriendo = true;
        const botones = botonesDe('abrir', carpeta);
        ocupar(botones, true);
        avisar(`Abriendo el caso ${numeroDe(e)} en StatSim…`);
        try {
            // proyecto/ui.js dice lo que abrió (o por qué no pudo); false: se canceló o no se pudo
            if (!(await abrirEjemplo(e, { obtener, version }))) return false;
            mostrarGuia(e, {
                alVerCaso: c => { if (irASeccion('ejemplos')) verCaso(c); },
                // (2027.01.03) lo que sube «Hazlo por mí» (las valoraciones de la V de Aiken): del sitio, comprobado con el catálogo
                archivo: async ruta => ({ nombre: ruta.split('/').pop() || ruta, bytes: await bytesDelArchivo(e, ruta, { obtener, version }) }),
            });
            irASeccion('analizador');
            window.scrollTo(0, 0);
            return true;
        } catch (err) {
            mostrarToast(`No se pudo abrir el caso ${numeroDe(e)}: ${mensaje(err)}`, 'error', 9000);
            return false;
        } finally {
            abriendo = false;
            avisar('');
            ocupar(botones, false);
        }
    }

    /** @param {string} carpeta */
    async function descargarTodo(carpeta) {
        const e = await casoDe(carpeta);
        if (!e || empaquetando.has(carpeta)) return false;
        empaquetando.add(carpeta);
        ocupar(botonesDe('zip', carpeta), true);
        try {
            const trozos = await paqueteDelCaso(e, {
                obtener, version,
                alAvanzar: (hechos, total) => decir(carpeta, hechos < total ? `Preparando el .zip: ${hechos} de ${total} archivos…` : 'Listo: el .zip se está descargando.'),
            });
            descargarBlob(new Blob(/** @type {BlobPart[]} */ (/** @type {unknown} */ (trozos)), { type: 'application/zip' }), nombreDelPaquete(e));
            mostrarToast(`Caso ${numeroDe(e)} descargado entero: ${nombreDelPaquete(e)}`, 'success', 6000);
            return true;
        } catch (err) {
            decir(carpeta, '');
            mostrarToast(`No se pudo preparar el .zip del caso ${numeroDe(e)}: ${mensaje(err)}`, 'error', 9000);
            return false;
        } finally {
            empaquetando.delete(carpeta);
            // los de su vista de ahora (si se volvió a abrir mientras tanto, son otros que los del principio)
            ocupar(botonesDe('zip', carpeta), false);
        }
    }

    /** «Ver los casos» (la cabecera de la pestaña): la galería, aunque haya un caso abierto. */
    function verGaleria() {
        if (!vista.hidden) volver();
        irA(galeria);
    }

    // un solo oyente para todos los botones de la pestaña (las tarjetas y la vista se vuelven a pintar)
    seccion.addEventListener('click', ev => {
        const objetivo = /** @type {HTMLElement | null} */ (ev.target);
        const boton = objetivo && typeof objetivo.closest === 'function' ? objetivo.closest('[data-accion-ejemplo]') : null;
        if (!boton || !seccion.contains(boton)) return;
        const accion = boton.getAttribute('data-accion-ejemplo'), carpeta = boton.getAttribute('data-carpeta') || '';
        if (boton.tagName === 'A') ev.preventDefault();   // «Ver los casos» es un enlace a la pestaña: ya se está en ella
        if (boton.getAttribute('aria-disabled') === 'true') return;
        if (accion === 'galeria') verGaleria();
        else if (accion === 'ver') verCaso(carpeta);
        else if (accion === 'volver') volver(carpeta);
        else if (accion === 'abrir') abrir(carpeta);
        else if (accion === 'zip') descargarTodo(carpeta);
        else if (accion === 'reintentar') cargar();
    });

    cargar();
    return { cargar, verCaso, volver, abrir, descargarTodo };
}

/** La pestaña, montada al importar el módulo (null si la página no la tiene). */
export const pestana = montarEjemplos();
