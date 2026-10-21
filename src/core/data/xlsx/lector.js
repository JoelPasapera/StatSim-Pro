// @ts-check
// core/data/xlsx/lector.js — (2026.12.31) lectura de libros de Excel (.xlsx y .xlsm: SpreadsheetML de Office Open XML,
// ISO/IEC 29500, también en su variante «strict»), desde los bytes del archivo y sin bibliotecas: el ZIP con
// core/data/zip/lector.js y cada parte con una lectura propia de su XML (core/data/xlsx/xml.js). De cada hoja, sus celdas
// con su valor: números, textos (de las cadenas compartidas, en línea o resultado de una fórmula), verdadero o falso, y
// las fechas como texto «AAAA-MM-DD» (core/data/xlsx/fechas.js), que el estilo de la celda distingue de los números. Las
// celdas con error (#N/A, #DIV/0!…) y las fórmulas sin un resultado guardado quedan vacías, contadas. Sin DOM: funciona en
// la página, en un Worker y en Node.
// (2026.12.31, revisión) Con topes, antes de reservar memoria: lo que ocupa cada parte sin comprimir y el libro entero, las
// filas y columnas que admite Excel, y las casillas de una hoja (una celda en la columna XFD de muchas filas las reservaría
// todas); y el texto de una celda con muchos tramos de formato, en tiempo lineal.

import { esZip, extraerZip, listarZip } from '../zip/lector.js';
import { esFormatoDeFecha, fechaIsoATexto, serieAFecha } from './fechas.js';
import { tamanoLegible } from '../tamano.js';
import { MAXIMO_COLUMNAS, MAXIMO_FILAS, letrasDeColumna, referenciaACelda } from './referencias.js';
import { etiquetasXml, finDeEtiqueta, prefijoDe, textoXml } from './xml.js';

/**
 * @typedef {number | string | boolean | null} CeldaXlsx
 * @typedef {{
 *   nombre: string, oculta: boolean, filas: Array<CeldaXlsx[] | null>, columnas: number,
 *   celdas: number, errores: number, formulasSinValor: number, fechas: number
 * }} HojaXlsx
 *   filas: una por fila de la hoja hasta la última con algún valor (null si no tiene ninguno), cada una hasta su última
 *   celda con valor (null donde no hay); columnas: la fila más larga; celdas: las que tienen valor; errores: las que
 *   tienen un error de Excel; formulasSinValor: las fórmulas que el archivo guardó sin su resultado; fechas: las celdas
 *   que eran fechas
 * @typedef {{ hojas: HojaXlsx[], fecha1904: boolean, recalcular: boolean }} LibroXlsx
 *   recalcular: el libro pide a Excel que recalcule las fórmulas al abrirlo (lo escribió un programa, no Excel)
 * @typedef {{ nativo?: boolean, topes?: { parte?: number, libro?: number, casillas?: number } }} OpcionesLectura
 *   nativo: false obliga al descompresor propio; topes: otros (más bajos) que MAXIMO_PARTE, MAXIMO_LIBRO y MAXIMO_CASILLAS.
 *   Los dos, para las pruebas
 */

/** La ruta de una parte relativa a otra (las relaciones): «worksheets/sheet1.xml» desde «xl/workbook.xml». @param {string} desde @param {string} destino */
function resolverRuta(desde, destino) {
    if (destino.startsWith('/')) return destino.slice(1);
    const partes = desde.split('/').slice(0, -1);
    for (const p of destino.split('/')) {
        if (p === '..') partes.pop();
        else if (p !== '.' && p !== '') partes.push(p);
    }
    return partes.join('/');
}

/** Un destino de relación con sus «%20» decodificados (si están bien formados). @param {string} s */
function sinEscapesDeUri(s) {
    try { return decodeURI(s); } catch (e) { return s; }
}

/** Las relaciones de una parte: Id → { tipo, destino }. @param {string | null} xml @param {string} desde */
function leerRelaciones(xml, desde) {
    /** @type {Map<string, { tipo: string, destino: string }>} */
    const rel = new Map();
    if (!xml) return rel;
    for (const e of etiquetasXml(xml)) {
        if (e.tipo === 'abre' && e.nombre === 'Relationship' && e.atributos.Id && e.atributos.TargetMode !== 'External') {
            rel.set(e.atributos.Id, { tipo: e.atributos.Type || '', destino: resolverRuta(desde, sinEscapesDeUri(e.atributos.Target || '')) });
        }
    }
    return rel;
}

/** ¿Termina el nombre de una etiqueta con este carácter (espacio, «>» o «/»)? @param {number} c */
const terminaNombre = c => c === 62 || c === 47 || c === 32 || c === 9 || c === 10 || c === 13;

/**
 * El texto de una cadena (el interior de un <si> de las cadenas compartidas o de un <is> en línea): sus elementos <t>,
 * directos o dentro de tramos con formato (<r>), sin los de la guía fonética (<rPh>), que no son parte del texto.
 * @param {string} frag
 * @param {string} P el prefijo de los elementos
 * @returns {string}
 */
function textoDeCadena(frag, P) {
    const abreT = `<${P}t`, cierraT = `</${P}t>`, abreFon = `<${P}rPh`, cierraFon = `</${P}rPh>`;
    let texto = '', i = 0;
    // la próxima guía fonética: se busca una vez y de nuevo solo al dejarla atrás (buscarla desde cada <t>, hasta el final
    // cuando no hay ninguna, hacía cuadrática una celda con muchos tramos: 40 000 tramos, 46 s)
    let fon = frag.indexOf(abreFon);
    for (;;) {
        const t = frag.indexOf(abreT, i);
        if (t < 0) break;
        if (!terminaNombre(frag.charCodeAt(t + abreT.length))) { i = t + abreT.length; continue; }
        while (fon >= 0 && fon < i) fon = frag.indexOf(abreFon, fon + abreFon.length);
        if (fon >= 0 && fon < t) { const f = frag.indexOf(cierraFon, fon); i = f < 0 ? frag.length : f + cierraFon.length; continue; }
        const gt = finDeEtiqueta(frag, t);
        if (gt < 0) break;
        if (frag.charCodeAt(gt - 1) === 47) { i = gt + 1; continue; }   // <t/>
        const fin = frag.indexOf(cierraT, gt);
        if (fin < 0) break;
        texto += frag.slice(gt + 1, fin);
        i = fin + cierraT.length;
    }
    return textoXml(texto, true);
}

/** Las cadenas compartidas, en orden. @param {string | null} xml @returns {string[]} */
function leerCadenas(xml) {
    if (!xml) return [];
    const P = prefijoDe(xml, 'sst');
    const abreSi = `<${P}si`, cierraSi = `</${P}si>`;
    /** @type {string[]} */
    const cadenas = [];
    let i = 0;
    for (;;) {
        const si = xml.indexOf(abreSi, i);
        if (si < 0) break;
        if (!terminaNombre(xml.charCodeAt(si + abreSi.length))) { i = si + abreSi.length; continue; }
        const gt = finDeEtiqueta(xml, si);
        if (gt < 0) break;
        if (xml.charCodeAt(gt - 1) === 47) { cadenas.push(''); i = gt + 1; continue; }
        const fin = xml.indexOf(cierraSi, gt);
        if (fin < 0) break;
        cadenas.push(textoDeCadena(xml.slice(gt + 1, fin), P));
        i = fin + cierraSi.length;
    }
    return cadenas;
}

/** Qué estilos de celda (los índices de cellXfs) son de fecha. @param {string | null} xml @returns {boolean[]} */
function leerEstilos(xml) {
    if (!xml) return [];
    /** @type {Map<number, string>} */
    const formatos = new Map();
    /** @type {boolean[]} */
    const fechas = [];
    let dentro = '';
    for (const e of etiquetasXml(xml)) {
        if (e.tipo === 'abre' && (e.nombre === 'numFmts' || e.nombre === 'cellXfs' || e.nombre === 'cellStyleXfs')) { if (!e.vacia) dentro = e.nombre; continue; }
        if (e.tipo === 'cierra' && e.nombre === dentro) { dentro = ''; continue; }
        if (e.tipo !== 'abre') continue;
        if (dentro === 'numFmts' && e.nombre === 'numFmt') formatos.set(Number(e.atributos.numFmtId), e.atributos.formatCode ?? '');
        else if (dentro === 'cellXfs' && e.nombre === 'xf') {
            const id = Number(e.atributos.numFmtId || 0);
            fechas.push(esFormatoDeFecha(id, formatos.get(id)));
        }
    }
    return fechas;
}

/**
 * Los topes del libro, sin comprimir: cada parte (una hoja, las cadenas compartidas…), 256 MB —unos ocho millones de celdas,
 * más de lo que el Analizador puede tratar en un navegador; una cadena de JavaScript no pasa de unos 512 MB—, y las partes
 * que se leen, 512 MB entre todas.
 */
export const MAXIMO_PARTE = 256 * 1024 * 1024;
export const MAXIMO_LIBRO = 512 * 1024 * 1024;
/** Las casillas que reserva una hoja (cada fila, hasta su última celda con valor): 50 millones. */
export const MAXIMO_CASILLAS = 50000000;

// Los atributos r, s y t de la celda que se está leyendo (los fija leerAtributosDeCelda, sin crear un objeto por celda).
let atrR = '', atrS = '', atrT = '';

/**
 * Lee los atributos r (la referencia), s (el estilo) y t (el tipo) del interior de una etiqueta <c …>.
 * @param {string} xml
 * @param {number} i dónde empiezan los atributos
 * @param {number} hasta el «>» (o el «/» de «/>») de la etiqueta
 */
function leerAtributosDeCelda(xml, i, hasta) {
    atrR = ''; atrS = ''; atrT = '';
    while (i < hasta) {
        let c = xml.charCodeAt(i);
        while (i < hasta && (c === 32 || c === 9 || c === 10 || c === 13)) c = xml.charCodeAt(++i);
        if (i >= hasta) return;
        const nombre = i;
        while (i < hasta && c !== 61 && c !== 32 && c !== 9 && c !== 10 && c !== 13) c = xml.charCodeAt(++i);
        const finNombre = i;
        while (i < hasta && xml.charCodeAt(i) !== 61) i++;
        i++;
        while (i < hasta && ((c = xml.charCodeAt(i)) === 32 || c === 9 || c === 10 || c === 13)) i++;
        const comilla = xml.charCodeAt(i);
        if (comilla !== 34 && comilla !== 39) return;
        const fin = xml.indexOf(comilla === 34 ? '"' : "'", i + 1);
        if (fin < 0 || fin > hasta) return;
        if (finNombre - nombre === 1) {
            const valor = xml.slice(i + 1, fin);
            const n = xml.charCodeAt(nombre);
            if (n === 114) atrR = valor; else if (n === 115) atrS = valor; else if (n === 116) atrT = valor;
        }
        i = fin + 1;
    }
}

/**
 * Las celdas de una hoja, con una lectura directa de su XML (indexOf con el prefijo del documento: un recorrido etiqueta a
 * etiqueta sería demasiado lento para hojas de cientos de miles de filas).
 * @param {string} xml
 * @param {{ cadenas: string[], estilosFecha: boolean[], fecha1904: boolean, recalcular: boolean, maximoCasillas: number }} libro
 * @param {string} nombre
 * @param {boolean} oculta
 * @returns {HojaXlsx}
 */
function leerHoja(xml, libro, nombre, oculta) {
    const { cadenas, estilosFecha, fecha1904, recalcular, maximoCasillas } = libro;
    const P = prefijoDe(xml, 'worksheet');
    /** @type {Array<CeldaXlsx[] | null>} */
    const filas = [];
    let columnas = 0, celdas = 0, errores = 0, formulasSinValor = 0, fechas = 0;
    const hoja = () => ({ nombre, oculta, filas, columnas, celdas, errores, formulasSinValor, fechas });
    const inicioDatos = xml.indexOf(`<${P}sheetData`);
    if (inicioDatos < 0) return hoja();
    const abreFila = `<${P}row`, abreC = `<${P}c`, cierraC = `</${P}c>`, abreV = `<${P}v`, cierraV = `</${P}v>`;
    const abreIs = `<${P}is`, cierraIs = `</${P}is>`, abreF = `<${P}f`;
    const finDatos = xml.indexOf(`</${P}sheetData>`, inicioDatos);
    const limite = finDatos < 0 ? xml.length : finDatos;
    let fila = -1, col = -1, i = inicioDatos, casillas = 0;
    const danada = (/** @type {string} */ que) => new Error(`El libro de Excel está dañado: la hoja «${nombre}» tiene ${que}. Vuelve a guardarlo en Excel, o a descargarlo si te lo enviaron`);
    while (i < limite) {
        const lt = xml.indexOf('<', i + 1);
        if (lt < 0 || lt >= limite) break;
        i = lt;
        if (xml.startsWith(abreFila, lt) && terminaNombre(xml.charCodeAt(lt + abreFila.length))) {
            const gt = finDeEtiqueta(xml, lt);
            if (gt < 0) break;
            const r = /\sr\s*=\s*["'](\d+)["']/.exec(xml.slice(lt, gt));
            fila = r ? Number(r[1]) - 1 : fila + 1;
            if (fila >= MAXIMO_FILAS) throw danada(`una fila más allá de la última de Excel (la ${MAXIMO_FILAS.toLocaleString('es')})`);
            col = -1;
            i = gt;
            continue;
        }
        if (!xml.startsWith(abreC, lt) || !terminaNombre(xml.charCodeAt(lt + abreC.length))) continue;
        const gt = finDeEtiqueta(xml, lt);
        if (gt < 0) break;
        const vacia = xml.charCodeAt(gt - 1) === 47;
        leerAtributosDeCelda(xml, lt + abreC.length, vacia ? gt - 1 : gt);
        const pos = atrR ? referenciaACelda(atrR) : null;
        if (pos) { fila = pos.fila; col = pos.columna; }
        else {
            if (fila < 0) fila = 0;
            if (++col >= MAXIMO_COLUMNAS) throw danada(`una celda más allá de la última columna de Excel (la ${letrasDeColumna(MAXIMO_COLUMNAS - 1)})`);
        }
        if (vacia) { i = gt; continue; }   // <c …/>: sin valor
        const fin = xml.indexOf(cierraC, gt);
        if (fin < 0) break;
        i = fin;
        // lo de dentro de la celda, aparte: buscar en todo el documento un <f> que la celda no tiene costaría recorrerlo
        // entero en cada celda
        const dentro = xml.slice(gt + 1, fin);
        const tipo = atrT || 'n';
        /** @type {CeldaXlsx} */
        let valor = null;
        if (tipo === 'inlineStr') {
            const is = dentro.indexOf(abreIs);
            if (is >= 0) { const finIs = dentro.indexOf(cierraIs, is); valor = textoDeCadena(finIs < 0 ? dentro.slice(is) : dentro.slice(is, finIs), P); }
        } else {
            /** @type {string | null} */
            let texto = null;
            for (let v = dentro.indexOf(abreV); v >= 0; v = dentro.indexOf(abreV, v + 1)) {
                if (!terminaNombre(dentro.charCodeAt(v + abreV.length))) continue;   // otro elemento que empieza por v
                const gv = finDeEtiqueta(dentro, v);
                if (gv < 0 || dentro.charCodeAt(gv - 1) === 47) break;   // <v/>: vacío
                const fv = dentro.indexOf(cierraV, gv);
                if (fv < 0) break;
                texto = dentro.slice(gv + 1, fv);
                break;
            }
            const f = dentro.indexOf(abreF);
            const conFormula = f >= 0 && terminaNombre(dentro.charCodeAt(f + abreF.length));
            if (texto === null || (conFormula && texto === '')) {
                if (conFormula) formulasSinValor++;
            } else if (tipo === 's') {
                const k = Number(texto);
                valor = Number.isInteger(k) && k >= 0 && k < cadenas.length ? /** @type {string} */ (cadenas[k]) : null;
            } else if (tipo === 'str') valor = textoXml(texto, true);
            else if (tipo === 'b') valor = texto.trim() === '1' || texto.trim().toLowerCase() === 'true';
            else if (tipo === 'e') errores++;
            else if (tipo === 'd') { valor = fechaIsoATexto(textoXml(texto)); if (valor) fechas++; }
            else {
                const x = texto.trim() === '' ? NaN : Number(texto);
                // un programa que pide recalcular al abrir guarda 0 como resultado provisional de sus fórmulas: no es un dato
                if (conFormula && recalcular && x === 0) formulasSinValor++;
                else if (Number.isFinite(x)) {
                    const comoFecha = atrS && estilosFecha[Number(atrS)] ? serieAFecha(x, fecha1904) : null;
                    if (comoFecha !== null) { valor = comoFecha; fechas++; }
                    else valor = x === 0 ? 0 : x;   // «-0» (openpyxl lo escribe así) es 0
                }
            }
        }
        if (valor === null || valor === '') continue;
        while (filas.length <= fila) filas.push(null);
        let actual = filas[fila];
        if (!actual) { actual = []; filas[fila] = actual; }
        if (col >= actual.length) {
            casillas += col + 1 - actual.length;
            if (casillas > maximoCasillas) throw new Error(`La hoja «${nombre}» es demasiado grande para leerla aquí: sus filas llegan hasta columnas tan a la derecha como la ${letrasDeColumna(col)} (más de ${(maximoCasillas / 1e6).toLocaleString('es')} millones de casillas). Guarda como CSV solo las columnas que necesitas, o bórrale las celdas sueltas de la derecha`);
        }
        while (actual.length < col) actual.push(null);
        actual[col] = valor;
        celdas++;
        if (col + 1 > columnas) columnas = col + 1;
    }
    return hoja();
}

/** ¿Aparece este nombre de flujo (en UTF-16LE, como los guarda un archivo compuesto de Office) en los bytes? @param {Uint8Array} bytes @param {string} nombre */
function tieneFlujo(bytes, nombre) {
    const patron = new Uint8Array(nombre.length * 2);
    for (let k = 0; k < nombre.length; k++) patron[2 * k] = nombre.charCodeAt(k);
    const n = bytes.length - patron.length;
    for (let i = bytes.indexOf(/** @type {number} */ (patron[0])); i >= 0 && i <= n; i = bytes.indexOf(/** @type {number} */ (patron[0]), i + 1)) {
        let k = 1;
        while (k < patron.length && bytes[i + k] === patron[k]) k++;
        if (k === patron.length) return true;
    }
    return false;
}

/**
 * ¿Qué otro formato es? Un mensaje que diga qué hacer, o null.
 * @param {Uint8Array} bytes
 * @param {Array<{ nombre: string }>} [entradas] las del ZIP, si lo es
 * @returns {string | null}
 */
function otroFormato(bytes, entradas) {
    // un archivo compuesto de Office (OLE): un .xls de Excel 97-2003, o un .xlsx protegido con contraseña de apertura
    if (bytes.length >= 8 && bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0 && bytes[4] === 0xA1 && bytes[5] === 0xB1 && bytes[6] === 0x1A && bytes[7] === 0xE1) {
        if (tieneFlujo(bytes, 'EncryptedPackage')) return 'El libro de Excel está protegido con contraseña de apertura: ábrelo en Excel, quítale la contraseña (Archivo → Información → Proteger libro → Cifrar con contraseña, y bórrala) y vuelve a guardarlo';
        if (tieneFlujo(bytes, 'Workbook') || tieneFlujo(bytes, 'Book')) return 'Es un libro de Excel 97-2003 (.xls), un formato binario que no se lee aquí: ábrelo en Excel o en LibreOffice y guárdalo como «Libro de Excel (.xlsx)», o como CSV';
        return 'Es un archivo binario de Office, no un libro de Excel (.xlsx)';
    }
    if (!entradas) return null;
    if (entradas.some(e => e.nombre === 'mimetype') && entradas.some(e => e.nombre === 'content.xml')) {
        return 'Es una hoja de cálculo de OpenDocument (.ods, de LibreOffice o de Google): guárdala como «Libro de Excel 2007-365 (.xlsx)» o como CSV';
    }
    if (entradas.some(e => /^xl\/workbook\.bin$/i.test(e.nombre))) {
        return 'Es un libro binario de Excel (.xlsb), que no se lee aquí: ábrelo en Excel y guárdalo como «Libro de Excel (.xlsx)», o como CSV';
    }
    if (entradas.some(e => /^word\//i.test(e.nombre))) return 'Es un documento de Word, no un libro de Excel';
    if (entradas.some(e => /^ppt\//i.test(e.nombre))) return 'Es una presentación de PowerPoint, no un libro de Excel';
    return null;
}

/**
 * Un error del ZIP (core/data/zip) dicho como lo que es para quien abre el libro: qué pasa y qué hacer.
 * @param {unknown} e
 * @returns {Error}
 */
function libroDanado(e) {
    const detalle = String(e instanceof Error ? e.message : e).replace(/^ZIP: /, '');
    if (/está cifrada$/.test(detalle)) return new Error('El libro de Excel está cifrado de una forma que no se lee aquí: quítale la contraseña en Excel y vuelve a guardarlo');
    return new Error(`El libro de Excel está dañado o incompleto: ${detalle}. Vuelve a guardarlo en Excel, o a descargarlo si te lo enviaron`);
}

/**
 * Lee un libro de Excel.
 * @param {Uint8Array} bytes
 * @param {OpcionesLectura} [opciones]
 * @returns {Promise<LibroXlsx>}
 */
export async function leerXlsx(bytes, opciones = {}) {
    if (!esZip(bytes)) throw new Error(otroFormato(bytes) || 'No es un libro de Excel (.xlsx): su contenido no es el de un archivo de Office');
    /** @type {import('../zip/lector.js').EntradaZip[]} */
    let entradas;
    try { entradas = listarZip(bytes); } catch (e) { throw libroDanado(e); }
    const otro = otroFormato(bytes, entradas);
    if (otro) throw new Error(otro);
    /** @type {Map<string, import('../zip/lector.js').EntradaZip>} */
    const porRuta = new Map(entradas.map(e => [e.nombre.toLowerCase(), e]));
    const decodificador = new TextDecoder('utf-8');
    const topes = opciones.topes || {};
    const maximoParte = topes.parte ?? MAXIMO_PARTE, maximoLibro = topes.libro ?? MAXIMO_LIBRO, maximoCasillas = topes.casillas ?? MAXIMO_CASILLAS;
    let leidos = 0;
    /** @param {import('../zip/lector.js').EntradaZip} e */
    const demasiado = e => new Error(`El libro de Excel es demasiado grande para leerlo aquí: «${e.nombre}» ocupa ${tamanoLegible(e.tamano)} sin comprimir. Guarda la hoja que necesitas como CSV y cárgala así`);
    /** @param {string} ruta @returns {Promise<string | null>} */
    const leerParte = async ruta => {
        const e = porRuta.get(ruta.toLowerCase());
        if (!e) return null;
        // lo que no cabe en una cadena del navegador, o el libro en su memoria, se dice antes de reservarla
        if (e.tamano > maximoParte) throw demasiado(e);
        leidos += e.tamano;
        if (leidos > maximoLibro) throw new Error(`El libro de Excel es demasiado grande para leerlo aquí: sus hojas ocupan más de ${tamanoLegible(maximoLibro)} sin comprimir. Guarda la hoja que necesitas como CSV y cárgala así`);
        /** @type {Uint8Array} */
        let datos;
        try { datos = await extraerZip(bytes, e, { nativo: opciones.nativo }); } catch (err) { throw libroDanado(err); }
        try { return decodificador.decode(datos); } catch (err) { throw demasiado(e); }   // una cadena más larga de lo que admite el navegador
    };
    // el libro: el que señala la relación officeDocument del paquete (casi siempre xl/workbook.xml)
    const relPaquete = leerRelaciones(await leerParte('_rels/.rels'), '');
    let rutaLibro = 'xl/workbook.xml';
    for (const r of relPaquete.values()) if (/\/officeDocument$/.test(r.tipo)) { rutaLibro = r.destino; break; }
    const libro = await leerParte(rutaLibro);
    if (libro === null) throw new Error('No es un libro de Excel (.xlsx): le falta la parte del libro (xl/workbook.xml)');
    const barra = rutaLibro.lastIndexOf('/');
    const carpeta = barra < 0 ? '' : rutaLibro.slice(0, barra + 1);
    const relLibro = leerRelaciones(await leerParte(`${carpeta}_rels/${rutaLibro.slice(barra + 1)}.rels`), rutaLibro);
    let fecha1904 = false, recalcular = false;
    /** @type {Array<{ nombre: string, id: string, oculta: boolean }>} */
    const declaradas = [];
    for (const e of etiquetasXml(libro)) {
        if (e.tipo !== 'abre') continue;
        if (e.nombre === 'workbookPr') fecha1904 = e.atributos.date1904 === '1' || e.atributos.date1904 === 'true';
        else if (e.nombre === 'calcPr') recalcular = e.atributos.fullCalcOnLoad === '1' || e.atributos.fullCalcOnLoad === 'true';
        else if (e.nombre === 'sheet') declaradas.push({ nombre: e.atributos.name || `Hoja${declaradas.length + 1}`, id: e.atributos.id || '', oculta: !!e.atributos.state && e.atributos.state !== 'visible' });
    }
    /** @param {RegExp} tipo @param {string} porOmision */
    const destinoDe = (tipo, porOmision) => {
        for (const r of relLibro.values()) if (tipo.test(r.tipo)) return r.destino;
        return porOmision;
    };
    const cadenas = leerCadenas(await leerParte(destinoDe(/\/sharedStrings$/, `${carpeta}sharedStrings.xml`)));
    const estilosFecha = leerEstilos(await leerParte(destinoDe(/\/styles$/, `${carpeta}styles.xml`)));
    /** @type {HojaXlsx[]} */
    const hojas = [];
    for (const d of declaradas) {
        const rel = relLibro.get(d.id);
        if (!rel || !/\/worksheet$/.test(rel.tipo)) continue;   // las hojas de gráfico y de macros no tienen celdas
        const xml = await leerParte(rel.destino);
        if (xml !== null) hojas.push(leerHoja(xml, { cadenas, estilosFecha, fecha1904, recalcular, maximoCasillas }, d.nombre, d.oculta));
    }
    if (!hojas.length) throw new Error('El libro de Excel no tiene ninguna hoja de cálculo');
    return { hojas, fecha1904, recalcular };
}
