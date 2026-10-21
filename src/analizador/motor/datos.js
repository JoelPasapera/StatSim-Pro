// @ts-check
// analizador/motor/datos.js — la base del Analizador como datos: leer un CSV en filas, sacar los valores numéricos de una
// columna y reconocer una serie constante (2026.12.24, fase F6, paso 4; antes, dentro de estadistica.js). Una celda es un
// número solo si lo es COMPLETA (core/data/celdas.js, la conversión de todo el Analizador): «3ro», «5 años» o «2024-05-01»
// quedan como texto, «3,5» es 3,5 y un perdido nunca es 0.
// (2026.12.29) El CSV se lee entero con un autómata que respeta las comillas (antes, línea a línea: un comentario con un
// salto de línea dentro de sus comillas, como los de Google Forms, partía la fila y el participante se perdía o lo
// sustituía una fila basura); el encabezado, con el mismo lector (los nombres entre comillas del write.csv de R quedaban
// con las comillas); el delimitador, el que da a las filas el número de campos del encabezado («;», «,», tabulador o «|»,
// o el que fija una primera línea «sep=;»); las filas descartadas, los nombres repetidos o vacíos y los separadores de
// miles («1.500» en un CSV con «;») se avisan.
import { aNumero } from '../../core/data/celdas.js';
import { sinMarcado } from '../../core/data/texto.js';
import { conFormulaOriginal } from '../../shared/csv.js';

/** @typedef {Record<string, unknown>} Fila */

/**
 * ¿Son todos los valores iguales (y hay alguno)? Con valores numéricos, una serie de varianza cero.
 * @param {unknown[]} valores
 * @returns {boolean}
 */
export function esConstante(valores) {
    return valores.length > 0 && valores.every(v => v === valores[0]);
}

/**
 * Los valores numéricos de una columna, sin los perdidos ni los textos (no conserva la alineación por fila).
 * @param {Fila[] | null} datos
 * @param {string} columna
 * @returns {number[]}
 */
export function valoresNumericos(datos, columna) {
    if (!datos) return [];
    return datos.map(fila => aNumero(fila[columna])).filter(Number.isFinite);
}

/**
 * @typedef {{
 *   filas: Record<string, string | number>[], columnas: string[], delimitador: string,
 *   descartadas: number[], renombradas: Array<[string, string]>, avisos: string[]
 * }} LecturaCSV
 *   descartadas: la línea del archivo donde empieza cada fila descartada (por tener otro número de campos que el
 *   encabezado); renombradas: [nombre en el archivo, nombre en la base]; avisos: todo lo anterior, en frases
 */

/** Los delimitadores que se prueban, en el orden de preferencia de un empate. */
const DELIMITADORES = [';', ',', '\t', '|'];
/** @type {Record<string, string>} */
const NOMBRE_DELIMITADOR = { ';': 'punto y coma', ',': 'coma', '\t': 'tabulador', '|': 'barra vertical' };

/**
 * Los registros de un CSV (RFC 4180, con tolerancia): los campos van separados por el delimitador; un campo que EMPIEZA
 * con comillas (tras espacios, si los hay) puede contener el delimitador, saltos de línea y comillas dobladas («""» es una
 * comilla); una comilla en medio de un campo sin comillas es un carácter más (5" pulgadas); un registro termina en LF,
 * CRLF o CR fuera de las comillas. Con `multilinea` = false un salto de línea siempre termina el registro (para un archivo
 * con una comilla sin cerrar).
 * @param {string} texto
 * @param {string} delimitador
 * @param {{ maximo?: number, multilinea?: boolean }} [opciones]
 * @returns {{ registros: Array<{ campos: string[], linea: number }>, sinCerrar: number }}
 *   sinCerrar: la línea donde empieza una comilla que no se cerró (0 si no hay)
 */
function tokenizar(texto, delimitador, opciones = {}) {
    const maximo = opciones.maximo ?? Infinity, multilinea = opciones.multilinea !== false;
    /** @type {Array<{ campos: string[], linea: number }>} */
    const registros = [];
    /** @type {string[]} */
    let campos = [];
    let campo = '', dentro = false, linea = 1, inicio = 1, abierta = 0, enBlanco = true;
    const n = texto.length;
    for (let i = 0; i < n; i++) {
        const c = texto[i];
        if (dentro) {
            if (c === '"') {
                if (texto[i + 1] === '"') { campo += '"'; i++; } else dentro = false;
                continue;
            }
            if (c === '\n' || c === '\r') {
                if (!multilinea) { dentro = false; i--; continue; }   // se vuelve a leer como fin de registro
                if (c === '\r' && texto[i + 1] === '\n') { campo += '\r\n'; i++; } else campo += c;
                linea++;
                continue;
            }
            campo += c;
            continue;
        }
        if (c === '"' && enBlanco) { dentro = true; abierta = linea; campo = ''; enBlanco = false; continue; }
        if (c === delimitador) { campos.push(campo); campo = ''; enBlanco = true; continue; }
        if (c === '\n' || c === '\r') {
            campos.push(campo);
            registros.push({ campos, linea: inicio });
            campos = []; campo = ''; enBlanco = true;
            if (c === '\r' && texto[i + 1] === '\n') i++;
            linea++; inicio = linea;
            if (registros.length >= maximo) return { registros, sinCerrar: 0 };
            continue;
        }
        if (enBlanco && (c === ' ' || c === '\t') && c !== delimitador) { campo += c; continue; }
        enBlanco = false;
        campo += c;
    }
    if (campo !== '' || campos.length) { campos.push(campo); registros.push({ campos, linea: inicio }); }
    return { registros, sinCerrar: dentro ? abierta : 0 };
}

/** ¿Está vacío el registro (una línea en blanco)? @param {string[]} campos */
const enBlancoTodo = campos => campos.every(c => c.trim() === '');

/**
 * El delimitador del CSV: el que da a las primeras filas el mismo número de campos que al encabezado (a igualdad, el
 * que da más campos y, después, «;», «,», tabulador y «|», en ese orden).
 * @param {string} texto
 * @returns {string}
 */
function detectarDelimitador(texto) {
    let mejor = ',', mejorPuntos = -1;
    for (const d of DELIMITADORES) {
        // (2026.12.29, revisión) con una comilla sin cerrar, línea a línea, como se leerá: en modo multilínea la comilla se
        // tragaba el resto del archivo con el delimitador bueno y ganaba otro («,» en un encabezado con comas)
        let { registros, sinCerrar } = tokenizar(texto, d, { maximo: 30 });
        if (sinCerrar) ({ registros } = tokenizar(texto, d, { maximo: 30, multilinea: false }));
        const utiles = registros.filter(r => !enBlancoTodo(r.campos));
        if (!utiles.length) continue;
        const k = utiles[0].campos.length;
        if (k < 2) continue;
        const resto = utiles.slice(1);
        const coinciden = resto.length ? resto.filter(r => r.campos.length === k).length / resto.length : 1;
        const puntos = coinciden * 1000 + Math.min(k, 999);
        if (puntos > mejorPuntos) { mejor = d; mejorPuntos = puntos; }
    }
    return mejor;
}

// Los números con separador de miles en un CSV con «;» (Excel en español): «1.500», «1.234.567», «1.800,50».
const MILES = /^[+-]?[1-9]\d{0,2}(\.\d{3})+$/, MILES_COMA = /^[+-]?[1-9]\d{0,2}(\.\d{3})+,\d+$/, VARIOS_GRUPOS = /^[+-]?[1-9]\d{0,2}(\.\d{3}){2,}$/;
const COMA_DECIMAL = /^[+-]?\d*,\d+$/, PUNTO_DECIMAL = /^[+-]?\d*\.\d+$/;

/**
 * ¿Usa la columna el punto como separador de miles? Solo en un CSV con «;» y si ningún valor tiene el punto como decimal
 * («3.14»): 'si' cuando lo confirma algún valor («1.800,50», «1.234.567» o un decimal con coma en la misma columna),
 * 'dudoso' cuando solo hay valores como «1.500» (¿1500 o 1,5?) y 'no' en otro caso.
 * @param {string[]} valores  los de la columna, recortados
 * @returns {'si' | 'dudoso' | 'no'}
 */
function puntoDeMiles(valores) {
    let miles = 0, confirma = 0, punto = 0;
    for (const v of valores) {
        if (!v) continue;
        if (MILES_COMA.test(v) || VARIOS_GRUPOS.test(v)) { miles++; confirma++; }
        else if (MILES.test(v)) miles++;
        else if (COMA_DECIMAL.test(v)) confirma++;
        else if (PUNTO_DECIMAL.test(v)) punto++;
    }
    if (!miles || punto) return 'no';
    return confirma ? 'si' : 'dudoso';
}

/** Lista breve de números de línea: «4, 9 y 12», o los ocho primeros y «…». @param {number[]} lineas */
function listaDeLineas(lineas) {
    const muestra = lineas.slice(0, 8).map(String);
    if (lineas.length > 8) return muestra.join(', ') + '…';
    return muestra.length > 1 ? `${muestra.slice(0, -1).join(', ')} y ${muestra[muestra.length - 1]}` : muestra[0];
}

/**
 * Lee un CSV con encabezados y cuenta lo que hizo. Cada celda es un número solo si lo es completa (con punto o con coma
 * decimal; en un CSV con «;», también con punto de miles cuando la columna lo confirma); el resto, texto recortado, sin
 * «<» ni «>» (shared/html.js, sinMarcado: los nombres y las categorías se pintan en los informes). Una fila con otro
 * número de campos que el encabezado se descarta (los campos vacíos de más al final no cuentan) y se avisa; las filas sin
 * ningún dato son casos con todos sus valores perdidos (salvo las del final, y las líneas en blanco de un archivo de varias
 * columnas, que se saltan). Lanza un error sin filas de datos o si ninguna coincide con el encabezado.
 * @param {string} texto
 * @returns {LecturaCSV}
 */
export function leerCSVDetallado(texto) {
    let cuerpo = String(texto ?? '');
    if (cuerpo.charCodeAt(0) === 0xFEFF) cuerpo = cuerpo.slice(1);
    /** @type {string[]} */
    const avisos = [];
    // «sep=;» en la primera línea: el delimitador lo fija el archivo (Excel lo entiende así)
    let delimitador = '';
    const sep = /^\s*"?sep=(.)"?[ \t]*(\r\n|\n|\r|$)/i.exec(cuerpo);
    if (sep) { delimitador = sep[1]; cuerpo = cuerpo.slice(sep[0].length); }
    if (!delimitador) delimitador = detectarDelimitador(cuerpo);
    let { registros, sinCerrar } = tokenizar(cuerpo, delimitador);
    if (sinCerrar) {
        ({ registros } = tokenizar(cuerpo, delimitador, { multilinea: false }));
        avisos.push(`una comilla de la línea ${sinCerrar} no se cierra: el archivo se leyó línea a línea`);
    }
    // (2026.12.29, revisión) Las filas sin ningún dato: las del final (Excel deja a veces «;;;» o líneas en blanco tras la
    // última fila) se quitan; las de en medio son casos con todos los valores perdidos y se conservan, como antes de la
    // 2026.12.29 (se descartaban sin avisar: n bajaba y desaparecían los perdidos). Una línea en blanco en medio es un caso
    // perdido si el archivo tiene una sola columna (así guarda Excel la celda vacía) y se salta si tiene varias.
    while (registros.length && enBlancoTodo(/** @type {{ campos: string[] }} */ (registros[0]).campos)) registros.shift();
    while (registros.length && enBlancoTodo(/** @type {{ campos: string[] }} */ (registros[registros.length - 1]).campos)) registros.pop();
    if (registros.length < 2) throw new Error('El archivo CSV debe tener al menos encabezados y una fila de datos');

    // El encabezado: nombres recortados, sin «<» ni «>», sin repetir y sin vacíos (los vacíos del final, con la columna
    // vacía, se quitan: Excel deja a veces «;;;» al final de cada línea).
    // (revisión 2026.12.30) sin el apóstrofo que las exportaciones ponen ante un texto que empieza por «=», «+», «-» o «@»
    // (shared/csv.js, sinFormula: para que Excel no lo ejecute); la base del Simulador en CSV volvía con «'- de 18»
    const crudos = /** @type {{ campos: string[] }} */ (registros[0]).campos.map(h => conFormulaOriginal(h.trim()));
    const filasCrudas = registros.slice(1);
    let k = crudos.length;
    while (k > 1 && crudos[k - 1] === '' && filasCrudas.every(r => (r.campos[k - 1] ?? '').trim() === '')) k--;
    /** @type {Array<[string, string]>} */
    const renombradas = [];
    /** @type {string[]} */
    const columnas = [];
    const usados = new Set();
    for (let j = 0; j < k; j++) {
        const original = /** @type {string} */ (crudos[j]);
        let nombre = sinMarcado(original) || `Columna_${j + 1}`;
        if (usados.has(nombre)) { let s = 2; while (usados.has(`${nombre} (${s})`)) s++; nombre = `${nombre} (${s})`; }
        usados.add(nombre);
        columnas.push(nombre);
        if (nombre !== original) renombradas.push([original, nombre]);
    }

    // Las filas: las de k campos (los vacíos de más al final se quitan); el resto se descarta con su número de línea.
    /** @type {number[]} */
    const descartadas = [];
    /** @type {string[][]} */
    const valores = [];
    let sinDatos = 0;
    for (const r of filasCrudas) {
        let campos = r.campos;
        const lineaEnBlanco = campos.length === 1 && /** @type {string} */ (campos[0]).trim() === '';
        if (lineaEnBlanco && k > 1) continue;
        if (enBlancoTodo(campos)) { sinDatos++; if (lineaEnBlanco) campos = ['']; }
        if (campos.length > k && campos.slice(k).every(c => c.trim() === '')) campos = campos.slice(0, k);
        if (campos.length !== k) { descartadas.push(r.linea); continue; }
        valores.push(campos.map(c => c.trim()));
    }
    if (!valores.length) {
        throw new Error('Ninguna fila coincide con el número de columnas del encabezado; revisa el delimitador o el formato del CSV');
    }

    // Los números: con punto de miles en las columnas que lo confirman (solo con «;»).
    const miles = columnas.map((_, j) => (delimitador === ';' ? puntoDeMiles(valores.map(f => /** @type {string} */ (f[j]))) : 'no'));
    /** @type {Record<string, string | number>[]} */
    const filas = valores.map(f => {
        /** @type {Record<string, string | number>} */
        const fila = {};
        for (let j = 0; j < k; j++) {
            const valor = /** @type {string} */ (f[j]);
            // (2026.12.18) antes, parseFloat: «3ro», «5 años» o «2024-05-01» se guardaban como 3, 5 y 2024; (revisión
            // 2026.11.03) y la coma decimal («3,5») se cortaba en 3
            let numero = aNumero(valor);
            if (miles[j] === 'si' && (MILES.test(valor) || MILES_COMA.test(valor))) numero = Number(valor.replace(/\./g, '').replace(',', '.'));
            fila[/** @type {string} */ (columnas[j])] = Number.isNaN(numero) ? sinMarcado(conFormulaOriginal(valor)) : numero;
        }
        return fila;
    });

    if (sinDatos) avisos.push(`${sinDatos} fila(s) sin ningún dato se conservan como casos con todos sus valores perdidos`);
    if (descartadas.length) avisos.push(`se descartaron ${descartadas.length} fila(s) con otro número de campos que el encabezado (${k}, separados por ${NOMBRE_DELIMITADOR[delimitador] || `«${delimitador}»`}): línea(s) ${listaDeLineas(descartadas)}`);
    renombradas.forEach(([a, b]) => avisos.push(a === '' ? `una columna sin nombre se llama «${b}»` : `la columna «${a}» se llama «${b}» (${a.trim() !== sinMarcado(a) ? 'sin < ni >' : 'el nombre estaba repetido'})`));
    columnas.forEach((c, j) => {
        if (miles[j] === 'si') avisos.push(`en «${c}», el punto separa los miles («1.500» = 1500)`);
        else if (miles[j] === 'dudoso') avisos.push(`en «${c}», valores como «1.500» se leyeron con el punto como decimal (1,5); si el punto separa los miles, guarda el archivo sin separador de miles`);
    });
    return { filas, columnas, delimitador, descartadas, renombradas, avisos };
}

/**
 * Filas de un CSV con encabezados (leerCSVDetallado, sin el recuento de lo que hizo).
 * @param {string} texto
 * @returns {Record<string, string | number>[]}
 */
export function leerCSV(texto) {
    return leerCSVDetallado(texto).filas;
}
