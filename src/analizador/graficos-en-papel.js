// @ts-check
// analizador/graficos-en-papel.js — (2027.01.10, revisión) Los gráficos en papel blanco: sus colores claros, pensados para el
// fondo oscuro de la página, en tinta. Los textos con un relleno claro, escrito en ellos o heredado del lienzo (graficas.js lo
// pone claro en su raíz: el título, los ejes y las leyendas), y las líneas claras de referencia. Para las figuras del Word
// (exportador-word.js), que se dibujan sobre blanco; al imprimir lo hace impresion.css, con estos mismos colores. Hasta la
// 2027.01.09, en el Word y en el papel esos textos salían casi blancos. (2027.01.11, revisión) Y los recuadros oscuros (las
// anotaciones de la dispersión, las leyendas: clase «recuadro»), blancos con un borde gris: en la 2027.01.10 su texto quedaba
// en tinta sobre la caja oscura, ilegible. La cruz que sigue al ratón, que es de la pantalla, no va. (2027.01.12, revisión) Y los
// colores claros de las series (las curvas del gráfico de las distribuciones), más oscuros. Sin dependencias.

/** Los rellenos claros de los textos (y del lienzo, que los textos sin el suyo heredan). */
export const RELLENOS_CLAROS = Object.freeze(['#e2e8f0', '#cbd5e1', '#94a3b8']);
/** La tinta de esos textos en papel (la de impresion.css). */
export const TINTA = '#2a2f38';
/** El trazo claro de las líneas de referencia, y el suyo en papel (gris medio: se ven sin competir con los datos). */
export const TRAZO_CLARO = '#e2e8f0';
export const TRAZO_EN_PAPEL = '#9aa1ac';
/** El fondo de los recuadros en papel (el de impresion.css). */
export const PAPEL = '#ffffff';
/** (2027.01.11) El ancho de las figuras del capítulo de Word (su alto, el de la proporción de cada una). */
export const ANCHO_FIGURA = 520;
/**
 * (2027.01.12, revisión) Los colores de las series, claros para el fondo oscuro de la página (graficas.js los toma de aquí: las
 * curvas, sus áreas y su leyenda en el gráfico de las distribuciones), y el suyo en papel, más oscuro (de 4,9:1 a 7:1 con el
 * blanco). Hasta la 2027.01.11, en el papel, el ámbar quedaba a 1,7:1 del blanco, el verde a 1,9:1 y el azul a 2,6:1.
 */
export const SERIES_EN_PAPEL = Object.freeze({
    '#60a5fa': '#1d4ed8', '#f87171': '#b91c1c', '#34d399': '#047857', '#fbbf24': '#a16207',
    '#c084fc': '#7e22ce', '#22d3ee': '#0e7490', '#fb923c': '#c2410c', '#a3e635': '#4d7c0f',
});
/**
 * (2027.01.17) La paleta categórica de los gráficos nuevos (el de perfil de las medidas repetidas y los que vengan): ocho tonos
 * en un orden fijo, cada uno con su paso para el fondo oscuro de la página y el suyo para el papel. Validados como conjunto con
 * las seis comprobaciones de la guía de visualización (validate_palette.js): luminosidad OKLCH en la banda de cada modo,
 * croma ≥ 0,1, separación con daltonismo ≥ 8 ΔE entre vecinos (y los tres primeros, entre todos los pares) y ≥ 15 sin él,
 * contra la superficie de las tarjetas (#131c2e) y contra el blanco. En papel, tres de ellos quedan por debajo de 3:1 del
 * blanco: por eso estos gráficos llevan además etiquetas directas, marcadores de formas distintas y una tabla.
 */
export const CATEGORICA = Object.freeze([
    Object.freeze({ pantalla: '#3987e5', papel: '#2a78d6' }), Object.freeze({ pantalla: '#d95926', papel: '#eb6834' }),
    Object.freeze({ pantalla: '#199e70', papel: '#1baf7a' }), Object.freeze({ pantalla: '#c98500', papel: '#eda100' }),
    Object.freeze({ pantalla: '#d55181', papel: '#e87ba4' }), Object.freeze({ pantalla: '#008300', papel: '#008300' }),
    Object.freeze({ pantalla: '#9085e9', papel: '#6250d6' }), Object.freeze({ pantalla: '#e66767', papel: '#e34948' })
]);
/** De cada tono de la pantalla, el suyo en papel. */
const CATEGORICA_EN_PAPEL = Object.freeze(Object.fromEntries(CATEGORICA.map(c => [c.pantalla, c.papel])));

/** El color en papel de una serie, o null si no es una de ellas. @param {string | null} c @returns {string | null} */
const serieEnPapel = c => { const k = (c || '').trim().toLowerCase(); return /** @type {Record<string, string>} */ (SERIES_EN_PAPEL)[k] || /** @type {Record<string, string>} */ (CATEGORICA_EN_PAPEL)[k] || null; };

/** ¿Lleva un elemento uno de esos rellenos claros, escrito en él? @param {Element} el */
const conRellenoClaro = el => RELLENOS_CLAROS.includes((el.getAttribute('fill') || '').trim().toLowerCase());

/**
 * Una copia del gráfico para el papel: su raíz y sus textos con un relleno claro, en tinta; sus trazos claros, en gris; sus
 * recuadros, blancos con el borde gris; las series claras, más oscuras; y sin la cruz que sigue al ratón. Los demás colores
 * (las series oscuras, los blancos sobre las celdas de color) no cambian, ni el original.
 * @param {SVGSVGElement} svg
 * @returns {SVGSVGElement}
 */
export function graficoEnPapel(svg) {
    const copia = /** @type {SVGSVGElement} */ (svg.cloneNode(true));
    copia.querySelectorAll('.crosshair-capa').forEach(c => c.remove());
    if (conRellenoClaro(copia)) copia.setAttribute('fill', TINTA);
    copia.querySelectorAll('text, tspan').forEach(t => { if (conRellenoClaro(t)) t.setAttribute('fill', TINTA); });
    copia.querySelectorAll('[stroke]').forEach(el => { if ((el.getAttribute('stroke') || '').trim().toLowerCase() === TRAZO_CLARO) el.setAttribute('stroke', TRAZO_EN_PAPEL); });
    for (const a of ['stroke', 'fill']) copia.querySelectorAll(`[${a}]`).forEach(el => { const c = serieEnPapel(el.getAttribute(a)); if (c) el.setAttribute(a, c); });
    copia.querySelectorAll('.recuadro').forEach(r => {
        r.setAttribute('fill', PAPEL);
        r.setAttribute('stroke', TRAZO_EN_PAPEL);
        r.removeAttribute('fill-opacity');
        r.removeAttribute('opacity');
    });
    return copia;
}
