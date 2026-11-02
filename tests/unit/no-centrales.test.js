// no-centrales.test.js — (2027.01.20) la t no central con una no centralidad grande, por la integral sobre su denominador: la
// misma que la serie de Poisson donde la serie es barata (|δ| ≤ 80), y rápida donde la serie tendría millones de términos (una
// t de 10¹⁵ por el redondeo colgaba la página); y el intervalo asintótico de la F no central con λ del orden del millón.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cdfTNoCentral, cdfTNoCentralIntegral, intervaloNoCentralidadT, intervaloNoCentralidadF, DELTA_GRANDE } from '../../src/core/stats/no-centrales.js';

test('la integral de la t no central es la serie de Poisson (|δ| ≤ 80), con df pequeños y grandes', () => {
    let peor = 0;
    for (const df of [1, 2, 5, 9, 30, 200, 5000]) for (const delta of [-60, -20, -3, 0.5, 3, 20, 60, 79]) for (const t of [0.1, 1, 3, 10, 25, 60, 120]) {
        peor = Math.max(peor, Math.abs(cdfTNoCentral(t, df, delta) - cdfTNoCentralIntegral(t, df, delta)));
    }
    assert.ok(peor < 1e-10, `diferencia máxima ${peor}`);
    assert.equal(DELTA_GRANDE, 80);
});

test('con una t enorme, el intervalo de δ sale enseguida y es razonable', () => {
    const t0 = Date.now();
    const a = intervaloNoCentralidadT(1e15, 9), b = intervaloNoCentralidadT(500, 99), c = intervaloNoCentralidadT(-300, 20);
    assert.ok(Date.now() - t0 < 2000, `${Date.now() - t0} ms`);
    assert.ok(a.inferior > 4e14 && a.inferior < 1e15 && a.superior > 1e15 && a.superior < 2e15, JSON.stringify(a));
    // con df = 99 y t = 500, la t no central es casi normal con DE √(1 + δ²/(2·df)) ≈ 35.5: δ ∈ 500 ∓ 1.96·35.5
    assert.ok(Math.abs(b.inferior - 430.4) < 1 && Math.abs(b.superior - 569.5) < 1, JSON.stringify(b));
    assert.ok(c.inferior < -300 && c.superior > -300 && c.superior < 0, JSON.stringify(c));
});

test('con una F enorme, el intervalo de λ es el asintótico (sin colgarse)', () => {
    const t0 = Date.now(), r = intervaloNoCentralidadF(3.3e16, 1.25, 11.2);
    assert.ok(Date.now() - t0 < 500);
    assert.ok(r.inferior > 0 && r.inferior < 3.3e16 * 1.25 && r.superior > 3.3e16 * 1.25, JSON.stringify(r));
    // en el límite, la misma escala que la exacta: con F·d₁ = 2·10⁶ los dos métodos difieren menos del 1 %
    const F = 1e6, d1 = 2, d2 = 40, asint = intervaloNoCentralidadF(F, d1, d2);
    assert.ok(asint.inferior < F * d1 && asint.superior > F * d1);
});
