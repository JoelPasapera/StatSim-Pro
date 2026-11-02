// tests/ui/baremos.test.js — (2027.01.18) la tarjeta «11. Baremos» sobre index.html real: ofrece primero los puntajes
// (General_, Dimension_, Total_), elabora la tabla de baremos y los niveles con los números del núcleo (verificado contra el
// oráculo en tests/unit/baremos.test.js), decide con el protocolo de grupos si hacen falta baremos diferenciados, escribe la
// redacción sin huecos, descarga el CSV y el Word, y explica lo que no puede hacer.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';
import { problemasDeCitas } from './citas.js';

const raiz = new URL('../../', import.meta.url);
const { muestras: M } = JSON.parse(fs.readFileSync(new URL('../oracle/baremos_fixture.json', import.meta.url), 'utf8'));
let env, ui, q, A;
const n = M.likert_total.length;

before(async () => {
    env = crearEntorno(fs.readFileSync(new URL('index.html', raiz), 'utf8'));
    env.document.readyState = 'interactive';
    globalThis.fetch = () => Promise.reject(new Error('sin red'));
    await import(new URL('src/main.js', raiz));
    await new Promise(r => setTimeout(r, 0));
    env.document.readyState = 'complete';
    env.disparar(env.document, 'DOMContentLoaded', { bubbles: false });
    q = s => document.querySelector(s);
    ({ AnalizadorEstadistico: A } = await import(new URL('src/analizador/estadistica.js', raiz)));
    // la escala, un grupo que no difiere (Turno) y otro que sí (Sexo: las mujeres, 12 puntos más)
    A.cargarDatos(M.likert_total.map((v, i) => ({ ID: i + 1, Edad: 18 + (i % 9), Turno: i % 2 ? 'Mañana' : 'Tarde', Sexo: i % 3 ? 'Hombre' : 'Mujer', General_Estres: i % 3 ? v : v + 12, Chico: i < 20 ? 'A' : 'B' })));
    ui = await import(new URL('src/analizador/psicometria/baremos-ui.js', raiz));
});

test('la tarjeta 11 ofrece los puntajes primero y elabora un baremo general', async () => {
    assert.match(q('#baremosContainer .card-title').textContent, /^11\. Baremos/);
    env.disparar(q('#barActualizar'), 'click');
    const escalas = [...document.querySelectorAll('#barEscala option')].map(o => o.value);
    assert.equal(escalas[0], 'General_Estres');
    const grupos = [...document.querySelectorAll('#barGrupo option')].map(o => o.value);
    assert.deepEqual(grupos, ['', 'Turno', 'Sexo', 'Chico'], 'los grupos: las columnas con 2 a MAX_GRUPOS valores, sin la escala ni el ID');
    q('#barEscala').value = 'General_Estres'; q('#barGrupo').value = ''; q('#barEsquema').value = '25-75';
    const R = ui.calcular();
    assert.ok(R, q('#barMensajes').textContent);
    const { tablaBaremos } = await import(new URL('src/core/stats/baremos.js', raiz));
    assert.deepEqual(R.general.tabla, tablaBaremos(A.obtenerDatos().map(f => f.General_Estres)));
    assert.equal(R.general.categorias.length, 3);
    assert.equal(R.comparacion, null);
    const texto = q('#barResultados').textContent;
    assert.match(texto, /Baremos de General_Estres/);
    assert.match(q('#barParrafo').textContent, new RegExp(`^Se elaboraron los baremos de General_Estres con una muestra normativa \\(AERA et al\\., 2014\\) de ${n} personas`));
    assert.doesNotMatch(q('#barResultados').innerHTML, /undefined|NaN|\[object/);
    const antes = env.descargas.length;
    env.disparar(q('#barCSV'), 'click');
    const csv = await env.descargas[antes].text();
    assert.match(csv, /^﻿?Grupo;PD;f;fa;Percentil;T;Eneatipo;Decatipo\r\n/);
    assert.equal(csv.trim().split('\r\n').length, R.general.tabla.filas.length + 1);
    globalThis.htmlDocx = { asBlob: html => new Blob([html]) };
    assert.equal(await ui.exportarWord(), 'baremos_APA.docx');
    assert.deepEqual(problemasDeCitas(await env.descargas.at(-1).text()), { sinReferencia: [], sinCita: [] }, 'las citas del Word, frente a sus referencias');
    assert.match(await env.descargas[antes + 1].text(), /Tabla 1[\s\S]*Tabla 2/);
});

test('con un grupo que difiere, baremos diferenciados; con uno que no, un baremo general', () => {
    q('#barGrupo').value = 'Sexo';
    const R = ui.calcular();
    assert.ok(R && R.comparacion);
    assert.equal(R.comparacion.diferenciados, true, JSON.stringify(R.comparacion));
    assert.deepEqual(R.grupos.map(g => g.nombre), ['Hombre', 'Mujer']);
    assert.match(q('#barParrafo').textContent, /por lo que se presentan baremos diferenciados para Hombre y Mujer\./);
    assert.match(q('#barResultados').textContent, /Baremos de General_Estres: Mujer/);
    q('#barGrupo').value = 'Turno';
    const R2 = ui.calcular();
    assert.equal(R2.comparacion.diferenciados, false, JSON.stringify(R2.comparacion));
    assert.match(q('#barParrafo').textContent, /por lo que basta un baremo general\./);
    assert.doesNotMatch(q('#barResultados').textContent, /Baremos de General_Estres: Mañana/);
});

test('un grupo con menos de 30 personas no tiene baremo propio; con menos de 30 casos no hay baremos', () => {
    q('#barGrupo').value = 'Chico';
    const R = ui.calcular();
    assert.equal(R.comparacion.diferenciados, false);
    assert.match(q('#barMensajes').textContent, /Grupos con menos de 30 personas \(A\)/);
    A.cargarDatos(M.likert_total.slice(0, 25).map((v, i) => ({ ID: i + 1, General_Estres: v })));
    ui.actualizarVariables();
    q('#barGrupo').value = '';
    assert.equal(ui.calcular(), null);
    assert.match(q('#barMensajes').textContent, /al menos 30 puntuaciones/);
});
