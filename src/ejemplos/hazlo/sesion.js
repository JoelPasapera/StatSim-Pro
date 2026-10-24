// @ts-check
// ejemplos/hazlo/sesion.js — (2027.01.03) «Muéstrame», «Hazlo por mí» y «Hazlo todo por mí» en la guía de un caso: qué se
// hace de cada paso (su guion, con los planes de planes.js, que conductor.js hace o señala en la página), en qué orden, lo
// que dice la guía mientras tanto, y «Detener» (o la tecla Esc). Solo se repite lo que el proyecto no trae: los análisis de
// los pasos que hay que repetir. Lo demás es de la persona y solo se señala: las descargas de lo que quedó en la página (que
// quedan señaladas al terminar, hasta que pulse fuera de la guía) y «Guardar proyecto». Mientras trabaja, la guía se pliega
// para no tapar la página; al terminar de hacer sigue plegada (lo que importa es el resultado) y al terminar de mostrar, o
// si se detiene o algo falla, vuelve como estaba. No pinta la guía: le pide a su vista (guia.js) que diga, que se pliegue,
// que marque un paso o que ocupe sus botones. Las funciones de arriba (qué ofrece cada paso, qué descargas valen, lo que se
// dice) no tocan el DOM.

import { accionEjecutable, planDe, senalesDe } from './planes.js';
import { Detenido, ejecutarPlan, mostrarPlan, seccionFinal } from './conductor.js';
import { dejarSenalados, quitarSenalado } from './resaltado.js';
import { estadoDelPaso, pasosEnPalabras } from '../catalogo.js';

/**
 * @typedef {import('../catalogo.js').Ejemplo} Ejemplo
 * @typedef {import('./planes.js').AccionDelGuion} AccionDelGuion
 * @typedef {import('./planes.js').Op} Op
 */

/** ¿Trae el caso el guion de cada paso? (Unos ejemplos de la 2027.01.02 no lo traen: su guía no ofrece nada de esto.) @param {Ejemplo} e */
export const conGuiones = e => Array.isArray(e.guiones) && e.guiones.length === e.pasos.length;

/** El guion del paso n (desde 1); vacío si no lo hay. @param {Ejemplo} e @param {number} n @returns {AccionDelGuion[]} */
export const guionDe = (e, n) => (conGuiones(e) && /** @type {AccionDelGuion[][]} */ (e.guiones)[n - 1]) || [];

/** ¿Ofrece «Hazlo por mí» el paso n? Si hay que repetirlo y su guion hace algo (no solo descargas). @param {Ejemplo} e @param {number} n */
export const seHace = (e, n) => estadoDelPaso(n, e.repetir) === 'repetir' && guionDe(e, n).some(accionEjecutable);

/** ¿Ofrece «Muéstrame» el paso n? Si tiene guion. @param {Ejemplo} e @param {number} n */
export const seMuestra = (e, n) => guionDe(e, n).length > 0;

/** Los pasos que hace «Hazlo todo por mí», en orden. @param {Ejemplo} e */
export const pasosQueSeHacen = e => e.pasos.map((_, i) => i + 1).filter(n => seHace(e, n));

/**
 * Las descargas que valen tras hacer unos pasos (en orden), y los pasos cuyas descargas ya no están. Las de un análisis de
 * la vista principal valen hasta que otro análisis lo reemplaza; las de una tarjeta (la V de Aiken, el AFE, la invarianza),
 * hasta que esa tarjeta calcula otra vez. Tras el último de los pasos que se repiten, también las de los pasos opcionales
 * de después: son del último análisis.
 * @param {Ejemplo} e
 * @param {number[]} pasos
 * @returns {{ vigentes: Array<{ n: number, ops: Op[] }>, perdidos: number[] }} vigentes: por paso, lo que se señala
 */
export function descargasTras(e, pasos) {
    /** @type {Array<{ n: number, a: AccionDelGuion }>} */
    const acciones = pasos.flatMap(n => guionDe(e, n).map(a => ({ n, a })));
    const ultimo = pasos[pasos.length - 1];
    if (ultimo === e.repetir.hasta) {
        for (let k = ultimo + 1; k <= e.pasos.length; k++) acciones.push(...guionDe(e, k).filter(a => a.accion === 'exportarAnalisis').map(a => ({ n: k, a })));
    }
    /** @type {Map<string, { n: number, ops: Op[] }>} lo que vale de cada cosa: 'analisis' (la vista principal) o la tarjeta */
    const vigentes = new Map();
    const perdidos = new Set();
    /** @param {string} clave */
    const perder = clave => { const v = vigentes.get(clave); if (v) { perdidos.add(v.n); vigentes.delete(clave); } };
    for (const { n, a } of acciones) {
        if (a.accion === 'analizar') { perder('analisis'); continue; }
        const ops = senalesDe(planDe(a).ops);
        if (!ops.length) continue;
        const clave = a.accion === 'exportarAnalisis' ? 'analisis' : a.accion;
        const previo = vigentes.get(clave);
        if (previo && previo.n !== n) perder(clave);
        const sigue = vigentes.get(clave);   // (dos descargas del mismo paso: las dos)
        vigentes.set(clave, { n, ops: sigue ? [...sigue.ops, ...ops] : ops });
    }
    const lista = [...vigentes.values()].sort((x, y) => x.n - y.n);
    lista.forEach(v => perdidos.delete(v.n));
    return { vigentes: lista, perdidos: [...perdidos].sort((x, y) => x - y) };
}

/** Unos textos, en una frase: «a», «a y b», «a, b y c». @param {string[]} xs */
const unir = xs => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`);
/** Con minúscula inicial (un título dentro de una frase). @param {string} t */
const minuscula = t => t.charAt(0).toLowerCase() + t.slice(1);
/** Con mayúscula inicial (un mensaje al empezar una frase). @param {string} t */
const capital = t => t.charAt(0).toUpperCase() + t.slice(1);
/** «el paso 2» → «del paso 2»; «los pasos 2 y 3» → «de los pasos 2 y 3». @param {string} t */
const de = t => (t.startsWith('el ') ? `del ${t.slice(3)}` : `de ${t}`);

/**
 * Unos pasos, en palabras: los seguidos, como el README («los pasos 2 a 4»); si no, uno por uno («los pasos 2, 3 y 5»).
 * @param {number[]} pasos (en orden)
 */
export function listaDePasos(pasos) {
    const seguidos = pasos.every((n, i) => i === 0 || n === pasos[i - 1] + 1);
    if (pasos.length && seguidos) return pasosEnPalabras({ desde: pasos[0], hasta: pasos[pasos.length - 1] });
    return `los pasos ${unir(pasos.map(String))}`;
}

/**
 * Lo que dice la guía al terminar de mostrar el paso n.
 * @param {Ejemplo} e
 * @param {number} n
 * @param {number} senalados cuántos controles se señalaron
 */
export function finDeMostrar(e, n, senalados) {
    if (!senalados) return `Paso ${n}: sus controles aún no están a la vista (salen al hacer el paso anterior).`;
    const estado = estadoDelPaso(n, e.repetir);
    if (estado === 'hecho') return `Paso ${n}: eso es lo que se hizo. Ya lo trajo el proyecto: no hace falta repetirlo.`;
    if (estado === 'opcional') return `Paso ${n}: eso es tuyo (las descargas, «Guardar proyecto»): pulsa lo que quieras guardar.`;
    return seHace(e, n) ? `Paso ${n}: eso es lo que se toca. «Hazlo por mí» lo hace por ti, a la vista.` : `Paso ${n}: eso es lo que se toca.`;
}

/**
 * Lo que dice de las descargas al terminar: si las dejó señaladas, o por qué no.
 * @param {boolean} senaladas
 * @param {string} sinSenalar por qué no se señalaron (vacío: no había nada que señalar)
 */
const deLasDescargas = (senaladas, sinSenalar) => (senaladas ? ' Sus descargas son tuyas: te las dejo señaladas.'
    : sinSenalar ? ` No te señalé sus descargas: ${minuscula(sinSenalar.replace(/\.$/, ''))}.` : '');

/**
 * Lo que dice la guía al terminar «Hazlo por mí» del paso n.
 * @param {number} n
 * @param {string[]} hechas los títulos de las acciones que hizo
 * @param {boolean} senaladas si dejó señaladas sus descargas
 * @param {string} [sinSenalar] por qué no las señaló, si las había
 */
export function finDelPaso(n, hechas, senaladas, sinSenalar = '') {
    return `Listo: paso ${n} hecho (${unir(hechas.map(minuscula))}).${deLasDescargas(senaladas, sinSenalar)} Despliega la guía (▴) para seguir.`;
}

/**
 * Lo que dice la guía al terminar «Hazlo todo por mí»: lo que hizo, las descargas que dejó señaladas (las de lo que quedó en
 * la página) y las que ya no están (otro análisis las reemplazó: se rehacen repitiendo su paso, o están hechas en la
 * pestaña «Ejemplos»).
 * @param {number[]} pasos los que hizo
 * @param {{ vigentes: number[], perdidos: number[], senaladas: boolean, sinSenalar?: string }} descargas
 */
export function finDeTodo(pasos, { vigentes, perdidos, senaladas, sinSenalar = '' }) {
    const hechas = `Listo: se ${pasos.length === 1 ? 'repitió' : 'repitieron'} ${listaDePasos(pasos)}, como en el caso.`;
    const tuyas = senaladas ? (perdidos.length ? ` Te dejo señaladas las descargas de lo que ves (las ${de(listaDePasos(vigentes))}).` : ' Te dejo señaladas sus descargas.')
        : sinSenalar && vigentes.length ? ` No te señalé sus descargas: ${minuscula(sinSenalar.replace(/\.$/, ''))}.` : '';
    const perdidas = perdidos.length
        ? ` Cada análisis reemplaza al anterior en la página: las descargas ${de(listaDePasos(perdidos))} ya no están; ${perdidos.length === 1 ? 'repítelo' : 'repítelos'} con su «Hazlo por mí» o bájalas hechas en la pestaña «Ejemplos».`
        : '';
    return hechas + tuyas + perdidas;
}

/**
 * Lo que dice la guía si se detuvo o algo falló.
 * @param {number} n el paso en que estaba
 * @param {unknown} error
 * @param {boolean} mostrando si estaba mostrando (y no haciendo)
 */
export function finConProblema(n, error, mostrando) {
    if (error instanceof Detenido) {
        return mostrando ? `Detenido en el paso ${n}.` : `Detenido en el paso ${n}. Lo que ya se hizo se queda; si un cálculo había empezado, termina solo.`;
    }
    const mensaje = capital((error instanceof Error ? error.message : String(error)).trim().replace(/\.$/, ''));
    return mostrando ? `No se pudo mostrar el paso ${n}. ${mensaje}.`
        : `No se pudo hacer el paso ${n}. ${mensaje}. Puedes seguir a mano: «Muéstrame» te señala dónde está cada cosa.`;
}

/**
 * @typedef {object} VistaDeLaGuia lo que la sesión le pide a la guía (guia.js)
 * @property {(texto: string, tipo?: 'info' | 'error') => void} decir su línea de estado (a la vista aunque esté plegada)
 * @property {(ocupada: boolean) => void} ocupar sus botones «Muéstrame» y «Hazlo…», ocupados; «Detener», a la vista
 * @property {(n: number | null) => void} enCurso el paso en que trabaja (null: ninguno)
 * @property {(n: number) => void} marcar el paso n, hecho
 * @property {(plegada: boolean) => void} plegar
 * @property {() => boolean} plegada
 * @property {(nodo: EventTarget | null) => boolean} contiene si algo es de la guía (un clic en ella no quita lo señalado)
 */

/**
 * @typedef {object} SesionDeLaGuia
 * @property {(n: number) => Promise<boolean>} mostrar «Muéstrame» del paso n (false: no lo ofrece, había otra cosa en marcha, se detuvo o falló)
 * @property {(n: number) => Promise<boolean>} hacer «Hazlo por mí» del paso n
 * @property {() => Promise<boolean>} hacerTodo «Hazlo todo por mí»
 * @property {() => void} detener
 * @property {() => boolean} ocupada si hay algo en marcha
 */

/**
 * La sesión de «Hazlo por mí» de la guía de un caso: una cosa a la vez.
 * @param {Ejemplo} e
 * @param {VistaDeLaGuia} vista
 * @param {{ archivo?: import('./conductor.js').ArchivoDelCaso }} [opciones] archivo: los del caso que se suben, por su ruta
 * @returns {SesionDeLaGuia}
 */
export function crearSesion(e, vista, { archivo } = {}) {
    /** @type {AbortController | null} */
    let enMarcha = null;
    /** El paso en que trabaja (para decir dónde se detuvo). */
    let paso = 0;
    /** La sección en que quedó lo último que hizo: si la persona se va de ella, lo siguiente no se hace (conductor.js). */
    let donde = '';

    /** Lo que va haciendo en el paso n, en la línea de estado. @param {number} n @param {string} [antes] */
    const contar = (n, antes = '') => (/** @type {string} */ texto) => {
        vista.decir(`Paso ${n} · ${antes}${antes ? minuscula(texto) : texto}`);
    };

    /**
     * Una cosa en marcha: la guía plegada y ocupada, Esc para detenerla, y al final cómo terminó.
     * @param {(senal: AbortSignal) => Promise<void>} trabajo
     * @param {{ mostrando: boolean }} como mostrando: al terminar bien, la guía vuelve como estaba
     */
    async function correr(trabajo, { mostrando }) {
        if (enMarcha) return false;
        const control = new AbortController();
        enMarcha = control;
        paso = 0;
        donde = '';
        const estabaPlegada = vista.plegada();
        /** @param {KeyboardEvent} ev */
        const alTeclear = ev => { if (ev.key === 'Escape') control.abort(); };
        document.addEventListener('keydown', alTeclear);
        quitarSenalado();
        vista.ocupar(true);
        vista.plegar(true);
        let bien = false;
        try {
            await trabajo(control.signal);
            bien = true;
        } catch (err) {
            if (!(err instanceof Detenido)) console.warn('[StatSim] «Hazlo por mí»:', err);
            vista.decir(finConProblema(paso, err, mostrando), err instanceof Detenido ? 'info' : 'error');
        } finally {
            document.removeEventListener('keydown', alTeclear);
            enMarcha = null;
            vista.enCurso(null);
            if (!bien || mostrando) vista.plegar(estabaPlegada);
            vista.ocupar(false);
        }
        return bien;
    }

    /** Empieza el paso n. @param {number} n */
    const empezar = n => { paso = n; vista.enCurso(n); };

    /**
     * Hace lo que «Hazlo por mí» hace del paso n (sus análisis) y lo marca. Devuelve los títulos de lo que hizo.
     * @param {number} n @param {AbortSignal} senal
     */
    async function hacerPaso(n, senal) {
        empezar(n);
        /** @type {string[]} */
        const hechas = [];
        for (const a of guionDe(e, n)) {
            if (!accionEjecutable(a)) continue;
            const plan = planDe(a);
            await ejecutarPlan(plan.ops, { senal, archivo, alAvanzar: contar(n), desde: donde });
            donde = seccionFinal(plan.ops) || donde;
            hechas.push(plan.titulo);
        }
        vista.marcar(n);
        return hechas;
    }

    /**
     * Las descargas que valen tras hacer unos pasos, señaladas una tras otra y dejadas señaladas. Señalarlas es un extra: si
     * no se puede (la persona se fue a otra pestaña), los pasos ya están hechos y se dice por qué no se señalaron.
     * @param {Array<{ n: number, ops: Op[] }>} vigentes
     * @param {AbortSignal} senal
     * @returns {Promise<{ senaladas: boolean, sinSenalar: string }>}
     */
    async function senalarLoTuyo(vigentes, senal) {
        if (!vigentes.length) return { senaladas: false, sinSenalar: '' };
        try {
            /** @type {Element[]} */
            const vistos = [];
            for (const { n, ops } of vigentes) vistos.push(...await mostrarPlan(ops, { senal, alAvanzar: contar(n, 'Esto es tuyo: '), desde: donde }));
            dejarSenalados(vistos, { ignorar: vista.contiene });
            return { senaladas: vistos.length > 0, sinSenalar: vistos.length ? '' : 'aún no están a la vista' };
        } catch (err) {
            if (err instanceof Detenido) throw err;
            console.warn('[StatSim] «Hazlo por mí», al señalar las descargas:', err);
            return { senaladas: false, sinSenalar: err instanceof Error ? err.message : String(err) };
        }
    }

    return {
        mostrar: async n => (seMuestra(e, n) ? correr(async senal => {
            empezar(n);
            const vistos = await mostrarPlan(guionDe(e, n).flatMap(a => planDe(a).ops), { senal, alAvanzar: contar(n) });
            vista.decir(finDeMostrar(e, n, vistos.length));
        }, { mostrando: true }) : false),
        hacer: async n => (seHace(e, n) ? correr(async senal => {
            const hechas = await hacerPaso(n, senal);
            const { senaladas, sinSenalar } = await senalarLoTuyo(descargasTras(e, [n]).vigentes, senal);
            vista.decir(finDelPaso(n, hechas, senaladas, sinSenalar));
        }, { mostrando: false }) : false),
        hacerTodo: async () => {
            const pasos = pasosQueSeHacen(e);
            if (!pasos.length) return false;
            return correr(async senal => {
                for (const n of pasos) await hacerPaso(n, senal);
                const { vigentes, perdidos } = descargasTras(e, pasos);
                const { senaladas, sinSenalar } = await senalarLoTuyo(vigentes, senal);
                vista.decir(finDeTodo(pasos, { vigentes: vigentes.map(v => v.n), perdidos, senaladas, sinSenalar }));
            }, { mostrando: false });
        },
        detener: () => { if (enMarcha) enMarcha.abort(); },
        ocupada: () => !!enMarcha,
    };
}
