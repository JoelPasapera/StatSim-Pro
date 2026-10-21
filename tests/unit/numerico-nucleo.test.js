// @ts-check
// Pruebas de regresión del núcleo numérico único (core/stats/numerico.js) y de los envoltorios que delegan en él.
// Revisión de la 2026.12.09: fijan los bordes que la refactorización trató mal y que la batería no veía. Los valores de
// referencia están calculados con SciPy (scipy.stats / scipy.special), no escritos de memoria.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lnGamma, cuantilF, cuantilT, pTBilateral, cdfT, colaSuperiorF, cdfNormal, colaSuperiorNormal, pChiCuadrado } from '../../src/core/stats/numerico.js';
import { ComparacionGrupos } from '../../src/analizador/comparacion-grupos.js';
import { AnalizadorEstadisticoProfesional } from '../../src/analizador/estadistica.js';
import { RegresionMultiple } from '../../src/analizador/regresion.js';
import { ScientificCharts } from '../../src/analizador/graficas.js';
import { Fiabilidad } from '../../src/analizador/fiabilidad.js';

/** @param {number} a @param {number} b @param {number} rel @param {string} que */
const cercaRel = (a, b, rel, que) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${que}: ${a} frente a ${b} (SciPy)`);

test('lnGamma: polo en 0, −1, −2… (antes, lnGamma(−1) = 37,78) y valores de SciPy', () => {
    for (const z of [0, -1, -2, -10]) assert.equal(lnGamma(z), Infinity, `lnGamma(${z})`);
    cercaRel(lnGamma(0.5), 0.5723649429247, 1e-14, 'lnGamma(0,5)');
    cercaRel(lnGamma(171), 706.5730622457875, 1e-14, 'lnGamma(171)');
});

test('cuantilF: bordes exactos y colas pesadas (antes, 64 con p = 1, NaN o 2⁵³ con F(1, 1), 0 con p = 1e−12)', () => {
    assert.equal(cuantilF(0, 3, 50), 0); assert.equal(cuantilF(1, 3, 50), Infinity);
    for (const p of [NaN, -0.1, 1.1]) assert.ok(Number.isNaN(cuantilF(p, 3, 50)), `cuantilF(${p})`);
    cercaRel(cuantilF(1 - 1e-12, 1, 1), 4.053026663553072e+23, 1e-6, 'F⁻¹(1 − 1e−12; 1, 1)');
    cercaRel(cuantilF(1e-12, 1, 1), 2.4674011002723395e-24, 1e-6, 'F⁻¹(1e−12; 1, 1)');
    cercaRel(cuantilF(0.975, 3, 50), 3.3901887803118522, 1e-10, 'F⁻¹(0,975; 3, 50)');
    cercaRel(cuantilF(0.025, 10, 1000), 0.323928813089536, 1e-10, 'F⁻¹(0,025; 10, 1000)');
});

test('cuantilT y la t: colas sin restar de 1 (antes, error 4·10⁻⁵ con p = 1 − 10⁻¹²) y la t crítica de la regresión sin tope', () => {
    cercaRel(cuantilT(0.975, 10), 2.228138851986274, 1e-12, 't(0,975; 10)');
    cercaRel(cuantilT(1e-10, 1), -3183098861.8379064, 1e-9, 't(1e−10; 1)');
    cercaRel(cuantilT(1 - 1e-12, 5), 393.9587026499902, 1e-6, 't(1 − 1e−12; 5)');
    assert.equal(cuantilT(0.5, 7), 0); assert.equal(cuantilT(0, 7), -Infinity); assert.equal(cuantilT(1, 7), Infinity);
    cercaRel(pTBilateral(2.5, 7), 0.04099221858575289, 1e-10, 'p bilateral de t = 2,5 con 7 gl');
    for (const [t, df] of [[-3, 4], [0.7, 12], [5, 2]]) assert.ok(Math.abs(cdfT(t, df) + cdfT(-t, df) - 1) < 1e-14, 'simetría de la CDF de la t');
    cercaRel(RegresionMultiple._tCrit(1, 0.001), 636.6192487687897, 1e-9, 't crítica con 1 gl y α = 0,001 (antes, 100)');
});

test('normal: la cola superior es Φ(−x) exacta (sin restar) y coincide con SciPy en la cola', () => {
    for (const x of [-40, -8, -3.3, -0.5, 0, 0.67448975, 2, 5.66, 37.6]) assert.ok(Object.is(colaSuperiorNormal(x), cdfNormal(-x)), `simetría en ${x}`);
    cercaRel(cdfNormal(-8), 6.22096057427174e-16, 1e-13, 'Φ(−8)');
    assert.ok(Number.isNaN(cdfNormal(NaN))); assert.equal(cdfNormal(Infinity), 1); assert.equal(colaSuperiorNormal(Infinity), 0);
    cercaRel(colaSuperiorF(20, 5, 100), 8.923890603183404e-14, 1e-10, 'cola superior de la F(5, 100) en 20');
    cercaRel(pChiCuadrado(100, 1), 1.5239706048320995e-23, 1e-10, 'cola de la χ²(1) en 100');
});

test('envoltorios: conservan la semántica de cada copia antigua (bordes incluidos)', () => {
    const est = Object.create(AnalizadorEstadisticoProfesional.prototype), graf = ScientificCharts.prototype;
    // χ² con 0 gl: una masa en 0 (p = 0 con x > 0); lo inválido sigue dando NaN (un intento de esta revisión daba p = 0)
    assert.equal(ComparacionGrupos._pChi2(5, 0), 0); assert.equal(ComparacionGrupos._pChi2(0, 3), 1); assert.ok(Number.isNaN(ComparacionGrupos._pChi2(5, NaN)));
    assert.equal(est.calcularPValorChiCuadrado(5, 0), 0); assert.ok(Number.isNaN(est.calcularPValorChiCuadrado(NaN, 3))); assert.ok(Number.isNaN(est.calcularPValorChiCuadrado(NaN, 0)));
    cercaRel(ComparacionGrupos._pChi2(100, 1), 1.5239706048320995e-23, 1e-10, 'cola de la χ² de la comparación de grupos (antes, 0)');
    // la inversa de las gráficas conserva su tope de ±3,5 en los bordes (para dibujar)
    assert.equal(graf._cuantilNormalEstandar.call(graf, 0), -3.5); assert.equal(graf._cuantilNormalEstandar.call(graf, 1), 3.5);
    // _pF: cola SUPERIOR en la comparación de grupos y en estadística; la CDF en fiabilidad (mismo nombre, sentidos opuestos)
    const sup = ComparacionGrupos._pF(2, 3, 30), cdf = Fiabilidad._pF(2, 3, 30);
    assert.ok(Math.abs(sup + cdf - 1) < 1e-14 && sup < 0.5, `cola superior ${sup} + CDF ${cdf} = 1`);
    assert.equal(ComparacionGrupos._pF(0, 3, 30), 1); assert.equal(Fiabilidad._pF(0, 3, 30), 0); assert.equal(est.calcularPValorF(0, 3, 30), 1);
    cercaRel(ComparacionGrupos._pT(2.5, 7), 0.04099221858575289, 1e-10, '_pT bilateral');
    assert.equal(est.cuantilNormalEstandar(0), -Infinity); assert.equal(est.lnGamma(-1), Infinity);
    // con pocos gl (un gl de más apenas se nota con muestras grandes: lo mostró el análisis de mutaciones)
    cercaRel(est.calcularPValorT(2.5, 7), 0.04099221858575289, 1e-10, 'calcularPValorT con 7 gl');
    // los cuantiles interiores del gráfico Q-Q, no solo sus topes
    cercaRel(graf._cuantilNormalEstandar.call(graf, 0.025), -1.959963984540054, 1e-12, 'Q-Q en 0,025'); cercaRel(graf._cuantilNormalEstandar.call(graf, 0.8), 0.8416212335729143, 1e-12, 'Q-Q en 0,8');
});
