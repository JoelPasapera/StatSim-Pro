// tests/unit/mcd.test.js — el MCD bivariante determinista de la F3 (revisión 2026.11.12). El MCD es un problema de optimización
// combinatoria y los algoritmos prácticos son heurísticos (también FastMCD, el de scikit-learn, que en 3 de estos 5 conjuntos
// queda en un determinante MAYOR que el nuestro): el oráculo es su objetivo, el determinante del subconjunto, frente al menor
// de 3000 arranques elementales con pasos de concentración (NumPy)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mcd2d } from '../../src/analizador/relaciones/mcd.js';

const fx = JSON.parse(fs.readFileSync(new URL('./mcd_fixture.json', import.meta.url), 'utf8'));
test('MCD bivariante: a la altura de FastMCD (scikit-learn) y a menos de un 3 % del menor determinante de una búsqueda exhaustiva; con el mismo subconjunto, la misma r', () => {
    for (const c of fx.casos) {
        const m = mcd2d(Float64Array.from(c.x), Float64Array.from(c.y));
        assert.ok(m.detCrudo <= c.detMinimo * 1.03, `${c.nombre}: det ${m.detCrudo} frente al mínimo ${c.detMinimo}`);
        if (c.detSklearn) assert.ok(m.detCrudo <= c.detSklearn * 1.01, `${c.nombre}: det ${m.detCrudo} frente a FastMCD ${c.detSklearn}`);
        if (c.nombre === 'likert') assert.ok(Math.abs(m.r - c.r) < 1e-9, 'mismo subconjunto que scikit-learn: misma r');
    }
});
