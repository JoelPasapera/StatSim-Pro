// tests/ui/depuracion.test.js — (2027.01.18) la tarjeta «Depuración de la base» sobre index.html real: ofrece las escalas
// detectadas, todas las numéricas y una lista propia; el identificador se elige solo si hay una columna ID; marca los casos
// del oráculo (tests/oracle/depuracion_fixture.json), escribe la redacción sin huecos, descarga los CSV y el Word, pone la
// base depurada en el Analizador y vuelve a la original; los errores se explican.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';
import { problemasDeCitas } from './citas.js';

const raiz = new URL('../../', import.meta.url);
const O = JSON.parse(fs.readFileSync(new URL('../oracle/depuracion_fixture.json', import.meta.url), 'utf8'));
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
    A.cargarDatos(O.filas.map(f => ({ ...f })));
    ui = await import(new URL('src/analizador/depuracion/depuracion-ui.js', raiz));
});

test('la tarjeta ofrece la escala detectada, todas las numéricas y una lista propia, y marca los casos del oráculo', async () => {
    assert.match(q('#depuracionContainer .card-title').textContent, /^Antes de analizar: depuración de la base/);
    env.disparar(q('#depActualizar'), 'click');
    const opciones = [...document.querySelectorAll('#depConjunto option')].map(o => o.value);
    assert.ok(opciones.includes('todas') && opciones.includes('propia'), opciones.join(' | '));
    assert.equal(q('#depId').value, 'ID', 'la columna ID se elige sola');
    q('#depConjunto').value = 'todas';
    env.disparar(q('#depConjunto'), 'change');
    assert.match(q('#depRangoAyuda').textContent, /Valores observados: de 0 a 7\./);
    q('#depMinimo').value = '1'; q('#depMaximo').value = '5';
    const R = ui.calcular();
    assert.ok(R, q('#depMensajes').textContent);
    assert.deepEqual(R.casos.map(c => c.fila), O.casos);
    const zona = q('#depResultados');
    assert.equal(zona.hidden, false);
    assert.match(q('#depParrafo').textContent, /^Antes de los análisis se depuró la base \(N = 150\) revisando 10 variables: todas las variables numéricas, sin los puntajes\./);
    assert.doesNotMatch(zona.innerHTML, /undefined|NaN|\[object/);
    // las descargas
    const antes = env.descargas.length;
    env.disparar(q('#depCSVCasos'), 'click');
    env.disparar(q('#depCSVBase'), 'click');
    assert.equal(env.descargas.length, antes + 2);
    globalThis.htmlDocx = { asBlob: html => new Blob([html]) };
    assert.equal(await ui.exportarWord(), 'depuracion_APA.docx');
    assert.deepEqual(problemasDeCitas(await env.descargas.at(-1).text()), { sinReferencia: [], sinCita: [] }, 'las citas del Word, frente a sus referencias');
    assert.match(await env.descargas[antes + 2].text(), /Tabla 1[\s\S]*Criterios de depuración[\s\S]*Tabla 2[\s\S]*Casos marcados/);
});

test('la base depurada pasa al Analizador y se puede volver a la original', () => {
    let R = ui.calcular();
    // (2027.01.20) con solo 10 ítems de 5 opciones, dos personas pueden coincidir por azar: los duplicados se muestran, pero
    // no se excluyen por defecto (y se avisa); marcar la casilla vuelve a revisar y los excluye
    assert.ok(R.duplicados.porAzar);
    assert.match(q('#depMensajes').textContent, /dos personas distintas pueden responder igual: por azar se esperaban unas 0\.02 coincidencias[\s\S]*Por eso no se excluyen/);
    const casilla = q('#depExcluir input[value="duplicado"]');
    assert.equal(casilla.checked, false);
    assert.equal(ui.resultadoDepuracion().ctx.excluir.includes('duplicado'), false);
    casilla.checked = true; env.disparar(casilla, 'change');
    R = ui.resultadoDepuracion().R;
    assert.equal(ui.resultadoDepuracion().ctx.excluir.includes('duplicado'), true, 'cambiar un criterio vuelve a revisar');
    assert.match(q('#depMensajes').textContent, /Se excluyen porque marcaste «Caso duplicado»/);
    const excluidos = new Set([...O.marcas.duplicado, ...O.marcas.perdidos]);
    assert.equal(ui.aplicarDepuracion(), true);
    const ahora = A.obtenerDatos();
    assert.equal(ahora.length, 150 - excluidos.size);
    assert.ok(!ahora.some(f => f.P3 === 7 || f.P5 === 0 || f.P2 === 3.5), 'los fuera de rango, como perdidos');
    assert.equal(q('#analisisN').textContent, String(150 - excluidos.size), 'la vista de los datos se actualiza');
    assert.match(q('#depEstado').textContent, new RegExp(`Base depurada en uso: N = ${150 - excluidos.size} de 150`));
    assert.ok(ui.hayBaseOriginal());
    assert.equal(R.n, 150);
    // volver
    env.disparar(q('#depRestaurar'), 'click');
    assert.equal(A.obtenerDatos().length, 150);
    assert.equal(q('#depEstado').textContent, '');
    assert.equal(ui.hayBaseOriginal(), false);
});

test('los errores se explican', () => {
    q('#depConjunto').value = 'todas';
    q('#depMinimo').value = '1'; q('#depMaximo').value = '';
    assert.equal(ui.calcular(), null);
    assert.match(q('#depMensajes').textContent, /el mínimo y el máximo/);
    q('#depMinimo').value = '5'; q('#depMaximo').value = '1';
    assert.equal(ui.calcular(), null);
    assert.match(q('#depMensajes').textContent, /menor que el máximo/);
    q('#depMinimo').value = ''; q('#depMaximo').value = '';
    q('#depConjunto').value = 'propia'; q('#depItems').value = 'P1, P2, NoExiste';
    assert.equal(ui.calcular(), null);
    assert.match(q('#depMensajes').textContent, /No están en la base: NoExiste/);
    q('#depItems').value = 'P1, P2, P3';
    const R = ui.calcular();
    assert.ok(R, 'sin rango y con 3 variables, se revisa');
    assert.match(q('#depResultados').textContent, /No revisado: sin escala de respuesta indicada/);
    assert.match(q('#depResultados').textContent, /No revisado: hacen falta 6 o más ítems/);
});
