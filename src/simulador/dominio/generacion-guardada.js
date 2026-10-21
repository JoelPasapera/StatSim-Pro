// @ts-check
// simulador/dominio/generacion-guardada.js — (2026.12.31, revisión) lo que un proyecto guarda de una generación (la
// configuración expandida con que se generó la base, el informe «pedido vs. obtenido» y los diagnósticos;
// simulador/ui/proyecto.js) y su comprobación al abrirlo, antes de dejarlo en la página, porque un proyecto puede ser de
// otra persona y estar manipulado: la forma de lo que pintan la interfaz y las descargas (los textos, textos; los números,
// números), el tamaño de las listas y de los textos, los números que fijan cuántas veces se repite algo (los ítems de una
// escala, los jueces) —un «numItems» de mil millones colgaría la página al etiquetar las columnas—, que además tienen que
// caber en la base que la acompaña (cada ítem, cada escala y cada juez es una columna suya: así el trabajo de las etiquetas
// queda acotado por la base, no por lo que diga el archivo) y, al final, un ensayo de las etiquetas y de la estructura de
// pruebas que el Analizador y las descargas calculan con esa configuración, sobre una copia del generador (el de la página
// no cambia). Sin DOM.

/** Los límites: muy por encima de cualquier configuración real (la más grande de las pruebas: 50 escalas expandidas). */
const LIMITE = Object.freeze({ escalas: 5000, lista: 200000, texto: 100000, profundidad: 32, items: 10000, jueces: 100 });

/**
 * (2026.12.31, cuarta y quinta revisión) Lo más que trae «generacion.json», para medirlo antes de leerlo
 * (core/data/json-acotado.js: JSON.parse construía todo antes de esta comprobación): los niveles de la generación más los
 * de las marcas de core/data/json-fiel.js, y unas diez veces los contenedores y los valores de una generación de 5000 escalas
 * (unos 4 contenedores y 20 valores por escala, sin la matriz de correlaciones: generacionParaGuardar). Cada contenedor
 * puede ser una marca del JSON fiel (un arreglo tipado es un ArrayBuffer): con 2 millones, 7 s de pestaña congelada.
 * @type {import('../../core/data/json-acotado.js').TopesJson}
 */
export const TOPES_JSON_GENERACION = Object.freeze({ profundidad: 2 * LIMITE.profundidad + 8, contenedores: 200000, elementos: 2000000 });

/** Lo que el aviso de correlaciones conserva de cada lista del diagnóstico (pinta las primeras: 4 tríadas, 8 ajustes). */
const MAXIMO_LISTA_DIAGNOSTICO = 1000;

/** @param {unknown} x @returns {x is Record<string, any>} */
const esObjeto = x => !!x && typeof x === 'object' && !Array.isArray(x) && !ArrayBuffer.isView(x) && !(x instanceof Date) && !(x instanceof Map) && !(x instanceof Set);
/** @param {unknown} x @param {number} desde @param {number} hasta */
const enteroEntre = (x, desde, hasta) => typeof x === 'number' && Number.isSafeInteger(x) && x >= desde && x <= hasta;
/** @param {unknown} x @param {(v: any) => boolean} prueba */
const opcional = (x, prueba) => x === undefined || x === null || prueba(x);
/** @param {unknown} x */
const esTexto = x => typeof x === 'string';
/** Un valor del informe: un texto o un número (NaN incluido: «sin dato»). @param {unknown} x */
const esValor = x => typeof x === 'string' || typeof x === 'number';
/** @param {unknown} x @param {(v: any) => boolean} prueba */
const listaDe = (x, prueba) => Array.isArray(x) && x.every(prueba);

/**
 * ¿Están las listas, los textos y el anidamiento de un valor (de deJsonFiel) dentro de los límites?
 * @param {unknown} v
 * @param {number} [profundidad]
 * @returns {boolean}
 */
function acotado(v, profundidad = 0) {
    if (profundidad > LIMITE.profundidad) return false;
    if (typeof v === 'string') return v.length <= LIMITE.texto;
    if (v === null || typeof v !== 'object' || v instanceof Date) return true;
    if (ArrayBuffer.isView(v)) return v.byteLength <= LIMITE.lista * 8;
    if (Array.isArray(v)) return v.length <= LIMITE.lista && v.every(x => acotado(x, profundidad + 1));
    if (v instanceof Map) return v.size <= LIMITE.lista && [...v].every(([k, x]) => acotado(k, profundidad + 1) && acotado(x, profundidad + 1));
    if (v instanceof Set) return v.size <= LIMITE.lista && [...v].every(x => acotado(x, profundidad + 1));
    const claves = Object.keys(v);
    return claves.length <= LIMITE.lista && claves.every(k => k.length <= LIMITE.texto && acotado(/** @type {Record<string, unknown>} */ (v)[k], profundidad + 1));
}

/** @param {string} que */
const sinForma = que => new Error(`${que} no tiene la forma esperada («generacion.json»)`);

/**
 * La configuración expandida: sus listas, listas de objetos (las escalas, siempre: la vista previa las cuenta); las escalas,
 * con nombre y con un número de ítems razonable; los jueces de una concordancia, también; y todo eso, dentro de las
 * columnas de la base (cada escala tiene su total; cada ítem y cada juez, su columna).
 * @param {unknown} cfg
 * @param {number} columnas las de la base que acompaña a la configuración
 * @returns {Record<string, any>}
 */
function comprobarConfiguracion(cfg, columnas) {
    const mal = sinForma('la configuración con que se generó la base');
    if (!esObjeto(cfg) || !Array.isArray(cfg.pruebas)) throw mal;
    for (const k of ['pruebas', 'sociodemograficos', 'concordancias', 'desenlaces', 'cortes', 'histeresis', 'gruposPruebas', 'medidasRepetidas']) {
        // cada lista, de objetos y no más larga que el máximo de escalas (algunas se recorren una vez por escala)
        if (!opcional(cfg[k], l => Array.isArray(l) && l.length <= LIMITE.escalas && l.every(esObjeto))) throw mal;
    }
    for (const k of ['correlaciones', 'diferenciasGrupo', 'modelos', 'niveles', 'paneles', 'estructuras']) {
        if (!opcional(cfg[k], l => Array.isArray(l))) throw mal;
    }
    if (!opcional(cfg.realismo, esObjeto) || !opcional(cfg.variablesPorTest, esObjeto)) throw mal;
    const escalaValida = (/** @type {Record<string, any>} */ p) => esTexto(p.nombre) && opcional(p.nombreCorto, esTexto) && opcional(p.prueba, esTexto)
        && opcional(p.sufijo, esTexto) && opcional(p.tipo, esTexto) && opcional(p.numItems, x => enteroEntre(x, 0, LIMITE.items))
        && opcional(p.invertidos, x => enteroEntre(x, 0, LIMITE.items)) && opcional(p.base, esObjeto);
    if (!(cfg.pruebas || []).every(escalaValida)) throw mal;
    if (!(cfg.sociodemograficos || []).every((/** @type {Record<string, any>} */ s) => esTexto(s.categoria) && opcional(s.niveles, l => listaDe(l, esObjeto)))) throw mal;
    if (!(cfg.concordancias || []).every((/** @type {Record<string, any>} */ c) => opcional(c.jueces, x => enteroEntre(x, 0, LIMITE.jueces)))) throw mal;
    if (!(cfg.gruposPruebas || []).every((/** @type {Record<string, any>} */ g) => opcional(g.escalas, Array.isArray))) throw mal;
    // lo que se repite al etiquetar, acotado por la base (cada uno de estos es, al menos, una columna suya)
    const pruebas = /** @type {Array<Record<string, any>>} */ (cfg.pruebas);
    const items = pruebas.reduce((s, p) => s + (p.tipo === 'general' ? 0 : (p.numItems || 0)), 0);
    const jueces = (cfg.concordancias || []).reduce((/** @type {number} */ s, /** @type {Record<string, any>} */ c) => s + (c.tipo === 'informante' ? 0 : (c.jueces || 2)), 0);
    const otras = ['cortes', 'desenlaces', 'histeresis'].reduce((s, k) => s + (cfg[k] || []).length, 0);
    if (pruebas.length > columnas || items > columnas || jueces > columnas || otras > columnas) throw mal;
    return cfg;
}

/**
 * El informe «pedido vs. obtenido»: filas con sus textos o números y su veredicto (sí, no o informativa).
 * @param {unknown} filas
 * @returns {any[]}
 */
function comprobarInforme(filas) {
    if (filas === undefined || filas === null) return [];
    const filaValida = (/** @type {any} */ f) => esObjeto(f) && esValor(f.tipo) && esValor(f.variable) && opcional(f.pedido, esValor) && opcional(f.obtenido, esValor)
        && (f.conImperfecciones === undefined || esValor(f.conImperfecciones)) && (f.ok === true || f.ok === false || f.ok === null || f.ok === undefined);
    if (!listaDe(filas, filaValida)) throw sinForma('el informe «pedido vs. obtenido» guardado');
    return /** @type {any[]} */ (filas);
}

/**
 * El diagnóstico de correlaciones: lo que pinta su aviso (los nombres, textos; las correlaciones, números).
 * @param {unknown} dg
 * @returns {Record<string, any> | null}
 */
function comprobarDiagnostico(dg) {
    if (dg === undefined || dg === null) return null;
    const mal = sinForma('el diagnóstico de correlaciones guardado');
    if (!esObjeto(dg)) throw mal;
    const num = (/** @type {unknown} */ x) => typeof x === 'number';
    const par = (/** @type {any} */ x) => esObjeto(x) && esTexto(x.a) && esTexto(x.b) && num(x.pedido);
    if (!opcional(dg.triadas, l => listaDe(l, t => esObjeto(t) && listaDe(t.variables, esTexto) && listaDe(t.correlaciones, num)))) throw mal;
    if (!opcional(dg.ajustes, l => listaDe(l, a => par(a) && num(a.ajustado)))) throw mal;
    if (!opcional(dg.limitadas, l => listaDe(l, a => par(a) && num(a.alcanzable)))) throw mal;
    if (!opcional(dg.calibracion, c => esObjeto(c) && typeof c.convergio === 'boolean' && num(c.error))) throw mal;
    return dg;
}

/**
 * Una copia sin funciones (ni en los objetos ni en las listas, donde quedan null), con las mismas referencias compartidas.
 * @param {unknown} v
 * @param {Map<object, unknown>} [vistos]
 * @returns {unknown}
 */
function sinFunciones(v, vistos = new Map()) {
    if (typeof v === 'function') return undefined;
    if (!v || typeof v !== 'object' || ArrayBuffer.isView(v) || v instanceof Date) return v;
    if (vistos.has(v)) return vistos.get(v);
    if (Array.isArray(v)) {
        /** @type {unknown[]} */
        const lista = [];
        vistos.set(v, lista);
        for (const x of v) lista.push(typeof x === 'function' ? null : sinFunciones(x, vistos));
        return lista;
    }
    if (v instanceof Map) {
        const mapa = new Map();
        vistos.set(v, mapa);
        for (const [k, x] of v) if (typeof x !== 'function') mapa.set(k, sinFunciones(x, vistos));
        return mapa;
    }
    if (v instanceof Set) {
        const conjunto = new Set();
        vistos.set(v, conjunto);
        for (const x of v) if (typeof x !== 'function') conjunto.add(sinFunciones(x, vistos));
        return conjunto;
    }
    /** @type {Record<string, unknown>} */
    const copia = {};
    vistos.set(v, copia);
    for (const [k, x] of Object.entries(v)) {
        if (typeof x === 'function') continue;
        // una clave «__proto__» (el nombre de un test), como propiedad propia
        Object.defineProperty(copia, k, { value: sinFunciones(x, vistos), enumerable: true, writable: true, configurable: true });
    }
    return copia;
}

/**
 * Lo que un proyecto guarda de la última generación: la configuración expandida con que se generó, el informe y los
 * diagnósticos, sin las funciones que la expansión pone en la configuración (la forma del total de las escalas de
 * acierto/error, censuradas o asimétricas con rango: formaTotal), que la generación vuelve a calcular y que nada usa
 * después. (Con ellas, el proyecto no se podía guardar si había una escala de esas.)
 * @param {{ configuracion?: unknown, diagnosticoCorrelaciones?: unknown, resumenImperfecciones?: unknown, diferenciasLimitadas?: unknown }} generador
 * @param {unknown[]} [informe]
 * @returns {Record<string, unknown>}
 */
export function generacionParaGuardar(generador, informe) {
    return /** @type {Record<string, unknown>} */ (sinFunciones({
        configuracion: generador.configuracion,
        informe: informe || [],
        diagnosticoCorrelaciones: diagnosticoParaGuardar(generador.diagnosticoCorrelaciones),
        resumenImperfecciones: generador.resumenImperfecciones ?? null,
        diferenciasLimitadas: generador.diferenciasLimitadas || []
    }));
}

/**
 * (2026.12.31, quinta revisión) El diagnóstico de correlaciones que se guarda: lo que pinta el aviso, sin la matriz R (de
 * m × m: con 3200 escalas, 10 millones de valores, y nada la usa al abrir) y con sus listas acotadas (una matriz imposible
 * de 120 variables tiene 280 840 tríadas: el proyecto no se podía volver a abrir).
 * @param {unknown} dg
 * @returns {unknown}
 */
function diagnosticoParaGuardar(dg) {
    if (!dg || typeof dg !== 'object') return dg ?? null;
    const { R, ...resto } = /** @type {Record<string, unknown>} */ (dg);
    /** @type {Record<string, unknown>} */
    const salida = { ...resto };
    for (const lista of ['triadas', 'ajustes', 'limitadas']) if (Array.isArray(salida[lista])) salida[lista] = /** @type {unknown[]} */ (salida[lista]).slice(0, MAXIMO_LISTA_DIAGNOSTICO);
    return salida;
}

/**
 * Lo que trae un proyecto de una generación, comprobado; un error con lo que no tiene la forma esperada.
 * @param {unknown} guardada lo que leyó deJsonFiel de «generacion.json»
 * @param {object} generador el generador de la página (generadorDatos): se ensaya sobre una copia, que hereda de él
 * @param {number} columnas las columnas de la base que la acompaña
 * @returns {{ configuracion: Record<string, any>, informe: any[], diagnosticoCorrelaciones: Record<string, any> | null, resumenImperfecciones: Record<string, any> | null, diferenciasLimitadas: any[] }}
 */
export function comprobarGeneracionGuardada(guardada, generador, columnas) {
    if (!esObjeto(guardada) || !acotado(guardada)) throw sinForma('la generación guardada');
    const configuracion = comprobarConfiguracion(guardada.configuracion, columnas);
    const informe = comprobarInforme(guardada.informe);
    const diagnosticoCorrelaciones = comprobarDiagnostico(guardada.diagnosticoCorrelaciones);
    if (!opcional(guardada.resumenImperfecciones, esObjeto)) throw sinForma('el resumen de las imperfecciones guardado');
    if (!opcional(guardada.diferenciasLimitadas, l => listaDe(l, esObjeto))) throw sinForma('la lista de diferencias por grupo limitadas guardada');
    // el ensayo: las etiquetas y la estructura, como las calculan la página y las descargas, sobre una copia del generador
    const copia = /** @type {any} */ (Object.create(generador));
    copia.configuracion = configuracion;
    try {
        copia.obtenerEtiquetas();
        copia.obtenerEstructuraEscalas();
    } catch (e) {
        throw sinForma('la configuración con que se generó la base');
    }
    return {
        configuracion, informe, diagnosticoCorrelaciones,
        resumenImperfecciones: guardada.resumenImperfecciones || null,
        diferenciasLimitadas: guardada.diferenciasLimitadas || []
    };
}

export { LIMITE as LIMITES_GENERACION_GUARDADA };
