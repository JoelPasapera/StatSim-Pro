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
// (2027.01.02) Y (6) el proyecto de cada caso trae la configuración de la investigación (lo que su README y la guía de la
// pestaña «Ejemplos» dan por hecho al abrirlo), y (7) ejemplos/indice.json, el catálogo de la pestaña, es el que dan las
// carpetas de los casos: sus archivos, con sus tamaños, y las fichas de sus verificacion.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CASOS, indiceDeLosEjemplos } from '../navegador/ejemplos.mjs';
import { investigacionValida } from '../../src/analizador/motor/datos-proyecto.js';
import { leerCatalogo } from '../../src/ejemplos/catalogo.js';
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

    test(`${nombre}: su proyecto trae la configuración de la investigación (al abrirlo solo se repiten los análisis)`, async () => {
        const { metaAnalizador } = await partes;
        assert.ok(investigacionValida(metaAnalizador.investigacion), 'el título, la unidad de análisis y el lugar');
        assert.ok(metaAnalizador.investigacion.titulo.length > 20 && metaAnalizador.investigacion.unidad && metaAnalizador.investigacion.lugar, JSON.stringify(metaAnalizador.investigacion));
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

test('ejemplos/indice.json es el catálogo que dan las carpetas de los casos (el de la pestaña «Ejemplos»)', { skip: presentes.length !== CASOS.length && 'faltan casos' }, async () => {
    const recetas = await Promise.all(CASOS.map(async c => (await import(new URL(`../navegador/recetas/${c}.mjs`, import.meta.url).href)).default));
    const texto = fs.readFileSync(path.join(ejemplos, 'indice.json'), 'utf8');
    assert.equal(texto, indiceDeLosEjemplos(recetas, ejemplos), 'rehazlo con «npm run ejemplos»');
    const catalogo = leerCatalogo(texto);
    assert.deepEqual(catalogo.casos.map(e => e.carpeta), CASOS);
    for (const e of catalogo.casos) {
        const verificacion = JSON.parse(fs.readFileSync(path.join(ejemplos, e.carpeta, 'verificacion.json'), 'utf8'));
        assert.deepEqual(e.archivos.map(a => a.ruta).sort(), Object.keys(verificacion.archivos).sort(), `${e.carpeta}: los mismos archivos`);
        for (const a of e.archivos) {
            assert.equal(fs.statSync(path.join(ejemplos, e.carpeta, ...a.ruta.split('/'))).size, a.bytes, `${e.carpeta}/${a.ruta}: su tamaño`);
            assert.ok(a.descripcion.length > 10, `${e.carpeta}/${a.ruta}: lo que es`);
        }
        assert.ok(e.destacados.length >= 1 && e.pasos.length >= 3 && e.repetir.hasta <= e.pasos.length, e.carpeta);
        assert.ok(/Guardar proyecto/.test(e.pasos[e.pasos.length - 1]), `${e.carpeta}: el último paso es guardar el proyecto (opcional al abrirlo)`);
        assert.ok(e.repetir.hasta < e.pasos.length, `${e.carpeta}: guardar el proyecto no está entre lo que se repite`);
    }
});

test('(2027.01.07) el índice no se escribe con un caso cuyos guiones no cumplen las reglas de la guía (la página lo leería sin ellos)', { skip: presentes.length !== CASOS.length && 'faltan casos' }, async () => {
    const recetas = await Promise.all(CASOS.map(async c => (await import(new URL(`../navegador/recetas/${c}.mjs`, import.meta.url).href)).default));
    const otra = fs.mkdtempSync(path.join(os.tmpdir(), 'statsim-indice-'));
    const avisar = console.warn;
    try {
        for (const c of CASOS) {
            fs.mkdirSync(path.join(otra, c));
            fs.copyFileSync(path.join(ejemplos, c, 'verificacion.json'), path.join(otra, c, 'verificacion.json'));
        }
        assert.equal(indiceDeLosEjemplos(recetas, otra), fs.readFileSync(path.join(ejemplos, 'indice.json'), 'utf8'), 'con las de verdad, el mismo índice');
        // el caso 2, con otra comparación de grupos en el paso 4 (la de su paso 3 ya está): no cumple «cada tarjeta, una vez»
        const ruta = path.join(otra, '02-comparativo', 'verificacion.json');
        const v = JSON.parse(fs.readFileSync(ruta, 'utf8'));
        v.ficha.guiones[3] = [{ accion: 'compararGrupos', datos: { grupo: 'Sexo', numerica: 'General_I' } }, ...v.ficha.guiones[3]];
        fs.writeFileSync(ruta, JSON.stringify(v));
        console.warn = () => {};
        assert.throws(() => indiceDeLosEjemplos(recetas, otra), /^Error: ejemplos\/02-comparativo: sus guiones no cumplen las reglas de la guía/);
    } finally {
        console.warn = avisar;
        fs.rmSync(otra, { recursive: true, force: true });
    }
});
