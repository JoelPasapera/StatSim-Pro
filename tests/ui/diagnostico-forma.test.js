// tests/ui/diagnostico-forma.test.js — tarjeta 7 del Analizador (diagnóstico de la forma de una relación) en el DOM.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';

const raiz = new URL('../../', import.meta.url);
let env, ui, q;
before(async () => {
    env = crearEntorno(fs.readFileSync(new URL('index.html', raiz), 'utf8'));
    env.document.readyState = 'interactive';
    globalThis.fetch = () => Promise.reject(new Error('sin red'));
    await import(new URL('src/main.js', raiz));
    await new Promise(r => setTimeout(r, 0));
    env.document.readyState = 'complete';
    env.disparar(env.document, 'DOMContentLoaded', { bubbles: false });
    q = s => document.querySelector(s);
    const { AnalizadorEstadistico } = await import(new URL('src/analizador/estadistica.js', raiz));
    let a = 11 >>> 0; const u01 = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const nrm = () => Math.sqrt(-2 * Math.log(u01() || 1e-12)) * Math.cos(2 * Math.PI * u01());
    AnalizadorEstadistico.cargarDatos(Array.from({ length: 300 }, (_, i) => { const z = nrm(); return { Sexo: i % 2 ? 'M' : 'F', 'Estrés': Math.round(30 + 6 * z), Rendimiento: +(12 - 3 * z * z + 1.2 * nrm()).toFixed(1) }; }));
    ui = await import(new URL('src/analizador/relaciones/diagnostico-forma-ui.js', raiz));
});

test('la tarjeta 7 monta y ofrece solo variables cuantitativas', () => {
    assert.ok(q('#diagnosticoFormaContainer h3').textContent.includes('7. Diagnóstico de la forma de una relación'));
    ui.actualizarVariables();
    const opciones = [...q('#dfX').querySelectorAll('option')].map(o => o.value);
    assert.deepEqual(opciones, ['Estrés', 'Rendimiento']);
    assert.equal(q('#dfY').value, 'Rendimiento', 'Y distinta de X por defecto');
});

test('diagnosticar: gráfico, tablas, párrafo APA con el coeficiente adecuado y botón de Word', async () => {
    q('#dfX').value = 'Estrés'; q('#dfY').value = 'Rendimiento';
    const d = await ui.calcular();
    assert.equal(d.categoria, 'u-invertida');
    assert.equal(q('#dfResultados').hidden, false);
    assert.ok(q('#dfResultados h4').textContent.includes('U invertida'));
    assert.equal(q('#dfResultados').querySelectorAll('svg path').length, 2, 'recta y forma elegida');
    assert.equal(q('#dfResultados').querySelectorAll('table')[0].querySelectorAll('tbody tr').length, 5);
    assert.equal(q('#dfResultados').querySelectorAll('table')[1].querySelectorAll('tbody tr').length, 10);
    assert.ok(q('#dfParrafo').textContent.includes('Como cambia de sentido'));
    assert.ok(q('#dfWord'));
    assert.equal(ui.resultadoDiagnosticoForma().nx, 'Estrés');
    // (2026.10.29) confirmación del cambio de sentido: tabla 3 y párrafo
    assert.equal(q('#dfTituloConfirmacion').textContent, 'Confirmación del cambio de sentido');
    assert.equal(q('#dfResultados').querySelectorAll('table')[2].querySelectorAll('tbody tr').length, 6);
    assert.ok(q('#dfParrafo').textContent.includes('prueba de las dos rectas (Simonsohn, 2018)'));
    // (2026.10.31) la nube de puntos: título, tabla de 9 filas y párrafo
    assert.equal(q('#dfTituloNube').textContent, 'La nube de puntos');
    // (2026.11.04) con una U, los bordes rectos y la condición necesaria «no aplican» (una fila cada uno); (2026.11.12) más la
    // fila de la influencia en grupo: 8 filas
    const tablaNube = q('#dfResultados').querySelectorAll('table')[3];
    assert.equal(tablaNube.querySelectorAll('tbody tr').length, 8);
    assert.ok(tablaNube.textContent.includes('No aplica: la tendencia cambia de sentido'));
    assert.ok(q('#dfParrafoNube').textContent.includes('Breusch–Pagan'));
});

test('error claro si X e Y son la misma variable', async () => {
    q('#dfX').value = 'Estrés'; q('#dfY').value = 'Estrés';
    assert.equal(await ui.calcular(), null);
    assert.ok(q('#dfMensajes').textContent.includes('distintas'));
    assert.equal(q('#dfResultados').hidden, true);
});

test('el límite de equivalencia tiene su guía y se valida', async () => {
    assert.equal(q('#dfLimite').value, '0.10');
    assert.ok(q('#dfLimite').closest('.form-group').querySelector('.orden-guia'));
    q('#dfX').value = 'Estrés'; q('#dfY').value = 'Rendimiento'; q('#dfLimite').value = '0.9';
    assert.equal(await ui.calcular(), null);
    assert.ok(q('#dfMensajes').textContent.includes('entre .01 y .50'));
    q('#dfLimite').value = '0.10';
});

test('sin relación: título sin redundancia, tabla de equivalencia y recomendación «ninguno» (revisión 2026.10.30)', async () => {
    const { AnalizadorEstadistico } = await import(new URL('src/analizador/estadistica.js', raiz));
    let b = 91 >>> 0; const u = () => { b = (b + 0x6D2B79F5) >>> 0; let t = b; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const nr = () => Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u());
    AnalizadorEstadistico.cargarDatos(Array.from({ length: 1500 }, () => ({ 'Estrés': Math.round(30 + 6 * nr()), Rendimiento: +(14 + 2 * nr()).toFixed(1) })));
    ui.actualizarVariables(); q('#dfX').value = 'Estrés'; q('#dfY').value = 'Rendimiento'; q('#dfLimite').value = '0.10';
    const d = await ui.calcular();
    assert.equal(d.categoria, 'sin-relacion');
    assert.equal(q('#dfResultados h4').textContent, 'Rendimiento frente a Estrés: sin relación apreciable');
    assert.equal(q('#dfTituloConfirmacion').textContent, 'Prueba de equivalencia de la relación lineal');
    assert.ok(q('#dfResultados p').textContent.includes('ninguno'));
});
