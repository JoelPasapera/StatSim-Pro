// @ts-check
// tests/unit/ejemplos-hazlo.test.js — (2027.01.03) «Hazlo por mí» por partes: los planes (src/ejemplos/hazlo/planes.js:
// cada acción de un guion, con sus datos comprobados, y sus operaciones, con los selectores fijos: del guion solo llegan
// valores), las esperas y su juicio (condiciones.js), el conductor de la página (conductor.js) sobre un DOM pequeño (lo que
// hace con cada control y lo que dice cuando algo falta) y lo que ofrece y dice la guía (sesion.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearEntorno } from '../ui/minidom.js';
import {
    NOMBRES_DE_ACCIONES, OPCIONES_DE_LAS_LISTAS, PAPELES_DEL_SEM, accionEjecutable, accionValida, archivosDeLaAccion, descargasQueLleva, guionEjecutable, guionValido, loQueBorraOtroAnalisis,
    LIMITES_DE_LA_PAGINA, papelDelSEM, planDe, queBorraOtroAnalisis, queNoPuede, senalesDe, tieneCapitulo,
} from '../../src/ejemplos/hazlo/planes.js';
import { LO_QUE_TRAE_EL_PROYECTO, TARJETAS_DE_UNA_VEZ, loQueNoCumple } from '../../src/ejemplos/hazlo/reglas.js';
import { CONDICIONES, VEREDICTO, esCondicion } from '../../src/ejemplos/hazlo/condiciones.js';
import { Detenido, RITMO, ejecutarPlan, mostrarPlan } from '../../src/ejemplos/hazlo/conductor.js';
import {
    conGuiones, crearSesion, descargasTras, finConProblema, finDeMostrar, finDeTodo, finDelPaso, guionDe, listaDePasos, loDeDespues, loQueDejaDeMas, loQueDejaEn, loQueYaLlevan, pasosQueSeHacen, porDescarga,
    seHace, seMuestra, tarjetasQueLleva,
} from '../../src/ejemplos/hazlo/sesion.js';
/** (2027.01.04) La carpeta de los ejemplos (lo que llevan sus capítulos). */
const ejemplos = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'ejemplos');

/** @type {any} */ const G = globalThis;
const env = crearEntorno('<html><body><div id="toast"></div></body></html>');
Object.assign(RITMO, { hacer: 0, mostrar: 0, paciencia: 60, cadaCuanto: 5 });
/** Pone un HTML en la página de prueba. @param {string} html */
const pagina = html => { env.document.body.innerHTML = `<div id="toast"></div>${html}`; };
const q = (/** @type {string} */ sel) => env.document.querySelector(sel);

/** Unos datos válidos de cada acción. @type {Record<string, Record<string, any>>} */
const VALIDOS = {
    usarBaseDelSimulador: {},
    describirInvestigacion: { titulo: 'T', unidad: 'u', lugar: 'l' },
    analizar: { tipo: 'correlacion', variables: ['A', 'B', 'C'], regresion: { dependiente: 'B', predictores: ['A', 'C'], interaccion: true } },
    compararGrupos: { grupo: 'Grado', numerica: 'A', adicionales: ['B'] },
    ajustarSEM: { sintaxis: 'F =~ a + b + c', etiqueta: 'Modelo final', estimador: 'WLSMV' },
    calcularAFE: { conjunto: 'Escala total', correlacion: 'auto', factores: 'paralelo', rotacion: 'oblimin', replicas: 200, semilla: 2026 },
    calcularAiken: { minimo: 1, maximo: 4, confianza: 0.95, v0: 0.7, criterios: [{ nombre: 'Claridad', archivo: 'analizador/1-x/valoraciones_claridad.csv' }] },
    evaluarInvarianza: { sintaxis: 'F =~ a + b', grupo: 'Sexo', estimador: 'WLSMV', estricta: false, agrupar: true },
    exportarAnalisis: { word: false, carpeta: '2-comparacion' },
    guardarProyecto: {},
};
const OPS = ['ir', 'marcar', 'marcarSolo', 'poner', 'ponerOpcion', 'quitarTodos', 'limpiarAviso', 'pulsar', 'senalar', 'bloques', 'ponerEnBloque', 'subirEnBloque', 'esperar'];
const CAMPOS_DE_SELECTOR = ['selector', 'contenedor', 'bloques', 'agregar', 'quitar', 'boton', 'entrada'];

test('cada acción que conoce esta versión tiene su plan: operaciones conocidas, esperas con su condición, y lo de la persona solo se señala', () => {
    assert.deepEqual([...NOMBRES_DE_ACCIONES].sort(), Object.keys(VALIDOS).sort(), 'las pruebas cubren todas');
    for (const [accion, datos] of Object.entries(VALIDOS)) {
        const a = { accion, datos };
        assert.equal(accionValida(a), true, accion);
        const plan = planDe(a);
        assert.ok(plan.titulo && plan.ops.length > 0, accion);
        assert.equal(plan.ops[0].op, 'ir', `${accion}: primero, su sección`);
        for (const o of plan.ops) {
            assert.ok(OPS.includes(o.op), `${accion}: ${o.op}`);
            if (o.op === 'esperar') assert.ok(esCondicion(o.condicion) && o.ms > 0, `${accion}: ${o.condicion}`);
        }
        assert.equal(plan.ejecutable, accionEjecutable(a));
        if (!plan.ejecutable) assert.ok(plan.ops.every(o => o.op === 'ir' || o.op === 'senalar'), `${accion}: no hace nada, solo señala`);
    }
    assert.deepEqual(NOMBRES_DE_ACCIONES.filter(n => !accionEjecutable({ accion: n, datos: {} })), ['exportarAnalisis', 'guardarProyecto']);
    assert.equal(planDe({ accion: 'ajustarSEM', datos: VALIDOS.ajustarSEM }).titulo, 'El SEM «Modelo final»', 'dos modelos en un paso se distinguen');
    assert.equal(planDe({ accion: 'ajustarSEM', datos: { sintaxis: 'F =~ a' } }).titulo, 'El SEM «Modelo inicial»');
});

test('del guion solo llegan valores: los selectores son los del plan, aunque los datos traigan otra cosa', () => {
    const raro = '"], #btnBorrar, [x="';
    const datos = {
        analizar: { tipo: 'correlacion', variables: [raro, `${raro}2`, raro], regresion: { dependiente: raro, predictores: [raro, raro] } },   // ((2027.01.09) las dos primeras, distintas)
        compararGrupos: { grupo: raro, numerica: raro, covariable: raro, adicionales: [raro] },
        calcularAFE: { conjunto: raro, items: [raro] },
        calcularAiken: { minimo: 1, maximo: 4, criterios: [{ nombre: raro, archivo: 'a/b.csv' }] },
        evaluarInvarianza: { sintaxis: raro, grupo: raro },
        ajustarSEM: { sintaxis: raro, etiqueta: 'Modelo final' },   // (2027.01.07) su papel, solo uno de los de la página
    };
    for (const [accion, d] of Object.entries(datos)) {
        const plan = planDe({ accion, datos: d });
        for (const o of plan.ops) for (const k of CAMPOS_DE_SELECTOR) {
            const v = /** @type {Record<string, unknown>} */ (o)[k];
            if (typeof v === 'string') assert.ok(!v.includes('btnBorrar'), `${accion}: ${o.op}.${k} = ${v}`);
        }
    }
});

test('(2027.01.10, revisión) lo que la página no puede hacer de una acción con la forma debida (queNoPuede): la regla laPaginaLoHace lee el caso sin sus guiones', () => {
    const a = (/** @type {string} */ accion, /** @type {Record<string, any>} */ datos = {}) => ({ accion, datos });
    const an = (/** @type {Record<string, any>} */ d) => a('analizar', { tipo: 'correlacion', variables: ['A', 'B'], ...d });
    const L = LIMITES_DE_LA_PAGINA;
    assert.deepEqual({ ...L }, { variablesAdicionales: 6, predictoresAdicionales: 6, categoriasDeAiken: 21, itemsDelAFE: 3, nombreDeCriterio: 60 }, 'los de la página (ui/ejemplos-hazlo.test.js los compara con ella)');
    const cg = (/** @type {Record<string, any>} */ d) => a('compararGrupos', { grupo: 'Grado', numerica: 'A', ...d });
    const aiken = (/** @type {string} */ nombre) => a('calcularAiken', { ...VALIDOS.calcularAiken, criterios: [{ nombre, archivo: 'analizador/1-x/valoraciones_claridad.csv' }] });
    const no = /** @type {Array<[string, { accion: string, datos: Record<string, any> }, string]>} */ ([
        ['la misma variable dos veces', an({ variables: ['A', 'A'] }), 'la misma variable dos veces (A): la página no analiza («Las variables deben ser diferentes»)'],
        ['la misma dos veces, con otra', an({ variables: ['A', 'A', 'B'] }), 'la misma variable dos veces (A): la página no analiza («Las variables deben ser diferentes»)'],
        ['siete adicionales', an({ variables: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'] }), '7 variables adicionales: la página admite 6'],
        ['una regresión con una comparación', a('analizar', { tipo: 'comparacion', variables: ['A', 'G'], regresion: { dependiente: 'B', predictores: ['A'] } }), 'una regresión con una comparación de grupos: la página la hace solo con una correlación'],
        ['una regresión con una asociación', a('analizar', { tipo: 'asociacion', variables: ['G', 'H'], regresion: { dependiente: 'B', predictores: ['A'] } }), 'una regresión con una asociación (χ²): la página la hace solo con una correlación'],
        ['una regresión sin su Y', an({ regresion: { dependiente: '', predictores: ['A'] } }), 'una regresión sin su variable dependiente: la página no la hace'],
        ['la Y entre los predictores', an({ regresion: { dependiente: 'B', predictores: ['A', 'B'] } }), 'una regresión con su variable dependiente (B) entre los predictores: la página no la hace («Y no puede estar entre los predictores»)'],
        ['un predictor repetido', an({ regresion: { dependiente: 'B', predictores: ['A', 'C', 'A'] } }), 'una regresión con un predictor repetido: la página no la estima'],
        ['ocho predictores', an({ regresion: { dependiente: 'Y', predictores: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] } }), 'una regresión con 8 predictores: la página admite 7'],
        ['la interacción con un predictor', an({ regresion: { dependiente: 'B', predictores: ['A'], interaccion: true } }), 'la interacción de una regresión con un solo predictor: la página la ofrece desde dos'],
        ['una escala con decimales', a('calcularAiken', { ...VALIDOS.calcularAiken, minimo: 1.5 }), 'una escala de 1.5 a 4: la página la quiere de números enteros'],
        ['una escala sin recorrido', a('calcularAiken', { ...VALIDOS.calcularAiken, minimo: 4, maximo: 4 }), 'una escala de 4 a 4: la página quiere el máximo mayor que el mínimo'],
        ['veintidós categorías', a('calcularAiken', { ...VALIDOS.calcularAiken, minimo: 0, maximo: 21 }), 'una escala de 22 categorías: la página admite 21'],
        ['un AFE de dos ítems (uno repetido)', a('calcularAFE', { items: ['P1', 'P2', 'P1'] }), 'un AFE de 2 ítems: la página lo hace desde 3'],
        ['un AFE de un ítem', a('calcularAFE', { items: ['P1'] }), 'un AFE de 1 ítem: la página lo hace desde 3'],
        ['un ítem con un espacio', a('calcularAFE', { items: ['P1', 'P 2', 'P3'] }), 'un AFE con el ítem «P 2»: su campo separa los ítems por comas, puntos y comas o espacios'],
        ['un ítem con una coma', a('calcularAFE', { items: ['P1', 'P2,P3', 'P4'] }), 'un AFE con el ítem «P2,P3»: su campo separa los ítems por comas, puntos y comas o espacios'],
        ['un SEM sin modelo', a('ajustarSEM', { sintaxis: ' \n ' }), 'un SEM sin su modelo (la sintaxis vacía): la página no lo ajusta'],
        ['la invarianza sin modelo', a('evaluarInvarianza', { sintaxis: ' ', grupo: 'G' }), 'la invarianza sin su modelo (ni su sintaxis ni el de la sección SEM): la página no la evalúa'],
        ['la invarianza sin nada', a('evaluarInvarianza', { grupo: 'G' }), 'la invarianza sin su modelo (ni su sintaxis ni el de la sección SEM): la página no la evalúa'],
        ['la estricta con WLSMV', a('evaluarInvarianza', { ...VALIDOS.evaluarInvarianza, estricta: true }), 'la invarianza estricta con WLSMV: la página la ofrece solo con ML'],
        ['agrupar con ML', a('evaluarInvarianza', { sintaxis: 'F =~ a + b', grupo: 'G', agrupar: false }), 'agrupar las categorías sin respuestas con ML: la página lo ofrece solo con WLSMV'],
        ['agrupar con ML, aunque sea sí', a('evaluarInvarianza', { sintaxis: 'F =~ a + b', grupo: 'G', estimador: 'ML', agrupar: true }), 'agrupar las categorías sin respuestas con ML: la página lo ofrece solo con WLSMV'],
        // (2027.01.11, revisión) lo que halló la revisión de la 2027.01.10: lo que la página no usa, o hace de otro modo
        ['una adicional con una comparación', a('analizar', { tipo: 'comparacion', variables: ['A', 'G', 'C'] }), 'una variable adicional con una comparación de grupos: la página solo las usa en una correlación'],
        ['dos adicionales con una asociación', a('analizar', { tipo: 'asociacion', variables: ['G', 'H', 'A', 'G'] }), '2 variables adicionales con una asociación (χ²): la página solo las usa en una correlación'],
        ['la unilateral con una comparación', a('analizar', { tipo: 'comparacion', variables: ['A', 'G'], prueba: 'unilateral' }), 'una prueba unilateral con una comparación de grupos: la página la hace solo en la correlación de dos variables'],
        ['la unilateral con una asociación', a('analizar', { tipo: 'asociacion', variables: ['G', 'H'], prueba: 'unilateral' }), 'una prueba unilateral con una asociación (χ²): la página la hace solo en la correlación de dos variables'],
        ['la unilateral con una matriz', an({ variables: ['A', 'B', 'C'], prueba: 'unilateral' }), 'una prueba unilateral con una matriz de correlaciones: la página la hace solo en la correlación de dos variables'],
        ['Poisson con la interacción', an({ regresion: { dependiente: 'Y', predictores: ['A', 'B'], interaccion: true, poisson: true } }), 'una regresión de Poisson con la interacción: la página la ajusta solo con los efectos principales'],
        ['Poisson con el cuadrático', an({ regresion: { dependiente: 'Y', predictores: ['A'], cuadratico: true, poisson: true } }), 'una regresión de Poisson con el término cuadrático: la página la ajusta solo con los efectos principales'],
        ['Poisson con los dos', an({ regresion: { dependiente: 'Y', predictores: ['A', 'B'], interaccion: true, cuadratico: true, poisson: true } }), 'una regresión de Poisson con la interacción y el término cuadrático: la página la ajusta solo con los efectos principales'],
        ['la agrupación como numérica', cg({ numerica: 'Grado' }), 'una comparación entre grupos con la misma variable (Grado) como agrupación y como numérica: la página no la hace (la agrupación es de texto, y la numérica, de números)'],
        ['la agrupación como covariable', cg({ covariable: 'Grado' }), 'una comparación entre grupos con su agrupación (Grado) como covariable: la página no la hace (la agrupación es de texto, y la covariable, de números)'],
        ['la agrupación entre las adicionales', cg({ adicionales: ['B', 'Grado'] }), 'una comparación entre grupos con su agrupación (Grado) entre las variables adicionales: la página no la hace (la agrupación es de texto, y las adicionales, de números)'],
        ['la numérica como covariable', cg({ covariable: 'A' }), 'una ANCOVA con la variable numérica (A) como covariable: la página no la hace («la covariable no puede ser la misma variable numérica que comparas»)'],
        ['la numérica entre las adicionales', cg({ adicionales: ['A', 'B'] }), 'una MANOVA con la variable numérica (A) entre las adicionales: la página la quita de ellas'],
        ['una adicional repetida', cg({ adicionales: ['B', 'C', 'B'] }), 'una MANOVA con una variable adicional repetida: la página la usa una vez'],
        ['un criterio de 61 letras', aiken('x'.repeat(61)), 'un criterio de la V de Aiken con un nombre de 61 caracteres («xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx…»): su campo admite 60'],
        // (2027.01.12, revisión) sin la agrupación o sin la numérica, ese es el motivo (no «su agrupación () como covariable»)
        ['sin la agrupación', cg({ grupo: '' }), 'una comparación entre grupos sin su variable de agrupación: la página no la hace («Selecciona ambas variables»)'],
        ['sin la numérica', cg({ numerica: '' }), 'una comparación entre grupos sin su variable numérica: la página no la hace («Selecciona ambas variables»)'],
    ]);
    for (const [que, accion, motivo] of no) {
        assert.equal(accionValida(accion), true, `${que}: con la forma debida (hasta la 2027.01.09, la misma variable dos veces no: el catálogo entero no se leía)`);
        assert.equal(queNoPuede(accion), motivo, que);
    }
    // las que sí puede: en el límite, y las de cada acción
    const si = [an({ variables: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] }), an({ variables: ['A', 'B', 'A'] }), an({ regresion: { dependiente: 'Y', predictores: ['A', 'B', 'C', 'D', 'E', 'F', 'G'], interaccion: true } }),
        an({ regresion: { dependiente: 'Y', predictores: ['A'], cuadratico: true } }), a('calcularAiken', { ...VALIDOS.calcularAiken, minimo: 0, maximo: 20 }),
        a('calcularAFE', { items: ['P1', 'P2', 'P3'] }), a('calcularAFE', {}), a('evaluarInvarianza', { ...VALIDOS.evaluarInvarianza, agrupar: false }),
        a('evaluarInvarianza', { grupo: 'G', delSEM: true, estricta: true }), an({ prueba: 'unilateral' }), an({ variables: ['A', 'B', 'B'], prueba: 'unilateral' }),
        a('analizar', { tipo: 'comparacion', variables: ['A', 'G'], prueba: 'bilateral' }), an({ regresion: { dependiente: 'Y', predictores: ['A', 'B'], poisson: true } }),
        cg({ covariable: 'C', adicionales: ['C', 'D'] }), aiken('x'.repeat(60)), ...Object.entries(VALIDOS).map(([k, d]) => a(k, d))];
    for (const accion of si) assert.equal(queNoPuede(accion), '', JSON.stringify(accion));
    // la regla: el caso, sin sus guiones (catalogo.js), con lo que dice; los de ejemplos/ la cumplen (ejemplos-catalogo.test.js)
    const base = [a('usarBaseDelSimulador')], guardar = [a('guardarProyecto')];
    const caso = (/** @type {any[][]} */ guiones) => /** @type {any} */ ({ pasos: guiones.map((_, i) => `p${i + 1}`), repetir: { desde: 2, hasta: guiones.length - 1, nota: '' }, guiones });
    assert.deepEqual(loQueNoCumple(caso([base, [an({ variables: ['A', 'A'] }), a('exportarAnalisis', { word: false })], guardar])).map(m => `${m.paso}:${m.regla}: ${m.texto}`),
        ['2:laPaginaLoHace: el paso 2 pide la misma variable dos veces (A): la página no analiza («Las variables deben ser diferentes»)']);
    assert.deepEqual(loQueNoCumple(caso([base, [an({}), a('calcularAFE', { items: ['P1'] }), a('evaluarInvarianza', { grupo: 'G' })], guardar])).map(m => m.regla), ['laPaginaLoHace', 'laPaginaLoHace'], 'una por acción');
});

test('los datos de una acción se comprueban: claves de más, tipos o valores que no son, rutas fuera del caso', () => {
    const malos = {
        'una acción que no existe': { accion: 'borrarTodo', datos: {} },
        'sin datos': { accion: 'analizar' },
        'con algo más que acción y datos': { accion: 'guardarProyecto', datos: {}, selector: '#x' },
        'datos con una clave de más': { accion: 'analizar', datos: { ...VALIDOS.analizar, selector: '#x' } },
        'otro tipo de análisis': { accion: 'analizar', datos: { tipo: 'borrar', variables: ['A', 'B'] } },
        'sin tipo de análisis': { accion: 'analizar', datos: { variables: ['A', 'B'] } },
        'una sola variable': { accion: 'analizar', datos: { tipo: 'correlacion', variables: ['A'] } },
        'una variable vacía': { accion: 'analizar', datos: { tipo: 'correlacion', variables: ['A', ''] } },
        'otra prueba': { accion: 'analizar', datos: { tipo: 'correlacion', variables: ['A', 'B'], prueba: 'triple' } },
        'una regresión con claves de más': { accion: 'analizar', datos: { tipo: 'correlacion', variables: ['A', 'B'], regresion: { dependiente: 'B', predictores: ['A'], x: 1 } } },
        'una regresión sin predictores': { accion: 'analizar', datos: { tipo: 'correlacion', variables: ['A', 'B'], regresion: { dependiente: 'B', predictores: [] } } },
        'otro estimador': { accion: 'ajustarSEM', datos: { sintaxis: 'F =~ a', estimador: 'GLS' } },
        'una sintaxis que no es texto': { accion: 'ajustarSEM', datos: { sintaxis: 42 } },
        // (2027.01.07, revisión) solo las opciones de la página: con otra, «Hazlo por mí» no podría elegirla
        'otro papel del SEM': { accion: 'ajustarSEM', datos: { sintaxis: 'F =~ a', etiqueta: 'Modelo de prueba' } },
        'un papel que no es texto': { accion: 'ajustarSEM', datos: { sintaxis: 'F =~ a', etiqueta: 1 } },
        'réplicas con decimales': { accion: 'calcularAFE', datos: { replicas: 1.5 } },
        'réplicas que la página no ofrece': { accion: 'calcularAFE', datos: { replicas: 300 } },
        'réplicas en texto': { accion: 'calcularAFE', datos: { replicas: '200' } },
        'otra correlación del AFE': { accion: 'calcularAFE', datos: { correlacion: 'spearman' } },
        'nueve factores': { accion: 'calcularAFE', datos: { factores: '9' } },
        'los factores en número': { accion: 'calcularAFE', datos: { factores: 3 } },
        'otra rotación': { accion: 'calcularAFE', datos: { rotacion: 'quartimax' } },
        'la semilla 0 (la tarjeta usaría 2026)': { accion: 'calcularAFE', datos: { semilla: 0 } },
        'otra confianza de la V de Aiken': { accion: 'calcularAiken', datos: { ...VALIDOS.calcularAiken, confianza: 0.8 } },
        'otro criterio V₀': { accion: 'calcularAiken', datos: { ...VALIDOS.calcularAiken, v0: 0.6 } },
        'la confianza en texto': { accion: 'calcularAiken', datos: { ...VALIDOS.calcularAiken, confianza: '0.95' } },
        'otro estimador de la invarianza': { accion: 'evaluarInvarianza', datos: { ...VALIDOS.evaluarInvarianza, estimador: 'MLR' } },
        'un tipo de análisis heredado': { accion: 'analizar', datos: { tipo: 'constructor', variables: ['A', 'B'] } },
        'una escala que no es número': { accion: 'calcularAiken', datos: { ...VALIDOS.calcularAiken, minimo: '1' } },
        'sin criterios': { accion: 'calcularAiken', datos: { ...VALIDOS.calcularAiken, criterios: [] } },
        'un archivo fuera del caso': { accion: 'calcularAiken', datos: { ...VALIDOS.calcularAiken, criterios: [{ nombre: 'C', archivo: '../02-otro/x.csv' }] } },
        'un archivo con dirección': { accion: 'calcularAiken', datos: { ...VALIDOS.calcularAiken, criterios: [{ nombre: 'C', archivo: 'https://x/y.csv' }] } },
        'la carpeta de una descarga con «/»': { accion: 'exportarAnalisis', datos: { carpeta: 'analizador/1-x' } },
        'guardar con datos': { accion: 'guardarProyecto', datos: { x: 1 } },
    };
    for (const [que, a] of Object.entries(malos)) {
        assert.equal(accionValida(a), false, que);
        assert.throws(() => planDe(/** @type {any} */ (a)), /Paso de guion no válido/, que);
    }
    // (2027.01.07) las que sí ofrece la página
    const buenos = [
        { accion: 'ajustarSEM', datos: { sintaxis: 'F =~ a' } }, ...PAPELES_DEL_SEM.map(etiqueta => ({ accion: 'ajustarSEM', datos: { sintaxis: 'F =~ a', etiqueta } })),
        ...[100, 200, 500].map(replicas => ({ accion: 'calcularAFE', datos: { replicas } })),
        { accion: 'calcularAFE', datos: { factores: '8', correlacion: 'policorica', rotacion: 'ninguna', semilla: 1 } },
        ...[0.9, 0.95, 0.975, 0.99, 0.999].map(confianza => ({ accion: 'calcularAiken', datos: { ...VALIDOS.calcularAiken, confianza, v0: 0.5 } })),
        { accion: 'evaluarInvarianza', datos: { ...VALIDOS.evaluarInvarianza, estimador: 'ML' } },
        { accion: 'analizar', datos: { tipo: 'asociacion', variables: ['A', 'B'], prueba: 'unilateral' } },
    ];
    for (const a of buenos) assert.equal(accionValida(a), true, JSON.stringify(a.datos));
    assert.deepEqual(OPCIONES_DE_LAS_LISTAS['#semEtiqueta'], PAPELES_DEL_SEM);
    assert.equal(papelDelSEM({}), 'Modelo inicial', 'sin papel, el que la tarjeta trae elegido');
    assert.equal(papelDelSEM({ etiqueta: 'Modelo final' }), 'Modelo final');
    assert.equal(guionValido([{ accion: 'usarBaseDelSimulador', datos: {} }]), true);
    assert.equal(guionValido([]), true, 'un paso sin guion');
    assert.equal(guionValido(Array(21).fill({ accion: 'usarBaseDelSimulador', datos: {} })), false, 'más de 20 acciones');
    assert.equal(guionValido({ 0: { accion: 'usarBaseDelSimulador', datos: {} } }), false);
    assert.equal(guionValido([{ accion: 'borrarTodo', datos: {} }]), false);
});

test('lo que sube una acción, lo que se señala de su plan y si «Hazlo por mí» la hace', () => {
    assert.deepEqual(archivosDeLaAccion({ accion: 'calcularAiken', datos: VALIDOS.calcularAiken }), ['analizador/1-x/valoraciones_claridad.csv']);
    assert.deepEqual(archivosDeLaAccion({ accion: 'analizar', datos: VALIDOS.analizar }), []);
    const exportar = senalesDe(planDe({ accion: 'exportarAnalisis', datos: { word: true } }).ops);
    assert.deepEqual(exportar.map(o => o.op === 'senalar' ? o.selector : o.op), ['ir', '#btnExportarWord', '#btnDescargarResultados', '#btnImprimirAnalizador']);
    assert.deepEqual(senalesDe(planDe({ accion: 'exportarAnalisis', datos: { word: false } }).ops).map(o => o.op === 'senalar' ? o.selector : o.op), ['ir', '#btnDescargarResultados', '#btnImprimirAnalizador'], 'sin Word, no se señala');
    assert.deepEqual(senalesDe(planDe({ accion: 'calcularAiken', datos: VALIDOS.calcularAiken }).ops).map(o => o.op === 'senalar' ? o.selector : o.op), ['ir', '#aikenCSV', '#aikenWord']);
    assert.deepEqual(senalesDe(planDe({ accion: 'analizar', datos: VALIDOS.analizar }).ops), [], 'un análisis sin descargas propias');
    assert.equal(guionEjecutable([{ accion: 'exportarAnalisis', datos: {} }, { accion: 'guardarProyecto', datos: {} }]), false);
    assert.equal(guionEjecutable([{ accion: 'analizar', datos: VALIDOS.analizar }, { accion: 'exportarAnalisis', datos: {} }]), true);
    // los predictores y las variables adicionales, con sus botones de agregar; y las opciones de la regresión, solo si se ven
    const ops = planDe({ accion: 'analizar', datos: VALIDOS.analizar }).ops;
    assert.equal(ops.filter(o => o.op === 'pulsar' && o.selector === '#btnAgregarVariable').length, 1);
    assert.equal(ops.filter(o => o.op === 'pulsar' && o.selector === '#btnAgregarPredictor').length, 1);
    assert.deepEqual(ops.filter(o => o.op === 'marcar' && o.siVisible).map(o => o.op === 'marcar' && [o.selector, o.valor]), [['#regInter', true], ['#regCuad', false], ['#regPoisson', false]]);
    // (revisión) cada tarjeta vacía sus resultados al pulsar su botón: los de antes no cuentan como los de ahora
    for (const [accion, zona, boton] of [['calcularAFE', '#afeResultados', '#afeCalcular'], ['calcularAiken', '#aikenResultados', '#aikenCalcular'], ['evaluarInvarianza', '#invResultados', '#invCalcular'], ['compararGrupos', '#cgResultado', '#cgAnalizar'], ['ajustarSEM', '#semOut', '#semAjustar']]) {
        const o = planDe({ accion, datos: VALIDOS[accion] }).ops;
        assert.ok(o.some(x => x.op === 'pulsar' && x.selector === boton && x.vaciar === zona), `${accion}: vacía ${zona} al pulsar ${boton}`);
    }
    // las que calculan en segundo plano esperan a que su botón vuelva a estar libre (también si se cancela)
    for (const [accion, boton] of [['calcularAFE', 'afeCalcular'], ['evaluarInvarianza', 'invCalcular']]) {
        assert.ok(planDe({ accion, datos: VALIDOS[accion] }).ops.some(x => x.op === 'esperar' && x.condicion === 'calculado' && x.arg[2] === boton), accion);
    }
    // antes de cada archivo de la V de Aiken, el aviso de antes, fuera (se espera el de ese archivo)
    const aiken = planDe({ accion: 'calcularAiken', datos: VALIDOS.calcularAiken }).ops;
    aiken.forEach((x, k) => { if (x.op === 'subirEnBloque') assert.equal(aiken[k - 1].op, 'limpiarAviso', 'antes de subir, el aviso de antes, fuera'); });
    // las variables adicionales de la comparación: exactamente las del caso; la invarianza, con su agrupación
    assert.deepEqual(planDe({ accion: 'compararGrupos', datos: VALIDOS.compararGrupos }).ops.filter(o => o.op === 'marcarSolo').map(o => o.op === 'marcarSolo' && [o.contenedor, o.valores]), [['#cgDVs', ['B']]]);
    assert.deepEqual(planDe({ accion: 'compararGrupos', datos: { grupo: 'G', numerica: 'A' } }).ops.filter(o => o.op === 'marcarSolo').map(o => o.op === 'marcarSolo' && o.valores), [[]], 'sin adicionales: ninguna marcada');
    assert.ok(planDe({ accion: 'evaluarInvarianza', datos: VALIDOS.evaluarInvarianza }).ops.some(o => o.op === 'marcar' && o.selector === '#invAgrupar' && o.valor === true));
    assert.ok(!planDe({ accion: 'evaluarInvarianza', datos: { grupo: 'G' } }).ops.some(o => o.op === 'marcar' && o.selector === '#invAgrupar'), 'sin decirlo, no se toca');
    assert.equal(planDe({ accion: 'calcularAiken', datos: VALIDOS.calcularAiken }).ops.find(o => o.op === 'bloques')?.nombre, 'Criterios en total: uno');
    assert.equal(planDe({ accion: 'calcularAiken', datos: { ...VALIDOS.calcularAiken, criterios: [1, 2, 3].map(k => ({ nombre: `C${k}`, archivo: `c${k}.csv` })) } }).ops.find(o => o.op === 'bloques')?.nombre,
        'Criterios en total: 3', '(revisión) un total, no «3 criterios» junto a «+ Agregar criterio»');
});

test('las esperas miran la página y su juicio dice si salió bien y lo que dijo', () => {
    pagina(`<p id="vacio"> </p><p id="lleno">hola</p><button id="b1" disabled></button><button id="b2"></button>
        <pre id="semOut">Estimando…</pre><div id="res" hidden>x</div><div id="men"></div><p id="analisisN">120</p>`);
    q('#toast').textContent = 'Análisis completado';
    assert.equal(CONDICIONES.aviso(['completado', '']), true);
    assert.equal(CONDICIONES.aviso(['Error', '']), false);
    q('#toast').textContent = 'La variable no tiene al menos 2 grupos distintos.';
    q('#toast').className = 'toast error show';
    assert.equal(CONDICIONES.aviso(['completado', '']), true, 'un aviso de error también termina la espera');
    assert.deepEqual(VEREDICTO({ condicion: 'aviso', arg: [], exito: ['completado', ''] }), { dicho: 'La variable no tiene al menos 2 grupos distintos.', error: 'la página respondió «La variable no tiene al menos 2 grupos distintos.»' });
    q('#toast').className = 'toast success show';
    q('#toast').textContent = 'Análisis completado';
    assert.equal(CONDICIONES.conTexto('vacio'), false);
    assert.equal(CONDICIONES.conTexto('lleno'), true);
    assert.equal(CONDICIONES.conTexto('noExiste'), false);
    assert.equal(CONDICIONES.habilitado('b1'), false);
    assert.equal(CONDICIONES.habilitado('b2'), true);
    assert.equal(CONDICIONES.semListo(null), false, 'aún estimando');
    q('#semOut').textContent = 'Modelo: 12 parámetros estimados';
    assert.equal(CONDICIONES.semListo(null), true);
    assert.equal(CONDICIONES.resultados(['res', 'men']), false, 'ocultos');
    q('#men').innerHTML = '<div class="aiken-errores"><strong>No se puede calcular:</strong><ul><li>Elige al menos 3 ítems.</li></ul></div>';
    assert.equal(CONDICIONES.resultados(['res', 'men']), true, 'o el recuadro de errores en sus mensajes');
    assert.deepEqual(VEREDICTO({ condicion: 'resultados', arg: ['res', 'men'], fallo: 'resultados' }), { dicho: '', error: 'No se puede calcular: Elige al menos 3 ítems.' });
    q('#men').textContent = 'No se pudo calcular';
    assert.equal(CONDICIONES.resultados(['res', 'men']), true, 'o un error en sus palabras');
    assert.deepEqual(VEREDICTO({ condicion: 'resultados', arg: ['res', 'men'], fallo: 'resultados' }), { dicho: '', error: 'No se pudo calcular' });
    // (revisión) los mensajes de una tarjeta, legibles («título uno; otro») y acotados
    q('#men').innerHTML = `<div class="aiken-errores"><strong>Corrige antes de calcular:</strong><ul>${Array.from({ length: 40 }, (_, k) => `<li>«Claridad»: fila ${k + 2}, columna 6: no es un número.</li>`).join('')}</ul></div>`;
    const largo = VEREDICTO({ condicion: 'resultados', arg: ['res', 'men'], fallo: 'resultados' }).error;
    assert.ok(largo.startsWith('Corrige antes de calcular: «Claridad»: fila 2, columna 6: no es un número.; «Claridad»: fila 3') && largo.length === 300 && largo.endsWith('…'), largo);
    // (revisión) una tarjeta que calcula en segundo plano terminó cuando su botón vuelve a estar libre: con resultados, un error o «Cálculo cancelado»
    pagina('<button id="calc" disabled>Calcular</button><div id="r"></div><div id="m"></div>');
    assert.equal(CONDICIONES.calculado(['r', 'm', 'calc']), false, 'calculando');
    q('#m').innerHTML = '<div class="aiken-avisos"><strong>Ten en cuenta:</strong><ul><li>Cálculo cancelado.</li></ul></div>';
    assert.equal(CONDICIONES.calculado(['r', 'm', 'calc']), false, 'aún con el botón ocupado');
    q('#calc').disabled = false;
    assert.equal(CONDICIONES.calculado(['r', 'm', 'calc']), true, 'cancelado: terminó');
    assert.deepEqual(VEREDICTO({ condicion: 'calculado', arg: ['r', 'm', 'calc'], fallo: 'resultados' }), { dicho: '', error: 'Ten en cuenta: Cálculo cancelado.' });
    q('#m').innerHTML = '';
    q('#r').textContent = 'Cargas factoriales';
    assert.equal(CONDICIONES.calculado(['r', 'm', 'calc']), true);
    assert.deepEqual(VEREDICTO({ condicion: 'calculado', arg: ['r', 'm', 'calc'], fallo: 'resultados' }), { dicho: 'Cargas factoriales', error: '' });
    pagina('<div id="res">x</div><div id="men"></div>');
    // «Comparar grupos»: su resultado, o el aviso de su tarjeta
    pagina('<div id="cgResultado"></div><div id="cgEstado"></div>');
    assert.equal(CONDICIONES.conTextoOAviso(['cgResultado', 'cgEstado']), false);
    q('#cgEstado').textContent = '⚠️ La variable de agrupación tiene demasiados grupos.';
    assert.equal(CONDICIONES.conTextoOAviso(['cgResultado', 'cgEstado']), true);
    assert.deepEqual(VEREDICTO({ condicion: 'conTextoOAviso', arg: ['cgResultado', 'cgEstado'], fallo: 'estado' }), { dicho: '', error: 'La variable de agrupación tiene demasiados grupos.' });
    q('#cgResultado').textContent = 'Descriptivos por grupo';
    assert.deepEqual(VEREDICTO({ condicion: 'conTextoOAviso', arg: ['cgResultado', 'cgEstado'], fallo: 'estado' }), { dicho: 'Descriptivos por grupo', error: '' });
    pagina(`<p id="vacio"> </p><p id="lleno">hola</p><pre id="semOut">Modelo: 12 parámetros estimados</pre><div id="res">x</div><div id="men"></div><p id="analisisN">120</p>`);
    q('#toast').textContent = 'Análisis completado';
    assert.deepEqual(VEREDICTO({ condicion: 'resultados', arg: ['res', 'men'], fallo: 'resultados' }), { dicho: 'x', error: '' });
    assert.equal(CONDICIONES.sinPendientes(null), true);
    q('#lleno').textContent = 'Esperando los coeficientes ordinales…';
    assert.equal(CONDICIONES.sinPendientes(null), false);
    G.generadorDatos = { datosGenerados: { n: 120 } };
    assert.equal(CONDICIONES.conLaBaseDelSimulador(null), true);
    G.generadorDatos = { datosGenerados: { n: 99 } };
    assert.equal(CONDICIONES.conLaBaseDelSimulador(null), false);
    // el juicio
    assert.deepEqual(VEREDICTO({ condicion: 'aviso', arg: [], exito: ['Análisis completado', ''] }), { dicho: 'Análisis completado', error: '' });
    q('#toast').textContent = 'Error: selecciona dos variables';
    assert.deepEqual(VEREDICTO({ condicion: 'aviso', arg: [], exito: ['Análisis completado', ''] }), { dicho: 'Error: selecciona dos variables', error: 'la página respondió «Error: selecciona dos variables»' });
    q('#semOut').textContent = '⚠️ El modelo no converge';
    assert.match(VEREDICTO({ condicion: 'semListo', arg: null, fallo: 'sem' }).error, /^el SEM no se ajustó: ⚠️ El modelo no converge/);
    q('#semOut').textContent = '⚠️ Aviso: 12 parámetros estimados';
    assert.equal(VEREDICTO({ condicion: 'semListo', arg: null, fallo: 'sem' }).error, '', 'un aviso con el modelo estimado no es un fallo');
    assert.deepEqual(VEREDICTO({ condicion: 'conTexto', arg: 'lleno' }), { dicho: 'Esperando los coeficientes ordinales…', error: '' });
    assert.equal(esCondicion('aviso'), true);
    assert.equal(esCondicion('toString'), false, 'solo las suyas');
});

test('el conductor usa cada control como una persona y avisa a la página (input y change)', async () => {
    pagina(`<select id="s"><option value="">—</option><option value="A">Ansiedad (A)</option></select><input id="t">
        <label><input type="checkbox" id="c"> Casilla</label><input type="checkbox" id="d" checked disabled><input id="corto" maxlength="5">
        <div id="grupo"><label><input type="checkbox" value="X" checked> X</label><label><input type="checkbox" value="Y"> Y</label></div>
        <button id="b">Pulsar</button><div id="v">algo</div>
        <div id="extras"><div class="w"><button aria-label="Quitar">✕</button></div><div class="w"><button aria-label="Quitar">✕</button></div></div>`);
    env.document.querySelectorAll('#extras button').forEach((/** @type {any} */ b) => b.addEventListener('click', () => b.closest('.w').remove()));
    /** @type {string[]} */ const eventos = [];
    for (const id of ['s', 't', 'c']) for (const tipo of ['input', 'change']) q('#' + id).addEventListener(tipo, () => eventos.push(`${id}:${tipo}`));
    let pulsado = 0;
    q('#b').addEventListener('click', () => { pulsado++; });
    /** @type {string[]} */ const dicho = [];
    await ejecutarPlan([
        { op: 'poner', selector: '#s', valor: 'A', nombre: 'Variable: A' },
        { op: 'poner', selector: '#t', valor: 'hola', nombre: 'Texto' },
        { op: 'marcar', selector: '#c', valor: true, nombre: 'Con la casilla' },
        { op: 'marcar', selector: '#d', valor: true, nombre: 'Ya marcada (y desactivada): no se toca' },
        { op: 'marcarSolo', contenedor: '#grupo', valores: ['Y'], nombre: 'Solo Y' },
        { op: 'poner', selector: '#corto', valor: 'Claridad', nombre: 'Largo máximo' },
        { op: 'quitarTodos', selector: '#extras button[aria-label="Quitar"]', nombre: 'Sin las de antes' },
        { op: 'quitarTodos', selector: '#extras button[aria-label="Quitar"]', nombre: 'Ya no hay: nada' },
        { op: 'pulsar', selector: '#b', vaciar: '#v', nombre: '«Pulsar»' },
        { op: 'senalar', selector: '#b', nombre: 'esto es tuyo' },
    ], { alAvanzar: t => dicho.push(t) });
    assert.equal(q('#s').value, 'A');
    assert.equal(q('#t').value, 'hola');
    assert.equal(q('#c').checked, true);
    assert.equal(q('#grupo input[value="Y"]').checked, true);
    assert.equal(q('#grupo input[value="X"]').checked, false, 'la que estaba marcada y no se pide, desmarcada');
    assert.equal(q('#corto').value, 'Clari', 'hasta su largo máximo, como al escribir');
    assert.equal(q('#v').innerHTML, '', 'su zona de resultados, vaciada al pulsar');
    assert.equal(env.document.querySelectorAll('#extras .w').length, 0, 'las de antes, quitadas con su «✕»');
    assert.equal(pulsado, 1, 'lo de la persona («senalar») no se pulsa');
    assert.deepEqual(eventos, ['s:input', 's:change', 't:input', 't:change', 'c:input', 'c:change']);
    assert.deepEqual(dicho, ['Variable: Ansiedad (A)', 'Texto', 'Con la casilla', 'Ya marcada (y desactivada): no se toca', 'Solo Y', 'Solo Y', 'Solo Y', 'Largo máximo', 'Sin las de antes', 'Sin las de antes', '«Pulsar»'], 'de una lista, el texto de su opción en lugar del valor');
    assert.equal(env.document.querySelectorAll('.guia-resaltado').length, 0, 'sin nada resaltado al terminar');
});

test('el conductor dice qué falta: un control que no está, que no se ve, desactivado, una opción, una espera que no llega', async () => {
    pagina('<select id="s"><option value="A">A</option></select><button id="oculto" hidden>x</button><button id="off" disabled>x</button><div id="sitio"></div>');
    /** @param {any[]} ops @param {RegExp} re */
    const falla = (ops, re) => assert.rejects(ejecutarPlan(ops), re);
    await falla([{ op: 'pulsar', selector: '#noEsta', nombre: '«Calcular»' }], /^Error: «Calcular»: no está en la página$/);
    await falla([{ op: 'pulsar', selector: '#oculto', nombre: '«Calcular»' }], /«Calcular»: está en la página, pero no a la vista/);
    await falla([{ op: 'pulsar', selector: '#off', nombre: '«Calcular»' }], /«Calcular»: está desactivado/);
    await falla([{ op: 'poner', selector: '#s', valor: 'Z', nombre: 'Variable 1: Z' }], /Variable 1: Z: la lista no tiene esa opción \(«Z»\)/);
    await falla([{ op: 'esperar', condicion: 'conTexto', arg: 'sitio', ms: 30, nombre: 'Esperando el análisis…' }], /Esperando el análisis: la página no terminó a tiempo/);
    // cumplida la espera, su juicio: un aviso que no es el de éxito, o una tarjeta sin resultados, es un fallo
    q('#toast').textContent = 'Error: selecciona dos variables';
    await falla([{ op: 'esperar', condicion: 'aviso', arg: ['completado|Error', ''], exito: ['completado', ''], ms: 60, nombre: 'Esperando el análisis…' }], /la página respondió «Error: selecciona dos variables»/);
    pagina('<div id="res" hidden></div><div id="men">No hay datos suficientes</div>');
    await falla([{ op: 'esperar', condicion: 'resultados', arg: ['res', 'men'], fallo: 'resultados', ms: 60, nombre: 'Calculando…' }], /^Error: No hay datos suficientes$/);
    // una lista de casillas sin la que pide el paso
    pagina('<div id="grupo"><label><input type="checkbox" value="X"> X</label></div>');
    await falla([{ op: 'marcarSolo', contenedor: '#grupo', valores: ['Z'], nombre: 'Solo Z' }], /Solo Z: la lista no tiene «Z»/);
    pagina('<select id="s"><option value="A">A</option></select><button id="oculto" hidden>x</button><button id="off" disabled>x</button><div id="sitio"></div>');
    await falla([{ op: 'marcar', selector: '#noEsta', valor: true, siVisible: true, nombre: 'Con la interacción' }], /la casilla no está a la vista/);
    await ejecutarPlan([{ op: 'marcar', selector: '#noEsta', valor: false, siVisible: true, nombre: 'Sin la interacción' }]);   // (si no se ve y no se pide, nada)
    await falla([{ op: 'nada' }], /operación desconocida/);
    // un «✕» que no quita nada: se dice, en lugar de pulsarlo sin fin
    pagina('<div id="extras"><button aria-label="Quitar">✕</button></div>');
    await falla([{ op: 'quitarTodos', selector: '#extras button', nombre: 'Sin las de antes' }], /Sin las de antes: la página no quitó el que se pulsó/);
    // la persona se fue a otra pestaña: no se sigue a ciegas
    pagina('<a class="nav-link" href="#analizador">Analizador</a><a class="nav-link" href="#ayuda">Ayuda</a><section id="analizador" class="section active"><button id="b">B</button></section><section id="ayuda" class="section"></section>');
    const { configurarNavegacion } = await import('../../src/shared/navegacion.js');
    configurarNavegacion();
    const plan = [{ op: 'ir', seccion: 'analizador' }, { op: 'esperar', condicion: 'conTexto', arg: 'noEsta', ms: 60000, nombre: 'Esperando…' }, { op: 'pulsar', selector: '#b', nombre: '«B»' }];
    const enCurso = ejecutarPlan(plan);
    setTimeout(() => { q('.nav-link[href="#ayuda"]').click(); q('#analizador').appendChild(Object.assign(env.document.createElement('p'), { id: 'noEsta', textContent: 'ya' })); }, 20);
    await assert.rejects(enCurso, /cambiaste de pestaña \(este paso se hace en «Analizador»\)/);
    // (revisión) y si se va mientras el control está resaltado, antes de usarlo, ya no lo usa
    q('.nav-link[href="#analizador"]').click();
    let pulsado = 0;
    q('#b').addEventListener('click', () => { pulsado++; });
    RITMO.hacer = 80;
    try {
        const enPausa = ejecutarPlan([{ op: 'ir', seccion: 'analizador' }, { op: 'pulsar', selector: '#b', nombre: '«B»' }]);
        setTimeout(() => q('.nav-link[href="#ayuda"]').click(), 20);
        await assert.rejects(enPausa, /cambiaste de pestaña/);
        assert.equal(pulsado, 0, 'no pulsó');
    } finally {
        RITMO.hacer = 0;
    }
    // ni el plan siguiente del paso la trae de vuelta a la suya (desde: donde quedó el anterior)
    await assert.rejects(ejecutarPlan([{ op: 'ir', seccion: 'analizador' }, { op: 'pulsar', selector: '#b', nombre: '«B»' }], { desde: 'analizador' }), /cambiaste de pestaña/);
    assert.ok(q('#ayuda').classList.contains('active'), 'sigue donde la persona fue');
    await assert.rejects(mostrarPlan([{ op: 'ir', seccion: 'analizador' }, { op: 'pulsar', selector: '#b', nombre: '«B»' }], { desde: 'analizador' }), /cambiaste de pestaña/);
    await ejecutarPlan([{ op: 'ir', seccion: 'analizador' }, { op: 'pulsar', selector: '#b', nombre: '«B»' }]);   // (sin «desde», es el principio: va a su sección)
    assert.ok(q('#analizador').classList.contains('active'));
    // detenido: antes de empezar y en medio de una espera
    const c = new AbortController();
    c.abort();
    await assert.rejects(ejecutarPlan([{ op: 'limpiarAviso' }], { senal: c.signal }), Detenido);
    // (revisión) detenido mientras el botón está resaltado: no pulsa, y los resultados que había siguen ahí
    pagina('<button id="calc">Calcular</button><div id="zona">los de antes</div>');
    RITMO.hacer = 80;
    try {
        const e = new AbortController();
        const enPausa = ejecutarPlan([{ op: 'pulsar', selector: '#calc', vaciar: '#zona', nombre: '«Calcular»' }], { senal: e.signal });
        setTimeout(() => e.abort(), 20);
        await assert.rejects(enPausa, Detenido);
        assert.equal(q('#zona').textContent, 'los de antes');
    } finally {
        RITMO.hacer = 0;
    }
    const d = new AbortController();
    const enMarcha = ejecutarPlan([{ op: 'esperar', condicion: 'conTexto', arg: 'sitio', ms: 60000, nombre: 'Esperando…' }], { senal: d.signal });
    setTimeout(() => d.abort(), 20);
    await assert.rejects(enMarcha, Detenido);
});

test('el conductor agrega o quita bloques hasta los que pide el plan, y sube un archivo del caso a su campo', async () => {
    pagina('<div id="cont"></div><button id="mas">+</button>');
    const agregar = () => { const b = env.document.createElement('div'); b.className = 'bloque'; b.innerHTML = '<input class="n"><button class="x">✕</button><button class="cargar">Cargar CSV</button><input type="file" hidden>'; b.querySelector('.x').addEventListener('click', () => b.remove()); q('#cont').appendChild(b); };
    q('#mas').addEventListener('click', agregar);
    const bloques = (/** @type {number} */ n) => ({ op: 'bloques', bloques: '#cont .bloque', agregar: '#mas', quitar: '.x', n, nombre: `${n} criterio(s)` });
    await ejecutarPlan([bloques(3)]);
    assert.equal(env.document.querySelectorAll('#cont .bloque').length, 3);
    await ejecutarPlan([bloques(1), { op: 'ponerEnBloque', bloques: '#cont .bloque', indice: 0, selector: '.n', valor: 'Claridad', nombre: 'Criterio 1' }]);
    assert.equal(env.document.querySelectorAll('#cont .bloque').length, 1);
    assert.equal(q('#cont .bloque .n').value, 'Claridad');
    // subir: al campo de archivo del bloque (el diálogo no se puede abrir con un archivo puesto), con su nombre y sus bytes
    const subir = { op: 'subirEnBloque', bloques: '#cont .bloque', indice: 0, boton: '.cargar', entrada: 'input[type="file"]', archivo: 'analizador/x/v.csv', nombre: '«Cargar CSV»: v.csv' };
    await assert.rejects(ejecutarPlan([subir]), /no hay de dónde sacar «analizador\/x\/v\.csv»/);
    const archivo = async (/** @type {string} */ ruta) => ({ nombre: ruta.split('/').pop() || '', bytes: new TextEncoder().encode('I1;4;4\n') });
    await assert.rejects(ejecutarPlan([subir], { archivo }), /este navegador no deja poner un archivo por ti: pulsa «Cargar CSV» y elige «v\.csv»/);
    G.DataTransfer = class { constructor() { /** @type {File[]} */ this.lista = []; this.items = { add: (/** @type {File} */ f) => { this.lista.push(f); } }; } get files() { return this.lista; } };
    /** @type {any} */ let recibido = null;
    q('#cont .bloque input[type="file"]').addEventListener('change', (/** @type {any} */ ev) => { recibido = ev.target.files[0]; });
    try {
        await ejecutarPlan([subir], { archivo });
    } finally {
        delete G.DataTransfer;
    }
    assert.ok(recibido, 'el campo avisa de su archivo');
    assert.equal(recibido.name, 'v.csv');
    assert.equal(await recibido.text(), 'I1;4;4\n');
    // (revisión) «Detener» mientras baja el archivo: no espera a que termine de bajar
    const detener = new AbortController();
    const sinFin = ejecutarPlan([subir], { archivo: () => new Promise(() => {}), senal: detener.signal });
    setTimeout(() => detener.abort(), 20);
    await assert.rejects(sinFin, Detenido);
    // la página no agrega: se dice, en lugar de seguir pulsando
    q('#mas').replaceWith(Object.assign(env.document.createElement('button'), { id: 'mas' }));
    await assert.rejects(ejecutarPlan([bloques(2)]), /la página no agregó el criterio/);
});

test('«Muéstrame» señala sin tocar: se salta lo que aún no está y devuelve lo que señaló', async () => {
    pagina('<select id="s"><option value="">—</option><option value="A">A</option></select><button id="b">B</button><div hidden><button id="oculto">O</button></div>');
    /** @type {string[]} */ const dicho = [];
    const vistos = await mostrarPlan([
        { op: 'poner', selector: '#s', valor: 'A', nombre: 'Variable 1: A' },
        { op: 'pulsar', selector: '#noEsta', nombre: 'no está' },
        { op: 'pulsar', selector: '#oculto', nombre: 'no se ve' },
        { op: 'esperar', condicion: 'conTexto', arg: 'x', ms: 60000, nombre: 'no se espera' },
        { op: 'senalar', selector: '#b', nombre: 'Esto es tuyo' },
    ], { alAvanzar: t => dicho.push(t) });
    assert.deepEqual(vistos.map(el => el.id), ['s', 'b']);
    assert.deepEqual(dicho, ['Variable 1: A', 'Esto es tuyo']);
    assert.equal(q('#s').value, '', 'no toca nada');
});

test('lo que ofrece y dice la guía de cada paso (sesion.js)', () => {
    const a = (/** @type {string} */ accion, datos = {}) => ({ accion, datos });
    const e = /** @type {any} */ ({
        pasos: ['p1', 'p2', 'p3', 'p4', 'p5'], repetir: { desde: 2, hasta: 4, nota: '' },
        guiones: [[a('usarBaseDelSimulador')], [a('analizar', VALIDOS.analizar), a('exportarAnalisis')], [a('exportarAnalisis')], [a('ajustarSEM', VALIDOS.ajustarSEM)], [a('guardarProyecto')]],
    });
    assert.equal(conGuiones(e), true);
    assert.equal(conGuiones({ ...e, guiones: undefined }), false);
    assert.equal(conGuiones({ ...e, guiones: [[]] }), false, 'uno por paso, o ninguno');
    assert.deepEqual(guionDe(e, 4), [a('ajustarSEM', VALIDOS.ajustarSEM)]);
    assert.deepEqual(guionDe({ ...e, guiones: undefined }, 4), []);
    assert.deepEqual([1, 2, 3, 4, 5].map(n => seHace(e, n)), [false, true, false, true, false], 'solo los que se repiten y hacen algo');
    assert.deepEqual([1, 2, 3, 4, 5].map(n => seMuestra(e, n)), [true, true, true, true, true]);
    assert.deepEqual(pasosQueSeHacen(e), [2, 4]);
    assert.equal(listaDePasos([2, 3, 4]), 'los pasos 2 a 4');
    assert.equal(listaDePasos([2, 3]), 'los pasos 2 y 3');
    assert.equal(listaDePasos([3]), 'el paso 3');
    assert.equal(listaDePasos([2, 4, 5]), 'los pasos 2, 4 y 5');
    assert.equal(finDeMostrar(e, 1, 2), 'Paso 1: eso es lo que se hizo. Ya lo trajo el proyecto: no hace falta repetirlo.');
    assert.equal(finDeMostrar(e, 2, 7), 'Paso 2: eso es lo que se toca. «Hazlo por mí» lo hace por ti, a la vista.');
    assert.equal(finDeMostrar(e, 3, 2), 'Paso 3: eso es lo que se toca.');
    assert.equal(finDeMostrar(e, 5, 1), 'Paso 5: eso es tuyo (las descargas, «Guardar proyecto»): pulsa lo que quieras guardar.');
    assert.equal(finDeMostrar(e, 2, 0), 'Paso 2: sus controles aún no están a la vista (salen al hacer el paso anterior).');
    assert.equal(finDelPaso(4, ['El SEM «A»', 'El SEM «B»'], false), 'Listo: paso 4 hecho (el SEM «A» y el SEM «B»). Despliega la guía (▴) para seguir.');
    assert.equal(finDelPaso(2, ['El análisis estadístico'], true), 'Listo: paso 2 hecho (el análisis estadístico). Sus descargas son tuyas: te las dejo señaladas. Despliega la guía (▴) para seguir.');
    assert.equal(finDelPaso(2, ['El análisis estadístico'], false, { sinSenalar: 'Cambiaste de pestaña (este paso se hace en «Analizador»).' }), 'Listo: paso 2 hecho (el análisis estadístico). No te señalé sus descargas: cambiaste de pestaña (este paso se hace en «Analizador»). Despliega la guía (▴) para seguir.');
    // (2027.01.04) un paso suelto cuyas descargas llevan lo de pasos sin marcar lo dice; sin pedir desplegar la guía si no está plegada;
    // y detenido mientras señalaba sus descargas, el paso está hecho: solo faltó señalarlas
    assert.equal(finDelPaso(3, ['El análisis estadístico'], true, { sinHacer: [2] }), 'Listo: paso 3 hecho (el análisis estadístico). Sus descargas son tuyas: te las dejo señaladas. Ojo: sus descargas llevan también lo del paso 2, que no está marcado como hecho; si no lo hiciste, hazlo antes de descargarlas, o no serán las del caso («Hazlo todo por mí» hace todos los pasos en orden). Despliega la guía (▴) para seguir.');
    assert.equal(finDelPaso(6, ['El análisis estadístico'], true, { sinHacer: [2, 3, 5], plegada: false }), 'Listo: paso 6 hecho (el análisis estadístico). Sus descargas son tuyas: te las dejo señaladas. Ojo: sus descargas llevan también lo de los pasos 2, 3 y 5, que no están marcados como hechos; si no los hiciste, hazlos antes de descargarlas, o no serán las del caso («Hazlo todo por mí» hace todos los pasos en orden).');
    assert.equal(finDelPaso(3, ['El análisis estadístico'], false, { sinSenalar: 'Lo detuviste', plegada: false }), 'Listo: paso 3 hecho (el análisis estadístico). No te señalé sus descargas: lo detuviste.');
    // (revisión) el paso que falta hace también su propio análisis: hecho ahora, reemplaza al de este, que hay que repetir después
    assert.equal(finDelPaso(4, ['El análisis estadístico'], true, { sinHacer: [3], conAnalisis: [3], plegada: false }), 'Listo: paso 4 hecho (el análisis estadístico). Sus descargas son tuyas: te las dejo señaladas. Ojo: sus descargas llevan también lo del paso 3, que no está marcado como hecho; si no lo hiciste, hazlo y después repite este (el paso 3 hace su propio análisis, que reemplaza al de este), o no serán las del caso («Hazlo todo por mí» hace todos los pasos en orden).');
    assert.equal(finDelPaso(5, ['El análisis estadístico'], true, { sinHacer: [2, 3], conAnalisis: [3], plegada: false }), 'Listo: paso 5 hecho (el análisis estadístico). Sus descargas son tuyas: te las dejo señaladas. Ojo: sus descargas llevan también lo de los pasos 2 y 3, que no están marcados como hechos; si no los hiciste, hazlos y después repite este (el paso 3 hace su propio análisis, que reemplaza al de este), o no serán las del caso («Hazlo todo por mí» hace todos los pasos en orden).');
    // (revisión) lo de un paso posterior que ya está hecho: en el caso aún no estaba
    assert.equal(finDelPaso(2, ['El análisis estadístico'], true, { sobran: [3] }), 'Listo: paso 2 hecho (el análisis estadístico). Sus descargas son tuyas: te las dejo señaladas. Ojo: sus descargas llevan también lo del paso 3, que está marcado como hecho y en el caso viene después: no serán las del caso (las del caso están en la pestaña «Ejemplos»; o vuelve a abrir el caso y haz este paso antes que el 3). Despliega la guía (▴) para seguir.');
    assert.equal(finDelPaso(3, ['El análisis estadístico'], true, { sinHacer: [2], sobran: [4, 5], plegada: false }), 'Listo: paso 3 hecho (el análisis estadístico). Sus descargas son tuyas: te las dejo señaladas. Ojo: sus descargas llevan también lo del paso 2, que no está marcado como hecho; si no lo hiciste, hazlo antes de descargarlas, o no serán las del caso («Hazlo todo por mí» hace todos los pasos en orden). Y sus descargas llevan también lo de los pasos 4 y 5, que están marcados como hechos y en el caso vienen después: no serán las del caso (las del caso están en la pestaña «Ejemplos»; o vuelve a abrir el caso y haz este paso antes que esos).');
    // (revisión) cuáles de sus descargas: lo impreso lleva todas las tarjetas; el Word, el SEM; el texto, ninguna
    assert.equal(finDelPaso(4, ['El análisis estadístico'], true, { sinHacer: [3], conAnalisis: [3], enSinHacer: { pdf: [3] }, plegada: false }), 'Listo: paso 4 hecho (el análisis estadístico). Sus descargas son tuyas: te las dejo señaladas. Ojo: lo impreso (el PDF) lleva también lo del paso 3, que no está marcado como hecho; si no lo hiciste, hazlo y después repite este (el paso 3 hace su propio análisis, que reemplaza al de este), o no será el del caso («Hazlo todo por mí» hace todos los pasos en orden).');
    assert.equal(finDelPaso(3, ['El análisis estadístico'], true, { sinHacer: [2], enSinHacer: { word: [2], pdf: [2] }, plegada: false }), 'Listo: paso 3 hecho (el análisis estadístico). Sus descargas son tuyas: te las dejo señaladas. Ojo: el Word y lo impreso (el PDF) llevan también lo del paso 2, que no está marcado como hecho; si no lo hiciste, hazlo antes de descargarlos, o no serán los del caso («Hazlo todo por mí» hace todos los pasos en orden).');
    assert.equal(finDelPaso(2, ['El análisis estadístico'], true, { sobran: [3], enSobran: { pdf: [3] }, plegada: false }), 'Listo: paso 2 hecho (el análisis estadístico). Sus descargas son tuyas: te las dejo señaladas. Ojo: lo impreso (el PDF) lleva también lo del paso 3, que está marcado como hecho y en el caso viene después: no será el del caso (el del caso está en la pestaña «Ejemplos»; o vuelve a abrir el caso y haz este paso antes que el 3).');
    // (2027.01.05, revisión) cada descarga con lo suyo, de menos a más (lo impreso, que lleva todas las tarjetas, al final): el
    // caso 4, el paso 6 suelto; hasta la 2027.01.04, «el Word y lo impreso (el PDF) llevan también lo de los pasos 2 a 5»
    assert.equal(finDelPaso(6, ['El análisis estadístico'], true, { sinHacer: [2, 3, 4, 5], enSinHacer: { word: [4], pdf: [2, 3, 4, 5] }, plegada: false }), 'Listo: paso 6 hecho (el análisis estadístico). Sus descargas son tuyas: te las dejo señaladas. Ojo: el Word lleva también lo del paso 4, y lo impreso (el PDF), lo de los pasos 2 a 5, que no están marcados como hechos; si no los hiciste, hazlos antes de descargarlos, o no serán los del caso («Hazlo todo por mí» hace todos los pasos en orden).');
    assert.equal(finDelPaso(6, ['El análisis estadístico'], true, { sinHacer: [3, 4], enSinHacer: { pdf: [3, 4], word: [4] }, plegada: false }), 'Listo: paso 6 hecho (el análisis estadístico). Sus descargas son tuyas: te las dejo señaladas. Ojo: el Word lleva también lo del paso 4, y lo impreso (el PDF), lo de los pasos 3 y 4, que no están marcados como hechos; si no los hiciste, hazlos antes de descargarlos, o no serán los del caso («Hazlo todo por mí» hace todos los pasos en orden).', 'el orden de las claves no importa');
    assert.equal(finDelPaso(5, ['El análisis estadístico'], true, { sinHacer: [2, 3, 4], enSinHacer: { texto: [2], word: [2, 3], pdf: [2, 3, 4] }, plegada: false }), 'Listo: paso 5 hecho (el análisis estadístico). Sus descargas son tuyas: te las dejo señaladas. Ojo: el texto lleva también lo del paso 2; el Word, lo de los pasos 2 y 3; y lo impreso (el PDF), lo de los pasos 2 a 4, que no están marcados como hechos; si no los hiciste, hazlos antes de descargarlos, o no serán los del caso («Hazlo todo por mí» hace todos los pasos en orden).', 'tres, con punto y coma (2027.01.06)');
    // (2027.01.06, revisión) uno que, hecho ahora, dejaría de más lo que en el caso se llevó el análisis de este (la ANCOVA, del
    // Word): hazlo y repite este, como el que hace su propio análisis
    assert.equal(finDelPaso(3, ['El análisis estadístico'], true, { sinHacer: [2], enSinHacer: { pdf: [2] }, deMas: { word: [2] }, plegada: false }), 'Listo: paso 3 hecho (el análisis estadístico). Sus descargas son tuyas: te las dejo señaladas. Ojo: lo impreso (el PDF) lleva también lo del paso 2, que no está marcado como hecho; si no lo hiciste, hazlo y después repite este (el análisis de este quita del Word lo que deja el paso 2), o no será el del caso («Hazlo todo por mí» hace todos los pasos en orden).');
    assert.equal(finDelPaso(4, ['El análisis estadístico'], true, { sinHacer: [2, 3], conAnalisis: [3], enSinHacer: { pdf: [2, 3] }, deMas: { word: [2] }, plegada: false }), 'Listo: paso 4 hecho (el análisis estadístico). Sus descargas son tuyas: te las dejo señaladas. Ojo: lo impreso (el PDF) lleva también lo de los pasos 2 y 3, que no están marcados como hechos; si no los hiciste, hazlos y después repite este (el paso 3 hace su propio análisis, que reemplaza al de este; y el análisis de este quita del Word lo que deja el paso 2), o no será el del caso («Hazlo todo por mí» hace todos los pasos en orden).');
    assert.equal(finDelPaso(4, ['El análisis estadístico'], true, { sinHacer: [2, 3], enSinHacer: { pdf: [2, 3] }, deMas: { word: [2, 3] }, plegada: false }), 'Listo: paso 4 hecho (el análisis estadístico). Sus descargas son tuyas: te las dejo señaladas. Ojo: lo impreso (el PDF) lleva también lo de los pasos 2 y 3, que no están marcados como hechos; si no los hiciste, hazlos y después repite este (el análisis de este quita del Word lo que dejan los pasos 2 y 3), o no será el del caso («Hazlo todo por mí» hace todos los pasos en orden).');
    assert.equal(finDelPaso(4, ['El análisis estadístico'], true, { sinHacer: [3], conAnalisis: [3], enSinHacer: { pdf: [3] }, deMas: { word: [3] }, plegada: false }), 'Listo: paso 4 hecho (el análisis estadístico). Sus descargas son tuyas: te las dejo señaladas. Ojo: lo impreso (el PDF) lleva también lo del paso 3, que no está marcado como hecho; si no lo hiciste, hazlo y después repite este (el paso 3 hace su propio análisis, que reemplaza al de este), o no será el del caso («Hazlo todo por mí» hace todos los pasos en orden).', 'con su propio análisis basta esa razón');
    // (2027.01.07, revisión) diciendo qué deja de más (el paso puede dejar en el Word también su SEM, que sí es del caso)
    assert.equal(finDelPaso(3, ['El análisis estadístico'], true, { sinHacer: [2], enSinHacer: { word: [2], pdf: [2] }, deMas: { word: [2] }, queDeja: { 2: 'la ANCOVA' }, plegada: false }), 'Listo: paso 3 hecho (el análisis estadístico). Sus descargas son tuyas: te las dejo señaladas. Ojo: el Word y lo impreso (el PDF) llevan también lo del paso 2, que no está marcado como hecho; si no lo hiciste, hazlo y después repite este (el análisis de este quita del Word la ANCOVA del paso 2), o no serán los del caso («Hazlo todo por mí» hace todos los pasos en orden).');
    assert.equal(finDelPaso(4, ['El análisis estadístico'], true, { sinHacer: [2, 3], enSinHacer: { pdf: [2, 3] }, deMas: { word: [2, 3] }, queDeja: { 2: 'la ANCOVA', 3: 'el MANOVA' }, plegada: false }), 'Listo: paso 4 hecho (el análisis estadístico). Sus descargas son tuyas: te las dejo señaladas. Ojo: lo impreso (el PDF) lleva también lo de los pasos 2 y 3, que no están marcados como hechos; si no los hiciste, hazlos y después repite este (el análisis de este quita del Word la ANCOVA del paso 2 y el MANOVA del paso 3), o no será el del caso («Hazlo todo por mí» hace todos los pasos en orden).');
    assert.equal(finDelPaso(4, ['El análisis estadístico'], true, { sinHacer: [2, 3], enSinHacer: { pdf: [2, 3] }, deMas: { word: [2, 3] }, queDeja: { 2: 'la ANCOVA' }, plegada: false }), 'Listo: paso 4 hecho (el análisis estadístico). Sus descargas son tuyas: te las dejo señaladas. Ojo: lo impreso (el PDF) lleva también lo de los pasos 2 y 3, que no están marcados como hechos; si no los hiciste, hazlos y después repite este (el análisis de este quita del Word lo que dejan los pasos 2 y 3), o no será el del caso («Hazlo todo por mí» hace todos los pasos en orden).', 'sin saber qué deja uno, como antes');
    assert.equal(finDelPaso(5, ['El análisis estadístico'], true, { sinHacer: [2, 4], enSinHacer: { word: [2, 4], texto: [2, 4], pdf: [2, 4] }, plegada: false }), 'Listo: paso 5 hecho (el análisis estadístico). Sus descargas son tuyas: te las dejo señaladas. Ojo: el Word, el texto y lo impreso (el PDF) llevan también lo de los pasos 2 y 4, que no están marcados como hechos; si no los hiciste, hazlos antes de descargarlos, o no serán los del caso («Hazlo todo por mí» hace todos los pasos en orden).', 'las que llevan lo mismo, juntas');
    assert.equal(finDelPaso(3, ['El análisis estadístico'], true, { sinHacer: [2], enSinHacer: { pdf: [2] }, sobran: [4, 5], enSobran: { word: [4], pdf: [4, 5] }, plegada: false }), 'Listo: paso 3 hecho (el análisis estadístico). Sus descargas son tuyas: te las dejo señaladas. Ojo: lo impreso (el PDF) lleva también lo del paso 2, que no está marcado como hecho; si no lo hiciste, hazlo antes de descargarlo, o no será el del caso («Hazlo todo por mí» hace todos los pasos en orden). Y el Word lleva también lo del paso 4, y lo impreso (el PDF), lo de los pasos 4 y 5, que están marcados como hechos y en el caso vienen después: no serán los del caso (los del caso están en la pestaña «Ejemplos»; o vuelve a abrir el caso y haz este paso antes que esos).');
    assert.equal(finDeTodo([2, 3], { vigentes: [3], perdidos: [], senaladas: false, sinSenalar: 'Lo detuviste' }), 'Listo: se repitieron los pasos 2 y 3, como en el caso. No te señalé sus descargas: lo detuviste.');
    assert.equal(finDeTodo([2, 3, 4], { vigentes: [4], perdidos: [2, 3], senaladas: true }), 'Listo: se repitieron los pasos 2 a 4, como en el caso. Te dejo señaladas las descargas de lo que ves (las del paso 4). Cada análisis reemplaza al anterior en la página: ya no están las descargas del análisis de los pasos 2 y 3; repítelos con su «Hazlo por mí» o bájalas hechas en la pestaña «Ejemplos».');
    // (revisión) el caso 2: repetido ahora, el paso 2 daría lo impreso con la comparación de grupos del paso 3
    // (2027.01.05) «el del caso está en la pestaña…», como al terminar un paso (hasta la 2027.01.04, «ese, bájalo hecho en…»)
    assert.equal(finDeTodo([2, 3, 4], { vigentes: [4], perdidos: [2, 3], senaladas: true, despuesDe: { 2: [3], 3: [] }, enDespuesDe: { 2: { pdf: [3] }, 3: {} } }), 'Listo: se repitieron los pasos 2 a 4, como en el caso. Te dejo señaladas las descargas de lo que ves (las del paso 4). Cada análisis reemplaza al anterior en la página: ya no están las descargas del análisis de los pasos 2 y 3; repítelos con su «Hazlo por mí» o bájalas hechas en la pestaña «Ejemplos». Repetido ahora, el paso 2 daría lo impreso (el PDF) con lo del paso 3, que en el caso viene después: el del caso está en la pestaña «Ejemplos».');
    assert.equal(finDeTodo([2, 3, 4, 5], { vigentes: [5], perdidos: [2, 3], senaladas: true, despuesDe: { 2: [4], 3: [4] }, enDespuesDe: { 2: { word: [4], pdf: [4] }, 3: { word: [4], pdf: [4] } } }), 'Listo: se repitieron los pasos 2 a 5, como en el caso. Te dejo señaladas las descargas de lo que ves (las del paso 5). Cada análisis reemplaza al anterior en la página: ya no están las descargas del análisis de los pasos 2 y 3; repítelos con su «Hazlo por mí» o bájalas hechas en la pestaña «Ejemplos». Repetidos ahora, los pasos 2 y 3 darían el Word y lo impreso (el PDF) con lo del paso 4, que en el caso viene después: los del caso están en la pestaña «Ejemplos».', 'los que darían lo mismo, juntos');
    // (2027.01.08, revisión) cada paso con lo suyo: hasta la 2027.01.07, «los pasos 2 y 3 darían lo impreso (el PDF) con lo de los
    // pasos 3 y 4», y lo del paso 3 no viene después del 3
    assert.equal(finDeTodo([2, 3, 4], { vigentes: [4], perdidos: [2, 3], senaladas: true, despuesDe: { 2: [3, 4], 3: [4] }, enDespuesDe: { 2: { pdf: [3, 4] }, 3: { pdf: [4] } } }), 'Listo: se repitieron los pasos 2 a 4, como en el caso. Te dejo señaladas las descargas de lo que ves (las del paso 4). Cada análisis reemplaza al anterior en la página: ya no están las descargas del análisis de los pasos 2 y 3; repítelos con su «Hazlo por mí» o bájalas hechas en la pestaña «Ejemplos». Repetidos ahora, el paso 2 daría lo impreso (el PDF) con lo de los pasos 3 y 4; y el 3, lo impreso (el PDF) con lo del paso 4 (en el caso, los pasos 3 y 4 vienen después): los del caso están en la pestaña «Ejemplos».', '(2027.01.09, revisión) los de después de todos, aparte: «…con lo del paso 4, que en el caso vienen después» no concordaba');
    assert.equal(finDeTodo([2, 3, 4, 5], { vigentes: [5], perdidos: [2, 3, 4], senaladas: true, despuesDe: { 2: [3, 5], 3: [5], 4: [5] }, enDespuesDe: { 2: { word: [5], pdf: [3, 5] }, 3: { word: [5], pdf: [5] }, 4: { word: [5], pdf: [5] } } }), 'Listo: se repitieron los pasos 2 a 5, como en el caso. Te dejo señaladas las descargas de lo que ves (las del paso 5). Cada análisis reemplaza al anterior en la página: ya no están las descargas del análisis de los pasos 2 a 4; repítelos con su «Hazlo por mí» o bájalas hechas en la pestaña «Ejemplos». Repetidos ahora, el paso 2 daría el Word con lo del paso 5 y lo impreso (el PDF) con lo de los pasos 3 y 5; y los 3 y 4, el Word y lo impreso (el PDF) con lo del paso 5 (en el caso, los pasos 3 y 5 vienen después): los del caso están en la pestaña «Ejemplos».', 'tres, dos de ellos iguales');
    assert.equal(finDeTodo([2, 3, 4, 5, 6], { vigentes: [6], perdidos: [2, 3, 4, 5], senaladas: true, despuesDe: { 2: [3, 6], 3: [6], 4: [6], 5: [6] }, enDespuesDe: { 2: { pdf: [3, 6] }, 3: { pdf: [6] }, 4: { pdf: [6] }, 5: { pdf: [6] } } }), 'Listo: se repitieron los pasos 2 a 6, como en el caso. Te dejo señaladas las descargas de lo que ves (las del paso 6). Cada análisis reemplaza al anterior en la página: ya no están las descargas del análisis de los pasos 2 a 5; repítelos con su «Hazlo por mí» o bájalas hechas en la pestaña «Ejemplos». Repetidos ahora, el paso 2 daría lo impreso (el PDF) con lo de los pasos 3 y 6; y los 3 a 5, lo impreso (el PDF) con lo del paso 6 (en el caso, los pasos 3 y 6 vienen después): los del caso están en la pestaña «Ejemplos».', 'tres seguidos iguales, como en el resto de la guía («los 3 a 5»)');
    // (2027.01.05, revisión) y cada descarga con lo suyo
    assert.equal(finDeTodo([2, 3, 4, 5], { vigentes: [5], perdidos: [2], senaladas: true, despuesDe: { 2: [3, 4] }, enDespuesDe: { 2: { word: [4], pdf: [3, 4] } } }), 'Listo: se repitieron los pasos 2 a 5, como en el caso. Te dejo señaladas las descargas de lo que ves (las del paso 5). Cada análisis reemplaza al anterior en la página: ya no están las descargas del análisis del paso 2; repítelo con su «Hazlo por mí» o bájalas hechas en la pestaña «Ejemplos». Repetido ahora, el paso 2 daría el Word con lo del paso 4 y lo impreso (el PDF) con lo de los pasos 3 y 4, que en el caso vienen después: los del caso están en la pestaña «Ejemplos».');
    assert.equal(finDeTodo([2, 3], { vigentes: [3], perdidos: [2], senaladas: true, despuesDe: { 2: [3] } }), 'Listo: se repitieron los pasos 2 y 3, como en el caso. Te dejo señaladas las descargas de lo que ves (las del paso 3). Cada análisis reemplaza al anterior en la página: ya no están las descargas del análisis del paso 2; repítelo con su «Hazlo por mí» o bájalas hechas en la pestaña «Ejemplos». Repetido ahora, el paso 2 daría sus descargas con lo del paso 3, que en el caso viene después: las del caso están en la pestaña «Ejemplos».');
    // (2027.01.08) y sin decir cuáles, cada paso con los suyos (no con los de todos)
    assert.equal(finDeTodo([2, 3, 4], { vigentes: [4], perdidos: [2, 3], senaladas: true, despuesDe: { 2: [3, 4], 3: [4] } }), 'Listo: se repitieron los pasos 2 a 4, como en el caso. Te dejo señaladas las descargas de lo que ves (las del paso 4). Cada análisis reemplaza al anterior en la página: ya no están las descargas del análisis de los pasos 2 y 3; repítelos con su «Hazlo por mí» o bájalas hechas en la pestaña «Ejemplos». Repetidos ahora, el paso 2 daría sus descargas con lo de los pasos 3 y 4; y el 3, sus descargas con lo del paso 4 (en el caso, los pasos 3 y 4 vienen después): las del caso están en la pestaña «Ejemplos».');
    assert.equal(finDeTodo([2, 3], { vigentes: [3], perdidos: [2], senaladas: true }), 'Listo: se repitieron los pasos 2 y 3, como en el caso. Te dejo señaladas las descargas de lo que ves (las del paso 3). Cada análisis reemplaza al anterior en la página: ya no están las descargas del análisis del paso 2; repítelo con su «Hazlo por mí» o bájalas hechas en la pestaña «Ejemplos».');
    assert.equal(finDeTodo([2, 3, 4, 5, 6], { vigentes: [2, 3, 5, 6], perdidos: [], senaladas: true }), 'Listo: se repitieron los pasos 2 a 6, como en el caso. Te dejo señaladas sus descargas.');
    assert.equal(finDeTodo([2, 3], { vigentes: [], perdidos: [], senaladas: false }), 'Listo: se repitieron los pasos 2 y 3, como en el caso.');
    assert.equal(finDeTodo([2], { vigentes: [2], perdidos: [], senaladas: false, sinSenalar: 'Cambiaste de pestaña.' }), 'Listo: se repitió el paso 2, como en el caso. No te señalé sus descargas: cambiaste de pestaña.');
    assert.equal(finConProblema(3, new Detenido(), false), 'Detenido en el paso 3. Lo que ya se hizo se queda; si un cálculo había empezado, termina solo.');
    assert.equal(finConProblema(3, new Detenido(), true), 'Detenido en el paso 3.');
    assert.equal(finConProblema(3, new Error('«Calcular»: no está en la página.'), false), 'No se pudo hacer el paso 3. «Calcular»: no está en la página. Puedes seguir a mano: «Muéstrame» te señala dónde está cada cosa.');
    assert.equal(finConProblema(2, new Error('No se pudo descargar «v.csv»: el sitio respondió 404.'), false), 'No se pudo hacer el paso 2. No se pudo descargar «v.csv»: el sitio respondió 404. Puedes seguir a mano: «Muéstrame» te señala dónde está cada cosa.');
    assert.equal(finConProblema(5, new Error('no se pudo ir a la sección «ayuda»'), true), 'No se pudo mostrar el paso 5. No se pudo ir a la sección «ayuda».');
});

test('la sesión hace una cosa a la vez y le dice a la guía cómo va: ocupada, plegada, el paso en curso y cómo terminó', async () => {
    pagina('<a class="nav-link" href="#analizador">Analizador</a><section id="analizador" class="section active"><button id="btnExportarWord">W</button><button id="btnDescargarResultados">T</button><button id="btnImprimirAnalizador">P</button></section>');
    /** @type {string[]} */ const visto = [];
    let plegada = false;
    const vista = {
        decir: (/** @type {string} */ t, tipo = 'info') => { visto.push(`decir(${tipo}): ${t}`); },
        ocupar: (/** @type {boolean} */ o) => { visto.push(`ocupar(${o})`); },
        enCurso: (/** @type {number | null} */ n) => { visto.push(`enCurso(${n})`); },
        marcar: (/** @type {number} */ n) => { visto.push(`marcar(${n})`); },
        marcado: () => false,
        plegar: (/** @type {boolean} */ p) => { plegada = p; visto.push(`plegar(${p})`); },
        plegada: () => plegada,
        contiene: () => false,
    };
    const e = /** @type {any} */ ({ pasos: ['p1'], repetir: { desde: 1, hasta: 1, nota: '' }, guiones: [[{ accion: 'exportarAnalisis', datos: { word: true } }]] });
    const sesion = crearSesion(e, vista);
    RITMO.mostrar = 20;
    try {
        const primera = sesion.mostrar(1);
        assert.equal(sesion.ocupada(), true);
        assert.equal(await sesion.mostrar(1), false, 'otra, mientras tanto, no');
        assert.equal(await sesion.hacerTodo(), false, 'ni «Hazlo todo» (aquí no hay nada que hacer)');
        assert.equal(await primera, true);
    } finally {
        RITMO.mostrar = 0;
    }
    assert.equal(sesion.ocupada(), false);
    assert.deepEqual(visto.filter(x => !x.startsWith('decir(info): Paso 1 · ')), ['ocupar(true)', 'plegar(true)', 'enCurso(1)', 'decir(info): Paso 1: eso es lo que se toca.', 'enCurso(null)', 'plegar(false)', 'ocupar(false)'], 'plegada mientras muestra; al terminar, como estaba');
    assert.deepEqual(visto.filter(x => x.startsWith('decir(info): Paso 1 · ')), ['decir(info): Paso 1 · El capítulo en Word: «Exportar capítulo a Word»', 'decir(info): Paso 1 · Los resultados en texto: «Descargar resultados»', 'decir(info): Paso 1 · Los resultados en PDF: «Imprimir o guardar en PDF»']);
    assert.equal(await sesion.hacer(1), false, 'un paso que solo descarga no se hace por ti');
});

test('(2027.01.04) lo que llevan las descargas del análisis de un paso: las tarjetas de los pasos de antes y (revisión) de después, de los que se repiten; no los análisis', () => {
    const a = (/** @type {string} */ accion, datos = {}) => ({ accion, datos });
    const analizar = a('analizar', { tipo: 'correlacion', variables: ['A', 'B'] });
    const e = /** @type {any} */ ({
        pasos: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'], repetir: { desde: 2, hasta: 5, nota: '' },
        guiones: [[a('usarBaseDelSimulador')], [a('calcularAFE', { conjunto: 'X' })], [analizar, a('exportarAnalisis', { word: true })], [a('ajustarSEM', VALIDOS.ajustarSEM)], [analizar, a('exportarAnalisis', { word: true })], [a('guardarProyecto')]],
    });
    const nada = { antes: [], conAnalisis: [], despues: [] };
    /** Sin cuáles son sus descargas (se prueban aparte). @param {{ antes: number[], conAnalisis: number[], despues: number[] }} t */
    const pasos = t => ({ antes: t.antes, conAnalisis: t.conAnalisis, despues: t.despues });
    assert.deepEqual(tarjetasQueLleva(e, 2), { ...nada, descargas: [], lleva: {}, deMas: {}, queDeja: {} }, 'las descargas del AFE son solo suyas');
    assert.deepEqual(tarjetasQueLleva(e, 3), { antes: [2], conAnalisis: [], despues: [4], descargas: ['word', 'texto', 'pdf'], lleva: { 2: ['pdf'], 4: ['word', 'pdf'] }, deMas: {}, queDeja: {} }, 'las del análisis del paso 3 llevan el AFE del 2 (el PDF imprime la tarjeta); y el SEM del 4, si ya se hizo (en el Word y en lo impreso)');
    assert.deepEqual(pasos(tarjetasQueLleva(e, 5)), { antes: [2, 4], conAnalisis: [], despues: [] }, 'las del 5, el AFE y el SEM; no el análisis del 3, que el del 5 reemplaza');
    assert.deepEqual(tarjetasQueLleva(e, 4), { ...nada, descargas: [], lleva: {}, deMas: {}, queDeja: {} }, 'el SEM no deja descargas propias del análisis');
    // (revisión) cuáles de sus descargas: lo impreso, todas las tarjetas; el Word, el SEM; el texto, ninguna
    assert.deepEqual(tarjetasQueLleva(e, 5).lleva, { 2: ['pdf'], 4: ['word', 'pdf'] }, 'el AFE, solo en lo impreso; el SEM, en el Word y en lo impreso');
    assert.deepEqual(loQueDejaEn(e, 4, [], 5, ['texto', 'pdf']), ['pdf'], 'solo las que tiene el paso (sin el Word)');
    assert.deepEqual(loQueDejaEn(e, 3, [4], 5, ['word', 'texto', 'pdf']), [], 'un análisis no es una tarjeta');
    assert.deepEqual(loQueDejaEn(e, 4, [], 5, ['texto']), [], 'el texto, ninguna tarjeta');
    assert.deepEqual(porDescarga([2, 4], { 2: ['pdf'], 4: ['word', 'pdf'] }), { word: [4], pdf: [2, 4] }, 'cuáles lleva cada una');
    assert.deepEqual(porDescarga([4], { 2: ['pdf'], 4: ['word', 'pdf'] }), { word: [4], pdf: [4] }, 'de esos pasos');
    assert.deepEqual(porDescarga([], { 2: ['pdf'] }), {});
    // un paso con una tarjeta y su propio análisis (el 3 del caso 2): va en las descargas de los de después, y su análisis las reemplaza
    const conAnalisis = /** @type {any} */ ({ ...e, guiones: [e.guiones[0], [analizar, a('exportarAnalisis', { word: true })], [analizar, a('compararGrupos', VALIDOS.compararGrupos), a('exportarAnalisis', { word: true })], [analizar, a('exportarAnalisis', { word: true })], e.guiones[4], e.guiones[5]] });
    assert.deepEqual(pasos(tarjetasQueLleva(conAnalisis, 4)), { antes: [3], conAnalisis: [3], despues: [] });
    assert.deepEqual(pasos(tarjetasQueLleva(conAnalisis, 2)), { antes: [], conAnalisis: [], despues: [3] });
    assert.deepEqual(pasos(tarjetasQueLleva(conAnalisis, 3)), nada, 'la comparación del paso 3 la hace él: no es de otro paso');
    // los casos de ejemplos/: el capítulo del caso 5 lleva su SEM; el del caso 4, toda la psicometría; el caso 2, su comparación
    if (!fs.existsSync(path.join(ejemplos, 'indice.json'))) return;
    const casos = JSON.parse(fs.readFileSync(path.join(ejemplos, 'indice.json'), 'utf8')).casos;
    const caso = (/** @type {string} */ c) => casos.find((/** @type {any} */ x) => x.carpeta === c);
    assert.deepEqual(tarjetasQueLleva(caso('05-estructural'), 3), { antes: [2], conAnalisis: [], despues: [], descargas: ['word', 'texto', 'pdf'], lleva: { 2: ['word', 'pdf'] }, deMas: {}, queDeja: {} }, 'el SEM del caso 5, en su capítulo de Word y en lo impreso');
    assert.deepEqual(pasos(tarjetasQueLleva(caso('04-instrumental'), 6)), { antes: [2, 3, 4, 5], conAnalisis: [], despues: [] });
    // (2027.01.05, revisión) el Word del caso 4, solo el SEM del 4; lo impreso, toda su psicometría
    assert.deepEqual(tarjetasQueLleva(caso('04-instrumental'), 6).lleva, { 2: ['pdf'], 3: ['pdf'], 4: ['word', 'pdf'], 5: ['pdf'] }, 'la V de Aiken, el AFE y la invarianza, solo en lo impreso');
    assert.deepEqual(tarjetasQueLleva(caso('02-comparativo'), 4), { antes: [3], conAnalisis: [3], despues: [], descargas: ['texto', 'pdf'], lleva: { 3: ['pdf'] }, deMas: {}, queDeja: {} }, 'la comparación del paso 3, que hace también su análisis, solo en lo impreso (y el paso 4, una χ², sin Word)');
    assert.deepEqual(pasos(tarjetasQueLleva(caso('02-comparativo'), 3)), nada, 'el paso 3 lleva su propia comparación (la hace él): no es de otro paso');
    assert.deepEqual(pasos(tarjetasQueLleva(caso('02-comparativo'), 2)), { antes: [], conAnalisis: [], despues: [3] }, 'la del paso 3, si ya se hizo');
    assert.deepEqual([2, 3].map(n => pasos(tarjetasQueLleva(caso('03-predictivo'), n))), [nada, nada]);
    assert.deepEqual(pasos(tarjetasQueLleva(caso('01-correlacional'), 3)), nada);
});

test('(2027.01.05, revisión) la comparación de grupos con su ANCOVA o su MANOVA va también en el Word, hasta el siguiente «Ejecutar análisis»; (2027.01.07) lo que dejaría de más un paso hecho después, acción por acción', () => {
    const a = (/** @type {string} */ accion, datos = {}) => ({ accion, datos });
    const cg = (datos = {}) => a('compararGrupos', { grupo: 'G', numerica: 'A', ...datos });
    // lo que lleva cada una (la tarjeta: comparacion-grupos.js; el capítulo: exportador-word.js)
    assert.deepEqual(descargasQueLleva(cg()), ['pdf'], 'sola, en lo impreso (el Word rehace la comparación con las variables del análisis)');
    assert.deepEqual(descargasQueLleva(cg({ covariable: 'B' })), ['word', 'pdf'], 'con su ANCOVA, también en el Word');
    assert.deepEqual(descargasQueLleva(cg({ adicionales: ['B', 'C'] })), ['word', 'pdf'], 'con su MANOVA, también');
    assert.deepEqual(descargasQueLleva(cg({ covariable: 'A', adicionales: ['A'] })), ['pdf'], 'la variable que compara no cuenta (la tarjeta no la usa)');
    assert.deepEqual(descargasQueLleva(cg({ covariable: '', adicionales: [] })), ['pdf']);
    assert.deepEqual(loQueBorraOtroAnalisis(cg({ covariable: 'B' })), ['word'], 'otro análisis se lleva la ANCOVA del Word (olvidarAnalisisAnterior)');
    assert.deepEqual(loQueBorraOtroAnalisis(a('ajustarSEM', VALIDOS.ajustarSEM)), [], 'el SEM, no');
    // (2027.01.07) y qué es, en palabras (para el aviso)
    assert.equal(queBorraOtroAnalisis(cg({ covariable: 'B' })), 'la ANCOVA');
    assert.equal(queBorraOtroAnalisis(cg({ adicionales: ['B', 'C'] })), 'el MANOVA');
    assert.equal(queBorraOtroAnalisis(cg({ covariable: 'B', adicionales: ['C'] })), 'la ANCOVA y el MANOVA');
    assert.equal(queBorraOtroAnalisis(cg({ covariable: 'A', adicionales: ['A'] })), '', 'sin ellos, nada');
    assert.equal(queBorraOtroAnalisis(a('ajustarSEM', VALIDOS.ajustarSEM)), '');
    const semDe = (/** @type {string | undefined} */ etiqueta) => a('ajustarSEM', { sintaxis: 'F =~ a + b + c', ...(etiqueta ? { etiqueta } : {}) });
    const todas = /** @type {const} */ (['word', 'texto', 'pdf']);
    /** Un caso de pruebas que cumple las reglas de la guía (reglas.js), como los que escribe el generador. */
    const caso = (/** @type {any[][]} */ guiones, hasta = guiones.length - 1) => {
        const e = /** @type {any} */ ({ pasos: guiones.map((_, i) => `p${i + 1}`), repetir: { desde: 2, hasta, nota: '' }, guiones });
        assert.deepEqual(loQueNoCumple(e), [], 'un caso que cumple las reglas');
        return e;
    };
    const correlacion = a('analizar', { tipo: 'correlacion', variables: ['A', 'B'] });
    const capitulo = a('exportarAnalisis', { word: true }), sinWord = a('exportarAnalisis', { word: false });
    const base = [a('usarBaseDelSimulador')], guardar = [a('guardarProyecto')];
    // el análisis del paso de las descargas se lleva del Word la ANCOVA de antes: la tarjeta sigue en lo impreso; hecha ahora
    // (tras él), quedaría en su Word: de más (deMas), y ese paso hay que repetirlo después
    const enElPaso = caso([base, [cg({ covariable: 'B' })], [correlacion, capitulo], guardar]);
    assert.deepEqual(tarjetasQueLleva(enElPaso, 3).lleva, { 2: ['pdf'] });
    assert.deepEqual(tarjetasQueLleva(enElPaso, 3).deMas, { 2: ['word'] }, 'hecha ahora, la ANCOVA quedaría en el Word');
    assert.deepEqual(tarjetasQueLleva(enElPaso, 3).queDeja, { 2: 'la ANCOVA' });
    assert.deepEqual(loQueDejaEn(enElPaso, 2, [], 3, [...todas]), ['pdf']);
    assert.deepEqual(loQueDejaDeMas(enElPaso, 2, [], 3, [...todas]), { ds: ['word'], que: 'la ANCOVA' });
    assert.deepEqual(loQueDejaDeMas(enElPaso, 2, [], 3, ['texto', 'pdf']), { ds: [], que: '' }, 'unas descargas sin el Word: nada de más');
    // con lo que hacen los pasos de en medio (aquí, el análisis del 3 antes de las descargas del 4)
    const enMedio = caso([base, [cg({ covariable: 'B' })], [correlacion], [capitulo], guardar], 3);
    assert.deepEqual([loQueDejaEn(enMedio, 2, [3], 4, [...todas]), loQueDejaEn(enMedio, 2, [], 4, [...todas])], [['pdf'], ['word', 'pdf']], 'el análisis de en medio se lleva la ANCOVA del Word');
    assert.deepEqual([loQueDejaDeMas(enMedio, 2, [3], 4, [...todas]), loQueDejaDeMas(enMedio, 2, [], 4, [...todas])], [{ ds: ['word'], que: 'la ANCOVA' }, { ds: [], que: '' }]);
    // y con lo que la sigue en su mismo paso (un análisis después de ella se la lleva; uno antes, no)
    const trasElla = caso([base, [cg({ covariable: 'B' }), correlacion], [capitulo], guardar], 2), antesDeElla = caso([base, [correlacion, cg({ covariable: 'B' })], [capitulo], guardar], 2);
    assert.deepEqual([loQueDejaEn(trasElla, 2, [], 3, [...todas]), loQueDejaEn(antesDeElla, 2, [], 3, [...todas])], [['pdf'], ['word', 'pdf']]);
    // (revisión) también si sus descargas están en un paso opcional de después (como en el caso 1): todo el paso, con su análisis
    const alFinal = caso([base, [cg({ adicionales: ['B'] })], [correlacion], [capitulo], guardar], 3);
    assert.deepEqual(tarjetasQueLleva(alFinal, 3).descargas, ['word', 'texto', 'pdf'], 'las del paso 4, del análisis del 3');
    assert.deepEqual(tarjetasQueLleva(alFinal, 3).lleva, { 2: ['pdf'] }, 'el análisis del paso 3 se lleva el MANOVA del 2 (en la 2027.01.05, no lo miraba)');
    assert.deepEqual([tarjetasQueLleva(alFinal, 3).deMas, tarjetasQueLleva(alFinal, 3).queDeja], [{ 2: ['word'] }, { 2: 'el MANOVA' }]);
    // en su mismo paso: con su propio análisis tras ella, se va; uno de esos pasos va en conAnalisis (no en deMas)
    const enElMismo = caso([base, [cg({ covariable: 'B' }), correlacion, sinWord], [correlacion, capitulo], guardar]);
    assert.deepEqual(tarjetasQueLleva(enElMismo, 3).lleva, { 2: ['pdf'] });
    assert.deepEqual([tarjetasQueLleva(enElMismo, 3).conAnalisis, tarjetasQueLleva(enElMismo, 3).deMas], [[2], {}]);
    const antesEnElMismo = caso([base, [correlacion, cg({ covariable: 'B' }), sinWord], [correlacion, capitulo], guardar]);
    assert.deepEqual(tarjetasQueLleva(antesEnElMismo, 3).lleva, { 2: ['pdf'] }, 'con su análisis antes de ella, el del paso 3 se la lleva');
    assert.deepEqual([tarjetasQueLleva(antesEnElMismo, 3).conAnalisis, tarjetasQueLleva(antesEnElMismo, 3).deMas], [[2], {}], 'hecho ahora la dejaría, pero ya se repite este por su propio análisis');
    // sin la ANCOVA, nada de más
    const sinCovariable = caso([base, [cg()], [correlacion, capitulo], guardar]);
    assert.deepEqual([tarjetasQueLleva(sinCovariable, 3).lleva, tarjetasQueLleva(sinCovariable, 3).deMas, tarjetasQueLleva(sinCovariable, 3).queDeja], [{ 2: ['pdf'] }, {}, {}]);
    // (2027.01.07, revisión) con el SEM en su mismo paso, que el Word sí lleva en el caso: la ANCOVA, de más igual. En la
    // 2027.01.06 se miraba por descarga, con todo el paso junto (el Word ya lo llevaba): el aviso decía «hazlo antes de
    // descargarlos», y hecho así el Word llevaba la ANCOVA (lo halló la revisión)
    const conSuSEM = caso([base, [semDe('Modelo alternativo'), semDe('Modelo final'), cg({ covariable: 'B' })], [correlacion, capitulo], guardar]);
    const t = tarjetasQueLleva(conSuSEM, 3);
    assert.deepEqual(t, { antes: [2], conAnalisis: [], despues: [], descargas: [...todas], lleva: { 2: ['word', 'pdf'] }, deMas: { 2: ['word'] }, queDeja: { 2: 'la ANCOVA' } });
    assert.equal(finDelPaso(3, ['El análisis estadístico'], true, { sinHacer: [2], enSinHacer: porDescarga([2], t.lleva), deMas: porDescarga([2], t.deMas), queDeja: t.queDeja, plegada: false }), 'Listo: paso 3 hecho (el análisis estadístico). Sus descargas son tuyas: te las dejo señaladas. Ojo: el Word y lo impreso (el PDF) llevan también lo del paso 2, que no está marcado como hecho; si no lo hiciste, hazlo y después repite este (el análisis de este quita del Word la ANCOVA del paso 2), o no serán los del caso («Hazlo todo por mí» hace todos los pasos en orden).');
    // uno posterior (si ya se hizo): el análisis del paso, antes de sus descargas, también se la lleva
    const posterior = caso([base, [correlacion, capitulo], [cg({ covariable: 'B' })], [correlacion, sinWord], guardar]);
    assert.deepEqual(tarjetasQueLleva(posterior, 2).lleva, { 3: ['pdf'] });
    assert.deepEqual(loDeDespues(posterior, [2, 3, 4], [2]), { despuesDe: { 2: [3] }, enDespuesDe: { 2: { pdf: [3] } } });
    assert.deepEqual(loDeDespues(posterior, [2, 3, 4], []), { despuesDe: {}, enDespuesDe: {} });
    const conSem = caso([base, [correlacion, capitulo], [a('ajustarSEM', VALIDOS.ajustarSEM)], [cg({ covariable: 'B' })], [correlacion, capitulo], guardar]);
    assert.deepEqual(loDeDespues(conSem, [2, 3, 4, 5], [2]), { despuesDe: { 2: [3, 4] }, enDespuesDe: { 2: { word: [3], pdf: [3, 4] } } }, 'el SEM del 3, en el Word y en lo impreso; la comparación del 4, solo en lo impreso');
    assert.deepEqual(loDeDespues(conSem, [2, 3, 5], [2]), { despuesDe: { 2: [3] }, enDespuesDe: { 2: { word: [3], pdf: [3] } } }, '(2027.01.08) lo de un paso que no se hizo (el 4) no cuenta, tampoco en cada descarga');
    // (2027.01.07, revisión) lo que la 2027.01.06 contaba con reemplazaA (una tarjeta que vuelve a calcular, el SEM de su mismo
    // papel en otro paso) y con lo hecho tras un paso de después: casos que ya no cumplen las reglas, y la página no los lee
    const reglasDe = (/** @type {any[][]} */ guiones, hasta = guiones.length - 1) => loQueNoCumple({ pasos: guiones.map((_, i) => `p${i + 1}`), repetir: { desde: 2, hasta }, guiones }).map(m => m.regla);
    assert.deepEqual(reglasDe([base, [cg({ covariable: 'B' })], [cg()], [correlacion, capitulo], guardar]), ['cadaTarjetaUnaVez'], 'dos comparaciones de grupos');
    assert.deepEqual(reglasDe([base, [cg({ covariable: 'B' }), cg()], [correlacion, capitulo], guardar]), ['cadaTarjetaUnaVez'], 'también en un mismo paso');
    assert.deepEqual(reglasDe([base, [correlacion, capitulo, cg({ grupo: 'H' })], guardar]), ['nadaTrasLasDescargas'], 'una tarjeta tras las descargas');
    assert.deepEqual(reglasDe([base, [a('calcularAFE', VALIDOS.calcularAFE)], [a('calcularAFE', VALIDOS.calcularAFE)], [correlacion, capitulo], guardar]), ['cadaTarjetaUnaVez'], 'dos AFE');
    assert.deepEqual(reglasDe([base, [semDe('Modelo final')], [semDe('Modelo final')], [correlacion, capitulo], guardar]), ['elSEMEnUnPaso'], 'el SEM del mismo papel, en otro paso');
    assert.deepEqual(reglasDe([base, [semDe('Modelo alternativo')], [semDe('Modelo final')], [correlacion, capitulo], guardar]), ['elSEMEnUnPaso'], 'y el de otro papel (lo halló la revisión: hecho el 2 después, el Word daba el alternativo)');
    assert.deepEqual(reglasDe([base, [correlacion, capitulo], [cg()], [cg({ covariable: 'B' })], guardar]), ['cadaTarjetaUnaVez'], 'dos después');
    assert.deepEqual(reglasDe([base, [correlacion, capitulo], [cg()], [cg({ covariable: 'B' })], [correlacion, capitulo], guardar]), ['cadaTarjetaUnaVez']);
});

test('(2027.01.07, revisión) las reglas de los guiones de un caso (reglas.js): qué no cumple, paso a paso; los casos de ejemplos/, ninguna', () => {
    const a = (/** @type {string} */ accion, datos = {}) => ({ accion, datos });
    const correlacion = a('analizar', { tipo: 'correlacion', variables: ['A', 'B'] });
    const capitulo = a('exportarAnalisis', { word: true });
    const base = [a('usarBaseDelSimulador')], describir = a('describirInvestigacion', VALIDOS.describirInvestigacion), guardar = [a('guardarProyecto')];
    const sem = (/** @type {string | undefined} */ etiqueta) => a('ajustarSEM', { sintaxis: 'F =~ a + b + c', ...(etiqueta ? { etiqueta } : {}) });
    const invDelSEM = a('evaluarInvarianza', { grupo: 'G', delSEM: true });
    /** @param {any[][]} guiones @param {{ desde?: number, hasta?: number }} [r] */
    const caso = (guiones, { desde = 2, hasta = guiones.length - 1 } = {}) => /** @type {any} */ ({ pasos: guiones.map((_, i) => `p${i + 1}`), repetir: { desde, hasta, nota: '' }, guiones });
    /** Lo que no cumple: «paso:regla». @param {any[][]} guiones @param {{ desde?: number, hasta?: number }} [r] */
    const reglas = (guiones, r) => loQueNoCumple(caso(guiones, r)).map(m => `${m.paso}:${m.regla}`);
    // los que las cumplen
    assert.deepEqual(reglas([[...base, describir], [correlacion, capitulo], guardar]), []);
    assert.deepEqual(reglas([base, [describir], [correlacion], [capitulo], guardar], { desde: 3, hasta: 3 }), [], 'el caso 1: las descargas en uno opcional, tras el análisis del último que se repite');
    assert.deepEqual(reglas([base, [sem('Modelo alternativo'), sem('Modelo final'), invDelSEM], [correlacion, capitulo], guardar]), [], 'el SEM en un paso, cada papel una vez; la invarianza con su modelo, tras él');
    assert.deepEqual(reglas([base, [correlacion, capitulo, a('guardarProyecto')], guardar]), ['2:guardarAlFinal'], '«Guardar proyecto», solo en los opcionales del final (lo que guarda es lo de la página)');
    assert.deepEqual(loQueNoCumple({ pasos: ['p1'], repetir: { desde: 1, hasta: 1 } }), [], 'sin guiones, nada que cumplir');
    // cada paso, con lo suyo
    assert.deepEqual(reglas([[...base, correlacion], [correlacion, capitulo], guardar]), ['1:soloLoQueTraeElProyecto'], 'en uno que trae el proyecto, solo eso');
    for (const accion of LO_QUE_TRAE_EL_PROYECTO) assert.deepEqual(reglas([base, [a(accion, VALIDOS[accion]), correlacion, capitulo], guardar]), ['2:loQueTraeElProyectoAntes'], `${accion}, solo en los de antes (repetido, cambiaría lo que el caso trae)`);
    assert.deepEqual(reglas([base, [a('guardarProyecto')], guardar], { hasta: 2 }), ['2:conAnalisis', '2:guardarAlFinal'], 'uno que se repite, con algún análisis');
    assert.deepEqual(reglas([base, [correlacion], [capitulo, a('guardarProyecto')], guardar], { hasta: 2 }), [], 'en uno opcional, las descargas y guardar el proyecto');
    assert.deepEqual(reglas([base, [correlacion], [correlacion]], { hasta: 2 }), ['3:opcionalSinAnalisis'], 'uno opcional, sin');
    assert.deepEqual(reglas([base, [], guardar]), ['2:conGuion']);
    assert.deepEqual(loQueNoCumple({ pasos: ['p1', 'p2'], repetir: { desde: 2, hasta: 2 }, guiones: [base] }).map(m => m.regla), ['unGuionPorPaso']);
    // las descargas del análisis: tras su análisis, una vez y al final de su paso
    assert.deepEqual(reglas([base, [correlacion], [sem(), capitulo], guardar]), ['3:descargasTrasSuAnalisis'], 'las de un paso sin su propio análisis serían las del 2');
    assert.deepEqual(reglas([base, [correlacion], [sem()], [capitulo]], { hasta: 3 }), ['4:descargasTrasSuAnalisis'], 'en uno opcional, si el último que se repite no analiza');
    assert.deepEqual(reglas([base, [capitulo, correlacion], guardar]), ['2:descargasTrasSuAnalisis', '2:nadaTrasLasDescargas'], 'antes de su análisis (que va después de ellas)');
    assert.deepEqual(reglas([base, [correlacion, capitulo, capitulo], guardar]), ['2:unasDescargas']);
    assert.deepEqual(reglas([base, [correlacion, capitulo, a('compararGrupos', VALIDOS.compararGrupos)], guardar]), ['2:nadaTrasLasDescargas'], 'una tarjeta tras ellas (lo halló la revisión: «Hazlo por mí» la hacía y no iba en las del caso)');
    assert.deepEqual(reglas([base, [correlacion, capitulo, correlacion], guardar]), ['2:nadaTrasLasDescargas'], 'u otro análisis');
    // (2027.01.08, revisión) con el capítulo de Word, solo tras una correlación de dos variables (tras otro análisis, la página no lo tiene)
    const comparacion = a('analizar', { tipo: 'comparacion', variables: ['A', 'G'] }), asociacion = a('analizar', { tipo: 'asociacion', variables: ['G', 'H'] });
    const matriz = a('analizar', { tipo: 'correlacion', variables: ['A', 'B', 'C'] }), sinWord = a('exportarAnalisis', { word: false }), conWordPorOmision = a('exportarAnalisis', { carpeta: '1-x' });
    assert.deepEqual([comparacion, asociacion, matriz, correlacion, a('analizar', VALIDOS.analizar)].map(tieneCapitulo), [false, false, false, true, false], 'solo la correlación de dos variables (VALIDOS.analizar tiene tres)');
    assert.equal(tieneCapitulo(a('analizar', { tipo: 'correlacion', variables: ['A', 'B'], regresion: { dependiente: 'B', predictores: ['A'] } })), true, 'con su regresión, también');
    // (2027.01.09, revisión) la matriz, como la decide la página: una variable adicional que no es una de las dos primeras (la
    // 2027.01.08 contaba las del guion: con ['A', 'B', 'A'], la página hace la correlación de A y B, con su capítulo)
    assert.deepEqual([['A', 'B', 'A'], ['A', 'B', 'B', 'A'], ['A', 'B', 'A', 'C'], ['A', 'B', 'C', 'C']].map(variables => tieneCapitulo(a('analizar', { tipo: 'correlacion', variables }))), [true, true, false, false]);
    assert.equal(accionValida(a('analizar', { tipo: 'correlacion', variables: ['A', 'B', 'A'] })), true, 'y la página la hace');
    assert.deepEqual(reglas([base, [a('analizar', { tipo: 'correlacion', variables: ['A', 'B', 'A'] }), capitulo], guardar]), [], 'con su capítulo');
    assert.deepEqual(reglas([base, [a('analizar', { tipo: 'correlacion', variables: ['A', 'B', 'B', 'C'] }), capitulo], guardar]), ['2:wordConSuCapitulo'], 'con una que no es de las dos, una matriz');
    assert.equal(tieneCapitulo(a('analizar', { tipo: 'comparacion', variables: ['A', 'B', 'A'] })), false, 'y una comparación, aunque se repita una');
    for (const [que, analisis] of /** @type {Array<[string, any]>} */ ([['una comparación', comparacion], ['una asociación', asociacion], ['una matriz', matriz]])) {
        assert.deepEqual(reglas([base, [analisis, capitulo], guardar]), ['2:wordConSuCapitulo'], que);
        assert.deepEqual(reglas([base, [analisis, conWordPorOmision], guardar]), ['2:wordConSuCapitulo'], `${que}, con el Word por omisión`);
        assert.deepEqual(reglas([base, [analisis, sinWord], guardar]), [], `${que}, sin el Word`);
        assert.deepEqual(reglas([base, [analisis], [capitulo]], { hasta: 2 }), ['3:wordConSuCapitulo'], `${que}, en uno opcional`);
    }
    assert.deepEqual(reglas([base, [comparacion, correlacion, capitulo], guardar]), [], 'el último análisis antes de ellas es el que cuenta');
    assert.deepEqual(reglas([base, [correlacion, comparacion, capitulo], guardar]), ['2:wordConSuCapitulo']);
    assert.deepEqual(loQueNoCumple(caso([base, [asociacion, capitulo], guardar])).map(m => m.texto), ['el paso 2 baja el capítulo de Word tras una asociación (χ²), que no lo tiene (solo una correlación de dos variables): sus descargas van sin él («word: false»)']);
    assert.deepEqual(loQueNoCumple(caso([base, [comparacion, capitulo], guardar])).map(m => m.texto), ['el paso 2 baja el capítulo de Word tras una comparación de grupos, que no lo tiene (solo una correlación de dos variables): sus descargas van sin él («word: false»)']);
    assert.deepEqual(loQueNoCumple(caso([base, [comparacion], [matriz, capitulo], guardar])).map(m => m.texto), ['el paso 3 baja el capítulo de Word tras una matriz de correlaciones (tres o más variables), que no lo tiene (solo una correlación de dos variables): sus descargas van sin él («word: false»)']);
    // cada tarjeta, una vez en el caso
    for (const accion of TARJETAS_DE_UNA_VEZ) {
        assert.deepEqual(reglas([base, [a(accion, VALIDOS[accion])], [correlacion, a(accion, VALIDOS[accion]), capitulo], guardar]), ['3:cadaTarjetaUnaVez'], accion);
        assert.deepEqual(reglas([base, [a(accion, VALIDOS[accion]), correlacion, capitulo], guardar]), [], `${accion}, una vez`);
    }
    // el SEM, en un paso y cada papel una vez; la invarianza con su modelo, tras él
    assert.deepEqual(reglas([base, [sem('Modelo alternativo')], [sem('Modelo final'), correlacion, capitulo], guardar]), ['3:elSEMEnUnPaso']);
    assert.deepEqual(reglas([base, [sem(), sem('Modelo inicial'), correlacion, capitulo], guardar]), ['2:cadaPapelUnaVez'], 'sin papel, el inicial');
    assert.deepEqual(reglas([base, [invDelSEM, sem()], [correlacion, capitulo], guardar]), ['2:invarianzaTrasSuSEM'], 'antes de él');
    assert.deepEqual(reglas([base, [sem()], [invDelSEM, correlacion, capitulo], guardar]), ['3:invarianzaTrasSuSEM'], 'en otro paso (el proyecto no guarda su sintaxis)');
    assert.deepEqual(reglas([base, [a('evaluarInvarianza', VALIDOS.evaluarInvarianza)], [correlacion, capitulo], guardar]), [], 'con su propio modelo, donde sea');
    // varias a la vez, en el orden de los pasos; y lo que dicen
    assert.deepEqual(reglas([base, [sem('Modelo final'), sem('Modelo final')], [capitulo], [sem()]], { hasta: 3 }), ['2:cadaPapelUnaVez', '3:conAnalisis', '3:descargasTrasSuAnalisis', '4:opcionalSinAnalisis', '4:elSEMEnUnPaso']);
    assert.deepEqual(loQueNoCumple(caso([base, [a('compararGrupos', VALIDOS.compararGrupos)], [a('compararGrupos', VALIDOS.compararGrupos), sem('Modelo final'), sem('Modelo final')], [sem(), correlacion, capitulo], guardar])).map(m => m.texto), [
        'el paso 3 ajusta más de una vez el «Modelo final»: la comparación de modelos tiene uno por papel, y el segundo reemplaza al primero',
        'compararGrupos calcula 2 veces (en los pasos 2 y 3): en la página, cada vez reemplaza a la anterior',
        'el SEM se ajusta en los pasos 3 y 4: sus modelos van en un solo paso',
    ]);
    assert.deepEqual(loQueNoCumple(caso([base, [correlacion], [sem(), capitulo], guardar])).map(m => m.texto), ['las descargas del análisis del paso 3 no van tras un análisis de su mismo paso: serían las del análisis de otro paso']);
    assert.deepEqual(loQueNoCumple(caso([base, [a('calcularAFE', VALIDOS.calcularAFE), a('calcularAFE', VALIDOS.calcularAFE), correlacion, capitulo], guardar])).map(m => m.texto), ['calcularAFE calcula 2 veces (en el paso 2): en la página, cada vez reemplaza a la anterior'], 'dos veces en un paso: el paso, una vez');
    assert.deepEqual(reglas([base, [a('calcularAFE', VALIDOS.calcularAFE)], [a('calcularAFE', VALIDOS.calcularAFE)], [correlacion, capitulo, correlacion], guardar]), ['3:cadaTarjetaUnaVez', '4:nadaTrasLasDescargas'], 'en el orden de los pasos, también las que se ven al final');
    assert.deepEqual(loQueNoCumple(caso([base, [correlacion], [sem()], [capitulo]], { hasta: 3 })).map(m => m.texto), ['las descargas del análisis del paso 4 no van tras un análisis del último que se repite (el 3): serían las del análisis de otro paso']);
    // los casos de ejemplos/, todas
    if (!fs.existsSync(path.join(ejemplos, 'indice.json'))) return;
    for (const e of JSON.parse(fs.readFileSync(path.join(ejemplos, 'indice.json'), 'utf8')).casos) assert.deepEqual(loQueNoCumple(e), [], e.carpeta);
});

test('(2027.01.05) lo que dice «Hazlo todo por mí» de los casos de ejemplos/: el 2, que lo impreso del paso 2 llevaría la comparación del 3', { skip: !fs.existsSync(path.join(ejemplos, 'indice.json')) }, () => {
    const casos = JSON.parse(fs.readFileSync(path.join(ejemplos, 'indice.json'), 'utf8')).casos;
    const caso = (/** @type {string} */ c) => casos.find((/** @type {any} */ x) => x.carpeta === c);
    const e2 = caso('02-comparativo');
    const tras = descargasTras(e2, pasosQueSeHacen(e2));
    assert.deepEqual(tras.perdidos, [2, 3]);
    assert.deepEqual(loDeDespues(e2, pasosQueSeHacen(e2), tras.perdidos), { despuesDe: { 2: [3], 3: [] }, enDespuesDe: { 2: { pdf: [3] }, 3: {} } });
    for (const c of ['01-correlacional', '03-predictivo', '04-instrumental', '05-estructural']) {
        const e = caso(c), pasos = pasosQueSeHacen(e);
        const { despuesDe, enDespuesDe } = loDeDespues(e, pasos, descargasTras(e, pasos).perdidos);
        assert.deepEqual(Object.values(enDespuesDe).filter(x => Object.keys(x).length), [], `${c}: nada (${JSON.stringify(despuesDe)})`);
    }
});

test('las descargas que valen tras hacer unos pasos: un análisis reemplaza al anterior; una tarjeta, solo a sí misma; tras el último, las de después (descargasTras no supone las reglas: aquí, dos AFE)', () => {
    const a = (/** @type {string} */ accion, datos = {}) => ({ accion, datos });
    const analizar = a('analizar', { tipo: 'correlacion', variables: ['A', 'B'] });
    const exportar = (/** @type {boolean} */ word) => a('exportarAnalisis', { word });
    const e = /** @type {any} */ ({
        pasos: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'], repetir: { desde: 2, hasta: 5, nota: '' },
        guiones: [[a('usarBaseDelSimulador')], [analizar, exportar(true)], [a('calcularAFE', { conjunto: 'X' })], [analizar, exportar(false)], [a('calcularAFE', { conjunto: 'Y' }), analizar], [exportar(true), a('guardarProyecto')]],
    });
    /** Los selectores que se señalan, por paso. @param {{ vigentes: Array<{ n: number, ops: any[] }> }} r */
    const senalados = r => r.vigentes.map(v => [v.n, v.ops.filter(o => o.op === 'senalar').map(o => o.selector)]);
    let r = descargasTras(e, [2]);
    assert.deepEqual(senalados(r), [[2, ['#btnExportarWord', '#btnDescargarResultados', '#btnImprimirAnalizador']]]);
    assert.deepEqual(r.perdidos, []);
    r = descargasTras(e, [2, 3, 4]);
    assert.deepEqual(senalados(r), [[3, ['#afeCSV', '#afeWord']], [4, ['#btnDescargarResultados', '#btnImprimirAnalizador']]], 'el análisis del paso 4 reemplaza al del 2; el AFE sigue');
    assert.deepEqual(r.perdidos, [2]);
    r = descargasTras(e, [2, 3, 4, 5]);
    assert.deepEqual(senalados(r), [[5, ['#afeCSV', '#afeWord']], [6, ['#btnExportarWord', '#btnDescargarResultados', '#btnImprimirAnalizador']]], 'el AFE del 5 reemplaza al del 3; tras el último que se repite, las descargas del 6 (son del análisis del 5)');
    assert.deepEqual(r.perdidos, [2, 3, 4]);
    assert.deepEqual(senalados(descargasTras(e, [4])), [[4, ['#btnDescargarResultados', '#btnImprimirAnalizador']]], 'un paso que no es el último: sin las de después');
    assert.deepEqual(descargasTras(e, [3]).vigentes.map(v => v.ops[0].op), ['ir'], 'cada una, con su sección');
    // dos descargas del mismo paso (las reglas no lo admiten): las dos, juntas
    const dosEnUnPaso = /** @type {any} */ ({ ...e, guiones: [[a('usarBaseDelSimulador')], [analizar, exportar(false), exportar(true)], [], [], [], []] });
    assert.deepEqual(senalados(descargasTras(dosEnUnPaso, [2])), [[2, ['#btnDescargarResultados', '#btnImprimirAnalizador', '#btnExportarWord', '#btnDescargarResultados', '#btnImprimirAnalizador']]]);
    // un análisis sin descargas propias también reemplaza al anterior: las de este ya no valen
    const sinDescargas = /** @type {any} */ ({ ...e, repetir: { desde: 2, hasta: 6, nota: '' }, guiones: [[a('usarBaseDelSimulador')], [analizar, exportar(true)], [analizar], [], [], []] });
    assert.deepEqual(descargasTras(sinDescargas, [2, 3]), { vigentes: [], perdidos: [2] });
    // (2027.01.07, revisión) las de un mismo análisis en dos pasos (el último que se repite y uno opcional): valen las dos; en la
    // 2027.01.06, «Hazlo todo por mí» decía que las del primero ya no estaban
    const dosVeces = /** @type {any} */ ({ pasos: ['p1', 'p2', 'p3', 'p4'], repetir: { desde: 2, hasta: 2, nota: '' }, guiones: [[a('usarBaseDelSimulador')], [analizar, exportar(false)], [exportar(true)], [a('guardarProyecto')]] });
    assert.deepEqual(loQueNoCumple(dosVeces), [], 'un caso que cumple las reglas');
    r = descargasTras(dosVeces, [2]);
    assert.deepEqual(senalados(r), [[2, ['#btnDescargarResultados', '#btnImprimirAnalizador']], [3, ['#btnExportarWord', '#btnDescargarResultados', '#btnImprimirAnalizador']]]);
    assert.deepEqual(r.perdidos, []);
    assert.deepEqual(tarjetasQueLleva(dosVeces, 2).descargas, ['word', 'texto', 'pdf'], 'las del análisis del paso 2: las suyas y las del 3');
    // y un paso cuyas descargas del análisis ya no están es de los perdidos aunque sigan las de su tarjeta (en la 2027.01.06 no:
    // «Hazlo todo por mí» no decía que las de su análisis ya no estaban)
    const conSuTarjeta = /** @type {any} */ ({ pasos: ['p1', 'p2', 'p3', 'p4'], repetir: { desde: 2, hasta: 3, nota: '' }, guiones: [[a('usarBaseDelSimulador')], [a('calcularAFE', { conjunto: 'X' }), analizar, exportar(true)], [analizar, exportar(true)], [a('guardarProyecto')]] });
    assert.deepEqual(loQueNoCumple(conSuTarjeta), [], 'un caso que cumple las reglas');
    r = descargasTras(conSuTarjeta, [2, 3]);
    assert.deepEqual(senalados(r), [[2, ['#afeCSV', '#afeWord']], [3, ['#btnExportarWord', '#btnDescargarResultados', '#btnImprimirAnalizador']]]);
    assert.deepEqual(r.perdidos, [2], 'las del análisis del 2 ya no están, aunque sigan las de su AFE');
    // «Guardar proyecto» no es una tarjeta: otro, después, no se lleva el de antes (las reglas lo dejan en los opcionales)
    const conGuardar = /** @type {any} */ ({ pasos: ['p1', 'p2', 'p3'], repetir: { desde: 2, hasta: 3, nota: '' }, guiones: [[a('usarBaseDelSimulador')], [analizar, a('guardarProyecto'), exportar(true)], [a('calcularAFE', { conjunto: 'X' }), a('guardarProyecto')]] });
    r = descargasTras(conGuardar, [2, 3]);
    assert.deepEqual([r.vigentes.map(v => [v.n, v.clave]), r.perdidos], [[[2, 'guardarProyecto'], [2, 'analisis'], [3, 'calcularAFE'], [3, 'guardarProyecto']], []]);
});

test('(2027.01.07, revisión) tras «Hazlo todo por mí», las descargas del análisis que siguen y llevan ya lo de un paso que hizo después: lo dice', () => {
    const a = (/** @type {string} */ accion, datos = {}) => ({ accion, datos });
    const correlacion = a('analizar', { tipo: 'correlacion', variables: ['A', 'B'] });
    const capitulo = a('exportarAnalisis', { word: true }), sinWord = a('exportarAnalisis', { word: false });
    const sem = (/** @type {string} */ etiqueta) => a('ajustarSEM', { sintaxis: 'F =~ a + b + c', etiqueta });
    const caso = (/** @type {any[][]} */ guiones, hasta = guiones.length - 1) => {
        const e = /** @type {any} */ ({ pasos: guiones.map((_, i) => `p${i + 1}`), repetir: { desde: 2, hasta, nota: '' }, guiones });
        assert.deepEqual(loQueNoCumple(e), [], 'un caso que cumple las reglas');
        return e;
    };
    const base = [a('usarBaseDelSimulador')], guardar = [a('guardarProyecto')];
    // el capítulo en el paso 2 y el SEM en el 3: el Word y lo impreso del 2, hecho el 3, llevan ya su SEM; y un AFE en el 4, lo impreso
    const e = caso([base, [correlacion, capitulo], [sem('Modelo alternativo'), sem('Modelo final')], [a('calcularAFE', VALIDOS.calcularAFE)], guardar]);
    const pasos = pasosQueSeHacen(e), { vigentes, perdidos } = descargasTras(e, pasos);
    assert.deepEqual([vigentes.map(v => [v.n, v.clave]), perdidos], [[[2, 'analisis'], [4, 'calcularAFE']], []]);
    const ya = loQueYaLlevan(e, pasos, vigentes);
    assert.deepEqual(ya, { despuesDe: { 2: [3, 4] }, enDespues: { word: [3], pdf: [3, 4] } });
    assert.equal(finDeTodo(pasos, { vigentes: [...new Set(vigentes.map(v => v.n))], perdidos, senaladas: true, yaLlevan: ya }), 'Listo: se repitieron los pasos 2 a 4, como en el caso. Te dejo señaladas sus descargas. De las del paso 2, el Word lleva también lo del paso 3, y lo impreso (el PDF), lo de los pasos 3 y 4, que en el caso vienen después: no serán los del caso (los del caso están en la pestaña «Ejemplos»).');
    assert.deepEqual(loQueYaLlevan(e, [2], descargasTras(e, [2]).vigentes), { despuesDe: {}, enDespues: {} }, 'sin hacer los de después, nada');
    // una comparación con covariable después: sin otro análisis que se la lleve, su ANCOVA va también en el Word
    const conAncova = caso([base, [correlacion, capitulo], [a('compararGrupos', { grupo: 'G', numerica: 'A', covariable: 'B' })], guardar]);
    assert.deepEqual(loQueYaLlevan(conAncova, [2, 3], descargasTras(conAncova, [2, 3]).vigentes), { despuesDe: { 2: [3] }, enDespues: { word: [3], pdf: [3] } });
    // con otro análisis después, las de antes ya no están (eso lo dicen los perdidos), y las del último, nada de después
    const dos = caso([base, [correlacion, sinWord], [a('calcularAFE', VALIDOS.calcularAFE)], [correlacion, capitulo], guardar]);
    const t2 = descargasTras(dos, [2, 3, 4]);
    assert.deepEqual([t2.perdidos, loQueYaLlevan(dos, [2, 3, 4], t2.vigentes)], [[2], { despuesDe: {}, enDespues: {} }]);
    // los casos de ejemplos/: nada (sus descargas del análisis van en el último paso con análisis, o con su tarjeta antes)
    if (!fs.existsSync(path.join(ejemplos, 'indice.json'))) return;
    for (const c of JSON.parse(fs.readFileSync(path.join(ejemplos, 'indice.json'), 'utf8')).casos) {
        const ps = pasosQueSeHacen(c);
        assert.deepEqual(loQueYaLlevan(c, ps, descargasTras(c, ps).vigentes), { despuesDe: {}, enDespues: {} }, c.carpeta);
    }
    // y el mensaje con varios pasos, y sin señalar
    assert.equal(finDeTodo([2, 3, 4], { vigentes: [2, 3], perdidos: [], senaladas: false, sinSenalar: 'Lo detuviste', yaLlevan: { despuesDe: { 2: [4], 3: [4] }, enDespues: { pdf: [4] } } }), 'Listo: se repitieron los pasos 2 a 4, como en el caso. No te señalé sus descargas: lo detuviste. De las de los pasos 2 y 3, lo impreso (el PDF) lleva también lo del paso 4, que en el caso viene después: no será el del caso (el del caso está en la pestaña «Ejemplos»).');
});
