// @ts-check
// core/data/xlsx/xml.js — (2026.12.31) lo justo de XML para leer y escribir las partes de un .xlsx (libro, relaciones,
// estilos, cadenas compartidas y hojas): un recorrido de etiquetas por su nombre local (sin el prefijo de espacio de
// nombres: «x:row» es «row»), los atributos de una etiqueta, el texto con sus entidades y los escapes «_xHHHH_» de Office,
// y, para escribir, los mismos escapes al revés. No valida el documento ni resuelve DTD: los .xlsx no los usan. Sin DOM:
// funciona en un Worker y en Node.

/**
 * @typedef {{ tipo: 'abre' | 'cierra', nombre: string, atributos: Record<string, string>, vacia: boolean, inicio: number, fin: number }} Etiqueta
 *   nombre: el nombre local; atributos: por nombre completo y por nombre local («r:id» y «id»); vacia: <x/>; inicio y fin:
 *   las posiciones de «<» y de lo que sigue a «>»
 */

const ENTIDADES = /** @type {Record<string, string>} */ ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" });

/**
 * Un texto de XML como cadena: las entidades (&lt; &#233; &#xE9;) y, en el texto de las celdas, los escapes de Office
 * («_x000D_» es un retorno de carro; «_x005F_» es un guion bajo, que protege a un «_x…_» literal).
 * @param {string} s
 * @param {boolean} [escapesOffice]
 * @returns {string}
 */
export function textoXml(s, escapesOffice = false) {
    let t = s.indexOf('&') < 0 ? s : s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, e) => {
        if (e[0] === '#') {
            const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
            return cp >= 0 && cp <= 0x10FFFF ? String.fromCodePoint(cp) : m;
        }
        return ENTIDADES[e] ?? m;
    });
    if (escapesOffice && t.indexOf('_x') >= 0) t = t.replace(/_x([0-9a-fA-F]{4})_/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
    return t;
}

/**
 * Los atributos del interior de una etiqueta («r="A1" t="s"»), por nombre completo y por nombre local.
 * @param {string} s
 * @returns {Record<string, string>}
 */
export function atributosXml(s) {
    /** @type {Record<string, string>} */
    const a = {};
    const re = /([^\s=\/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let m;
    while ((m = re.exec(s))) {
        const valor = textoXml(m[2] ?? m[3] ?? '');
        a[m[1]] = valor;
        const dos = m[1].indexOf(':');
        if (dos >= 0 && !m[1].startsWith('xmlns')) { const local = m[1].slice(dos + 1); if (!(local in a)) a[local] = valor; }
    }
    return a;
}

/** El nombre local de un nombre con prefijo («x:row» → «row»). @param {string} nombre */
export const nombreLocal = nombre => { const i = nombre.indexOf(':'); return i < 0 ? nombre : nombre.slice(i + 1); };

/**
 * Las etiquetas del documento, en orden (para las partes pequeñas: libro, relaciones, estilos). Salta la declaración, los
 * comentarios, las instrucciones de proceso y los CDATA.
 * @param {string} xml
 * @returns {Generator<Etiqueta>}
 */
export function* etiquetasXml(xml) {
    let i = 0;
    const n = xml.length;
    while (i < n) {
        const lt = xml.indexOf('<', i);
        if (lt < 0) return;
        const c = xml.charCodeAt(lt + 1);
        if (c === 33 /* ! */) {
            if (xml.startsWith('<!--', lt)) { const f = xml.indexOf('-->', lt + 4); i = f < 0 ? n : f + 3; continue; }
            if (xml.startsWith('<![CDATA[', lt)) { const f = xml.indexOf(']]>', lt + 9); i = f < 0 ? n : f + 3; continue; }
            const f = xml.indexOf('>', lt); i = f < 0 ? n : f + 1; continue;
        }
        if (c === 63 /* ? */) { const f = xml.indexOf('?>', lt + 2); i = f < 0 ? n : f + 2; continue; }
        const gt = finDeEtiqueta(xml, lt);
        if (gt < 0) return;
        if (c === 47 /* / */) {
            yield { tipo: 'cierra', nombre: nombreLocal(xml.slice(lt + 2, gt).trim()), atributos: {}, vacia: false, inicio: lt, fin: gt + 1 };
        } else {
            const vacia = xml.charCodeAt(gt - 1) === 47;
            const interior = xml.slice(lt + 1, vacia ? gt - 1 : gt);
            const m = /^[^\s\/>]+/.exec(interior);
            const nombre = m ? m[0] : '';
            yield { tipo: 'abre', nombre: nombreLocal(nombre), atributos: atributosXml(interior.slice(nombre.length)), vacia, inicio: lt, fin: gt + 1 };
        }
        i = gt + 1;
    }
}

/**
 * Dónde termina la etiqueta que empieza en `lt` (la posición de su «>»), sin cortar en un «>» dentro de un atributo.
 * @param {string} xml
 * @param {number} lt
 * @returns {number} -1 si no termina
 */
export function finDeEtiqueta(xml, lt) {
    let q = 0;   // 0: fuera de comillas; si no, el código de la comilla abierta
    for (let i = lt + 1, n = xml.length; i < n; i++) {
        const c = xml.charCodeAt(i);
        if (q) { if (c === q) q = 0; }
        else if (c === 34 || c === 39) q = c;
        else if (c === 62) return i;
    }
    return -1;
}

/** Un carácter como escape de Office: «\r» → «_x000D_». @param {string} c */
const escapeOffice = c => `_x${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}_`;

/** El texto sin suplentes sueltos de UTF-16 (que XML no admite): cada uno, U+FFFD. @param {string} s */
function sinSuplentesSueltos(s) {
    if (!/[\uD800-\uDFFF]/.test(s)) return s;
    let t = '';
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) {
            const d = s.charCodeAt(i + 1);
            if (d >= 0xDC00 && d <= 0xDFFF) { t += s[i] + s[i + 1]; i++; continue; }
        }
        t += c >= 0xD800 && c <= 0xDFFF ? '�' : s[i];
    }
    return t;
}

/**
 * Un texto como contenido de una celda (el <t> de una cadena): las entidades de XML para «&», «<» y «>», y los escapes de
 * Office para lo que XML no admite o no conserva: los caracteres de control y el retorno de carro (que un lector de XML
 * convertiría en salto de línea) como «_x000D_», y un «_xHHHH_» que ya estuviera en el texto, protegido con «_x005F_»
 * (así Excel, y textoXml, lo leen tal cual). Sin suplentes sueltos de UTF-16.
 * @param {string} s
 * @returns {string}
 */
export function escaparTextoCelda(s) {
    let t = s.indexOf('_x') >= 0 ? s.replace(/_(x[0-9a-fA-F]{4}_)/g, '_x005F_$1') : s;
    t = t.replace(/[&<>]/g, c => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));
    t = t.replace(/[\u0000-\u0008\u000B-\u001F￾￿]/g, escapeOffice);
    return sinSuplentesSueltos(t);
}

/**
 * Un texto como valor de atributo o como contenido de las partes que no son celdas (los nombres de las hojas, el título
 * del libro): las entidades de XML, y sin los caracteres que XML no admite.
 * @param {string} s
 * @returns {string}
 */
export function escaparXml(s) {
    const t = s.replace(/[&<>"]/g, c => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'))
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '').replace(/[\t\n\r]/g, c => `&#${c.charCodeAt(0)};`);
    return sinSuplentesSueltos(t);
}

/**
 * El prefijo con que el documento escribe su elemento raíz («x:» en <x:worksheet …>; «» sin prefijo): las partes de un
 * .xlsx usan el mismo para todos sus elementos, y la lectura rápida de las hojas lo necesita para buscar las etiquetas.
 * @param {string} xml
 * @param {string} raiz el nombre local del elemento raíz («worksheet», «sst»)
 * @returns {string}
 */
export function prefijoDe(xml, raiz) {
    const m = new RegExp(`<([A-Za-z_][\\w.-]*:)?${raiz}[\\s>/]`).exec(xml);
    return m && m[1] ? m[1] : '';
}
