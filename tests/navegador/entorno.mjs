// @ts-check
// tests/navegador/entorno.mjs — la página de verdad en Chromium (Playwright), para los recorridos de punta a punta y los
// ejemplos (ejemplos/). Un servidor estático propio sobre la raíz del proyecto; Chromium sin red externa, con la zona
// horaria de Lima y el reloj fijo (lo que la página escribe con la fecha —el informe del Simulador, el .sav, el proyecto, el
// Word— sale igual en cada corrida), y los errores de la página reunidos. Playwright no es una dependencia del proyecto:
// si no se encuentra, cargarPlaywright() da null y quien llama se omite (como los oráculos de Python sin NumPy).
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pdfSinFechas } from './comparar.mjs';

/** Los tipos de los archivos que sirve el servidor (lo demás, como binario). */
const TIPOS = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
    '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp4': 'video/mp4', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8',
};

/** La fecha y hora con que corre la página, si no se pide otra: la de los ejemplos (mediodía en Lima). */
export const FECHA_FIJA = '2026-10-21T12:00:00-05:00';

/**
 * Playwright, si está: instalado en el proyecto (`npm i -D playwright`), en la carpeta global de npm o en la que diga la
 * variable STATSIM_PLAYWRIGHT. null si no está en ninguna.
 * @returns {Promise<any>}
 */
export async function cargarPlaywright() {
    try { return await import('playwright'); } catch (e) { /* no está junto al proyecto */ }
    const carpetas = [process.env.STATSIM_PLAYWRIGHT || ''];
    // (2027.01.01, revisión) la carpeta global de npm sin lanzar npm en Windows: %APPDATA%\npm\node_modules, como rutaTsc
    // en tests/run.js (lanzar npm.cmd con shell da el aviso DEP0190 de Node 24); y la de junto a node
    if (process.env.APPDATA) carpetas.push(path.join(process.env.APPDATA, 'npm', 'node_modules'));
    carpetas.push(path.join(path.dirname(process.execPath), 'node_modules'), path.join(path.dirname(process.execPath), '..', 'lib', 'node_modules'));
    if (process.platform !== 'win32') { try { carpetas.push(execFileSync('npm', ['root', '-g'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()); } catch (e) { /* sin npm en el PATH */ } }
    carpetas.push('/opt/npm-tools/node_modules');
    for (const carpeta of carpetas.filter(Boolean)) {
        try { return createRequire(path.join(carpeta, 'noop.js'))('playwright'); } catch (e) { /* tampoco aquí */ }
    }
    return null;
}

/**
 * (2027.01.01, revisión) Playwright con un Chromium que arranca, o por qué no: sin Playwright, o con Playwright pero sin su
 * Chromium (falta «npx playwright install chromium»), lo de tests/navegador/ se omite y se dice, como sin Playwright.
 * @returns {Promise<{ pw: any, motivo: string }>}
 */
export async function prepararChromium() {
    const pw = await cargarPlaywright();
    if (!pw) return { pw: null, motivo: 'no se encontró Playwright (npm i -D playwright y npx playwright install chromium)' };
    try {
        const navegador = await pw.chromium.launch();
        await navegador.close();
        return { pw, motivo: '' };
    } catch (e) {
        return { pw: null, motivo: `Playwright no pudo abrir Chromium (falta npx playwright install chromium): ${String((e && /** @type {any} */ (e).message) || e).split('\n')[0]}` };
    }
}

/**
 * Las familias de letra con que la página dibuja lo que descarga: la de las figuras (Arial, con sus sustitutas), la del
 * Word (Times New Roman), la de impresión (Calibri, con las suyas) y las genéricas.
 */
const FAMILIAS_DE_PRUEBA = ['Arial', 'Helvetica', 'sans-serif', 'Times New Roman', 'serif', 'Calibri', 'Carlito', 'Segoe UI', 'Liberation Sans', 'system-ui', 'monospace'];

/**
 * (2027.01.01) La huella del dibujo de este navegador: su versión, la imagen de un SVG con texto en esas familias
 * rasterizado en un lienzo (como las figuras del Word) y el PDF de un texto en ellas (como «Imprimir → Guardar como PDF»).
 * Dos entornos con la misma huella dan los mismos PDF y las mismas figuras; con otra (otro sistema, otras fuentes
 * instaladas, otro Chromium), esos archivos cambian aunque la página haga exactamente lo mismo (comparar.mjs).
 * @param {any} contexto el contexto de Playwright de la página
 * @returns {Promise<{ navegador: string, dibujo: string }>}
 */
export async function huellaDeDibujo(contexto) {
    const navegador = `Chromium ${contexto.browser().version()} (${process.platform})`;
    const muestra = 'Ág 0,123 · ρ = −.40 [IC 95 %] χ² ε² ω — Ñandú';
    const pagina = await contexto.newPage();
    try {
        await pagina.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0">${FAMILIAS_DE_PRUEBA.map(f => `<p style="font-family:'${f}';font-size:12pt">${muestra} <b>${muestra}</b> <i>${muestra}</i></p>`).join('')}</body>`);
        const png = await pagina.evaluate(async (/** @type {{ familias: string[], muestra: string }} */ { familias, muestra }) => {
            const ancho = 640, alto = 24 * familias.length + 8;
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}">${familias.map((f, i) => `<text x="4" y="${20 + 24 * i}" font-family="${f}" font-size="14">${muestra}</text>`).join('')}</svg>`;
            const imagen = new Image();
            imagen.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
            await imagen.decode();
            const lienzo = document.createElement('canvas');
            lienzo.width = 2 * ancho; lienzo.height = 2 * alto;
            const c = /** @type {CanvasRenderingContext2D} */ (lienzo.getContext('2d'));
            c.fillStyle = '#ffffff'; c.fillRect(0, 0, lienzo.width, lienzo.height); c.scale(2, 2); c.drawImage(imagen, 0, 0, ancho, alto);
            return lienzo.toDataURL('image/png');
        }, { familias: FAMILIAS_DE_PRUEBA, muestra });
        const pdf = await pagina.pdf({ format: 'A4', printBackground: true });
        const dibujo = crypto.createHash('sha256').update(navegador).update('\n').update(png).update('\n').update(pdfSinFechas(pdf)).digest('hex');
        return { navegador, dibujo };
    } finally {
        await pagina.close();
    }
}

/**
 * Un servidor HTTP de los archivos de una carpeta, en un puerto libre de 127.0.0.1 (nada fuera de la carpeta).
 * @param {string} raiz
 * @returns {Promise<{ origen: string, cerrar: () => Promise<void> }>}
 */
export function servirCarpeta(raiz) {
    const base = path.resolve(raiz);
    const servidor = http.createServer((pedido, respuesta) => {
        let relativa = '';
        try { relativa = decodeURIComponent(String(pedido.url || '/').split('?')[0]); } catch (e) { respuesta.writeHead(400); respuesta.end(); return; }
        let ruta = path.resolve(base, '.' + (relativa.endsWith('/') ? relativa + 'index.html' : relativa));
        if (ruta !== base && !ruta.startsWith(base + path.sep)) { respuesta.writeHead(403); respuesta.end(); return; }
        fs.readFile(ruta, (error, datos) => {
            if (error) { respuesta.writeHead(404); respuesta.end(); return; }
            respuesta.writeHead(200, { 'Content-Type': TIPOS[path.extname(ruta).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
            respuesta.end(datos);
        });
    });
    return new Promise((resolver, rechazar) => {
        servidor.once('error', rechazar);
        servidor.listen(0, '127.0.0.1', () => {
            const direccion = /** @type {import('node:net').AddressInfo} */ (servidor.address());
            resolver({ origen: `http://127.0.0.1:${direccion.port}`, cerrar: () => new Promise(r => servidor.close(() => r(undefined))) });
        });
    });
}

/**
 * @typedef {object} PaginaAbierta
 * @property {any} pagina la página de Playwright, ya en index.html y con la aplicación montada
 * @property {any} contexto
 * @property {string} origen
 * @property {string[]} errores los errores de la página (excepciones y console.error), en orden
 * @property {() => Promise<void>} cerrar
 */

/**
 * Abre index.html del proyecto en Chromium y espera a que la aplicación esté montada.
 * @param {{ raiz: string, fecha?: string, ancho?: number, alto?: number }} opciones
 * @returns {Promise<PaginaAbierta>}
 */
export async function abrirPagina({ raiz, fecha = FECHA_FIJA, ancho = 1280, alto = 900 }) {
    const pw = await cargarPlaywright();
    if (!pw) throw new Error('No se encontró Playwright: instálalo con «npm i -D playwright» y «npx playwright install chromium».');
    const { origen, cerrar: cerrarServidor } = await servirCarpeta(raiz);
    const navegador = await pw.chromium.launch();
    const contexto = await navegador.newContext({
        acceptDownloads: true, viewport: { width: ancho, height: alto }, locale: 'es-PE', timezoneId: 'America/Lima', deviceScaleFactor: 1,
    });
    // sin red externa: solo el servidor propio (las fuentes de la web y las API quedan fuera, y el resultado no depende de ellas)
    await contexto.route(url => !String(url).startsWith(origen), ruta => ruta.abort('blockedbyclient'));
    const pagina = await contexto.newPage();
    /** @type {string[]} */
    const errores = [];
    pagina.on('pageerror', e => errores.push('excepción: ' + e.message));
    pagina.on('console', m => {
        if (m.type() === 'error' && !/Failed to load resource|net::ERR|ERR_BLOCKED/.test(m.text())) errores.push('consola: ' + m.text());
    });
    pagina.on('dialog', d => d.accept());   // las confirmaciones (abrir un proyecto) se aceptan, como lo haría quien pulsó
    await pagina.clock.setFixedTime(new Date(fecha));
    await pagina.goto(`${origen}/index.html`);
    await pagina.waitForFunction(() => /** @type {any} */ (window).StatSim && /** @type {any} */ (window).generadorDatos, null, { timeout: 60000 });
    return {
        pagina, contexto, origen, errores,
        cerrar: async () => { await navegador.close(); await cerrarServidor(); },
    };
}
