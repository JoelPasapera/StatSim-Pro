// tri.test.js — (2027.01.19) la teoría de respuesta al ítem (core/stats/tri.js), la regresión logística ordinal
// (core/stats/logit-ordinal.js) y el DIF (core/stats/dif.js) frente al oráculo de tests/oracle/tri_oraculo.py: el máximo de
// la verosimilitud marginal de Rasch, 2PL y GRM buscado DIRECTAMENTE con L-BFGS-B (no por EM), con sus errores típicos, las
// EAP y la fiabilidad marginal; y las tres regresiones logísticas ordinales de cada ítem del DIF, (2027.01.20) también con
// grupos desiguales (uno de 6 personas, fuera), perdidos, respuestas de 1 a 5 sumadas tal cual y la p de Holm calculada en
// Python. Y sus propiedades.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ajustarTRI, categorias, cuadratura, informacion, prepararRespuestas } from '../../src/core/stats/tri.js';
import { ajustarLogitOrdinal, logVerosimilitudNula, r2Nagelkerke } from '../../src/core/stats/logit-ordinal.js';
import { difRegresionLogistica, CORTES_JODOIN_GIERL, MINIMO_GRUPO_DIF } from '../../src/core/stats/dif.js';
import { ajustarMlg } from '../../src/core/stats/mlg.js';
import { sfc32 } from '../../src/core/random/sfc32.js';
import { generadorNormales } from '../../src/core/random/normal.js';

const O = JSON.parse(readFileSync(new URL('../oracle/tri_fixture.json', import.meta.url), 'utf8'));
const aInt8 = (/** @type {number[][]} */ M) => M.map(f => Int8Array.from(f));
const cerca = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ tol, /** @type {string} */ que) => assert.ok(Math.abs(a - b) <= tol, `${que}: ${a} frente a ${b} (tolerancia ${tol})`);

/** Respuestas simuladas de un GRM (con el generador del programa). */
function simularGRM(n, items, semilla, sesgo = () => 0) {
    const g = sfc32(semilla), normal = generadorNormales(g.siguiente), z = Array.from({ length: n }, () => normal());
    return items.map(([a, d], j) => Int8Array.from(z, (zi, i) => { const u = g.siguiente(); let c = 0; for (const dk of d) if (u < 1 / (1 + Math.exp(-(a * zi + dk + sesgo(i, j))))) c++; return c; }));
}

test('los tres modelos alcanzan el máximo de la verosimilitud marginal del oráculo (SciPy, L-BFGS-B y no EM)', () => {
    for (const [modelo, datos] of /** @type {[('grm' | '2pl' | 'rasch'), number[][]][]} */ ([['grm', O.X], ['2pl', O.Xd], ['rasch', O.Xd]])) {
        const R = ajustarTRI(aInt8(datos), { modelo, tolerancia: 1e-6 }), E = O.modelos[modelo];
        assert.ok(R.convergio, `${modelo}: converge`);
        cerca(R.menos2LL, E.menos2LL, 1e-5, `${modelo}: −2LL`);
        R.items.forEach((it, j) => {
            const e = E.items[j];
            if (modelo !== 'rasch') { cerca(it.a, e.a, 2e-5, `${modelo}: a del ítem ${j + 1}`); cerca(it.eeA, e.eeA, 2e-6, `${modelo}: EE de a del ítem ${j + 1}`); }
            it.b.forEach((b, k) => { cerca(b, e.b[k], 2e-5, `${modelo}: b${k + 1} del ítem ${j + 1}`); cerca(/** @type {number} */ (it.eeB[k]), e.eeB[k], 2e-6, `${modelo}: EE de b${k + 1} del ítem ${j + 1}`); });
        });
        E.eap.forEach((/** @type {number} */ v, /** @type {number} */ i) => { cerca(/** @type {number} */ (R.eap[i]), v, 1e-5, `${modelo}: EAP ${i}`); cerca(/** @type {number} */ (R.dePosterior[i]), E.dePosterior[i], 1e-5, `${modelo}: DE posterior ${i}`); });
        cerca(R.fiabilidadMarginal, E.fiabilidadMarginal, 1e-6, `${modelo}: fiabilidad marginal`);
        if (modelo === 'rasch') { cerca(/** @type {any} */ (R.deRasgo).valor, E.deRasgo.valor, 2e-5, 'Rasch: DE del rasgo'); cerca(/** @type {any} */ (R.deRasgo).ee, E.deRasgo.ee, 2e-6, 'Rasch: su EE'); }
        assert.equal(R.parametros, modelo === 'rasch' ? R.J + 1 : R.K.reduce((s, k) => s + k, 0));
        cerca(R.aic, R.menos2LL + 2 * R.parametros, 1e-9, 'AIC'); cerca(R.bic, R.menos2LL + R.parametros * Math.log(R.n), 1e-9, 'BIC');
    }
});

test('con la tolerancia por defecto (la de mirt, 10⁻⁴), el mismo ajuste en las tres primeras cifras', () => {
    const R = ajustarTRI(aInt8(O.X), { modelo: 'grm' }), E = O.modelos.grm;
    assert.ok(R.convergio && R.iteraciones < 100);
    R.items.forEach((it, j) => { cerca(it.a, E.items[j].a, 1e-3, `a${j + 1}`); it.b.forEach((b, k) => cerca(b, E.items[j].b[k], 1e-3, `b${j + 1},${k + 1}`)); });
    cerca(R.menos2LL, E.menos2LL, 1e-3, '−2LL');
});

test('recupera los parámetros con los que se simuló (n = 2000) y avisa el progreso de cada iteración', () => {
    const items = [[1.2, [1.5, 0.3, -1.0]], [0.8, [1.0, -0.5, -2.0]], [2.0, [2.0, 0.0, -1.5]], [1.5, [0.5, -0.8, -2.5]], [1.0, [2.5, 1.0, -0.2]]];
    /** @type {[number, number][]} */ const avisos = [];
    const R = ajustarTRI(simularGRM(2000, /** @type {any} */ (items), 7), { alProgreso: (h, t) => avisos.push([h, t]) });
    R.items.forEach((it, j) => {
        const [a, d] = /** @type {[number, number[]]} */ (items[j]);
        cerca(it.a, a, 4 * it.eeA, `a del ítem ${j + 1}`);
        d.forEach((dk, k) => cerca(/** @type {number} */ (it.b[k]), -dk / a, 4 * /** @type {number} */ (it.eeB[k]) + 0.05, `b${k + 1} del ítem ${j + 1}`));
    });
    assert.equal(avisos.length, R.iteraciones);
    assert.deepEqual(avisos.at(-1), [R.iteraciones, 500]);
    assert.ok(R.fiabilidadMarginal > 0.7 && R.fiabilidadMarginal < 0.95);
});

test('las categorías: los valores observados de cada ítem, en orden, y −1 en los perdidos', () => {
    const { X, categorias: cats } = prepararRespuestas([[1, 3, 5, NaN, 3], [0, 1, 1, 0, NaN]]);
    assert.deepEqual(cats, [[1, 3, 5], [0, 1]]);
    assert.deepEqual([...(/** @type {Int8Array} */ (X[0]))], [0, 1, 2, -1, 1]);
    assert.deepEqual([...(/** @type {Int8Array} */ (X[1]))], [0, 1, 1, 0, -1]);
    assert.throws(() => ajustarTRI([Int8Array.from([0, 0, 0]), Int8Array.from([0, 1, 1])]), /dos categorías/);
    assert.throws(() => ajustarTRI([Int8Array.from([0, 2, 1]), Int8Array.from([0, 1, 1])], { modelo: '2pl' }), /dicotómicos/);
});

test('las probabilidades de cada categoría suman 1 y sus derivadas son las numéricas; la cuadratura, la normal', () => {
    const a = 1.3, d = [1.1, -0.2, -1.7];
    for (const z of [-3, -0.4, 0, 1.2, 4]) {
        const { P, dP } = categorias(a, d, z);
        cerca(P.reduce((s, p) => s + p, 0), 1, 1e-14, `ΣP en z = ${z}`);
        const h = 1e-6;
        for (let u = 0; u <= d.length; u++) {
            const mas = u === 0 ? categorias(a + h, d, z) : categorias(a, d.map((v, k) => (k === u - 1 ? v + h : v)), z);
            const menos = u === 0 ? categorias(a - h, d, z) : categorias(a, d.map((v, k) => (k === u - 1 ? v - h : v)), z);
            P.forEach((_, c) => cerca(/** @type {number} */ (/** @type {number[]} */ (dP[c])[u]), (/** @type {number} */ (mas.P[c]) - /** @type {number} */ (menos.P[c])) / (2 * h), 1e-8, `∂P${c}/∂θ${u} en z = ${z}`));
        }
    }
    const { nodos, pesos } = cuadratura();
    assert.equal(nodos.length, 61); cerca(/** @type {number} */ (nodos[0]), -6, 0, 'primer nodo'); cerca(/** @type {number} */ (nodos[60]), 6, 1e-15, 'último nodo');
    cerca(pesos.reduce((s, w) => s + w, 0), 1, 1e-14, 'Σ pesos');
    cerca(pesos.reduce((s, w, q) => s + w * /** @type {number} */ (nodos[q]) ** 2, 0), 1, 1e-6, 'varianza de la cuadratura');
});

test('la información: la de Rasch en la escala logit es P(1 − P), la del 2PL a²P(1 − P), y la del test, su suma', () => {
    const Rr = ajustarTRI(aInt8(O.Xd), { modelo: 'rasch' }), R2 = ajustarTRI(aInt8(O.Xd), { modelo: '2pl' }), thetas = [-2, -0.5, 0, 1, 2.5];
    const Ir = informacion(Rr, thetas), I2 = informacion(R2, thetas);
    thetas.forEach((t, k) => {
        Rr.items.forEach((it, j) => { const p = 1 / (1 + Math.exp(-(t - /** @type {number} */ (it.b[0])))); cerca(/** @type {number} */ (/** @type {number[]} */ (Ir.items[j])[k]), p * (1 - p), 1e-12, `Rasch, ítem ${j + 1}, θ = ${t}`); });
        R2.items.forEach((it, j) => { const p = 1 / (1 + Math.exp(-(it.a * t + /** @type {number} */ (it.d[0])))); cerca(/** @type {number} */ (/** @type {number[]} */ (I2.items[j])[k]), it.a * it.a * p * (1 - p), 1e-12, `2PL, ítem ${j + 1}, θ = ${t}`); });
        cerca(/** @type {number} */ (I2.test[k]), I2.items.reduce((s, f) => s + /** @type {number} */ (f[k]), 0), 1e-12, `test, θ = ${t}`);
    });
});

test('el DIF del oráculo: las tres log-verosimilitudes de cada ítem (regresión logística ordinal de SciPy), sus χ² y los R² de Nagelkerke', () => {
    const D = difRegresionLogistica(aInt8(O.dif.X), Int32Array.from(O.dif.grupo));
    assert.equal(D.G, 2); assert.deepEqual(D.tamanos, [350, 350]); assert.equal(D.n, 700);
    D.items.forEach((it, j) => {
        const e = O.dif.items[j];
        assert.ok(it.valido && it.convergio, `ítem ${j + 1}`);
        if (!it.valido) return;
        it.logVerosimilitud.forEach((ll, k) => cerca(ll, e.logVerosimilitud[k], 1e-7, `ítem ${j + 1}: log-verosimilitud de M${k + 1}`));
        cerca(it.chi2Total, e.chi2Total, 1e-6, `ítem ${j + 1}: χ² total`); cerca(it.chi2Uniforme, e.chi2Uniforme, 1e-6, 'uniforme'); cerca(it.chi2NoUniforme, e.chi2NoUniforme, 1e-6, 'no uniforme');
        cerca(it.pTotal, e.pTotal, 1e-9, `ítem ${j + 1}: p`);
        it.r2.forEach((r, k) => cerca(r, e.r2[k], 1e-9, `ítem ${j + 1}: R² de M${k + 1}`));
        cerca(it.deltaR2, e.deltaR2, 1e-9, `ítem ${j + 1}: ΔR²`);
    });
    // el ítem con DIF uniforme sembrado y el no uniforme, los de mayor χ²; y la clasificación, con la p de Holm
    const orden = D.items.map(it => (it.valido ? it.chi2Total : 0)).map((c, j) => [c, j]).sort((a, b) => b[0] - a[0]).map(x => x[1]);
    assert.deepEqual(orden.slice(0, 2), [2, 4]);
    const v = /** @type {any[]} */ (D.items);
    assert.equal(v[2].tipo, 'uniforme'); assert.equal(v[4].tipo, 'no uniforme');
    for (const it of v) assert.equal(it.clasificacion, !(it.pHolm < 0.05) || it.deltaR2 < CORTES_JODOIN_GIERL.moderado ? 'A' : it.deltaR2 < CORTES_JODOIN_GIERL.grande ? 'B' : 'C');
});

test('(2027.01.20) el DIF de una base real (oráculo): el grupo pequeño fuera, el total con las respuestas tal cual y la regla del 80 %, Holm', () => {
    const E = O.dif2, { X, categorias: cats } = prepararRespuestas(E.crudo.map((/** @type {(number | null)[]} */ f) => Float64Array.from(f, v => (v === null ? NaN : v))));
    assert.deepEqual(cats[3], [1, 2, 4, 5], 'el ítem sin el 3');
    /** @type {number[]} */ const avance = [];
    const D = difRegresionLogistica(X, Int32Array.from(E.grupo), { categorias: cats, alProgreso: h => avance.push(h) });
    assert.deepEqual(avance, [1, 2, 3, 4, 5, 6], 'el progreso, por ítem');
    assert.equal(D.n, E.n); assert.deepEqual(D.grupos, E.grupos); assert.deepEqual(D.tamanos, E.tamanos); assert.deepEqual(D.excluidos, E.excluidos);
    assert.equal(D.G, 3);
    D.items.forEach((it, j) => {
        const e = E.items[j];
        assert.ok(it.valido, `ítem ${j + 1}`);
        if (!it.valido) return;
        assert.equal(it.n, e.n, `ítem ${j + 1}: n`); assert.equal(it.K, e.K, `ítem ${j + 1}: K`);
        it.logVerosimilitud.forEach((ll, k) => cerca(ll, e.logVerosimilitud[k], 1e-7, `ítem ${j + 1}: log-verosimilitud de M${k + 1}`));
        cerca(it.chi2Total, e.chi2Total, 1e-6, `ítem ${j + 1}: χ² total`); cerca(it.chi2Uniforme, e.chi2Uniforme, 1e-6, 'uniforme'); cerca(it.chi2NoUniforme, e.chi2NoUniforme, 1e-6, 'no uniforme');
        cerca(it.pTotal, e.pTotal, 1e-9, `ítem ${j + 1}: p`); cerca(it.pUniforme, e.pUniforme, 1e-9, 'p uniforme'); cerca(it.pNoUniforme, e.pNoUniforme, 1e-9, 'p no uniforme');
        cerca(it.pHolm, e.pHolm, 1e-9, `ítem ${j + 1}: p de Holm (la de Python)`);
        cerca(it.deltaR2, e.deltaR2, 1e-9, `ítem ${j + 1}: ΔR²`);
        const tipo = it.pNoUniforme < 0.05 ? (it.pUniforme < 0.05 ? 'mixto' : 'no uniforme') : it.pUniforme < 0.05 ? 'uniforme' : 'no determinado';
        assert.equal(it.tipo, tipo, `ítem ${j + 1}: tipo`);
    });
    // los sesgos sembrados: uniforme en el ítem 2, no uniforme en el 3 (grupo 2), uniforme en el 6
    const v = /** @type {any[]} */ (D.items);
    assert.ok(v[1].pHolm < 0.05 && v[5].pHolm < 0.05 && v[2].pNoUniforme < 0.05, 'los ítems sembrados');
});

test('(2027.01.20) los grupos de menos de 10 personas quedan fuera; si queda uno solo, no hay DIF', () => {
    const items = [[1.2, [1.0, -1.0]], [1.0, [0.5, -0.5]], [1.5, [1.5, 0.0]], [0.9, [0.3, -1.2]], [1.1, [2.0, 0.5]]];
    const n = 300, X = simularGRM(n, /** @type {any} */ (items), 8);
    assert.equal(MINIMO_GRUPO_DIF, 10);
    for (const chico of [1, 2, 9]) {
        const D = difRegresionLogistica(X, Int32Array.from({ length: n }, (_, i) => (i < chico ? 2 : i % 2)));
        assert.deepEqual(D.excluidos, [{ grupo: 2, n: chico }]); assert.equal(D.G, 2); assert.equal(D.n, n - chico);
        assert.ok(D.items.every(it => it.valido && it.chi2Total > 0 && it.chi2NoUniforme >= 0), `con un grupo de ${chico}`);
    }
    const diez = difRegresionLogistica(X, Int32Array.from({ length: n }, (_, i) => (i < 10 ? 2 : i % 2)));
    assert.deepEqual(diez.excluidos, []); assert.equal(diez.G, 3);
    assert.throws(() => difRegresionLogistica(X, Int32Array.from({ length: n }, (_, i) => (i < 5 ? 1 : 0))), /dos grupos con 10 personas/);
});

test('(2027.01.20) la logística ordinal amortiguada: un grupo de una persona (indicador e interacción proporcionales) sigue ajustando', () => {
    const items = [[1.2, [1.0, -1.0]], [1.0, [0.5, -0.5]], [1.5, [1.5, 0.0]], [0.9, [0.3, -1.2]], [1.1, [2.0, 0.5]]];
    const n = 300, X = simularGRM(n, /** @type {any} */ (items), 8), grupo = Int32Array.from({ length: n }, (_, i) => (i < 1 ? 2 : i % 2));
    const tot = Array.from({ length: n }, (_, i) => X.reduce((s, x) => s + /** @type {number} */ (x[i]), 0)), m = tot.reduce((a, b) => a + b, 0) / n, tc = Float64Array.from(tot, t => t - m);
    const i1 = Float64Array.from(grupo, v => (v === 1 ? 1 : 0)), i2 = Float64Array.from(grupo, v => (v === 2 ? 1 : 0));
    const M2 = /** @type {NonNullable<ReturnType<typeof ajustarLogitOrdinal>>} */ (ajustarLogitOrdinal(/** @type {Int8Array} */ (X[0]), [tc, i1, i2]));
    const M3 = /** @type {NonNullable<ReturnType<typeof ajustarLogitOrdinal>>} */ (ajustarLogitOrdinal(/** @type {Int8Array} */ (X[0]), [tc, i1, i2, Float64Array.from(i1, (v, r) => v * /** @type {number} */ (tc[r])), Float64Array.from(i2, (v, r) => v * /** @type {number} */ (tc[r]))]));
    assert.ok(M3.logVerosimilitud >= M2.logVerosimilitud - 1e-9, `M3 (${M3.logVerosimilitud}) no por debajo de M2 (${M2.logVerosimilitud})`);
    assert.ok(M3.iteraciones > 1);
});

test('el DIF con un sesgo grande sembrado: clase C y a favor del grupo sembrado; los demás, A; tres grupos con 2 y 4 gl', () => {
    const items = [[1.2, [1.5, 0.3, -1.0]], [0.9, [1.0, -0.5, -2.0]], [1.6, [2.0, 0.0, -1.5]], [1.4, [0.5, -0.8, -2.5]], [1.1, [2.5, 1.0, -0.2]], [1.3, [0.9, -1.0]]];
    const grupo = Int32Array.from({ length: 900 }, (_, i) => i % 3);
    const X = simularGRM(900, /** @type {any} */ (items), 11, (i, j) => (j === 1 && grupo[i] === 2 ? 2.0 : 0));
    const D = difRegresionLogistica(X, grupo), v = /** @type {any[]} */ (D.items);
    assert.equal(D.G, 3);
    assert.equal(v[1].glTotal, 4); assert.equal(v[1].glUniforme, 2);
    assert.equal(v[1].clasificacion, 'C', `ΔR² = ${v[1].deltaR2}`);
    assert.ok(v[1].efectoGrupo[1] > 1 && Math.abs(v[1].efectoGrupo[0]) < 0.5, `efectos del grupo: ${v[1].efectoGrupo}`);
    assert.ok(v.filter((_, j) => j !== 1).every(it => it.clasificacion !== 'C'));
});

test('el DIF: el total con la regla del 80 %, los grupos con códigos salteados y los casos sin grupo', () => {
    const items = [[1.2, [1.0, -1.0]], [1.0, [0.5, -0.5]], [1.5, [1.5, 0.0]], [0.9, [0.3, -1.2]], [1.1, [2.0, 0.5]]];
    const n = 400, X = simularGRM(n, /** @type {any} */ (items), 3);
    const grupo = Int32Array.from({ length: n }, (_, i) => (i % 10 === 0 ? -1 : i % 2 === 0 ? 5 : 2));
    // perdidos: uno por persona en 1 de cada 4 (siguen con el 80 %), dos en 1 de cada 20 (quedan fuera)
    X.forEach((x, j) => { for (let i = 0; i < n; i++) if ((i % 4 === 1 && j === i % 5) || (i % 20 === 3 && j < 2)) x[i] = -1; });
    const D = difRegresionLogistica(X, grupo);
    assert.deepEqual(D.grupos, [2, 5]);
    const sinGrupo = Array.from(grupo).filter(g => g < 0).length, fuera = Array.from({ length: n }, (_, i) => i).filter(i => grupo[i] >= 0 && X.filter(x => x[i] < 0).length > 1).length;
    assert.equal(D.n, n - sinGrupo - fuera);
    assert.equal(D.tamanos.reduce((s, t) => s + t, 0), D.n);
    for (const it of D.items) assert.ok(it.n < D.n && it.n > 0.75 * D.n, `ítem ${it.item + 1}: n = ${it.n}`);
    assert.throws(() => difRegresionLogistica(X, new Int32Array(n)), /dos grupos/);
});

test('la logística ordinal: con dos categorías es la logística binaria del núcleo; los umbrales nulos, las proporciones', () => {
    const g = sfc32(5), normal = generadorNormales(g.siguiente), n = 300;
    const x1 = Float64Array.from({ length: n }, () => normal()), x2 = Float64Array.from({ length: n }, () => normal());
    const y = Int8Array.from(x1, (v, i) => (g.siguiente() < 1 / (1 + Math.exp(-(0.4 + 0.9 * v - 0.5 * /** @type {number} */ (x2[i])))) ? 1 : 0));
    const o = /** @type {NonNullable<ReturnType<typeof ajustarLogitOrdinal>>} */ (ajustarLogitOrdinal(y, [x1, x2])), b = /** @type {any} */ (ajustarMlg(y, [x1, x2], { familia: 'logistica' }));
    cerca(o.logVerosimilitud, b.logVerosimilitud, 1e-9, 'log-verosimilitud');
    cerca(-/** @type {number} */ (o.alfa[0]), b.beta[0], 1e-7, 'constante = −umbral');
    cerca(/** @type {number} */ (o.beta[0]), b.beta[1], 1e-7, 'pendiente 1'); cerca(/** @type {number} */ (o.beta[1]), b.beta[2], 1e-7, 'pendiente 2');
    cerca(/** @type {number} */ (o.ee[1]), b.ee[1], 1e-6, 'EE de la pendiente 1');
    cerca(logVerosimilitudNula(y, 2), b.logVerosimilitudNula, 1e-9, 'modelo nulo');
    const nulo = /** @type {NonNullable<ReturnType<typeof ajustarLogitOrdinal>>} */ (ajustarLogitOrdinal(Int8Array.from([0, 0, 1, 1, 1, 2, 2, 2, 2, 2]), []));
    cerca(/** @type {number} */ (nulo.alfa[0]), Math.log(2 / 8), 1e-9, 'α₁'); cerca(/** @type {number} */ (nulo.alfa[1]), Math.log(5 / 5), 1e-9, 'α₂');
    assert.equal(ajustarLogitOrdinal(Int8Array.from([0, 2, 2, 0]), [Float64Array.from([1, 2, 3, 4])]), null, 'una categoría sin casos');
    cerca(r2Nagelkerke(-50, -50, 100), 0, 1e-15, 'R² nulo');
});
