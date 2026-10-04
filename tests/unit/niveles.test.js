// tests/unit/niveles.test.js — matemática de la relación entre personas y dentro de la persona (Atlas, fase D)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esperadoNiveles, estructuraNiveles, fenomenoNiveles } from '../../src/simulador/dominio/niveles.js';

test('estructura: la misma onda mezcla los dos niveles y las ondas distintas solo conservan la parte entre personas', () => {
    const e = estructuraNiveles({ iccX: 0.6, iccY: 0.5, rEntre: -0.4, rDentro: 0.3 });
    assert.ok(Math.abs(e.rCruzada - (-0.4 * Math.sqrt(0.3))) < 1e-12);
    assert.ok(Math.abs(e.rMisma - (-0.4 * Math.sqrt(0.3) + 0.3 * Math.sqrt(0.2))) < 1e-12);
});

test('las medias de cada persona se acercan a ρ entre personas al crecer las ondas (con pocas, atenuadas)', () => {
    const nivel = { iccX: 0.6, iccY: 0.5, rEntre: -0.4, rDentro: 0.3 };
    const r2 = esperadoNiveles(2, nivel).rMedias, r4 = esperadoNiveles(4, nivel).rMedias, r1000 = esperadoNiveles(1000, nivel).rMedias;
    assert.ok(r2 > r4 && r4 > r1000 && Math.abs(r1000 - -0.4) < 0.01, `${r2} ${r4} ${r1000}`);
    assert.equal(esperadoNiveles(4, nivel).rDentro, 0.3);
});

test('el veredicto: cambio de signo, sobre todo entre personas, sobre todo dentro y parecida', () => {
    assert.match(fenomenoNiveles(-0.4, 0.3), /cambia de signo/);
    assert.match(fenomenoNiveles(0.5, 0.1), /sobre todo entre personas/);
    assert.match(fenomenoNiveles(0.05, 0.4), /sobre todo dentro de la persona/);
    assert.match(fenomenoNiveles(0.3, 0.25), /parecida/);
});
