// tests/ui/tri.test.js — (2027.01.19) la tarjeta «14. Teoría de respuesta al ítem (TRI) y DIF» sobre index.html real: ofrece
// las escalas detectadas y los grupos, elige el modelo (GRM con ítems Likert), da los parámetros del núcleo (verificados
// contra el oráculo en tests/unit/tri.test.js) y el DIF, dibuja la información del test (sin ancho ni alto en la pantalla),
// redacta sin huecos, muestra la sintaxis de mirt, descarga las puntuaciones y el Word, añade θ a la base sin perder el
// resultado, estima Rasch y 2PL con ítems dicotómicos y explica lo que no puede estimar.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';
import { problemasDeCitas } from './citas.js';

const raiz = new URL('../../', import.meta.url);
const O = JSON.parse(fs.readFileSync(new URL('../oracle/tri_fixture.json', import.meta.url), 'utf8'));
let env, ui, q, A;

/** Las filas de unas respuestas (categorías 0…K − 1, −1 perdido) como ítems de 1 a K. */
const filasDe = (/** @type {number[][]} */ X, /** @type {string} */ prefijo, extra = (/** @type {number} */ i) => ({})) => (/** @type {number[]} */ (X[0])).map((_, i) => ({ ID: i + 1, ...Object.fromEntries(X.map((x, j) => [`${prefijo}${j + 1}`, /** @type {number} */ (x[i]) < 0 ? '' : /** @type {number} */ (x[i]) + 1])), ...extra(i) }));

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
    ui = await import(new URL('src/analizador/tri/tri-ui.js', raiz));
    globalThis.htmlDocx = { asBlob: html => new Blob([html]) };
});

/** Carga unas filas como lo hace la página (con su aviso). */
async function cargar(filas) {
    const { reemplazarFilas } = await import(new URL('src/analizador/ui/carga.js', raiz));
    reemplazarFilas(filas);
}

test('la tarjeta 14 estima el GRM con los números del núcleo, el DIF, la sintaxis, el CSV, θ en la base y el Word', async () => {
    const D = O.dif;
    await cargar(filasDe(D.X, 'I', i => ({ Sexo: D.grupo[i] ? 'Mujer' : 'Hombre' })));
    assert.match(q('#triContainer .card-title').textContent, /^14\. Teoría de respuesta al ítem \(TRI\) y DIF/);
    const opciones = [...document.querySelectorAll('#triConjunto option')].map(o => o.value);
    assert.ok(opciones.length >= 2 && opciones.includes('propia'), opciones.join(' | '));
    q('#triConjunto').value = /** @type {string} */ (opciones[0]);
    assert.ok([...document.querySelectorAll('#triGrupo option')].some(o => o.value === 'Sexo'));
    q('#triGrupo').value = 'Sexo';
    q('#triModelo').value = 'auto';
    const R = await ui.calcular();
    assert.ok(R, q('#triMensajes').textContent);
    assert.equal(R.modelo, 'grm');
    const { ajustarTRI } = await import(new URL('src/core/stats/tri.js', raiz));
    const E = ajustarTRI(D.X.map((/** @type {number[]} */ x) => Int8Array.from(x)), { modelo: 'grm' });
    assert.deepEqual(R.items.map((/** @type {any} */ it) => [it.a, ...it.b]), E.items.map(it => [it.a, ...it.b]), 'los del núcleo');
    const res = q('#triResultados');
    assert.equal(res.hidden, false);
    assert.doesNotMatch(res.innerHTML, /undefined|NaN|\[object/);
    const svg = res.querySelector('svg');
    assert.ok(svg); assert.equal(svg.getAttribute('width'), null);
    const tablas = res.querySelectorAll('table');
    assert.equal(tablas.length, 3, 'parámetros, ajuste y DIF');
    assert.equal(tablas[2].querySelectorAll('tbody tr').length, 6);
    const p = q('#triParrafo').textContent;
    assert.match(p, /^Se estimó el modelo de respuesta graduada \(GRM; Samejima, 1969\) para los 6 ítems de .+ \(N = 700\) por máxima verosimilitud marginal con el algoritmo EM \(Bock y Aitkin, 1981\)\./);
    assert.match(p, /La fiabilidad marginal fue de \.\d{3}; las puntuaciones del rasgo de cada persona se estimaron por EAP, la media de su distribución a posteriori \(Embretson y Reise, 2000\)\./);
    assert.match(p, /El funcionamiento diferencial según Sexo se evaluó por regresión logística ordinal \(McCullagh, 1980\) con el puntaje total como criterio \(Swaminathan y Rogers, 1990; Zumbo, 1999\), con el ΔR² de Nagelkerke \(1991\) como tamaño y las p ajustadas por el método de Holm \(1979\): mostraron DIF los ítems I3 \(uniforme, más alto en Hombre a igual puntaje; ΔR² = \.034, insignificante\) e I5 \(no uniforme; ΔR² = \.020, insignificante\), aunque de tamaño insignificante según los criterios de Jodoin y Gierl \(2001\)\./);
    const sintaxis = res.querySelector('.sintaxis-equivalente');
    assert.ok(sintaxis);
    assert.match(sintaxis.textContent, /mirt::mirt\(it, 1, itemtype = "graded", SE = TRUE, SE\.type = "crossprod"\)/);
    assert.match(sintaxis.textContent, /MASS::polr\(f, data = d\)[\s\S]*list\(y ~ tc, y ~ tc \+ g, y ~ tc \* g\)[\s\S]*p\.adjust\(dif\[, "p"\], method = "holm"\)/);
    // el CSV de las puntuaciones, en el orden de la base
    const antes = env.descargas.length;
    env.disparar(q('#triCSV'), 'click');
    const csv = await env.descargas[antes].text();
    assert.match(csv, /^﻿?Fila;Theta_EAP;EE\r\n1;-?\d+,\d+;0,\d+\r\n/);
    assert.equal(csv.trim().split('\r\n').length, 701);
    // θ en la base: dos columnas nuevas, el resultado sigue a la vista; la segunda vez, se reemplazan
    const nombre = ui.agregarTheta();
    const filas = A.obtenerDatos();
    assert.ok(nombre && nombre.endsWith('_theta'), nombre);
    assert.equal(filas[0][nombre], Number(R.eap[0].toFixed(4)));
    assert.equal(filas[0][`${nombre}_EE`], Number(R.dePosterior[0].toFixed(4)));
    assert.equal(q('#triResultados').hidden, false, 'no se pierde el resultado');
    const columnas = Object.keys(filas[0]).length;
    ui.agregarTheta();
    assert.equal(Object.keys(A.obtenerDatos()[0]).length, columnas, 'reemplaza, no duplica');
    assert.equal(await ui.exportarWord(), 'TRI_APA.docx');
    assert.deepEqual(problemasDeCitas(await env.descargas.at(-1).text()), { sinReferencia: [], sinCita: [] }, 'las citas del Word, frente a sus referencias');
    assert.match(await env.descargas.at(-1).text(), /Tabla 1[\s\S]*Tabla 2[\s\S]*Tabla 3[\s\S]*Samejima, F\. \(1969\)[\s\S]*Swaminathan, H\./);
});

test('Rasch y 2PL con ítems dicotómicos; la DE del rasgo en la tabla de Rasch; los errores se explican', async () => {
    await cargar(filasDe(O.Xd, 'R'));
    actualizarYElegir();
    q('#triGrupo').value = '';
    q('#triModelo').value = 'rasch';
    const Rr = await ui.calcular();
    assert.ok(Rr, q('#triMensajes').textContent);
    assert.equal(Rr.modelo, 'rasch');
    assert.deepEqual([...q('#triResultados table').querySelectorAll('th')].map(t => t.textContent), ['Ítem', 'b', 'EE']);
    assert.match(q('#triResultados').textContent, /de media 0 y DE 1\.14/);
    assert.match(q('#triParrafo').textContent, /^Se estimó el modelo de Rasch \(Rasch, 1960\)/);
    q('#triModelo').value = 'auto';
    const R2 = await ui.calcular();
    assert.equal(R2.modelo, '2pl');
    assert.match(q('#triParrafo').textContent, /el modelo logístico de dos parámetros \(2PL; Birnbaum, 1968\)/);
    // lo que no se puede estimar
    await cargar(filasDe(O.X.map((/** @type {number[]} */ x) => x.slice(0, 80)), 'P'));
    actualizarYElegir();
    assert.equal(await ui.calcular(), null);
    assert.match(q('#triMensajes').textContent, /Hacen falta al menos 100 personas con respuestas \(hay 80\)/);
    await cargar(filasDe(O.X, 'P'));
    actualizarYElegir();
    q('#triModelo').value = '2pl';
    assert.equal(await ui.calcular(), null);
    assert.match(q('#triMensajes').textContent, /es para ítems dicotómicos: con ítems de más de dos opciones, usa el GRM/);
    q('#triModelo').value = 'auto';
    q('#triConjunto').value = 'propia'; q('#triItems').value = 'P1, P2, NoExiste';
    assert.equal(await ui.calcular(), null);
    assert.match(q('#triMensajes').textContent, /No están en la base: NoExiste/);
    const conDecimales = filasDe(O.X, 'P').map((f, i) => ({ ...f, P2: i === 5 ? 2.5 : f.P2 }));
    await cargar(conDecimales);
    actualizarYElegir();
    assert.equal(await ui.calcular(), null);
    assert.match(q('#triMensajes').textContent, /La TRI necesita respuestas enteras/);
});

/** Actualiza los desplegables y elige la primera escala. */
function actualizarYElegir() {
    env.disparar(q('#triActualizar'), 'click');
    q('#triConjunto').value = /** @type {HTMLOptionElement} */ (q('#triConjunto option')).value;
}

test('(2027.01.20) el DIF con un grupo codificado en números (1, 2, 3 y uno de 6 personas): se ofrece, el pequeño queda fuera con su aviso; un error quita el resultado anterior', async () => {
    const E = O.dif2;
    // las respuestas tal cual (de 1 a 5, con perdidos) y el grupo en números: 1, 2, 3 y 9 (el de 6 personas); sin grupo, vacío
    const filas = E.crudo[0].map((/** @type {number | null} */ _, /** @type {number} */ i) => ({ ID: i + 1, ...Object.fromEntries(E.crudo.map((/** @type {(number | null)[]} */ x, /** @type {number} */ j) => [`D${j + 1}`, x[i] === null ? '' : x[i]])), Grado: E.grupo[i] < 0 ? '' : [1, 2, 3, 9][E.grupo[i]] }));
    await cargar(filas);
    actualizarYElegir();
    const grupos = [...document.querySelectorAll('#triGrupo option')].map(o => o.value);
    assert.ok(grupos.includes('Grado'), `el grupo numérico se ofrece: ${grupos.join(', ')}`);
    assert.ok(!grupos.some(g => /^D\d$/.test(g)), 'los ítems de la escala, no');
    q('#triGrupo').value = 'Grado'; q('#triModelo').value = 'auto';
    const R = await ui.calcular();
    assert.ok(R, q('#triMensajes').textContent);
    const { D, ctx } = ui.resultadoTRI();
    assert.deepEqual(D.tamanos, E.tamanos); assert.deepEqual(ctx.niveles, ['1', '2', '3']);
    D.items.forEach((/** @type {any} */ it, /** @type {number} */ j) => assert.ok(Math.abs(it.chi2Total - E.items[j].chi2Total) < 1e-6, `ítem ${j + 1}: χ² con las respuestas tal cual`));
    assert.match(q('#triMensajes').textContent, /Un grupo tiene menos de 10 personas y queda fuera del DIF: 9 \(6\)\./);
    assert.match(q('#triResultados').textContent, /Un grupo con menos de 10 personas, fuera del análisis\./);
    assert.match(q('#triResultados').textContent, /N = 543: 1, n = 186; 2, n = 179; 3, n = 178/);
    // un error después: el resultado anterior desaparece (y su Word)
    q('#triConjunto').value = 'propia'; q('#triItems').value = 'D1, D2';
    assert.equal(await ui.calcular(), null);
    assert.match(q('#triMensajes').textContent, /Elige al menos 3 ítems/);
    assert.equal(q('#triResultados').hidden, true);
    assert.equal(ui.resultadoTRI(), null);
    assert.equal(await ui.exportarWord(), null);
});
