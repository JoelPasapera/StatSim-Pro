// tests/integration/simulador-niveles.test.js — relación entre personas y dentro de la persona en el Simulador (Atlas, fase D).
// Las correlaciones se comprueban con un cálculo independiente del motor y del informe (medias de cada persona y puntuaciones
// con centrado doble, directamente sobre las columnas de las ondas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeneradorDatos } from '../../src/simulador/dominio/generador.js';

const esc = (nombre, corto) => ({ nombre, nombreCorto: corto, prueba: 'T', tipo: 'dimension', numItems: 20, media: 60, desviacion: 10, minimo: 1, maximo: 5, alfa: 0.85, distribucion: 'normal', invertidos: 0 });
const rep = (variable, estabilidad, extra = {}) => ({ variable, ondas: 4, estabilidad, cambio: 0, agrupacion: '', cambioGrupo: null, modelo: 'intercepto', dePendientes: 0, rInterceptoPendiente: 0, ...extra });
function generador({ niveles = [{ x: 'Velocidad', y: 'Errores', rEntre: -0.4, rDentro: 0.3 }], repetidas = [rep('Velocidad', 0.6), rep('Errores', 0.5)], correlaciones = [], n = 400, exactas = true, pruebas = null }) {
    const g = new GeneradorDatos();
    g.configuracion = { tamanoMuestra: n, semilla: 7, generarPercentiles: false, correlacionesExactas: exactas, indiceFiabilidad: 'alfa', heterogeneidadItems: 'leve', variablesPorTest: { T: { variable: 'R', rIntra: 0 } },
        pruebas: pruebas || [esc('Velocidad', 'VE'), esc('Errores', 'ER')], sociodemograficos: [], correlaciones, diferenciasGrupo: [], modelos: [], medidasRepetidas: repetidas, niveles,
        estructuras: [], desenlaces: [], cortes: [], concordancias: [], realismo: {} };
    g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas);
    return g;
}
const pr = (u, w) => { const n = u.length, mu = u.reduce((a, c) => a + c) / n, mw = w.reduce((a, c) => a + c) / n; let s = 0, p = 0, q = 0; for (let i = 0; i < n; i++) { s += (u[i] - mu) * (w[i] - mw); p += (u[i] - mu) ** 2; q += (w[i] - mw) ** 2; } return s / Math.sqrt(p * q); };
const ondas = (b, sigla) => b.nombres().filter(c => c === `Dimension_${sigla}` || c.startsWith(`Dimension_${sigla}_T`)).sort().map(c => Array.from(b.columna(c).datos));
function independiente(X, Y) {
    const K = X.length, N = X[0].length, mx = [], my = [];
    for (let i = 0; i < N; i++) { mx.push(X.reduce((s, c) => s + c[i], 0) / K); my.push(Y.reduce((s, c) => s + c[i], 0) / K); }
    const mo = A => A.map(c => c.reduce((s, v) => s + v, 0) / N), mox = mo(X), moy = mo(Y), gx = mox.reduce((s, v) => s + v) / K, gy = moy.reduce((s, v) => s + v) / K;
    let a = 0, b = 0, c = 0; for (let i = 0; i < N; i++) for (let k = 0; k < K; k++) { const dx = X[k][i] - mx[i] - mox[k] + gx, dy = Y[k][i] - my[i] - moy[k] + gy; a += dx * dy; b += dx * dx; c += dy * dy; }
    return { medias: pr(mx, my), dentro: a / Math.sqrt(b * c), t1: pr(X[0], Y[0]) };
}

test('inversión de signo entre niveles (−0,40 entre personas, +0,30 dentro): exacta, verificada por un cálculo independiente', () => {
    const g = generador({}), v = g.validarConfiguracion();
    assert.deepEqual(v.errores, []);
    const b = g.generarBaseDatos(), ind = independiente(ondas(b, 'VE'), ondas(b, 'ER'));
    assert.ok(Math.abs(ind.dentro - 0.3) < 0.01 && Math.abs(ind.medias - -0.28) < 0.01 && Math.abs(ind.t1 - -0.085) < 0.01, JSON.stringify(ind));
    const inf = g.informePedidoObtenido(b).filter(f => /Relación entre niveles/.test(f.variable));
    assert.equal(inf.filter(f => f.ok === false).length, 0);
    assert.equal(inf.filter(f => f.ok === true).length, 4);
    assert.match(inf.find(f => f.tipo === 'fenómeno').obtenido, /cambia de signo/);
});

test('sin modo exacto (n = 500), el informe tolera el muestreo sin falsas alarmas', () => {
    const g = generador({ exactas: false, n: 500 }), b = g.generarBaseDatos();
    const inf = g.informePedidoObtenido(b).filter(f => /Relación entre niveles/.test(f.variable));
    assert.equal(inf.filter(f => f.ok === false).length, 0, JSON.stringify(inf.map(f => [f.variable, f.pedido, f.obtenido])));
});

test('validación: sin medida repetida, sin interceptos o con distinto número de ondas son errores; la tabla III, un aviso', () => {
    const errores = op => generador(op).validarConfiguracion().errores.join(' | ');
    assert.match(errores({ repetidas: [rep('Velocidad', 0.6)] }), /«Errores» debe medirse con medidas repetidas/);
    assert.match(errores({ repetidas: [rep('Velocidad', 0.6), rep('Errores', 0.5, { modelo: 'ar1' })] }), /Interceptos aleatorios» en «Errores»/);
    assert.match(errores({ repetidas: [rep('Velocidad', 0.6), rep('Errores', 0.5, { ondas: 3 })] }), /mismo número de ondas/);
    assert.match(errores({ repetidas: [rep('Velocidad', 0), rep('Errores', 0.5)] }), /estabilidad es la parte de la varianza que es de la persona \(ICC\): debe estar entre 0 y 1/);
    const aviso = generador({ correlaciones: [{ a: 'Velocidad', b: 'Errores', r: 0.2 }] }).validarConfiguracion();
    assert.ok(aviso.advertencias.some(a => /se sustituye por la que implica la relación entre niveles/.test(a)));
});

test('con interceptos, una variable que no se repite se relaciona igual con todas las ondas; con AR(1), atenuada como siempre', () => {
    const conW = modelo => {
        const g = generador({ niveles: [], repetidas: [rep('Velocidad', 0.6, { modelo, ondas: 3 })], correlaciones: [{ a: 'Velocidad', b: 'Ánimo', r: 0.4 }], pruebas: [esc('Velocidad', 'VE'), esc('Ánimo', 'AN')] });
        assert.deepEqual(g.validarConfiguracion().errores, []);
        const b = g.generarBaseDatos(), X = ondas(b, 'VE'), W = Array.from(b.columna('Dimension_AN').datos);
        return X.map(x => pr(x, W));
    };
    const inter = conW('intercepto'), ar1 = conW('ar1');
    assert.ok(inter.every(r => Math.abs(r - 0.4) < 0.02), `interceptos: ${inter.map(r => r.toFixed(3))}`);
    assert.ok(Math.abs(ar1[2] - 0.4 * 0.36) < 0.02, `AR(1): ${ar1.map(r => r.toFixed(3))}`);
});

test('revisión de la fase D: sin pareja declarada, la misma relación en los dos niveles (la misma onda conserva r; las distintas, atenuadas) y r = .70 ya es posible', () => {
    for (const r of [0.6, 0.7]) {
        const g = generador({ niveles: [], repetidas: [rep('Velocidad', 0.5), rep('Errores', 0.5)], correlaciones: [{ a: 'Velocidad', b: 'Errores', r }] });
        assert.deepEqual(g.validarConfiguracion().errores, []);
        const avisos = []; const w = console.warn; console.warn = (...a) => avisos.push(String(a[0])); const b = g.generarBaseDatos(); console.warn = w;
        assert.ok(!avisos.some(a => /incompatibles|más cercana/.test(a)), `r ${r}: el motor tuvo que ajustar la matriz`);
        const X = ondas(b, 'VE'), Y = ondas(b, 'ER');
        assert.ok(Math.abs(pr(X[1], Y[1]) - r) < 0.02, `misma onda (T2): ${pr(X[1], Y[1]).toFixed(3)}`);
        assert.ok(Math.abs(pr(X[0], Y[2]) - r * 0.5) < 0.02, `ondas distintas (T1, T3): ${pr(X[0], Y[2]).toFixed(3)} para ${r * 0.5}`);
    }
});

test('revisión de la fase D: una variable que no se repite por encima del límite de los interceptos se avisa con la cifra', () => {
    const g = generador({ niveles: [], repetidas: [rep('Velocidad', 0.3)], correlaciones: [{ a: 'Velocidad', b: 'Ánimo', r: 0.7 }], pruebas: [esc('Velocidad', 'VE'), esc('Ánimo', 'AN')] });
    assert.ok(g.validarConfiguracion().advertencias.some(a => /cada onda solo comparte con «Ánimo» el nivel de la persona.*no puede pasar de ±0\.69 \(pides 0\.7\)/.test(a)));
    const bien = generador({ niveles: [], repetidas: [rep('Velocidad', 0.3)], correlaciones: [{ a: 'Velocidad', b: 'Ánimo', r: 0.5 }], pruebas: [esc('Velocidad', 'VE'), esc('Ánimo', 'AN')] });
    assert.ok(!bien.validarConfiguracion().advertencias.some(a => /no puede pasar de/.test(a)));
});

