// tests/unit/reglas-coherencia.test.js — la DE mínima para un total entero «normal» y el rechazo de Kolmogorov–Smirnov por
// discreción (revisión 2026.11.17). El control de Monte Carlo usa la prueba REAL del Analizador: si esa prueba cambia, la
// curva de calibración no puede quedar desfasada en silencio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReglasCoherencia as R } from '../../src/simulador/dominio/reglas-coherencia.js';
import { AnalizadorEstadistico as an } from '../../src/analizador/estadistica.js';

test('la regla solo aplica con N ≥ 50 (con menos se usa Shapiro–Wilk) y vale ⌈1,1·√N⌉', () => {
    assert.equal(R.deMinimaNormal(30), 0);
    assert.equal(R.deMinimaNormal(100), 11);
    assert.equal(R.deMinimaNormal(300), 20);
});

test('la curva de rechazo: anclajes, monotonía y el umbral de la regla en ≈ 13 %', () => {
    assert.equal(Math.round(R.rechazoKS(1.1 * Math.sqrt(300), 300)), 13);
    assert.equal(Math.round(R.rechazoKS(6, 300)), 79);
    let previo = 101;
    for (let s = 0.2; s <= 3.2; s += 0.05) { const p = R.rechazoKS(s * Math.sqrt(400), 400); assert.ok(p <= previo + 1e-9); previo = p; }
    assert.equal(R.rechazoKS(0, 300), null);
});

test('control de Monte Carlo con la prueba de Kolmogorov–Smirnov del Analizador (N = 300, s = 0,5: la curva dice 43 %)', () => {
    let a = 2026 >>> 0; const u = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const nrm = () => Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u());
    const N = 300, sigma = 0.5 * Math.sqrt(N), repl = 300; let k = 0;
    for (let r = 0; r < repl; r++) { const v = Array.from({ length: N }, () => Math.round(500 + sigma * nrm())); if (an.kolmogorovSmirnov(v).pValor < 0.05) k++; }
    assert.ok(Math.abs(100 * k / repl - R.rechazoKS(sigma, N)) < 9, `rechazo observado ${(100 * k / repl).toFixed(1)} %`);
});
