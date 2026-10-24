// @ts-check
// tests/navegador/pestana-ejemplos.mjs — (2027.01.02) la pestaña «Ejemplos» en Chromium, como la usaría una persona: desde la
// portada («Ver ejemplos terminados», que la retira), la galería, la vista de cada caso (cada enlace de descarga, servido por
// el sitio), «Descargar todo» (el .zip que baja el navegador, con los bytes de su carpeta), «Abrir en StatSim» (la página
// queda en el Analizador con los datos y la configuración de la investigación del caso, y la guía a la vista), y en un
// teléfono de 360 px: nada se sale de la pantalla y la guía empieza plegada. Sin errores en la página. (Revisión) Y el foco
// no se pierde (un botón ocupado lo conserva; al cerrar la guía con el teclado, pasa al título de la sección), y a cualquier
// ancho, al abrir un caso su comienzo queda bajo la cabecera fija, que no es más alta que en la 2027.01.01.
//
//     node tests/navegador/pestana-ejemplos.mjs
//
// Necesita Playwright con Chromium (como tests/navegador/ejemplos.mjs); sin él, dice cómo y termina sin error.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirPagina, prepararChromium } from './entorno.mjs';
import { listarZip, extraerZip } from '../../src/core/data/zip/lector.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/** @type {string[]} */
const fallos = [];
/** Lo comprobado: ✓ o ✗ y por qué. @param {boolean} ok @param {string} que */
function comprobar(ok, que) {
    console.log(`${ok ? '✓' : '✗'} ${que}`);
    if (!ok) fallos.push(que);
}

/** Lo que sale de la pantalla a lo ancho (0: nada). @param {any} pagina */
const desborde = pagina => pagina.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function enEscritorio() {
    const { pagina, errores, cerrar } = await abrirPagina({ raiz });
    try {
        const catalogo = JSON.parse(fs.readFileSync(path.join(raiz, 'ejemplos', 'indice.json'), 'utf8'));
        await pagina.click('#heroPortada a[data-ir-a="ejemplos"]');
        await pagina.waitForSelector('#ejemplosGaleria .ejemplo-tarjeta');
        comprobar(await pagina.evaluate(() => document.getElementById('heroPortada')?.classList.contains('oculto') && document.getElementById('ejemplos')?.classList.contains('active') && location.hash === '#ejemplos'),
            'desde la portada, «Ver ejemplos terminados» retira la portada y abre la pestaña (con #ejemplos en la dirección)');
        const tarjetas = await pagina.$$eval('.ejemplo-tarjeta', (/** @type {Element[]} */ ts) => ts.map(t => t.getAttribute('data-carpeta')));
        comprobar(JSON.stringify(tarjetas) === JSON.stringify(catalogo.casos.map((/** @type {any} */ e) => e.carpeta)), `la galería, con los ${catalogo.casos.length} casos del catálogo`);
        for (const e of catalogo.casos) {
            await pagina.click(`.ejemplo-tarjeta [data-accion-ejemplo="ver"][data-carpeta="${e.carpeta}"]`);
            await pagina.waitForSelector(`#ejemplosCaso .ejemplo-caso[data-carpeta="${e.carpeta}"]`);
            // cada enlace de la vista (las descargas y los «Ver»), servido por el sitio con los bytes del catálogo
            const enlaces = await pagina.$$eval('#ejemplosCaso a[href^="ejemplos/"]', (/** @type {HTMLAnchorElement[]} */ as) => as.map(a => a.getAttribute('href')));
            const respuestas = await pagina.evaluate(async (/** @type {string[]} */ hrefs) => Promise.all(hrefs.map(async h => { const r = await fetch(h); return [h, r.status, (await r.arrayBuffer()).byteLength]; })), enlaces);
            const tamanos = new Map(e.archivos.map((/** @type {any} */ a) => [`ejemplos/${e.carpeta}/${a.ruta}`, a.bytes]));
            const malos = respuestas.filter((/** @type {any[]} */ [h, s, n]) => s !== 200 || (tamanos.has(decodeURIComponent(h.split('?')[0])) && tamanos.get(decodeURIComponent(h.split('?')[0])) !== n));
            comprobar(enlaces.length >= e.archivos.length && malos.length === 0, `${e.carpeta}: sus ${enlaces.length} enlaces responden con su archivo${malos.length ? ` (fallan: ${malos.map((/** @type {any[]} */ m) => m[0]).join(', ')})` : ''}`);
            const secciones = await pagina.$$eval('#ejemplosCaso .ejemplo-seccion-titulo', (/** @type {Element[]} */ hs) => hs.map(h => h.textContent));
            comprobar(secciones.includes('Resultados') && !secciones.includes('Archivos'), `${e.carpeta}: su README, sin su tabla de archivos (${secciones.length} secciones)`);
            await pagina.click('#ejemplosCaso [data-accion-ejemplo="volver"]');
            await pagina.waitForSelector('#ejemplosGaleria:not([hidden])');
        }
        // una descarga suelta: el archivo, con su nombre
        const e = catalogo.casos[0];
        await pagina.click(`.ejemplo-tarjeta [data-accion-ejemplo="ver"][data-carpeta="${e.carpeta}"]`);
        await pagina.waitForSelector('#ejemplosCaso [data-accion-ejemplo="zip"]');
        const [suelta] = await Promise.all([pagina.waitForEvent('download'), pagina.click('#ejemplosCaso a[download="base_datos_simulada.sav"]')]);
        comprobar(suelta.suggestedFilename() === 'base_datos_simulada.sav' && fs.readFileSync(await suelta.path()).equals(fs.readFileSync(path.join(raiz, 'ejemplos', e.carpeta, 'simulador', 'base_datos_simulada.sav'))),
            '«Descargar» de un archivo baja ese archivo, con su nombre');
        // «Descargar todo»: lo que baja el navegador
        await pagina.focus('#ejemplosCaso [data-accion-ejemplo="zip"]');
        const [descarga] = await Promise.all([pagina.waitForEvent('download'), pagina.keyboard.press('Enter')]);
        comprobar(await pagina.evaluate(() => document.activeElement === document.querySelector('#ejemplosCaso [data-accion-ejemplo="zip"]')),
            '«Descargar todo» con el teclado: el foco sigue en el botón (ocupado, no desactivado)');
        const zip = new Uint8Array(fs.readFileSync(await descarga.path()));
        const entradas = listarZip(zip);
        let iguales = 0;
        for (const x of entradas) if (Buffer.from(await extraerZip(zip, x)).equals(fs.readFileSync(path.join(raiz, 'ejemplos', ...x.nombre.split('/'))))) iguales++;
        comprobar(descarga.suggestedFilename() === `ejemplo-${e.carpeta}.zip` && entradas.length === e.archivos.length + 2 && iguales === entradas.length,
            `«Descargar todo» baja ejemplo-${e.carpeta}.zip con sus ${entradas.length} archivos, byte a byte (${iguales} iguales)`);
        // «Abrir en StatSim» (la confirmación la acepta entorno.mjs)
        await pagina.click('.ejemplo-cabecera [data-accion-ejemplo="abrir"]');
        await pagina.waitForSelector('#guiaEjemplo', { timeout: 60000 });
        const estado = await pagina.evaluate(() => ({
            seccion: document.querySelector('.section.active')?.id,
            titulo: /** @type {HTMLInputElement} */ (document.getElementById('tituloTesis')).value,
            filas: /** @type {any} */ (window).generadorDatos?.datosGenerados?.n,
            pasos: document.querySelectorAll('#guiaEjemplo .guia-casilla').length,
            visible: !!document.getElementById('guiaEjemplo')?.getBoundingClientRect().height,
        }));
        comprobar(estado.seccion === 'analizador' && estado.titulo.length > 20 && estado.filas > 0 && estado.pasos === e.pasos.length && estado.visible,
            `«Abrir en StatSim» deja la página en el Analizador con el caso (n = ${estado.filas}, «${estado.titulo.slice(0, 40)}…») y la guía de sus ${estado.pasos} pasos`);
        // cerrar la guía con el teclado: el foco pasa al título de la sección
        await pagina.focus('#guiaEjemplo [data-accion-guia="cerrar"]');
        await pagina.keyboard.press('Enter');
        comprobar(await pagina.evaluate(() => !document.getElementById('guiaEjemplo') && document.activeElement === document.querySelector('.section.active h2')),
            'cerrar la guía con el teclado deja el foco en el título de la sección, no al principio de la página');
        comprobar(await desborde(pagina) === 0, 'en el escritorio, nada se sale de la pantalla');
        comprobar(errores.length === 0, `sin errores en la página${errores.length ? `: ${errores.slice(0, 3).join(' / ')}` : ''}`);
    } finally {
        await cerrar();
    }
}

async function enTelefono() {
    const { pagina, errores, cerrar } = await abrirPagina({ raiz, ancho: 360, alto: 740 });
    try {
        await pagina.click('.nav-link[href="#ejemplos"]');
        await pagina.waitForSelector('#ejemplosGaleria .ejemplo-tarjeta');
        const galeria = await desborde(pagina);
        await pagina.click('.ejemplo-tarjeta [data-accion-ejemplo="ver"][data-carpeta="04-instrumental"]');
        await pagina.waitForSelector('#ejemplosCaso .ejemplo-caso');
        const caso = await desborde(pagina);
        await pagina.click('.ejemplo-cabecera [data-accion-ejemplo="abrir"]');
        await pagina.waitForSelector('#guiaEjemplo', { timeout: 60000 });
        const guia = await pagina.evaluate(() => {
            const g = /** @type {HTMLElement} */ (document.getElementById('guiaEjemplo'));
            const r = g.getBoundingClientRect();
            return { plegada: g.classList.contains('plegada'), dentro: r.left >= 0 && r.right <= window.innerWidth + 0.5 && r.bottom <= window.innerHeight + 0.5, alto: r.height };
        });
        comprobar(galeria === 0 && caso === 0 && await desborde(pagina) === 0, `en un teléfono de 360 px, nada se sale de la pantalla (galería ${galeria}, caso ${caso})`);
        comprobar(guia.plegada && guia.dentro && guia.alto < 200, `en el teléfono, la guía empieza plegada, dentro de la pantalla (${Math.round(guia.alto)} px de alto)`);
        comprobar(errores.length === 0, `sin errores en la página (teléfono)${errores.length ? `: ${errores.slice(0, 3).join(' / ')}` : ''}`);
    } finally {
        await cerrar();
    }
}

/** (Revisión) A cada ancho: la cabecera fija no más alta que en la 2027.01.01 y, al abrir un caso, su comienzo bajo ella. */
async function aCadaAncho() {
    // lo que medía la cabecera en la 2027.01.01 (antes de «Ejemplos» en el menú), por ancho
    const antes = { 320: 205, 375: 205, 600: 157, 800: 154, 900: 108, 1024: 108, 1280: 108 };
    const { pagina, errores, cerrar } = await abrirPagina({ raiz, ancho: 1280, alto: 800 });
    try {
        await pagina.click('.nav-link[href="#ejemplos"]');
        await pagina.waitForSelector('#ejemplosGaleria .ejemplo-tarjeta');
        /** @type {string[]} */
        const malos = [];
        for (const [ancho, maximo] of Object.entries(antes)) {
            await pagina.setViewportSize({ width: Number(ancho), height: 760 });
            if (await pagina.isVisible('#ejemplosCaso [data-accion-ejemplo="volver"]')) await pagina.click('#ejemplosCaso [data-accion-ejemplo="volver"]');
            await pagina.click('.ejemplo-tarjeta [data-accion-ejemplo="ver"][data-carpeta="01-correlacional"]');
            await pagina.waitForSelector('#ejemplosCaso .ejemplo-caso');
            await pagina.waitForTimeout(700);   // el desplazamiento suave
            const m = await pagina.evaluate(() => ({
                cabecera: document.querySelector('.header').getBoundingClientRect().bottom,
                volver: document.querySelector('#ejemplosCaso [data-accion-ejemplo="volver"]').getBoundingClientRect().top,
            }));
            if (m.cabecera > maximo + 0.5) malos.push(`${ancho} px: la cabecera mide ${Math.round(m.cabecera)} (antes ${maximo})`);
            if (m.volver < m.cabecera) malos.push(`${ancho} px: «Todos los ejemplos» queda bajo la cabecera (${Math.round(m.volver)} < ${Math.round(m.cabecera)})`);
        }
        comprobar(malos.length === 0, `de 320 a 1280 px, la cabecera no crece y el comienzo del caso queda a la vista${malos.length ? `: ${malos.join('; ')}` : ''}`);
        // «Ver los casos», con un caso abierto, vuelve a la galería
        await pagina.click('#ejemplos .ana-ctas [data-accion-ejemplo="galeria"]');
        comprobar(await pagina.evaluate(() => document.getElementById('ejemplosCaso').hidden && !document.getElementById('ejemplosGaleria').hidden),
            '«Ver los casos» lleva a la galería aunque haya un caso abierto');
        comprobar(errores.length === 0, `sin errores en la página (anchos)${errores.length ? `: ${errores.slice(0, 3).join(' / ')}` : ''}`);
    } finally {
        await cerrar();
    }
}

async function principal() {
    const { pw, motivo } = await prepararChromium();
    if (!pw) { console.log(`Se omite la pestaña «Ejemplos» en Chromium: ${motivo}.`); return; }
    if (!fs.existsSync(path.join(raiz, 'ejemplos', 'indice.json'))) { console.log('✗ falta ejemplos/indice.json (rehaz los ejemplos con «npm run ejemplos»)'); process.exit(1); }
    await enEscritorio();
    await enTelefono();
    await aCadaAncho();
    if (fallos.length) process.exit(1);
}

principal().catch(e => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
