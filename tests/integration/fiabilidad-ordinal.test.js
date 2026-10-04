// tests/integration/fiabilidad-ordinal.test.js — la fiabilidad del Analizador incorpora el paso 2: KR-20 con ítems
// dicotómicos, α y ω ordinales con ítems Likert (iguales al oráculo) y nada nuevo con ítems continuos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Fiabilidad } from '../../src/analizador/fiabilidad.js';

const fx = JSON.parse(fs.readFileSync(new URL('../oracle/ordinal_fixture.json', import.meta.url), 'utf8'));
const cerca = (a, b, tol, que) => assert.ok(Math.abs(a - b) <= tol, `${que}: ${a} vs ${b}`);
const aFilas = (cols, prefijo) => cols[0].map((_, i) => Object.fromEntries(cols.map((c, j) => [`${prefijo}${j + 1}`, c[i]])));
const grupo = (cols, prefijo, etiqueta) => ({ nombre: prefijo, etiqueta, origen: 'manual', items: cols.map((_, j) => `${prefijo}${j + 1}`), invertidos: [] });

test('ítems dicotómicos: el α es el KR-20 (fórmula de Kuder y Richardson) y se rotula; α y ω tetracóricos del oráculo', () => {
    const c = fx.conjuntos.dicotomicos, cols = c.cols, k = cols.length, n = cols[0].length;
    const r = Fiabilidad.analizarGrupo(aFilas(cols, 'D'), grupo(cols, 'D', 'Test dicotómico'));
    assert.ok(!r.error, r.error); assert.equal(r.dicotomico, true); assert.equal(r.ordinal.correlacion, 'tetracórica');
    const p = cols.map(col => col.filter(v => v === 2).length / n);
    const tot = cols[0].map((_, i) => cols.reduce((s, col) => s + col[i], 0)), m = tot.reduce((s, v) => s + v, 0) / n;
    const varPob = tot.reduce((s, v) => s + (v - m) ** 2, 0) / n;
    cerca(r.alfa, (k / (k - 1)) * (1 - p.reduce((s, x) => s + x * (1 - x), 0) / varPob), 1e-12, 'KR-20');
    cerca(r.ordinal.alfa, c.alfa, 1e-9, 'α tetracórico'); cerca(r.ordinal.omega, c.omega, 1e-7, 'ω tetracórico');
    const texto = Fiabilidad.redactarInterpretacion([r]);
    assert.ok(texto.includes('coeficiente KR-20') && texto.includes('correlaciones tetracóricas') && texto.includes('Olsson, 1979'), texto);
});

test('ítems Likert: α y ω policóricos del oráculo junto a los coeficientes clásicos', () => {
    const c = fx.conjuntos.likert5;
    const r = Fiabilidad.analizarGrupo(aFilas(c.cols, 'L'), grupo(c.cols, 'L', 'Escala Likert'));
    assert.equal(r.dicotomico, false); assert.equal(r.ordinal.correlacion, 'policórica');
    cerca(r.ordinal.alfa, c.alfa, 1e-9, 'α ordinal'); cerca(r.ordinal.omega, c.omega, 1e-7, 'ω ordinal');
    assert.ok(r.ordinal.alfa > r.alfa, 'con pocas categorías, Pearson subestima: α ordinal > α');
});

test('ítems continuos: sin coeficientes ordinales ni rótulo KR-20', () => {
    let s = 11; const u = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const cols = Array.from({ length: 4 }, () => Array.from({ length: 80 }, () => Math.round(u() * 1000) / 100));
    const r = Fiabilidad.analizarGrupo(aFilas(cols, 'C'), grupo(cols, 'C', 'Continua'));
    assert.equal(r.ordinal, null); assert.equal(r.dicotomico, false);
    assert.ok(!Fiabilidad.redactarInterpretacion([r]).includes('ordinal'));
});
