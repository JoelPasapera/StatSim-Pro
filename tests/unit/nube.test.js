// tests/unit/nube.test.js — diagnóstico de la nube contra el oráculo independiente (tests/oracle/nube_oraculo.py): la
// regresión de cuantiles como programación lineal exacta (linprog/HiGHS), Breusch–Pagan de Koenker y White, NCA, techo
// o suelo e influencia.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { breuschPaganKoenker, regresionCuantil, analisisNecesidad, techoSuelo, influenciaLineal } from '../../src/analizador/relaciones/nube.js';

const fx = JSON.parse(fs.readFileSync(new URL('../oracle/nube_fixture.json', import.meta.url), 'utf8'));
const cerca = (a, b, tol, q) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${q}: ${a} vs ${b}`);

test('regresión de cuantiles (τ = .10, .50, .90): la búsqueda por sección áurea alcanza el óptimo de la programación lineal', () => {
    for (const c of fx) {
        const x = Float64Array.from(c.x), y = Float64Array.from(c.y);
        [0.1, 0.5, 0.9].forEach((tau, k) => {
            const r = regresionCuantil(x, y, tau), o = c.cuantiles[k];
            cerca(r.perdida, o.perdida, 1e-9, `${c.nombre} τ ${tau} pérdida`);
            cerca(r.b, o.b, 1e-6, `${c.nombre} τ ${tau} pendiente`); cerca(r.a, o.a, 1e-6, `${c.nombre} τ ${tau} constante`);
        });
    }
});

test('Breusch–Pagan de Koenker (X) y White (X, X²) iguales al oráculo', () => {
    for (const c of fx) {
        const x = Float64Array.from(c.x), e = Float64Array.from(c.e), bp = breuschPaganKoenker(e, [x]), wh = breuschPaganKoenker(e, [x, Float64Array.from(x, v => v * v)]);
        cerca(bp.lm, c.bp.lm, 1e-8, `${c.nombre} BP`); cerca(bp.p, c.bp.p, 1e-7, `${c.nombre} p BP`);
        cerca(wh.lm, c.white.lm, 1e-8, `${c.nombre} White`); cerca(wh.p, c.white.p, 1e-7, `${c.nombre} p White`);
    }
});

test('NCA: d del techo CE-FDH exacto, esquinas y d del CR-FDH (integración fina) iguales al oráculo, en ambas direcciones', () => {
    for (const c of fx) {
        const x = Float64Array.from(c.x), y = Float64Array.from(c.y);
        for (const [dir, o] of [[1, c.nca], [-1, c.ncaNeg]]) {
            const r = analisisNecesidad(x, y, { direccion: dir, B: 19 });
            cerca(r.d, o.d, 1e-12, `${c.nombre} d (${dir})`); assert.equal(r.esquinas, o.esquinas, `${c.nombre} esquinas (${dir})`); if (o.dCR === null) assert.ok(Number.isNaN(r.dCR), 'con una sola esquina el CR-FDH no está definido'); else cerca(r.dCR, o.dCR, 1e-8, `${c.nombre} dCR (${dir})`);
        }
    }
});

test('techo o suelo e influencia (Cook, estudentizados con Bonferroni, r sin influyentes) iguales al oráculo', () => {
    for (const c of fx) {
        const x = Float64Array.from(c.x), y = Float64Array.from(c.y), ts = techoSuelo(y), inf = influenciaLineal(x, y);
        cerca(ts.pMax, c.techoY.pMax, 1e-15, `${c.nombre} % máximo`); cerca(ts.pMin, c.techoY.pMin, 1e-15, `${c.nombre} % mínimo`);
        const o = c.influencia;
        cerca(inf.maxD, o.maxD, 1e-10, `${c.nombre} D máxima`); cerca(inf.principales[0].t, o.tPrincipal, 1e-10, `${c.nombre} t del principal`);
        assert.deepEqual([inf.nInfluyentes, inf.nMuyInfluyentes, inf.nAtipicos], [o.nInfluyentes, o.nMuyInfluyentes, o.nAtipicos], c.nombre);
        cerca(inf.rTodos, o.rTodos, 1e-12, `${c.nombre} r`); cerca(inf.rSin, o.rSin, 1e-12, `${c.nombre} r sin influyentes`);
    }
    assert.ok(fx.find(c => c.nombre === 'entera_atipico').influencia.nAtipicos >= 1, 'el atípico plantado se detecta');
});
