// @ts-check
// ejemplos/catalogo.js — (2027.01.02) el catálogo de la pestaña «Ejemplos»: ejemplos/indice.json, que escribe el generador
// de los ejemplos (tests/navegador/ejemplos.mjs) con lo que dice cada caso (su título, su diseño, sus cifras clave, los pasos
// de su README y sus archivos, con lo que es cada uno). La página no lleva la lista: un caso nuevo aparece solo. Aquí se
// comprueba su forma antes de usarlo (es un archivo del sitio, pero se pinta: nada sin escapar ni rutas fuera de su
// carpeta), se arman las direcciones de los archivos y se ordena lo que hay en cada caso. Sin DOM.
// (2027.01.03) Con el guion de cada paso (lo que repite «Hazlo por mí»: hazlo/planes.js), si lo trae: un índice sin guiones
// (el de unos ejemplos de la 2027.01.02) se lee igual, y su guía no ofrece «Hazlo por mí». Uno con guiones mal formados, no.

import { tamanoLegible } from '../core/data/tamano.js';
import { archivosDeLaAccion, guionValido } from './hazlo/planes.js';

/** La carpeta de los ejemplos, junto a index.html. */
export const CARPETA_EJEMPLOS = 'ejemplos';
/** El proyecto de cada caso, en su carpeta: el que abre «Abrir en StatSim». */
export const PROYECTO_DEL_CASO = 'proyecto.statsim';
/** Lo que acompaña a los archivos de cada caso en su carpeta (y en su .zip): su README y su verificación. */
export const ACOMPANANTES = ['README.md', 'verificacion.json'];
/** El formato de indice.json que esta versión sabe leer. */
export const FORMATO_INDICE = 1;
/** Lo más que se lee de indice.json (el real ocupa unos KB). */
const MAXIMO_INDICE = 1024 * 1024;
const MAXIMO_CASOS = 100, MAXIMO_ARCHIVOS = 300, MAXIMO_TEXTO = 4000, MAXIMO_PASOS = 30, MAXIMO_DESTACADOS = 6;

/**
 * @typedef {{ ruta: string, bytes: number, descripcion: string }} ArchivoDelEjemplo
 * @typedef {{ ruta: string, titulo: string }} CarpetaDelEjemplo  la de un análisis («analizador/2-afe») y lo que guarda
 * @typedef {{ desde: number, hasta: number, nota: string }} PasosARepetir  los pasos del Analizador que hay que repetir tras
 *   abrir el proyecto del caso (los análisis no se guardan en él): los de antes ya los trae el proyecto (los datos y la
 *   configuración de la investigación) y los de después son opcionales (las descargas, guardar el proyecto)
 * @typedef {{ carpeta: string, titulo: string, diseno: string, resumen: string, version: string,
 *   destacados: string[], pasos: string[], repetir: PasosARepetir, guiones?: import('./hazlo/planes.js').AccionDelGuion[][],
 *   carpetas: CarpetaDelEjemplo[], archivos: ArchivoDelEjemplo[] }} Ejemplo
 *   pasos: los del README (lo que se hizo en el Analizador), cada uno en su Markdown. guiones (2027.01.03): lo que se hizo en
 *   cada paso, uno por paso, como lo hace «Hazlo por mí»; sin ellos, la guía no lo ofrece
 * @typedef {{ formato: number, version: string, casos: Ejemplo[] }} Catalogo
 */

/** El aviso de que el sitio no trae la carpeta ejemplos/ (o no trae su índice). */
export class SinEjemplos extends Error {
    constructor() {
        super('Este sitio no trae los ejemplos: falta la carpeta «ejemplos/» (o su «indice.json») junto a index.html.');
        this.name = 'SinEjemplos';
    }
}

const texto = (/** @type {unknown} */ x, maximo = MAXIMO_TEXTO) => typeof x === 'string' && x.length <= maximo;
/** @param {unknown} x @returns {x is Record<string, unknown>} */
const esObjeto = x => !!x && typeof x === 'object' && !Array.isArray(x);
/** Una carpeta de caso: «01-correlacional». @param {unknown} x */
const carpetaValida = x => typeof x === 'string' && /^\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(x);
/** Una ruta dentro del caso, sin salir de él: segmentos de letras, números, «_», «-» y «.», y ninguno «.» ni «..». @param {unknown} x */
const rutaValida = x => typeof x === 'string' && x.length <= 300 && x.split('/').every(s => /^[A-Za-z0-9_.-]+$/.test(s) && s !== '.' && s !== '..');
/**
 * Los guiones de los pasos, si los hay: uno por paso, cada uno con acciones que esta versión sabe hacer, y lo que suben (las
 * valoraciones de la V de Aiken), archivos del propio caso.
 * @param {unknown} x
 * @param {number} pasos
 * @param {unknown[]} archivos los del caso (ya comprobados)
 */
const guionesValidos = (x, pasos, archivos) => {
    if (x === undefined) return true;
    if (!Array.isArray(x) || x.length !== pasos || !x.every(guionValido)) return false;
    const rutas = new Set(archivos.map(a => /** @type {Record<string, unknown>} */ (a).ruta));
    return x.every(g => g.every(a => archivosDeLaAccion(a).every(r => rutas.has(r))));
};
/** Los pasos a repetir: seguidos, entre el primero y el último de los que hay. @param {unknown} x @param {number} pasos */
const repetirValido = (x, pasos) => esObjeto(x) && Number.isInteger(x.desde) && Number.isInteger(x.hasta)
    && 1 <= /** @type {number} */ (x.desde) && /** @type {number} */ (x.desde) <= /** @type {number} */ (x.hasta) && /** @type {number} */ (x.hasta) <= pasos && texto(x.nota, 400);

/**
 * ¿Tiene un objeto la forma de indice.json?
 * @param {unknown} x
 * @returns {x is Catalogo}
 */
export function catalogoValido(x) {
    if (!x || typeof x !== 'object') return false;
    const c = /** @type {Record<string, unknown>} */ (x);
    if (c.formato !== FORMATO_INDICE || !texto(c.version, 40) || !Array.isArray(c.casos) || c.casos.length > MAXIMO_CASOS) return false;
    const carpetas = new Set();
    return c.casos.every(e => {
        if (!e || typeof e !== 'object') return false;
        const k = /** @type {Record<string, unknown>} */ (e);
        if (!carpetaValida(k.carpeta) || carpetas.has(k.carpeta)) return false;
        carpetas.add(k.carpeta);
        return texto(k.titulo, 300) && texto(k.diseno, 80) && texto(k.resumen) && texto(k.version, 40)
            && Array.isArray(k.destacados) && k.destacados.length <= MAXIMO_DESTACADOS && k.destacados.every(d => texto(d, 300))
            && Array.isArray(k.pasos) && k.pasos.length <= MAXIMO_PASOS && k.pasos.every(p => texto(p)) && repetirValido(k.repetir, k.pasos.length)
            && Array.isArray(k.carpetas) && k.carpetas.length <= MAXIMO_ARCHIVOS
            && k.carpetas.every(c => esObjeto(c) && rutaValida(c.ruta) && texto(c.titulo, 300))
            && Array.isArray(k.archivos) && k.archivos.length <= MAXIMO_ARCHIVOS
            && k.archivos.every(a => esObjeto(a) && rutaValida(a.ruta) && Number.isSafeInteger(a.bytes) && /** @type {number} */ (a.bytes) >= 0 && texto(a.descripcion))
            && new Set(k.archivos.map(a => /** @type {Record<string, unknown>} */ (a).ruta)).size === k.archivos.length
            && guionesValidos(k.guiones, k.pasos.length, k.archivos);
    });
}

/**
 * El catálogo de un texto (el de indice.json), comprobado.
 * @param {string} contenido
 * @returns {Catalogo}
 */
export function leerCatalogo(contenido) {
    if (typeof contenido !== 'string' || contenido.length > MAXIMO_INDICE) throw new Error('El índice de los ejemplos («ejemplos/indice.json») es demasiado grande.');
    let datos;
    try { datos = JSON.parse(contenido.replace(/^\ufeff/, '')); } catch (e) { throw new Error('El índice de los ejemplos («ejemplos/indice.json») no es JSON válido.'); }
    if (!catalogoValido(datos)) throw new Error('El índice de los ejemplos («ejemplos/indice.json») no tiene la forma que esta versión sabe leer: vuelve a generarlos o recarga sin caché.');
    return datos;
}

/**
 * @typedef {(url: string) => Promise<{ ok: boolean, status: number, text: () => Promise<string>, arrayBuffer: () => Promise<ArrayBuffer> }>} Obtener
 */

/**
 * Pide indice.json y lo lee. Sin la carpeta (404), SinEjemplos.
 * @param {Obtener} obtener fetch, o el de las pruebas
 * @param {string} version la de la página (para que la caché no sirva un índice de otra versión)
 * @returns {Promise<Catalogo>}
 */
export async function cargarCatalogo(obtener, version) {
    let r;
    try { r = await obtener(`${CARPETA_EJEMPLOS}/indice.json?v=${encodeURIComponent(version)}`); } catch (e) {
        throw new Error(`No se pudo pedir el índice de los ejemplos: ${e instanceof Error ? e.message : e}`);
    }
    if (r.status === 404) throw new SinEjemplos();
    if (!r.ok) throw new Error(`No se pudo pedir el índice de los ejemplos (el sitio respondió ${r.status}).`);
    return leerCatalogo(await r.text());
}

/**
 * La dirección de un archivo de un caso, junto a index.html y con la versión de la página.
 * @param {string} carpeta
 * @param {string} ruta
 * @param {string} version
 */
export function urlDelArchivo(carpeta, ruta, version) {
    if (!carpetaValida(carpeta) || !rutaValida(ruta)) throw new Error(`Ruta de ejemplo no válida: ${carpeta}/${ruta}`);
    return `${CARPETA_EJEMPLOS}/${carpeta}/${ruta.split('/').map(encodeURIComponent).join('/')}?v=${encodeURIComponent(version)}`;
}

/**
 * Los bytes de un archivo de un caso, del sitio, comprobados con el tamaño que dice el catálogo (si lo dice: el README y la
 * verificación no están en él). Uno de otro tamaño es de otra versión (lo sirve la caché del navegador): se dice.
 * @param {Ejemplo} e
 * @param {string} ruta
 * @param {{ obtener: Obtener, version: string }} op
 * @returns {Promise<Uint8Array>}
 */
export async function bytesDelArchivo(e, ruta, { obtener, version }) {
    let r;
    try { r = await obtener(urlDelArchivo(e.carpeta, ruta, version)); } catch (err) {
        throw new Error(`No se pudo descargar «${ruta}» (${err instanceof Error ? err.message : err}): comprueba la conexión y vuelve a intentarlo.`);
    }
    if (!r.ok) throw new Error(`No se pudo descargar «${ruta}»: el sitio respondió ${r.status}.`);
    const bytes = new Uint8Array(await r.arrayBuffer());
    const esperado = e.archivos.find(a => a.ruta === ruta);
    if (esperado && esperado.bytes !== bytes.length) {
        throw new Error(`«${ruta}» no es el de este caso (ocupa ${bytes.length} bytes y el catálogo dice ${esperado.bytes}): el navegador puede estar sirviendo una copia de otra versión. Usa Ayuda → «Recargar sin caché» y vuelve a intentarlo.`);
    }
    return bytes;
}

/** El número del caso, de su carpeta («03-predictivo» → 3). @param {Ejemplo} e */
export const numeroDe = e => parseInt(e.carpeta, 10);

/**
 * @typedef {'hecho' | 'repetir' | 'opcional'} EstadoDelPaso
 */

/**
 * Lo que es un paso tras abrir el proyecto del caso: «hecho» (lo trajo el proyecto), «repetir» u «opcional». (2027.01.03)
 * Aquí, y no en la guía: también lo usa «Hazlo por mí» (hazlo/sesion.js).
 * @param {number} n el número del paso, desde 1
 * @param {PasosARepetir} repetir
 * @returns {EstadoDelPaso}
 */
export function estadoDelPaso(n, repetir) {
    return n < repetir.desde ? 'hecho' : n <= repetir.hasta ? 'repetir' : 'opcional';
}

/**
 * Unos pasos seguidos, en palabras: «el paso 3», «los pasos 2 y 3», «los pasos 2 a 6». Lo usan el README de cada caso
 * (tests/navegador/recetas/leeme.mjs) y la guía de la pestaña, para que digan lo mismo.
 * @param {{ desde: number, hasta: number }} pasos
 */
export function pasosEnPalabras({ desde, hasta }) {
    return desde === hasta ? `el paso ${desde}` : hasta === desde + 1 ? `los pasos ${desde} y ${hasta}` : `los pasos ${desde} a ${hasta}`;
}

/**
 * @typedef {{ clase: 'pdf' | 'word' | 'excel' | 'spss' | 'csv' | 'texto' | 'proyecto' | 'otro', etiqueta: string, icono: string }} TipoDeArchivo
 */

/** @type {Array<[RegExp, TipoDeArchivo]>} */
const TIPOS = [
    [/\.pdf$/i, { clase: 'pdf', etiqueta: 'PDF', icono: '📕' }],
    [/\.docx?$/i, { clase: 'word', etiqueta: 'Word', icono: '📘' }],
    [/\.xlsx$/i, { clase: 'excel', etiqueta: 'Excel', icono: '📗' }],
    [/\.sav$/i, { clase: 'spss', etiqueta: 'SPSS', icono: '📊' }],
    [/\.csv$/i, { clase: 'csv', etiqueta: 'CSV', icono: '📄' }],
    [/\.txt$/i, { clase: 'texto', etiqueta: 'Texto', icono: '📝' }],
    [/\.statsim$/i, { clase: 'proyecto', etiqueta: 'Proyecto', icono: '💾' }],
];

/** Qué es un archivo, por su extensión. @param {string} ruta @returns {TipoDeArchivo} */
export function tipoDeArchivo(ruta) {
    const t = TIPOS.find(([re]) => re.test(ruta));
    return t ? t[1] : { clase: 'otro', etiqueta: 'Archivo', icono: '📎' };
}

/** Lo que ocupan los archivos de un caso (sin su README ni su verificacion.json, que son unos KB). @param {Ejemplo} e */
export const bytesDelCaso = e => e.archivos.reduce((s, a) => s + a.bytes, 0);

/** El tamaño, legible («850 KB», «1.2 MB»). @param {number} bytes */
export function tamanoDe(bytes) {
    return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : tamanoLegible(bytes);
}

/**
 * Los archivos de un caso, por grupos y en el orden en que se hicieron: lo del Simulador, cada análisis del Analizador (su
 * carpeta numerada, con el título que le da el caso; la 10 después de la 9), lo de otras carpetas (cada una, el suyo; los
 * sueltos, «Otros archivos») y el proyecto. Dentro de cada grupo, por su nombre, como la tabla «Archivos» de su README.
 * @param {ArchivoDelEjemplo[]} archivos
 * @param {CarpetaDelEjemplo[]} carpetas
 * @returns {Array<{ titulo: string, archivos: ArchivoDelEjemplo[] }>}
 */
export function gruposDeArchivos(archivos, carpetas) {
    const titulos = new Map(carpetas.map(c => [c.ruta, c.titulo]));
    /** @type {Map<string, { orden: string, titulo: string, archivos: ArchivoDelEjemplo[] }>} */
    const grupos = new Map();
    for (const a of [...archivos].sort((x, y) => (x.ruta < y.ruta ? -1 : x.ruta > y.ruta ? 1 : 0))) {
        const partes = a.ruta.split('/'), carpeta = partes.slice(0, -1).join('/');
        const n = parseInt(partes[1], 10);
        const [orden, titulo] = partes[0] === 'simulador' ? ['0', 'Simulador']
            : partes[0] === 'analizador' && partes.length > 2 ? [`1|${carpeta}`, `Analizador · ${Number.isFinite(n) ? `${n}. ` : ''}${titulos.get(carpeta) || partes[1]}`]
            : a.ruta === PROYECTO_DEL_CASO ? ['3', 'Proyecto']
            : partes.length > 1 ? [`2|${partes[0]}`, partes[0].charAt(0).toUpperCase() + partes[0].slice(1)]
            : ['2|', 'Otros archivos'];
        if (!grupos.has(orden)) grupos.set(orden, { orden, titulo, archivos: [] });
        /** @type {{ archivos: ArchivoDelEjemplo[] }} */ (grupos.get(orden)).archivos.push(a);
    }
    return [...grupos.values()].sort((x, y) => x.orden.localeCompare(y.orden, 'es', { numeric: true })).map(({ titulo, archivos: lista }) => ({ titulo, archivos: lista }));
}
