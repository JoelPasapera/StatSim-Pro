// @ts-check
// tests/unit/perdidos.test.js — (2027.01.18) los datos perdidos (core/stats/perdidos.js e imputacion.js): los patrones, el EM
// de la normal multivariante (contra el oráculo, que lo verifica además maximizando la verosimilitud directamente), la prueba
// MCAR de Little y las reglas de Rubin con los gl de Barnard y Rubin (tests/oracle/perdidos_oraculo.py); y la imputación
// múltiple por PMM: reproducible con su semilla, cada cadena independiente de las demás, imputa solo valores observados de
// cada variable y no toca los observados. Su calibración (sesgo y cobertura), en tests/montecarlo/imputacion.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { patronesPerdidos, emNormal, pruebaMcarLittle, reglasRubin } from '../../src/core/stats/perdidos.js';
import { imputarPMM, mediaCombinada, correlacionCombinada, emparejar } from '../../src/core/stats/imputacion.js';
import { gammaAleatoria } from '../../src/core/random/gamma.js';
import { sfc32, semillaCadena } from '../../src/core/random/sfc32.js';
import { generadorNormales } from '../../src/core/random/normal.js';

const O = JSON.parse(fs.readFileSync(new URL('../oracle/perdidos_fixture.json', import.meta.url), 'utf8'));
/** @param {(number | null)[][]} X */
const columnas = X => X.map(c => Float64Array.from(c, v => (v === null ? NaN : v)));
/** @param {number} x @param {number} ref @param {number} rel @param {string} que */
const cerca = (x, ref, rel, que) => assert.ok(Math.abs(x - ref) <= rel * Math.max(Math.abs(ref), 1), `${que}: ${x} frente a ${ref} (oráculo)`);

test('los patrones de pérdida, como los cuenta np.unique', () => {
    for (const [tipo, B] of Object.entries(O.bases)) {
        const P = patronesPerdidos(columnas(B.X));
        assert.equal(P.n, 250); assert.equal(P.k, 4);
        assert.deepEqual(P.perdidosPorVariable, B.perdidosPorVariable, tipo);
        assert.equal(P.completos, B.completos); assert.equal(P.vacios, B.vacios);
        const como = (/** @type {[number, string][]} */ v) => v.map(([c, p]) => `${p}:${c}`).sort();
        assert.deepEqual(como(P.patrones.map(p => [p.n, p.observado.map(o => (o ? '1' : '0')).join('')])), como(B.patrones), tipo);
        for (let i = 1; i < P.patrones.length; i++) assert.ok(/** @type {{ n: number }} */ (P.patrones[i - 1]).n >= /** @type {{ n: number }} */ (P.patrones[i]).n, 'de más a menos frecuente');
        assert.equal(P.patrones.reduce((s, p) => s + p.filas.length, 0), 250);
    }
});

test('el EM llega al máximo de la verosimilitud del oráculo, y la prueba de Little coincide', () => {
    for (const [tipo, B] of Object.entries(O.bases)) {
        const X = columnas(B.X), em = emNormal(X, { tolerancia: 1e-13, maxIteraciones: 20000 });
        assert.ok(em && em.convergio, tipo);
        assert.equal(em.n, B.n, 'el caso sin valores queda fuera');
        em.medias.forEach((v, j) => cerca(v, B.medias[j], 1e-10, `${tipo}: media ${j}`));
        em.cov.forEach((f, a) => f.forEach((v, b) => cerca(v, B.cov[a][b], 1e-9, `${tipo}: cov ${a},${b}`)));
        assert.ok(Math.abs(em.logVerosimilitud - B.logVerosimilitud) < 1e-8, `${tipo}: log-verosimilitud ${em.logVerosimilitud} frente a ${B.logVerosimilitud}`);
        const L = pruebaMcarLittle(X, em);
        assert.ok(L);
        cerca(L.chi2, B.little.chi2, 1e-8, `${tipo}: χ² de Little`);
        assert.equal(L.gl, B.little.gl); assert.equal(L.patrones, B.little.patrones);
        cerca(L.pValor, B.little.pValor, 1e-7, `${tipo}: p de Little`);
    }
    assert.ok(O.bases.mcar.little.pValor > 0.05 && O.bases.mar.little.pValor < 0.001, 'la base MCAR no se rechaza; la MAR, sí');
    // sin perdidos, no hay nada que contrastar; con una variable sin variación, el EM no arranca
    const completa = [Float64Array.of(1, 2, 3, 4), Float64Array.of(2, 1, 4, 3)];
    assert.equal(pruebaMcarLittle(completa, /** @type {any} */ (emNormal(completa))), null);
    assert.equal(emNormal([Float64Array.of(1, 1, NaN, 1), Float64Array.of(2, 1, 4, 3)]), null);
});

test('las reglas de Rubin con los gl de Barnard y Rubin, como el oráculo', () => {
    for (const c of O.rubin) {
        const r = reglasRubin(c.Q, c.U, { glCompletos: c.glCompletos === null ? Infinity : c.glCompletos });
        const e = c.esperado;
        for (const clave of ['estimacion', 'dentro', 'entre', 'total', 'r', 'lambda', 'gl', 'fmi', 'inferior', 'superior', 't', 'pValor']) cerca(/** @type {any} */ (r)[clave], e[clave], 1e-9, `${c.Q.length} imputaciones: ${clave}`);
    }
});

test('la imputación por PMM: reproducible, cadenas independientes, solo valores observados y los observados intactos', () => {
    const X = columnas(O.bases.mar.X).map(c => c.map(v => (Number.isFinite(v) ? Math.round(v) : v)));   // valores enteros: así se ve que se imputan valores posibles
    const a = imputarPMM(X, { m: 5, iteraciones: 5, semilla: 99 }), b = imputarPMM(X, { m: 5, iteraciones: 5, semilla: 99 });
    assert.deepEqual(a.imputaciones.map(I => I.columnas.map(c => Array.from(c))), b.imputaciones.map(I => I.columnas.map(c => Array.from(c))), 'la misma semilla, lo mismo');
    const sola = imputarPMM(X, { m: 5, iteraciones: 5, semilla: 99, cadenas: [3] });
    assert.deepEqual(Array.from(/** @type {any} */ (sola.imputaciones[0]).columnas[1]), Array.from(/** @type {any} */ (a.imputaciones[3]).columnas[1]), 'la cadena 3 sola, igual que con las demás');
    const otra = imputarPMM(X, { m: 5, iteraciones: 5, semilla: 100 });
    assert.notDeepEqual(Array.from(/** @type {any} */ (otra.imputaciones[0]).columnas[1]), Array.from(/** @type {any} */ (a.imputaciones[0]).columnas[1]));
    assert.deepEqual(a.imputadas, [0, 1, 2, 3], 'el caso vacío deja perdidos en todas');
    for (const I of a.imputaciones) {
        X.forEach((c, j) => {
            const observados = new Set(Array.from(c).filter(Number.isFinite));
            const col = /** @type {Float64Array} */ (I.columnas[j]);
            for (let i = 0; i < c.length; i++) {
                assert.ok(Number.isFinite(col[i]), 'sin perdidos');
                if (Number.isFinite(c[i])) assert.equal(col[i], c[i], 'los observados no se tocan');
                else assert.ok(observados.has(/** @type {number} */ (col[i])), `un valor observado de la variable ${j}`);
            }
        });
    }
    assert.equal(a.traza.length, 5); assert.equal(/** @type {number[][]} */ (a.traza[0]).length, 5); assert.equal(/** @type {number[][]} */ (a.traza[0])[0]?.length, 4);
    // combinar: la media y la correlación, con sus intervalos y la fracción de información perdida
    const M = mediaCombinada(a.imputaciones, 1), r = correlacionCombinada(a.imputaciones, 0, 1);
    assert.ok(M.inferior < M.estimacion && M.estimacion < M.superior && M.fmi > 0 && M.fmi < 1, JSON.stringify(M));
    assert.ok(r.inferior < r.r && r.r < r.superior && r.r > 0.3, JSON.stringify(r));
    assert.notEqual(semillaCadena(2027, 0), semillaCadena(2027, 1));
});

test('el emparejamiento toma los donantes más cercanos; la gamma tiene su media y su varianza', () => {
    const yhatObs = Float64Array.of(1, 2, 3, 4, 5, 6, 7, 8), yObs = Float64Array.of(10, 20, 30, 40, 50, 60, 70, 80);
    const elegidos = new Set();
    for (let s = 0; s < 200; s++) { const g = sfc32(s); elegidos.add(emparejar(yhatObs, yObs, Float64Array.of(4.4), 3, g.entero)[0]); }
    assert.deepEqual([...elegidos].sort(), [30, 40, 50], 'los 3 vecinos de 4,4: 4, 5 y 3');
    assert.deepEqual(Array.from(emparejar(yhatObs, yObs, Float64Array.of(-5, 100), 1, () => 0)), [10, 80], 'en los extremos');
    for (const forma of [0.4, 1, 3.5, 50]) {
        const g = sfc32(7), u = g.siguiente, normal = generadorNormales(u), N = 40000;
        let s = 0, s2 = 0;
        for (let i = 0; i < N; i++) { const x = gammaAleatoria(forma, u, normal); s += x; s2 += x * x; }
        const m = s / N, v = s2 / N - m * m;
        assert.ok(Math.abs(m - forma) < 4 * Math.sqrt(forma / N), `media de Gamma(${forma}): ${m}`);
        assert.ok(Math.abs(v / forma - 1) < 0.06, `varianza de Gamma(${forma}): ${v}`);
    }
});

test('(2027.01.20) el emparejamiento sortea los empates (como mice::matchindex): con un predictor discreto, todos los del bloque pueden donar', () => {
    // 12 observados con la misma predicción (un ítem Likert de predictor) y 5 donantes: antes salían siempre los 5 primeros
    const yhatObs = Float64Array.from({ length: 20 }, (_, i) => (i < 12 ? 3 : 5 + i)), yObs = Float64Array.from({ length: 20 }, (_, i) => 100 + i);
    /** @type {Set<number>} */ const elegidos = new Set();
    for (let s = 0; s < 300; s++) { const g = sfc32(s); elegidos.add(/** @type {number} */ (emparejar(yhatObs, yObs, Float64Array.of(3), 5, g.entero)[0])); }
    assert.deepEqual([...elegidos].sort((a, b) => a - b), Array.from({ length: 12 }, (_, i) => 100 + i), 'los 12 del bloque, y solo ellos');
});

test('(2027.01.20) las bases imputadas recalculan los puntajes desde sus ítems (imputación pasiva): la suma o la media, como en la original', async () => {
    const { basesApiladas, puntajesPasivos } = await import('../../src/analizador/perdidos/perdidos-redaccion.js');
    /** @type {Record<string, unknown>[]} */ const filas = [];
    for (let i = 0; i < 60; i++) {
        const p = [1 + (i % 5), 1 + ((i * 3) % 5), 1 + ((i * 7) % 5), 1 + ((i * 2) % 5)];
        if (i % 6 === 0) p[1] = NaN;
        const completa = p.every(Number.isFinite), s = p.reduce((a, b) => a + b, 0);
        filas.push({ ID: i + 1, P1: p[0], P2: Number.isFinite(p[1]) ? p[1] : '', P3: p[2], P4: p[3], Total_X: completa ? s : '', Media_X: completa ? s / 4 : '', Otro: completa ? s + 1 : '' });
    }
    const cols = ['P1', 'P2', 'P3', 'P4'], X = cols.map(c => Float64Array.from(filas, f => (f[c] === '' ? NaN : Number(f[c]))));
    const P = puntajesPasivos(filas, cols, [{ items: cols }]);
    assert.deepEqual(P.map(p => [p.columna, p.modo]), [['Total_X', 'suma'], ['Media_X', 'media']], 'Otro (suma + 1) no es un puntaje de esos ítems; ID tampoco');
    const R = imputarPMM(X, { m: 3, iteraciones: 3 });
    const B = basesApiladas(filas, cols, R.imputaciones, P);
    const j = (/** @type {string} */ c) => B.nombres.indexOf(c), iP = cols.map(j);
    for (const f of B.filas) {
        if (f[0] === 0) continue;
        const s = iP.reduce((a, k) => a + Number(f[k]), 0);
        assert.equal(f[j('Total_X')], s); assert.equal(f[j('Media_X')], s / 4);
    }
    // la original (Imputation_ = 0), intacta: el puntaje vacío donde faltaba un ítem
    assert.equal(B.filas[0][j('Total_X')], ''); assert.equal(B.filas[0][0], 0);
    assert.deepEqual(puntajesPasivos(filas, ['P1'], [{ items: ['P2', 'P3'] }]), [], 'sin ítems imputados en la escala, nada que recalcular');
});

test('(2027.01.20) sin varianza entre imputaciones (una variable sin perdidos), la fracción de información perdida es 0', () => {
    const R = reglasRubin([2, 2, 2, 2, 2], [0.1, 0.1, 0.1, 0.1, 0.1], { glCompletos: 99 });
    assert.equal(R.entre, 0); assert.equal(R.fmi, 0, 'no 2/(ν + 3)');
    assert.ok(R.gl > 90 && R.gl < 99, 'los gl, los de los datos observados');
    // con varianza entre imputaciones, la de siempre (la de mice)
    const S = reglasRubin([2, 2.1, 1.9, 2.05, 1.95], [0.1, 0.1, 0.1, 0.1, 0.1], { glCompletos: 99 });
    assert.ok(Math.abs(S.fmi - (S.r + 2 / (S.gl + 3)) / (1 + S.r)) < 1e-15);
});
