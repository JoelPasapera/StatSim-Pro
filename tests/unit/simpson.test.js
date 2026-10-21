// @ts-check
// tests/unit/simpson.test.js — la paradoja de Simpson (Atlas): la r de toda la base implicada y el veredicto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rTotalSimpson, fenomenoSimpson } from '../../src/simulador/dominio/simpson.js';

test('la r total coincide con la descomposición del motor (r = s_X·s_Y·ρ + b) y con un valor calculado a mano', () => {
    for (const [rDentro, dX, dY, v] of [[0.4, 1.5, -1.5, 0.25], [-0.3, 0.8, 1.2, 0.21], [0.6, 0, 2, 0.16], [0.2, -2.5, 1, 0.25]]) {
        const sX = 1 / Math.sqrt(1 + v * dX * dX), sY = 1 / Math.sqrt(1 + v * dY * dY), b = v * dX * dY * sX * sY;
        assert.ok(Math.abs(rTotalSimpson({ rDentro, dX, dY, varianzaCodigo: v }) - (sX * sY * rDentro + b)) < 1e-12);
    }
    // (0.4 − 0.25·2.25) / (1 + 0.25·2.25) = −0.1625 / 1.5625
    assert.ok(Math.abs(rTotalSimpson({ rDentro: 0.4, dX: 1.5, dY: -1.5, varianzaCodigo: 0.25 }) + 0.104) < 1e-12);
    assert.equal(rTotalSimpson({ rDentro: 0.4, dX: 0, dY: 0, varianzaCodigo: 0.25 }), 0.4, 'sin diferencias entre grupos, la misma r');
});

test('el veredicto: inversión, relación oculta, exagerada o parecida', () => {
    assert.match(fenomenoSimpson(0.4, -0.104).texto, /se invierte.*paradoja de Simpson/);
    assert.match(fenomenoSimpson(0.4, 0.15).texto, /se debilita/);
    assert.match(fenomenoSimpson(0.2, 0.55).texto, /se exagera/);
    assert.equal(fenomenoSimpson(0.4, 0.38).hay, false);
    assert.equal(fenomenoSimpson(0.02, -0.03).hay, false, 'dos r casi nulas de signo distinto no son una inversión');
});
