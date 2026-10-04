// tests/integration/diagnostico-forma-revision.test.js — regresiones de la revisión 2026.10.30 del diagnóstico de forma.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagnosticarForma } from '../../src/analizador/relaciones/diagnostico-forma.js';
import { redactarParrafo } from '../../src/analizador/relaciones/diagnostico-forma-redaccion.js';

let a = 2030 >>> 0;
const u01 = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const nrm = () => Math.sqrt(-2 * Math.log(u01() || 1e-12)) * Math.cos(2 * Math.PI * u01());

test('base grande con puntajes enteros: se decide con la base completa (antes, submuestra de 1 500 y «sin relación» con p = 10⁻²³) y en segundos (antes, 35 s)', () => {
    const n = 40000, x = new Float64Array(n), y = new Float64Array(n);
    for (let i = 0; i < n; i++) { x[i] = Math.round(30 + 6 * nrm()); y[i] = (0.05 * (x[i] - 30)) / 6 + nrm(); }
    const t0 = performance.now(), d = diagnosticarForma(x, y, { B: 19 }), s = (performance.now() - t0) / 1000;
    assert.equal(d.pruebas.n, n, 'pruebas sobre la base completa'); assert.equal(d.pruebas.submuestra, false);
    assert.ok(d.coeficientes.r.p < 1e-10 && d.categoria === 'lineal', `${d.categoria} con p(r) = ${d.coeficientes.r.p}`);
    assert.ok(s < 20, `${s.toFixed(1)} s`);
});

test('X continua con más de 2 000 valores distintos: submuestra combinada por Bonferroni con la r completa, sin contradecir a la tabla', () => {
    const n = 20000, x = new Float64Array(n), y = new Float64Array(n);
    for (let i = 0; i < n; i++) { x[i] = 30 + 6 * nrm(); y[i] = (0.06 * (x[i] - 30)) / 6 + nrm(); }
    const d = diagnosticarForma(x, y, { B: 19 });
    assert.equal(d.pruebas.submuestra, true); assert.equal(d.pruebas.relacion.metodo, 'bonferroni');
    assert.ok(d.coeficientes.r.p < 1e-6 && d.categoria !== 'sin-relacion', `${d.categoria} con p(r) = ${d.coeficientes.r.p}`);
    assert.ok(redactarParrafo(d, 'X', 'Y').includes('combinada por Bonferroni'));
});

test('relación lineal con un ítem Likert de 5 puntos: τ-b de Kendall, con su justificación', () => {
    const x = [], y = [];
    for (let i = 0; i < 400; i++) { const z = nrm(); x.push(Math.round(30 + 6 * z)); y.push(Math.min(5, Math.max(1, Math.round(3 + 0.9 * z + 0.8 * nrm())))); }
    const d = diagnosticarForma(x, y, { B: 19 });
    assert.deepEqual([d.categoria, d.coefRecomendado, d.categorias.y], ['lineal', 'τ', 5]);
    assert.ok(redactarParrafo(d, 'Estrés', 'Ítem 7').includes('como Ítem 7 tiene pocas categorías (5)'));
});

test('«sin relación» con la r significativa por sí sola: el párrafo lo reconoce en lugar de contradecir a la tabla', () => {
    let visto = false;
    for (let k = 0; k < 400 && !visto; k++) {
        const x = [], y = []; for (let i = 0; i < 300; i++) { const xi = Math.round(30 + 6 * nrm()); x.push(xi); y.push((0.13 * (xi - 30)) / 6 + nrm()); }
        const d = diagnosticarForma(x, y, { B: 19 });
        if (d.categoria === 'sin-relacion' && d.coeficientes.r.p < 0.05) { visto = true; const p = redactarParrafo(d, 'X', 'Y'); assert.ok(p.includes('por sí sola, sí fue significativa') && !p.includes('No se halló evidencia de relación'), p); }
    }
    assert.ok(visto, 'se encontró un caso de prueba');
});
