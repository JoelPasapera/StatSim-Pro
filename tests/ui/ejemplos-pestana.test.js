// @ts-check
// tests/ui/ejemplos-pestana.test.js — (2027.01.02) la pestaña «Ejemplos» de extremo a extremo sobre index.html (sin
// navegador): el menú y las entradas que llevan a ella (la portada, Ayuda y las cabeceras del Simulador y del Analizador); la
// galería con los casos de ejemplos/indice.json; la vista de cada caso con sus archivos (cada descarga, el archivo de su
// carpeta) y su README; el .zip del caso, con los mismos bytes que su carpeta; «Abrir en StatSim», que deja la página como
// la dejó el caso (la base del Simulador, bit a bit; los datos y la configuración de la investigación del Analizador) y la
// guía con sus pasos; cancelar; y lo que pasa cuando falta algo (el catálogo, el README, un archivo de otra versión).
// Los archivos se sirven de la carpeta del proyecto, como lo haría el sitio publicado.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearEntorno } from './minidom.js';
import { CASOS } from '../navegador/ejemplos.mjs';
import { leerProyecto } from '../../src/proyecto/paquete.js';
import { baseDesdeArchivos } from '../../src/core/data/base-archivos.js';
import { listarZip, extraerZip } from '../../src/core/data/zip/lector.js';
import { unirTrozos } from '../../src/core/data/zip/escritor.js';

const raiz = new URL('../../', import.meta.url);
const carpetaRaiz = fileURLToPath(raiz);
const ejemplos = path.join(carpetaRaiz, 'ejemplos');
const hayEjemplos = fs.existsSync(path.join(ejemplos, 'indice.json'));
/** @type {any} */ let env;
/** @type {any} */ let pestana;
/** @type {any} */ const G = globalThis;
/** @type {string[]} */ const pedidos = [];
/** @type {string[]} */ const preguntas = [];
/** Lo que el sitio sirve distinto (para los casos de error): ruta → status o bytes. @type {Map<string, number | Buffer>} */
const trampas = new Map();
/** Lo que el sitio tarda en servir (ms), por ruta. @type {Map<string, number>} */
const retrasos = new Map();
const q = (/** @type {string} */ sel) => env.document.querySelector(sel);
const qa = (/** @type {string} */ sel) => [...env.document.querySelectorAll(sel)];
const toast = () => q('#toast').textContent;
const activa = () => qa('.section.active').map(s => s.id).join(',');
/** @param {() => any} cond @param {number} [ms] */
const esperar = async (cond, ms = 60000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error('tiempo de espera agotado'); await new Promise(r => setTimeout(r, 15)); } };
const catalogo = () => JSON.parse(fs.readFileSync(path.join(ejemplos, 'indice.json'), 'utf8'));

/** El sitio: los archivos de la carpeta del proyecto (sin salir de ella), con su ?v= ignorado. @param {string} url */
async function servir(url) {
    pedidos.push(url);
    const relativa = decodeURIComponent(String(url).split('?')[0]);
    if (/^[a-z]+:/i.test(relativa) || relativa.split('/').includes('..')) throw new TypeError('Failed to fetch');
    const retraso = retrasos.get(relativa);
    if (retraso) await new Promise(r => setTimeout(r, retraso));
    const trampa = trampas.get(relativa);
    const ruta = path.join(carpetaRaiz, ...relativa.split('/'));
    const status = typeof trampa === 'number' ? trampa : fs.existsSync(ruta) ? 200 : 404;
    const b = Buffer.isBuffer(trampa) ? trampa : status === 200 ? fs.readFileSync(ruta) : Buffer.alloc(0);
    return { ok: status === 200, status, text: async () => b.toString('utf8'), json: async () => JSON.parse(b.toString('utf8')), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
}

before(async () => {
    env = crearEntorno(fs.readFileSync(new URL('index.html', raiz), 'utf8'));
    env.document.readyState = 'interactive';
    G.fetch = servir;
    G.confirm = (/** @type {string} */ p) => { preguntas.push(p); return true; };
    await import(new URL('src/main.js', raiz).href);
    await new Promise(r => setTimeout(r, 0));
    env.document.readyState = 'complete';
    env.disparar(env.document, 'DOMContentLoaded', { bubbles: false });
});

test('el menú lleva a «Ejemplos», entre el Analizador y Ayuda; la portada, Ayuda y las cabeceras, también', () => {
    assert.deepEqual(qa('.nav-link').map(a => a.getAttribute('href')), ['#explorador', '#buscador', '#simulador', '#analizador', '#ejemplos', '#ayuda', '#contacto']);
    const entradas = qa('a[data-ir-a="ejemplos"]');
    assert.equal(entradas.length, 4, 'la portada, la tarjeta de Ayuda y las cabeceras del Simulador y del Analizador');
    assert.ok(entradas.some(a => a.closest('#heroPortada')) && entradas.some(a => a.closest('#ayuda')) && entradas.some(a => a.closest('#simulador')) && entradas.some(a => a.closest('#analizador')));
    assert.ok(q('#ejemplos #ejemplosEstado[role="status"]') && q('#ejemplos #ejemplosGaleria') && q('#ejemplos #ejemplosCaso[hidden]'));
    assert.ok(q('#ejemplos .orden-guia .orden-guia-titulo'), 'con su «Para qué sirve»');
});

test('(revisión) si el código de la pestaña no se pudo cargar, lo dice en ella y ofrece recargar sin caché; la próxima vez se vuelve a pedir', { skip: !hayEjemplos && 'sin ejemplos/indice.json' }, async () => {
    const { SECCIONES } = await import(new URL('src/version.js', raiz).href);
    const s = SECCIONES.find((/** @type {any} */ x) => x.id === 'ejemplos');
    const cargar = s.cargar;
    s.cargar = () => Promise.reject(new TypeError('Failed to fetch dynamically imported module'));
    const errores = console.error;
    console.error = () => {};
    try {
        q('.nav-link[href="#ejemplos"]').click();
        await esperar(() => q('#ejemplosEstado').classList.contains('aviso-error'));
    } finally { s.cargar = cargar; console.error = errores; }
    assert.match(q('#ejemplosEstado').textContent, /^No se pudo cargar esta pestaña \(Failed to fetch dynamically imported module\)\. Vuelve a cargar la página sin caché/);
    const boton = q('#ejemplosEstado button');
    assert.ok(boton && boton.textContent === 'Recargar sin caché', 'con el botón para recargar');
    // la próxima vez que se muestra, se vuelve a pedir (tras recargar, ya sin el fallo)
    q('.nav-link[href="#ayuda"]').click();
    q('.nav-link[href="#ejemplos"]').click();
    await esperar(() => qa('#ejemplosGaleria .ejemplo-tarjeta').length > 0);
    assert.equal(q('#ejemplosEstado').textContent, '');
    assert.ok(!q('#ejemplosEstado').classList.contains('aviso-error'));
    q('.nav-link[href="#simulador"]').click();
});

test('desde la portada: «Ver ejemplos terminados» muestra la pestaña y carga la galería', { skip: !hayEjemplos && 'sin ejemplos/indice.json' }, async () => {
    // (que la portada se retire lo hace su guion de index.html, que aquí no corre: lo comprueba Chromium,
    // tests/navegador/pestana-ejemplos.mjs)
    q('#heroPortada a[data-ir-a="ejemplos"]').click();
    assert.equal(activa(), 'ejemplos');
    await esperar(() => qa('#ejemplosGaleria .ejemplo-tarjeta').length > 0);
    ({ pestana } = await import(new URL('src/ejemplos/index.js', raiz).href));
    assert.ok(pestana, 'la pestaña se montó al cargarse su módulo');
    const c = catalogo();
    assert.deepEqual(qa('.ejemplo-tarjeta').map(t => t.getAttribute('data-carpeta')), CASOS, 'los cinco casos, en su orden');
    assert.deepEqual(qa('.ejemplo-titulo').map(h => h.textContent), c.casos.map((/** @type {any} */ e) => e.titulo));
    assert.equal(q('#ejemplosEstado').textContent, '', 'sin el aviso de «Cargando»');
    assert.equal(q('#ejemplosEstado').hidden, false, 'vacío, pero a la vista de un lector de pantalla (lo que se escriba después, se lee)');
    assert.ok(pedidos.some(u => /^ejemplos\/indice\.json\?v=\d{4}\.\d{2}\.\d{2}$/.test(u)), 'el catálogo, con la versión de la página');
    // las cabeceras de las secciones también llevan aquí
    q('.nav-link[href="#simulador"]').click();
    q('#simulador a[data-ir-a="ejemplos"]').click();
    assert.equal(activa(), 'ejemplos');
});

test('(revisión) un README que tarda no pinta su caso encima del que se pidió después', { skip: !hayEjemplos && 'sin ejemplos/indice.json' }, async () => {
    retrasos.set('ejemplos/01-correlacional/README.md', 120);
    try {
        const lento = pestana.verCaso('01-correlacional');
        await new Promise(r => setTimeout(r, 20));   // ya se pidió su README
        assert.equal(await pestana.verCaso('03-predictivo'), true);
        assert.equal(await lento, false, 'el lento llega tarde y no se pinta');
    } finally { retrasos.delete('ejemplos/01-correlacional/README.md'); }
    assert.equal(q('#ejemplosCaso .ejemplo-caso').getAttribute('data-carpeta'), '03-predictivo');
    assert.equal(q('#ejemplosEstado').textContent, '');
    pestana.volver('03-predictivo');
});

test('sin su README, la vista del caso sale igual, con sus archivos y el aviso; y vuelve a pedirlo la próxima vez', { skip: !hayEjemplos && 'sin ejemplos/indice.json' }, async () => {
    const e = catalogo().casos[4];
    const { montarEjemplos } = await import(new URL('src/ejemplos/index.js', raiz).href);
    assert.equal(montarEjemplos(), null, 'la pestaña se monta una sola vez');
    trampas.set(`ejemplos/${e.carpeta}/README.md`, 500);
    try {
        assert.equal(await pestana.verCaso(e.carpeta), true);
        assert.equal(qa('#ejemplosCaso a[download]').length, e.archivos.length);
        assert.match(q('#ejemplosCaso .ejemplo-sin-leeme').textContent, /No se pudo cargar la explicación del caso \(su README\.md\): No se pudo descargar «README\.md»: el sitio respondió 500\. Sus archivos sí están a la mano\./);
    } finally { trampas.delete(`ejemplos/${e.carpeta}/README.md`); }
    await pestana.verCaso(e.carpeta);
    assert.equal(q('#ejemplosCaso .ejemplo-sin-leeme'), null);
    assert.ok(qa('#ejemplosCaso .ejemplo-seccion').length > 3, 'el README, ahora sí');
    pestana.volver(e.carpeta);
});

test('la vista de cada caso: sus archivos (cada descarga, el de su carpeta) y su README sin su tabla de archivos', { skip: !hayEjemplos && 'sin ejemplos/indice.json' }, async () => {
    const desde = pedidos.length;
    for (const e of catalogo().casos) {
        q(`.ejemplo-tarjeta [data-accion-ejemplo="ver"][data-carpeta="${e.carpeta}"]`).click();
        await esperar(() => !q('#ejemplosCaso').hidden && q('#ejemplosCaso .ejemplo-caso') && q('#ejemplosCaso .ejemplo-caso').getAttribute('data-carpeta') === e.carpeta);
        assert.equal(q('#ejemplosGaleria').hidden, true);
        assert.equal(q('.ejemplo-caso-titulo').textContent, e.titulo);
        const descargas = qa('#ejemplosCaso a[download]');
        assert.equal(descargas.length, e.archivos.length, `${e.carpeta}: una descarga por archivo`);
        for (const a of descargas) {
            const href = a.getAttribute('href');
            const relativa = decodeURIComponent(href.split('?')[0]);
            assert.ok(relativa.startsWith(`ejemplos/${e.carpeta}/`) && fs.existsSync(path.join(carpetaRaiz, ...relativa.split('/'))), `${href}: un archivo del caso`);
            assert.equal(a.getAttribute('download'), relativa.split('/').pop());
        }
        assert.equal(qa('#ejemplosCaso a[target="_blank"][aria-label^="Ver "]').length, e.archivos.filter((/** @type {any} */ x) => x.ruta.endsWith('.pdf')).length, 'cada PDF, también para verlo');
        const secciones = qa('#ejemplosCaso .ejemplo-seccion-titulo').map(h => h.textContent);
        assert.ok(secciones.includes('Qué se hizo en el Analizador') && secciones.includes('Resultados') && !secciones.includes('Archivos'), `${e.carpeta}: ${secciones.join(' | ')}`);
        assert.ok(qa('#ejemplosCaso .ejemplo-leeme table').length >= 2, 'con sus tablas');
        q('#ejemplosCaso [data-accion-ejemplo="volver"]').click();
        assert.equal(q('#ejemplosCaso').hidden, true);
        assert.equal(q('#ejemplosGaleria').hidden, false);
    }
    const leemes = pedidos.slice(desde).filter(u => /README\.md/.test(u));
    assert.equal(new Set(leemes).size, leemes.length, 'cada README se pide una sola vez (después, de memoria)');
    assert.equal(leemes.length, CASOS.length - 3, 'los de los casos 1, 3 y 5 ya se habían leído');
});

test('«Descargar todo»: el .zip del caso, con su README, su verificación y sus archivos, byte a byte', { skip: !hayEjemplos && 'sin ejemplos/indice.json' }, async () => {
    const e = catalogo().casos[0];
    await pestana.verCaso(e.carpeta);
    const antes = env.descargas.length;
    q('#ejemplosCaso [data-accion-ejemplo="zip"]').click();
    await esperar(() => env.descargas.length > antes);
    const blob = env.descargas[env.descargas.length - 1];
    assert.equal(blob.type, 'application/zip');
    const zip = unirTrozos(blob.partes);
    const entradas = listarZip(zip);
    const rutas = ['README.md', 'verificacion.json', ...e.archivos.map((/** @type {any} */ a) => a.ruta)];
    assert.deepEqual(entradas.map(x => x.nombre), rutas.map(r => `${e.carpeta}/${r}`));
    for (const x of entradas) {
        const enDisco = fs.readFileSync(path.join(ejemplos, ...x.nombre.split('/')));
        assert.ok(Buffer.from(await extraerZip(zip, x)).equals(enDisco), `${x.nombre}, byte a byte`);
        assert.equal(x.metodo, /\.(pdf|docx|xlsx|statsim)$/.test(x.nombre) ? 0 : 8, `${x.nombre}: ${/\.(pdf|docx|xlsx|statsim)$/.test(x.nombre) ? 'ya viene comprimido: sin volver a comprimir' : 'comprimido'}`);
    }
    assert.match(toast(), new RegExp(`descargado entero: ejemplo-${e.carpeta}\\.zip`));
    assert.match(q('#ejemplosCaso .ejemplo-progreso').textContent, /Listo/);
});

test('(revisión) el progreso del .zip se dice en su caso, no en el que esté abierto; y su botón sigue ocupado al volver a él', { skip: !hayEjemplos && 'sin ejemplos/indice.json' }, async () => {
    // cada archivo del Simulador del caso 2 tarda: el .zip dura más de un segundo
    for (const nombre of fs.readdirSync(path.join(ejemplos, '02-comparativo', 'simulador'))) retrasos.set(`ejemplos/02-comparativo/simulador/${nombre}`, 150);
    const antes = env.descargas.length;
    try {
        await pestana.verCaso('02-comparativo');
        const zip = pestana.descargarTodo('02-comparativo');
        await new Promise(r => setTimeout(r, 30));
        assert.equal(q('#ejemplosCaso [data-accion-ejemplo="zip"]').getAttribute('aria-disabled'), 'true', 'ocupado, sin soltar el foco');
        assert.equal(q('#ejemplosCaso [data-accion-ejemplo="zip"]').disabled, false);
        pestana.volver('02-comparativo');
        await pestana.verCaso('04-instrumental');
        await new Promise(r => setTimeout(r, 330));   // mientras tanto, el .zip del caso 2 avanza
        assert.equal(q('#ejemplosCaso .ejemplo-caso').getAttribute('data-carpeta'), '04-instrumental');
        assert.equal(q('#ejemplosCaso .ejemplo-progreso').textContent, '', 'el caso 4 no dice nada del .zip del 2');
        await pestana.verCaso('02-comparativo');
        assert.equal(q('#ejemplosCaso [data-accion-ejemplo="zip"]').getAttribute('aria-disabled'), 'true', 'de vuelta en el caso 2, su botón sigue ocupado');
        assert.match(q('#ejemplosCaso .ejemplo-progreso').textContent, /Preparando el \.zip/);
        q('#ejemplosCaso [data-accion-ejemplo="zip"]').click();   // ocupado: no empieza otro
        assert.equal(await zip, true);
        assert.equal(env.descargas.length, antes + 1, 'un solo .zip');
        assert.equal(q('#ejemplosCaso [data-accion-ejemplo="zip"]').hasAttribute('aria-disabled'), false, 'libre al terminar');
        assert.match(q('#ejemplosCaso .ejemplo-progreso').textContent, /Listo/);
    } finally { retrasos.clear(); }
});

test('(revisión) «Ver los casos» lleva a la galería aunque haya un caso abierto', { skip: !hayEjemplos && 'sin ejemplos/indice.json' }, async () => {
    await pestana.verCaso('01-correlacional');
    const enlace = q('#ejemplos .ana-ctas [data-accion-ejemplo="galeria"]');
    assert.ok(enlace);
    enlace.click();
    assert.equal(q('#ejemplosCaso').hidden, true);
    assert.equal(q('#ejemplosGaleria').hidden, false);
});

test('«Abrir en StatSim»: la página queda como la dejó el caso, en el Analizador, con la guía de sus pasos', { skip: !hayEjemplos && 'sin ejemplos/indice.json' }, async () => {
    const e = catalogo().casos.find((/** @type {any} */ x) => x.carpeta === '04-instrumental');
    const proyecto = await leerProyecto(new Uint8Array(fs.readFileSync(path.join(ejemplos, e.carpeta, 'proyecto.statsim'))));
    const sim = /** @type {any} */ (proyecto.partes.find((/** @type {any} */ p) => p.seccion === 'simulador'));
    const ana = /** @type {any} */ (proyecto.partes.find((/** @type {any} */ p) => p.seccion === 'analizador'));
    const guardada = baseDesdeArchivos(sim.archivos, 'base', { maximoFilas: 1e6 });
    const investigacion = JSON.parse(new TextDecoder().decode(ana.archivos.get('etiquetas.json'))).investigacion;
    q('.nav-link[href="#ejemplos"]').click();
    pestana.volver();
    preguntas.length = 0;
    const desde = pedidos.length;
    const boton = q(`.ejemplo-tarjeta [data-accion-ejemplo="abrir"][data-carpeta="${e.carpeta}"]`);
    boton.click();
    boton.click();   // un doble clic: una sola apertura
    await esperar(() => q('#guiaEjemplo'));
    assert.equal(preguntas.length, 1, 'una sola pregunta');
    assert.equal(pedidos.slice(desde).filter(u => u.startsWith(`ejemplos/${e.carpeta}/proyecto.statsim`)).length, 1, 'el proyecto se pide una sola vez');
    assert.match(preguntas[0], /^Abrir el caso 4 \(«Propiedades psicométricas[^»]*»\) reemplazará lo que tienes ahora en el Simulador, el Analizador y la V de Aiken\. .*«Guardar proyecto»/);
    assert.equal(activa(), 'analizador', 'lleva al Analizador, donde están sus pasos');
    // la base del Simulador, bit a bit
    const base = G.generadorDatos.datosGenerados;
    assert.equal(base.n, guardada.n);
    assert.deepEqual(base.nombres(), guardada.nombres());
    for (const c of guardada.columnas) {
        const o = base.columna(c.nombre);
        assert.ok(Buffer.from(o.datos.buffer, o.datos.byteOffset, o.datos.byteLength).equals(Buffer.from(c.datos.buffer, c.datos.byteOffset, c.datos.byteLength)), `${c.nombre}, bit a bit`);
    }
    // los datos del Analizador y su configuración de la investigación (lo que el paso 1 dejó hecho)
    const { estadoDeLosDatos } = await import(new URL('src/analizador/ui/carga.js', raiz).href);
    assert.equal(estadoDeLosDatos().filas.length, guardada.n);
    assert.ok(investigacion && investigacion.titulo, 'el proyecto del caso trae la configuración de la investigación');
    assert.deepEqual({ titulo: q('#tituloTesis').value, unidad: q('#unidadAnalisis').value, lugar: q('#lugarContexto').value }, investigacion);
    assert.match(toast(), /^Proyecto abierto: /);
    // la guía
    const guia = q('#guiaEjemplo');
    assert.ok(guia.classList.contains('solo-pantalla'), 'no se imprime');
    assert.equal(qa('#guiaEjemplo .guia-casilla').length, e.pasos.length);
    assert.deepEqual(qa('#guiaEjemplo .guia-casilla').map(c => c.checked), e.pasos.map((/** @type {any} */ _, /** @type {number} */ i) => i + 1 < e.repetir.desde));
    assert.equal(q('#guiaEjemplo .guia-progreso').textContent, `1 de ${e.pasos.length}`);
    assert.match(q('#guiaEjemplo .guia-nota').textContent, /repite los pasos 2 a 6 en el Analizador \(la V de Aiken vuelve con sus valoraciones/);
    assert.equal(qa('#guiaEjemplo .guia-paso-repetir').length, e.repetir.hasta - e.repetir.desde + 1);
});

test('la guía: se marca, se pliega, vuelve al caso y se cierra', { skip: !hayEjemplos && 'sin ejemplos/indice.json' }, async () => {
    const casilla = qa('#guiaEjemplo .guia-casilla')[1];
    casilla.checked = true;
    env.disparar(casilla, 'change');
    assert.match(q('#guiaEjemplo .guia-progreso').textContent, /^2 de \d+$/);
    assert.ok(casilla.closest('.guia-paso').classList.contains('marcado'));
    q('#guiaEjemplo [data-accion-guia="plegar"]').click();
    assert.ok(q('#guiaEjemplo').classList.contains('plegada') && q('#guiaEjemploCuerpo').hidden);
    assert.equal(q('#guiaEjemplo [data-accion-guia="plegar"]').getAttribute('aria-expanded'), 'false');
    q('#guiaEjemplo [data-accion-guia="plegar"]').click();
    assert.equal(q('#guiaEjemploCuerpo').hidden, false);
    q('#guiaEjemplo [data-accion-guia="caso"]').click();
    await esperar(() => activa() === 'ejemplos' && !q('#ejemplosCaso').hidden);
    assert.equal(q('#ejemplosCaso .ejemplo-caso').getAttribute('data-carpeta'), '04-instrumental');
    assert.ok(q('#guiaEjemplo'), 'la guía sigue a la vista');
    q('#guiaEjemplo [data-accion-guia="cerrar"]').click();
    assert.equal(q('#guiaEjemplo'), null);
});

test('(revisión) la guía de otro caso reemplaza a la anterior; abrir otro proyecto la cierra; y abrir dos a la vez se dice', { skip: !hayEjemplos && 'sin ejemplos/indice.json' }, async () => {
    // mostrarGuia por sí sola (sin abrir el proyecto, que ya cierra la anterior): una sola guía
    const { mostrarGuia, cerrarGuia } = await import(new URL('src/ejemplos/guia.js', raiz).href);
    const c = catalogo();
    mostrarGuia(c.casos[0], { alVerCaso() {} });
    mostrarGuia(c.casos[1], { alVerCaso() {} });
    assert.deepEqual(qa('.guia-ejemplo').map(g => g.getAttribute('data-carpeta')), [c.casos[1].carpeta]);
    cerrarGuia();
    assert.equal(await pestana.abrir('05-estructural'), true);
    assert.equal(await pestana.abrir('03-predictivo'), true);
    assert.deepEqual(qa('.guia-ejemplo').map(g => g.getAttribute('data-carpeta')), ['03-predictivo'], 'una sola guía, la del último caso');
    // abrir otro proyecto desde Ayuda: la guía ya no describe lo que hay en la página
    const { abrirProyecto } = await import(new URL('src/proyecto/ui.js', raiz).href);
    const bytes = fs.readFileSync(path.join(ejemplos, '01-correlacional', 'proyecto.statsim'));
    const archivo = { name: 'otro.statsim', size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    const primero = abrirProyecto(archivo);
    assert.equal(await abrirProyecto(archivo), false, 'el segundo, mientras se abre el primero, no');
    assert.equal(toast(), 'Ya se está abriendo o guardando un proyecto: espera a que termine.');
    assert.equal(await primero, true);
    assert.equal(q('#guiaEjemplo'), null, 'la guía del caso 3 se cerró');
    q('.nav-link[href="#ejemplos"]').click();
});

test('dos casos pedidos seguidos: se pinta el último; y volver a la galería deja sin efecto uno a medio cargar', { skip: !hayEjemplos && 'sin ejemplos/indice.json' }, async () => {
    const primero = pestana.verCaso('01-correlacional'), segundo = pestana.verCaso('03-predictivo');
    assert.deepEqual(await Promise.all([primero, segundo]), [false, true]);
    assert.equal(q('#ejemplosCaso .ejemplo-caso').getAttribute('data-carpeta'), '03-predictivo');
    const tercero = pestana.verCaso('02-comparativo');
    pestana.volver();
    assert.equal(await tercero, false);
    assert.equal(q('#ejemplosCaso').hidden, true);
    assert.equal(q('#ejemplosGaleria').hidden, false);
});

test('cancelar «Abrir en StatSim» no cambia nada', { skip: !hayEjemplos && 'sin ejemplos/indice.json' }, async () => {
    const antes = G.generadorDatos.datosGenerados;
    const confirmar = G.confirm;
    G.confirm = () => false;
    try {
        assert.equal(await pestana.abrir('01-correlacional'), false);
    } finally { G.confirm = confirmar; }
    assert.equal(G.generadorDatos.datosGenerados, antes);
    assert.equal(q('#guiaEjemplo'), null);
    assert.equal(activa(), 'ejemplos');
});

test('lo que falta: un archivo de otra versión, el README o el catálogo, con lo que hay que hacer', { skip: !hayEjemplos && 'sin ejemplos/indice.json' }, async () => {
    // un proyecto que no es el del catálogo (la caché del navegador): no se abre y se dice qué hacer
    trampas.set('ejemplos/02-comparativo/proyecto.statsim', Buffer.from('otro'));
    try {
        assert.equal(await pestana.abrir('02-comparativo'), false);
        assert.match(toast(), /No se pudo abrir el caso 2: «proyecto\.statsim» no es el de este caso .*Recargar sin caché/);
        assert.equal(q('#guiaEjemplo'), null);
    } finally { trampas.delete('ejemplos/02-comparativo/proyecto.statsim'); }
    // un archivo que falta al hacer el .zip
    trampas.set('ejemplos/03-predictivo/simulador/base_datos_simulada.sav', 404);
    try {
        await pestana.verCaso('03-predictivo');
        assert.equal(await pestana.descargarTodo('03-predictivo'), false);
        assert.match(toast(), /No se pudo preparar el \.zip del caso 3: No se pudo descargar «simulador\/base_datos_simulada\.sav»: el sitio respondió 404/);
        assert.equal(q('#ejemplosCaso [data-accion-ejemplo="zip"]').disabled, false, 'el botón vuelve a estar disponible');
    } finally { trampas.delete('ejemplos/03-predictivo/simulador/base_datos_simulada.sav'); }
    // sin el catálogo (un sitio publicado sin la carpeta): lo dice, y «Volver a intentarlo» lo vuelve a pedir
    pestana.volver();
    trampas.set('ejemplos/indice.json', 404);
    try {
        assert.equal(await pestana.cargar(), null);
        assert.match(q('#ejemplosEstado').textContent, /Este sitio no trae los ejemplos: falta la carpeta «ejemplos\/»/);
        assert.ok(q('#ejemplosEstado').classList.contains('aviso-error'));
        assert.ok(q('#ejemplosGaleria [data-accion-ejemplo="reintentar"]'));
    } finally { trampas.delete('ejemplos/indice.json'); }
    q('#ejemplosGaleria [data-accion-ejemplo="reintentar"]').click();
    await esperar(() => qa('#ejemplosGaleria .ejemplo-tarjeta').length === CASOS.length);
    assert.equal(q('#ejemplosEstado').textContent, '');
    assert.ok(!q('#ejemplosEstado').classList.contains('aviso-error'));
    // un catálogo con otra forma: el mensaje del catálogo
    trampas.set('ejemplos/indice.json', Buffer.from('{"formato":99}'));
    try {
        assert.equal(await pestana.cargar(), null);
        assert.match(q('#ejemplosEstado').textContent, /no tiene la forma que esta versión sabe leer/);
    } finally { trampas.delete('ejemplos/indice.json'); }
    await pestana.cargar();
});
