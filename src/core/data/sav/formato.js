// @ts-check
// core/data/sav/formato.js — lo que comparten el lector y el escritor de los archivos de datos de SPSS (.sav y .zsav): los
// tipos de registro, los códigos de formato, el perdido del sistema, la época de las fechas, las codificaciones y el texto
// en UTF-8. (2026.12.29) Fuente: la descripción del formato del manual de desarrolladores de GNU PSPP («System File
// Format»); comprobado con ReadStat (la biblioteca que usan haven y pyreadstat) sobre archivos escritos por SPSS.
// Sin DOM ni dependencias: funciona en la página, en un Worker y en Node.
import { codificacionConocida, etiquetaDOS } from '../codificacion.js';

/** Tipos de registro del diccionario. */
export const REGISTRO = Object.freeze({ VARIABLE: 2, ETIQUETAS_VALOR: 3, INDICES_ETIQUETAS: 4, DOCUMENTO: 6, EXTENSION: 7, FIN: 999 });

/** Subtipos de los registros de extensión (tipo 7) que se leen o se escriben. */
export const SUBTIPO = Object.freeze({
    ENTEROS: 3, REALES: 4, VISUALIZACION: 11, NOMBRES_LARGOS: 13, CADENAS_MUY_LARGAS: 14, CASOS_64: 16, CODIFICACION: 20,
    ETIQUETAS_CADENA_LARGA: 21, PERDIDOS_CADENA_LARGA: 22
});

/** El perdido del sistema, como lo escribe SPSS: −DBL_MAX. */
export const SYSMIS = -Number.MAX_VALUE;
/** HIGHEST (DBL_MAX) y LOWEST (el número siguiente a −DBL_MAX), los extremos de los rangos «LO THRU» y «THRU HI». */
export const HIGHEST = Number.MAX_VALUE;
export const LOWEST = (() => {
    const v = new DataView(new ArrayBuffer(8));
    v.setUint32(0, 0xFFEFFFFF); v.setUint32(4, 0xFFFFFFFE);
    return v.getFloat64(0);
})();

/** Códigos de los formatos de impresión y escritura (PSPP, «Variable Record»). @type {Readonly<Record<number, string>>} */
export const FORMATOS = Object.freeze({
    1: 'A', 2: 'AHEX', 3: 'COMMA', 4: 'DOLLAR', 5: 'F', 6: 'IB', 7: 'PIBHEX', 8: 'P', 9: 'PIB', 10: 'PK', 11: 'RB', 12: 'RBHEX',
    15: 'Z', 16: 'N', 17: 'E', 20: 'DATE', 21: 'TIME', 22: 'DATETIME', 23: 'ADATE', 24: 'JDATE', 25: 'DTIME', 26: 'WKDAY',
    27: 'MONTH', 28: 'MOYR', 29: 'QYR', 30: 'WKYR', 31: 'PCT', 32: 'DOT', 33: 'CCA', 34: 'CCB', 35: 'CCC', 36: 'CCD', 37: 'CCE',
    38: 'EDATE', 39: 'SDATE', 40: 'MTIME', 41: 'YMDHMS'
});

/** Código de cada formato por su nombre (el inverso de FORMATOS). @type {Readonly<Record<string, number>>} */
export const CODIGO_FORMATO = Object.freeze(Object.fromEntries(Object.entries(FORMATOS).map(([codigo, nombre]) => [nombre, Number(codigo)])));

/** Formatos cuyo valor son los segundos desde el 14 de octubre de 1582: una fecha, con hora o sin ella. */
export const FORMATOS_FECHA = new Set(['DATE', 'ADATE', 'EDATE', 'SDATE', 'JDATE', 'MOYR', 'QYR', 'WKYR', 'DATETIME', 'YMDHMS']);
/** Los de FORMATOS_FECHA que además tienen hora. */
export const FORMATOS_CON_HORA = new Set(['DATETIME', 'YMDHMS']);

/** Segundos entre el 14 de octubre de 1582, la época de las fechas de SPSS, y el 1 de enero de 1970. */
export const EPOCA_SPSS = 12219379200;

/** Niveles de medida (registro 7.11): 1 nominal, 2 ordinal, 3 escala. */
export const MEDIDA = Object.freeze(/** @type {Record<number, 'nominal' | 'ordinal' | 'escala'>} */ ({ 1: 'nominal', 2: 'ordinal', 3: 'escala' }));
export const CODIGO_MEDIDA = Object.freeze({ nominal: 1, ordinal: 2, escala: 3 });
/** Alineación en la vista de datos (registro 7.11): 0 izquierda, 1 derecha, 2 centro. */
export const ALINEACION = Object.freeze(/** @type {Record<number, 'izquierda' | 'derecha' | 'centro'>} */ ({ 0: 'izquierda', 1: 'derecha', 2: 'centro' }));

/** Palabras que SPSS no admite como nombre de variable. */
export const RESERVADAS = new Set(['ALL', 'AND', 'BY', 'EQ', 'GE', 'GT', 'LE', 'LT', 'NE', 'NOT', 'OR', 'TO', 'WITH']);

/**
 * Páginas de código del registro 7.3 → etiqueta de TextDecoder. PSPP: 1 EBCDIC, 2 ASCII de 7 bits, 3 ASCII de 8 bits; el
 * resto es el número de la página de código de Windows. ReadStat lee el 2 y el 3 como windows-1252 («some files are
 * miscoded»), y así se hace aquí.
 * @type {Readonly<Record<number, string>>}
 */
const PAGINAS = Object.freeze({
    2: 'windows-1252', 3: 'windows-1252', 866: 'ibm866', 874: 'windows-874', 932: 'shift_jis', 936: 'gbk', 949: 'euc-kr', 950: 'big5',
    1250: 'windows-1250', 1251: 'windows-1251', 1252: 'windows-1252', 1253: 'windows-1253', 1254: 'windows-1254', 1255: 'windows-1255',
    1256: 'windows-1256', 1257: 'windows-1257', 1258: 'windows-1258', 10000: 'macintosh', 20866: 'koi8-r', 21866: 'koi8-u',
    437: 'ibm437', 850: 'ibm850', 852: 'ibm852', 858: 'ibm858',   // (2026.12.29, revisión) las de MS-DOS, con tabla propia
    28591: 'windows-1252', 28592: 'iso-8859-2', 28593: 'iso-8859-3', 28594: 'iso-8859-4', 28595: 'iso-8859-5', 28596: 'iso-8859-6',
    28597: 'iso-8859-7', 28598: 'iso-8859-8', 28603: 'iso-8859-13', 28605: 'iso-8859-15', 51932: 'euc-jp', 65001: 'utf-8'
});


/**
 * La etiqueta de TextDecoder para la codificación de un archivo: la del registro 7.20 (su nombre, p. ej. «UTF-8» o
 * «windows-1252»; «CP1252» se entiende como windows-1252) o, si no está o no se conoce, la página de código del registro
 * 7.3; sin ninguna de las dos, windows-1252, la de los archivos de SPSS anteriores al modo Unicode.
 * @param {string} nombre  el del registro 7.20 ('' si no hay)
 * @param {number} pagina  la del registro 7.3 (0 si no hay)
 * @returns {string}
 */
export function etiquetaCodificacion(nombre, pagina) {
    return codificacionDelArchivo(nombre, pagina).etiqueta;
}

/**
 * La codificación de un archivo (etiquetaCodificacion) y si se reconoció: `conocida` es false cuando el archivo declara una
 * que no hay con qué leer (una página de MS-DOS sin tabla propia, como la 737 o la 866 de antes de TextDecoder) y se lee
 * como windows-1252; sin ninguna declaración, se da por conocida (la de los archivos anteriores al modo Unicode).
 * @param {string} nombre
 * @param {number} pagina
 * @returns {{ etiqueta: string, conocida: boolean, declarada: string }}
 */
export function codificacionDelArchivo(nombre, pagina) {
    const crudo = String(nombre || '').trim();
    const dos = etiquetaDOS(crudo);
    if (dos) return { etiqueta: dos, conocida: true, declarada: crudo };
    const n = crudo.toLowerCase().replace(/^cp-?(\d+)$/, 'windows-$1').replace(/^ms-?(\d+)$/, 'windows-$1');
    if (n && codificacionConocida(n)) return { etiqueta: n, conocida: true, declarada: crudo };
    const porPagina = PAGINAS[pagina];
    if (porPagina && codificacionConocida(porPagina)) return { etiqueta: porPagina, conocida: true, declarada: crudo || String(pagina) };
    const declarada = crudo || (pagina > 3 ? `página de código ${pagina}` : '');
    return { etiqueta: 'windows-1252', conocida: !declarada, declarada };
}

const CODIFICADOR = new TextEncoder();

/** El texto en UTF-8. @param {string} texto */
export function utf8(texto) { return CODIFICADOR.encode(String(texto ?? '')); }

/**
 * El texto en UTF-8 recortado a como mucho `maximo` bytes sin partir un carácter, y si hizo falta recortarlo.
 * @param {string} texto
 * @param {number} maximo
 * @returns {{ bytes: Uint8Array, recortado: boolean }}
 */
export function utf8Recortado(texto, maximo) {
    const b = utf8(texto);
    if (b.length <= maximo) return { bytes: b, recortado: false };
    let fin = maximo;
    while (fin > 0 && (b[fin] & 0xC0) === 0x80) fin--;   // no empezar a cortar en mitad de una secuencia
    return { bytes: b.subarray(0, fin), recortado: true };
}

/**
 * Los segundos de SPSS de una fecha como texto: 'AAAA-MM-DD' o, con hora, 'AAAA-MM-DD hh:mm:ss' (y las fracciones de
 * segundo, si las hay). '' si no es un número finito.
 * @param {number} segundos
 * @param {boolean} [conHora]
 * @returns {string}
 */
export function segundosAFecha(segundos, conHora = false) {
    if (!Number.isFinite(segundos)) return '';
    const ms = (segundos - EPOCA_SPSS) * 1000;
    const d = new Date(Math.round(ms));
    if (Number.isNaN(d.getTime())) return '';
    const dos = (/** @type {number} */ x) => String(x).padStart(2, '0');
    const anio = d.getUTCFullYear(), a = anio < 0 ? '-' + String(-anio).padStart(4, '0') : String(anio).padStart(4, '0');
    const fecha = `${a}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())}`;
    if (!conHora) return fecha;
    const fraccion = d.getUTCMilliseconds() ? '.' + String(d.getUTCMilliseconds()).padStart(3, '0') : '';
    return `${fecha} ${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())}:${dos(d.getUTCSeconds())}${fraccion}`;
}

/** Los días desde el 1 de enero de 1970 (la convención de la base columnar) en segundos de SPSS. @param {number} dias */
export function diasASegundos(dias) { return dias * 86400 + EPOCA_SPSS; }
