// tests/ui/simulador-terceras.test.js — terceras variables en la sección V (Atlas, fase C): tipos en el selector, rótulos de
// los coeficientes y de la columna central según el tipo, y recolección desde el DOM.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';

const raiz = new URL('../../', import.meta.url);
let env, pruebas, modelos;
before(async () => {
    env = crearEntorno(fs.readFileSync(new URL('index.html', raiz), 'utf8'));
    env.document.readyState = 'interactive';
    await import(new URL('src/main.js', raiz));
    await new Promise(r => setTimeout(r, 0));
    env.document.readyState = 'complete';
    env.disparar(env.document, 'DOMContentLoaded', { bubbles: false });
    [pruebas, modelos] = await Promise.all(['pruebas', 'modelos'].map(m => import(new URL(`src/simulador/ui/${m}.js`, raiz))));
});
const campo = (fila, etiqueta) => fila.querySelector(`[aria-label="${etiqueta}"]`);

test('una fila de confusión: rótulos propios, cambio a colisionador y recolección intacta', () => {
    for (const nombre of ['Estrés', 'Sueño', 'Carga']) pruebas.agregarFilaPruebaConDatos({ prueba: 'T', nombre, numItems: '10', distribucion: 'normal', media: '30', de: '6', min: '1', max: '5', alfa: '0.85', invertidos: '0' });
    const fila = modelos.agregarFilaModelo({ tipo: 'confusion', x: 'Estrés', m: 'Carga', y: 'Sueño', c1: 0.6, c2: 0.6, c3: 0 });
    assert.equal(campo(fila, 'Tipo de modelo').value, 'confusion');
    assert.deepEqual([1, 2, 3].map(k => campo(fila, `Coeficiente ${k}`).placeholder), ['r(Z,X)', 'r(Z,Y)', 'r parcial X–Y']);
    assert.match(campo(fila, 'Coeficiente 3').title, /CONTROLANDO Z.*espuria/);
    assert.equal(campo(fila, 'Mediador o moderador').options[0].textContent, 'Tercera variable Z...');
    const tipo = campo(fila, 'Tipo de modelo'); tipo.value = 'colisionador'; env.disparar(tipo, 'change');
    assert.equal(campo(fila, 'Coeficiente 3').placeholder, 'r(X,Y) verdadera');
    assert.match(campo(fila, 'Coeficiente 3').title, /SIN controlar Z/);
    const md = globalThis.generadorDatos.recolectarModelos().find(m => m.x === 'Estrés' && m.y === 'Sueño');
    assert.deepEqual(md && [md.tipo, md.m, md.c1, md.c2, md.c3], ['colisionador', 'Carga', 0.6, 0.6, 0]);
    assert.ok(['confusion', 'supresion', 'colisionador'].every(v => Array.from(tipo.options).some(o => o.value === v)));
});

test('revisión de la fase C: el CSV de modelos (el que usa el maestro) conserva los tipos nuevos en la ida y vuelta', () => {
    const csv = modelos.csvDeModelos();
    assert.match(csv, /colisionador,Estrés,Carga,Sueño/);
    document.getElementById('bodyModelos').innerHTML = '';
    modelos.aplicarCSVModelos(csv);
    const fila = document.querySelector('#bodyModelos tr');
    assert.equal(campo(fila, 'Tipo de modelo').value, 'colisionador');
    assert.equal(campo(fila, 'Coeficiente 3').placeholder, 'r(X,Y) verdadera');
    const md = globalThis.generadorDatos.recolectarModelos()[0];
    assert.deepEqual([md.tipo, md.x, md.m, md.y, md.c1, md.c2, md.c3], ['colisionador', 'Estrés', 'Carga', 'Sueño', 0.6, 0.6, 0]);
});

