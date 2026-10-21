// @ts-check
// core/data/xlsx/escritor.js — (2026.12.31) escritura de libros de Excel (.xlsx: SpreadsheetML de Office Open XML,
// ISO/IEC 29500 en su variante «transitional», la que escribe Excel), sin bibliotecas: las partes del libro como XML y el
// ZIP con core/data/zip/escritor.js. Cada hoja, con sus filas de números, textos (como cadenas compartidas: una vez cada
// texto distinto, como lo guarda Excel), verdadero o falso y fechas (números de serie con el formato de fecha corta, que
// Excel muestra en el orden del idioma del equipo); la primera fila, si es de encabezados, en negrita, fija al desplazarse y
// con filtro. Las filas se escriben por trozos, sin una cadena con toda la hoja (una base de un millón de filas no cabría).
// Sin DOM: funciona en la página, en un Worker y en Node.
//
// La estructura sigue la de los libros que escribe XlsxWriter (la misma secuencia de elementos que exige el esquema de
// Excel, la parte de estilos mínima, las propiedades del documento): lo que Excel abre sin pedir «reparar» el archivo.

import { escribirZip } from '../zip/escritor.js';
import { FORMATO_FECHA_CORTA } from './fechas.js';
import { MAXIMO_COLUMNAS, MAXIMO_FILAS, letrasDeColumna } from './referencias.js';
import { escaparTextoCelda, escaparXml } from './xml.js';

/**
 * @typedef {number | string | boolean | null | undefined} ValorEscrito
 *   un número (NaN e ±Infinity quedan vacíos), un texto ('' queda vacío), verdadero o falso, o nada
 * @typedef {{
 *   nombre: string,
 *   encabezado?: string[],
 *   filas: ValorEscrito[][] | { n: number, fila: (i: number) => ValorEscrito[] },
 *   fechas?: boolean[],
 *   negrita?: number[],
 *   anchos?: Array<number | null | undefined>,
 *   ajustar?: boolean[]
 * }} HojaNueva
 *   encabezado: la primera fila (en negrita, fija y con filtro); filas: las de datos (un arreglo o, para las grandes, su
 *   número y una función que da cada una); fechas: las columnas cuyos números son fechas (números de serie de Excel:
 *   core/data/xlsx/fechas.js, diasASerie); negrita: qué filas de datos van en negrita; anchos: el ancho de cada columna,
 *   en caracteres (si falta, se estima); ajustar: las columnas de texto largo, con el texto ajustado a la celda
 * @typedef {{ fecha?: Date, comprimir?: boolean, titulo?: string, autor?: string }} OpcionesXlsx
 *   fecha: la de creación (por omisión, ahora; las pruebas la fijan); comprimir: false guarda el ZIP sin comprimir
 * @typedef {{ trozos: Uint8Array[], avisos: string[] }} LibroEscrito
 */

const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PAQUETE = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CABECERA = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
/** El máximo de caracteres de una celda de Excel. */
export const MAXIMO_TEXTO = 32767;
/** Los estilos de celda (los índices de cellXfs de estilos()): normal, negrita, fecha corta y texto ajustado. */
const ESTILO = { NORMAL: 0, NEGRITA: 1, FECHA: 2, AJUSTADO: 3 };
/** Cuántos caracteres de XML se juntan antes de entregar un trozo al ZIP. */
const TROZO = 1 << 18;

/** El largo máximo del nombre de una hoja, en unidades de UTF-16 (las que cuenta Excel: un emoji ocupa dos). */
const LARGO_HOJA = 31;
/**
 * Lo que un nombre de hoja no puede llevar: «[ ] : * ? / \» (Excel) y lo que XML no admite (los caracteres de control,
 * U+FFFE, U+FFFF y los suplentes sueltos de UTF-16).
 */
const NO_VALE_EN_HOJA = /[[\]:*?/\\\u0000-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** Sin espacios ni comillas simples en los bordes (Excel no admite un nombre que empiece o termine en una). @param {string} s */
const sinBordes = s => s.replace(/^[\s']+|[\s']+$/g, '');

/** Recorta a `largo` unidades de UTF-16 sin partir un carácter de dos. @param {string} s @param {number} largo */
function recortarA(s, largo) {
    if (s.length <= largo) return s;
    const c = s.charCodeAt(largo - 1);
    return s.slice(0, c >= 0xD800 && c <= 0xDBFF ? largo - 1 : largo);
}

/**
 * Un nombre de hoja válido para Excel: sin «[ ] : * ? / \» ni caracteres que XML no admite, sin comillas simples ni
 * espacios al principio ni al final, de 1 a 31 unidades de UTF-16 y distinto (sin distinguir mayúsculas) de los ya
 * usados. (2026.12.31, revisión) Los bordes se limpian también después de recortar: «…a'b» recortado a 31 terminaba en
 * comilla, y Excel pedía «reparar» el libro; y el largo se cuenta como Excel (31 emojis eran 62 unidades).
 * @param {string} nombre
 * @param {Set<string>} usados en minúsculas
 * @returns {string}
 */
function nombreDeHoja(nombre, usados) {
    let base = sinBordes(recortarA(sinBordes(String(nombre ?? '').replace(NO_VALE_EN_HOJA, ' ').replace(/\s+/g, ' ')), LARGO_HOJA)) || 'Hoja';
    if (base.toLowerCase() === 'history') base = 'Historial';   // reservado por Excel
    let candidato = base, k = 2;
    while (usados.has(candidato.toLowerCase())) {
        const sufijo = ` (${k++})`;
        candidato = (sinBordes(recortarA(base, LARGO_HOJA - sufijo.length)) || 'Hoja') + sufijo;
    }
    usados.add(candidato.toLowerCase());
    return candidato;
}

/** Recorta un texto al máximo de Excel sin partir un carácter de dos unidades de UTF-16. @param {string} s */
function recortar(s) {
    if (s.length <= MAXIMO_TEXTO) return s;
    const c = s.charCodeAt(MAXIMO_TEXTO - 1);
    return s.slice(0, c >= 0xD800 && c <= 0xDBFF ? MAXIMO_TEXTO - 1 : MAXIMO_TEXTO);
}

/** El ancho de un valor al mostrarlo, en caracteres (aproximado: una fecha corta ocupa 10). @param {ValorEscrito} v @param {boolean} fecha */
function anchoDe(v, fecha) {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return fecha ? 10 : Number.isFinite(v) ? Math.min(String(v).length, 15) : 0;
    if (typeof v === 'boolean') return v ? 9 : 5;   // VERDADERO / FALSO
    let max = 0;
    for (const linea of String(v).split('\n')) max = Math.max(max, Array.from(linea).length);
    return max;
}

/**
 * Las filas de una hoja como función (la forma única que usa el escritor).
 * @param {HojaNueva['filas']} filas
 * @returns {{ n: number, fila: (i: number) => ValorEscrito[] }}
 */
function comoFunciones(filas) {
    if (Array.isArray(filas)) return { n: filas.length, fila: i => /** @type {ValorEscrito[]} */ (filas[i]) };
    return filas;
}

/**
 * Escribe un libro de Excel con estas hojas, en este orden (la primera es la que se ve al abrirlo).
 * @param {HojaNueva[]} hojas
 * @param {OpcionesXlsx} [opciones]
 * @returns {Promise<LibroEscrito>}
 */
export async function escribirXlsx(hojas, opciones = {}) {
    if (!hojas.length) throw new Error('Un libro de Excel necesita al menos una hoja');
    const fecha = opciones.fecha instanceof Date ? opciones.fecha : new Date();
    /** @type {string[]} */
    const avisos = [];
    /** @type {string[]} */
    const cadenas = [];
    /** @type {Map<string, number>} */
    const indiceDe = new Map();
    let usosDeCadenas = 0, recortados = 0;
    const usados = new Set();
    const preparadas = hojas.map((h, k) => {
        const repetido = usados.has(String(h.nombre ?? '').toLowerCase());
        const nombre = nombreDeHoja(h.nombre, usados);
        if (nombre !== h.nombre) avisos.push(`la hoja «${h.nombre}» se llama «${nombre}» (${repetido ? 'ya hay otra con ese nombre: Excel no distingue mayúsculas' : 'Excel no admite ese nombre'})`);
        const datos = comoFunciones(h.filas);
        const conEncabezado = !!(h.encabezado && h.encabezado.length);
        const total = datos.n + (conEncabezado ? 1 : 0);
        if (total > MAXIMO_FILAS) throw new Error(`La hoja «${nombre}» tendría ${total.toLocaleString('es')} filas, y Excel admite ${MAXIMO_FILAS.toLocaleString('es')}: genera una base más pequeña o descárgala en CSV`);
        // las columnas: las del encabezado o, si no hay, las de la fila más larga
        let columnas = conEncabezado ? /** @type {string[]} */ (h.encabezado).length : 0;
        if (!conEncabezado) for (let i = 0; i < datos.n; i++) columnas = Math.max(columnas, datos.fila(i).length);
        if (columnas > MAXIMO_COLUMNAS) throw new Error(`La hoja «${nombre}» tendría ${columnas} columnas, y Excel admite ${MAXIMO_COLUMNAS}`);
        return { k, nombre, h, datos, conEncabezado, total, columnas };
    });

    /** El índice de un texto en las cadenas compartidas. @param {string} s */
    const cadena = s => {
        let t = s;
        if (t.length > MAXIMO_TEXTO) { t = recortar(t); recortados++; }
        let i = indiceDe.get(t);
        if (i === undefined) { i = cadenas.length; cadenas.push(t); indiceDe.set(t, i); }
        usosDeCadenas++;
        return i;
    };

    /**
     * El XML de una hoja, por trozos.
     * @param {(typeof preparadas)[number]} p
     * @returns {Generator<string>}
     */
    function* hojaXml(p) {
        const { h, datos, conEncabezado, total, columnas } = p;
        const letras = Array.from({ length: columnas }, (_, j) => letrasDeColumna(j));
        const fechas = h.fechas || [];
        const ajustar = h.ajustar || [];
        const negrita = new Set(h.negrita || []);
        const ultima = columnas ? `${letras[columnas - 1]}${Math.max(total, 1)}` : '';
        let s = `${CABECERA}<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_R}">`;
        s += `<dimension ref="${columnas && total ? `A1:${ultima}` : 'A1'}"/>`;
        s += `<sheetViews><sheetView ${p.k === 0 ? 'tabSelected="1" ' : ''}workbookViewId="0">`;
        s += conEncabezado && datos.n ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/>' : '';
        s += '</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>';
        if (columnas) {
            // los anchos: los dados o, si faltan, por el encabezado y las primeras 200 filas (entre 8 y 60 caracteres)
            const anchos = new Array(columnas).fill(0);
            if (conEncabezado) /** @type {string[]} */ (h.encabezado).forEach((t, j) => { anchos[j] = anchoDe(t, false) + 2; });
            for (let i = 0, m = Math.min(datos.n, 200); i < m; i++) {
                const f = datos.fila(i);
                for (let j = 0; j < columnas; j++) anchos[j] = Math.max(anchos[j], anchoDe(f[j], !!fechas[j]) + 1);
            }
            s += '<cols>';
            for (let j = 0; j < columnas; j++) {
                const dado = h.anchos && h.anchos[j];
                const ancho = Math.round(Math.min(ajustar[j] ? 80 : 60, Math.max(8, dado || anchos[j])) * 100) / 100;
                s += `<col min="${j + 1}" max="${j + 1}" width="${ancho}" customWidth="1"/>`;
            }
            s += '</cols>';
        }
        s += '<sheetData>';
        /** Una fila de valores como XML. @param {ValorEscrito[]} valores @param {number} r @param {boolean} enNegrita */
        const filaXml = (valores, r, enNegrita) => {
            let x = `<row r="${r}">`;
            const m = Math.min(valores.length, columnas);
            for (let j = 0; j < m; j++) {
                const v = valores[j];
                if (v === null || v === undefined) continue;
                const ref = letras[j] + r;
                if (typeof v === 'number') {
                    if (!Number.isFinite(v)) continue;
                    const estilo = enNegrita ? ESTILO.NEGRITA : fechas[j] ? ESTILO.FECHA : ESTILO.NORMAL;
                    x += `<c r="${ref}"${estilo ? ` s="${estilo}"` : ''}><v>${v === 0 ? 0 : v}</v></c>`;
                } else if (typeof v === 'boolean') {
                    x += `<c r="${ref}"${enNegrita ? ` s="${ESTILO.NEGRITA}"` : ''} t="b"><v>${v ? 1 : 0}</v></c>`;
                } else {
                    const t = String(v);
                    if (t === '') continue;
                    const estilo = enNegrita ? ESTILO.NEGRITA : ajustar[j] ? ESTILO.AJUSTADO : ESTILO.NORMAL;
                    x += `<c r="${ref}"${estilo ? ` s="${estilo}"` : ''} t="s"><v>${cadena(t)}</v></c>`;
                }
            }
            return x + '</row>';
        };
        let r = 1;
        if (conEncabezado) s += filaXml(/** @type {string[]} */ (h.encabezado), r++, true);
        for (let i = 0; i < datos.n; i++) {
            s += filaXml(datos.fila(i), r++, negrita.has(i));
            if (s.length >= TROZO) { yield s; s = ''; }
        }
        s += '</sheetData>';
        if (conEncabezado && datos.n && columnas) s += `<autoFilter ref="A1:${ultima}"/>`;
        s += '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>';
        yield s;
    }

    /** Las cadenas compartidas (al final: se conocen al terminar las hojas). @returns {Generator<string>} */
    function* cadenasXml() {
        let s = `${CABECERA}<sst xmlns="${NS_MAIN}" count="${usosDeCadenas}" uniqueCount="${cadenas.length}">`;
        for (const t of cadenas) {
            s += /^\s|\s$/.test(t) ? `<si><t xml:space="preserve">${escaparTextoCelda(t)}</t></si>` : `<si><t>${escaparTextoCelda(t)}</t></si>`;
            if (s.length >= TROZO) { yield s; s = ''; }
        }
        yield s + '</sst>';
    }

    const n = preparadas.length;
    const iso = fecha.toISOString().replace(/\.\d{3}Z$/, 'Z');
    const titulo = opciones.titulo ? `<dc:title>${escaparXml(opciones.titulo)}</dc:title>` : '';
    const autor = escaparXml(opciones.autor || 'StatSim Pro');
    const tipos = `${CABECERA}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
        + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
        + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + preparadas.map(p => `<Override PartName="/xl/worksheets/sheet${p.k + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
        + '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>';
    const relPaquete = `${CABECERA}<Relationships xmlns="${NS_PAQUETE}">`
        + `<Relationship Id="rId3" Type="${NS_R}/extended-properties" Target="docProps/app.xml"/>`
        + `<Relationship Id="rId2" Type="${NS_PAQUETE}/metadata/core-properties" Target="docProps/core.xml"/>`
        + `<Relationship Id="rId1" Type="${NS_R}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
    const app = `${CABECERA}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">`
        + '<Application>StatSim Pro</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop>'
        + `<HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Hojas de cálculo</vt:lpstr></vt:variant><vt:variant><vt:i4>${n}</vt:i4></vt:variant></vt:vector></HeadingPairs>`
        + `<TitlesOfParts><vt:vector size="${n}" baseType="lpstr">${preparadas.map(p => `<vt:lpstr>${escaparXml(p.nombre)}</vt:lpstr>`).join('')}</vt:vector></TitlesOfParts>`
        + '<LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>12.0000</AppVersion></Properties>';
    const core = `${CABECERA}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`
        + `${titulo}<dc:creator>${autor}</dc:creator><cp:lastModifiedBy>${autor}</cp:lastModifiedBy>`
        + `<dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified></cp:coreProperties>`;
    const filtros = preparadas.filter(p => p.conEncabezado && p.datos.n && p.columnas)
        .map(p => `<definedName name="_xlnm._FilterDatabase" localSheetId="${p.k}" hidden="1">'${escaparXml(p.nombre.replace(/'/g, "''"))}'!$A$1:$${letrasDeColumna(p.columnas - 1)}$${p.total}</definedName>`).join('');
    const libro = `${CABECERA}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_R}"><workbookPr/>`
        + '<bookViews><workbookView xWindow="240" yWindow="15" windowWidth="16095" windowHeight="9660"/></bookViews>'
        + `<sheets>${preparadas.map(p => `<sheet name="${escaparXml(p.nombre)}" sheetId="${p.k + 1}" r:id="rId${p.k + 1}"/>`).join('')}</sheets>`
        + (filtros ? `<definedNames>${filtros}</definedNames>` : '') + '</workbook>';
    const relLibro = `${CABECERA}<Relationships xmlns="${NS_PAQUETE}">`
        + preparadas.map(p => `<Relationship Id="rId${p.k + 1}" Type="${NS_R}/worksheet" Target="worksheets/sheet${p.k + 1}.xml"/>`).join('')
        + `<Relationship Id="rId${n + 1}" Type="${NS_R}/styles" Target="styles.xml"/>`
        + `<Relationship Id="rId${n + 2}" Type="${NS_R}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`;
    const estilos = `${CABECERA}<styleSheet xmlns="${NS_MAIN}">`
        + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>'
        + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
        + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
        + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        + '<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
        + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
        + `<xf numFmtId="${FORMATO_FECHA_CORTA}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`
        + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>'
        + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
        + '<dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium9" defaultPivotStyle="PivotStyleLight16"/></styleSheet>';

    /** @type {import('../zip/escritor.js').EntradaNueva[]} */
    const entradas = [
        { nombre: '[Content_Types].xml', contenido: tipos },
        { nombre: '_rels/.rels', contenido: relPaquete },
        { nombre: 'docProps/app.xml', contenido: app },
        { nombre: 'docProps/core.xml', contenido: core },
        { nombre: 'xl/workbook.xml', contenido: libro },
        { nombre: 'xl/_rels/workbook.xml.rels', contenido: relLibro },
        { nombre: 'xl/styles.xml', contenido: estilos },
        ...preparadas.map(p => ({ nombre: `xl/worksheets/sheet${p.k + 1}.xml`, contenido: hojaXml(p) })),
        // las hojas se escriben antes: al llegar aquí, las cadenas ya están todas
        { nombre: 'xl/sharedStrings.xml', contenido: cadenasXml() }
    ];
    const trozos = await escribirZip(entradas, { fecha, comprimir: opciones.comprimir });
    if (recortados) avisos.push(`${recortados} texto(s) de más de ${MAXIMO_TEXTO.toLocaleString('es')} caracteres, el máximo de una celda de Excel, se recortaron`);
    return { trozos, avisos };
}
