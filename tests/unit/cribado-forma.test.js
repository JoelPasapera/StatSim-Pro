// tests/unit/cribado-forma.test.js — cribado de forma (F4) contra el oráculo independiente (tests/oracle/cribado_oraculo.py)
// y regresión del fallo de dirección de la revisión: cada par se evalúa en la dirección en que aparece primero.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resetRobusta, ajustarHolm, paresDelAnalisis, cribarFormas } from '../../src/analizador/relaciones/cribado-forma.js';

const fx = JSON.parse(fs.readFileSync(new URL('../oracle/cribado_fixture.json', import.meta.url), 'utf8'));
const cerca = (a, b, tol, q) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${q}: ${a} vs ${b}`);

test('RESET robusta: Wald con HC3, p asintótica, coeficientes y giros de la cúbica iguales al oráculo', () => {
    for (const c of fx.casos) {
        const r = resetRobusta(Float64Array.from(c.x), Float64Array.from(c.y), { B: 19 });
        cerca(r.W, c.W, 1e-8, `${c.nombre} W`); cerca(r.pAsintotica, c.pAsintotica, 1e-7, `${c.nombre} p asintótica`);
        c.beta.forEach((b, k) => cerca(r.beta[k], b, 1e-8, `${c.nombre} β${k}`));
        assert.deepEqual(r.giros.map(g => +g.x.toFixed(6)), c.giros.map(g => +g.toFixed(6)), `${c.nombre} giros`);
    }
});

test('ajuste de Holm igual al oráculo', () => {
    ajustarHolm(fx.holm.p).forEach((v, k) => cerca(v, fx.holm.ajustadas[k], 1e-15, `Holm ${k}`));
});

test('cada par se evalúa en la dirección en que aparece PRIMERO (la matriz del Word, al final, no invierte la criba)', () => {
    const criba = { evaluados: [{ columnaX: 'D1', columnaY: 'G2' }, { columnaX: 'D2', columnaY: 'G1' }], seleccionados: [{ columnaX: 'D1', columnaY: 'G2' }, { columnaX: 'D2', columnaY: 'G1' }] };
    const pares = paresDelAnalisis('G1', 'G2', criba);
    assert.ok(pares.some(p => p.a === 'G2' && p.b === 'D1'), 'la matriz añade el par en la dirección inversa…');
    const filas = Array.from({ length: 40 }, (_, i) => ({ G1: i % 7, G2: (i * 3) % 11, D1: (i * 5) % 13, D2: (i * 7) % 17 }));
    const r = cribarFormas(filas, pares), d1 = [...r.resultados.values()].find(q => [q.a, q.b].includes('D1') && [q.a, q.b].includes('G2'));
    assert.deepEqual([d1.a, d1.b], ['D1', 'G2'], '…pero se conserva la de la criba');
    assert.equal(r.m, 6);
});

test('revisión 2026.11.03: el cargador de CSV lee la coma decimal (antes, «3,5» se guardaba como 3 en todo el Analizador)', async () => {
    const { AnalizadorEstadistico: A } = await import('../../src/analizador/estadistica.js');
    A.cargarDesdeCSV('ID;Estres;Apoyo;Sexo\n1;3,5;12,25;F\n2;-0,75;10;M\n3;,5;14,75;F\n');
    assert.deepEqual(A.obtenerDatos().map(f => [f.Estres, f.Apoyo, f.Sexo]), [[3.5, 12.25, 'F'], [-0.75, 10, 'M'], [0.5, 14.75, 'F']]);
    A.cargarDesdeCSV('ID,Estres,Apoyo\n1,3.5,12.25\n2,4,10.5\n');
    assert.deepEqual(A.obtenerDatos().map(f => [f.Estres, f.Apoyo]), [[3.5, 12.25], [4, 10.5]], 'el formato inglés no cambia');
});

test('revisión 2026.11.03: el mismo par recibe la misma p en cualquier familia, y el cribado no bloquea con bases grandes', () => {
    let a = 91 >>> 0; const u = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const nr = () => Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u());
    const filas = Array.from({ length: 5000 }, () => { const z = nr(), f = { X: Math.round(30 + 6 * z) }; for (let j = 0; j < 20; j++) f['V' + j] = Math.round(20 + 4 * z + 5 * nr()); return f; });
    const pDe = pares => [...cribarFormas(filas, pares).resultados.values()].find(r => r.b === 'V1').p;
    assert.equal(pDe([{ a: 'X', b: 'V0' }, { a: 'X', b: 'V1' }]), pDe([{ a: 'X', b: 'V1' }, { a: 'X', b: 'V2' }, { a: 'X', b: 'V0' }]));
    const t0 = performance.now(); cribarFormas(filas, Array.from({ length: 20 }, (_, j) => ({ a: 'X', b: 'V' + j })));
    assert.ok(performance.now() - t0 < 4000, `${((performance.now() - t0) / 1000).toFixed(2)} s con n = 5 000 y 20 pares (antes, 7 s)`);
});
