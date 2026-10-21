// @ts-check
// Oráculo de la inferencia del Analizador (2026.12.10). Hasta esta versión ninguna prueba ejercitaba los valores p de la
// comparación de grupos, la regresión (MCO, logística, Poisson, ANCOVA, MANOVA), la matriz de correlaciones, el
// metaanálisis, la comparación de modelos del SEM ni las funciones del informe y las gráficas: lo mostró una ejecución en
// sombra de toda la batería. Compara con tests/oracle/inferencia_fixture.json (SciPy e implementaciones independientes:
// Newton-Raphson, IRLS, Wilks, DerSimonian-Laird), que regenera inferencia_oraculo.py.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { datos: D, esperado: E } = JSON.parse(fs.readFileSync(new URL('../oracle/inferencia_fixture.json', import.meta.url), 'utf8'));
/** @type {any} */ let A, CG, RM, MA, EW, SC, SEM, SEMUI, nucleo;
before(async () => {
    A = (await import('../../src/analizador/estadistica.js')).AnalizadorEstadistico;
    CG = (await import('../../src/analizador/comparacion-grupos.js')).ComparacionGrupos;
    RM = (await import('../../src/analizador/regresion.js')).RegresionMultiple;
    MA = (await import('../../src/buscador/meta-analisis.js')).MetaAnalisis;
    EW = (await import('../../src/analizador/exportador-word.js')).ExportadorWord;
    SC = (await import('../../src/analizador/graficas.js')).ScientificCharts.prototype;
    SEM = (await import('../../src/analizador/sem-motor.js')).SEM;
    SEMUI = (await import('../../src/analizador/sem-ui.js')).SEMUI;
    nucleo = await import('../../src/core/stats/numerico.js');
});
/** @param {number} x @param {number} ref @param {number} rel @param {string} que */
const cerca = (x, ref, rel, que) => assert.ok(Math.abs(x - ref) <= rel * Math.abs(ref), `${que}: ${x} frente a ${ref} (oráculo)`);
const cargarRegresion = () => A.cargarDatos(D.y.map((/** @type {number} */ _, /** @type {number} */ i) => ({ y: D.y[i], x1: D.x1[i], x2: D.x2[i], yb: D.y01[i], cuenta: D.cuenta[i], grupo: D.grupo[i], y2: D.y2[i] })));
/** @param {any} R @param {any} e @param {number} rel @param {string} que @param {boolean} conIC */
const coeficientes = (R, e, rel, que, conIC = true) => R.coefs.forEach((/** @type {any} */ c, /** @type {number} */ j) => {
    cerca(c.b, e.b[j], rel, `${que} b${j}`); cerca(c.se, e.se[j], rel, `${que} ee${j}`); cerca(c.pValor, e.p[j], rel, `${que} p${j}`);
    if (conIC) { cerca(c.ic[0], e.ic[j][0], rel, `${que} IC inferior ${j}`); cerca(c.ic[1], e.ic[j][1], rel, `${que} IC superior ${j}`); }
});

test('comparación de grupos: t de Student y de Welch, U de Mann-Whitney (empates, sin continuidad: SPSS), ANOVA y Kruskal-Wallis', () => {
    const ts = CG.tStudent(D.a, D.b), tw = CG.tWelch(D.a, D.b), mw = CG.mannWhitneyU(D.a, D.b), an = CG.anova([D.a, D.b, D.c]), kw = CG.kruskalWallis([D.a, D.b, D.c]);
    cerca(ts.estadistico, E.tStudent.t, 1e-10, 't'); assert.equal(ts.gl, E.tStudent.gl); cerca(ts.pValor, E.tStudent.p, 1e-9, 'p de Student');
    cerca(tw.estadistico, E.tWelch.t, 1e-10, 't de Welch'); cerca(tw.gl, E.tWelch.gl, 1e-10, 'gl de Welch'); cerca(tw.pValor, E.tWelch.p, 1e-9, 'p de Welch');
    cerca(mw.estadistico, E.mannWhitney.U, 1e-12, 'U'); cerca(mw.pValor, E.mannWhitney.p, 1e-9, 'p de Mann-Whitney');
    cerca(an.estadistico, E.anova.F, 1e-10, 'F'); assert.deepEqual(an.gl, [E.anova.gl1, E.anova.gl2]); cerca(an.pValor, E.anova.p, 1e-9, 'p del ANOVA');
    cerca(kw.estadistico, E.kruskal.H, 1e-10, 'H'); assert.equal(kw.gl, E.kruskal.gl); cerca(kw.pValor, E.kruskal.p, 1e-9, 'p de Kruskal-Wallis');
});

test('regresión MCO: coeficientes, errores típicos, valores p, intervalos (t crítica), R² y F, también por sus rutas con datos cargados', () => {
    const R = RM._olsFull(D.y, [D.x1, D.x2], ['x1', 'x2']);
    coeficientes(R, E.ols, 1e-9, 'MCO'); cerca(R.R2, E.ols.R2, 1e-10, 'R²'); cerca(R.F, E.ols.F, 1e-10, 'F'); cerca(R.pF, E.ols.pF, 1e-9, 'p de F');
    cargarRegresion();
    for (const [que, Q] of [['regresion()', RM.regresion('y', ['x1', 'x2'], 'y', ['x1', 'x2'])], ['regresionAvanzada()', RM.regresionAvanzada('y', ['x1', 'x2'], 'y', ['x1', 'x2'])]]) {
        assert.ok(!Q.error, `${que}: ${Q.error}`); coeficientes(Q, E.ols, 1e-9, que); cerca(Q.pF, E.ols.pF, 1e-9, `${que} p de F`);
    }
});

test('logística simple y múltiple y Poisson (Wald), también por regresionAvanzada()', () => {
    const L = RM._logistica(D.x1, D.y01);
    cerca(L.b0, E.logistica.b0, 1e-7, 'b0'); cerca(L.b1, E.logistica.b1, 1e-7, 'b1'); cerca(L.se, E.logistica.se, 1e-7, 'ee'); cerca(L.z, E.logistica.z, 1e-7, 'z'); cerca(L.pValor, E.logistica.p, 1e-7, 'p');
    coeficientes(RM._logisticaK(D.y01, [D.x1, D.x2], ['x1', 'x2']), E.logisticaK, 1e-7, 'logística');
    coeficientes(RM._poissonK(D.cuenta, [D.x1, D.x2], ['x1', 'x2']), E.poissonK, 1e-7, 'Poisson');
    cargarRegresion();
    coeficientes(RM.regresionAvanzada('yb', ['x1', 'x2'], 'yb', ['x1', 'x2']), E.logisticaK, 1e-7, 'avanzada logística');
    coeficientes(RM.regresionAvanzada('cuenta', ['x1', 'x2'], 'cuenta', ['x1', 'x2'], { poisson: true }), E.poissonK, 1e-7, 'avanzada Poisson');
});

test('matriz de correlaciones (con Holm), ANCOVA (factor, covariable y homogeneidad de pendientes) y MANOVA (Wilks)', () => {
    cargarRegresion();
    const M = RM.matrizCorrelaciones(['y', 'x1', 'x2'], ['y', 'x1', 'x2']);
    M.pares.forEach((/** @type {any} */ p, /** @type {number} */ i) => { cerca(p.r, E.matriz.r[i], 1e-10, `r ${i}`); cerca(p.pValor, E.matriz.p[i], 1e-9, `p ${i}`); cerca(p.pHolm, E.matriz.pHolm[i], 1e-9, `Holm ${i}`); });
    const C = RM.ancova('grupo', 'y', 'x1');
    cerca(C.pFactor, E.ancova.pFactor, 1e-9, 'ANCOVA factor'); cerca(C.pCov, E.ancova.pCov, 1e-9, 'ANCOVA covariable'); cerca(C.pendientes.pValor, E.ancova.pPendientes, 1e-9, 'homogeneidad de pendientes');
    const V = RM.manova('grupo', ['y', 'y2']);
    cerca(V.lambda, E.manova.lambda, 1e-10, 'Λ de Wilks'); cerca(V.pValor, E.manova.p, 1e-9, 'p de MANOVA');
});

// (2026.12.17) el p del respaldo del Word (antes, _pFisher, con la normal) y la potencia (antes, _potencia del Word) son ahora
// los del núcleo único, que verifica tests/unit/correlacion-inferencia.test.js con todas sus vistas
test('metaanálisis (DerSimonian-Laird) y el mapa de correlaciones (t con n − 2 gl)', () => {
    const R = MA.calcular(D.estudios);
    cerca(R.Q, E.meta.Q, 1e-10, 'Q'); cerca(R.tau2, E.meta.tau2, 1e-10, 'τ²'); cerca(R.I2, E.meta.I2, 1e-10, 'I²'); cerca(R.rComb, E.meta.rComb, 1e-10, 'r combinada'); cerca(R.p, E.meta.p, 1e-8, 'p del metaanálisis');
    for (const [r, n, p] of E.pCorrelacion) cerca(SC._pCorrelacion.call(SC, r, n), p, 1e-9, `mapa de correlaciones r = ${r}, n = ${n}`);
});

test('fiabilidad: α de Cronbach y su intervalo de Feldt (ninguna prueba lo verificaba: invertido, nada avisaba)', async () => {
    const { Fiabilidad } = await import('../../src/analizador/fiabilidad.js');
    const filas = D.items.i1.map((/** @type {number} */ _, /** @type {number} */ k) => ({ i1: D.items.i1[k], i2: D.items.i2[k], i3: D.items.i3[k], i4: D.items.i4[k], i5: D.items.i5[k] }));
    const R = Fiabilidad.analizarGrupo(filas, { nombre: 'Escala', items: ['i1', 'i2', 'i3', 'i4', 'i5'] });
    cerca(R.alfa, E.fiabilidad.alfa, 1e-10, 'α');
    cerca(R.icAlfa.inferior, E.fiabilidad.inferior, 1e-9, 'IC inferior de Feldt'); cerca(R.icAlfa.superior, E.fiabilidad.superior, 1e-9, 'IC superior de Feldt');
});

test('descriptivos por grupo de la comparación de grupos: media, DE y mediana (la mediana no la verificaba ninguna prueba)', () => {
    A.cargarDatos([...D.a.map((/** @type {number} */ v) => ({ g: 'A', v })), ...D.b.map((/** @type {number} */ v) => ({ g: 'B', v })), ...D.c.map((/** @type {number} */ v) => ({ g: 'C', v }))]);
    const R = CG.analizar('g', 'v', 'Grupo', 'Valor');
    for (const [nombre, e] of Object.entries(E.descriptivosGrupos)) {
        const g = R.grupos.find((/** @type {any} */ x) => x.nombre === nombre);
        assert.ok(g, `grupo ${nombre}`); cerca(g.media, e.media, 1e-12, `media de ${nombre}`); cerca(g.de, e.de, 1e-12, `DE de ${nombre}`); cerca(g.mediana, e.mediana, 1e-12, `mediana de ${nombre}`);
    }
});

test('matriz de correlaciones con datos no normales: la ρ de Spearman, su p y Holm (rama que ninguna prueba recorría)', () => {
    A.cargarDatos(D.y.map((/** @type {number} */ _, /** @type {number} */ i) => ({ y: D.y[i], sk1: D.sk1[i], sk2: D.sk2[i] })));
    const M = RM.matrizCorrelaciones(['sk1', 'sk2', 'y'], ['sk1', 'sk2', 'y']);
    M.pares.forEach((/** @type {any} */ p, /** @type {number} */ i) => {
        assert.equal(p.metodo, 'Spearman', `par ${i}`);
        cerca(p.r, E.matrizSpearman.r[i], 1e-10, `ρ ${i}`); cerca(p.pValor, E.matrizSpearman.p[i], 1e-9, `p ${i}`); cerca(p.pHolm, E.matrizSpearman.pHolm[i], 1e-9, `Holm ${i}`);
    });
});

test('una sola convención en todo el programa, la de SPSS, fijada contra SciPy: Levene centrada en la media, Mann-Whitney sin continuidad y el ε² de Kruskal-Wallis', () => {
    const C = E.convenciones;
    // Levene centrada en la media, en la pestaña de grupos (y el Word) y en la vista principal (hasta la 2026.12.14, en la mediana)
    cerca(CG.levene([D.a, D.b]).pValor, C.leveneMedia2, 1e-9, 'pestaña: Levene, 2 grupos'); cerca(CG.levene([D.a, D.b, D.c]).pValor, C.leveneMedia3, 1e-9, 'pestaña: Levene, 3 grupos');
    const lv = A.pruebaLevene([D.a, D.b]); assert.equal(lv.centro, 'media');
    cerca(lv.pValor, C.leveneMedia2, 1e-9, 'vista principal: Levene, 2 grupos'); cerca(A.pruebaLevene([D.a, D.b, D.c]).pValor, C.leveneMedia3, 1e-9, 'vista principal: Levene, 3 grupos');
    // Mann-Whitney sin corrección por continuidad en las dos vistas (hasta la 2026.12.14 la pestaña la aplicaba), también en la cola profunda
    const sep1 = Array.from({ length: 20 }, (_, i) => i + 1), sep2 = Array.from({ length: 20 }, (_, i) => i + 21);
    /** @type {Array<[string, (x: number[], y: number[]) => number]>} */
    const vistas = [['pestaña', (x, y) => CG.mannWhitneyU(x, y).pValor], ['vista principal', (x, y) => A.pruebaMannWhitney(x, y).pValor]];
    for (const [que, p] of vistas) { cerca(p(D.a, D.b), C.mwSinContinuidad, 1e-9, `${que}: Mann-Whitney`); cerca(p(sep1, sep2), C.mwColaSinContinuidad, 1e-9, `${que}: Mann-Whitney en la cola profunda`); }
    // ε² de Kruskal-Wallis = H/(n − 1) en las dos vistas (la pestaña calculaba η²_H con su nombre)
    cerca(CG.kruskalWallis([D.a, D.b, D.c]).efecto.valor, C.epsilon2Kruskal, 1e-10, 'pestaña: ε²');
    // los tamaños del efecto, en las dos vistas (el oráculo solo comprobaba F, gl y p)
    cerca(CG.tStudent(D.a, D.b).efecto.valor, C.dCohen, 1e-12, 'pestaña: d de Cohen'); cerca(A.calcularCohenD(D.a, D.b).d, C.dCohen, 1e-12, 'vista principal: d de Cohen');
    cerca(CG.anova([D.a, D.b, D.c]).efecto.valor, C.eta2Anova, 1e-12, 'pestaña: η²'); cerca(A.anovaUnaVia([D.a, D.b, D.c]).etaCuadrado, C.eta2Anova, 1e-12, 'vista principal: η²'); cerca(A.kruskalWallis([D.a, D.b, D.c]).epsilonCuadrado, C.epsilon2Kruskal, 1e-10, 'vista principal: ε²');
});

test('SEM: la Δχ² de la comparación de modelos anidados es la cola de la χ² (lo que ve el usuario)', () => {
    A.cargarDatos(D.sem.i1.map((/** @type {number} */ _, /** @type {number} */ k) => ({ i1: D.sem.i1[k], i2: D.sem.i2[k], i3: D.sem.i3[k], i4: D.sem.i4[k] })));
    SEM._ultimos.length = 0;
    const m1 = SEM.ajustar('F =~ i1 + i2 + i3 + i4', null, 'Un factor'), m2 = SEM.ajustar('F =~ i1 + i2 + i3 + i4\ni1 ~~ i2', null, 'Con covarianza');
    assert.ok(!m1.error && !m2.error && m1.gl - m2.gl === 1);
    const texto = SEMUI.htmlComparacion().replace(/<[^>]+>/g, ''), m = texto.match(/Δχ²\((\d+)\) = (\d+\.\d+), p = (\d*\.\d+)/);
    assert.ok(m, 'la comparación muestra Δχ² y un valor p con decimales');
    const dChi = m1.chi2 - m2.chi2, pEsperada = 2 * nucleo.colaSuperiorNormal(Math.sqrt(dChi));   // con 1 gl, la cola de la χ² es la de la normal (otra función)
    assert.equal(Number(m[1]), 1); assert.ok(Math.abs(Number(m[2]) - dChi) < 0.006, `Δχ² ${m[2]} frente a ${dChi}`);
    assert.ok(Math.abs(Number(m[3]) - pEsperada) < 0.0006, `p mostrada ${m[3]} frente a ${pEsperada}`);
});

test('vista principal: con grupos constantes IGUALES, las guardas de siempre (0/0: t = 0, F = 0 y p = 1, η² y d = 0)', () => {
    const k5 = [5, 5, 5, 5];
    const ts = A.pruebaTStudent(k5, k5), tw = A.pruebaTWelch(k5, k5), an = A.anovaUnaVia([k5, k5]), lv = A.pruebaLevene([k5, k5]), dc = A.calcularCohenD(k5, k5);
    assert.equal(ts.estadistico, 0); assert.equal(ts.pValor, 1); assert.equal(tw.estadistico, 0); assert.equal(tw.pValor, 1);
    assert.equal(an.F, 0); assert.equal(an.pValor, 1); assert.equal(an.etaCuadrado, 0);
    assert.equal(lv.estadistico, 0); assert.equal(lv.pValor, 1); assert.equal(dc.d, 0); assert.equal(dc.interpretacion, 'trivial');
});

test('(2026.12.22) vista principal: con grupos constantes y DISTINTOS, t, F y d infinitos con p = 0 (antes, 0 con p = 1, como si no hubiera diferencia)', () => {
    const k5 = [5, 5, 5, 5], k7 = [7, 7, 7, 7], k9 = [9, 9, 9, 9];
    const ts = A.pruebaTStudent(k5, k7), tw = A.pruebaTWelch(k7, k5), an = A.anovaUnaVia([k5, k7, k9]), dc = A.calcularCohenD(k5, k7);
    assert.equal(ts.estadistico, -Infinity); assert.equal(ts.pValor, 0); assert.equal(tw.estadistico, Infinity); assert.equal(tw.pValor, 0);
    assert.equal(an.F, Infinity); assert.equal(an.pValor, 0); assert.equal(an.etaCuadrado, 1); assert.equal(an.prueba, 'ANOVA de un factor');
    assert.equal(dc.d, -Infinity); assert.equal(dc.interpretacion, 'grande');
    assert.equal(A.calcularCohenD(k7, k5).d, Infinity);
    // el protocolo elige la U (un grupo constante no es normal), con su d de Cohen infinito
    const c = A.compararGrupos(k5, k7, 'a', 'b');
    assert.equal(c.prueba.prueba, 'U de Mann-Whitney'); assert.ok(c.prueba.pValor < 0.05); assert.equal(c.tamanoEfecto.d, -Infinity);
});

