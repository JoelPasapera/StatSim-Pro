// @ts-check
// tests/unit/depuracion.test.js — (2027.01.18) la depuración de una base (analizador/depuracion/): los casos que marca
// cada criterio, contra el oráculo independiente en NumPy y SciPy (tests/oracle/depuracion_oraculo.py: tuplas, groupby,
// np.linalg.solve y chi2.sf), con una base sembrada con cada problema; y lo que se escribe de ella: lo que no se revisó y por
// qué, el párrafo APA sin huecos, la base depurada (sin los excluidos y con los fuera de rango como perdidos) y los CSV.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { revisarCasos, cadenaMasLarga, mahalanobis, UMBRALES } from '../../src/analizador/depuracion/deteccion-casos.js';
import { tablaResumen, tablaCasos, redactarDepuracion, referenciasDepuracion, filasExcluidas, baseDepurada, csvBase, csvCasos, noRevisado, ORDEN_MOTIVOS } from '../../src/analizador/depuracion/depuracion-redaccion.js';

const O = JSON.parse(fs.readFileSync(new URL('../oracle/depuracion_fixture.json', import.meta.url), 'utf8'));
const R = revisarCasos(O.filas, O.opciones);
/** @type {import('../../src/analizador/depuracion/depuracion-redaccion.js').ContextoDepuracion} */
const ctx = { variables: 'los ítems de la escala', k: O.opciones.items.length, minimo: 1, maximo: 5, enteros: true, id: 'ID', excluir: ['duplicado', 'perdidos', 'sinVariabilidad'], fueraDeRango: 'perdido', umbrales: { ...UMBRALES } };

test('cada criterio marca los mismos casos que el oráculo', () => {
    assert.equal(R.n, O.filas.length);
    assert.equal(R.longstringUmbral, O.umbralLongstring);
    for (const m of ORDEN_MOTIVOS) {
        const marcados = R.casos.filter(c => c.motivos.some(x => x.motivo === m)).map(c => c.fila);
        assert.deepEqual(marcados, O.marcas[m], m);
        assert.equal(R.resumen[m], O.marcas[m].length, `resumen de ${m}`);
    }
    assert.deepEqual(R.casos.map(c => c.fila), O.casos);
    assert.ok(R.mahalanobisCalculable);
    // el identificador de cada caso es el de su fila
    for (const c of R.casos) assert.equal(c.id, String(O.filas[c.fila - 1].ID));
});

test('la cadena más larga y la distancia de Mahalanobis coinciden con el oráculo', () => {
    const items = O.opciones.items;
    O.filas.forEach((/** @type {Record<string, unknown>} */ f, /** @type {number} */ i) => {
        assert.equal(cadenaMasLarga(items.map((/** @type {string} */ c) => (f[c] === '' ? NaN : Number(f[c])))), O.longstrings[i], `fila ${i + 1}`);
    });
    const X = O.completos.map((/** @type {number} */ fila) => items.map((/** @type {string} */ c) => Number(O.filas[fila - 1][c])));
    const r = mahalanobis(X);
    assert.ok(r);
    r.d2.forEach((d, a) => assert.ok(Math.abs(d - O.d2[a]) <= 1e-9 * Math.max(1, O.d2[a]), `D² del caso ${O.completos[a]}: ${d} frente a ${O.d2[a]}`));
    r.p.forEach((p, a) => assert.ok(Math.abs(p - O.p[a]) <= 1e-9 + 1e-7 * O.p[a], `p del caso ${O.completos[a]}`));
    // los perdidos cortan la cadena
    assert.equal(cadenaMasLarga([3, 3, NaN, 3, 3, 3]), 3);
    assert.equal(cadenaMasLarga([]), 0);
    // una variable que es la suma de otras: la covarianza es singular y Mahalanobis no se calcula
    assert.equal(mahalanobis([[1, 2, 3], [2, 1, 3], [3, 5, 8], [4, 4, 8], [5, 2, 7]]), null);
});

test('la redacción dice qué se buscó, qué se halló y qué se excluyó, sin huecos', () => {
    const p = redactarDepuracion(R, ctx);
    assert.match(p, /^Antes de los análisis se depuró la base \(N = 150\) revisando 10 variables: los ítems de la escala\. Se buscaron casos duplicados \(filas idénticas en todas las columnas, salvo ID\), identificadores repetidos, valores fuera de la escala de respuesta \(1–5\) y casos con más del 20 % de las respuestas en blanco\. Las respuestas descuidadas \(Curran, 2016\) se identificaron por cadenas de 6 o más/);
    assert.match(p, /longstring; Johnson, 2005\)/);
    assert.match(p, /y los multivariados, por la distancia de Mahalanobis con p < \.001 \(Tabachnick y Fidell, 2019\); su tratamiento se fijó antes de analizar los datos \(Leys et al\., 2019\)\./);
    assert.match(p, /\(por duplicados, demasiadas respuestas en blanco y la misma respuesta en todo\) y los demás casos señalados se revisaron y se conservaron, con lo que/);
    assert.match(p, /Los valores fuera de rango se trataron como perdidos\./);
    const fuera = filasExcluidas(R, ctx);
    assert.deepEqual([...fuera].sort((a, b) => a - b), [...new Set([...O.marcas.duplicado, ...O.marcas.perdidos, ...O.marcas.sinVariabilidad])].sort((a, b) => a - b));
    assert.match(p, new RegExp(`la muestra final quedó en N = ${150 - fuera.size}\\.$`));
    assert.doesNotMatch(p + JSON.stringify(tablaResumen(R, ctx)) + JSON.stringify(tablaCasos(R, ctx)), /undefined|NaN|null|\[object/);
    assert.equal(referenciasDepuracion(R, ctx).length, 5);
    // la tabla: una fila por criterio, con su tratamiento
    const t = tablaResumen(R, ctx);
    assert.equal(t.filas.length, ORDEN_MOTIVOS.length);
    assert.deepEqual(t.filas.map(f => f[4]), ['Caso excluido', 'Revisado y conservado', 'Valores convertidos en perdidos', 'Caso excluido', 'Revisado y conservado', 'Caso excluido', 'Revisado y conservado', 'Revisado y conservado']);
});

test('lo que no se revisa se dice, y una base limpia se redacta como tal', () => {
    const filas = Array.from({ length: 30 }, (_, i) => ({ A: (i * 7) % 11, B: (i * 5) % 13, C: (i * 3) % 7 + i / 10 }));
    const r = revisarCasos(filas, { items: ['A', 'B', 'C'] });
    /** @type {typeof ctx} */
    const c = { ...ctx, variables: 'A, B y C', k: 3, minimo: null, maximo: null, id: null, fueraDeRango: 'nada' };
    assert.equal(noRevisado('idRepetido', r, c), 'sin columna de identificador');
    assert.equal(noRevisado('fueraDeRango', r, c), 'sin escala de respuesta indicada');
    assert.match(String(noRevisado('longstring', r, c)), /6 o más ítems/);
    assert.equal(noRevisado('atipicoMultivariado', r, c), null);
    assert.equal(r.casos.length, 0);
    const p = redactarDepuracion(r, c);
    assert.match(p, /Se buscaron casos duplicados \(filas idénticas en todas las columnas\) y casos con más del 20 % de las respuestas en blanco\. Los atípicos univariados se definieron como \|z\| > 3\.29, y los multivariados/);
    assert.doesNotMatch(p, /Curran|longstring/);
    assert.match(p, /No se identificó ningún caso con estas señales, por lo que se analizaron los 30 casos\.$/);
    assert.equal(tablaResumen(r, c).filas[1][4], 'No revisado: sin columna de identificador');
    assert.equal(referenciasDepuracion(r, c).length, 2);
});

test('la base depurada: sin los excluidos, los fuera de rango como perdidos y las filas originales intactas', () => {
    const items = O.opciones.items, copia = JSON.stringify(O.filas);
    const base = baseDepurada(O.filas, items, R, ctx);
    const fuera = filasExcluidas(R, ctx);
    assert.equal(base.length, O.filas.length - fuera.size);
    assert.equal(JSON.stringify(O.filas), copia, 'no toca las originales');
    for (const f of base) for (const c of items) { const v = /** @type {number | ''} */ (f[c]); if (v !== '') assert.ok(Number.isInteger(v) && v >= 1 && v <= 5, `${f.ID} ${c} = ${v}`); }
    const sinTocar = baseDepurada(O.filas, items, R, { ...ctx, fueraDeRango: 'nada' });
    assert.ok(sinTocar.some(f => f.P3 === 7), 'con «dejarlos», el 7 sigue');
    const excluyendo = baseDepurada(O.filas, items, R, { ...ctx, fueraDeRango: 'excluir' });
    assert.equal(excluyendo.length, O.filas.length - new Set([...fuera, ...O.marcas.fueraDeRango]).size);
    // los CSV: punto y coma, coma decimal, campos con el delimitador entre comillas y sin fórmulas
    const csv = csvBase([{ a: 1.5, b: 'x;y', c: '', d: '=1+1', e: 2 }]);
    assert.equal(csv, 'a;b;c;d;e\r\n1,5;"x;y";;\'=1+1;2\r\n');
    const casos = csvCasos(R, ctx).split('\r\n');
    assert.equal(casos.length, R.casos.length + 2);
    assert.match(String(casos[0]), /^Fila;ID;Caso duplicado;/);
});

test('una variable que no usa la escala de respuesta (la edad) no se revisa en el rango, y se dice', () => {
    const nombres = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
    /** @type {Record<string, unknown>[]} */
    // (2027.01.20) unas edades que se repiten, como las de verdad (de 18 a 40); la de cada fila, distinta de la de las que
    // responden igual (con 18 + i, todas distintas y seguidas, la edad sería un número de fila y esas filas, duplicadas)
    const filas = Array.from({ length: 40 }, (_, i) => ({ ...Object.fromEntries(nombres.map((c, j) => [c, 1 + ((i + j) % 5)])), Edad: 18 + (i * 7) % 23 }));
    filas[3] = { ...filas[3], P2: 9 };
    const r = revisarCasos(filas, { items: [...nombres, 'Edad'], minimo: 1, maximo: 5, enteros: true });
    assert.deepEqual(r.fueraDeEscala, ['Edad']);
    assert.deepEqual(r.casos.filter(c => c.motivos.some(m => m.motivo === 'fueraDeRango')).map(c => c.fila), [4], 'solo el 9 de P2');
    /** @type {typeof ctx} */
    const c = { ...ctx, k: 7, id: null, variables: 'los ítems y la edad' };
    assert.match(redactarDepuracion(r, c), /valores fuera de la escala de respuesta \(1–5; salvo en Edad, que usa otra escala\)/);
    assert.match(tablaResumen(r, c).nota, /Sin revisar en el rango \(más de la mitad de sus valores fuera de 1–5: no usan esa escala\): Edad\./);
    const base = baseDepurada(filas, [...nombres, 'Edad'], r, c);
    assert.equal(base[3]?.P2, '', 'el 9, como perdido'); assert.equal(base[10]?.Edad, 19, 'la edad, intacta');
});

test('(2027.01.20) los duplicados: se quitan de la comparación la marca temporal y el número de fila, no una medida continua ni una fecha sin hora', async () => {
    const { columnasDeDuplicados } = await import('../../src/analizador/depuracion/deteccion-casos.js');
    // 30 personas; la 31 es la 7 enviada otra vez (otra hora y otro número de fila); la 12 y la 13 responden igual, pero pesan distinto
    const filas = Array.from({ length: 30 }, (_, i) => ({
        Nro: i + 1, Marca: `2026/10/01 10:${String(i).padStart(2, '0')}:13 a. m. GMT-5`, Nacimiento: `20${String(10 + (i % 9)).padStart(2, '0')}-0${1 + (i % 9)}-1${i % 10}`,
        Peso: 50 + i * 0.37, P1: 1 + (i % 5), P2: 1 + ((i * 3) % 5), P3: 1 + ((i * 2) % 5)
    }));
    filas[12] = { ...filas[12], P1: filas[11].P1, P2: filas[11].P2, P3: filas[11].P3 };
    filas.push({ ...filas[6], Nro: 31, Marca: '2026/10/01 11:59:02 a. m. GMT-5' });
    const D = columnasDeDuplicados(filas, null);
    assert.deepEqual(D.delEnvio, ['Nro', 'Marca'], 'la marca temporal (con su hora) y el número de fila');
    for (const c of ['Nacimiento', 'Peso', 'P1']) assert.ok(D.columnas.includes(c), `${c} se compara`);
    const r = revisarCasos(filas, { items: ['P1', 'P2', 'P3'] });
    const duplicados = r.casos.filter(c => c.motivos.some(m => m.motivo === 'duplicado')).map(c => c.fila);
    assert.deepEqual(duplicados, [31], 'el envío repetido, no las dos personas que responden igual con distinto peso');
    // un número de fila con huecos o desordenado no es un número de fila: se compara
    assert.ok(columnasDeDuplicados(filas.map((f, i) => ({ ...f, Nro: i % 2 ? i * 3 : i })), null).columnas.includes('Nro'));
});
