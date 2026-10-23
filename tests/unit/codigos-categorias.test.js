// @ts-check
// tests/unit/codigos-categorias.test.js — (2027.01.01, revisión) los códigos de las categorías de una variable («0 = Mujer;
// 1 = Hombre»): de dónde salen (la base del Simulador, la columna «Valores» del Diccionario del libro de Excel), cómo se
// validan al abrir un proyecto y cómo deciden qué categoría de una dependiente binaria es el 1 en la regresión logística (la
// de código mayor, como en SPSS). Hasta la revisión, el evento salía siempre de los nombres (el orden alfabético), aunque la
// variable trajera sus códigos: el Simulador codifica «Mujer, Hombre» como 0 = Mujer, 1 = Hombre, y la regresión modelaba
// «Mujer», contra la etiqueta de la variable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codificacionBinaria } from '../../src/analizador/motor/dependiente-binaria.js';
import { BaseColumnar } from '../../src/core/data/base-columnar.js';
import { codigosDeLaLista } from '../../src/analizador/motor/datos-xlsx.js';
import { codigosValidos, MAXIMO_CODIGOS_CATEGORIAS } from '../../src/analizador/motor/datos-proyecto.js';
import { escribirSav } from '../../src/core/data/sav/escritor.js';
import { leerSav } from '../../src/core/data/sav/lector.js';
import { baseDesdeSav } from '../../src/analizador/motor/datos-spss.js';

/** @param {unknown[]} valores @param {Array<[number, string]> | null} codigos */
const decision = (valores, codigos) => { const c = codificacionBinaria(valores, codigos); return c && [c.evento, c.referencia, c.segun]; };

test('con los códigos de la variable, el evento es la categoría de código mayor', () => {
    assert.deepEqual(decision(['Mujer', 'Hombre', 'Mujer'], [[0, 'Mujer'], [1, 'Hombre']]), ['Hombre', 'Mujer', 'codigos'], 'el Simulador: 0 = Mujer, 1 = Hombre');
    assert.deepEqual(decision(['Mujer', 'Hombre'], null), ['Mujer', 'Hombre', 'nombres'], 'sin códigos (un CSV), el orden alfabético');
    // SPSS codifica a menudo 1 y 2: su regresión logística modela el valor mayor
    assert.deepEqual(decision(['Sí', 'No'], [[1, 'Sí'], [2, 'No']]), ['No', 'Sí', 'codigos'], 'manda el código, aunque el nombre niegue');
    assert.deepEqual(decision(['No', 'Sí'], [[0, 'No'], [1, 'Sí']]), ['Sí', 'No', 'codigos']);
    assert.deepEqual(decision(['Permanece', 'Deserta'], [[-1, 'Deserta'], [3.5, 'Permanece']]), ['Permanece', 'Deserta', 'codigos'], 'negativos y decimales');
    assert.deepEqual(decision(['No', 'Sí'], [[0, 'No'], [1, 'Sí'], [9, 'No sabe']]), ['Sí', 'No', 'codigos'], 'una categoría sin casos no estorba');
    assert.deepEqual(decision(['No', 'Sí'], [[0, ' No '], [1, 'Sí']]), ['Sí', 'No', 'codigos'], 'las etiquetas, sin espacios a los lados');
});

test('si los códigos no deciden, los nombres', () => {
    assert.deepEqual(decision(['No', 'Sí'], [[1, 'Sí']]), ['Sí', 'No', 'nombres'], 'a una categoría le falta su código');
    assert.deepEqual(decision(['No', 'Sí'], [[0, 'No'], [1, 'Sí'], [2, 'No']]), ['Sí', 'No', 'nombres'], 'una etiqueta con dos códigos');
    assert.deepEqual(decision(['No', 'Sí'], [[1, 'No'], [1, 'Sí']]), ['Sí', 'No', 'nombres'], 'el mismo código para las dos');
    assert.deepEqual(decision(['No', 'Sí'], /** @type {any} */ ([['0', 'No'], ['1', 'Sí']])), ['Sí', 'No', 'nombres'], 'códigos que no son números');
    assert.deepEqual(decision(['No', 'Sí'], []), ['Sí', 'No', 'nombres']);
    assert.equal(codificacionBinaria([0, 1, 1], [[0, 'No'], [1, 'Sí']]), null, 'una columna numérica se usa tal cual, con códigos o sin ellos');
});

test('la base del Simulador da los códigos de sus categóricas, ordenados, y no los de las numéricas', () => {
    const base = new BaseColumnar(3);
    for (const [nombre, datos, etiquetas] of /** @type {Array<[string, number[], Record<number, string> | null]>} */ ([
        ['Sexo', [1, 0, 1], { 1: 'Hombre', 0: 'Mujer' }], ['Puntaje', [12, 15, 9], null], ['__proto__', [2, 1, 2], { 2: 'Alta', 1: 'Baja' }]])) {
        base.agregar(nombre).datos.set(datos);
        if (etiquetas) base.etiquetar(nombre, etiquetas);
    }
    const codigos = base.codigosDeCategorias();
    assert.deepEqual(Object.keys(codigos), ['Sexo', '__proto__'], 'una columna llamada «__proto__» es una más');
    assert.deepEqual(codigos.Sexo, [[0, 'Mujer'], [1, 'Hombre']]);
    assert.deepEqual(Object.getOwnPropertyDescriptor(codigos, '__proto__')?.value, [[1, 'Baja'], [2, 'Alta']]);
    assert.equal(Object.getPrototypeOf(codigos), Object.prototype);
});

test('la columna «Valores» del Diccionario del libro de Excel: «0 = Mujer; 1 = Hombre»', () => {
    assert.deepEqual(codigosDeLaLista('0 = Mujer; 1 = Hombre'), [[0, 'Mujer'], [1, 'Hombre']]);
    assert.deepEqual(codigosDeLaLista('1 = Sí; claro; 2 = No'), [[1, 'Sí; claro'], [2, 'No']], 'un «; » que no sigue de un código es de la etiqueta');
    assert.deepEqual(codigosDeLaLista('-1 = Perdido; 0.5 = Medio'), [[-1, 'Perdido'], [0.5, 'Medio']]);
    assert.deepEqual(codigosDeLaLista('1 = 3.º de secundaria; 2 = 4.º de secundaria'), [[1, '3.º de secundaria'], [2, '4.º de secundaria']]);
    assert.deepEqual(codigosDeLaLista('0 = <b>No</b>; 1 = Sí'), [[0, '‹b›No‹/b›'], [1, 'Sí']], 'sin marcado («‹ ›»), como las celdas del libro: la etiqueta sigue siendo la de su categoría');
    for (const t of ['', '   ', 'Mujer, Hombre', '0 - Mujer', 'Mujer = 0']) assert.equal(codigosDeLaLista(t), null, JSON.stringify(t));
    assert.equal(codigosDeLaLista(/** @type {any} */ (null)), null);
});

test('(segunda revisión) en un .sav, una cadena de dos valores lleva el orden de SPSS: el valor mayor es el 1', async () => {
    const b = baseDesdeSav(await leerSav(escribirSav({ variables: [
        { nombre: 'Riesgo', tipo: 'texto', valores: ['1', '2', '2', '1', '2'], etiquetasValor: [['1', 'Sí'], ['2', 'No']] },
        { nombre: 'Estado', tipo: 'texto', valores: ['Riesgo', 'Sin riesgo', 'Riesgo', 'Riesgo', 'Sin riesgo'] },
        { nombre: 'Grupo', tipo: 'texto', valores: ['A', 'B', 'C', 'A', 'B'] },
        { nombre: 'Sexo', valores: [0, 1, 1, 0, 1], etiquetasValor: [[0, 'Mujer'], [1, 'Hombre']] },
    ] }).bytes));
    assert.deepEqual(b.codigosDeCategorias.Riesgo, [[0, 'Sí'], [1, 'No']], 'con etiquetas: «2» (No) es el mayor');
    assert.deepEqual(b.codigosDeCategorias.Estado, [[0, 'Riesgo'], [1, 'Sin riesgo']], 'sin etiquetas: el orden de las cadenas');
    assert.ok(!('Grupo' in b.codigosDeCategorias), 'tres valores: sin códigos (no se usan)');
    assert.deepEqual(b.codigosDeCategorias.Sexo, [[0, 'Mujer'], [1, 'Hombre']], 'las numéricas, como antes');
    // la logística modela lo que SPSS: hasta la revisión, «Sí» (por los nombres) y «Riesgo» (por la negativa)
    const columna = (/** @type {string} */ c) => b.filas.map((/** @type {any} */ f) => f[c]);
    assert.deepEqual(decision(columna('Riesgo'), b.codigosDeCategorias.Riesgo), ['No', 'Sí', 'codigos']);
    assert.deepEqual(decision(columna('Estado'), b.codigosDeCategorias.Estado), ['Sin riesgo', 'Riesgo', 'codigos']);
});

test('al abrir un proyecto, los códigos guardados se validan', () => {
    assert.ok(codigosValidos({ Sexo: [[0, 'Mujer'], [1, 'Hombre']], Grado: [] }));
    assert.ok(codigosValidos({}));
    for (const malo of [null, [], 'Sexo', { Sexo: 'Mujer' }, { Sexo: [[0]] }, { Sexo: [['0', 'Mujer']] }, { Sexo: [[NaN, 'Mujer']] }, { Sexo: [[0, 1]] }, { Sexo: [[0, 'x'.repeat(10001)]] }, { ['x'.repeat(1001)]: [] }]) {
        assert.equal(codigosValidos(malo), false, JSON.stringify(malo).slice(0, 80));
    }
    assert.equal(codigosValidos({ a: Array.from({ length: MAXIMO_CODIGOS_CATEGORIAS + 1 }, (_, i) => [i, 'x']) }), false, 'acotados entre todas las columnas');
});
