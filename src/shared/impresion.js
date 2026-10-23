// @ts-check
// shared/impresion.js — imprimir una sección o guardarla en PDF (2027.01.01). El navegador imprime con los estilos de
// impresión (assets/css/componentes/impresion.css: papel blanco, sin la cáscara y, en cada sección, solo sus resultados);
// este módulo pone, mientras se imprime, un encabezado que dice qué es, de qué datos y cuándo —cada sección inscribe el
// suyo—, y abre el diálogo de impresión desde los botones «Imprimir o guardar en PDF». Vale también para Ctrl+P: el
// encabezado llega con el aviso beforeprint del navegador y se va con afterprint. Lo plegado (los <details>: la
// interpretación de cada objetivo, las referencias de una tarjeta) se abre para imprimir y se vuelve a plegar al terminar:
// si no, salía su título sin nada debajo. Sin dependencias.

/**
 * @typedef {{ titulo: string, lineas: string[] }} EncabezadoImpresion
 *   titulo: qué se imprime («Resultados del Analizador»); lineas: de qué datos, con qué versión y cuándo (las vacías no salen)
 */

/** @type {Map<string, () => (EncabezadoImpresion | null)>} */
const encabezados = new Map();

/**
 * Inscribe el encabezado que lleva una sección al imprimirse.
 * @param {string} seccion el id de la sección («analizador», «simulador»…)
 * @param {() => (EncabezadoImpresion | null)} crear lo que dirá el encabezado, o null para no poner ninguno
 */
export function registrarEncabezadoImpresion(seccion, crear) {
    encabezados.set(seccion, crear);
}

/**
 * Una fecha como se escribe en un informe («21 de octubre de 2026»).
 * @param {Date} [fecha]
 * @returns {string}
 */
export function fechaDeImpresion(fecha = new Date()) {
    return fecha.toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Quita los encabezados puestos para imprimir. */
function quitarEncabezados() {
    document.querySelectorAll('.encabezado-impresion').forEach(e => e.remove());
}

/** Los <details> que estaban plegados y se abrieron para imprimir. @type {HTMLDetailsElement[]} */
let abiertosParaImprimir = [];

/** Abre lo plegado de una sección, para que se imprima. @param {Element} seccion */
function abrirPlegados(seccion) {
    volverAPlegar();
    abiertosParaImprimir = /** @type {HTMLDetailsElement[]} */ ([...seccion.querySelectorAll('details:not([open])')]);
    abiertosParaImprimir.forEach(d => { d.open = true; });
}

/** Vuelve a plegar lo que se abrió para imprimir. */
function volverAPlegar() {
    abiertosParaImprimir.forEach(d => { d.open = false; });
    abiertosParaImprimir = [];
}

/**
 * Pone el encabezado de una sección, si lo tiene, al principio de su contenido (como texto: nada se interpreta).
 * @param {Element} seccion
 */
function ponerEncabezado(seccion) {
    quitarEncabezados();
    const crear = encabezados.get(seccion.id);
    /** @type {EncabezadoImpresion | null} */
    let datos = null;
    try { datos = crear ? crear() : null; } catch (e) { console.error('[StatSim] encabezado de impresión:', e); }
    if (!datos) return;
    const cabecera = document.createElement('header');
    cabecera.className = 'encabezado-impresion';
    const titulo = document.createElement('h1');
    titulo.textContent = datos.titulo;
    cabecera.appendChild(titulo);
    for (const linea of datos.lineas) {
        if (!linea) continue;
        const p = document.createElement('p');
        p.textContent = linea;
        cabecera.appendChild(p);
    }
    const contenido = seccion.querySelector(':scope > .container') || seccion;
    contenido.insertBefore(cabecera, contenido.firstChild);
}

/** Abre el diálogo de impresión del navegador (desde él se elige la impresora o «Guardar como PDF»). */
export function imprimir() {
    window.print();
}

/** Lo que se hace antes de imprimir la sección a la vista: abrir lo plegado y poner su encabezado. */
function prepararImpresion() {
    const seccion = document.querySelector('main .section.active');
    if (!seccion) return;
    abrirPlegados(seccion);
    ponerEncabezado(seccion);
}

/** Lo que se deshace al terminar de imprimir: el encabezado y lo que se abrió. */
function terminarImpresion() {
    quitarEncabezados();
    volverAPlegar();
}

/** Pone y quita el encabezado al imprimir, también con Ctrl+P (main.js lo monta una vez). */
export function montarImpresion() {
    window.addEventListener('beforeprint', prepararImpresion);
    window.addEventListener('afterprint', terminarImpresion);
}
