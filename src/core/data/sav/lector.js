// @ts-check
// core/data/sav/lector.js — lee un archivo de datos de SPSS (.sav o .zsav) desde cero, sin bibliotecas: el diccionario
// (nombres largos, etiquetas de variable y de valor, valores perdidos, formatos, niveles de medida, documentos,
// codificación) y los casos, sin comprimir, con la compresión por bytes o con la de zlib (.zsav), en cualquier orden de
// bytes. (2026.12.29) Formato: «System File Format» del manual de desarrolladores de GNU PSPP; donde el formato admite
// dudas (las cadenas muy largas, las páginas de código), se sigue a ReadStat, la biblioteca de haven y pyreadstat. Lo
// que lee se compara con lo que lee ReadStat en archivos escritos por SPSS (tests/oracle/sav_oraculo.sh).
// Sin DOM: funciona en la página, en un Worker y en Node (el .zsav usa DecompressionStream).

import { ALINEACION, FORMATOS, FORMATOS_CON_HORA, FORMATOS_FECHA, HIGHEST, LOWEST, MEDIDA, REGISTRO, SUBTIPO, SYSMIS, codificacionDelArchivo } from './formato.js';
import { decodificadorPara } from '../codificacion.js';
import { inflarDeflate } from '../zip/inflate.js';
import { DEMASIADO_LARGA, hayDescompresorNativo, inflarNativo, tamanoPosible } from '../zip/nativo.js';
import { tamanoLegible } from '../tamano.js';

/**
 * @typedef {'nominal' | 'ordinal' | 'escala'} MedidaSav
 * @typedef {{ valores: Array<number | string>, rango: [number, number] | null }} PerdidosSav
 *   los valores perdidos declarados por el usuario: hasta tres valores, o un rango y como mucho un valor
 * @typedef {{
 *   nombre: string, etiqueta: string, tipo: 'numerica' | 'texto', ancho: number,
 *   formato: string, decimales: number, fecha: boolean, conHora: boolean,
 *   medida: MedidaSav | null, alineacion: 'izquierda' | 'derecha' | 'centro' | null, columnas: number | null,
 *   etiquetasValor: Array<[number | string, string]>, perdidos: PerdidosSav
 * }} VariableLeida
 * @typedef {{
 *   variables: VariableLeida[], n: number, datos: Array<Float64Array | string[]>,
 *   codificacion: string, etiquetaArchivo: string, creado: string, producto: string, documentos: string[],
 *   ponderacion: string, compresion: 0 | 1 | 2, granEndian: boolean, avisos: string[]
 * }} ArchivoSav
 *   datos: una columna por variable (las numéricas, con NaN en el perdido del sistema; los perdidos del usuario conservan
 *   su valor: esPerdidoSav los reconoce). ponderacion: el nombre de la variable de ponderación ('' si no hay).
 */

/** Error con el mensaje para el usuario. @param {string} mensaje */
const errorSav = mensaje => new Error(`Archivo de SPSS no válido: ${mensaje}`);

/**
 * (2026.12.31, revisión) El tope de los datos de un .zsav sin comprimir, 1 GB: más no cabría en la memoria del navegador al
 * convertirlos en casos. Se comprueba, con lo que declara su índice, antes de reservar nada.
 */
export const MAXIMO_ZSAV = 1024 * 1024 * 1024;

/** Lector secuencial de un ArrayBuffer con el orden de bytes del archivo. */
class Cursor {
    /** @param {Uint8Array} bytes @param {boolean} le */
    constructor(bytes, le) {
        this.bytes = bytes;
        this.vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        this.le = le;
        this.p = 0;
    }
    /** @param {number} k */
    exigir(k) { if (this.p + k > this.bytes.length) throw errorSav('el archivo termina antes de tiempo (¿está incompleto?)'); }
    i32() { this.exigir(4); const v = this.vista.getInt32(this.p, this.le); this.p += 4; return v; }
    u8() { this.exigir(1); return this.bytes[this.p++]; }
    f64() { this.exigir(8); const v = this.vista.getFloat64(this.p, this.le); this.p += 8; return v; }
    i64() {
        this.exigir(8);
        const v = this.vista.getBigInt64(this.p, this.le);
        this.p += 8;
        return Number(v);
    }
    /** @param {number} k */
    trozo(k) { this.exigir(k); const t = this.bytes.subarray(this.p, this.p + k); this.p += k; return t; }
    /** @param {number} k */
    saltar(k) { this.exigir(k); this.p += k; }
}

/** El número de un trozo de 8 bytes. @param {Uint8Array} b @param {boolean} le */
function doble(b, le) { return new DataView(b.buffer, b.byteOffset, 8).getFloat64(0, le); }

/** Texto sin los espacios (ni los nulos) del final. @param {string} t */
const sinRelleno = t => t.replace(/[ \u0000]+$/, '');

/**
 * Los bytes de UTF-8 sin la secuencia incompleta del final, si la hay: SPSS corta las cadenas por bytes y puede partir un
 * carácter (ReadStat lo descarta en vez de convertirlo en «�»).
 * @param {Uint8Array} b
 */
function sinSecuenciaIncompleta(b) {
    let i = b.length - 1, continuaciones = 0;
    while (i >= 0 && (b[i] & 0xC0) === 0x80 && continuaciones < 3) { i--; continuaciones++; }
    if (i < 0) return b;
    const inicio = b[i], necesita = inicio >= 0xF0 ? 4 : inicio >= 0xE0 ? 3 : inicio >= 0xC0 ? 2 : 1;
    return necesita > continuaciones + 1 ? b.subarray(0, i) : b;
}

/**
 * Lee un archivo .sav o .zsav.
 * @param {ArrayBuffer | Uint8Array} entrada
 * @param {{ nativo?: boolean }} [opciones] nativo: false obliga al descompresor propio en un .zsav (las pruebas)
 * @returns {Promise<ArchivoSav>}
 */
export async function leerSav(entrada, opciones = {}) {
    const bytes = entrada instanceof Uint8Array ? entrada : new Uint8Array(entrada);
    if (bytes.length < 176) throw errorSav('es demasiado corto para tener la cabecera');
    const magia = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    if (magia !== '$FL2' && magia !== '$FL3') throw errorSav('no empieza como un archivo de datos de SPSS ($FL2): ¿es un .sav?');
    const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const disposicionLE = vista.getInt32(64, true), disposicionBE = vista.getInt32(64, false);
    const le = disposicionLE === 2 || disposicionLE === 3 ? true : (disposicionBE === 2 || disposicionBE === 3 ? false : true);
    const c = new Cursor(bytes, le);
    /** @type {string[]} */
    const avisos = [];

    // 1) La cabecera.
    c.saltar(4);
    const producto = c.trozo(60);
    c.saltar(4);                                 // layout_code (ya leído)
    const elementosDeclarados = c.i32();
    const compresion = c.i32();
    const indicePeso = c.i32();
    let n = c.i32();
    const sesgo = c.f64();
    const fechaCreacion = c.trozo(9), horaCreacion = c.trozo(8), etiquetaArchivo = c.trozo(64);
    c.saltar(3);
    if (compresion !== 0 && compresion !== 1 && compresion !== 2) throw errorSav(`compresión desconocida (${compresion})`);
    if (magia === '$FL3' && compresion !== 2) avisos.push('cabecera $FL3 sin la compresión zlib');

    // 2) El diccionario.
    /** @typedef {{ tipo: number, nombre: Uint8Array, etiqueta: Uint8Array | null, nPerdidos: number, perdidos: Uint8Array[], impresion: number }} Elemento */
    /** @type {Elemento[]} */
    const elementos = [];
    /** @type {Array<{ pares: Array<[Uint8Array, Uint8Array]>, indices: number[] }>} */
    const conjuntos = [];
    /** @type {Uint8Array[]} */
    const documentos = [];
    /** @type {Map<number, Uint8Array>} */
    const extensiones = new Map();
    /** @type {Map<number, { tamano: number, cuenta: number }>} */
    const tamanosExtension = new Map();
    for (;;) {
        const tipo = c.i32();
        if (tipo === REGISTRO.VARIABLE) {
            const t = c.i32(), conEtiqueta = c.i32(), nPerdidos = c.i32(), impresion = c.i32();
            c.saltar(4);                         // formato de escritura
            const nombre = c.trozo(8);
            let etiqueta = null;
            if (conEtiqueta === 1) {
                const largo = c.i32();
                if (largo < 0 || largo > 65535) throw errorSav('una etiqueta de variable con una longitud imposible');
                etiqueta = c.trozo(largo);
                c.saltar((Math.ceil(largo / 4) * 4) - largo);
            }
            /** @type {Uint8Array[]} */
            const perdidos = [];
            const k = Math.abs(nPerdidos);
            if (k > 3) throw errorSav('una variable con más de tres valores perdidos');
            for (let j = 0; j < k; j++) perdidos.push(c.trozo(8));
            elementos.push({ tipo: t, nombre, etiqueta, nPerdidos, perdidos, impresion });
        } else if (tipo === REGISTRO.ETIQUETAS_VALOR) {
            const cuenta = c.i32();
            if (cuenta < 0 || cuenta > 1e6) throw errorSav('un registro de etiquetas de valor con una cuenta imposible');
            /** @type {Array<[Uint8Array, Uint8Array]>} */
            const pares = [];
            for (let j = 0; j < cuenta; j++) {
                const valor = c.trozo(8);
                const largo = c.u8();
                const etiqueta = c.trozo(largo);
                c.saltar(Math.ceil((largo + 1) / 8) * 8 - (largo + 1));
                pares.push([valor, etiqueta]);
            }
            if (c.i32() !== REGISTRO.INDICES_ETIQUETAS) throw errorSav('a unas etiquetas de valor no les sigue la lista de sus variables');
            const nv = c.i32();
            if (nv < 0 || nv > 1e6) throw errorSav('una lista de variables con una cuenta imposible');
            const indices = [];
            for (let j = 0; j < nv; j++) indices.push(c.i32());
            conjuntos.push({ pares, indices });
        } else if (tipo === REGISTRO.DOCUMENTO) {
            const lineas = c.i32();
            if (lineas < 0 || lineas > 1e6) throw errorSav('un documento con una cuenta de líneas imposible');
            for (let j = 0; j < lineas; j++) documentos.push(c.trozo(80));
        } else if (tipo === REGISTRO.EXTENSION) {
            const subtipo = c.i32(), tamano = c.i32(), cuenta = c.i32();
            const largo = tamano * cuenta;
            if (tamano < 0 || cuenta < 0 || largo > c.bytes.length) throw errorSav(`un registro de extensión (${subtipo}) con un tamaño imposible`);
            extensiones.set(subtipo, c.trozo(largo));
            tamanosExtension.set(subtipo, { tamano, cuenta });
        } else if (tipo === REGISTRO.FIN) {
            c.saltar(4);
            break;
        } else throw errorSav(`un registro desconocido (tipo ${tipo}) en el diccionario`);
    }
    const inicioDatos = c.p;

    // 3) La codificación: la del registro 7.20 o la página de código del 7.3.
    const vistaDe = (/** @type {Uint8Array} */ b) => new DataView(b.buffer, b.byteOffset, b.byteLength);
    let pagina = 0;
    const enteros = extensiones.get(SUBTIPO.ENTEROS);
    if (enteros && enteros.length >= 32) pagina = vistaDe(enteros).getInt32(28, le);
    const nombreCodificacion = extensiones.has(SUBTIPO.CODIFICACION) ? new TextDecoder('latin1').decode(extensiones.get(SUBTIPO.CODIFICACION)) : '';
    const lectura = codificacionDelArchivo(nombreCodificacion, pagina), codificacion = lectura.etiqueta;
    if (!lectura.conocida) avisos.push(`el archivo declara la codificación «${lectura.declarada}», que no se reconoce: sus textos se leyeron como windows-1252 y algún carácter puede verse mal`);
    const decodificador = decodificadorPara(codificacion);   // (windows-1252, con la tabla propia: la de Node lee mal 0x80–0x9F)
    const texto = (/** @type {Uint8Array | null | undefined} */ b) => (b ? decodificador.decode(b) : '');

    // 4) Las variables: un registro con tipo ≥ 0 abre una; los de tipo −1 son sus continuaciones (8 bytes más de cadena).
    /** @typedef {{ e: Elemento, primero: number, elementos: number, ancho: number, segmentos: number, corto: string, nombre: string, medida: MedidaSav | null, alineacion: 'izquierda' | 'derecha' | 'centro' | null, columnas: number | null, etiquetasValor: Array<[number | string, string]>, perdidos: PerdidosSav, segmentoDe: boolean }} VariableCruda */
    /** @type {VariableCruda[]} */
    const crudas = [];
    for (let i = 0; i < elementos.length; i++) {
        const e = elementos[i];
        if (e.tipo === -1) {
            const ultima = crudas[crudas.length - 1];
            if (!ultima || ultima.e.tipo <= 0) throw errorSav('una continuación de cadena sin cadena');
            ultima.elementos++;
            continue;
        }
        if (e.tipo < 0 || e.tipo > 255) throw errorSav(`una variable de tipo ${e.tipo}`);
        crudas.push({ e, primero: i, elementos: 1, ancho: e.tipo, segmentos: 1, corto: sinRelleno(texto(e.nombre)), nombre: '', medida: null, alineacion: null, columnas: null, etiquetasValor: [], perdidos: { valores: [], rango: null }, segmentoDe: false });
    }
    if (!crudas.length) throw errorSav('no tiene variables');
    const elementosPorCaso = elementos.length;
    if (elementosDeclarados !== -1 && elementosDeclarados !== elementosPorCaso) avisos.push(`la cabecera dice ${elementosDeclarados} elementos por caso y el diccionario tiene ${elementosPorCaso}`);

    // 4a) La visualización (7.11): una entrada por variable del diccionario, contando cada segmento de las cadenas muy
    //     largas, con la medida, el ancho de columna (si son 3 valores) y la alineación.
    const visual = extensiones.get(SUBTIPO.VISUALIZACION);
    if (visual) {
        const cuenta = visual.length / 4, vv = vistaDe(visual);
        const porVariable = cuenta === 3 * crudas.length ? 3 : (cuenta === 2 * crudas.length ? 2 : 0);
        if (!porVariable) avisos.push('el registro de visualización no coincide con el número de variables: se ignora');
        else crudas.forEach((v, k) => {
            const base = k * porVariable * 4;
            v.medida = MEDIDA[vv.getInt32(base, le)] || null;
            if (porVariable === 3) v.columnas = vv.getInt32(base + 4, le);
            v.alineacion = ALINEACION[vv.getInt32(base + (porVariable - 1) * 4, le)] || null;
        });
    }

    // 4b) Los nombres largos (7.13): «CORTO=Largo» separados por tabuladores.
    /** @type {Map<string, string>} */
    const largos = new Map();
    if (extensiones.has(SUBTIPO.NOMBRES_LARGOS)) {
        texto(extensiones.get(SUBTIPO.NOMBRES_LARGOS)).split('\t').forEach(par => {
            const igual = par.indexOf('=');
            if (igual > 0) largos.set(par.slice(0, igual).toUpperCase(), sinRelleno(par.slice(igual + 1)));
        });
    }
    crudas.forEach(v => { v.nombre = largos.get(v.corto.toUpperCase()) || v.corto; });

    // 4c) Las cadenas muy largas (7.14): «CORTO=ancho» separados por «\0\t»; una cadena de ancho W ocupa ⌈W/252⌉
    //     variables seguidas (segmentos), cada una de 255 bytes útiles; se funden en la primera.
    if (extensiones.has(SUBTIPO.CADENAS_MUY_LARGAS)) {
        texto(extensiones.get(SUBTIPO.CADENAS_MUY_LARGAS)).split('\t').forEach(par => {
            const limpio = par.replace(/\u0000/g, '');
            const igual = limpio.indexOf('=');
            if (igual <= 0) return;
            const corto = limpio.slice(0, igual).toUpperCase(), ancho = parseInt(limpio.slice(igual + 1), 10);
            const k = crudas.findIndex(v => v.corto.toUpperCase() === corto && !v.segmentoDe);
            if (k < 0 || !(ancho > 255)) return;
            const segmentos = Math.ceil(ancho / 252);
            if (k + segmentos > crudas.length) { avisos.push(`la cadena muy larga «${corto}» no tiene todos sus segmentos`); return; }
            crudas[k].ancho = ancho;
            crudas[k].segmentos = segmentos;
            for (let j = 1; j < segmentos; j++) { crudas[k].elementos += crudas[k + j].elementos; crudas[k + j].segmentoDe = true; }
        });
    }
    const variables = crudas.filter(v => !v.segmentoDe);
    /** @type {Map<number, VariableCruda>} */
    const porPrimerElemento = new Map(variables.map(v => [v.primero + 1, v]));

    // 4d) Los valores perdidos del usuario: hasta 3 valores (nPerdidos 1–3), un rango (−2) o un rango y un valor (−3).
    for (const v of variables) {
        const { nPerdidos, perdidos } = v.e;
        if (!nPerdidos) continue;
        if (v.ancho > 0) { v.perdidos.valores = perdidos.map(b => sinRelleno(texto(b))); continue; }
        const nums = perdidos.map(b => doble(b, le));
        if (nPerdidos > 0) v.perdidos.valores = nums;
        else {
            // (2026.12.29, revisión) «LO THRU x» y «x THRU HI» con sus extremos infinitos, como los lee ReadStat
            const extremo = (/** @type {number} */ x) => (x === LOWEST || x === SYSMIS ? -Infinity : x === HIGHEST ? Infinity : x);
            v.perdidos.rango = [extremo(/** @type {number} */ (nums[0])), extremo(/** @type {number} */ (nums[1]))];
            if (nPerdidos === -3) v.perdidos.valores = [/** @type {number} */ (nums[2])];
        }
    }
    // 7.22: los perdidos de las cadenas de más de 8 bytes.
    const perdidosLargos = extensiones.get(SUBTIPO.PERDIDOS_CADENA_LARGA);
    if (perdidosLargos) {
        const r = new Cursor(perdidosLargos, le), vista = vistaDe(perdidosLargos);
        try {
            while (r.p < perdidosLargos.length) {
                const nombre = texto(r.trozo(r.i32()));
                const cuenta = r.u8();
                const largo = r.i32();
                const valores = [];
                for (let j = 0; j < cuenta; j++) {
                    // (2026.12.29, revisión) las versiones antiguas de PSPP repetían el largo (8) antes de CADA valor: se salta,
                    // como hacen ReadStat y el propio PSPP (antes, el segundo perdido salía como «\b\0\0\0NR»)
                    if (j > 0 && largo === 8 && r.p + 4 + largo <= perdidosLargos.length && vista.getInt32(r.p, le) === largo) r.saltar(4);
                    valores.push(sinRelleno(texto(r.trozo(largo))));
                }
                const v = variables.find(x => x.nombre === nombre);
                if (v && v.ancho > 0) v.perdidos.valores = valores;
            }
        } catch (e) { avisos.push('el registro de valores perdidos de las cadenas largas está dañado: se ignora el resto'); }
    }

    // 4e) Las etiquetas de valor (3 + 4): los índices son el primer elemento de cada variable (desde 1).
    for (const { pares, indices } of conjuntos) {
        for (const indice of indices) {
            const v = porPrimerElemento.get(indice);
            if (!v) { avisos.push(`unas etiquetas de valor apuntan a una variable inexistente (${indice})`); continue; }
            // (2026.12.29, revisión) las etiquetas sin los espacios del final, como ReadStat («Joven  » → «Joven»)
            for (const [valor, etiqueta] of pares) v.etiquetasValor.push([v.ancho > 0 ? sinRelleno(texto(valor)) : doble(valor, le), sinRelleno(texto(etiqueta))]);
        }
    }
    // 7.21: las etiquetas de valor de las cadenas de más de 8 bytes.
    const etiquetasLargas = extensiones.get(SUBTIPO.ETIQUETAS_CADENA_LARGA);
    if (etiquetasLargas) {
        const r = new Cursor(etiquetasLargas, le);
        try {
            while (r.p < etiquetasLargas.length) {
                const nombre = texto(r.trozo(r.i32()));
                r.i32();                         // el ancho de la variable
                const cuenta = r.i32();
                const v = variables.find(x => x.nombre === nombre);
                for (let j = 0; j < cuenta; j++) {
                    const valor = sinRelleno(texto(r.trozo(r.i32())));
                    const etiqueta = sinRelleno(texto(r.trozo(r.i32())));
                    if (v) v.etiquetasValor.push([valor, etiqueta]);
                }
            }
        } catch (e) { avisos.push('el registro de etiquetas de las cadenas largas está dañado: se ignora el resto'); }
    }

    // 5) El número de casos: el de la cabecera o, si falta (−1), el del registro 7.16.
    const casos64 = extensiones.get(SUBTIPO.CASOS_64);
    if (n < 0 && casos64 && casos64.length >= 16) n = Number(vistaDe(casos64).getBigInt64(8, le));

    // 6) Los casos.
    let flujo;
    if (compresion === 2) flujo = await descomprimirZlib(bytes, inicioDatos, le, opciones.nativo !== false);
    else flujo = bytes.subarray(inicioDatos);
    const lector = new LectorElementos(flujo, compresion !== 0, sesgo, le);
    const hayN = n >= 0;
    // Cuántos casos caben como mucho en los datos (comprimidos, cada elemento ocupa al menos un byte; sin comprimir, 8):
    // así una cabecera dañada, con un número de casos enorme, no reserva memoria de más.
    const porCaso = Math.max(1, elementosPorCaso);
    const maximoPosible = Math.floor(flujo.length / (compresion !== 0 ? porCaso : 8 * porCaso)) + 1;
    const capacidad = Math.max(1, Math.min(hayN ? n : 1024, maximoPosible));
    /** @type {Array<Float64Array | string[]>} */
    let datos = variables.map(v => (v.ancho > 0 ? new Array(capacidad) : new Float64Array(capacidad)));
    const crudo = new Uint8Array(Math.max(8, ...variables.map(v => v.elementos * 8)));
    // (2026.12.29, revisión) Los números reservados como perdidos del sistema: el SYSMIS, y HIGHEST y LOWEST (los extremos
    // de los rangos «LO THRU» y «THRU HI», que no son datos), los estándar y los que declare el registro 7.4, como ReadStat.
    const reservados = new Set([SYSMIS, HIGHEST, LOWEST]);
    const reales = extensiones.get(SUBTIPO.REALES);
    if (reales && reales.length >= 24) { const r4 = vistaDe(reales); for (let j = 0; j < 3; j++) { const x = r4.getFloat64(8 * j, le); if (Math.abs(x) > 1e300) reservados.add(x); } }
    const esReservado = (/** @type {number} */ x) => reservados.has(x);
    const enUtf8 = codificacion === 'utf-8';
    const esUnByte = /^(windows-|iso-8859-|koi8|macintosh|ibm866)/.test(codificacion);
    let leidos = 0;
    for (; !hayN || leidos < n; leidos++) {
        if (!lector.quedan()) break;
        if (leidos >= datos[0].length) datos = datos.map(col => { if (Array.isArray(col)) { col.length *= 2; return col; } const nueva = new Float64Array(col.length * 2); nueva.set(col); return nueva; });
        let completo = true;
        for (let k = 0; k < variables.length && completo; k++) {
            const v = variables[k];
            if (v.ancho === 0) {
                const x = lector.numero();
                if (x === undefined) { completo = false; break; }
                /** @type {Float64Array} */ (datos[k])[leidos] = esReservado(x) ? NaN : x;
                continue;
            }
            let usados = 0;
            for (let el = 0; el < v.elementos; el++) {
                const b = lector.trozo();
                if (!b) { completo = false; break; }
                // en las cadenas muy largas, el último elemento de cada segmento de 32 aporta 7 bytes (255 de 256)
                const util = v.segmentos > 1 && el % 32 === 31 ? 7 : 8;
                const toma = Math.max(0, Math.min(util, v.ancho - usados));
                if (enUtf8) {
                    // en UTF-8 los bytes nulos se saltan, como hace ReadStat (haven #560): algunos programas rellenan con ellos
                    for (let j = 0; j < toma; j++) if (b[j]) crudo[usados++] = b[j];
                } else { crudo.set(b.subarray(0, toma), usados); usados += toma; }
            }
            if (!completo) break;
            // como ReadStat: fuera los espacios y los nulos del final (los bytes), y después la secuencia incompleta que
            // dejó un corte por bytes (que la conversión descarta en vez de convertirla en «�»)
            let fin = usados;
            while (fin > 0 && (crudo[fin - 1] === 0x20 || crudo[fin - 1] === 0)) fin--;
            const cadena = enUtf8 ? sinSecuenciaIncompleta(crudo.subarray(0, fin)) : crudo.subarray(0, fin);
            let valor = decodificador.decode(cadena);
            if (!enUtf8 && valor.endsWith('\uFFFD') && !esUnByte) valor = valor.slice(0, -1);
            /** @type {string[]} */ (datos[k])[leidos] = valor;
        }
        if (!completo) {
            if (lector.algoLeido) avisos.push('el último caso está incompleto: se descarta');
            break;
        }
        lector.algoLeido = false;
    }
    if (hayN && leidos < n) avisos.push(`la cabecera anuncia ${n} casos y el archivo trae ${leidos}`);
    datos = datos.map(col => (Array.isArray(col) ? col.slice(0, leidos) : col.slice(0, leidos)));

    // 7) El resultado.
    const nombrePeso = indicePeso > 0 ? (porPrimerElemento.get(indicePeso) || { nombre: '' }).nombre : '';
    return {
        variables: variables.map(v => {
            const tipoFormato = FORMATOS[(v.e.impresion >> 16) & 0xFF] || '';
            const anchoFormato = (v.e.impresion >> 8) & 0xFF, decimales = v.e.impresion & 0xFF;
            return {
                nombre: v.nombre, etiqueta: sinRelleno(texto(v.e.etiqueta)), tipo: v.ancho > 0 ? 'texto' : 'numerica', ancho: v.ancho,
                formato: v.segmentos > 1 ? `A${v.ancho}` : (tipoFormato ? `${tipoFormato}${anchoFormato}${tipoFormato === 'A' ? '' : '.' + decimales}` : ''),
                decimales, fecha: v.ancho === 0 && FORMATOS_FECHA.has(tipoFormato), conHora: FORMATOS_CON_HORA.has(tipoFormato),
                medida: v.medida, alineacion: v.alineacion, columnas: v.columnas, etiquetasValor: v.etiquetasValor, perdidos: v.perdidos
            };
        }),
        n: leidos, datos, codificacion,
        etiquetaArchivo: sinRelleno(texto(etiquetaArchivo)),
        creado: `${sinRelleno(texto(fechaCreacion))} ${sinRelleno(texto(horaCreacion))}`.trim(),
        producto: sinRelleno(texto(producto)),
        documentos: documentos.map(l => sinRelleno(texto(l))),
        ponderacion: nombrePeso,
        compresion: /** @type {0 | 1 | 2} */ (compresion), granEndian: !le, avisos
    };
}

/**
 * Los elementos de 8 bytes de los casos, sin comprimir o con la compresión por bytes de SPSS: bloques de ocho códigos
 * (0 nada; 1–251 el número código − sesgo; 252 fin; 253 los 8 bytes que siguen al bloque, en orden; 254 ocho espacios;
 * 255 el perdido del sistema).
 */
class LectorElementos {
    /** @param {Uint8Array} b @param {boolean} comprimido @param {number} sesgo @param {boolean} le */
    constructor(b, comprimido, sesgo, le) {
        this.b = b;
        this.vista = new DataView(b.buffer, b.byteOffset, b.byteLength);
        this.comprimido = comprimido;
        this.sesgo = sesgo;
        this.le = le;
        this.p = 0;
        this.codigos = new Uint8Array(8);
        this.k = 8;
        this.fin = false;
        this.algoLeido = false;
        this.espacios = new Uint8Array(8).fill(0x20);
        this.numeroComoTrozo = new Uint8Array(8);
    }
    /** ¿Queda algún elemento? */
    quedan() {
        if (!this.comprimido) return this.p + 8 <= this.b.length;
        if (this.fin) return false;
        while (this.k < 8 && this.codigos[this.k] === 0) this.k++;
        if (this.k < 8) return this.codigos[this.k] !== 252;
        // un bloque nuevo: si solo trae ceros (o el fin), no quedan elementos
        let q = this.p;
        while (q + 8 <= this.b.length) {
            for (let j = 0; j < 8; j++) {
                const cod = this.b[q + j];
                if (cod === 252) return false;
                if (cod !== 0) return true;
            }
            q += 8;
        }
        return false;
    }
    /** El código siguiente (y los bloques que haga falta leer), o −1 al final. */
    _codigo() {
        for (;;) {
            while (this.k < 8) {
                const cod = this.codigos[this.k++];
                if (cod === 0) continue;
                if (cod === 252) { this.fin = true; return -1; }
                return cod;
            }
            if (this.p + 8 > this.b.length) return -1;
            this.codigos.set(this.b.subarray(this.p, this.p + 8));
            this.p += 8;
            this.k = 0;
        }
    }
    /** El número siguiente, o undefined al final. */
    numero() {
        if (!this.comprimido) {
            if (this.p + 8 > this.b.length) return undefined;
            const v = this.vista.getFloat64(this.p, this.le);
            this.p += 8;
            this.algoLeido = true;
            return v;
        }
        const cod = this._codigo();
        if (cod < 0) return undefined;
        this.algoLeido = true;
        if (cod === 255) return SYSMIS;
        if (cod === 253) {
            if (this.p + 8 > this.b.length) return undefined;
            const v = this.vista.getFloat64(this.p, this.le);
            this.p += 8;
            return v;
        }
        if (cod === 254) return SYSMIS;          // ocho espacios donde va un número: no es un número
        return cod - this.sesgo;
    }
    /** El trozo de 8 bytes siguiente de una cadena, o null al final. @returns {Uint8Array | null} */
    trozo() {
        if (!this.comprimido) {
            if (this.p + 8 > this.b.length) return null;
            const t = this.b.subarray(this.p, this.p + 8);
            this.p += 8;
            this.algoLeido = true;
            return t;
        }
        const cod = this._codigo();
        if (cod < 0) return null;
        this.algoLeido = true;
        if (cod === 253) {
            if (this.p + 8 > this.b.length) return null;
            const t = this.b.subarray(this.p, this.p + 8);
            this.p += 8;
            return t;
        }
        if (cod === 254 || cod === 255) return this.espacios;
        // un número comprimido donde va texto (no debería ocurrir): sus 8 bytes, como haría el archivo sin comprimir
        new DataView(this.numeroComoTrozo.buffer).setFloat64(0, cod - this.sesgo, this.le);
        return this.numeroComoTrozo;
    }
}

/**
 * Los datos de un .zsav: tras el diccionario, una cabecera (desplazamientos de sí misma, del índice y su largo), los
 * bloques comprimidos con zlib y el índice (sesgo, cero, tamaño de bloque, número de bloques y, por bloque, sus
 * desplazamientos y tamaños). Descomprimidos y concatenados, son los casos con la compresión por bytes.
 * @param {Uint8Array} bytes @param {number} inicio @param {boolean} le
 * @param {boolean} nativo con el DecompressionStream del entorno, si lo hay
 * @returns {Promise<Uint8Array>}
 */
async function descomprimirZlib(bytes, inicio, le, nativo) {
    const c = new Cursor(bytes, le);
    c.p = inicio;
    const cabecera = c.i64(), indice = c.i64();
    c.i64();                                     // largo del índice
    if (cabecera !== inicio) throw errorSav('la cabecera de los datos zlib no está donde debe');
    if (indice < inicio || indice + 24 > bytes.length) throw errorSav('el índice de los datos zlib está fuera del archivo');
    c.p = indice;
    c.i64(); c.i64();                            // sesgo (negativo) y cero
    c.i32();                                     // tamaño de bloque
    const nBloques = c.i32();
    if (nBloques < 0 || nBloques > 1e7) throw errorSav('el índice de los datos zlib dice un número de bloques imposible');
    /** @type {Array<{ desde: number, comprimido: number, descomprimido: number }>} */
    const bloques = [];
    for (let i = 0; i < nBloques; i++) {
        c.i64();                                 // desplazamiento sin comprimir
        const desde = c.i64();
        const descomprimido = c.i32(), comprimido = c.i32();
        // (2026.12.31, revisión) un tamaño que zlib no puede dar con esos bytes (o negativo): dañado o manipulado, y sin
        // reservar la memoria que dice
        if (comprimido < 0 || !tamanoPosible(descomprimido, comprimido)) throw errorSav('un bloque zlib dice un tamaño imposible');
        if (desde < 0 || desde + comprimido > bytes.length) throw errorSav('un bloque zlib está fuera del archivo');
        bloques.push({ desde, comprimido, descomprimido });
    }
    const total = bloques.reduce((s, b) => s + b.descomprimido, 0);
    if (total > MAXIMO_ZSAV) throw new Error(`El archivo de SPSS es demasiado grande para leerlo aquí: sus datos ocupan ${tamanoLegible(total)} sin comprimir. Guárdalo en SPSS con las variables que necesitas, o como CSV`);
    const salida = new Uint8Array(total);
    let p = 0;
    for (const b of bloques) {
        const plano = await inflarZlib(bytes.subarray(b.desde, b.desde + b.comprimido), b.descomprimido, nativo);
        salida.set(plano.subarray(0, Math.min(plano.length, total - p)), p);
        p += Math.min(plano.length, b.descomprimido);
    }
    return salida.subarray(0, p);
}

/** El Adler-32 de unos bytes (RFC 1950), el que cierra un flujo zlib. @param {Uint8Array} b */
function adler32(b) {
    let s1 = 1, s2 = 0;
    for (let i = 0; i < b.length;) {
        // de 5552 en 5552 bytes: lo más que se suma sin pasar de 2³² antes del módulo
        for (const fin = Math.min(i + 5552, b.length); i < fin; i++) { s1 += /** @type {number} */ (b[i]); s2 += s1; }
        s1 %= 65521; s2 %= 65521;
    }
    return ((s2 << 16) | s1) >>> 0;
}

/**
 * Descomprime un bloque zlib: con el DecompressionStream del entorno (el navegador y Node 18+), detenido en cuanto pasa del
 * tamaño que declara el índice; y, donde no lo hay (navegadores de antes de 2023), con el descompresor DEFLATE propio
 * (core/data/zip/inflate.js), comprobando la cabecera de zlib y su Adler-32. (2026.12.31, revisión) Antes descomprimía el
 * bloque entero, declarara lo que declarara, y sin DecompressionStream no se podía abrir un .zsav.
 * @param {Uint8Array} datos
 * @param {number} declarado el tamaño sin comprimir que dice el índice
 * @param {boolean} nativo con el DecompressionStream del entorno, si lo hay
 * @returns {Promise<Uint8Array>}
 */
async function inflarZlib(datos, declarado, nativo) {
    const danado = () => errorSav('un bloque de datos comprimidos (zlib) está dañado');
    if (nativo && hayDescompresorNativo('deflate')) {
        try {
            return await inflarNativo(datos, declarado, 'deflate');
        } catch (e) {
            // el navegador lanza un TypeError sin mensaje con un bloque dañado
            throw e instanceof Error && e.message === DEMASIADO_LARGA ? errorSav('un bloque de datos comprimidos (zlib) es más largo de lo que declara') : danado();
        }
    }
    // la cabecera de zlib: DEFLATE (CM = 8), su comprobación (múltiplo de 31) y sin diccionario; al final, el Adler-32
    const cmf = datos[0], flg = datos[1];
    if (datos.length < 6 || cmf === undefined || flg === undefined || (cmf & 15) !== 8 || ((cmf << 8) | flg) % 31 !== 0 || (flg & 0x20)) throw danado();
    let plano;
    try { plano = inflarDeflate(datos.subarray(2, datos.length - 4), declarado); } catch (e) { throw danado(); }
    const n = datos.length;
    const esperado = ((/** @type {number} */ (datos[n - 4]) << 24) | (/** @type {number} */ (datos[n - 3]) << 16) | (/** @type {number} */ (datos[n - 2]) << 8) | /** @type {number} */ (datos[n - 1])) >>> 0;
    if (adler32(plano) !== esperado) throw danado();
    return plano;
}

/**
 * ¿Es perdido este valor de la variable? El perdido del sistema (NaN), la cadena vacía o un perdido declarado por el
 * usuario (uno de sus valores o dentro de su rango).
 * @param {VariableLeida} variable
 * @param {number | string | null | undefined} valor
 */
export function esPerdidoSav(variable, valor) {
    if (valor === null || valor === undefined) return true;
    if (typeof valor === 'number') {
        if (Number.isNaN(valor)) return true;
        const { valores, rango } = variable.perdidos;
        if (rango && valor >= rango[0] && valor <= rango[1]) return true;
        return valores.some(x => typeof x === 'number' && x === valor);
    }
    if (valor === '') return true;
    return variable.perdidos.valores.some(x => x === valor);
}
