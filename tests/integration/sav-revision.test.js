// @ts-check
// tests/integration/sav-revision.test.js — (revisión de la 2026.12.29) lo que corrigió la revisión independiente del puente
// SPSS: las anclas compartidas por inclusión y los archivos del Simulador, las páginas de código de MS-DOS, el 7.22 de PSPP
// antiguo, los números reservados, las etiquetas con espacios al final, las claves de etiqueta que no son números, los
// nombres cortos sin coste cuadrático, la medida de los ítems continuos y las fechas con fracciones de segundo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { leerSav, esPerdidoSav } from '../../src/core/data/sav/lector.js';
import { escribirSav } from '../../src/core/data/sav/escritor.js';
import { codificacionDelArchivo, etiquetaCodificacion, HIGHEST, LOWEST } from '../../src/core/data/sav/formato.js';
import { decodificadorPara, etiquetaDOS } from '../../src/core/data/codificacion.js';
import { esFecha } from '../../src/core/data/celdas.js';
import { baseDesdeSav } from '../../src/analizador/motor/datos-spss.js';
import { PRODUCTO_SIMULADOR } from '../../src/simulador/dominio/exportacion-spss.js';
import { partir, extension, unir } from '../oracle/sav_registros.js';

const anclas = { 1: 'Nunca', 2: 'Casi nunca', 3: 'A veces', 4: 'Casi siempre', 5: 'Siempre' };
const items = (extra) => Array.from({ length: 5 }, (_, j) => ({
    nombre: `AE${j + 1}`, valores: [3, 2, 2, 5, 1, 4].map(x => ((x + j) % 5) + 1), medida: 'ordinal',
    etiquetasValor: j === 2 && extra ? { ...anclas, 9: 'No responde' } : anclas
}));

test('las anclas compartidas, por inclusión: el ítem que añade «9 = No responde» sigue siendo un ítem (número)', async () => {
    const base = baseDesdeSav(await leerSav(escribirSav({ variables: items(true) }).bytes));
    assert.deepEqual(base.numericas, ['AE1', 'AE2', 'AE3', 'AE4', 'AE5']);
    assert.deepEqual(base.categoricas, []);
    // dos conjuntos que no se contienen (otras etiquetas para los mismos códigos) no se suman
    const mezcla = [...items(false).slice(0, 2), { nombre: 'Grupo', valores: [1, 2, 1, 2, 1, 2], etiquetasValor: { 1: 'Control', 2: 'Experimental' } }];
    const b2 = baseDesdeSav(await leerSav(escribirSav({ variables: mezcla }).bytes));
    assert.deepEqual(b2.categoricas, ['AE1', 'AE2', 'Grupo'], 'dos ítems no llegan a tres: categorías, como cualquier numérica etiquetada');
});

test('los archivos del Simulador (su firma en la cabecera): toda numérica con etiquetas es una categoría, como en su CSV', async () => {
    const v = [...items(false), { nombre: 'Juez1', valores: [1, 2, 3, 1, 2, 3], etiquetasValor: { 1: 'Bajo', 2: 'Medio', 3: 'Alto' } }];
    const { bytes } = escribirSav({ variables: v }, { producto: PRODUCTO_SIMULADOR });
    assert.equal(new TextDecoder().decode(bytes.subarray(4, 64)).trim(), '@(#) SPSS DATA FILE - StatSim Pro - Simulador');
    const archivo = await leerSav(bytes);
    assert.equal(archivo.producto, '@(#) SPSS DATA FILE - StatSim Pro - Simulador');
    const base = baseDesdeSav(archivo);
    assert.deepEqual(base.categoricas, ['AE1', 'AE2', 'AE3', 'AE4', 'AE5', 'Juez1']);
    assert.deepEqual(base.filas.map(f => f.Juez1), ['Bajo', 'Medio', 'Alto', 'Bajo', 'Medio', 'Alto']);
    // sin la firma (otro programa, o el escritor por omisión), los cinco ítems siguen siendo números
    assert.deepEqual(baseDesdeSav(await leerSav(escribirSav({ variables: v }).bytes)).numericas, ['AE1', 'AE2', 'AE3', 'AE4', 'AE5']);
    assert.equal(new TextDecoder().decode(escribirSav({ variables: v }).bytes.subarray(4, 64)).trim(), '@(#) SPSS DATA FILE - StatSim Pro', 'el producto por omisión no cambia');
});

test('las páginas de código de MS-DOS (437, 850, 852, 858), con tabla propia; una desconocida, con aviso', async () => {
    assert.equal(decodificadorPara('ibm850').decode(Uint8Array.of(0x63, 0x61, 0x66, 0x82, 0x20, 0x6E, 0x69, 0xA4, 0x6F)), 'café niño');
    assert.equal(decodificadorPara('ibm437').decode(Uint8Array.of(0x82, 0xA4, 0xA5, 0xE1)), 'éñÑß');
    assert.equal(decodificadorPara('ibm858').decode(Uint8Array.of(0xD5)), '€', 'la 858 es la 850 con el euro');
    assert.equal(decodificadorPara('ibm850').decode(Uint8Array.of(0xD5)), 'ı');
    assert.equal(decodificadorPara('ibm852').decode(Uint8Array.of(0xA5, 0xE4)), 'ąń');
    for (const e of ['cp850', 'CP850', 'IBM850', 'ibm-850', '850']) assert.equal(etiquetaDOS(e), 'ibm850', e);
    assert.equal(etiquetaCodificacion('', 850), 'ibm850', 'por la página de código del 7.3');
    assert.equal(etiquetaCodificacion('CP850', 0), 'ibm850', 'por el nombre del 7.20');
    assert.deepEqual(codificacionDelArchivo('', 737), { etiqueta: 'windows-1252', conocida: false, declarada: 'página de código 737' });
    assert.equal(codificacionDelArchivo('', 0).conocida, true, 'sin declaración: la de los archivos anteriores al modo Unicode');
    // un archivo con la página 850 en el 7.3 y sin 7.20: sus textos, en CP850
    const { bytes } = escribirSav({ variables: [{ nombre: 'x', tipo: 'texto', valores: ['ab'] }], etiquetaArchivo: 'Archivo' }, { comprimir: false });
    const partes = partir(bytes);
    partes.registros = partes.registros.filter(r => r.subtipo !== 20);
    const r3 = /** @type {import('../oracle/sav_registros.js').Registro} */ (partes.registros.find(r => r.subtipo === 3));
    new DataView(r3.bytes.buffer, r3.bytes.byteOffset).setInt32(16 + 28, 850, true);
    const i = partes.datos.indexOf(0x61);   // «a» de «ab», en los datos
    partes.datos[i] = 0x82;                  // «é» en CP850
    const leido = await leerSav(unir(partes));
    assert.equal(leido.codificacion, 'ibm850'); assert.equal(leido.datos[0][0], 'éb');
    new DataView(r3.bytes.buffer, r3.bytes.byteOffset).setInt32(16 + 28, 737, true);
    const otra = await leerSav(unir(partes));
    assert.match(otra.avisos.join(' | '), /declara la codificación «página de código 737», que no se reconoce/);
});

test('el 7.22 de PSPP antiguo (el largo repetido antes de cada valor) se lee como el actual', async () => {
    const original = new Uint8Array(fs.readFileSync(new URL('../oracle/sav/readstat_vls.sav', import.meta.url)));
    const partes = partir(original);
    const k = partes.registros.findIndex(r => r.subtipo === 22);
    const nombre = new TextEncoder().encode('grupo');
    const valor = s => new TextEncoder().encode(s.padEnd(8, ' '));
    const i32 = x => { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, x, true); return b; };
    const juntar = (...p) => { const o = new Uint8Array(p.reduce((s, x) => s + x.length, 0)); let q = 0; for (const x of p) { o.set(x, q); q += x.length; } return o; };
    const actual = juntar(i32(nombre.length), nombre, Uint8Array.of(2), i32(8), valor('NS/NC'), valor('NR'));
    const antiguo = juntar(i32(nombre.length), nombre, Uint8Array.of(2), i32(8), valor('NS/NC'), i32(8), valor('NR'));
    for (const [como, datos] of [['actual', actual], ['PSPP antiguo', antiguo]]) {
        partes.registros[k] = extension(22, datos);
        const v = await leerSav(unir(partes));
        const g = /** @type {any} */ (v.variables.find(x => x.nombre === 'grupo'));
        assert.deepEqual(g.perdidos, { valores: ['NS/NC', 'NR'], rango: null }, como);
        assert.deepEqual(v.avisos, [], como);
        assert.equal(esPerdidoSav(g, 'NR'), true, como);
    }
});

test('los números reservados (±DBL_MAX y LOWEST) son perdidos al leer y al escribir; los rangos LO/HI, infinitos', async () => {
    const { bytes, avisos } = escribirSav({ variables: [{ nombre: 'x', valores: [1, HIGHEST, -Number.MAX_VALUE, LOWEST, 3] }] });
    assert.match(avisos.join(' | '), /«x»: 3 valor\(es\) iguales a ±1\.797693e308/);
    assert.deepEqual(Array.from((await leerSav(bytes)).datos[0]), [1, NaN, NaN, NaN, 3]);
    // escritos tal cual (sin pasar por el escritor): HIGHEST como dato también es perdido al leer, como en ReadStat
    const crudo = escribirSav({ variables: [{ nombre: 'x', valores: [1, 2] }] }, { comprimir: false }).bytes;
    const p = crudo.length - 8;
    new DataView(crudo.buffer, crudo.byteOffset).setFloat64(p, HIGHEST, true);
    assert.deepEqual(Array.from((await leerSav(crudo)).datos[0]), [1, NaN]);
    // «LO THRU -1» del archivo de ReadStat de las pruebas: el extremo, −∞
    const v = await leerSav(new Uint8Array(fs.readFileSync(new URL('../oracle/sav/readstat_vls.sav', import.meta.url))));
    const puntaje = /** @type {any} */ (v.variables.find(x => x.nombre === 'puntaje'));
    assert.deepEqual(puntaje.perdidos.rango, [-9, -1], 'un rango con extremos normales no cambia');
});

test('las etiquetas sin los espacios del final; las claves que no son números, y las repetidas, se omiten con aviso', async () => {
    const { bytes, avisos } = escribirSav({ variables: [
        { nombre: 'Edad', etiqueta: 'Edad en años  ', valores: [1, 2], etiquetasValor: { 1: 'Joven  ', 2: 'Mayor' } },
        { nombre: 'Raras', valores: [1, 0], etiquetasValor: { 1: 'uno', '': 'vacía', ' ': 'espacio', '0x10': 'hex', '0b11': 'binario', '1e3': 'mil', abc: 'texto', '2,5': 'coma' } },
        { nombre: 'Dobles', valores: [1], etiquetasValor: [[1, 'primera'], ['1', 'segunda'], [1.0, 'tercera']] }
    ] });
    const v = await leerSav(bytes);
    assert.equal(v.variables[0].etiqueta, 'Edad en años');
    assert.deepEqual(v.variables[0].etiquetasValor, [[1, 'Joven'], [2, 'Mayor']]);
    assert.deepEqual(v.variables[1].etiquetasValor, [[1, 'uno'], [2.5, 'coma']], 'solo los códigos decimales');
    assert.deepEqual(v.variables[2].etiquetasValor, [[1, 'primera']]);
    assert.ok(avisos.includes('«Raras»: 6 etiqueta(s) de valor con un código que no es un número se omiten'), avisos.join(' | '));
    assert.ok(avisos.includes('«Dobles»: 2 etiqueta(s) de valor repiten un código y se omiten (queda la primera)'), avisos.join(' | '));
});

test('miles de variables con el mismo prefijo: nombres cortos únicos, en tiempo lineal', async () => {
    const variables = Array.from({ length: 6000 }, (_, i) => ({ nombre: `Pregunta_numero_${i + 1}`, valores: [i % 5] }));
    const t0 = performance.now();
    const { bytes } = escribirSav({ variables });
    assert.ok(performance.now() - t0 < 3000, `escrito en ${(performance.now() - t0).toFixed(0)} ms (antes, ≈ 28 s)`);
    const v = await leerSav(bytes);
    assert.deepEqual(v.variables.map(x => x.nombre), variables.map(x => x.nombre));
    // los nombres repetidos, como antes: «x», «x_2», «x_3»…
    const r = await leerSav(escribirSav({ variables: ['x', 'x', 'X', 'x_2', 'x'].map(n => ({ nombre: n, valores: [1] })) }).bytes);
    assert.deepEqual(r.variables.map(x => x.nombre), ['x', 'x_2', 'X_3', 'x_2_2', 'x_4']);
});

test('una fecha-hora con fracciones de segundo es una fecha para el Analizador, no una categoría', () => {
    assert.equal(esFecha('2024-01-01 01:00:00.250'), true);
    assert.equal(esFecha('2024-01-01T01:00:00.5'), true);
    assert.equal(esFecha('2024-01-01 01:00:00.'), false);
});
