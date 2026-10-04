// tests/unit/concordancia.test.js — paso 5B: κ de Cohen (scikit-learn), κ de Fleiss y los seis CCI con sus IC (SciPy)
// contra el oráculo, y los ejemplos publicados de Shrout y Fleiss (1979) y de Fleiss (1971).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { kappaCohen, kappaFleiss, cci, intervaloKappa, interpretarKappa, interpretarCCI } from '../../src/analizador/psicometria/concordancia.js';
import { cuantilF, cdfF } from '../../src/analizador/psicometria/numerico.js';

const fx = JSON.parse(fs.readFileSync(new URL('../oracle/concordancia_fixture.json', import.meta.url), 'utf8'));
const cerca = (a, b, tol, que) => assert.ok(Math.abs(a - b) <= tol, `${que}: ${a} vs ${b}`);

test('cuantiles de F iguales a SciPy (también con gl no enteros, como los de Satterthwaite)', () => {
    fx.cuantilesF.forEach(({ p, d1, d2, q }) => { cerca(cuantilF(p, d1, d2), q, 1e-9 * Math.max(1, q), `F(${p}; ${d1}, ${d2})`); cerca(cdfF(q, d1, d2), p, 1e-12, 'cdf'); });
});

test('κ de Cohen simple, lineal y cuadrático iguales a scikit-learn; κ de Fleiss igual al oráculo', () => {
    const [a, b, c] = fx.jueces;
    for (const p of ['ninguno', 'lineal', 'cuadratico']) cerca(kappaCohen(a, b, p).kappa, fx.cohen[p], 1e-12, 'κ ' + p);
    cerca(kappaFleiss([a, b, c]).kappa, fx.fleiss, 1e-12, 'κ de Fleiss');
    const iv = intervaloKappa(idx => kappaCohen(a, b, 'ninguno', undefined, idx).kappa, a.length, { B: 500, semilla: 3 });
    assert.ok(iv.inferior < fx.cohen.ninguno && fx.cohen.ninguno < iv.superior, 'el IC bootstrap contiene el κ');
});

test('los seis CCI y sus IC iguales al oráculo (ANOVA de NumPy y F de SciPy)', () => {
    const r = cci(fx.continuo);
    r.formas.forEach((f, i) => { cerca(f.valor, fx.cci[i][0], 1e-12, f.clave); cerca(f.ic[0], fx.cci[i][1][0], 1e-8, f.clave + ' IC inf'); cerca(f.ic[1], fx.cci[i][1][1], 1e-8, f.clave + ' IC sup'); });
});

test('ejemplos publicados: Shrout y Fleiss (1979) y Fleiss (1971)', () => {
    const sf = [[9, 2, 5, 8], [6, 1, 3, 2], [8, 4, 6, 8], [7, 1, 2, 6], [10, 5, 6, 9], [6, 2, 4, 7]];
    assert.deepEqual(cci([0, 1, 2, 3].map(j => sf.map(f => f[j]))).formas.map(f => f.valor.toFixed(2)), ['0.17', '0.29', '0.71', '0.44', '0.62', '0.91']);
    const cuentas = [[0, 0, 0, 0, 14], [0, 2, 6, 4, 2], [0, 0, 3, 5, 6], [0, 3, 9, 2, 0], [2, 2, 8, 1, 1], [7, 7, 0, 0, 0], [3, 2, 6, 3, 0], [2, 5, 3, 2, 2], [6, 5, 2, 1, 0], [0, 2, 2, 3, 7]];
    const ev = Array.from({ length: 14 }, (_, r) => cuentas.map(c => { let s = 0; for (let j = 0; j < 5; j++) { s += c[j]; if (r < s) return j + 1; } return 5; }));
    assert.equal(kappaFleiss(ev).kappa.toFixed(3), '0.210');
    assert.deepEqual([-0.1, 0.15, 0.3, 0.5, 0.7, 0.9].map(interpretarKappa), ['pobre', 'leve', 'aceptable', 'moderada', 'considerable', 'casi perfecta']);
    assert.deepEqual([0.4, 0.6, 0.8, 0.95].map(interpretarCCI), ['pobre', 'moderada', 'buena', 'excelente']);
});

test('revisión 2026.10.17: acuerdo perfecto → CCI = 1 con intervalo [1, 1] (antes, NaN)', () => {
    const x = [3, 5, 2, 8, 6, 4, 7];
    const r = cci([x, x.slice(), x.slice()]);
    assert.ok(r.perfecto && r.formas.every(f => f.valor === 1 && f.ic[0] === 1 && f.ic[1] === 1));
});

test('revisión 2026.10.18: redacción de validez con varios factores bajo el criterio (concordancia verbal y lista con «y»)', async () => {
    const { redactarValidez } = await import('../../src/analizador/psicometria/validez.js');
    const f = (nombre, CR, AVE) => ({ nombre, k: 4, CR, AVE, raizAVE: Math.sqrt(AVE), maxR: 0.3, conQuien: 'X', fornellLarcker: true });
    const t = redactarValidez({ porFactor: [f('F1', 0.6, 0.3), f('F2', 0.65, 0.35), f('F3', 0.8, 0.55)], htmt: [], htmtMax: 0.4, avisos: [], nombres: ['F1', 'F2', 'F3'] });
    assert.match(t, /Los factores F1 y F2 no alcanzaron la fiabilidad compuesta mínima/);
});
