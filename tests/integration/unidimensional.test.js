// tests/integration/unidimensional.test.js — un test sin dimensiones (Raven) tiene variable general: su única escala.
// Caso real: RAVEN (una escala, ítems 0/1) + TMMS24 (tres dimensiones). Simulador → estructura → Analizador.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeneradorDatos } from '../../src/simulador/dominio/generador.js';
import { EtiquetasVariables } from '../../src/shared/etiquetas-variables.js';
import { Fiabilidad } from '../../src/analizador/fiabilidad.js';
import { AnalisisDimensiones } from '../../src/analizador/analisis-dimensiones.js';
import { AnalizadorEstadistico } from '../../src/analizador/estadistica.js';

const escala = (nombre, corto, prueba, k, media, de, min, max, alfa) => ({ nombre, nombreCorto: corto, prueba, tipo: 'dimension', numItems: k, media, desviacion: de, minimo: min, maximo: max, alfa, distribucion: 'normal', invertidos: 0 });
const g = new GeneradorDatos();
g.configuracion = { tamanoMuestra: 300, semilla: 7, generarPercentiles: true, correlacionesExactas: true, indiceFiabilidad: 'alfa', heterogeneidadItems: 'leve',
    variablesPorTest: { RAVEN: { variable: 'inteligencia cognitiva', rIntra: 0.4 }, TMMS24: { variable: 'inteligencia emocional', rIntra: 0.4 } },
    pruebas: [escala('inteligencia cognitiva', 'IC', 'RAVEN', 36, 28, 5, 0, 1, 0.85), escala('Percepción emocional', 'PE', 'TMMS24', 8, 26, 5, 1, 5, 0.85),
              escala('comprensión emocional', 'CE', 'TMMS24', 8, 26, 5, 1, 5, 0.85), escala('regulación emocional', 'RE', 'TMMS24', 8, 26, 5, 1, 5, 0.85)],
    sociodemograficos: [], correlaciones: [{ a: 'inteligencia cognitiva', b: 'inteligencia emocional — TMMS24', r: 0.30 }], diferenciasGrupo: [], modelos: [],
    medidasRepetidas: [], estructuras: [], desenlaces: [], cortes: [], concordancias: [], realismo: {} };
g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas);
const datos = g.generarBaseDatos().aObjetos();
const generalTMMS = `General_${g.configuracion.gruposPruebas.find(x => x.nombre === 'TMMS24').sigla}`;
const r = (a, b) => { const x = datos.map(f => f[a]), y = datos.map(f => f[b]), n = x.length, mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return sxy / Math.sqrt(sxx * syy); };

test('Simulador: la única escala del RAVEN es su variable general (General_IC), etiquetada con la variable que mide', () => {
    const cols = Object.keys(datos[0]);
    assert.ok(cols.includes('General_IC') && !cols.includes('Dimension_IC'), cols.filter(c => /_/.test(c)).join(' '));
    assert.ok(cols.includes(generalTMMS) && ['Dimension_PE', 'Dimension_CE', 'Dimension_RE'].every(c => cols.includes(c)), 'el TMMS24 conserva dimensiones y General derivado');
    assert.equal(g.obtenerEtiquetas().General_IC, 'inteligencia cognitiva');
    assert.ok(Math.abs(r('General_IC', generalTMMS) - 0.30) < 0.03, 'la correlación pedida entre los dos generales se cumple: ' + r('General_IC', generalTMMS).toFixed(3));
});

test('Simulador → Analizador: la estructura describe los dos tests (antes llegaba vacía)', () => {
    const est = g.obtenerEstructuraEscalas();
    const raven = est.find(p => p.prueba === 'RAVEN'), tmms = est.find(p => p.prueba === 'TMMS24');
    assert.deepEqual([raven.columnaGeneral, raven.unidimensional, raven.dimensiones.length, raven.siglaGeneral], ['General_IC', true, 0, 'IC']);
    assert.deepEqual([tmms.columnaGeneral, tmms.unidimensional, tmms.dimensiones.map(d => d.sigla).join()], [generalTMMS, false, 'PE,CE,RE']);
});

test('Analizador: instrumentos, fiabilidad y pares dimensión ↔ general con la estructura', () => {
    EtiquetasVariables.fijar(g.obtenerEtiquetas(), g.obtenerEstructuraEscalas());
    assert.equal(EtiquetasVariables.pruebaConGeneral('General_IC').prueba, 'RAVEN', 'el Raven se reconoce como instrumento de su variable general');
    const grupos = Fiabilidad.detectarGrupos(datos);
    const ic = grupos.find(x => x.nombre === 'IC');
    assert.ok(ic && ic.items.length === 36 && ic.etiqueta === 'inteligencia cognitiva (RAVEN)', 'grupo de ítems del Raven: ' + JSON.stringify(ic && [ic.etiqueta, ic.items.length]));
    assert.ok(grupos.some(x => x.etiqueta === 'Escala total (TMMS24)' && x.items.length === 24), 'escala total del TMMS24 (sus 24 ítems)');
    const pares = AnalisisDimensiones._candidatos('General_IC', generalTMMS);
    assert.deepEqual(pares.map(p => `${p.columnaX}↔${p.columnaY}`).sort(), ['Dimension_CE↔General_IC', 'Dimension_PE↔General_IC', 'Dimension_RE↔General_IC']);
    assert.ok(!pares.some(p => p.columnaY === generalTMMS), 'ninguna dimensión se contrasta con su propio general');
    EtiquetasVariables.limpiar();
});

test('(2026.12.31, tercera revisión) la criba solo construye los pares dimensión ↔ general: sin el producto de dimensiones', () => {
    const dims = (/** @type {string} */ t, /** @type {number} */ n) => Array.from({ length: n }, (_, i) => ({ columna: `Dimension_${t}${i}`, etiqueta: `${t}${i}`, sigla: `${t}${i}` }));
    const prueba = (/** @type {string} */ t, /** @type {number} */ n) => ({ prueba: t, variable: t, columnaGeneral: `General_${t}`, etiquetaGeneral: t, siglaGeneral: null, unidimensional: false, dimensiones: dims(t, n) });
    EtiquetasVariables.fijar({ General_X: 'X', General_Y: 'Y' }, [prueba('X', 3), prueba('Y', 2)]);
    const tipos = (/** @type {any[]} */ l) => l.map(c => c.tipoPar).join();
    assert.equal(tipos(AnalisisDimensiones._candidatos('General_X', 'General_Y')), 'general-dim,general-dim,general-dim,general-dim,general-dim,dim-dim,dim-dim,dim-dim,dim-dim,dim-dim,dim-dim');
    assert.equal(tipos(AnalisisDimensiones._candidatos('General_X', 'General_Y', true)), 'general-dim,general-dim,general-dim,general-dim,general-dim');
    // dos tests de 2500 dimensiones (el tope de la estructura de un proyecto): 5000 pares, no 6,25 millones más
    EtiquetasVariables.fijar({ General_X: 'X', General_Y: 'Y' }, [prueba('X', 2500), prueba('Y', 2500)]);
    const t0 = Date.now();
    assert.equal(AnalisisDimensiones._candidatos('General_X', 'General_Y', true).length, 5000);
    assert.ok(Date.now() - t0 < 500, `${Date.now() - t0} ms`);
    // y la criba, con datos, solo evalúa esos (los pares dimensión ↔ dimensión no llegan a ella)
    const columnas = ['General_X', 'General_Y', 'Dimension_X0', 'Dimension_X1', 'Dimension_X2', 'Dimension_Y0', 'Dimension_Y1'];
    let s = 3;
    const az = () => (s = (s * 48271) % 2147483647) / 2147483647;
    AnalizadorEstadistico.cargarDatos(Array.from({ length: 40 }, () => Object.fromEntries(columnas.map(c => [c, Math.round(az() * 100) / 10]))));
    EtiquetasVariables.fijar({ General_X: 'X', General_Y: 'Y' }, [prueba('X', 3), prueba('Y', 2)]);
    const criba = AnalisisDimensiones.cribarObjetivos('General_X', 'General_Y');
    assert.deepEqual(criba.evaluados.map((/** @type {any} */ e) => e.tipoPar).sort(), ['general-dim', 'general-dim', 'general-dim', 'general-dim', 'general-dim']);
    EtiquetasVariables.limpiar();
});
