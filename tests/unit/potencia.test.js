// @ts-check
// tests/unit/potencia.test.js — (2027.01.18) la potencia y el tamaño de muestra (core/stats/potencia.js y
// potencia-mediacion.js) contra el oráculo tests/oracle/potencia_oraculo.py (las no centrales de SciPy, la densidad exacta de r
// integrada con quad, los n recorridos uno a uno y la mediación por Monte Carlo con los generadores del programa reproducidos
// bit a bit), y contra los valores publicados de G*Power 3.1 (Faul et al., 2007, 2009).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { potencia, tamanoMuestra, efectoDetectable, curvaPotencia, densidadR } from '../../src/core/stats/potencia.js';
import { potenciaMediacion, tamanoMuestraMediacion } from '../../src/core/stats/potencia-mediacion.js';
import { integrar } from '../../src/core/stats/integracion.js';
import { cuantilChi2 } from '../../src/core/stats/distribuciones.js';

const O = JSON.parse(fs.readFileSync(new URL('../oracle/potencia_fixture.json', import.meta.url), 'utf8'));
/** @param {number} x @param {number} ref @param {number} tol @param {string} que */
const cerca = (x, ref, tol, que) => assert.ok(Math.abs(x - ref) <= tol, `${que}: ${x} frente a ${ref}`);

test('el tamaño de muestra de cada prueba, igual al del oráculo (recorriendo los n uno a uno)', () => {
    for (const c of O.tamanos) {
        const r = tamanoMuestra(c.prueba, c.efecto, c.opciones);
        assert.ok(r, JSON.stringify(c));
        assert.equal(r.n, c.n, `${c.prueba} ${c.efecto} ${JSON.stringify(c.opciones)}`);
        cerca(r.potenciaReal, c.potenciaReal, 1e-8, `potencia real de ${c.prueba} ${c.efecto}`);
    }
});

test('la potencia con un n dado y el efecto detectable, iguales al oráculo', () => {
    for (const c of O.potencias) cerca(potencia(c.prueba, c.efecto, c.n, c.opciones), c.potencia, 1e-9, `${c.prueba} ${c.efecto} n = ${c.n}`);
    for (const c of O.detectables) cerca(/** @type {number} */ (efectoDetectable(c.prueba, c.n, c.opciones)), c.efecto, 1e-7, `efecto detectable de ${c.prueba} con n = ${c.n}`);
});

test('los valores publicados de G*Power 3.1', () => {
    const ver = (/** @type {any} */ r, /** @type {number} */ n, /** @type {number | null} */ total, /** @type {number | null} */ pot) => { assert.equal(r.n, n); if (total !== null) assert.equal(r.total, total); if (pot !== null) cerca(r.potenciaReal, pot, 5e-8, 'potencia real'); };
    ver(tamanoMuestra('t2', 0.5), 64, 128, 0.8014596);   // t de dos grupos, d = 0.5
    ver(tamanoMuestra('t1', 0.5), 34, 34, 0.8077775);    // pareada, dz = 0.5
    ver(tamanoMuestra('r', 0.3), 84, 84, null);          // modelo normal bivariado, ρ = .3
    ver(tamanoMuestra('anova', 0.25, { k: 3 }), 53, 159, 0.8048873);   // ANOVA, f = .25, 3 grupos
    ver(tamanoMuestra('chi2', 0.3, { gl: 1 }), 88, 88, null);
    ver(tamanoMuestra('regresion', 0.15, { predictores: 3 }), 77, 77, 0.8017655);
    // con ρ = 0, la potencia es α; la densidad de r integra 1; el cuantil de la χ²
    cerca(potencia('r', 0, 30), 0.05, 1e-10, 'potencia con ρ = 0');
    cerca(integrar(x => densidadR(x, 0.6, 12), -1, 1).valor, 1, 1e-10, 'la densidad de r integra 1');
    cerca(cuantilChi2(0.95, 1), 3.841458820694124, 1e-10, 'χ²(1) del 95 %'); cerca(cuantilChi2(0.05, 10), 3.940299136119273, 1e-10, 'χ²(10) del 5 %');
    // la curva: creciente y en las unidades del tamaño de muestra
    const curva = curvaPotencia('anova', 0.25, 10, 100, { k: 3, puntos: 10 });
    for (let i = 1; i < curva.length; i++) assert.ok(/** @type {any} */ (curva[i]).potencia > /** @type {any} */ (curva[i - 1]).potencia);
    cerca(/** @type {any} */ (curva.find(p => p.n === 50) || { potencia: potencia('anova', 0.25, 150, { k: 3 }) }).potencia, potencia('anova', 0.25, 150, { k: 3 }), 1e-12, 'n por grupo');
    assert.equal(tamanoMuestra('t2', 0), null);
});

test('la mediación por Monte Carlo: las mismas bases y decisiones que el oráculo, y el mismo tamaño de muestra', () => {
    for (const c of O.mediacion) assert.equal(potenciaMediacion(c.a, c.b, c.cp, c.n, { R: c.R }).potencia, c.potencia, `a = ${c.a}, b = ${c.b}, c′ = ${c.cp}, n = ${c.n}`);
    const t = O.tamanoMediacion, r = tamanoMuestraMediacion(t.a, t.b, t.cp, { R: t.R });
    assert.ok(r);
    assert.equal(r.n, t.n); assert.equal(r.potencia, t.potencia);
    // sin efecto en a, la potencia de la significación conjunta queda por debajo de α
    assert.ok(/** @type {any} */ (O.mediacion.find((/** @type {any} */ c) => c.a === 0)).potencia < 0.05);
    assert.equal(tamanoMuestraMediacion(0.39, 0, 0), null, 'sin b, no hay mediación');
    assert.equal(tamanoMuestraMediacion(NaN, 0.39, 0), null);
    assert.ok(Number.isNaN(potenciaMediacion(0.39, 0.39, Infinity, 50).potencia));
});

test('(2027.01.20) la mediación reproduce la Tabla 3 de Fritz y MacKinnon (2007): 74 personas con a = b = .39 y 36 con .59 (c′ = 0)', () => {
    // el oráculo simula su modelo (errores de varianza 1) con otro generador y 40 000 réplicas: la potencia pasa de .80 justo en esos n
    for (const f of O.fritz) {
        assert.ok(f.potencia >= 0.8 && f.potenciaMenos < 0.8, `el oráculo: ${f.potenciaMenos} con ${f.nTabla3 - 1}, ${f.potencia} con ${f.nTabla3}`);
        const p = potenciaMediacion(f.a, f.b, f.cp, f.nTabla3, { R: 5000 }).potencia;
        assert.ok(Math.abs(p - f.potencia) < 0.02, `a = b = ${f.a}, n = ${f.nTabla3}: ${p} frente a ${f.potencia}`);
        const t = /** @type {NonNullable<ReturnType<typeof tamanoMuestraMediacion>>} */ (tamanoMuestraMediacion(f.a, f.b, f.cp, { R: 5000 }));
        assert.ok(Math.abs(t.n - f.nTabla3) <= 4, `el tamaño de muestra: ${t.n} frente a ${f.nTabla3} de la tabla`);
    }
});
