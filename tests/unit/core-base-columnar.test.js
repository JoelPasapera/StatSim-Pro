import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BaseColumnar } from '../../src/core/data/base-columnar.js';

test('BaseColumnar: columnas, etiquetas, fila, objetos y serialización ida y vuelta', () => {
    const b = new BaseColumnar(3);
    b.agregar('ID', true).datos.set([1, 2, 3]);
    b.agregar('Sexo', true).datos.set([0, 1, 0]);
    b.etiquetar('Sexo', { 0: 'Femenino', 1: 'Masculino' });
    b.agregar('Puntaje', false).datos.set([12.5, NaN, 7.25]);
    assert.deepEqual(b.nombres(), ['ID', 'Sexo', 'Puntaje']);
    const f1 = b.fila(1);
    assert.equal(f1.ID, 2); assert.equal(f1.Sexo, 'Masculino'); assert.ok(Number.isNaN(f1.Puntaje), 'el perdido viaja como NaN (null solo al serializar a JSON)');
    assert.equal(b.aObjetos().length, 3);
    const s = b.serializar();
    const b2 = BaseColumnar.desdeSerializado(s);
    assert.deepEqual(b2.fila(0), b.fila(0));
    assert.equal(Array.from(b.finitos('Puntaje')).length, 2);
});
