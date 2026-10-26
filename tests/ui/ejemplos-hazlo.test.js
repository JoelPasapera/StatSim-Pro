// @ts-check
// tests/ui/ejemplos-hazlo.test.js — (2027.01.03) «Muéstrame», «Hazlo por mí» y «Hazlo todo por mí» en la guía de un caso,
// sobre index.html (sin navegador): qué ofrece cada paso; «Hazlo por mí» del caso 1 rehace su correlación (la del caso, cifra
// a cifra) y el del caso 4, su V de Aiken (sube las valoraciones del caso, y el CSV que baja es el del caso, byte a byte);
// «Muéstrame» señala los controles en orden sin tocar nada; «Detener», Esc y cerrar la guía lo paran; un paso que no se
// puede hacer lo dice; y sin guiones (unos ejemplos de la 2027.01.02) la guía es la de antes. (En Chromium, de verdad y con
// los cinco casos: tests/navegador/hazlo-por-mi.mjs.) Los archivos se sirven de la carpeta del proyecto, como lo haría el sitio.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearEntorno, Elemento, Evento } from './minidom.js';

const raiz = new URL('../../', import.meta.url);
const carpetaRaiz = fileURLToPath(raiz);
const ejemplos = path.join(carpetaRaiz, 'ejemplos');
const hayEjemplos = fs.existsSync(path.join(ejemplos, 'indice.json'));
const sinEjemplos = !hayEjemplos && 'sin ejemplos/indice.json';
/** @type {any} */ let env;
/** @type {any} */ let pestana;
/** @type {any} */ let RITMO;
/** @type {any} */ const G = globalThis;
/** @type {string[]} */ const pedidos = [];
/** Lo que el sitio sirve distinto: ruta → bytes. @type {Map<string, Buffer>} */
const trampas = new Map();
/** Los controles que se llevaron a la vista (el conductor los lleva antes de usarlos o señalarlos), en orden. @type {string[]} */
const llevados = [];
const q = (/** @type {string} */ sel) => env.document.querySelector(sel);
const qa = (/** @type {string} */ sel) => [...env.document.querySelectorAll(sel)];
const toast = () => q('#toast').textContent;
const activa = () => qa('.section.active').map(s => s.id).join(',');
const estado = () => q('#guiaEjemploEstado').textContent;
const ocupada = () => !q('#guiaEjemplo [data-accion-guia="detener"]').hidden;
/** @param {() => any} cond @param {number} [ms] */
const esperar = async (cond, ms = 60000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error('tiempo de espera agotado'); await new Promise(r => setTimeout(r, 10)); } };
const catalogo = () => JSON.parse(fs.readFileSync(path.join(ejemplos, 'indice.json'), 'utf8'));
const verificacion = (/** @type {string} */ carpeta) => JSON.parse(fs.readFileSync(path.join(ejemplos, carpeta, 'verificacion.json'), 'utf8'));
/** Cómo se llama un control en la lista de los llevados a la vista. @param {any} el */
const nombreDe = el => el.id ? '#' + el.id : el.localName === 'label' ? `label(${el.textContent.trim().slice(0, 24)})` : el.localName;

/** El sitio: los archivos de la carpeta del proyecto (sin salir de ella), con su ?v= ignorado. @param {string} url */
async function servir(url) {
    pedidos.push(url);
    const relativa = decodeURIComponent(String(url).split('?')[0]);
    if (/^[a-z]+:/i.test(relativa) || relativa.split('/').includes('..')) throw new TypeError('Failed to fetch');
    const trampa = trampas.get(relativa);
    const ruta = path.join(carpetaRaiz, ...relativa.split('/'));
    const status = trampa || fs.existsSync(ruta) ? 200 : 404;
    const b = trampa || (status === 200 ? fs.readFileSync(ruta) : Buffer.alloc(0));
    return { ok: status === 200, status, text: async () => b.toString('utf8'), json: async () => JSON.parse(b.toString('utf8')), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
}

/** Un catálogo distinto (sirve hasta que se quite), ya leído por la pestaña. @param {(c: any) => void} cambiar */
async function conCatalogo(cambiar) {
    const c = catalogo();
    cambiar(c);
    trampas.set('ejemplos/indice.json', Buffer.from(JSON.stringify(c), 'utf8'));
    assert.ok(await pestana.cargar(), 'la pestaña lee el catálogo cambiado');
}
async function catalogoDeVerdad() {
    trampas.delete('ejemplos/indice.json');
    assert.ok(await pestana.cargar());
}

/** Abre un caso con «Abrir en StatSim» (la guía, desplegada). @param {string} carpeta */
async function abrir(carpeta) {
    assert.equal(await pestana.abrir(carpeta), true, `se abre ${carpeta}`);
    assert.ok(q('#guiaEjemplo') && !q('#guiaEjemplo').classList.contains('plegada'));
}

/** Pulsa un botón de la guía y espera a que termine lo que puso en marcha. @param {string} accion @param {number} [paso] */
async function pulsarYEsperar(accion, paso) {
    const sel = `#guiaEjemplo [data-accion-guia="${accion}"]` + (paso ? `[data-paso="${paso}"]` : '');
    llevados.length = 0;
    q(sel).click();
    assert.ok(ocupada(), 'en marcha: «Detener» a la vista');
    await esperar(() => !ocupada(), 120000);
}

before(async () => {
    env = crearEntorno(fs.readFileSync(new URL('index.html', raiz), 'utf8'));
    env.document.readyState = 'interactive';
    G.fetch = servir;
    G.confirm = () => true;
    // el diálogo de archivos no se puede abrir con un archivo puesto: la guía se lo pone a su campo, como el navegador
    G.DataTransfer = class { constructor() { /** @type {File[]} */ this.lista = []; this.items = { add: (/** @type {File} */ f) => { this.lista.push(f); } }; } get files() { return this.lista; } };
    Elemento.prototype.scrollIntoView = function () { llevados.push(nombreDe(this)); };
    await import(new URL('src/main.js', raiz).href);
    await new Promise(r => setTimeout(r, 0));
    env.document.readyState = 'complete';
    env.disparar(env.document, 'DOMContentLoaded', { bubbles: false });
    if (!hayEjemplos) return;
    q('.nav-link[href="#ejemplos"]').click();
    await esperar(() => qa('#ejemplosGaleria .ejemplo-tarjeta').length > 0);
    ({ pestana } = await import(new URL('src/ejemplos/index.js', raiz).href));
    ({ RITMO } = await import(new URL('src/ejemplos/hazlo/conductor.js', raiz).href));
    Object.assign(RITMO, { hacer: 0, mostrar: 0, paciencia: 3000, cadaCuanto: 5 });
});

test('(2027.01.07, revisión) lo que un guion elige de una lista es una de sus opciones en la página (planes.js, OPCIONES_DE_LAS_LISTAS)', async () => {
    const { OPCIONES_DE_LAS_LISTAS, accionValida } = await import(new URL('src/ejemplos/hazlo/planes.js', raiz).href);
    for (const [selector, opciones] of Object.entries(OPCIONES_DE_LAS_LISTAS)) {
        const en = selector.startsWith('input') ? qa(selector) : qa(`${selector} option`);
        assert.ok(en.length > 0, `${selector}: está en la página`);
        assert.deepEqual(en.map(o => o.value), [...opciones], `${selector}: las mismas opciones, en el mismo orden`);
    }
    // con el papel por defecto de la tarjeta del SEM, el primero
    assert.equal(q('#semEtiqueta').value, OPCIONES_DE_LAS_LISTAS['#semEtiqueta'][0]);
    // y lo que admite accionValida, de ellas; una que no es, no (hasta la 2027.01.06 la admitía, y «Hazlo por mí» no podía elegirla)
    assert.equal(accionValida({ accion: 'calcularAFE', datos: { replicas: Number(qa('#afeB option')[2].value) } }), true);
    assert.equal(accionValida({ accion: 'calcularAFE', datos: { replicas: 300 } }), false);
});

test('(2027.01.10, revisión) los límites que un guion no puede pasar son los de la página (planes.js, LIMITES_DE_LA_PAGINA), y las casillas que da por desactivadas, las que la página desactiva', { skip: sinEjemplos }, async () => {
    const { LIMITES_DE_LA_PAGINA: L, queNoPuede } = await import(new URL('src/ejemplos/hazlo/planes.js', raiz).href);
    const { validarEntrada } = await import(new URL('src/analizador/psicometria/aiken.js', raiz).href);
    await abrir('04-instrumental');
    try {
        // las variables y los predictores adicionales: «＋ Agregar…» se queda en su límite
        for (const [boton, cont, limite] of /** @type {Array<[string, string, number]>} */ ([['#btnAgregarVariable', '#varsExtraCont', L.variablesAdicionales], ['#btnAgregarPredictor', '#regPredsCont', L.predictoresAdicionales]])) {
            qa(`${cont} button[aria-label="Quitar"]`).forEach(b => b.click());
            for (let k = 0; k < limite + 3; k++) q(boton).click();
            assert.equal(qa(`${cont} select`).length, limite, `${boton}: hasta ${limite}`);
            qa(`${cont} button[aria-label="Quitar"]`).forEach(b => b.click());
            assert.equal(qa(`${cont} select`).length, 0);
        }
        // la interacción de la regresión: su casilla, solo con dos predictores o más
        const interaccion = () => q('#regInter').parentElement.style.display !== 'none';
        assert.equal(interaccion(), false, 'con uno, no se ve');
        q('#btnAgregarPredictor').click();
        assert.equal(interaccion(), true, 'con dos, sí');
        qa('#regPredsCont button[aria-label="Quitar"]').forEach(b => b.click());
        // la escala de la V de Aiken: de enteros, el máximo mayor que el mínimo y hasta 21 categorías (lo que dice de la escala)
        const escala = (/** @type {number} */ minimo, /** @type {number} */ maximo) => validarEntrada({ minimo, maximo, criterios: [{ nombre: 'C', valoraciones: [[minimo]] }] }).filter((/** @type {string} */ e) => /escala/.test(e)).length;
        assert.deepEqual([escala(0, L.categoriasDeAiken - 1), escala(0, L.categoriasDeAiken), escala(3, 3), escala(1, 4.5)], [0, 1, 1, 1]);
        // el AFE con sus ítems: desde 3 distintos (L.itemsDelAFE), separados por comas, puntos y comas o espacios
        q('#afeActualizar').click();
        const ajenos = (/** @type {number} */ n) => Array.from({ length: n }, (_, i) => `NO${i + 1}`).join(', ');
        const afe = (/** @type {string} */ items) => {
            q('#afeConjunto').value = 'propia';
            q('#afeItems').value = items;
            q('#afeCalcular').click();
            return /Elige al menos 3 ítems/.test(q('#afeMensajes').textContent);
        };
        assert.deepEqual([afe(ajenos(L.itemsDelAFE - 1)), afe('P1 P1; P2'), afe(ajenos(L.itemsDelAFE))], [true, true, false], `con ${L.itemsDelAFE} distintos, ya no lo pide (esos no están en la base: no calcula)`);
        // la invarianza: con WLSMV, la estricta, desactivada; con ML, agrupar las categorías (lo que queNoPuede no admite)
        const estimador = (/** @type {string} */ v) => { q('#invEstimador').value = v; env.disparar(q('#invEstimador'), 'change'); return [q('#invEstricta').disabled, q('#invAgrupar').disabled]; };
        assert.deepEqual(estimador('WLSMV'), [true, false]);
        assert.deepEqual(estimador('ML'), [false, true]);
        assert.notEqual(queNoPuede({ accion: 'evaluarInvarianza', datos: { sintaxis: 'F =~ a + b', grupo: 'Sexo', estimador: 'WLSMV', estricta: true } }), '');
        assert.notEqual(queNoPuede({ accion: 'evaluarInvarianza', datos: { sintaxis: 'F =~ a + b', grupo: 'Sexo', agrupar: false } }), '');
        // (2027.01.11, revisión) el nombre de un criterio de la V de Aiken: su campo admite L.nombreDeCriterio (más, lo cortaría)
        q('#aikenAgregarCriterio').click();
        const nombres = qa('#aikenCriterios input[aria-label="Nombre del criterio"]');
        assert.ok(nombres.length && nombres.every((/** @type {any} */ c) => c.maxLength === L.nombreDeCriterio), `cada nombre de criterio, hasta ${L.nombreDeCriterio}`);
        // las listas de la comparación entre grupos: la agrupación, de texto; la numérica, la covariable y las adicionales, de
        // números (lo que queNoPuede da por hecho: la misma no puede estar en las dos)
        const opcionesDe = (/** @type {string} */ sel) => qa(`${sel} option`).map((/** @type {any} */ o) => o.value).filter(Boolean);
        const grupos = opcionesDe('#cgGrupo'), numeros = new Set([...opcionesDe('#cgNum'), ...opcionesDe('#cgCov'), ...qa('#cgDVs input').map((/** @type {any} */ i) => i.value)]);
        assert.ok(grupos.length && numeros.size && grupos.every((/** @type {string} */ g) => !numeros.has(g)), `ninguna en las dos (${grupos.join(', ')})`);
    } finally {
        env.disparar(q('#analizador'), 'click');
    }
});

test('la guía de un caso con guiones: «Muéstrame» en cada paso, «Hazlo por mí» en los que se repiten, «Hazlo todo por mí» y su línea de estado', { skip: sinEjemplos }, async () => {
    await abrir('02-comparativo');
    assert.deepEqual(qa('#guiaEjemplo [data-accion-guia="mostrar"]').map(b => b.getAttribute('data-paso')), ['1', '2', '3', '4', '5']);
    assert.deepEqual(qa('#guiaEjemplo [data-accion-guia="hacer"]').map(b => b.getAttribute('data-paso')), ['2', '3', '4'], 'solo los que hay que repetir');
    assert.equal(q('#guiaEjemplo [data-accion-guia="mostrar"]').getAttribute('aria-label'), 'Muéstrame el paso 1', 'cada botón dice su paso');
    assert.equal(q('#guiaEjemplo [data-accion-guia="hacer"]').getAttribute('aria-label'), 'Hazlo por mí: el paso 2');
    assert.ok(q('#guiaEjemplo .guia-paso-repetir [data-accion-guia="hacer"]') && !q('#guiaEjemplo .guia-paso-hecho [data-accion-guia="hacer"]') && !q('#guiaEjemplo .guia-paso-opcional [data-accion-guia="hacer"]'));
    assert.equal(q('#guiaEjemplo [data-accion-guia="hacerTodo"]').textContent, 'Hazlo todo por mí');
    assert.equal(q('#guiaEjemplo .guia-hazlo-alcance').textContent, 'Los pasos 2 a 4, uno tras otro.');
    assert.equal(q('#guiaEjemplo .guia-hazlo-ayuda .orden-guia-titulo').textContent, 'Para qué sirve:');
    // la línea de estado y «Detener», fuera del cuerpo: se ven con la guía plegada
    const linea = q('#guiaEjemplo .guia-conduccion');
    assert.ok(linea && !q('#guiaEjemploCuerpo').contains(linea));
    assert.equal(q('#guiaEjemploEstado').getAttribute('role'), 'status');
    assert.equal(estado(), '');
    assert.equal(ocupada(), false, '«Detener», oculto mientras no hay nada en marcha');
});

test('«Hazlo por mí» del caso 1: rehace su correlación (la del caso, cifra a cifra), marca el paso y deja la guía plegada', { skip: sinEjemplos }, async () => {
    await abrir('01-correlacional');
    // lo que se haya tocado antes no importa: el paso lo deja como en el caso
    q('input[name="tipoAnalisis"][value="comparacion"]').click();
    q('#variable1').value = '';
    const casilla = q('#guiaPaso3');
    assert.equal(casilla.checked, false);
    await pulsarYEsperar('hacer', 3);
    const u = G.ultimoAnalisis;
    const delCaso = verificacion('01-correlacional').comprobaciones.find((/** @type {any} */ c) => c.tipo === 'correlacion');
    assert.deepEqual([u.var1, u.var2], [delCaso.entrada.var1, delCaso.entrada.var2]);
    for (const k of ['coeficiente', 'pValor', 'n', 'tipoCorrelacion', 'gl', 'r2']) assert.equal(u.resultado[k], delCaso.resultado[k], `${k}: el del caso`);
    assert.match(toast(), /^Análisis completado/);
    assert.equal(casilla.checked, true, 'el paso, hecho');
    assert.equal(q('#guiaEjemplo .guia-progreso').textContent, '3 de 5');
    assert.equal(estado(), 'Listo: paso 3 hecho (el análisis estadístico). Sus descargas son tuyas: te las dejo señaladas. Despliega la guía (▴) para seguir.');
    assert.ok(q('#guiaEjemplo').classList.contains('plegada'), 'plegada: lo que importa es el resultado');
    assert.equal(qa('.guia-resaltado').length, 0, 'sin nada resaltado al terminar');
    assert.equal(qa('#guiaEjemplo [aria-disabled="true"]').length, 0, 'sus botones, libres');
    assert.equal(qa('#guiaEjemplo .en-curso').length, 0);
    // cada control, a la vista antes de usarlo, en el orden del plan (de una opción, su etiqueta)
    assert.deepEqual(llevados.map(x => x.replace(/\(.*$/, '')), ['label', '#variable1', '#variable2', 'label', '#regDep', '#regInd', '#btnAnalizar',
        '#btnExportarWord', '#btnDescargarResultados', '#btnImprimirAnalizador'], llevados.join(' · '));
    assert.match(llevados[0], /^label\(Correlación/, 'de una opción, su etiqueta');
    assert.match(llevados[3], /^label\(Bilateral/);
    // las descargas del análisis (las del paso 4, que es suyo): señaladas, y siguen así al desplegar la guía (lo que pide su
    // mensaje); al primer clic fuera de ella, ya no
    const descargas = ['#btnExportarWord', '#btnDescargarResultados', '#btnImprimirAnalizador'];
    assert.ok(descargas.every(s => q(s).classList.contains('guia-senalado')), 'señaladas');
    q('#guiaEjemplo [data-accion-guia="plegar"]').click();
    assert.ok(descargas.every(s => q(s).classList.contains('guia-senalado')), 'un clic en la guía no las quita');
    env.disparar(q('#analizador'), 'click');
    assert.equal(qa('.guia-senalado').length, 0, 'uno fuera, sí');
});

test('(revisión) «Hazlo por mí» deja la comparación como en el caso: sin las variables adicionales que se marcaron antes', { skip: sinEjemplos }, async () => {
    await abrir('02-comparativo');
    const extra = qa('#cgDVs input[type="checkbox"]').find(c => c.value !== 'General_I');
    assert.ok(extra, 'hay variables para marcar');
    extra.click();
    assert.equal(extra.checked, true);
    await pulsarYEsperar('hacer', 3);
    assert.match(estado(), /^Listo: paso 3 hecho/);
    assert.equal(qa('#cgDVs input:checked').length, 0, 'ninguna adicional: el caso no las usó');
    assert.ok(q('#cgResultado').textContent.includes('Descriptivos por grupo') && !/MANOVA/.test(q('#cgResultado').textContent), 'una comparación, sin MANOVA');
    // (2027.01.04, revisión) otra vez, con la página ya en «Comparación»: cambiar el tipo de análisis vacía la lista por sí solo,
    // así que solo esta segunda vez prueba que el paso la deja como en el caso (sin quitarlas, salía un MANOVA)
    assert.equal(q('input[name="tipoAnalisis"][value="comparacion"]').checked, true, 'la página sigue en «Comparación»');
    const otra = qa('#cgDVs input[type="checkbox"]').find(c => c.value !== 'General_I');
    otra.click();
    assert.equal(qa('#cgDVs input:checked').length, 1);
    await pulsarYEsperar('hacer', 3);
    assert.match(estado(), /^Listo: paso 3 hecho/);
    assert.equal(qa('#cgDVs input:checked').length, 0, 'tampoco la segunda vez');
    assert.ok(!/MANOVA/.test(q('#cgResultado').textContent), 'sin MANOVA');
    q('#guiaEjemplo [data-accion-guia="plegar"]').click();
});

test('«Muéstrame» señala los controles del paso, en orden, sin tocar nada; y va a su sección', { skip: sinEjemplos }, async () => {
    await abrir('01-correlacional');
    q('#variable1').value = '';
    const descargas = env.descargas.length;
    await pulsarYEsperar('mostrar', 3);
    assert.equal(q('#variable1').value, '', 'no toca nada');
    assert.ok(llevados.includes('#variable1') && llevados.includes('#btnAnalizar'), llevados.join(' '));
    assert.equal(estado(), 'Paso 3: eso es lo que se toca. «Hazlo por mí» lo hace por ti, a la vista.');
    assert.equal(q('#guiaEjemplo').classList.contains('plegada'), false, 'la guía, como estaba');
    // las descargas: se señalan, nadie las pulsa
    await pulsarYEsperar('mostrar', 4);
    assert.deepEqual(llevados, ['#btnExportarWord', '#btnDescargarResultados', '#btnImprimirAnalizador']);
    assert.equal(env.descargas.length, descargas, 'sin descargas');
    assert.equal(estado(), 'Paso 4: eso es tuyo (las descargas, «Guardar proyecto»): pulsa lo que quieras guardar.');
    await pulsarYEsperar('mostrar', 1);
    assert.deepEqual(llevados, ['#btnUsarGenerados']);
    assert.equal(estado(), 'Paso 1: eso es lo que se hizo. Ya lo trajo el proyecto: no hace falta repetirlo.');
    await pulsarYEsperar('mostrar', 2);
    assert.deepEqual(llevados, ['#tituloTesis', '#unidadAnalisis', '#lugarContexto']);
    await pulsarYEsperar('mostrar', 5);
    assert.deepEqual(llevados, ['#btnGuardarProyecto']);
    assert.equal(activa(), 'ayuda', '«Guardar proyecto» está en Ayuda');
    assert.equal(qa('.guia-resaltado').length, 0);
});

test('«Hazlo por mí» del caso 4: sube las valoraciones del caso, su V de Aiken es la del caso y sus descargas quedan señaladas', { skip: sinEjemplos }, async () => {
    await abrir('04-instrumental');
    const carpeta = 'analizador/1-validez-de-contenido';
    // sin las valoraciones que trajo el proyecto: las sube la guía, del sitio; y con un aviso de error de antes a la vista
    // (revisión: el aviso que se espera es el de cada archivo, no uno viejo)
    qa('#aikenCriterios textarea').forEach(t => { t.value = ''; });
    q('#toast').textContent = 'Revisa las valoraciones: hay datos que corregir';
    q('#toast').className = 'toast error';
    const desde = pedidos.length;
    await pulsarYEsperar('hacer', 2);
    assert.equal(estado(), 'Listo: paso 2 hecho (la V de Aiken). Sus descargas son tuyas: te las dejo señaladas. Despliega la guía (▴) para seguir.');
    const subidos = ['valoraciones_claridad.csv', 'valoraciones_coherencia.csv', 'valoraciones_relevancia.csv'];
    assert.deepEqual(pedidos.slice(desde).map(u => decodeURIComponent(u.split('?')[0])).filter(u => u.endsWith('.csv')), subidos.map(n => `ejemplos/04-instrumental/${carpeta}/${n}`));
    assert.deepEqual(qa('#aikenCriterios textarea').map(t => t.value.replace(/\r\n/g, '\n')), subidos.map(n => fs.readFileSync(path.join(ejemplos, '04-instrumental', ...carpeta.split('/'), n), 'utf8').replace(/^\ufeff/, '').replace(/\r\n/g, '\n')));
    assert.ok(llevados.some(x => x.startsWith('button') || x === '#aikenCalcular'), llevados.join(' '));
    assert.ok(q('#aikenCSV').classList.contains('guia-senalado') && q('#aikenWord').classList.contains('guia-senalado'), 'sus descargas, señaladas');
    q('#aikenCSV').click();
    assert.equal(qa('.guia-senalado').length, 0, 'al primer clic, ya no');
    const csv = await env.descargas[env.descargas.length - 1].text();
    assert.equal(csv, fs.readFileSync(path.join(ejemplos, '04-instrumental', ...carpeta.split('/'), 'validez_contenido_aiken.csv'), 'utf8'), 'el CSV de la V de Aiken, el del caso');
    assert.equal(q('#guiaPaso2').checked, true);
});

test('«Detener», Esc y cerrar la guía lo paran donde va; lo hecho se queda y la guía vuelve como estaba', { skip: sinEjemplos }, async () => {
    await abrir('01-correlacional');
    RITMO.hacer = 120;
    try {
        for (const como of ['detener', 'Esc']) {
            q('#variable2').value = '';
            q('#guiaEjemplo [data-accion-guia="hacer"][data-paso="3"]').click();
            await esperar(() => /^Paso 3 · /.test(estado()));
            assert.ok(q('#guiaEjemplo .guia-paso.en-curso #guiaPaso3'), 'el paso en curso, marcado');
            const botones = qa('#guiaEjemplo [data-accion-guia="mostrar"], #guiaEjemplo [data-accion-guia="hacer"], #guiaEjemplo [data-accion-guia="hacerTodo"]');
            assert.ok(botones.length > 0 && botones.every(x => x.getAttribute('aria-disabled') === 'true'), 'mientras trabaja, sus botones, ocupados');
            q('#guiaEjemplo [data-accion-guia="mostrar"][data-paso="4"]').click();   // (ocupado: no hace nada)
            if (como === 'detener') q('#guiaEjemplo [data-accion-guia="detener"]').click();
            else { const ev = new Evento('keydown', { bubbles: true }); /** @type {any} */ (ev).key = 'Escape'; env.document.dispatchEvent(ev); }
            await esperar(() => !ocupada());
            assert.equal(estado(), 'Detenido en el paso 3. Lo que ya se hizo se queda; si un cálculo había empezado, termina solo.', como);
            assert.equal(q('#guiaPaso3').checked, false, `${como}: el paso no se marca`);
            assert.equal(q('#guiaEjemplo').classList.contains('plegada'), false, `${como}: la guía, como estaba`);
            assert.equal(qa('.guia-resaltado').length, 0);
            assert.equal(q('#guiaEjemploEstado').classList.contains('guia-estado-error'), false);
            assert.equal(qa('#guiaEjemplo [aria-disabled="true"]').length, 0, 'y libres al terminar');
        }
        // cerrar la guía mientras trabaja: no sigue
        q('#variable2').value = '';
        q('#guiaEjemplo [data-accion-guia="hacer"][data-paso="3"]').click();
        await esperar(() => /^Paso 3 · /.test(estado()));
        q('#guiaEjemplo [data-accion-guia="cerrar"]').click();
        await new Promise(r => setTimeout(r, 900));
        assert.equal(q('#variable2').value, '', 'no siguió con el paso');
        assert.equal(qa('.guia-resaltado').length, 0);
    } finally {
        RITMO.hacer = 0;
    }
});

test('un paso que no se puede hacer lo dice (qué falló y dónde), sin marcarlo; la guía vuelve como estaba', { skip: sinEjemplos }, async () => {
    await conCatalogo(c => { c.casos[0].guiones[2][0].datos.variables = ['NoExiste', 'General_EB']; });
    try {
        await abrir('01-correlacional');
        await pulsarYEsperar('hacer', 3);
        assert.equal(estado(), 'No se pudo hacer el paso 3. Variable 1: NoExiste: la lista no tiene esa opción («NoExiste»). Puedes seguir a mano: «Muéstrame» te señala dónde está cada cosa.');
        assert.ok(q('#guiaEjemploEstado').classList.contains('guia-estado-error'));
        assert.equal(q('#guiaEjemploEstado').getAttribute('aria-live'), 'assertive', 'un fallo se lee en cuanto pasa');
        assert.equal(q('#guiaPaso3').checked, false);
        assert.equal(q('#guiaEjemplo').classList.contains('plegada'), false);
        // lo siguiente vuelve a decirse con calma
        await pulsarYEsperar('mostrar', 4);
        assert.equal(q('#guiaEjemploEstado').getAttribute('aria-live'), 'polite');
        assert.equal(q('#guiaEjemploEstado').classList.contains('guia-estado-error'), false);
    } finally {
        await catalogoDeVerdad();
    }
});

test('sin guiones (unos ejemplos de la 2027.01.02), la guía es la de antes: sin «Muéstrame» ni «Hazlo por mí»', { skip: sinEjemplos }, async () => {
    await conCatalogo(c => { c.casos.forEach((/** @type {any} */ e) => { delete e.guiones; }); });
    try {
        await abrir('02-comparativo');
        assert.equal(qa('#guiaEjemplo [data-accion-guia="mostrar"], #guiaEjemplo [data-accion-guia="hacer"], #guiaEjemplo [data-accion-guia="hacerTodo"]').length, 0);
        assert.equal(q('#guiaEjemplo .guia-conduccion'), null);
        assert.equal(q('#guiaEjemplo .guia-hazlo-ayuda'), null);
        assert.equal(qa('#guiaEjemplo .guia-casilla').length, 5, 'sus pasos, como siempre');
    } finally {
        await catalogoDeVerdad();
    }
});

test('«Hazlo todo por mí» del caso 3: sus dos regresiones, una tras otra, como en el caso', { skip: sinEjemplos }, async () => {
    await abrir('03-predictivo');
    await pulsarYEsperar('hacerTodo');
    assert.equal(estado(), 'Listo: se repitieron los pasos 2 y 3, como en el caso. Te dejo señaladas las descargas de lo que ves (las del paso 3). Cada análisis reemplaza al anterior en la página: ya no están las descargas del análisis del paso 2; repítelo con su «Hazlo por mí» o bájalas hechas en la pestaña «Ejemplos».');
    assert.deepEqual(qa('#guiaEjemplo .guia-casilla').map(c => c.checked), [true, true, true, false]);
    const delCaso = verificacion('03-predictivo').comprobaciones.filter((/** @type {any} */ c) => c.tipo === 'regresion');
    const ultima = delCaso[delCaso.length - 1];
    assert.ok(ultima, 'el caso 3 comprueba sus regresiones');
    const { RegresionMultiple } = await import(new URL('src/analizador/regresion.js', raiz).href);
    const R = RegresionMultiple._ultimaMultiple;
    assert.equal(R.familia, ultima.resultado.familia, 'la última, la logística');
    assert.equal(R.n, ultima.resultado.n);
    assert.deepEqual(R.coefs.map((/** @type {any} */ c) => [c.nombre, c.b]), ultima.resultado.coefs.map((/** @type {any} */ c) => [c.nombre, c.b]), 'sus coeficientes, los del caso');
});

// ---- (2027.01.04) Lo que halló la revisión de la 2027.01.03

test('(revisión) un paso suelto cuyas descargas llevan lo de un paso sin marcar lo dice; marcado, ya no', { skip: sinEjemplos }, async () => {
    await abrir('05-estructural');
    assert.equal(q('#guiaPaso2').checked, false, 'el SEM (paso 2), sin hacer');
    await pulsarYEsperar('hacer', 3);
    // (revisión) el SEM va en el capítulo de Word y en lo impreso; en el texto, no
    assert.match(estado(), /^Listo: paso 3 hecho \(el análisis estadístico\)\. Sus descargas son tuyas: te las dejo señaladas\. Ojo: el Word y lo impreso \(el PDF\) llevan también lo del paso 2, que no está marcado como hecho; si no lo hiciste, hazlo antes de descargarlos, o no serán los del caso \(«Hazlo todo por mí» hace todos los pasos en orden\)\. Despliega la guía \(▴\) para seguir\.$/);
    // hecho a mano (la persona lo marca): ya no lo dice
    q('#guiaPaso2').click();
    assert.equal(q('#guiaPaso2').checked, true);
    await pulsarYEsperar('hacer', 3);
    assert.equal(estado(), 'Listo: paso 3 hecho (el análisis estadístico). Sus descargas son tuyas: te las dejo señaladas. Despliega la guía (▴) para seguir.');
    // con la guía desplegada durante el trabajo, no pide desplegarla
    q('#guiaEjemplo [data-accion-guia="hacer"][data-paso="3"]').click();
    q('#guiaEjemplo [data-accion-guia="plegar"]').click();
    assert.equal(q('#guiaEjemplo').classList.contains('plegada'), false);
    await esperar(() => !ocupada(), 120000);
    assert.equal(estado(), 'Listo: paso 3 hecho (el análisis estadístico). Sus descargas son tuyas: te las dejo señaladas.');
    env.disparar(q('#analizador'), 'click');
});

test('(2027.01.05, revisión) el caso 4, el paso 6 suelto: cada descarga con lo suyo (el Word, el SEM del paso 4; lo impreso, toda la psicometría)', { skip: sinEjemplos }, async () => {
    await abrir('04-instrumental');
    await pulsarYEsperar('hacer', 6);
    assert.equal(estado(), 'Listo: paso 6 hecho (el análisis estadístico). Sus descargas son tuyas: te las dejo señaladas. Ojo: el Word lleva también lo del paso 4, y lo impreso (el PDF), lo de los pasos 2 a 5, que no están marcados como hechos; si no los hiciste, hazlos antes de descargarlos, o no serán los del caso («Hazlo todo por mí» hace todos los pasos en orden). Despliega la guía (▴) para seguir.');
    env.disparar(q('#analizador'), 'click');
});

test('(2027.01.06, revisión) repetir el paso del SEM del caso 5 no suma sus modelos: la comparación y el capítulo de Word, como los del caso', { skip: sinEjemplos }, async () => {
    const { SEM } = await import(new URL('src/analizador/sem-motor.js', raiz).href);
    const { ExportadorWord } = await import(new URL('src/analizador/exportador-word.js', raiz).href);
    const papeles = () => SEM._ultimos.map((/** @type {any} */ m) => m.etiquetaModelo);
    const veces = () => (ExportadorWord.generarCapitulo(G.window.ultimoAnalisis).match(/Modelo alternativo/g) || []).length;
    await abrir('05-estructural');
    await pulsarYEsperar('hacer', 2);
    assert.deepEqual(papeles(), ['Modelo alternativo', 'Modelo final']);
    assert.equal(q('#semOut .sem-reemplaza'), null, 'la primera vez, cada papel es nuevo');
    await pulsarYEsperar('hacer', 3);
    const unaVez = veces();
    assert.ok(unaVez > 0, 'el capítulo nombra sus modelos');
    await pulsarYEsperar('hacer', 2);
    assert.deepEqual(papeles(), ['Modelo alternativo', 'Modelo final'], 'otra vez, los mismos dos (hasta la 2027.01.05, cuatro)');
    assert.equal(veces(), unaVez, 'y el capítulo de Word los nombra igual');
    // (2027.01.07, revisión) y la tarjeta lo dice: hasta la 2027.01.06, el modelo de un mismo papel se reemplazaba sin decirlo
    assert.equal(q('#semOut .sem-reemplaza').textContent, 'Reemplaza en la comparación de modelos (y en el capítulo de Word) al «Modelo final» que ajustaste antes: hay un modelo de cada papel. Para compararlos, ajusta cada uno con un papel distinto en «¿Qué papel juega este modelo?».');
    assert.equal(q('#semOut .sem-reemplaza').getAttribute('role'), 'note');
    // (2027.01.08, revisión) solo en la pantalla: en la 2027.01.07 se imprimía, y lo impreso de su paso, repetido, no era el del caso
    assert.ok(q('#semOut .sem-reemplaza').classList.contains('solo-pantalla'), 'no va en lo impreso');
    assert.match(q('#semCard').textContent, /nombrar el modelo para compararlo con los de los otros papeles: hay uno de cada papel, y ajustar otra vez uno lo reemplaza\./, 'su ayuda también');
    env.disparar(q('#analizador'), 'click');
});

test('(2027.01.06, revisión) un paso con la ANCOVA sin hacer, antes del de las descargas: hecho después, la dejaría en el Word, y la guía pide repetir este; hecho y repetido, el Word vuelve a ser sin ella', { skip: sinEjemplos }, async () => {
    // el caso 2, con una comparación con covariable en el paso 3 y una correlación con su capítulo de Word en el 4
    await conCatalogo(c => {
        const e = c.casos.find((/** @type {any} */ x) => x.carpeta === '02-comparativo');
        e.guiones[2] = [{ accion: 'compararGrupos', datos: { grupo: 'Grado', numerica: 'General_I', covariable: 'Promedio de notas' } }];
        e.guiones[3] = [e.guiones[1][0], { accion: 'exportarAnalisis', datos: { word: true, carpeta: '3-asociacion' } }];
    });
    try {
        const { ExportadorWord } = await import(new URL('src/analizador/exportador-word.js', raiz).href);
        const conAncova = () => /Análisis de covarianza \(ANCOVA\)/.test(ExportadorWord.generarCapitulo(G.window.ultimoAnalisis));
        await abrir('02-comparativo');
        await pulsarYEsperar('hacer', 4);
        assert.equal(estado(), 'Listo: paso 4 hecho (el análisis estadístico). Sus descargas son tuyas: te las dejo señaladas. Ojo: lo impreso (el PDF) lleva también lo del paso 3, que no está marcado como hecho; si no lo hiciste, hazlo y después repite este (el análisis de este quita del Word la ANCOVA del paso 3), o no será el del caso («Hazlo todo por mí» hace todos los pasos en orden). Despliega la guía (▴) para seguir.');
        assert.equal(conAncova(), false, 'el Word del paso 4, sin la ANCOVA (en el caso, el análisis del 4 la quitó)');
        await pulsarYEsperar('hacer', 3);
        assert.ok(q('#cgResultado').textContent.includes('ANCOVA'), 'la ANCOVA, en su tarjeta');
        assert.equal(conAncova(), true, 'hecho ahora el 3, su ANCOVA queda en el Word del 4: de más');
        await pulsarYEsperar('hacer', 4);
        assert.equal(conAncova(), false, 'y repetido el 4, otra vez sin ella, como en el caso');
        assert.ok(q('#cgResultado').textContent.includes('ANCOVA'), 'su tarjeta sigue (lo impreso la lleva)');
    } finally {
        await catalogoDeVerdad();
        env.disparar(q('#analizador'), 'click');
    }
});

test('(2027.01.07, revisión) un caso cuyos guiones no cumplen las reglas de la guía (dos comparaciones de grupos) se abre sin «Muéstrame» ni «Hazlo por mí»', { skip: sinEjemplos }, async () => {
    // el caso 2, con una comparación por grado en el paso 3 y otra por sexo en el 4: en la página, la segunda reemplaza a la
    // primera, y lo que la guía diría de sus descargas no sería cierto (la 2027.01.06 lo leía y lo seguía, con lo marcado)
    /** @type {string[]} */
    const avisos = [];
    const avisar = console.warn;
    console.warn = (/** @type {any[]} */ ...x) => { avisos.push(x.join(' ')); };
    try {
        await conCatalogo(c => {
            const e = c.casos.find((/** @type {any} */ x) => x.carpeta === '02-comparativo');
            e.guiones[2] = [{ accion: 'compararGrupos', datos: { grupo: 'Grado', numerica: 'General_I' } }];
            e.guiones[3] = [{ accion: 'compararGrupos', datos: { grupo: 'Sexo', numerica: 'General_I' } }];
        });
    } finally {
        console.warn = avisar;
    }
    try {
        assert.deepEqual(avisos, ['[StatSim] ejemplos/02-comparativo: sin «Muéstrame» ni «Hazlo por mí» (sus guiones no cumplen las reglas de la guía): compararGrupos calcula 2 veces (en los pasos 3 y 4): en la página, cada vez reemplaza a la anterior.']);
        await abrir('02-comparativo');
        assert.equal(qa('#guiaEjemplo [data-accion-guia="mostrar"], #guiaEjemplo [data-accion-guia="hacer"], #guiaEjemplo [data-accion-guia="hacerTodo"]').length, 0, 'como la de un ejemplo sin guiones');
        assert.equal(qa('#guiaEjemplo .guia-casilla').length, 5, 'sus pasos, como siempre');
        await abrir('05-estructural');
        assert.ok(qa('#guiaEjemplo [data-accion-guia="hacer"]').length > 0, 'los demás casos, con lo suyo');
    } finally {
        await catalogoDeVerdad();
        env.disparar(q('#analizador'), 'click');
    }
});

test('(2027.01.07, revisión) el SEM y una comparación con covariable en un mismo paso: hecho después del de las descargas, el aviso pide repetir este (la ANCOVA quedaría en el Word), y así el Word es el del caso', { skip: sinEjemplos }, async () => {
    // el caso 5, con una comparación por sexo y con covariable tras sus dos modelos del SEM (lo encontró la revisión: la 2027.01.06,
    // con el SEM ya en el Word, decía «hazlo antes de descargarlos», y hecho así el Word llevaba la ANCOVA, que en el caso no)
    await conCatalogo(c => {
        const e = c.casos.find((/** @type {any} */ x) => x.carpeta === '05-estructural');
        e.guiones[1] = [...e.guiones[1], { accion: 'compararGrupos', datos: { grupo: 'Sexo', numerica: 'General_EA', covariable: 'Edad' } }];
    });
    try {
        const { ExportadorWord } = await import(new URL('src/analizador/exportador-word.js', raiz).href);
        const word = () => ExportadorWord.generarCapitulo(G.window.ultimoAnalisis);
        const conAncova = () => /Análisis de covarianza \(ANCOVA\)/.test(word());
        const modeloDelWord = () => (word().match(/Parámetros del modelo «([^»]+)»/) || [])[1];
        await abrir('05-estructural');
        await pulsarYEsperar('hacer', 3);
        assert.equal(estado(), 'Listo: paso 3 hecho (el análisis estadístico). Sus descargas son tuyas: te las dejo señaladas. Ojo: el Word y lo impreso (el PDF) llevan también lo del paso 2, que no está marcado como hecho; si no lo hiciste, hazlo y después repite este (el análisis de este quita del Word la ANCOVA del paso 2), o no serán los del caso («Hazlo todo por mí» hace todos los pasos en orden). Despliega la guía (▴) para seguir.');
        await pulsarYEsperar('hacer', 2);
        assert.ok(q('#cgResultado').textContent.includes('ANCOVA'), 'la ANCOVA, en su tarjeta');
        assert.equal(conAncova(), true, 'hecho ahora el 2, su ANCOVA queda en el Word del 3: de más');
        await pulsarYEsperar('hacer', 3);
        assert.match(estado(), /^Listo: paso 3 hecho \(el análisis estadístico\)\. Sus descargas son tuyas: te las dejo señaladas\. Despliega la guía/, 'con el 2 hecho, nada que decir');
        assert.deepEqual([conAncova(), modeloDelWord()], [false, 'Modelo final'], 'y repetido el 3, como en el caso: con el SEM, sin la ANCOVA');
        // en el orden del caso («Hazlo todo por mí»), igual
        await abrir('05-estructural');
        await pulsarYEsperar('hacerTodo');
        assert.deepEqual([conAncova(), modeloDelWord()], [false, 'Modelo final']);
    } finally {
        await catalogoDeVerdad();
        env.disparar(q('#analizador'), 'click');
    }
});

test('(2027.01.07, revisión) tras «Hazlo todo por mí», unas descargas que siguen pero llevan ya lo de un paso que hizo después lo dice: el capítulo del paso 2, con el SEM del 3', { skip: sinEjemplos }, async () => {
    // el caso 5, con el capítulo antes que los modelos del SEM: en el caso, el Word del paso 2 no los llevaba
    await conCatalogo(c => {
        const e = c.casos.find((/** @type {any} */ x) => x.carpeta === '05-estructural');
        const [sem, capitulo] = [e.guiones[1], e.guiones[2]];
        e.guiones[1] = capitulo;
        e.guiones[2] = sem;
    });
    try {
        const { ExportadorWord } = await import(new URL('src/analizador/exportador-word.js', raiz).href);
        await abrir('05-estructural');
        await pulsarYEsperar('hacerTodo');
        assert.equal(estado(), 'Listo: se repitieron los pasos 2 y 3, como en el caso. Te dejo señaladas sus descargas. De las del paso 2, el Word y lo impreso (el PDF) llevan también lo del paso 3, que en el caso viene después: no serán los del caso (los del caso están en la pestaña «Ejemplos»).');
        assert.match(ExportadorWord.generarCapitulo(G.window.ultimoAnalisis), /Parámetros del modelo «Modelo final»/, 'en la página, el Word del paso 2 lleva el SEM del 3 (hasta la 2027.01.06, señalado como si fuera el del caso)');
    } finally {
        await catalogoDeVerdad();
        env.disparar(q('#analizador'), 'click');
    }
});

test('(2027.01.07, revisión) «Hazlo todo por mí» con las descargas de una tarjeta y las de un análisis en un mismo paso: lo nombra una vez', { skip: sinEjemplos }, async () => {
    // el caso 2, con un AFE en el paso 4, antes de su asociación: en la página siguen las del AFE y las del análisis del 4
    await conCatalogo(c => {
        const e = c.casos.find((/** @type {any} */ x) => x.carpeta === '02-comparativo');
        e.guiones[3] = [{ accion: 'calcularAFE', datos: { items: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'], replicas: 100 } }, ...e.guiones[3]];
    });
    try {
        await abrir('02-comparativo');
        await pulsarYEsperar('hacerTodo');
        assert.equal(estado(), 'Listo: se repitieron los pasos 2 a 4, como en el caso. Te dejo señaladas las descargas de lo que ves (las del paso 4). Cada análisis reemplaza al anterior en la página: ya no están las descargas del análisis de los pasos 2 y 3; repítelos con su «Hazlo por mí» o bájalas hechas en la pestaña «Ejemplos». Repetidos ahora, el paso 2 daría lo impreso (el PDF) con lo de los pasos 3 y 4; y el 3, lo impreso (el PDF) con lo del paso 4 (en el caso, los pasos 3 y 4 vienen después): los del caso están en la pestaña «Ejemplos».', '(2027.01.08, revisión) lo de cada paso: la 2027.01.07 decía que el 3 daría lo del 3; (2027.01.09, revisión) y los de después, aparte, que concuerdan');
        assert.ok(['#afeCSV', '#afeWord', '#btnDescargarResultados', '#btnImprimirAnalizador'].every(s => q(s).classList.contains('guia-senalado')), 'las del AFE y las de la asociación, señaladas');
    } finally {
        await catalogoDeVerdad();
        env.disparar(q('#analizador'), 'click');
    }
});

test('(2027.01.07, revisión) las descargas de un mismo análisis en el último paso que se repite y en uno opcional: las dos valen, y cada botón se señala una vez', { skip: sinEjemplos }, async () => {
    // el caso 1, con el texto y el PDF de su correlación también en el paso 3 (el Word, como en el caso, en el 4)
    await conCatalogo(c => {
        const e = c.casos.find((/** @type {any} */ x) => x.carpeta === '01-correlacional');
        e.guiones[2] = [...e.guiones[2], { accion: 'exportarAnalisis', datos: { word: false, carpeta: '1-correlacion' } }];
    });
    try {
        await abrir('01-correlacional');
        await pulsarYEsperar('hacer', 3);
        assert.equal(estado(), 'Listo: paso 3 hecho (el análisis estadístico). Sus descargas son tuyas: te las dejo señaladas. Despliega la guía (▴) para seguir.');
        const descargas = ['#btnExportarWord', '#btnDescargarResultados', '#btnImprimirAnalizador'];
        assert.deepEqual(llevados.filter(x => descargas.includes(x)), ['#btnDescargarResultados', '#btnImprimirAnalizador', '#btnExportarWord'], 'las del paso 3 y, del 4, el Word: cada una, una vez');
        assert.ok(descargas.every(s => q(s).classList.contains('guia-senalado')));
        env.disparar(q('#analizador'), 'click');
        await abrir('01-correlacional');
        await pulsarYEsperar('hacerTodo');
        assert.equal(estado(), 'Listo: se repitió el paso 3, como en el caso. Te dejo señaladas sus descargas.', 'ninguna perdida (la 2027.01.06 decía que las del paso 3 ya no estaban)');
    } finally {
        await catalogoDeVerdad();
        env.disparar(q('#analizador'), 'click');
    }
});

test('(2027.01.09, revisión) una variable repetida entre las adicionales: la página hace la correlación de dos, con su capítulo de Word, y la regla del Word lo sabe', { skip: sinEjemplos }, async () => {
    // el caso 1, con su correlación pedida con la primera variable otra vez como adicional: la 2027.01.08 la daba por una matriz
    // (contaba las variables del guion), y el caso se leía sin sus guiones con un aviso que no era cierto
    /** @type {string[]} */
    const avisos = [];
    const avisar = console.warn;
    console.warn = (/** @type {any[]} */ ...x) => { avisos.push(x.join(' ')); };
    try {
        await conCatalogo(c => {
            const d = c.casos.find((/** @type {any} */ x) => x.carpeta === '01-correlacional').guiones[2][0].datos;
            d.variables = [...d.variables, d.variables[0]];
        });
    } finally {
        console.warn = avisar;
    }
    try {
        assert.deepEqual(avisos, [], 'cumple las reglas: se lee con sus guiones');
        await abrir('01-correlacional');
        await pulsarYEsperar('hacer', 3);
        assert.equal(estado(), 'Listo: paso 3 hecho (el análisis estadístico). Sus descargas son tuyas: te las dejo señaladas. Despliega la guía (▴) para seguir.');
        assert.equal(qa('#varsExtraCont select').length, 1, 'con la adicional repetida, como pide el guion');
        assert.equal(G.window.ultimoTipoAnalisis, 'correlacion', 'la correlación de las dos, no una matriz');
        assert.ok(G.window.ultimoAnalisis, 'con su capítulo de Word (lo que exporta «Exportar capítulo a Word»)');
    } finally {
        await catalogoDeVerdad();
        env.disparar(q('#analizador'), 'click');
    }
});

test('(revisión) el caso 2: el paso 4 suelto pide hacer el 3 y repetir el 4 (el 3 hace su propio análisis); tras «Hazlo todo», lo impreso del 2, solo hecho, y el 2 repetido dice que lo impreso lleva la comparación del 3', { skip: sinEjemplos }, async () => {
    await abrir('02-comparativo');
    await pulsarYEsperar('hacer', 4);
    // (la comparación de grupos va solo en lo impreso: el Word rehace la suya con las variables del análisis, y el texto no lleva tarjetas)
    assert.equal(estado(), 'Listo: paso 4 hecho (el análisis estadístico). Sus descargas son tuyas: te las dejo señaladas. Ojo: lo impreso (el PDF) lleva también lo del paso 3, que no está marcado como hecho; si no lo hiciste, hazlo y después repite este (el paso 3 hace su propio análisis, que reemplaza al de este), o no será el del caso («Hazlo todo por mí» hace todos los pasos en orden). Despliega la guía (▴) para seguir.');
    await pulsarYEsperar('hacerTodo');
    assert.equal(estado(), 'Listo: se repitieron los pasos 2 a 4, como en el caso. Te dejo señaladas las descargas de lo que ves (las del paso 4). Cada análisis reemplaza al anterior en la página: ya no están las descargas del análisis de los pasos 2 y 3; repítelos con su «Hazlo por mí» o bájalas hechas en la pestaña «Ejemplos». Repetido ahora, el paso 2 daría lo impreso (el PDF) con lo del paso 3, que en el caso viene después: el del caso está en la pestaña «Ejemplos».');
    await pulsarYEsperar('hacer', 2);
    assert.equal(estado(), 'Listo: paso 2 hecho (el análisis estadístico). Sus descargas son tuyas: te las dejo señaladas. Ojo: lo impreso (el PDF) lleva también lo del paso 3, que está marcado como hecho y en el caso viene después: no será el del caso (el del caso está en la pestaña «Ejemplos»; o vuelve a abrir el caso y haz este paso antes que el 3). Despliega la guía (▴) para seguir.');
    env.disparar(q('#analizador'), 'click');
});

test('(revisión) «Detener» mientras señala las descargas: el paso queda hecho y lo dice así, sin «Detenido»', { skip: sinEjemplos }, async () => {
    await abrir('01-correlacional');
    RITMO.mostrar = 150;
    try {
        q('#guiaEjemplo [data-accion-guia="hacer"][data-paso="3"]').click();
        await esperar(() => /^Paso 4 · Esto es tuyo: /.test(estado()), 120000);   // (sus descargas son las del paso 4)
        q('#guiaEjemplo [data-accion-guia="detener"]').click();
        await esperar(() => !ocupada());
        assert.equal(estado(), 'Listo: paso 3 hecho (el análisis estadístico). No te señalé sus descargas: lo detuviste. Despliega la guía (▴) para seguir.');
        assert.equal(q('#guiaPaso3').checked, true, 'el paso, hecho y marcado');
        assert.equal(qa('.guia-resaltado').length + qa('.guia-senalado').length, 0, 'sin nada resaltado ni señalado');
        assert.equal(q('#guiaEjemploEstado').classList.contains('guia-estado-error'), false);
    } finally {
        RITMO.mostrar = 0;
    }
});

test('(revisión) un Esc que usó otra cosa (cerrar la ayuda de un gráfico) no detiene la guía; uno suelto, sí', { skip: sinEjemplos }, async () => {
    await abrir('01-correlacional');
    RITMO.hacer = 120;
    /** Lo que hace la ayuda de un gráfico abierta: usa el Esc. @param {any} ev */
    const ayudaAbierta = ev => { if (ev.key === 'Escape') ev.preventDefault(); };
    try {
        q('#guiaEjemplo [data-accion-guia="hacer"][data-paso="3"]').click();
        await esperar(() => /^Paso 3 · /.test(estado()));
        // (revisión) la ayuda de los gráficos nace con el primero (graficos.js), con la guía ya trabajando: su oyente, en el
        // documento, llega después del de la guía; el de la guía, en la ventana, oye igual después (con el suyo en el
        // documento, como hasta la revisión, lo oía antes y se detenía)
        env.document.addEventListener('keydown', ayudaAbierta);
        const ev = new Evento('keydown', { bubbles: true, cancelable: true }); /** @type {any} */ (ev).key = 'Escape';
        env.document.dispatchEvent(ev);
        assert.equal(ev.defaultPrevented, true);
        await esperar(() => !ocupada(), 120000);
        assert.match(estado(), /^Listo: paso 3 hecho/, 'siguió hasta el final');
    } finally {
        env.document.removeEventListener('keydown', ayudaAbierta);
        RITMO.hacer = 0;
    }
    env.disparar(q('#analizador'), 'click');
});
