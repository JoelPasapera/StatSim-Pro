// @ts-check
// tests/unit/descriptivos-recta.test.js — (2026.12.19) la asimetría y la curtosis ajustadas (G1 y G2, las de SPSS) y la recta
// del diagrama de dispersión salen del núcleo único (core/stats/descriptivos.js y core/stats/regresion-simple.js), contra
// tests/oracle/inferencia_fixture.json (scipy.stats: skew y kurtosis con bias=False, linregress y la t de n − 2 gl). Hasta la
// 2026.12.18 la lectura de los gráficos usaba los momentos sin ajustar (la misma variable tenía dos asimetrías) y el
// diagrama de dispersión recalculaba la recta y aproximaba la t de su banda con 1,96 + 2,4/gl.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { media, suma, desviacion, varianza, asimetria, curtosis } from '../../src/core/stats/descriptivos.js';
import { regresionSimple, bandaConfianzaRecta } from '../../src/core/stats/regresion-simple.js';

const { datos: D, esperado: E } = JSON.parse(fs.readFileSync(new URL('../oracle/inferencia_fixture.json', import.meta.url), 'utf8'));
/** @param {number} x @param {number} ref @param {number} rel @param {string} que */
const cerca = (x, ref, rel, que) => assert.ok(Math.abs(x - ref) <= rel * Math.max(1, Math.abs(ref)), `${que}: ${x} frente a ${ref}`);

test('núcleo: media, DE, asimetría y curtosis ajustadas iguales a SciPy (bias=False); casos límite', () => {
    D.descriptivos.forEach((/** @type {number[]} */ v, /** @type {number} */ k) => {
        const e = E.descriptivos[k], q = `serie ${k} (n = ${v.length})`;
        cerca(media(v), e.media, 1e-13, `${q}: media`); cerca(desviacion(v), e.de, 1e-13, `${q}: DE`);
        cerca(asimetria(v), e.asimetria, 1e-12, `${q}: asimetría G1`); cerca(curtosis(v), e.curtosis, 1e-12, `${q}: curtosis G2`);
    });
    assert.ok(Number.isNaN(asimetria([1, 2])) && Number.isNaN(curtosis([1, 2, 3])), 'G1 necesita 3 valores y G2, 4');
    assert.equal(asimetria([4, 4, 4]), 0); assert.equal(curtosis([4, 4, 4, 4]), 0);
});

test('(2026.12.23) la media de una serie constante es su valor exacto, y su varianza 0 (antes, 42,1 repetido daba 42,1 − 5·10⁻¹⁴ y una varianza de 10⁻²⁷); en lo demás, la misma suma', () => {
    for (const v of [42.1, 43.3, 0.1, 0.7, 3.3, -2.2, 1e-300, 7e15 + 1]) {
        for (const n of [1, 2, 7, 60, 1001]) {
            const s = Array(n).fill(v);
            assert.equal(media(s), v, `media de ${n} × ${v}`); assert.equal(n > 1 ? varianza(s) : 0, 0, `varianza de ${n} × ${v}`);
            if (n > 1) assert.equal(desviacion(s), 0);
        }
    }
    assert.ok(Number.isNaN(media([])), 'vacía: NaN');
    assert.ok(Number.isNaN(media([NaN, NaN])) && Number.isNaN(media([1, NaN])) && Number.isNaN(media([NaN, 1])), 'los NaN se propagan');
    assert.equal(media([Infinity, Infinity]), Infinity);
    const { u } = { u: (() => { let s = 99; return () => (s = (s * 48271) % 2147483647) / 2147483647; })() };
    for (let r = 0; r < 200; r++) {   // con valores distintos, el mismo resultado bit a bit que la suma dividida por n
        const s = Array.from({ length: 1 + (r % 50) }, () => +(100 * u()).toFixed(r % 4));
        if (s.every(x => x === s[0])) continue;
        assert.equal(media(s), suma(s) / s.length);
    }
});

test('la tabla de descriptivos y la lectura de los gráficos dan la MISMA asimetría y curtosis (antes, los gráficos, sin ajustar)', async () => {
    const { AnalizadorEstadistico: A } = await import('../../src/analizador/estadistica.js');
    const { AnalisisGraficos } = await import('../../src/analizador/analisis-graficos.js');
    D.descriptivos.forEach((/** @type {number[]} */ v, /** @type {number} */ k) => {
        const d = A.calcularDescriptivas(v), e = E.descriptivos[k];
        cerca(d.asimetria, e.asimetria, 1e-12, `tabla, serie ${k}: asimetría`); cerca(d.curtosis, e.curtosis, 1e-12, `tabla, serie ${k}: curtosis`);
    });
    const v = D.descriptivos[1], e = E.descriptivos[1];   // lognormal: muy asimétrica, la lectura la describe
    const texto = AnalisisGraficos.generar('distribucion-gaussiana', { cajas: [v], labels: ['V'] });
    assert.ok(texto.includes(`γ₁ = ${e.asimetria.toFixed(2)}`) && texto.includes(`γ₂ = ${e.curtosis.toFixed(2)}`), `la lectura usa G1 = ${e.asimetria.toFixed(2)} y G2 = ${e.curtosis.toFixed(2)}`);
    assert.ok(!texto.includes(`γ₁ = ${e.g1.toFixed(2)}`), `y no el momento sin ajustar g1 = ${e.g1.toFixed(2)}`);
});

test('la recta: pendiente, intercepto, R², errores típicos y p iguales a scipy.stats.linregress; la banda con la t exacta', () => {
    D.rectas.forEach((/** @type {any} */ d, /** @type {number} */ k) => {
        const r = regresionSimple(d.x, d.y), e = E.rectas[k], q = `recta ${k} (n = ${d.x.length})`;
        cerca(r.pendiente, e.pendiente, 1e-12, `${q}: pendiente`); cerca(r.intercepto, e.intercepto, 1e-12, `${q}: intercepto`); cerca(r.r2, e.r2, 1e-12, `${q}: R²`);
        cerca(r.errorEstandarPendiente, e.eePendiente, 1e-11, `${q}: EE de la pendiente`); cerca(r.errorEstandarEstimacion, e.see, 1e-11, `${q}: error típico de estimación`);
        cerca(r.pPendiente, e.p, 1e-9, `${q}: p de la pendiente`);
        bandaConfianzaRecta(r, d.malla).forEach((p, j) => { cerca(p.inferior, e.inferior[j], 1e-11, `${q}: banda inferior ${j}`); cerca(p.superior, e.superior[j], 1e-11, `${q}: banda superior ${j}`); });
    });
    assert.ok(bandaConfianzaRecta(regresionSimple([1, 2], [3, 5]), [1.5]).every(p => Number.isNaN(p.inferior)), 'con n = 2, sin banda');
});

test('el diagrama de dispersión dibuja la recta de la vista principal y su banda con la t exacta (con n = 8: 2,447, no 2,36)', async () => {
    const { AnalizadorEstadistico: A } = await import('../../src/analizador/estadistica.js');
    const SC = /** @type {any} */ ((await import('../../src/analizador/graficas.js')).ScientificCharts.prototype);
    D.rectas.forEach((/** @type {any} */ d, /** @type {number} */ k) => {
        const R = A.calcularRegresionLineal(d.x, d.y), dominio = [Math.min(...d.x) - 1, Math.max(...d.x) + 1];
        const G = SC._rectaDispersion.call(SC, d.x, d.y, dominio);
        assert.equal(G.b, R.pendiente, `recta ${k}: la pendiente que se dibuja es la de la vista principal`); assert.equal(G.a, R.intercepto);
        assert.ok(Math.abs(R.pPendiente - E.rectas[k].p) <= 1e-9 * E.rectas[k].p, `recta ${k}: p de la pendiente de la vista principal ${R.pPendiente} frente a ${E.rectas[k].p}`);
        cerca(R.errorEstandarPendiente, E.rectas[k].eePendiente, 1e-11, `recta ${k}: EE de la pendiente de la vista principal`);
        assert.equal(G.banda.length, 60);
        const r = regresionSimple(d.x, d.y), medio = (/** @type {any} */ p) => (p.superior - p.inferior) / 2, xbar = media(d.x);
        const ref = bandaConfianzaRecta(r, G.banda.map((/** @type {any} */ p) => p.x));
        G.banda.forEach((/** @type {any} */ p, /** @type {number} */ j) => assert.equal(p.superior, ref[j].superior));
        // en x̄ la semiamplitud es t·s/√n: con la t exacta
        const enMedia = bandaConfianzaRecta(r, [xbar])[0];
        cerca(medio(enMedia), E.rectas[k].t * E.rectas[k].see / Math.sqrt(d.x.length), 1e-10, `recta ${k}: semiamplitud en la media con t = ${E.rectas[k].t.toFixed(3)} (antes, ${E.rectas[k].tAproximadaAntes.toFixed(3)})`);
    });
    const constante = SC._rectaDispersion.call(SC, [2, 2, 2, 2], [1, 2, 3, 4], [1, 3]);
    assert.deepEqual([constante.b, constante.a, constante.banda.length], [0, 2.5, 0], 'con X constante: la media de Y, sin banda');
});
