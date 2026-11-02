// @ts-check
// analizador/informe/word-apa.js — (2027.01.17) las piezas del informe en Word (APA 7) de una tarjeta del Analizador: el
// título, los párrafos, las tablas («Tabla N» en negrita, el título en cursiva, solo filetes horizontales y la nota), las
// figuras, las referencias con sangría francesa, el documento y su descarga (.docx con html-docx; .doc si no carga). Con el
// mismo formato que el capítulo de resultados (exportador-word.js) y que las tarjetas anteriores, que tienen cada una su
// copia; las nuevas usan esta. El texto se escapa aquí; las referencias llegan como HTML propio (con sus cursivas).
import { escaparHTML } from '../../shared/html.js';
import { descargarBlob } from '../../shared/descargas.js';
import { asegurarHtmlDocx } from '../../shared/vendor.js';
import { mostrarToast } from '../../shared/toast.js';

const PARRAFO = 'margin:0;line-height:200%;text-align:justify;text-indent:0.5in;';

/** @param {string} texto @returns {string} un encabezado de nivel 1: centrado y en negrita */
export const tituloWord = texto => `<p style="margin:18pt 0 8pt;line-height:200%;text-align:center;"><b>${escaparHTML(texto)}</b></p>`;

/** @param {string} texto @returns {string} un encabezado de nivel 2: a la izquierda y en negrita */
export const subtituloWord = texto => `<p style="margin:12pt 0 4pt;line-height:200%;"><b>${escaparHTML(texto)}</b></p>`;

/** @param {string} texto @returns {string} un párrafo con sangría de primera línea */
export const parrafoWord = texto => `<p style="${PARRAFO}">${escaparHTML(texto)}</p>`;

/**
 * Una tabla APA: «Tabla N» en negrita, el título en cursiva, filetes arriba y abajo de la cabecera y al final, y la nota.
 * @param {{ numero: number, titulo: string, cabecera: string[], filas: string[][], nota?: string, negritas?: Set<number> }} t
 *   negritas: las filas que van en negrita (la de la prueba elegida, por ejemplo)
 * @returns {string}
 */
export function tablaWord({ numero, titulo, cabecera, filas, nota = '', negritas }) {
    const th = cabecera.map(h => `<td style="border-top:1pt solid black;border-bottom:1pt solid black;padding:3pt 4pt;font-weight:bold;">${escaparHTML(h)}</td>`).join('');
    const tr = filas.map((f, i) => '<tr>' + f.map(c => {
        const borde = i === filas.length - 1 ? 'border-bottom:1pt solid black;' : '', negrita = negritas && negritas.has(i) ? 'font-weight:bold;' : '';
        return `<td style="padding:2pt 4pt;${borde}${negrita}">${escaparHTML(c)}</td>`;
    }).join('') + '</tr>').join('');
    return `<p style="margin:14pt 0 0;line-height:200%;"><b>Tabla ${numero}</b></p><p style="margin:0 0 6pt;line-height:200%;"><i>${escaparHTML(titulo)}</i></p>
        <table width="100%" cellspacing="0" style="border-collapse:collapse;font-size:11pt;line-height:115%;"><tr>${th}</tr>${tr}</table>
        ${nota ? `<p style="margin:4pt 0 0;font-size:11pt;line-height:150%;"><i>Nota.</i> ${escaparHTML(nota)}</p>` : ''}`;
}

/**
 * Una figura APA: «Figura N» en negrita, el título en cursiva, la imagen centrada y la nota. Sin imagen, nada.
 * @param {{ numero: number, titulo: string, png: { url: string, w: number, h: number } | null, nota?: string }} f
 * @returns {string}
 */
export function figuraWord({ numero, titulo, png, nota = '' }) {
    if (!png) return '';
    return `<p style="margin:14pt 0 0;line-height:200%;"><b>Figura ${numero}</b></p><p style="margin:0 0 6pt;line-height:200%;"><i>${escaparHTML(titulo)}</i></p>
        <p style="margin:0;text-align:center;"><img src="${png.url}" width="${png.w}" height="${png.h}" style="max-width:100%;"></p>
        ${nota ? `<p style="margin:4pt 0 0;font-size:11pt;line-height:150%;"><i>Nota.</i> ${escaparHTML(nota)}</p>` : ''}`;
}

/**
 * Las referencias, con su título y sangría francesa. Llegan como HTML propio del programa (con sus cursivas), no del usuario.
 * @param {string[]} referencias
 * @returns {string}
 */
export function referenciasWord(referencias) {
    return '<p style="margin:18pt 0 8pt;line-height:200%;text-align:center;"><b>Referencias</b></p>'
        + referencias.map(r => `<p style="margin:0;line-height:200%;padding-left:0.5in;text-indent:-0.5in;">${r}</p>`).join('');
}

/**
 * El documento HTML que Word abre (y que html-docx convierte en .docx), en Times New Roman de 12 puntos.
 * @param {string} titulo
 * @param {string} cuerpo
 * @returns {string}
 */
export function documentoWord(titulo, cuerpo) {
    return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
        <head><meta charset="utf-8"><title>${escaparHTML(titulo)}</title><!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
        <style>body{font-family:"Times New Roman",serif;font-size:12pt;}</style></head><body>${cuerpo}</body></html>`;
}

/**
 * Descarga el documento: .docx si el conversor (assets/vendor/html-docx.min.js) carga; si no, .doc (HTML que Word abre).
 * @param {string} documento
 * @param {string} nombreBase sin extensión
 * @param {string} queSeExporto para el aviso («Medidas repetidas exportadas a Word (APA 7)»)
 * @returns {Promise<string>} el nombre del archivo descargado
 */
export async function descargarWord(documento, nombreBase, queSeExporto) {
    const conversor = /** @type {{ asBlob?: (html: string) => Blob } | null} */ (await asegurarHtmlDocx());
    const docx = !!(conversor && conversor.asBlob);
    const blob = conversor && conversor.asBlob ? conversor.asBlob('<!DOCTYPE html>' + documento) : new Blob(['﻿' + documento], { type: 'application/msword' });
    const nombre = `${nombreBase}.${docx ? 'docx' : 'doc'}`;
    descargarBlob(blob, nombre);
    mostrarToast(docx ? queSeExporto : 'Exportado en .doc: no se pudo cargar el conversor a .docx', docx ? 'success' : 'warning');
    return nombre;
}
