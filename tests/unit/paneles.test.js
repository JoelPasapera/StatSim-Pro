// tests/unit/paneles.test.js — matemática del panel cruzado (Atlas, fase E1)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correlacionEntreOndas, estructuraPanel, fenomenoPanel, propagarExogena, regresionRezagada } from '../../src/simulador/dominio/paneles.js';

test('la estabilidad (r entre ondas consecutivas) se conserva y la regresión recupera los efectos cruzados y autorregresivos', () => {
    const e = estructuraPanel({ estabX: 0.6, estabY: 0.5, r: 0.3, cXY: 0.25, cYX: 0.1 }), M = correlacionEntreOndas(e, 2, 1);
    assert.ok(Math.abs(M[0][0] - 0.6) < 1e-12 && Math.abs(M[1][1] - 0.5) < 1e-12);
    const rY = regresionRezagada(M[1][1], M[1][0], 0.3), rX = regresionRezagada(M[0][0], M[0][1], 0.3);
    assert.ok(Math.abs(rY.cruzado - 0.25) < 1e-12 && Math.abs(rY.propio - e.d) < 1e-12 && Math.abs(rX.cruzado - 0.1) < 1e-12 && Math.abs(rX.propio - e.a) < 1e-12);
});

test('con efectos cruzados, la r entre ondas lejanas no es la estabilidad elevada a la distancia; sin ellos, sí', () => {
    assert.ok(Math.abs(correlacionEntreOndas(estructuraPanel({ estabX: 0.6, estabY: 0.5, r: 0.3, cXY: 0.25, cYX: 0.1 }), 3, 1)[0][0] - 0.36) > 0.01);
    assert.ok(Math.abs(correlacionEntreOndas(estructuraPanel({ estabX: 0.6, estabY: 0.5, r: 0.3, cXY: 0, cYX: 0 }), 3, 1)[0][0] - 0.36) < 1e-12);
});

test('viabilidad, propagación de una exógena y veredictos', () => {
    assert.equal(estructuraPanel({ estabX: 0.95, estabY: 0.9, r: 0.5, cXY: 0.6 }).posible, false);
    const e = estructuraPanel({ estabX: 0.6, estabY: 0.5, r: 0.3, cXY: 0.25, cYX: 0.1 }), v = propagarExogena(e, 0.4, 0, 2);
    assert.ok(Math.abs(v[0] - e.a * 0.4) < 1e-12 && Math.abs(v[1] - 0.25 * 0.4) < 1e-12);
    assert.match(fenomenoPanel('rezagada', 0.25, 0), /X precede a Y/);
    assert.match(fenomenoPanel('reciproca', 0.25, 0.1), /domina X → Y/);
    assert.match(fenomenoPanel('reciproca', 0.2, 0.18), /equilibrada/);
});
