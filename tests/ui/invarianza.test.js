// tests/ui/invarianza.test.js — tarjeta 6 (invarianza) sobre index.html real: variables de agrupación, cálculo con los
// mismos valores que el oráculo, opción estricta, párrafo APA y el botón que trae el modelo de la sección SEM.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';

const raiz = new URL('../../', import.meta.url);
const fx = JSON.parse(fs.readFileSync(new URL('../oracle/invarianza_fixture.json', import.meta.url), 'utf8'));
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
    AnalizadorEstadistico.cargarDatos(fx.conjuntos.invariante.datos);
    ui = await import(new URL('src/analizador/psicometria/invarianza-ui.js', raiz));
});

test('la tarjeta 6 lista las variables de agrupación válidas y evalúa los niveles como el oráculo', async () => {
    assert.match(q('#invarianzaContainer .card-title').textContent, /Invarianza de medición/);
    env.disparar(q('#invActualizar'), 'click');
    assert.deepEqual([...document.querySelectorAll('#invGrupo option')].map(o => o.value), ['g'], 'solo «g» tiene de 2 a 8 grupos');
    q('#invSintaxis').value = 'F1 =~ i1 + i2 + i3\nF2 =~ i4 + i5 + i6';
    q('#invEstricta').checked = true;
    const r = await ui.calcular();
    assert.equal(r.niveles.length, 4);
    assert.ok(q('#invProgresoFila').hidden && !q('#invCalcular').disabled, 'la barra de progreso se oculta y el botón se reactiva al terminar');
    r.niveles.forEach(R => assert.ok(Math.abs(R.chi2 - fx.conjuntos.invariante.niveles[R.nivel].chi2) < 1e-4 * Math.max(1, R.chi2), R.nivel));
    assert.equal(document.querySelectorAll('#invResultados table').length, 3, 'ajuste, comparaciones y medias latentes');
    assert.match(q('#invParrafo').textContent, /se sostuvo la invarianza métrica, con cargas iguales \(.*\); la escalar, con cargas e interceptos iguales \(.*\); y la estricta, con cargas, interceptos y varianzas residuales iguales \(/);
    assert.match(q('#invParrafo').textContent, /las medias latentes pueden compararse/);
});

test('«Usar el modelo escrito en la sección SEM» trae factores y covarianzas, sin las regresiones', () => {
    let ta = document.getElementById('semSintaxis');
    if (!ta) { ta = document.createElement('textarea'); ta.id = 'semSintaxis'; document.body.appendChild(ta); }
    ta.value = 'F1 =~ i1 + i2 + i3\nF2 =~ i4 + i5 + i6\nF2 ~ F1\ni1 ~~ i4';
    env.disparar(q('#invDelSEM'), 'click');
    assert.equal(q('#invSintaxis').value, 'F1 =~ i1 + i2 + i3\nF2 =~ i4 + i5 + i6\ni1 ~~ i4');
});

test('errores claros: sintaxis con regresión escrita a mano', async () => {
    q('#invSintaxis').value = 'F1 =~ i1 + i2 + i3\nF2 =~ i4 + i5 + i6\nF2 ~ F1';
    assert.equal(await ui.calcular(), null);
    assert.match(q('#invMensajes').textContent, /modelo de medida/);
});

test('WLSMV en la tarjeta 6: niveles de Wu y Estabrook, DIFFTEST, estricta desactivada y referencias propias', async () => {
    const { AnalizadorEstadistico } = await import(new URL('src/analizador/estadistica.js', raiz));
    const { crearAleatorio } = await import(new URL('src/analizador/psicometria/aleatorio.js', raiz));
    const rng = crearAleatorio(4), nrm = () => { let u = 0; while (u === 0) u = rng.siguiente(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng.siguiente()); };
    AnalizadorEstadistico.cargarDatos([['F', 0], ['M', 0.3]].flatMap(([g, mu]) => Array.from({ length: 300 }, () => { const f = mu + nrm(), o = { Sexo: g }; [0.8, 0.7, 0.6, 0.7].forEach((l, j) => { o['P' + (j + 1)] = 1 + [-1, 0, 1].filter(c => l * f + Math.sqrt(1 - l * l) * nrm() > c).length; }); return o; })));
    q('#invSintaxis').value = 'F =~ P1 + P2 + P3 + P4';
    env.disparar(q('#invActualizar'), 'click'); q('#invGrupo').value = 'Sexo';
    const est = q('#invEstimador'); est.value = 'WLSMV'; env.disparar(est, 'change');
    assert.ok(q('#invEstricta').disabled && !q('#invEstricta').checked, 'la estricta no aplica con WLSMV');
    const r = await ui.calcular();
    assert.equal(r.estimador, 'WLSMV');
    assert.deepEqual(r.niveles.map(R => R.nivel), ['configural', 'umbrales', 'metrica', 'escalar']);
    assert.match(q('#invParrafo').textContent, /secuencia de identificación de Wu y Estabrook \(2016\)/);
    assert.match(q('#invParrafo').textContent, /DIFFTEST Δχ²\(\d+\) = /);
    assert.match(q('#invResultados details').textContent, /Wu, H\. y Estabrook, R\. \(2016\)/);
});
