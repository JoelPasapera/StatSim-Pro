// @ts-check
// ejemplos/hazlo/planes.js — (2027.01.03) cómo se da cada paso de un caso, una sola vez para todos: el «guion» de un paso es
// una lista de acciones con sus datos ({ accion: 'analizar', datos: { tipo, variables… } }), y aquí cada acción se convierte
// en su plan: las operaciones sobre los controles de la página, en orden (ir a la sección, elegir una opción, escribir en un
// campo, pulsar un botón, esperar a que termine). El mismo plan lo ejecuta Playwright cuando se hacen los ejemplos
// (tests/navegador/pasos.mjs, con tests/navegador/conductor.mjs) y la página con «Hazlo por mí» (conductor.js): la guía
// hace exactamente lo que hizo el ejemplo. Los selectores salen de aquí, nunca del guion (que viene de ejemplos/indice.json):
// del guion solo llegan valores (nombres de variables, sintaxis, números, rutas del caso), comprobados por accionValida.
// Sin DOM.

import { esCondicion } from './condiciones.js';

/**
 * @typedef {import('./condiciones.js').NombreDeCondicion} NombreDeCondicion
 * @typedef {{ op: 'ir', seccion: string }
 *   | { op: 'marcar', selector: string, valor: boolean, siVisible?: boolean, nombre: string }
 *   | { op: 'marcarSolo', contenedor: string, valores: string[], nombre: string }
 *   | { op: 'poner', selector: string, valor: string, nombre: string }
 *   | { op: 'ponerOpcion', selector: string, texto: string, nombre: string }
 *   | { op: 'quitarTodos', selector: string, nombre: string }
 *   | { op: 'limpiarAviso' }
 *   | { op: 'pulsar', selector: string, nombre: string, vaciar?: string }
 *   | { op: 'senalar', selector: string, nombre: string }
 *   | { op: 'bloques', bloques: string, agregar: string, quitar: string, n: number, nombre: string }
 *   | { op: 'ponerEnBloque', bloques: string, indice: number, selector: string, valor: string, nombre: string }
 *   | { op: 'subirEnBloque', bloques: string, indice: number, boton: string, entrada: string, archivo: string, nombre: string }
 *   | { op: 'esperar', condicion: NombreDeCondicion, arg: any, ms: number, nombre: string, exito?: [string, string], fallo?: string }
 * } Op una operación sobre la página. nombre: lo que dice la guía mientras la hace. pulsar con vaciar: vacía esa zona de
 *   resultados justo antes del clic (los de antes no cuentan como los de ahora; y si se detiene antes, siguen ahí).
 *   quitarTodos: pulsa, uno tras otro, los botones «✕» que haya (las variables adicionales de un análisis anterior).
 *   marcarSolo: de las casillas de una lista, deja marcadas esas y ninguna más. senalar: un control que es de la persona
 *   (una descarga, «Guardar proyecto»): nadie lo pulsa, la guía solo lo señala. subirEnBloque: un archivo del caso (su
 *   ruta), con el botón que abre el diálogo de archivos (Playwright lo pulsa) o en su <input type="file"> («entrada»: la
 *   página no puede abrir el diálogo con un archivo puesto). esperar: hasta que se cumple la condición (o pasan ms); con
 *   exito, el aviso debe además encajar con ese patrón; con fallo, un texto que delata que no salió (el SEM sin estimar)
 * @typedef {{ accion: string, datos: Record<string, any> }} AccionDelGuion
 * @typedef {{ titulo: string, ops: Op[], ejecutable: boolean }} Plan
 *   ejecutable: si «Hazlo por mí» la hace; las que no (descargas, guardar el proyecto), solo se señalan
 */

// ------------------------------------------------------------------------------------------------ comprobaciones

const esTexto = (/** @type {unknown} */ x, maximo = 500) => typeof x === 'string' && x.length <= maximo;
const textoOpcional = (/** @type {unknown} */ x, maximo = 500) => x === undefined || esTexto(x, maximo);
const logicoOpcional = (/** @type {unknown} */ x) => x === undefined || typeof x === 'boolean';
/** @param {unknown} x @returns {x is Record<string, any>} */
const esObjeto = x => !!x && typeof x === 'object' && !Array.isArray(x);
/** Una lista de textos de un largo razonable. @param {unknown} x @param {number} min @param {number} max */
const listaDeTextos = (x, min, max) => Array.isArray(x) && x.length >= min && x.length <= max && x.every(v => esTexto(v, 200) && v.length > 0);
/** Solo estas claves. @param {Record<string, any>} d @param {string[]} claves */
const soloClaves = (d, claves) => Object.keys(d).every(k => claves.includes(k));
/** Una ruta dentro del caso (como en catalogo.js: segmentos de letras, números, «_», «-» y «.», ninguno «.» ni «..»). @param {unknown} x */
const rutaDelCaso = x => typeof x === 'string' && x.length <= 300 && x.split('/').every(s => /^[A-Za-z0-9_.-]+$/.test(s) && s !== '.' && s !== '..');
const enteroOpcional = (/** @type {unknown} */ x, min = 0, max = 1e9) => x === undefined || (Number.isInteger(x) && /** @type {number} */ (x) >= min && /** @type {number} */ (x) <= max);
const numero = (/** @type {unknown} */ x) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= 1e6;

const TIPOS_DE_ANALISIS = { correlacion: 'Correlación', comparacion: 'Comparación de grupos', asociacion: 'Asociación (χ²)' };
const PRUEBAS = { bilateral: 'bilateral', unilateral: 'unilateral' };
const ESTIMADORES = ['ML', 'WLSMV'];

// ------------------------------------------------------------------------------------------------ los planes

/** @param {string} seccion @returns {Op} */
const ir = seccion => ({ op: 'ir', seccion });

/** «Usar datos generados»: la base del Simulador, al Analizador. @returns {Op[]} */
function planUsarBase() {
    return [
        ir('analizador'),
        { op: 'pulsar', selector: '#btnUsarGenerados', nombre: '«Usar datos generados»' },
        { op: 'esperar', condicion: 'conLaBaseDelSimulador', arg: null, ms: 60000, nombre: 'Esperando a que el Analizador cargue la base…' },
    ];
}

/** «1. Configuración de la investigación». @param {Record<string, any>} d @returns {Op[]} */
function planDescribir({ titulo = '', unidad = '', lugar = '' }) {
    return [
        ir('analizador'),
        { op: 'poner', selector: '#tituloTesis', valor: titulo, nombre: 'El título de la tesis' },
        { op: 'poner', selector: '#unidadAnalisis', valor: unidad, nombre: 'La unidad de análisis' },
        { op: 'poner', selector: '#lugarContexto', valor: lugar, nombre: 'El lugar' },
    ];
}

/**
 * «Análisis estadístico» y «Ejecutar análisis»: el tipo, las variables (con 3 o más en una correlación, las adicionales con
 * «＋ Agregar variable»), la prueba y la regresión opcional (sus predictores adicionales y sus opciones, si están a la vista).
 * @param {Record<string, any>} d
 * @returns {Op[]}
 */
function planAnalizar({ tipo, variables, prueba = 'bilateral', regresion }) {
    /** @type {Op[]} */
    const ops = [
        ir('analizador'),
        { op: 'marcar', selector: `input[name="tipoAnalisis"][value="${tipo}"]`, valor: true, nombre: `Tipo de análisis: ${TIPOS_DE_ANALISIS[/** @type {'correlacion'} */ (tipo)]}` },
        { op: 'quitarTodos', selector: '#varsExtraCont button[aria-label="Quitar"]', nombre: 'Sin las variables adicionales de antes («✕»)' },
        { op: 'quitarTodos', selector: '#regPredsCont button[aria-label="Quitar"]', nombre: 'Sin los predictores adicionales de antes («✕»)' },
        { op: 'poner', selector: '#variable1', valor: variables[0], nombre: `Variable 1: ${variables[0]}` },
        { op: 'poner', selector: '#variable2', valor: variables[1], nombre: `Variable 2: ${variables[1]}` },
    ];
    variables.slice(2).forEach((/** @type {string} */ extra, /** @type {number} */ k) => {
        ops.push({ op: 'pulsar', selector: '#btnAgregarVariable', nombre: '«＋ Agregar variable»' });
        ops.push({ op: 'poner', selector: `#varsExtraCont > :nth-child(${k + 1}) select`, valor: extra, nombre: `Variable ${k + 3}: ${extra}` });
    });
    ops.push({ op: 'marcar', selector: `input[name="tipoPrueba"][value="${prueba}"]`, valor: true, nombre: `Prueba ${PRUEBAS[/** @type {'bilateral'} */ (prueba)]}` });
    ops.push({ op: 'poner', selector: '#regDep', valor: regresion ? regresion.dependiente : '', nombre: regresion ? `Regresión: variable dependiente ${regresion.dependiente}` : 'Sin regresión' });
    ops.push({ op: 'poner', selector: '#regInd', valor: regresion ? regresion.predictores[0] : '', nombre: regresion ? `Predictor: ${regresion.predictores[0]}` : 'Sin predictores' });
    if (regresion) {
        regresion.predictores.slice(1).forEach((/** @type {string} */ p, /** @type {number} */ k) => {
            ops.push({ op: 'pulsar', selector: '#btnAgregarPredictor', nombre: '«＋ Agregar predictor»' });
            ops.push({ op: 'poner', selector: `#regPredsCont > :nth-child(${k + 1}) select`, valor: p, nombre: `Predictor: ${p}` });
        });
        for (const [id, valor, nombre] of /** @type {Array<[string, boolean, string]>} */ ([['#regInter', !!regresion.interaccion, 'la interacción'], ['#regCuad', !!regresion.cuadratico, 'el término cuadrático'], ['#regPoisson', !!regresion.poisson, 'Poisson']])) {
            ops.push({ op: 'marcar', selector: id, valor, siVisible: true, nombre: `${valor ? 'Con' : 'Sin'} ${nombre}` });
        }
    }
    ops.push(
        { op: 'limpiarAviso' },
        { op: 'pulsar', selector: '#btnAnalizar', nombre: '«Ejecutar análisis»' },
        { op: 'esperar', condicion: 'aviso', arg: ['Análisis completado|Error|selecciona|deben ser diferentes|no hay|insuficiente', 'i'], exito: ['Análisis completado', ''], ms: 300000, nombre: 'Esperando el análisis…' },
        { op: 'esperar', condicion: 'habilitado', arg: 'btnAnalizar', ms: 60000, nombre: 'Esperando el análisis…' },
        { op: 'esperar', condicion: 'sinPendientes', arg: null, ms: 300000, nombre: 'Esperando los cálculos en segundo plano (la fiabilidad ordinal)…' },
    );
    return ops;
}

/** La tarjeta «Comparación entre grupos». @param {Record<string, any>} d @returns {Op[]} */
function planCompararGrupos({ grupo, numerica, covariable = '', adicionales = [] }) {
    return [
        ir('analizador'),
        { op: 'poner', selector: '#cgGrupo', valor: grupo, nombre: `Agrupación: ${grupo}` },
        { op: 'poner', selector: '#cgNum', valor: numerica, nombre: `Variable numérica: ${numerica}` },
        { op: 'poner', selector: '#cgCov', valor: covariable, nombre: covariable ? `Covariable: ${covariable}` : 'Sin covariable' },
        { op: 'marcarSolo', contenedor: '#cgDVs', valores: adicionales, nombre: adicionales.length ? `Variables adicionales (MANOVA): ${adicionales.join(', ')}` : 'Sin variables adicionales (MANOVA)' },
        { op: 'pulsar', selector: '#cgAnalizar', vaciar: '#cgResultado', nombre: '«Comparar grupos»' },
        { op: 'esperar', condicion: 'conTextoOAviso', arg: ['cgResultado', 'cgEstado'], ms: 120000, fallo: 'estado', nombre: 'Esperando la comparación…' },
    ];
}

/** La tarjeta del SEM: el modelo, su nombre y el estimador; «¿Es adecuado usar SEM aquí?» y «Ajustar modelo». @param {Record<string, any>} d @returns {Op[]} */
function planSEM({ sintaxis, etiqueta = 'Modelo inicial', estimador = 'ML' }) {
    return [
        ir('analizador'),
        { op: 'poner', selector: '#semSintaxis', valor: sintaxis, nombre: 'La sintaxis del modelo' },
        { op: 'poner', selector: '#semEtiqueta', valor: etiqueta, nombre: `El nombre del modelo: ${etiqueta}` },
        { op: 'poner', selector: '#semEstimador', valor: estimador, nombre: `Estimador: ${estimador}` },
        { op: 'pulsar', selector: '#semEvaluar', nombre: '«¿Es adecuado usar SEM aquí?»' },
        { op: 'esperar', condicion: 'conTexto', arg: 'semDecision', ms: 60000, nombre: 'Esperando la evaluación del modelo…' },
        { op: 'pulsar', selector: '#semAjustar', vaciar: '#semOut', nombre: '«Ajustar modelo»' },
        { op: 'esperar', condicion: 'semListo', arg: null, ms: 600000, fallo: 'sem', nombre: `Ajustando «${etiqueta}» (puede tardar)…` },
    ];
}

/** La tarjeta del AFE; sus descargas, solo señaladas. @param {Record<string, any>} d @returns {Op[]} */
function planAFE({ conjunto, items, correlacion = 'auto', factores = 'paralelo', rotacion = 'oblimin', replicas = 200, semilla = 2026 }) {
    /** @type {Op[]} */
    const ops = [ir('analizador'), { op: 'pulsar', selector: '#afeActualizar', nombre: '«Actualizar» la lista de escalas' }];
    if (items) {
        ops.push({ op: 'poner', selector: '#afeConjunto', valor: 'propia', nombre: 'Ítems: una lista propia' });
        ops.push({ op: 'poner', selector: '#afeItems', valor: items.join(', '), nombre: 'Los ítems' });
    } else if (conjunto !== undefined) {
        ops.push({ op: 'ponerOpcion', selector: '#afeConjunto', texto: conjunto, nombre: `Ítems: ${conjunto}` });
    }
    ops.push(
        { op: 'poner', selector: '#afeCorrelacion', valor: correlacion, nombre: `Correlación: ${correlacion}` },
        { op: 'poner', selector: '#afeFactores', valor: factores, nombre: `Factores: ${factores}` },
        { op: 'poner', selector: '#afeRotacion', valor: rotacion, nombre: `Rotación: ${rotacion}` },
        { op: 'poner', selector: '#afeB', valor: String(replicas), nombre: `Réplicas del análisis paralelo: ${replicas}` },
        { op: 'poner', selector: '#afeSemilla', valor: String(semilla), nombre: `Semilla: ${semilla}` },
        { op: 'pulsar', selector: '#afeCalcular', vaciar: '#afeResultados', nombre: '«Calcular AFE»' },
        { op: 'esperar', condicion: 'calculado', arg: ['afeResultados', 'afeMensajes', 'afeCalcular'], ms: 900000, fallo: 'resultados', nombre: 'Calculando el AFE (puede tardar)…' },
        { op: 'senalar', selector: '#afeCSV', nombre: 'Las cargas del AFE en CSV: «Descargar cargas (CSV)»' },
        { op: 'senalar', selector: '#afeWord', nombre: 'El AFE en Word: «Descargar Word (APA 7)»' },
    );
    return ops;
}

/**
 * La tarjeta de la V de Aiken: la escala, la confianza, V₀, tantos criterios como hay (se agregan o se quitan), cada uno
 * con su nombre y su archivo (de la carpeta del caso), y «Calcular V de Aiken»; sus descargas, solo señaladas.
 * @param {Record<string, any>} d
 * @returns {Op[]}
 */
function planAiken({ minimo, maximo, confianza = 0.95, v0 = 0.7, criterios }) {
    const bloques = '#aikenCriterios .criterio-aiken';
    /** @type {Op[]} */
    const ops = [
        ir('analizador'),
        { op: 'poner', selector: '#aikenMinimo', valor: String(minimo), nombre: `Escala: desde ${minimo}` },
        { op: 'poner', selector: '#aikenMaximo', valor: String(maximo), nombre: `Escala: hasta ${maximo}` },
        { op: 'poner', selector: '#aikenConfianza', valor: String(confianza), nombre: `Confianza: ${confianza}` },
        { op: 'poner', selector: '#aikenV0', valor: String(v0), nombre: `Criterio V₀: ${v0}` },
        { op: 'bloques', bloques, agregar: '#aikenAgregarCriterio', quitar: '.btn-delete', n: criterios.length, nombre: criterios.length === 1 ? 'Un criterio' : `${criterios.length} criterios` },
    ];
    criterios.forEach((/** @type {{ nombre: string, archivo: string }} */ c, /** @type {number} */ k) => {
        ops.push({ op: 'ponerEnBloque', bloques, indice: k, selector: '[aria-label="Nombre del criterio"]', valor: c.nombre, nombre: `Criterio ${k + 1}: ${c.nombre}` });
        const archivo = /** @type {string} */ (c.archivo.split('/').pop());
        ops.push({ op: 'limpiarAviso' });   // (el aviso que se espera es el de este archivo, no uno de antes)
        ops.push({ op: 'subirEnBloque', bloques, indice: k, boton: '[data-accion="cargar-csv"]', entrada: 'input[type="file"]', archivo: c.archivo, nombre: `«Cargar CSV»: ${archivo}` });
        const cargado = `«${archivo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}» cargado`;
        ops.push({ op: 'esperar', condicion: 'aviso', arg: [cargado, ''], exito: [cargado, ''], ms: 120000, nombre: `Esperando a que se lea ${archivo}…` });
    });
    ops.push(
        { op: 'pulsar', selector: '#aikenCalcular', vaciar: '#aikenResultados', nombre: '«Calcular V de Aiken»' },
        { op: 'esperar', condicion: 'resultados', arg: ['aikenResultados', 'aikenMensajes'], ms: 120000, fallo: 'resultados', nombre: 'Calculando la V de Aiken…' },
        { op: 'senalar', selector: '#aikenCSV', nombre: 'La V de Aiken en CSV: «Descargar CSV»' },
        { op: 'senalar', selector: '#aikenWord', nombre: 'La V de Aiken en Word: «Descargar Word (APA 7)»' },
    );
    return ops;
}

/** La tarjeta de la invarianza; su Word, solo señalado. @param {Record<string, any>} d @returns {Op[]} */
function planInvarianza({ sintaxis, delSEM = false, grupo, estimador = 'ML', estricta = false, agrupar }) {
    return [
        ir('analizador'),
        delSEM ? { op: 'pulsar', selector: '#invDelSEM', nombre: '«Usar el modelo escrito en la sección SEM»' } : { op: 'poner', selector: '#invSintaxis', valor: sintaxis || '', nombre: 'El modelo de medida' },
        { op: 'pulsar', selector: '#invActualizar', nombre: '«Actualizar» las variables' },
        { op: 'poner', selector: '#invGrupo', valor: grupo, nombre: `Agrupación: ${grupo}` },
        { op: 'poner', selector: '#invEstimador', valor: estimador, nombre: `Estimador: ${estimador}` },
        { op: 'marcar', selector: '#invEstricta', valor: !!estricta, nombre: estricta ? 'Con la invarianza estricta' : 'Sin la invarianza estricta' },
        ...(agrupar === undefined ? [] : [/** @type {Op} */ ({ op: 'marcar', selector: '#invAgrupar', valor: !!agrupar, nombre: agrupar ? 'Agrupando las categorías sin respuestas' : 'Sin agrupar las categorías sin respuestas' })]),
        { op: 'pulsar', selector: '#invCalcular', vaciar: '#invResultados', nombre: '«Evaluar la invarianza»' },
        { op: 'esperar', condicion: 'calculado', arg: ['invResultados', 'invMensajes', 'invCalcular'], ms: 1800000, fallo: 'resultados', nombre: 'Evaluando la invarianza (puede tardar varios minutos)…' },
        { op: 'senalar', selector: '#invWord', nombre: 'La invarianza en Word: «Descargar Word (APA 7)»' },
    ];
}

/** Las descargas de un análisis: solo se señalan. @param {Record<string, any>} d @returns {Op[]} */
function planExportar({ word = true }) {
    return [
        ir('analizador'),
        ...(word ? [/** @type {Op} */ ({ op: 'senalar', selector: '#btnExportarWord', nombre: 'El capítulo en Word: «Exportar capítulo a Word»' })] : []),
        { op: 'senalar', selector: '#btnDescargarResultados', nombre: 'Los resultados en texto: «Descargar resultados»' },
        { op: 'senalar', selector: '#btnImprimirAnalizador', nombre: 'Los resultados en PDF: «Imprimir o guardar en PDF»' },
    ];
}

/** «Guardar proyecto», en Ayuda: solo se señala. @returns {Op[]} */
function planGuardarProyecto() {
    return [ir('ayuda'), { op: 'senalar', selector: '#btnGuardarProyecto', nombre: 'Todo, en un archivo: «Guardar proyecto»' }];
}

/**
 * Las acciones que puede llevar un guion: su título (lo que dice la guía al terminarla; el de una que se repite en un paso,
 * con lo que la distingue), si «Hazlo por mí» la hace, cómo se comprueban sus datos y su plan.
 * @type {Record<string, { titulo: string | ((d: Record<string, any>) => string), ejecutable: boolean, valida: (d: Record<string, any>) => boolean, plan: (d: Record<string, any>) => Op[] }>}
 */
const ACCIONES = {
    usarBaseDelSimulador: { titulo: 'Usar los datos del Simulador', ejecutable: true, valida: d => soloClaves(d, []), plan: planUsarBase },
    describirInvestigacion: {
        titulo: 'La configuración de la investigación', ejecutable: true, plan: planDescribir,
        valida: d => soloClaves(d, ['titulo', 'unidad', 'lugar']) && textoOpcional(d.titulo, 2000) && textoOpcional(d.unidad, 2000) && textoOpcional(d.lugar, 2000),
    },
    analizar: {
        titulo: 'El análisis estadístico', ejecutable: true, plan: planAnalizar,
        valida: d => soloClaves(d, ['tipo', 'variables', 'prueba', 'regresion']) && Object.prototype.hasOwnProperty.call(TIPOS_DE_ANALISIS, d.tipo)
            && listaDeTextos(d.variables, 2, 12) && (d.prueba === undefined || Object.prototype.hasOwnProperty.call(PRUEBAS, d.prueba))
            && (d.regresion === undefined || (esObjeto(d.regresion) && soloClaves(d.regresion, ['dependiente', 'predictores', 'interaccion', 'cuadratico', 'poisson'])
                && esTexto(d.regresion.dependiente, 200) && listaDeTextos(d.regresion.predictores, 1, 12)
                && logicoOpcional(d.regresion.interaccion) && logicoOpcional(d.regresion.cuadratico) && logicoOpcional(d.regresion.poisson))),
    },
    compararGrupos: {
        titulo: 'La comparación entre grupos', ejecutable: true, plan: planCompararGrupos,
        valida: d => soloClaves(d, ['grupo', 'numerica', 'covariable', 'adicionales']) && esTexto(d.grupo, 200) && esTexto(d.numerica, 200)
            && textoOpcional(d.covariable, 200) && (d.adicionales === undefined || listaDeTextos(d.adicionales, 0, 12)),
    },
    ajustarSEM: {
        titulo: d => `El SEM «${d.etiqueta || 'Modelo inicial'}»`, ejecutable: true, plan: planSEM,
        valida: d => soloClaves(d, ['sintaxis', 'etiqueta', 'estimador']) && esTexto(d.sintaxis, 20000) && textoOpcional(d.etiqueta, 200)
            && (d.estimador === undefined || ESTIMADORES.includes(d.estimador)),
    },
    calcularAFE: {
        titulo: 'El análisis factorial exploratorio', ejecutable: true, plan: planAFE,
        valida: d => soloClaves(d, ['conjunto', 'items', 'correlacion', 'factores', 'rotacion', 'replicas', 'semilla']) && textoOpcional(d.conjunto, 300)
            && (d.items === undefined || listaDeTextos(d.items, 1, 1000)) && textoOpcional(d.correlacion, 40) && textoOpcional(d.factores, 40)
            && textoOpcional(d.rotacion, 40) && enteroOpcional(d.replicas, 1, 100000) && enteroOpcional(d.semilla, 0, 2 ** 32),
    },
    calcularAiken: {
        titulo: 'La V de Aiken', ejecutable: true, plan: planAiken,
        valida: d => soloClaves(d, ['minimo', 'maximo', 'confianza', 'v0', 'criterios']) && numero(d.minimo) && numero(d.maximo)
            && (d.confianza === undefined || numero(d.confianza)) && (d.v0 === undefined || numero(d.v0))
            && Array.isArray(d.criterios) && d.criterios.length >= 1 && d.criterios.length <= 50
            && d.criterios.every((/** @type {unknown} */ c) => esObjeto(c) && soloClaves(c, ['nombre', 'archivo']) && esTexto(c.nombre, 200) && rutaDelCaso(c.archivo)),
    },
    evaluarInvarianza: {
        titulo: 'La invarianza de medición', ejecutable: true, plan: planInvarianza,
        valida: d => soloClaves(d, ['sintaxis', 'delSEM', 'grupo', 'estimador', 'estricta', 'agrupar']) && textoOpcional(d.sintaxis, 20000) && logicoOpcional(d.delSEM)
            && esTexto(d.grupo, 200) && (d.estimador === undefined || ESTIMADORES.includes(d.estimador)) && logicoOpcional(d.estricta) && logicoOpcional(d.agrupar),
    },
    exportarAnalisis: {
        titulo: 'Las descargas del análisis', ejecutable: false, plan: planExportar,
        valida: d => soloClaves(d, ['word', 'carpeta']) && logicoOpcional(d.word) && (d.carpeta === undefined || (rutaDelCaso(d.carpeta) && !d.carpeta.includes('/'))),
    },
    guardarProyecto: { titulo: 'Guardar el proyecto', ejecutable: false, valida: d => soloClaves(d, []), plan: planGuardarProyecto },
};

/** Las acciones que conoce esta versión. */
export const NOMBRES_DE_ACCIONES = Object.freeze(Object.keys(ACCIONES));

/**
 * ¿Es una acción de un guion que esta versión sabe hacer, con datos de la forma que espera?
 * @param {unknown} a
 * @returns {a is AccionDelGuion}
 */
export function accionValida(a) {
    if (!esObjeto(a) || !soloClaves(a, ['accion', 'datos']) || typeof a.accion !== 'string' || !Object.prototype.hasOwnProperty.call(ACCIONES, a.accion) || !esObjeto(a.datos)) return false;
    try { return ACCIONES[a.accion].valida(a.datos); } catch (e) { return false; }
}

/**
 * ¿Es el guion de un paso (una lista de acciones válidas, hasta 20)?
 * @param {unknown} g
 * @returns {g is AccionDelGuion[]}
 */
export const guionValido = g => Array.isArray(g) && g.length <= 20 && g.every(accionValida);

/**
 * El plan de una acción de un guion (comprobada antes).
 * @param {AccionDelGuion} a
 * @returns {Plan}
 */
export function planDe(a) {
    if (!accionValida(a)) throw new Error(`Paso de guion no válido: ${JSON.stringify(a).slice(0, 120)}`);
    const def = ACCIONES[a.accion];
    const ops = def.plan(a.datos);
    // (lo que se espera, con una condición conocida: planes y condiciones van juntos)
    for (const o of ops) if (o.op === 'esperar' && !esCondicion(o.condicion)) throw new Error(`Condición desconocida: ${o.condicion}`);
    return { titulo: typeof def.titulo === 'function' ? def.titulo(a.datos) : def.titulo, ops, ejecutable: def.ejecutable };
}

/**
 * Lo que de un plan es de la persona y solo se señala (sus descargas), con la sección en que está: vacío si no hay nada.
 * @param {Op[]} ops
 * @returns {Op[]}
 */
export function senalesDe(ops) {
    const senales = ops.filter(o => o.op === 'senalar');
    const seccion = ops.find(o => o.op === 'ir');
    return senales.length && seccion ? [seccion, ...senales] : senales;
}

/**
 * Los archivos del caso que sube una acción (las valoraciones de la V de Aiken), por su ruta: deben estar en el caso.
 * @param {AccionDelGuion} a (comprobada antes)
 * @returns {string[]}
 */
export const archivosDeLaAccion = a => (a.accion === 'calcularAiken' ? a.datos.criterios.map((/** @type {{ archivo: string }} */ c) => c.archivo) : []);

/**
 * ¿Tiene el paso algo que haga «Hazlo por mí»? (Lo demás —las descargas, guardar el proyecto— solo se señala.)
 * @param {AccionDelGuion[]} guion
 */
export const guionEjecutable = guion => guion.some(a => !!ACCIONES[a.accion] && ACCIONES[a.accion].ejecutable);

/**
 * ¿Lo hace «Hazlo por mí»? (Las descargas y guardar el proyecto, no: solo se señalan.)
 * @param {AccionDelGuion} a
 */
export const accionEjecutable = a => !!ACCIONES[a.accion] && ACCIONES[a.accion].ejecutable;
