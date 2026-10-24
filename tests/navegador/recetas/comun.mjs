// @ts-check
// tests/navegador/recetas/comun.mjs — lo que repiten las recetas de los ejemplos: el tramo del Simulador (importar el
// maestro, generar, descargar todo e imprimir la verificación), guardar lo que da un análisis (el Word, el texto y el PDF)
// y leer de la página las cifras que cita el README (lo que calculó la aplicación, no una copia a mano).
import * as P from '../pasos.mjs';

/**
 * El Simulador de punta a punta: importa el maestro, genera y guarda en simulador/ la base en sus cuatro formatos, el
 * informe «pedido vs. obtenido», el maestro que exporta la página y la verificación impresa en PDF.
 * @param {import('../ejemplos.mjs').Caso} caso
 * @param {string} maestro el texto del archivo maestro
 * @returns {Promise<{ n: number, columnas: string[], avisos: string, importacion: string }>}
 */
export async function simularYDescargar(caso, maestro) {
    const p = caso.pagina;
    const importacion = await P.importarMaestro(p, { nombre: 'configuracion_completa_simulador.csv', texto: maestro });
    const generacion = await P.generarBase(p);
    const d = await P.descargasDelSimulador(p);
    caso.guardar('simulador/base_datos_simulada_excel_espanol.csv', d.csvEspanol.bytes);
    caso.guardar('simulador/base_datos_simulada_internacional.csv', d.csvInternacional.bytes);
    caso.guardar('simulador/' + d.sav.nombre, d.sav.bytes);
    caso.guardar('simulador/' + d.xlsx.nombre, d.xlsx.bytes);
    caso.guardar('simulador/' + d.informe.nombre, d.informe.bytes);
    caso.guardar('simulador/' + d.maestro.nombre, d.maestro.bytes);
    caso.guardarImpreso('simulador/verificacion_de_la_base.pdf', await P.imprimirSimulador(p));
    caso.cifras.simulador = { ...generacion, importacion, informe: d.informe.bytes.toString('utf8') };
    return { ...generacion, importacion };
}

/**
 * Guarda lo que da el análisis a la vista: el capítulo en Word (si es una correlación de dos variables), los resultados en
 * texto y la página impresa en PDF. (2027.01.03) Lo anota en el guion de su paso del README (la guía lo señala).
 * @param {import('../ejemplos.mjs').Caso} caso
 * @param {number} paso el número del paso del README en que se descarga
 * @param {string} carpeta la subcarpeta de analizador/ («1-correlacion»…)
 * @param {{ word?: boolean }} [opciones]
 */
export async function guardarAnalisis(caso, paso, carpeta, { word = true } = {}) {
    const a = await caso.hacer(paso, 'exportarAnalisis', { word, carpeta });
    if (a.word) caso.guardar(`analizador/${carpeta}/${a.word.nombre}`, a.word.bytes);
    caso.guardar(`analizador/${carpeta}/${a.texto.nombre}`, a.texto.bytes);
    caso.guardarImpreso(`analizador/${carpeta}/resultados.pdf`, a.impreso);
}

/**
 * La columna de la base cuyo nombre empieza por un prefijo (la página nombra los puntajes por siglas: General_EE…).
 * @param {string[]} columnas
 * @param {string | RegExp} patron
 * @returns {string}
 */
export function columna(columnas, patron) {
    const halladas = columnas.filter(c => (typeof patron === 'string' ? c.startsWith(patron) : patron.test(c)));
    if (halladas.length !== 1) throw new Error(`se esperaba una columna ${patron} y hay ${halladas.length}: ${halladas.join(', ') || '(ninguna)'}`);
    return /** @type {string} */ (halladas[0]);
}

/**
 * Un objeto de la página como datos (los números no finitos, como texto: JSON no los admite).
 * @param {any} pagina
 * @param {string} expresion una expresión que se evalúa en la página (puede usar await import(…))
 * @returns {Promise<any>}
 */
export async function leerDeLaPagina(pagina, expresion) {
    return pagina.evaluate(`(async () => { const v = await (${expresion}); return JSON.parse(JSON.stringify(v === undefined ? null : v, (k, x) => (typeof x === 'number' && !Number.isFinite(x) ? String(x) : x))); })()`);
}

/**
 * El texto de un elemento de la página, con los espacios plegados (para citar un resultado de una tarjeta).
 * @param {any} pagina
 * @param {string} selector
 * @returns {Promise<string>}
 */
export async function textoDe(pagina, selector) {
    return pagina.evaluate(/** @param {string} s */ s => ((document.querySelector(s) || {}).textContent || '').replace(/\s+/g, ' ').trim(), selector);
}

/**
 * Las tablas dentro de un elemento de la página, como filas de celdas de texto (para citar sus cifras en el README).
 * @param {any} pagina
 * @param {string} selector
 * @returns {Promise<string[][][]>}
 */
export async function tablasDe(pagina, selector) {
    return pagina.evaluate(/** @param {string} s */ s => Array.from(document.querySelectorAll(`${s} table`)).map(t =>
        Array.from(t.querySelectorAll('tr')).map(tr => Array.from(tr.querySelectorAll('th, td')).map(c => (c.textContent || '').replace(/\s+/g, ' ').trim()))), selector);
}

/**
 * Las tablas de los objetivos específicos (las de «p ajustado (Holm)»), cada una con el título que la precede en la página
 * («Objetivo específico 1: Propósito vital ↔ Estrés académico — EEA»).
 * @param {any} pagina
 * @returns {Promise<Array<{ titulo: string, cabecera: string[], fila: string[] }>>}
 */
export async function objetivosEspecificos(pagina) {
    return pagina.evaluate(() => {
        const texto = (/** @type {Element} */ el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
        return Array.from(document.querySelectorAll('#analizador table')).filter(t => /p ajustado \(Holm\)/i.test(texto(t))).map(t => {
            // el título: el texto más cercano que empieza por «Objetivo específico», hacia atrás en el documento
            let titulo = '';
            const recorrido = document.createTreeWalker(document.getElementById('analizador') || document.body, NodeFilter.SHOW_ELEMENT);
            let ultimo = '';
            for (let n = recorrido.nextNode(); n; n = recorrido.nextNode()) {
                if (n === t) { titulo = ultimo; break; }
                const propio = Array.from(n.childNodes).filter(c => c.nodeType === 3).map(c => c.textContent).join('').trim();
                const cand = /^Objetivo específico \d+/.test(texto(n)) && texto(n).length < 200 ? texto(n) : (/^Objetivo específico \d+/.test(propio) ? propio : '');
                if (cand) ultimo = cand;
            }
            const filas = Array.from(t.querySelectorAll('tr')).map(tr => Array.from(tr.querySelectorAll('th, td')).map(texto));
            return { titulo, cabecera: filas[0] || [], fila: filas[1] || [] };
        });
    });
}

// ================================================================ lo que recalcula la prueba sin navegador
// Cada receta pide (caso.pedir) los análisis que se recalculan: el tipo y con qué se pidió. Al terminar la receta, la
// página los calcula con sus mismas funciones (tests/navegador/calculos.mjs) y su resultado queda en verificacion.json;
// tests/integration/ejemplos.test.js los repite en Node con el código del momento y los compara.

/**
 * La correlación del último análisis (window.ultimoAnalisis), pedida para recalcularse. Devuelve lo que el README cita.
 * @param {import('../ejemplos.mjs').Caso} caso
 * @returns {Promise<{ var1: string, var2: string, tipoPrueba: string, metodo: string, coeficiente: number, pValor: number, n: number }>}
 */
export async function comprobarCorrelacion(caso) {
    const c = await leerDeLaPagina(caso.pagina, '(() => { const u = window.ultimoAnalisis, r = u.resultado; return { var1: u.var1, var2: u.var2, tipoPrueba: u.tipoPrueba, metodo: r.tipoCorrelacion, coeficiente: r.coeficiente, pValor: r.pValor, n: r.n }; })()');
    caso.pedir('correlacion', { var1: c.var1, var2: c.var2, tipoPrueba: c.tipoPrueba });
    return c;
}

/**
 * La regresión del último análisis (RegresionMultiple._ultimaMultiple), pedida para recalcularse con sus mismas etiquetas
 * y opciones.
 * @param {import('../ejemplos.mjs').Caso} caso
 * @param {string} dependiente
 * @param {string[]} predictores
 * @param {{ interaccion?: boolean, cuadratico?: boolean, poisson?: boolean }} [opciones]
 */
export async function comprobarRegresion(caso, dependiente, predictores, opciones = {}) {
    const { etY, etsX } = await leerDeLaPagina(caso.pagina, "import('./src/analizador/regresion.js').then(m => { const R = m.RegresionMultiple._ultimaMultiple; return { etY: R.etY, etsX: R.etsX }; })");
    caso.pedir('regresion', { dependiente, predictores, etY, etsX, opciones: { interaccion: !!opciones.interaccion, cuadratico: !!opciones.cuadratico, poisson: !!opciones.poisson } });
}

/**
 * La fiabilidad de todas las escalas que detecta el Analizador (α, ω y los ordinales), pedida para recalcularse.
 * @param {import('../ejemplos.mjs').Caso} caso
 */
export function comprobarFiabilidad(caso) {
    caso.pedir('fiabilidad', {});
}

/**
 * La criba de los objetivos específicos de una correlación (los pares de dimensiones evaluados y los elegidos).
 * @param {import('../ejemplos.mjs').Caso} caso
 * @param {string} var1
 * @param {string} var2
 */
export function comprobarObjetivos(caso, var1, var2) {
    caso.pedir('objetivos', { var1, var2 });
}

/**
 * La comparación de una variable numérica entre los grupos de otra, con el protocolo de la página (ComparacionGrupos),
 * pedida para recalcularse.
 * @param {import('../ejemplos.mjs').Caso} caso
 * @param {string} grupo
 * @param {string} numerica
 */
export function comprobarGrupos(caso, grupo, numerica) {
    caso.pedir('grupos', { grupo, numerica });
}

/**
 * La χ² de independencia de dos variables categóricas, como la calcula el análisis de asociación, pedida para recalcularse.
 * @param {import('../ejemplos.mjs').Caso} caso
 * @param {string} var1
 * @param {string} var2
 * @returns {Promise<{ chiCuadrado: number, gl: number, pValor: number, n: number }>} lo que cita el README
 */
export async function comprobarChi2(caso, var1, var2) {
    caso.pedir('chi2', { var1, var2 });
    return leerDeLaPagina(caso.pagina, `import('./src/analizador/estadistica.js').then(m => { const A = m.AnalizadorEstadistico, d = A.obtenerDatos(); const R = A.chiCuadradoIndependencia(d.map(f => f[${JSON.stringify(var1)}]), d.map(f => f[${JSON.stringify(var2)}])); return { chiCuadrado: R.chiCuadrado, gl: R.gl, pValor: R.pValor, n: R.n }; })`);
}

/**
 * Los modelos del SEM ajustados en la página (SEM._ultimos), con la sintaxis de cada uno, en orden, pedidos para
 * recalcularse.
 * @param {import('../ejemplos.mjs').Caso} caso
 * @param {Array<{ sintaxis: string, etiqueta: string, estimador: string }>} modelos
 * @returns {Promise<Array<Record<string, any>>>} cada modelo con su ajuste (lo que cita el README)
 */
export async function comprobarSEM(caso, modelos) {
    const ajustes = await leerDeLaPagina(caso.pagina, "import('./src/analizador/sem-motor.js').then(m => m.SEM._ultimos.map(M => ({ etiqueta: M.etiquetaModelo, estimador: M.estimador, n: M.n, chi2: M.chi2, gl: M.gl, CFI: M.CFI, RMSEA: M.RMSEA })))");
    if (ajustes.length !== modelos.length) throw new Error(`el SEM tiene ${ajustes.length} modelos y se pidieron ${modelos.length}`);
    modelos.forEach(m => caso.pedir('sem', { sintaxis: m.sintaxis, etiqueta: m.etiqueta, estimador: m.estimador }));
    return modelos.map((m, k) => ({ ...m, ...ajustes[k] }));
}
