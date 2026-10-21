// @ts-check
// tests/unit/hermite-numerica.test.js — coeficientes de Hermite numéricos (2026.12.03), contra resultados teóricos conocidos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coeficientesHermite, rDeCoeficientes, rhoDeCoeficientes } from '../../src/simulador/dominio/hermite-numerica.js';

test('con la identidad, r(ρ) = ρ', () => {
    const c = coeficientesHermite(z => z);
    assert.ok(Math.abs(c[0] - 1) < 1e-6 && Math.max(...Array.from(c.slice(1), Math.abs)) < 1e-6);
    for (const rho of [-0.8, -0.3, 0.2, 0.7]) assert.ok(Math.abs(rDeCoeficientes(c, c, rho) - rho) < 1e-6);
});

test('con la función signo (escalonada extrema), r(ρ) = (2/π)·arcsen(ρ) (Sheppard), y la inversa la recupera', () => {
    const c = coeficientesHermite(z => (z >= 0 ? 1 : -1));
    for (const rho of [-0.6, 0.3, 0.76]) {
        const r = rDeCoeficientes(c, c, rho);
        assert.ok(Math.abs(r - (2 / Math.PI) * Math.asin(rho)) < 0.005, `ρ ${rho}: ${r}`);
        assert.ok(Math.abs(rhoDeCoeficientes(c, c, r).rho - rho) < 1e-6);
    }
    assert.equal(rhoDeCoeficientes(c, c, 0.999).limitada, true, 'una r inalcanzable se marca');
});
