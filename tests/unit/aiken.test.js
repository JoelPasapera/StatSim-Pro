// tests/unit/aiken.test.js — V de Aiken: núcleo contra el oráculo de SciPy (tests/oracle/aiken_fixture.json), valores
// exactos conocidos, decisiones en los bordes, validación, lectura de tablas y redacción APA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cuantilNormal } from '../../src/analizador/psicometria/numerico.js';
import { vAiken, intervaloScore, pExactaAiken, decidir, validarEntrada, analizarValidezContenido } from '../../src/analizador/psicometria/aiken.js';
import { parsearMatriz } from '../../src/analizador/psicometria/aiken-entrada.js';
import { redactarParrafo, referencias, documentoWord, csvResultados } from '../../src/analizador/psicometria/aiken-redaccion.js';
import { EJEMPLO_AIKEN } from '../../src/analizador/psicometria/aiken-ejemplo.js';

const fx = JSON.parse(fs.readFileSync(new URL('../oracle/aiken_fixture.json', import.meta.url), 'utf8'));
const cerca = (a, b, tol, que) => assert.ok(Math.abs(a - b) <= tol, `${que}: ${a} vs ${b}`);

test('cuantil de la normal (AS241) igual a SciPy en todo el rango', () => {
    fx.cuantiles.forEach(({ p, z }) => cerca(cuantilNormal(p), z, 1e-12 * Math.max(1, Math.abs(z)), `Φ⁻¹(${p})`));
    assert.equal(cuantilNormal(0), -Infinity); assert.equal(cuantilNormal(1), Infinity); assert.ok(Number.isNaN(cuantilNormal(1.2)));
});

test('V, intervalo score y p exacta coinciden con el oráculo (28 casos, 19 validados por enumeración)', () => {
    fx.casos.forEach((c, i) => {
        const b = vAiken(c.valoraciones, c.minimo, c.maximo);
        assert.equal(b.n, c.n, `caso ${i}: n`); assert.equal(b.S, c.S, `caso ${i}: S`); cerca(b.V, c.V, 1e-14, `caso ${i}: V`);
        const ic = intervaloScore(b.V, b.n, c.maximo - c.minimo, c.confianza);
        cerca(ic.inferior, c.inferior, 1e-12, `caso ${i}: límite inferior`); cerca(ic.superior, c.superior, 1e-12, `caso ${i}: límite superior`);
        cerca(pExactaAiken(b.S, b.n, c.maximo - c.minimo), c.p, 1e-12 + 1e-10 * c.p, `caso ${i}: p`);
    });
});

test('probabilidades exactas de las tablas de Aiken (1985)', () => {
    assert.equal(pExactaAiken(5, 5, 1), 1 / 32);            // 5 jueces sí/no, todos de acuerdo
    assert.equal(pExactaAiken(8, 10, 1), 56 / 1024);        // 10 jueces, 8 de acuerdo
    assert.equal(pExactaAiken(15, 5, 3), 1 / 1024);         // escala 1–4, 5 jueces con 4
    assert.equal(pExactaAiken(0, 5, 3), 1);
    cerca(pExactaAiken(120, 30, 4) / Math.pow(5, -30), 1, 1e-12, 'cola extrema (p ≈ 1e-21) sin perder precisión relativa');
});

test('decisión por el límite inferior en los bordes', () => {
    assert.equal(decidir(0.93, 0.70, 0.70), 'valido');
    assert.equal(decidir(0.87, 0.6999, 0.70), 'revisar');
    assert.equal(decidir(0.70, 0.45, 0.70), 'revisar');
    assert.equal(decidir(0.6999, 0.45, 0.70), 'no_valido');
    const ic = intervaloScore(1, 5, 3, 0.95);   // V = 1: el límite superior es 1 y el inferior nk/(nk+z²)
    cerca(ic.inferior, 15 / (15 + 1.959963984540054 ** 2), 1e-12, 'límite inferior con V = 1'); assert.equal(ic.superior, 1);
});

test('validación: escala, enteros, rango, ítems sin valorar y criterios desiguales', () => {
    assert.match(validarEntrada({ minimo: 4, maximo: 1, criterios: [{ nombre: 'A', valoraciones: [[1]] }] })[0], /mayor que el mínimo/);
    const e = validarEntrada({ minimo: 1, maximo: 4, criterios: [{ nombre: 'A', valoraciones: [[4, 3.5, 5], [null, null, null]] }, { nombre: 'B', valoraciones: [[4, 4, 4]] }] });
    assert.ok(e.some(x => /3.5.*no es una valoración entera/.test(x)) && e.some(x => /5 está fuera de la escala 1–4/.test(x)));
    assert.ok(e.some(x => /ítem 2: ningún juez lo valoró/.test(x)) && e.some(x => /«B» tiene 1 ítems/.test(x)));
});

test('lectura de tablas: Excel (tabulador), CSV español, sin encabezado, espacios, faltantes y errores con ubicación', () => {
    const a = parsearMatriz('Ítem\tJ1\tJ2\tJ3\nClaridad del ítem 1\t4\t4\t3\nÍtem 2\t3\t\t4\n');
    assert.deepEqual([a.etiquetas, a.jueces, a.valoraciones, a.errores], [['Claridad del ítem 1', 'Ítem 2'], ['J1', 'J2', 'J3'], [[4, 4, 3], [3, null, 4]], []]);
    const b = parsearMatriz('4;4;3;4\r\n3;4;4;4\r\n');
    assert.deepEqual([b.etiquetas, b.jueces.length, b.valoraciones], [['Ítem 1', 'Ítem 2'], 4, [[4, 4, 3, 4], [3, 4, 4, 4]]]);
    const c = parsearMatriz('4 4 3\n3 4 4');
    assert.deepEqual(c.valoraciones, [[4, 4, 3], [3, 4, 4]]);
    const d = parsearMatriz('"Ítem 1";"4";"x"\n"Ítem 2";"3";"4"');
    assert.equal(d.errores.length, 1); assert.match(d.errores[0], /Fila 1, columna 3 .*«x» no es un número/);
    const e = parsearMatriz('Ítem 1\t4\t4\t4\nÍtem 2\t4');
    assert.deepEqual(e.valoraciones[1], [4, null, null]); assert.match(e.avisos[0], /menos columnas que jueces/);
});

test('ejemplo completo: decisiones esperadas, párrafo, referencias, Word y CSV', () => {
    const criterios = EJEMPLO_AIKEN.criterios.map(c => { const m = parsearMatriz(c.texto); return { nombre: c.nombre, jueces: m.jueces, valoraciones: m.valoraciones, etiquetas: m.etiquetas }; });
    const r = analizarValidezContenido({ minimo: 1, maximo: 4, confianza: 0.95, v0: 0.70, items: criterios[0].etiquetas, criterios });
    assert.ok(r.ok, r.errores && r.errores.join(' '));
    const dec = c => c.items.map(x => x.decision[0]).join('');   // v = válido, r = revisar, n = no válido
    assert.deepEqual(r.criterios.map(dec), ['vvrnvvvvvv', 'vvrnvvvvvv', 'vvrnvrvvvv']);
    assert.deepEqual([r.resumen.validos, r.resumen.revisar, r.resumen.noValidos], [7, 2, 1]);
    const par = redactarParrafo(r);
    for (const trozo of ['juicio de 5 expertos', 'pertinencia, relevancia y claridad de los 10 ítems en una escala de 1 a 4', 'al 95 % por el método score (Penfield y Giacobbi, 2004)', 'V₀ = .70 (Charter, 2003; Merino-Soto y Livia, 2009)', 'requieren revisión (ítems 3 y 6)', 'revisar los ítems 3 y 6', 'retirar el ítem 4.'])
        assert.ok(par.includes(trozo), `falta «${trozo}» en: ${par}`);
    const refs = referencias(0.70);
    assert.equal(refs.length, 5); assert.ok(refs[0].startsWith('Aiken, L. R. (1980)') && refs.some(x => x.startsWith('Charter')) && !refs.some(x => x.startsWith('Cicchetti')));
    assert.ok(referencias(0.50).some(x => x.startsWith('Cicchetti')));
    const doc = documentoWord(r);
    assert.ok(doc.includes('Tabla 4') && !doc.includes('Tabla 5') && doc.includes('Resumen de la validez de contenido por ítem') && doc.includes('Referencias'));
    const csv = csvResultados(r).split('\r\n');
    assert.equal(csv.length, 31); assert.match(csv[3], /^Pertinencia;Ítem 3;5;3,6000;0,8667;0,6212;0,9626;2,0508e-2;Revisar$/);
});

test('revisión: comillas, numeración de ítems, singulares, CSV seguro y configuración inválida', () => {
    const a = parsearMatriz('N°;Juez 1;Juez 2\n"Me siento; a veces, triste";4;3\n"Otro ""ítem""";4;4');
    assert.deepEqual([a.etiquetas, a.valoraciones, a.errores], [['Me siento; a veces, triste', 'Otro "ítem"'], [[4, 3], [4, 4]], []]);
    const b = parsearMatriz('Ítem\tJ1\tJ2\n1\t4\t4\n2\t3\t4\n3\t4\t2');
    assert.deepEqual([b.etiquetas, b.jueces, b.valoraciones[2]], [['Ítem 1', 'Ítem 2', 'Ítem 3'], ['J1', 'J2'], [4, 2]], 'la columna 1, 2, 3 identifica ítems, no es un juez');
    const uno = analizarValidezContenido({ minimo: 1, maximo: 4, confianza: 0.95, v0: 0.70, items: ['Ítem 1'], criterios: [{ nombre: 'Claridad', valoraciones: [[4]] }] });
    const p1 = redactarParrafo(uno);
    assert.ok(p1.includes('juicio de 1 experto, quien valoró la claridad del único ítem') && p1.includes('En claridad, V = 1.00'), p1);
    const raro = analizarValidezContenido({ minimo: 1, maximo: 4, confianza: 0.95, v0: 0.70, items: ['=SUMA(A1)'], criterios: [{ nombre: '+Claridad', valoraciones: [[4, 4, 4]] }] });
    assert.match(csvResultados(raro).split('\r\n')[1], /^'\+Claridad;'=SUMA\(A1\);/);
    assert.ok(redactarParrafo(raro).includes('juicio de 3 expertos'));
    const mal = analizarValidezContenido({ minimo: 1, maximo: 4, confianza: NaN, v0: 1.5, criterios: [{ nombre: 'A', valoraciones: [[4, 4]] }] });
    assert.ok(!mal.ok && mal.errores.some(e => /nivel de confianza/.test(e)) && mal.errores.some(e => /V₀ debe estar entre 0 y 1/.test(e)));
});
