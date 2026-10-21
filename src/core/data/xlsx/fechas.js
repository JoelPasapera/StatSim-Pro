// @ts-check
// core/data/xlsx/fechas.js — (2026.12.31) las fechas de Excel. Un libro guarda una fecha como un número de serie (los días
// desde 1899-12-30, o desde 1904-01-01 en los libros con el sistema de 1904 de los Mac antiguos; la hora, como la fracción
// del día) y la distingue de un número cualquiera solo por el formato de la celda. Aquí: qué formatos son de fecha, el
// número de serie como fecha «AAAA-MM-DD» (con « HH:MM:SS» si tiene hora; «HH:MM:SS» si es solo una hora) y, para
// escribir, los días desde 1970 (las fechas de la base del Simulador) como número de serie. Sin DOM.
//
// El sistema de 1900 arrastra un error de Lotus 1-2-3 que Excel conserva a propósito: cuenta un 29 de febrero de 1900
// que no existió (el número 60). Por eso, del 1 al 59 hay un día de diferencia con el calendario real.

const MS_DIA = 86400000;
/** El día 0 de cada sistema (en el de 1900, el 0 sería «1900-01-00»: 1899-12-30 hace cuadrar los números desde el 61). */
const EPOCA_1900 = Date.UTC(1899, 11, 30), EPOCA_1904 = Date.UTC(1904, 0, 1);
/** El primer número de serie que ya no es una fecha (9999-12-31 es la última que admite Excel). */
const FIN_1900 = (Date.UTC(9999, 11, 31) - EPOCA_1900) / MS_DIA + 1, FIN_1904 = (Date.UTC(9999, 11, 31) - EPOCA_1904) / MS_DIA + 1;

/** El formato integrado de fecha corta (14): Excel lo muestra con el orden del idioma del equipo (dd/mm/aaaa en español). */
export const FORMATO_FECHA_CORTA = 14;

/** Los formatos integrados que son fechas u horas (ECMA-376, 18.8.30; 27–36 y 50–58, los de los idiomas de Asia oriental). */
const FECHAS_INTEGRADAS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

/**
 * La primera sección de un código de formato sin lo que no son partes de una fecha: los literales entre comillas, los
 * caracteres escapados («\m»), el relleno («_)», «*-») y lo que va entre corchetes (colores y configuración regional,
 * «[Red]», «[$-409]»), salvo las duraciones («[h]», «[mm]», «[ss]»), que se conservan.
 * @param {string} codigo
 * @returns {string}
 */
function partesDelFormato(codigo) {
    let s = '';
    for (let i = 0; i < codigo.length; i++) {
        const c = codigo[i];
        if (c === ';') break;
        if (c === '"') { const f = codigo.indexOf('"', i + 1); i = f < 0 ? codigo.length : f; continue; }
        if (c === '\\' || c === '_' || c === '*') { i++; continue; }
        if (c === '[') {
            const f = codigo.indexOf(']', i + 1);
            const dentro = f < 0 ? '' : codigo.slice(i + 1, f);
            if (/^(h+|m+|s+)$/i.test(dentro)) s += `[${dentro}]`;
            i = f < 0 ? codigo.length : f;
            continue;
        }
        s += c;
    }
    return s;
}

/**
 * ¿Es de fecha (o de hora) un formato de número? Un integrado de fecha, o uno propio con día, mes, año, hora o segundos
 * (d, m, y, h, s, en mayúsculas o minúsculas: LibreOffice escribe «DD/MM/YYYY») fuera de los literales y los corchetes.
 * Las duraciones («[h]:mm:ss», el integrado 46) no: son cantidades y siguen siendo números (los días que guardan).
 * @param {number} id el numFmtId del estilo
 * @param {string | undefined} codigo su formatCode, si el libro lo declara
 * @returns {boolean}
 */
export function esFormatoDeFecha(id, codigo) {
    if (codigo === undefined) return FECHAS_INTEGRADAS.has(id);
    const partes = partesDelFormato(codigo);
    if (/\[(h+|m+|s+)\]/i.test(partes)) return false;
    return /[dmyhs]/i.test(partes);
}

/** «HH:MM:SS» de unos segundos desde la medianoche. @param {number} s */
function hora(s) {
    const dos = (/** @type {number} */ x) => (x < 10 ? '0' : '') + x;
    return `${dos(Math.floor(s / 3600))}:${dos(Math.floor(s / 60) % 60)}:${dos(s % 60)}`;
}

/**
 * Un número de serie de Excel como texto: «AAAA-MM-DD» si es un día entero, «AAAA-MM-DD HH:MM:SS» si tiene hora y
 * «HH:MM:SS» si es menor que 1 (una hora sin día, como las de una columna de horas). Al segundo (Excel guarda hasta
 * milisegundos). null si no es una fecha de Excel (negativo, o pasado el 9999-12-31): la celda queda como número.
 * @param {number} serie
 * @param {boolean} [fecha1904] el libro usa el sistema de 1904
 * @returns {string | null}
 */
export function serieAFecha(serie, fecha1904 = false) {
    if (!(serie >= 0) || serie >= (fecha1904 ? FIN_1904 : FIN_1900)) return null;
    if (serie < 1) return hora(Math.min(86399, Math.round(serie * 86400)));
    const total = Math.round(serie * 86400);
    const dias = Math.floor(total / 86400), segundos = total - dias * 86400;
    const conHora = segundos ? ` ${hora(segundos)}` : '';
    if (!fecha1904 && dias === 60) return `1900-02-29${conHora}`;   // el día que Excel cuenta y no existió
    const d = new Date((fecha1904 ? EPOCA_1904 : EPOCA_1900) + (!fecha1904 && dias < 60 ? dias + 1 : dias) * MS_DIA);
    const dos = (/** @type {number} */ x) => (x < 10 ? '0' : '') + x;
    return `${String(d.getUTCFullYear()).padStart(4, '0')}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())}${conHora}`;
}

/**
 * Una fecha ISO 8601 de una celda de tipo «d» («2024-05-01T13:30:00Z», «2024-05-01», «13:30:00») como las demás fechas:
 * «AAAA-MM-DD», «AAAA-MM-DD HH:MM:SS» o «HH:MM:SS». Lo que no tenga esa forma queda como llegó.
 * @param {string} iso
 * @returns {string}
 */
export function fechaIsoATexto(iso) {
    const t = iso.trim();
    const m = /^(-?\d{4,}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:[.,]\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/.exec(t);
    if (m) {
        const hms = m[2] ? `${m[2]}:${m[3]}:${m[4] || '00'}` : '00:00:00';
        return hms === '00:00:00' ? /** @type {string} */ (m[1]) : `${m[1]} ${hms}`;
    }
    const h = /^T?(\d{2}):(\d{2})(?::(\d{2}))?(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/.exec(t);
    return h ? `${h[1]}:${h[2]}:${h[3] || '00'}` : t;
}

/**
 * Los días desde 1970-01-01 (las fechas de la base del Simulador, core/data/base-columnar.js) como número de serie de
 * Excel, en el sistema de 1900. null antes del 1900-01-01 y después del 9999-12-31, que Excel no tiene como fechas.
 * @param {number} dias
 * @returns {number | null}
 */
export function diasASerie(dias) {
    const s = Math.round(dias) + 25569;   // 25 569: el número de serie del 1970-01-01
    if (s >= 61) return s < FIN_1900 ? s : null;   // desde el 1900-03-01
    if (s >= 2) return s - 1;   // del 1900-01-01 al 1900-02-28: un día menos, por el 29 de febrero de 1900
    return null;
}
