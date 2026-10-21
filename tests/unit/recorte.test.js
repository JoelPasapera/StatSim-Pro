// @ts-check
// tests/unit/recorte.test.js — compensación del recorte al rango (2026.12.04) y curtosis de la población del total.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compensarRecorte } from '../../src/simulador/dominio/recorte.js';
import { curtosisPoblacional } from '../../src/simulador/dominio/tolerancias.js';
import { SIGMA_FORMA_ASIMETRICA } from '../../src/simulador/dominio/constantes.js';

const s = SIGMA_FORMA_ASIMETRICA;
/** forma lognormal tipificada (media 0, DE 1) @param {number} z */
const T = z => (Math.exp(s * z) - Math.exp((s * s) / 2)) / Math.sqrt(Math.expm1(s * s) * Math.exp(s * s));
/** momentos del total recortado y redondeado @param {(z: number) => number} f @param {number} M @param {number} DE @param {number} lo @param {number} hi */
function momentos(f, M, DE, lo, hi) {
    let sw = 0, s1 = 0, s2 = 0;
    for (let x = -8; x <= 8; x += 0.002) { const w = Math.exp(-0.5 * x * x), v = Math.round(Math.max(lo, Math.min(hi, M + DE * f(x)))); sw += w; s1 += w * v; s2 += w * v * v; }
    const m = s1 / sw; return { m, de: Math.sqrt(s2 / sw - m * m) };
}

test('la forma asimétrica cerca del máximo: sin compensar la DE queda corta; compensada, la media y la DE son las pedidas', () => {
    const sin = momentos(T, 24.2, 4.99, 0, 36);
    assert.ok(sin.de < 4.6, `sin compensar, DE ${sin.de}`);
    const c = compensarRecorte({ media: 24.2, de: 4.99, minimo: 0, maximo: 36, forma: T });
    assert.ok(c && c.b > 1, JSON.stringify(c));
    const con = momentos(z => c.a + c.b * T(z), 24.2, 4.99, 0, 36);
    assert.ok(Math.abs(con.m - 24.2) < 0.01 && Math.abs(con.de - 4.99) < 0.01, `compensada: media ${con.m}, DE ${con.de}`);
});

test('si la DE pedida no cabe en el rango, no se compensa', () => {
    assert.equal(compensarRecorte({ media: 18, de: 20, minimo: 0, maximo: 36, forma: T }), null);
});

test('la curtosis de la población: ≈ 3 para una normal sin recorte, y mayor para la forma asimétrica', () => {
    assert.ok(Math.abs(curtosisPoblacional(z => z, 500, 100, 0, 1000) - 3) < 0.01);
    assert.ok(curtosisPoblacional(T, 500, 100, 0, 1000) > 4);
});
