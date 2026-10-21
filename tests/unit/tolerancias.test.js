// @ts-check
// tests/unit/tolerancias.test.js — errores típicos de muestreo del informe en modo no exacto (2026.12.02).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Z_TOLERANCIA, curtosis, eeMedia, eeDE, eeCorrelacion, eeFiabilidad } from '../../src/simulador/dominio/tolerancias.js';

let s = 7 >>> 0;
const u = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const nrm = () => Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u());

test('con datos normales, las fórmulas coinciden con las de la normal', () => {
    const n = 20000, x = new Float64Array(n), y = new Float64Array(n);
    for (let i = 0; i < n; i++) { const a = nrm(); x[i] = a; y[i] = 0.5 * a + Math.sqrt(0.75) * nrm(); }
    assert.ok(Math.abs(curtosis(x) - 3) < 0.15);
    assert.ok(Math.abs(eeDE(x) / (1 / Math.sqrt(2 * n)) - 1) < 0.06, 'DE/√(2n)');
    assert.ok(Math.abs(eeCorrelacion(x, y) / ((1 - 0.25) / Math.sqrt(n)) - 1) < 0.06, '(1 − r²)/√n');
    assert.equal(eeMedia(10, 400), 0.5);
    assert.ok(Math.abs(eeFiabilidad(0.8, 10, 120) - 0.2 * Math.sqrt(20 / (9 * 120))) < 1e-12);
    assert.equal(Z_TOLERANCIA, 3);
});

test('con colas pesadas, el error típico de la r crece (la fórmula de la normal se quedaría corta)', () => {
    const n = 20000, x = new Float64Array(n), y = new Float64Array(n);
    for (let i = 0; i < n; i++) { const a = Math.exp(nrm()); x[i] = a; y[i] = a + Math.exp(nrm()); }
    let mx = 0, my = 0; for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; } mx /= n; my /= n;
    let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
    const r = sxy / Math.sqrt(sxx * syy);
    assert.ok(eeCorrelacion(x, y) > 1.5 * (1 - r * r) / Math.sqrt(n));
});
