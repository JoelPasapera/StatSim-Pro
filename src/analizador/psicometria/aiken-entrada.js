// analizador/psicometria/aiken-entrada.js — convierte una tabla de valoraciones (una fila por ítem, una columna por
// juez) pegada desde Excel o cargada de un CSV en la estructura que analiza aiken.js. Acepta tabulador (copiar desde
// Excel), punto y coma (CSV en español), coma o espacios; con o sin encabezado de jueces y con o sin una primera
// columna que identifique los ítems (texto o números 1, 2, 3…). Las celdas vacías son valoraciones faltantes (null).

// Número en formato español o internacional («4», «3,0», «3.0»); null si la celda está vacía; NaN si no es número
export function aNumero(celda) {
    const s = String(celda ?? '').trim();
    if (s === '') return null;
    const normal = s.replace(/\s/g, '').replace(',', '.');
    return /^[-+]?\d+(\.\d+)?$/.test(normal) ? Number(normal) : NaN;
}

// Tabulador (copiado desde Excel) > punto y coma (CSV en español) > coma (CSV internacional) > espacios.
// Las valoraciones son enteras, así que una coma nunca es decimal aquí; se ignoran los separadores entre comillas.
export function detectarSeparador(lineas) {
    const muestra = lineas.slice(0, 5).map(l => l.replace(/"[^"]*"/g, '')).join('\n');
    if (muestra.includes('\t')) return '\t';
    if (muestra.includes(';')) return ';';
    if (muestra.includes(',')) return ',';
    return ' ';
}

// Divide una línea respetando las comillas de CSV («"Ítem 1; versión corta";4;3» → 3 celdas; "" es una comilla)
export function dividirLinea(linea, sep) {
    if (sep === ' ') return linea.trim().split(/\s+/);
    const celdas = [];
    let actual = '', entre = false;
    for (let i = 0; i < linea.length; i++) {
        const ch = linea[i];
        if (entre) {
            if (ch === '"' && linea[i + 1] === '"') { actual += '"'; i++; }
            else if (ch === '"') entre = false;
            else actual += ch;
        } else if (ch === '"' && actual.trim() === '') { entre = true; actual = ''; }
        else if (ch === sep) { celdas.push(actual.trim()); actual = ''; }
        else actual += ch;
    }
    celdas.push(actual.trim());
    return celdas;
}

const esTexto = c => { const v = aNumero(c); return v !== null && Number.isNaN(v); };

/**
 * texto → { etiquetas, jueces, valoraciones: (number|null)[ítem][juez], errores, avisos, formato }
 * Los errores llevan la fila y la columna tal como se ven en la hoja (1-indexadas, contando encabezado y etiquetas).
 */
export function parsearMatriz(texto) {
    const errores = [], avisos = [];
    const lineas = String(texto || '').replace(/^\ufeff/, '').replace(/\r\n?/g, '\n').split('\n').filter(l => l.trim() !== '');
    if (lineas.length === 0) return { etiquetas: [], jueces: [], valoraciones: [], errores: ['La tabla está vacía.'], avisos };
    const sep = detectarSeparador(lineas);
    const filas = lineas.map(l => dividirLinea(l, sep));
    // encabezado = primera fila cuyas celdas (sin la primera) son, en su mayoría (≥ 60 %), texto: nombres de jueces.
    // Una fila de datos con una errata («4, x, 3») NO pasa por encabezado: se lee como datos y se señala el error.
    const celdas0 = filas[0].slice(1).filter(c => String(c).trim() !== '');
    const conEncabezado = celdas0.length > 0 && celdas0.filter(esTexto).length / celdas0.length >= 0.6;
    const cuerpo = conEncabezado ? filas.slice(1) : filas;
    // primera columna = identificación de los ítems si en la mayoría de las filas es texto («Ítem 3», «Me siento…»)
    // o si es la numeración 1, 2, 3… (al menos tres filas); si no, es la columna del primer juez.
    const primera = cuerpo.map(f => f[0]);
    const deTexto = primera.filter(esTexto).length >= Math.ceil(cuerpo.length / 2);
    const esNumeracion = cuerpo.length >= 3 && primera.every((c, i) => aNumero(c) === i + 1);
    const conEtiquetas = deTexto || esNumeracion;
    const desde = conEtiquetas ? 1 : 0;
    const nJueces = Math.max(0, ...cuerpo.map(f => f.length - desde), conEncabezado ? filas[0].length - desde : 0);
    if (nJueces === 0 || cuerpo.length === 0) return { etiquetas: [], jueces: [], valoraciones: [], errores: ['No se encontraron valoraciones: revisa que la tabla tenga una fila por ítem y una columna por juez.'], avisos };
    const jueces = Array.from({ length: nJueces }, (_, j) => (conEncabezado && filas[0][desde + j]) || `Juez ${j + 1}`);
    const etiquetas = cuerpo.map((f, i) => (deTexto && f[0]) ? f[0] : `Ítem ${esNumeracion ? aNumero(f[0]) : i + 1}`);
    let cortas = 0;
    const valoraciones = cuerpo.map((f, i) => {
        if (f.length - desde < nJueces) cortas++;
        return Array.from({ length: nJueces }, (_, j) => {
            const celda = f[desde + j];
            const v = aNumero(celda);
            if (v !== null && Number.isNaN(v)) {
                errores.push(`Fila ${i + 1 + (conEncabezado ? 1 : 0)}, columna ${j + 1 + desde} («${etiquetas[i]}», ${jueces[j]}): «${celda}» no es un número.`);
                return null;
            }
            return v;
        });
    });
    if (cortas) avisos.push(`${cortas} fila(s) tienen menos columnas que jueces: esas celdas se tratan como valoraciones faltantes.`);
    return { etiquetas, jueces, valoraciones, errores, avisos, formato: { separador: sep === ' ' ? 'espacios' : sep, conEncabezado, conEtiquetas, numeracion: esNumeracion && !deTexto } };
}
