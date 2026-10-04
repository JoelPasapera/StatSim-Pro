import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autotest } from '../../src/simulador/dominio/autotest.js';

test('el autotest interno del generador queda en verde', () => {
    const r = autotest();
    assert.match(r.resumen, /^(\d+)\/\1 /, r.resumen + ' · ' + r.resultados.filter(x => !x.ok).map(x => x.nombre).join(' | '));
});
