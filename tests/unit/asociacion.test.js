// @ts-check
// Pruebas de los tamaños del efecto con intervalo (core/stats/efectos.js y no-centrales.js), la exacta de Fisher y los
// residuos corregidos (exactas.js) y la correlación parcial y semiparcial (correlacion-parcial.js), 2027.01.17, contra el
// oráculo asociacion_oraculo.py (SciPy con otros algoritmos: las no centrales nct, ncf y ncx2; fisher_exact; la enumeración
// de todas las tablas; la inversa de la matriz de covarianzas; la t de la regresión).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { intervaloDDosGrupos, intervaloEta2, omega2, intervaloCramerV, intervaloOddsRatio, correccionHedges } from '../../src/core/stats/efectos.js';
import { fisherExacta, residuosCorregidos } from '../../src/core/stats/exactas.js';
import { correlacionParcial, matrizParciales } from '../../src/core/stats/correlacion-parcial.js';

const O = JSON.parse(fs.readFileSync(new URL('../oracle/asociacion_fixture.json', import.meta.url), 'utf8'));
/** @param {number} x @param {number} ref @param {number} rel @param {string} que */
const cerca = (x, ref, rel, que) => assert.ok(Math.abs(x - ref) <= rel * Math.max(Math.abs(ref), 1e-12), `${que}: ${x} frente a ${ref} (oráculo)`);

test('la d y la g de dos grupos con su intervalo por la t no central (scipy.stats.nct)', () => {
    for (const e of O.efectos.d) {
        const r = intervaloDDosGrupos(e.t, e.n1, e.n2);
        cerca(r.d, e.d, 1e-13, 'd'); cerca(r.inferior, e.inferior, 1e-9, 'd inf'); cerca(r.superior, e.superior, 1e-9, 'd sup');
        cerca(r.g, e.g, 1e-12, 'g'); cerca(r.gInferior, e.gInferior, 1e-9, 'g inf'); cerca(r.gSuperior, e.gSuperior, 1e-9, 'g sup');
    }
    // la J exacta de Hedges frente a su aproximación 1 − 3/(4gl − 1), que con gl grandes coinciden
    assert.ok(Math.abs(correccionHedges(200) - (1 - 3 / 799)) < 1e-6);
});

test('η² (y la parcial) con su intervalo por la F no central (scipy.stats.ncf), y ω²', () => {
    for (const e of O.efectos.eta2) {
        const r = intervaloEta2(e.F, e.gl1, e.gl2);
        cerca(r.inferior, e.inferior, 1e-8, `η² inf F = ${e.F}`); cerca(r.superior, e.superior, 1e-8, `η² sup F = ${e.F}`);
        cerca(omega2(e.F, e.gl1, e.gl2), e.omega2, 1e-14, 'ω²');
    }
    assert.equal(omega2(0.5, 2, 30), 0, 'con F < 1, ω² se informa como 0');
});

test('la V de Cramér con su intervalo por la χ² no central (scipy.stats.ncx2) y la razón de odds de Woolf (con Haldane si hay ceros)', () => {
    for (const e of O.efectos.cramer) {
        const r = intervaloCramerV(e.chi2, e.gl, e.n, e.m);
        cerca(r.V, e.V, 1e-14, 'V'); cerca(r.inferior, e.inferior, 1e-8, `V inf χ² = ${e.chi2}`); cerca(r.superior, e.superior, 1e-8, `V sup χ² = ${e.chi2}`);
    }
    for (const e of O.efectos.or) {
        const [a, b, c, d] = e.tabla, r = intervaloOddsRatio(a, b, c, d);
        cerca(r.or, e.or, 1e-14, 'OR'); cerca(r.inferior, e.inferior, 1e-13, 'OR inf'); cerca(r.superior, e.superior, 1e-13, 'OR sup'); assert.equal(r.corregida, e.corregida);
    }
});

test('Fisher 2 × 2 igual a scipy.stats.fisher_exact (bilateral y las dos colas); r × c igual a enumerar todas las tablas', () => {
    for (const e of O.fisher.dos) {
        const r = fisherExacta(e.tabla);
        assert.equal(r.metodo, 'exacta');
        cerca(r.pValor, e.p, 1e-12, `p ${JSON.stringify(e.tabla)}`);
        assert.ok(r.dosPorDos);
        cerca(r.dosPorDos.pMenor, e.pMenor, 1e-12, 'p menor'); cerca(r.dosPorDos.pMayor, e.pMayor, 1e-12, 'p mayor');
    }
    for (const e of O.fisher.rxc) {
        const r = fisherExacta(e.tabla);
        assert.equal(r.metodo, 'exacta'); assert.equal(r.tablas, e.tablas, 'recorre exactamente las mismas tablas');
        cerca(r.pValor, e.p, 1e-12, `p ${JSON.stringify(e.tabla)}`);
    }
    // con una fila vacía, la quita: el mismo p que sin ella
    assert.equal(fisherExacta([[3, 1, 2], [0, 0, 0], [1, 4, 0], [2, 2, 5]]).pValor, fisherExacta([[3, 1, 2], [1, 4, 0], [2, 2, 5]]).pValor);
});

test('Fisher con demasiadas tablas: Monte Carlo con semilla (repetible), dentro de su error del p de referencia', () => {
    const { tabla, pReferencia } = O.fisher.grande;
    const r = fisherExacta(tabla, { maxTablas: 20000, B: 20000, semilla: 11 });
    assert.equal(r.metodo, 'montecarlo'); assert.equal(r.B, 20000);
    assert.ok(r.ee && Math.abs(r.pValor - pReferencia) < 4 * r.ee + 0.002, `${r.pValor} frente a ${pReferencia} (EE ${r.ee})`);
    assert.equal(fisherExacta(tabla, { maxTablas: 20000, B: 20000, semilla: 11 }).pValor, r.pValor, 'la misma semilla, el mismo p');
});

test('los residuos tipificados corregidos de Haberman', () => {
    for (const e of O.residuos) residuosCorregidos(e.tabla).forEach((f, i) => f.forEach((v, j) => cerca(v, e.residuos[i][j], 1e-12, `residuo ${i},${j}`)));
});

test('la correlación parcial (por la inversa de la covarianza) y las semiparciales (por la t de la regresión), Pearson y Spearman', () => {
    for (const e of O.parciales) {
        const r = correlacionParcial(e.x, e.y, e.Z, { spearman: e.spearman });
        assert.ok(r && r.ic);
        cerca(r.parcial, e.parcial, 1e-11, 'parcial'); cerca(r.t, e.t, 1e-10, 't'); cerca(r.pValor, e.p, 1e-9, 'p');
        cerca(r.ic.inferior, e.ic[0], 1e-11, 'IC inf'); cerca(r.ic.superior, e.ic[1], 1e-11, 'IC sup');
        cerca(r.semiparcialX, e.semiparcialX, 1e-10, 'semiparcial de X'); cerca(r.semiparcialY, e.semiparcialY, 1e-10, 'semiparcial de Y');
        cerca(r.ordenCero, e.ordenCero, 1e-12, 'orden cero');
    }
    const m = matrizParciales(O.matriz.columnas);
    assert.ok(m);
    m.parciales.forEach((f, i) => f.forEach((v, j) => cerca(v, O.matriz.parciales[i][j], 1e-11, `parcial ${i},${j}`)));
    assert.equal(correlacionParcial([1, 2, 3], [2, 1, 3], [[1, 1, 2]]), null, 'sin grados de libertad');
});
