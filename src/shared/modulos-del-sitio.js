// @ts-check
// shared/modulos-del-sitio.js — (2027.01.04) los archivos de los que depende la página, por sus importaciones: desde unas
// entradas (src/main.js, el Worker del generador, las hojas de estilo), cada archivo se pide y se leen las rutas que importa
// (los import y export … from, los import() con una ruta fija y los new URL(…, import.meta.url) de un módulo; los @import de
// una hoja de estilo; no los de un comentario), hasta no encontrar más. Lo usa «Recargar sin caché» (mantenimiento.js): así se revalidan también los
// módulos que se cargan al entrar en una pestaña (la de Ejemplos), aunque la página aún no los haya pedido. Hasta la
// 2027.01.03 se tomaban de lo que el navegador anota al cargar, un registro de 250 recursos que la página llena antes de
// terminar de arrancar: una pestaña se quedaba con su código viejo tras una actualización. Sin DOM: quien lo usa dice cómo
// se pide cada archivo.

/**
 * Las importaciones de un módulo: estáticas (con o sin «from», con lo que se importa en varias líneas y con cualquier nombre),
 * dinámicas con una ruta fija y los new URL(…, import.meta.url).
 */
const DE_MODULO = /(?:^|[^\w$.])(?:import|export)\s*(?:[^'"`;()]*?\bfrom\s*)?['"]([^'"\n]+)['"]|\bimport\(\s*['"]([^'"\n]+)['"]\s*\)|\bnew\s+URL\(\s*['"]([^'"\n]+)['"]\s*,\s*import\.meta\.url\s*\)/g;
/** Las importaciones de una hoja de estilo: «@import url("…")», «@import url(…)» o «@import "…"» (en mayúsculas o minúsculas). */
const DE_HOJA = /@import\s+(?:url\(\s*['"]?([^'")\s]+)['"]?\s*\)|['"]([^'"\n]+)['"])/gi;

/**
 * (2027.01.04, revisión) El texto sin sus comentarios, para no pedir lo que importa un comentario (un archivo que ya no está
 * se contaría como «no disponible»): en una hoja de estilo, todos (los /* … *\/); en un módulo, los que empiezan una línea
 * (los /* … *\/ y los //, y las líneas de un comentario largo, que empiezan por «*», salvo un «* as …» o (2027.01.05) un
 * «* from '…'», que es lo que importa o reexporta un import o un export partido en dos líneas), que es como se comenta un
 * import: uno a mitad de línea podría estar dentro de un texto («https://…»).
 * @param {string} texto
 * @param {'modulo' | 'hoja'} tipo
 */
export function sinComentarios(texto, tipo) {
    const t = String(texto);
    if (tipo === 'hoja') return t.replace(/\/\*[\s\S]*?\*\//g, ' ');
    return t.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, ' ').replace(/^[ \t]*(?:\/\/|\*(?![ \t]*(?:as[ \t]|from[ \t]*['"]))).*$/gm, '');
}

/**
 * Qué se lee de un archivo por su dirección: 'modulo' (.js, .mjs), 'hoja' (.css) o null (lo demás se pide, pero no se lee).
 * @param {string} url
 * @returns {'modulo' | 'hoja' | null}
 */
export function tipoDe(url) {
    const ruta = new URL(url).pathname.toLowerCase();
    return /\.m?js$/.test(ruta) ? 'modulo' : ruta.endsWith('.css') ? 'hoja' : null;
}

/**
 * Las direcciones que importa un archivo, resueltas desde la suya (como lo hace el navegador: sin la «?v=» de quien
 * importa). Solo las del sitio: rutas relativas o que empiezan por «/»; ni otros sitios ni nombres sueltos.
 * @param {string} texto
 * @param {string} url la del archivo
 * @param {'modulo' | 'hoja'} tipo
 * @returns {string[]}
 */
export function importacionesDe(texto, url, tipo) {
    /** @type {Set<string>} */
    const salida = new Set();
    for (const m of sinComentarios(texto, tipo).matchAll(tipo === 'hoja' ? DE_HOJA : DE_MODULO)) {
        const ruta = m[1] || m[2] || m[3];
        if (!ruta || /^[a-z][a-z0-9+.-]*:/i.test(ruta) || ruta.startsWith('//')) continue;   // otro sitio (o «data:»)
        if (tipo === 'modulo' && !/^(\.{1,2}\/|\/)/.test(ruta)) continue;   // un nombre suelto no es un archivo del sitio
        salida.add(new URL(ruta, url).href);
    }
    return [...salida];
}

/**
 * @typedef {object} RespuestaDelSitio
 * @property {boolean} ok
 * @property {string} [type] 'opaque' en la de otro sitio (no se puede leer, pero se pidió)
 * @property {() => Promise<string>} text
 */

/**
 * Pide las entradas y todo lo que importan, por niveles (unos pocos a la vez), una sola vez cada dirección. Lo que no
 * responde (o no existe) se cuenta y no se sigue.
 * @param {string[]} entradas direcciones absolutas
 * @param {{ obtener: (url: string) => Promise<RespuestaDelSitio>, delSitio: (url: string) => boolean, aLaVez?: number }} op
 *   obtener: cómo se pide (con la caché que se quiera); delSitio: si una dirección es del sitio (solo esas se leen)
 * @returns {Promise<{ pedidas: string[], fallidas: string[] }>}
 */
export async function recorrerSitio(entradas, { obtener, delSitio, aLaVez = 6 }) {
    /** @type {Set<string>} */
    const vistas = new Set(entradas);
    /** @type {string[]} */
    const pedidas = [];
    /** @type {string[]} */
    const fallidas = [];
    let nivel = [...vistas];
    while (nivel.length) {
        /** @type {string[]} */
        const siguiente = [];
        for (let i = 0; i < nivel.length; i += aLaVez) {
            await Promise.all(nivel.slice(i, i + aLaVez).map(async url => {
                try {
                    const r = await obtener(url);
                    if (!r.ok && r.type !== 'opaque') { fallidas.push(url); return; }
                    pedidas.push(url);
                    const tipo = tipoDe(url);
                    if (!tipo || !delSitio(url)) return;
                    for (const otra of importacionesDe(await r.text(), url, tipo)) {
                        if (!vistas.has(otra)) { vistas.add(otra); siguiente.push(otra); }
                    }
                } catch (e) {
                    fallidas.push(url);
                }
            }));
        }
        nivel = siguiente;
    }
    return { pedidas, fallidas };
}
