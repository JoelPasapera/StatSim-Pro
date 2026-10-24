// @ts-check
// ejemplos/guia.js — (2027.01.02) la guía de un caso abierto con «Abrir en StatSim»: un panel fijo en una esquina, a la vista
// en cualquier sección, con los pasos que se dieron en el Analizador (los de su README) para marcarlos según se hacen. Los
// que ya trajo el proyecto (los datos y la configuración de la investigación) salen marcados; los que hay que repetir (los
// análisis no se guardan en el proyecto), resaltados; los de después (las descargas, guardar el proyecto), como opcionales.
// Se pliega a su cabecera (en un teléfono empieza plegada: desplegada taparía media pantalla) y se cierra; no se imprime.
// Lo marcado vive lo que dure la página: no se guarda. Si después se abre otro proyecto, se cierra sola (ya no es lo que hay
// en la página); «Abrir en StatSim» la pone después de abrir el suyo.
// (2027.01.03) Con el guion de cada paso (los ejemplos lo traen en su índice), cada uno con «Muéstrame» (señala en la página
// sus controles, uno tras otro) y, los que hay que repetir, con «Hazlo por mí» (los usa a la vista, con pausas); y «Hazlo todo
// por mí». Lo hace hazlo/sesion.js; aquí, sus botones, su línea de estado (a la vista aunque la guía esté plegada) con
// «Detener», y lo que la sesión le pide a la guía (vistaDeLaGuia). Cerrar la guía lo detiene.
// htmlDeLaGuia y estadoDelPaso no tocan el DOM; mostrarGuia y cerrarGuia, sí.

import { escaparHTML } from '../shared/html.js';
import { bus, EVENTOS } from '../shared/eventos.js';
import { markdownAHtml } from './markdown.js';
import { estadoDelPaso, numeroDe, pasosEnPalabras } from './catalogo.js';
import { conGuiones, crearSesion, listaDePasos, pasosQueSeHacen, seHace, seMuestra } from './hazlo/sesion.js';
import { quitarSenalado } from './hazlo/resaltado.js';

/** El id del panel (hay uno a la vez). */
export const ID_GUIA = 'guiaEjemplo';
/** Las pantallas en que la guía empieza plegada (las de ejemplos.css, donde ocupa todo el ancho). */
const PANTALLA_ESTRECHA = '(max-width: 640px)';

// (2027.01.03) en catalogo.js: también lo usa «Hazlo por mí»
export { estadoDelPaso };

/** La etiqueta de cada estado, junto al número del paso. @type {Record<import('./catalogo.js').EstadoDelPaso, string>} */
const MARCAS = { hecho: 'Lo trajo el proyecto', repetir: 'Repítelo', opcional: 'Opcional' };

/** Con mayúscula inicial. @param {string} t */
const capital = t => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * Qué está hecho y qué falta, en dos o tres frases (las mismas cuentas que el README: pasosEnPalabras).
 * @param {import('./catalogo.js').Ejemplo} e
 * @returns {string}
 */
export function notaDeLaGuia(e) {
    const r = e.repetir, total = e.pasos.length;
    const hechos = r.desde === 1 ? ''
        : r.desde === 2 ? 'El paso 1 ya está hecho: lo trajo el proyecto. '
        : `${capital(pasosEnPalabras({ desde: 1, hasta: r.desde - 1 }))} ya están hechos: los trajo el proyecto. `;
    const repetir = `Los análisis no se guardan en el proyecto: repite ${pasosEnPalabras(r)} en el Analizador${r.nota ? ` (${r.nota})` : ''}.`;
    const opcionales = r.hasta >= total ? ''
        : r.hasta + 1 === total ? ` El paso ${total} es opcional.`
        : ` ${capital(pasosEnPalabras({ desde: r.hasta + 1, hasta: total }))} son opcionales.`;
    return hechos + repetir + opcionales;
}

/**
 * (2027.01.03) Los botones de un paso: «Muéstrame», si tiene guion, y «Hazlo por mí», si hay que repetirlo y hace algo (no
 * solo descargas). Vacío sin guion. Fuera del texto del paso (que describe a su casilla: no se lee con los botones).
 * @param {import('./catalogo.js').Ejemplo} e
 * @param {number} n
 */
function botonesDelPaso(e, n) {
    const botones = (seMuestra(e, n) ? `<button type="button" class="btn btn-outline guia-boton" data-accion-guia="mostrar" data-paso="${n}" aria-label="Muéstrame el paso ${n}">Muéstrame</button>` : '')
        + (seHace(e, n) ? `<button type="button" class="btn btn-primary guia-boton" data-accion-guia="hacer" data-paso="${n}" aria-label="Hazlo por mí: el paso ${n}">Hazlo por mí</button>` : '');
    return botones ? `\n    <div class="guia-paso-acciones">${botones}</div>` : '';
}

/**
 * (2027.01.03) Para qué sirven «Muéstrame» y «Hazlo por mí», y «Hazlo todo por mí» con los pasos que hace. Vacío sin guion.
 * @param {import('./catalogo.js').Ejemplo} e
 */
function bloqueHazlo(e) {
    if (!conGuiones(e)) return '';
    const pasos = pasosQueSeHacen(e);
    const alcance = capital(listaDePasos(pasos)) + (pasos.length > 1 ? ', uno tras otro.' : '.');
    return `
    <div class="orden-guia guia-hazlo-ayuda" role="note" aria-label="Qué hacen «Muéstrame» y «Hazlo por mí»">
        <span class="orden-guia-titulo">Para qué sirve:</span>
        <span class="orden-nota">«Muéstrame» te señala en la página, uno por uno, los controles de un paso y lo que lleva cada uno. «Hazlo por mí» los rellena y los pulsa a la vista, con pausas, como se hizo en el caso; puedes detenerlo cuando quieras (también con Esc). Las descargas y «Guardar proyecto» son tuyos: solo se señalan.</span>
    </div>${pasos.length ? `
    <p class="guia-hazlo-todo"><button type="button" class="btn btn-primary" data-accion-guia="hacerTodo">Hazlo todo por mí</button> <span class="guia-hazlo-alcance">${escaparHTML(alcance)}</span></p>` : ''}`;
}

/**
 * El panel de la guía de un caso, en HTML (sin el <aside>, que pone mostrarGuia).
 * @param {import('./catalogo.js').Ejemplo} e
 * @returns {string}
 */
export function htmlDeLaGuia(e) {
    const pasos = e.pasos.map((p, i) => {
        const n = i + 1, estado = estadoDelPaso(n, e.repetir);
        return `<li class="guia-paso guia-paso-${estado}">
    <input type="checkbox" id="guiaPaso${n}" class="guia-casilla" aria-label="Paso ${n} hecho" aria-describedby="guiaPaso${n}Texto"${estado === 'hecho' ? ' checked' : ''}>
    <div class="guia-paso-texto" id="guiaPaso${n}Texto">
        <p class="guia-paso-cabeza"><span class="guia-paso-numero">Paso ${n}</span> <span class="guia-marca guia-marca-${estado}">${MARCAS[estado]}</span></p>
        ${markdownAHtml(p)}
    </div>${botonesDelPaso(e, n)}
</li>`;
    }).join('');
    // (2027.01.03) lo que va haciendo «Hazlo por mí», fuera del cuerpo: se ve aunque la guía esté plegada
    const conduccion = conGuiones(e) ? `
<div class="guia-conduccion">
    <p class="guia-estado" id="guiaEjemploEstado" role="status" aria-live="polite"></p>
    <button type="button" class="btn btn-outline guia-detener" data-accion-guia="detener" hidden>Detener</button>
</div>` : '';
    return `<div class="guia-cabecera">
    <div class="guia-cabecera-texto">
        <p class="guia-eyebrow">Guía del caso ${numeroDe(e)} · <span class="guia-progreso">0 de ${e.pasos.length}</span></p>
        <h2 class="guia-titulo" id="guiaEjemploTitulo" tabindex="-1">${escaparHTML(e.titulo)}</h2>
    </div>
    <div class="guia-botones">
        <button type="button" class="btn-icon guia-plegar" data-accion-guia="plegar" aria-expanded="true" aria-controls="guiaEjemploCuerpo" aria-label="Plegar la guía" title="Plegar la guía">▾</button>
        <button type="button" class="btn-icon" data-accion-guia="cerrar" aria-label="Cerrar la guía" title="Cerrar la guía">✕</button>
    </div>
</div>
<div class="guia-barra" aria-hidden="true"><span class="guia-barra-relleno"></span></div>${conduccion}
<div class="guia-cuerpo" id="guiaEjemploCuerpo">
    <p class="guia-nota">${escaparHTML(notaDeLaGuia(e))}</p>${bloqueHazlo(e)}
    <ol class="guia-pasos">${pasos}</ol>
    <div class="guia-pie">
        <button type="button" class="btn btn-outline" data-accion-guia="caso">Ver el caso</button>
    </div>
</div>`;
}

/** El panel, si está. */
const panel = () => document.getElementById(ID_GUIA);
/** (2027.01.03) La sesión de «Hazlo por mí» de la guía que está a la vista. @type {import('./hazlo/sesion.js').SesionDeLaGuia | null} */
let sesion = null;
/** (2027.01.03) Lo que mide el alto de la guía mientras está abierta (los avisos salen encima: ejemplos.css). @type {ResizeObserver | null} */
let medidor = null;

/** El alto de la guía, en --alto-guia: los avisos (toast) salen encima de ella, sin taparla. @param {HTMLElement | null} aside */
function medirGuia(aside) {
    const raiz = document.documentElement;
    if (!raiz || !raiz.style) return;
    if (aside) raiz.style.setProperty('--alto-guia', `${Math.ceil(aside.getBoundingClientRect().height)}px`);
    else raiz.style.removeProperty('--alto-guia');
}

/** Cuenta los pasos marcados y lo pinta (el texto y la barra). @param {HTMLElement} aside */
function actualizarProgreso(aside) {
    const casillas = /** @type {HTMLInputElement[]} */ ([...aside.querySelectorAll('.guia-casilla')]);
    const hechos = casillas.filter(c => c.checked).length;
    const texto = aside.querySelector('.guia-progreso');
    if (texto) texto.textContent = `${hechos} de ${casillas.length}`;
    const relleno = /** @type {HTMLElement | null} */ (aside.querySelector('.guia-barra-relleno'));
    if (relleno) relleno.style.width = `${casillas.length ? Math.round((100 * hechos) / casillas.length) : 0}%`;
    casillas.forEach(c => { const li = c.closest('.guia-paso'); if (li) li.classList.toggle('marcado', c.checked); });
}

/** Pliega o despliega el panel a su cabecera. @param {HTMLElement} aside @param {boolean} plegar */
function plegarGuia(aside, plegar) {
    aside.classList.toggle('plegada', plegar);
    const cuerpo = /** @type {HTMLElement | null} */ (aside.querySelector('.guia-cuerpo'));
    if (cuerpo) cuerpo.hidden = plegar;
    const boton = aside.querySelector('[data-accion-guia="plegar"]');
    if (boton) {
        boton.setAttribute('aria-expanded', plegar ? 'false' : 'true');
        boton.setAttribute('aria-label', plegar ? 'Desplegar la guía' : 'Plegar la guía');
        boton.setAttribute('title', plegar ? 'Desplegar la guía' : 'Plegar la guía');
        boton.textContent = plegar ? '▴' : '▾';
    }
}

/**
 * Cierra la guía (si está abierta). Si el foco estaba en ella (su botón «✕»), pasa al título de la sección que se ve: al
 * quitarla, volvería al principio de la página. (2027.01.03) Detiene «Hazlo por mí» y quita lo que había señalado.
 */
export function cerrarGuia() {
    if (sesion) sesion.detener();
    sesion = null;
    if (medidor) medidor.disconnect();
    medidor = null;
    medirGuia(null);
    quitarSenalado();
    const aside = panel();
    if (!aside) return;
    const conFoco = aside.contains(document.activeElement);
    aside.remove();
    const titulo = /** @type {HTMLElement | null} */ (document.querySelector('.section.active h2'));
    if (conFoco && titulo) {
        if (!titulo.hasAttribute('tabindex')) titulo.setAttribute('tabindex', '-1');
        titulo.focus({ preventScroll: true });
    }
}

// otro proyecto abierto: la guía de este ejemplo ya no describe lo que hay en la página
bus.on(EVENTOS.PROYECTO_ABIERTO, () => { cerrarGuia(); });

/**
 * (2027.01.03) Lo que la sesión de «Hazlo por mí» le pide a la guía: su línea de estado, sus botones ocupados (y «Detener» a
 * la vista, con el foco si lo tenía la guía: el botón pulsado queda dentro de la guía plegada), el paso en curso, marcar uno
 * y plegarla. Al terminar, el foco vuelve al botón que la puso en marcha (si se ve) o al de desplegar la guía.
 * @param {HTMLElement} aside
 * @param {() => HTMLElement | null} origen el botón que la puso en marcha
 * @returns {import('./hazlo/sesion.js').VistaDeLaGuia}
 */
function vistaDeLaGuia(aside, origen) {
    const estado = /** @type {HTMLElement} */ (aside.querySelector('.guia-estado'));
    const detener = /** @type {HTMLElement} */ (aside.querySelector('[data-accion-guia="detener"]'));
    return {
        decir(texto, tipo = 'info') {
            estado.setAttribute('aria-live', tipo === 'error' ? 'assertive' : 'polite');
            estado.classList.toggle('guia-estado-error', tipo === 'error');
            estado.textContent = texto;
        },
        ocupar(ocupada) {
            const conFoco = aside.contains(document.activeElement);
            aside.querySelectorAll('[data-accion-guia="mostrar"], [data-accion-guia="hacer"], [data-accion-guia="hacerTodo"]').forEach(b => {
                if (ocupada) b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled');
            });
            aside.classList.toggle('conduciendo', ocupada);
            detener.hidden = !ocupada;
            if (!conFoco) return;
            const boton = origen();
            const destino = ocupada ? detener : boton && !aside.classList.contains('plegada') ? boton : /** @type {HTMLElement | null} */ (aside.querySelector('[data-accion-guia="plegar"]'));
            if (destino) destino.focus({ preventScroll: true });
        },
        enCurso(n) {
            aside.querySelectorAll('.guia-paso').forEach((li, i) => li.classList.toggle('en-curso', i + 1 === n));
        },
        marcar(n) {
            const casilla = /** @type {HTMLInputElement | null} */ (aside.querySelector(`#guiaPaso${n}`));
            if (!casilla) return;
            casilla.checked = true;
            actualizarProgreso(aside);
        },
        plegar(plegada) { plegarGuia(aside, plegada); },
        plegada: () => aside.classList.contains('plegada'),
        contiene: nodo => !!nodo && nodo instanceof Node && aside.contains(nodo),
    };
}

/**
 * Muestra la guía de un caso (la de otro caso, si había una, se reemplaza) y lleva el foco a su título.
 * @param {import('./catalogo.js').Ejemplo} e
 * @param {{ alVerCaso: (carpeta: string) => void, archivo?: import('./hazlo/conductor.js').ArchivoDelCaso }} opciones
 *   «Ver el caso»: volver a la vista del caso; archivo (2027.01.03): los del caso que sube «Hazlo por mí», por su ruta
 * @returns {HTMLElement}
 */
export function mostrarGuia(e, { alVerCaso, archivo }) {
    cerrarGuia();
    const aside = /** @type {HTMLElement} */ (document.createElement('aside'));
    aside.id = ID_GUIA;
    aside.className = 'guia-ejemplo solo-pantalla';
    aside.setAttribute('aria-labelledby', 'guiaEjemploTitulo');
    aside.dataset.carpeta = e.carpeta;
    aside.innerHTML = htmlDeLaGuia(e);
    aside.addEventListener('change', ev => {
        if (ev.target && /** @type {HTMLElement} */ (ev.target).classList.contains('guia-casilla')) actualizarProgreso(aside);
    });
    /** El botón que puso en marcha «Muéstrame» o «Hazlo…» (el foco vuelve a él). @type {HTMLElement | null} */
    let origen = null;
    const suSesion = conGuiones(e) ? crearSesion(e, vistaDeLaGuia(aside, () => origen), { archivo }) : null;
    sesion = suSesion;
    aside.addEventListener('click', ev => {
        const boton = /** @type {HTMLElement | null} */ (ev.target && /** @type {HTMLElement} */ (ev.target).closest ? /** @type {HTMLElement} */ (ev.target).closest('[data-accion-guia]') : null);
        if (!boton) return;
        const accion = boton.getAttribute('data-accion-guia');
        if (accion === 'cerrar') cerrarGuia();
        else if (accion === 'plegar') plegarGuia(aside, !aside.classList.contains('plegada'));
        else if (accion === 'caso') alVerCaso(e.carpeta);
        else if (!suSesion) return;
        else if (accion === 'detener') suSesion.detener();
        else if (boton.getAttribute('aria-disabled') === 'true' || suSesion.ocupada()) return;
        else {
            origen = boton;
            const n = Number(boton.getAttribute('data-paso'));
            if (accion === 'mostrar') suSesion.mostrar(n);
            else if (accion === 'hacer') suSesion.hacer(n);
            else if (accion === 'hacerTodo') suSesion.hacerTodo();
        }
    });
    document.body.appendChild(aside);
    medirGuia(aside);
    if (typeof ResizeObserver === 'function') { medidor = new ResizeObserver(() => medirGuia(aside)); medidor.observe(aside); }
    actualizarProgreso(aside);
    if (typeof window.matchMedia === 'function' && window.matchMedia(PANTALLA_ESTRECHA).matches) plegarGuia(aside, true);
    const titulo = /** @type {HTMLElement | null} */ (aside.querySelector('.guia-titulo'));
    if (titulo && typeof titulo.focus === 'function') titulo.focus({ preventScroll: true });
    return aside;
}
