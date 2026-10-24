// @ts-check
// tests/navegador/pasos.mjs — los pasos de StatSim Pro tal como los da una persona, sobre la página de verdad
// (entorno.mjs): importar el archivo maestro del Simulador y generar la base; descargarla en todos sus formatos; pasarla
// al Analizador, describir la investigación y ejecutar un análisis; las tarjetas de la comparación de grupos, el SEM, el
// AFE, la V de Aiken y la invarianza; imprimir en PDF y guardar el proyecto. Todo por los botones, los campos y los
// diálogos de archivo de la interfaz: nada se llama por dentro de la aplicación. Cada paso espera a que la página termine
// (su aviso, su tabla de resultados) y falla diciendo qué esperaba.
// (2027.01.03) Los pasos del Analizador son los planes de src/ejemplos/hazlo/planes.js, que aquí ejecuta conductor.mjs: los
// mismos que repite «Hazlo por mí» en la página. Lo que no es del plan (las descargas de las tarjetas, lo que devuelve cada
// paso) se queda aquí.
import { descargar, descargarCon, esperarAviso, imprimirPDF, irA } from './acciones.mjs';
import { ejecutarPlan, elegirArchivo } from './conductor.mjs';
import { planDe } from '../../src/ejemplos/hazlo/planes.js';

/** @typedef {{ nombre: string, bytes: Buffer }} Archivo */
/** @typedef {{ archivo?: (ruta: string) => { nombre: string, bytes: Buffer | string } }} OpcionesDelPaso los archivos del caso que se suben (la V de Aiken), por su ruta */

/**
 * El plan de una acción, ejecutado en la página.
 * @param {any} pagina
 * @param {string} accion
 * @param {Record<string, any>} datos
 * @param {OpcionesDelPaso} [opciones]
 * @returns {Promise<string>} lo que dijo la página al terminar (el aviso, la salida del SEM…)
 */
const conPlan = (pagina, accion, datos, opciones = {}) => ejecutarPlan(pagina, planDe({ accion, datos }).ops, opciones);


// ================================================================ Simulador

/**
 * «Importar todo»: aplica un archivo maestro (la configuración completa del Simulador) y devuelve el aviso de la página.
 * @param {any} pagina
 * @param {{ nombre: string, texto: string }} maestro
 * @returns {Promise<string>}
 */
export async function importarMaestro(pagina, { nombre, texto }) {
    await irA(pagina, 'simulador');
    await pagina.evaluate(() => { const t = document.getElementById('toast'); if (t) t.textContent = ''; });
    await elegirArchivo(pagina, () => pagina.click('#btnImportarTodo'), { nombre, bytes: texto });
    const aviso = await esperarAviso(pagina, /importad|aplicad|Error|no es una configuraci|No se pudo/i);
    if (/Error|no es una configuraci|No se pudo/i.test(aviso)) throw new Error('el maestro no se aplicó: ' + aviso);
    return aviso;
}

/**
 * «Generar»: genera la base (en el Worker) y espera a que termine. Devuelve n y las columnas, y los avisos de la tarjeta
 * bajo «Generar» (los de la validación), si los hay.
 * @param {any} pagina
 * @returns {Promise<{ n: number, columnas: string[], avisos: string }>}
 */
export async function generarBase(pagina) {
    await irA(pagina, 'simulador');
    const n = Number(await pagina.inputValue('#tamanoMuestra'));
    await pagina.evaluate(() => {
        /** @type {any} */ (window).generadorDatos.datosGenerados = null;
        const t = document.getElementById('toast'); if (t) { t.textContent = ''; t.className = 'toast'; }
    });
    await pagina.click('#btnGenerar');
    // la base, o el error que da la página (la validación o la generación: un aviso emergente de error)
    await pagina.waitForFunction(/** @param {number} esperado */ esperado => {
        const g = /** @type {any} */ (window).generadorDatos;
        if (!!g.datosGenerados && g.datosGenerados.n === esperado && !(/** @type {HTMLButtonElement} */ (document.getElementById('btnGenerar')).disabled)) return true;
        const t = document.getElementById('toast');
        return !!t && t.classList.contains('error');
    }, n, { timeout: 300000 });
    const error = await pagina.evaluate(() => { const t = document.getElementById('toast'); return t && t.classList.contains('error') ? t.textContent : ''; });
    if (error) throw new Error('la base no se generó: ' + error);
    return pagina.evaluate(() => {
        const base = /** @type {any} */ (window).generadorDatos.datosGenerados;
        const avisos = document.getElementById('avisosGeneracion');
        return {
            n: base.n, columnas: base.columnas.map(/** @param {any} c */ c => c.nombre),
            avisos: avisos && avisos.style.display !== 'none' ? (avisos.textContent || '').replace(/\s+/g, ' ').trim() : '',
        };
    });
}

/**
 * Las descargas del Simulador tras generar: la base en CSV (Excel en español e internacional), SPSS y Excel, el informe
 * «pedido vs. obtenido» y el archivo maestro («Exportar todo»).
 * @param {any} pagina
 * @returns {Promise<Record<string, Archivo>>} por clave: csvEspanol, csvInternacional, sav, xlsx, informe, maestro
 */
export async function descargasDelSimulador(pagina) {
    await irA(pagina, 'simulador');
    return {
        csvEspanol: await descargarCon(pagina, '#btnDescargarCSV'),
        csvInternacional: await descargarCon(pagina, '#btnDescargarCSVIntl'),
        sav: await descargarCon(pagina, '#btnDescargarSAV'),
        xlsx: await descargarCon(pagina, '#btnDescargarXLSX'),
        informe: await descargarCon(pagina, '#btnDescargarInforme'),
        maestro: await descargarCon(pagina, '#btnExportarTodo'),
    };
}

/**
 * La verificación de la base impresa en PDF (el botón «Imprimir o guardar en PDF» del informe).
 * @param {any} pagina
 * @returns {Promise<import('./acciones.mjs').Impreso>}
 */
export async function imprimirSimulador(pagina) {
    await irA(pagina, 'simulador');
    return imprimirPDF(pagina);
}

// ================================================================ Analizador

/**
 * «Usar datos generados»: pasa la base del Simulador al Analizador.
 * @param {any} pagina
 * @returns {Promise<number>} los casos cargados
 */
export async function usarBaseDelSimulador(pagina) {
    await conPlan(pagina, 'usarBaseDelSimulador', {});
    return pagina.evaluate(() => /** @type {any} */ (window).generadorDatos.datosGenerados.n);
}

/**
 * «1. Configuración de la investigación»: el título (para el Word), la unidad de análisis y el lugar.
 * @param {any} pagina
 * @param {{ titulo?: string, unidad?: string, lugar?: string }} datos
 */
export async function describirInvestigacion(pagina, datos) {
    await conPlan(pagina, 'describirInvestigacion', datos);
}

/**
 * @typedef {object} PedidoDeAnalisis
 * @property {'correlacion' | 'comparacion' | 'asociacion'} tipo
 * @property {string[]} variables la 1 y la 2 (y, en una correlación, las adicionales: con 3 o más, una matriz)
 * @property {'bilateral' | 'unilateral'} [prueba]
 * @property {{ dependiente: string, predictores: string[], interaccion?: boolean, cuadratico?: boolean, poisson?: boolean }} [regresion]
 */

/**
 * «Análisis estadístico» y «Ejecutar análisis»: elige el tipo, las variables, la prueba y la regresión opcional, y
 * espera al aviso de la página. Devuelve ese aviso.
 * @param {any} pagina
 * @param {PedidoDeAnalisis} pedido
 * @returns {Promise<string>}
 */
export async function analizar(pagina, pedido) {
    return conPlan(pagina, 'analizar', pedido);
}

/**
 * (2027.01.01) Espera a lo que el análisis termina en segundo plano: el α y el ω ordinales de la fiabilidad (con sus
 * celdas «…» y el botón «Esperando los coeficientes ordinales…»), que se pintan al llegar del Worker. Sin esperarlos, lo
 * descargado y lo impreso dependían de si habían llegado a tiempo.
 * @param {any} pagina
 */
export async function esperarCalculosEnSegundoPlano(pagina) {
    await pagina.waitForFunction(() => !document.querySelector('.calculando') && !/Esperando los coeficientes ordinales/.test(document.body.innerText), null, { timeout: 300000 });
}

/**
 * Lo que se descarga de un análisis: el capítulo de resultados en Word (el de una correlación de dos variables: los demás
 * análisis no lo tienen) y los resultados en texto; y los resultados impresos en PDF.
 * @param {any} pagina
 * @param {{ word?: boolean }} [opciones]
 * @returns {Promise<{ word: Archivo | null, texto: Archivo, impreso: import('./acciones.mjs').Impreso }>}
 */
export async function exportarAnalisis(pagina, { word = true } = {}) {
    await irA(pagina, 'analizador');
    const capitulo = word ? await descargarCon(pagina, '#btnExportarWord') : null;
    const texto = await descargarCon(pagina, '#btnDescargarResultados');
    const impreso = await imprimirPDF(pagina);
    return { word: capitulo, texto, impreso };
}

/**
 * La tarjeta «Comparación entre grupos»: la variable de agrupación y la numérica (y, si se piden, la covariable del
 * ANCOVA o las variables adicionales del MANOVA), «Comparar grupos» y su resultado.
 * @param {any} pagina
 * @param {{ grupo: string, numerica: string, covariable?: string, adicionales?: string[] }} pedido
 */
export async function compararGrupos(pagina, pedido) {
    return conPlan(pagina, 'compararGrupos', pedido);
}

/**
 * La tarjeta del SEM: el modelo (su sintaxis), su nombre y el estimador; «¿Es adecuado usar SEM aquí?» y «Ajustar modelo».
 * @param {any} pagina
 * @param {{ sintaxis: string, etiqueta?: string, estimador?: 'ML' | 'WLSMV' }} pedido
 * @returns {Promise<string>} el texto de lo que dio
 */
export async function ajustarSEM(pagina, pedido) {
    return conPlan(pagina, 'ajustarSEM', pedido);
}

/**
 * La tarjeta del AFE: los ítems (una escala detectada o una lista propia), la correlación, el número de factores, la
 * rotación, las réplicas y la semilla del análisis paralelo; «Calcular AFE» y sus descargas (las cargas en CSV y el Word).
 * @param {any} pagina
 * @param {{ conjunto?: string, items?: string[], correlacion?: string, factores?: string, rotacion?: string, replicas?: number, semilla?: number }} pedido
 * @returns {Promise<{ csv: Archivo, word: Archivo }>}
 */
export async function calcularAFE(pagina, pedido) {
    await conPlan(pagina, 'calcularAFE', pedido);
    return { csv: await descargarCon(pagina, '#afeCSV'), word: await descargarCon(pagina, '#afeWord') };
}

/**
 * La tarjeta de la V de Aiken: la escala de valoración, el nivel de confianza y el criterio V₀; un criterio por archivo
 * (su nombre y «Cargar CSV»); «Calcular V de Aiken» y sus descargas (la tabla en CSV y el Word).
 * @param {any} pagina
 * @param {{ minimo: number, maximo: number, confianza?: number, v0?: number, criterios: Array<{ nombre: string, archivo: string }> }} pedido
 *   archivo: la ruta del CSV del criterio en la carpeta del caso (lo que guarda el guion)
 * @param {OpcionesDelPaso} [opciones] de dónde salen esos archivos
 * @returns {Promise<{ csv: Archivo, word: Archivo }>}
 */
export async function calcularAiken(pagina, pedido, opciones = {}) {
    await conPlan(pagina, 'calcularAiken', pedido, opciones);
    return { csv: await descargarCon(pagina, '#aikenCSV'), word: await descargarCon(pagina, '#aikenWord') };
}

/**
 * La tarjeta de la invarianza: el modelo de medida (escrito, o «Usar el modelo escrito en la sección SEM»), la variable de
 * agrupación, el estimador y la invarianza estricta; «Evaluar la invarianza» y su Word.
 * @param {any} pagina
 * @param {{ sintaxis?: string, delSEM?: boolean, grupo: string, estimador?: 'ML' | 'WLSMV', estricta?: boolean }} pedido
 * @returns {Promise<{ word: Archivo }>}
 */
export async function evaluarInvarianza(pagina, pedido) {
    await conPlan(pagina, 'evaluarInvarianza', pedido);
    return { word: await descargarCon(pagina, '#invWord') };
}

// ================================================================ Proyecto

/**
 * «Guardar proyecto» (en Ayuda): el archivo .statsim con todo lo que hay en la página.
 * @param {any} pagina
 * @returns {Promise<Archivo>}
 */
export async function guardarProyecto(pagina) {
    await irA(pagina, 'ayuda');
    const archivo = await descargar(pagina, () => pagina.click('#btnGuardarProyecto'));
    await esperarAviso(pagina, /Proyecto guardado|No se pudo/);
    return archivo;
}
