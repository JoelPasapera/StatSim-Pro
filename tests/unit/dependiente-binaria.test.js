// @ts-check
// tests/unit/dependiente-binaria.test.js — (2027.01.01) una variable de dos categorías con nombre como dependiente de la
// regresión logística (analizador/motor/dependiente-binaria.js): qué categoría es el evento (el 1), cuándo no hay
// codificación (numérica, una o tres categorías) y cómo se leen los perdidos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codificacionBinaria } from '../../src/analizador/motor/dependiente-binaria.js';

/** El evento y la referencia de una lista de valores. @param {unknown[]} valores */
const pareja = valores => { const c = codificacionBinaria(valores); return c && [c.evento, c.referencia]; };

test('el evento es la categoría que va después en orden alfabético', () => {
    assert.deepEqual(pareja(['Mujer', 'Hombre', 'Mujer']), ['Mujer', 'Hombre']);
    assert.deepEqual(pareja(['Aprobado', 'Desaprobado']), ['Desaprobado', 'Aprobado']);
    assert.deepEqual(pareja(['Pública', 'Privada']), ['Pública', 'Privada']);
    assert.deepEqual(pareja(['Negativo', 'Positivo']), ['Positivo', 'Negativo'], 'la negativa va antes: no hay que cambiar nada');
    assert.deepEqual(pareja(['Falso', 'Verdadero']), ['Verdadero', 'Falso']);
});

test('salvo que esa sea la negativa de la pareja: «No / Sí», «Riesgo / Sin riesgo», «Ausente / Presente»', () => {
    assert.deepEqual(pareja(['Sí', 'No', 'No']), ['Sí', 'No']);
    assert.deepEqual(pareja(['No', 'Sí']), ['Sí', 'No'], 'el orden de aparición no importa');
    assert.deepEqual(pareja(['Sin riesgo', 'Riesgo']), ['Riesgo', 'Sin riesgo'], 'alfabéticamente iría «Sin riesgo»');
    assert.deepEqual(pareja(['Ausente', 'Presente']), ['Presente', 'Ausente']);
    assert.deepEqual(pareja(['Ninguno', 'Alguno']), ['Alguno', 'Ninguno']);
    assert.deepEqual(pareja(['NUNCA', 'A veces']), ['A veces', 'NUNCA'], 'sin mayúsculas');
    assert.deepEqual(pareja(['Ningún hijo', 'Con hijos']), ['Con hijos', 'Ningún hijo'], 'sin tildes');
    assert.deepEqual(pareja(['No', 'Nunca']), ['Nunca', 'No'], 'las dos niegan: el orden alfabético');
    assert.deepEqual(pareja(['Nota alta', 'Nota baja']), ['Nota baja', 'Nota alta'], '«Nota» no es «No»');
});

test('el código: 1 el evento, 0 la referencia y NaN lo demás (los perdidos y una categoría ajena)', () => {
    const c = /** @type {NonNullable<ReturnType<typeof codificacionBinaria>>} */ (codificacionBinaria(['No', ' Sí ', '', null, NaN, 'Sí']));
    assert.equal(c.evento, 'Sí', 'con los espacios quitados');
    assert.deepEqual(['Sí', ' No', 'No ', '', null, undefined, NaN, 'Tal vez'].map(c.codigo), [1, 0, 0, NaN, NaN, NaN, NaN, NaN]);
});

test('sin codificación: una variable numérica (la regresión la usa tal cual), una sola categoría o más de dos', () => {
    assert.equal(codificacionBinaria([0, 1, 1, 0]), null);
    assert.equal(codificacionBinaria(['0', '1', '1']), null, 'números escritos como texto');
    assert.equal(codificacionBinaria(['No', 'Sí', '2']), null, 'una sola celda numérica basta');
    assert.equal(codificacionBinaria(['Sí', 'Sí', '']), null);
    assert.equal(codificacionBinaria(['Bajo', 'Medio', 'Alto']), null);
    assert.equal(codificacionBinaria([]), null);
});
