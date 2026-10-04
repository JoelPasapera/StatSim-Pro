// tests/ui/afe.test.js — la tarjeta del AFE sobre index.html real (sin Worker: cálculo en el hilo principal): lista de
// escalas de la base cargada, cálculo con análisis paralelo y oblimin, tablas, redacción y aviso de ítems ajenos.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';

const raiz = new URL('../../', import.meta.url);
const fx = JSON.parse(fs.readFileSync(new URL('../oracle/afe_fixture.json', import.meta.url), 'utf8'));
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
    const { EtiquetasVariables } = await import(new URL('src/shared/etiquetas-variables.js', raiz));
    EtiquetasVariables.limpiar();
    // 12 ítems con prefijos distintos por bloque: la detección los agrupa en tres escalas y el usuario elige la lista propia
    const nombres = ['AA', 'AB', 'AC'].flatMap(p => [1, 2, 3, 4].map(i => `${p}${i}`));
    AnalizadorEstadistico.cargarDatos(fx.cols[0].map((_, i) => Object.fromEntries(nombres.map((nm, j) => [nm, fx.cols[j][i]]))));
    ui = await import(new URL('src/analizador/psicometria/afe-ui.js', raiz));
});

test('la tarjeta 4 se monta con guías y lista las escalas de la base al pulsar ↻', () => {
    assert.match(q('#afeContainer .card-title').textContent, /Análisis factorial exploratorio/);
    assert.ok(document.querySelectorAll('#afeContainer .orden-guia-titulo').length >= 6);
    env.disparar(q('#afeActualizar'), 'click');
    const opciones = [...document.querySelectorAll('#afeConjunto option')].map(o => o.textContent);
    assert.ok(opciones.some(t => /· 4 ítems/.test(t)) && opciones[opciones.length - 1].startsWith('Lista propia'), opciones.join(' | '));
});

test('AFE con lista propia (12 ítems): paralelo → 3 factores, oblimin, tablas y redacción APA', async () => {
    const sel = q('#afeConjunto'); sel.value = 'propia'; env.disparar(sel, 'change');
    q('#afeItems').value = ['AA', 'AB', 'AC'].flatMap(p => [1, 2, 3, 4].map(i => `${p}${i}`)).join(', ');
    q('#afeCorrelacion').value = 'pearson'; q('#afeB').value = '100'; q('#afeSemilla').value = '7';
    const r = await ui.calcular();
    assert.ok(r && r.m === 3 && r.sugeridos === fx.m, 'tres factores como el oráculo');
    const txt = q('#afeResultados').textContent;
    assert.ok(/Autovalores y análisis paralelo/.test(txt) && /Cargas factoriales/.test(txt) && /Correlaciones entre factores/.test(txt));
    assert.match(q('#afeParrafo').textContent, /estructura interna de los ítems seleccionados se realizó/);
    assert.match(q('#afeParrafo').textContent, /análisis paralelo por permutaciones \(B = 100; percentil 95; Horn, 1965; Buja y Eyuboglu, 1992; Glorfeld, 1995\) sugirió retener 3 factores/);
    assert.match(q("#afeParrafo").textContent, /se rotaron con oblimin directo \(γ = 0\)/);
    assert.ok(document.querySelectorAll('#afeResultados tbody strong').length >= 10, 'cargas principales resaltadas');
});

test('un ítem que no está en la base se informa y no se calcula', async () => {
    q('#afeItems').value = 'AA1, AA2, ZZ9';
    const r = await ui.calcular();
    assert.equal(r, null);
    assert.match(q('#afeMensajes').textContent, /No están en la base: ZZ9/);
});
