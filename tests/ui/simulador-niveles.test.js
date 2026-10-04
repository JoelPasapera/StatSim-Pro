// tests/ui/simulador-niveles.test.js — relación entre personas y dentro de la persona en la tarjeta VI (Atlas, fase D):
// opción «Interceptos aleatorios» (y su ida y vuelta por CSV), tabla de parejas, recolección y CSV del maestro.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';

const raiz = new URL('../../', import.meta.url);
let env, pruebas, repetidas, niveles;
before(async () => {
    env = crearEntorno(fs.readFileSync(new URL('index.html', raiz), 'utf8'));
    env.document.readyState = 'interactive';
    await import(new URL('src/main.js', raiz));
    await new Promise(r => setTimeout(r, 0));
    env.document.readyState = 'complete';
    env.disparar(env.document, 'DOMContentLoaded', { bubbles: false });
    [pruebas, repetidas, niveles] = await Promise.all(['pruebas', 'repetidas', 'niveles'].map(m => import(new URL(`src/simulador/ui/${m}.js`, raiz))));
});
const campo = (fila, etiqueta) => fila.querySelector(`[aria-label="${etiqueta}"]`);

test('sin dos escalas repetidas no se añade la pareja', () => {
    assert.equal(niveles.agregarFilaNivel(), null);
});

test('interceptos aleatorios en la tabla VI (también tras la ida y vuelta por CSV) y una pareja entre niveles recogida intacta', () => {
    for (const nombre of ['Velocidad', 'Errores']) pruebas.agregarFilaPruebaConDatos({ prueba: 'T', nombre, numItems: '20', distribucion: 'normal', media: '60', de: '10', min: '1', max: '5', alfa: '0.85', invertidos: '0' });
    repetidas.agregarFilaRepetida({ variable: 'Velocidad', ondas: 4, estabilidad: 0.6, modelo: 'intercepto' });
    repetidas.agregarFilaRepetida({ variable: 'Errores', ondas: 4, estabilidad: 0.5, modelo: 'intercepto' });
    const csvR = repetidas.csvDeRepetidas();
    assert.match(csvR, /Velocidad,4,0.6,.*,intercepto/);
    repetidas.aplicarCSVRepetidas(csvR);
    assert.deepEqual(Array.from(document.querySelectorAll('#bodyRepetidas [aria-label="Modelo longitudinal"]')).map(s => s.value), ['intercepto', 'intercepto']);
    const fila = niveles.agregarFilaNivel({ x: 'Velocidad', y: 'Errores', rEntre: -0.4, rDentro: 0.3 });
    assert.ok(fila && campo(fila, 'Escala X (niveles)').value === 'Velocidad');
    assert.deepEqual(globalThis.generadorDatos.recolectarNiveles(), [{ x: 'Velocidad', y: 'Errores', rEntre: -0.4, rDentro: 0.3 }]);
    const csvN = niveles.csvDeNiveles();
    document.getElementById('bodyNiveles').innerHTML = '';
    assert.deepEqual(niveles.aplicarCSVNiveles(csvN), { aplicadas: 1, omitidas: 0 });
    assert.deepEqual(globalThis.generadorDatos.recolectarNiveles(), [{ x: 'Velocidad', y: 'Errores', rEntre: -0.4, rDentro: 0.3 }]);
});
