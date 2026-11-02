// @ts-check
// analizador/informe/sintaxis-copiar.js — (2027.01.19) los botones «Copiar» de la sintaxis equivalente en R y SPSS
// (informe/sintaxis.js): un solo oyente para todas las tarjetas, que copia al portapapeles el código que sigue al botón y lo
// avisa; sin portapapeles (una página sin HTTPS, un navegador que no lo deja), selecciona el código para copiarlo a mano.
import { mostrarToast } from '../../shared/toast.js';

let activo = false;

/**
 * El código de un botón: el bloque que sigue a su párrafo.
 * @param {Element} boton
 * @returns {HTMLElement | null}
 */
export function codigoDe(boton) {
    const parrafo = boton.closest('p'), siguiente = parrafo ? parrafo.nextElementSibling : null;
    return siguiente && siguiente.classList.contains('sintaxis-codigo') ? /** @type {HTMLElement} */ (siguiente) : null;
}

/** Selecciona el texto de un bloque (para copiarlo a mano). @param {HTMLElement} bloque */
function seleccionar(bloque) {
    try {
        const sel = window.getSelection(), rango = document.createRange();
        rango.selectNodeContents(bloque);
        if (sel) { sel.removeAllRanges(); sel.addRange(rango); }
    } catch (_) { /* sin selección: queda a la vista */ }
}

/** Activa (una vez) el oyente de los botones de copiar. */
export function activarCopiaSintaxis() {
    if (activo || typeof document === 'undefined') return;
    activo = true;
    document.addEventListener('click', e => {
        const objetivo = /** @type {Element | null} */ (e.target);
        const boton = objetivo && typeof objetivo.closest === 'function' ? objetivo.closest('.sintaxis-copiar') : null;
        if (!boton) return;
        const bloque = codigoDe(boton);
        if (!bloque) return;
        const lenguaje = boton.getAttribute('data-lenguaje') || '';
        const texto = bloque.textContent || '';
        const aMano = () => { seleccionar(bloque); mostrarToast(`No se pudo copiar solo: la sintaxis de ${lenguaje} quedó seleccionada para copiarla (Ctrl + C).`, 'warning', 6000); };
        if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(texto).then(() => mostrarToast(`Sintaxis de ${lenguaje} copiada.`, 'success', 3000), aMano);
        } else aMano();
    });
}
