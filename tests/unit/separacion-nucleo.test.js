// @ts-check
// tests/unit/separacion-nucleo.test.js — (2026.12.23) ¿tiene la logística o Poisson una estimación finita?
// La prueba exacta por programación lineal de core/stats/separacion.js, sobre la fase 1 del símplex de
// core/linalg/simplex.js. Antes el motor de los modelos lineales generalizados deducía la separación de cómo se comportaba
// el ajuste (coeficientes que crecían, errores típicos de 10⁶) y rechazaba estimaciones finitas que R calcula (un caso de
// palanca cuya respuesta contradice un ajustado de 10⁻¹²). Referencia: tests/oracle/separacion_oraculo.py, con la
// programación lineal HiGHS de SciPy (independiente del símplex propio), en 320 bases de diseños variados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fase1 } from '../../src/core/linalg/simplex.js';
import { hayEstimacionFinita } from '../../src/core/stats/separacion.js';
import { ajustarMlg } from '../../src/core/stats/mlg.js';

const { casos } = JSON.parse(fs.readFileSync(new URL('../oracle/separacion_fixture.json', import.meta.url), 'utf8'));
/** @param {any} y @param {any[]} cols @param {any} familia @returns {any} */
const ajustar = (y, cols, familia) => ajustarMlg(y, cols, { familia });
/** Un generador congruencial (el de MINSTD), para datos reproducibles. @param {number} semilla */
const generador = semilla => {
    let s = semilla;
    const u = () => (s = (s * 48271) % 2147483647) / 2147483647;
    return { u, nor: () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u()) };
};

test('la existencia de la estimación, igual que la programación lineal de SciPy en las 320 bases del oráculo; y el ajuste, coherente con ella', () => {
    assert.ok(casos.length >= 300);
    const tipos = new Set(casos.map((/** @type {any} */ c) => `${c.familia}/${c.finita}`));
    assert.equal(tipos.size, 4, 'hay bases finitas y separadas de las dos familias');
    for (const [i, c] of casos.entries()) {
        assert.equal(hayEstimacionFinita(c.y, c.cols, c.familia), c.finita, `base ${i} (${c.familia}, ${c.tipo})`);
        const M = ajustar(c.y, c.cols, c.familia);
        if (c.finita) assert.ok(!('error' in M), `base ${i} (${c.familia}, ${c.tipo}): estimación finita rechazada: ${M.error}`);
        else assert.match(M.error || '', /^Separación/, `base ${i} (${c.familia}, ${c.tipo}): sin estimación finita, pero ${M.error || 'se estimó'}`);
    }
});

test('casos de libro: separación completa, casi completa, por una combinación de predictores y los ceros de Poisson', () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8];
    assert.equal(hayEstimacionFinita([0, 0, 0, 0, 1, 1, 1, 1], [x], 'logistica'), false, 'completa: x > 4,5 ⇔ y = 1');
    assert.equal(hayEstimacionFinita([0, 0, 0, 1, 0, 1, 1, 1], [[1, 2, 3, 4, 4, 5, 6, 7]], 'logistica'), false, 'casi completa: el empate en x = 4');
    assert.equal(hayEstimacionFinita([0, 0, 1, 0, 1, 0, 1, 1], [x], 'logistica'), true, 'solapamiento');
    // ningún predictor separa por sí solo, pero x₁ + x₂ > 0 ⇔ y = 1
    const x1 = [-3, -1, 2, 1, -2, 3, 0.5, -0.5], x2 = [1, 2, -1, 0.5, 1, -2, 1, 0.2], ySuma = x1.map((v, i) => (v + /** @type {number} */ (x2[i]) > 0 ? 1 : 0));
    assert.equal(hayEstimacionFinita(ySuma, [x1], 'logistica'), true, 'x₁ sola no separa');
    assert.equal(hayEstimacionFinita(ySuma, [x2], 'logistica'), true, 'x₂ sola no separa');
    assert.equal(hayEstimacionFinita(ySuma, [x1, x2], 'logistica'), false, 'la combinación sí');
    const g = [0, 0, 0, 0, 1, 1, 1, 0, 0, 1];
    assert.equal(hayEstimacionFinita([2, 0, 3, 1, 0, 0, 0, 4, 1, 0], [g], 'poisson'), false, 'Poisson: todos los conteos 0 en el grupo g = 1');
    assert.equal(hayEstimacionFinita([2, 0, 3, 1, 0, 1, 0, 4, 1, 0], [g], 'poisson'), true, 'Poisson: un conteo positivo en el grupo basta');
    assert.equal(hayEstimacionFinita([2, 1, 3, 1, 5, 2, 1, 4, 1, 2], [g], 'poisson'), true, 'Poisson sin ceros');
    // Poisson con un predictor continuo: los ceros solo separan si los conteos positivos están en un hiperplano
    assert.equal(hayEstimacionFinita([0, 0, 0, 1, 2, 0, 3, 4], [x], 'poisson'), true, 'Poisson: x continua, ceros a un lado');
});

test('(2026.12.23) casos difíciles para la tolerancia de la prueba exacta: predictores casi duplicados y un valor de 10¹⁰ o más', () => {
    // Poisson separada (demostrado en aritmética racional por un revisor) con x₀ y x₁ casi iguales: la dirección del
    // certificado tiene una componente enorme en la dirección casi nula del diseño, y una holgura en ‖d‖ la rechazaría
    // (null); por eso cada caso se comprueba con la suya
    const x0 = [0.14947935326219478, -0.8332804123219585, -0.9958282040335172, -0.6081673139842028, 0.8638024154993258, -1.2489448817196331, 0.6733040150017268, 0.43658731655611377];
    const x1 = [0.14947583405210893, -0.8332891869639276, -0.9958287176731425, -0.6081833145514839, 0.8638081143064401, -1.2489299910486307, 0.673303429529198, 0.4365879565066919];
    const x2 = [-0.7856578784232886, 0.677185999188885, -0.17704688581463385, 0.37195282787738015, -0.8097041760692669, 0.7995742255480862, -0.37896643249819656, -0.9257004597095294];
    assert.equal(hayEstimacionFinita([0, 0, 0, 0, 0, 0, 0, 1], [x0, x1, x2], 'poisson'), false);
    assert.match(ajustar([0, 0, 0, 0, 0, 0, 0, 1], [x0, x1, x2], 'poisson').error || '', /^Separación en Poisson/);
    // dos predictores que difieren en una diezmilésima en uno o dos casos (de un revisor): con una holgura en ‖d‖ no se
    // decidían (la 2026.12.22 llamaba «casi colineales» a la logística separada)
    const p0 = [1.088224, 1.41501, 0.344316, 1.023848, 0.075225, 0.743068, 0.021795, 0.966198], p1 = [1.088224, 1.41501, 0.344316, 1.023848, 0.075224, 0.743068, 0.021796, 0.966198];
    assert.equal(hayEstimacionFinita([0, 0, 0, 0, 1, 0, 0, 0], [p0, p1], 'poisson'), false);
    assert.match(ajustar([0, 0, 0, 0, 1, 0, 0, 0], [p0, p1], 'poisson').error || '', /^Separación en Poisson/);
    const l0 = [-1.0505, -0.1785, 0.5195, -0.3846, 1.8882, -1.1822, -1.0005, 1.1962], l1 = [-1.0505, -0.1784, 0.5195, -0.3846, 1.8883, -1.1822, -1.0005, 1.1962];
    assert.equal(hayEstimacionFinita([0, 0, 1, 1, 0, 0, 1, 0], [l0, l1], 'logistica'), false);
    assert.match(ajustar([0, 0, 1, 1, 0, 0, 1, 0], [l0, l1], 'logistica').error || '', /^Separación perfecta/);
    // un valor de 10¹⁰ a 10¹⁴ entre puntuaciones Likert, sin separación: tipificar con la media y la DE comprimiría las demás
    // diferencias por debajo de la tolerancia del símplex y la base parecería separada (la 2026.12.22 decía «separación» en
    // 5 de estas 8 logísticas)
    const xl = [1, 3, 2, 5, 4, 2, 3, 1, 5, 4, 2, 3], yl = [0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1];
    for (const codigo of [1e10, 1e11, 1e14, -1e12]) {
        for (const yc of [0, 1]) assert.equal(hayEstimacionFinita([...yl, yc], [[...xl, codigo]], 'logistica'), true, `Likert con ${codigo} (y = ${yc})`);
        assert.equal(hayEstimacionFinita([...yl.map(v => 2 * v), 0], [[...xl, codigo]], 'poisson'), true, `Poisson con ${codigo}`);
    }
});

test('la decisión no depende de las unidades ni del origen de los predictores', () => {
    const { u, nor } = generador(20261222);
    for (let r = 0; r < 40; r++) {
        const n = 12 + (r % 3) * 10, familia = r % 2 ? 'poisson' : 'logistica';
        const x1 = Array.from({ length: n }, nor), x2 = Array.from({ length: n }, () => Math.round(1 + 4 * u()));
        const y = x1.map((v, i) => (familia === 'logistica' ? (u() < 1 / (1 + Math.exp(-3 * v - 2 * (/** @type {number} */ (x2[i]) - 3))) ? 1 : 0)
            : (/** @type {number} */ (x2[i]) === 1 ? 0 : Math.floor(-Math.log(u()) * 1.5))));
        if (Math.min(...y) === Math.max(...y)) continue;
        const ref = hayEstimacionFinita(y, [x1, x2], familia);
        assert.notEqual(ref, null, `base ${r}: decidida`);
        for (const [escala, origen] of [[1e-6, 0], [1e6, 0], [1e-12, 0], [1e12, 0], [1, 1e6], [1e-3, 20240101]]) {
            const t = (/** @type {number[]} */ c) => c.map(v => origen + escala * v);
            assert.equal(hayEstimacionFinita(y, [t(x1), t(x2)], familia), ref, `base ${r} con ×${escala} + ${origen}`);
        }
    }
});

test('la fase 1 del símplex: soluciones comprobadas, el certificado de Farkas cuando no hay solución y null si no puede decidir', () => {
    /** @param {number[][]} filas @returns {Float64Array} la matriz por columnas */
    const porColumnas = filas => { const m = filas.length, nc = /** @type {number[]} */ (filas[0]).length, A = new Float64Array(m * nc); for (let r = 0; r < m; r++) for (let j = 0; j < nc; j++) A[j * m + r] = /** @type {number} */ (/** @type {number[]} */ (filas[r])[j]); return A; };
    /** @param {Float64Array} A @param {number} m @param {number} nc @param {ArrayLike<number>} x */
    const producto = (A, m, nc, x) => { const s = new Float64Array(m); for (let j = 0; j < nc; j++) for (let r = 0; r < m; r++) s[r] = /** @type {number} */ (s[r]) + /** @type {number} */ (A[j * m + r]) * /** @type {number} */ (x[j]); return s; };
    // factible (con una fila de b negativa)
    let A = porColumnas([[1, 1, 0], [0, 1, -1]]), R = fase1(A, 2, 3, [2, -3]);
    assert.ok(R && R.factible);
    let Ax = producto(A, 2, 3, R.x);
    assert.ok(Math.abs(/** @type {number} */ (Ax[0]) - 2) < 1e-12 && Math.abs(/** @type {number} */ (Ax[1]) + 3) < 1e-12 && R.x.every(v => v >= 0), `A·x = b con x ≥ 0: ${Array.from(R.x)}`);
    // b = 0: x = 0, sin iterar
    R = fase1(A, 2, 3, [0, 0]); assert.ok(R && R.factible && R.iteraciones === 0);
    // sin solución: x₁ + x₂ = 1 y x₁ + x₂ = 2
    A = porColumnas([[1, 1], [1, 1]]); R = fase1(A, 2, 2, [1, 2]);
    assert.ok(R && !R.factible);
    const y = R.y, Aty = [0, 1].map(j => /** @type {number} */ (A[j * 2]) * /** @type {number} */ (y[0]) + /** @type {number} */ (A[j * 2 + 1]) * /** @type {number} */ (y[1]));
    assert.ok(Aty.every(v => v <= 1e-9) && 1 * /** @type {number} */ (y[0]) + 2 * /** @type {number} */ (y[1]) > 1e-6, `certificado: Aᵀy ≤ 0 y bᵀy > 0 (y = ${Array.from(y)})`);
    // sistemas grandes al azar: factibles por construcción (b = A·x* con x* ≥ 0) o no (todas las columnas positivas, b < 0)
    const { u, nor } = generador(7);
    for (let r = 0; r < 25; r++) {
        const m = 2 + (r % 6), nc = 30 + 7 * r, B = new Float64Array(m * nc).map(nor), xs = new Float64Array(nc).map(() => (u() < 0.3 ? u() : 0));
        const b = producto(B, m, nc, xs), S = fase1(B, m, nc, b);
        assert.ok(S && S.factible, `factible ${r}`);
        const Bx = producto(B, m, nc, S.x);
        assert.ok(Array.from(Bx).every((v, i) => Math.abs(v - /** @type {number} */ (b[i])) < 1e-8 * (1 + Math.abs(/** @type {number} */ (b[i])))), `factible ${r}: A·x = b`);
        const P = new Float64Array(m * nc).map(() => 0.1 + u()), bn = new Float64Array(m).map((_, i) => (i === 0 ? -1 : u()));
        const N = fase1(P, m, nc, bn);
        assert.ok(N && !N.factible, `no factible ${r}`);
        let bty = 0; for (let i = 0; i < m; i++) bty += /** @type {number} */ (bn[i]) * /** @type {number} */ (N.y[i]);
        for (let j = 0; j < nc; j++) { let s = 0; for (let i = 0; i < m; i++) s += /** @type {number} */ (P[j * m + i]) * /** @type {number} */ (N.y[i]); assert.ok(s <= 1e-7, `no factible ${r}: Aᵀy ≤ 0 en la columna ${j}`); }
        assert.ok(bty > 1e-9, `no factible ${r}: bᵀy > 0`);
    }
    // con las iteraciones agotadas no inventa una respuesta
    const B = new Float64Array(6 * 80).map(nor), b = producto(B, 6, 80, new Float64Array(80).fill(0.5));
    assert.equal(fase1(B, 6, 80, b, { maxIteraciones: 2 }), null);
});

test('rendimiento razonable: 20 000 casos y 6 predictores se deciden en un tiempo acotado (sin medir la máquina: solo que termina)', () => {
    const { u, nor } = generador(99);
    const n = 20000, cols = Array.from({ length: 6 }, () => Array.from({ length: n }, nor));
    const y = Array.from({ length: n }, (_, i) => (u() < 1 / (1 + Math.exp(-(/** @type {number} */ (/** @type {number[]} */ (cols[0])[i]) * 2))) ? 1 : 0));
    assert.equal(hayEstimacionFinita(y, cols, 'logistica'), true);
    const ySep = /** @type {number[]} */ (cols[0]).map((v, i) => (v + 0.5 * /** @type {number} */ (/** @type {number[]} */ (cols[1])[i]) > 0 ? 1 : 0));
    assert.equal(hayEstimacionFinita(ySep, cols, 'logistica'), false);
});
