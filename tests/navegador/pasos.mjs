// @ts-check
// tests/navegador/pasos.mjs — los pasos de StatSim Pro tal como los da una persona, sobre la página de verdad
// (entorno.mjs): importar el archivo maestro del Simulador y generar la base; descargarla en todos sus formatos; pasarla
// al Analizador, describir la investigación y ejecutar un análisis; las tarjetas de la comparación de grupos, el SEM, el
// AFE, la V de Aiken y la invarianza; imprimir en PDF y guardar el proyecto. Todo por los botones, los campos y los
// diálogos de archivo de la interfaz: nada se llama por dentro de la aplicación. Cada paso espera a que la página termine
// (su aviso, su tabla de resultados) y falla diciendo qué esperaba.
import { descargar, descargarCon, esperarAviso, imprimirPDF, irA } from './acciones.mjs';

/** @typedef {{ nombre: string, bytes: Buffer }} Archivo */

/**
 * Elige un archivo en el diálogo que abre un botón (como «Importar» o «Cargar CSV»).
 * @param {any} pagina
 * @param {() => Promise<unknown>} pulsar
 * @param {{ nombre: string, bytes: Buffer | string, tipo?: string }} archivo
 */
async function elegirArchivo(pagina, pulsar, { nombre, bytes, tipo = 'text/csv' }) {
    const [dialogo] = await Promise.all([pagina.waitForEvent('filechooser', { timeout: 30000 }), pulsar()]);
    await dialogo.setFiles({ name: nombre, mimeType: tipo, buffer: typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : bytes });
}

/**
 * Pone el valor de un campo de texto o de un desplegable y avisa a la página (los eventos input y change).
 * @param {any} pagina
 * @param {string} selector
 * @param {string} valor
 */
async function poner(pagina, selector, valor) {
    const etiqueta = await pagina.$eval(selector, /** @param {Element} el */ el => el.tagName);
    if (etiqueta === 'SELECT') {
        const elegidos = await pagina.selectOption(selector, String(valor));
        if (!elegidos.includes(String(valor))) throw new Error(`${selector}: no tiene la opción «${valor}»`);
    } else {
        await pagina.fill(selector, String(valor));
    }
}

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
    await irA(pagina, 'analizador');
    const n = await pagina.evaluate(() => /** @type {any} */ (window).generadorDatos.datosGenerados.n);
    await pagina.click('#btnUsarGenerados');
    await pagina.waitForFunction(/** @param {number} esperado */ esperado => (document.getElementById('analisisN') || {}).textContent === String(esperado), n, { timeout: 60000 });
    return n;
}

/**
 * «1. Configuración de la investigación»: el título (para el Word), la unidad de análisis y el lugar.
 * @param {any} pagina
 * @param {{ titulo?: string, unidad?: string, lugar?: string }} contexto
 */
export async function describirInvestigacion(pagina, { titulo = '', unidad = '', lugar = '' }) {
    await irA(pagina, 'analizador');
    await poner(pagina, '#tituloTesis', titulo);
    await poner(pagina, '#unidadAnalisis', unidad);
    await poner(pagina, '#lugarContexto', lugar);
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
export async function analizar(pagina, { tipo, variables, prueba = 'bilateral', regresion }) {
    await irA(pagina, 'analizador');
    await pagina.check(`input[name="tipoAnalisis"][value="${tipo}"]`);
    // las variables adicionales de una correlación (la matriz): una fila por cada una con «＋ Agregar variable»
    await pagina.evaluate(() => { const c = document.getElementById('varsExtraCont'); if (c) c.innerHTML = ''; const p = document.getElementById('regPredsCont'); if (p) p.innerHTML = ''; });
    await poner(pagina, '#variable1', variables[0]);
    await poner(pagina, '#variable2', variables[1]);
    for (const [k, extra] of variables.slice(2).entries()) {
        await pagina.click('#btnAgregarVariable');
        await poner(pagina, `#varsExtraCont > :nth-child(${k + 1}) select`, extra);
    }
    await pagina.check(`input[name="tipoPrueba"][value="${prueba}"]`);
    await poner(pagina, '#regDep', regresion ? regresion.dependiente : '');
    await poner(pagina, '#regInd', regresion ? regresion.predictores[0] : '');
    if (regresion) {
        for (const [k, predictor] of regresion.predictores.slice(1).entries()) {
            await pagina.click('#btnAgregarPredictor');
            await poner(pagina, `#regPredsCont > :nth-child(${k + 1}) select`, predictor);
        }
        for (const [id, marcar] of [['#regInter', !!regresion.interaccion], ['#regCuad', !!regresion.cuadratico], ['#regPoisson', !!regresion.poisson]]) {
            if (await pagina.isVisible(/** @type {string} */ (id))) await pagina.setChecked(/** @type {string} */ (id), /** @type {boolean} */ (marcar));
            else if (marcar) throw new Error(`${id} no está a la vista: la regresión no admite esa opción con estos predictores`);
        }
    }
    await pagina.evaluate(() => { const t = document.getElementById('toast'); if (t) t.textContent = ''; });
    await pagina.click('#btnAnalizar');
    const aviso = await esperarAviso(pagina, /Análisis completado|Error|selecciona|deben ser diferentes|no hay|insuficiente/i, 300000);
    if (!/Análisis completado/.test(aviso)) throw new Error('el análisis no terminó: ' + aviso);
    await pagina.waitForFunction(() => !(/** @type {HTMLButtonElement} */ (document.getElementById('btnAnalizar')).disabled));
    await esperarCalculosEnSegundoPlano(pagina);
    return aviso;
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
export async function compararGrupos(pagina, { grupo, numerica, covariable = '', adicionales = [] }) {
    await irA(pagina, 'analizador');
    await poner(pagina, '#cgGrupo', grupo);
    await poner(pagina, '#cgNum', numerica);
    await poner(pagina, '#cgCov', covariable);
    for (const v of adicionales) await pagina.check(`#cgDVs input[value="${v}"]`);
    await pagina.evaluate(() => { const r = document.getElementById('cgResultado'); if (r) r.innerHTML = ''; });
    await pagina.click('#cgAnalizar');
    await pagina.waitForFunction(() => ((document.getElementById('cgResultado') || {}).textContent || '').trim().length > 0, null, { timeout: 120000 });
    return pagina.evaluate(() => (document.getElementById('cgResultado') || {}).textContent || '');
}

/**
 * La tarjeta del SEM: el modelo (su sintaxis), su nombre y el estimador; «¿Es adecuado usar SEM aquí?» y «Ajustar modelo».
 * @param {any} pagina
 * @param {{ sintaxis: string, etiqueta?: string, estimador?: 'ML' | 'WLSMV' }} pedido
 * @returns {Promise<string>} el texto de lo que dio
 */
export async function ajustarSEM(pagina, { sintaxis, etiqueta = 'Modelo inicial', estimador = 'ML' }) {
    await irA(pagina, 'analizador');
    await poner(pagina, '#semSintaxis', sintaxis);
    await poner(pagina, '#semEtiqueta', etiqueta);
    await poner(pagina, '#semEstimador', estimador);
    await pagina.click('#semEvaluar');
    await pagina.waitForFunction(() => ((document.getElementById('semDecision') || {}).textContent || '').trim().length > 0, null, { timeout: 60000 });
    await pagina.evaluate(() => { const r = document.getElementById('semOut'); if (r) r.innerHTML = ''; });
    await pagina.click('#semAjustar');
    await pagina.waitForFunction(() => {
        const t = ((document.getElementById('semOut') || {}).textContent || '').trim();
        return t.length > 0 && !/^Estimando/.test(t);
    }, null, { timeout: 600000 });
    const texto = await pagina.evaluate(() => (document.getElementById('semOut') || {}).textContent || '');
    if (/^\s*⚠️/.test(texto) && !/parámetros estimados/.test(texto)) throw new Error('el SEM no se ajustó: ' + texto.slice(0, 300));
    return texto;
}

/**
 * Espera a que una tarjeta de psicometría muestre sus resultados (o falle con su mensaje).
 * @param {any} pagina
 * @param {string} resultados el id del contenedor de resultados («afeResultados»…)
 * @param {string} mensajes el id del de los mensajes («afeMensajes»…)
 * @param {number} ms
 */
async function esperarResultados(pagina, resultados, mensajes, ms) {
    await pagina.waitForFunction(/** @param {[string, string]} ids */ ([r, m]) => {
        const res = document.getElementById(r), men = document.getElementById(m);
        return (!!res && !res.hidden && (res.textContent || '').trim().length > 0) || (!!men && /error|no se pud|no hay|falta/i.test(men.textContent || ''));
    }, [resultados, mensajes], { timeout: ms });
    const listo = await pagina.evaluate(/** @param {string} r */ r => { const el = document.getElementById(r); return !!el && !el.hidden; }, resultados);
    if (!listo) throw new Error(`${resultados}: ` + await pagina.evaluate(/** @param {string} m */ m => (document.getElementById(m) || {}).textContent || '', mensajes));
}

/**
 * La tarjeta del AFE: los ítems (una escala detectada o una lista propia), la correlación, el número de factores, la
 * rotación, las réplicas y la semilla del análisis paralelo; «Calcular AFE» y sus descargas (las cargas en CSV y el Word).
 * @param {any} pagina
 * @param {{ conjunto?: string, items?: string[], correlacion?: string, factores?: string, rotacion?: string, replicas?: number, semilla?: number }} pedido
 * @returns {Promise<{ csv: Archivo, word: Archivo }>}
 */
export async function calcularAFE(pagina, { conjunto, items, correlacion = 'auto', factores = 'paralelo', rotacion = 'oblimin', replicas = 200, semilla = 2026 }) {
    await irA(pagina, 'analizador');
    await pagina.click('#afeActualizar');
    if (items) {
        await poner(pagina, '#afeConjunto', 'propia');
        await poner(pagina, '#afeItems', items.join(', '));
    } else if (conjunto !== undefined) {
        const valor = await pagina.$eval('#afeConjunto', /** @param {any} sel @param {string} texto */ (sel, texto) => {
            const op = Array.from(sel.options).find(/** @param {any} o */ o => o.value === texto || o.textContent.trim() === texto || o.textContent.startsWith(texto));
            return op ? op.value : null;
        }, conjunto);
        if (valor === null) throw new Error(`#afeConjunto: no tiene «${conjunto}» (tiene: ${await pagina.$eval('#afeConjunto', /** @param {any} s */ s => Array.from(s.options).map(/** @param {any} o */ o => o.textContent).join(' | '))})`);
        await poner(pagina, '#afeConjunto', valor);
    }
    await poner(pagina, '#afeCorrelacion', correlacion);
    await poner(pagina, '#afeFactores', factores);
    await poner(pagina, '#afeRotacion', rotacion);
    await poner(pagina, '#afeB', String(replicas));
    await poner(pagina, '#afeSemilla', String(semilla));
    await pagina.click('#afeCalcular');
    await esperarResultados(pagina, 'afeResultados', 'afeMensajes', 900000);
    return { csv: await descargarCon(pagina, '#afeCSV'), word: await descargarCon(pagina, '#afeWord') };
}

/**
 * La tarjeta de la V de Aiken: la escala de valoración, el nivel de confianza y el criterio V₀; un criterio por archivo
 * (su nombre y «Cargar CSV»); «Calcular V de Aiken» y sus descargas (la tabla en CSV y el Word).
 * @param {any} pagina
 * @param {{ minimo: number, maximo: number, confianza?: number, v0?: number, criterios: Array<{ nombre: string, archivo: { nombre: string, bytes: Buffer | string } }> }} pedido
 * @returns {Promise<{ csv: Archivo, word: Archivo }>}
 */
export async function calcularAiken(pagina, { minimo, maximo, confianza = 0.95, v0 = 0.7, criterios }) {
    await irA(pagina, 'analizador');
    await poner(pagina, '#aikenMinimo', String(minimo));
    await poner(pagina, '#aikenMaximo', String(maximo));
    await poner(pagina, '#aikenConfianza', String(confianza));
    await poner(pagina, '#aikenV0', String(v0));
    // tantos bloques de criterio como criterios: se agregan o se quitan con sus botones
    for (;;) {
        const hay = await pagina.locator('#aikenCriterios .criterio-aiken').count();
        if (hay < criterios.length) { await pagina.click('#aikenAgregarCriterio'); continue; }
        if (hay > criterios.length) { await pagina.locator('#aikenCriterios .criterio-aiken .btn-delete').last().click(); continue; }
        break;
    }
    for (const [k, criterio] of criterios.entries()) {
        const bloque = pagina.locator('#aikenCriterios .criterio-aiken').nth(k);
        await bloque.locator('[aria-label="Nombre del criterio"]').fill(criterio.nombre);
        await elegirArchivo(pagina, () => bloque.locator('[data-accion="cargar-csv"]').click(), criterio.archivo);
        await esperarAviso(pagina, new RegExp(`«${criterio.archivo.nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}» cargado`));
    }
    await pagina.click('#aikenCalcular');
    await esperarResultados(pagina, 'aikenResultados', 'aikenMensajes', 120000);
    return { csv: await descargarCon(pagina, '#aikenCSV'), word: await descargarCon(pagina, '#aikenWord') };
}

/**
 * La tarjeta de la invarianza: el modelo de medida (escrito, o «Usar el modelo escrito en la sección SEM»), la variable de
 * agrupación, el estimador y la invarianza estricta; «Evaluar la invarianza» y su Word.
 * @param {any} pagina
 * @param {{ sintaxis?: string, delSEM?: boolean, grupo: string, estimador?: 'ML' | 'WLSMV', estricta?: boolean }} pedido
 * @returns {Promise<{ word: Archivo }>}
 */
export async function evaluarInvarianza(pagina, { sintaxis, delSEM = false, grupo, estimador = 'ML', estricta = false }) {
    await irA(pagina, 'analizador');
    if (delSEM) await pagina.click('#invDelSEM');
    else await poner(pagina, '#invSintaxis', sintaxis || '');
    await pagina.click('#invActualizar');
    await poner(pagina, '#invGrupo', grupo);
    await poner(pagina, '#invEstimador', estimador);
    await pagina.setChecked('#invEstricta', estricta);
    await pagina.click('#invCalcular');
    await esperarResultados(pagina, 'invResultados', 'invMensajes', 1800000);
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
