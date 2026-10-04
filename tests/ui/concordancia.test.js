// tests/ui/concordancia.test.js — tarjeta 5 (concordancia) sobre index.html real: detecta Juez1_X, Juez2_X… de la base,
// calcula κ (categorías) o CCI (puntuaciones) con los mismos valores que el oráculo y redacta el párrafo APA.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';

const raiz = new URL('../../', import.meta.url);
const fx = JSON.parse(fs.readFileSync(new URL('../oracle/concordancia_fixture.json', import.meta.url), 'utf8'));
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
    const filas = fx.jueces[0].map((_, i) => ({ Juez1_ST: fx.jueces[0][i], Juez2_ST: fx.jueces[1][i], Juez3_ST: fx.jueces[2][i] }));
    fx.continuo[0].forEach((_, i) => { Object.assign(filas[i], Object.fromEntries(fx.continuo.map((c, j) => [`Juez${j + 1}_PT`, c[i]]))); });
    AnalizadorEstadistico.cargarDatos(filas);
    ui = await import(new URL('src/analizador/psicometria/concordancia-ui.js', raiz));
});

test('la tarjeta 5 detecta los conjuntos de evaluadores de la base', () => {
    assert.match(q('#concordanciaContainer .card-title').textContent, /Concordancia entre evaluadores/);
    env.disparar(q('#concActualizar'), 'click');
    const ops = [...document.querySelectorAll('#concConjunto option')].map(o => o.textContent);
    assert.ok(ops.includes('ST (3 evaluadores)') && ops.includes('PT (4 evaluadores)'), ops.join(' | '));
});

test('categorías con 3 evaluadores → κ de Fleiss igual al oráculo, con IC y párrafo APA', () => {
    q('#concConjunto').value = 'ST';
    const r = ui.calcular();
    assert.ok(Math.abs(r.kappa.valor - fx.fleiss) < 1e-12 && r.kappa.tipo === 'fleiss' && r.kappa.ic);
    assert.match(q('#concParrafo').textContent, /κ de Fleiss \(1971\): κ = \.\d{2}, IC 95 % \[\.\d{2}, \.\d{2}\]/);
});

test('puntuaciones con 4 evaluadores → los seis CCI iguales al oráculo; lista propia de 2 evaluadores → κ de Cohen y ponderados', () => {
    q('#concConjunto').value = 'PT';
    const r = ui.calcular();
    r.cci.formas.forEach((f, i) => assert.ok(Math.abs(f.valor - fx.cci[i][0]) < 1e-12, f.clave));
    assert.match(q('#concParrafo').textContent, /CCI\(2,1\) = \.\d{2}, IC 95 %/);
    const sel = q('#concConjunto'); sel.value = 'propia'; env.disparar(sel, 'change');
    q('#concColumnas').value = 'Juez1_ST, Juez2_ST';
    const r2 = ui.calcular();
    assert.ok(Math.abs(r2.kappa.valor - fx.cohen.ninguno) < 1e-12 && Math.abs(r2.kappa.ponderados.cuadratico.valor - fx.cohen.cuadratico) < 1e-12);
});

test('revisión 2026.10.18: lista propia con nombres de columna que llevan espacios', async () => {
    const { AnalizadorEstadistico } = await import(new URL('src/analizador/estadistica.js', raiz));
    AnalizadorEstadistico.cargarDatos(fx.jueces[0].map((_, i) => ({ 'Juez 1 ST': fx.jueces[0][i], 'Juez 2 ST': fx.jueces[1][i] })));
    const sel = q('#concConjunto'); ui.actualizarConjuntos(); sel.value = 'propia'; env.disparar(sel, 'change');
    q('#concColumnas').value = 'Juez 1 ST, Juez 2 ST';
    const r = ui.calcular();
    assert.ok(r && Math.abs(r.kappa.valor - fx.cohen.ninguno) < 1e-12, 'κ con columnas «Juez 1 ST» y «Juez 2 ST»');
});
