// @ts-check
// Estadísticos básicos del núcleo único (core/stats: descriptivos, orden, correlacion; 2026.12.12) y la semántica que cada
// envoltorio conserva. Referencias calculadas con NumPy y SciPy (np.var/std/cov con ddof, np.median, np.quantile lineal,
// scipy.stats.rankdata, np.corrcoef, scipy.stats.spearmanr, np.percentile y scipy.stats.pearsonr), no escritas de memoria.
// El análisis de mutaciones del paso 2 mostró que ninguna prueba vigilaba la interpolación de los cuantiles, los percentiles
// de los descriptivos, el NaN de una correlación no definida ni el 0 que algunos módulos ponen en su lugar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { media, varianza, varianzaPoblacional, desviacion, desviacionPoblacional, covarianza, centrar, estandarizar, matrizCovarianzas, matrizCovarianzasPoblacional } from '../../src/core/stats/descriptivos.js';
import { kEsimo, mediana, rangosPromedio, cuantilOrdenado, cotaInferior, cotaSuperior } from '../../src/core/stats/orden.js';
import { correlacion, spearman, matrizCorrelaciones } from '../../src/core/stats/correlacion.js';
import { mulberry32 } from '../../src/core/random/mulberry32.js';

const X = [3.1, 4.7, 2.2, 4.7, 5.9, 1.4, 3.3, 4.7, 6.8, 2.2], Y = [2.0, 3.5, 1.9, 4.4, 6.1, 1.0, 2.8, 4.0, 7.2, 2.5], Z = [9.5, 1.25, 7.0, 3.5, 3.5, 8.0, 2.0];
const W = Array.from({ length: 30 }, (_, i) => ((i * 37) % 101) / 3);
/** @param {number} a @param {number} b @param {number} rel @param {string} que */
const cerca = (a, b, rel, que) => assert.ok(Math.abs(a - b) <= rel * Math.max(1e-300, Math.abs(b)), `${que}: ${a} frente a ${b} (NumPy/SciPy)`);

test('descriptivos: media, varianza y desviación muestrales y poblacionales, covarianza (NumPy)', () => {
    cerca(media(X), 3.9, 1e-15, 'media'); assert.ok(Number.isNaN(media([])), 'media de la serie vacía');
    cerca(varianza(X), 3.0400000000000005, 1e-15, 'varianza muestral'); cerca(varianzaPoblacional(X), 2.736, 1e-15, 'varianza poblacional');
    cerca(desviacion(X), 1.7435595774162695, 1e-15, 'DE muestral'); cerca(desviacionPoblacional(X), 1.6540858502508267, 1e-15, 'DE poblacional');
    cerca(covarianza(X, Y), 3.26, 1e-14, 'covarianza muestral');
    // seguras como callback: `map` pasa (elemento, índice, array) y ninguna toma el índice por un parámetro (en una primera
    // versión, varianza(v, ddof) recibía el índice como ddof y el α del informe de R12 salía mal)
    assert.deepEqual([X, Y, Z].map(varianza), [varianza(X), varianza(Y), varianza(Z)]); assert.deepEqual([X, Y, Z].map(desviacion), [desviacion(X), desviacion(Y), desviacion(Z)]);
    assert.deepEqual([X, Y].map(varianzaPoblacional), [varianzaPoblacional(X), varianzaPoblacional(Y)]); assert.deepEqual([X, Z].map(media), [media(X), media(Z)]);
});

test('orden: mediana (n par e impar), selección, rangos con empates y cuantiles de tipo 7 con su acotamiento', () => {
    assert.equal(mediana(X), 4.0); assert.equal(mediana(Z), 3.5); assert.ok(Number.isNaN(mediana([])));
    const orden = [...X].sort((a, b) => a - b);
    for (let k = 0; k < X.length; k++) assert.equal(kEsimo(Float64Array.from(X), k), orden[k], `kEsimo ${k}`);
    assert.deepEqual(Array.from(rangosPromedio(X)), [4.0, 7.0, 2.5, 7.0, 9.0, 1.0, 5.0, 7.0, 10.0, 2.5]);
    [[0, 1.4], [0.1, 2.12], [0.25, 2.4250000000000003], [0.5, 4.0], [0.77, 4.7], [1, 6.8]].forEach(([p, q]) => cerca(cuantilOrdenado(orden, p), q, 1e-14, `cuantil ${p}`));
    assert.equal(cuantilOrdenado(orden, -0.2), 1.4); assert.equal(cuantilOrdenado(orden, 1.3), 6.8); assert.ok(Number.isNaN(cuantilOrdenado([], 0.5)));
});

test('correlación: Pearson y Spearman (SciPy); NaN si no está definida (serie constante o con NaN)', () => {
    cerca(correlacion(X, Y), 0.9613505344089368, 1e-14, 'r de Pearson'); cerca(spearman(X, Y), 0.9662682041877618, 1e-14, 'ρ de Spearman');
    assert.ok(Number.isNaN(correlacion([2, 2, 2, 2], [1, 2, 3, 4])), 'serie constante'); assert.ok(Number.isNaN(correlacion([1, NaN, 3], [1, 2, 3])), 'con NaN');
});

test('(2026.12.25) matriz de correlaciones: la de NumPy (np.corrcoef), cada elemento idéntico bit a bit a la r; diagonal 1 y 0 con una columna constante', () => {
    const W10 = W.slice(0, 10), R = matrizCorrelaciones([X, Y, W10]);
    [[0, 1, 0.9613505344089368], [0, 2, 0.10235530318681357], [1, 2, 0.21046968233953647]].forEach(([i, j, ref]) => {
        const r = /** @type {number} */ (/** @type {number[]} */ (R[/** @type {number} */ (i)])[/** @type {number} */ (j)]);
        cerca(r, /** @type {number} */ (ref), 1e-14, `r(${i}, ${j})`);
        assert.equal(r, /** @type {number} */ (/** @type {number[]} */ (R[/** @type {number} */ (j)])[/** @type {number} */ (i)]), 'simétrica');
    });
    const cols = [X, Y, W10, [7, 7, 7, 7, 7, 7, 7, 7, 7, 7], Float64Array.from(X, (v, k) => v * v - k)];
    const M = matrizCorrelaciones(cols);
    for (let i = 0; i < cols.length; i++) for (let j = 0; j < cols.length; j++) {
        const v = /** @type {number} */ (/** @type {number[]} */ (M[i])[j]);
        if (i === j) assert.equal(v, 1);
        else if (i === 3 || j === 3) assert.equal(v, 0, 'columna constante: 0');
        else assert.equal(v, correlacion(/** @type {ArrayLike<number>} */ (cols[i]), /** @type {ArrayLike<number>} */ (cols[j])), `(${i}, ${j}): la misma aritmética que la r`);
    }
    assert.deepEqual(matrizCorrelaciones([]), []);
});

// ---------------------------------------------------------------- (2026.12.25) lo que se unificó al cerrar la fase F6
// Copias literales de lo que había hasta la 2026.12.24 (el informe del Simulador, el SEM, la invarianza y los percentiles del
// flujo), para comprobar que el núcleo da los mismos bits donde la serie no es constante.
/** @param {number[]} arr */
const estViejaPoblacional = arr => { const mu = arr.reduce((s, v) => s + v, 0) / arr.length; const sd = Math.sqrt(arr.reduce((s, v) => s + (v - mu) ** 2, 0) / arr.length) || 1; return arr.map(v => (v - mu) / sd); };
/** @param {number[]} v */
const estViejaMuestral = v => { const m = v.reduce((s, x) => s + x, 0) / v.length; const sd = Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)) || 1; return v.map(x => (x - m) / sd); };
/** @param {number[]} a */
const centrarViejo = a => { const m = a.reduce((s, x) => s + x, 0) / a.length; return a.map(x => x - m); };
/** @param {number[][]} filas */
const covViejaSem = filas => {
    const n = filas.length, p = /** @type {number[]} */ (filas[0]).length, medias = Array.from({ length: p }, (_, j) => filas.reduce((s, f) => s + /** @type {number} */ (f[j]), 0) / n);
    const S = Array.from({ length: p }, () => new Array(p).fill(0));
    filas.forEach(f => { for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) /** @type {number[]} */ (S[i])[j] += (/** @type {number} */ (f[i]) - /** @type {number} */ (medias[i])) * (/** @type {number} */ (f[j]) - /** @type {number} */ (medias[j])); });
    for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) /** @type {number[]} */ (S[i])[j] /= (n - 1);
    return S;
};
/** @param {number[][]} X */
const covViejaInvarianza = X => { const n = X.length, items = /** @type {number[]} */ (X[0]), media = items.map((_, j) => X.reduce((s, x) => s + /** @type {number} */ (x[j]), 0) / n); return items.map((_, i) => items.map((_, j) => X.reduce((s, x) => s + (/** @type {number} */ (x[i]) - /** @type {number} */ (media[i])) * (/** @type {number} */ (x[j]) - /** @type {number} */ (media[j])), 0) / n)); };
/** @param {Float64Array} valores @param {number} v */
const cotasViejas = (valores, v) => {
    const m = valores.length; let lo = 0, hi = m;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (/** @type {number} */ (valores[mid]) < v) lo = mid + 1; else hi = mid; }
    const inferiores = lo; lo = 0; hi = m;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (/** @type {number} */ (valores[mid]) <= v) lo = mid + 1; else hi = mid; }
    return [inferiores, lo];
};
/** Series de prueba con empates (redondeadas a dos decimales) y escalas distintas. @param {number} semilla @param {number} n */
const serie = (semilla, n) => { const u = mulberry32(semilla), escala = 10 ** ((semilla % 7) - 3); return Array.from({ length: n }, () => Math.round((u() * 6 - 3) * 100) / 100 * escala + semilla); };

test('(2026.12.25) estandarizar y centrar: las de SciPy (zscore con ddof 0 y 1) y NumPy; ceros exactos con una serie constante; los mismos bits que las copias que había', () => {
    const z0 = [-0.4836508334066743, 0.4836508334066746, -1.027758020989183, 0.4836508334066746, 1.2091270835166863, -1.5114088543958577, -0.36273812505500586, 0.4836508334066746, 1.7532342710991948, -1.027758020989183];
    const z1 = [-0.4588314677411234, 0.45883146774112366, -0.9750168689498873, 0.45883146774112366, 1.147078669352809, -1.4338483366910109, -0.3441236008058427, 0.45883146774112366, 1.6632640705615727, -0.9750168689498873];
    const e0 = estandarizar(X), e1 = estandarizar(X, { muestral: true });
    e0.z.forEach((v, i) => cerca(v, /** @type {number} */ (z0[i]), 1e-14, `z poblacional ${i}`));
    e1.z.forEach((v, i) => cerca(v, /** @type {number} */ (z1[i]), 1e-14, `z muestral ${i}`));
    assert.equal(e0.media, media(X)); assert.equal(e0.de, desviacionPoblacional(X)); assert.equal(e1.de, desviacion(X));
    centrar(X).forEach((v, i) => assert.ok(Math.abs(v - (/** @type {number} */ (X[i]) - 3.9)) < 1e-15, `centrada ${i}`));
    // una serie constante: ceros exactos (la media es exacta); las copias que había daban ≈ ±1 con 42,1 repetido 60 veces
    const constante = new Array(60).fill(42.1);
    assert.deepEqual(Array.from(estandarizar(constante).z), new Array(60).fill(0)); assert.equal(estandarizar(constante).de, 0);
    assert.deepEqual(Array.from(centrar(constante)), new Array(60).fill(0));
    assert.equal(estViejaPoblacional(constante)[0], 1, 'la copia que había');
    // casos límite: NaN se propaga; la serie vacía; un solo valor (la DE muestral no está definida: se divide por 1)
    const conNaN = estandarizar([1, NaN, 3]);
    assert.ok(conNaN.z.every(Number.isNaN) && Number.isNaN(conNaN.de));
    assert.equal(estandarizar([]).z.length, 0);
    assert.deepEqual(Array.from(estandarizar([5]).z), [0]); assert.ok(Number.isNaN(estandarizar([5], { muestral: true }).de)); assert.deepEqual(Array.from(estandarizar([5], { muestral: true }).z), [0]);
    // los mismos bits que las copias que había, en 300 series no constantes (con empates y escalas de 10⁻³ a 10³)
    for (let k = 1; k <= 300; k++) {
        const v = serie(k, 3 + (k % 40));
        if (v.every(x => x === v[0])) continue;
        assert.deepEqual(Array.from(estandarizar(v).z), estViejaPoblacional(v), `serie ${k}: poblacional`);
        assert.deepEqual(Array.from(estandarizar(v, { muestral: true }).z), estViejaMuestral(v), `serie ${k}: muestral`);
        assert.deepEqual(Array.from(centrar(v)), centrarViejo(v), `serie ${k}: centrada`);
    }
});

test('(2026.12.25) matrices de covarianzas: las de NumPy (np.cov con ddof 1 y 0), simétricas exactas y con los mismos bits que las copias del SEM y de la invarianza', () => {
    const S1 = matrizCovarianzas([X, Y]), S0 = matrizCovarianzasPoblacional([X, Y]);
    [[S1, [[3.04, 3.26], [3.26, 3.782666666666666]]], [S0, [[2.7360000000000007, 2.934], [2.934, 3.4044]]]].forEach(([S, ref], m) => {
        for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) cerca(/** @type {number} */ (/** @type {number[]} */ (S[i])[j]), /** @type {number} */ (/** @type {number[]} */ (ref[i])[j]), 1e-14, `${m ? 'poblacional' : 'muestral'} (${i}, ${j})`);
    });
    assert.equal(/** @type {number[]} */ (S1[0])[1], covarianza(X, Y), 'el elemento (0, 1) es la covarianza');
    assert.deepEqual(matrizCovarianzas([]), []);
    for (let k = 1; k <= 60; k++) {
        const p = 2 + (k % 5), n = p + 3 + (k % 30), cols = Array.from({ length: p }, (_, j) => serie(100 * k + j, n));
        const filas = Array.from({ length: n }, (_, i) => cols.map(c => /** @type {number} */ (c[i])));
        const S = matrizCovarianzas(cols), P = matrizCovarianzasPoblacional(cols);
        assert.deepEqual(S, covViejaSem(filas), `caso ${k}: la del SEM`);
        assert.deepEqual(P, covViejaInvarianza(filas), `caso ${k}: la de la invarianza`);
        S.forEach((f, i) => f.forEach((v, j) => assert.equal(v, /** @type {number[]} */ (S[j])[i], 'simétrica')));
    }
});

test('(2026.12.25) búsqueda binaria: cotaInferior y cotaSuperior son searchsorted de NumPy (left y right) y dan lo mismo que los bucles del flujo', () => {
    const o = Float64Array.from(X).sort();
    assert.deepEqual([4.7, 0, 10, 2.2, 3.0].map(v => cotaInferior(o, v)), [5, 0, 10, 1, 3]);
    assert.deepEqual([4.7, 0, 10, 2.2, 3.0].map(v => cotaSuperior(o, v)), [8, 0, 10, 3, 3]);
    assert.equal(cotaInferior(new Float64Array(0), 1), 0); assert.equal(cotaSuperior([], 1), 0);
    for (let k = 1; k <= 200; k++) {
        const v = Float64Array.from(serie(k, 1 + (k % 50))).sort();
        for (const t of [v[0], v[v.length - 1], v[v.length >> 1], (v[0] ?? 0) - 1, (v[v.length - 1] ?? 0) + 1, NaN]) {
            const x = /** @type {number} */ (t);
            assert.deepEqual([cotaInferior(v, x), cotaSuperior(v, x)], cotasViejas(v, x), `serie ${k}, valor ${x}`);
        }
    }
});

test('(2026.12.25) los estadísticos del motor de gráficos (shared/statviz.js, la interfaz de d3): los del núcleo, sin los valores no numéricos', async () => {
    const { d3 } = await import('../../src/shared/statviz.js');
    const conBasura = [...X, 'x', NaN, null, undefined];
    cerca(d3.mean(conBasura), 3.9, 1e-15, 'd3.mean'); cerca(d3.deviation(conBasura), 1.7435595774162695, 1e-15, 'd3.deviation');
    assert.equal(d3.median(conBasura), 4); cerca(d3.quantile(conBasura, 0.25), 2.4250000000000003, 1e-15, 'd3.quantile 0,25'); cerca(d3.quantile(conBasura, 0.9), 5.99, 1e-15, 'd3.quantile 0,9');
    assert.equal(d3.quantile(conBasura, 0), 1.4); assert.equal(d3.quantile(conBasura, 1), 6.8);
    assert.equal(d3.mean([]), undefined); assert.equal(d3.deviation([2]), undefined); assert.equal(d3.quantile([], 0.5), undefined);
    assert.equal(d3.mean(X), media(X)); assert.equal(d3.deviation(X), desviacion(X));
    assert.equal(d3.mean([{ v: 2 }, { v: 4 }], (/** @type {{ v: number }} */ o) => o.v), 3, 'con accesor');
});

test('envoltorios: cada módulo conserva su semántica (0 donde siempre fue 0, NaN donde siempre fue NaN)', async () => {
    const { Fiabilidad } = await import('../../src/analizador/fiabilidad.js');
    const { RegresionMultiple } = await import('../../src/analizador/regresion.js');
    const { correlacionPearsonSimple, correlacionSpearmanSimple } = await import('../../src/analizador/correlaciones-por-pares.js');   // (2026.12.17) antes, en ui/graficos.js
    const { CribaCorrelaciones } = await import('../../src/analizador/criba-correlaciones.js');
    const { AnalizadorEstadistico } = await import('../../src/analizador/estadistica.js');
    const constante = [5, 5, 5, 5, 5];
    assert.equal(Fiabilidad._cor(constante, [1, 2, 3, 4, 5]), 0, 'fiabilidad: ítem constante → 0');
    assert.ok(Number.isNaN(RegresionMultiple._pearson(constante, [1, 2, 3, 4, 5])), 'regresión: NaN, como siempre');
    assert.equal(correlacionPearsonSimple(constante, [1, 2, 3, 4, 5]), 0, 'gráficos: constante → 0');
    assert.ok(Number.isNaN(correlacionPearsonSimple([1, NaN, 3], [1, 2, 3])), 'gráficos: dato inválido → NaN');
    cerca(correlacionPearsonSimple([...X, 99, 98], Y), 0.9613505344089368, 1e-14, 'gráficos: trunca a la longitud menor');
    cerca(correlacionSpearmanSimple(X, Y), 0.9662682041877618, 1e-14, 'gráficos: Spearman');
    const filas = Array.from({ length: 20 }, (_, i) => ({ k: 4, u: i % 7, v: (i * 3) % 11 }));
    const C = CribaCorrelaciones.cribar(filas, [{ columnaX: 'k', columnaY: 'u' }, { columnaX: 'u', columnaY: 'v' }], AnalizadorEstadistico);
    const conConstante = C.evaluados.find((/** @type {any} */ e) => e.columnaX === 'k');   // la criba reordena los pares por |r|
    assert.ok(conConstante && conConstante.valido && conConstante.coeficiente === 0, `criba: columna constante → 0 (${conConstante && conConstante.coeficiente})`);
    cerca(AnalizadorEstadistico.correlacionSpearman(X, Y, 'bilateral').coeficiente, 0.9662682041877618, 1e-14, 'estadística: Spearman');
    cerca(RegresionMultiple._spearman(X, Y), 0.9662682041877618, 1e-14, 'regresión: Spearman');
    assert.equal(AnalizadorEstadistico.varianzaMuestral([5]), 0, 'varianzaMuestral con n < 2 → 0');
});

test('percentiles de los descriptivos (Q1, Q3, mediana y RIC) y terciles: con interpolación, como np.percentile', async () => {
    const { AnalizadorEstadistico } = await import('../../src/analizador/estadistica.js');
    const { cuantilLineal } = await import('../../src/analizador/ui/sociodemografica.js');
    const d = AnalizadorEstadistico.calcularDescriptivas(W);
    cerca(d.q1, 7.916666666666667, 1e-14, 'Q1'); cerca(d.q3, 24.333333333333336, 1e-14, 'Q3'); cerca(d.mediana, 16.166666666666668, 1e-14, 'mediana'); cerca(d.iqr, 16.416666666666668, 1e-13, 'RIC');
    const ordenados = [...W].sort((a, b) => a - b);
    cerca(cuantilLineal(ordenados, 1 / 3), 10.666666666666666, 1e-14, 'tercil inferior'); cerca(cuantilLineal(ordenados, 2 / 3), 21.444444444444443, 1e-14, 'tercil superior');
});

test('permutaciones de la forma: el valor p de la recta con la base submuestreada (rama que ninguna prueba recorría)', async () => {
    const { pruebasPermutacionForma } = await import('../../src/analizador/relaciones/pruebas-permutacion-forma.js');
    const xs = Array.from({ length: 120 }, (_, i) => i / 10), ys = Array.from({ length: 120 }, (_, i) => Math.sin(i * 0.37) + 0.02 * i);
    const R = pruebasPermutacionForma(xs, ys, { maximoValores: 40, B: 99 });
    const p = R.relacion && R.relacion.pRectaCompleta;
    assert.ok(typeof p === 'number', 'la submuestra calcula el p de la recta con la base completa');
    cerca(p, 2.0306806704696386e-16, 1e-8, 'p de la recta (scipy.stats.pearsonr)');
});
