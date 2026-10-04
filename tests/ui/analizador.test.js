// tests/ui/analizador.test.js — el Analizador sobre index.html real: recibe la base del Simulador y analiza.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';

const raiz = new URL('../../', import.meta.url);
let env, carga, analisis, resultado, motor, pruebas, socios;
const q = sel => globalThis.document.querySelector(sel);
const esperar = async (cond, ms = 10000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error('tiempo de espera agotado'); await new Promise(r => setTimeout(r, 25)); } };

before(async () => {
    env = crearEntorno(fs.readFileSync(new URL('index.html', raiz), 'utf8'));
    env.document.readyState = 'interactive';   // los módulos diferidos se ejecutan con el documento ya parseado, como en el navegador
    await import(new URL('src/main.js', raiz));
    await new Promise(r => setTimeout(r, 0));   // microtareas de montaje
    env.document.readyState = 'complete';
    env.disparar(env.document, 'DOMContentLoaded', { bubbles: false });
    [carga, analisis, resultado, motor, pruebas, socios] = await Promise.all(['analizador/ui/carga', 'analizador/ui/analisis', 'simulador/ui/resultado', 'simulador/ui/motor', 'simulador/ui/pruebas', 'simulador/ui/sociodemograficos'].map(m => import(new URL(`src/${m}.js`, raiz))));
    pruebas.agregarFilaTestConDatos({ prueba: 'PSS', variable: 'Estrés', dimensiones: ['Estrés percibido'], rIntra: '0.4' });
    pruebas.agregarFilaTestConDatos({ prueba: 'EQ-i', variable: 'IE', dimensiones: ['Regulación'], rIntra: '0.4' });
    pruebas.sincronizarDimensionesDesdeTests();
    for (const f of document.querySelectorAll('#bodyPruebas .fila-prueba')) { const nombre = f.querySelector('[aria-label="Nombre de la escala"]').value; const d = nombre === 'Regulación' ? ['8', '24', '5', '1', '5', '0.8', '0'] : ['10', '25', '6', '0', '4', '0.85', '3']; [['Número de ítems', 0], ['Media (M)', 1], ['Desviación estándar (DE)', 2], ['Mínimo por ítem', 3], ['Máximo por ítem', 4], ['Alfa de Cronbach objetivo', 5], ['Ítems invertidos', 6]].forEach(([et, k]) => { const el = f.querySelector(`[aria-label="${et}"]`); el.value = d[k]; env.disparar(el, 'input'); }); }
    socios.agregarFilaSocioConDatos({ categoria: 'Sexo', distribucion: 'binaria', promedio: '0.5', de: '', min: '', max: '', decimales: '0', opciones: 'Femenino, Masculino' });
    q('#tamanoMuestra').value = '150';
    motor.generarBaseDatos();
    await esperar(() => resultado.ultimoInforme && resultado.ultimoInforme.length > 0);
});

test('el Analizador es modular: su API cuelga de StatSim.api y no de window', () => {
    const api = globalThis.StatSim.api.analizador;
    for (const g of ['AnalizadorEstadistico', 'ComparacionGrupos', 'RegresionMultiple', 'Fiabilidad', 'ScientificCharts', 'ExportadorWord', 'EtiquetasVariables']) assert.ok(api[g] && (typeof api[g] === 'object' || typeof api[g] === 'function'), g);
    assert.equal(typeof globalThis.AnalizadorEstadistico, 'undefined', 'sin global de clase');
});

test('la base generada pasa al Analizador y se puede analizar una correlación', async () => {
    carga.cargarDatosGenerados();
    const datos = globalThis.datosGenerados || globalThis.generadorDatos.obtenerDatosGenerados();
    const cols = carga.obtenerColumnasNumericas(datos);
    const dims = cols.filter(c => c.startsWith('General_'));
    assert.equal(dims.length, 2, '(2026.10.03) PSS y EQ-i tienen una sola escala: dos variables generales entre las numéricas: ' + cols.join(','));
    q('#variable1').value = dims[0]; q('#variable2').value = dims[1];
    document.querySelector('input[name="tipoAnalisis"][value="correlacion"]').checked = true;
    analisis.ejecutarAnalisis();
    await esperar(() => /Pearson|Spearman/i.test(q('#resultadosCorrelacion').textContent), 15000);   // el análisis corre en un setTimeout
    assert.match(q('#resultadosCorrelacion').textContent, /Análisis de Correlación/i);
    // (paso 2) la fiabilidad de la base simulada (ítems Likert enteros) incluye α y ω ordinales
    const fiab = q('#resultadosFiabilidad').textContent;
    assert.ok(/α ordinal/.test(fiab) && /ω ordinal/.test(fiab) && /correlaciones policóricas/.test(fiab), 'columnas ordinales en la tabla de fiabilidad');
    assert.match(fiab, /Tras recodificar los 3 ítems inversos, el α ordinal sería \.\d{3}/, 'el PSS tiene 3 ítems inversos sin recodificar');
    assert.match(q('#resultadosContainer').textContent, /Zumbo, B\. D\., Gadermann/, 'las referencias en pantalla incluyen las de la fiabilidad ordinal');
    assert.ok(q('#marcoMetodologicoContainer').textContent.trim().length > 200, 'marco metodológico escrito');
});

test('comparación de grupos por Sexo', async () => {
    q('#variable1').value = carga.obtenerColumnasNumericas(globalThis.datosGenerados || globalThis.generadorDatos.obtenerDatosGenerados()).find(c => c.startsWith('General_')); q('#variable2').value = 'Sexo';
    document.querySelector('input[name="tipoAnalisis"][value="correlacion"]').checked = false;
    const radio = document.querySelector('input[name="tipoAnalisis"][value="comparacion"]'); radio.checked = true; env.disparar(radio, 'change');   // repuebla los desplegables
    q('#variable1').value = carga.obtenerColumnasNumericas(globalThis.datosGenerados).find(c => c.startsWith('General_')); q('#variable2').value = 'Sexo';
    assert.equal(q('#variable2').value, 'Sexo', 'Sexo se ofrece como variable de agrupación');
    analisis.ejecutarAnalisis();
    await esperar(() => q('#resultadosComparacion').textContent.trim().length > 100, 15000);
    assert.match(q('#resultadosComparacion').textContent, /Femenino|Masculino|grupo/i);
    assert.match(q('#resultadosComparacion').textContent, /Mann|Student|U de|t de|t\(/i);
});

