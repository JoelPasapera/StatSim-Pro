// tests/ui/excel.test.js — (2026.12.31) Excel en la interfaz, de extremo a extremo sobre index.html: el Simulador descarga
// su base como libro (.xlsx) desde su botón, y el Analizador lo carga con las etiquetas de su diccionario; un libro de
// otro programa con varias hojas ofrece el selector de hojas y cambia de hoja sin volver a leerlo; las hojas que no sirven
// se saltan; lo que no es un .xlsx (un .xls, un .ods, un libro cifrado) da un error claro y deja la base anterior; y los
// nombres de hojas y columnas con forma de HTML no se ejecutan.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';

const raiz = new URL('../../', import.meta.url);
let env, carga, A, EV, resultado, escribirXlsx, unirTrozos, leerXlsx, generadorDePrueba;
const q = sel => globalThis.document.querySelector(sel);
const toast = () => ({ texto: q('#toast').textContent, tipo: q('#toast').className });
const esperar = async (cond, ms = 15000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error('tiempo de espera agotado'); await new Promise(r => setTimeout(r, 20)); } };

/** Un archivo como el que da el selector. */
const archivo = (nombre, bytes) => ({ name: nombre, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
async function elegir(f) {
    const entrada = { files: [f], value: 'C:\\fakepath\\' + f.name };
    await carga.cargarArchivo({ target: entrada });
    return entrada;
}
const fixture = nombre => new Uint8Array(fs.readFileSync(new URL(`tests/oracle/xlsx/${nombre}`, raiz)));
const libro = async (hojas) => unirTrozos((await escribirXlsx(hojas)).trozos);

before(async () => {
    env = crearEntorno(fs.readFileSync(new URL('index.html', raiz), 'utf8'));
    env.document.readyState = 'interactive';
    globalThis.fetch = () => Promise.reject(new Error('sin red'));
    await import(new URL('src/main.js', raiz));
    await new Promise(r => setTimeout(r, 0));
    env.document.readyState = 'complete';
    env.disparar(env.document, 'DOMContentLoaded', { bubbles: false });
    carga = await import(new URL('src/analizador/ui/carga.js', raiz));
    resultado = await import(new URL('src/simulador/ui/resultado.js', raiz));
    ({ AnalizadorEstadistico: A } = await import(new URL('src/analizador/estadistica.js', raiz)));
    ({ EtiquetasVariables: EV } = await import(new URL('src/shared/etiquetas-variables.js', raiz)));
    ({ escribirXlsx } = await import(new URL('src/core/data/xlsx/escritor.js', raiz)));
    ({ leerXlsx } = await import(new URL('src/core/data/xlsx/lector.js', raiz)));
    ({ unirTrozos } = await import(new URL('src/core/data/zip/escritor.js', raiz)));
    ({ generadorDePrueba } = await import(new URL('tests/oracle/xlsx_casos.js', raiz)));
});

test('el Simulador: el botón «Excel (.xlsx)» descarga la base, su diccionario y el informe', async () => {
    const btn = q('#btnDescargarXLSX');
    assert.ok(btn, 'el botón está en la barra de descargas');
    assert.equal(btn.disabled, true, 'desactivado hasta generar');
    // una base generada (con la configuración de las pruebas del escritor) y las descargas habilitadas, como tras «Generar»
    const g = globalThis.generadorDatos;
    const prueba = generadorDePrueba();
    g.configuracion = prueba.configuracion;
    g.generarBaseDatos();
    resultado.habilitarDescargaCSV();
    assert.equal(btn.disabled, false);
    const antes = env.descargas.length;
    btn.click();
    await esperar(() => env.descargas.length > antes && /descargado|Error/.test(toast().texto));
    assert.match(toast().texto, /^Libro de Excel \(\.xlsx\) descargado: la base, su diccionario y el informe de la generación/);
    assert.equal(btn.disabled, false, 'el botón vuelve a quedar activo');
    const blob = env.descargas[env.descargas.length - 1];
    assert.equal(blob.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const leido = await leerXlsx(bytes);
    assert.deepEqual(leido.hojas.map(h => h.nombre), ['Datos', 'Diccionario', 'Informe']);
    assert.equal(leido.hojas[0].filas.length, g.datosGenerados.n + 1);

    // y ese libro, en el Analizador: la hoja Datos con las etiquetas de su diccionario, y el selector de hojas
    const entrada = await elegir(archivo('base_datos_simulada.xlsx', bytes));
    assert.equal(entrada.value, '', 'el selector de archivo se vacía');
    const datos = A.obtenerDatos();
    assert.equal(datos.length, g.datosGenerados.n);
    assert.equal(datos[0].Sexo, g.datosGenerados.presentar(g.datosGenerados.columna('Sexo'), 0));
    assert.match(toast().texto, /^Libro de Excel cargado \(hoja «Datos», una de 3 con datos: elige otra en «Hoja del libro»\): 40 casos y 17 variables; 1 de fecha; \d+ con su etiqueta del diccionario$/);
    assert.equal(EV.etiqueta('AS1'), g.obtenerEtiquetas().AS1, 'la etiqueta de variable, del diccionario');
    const campoDimension = q('#editorEtiquetas').querySelector('input[data-columna="Dimension_AS"]');
    assert.ok(campoDimension, 'el editor lista las columnas de puntaje');
    assert.equal(campoDimension.value, g.obtenerEtiquetas().Dimension_AS, 'con la etiqueta del diccionario');
    assert.equal(q('#selectorHojaXlsx').style.display, '', 'el selector de hojas, visible');
    const opciones = [...q('#hojaXlsx').querySelectorAll('option')].map(o => o.textContent);
    assert.deepEqual(opciones, ['Datos · 41 fila(s)', 'Diccionario · 18 fila(s)', `Informe · ${leido.hojas[2].filas.filter(Boolean).filter(f => f.some(v => v !== null)).length} fila(s)`]);
});

test('cambiar de hoja con el selector: se carga esa hoja sin volver a leer el libro', async () => {
    const select = q('#hojaXlsx');
    select.value = '1';
    env.disparar(select, 'change');
    assert.deepEqual(Object.keys(A.obtenerDatos()[0]), ['Variable', 'Etiqueta', 'Nivel de medida', 'Tipo', 'Valores']);
    assert.match(toast().texto, /^Libro de Excel cargado \(hoja «Diccionario», una de 3 con datos/);
    select.value = '0';
    env.disparar(select, 'change');
    assert.equal(A.obtenerDatos().length, 40);
    // otro archivo (un CSV) esconde el selector
    await elegir(archivo('datos.csv', new TextEncoder().encode('ID;X\n1;2\n2;3\n')));
    assert.equal(q('#selectorHojaXlsx').style.display, 'none');
    assert.equal(EV.etiqueta('AS1'), 'AS1', 'las etiquetas del libro anterior se descartan');
});

test('un libro de otro programa: la primera hoja visible con datos, sus avisos y las ocultas al final del selector', async () => {
    await elegir(archivo('tipos.xlsx', fixture('openpyxl_tipos.xlsx')));
    assert.equal(A.obtenerDatos().length, 6);
    assert.match(toast().texto, /^Libro de Excel cargado \(hoja «Tipos», una de 5 con datos: elige otra en «Hoja del libro»\): 6 casos y 19 variables; 4 de fecha\. Ten en cuenta: 6 celda\(s\) con un error de Excel/);
    assert.match(toast().tipo, /warning/);
    const opciones = [...q('#hojaXlsx').querySelectorAll('option')].map(o => o.textContent);
    assert.deepEqual(opciones, ['Tipos · 7 fila(s)', 'Dispersa · 3 fila(s)', 'Titulo · 7 fila(s)', 'Oculta (oculta) · 2 fila(s)', 'MuyOculta (oculta) · 1 fila(s)']);
    // la hoja con un título sobre la tabla
    const select = q('#hojaXlsx');
    select.value = '5';
    env.disparar(select, 'change');
    assert.deepEqual(A.obtenerDatos()[0], { ID: 1, Edad: 20, Sexo: 'Mujer', Satisfaccion: 4 });
    assert.match(toast().texto, /se saltó la fila 1 \(«Encuesta de satisfacción 2024»\), que parece un título: los encabezados son los de la fila 3/);
});

test('las hojas que no sirven se saltan; los formatos que no son .xlsx dan un error claro y la base sigue', async () => {
    // la primera hoja solo tiene encabezados: se carga la siguiente
    await elegir(archivo('dos.xlsx', await libro([{ nombre: 'Portada', encabezado: ['Solo', 'Encabezados'], filas: [] }, { nombre: 'Datos', encabezado: ['a', 'b'], filas: [[1, 2], [3, 4]] }])));
    assert.deepEqual(A.obtenerDatos(), [{ a: 1, b: 2 }, { a: 3, b: 4 }]);
    assert.match(toast().texto, /^Libro de Excel cargado \(hoja «Datos», una de 2 con datos/);
    // y elegir la que no sirve en el selector: un error, y el selector vuelve a la cargada
    const select = q('#hojaXlsx');
    select.value = '0';
    env.disparar(select, 'change');
    assert.equal(toast().texto, 'La hoja «Portada» tiene encabezados pero ninguna fila de datos');
    assert.equal(select.value, '1');
    assert.deepEqual(A.obtenerDatos(), [{ a: 1, b: 2 }, { a: 3, b: 4 }]);
    const antes = A.obtenerDatos();
    for (const [nombre, mensaje] of [['viejo.xls', /^Es un libro de Excel 97-2003 \(\.xls\)/], ['hoja.ods', /^Es una hoja de cálculo de OpenDocument/], ['cifrado.xlsx', /^El libro de Excel está protegido con contraseña de apertura/]]) {
        const real = { 'viejo.xls': 'libreoffice.xls', 'hoja.ods': 'libreoffice.ods', 'cifrado.xlsx': 'cifrado.xlsx' }[nombre];
        await elegir(archivo(nombre, fixture(real)));
        assert.match(toast().texto, mensaje, nombre);
        assert.match(toast().tipo, /error/);
        assert.equal(A.obtenerDatos(), antes, 'la base anterior sigue cargada');
    }
    await elegir(archivo('vacio.xlsx', await libro([{ nombre: 'Nada', filas: [] }])));
    assert.equal(toast().texto, 'El libro de Excel no tiene datos: todas sus hojas están vacías');
    await elegir(archivo('roto.xlsx', fixture('openpyxl_tipos.xlsx').slice(0, 2000)));
    assert.match(toast().texto, /^El libro de Excel está dañado o incompleto: le falta el directorio central del ZIP/);
});

test('los nombres de hojas y columnas con forma de HTML no se ejecutan', async () => {
    const maligno = '"><img src=x onerror="globalThis.__inyectadoXlsx = 1">';
    await elegir(archivo('maligno.xlsx', await libro([
        { nombre: 'Hoja <b>1</b>', encabezado: ['ID', maligno, 'Grupo'], filas: [[1, 2, '<i>A</i>'], [2, 3, 'B']] },
        { nombre: maligno.slice(0, 31), encabezado: ['x'], filas: [[1]] }
    ])));
    const datos = A.obtenerDatos();
    assert.equal(datos.length, 2);
    assert.ok(Object.keys(datos[0]).every(k => !/[<>]/.test(k)), 'los nombres, sin < ni >');
    assert.equal(datos[0].Grupo, '‹i›A‹/i›');
    assert.equal(globalThis.document.querySelectorAll('img[src="x"]').length, 0, 'ninguna imagen inyectada');
    assert.equal(globalThis.__inyectadoXlsx, undefined);
    assert.ok([...q('#hojaXlsx').querySelectorAll('option')].every(o => !o.querySelector('img')), 'las opciones del selector, como texto');
});

test('el Redactor importa la matriz en .xlsx con el lector propio, sin descargar ExcelJS', async () => {
    const { RedactorTeorico } = await import(new URL('src/redactor/redactor/index.js', raiz));
    delete globalThis.ExcelJS;
    const bytes = await libro([{
        nombre: 'Matriz de revisión', encabezado: ['Título', 'Año', 'Referencia (APA)', 'Autor(es)', 'Link/DOI', 'Relevancia'],
        filas: [['Autoestima y rendimiento académico', 2021, 'Pérez, A. (2021). Autoestima y rendimiento. Revista de Psicología, 1(2), 3–4.', 'Pérez, A.', 'https://doi.org/10.1000/xyz', 5], [],
            ['Bienestar docente', 2020, 'Gómez, B. (2020). Bienestar. Educación, 2, 5–9.', null, null, true]]
    }]);
    const { cols, filas } = await RedactorTeorico._parsearXLSX(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    assert.deepEqual(cols, ['Título', 'Año', 'Referencia (APA)', 'Autor(es)', 'Link/DOI', 'Relevancia']);
    assert.equal(filas.length, 2, 'la fila vacía se salta');
    assert.deepEqual(filas[0], ['Autoestima y rendimiento académico', '2021', 'Pérez, A. (2021). Autoestima y rendimiento. Revista de Psicología, 1(2), 3–4.', 'Pérez, A.', 'https://doi.org/10.1000/xyz', '5']);
    assert.deepEqual(filas[1].slice(3), ['', '', 'VERDADERO']);
    assert.equal(globalThis.ExcelJS, undefined, 'sin ExcelJS');
    // de punta a punta: el selector de archivo del Redactor
    await RedactorTeorico._onArchivo({ name: 'matriz_revision.XLSX'.toLowerCase(), arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
    assert.equal(RedactorTeorico._fuentesImportadas.length, 2);
    assert.equal(RedactorTeorico._fuentesImportadas[0].doi, 'https://doi.org/10.1000/xyz');
    assert.match(q('#redImportInfo').textContent, /^✓ Matriz importada: 2 fuente\(s\)/);
    // un libro sin filas de datos, o que no es un .xlsx: el error, en la misma línea
    await RedactorTeorico._onArchivo({ name: 'vacia.xlsx', arrayBuffer: async () => { const b = await libro([{ nombre: 'M', encabezado: ['Título'], filas: [] }]); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); } });
    assert.equal(q('#redImportInfo').textContent, '❌ El Excel no tiene datos.');
    await RedactorTeorico._onArchivo({ name: 'viejo.xlsx', arrayBuffer: async () => { const b = fixture('libreoffice.xls'); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); } });
    assert.match(q('#redImportInfo').textContent, /^❌ Es un libro de Excel 97-2003/);
    RedactorTeorico._fuentesImportadas = null;
});
