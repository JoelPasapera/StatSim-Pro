// tests/unit/terceras.test.js — matemática de las terceras variables (Atlas, fase C)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { betaControlado, esTerceraVariable, estructuraTercera, fenomenoTercera, parcialDe } from '../../src/simulador/dominio/terceras.js';

test('la parcial de la estructura coincide con la fórmula, en los tres tipos, y el colisionador imposible se detecta', () => {
    for (const [tipo, c1, c2, c3] of [['confusion', 0.6, 0.6, 0], ['confusion', -0.5, 0.4, 0.2], ['supresion', 0.6, 0, 0.4], ['colisionador', 0.5, 0.5, 0], ['colisionador', 0.3, -0.4, 0.2]]) {
        const e = estructuraTercera({ tipo, c1, c2, c3 });
        assert.ok(Math.abs(parcialDe(e.rXY, e.rXZ, e.rYZ) - e.parcial) < 1e-12, tipo);
        assert.equal(tipo === 'colisionador' ? e.rXY : e.parcial, c3, 'c3 es la relación verdadera');
    }
    assert.equal(estructuraTercera({ tipo: 'colisionador', c1: 0.9, c2: 0.9, c3: -0.5 }).posible, false);
    assert.ok(Math.abs(betaControlado(0.32, 0.6, 0) - 0.5) < 1e-12, 'supresión clásica: β = r/(1 − r²xz)');
    assert.ok(esTerceraVariable('supresion') && !esTerceraVariable('mediacion') && !esTerceraVariable('toString'));
});

test('el veredicto del fenómeno: espuria, supresión, sesgo del colisionador y sus negativos', () => {
    assert.equal(fenomenoTercera('confusion', 0.36, 0).texto, 'la relación era espuria: se debía a Z');
    assert.equal(fenomenoTercera('confusion', 0.3, 0.29).hay, false);
    assert.equal(fenomenoTercera('supresion', 0.32, 0.4).hay, true);
    assert.equal(fenomenoTercera('supresion', 0.4, 0.3).hay, false);
    assert.equal(fenomenoTercera('colisionador', 0, -0.33).hay, true);
});

test('revisión de la fase C: el veredicto nombra la inversión de signo', () => {
    assert.match(fenomenoTercera('supresion', 0.1, -0.3).texto, /invierte.*supresión negativa/);
    assert.match(fenomenoTercera('confusion', 0.4, -0.1).texto, /se invierte/);
    assert.equal(fenomenoTercera('supresion', 0.32, 0.4).texto, 'Z ocultaba parte de la relación: controlarla la aumenta');
});

