// @ts-check
// Pruebas de normalidad del núcleo único (core/stats/normalidad.js, 2026.12.16) contra el oráculo normalidad_oraculo.py:
// Shapiro-Wilk (scipy.stats.shapiro) en todas sus ramas y Kolmogórov-Smirnov con Lilliefors (D de scipy.stats.kstest;
// p de nortest::lillie.test). Fija además las dos correcciones de esa versión (n = 3, que daba NaN; la cola profunda, que
// perdía precisión al restar de 1) y la regla con que el programa elige la prueba.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { shapiroWilk, kolmogorovSmirnov, pruebaNormalidad, N_MINIMO_KOLMOGOROV } from '../../src/core/stats/normalidad.js';
import { AnalizadorEstadistico } from '../../src/analizador/estadistica.js';

const { datos: D, esperado: E } = JSON.parse(fs.readFileSync(new URL('../oracle/normalidad_fixture.json', import.meta.url), 'utf8'));
/** @param {number} x @param {number} ref @param {number} rel @param {string} que */
const cerca = (x, ref, rel, que) => assert.ok(Math.abs(x - ref) <= rel * Math.abs(ref), `${que}: ${x} frente a ${ref} (oráculo)`);

test('Shapiro-Wilk igual a SciPy en todas las ramas de Royston, también con n = 3 (antes NaN) y en la cola profunda', () => {
    for (const [k, v] of Object.entries(D.shapiro)) {
        const r = shapiroWilk(v), e = E.shapiro[k];
        cerca(r.estadistico, e.W, 1e-12, `W ${k}`); cerca(r.pValor, e.p, 1e-12, `p ${k}`);
    }
});

test('Kolmogórov-Smirnov (Lilliefors): D igual a scipy.stats.kstest y p igual a nortest::lillie.test (cola, centro y n > 100)', () => {
    for (const [k, v] of Object.entries(D.lilliefors)) {
        const r = kolmogorovSmirnov(v), e = E.lilliefors[k];
        cerca(r.estadistico, e.D, 1e-12, `D ${k}`); cerca(r.pValor, e.p, 1e-12, `p ${k}`);
    }
});

test('la regla del programa: Shapiro-Wilk con n < 50 y Kolmogórov-Smirnov (Lilliefors) desde 50, con sus dos nombres', () => {
    assert.equal(N_MINIMO_KOLMOGOROV, 50);
    const base = D.lilliefors.n80_centro, con49 = pruebaNormalidad(base.slice(0, 49)), con50 = pruebaNormalidad(base.slice(0, 50));
    assert.equal(con49.prueba, 'Shapiro-Wilk'); assert.equal(con49.abreviatura, 'Shapiro-Wilk'); assert.equal(con49.n, 49);
    assert.equal(con49.pValor, shapiroWilk(base.slice(0, 49)).pValor); assert.equal(con49.normal, con49.pValor > 0.05);
    assert.equal(con50.prueba, 'Kolmogorov-Smirnov (Lilliefors)'); assert.equal(con50.abreviatura, 'K-S (Lilliefors)');
    assert.equal(con50.pValor, kolmogorovSmirnov(base.slice(0, 50)).pValor);
});

test('(2026.12.23) una muestra constante no es normal, con un estadístico fijo: W = 0 y D = ½ (antes, D y p NaN, y un W de ruido con una media redondeada)', () => {
    for (const v of [5, 42.1, 0.1, -3.7, 1e6 + 0.3]) {   // 42,1 repetido: su media no es exactamente 42,1 y la DE salía de 10⁻¹⁵
        for (const n of [3, 10, 49]) {
            const r = shapiroWilk(Array(n).fill(v));
            assert.equal(r.estadistico, 0, `W con ${n} × ${v}`); assert.equal(r.pValor, 0, `p de Shapiro-Wilk con ${n} × ${v}`);
        }
        for (const n of [50, 120, 1000]) {
            const r = kolmogorovSmirnov(Array(n).fill(v)), p = pruebaNormalidad(Array(n).fill(v));
            assert.equal(r.estadistico, 0.5, `D con ${n} × ${v}`); assert.ok(r.pValor >= 0 && r.pValor < 1e-30, `p de Lilliefors con ${n} × ${v}: ${r.pValor}`);
            assert.equal(p.prueba, 'Kolmogorov-Smirnov (Lilliefors)'); assert.equal(p.normal, false);
        }
    }
    // una muestra casi constante (un valor distinto) sigue por la fórmula
    const casi = [...Array(59).fill(5), 6];
    assert.ok(kolmogorovSmirnov(casi).estadistico > 0.5 && kolmogorovSmirnov(casi).estadistico < 1);
    assert.ok(shapiroWilk([...Array(29).fill(5), 6]).estadistico > 0);
});

test('vista principal: evaluarNormalidad delega en el núcleo, conserva su error con menos de 3 casos y ya acepta 3', () => {
    assert.throws(() => AnalizadorEstadistico.evaluarNormalidad([1, 2]), /al menos 3 observaciones/);
    const r = AnalizadorEstadistico.evaluarNormalidad(D.shapiro.n3);
    cerca(r.pValor, E.shapiro.n3.p, 1e-12, 'p con n = 3'); assert.equal(r.prueba, 'Shapiro-Wilk'); assert.equal(r.razon, 'n < 50'); assert.equal(r.n, 3);
    const k = AnalizadorEstadistico.evaluarNormalidad(D.lilliefors.n80_centro);
    assert.equal(k.prueba, 'Kolmogorov-Smirnov (Lilliefors)'); assert.equal(k.razon, 'n ≥ 50'); cerca(k.pValor, E.lilliefors.n80_centro.p, 1e-12, 'p con n = 80');
});

test('las vistas usan la normalidad del núcleo: residuos de las dos regresiones, rama de la comparación de grupos y gráficos', async () => {
    const { RegresionMultiple: RM } = await import('../../src/analizador/regresion.js');
    const { ComparacionGrupos: CG } = await import('../../src/analizador/comparacion-grupos.js');
    const { esAproxNormalSimple } = await import('../../src/analizador/correlaciones-por-pares.js');   // (2026.12.17) antes, en ui/graficos.js
    const V = E.vistas;
    for (const caso of V.regresion) {   // n = 30 (Shapiro-Wilk) y n = 60 (Lilliefors), con errores asimétricos
        AnalizadorEstadistico.cargarDatos(JSON.parse(JSON.stringify(caso.filas)));
        for (const [que, R] of [['regresion()', RM.regresion('y', ['x1', 'x2'], 'y', ['x1', 'x2'])], ['regresionAvanzada()', RM.regresionAvanzada('y', ['x1', 'x2'], 'y', ['x1', 'x2'])]]) {
            const nr = R.normResid, e = caso.residuos;
            assert.ok(nr && nr.prueba === e.prueba && nr.normal === e.normal, `${que}, n = ${caso.filas.length}: ${JSON.stringify(nr)} frente a ${JSON.stringify(e)}`);
            cerca(nr.pValor, e.p, 1e-9, `${que}: p de los residuos con n = ${caso.filas.length}`);
        }
    }
    AnalizadorEstadistico.cargarDatos(JSON.parse(JSON.stringify(V.grupos.filas)));
    const G = CG.analizar('g', 'v', 'Grupo', 'Valor');
    for (const nombre of ['A', 'B']) {
        const g = G.normalidad.find((/** @type {any} */ x) => x.grupo === nombre), e = V.grupos[nombre];
        assert.ok(g && g.prueba === e.prueba && g.normal === e.normal, `grupo ${nombre}: ${JSON.stringify(g)}`); cerca(g.pValor, e.p, 1e-12, `p del grupo ${nombre}`);
    }
    assert.equal(G.rama, 'noparametrica', 'el grupo B no es normal: la comparación debe ir por rangos');
    assert.equal(esAproxNormalSimple(V.graficos.normal), V.graficos.normalEsperado); assert.equal(esAproxNormalSimple(V.graficos.asimetrica), V.graficos.asimetricaEsperado);
});

