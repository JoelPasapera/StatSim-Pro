// tests/ui/simulador-techo.test.js — «Con techo» y «Con suelo» en la tabla de escalas (fase B2 del Atlas, 2026.11.06): la
// nota muestra en vivo la proporción de casos en el límite (la fijan la media, la DE y el rango), la configuración recoge la
// distribución y el CSV de escalas la conserva.
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
    pruebas.agregarFilaTestConDatos({ prueba: 'T', variable: 'Bienestar', dimensiones: ['Activación', 'Calma'], rIntra: '0.3' });
    pruebas.sincronizarDimensionesDesdeTests();
});
const fila = nombre => [...document.querySelectorAll('#bodyPruebas .fila-prueba')].find(f => f.querySelector('[aria-label="Nombre de la escala"]').value === nombre);
function fijar(f, valores) { for (const [et, v] of Object.entries(valores)) { const el = f.querySelector(`[aria-label="${et}"]`); el.value = v; env.disparar(el, et === 'Distribución' ? 'change' : 'input'); } }

test('la nota muestra la proporción en el límite y se vacía con otra distribución', () => {
    const f = fila('Activación');
    assert.deepEqual([...f.querySelectorAll('[aria-label="Distribución"] option')].map(o => o.value), ['normal', 'uniforme', 'asimetrica', 'techo', 'suelo']);
    fijar(f, { 'Número de ítems': '10', 'Media (M)': '40', 'Desviación estándar (DE)': '8.74', 'Mínimo por ítem': '1', 'Máximo por ítem': '5', 'Alfa de Cronbach objetivo': '0.85', 'Distribución': 'techo' });
    assert.match(f.querySelector('.nota-censura').textContent, /≈ 21 % de los casos en el máximo \(50\)/);
    fijar(f, { 'Distribución': 'suelo', 'Media (M)': '20' });
    assert.match(f.querySelector('.nota-censura').textContent, /≈ 21 % de los casos en el mínimo \(10\)/);
    fijar(f, { 'Distribución': 'normal' });
    assert.equal(f.querySelector('.nota-censura').textContent, '');
    // coherente con la validación: en una escala de acierto/error la nota no promete una proporción
    fijar(f, { 'Distribución': 'techo', 'Mínimo por ítem': '0', 'Máximo por ítem': '1' });
    assert.equal(f.querySelector('.nota-censura').textContent, 'El techo no se aplica a escalas de acierto/error.');
    fijar(f, { 'Mínimo por ítem': '1', 'Máximo por ítem': '5' });
});

test('la configuración recoge «techo» y el CSV de escalas lo conserva (ida y vuelta)', () => {
    const f = fila('Activación');
    // todos los campos explícitos: la prueba no depende del estado que dejó la anterior
    fijar(f, { 'Número de ítems': '10', 'Media (M)': '40', 'Desviación estándar (DE)': '8.74', 'Mínimo por ítem': '1', 'Máximo por ítem': '5', 'Distribución': 'techo' });
    const escala = globalThis.generadorDatos.recolectarPruebas().find(p => p.nombre === 'Activación');
    assert.equal(escala.distribucion, 'techo');
    const csv = pruebas.csvDeTabla('#bodyPruebas .fila-prueba', 'pruebas');
    assert.match(csv, /Activación,10,techo,40/);
    pruebas.aplicarCSVPruebas(csv);
    assert.equal(fila('Activación').querySelector('[aria-label="Distribución"]').value, 'techo');
    // una fila creada con datos (importar un CSV) calcula su nota sin que el usuario toque nada
    assert.match(fila('Activación').querySelector('.nota-censura').textContent, /≈ 21 % de los casos en el máximo \(50\)/);
});

test('revisión 2026.11.07: pasar una fila por el rango 0–1 (acierto/error) y volver restaura la DE del usuario y su nota', () => {
    const f = fila('Calma');
    fijar(f, { 'Número de ítems': '10', 'Media (M)': '40', 'Desviación estándar (DE)': '8.74', 'Mínimo por ítem': '1', 'Máximo por ítem': '5', 'Distribución': 'techo' });
    fijar(f, { 'Mínimo por ítem': '0', 'Máximo por ítem': '1' });
    assert.notEqual(f.querySelector('[aria-label="Desviación estándar (DE)"]').value, '8.74', 'en 0–1 la DE es la derivada de la KR-20');
    fijar(f, { 'Mínimo por ítem': '1', 'Máximo por ítem': '5' });
    assert.equal(f.querySelector('[aria-label="Desviación estándar (DE)"]').value, '8.74');
    assert.match(f.querySelector('.nota-censura').textContent, /≈ 21 % de los casos en el máximo \(50\)/);
});
