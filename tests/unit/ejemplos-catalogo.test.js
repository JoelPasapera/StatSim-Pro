// @ts-check
// tests/unit/ejemplos-catalogo.test.js — (2027.01.02) el catálogo de la pestaña «Ejemplos» (src/ejemplos/catalogo.js:
// ejemplos/indice.json, comprobado antes de usarlo; las direcciones de los archivos; sus grupos) y el HTML que se arma con él
// (galeria.js, caso.js y guia.js): todo el texto escapado, ninguna ruta fuera de la carpeta del caso, los botones con su
// caso, y la guía con lo que trajo el proyecto, lo que hay que repetir y lo opcional, dicho igual que en el README.
// (2027.01.03) Y los guiones de los pasos («Hazlo por mí»): uno por paso, con acciones que esta versión sabe hacer y que
// solo suben archivos del caso; sin ellos (unos ejemplos de la 2027.01.02), el catálogo se lee igual.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Documento } from '../ui/minidom.js';
import {
    CARPETA_EJEMPLOS, FORMATO_INDICE, SinEjemplos, bytesDelArchivo, bytesDelCaso, cargarCatalogo, catalogoValido, gruposDeArchivos,
    leerCatalogo, numeroDe, pasosEnPalabras, tamanoDe, tipoDeArchivo, urlDelArchivo,
} from '../../src/ejemplos/catalogo.js';
import { htmlDeLaGaleria } from '../../src/ejemplos/galeria.js';
import { htmlDelCaso, resolverRutasDelCaso } from '../../src/ejemplos/caso.js';
import { estadoDelPaso, htmlDeLaGuia, notaDeLaGuia } from '../../src/ejemplos/guia.js';
import { accionEjecutable } from '../../src/ejemplos/hazlo/planes.js';
import { glifoDelDiseno } from '../../src/ejemplos/glifos.js';
import { paqueteDelCaso, rutasDelPaquete } from '../../src/ejemplos/paquete.js';
import { listarZip, extraerZip } from '../../src/core/data/zip/lector.js';
import { unirTrozos } from '../../src/core/data/zip/escritor.js';

const indiceReal = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'ejemplos', 'indice.json');

/** Un caso válido, con lo que se le cambie. @param {Record<string, any>} [cambios] */
function caso(cambios = {}) {
    return {
        carpeta: '01-correlacional', titulo: 'Estrés y bienestar', diseno: 'Correlacional', resumen: 'Lo que muestra.', version: '2027.01.02',
        destacados: ['ρ = −.40, p < .001'], pasos: ['Usar datos', 'Configurar', 'Analizar', 'Guardar'], repetir: { desde: 3, hasta: 3, nota: '' },
        carpetas: [{ ruta: 'analizador/1-correlacion', titulo: 'La correlación' }],
        archivos: [
            { ruta: 'analizador/1-correlacion/resultados.pdf', bytes: 1200000, descripcion: 'El PDF.' },
            { ruta: 'proyecto.statsim', bytes: 30000, descripcion: 'El proyecto.' },
            { ruta: 'simulador/base.sav', bytes: 2048, descripcion: 'La base.' },
        ],
        ...cambios,
    };
}
/** Una acción de un guion. @param {string} accion @param {Record<string, any>} [datos] */
const accion = (accion, datos = {}) => ({ accion, datos });
/** Los guiones de los cuatro pasos de caso(): los datos, la configuración, la correlación y guardar. */
const guiones = () => [[accion('usarBaseDelSimulador')], [accion('describirInvestigacion', { titulo: 'T' })], [accion('analizar', { tipo: 'correlacion', variables: ['A', 'B'] }), accion('exportarAnalisis', { carpeta: '1-correlacion' })], [accion('guardarProyecto')]];
/** Un catálogo con esos casos. @param {any[]} casos */
const catalogo = (...casos) => ({ formato: FORMATO_INDICE, version: '2027.01.02', casos: casos.length ? casos : [caso()] });
/** El catálogo como texto, leído. @param {any} c */
const leido = c => leerCatalogo(JSON.stringify(c));
/** Un HTML, para buscar en él. @param {string} html */
const dom = html => new Documento(`<html><body>${html}</body></html>`);

test('el catálogo válido se lee (también con BOM y con saltos de Windows)', () => {
    const c = leerCatalogo('\ufeff' + JSON.stringify(catalogo(), null, 2).replace(/\n/g, '\r\n'));
    assert.equal(c.casos[0].carpeta, '01-correlacional');
    assert.equal(catalogoValido(catalogo(caso(), caso({ carpeta: '02-comparativo' }))), true);
    assert.equal(catalogoValido(catalogo(caso({ destacados: [], carpetas: [] }))), true, 'sin cifras clave ni carpetas de análisis');
});

test('el catálogo con otra forma se rechaza, con un mensaje que dice qué hacer', () => {
    const malos = {
        'otro formato': { ...catalogo(), formato: 2 },
        'sin casos': { formato: FORMATO_INDICE, version: 'x' },
        'carpeta con ..': catalogo(caso({ carpeta: '../01-x' })),
        'carpeta con mayúsculas': catalogo(caso({ carpeta: '01-Correlacional' })),
        'carpeta sin número': catalogo(caso({ carpeta: 'correlacional' })),
        'carpeta repetida': catalogo(caso(), caso()),
        'ruta que sale del caso': catalogo(caso({ archivos: [{ ruta: '../02-otro/proyecto.statsim', bytes: 1, descripcion: '' }] })),
        'ruta con un tramo ..': catalogo(caso({ archivos: [{ ruta: 'simulador/../../x', bytes: 1, descripcion: '' }] })),
        'ruta absoluta': catalogo(caso({ archivos: [{ ruta: '/etc/passwd', bytes: 1, descripcion: '' }] })),
        'ruta con espacio': catalogo(caso({ archivos: [{ ruta: 'simulador/mi base.sav', bytes: 1, descripcion: '' }] })),
        'ruta con «:»': catalogo(caso({ archivos: [{ ruta: 'javascript:alert(1)', bytes: 1, descripcion: '' }] })),
        'archivo repetido': catalogo(caso({ archivos: [{ ruta: 'a.csv', bytes: 1, descripcion: '' }, { ruta: 'a.csv', bytes: 2, descripcion: '' }] })),
        'tamaño negativo': catalogo(caso({ archivos: [{ ruta: 'a.csv', bytes: -1, descripcion: '' }] })),
        'tamaño con decimales': catalogo(caso({ archivos: [{ ruta: 'a.csv', bytes: 1.5, descripcion: '' }] })),
        'descripción que no es texto': catalogo(caso({ archivos: [{ ruta: 'a.csv', bytes: 1, descripcion: { html: '<b>' } }] })),
        'pasos a repetir desde 0': catalogo(caso({ repetir: { desde: 0, hasta: 1, nota: '' } })),
        'pasos a repetir más allá del último': catalogo(caso({ repetir: { desde: 3, hasta: 5, nota: '' } })),
        'pasos a repetir al revés': catalogo(caso({ repetir: { desde: 3, hasta: 2, nota: '' } })),
        'sin pasos a repetir': catalogo(caso({ repetir: undefined })),
        'demasiadas cifras clave': catalogo(caso({ destacados: Array(7).fill('x') })),
        'un título enorme': catalogo(caso({ titulo: 'x'.repeat(301) })),
        'una carpeta de análisis fuera del caso': catalogo(caso({ carpetas: [{ ruta: '../x', titulo: 't' }] })),
        'guiones que no son una lista': catalogo(caso({ guiones: {} })),
        'menos guiones que pasos': catalogo(caso({ guiones: guiones().slice(1) })),
        'un guion con una acción que no existe': catalogo(caso({ guiones: [...guiones().slice(0, 3), [accion('borrarTodo')]] })),
        'un guion con datos de más': catalogo(caso({ guiones: [...guiones().slice(0, 2), [accion('analizar', { tipo: 'correlacion', variables: ['A', 'B'], selector: '#x' })], []] })),
        'un guion que sube un archivo que no es del caso': catalogo(caso({ guiones: [...guiones().slice(0, 2), [accion('calcularAiken', { minimo: 1, maximo: 4, criterios: [{ nombre: 'C', archivo: 'analizador/x/otro.csv' }] })], []] })),
    };
    for (const [que, c] of Object.entries(malos)) {
        assert.equal(catalogoValido(c), false, que);
        assert.throws(() => leido(c), /no tiene la forma que esta versión sabe leer: vuelve a generarlos o recarga sin caché/, que);
    }
    assert.throws(() => leerCatalogo('{ no es json'), /no es JSON válido/);
    assert.throws(() => leerCatalogo(' '.repeat(1024 * 1024 + 1)), /demasiado grande/);
});

test('el catálogo real (ejemplos/indice.json) tiene la forma que lee la página', { skip: !fs.existsSync(indiceReal) && 'sin ejemplos/indice.json' }, () => {
    const c = leerCatalogo(fs.readFileSync(indiceReal, 'utf8'));
    assert.ok(c.casos.length >= 5);
    for (const e of c.casos) assert.ok(e.pasos.length >= e.repetir.hasta && e.archivos.some(a => a.ruta === 'proyecto.statsim'), e.carpeta);
    // (2027.01.03) con el guion de cada paso, como lo exige el generador: lo que trae el proyecto antes, algún análisis en
    // los que se repiten y ninguno después (solo descargas o guardar el proyecto)
    for (const e of c.casos) {
        const g = /** @type {import('../../src/ejemplos/hazlo/planes.js').AccionDelGuion[][]} */ (e.guiones);
        assert.ok(Array.isArray(g) && g.length === e.pasos.length, `${e.carpeta}: un guion por paso`);
        g.forEach((acciones, i) => {
            const n = i + 1, estado = estadoDelPaso(n, e.repetir);
            assert.ok(acciones.length > 0, `${e.carpeta}, paso ${n}: con guion`);
            if (estado === 'hecho') assert.ok(acciones.every(a => a.accion === 'usarBaseDelSimulador' || a.accion === 'describirInvestigacion'), `${e.carpeta}, paso ${n}: lo trae el proyecto`);
            else if (estado === 'repetir') assert.ok(acciones.some(accionEjecutable), `${e.carpeta}, paso ${n}: algún análisis`);
            else assert.ok(!acciones.some(accionEjecutable), `${e.carpeta}, paso ${n}: nada que hacer por ti`);
        });
    }
});

test('los guiones de los pasos: uno por paso, con lo que sube del propio caso; sin ellos, el catálogo se lee igual', () => {
    assert.equal(catalogoValido(catalogo(caso({ guiones: guiones() }))), true);
    assert.equal(catalogoValido(catalogo(caso())), true, 'sin guiones (unos ejemplos de la 2027.01.02)');
    const conAiken = caso({
        archivos: [...caso().archivos, { ruta: 'analizador/1-x/valoraciones.csv', bytes: 10, descripcion: 'Las valoraciones.' }],
        guiones: [...guiones().slice(0, 2), [accion('calcularAiken', { minimo: 1, maximo: 4, criterios: [{ nombre: 'C', archivo: 'analizador/1-x/valoraciones.csv' }] })], []],
    });
    assert.equal(catalogoValido(catalogo(conAiken)), true, 'sube un archivo del caso');
    assert.equal(leido(catalogo(caso({ guiones: guiones() }))).casos[0].guiones?.[2][0].accion, 'analizar');
});

test('pedir el catálogo: sin la carpeta (404), SinEjemplos; otro fallo o sin red, el error con lo que pasó', async () => {
    /** @type {string[]} */
    const pedidas = [];
    /** @param {number} status @param {string} [cuerpo] */
    const respuesta = (status, cuerpo = '') => async (/** @type {string} */ url) => { pedidas.push(url); return { ok: status === 200, status, text: async () => cuerpo, arrayBuffer: async () => new ArrayBuffer(0) }; };
    const c = await cargarCatalogo(respuesta(200, JSON.stringify(catalogo())), '2027.01.02');
    assert.equal(c.casos.length, 1);
    assert.deepEqual(pedidas, [`${CARPETA_EJEMPLOS}/indice.json?v=2027.01.02`], 'con la versión, para que la caché no sirva otro');
    await assert.rejects(cargarCatalogo(respuesta(404), 'v'), e => e instanceof SinEjemplos && /falta la carpeta «ejemplos\/»/.test(e.message));
    await assert.rejects(cargarCatalogo(respuesta(500), 'v'), /el sitio respondió 500/);
    await assert.rejects(cargarCatalogo(async () => { throw new TypeError('Failed to fetch'); }, 'v'), /No se pudo pedir el índice de los ejemplos: Failed to fetch/);
    await assert.rejects(cargarCatalogo(respuesta(200, '{"formato":1}'), 'v'), /no tiene la forma/);
});

test('las direcciones de los archivos: dentro de ejemplos/, con cada tramo codificado y la versión', () => {
    assert.equal(urlDelArchivo('01-correlacional', 'analizador/1-correlacion/resultados.pdf', '2027.01.02'), 'ejemplos/01-correlacional/analizador/1-correlacion/resultados.pdf?v=2027.01.02');
    assert.equal(urlDelArchivo('01-x', 'a.csv', 'v 1&2'), 'ejemplos/01-x/a.csv?v=v%201%262');
    assert.throws(() => urlDelArchivo('01-x', '../a.csv', 'v'), /no válida/);
    assert.throws(() => urlDelArchivo('../01-x', 'a.csv', 'v'), /no válida/);
});

test('un archivo del caso se comprueba con el tamaño del catálogo', async () => {
    const e = caso();
    /** @param {number} n */
    const de = n => async () => ({ ok: true, status: 200, text: async () => '', arrayBuffer: async () => new Uint8Array(n).buffer });
    assert.equal((await bytesDelArchivo(e, 'simulador/base.sav', { obtener: de(2048), version: 'v' })).length, 2048);
    assert.equal((await bytesDelArchivo(e, 'README.md', { obtener: de(7), version: 'v' })).length, 7, 'el README no está en el catálogo: sin comprobar');
    await assert.rejects(bytesDelArchivo(e, 'simulador/base.sav', { obtener: de(2000), version: 'v' }), /no es el de este caso .*Recargar sin caché/);
    await assert.rejects(bytesDelArchivo(e, 'simulador/base.sav', { obtener: async () => ({ ok: false, status: 404, text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) }), version: 'v' }), /el sitio respondió 404/);
});

test('tipos, tamaños, número del caso y pasos en palabras', () => {
    assert.deepEqual(['a.pdf', 'b.DOCX', 'c.xlsx', 'd.sav', 'e.csv', 'f.txt', 'proyecto.statsim', 'g.bin'].map(r => tipoDeArchivo(r).clase), ['pdf', 'word', 'excel', 'spss', 'csv', 'texto', 'proyecto', 'otro']);
    assert.equal(tamanoDe(1258291), '1.2 MB');
    assert.ok(/KB$/.test(tamanoDe(30000)));
    assert.equal(bytesDelCaso(/** @type {any} */ (caso())), 1200000 + 30000 + 2048);
    assert.equal(numeroDe(/** @type {any} */ (caso({ carpeta: '12-otro' }))), 12);
    assert.equal(pasosEnPalabras({ desde: 3, hasta: 3 }), 'el paso 3');
    assert.equal(pasosEnPalabras({ desde: 2, hasta: 3 }), 'los pasos 2 y 3');
    assert.equal(pasosEnPalabras({ desde: 2, hasta: 6 }), 'los pasos 2 a 6');
});

test('los grupos de archivos: el Simulador, cada análisis en su orden (el 10 tras el 9) y el proyecto; dentro, por nombre', () => {
    const archivos = ['proyecto.statsim', 'analizador/10-final/b.txt', 'simulador/base_datos_simulada_excel.csv', 'analizador/9-otro/a.pdf', 'simulador/base_datos_simulada.sav', 'analizador/1-uno/z.docx', 'analizador/1-uno/a.pdf']
        .map(ruta => ({ ruta, bytes: 1, descripcion: '' }));
    const grupos = gruposDeArchivos(archivos, [{ ruta: 'analizador/1-uno', titulo: 'El primero' }, { ruta: 'analizador/9-otro', titulo: 'El noveno' }]);
    assert.deepEqual(grupos.map(g => g.titulo), ['Simulador', 'Analizador · 1. El primero', 'Analizador · 9. El noveno', 'Analizador · 10. 10-final', 'Proyecto']);
    assert.deepEqual(grupos[0].archivos.map(a => a.ruta), ['simulador/base_datos_simulada.sav', 'simulador/base_datos_simulada_excel.csv'], 'como la tabla del README');
    assert.deepEqual(grupos[1].archivos.map(a => a.ruta), ['analizador/1-uno/a.pdf', 'analizador/1-uno/z.docx']);
    // (revisión) lo que no es del Simulador, de un análisis ni el proyecto, en su grupo (no junto al proyecto)
    const otros = gruposDeArchivos(['proyecto.statsim', 'buscador/matriz.xlsx', 'notas.txt', 'analizador/suelto.txt', 'analizador/afe/cargas.csv'].map(ruta => ({ ruta, bytes: 1, descripcion: '' })), []);
    assert.deepEqual(otros.map(g => `${g.titulo}: ${g.archivos.map(a => a.ruta).join(', ')}`),
        ['Analizador · afe: analizador/afe/cargas.csv', 'Otros archivos: notas.txt', 'Analizador: analizador/suelto.txt', 'Buscador: buscador/matriz.xlsx', 'Proyecto: proyecto.statsim']);
});

test('la galería: una tarjeta por caso, todo escapado, los botones con su caso y el dibujo de su diseño', () => {
    const malo = '<img src=x onerror="alert(1)">';
    const c = leido(catalogo(caso({ titulo: malo, resumen: malo, diseno: `Correlacional ${malo}`, destacados: [malo, 'R² = .25, p < .001'] }), caso({ carpeta: '02-comparativo', diseno: 'Comparativo' })));
    const html = htmlDeLaGaleria(c);
    assert.ok(!/<img/.test(html), 'nada sin escapar');
    const d = dom(html);
    assert.equal(d.querySelectorAll('.ejemplo-tarjeta').length, 2);
    assert.deepEqual([...d.querySelectorAll('[data-accion-ejemplo]')].map(b => `${b.getAttribute('data-accion-ejemplo')}:${b.getAttribute('data-carpeta')}`), ['ver:01-correlacional', 'abrir:01-correlacional', 'ver:02-comparativo', 'abrir:02-comparativo']);
    assert.ok(d.querySelector('.ejemplo-tarjeta li').textContent.includes(malo), 'el texto se ve tal cual');
    assert.ok(/R²\u00a0=\u00a0\.25, p\u00a0&lt;\u00a0\.001/.test(html), 'cada igualdad, en un renglón');
    assert.equal(d.querySelectorAll('svg.ejemplo-glifo').length, 2);
    assert.equal(htmlDeLaGaleria(leido({ formato: FORMATO_INDICE, version: 'v', casos: [] })).includes('ningún caso'), true);
    for (const diseno of ['Correlacional', 'Comparativo', 'Predictivo', 'Instrumental', 'Explicativo (SEM)']) assert.ok(glifoDelDiseno(diseno).startsWith('<svg'), diseno);
    assert.equal(glifoDelDiseno('Otro'), '');
});

test('la vista de un caso: sus archivos con sus descargas, el README sin su título ni su tabla de archivos, y todo escapado', () => {
    const malo = '<script>alert(1)</script>';
    const e = leido(catalogo(caso({ titulo: malo, archivos: [...caso().archivos.slice(0, 2), { ruta: 'simulador/base.sav', bytes: 2048, descripcion: `La base ${malo} en \`SPSS\`` }] }))).casos[0];
    const leeme = `# Caso 1 · ${malo}\n\n> **Datos simulados.**\n\n## Qué se configuró en el Simulador\n\nTexto con [la base](simulador/base.sav) y [otro](../02-x/proyecto.statsim).\n\n## Archivos\n\n| a | b |\n| --- | --- |\n| [x](simulador/base.sav) | y |\n\n## Cómo reproducirlo\n\n- uno`;
    const html = htmlDelCaso(e, leeme, '2027.01.02');
    assert.ok(!/<script/.test(html), 'nada sin escapar');
    const d = dom(html);
    assert.equal(d.querySelectorAll('.ejemplo-archivo').length, 3);
    const descargas = [...d.querySelectorAll('a[download]')];
    assert.deepEqual(descargas.map(a => a.getAttribute('download')), ['base.sav', 'resultados.pdf', 'proyecto.statsim'], 'el Simulador, el análisis y el proyecto');
    assert.ok(descargas.every(a => /^ejemplos\/01-correlacional\/[\w/.-]+\?v=2027\.01\.02$/.test(a.getAttribute('href') || '')));
    const ver = d.querySelector('a[target="_blank"][aria-label^="Ver resultados.pdf"]');
    assert.ok(ver && ver.getAttribute('rel') === 'noopener', 'el PDF, también para verlo en otra pestaña');
    assert.equal(d.querySelectorAll('[data-accion-ejemplo="abrir"]').length, 2, '«Abrir en StatSim» arriba y junto al proyecto');
    assert.ok(d.querySelector('[data-accion-ejemplo="zip"]').textContent.includes('.zip, 1.2 MB'));
    assert.ok(d.querySelector('.ejemplo-archivo-descripcion code'), 'la descripción, con su formato');
    // el README
    const titulos = [...d.querySelectorAll('.ejemplo-seccion-titulo')].map(h => h.textContent);
    assert.deepEqual(titulos, ['Qué se configuró en el Simulador', 'Cómo reproducirlo'], 'sin «Archivos»');
    assert.ok(!d.querySelector('.ejemplo-leeme h3'), 'sin el título del README (lo dice la cabecera)');
    assert.equal(d.querySelector('.ejemplo-seccion').hasAttribute('open'), true);
    assert.equal(d.querySelectorAll('.ejemplo-seccion')[1].hasAttribute('open'), false, '«Cómo reproducirlo», plegada');
    const enlaces = [...d.querySelectorAll('.ejemplo-leeme a')];
    assert.deepEqual(enlaces.map(a => a.getAttribute('href')), ['ejemplos/01-correlacional/simulador/base.sav?v=2027.01.02'], 'solo los enlaces a archivos del caso');
    assert.equal(resolverRutasDelCaso(e, 'v')('./README.md'), 'ejemplos/01-correlacional/README.md?v=v');
    // sin README, la vista sale igual, con el aviso
    const sin = dom(htmlDelCaso(e, null, 'v', `falló ${malo}`));
    assert.equal(sin.querySelectorAll('.ejemplo-archivo').length, 3);
    assert.ok(sin.querySelector('.ejemplo-sin-leeme').textContent.includes(`falló ${malo}`));
});

test('la guía: lo que trajo el proyecto, marcado; lo que hay que repetir; lo opcional; y lo dice como el README', () => {
    const r = (/** @type {number} */ desde, /** @type {number} */ hasta, nota = '') => ({ desde, hasta, nota });
    assert.deepEqual([1, 2, 3, 4, 5].map(n => estadoDelPaso(n, r(3, 3))), ['hecho', 'hecho', 'repetir', 'opcional', 'opcional']);
    const conPasos = (/** @type {number} */ n, /** @type {any} */ rep) => /** @type {any} */ (caso({ pasos: Array.from({ length: n }, (_, i) => `paso ${i + 1}`), repetir: rep }));
    assert.equal(notaDeLaGuia(conPasos(5, r(3, 3))), 'Los pasos 1 y 2 ya están hechos: los trajo el proyecto. Los análisis no se guardan en el proyecto: repite el paso 3 en el Analizador. Los pasos 4 y 5 son opcionales.');
    assert.equal(notaDeLaGuia(conPasos(4, r(2, 3))), 'El paso 1 ya está hecho: lo trajo el proyecto. Los análisis no se guardan en el proyecto: repite los pasos 2 y 3 en el Analizador. El paso 4 es opcional.');
    assert.equal(notaDeLaGuia(conPasos(7, r(2, 6, 'la V de Aiken vuelve'))), 'El paso 1 ya está hecho: lo trajo el proyecto. Los análisis no se guardan en el proyecto: repite los pasos 2 a 6 en el Analizador (la V de Aiken vuelve). El paso 7 es opcional.');
    assert.equal(notaDeLaGuia(conPasos(3, r(1, 3))), 'Los análisis no se guardan en el proyecto: repite los pasos 1 a 3 en el Analizador.');
    assert.equal(notaDeLaGuia(conPasos(5, r(4, 5))), 'Los pasos 1 a 3 ya están hechos: los trajo el proyecto. Los análisis no se guardan en el proyecto: repite los pasos 4 y 5 en el Analizador.');
    const malo = '<img src=x onerror=alert(1)>';
    const html = htmlDeLaGuia(/** @type {any} */ (caso({ titulo: malo, pasos: ['uno', `dos ${malo}`, 'tres con:\n\n```\nF =~ a\n```', 'cuatro'], repetir: r(2, 3, malo) })));
    assert.ok(!/<img/.test(html), 'nada sin escapar');
    const d = dom(html);
    const casillas = [...d.querySelectorAll('.guia-casilla')];
    assert.deepEqual(casillas.map(c => c.checked), [true, false, false, false], 'solo lo que trajo el proyecto, marcado');
    assert.deepEqual([...d.querySelectorAll('.guia-marca')].map(m => m.textContent), ['Lo trajo el proyecto', 'Repítelo', 'Repítelo', 'Opcional']);
    assert.ok(casillas.every((c, i) => c.getAttribute('aria-describedby') === `guiaPaso${i + 1}Texto` && d.getElementById(`guiaPaso${i + 1}Texto`)), 'cada casilla, con su paso');
    assert.ok(d.querySelector('.guia-paso pre code').textContent.includes('F =~ a'), 'un paso con un bloque de código');
    // (2027.01.03) sin guiones, sin «Muéstrame» ni «Hazlo por mí»; con ellos, uno por paso y «Hazlo» en los que se repiten
    assert.equal(d.querySelectorAll('[data-accion-guia="mostrar"], [data-accion-guia="hacer"], [data-accion-guia="hacerTodo"], .guia-conduccion').length, 0);
    const conGuiones = dom(htmlDeLaGuia(/** @type {any} */ (caso({ titulo: malo, guiones: guiones() }))));
    assert.deepEqual([...conGuiones.querySelectorAll('[data-accion-guia="mostrar"]')].map(b => b.getAttribute('data-paso')), ['1', '2', '3', '4']);
    assert.deepEqual([...conGuiones.querySelectorAll('[data-accion-guia="hacer"]')].map(b => [b.getAttribute('data-paso'), b.getAttribute('aria-label')]), [['3', 'Hazlo por mí: el paso 3']]);
    assert.equal(conGuiones.querySelector('.guia-hazlo-alcance').textContent, 'El paso 3.');
    assert.ok(conGuiones.querySelector('.guia-conduccion #guiaEjemploEstado[role="status"]') && conGuiones.querySelector('.guia-conduccion [data-accion-guia="detener"][hidden]'));
    assert.ok(!conGuiones.querySelector('.guia-cuerpo .guia-conduccion'), 'la línea de estado, fuera del cuerpo (se ve con la guía plegada)');
    assert.equal(conGuiones.querySelector('.guia-paso-texto [data-accion-guia]'), null, 'los botones, fuera del texto que describe a la casilla');
});

test('el .zip de un caso: su README, su verificación y sus archivos, en su carpeta y con sus bytes', async () => {
    const e = leido(catalogo()).casos[0];
    /** @type {Record<string, Uint8Array>} */
    const contenido = {};
    for (const ruta of rutasDelPaquete(e)) {
        const a = e.archivos.find(x => x.ruta === ruta);
        contenido[ruta] = Uint8Array.from({ length: a ? a.bytes : 50 }, (_, i) => (i * 31 + ruta.length) % 251);
    }
    /** @type {string[]} */
    const avances = [];
    const trozos = await paqueteDelCaso(e, {
        version: 'v', fecha: new Date(2026, 9, 21, 12),
        obtener: async url => { const ruta = decodeURIComponent(url.replace(/^ejemplos\/01-correlacional\//, '').replace(/\?v=v$/, '')); const b = contenido[ruta]; return { ok: true, status: 200, text: async () => '', arrayBuffer: async () => b.slice().buffer }; },
        alAvanzar: (h, t) => avances.push(`${h}/${t}`),
    });
    const zip = unirTrozos(trozos);
    const entradas = listarZip(zip);
    assert.deepEqual(entradas.map(x => x.nombre), rutasDelPaquete(e).map(r => `01-correlacional/${r}`));
    assert.deepEqual(rutasDelPaquete(e).slice(0, 2), ['README.md', 'verificacion.json']);
    for (const x of entradas) assert.deepEqual(await extraerZip(zip, x), contenido[x.nombre.slice('01-correlacional/'.length)], x.nombre);
    assert.equal(avances[0], '0/5');
    assert.equal(avances[avances.length - 1], '5/5');
});
