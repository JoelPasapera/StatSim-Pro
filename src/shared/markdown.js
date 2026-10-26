// @ts-check
// shared/markdown.js — (2027.01.02) el Markdown de los README de ejemplos/, en HTML, para la pestaña «Ejemplos». Es el
// que escriben las recetas (tests/navegador/recetas/): títulos, párrafos, listas (un elemento puede llevar dentro un bloque
// de código y otro párrafo), tablas, citas y bloques de código; y, dentro del texto, código, negritas y enlaces. Todo el
// texto se escapa, y un enlace solo puede ir a una dirección http(s) o a una ruta que resuelva quien llama (la de un
// archivo del caso): ningún «javascript:». Sin DOM: el generador de los ejemplos lo usa también, en Node, para sacar de
// cada README los pasos del caso (elementosDeLista). (2027.01.04) En shared/ (antes, en ejemplos/): también da forma a la
// plantilla de la discusión del Analizador, que lleva rayas («---», como <hr>) entre sus apartados.

import { escaparHTML } from './html.js';

/**
 * @typedef {object} OpcionesMarkdown
 * @property {(ruta: string) => string | null} [resolverRuta] el href de un enlace relativo (null: queda solo el texto)
 * @property {number} [nivelBase] el nivel HTML de «#» (por omisión, 1: «#» es h1 y «##», h2)
 */

/**
 * @typedef {{ tipo: 'titulo', nivel: number, texto: string }
 *   | { tipo: 'parrafo', texto: string }
 *   | { tipo: 'codigo', texto: string }
 *   | { tipo: 'cita', hijos: Bloque[] }
 *   | { tipo: 'tabla', cabecera: string[], alineacion: Array<'' | 'left' | 'center' | 'right'>, filas: string[][] }
 *   | { tipo: 'lista', ordenada: boolean, inicio: number, elementos: Array<{ crudo: string, hijos: Bloque[] }> }
 *   | { tipo: 'raya' }} Bloque
 */

const VALLA = /^( *)(`{3,})\s*([\w-]*)\s*$/;
const TITULO = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/;
const CITA = /^ {0,3}> ?(.*)$/;
const FILA = /^ {0,3}\|.*\|[ \t]*$/;
const SEPARADOR = /^ {0,3}\|(?:[ \t]*:?-+:?[ \t]*\|)+[ \t]*$/;
const ELEMENTO = /^( {0,3})([-*]|\d{1,9}\.)[ \t]+(.*)$/;
/** (2027.01.04) Una raya entre apartados: tres o más «-», «*» o «_» solos en su línea (antes que una lista: «- - -»). */
const RAYA = /^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const vacia = (/** @type {string} */ l) => /^\s*$/.test(l);
/** Los espacios con que empieza una línea. @param {string} l */
const sangriaDe = l => l.length - l.replace(/^ +/, '').length;

/** Las líneas de un texto, sin los saltos de Windows. @param {string} texto */
const lineasDe = texto => String(texto ?? '').replace(/\r\n?/g, '\n').split('\n');

/** ¿Empieza en esta línea un bloque que corta un párrafo? @param {string[]} lineas @param {number} i */
function cortaParrafo(lineas, i) {
    const l = lineas[i];
    return TITULO.test(l) || VALLA.test(l) || RAYA.test(l) || CITA.test(l) || ELEMENTO.test(l) || (FILA.test(l) && i + 1 < lineas.length && SEPARADOR.test(lineas[i + 1]));
}

/** Las celdas de una fila de tabla («| a | b |»), sin los extremos. @param {string} l */
function celdas(l) {
    const t = l.trim().replace(/^\|/, '').replace(/\|$/, '');
    /** @type {string[]} */
    const salida = [];
    let actual = '';
    for (let i = 0; i < t.length; i++) {
        if (t[i] === '\\' && t[i + 1] === '|') { actual += '|'; i++; continue; }
        if (t[i] === '|') { salida.push(actual.trim()); actual = ''; continue; }
        actual += t[i];
    }
    salida.push(actual.trim());
    return salida;
}

/**
 * Los bloques de unas líneas.
 * @param {string[]} lineas
 * @returns {Bloque[]}
 */
function bloques(lineas) {
    /** @type {Bloque[]} */
    const salida = [];
    let i = 0;
    while (i < lineas.length) {
        const l = lineas[i];
        if (vacia(l)) { i++; continue; }
        // un bloque de código entre vallas («```»), con la sangría de la valla quitada
        const valla = VALLA.exec(l);
        if (valla) {
            const sangria = valla[1].length, marca = valla[2];
            /** @type {string[]} */
            const contenido = [];
            i++;
            while (i < lineas.length && !(new RegExp(`^ *${marca}\\s*$`).test(lineas[i]))) {
                contenido.push(lineas[i].replace(new RegExp(`^ {0,${sangria}}`), ''));
                i++;
            }
            i++;   // la valla de cierre (o el final)
            salida.push({ tipo: 'codigo', texto: contenido.join('\n') });
            continue;
        }
        const titulo = TITULO.exec(l);
        if (titulo) { salida.push({ tipo: 'titulo', nivel: titulo[1].length, texto: titulo[2] }); i++; continue; }
        if (RAYA.test(l)) { salida.push({ tipo: 'raya' }); i++; continue; }
        if (CITA.test(l)) {
            /** @type {string[]} */
            const dentro = [];
            while (i < lineas.length && CITA.test(lineas[i])) { dentro.push(/** @type {RegExpExecArray} */ (CITA.exec(lineas[i]))[1]); i++; }
            salida.push({ tipo: 'cita', hijos: bloques(dentro) });
            continue;
        }
        if (FILA.test(l) && i + 1 < lineas.length && SEPARADOR.test(lineas[i + 1])) {
            const cabecera = celdas(l);
            const alineacion = celdas(lineas[i + 1]).map(c => (/^:-+:$/.test(c) ? 'center' : /-+:$/.test(c) ? 'right' : /^:-+$/.test(c) ? 'left' : ''));
            i += 2;
            /** @type {string[][]} */
            const filas = [];
            while (i < lineas.length && FILA.test(lineas[i])) { filas.push(celdas(lineas[i])); i++; }
            salida.push({ tipo: 'tabla', cabecera, alineacion: /** @type {Array<'' | 'left' | 'center' | 'right'>} */ (alineacion), filas });
            continue;
        }
        const primero = ELEMENTO.exec(l);
        if (primero) {
            const ordenada = /\d/.test(primero[2]), sangriaLista = primero[1].length;
            /** @type {Array<{ crudo: string, hijos: Bloque[] }>} */
            const elementos = [];
            while (i < lineas.length && !RAYA.test(lineas[i])) {
                const m = ELEMENTO.exec(lineas[i]);
                if (!m || m[1].length !== sangriaLista || /\d/.test(m[2]) !== ordenada) break;
                // lo que sigue al marcador; las líneas siguientes con al menos esa sangría son del mismo elemento (también
                // tras una línea en blanco), y una sin sangría que no empieza otro bloque continúa su párrafo
                const desplazamiento = m[1].length + m[2].length + 1;
                const propias = [m[3]];
                i++;
                while (i < lineas.length) {
                    const s = lineas[i];
                    if (vacia(s)) {
                        let j = i + 1;
                        while (j < lineas.length && vacia(lineas[j])) j++;
                        if (j < lineas.length && sangriaDe(lineas[j]) >= desplazamiento) { for (; i < j; i++) propias.push(''); continue; }
                        break;
                    }
                    const sangria = sangriaDe(s);
                    if (sangria >= desplazamiento) { propias.push(s.slice(desplazamiento)); i++; continue; }
                    if (!cortaParrafo(lineas, i) && !vacia(propias[propias.length - 1])) { propias.push(s.trim()); i++; continue; }
                    break;
                }
                elementos.push({ crudo: propias.join('\n').replace(/\n+$/, ''), hijos: bloques(propias) });
            }
            salida.push({ tipo: 'lista', ordenada, inicio: ordenada ? parseInt(primero[2], 10) : 1, elementos });
            continue;
        }
        // un párrafo: hasta una línea en blanco o el comienzo de otro bloque
        /** @type {string[]} */
        const parrafo = [l.trim()];
        i++;
        while (i < lineas.length && !vacia(lineas[i]) && !cortaParrafo(lineas, i)) { parrafo.push(lineas[i].trim()); i++; }
        salida.push({ tipo: 'parrafo', texto: parrafo.join(' ') });
    }
    return salida;
}

/**
 * Un enlace: a una dirección http(s), en otra pestaña; a una ruta relativa, la que dé `resolverRuta` (también en otra
 * pestaña: un PDF del caso no reemplaza la página, con lo que haya en ella); a cualquier otra cosa («javascript:»,
 * «//otro.sitio»), solo su texto.
 * @param {string} texto @param {string} destino @param {OpcionesMarkdown} op
 */
function enlace(texto, destino, op) {
    const contenido = enLinea(texto, op);
    if (/^https?:\/\/\S/i.test(destino)) return `<a href="${escaparHTML(destino)}" target="_blank" rel="noopener noreferrer">${contenido}</a>`;
    // (revisión) lo demás, solo si es una ruta relativa de letras, números y «_ . / # -», que no empieza por «/»: sin «:», sin
    // esquema posible (un carácter de control delante de «javascript:» lo escondía de una expresión que buscara el esquema,
    // y el navegador se lo salta)
    if (!/^[A-Za-z0-9_.#-][A-Za-z0-9_./#-]*$/.test(destino)) return contenido;
    const href = op.resolverRuta ? op.resolverRuta(destino) : null;
    return href ? `<a href="${escaparHTML(href)}" target="_blank" rel="noopener">${contenido}</a>` : contenido;
}

/**
 * El texto de un párrafo, un título o una celda, en HTML: código («`…`»), negritas («**…**») y enlaces («[texto](ruta)»);
 * lo demás, escapado. Una barra invertida deja literal el signo que sigue.
 * @param {string} texto
 * @param {OpcionesMarkdown} [op]
 * @returns {string}
 */
export function enLinea(texto, op = {}) {
    const t = String(texto ?? '');
    let s = '';
    let i = 0;
    while (i < t.length) {
        const c = t[i];
        if (c === '\\' && i + 1 < t.length && /[\\`*_[\]()#|>!-]/.test(t[i + 1])) { s += escaparHTML(t[i + 1]); i += 2; continue; }
        if (c === '`') {
            let n = 1;
            while (t[i + n] === '`') n++;
            const marca = '`'.repeat(n), fin = t.indexOf(marca, i + n);
            if (fin > i) { s += `<code>${escaparHTML(t.slice(i + n, fin).replace(/^ (.+) $/, '$1'))}</code>`; i = fin + n; continue; }
            s += escaparHTML(marca); i += n; continue;
        }
        if (c === '*' && t[i + 1] === '*') {
            const fin = t.indexOf('**', i + 2);
            if (fin > i + 2) { s += `<strong>${enLinea(t.slice(i + 2, fin), op)}</strong>`; i = fin + 2; continue; }
        }
        if (c === '[') {
            // el destino puede llevar paréntesis equilibrados (un nivel: «…/A_(b)»), como en CommonMark
            const m = /^\[([^\]\n]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/.exec(t.slice(i));
            if (m) { s += enlace(m[1], m[2], op); i += m[0].length; continue; }
        }
        s += escaparHTML(c);
        i++;
    }
    return s;
}

/**
 * Unos bloques en HTML.
 * @param {Bloque[]} lista
 * @param {OpcionesMarkdown} op
 * @param {boolean} [apretada] dentro de un elemento de lista con un solo párrafo: el párrafo sin <p>
 * @returns {string}
 */
function html(lista, op, apretada = false) {
    const base = Math.max(1, Math.min(6, op.nivelBase || 1));
    return lista.map(b => {
        switch (b.tipo) {
            case 'titulo': { const n = Math.min(6, base + b.nivel - 1); return `<h${n}>${enLinea(b.texto, op)}</h${n}>`; }
            case 'parrafo': return apretada ? enLinea(b.texto, op) : `<p>${enLinea(b.texto, op)}</p>`;
            case 'codigo': return `<pre><code>${escaparHTML(b.texto)}</code></pre>`;
            case 'raya': return '<hr>';
            case 'cita': return `<blockquote>${html(b.hijos, op)}</blockquote>`;
            case 'tabla': {
                const alinear = (/** @type {number} */ j) => (b.alineacion[j] ? ` style="text-align:${b.alineacion[j]}"` : '');
                const cabecera = b.cabecera.map((c, j) => `<th scope="col"${alinear(j)}>${enLinea(c, op)}</th>`).join('');
                const filas = b.filas.map(f => `<tr>${b.cabecera.map((_, j) => `<td${alinear(j)}>${enLinea(f[j] ?? '', op)}</td>`).join('')}</tr>`).join('');
                return `<div class="table-container"><table class="table"><thead><tr>${cabecera}</tr></thead><tbody>${filas}</tbody></table></div>`;
            }
            case 'lista': {
                const etiqueta = b.ordenada ? 'ol' : 'ul';
                const inicio = b.ordenada && b.inicio !== 1 ? ` start="${b.inicio}"` : '';
                const elementos = b.elementos.map(e => `<li>${html(e.hijos, op, e.hijos.length === 1 && e.hijos[0].tipo === 'parrafo')}</li>`).join('');
                return `<${etiqueta}${inicio}>${elementos}</${etiqueta}>`;
            }
            default: return '';
        }
    }).join('\n');
}

/**
 * Un texto en Markdown, en HTML seguro para innerHTML.
 * @param {string} texto
 * @param {OpcionesMarkdown} [op]
 * @returns {string}
 */
export function markdownAHtml(texto, op = {}) {
    return html(bloques(lineasDe(texto)), op);
}

/**
 * Dónde empieza y termina cada sección de nivel 2 («## Título») de un texto, sin contar lo que está entre vallas.
 * @param {string[]} lineas
 * @returns {Array<{ titulo: string, desde: number, hasta: number }>}
 */
function secciones(lineas) {
    /** @type {Array<{ titulo: string, desde: number, hasta: number }>} */
    const salida = [];
    let enCodigo = false;
    lineas.forEach((l, i) => {
        if (VALLA.test(l)) { enCodigo = !enCodigo; return; }
        const m = !enCodigo && /^##[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(l);
        if (!m) return;
        if (salida.length) salida[salida.length - 1].hasta = i;
        salida.push({ titulo: m[1], desde: i, hasta: lineas.length });
    });
    return salida;
}

/**
 * El texto de una sección de nivel 2 («## Título»), sin su título; '' si no está.
 * @param {string} texto
 * @param {string} titulo
 * @returns {string}
 */
export function seccionDe(texto, titulo) {
    const lineas = lineasDe(texto);
    const s = secciones(lineas).find(x => x.titulo === titulo);
    return s ? lineas.slice(s.desde + 1, s.hasta).join('\n') : '';
}

/**
 * Un texto partido por sus secciones de nivel 2: lo que va antes de la primera y cada una con su título (sin la línea del
 * título en su texto).
 * @param {string} texto
 * @returns {{ inicio: string, secciones: Array<{ titulo: string, texto: string }> }}
 */
export function partirEnSecciones(texto) {
    const lineas = lineasDe(texto);
    const s = secciones(lineas);
    return {
        inicio: lineas.slice(0, s.length ? s[0].desde : lineas.length).join('\n'),
        secciones: s.map(x => ({ titulo: x.titulo, texto: lineas.slice(x.desde + 1, x.hasta).join('\n') })),
    };
}

/**
 * El texto sin las secciones de nivel 2 nombradas (con sus títulos).
 * @param {string} texto
 * @param {string[]} titulos
 * @returns {string}
 */
export function sinSecciones(texto, titulos) {
    const lineas = lineasDe(texto);
    const quitar = secciones(lineas).filter(s => titulos.includes(s.titulo));
    return lineas.filter((_, i) => !quitar.some(s => i >= s.desde && i < s.hasta)).join('\n');
}

/**
 * Los elementos de la primera lista de un texto, cada uno en su Markdown (sin el marcador ni la sangría de sus líneas).
 * @param {string} texto
 * @returns {string[]}
 */
export function elementosDeLista(texto) {
    const lista = bloques(lineasDe(texto)).find(b => b.tipo === 'lista');
    return lista && lista.tipo === 'lista' ? lista.elementos.map(e => e.crudo) : [];
}
