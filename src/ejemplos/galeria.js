// @ts-check
// ejemplos/galeria.js — (2027.01.02) la galería de la pestaña «Ejemplos»: una tarjeta por caso de ejemplos/indice.json, con
// su número y su diseño (y el dibujo del diseño: glifos.js), su título, lo que muestra, sus cifras clave y dos botones, «Ver
// el caso» y «Abrir en StatSim». Solo arma el HTML, con todo el texto escapado; los botones los atiende index.js por su
// data-accion-ejemplo. Sin DOM.

import { escaparHTML } from '../shared/html.js';
import { bytesDelCaso, numeroDe, tamanoDe } from './catalogo.js';
import { glifoDelDiseno } from './glifos.js';

/**
 * Las cifras clave de un caso, en una lista ('' si no tiene). Cada igualdad o desigualdad queda en un renglón («p < .001»,
 * «R² = .255»: espacios que no parten la línea alrededor del signo). También la usa la vista del caso.
 * @param {import('./catalogo.js').Ejemplo} e
 * @returns {string}
 */
export function listaDeDestacados(e) {
    if (!e.destacados.length) return '';
    const juntar = (/** @type {string} */ d) => escaparHTML(d).replace(/ (=|&lt;|&gt;|≤|≥|≈) /g, '\u00a0$1\u00a0');
    return `<ul class="ejemplo-destacados" aria-label="Cifras clave">${e.destacados.map(d => `<li>${juntar(d)}</li>`).join('')}</ul>`;
}

/**
 * La tarjeta de un caso. Los botones llevan el título como descripción: «Ver el caso», para un lector de pantalla, dice
 * de cuál.
 * @param {import('./catalogo.js').Ejemplo} e
 * @returns {string}
 */
function tarjeta(e) {
    const carpeta = escaparHTML(e.carpeta), titulo = `ejemploTitulo-${carpeta}`;
    return `<li class="ejemplo-tarjeta" data-carpeta="${carpeta}">
    <div class="ejemplo-tarjeta-cabeza">
        <p class="ejemplo-eyebrow">Caso ${numeroDe(e)} · ${escaparHTML(e.diseno)}</p>
        ${glifoDelDiseno(e.diseno)}
    </div>
    <h3 class="ejemplo-titulo" id="${titulo}">${escaparHTML(e.titulo)}</h3>
    <p class="ejemplo-resumen">${escaparHTML(e.resumen)}</p>
    ${listaDeDestacados(e)}
    <p class="ejemplo-meta">${e.archivos.length} archivos · ${tamanoDe(bytesDelCaso(e))}</p>
    <div class="ejemplo-acciones">
        <button type="button" class="btn btn-primary" data-accion-ejemplo="ver" data-carpeta="${carpeta}" aria-describedby="${titulo}">Ver el caso</button>
        <button type="button" class="btn btn-outline" data-accion-ejemplo="abrir" data-carpeta="${carpeta}" aria-describedby="${titulo}">Abrir en StatSim</button>
    </div>
</li>`;
}

/**
 * La galería: las tarjetas de los casos, en el orden del catálogo.
 * @param {import('./catalogo.js').Catalogo} catalogo
 * @returns {string}
 */
export function htmlDeLaGaleria(catalogo) {
    if (!catalogo.casos.length) return '<p class="ejemplos-vacio">La carpeta de los ejemplos de este sitio no trae ningún caso.</p>';
    return `<ul class="ejemplos-galeria" aria-label="Casos resueltos">${catalogo.casos.map(tarjeta).join('')}</ul>`;
}
