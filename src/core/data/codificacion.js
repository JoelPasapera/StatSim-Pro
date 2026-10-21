// @ts-check
// core/data/codificacion.js — (2026.12.29) el texto de un archivo, decodificado como lo guardó el programa que lo escribió:
// UTF-8 (con o sin BOM), UTF-16 (con BOM: el «Texto Unicode» de Excel) o, si los bytes no son UTF-8 válido, windows-1252,
// el «ANSI» de Windows: es lo que guarda Excel en español con «CSV (delimitado por comas)», y leído como UTF-8 cada tilde y
// cada eñe salían como «�». Sin DOM: funciona en la página, en un Worker y en Node.

/** @typedef {'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1252'} CodificacionTexto */

// Los 32 caracteres de windows-1252 entre 0x80 y 0x9F; los cinco sin asignar (0x81, 0x8D, 0x8F, 0x90 y 0x9D) quedan como el
// control C1 del mismo número, como en el estándar de codificaciones del WHATWG (el de los navegadores).
const DE_0X80 = [0x20AC, 0x81, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030, 0x0160, 0x2039, 0x0152, 0x8D, 0x017D, 0x8F,
    0x90, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014, 0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0x9D, 0x017E, 0x0178];

/** windows-1252 entre 0x80 y 0xFF: los 32 de DE_0X80 y, de 0xA0 a 0xFF, los de latin-1. */
const ALTOS_1252 = Object.freeze([...DE_0X80, ...Array.from({ length: 96 }, (_, i) => 0xA0 + i)]);

// (2026.12.29, revisión) Las páginas de código de MS-DOS que TextDecoder no conoce, las de los .sav de SPSS para DOS y de
// los Windows antiguos sin registro de codificación: la 437 (EE. UU.), la 850 (Europa occidental y América Latina, y su
// variante 858, con el «€» en 0xD5) y la 852 (Europa central). De 0x80 a 0xFF, generadas con los códecs de Python (cp437,
// cp850, cp852, cp858); de 0x00 a 0x7F, ASCII. Hasta la revisión se leían como windows-1252: «caf‚», «ni¤o».
const ALTOS_437 = Object.freeze([
    0x00C7, 0x00FC, 0x00E9, 0x00E2, 0x00E4, 0x00E0, 0x00E5, 0x00E7, 0x00EA, 0x00EB, 0x00E8, 0x00EF, 0x00EE, 0x00EC, 0x00C4, 0x00C5,
    0x00C9, 0x00E6, 0x00C6, 0x00F4, 0x00F6, 0x00F2, 0x00FB, 0x00F9, 0x00FF, 0x00D6, 0x00DC, 0x00A2, 0x00A3, 0x00A5, 0x20A7, 0x0192,
    0x00E1, 0x00ED, 0x00F3, 0x00FA, 0x00F1, 0x00D1, 0x00AA, 0x00BA, 0x00BF, 0x2310, 0x00AC, 0x00BD, 0x00BC, 0x00A1, 0x00AB, 0x00BB,
    0x2591, 0x2592, 0x2593, 0x2502, 0x2524, 0x2561, 0x2562, 0x2556, 0x2555, 0x2563, 0x2551, 0x2557, 0x255D, 0x255C, 0x255B, 0x2510,
    0x2514, 0x2534, 0x252C, 0x251C, 0x2500, 0x253C, 0x255E, 0x255F, 0x255A, 0x2554, 0x2569, 0x2566, 0x2560, 0x2550, 0x256C, 0x2567,
    0x2568, 0x2564, 0x2565, 0x2559, 0x2558, 0x2552, 0x2553, 0x256B, 0x256A, 0x2518, 0x250C, 0x2588, 0x2584, 0x258C, 0x2590, 0x2580,
    0x03B1, 0x00DF, 0x0393, 0x03C0, 0x03A3, 0x03C3, 0x00B5, 0x03C4, 0x03A6, 0x0398, 0x03A9, 0x03B4, 0x221E, 0x03C6, 0x03B5, 0x2229,
    0x2261, 0x00B1, 0x2265, 0x2264, 0x2320, 0x2321, 0x00F7, 0x2248, 0x00B0, 0x2219, 0x00B7, 0x221A, 0x207F, 0x00B2, 0x25A0, 0x00A0]);
const ALTOS_850 = Object.freeze([
    0x00C7, 0x00FC, 0x00E9, 0x00E2, 0x00E4, 0x00E0, 0x00E5, 0x00E7, 0x00EA, 0x00EB, 0x00E8, 0x00EF, 0x00EE, 0x00EC, 0x00C4, 0x00C5,
    0x00C9, 0x00E6, 0x00C6, 0x00F4, 0x00F6, 0x00F2, 0x00FB, 0x00F9, 0x00FF, 0x00D6, 0x00DC, 0x00F8, 0x00A3, 0x00D8, 0x00D7, 0x0192,
    0x00E1, 0x00ED, 0x00F3, 0x00FA, 0x00F1, 0x00D1, 0x00AA, 0x00BA, 0x00BF, 0x00AE, 0x00AC, 0x00BD, 0x00BC, 0x00A1, 0x00AB, 0x00BB,
    0x2591, 0x2592, 0x2593, 0x2502, 0x2524, 0x00C1, 0x00C2, 0x00C0, 0x00A9, 0x2563, 0x2551, 0x2557, 0x255D, 0x00A2, 0x00A5, 0x2510,
    0x2514, 0x2534, 0x252C, 0x251C, 0x2500, 0x253C, 0x00E3, 0x00C3, 0x255A, 0x2554, 0x2569, 0x2566, 0x2560, 0x2550, 0x256C, 0x00A4,
    0x00F0, 0x00D0, 0x00CA, 0x00CB, 0x00C8, 0x0131, 0x00CD, 0x00CE, 0x00CF, 0x2518, 0x250C, 0x2588, 0x2584, 0x00A6, 0x00CC, 0x2580,
    0x00D3, 0x00DF, 0x00D4, 0x00D2, 0x00F5, 0x00D5, 0x00B5, 0x00FE, 0x00DE, 0x00DA, 0x00DB, 0x00D9, 0x00FD, 0x00DD, 0x00AF, 0x00B4,
    0x00AD, 0x00B1, 0x2017, 0x00BE, 0x00B6, 0x00A7, 0x00F7, 0x00B8, 0x00B0, 0x00A8, 0x00B7, 0x00B9, 0x00B3, 0x00B2, 0x25A0, 0x00A0]);
const ALTOS_852 = Object.freeze([
    0x00C7, 0x00FC, 0x00E9, 0x00E2, 0x00E4, 0x016F, 0x0107, 0x00E7, 0x0142, 0x00EB, 0x0150, 0x0151, 0x00EE, 0x0179, 0x00C4, 0x0106,
    0x00C9, 0x0139, 0x013A, 0x00F4, 0x00F6, 0x013D, 0x013E, 0x015A, 0x015B, 0x00D6, 0x00DC, 0x0164, 0x0165, 0x0141, 0x00D7, 0x010D,
    0x00E1, 0x00ED, 0x00F3, 0x00FA, 0x0104, 0x0105, 0x017D, 0x017E, 0x0118, 0x0119, 0x00AC, 0x017A, 0x010C, 0x015F, 0x00AB, 0x00BB,
    0x2591, 0x2592, 0x2593, 0x2502, 0x2524, 0x00C1, 0x00C2, 0x011A, 0x015E, 0x2563, 0x2551, 0x2557, 0x255D, 0x017B, 0x017C, 0x2510,
    0x2514, 0x2534, 0x252C, 0x251C, 0x2500, 0x253C, 0x0102, 0x0103, 0x255A, 0x2554, 0x2569, 0x2566, 0x2560, 0x2550, 0x256C, 0x00A4,
    0x0111, 0x0110, 0x010E, 0x00CB, 0x010F, 0x0147, 0x00CD, 0x00CE, 0x011B, 0x2518, 0x250C, 0x2588, 0x2584, 0x0162, 0x016E, 0x2580,
    0x00D3, 0x00DF, 0x00D4, 0x0143, 0x0144, 0x0148, 0x0160, 0x0161, 0x0154, 0x00DA, 0x0155, 0x0170, 0x00FD, 0x00DD, 0x0163, 0x00B4,
    0x00AD, 0x02DD, 0x02DB, 0x02C7, 0x02D8, 0x00A7, 0x00F7, 0x00B8, 0x00B0, 0x00A8, 0x02D9, 0x0171, 0x0158, 0x0159, 0x25A0, 0x00A0]);
const ALTOS_858 = Object.freeze(ALTOS_850.map((x, i) => (i === 0xD5 - 0x80 ? 0x20AC : x)));
/** @type {Readonly<Record<string, readonly number[]>>} */
const PAGINAS_DOS = Object.freeze({ ibm437: ALTOS_437, ibm850: ALTOS_850, ibm852: ALTOS_852, ibm858: ALTOS_858 });

/**
 * Unos bytes con una página de código de un byte: ASCII de 0x00 a 0x7F y, de 0x80 a 0xFF, la tabla `altos`.
 * @param {Uint8Array} bytes
 * @param {readonly number[]} altos  los 128 puntos de código de 0x80 a 0xFF
 * @returns {string}
 */
function decodificarConTabla(bytes, altos) {
    let texto = '';
    const TROZO = 8192;
    for (let i = 0; i < bytes.length; i += TROZO) {
        const trozo = bytes.subarray(i, i + TROZO);
        const puntos = new Array(trozo.length);
        for (let j = 0; j < trozo.length; j++) { const b = /** @type {number} */ (trozo[j]); puntos[j] = b >= 0x80 ? altos[b - 0x80] : b; }
        texto += String.fromCharCode.apply(null, puntos);
    }
    return texto;
}

/**
 * Unos bytes en windows-1252, con la tabla propia: el TextDecoder de Node (al menos hasta la 22) lee 0x80–0x9F como
 * latin-1 (el «€» de 0x80 salía como un control invisible); el de los navegadores, bien. Así se lee igual en todas partes.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function decodificarWindows1252(bytes) { return decodificarConTabla(bytes, ALTOS_1252); }

/**
 * La etiqueta de una página de código de MS-DOS de las tablas propias («cp850», «IBM850», «ibm-850», «850»…) como «ibm850»;
 * null si no es una de ellas.
 * @param {string} etiqueta
 * @returns {string | null}
 */
export function etiquetaDOS(etiqueta) {
    const m = /^(?:cp|ibm|dos|oem)?[-_ ]?(437|850|852|858)$/i.exec(String(etiqueta ?? '').trim());
    return m ? `ibm${m[1]}` : null;
}

/**
 * ¿Hay con qué leer esta codificación? (las de TextDecoder y las páginas de MS-DOS de las tablas propias)
 * @param {string} etiqueta
 */
export function codificacionConocida(etiqueta) {
    if (etiquetaDOS(etiqueta)) return true;
    try { new TextDecoder(etiqueta); return true; } catch (e) { return false; }
}

/**
 * Un decodificador para la etiqueta de una codificación (la de TextDecoder): el de TextDecoder o, para windows-1252 y sus
 * alias (latin1, iso-8859-1, ascii…) y las páginas de MS-DOS 437, 850, 852 y 858, el de la tabla propia.
 * @param {string} etiqueta
 * @returns {{ decode: (bytes: Uint8Array) => string }}
 */
export function decodificadorPara(etiqueta) {
    const dos = etiquetaDOS(etiqueta);
    if (dos) { const altos = /** @type {readonly number[]} */ (PAGINAS_DOS[dos]); return { decode: b => decodificarConTabla(b, altos) }; }
    const d = new TextDecoder(etiqueta);
    return d.encoding === 'windows-1252' ? { decode: decodificarWindows1252 } : d;
}

/**
 * Un recorrido de unos bytes como UTF-8 (las reglas del estándar de codificaciones del WHATWG, las de TextDecoder): cuántas
 * secuencias de varios bytes son válidas, cuántas veces habría que poner «�» (una por cada tramo inválido más largo
 * posible, como TextDecoder) y si el final corta una secuencia. Válida: de 2 a 4 bytes con sus continuaciones (10xxxxxx),
 * sin formas largas (C0, C1, E0 80–9F, F0 80–8F), sin sustitutos (ED A0–BF) y hasta U+10FFFF (F4 80–8F).
 * @param {Uint8Array} b
 * @returns {{ multibyte: number, invalidos: number, truncado: boolean }}
 */
export function analizarUtf8(b) {
    let multibyte = 0, invalidos = 0, truncado = false;
    for (let i = 0; i < b.length;) {
        const x = /** @type {number} */ (b[i]);
        if (x < 0x80) { i++; continue; }
        let n = 0, min = 0x80, max = 0xBF;
        if (x >= 0xC2 && x <= 0xDF) n = 1;
        else if (x >= 0xE0 && x <= 0xEF) { n = 2; if (x === 0xE0) min = 0xA0; else if (x === 0xED) max = 0x9F; }
        else if (x >= 0xF0 && x <= 0xF4) { n = 3; if (x === 0xF0) min = 0x90; else if (x === 0xF4) max = 0x8F; }
        else { invalidos++; i++; continue; }
        let j = 1;
        for (; j <= n && i + j < b.length; j++) {
            const y = /** @type {number} */ (b[i + j]);
            if (y < (j === 1 ? min : 0x80) || y > (j === 1 ? max : 0xBF)) break;
        }
        if (j > n) { multibyte++; i += n + 1; continue; }
        invalidos++;
        if (i + j >= b.length) { truncado = true; break; }   // el archivo termina a media secuencia
        i += j;   // el tramo inválido es un «�»; el byte que lo cortó se vuelve a leer
    }
    return { multibyte, invalidos, truncado };
}

/**
 * El texto de unos bytes, la codificación con que se leyó y cuántos «�» lleva. Sin BOM: UTF-8 si lo es; si tiene algún byte
 * inválido pero más secuencias UTF-8 válidas de varios bytes que tramos inválidos (un UTF-8 con un byte dañado, o cortado a
 * media letra al final), también UTF-8, con «�» en lo dañado; si no, windows-1252 (cualquier secuencia de bytes es
 * windows-1252 válido). (2026.12.30) Hasta la 2026.12.29, un solo byte inválido mandaba todo el archivo a windows-1252, y
 * un UTF-8 de 200 filas con una «é» suelta se leía entero como «OpiniÃ³n».
 * @param {Uint8Array | ArrayBuffer} entrada
 * @returns {{ texto: string, codificacion: CodificacionTexto, invalidos: number }}
 */
export function decodificarTexto(entrada) {
    const b = entrada instanceof Uint8Array ? entrada : new Uint8Array(entrada);
    if (b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) {
        const resto = b.subarray(3);
        return { texto: new TextDecoder('utf-8').decode(resto), codificacion: 'utf-8', invalidos: analizarUtf8(resto).invalidos };
    }
    if (b.length >= 2 && b[0] === 0xFF && b[1] === 0xFE) return { texto: new TextDecoder('utf-16le').decode(b.subarray(2)), codificacion: 'utf-16le', invalidos: 0 };
    if (b.length >= 2 && b[0] === 0xFE && b[1] === 0xFF) return { texto: new TextDecoder('utf-16be').decode(b.subarray(2)), codificacion: 'utf-16be', invalidos: 0 };
    const { multibyte, invalidos, truncado } = analizarUtf8(b);
    // solo el final cortado, o más secuencias válidas que dañadas: UTF-8 (TextDecoder sin «fatal» pone «�» en lo dañado)
    if (invalidos === 0 || (truncado && invalidos === 1) || multibyte >= invalidos) return { texto: new TextDecoder('utf-8').decode(b), codificacion: 'utf-8', invalidos };
    return { texto: decodificarWindows1252(b), codificacion: 'windows-1252', invalidos: 0 };
}

/**
 * El aviso para el usuario sobre cómo se leyó un texto: vacío si se leyó limpio (UTF-8 o UTF-16).
 * @param {{ codificacion: CodificacionTexto, invalidos?: number }} lectura
 * @returns {string}
 */
export function avisoDeCodificacion(lectura) {
    if (lectura.codificacion === 'windows-1252') return 'el archivo no estaba en UTF-8 y se leyó como ANSI de Windows (windows-1252), la codificación de Excel en español: revisa que las tildes y las eñes se vean bien';
    const n = lectura.invalidos || 0;
    if (n > 0) return `el archivo está en UTF-8, pero ${n === 1 ? 'un carácter estaba dañado y se muestra' : `${n} caracteres estaban dañados y se muestran`} como «�»: revisa esas celdas`;
    return '';
}
