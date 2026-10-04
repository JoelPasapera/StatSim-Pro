// tests/ui/aiken.test.js — la tarjeta de validez de contenido sobre index.html real: ejemplo, recálculo al cambiar el
// criterio, errores de entrada con su ubicación y guardado en el navegador.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';

const raiz = new URL('../../', import.meta.url);
let env, ui;
const q = s => globalThis.document.querySelector(s);
const clic = el => env.disparar(el, 'click');

before(async () => {
    env = crearEntorno(fs.readFileSync(new URL('index.html', raiz), 'utf8'));
    env.document.readyState = 'interactive';
    globalThis.fetch = () => Promise.reject(new Error('sin red'));
    await import(new URL('src/main.js', raiz));
    await new Promise(r => setTimeout(r, 0));
    env.document.readyState = 'complete';
    env.disparar(env.document, 'DOMContentLoaded', { bubbles: false });
    ui = await import(new URL('src/analizador/psicometria/aiken-ui.js', raiz));
});

test('la tarjeta se monta en el Analizador con tres criterios vacíos y las guías', () => {
    assert.ok(q('#validezContenidoContainer .card-title').textContent.includes('V de Aiken'));
    assert.equal(document.querySelectorAll('#aikenCriterios .criterio-aiken').length, 3);
    assert.ok(document.querySelectorAll('#validezContenidoContainer .orden-guia-titulo').length >= 5, 'guías «Para qué sirve» y orden');
    assert.equal(q('#aikenV0').value, '0.7'); assert.equal(q('#aikenConfianza').value, '0.95');
});

test('«Cargar ejemplo» calcula y pinta tablas, decisiones y el párrafo APA', () => {
    clic(q('#aikenEjemplo'));
    assert.equal(q('#aikenResultados').hidden, false);
    assert.equal(document.querySelectorAll('#aikenResultados table').length, 4, 'tres criterios y el resumen');
    assert.equal(document.querySelectorAll('#aikenResultados tbody .insignia-no_valido').length, 4, 'ítem 4 en los tres criterios y en el resumen');
    assert.match(q('#aikenParrafo').textContent, /juicio de 5 expertos/);
    assert.ok(localStorage.getItem('statsim.aiken.v1'), 'se guarda en el navegador');
});

test('cambiar V₀ recalcula al momento (0,50: el ítem 3 pasa a válido; el 4 queda en revisar en pertinencia y no válido en claridad)', () => {
    const v0 = q('#aikenV0'); v0.value = '0.5'; env.disparar(v0, 'change');
    const r = ui.resultadoActual();
    assert.equal(r.configuracion.v0, 0.5);
    assert.deepEqual([r.porItem[2].decision, r.criterios[0].items[3].decision, r.criterios[2].items[3].decision, r.porItem[3].decision], ['valido', 'revisar', 'no_valido', 'no_valido']);
    assert.match(q('#aikenParrafo').textContent, /Cicchetti, 1994/);
});

test('una valoración fuera de escala se señala con su ubicación y no se calcula', () => {
    const area = document.querySelectorAll('#aikenCriterios textarea')[0];
    area.value = area.value.replace('Ítem 1\t4', 'Ítem 1\t5'); env.disparar(area, 'input');
    clic(q('#aikenCalcular'));
    assert.equal(q('#aikenResultados').hidden, true);
    assert.match(q('#aikenMensajes').textContent, /ítem 1, juez 1: 5 está fuera de la escala 1–4/);
});
