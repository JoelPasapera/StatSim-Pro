// @ts-check
// tests/unit/asimetria.test.js — medcouple y límites del boxplot ajustado (revisión 2026.11.25). Los valores de referencia
// salen de una implementación independiente en Python escrita desde la definición (Brys, Hubert y Struyf, 2004).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { limitesAjustados, medcouple } from '../../src/analizador/relaciones/asimetria.js';

test('medcouple: coincide con la referencia en muestras enteras con empates en la mediana', () => {
    assert.equal(medcouple([15, 17, 21, 18, 17, 34, 18]), 0.25);
    assert.ok(Math.abs(medcouple([14, 29, 19, 16, 23, 19, 18, 23, 35, 20, 28, 34, 15, 16, 22, 14, 17, 25, 23, 20]) - 0.2857142857142857) < 1e-12);
});

test('medcouple: 0 en una muestra simétrica, negativo con la cola a la izquierda; límites de Tukey si es 0; sin límites con RIC = 0', () => {
    assert.equal(medcouple([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 0);
    assert.ok(medcouple([1, 6, 8, 9, 9.5, 10, 10.2, 10.4]) < 0);
    assert.deepEqual(limitesAjustados([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), { bajo: -3.5, alto: 14.5, mc: 0 });
    const l = limitesAjustados([5, 5, 5, 5, 5, 5, 9]);
    assert.equal(l.bajo, -Infinity); assert.equal(l.alto, Infinity);
});

test('el mecanismo de la revisión: en una lognormal, los límites ajustados dejan fuera mucho menos cola natural que los simétricos', () => {
    let a = 11 >>> 0; const u = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const v = Array.from({ length: 2000 }, () => Math.exp(0.6 * Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u())));
    const s = Float64Array.from(v).sort(), q = (p) => { const h = (s.length - 1) * p, i = Math.floor(h); return s[i] + (h - i) * (s[i + 1] - s[i]); };
    const tukeyAlto = q(0.75) + 1.5 * (q(0.75) - q(0.25)), ajustado = limitesAjustados(v);
    const fueraTukey = v.filter(x => x > tukeyAlto).length / v.length, fueraAjustado = v.filter(x => x > ajustado.alto).length / v.length;
    assert.ok(ajustado.mc > 0.05, `medcouple ${ajustado.mc}`);
    assert.ok(fueraAjustado < 0.01 && fueraTukey > 2 * fueraAjustado + 0.01, `simétricos ${(100 * fueraTukey).toFixed(1)} %, ajustados ${(100 * fueraAjustado).toFixed(1)} %`);
});
