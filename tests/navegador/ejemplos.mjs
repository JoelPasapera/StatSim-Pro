// @ts-check
// tests/navegador/ejemplos.mjs — (2027.01.01) los ejemplos de ejemplos/, hechos por la página. Cada receta
// (tests/navegador/recetas/) recorre un caso de uso en Chromium como lo haría una persona —importa la configuración del
// Simulador, genera, descarga, pasa la base al Analizador, analiza, exporta, imprime y guarda el proyecto— y lo que la
// página descarga es lo que queda en la carpeta del caso, sin tocarlo. El reloj fijo y la semilla hacen que una segunda
// corrida dé los mismos archivos (los PDF, con el mismo texto impreso: comparar.mjs): con «comprobar», los ejemplos son
// también una prueba de punta a punta.
//
//     node tests/navegador/ejemplos.mjs generar [caso…]     escribe ejemplos/<caso>/ (todos los casos si no se nombra ninguno)
//     node tests/navegador/ejemplos.mjs comprobar [caso…]   los rehace en una carpeta temporal y los compara con ejemplos/
//
// Necesita Playwright con Chromium (npm i -D playwright; npx playwright install chromium); sin él, dice cómo y termina
// sin error (la batería lo omite, como los oráculos de Python sin NumPy).
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compararCarpetas, paginasDelPDF, pdfSinFechas } from './comparar.mjs';
import { abrirPagina, FECHA_FIJA, huellaDeDibujo, prepararChromium } from './entorno.mjs';
import { elementosDeLista, seccionDe } from '../../src/ejemplos/markdown.js';
import { FORMATO_INDICE, leerCatalogo } from '../../src/ejemplos/catalogo.js';
import { accionEjecutable, accionValida } from '../../src/ejemplos/hazlo/planes.js';
import * as P from './pasos.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, '..', '..');
const CARPETA_EJEMPLOS = path.join(raiz, 'ejemplos');
/** Los casos, en el orden del índice (ejemplos/README.md). */
export const CASOS = ['01-correlacional', '02-comparativo', '03-predictivo', '04-instrumental', '05-estructural'];

/**
 * @typedef {object} Receta
 * @property {string} carpeta el nombre de la carpeta del caso en ejemplos/ (el mismo que su receta)
 * @property {string} titulo
 * @property {string} diseno el tipo de estudio («Correlacional»…)
 * @property {string} resumen lo que muestra, en una frase (para el índice, ejemplos/README.md)
 * @property {Record<string, string>} carpetas (2027.01.02) lo que guarda cada carpeta de análisis («analizador/2-afe»), para
 *   la pestaña «Ejemplos»
 * @property {{ desde: number, hasta: number, nota?: string }} repetir (2027.01.02) los pasos del Analizador (los de su
 *   README) que hay que volver a dar tras abrir su proyecto: los de antes los trae el proyecto y los de después son
 *   opcionales. Lo dicen su README («Cómo reproducirlo») y la guía de la pestaña «Ejemplos»
 * @property {(caso: Caso) => Promise<void>} recorrer lo que hace la persona en la página, guardando lo que descarga
 * @property {(caso: Caso) => string} leeme el README.md del caso, con las cifras que dio la página; también deja sus cifras
 *   clave en caso.destacar (2027.01.02: las tarjetas de la pestaña «Ejemplos»)
 */

/** Un caso en curso: la página, la carpeta de destino, lo guardado y las cifras para el README y la verificación. */
export class Caso {
    /** @param {any} pagina @param {string} destino @param {string} carpeta */
    constructor(pagina, destino, carpeta) {
        this.pagina = pagina;
        this.destino = destino;
        this.carpeta = carpeta;
        /** @type {Map<string, Buffer>} ruta relativa (con «/») → bytes */
        this.archivos = new Map();
        /** @type {Record<string, any>} lo que el README cita de la página */
        this.cifras = {};
        /** @type {import('./calculos.mjs').Pedido[]} los análisis que se recalculan, en el orden en que se pidieron */
        this.pedidos = [];
        /** @type {import('./calculos.mjs').Comprobacion[]} lo que dieron en la página (tests/integration/ejemplos.test.js los recalcula) */
        this.comprobaciones = [];
        /** @type {Map<string, string>} ruta de cada PDF → su texto impreso (lo que se compara de él entre dos corridas) */
        this.impresos = new Map();
        /** @type {Map<string, string>} (2027.01.02) ruta de cada archivo → lo que es (lo pone el README: leeme.mjs, listaArchivos) */
        this.descripciones = new Map();
        /** @type {string[]} (2027.01.02) las cifras clave del caso, para su tarjeta en la pestaña «Ejemplos» */
        this.destacados = [];
        /** @type {Map<number, import('../../src/ejemplos/hazlo/planes.js').AccionDelGuion[]>} (2027.01.03) lo que se hizo en cada paso del README del Analizador, por su número */
        this.guiones = new Map();
    }
    /**
     * (2027.01.03) Da un paso del Analizador y lo anota en el guion de su paso del README (el que repite «Hazlo por mí» en la
     * pestaña «Ejemplos»): la acción y sus datos, tal cual, y lo que hace la página con ellos, por el mismo plan
     * (src/ejemplos/hazlo/planes.js). Los archivos que sube una acción (los CSV de la V de Aiken) son del caso, por su ruta.
     * @param {number} paso el número del paso en «## Qué se hizo en el Analizador»
     * @param {string} accion una de las de planes.js (y de pasos.mjs)
     * @param {Record<string, any>} [datos]
     * @returns {Promise<any>} lo que devuelve el paso en pasos.mjs
     */
    async hacer(paso, accion, datos = {}) {
        const a = { accion, datos: JSON.parse(JSON.stringify(datos)) };
        if (!Number.isInteger(paso) || paso < 1) throw new Error(`${this.carpeta}: «${accion}» con un número de paso que no es: ${paso}`);
        if (!accionValida(a)) throw new Error(`${this.carpeta}: el paso ${paso} lleva una acción que el guion no admite: ${JSON.stringify(a).slice(0, 200)}`);
        const guion = this.guiones.get(paso) || [];
        guion.push(a);
        this.guiones.set(paso, guion);
        const fn = /** @type {Record<string, (pagina: any, datos: any, opciones: any) => Promise<any>>} */ (/** @type {unknown} */ (P))[accion];
        return fn(this.pagina, datos, {
            archivo: (/** @type {string} */ ruta) => {
                const bytes = this.archivos.get(ruta);
                if (!bytes) throw new Error(`${this.carpeta}: «${ruta}» se sube y no se guardó antes en el caso`);
                return { nombre: /** @type {string} */ (ruta.split('/').pop()), bytes };
            },
        });
    }
    /**
     * (2027.01.02) Las cifras clave del caso, dos o tres frases cortas (las tarjetas de la pestaña «Ejemplos»).
     * @param {...string} lineas
     */
    destacar(...lineas) {
        if (!lineas.length || lineas.length > 4 || lineas.some(l => typeof l !== 'string' || !l.trim() || l.length > 120)) throw new Error(`${this.carpeta}: las cifras clave son de una a cuatro frases cortas`);
        this.destacados = lineas;
    }
    /**
     * Guarda un archivo del caso (lo que descargó la página, o una entrada que se le dio).
     * @param {string} relativa
     * @param {Buffer | Uint8Array | string} bytes
     */
    guardar(relativa, bytes) {
        if (this.archivos.has(relativa)) throw new Error(`${this.carpeta}: «${relativa}» se guardó dos veces`);
        const datos = typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : Buffer.from(bytes);
        this.archivos.set(relativa, datos);
        const ruta = path.join(this.destino, ...relativa.split('/'));
        fs.mkdirSync(path.dirname(ruta), { recursive: true });
        fs.writeFileSync(ruta, datos);
    }
    /**
     * Pide que un análisis se recalcule (en la página al terminar la receta; en Node, en la prueba sin navegador).
     * @param {string} tipo uno de los de calculos.mjs (TOLERANCIA)
     * @param {Record<string, any>} entrada con qué se pide
     */
    pedir(tipo, entrada) {
        this.pedidos.push({ tipo, entrada });
    }
    /**
     * Guarda un PDF que imprimió la página, con su texto impreso.
     * @param {string} relativa
     * @param {import('./acciones.mjs').Impreso} impreso
     */
    guardarImpreso(relativa, { bytes, texto }) {
        this.guardar(relativa, bytes);
        this.impresos.set(relativa, texto);
    }
}

/** El texto con saltos de línea de Windows, como los demás archivos de texto del proyecto. @param {string} t */
export const conCRLF = t => t.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');

/** SHA-256 en hexadecimal. @param {Buffer} b */
const huella = b => crypto.createHash('sha256').update(b).digest('hex');

/**
 * Lo que verificacion.json dice de un archivo: su tamaño y su huella (la de un PDF, sin sus fechas) y, de un PDF, sus
 * páginas y la huella de su texto impreso, que es lo que se compara entre dos corridas (comparar.mjs).
 * @param {Caso} caso
 * @param {string} ruta
 * @param {Buffer} b
 */
function descripcionDelArchivo(caso, ruta, b) {
    if (!/\.pdf$/i.test(ruta)) return { bytes: b.length, sha256: huella(b) };
    const texto = caso.impresos.get(ruta);
    if (texto === undefined) throw new Error(`${caso.carpeta}: «${ruta}» no se guardó con guardarImpreso`);
    return { bytes: b.length, sha256: huella(pdfSinFechas(b)), paginas: paginasDelPDF(b), impreso: huella(Buffer.from(texto, 'utf8')) };
}

/**
 * Los análisis pedidos por la receta, calculados en la página con sus mismas funciones (calculos.mjs), al terminar: los
 * archivos de entrada que necesitan (las valoraciones de los jueces) van con su texto.
 * @param {any} pagina
 * @param {Caso} caso
 * @returns {Promise<import('./calculos.mjs').Comprobacion[]>}
 */
async function calcularEnLaPagina(pagina, caso) {
    const rutas = new Set(caso.pedidos.flatMap(p => (p.entrada.criterios || []).map((/** @type {{ archivo: string }} */ k) => k.archivo)));
    const textos = Object.fromEntries([...rutas].map(r => {
        const b = caso.archivos.get(r);
        if (!b) throw new Error(`${caso.carpeta}: «${r}» se pide para recalcular y no se guardó`);
        return [r, b.toString('utf8')];
    }));
    return pagina.evaluate(async (/** @type {{ pedidos: any[], textos: Record<string, string> }} */ { pedidos, textos }) =>
        (await import('/tests/navegador/calculos.mjs')).comprobaciones(pedidos, textos), { pedidos: caso.pedidos, textos });
}

/**
 * Corre una receta en una página nueva y deja su carpeta completa en `destino`: lo descargado, verificacion.json y el
 * README.md. Falla si la página dio algún error. (2027.01.01) Se escribe en una carpeta temporal junto a `destino`, que
 * solo al final ocupa su lugar: una receta que falla a medias no deja el caso a medio borrar.
 * @param {Receta} receta
 * @param {string} destino
 * @returns {Promise<Caso>}
 */
export async function correrReceta(receta, destino) {
    const provisional = `${destino}.provisional-${process.pid}`;
    fs.rmSync(provisional, { recursive: true, force: true });
    fs.mkdirSync(provisional, { recursive: true });
    try {
        const caso = await correrEn(receta, provisional);
        fs.rmSync(destino, { recursive: true, force: true });
        fs.renameSync(provisional, destino);
        caso.destino = destino;
        return caso;
    } catch (e) {
        fs.rmSync(provisional, { recursive: true, force: true });
        throw e;
    }
}

/**
 * La corrida de una receta en una carpeta vacía.
 * @param {Receta} receta
 * @param {string} destino
 * @returns {Promise<Caso>}
 */
async function correrEn(receta, destino) {
    const { pagina, contexto, errores, cerrar } = await abrirPagina({ raiz });
    const caso = new Caso(pagina, destino, receta.carpeta);
    /** @type {{ navegador: string, dibujo: string }} */
    let entorno;
    try {
        await receta.recorrer(caso);
        caso.comprobaciones = await calcularEnLaPagina(pagina, caso);   // al final: nada de lo que ya se descargó cambia
        entorno = await huellaDeDibujo(contexto);   // con qué se dibujaron los PDF y las figuras del Word (comparar.mjs)
    } finally {
        await cerrar();
    }
    if (errores.length) throw new Error(`${receta.carpeta}: la página dio ${errores.length} error(es):\n  ` + errores.slice(0, 10).join('\n  '));
    const version = JSON.parse(fs.readFileSync(path.join(raiz, 'version.json'), 'utf8')).version;
    // (2027.01.02) el README primero: dice lo que es cada archivo y las cifras clave, que van también a verificacion.json
    // (la ficha del caso en la pestaña «Ejemplos»: ejemplos/indice.json)
    const leeme = conCRLF(receta.leeme(caso));
    if (!caso.destacados.length) throw new Error(`${receta.carpeta}: su README no dejó las cifras clave (caso.destacar)`);
    const verificacion = {
        caso: receta.carpeta,
        version,
        fecha: FECHA_FIJA,
        entorno,
        ficha: fichaDelCaso(receta, caso, leeme),
        comprobaciones: caso.comprobaciones,
        archivos: Object.fromEntries([...caso.archivos].map(([r, b]) => [r, { ...descripcionDelArchivo(caso, r, b), descripcion: caso.descripciones.get(r) || '' }])),
    };
    caso.guardar('verificacion.json', conCRLF(JSON.stringify(verificacion, null, 2) + '\n'));
    caso.guardar('README.md', leeme);
    return caso;
}

/**
 * (2027.01.02) La ficha del caso para la pestaña «Ejemplos»: sus cifras clave, los pasos que se dieron en el Analizador (los
 * de su README), cuáles se repiten tras abrir el proyecto y lo que guarda cada carpeta de análisis. Falla si falta algo de
 * eso. (2027.01.03) Y el guion de cada paso (lo que hizo la receta en él: caso.hacer), comprobado con lo que dice el README:
 * cada paso tiene el suyo; los de antes de los que se repiten, solo lo que trae el proyecto (los datos y la configuración);
 * los que se repiten, algún análisis; y los de después, ninguno (solo descargas o guardar el proyecto).
 * @param {Receta} receta
 * @param {Caso} caso
 * @param {string} leeme
 */
function fichaDelCaso(receta, caso, leeme) {
    const pasos = elementosDeLista(seccionDe(leeme, 'Qué se hizo en el Analizador'));
    if (!pasos.length) throw new Error(`${receta.carpeta}: su README no tiene los pasos del Analizador («## Qué se hizo en el Analizador»)`);
    const r = receta.repetir;
    if (!r || !Number.isInteger(r.desde) || !Number.isInteger(r.hasta) || r.desde < 1 || r.desde > r.hasta || r.hasta > pasos.length) {
        throw new Error(`${receta.carpeta}: «repetir» no son pasos seguidos de los ${pasos.length} de su README`);
    }
    const enCarpetas = [...new Set([...caso.archivos.keys()].filter(r => /^analizador\/[^/]+\//.test(r)).map(r => r.split('/').slice(0, 2).join('/')))].sort();
    const faltan = enCarpetas.filter(c => !receta.carpetas || !receta.carpetas[c]);
    if (faltan.length) throw new Error(`${receta.carpeta}: falta qué guarda ${faltan.join(', ')} (la propiedad «carpetas» de su receta)`);
    const sinArchivos = Object.keys(receta.carpetas || {}).filter(c => !enCarpetas.includes(c));
    if (sinArchivos.length) throw new Error(`${receta.carpeta}: «carpetas» nombra ${sinArchivos.join(', ')}, que no guardó nada`);
    const sinDescripcion = [...caso.archivos.keys()].filter(r => !caso.descripciones.has(r));
    if (sinDescripcion.length) throw new Error(`${receta.carpeta}: su README no dice qué es ${sinDescripcion.join(', ')}`);
    const fuera = [...caso.guiones.keys()].filter(n => n > pasos.length);
    if (fuera.length) throw new Error(`${receta.carpeta}: la receta anota los pasos ${fuera.join(', ')}, y su README tiene ${pasos.length}`);
    const guiones = pasos.map((_, i) => caso.guiones.get(i + 1) || []);
    guiones.forEach((g, i) => {
        const n = i + 1, nombres = g.map(a => a.accion).join(', ') || 'nada';
        if (!g.length) throw new Error(`${receta.carpeta}: el paso ${n} de su README no tiene guion (caso.hacer)`);
        if (n < r.desde && !g.every(a => a.accion === 'usarBaseDelSimulador' || a.accion === 'describirInvestigacion')) throw new Error(`${receta.carpeta}: el paso ${n} lo trae el proyecto («repetir»), pero hace ${nombres}`);
        if (n >= r.desde && n <= r.hasta && !g.some(accionEjecutable)) throw new Error(`${receta.carpeta}: el paso ${n} se repite («repetir») y no hace ningún análisis (${nombres})`);
        if (n > r.hasta && g.some(accionEjecutable)) throw new Error(`${receta.carpeta}: el paso ${n} es opcional («repetir»), pero hace un análisis (${nombres})`);
    });
    return {
        destacados: caso.destacados, pasos: pasos.map(p => p.replace(/\r\n/g, '\n')), repetir: { desde: r.desde, hasta: r.hasta, nota: r.nota || '' }, guiones,
        carpetas: enCarpetas.map(ruta => ({ ruta, titulo: receta.carpetas[ruta] })),
    };
}

/**
 * (2027.01.02) ejemplos/indice.json, el catálogo de la pestaña «Ejemplos» (src/ejemplos/catalogo.js): lo que dice cada caso
 * en su verificacion.json, en el orden de los casos. Sale solo de lo guardado: el mismo índice para las mismas carpetas.
 * @param {Receta[]} recetas
 * @param {string} carpetaEjemplos
 * @returns {string}
 */
export function indiceDeLosEjemplos(recetas, carpetaEjemplos) {
    const casos = recetas.map(r => {
        const v = JSON.parse(fs.readFileSync(path.join(carpetaEjemplos, r.carpeta, 'verificacion.json'), 'utf8'));
        if (!v.ficha) throw new Error(`ejemplos/${r.carpeta}: su verificacion.json no tiene la ficha del caso (rehazlo con «npm run ejemplos»)`);
        const archivos = Object.entries(/** @type {Record<string, { bytes: number, descripcion?: string }>} */ (v.archivos))
            .sort(([a], [b]) => a.localeCompare(b, 'es', { numeric: true }))
            .map(([ruta, a]) => ({ ruta, bytes: a.bytes, descripcion: a.descripcion || '' }));
        return { carpeta: r.carpeta, titulo: r.titulo, diseno: r.diseno, resumen: r.resumen, version: v.version, destacados: v.ficha.destacados, pasos: v.ficha.pasos, repetir: v.ficha.repetir, guiones: v.ficha.guiones, carpetas: v.ficha.carpetas, archivos };
    });
    const version = casos.map(c => c.version).sort().pop() || '';
    const texto = conCRLF(JSON.stringify({ formato: FORMATO_INDICE, version, casos }, null, 2) + '\n');
    leerCatalogo(texto);   // con la forma que lee la página
    return texto;
}

/**
 * El índice de ejemplos/ (su README.md): los casos, qué hay en cada carpeta, cómo se hicieron y cómo se comprueban.
 * @param {Receta[]} recetas
 * @returns {string}
 */
export function indice(recetas) {
    const filas = recetas.map((r, k) => `| ${k + 1} | [${r.titulo}](${r.carpeta}/README.md) | ${r.diseno} | ${r.resumen} |`);
    return `# Ejemplos de StatSim Pro

Cinco casos de uso hechos por la propia página. Cada uno se recorrió en un navegador de verdad (Chromium) como lo haría una persona: importar la configuración en el Simulador, generar la base, descargarla en todos sus formatos, pasarla al Analizador, analizar, exportar el Word, imprimir los resultados en PDF y guardar el proyecto. Lo que hay en cada carpeta es lo que descargó la página, sin retocar.

En la página, la pestaña **Ejemplos** los muestra uno por uno, deja descargar cada archivo (o el caso entero en un .zip) y los abre en StatSim con un clic, con sus pasos a la vista: en cada paso, «Muéstrame» señala dónde está cada control y «Hazlo por mí» repite el análisis a la vista, como se hizo en el caso.

> **Datos simulados.** Todas las bases las generó el Simulador con una configuración y una semilla fijas: sirven para ver qué hace cada sección y qué entrega, no son resultados de ninguna investigación.

| # | Caso | Diseño | Lo que muestra |
| --- | --- | --- | --- |
${filas.join('\n')}

## Qué hay en cada carpeta

- \`README.md\`: la pregunta del caso, lo que se configuró, lo que se pulsó en el Analizador y sus resultados, con las cifras que dio la página.
- \`simulador/\`: la configuración completa (el archivo maestro, para «Importar todo»), la base en CSV (dos variantes), SPSS (.sav) y Excel (.xlsx), el informe «pedido vs. obtenido» y su verificación impresa en PDF.
- \`analizador/\`: una carpeta por análisis, con el capítulo de Word (de las correlaciones), los resultados en texto y la página impresa en PDF; y las tarjetas de psicometría, con sus propios Word y CSV.
- \`proyecto.statsim\`: el proyecto completo, para abrirlo con Ayuda → «Abrir proyecto».
- \`verificacion.json\`: la huella de cada archivo y las cifras que se vuelven a calcular para comprobar el caso; también la ficha del caso (sus cifras clave y sus pasos).

Y, junto a las carpetas, \`indice.json\`: el catálogo que lee la pestaña «Ejemplos» (sale de las fichas de los casos).

## Cómo se hicieron

Con \`node tests/navegador/ejemplos.mjs generar\` (una receta por caso en \`tests/navegador/recetas/\`), que abre la página en Chromium con Playwright, sin red externa, con la zona horaria de Lima y el reloj fijo en el ${FECHA_TEXTO}: por eso las fechas de los archivos son esas y una segunda corrida da los mismos archivos, byte a byte (los PDF, con el mismo texto impreso). Los PDF salen del motor de impresión de Chromium con los estilos de impresión de la página, como «Imprimir → Guardar como PDF».

## Cómo se comprueban

- \`npm test\` (sin navegador): cada archivo sigue siendo el que generó la página (su huella), cada proyecto regenera bit a bit su base con el código del momento, la base es la misma en el proyecto, los CSV, el .sav y el .xlsx (y los códigos de sus categorías, en el proyecto, el .sav y el .xlsx), el Analizador vuelve a dar las cifras y los textos de \`verificacion.json\`, y la configuración de cada caso, importada en la página, da bit a bit su base.
- \`node tests/navegador/ejemplos.mjs comprobar\` (con Playwright): rehace cada caso en Chromium, pulsando los botones, y lo compara con su carpeta: cada archivo byte a byte, salvo los PDF, de los que se compara lo que dice el papel (su texto impreso) y su número de páginas, porque dos impresiones de la misma página no siempre dan los mismos bytes. Los PDF y las figuras del Word dependen además de las fuentes instaladas y de la versión de Chromium: en otra computadora, del Word se compara su texto (\`verificacion.json\` guarda la huella del dibujo con que se hicieron). La batería completa lo corre si encuentra Playwright.
- Tras un cambio que altere a propósito lo que entrega la página, \`node tests/navegador/ejemplos.mjs generar\` los rehace.

## Lo que no está

- El **Buscador**, el **Redactor** y el **Explorador**: dependen de las bases académicas en línea y de la IA, y estos ejemplos se generan sin red.
- Un estudio **pre-post**: el Simulador genera medidas repetidas, pero el Analizador aún no tiene pruebas para muestras relacionadas (t pareada, Wilcoxon).
- El **efecto indirecto** de una mediación con su intervalo: el Analizador estima los caminos del modelo estructural, no el producto a·b (el caso 5 lo explica).
`;
}

/** La fecha del reloj de los ejemplos, en palabras. */
const FECHA_TEXTO = '21 de octubre de 2026 a las 12:00 (Lima)';

/** @param {string} nombre @returns {Promise<Receta>} */
async function cargarReceta(nombre) {
    return (await import(new URL(`./recetas/${nombre}.mjs`, import.meta.url).href)).default;
}

async function principal() {
    const [orden = 'generar', ...nombres] = process.argv.slice(2);
    if (!['generar', 'comprobar'].includes(orden)) { console.error('Uso: node tests/navegador/ejemplos.mjs generar|comprobar [caso…]'); process.exit(2); }
    const { pw, motivo } = await prepararChromium();
    if (!pw) {
        console.log(`Se omiten los ejemplos: ${motivo}.`);
        return;
    }
    const elegidos = nombres.length ? nombres : CASOS;
    for (const n of elegidos) if (!CASOS.includes(n)) { console.error(`No hay un caso «${n}» (los casos: ${CASOS.join(', ')})`); process.exit(2); }
    let fallos = 0;
    const todas = await Promise.all(CASOS.map(cargarReceta));
    const textoIndice = conCRLF(indice(todas));
    if (orden === 'generar') { fs.mkdirSync(CARPETA_EJEMPLOS, { recursive: true }); fs.writeFileSync(path.join(CARPETA_EJEMPLOS, 'README.md'), textoIndice); }
    else if (!fs.existsSync(path.join(CARPETA_EJEMPLOS, 'README.md')) || fs.readFileSync(path.join(CARPETA_EJEMPLOS, 'README.md'), 'utf8') !== textoIndice) { fallos++; console.log('✗ ejemplos/README.md: no es el índice que dan las recetas'); }
    for (const nombre of elegidos) {
        const receta = await cargarReceta(nombre);
        const t0 = Date.now();
        if (orden === 'generar') {
            const caso = await correrReceta(receta, path.join(CARPETA_EJEMPLOS, receta.carpeta));
            console.log(`✓ ${receta.carpeta}: ${caso.archivos.size} archivos (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
        } else {
            const temporal = fs.mkdtempSync(path.join(os.tmpdir(), 'statsim-ejemplo-'));
            try {
                await correrReceta(receta, temporal);
                const { diferencias, mismoDibujo } = await compararCarpetas(temporal, path.join(CARPETA_EJEMPLOS, receta.carpeta));
                const como = mismoDibujo ? 'igual (byte a byte; los PDF, por su texto impreso y sus páginas)' : 'igual, salvo el dibujo (otra huella de dibujo: de los PDF se comparó su texto impreso y del Word, su texto)';
                if (diferencias.length) { fallos++; console.log(`✗ ${receta.carpeta}:\n    ` + diferencias.join('\n    ')); }
                else console.log(`✓ ${receta.carpeta}: ${como} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
            } finally {
                fs.rmSync(temporal, { recursive: true, force: true });
            }
        }
    }
    // (2027.01.02) el catálogo de la pestaña «Ejemplos», de lo guardado en cada caso
    const indiceJson = path.join(CARPETA_EJEMPLOS, 'indice.json');
    if (orden === 'generar') fs.writeFileSync(indiceJson, indiceDeLosEjemplos(todas, CARPETA_EJEMPLOS));
    else if (!fs.existsSync(indiceJson) || fs.readFileSync(indiceJson, 'utf8') !== indiceDeLosEjemplos(todas, CARPETA_EJEMPLOS)) { fallos++; console.log('✗ ejemplos/indice.json: no es el catálogo que dan las carpetas de los casos'); }
    if (fallos) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    principal().catch(e => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
}
