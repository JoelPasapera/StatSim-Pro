// tests/ui/simulador-paneles.test.js — relaciones en el tiempo en la tarjeta VI (Atlas, fase E1): el tipo activa el efecto
// Y → X, la recolección y la ida y vuelta del CSV que usa el maestro.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';

const raiz = new URL('../../', import.meta.url);
let env, pruebas, repetidas, paneles;
before(async () => {
    env = crearEntorno(fs.readFileSync(new URL('index.html', raiz), 'utf8'));
    env.document.readyState = 'interactive';
    await import(new URL('src/main.js', raiz));
    await new Promise(r => setTimeout(r, 0));
    env.document.readyState = 'complete';
    env.disparar(env.document, 'DOMContentLoaded', { bubbles: false });
    [pruebas, repetidas, paneles] = await Promise.all(['pruebas', 'repetidas', 'paneles'].map(m => import(new URL(`src/simulador/ui/${m}.js`, raiz))));
});
const campo = (fila, etiqueta) => fila.querySelector(`[aria-label="${etiqueta}"]`);

test('rezagada desactiva el efecto Y → X; recíproca lo activa; la recolección y el CSV conservan la fila', () => {
    for (const nombre of ['Estrés', 'Sueño']) pruebas.agregarFilaPruebaConDatos({ prueba: 'T', nombre, numItems: '20', distribucion: 'normal', media: '60', de: '10', min: '1', max: '5', alfa: '0.85', invertidos: '0' });
    repetidas.agregarFilaRepetida({ variable: 'Estrés', ondas: 4, estabilidad: 0.6, modelo: 'ar1' });
    repetidas.agregarFilaRepetida({ variable: 'Sueño', ondas: 4, estabilidad: 0.5, modelo: 'ar1' });
    const fila = paneles.agregarFilaPanel({ tipo: 'rezagada', x: 'Estrés', y: 'Sueño', r: 0.3, cXY: 0.25 });
    assert.equal(campo(fila, 'Efecto Y → X').disabled, true);
    const tipo = campo(fila, 'Tipo de relación en el tiempo'); tipo.value = 'reciproca'; env.disparar(tipo, 'change', { bubbles: true });
    assert.equal(campo(fila, 'Efecto Y → X').disabled, false);
    campo(fila, 'Efecto Y → X').value = '0.1';
    const esperado = [{ tipo: 'reciproca', x: 'Estrés', y: 'Sueño', r: 0.3, cXY: 0.25, cYX: 0.1 }];
    assert.deepEqual(globalThis.generadorDatos.recolectarPaneles(), esperado);
    const csv = paneles.csvDePaneles();
    document.getElementById('bodyPaneles').innerHTML = '';
    assert.deepEqual(paneles.aplicarCSVPaneles(csv), { aplicadas: 1, omitidas: 0 });
    assert.deepEqual(globalThis.generadorDatos.recolectarPaneles(), esperado);
});
