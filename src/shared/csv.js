// @ts-check
// shared/csv.js — utilidades de CSV y de atributos HTML.
// Extraído de app.js (Fase 2) sin cambiar comportamiento; importaciones explícitas entre módulos.

// ========================================
// UTILIDADES PARA CSV
// ========================================

/**
 * Campos de una línea de CSV separados por `delimitador`, sin partir un campo entrecomillado que lo contenga
 * («"Lima, Perú"»); las comillas se quitan y cada campo se recorta. (2026.12.24) Una sola implementación: el cargador de
 * CSV del Analizador tenía su copia, con el delimitador como parámetro.
 * @param {string} linea
 * @param {string} delimitador
 * @returns {string[]}
 */
function parsearLineaCSVCon(linea, delimitador) {
    const resultado = [];
    let dentroComillas = false;
    let valorActual = '';
    for (let i = 0; i < linea.length; i++) {
        const char = linea[i];
        if (char === '"') {
            // (2026.12.30) dentro de unas comillas, «""» es una comilla (antes se perdían: «Bienestar ""subjetivo""» volvía
            // como «Bienestar subjetivo»)
            if (dentroComillas && linea[i + 1] === '"') { valorActual += '"'; i++; }
            else dentroComillas = !dentroComillas;
        } else if (char === delimitador && !dentroComillas) {
            resultado.push(conFormulaOriginal(valorActual.trim()));
            valorActual = '';
        } else {
            valorActual += char;
        }
    }
    resultado.push(conFormulaOriginal(valorActual.trim()));
    return resultado;
}

/**
 * Campos de una línea de CSV separada por comas (las tablas de configuración del Simulador). Un solo parámetro: es
 * segura como callback de map.
 * @param {string} linea
 * @returns {string[]}
 */
function parsearLineaCSV(linea) { return parsearLineaCSVCon(linea, ','); }

/**
 * (2026.12.30) Un valor como campo de CSV: entre comillas, con las comillas dobladas, si contiene el delimitador, comillas
 * o un salto de línea (RFC 4180). Antes, cada tabla del Simulador tenía su copia, y casi todas solo entrecomillaban si había
 * una coma, sin doblar las comillas.
 * @param {unknown} v
 * @param {string} [delimitador]
 * @returns {string}
 */
function campoCSV(v, delimitador = ',') {
    // (revisión 2026.12.30) y sin fórmulas: un nombre que llega de un archivo maestro ajeno («=HYPERLINK(…)») se ejecutaba
    // al abrir en Excel la tabla o el maestro exportados; parsearLineaCSVCon le quita el apóstrofo al importarlo
    const s = sinFormula(v);
    return s.includes(delimitador) || /["\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Un valor como atributo HTML entre comillas dobles (escapa &, " y <).
 * @param {unknown} v
 * @returns {string}
 */
function escapeAttr(v) { return String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

/**
 * (2026.12.30) Un texto que llega de fuera (títulos, autores o resúmenes de las bases, nombres de revistas) y va a un CSV:
 * si empieza por «=», «+», «-», «@», un tabulador o un retorno de carro y no es un número, Excel y LibreOffice lo toman por
 * una fórmula («=HYPERLINK(…)», «@SUM(…)|cmd…»); se le antepone un apóstrofo, que la hoja muestra como texto (OWASP,
 * «CSV Injection»). Los números («-0.5», «+51») quedan como están.
 * @param {unknown} v
 * @returns {string}
 */
function sinFormula(v) {
    const s = String(v ?? '');
    return esFormula(s) ? `'${s}` : s;
}
/** Un número tal como puede escribirse en una celda: «-0.5», «+51», «-.5», «1,5», «-2e-3», «45%». */
const ES_NUMERO = /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?%?$/;
/**
 * ¿Lo tomaría una hoja de cálculo por una fórmula? Empieza por «=», «+», «-», «@», un tabulador o un retorno de carro y no
 * es un número; también tras los apóstrofos que ya lleve (revisión 2026.12.30: así un texto como «'-Estrés» recibe otro y
 * vuelve entero, porque la lectura quita solo uno).
 * @param {string} s
 */
function esFormula(s) {
    const m = /^'*([=+\-@\t\r][\s\S]*)$/.exec(s);
    return !!m && !ES_NUMERO.test(/** @type {string} */ (m[1]));
}

/**
 * (revisión 2026.12.30) Lo contrario de sinFormula, al leer un CSV que escribió el programa: «'=x» vuelve a ser «=x» y
 * «''-Estrés», «'-Estrés». Solo el apóstrofo que sinFormula antepone; cualquier otro texto queda como está.
 * @param {string} s
 * @returns {string}
 */
function conFormulaOriginal(s) {
    return s.startsWith("'") && esFormula(s.slice(1)) ? s.slice(1) : s;
}

export { parsearLineaCSV, parsearLineaCSVCon, escapeAttr, campoCSV, sinFormula, conFormulaOriginal };
