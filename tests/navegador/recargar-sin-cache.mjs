// @ts-check
// tests/navegador/recargar-sin-cache.mjs — (2027.01.04) «Recargar sin caché» (Ayuda) trae los módulos nuevos de una pestaña
// que se carga al entrar en ella (la de Ejemplos), aunque esa vez no se haya abierto antes de pulsarlo. Un servidor con la
// caché heurística del navegador (Last-Modified antiguo y sin Cache-Control, como «python -m http.server») sirve primero el
// sitio con un guia.js «viejo» (marca su guía con data-arbol="viejo") y después el de verdad: una navegación normal sigue con
// el viejo (la copia de la caché), y tras «Recargar sin caché», el de verdad. Hasta la 2027.01.03 seguía el viejo: la lista
// de lo que se revalidaba salía del registro de recursos del navegador (250), que la página llena al arrancar.
//
//     node tests/navegador/recargar-sin-cache.mjs
//
// Necesita Playwright con Chromium (como tests/navegador/ejemplos.mjs); sin él, dice cómo y termina sin error.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepararChromium } from './entorno.mjs';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TIPOS = /** @type {Record<string, string>} */ ({
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.md': 'text/markdown; charset=utf-8',
});
/** guia.js «viejo»: el de verdad, con su guía marcada. */
const GUIA = 'src/ejemplos/guia.js';
const guiaVieja = fs.readFileSync(path.join(raiz, GUIA), 'utf8').replace('    aside.dataset.carpeta = e.carpeta;', '    aside.dataset.carpeta = e.carpeta; aside.dataset.arbol = \'viejo\';');
/** @type {string[]} */
const fallos = [];
/** @param {boolean} ok @param {string} que */
function comprobar(ok, que) {
    console.log(`${ok ? '✓' : '✗'} ${que}`);
    if (!ok) fallos.push(que);
}

async function principal() {
    const { pw, motivo } = await prepararChromium();
    if (!pw) { console.log(`Se omite «Recargar sin caché» en el navegador: ${motivo}.`); return; }
    if (!guiaVieja.includes('data-arbol') && !guiaVieja.includes('dataset.arbol')) throw new Error('no se pudo marcar el guia.js viejo');
    let viejo = true;
    /** @type {string[]} */
    const pedidos = [];
    const servidor = http.createServer((pedido, respuesta) => {
        let rel = '';
        try { rel = decodeURIComponent(String(pedido.url || '/').split('?')[0]).replace(/^\/+/, ''); } catch (e) { respuesta.writeHead(400); respuesta.end(); return; }
        const ruta = path.resolve(raiz, rel || 'index.html');
        if (!ruta.startsWith(raiz + path.sep)) { respuesta.writeHead(403); respuesta.end(); return; }
        pedidos.push(rel);
        const enviar = (/** @type {Buffer | string} */ datos) => {
            // como «python -m http.server»: sin Cache-Control y modificado hace 20 días (la caché heurística del navegador)
            respuesta.writeHead(200, { 'Content-Type': TIPOS[path.extname(ruta).toLowerCase()] || 'application/octet-stream', 'Last-Modified': new Date(Date.now() - 20 * 86400e3).toUTCString() });
            respuesta.end(datos);
        };
        if (viejo && rel === GUIA) { enviar(guiaVieja); return; }
        fs.readFile(ruta, (error, datos) => { if (error) { respuesta.writeHead(404); respuesta.end(); } else enviar(datos); });
    });
    await new Promise(r => servidor.listen(0, '127.0.0.1', () => r(undefined)));
    const direccion = /** @type {import('node:net').AddressInfo} */ (servidor.address());
    const origen = `http://127.0.0.1:${direccion.port}`;
    // sin route (con route, Playwright apaga la caché HTTP, que es lo que se prueba); nada fuera de 127.0.0.1
    const navegador = await pw.chromium.launch({ args: ['--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1'] });
    try {
        const pagina = await (await navegador.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-PE' })).newPage();
        pagina.on('dialog', (/** @type {any} */ d) => d.accept());
        /** @type {string[]} */
        const errores = [];
        pagina.on('pageerror', (/** @type {Error} */ e) => errores.push(e.message));
        const lista = () => pagina.waitForFunction(() => /** @type {any} */ (window).StatSim && /** @type {any} */ (window).generadorDatos, null, { timeout: 60000 });
        /** De qué guia.js es la guía del caso 1 (abierta desde la pestaña «Ejemplos»). */
        const guiaDe = async () => {
            await pagina.click('.nav-link[href="#ejemplos"]');
            await pagina.waitForSelector('#ejemplosGaleria .ejemplo-tarjeta', { timeout: 60000 });
            await pagina.click('.ejemplo-tarjeta [data-accion-ejemplo="abrir"][data-carpeta="01-correlacional"]');
            await pagina.waitForSelector('#guiaEjemplo', { timeout: 60000 });
            return pagina.evaluate(() => /** @type {HTMLElement} */ (document.getElementById('guiaEjemplo')).dataset.arbol || 'nuevo');
        };
        await pagina.goto(`${origen}/index.html`);
        await lista();
        comprobar(await guiaDe() === 'viejo', 'con el sitio viejo, la guía es la vieja (y su código queda en la caché del navegador)');
        viejo = false;
        await pagina.goto(`${origen}/index.html`);
        await lista();
        comprobar(await guiaDe() === 'viejo', 'actualizado el sitio, una visita normal sigue con la copia vieja de la caché (lo que se arregla)');
        await pagina.goto(`${origen}/index.html`);
        await lista();
        pedidos.length = 0;
        await Promise.all([pagina.waitForNavigation({ timeout: 180000 }), pagina.evaluate(() => /** @type {any} */ (window).StatSimMantenimiento.recargarSinCache(false))]);
        await lista();
        const deEjemplos = pedidos.filter(p => p.startsWith('src/ejemplos/'));
        comprobar(deEjemplos.includes(GUIA) && deEjemplos.includes('src/ejemplos/hazlo/sesion.js'), `«Recargar sin caché» pide de nuevo los módulos de la pestaña «Ejemplos» sin haberla abierto (${deEjemplos.length})`);
        comprobar(await guiaDe() === 'nuevo', 'y después la guía es la nueva');
        comprobar(errores.length === 0, `sin errores en la página${errores.length ? `: ${errores.slice(0, 3).join(' | ')}` : ''}`);
    } finally {
        await navegador.close();
        servidor.close();
    }
    if (fallos.length) { console.log(`\n${fallos.length} fallo(s)`); process.exit(1); }
}

principal().catch(e => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
