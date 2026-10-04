// tests/ui/simulador-histeresis.test.js — estados con histéresis en la tarjeta VI (Atlas, fase E2): valores por defecto,
// recolección y la ida y vuelta del CSV que usa el maestro.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';

const raiz = new URL('../../', import.meta.url);
let env, pruebas, repetidas, histeresis;
before(async () => {
    env = crearEntorno(fs.readFileSync(new URL('index.html', raiz), 'utf8'));
    env.document.readyState = 'interactive';
    await import(new URL('src/main.js', raiz));
    await new Promise(r => setTimeout(r, 0));
    env.document.readyState = 'complete';
    env.disparar(env.document, 'DOMContentLoaded', { bubbles: false });
    [pruebas, repetidas, histeresis] = await Promise.all(['pruebas', 'repetidas', 'histeresis'].map(m => import(new URL(`src/simulador/ui/${m}.js`, raiz))));
});

test('fila con los valores por defecto (80, 40, 5 %, No/Sí), recolección y CSV del maestro', () => {
    assert.equal(histeresis.agregarFilaHisteresis(), null, 'sin escala repetida no se añade');
    pruebas.agregarFilaPruebaConDatos({ prueba: 'T', nombre: 'Estrés', numItems: '20', distribucion: 'normal', media: '60', de: '10', min: '1', max: '5', alfa: '0.85', invertidos: '0' });
    repetidas.agregarFilaRepetida({ variable: 'Estrés', ondas: 4, estabilidad: 0.6, modelo: 'ar1' });
    const fila = histeresis.agregarFilaHisteresis();
    fila.querySelector('[aria-label="Escala con histéresis"]').value = 'Estrés';
    fila.querySelector('[aria-label="Nombre del estado"]').value = 'Ansiedad clínica, grave';
    const esperado = [{ x: 'Estrés', nombre: 'Ansiedad clínica, grave', etiquetas: ['No', 'Sí'], pEntrada: 80, pSalida: 40, ruido: 5 }];
    assert.deepEqual(globalThis.generadorDatos.recolectarHisteresis(), esperado);
    const csv = histeresis.csvDeHisteresis();
    document.getElementById('bodyHisteresis').innerHTML = '';
    assert.deepEqual(histeresis.aplicarCSVHisteresis(csv), { aplicadas: 1, omitidas: 0 });
    assert.deepEqual(globalThis.generadorDatos.recolectarHisteresis(), esperado, 'el nombre con coma sobrevive al CSV');
});
