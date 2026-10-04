// tests/integration/cribado-forma-calibracion.test.js — el cribado de forma controla el error de la FAMILIA (Holm) con
// rectas homocedásticas y heterocedásticas, y detecta una U. En la revisión: 5,0 % de familias con alguna marca falsa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cribarFormas } from '../../src/analizador/relaciones/cribado-forma.js';

let a = 5150 >>> 0;
const u01 = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const nrm = () => Math.sqrt(-2 * Math.log(u01() || 1e-12)) * Math.cos(2 * Math.PI * u01());

// la mitad de las rectas llevan ruido asimétrico (exponencial − 1) y heterocedástico, de MEDIA CERO: E[Y|X] es una recta
test('familias de 8 rectas (la mitad con ruido asimétrico y heterocedástico) y una U: pocas marcas falsas y la U detectada', () => {
    let familiasFalsas = 0, uDetectada = 0; const R = 30;
    for (let k = 0; k < R; k++) {
        const filas = Array.from({ length: 150 }, () => { const z = nrm(), f = { X: z }; for (let j = 0; j < 8; j++) f['R' + j] = j % 2 ? 0.4 * z + nrm() : 0.4 * z + (1 + 0.6 * Math.abs(z)) * (-Math.log(u01() || 1e-12) - 1); f.U = 0.7 * (z * z - 1) + nrm(); return f; });   // una U clara (con amplitud 0,5 y n = 150, ≈ 77 %)
        const r = cribarFormas(filas, [...Array.from({ length: 8 }, (_, j) => ({ a: 'X', b: 'R' + j })), { a: 'X', b: 'U' }]), lista = [...r.resultados.values()];
        if (lista.some(e => e.b.startsWith('R') && e.noLineal)) familiasFalsas++;
        if (lista.find(e => e.b === 'U').tipo === 'no-monotona') uDetectada++;
    }
    assert.ok(familiasFalsas <= 4, `${familiasFalsas} de ${R} familias con alguna recta marcada`);
    assert.ok(uDetectada >= 25, `U detectada y confirmada en ${uDetectada} de ${R}`);
});
