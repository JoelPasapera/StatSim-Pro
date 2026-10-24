// @ts-check
// tests/unit/ejemplos-hazlo.test.js — (2027.01.03) «Hazlo por mí» por partes: los planes (src/ejemplos/hazlo/planes.js:
// cada acción de un guion, con sus datos comprobados, y sus operaciones, con los selectores fijos: del guion solo llegan
// valores), las esperas y su juicio (condiciones.js), el conductor de la página (conductor.js) sobre un DOM pequeño (lo que
// hace con cada control y lo que dice cuando algo falta) y lo que ofrece y dice la guía (sesion.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearEntorno } from '../ui/minidom.js';
import {
    NOMBRES_DE_ACCIONES, accionEjecutable, accionValida, archivosDeLaAccion, guionEjecutable, guionValido, planDe, senalesDe,
} from '../../src/ejemplos/hazlo/planes.js';
import { CONDICIONES, VEREDICTO, esCondicion } from '../../src/ejemplos/hazlo/condiciones.js';
import { Detenido, RITMO, ejecutarPlan, mostrarPlan } from '../../src/ejemplos/hazlo/conductor.js';
import {
    conGuiones, crearSesion, descargasTras, finConProblema, finDeMostrar, finDeTodo, finDelPaso, guionDe, listaDePasos, pasosQueSeHacen, seHace, seMuestra,
} from '../../src/ejemplos/hazlo/sesion.js';

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
        analizar: { tipo: 'correlacion', variables: [raro, raro, raro], regresion: { dependiente: raro, predictores: [raro, raro] } },
        compararGrupos: { grupo: raro, numerica: raro, covariable: raro, adicionales: [raro] },
        calcularAFE: { conjunto: raro, items: [raro] },
        calcularAiken: { minimo: 1, maximo: 4, criterios: [{ nombre: raro, archivo: 'a/b.csv' }] },
        evaluarInvarianza: { sintaxis: raro, grupo: raro },
        ajustarSEM: { sintaxis: raro, etiqueta: raro },
    };
    for (const [accion, d] of Object.entries(datos)) {
        const plan = planDe({ accion, datos: d });
        for (const o of plan.ops) for (const k of CAMPOS_DE_SELECTOR) {
            const v = /** @type {Record<string, unknown>} */ (o)[k];
            if (typeof v === 'string') assert.ok(!v.includes('btnBorrar'), `${accion}: ${o.op}.${k} = ${v}`);
        }
    }
});

test('los datos de una acción se comprueban: claves de más, tipos o valores que no son, rutas fuera del caso', () => {
    const malos = {
        'una acción que no existe': { accion: 'borrarTodo', datos: {} },
        'sin datos': { accion: 'analizar' },
        'con algo más que acción y datos': { accion: 'guardarProyecto', datos: {}, selector: '#x' },
        'datos con una clave de más': { accion: 'analizar', datos: { ...VALIDOS.analizar, selector: '#x' } },
        'otro tipo de análisis': { accion: 'analizar', datos: { tipo: 'borrar', variables: ['A', 'B'] } },
        'una sola variable': { accion: 'analizar', datos: { tipo: 'correlacion', variables: ['A'] } },
        'una variable vacía': { accion: 'analizar', datos: { tipo: 'correlacion', variables: ['A', ''] } },
        'otra prueba': { accion: 'analizar', datos: { tipo: 'correlacion', variables: ['A', 'B'], prueba: 'triple' } },
        'una regresión con claves de más': { accion: 'analizar', datos: { tipo: 'correlacion', variables: ['A', 'B'], regresion: { dependiente: 'B', predictores: ['A'], x: 1 } } },
        'una regresión sin predictores': { accion: 'analizar', datos: { tipo: 'correlacion', variables: ['A', 'B'], regresion: { dependiente: 'B', predictores: [] } } },
        'otro estimador': { accion: 'ajustarSEM', datos: { sintaxis: 'F =~ a', estimador: 'GLS' } },
        'una sintaxis que no es texto': { accion: 'ajustarSEM', datos: { sintaxis: 42 } },
        'réplicas con decimales': { accion: 'calcularAFE', datos: { replicas: 1.5 } },
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
    assert.equal(planDe({ accion: 'calcularAiken', datos: VALIDOS.calcularAiken }).ops.find(o => o.op === 'bloques')?.nombre, 'Un criterio');
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
    assert.equal(finDelPaso(2, ['El análisis estadístico'], false, 'Cambiaste de pestaña (este paso se hace en «Analizador»).'), 'Listo: paso 2 hecho (el análisis estadístico). No te señalé sus descargas: cambiaste de pestaña (este paso se hace en «Analizador»). Despliega la guía (▴) para seguir.');
    assert.equal(finDeTodo([2, 3, 4], { vigentes: [4], perdidos: [2, 3], senaladas: true }), 'Listo: se repitieron los pasos 2 a 4, como en el caso. Te dejo señaladas las descargas de lo que ves (las del paso 4). Cada análisis reemplaza al anterior en la página: las descargas de los pasos 2 y 3 ya no están; repítelos con su «Hazlo por mí» o bájalas hechas en la pestaña «Ejemplos».');
    assert.equal(finDeTodo([2, 3], { vigentes: [3], perdidos: [2], senaladas: true }), 'Listo: se repitieron los pasos 2 y 3, como en el caso. Te dejo señaladas las descargas de lo que ves (las del paso 3). Cada análisis reemplaza al anterior en la página: las descargas del paso 2 ya no están; repítelo con su «Hazlo por mí» o bájalas hechas en la pestaña «Ejemplos».');
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

test('las descargas que valen tras hacer unos pasos: un análisis reemplaza al anterior; una tarjeta, solo a sí misma; tras el último, las de después', () => {
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
    // un análisis sin descargas propias también reemplaza al anterior: las de este ya no valen
    const sinDescargas = /** @type {any} */ ({ ...e, repetir: { desde: 2, hasta: 6, nota: '' }, guiones: [[a('usarBaseDelSimulador')], [analizar, exportar(true)], [analizar], [], [], []] });
    assert.deepEqual(descargasTras(sinDescargas, [2, 3]), { vigentes: [], perdidos: [2] });
});
