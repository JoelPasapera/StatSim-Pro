// tests/ui/mediacion.test.js — (2027.01.17) la tarjeta 10 (mediación y moderación) sobre index.html real: muestra los campos de
// cada modelo, valida la elección, estima (sin Worker, en el hilo principal) con los números del motor (verificado contra el
// oráculo en tests/unit/mediacion.test.js), escribe las tablas, el diagrama, las pendientes y la redacción sin huecos, y
// descarga el Word.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';
import { problemasDeCitas } from './citas.js';

const raiz = new URL('../../', import.meta.url);
const CASOS = JSON.parse(fs.readFileSync(new URL('../oracle/mediacion_fixture.json', import.meta.url), 'utf8'));
let env, ui, q, filasBase, Analizador;

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
    // las variables de los casos del oráculo: X, W y C (comunes), M1 y M3 (paralelo), Y4 (mediación) e Y1 (moderación)
    const m4 = CASOS[3].pedido, mod = CASOS[0].pedido;
    const filas = m4.x.map((x, i) => ({ ID: i + 1, X: x, W: mod.w[i], C: mod.covariables[0][i], M1: m4.m[0][i], M3: m4.m[1][i], Y4: m4.y[i], Y1: mod.y[i] }));
    AnalizadorEstadistico.cargarDatos(filas);
    filasBase = filas; Analizador = AnalizadorEstadistico;
    ui = await import(new URL('src/analizador/relaciones/mediacion-ui.js', raiz));
});

test('la tarjeta 10 muestra los campos de cada modelo y valida la elección', async () => {
    assert.match(q('#mediacionContainer .card-title').textContent, /10\. Mediación y moderación/);
    env.disparar(q('#medActualizar'), 'click');
    const sel = q('#medModelo');
    sel.value = '1'; env.disparar(sel, 'change');
    assert.ok(q('#medGrupoM').hidden && !q('#medGrupoW').hidden && q('#medGrupoB').hidden, 'la moderación: sin mediadores ni bootstrap, con W');
    sel.value = '6'; env.disparar(sel, 'change');
    assert.ok(!q('#medGrupoM').hidden && q('#medGrupoW').hidden && !q('#medM3').hidden && q('#medM4').hidden, 'en serie: hasta 3 mediadores, sin W');
    sel.value = '4'; env.disparar(sel, 'change');
    q('#medX').value = 'X'; q('#medY').value = 'Y4'; q('#medM1').value = ''; q('#medM2').value = '';
    assert.equal(await ui.calcular(), null);
    assert.match(q('#medMensajes').textContent, /Elige el mediador/);
});

test('modelo 4 en paralelo con una covariable: los indirectos del motor, el diagrama y la redacción; el Word', async () => {
    const c = CASOS[3];
    q('#medModelo').value = '4'; env.disparar(q('#medModelo'), 'change');
    q('#medX').value = 'X'; q('#medY').value = 'Y4'; q('#medM1').value = 'M1'; q('#medM2').value = 'M3'; q('#medM3').value = ''; q('#medM4').value = '';
    document.querySelectorAll('#medCovariables input').forEach(e => { e.checked = e.value === 'C'; });
    q('#medB').value = '1000'; q('#medSemilla').value = '2027';
    const R = await ui.calcular();
    assert.ok(R && R.bootstrap, 'con bootstrap');
    for (const [k, v] of Object.entries(c.puntuales)) assert.ok(Math.abs(R.puntuales[k] - v) < 1e-10, `${k}`);
    const zona = q('#medResultados');
    assert.equal(zona.hidden, false);
    assert.ok(zona.querySelector('svg[role="img"]'), 'el diagrama de rutas');
    assert.match(zona.textContent, /Indirecto por M1/); assert.match(zona.textContent, /Contraste: por M1 − por M3/);
    assert.match(q('#medParrafo').textContent, /^Se aplicó el modelo 4 de PROCESS \(Hayes, 2022\), mediación simple o en paralelo, por mínimos cuadrados \(n = 120\), controlando C/);
    assert.doesNotMatch(zona.innerHTML, /undefined|NaN|\[object/);
    globalThis.htmlDocx = { asBlob: html => new Blob([html]) };
    const antes = env.descargas.length;
    assert.equal(await ui.exportarWord(), 'mediacion_APA.docx');
    assert.deepEqual(problemasDeCitas(await env.descargas.at(-1).text()), { sinReferencia: [], sinCita: [] }, 'las citas del Word, frente a sus referencias');
    const doc = await env.descargas[antes].text();
    assert.match(doc, /Preacher, K\. J\. y Hayes, A\. F\. \(2008\)/); assert.doesNotMatch(doc, /undefined|NaN/);
});

test('modelo 1: la interacción, los efectos condicionales, Johnson-Neyman y las pendientes simples', async () => {
    q('#medModelo').value = '1'; env.disparar(q('#medModelo'), 'change');
    q('#medX').value = 'X'; q('#medY').value = 'Y1'; q('#medW').value = 'W'; q('#medCentrar').checked = true;
    document.querySelectorAll('#medCovariables input').forEach(e => { e.checked = e.value === 'C'; });
    const R = await ui.calcular();
    const o = CASOS[0];
    R.condicionales.forEach((x, i) => assert.ok(Math.abs(x.efecto - o.condicionales[i].efecto) < 1e-10));
    const zona = q('#medResultados');
    assert.equal(zona.querySelectorAll('svg[role="img"]').length, 2, 'el diagrama y las pendientes simples');
    assert.match(q('#medParrafo').textContent, /La interacción X × W fue estadísticamente significativa/);
    assert.match(zona.textContent, /Región de Johnson-Neyman/);
    assert.doesNotMatch(zona.innerHTML, /undefined|NaN|\[object/);
    const { bus, EVENTOS } = await import(new URL('src/shared/eventos.js', raiz));
    bus.emit(EVENTOS.DATOS_CARGADOS);
    assert.equal(q('#medResultados').hidden, true); assert.equal(ui.resultadoMediacion(), null);
});

test('(2027.01.20) con muy pocos casos completos, el error quita el resultado anterior (y su Word)', async () => {
    q('#medModelo').value = '1'; env.disparar(q('#medModelo'), 'change');
    q('#medX').value = 'X'; q('#medY').value = 'Y1'; q('#medW').value = 'W';
    document.querySelectorAll('#medCovariables input').forEach(e => { e.checked = false; });
    assert.ok(await ui.calcular());
    assert.equal(q('#medResultados').hidden, false);
    // las mismas variables, con solo 10 casos completos (hacen falta 3 + 10)
    Analizador.cargarDatos(filasBase.map((f, i) => (i < 10 ? f : { ...f, X: '' })));
    try {
        assert.equal(await ui.calcular(), null);
        assert.match(q('#medMensajes') ? q('#medMensajes').textContent : document.body.textContent, /Hacen falta al menos 13 casos con todas las variables \(hay 10\)/);
        assert.equal(q('#medResultados').hidden, true, 'el resultado anterior, fuera de la vista');
        assert.equal(ui.resultadoMediacion(), null);
        assert.equal(await ui.exportarWord(), null, 'sin resultado, sin Word');
    } finally { Analizador.cargarDatos(filasBase); }
});
