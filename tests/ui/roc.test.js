// tests/ui/roc.test.js — (2027.01.18) la tarjeta «12. Validez de criterio: curva ROC» sobre index.html real: ofrece los
// puntajes y los criterios de dos valores, propone el valor del caso, da el AUC y el corte del núcleo (verificados contra el
// oráculo en tests/unit/roc.test.js), dibuja la curva (sin ancho ni alto en la pantalla), redacta sin huecos, descarga el CSV y
// el Word, avisa del sentido invertido y explica lo que no puede calcular.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';
import { problemasDeCitas } from './citas.js';

const raiz = new URL('../../', import.meta.url);
const O = JSON.parse(fs.readFileSync(new URL('../oracle/roc_fixture.json', import.meta.url), 'utf8'));
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
    const B = O.enteros, I = O.inverso;
    const filas = [...B.casos.map(v => ({ General_Test: v, Diagnostico: 'Con depresión' })), ...B.noCasos.map(v => ({ General_Test: v, Diagnostico: 'Sin depresión' }))]
        .map((f, i) => ({ ID: i + 1, ...f, Bienestar: i < I.casos.length + I.noCasos.length ? (i < I.casos.length ? I.casos[i] : I.noCasos[i - I.casos.length]) : '', Sexo: i % 3 ? 'H' : 'M' }));
    filas[2].General_Test = '';   // un perdido
    A.cargarDatos(filas);
    ui = await import(new URL('src/analizador/roc/roc-ui.js', raiz));
});

test('la tarjeta 12 calcula la curva ROC con los números del núcleo', async () => {
    assert.match(q('#rocContainer .card-title').textContent, /^12\. Validez de criterio: curva ROC/);
    env.disparar(q('#rocActualizar'), 'click');
    assert.equal(q('#rocPuntuacion').value, 'General_Test', 'los puntajes, primero');
    assert.deepEqual([...document.querySelectorAll('#rocCriterio option')].map(o => o.value), ['Diagnostico', 'Sexo'], 'solo las de dos valores');
    q('#rocCriterio').value = 'Diagnostico'; env.disparar(q('#rocCriterio'), 'change');
    assert.equal(q('#rocPositivo').value, 'Con depresión', 'el caso, propuesto');
    const R = ui.calcular();
    assert.ok(R, q('#rocMensajes').textContent);
    const { curvaROC } = await import(new URL('src/core/stats/roc.js', raiz));
    const B = O.enteros, x = [...B.casos, ...B.noCasos].filter((_, i) => i !== 2), c = [...B.casos.map(() => true), ...B.noCasos.map(() => false)].filter((_, i) => i !== 2);
    const E = curvaROC(x, c);
    assert.equal(R.auc, E.auc); assert.equal(R.optimo.corte, E.optimo.corte);
    assert.match(q('#rocMensajes').textContent, /1 caso\(s\) sin puntuación o sin criterio se excluyeron/);
    const p = q('#rocParrafo').textContent;
    assert.match(p, /^Se evaluó la validez de criterio de General_Test para identificar Diagnostico = Con depresión \(n = 59\) frente a Sin depresión \(n = 140\) con una curva ROC \(un caso sin puntuación o sin criterio quedó fuera\)\. El área bajo la curva fue de \.\d{3}, IC 95 % \[\.\d{3}, \.\d{3}\] \(DeLong et al\., 1988\), mayor que la del azar/);
    assert.match(p, /El punto de corte óptimo según el índice de Youden \(1950\) fue ≥ \d+/);
    const svg = q('#rocResultados svg');
    assert.ok(svg); assert.equal(svg.getAttribute('width'), null);
    assert.doesNotMatch(q('#rocResultados').innerHTML, /undefined|NaN|\[object/);
    const antes = env.descargas.length;
    env.disparar(q('#rocCSV'), 'click');
    const csv = await env.descargas[antes].text();
    assert.match(csv, /^﻿?Corte;Regla;VP;FN;FP;VN;Sensibilidad;Especificidad;Youden;VPP;VPN;RV\+;RV-\r\n/);
    assert.equal(csv.trim().split('\r\n').length, R.cortes.length + 1);
    globalThis.htmlDocx = { asBlob: html => new Blob([html]) };
    assert.equal(await ui.exportarWord(), 'curva_ROC_APA.docx');
    assert.deepEqual(problemasDeCitas(await env.descargas.at(-1).text()), { sinReferencia: [], sinCita: [] }, 'las citas del Word, frente a sus referencias');
    assert.match(await env.descargas[antes + 1].text(), /Tabla 1[\s\S]*Tabla 2[\s\S]*Tabla 3[\s\S]*Youden, W\. J\./);
});

test('el sentido invertido se avisa; los errores se explican', () => {
    q('#rocPuntuacion').value = 'Bienestar';
    q('#rocCriterio').value = 'Diagnostico'; env.disparar(q('#rocCriterio'), 'change');
    // con el diagnóstico de la primera base, Bienestar tiene sus propios casos: lo que importa es el aviso del sentido
    q('#rocSentido').value = 'menor';
    const R = ui.calcular();
    assert.ok(R);
    assert.equal(R.sentido, 'menor');
    assert.match(q('#rocParrafo').textContent, /≤|sin diferir/);
    q('#rocPuntuacion').value = 'General_Test'; q('#rocSentido').value = 'auto';
    q('#rocPositivo').value = 'Sin depresión';
    const Inv = ui.calcular();
    assert.equal(Inv.invertido, true);
    assert.match(q('#rocMensajes').textContent, /Las puntuaciones bajas indican el caso/);
    q('#rocCriterio').innerHTML = '';
    assert.equal(ui.calcular(), null);
    assert.match(q('#rocMensajes').textContent, /Elige el criterio/);
});

test('el valor del caso propuesto no depende del orden de las filas («Sin …» no se toma por «Sí»)', () => {
    A.cargarDatos(A.obtenerDatos().slice().reverse());   // ahora la primera fila es «Sin depresión»
    ui.actualizarVariables();
    q('#rocPositivo').innerHTML = '';
    q('#rocCriterio').value = 'Diagnostico'; env.disparar(q('#rocCriterio'), 'change');
    assert.equal(q('#rocPositivo').value, 'Con depresión');
    A.cargarDatos(Array.from({ length: 20 }, (_, i) => ({ Puntaje: i, Grupo: i % 2 ? 'Control' : 'Clínico' })));
    ui.actualizarVariables();
    q('#rocPositivo').innerHTML = '';
    q('#rocCriterio').value = 'Grupo'; env.disparar(q('#rocCriterio'), 'change');
    assert.equal(q('#rocPositivo').value, 'Clínico', 'el contrario de «Control»');
});
