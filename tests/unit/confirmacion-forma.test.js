// tests/unit/confirmacion-forma.test.js — confirmaciones de la forma contra el oráculo independiente de SciPy
// (tests/oracle/forma_confirmacion_oraculo.py): P-spline con GCV, Robin Hood, regresión interrumpida con HC3,
// Lind–Mehlum con IC de Fieller y TOST de la correlación.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pruebaDosRectas, pruebaLindMehlum, equivalenciaCorrelacion } from '../../src/analizador/relaciones/confirmacion-forma.js';

const fx = JSON.parse(fs.readFileSync(new URL('../oracle/forma_confirmacion_fixture.json', import.meta.url), 'utf8'));
const cerca = (a, b, q, rel = 1e-8) => assert.ok(Math.abs(a - b) <= rel * Math.max(1, Math.abs(b)) + 1e-300, `${q}: ${a} vs ${b}`);
const cercaP = (a, b, q) => assert.ok(Math.abs(a - b) <= 1e-6 * b + 1e-14, `${q}: ${a} vs ${b}`);

test('dos rectas (Simonsohn, 2018): P-spline, cortes de Robin Hood y pendientes con HC3 iguales al oráculo', () => {
    for (const d of fx.forma) {
        const r = pruebaDosRectas(d.x, d.y, d.extremo), o = d.dosRectas;
        assert.equal(r.lambda, o.lambda, `${d.nombre}: λ elegido por GCV`); cerca(r.edf, o.edf, `${d.nombre} edf`);
        cerca(r.xExtremo, o.xExtremo, `${d.nombre} extremo`); cerca(r.corteInicial, o.corteInicial, `${d.nombre} corte inicial`); cerca(r.corte, o.corte, `${d.nombre} corte`);
        for (const lado of ['bajo', 'alto']) { for (const k of ['b', 'ee', 't']) cerca(r[lado][k], o[lado][k], `${d.nombre} ${lado}.${k}`); cercaP(r[lado].p, o[lado].p, `${d.nombre} ${lado}.p`); }
        assert.equal(r.confirmada, o.confirmada, `${d.nombre}: conclusión`);
    }
    // ∩ y U reales se confirman; la logarítmica (monotónica) no, que es el falso positivo de la cuadrática (Simonsohn, 2018).
    // La J de este conjunto tampoco: su rama descendente es corta (≈ 1 de cada 9 casos) y su pendiente no llega a ser
    // significativa; es falta de potencia de esa rama, no un fallo (lo confirman el oráculo y el motor por igual)
    const conclusion = Object.fromEntries(fx.forma.map(d => [d.nombre, d.dosRectas.confirmada]));
    assert.deepEqual([conclusion.u_invertida, conclusion.u, conclusion.logaritmica], [true, true, false]);
});

test('Lind y Mehlum (2010) con el IC de Fieller (1954) del vértice, iguales al oráculo', () => {
    for (const d of fx.forma) {
        const r = pruebaLindMehlum(d.x, d.y, d.extremo), o = d.lindMehlum;
        for (const lado of ['izquierda', 'derecha']) for (const k of ['s', 'ee', 't']) cerca(r[lado][k], o[lado][k], `${d.nombre} ${lado}.${k}`);
        cerca(r.t, o.t, `${d.nombre} t`); cercaP(r.p, o.p, `${d.nombre} p`); cerca(r.vertice, o.vertice, `${d.nombre} vértice`);
        if (o.ic) r.ic.forEach((v, k) => cerca(v, o.ic[k], `${d.nombre} IC de Fieller`)); else assert.equal(r.ic, null);
    }
});

test('TOST de la correlación (Lakens, 2017) igual al oráculo', () => {
    for (const o of fx.tost) {
        const r = equivalenciaCorrelacion(o.r, o.n, o.limite);
        cercaP(r.p, o.p, `TOST n = ${o.n}`); r.ic.forEach((v, k) => cerca(v, o.ic[k], 'IC 90 %')); cerca(r.limiteMinimo, o.limiteMinimo, 'límite mínimo');
        assert.equal(r.equivalente, o.equivalente);
    }
});
