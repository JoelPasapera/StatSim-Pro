// tests/ui/potencia.test.js — (2027.01.18) la tarjeta «13. Potencia y tamaño de muestra» sobre index.html real: sin base
// cargada, da los tamaños de G*Power (d = .5 → 64 por grupo; f = .25 con 3 grupos → 53 por grupo), la potencia con un n dado
// y el efecto detectable; muestra solo los campos de cada prueba, dibuja la curva (sin ancho ni alto en la pantalla), redacta
// sin huecos y descarga el Word; la mediación, por Monte Carlo (en el hilo principal: minidom no tiene Workers), igual que el
// núcleo; y explica los errores.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';
import { problemasDeCitas } from './citas.js';

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
    ui = await import(new URL('src/analizador/potencia/potencia-ui.js', raiz));
});

/** Elige una opción y avisa del cambio. */
const elegir = (sel, v) => { q(sel).value = v; env.disparar(q(sel), 'change'); };

test('el tamaño de muestra de G*Power, con su curva, su redacción y su Word', async () => {
    assert.match(q('#potenciaContainer .card-title').textContent, /^13\. Potencia y tamaño de muestra/);
    elegir('#potModo', 'muestra'); elegir('#potPrueba', 't2');
    assert.equal(q('#potEfecto').value, '0.5', 'al elegir la prueba, el efecto mediano');
    assert.equal(q('[data-pruebas="t2"]').hidden, false); assert.equal(q('[data-pruebas="anova"]').hidden, true);
    assert.equal(q('#potCampoN').hidden, true);
    const R = await ui.calcular();
    assert.ok(R, q('#potMensajes').textContent);
    assert.equal(R.n, 64); assert.equal(R.total, 128);
    assert.match(q('#potResumen').textContent, /^Hacen falta 64 por grupo \(N = 128\) para detectar d = 0\.50 \(mediano\) con una potencia de \.80 \(α = \.05, bilateral\)\. Con esa muestra, la potencia es de \.801\.$/);
    assert.match(q('#potParrafo').textContent, /^El tamaño de la muestra se determinó a priori para una prueba t de Student para dos grupos independientes \(bilateral\), con un tamaño del efecto mediano \(d = 0\.50; Cohen, 1988\)/);
    assert.match(q('#potParrafo').textContent, /se requieren 64 participantes por grupo \(N = 128; potencia real = \.801\)\.$/);
    const svg = q('#potResultados svg');
    assert.ok(svg, 'la curva');
    assert.equal(svg.getAttribute('width'), null, 'en la pantalla, sin ancho escrito (la página invierte los SVG con él)');
    assert.match(q('#potResultados').textContent, /Tamaño de muestra para los efectos convencionales/);
    assert.doesNotMatch(q('#potResultados').innerHTML, /undefined|NaN|\[object/);
    globalThis.htmlDocx = { asBlob: html => new Blob([html]) };
    const antes = env.descargas.length;
    assert.equal(await ui.exportarWord(), 'potencia_APA.docx');
    assert.deepEqual(problemasDeCitas(await env.descargas.at(-1).text()), { sinReferencia: [], sinCita: [] }, 'las citas del Word, frente a sus referencias');
    assert.match(await env.descargas[antes].text(), /Tabla 1[\s\S]*Faul, F\., Erdfelder/);
    // el ANOVA: por grupo, como G*Power
    elegir('#potPrueba', 'anova');
    assert.equal(q('[data-pruebas="anova"]').hidden, false);
    q('#potK').value = '3';
    const A = await ui.calcular();
    assert.equal(A.n, 53); assert.equal(A.total, 159);
    assert.match(q('#potResumen').textContent, /^Hacen falta 53 por grupo \(N = 159\) para detectar f = 0\.25 \(mediano\)/);
});

test('la potencia con un n dado y el efecto mínimo detectable', async () => {
    elegir('#potPrueba', 'r'); elegir('#potModo', 'potencia');
    assert.equal(q('#potCampoN').hidden, false); assert.equal(q('#potCampoPotencia').hidden, true);
    q('#potEfecto').value = '0.3'; q('#potN').value = '84';
    const R = await ui.calcular();
    assert.ok(Math.abs(R.potencia - 0.8003390) < 1e-6, String(R.potencia));
    assert.match(q('#potResumen').textContent, /^Con N = 84, ρ = \.30 y α = \.05, bilateral, la potencia es de \.800/);
    elegir('#potModo', 'sensibilidad');
    assert.equal(q('#potCampoEfecto').hidden, true);
    q('#potN').value = '84';
    const S = await ui.calcular();
    assert.ok(Math.abs(S.efecto - 0.2999) < 0.001, String(S.efecto));
    assert.match(q('#potParrafo').textContent, /^Un análisis de sensibilidad \(Lakens, 2022\)/);
});

test('la mediación por Monte Carlo, igual que el núcleo; los errores se explican', async () => {
    elegir('#potPrueba', 'mediacion'); elegir('#potModo', 'potencia');
    q('#potEfecto').value = '0.39'; q('#potB').value = '0.39'; q('#potCp').value = '0'; q('#potN').value = '60';
    q('#potR').innerHTML += '<option value="200">200</option>'; q('#potR').value = '200';
    const R = await ui.calcular();
    assert.ok(R, q('#potMensajes').textContent);
    const { potenciaMediacion } = await import(new URL('src/core/stats/potencia-mediacion.js', raiz));
    assert.equal(R.potencia, potenciaMediacion(0.39, 0.39, 0, 60, { R: 200 }).potencia);
    assert.match(q('#potParrafo').textContent, /^La potencia de la mediación simple con la muestra disponible \(N = 60\) se estimó por simulación de Monte Carlo \(200 réplicas, semilla 2027\) con la prueba de significación conjunta \(Fritz y MacKinnon, 2007\)/);
    assert.equal(q('#potResultados svg'), null, 'sin curva en la mediación');
    // (2027.01.20) las rutas, en la métrica de Fritz y MacKinnon: con cero inicial, y la potencia, la de su modelo
    assert.match(q('#potParrafo').textContent, /para rutas a = 0\.39, b = 0\.39 y c′ = 0\.00 \(rutas medianas, según Cohen, 1988; con X y los errores de varianza 1, como en Fritz y MacKinnon\)/);
    // errores
    q('#potB').value = '6'; q('#potEfecto').value = '0.9'; q('#potCp').value = '0.5';
    assert.equal(await ui.calcular(), null);
    assert.match(q('#potMensajes').textContent, /mayores que 5 .* no son realistas/);
    q('#potB').value = '0';
    assert.equal(await ui.calcular(), null);
    assert.match(q('#potMensajes').textContent, /Con b = 0 no hay mediación que detectar/);
    q('#potB').value = '0.39';
    elegir('#potModo', 'sensibilidad');
    assert.equal(await ui.calcular(), null);
    assert.match(q('#potMensajes').textContent, /el efecto mínimo detectable no se calcula/);
    elegir('#potPrueba', 't2'); elegir('#potModo', 'muestra'); q('#potEfecto').value = '-1';
    assert.equal(await ui.calcular(), null);
    assert.match(q('#potMensajes').textContent, /un número positivo/);
});
