// tests/ui/correlacion-parcial.test.js — (2027.01.17) la tarjeta 9 (correlación parcial y semiparcial) sobre index.html real:
// ofrece las variables cuantitativas, elige Pearson o Spearman con la regla de la vista principal, da los números del núcleo
// (verificado contra el oráculo en tests/unit/asociacion.test.js), escribe la redacción sin huecos, descarga el Word y explica
// lo que no puede calcular.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';
import { problemasDeCitas } from './citas.js';

const raiz = new URL('../../', import.meta.url);
const O = JSON.parse(fs.readFileSync(new URL('../oracle/asociacion_fixture.json', import.meta.url), 'utf8'));
let env, ui, q;
const e = O.parciales[1];   // Pearson con dos de control

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
    const filas = e.x.map((x, i) => ({ ID: i + 1, Sexo: i % 2 ? 'H' : 'M', X: x, Y: e.y[i], Z1: e.Z[0][i], Z2: e.Z[1][i] }));
    filas[3].Z2 = '';   // un perdido: el caso sale
    AnalizadorEstadistico.cargarDatos(filas);
    ui = await import(new URL('src/analizador/relaciones/correlacion-parcial-ui.js', raiz));
});

test('la tarjeta 9 ofrece las cuantitativas (sin el identificador ni el texto) y calcula la parcial y las semiparciales', async () => {
    assert.match(q('#parcialContainer .card-title').textContent, /9\. Correlación parcial y semiparcial/);
    env.disparar(q('#cpActualizar'), 'click');
    assert.deepEqual([...document.querySelectorAll('#cpX option')].map(o => o.value), ['X', 'Y', 'Z1', 'Z2']);
    q('#cpX').value = 'X'; q('#cpY').value = 'Y';
    document.querySelectorAll('#cpControles input').forEach(c => { c.checked = c.value === 'Z1' || c.value === 'Z2'; });
    q('#cpMetodo').value = 'pearson';
    const r = ui.calcular();
    const { correlacionParcial } = await import(new URL('src/core/stats/correlacion-parcial.js', raiz));
    const sin = (/** @type {number[]} */ v) => v.filter((_, i) => i !== 3);
    const esperado = correlacionParcial(sin(e.x), sin(e.y), [sin(e.Z[0]), sin(e.Z[1])]);
    assert.equal(r.parcial, esperado.parcial); assert.equal(r.n, e.x.length - 1);
    assert.match(q('#cpMensajes').textContent, /1 caso\(s\) con algún perdido/);
    const parrafo = q('#cpParrafo').textContent;
    assert.match(parrafo, /^Se estimó la correlación parcial entre X y Y controlando Z1 y Z2, con el coeficiente de Pearson \(elegido por quien analiza\)/);
    assert.doesNotMatch(q('#cpResultados').innerHTML, /undefined|NaN|\[object/);
    globalThis.htmlDocx = { asBlob: html => new Blob([html]) };
    const antes = env.descargas.length;
    assert.equal(await ui.exportarWord(), 'correlacion_parcial_APA.docx');
    assert.deepEqual(problemasDeCitas(await env.descargas.at(-1).text()), { sinReferencia: [], sinCita: [] }, 'las citas del Word, frente a sus referencias');
    assert.match(await env.descargas[antes].text(), /Tabla 1[\s\S]*Semiparcial de X/);
});

test('el automático elige Spearman si alguna no es normal; los errores se explican', () => {
    q('#cpMetodo').value = 'auto';
    // Y al cubo: muy asimétrica
    const r = ui.calcular();
    assert.ok(r, 'calcula');
    const p = q('#cpParrafo').textContent;
    assert.ok(/coeficiente de Spearman porque/.test(p) === r.spearman, 'el motivo dice la elección');
    document.querySelectorAll('#cpControles input').forEach(c => { c.checked = false; });
    assert.equal(ui.calcular(), null);
    assert.match(q('#cpMensajes').textContent, /al menos una variable de control/);
    q('#cpY').value = 'X';
    assert.equal(ui.calcular(), null);
    assert.match(q('#cpMensajes').textContent, /distintas/);
});
