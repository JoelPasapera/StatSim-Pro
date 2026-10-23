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
 * @property {(caso: Caso) => Promise<void>} recorrer lo que hace la persona en la página, guardando lo que descarga
 * @property {(caso: Caso) => string} leeme el README.md del caso, con las cifras que dio la página
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
    const verificacion = {
        caso: receta.carpeta,
        version,
        fecha: FECHA_FIJA,
        entorno,
        comprobaciones: caso.comprobaciones,
        archivos: Object.fromEntries([...caso.archivos].map(([r, b]) => [r, descripcionDelArchivo(caso, r, b)])),
    };
    caso.guardar('verificacion.json', conCRLF(JSON.stringify(verificacion, null, 2) + '\n'));
    caso.guardar('README.md', conCRLF(receta.leeme(caso)));
    return caso;
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

> **Datos simulados.** Todas las bases las generó el Simulador con una configuración y una semilla fijas: sirven para ver qué hace cada sección y qué entrega, no son resultados de ninguna investigación.

| # | Caso | Diseño | Lo que muestra |
| --- | --- | --- | --- |
${filas.join('\n')}

## Qué hay en cada carpeta

- \`README.md\`: la pregunta del caso, lo que se configuró, lo que se pulsó en el Analizador y sus resultados, con las cifras que dio la página.
- \`simulador/\`: la configuración completa (el archivo maestro, para «Importar todo»), la base en CSV (dos variantes), SPSS (.sav) y Excel (.xlsx), el informe «pedido vs. obtenido» y su verificación impresa en PDF.
- \`analizador/\`: una carpeta por análisis, con el capítulo de Word (de las correlaciones), los resultados en texto y la página impresa en PDF; y las tarjetas de psicometría, con sus propios Word y CSV.
- \`proyecto.statsim\`: el proyecto completo, para abrirlo con Ayuda → «Abrir proyecto».
- \`verificacion.json\`: la huella de cada archivo y las cifras que se vuelven a calcular para comprobar el caso.

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
    if (fallos) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    principal().catch(e => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
}
