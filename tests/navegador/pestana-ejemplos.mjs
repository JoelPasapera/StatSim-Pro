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
        // (2027.01.04) la vista del caso en papel (también con «Gráficos de fondo»): el tipo y el tamaño de cada archivo, legibles
        await pagina.emulateMedia({ media: 'print' });
        const contraste = await pagina.evaluate(() => {
            /** La luminancia relativa de un color rgb()/rgba() (sobre blanco, si es translúcido). @param {string} c */
            const lum = c => {
                const [r, g, b, a = 1] = (c.match(/[\d.]+/g) || []).map(Number);
                return [r, g, b].map(v => { const x = (v * a + 255 * (1 - a)) / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; })
                    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
            };
            const fila = /** @type {Element} */ (document.querySelector('#ejemplosCaso .ejemplo-archivo'));
            const meta = /** @type {Element} */ (document.querySelector('#ejemplosCaso .ejemplo-archivo-meta'));
            const fondo = getComputedStyle(fila).backgroundColor, tinta = getComputedStyle(meta).color;
            const [l1, l2] = [lum(fondo === 'rgba(0, 0, 0, 0)' ? 'rgb(255, 255, 255)' : fondo), lum(tinta)].sort((x, y) => y - x);
            return { fondo, tinta, razon: (l1 + 0.05) / (l2 + 0.05) };
        });
        await pagina.emulateMedia({ media: 'screen' });
        comprobar(contraste.razon >= 4.5, `al imprimir la vista de un caso, el tipo y el tamaño de cada archivo se leen (contraste ${contraste.razon.toFixed(1)}:1; ${contraste.tinta} sobre ${contraste.fondo})`);
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
        // (2027.01.04) con la base en el Analizador, nada de lo que lleva hidden se ve (los «Cancelar» y las barras de progreso
        // del AFE y la invarianza se veían: .btn y .boot-progreso tienen su propio display)
        const ocultosALaVista = await pagina.evaluate(() => [...document.querySelectorAll('[hidden]')].filter(el => getComputedStyle(el).display !== 'none').map(el => el.id || el.className));
        comprobar(ocultosALaVista.length === 0, `con el caso abierto, nada de lo que lleva hidden se ve${ocultosALaVista.length ? `: ${ocultosALaVista.join(', ')}` : ''}`);
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

/** (2027.01.04, revisión) Lo que dice la guía tras un paso, de lo más largo (su línea de estado, llena). */
const ESTADO_LARGO = 'Listo: paso 4 hecho (el análisis estadístico). Sus descargas son tuyas: te las dejo señaladas. Ojo: sus descargas llevan también lo del paso 3, que no está marcado como hecho; si no lo hiciste, hazlo y después repite este (el paso 3 hace su propio análisis, que reemplaza al de este), o no serán las del caso («Hazlo todo por mí» hace todos los pasos en orden). Despliega la guía (▴) para seguir.';
/** Un aviso largo, como el de un análisis con lo que conviene saber. */
const AVISO_LARGO = 'Análisis completado. Ten en cuenta: 12 casos con datos incompletos se excluyeron del análisis; la variable «Edad» tiene valores atípicos; el supuesto de normalidad no se cumple en dos grupos; se usó la prueba de Welch.';

/**
 * (2027.01.09, revisión) Espera a que la página se aquiete tras un cambio: lo que mide la guía (su ResizeObserver, en el cuadro
 * siguiente: --alto-cabecera, --alto-guia y --alto-guia-cabeza) cuadra con lo que se ve, y el aviso, que se coloca con eso, dejó
 * de moverse (dos medidas seguidas iguales). Con la máquina cargada (la batería corre a la vez las pruebas de Node), las esperas
 * fijas no siempre bastaban. Como mucho 5 s; después, la comprobación dice lo que vea.
 * @param {any} pagina
 */
async function hastaQueSeAquiete(pagina) {
    let antes = '';
    for (const t0 = Date.now(); Date.now() - t0 < 5000; await pagina.waitForTimeout(150)) {
        const ahora = await pagina.evaluate(() => {
            const v = (/** @type {string} */ n) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(n));
            const g = document.getElementById('guiaEjemplo'), t = document.getElementById('toast'), cabecera = document.querySelector('.header');
            const c = g && /** @type {HTMLElement | null} */ (g.querySelector('.guia-cuerpo'));
            const alto = g ? g.getBoundingClientRect().height : 0;
            const cuadra = !g || !cabecera || [[v('--alto-cabecera'), cabecera.getBoundingClientRect().bottom], [v('--alto-guia'), alto], [v('--alto-guia-cabeza'), alto - (c && !c.hidden ? c.getBoundingClientRect().height : 0)]]
                .every(([x, y]) => Math.abs(x - y) <= 1.5);
            const r = t && t.getBoundingClientRect();
            return JSON.stringify({ cuadra, aviso: r ? [r.top, r.bottom, r.left, r.right].map(Math.round) : null });
        });
        if (ahora === antes && JSON.parse(ahora).cuadra) return;
        antes = ahora;
    }
}

/**
 * (2027.01.04) Con la guía a la vista, el aviso (toast) entero en la pantalla y sin tapar la cabecera de la página (ni su
 * menú) ni la guía: con la guía a un lado, nada de ella; con la guía a todo lo ancho, donde sale sobre su lista de pasos, no
 * su cabecera ni su línea de estado. La guía, plegada o desplegada, sin llegar a la cabecera (salvo que no quepa ni con su
 * alto mínimo: 9rem plegada, 12rem desplegada) y con su línea de estado a la vista. Y un aviso oculto, oculto del todo.
 * (Revisión) A doce tamaños, de un teléfono apaisado (568 × 320, 640 × 360, 667 × 375…) al escritorio, con el aviso de abrir
 * el caso y con uno largo tras un paso (la línea de estado llena), con la guía plegada y desplegada. Hasta la revisión, el
 * aviso tapaba el menú o se salía por arriba a 568 × 320, 640 × 360 y 667 × 375; la guía desplegada llegaba al menú a
 * 800 × 520 y 880 × 540; y un aviso largo, ya oculto, seguía asomando por abajo en un teléfono. (2027.01.07, revisión) Y a
 * menos de 560 px de ancho con 320 de alto (480 × 320, 559 × 320), donde con la guía plegada y tras un paso un aviso largo
 * quedaba entero sobre la cabecera (hasta 84 px por encima de su borde a 480 × 320; hasta la 2027.01.09 aquí decía «14 px»).
 * Ahí, tras un paso (con la línea de estado llena), la guía ya llega a la cabecera en su alto mínimo: no queda sitio entre las
 * dos, y el aviso puede tapar la guía; la cabecera, nunca.
 */
async function avisosConLaGuia() {
    /** @type {string[]} */
    const malos = [];
    const TAMANOS = [[480, 320], [559, 320], [568, 320], [640, 360], [667, 375], [740, 360], [844, 390], [320, 568], [360, 740], [800, 520], [880, 540], [1000, 800], [1024, 600], [1280, 900]];
    for (const [ancho, alto] of TAMANOS) {
        const { pagina, errores, cerrar } = await abrirPagina({ raiz, ancho, alto });
        try {
            await pagina.click('.nav-link[href="#ejemplos"]');
            await pagina.waitForSelector('#ejemplosGaleria .ejemplo-tarjeta');
            await pagina.click('.ejemplo-tarjeta [data-accion-ejemplo="abrir"][data-carpeta="01-correlacional"]');
            await pagina.waitForSelector('#guiaEjemplo', { timeout: 60000 });
            await pagina.waitForFunction(() => /^Proyecto abierto/.test(document.getElementById('toast')?.textContent || ''));
            await pagina.waitForTimeout(900);   // lo que tarda en subir
            await hastaQueSeAquiete(pagina);
            const medir = () => pagina.evaluate(() => {
                const caja = (/** @type {string} */ s) => { const r = /** @type {Element} */ (document.querySelector(s)).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, alto: r.height }; };
                const g = /** @type {HTMLElement} */ (document.getElementById('guiaEjemplo'));
                return {
                    toast: caja('#toast'), cabecera: caja('.header'), guia: caja('#guiaEjemplo'), cabeza: caja('#guiaEjemplo .guia-cabecera'), conduccion: caja('#guiaEjemplo .guia-conduccion'),
                    plegada: g.classList.contains('plegada'), conEstado: !!(document.getElementById('guiaEjemploEstado')?.textContent || '').trim(),
                    rem: parseFloat(getComputedStyle(document.documentElement).fontSize), ancho: innerWidth, alto: innerHeight,
                };
            });
            /** @param {Awaited<ReturnType<typeof medir>>} m @param {string} cuando */
            const revisar = (m, cuando) => {
                const t = m.toast, g = m.guia, donde = `${ancho} × ${alto} (${cuando})`;
                const encima = (/** @type {{ top: number, bottom: number, left: number, right: number }} */ a, /** @type {typeof a} */ b) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
                const aUnLado = g.right - g.left < m.ancho - 40;
                // (2027.01.07) sin sitio entre la cabecera y la guía (que ya llega a ella, en su alto mínimo), el aviso puede tapar la guía
                const sinSitio = !aUnLado && g.top < m.cabecera.bottom - 0.5;
                if (t.top < -0.5 || t.bottom > m.alto + 0.5) malos.push(`${donde}: el aviso se sale de la pantalla (${Math.round(t.top)}–${Math.round(t.bottom)})`);
                if (t.top < m.cabecera.bottom - 0.5) malos.push(`${donde}: el aviso tapa la cabecera (empieza en ${Math.round(t.top)}; la cabecera acaba en ${Math.round(m.cabecera.bottom)})`);
                if (aUnLado ? encima(t, g) : !sinSitio && (encima(t, m.cabeza) || encima(t, m.conduccion))) malos.push(`${donde}: el aviso tapa ${aUnLado ? 'la guía' : 'la cabecera o la línea de estado de la guía'}`);
                const minimo = (m.plegada ? 9 : 12) * m.rem + 1;
                if (g.top < m.cabecera.bottom - 0.5 && g.bottom - g.top > minimo) malos.push(`${donde}: la guía ${m.plegada ? 'plegada' : 'desplegada'} llega a la cabecera (empieza en ${Math.round(g.top)}; la cabecera acaba en ${Math.round(m.cabecera.bottom)})`);
                if (g.top < -0.5) malos.push(`${donde}: la guía se sale por arriba`);
                if (m.conEstado && m.conduccion.alto < 30) malos.push(`${donde}: la línea de estado de la guía no se ve (${Math.round(m.conduccion.alto)} px)`);
            };
            revisar(await medir(), 'al abrir el caso');
            if (alto <= 500 && !(await medir()).plegada) malos.push(`${ancho} × ${alto}: en una pantalla baja, la guía no empieza plegada`);
            // tras un paso: la línea de estado llena y un aviso largo, con la guía plegada y desplegada
            for (const plegada of [true, false]) {
                await pagina.evaluate(async ({ plegada, estado, aviso }) => {
                    const g = /** @type {HTMLElement} */ (document.getElementById('guiaEjemplo'));
                    if (g.classList.contains('plegada') !== plegada) /** @type {HTMLElement} */ (g.querySelector('[data-accion-guia="plegar"]')).click();
                    /** @type {HTMLElement} */ (document.getElementById('guiaEjemploEstado')).textContent = estado;
                    const { mostrarToast } = await import('./src/shared/toast.js');
                    mostrarToast(aviso, 'warning', 60000);
                }, { plegada, estado: ESTADO_LARGO, aviso: AVISO_LARGO });
                await pagina.waitForTimeout(900);
                await hastaQueSeAquiete(pagina);
                revisar(await medir(), `tras un paso, con la guía ${plegada ? 'plegada' : 'desplegada'} y un aviso largo`);
            }
            // y oculto, del todo (un aviso más alto que lo que bajaba seguía asomando por abajo)
            await pagina.evaluate(() => /** @type {HTMLElement} */ (document.getElementById('toast')).classList.remove('show'));
            await pagina.waitForTimeout(700);
            const oculto = await pagina.evaluate(() => { const t = /** @type {HTMLElement} */ (document.getElementById('toast')); return getComputedStyle(t).visibility === 'hidden' || t.getBoundingClientRect().top >= innerHeight; });
            if (!oculto) malos.push(`${ancho} × ${alto}: el aviso, ya oculto, sigue a la vista`);
            if (errores.length) malos.push(`${ancho} × ${alto}: ${errores.slice(0, 2).join(' / ')}`);
        } finally {
            await cerrar();
        }
    }
    comprobar(malos.length === 0, `con la guía a la vista, el aviso entero en la pantalla y sin tapar la cabecera ni la guía, y la guía sin llegar a la cabecera (${TAMANOS.length} tamaños, de un teléfono apaisado al escritorio; al abrir el caso y tras un paso)${malos.length ? `: ${malos.join('; ')}` : ''}`);
}

/**
 * (2027.01.04, cuarta revisión) Sin la guía, el aviso centrado y nunca más alto que la pantalla (uno muy largo se desplaza
 * dentro de su recuadro), y oculto del todo, pero en el árbol de accesibilidad: es role="status", y oculto con visibility:
 * hidden no se anunciaba. Y con la guía abierta, al girar el teléfono y cambiar el tamaño de la ventana, lo que mide la guía
 * (--alto-cabecera, --alto-guia, --alto-guia-cabeza) la sigue, también lo que cambia dentro de ella sin cambiar su alto (una
 * línea de estado más larga con la guía desplegada en su alto máximo), sin el error «ResizeObserver loop» en la página.
 */
async function avisoSinGuiaYMedidas() {
    /** @type {string[]} */
    const malos = [];
    const MUY_LARGO = Array(5).fill(AVISO_LARGO).join(' ');   // (más de lo que cabe en un teléfono apaisado)
    const { pagina, errores, cerrar } = await abrirPagina({ raiz, ancho: 360, alto: 740 });
    try {
        await pagina.evaluate(() => { /** @type {any} */ (window).__errores = []; window.addEventListener('error', e => /** @type {any} */ (window).__errores.push(String(e.message))); });
        await pagina.click('.nav-link[href="#analizador"]');
        const caja = () => pagina.evaluate(() => { const r = /** @type {HTMLElement} */ (document.getElementById('toast')).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, ancho: innerWidth, alto: innerHeight }; });
        for (const [ancho, alto] of [[360, 740], [480, 320], [1280, 900]]) {
            await pagina.setViewportSize({ width: ancho, height: alto });
            await pagina.evaluate((/** @type {string} */ t) => import('./src/shared/toast.js').then(m => m.mostrarToast(t, 'warning', 60000)), MUY_LARGO);
            await pagina.waitForTimeout(700);
            const m = await caja();
            if (m.top < -0.5 || m.bottom > m.alto + 0.5) malos.push(`${ancho} × ${alto}, sin la guía: un aviso muy largo se sale de la pantalla (${Math.round(m.top)}–${Math.round(m.bottom)})`);
            if (Math.abs((m.left + m.right) / 2 - m.ancho / 2) > 1) malos.push(`${ancho} × ${alto}, sin la guía: el aviso no está centrado (${Math.round(m.left)}–${Math.round(m.right)})`);
            // (2027.01.05) a la vista, uno que no cabe se desplaza dentro de su recuadro (oculto, no: abajo)
            const d = await pagina.evaluate(() => { const t = /** @type {HTMLElement} */ (document.getElementById('toast')); return { sobra: t.scrollHeight > t.clientHeight + 1, y: getComputedStyle(t).overflowY }; });
            if (d.sobra && !['auto', 'scroll'].includes(d.y)) malos.push(`${ancho} × ${alto}, sin la guía: un aviso que no cabe no se desplaza (overflow-y: ${d.y})`);
            await pagina.evaluate(() => /** @type {HTMLElement} */ (document.getElementById('toast')).classList.remove('show'));
            await pagina.waitForTimeout(700);
            const o = await caja();
            if (o.top < o.alto) malos.push(`${ancho} × ${alto}: el aviso, ya oculto, asoma por abajo (empieza en ${Math.round(o.top)} de ${o.alto})`);
            // (2027.01.05, revisión) oculto, el tabulador no llega a él: con un aviso que no cabe, era una región que se desplaza
            // (overflow-y: auto), y Chromium les da el foco; se iba a un recuadro fuera de la pantalla. Desde lo último que se
            // enfoca antes de él (el pie de página), un Tab
            const antes = await pagina.evaluate(() => {
                const t = /** @type {HTMLElement} */ (document.getElementById('toast'));
                const previos = [...document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')]
                    .filter(el => (el.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING) && el.getClientRects().length > 0 && !(/** @type {HTMLButtonElement} */ (el).disabled));
                const ultimo = /** @type {HTMLElement | undefined} */ (previos[previos.length - 1]);
                if (ultimo) ultimo.focus();
                return { desde: ultimo ? ultimo.outerHTML.slice(0, 60) : '', enfocado: !!ultimo && document.activeElement === ultimo, sobra: t.scrollHeight > t.clientHeight + 1 };
            });
            await pagina.keyboard.press('Tab');
            const con = await pagina.evaluate(() => document.activeElement && document.activeElement.id);
            if (!antes.enfocado) malos.push(`${ancho} × ${alto}: no se pudo enfocar lo de antes del aviso (${antes.desde})`);
            if (con === 'toast') malos.push(`${ancho} × ${alto}: el aviso, oculto, recibe el foco con el tabulador`);
            if (alto <= 320 && !antes.sobra) malos.push(`${ancho} × ${alto}: el aviso muy largo cabe en su recuadro (la prueba del tabulador no prueba nada)`);
        }
        // (2027.01.06, revisión) una palabra más larga que su ancho (los encabezados que espera una tabla, sin espacios) se parte:
        // no se corta a la derecha (el recuadro solo se desplaza hacia abajo)
        await pagina.setViewportSize({ width: 360, height: 740 });
        await pagina.evaluate(() => import('./src/shared/toast.js').then(m => m.mostrarToast(`Encabezados esperados: ${Array(10).fill('Prueba,Escala,NumItems,Alfa').join(',')}`, 'error', 60000)));
        await pagina.waitForTimeout(700);
        const larga = await pagina.evaluate(() => { const t = /** @type {HTMLElement} */ (document.getElementById('toast')); return { visto: t.clientWidth, contenido: t.scrollWidth }; });
        if (larga.contenido > larga.visto + 1) malos.push(`360 × 740: un aviso con una palabra larga se corta a la derecha (${larga.contenido} px de texto en ${larga.visto})`);
        await pagina.evaluate(() => /** @type {HTMLElement} */ (document.getElementById('toast')).classList.remove('show'));
        await pagina.waitForTimeout(700);
        const cdp = await pagina.context().newCDPSession(pagina);
        await cdp.send('DOM.enable');
        await cdp.send('Accessibility.enable');
        const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
        const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#toast' });
        const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
        if (!nodes[0] || nodes[0].ignored) malos.push(`el aviso oculto no está en el árbol de accesibilidad (${JSON.stringify(nodes[0] && nodes[0].ignoredReasons)})`);
        // con la guía abierta
        await pagina.setViewportSize({ width: 360, height: 740 });
        await pagina.click('.nav-link[href="#ejemplos"]');
        await pagina.waitForSelector('#ejemplosGaleria .ejemplo-tarjeta');
        await pagina.click('.ejemplo-tarjeta [data-accion-ejemplo="abrir"][data-carpeta="01-correlacional"]');
        await pagina.waitForSelector('#guiaEjemplo', { timeout: 60000 });
        await pagina.waitForTimeout(600);
        const medidas = () => pagina.evaluate(() => {
            const v = (/** @type {string} */ n) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(n));
            const g = /** @type {HTMLElement} */ (document.getElementById('guiaEjemplo')), c = /** @type {HTMLElement | null} */ (g.querySelector('.guia-cuerpo'));
            const alto = g.getBoundingClientRect().height;
            return {
                cabecera: v('--alto-cabecera'), guia: v('--alto-guia'), cabeza: v('--alto-guia-cabeza'),
                deVerdad: [/** @type {Element} */ (document.querySelector('.header')).getBoundingClientRect().bottom, alto, alto - (c && !c.hidden ? c.getBoundingClientRect().height : 0)].map(x => Math.round(x)),
            };
        });
        const cuadra = (/** @type {Awaited<ReturnType<typeof medidas>>} */ m) => [m.cabecera, m.guia, m.cabeza].every((x, i) => Math.abs(x - m.deVerdad[i]) <= 1.5);
        // (2027.01.09, revisión) la medida en cuanto cuadra, o la última a los 5 s: el ResizeObserver mide en el cuadro siguiente, y
        // con la máquina cargada (la batería corre a la vez las pruebas de Node) tardaba más que los 400 ms fijos que se esperaban
        const medidasAlCuadrar = async () => {
            let m = await medidas();
            for (const t0 = Date.now(); !cuadra(m) && Date.now() - t0 < 5000;) { await pagina.waitForTimeout(100); m = await medidas(); }
            return m;
        };
        // la guía desplegada (en un teléfono empieza plegada): su alto lo limita la cabecera, que cambia de alto con el ancho (una
        // fila desde 900 px, dos por debajo); al girar y al cambiar la ventana, la medida sigue, sin el error del ResizeObserver
        // (lo daba si se medía en su aviso: la guía cambiaba de alto en el mismo cuadro)
        await pagina.evaluate(() => {
            const g = /** @type {HTMLElement} */ (document.getElementById('guiaEjemplo'));
            if (g.classList.contains('plegada')) /** @type {HTMLElement} */ (g.querySelector('[data-accion-guia="plegar"]')).click();
        });
        const serie = [[1280, 560], [880, 540], [1280, 560], [800, 520], [1000, 520], [640, 400], [1200, 450], [700, 420], [1280, 900], [740, 360], [360, 740], [568, 320], [360, 740]];
        for (const [ancho, alto] of serie) {
            await pagina.setViewportSize({ width: ancho, height: alto });
            const m = await medidasAlCuadrar();
            if (!cuadra(m)) malos.push(`${ancho} × ${alto}: lo que mide la guía no sigue al tamaño (${JSON.stringify(m)})`);
        }
        // en su alto máximo (360 × 740: 55 % del alto), una línea de estado más larga
        await pagina.evaluate((/** @type {string} */ t) => { /** @type {HTMLElement} */ (document.getElementById('guiaEjemploEstado')).textContent = t; }, ESTADO_LARGO);
        const tras = await medidasAlCuadrar();
        if (!cuadra(tras)) malos.push(`con la guía desplegada, una línea de estado más larga: --alto-guia-cabeza no la sigue (${JSON.stringify(tras)})`);
        const delBucle = await pagina.evaluate(() => /** @type {string[]} */ (/** @type {any} */ (window).__errores).filter(m => /ResizeObserver/.test(m)));
        if (delBucle.length) malos.push(`${delBucle.length} error(es) «${delBucle[0]}» al cambiar el tamaño`);
        if (errores.length) malos.push(errores.slice(0, 2).join(' / '));
    } finally {
        await cerrar();
    }
    comprobar(malos.length === 0, `sin la guía, el aviso centrado, siempre en la pantalla, con las palabras largas partidas y, oculto, del todo, sin el foco del tabulador pero en el árbol de accesibilidad; con la guía, lo que mide sigue al tamaño (al girar y al cambiar la ventana) y a su línea de estado, sin errores del ResizeObserver${malos.length ? `: ${malos.join('; ')}` : ''}`);
}

async function principal() {
    const { pw, motivo } = await prepararChromium();
    if (!pw) { console.log(`Se omite la pestaña «Ejemplos» en Chromium: ${motivo}.`); return; }
    if (!fs.existsSync(path.join(raiz, 'ejemplos', 'indice.json'))) { console.log('✗ falta ejemplos/indice.json (rehaz los ejemplos con «npm run ejemplos»)'); process.exit(1); }
    await enEscritorio();
    await enTelefono();
    await aCadaAncho();
    await avisosConLaGuia();
    await avisoSinGuiaYMedidas();
    if (fallos.length) process.exit(1);
}

principal().catch(e => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
