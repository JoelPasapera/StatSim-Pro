// @ts-check
// Pruebas de los baremos (core/stats/baremos.js, 2027.01.18) contra el oráculo baremos_oraculo.py: el percentil por
// el punto medio (scipy.stats.percentileofscore, «mean»), la z y la T normalizadas, los eneatipos (cortes de Canfield), los
// decatipos, la z típica y los puntos de corte de las categorías por percentiles (numpy.quantile).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tablaBaremos, categoriasPorPercentiles, eneatipo, decatipo } from '../../src/core/stats/baremos.js';

const { muestras: M, esperado: E } = JSON.parse(fs.readFileSync(new URL('../oracle/baremos_fixture.json', import.meta.url), 'utf8'));
/** @param {number} x @param {number} ref @param {number} rel @param {string} que */
const cerca = (x, ref, rel, que) => assert.ok(Math.abs(x - ref) <= rel * Math.max(Math.abs(ref), 1e-12), `${que}: ${x} frente a ${ref} (oráculo)`);

test('la tabla de baremos: percentil, z y T normalizadas, eneatipo, decatipo y z típica, iguales al oráculo', () => {
    for (const [clave, v] of Object.entries(M)) {
        const r = tablaBaremos(v), e = E[clave];
        cerca(r.media, e.media, 1e-13, 'media'); cerca(r.de, e.de, 1e-13, 'DE');
        assert.deepEqual(r.filas.map(f => f.pd), e.pd); assert.deepEqual(r.filas.map(f => f.f), e.f);
        r.filas.forEach((f, i) => {
            cerca(f.pc, e.pc[i], 1e-12, `PC ${f.pd}`); cerca(f.z, e.z[i], 1e-11, `z ${f.pd}`); cerca(f.t, 50 + 10 * e.z[i], 1e-11, `T ${f.pd}`);
            cerca(f.zTipica, e.zTipica[i], 1e-11, `z típica ${f.pd}`);
            assert.equal(f.eneatipo, e.eneatipo[i], `eneatipo ${f.pd}`); assert.equal(f.decatipo, e.decatipo[i], `decatipo ${f.pd}`);
        });
        assert.equal(r.filas[r.filas.length - 1]?.fa, v.length, 'la acumulada llega a n');
        const c = categoriasPorPercentiles(v);
        cerca(c[0].hasta, e.cortes[0], 1e-13, 'P25'); cerca(c[2].desde, e.cortes[1], 1e-13, 'P75');
        assert.deepEqual(c.map(x => x.n), e.cuentas, 'cuántos en cada categoría');
    }
});

test('los cortes de eneatipos y decatipos en sus bordes', () => {
    assert.deepEqual([3.99, 4, 10.99, 11, 50, 95.99, 96, 99.9].map(eneatipo), [1, 2, 2, 3, 5, 8, 9, 9]);
    assert.deepEqual([-3, -2, -0.5, -0.25, 0, 0.5, 2, 3].map(decatipo), [1, 2, 5, 5, 6, 7, 10, 10]);
});

test('(2027.01.20) la decisión de los baremos diferenciados: las cuatro situaciones, cada una con su texto', async () => {
    const { redactarBaremos } = await import('../../src/analizador/psicometria/baremos-redaccion.js');
    const valores = Array.from({ length: 80 }, (_, i) => 20 + (i * 7) % 25);
    const base = { general: { tabla: tablaBaremos(valores), categorias: categoriasPorPercentiles(valores) }, grupos: [{ nombre: 'Hombre', tabla: tablaBaremos(valores.slice(0, 50)), categorias: categoriasPorPercentiles(valores.slice(0, 50)) }, { nombre: 'Mujer', tabla: tablaBaremos(valores.slice(50)), categorias: categoriasPorPercentiles(valores.slice(50)) }] };
    const ctx = { escala: 'Ansiedad', grupo: 'Sexo', cortes: [25, 75], excluidos: 0, alfa: 0.05 };
    const comp = (/** @type {object} */ o) => redactarBaremos(/** @type {any} */ ({ ...base, comparacion: { prueba: 't de Student', estadistico: 't(78) = −2.43', pValor: 0.018, efecto: 'd = −0.60', magnitud: 'mediano', significativa: true, difieren: true, diferenciados: true, pequenos: [], ...o } }), ctx);
    assert.match(comp({}), /difirieron según Sexo \(t de Student, t\(78\) = −2\.43, p = \.018; d = −0\.60, efecto mediano\), por lo que se presentan baremos diferenciados para Hombre y Mujer\./);
    const chico = comp({ diferenciados: false, pequenos: ['Mujer'] });
    assert.match(chico, /difirieron según Sexo .*, pero el grupo Mujer tiene menos de 30 personas, demasiado pocas para un baremo propio estable: se presenta el baremo general/);
    assert.doesNotMatch(chico, /no difirieron/, 'antes decía «no difirieron de forma relevante» con una diferencia significativa y mediana');
    assert.match(comp({ diferenciados: false, difieren: false, magnitud: 'trivial', efecto: 'd = 0.08' }), /Aunque las puntuaciones difirieron según Sexo .*, el efecto es trivial, por lo que basta un baremo general\./);
    assert.match(comp({ diferenciados: false, difieren: false, significativa: false, pValor: 0.4 }), /Las puntuaciones no difirieron significativamente según Sexo .*p = \.400.*, por lo que basta un baremo general\./);
});

test('(2027.01.20) con muchas puntuaciones repetidas, los niveles se explican (tamaño no nominal; un nivel vacío no es «0 < PD ≤ 0»)', async () => {
    const { tablaBaremos, categoriasPorPercentiles } = await import('../../src/core/stats/baremos.js');
    const { redactarBaremos, tablaDeCategorias, avisoEmpates } = await import('../../src/analizador/psicometria/baremos-redaccion.js');
    const ctx = { escala: 'la escala', grupo: null, cortes: [25, 75], excluidos: 0, alfa: 0.05 };
    const u = [...Array(80).fill(0), ...Array.from({ length: 20 }, (_, i) => i + 1)], c = categoriasPorPercentiles(u);
    const texto = redactarBaremos(/** @type {any} */ ({ general: { tabla: tablaBaremos(u), categorias: c }, grupos: [], comparacion: null }), ctx);
    assert.doesNotMatch(texto, /0 < PD ≤ 0/);
    assert.match(texto, /medio \(ninguna puntuación; 0\.0 %\)/);
    assert.match(texto, /no tienen el tamaño que dan los percentiles \(25 %, 50 % y 25 %\)[^.]*el nivel medio queda vacío/);
    assert.equal(/** @type {string[]} */ (tablaDeCategorias(c, [25, 75], 'x').filas[1])[1], 'ninguna (los cortes coinciden en 0)');
    // sin empates que pesen, nada
    const v = Array.from({ length: 100 }, (_, i) => i);
    assert.equal(avisoEmpates(categoriasPorPercentiles(v), [25, 75]), '');
});
