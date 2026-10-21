// @ts-check
// tests/unit/motor-analizador.test.js — (2026.12.24, fase F6, paso 4) el motor del análisis general (src/analizador/motor/:
// datos, marco, descriptivos, normalidad, correlación, grupos, contingencia, fiabilidad de las escalas y magnitudes) y la
// χ² de independencia del núcleo (core/stats/contingencia.js), que salieron de analizador/estadistica.js, ahora el
// orquestador. Que el resultado no cambió lo comprobó un diferencial de toda la API (≈ 91 000 llamadas idénticas) y de las
// vistas y el Word (≈ 1 900 salidas idénticas); estas pruebas fijan los contratos de los módulos nuevos: sus capas, la χ²
// frente a SciPy, las bandas únicas en sus umbrales (también las de la pestaña de grupos, la tarjeta de fiabilidad, los
// gráficos, la redacción, el Word y la V de Cramér, y que ningún otro módulo las define), el marco, la lectura del CSV, que el α de las dimensiones es el de la tarjeta de fiabilidad (y el α sin cada ítem y el recodificado de
// esta), las reglas de la correlación y de los grupos (la lateralidad por defecto, la rama, los nombres, la decisión con el
// α dado, los mínimos) y el estado y los valores por defecto del orquestador, y que la V de Cramér del informe del
// Simulador es la de la χ² del núcleo. Las pruebas de la correlación, de los grupos, del orquestador y de la tarjeta de
// fiabilidad, los umbrales de las bandas, el lector de comas, el α con dos ítems y el máximo de categorías los pidió el
// análisis de mutaciones: sin ellos, 26 cambios de comportamiento en estos módulos pasaban inadvertidos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pruebaIndependencia } from '../../src/core/stats/contingencia.js';
import { mediana, medianaOrdenada } from '../../src/core/stats/orden.js';
import { alfaCronbach } from '../../src/core/stats/fiabilidad.js';
import { varianza } from '../../src/core/stats/descriptivos.js';
import { chiCuadradoIndependencia, MAX_CATEGORIAS } from '../../src/analizador/motor/contingencia.js';
import { descriptivos, percentil } from '../../src/analizador/motor/descriptivos.js';
import { evaluarNormalidad } from '../../src/analizador/motor/normalidad.js';
import { magnitudD, magnitudR, magnitudEta2, fuerzaCorrelacion, nivelFiabilidad, fuerzaCorrelacionGrafico, fuerzaCorrelacionDispersion, asociacionCramerV } from '../../src/analizador/motor/magnitudes.js';
import { marcoInicial, alfaDelMarco, parsearDimensiones, itemsAusentes } from '../../src/analizador/motor/marco.js';
import { leerCSV, valoresNumericos, esConstante } from '../../src/analizador/motor/datos.js';
import { alfaDeItems, puntajesDimension, fiabilidadPorDimensiones } from '../../src/analizador/motor/fiabilidad-escalas.js';
import * as motorGrupos from '../../src/analizador/motor/grupos.js';
import * as motorCorrelacion from '../../src/analizador/motor/correlacion.js';
import { formatoNormalidad } from '../../src/analizador/motor/normalidad.js';
import { parsearLineaCSV, parsearLineaCSVCon } from '../../src/shared/csv.js';

const aqui = path.dirname(fileURLToPath(import.meta.url)), raiz = path.join(aqui, '..', '..');
const { datos: D, esperado: E } = JSON.parse(fs.readFileSync(path.join(aqui, '..', 'oracle', 'inferencia_fixture.json'), 'utf8'));
/** @param {number} x @param {number} ref @param {number} tol @param {string} que */
const cerca = (x, ref, tol, que) => assert.ok(Math.abs(x - ref) <= tol * Math.max(Math.abs(ref), 1e-300) || x === ref, `${que}: ${x} frente a ${ref}`);
/** Un generador congruencial (el de MINSTD), para datos reproducibles. @param {number} semilla */
const generador = semilla => { let s = semilla; const u = () => (s = (s * 48271) % 2147483647) / 2147483647; return { u, nor: () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u()) }; };

test('las capas: el motor no importa la clase, el DOM ni otras secciones; la χ² del núcleo, solo el núcleo', () => {
    const dir = path.join(raiz, 'src', 'analizador', 'motor'), archivos = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
    assert.ok(archivos.length >= 9, `los módulos del motor: ${archivos.join(', ')}`);
    for (const f of archivos) {
        const texto = fs.readFileSync(path.join(dir, f), 'utf8');
        assert.match(texto, /^\/\/ @ts-check/, `${f}: con // @ts-check`);
        for (const [, ruta] of texto.matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)) {
            const destino = path.relative(path.join(raiz, 'src'), path.resolve(dir, /** @type {string} */ (ruta))).replaceAll(path.sep, '/');
            assert.ok(/^core\//.test(destino) || destino === 'shared/csv.js' || destino === 'shared/formato-numero.js' || destino === 'shared/diccionario-xlsx.js' || /^analizador\/motor\/[a-z-]+\.js$/.test(destino), `${f} importa ${destino}`);
        }
        assert.ok(!/\b(document|window)\./.test(texto.replace(/\/\/.*$/gm, '')), `${f}: sin DOM`);
    }
    // (2026.12.31) shared/diccionario-xlsx.js, el convenio de hojas que comparte con el Simulador: solo constantes
    const convenio = fs.readFileSync(path.join(raiz, 'src', 'shared', 'diccionario-xlsx.js'), 'utf8');
    assert.ok(!/^import/m.test(convenio) && !/\b(document|window)\./.test(convenio.replace(/\/\/.*$/gm, '')), 'shared/diccionario-xlsx.js: sin importaciones ni DOM');
    const nucleo = fs.readFileSync(path.join(raiz, 'src', 'core', 'stats', 'contingencia.js'), 'utf8');
    for (const [, ruta] of nucleo.matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)) assert.match(/** @type {string} */ (ruta), /^\.\/[a-z-]+\.js$/, 'core/stats/contingencia.js importa solo del núcleo');
    // las bandas del Analizador se definen solo en motor/magnitudes.js (ni en la interfaz, ni en los gráficos, ni en el Word):
    // ningún otro módulo elige una de sus etiquetas tras un umbral («? 'débil'» o «return 'débil'»); compararlas sí puede
    const analizador = path.join(raiz, 'src', 'analizador');
    /** @param {string} d @returns {string[]} */
    const js = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? js(path.join(d, e.name)) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []);
    for (const f of js(analizador).filter(f => !f.endsWith(path.join('motor', 'magnitudes.js')))) {
        const texto = fs.readFileSync(f, 'utf8');
        for (const etiqueta of ['despreciable', 'prácticamente nula', 'asociación nula o muy débil', 'asociación débil', 'nula o muy débil', 'moderada-fuerte', 'cuestionable', 'trivial']) {
            assert.ok(!new RegExp(`(\\?|return)\\s*'${etiqueta}'`).test(texto), `${path.relative(raiz, f)} define la banda «${etiqueta}»`);
        }
        assert.ok(!/aR < \.10/.test(texto), `${path.relative(raiz, f)}: la banda del diagrama de dispersión, suelta`);
    }
    // el orquestador delega: ya no lleva las fórmulas (la χ², el α, las bandas ni los formatos de las pruebas)
    const orquestador = fs.readFileSync(path.join(raiz, 'src', 'analizador', 'estadistica.js'), 'utf8');
    for (const fragmento of ['Math.pow', 'esperadas', 'varianzasItems', "'trivial'", "'excelente'", 'Number.isNaN(r.F)', '_formato']) {
        assert.ok(!orquestador.includes(fragmento), `estadistica.js ya no contiene «${fragmento}»`);
    }
});

test('χ² de independencia del núcleo igual a SciPy (chi2_contingency sin corrección): χ², p, gl, esperadas, V de Cramér y esperadas < 5', () => {
    D.contingencia.forEach((/** @type {number[][]} */ tabla, /** @type {number} */ t) => {
        const e = E.contingencia[t], R = pruebaIndependencia(tabla);
        cerca(R.chiCuadrado, e.chi2, 1e-13, `tabla ${t}: χ²`); cerca(R.pValor, e.p, 1e-12, `tabla ${t}: p`);
        assert.equal(R.gl, e.gl); assert.equal(R.esperadasBajas, e.bajas, `tabla ${t}: esperadas < 5`);
        cerca(R.cramerV, e.v, 1e-13, `tabla ${t}: V`);
        e.esperadas.forEach((/** @type {number[]} */ fila, /** @type {number} */ i) => fila.forEach((v, j) => cerca(/** @type {number} */ (/** @type {number[]} */ (R.esperadas[i])[j]), v, 1e-14, `tabla ${t}: esperada [${i}][${j}]`)));
        assert.equal(R.n, tabla.flat().reduce((a, b) => a + b, 0));
    });
    // independencia exacta: χ² = 0 y p = 1
    assert.deepEqual([pruebaIndependencia([[10, 20], [5, 10]]).chiCuadrado, pruebaIndependencia([[10, 20], [5, 10]]).pValor], [0, 1]);
});

test('la χ² del análisis general: categorías ordenadas (números por su valor, textos por orden alfabético), perdidos fuera, la tabla y la decisión con el α dado', () => {
    const { u } = generador(1224);
    D.contingencia.forEach((/** @type {number[][]} */ tabla, /** @type {number} */ t) => {
        // filas con rótulos numéricos que el orden de texto pondría mal (10 antes que 9); columnas con letras desordenadas
        const filas = ['9', '10', '100', '1000', '20000'].slice(0, tabla.length), columnas = ['b', 'a', 'd', 'c', 'e'].slice(0, /** @type {number[]} */ (tabla[0]).length);
        /** @type {unknown[]} */ const v1 = [], v2 = [];
        tabla.forEach((fila, i) => fila.forEach((k, j) => { for (let q = 0; q < k; q++) { v1.push(u() < 0.5 ? Number(filas[i]) : filas[i]); v2.push(columnas[j]); } }));
        // perdidos en una u otra variable, y casos de más en la más larga: no cuentan
        for (const [a, b] of [['', 'a'], [NaN, 'b'], [null, 'c'], ['9', ''], ['10', undefined], ['   ', 'a']]) { const k = Math.floor(u() * (v1.length + 1)); v1.splice(k, 0, a); v2.splice(k, 0, b); }
        v1.push('9', '10');
        const e = E.contingencia[t], R = chiCuadradoIndependencia(v1, v2, 0.05);
        assert.deepEqual(R.categorias1, [...filas].sort((x, y) => Number(x) - Number(y)), `tabla ${t}: filas en orden numérico`);
        assert.deepEqual(R.categorias2, [...columnas].sort(), `tabla ${t}: columnas en orden alfabético`);
        const orden1 = R.categorias1.map(c => filas.indexOf(c)), orden2 = R.categorias2.map(c => columnas.indexOf(c));
        assert.deepEqual(R.observadas, orden1.map(i => orden2.map(j => /** @type {number[]} */ (tabla[i])[j])), `tabla ${t}: las observadas`);
        cerca(R.chiCuadrado, e.chi2, 1e-13, `tabla ${t}: χ²`); cerca(R.pValor, e.p, 1e-12, `tabla ${t}: p`);
        assert.equal(R.decision, e.p < 0.05 ? 'rechazar' : 'no_rechazar');
        assert.equal(chiCuadradoIndependencia(v1, v2, e.p / 2).decision, 'no_rechazar', 'la decisión usa el α que se le da');
    });
    assert.throws(() => chiCuadradoIndependencia(['a', ''], ['x', 'y'], 0.05), /No hay suficientes datos/);
    assert.throws(() => chiCuadradoIndependencia(['a', 'a', 'a'], ['x', 'y', 'x'], 0.05), /al menos 2 categorías/);
    // hasta 15 categorías por variable: con más, no es categórica (una continua, un identificador)
    assert.equal(MAX_CATEGORIAS, 15);
    const quince = Array.from({ length: 45 }, (_, i) => String(i % 15)), dieciseis = Array.from({ length: 48 }, (_, i) => String(i % 16));
    assert.equal(chiCuadradoIndependencia(quince, quince.map((_, i) => (i % 2 ? 'x' : 'y')), 0.05).categorias1.length, 15);
    assert.throws(() => chiCuadradoIndependencia(dieciseis, dieciseis.map((_, i) => (i % 2 ? 'x' : 'y')), 0.05), /demasiadas categorías/);
});

test('los descriptivos y la mediana de una serie ordenada (la de los descriptivos, el informe del Simulador y el MCD)', () => {
    const d = descriptivos([5, 2, 9, 4, 4, 7, 4, 5]);
    assert.equal(d.n, 8); assert.equal(d.media, 5); cerca(d.varianza, 32 / 7, 1e-15, 'varianza'); assert.equal(d.mediana, 4.5);
    assert.equal(d.q1, 4); assert.equal(d.q3, 5.5); assert.equal(d.iqr, 1.5); assert.equal(d.min, 2); assert.equal(d.max, 9); assert.equal(d.rango, 7);
    cerca(d.errorEstandar, Math.sqrt(32 / 7) / Math.sqrt(8), 1e-15, 'error estándar');
    assert.deepEqual(Object.keys(d), ['n', 'media', 'desviacion', 'varianza', 'errorEstandar', 'min', 'max', 'rango', 'mediana', 'q1', 'q3', 'iqr', 'asimetria', 'curtosis']);
    assert.equal(percentil([1, 2, 3, 4], 50), 2.5); assert.equal(percentil([1, 2, 3, 4], 0), 1); assert.equal(percentil([1, 2, 3, 4], 100), 4);
    assert.throws(() => descriptivos([]), /No hay valores numéricos/);
    // medianaOrdenada da el mismo valor que mediana(), que elige los mismos elementos sin ordenar
    const { u, nor } = generador(77);
    for (let i = 0; i < 3000; i++) {
        const n = 1 + Math.floor(u() * 12), v = Array.from({ length: n }, () => (u() < 0.3 ? Math.round(nor()) : nor() * 1e3 + 0.1));
        assert.ok(medianaOrdenada([...v].sort((a, b) => a - b)) === mediana(v), `mediana de ${v}`);   // === : −0 y 0 empatan al ordenar
    }
    assert.ok(Number.isNaN(medianaOrdenada([])));
    assert.throws(() => evaluarNormalidad([1, 2]), /al menos 3 observaciones/);
    const N = evaluarNormalidad([3, 1, 4, 1, 5, 9, 2, 6]);
    assert.equal(N.prueba, 'Shapiro-Wilk'); assert.equal(N.razon, 'n < 50'); assert.equal(N.n, 8);
});

test('los descriptivos rápidos del informe del Simulador: la mediana del núcleo sobre la serie ordenada', async () => {
    const { GeneradorDatos } = await import('../../src/simulador/dominio/generador.js');
    const G = new GeneradorDatos();
    for (const v of [[3], [4, 1], [5, 1, 3], [2, 8, 4, 6], [7, 7, 1, 9, 3]]) {
        G.datosGenerados = v.map(x => ({ A: x, B: null }));
        const e = G.calcularEstadisticas('A'), s = [...v].sort((a, b) => a - b);
        assert.equal(e.mediana, medianaOrdenada(s), `mediana de ${v}`); assert.equal(e.mediana, mediana(v));
        assert.equal(e.min, s[0]); assert.equal(e.max, s[s.length - 1]);
    }
    G.datosGenerados = [{ A: 1 }]; assert.equal(G.calcularEstadisticas('B'), null, 'una columna sin valores');
});

test('las bandas: una sola definición para el análisis general, la pestaña de grupos, la tarjeta de fiabilidad, los gráficos y la redacción', async () => {
    // cada banda en su umbral y justo por debajo (los valores absolutos: las tres vistas comparten la definición)
    const casos = [[magnitudD, [[0.1999, 'trivial'], [0.2, 'pequeño'], [0.4999, 'pequeño'], [-0.5, 'mediano'], [0.7999, 'mediano'], [0.8, 'grande'], [NaN, 'grande']]],
        [magnitudR, [[0.0999, 'trivial'], [0.1, 'pequeño'], [0.2999, 'pequeño'], [-0.3, 'mediano'], [0.4999, 'mediano'], [0.5, 'grande']]],
        [magnitudEta2, [[0.0099, 'trivial'], [0.01, 'pequeño'], [0.0599, 'pequeño'], [0.06, 'mediano'], [0.1399, 'mediano'], [0.14, 'grande']]],
        [fuerzaCorrelacion, [[0.0999, 'nula o muy débil'], [-0.1, 'débil'], [0.2999, 'débil'], [0.3, 'moderada'], [0.4999, 'moderada'], [0.5, 'moderada-fuerte'], [0.6999, 'moderada-fuerte'], [-0.7, 'fuerte'], [0.8999, 'fuerte'], [0.9, 'muy fuerte']]],
        [nivelFiabilidad, [[0.95, 'excelente'], [0.9, 'excelente'], [0.8999, 'buena'], [0.8, 'buena'], [0.7999, 'aceptable'], [0.7, 'aceptable'], [0.6999, 'cuestionable'], [0.6, 'cuestionable'], [0.5999, 'pobre'], [0.5, 'pobre'], [0.4999, 'inaceptable'], [NaN, 'inaceptable']]],
        [fuerzaCorrelacionGrafico, [[0.0999, 'despreciable'], [-0.1, 'débil'], [0.2999, 'débil'], [0.3, 'moderada'], [-0.4999, 'moderada'], [0.5, 'fuerte'], [NaN, 'fuerte']]],
        [fuerzaCorrelacionDispersion, [[-0.0999, 'prácticamente nula'], [0.1, 'débil'], [0.2999, 'débil'], [0.3, 'moderada'], [0.4999, 'moderada'], [-0.5, 'considerable'], [0.6999, 'considerable'], [0.7, 'fuerte'], [NaN, 'fuerte']]],
        [asociacionCramerV, [[0, 'asociación nula o muy débil'], [0.0999, 'asociación nula o muy débil'], [0.1, 'asociación débil'], [0.2999, 'asociación débil'], [0.3, 'asociación moderada'], [0.4999, 'asociación moderada'], [0.5, 'asociación fuerte'], [1, 'asociación fuerte']]]];
    for (const [f, pares] of casos) for (const [v, esperado] of pares) assert.equal(/** @type {(x: number) => string} */ (f)(/** @type {number} */ (v)), esperado, `${f.name}(${v})`);
    const { AnalizadorEstadistico: A } = await import('../../src/analizador/estadistica.js');
    const { ComparacionGrupos: CG } = await import('../../src/analizador/comparacion-grupos.js');
    const { Fiabilidad } = await import('../../src/analizador/fiabilidad.js');
    const { ScientificCharts } = await import('../../src/analizador/graficas.js');
    const { InterpretacionesEstadisticas: I } = await import('../../src/analizador/interpretaciones.js');
    for (let v = -1.2; v <= 1.2; v += 0.0025) {
        assert.deepEqual(ScientificCharts.prototype._fuerzaCorrelacion(v), { fuerza: fuerzaCorrelacionGrafico(v), direccion: v >= 0 ? 'positiva' : 'negativa' });
        if (v >= 0) assert.equal(I._benchmarkCohen(v), v < 0.1 ? 'inferior al umbral de efecto pequeño' : magnitudR(v));
        assert.equal(A.interpretarCohenD(v), magnitudD(v)); assert.equal(CG._magnitud('d de Cohen', v), magnitudD(v));
        assert.equal(CG._magnitud('r', v), magnitudR(v));
        assert.equal(A.interpretarEtaCuadrado(v), magnitudEta2(v)); assert.equal(CG._magnitud('η²', v), magnitudEta2(v)); assert.equal(CG._magnitud('ε²', v), magnitudEta2(v));
        assert.equal(A.interpretarAlfaCronbach(v), nivelFiabilidad(v)); assert.equal(Fiabilidad.interpretar(v), nivelFiabilidad(v));
        assert.equal(A.interpretarCorrelacion(v, 0.5).fuerza, fuerzaCorrelacion(v));
    }
    // la lectura de la matriz de los gráficos cuenta y nombra los pares con las bandas de los gráficos
    const { AnalisisGraficos } = await import('../../src/analizador/analisis-graficos.js');
    const lectura = AnalisisGraficos.generar('matriz-correlacion', { correlaciones: [[1, 0.62, 0.35, -0.45], [0.62, 1, 0.15, 0.05], [0.35, 0.15, 1, -0.2], [-0.45, 0.05, -0.2, 1]], labels: ['A', 'B', 'C', 'D'] });
    for (const trozo of ['3 asociaciones positivas, 2 negativas y 1 de magnitud despreciable', '(.62; fuerte;', '(−.45; moderada)', '(1 par fuerte, 2 moderados y 2 débiles)']) {
        assert.ok(lectura.includes(trozo), `la lectura de la matriz: «${trozo}»`);
    }
});

test('el marco y las dimensiones: α validado, dimensiones escritas como texto e ítems que no están en la base', () => {
    assert.deepEqual(marcoInicial(), { tipoEstudio: 'correlacional', nivelSignificancia: 0.05 });
    for (const [a, esperado] of [[0.01, 0.01], [0.1, 0.1], [0, 0.05], [1, 0.05], [7, 0.05], [NaN, 0.05], [Infinity, 0.05], ['0.01', 0.05], [undefined, 0.05]]) {
        assert.equal(alfaDelMarco({ nivelSignificancia: a }), esperado, `α = ${a}`);
    }
    assert.equal(alfaDelMarco(null), 0.05);
    assert.deepEqual(parsearDimensiones(' D1 : IT1, IT2 ;D2:IT3;;malformado;D3:;x:y:z;D4:IT4,,IT5 '), { D1: ['IT1', 'IT2'], D2: ['IT3'], D4: ['IT4', 'IT5'] });
    assert.deepEqual(parsearDimensiones(''), {});
    assert.deepEqual(itemsAusentes({ D1: ['IT1', 'IT9'], D2: ['IT2', 'IT8'] }, ['IT1', 'IT2', 'IT3']), ['IT9', 'IT8']);
});

test('la base: leer un CSV (delimitador, comillas, coma decimal, filas descartadas), los valores numéricos y las series constantes', () => {
    const filas = leerCSV('Nombre; Edad ;Puntaje\n"Pérez; Ana";20;3,5\nLuis;5 años;4\nincompleta;1\n"Ruiz";2024-05-01;\r\nSol;-0;.5');
    assert.deepEqual(filas, [{ Nombre: 'Pérez; Ana', Edad: 20, Puntaje: 3.5 }, { Nombre: 'Luis', Edad: '5 años', Puntaje: 4 },
        { Nombre: 'Ruiz', Edad: '2024-05-01', Puntaje: '' }, { Nombre: 'Sol', Edad: -0, Puntaje: 0.5 }]);
    assert.deepEqual(leerCSV('a,b\n1,2'), [{ a: 1, b: 2 }]);
    assert.throws(() => leerCSV('a,b\n'), /al menos encabezados y una fila/);
    assert.throws(() => leerCSV('a,b\n1,2,3'), /Ninguna fila coincide/);
    assert.deepEqual(valoresNumericos(filas, 'Puntaje'), [3.5, 4, 0.5]);
    assert.deepEqual(valoresNumericos(null, 'Puntaje'), []);
    assert.equal(esConstante([2, 2, 2]), true); assert.equal(esConstante([2, 2, 3]), false); assert.equal(esConstante([]), false);
    // el lector de líneas: el de comas (las tablas del Simulador) y el del delimitador dado (el cargador del Analizador)
    assert.deepEqual(parsearLineaCSV(' a, b ,"Lima, Perú";x'), ['a', 'b', 'Lima, Perú;x']);
    assert.deepEqual(parsearLineaCSVCon(' a; b ;"Lima; Perú",x', ';'), ['a', 'b', 'Lima; Perú,x']);
    assert.deepEqual(parsearLineaCSV(''), ['']);
});

test('el α de las dimensiones es el de la tarjeta de fiabilidad (los dos, con el α del núcleo único), con los casos completos', async () => {
    const { nor } = generador(2024);
    const filas = Array.from({ length: 80 }, () => { const z = nor(); const f = /** @type {Record<string, unknown>} */ ({}); for (let j = 1; j <= 5; j++) f['SA' + j] = Math.max(1, Math.min(5, Math.round(3 + 0.9 * z + 0.8 * nor()))); return f; });
    filas[3].SA2 = ''; filas[10].SA5 = NaN;   // dos casos incompletos: el α usa los otros 78
    const items = ['SA1', 'SA2', 'SA3', 'SA4', 'SA5'], A = alfaDeItems(filas, items);
    assert.ok(A); assert.equal(A.n, 78); assert.equal(A.k, 5);
    const completas = filas.filter(f => items.every(i => Number.isFinite(f[i])));
    const cols = items.map(i => completas.map(f => /** @type {number} */ (f[i])));
    assert.equal(A.alfa, alfaCronbach(cols.map(c => varianza(c)), varianza(completas.map(f => items.reduce((s, i) => s + /** @type {number} */ (f[i]), 0)))));
    const { Fiabilidad } = await import('../../src/analizador/fiabilidad.js');
    const R = Fiabilidad.analizarTodo(filas), escala = R.validos.find((/** @type {any} */ r) => r.k === 5);
    assert.ok(escala, 'la tarjeta detecta la escala SA'); assert.equal(escala.alfa, A.alfa, 'el mismo α en la tarjeta de fiabilidad');
    assert.equal(alfaDeItems(filas, ['SA1']), null, 'con un solo ítem');
    const dos = alfaDeItems(filas, ['SA1', 'SA2']), completas2 = filas.filter(f => Number.isFinite(f.SA1) && Number.isFinite(f.SA2));
    assert.ok(dos, 'con dos ítems, la fórmula vale (k = 2)'); assert.equal(dos.n, 79);
    assert.equal(dos.alfa, alfaCronbach([varianza(completas2.map(f => /** @type {number} */ (f.SA1))), varianza(completas2.map(f => /** @type {number} */ (f.SA2)))],
        varianza(completas2.map(f => /** @type {number} */ (f.SA1) + /** @type {number} */ (f.SA2)))));
    assert.equal(alfaDeItems(filas.slice(0, 1), items), null, 'con un solo caso');
    assert.equal(alfaDeItems([{ a: 1, b: 2 }, { a: 2, b: 1 }], ['a', 'b']), null, 'con la varianza del total nula');
    // los puntajes con la regla del 80 %: con 4 de 5 ítems, prorrateo; con menos, NaN
    const p = puntajesDimension([{ a: 1, b: 2, c: 3, d: 4, e: '' }, { a: 1, b: '', c: '', d: 4, e: 5 }], ['a', 'b', 'c', 'd', 'e']);
    assert.equal(p[0], 12.5); assert.ok(Number.isNaN(p[1]));
    const F = fiabilidadPorDimensiones(filas, { D1: ['SA1', 'SA2'], D2: ['SA3', 'SA4', 'SA5'] });
    assert.deepEqual(F.dimensiones.map(d => d.nombre), ['D1', 'D2']);
    assert.equal(F.escala && F.escala.alfa, A.alfa, 'la escala completa: todos los ítems de sus dimensiones');
});

test('el orquestador delega en el motor con el α del estudio', async () => {
    const { AnalizadorEstadistico: A } = await import('../../src/analizador/estadistica.js');
    const { nor } = generador(31);
    const filas = Array.from({ length: 40 }, (_, i) => { const z = nor(); return { X: +(50 + 10 * z).toFixed(2), Y: +(20 + 3 * (0.6 * z + 0.8 * nor())).toFixed(2), G: i % 2 ? 'a' : 'b', H: i % 3 ? 'p' : 'q' }; });
    A.cargarDatos(filas);
    const original = A.configuracionInvestigacion.nivelSignificancia;
    try {
        A.configurarMarcoInvestigacion({ nivelSignificancia: 0.01 });
        const g1 = filas.filter(f => f.G === 'a').map(f => f.X), g2 = filas.filter(f => f.G === 'b').map(f => f.X);
        assert.deepEqual(A.compararGrupos(g1, g2, 'a', 'b'), motorGrupos.compararDosGrupos(g1, g2, 'a', 'b', 0.01));
        assert.equal(A.compararGrupos(g1, g2, 'a', 'b').alpha, 0.01);
        const C = A.calcularCorrelacion('X', 'Y', 'unilateral');
        assert.equal(C.poder, motorCorrelacion.potenciaPosteriori(C.coeficiente, C.n, 0.01, 'unilateral'), 'la potencia con el α del estudio');
        assert.deepEqual(A.pruebaHipotesis(C), motorCorrelacion.pruebaHipotesis(C, 0.01));
        assert.equal(A.pruebaHipotesis(C, 0.2).alpha, 0.2);
        const chi = A.chiCuadradoIndependencia(filas.map(f => f.G), filas.map(f => f.H));
        assert.equal(chi.decision, chi.pValor < 0.01 ? 'rechazar' : 'no_rechazar');
    } finally { A.configurarMarcoInvestigacion({ nivelSignificancia: original }); }
});

test('la correlación del análisis general: lateralidad por defecto, Pearson o Spearman según la normalidad (la recta, solo con Pearson), gl, errores con el nombre de la variable, potencia indefinida y la redacción', () => {
    const { nor } = generador(808);
    const x = Array.from({ length: 40 }, () => nor()), y = x.map(v => 0.5 * v + nor()), sx = x.map(v => Math.exp(2 * v));
    // sin indicar la lateralidad, bilateral; la unilateral es la mitad (como SPSS)
    const pB = motorCorrelacion.pValorCorrelacion(0.3, 40, 'bilateral');
    assert.equal(motorCorrelacion.pValorCorrelacion(0.3, 40), pB); assert.equal(motorCorrelacion.pValorCorrelacion(0.3, 40, 'unilateral'), pB / 2);
    assert.equal(motorCorrelacion.correlacionPearson(x, y).pValor, motorCorrelacion.correlacionPearson(x, y, 'bilateral').pValor);
    assert.equal(motorCorrelacion.correlacionSpearman(x, y).pValor, motorCorrelacion.correlacionSpearman(x, y, 'bilateral').pValor);
    // dos normales: Pearson, con su recta; una asimétrica: Spearman, sin recta; gl = n − 2 en los dos
    const opc = { tipoPrueba: 'bilateral', alfa: 0.05, nombreX: 'X', nombreY: 'Y' };
    const P = motorCorrelacion.analizarCorrelacion(x, y, opc), S = motorCorrelacion.analizarCorrelacion(sx, y, opc);
    assert.ok(P.normalidad1.normal && P.normalidad2.normal, 'precondición: las dos son normales');
    assert.equal(P.tipoCorrelacion, 'Pearson'); assert.deepEqual(P.regresion, motorCorrelacion.regresionLineal(x, y)); assert.equal(P.gl, 38);
    assert.equal(S.tipoCorrelacion, 'Spearman (Rho)'); assert.ok(!('regresion' in S), 'sin recta con Spearman'); assert.equal(S.gl, 38);
    assert.equal(P.normalidad1.decision, 'Los datos siguen una distribución normal (p > 0.05)');
    assert.equal(S.normalidad1.decision, 'Los datos NO siguen una distribución normal (p ≤ 0.05)');
    assert.deepEqual(formatoNormalidad({ estadistico: 0.9, pValor: 0.01, prueba: 'Kolmogorov-Smirnov (Lilliefors)', n: 60, normal: false }),
        { estadistico: 0.9, pValor: 0.01, prueba: 'Kolmogorov-Smirnov (Lilliefors)', razon: 'n ≥ 50', n: 60, normal: false, decision: 'Los datos NO siguen una distribución normal (p ≤ 0.05)' });
    // los errores: menos de 3 pares (su mensaje, no el de la normalidad) y una variable constante, con SU nombre
    assert.throws(() => motorCorrelacion.analizarCorrelacion([1, 2], [3, 4], opc), /^Error: Se necesitan al menos 3 pares de valores válidos$/);
    assert.throws(() => motorCorrelacion.analizarCorrelacion([5, 5, 5, 5], [1, 2, 3, 4], opc), /La variable "X" no tiene variabilidad/);
    assert.throws(() => motorCorrelacion.analizarCorrelacion([1, 2, 3, 4], [5, 5, 5, 5], opc), /La variable "Y" no tiene variabilidad/);
    // la potencia: null donde no está definida
    for (const [r, n] of [[1, 10], [-1, 10], [0.5, 3], [NaN, 10]]) assert.equal(motorCorrelacion.potenciaPosteriori(r, n), null, `potencia con r = ${r} y n = ${n}`);
    // la redacción: los umbrales .001, .01 y .05 (p igual al umbral ya no lo cumple) y r = 0, «positiva»
    const I = motorCorrelacion.interpretarCorrelacion;
    assert.equal(I(0.5, 0.0009).significancia, 'altamente significativa (p < .001)'); assert.equal(I(0.5, 0.001).significancia, 'muy significativa (p < .01)');
    assert.equal(I(0.5, 0.0099).significancia, 'muy significativa (p < .01)'); assert.equal(I(0.5, 0.01).significancia, 'significativa (p < .05)');
    assert.equal(I(0.5, 0.05).significancia, 'no significativa (p ≥ .05)');
    assert.equal(I(0, 0.9).direccion, 'positiva'); assert.equal(I(-0.2, 0.9).direccion, 'negativa');
    assert.equal(I(-0.62, 0.0004).texto, 'Correlación moderada-fuerte negativa altamente significativa (p < .001)');
    // por dimensiones, la misma regla: Pearson con puntajes normales y Spearman si no
    const dims = { dimension1: 'D1', dimension2: 'E1', items1: ['a'], items2: ['b'] };
    const D = motorCorrelacion.correlacionEntreDimensiones(x, y, 'bilateral', dims);
    assert.equal(D.tipoCorrelacion, 'Pearson'); assert.equal(D.coeficiente, P.coeficiente); assert.equal(D.dimension2, 'E1');
    assert.equal(motorCorrelacion.correlacionEntreDimensiones(sx, y, 'bilateral', dims).tipoCorrelacion, 'Spearman (Rho)');
});

test('los grupos del análisis general: la rama no paramétrica con su r de rangos, el nombre de la t de Welch, la decisión con el α dado y el mínimo de 3 casos', async () => {
    const { protocoloGrupos } = await import('../../src/core/stats/protocolo-grupos.js');
    // dos grupos asimétricos: U de Mann-Whitney, con la r de rangos |z|/√N y la banda de Cohen PARA r
    const g1 = [1, 1, 2, 2, 3, 3, 4, 5, 6, 8, 11, 15, 22, 40], g2 = g1.map(v => v + 5);
    assert.equal(protocoloGrupos([g1, g2], { alfa: 0.05 }).prueba, 'mann-whitney', 'precondición: la rama no paramétrica');
    const M = motorGrupos.compararDosGrupos(g1, g2, 'a', 'b', 0.05);
    assert.equal(M.parametrica, false); assert.equal(M.prueba.prueba, 'U de Mann-Whitney');
    const r = Math.abs(/** @type {number} */ (M.prueba.z)) / Math.sqrt(28);
    assert.deepEqual(M.tamanoEfectoRangos, { r, interpretacion: 'mediano' });   // r ≈ .42: «mediano» para r («pequeño» en la escala de d)
    // la decisión con el α que se le da (p ≈ .026)
    assert.ok(M.prueba.pValor > 0.01 && M.prueba.pValor < 0.05, `p = ${M.prueba.pValor}`);
    assert.equal(M.decision, 'rechazar'); assert.equal(motorGrupos.compararDosGrupos(g1, g2, 'a', 'b', 0.01).decision, 'no_rechazar');
    // dos normales con varianzas distintas: la t de Welch, con su nombre, sin r de rangos
    const { nor } = generador(99);
    const a = Array.from({ length: 30 }, () => +(50 + 2 * nor()).toFixed(2)), b = Array.from({ length: 30 }, () => +(52 + 9 * nor()).toFixed(2));
    assert.equal(protocoloGrupos([a, b], { alfa: 0.05 }).prueba, 'welch', 'precondición: la rama de Welch');
    const W = motorGrupos.compararDosGrupos(a, b, 'a', 'b', 0.05);
    assert.equal(W.prueba.prueba, 't de Welch'); assert.equal(W.parametrica, true); assert.equal(W.levene.varianzasIguales, false); assert.equal(W.tamanoEfectoRangos, null);
    // el mínimo: 3 casos por grupo, con su mensaje (no el de la normalidad)
    assert.throws(() => motorGrupos.compararDosGrupos([1, 2], [3, 4, 5], 'a', 'b', 0.05), /^Error: Cada grupo necesita al menos 3 observaciones$/);
    assert.throws(() => motorGrupos.compararVariosGrupos([[1, 2, 3], [4, 5], [6, 7, 8]], ['a', 'b', 'c'], 0.05), /^Error: Cada grupo necesita al menos 3 observaciones$/);
});

test('el orquestador: una base nueva borra las dimensiones, los avisos de ítems ausentes, sus valores por defecto (bilateral, post-hoc con la MCE), el α de la base cargada, las dimensiones de cada variable y el reporte que sigue sin ellas si fallan', async () => {
    const { AnalizadorEstadisticoProfesional } = await import('../../src/analizador/estadistica.js');
    const A = new AnalizadorEstadisticoProfesional(), { nor } = generador(555);
    /** @param {number} v */ const likert = v => Math.max(1, Math.min(5, Math.round(3 + v)));
    const filas = Array.from({ length: 60 }, (_, i) => {
        const z = nor(), w = 0.6 * z + 0.8 * nor(), f = /** @type {Record<string, unknown>} */ ({ X: +(50 + 10 * z).toFixed(2), Y: +(20 + 3 * w).toFixed(2), G: ['a', 'b', 'c'][i % 3] });
        for (let j = 1; j <= 4; j++) { f['P' + j] = likert(0.9 * z + 0.7 * nor()); f['Q' + j] = likert(0.9 * w + 0.7 * nor()); }
        return f;
    });
    A.cargarDatos(filas);
    // sin lateralidad, bilateral (también en los coeficientes sueltos)
    const C = A.calcularCorrelacion('X', 'Y');
    assert.equal(C.tipoPrueba, 'bilateral'); assert.equal(C.pValor, motorCorrelacion.pValorCorrelacion(C.coeficiente, C.n, 'bilateral'));
    const vx = A.obtenerValoresNumericos('X'), vy = A.obtenerValoresNumericos('Y');
    assert.equal(A.correlacionPearson(vx, vy).pValor, A.correlacionPearson(vx, vy, 'bilateral').pValor);
    // el post-hoc por defecto: la t con la MCE
    const grupos = ['a', 'b', 'c'].map(g => filas.filter(f => f.G === g).map(f => /** @type {number} */ (f.X)));
    assert.equal(A.compararParesPostHoc(grupos, ['a', 'b', 'c']).clave, 'mce');
    // el α de Cronbach, con la base cargada
    const alfa = A.calcularAlfaCronbach(['P1', 'P2', 'P3', 'P4']);
    assert.ok(alfa && alfa.n === 60); assert.deepEqual(alfa, alfaDeItems(filas, ['P1', 'P2', 'P3', 'P4']));
    /** @type {string[]} */ const avisos = [];
    const warn = console.warn;
    console.warn = (...a) => { avisos.push(a.map(String).join(' ')); };
    try {
        A.configurarDimensiones('V1', { D1: ['P1', 'P2'], D2: ['P3', 'P4'] });
        A.configurarDimensiones('V2', { E1: ['Q1', 'Q2'], E2: ['Q3', 'Q4'] });
        assert.deepEqual(avisos, [], 'sin avisos: todos sus ítems están en la base');
        A.configurarDimensiones('V4', { H1: ['Q1', 'Q9', 'P1'], H2: ['Z7'] });
        assert.deepEqual(avisos, ['Ítems no encontrados en los datos: Q9, Z7']);
        // cada variable con SUS dimensiones
        assert.deepEqual(A.calcularCorrelacionPorDimensiones('V1', 'V2').map(r => `${r.dimension1}×${r.dimension2}`), ['D1×E1', 'D1×E2', 'D2×E1', 'D2×E2']);
        // si el análisis por dimensiones falla (ningún ítem de V3 está en la base), el reporte sigue sin él y lo avisa
        A.configurarDimensiones('V3', { F1: ['Z1', 'Z2'] });
        avisos.length = 0;
        const reporte = A.generarReporteCompleto('V1', 'V3', C, 'estudiantes', 'Lima');
        assert.ok(reporte.discusion && reporte.pruebaHipotesis); assert.ok(!('analisisPorDimensiones' in reporte));
        assert.equal(avisos.filter(a => a.startsWith('No se pudo realizar análisis por dimensiones:')).length, 1, avisos.join(' | '));
        assert.ok('analisisPorDimensiones' in A.generarReporteCompleto('V1', 'V2', C, 'estudiantes', 'Lima'));
        // una base nueva borra las dimensiones (sus ítems podrían no existir en ella)
        A.cargarDatos(filas.slice(0, 30));
        assert.deepEqual(A.obtenerTodasDimensiones(), {}); assert.equal(A.obtenerDimensiones('V1'), null);
    } finally { console.warn = warn; }
});

test('la tarjeta de fiabilidad: el α sin cada ítem y el α con el ítem inverso recodificado, con el α del núcleo único', async () => {
    const { Fiabilidad } = await import('../../src/analizador/fiabilidad.js');
    const { nor } = generador(4321), items = ['RC1', 'RC2', 'RC3', 'RC4', 'RC5'];
    const filas = Array.from({ length: 120 }, () => { const z = nor(), f = /** @type {Record<string, number>} */ ({}); for (const it of items) f[it] = Math.max(1, Math.min(5, Math.round(3 + 0.9 * z + 0.8 * nor()))); return f; });
    /** @param {number[][]} cols */
    const alfaDe = cols => alfaCronbach(cols.map(c => varianza(c)), varianza(filas.map((_, i) => cols.reduce((s, c) => s + /** @type {number} */ (c[i]), 0))));
    /** @param {Record<string, number>[]} datos @param {string} it */
    const col = (datos, it) => datos.map(f => /** @type {number} */ (f[it]));
    const escala = Fiabilidad.analizarTodo(filas).validos.find((/** @type {any} */ r) => r.k === 5);
    assert.ok(escala, 'la tarjeta detecta la escala RC');
    escala.items.forEach((/** @type {any} */ info, /** @type {number} */ j) => cerca(info.alfaSinItem, alfaDe(items.filter((_, q) => q !== j).map(it => col(filas, it))), 1e-12, `α sin ${info.item}`));
    // RC1 invertido: la tarjeta lo señala y la recodificación (máximo + mínimo − x) devuelve el α de la escala sin invertir
    const invertidas = filas.map(f => ({ ...f, RC1: 6 - /** @type {number} */ (f.RC1) }));
    assert.deepEqual([Math.min(...col(filas, 'RC1')), Math.max(...col(filas, 'RC1'))], [1, 5], 'precondición: RC1 recorre de 1 a 5');
    const inv = Fiabilidad.analizarTodo(invertidas).validos.find((/** @type {any} */ r) => r.k === 5);
    const recodificado = alfaDe(items.map(it => col(filas, it)));
    assert.ok(inv.alfa < recodificado - 0.2, 'el α con RC1 invertido es menor');
    assert.ok(inv.avisos.some((/** @type {string} */ a) => a.includes(`la recodificación elevaría el alfa a ${recodificado.toFixed(3)}`)), inv.avisos.join(' | '));
});

test('la V de Cramér del informe del Simulador es la de la χ² del núcleo: igual a SciPy, sin los perdidos y 0 sin dos categorías', async () => {
    const { GeneradorDatos } = await import('../../src/simulador/dominio/generador.js');
    const G = GeneradorDatos.prototype;
    D.contingencia.forEach((/** @type {number[][]} */ tabla, /** @type {number} */ t) => {
        /** @type {number[]} */ const a = [], b = [];
        tabla.forEach((fila, i) => fila.forEach((k, j) => { for (let q = 0; q < k; q++) { a.push(10 * (i + 1)); b.push(j - 1); } }));
        a.push(NaN, 10); b.push(0, NaN);   // dos casos incompletos: fuera
        const v = G._cramerV(Float64Array.from(a), Float64Array.from(b));
        cerca(v, E.contingencia[t].v, 1e-13, `tabla ${t}: V`);
    });
    assert.equal(G._cramerV(new Float64Array([1, 1, 1]), new Float64Array([1, 2, 1])), 0, 'una sola categoría en la primera');
    assert.equal(G._cramerV(new Float64Array([]), new Float64Array([])), 0, 'sin casos');
    assert.equal(G._cramerV(new Float64Array([1, 2, NaN]), new Float64Array([NaN, NaN, 3])), 0, 'sin casos completos');
    assert.equal(G._cramerV(new Float64Array([1, 1, 2, 2]), new Float64Array([5, 5, 7, 7])), 1, 'asociación perfecta');
});
