// @ts-check
// tests/unit/riclpm.test.js — el RI-CLPM en el dominio del panel (2026.12.07): interceptos aleatorios sobre la dinámica de dentro.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estructuraPanel, correlacionEntreOndas, clpmIngenuo, fenomenoRIclpm } from '../../src/simulador/dominio/paneles.js';

const base = { estabX: 0.6, estabY: 0.6, r: 0.2, cXY: 0, cYX: 0 };

test('con ICC = 0 es exactamente el panel de la fase E1', () => {
    const e1 = estructuraPanel({ estabX: 0.6, estabY: 0.5, r: 0.3, cXY: 0.2 }), ri0 = estructuraPanel({ estabX: 0.6, estabY: 0.5, r: 0.3, cXY: 0.2, iccX: 0, iccY: 0, rRI: 0.7 });
    for (const [s, t] of [[1, 1], [2, 1], [4, 1], [3, 2]]) assert.deepEqual(correlacionEntreOndas(ri0, s, t), correlacionEntreOndas(e1, s, t));
});

test('con interceptos: diagonal 1, la estabilidad observada es la pedida, la de dentro se deduce y las ondas lejanas tienden a la ICC', () => {
    const ri = estructuraPanel({ ...base, iccX: 0.5, iccY: 0.4, rRI: 0.5 });
    assert.equal(ri.posible, true);
    const M11 = correlacionEntreOndas(ri, 1, 1), M21 = correlacionEntreOndas(ri, 2, 1), M30 = correlacionEntreOndas(ri, 30, 1);
    assert.ok(Math.abs(M11[0][0] - 1) < 1e-12 && Math.abs(M11[1][1] - 1) < 1e-12);
    assert.ok(Math.abs(M21[0][0] - 0.6) < 1e-12 && Math.abs(M21[1][1] - 0.6) < 1e-12, 'estabilidades observadas');
    assert.ok(Math.abs(ri.a - (0.6 - 0.5) / 0.5) < 1e-12 && Math.abs(ri.d - (0.6 - 0.4) / 0.6) < 1e-12, 'de dentro: (s − ICC)/(1 − ICC)');
    assert.ok(Math.abs(M11[0][1] - (Math.sqrt(0.5 * 0.4) * 0.5 + Math.sqrt(0.5 * 0.6) * 0.2)) < 1e-12, 'misma onda: rasgos más dentro');
    assert.ok(Math.abs(M30[0][0] - 0.5) < 1e-6 && Math.abs(M30[1][1] - 0.4) < 1e-6, 'sin decaer hacia 0');
});

test('el panel clásico ve efectos cruzados que dentro de la persona no existen, y crecen con la r entre los rasgos', () => {
    const efecto = rRI => clpmIngenuo(estructuraPanel({ ...base, iccX: 0.5, iccY: 0.5, rRI })).cXY;
    // incluso con rasgos sin relación (r = 0) el panel clásico no da 0 (≈ −0,04): los interceptos inflan la autorregresión aparente
    // y la r de la misma onda se reparte; lo que caracteriza el fenómeno es que el efecto espurio crezca con la r entre los rasgos
    assert.equal(clpmIngenuo(estructuraPanel(base)).cXY, 0, 'sin interceptos y sin efecto de dentro, el clásico da 0');
    assert.ok(efecto(0) < efecto(0.3) && efecto(0.3) < efecto(0.6) && efecto(0.6) > 0.08, `${efecto(0)} → ${efecto(0.3)} → ${efecto(0.6)}`);
    assert.match(fenomenoRIclpm(0, efecto(0.6), 0.6), /panel cruzado clásico estima .* dentro de la persona es de 0\.00.*rasgos estables relacionados/);
});

test('una estabilidad observada incompatible con la ICC no es posible', () => {
    assert.equal(estructuraPanel({ ...base, estabX: 0.1, iccX: 0.8, iccY: 0.2, rRI: 0 }).posible, false, '(0,1 − 0,8)/0,2 = −3,5');
});

test('revisión de la 2026.12.08: el veredicto de la recíproca incluye Y → X, y sin sesgo en ninguno de los dos lo dice en plural', () => {
    assert.match(fenomenoRIclpm(0, 0.12, 0.5, { dentro: -0.1, clasico: 0.02 }), /X → Y de 0\.12.*; .*Y → X de 0\.02, pero dentro de la persona es de -0\.10/);
    assert.match(fenomenoRIclpm(0.1, 0.11, 0.5, { dentro: 0, clasico: 0.01 }), /efectos cruzados parecidos/);
});

