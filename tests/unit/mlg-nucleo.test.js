// @ts-check
// tests/unit/mlg-nucleo.test.js — (2026.12.22) los modelos lineales generalizados del núcleo único (core/stats/mlg.js: la
// logística y Poisson por IRLS sobre la QR ponderada de core/stats/mco.js, el algoritmo de glm de R), que sustituyen a las
// tres copias de analizador/regresion.js (Newton con la inversa 2 × 2 en forma cerrada o con la información invertida por
// Gauss-Jordan y un pivote mínimo absoluto) y al IRLS del informe del Simulador. Referencias de
// tests/oracle/inferencia_oraculo.py, independientes del IRLS, de
// la QR y de la doble precisión: el método de Newton amortiguado en aritmética DECIMAL de 50 cifras, y la salida publicada de
// R para glm(am ~ wt, binomial, mtcars) y glm(count ~ spray, poisson, InsectSprays). El núcleo queda a menos de 3·10⁻¹³ de
// la decimal en todo (coeficientes, errores típicos, p, devianzas, AIC, ajustados), también con predictores de escalas
// 10⁻⁴ y 10⁵ y con una fecha AAAAMMDD, donde las copias anteriores no convergían o daban errores típicos erróneos.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ajustarMlg } from '../../src/core/stats/mlg.js';

const { datos: D, esperado: E } = JSON.parse(fs.readFileSync(new URL('../oracle/inferencia_fixture.json', import.meta.url), 'utf8'));
/** @type {any} */ let A, RM;
before(async () => {
    A = (await import('../../src/analizador/estadistica.js')).AnalizadorEstadistico;
    RM = (await import('../../src/analizador/regresion.js')).RegresionMultiple;
});
/** @param {number} x @param {number} ref @param {number} tol @param {string} que @param {number} [escala] */
const cerca = (x, ref, tol, que, escala = Math.abs(ref)) => assert.ok(Math.abs(x - ref) <= tol * Math.max(escala, 1e-300), `${que}: ${x} frente a ${ref}`);
/** @param {any} y @param {any[]} cols @param {any} opciones @returns {any} */
const ajustar = (y, cols, opciones) => ajustarMlg(y, cols, opciones);
/** Un generador congruencial (el de MINSTD), para datos reproducibles. @param {number} semilla */
const generador = semilla => {
    let s = semilla;
    const u = () => (s = (s * 48271) % 2147483647) / 2147483647;
    return { u, nor: () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u()) };
};
/** El valor impreso por R, con media unidad de su última cifra. @param {string} s */
const impreso = s => {
    const [mant, exp] = s.toLowerCase().split('e'), dec = mant.includes('.') ? mant.split('.')[1].length : 0;
    return { valor: Number(s), media: 0.5 * 10 ** (-dec) * (exp ? 10 ** Number(exp) : 1) * (1 + 1e-9) };
};

test('la salida publicada de R: glm(am ~ wt, binomial, mtcars) y glm(count ~ spray, poisson, InsectSprays), en las cifras que imprime', () => {
    for (const nombre of ['mtcars', 'insect']) {
        const d = D.mlg[nombre], r = E.mlgR[nombre], M = ajustar(d.y, d.cols, { familia: d.familia });
        assert.ok(!('error' in M), nombre);
        for (const [clave, salida] of [['b', 'beta'], ['ee', 'ee'], ['z', 'z'], ['p', 'pValores']]) {
            r[clave].forEach((/** @type {string | null} */ s, /** @type {number} */ j) => {
                if (s === null) return;   // R imprime «< 2e-16»
                const { valor, media } = impreso(s);
                assert.ok(Math.abs(M[salida][j] - valor) <= media, `${nombre} ${clave}[${j}]: ${M[salida][j]} frente a ${s}`);
            });
        }
        for (const [clave, salida] of [['dev', 'devianza'], ['dev0', 'devianzaNula'], ['aic', 'aic']]) {
            const { valor, media } = impreso(r[clave]);
            assert.ok(Math.abs(M[salida] - valor) <= media, `${nombre} ${clave}: ${M[salida]} frente a ${r[clave]}`);
        }
    }
});

test('frente al Newton decimal de 50 cifras: coeficientes, EE, z, p, IC, log-verosimilitudes, devianzas, AIC, McFadden, dispersión y ajustados', () => {
    for (const [nombre, d] of Object.entries(D.mlg)) {
        const e = E.mlg[nombre], M = ajustar(d.y, d.cols, { familia: d.familia });
        assert.ok(!('error' in M), `${nombre}: ${M.error}`);
        assert.deepEqual(M.avisos, [], `${nombre}: sin avisos`);
        assert.equal(M.familia, d.familia); assert.equal(M.n, d.y.length); assert.equal(M.k, d.cols.length);
        e.beta.forEach((/** @type {number} */ b, /** @type {number} */ j) => {
            cerca(M.beta[j], b, 1e-12, `${nombre} b[${j}]`, Math.abs(b) + e.ee[j]);
            cerca(M.ee[j], e.ee[j], 1e-12, `${nombre} EE[${j}]`);
            cerca(M.z[j], e.z[j], 1e-12, `${nombre} z[${j}]`, 1 + Math.abs(e.z[j]));
            cerca(M.pValores[j], e.p[j], 1e-11, `${nombre} p[${j}]`);
            M.ic[j].forEach((/** @type {number} */ v, /** @type {number} */ q) => cerca(v, e.ic[j][q], 1e-12, `${nombre} IC[${j}][${q}]`, Math.abs(e.ic[j][q]) + e.ee[j]));
        });
        cerca(M.logVerosimilitud, e.ll, 1e-12, `${nombre} log-verosimilitud`); cerca(M.logVerosimilitudNula, e.ll0, 1e-12, `${nombre} log-verosimilitud nula`);
        cerca(M.devianza, e.dev, 1e-12, `${nombre} devianza`); cerca(M.devianzaNula, e.dev0, 1e-12, `${nombre} devianza nula`);
        cerca(M.aic, e.aic, 1e-12, `${nombre} AIC`); cerca(M.mcFadden, e.mcFadden, 1e-12, `${nombre} McFadden`);
        cerca(M.dispersion, e.dispersion, 1e-12, `${nombre} dispersión`);
        assert.equal(M.ajustados.length, e.mu.length);
        e.mu.forEach((/** @type {number} */ m, /** @type {number} */ i) => cerca(M.ajustados[i], m, 1e-12, `${nombre} ajustado ${i}`));
    }
});

test('(2026.12.23) Poisson con conteos de 10³ a 10⁵: converge como el Newton decimal (la reducción del paso no toma el redondeo de la devianza por un aumento)', () => {
    // cerca de la convergencia, el redondeo de la devianza (ε·y·ln y con la forma directa) supera lo que cambia en un paso, y
    // sin la forma estable el ajuste se detendría con «ningún paso mejora el ajuste»; con 283 279 (devianza 0,28) lo supera
    // aun con ella, y el ajuste necesita además su cota de redondeo
    for (const [nombre, d] of Object.entries(D.mlgConteos)) {
        const e = E.mlgConteos[nombre], M = ajustar(d.y, d.cols, { familia: 'poisson' });
        assert.ok(!('error' in M), `${nombre}: ${M.error}`);
        assert.deepEqual(M.avisos, [], `${nombre}: sin avisos`);
        e.beta.forEach((/** @type {number} */ b, /** @type {number} */ j) => {
            cerca(M.beta[j], b, 1e-12, `${nombre} b[${j}]`, Math.abs(b) + e.ee[j]); cerca(M.ee[j], e.ee[j], 1e-12, `${nombre} EE[${j}]`);
        });
        // la devianza, término a término con la forma estable (como glm de R; la 2026.12.22, 2·(ℓ saturada − ℓ), con un error
        // de 10⁻⁹ relativo); ℓ suma términos del orden de y·ln y ≈ 3·10⁶, con un redondeo de 10⁻¹⁰
        cerca(M.devianza, e.dev, 1e-11, `${nombre} devianza`); cerca(M.devianzaNula, e.dev0, 1e-12, `${nombre} devianza nula`);
        cerca(M.logVerosimilitud, e.ll, 1e-10, `${nombre} log-verosimilitud`);
    }
});

test('(2026.12.23) estimaciones finitas con casos en el borde: no son una separación, y sus errores típicos usan los pesos exactos', () => {
    // una edad de 240 con una tasa ajustada de e⁻⁸⁰; x = −15 con p̂ = 3·10⁻¹³; una ficticia casi separada (EE de 4 601); un
    // código 99999999 con p̂ = 1. La 2026.12.22 rechazaba la edad, la ficticia y el código como «separación» (la estimación
    // es finita: lo confirma la programación lineal). Precisión: la de glm de R en estos casos, unas 10⁻⁹ (el residuo de
    // Pearson del caso que contradice su ajustado, de 10⁶ a 10⁸, deja ese error en la QR de cada paso)
    // (y una base en la que un paso completo empeora la devianza, que se reduce a la mitad; y las tres de Poisson de la
    // prueba siguiente, en las que el primer paso extrapola el predictor lineal de un caso de palanca)
    const avisos = { poissonEdad240: /^1 tasa ajustada es numéricamente 0/, logisticaCodigo: /^1 probabilidad ajustada es numéricamente 0 o 1/,
        logisticaPasoReducido: /^2 probabilidades ajustadas son numéricamente 0 o 1/ };
    for (const [nombre, d] of Object.entries(D.mlgPalanca)) {
        const e = E.mlgPalanca[nombre], M = ajustar(d.y, d.cols, { familia: d.familia });
        assert.ok(!('error' in M), `${nombre}: ${M.error}`);
        const aviso = /** @type {Record<string, RegExp>} */ (avisos)[nombre];
        if (aviso) { assert.equal(M.avisos.length, 1, nombre); assert.match(M.avisos[0], aviso); } else assert.deepEqual(M.avisos, [], `${nombre}: sin avisos`);
        e.beta.forEach((/** @type {number} */ b, /** @type {number} */ j) => {
            cerca(M.beta[j], b, 5e-9, `${nombre} b[${j}]`, Math.abs(b) + e.ee[j]); cerca(M.ee[j], e.ee[j], 5e-9, `${nombre} EE[${j}]`);
        });
    }
    // con el peso recortado de glm de R (ε), el caso 99999999 sumaba ε·x² ≈ 2 a la información: los EE salían un 3 % menores
    const d = D.mlgPalanca.logisticaCodigo, M = ajustar(d.y, d.cols, { familia: 'logistica' });
    assert.ok(Math.abs(M.ee[1] / E.mlgPalanca.logisticaCodigo.ee[1] - 1) < 1e-8, `EE de la pendiente ${M.ee[1]}`);
});

test('(2026.12.23) un caso de palanca con un conteo 0 (un código 999 no declarado): si el primer paso empeora el modelo nulo, el ajuste parte de este y converge (la 2026.12.22 decía «no convergió», «casi colineales» o, en otras bases, «separación»)', () => {
    // el primer paso, desde el inicio de glm, da a ese caso el predictor lineal que extrapola de los demás (10² o más): una
    // tasa de 10⁶⁰ y un peso que deja a los demás casos por debajo del redondeo de los mínimos cuadrados. Las tres bases del
    // oráculo (comparadas con el Newton decimal en la prueba anterior) fallaban, y de las 60 generadas aquí, con un efecto
    // de e² por DE, 17 (13 como «casi colineales», también en la 2026.12.22); la estimación cumple las ecuaciones de
    // verosimilitud, Xᵀ(y − μ) = 0
    for (const nombre of ['poissonCodigo999s8', 'poissonCodigo999s14', 'poissonExtrapolado']) {
        const d = D.mlgPalanca[nombre], M = ajustar(d.y, d.cols, { familia: 'poisson' });
        assert.ok(!('error' in M), `${nombre}: ${M.error}`);
    }
    const { u, nor } = generador(999);
    const poisson = (/** @type {number} */ l) => { let k = 0, q = Math.exp(-l), s = q; const v = u(); while (v > s && k < 1e5) { k++; q *= l / k; s += q; } return k; };
    for (let r = 0; r < 60; r++) {
        const x = Array.from({ length: 60 }, () => Math.round(400 + 100 * nor()) / 10), x2 = Array.from({ length: 60 }, () => Math.round(100 * nor()) / 100);
        const y = x.map((v, i) => poisson(Math.exp(Math.min(1.5 + 2 * (v - 40) / 10 + 0.3 * /** @type {number} */ (x2[i]), 9))));
        x[0] = 999; y[0] = 0;
        const M = ajustar(y, [x, x2], { familia: 'poisson' });
        assert.ok(!('error' in M), `base ${r}: ${M.error}`);
        for (const c of [x.map(() => 1), x, x2]) {
            let g = 0, s = 0;
            c.forEach((v, i) => { const e = /** @type {number} */ (y[i]) - M.ajustados[i]; g += v * e; s += Math.abs(v) * (/** @type {number} */ (y[i]) + M.ajustados[i]); });
            assert.ok(Math.abs(g) <= 1e-9 * s, `base ${r}: la ecuación de verosimilitud, ${g} frente a ${s}`);
        }
    }
});

test('(2026.12.23) un código de perdido (10⁷ a 10¹⁴) que su respuesta confirma: la estimación es la de los demás casos (la 2026.12.22 decía «separación»)', () => {
    // su contribución exacta a la verosimilitud y a la información es e^(−|η|) = 0: el ajuste debe ser el de los demás casos.
    // Con el peso recortado de glm de R (ε), el caso aportaría un residuo falso ε·x: con 10⁸, un desplazamiento de 10⁻⁷; con
    // 10⁹, «no convergió»; y con 10¹⁰, una prueba de la separación que tipificara con la media y la DE lo tomaría por separado
    const xb = [0.31, -1.2, 0.85, -0.4, 1.7, -0.9, 0.05, 1.1, -1.6, 0.6], yb = [0, 1, 0, 0, 1, 0, 1, 0, 0, 1];
    const L0 = ajustar(yb, [xb], { familia: 'logistica' });
    for (const codigo of [1e7, 1e8, 99999999, 1e9, 1e10, 1e12]) {
        const L = ajustar([...yb, 1], [[...xb, codigo]], { familia: 'logistica' });
        assert.ok(!('error' in L), `logística con ${codigo}: ${L.error}`);
        for (const j of [0, 1]) { cerca(L.beta[j], L0.beta[j], 1e-12, `logística con ${codigo}: b[${j}]`, Math.abs(L0.beta[j]) + L0.ee[j]); cerca(L.ee[j], L0.ee[j], 1e-12, `logística con ${codigo}: EE[${j}]`); }
        assert.equal(L.avisos.length, 1, 'con el aviso de R (p̂ = 1)');
    }
    const yp = [1, 0, 2, 0, 3, 0, 1, 2, 0, 1], P0 = ajustar(yp, [xb], { familia: 'poisson' });
    for (const codigo of [-1e8, -1e9, -1e10]) {
        const P = ajustar([...yp, 0], [[...xb, codigo]], { familia: 'poisson' });
        assert.ok(!('error' in P), `Poisson con ${codigo}: ${P.error}`);
        for (const j of [0, 1]) { cerca(P.beta[j], P0.beta[j], 1e-12, `Poisson con ${codigo}: b[${j}]`, Math.abs(P0.beta[j]) + P0.ee[j]); cerca(P.ee[j], P0.ee[j], 1e-12, `Poisson con ${codigo}: EE[${j}]`); }
    }
    // un código de 10¹² cuya respuesta CONTRADICE la tendencia de los demás: la estimación es finita con ese caso en η ≈ 28
    // (la pendiente, de 3·10⁻¹¹, lo justo para no contradecirlo) y el redondeo de la pendiente no deja llegar a 10⁻¹⁰ (la
    // 2026.12.22 decía «separación»); los demás coeficientes, los de la media de los demás casos
    const yq = [0, 0, 0, 0, 0, 1, 0, 1, 1], xq = [2, 1, 4, 3, 5, 3, 3, 4, -1e12];
    const Q = ajustar(yq, [xq], { familia: 'logistica' });
    assert.ok(!('error' in Q), Q.error);
    cerca(Q.beta[0], Math.log(2 / 6), 1e-9, 'la constante: el logit de los demás casos (2 de 8)', 1);
    const etaCodigo = Q.beta[0] + Q.beta[1] * -1e12;
    assert.ok(etaCodigo > 26 && etaCodigo < 30, `el código en η ≈ 28: ${etaCodigo}`); assert.deepEqual(Q.avisos, []);
    cerca(Q.ee[1], 1.1547e-6, 1e-3, 'EE de la pendiente (referencia en precisión extendida)');
    // con dos predictores y un código de 10¹⁴: el ajuste avanzaba con la devianza casi plana mientras el caso se saturaba, y
    // pararlo ahí daba una pendiente de 3·10⁻¹³ en lugar de 0,19
    const y2 = [0, 0, 0, 0, 1, 0, 0, 1, 1], x0 = [2, 5, 3, 1, 5, 1, 4, 3, 1e14], x1 = [4, 1, 5, 2, 1, 3, 4, 2, 2];
    const T = ajustar(y2, [x0, x1], { familia: 'logistica' }), T0 = ajustar(y2.slice(0, 8), [x0.slice(0, 8), x1.slice(0, 8)], { familia: 'logistica' });
    assert.ok(!('error' in T), T.error);
    for (const j of [0, 1, 2]) cerca(T.beta[j], T0.beta[j], 1e-12, `código de 10¹⁴: b[${j}]`, Math.abs(T0.beta[j]) + T0.ee[j]);
});

test('(2026.12.23) una ficticia rara cuyos dos casos están saturados (casi sin información): su coeficiente con un EE astronómico y el aviso, como R (la 2026.12.22 decía «separación»)', () => {
    // un predictor casi separa (b ≈ 187) y los dos casos de la ficticia quedan en η ≈ −290 y +130: su coeficiente avanza un
    // logit por iteración sin que la devianza cambie en doble precisión; los demás coeficientes son los del ajuste sin esos
    // dos casos (su contribución exacta, e^(−130), es nula)
    const y = [1, 1, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 1, 1];
    const x0 = [1.727, 0.847, 0.507, -0.419, 0.559, -1.523, 0.081, -1.59, 0.062, 0.736, -0.821, -0.481, -1.468, 2.222, -1.362, 0.819, -0.105, 0.676, 1.056, 0.649, -0.325, 0.516, 1.205, -0.355, -0.673, -1.864, -0.445, 0.333, -0.41, -1.466, -0.671, -0.33, 0.63, 0.548, 1.32, 0.081, -0.328, 0.269, -0.515, -0.256, 0.443, 0.986, 0.444, -0.346, -0.178, -0.806, -0.791, 1.244, -0.445, -0.597, 0.081, 1.271, 0.08, -0.819, 1.307, 0.263, -0.472, -0.543, -1.358, 0.746, 0.753];
    const x1 = x0.map((_, i) => (i === 29 || i === 59 ? 1 : 0));
    const M = ajustar(y, [x0, x1], { familia: 'logistica' });
    assert.ok(!('error' in M), M.error);
    assert.ok(M.ee[2] > 1e20, `el EE de la ficticia: ${M.ee[2]}`); assert.equal(M.avisos.length, 1);
    const resto = y.map((_, i) => i).filter(i => i !== 29 && i !== 59), M0 = ajustar(resto.map(i => y[i]), [resto.map(i => x0[i])], { familia: 'logistica' });
    for (const j of [0, 1]) { cerca(M.beta[j], M0.beta[j], 1e-12, `b[${j}]`, Math.abs(M0.beta[j]) + M0.ee[j]); cerca(M.ee[j], M0.ee[j], 1e-12, `EE[${j}]`); }
});

test('invariante a las unidades y al origen de los predictores: los mismos coeficientes reescalados, los mismos EE y las mismas iteraciones', () => {
    const { u, nor } = generador(1222);
    const x1 = Array.from({ length: 140 }, nor), x2 = Array.from({ length: 140 }, nor);
    const y = x1.map((v, i) => u() < 1 / (1 + Math.exp(-(0.2 + 0.9 * v - 0.5 * x2[i]))) ? 1 : 0);
    const c = x1.map((v, i) => { let k = 0, p = Math.exp(-Math.exp(0.3 + 0.4 * v - 0.2 * x2[i])), s = p; const w = u(); while (w > s) { k++; p *= Math.exp(0.3 + 0.4 * v - 0.2 * x2[i]) / k; s += p; } return k; });
    for (const [familia, yy] of /** @type {const} */ ([['logistica', y], ['poisson', c]])) {
        const ref = ajustar(yy, [x1, x2], { familia });
        for (const escala of [1e-6, 1e6]) {
            const M = ajustar(yy, [x1.map(v => v * escala), x2.map(v => v * escala)], { familia });
            assert.equal(M.iteraciones, ref.iteraciones, `${familia} ×${escala}: las mismas iteraciones (el criterio no depende de las unidades)`);
            for (const j of [1, 2]) { cerca(M.beta[j] * escala, ref.beta[j], 1e-12, `${familia} ×${escala} b[${j}]`); cerca(M.ee[j] * escala, ref.ee[j], 1e-12, `${familia} ×${escala} EE[${j}]`); }
            cerca(M.devianza, ref.devianza, 1e-12, `${familia} ×${escala} devianza`);
        }
        for (const origen of [20240101, 1e6]) {   // una fecha AAAAMMDD: antes, «no convergió» o errores típicos erróneos
            // x + origen redondea x (a unos 4·10⁻⁹ con una fecha): la referencia es el ajuste con (x + origen) − origen, que
            // es exacto (lema de Sterbenz) y da los mismos datos sin el desplazamiento
            const xs = x1.map(v => v + origen), xc = xs.map(v => v - origen);
            const M = ajustar(yy, [xs, x2], { familia }), R = ajustar(yy, [xc, x2], { familia });
            assert.ok(!('error' in M), `${familia} + ${origen}: ${M.error}`);
            for (const j of [1, 2]) { cerca(M.beta[j], R.beta[j], 1e-12, `${familia} + ${origen} b[${j}]`); cerca(M.ee[j], R.ee[j], 1e-12, `${familia} + ${origen} EE[${j}]`); }
            cerca(M.beta[0] + M.beta[1] * origen, R.beta[0], 1e-13, `${familia} + ${origen} la constante`, Math.abs(M.beta[0]));
            cerca(M.devianza, R.devianza, 1e-12, `${familia} + ${origen} devianza`);
            cerca(R.beta[1], ref.beta[1], 1e-7, `${familia} + ${origen}: con los datos redondeados, la pendiente sin desplazar`);
        }
    }
    // con la constante en 0 por simetría (por cada (x, y), (−x, 1 − y)), solo cuenta la pendiente: un criterio absoluto
    // pararía antes con x en millonésimas de su unidad (b ≈ 10⁻⁶) y daría una pendiente imprecisa (5·10⁻¹⁰ relativo)
    const base = [0.3, 0.7, 1.1, 1.6, 2.2, 0.5, 0.9, 1.4, 2.8, 0.2], yb = [1, 0, 1, 1, 1, 0, 1, 0, 1, 1];
    const xs = base.flatMap(v => [v, -v]), ys = yb.flatMap(v => [v, 1 - v]);
    const S = ajustar(ys, [xs], { familia: 'logistica' });
    assert.ok(Math.abs(S.beta[0]) < 1e-15, 'la constante es 0');
    for (const escala of [1e-6, 1e6]) {
        const M = ajustar(ys, [xs.map(v => v * escala)], { familia: 'logistica' });
        assert.equal(M.iteraciones, S.iteraciones, `simétrico ×${escala}: las mismas iteraciones`);
        cerca(M.beta[1] * escala, S.beta[1], 1e-13, `simétrico ×${escala}: la pendiente`);
    }
});

test('sin estimación finita: la separación (perfecta, casi completa, en uno de dos predictores; en Poisson, un grupo con todos los conteos 0)', () => {
    const x = Array.from({ length: 20 }, (_, i) => i + 1);
    const sepLog = /^Separación perfecta o casi perfecta: .*la logística no tiene una estimación finita/;
    assert.match(ajustar(x.map(v => v > 10 ? 1 : 0), [x], { familia: 'logistica' }).error, sepLog, 'perfecta');
    assert.match(ajustar([...x.map(v => v > 10 ? 1 : 0), 1], [[...x.slice(0, 10), ...x.slice(10), 10]], { familia: 'logistica' }).error, sepLog, 'casi completa: en x = 10 hay un 0 y un 1');
    const { nor } = generador(7);
    const z = Array.from({ length: 60 }, nor), ruido = Array.from({ length: 60 }, nor);
    assert.match(ajustar(z.map(v => v > 0 ? 1 : 0), [z, ruido], { familia: 'logistica' }).error, sepLog, 'en uno de dos predictores');
    const g = Array.from({ length: 60 }, (_, i) => i < 30 ? 1 : 0), conteos = g.map((v, i) => v ? 0 : 2 + (i % 5));
    const sepPoi = /^Separación en Poisson: en una parte de los datos todos los conteos son 0/;
    assert.match(ajustar(conteos, [g], { familia: 'poisson' }).error, sepPoi, 'Poisson: un grupo sin eventos');
    assert.match(ajustar(conteos, [g, ruido], { familia: 'poisson' }).error, sepPoi, 'Poisson: con una covariable');
    // (revisión independiente) el mensaje no debe depender de dónde se detiene el bucle: los pesos de los casos separados
    // pierden toda precisión y el ajuste acaba sin converger, singular o con un salto; se recuerda si se tocó el borde
    assert.match(ajustar([0, 0, 0, 25, 0, 0, 0, 21], [[0, 0, 0, 1, 0, 0, 0, 1]], { familia: 'poisson' }).error, sepPoi, 'Poisson: un grupo de 6 con todos 0 (antes, «no convergió»)');
    for (const maxIteraciones of [40, 100, 150, 200]) assert.match(ajustar([0, 0, 0, 25, 0, 0, 0, 21], [[0, 0, 0, 1, 0, 0, 0, 1]], { familia: 'poisson', maxIteraciones }).error, sepPoi, `con ${maxIteraciones} iteraciones`);
    assert.match(ajustar([0, 2, 0, 6, 47, 4, 8, 0], [[0, 0, 0, 0, 0, 0, 0, 1], [0, 0, 0, 0, 1, 0, 0, 0], [0, 1, 0, 1, 0, 1, 1, 1]], { familia: 'poisson' }).error, sepPoi, 'Poisson con tres predictores (antes, «información singular»)');
    assert.match(ajustar([1, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 0, 1, 0, 1, 1, 1, 0, 0, 0], [[0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1]], { familia: 'logistica' }).error, sepLog, 'una ficticia cuyo grupo es todo 0 (antes, «no convergió»)');
    // casi completa con un predictor Likert (x ≤ 2: todos 0; x = 4: todos 1; x = 3, mezclados): el ajuste se detenía en una
    // convergencia espuria (b = 72 con un EE de 10¹⁵), la que glm de R devolvería con su aviso
    const xl = [3, 4, 4, 1, 4, 1, 4, 2, 1, 1, 4, 4, 2, 3, 4, 2, 1, 2, 2, 3, 3, 3, 4, 3, 3, 3, 4, 1, 3, 3, 1, 3, 4, 2, 3, 2, 2, 2, 4, 3, 4, 1, 1, 4, 2, 3, 3, 3, 2, 3];
    const yl = [0, 1, 1, 0, 1, 0, 1, 0, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1];
    assert.match(ajustar(yl, [xl], { familia: 'logistica' }).error, sepLog, 'Likert casi completa');
});

test('con estimación finita pero ajustados en el borde: los avisos de glm de R (probabilidades numéricamente 0 o 1; tasas numéricamente 0)', () => {
    const { u, nor } = generador(31);
    const x = Array.from({ length: 100 }, nor), y = x.map(v => u() < 1 / (1 + Math.exp(-2 * v)) ? 1 : 0);
    const L = ajustar([...y, 1], [[...x, 25]], { familia: 'logistica' });   // un caso en x = 25: η ≈ 50 y p̂ = 1 en doble precisión
    assert.ok(!('error' in L), L.error);
    assert.equal(L.avisos.length, 1); assert.match(L.avisos[0], /^1 probabilidad ajustada es numéricamente 0 o 1 \(por un valor extremo de algún predictor o por una separación casi completa/);
    const S = ajustar(y, [x], { familia: 'logistica' });
    assert.deepEqual(S.avisos, [], 'sin el caso extremo, sin aviso');
    // casi separados pero con estimación finita (lo confirma la programación lineal): un EE de 1,2·10⁴ (5·10³ por DE), el
    // mayor visto en miles de bases; se devuelve con el aviso, como glm de R, y no se confunde con una separación
    const yc = [0, 1, 1, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 1, 0];
    const x1c = [0.18914975444389562, 1.2790603917542185, 1.280681984003125, 1.2469092187779376, -0.7052578231772669, 0.20064622448281735, -0.6238148361181756, 0.09496656417675672, 0.17856205281410117, 0.3290254464746302, -0.2823043817725446, 0.210242002929503, 1.7846402055771589, -1.1960994191990175, -0.6924286527989378, 1.8289410989598753, 1.2326632989499426, 0.2583436469957853, 0.22810458779881632, -0.33964982759496243];
    const x2c = [0, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const C = ajustar(yc, [x1c, x2c], { familia: 'logistica' });
    assert.ok(!('error' in C), C.error); assert.equal(C.avisos.length, 1); assert.match(C.avisos[0], /^9 probabilidades ajustadas son numéricamente 0 o 1/);
    assert.ok(C.ee[2] > 1e4 && C.ee[2] < 2e4, `EE ${C.ee[2]}`);
    const c = x.map(v => Math.round(3 * Math.exp(0.5 * v)));
    const P = ajustar([...c, 0, 0], [[...x, -80, -90]], { familia: 'poisson' });   // tasas e^(−40): numéricamente 0
    assert.ok(!('error' in P), P.error);
    assert.equal(P.avisos.length, 1); assert.match(P.avisos[0], /^2 tasas ajustadas son numéricamente 0/);
});

test('los errores: dependiente no válida o constante, colinealidad, valores no numéricos, casos insuficientes, no convergencia y familia desconocida', () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8], y = [0, 1, 0, 0, 1, 1, 0, 1];
    assert.equal(ajustar([0, 1, 2, 0, 1, 2, 0, 1], [x], { familia: 'logistica' }).error, 'La logística requiere una dependiente con los valores 0 y 1.');
    assert.equal(ajustar([1, 2, -1, 0, 1, 2, 0, 1], [x], { familia: 'poisson' }).error, 'Poisson requiere una variable dependiente de conteo (enteros ≥ 0).');
    assert.equal(ajustar([1, 2, 1.5, 0, 1, 2, 0, 1], [x], { familia: 'poisson' }).error, 'Poisson requiere una variable dependiente de conteo (enteros ≥ 0).');
    const constante = 'La variable dependiente no varía (todos sus valores son iguales): no hay nada que explicar.';
    assert.equal(ajustar(x.map(() => 1), [x], { familia: 'logistica' }).error, constante);
    assert.equal(ajustar(x.map(() => 0), [x], { familia: 'logistica' }).error, constante);
    assert.equal(ajustar(x.map(() => 0), [x], { familia: 'poisson' }).error, constante);
    assert.equal(ajustar(y, [x, x.map(v => 3 * v - 2)], { familia: 'logistica' }).error, 'Predictores perfectamente colineales.');
    assert.equal(ajustar(y, [x.map(() => 4)], { familia: 'poisson' }).error, 'Predictores perfectamente colineales.');
    assert.match(ajustar(y, [x.map((v, i) => i === 2 ? NaN : v)], { familia: 'logistica' }).error, /^Los predictores tienen valores perdidos o no numéricos/);
    assert.equal(ajustar([0, 1], [[1, 2]], { familia: 'logistica' }).error, 'Casos insuficientes (2) para 1 predictores.');
    assert.equal(ajustar(y, [x], { familia: 'logistica', maxIteraciones: 2 }).error, 'La logística no convergió en 2 iteraciones.');
    assert.equal(ajustar([0, 1, 3, 0, 2, 5, 1, 4], [x], { familia: 'poisson', maxIteraciones: 1 }).error, 'Poisson no convergió en 1 iteración.');
    // (2026.12.23) sin converger y con ajustados en el borde, pero con estimación finita: no es una separación
    const pe = D.mlgPalanca.poissonEdad240;
    assert.equal(ajustar(pe.y, pe.cols, { familia: 'poisson', maxIteraciones: 3 }).error, 'Poisson no convergió en 3 iteraciones.');
    assert.throws(() => ajustar(y, [x], { familia: 'probit' }), /Familia desconocida: «probit»/);
    assert.throws(() => ajustar(y, [x.slice(1)], { familia: 'logistica' }), /tantos valores como la dependiente/);
});

test('el nivel del IC de Wald: b ± z(1 − α/2)·EE con el cuantil exacto (antes, 1,959964 redondeado)', () => {
    const d = D.mlg.logisticaDos;
    for (const nivel of [0.9, 0.95, 0.99]) {
        const M = ajustar(d.y, d.cols, { familia: 'logistica', nivel }), zc = { 0.9: 1.6448536269514722, 0.95: 1.959963984540054, 0.99: 2.5758293035489004 }[nivel];
        M.ic.forEach((/** @type {number[]} */ ic, /** @type {number} */ j) => { cerca(ic[0], M.beta[j] - zc * M.ee[j], 1e-14, `IC ${nivel} [${j}] inferior`, Math.abs(M.beta[j]) + M.ee[j]); cerca(ic[1], M.beta[j] + zc * M.ee[j], 1e-14, `IC ${nivel} [${j}] superior`, Math.abs(M.beta[j]) + M.ee[j]); });
    }
});

test('las vistas usan el núcleo: la logística simple del mejor modelo, la múltiple y Poisson de la avanzada, con sus avisos y el AIC de Poisson', () => {
    const d = D.mlg.logisticaDos, p = D.mlg.poissonDos;
    const M = ajustar(d.y, d.cols, { familia: 'logistica' }), P = ajustar(p.y, p.cols, { familia: 'poisson' }), S = ajustar(d.y, [d.cols[0]], { familia: 'logistica' });
    const L = RM._logistica(d.cols[0], d.y);
    assert.equal(L.b0, S.beta[0]); assert.equal(L.b1, S.beta[1]); assert.equal(L.se, S.ee[1]); assert.equal(L.pValor, S.pValores[1]); assert.equal(L.AIC, S.aic); assert.equal(L.mcFadden, S.mcFadden);
    const K = RM._logisticaK(d.y, d.cols, ['g1', 'g2']);
    K.coefs.forEach((/** @type {any} */ c, /** @type {number} */ j) => { assert.equal(c.b, M.beta[j]); assert.equal(c.se, M.ee[j]); assert.equal(c.OR, Math.exp(M.beta[j])); assert.equal(c.ic[0], Math.exp(M.ic[j][0])); });
    assert.equal(K.devianza, M.devianza); assert.equal(K.AIC, M.aic);
    const Q = RM._poissonK(p.y, p.cols, ['h1', 'h2']);
    Q.coefs.forEach((/** @type {any} */ c, /** @type {number} */ j) => { assert.equal(c.b, P.beta[j]); assert.equal(c.IRR, Math.exp(P.beta[j])); });
    assert.equal(Q.dispersion, P.dispersion); assert.equal(Q.AIC, P.aic); assert.equal(Q.sobredispersion, P.dispersion > 1.5);
    // de extremo a extremo, con una fecha AAAAMMDD como predictor (antes: «La logística no convergió en 80 iteraciones.»); la
    // referencia, el ajuste con la fecha menos 20240101 (exacto: los mismos datos sin el desplazamiento)
    const filas = d.y.map((/** @type {number} */ v, /** @type {number} */ i) => ({ y: v, fecha: d.cols[0][i] + 20240101, g2: d.cols[1][i], c: p.y[i] }));
    const sinOrigen = filas.map((/** @type {any} */ f) => f.fecha - 20240101);
    const M2 = ajustar(d.y, [sinOrigen, d.cols[1]], { familia: 'logistica' }), S2 = ajustar(d.y, [sinOrigen], { familia: 'logistica' });
    A.cargarDatos(filas);
    const R = RM.regresionAvanzada('y', ['fecha', 'g2'], 'y', ['fecha', 'g2'], {});
    assert.equal(R.familia, 'logistica', R.error);
    cerca(R.coefs[1].b, M2.beta[1], 1e-12, 'pendiente de la fecha = la del predictor sin el origen'); cerca(R.coefs[1].se, M2.ee[1], 1e-12, 'su EE');
    const B = RM.mejorModelo('fecha', 'y', 'fecha', 'y');
    assert.equal(B.tipoY, 'binaria'); cerca(B.ganador.b1, S2.beta[1], 1e-12, 'la logística simple con la fecha'); cerca(B.ganador.se, S2.ee[1], 1e-12, 'su EE');
    const RP = RM.regresionAvanzada('c', ['fecha'], 'c', ['fecha'], { poisson: true });
    assert.equal(RP.familia, 'poisson', RP.error);
    assert.match(RM.renderMultiple(RP).html, new RegExp(`AIC = ${RM._fx(RP.AIC, 1).replace('.', '\\.')}\\. Cada IRR`), 'el AIC de Poisson en la pantalla (antes no se calculaba)');
    assert.ok(P.dispersion < 1.5 && Q.sobredispersion === false, `conteos de Poisson con su modelo: sin sobredispersión (${P.dispersion})`);
    // conteos sobredispersos (la mitad en 0 y la otra mitad duplicada): χ²/gl muy por encima de 1,5 y el aviso
    A.cargarDatos(Array.from({ length: 60 }, (_, i) => ({ x: i + 1, c: i % 2 ? 0 : 2 * Math.round(Math.exp(1 + 0.03 * (i + 1))) })));
    const RS = RM.regresionAvanzada('c', ['x'], 'c', ['x'], { poisson: true });
    assert.ok(RS.dispersion > 1.5 && RS.sobredispersion === true, `dispersión ${RS.dispersion}`);
    assert.ok(RS.avisos.some((/** @type {string} */ a) => a.startsWith(`Sobredispersión detectada (χ²/gl = ${RM._fx(RS.dispersion, 2)} > 1.5)`)), 'el aviso de sobredispersión');
    // (2027.01.11, revisión) la interacción y el término cuadrático pedidos con Poisson: se dice que no se aplican, como en la
    // logística (hasta la 2027.01.10, se dejaban fuera sin decirlo); con un predictor, la interacción no se pide (su casilla
    // no se ve) y no se dice nada de ella
    A.cargarDatos(filas);
    const RI = RM.regresionAvanzada('c', ['fecha', 'g2'], 'c', ['fecha', 'g2'], { poisson: true, interaccion: true, cuadratico: true });
    assert.equal(RI.familia, 'poisson', RI.error);
    assert.ok(RI.avisos.includes('Con el modelo de Poisson se ajustaron los efectos principales: la interacción y el término cuadrático no se aplican a este modelo.'), RI.avisos.join(' | '));
    assert.match(RM.renderMultiple(RI).html, /Con el modelo de Poisson se ajustaron los efectos principales/, 'en la pantalla');
    const RC = RM.regresionAvanzada('c', ['fecha'], 'c', ['fecha'], { poisson: true, interaccion: true, cuadratico: true });
    assert.deepEqual(RC.avisos.filter((/** @type {string} */ a) => a.startsWith('Con el modelo de Poisson')), ['Con el modelo de Poisson se ajustaron los efectos principales: el término cuadrático no se aplica a este modelo.']);
    assert.ok(!RM.regresionAvanzada('c', ['fecha', 'g2'], 'c', ['fecha', 'g2'], { poisson: true }).avisos.some((/** @type {string} */ a) => a.startsWith('Con el modelo de Poisson')), 'sin pedirlos, nada');
    // los avisos del ajuste llegan a la pantalla (el mejor modelo y la avanzada)
    const { u, nor } = generador(31);
    const xg = Array.from({ length: 100 }, nor), yg = xg.map(v => u() < 1 / (1 + Math.exp(-2 * v)) ? 1 : 0);
    A.cargarDatos([...xg.map((v, i) => ({ x: v, y: yg[i] })), { x: 25, y: 1 }]);   // el caso de la prueba anterior: p̂ = 1
    const MM = RM.mejorModelo('x', 'y', 'x', 'y');
    assert.equal(MM.ganador.avisos.length, 1);
    assert.match(RM._htmlMejorModelo(MM), /⚠️ 1 probabilidad ajustada es numéricamente 0 o 1/);
    const RA = RM.regresionAvanzada('y', ['x'], 'y', ['x'], {});
    assert.ok(RA.avisos.some((/** @type {string} */ a) => /numéricamente 0 o 1/.test(a)), 'la avanzada suma los avisos del ajuste');
    // la regresión bivariada con una dependiente binaria separada: el motivo, en lugar de omitir el mejor modelo (revisión)
    A.cargarDatos(Array.from({ length: 40 }, (_, i) => ({ x: i + 1, y: i + 1 > 20 ? 1 : 0 })));
    const bivariada = RM.renderRegresionBivariada('y', 'x', 'y', 'x');
    assert.match(bivariada.html, /¿Qué modelo explica mejor esta relación\?<\/h4><p [^>]*>⚠️ Separación perfecta o casi perfecta/);
    assert.match(RM.regresionAvanzada('y', ['x'], 'y', ['x'], {}).error, /^Separación perfecta o casi perfecta/, 'y la avanzada, el mismo mensaje');
});

test('el informe del Simulador (el OR y la IRR obtenidos en la base) usa el mismo núcleo, y dice «no estimable» o «no fiable» en lugar de dar por bueno un OR sin sentido', async () => {
    const { GeneradorDatos } = await import('../../src/simulador/dominio/generador.js');
    const g = new GeneradorDatos();
    /** @param {Record<string, number[]>} cols @param {any[]} desenlaces */
    const informe = (cols, desenlaces) => {
        g.configuracion = { pruebas: [], gruposPruebas: [], sociodemograficos: Object.keys(cols).filter(c => c !== 'Y').map(c => ({ categoria: c })), desenlaces };
        g.cortesGenerados = [];
        /** @type {any[]} */ const filas = [];
        g._informeDesenlacesYCortes({ n: cols.Y.length, tiene: (/** @type {string} */ c) => c in cols, columna: (/** @type {string} */ c) => ({ datos: cols[c] }) }, filas, (/** @type {number} */ v, dec = 2) => (isFinite(v) ? Number(v).toFixed(dec) : '—'));
        return filas.filter(f => f.tipo === 'OR' || f.tipo === 'IRR');
    };
    /** @param {number[]} v */
    const tipificar = v => { const m = v.reduce((a, b) => a + b, 0) / v.length, de = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)); return v.map(x => (x - m) / de); };
    const { u, nor } = generador(9);
    const x = Array.from({ length: 80 }, nor), y = x.map(v => u() < 1 / (1 + Math.exp(-(-0.5 + 0.7 * v))) ? 1 : 0);
    const binario = (/** @type {any[]} */ predictores) => [{ nombre: 'Y', tipo: 'binario', prevalencia: 0.4, predictores }];
    const [fila] = informe({ X1: x, Y: y }, binario([{ variable: 'X1', efecto: 2 }]));
    const M = ajustar(y, [tipificar(x)], { familia: 'logistica' });
    assert.equal(fila.obtenido, Math.exp(M.beta[1]).toFixed(2)); assert.equal(fila.ok, Math.abs(M.beta[1] - Math.log(2)) <= 2.5 * M.ee[1] + 0.05);
    const c = x.map(v => { const l = Math.exp(0.5 + 0.3 * v); let k = 0, p = Math.exp(-l), s = p; const w = u(); while (w > s) { k++; p *= l / k; s += p; } return k; });
    const [filaP] = informe({ X1: x, Y: c }, [{ nombre: 'Y', tipo: 'conteo', media: 1.7, predictores: [{ variable: 'X1', efecto: 1.35 }] }]);
    assert.equal(filaP.tipo, 'IRR'); assert.equal(filaP.obtenido, Math.exp(ajustar(c, [tipificar(x)], { familia: 'poisson' }).beta[1]).toFixed(2));
    // sin estimación finita: antes, la última iteración (un OR de millones) o la fila omitida
    const xs = Array.from({ length: 40 }, (_, i) => -3 + 6 * i / 39);
    // (una separación es un artefacto de la muestra, informativa; la colinealidad, un desvío)
    assert.deepEqual(informe({ X1: xs, Y: xs.map(v => v > 0 ? 1 : 0) }, binario([{ variable: 'X1', efecto: 3 }])).map(f => [f.obtenido, f.ok]),
        [['no estimable (separación en la muestra: el predictor separa los valores del desenlace)', null]]);
    assert.deepEqual(informe({ X1: x, X2: x.map(v => 2 * v + 1), Y: y }, binario([{ variable: 'X1', efecto: 2 }, { variable: 'X2', efecto: 1.5 }])).map(f => [f.obtenido, f.ok]),
        [['no estimable (predictores colineales)', false], ['no estimable (predictores colineales)', false]]);
    // con probabilidades ajustadas numéricamente 0 o 1 (un caso extremo): el valor se muestra, pero como informativo
    const xe = Array.from({ length: 100 }, nor), ye = xe.map(v => u() < 1 / (1 + Math.exp(-2 * v)) ? 1 : 0);
    const [filaE] = informe({ X1: [...xe, 25], Y: [...ye, 1] }, binario([{ variable: 'X1', efecto: 2 }]));
    assert.match(filaE.obtenido, /^\d+\.\d\d \(no fiable: separación casi completa en la muestra\)$/); assert.equal(filaE.ok, null);
    // (2026.12.23) un desenlace sin variación en la muestra (la prevalencia ya se compara en su fila): informativo
    assert.deepEqual(informe({ X1: x, Y: x.map(() => 0) }, binario([{ variable: 'X1', efecto: 2 }])).map(f => [f.obtenido, f.ok]),
        [['no estimable (el desenlace no varía)', null]]);
});

test('(2026.12.23) el informe del Simulador nombra cada motivo del motor y decide si la fila es informativa o un desvío', async () => {
    const { motivoGlm, glmInformativo } = await import('../../src/simulador/dominio/informe.js');
    const x = [1, 2, 3, 4, 5, 6, 7, 8], y = [0, 1, 0, 0, 1, 1, 0, 1];
    // los mensajes que no se provocan con datos pequeños, tal como los escribe el motor
    const fuente = fs.readFileSync(new URL('../../src/core/stats/mlg.js', import.meta.url), 'utf8');
    const estancado = 'La logística no convergió: ningún paso mejora el ajuste (dificultades numéricas, por predictores muy correlacionados o con valores extremos).';
    const casiColineales = 'Predictores casi colineales: con los pesos del ajuste, algún predictor es casi una combinación lineal de los demás y la logística no puede estimarse de forma estable. Revisa los predictores muy correlacionados.';
    const casiSingular = 'La logística: la información del ajuste es casi singular (hay casos con ajustados numéricamente en el borde) y los errores típicos no pueden calcularse de forma estable.';
    assert.ok(fuente.includes('no convergió: ningún paso mejora el ajuste (dificultades numéricas, por predictores muy correlacionados o con valores extremos).'));
    assert.ok(fuente.includes('Predictores casi colineales: con los pesos del ajuste, algún predictor es casi una combinación lineal de los demás y ${'));
    assert.ok(fuente.includes(': la información del ajuste es casi singular (hay casos con ajustados numéricamente en el borde) y los errores típicos no pueden calcularse de forma estable.'));
    const casos = /** @type {Array<[string, string, boolean]>} */ ([
        [ajustar(x.map(v => (v > 4 ? 1 : 0)), [x], { familia: 'logistica' }).error, 'separación en la muestra: el predictor separa los valores del desenlace', true],
        [ajustar([0, 0, 0, 25, 0, 0, 0, 21], [[0, 0, 0, 1, 0, 0, 0, 1]], { familia: 'poisson' }).error, 'separación en la muestra: el predictor separa los valores del desenlace', true],
        [ajustar(y, [x], { familia: 'logistica', maxIteraciones: 2 }).error, 'el ajuste no converge', false],
        [estancado, 'el ajuste no converge', false],
        [casiColineales, 'predictores casi colineales', false],
        [ajustar(y, [x, x.map(v => 3 * v - 2)], { familia: 'logistica' }).error, 'predictores colineales', false],
        [casiSingular, 'ajustados numéricamente en el borde', true],
        [ajustar(x.map(() => 0), [x], { familia: 'logistica' }).error, 'el desenlace no varía', true],
        [ajustar([0, 1], [[1, 2]], { familia: 'logistica' }).error, 'casos insuficientes', false]
    ]);
    for (const [error, motivo, informativo] of casos) { assert.equal(motivoGlm(error), motivo, error); assert.equal(glmInformativo(error), informativo, error); }
});
