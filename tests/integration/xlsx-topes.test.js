// tests/integration/xlsx-topes.test.js — (2026.12.31, revisión) los libros de Excel y los proyectos hechos para colgar la
// página o agotar su memoria (o dañados de una forma que lo haría): se rechazan enseguida, con un mensaje que dice qué
// pasa, antes de reservar la memoria que piden. Una fila más allá de la última de Excel, una celda más allá de la columna
// XFD, una hoja dispersa con celdas sueltas muy a la derecha, una celda con decenas de miles de tramos de formato, partes
// y libros más grandes que los topes, y un proyecto con archivos de más o repetidos. Y una hoja de 50 000 filas con una
// celda perdida en la columna XFD se convierte para el Analizador en un momento (antes, 17 s). Y el escritor da a las
// hojas nombres que Excel admite aunque se le pidan otros.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerXlsx, MAXIMO_CASILLAS, MAXIMO_LIBRO, MAXIMO_PARTE } from '../../src/core/data/xlsx/lector.js';
import { escribirXlsx } from '../../src/core/data/xlsx/escritor.js';
import { escribirZip, unirTrozos } from '../../src/core/data/zip/escritor.js';
import { baseDesdeXlsx } from '../../src/analizador/motor/datos-xlsx.js';
import { escribirProyecto, leerProyecto, MAXIMO_ARCHIVO, MAXIMO_PROYECTO } from '../../src/proyecto/paquete.js';

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const RELS = 'http://schemas.openxmlformats.org/package/2006/relationships';

/**
 * Un libro mínimo escrito a mano: sus hojas (el XML de dentro de <sheetData>) y, si se dan, sus cadenas compartidas.
 * @param {string[]} hojas @param {string | null} [cadenas]
 */
async function libroAMano(hojas, cadenas = null) {
    const entradas = [
        { nombre: '[Content_Types].xml', contenido: '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>' },
        { nombre: '_rels/.rels', contenido: `<Relationships xmlns="${RELS}"><Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
        { nombre: 'xl/workbook.xml', contenido: `<workbook xmlns="${NS}" xmlns:r="${R}"><sheets>${hojas.map((_, k) => `<sheet name="H${k + 1}" sheetId="${k + 1}" r:id="rId${k + 1}"/>`).join('')}</sheets></workbook>` },
        { nombre: 'xl/_rels/workbook.xml.rels', contenido: `<Relationships xmlns="${RELS}">${hojas.map((_, k) => `<Relationship Id="rId${k + 1}" Type="${R}/worksheet" Target="worksheets/sheet${k + 1}.xml"/>`).join('')}${cadenas !== null ? `<Relationship Id="rIdS" Type="${R}/sharedStrings" Target="sharedStrings.xml"/>` : ''}</Relationships>` },
        ...hojas.map((xml, k) => ({ nombre: `xl/worksheets/sheet${k + 1}.xml`, contenido: `<worksheet xmlns="${NS}"><sheetData>${xml}</sheetData></worksheet>` }))
    ];
    if (cadenas !== null) entradas.push({ nombre: 'xl/sharedStrings.xml', contenido: `<sst xmlns="${NS}">${cadenas}</sst>` });
    return unirTrozos(await escribirZip(entradas));
}

/** Que una promesa se rechace con este mensaje, y pronto. */
async function rechazaPronto(promesa, mensaje, ms = 3000) {
    const t0 = Date.now();
    await assert.rejects(promesa, mensaje);
    assert.ok(Date.now() - t0 < ms, `en ${Date.now() - t0} ms`);
}

test('los topes por omisión: los que dice la documentación', () => {
    assert.equal(MAXIMO_PARTE, 256 * 1024 * 1024);
    assert.equal(MAXIMO_LIBRO, 512 * 1024 * 1024);
    assert.equal(MAXIMO_CASILLAS, 50e6);
    assert.equal(MAXIMO_ARCHIVO, 512 * 1024 * 1024);
    assert.equal(MAXIMO_PROYECTO, 1024 * 1024 * 1024);
});

test('una fila más allá de la última de Excel, o una celda más allá de la columna XFD: un libro dañado, enseguida', async () => {
    // antes: 2 000 millones de filas vacías reservadas, 4 s y «Invalid array length»
    await rechazaPronto(leerXlsx(await libroAMano(['<row r="2000000000"><c t="inlineStr"><is><t>x</t></is></c></row>'])),
        /^Error: El libro de Excel está dañado: la hoja «H1» tiene una fila más allá de la última de Excel \(la 1\.048\.576\)\. Vuelve a guardarlo en Excel/);
    await rechazaPronto(leerXlsx(await libroAMano(['<row r="1048577"><c><v>1</v></c></row>'])), /una fila más allá de la última de Excel/);
    // la última fila y la última columna, sí
    const ultima = await leerXlsx(await libroAMano(['<row r="1048576"><c r="XFD1048576"><v>7</v></c></row>']));
    assert.equal(ultima.hojas[0].filas.length, 1048576);
    assert.equal(ultima.hojas[0].filas[1048575].length, 16384);
    // celdas sin referencia, una tras otra, más allá de XFD
    await rechazaPronto(leerXlsx(await libroAMano([`<row r="1">${'<c><v>1</v></c>'.repeat(16385)}</row>`])),
        /^Error: El libro de Excel está dañado: la hoja «H1» tiene una celda más allá de la última columna de Excel \(la XFD\)/);
    // y una fila 0 (que ningún programa escribe) se sigue leyendo como antes, como la primera
    const cero = await leerXlsx(await libroAMano(['<row r="0"><c><v>5</v></c></row>']));
    assert.deepEqual(cero.hojas[0].filas, [[5]]);
});

test('una hoja con celdas sueltas muy a la derecha en muchas filas: demasiado grande, antes de reservar sus casillas', async () => {
    const xml = Array.from({ length: 50 }, (_, i) => `<row r="${i + 1}"><c r="A${i + 1}"><v>${i}</v></c><c r="XFD${i + 1}"><v>1</v></c></row>`).join('');
    await rechazaPronto(leerXlsx(await libroAMano([xml]), { topes: { casillas: 500000 } }),
        /^Error: La hoja «H1» es demasiado grande para leerla aquí: sus filas llegan hasta columnas tan a la derecha como la XFD \(más de 0,5 millones de casillas\)\. Guarda como CSV solo las columnas que necesitas/);
    // con el tope por omisión, la misma hoja se lee (50 × 16 384 casillas)
    const libro = await leerXlsx(await libroAMano([xml]));
    assert.equal(libro.hojas[0].columnas, 16384);
});

test('una celda con 40 000 tramos de formato se lee en tiempo lineal (antes, 46 s)', async () => {
    const tramos = 40000;
    const si = '<si>' + Array.from({ length: tramos }, (_, i) => `<r><rPr><b/></rPr><t>tramo ${i} </t></r>`).join('') + '</si>';
    const t0 = Date.now();
    const libro = await leerXlsx(await libroAMano(['<row r="1"><c r="A1" t="s"><v>0</v></c></row>'], si));
    const ms = Date.now() - t0;
    assert.ok(ms < 3000, `${ms} ms`);
    const texto = /** @type {string} */ (libro.hojas[0].filas[0][0]);
    assert.ok(texto.startsWith('tramo 0 tramo 1 ') && texto.endsWith(`tramo ${tramos - 1} `));
    // con guías fonéticas entre los tramos, se saltan igual
    const conFonetica = '<si><r><t>漢</t></r><rPh sb="0" eb="1"><t>かん</t></rPh><r><t>字</t></r><rPh sb="1" eb="2"><t>じ</t></rPh><r><t>!</t></r></si>';
    const l2 = await leerXlsx(await libroAMano(['<row r="1"><c r="A1" t="s"><v>0</v></c></row>'], conFonetica));
    assert.equal(l2.hojas[0].filas[0][0], '漢字!');
});

test('una parte, o el libro entero, más grandes que los topes: demasiado grande, antes de descomprimir', async () => {
    const hoja = Array.from({ length: 3000 }, (_, i) => `<row r="${i + 1}"><c r="A${i + 1}"><v>${i}</v></c><c r="B${i + 1}" t="inlineStr"><is><t>texto ${i}</t></is></c></row>`).join('');
    const bytes = await libroAMano([hoja, hoja, hoja]);
    await rechazaPronto(leerXlsx(bytes, { topes: { parte: 50000 } }),
        /^Error: El libro de Excel es demasiado grande para leerlo aquí: «xl\/worksheets\/sheet1\.xml» ocupa \d+ KB sin comprimir\. Guarda la hoja que necesitas como CSV y cárgala así$/);
    await rechazaPronto(leerXlsx(bytes, { topes: { libro: 400000 } }),
        /^Error: El libro de Excel es demasiado grande para leerlo aquí: sus hojas ocupan más de 391 KB sin comprimir\. Guarda la hoja que necesitas como CSV y cárgala así$/);
    const libro = await leerXlsx(bytes);
    assert.deepEqual(libro.hojas.map(h => h.filas.length), [3000, 3000, 3000]);
});

test('el Analizador: una hoja de 50 000 filas con una celda perdida en la columna XFD, en un momento', async () => {
    const n = 50000;
    const filas = Array.from({ length: n }, (_, i) => [i, i % 7, i % 3, 'A', i / 3]);
    filas[0] = Object.assign(new Array(16384).fill(null), { 0: 0, 1: 0, 2: 0, 3: 'A', 4: 0, 16383: 'nota perdida' });
    filas.unshift(['ID', 'X', 'Y', 'G', 'Z']);
    const libro = await leerXlsx(unirTrozos((await escribirXlsx([{ nombre: 'D', filas }])).trozos));
    assert.equal(libro.hojas[0].columnas, 16384);
    const t0 = Date.now();
    const base = baseDesdeXlsx(libro, 0);
    const ms = Date.now() - t0;
    assert.ok(ms < 3000, `${ms} ms`);
    assert.deepEqual(base.columnas, ['ID', 'X', 'Y', 'G', 'Z', 'Columna_XFD']);
    assert.equal(base.filas.length, n);
    assert.equal(base.filas[0].Columna_XFD, 'nota perdida');
    assert.equal(base.filas[1].Columna_XFD, null);
});

test('el escritor: nombres de hoja que Excel admite, distintos entre sí, aunque se le pidan otros', async () => {
    const pedidos = ['a'.repeat(30) + "'b", '🎉'.repeat(31), "''", 'HISTORY', 'x'.repeat(29) + ' (', 'Hoja\uFFFE', 'a'.repeat(30) + ' b', ' Datos: 2024/25 ', 'datos  2024 25', "'citado'", 'mal\uD800suplente'];
    const { trozos, avisos } = await escribirXlsx(pedidos.map(n => ({ nombre: n, filas: [[1]] })));
    const nombres = (await leerXlsx(unirTrozos(trozos))).hojas.map(h => h.nombre);
    assert.deepEqual(nombres, ['a'.repeat(30), '🎉'.repeat(15), 'Hoja', 'Historial', 'x'.repeat(29) + ' (', 'Hoja (2)', 'a'.repeat(27) + ' (2)', 'Datos 2024 25', 'datos 2024 25 (2)', 'citado', 'mal suplente']);
    for (const n of nombres) {
        assert.ok(n.length >= 1 && n.length <= 31, `${n}: de 1 a 31 unidades`);
        assert.doesNotMatch(n, /^['\s]|['\s]$|[[\]:*?/\\]/, n);
    }
    assert.equal(new Set(nombres.map(n => n.toLowerCase())).size, nombres.length, 'distintos sin distinguir mayúsculas');
    assert.equal(avisos.length, nombres.filter((n, k) => n !== pedidos[k]).length, 'un aviso por cada nombre cambiado');
});

test('un proyecto con archivos más grandes que los topes, o con secciones o archivos repetidos: un error, sin extraer nada', async () => {
    const partes = [
        { seccion: 'analizador', titulo: 'el Analizador', resumen: '', archivos: { 'datos.json': JSON.stringify({ columnas: ['a'], valores: [Array.from({ length: 20000 }, (_, i) => i)] }) } },
        { seccion: 'aiken', titulo: 'la V de Aiken', resumen: '', archivos: { 'aiken.json': '{"minimo":1}'.padEnd(30000, ' ') } }
    ];
    const bytes = unirTrozos(await escribirProyecto(partes, { version: 'x' }));
    await assert.rejects(leerProyecto(bytes, { topes: { archivo: 50000 } }), /^Error: El proyecto es demasiado grande para abrirlo aquí: «analizador\/datos\.json» ocupa \d+ KB sin comprimir$/);
    await assert.rejects(leerProyecto(bytes, { topes: { proyecto: 120000 } }), /^Error: El proyecto es demasiado grande para abrirlo aquí: sus archivos ocupan más de 117 KB sin comprimir$/);
    assert.equal((await leerProyecto(bytes)).partes.length, 2);
    // el manifiesto con una sección o un archivo dos veces (cada vez se extraería otra copia)
    const { escribirZip: zip } = await import('../../src/core/data/zip/escritor.js');
    const conManifiesto = async secciones => unirTrozos(await zip([
        { nombre: 'proyecto.json', contenido: JSON.stringify({ formato: 'StatSim Pro — proyecto', versionFormato: 1, programa: 'StatSim Pro', version: 'x', guardado: '2026-10-20T00:00:00Z', secciones }) },
        { nombre: 'aiken/aiken.json', contenido: '{}' }
    ]));
    await assert.rejects(leerProyecto(await conManifiesto([{ seccion: 'aiken', archivos: ['aiken.json', 'aiken.json'] }])), /^Error: El proyecto está dañado: su manifiesto no tiene la forma esperada$/);
    await assert.rejects(leerProyecto(await conManifiesto([{ seccion: 'aiken', archivos: ['aiken.json'] }, { seccion: 'aiken', archivos: ['aiken.json'] }])), /su manifiesto no tiene la forma esperada/);
    assert.equal((await leerProyecto(await conManifiesto([{ seccion: 'aiken', archivos: ['aiken.json'] }]))).partes.length, 1);
});
