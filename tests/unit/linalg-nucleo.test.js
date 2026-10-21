// @ts-check
// tests/unit/linalg-nucleo.test.js — (2026.12.25, cierre de la fase F6) el álgebra lineal del núcleo único (core/linalg/):
// Cholesky (estricto, con tolerancia y forzado), la inversa triangular, la inversa definida positiva y su log-determinante;
// Gauss-Jordan con ln|det| y su signo, la inversa general y el determinante; Jacobi, el suavizado de una matriz de
// correlaciones y el factor polar; las operaciones elementales; Q·z de la QR; el proyector de residuos de los mínimos
// cuadrados (core/stats/mco.js) y la bisección y la sección áurea (core/stats/optimizacion.js). Referencias
// independientes: la inversa y el determinante EXACTOS en aritmética racional (BigInt), los autovalores en forma cerrada,
// las propiedades que definen cada resultado (A·A⁻¹ = I, A·v = λ·v, UᵀU = I con UᵀX simétrica definida positiva…) y,
// donde la unificación prometía no cambiar nada, el código que había antes, copiado aquí tal cual: la misma salida bit a
// bit (las bases del Simulador con una semilla dependen de ello).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cholesky, choleskyForzado, esDefinidaPositiva, inversaTriangularInferior, productoTriangularTraspuesto, inversaDefinidaPositiva, logDeterminanteDeFactor, logDeterminante, inversaYLogDet } from '../../src/core/linalg/cholesky.js';
import { gaussJordan, inversaGeneral, determinante } from '../../src/core/linalg/gauss.js';
import { autovaloresSimetrica, suavizarCorrelacion, definidaPositivaCon, factorPolar } from '../../src/core/linalg/autovalores.js';
import { ceros, identidad, traspuesta, multiplicar } from '../../src/core/linalg/matrices.js';
import { factorQR, aplicarQt, aplicarQ } from '../../src/core/linalg/qr.js';
import { proyectorResiduos, ajustarMco } from '../../src/core/stats/mco.js';
import { biseccion, minimizarSeccionAurea } from '../../src/core/stats/optimizacion.js';
import { mulberry32 } from '../../src/core/random/mulberry32.js';

// ---------------------------------------------------------------- referencias exactas (racionales con BigInt)
/** @typedef {[bigint, bigint]} Q */
/** @param {bigint} a @param {bigint} b @returns {bigint} */
const mcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
/** @param {bigint} n @param {bigint} [d] @returns {Q} */
const fr = (n, d = 1n) => { if (d < 0n) { n = -n; d = -d; } const g = mcd(n, d) || 1n; return [n / g, d / g]; };
/** @param {Q} x @param {Q} y */ const restar = (x, y) => fr(x[0] * y[1] - y[0] * x[1], x[1] * y[1]);
/** @param {Q} x @param {Q} y */ const mult = (x, y) => fr(x[0] * y[0], x[1] * y[1]);
/** @param {Q} x @param {Q} y */ const dividir = (x, y) => fr(x[0] * y[1], x[1] * y[0]);
/** @param {Q} x */ const aNumero = x => Number(x[0]) / Number(x[1]);
/** @param {Q} x */ const lnAbs = x => { const a = x[0] < 0n ? -x[0] : x[0]; return Math.log(Number(a)) - Math.log(Number(x[1])); };
/**
 * Inversa y determinante exactos de una matriz de enteros (Gauss-Jordan sobre racionales).
 * @param {number[][]} A
 * @returns {{ det: Q, inversa: number[][] | null }}
 */
function exacta(A) {
    const n = A.length;
    /** @type {Q[][]} */ const M = A.map((f, i) => [...f.map(v => fr(BigInt(v))), ...A.map((_, j) => fr(i === j ? 1n : 0n))]);
    /** @type {Q} */ let det = fr(1n);
    for (let c = 0; c < n; c++) {
        let p = c;
        while (p < n && /** @type {Q[]} */ (M[p])[c]?.[0] === 0n) p++;
        if (p === n) return { det: fr(0n), inversa: null };
        if (p !== c) { const t = /** @type {Q[]} */ (M[c]); M[c] = /** @type {Q[]} */ (M[p]); M[p] = t; det = mult(det, fr(-1n)); }
        const Mc = /** @type {Q[]} */ (M[c]), piv = /** @type {Q} */ (Mc[c]);
        det = mult(det, piv);
        M[c] = Mc.map(x => dividir(x, piv));
        for (let r = 0; r < n; r++) {
            const Mr = /** @type {Q[]} */ (M[r]), f = /** @type {Q} */ (Mr[c]);
            if (r === c || f[0] === 0n) continue;
            M[r] = Mr.map((x, j) => restar(x, mult(f, /** @type {Q} */ (/** @type {Q[]} */ (M[c])[j]))));
        }
    }
    return { det, inversa: M.map(f => f.slice(n).map(aNumero)) };
}

// ---------------------------------------------------------------- utilidades
const u = mulberry32(20261225);
/** @param {number} r @param {number} c @param {number} [rango] */
const enteraAleatoria = (r, c, rango = 9) => Array.from({ length: r }, () => Array.from({ length: c }, () => Math.floor(u() * (2 * rango + 1)) - rango));
/** BᵀB + I: simétrica definida positiva de enteros. @param {number} n */
const spdEntera = n => { const B = enteraAleatoria(n + 2, n, 4); return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => B.reduce((s, f) => s + /** @type {number} */ (f[i]) * /** @type {number} */ (f[j]), 0) + (i === j ? 1 : 0))); };
/** @param {ArrayLike<ArrayLike<number>>} M @returns {number[][]} */
const aArrays = M => Array.from(M, f => Array.from(f));
/** @param {ArrayLike<ArrayLike<number>>} A @param {ArrayLike<ArrayLike<number>>} B @param {number} tol @param {string} que */
function cercaM(A, B, tol, que) {
    assert.equal(A.length, B.length, `${que}: filas`);
    let escala = 0; for (const f of Array.from(B)) for (const v of Array.from(f)) escala = Math.max(escala, Math.abs(v));
    for (let i = 0; i < A.length; i++) for (let j = 0; j < /** @type {ArrayLike<number>} */ (B[i]).length; j++) {
        const a = /** @type {number} */ (/** @type {ArrayLike<number>} */ (A[i])[j]), b = /** @type {number} */ (/** @type {ArrayLike<number>} */ (B[i])[j]);
        assert.ok(Math.abs(a - b) <= tol * Math.max(escala, 1e-300), `${que}[${i}][${j}]: ${a} frente a ${b}`);
    }
}
/** Producto completo, sin saltar nada (referencia de multiplicar). @param {number[][]} A @param {number[][]} B */
const productoCompleto = (A, B) => A.map(f => Array.from({ length: /** @type {number[]} */ (B[0]).length }, (_, j) => { let s = 0; for (let t = 0; t < B.length; t++) s += /** @type {number} */ (f[t]) * /** @type {number} */ (/** @type {number[]} */ (B[t])[j]); return s; }));

// ---------------------------------------------------------------- Cholesky
test('cholesky: el factor exacto de una matriz de enteros, filas Float64Array; null si no es definida positiva, singular o no numérica', () => {
    const L = cholesky([[4, 12, -16], [12, 37, -43], [-16, -43, 98]]);
    assert.ok(L && L.every(f => f instanceof Float64Array));
    assert.deepEqual(aArrays(/** @type {Float64Array[]} */ (L)), [[2, 0, 0], [6, 1, 0], [-8, 5, 3]]);
    assert.equal(cholesky([[1, 2], [2, 1]]), null, 'indefinida');
    assert.equal(cholesky([[1, 1], [1, 1]]), null, 'semidefinida (pivote 0)');
    assert.equal(cholesky([[1, NaN], [NaN, 1]]), null, 'NaN');
    assert.equal(cholesky([[-1]]), null);
    assert.ok(esDefinidaPositiva([[2, 1], [1, 2]]) && !esDefinidaPositiva([[1, 2], [2, 1]]));
});

test('cholesky con tolerancia: relativa a |aᵢᵢ| (0 cuenta como 1) o absoluta', () => {
    const A = [[1, 0.999999], [0.999999, 1]];   // segundo pivote 1 − 0,999999² ≈ 2·10⁻⁶
    assert.ok(cholesky(A, { tolerancia: 1e-6 }), 'relativa 10⁻⁶: pasa');
    assert.equal(cholesky(A, { tolerancia: 1e-5 }), null, 'relativa 10⁻⁵: no pasa');
    const B = [[1e-8, 0], [0, 1]];   // pivote 10⁻⁸, enorme frente a 10⁻⁶·10⁻⁸ pero menor que 10⁻⁶
    assert.ok(cholesky(B, { tolerancia: 1e-6 }), 'relativa: el pivote se compara con su propia diagonal');
    assert.equal(cholesky(B, { tolerancia: 1e-6, absoluta: true }), null, 'absoluta: 10⁻⁸ < 10⁻⁶');
    assert.equal(cholesky([[0]], { tolerancia: 1e-12 }), null, 'diagonal 0: el umbral es 10⁻¹²·1');
    // la comprobación del Simulador (_esDefinidaPositiva): absoluta de 10⁻¹⁰
    assert.equal(esDefinidaPositiva([[1, 1 - 1e-11], [1 - 1e-11, 1]], { tolerancia: 1e-10, absoluta: true }), false);
    assert.equal(esDefinidaPositiva([[1, 0.99], [0.99, 1]], { tolerancia: 1e-10, absoluta: true }), true);
});

// El Cholesky forzado del Simulador, tal como estaba en simulador/dominio/generador.js hasta la 2026.12.24
/** @param {number[][]} A */
function choleskySimuladorAntes(A) {
    const n = A.length, L = Array.from({ length: n }, () => new Array(n).fill(0));
    let noDefinidaPositiva = false, forzada = false;
    for (let i = 0; i < n; i++) {
        for (let j = 0; j <= i; j++) {
            let suma = 0;
            for (let k = 0; k < j; k++) suma += L[i][k] * L[j][k];
            if (i === j) {
                const d = A[i][i] - suma;
                if (d <= 0) noDefinidaPositiva = true;
                if (d < 1e-9) forzada = true;
                L[i][j] = Math.sqrt(Math.max(d, 1e-9));
            } else {
                L[i][j] = (A[i][j] - suma) / (L[j][j] || 1e-9);
            }
        }
    }
    return { L, forzada, noDefinidaPositiva };
}

test('choleskyForzado: la aritmética del Simulador, bit a bit (también con matrices imposibles), y sus dos marcas', () => {
    for (let caso = 0; caso < 60; caso++) {
        const n = 2 + (caso % 7);
        // correlaciones al azar: unas definidas positivas, otras imposibles
        /** @type {number[][]} */ const R = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
        for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) /** @type {number[]} */ (R[i])[j] = /** @type {number[]} */ (R[j])[i] = (caso % 3 === 0 ? 1.9 : 0.9) * (u() - 0.5);
        const nuevo = choleskyForzado(R), viejo = choleskySimuladorAntes(R);
        assert.deepEqual(nuevo, viejo, `caso ${caso}`);
        assert.ok(nuevo.L.every(f => Array.isArray(f)), 'filas Array, como siempre');
        if (!nuevo.forzada) assert.deepEqual(nuevo.L, aArrays(/** @type {Float64Array[]} */ (cholesky(R))), 'sin forzar, el mismo factor que el estricto');
    }
    const imposible = choleskyForzado([[1, 0.9, -0.9], [0.9, 1, 0.9], [-0.9, 0.9, 1]]);
    assert.ok(imposible.forzada && imposible.noDefinidaPositiva && imposible.L.flat().every(Number.isFinite));
    assert.equal(/** @type {number[]} */ (imposible.L[2])[2], Math.sqrt(1e-9), 'el pivote imposible pasa al piso');
    const casi = choleskyForzado([[1, 1 - 1e-11], [1 - 1e-11, 1]]);   // pivote ≈ 2·10⁻¹¹: positivo pero bajo el piso
    assert.ok(casi.forzada && !casi.noDefinidaPositiva);
    const semidefinida = choleskyForzado([[1, 1], [1, 1]], 1e-12);   // pivote exactamente 0: no es definida positiva
    assert.deepEqual(semidefinida.L[1], [1, Math.sqrt(1e-12)], 'el piso es un parámetro (la selección usa 10⁻¹²)');
    assert.ok(semidefinida.forzada && semidefinida.noDefinidaPositiva);
});

// La inversa triangular del Simulador, tal como estaba hasta la 2026.12.24
/** @param {number[][]} S */
function inversaTriangularAntes(S) {
    const m = S.length, inv = Array.from({ length: m }, () => new Array(m).fill(0));
    for (let i = 0; i < m; i++) {
        inv[i][i] = 1 / (S[i][i] || 1e-9);
        for (let j = 0; j < i; j++) {
            let s = 0;
            for (let k = j; k < i; k++) s += S[i][k] * inv[k][j];
            inv[i][j] = -s / (S[i][i] || 1e-9);
        }
    }
    return inv;
}

test('inversaTriangularInferior: la del Simulador bit a bit, L·L⁻¹ = I y un caso exacto; productoTriangularTraspuesto = (L⁻¹)ᵀ·L⁻¹ con la suma completa', () => {
    assert.deepEqual(inversaTriangularInferior([[2, 0], [6, 1]]), [[0.5, 0], [-3, 1]]);
    for (let caso = 0; caso < 30; caso++) {
        const n = 2 + (caso % 6), L = /** @type {number[][]} */ (aArrays(/** @type {Float64Array[]} */ (cholesky(spdEntera(n)))));
        const Li = inversaTriangularInferior(L);
        assert.deepEqual(Li, inversaTriangularAntes(L), `caso ${caso}: la aritmética del Simulador`);
        cercaM(productoCompleto(L, Li), identidad(n), 1e-13, `caso ${caso}: L·L⁻¹`);
        const P = productoTriangularTraspuesto(Li), completo = productoCompleto(traspuesta(Li), Li);
        assert.deepEqual(aArrays(P), completo, `caso ${caso}: saltar los ceros no cambia ningún bit`);
    }
});

test('inversaDefinidaPositiva, logDeterminante e inversaYLogDet frente a la inversa y el determinante exactos', () => {
    for (let caso = 0; caso < 25; caso++) {
        const n = 2 + (caso % 6), A = spdEntera(n), ex = exacta(A);
        const inv = inversaDefinidaPositiva(A);
        assert.ok(inv, `caso ${caso}`);
        cercaM(/** @type {Float64Array[]} */ (inv), /** @type {number[][]} */ (ex.inversa), 1e-12, `caso ${caso}: A⁻¹`);
        const ld = /** @type {number} */ (logDeterminante(A));
        assert.ok(Math.abs(ld - lnAbs(ex.det)) <= 1e-13 * Math.max(1, Math.abs(ld)), `caso ${caso}: ln|A| ${ld} frente a ${lnAbs(ex.det)}`);
        const ambos = /** @type {{ inv: Float64Array[], logDet: number }} */ (inversaYLogDet(A));
        assert.deepEqual(ambos.inv, inv, 'una sola factorización: la misma inversa');
        assert.equal(ambos.logDet, ld);
        assert.equal(logDeterminanteDeFactor(/** @type {Float64Array[]} */ (cholesky(A))), ld);
    }
    assert.equal(inversaDefinidaPositiva([[1, 2], [2, 1]]), null);
    assert.equal(logDeterminante([[1, 2], [2, 1]]), null);
    assert.equal(inversaYLogDet([[0, 0], [0, 0]]), null);
    // la tolerancia de la RESET y de las confirmaciones de forma (relativa de 10⁻¹²): un sistema casi singular es null
    assert.equal(inversaDefinidaPositiva([[1, 1 - 1e-14], [1 - 1e-14, 1]], { tolerancia: 1e-12 }), null);
    assert.ok(inversaDefinidaPositiva([[1, 1 - 1e-14], [1 - 1e-14, 1]]), 'sin tolerancia, todavía se invierte');
    assert.equal(logDeterminante([[4, 12, -16], [12, 37, -43], [-16, -43, 98]]), 2 * (Math.log(2) + Math.log(1) + Math.log(3)));
});

// ---------------------------------------------------------------- Gauss-Jordan y determinante
test('gaussJordan: la inversa, ln|det| y su signo frente a la aritmética racional, con pivoteo (ceros en la diagonal y determinantes negativos)', () => {
    const fijos = [[[0, 1], [1, 0]], [[0, 2, 1], [1, 1, 0], [3, 0, 1]], [[2, -1, 0, 3], [0, 0, 1, -2], [1, 4, -2, 0], [-3, 1, 1, 1]]];
    const casos = [...fijos, ...Array.from({ length: 30 }, (_, k) => enteraAleatoria(2 + (k % 6), 2 + (k % 6)))];
    let negativos = 0;
    for (const [c, A] of casos.entries()) {
        const ex = exacta(A), r = gaussJordan(A, 1e-14);
        if (ex.det[0] === 0n) { assert.equal(r, null, `caso ${c}: singular`); continue; }
        assert.ok(r, `caso ${c}`);
        const g = /** @type {{ inversa: number[][], logDetAbs: number, signo: number }} */ (r);
        cercaM(g.inversa, /** @type {number[][]} */ (ex.inversa), 1e-11, `caso ${c}: A⁻¹`);
        assert.ok(Math.abs(g.logDetAbs - lnAbs(ex.det)) <= 1e-12 * Math.max(1, Math.abs(g.logDetAbs)), `caso ${c}: ln|det|`);
        assert.equal(g.signo, ex.det[0] < 0n ? -1 : 1, `caso ${c}: signo`);
        if (g.signo < 0) negativos++;
        cercaM(/** @type {number[][]} */ (inversaGeneral(A)), /** @type {number[][]} */ (ex.inversa), 1e-11, `caso ${c}: inversaGeneral`);
        const d = determinante(A), dEx = aNumero(ex.det);
        assert.ok(Math.abs(d - dEx) <= 1e-12 * Math.abs(dEx), `caso ${c}: det ${d} frente a ${dEx}`);
    }
    assert.ok(negativos >= 3, 'hay determinantes negativos entre los casos');
    assert.deepEqual(/** @type {any} */ (gaussJordan([[0, 1], [1, 0]], 1e-14)), { inversa: [[0, 1], [1, 0]], logDetAbs: 0, signo: -1 });
});

test('gaussJordan e inversaGeneral: null bajo el pivote mínimo; determinante: 0 con un pivote exactamente nulo y el signo de las permutaciones', () => {
    assert.equal(gaussJordan([[1, 2], [2, 4]], 1e-14), null);
    assert.equal(gaussJordan([[NaN, 0], [0, 1]], 1e-14), null, '(2026.12.25) un pivote NaN: null (antes, una inversa de NaN)');
    assert.equal(inversaGeneral([[1, 2], [3, NaN]]), null, 'NaN en la eliminación');
    const casiSingular = [[1, 0], [0, 1e-13]];
    assert.equal(gaussJordan(casiSingular, 1e-12), null, 'el del SEM (10⁻¹²)');
    assert.ok(gaussJordan(casiSingular, 1e-14), 'el general (10⁻¹⁴)');
    assert.equal(inversaGeneral([[1, 0], [0, 1e-15]]), null);
    assert.deepEqual(inversaGeneral([[1, 0], [0, 1e-13]]), [[1, 0], [0, 1e13]], 'un pivote de 10⁻¹³ todavía se invierte');
    assert.equal(determinante([[1, 2], [2, 4]]), 0);
    assert.equal(determinante([[0, 1], [1, 0]]), -1);
    assert.equal(determinante([[2, 0, 0], [0, 3, 0], [0, 0, 4]]), 24);
});

test('el SEM pide la inversa con su log-determinante y la rechaza si el determinante no es positivo', async () => {
    const { SEM } = await import('../../src/analizador/sem-motor.js');
    const S = /** @type {any} */ (SEM);
    assert.equal(S._invLogDet([[0, 1], [1, 0]]), null, 'det = −1');
    const r = S._invLogDet([[4, 2], [2, 3]]);
    assert.ok(r && Math.abs(r.logDet - Math.log(8)) < 1e-15);
    cercaM(r.inv, [[3 / 8, -2 / 8], [-2 / 8, 4 / 8]], 1e-15, 'inversa');
});

test('(2026.12.25) Σ(θ) del SEM: la de ram.js, con su condición de admisibilidad (det(I − A) > 0)', async () => {
    const { SEM } = await import('../../src/analizador/sem-motor.js');
    const { implicada } = await import('../../src/analizador/psicometria/ram.js');
    // dos variables observadas con efectos recíprocos: I − A = [[1, −a], [−b, 1]], det = 1 − a·b
    const est = { A: [[0, 0], [0, 0]], S: [[1, 0], [0, 2]], libres: [{ mat: 'A', i: 0, j: 1 }, { mat: 'A', i: 1, j: 0 }], nObs: 2 };
    const S = /** @type {any} */ (SEM);
    const bien = S._sigma(est, [0.5, 0.4]), libre = /** @type {any} */ (implicada(est, [0.5, 0.4]));
    assert.deepEqual(bien, libre.Sigma, 'det > 0: la misma Σ');
    // la exacta: B = (I − A)⁻¹ = [[1, a], [b, 1]]/(1 − ab), Σ = B·S·Bᵀ
    const a = 0.5, b = 0.4, d = 1 - a * b, B = [[1 / d, a / d], [b / d, 1 / d]], s = [1, 2];
    const exacta = [0, 1].map(i => [0, 1].map(j => [0, 1].reduce((t, k) => t + /** @type {number[]} */ (B[i])[k] * /** @type {number[]} */ (B[j])[k] * /** @type {number} */ (s[k]), 0)));
    cercaM(bien, exacta, 1e-14, 'Σ(θ)');
    assert.equal(S._sigma(est, [2, 1]), null, 'det(I − A) = −1: no admisible para el objetivo');
    assert.ok(implicada(est, [2, 1]), 'sin la condición, la inversa existe');
    assert.equal(S._sigma(est, [1, 1]), null, 'I − A singular');
});

// ---------------------------------------------------------------- autovalores, suavizado y factor polar
test('autovaloresSimetrica: los autovalores en forma cerrada de una tridiagonal, de mayor a menor; A·v = λ·v y V ortonormal', () => {
    const n = 6, T = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 2 : Math.abs(i - j) === 1 ? -1 : 0)));
    const { valores, vectores } = autovaloresSimetrica(T);
    const exactos = Array.from({ length: n }, (_, k) => 2 - 2 * Math.cos(((k + 1) * Math.PI) / (n + 1))).sort((a, b) => b - a);
    valores.forEach((v, k) => assert.ok(Math.abs(v - /** @type {number} */ (exactos[k])) < 1e-14, `λ${k}: ${v} frente a ${exactos[k]}`));
    for (let caso = 0; caso < 20; caso++) {
        const m = 2 + (caso % 8), B = enteraAleatoria(m, m), A = B.map((f, i) => f.map((_, j) => (/** @type {number} */ (f[j]) + /** @type {number} */ (/** @type {number[]} */ (B[j])[i])) / 2));
        const e = autovaloresSimetrica(A);
        for (let k = 1; k < m; k++) assert.ok(/** @type {number} */ (e.valores[k - 1]) >= /** @type {number} */ (e.valores[k]), 'orden');
        e.vectores.forEach((v, k) => {
            const Av = A.map(f => f.reduce((s, x, j) => s + x * /** @type {number} */ (v[j]), 0));
            Av.forEach((x, i) => assert.ok(Math.abs(x - /** @type {number} */ (e.valores[k]) * /** @type {number} */ (v[i])) < 1e-12 * 10 * m, `caso ${caso}: A·v = λ·v`));
            e.vectores.forEach((w, l) => { let s = 0; for (let i = 0; i < m; i++) s += /** @type {number} */ (v[i]) * /** @type {number} */ (w[i]); assert.ok(Math.abs(s - (k === l ? 1 : 0)) < 1e-13, 'ortonormal'); });
        });
    }
    const D = autovaloresSimetrica([[3, 0], [0, 5]]);
    assert.deepEqual(D.valores, [5, 3], 'ya diagonal: sin rotaciones');
});

test('suavizarCorrelacion: una matriz imposible pasa a definida positiva con diagonal 1 exacta; una válida vuelve intacta (copia)', () => {
    // autovalores en forma cerrada: 1,5 (el vector (0, 1, −1)) y los del bloque [[1, 0,9·√2], [0,9·√2, 0,5]], (1,5 ± √6,73)/2
    const R = [[1, 0.9, 0.9], [0.9, 1, -0.5], [0.9, -0.5, 1]], minimo = (1.5 - Math.sqrt(6.73)) / 2;
    assert.ok(minimo < 0, 'la de partida no es definida positiva');
    for (const piso of [1e-6, 1e-3]) {
        const s = suavizarCorrelacion(R, piso);
        assert.ok(s.suavizada);
        assert.ok(Math.abs(s.minAutovalor - minimo) < 1e-15, `el menor autovalor: ${s.minAutovalor} frente a ${minimo}`);
        s.R.forEach((f, i) => { assert.equal(f[i], 1); f.forEach((v, j) => assert.equal(v, /** @type {number[]} */ (s.R[j])[i])); });
        assert.ok(definidaPositivaCon(s.R, piso / 2), `piso ${piso}: definida positiva con margen`);
        assert.ok(cholesky(s.R) !== null);
    }
    const V = [[1, 0.3], [0.3, 1]], s = suavizarCorrelacion(V);
    assert.ok(!s.suavizada && s.R !== V && s.R[0] !== V[0]);
    assert.deepEqual(s.R, V);
    assert.ok(definidaPositivaCon([[1, 0], [0, 1]], 1e-6) && !definidaPositivaCon([[1, 0.9999999], [0.9999999, 1]], 1e-6));
});

test('factorPolar: U con columnas ortonormales y UᵀX simétrica definida positiva (X = U·P)', () => {
    for (let caso = 0; caso < 10; caso++) {
        const X = Array.from({ length: 6 }, () => Array.from({ length: 3 }, () => u() - 0.5));
        const U = factorPolar(X), UtU = multiplicar(traspuesta(U), U), P = multiplicar(traspuesta(U), X);
        cercaM(UtU, identidad(3), 1e-13, `caso ${caso}: UᵀU`);
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) assert.ok(Math.abs(/** @type {number} */ (/** @type {number[]} */ (P[i])[j]) - /** @type {number} */ (/** @type {number[]} */ (P[j])[i])) < 1e-13, 'UᵀX simétrica');
        assert.ok(cholesky(P) !== null, 'UᵀX definida positiva');
    }
});

// ---------------------------------------------------------------- operaciones elementales
test('ceros, identidad, traspuesta y multiplicar (saltar los ceros no cambia ningún bit)', () => {
    assert.deepEqual(ceros(2, 3), [[0, 0, 0], [0, 0, 0]]);
    assert.deepEqual(identidad(3), [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
    assert.deepEqual(traspuesta([[1, 2, 3], [4, 5, 6]]), [[1, 4], [2, 5], [3, 6]]);
    assert.deepEqual(traspuesta([Float64Array.of(1, 2)]), [[1], [2]]);
    for (let caso = 0; caso < 20; caso++) {
        const A = Array.from({ length: 4 }, () => Array.from({ length: 5 }, () => (u() < 0.5 ? 0 : u() - 0.5)));
        const B = Array.from({ length: 5 }, () => Array.from({ length: 3 }, () => u() - 0.5));
        assert.deepEqual(multiplicar(A, B), productoCompleto(A, B), `caso ${caso}`);
    }
});

// ---------------------------------------------------------------- QR: Q·z y el proyector de residuos
test('aplicarQ deshace aplicarQt (Q ortogonal) y conserva la norma', () => {
    const n = 25, cols = Array.from({ length: 4 }, () => Float64Array.from({ length: n }, () => u() - 0.5)), f = factorQR(cols);
    for (let k = 0; k < 5; k++) {
        const z = Float64Array.from({ length: n }, () => u() - 0.5), qz = aplicarQ(f, z);
        aplicarQt(f, qz).forEach((v, i) => assert.ok(Math.abs(v - /** @type {number} */ (z[i])) < 1e-14));
        aplicarQ(f, aplicarQt(f, z)).forEach((v, i) => assert.ok(Math.abs(v - /** @type {number} */ (z[i])) < 1e-14));
        const norma = (/** @type {ArrayLike<number>} */ v) => Math.sqrt(Array.from(v).reduce((s, x) => s + x * x, 0));
        assert.ok(Math.abs(norma(qz) - norma(z)) < 1e-14);
    }
});

test('proyectorResiduos: residuos ortogonales a la constante y a las columnas, idempotente, nulo en el espacio y estable con columnas colineales o constantes', () => {
    const n = 40, x1 = Float64Array.from({ length: n }, () => 10 + 3 * (u() - 0.5)), x2 = Float64Array.from({ length: n }, (_, i) => (i % 3) - 1);
    const y = Float64Array.from({ length: n }, (_, i) => 2 + 0.5 * /** @type {number} */ (x1[i]) - /** @type {number} */ (x2[i]) + (u() - 0.5));
    const P = proyectorResiduos([x1, x2], n), e = P(y);
    const punto = (/** @type {ArrayLike<number>} */ a, /** @type {ArrayLike<number>} */ b) => { let s = 0; for (let i = 0; i < n; i++) s += /** @type {number} */ (a[i]) * /** @type {number} */ (b[i]); return s; };
    assert.ok(Math.abs(punto(e, new Float64Array(n).fill(1))) < 1e-12 && Math.abs(punto(e, x1)) < 1e-11 && Math.abs(punto(e, x2)) < 1e-12, 'ortogonales');
    P(e).forEach((v, i) => assert.ok(Math.abs(v - /** @type {number} */ (e[i])) < 1e-13, 'idempotente'));
    const enElEspacio = Float64Array.from({ length: n }, (_, i) => 3 - 2 * /** @type {number} */ (x1[i]) + 7 * /** @type {number} */ (x2[i]));
    P(enElEspacio).forEach(v => assert.ok(Math.abs(v) < 1e-12, 'nulo en el espacio'));
    // los residuos de mínimos cuadrados ordinarios
    const ajuste = /** @type {any} */ (ajustarMco(y, [x1, x2]));
    e.forEach((v, i) => assert.ok(Math.abs(v - ajuste.residuos[i]) < 1e-13, 'los del ajuste'));
    // una columna duplicada, una proporcional o una constante no añaden nada al espacio (sin NaN, los mismos residuos)
    for (const extra of [[x1, x2, x1], [x1, x2, Float64Array.from(x2, v => 2 * v)], [x1, x2, new Float64Array(n).fill(5)]]) {
        const e2 = proyectorResiduos(extra, n)(y);
        e2.forEach((v, i) => assert.ok(Number.isFinite(v) && Math.abs(v - /** @type {number} */ (e[i])) < 1e-12, 'colineal'));
    }
    // sin columnas: centrar
    const c = proyectorResiduos([], n)(y), m = Array.from(y).reduce((s, v) => s + v, 0) / n;
    c.forEach((v, i) => assert.ok(Math.abs(v - (/** @type {number} */ (y[i]) - m)) < 1e-13, 'sin columnas, la desviación a la media'));
});

// ---------------------------------------------------------------- bisección y sección áurea
test('biseccion: la raíz de una función creciente con la precisión de sus pasos, bit a bit como los bucles que sustituye', () => {
    assert.ok(Math.abs(biseccion(x => x * x * x, 2, 0, 2, 60) - Math.cbrt(2)) < 1e-15);
    assert.equal(biseccion(x => x, 0, -1, 3, 0), 1, 'sin pasos, el punto medio');
    // el bucle de la censura del Simulador, tal como estaba
    const f = (/** @type {number} */ x) => Math.tanh(x) + 0.1 * x;
    for (const objetivo of [-0.7, 0, 0.3, 0.95]) {
        let lo = -5, hi = 5;
        for (let k = 0; k < 100; k++) { const mid = (lo + hi) / 2; if (f(mid) < objetivo) lo = mid; else hi = mid; }
        assert.equal(biseccion(f, objetivo, -5, 5, 100), (lo + hi) / 2);
    }
});

test('minimizarSeccionAurea: el mínimo de una función unimodal; bit a bit como la de la nube que sustituye', () => {
    const f = (/** @type {number} */ x) => (x - 1.3) * (x - 1.3) + 2;
    assert.ok(Math.abs(minimizarSeccionAurea(f, -5, 5, 80) - 1.3) < 1e-7);
    const g = (/** @type {number} */ x) => Math.abs(x + 0.7) + 0.01 * x * x;
    assert.ok(Math.abs(minimizarSeccionAurea(g, -10, 10, 80) + 0.7) < 1e-12);
    // la sección áurea de la nube, tal como estaba hasta la 2026.12.24
    for (const [lo0, hi0, it] of [[-5, 5, 80], [-100, 3, 45], [0, 1, 10]]) {
        const gr = (Math.sqrt(5) - 1) / 2;
        let lo = lo0, hi = hi0, c = hi - gr * (hi - lo), d = lo + gr * (hi - lo), fc = g(c), fd = g(d);
        for (let k = 0; k < it; k++) {
            if (fc <= fd) { hi = d; d = c; fd = fc; c = hi - gr * (hi - lo); fc = g(c); } else { lo = c; c = d; fc = fd; d = lo + gr * (hi - lo); fd = g(d); }
        }
        assert.equal(minimizarSeccionAurea(g, lo0, hi0, it), (lo + hi) / 2);
    }
});
