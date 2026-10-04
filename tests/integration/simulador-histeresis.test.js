// tests/integration/simulador-histeresis.test.js — estados con histéresis en el Simulador (Atlas, fase E2). Con nitidez 0, los
// estados se recalculan de forma independiente a partir de las columnas generadas (umbrales = percentiles del total en T1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeneradorDatos } from '../../src/simulador/dominio/generador.js';

const esc = (nombre, corto) => ({ nombre, nombreCorto: corto, prueba: 'T', tipo: 'dimension', numItems: 20, media: 60, desviacion: 10, minimo: 1, maximo: 5, alfa: 0.85, distribucion: 'normal', invertidos: 0 });
const hist = (extra = {}) => ({ x: 'Estrés', nombre: 'Ansiedad clínica', etiquetas: ['No', 'Sí'], pEntrada: 80, pSalida: 40, ruido: 5, ...extra });
function generador({ histeresis = [hist()], n = 400, estabilidad = 0.6, realismo = {}, desenlaces = [], repetir = true }) {
    const g = new GeneradorDatos();
    g.configuracion = { tamanoMuestra: n, semilla: 11, generarPercentiles: false, correlacionesExactas: true, indiceFiabilidad: 'alfa', heterogeneidadItems: 'leve', variablesPorTest: { T: { variable: 'R', rIntra: 0 } },
        pruebas: [esc('Estrés', 'ES')], sociodemograficos: [], correlaciones: [], diferenciasGrupo: [], modelos: [], niveles: [], paneles: [], histeresis,
        medidasRepetidas: repetir ? [{ variable: 'Estrés', ondas: 4, estabilidad, cambio: 0, agrupacion: '', cambioGrupo: null, modelo: 'ar1', dePendientes: 0, rInterceptoPendiente: 0 }] : [],
        estructuras: [], desenlaces, cortes: [], concordancias: [], realismo };
    g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas);
    return g;
}
// columnas de las cuatro ondas por su patrón (con una sola escala en el test, el total es General_ y no Dimension_)
const cols = (b, patron) => b.nombres().filter(c => patron.test(c)).sort().map(c => Array.from(b.columna(c).datos));
const TOTAL = /^(Dimension|General)_ES(_T\d)?$/, ESTADO = /^Estado_ES(_T\d)?$/;
const cuantil = (v, p) => { const o = v.slice().sort((a, b) => a - b), h = (o.length - 1) * p, i = Math.floor(h); return o[i] + (h - i) * ((o[i + 1] ?? o[i]) - o[i]); };

test('sin nitidez: los estados cumplen la regla y la memoria, recalculados de forma independiente, y el informe lo confirma', () => {
    const g = generador({ histeresis: [hist({ ruido: 0 })] }), v = g.validarConfiguracion();
    assert.deepEqual(v.errores, []);
    const b = g.generarBaseDatos(), X = cols(b, TOTAL), S = cols(b, ESTADO), alto = cuantil(X[0], 0.8), bajo = cuantil(X[0], 0.4);
    let fallos = 0;
    for (let i = 0; i < b.n; i++) for (let k = 0; k < 4; k++) {
        const x = X[k][i], s = S[k][i];
        if (x >= alto) fallos += s !== 1; else if (x <= bajo) fallos += s !== 0; else if (k > 0) fallos += s !== S[k - 1][i];
    }
    assert.equal(fallos, 0);
    const inf = g.informePedidoObtenido(b).filter(f => /Estado con histéresis/.test(f.variable));
    assert.deepEqual(inf.filter(f => f.ok !== null).map(f => [f.obtenido, f.ok]), [['100.0 %', true], ['100.0 %', true]]);
    assert.match(inf.find(f => f.tipo === 'fenómeno').obtenido, /100\.0 % si venía de «Sí» y 0\.0 % si venía de «No»/);
});

test('con nitidez 5 % y N = 3000 no hay sesgo (95 % en la regla y en la memoria), y el informe desde objetos es idéntico', () => {
    const g = generador({ n: 3000 }), b = g.generarBaseDatos(), inf = g.informePedidoObtenido(b);
    assert.equal(inf.filter(f => f.ok === false).length, 0);
    for (const f of inf.filter(f => /Estado con histéresis/.test(f.variable) && f.ok !== null)) assert.ok(Math.abs(parseFloat(f.obtenido) - 95) < 1.2, `${f.variable}: ${f.obtenido}`);
    assert.equal(JSON.stringify(g.informePedidoObtenido(b.aObjetos())), JSON.stringify(inf));
    assert.deepEqual(b.columna('Estado_ES_T2').etiquetas, { 0: 'No', 1: 'Sí' });
});

test('con datos perdidos, falta el estado donde falta la escala (la memoria ya se calculó con el camino verdadero)', () => {
    const g = generador({ realismo: { pctPerdidos: 10, mecanismoPerdidos: 'MCAR' } }), b = g.generarBaseDatos(), X = cols(b, TOTAL), S = cols(b, ESTADO);
    let perdidos = 0, desalineados = 0;
    for (let k = 0; k < 4; k++) for (let i = 0; i < b.n; i++) { if (!Number.isFinite(X[k][i])) perdidos++; if (Number.isFinite(X[k][i]) !== Number.isFinite(S[k][i])) desalineados++; }
    assert.ok(perdidos > 0); assert.equal(desalineados, 0);
    assert.equal(g.informePedidoObtenido(b).filter(f => f.ok === false).length, 0);
});

test('validación: sin medida repetida, umbrales desordenados, nitidez fuera de rango, etiquetas iguales, estado repetido y choque de nombres son errores; tres avisos', () => {
    const errores = op => generador(op).validarConfiguracion().errores.join(' | ');
    assert.match(errores({ repetir: false }), /debe medirse con medidas repetidas/);
    assert.match(errores({ histeresis: [hist({ pEntrada: 40, pSalida: 60 })] }), /umbral de salida debe ser un percentil menor/);
    assert.match(errores({ histeresis: [hist({ ruido: 50 })] }), /nitidez .* entre 0 y 50/);
    assert.match(errores({ histeresis: [hist({ etiquetas: ['Sí', 'Sí'] })] }), /etiquetas distintas/);
    assert.match(errores({ histeresis: [hist(), hist()] }), /ya tiene un estado con histéresis/);
    assert.match(errores({ desenlaces: [{ nombre: 'Estado_ES', tipo: 'binario', prevalencia: 0.3, media: null, niveles: null, etiquetas: ['No', 'Sí'], predictores: [] }] }), /Dos columnas se llamarían «Estado_ES»/);
    const avisos = generador({ histeresis: [hist({ ruido: 0, pEntrada: 55, pSalida: 50 })], estabilidad: 0.9 }).validarConfiguracion().advertencias.join(' | ');
    assert.match(avisos, /franja entre los umbrales es estrecha/); assert.match(avisos, /pocas personas cruzarán los umbrales/); assert.match(avisos, /con nitidez 0 la separación es perfecta/);
});

test('revisión de la fase E2: con techo, la validación anticipa que los umbrales caerán en el máximo, y con los dos, el informe declara la franja vacía', () => {
    const conTecho = (media, desviacion) => { const g = generador({}); g.configuracion.pruebas = [{ ...esc('Estrés', 'ES'), distribucion: 'techo', media, desviacion }]; g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas); return g; };
    const moderado = conTecho(92, 10), avisosM = moderado.validarConfiguracion().advertencias.join(' | ');
    assert.match(avisosM, /el umbral de entrada caerá en él: entrarán todos los que lleguen al máximo/);
    const extremo = conTecho(97, 6), v = extremo.validarConfiguracion();
    assert.deepEqual(v.errores, []);
    assert.match(v.advertencias.join(' | '), /los dos umbrales caerán en él y la franja quedará vacía/);
    const bucle = extremo.informePedidoObtenido(extremo.generarBaseDatos()).find(f => f.tipo === 'bucle');
    assert.match(bucle.obtenido, /la franja quedó vacía/);
});

