// @ts-check
// tests/unit/modulos-del-sitio.test.js — (2027.01.04) lo que «Recargar sin caché» vuelve a pedir (src/shared/modulos-del-sitio.js):
// las importaciones de un módulo y de una hoja de estilo, y el recorrido desde las entradas de la página, que alcanza todos
// los módulos y hojas de estilo del sitio (también los de las pestañas que se cargan al entrar en ellas) sin pedir nada que
// no exista. Hasta la 2027.01.03 la lista salía del registro de recursos del navegador (250) y la pestaña «Ejemplos» se
// quedaba con su código viejo. (En Chromium, con la caché de verdad: tests/navegador/recargar-sin-cache.mjs.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importacionesDe, recorrerSitio, tipoDe } from '../../src/shared/modulos-del-sitio.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SITIO = 'https://sitio.example/app/';

test('las importaciones de un módulo: estáticas (con o sin «from», en varias líneas), dinámicas con una ruta fija y los new URL(…, import.meta.url); resueltas desde el módulo, sin su «?v=»; (revisión) no las de un comentario', () => {
    const js = [
        "import { a } from './a.js';",
        'import * as b from "../b.js";',
        "import './c.js';",
        "export { d } from './d/d.js';",
        "export * from './e.js';",
        'import {\n    f,\n    g,\n} from "./fg.js";',
        "const h = await import('./h.js');",
        "const w = new Worker(new URL('./w.js', import.meta.url), { type: 'module' });",
        "import raiz from '/raiz.js';",
        "import paquete from 'paquete';",                       // un nombre suelto: no es un archivo del sitio
        "import cdn from 'https://cdn.example/x.js';",          // otro sitio
        'const plantilla = import(`./p-${n}.js`);',             // una ruta que se arma al correr: no se sabe
        "export const z = 'from';",
        "const reimport = 'import';",
        // (revisión) los de un comentario, no (un archivo que ya no está se contaría como «no disponible»)
        "// import viejo from './viejo.js';",
        "    /* import './bloque.js'; */",
        '/**\n * Por ejemplo: import { x } from "./del-comentario.js";\n */',
        "const n = 1; /** a mitad de línea:\n * import './de-un-jsdoc.js';\n */",
        // y sí: los nombres con acentos, un comentario entre lo que se importa y un «//» dentro de un texto
        "import { año, niño } from './acentos.js';",
        "import {\n    a, // el primero\n    b,\n} from './con-comentario.js';",
        "const sitio = 'https://x.example/'; const t = await import('./tras-una-url.js');",
        "import\n  * as m from './partido.js';",   // (una línea que empieza por «*» que no es de un comentario)
        "export\n    * from './reexporta.js';",   // (2027.01.05, revisión) y otra: un «export * from» partido
        "export\n * from\"./sin-espacio.js\";",
        "const m = 1; /** a mitad de línea:\n * from here on: import { x } from './de-otro-jsdoc.js';\n */",   // (un «* from» sin su ruta, sí es un comentario)
    ].join('\n');
    assert.deepEqual(importacionesDe(js, `${SITIO}src/m/mod.js?v=2027.01.04`, 'modulo').sort(), [
        `${SITIO}src/b.js`, `${SITIO}src/m/a.js`, `${SITIO}src/m/c.js`, `${SITIO}src/m/d/d.js`, `${SITIO}src/m/e.js`, `${SITIO}src/m/fg.js`,
        `${SITIO}src/m/h.js`, `${SITIO}src/m/w.js`, 'https://sitio.example/raiz.js',
        `${SITIO}src/m/acentos.js`, `${SITIO}src/m/con-comentario.js`, `${SITIO}src/m/tras-una-url.js`, `${SITIO}src/m/partido.js`,
        `${SITIO}src/m/reexporta.js`, `${SITIO}src/m/sin-espacio.js`,
    ].sort());
});

test('las importaciones de una hoja de estilo: url("…"), url(…) y "…", también en mayúsculas; no un «@import» de un comentario ni otro sitio', () => {
    const css = [
        '/* Para añadir una hoja: añade su @import aquí, en su lugar */',
        '@import url("base.css");',
        "@import url('componentes/x.css');",
        '@import "y.css";',
        '@import url(z.css);',
        '@import url("https://fonts.example/f.css");',
        '/* @import url("componentes/viejo.css"); */',
        '/*\n@import "tambien-viejo.css";\n*/',
        '@IMPORT url("mayusculas.css");',
    ].join('\n');
    assert.deepEqual(importacionesDe(css, `${SITIO}assets/css/styles.css?v=17`, 'hoja'),
        [`${SITIO}assets/css/base.css`, `${SITIO}assets/css/componentes/x.css`, `${SITIO}assets/css/y.css`, `${SITIO}assets/css/z.css`, `${SITIO}assets/css/mayusculas.css`]);
    assert.equal(tipoDe(`${SITIO}src/a.js?v=1`), 'modulo');
    assert.equal(tipoDe(`${SITIO}src/b.MJS`), 'modulo');
    assert.equal(tipoDe(`${SITIO}assets/css/c.css`), 'hoja');
    assert.equal(tipoDe(`${SITIO}version.json`), null);
    assert.equal(tipoDe(`${SITIO}favicon.svg?v=1`), null);
});

/** El sitio, servido de la carpeta del proyecto (sin la «?v=»). @param {string[]} pedidas */
const delProyecto = pedidas => async (/** @type {string} */ url) => {
    pedidas.push(url);
    const ruta = path.join(raiz, ...decodeURIComponent(new URL(url).pathname).replace(/^\/app\//, '').split('/'));
    const ok = url.startsWith(SITIO) && fs.existsSync(ruta) && fs.statSync(ruta).isFile();
    return { ok, text: async () => (ok ? fs.readFileSync(ruta, 'utf8') : '') };
};

test('desde las entradas de la página (src/main.js, el Worker del generador y la hoja de estilo), todos los módulos y hojas del sitio, una vez cada uno, sin pedir nada que no exista', async () => {
    /** @type {string[]} */
    const pedidas = [];
    const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
    const entradas = [...html.matchAll(/<(?:script[^>]*\ssrc|link[^>]*rel="stylesheet"[^>]*\shref)="([^"]+)"/g)].map(m => new URL(m[1], SITIO).href);
    assert.ok(entradas.some(u => /src\/main\.js\?v=/.test(u)) && entradas.some(u => /styles\.css/.test(u)), `las entradas de index.html: ${entradas.join(', ')}`);
    entradas.push(`${SITIO}src/simulador/worker/generador.worker.js?v=1`);   // el Worker no está en el HTML (mantenimiento.js lo añade)
    const r = await recorrerSitio(entradas, { obtener: delProyecto(pedidas), delSitio: u => u.startsWith(SITIO) });
    assert.deepEqual(r.fallidas, [], 'nada que no exista');
    assert.equal(new Set(pedidas).size, pedidas.length, 'cada uno, una vez');
    const alcanzados = new Set(r.pedidas.map(u => decodeURIComponent(new URL(u).pathname).replace(/^\/app\//, '')));
    /** @type {string[]} */
    const todos = [];
    const andar = (/** @type {string} */ d) => {
        for (const e of fs.readdirSync(path.join(raiz, d), { withFileTypes: true })) {
            const p = `${d}/${e.name}`;
            if (e.isDirectory()) andar(p); else if (/\.(m?js|css)$/.test(e.name)) todos.push(p);
        }
    };
    andar('src'); andar('assets/css');
    assert.ok(todos.length > 250);
    const sueltos = todos.filter(p => !alcanzados.has(p));
    assert.deepEqual(sueltos, [], `ninguno sin alcanzar: ${sueltos.join(', ')} no los importa nadie (si vienen de una versión anterior, bórralos: los nombra el BORRAR-*.txt de la actualización)`);
    for (const m of ['src/ejemplos/index.js', 'src/ejemplos/guia.js', 'src/ejemplos/hazlo/sesion.js', 'src/analizador/psicometria/psicometria.worker.js', 'assets/css/componentes/ejemplos.css']) {
        assert.ok(alcanzados.has(m), m);
    }
});

test('lo que no responde se cuenta y no se sigue; lo de otro sitio se pide, pero no se lee', async () => {
    /** @type {string[]} */
    const leidas = [];
    const archivos = /** @type {Record<string, string>} */ ({
        [`${SITIO}a.js`]: "import './b.js'; import './falta.js'; import 'https://otro.example/c.js';",
        [`${SITIO}b.js`]: "import './a.js';",
        'https://otro.example/c.js': "import './d.js';",
    });
    const obtener = async (/** @type {string} */ url) => {
        if (url.includes('roto')) throw new TypeError('Failed to fetch');
        const texto = archivos[url];
        return { ok: texto !== undefined && url.startsWith(SITIO), type: url.startsWith(SITIO) ? 'basic' : 'opaque', text: async () => { leidas.push(url); return texto || ''; } };
    };
    const r = await recorrerSitio([`${SITIO}a.js`, `${SITIO}roto.js`, 'https://otro.example/c.js'], { obtener, delSitio: u => u.startsWith(SITIO), aLaVez: 2 });
    assert.deepEqual(r.pedidas.sort(), [`${SITIO}a.js`, `${SITIO}b.js`, 'https://otro.example/c.js'].sort());
    assert.deepEqual(r.fallidas.sort(), [`${SITIO}falta.js`, `${SITIO}roto.js`].sort());
    assert.deepEqual(leidas.sort(), [`${SITIO}a.js`, `${SITIO}b.js`].sort(), 'lo de otro sitio no se lee (ni se siguen sus importaciones)');
});
