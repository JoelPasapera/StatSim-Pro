// tests/ui/analizador-sav.test.js — (2026.12.29) cargar una base de SPSS (.sav) en el Analizador, de extremo a extremo sobre
// index.html: los datos llegan como los espera (motor/datos-spss.js), las etiquetas de variable del archivo se usan y el
// editor de etiquetas las muestra (escapadas: una etiqueta con forma de HTML no se ejecuta), «Aplicar etiquetas» cambia
// solo las columnas del editor, un archivo dañado da un error claro y el selector acepta «.CSV» en mayúsculas y vuelve a
// cargar el mismo archivo.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';
import { sinMarcado } from '../../src/core/data/texto.js';

const raiz = new URL('../../', import.meta.url);
let carga, A, EV, escribirSav;
const q = sel => globalThis.document.querySelector(sel);
const toast = () => ({ texto: q('#toast').textContent, tipo: q('#toast').className });

/** Un archivo como el que da el selector: nombre, bytes y texto. */
const archivo = (nombre, contenido) => {
    const bytes = typeof contenido === 'string' ? new TextEncoder().encode(contenido) : contenido;
    return { name: nombre, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), text: async () => new TextDecoder().decode(bytes) };
};
/** Elige el archivo en el selector del Analizador y espera la carga. */
async function elegir(f) {
    const entrada = { files: [f], value: 'C:\\fakepath\\' + f.name };
    await carga.cargarArchivo({ target: entrada });
    return entrada;
}

before(async () => {
    const env = crearEntorno(fs.readFileSync(new URL('index.html', raiz), 'utf8'));
    env.document.readyState = 'interactive';
    globalThis.fetch = () => Promise.reject(new Error('sin red'));
    await import(new URL('src/main.js', raiz));
    await new Promise(r => setTimeout(r, 0));
    env.document.readyState = 'complete';
    env.disparar(env.document, 'DOMContentLoaded', { bubbles: false });
    carga = await import(new URL('src/analizador/ui/carga.js', raiz));
    ({ AnalizadorEstadistico: A } = await import(new URL('src/analizador/estadistica.js', raiz)));
    ({ EtiquetasVariables: EV } = await import(new URL('src/shared/etiquetas-variables.js', raiz)));
    ({ escribirSav } = await import(new URL('src/core/data/sav/escritor.js', raiz)));
});

const MALICIOSA = '"><img src=x onerror="globalThis.__inyectado = 1">';
const NEUTRA = '"›‹img src=x onerror="globalThis.__inyectado = 1"›';   // sin «<» ni «>» (core/data/texto.js)
const baseSav = () => escribirSav({ variables: [
    { nombre: 'ID', valores: [1, 2, 3, 4], etiqueta: 'Participante' },
    { nombre: 'Sexo', valores: [0, 1, 1, NaN], etiquetasValor: { 0: 'Femenino', 1: 'Masculino' }, etiqueta: 'Sexo del participante' },
    { nombre: 'AE1', valores: [1, 2, 3, 4], etiquetasValor: { 1: 'Nunca', 2: 'A veces', 3: 'Casi siempre', 4: 'Siempre' }, etiqueta: 'Ítem 1' },
    { nombre: 'AE2', valores: [2, 3, 4, 4], etiquetasValor: { 1: 'Nunca', 2: 'A veces', 3: 'Casi siempre', 4: 'Siempre' }, etiqueta: 'Ítem 2' },
    { nombre: 'AE3', valores: [1, 3, 4, 3], etiquetasValor: { 1: 'Nunca', 2: 'A veces', 3: 'Casi siempre', 4: 'Siempre' }, etiqueta: 'Ítem 3' },
    { nombre: 'General_AE', valores: [4, 8, 11, 11], etiqueta: MALICIOSA },
    { nombre: 'Inicio', valores: [19723, 19724, NaN, 19726], fecha: true }
] }).bytes;

test('un .sav en el Analizador: datos, etiquetas del archivo, editor escapado y aviso de carga', async () => {
    const entrada = await elegir(archivo('encuesta.sav', baseSav()));
    assert.equal(entrada.value, '', 'el selector se vacía: elegir de nuevo el mismo archivo vuelve a cargarlo');
    const datos = A.obtenerDatos();
    assert.equal(datos.length, 4);
    assert.deepEqual(datos.map(f => f.Sexo), ['Femenino', 'Masculino', 'Masculino', null]);
    assert.deepEqual(datos.map(f => f.AE1), [1, 2, 3, 4], 'los ítems que comparten anclas siguen siendo números');
    assert.deepEqual(datos.map(f => f.Inicio), ['2024-01-01', '2024-01-02', null, '2024-01-04']);
    assert.match(toast().texto, /^Archivo de SPSS cargado: 4 casos y 7 variables; 1 con etiquetas de valor pasan a categorías; 1 de fecha/);
    assert.match(toast().tipo, /success/);
    // las etiquetas de variable del archivo
    assert.equal(EV.etiqueta('AE1'), 'Ítem 1');
    assert.equal(EV.etiqueta('General_AE'), NEUTRA, 'la etiqueta de un archivo ajeno llega sin «<» ni «>»');
    // el editor lista la columna de puntaje con su etiqueta, escapada
    const editor = q('#editorEtiquetas');
    const campo = editor.querySelector('input[data-columna="General_AE"]');
    assert.ok(campo, 'el campo de General_AE');
    assert.equal(campo.value, NEUTRA, 'la etiqueta, como texto (las comillas, escapadas en el atributo)');
    assert.equal(editor.querySelectorAll('img').length, 0, 'nada inyectado en el editor');
    // los desplegables: la etiqueta como texto, nada inyectado
    const opcion = [...q('#variable1').querySelectorAll('option')].find(o => o.value === 'General_AE');
    assert.ok(opcion && opcion.textContent.includes(NEUTRA));
    assert.equal(globalThis.document.querySelectorAll('img[src="x"]').length, 0, 'ninguna imagen inyectada en la página');
    assert.equal(globalThis.__inyectado, undefined);
    assert.equal(q('#analisisN').textContent, '4');
});

test('«Aplicar etiquetas» cambia solo las columnas del editor: las demás etiquetas del .sav se conservan', async () => {
    await elegir(archivo('encuesta.sav', baseSav()));
    const campo = q('#editorEtiquetas').querySelector('input[data-columna="General_AE"]');
    campo.value = 'Autoestima';
    q('#btnAplicarEtiquetas').click();
    assert.equal(EV.etiqueta('General_AE'), 'Autoestima');
    assert.equal(EV.etiqueta('AE2'), 'Ítem 2', 'la etiqueta del ítem sigue');
    assert.equal(EV.etiqueta('Sexo'), 'Sexo del participante');
    // vaciar el campo quita la etiqueta de esa columna
    q('#editorEtiquetas').querySelector('input[data-columna="General_AE"]').value = '';
    q('#btnAplicarEtiquetas').click();
    assert.equal(EV.etiqueta('General_AE'), 'General_AE');
    assert.equal(EV.etiqueta('AE2'), 'Ítem 2');
});

test('un .sav sin columnas de puntaje: el editor explica que las etiquetas vienen del archivo', async () => {
    await elegir(archivo('otra.SAV', escribirSav({ variables: [{ nombre: 'edad', valores: [20, 21], etiqueta: 'Edad en años' }, { nombre: 'nota', valores: [14, 16] }] }).bytes));
    assert.equal(A.obtenerDatos().length, 2);
    const texto = q('#editorEtiquetas').textContent;
    assert.match(texto, /Archivo de SPSS: las etiquetas de variable vienen del archivo \(1 de 2 variables tienen una\)/);
    assert.doesNotMatch(texto, /No se encontraron columnas de puntaje/);
});

test('un archivo dañado o de otro tipo: un error claro, y la base anterior sigue cargada', async () => {
    await elegir(archivo('encuesta.sav', baseSav()));
    const antes = A.obtenerDatos();
    await elegir(archivo('roto.sav', baseSav().slice(0, 400)));
    assert.match(toast().texto, /^Archivo de SPSS no válido: el archivo termina antes de tiempo/);
    assert.match(toast().tipo, /error/);
    assert.equal(A.obtenerDatos(), antes);
    await elegir(archivo('informe.docx', 'a,b\n1,2\n'));
    assert.equal(toast().texto, 'Por favor selecciona un archivo CSV, un libro de Excel (.xlsx) o una base de SPSS (.sav)');
    await elegir(archivo('csv-disfrazado.sav', 'ID,Edad\n' + '1,20\n'.repeat(60)));
    assert.match(toast().texto, /no empieza como un archivo de datos de SPSS/);
});

test('un CSV sigue cargándose como antes, también con la extensión en mayúsculas', async () => {
    await elegir(archivo('DATOS.CSV', 'ID;Grupo;General_X\n1;A;3,5\n2;B;4\n'));
    assert.deepEqual(A.obtenerDatos(), [{ ID: 1, Grupo: 'A', General_X: 3.5 }, { ID: 2, Grupo: 'B', General_X: 4 }]);
    assert.equal(toast().texto, 'Archivo CSV cargado: 2 casos y 3 variables');
    assert.equal(EV.etiqueta('AE1'), 'AE1', 'las etiquetas del .sav anterior se descartan');
    assert.ok(q('#editorEtiquetas').querySelector('input[data-columna="General_X"]'));
});

test('un .zsav (el comprimido de SPSS) y una base sin casos', async () => {
    const zsav = new Uint8Array(fs.readFileSync(new URL('tests/oracle/sav/sample.zsav', raiz)));
    await elegir(archivo('muestra.ZSAV', zsav));
    assert.equal(A.obtenerDatos().length, 5);
    assert.match(toast().texto, /^Archivo de SPSS cargado: 5 casos y 7 variables/);
    await elegir(archivo('vacia.sav', escribirSav({ n: 0, variables: [{ nombre: 'x', valores: [] }] }).bytes));
    assert.equal(toast().texto, 'El archivo de SPSS no tiene casos: no hay nada que analizar');
    assert.equal(A.obtenerDatos().length, 5, 'la base anterior sigue');
});

test('un CSV guardado por Excel en español (ANSI, windows-1252): tildes y eñes intactas, y se avisa', async () => {
    const texto = 'ID;Año;Opinión\n1;2024;Sí, señor\n2;2025;Niño\n';
    const ansi = Uint8Array.from([...texto].map(c => c.charCodeAt(0)));
    await elegir(archivo('encuesta.csv', ansi));
    assert.deepEqual(A.obtenerDatos(), [{ ID: 1, 'Año': 2024, 'Opinión': 'Sí, señor' }, { ID: 2, 'Año': 2025, 'Opinión': 'Niño' }]);
    assert.match(toast().texto, /^Archivo CSV cargado: 2 casos y 3 variables\. Ten en cuenta: el archivo no estaba en UTF-8 y se leyó como ANSI de Windows/);
    assert.match(toast().tipo, /warning/);
});

test('los desplegables escapan nombres y etiquetas con forma de HTML, vengan de donde vengan', async () => {
    await elegir(archivo('encuesta.sav', baseSav()));
    // etiquetas con «<» que no pasan por la carga (las del Simulador, por ejemplo): (revisión de la 2026.12.29) fijar las
    // neutraliza también («‹ ›»), y los desplegables las escapan de todos modos
    EV.fijar({ General_AE: MALICIOSA, AE1: MALICIOSA, AE2: MALICIOSA, Sexo: MALICIOSA }, []);
    assert.equal(EV.etiqueta('AE1'), sinMarcado(MALICIOSA), 'fijar quita «<» y «>»');
    for (const tipo of ['correlacion', 'comparacion', 'asociacion']) {
        q('input[name="tipoAnalisis"]:checked') && (q('input[name="tipoAnalisis"]:checked').checked = false);
        q(`input[name="tipoAnalisis"][value="${tipo}"]`).checked = true;
        carga.poblarSelectsVariables(A.obtenerDatos());   // también la comparación de grupos, el ANCOVA/MANOVA y la regresión múltiple
    }
    const { renderizarSelectorGraficos } = await import(new URL('src/analizador/ui/graficos.js', raiz));
    renderizarSelectorGraficos(A.obtenerDatos());
    const { agregarVariableExtra } = await import(new URL('src/analizador/ui/analisis.js', raiz));
    carga.poblarSelectsVariables(A.obtenerDatos());
    agregarVariableExtra();   // el desplegable nuevo lo pinta analisis.js (después, poblarSelectsVariables lo repinta)
    assert.equal(globalThis.document.querySelectorAll('img').filter(i => i.getAttribute('src') === 'x').length, 0, 'ninguna imagen inyectada');
    // y la etiqueta se ve como texto en cada desplegable que la lista
    for (const sel of ['#variable1', '#variable2', '#cgNum', '#cgGrupo', '#cgCov', '#varsExtraCont select']) {
        const lista = q(sel);
        assert.ok(lista, sel);
        assert.ok([...lista.querySelectorAll('option')].some(o => o.textContent.includes(sinMarcado(MALICIOSA))), `${sel}: la etiqueta como texto`);
    }
    assert.ok([...q('#selectorVarsGraficos').querySelectorAll('label')].some(l => l.textContent.includes(sinMarcado(MALICIOSA))), 'el selector de gráficos');
    EV.limpiar();
});

test('(revisión de la 2026.12.29) la base del Simulador llega sin «<» ni «>»: nombres, categorías, etiquetas y estructura', async () => {
    const { estado, CLAVES } = await import(new URL('src/shared/estado.js', raiz));
    const sexo = 'Sexo<img src=x onerror=globalThis.__inyectado=1>';
    const datos = [{ ID: 1, [sexo]: 'Mujer<b>', General_AS: 10 }, { ID: 2, [sexo]: 'Varón', General_AS: 12 }, { ID: 3, [sexo]: 'Mujer<b>', General_AS: 11 }];
    estado.set(CLAVES.BASE_SIMULADOR, { datos, etiquetas: { General_AS: 'Autoestima <i>social</i>', [sexo]: 'Sexo <script>' }, estructura: [{ nombre: 'Prueba <x>', columnaGeneral: 'General_AS', dimensiones: [] }] });
    globalThis.__inyectado = 0;
    carga.cargarDatosGenerados();
    const fila = A.obtenerDatos()[0], neutro = 'Sexo‹img src=x onerror=globalThis.__inyectado=1›';
    assert.deepEqual(Object.keys(fila), ['ID', neutro, 'General_AS']);
    assert.equal(fila[neutro], 'Mujer‹b›');
    assert.equal(EV.etiqueta('General_AS'), 'Autoestima ‹i›social‹/i›');
    assert.equal(EV.etiqueta(neutro), 'Sexo ‹script›', 'la clave de la etiqueta, como el nombre de la columna');
    assert.equal(EV.estructura()[0].nombre, 'Prueba ‹x›');
    assert.equal(datos[0][sexo], 'Mujer<b>', 'el paquete del Simulador no se toca: se copia');
    assert.equal(globalThis.document.querySelectorAll('img').filter(i => i.getAttribute('src') === 'x').length, 0);
    assert.equal(globalThis.__inyectado, 0);
    EV.limpiar();
});
