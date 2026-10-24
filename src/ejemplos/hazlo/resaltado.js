// @ts-check
// ejemplos/hazlo/resaltado.js — (2027.01.03) señalar controles de la página para «Muéstrame» y «Hazlo por mí»: llevar uno a
// la vista (al centro de la pantalla; sin animación si se pidió menos movimiento) y rodearlo con el resaltado de la guía
// (.guia-resaltado, el que se está usando, o .guia-senalado, lo que queda para la persona —sus descargas— hasta que pulse en
// cualquier parte de la página, salvo en la guía: ejemplos.css). De una casilla o una opción se resalta su etiqueta: la
// casilla sola apenas se ve. Y si un control está a la vista, como lo entiende Playwright (que hizo los ejemplos con estos
// mismos planes).

/** El control que se está usando o señalando. */
export const CLASE_RESALTADO = 'guia-resaltado';
/** Lo que queda señalado para la persona (sus descargas). */
export const CLASE_SENALADO = 'guia-senalado';

/** ¿Pidió la persona menos movimiento? */
const menosMovimiento = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * ¿Está a la vista? En un navegador, con caja (ni él ni lo que lo contiene con display: none, ni en una sección que no se
 * ve) y sin visibility: hidden. Sin maquetación (las pruebas sin navegador), que ni él ni lo que lo contiene esté oculto.
 * @param {Element} el
 */
export function aLaVista(el) {
    if (!document.contains(el)) return false;
    if (typeof el.getClientRects === 'function') {
        if (el.getClientRects().length === 0) return false;
        const estilo = typeof window.getComputedStyle === 'function' ? window.getComputedStyle(el) : null;
        return !estilo || estilo.visibility !== 'hidden';
    }
    for (let n = /** @type {HTMLElement | null} */ (el); n; n = n.parentElement) {
        if (n.hidden || (n.style && n.style.display === 'none')) return false;
    }
    return true;
}

/**
 * Lo que se resalta de un control: la etiqueta de una casilla o de una opción (la que la contiene o la de su for); el propio
 * control, si no.
 * @param {Element} el
 * @returns {Element}
 */
export function objetivoVisual(el) {
    const tipo = (el.getAttribute('type') || '').toLowerCase();
    if (el.tagName === 'INPUT' && (tipo === 'checkbox' || tipo === 'radio')) {
        const etiqueta = el.closest('label') || (el.id ? [...document.querySelectorAll('label')].find(l => l.getAttribute('for') === el.id) : null);
        if (etiqueta) return etiqueta;
    }
    return el;
}

/** Quita el resaltado del control que se estaba usando. */
export function quitarResaltado() {
    document.querySelectorAll('.' + CLASE_RESALTADO).forEach(x => x.classList.remove(CLASE_RESALTADO));
}

/**
 * Señala un control: quita el resaltado del anterior, lo lleva a la vista y lo resalta.
 * @param {Element} el
 * @returns {Element} lo resaltado (su etiqueta, si es una casilla)
 */
export function resaltar(el) {
    quitarResaltado();
    const objetivo = objetivoVisual(el);
    objetivo.classList.add(CLASE_RESALTADO);
    if (typeof objetivo.scrollIntoView === 'function') objetivo.scrollIntoView({ block: 'center', inline: 'nearest', behavior: menosMovimiento() ? 'auto' : 'smooth' });
    return objetivo;
}

/** El oyente que quita lo señalado al primer clic (uno a la vez). @type {((ev: Event) => void) | null} */
let alPrimerClic = null;

/** Quita lo que había quedado señalado para la persona. */
export function quitarSenalado() {
    document.querySelectorAll('.' + CLASE_SENALADO).forEach(x => x.classList.remove(CLASE_SENALADO));
    if (alPrimerClic) document.removeEventListener('click', alPrimerClic, true);
    alPrimerClic = null;
}

/**
 * Deja señalados unos controles (los de la persona: sus descargas) hasta que pulse en cualquier parte (salvo en lo que diga
 * `ignorar`: la guía, cuyo «▴» invita a pulsarlo) o se señalen otros.
 * @param {Element[]} controles
 * @param {{ ignorar?: (destino: EventTarget | null) => boolean }} [opciones]
 */
export function dejarSenalados(controles, { ignorar } = {}) {
    quitarSenalado();
    if (!controles.length) return;
    controles.forEach(el => objetivoVisual(el).classList.add(CLASE_SENALADO));
    alPrimerClic = ev => { if (!(ignorar && ignorar(ev.target))) quitarSenalado(); };
    document.addEventListener('click', alPrimerClic, true);
}
