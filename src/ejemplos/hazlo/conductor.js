// @ts-check
// ejemplos/hazlo/conductor.js — (2027.01.03) los planes de planes.js en la propia página, a la vista. «Hazlo por mí»
// (ejecutarPlan) lleva cada control a la pantalla, lo resalta, espera un momento y lo usa como una persona: elige la opción,
// escribe el valor, marca la casilla, pulsa el botón, le pone al campo de archivo el del caso; y espera a que la página
// termine lo que pidió. «Muéstrame» (mostrarPlan) solo los señala, uno tras otro, sin tocar nada. Las esperas y su juicio
// son los de condiciones.js, los mismos con que Playwright hizo los ejemplos (tests/navegador/conductor.mjs): la guía repite
// lo que hizo el caso. Lo de la persona (las descargas: «senalar») no se pulsa nunca. Se detiene con una AbortSignal: lo hecho
// se queda, y un cálculo ya empezado termina solo (no se puede cortar). No sabe nada de la guía: le cuenta lo que va haciendo.

import { CONDICIONES, VEREDICTO } from './condiciones.js';
import { irASeccion } from '../../shared/navegacion.js';
import { aLaVista, resaltar, quitarResaltado } from './resaltado.js';

/**
 * El ritmo, en ms: cuánto queda resaltado un control antes de usarlo («Hazlo por mí») y mientras se señala («Muéstrame»),
 * lo más que se espera a que un control aparezca y se pueda usar, y cada cuánto se mira si se cumple una espera. Las pruebas
 * lo aceleran.
 */
export const RITMO = { hacer: 450, mostrar: 1400, paciencia: 30000, cadaCuanto: 120 };

/** Lo detuvieron («Detener», cerrar la guía, abrir otro proyecto): no es un error del plan. */
export class Detenido extends Error {
    constructor() {
        super('Detenido');
        this.name = 'Detenido';
    }
}

/**
 * @typedef {import('./planes.js').Op} Op
 * @typedef {(ruta: string) => Promise<{ nombre: string, bytes: Uint8Array }>} ArchivoDelCaso
 * @typedef {object} OpcionesDelConductor
 * @property {AbortSignal} [senal] para detenerlo
 * @property {ArchivoDelCaso} [archivo] los archivos del caso que se suben (las valoraciones de la V de Aiken), por su ruta
 * @property {(texto: string) => void} [alAvanzar] lo que va haciendo, en palabras (la guía lo dice en su línea de estado)
 * @property {string} [desde] la sección en que quedó lo anterior (otro plan del mismo paso): si la persona se fue de ella,
 *   no se sigue (ni se la trae de vuelta)
 */

/** La sección en que queda un plan: la de su última «ir» (vacía si no va a ninguna). @param {Op[]} ops @returns {string} */
export const seccionFinal = ops => ops.reduce((s, o) => (o.op === 'ir' ? o.seccion : s), '');

/** Si lo detuvieron, se detiene. @param {AbortSignal | undefined} senal */
function seguir(senal) {
    if (senal && senal.aborted) throw new Detenido();
}

/**
 * Espera unos ms, o hasta que lo detengan.
 * @param {number} ms
 * @param {AbortSignal} [senal]
 * @returns {Promise<void>}
 */
function dormir(ms, senal) {
    return new Promise((resolver, rechazar) => {
        if (senal && senal.aborted) { rechazar(new Detenido()); return; }
        const alDetener = () => { clearTimeout(t); rechazar(new Detenido()); };
        const t = setTimeout(() => { if (senal) senal.removeEventListener('abort', alDetener); resolver(); }, Math.max(0, ms));
        if (senal) senal.addEventListener('abort', alDetener, { once: true });
    });
}

/**
 * Espera a que algo se cumpla, mirando cada poco; false si no se cumplió en ms. El tiempo se cuenta por las esperas, no por
 * el reloj: el de la página puede estar parado (como en las pruebas) y un cálculo largo que bloquea la página solo alarga
 * la espera.
 * @param {() => boolean} cumple
 * @param {number} ms
 * @param {AbortSignal} [senal]
 */
async function hasta(cumple, ms, senal) {
    const cada = Math.max(5, RITMO.cadaCuanto);
    for (let esperado = 0; ; esperado += cada) {
        seguir(senal);
        if (cumple()) return true;
        if (esperado >= ms) return false;
        await dormir(cada, senal);
    }
}

/** La sección, a la vista. @param {string} id */
const seccionActiva = id => { const s = document.getElementById(id); return !!s && s.classList.contains('active'); };

/** El nombre de una sección: el de su enlace del menú («Analizador»). @param {string} id */
const nombreDeSeccion = id => { const l = document.querySelector(`.nav-link[href="#${id}"]`); return (l && (l.textContent || '').trim()) || id; };

/**
 * Si la persona se fue a otra pestaña (el plan es de la que dijo su última «ir»), lo dice: el plan no sigue a ciegas ni
 * espera a que un control de otra pestaña aparezca.
 * @param {string} seccion vacía: aún no fue a ninguna
 */
function enSuSeccion(seccion) {
    if (seccion && !seccionActiva(seccion)) throw new Error(`cambiaste de pestaña (este paso se hace en «${nombreDeSeccion(seccion)}»)`);
}

/** ¿Se puede usar? (Uno desactivado, no: como Playwright, se espera a que lo esté.) @param {Element} el */
const habilitado = el => !(/** @type {HTMLButtonElement} */ (el).disabled);

/**
 * El control de una operación en cuanto está en la página, a la vista y habilitado (lo que espera Playwright antes de
 * usarlo); si no llega a estarlo, dice qué le falta.
 * @param {() => Element | null | undefined} buscar
 * @param {string} nombre
 * @param {AbortSignal} [senal]
 * @param {string} [seccion] la del plan: si la persona se va de ella, no se espera más
 * @returns {Promise<HTMLElement>}
 */
async function control(buscar, nombre, senal, seccion = '') {
    /** @type {{ el: Element | null }} */
    const visto = { el: null };
    const listo = await hasta(() => {
        enSuSeccion(seccion);
        visto.el = buscar() || null;
        return !!visto.el && aLaVista(visto.el) && habilitado(visto.el);
    }, RITMO.paciencia, senal);
    const el = visto.el;
    if (!listo || !el) throw new Error(!el ? `${nombre}: no está en la página` : !aLaVista(el) ? `${nombre}: está en la página, pero no a la vista` : `${nombre}: está desactivado`);
    return /** @type {HTMLElement} */ (el);
}

/** Avisa a la página de un valor nuevo, como el navegador cuando se escribe o se elige. @param {Element} el */
function avisarCambio(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Pone el valor de un campo de texto o de una lista desplegable (en una lista, debe ser una de sus opciones; en un campo con
 * largo máximo, hasta ese largo, como cuando se escribe) y avisa a la página.
 * @param {HTMLElement} el
 * @param {string} valor
 * @param {string} nombre
 */
function ponerValor(el, valor, nombre) {
    if (el.tagName === 'SELECT' && !opciones(el).some(o => o.value === valor)) throw new Error(`${nombre}: la lista no tiene esa opción («${valor}»)`);
    const campo = /** @type {HTMLInputElement} */ (el);
    campo.value = el.tagName !== 'SELECT' && campo.maxLength > 0 ? valor.slice(0, campo.maxLength) : valor;
    avisarCambio(el);
}

/** Las opciones de una lista. @param {Element} el @returns {HTMLOptionElement[]} */
const opciones = el => Array.from(/** @type {HTMLSelectElement} */ (el).options || []);

/**
 * Lo que dice la guía de un valor de una lista: si la opción se ve con otro texto (la etiqueta de una variable, «.70 ·
 * recomendado»), ese texto en lugar del valor («Variable 1: Ansiedad… (General_I)»). Una opción vacía (la de «Seleccionar
 * variable…») no se nombra.
 * @param {HTMLElement} el
 * @param {string} valor
 * @param {string} nombre (termina en «: valor» cuando lo nombra)
 */
function nombreConOpcion(el, valor, nombre) {
    if (el.tagName !== 'SELECT' || !valor || !nombre.endsWith(`: ${valor}`)) return nombre;
    const op = opciones(el).find(o => o.value === valor);
    const texto = op ? (op.textContent || '').trim() : '';
    return texto && texto !== valor ? nombre.slice(0, nombre.length - valor.length) + texto : nombre;
}

/**
 * ¿Ya está la casilla como se pide? Entonces no se toca (como Playwright): puede estar desactivada, como la invarianza
 * estricta con el estimador WLSMV, sin que eso importe.
 * @param {Element | null} el
 * @param {boolean} valor
 */
const yaEsta = (el, valor) => !!el && /** @type {HTMLInputElement} */ (el).checked === valor;

/** Marca o desmarca una casilla (o elige una opción) con un clic, como una persona, y comprueba que quedó así. @param {HTMLElement} el @param {boolean} valor @param {string} nombre */
function marcarCasilla(el, valor, nombre) {
    const casilla = /** @type {HTMLInputElement} */ (el);
    if (casilla.checked !== valor) casilla.click();
    if (casilla.checked !== valor) throw new Error(`${nombre}: no se pudo ${valor ? 'marcar' : 'desmarcar'}`);
}

/**
 * Espera una promesa, o hasta que lo detengan (lo que no se puede cortar —bajar un archivo— sigue solo, sin nadie que lo
 * espere).
 * @template T
 * @param {Promise<T>} promesa
 * @param {AbortSignal} [senal]
 * @returns {Promise<T>}
 */
function conDetener(promesa, senal) {
    if (!senal) return promesa;
    return new Promise((resolver, rechazar) => {
        if (senal.aborted) { rechazar(new Detenido()); return; }
        const alDetener = () => rechazar(new Detenido());
        senal.addEventListener('abort', alDetener, { once: true });
        promesa.then(v => { senal.removeEventListener('abort', alDetener); resolver(v); }, e => { senal.removeEventListener('abort', alDetener); rechazar(e); });
    });
}

/**
 * Le pone a un campo de archivo uno del caso, como si se hubiera elegido en el diálogo (que la página no puede abrir con un
 * archivo puesto), y avisa a la página.
 * @param {HTMLInputElement} entrada
 * @param {File} archivo
 */
function ponerArchivo(entrada, archivo) {
    if (typeof DataTransfer !== 'function') throw new Error(`este navegador no deja poner un archivo por ti: pulsa «Cargar CSV» y elige «${archivo.name}» (está en la carpeta del caso, en la pestaña «Ejemplos»)`);
    const dt = new DataTransfer();
    dt.items.add(archivo);
    entrada.files = dt.files;
    avisarCambio(entrada);
}

/**
 * Va a una sección del menú (si no está ya en ella) y espera a que se vea.
 * @param {string} id
 * @param {AbortSignal} [senal]
 */
async function irA(id, senal) {
    if (!seccionActiva(id) && !irASeccion(id)) throw new Error(`la página no tiene la sección «${id}»`);
    if (!(await hasta(() => seccionActiva(id), RITMO.paciencia, senal))) throw new Error(`no se pudo ir a la sección «${id}»`);
}

/** El bloque k-ésimo (los criterios de la V de Aiken). @param {string} bloques @param {number} k @returns {Element | null} */
const bloque = (bloques, k) => document.querySelectorAll(bloques)[k] || null;

/**
 * El control que usa (o señala) una operación, buscado ahora; null si no tiene ninguno (ir, vaciar, esperar…).
 * @param {Op} o
 * @returns {Element | null}
 */
function controlDe(o) {
    switch (o.op) {
        case 'marcar': case 'poner': case 'ponerOpcion': case 'pulsar': case 'senalar': case 'quitarTodos': return document.querySelector(o.selector);
        case 'marcarSolo': return document.querySelector(o.contenedor);
        case 'bloques': return document.querySelector(o.agregar);
        case 'ponerEnBloque': { const b = bloque(o.bloques, o.indice); return b ? b.querySelector(o.selector) : null; }
        case 'subirEnBloque': { const b = bloque(o.bloques, o.indice); return b ? b.querySelector(o.boton) : null; }
        default: return null;   // (ir, limpiarAviso, esperar: sin control)
    }
}

/**
 * Hace las operaciones de un plan en la página, a la vista (lo de la persona, «senalar», no: eso solo se señala). Devuelve
 * lo último que dijo la página en una espera (el aviso de un análisis, la salida del SEM, el texto de una tarjeta).
 * @param {Op[]} ops
 * @param {OpcionesDelConductor} [opciones]
 * @returns {Promise<string>}
 */
export async function ejecutarPlan(ops, { senal, archivo, alAvanzar = () => {}, desde = '' } = {}) {
    let ultimo = '', seccion = desde;
    /**
     * Resalta el control, dice qué va a hacer con él y deja que se vea; si entretanto la persona se fue a otra pestaña, ya
     * no lo usa.
     * @param {Element} el @param {string} nombre
     */
    const usar = async (el, nombre) => {
        resaltar(el);
        alAvanzar(nombre);
        await dormir(RITMO.hacer, senal);
        enSuSeccion(seccion);
    };
    try {
        for (const o of ops) {
            seguir(senal);
            // (si la persona se fue a otra pestaña, no se sigue: ni con un control de esta ni yendo a otra sección)
            if (o.op !== 'esperar') enSuSeccion(seccion);
            switch (o.op) {
                case 'ir': await irA(o.seccion, senal); seccion = o.seccion; break;
                case 'marcar': {
                    const el = document.querySelector(o.selector);
                    // (las opciones de la regresión que solo se ven con ciertos predictores: si no está, no se toca)
                    if (o.siVisible && (!el || !aLaVista(el))) {
                        if (o.valor) throw new Error(`${o.nombre}: la casilla no está a la vista (la regresión no admite esa opción con estos predictores)`);
                        break;
                    }
                    if (yaEsta(el, o.valor)) {
                        if (el && aLaVista(el)) await usar(el, o.nombre);   // (se señala igual: es lo que pide el paso)
                        break;
                    }
                    const c = await control(() => document.querySelector(o.selector), o.nombre, senal, seccion);
                    await usar(c, o.nombre);
                    marcarCasilla(c, o.valor, o.nombre);
                    break;
                }
                case 'marcarSolo': {
                    // (las que pide el paso, y ninguna más: las que se marcaron antes no deben colarse en el análisis)
                    const lista = await control(() => document.querySelector(o.contenedor), o.nombre, senal, seccion);
                    const casillas = /** @type {HTMLInputElement[]} */ ([...lista.querySelectorAll('input[type="checkbox"]')]);
                    const falta = o.valores.find(v => !casillas.some(c => c.value === v));
                    if (falta !== undefined) throw new Error(`${o.nombre}: la lista no tiene «${falta}»`);
                    await usar(lista, o.nombre);
                    for (const c of casillas) {
                        const quiere = o.valores.includes(c.value);
                        if (c.checked === quiere) continue;
                        const cc = await control(() => c, o.nombre, senal, seccion);
                        await usar(cc, o.nombre);
                        marcarCasilla(cc, quiere, o.nombre);
                    }
                    break;
                }
                case 'poner': {
                    const c = await control(() => controlDe(o), o.nombre, senal, seccion);
                    await usar(c, nombreConOpcion(c, o.valor, o.nombre));
                    ponerValor(c, o.valor, o.nombre);
                    break;
                }
                case 'ponerOpcion': {
                    const c = await control(() => controlDe(o), o.nombre, senal, seccion);
                    const op = opciones(c).find(x => x.value === o.texto || (x.textContent || '').trim() === o.texto || (x.textContent || '').startsWith(o.texto));
                    if (!op) throw new Error(`${o.nombre}: la lista no tiene «${o.texto}»`);
                    await usar(c, o.nombre);
                    ponerValor(c, op.value, o.nombre);
                    break;
                }
                case 'quitarTodos': {
                    for (let vueltas = 0; ; vueltas++) {
                        const hay = document.querySelectorAll(o.selector).length;
                        if (!hay) break;
                        if (vueltas > 50) throw new Error(`${o.nombre}: no se pudieron quitar`);
                        const c = await control(() => document.querySelector(o.selector), o.nombre, senal, seccion);
                        await usar(c, o.nombre);
                        c.click();
                        if (document.querySelectorAll(o.selector).length >= hay) throw new Error(`${o.nombre}: la página no quitó el que se pulsó`);
                    }
                    break;
                }
                case 'limpiarAviso': {
                    // (para esperar el aviso de lo que se pide ahora, no el de antes; y sin dejar el recuadro vacío a la vista)
                    const t = document.getElementById('toast');
                    if (t) { t.textContent = ''; t.classList.remove('show'); }
                    break;
                }
                case 'pulsar': {
                    const c = await control(() => controlDe(o), o.nombre, senal, seccion);
                    await usar(c, o.nombre);
                    if (o.vaciar) { const zona = document.querySelector(o.vaciar); if (zona) zona.innerHTML = ''; }   // (en el mismo instante del clic)
                    c.click();
                    break;
                }
                case 'senalar': break;
                case 'bloques': {
                    for (let vueltas = 0; ; vueltas++) {
                        const hay = document.querySelectorAll(o.bloques).length;
                        if (hay === o.n) break;
                        if (vueltas > o.n + 50) throw new Error(`${o.nombre}: no se pudo dejar así`);
                        const quitar = [...document.querySelectorAll(`${o.bloques} ${o.quitar}`)].pop();
                        const c = hay < o.n ? await control(() => document.querySelector(o.agregar), o.nombre, senal, seccion) : /** @type {HTMLElement | undefined} */ (quitar);
                        if (!c) throw new Error(`${o.nombre}: no está el botón para quitar uno`);
                        await usar(c, o.nombre);
                        c.click();
                        if (document.querySelectorAll(o.bloques).length === hay) throw new Error(`${o.nombre}: la página no ${hay < o.n ? 'agregó' : 'quitó'} el criterio`);
                    }
                    break;
                }
                case 'ponerEnBloque': {
                    const c = await control(() => controlDe(o), o.nombre, senal, seccion);
                    await usar(c, o.nombre);
                    ponerValor(c, o.valor, o.nombre);
                    break;
                }
                case 'subirEnBloque': {
                    if (!archivo) throw new Error(`${o.nombre}: no hay de dónde sacar «${o.archivo}»`);
                    const boton = await control(() => controlDe(o), o.nombre, senal, seccion);
                    const b = bloque(o.bloques, o.indice);
                    const entrada = /** @type {HTMLInputElement | null} */ (b ? b.querySelector(o.entrada) : null);
                    if (!entrada) throw new Error(`${o.nombre}: no está el campo del archivo`);
                    await usar(boton, o.nombre);
                    const { nombre, bytes } = await conDetener(archivo(o.archivo), senal);
                    seguir(senal);
                    enSuSeccion(seccion);
                    ponerArchivo(entrada, new File([/** @type {BlobPart} */ (bytes)], nombre, { type: 'text/csv' }));
                    break;
                }
                case 'esperar': {
                    alAvanzar(o.nombre);
                    const cumple = CONDICIONES[o.condicion];
                    if (!(await hasta(() => cumple(o.arg), o.ms, senal))) throw new Error(`${o.nombre.replace(/…$/, '')}: la página no terminó a tiempo`);
                    const { dicho, error } = VEREDICTO(o);
                    if (error) throw new Error(error);
                    if (dicho) ultimo = dicho;
                    break;
                }
                default: throw new Error(`operación desconocida: ${JSON.stringify(o).slice(0, 120)}`);
            }
        }
        return ultimo;
    } finally {
        quitarResaltado();
    }
}

/**
 * Señala, uno tras otro, los controles de un plan (va a su sección), sin tocar nada: los que aún no están (el criterio que
 * se agregaría, la casilla que solo sale con ciertos predictores) se saltan. Devuelve los que señaló.
 * @param {Op[]} ops
 * @param {OpcionesDelConductor} [opciones]
 * @returns {Promise<Element[]>}
 */
export async function mostrarPlan(ops, { senal, alAvanzar = () => {}, desde = '' } = {}) {
    /** @type {Element[]} */
    const vistos = [];
    let seccion = desde;
    try {
        for (const o of ops) {
            seguir(senal);
            enSuSeccion(seccion);
            if (o.op === 'ir') { await irA(o.seccion, senal); seccion = o.seccion; continue; }
            const el = controlDe(o);
            if (!el || !aLaVista(el) || !('nombre' in o)) continue;
            resaltar(el);
            vistos.push(el);
            alAvanzar(o.op === 'poner' ? nombreConOpcion(/** @type {HTMLElement} */ (el), o.valor, o.nombre) : o.nombre);
            await dormir(RITMO.mostrar, senal);
        }
        return vistos;
    } finally {
        quitarResaltado();
    }
}
