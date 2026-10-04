// tests/ui/arranque.test.js — el sitio arranca como en el navegador: módulos diferidos con el documento ya parseado
// (readyState «interactive»), sin depender de DOMContentLoaded, y con ciclos de importación entre módulos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';

test('src/main.js evalúa todo el grafo con readyState interactive y monta las secciones', async () => {
    const raiz = new URL('../../', import.meta.url);
    const env = crearEntorno(fs.readFileSync(new URL('index.html', raiz), 'utf8'));
    env.document.readyState = 'interactive';
    globalThis.fetch = () => Promise.reject(new Error('sin red'));
    await import(new URL('src/main.js', raiz));
    await new Promise(r => setTimeout(r, 20));
    assert.deepEqual(Object.keys(globalThis.StatSim.api), ['analizador', 'buscador', 'redactor', 'explorador']);
    assert.equal(typeof globalThis.StatSimMantenimiento.recargarSinCache, 'function');
    assert.equal(typeof globalThis.generadorDatos, 'object');
    assert.ok(env.document.querySelectorAll('#bodyPruebas .fila-prueba').length >= 1, 'la interfaz del Simulador quedó montada');
});
