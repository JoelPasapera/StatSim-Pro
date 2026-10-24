// @ts-check
// tests/navegador/recetas/leeme.mjs — las piezas comunes de los README de los ejemplos: el aviso de que los datos son
// simulados, las cifras con el formato de la aplicación (p < .001, r = −.40), las tablas en Markdown (el informe «pedido
// vs. obtenido» y las escalas del maestro, leídos de los archivos del caso), la lista de archivos con su descripción y
// cómo reproducir el caso. Las cifras salen de lo que dio la página (caso.cifras): nada se copia a mano.
import { parsearLineaCSV } from '../../../src/shared/csv.js';
import { pasosEnPalabras } from '../../../src/ejemplos/catalogo.js';

export const AVISO = '> **Datos simulados.** La base de este caso la generó el Simulador de StatSim Pro con una configuración y una semilla fijas. Sirve para ver qué hace cada sección y qué archivos entrega, no es el resultado de una investigación.';

/**
 * Lo que el README afirma con palabras, comprobado con las cifras: si deja de cumplirse (otra versión, otros datos), la
 * generación falla en lugar de escribir un texto que ya no es verdad.
 * @param {boolean} condicion
 * @param {string} afirmacion
 */
export function afirmar(condicion, afirmacion) {
    if (!condicion) throw new Error(`el README afirmaría algo que no se cumple: ${afirmacion}`);
}

/** Un número con decimales fijos y el signo menos tipográfico. @param {number} x @param {number} [d] */
export const num = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d).replace(/^-/, '−') : '—');
/** Un número acotado por 1 (r, p, α) sin el cero inicial, como en APA. @param {number} x @param {number} [d] */
export const sinCero = (x, d = 2) => num(x, d).replace(/^(−?)0\./, '$1.');
/** Un p como en APA: «p < .001» o «p = .023». @param {number} p */
export const pAPA = p => (p < 0.001 ? 'p < .001' : `p = ${sinCero(p, 3)}`);
/** Un p para una columna de tabla: «< .001» o «.023». @param {number} p */
export const pTabla = p => (p < 0.001 ? '< .001' : sinCero(p, 3));
/** Un estadístico: entero si lo es (la U de Mann-Whitney), con dos decimales si no. @param {number} x */
export const estadistico = x => (Number.isInteger(x) ? String(x).replace(/^-/, '−') : num(x));
/** La letra del estadístico de una prueba de grupos. @param {string} prueba */
export const letraDe = prueba => (/Mann-Whitney/.test(prueba) ? 'U' : /Kruskal/.test(prueba) ? 'H' : /ANOVA/.test(prueba) ? 'F' : /^t\b|t de/.test(prueba) ? 't' : 'estadístico');

/**
 * Una tabla en Markdown.
 * @param {string[]} cabecera
 * @param {Array<Array<string | number>>} filas
 */
export function tabla(cabecera, filas) {
    const celda = (/** @type {string | number} */ c) => String(c).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
    return [`| ${cabecera.map(celda).join(' | ')} |`, `| ${cabecera.map(() => '---').join(' | ')} |`, ...filas.map(f => `| ${f.map(celda).join(' | ')} |`)].join('\n');
}

/** Las filas de un CSV (RFC 4180, una por línea), sin las vacías. @param {string} texto */
export function filasCSV(texto) {
    return texto.replace(/^\ufeff/, '').split(/\r?\n/).filter(l => l.trim()).map(l => parsearLineaCSV(l).map(c => String(c)));
}

/**
 * El informe «pedido vs. obtenido» del Simulador (su CSV, tal como lo descargó la página) en Markdown.
 * @param {string} csv
 */
export function tablaInforme(csv) {
    const [cabecera, ...filas] = filasCSV(csv);
    const conImperfecciones = filas.some(f => (f[5] || '').trim() !== '');
    const nombres = ['Parámetro', 'Variable', 'Pedido', 'Obtenido', 'Estado', ...(conImperfecciones ? ['Con las imperfecciones'] : [])];
    if (!cabecera || cabecera[0] !== 'Parametro') throw new Error('el informe no tiene la cabecera esperada: ' + (cabecera || []).join(','));
    return tabla(nombres, filas.filter(f => f[0] !== 'imperfecciones').map(f => f.slice(0, nombres.length)));
}

/**
 * Las escalas que pide un archivo maestro (su bloque ###PRUEBAS###), en Markdown.
 * @param {string} maestro
 */
export function tablaEscalas(maestro) {
    const bloque = (maestro.split('###PRUEBAS###')[1] || '').split(/###[A-Z]+###/)[0] || '';
    const [, ...filas] = filasCSV(bloque);
    return tabla(['Instrumento', 'Escala', 'Ítems', 'Respuesta por ítem', 'Media pedida', 'DE pedida', 'α pedido'],
        filas.map(f => [f[0] || '', f[1] || '', f[2] || '', `${f[6]} a ${f[7]}`, f[4] || '', f[5] || '', f[8] || '']));
}

/** El tamaño de un archivo, legible. @param {number} bytes */
const tamano = bytes => (bytes >= 1024 * 1024 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/**
 * La lista de los archivos del caso (sin el README ni la verificación), con lo que es cada uno.
 * @param {import('../ejemplos.mjs').Caso} caso
 * @param {Array<[RegExp, string]>} descripciones la primera que encaja con la ruta da la descripción
 */
export function listaArchivos(caso, descripciones) {
    const filas = [...caso.archivos.keys()].filter(r => r !== 'README.md' && r !== 'verificacion.json').sort().map(ruta => {
        const d = descripciones.find(([re]) => re.test(ruta));
        if (!d) throw new Error(`${caso.carpeta}: falta la descripción de «${ruta}» en su README`);
        caso.descripciones.set(ruta, d[1]);   // (2027.01.02) también para la pestaña «Ejemplos» (verificacion.json)
        return [`[${ruta}](${ruta})`, d[1], tamano(/** @type {Buffer} */ (caso.archivos.get(ruta)).length)];
    });
    return tabla(['Archivo', 'Qué es', 'Tamaño'], filas);
}

/** Las descripciones que comparten todos los casos (las del Simulador y el proyecto). @type {Array<[RegExp, string]>} */
export const DESCRIPCIONES_COMUNES = [
    [/^simulador\/configuracion_completa_simulador\.csv$/, 'La configuración completa del Simulador (el archivo maestro), como la exporta «Exportar todo». Se abre con «Importar todo».'],
    [/^simulador\/base_datos_simulada_excel_espanol\.csv$/, 'La base en CSV para Excel en español (punto y coma y coma decimal): botón «CSV (Excel español)».'],
    [/^simulador\/base_datos_simulada_internacional\.csv$/, 'La base en CSV internacional (coma y punto decimal): botón «CSV (internacional)».'],
    [/^simulador\/base_datos_simulada\.sav$/, 'La base en SPSS, con las etiquetas de variable y de valor y el nivel de medida: botón «SPSS (.sav)».'],
    [/^simulador\/base_datos_simulada\.xlsx$/, 'La base en Excel, con tres hojas (Datos, Diccionario e Informe): botón «Excel (.xlsx)».'],
    [/^simulador\/informe_pedido_vs_obtenido\.csv$/, 'Cada parámetro pedido, medido sobre la base generada: botón «Descargar informe (CSV)».'],
    [/^simulador\/verificacion_de_la_base\.pdf$/, 'La verificación de la base impresa en PDF (avisos, pedido vs. obtenido y resumen): botón «Imprimir o guardar en PDF» del Simulador.'],
    [/^proyecto\.statsim$/, 'El proyecto completo (configuración y base del Simulador, datos del Analizador y lo demás que había en la página): Ayuda → «Guardar proyecto». Se abre con Ayuda → «Abrir proyecto».'],
    [/capitulo_resultados_APA\.docx$/, 'El capítulo de resultados en Word (APA 7) de la correlación analizada: botón «Exportar capítulo a Word». Se abre en Microsoft Word (LibreOffice y Google Docs no leen la técnica con que se arma).'],
    [/resultados_analisis\.txt$/, 'Los resultados en texto plano: botón «Descargar resultados».'],
    [/resultados\.pdf$/, 'La página de resultados impresa en PDF (solo los resultados, sin los controles): botón «Imprimir o guardar en PDF» del Analizador.'],
];

/**
 * Cómo se abre, se rehace y se comprueba el caso.
 * @param {string} carpeta
 * @param {{ desde: number, hasta: number, nota?: string }} repetir (2027.01.02) los pasos del Analizador que hay que volver
 *   a dar tras abrir el proyecto (los de la receta: los mismos que marca la guía de la pestaña «Ejemplos»)
 */
export function seccionReproducir(carpeta, repetir) {
    const analizador = `tras abrirlo, repite ${pasosEnPalabras(repetir)} del Analizador${repetir.nota ? ` (${repetir.nota})` : ''}.`;
    return `## Cómo reproducirlo

- **Abrirlo en la página.** En la pestaña «Ejemplos», elige este caso y pulsa «Abrir en StatSim» (o, en Ayuda, «Abrir proyecto» con \`proyecto.statsim\`): el Simulador vuelve con su configuración y su base (la misma, bit a bit) y el Analizador con sus datos y la configuración de la investigación. Los análisis no se guardan en el proyecto: ${analizador} En la guía que se abre con el caso, «Hazlo por mí» (o «Hazlo todo por mí») los repite a la vista, como se hicieron aquí, y «Muéstrame» señala dónde está cada cosa.
- **Desde cero.** En el Simulador, «Importar todo» con \`simulador/configuracion_completa_simulador.csv\` y «Generar»: con la misma semilla sale la misma base. Después, los pasos del Analizador de arriba.
- **Comprobarlo.** \`npm test\` abre este proyecto con el código del momento y comprueba que regenera la misma base y que el Analizador da las cifras de \`verificacion.json\`. Con Playwright instalado, \`node tests/navegador/ejemplos.mjs comprobar ${carpeta}\` rehace el caso entero en Chromium, pulsando los botones, y lo compara con esta carpeta: byte a byte, salvo los PDF, de los que se compara su texto impreso y sus páginas (y en otra computadora, con otras fuentes, del Word se compara su texto).`;
}

/**
 * Por qué el Simulador avisa de la normalidad de unas escalas Likert (y no es un error de la configuración).
 * @param {string} avisos el texto de la tarjeta de avisos
 */
export function seccionAvisos(avisos) {
    if (!avisos) return '';
    const n = (/(\d+) avisos?/.exec(avisos) || [])[1] || '';
    return `## Los avisos del Simulador

Al generar, el Simulador muestra ${n ? `${n} avisos` : 'avisos'} bajo «Generar» (están al principio de \`simulador/verificacion_de_la_base.pdf\`). No son errores de la configuración: anticipan cómo se comportarán los datos. El más repetido dice que el total de una escala Likert es un número entero «escalonado» y que, con más de 50 casos, la prueba de Kolmogorov-Smirnov rechazará su normalidad casi siempre aunque la forma sea normal. Por eso el Analizador termina usando pruebas no paramétricas (Spearman, Mann-Whitney, Kruskal-Wallis): es lo que pasa con datos Likert reales de ese tamaño.`;
}
