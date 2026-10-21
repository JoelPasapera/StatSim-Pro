// @ts-check
// tests/unit/buscador-terminos.test.js — (2026.12.26) los términos clave de una consulta: una sola implementación
// (src/buscador/fuentes/terminos.js) para Scopus, Web of Science, PubMed, SciELO y ALICIA (y, desde la 2026.12.27,
// ScienceDirect), cada fuente con sus palabras vacías propias. Antes había cuatro copias del mismo algoritmo; un diferencial de 16 088 consultas (las cuatro fuentes)
// dio los mismos términos antes y después de unificarlas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { terminosClave, conPalabrasVacias, PALABRAS_VACIAS } from '../../src/buscador/fuentes/terminos.js';
import { ScopusDirecto } from '../../src/buscador/fuentes/scopus.js';
import { PubMedDirecto } from '../../src/buscador/fuentes/pubmed.js';
import { ScieloDirecto } from '../../src/buscador/fuentes/scielo.js';
import { AliciaDirecto } from '../../src/buscador/fuentes/alicia.js';
import { WebOfScienceDirecto } from '../../src/buscador/fuentes/wos.js';
import { ScienceDirectDirecto } from '../../src/buscador/fuentes/sciencedirect.js';

test('los términos: minúsculas, sin tildes (la ñ queda en n), signos como separadores, sin vacías ni términos de 1–2 letras, sin repetir y en orden', () => {
    assert.deepEqual(terminosClave('¿Existe relación entre la Ansiedad, el ESTRÉS y la ansiedad en niños (2020–2023)?'),
        ['existe', 'relacion', 'ansiedad', 'estres', 'ninos', '2020', '2023']);
    assert.deepEqual(terminosClave('self-esteem; well-being / IA y TDAH'), ['self', 'esteem', 'well', 'being', 'tdah']);
    assert.deepEqual(terminosClave('the of and or between with'), []);
    assert.deepEqual(terminosClave(null), ['null'], 'como String(consulta)');
    assert.deepEqual(terminosClave(''), []);
});

test('cada fuente: las vacías comunes más las suyas (ALICIA: «que», «como»; SciELO: portugués; Web of Science y ScienceDirect: sus operadores)', () => {
    const q = 'ansiedad como que uma dos not near same docentes';
    assert.deepEqual(ScopusDirecto._terminosClave(q), ['ansiedad', 'como', 'que', 'uma', 'dos', 'not', 'near', 'same', 'docentes']);
    assert.deepEqual(PubMedDirecto._terminosClave(q), ScopusDirecto._terminosClave(q));
    assert.deepEqual(AliciaDirecto._terminosClave(q), ['ansiedad', 'uma', 'dos', 'not', 'near', 'same', 'docentes']);
    assert.deepEqual(ScieloDirecto._terminosClave(q), ['ansiedad', 'como', 'not', 'near', 'same', 'docentes']);
    assert.deepEqual(WebOfScienceDirecto.terminos(q), ['ansiedad', 'como', 'que', 'uma', 'dos', 'docentes']);
    assert.deepEqual(ScienceDirectDirecto.terminos(q), ['ansiedad', 'como', 'que', 'uma', 'dos', 'near', 'same', 'docentes'], '(2026.12.27) ScienceDirect: sin «not»');
    assert.equal(ScopusDirecto._VACIAS, PALABRAS_VACIAS); assert.equal(PubMedDirecto._VACIAS, PALABRAS_VACIAS);
    const propias = conPalabrasVacias(['zeta']);
    assert.ok(propias.has('zeta') && propias.has('between') && !PALABRAS_VACIAS.has('zeta'), 'las propias no tocan las comunes');
});

test('una sola implementación: la cadena de normalización de los términos solo está en fuentes/terminos.js', () => {
    const dir = new URL('../../src/buscador/', import.meta.url);
    /** @param {URL} d @returns {string[]} */
    const archivos = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? archivos(new URL(e.name + '/', d)) : e.name.endsWith('.js') ? [new URL(e.name, d).pathname] : []));
    const con = archivos(dir).filter(f => fs.readFileSync(f, 'utf8').includes('[^a-z0-9ñ\\s]'));
    assert.deepEqual(con.map(f => f.slice(f.indexOf('/src/') + 1)), ['src/buscador/fuentes/terminos.js']);
});
