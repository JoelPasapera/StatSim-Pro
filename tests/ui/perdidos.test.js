// tests/ui/perdidos.test.js — (2027.01.18) la tarjeta «Antes de analizar: datos perdidos» sobre index.html real: con la base
// MAR del oráculo (tests/oracle/perdidos_fixture.json) da los patrones, el EM y la prueba de Little del núcleo (verificados en
// tests/unit/perdidos.test.js), recomienda imputar, imputa (en el hilo principal: minidom no tiene Workers), combina las medias
// y las correlaciones, descarga las bases apiladas en CSV y en .sav y el Word; y con una base sin perdidos lo dice.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';
import { problemasDeCitas } from './citas.js';

const raiz = new URL('../../', import.meta.url);
const O = JSON.parse(fs.readFileSync(new URL('../oracle/perdidos_fixture.json', import.meta.url), 'utf8'));
const B = O.bases.mar;
let env, ui, q, A;

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
    A.cargarDatos(B.X[0].map((_, i) => ({ ID: i + 1, Grupo: i % 2 ? 'A' : 'B', ...Object.fromEntries(B.X.map((c, j) => [`X${j + 1}`, c[i] === null ? '' : c[i]])) })));
    ui = await import(new URL('src/analizador/perdidos/perdidos-ui.js', raiz));
});

test('el diagnóstico: los perdidos por variable, los patrones, el EM y la prueba de Little', () => {
    assert.match(q('#perdidosContainer .card-title').textContent, /^Antes de analizar: datos perdidos/);
    env.disparar(q('#perActualizar'), 'click');
    q('#perConjunto').value = 'todas';
    const D = ui.calcular();
    assert.ok(D, q('#perMensajes').textContent);
    assert.deepEqual(D.variables, ['X1', 'X2', 'X3', 'X4']);
    assert.deepEqual(D.P.perdidosPorVariable, B.perdidosPorVariable);
    D.em.medias.forEach((v, j) => assert.ok(Math.abs(v - B.medias[j]) < 1e-6, `media EM ${j}`));
    assert.ok(Math.abs(D.little.chi2 - B.little.chi2) < 1e-4 * B.little.chi2);
    const texto = q('#perResultados').textContent;
    assert.match(texto, /Conviene la imputación múltiple/);
    assert.match(texto, /Prueba MCAR de Little/);
    assert.match(q('#perParrafo').textContent, /^Se examinaron los valores perdidos de 4 variables \(todas las variables numéricas, sin los puntajes\) en 250 casos\. Faltaba el \d+\.\d % de los valores;/);
    assert.match(q('#perParrafo').textContent, /La prueba MCAR de Little \(1988\) fue significativa, χ²\(15\) = 65\.14, p < \.001/);
    assert.doesNotMatch(q('#perResultados').innerHTML, /undefined|NaN|\[object/);
});

test('la imputación múltiple: medias y correlaciones combinadas, bases apiladas en CSV y .sav, y el Word', async () => {
    q('#perM').value = '5'; q('#perMetodo').value = 'pmm';
    const MI = await ui.imputar();
    assert.ok(MI, q('#perMensajes').textContent);
    assert.equal(MI.m, 5); assert.deepEqual(MI.imputadas, [0, 1, 2, 3]);
    const texto = q('#perResultados').textContent;
    assert.match(texto, /Medias combinadas de las 5 imputaciones/);
    assert.match(texto, /Correlaciones de Pearson combinadas/);
    assert.match(q('#perParrafo').textContent, /Los valores perdidos se imputaron por ecuaciones encadenadas con emparejamiento predictivo de medias \(PMM, 5 donantes; van Buuren y Groothuis-Oudshoorn, 2011\)/);
    // la media combinada de X2 corrige el sesgo de los casos disponibles hacia la del EM
    const m2 = MI.medias[1].estimacion, em2 = B.medias[1], disp = A.obtenerDatos().map(f => f.X2).filter(v => v !== '');
    const mDisp = disp.reduce((s, v) => s + v, 0) / disp.length;
    assert.ok(Math.abs(m2 - em2) < Math.abs(mDisp - em2), `IM ${m2}, EM ${em2}, disponibles ${mDisp}`);
    const antes = env.descargas.length;
    assert.equal(ui.descargarCSV(), true);
    const csv = await env.descargas[antes].text();
    const lineas = csv.replace(/^﻿/, '').trim().split('\r\n');
    assert.equal(lineas[0], 'Imputation_;ID;Grupo;X1;X2;X3;X4');
    assert.equal(lineas.length, 1 + 250 * 6);
    assert.ok(lineas.slice(251).every(l => !/;;|;$/.test(l)), 'las imputadas, sin celdas vacías');
    assert.ok(lineas.slice(1, 251).some(l => /;;|;$/.test(l)), 'la original (Imputation_ = 0), con sus perdidos');
    assert.deepEqual(ui.descargarSav(), []);
    const sav = new Uint8Array(await env.descargas[antes + 1].arrayBuffer());
    assert.equal(String.fromCharCode(...sav.slice(0, 4)), '$FL2');
    globalThis.htmlDocx = { asBlob: html => new Blob([html]) };
    assert.equal(await ui.exportarWord(), 'datos_perdidos_APA.docx');
    assert.deepEqual(problemasDeCitas(await env.descargas.at(-1).text()), { sinReferencia: [], sinCita: [] }, 'las citas del Word, frente a sus referencias');
    assert.match(await env.descargas[antes + 2].text(), /Tabla 1[\s\S]*Valores perdidos por variable[\s\S]*Tabla 2[\s\S]*Patrones[\s\S]*Tabla 3[\s\S]*Medias combinadas/);
});

test('sin perdidos lo dice; los errores se explican', () => {
    A.cargarDatos(Array.from({ length: 30 }, (_, i) => ({ ID: i + 1, A: i % 5, B: (i * 3) % 7, C: 'x' })));
    ui.actualizarVariables();
    q('#perConjunto').value = 'todas';
    const D = ui.calcular();
    assert.equal(D.P.celdasPerdidas, 0);
    assert.match(q('#perResultados').textContent, /No falta ningún valor en estas variables/);
    assert.match(q('#perParrafo').textContent, /No faltaba ningún valor\.$/);
    q('#perConjunto').value = 'propia'; q('#perItems').value = 'A, NoExiste';
    assert.equal(ui.calcular(), null);
    assert.match(q('#perMensajes').textContent, /No están en la base: NoExiste/);
    q('#perItems').value = 'C';
    assert.equal(ui.calcular(), null);
    assert.match(q('#perMensajes').textContent, /Ninguna de las variables tiene al menos dos valores observados distintos/);
});
