// texto-es.test.js — (2027.01.20) la conjunción copulativa ante /i/: «e» ante «i», «hi» e «í» (también en mayúsculas: «e
// Índice», «e IMC»), «y» ante el diptongo «hie» («y hielo») y ante el resto; y las listas que la usan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conjuncionY, listaY } from '../../src/shared/texto-es.js';

test('«e» ante /i/ (con tilde, con hache y en mayúsculas); «y» ante «hie» y ante el resto', () => {
    for (const s of ['Intervención', 'intervención', 'Índice de masa corporal', 'ítem 3', 'IMC', 'Historia', 'hijos', '  Ira']) assert.equal(conjuncionY(s), 'e', s);
    for (const s of ['hielo', 'Hierro', 'Hiena', 'Yeso', 'Edad', 'Ansiedad', 'humor', '', '7']) assert.equal(conjuncionY(s), 'y', s);
});

test('las listas, con la conjunción del último elemento', () => {
    assert.equal(listaY(['Control', 'Intervención']), 'Control e Intervención');
    assert.equal(listaY(['A', 'B', 'Índice']), 'A, B e Índice');
    assert.equal(listaY(['A', 'Hierro']), 'A y Hierro');
    assert.equal(listaY(['A']), 'A');
    assert.equal(listaY([]), '');
});

test('las redacciones con nombres de variables usan la conjunción (no « y Intervención»)', async () => {
    const fs = await import('node:fs');
    const archivos = ['src/analizador/interpretaciones.js', 'src/analizador/ui/resultados.js', 'src/analizador/exportador-word.js', 'src/analizador/regresion.js',
        'src/analizador/relaciones/diagnostico-forma-redaccion.js', 'src/analizador/relaciones/mediacion-redaccion.js', 'src/analizador/relacionadas/redaccion.js'];
    for (const a of archivos) {
        const s = fs.readFileSync(new URL(`../../${a}`, import.meta.url), 'utf8');
        assert.doesNotMatch(s, / y \$\{(var2|et2|ny|esc\(ny\)|ctx\.y|fct|uno|MM\.etY|R\.etY)\}/, `${a}: « y \${nombre}» sin conjuncionY`);
    }
});
