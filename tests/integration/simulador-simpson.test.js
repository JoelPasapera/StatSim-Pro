// @ts-check
// tests/integration/simulador-simpson.test.js — la paradoja de Simpson en el motor (Atlas): diferencias materializadas, r dentro
// de los grupos y de toda la base (verificadas de forma independiente), validación e idempotencia.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeneradorDatos } from '../../src/simulador/dominio/generador.js';
import { rTotalSimpson } from '../../src/simulador/dominio/simpson.js';

/** @param {string} nombre @param {string} corto */
const esc = (nombre, corto) => ({ nombre, nombreCorto: corto, prueba: 'T', tipo: 'dimension', numItems: 20, media: 60, desviacion: 10, minimo: 1, maximo: 5, alfa: 0.85, distribucion: 'normal', invertidos: 0 });
/** @param {object} md @param {object} [extra] */
function generador(md, extra = {}) {
    const g = /** @type {any} */ (new GeneradorDatos());
    g.configuracion = Object.assign({ tamanoMuestra: 400, semilla: 3, generarPercentiles: false, correlacionesExactas: true, indiceFiabilidad: 'alfa', heterogeneidadItems: 'leve', variablesPorTest: { T: { variable: 'R', rIntra: 0 } },
        pruebas: [esc('Gravedad', 'GR'), esc('Recuperación', 'RE')], sociodemograficos: [{ categoria: 'Hospital', categoriaCorta: 'Hos', distribucion: 'binaria', promedio: 0.5 }, { categoria: 'Turno', categoriaCorta: 'Tur', distribucion: 'categorica', minimo: 1, maximo: 3 }],
        correlaciones: [], diferenciasGrupo: [], modelos: [Object.assign({ tipo: 'simpson', x: 'Gravedad', m: 'Hospital', y: 'Recuperación', c1: 0.4, c2: 1.5, c3: -1.5 }, md)], medidasRepetidas: [], niveles: [], paneles: [], histeresis: [], estructuras: [], desenlaces: [], cortes: [], concordancias: [], realismo: {} }, extra);
    g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas);
    return g;
}
/** @param {number[]} u @param {number[]} w */
const r = (u, w) => { const k = u.length, mu = u.reduce((s, x) => s + x, 0) / k, mw = w.reduce((s, x) => s + x, 0) / k; let a = 0, b = 0, c = 0; for (let i = 0; i < k; i++) { a += (u[i] - mu) * (w[i] - mw); b += (u[i] - mu) ** 2; c += (w[i] - mw) ** 2; } return a / Math.sqrt(b * c); };
/** @param {any} g @param {any} b */
function independiente(g, b) {
    const X = Array.from(b.columna('Dimension_GR').datos), Y = Array.from(b.columna('Dimension_RE').datos), G = Array.from(b.columna('Hospital').datos);
    const centrar = (/** @type {number[]} */ a, /** @type {number[]} */ grupo) => { const medias = new Map(); for (const c of new Set(grupo)) { const v = a.filter((_, i) => grupo[i] === c); medias.set(c, v.reduce((s, x) => s + x, 0) / v.length); } return a.map((x, i) => x - medias.get(grupo[i])); };
    return { total: r(X, Y), dentro: r(centrar(X, G), centrar(Y, G)) };
}

test('la inversión clásica: dentro de los grupos +0.40, en toda la base −0.10, verificadas de forma independiente', () => {
    const g = generador({});
    const v = g.validarConfiguracion();
    assert.deepEqual(v.errores, []);
    const b = g.generarBaseDatos(), inf = g.informePedidoObtenido(b), ind = independiente(g, b);
    assert.ok(Math.abs(ind.dentro - 0.4) < 0.03 && Math.abs(ind.total - -0.104) < 0.03, `dentro ${ind.dentro}, total ${ind.total}`);
    assert.deepEqual(inf.filter(f => f.ok === false).map(f => `${f.tipo} ${f.variable}`), []);
    assert.equal(inf.filter(f => /^Simpson/.test(f.variable) && f.tipo === 'r').length, 4, 'dos grupos, la combinada y la total');
    assert.match(inf.find(f => f.tipo === 'fenómeno').obtenido, /se invierte/);
    assert.deepEqual(inf.filter(f => f.tipo === 'd').map(f => f.obtenido), ['1.50', '-1.50'], 'las d materializadas, verificadas por sus filas');
});

test('otra proporción de grupos (30 %) y el modo no exacto', () => {
    const extra = { sociodemograficos: [{ categoria: 'Hospital', categoriaCorta: 'Hos', distribucion: 'binaria', promedio: 0.3 }] };
    const g = generador({ c1: -0.3, c2: 1.2, c3: 1.4 }, extra), b = g.generarBaseDatos(), ind = independiente(g, b);
    assert.ok(Math.abs(ind.total - rTotalSimpson({ rDentro: -0.3, dX: 1.2, dY: 1.4, varianzaCodigo: 0.21 })) < 0.03, `total ${ind.total}`);
    assert.deepEqual(g.informePedidoObtenido(b).filter(f => f.ok === false).map(f => f.variable), []);
    const ne = generador({}, { correlacionesExactas: false, tamanoMuestra: 2000 }), bn = ne.generarBaseDatos();
    assert.deepEqual(ne.informePedidoObtenido(bn).filter(f => f.ok === false).map(f => f.variable), []);
});

test('validación: una variable que no es de agrupación como grupos, variables repetidas, rangos, conflicto con una diferencia propia y avisos', () => {
    const errores = (/** @type {any} */ g) => g.validarConfiguracion().errores.join(' | ');
    assert.deepEqual(generador({ m: 'Turno' }).validarConfiguracion().errores, [], 'una categórica de tres niveles es válida desde la 2026.12.05');
    assert.match(errores(generador({ m: 'Gravedad' })), /binaria o categórica/);
    assert.match(errores(generador({ y: 'Gravedad' })), /dos variables cuantitativas distintas/);
    assert.match(errores(generador({ x: 'R — T' })), /«R — T» es un puntaje general/, 'verificación de la 2026.11.29: el general tiene su propio mensaje');
    assert.match(errores(generador({ c1: 0.97 })), /entre −0,95 y 0,95/);
    assert.match(errores(generador({ c3: -3.5 })), /entre −3 y 3/);
    assert.match(errores(generador({}, { diferenciasGrupo: [{ tipo: 'd', cuantitativa: 'Gravedad', agrupacion: 'Hospital', d: 0.5 }] })), /ya está en la tabla de diferencias/);
    const avisos = (/** @type {any} */ g) => g.validarConfiguracion().advertencias.join(' | ');
    assert.match(avisos(generador({ c3: 1.5 })), /no se invierte/);
    assert.match(avisos(generador({}, { correlaciones: [{ a: 'Gravedad', b: 'Recuperación', r: 0.3 }] })), /se sustituye/);
    assert.doesNotMatch(avisos(generador({})), /no se invierte/);
});

test('la materialización es idempotente: validar y generar varias veces no duplica las diferencias', () => {
    const g = generador({});
    g.validarConfiguracion(); g.validarConfiguracion(); g.generarBaseDatos();
    assert.equal(g.configuracion.diferenciasGrupo.filter((/** @type {any} */ d) => d.origen === 'simpson').length, 2);
    g.configuracion.modelos = []; g.validarConfiguracion();
    assert.equal(g.configuracion.diferenciasGrupo.length, 0, 'al quitar el modelo, sus diferencias se van con él');
});

test('2026.12.05: con tres grupos (una categórica equiprobable, Var(código) = 2/3), la inversión se cumple: +0.40 dentro, −0.16 en total', () => {
    const extra = { sociodemograficos: [{ categoria: 'Planta', categoriaCorta: 'Pla', distribucion: 'categorica', minimo: 1, maximo: 3 }] };
    const g = generador({ m: 'Planta', c1: 0.4, c2: 1, c3: -1 }, Object.assign(extra, { tamanoMuestra: 900 }));
    assert.deepEqual(g.validarConfiguracion().errores, []);
    const esperado = rTotalSimpson({ rDentro: 0.4, dX: 1, dY: -1, varianzaCodigo: 2 / 3 });
    assert.ok(Math.abs(esperado - -0.16) < 1e-9);
    const b = g.generarBaseDatos(), inf = g.informePedidoObtenido(b);
    const X = Array.from(b.columna('Dimension_GR').datos), Y = Array.from(b.columna('Dimension_RE').datos), G = Array.from(b.columna('Planta').datos);
    const centrar = (/** @type {number[]} */ a) => { const m = new Map(); for (const c of new Set(G)) { const v = a.filter((_, i) => G[i] === c); m.set(c, v.reduce((s, x) => s + x, 0) / v.length); } return a.map((x, i) => x - m.get(G[i])); };
    assert.ok(Math.abs(r(centrar(X), centrar(Y)) - 0.4) < 0.03 && Math.abs(r(X, Y) - esperado) < 0.03, `dentro ${r(centrar(X), centrar(Y))}, total ${r(X, Y)}`);
    assert.deepEqual(inf.filter((/** @type {any} */ f) => f.ok === false).map((/** @type {any} */ f) => `${f.tipo} ${f.variable}`), []);
    assert.equal(inf.filter((/** @type {any} */ f) => /^Simpson .*dentro del grupo/.test(f.variable)).length, 3, 'una fila por grupo');
    assert.match(inf.find((/** @type {any} */ f) => f.tipo === 'fenómeno').obtenido, /se invierte/);
});

