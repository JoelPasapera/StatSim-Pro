// @ts-check
// tests/unit/mco-nucleo.test.js — (2026.12.21) los mínimos cuadrados del núcleo único (core/stats/mco.js, por la QR de
// Householder de core/linalg/qr.js), que sustituyen a seis copias (cuatro en regresion.js con X'X invertida por Gauss-Jordan
// y un pivote mínimo absoluto; dos por Cholesky con criterios relativos distintos). Referencias de
// tests/oracle/inferencia_oraculo.py, independientes de la QR: la solución EXACTA en aritmética racional (y con ella (X'X)⁻¹
// y el VIF por las regresiones auxiliares) y la salida publicada de R para lm(mpg ~ wt + hp, data = mtcars). En los diseños
// mal condicionados, la QR queda a menos de 4·10⁻¹¹ de la exacta y numpy.linalg.lstsq, a 7·10⁻⁸.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ajustarMco, regresionMco, TOLERANCIA_COLINEALIDAD } from '../../src/core/stats/mco.js';
import { factorQR, aplicarQt, resolverR, diagonalInversaXtX, inversaXtX, elementoR } from '../../src/core/linalg/qr.js';
import { regresionSimple } from '../../src/core/stats/regresion-simple.js';

const { datos: D, esperado: E } = JSON.parse(fs.readFileSync(new URL('../oracle/inferencia_fixture.json', import.meta.url), 'utf8'));
/** @type {any} */ let A, RM, DF;
before(async () => {
    A = (await import('../../src/analizador/estadistica.js')).AnalizadorEstadistico;
    RM = (await import('../../src/analizador/regresion.js')).RegresionMultiple;
    DF = await import('../../src/analizador/relaciones/diagnostico-forma.js');
});
/** @param {number} x @param {number} ref @param {number} rel @param {string} que */
const cerca = (x, ref, rel, que) => assert.ok(Math.abs(x - ref) <= rel * Math.max(Math.abs(ref), 1e-300), `${que}: ${x} frente a ${ref}`);
/** @param {ArrayLike<number>} a @param {ArrayLike<number>} b @param {number} rel @param {string} que */
const cercaV = (a, b, rel, que) => { assert.equal(a.length, b.length, `${que}: longitud`); for (let i = 0; i < a.length; i++) cerca(/** @type {number} */ (a[i]), /** @type {number} */ (b[i]), rel, `${que}[${i}]`); };

test('regresionMco frente a la solución exacta en los diseños bien condicionados: coeficientes, EE, t, p, IC, R², F, β y VIF', () => {
    for (const nombre of ['mtcars', 'normal', 'casiColineal']) {
        const d = D.mco.disenos[nombre], e = E.mco[nombre], M = /** @type {any} */ (regresionMco(d.y, d.cols));
        assert.ok(M, nombre);
        const tol = nombre === 'casiColineal' ? 1e-8 : 1e-11;   // κ(X) ≈ 2·10⁵: la precisión de los coeficientes es κ·ε
        cercaV(M.beta, e.beta, tol, `${nombre} b`); cercaV(M.ee, e.ee, tol, `${nombre} EE`); cercaV(M.t, e.t, tol, `${nombre} t`);
        cercaV(M.pValores, e.p, 1e-7, `${nombre} p`); M.ic.forEach((/** @type {number[]} */ ic, /** @type {number} */ j) => cercaV(ic, e.ic[j], tol, `${nombre} IC ${j}`));
        cerca(M.sce, e.sce, 1e-11, `${nombre} SCE`); cerca(M.r2, e.r2, 1e-11, `${nombre} R²`); cerca(M.r2aj, e.r2aj, 1e-11, `${nombre} R² ajustado`);
        cerca(M.F, e.F, 1e-10, `${nombre} F`); cerca(M.pF, e.pF, 1e-8, `${nombre} p de F`); cerca(M.errorTipico, e.errorTipico, 1e-12, `${nombre} error típico`);
        cercaV(M.betaEstandarizado, e.betaEstandarizado, tol, `${nombre} β`); cercaV(M.vif, e.vif, tol, `${nombre} VIF (identidad frente a regresiones auxiliares)`);
        assert.equal(M.gl, e.gl);
    }
});

test('la salida publicada de R: summary(lm(mpg ~ wt + hp, data = mtcars))', () => {
    const d = D.mco.disenos.mtcars, M = /** @type {any} */ (regresionMco(d.y, d.cols));
    [37.22727, -3.87783, -0.03177].forEach((b, j) => assert.ok(Math.abs(M.beta[j] - b) < 5e-6, `b${j}`));
    [1.59879, 0.63273, 0.00903].forEach((s, j) => assert.ok(Math.abs(M.ee[j] - s) < 5e-6, `EE${j}`));
    assert.ok(Math.abs(M.r2 - 0.8268) < 5e-5 && Math.abs(M.r2aj - 0.8148) < 5e-5 && Math.abs(M.F - 69.21) < 5e-3 && Math.abs(M.pF / 9.109e-12 - 1) < 1e-4);
    assert.ok(Math.abs(M.errorTipico - 2.593) < 5e-4); assert.equal(M.gl, 29);
});

test('predictores en escalas de 10⁻⁴ a 10⁵ y diseños mal condicionados (κ ≈ 10⁹–10¹²): los coeficientes, la SCE y los ajustados exactos', () => {
    for (const nombre of ['escalas', 'cubicaIngresos', 'cuadraticaAnio']) {
        const d = D.mco.disenos[nombre], e = E.mco[nombre], f = /** @type {any} */ (ajustarMco(d.y, d.cols));
        assert.ok(f, `${nombre}: se estima (κ(X) = ${e.cond.toExponential(1)})`);
        cercaV(f.beta, e.beta, 1e-10, `${nombre} b`); cerca(f.sce, e.sce, 1e-10, `${nombre} SCE`);
        // los ajustados se calculan con los coeficientes en crudo: con un año, términos de 2·10⁵ que se cancelan hasta ≈ 1, de
        // ahí un error absoluto de 10⁻¹⁰ (no de la QR, de la parametrización)
        f.ajustados.forEach((/** @type {number} */ a, /** @type {number} */ i) => assert.ok(Math.abs(a - e.ajustados[i]) <= 1e-9 * (1 + Math.abs(e.ajustados[i])), `${nombre} ajustado ${i}: ${a} frente a ${e.ajustados[i]}`));
    }
    // con unidades muy distintas, los coeficientes siguen siendo exactos (la QR no depende de la escala de cada columna)
    const d = D.mco.disenos.escalas, M = /** @type {any} */ (regresionMco(d.y, d.cols));
    cercaV(M.beta, E.mco.escalas.beta, 1e-12, 'escalas b'); cercaV(M.ee, E.mco.escalas.ee, 1e-12, 'escalas EE'); cercaV(M.vif, E.mco.escalas.vif, 1e-12, 'escalas VIF');
});

test('ponderados: la solución exacta de X\'WX·b = X\'Wy (y la diagonal de (X\'WX)⁻¹)', () => {
    const d = D.mco.disenos.ponderada, e = E.mco.ponderada, f = /** @type {any} */ (ajustarMco(d.y, d.cols, { pesos: d.pesos }));
    cercaV(f.beta, e.beta, 1e-12, 'b'); cerca(f.sce, e.sce, 1e-12, 'Σw·e²'); cercaV(f.diagInversa, e.diagInversa, 1e-12, 'diagonal de (X\'WX)⁻¹');
    const sinPesos = /** @type {any} */ (ajustarMco(d.y, d.cols));
    assert.ok(Math.abs(sinPesos.beta[1] - f.beta[1]) > 1e-6, 'los pesos cambian la solución');
});

test('colinealidad, invariante a la escala y al origen: exacta, escalada por 10⁶, combinación de dos y constante → null', () => {
    assert.equal(TOLERANCIA_COLINEALIDAD, 1e-7, 'la de lm de R');
    for (const [nombre, d] of Object.entries(D.mco.colineales)) {
        assert.equal(ajustarMco(d.y, d.cols), null, nombre); assert.equal(regresionMco(d.y, d.cols), null, nombre);
    }
    // la vista principal lo informa también con predictores en millones (hasta la 2026.12.20, el pivote mínimo absoluto de
    // Gauss-Jordan no lo detectaba y daba coeficientes sin sentido)
    const d = D.mco.colineales.escaladaMillon;
    A.cargarDatos(d.y.map((/** @type {number} */ y, /** @type {number} */ i) => ({ y, g1: d.cols[0][i], g2: d.cols[1][i] })));
    assert.match(RM.regresion('y', ['g1', 'g2']).error, /perfectamente colineales/);
    assert.match(RM._olsFull(d.y, d.cols, ['g1', 'g2']).error, /colineales/);
    // con una tolerancia de 10⁻³, una parte propia de 10⁻⁵ ya no basta; con la de R, sí
    const c = D.mco.disenos.casiColineal;
    assert.ok(ajustarMco(c.y, c.cols)); assert.equal(ajustarMco(c.y, c.cols, { tolerancia: 1e-3 }), null);
    assert.equal(ajustarMco([1, 2], [[1, 2], [3, 4]]), null, 'menos casos que coeficientes');
    // y no rechaza un predictor legítimo por sus unidades: el de mtcars en nanos (×10⁻⁹) o en gigas (×10⁹)
    const m = D.mco.disenos.mtcars, base = /** @type {any} */ (ajustarMco(m.y, m.cols));
    for (const f of [1e-9, 1e9]) {
        const r = /** @type {any} */ (ajustarMco(m.y, [m.cols[0].map((/** @type {number} */ v) => v * f), m.cols[1]]));
        assert.ok(r, `wt × ${f}`); cerca(r.beta[1] * f, base.beta[1], 1e-12, `pendiente de wt × ${f}`); cerca(r.sce, base.sce, 1e-12, `SCE con wt × ${f}`);
    }
    assert.ok(ajustarMco([1, 2, 4], [[0, 1, 2]]), 'con n = p + 1 se estima (la recta del techo de la nube usa dos puntos: n = p)');
    // el núcleo centra cada predictor antes de la QR: un predictor que varía poco respecto de su tamaño no es «colineal con
    // la constante» (lm de R, que juzga la columna sin centrar, lo declararía así): una fecha AAAAMMDD de cinco días...
    const fechas = Array.from({ length: 30 }, (_, i) => 20240101 + (i % 5)), yf = fechas.map((v, i) => 0.25 * (v - 20240101) + Math.sin(i));
    const rf = /** @type {any} */ (regresionMco(yf, [fechas])), r0 = /** @type {any} */ (regresionMco(yf, [fechas.map(v => v - 20240101)]));
    assert.ok(rf, 'la fecha se estima'); cerca(rf.beta[1], r0.beta[1], 1e-9, 'pendiente de la fecha = la de los días'); cerca(rf.pValores[1], r0.pValores[1], 1e-8, 'su p');
    // ...y la cúbica de un año en crudo (x, x², x³: κ(X) ≈ 10¹⁷ sin centrar) se estima con la precisión de la exacta
    const ca = D.mco.disenos.cubicaAnioCruda, ec = E.mco.cubicaAnioCruda, fa = /** @type {any} */ (ajustarMco(ca.y, ca.cols));
    assert.ok(fa, 'la cúbica cruda de un año'); cercaV(fa.beta, ec.beta, 1e-8, 'sus coeficientes'); cerca(fa.sce, ec.sce, 1e-12, 'su SCE'); cercaV(fa.diagInversa, ec.diagInversa, 1e-8, 'su diagonal de (X\'X)⁻¹');
    // con una y constante no hay inferencia (t, F y β saldrían del redondeo)
    assert.equal(regresionMco(new Array(40).fill(5), [D.x1.slice(0, 40), D.x2.slice(0, 40)]), null, 'y constante');
    assert.ok(ajustarMco([1, 3], [[0, 1]]), 'n = p: ajuste exacto');
});

test('con un predictor, la QR da la recta de la forma cerrada (regresion-simple.js)', () => {
    for (const [x, y] of [[D.x1, D.y], [D.mco.disenos.mtcars.cols[0], D.mco.disenos.mtcars.y]]) {
        const M = /** @type {any} */ (regresionMco(y, [x])), S = regresionSimple(x, y);
        cerca(M.beta[0], S.intercepto, 1e-12, 'intercepto'); cerca(M.beta[1], S.pendiente, 1e-12, 'pendiente');
        cerca(M.ee[1], S.errorEstandarPendiente, 1e-12, 'EE de la pendiente'); cerca(M.pValores[1], S.pPendiente, 1e-9, 'p de la pendiente');
        cerca(M.r2, S.r2, 1e-12, 'R²'); cerca(M.errorTipico, S.errorEstandarEstimacion, 1e-12, 'error típico'); assert.equal(M.vif[0], 1);
    }
});

test('la QR de Householder: Qᵀ conserva las normas, R·β = Qᵀy, la diagonal de (X\'X)⁻¹ y el pivoteo de las columnas colineales', () => {
    const X = [[1, 1, 1, 1, 1], [1, 2, 3, 4, 6], [2, 1, 0, 1, 3]], y = [3, 5, 6, 9, 14];
    const f = factorQR(X), z = aplicarQt(f, y);
    cerca(Math.hypot(...z), Math.hypot(...y), 1e-14, '‖Qᵀy‖ = ‖y‖');
    const b = resolverR(f, z);
    for (let i = 0; i < 3; i++) { let s = 0; for (let j = i; j < 3; j++) s += elementoR(f, i, j) * /** @type {number} */ (b[j]); cerca(s, /** @type {number} */ (z[i]), 1e-13, `R·β fila ${i}`); }
    // (X'X)⁻¹ explícita, por cofactores de la 3 × 3
    const G = [0, 1, 2].map(i => [0, 1, 2].map(j => /** @type {number[]} */ (X[i]).reduce((s, v, k) => s + v * /** @type {number[]} */ (X[j])[k], 0)));
    const g = (/** @type {number} */ i, /** @type {number} */ j) => /** @type {number} */ (/** @type {number[]} */ (G[i])[j]);
    const det = g(0, 0) * (g(1, 1) * g(2, 2) - g(1, 2) * g(2, 1)) - g(0, 1) * (g(1, 0) * g(2, 2) - g(1, 2) * g(2, 0)) + g(0, 2) * (g(1, 0) * g(2, 1) - g(1, 1) * g(2, 0));
    const diag = [g(1, 1) * g(2, 2) - g(1, 2) * g(2, 1), g(0, 0) * g(2, 2) - g(0, 2) * g(2, 0), g(0, 0) * g(1, 1) - g(0, 1) * g(1, 0)].map(c => c / det);
    cercaV(diagonalInversaXtX(f), diag, 1e-12, 'diagonal de (X\'X)⁻¹');
    // (X'X)⁻¹ completa (la de las covarianzas «sándwich» de las confirmaciones y del cribado): por cofactores
    const cof = (/** @type {number} */ i, /** @type {number} */ j) => { const f2 = [0, 1, 2].filter(a => a !== i), c2 = [0, 1, 2].filter(a => a !== j); return ((i + j) % 2 ? -1 : 1) * (g(/** @type {number} */ (f2[0]), /** @type {number} */ (c2[0])) * g(/** @type {number} */ (f2[1]), /** @type {number} */ (c2[1])) - g(/** @type {number} */ (f2[0]), /** @type {number} */ (c2[1])) * g(/** @type {number} */ (f2[1]), /** @type {number} */ (c2[0]))); };
    const inv = inversaXtX(f);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cerca(/** @type {number} */ (/** @type {Float64Array} */ (inv[i])[j]), cof(j, i) / det, 1e-12, `(X'X)⁻¹[${i}][${j}]`);
    const m = D.mco.disenos.mtcars, conInv = /** @type {any} */ (ajustarMco(m.y, m.cols, { conInversa: true }));
    cercaV(conInv.inversa.map((/** @type {Float64Array} */ fila, /** @type {number} */ j) => fila[j]), E.mco.mtcars.diagInversa, 1e-12, 'diagonal de la inversa completa = la exacta');
    // Qᵀ·A = R: debajo de la diagonal, ceros, también con columnas casi alineadas con −eₗ (el signo del reflector evita la
    // cancelación de x₀ − α) y en una matriz cualquiera
    for (const M of [[[-1, 1e-9, 2e-9, 0, 1e-9], [1, 2, 3, 4, 5]], [[2, -1, 0, 3, 1, 1], [1, 1, 1, 1, 1, 1], [-3, 2, 5, 1, 0, 2], [0.5, -2, 1, 1, 4, -1]]]) {
        const q = factorQR(M), norma = Math.max(...M.map(c => Math.hypot(...c)));
        M.forEach((c, j) => {
            const z = aplicarQt(q, c);
            for (let i = 0; i < z.length; i++) {
                const esperado = i <= j ? elementoR(q, i, j) : 0;
                assert.ok(Math.abs(/** @type {number} */ (z[i]) - esperado) <= 1e-14 * norma, `(QᵀA)[${i}][${j}] = ${z[i]} frente a ${esperado}`);
            }
        });
    }
    // una columna colineal pasa al final (dqrdc2) y no cuenta en el rango
    const c = factorQR([[1, 1, 1, 1], [1, 2, 3, 4], [2, 4, 6, 8], [1, 0, 1, 0]]);
    assert.equal(c.rango, 3); assert.deepEqual(c.pivote, [0, 1, 3, 2]); assert.deepEqual(c.colineales, [2]);
});

test('el mejor modelo con X = años: los polinomios centrados dan la SCE exacta (antes, la cúbica en crudo era errónea sin aviso)', () => {
    const d = D.mco.disenos.cubicaAnioCruda, e = E.mcoAnio;
    A.cargarDatos(d.y.map((/** @type {number} */ y, /** @type {number} */ i) => ({ anio: d.cols[0][i], y })));
    const MM = RM.mejorModelo('anio', 'y', 'Año', 'Y');
    for (const nombre of ['Lineal', 'Cuadrática', 'Cúbica']) {
        const c = MM.candidatos.find((/** @type {any} */ x) => x.nombre === nombre);
        assert.ok(c, `${nombre} entre los candidatos`); cerca(c.R2, 1 - e[nombre] / e.sct, 1e-9, `${nombre}: R²`);
        // la curva (centrada) y la ecuación en x cruda describen el mismo polinomio
        for (const xv of [1992, 2007.3, 2023]) {
            const crudo = c.B.reduce((/** @type {number} */ s, /** @type {number} */ b, /** @type {number} */ j) => s + b * xv ** j, 0);
            assert.ok(Math.abs(RM._evalModelo(c, xv) - crudo) < 1e-6 * (1 + Math.abs(crudo)), `${nombre} en ${xv}`);
        }
    }
});

test('las vistas usan el núcleo: la regresión de la vista principal, la avanzada (su VIF) y el MCO agregado de las formas', () => {
    const d = D.mco.disenos.normal, e = E.mco.normal;
    A.cargarDatos(d.y.map((/** @type {number} */ y, /** @type {number} */ i) => ({ y, a: d.cols[0][i], b: d.cols[1][i], c: d.cols[2][i] })));
    const R = RM.regresion('y', ['a', 'b', 'c']);
    R.coefs.forEach((/** @type {any} */ c, /** @type {number} */ j) => { cerca(c.b, e.beta[j], 1e-10, `b${j}`); cerca(c.se, e.ee[j], 1e-10, `EE${j}`); cerca(c.pValor, e.p[j], 1e-7, `p${j}`); });
    cercaV(R.vifs, e.vif, 1e-10, 'VIF de la vista principal'); cerca(R.R2, e.r2, 1e-11, 'R²');
    // «De la correlación al control estadístico»: el efecto crudo es la pendiente de la recta simple (la forma cerrada) y el
    // ajustado, el coeficiente del modelo completo; el modelo completo queda como el último (hasta ahora, sin prueba)
    const cva = RM.crudoVsAjustado(R), S = regresionSimple(d.cols[0], d.y);
    cerca(cva.crudo.b, S.pendiente, 1e-12, 'efecto crudo'); cerca(cva.crudo.p, S.pPendiente, 1e-9, 'p del crudo'); cerca(cva.ajustado.b, e.beta[1], 1e-11, 'efecto ajustado');
    cerca(cva.cambioPct, 100 * (e.beta[1] - S.pendiente) / Math.abs(S.pendiente), 1e-10, 'cambio porcentual'); assert.equal(cva.sobrevive, e.p[1] < 0.05);
    assert.equal(RM._ultimaRegresion, R, 'el modelo completo sigue siendo el último');
    const V = RM.regresionAvanzada('y', ['a', 'b', 'c'], 'y', ['a', 'b', 'c']);
    cercaV(V.vifs, e.vif, 1e-10, 'VIF de la avanzada'); cerca(V.jerarquica.R2b2, e.r2, 1e-11, 'R² del bloque completo');
    // una dependiente constante: el aviso claro en las cuatro vistas (antes, una F negativa y p salidos del redondeo)
    A.cargarDatos(Array.from({ length: 40 }, (_, i) => ({ y: 5, a: i, b: (i * 7) % 11, g: ['p', 'q'][i % 2] })));
    for (const r of [RM.regresion('y', ['a', 'b']), RM.regresionAvanzada('y', ['a', 'b'], 'y', ['a', 'b']), RM.ancova('g', 'y', 'a'), RM.mejorModelo('a', 'y')]) assert.match(r.error, /no varía/);
    // las formas resumen los casos por valor distinto de X: el ajuste ponderado es el de todos los casos
    const x = Float64Array.from({ length: 300 }, (_, i) => 1 + (i % 7)), y = Float64Array.from(x, (v, i) => (v - 4) ** 2 + Math.sin(i));
    const modelos = DF.ajustarModelos(x, y).modelos || DF.ajustarModelos(x, y);
    const n = x.length, mx = x.reduce((s, v) => s + v, 0) / n, sx = Math.sqrt(x.reduce((s, v) => s + (v - mx) ** 2, 0) / n), z = Array.from(x, v => (v - mx) / sx);
    for (const [id, grado] of [['lineal', 1], ['cuadratica', 2], ['cubica', 3]]) {
        const m = modelos.find((/** @type {any} */ q) => q.id === id), todos = /** @type {any} */ (ajustarMco(y, Array.from({ length: /** @type {number} */ (grado) }, (_, g) => z.map(v => v ** (g + 1)))));
        cerca(m.rss, todos.sce, 1e-10, `${id}: SCR agregada = la de los ${n} casos`);
    }
});
