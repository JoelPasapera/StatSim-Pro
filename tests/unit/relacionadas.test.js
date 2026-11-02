// @ts-check
// Pruebas de las muestras relacionadas (core/stats/relacionadas.js y protocolo-relacionadas.js, 2027.01.17) contra el oráculo
// relacionadas_oraculo.py (SciPy y NumPy con otros algoritmos: ttest_rel, wilcoxon, friedmanchisquare, binomtest, mínimos
// cuadrados en formato largo, contrastes polinómicos, la ε de Box, comparación de modelos para el tipo III del mixto, Levene
// y la M de Box), y la regla del protocolo: qué prueba elige, cuándo corrige la esfericidad, qué pares compara.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tPareada, wilcoxon, anovaMedidasRepetidas, friedman, mcnemar, cochranQ, anovaMixta, comparacionesRelacionadas, paresRelacionadosHolm, contrastesOrtonormales, esfericidad } from '../../src/core/stats/relacionadas.js';
import { protocoloRelacionadas, elegirCorreccion, residuosAditivos, intervalosIntraSujetos, intervaloBiserialRangos, detectarDicotomicas, MAX_MEDIDAS } from '../../src/core/stats/protocolo-relacionadas.js';
import { intervaloDz, intervaloEta2 } from '../../src/core/stats/efectos.js';

const { datos: D, esperado: E } = JSON.parse(fs.readFileSync(new URL('../oracle/relacionadas_fixture.json', import.meta.url), 'utf8'));
/** @param {any} v */
const num = v => (v === 'inf' ? Infinity : v === '-inf' ? -Infinity : v === null ? NaN : v);
/** @param {number} x @param {any} ref @param {number} rel @param {string} que */
const cerca = (x, ref, rel, que) => {
    const r = num(ref);
    if (!Number.isFinite(r)) { assert.ok(Object.is(x, r) || (Number.isNaN(x) && Number.isNaN(r)), `${que}: ${x} frente a ${r} (oráculo)`); return; }
    assert.ok(Math.abs(x - r) <= rel * Math.max(Math.abs(r), 1e-300), `${que}: ${x} frente a ${r} (oráculo)`);
};
const PARES = ['pares_normal', 'pares_empates', 'pares_pequena', 'pares_todos_positivos'];
const RM = ['rm3', 'rm4_ar', 'rm5_n6', 'rm6_n4'];
const MIXTOS = ['mixto_2x3', 'mixto_3x4', 'mixto_2x2'];
/** Una tabla 2 × 2 de McNemar como dos columnas 0/1: 7 que siguen en 1, b que pasan de 1 a 0, c de 0 a 1 y 3 que siguen en 0. */
const columnasMcNemar = (/** @type {number} */ b, /** @type {number} */ c) => {
    /** @type {number[]} */ const x = [];
    /** @type {number[]} */ const y = [];
    const poner = (/** @type {number} */ veces, /** @type {number} */ a, /** @type {number} */ z) => { for (let i = 0; i < veces; i++) { x.push(a); y.push(z); } };
    poner(7, 1, 1); poner(b, 1, 0); poner(c, 0, 1); poner(3, 0, 0);
    return [x, y];
};

test('t para muestras relacionadas igual a scipy.stats.ttest_rel, con su intervalo, la dz y el de la dz por la t no central', () => {
    for (const c of PARES) {
        const [a, b] = D[c], r = tPareada(a, b), e = E.tpareada[c], ic = intervaloDz(r.t, r.n);
        cerca(r.t, e.t, 1e-12, `t ${c}`); cerca(r.pValor, e.p, 1e-12, `p ${c}`); cerca(r.mediaDiferencia, e.md, 1e-12, `media ${c}`);
        cerca(r.ic[0], e.ic[0], 1e-12, `IC ${c}`); cerca(r.ic[1], e.ic[1], 1e-12, `IC ${c}`); cerca(r.dz, e.dz, 1e-12, `dz ${c}`);
        cerca(ic.inferior, e.icDz[0], 1e-10, `IC dz ${c}`); cerca(ic.superior, e.icDz[1], 1e-10, `IC dz ${c}`);
    }
});

test('Wilcoxon igual a scipy.stats.wilcoxon (sin los ceros, con empates, sin continuidad), con T₊, T₋, la biserial y su intervalo', () => {
    for (const c of PARES) {
        const [a, b] = D[c], r = wilcoxon(a, b), e = E.wilcoxon[c];
        assert.equal(r.n, e.n); assert.equal(r.empates, e.empates); assert.equal(r.positivos, e.positivos);
        cerca(r.Tmas, e.Tmas, 1e-14, `T+ ${c}`); cerca(r.Tmenos, e.Tmenos, 1e-14, `T− ${c}`); cerca(r.T, e.T, 1e-14, `T ${c}`);
        cerca(r.z, e.z, 1e-12, `z ${c}`); cerca(r.pValor, e.p, 1e-12, `p ${c}`); cerca(r.rbc, e.rbc, 1e-14, `rbc ${c}`);
        const ic = intervaloBiserialRangos(r.rbc, r.n);
        if (e.icRbc === null) assert.equal(ic, null, `${c}: con todas las diferencias del mismo signo no hay intervalo`);
        else { assert.ok(ic); cerca(ic.inferior, e.icRbc[0], 1e-12, `IC rbc ${c}`); cerca(ic.superior, e.icRbc[1], 1e-12, `IC rbc ${c}`); }
    }
    assert.equal(wilcoxon([1, 2, 3], [1, 2, 3]).pValor, 1, 'sin diferencias no nulas, p = 1');
});

test('ANOVA de medidas repetidas igual al modelo aditivo en formato largo, con Mauchly, ε de Box y Huynh-Feldt, y el IC de η² parcial', () => {
    for (const c of RM) {
        const r = anovaMedidasRepetidas(D[c]), e = E.rm[c];
        for (const k of ['medidas', 'sujetos', 'error', 'total']) cerca(r.sc[/** @type {'medidas'} */ (k)], e.sc[k], 1e-12, `SC ${k} ${c}`);
        cerca(r.F, e.F, 1e-12, `F ${c}`); cerca(r.pValor, e.p, 1e-11, `p ${c}`); cerca(r.eta2p, e.eta2p, 1e-12, `η²p ${c}`); cerca(r.eta2G, e.eta2G, 1e-12, `η²G ${c}`);
        const ic = intervaloEta2(r.F, r.gl1, r.gl2); cerca(ic.inferior, e.icEta2p[0], 1e-9, `IC η²p ${c}`); cerca(ic.superior, e.icEta2p[1], 1e-9, `IC η²p ${c}`);
        assert.ok(r.esfericidad && r.correcciones);
        for (const k of ['W', 'chi2', 'gg', 'hf', 'lb']) cerca(r.esfericidad[/** @type {'W'} */ (k)], e.esfericidad[k], 1e-11, `${k} ${c}`);
        cerca(r.esfericidad.pValor, e.esfericidad.p, 1e-11, `p de Mauchly ${c}`);
        for (const [k, v] of Object.entries(e.pCorr)) cerca(/** @type {any} */ (r.correcciones)[k].pValor, v, 1e-11, `p ${k} ${c}`);
    }
    // con menos personas que contrastes la matriz es singular: W = 0 y su χ², indefinida
    const s = /** @type {NonNullable<ReturnType<typeof anovaMedidasRepetidas>['esfericidad']>} */ (anovaMedidasRepetidas(D.rm6_n4).esfericidad);
    assert.equal(s.W, 0); assert.ok(Number.isNaN(s.chi2) && Number.isNaN(s.pValor));
    assert.equal(anovaMedidasRepetidas([[1, 2], [3, 5], [2, 2.5]]).esfericidad, null, 'con dos medidas, la esfericidad no hace falta');
});

test('los contrastes de Helmert son ortonormales y ortogonales a la constante, y la esfericidad no depende de cuáles se usen', () => {
    for (const k of [2, 3, 5, 8]) {
        const C = contrastesOrtonormales(k);
        for (let a = 0; a < k - 1; a++) {
            let suma = 0; for (let i = 0; i < k; i++) suma += /** @type {number} */ (/** @type {number[]} */ (C[i])[a]);
            assert.ok(Math.abs(suma) < 1e-14);
            for (let b = 0; b < k - 1; b++) { let p = 0; for (let i = 0; i < k; i++) p += /** @type {number} */ (/** @type {number[]} */ (C[i])[a]) * /** @type {number} */ (/** @type {number[]} */ (C[i])[b]); assert.ok(Math.abs(p - (a === b ? 1 : 0)) < 1e-14); }
        }
    }
    assert.equal(esfericidad([[2]], 10, 11, 1), null);
});

test('Friedman igual a scipy.stats.friedmanchisquare (con empates), la W de Kendall y los pares por rangos medios con Holm', () => {
    for (const c of ['rm3', 'rm4_ar', 'friedman_empates']) {
        const r = friedman(D[c]), e = E.friedman[c];
        cerca(r.chi2, e.chi2, 1e-12, `χ² ${c}`); cerca(r.pValor, e.p, 1e-12, `p ${c}`); cerca(r.W, e.W, 1e-12, `W ${c}`);
        r.rangosMedios.forEach((v, i) => cerca(v, e.rangos[i], 1e-14, `rango ${c}`));
        paresRelacionadosHolm(D[c], 'friedman').forEach((q, i) => { cerca(q.estadistico, e.pares.z[i], 1e-12, `z ${c}`); cerca(q.pValor, e.pares.p[i], 1e-12, `p ${c}`); cerca(q.pHolm, e.pares.holm[i], 1e-12, `Holm ${c}`); });
    }
    const todosIguales = friedman([[2, 2, 2], [5, 5, 5], [1, 1, 1]]);
    assert.equal(todosIguales.chi2, 0); assert.equal(todosIguales.pValor, 1);
});

test('McNemar por la binomial exacta (scipy.stats.binomtest), la χ² de Edwards, la razón de odds con Clopper-Pearson y la g de Cohen', () => {
    D.mcnemar.forEach((/** @type {[number, number]} */ [b, c], /** @type {number} */ i) => {
        const [x, y] = columnasMcNemar(b, c), r = mcnemar(x, y), e = E.mcnemar[i];
        assert.equal(r.n10, b); assert.equal(r.n01, c);
        cerca(r.pValor, e.p, 1e-12, `p ${b}/${c}`); cerca(r.chi2, e.chi2, 1e-14, `χ² ${b}/${c}`); cerca(r.oddsRatio, e.or, 1e-14, `OR ${b}/${c}`);
        cerca(r.icOddsRatio[0], e.icOr[0], 1e-11, `IC OR ${b}/${c}`); cerca(r.icOddsRatio[1], e.icOr[1], 1e-11, `IC OR ${b}/${c}`); cerca(r.gCohen, e.g, 1e-14, `g ${b}/${c}`);
    });
});

test('la Q de Cochran (otra escritura de la fórmula en el oráculo) y sus pares con Holm', () => {
    for (const c of ['cochran3', 'cochran4']) {
        const r = cochranQ(D[c]), e = E.cochran[c];
        cerca(r.Q, e.Q, 1e-13, `Q ${c}`); cerca(r.pValor, e.p, 1e-12, `p ${c}`); cerca(r.eta2Q, e.eta2Q, 1e-13, `η²Q ${c}`);
        paresRelacionadosHolm(D[c], 'cochran').forEach((q, i) => { cerca(q.estadistico, e.pares.z[i], 1e-12, `z ${c}`); cerca(q.pValor, e.pares.p[i], 1e-12, `p ${c}`); cerca(q.pHolm, e.pares.holm[i], 1e-12, `Holm ${c}`); });
    }
    const sinCambios = cochranQ([[1, 1, 1], [0, 0, 0], [1, 1, 1]]);
    assert.equal(sinCambios.Q, 0); assert.equal(sinCambios.pValor, 1);
});

test('pares de medidas: t pareada y Wilcoxon de cada par (scipy) con Holm; McNemar de cada par igual a la de dos medidas', () => {
    for (const c of RM) {
        const ep = E.paresRm[c], ht = paresRelacionadosHolm(D[c], 'tpareada'), hw = paresRelacionadosHolm(D[c], 'wilcoxon');
        ht.forEach((q, i) => { cerca(q.estadistico, ep.t[i], 1e-12, `t ${c}`); cerca(q.pValor, ep.pt[i], 1e-11, `p t ${c}`); cerca(q.pHolm, ep.holmT[i], 1e-11, `Holm t ${c}`); });
        hw.forEach((q, i) => { cerca(q.estadistico, ep.zw[i], 1e-12, `z ${c}`); cerca(q.pValor, ep.pw[i], 1e-12, `p W ${c}`); cerca(q.pHolm, ep.holmW[i], 1e-12, `Holm W ${c}`); });
        assert.deepEqual(ht.map(q => [q.i, q.j]), ht.map((_, a) => /** @type {[number, number]} */ ([[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [1, 2], [1, 3], [1, 4], [1, 5], [2, 3], [2, 4], [2, 5], [3, 4], [3, 5], [4, 5]].filter(([i, j]) => i < D[c][0].length && j < D[c][0].length)[a])));
    }
    const Y = D.cochran3, m = comparacionesRelacionadas(Y, 'mcnemar');
    // el par (i, j) es el cambio de i a j: la diferencia de proporciones pⱼ − pᵢ
    m.forEach(q => {
        const r = mcnemar(Y.map((/** @type {number[]} */ f) => f[q.i]), Y.map((/** @type {number[]} */ f) => f[q.j]));
        assert.equal(q.pValor, r.pValor);
        const pi = Y.reduce((/** @type {number} */ s, /** @type {number[]} */ f) => s + /** @type {number} */ (f[q.i]), 0) / Y.length, pj = Y.reduce((/** @type {number} */ s, /** @type {number[]} */ f) => s + /** @type {number} */ (f[q.j]), 0) / Y.length;
        assert.ok(Math.abs(q.estadistico - (pj - pi)) < 1e-15 && q.efecto === q.estadistico);
    });
});

test('ANOVA mixto de tipo III igual a la comparación de modelos sobre contrastes polinómicos, con Levene, la M de Box y su F', () => {
    for (const c of MIXTOS) {
        const r = anovaMixta(D[c].Y, D[c].g), e = E.mixta[c];
        cerca(r.grupo.sc, e.grupo.sc, 1e-11, `SC grupo ${c}`); cerca(r.grupo.F, e.grupo.F, 1e-11, `F grupo ${c}`); cerca(r.grupo.pValor, e.grupo.p, 1e-11, `p grupo ${c}`);
        cerca(r.grupo.eta2p, e.grupo.eta2p, 1e-11, `η²p grupo ${c}`); cerca(r.grupo.eta2G, e.grupo.eta2G, 1e-11, `η²G grupo ${c}`);
        for (const k of ['medidas', 'interaccion']) {
            const a = /** @type {any} */ (r)[k], b = e[k];
            cerca(a.sc, b.sc, 1e-12, `SC ${k} ${c}`); cerca(a.F, b.F, 1e-12, `F ${k} ${c}`); cerca(a.pValor, b.p, 1e-11, `p ${k} ${c}`);
            cerca(a.eta2p, b.eta2p, 1e-12, `η²p ${k} ${c}`); cerca(a.eta2G, b.eta2G, 1e-12, `η²G ${k} ${c}`);
            if (b.pCorr) for (const [q, v] of Object.entries(b.pCorr)) cerca(a.correcciones[q].pValor, v, 1e-11, `p ${q} ${k} ${c}`);
        }
        cerca(r.error.sujetosEnGrupos, e.scSujetosEnGrupos, 1e-12, `SC sujetos ${c}`); cerca(r.error.intra, e.scError, 1e-12, `SC error ${c}`);
        if (e.esfericidad) { assert.ok(r.esfericidad); for (const k of ['W', 'chi2', 'gg', 'hf', 'lb']) cerca(/** @type {any} */ (r.esfericidad)[k], e.esfericidad[k], 1e-11, `${k} ${c}`); cerca(r.esfericidad.pValor, e.esfericidad.p, 1e-11, `p Mauchly ${c}`); }
        r.leveneMedidas.forEach((l, i) => cerca(l.pValor, e.levene[i], 1e-11, `Levene ${i} ${c}`));
        assert.ok(r.box);
        for (const k of ['M', 'F', 'gl1', 'gl2', 'chi2', 'pChi2']) cerca(/** @type {any} */ (r.box)[k], e.box[k], 1e-10, `Box ${k} ${c}`);
        cerca(r.box.pValor, e.box.p, 1e-8, `Box p ${c}`);   // una F con un gl₂ fraccionario y grande: la beta incompleta, con 10 cifras
    }
    assert.ok(E.boxMonteCarlo > 0.04 && E.boxMonteCarlo < 0.06, 'la F de la M de Box está calibrada bajo la hipótesis nula (Monte Carlo del oráculo)');
});

test('los residuos del modelo aditivo (también con grupos) y los intervalos intra sujetos de Cousineau-Morey', () => {
    residuosAditivos(D.rm3).forEach((v, i) => assert.ok(Math.abs(v - E.residuos.rm3[i]) < 1e-11, `residuo ${i}`));
    residuosAditivos(D.mixto_3x4.Y, D.mixto_3x4.g).forEach((v, i) => assert.ok(Math.abs(v - E.residuos.mixto_3x4[i]) < 1e-11, `residuo mixto ${i}`));
    const p = intervalosIntraSujetos(D.rm3);
    p.forEach((q, j) => { cerca(q.media, E.perfil.rm3.media[j], 1e-13, 'media'); cerca(q.inferior, E.perfil.rm3.inferior[j], 1e-12, 'inferior'); cerca(q.superior, E.perfil.rm3.superior[j], 1e-12, 'superior'); });
    for (let a = 0; a < 3; a++) {
        const Yg = D.mixto_3x4.Y.filter((/** @type {number[]} */ _, /** @type {number} */ i) => D.mixto_3x4.g[i] === a);
        intervalosIntraSujetos(Yg).forEach((q, j) => { cerca(q.inferior, E.perfil.mixto_3x4[a].inferior[j], 1e-12, `inferior grupo ${a}`); cerca(q.superior, E.perfil.mixto_3x4[a].superior[j], 1e-12, `superior grupo ${a}`); });
    }
});

test('el protocolo: dos medidas → t pareada con diferencias normales y Wilcoxon si no, siempre con la otra como sensibilidad', () => {
    const [a, b] = D.pares_normal, P = protocoloRelacionadas(a.map((/** @type {number} */ x, /** @type {number} */ i) => [x, b[i]]));
    assert.equal(P.diseno, 'dos');
    assert.equal(P.prueba, P.normalidad && P.normalidad.normal ? 't-pareada' : 'wilcoxon');
    assert.ok(P.sensibilidad && P.sensibilidad.prueba === (P.prueba === 't-pareada' ? 'wilcoxon' : 't-pareada'));
    // diferencias muy asimétricas → Wilcoxon
    const x = Array.from({ length: 30 }, (_, i) => 10 + (i % 7)), y = x.map((v, i) => v - (i < 26 ? 0.2 * (i % 3) : 15 + i));
    const Q = protocoloRelacionadas(x.map((v, i) => [v, /** @type {number} */ (y[i])]));
    assert.equal(Q.prueba, 'wilcoxon'); assert.equal(Q.rama, 'noparametrica'); assert.ok(Q.efecto && Q.efecto.clave === 'rbc');
    assert.ok(Q.avisos.some(t => /misma puntuación/.test(t)), 'avisa de los empates que Wilcoxon deja fuera');
});

test('el protocolo: tres o más medidas → ANOVA de medidas repetidas (con la corrección que toca) o Friedman, y pares con Holm', () => {
    const P = protocoloRelacionadas(D.rm4_ar), r = anovaMedidasRepetidas(D.rm4_ar);
    assert.equal(P.diseno, 'varias');
    assert.equal(P.correccion, elegirCorreccion(r.esfericidad));
    if (P.prueba === 'anova-rm') {
        const g = /** @type {any} */ (P.global);
        const esperado = P.correccion === 'ninguna' ? r.pValor : /** @type {any} */ (r.correcciones)[P.correccion].pValor;
        assert.equal(g.prueba.pValor, esperado, 'el p informado es el de la corrección elegida');
        if (P.significativa) assert.equal(P.postHoc && P.postHoc.metodo, 'tpareada');
    }
    // residuos muy asimétricos → Friedman, con Wilcoxon por pares
    const Y = Array.from({ length: 40 }, (_, i) => { const base = (i * 37) % 11; return [base, base + 1 + (i % 5 === 0 ? 30 : 0), base + 2 + (i % 4 === 0 ? 25 : 0)]; });
    const F = protocoloRelacionadas(Y);
    assert.equal(F.prueba, 'friedman'); assert.equal(F.sensibilidad && F.sensibilidad.prueba, 'anova-rm');
    if (F.significativa) assert.equal(F.postHoc && F.postHoc.metodo, 'wilcoxon');
});

test('la regla de la esfericidad: sin corrección si Mauchly no rechaza; Huynh-Feldt con ε_GG > .75; Greenhouse-Geisser si no', () => {
    const base = { W: 0.5, chi2: 9, gl: 2, gg: 0.8, hf: 0.9, lb: 0.5 };
    assert.equal(elegirCorreccion(null), 'ninguna');
    assert.equal(elegirCorreccion({ ...base, pValor: 0.2 }), 'ninguna');
    assert.equal(elegirCorreccion({ ...base, pValor: 0.01 }), 'hf');
    assert.equal(elegirCorreccion({ ...base, pValor: 0.01, gg: 0.7 }), 'gg');
    assert.equal(elegirCorreccion({ ...base, pValor: NaN }), 'hf', 'sin poder contrastarla (W = 0), se corrige igual');
    assert.equal(elegirCorreccion({ ...base, pValor: 0.01, hf: NaN }), 'gg', 'sin Huynh-Feldt (pocos casos), Greenhouse-Geisser');
});

test('el protocolo: medidas dicotómicas → McNemar (dos) o Cochran con McNemar por pares (tres o más), codificando 1/2 como 0/1', () => {
    assert.deepEqual(detectarDicotomicas([[1, 2], [2, 2], [1, 1]]), { cero: 1, uno: 2 });
    assert.equal(detectarDicotomicas([[1, 2], [3, 2]]), null);
    const [x, y] = columnasMcNemar(12, 4), P = protocoloRelacionadas(x.map((v, i) => [v + 1, /** @type {number} */ (y[i]) + 1]));
    // el cambio de la primera a la segunda: n10 son los 4 que pasan de 0 a 1 y n01 los 12 que pasan de 1 a 0
    assert.equal(P.prueba, 'mcnemar'); assert.equal(/** @type {any} */ (P.global).n10, 4); assert.equal(/** @type {any} */ (P.global).n01, 12);
    assert.ok(P.efecto && Math.abs(P.efecto.valor - 4 / 12) < 1e-15);
    const C = protocoloRelacionadas(D.cochran3);
    assert.equal(C.prueba, 'cochran');
    if (C.significativa) assert.equal(C.postHoc && C.postHoc.metodo, 'mcnemar');
});

test('el protocolo: el diseño mixto, con los efectos simples cuando la interacción es significativa', () => {
    const P = /** @type {any} */ (protocoloRelacionadas(D.mixto_2x3.Y, { grupos: D.mixto_2x3.g }));
    assert.equal(P.diseno, 'mixto'); assert.equal(P.prueba, 'anova-mixta');
    assert.ok(P.efectos.interaccion.prueba.pValor < 0.05, 'en los datos del oráculo la interacción es significativa');
    assert.equal(P.simples.medidasEnGrupos.length, 2); assert.equal(P.simples.gruposEnMedidas.length, 3);
    assert.equal(P.postHoc, null, 'con interacción, los efectos simples en lugar de los pares de las medidas');
    assert.equal(P.perfilPorGrupo.length, 2);
    const ic = P.efectos.interaccion.eta2p;
    assert.ok(ic.inferior < ic.valor && ic.valor < ic.superior);
});

test('el protocolo rechaza lo que no puede analizar', () => {
    assert.throws(() => protocoloRelacionadas([[1], [2], [3]]), /dos medidas/);
    assert.throws(() => protocoloRelacionadas([[1, 2], [2, 3]]), /al menos 3 personas/);
    assert.throws(() => protocoloRelacionadas(Array.from({ length: 5 }, (_, i) => Array.from({ length: MAX_MEDIDAS + 1 }, (_, j) => i + j))), /hasta/);
    assert.throws(() => protocoloRelacionadas([[1, 2], [2, 3], [3, 5], [1, 1], [4, 4]], { grupos: [0, 0, 0, 1, 1] }), /Cada grupo/);
});

test('(2027.01.20) los datos degenerados: sin error, un error claro (antes, F de 10¹⁶ que colgaba la página o «F(NaN, NaN)»)', () => {
    const t0 = Date.now();
    // todas cambian exactamente lo mismo (con decimales: el redondeo deja residuos de 10⁻¹⁶)
    const aditivo = Array.from({ length: 10 }, (_, i) => [0, 1, 2].map(j => 0.1 * i + 0.7 * j));
    assert.throws(() => protocoloRelacionadas(aditivo), /Todas las personas cambian exactamente lo mismo entre las medidas/);
    assert.equal(anovaMedidasRepetidas(aditivo).sc.error, 0, 'la SC del error del redondeo es 0');
    assert.equal(anovaMedidasRepetidas(aditivo).esfericidad, null);
    // nadie cambia
    assert.throws(() => protocoloRelacionadas(Array.from({ length: 10 }, () => [5, 5, 5])), /Ninguna persona cambia entre las medidas/);
    // en el diseño mixto, igual
    assert.throws(() => protocoloRelacionadas(Array.from({ length: 12 }, (_, i) => [0, 1, 2].map(j => 0.3 * i + 0.7 * j)), { grupos: Array.from({ length: 12 }, (_, i) => i % 2) }), /^Error: Dentro de cada grupo, todas las personas cambian exactamente lo mismo/);
    // dos medidas con el mismo cambio en todos (con decimales): t infinita, no 10¹⁵
    const t = tPareada(Array.from({ length: 10 }, (_, i) => 0.1 * i + 0.3), Array.from({ length: 10 }, (_, i) => 0.1 * i));
    assert.equal(t.t, Infinity); assert.equal(t.dz, Infinity); assert.equal(t.pValor, 0);
    const P = protocoloRelacionadas(Array.from({ length: 10 }, (_, i) => [0.1 * i, 0.1 * i + 0.3]));
    assert.ok(P.avisos.some(a => /la diferencia es perfecta/.test(a)));
    assert.ok(Date.now() - t0 < 3000, `sin colgarse: ${Date.now() - t0} ms`);
});

test('(2027.01.20) Mauchly con la matriz singular (una diferencia que no varía): W = 0, χ² = ∞, p = 0 y un aviso que lo dice', () => {
    const Y = Array.from({ length: 12 }, (_, i) => { const a = (i * 7) % 5 + i * 0.3; return [a, a + 1, a + ((i * 3) % 4)]; });
    const E = /** @type {any} */ (anovaMedidasRepetidas(Y).esfericidad);
    assert.equal(E.singular, true); assert.equal(E.W, 0); assert.equal(E.chi2, Infinity); assert.equal(E.pValor, 0);
    const P = protocoloRelacionadas(Y);
    assert.ok(P.avisos.some(a => /la matriz de covarianzas es singular/.test(a)), P.avisos.join(' | '));
    assert.ok(!P.avisos.some(a => /menos personas/.test(a)), 'no es por tener pocas personas');
    // con menos personas que medidas, el aviso de siempre (con los números)
    const Q = protocoloRelacionadas([[1, 2, 4, 3], [2, 4, 3, 5], [3, 3, 6, 4]]);
    assert.ok(Q.avisos.some(a => /^Con menos personas \(3\) que medidas \(4\), la esfericidad no se puede contrastar/.test(a)), Q.avisos.join(' | '));
    // y una matriz no singular sigue igual
    assert.equal(/** @type {any} */ (anovaMedidasRepetidas(D.rm4_ar).esfericidad).singular, false);
});
