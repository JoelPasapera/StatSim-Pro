// tests/integration/simulador-paneles.test.js — relaciones en el tiempo (panel cruzado) en el Simulador (Atlas, fase E1). Los
// efectos se comprueban con una regresión por mínimos cuadrados independiente del motor y del informe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeneradorDatos } from '../../src/simulador/dominio/generador.js';
import { estructuraPanel } from '../../src/simulador/dominio/paneles.js';

const esc = (nombre, corto) => ({ nombre, nombreCorto: corto, prueba: 'T', tipo: 'dimension', numItems: 20, media: 60, desviacion: 10, minimo: 1, maximo: 5, alfa: 0.85, distribucion: 'normal', invertidos: 0 });
const rep = (variable, estabilidad, extra = {}) => ({ variable, ondas: 4, estabilidad, cambio: 0, agrupacion: '', cambioGrupo: null, modelo: 'ar1', dePendientes: 0, rInterceptoPendiente: 0, ...extra });
function generador({ paneles = [{ tipo: 'reciproca', x: 'Estrés', y: 'Sueño', r: 0.3, cXY: 0.25, cYX: 0.1 }], repetidas = [rep('Estrés', 0.6), rep('Sueño', 0.5)], correlaciones = [], exactas = true, n = 400 }) {
    const g = new GeneradorDatos();
    g.configuracion = { tamanoMuestra: n, semilla: 5, generarPercentiles: false, correlacionesExactas: exactas, indiceFiabilidad: 'alfa', heterogeneidadItems: 'leve', variablesPorTest: { T: { variable: 'R', rIntra: 0 } },
        pruebas: [esc('Estrés', 'ES'), esc('Sueño', 'SU'), esc('Ánimo', 'AN')], sociodemograficos: [], correlaciones, diferenciasGrupo: [], modelos: [], medidasRepetidas: repetidas, niveles: [], paneles,
        estructuras: [], desenlaces: [], cortes: [], concordancias: [], realismo: {} };
    g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas);
    return g;
}
const z = a => { const m = a.reduce((s, x) => s + x) / a.length, s = Math.sqrt(a.reduce((q, x) => q + (x - m) ** 2, 0) / (a.length - 1)); return a.map(x => (x - m) / s); };
const ols2 = (y, x1, x2) => { let a = 0, b = 0, c = 0, d1 = 0, d2 = 0; for (let i = 0; i < y.length; i++) { a += x1[i] * x1[i]; b += x1[i] * x2[i]; c += x2[i] * x2[i]; d1 += x1[i] * y[i]; d2 += x2[i] * y[i]; } const det = a * c - b * b; return [(c * d1 - b * d2) / det, (a * d2 - b * d1) / det]; };
const ondas = (b, sigla) => b.nombres().filter(c => c === `Dimension_${sigla}` || c.startsWith(`Dimension_${sigla}_T`)).sort().map(c => z(Array.from(b.columna(c).datos)));

test('recíproca exacta: efectos cruzados por regresión independiente en cada desfase, informe sin ✗ y estabilidades de la tabla VI según la dinámica', () => {
    const g = generador({ correlaciones: [{ a: 'Estrés', b: 'Ánimo', r: 0.4 }] });
    assert.deepEqual(g.validarConfiguracion().errores, []);
    const b = g.generarBaseDatos(), X = ondas(b, 'ES'), Y = ondas(b, 'SU');
    for (let t = 0; t < 3; t++) {
        assert.ok(Math.abs(ols2(Y[t + 1], Y[t], X[t])[1] - 0.25) < 0.01, `X→Y desfase ${t + 1}`);
        assert.ok(Math.abs(ols2(X[t + 1], X[t], Y[t])[1] - 0.1) < 0.01, `Y→X desfase ${t + 1}`);
    }
    const inf = g.informePedidoObtenido(b);
    assert.deepEqual(inf.filter(f => f.ok === false).map(f => f.variable), []);
    assert.equal(inf.filter(f => /Relación en el tiempo/.test(f.variable) && f.ok === true).length, 5);
    assert.equal(inf.find(f => f.variable === 'Estrés: T1 → T3 estabilidad').pedido, '0.380');
});

test('rezagada: Y no predice a X (efecto 0), con el veredicto correspondiente; sin modo exacto, sin falsas alarmas', () => {
    const g = generador({ paneles: [{ tipo: 'rezagada', x: 'Estrés', y: 'Sueño', r: 0.3, cXY: 0.3, cYX: 0 }] }), b = g.generarBaseDatos(), inf = g.informePedidoObtenido(b).filter(f => /Relación en el tiempo/.test(f.variable));
    assert.equal(inf.filter(f => f.ok === false).length, 0);
    assert.match(inf.find(f => f.tipo === 'fenómeno').obtenido, /X precede a Y/);
    const ne = generador({ exactas: false, n: 500 }), infNe = ne.informePedidoObtenido(ne.generarBaseDatos()).filter(f => /Relación en el tiempo|T1 → T/.test(f.variable));
    assert.equal(infNe.filter(f => f.ok === false).length, 0, JSON.stringify(infNe.map(f => [f.variable, f.pedido, f.obtenido])));
});

test('validación: sin AR(1), distinto número de ondas, dinámica imposible, efecto Y → X en la rezagada y escala en dos relaciones son errores', () => {
    const errores = op => generador(op).validarConfiguracion().errores.join(' | ');
    assert.match(errores({ repetidas: [rep('Estrés', 0.6), rep('Sueño', 0.5, { modelo: 'intercepto' })] }), /necesita el modelo AR\(1\) en «Sueño»/);
    assert.match(errores({ repetidas: [rep('Estrés', 0.6), rep('Sueño', 0.5, { ondas: 3 })] }), /mismo número de ondas/);
    assert.match(errores({ repetidas: [rep('Estrés', 0.95), rep('Sueño', 0.9)], paneles: [{ tipo: 'rezagada', x: 'Estrés', y: 'Sueño', r: 0.5, cXY: 0.6, cYX: 0 }] }), /dinámica es imposible/);
    assert.match(errores({ paneles: [{ tipo: 'rezagada', x: 'Estrés', y: 'Sueño', r: 0.3, cXY: 0.2, cYX: 0.1 }] }), /en la relación rezagada el efecto Y → X es 0/);
    assert.match(errores({ repetidas: [rep('Estrés', 0.6), rep('Sueño', 0.5), rep('Ánimo', 0.5)], paneles: [{ tipo: 'rezagada', x: 'Estrés', y: 'Sueño', r: 0.3, cXY: 0.2, cYX: 0 }, { tipo: 'rezagada', x: 'Estrés', y: 'Ánimo', r: 0.2, cXY: 0.1, cYX: 0 }] }), /ya está en otra relación en el tiempo/);
});

test('revisión de la fase E1: otra escala repetida se propaga por la dinámica (el efecto cruzado llega: r(V₁, Y₂) = c·r(X₁, V₁)), y dos paneles relacionados, por las dos', () => {
    const pr = (u, w) => { const n = u.length, mu = u.reduce((a, c) => a + c) / n, mw = w.reduce((a, c) => a + c) / n; let s = 0, p = 0, q = 0; for (let i = 0; i < n; i++) { s += (u[i] - mu) * (w[i] - mw); p += (u[i] - mu) ** 2; q += (w[i] - mw) ** 2; } return s / Math.sqrt(p * q); };
    const g = generador({ repetidas: [rep('Estrés', 0.6), rep('Sueño', 0.5), rep('Ánimo', 0.7)], correlaciones: [{ a: 'Estrés', b: 'Ánimo', r: 0.4 }] });
    assert.deepEqual(g.validarConfiguracion().errores, []);
    const b = g.generarBaseDatos(), c = n => Array.from(b.columna(n).datos);
    assert.ok(Math.abs(pr(c('Dimension_AN'), c('Dimension_SU_T2')) - 0.25 * 0.4) < 0.01, 'antes salía 0');
    assert.equal(g.informePedidoObtenido(b).filter(f => f.ok === false).length, 0);
    const g2 = new GeneradorDatos(), esc4 = [['Estrés', 'ES'], ['Sueño', 'SU'], ['Calma', 'CA'], ['Ánimo', 'AN']].map(([nombre, corto]) => ({ nombre, nombreCorto: corto, prueba: 'T', tipo: 'dimension', numItems: 20, media: 60, desviacion: 10, minimo: 1, maximo: 5, alfa: 0.85, distribucion: 'normal', invertidos: 0 }));
    g2.configuracion = { ...generador({}).configuracion, pruebas: esc4, medidasRepetidas: [rep('Estrés', 0.6), rep('Sueño', 0.5), rep('Calma', 0.7), rep('Ánimo', 0.6)], correlaciones: [{ a: 'Estrés', b: 'Calma', r: 0.3 }],
        paneles: [{ tipo: 'reciproca', x: 'Estrés', y: 'Sueño', r: 0.3, cXY: 0.25, cYX: 0.1 }, { tipo: 'rezagada', x: 'Calma', y: 'Ánimo', r: 0.2, cXY: 0.3, cYX: 0 }] };
    g2.configuracion.gruposPruebas = g2.agruparPruebas(esc4);
    assert.deepEqual(g2.validarConfiguracion().errores, []);
    const b2 = g2.generarBaseDatos(), c2 = n => Array.from(b2.columna(n).datos);
    const A1 = estructuraPanel({ estabX: 0.6, estabY: 0.5, r: 0.3, cXY: 0.25, cYX: 0.1 }).A, A2 = estructuraPanel({ estabX: 0.7, estabY: 0.6, r: 0.2, cXY: 0.3 }).A;
    assert.ok(Math.abs(pr(c2('Dimension_ES_T2'), c2('Dimension_CA_T2')) - A1[0][0] * 0.3 * A2[0][0]) < 0.01);
    assert.ok(Math.abs(pr(c2('Dimension_ES_T2'), c2('Dimension_AN_T2')) - A1[0][0] * 0.3 * A2[1][0]) < 0.01, 'la relación con Ánimo llega por la dinámica de Calma');
    assert.equal(g2.informePedidoObtenido(b2).filter(f => f.ok === false).length, 0);
});

