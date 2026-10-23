// @ts-check
// tests/navegador/comparar.mjs — (2027.01.01) cuándo dos corridas de un ejemplo dieron lo mismo. Byte a byte, salvo:
//   · los PDF: dos impresiones de la misma página dan el mismo dibujo, pero no siempre los mismos bytes (el orden en que
//     Chromium escribe lo dibujado y las coordenadas de los destinos de sus enlaces dependen de dónde quedaron el
//     desplazamiento y el ratón). De un PDF se compara lo que dice el papel —su texto impreso, cuya huella guarda
//     verificacion.json— y, con la misma huella de dibujo, su número de páginas;
//   · lo que depende de cómo dibuja el navegador, entre dos entornos con distinta huella de dibujo (entorno.mjs:
//     huellaDeDibujo; otra computadora, otras fuentes, otro Chromium): las figuras del Word (un SVG rasterizado en un
//     lienzo), de las que se compara el texto del documento, y el número de páginas de los PDF.
// En el README.md y en verificacion.json se pasan por alto, por eso, los tamaños y las huellas de esos archivos. Lo demás
// (las bases, el proyecto, los textos, los CSV) sigue byte a byte.
import fs from 'node:fs';
import path from 'node:path';
import { extraerZip, listarZip } from '../../src/core/data/zip/lector.js';

/**
 * Un PDF sin las fechas que le pone Chromium al imprimirlo (la de creación y la de modificación, del reloj del sistema y
 * no del de la página): la huella de un PDF guardado, para saber que es el que se generó (tests/integration/ejemplos.test.js).
 * @param {Buffer} b
 * @returns {Buffer}
 */
export function pdfSinFechas(b) {
    return Buffer.from(b.toString('latin1').replace(/\/(CreationDate|ModDate) \(D:[^)]*\)/g, '/$1 (D:)'), 'latin1');
}

/** Las páginas de un PDF de Chromium (sus objetos /Type /Page). @param {Buffer} b */
export function paginasDelPDF(b) {
    return (b.toString('latin1').match(/\/Type\s*\/Page(?![A-Za-z])/g) || []).length;
}

/**
 * ¿Cambian sus bytes entre dos corridas aunque la página haga lo mismo? Los PDF siempre; los Word, con otra huella de dibujo.
 * @param {string} ruta
 * @param {boolean} mismoDibujo
 */
const bytesVariables = (ruta, mismoDibujo) => /\.pdf$/i.test(ruta) || (!mismoDibujo && /\.docx$/i.test(ruta));

/**
 * El Word sin los bytes de sus figuras: cada parte del paquete con su nombre y, del documento (word/afchunk.mht, el HTML
 * que Word abre), el HTML entero y una marca por cada imagen.
 * @param {Buffer} b
 * @returns {Promise<string>}
 */
async function wordSinFiguras(b) {
    const bytes = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
    /** @type {string[]} */
    const partes = [];
    for (const entrada of listarZip(bytes)) {
        const texto = Buffer.from(await extraerZip(bytes, entrada)).toString('utf8');
        partes.push(`${entrada.nombre}\n${entrada.nombre.endsWith('.mht') ? texto.replace(/(Content-Type: image\/[a-z]+[\s\S]*?\r?\n\r?\n)[A-Za-z0-9+/=\r\n]+/g, '$1[imagen]\n') : texto}`);
    }
    return partes.join('\n');
}

/**
 * El README de un caso sin el tamaño de los archivos cuyos bytes varían (la última celda de su fila en la tabla de archivos).
 * @param {string} t
 * @param {boolean} mismoDibujo
 */
const leemeComparable = (t, mismoDibujo) => t.replace(/^(\| \[([^\]]+)\]\([^)]*\) \|.*\| )[^|]*( \|\r?)$/gm,
    (fila, inicio, ruta, fin) => (bytesVariables(ruta, mismoDibujo) ? `${inicio}—${fin}` : fila));

/**
 * verificacion.json sin el entorno y, de los archivos cuyos bytes varían, sin su tamaño ni su huella: de un PDF quedan su
 * texto impreso y, con la misma huella de dibujo, sus páginas.
 * @param {Buffer} b
 * @param {boolean} mismoDibujo
 */
function verificacionComparable(b, mismoDibujo) {
    const v = JSON.parse(b.toString('utf8'));
    delete v.entorno;
    for (const [ruta, d] of Object.entries(v.archivos || {})) {
        if (/\.pdf$/i.test(ruta)) v.archivos[ruta] = mismoDibujo ? { paginas: d.paginas, impreso: d.impreso } : { impreso: d.impreso };
        else if (bytesVariables(ruta, mismoDibujo)) v.archivos[ruta] = 'depende del dibujo';
    }
    return JSON.stringify(v);
}

/**
 * Lo que se compara de un archivo de un ejemplo.
 * @param {string} ruta relativa a la carpeta del caso
 * @param {Buffer} b
 * @param {boolean} mismoDibujo ¿las dos corridas tienen la misma huella de dibujo?
 * @returns {Promise<Buffer | string>}
 */
export async function comparable(ruta, b, mismoDibujo) {
    // de un PDF, aquí, que lo sea: su texto impreso y sus páginas van en verificacion.json
    if (/\.pdf$/i.test(ruta)) return b.subarray(0, 5).toString('latin1') === '%PDF-' ? 'un PDF' : 'no es un PDF';
    if (/\.docx$/i.test(ruta) && !mismoDibujo) return wordSinFiguras(b);
    if (ruta === 'README.md') return leemeComparable(b.toString('utf8'), mismoDibujo);
    if (ruta === 'verificacion.json') return verificacionComparable(b, mismoDibujo);
    return b;
}

/** Los archivos de una carpeta, con su ruta relativa («/»). @param {string} carpeta @returns {string[]} */
export function listar(carpeta) {
    if (!fs.existsSync(carpeta)) return [];
    /** @type {string[]} */
    const fuera = [];
    const recorrer = (/** @type {string} */ dir) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) recorrer(p); else fuera.push(path.relative(carpeta, p).split(path.sep).join('/'));
        }
    };
    recorrer(carpeta);
    return fuera.sort();
}

/** La verificación de un caso (su verificacion.json), o null. @param {string} carpeta */
function verificacionDe(carpeta) {
    try { return JSON.parse(fs.readFileSync(path.join(carpeta, 'verificacion.json'), 'utf8')); } catch (e) { return null; }
}

/**
 * Compara la carpeta rehecha de un caso con la guardada: los mismos archivos y, cada uno, lo mismo (comparable). De cada
 * PDF que cambió, dice si cambió su texto impreso o sus páginas.
 * @param {string} rehecha
 * @param {string} guardada
 * @returns {Promise<{ diferencias: string[], mismoDibujo: boolean }>} las diferencias en palabras (vacía si son iguales)
 */
export async function compararCarpetas(rehecha, guardada) {
    const a = listar(rehecha), b = listar(guardada);
    const va = verificacionDe(rehecha), vb = verificacionDe(guardada);
    const huella = va && va.entorno ? va.entorno.dibujo : null;
    const mismoDibujo = !!huella && !!vb && !!vb.entorno && huella === vb.entorno.dibujo;
    /** @type {string[]} */
    const diferencias = [];
    for (const r of a.filter(x => !b.includes(x))) diferencias.push(`sobra en la rehecha (falta en ejemplos/): ${r}`);
    for (const r of b.filter(x => !a.includes(x))) diferencias.push(`falta en la rehecha (está en ejemplos/): ${r}`);
    for (const r of a.filter(x => b.includes(x))) {
        const x = fs.readFileSync(path.join(rehecha, r)), y = fs.readFileSync(path.join(guardada, r));
        const cx = await comparable(r, x, mismoDibujo), cy = await comparable(r, y, mismoDibujo);
        const iguales = typeof cx === 'string' || typeof cy === 'string' ? cx === cy : cx.equals(cy);
        if (!iguales) diferencias.push(`distinto: ${r} (${x.length} frente a ${y.length} bytes)`);
        if (/\.pdf$/i.test(r) && va && vb) {
            const da = (va.archivos || {})[r] || {}, db = (vb.archivos || {})[r] || {};
            if (da.impreso !== db.impreso) diferencias.push(`distinto: ${r}, su texto impreso`);
            if (mismoDibujo && da.paginas !== db.paginas) diferencias.push(`distinto: ${r}, sus páginas (${da.paginas} frente a ${db.paginas})`);
        }
    }
    return { diferencias, mismoDibujo };
}
