import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bus, EVENTOS } from '../../src/shared/eventos.js';
import { estado, CLAVES } from '../../src/shared/estado.js';

test('bus: on/emit/off, una sola vez y aislamiento de errores', () => {
    let n = 0; const quitar = bus.on('x', d => { n += d; });
    bus.una('x', () => { n += 100; });
    assert.equal(bus.emit('x', 1), 2); assert.equal(n, 101);
    bus.emit('x', 1); assert.equal(n, 102);
    quitar(); assert.equal(bus.emit('x', 1), 0);
    bus.on('y', () => { throw new Error('falla'); }); bus.on('y', () => { n = -1; });
    const err = console.error; console.error = () => {}; assert.equal(bus.emit('y'), 1); console.error = err; assert.equal(n, -1);
    assert.equal(EVENTOS.BASE_GENERADA, 'base:generada');
});

test('estado: get/set/suscribir y las claves documentadas', () => {
    const visto = []; const quitar = estado.suscribir('k', v => visto.push(v));
    estado.set('k', 1); estado.set('k', 2); quitar(); estado.set('k', 3);
    assert.deepEqual(visto, [1, 2]); assert.equal(estado.get('k'), 3); assert.equal(estado.get('no', 'defecto'), 'defecto');
    assert.ok(CLAVES.BASE_SIMULADOR && CLAVES.FUENTES_BUSCADOR);
});
