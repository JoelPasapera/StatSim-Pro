// @ts-check
// tests/integration/ejemplos.test.js — (2027.01.01) los ejemplos de ejemplos/ como prueba, sin navegador. Cada caso lo hizo
// la página en Chromium (tests/navegador/ejemplos.mjs); aquí se comprueba, con el código del momento, que (1) cada archivo
// sigue siendo el que descargó la página (su huella en verificacion.json; los PDF, sin su fecha de creación); (2) el
// proyecto regenera bit a bit su base desde la configuración que guarda (el Worker de generación, el mismo de la página);
// (3) la base es la misma en el proyecto, en los dos CSV, en el .sav, en el .xlsx y en los datos del Analizador, leídos con
// los lectores de la aplicación; y (4) el Analizador vuelve a dar lo que dio la página en cada análisis que pidió la
// receta (tests/navegador/calculos.mjs, el mismo cálculo en la página y aquí): la correlación, las regresiones, las
// comparaciones de grupos, la χ², los modelos del SEM, la fiabilidad de todas las escalas, la criba de los objetivos
// específicos, la V de Aiken, el AFE y la invarianza, cada uno con todas sus cifras y sus textos, y los mismos CSV de la V de
// Aiken y del AFE. Y (5) los códigos de las categorías («0 = Mujer; 1 = Hombre», de los que la regresión logística toma qué
// categoría es el 1) son los mismos en la base, en el .sav, en el .xlsx y en el proyecto del Analizador. Si un cambio altera a
// propósito lo que entrega la página, los ejemplos se rehacen con «npm run ejemplos».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CASOS } from '../navegador/ejemplos.mjs';
import { pdfSinFechas } from '../navegador/comparar.mjs';
import { VERSION } from '../../src/version.js';
import { leerProyecto } from '../../src/proyecto/paquete.js';
import { baseDesdeArchivos } from '../../src/core/data/base-archivos.js';
import { deJsonFiel } from '../../src/core/data/json-fiel.js';
import { BaseColumnar } from '../../src/core/data/base-columnar.js';
import { manejarMensaje } from '../../src/simulador/worker/generador.worker.js';
import { datosDeJson } from '../../src/analizador/motor/datos-proyecto.js';
import { leerCSV } from '../../src/analizador/motor/datos.js';
import { leerSav } from '../../src/core/data/sav/lector.js';
import { baseDesdeSav } from '../../src/analizador/motor/datos-spss.js';
import { leerXlsx } from '../../src/core/data/xlsx/lector.js';
import { baseDesdeXlsx } from '../../src/analizador/motor/datos-xlsx.js';
import { AnalizadorEstadistico } from '../../src/analizador/estadistica.js';
import { EtiquetasVariables } from '../../src/shared/etiquetas-variables.js';
import { csvResultados } from '../../src/analizador/psicometria/aiken-redaccion.js';
import { csvCargas } from '../../src/analizador/psicometria/afe-redaccion.js';
import { aNumero, esPerdido } from '../../src/core/data/celdas.js';
import { CRITERIO, calcular, diferencias, instantanea } from '../navegador/calculos.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const ejemplos = path.join(aqui, '..', '..', 'ejemplos');
const presentes = CASOS.filter(c => fs.existsSync(path.join(ejemplos, c, 'verificacion.json')));

/** Una celda comparable: el número, el texto sin espacios a los lados o «perdido». @param {unknown} v */
function celda(v) {
    if (esPerdido(v)) return 'perdido';
    if (typeof v === 'number') return v;
    const n = aNumero(v);
    return Number.isFinite(n) && /^\s*-?[\d.,]+(e-?\d+)?\s*$/i.test(String(v)) ? n : String(v).trim();
}

/**
 * El nombre de una columna en el .sav: SPSS no admite espacios ni otros signos en los nombres de variable, y el escritor
 * los cambia por «_» (core/data/sav/escritor.js: «Promedio ponderado» → «Promedio_ponderado»; el nombre original va en
 * la etiqueta de la variable).
 * @param {string} nombre
 */
const nombreEnSpss = nombre => nombre.normalize('NFC').trim().replace(/[^\p{L}\p{N}_.@#$]/gu, '_');

/**
 * Las filas de dos lecturas de la misma base, columna a columna en su orden y celda por celda (los números, con la
 * tolerancia de su redondeo al escribirlos).
 * @param {Array<Record<string, unknown>>} a la lectura que se comprueba
 * @param {Array<Record<string, unknown>>} b la base del proyecto
 * @param {string} que
 * @param {(nombre: string) => string} [renombrar] el nombre que lleva en `a` cada columna de `b`
 */
function mismasFilas(a, b, que, renombrar = n => n) {
    assert.equal(a.length, b.length, `${que}: ${a.length} filas frente a ${b.length}`);
    const columnasA = Object.keys(a[0] || {}), columnasB = Object.keys(b[0] || {});
    assert.deepEqual(columnasA, columnasB.map(renombrar), `${que}: las columnas`);
    for (let i = 0; i < a.length; i++) {
        columnasA.forEach((col, j) => {
            const x = celda(/** @type {any} */ (a[i])[col]), y = celda(/** @type {any} */ (b[i])[columnasB[j]]);
            if (typeof x === 'number' && typeof y === 'number') assert.ok(Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x)), `${que}: fila ${i + 1}, ${col}: ${x} frente a ${y}`);
            else assert.equal(x, y, `${que}: fila ${i + 1}, ${col}`);
        });
    }
}

for (const nombre of presentes) {
    const carpeta = path.join(ejemplos, nombre);
    const verificacion = JSON.parse(fs.readFileSync(path.join(carpeta, 'verificacion.json'), 'utf8'));
    const leer = (/** @type {string} */ relativa) => fs.readFileSync(path.join(carpeta, ...relativa.split('/')));
    /** @type {Promise<any>} */
    const proyecto = leerProyecto(new Uint8Array(leer('proyecto.statsim')));
    /** Las partes del proyecto que se usan en varias pruebas. */
    const partes = proyecto.then(p => {
        const sim = p.partes.find((/** @type {any} */ x) => x.seccion === 'simulador'), ana = p.partes.find((/** @type {any} */ x) => x.seccion === 'analizador');
        const base = baseDesdeArchivos(sim.archivos, 'base', { maximoFilas: 1e6 });
        const generacion = deJsonFiel(new TextDecoder().decode(sim.archivos.get('generacion.json')));
        const filasAnalizador = datosDeJson(new TextDecoder().decode(ana.archivos.get('datos.json')));
        const metaAnalizador = JSON.parse(new TextDecoder().decode(ana.archivos.get('etiquetas.json')));
        return { base, generacion, filasAnalizador, metaAnalizador };
    });

    test(`${nombre}: su verificacion.json dice de qué versión es y con qué navegador se dibujó`, t => {
        assert.match(String(verificacion.version), /^\d{4}\.\d{2}\.\d{2}$/);
        assert.ok(verificacion.entorno && /^[0-9a-f]{64}$/.test(verificacion.entorno.dibujo), 'la huella del dibujo de sus PDF');
        // (revisión) de otra versión no es un fallo: lo que se comprueba es que el código del momento dé lo mismo; solo se avisa
        if (verificacion.version !== VERSION) t.diagnostic(`ejemplos/${nombre} es de la ${verificacion.version} (la página es la ${VERSION}); si cambió lo que entrega, rehazlo con «npm run ejemplos»`);
    });

    test(`${nombre}: cada archivo es el que descargó la página (su huella)`, () => {
        const listados = Object.keys(verificacion.archivos).sort();
        const enCarpeta = [];
        const recorrer = (/** @type {string} */ dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) recorrer(p); else enCarpeta.push(path.relative(carpeta, p).split(path.sep).join('/')); } };
        recorrer(carpeta);
        assert.deepEqual(enCarpeta.filter(r => r !== 'README.md' && r !== 'verificacion.json').sort(), listados, 'los archivos de la carpeta son los de verificacion.json');
        for (const r of listados) {
            const b = leer(r), esperado = verificacion.archivos[r];
            const huella = crypto.createHash('sha256').update(r.toLowerCase().endsWith('.pdf') ? pdfSinFechas(b) : b).digest('hex');
            assert.equal(huella, esperado.sha256, `${r}: no es el archivo que generó la página (¿se abrió y se guardó con otro programa?)`);
        }
    });

    test(`${nombre}: el proyecto regenera bit a bit su base`, async () => {
        const { base, generacion } = await partes;
        /** @type {any} */
        let listo = null;
        manejarMensaje({ id: 1, configuracion: structuredClone(generacion.configuracion) }, (/** @type {any} */ m) => { if (m.tipo === 'listo') listo = m; if (m.tipo === 'error') assert.fail(m.mensaje); });
        const nueva = BaseColumnar.desdeSerializado(listo.base);
        assert.deepEqual(nueva.nombres(), base.nombres(), 'las mismas columnas');
        for (const c of base.columnas) {
            const o = /** @type {any} */ (nueva.columnas.find((/** @type {any} */ x) => x.nombre === c.nombre));
            assert.ok(Buffer.from(c.datos.buffer, c.datos.byteOffset, c.datos.byteLength).equals(Buffer.from(o.datos.buffer, o.datos.byteOffset, o.datos.byteLength)), `la columna ${c.nombre}, bit a bit`);
        }
    });

    test(`${nombre}: la base es la misma en el proyecto, los CSV, el .sav, el .xlsx y el Analizador`, async () => {
        const { base, filasAnalizador } = await partes;
        const filas = base.aObjetos();
        mismasFilas(leerCSV(leer('simulador/base_datos_simulada_internacional.csv').toString('utf8')), filas, 'el CSV internacional');
        mismasFilas(leerCSV(leer('simulador/base_datos_simulada_excel_espanol.csv').toString('utf8')), filas, 'el CSV para Excel en español');
        mismasFilas(baseDesdeSav(await leerSav(new Uint8Array(leer('simulador/base_datos_simulada.sav')))).filas, filas, 'el .sav', nombreEnSpss);
        mismasFilas(baseDesdeXlsx(await leerXlsx(new Uint8Array(leer('simulador/base_datos_simulada.xlsx'))), 0).filas, filas, 'el .xlsx (hoja Datos)');
        mismasFilas(filasAnalizador, filas, 'los datos del Analizador en el proyecto');
    });

    test(`${nombre}: los códigos de las categorías son los mismos en la base, el .sav, el .xlsx y el proyecto del Analizador`, async () => {
        const { base, metaAnalizador } = await partes;
        const codigos = base.codigosDeCategorias();
        assert.ok(Array.isArray(codigos.Sexo) && codigos.Sexo.length === 2, 'la base del Simulador trae los de Sexo');
        const enSpss = Object.fromEntries(Object.entries(codigos).map(([k, v]) => [nombreEnSpss(k), v]));
        assert.deepEqual(baseDesdeSav(await leerSav(new Uint8Array(leer('simulador/base_datos_simulada.sav')))).codigosDeCategorias, enSpss, 'el .sav (sus etiquetas de valor)');
        assert.deepEqual(baseDesdeXlsx(await leerXlsx(new Uint8Array(leer('simulador/base_datos_simulada.xlsx'))), 0).codigosDeCategorias, codigos, 'el .xlsx (la columna «Valores» de su Diccionario)');
        assert.deepEqual(metaAnalizador.codigosDeCategorias, codigos, 'el proyecto del Analizador (etiquetas.json)');
    });

    test(`${nombre}: el Analizador vuelve a dar lo que dio la página`, async () => {
        const { filasAnalizador, metaAnalizador } = await partes;
        AnalizadorEstadistico.cargarDatos(filasAnalizador, { codigosDeCategorias: metaAnalizador.codigosDeCategorias || null });
        EtiquetasVariables.fijar(metaAnalizador.etiquetas || {}, metaAnalizador.estructura || []);
        assert.ok(verificacion.comprobaciones.length > 0, 'el caso tiene análisis que recalcular');
        for (const c of verificacion.comprobaciones) {
            const resultado = calcular(c, ruta => leer(ruta).toString('utf8'));
            const difs = diferencias(instantanea(resultado), c.resultado, CRITERIO[c.tipo] || { tolerancia: 1e-9, ignorar: [] });
            assert.deepEqual(difs, [], `${c.tipo} ${JSON.stringify(c.entrada).slice(0, 160)}: no da lo que dio la página`);
            // y lo que descargan sus tarjetas, byte a byte
            if (c.tipo === 'aiken' && c.entrada.csv) assert.equal('\ufeff' + csvResultados(/** @type {any} */ (resultado)), leer(c.entrada.csv).toString('utf8'), 'el CSV de la V de Aiken');
            if (c.tipo === 'afe' && c.entrada.csv) assert.equal('\ufeff' + csvCargas(/** @type {any} */ (resultado)), leer(c.entrada.csv).toString('utf8'), 'el CSV de las cargas del AFE');
        }
    });
}

test('hay ejemplos que comprobar', () => {
    assert.ok(presentes.length > 0, 'la carpeta ejemplos/ no tiene casos con verificacion.json');
});
