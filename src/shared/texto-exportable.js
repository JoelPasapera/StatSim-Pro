// @ts-check
// shared/texto-exportable.js — (2027.01.04) el texto de una zona de resultados para un archivo de texto («Descargar
// resultados»), como se lee en la pantalla (innerText: cada bloque en su línea y las celdas de una fila separadas por
// tabuladores), pero sin lo que no es un resultado: los controles (botones, listas, casillas, sus etiquetas y las barras de
// progreso), los gráficos (sus ejes y marcas, en SVG o en un lienzo) y lo marcado con data-no-exportar (los paneles de
// opciones de un cálculo). En una celda, sus saltos (<br>) pasan a ser un espacio: cada fila de una tabla queda en su línea.
// Y un elemento de una lista lleva su marca («1.», «-»), que innerText no escribe. Se trabaja sobre una copia, puesta un
// momento junto al original (con sus mismos estilos) y fuera de la vista: el original no se toca (ni su foco, ni su
// desplazamiento).

/** Lo que no pasa al texto. */
export const NO_EXPORTAR = 'button, select, input, textarea, label, progress, svg, canvas, [data-no-exportar]';

/**
 * El texto de un elemento para exportarlo.
 * @param {HTMLElement} elem
 * @returns {string}
 */
export function textoParaExportar(elem) {
    const copia = /** @type {HTMLElement} */ (elem.cloneNode(true));
    copia.querySelectorAll(NO_EXPORTAR).forEach(n => n.remove());
    copia.querySelectorAll('td br, th br').forEach(br => br.replaceWith(document.createTextNode(' ')));
    copia.querySelectorAll('li').forEach(li => {
        const lista = li.parentElement;
        if (!lista) return;
        const ordenada = lista.tagName === 'OL';
        const inicio = ordenada ? Number(lista.getAttribute('start') || 1) : 1;
        const n = [...lista.children].filter(x => x.tagName === 'LI').indexOf(li);
        li.prepend(document.createTextNode(ordenada ? `${inicio + n}. ` : '- '));
    });
    const padre = elem.parentNode;
    if (!padre) return copia.textContent || '';
    // junto al original, para que le alcancen los mismos estilos (de ellos depende innerText), y fuera del flujo y de la
    // vista: el documento no cambia de alto mientras tanto
    copia.setAttribute('aria-hidden', 'true');
    copia.style.setProperty('position', 'absolute');
    copia.style.setProperty('left', '-100000px');
    copia.style.setProperty('top', '0');
    padre.insertBefore(copia, elem.nextSibling);
    try {
        return copia.innerText;
    } finally {
        copia.remove();
    }
}
