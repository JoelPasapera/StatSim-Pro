// tests/ui/guia-coherencia.test.js — la guía en vivo de la DE (revisión 2026.11.17): el caso sin salida es un aviso, no un
// error, y su texto nombra la prueba y la consecuencia en cifras.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';

const raiz = new URL('../../', import.meta.url);
let env, pruebas;
before(async () => {
    env = crearEntorno(fs.readFileSync(new URL('index.html', raiz), 'utf8'));
    env.document.readyState = 'interactive';
    await import(new URL('src/main.js', raiz));
    await new Promise(r => setTimeout(r, 0));
    env.document.readyState = 'complete';
    env.disparar(env.document, 'DOMContentLoaded', { bubbles: false });
    pruebas = await import(new URL('src/simulador/ui/pruebas.js', raiz));
});

test('sin salida (10 ítems de 1 a 5, M 30, DE 6, N = 300): aviso, no error, con la prueba y la cifra', () => {
    document.getElementById('tamanoMuestra').value = '300';
    const fila = pruebas.agregarFilaPruebaConDatos({ prueba: 'T', nombre: 'Escala', numItems: '10', distribucion: 'normal', media: '30', de: '6', min: '1', max: '5', alfa: '0.85', invertidos: '0' });
    const de = fila.querySelector('[aria-label="Desviación estándar (DE)"]'); env.disparar(de, 'input');
    const pista = fila.querySelector('.hint-de');
    assert.ok(pista, 'la fila tiene su pista de la DE');
    assert.match(pista.className, /aviso/); assert.doesNotMatch(pista.className, /invalido/);
    assert.match(pista.textContent, /Kolmogorov–Smirnov.*≈ 79 %/);
    assert.equal(de.classList.contains('invalid'), false, 'la DE 6 es posible: no se marca como inválida');
});
