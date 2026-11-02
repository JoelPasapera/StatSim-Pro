// @ts-check
// tests/unit/roc.test.js — (2027.01.18) la curva ROC (core/stats/roc.js) contra el oráculo tests/oracle/roc_oraculo.py: el AUC
// (U/(n₁n₀) de scipy), su error típico de DeLong (por la matriz ψ completa, sin rangos), su intervalo, la p de Mann-Whitney,
// cada punto de corte, el óptimo de Youden y los intervalos de Wilson; con empates, con el sentido invertido, con una muestra
// pequeña y con puntuaciones continuas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { curvaROC, intervaloWilson } from '../../src/core/stats/roc.js';

const O = JSON.parse(fs.readFileSync(new URL('../oracle/roc_fixture.json', import.meta.url), 'utf8'));
/** @param {number} x @param {number} ref @param {number} tol @param {string} que */
const cerca = (x, ref, tol, que) => assert.ok(Math.abs(x - ref) <= tol, `${que}: ${x} frente a ${ref}`);

test('el AUC, su error típico de DeLong, su intervalo y la p, como el oráculo', () => {
    for (const [nombre, B] of Object.entries(O)) {
        const R = curvaROC([...B.casos, ...B.noCasos], [...B.casos.map(() => true), ...B.noCasos.map(() => false)]);
        assert.ok(R, nombre);
        assert.equal(R.invertido, B.invertido, `${nombre}: sentido`);
        cerca(R.auc, B.auc, 1e-13, `${nombre}: AUC`); cerca(R.ee, B.ee, 1e-12, `${nombre}: EE`);
        cerca(R.inferior, B.inferior, 1e-12, `${nombre}: inferior`); cerca(R.superior, B.superior, 1e-12, `${nombre}: superior`);
        cerca(R.mannWhitney.U, B.U, 1e-9, `${nombre}: U`); cerca(R.mannWhitney.pValor, B.pValor, 1e-12 + 1e-9 * B.pValor, `${nombre}: p`);
    }
});

test('cada punto de corte, el óptimo de Youden y sus intervalos de Wilson', () => {
    for (const [nombre, B] of Object.entries(O)) {
        const R = /** @type {NonNullable<ReturnType<typeof curvaROC>>} */ (curvaROC([...B.casos, ...B.noCasos], [...B.casos.map(() => true), ...B.noCasos.map(() => false)]));
        assert.equal(R.cortes.length, B.cortes.length, nombre);
        R.cortes.forEach((k, i) => {
            const e = B.cortes[i];
            assert.equal(k.corte, e.corte); assert.equal(k.vp, e.vp); assert.equal(k.fp, e.fp);
            cerca(k.youden, e.youden, 1e-14, `${nombre}: J en ${k.corte}`);
            if (e.vpp !== null) cerca(k.vpp, e.vpp, 1e-14, 'VPP');
        });
        const o = R.optimo, e = B.optimo;
        assert.equal(o.corte, e.corte, `${nombre}: corte óptimo`);
        for (const c of ['icSensibilidad', 'icEspecificidad', 'icVpp', 'icVpn']) { cerca(/** @type {any} */ (o)[c][0], e[c][0], 1e-12, `${nombre}: ${c}`); cerca(/** @type {any} */ (o)[c][1], e[c][1], 1e-12, `${nombre}: ${c}`); }
        // la curva va de (0, 0) a (1, 1) y nunca baja
        assert.deepEqual([R.curva[0]?.fpr, R.curva[0]?.tpr], [0, 0]);
        assert.deepEqual([R.curva[R.curva.length - 1]?.fpr, R.curva[R.curva.length - 1]?.tpr], [1, 1]);
        for (let i = 1; i < R.curva.length; i++) assert.ok(/** @type {any} */ (R.curva[i]).tpr >= /** @type {any} */ (R.curva[i - 1]).tpr && /** @type {any} */ (R.curva[i]).fpr >= /** @type {any} */ (R.curva[i - 1]).fpr);
    }
});

test('el sentido pedido, la separación perfecta y los bordes', () => {
    const B = O.enteros, x = [...B.casos, ...B.noCasos], c = [...B.casos.map(() => true), ...B.noCasos.map(() => false)];
    const mayor = /** @type {any} */ (curvaROC(x, c, { sentido: 'mayor' })), menor = /** @type {any} */ (curvaROC(x, c, { sentido: 'menor' }));
    cerca(mayor.auc + menor.auc, 1, 1e-12, 'los dos sentidos suman 1');
    assert.equal(menor.invertido, false, 'pedido, no automático');
    const perfecta = /** @type {any} */ (curvaROC([1, 2, 3, 10, 11, 12], [false, false, false, true, true, true]));
    assert.equal(perfecta.auc, 1); assert.equal(perfecta.optimo.corte, 10); assert.equal(perfecta.optimo.youden, 1);
    assert.equal(curvaROC([1, 2, 3], [true, true, true]), null, 'sin no casos');
    assert.deepEqual(intervaloWilson(0, 10).map(v => Number(v.toFixed(6))), [0, 0.277533]);
});

test('(2027.01.20) con el sentido forzado al revés (AUC < .5), el texto lo dice y no propone corte', async () => {
    const { curvaROC } = await import('../../src/core/stats/roc.js');
    const { redactarROC, referenciasROC, alReves } = await import('../../src/analizador/roc/roc-redaccion.js');
    // las puntuaciones bajas indican el caso, pero se fuerza «las altas»
    const v = [...Array.from({ length: 30 }, (_, i) => 5 + (i % 10)), ...Array.from({ length: 30 }, (_, i) => 10 + (i % 10))];
    const caso = [...Array(30).fill(true), ...Array(30).fill(false)];
    const R = /** @type {any} */ (curvaROC(v, caso, { sentido: 'mayor' }));
    assert.ok(R.auc < 0.5 && alReves(R));
    const ctx = { puntuacion: 'Bienestar', criterio: 'Depresión', positivo: 'Sí', negativo: 'No', excluidos: 0, alfa: 0.05 };
    const s = redactarROC(R, ctx);
    assert.match(s, /por debajo de \.5: en ese sentido, Bienestar clasifica peor que el azar/);
    assert.match(s, /en el contrario el área sería de \.\d{3}\. El sentido elegido parece invertido; con él, ningún punto de corte es recomendable\.$/);
    assert.doesNotMatch(s, /mayor que la del azar|punto de corte óptimo/);
    assert.doesNotMatch(referenciasROC(R, ctx).join(' '), /Youden/);
    const auto = /** @type {any} */ (curvaROC(v, caso, { sentido: 'auto' }));
    assert.ok(auto.auc > 0.5 && !alReves(auto));
});
