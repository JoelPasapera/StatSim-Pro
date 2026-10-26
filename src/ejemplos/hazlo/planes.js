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
/** (2027.01.07) Los papeles de un modelo del SEM, como en su tarjeta (sem-ui.js, «¿Qué papel juega este modelo?»). */
export const PAPELES_DEL_SEM = Object.freeze(['Modelo inicial', 'Modelo alternativo', 'Modelo final']);
/** El papel de un modelo del SEM de un guion: el suyo o, sin él, el que la tarjeta trae elegido. @param {Record<string, any>} d */
export const papelDelSEM = d => d.etiqueta || PAPELES_DEL_SEM[0];

/**
 * (2027.01.07, revisión) Las opciones de las listas de la página (y de los botones de opción del análisis) que un guion elige
 * por su valor, las mismas que ofrece cada una: con otra, «Hazlo por mí» no podría elegirla («la lista no tiene esa opción»).
 * Lo comprueba tests/ui/ejemplos-hazlo.test.js contra la página. Hasta la 2027.01.06 accionValida admitía cualquier papel del
 * SEM, cualquier número de réplicas del AFE o cualquier confianza de la V de Aiken.
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const OPCIONES_DE_LAS_LISTAS = Object.freeze({
    'input[name="tipoAnalisis"]': Object.keys(TIPOS_DE_ANALISIS),
    'input[name="tipoPrueba"]': Object.keys(PRUEBAS),
    '#semEtiqueta': PAPELES_DEL_SEM,
    '#semEstimador': ESTIMADORES,
    '#afeCorrelacion': ['auto', 'policorica', 'pearson'],
    '#afeFactores': ['paralelo', '1', '2', '3', '4', '5', '6', '7', '8'],
    '#afeRotacion': ['oblimin', 'promax', 'varimax', 'ninguna'],
    '#afeB': ['100', '200', '500'],
    '#aikenConfianza': ['0.9', '0.95', '0.975', '0.99', '0.999'],
    '#aikenV0': ['0.5', '0.7', '0.8'],
    '#invEstimador': ESTIMADORES,
});
/** ¿Es una de las opciones de esa lista (o no se da)? Los números, por su texto (como el valor de la opción). @param {unknown} x @param {string} lista */
const opcionDe = (x, lista) => x === undefined || ((typeof x === 'string' || (typeof x === 'number' && Number.isFinite(x))) && OPCIONES_DE_LAS_LISTAS[lista].includes(String(x)));

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
function planSEM({ sintaxis, etiqueta = PAPELES_DEL_SEM[0], estimador = 'ML' }) {
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
        { op: 'bloques', bloques, agregar: '#aikenAgregarCriterio', quitar: '.btn-delete', n: criterios.length, nombre: `Criterios en total: ${criterios.length === 1 ? 'uno' : criterios.length}` },   // (2027.01.04) junto a «+ Agregar criterio», «3 criterios» parecía pedir tres más
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

// ------------------------------------------------------------------------------------------------ lo que la página puede hacer

/**
 * (2027.01.10, revisión) Los límites de la página que un guion no puede pasar (ui/ejemplos-hazlo.test.js los compara con la
 * página): «＋ Agregar variable» y «＋ Agregar predictor» se quedan en 6 cada uno (analizador/ui/analisis.js); la escala de la
 * V de Aiken, de números enteros y con 21 categorías como mucho (psicometria/aiken.js, validarEntrada); el AFE, con 3 ítems
 * distintos o más (psicometria/afe-ui.js), que su campo separa por comas, puntos y comas o espacios. (2027.01.11, revisión) Y
 * el nombre de un criterio de la V de Aiken, de 60 caracteres como mucho (su campo: psicometria/aiken-ui.js).
 */
export const LIMITES_DE_LA_PAGINA = Object.freeze({ variablesAdicionales: 6, predictoresAdicionales: 6, categoriasDeAiken: 21, itemsDelAFE: 3, nombreDeCriterio: 60 });

/** Un análisis, en una frase («una comparación de grupos»). @param {string} tipo */
const unAnalisis = tipo => (tipo === 'comparacion' ? 'una comparación de grupos' : tipo === 'asociacion' ? 'una asociación (χ²)' : 'una correlación');

/**
 * Lo que la página no puede hacer de un análisis (con la forma debida): el motivo, o ''. Con la misma variable dos veces no
 * analiza; las variables y los predictores adicionales no pasan de sus límites; y la regresión, que solo hace con una
 * correlación, la deja fuera sin que el paso falle con su variable dependiente vacía o entre los predictores, o con un
 * predictor repetido (analizador/ui/analisis.js, ejecutarRegresionBivariadaOpcional); su interacción, solo desde dos
 * predictores (con uno, su casilla no se ve). (2027.01.11, revisión) Las variables adicionales y la prueba unilateral, solo con
 * una correlación (con una comparación o una asociación no las usa), y la unilateral, solo de dos variables (la matriz de
 * correlaciones no la usa); y la regresión de Poisson, solo con los efectos principales (regresion.js, la ajusta sin la
 * interacción ni el término cuadrático).
 * @param {Record<string, any>} d
 * @returns {string}
 */
function noPuedeAnalizar(d) {
    const [v1, v2, ...adicionales] = /** @type {string[]} */ (d.variables), r = d.regresion, L = LIMITES_DE_LA_PAGINA;
    if (v1 === v2) return `la misma variable dos veces (${v1}): la página no analiza («Las variables deben ser diferentes»)`;
    if (adicionales.length > L.variablesAdicionales) return `${adicionales.length} variables adicionales: la página admite ${L.variablesAdicionales}`;
    if (d.tipo !== 'correlacion' && adicionales.length) return `${adicionales.length === 1 ? 'una variable adicional' : `${adicionales.length} variables adicionales`} con ${unAnalisis(d.tipo)}: la página solo las usa en una correlación`;
    if (d.prueba === 'unilateral' && d.tipo !== 'correlacion') return `una prueba unilateral con ${unAnalisis(d.tipo)}: la página la hace solo en la correlación de dos variables`;
    if (d.prueba === 'unilateral' && adicionales.some(v => v !== v1 && v !== v2)) return 'una prueba unilateral con una matriz de correlaciones: la página la hace solo en la correlación de dos variables';
    if (!r) return '';
    const predictores = /** @type {string[]} */ (r.predictores);
    if (d.tipo !== 'correlacion') return `una regresión con ${unAnalisis(d.tipo)}: la página la hace solo con una correlación`;
    if (!r.dependiente) return 'una regresión sin su variable dependiente: la página no la hace';
    if (predictores.includes(r.dependiente)) return `una regresión con su variable dependiente (${r.dependiente}) entre los predictores: la página no la hace («Y no puede estar entre los predictores»)`;
    if (new Set(predictores).size < predictores.length) return 'una regresión con un predictor repetido: la página no la estima';
    if (predictores.length - 1 > L.predictoresAdicionales) return `una regresión con ${predictores.length} predictores: la página admite ${L.predictoresAdicionales + 1}`;
    if (r.interaccion && predictores.length < 2) return 'la interacción de una regresión con un solo predictor: la página la ofrece desde dos';
    if (r.poisson && (r.interaccion || r.cuadratico)) return `una regresión de Poisson con ${r.interaccion && r.cuadratico ? 'la interacción y el término cuadrático' : r.interaccion ? 'la interacción' : 'el término cuadrático'}: la página la ajusta solo con los efectos principales`;
    return '';
}

/**
 * (2027.01.11, revisión) Lo que la página no puede hacer de una comparación entre grupos: su agrupación es una variable de
 * texto, y la numérica, la covariable y las adicionales, de números (comparacion-grupos.js, actualizarSelects): la misma no
 * puede estar en las dos clases de listas (el paso fallaría: «la lista no tiene esa opción»). Con la numérica como covariable
 * no hace la ANCOVA («la covariable no puede ser la misma variable numérica que comparas»), y entre las adicionales la quita
 * de la MANOVA; una adicional repetida, la usa una vez.
 * @param {Record<string, any>} d
 * @returns {string}
 */
function noPuedeCompararGrupos({ grupo, numerica, covariable = '', adicionales = [] }) {
    const extra = /** @type {string[]} */ (adicionales);
    // (2027.01.12, revisión) sin una de las dos, ese es el motivo (con la agrupación vacía y sin covariable, decía «su
    // agrupación () como covariable»)
    if (!grupo) return 'una comparación entre grupos sin su variable de agrupación: la página no la hace («Selecciona ambas variables»)';
    if (!numerica) return 'una comparación entre grupos sin su variable numérica: la página no la hace («Selecciona ambas variables»)';
    if (grupo === numerica) return `una comparación entre grupos con la misma variable (${grupo}) como agrupación y como numérica: la página no la hace (la agrupación es de texto, y la numérica, de números)`;
    if (covariable === grupo) return `una comparación entre grupos con su agrupación (${grupo}) como covariable: la página no la hace (la agrupación es de texto, y la covariable, de números)`;
    if (extra.includes(grupo)) return `una comparación entre grupos con su agrupación (${grupo}) entre las variables adicionales: la página no la hace (la agrupación es de texto, y las adicionales, de números)`;
    if (covariable && covariable === numerica) return `una ANCOVA con la variable numérica (${numerica}) como covariable: la página no la hace («la covariable no puede ser la misma variable numérica que comparas»)`;
    if (extra.includes(numerica)) return `una MANOVA con la variable numérica (${numerica}) entre las adicionales: la página la quita de ellas`;
    if (new Set(extra).size < extra.length) return 'una MANOVA con una variable adicional repetida: la página la usa una vez';
    return '';
}

/**
 * Lo que la página no puede hacer de la V de Aiken: su escala (las valoraciones son de sus archivos) y (2027.01.11, revisión) el
 * nombre de un criterio más largo que su campo, que lo cortaría.
 * @param {Record<string, any>} d
 */
function noPuedeAiken({ minimo, maximo, criterios }) {
    const largo = /** @type {Array<{ nombre: string }>} */ (criterios).find(c => c.nombre.length > LIMITES_DE_LA_PAGINA.nombreDeCriterio);
    if (largo) return `un criterio de la V de Aiken con un nombre de ${largo.nombre.length} caracteres («${largo.nombre.slice(0, 30)}…»): su campo admite ${LIMITES_DE_LA_PAGINA.nombreDeCriterio}`;
    if (!Number.isInteger(minimo) || !Number.isInteger(maximo)) return `una escala de ${minimo} a ${maximo}: la página la quiere de números enteros`;
    if (maximo <= minimo) return `una escala de ${minimo} a ${maximo}: la página quiere el máximo mayor que el mínimo`;
    const categorias = maximo - minimo + 1;
    return categorias > LIMITES_DE_LA_PAGINA.categoriasDeAiken ? `una escala de ${categorias} categorías: la página admite ${LIMITES_DE_LA_PAGINA.categoriasDeAiken}` : '';
}

/** Lo que la página no puede hacer de un AFE con sus ítems: menos de 3 distintos, o uno que su campo partiría. @param {Record<string, any>} d */
function noPuedeAFE({ items }) {
    if (!items) return '';
    const partido = /** @type {string[]} */ (items).find(it => /[,;\s]/.test(it));
    if (partido !== undefined) return `un AFE con el ítem «${partido}»: su campo separa los ítems por comas, puntos y comas o espacios`;
    const distintos = new Set(items).size;
    return distintos < LIMITES_DE_LA_PAGINA.itemsDelAFE ? `un AFE de ${distintos} ${distintos === 1 ? 'ítem' : 'ítems'}: la página lo hace desde ${LIMITES_DE_LA_PAGINA.itemsDelAFE}` : '';
}

/**
 * Lo que la página no puede hacer de la invarianza: sin su modelo, ni la estricta con WLSMV ni agrupar las categorías con ML
 * (sus casillas están desactivadas: psicometria/invarianza-ui.js).
 * @param {Record<string, any>} d
 */
function noPuedeInvarianza({ sintaxis, delSEM, estimador, estricta, agrupar }) {
    const wlsmv = estimador === 'WLSMV';
    if (!delSEM && !(sintaxis || '').trim()) return 'la invarianza sin su modelo (ni su sintaxis ni el de la sección SEM): la página no la evalúa';
    if (wlsmv && estricta) return 'la invarianza estricta con WLSMV: la página la ofrece solo con ML';
    if (!wlsmv && agrupar !== undefined) return 'agrupar las categorías sin respuestas con ML: la página lo ofrece solo con WLSMV';
    return '';
}

/** «Guardar proyecto», en Ayuda: solo se señala. @returns {Op[]} */
function planGuardarProyecto() {
    return [ir('ayuda'), { op: 'senalar', selector: '#btnGuardarProyecto', nombre: 'Todo, en un archivo: «Guardar proyecto»' }];
}

/**
 * Las acciones que puede llevar un guion: su título (lo que dice la guía al terminarla; el de una que se repite en un paso,
 * con lo que la distingue), si «Hazlo por mí» la hace, cómo se comprueban sus datos, su plan y (2027.01.10) lo que la página no
 * puede hacer de ella aunque tenga la forma debida (noPuede: el motivo, o '').
 * @type {Record<string, { titulo: string | ((d: Record<string, any>) => string), ejecutable: boolean, valida: (d: Record<string, any>) => boolean, plan: (d: Record<string, any>) => Op[], noPuede?: (d: Record<string, any>) => string }>}
 */
const ACCIONES = {
    usarBaseDelSimulador: { titulo: 'Usar los datos del Simulador', ejecutable: true, valida: d => soloClaves(d, []), plan: planUsarBase },
    describirInvestigacion: {
        titulo: 'La configuración de la investigación', ejecutable: true, plan: planDescribir,
        valida: d => soloClaves(d, ['titulo', 'unidad', 'lugar']) && textoOpcional(d.titulo, 2000) && textoOpcional(d.unidad, 2000) && textoOpcional(d.lugar, 2000),
    },
    analizar: {
        titulo: 'El análisis estadístico', ejecutable: true, plan: planAnalizar, noPuede: noPuedeAnalizar,
        valida: d => soloClaves(d, ['tipo', 'variables', 'prueba', 'regresion']) && typeof d.tipo === 'string' && opcionDe(d.tipo, 'input[name="tipoAnalisis"]')
            && listaDeTextos(d.variables, 2, 12)
            && (d.prueba === undefined || (typeof d.prueba === 'string' && opcionDe(d.prueba, 'input[name="tipoPrueba"]')))
            && (d.regresion === undefined || (esObjeto(d.regresion) && soloClaves(d.regresion, ['dependiente', 'predictores', 'interaccion', 'cuadratico', 'poisson'])
                && esTexto(d.regresion.dependiente, 200) && listaDeTextos(d.regresion.predictores, 1, 12)
                && logicoOpcional(d.regresion.interaccion) && logicoOpcional(d.regresion.cuadratico) && logicoOpcional(d.regresion.poisson))),
    },
    compararGrupos: {
        titulo: 'La comparación entre grupos', ejecutable: true, plan: planCompararGrupos, noPuede: noPuedeCompararGrupos,
        valida: d => soloClaves(d, ['grupo', 'numerica', 'covariable', 'adicionales']) && esTexto(d.grupo, 200) && esTexto(d.numerica, 200)
            && textoOpcional(d.covariable, 200) && (d.adicionales === undefined || listaDeTextos(d.adicionales, 0, 12)),
    },
    ajustarSEM: {
        titulo: d => `El SEM «${papelDelSEM(d)}»`, ejecutable: true, plan: planSEM,
        noPuede: d => (d.sintaxis.trim() ? '' : 'un SEM sin su modelo (la sintaxis vacía): la página no lo ajusta'),
        valida: d => soloClaves(d, ['sintaxis', 'etiqueta', 'estimador']) && esTexto(d.sintaxis, 20000)
            && (d.etiqueta === undefined || (typeof d.etiqueta === 'string' && opcionDe(d.etiqueta, '#semEtiqueta')))
            && (d.estimador === undefined || (typeof d.estimador === 'string' && opcionDe(d.estimador, '#semEstimador'))),
    },
    calcularAFE: {
        titulo: 'El análisis factorial exploratorio', ejecutable: true, plan: planAFE, noPuede: noPuedeAFE,
        valida: d => soloClaves(d, ['conjunto', 'items', 'correlacion', 'factores', 'rotacion', 'replicas', 'semilla']) && textoOpcional(d.conjunto, 300)
            && (d.items === undefined || listaDeTextos(d.items, 1, 1000))
            && (d.correlacion === undefined || (typeof d.correlacion === 'string' && opcionDe(d.correlacion, '#afeCorrelacion')))
            && (d.factores === undefined || (typeof d.factores === 'string' && opcionDe(d.factores, '#afeFactores')))
            && (d.rotacion === undefined || (typeof d.rotacion === 'string' && opcionDe(d.rotacion, '#afeRotacion')))
            && (d.replicas === undefined || (Number.isInteger(d.replicas) && opcionDe(d.replicas, '#afeB')))
            && enteroOpcional(d.semilla, 1, 2 ** 32),   // (2027.01.07) desde 1, como su campo: con 0, la tarjeta usaba 2026
    },
    calcularAiken: {
        titulo: 'La V de Aiken', ejecutable: true, plan: planAiken, noPuede: noPuedeAiken,
        valida: d => soloClaves(d, ['minimo', 'maximo', 'confianza', 'v0', 'criterios']) && numero(d.minimo) && numero(d.maximo)
            && (d.confianza === undefined || (numero(d.confianza) && opcionDe(d.confianza, '#aikenConfianza')))
            && (d.v0 === undefined || (numero(d.v0) && opcionDe(d.v0, '#aikenV0')))
            && Array.isArray(d.criterios) && d.criterios.length >= 1 && d.criterios.length <= 50
            && d.criterios.every((/** @type {unknown} */ c) => esObjeto(c) && soloClaves(c, ['nombre', 'archivo']) && esTexto(c.nombre, 200) && rutaDelCaso(c.archivo)),
    },
    evaluarInvarianza: {
        titulo: 'La invarianza de medición', ejecutable: true, plan: planInvarianza, noPuede: noPuedeInvarianza,
        valida: d => soloClaves(d, ['sintaxis', 'delSEM', 'grupo', 'estimador', 'estricta', 'agrupar']) && textoOpcional(d.sintaxis, 20000) && logicoOpcional(d.delSEM)
            && esTexto(d.grupo, 200) && (d.estimador === undefined || (typeof d.estimador === 'string' && opcionDe(d.estimador, '#invEstimador')))
            && logicoOpcional(d.estricta) && logicoOpcional(d.agrupar),
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
 * (2027.01.10, revisión) Lo que la página no puede hacer de una acción válida (accionValida), tal como la pide: el motivo, en una
 * frase («la misma variable dos veces (A): la página no analiza…»), o '' si puede. Hasta la 2027.01.09 se admitían guiones
 * que «Hazlo por mí» no podía repetir (fallaba a medio paso) o que la página hacía a medias sin decirlo (una regresión con su
 * variable dependiente entre los predictores salía sin regresión, y el paso, hecho). Para las reglas de los guiones
 * (reglas.js): un caso así se lee sin sus guiones; uno con una acción que no tiene la forma debida deja el catálogo sin leer.
 * @param {AccionDelGuion} a
 * @returns {string}
 */
export function queNoPuede(a) {
    const accion = ACCIONES[a.accion];
    return accion && accion.noPuede ? accion.noPuede(a.datos) : '';
}

/** Las acciones que puede llevar el guion de un paso, como mucho. */
export const MAXIMO_ACCIONES = 20;

/**
 * ¿Es el guion de un paso (una lista de acciones válidas, hasta MAXIMO_ACCIONES)?
 * @param {unknown} g
 * @returns {g is AccionDelGuion[]}
 */
export const guionValido = g => Array.isArray(g) && g.length <= MAXIMO_ACCIONES && g.every(accionValida);

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

/**
 * @typedef {'word' | 'texto' | 'pdf'} DescargaDelAnalisis el capítulo en Word, los resultados en texto, lo impreso (el PDF)
 */

/**
 * (2027.01.04, revisión) Cuáles de las descargas del análisis de la vista principal llevan lo que deja cada acción en su
 * tarjeta: lo impreso (el PDF) imprime todas las tarjetas con resultados; el capítulo de Word, solo el SEM (la comparación
 * entre grupos la rehace él con las variables del análisis; (2027.01.05) su ANCOVA y su MANOVA, en cambio, sí van:
 * descargasQueLleva); el texto, ninguna. Los datos y la configuración de la investigación van en todas.
 * @type {Record<string, DescargaDelAnalisis[]>}
 */
const EN_LAS_DESCARGAS = {
    usarBaseDelSimulador: ['word', 'texto', 'pdf'], describirInvestigacion: ['word', 'texto', 'pdf'],
    compararGrupos: ['pdf'], ajustarSEM: ['word', 'pdf'], calcularAFE: ['pdf'], calcularAiken: ['pdf'], evaluarInvarianza: ['pdf'],
};

/** ¿La comparación de grupos hace también una ANCOVA? Con una covariable que no es la variable que compara. @param {Record<string, any>} d */
const conAncova = d => !!d.covariable && d.covariable !== d.numerica;
/** ¿Y un MANOVA? Con más variables que la que compara. @param {Record<string, any>} d */
const conManova = d => (d.adicionales || []).some((/** @type {string} */ c) => c !== d.numerica);
/**
 * (2027.01.05) ¿La comparación de grupos hace también una ANCOVA o un MANOVA? Como la tarjeta (comparacion-grupos.js).
 * @param {Record<string, any>} d
 */
const conAncovaOManova = d => conAncova(d) || conManova(d);

/**
 * (2027.01.04, revisión) Lo que lleva una acción en las descargas del análisis (vacío: nada). (2027.01.05, revisión) La
 * comparación de grupos con su ANCOVA o su MANOVA va también en el Word: el capítulo los trae tras la comparación entre
 * grupos (exportador-word.js), hasta el siguiente «Ejecutar análisis» (loQueBorraOtroAnalisis). Hasta la 2027.01.04 se decía
 * que solo en lo impreso.
 * @param {AccionDelGuion} a
 * @returns {DescargaDelAnalisis[]}
 */
export const descargasQueLleva = a => (a.accion === 'compararGrupos' && conAncovaOManova(a.datos || {}) ? ['word', 'pdf'] : EN_LAS_DESCARGAS[a.accion] || []);

/**
 * (2027.01.05) De lo que lleva una acción, lo que se lleva el siguiente «Ejecutar análisis» (olvidarAnalisisAnterior,
 * analizador/ui/analisis.js): la ANCOVA y el MANOVA de la comparación de grupos salen del Word. (Su tarjeta se queda en la
 * página: lo impreso la sigue llevando.)
 * @param {AccionDelGuion} a
 * @returns {DescargaDelAnalisis[]}
 */
export const loQueBorraOtroAnalisis = a => (a.accion === 'compararGrupos' ? ['word'] : []);

/**
 * (2027.01.07, revisión) Lo que se lleva del Word el siguiente «Ejecutar análisis» de lo que deja una acción (loQueBorraOtroAnalisis),
 * en palabras: «la ANCOVA», «el MANOVA» o «la ANCOVA y el MANOVA» de la comparación de grupos; vacío si no deja nada en el Word.
 * Para el aviso de la guía (sesion.js), que hasta la 2027.01.06 decía «lo que deja el paso 2» también con su SEM en el Word.
 * @param {AccionDelGuion} a
 */
export function queBorraOtroAnalisis(a) {
    if (a.accion !== 'compararGrupos') return '';
    const d = a.datos || {}, ancova = conAncova(d), manova = conManova(d);
    return ancova && manova ? 'la ANCOVA y el MANOVA' : ancova ? 'la ANCOVA' : manova ? 'el MANOVA' : '';
}

/**
 * (2027.01.08, revisión) ¿Tiene capítulo de Word lo que deja un análisis? Solo una correlación de dos variables (con su regresión
 * o sin ella): tras una comparación de grupos, una asociación o una matriz de tres o más variables, «Exportar capítulo a Word»
 * solo dice por qué no lo hay (analizador/ui/index.js, SIN_CAPITULO). (2027.01.09, revisión) La matriz, como la decide la
 * página (analizador/ui/analisis.js): alguna variable adicional que no es una de las dos primeras; una repetida no cuenta (la
 * 2027.01.08 contaba las del guion, y con ['A', 'B', 'A'] daba por matriz la correlación de A y B). Para las reglas de los
 * guiones (reglas.js).
 * @param {AccionDelGuion} a (un «analizar»)
 */
export const tieneCapitulo = a => {
    if (a.accion !== 'analizar' || a.datos.tipo !== 'correlacion') return false;
    const [v1, v2, ...adicionales] = /** @type {string[]} */ (a.datos.variables);
    return adicionales.every(v => v === v1 || v === v2);
};

/** Cada descarga del análisis, por el botón que la baja (el que señala planExportar). @type {Record<string, DescargaDelAnalisis>} */
const DESCARGA_DEL_BOTON = { '#btnExportarWord': 'word', '#btnDescargarResultados': 'texto', '#btnImprimirAnalizador': 'pdf' };

/**
 * (2027.01.04, revisión) Cuáles de las descargas del análisis señalan unas operaciones, en orden (el Word, el texto, el PDF).
 * @param {Op[]} ops
 * @returns {DescargaDelAnalisis[]}
 */
export function descargasDelAnalisis(ops) {
    const botones = new Set(ops.map(o => (o.op === 'senalar' ? DESCARGA_DEL_BOTON[o.selector] : undefined)));
    return /** @type {DescargaDelAnalisis[]} */ (['word', 'texto', 'pdf']).filter(d => botones.has(d));
}
