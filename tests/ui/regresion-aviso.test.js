// @ts-check
// tests/ui/regresion-aviso.test.js — (2026.12.23) por qué no hay resultado, en la página. El motivo (una
// separación en la logística múltiple, una dependiente sin variación, una matriz sin casos suficientes) quedaba solo en
// un aviso emergente que tapaba enseguida «Análisis completado exitosamente», y la sección desaparecía sin explicación.
// De extremo a extremo, sobre index.html con el minidom de las pruebas.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';

const raiz = new URL('../../', import.meta.url);
/** @type {any} */ let env, analisis;
/** @param {string} sel @returns {any} */
const q = sel => globalThis.document.querySelector(sel);
/** @param {() => boolean} cond */
const esperar = async (cond, ms = 20000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error('tiempo de espera agotado'); await new Promise(r => setTimeout(r, 25)); } };

before(async () => {
    env = crearEntorno(fs.readFileSync(new URL('index.html', raiz), 'utf8'));
    env.document.readyState = 'interactive';
    globalThis.fetch = () => Promise.reject(new Error('sin red'));
    await import(new URL('src/main.js', raiz));
    await new Promise(r => setTimeout(r, 0));
    env.document.readyState = 'complete';
    env.disparar(env.document, 'DOMContentLoaded', { bubbles: false });
    analisis = await import(new URL('src/analizador/ui/analisis.js', raiz));
    const { AnalizadorEstadistico: A } = await import(new URL('src/analizador/estadistica.js', raiz));
    const carga = await import(new URL('src/analizador/ui/carga.js', raiz));
    let s = 4242; const u = () => (s = (s * 48271) % 2147483647) / 2147483647;
    const nor = () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
    const filas = Array.from({ length: 60 }, (_, i) => {
        const x1 = nor(), x2 = nor();
        return { General_A: +(50 + 10 * x1).toFixed(2), General_B: +(40 + 8 * (0.3 * x1 + 0.95 * nor())).toFixed(2), X1: +x1.toFixed(3), X2: +x2.toFixed(3),
            'Y<sep>': x1 > 0 ? 1 : 0, Yconst: 5, Rara: i < 3 ? i + 1 : '' };
    });
    A.cargarDatos(filas); carga.mostrarDatosCargados(filas); carga.poblarSelectsVariables(filas);
});

/** Ejecuta el análisis de la vista principal (correlación de General_A y General_B) y espera a que termine. */
const ejecutar = async () => {
    q('input[name="tipoAnalisis"][value="comparacion"]').checked = false;
    q('input[name="tipoAnalisis"][value="correlacion"]').checked = true;
    q('#variable1').value = 'General_A'; q('#variable2').value = 'General_B';
    analisis.ejecutarAnalisis();
    await esperar(() => !q('#btnAnalizar').disabled);
};

test('la logística múltiple con separación: el motivo queda en la página, bajo la correlación (con el nombre escapado)', async () => {
    q('#regDep').value = 'Y<sep>'; q('#regInd').value = 'X1';
    analisis.agregarPredictorExtra();
    const extra = q('#regPredsCont select'); extra.value = 'X2';
    await ejecutar();
    const pagina = q('#resultadosContainer').innerHTML + q('#resultadosCorrelacion').innerHTML;
    assert.match(q('#resultadosCorrelacion').textContent, /Pearson|Spearman/, 'la correlación se muestra');
    assert.match(pagina, /📐 Regresión: Y&lt;sep&gt; según X1, X2<\/h4>/, 'el encabezado de la regresión, con el nombre escapado');
    assert.match(pagina, /⚠️ Separación perfecta o casi perfecta: algún predictor \(o una combinación\) separa/, 'y su motivo');
    extra.value = '';
});

test('la bivariada con una dependiente sin variación: el motivo, en lugar de omitir la sección', async () => {
    q('#regDep').value = 'Yconst'; q('#regInd').value = 'X1';
    await ejecutar();
    const pagina = q('#resultadosCorrelacion').innerHTML + q('#resultadosContainer').innerHTML;
    assert.match(pagina, /📐 Regresión: Yconst según X1<\/h4>/);
    assert.match(pagina, /⚠️ La variable dependiente no varía \(todos sus valores son iguales\): no hay nada que explicar\./);
    q('#regDep').value = ''; q('#regInd').value = '';
});

test('la matriz de correlaciones sin casos suficientes: el motivo en el contenedor de resultados', async () => {
    analisis.agregarVariableExtra();
    const extra = q('#varsExtraCont select'); extra.value = 'Rara';
    await ejecutar();
    const cont = q('#resultadosContainer');
    assert.equal(cont.style.display, 'block');
    assert.match(cont.innerHTML, /🔗 Matriz de correlaciones<\/h4>/);
    assert.match(cont.innerHTML, /⚠️ Muy pocos casos completos en las variables elegidas\./);
    extra.value = '';
});
