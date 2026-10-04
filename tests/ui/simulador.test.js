// tests/ui/simulador.test.js — la interfaz del Simulador de punta a punta sobre index.html real, en Node.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';

const raiz = new URL('../../', import.meta.url);
let ui, pruebas, socios, correl, difs, modelos, repetidas, estructura, cortes, concordancia, maestro, motor, resultado;
let env;

before(async () => {
    env = crearEntorno(fs.readFileSync(new URL('index.html', raiz), 'utf8'));
    // mismo orden que el navegador: main.js (módulo) → scripts clásicos con defer → DOMContentLoaded
    env.document.readyState = 'interactive';   // los módulos diferidos se ejecutan con el documento ya parseado, como en el navegador
    await import(new URL('src/main.js', raiz));
    await new Promise(r => setTimeout(r, 0));   // microtareas de montaje
    env.document.readyState = 'complete';
    env.disparar(env.document, 'DOMContentLoaded', { bubbles: false });
    [pruebas, socios, correl, difs, modelos, repetidas, estructura, cortes, concordancia, maestro, motor, resultado] = await Promise.all(
        ['pruebas', 'sociodemograficos', 'correlaciones', 'diferencias', 'modelos', 'repetidas', 'estructura', 'cortes-desenlaces', 'concordancia', 'maestro', 'motor', 'resultado'].map(m => import(new URL(`src/simulador/ui/${m}.js`, raiz))));
    ui = await import(new URL('src/simulador/ui/index.js', raiz));
});

const q = (sel, raiz2 = null) => (raiz2 || globalThis.document).querySelector(sel);
const qa = (sel, raiz2 = null) => (raiz2 || globalThis.document).querySelectorAll(sel);
const filasPruebas = () => qa('#bodyPruebas .fila-prueba');
const campo = (fila, etiqueta) => fila.querySelector(`[aria-label="${etiqueta}"]`);
const poner = (el, v, tipo = 'input') => { el.value = v; env.disparar(el, tipo); };
const esperar = async (cond, ms = 8000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error('tiempo de espera agotado'); await new Promise(r => setTimeout(r, 25)); } };

test('la cáscara monta: StatSim, puente heredado y navegación', () => {
    assert.equal(typeof globalThis.StatSim.version, 'string');
    // (F5) solo quedan en window los globales de traspaso de datos y de consola; el resto va por importaciones
    for (const g of ['generadorDatos', 'GeneradorDatos', 'BaseColumnar', 'StatSimMantenimiento']) assert.equal(typeof globalThis[g] === 'undefined', false, 'falta ' + g);
    const enlace = qa('.nav-link').find(l => l.getAttribute('href') === '#simulador');
    enlace.click();
    assert.ok(q('#simulador').classList.contains('active'), 'la sección Simulador se activa al pulsar su enlace');
});

test('tarjetas I–IX: se añaden filas y la configuración se recolecta y valida', () => {
    q('#tamanoMuestra').value = '300'; q('#semilla') && (q('#semilla').value = '7');
    // cuadro de tests y escalas (I)
    pruebas.agregarFilaTestConDatos({ prueba: 'EQ-i', variable: 'IE', dimensiones: ['Intrapersonal', 'Interpersonal', 'Adaptabilidad'], rIntra: '0.4' });
    pruebas.agregarFilaTestConDatos({ prueba: 'PSS-14', variable: 'Estrés', dimensiones: ['Estrés percibido'], rIntra: '0.4' });
    pruebas.sincronizarDimensionesDesdeTests();
    const datosFilas = { Intrapersonal: ['EQ-i', '8', '24', '5', '1', '5', '0.8', '0'], Interpersonal: ['EQ-i', '8', '24', '5', '1', '5', '0.85', '2'], Adaptabilidad: ['EQ-i', '6', '18', '4', '1', '5', '0.78', '0'], 'Estrés percibido': ['PSS-14', '14', '28', '8', '0', '4', '0.85', '4'] };
    for (const fila of filasPruebas()) {
        const nombre = campo(fila, 'Nombre de la escala').value.trim(); const d = datosFilas[nombre]; if (!d) continue;
        for (const [k, et] of [[1, 'Número de ítems'], [2, 'Media (M)'], [3, 'Desviación estándar (DE)'], [4, 'Mínimo por ítem'], [5, 'Máximo por ítem'], [6, 'Alfa de Cronbach objetivo'], [7, 'Ítems invertidos']]) poner(campo(fila, et), d[k]);
    }
    assert.equal(filasPruebas().length, 4, 'cuatro escalas desde el cuadro de tests');
    // dicotómica: dificultades activas y DE de solo lectura
    const dic = pruebas.agregarFilaPruebaConDatos({ prueba: 'PSS-14', nombre: 'Conocimientos', numItems: '10', distribucion: 'normal', media: '6', de: '2', min: '0', max: '1', alfa: '0.8', invertidos: '', dificultades: '0.9, 0.85, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.25, 0.2' });
    assert.equal(campo(dic, 'Dificultades de los ítems').disabled, false); assert.equal(campo(dic, 'Desviación estándar (DE)').readOnly, true);
    assert.ok(Math.abs(parseFloat(campo(dic, 'Media (M)').value) - 5.5) < 0.01, 'la media es la suma de las dificultades');
    // sociodemográficas (II)
    socios.agregarFilaSocioConDatos({ categoria: 'Sexo', distribucion: 'binaria', promedio: '0.5', de: '', min: '', max: '', decimales: '0', opciones: 'Femenino, Masculino' });
    socios.agregarFilaSocioConDatos({ categoria: 'Edad', distribucion: 'normal', promedio: '20', de: '3', min: '15', max: '30', decimales: '0' });
    socios.agregarFilaSocioConDatos({ categoria: 'Grado', distribucion: 'categorica', promedio: '', de: '', min: '1', max: '3', decimales: '0', opciones: 'Primero < Segundo < Tercero', dependeDe: 'Sexo', fuerza: '0.4' });
    socios.agregarFilaSocioConDatos({ categoria: 'Aula', distribucion: 'categorica', promedio: '', de: '', min: '1', max: '12', decimales: '0' });
    // III–IX
    correl.agregarFilaCorrelacion();
    { const f = qa('#bodyCorrelaciones .fila-correlacion').pop(); env.disparar(campo(f, 'Variable A'), 'focusin'); poner(campo(f, 'Variable A'), 'Intrapersonal', 'change'); env.disparar(campo(f, 'Variable B'), 'focusin'); poner(campo(f, 'Variable B'), 'Estrés percibido', 'change'); poner(campo(f, 'Correlación objetivo'), '-0.3'); }
    difs.agregarFilaDiferencia();
    { const f = qa('#bodyDiferencias .fila-diferencia').pop(); env.disparar(campo(f, 'Variable cuantitativa'), 'focusin'); poner(campo(f, 'Variable cuantitativa'), 'Estrés percibido', 'change'); env.disparar(campo(f, 'Variable de agrupación'), 'focusin'); poner(campo(f, 'Variable de agrupación'), 'Sexo', 'change'); poner(campo(f, 'd de Cohen'), '0.4'); }
    difs.agregarFilaDiferencia();
    { const f = qa('#bodyDiferencias .fila-diferencia').pop(); poner(campo(f, 'Tipo de efecto'), 'icc', 'change'); env.disparar(campo(f, 'Variable cuantitativa'), 'focusin'); poner(campo(f, 'Variable cuantitativa'), 'Adaptabilidad', 'change'); env.disparar(campo(f, 'Variable de agrupación'), 'focusin'); poner(campo(f, 'Variable de agrupación'), 'Aula', 'change'); poner(campo(f, 'd de Cohen'), '0.15'); }
    modelos.agregarFilaModelo({ tipo: 'mediacion', x: 'Intrapersonal', m: 'Interpersonal', y: 'Estrés percibido', c1: 0.4, c2: -0.3, c3: -0.1 });
    modelos.agregarFilaModelo({ tipo: 'curvilinea', x: 'Edad', m: '', y: 'Adaptabilidad', c1: 0.2, c2: -0.2, c3: '' });
    repetidas.agregarFilaRepetida({ variable: 'Interpersonal', ondas: 2, estabilidad: 0.7, cambio: 0.3, agrupacion: '', cambioGrupo: '', modelo: 'ar1' });
    cortes.agregarFilaCorte({ variable: 'Estrés percibido', texto: 'Bajo, Medio, Alto @ 20, 36' });
    cortes.agregarFilaDesenlace({ nombre: 'Deserción', tipo: 'binario', parametro: '0.25', predictores: [{ variable: 'Estrés percibido', efecto: '1.8' }] });
    concordancia.agregarFilaConcordancia({ tipo: 'informante', variable: 'Intrapersonal', etiqueta: 'madre', concordancia: 0.6, sesgo: -0.3 });
    concordancia.agregarFilaConcordancia({ tipo: 'jueces', variable: 'Estrés percibido', etiqueta: 3, concordancia: 0.7 });
    // estructura factorial (VII): proponer cargas para EQ-i
    globalThis.generadorDatos.recolectarConfiguracion();
    const cfg = globalThis.generadorDatos.configuracion;
    assert.equal(cfg.pruebas.length, 5); assert.equal(cfg.sociodemograficos.length, 4); assert.equal(cfg.correlaciones.length, 1); assert.equal(cfg.diferenciasGrupo.length, 2);
    assert.equal(cfg.modelos.length, 2); assert.equal(cfg.medidasRepetidas.length, 1); assert.equal(cfg.cortes.length, 1); assert.equal(cfg.desenlaces.length, 1); assert.equal(cfg.concordancias.length, 2);
    const v = globalThis.generadorDatos.validarConfiguracion();
    assert.deepEqual(v.errores, []);
});

test('generar desde la interfaz (respaldo en el hilo principal): vista previa, informe y descargas', async () => {
    q('#tamanoMuestra').value = '200';
    motor.generarBaseDatos();
    await esperar(() => resultado.ultimoInforme && resultado.ultimoInforme.length > 0);
    const datos = globalThis.generadorDatos.obtenerDatosGenerados();
    assert.equal(datos.length, 200);
    for (const c of ['Dimension_IN_madre', 'Juez1_EP', 'Nivel_EP', 'Deserción', 'Dimension_IP_T2']) assert.ok(c in datos[0] || Object.keys(datos[0]).some(k => k.startsWith(c.split('_')[0])), 'columna esperada: ' + c);
    assert.ok(qa('#tablaPreview tr').length > 1, 'hay vista previa con filas');
    resultado.descargarCSV();
    assert.ok(env.descargas.length >= 1, 'el CSV se descarga (Blob creado)');
});

test('maestro: exportar, vaciar, importar y recuperar las nueve tablas', async () => {
    maestro.exportarConfigTodo();
    const blob = env.descargas[env.descargas.length - 1]; const texto = await blob.text();
    for (const marca of ['###GENERAL###', '###TESTS###', '###PRUEBAS###', '###SOCIODEMOGRAFICOS###', '###CORRELACIONES###', '###DIFERENCIAS###', '###MODELOS###', '###REPETIDAS###', '###ESTRUCTURA###', '###CORTES###', '###DESENLACES###', '###CONCORDANCIA###']) assert.ok(texto.includes(marca), 'falta ' + marca);
    for (const id of ['bodyTests', 'bodyPruebas', 'bodySocio', 'bodyCorrelaciones', 'bodyDiferencias', 'bodyModelos', 'bodyRepetidas', 'bodyCortes', 'bodyDesenlaces', 'bodyConcordancia']) q('#' + id).innerHTML = '';
    globalThis.FileReader = class { readAsText() { setTimeout(() => this.onload({ target: { result: texto } }), 0); } };
    maestro.importarConfigTodo({ target: { files: [{}], value: '' } });
    await esperar(() => filasPruebas().length === 5);
    assert.equal(qa('#bodySocio .fila-socio').filter(f => f.querySelector('input').value.trim()).length, 4); assert.equal(qa('#bodyModelos .fila-modelo').length, 2); assert.equal(qa('#bodyConcordancia .fila-concordancia').length, 2);
    globalThis.generadorDatos.recolectarConfiguracion();
    assert.deepEqual(globalThis.generadorDatos.validarConfiguracion().errores, []);
});

test('renombrar una escala y una sociodemográfica se propaga a todas las tablas', () => {
    const f = filasPruebas().find(x => campo(x, 'Nombre de la escala').value === 'Estrés percibido');
    const inp = campo(f, 'Nombre de la escala'); env.disparar(inp, 'focusin'); poner(inp, 'Estrés global', 'change');
    assert.equal(q('#bodyCortes .fila-corte select').value, 'Estrés global');
    assert.equal(q('#bodyDesenlaces [aria-label="Predictor 1"]').value, 'Estrés global');
    assert.ok(qa('#bodyConcordancia [aria-label="Variable de concordancia"]').some(s => s.value === 'Estrés global'));
    assert.ok(qa('#bodyCorrelaciones select').some(s => s.value === 'Estrés global'));
    env.disparar(inp, 'focusin'); poner(inp, 'Estrés percibido', 'change');
    const fs2 = qa('#bodySocio .fila-socio').find(x => x.querySelector('input').value === 'Sexo'); const inS = fs2.querySelector('input');
    env.disparar(inS, 'focusin'); poner(inS, 'Género', 'change');
    assert.ok(qa('#bodyDiferencias select').some(s => s.value === 'Género'));
    env.disparar(inS, 'focusin'); poner(inS, 'Sexo', 'change');
});

test('un maestro de la época B5 abre sin error y valida', async () => {
    const antiguo = ['###GENERAL###', 'Campo,Valor', 'TamanoMuestra,120', 'Semilla,42', '', '###TESTS###', 'Prueba,Variable,CorrDimensiones', 'BAI,Ansiedad,0.4', '', '###PRUEBAS###', 'Prueba,Escala,NumItems,Distribucion,Media,DE,MinItem,MaxItem,Alfa,Invertidos', 'BAI,Somática,10,normal,20,5,0,3,0.85,0', 'BAI,Cognitiva,11,normal,22,5,0,3,0.85,2', '', '###SOCIODEMOGRAFICOS###', 'Categoria,Distribucion,Promedio,DE,Minimo,Maximo,Decimales', 'Edad,normal,21,3,17,35,0', 'Sexo,binaria,0.5,,,,0', '', '###CORRELACIONES###', 'VariableA,VariableB,Correlacion', 'Somática,Cognitiva,0.5', ''].join('\n');
    globalThis.FileReader = class { readAsText() { setTimeout(() => this.onload({ target: { result: antiguo } }), 0); } };
    maestro.importarConfigTodo({ target: { files: [{}], value: '' } });
    await esperar(() => filasPruebas().length === 2 && qa('#bodyCorrelaciones .fila-correlacion').length === 1);
    globalThis.generadorDatos.recolectarConfiguracion();
    const v = globalThis.generadorDatos.validarConfiguracion();
    assert.deepEqual(v.errores, []); assert.equal(globalThis.generadorDatos.configuracion.tamanoMuestra, 120);
});
