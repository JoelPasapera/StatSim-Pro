// tests/ui/sem-comparacion.test.js — la comparación de modelos de la interfaz SEM no aplica AIC ni Δχ² ingenuo a WLSMV
// y no compara modelos estimados con estimadores distintos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';

test('WLSMV anidados → ΔCFI/ΔRMSEA (Chen, 2007), sin Δχ² ni AIC; ML frente a WLSMV → no comparables', async () => {
    crearEntorno(fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8'));
    const { SEM } = await import('../../src/analizador/sem-motor.js');
    const { SEMUI } = await import('../../src/analizador/sem-ui.js');
    const modelo = (etiqueta, estimador, sintaxis, gl, chi2, CFI, RMSEA) => ({ etiquetaModelo: etiqueta, estimador, sintaxis, gl, chi2, CFI, TLI: CFI, RMSEA, SRMR: 0.04, q: 20, n: 300, p: 4, nombresObs: ['a', 'b', 'c', 'd'] });
    SEM._ultimos = [modelo('M1', 'WLSMV', 'F =~ a + b + c + d', 2, 3.1, 0.99, 0.03), modelo('M2', 'WLSMV', 'F =~ a + b + c + d\na ~~ b', 1, 1.2, 0.995, 0.02)];
    const h = SEMUI.htmlComparacion().replace(/<[^>]+>/g, ' ');
    assert.ok(/ΔCFI = /.test(h) && /Chen, 2007/.test(h) && !/Δχ²\(/.test(h) && /— \(WLSMV\)/.test(h), h.slice(0, 400));
    SEM._ultimos = [modelo('M1', 'ML', 'F =~ a + b + c + d', 2, 3.1, 0.99, 0.03), modelo('M2', 'WLSMV', 'F =~ a + b + c + d', 2, 2.5, 0.99, 0.03)];
    assert.match(SEMUI.htmlComparacion().replace(/<[^>]+>/g, ' '), /estimadores distintos \(ML y WLSMV\)/);
});

test('revisión 2026.10.18: formulario SEM con guías «Para qué sirve» y el selector de estimador', async () => {
    const { SEMUI } = await import('../../src/analizador/sem-ui.js');
    if (!document.getElementById('cgSlot')) { const s = document.createElement('div'); s.id = 'cgSlot'; document.body.appendChild(s); }
    SEMUI.montar();
    const card = document.getElementById('semCard');
    assert.ok(card && card.querySelectorAll('.orden-guia').length >= 3, 'tres guías');
    assert.deepEqual([...card.querySelectorAll('#semEstimador option')].map(o => o.value), ['ML', 'WLSMV']);
});
