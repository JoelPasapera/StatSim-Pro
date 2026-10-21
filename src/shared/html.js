// @ts-check
// shared/html.js — texto seguro para innerHTML: el escape de los caracteres especiales, las direcciones de los enlaces
// (solo http y https) y las referencias APA, cuyo único marcado son las cursivas.
// (2026.12.26) El Buscador pintaba sin escapar los títulos, autores, revistas, resúmenes y enlaces que llegan de las
// fuentes (algunas, por proxies públicos): un título con forma de etiqueta se ejecutaba en la página. Desde que la página
// puede guardar una clave (la de Web of Science), eso ya no es tolerable.

/** @type {Record<string, string>} */
const ENTIDADES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * El texto con &, <, >, " y ' escapados: se puede poner dentro de una etiqueta o de un atributo entre comillas.
 * @param {unknown} texto
 * @returns {string}
 */
export function escaparHTML(texto) {
    return String(texto ?? '').replace(/[&<>"']/g, c => ENTIDADES[c] || c);
}

// Las entidades nombradas que traen a veces los títulos de Crossref, OpenAlex o Scopus («Health &amp; Social Care»):
// las de HTML 4 para Latin-1 (de &nbsp; a &yuml;, los puntos de código 160–255, en orden), las letras griegas y las
// tipográficas.
/** @type {Record<string, string>} */
const NOMBRADAS = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', sbquo: '‚', ldquo: '“', rdquo: '”',
    bdquo: '„', hellip: '…', bull: '•', prime: '′', Prime: '″', trade: '™', euro: '€', minus: '−', le: '≤', ge: '≥', ne: '≠', asymp: '≈', infin: '∞', thinsp: ' ',
    ensp: ' ', emsp: ' ', dagger: '†', Dagger: '‡', permil: '‰', OElig: 'Œ', oelig: 'œ', Scaron: 'Š', scaron: 'š', Yuml: 'Ÿ', fnof: 'ƒ', circ: 'ˆ', tilde: '˜' };
('nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo '
    + 'frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve '
    + 'Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute '
    + 'ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml')
    .split(' ').forEach((nombre, i) => { NOMBRADAS[nombre] = String.fromCharCode(160 + i); });
('Alpha Beta Gamma Delta Epsilon Zeta Eta Theta Iota Kappa Lambda Mu Nu Xi Omicron Pi Rho - Sigma Tau Upsilon Phi Chi Psi Omega').split(' ')
    .forEach((nombre, i) => { if (nombre !== '-') { NOMBRADAS[nombre] = String.fromCharCode(913 + i); NOMBRADAS[nombre.toLowerCase()] = String.fromCharCode(945 + i); } });
NOMBRADAS.sigmaf = 'ς';

// Las etiquetas que traen los títulos y resúmenes de las fuentes: las de formato en línea, que van sin atributos
// (<i>, <sub>, <inf>…), las que pueden llevarlos (<span …>, <img …>, <script>…) y las de MathML y JATS de Crossref
// (<mml:math>, <jats:italic>). Solo esas: «<LOD and >ULOQ» o «a<b and c>d» son texto y se quedan.
const ETIQUETAS = new RegExp('<\\/?(?:(?:i|b|u|s|em|strong|sub|sup|inf|scp|sc|br|hr|small|big|tt|wbr)\\s*\\/?'
    + '|(?:span|font|a|p|div|img|script|style|iframe|object|embed|svg|math|code|abbr|cite|q|mark|bdi|bdo|title|(?:mml|jats|xlink):[a-z][a-z0-9-]*)(?:\\s[^<>]*)?\\/?)>', 'gi');

/** ¿Puede decodificarse este punto de código? (no los de control, salvo tabulador y saltos; no las mitades sustitutas) @param {number} n */
const decodificable = n => Number.isFinite(n) && n <= 0x10FFFF && !(n >= 0xD800 && n <= 0xDFFF)
    && (n === 9 || n === 10 || n === 13 || (n >= 0x20 && !(n >= 0x7F && n <= 0x9F)));

/**
 * El texto que llega de una fuente, limpio para leerlo: las entidades decodificadas y sin las etiquetas que traen
 * algunos títulos (<i>, <sup>, <inf>, <scp>, <mml:…>…). Solo se quitan esas etiquetas: «p < .05», «<LOD and >ULOQ» o
 * «a<b and c>d» se quedan como están. Para pintarlo hay que escaparlo después (textoSeguro).
 * @param {unknown} texto
 * @returns {string}
 */
export function textoPlano(texto) {
    const decodificado = String(texto ?? '').replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z][a-z0-9]{1,8});/gi, (todo, e) => {
        if (e[0] === '#') {
            const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
            return decodificable(n) ? String.fromCodePoint(n) : todo;
        }
        // &AMP;, &LT;, &GT; y &QUOT; también valen en mayúsculas
        return NOMBRADAS[e] ?? (/^(amp|lt|gt|quot)$/i.test(e) ? NOMBRADAS[e.toLowerCase()] : todo);
    });
    return decodificado.replace(ETIQUETAS, '');
}

/**
 * El texto de una fuente listo para innerHTML: limpio (textoPlano) y escapado.
 * @param {unknown} texto
 * @returns {string}
 */
export function textoSeguro(texto) {
    return escaparHTML(textoPlano(texto));
}

/**
 * Una dirección para un href, escapada, solo si es http o https ('' en otro caso: nada de «javascript:»).
 * @param {unknown} url
 * @returns {string}
 */
export function urlSegura(url) {
    const u = String(url ?? '').trim();
    return /^https?:\/\/[^\s]/i.test(u) ? escaparHTML(u) : '';
}

// Marcas provisionales de las cursivas de la referencia mientras se limpia el resto (caracteres de control: no pueden
// venir en el texto, se quitan antes).
const ABRE = String.fromCharCode(1), CIERRA = String.fromCharCode(2);

/**
 * Una referencia APA (texto cuyo único marcado propio son las cursivas <i>…</i>, como la devuelve citaAPA) lista para
 * innerHTML: las cursivas se conservan; el resto se limpia (textoPlano: entidades y etiquetas de los títulos) y se
 * escapa.
 * @param {unknown} html
 * @returns {string}
 */
export function htmlConCursivas(html) {
    const marcado = String(html ?? '').replace(/[\u0001\u0002]/g, '').replace(/<i>/g, ABRE).replace(/<\/i>/g, CIERRA);
    // (textoPlano no decodifica los puntos de código de control: un «&#1;» del texto no puede hacerse pasar por una marca)
    return escaparHTML(textoPlano(marcado)).split(ABRE).join('<i>').split(CIERRA).join('</i>');
}
