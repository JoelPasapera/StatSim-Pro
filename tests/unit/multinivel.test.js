// multinivel.test.js — (2027.01.19) el modelo de intercepto aleatorio (core/stats/multinivel.js) frente al oráculo de
// tests/oracle/multinivel_oraculo.py, que maximiza la REML con las matrices completas (V = σ²_u·ZZᵀ + σ²_e·I, slogdet y
// solve) en lugar de la forma cerrada de Sherman–Morrison del programa: las varianzas, β y sus EE, los gl de Satterthwaite,
// la razón de verosimilitudes de σ²_u = 0, los R² de Nakagawa y la ML; en tres bases (mucha, poca y ninguna varianza entre
// grupos), y (2027.01.20) una cuarta con el año de nacimiento sin centrar, en la que el oráculo usa el hessiano y el gradiente
// exactos. Y sus propiedades: invarianzas (permutar, renombrar, desplazar la dependiente y los predictores), el modelo nulo de
// un diseño equilibrado frente a la ANOVA de un factor y lo que no se puede ajustar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ajustarInterceptoAleatorio, agrupar } from '../../src/core/stats/multinivel.js';
import { sfc32 } from '../../src/core/random/sfc32.js';
import { generadorNormales } from '../../src/core/random/normal.js';

const O = JSON.parse(readFileSync(new URL('../oracle/multinivel_fixture.json', import.meta.url), 'utf8'));
const cerca = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ tol, /** @type {string} */ que) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${que}: ${a} frente a ${b} (tolerancia relativa ${tol})`);
/** @typedef {import('../../src/core/stats/multinivel.js').ResultadoMultinivel} ResultadoMultinivel */
/** El ajuste, que no debe fallar. @param {Parameters<typeof ajustarInterceptoAleatorio>} args @returns {ResultadoMultinivel} */
const sinError = (...args) => { const R = ajustarInterceptoAleatorio(...args); assert.ok(!('error' in R), 'error' in R ? R.error : ''); return /** @type {ResultadoMultinivel} */ (R); };
const ajustar = (/** @type {any} */ E, /** @type {{ y?: number, x?: number, w?: number }} */ mas = {}) => sinError(Float64Array.from(E.y, v => v + (mas.y || 0)), [Float64Array.from(E.x, v => v + (mas.x || 0)), Float64Array.from(E.w, v => v + (mas.w || 0))], E.g);

test('las tres bases del oráculo: varianzas, β, EE, gl de Satterthwaite, la prueba de σ²_u = 0, los R² de Nakagawa y la ML', () => {
    for (const [nombre, E] of Object.entries(O)) {
        const R = ajustar(E);
        cerca(R.s2u, E.s2u, 1e-6, `${nombre}: σ²_u`); cerca(R.s2e, E.s2e, 1e-7, `${nombre}: σ²_e`); cerca(R.icc, E.icc, 1e-6, `${nombre}: CCI`);
        cerca(R.efectoDiseno, E.efectoDiseno, 1e-6, `${nombre}: efecto de diseño`);
        cerca(R.reml, E.reml, 1e-9, `${nombre}: REML`); cerca(R.ml, E.ml, 1e-9, `${nombre}: ML`);
        cerca(R.lrt, E.lrt, 1e-5, `${nombre}: razón de verosimilitudes`); cerca(R.pLrt, E.pLrt, 1e-4, `${nombre}: su p (½χ²₀ + ½χ²₁)`);
        cerca(R.r2Marginal, E.r2Marginal, 1e-6, `${nombre}: R² marginal`); cerca(R.r2Condicional, E.r2Condicional, 1e-6, `${nombre}: R² condicional`);
        assert.equal(R.satterthwaite, E.satterthwaite, `${nombre}: con gl de Satterthwaite`);
        R.coeficientes.forEach((c, k) => {
            const e = E.coeficientes[k];
            cerca(c.b, e.b, 1e-7, `${nombre}: β${k}`); cerca(c.ee, e.ee, 1e-6, `${nombre}: EE de β${k}`);
            cerca(c.gl, e.gl, 1e-4, `${nombre}: gl de β${k}`); cerca(c.pValor, e.pValor, 1e-4, `${nombre}: p de β${k}`);
            assert.ok(c.inferior < c.b && c.b < c.superior);
        });
    }
});

test('los gl de Satterthwaite: los del predictor de nivel 2 cerca del número de grupos; los de nivel 1, cerca de N', () => {
    const R = ajustar(O.grande), G = R.G, N = R.n;
    const [, x, w] = R.coeficientes.map(c => c.gl);
    assert.ok(/** @type {number} */ (w) < G && /** @type {number} */ (w) > G - 5, `nivel 2: ${w} con ${G} grupos`);
    assert.ok(/** @type {number} */ (x) > N - G && /** @type {number} */ (x) < N, `nivel 1: ${x} con N = ${N}`);
});

test('agrupar: los códigos de cualquier tipo, en orden de aparición', () => {
    const g = agrupar(['b', 3, 'b', null, 3, 'a']);
    assert.deepEqual(g.niveles, ['b', 3, null, 'a']);
    assert.deepEqual([...g.indice], [0, 1, 0, 2, 1, 3]);
    assert.deepEqual(g.tamanos, [2, 2, 1, 1]);
});

test('invarianzas: permutar las filas o renombrar los grupos no cambia el ajuste', () => {
    const E = O.pequena, R = ajustar(E), n = E.y.length;
    const orden = Array.from({ length: n }, (_, i) => (i * 7919) % n);
    assert.equal(new Set(orden).size, n);
    const P = sinError(Float64Array.from(orden, i => E.y[i]), [Float64Array.from(orden, i => E.x[i]), Float64Array.from(orden, i => E.w[i])], orden.map(i => `Colegio ${E.g[i] * 3 + 1}`));
    cerca(P.s2u, R.s2u, 1e-6, 'σ²_u'); cerca(P.reml, R.reml, 1e-9, 'REML');
    P.coeficientes.forEach((c, k) => { cerca(c.b, /** @type {any} */ (R.coeficientes[k]).b, 1e-7, `β${k}`); cerca(c.gl, /** @type {any} */ (R.coeficientes[k]).gl, 1e-4, `gl${k}`); });
});

test('(2027.01.20) desplazar la dependiente o los predictores no cambia las varianzas, las pendientes ni sus gl', () => {
    // con la 2027.01.19, y + 500 y x + 50 daban unos gl del predictor de nivel 1 un 0,3 % distintos y, con un año sin
    // centrar, los del predictor de nivel 2, cinco veces mayores: las derivadas numéricas de una forma que restaba números grandes
    for (const nombre of ['grande', 'pequena', 'notas']) {
        const E = O[nombre], R = ajustar(E);
        for (const mas of [{ y: 500 }, { x: 50 }, { y: 500, x: 50 }, { w: 2000 }, { y: -3000, x: 1e4, w: -70 }]) {
            const D = ajustar(E, mas), que = `${nombre} ${JSON.stringify(mas)}`;
            cerca(D.s2u, R.s2u, 1e-6, `${que}: σ²_u`); cerca(D.s2e, R.s2e, 1e-8, `${que}: σ²_e`); cerca(D.reml, R.reml, 1e-9, `${que}: REML`);
            assert.equal(D.satterthwaite, R.satterthwaite);
            for (const k of [1, 2]) {
                const c = /** @type {any} */ (D.coeficientes[k]), r = /** @type {any} */ (R.coeficientes[k]);
                cerca(c.b, r.b, 1e-7, `${que}: β${k}`); cerca(c.ee, r.ee, 1e-6, `${que}: EE de β${k}`); cerca(c.gl, r.gl, 1e-4, `${que}: gl de β${k}`);
            }
            // la constante cambia como debe: b₀ + Δy − β_x·Δx − β_w·Δw
            const b = R.coeficientes.map(c => c.b);
            cerca(/** @type {any} */ (D.coeficientes[0]).b, /** @type {number} */ (b[0]) + (mas.y || 0) - /** @type {number} */ (b[1]) * (mas.x || 0) - /** @type {number} */ (b[2]) * (mas.w || 0), 1e-7, `${que}: β0`);
        }
    }
});

test('el modelo nulo de un diseño equilibrado: la CCI es la de la ANOVA de un factor, (CMe − CMd)/(CMe + (m − 1)CMd)', () => {
    const g = sfc32(2027), normal = generadorNormales(g.siguiente), G = 40, m = 8;
    const y = [], grupos = [];
    for (let j = 0; j < G; j++) { const u = 1.5 * normal(); for (let i = 0; i < m; i++) { y.push(20 + u + 3 * normal()); grupos.push(j); } }
    const R = sinError(Float64Array.from(y), [], grupos);
    const medias = Array.from({ length: G }, (_, j) => y.slice(j * m, (j + 1) * m).reduce((s, v) => s + v, 0) / m), total = medias.reduce((s, v) => s + v, 0) / G;
    const cme = m * medias.reduce((s, v) => s + (v - total) ** 2, 0) / (G - 1);
    const cmd = y.reduce((s, v, i) => s + (v - /** @type {number} */ (medias[/** @type {number} */ (grupos[i])])) ** 2, 0) / (G * (m - 1));
    cerca(R.s2e, cmd, 1e-7, 'σ²_e = CMd'); cerca(R.s2u, (cme - cmd) / m, 1e-6, 'σ²_u = (CMe − CMd)/m');
    cerca(R.icc, (cme - cmd) / (cme + (m - 1) * cmd), 1e-6, 'CCI(1)');
    cerca(R.efectoDiseno, 1 + (m - 1) * R.icc, 1e-12, 'efecto de diseño de Kish');
    cerca(/** @type {any} */ (R.coeficientes[0]).b, total, 1e-9, 'la constante, la gran media');
    cerca(/** @type {any} */ (R.coeficientes[0]).gl, G - 1, 1e-3, 'sus gl, los de los grupos');
    assert.equal(R.r2Marginal, 0);
});

test('lo que no se puede ajustar se dice: un solo grupo, pocos casos, grupos de un caso, colinealidad, la CCI ≈ 1', () => {
    const fallo = (/** @type {ReturnType<typeof ajustarInterceptoAleatorio>} */ R, /** @type {RegExp} */ patron) => { assert.ok('error' in R, 'debía fallar'); assert.match(R.error, patron); };
    fallo(ajustarInterceptoAleatorio(Float64Array.from([1, 2, 3, 4]), [], [1, 1, 1, 1]), /dos grupos/);
    fallo(ajustarInterceptoAleatorio(Float64Array.from([1, 2, 3]), [Float64Array.from([1, 2, 4])], [1, 2, 2]), /más casos/);
    fallo(ajustarInterceptoAleatorio(Float64Array.from([1, 2, 3, 5, 8]), [], [1, 2, 3, 4, 5]), /Ningún grupo tiene dos/);
    fallo(ajustarInterceptoAleatorio(Float64Array.from([1, 2, 3, 5, 8, 9]), [Float64Array.from([4, 4, 4, 4, 4, 4])], [1, 1, 2, 2, 3, 3]), /no varía/);
    // una combinación exacta (el total de dos subescalas, con enteros grandes) y la media de grupo de una variable de nivel 2
    const g = sfc32(7), normal = generadorNormales(g.siguiente), E = O.grande, n = E.y.length;
    const s1 = Float64Array.from(E.x, v => Math.round(1000 + 30 * v)), s2 = Float64Array.from(E.w, v => Math.round(2000 + 20 * v + 5 * normal()));
    fallo(ajustarInterceptoAleatorio(Float64Array.from(E.y), [s1, s2, Float64Array.from(s1, (v, i) => v + /** @type {number} */ (s2[i]))], E.g), /colineales/);
    fallo(ajustarInterceptoAleatorio(Float64Array.from(E.y), [Float64Array.from(E.w), Float64Array.from(E.w, v => 3 * v - 1)], E.g), /colineales/);
    // casi colineales (un 1 % de ruido): se ajusta
    assert.ok(!('error' in ajustarInterceptoAleatorio(Float64Array.from(E.y), [s1, s2, Float64Array.from(s1, (v, i) => v + /** @type {number} */ (s2[i]) + 0.01 * normal())], E.g)));
    // la dependiente constante dentro de cada grupo (una variable de nivel 2): σ²_e no se puede estimar
    const deGrupo = Float64Array.from(E.g, (/** @type {number} */ j) => 10 + ((j * 7) % 5));
    fallo(ajustarInterceptoAleatorio(deGrupo, [], E.g), /CCI ≈ 1/);
    assert.equal(n, E.g.length);
});
