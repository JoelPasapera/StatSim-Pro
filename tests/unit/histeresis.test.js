// tests/unit/histeresis.test.js — el mecanismo de los estados con histéresis (Atlas, fase E2)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cuantilOrdenado, generarEstados, resumenHisteresis } from '../../src/simulador/dominio/histeresis.js';

test('cuantil empírico con interpolación lineal', () => {
    assert.equal(cuantilOrdenado([1, 2, 3, 4, 5], 0.5), 3);
    assert.equal(cuantilOrdenado([1, 2, 3, 4], 0.5), 2.5);
});

test('regla sin nitidez: fuera de la franja sigue a X; dentro, conserva el estado anterior (trayectorias a mano)', () => {
    // umbrales: alto 10, bajo 0; persona 0 sube por encima de 10 y baja a la franja (sigue alta); persona 1 al revés
    const X = [[12, -5], [5, 5], [5, 5], [-1, 11]], S = generarEstados(X, 10, 0, 0, () => 0.5);
    assert.deepEqual(S.map(s => Array.from(s)), [[1, 0], [1, 0], [1, 0], [0, 1]]);
    const r = resumenHisteresis(X, S, 10, 0);
    assert.deepEqual([r.nFuera, r.fueraSigue, r.nDentro, r.dentroConserva, r.personasConCambio], [4, 4, 4, 4, 2]);
    assert.equal(r.sumaEntra / r.nEntra, 11); assert.equal(r.sumaSale / r.nSale, -1);
});

test('la nitidez no tiene sesgo: con 5 %, la regla y la memoria se cumplen en el 95 % (5000 trayectorias)', () => {
    let a = 7 >>> 0; const u = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const nrm = () => Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u());
    const n = 5000, X = [Array.from({ length: n }, nrm)];
    for (let k = 1; k < 4; k++) X.push(X[k - 1].map(x => 0.6 * x + 0.8 * nrm()));
    const r = resumenHisteresis(X, generarEstados(X, 0.84, -0.25, 0.05, u), 0.84, -0.25);
    assert.ok(Math.abs(r.fueraSigue / r.nFuera - 0.95) < 0.006, `fuera: ${(r.fueraSigue / r.nFuera).toFixed(4)}`);
    assert.ok(Math.abs(r.dentroConserva / r.nDentro - 0.95) < 0.008, `dentro: ${(r.dentroConserva / r.nDentro).toFixed(4)}`);
});

test('revisión de la fase E2: el bucle usa los cambios que siguen la regla (entrada ≥ umbral de entrada, salida ≤ umbral de salida) y cuenta aparte los de la nitidez', () => {
    let a = 3 >>> 0; const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const nrm = () => Math.sqrt(-2 * Math.log(rnd() || 1e-12)) * Math.cos(2 * Math.PI * rnd());
    const X = [Array.from({ length: 2000 }, nrm)]; for (let k = 1; k < 4; k++) X.push(X[k - 1].map(x => 0.6 * x + 0.8 * nrm()));
    const r = resumenHisteresis(X, generarEstados(X, 0.84, -0.25, 0.05, rnd), 0.84, -0.25);
    assert.ok(r.sumaEntra / r.nEntra >= 0.84 && r.sumaSale / r.nSale <= -0.25);
    assert.ok(r.cambiosFueraDeRegla > 0 && r.cambios === r.nEntra + r.nSale + r.cambiosFueraDeRegla);
    assert.ok(r.nFranja > 0 && r.nFranja < r.nObs);
});

