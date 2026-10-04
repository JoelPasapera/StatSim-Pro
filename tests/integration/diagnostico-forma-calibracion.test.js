// tests/integration/diagnostico-forma-calibracion.test.js — el diagnóstico de forma controla su error (2026.10.29).
// Antes, con reglas de parsimonia sobre el AICc, el ruido puro «tenía forma» en ≈ 20 % de las bases y una recta débil se
// llamaba curva en ≈ 24 %. Las pruebas por permutaciones deben rechazar en ≈ 5 % bajo su hipótesis nula (calibración
// amplia en la revisión: 3,0 % con 400 bases de ruido y 2,7 % con 300 rectas) y conservar la potencia ante una U.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pruebasPermutacionForma } from '../../src/analizador/relaciones/pruebas-permutacion-forma.js';

let a = 4711 >>> 0;
const u01 = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const nrm = () => Math.sqrt(-2 * Math.log(u01() || 1e-12)) * Math.cos(2 * Math.PI * u01());
const datos = (n, f) => { const x = [], y = []; for (let i = 0; i < n; i++) { const xi = Math.round(30 + 6 * nrm()); x.push(xi); y.push(f((xi - 30) / 6) + nrm()); } return [x, y]; };

test('ruido puro: la prueba de relación (mínimo p) rechaza en ≈ 5 % (≤ 10 % con 120 bases)', () => {
    let rechazos = 0;
    for (let k = 0; k < 120; k++) { const [x, y] = datos(150, () => 0); if (pruebasPermutacionForma(x, y, { B: 99 }).relacion.p < 0.05) rechazos++; }
    assert.ok(rechazos <= 12, `${rechazos} de 120`);
});

test('recta real: la prueba de no linealidad (bootstrap salvaje) declara curva en ≈ 5 % (≤ 10 % con 100 bases)', () => {
    let rechazos = 0;
    for (let k = 0; k < 100; k++) { const [x, y] = datos(150, z => 0.4 * z); if (pruebasPermutacionForma(x, y, { B: 99 }).noLineal.p < 0.05) rechazos++; }
    assert.ok(rechazos <= 10, `${rechazos} de 100`);
});

test('potencia: una U moderada (n = 300) se detecta y se reconoce como no lineal en casi todas las bases', () => {
    let ambas = 0;
    for (let k = 0; k < 20; k++) { const [x, y] = datos(300, z => 0.3 * (z * z - 1) / Math.SQRT2), r = pruebasPermutacionForma(x, y, { B: 99 }); if (r.relacion.p < 0.05 && r.noLineal.p < 0.05) ambas++; }
    assert.ok(ambas >= 17, `${ambas} de 20`);
});

test('revisión 2026.11.01: recta con nube triangular (heterocedástica): la prueba de no linealidad ya no declara curva de más (Freedman–Lane, 18,8 %; bootstrap salvaje ≈ 6 %)', () => {
    let rechazos = 0; const R = 80;
    for (let k = 0; k < R; k++) { const x = [], y = []; for (let i = 0; i < 300; i++) { const v = u01(); x.push(Math.round(70 + 60 * v)); y.push(20 + 60 * (1 - v) * u01()); } if (pruebasPermutacionForma(x, y, { B: 99 }).noLineal.p < 0.05) rechazos++; }
    assert.ok(rechazos <= 10, `${rechazos} de ${R}`);
});
