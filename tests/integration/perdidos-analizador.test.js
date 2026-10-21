// @ts-check
// tests/integration/perdidos-analizador.test.js — (2026.12.18) valores perdidos en el Analizador: una sola conversión
// (core/data/celdas.js). Hasta la 2026.12.17 convivían cinco: +valor, que en la regresión, el SEM, la pestaña de grupos y las
// dos cribas convertía en 0 la celda vacía de un CSV; parseFloat, que leía «3ro» o «2024-05-01» como 3 y 2024; y tres
// estrictas locales. Además, el tipo de una columna se decidía por la primera fila, un NaN del Simulador formaba un grupo
// «NaN», la criba de objetivos descartaba una columna con un solo perdido y los totales de dimensión sumaban 0 por ítem
// perdido. La prueba central: un perdido es un perdido, venga como venga ('', NaN o null), y equivale a no tener el dato.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aNumero, esPerdido, primerValor, esColumnaNumerica, esColumnaTexto, esFecha, columnaNumerica, totalConProrrateo } from '../../src/core/data/celdas.js';

/** @type {any} */ let A, RM, CG, F, K, SD, SEM, G, D, INV, CARGA;
const cargar = async () => {
    if (A) return;
    A = (await import('../../src/analizador/estadistica.js')).AnalizadorEstadistico;
    RM = (await import('../../src/analizador/regresion.js')).RegresionMultiple;
    CG = (await import('../../src/analizador/comparacion-grupos.js')).ComparacionGrupos;
    F = (await import('../../src/analizador/fiabilidad.js')).Fiabilidad;
    K = (await import('../../src/analizador/criba-correlaciones.js')).CribaCorrelaciones;
    SD = (await import('../../src/analizador/criba-sociodemografica.js')).CribaSociodemografica;
    SEM = (await import('../../src/analizador/sem-motor.js')).SEM;
    G = await import('../../src/analizador/ui/graficos.js');
    D = await import('../../src/analizador/relaciones/diagnostico-forma.js');
    INV = await import('../../src/analizador/psicometria/invarianza.js');
    CARGA = await import('../../src/analizador/ui/carga.js');
};
const json = (/** @type {any} */ o) => JSON.stringify(o, (k, v) => (typeof v === 'number' && Number.isNaN(v) ? 'NaN' : v instanceof Map ? [...v.entries()] : v));

// base con perdidos en filas distintas de cada variable; `perdido` decide cómo llegan
function base(perdido, { sinFilas = null } = {}) {
    let s = 20261218 >>> 0; const u = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const nrm = () => Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u());
    const filas = [];
    for (let i = 0; i < 160; i++) {
        const z = nrm(), f = /** @type {Record<string, any>} */ ({ ID: i + 1, Sexo: u() < 0.5 ? 'F' : 'M', Grado: ['1ro', '2do', '3ro'][i % 3], Dimension_A: Math.round(20 + 4 * z + 3 * nrm()), Dimension_B: Math.round(18 + 3 * z + 3 * nrm()),
            General_X: +(50 + 10 * z + 5 * nrm()).toFixed(2), General_Y: +(40 + 6 * z + 6 * nrm()).toFixed(2), Edad: 18 + Math.floor(u() * 30) });
        for (let j = 1; j <= 5; j++) f['IT' + j] = Math.min(5, Math.max(1, Math.round(3 + 0.8 * z + nrm())));
        const tira = u();
        if (i === 0 || tira < 0.05) f.General_X = perdido;   // el PRIMER participante, también
        if (tira > 0.93) f.General_Y = perdido;
        if (i % 17 === 3) f.Dimension_A = perdido;
        if (i % 23 === 5) { f.IT2 = perdido; f.Sexo = perdido; }
        if (i % 29 === 7) { f.IT4 = perdido; f.IT5 = perdido; }
        if (i % 31 === 11) f.Sexo = perdido;   // el grupo falta en casos con los ítems completos
        if (!sinFilas || !sinFilas(f)) filas.push(f);
    }
    return filas;
}
function analizar() {
    const d = A.obtenerDatos(), pares = [{ columnaX: 'Dimension_A', columnaY: 'General_Y', prioridad: 1 }, { columnaX: 'Dimension_B', columnaY: 'General_X', prioridad: 1 }];
    SEM._ultimos.length = 0;
    const sem = SEM.ajustar('F =~ IT1 + IT2 + IT3 + IT4 + IT5', null, 'M');
    return {
        correlacion: A.calcularCorrelacion('General_X', 'General_Y'), chi: A.chiCuadradoIndependencia(d.map((/** @type {any} */ f) => f.Sexo), d.map((/** @type {any} */ f) => f.Grado)),
        matriz: RM.matrizCorrelaciones(['General_X', 'General_Y', 'Dimension_A'], ['X', 'Y', 'A']), regresion: RM.regresion('General_Y', ['General_X', 'Dimension_A'], 'Y', ['X', 'A']),
        avanzada: RM.regresionAvanzada('General_Y', ['General_X', 'Edad'], 'Y', ['X', 'E']), formas: RM.mejorModelo('General_X', 'General_Y', 'X', 'Y'),
        ancova: RM.ancova('Sexo', 'General_Y', 'General_X'), manova: RM.manova('Sexo', ['General_Y', 'General_X']), grupos: CG.analizar('Sexo', 'General_Y', 'S', 'Y'),
        fiabilidad: F.analizarGrupo(d, { nombre: 'E', items: ['IT1', 'IT2', 'IT3', 'IT4', 'IT5'] }), alfa: A.calcularAlfaCronbach(['IT1', 'IT2', 'IT3', 'IT4', 'IT5']),
        totales: A.calcularPuntajesTotalesDimension(['IT1', 'IT2', 'IT3', 'IT4', 'IT5']), criba: K.cribar(d, pares, A), socios: SD.analizar('General_X', 'General_Y', 'X', 'Y'),
        graficos: G.prepararDatosParaGraficos(d), forma: D.diagnosticarForma(d.map((/** @type {any} */ f) => f.General_X), d.map((/** @type {any} */ f) => f.General_Y), { B: 19 }).coeficientes,
        invarianza: INV.estadisticosPorGrupo(d, ['IT1', 'IT2', 'IT3', 'IT4'], 'Sexo'), sem: [sem.n, sem.chi2, sem.gl], numericas: CARGA.obtenerColumnasNumericas(d)
    };
}

test('núcleo: aNumero, esPerdido, el tipo de columna por su primer valor no perdido y la regla del 80 %', () => {
    for (const [v, x] of /** @type {[any, number][]} */ ([[3.5, 3.5], ['3,5', 3.5], [',5', 0.5], ['-0,75', -0.75], [' 7 ', 7], ['1e3', 1000], ['+2', 2], ['5.', 5], ['.25', 0.25]])) assert.equal(aNumero(v), x, String(v));
    for (const v of ['', '  ', '3ro', '5 años', '45%', '45 %', '1.234,5', '2024-05-01', '0x1A', 'Infinity', 'NA', null, undefined, true, NaN]) assert.ok(Number.isNaN(aNumero(v)), `«${v}» no es un número`);
    for (const v of ['', '   ', null, undefined, NaN]) assert.ok(esPerdido(v), `«${v}» es un perdido`);
    for (const v of [0, '0', 'NA', 'F', false]) assert.ok(!esPerdido(v), `«${v}» no es un perdido`);
    const datos = [{ a: '', b: NaN, c: null, d: '2024-05-01', e: '' }, { a: 5, b: 'F', c: '3,5', d: '2024-05-02', e: 'M' }];
    assert.equal(primerValor(datos, 'a'), 5); assert.equal(primerValor(datos, 'x'), undefined);
    assert.deepEqual(['a', 'b', 'c', 'd', 'e'].map(c => esColumnaNumerica(datos, c)), [true, false, true, false, false]);
    assert.deepEqual(['a', 'b', 'c', 'd', 'e'].map(c => esColumnaTexto(datos, c)), [false, true, false, false, true], 'una fecha no es una categoría');
    assert.ok(esFecha('2024-05-01') && esFecha('2024-5-1 10:30') && esFecha('01/05/2024') && !esFecha('2024') && !esFecha('Femenino'));
    assert.deepEqual([...columnaNumerica(datos, 'c')], [NaN, 3.5]);
    assert.equal(totalConProrrateo([1, 2, 3, 4, 5]), 15, 'completo: la suma');
    assert.equal(totalConProrrateo([1, NaN, 3, 4, 5]), (13 / 4) * 5, 'falta 1 de 5 (80 % respondido): prorrateo');
    assert.ok(Number.isNaN(totalConProrrateo([1, NaN, NaN, 4, 5])), 'faltan 2 de 5: sin total');
    assert.ok(Number.isNaN(totalConProrrateo([NaN, NaN])), 'nada respondido');
    // la regla del Simulador (imperfecciones.js hasta la 2026.12.17), con sus mismas operaciones
    for (let k = 3; k <= 12; k++) for (let m = 0; m <= k; m++) {
        const items = Array.from({ length: m }, (_, i) => 1 + ((i * 7 + k) % 5)), conHuecos = [...items, ...Array(k - m).fill(NaN)];
        const viejo = m === 0 || m < 0.8 * k ? NaN : m < k ? items.reduce((s, v) => s + v, 0) / m * k : items.reduce((s, v) => s + v, 0);
        assert.ok(Object.is(totalConProrrateo(conHuecos, k), viejo), `k = ${k}, m = ${m}`);
    }
});

test("un perdido es un perdido, venga como venga: '' (CSV), NaN (Simulador) y null dan los mismos resultados en todos los análisis", async () => {
    await cargar();
    const salidas = [];
    for (const perdido of ['', NaN, null]) { A.cargarDatos(base(perdido)); salidas.push(Object.fromEntries(Object.entries(analizar()).map(([k, v]) => [k, json(v)]))); }
    for (const k of Object.keys(salidas[0])) {
        assert.equal(salidas[1][k], salidas[0][k], `${k}: NaN frente a ''`);
        assert.equal(salidas[2][k], salidas[0][k], `${k}: null frente a ''`);
    }
    // y no hay grupos ni categorías «NaN»
    for (const k of ['chi', 'ancova', 'manova', 'grupos', 'socios', 'invarianza']) assert.ok(!/"NaN"[,\]]|«NaN»|nombre":"NaN/.test(salidas[1][k]), `${k} sin categoría NaN`);
});

test('un perdido equivale a no tener el dato: la eliminación por lista coincide con quitar esas filas (antes, la celda vacía contaba como 0)', async () => {
    await cargar();
    const usa = (/** @type {string[]} */ cols) => (/** @type {any} */ f) => cols.some(c => esPerdido(f[c]));
    const casos = [
        ['regresión', ['General_Y', 'General_X', 'Dimension_A'], () => RM.regresion('General_Y', ['General_X', 'Dimension_A'], 'Y', ['X', 'A']).coefs],
        ['matriz multivariable', ['General_X', 'General_Y', 'Dimension_A'], () => RM.matrizCorrelaciones(['General_X', 'General_Y', 'Dimension_A'], ['X', 'Y', 'A']).pares],
        ['pestaña de grupos', ['Sexo', 'General_Y'], () => CG.analizar('Sexo', 'General_Y', 'S', 'Y').grupos],
        ['ANCOVA', ['Sexo', 'General_Y', 'General_X'], () => { const r = RM.ancova('Sexo', 'General_Y', 'General_X'); return [r.n, r.Ffactor, r.pFactor]; }],
        ['SEM', ['IT1', 'IT2', 'IT3', 'IT4', 'IT5'], () => { SEM._ultimos.length = 0; const m = SEM.ajustar('F =~ IT1 + IT2 + IT3 + IT4 + IT5', null, 'M'); return [m.n, m.chi2]; }]
    ];
    for (const [que, cols, f] of casos) {
        A.cargarDatos(base('')); const conPerdidos = json(/** @type {Function} */ (f)());
        A.cargarDatos(base('', { sinFilas: usa(/** @type {string[]} */ (cols)) })); const sinFilas = json(/** @type {Function} */ (f)());
        assert.equal(conPerdidos, sinFilas, `${que}: con celdas vacías = sin esas filas`);
    }
    A.cargarDatos(base(''));
    const ceros = base('').map(f => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === '' && k !== 'Sexo' ? 0 : v])));
    const conVacias = json(CG.analizar('Sexo', 'General_Y', 'S', 'Y').grupos);
    A.cargarDatos(ceros);
    assert.notEqual(json(CG.analizar('Sexo', 'General_Y', 'S', 'Y').grupos), conVacias, 'la celda vacía ya no vale 0');
});

test('criba de objetivos por pares, totales con la regla del 80 % y el tipo de columna por su primer valor no perdido', async () => {
    await cargar();
    A.cargarDatos(base(NaN));
    const C = K.cribar(A.obtenerDatos(), [{ columnaX: 'Dimension_A', columnaY: 'General_Y', prioridad: 1 }], A), e = C.evaluados[0];
    assert.ok(e.valido, 'una columna con perdidos ya no queda fuera de la criba');
    const R = A.calcularCorrelacion('Dimension_A', 'General_Y');
    if (e.metodo === (R.tipoCorrelacion === 'Pearson' ? 'Pearson' : 'Spearman')) assert.ok(Math.abs(e.coeficiente - R.coeficiente) < 1e-14, `el coeficiente de la criba es el del análisis completo: ${e.coeficiente} frente a ${R.coeficiente}`);
    const filas = [{ IT1: 4, IT2: 4, IT3: 4, IT4: 4, IT5: 4 }, { IT1: 4, IT2: '', IT3: 4, IT4: 4, IT5: 4 }, { IT1: 4, IT2: '', IT3: '', IT4: 4, IT5: 4 }];
    A.cargarDatos(filas);
    assert.deepEqual(A.calcularPuntajesTotalesDimension(['IT1', 'IT2', 'IT3', 'IT4', 'IT5']).map(String), ['20', '20', 'NaN'], 'completo, prorrateado y sin total (antes: 20, 16 y 12)');
    // las dimensiones configuradas se correlacionan con los casos que tienen los dos totales
    A.cargarDatos(base(''));
    A.dimensiones = { V1: { D1: ['IT1', 'IT2', 'IT3'] }, V2: { D2: ['IT4', 'IT5', 'IT1'] } };
    const [dim] = A.calcularCorrelacionPorDimensiones('V1', 'V2');
    assert.ok(Number.isFinite(dim.coeficiente) && dim.n < 160, `n = ${dim.n} (pares con los dos totales)`);
    // tipo de columna: la primera fila vacía no la saca de los desplegables; una fecha no es un número
    const d = [{ ID: 1, A: '', B: '', C: '2024-05-01', E: NaN }, { ID: 2, A: 5, B: 'F', C: '2024-05-02', E: 3 }];
    assert.deepEqual(CARGA.obtenerColumnasNumericas(d), ['A', 'E']);
    assert.deepEqual(SD.detectarSocios([...d, { ID: 3, A: 6, B: 'M', C: '2024-05-03', E: 4 }], []), [{ col: 'A', tipo: 'numerica' }, { col: 'B', tipo: 'categorica', niveles: ['F', 'M'] }, { col: 'E', tipo: 'numerica' }]);
});

test('el cargador de CSV guarda como número solo los números completos (antes, «5 años», «45%» y «2024-05-01» se guardaban como 5, 45 y 2024)', async () => {
    await cargar();
    A.cargarDesdeCSV('ID;Puntaje;Edad;Fecha;Grado;Pct\n1;3,5;5 años;2024-05-01;3ro;45%\n2;;7;2024-05-02;4to;50\n3;1e3;8;;5to;\n');
    assert.deepEqual(A.obtenerDatos(), [
        { ID: 1, Puntaje: 3.5, Edad: '5 años', Fecha: '2024-05-01', Grado: '3ro', Pct: '45%' },
        { ID: 2, Puntaje: '', Edad: 7, Fecha: '2024-05-02', Grado: '4to', Pct: 50 },
        { ID: 3, Puntaje: 1000, Edad: 8, Fecha: '', Grado: '5to', Pct: '' }]);
    // Edad y Pct empiezan con un texto («5 años», «45%»): no son numéricas, y la fecha tampoco (antes, las tres lo eran)
    assert.deepEqual(CARGA.obtenerColumnasNumericas(A.obtenerDatos()), ['Puntaje']);
});
