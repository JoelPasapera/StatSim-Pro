// tests/ui/cribado-forma.test.js — F4 de extremo a extremo (2026.11.02): el análisis de correlación criba la forma de
// todos sus pares; la criba muestra la columna «Forma» con el botón que abre la tarjeta 7, el resultado principal y los
// objetivos avisan, y la matriz del Word lleva las letras y su nota. Todo sale de UN cribado (window.ultimoAnalisis).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';

const raiz = new URL('../../', import.meta.url);
let env, analisis;
const q = sel => globalThis.document.querySelector(sel);
const esperar = async (cond, ms = 20000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error('tiempo de espera agotado'); await new Promise(r => setTimeout(r, 25)); } };

before(async () => {
    env = crearEntorno(fs.readFileSync(new URL('index.html', raiz), 'utf8'));
    env.document.readyState = 'interactive';
    globalThis.fetch = () => Promise.reject(new Error('sin red'));
    await import(new URL('src/main.js', raiz));
    await new Promise(r => setTimeout(r, 0));
    env.document.readyState = 'complete';
    env.disparar(env.document, 'DOMContentLoaded', { bubbles: false });
    analisis = await import(new URL('src/analizador/ui/analisis.js', raiz));
    const { AnalizadorEstadistico } = await import(new URL('src/analizador/estadistica.js', raiz));
    let a = 2024 >>> 0; const u = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const nrm = () => Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u());
    const filas = Array.from({ length: 300 }, () => {
        const z1 = nrm(), z2 = nrm(), z3 = nrm();
        // cada forma en su variable (si comparten Y, la varianza de la U tapa la curva): la U de A1 en General_B y la
        // curva que se satura de A2 en General_A (r ≈ .35: por debajo del umbral de parte-todo, así que es objetivo)
        return { General_A: Math.round(50 + 12 * (1 - Math.exp(-1.2 * (z2 + 2.5))) + 3 * nrm()), Dimension_A1: Math.round(30 + 6 * z1), Dimension_A2: Math.round(30 + 6 * z2),
            General_B: Math.round(60 + 9 * (z1 * z1 - 1) + 0.5 * z3 + 3 * nrm()) };
    });
    // como un archivo del usuario: datos al motor y a la interfaz (tabla y desplegables)
    const carga = await import(new URL('src/analizador/ui/carga.js', raiz));
    AnalizadorEstadistico.cargarDatos(filas); carga.mostrarDatosCargados(filas); carga.poblarSelectsVariables(filas);
    q('#variable1').value = 'General_A'; q('#variable2').value = 'General_B';
    document.querySelector('input[name="tipoAnalisis"][value="correlacion"]').checked = true;
    analisis.ejecutarAnalisis();
    await esperar(() => /Pearson|Spearman/i.test((q('#resultadosCorrelacion') || { textContent: '' }).textContent) && globalThis.ultimoAnalisis && globalThis.ultimoAnalisis.formas);
});

test('la criba muestra la columna «Forma»: la U «cambia de sentido» y la curva que se frena es «curva monótona»', () => {
    const marco = q('#marcoMetodologicoContainer'), filas = [...marco.querySelectorAll('tbody tr')];
    assert.ok([...marco.querySelectorAll('th')].some(th => th.textContent === 'Forma'), 'columna Forma');
    const fila = etiqueta => filas.find(tr => tr.textContent.includes(etiqueta));
    assert.match(fila('Dimension_A1 ↔ General_B').textContent, /Cambia de sentido/);
    assert.match(fila('Dimension_A2 ↔ General_A').textContent, /Curva monótona/);
    assert.ok(fila('Dimension_A1 ↔ General_B').querySelector('[data-diagnosticar-x="Dimension_A1"]'), 'botón Diagnosticar con el par');
    assert.ok(marco.textContent.includes('RESET robusta de Ramsey, 1969'), 'la explicación del cribado');
});

test('un único cribado para todo el análisis, con Holm y B suficiente', () => {
    const f = globalThis.ultimoAnalisis.formas;
    // principal + 4 de la criba + el par entre las dos dimensiones de la matriz = 6; cada par en su PRIMERA dirección
    assert.ok(f.m === 6 && f.B >= Math.ceil(2 * f.m / 0.05) - 1, `${f.m} pares, B = ${f.B}`);
    assert.ok([...f.resultados.values()].every(r => !(r.a === 'General_B' && r.b.startsWith('Dimension_'))), 'ningún par de la criba invertido');
    const u = [...f.resultados.values()].find(r => r.a === 'Dimension_A1' && r.b === 'General_B');
    assert.equal(u.tipo, 'no-monotona'); assert.ok(u.pAjustada < 0.05);
});

test('«Diagnosticar» abre la tarjeta 7 con ese par y la diagnostica como no monótona', async () => {
    const boton = q('#marcoMetodologicoContainer').querySelector('[data-diagnosticar-x="Dimension_A1"]');
    env.disparar(boton, 'click');
    await esperar(() => !q('#dfResultados').hidden);
    assert.deepEqual([q('#dfX').value, q('#dfY').value], ['Dimension_A1', 'General_B']);
    assert.match(q('#dfResultados h4').textContent, /en U|en J|invertida/);
});

test('la matriz del Word lleva la letra de la curva monótona y su nota; los objetivos, su frase', async () => {
    const { ExportadorWord } = await import(new URL('src/analizador/exportador-word.js', raiz));
    ExportadorWord._png = ExportadorWord._png || {};
    const doc = ExportadorWord.generarCapitulo(globalThis.ultimoAnalisis);
    assert.match(doc, /\d\.\d\dᵃ/, 'celda con la letra ᵃ');
    assert.ok(doc.includes('ᵃ Relación curva pero monótona según el cribado de forma'), 'nota de la letra');
    assert.ok(doc.includes('El cribado de forma señaló que'), 'frase en los objetivos específicos');
});

test('revisión 2026.11.03: dos «Diagnosticar» seguidos muestran siempre el ÚLTIMO par pedido (el resultado tardío se descarta)', async () => {
    const marco = q('#marcoMetodologicoContainer'), b1 = marco.querySelector('[data-diagnosticar-x="Dimension_A2"]'), b2 = marco.querySelector('[data-diagnosticar-x="Dimension_A1"]');
    q('#dfResultados').hidden = true;
    env.disparar(b1, 'click'); env.disparar(b2, 'click');
    await esperar(() => !q('#dfResultados').hidden);
    await new Promise(r => setTimeout(r, 300));
    assert.deepEqual([q('#dfX').value, q('#dfY').value], ['Dimension_A1', 'General_B']);
    assert.match(q('#dfResultados h4').textContent, /^General_B frente a Dimension_A1/);
});
