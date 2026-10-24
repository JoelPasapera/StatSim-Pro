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
    assert.equal(estado(), 'Listo: se repitieron los pasos 2 y 3, como en el caso. Te dejo señaladas las descargas de lo que ves (las del paso 3). Cada análisis reemplaza al anterior en la página: las descargas del paso 2 ya no están; repítelo con su «Hazlo por mí» o bájalas hechas en la pestaña «Ejemplos».');
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
