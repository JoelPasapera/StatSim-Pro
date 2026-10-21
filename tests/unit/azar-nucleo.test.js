// @ts-check
// tests/unit/azar-nucleo.test.js — (2026.12.25, cierre de la fase F6) el azar del núcleo único (core/random/): mulberry32
// (el generador con semilla del Simulador y de las pruebas de forma), sfc32 (el de los remuestreos de la psicometría), las
// normales por Box-Muller y las permutaciones (el barajado de Fisher–Yates y la muestra sin reemplazo). Referencias
// independientes: los dos generadores escritos con BigInt (aritmética entera exacta, sin los atajos de 32 bits de
// JavaScript), las variantes que había en el programa hasta la 2026.12.24 (deben dar la misma secuencia: las bases con una
// semilla no cambian), la transformación de Box-Muller con uniformes elegidas a mano y la uniformidad de las permutaciones
// por la χ² de Pearson.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../../src/core/random/mulberry32.js';
import { sfc32 } from '../../src/core/random/sfc32.js';
import { normalBoxMuller, generadorNormales } from '../../src/core/random/normal.js';
import { barajar, muestraSinReemplazo } from '../../src/core/random/permutacion.js';
import { crearAleatorio } from '../../src/analizador/psicometria/aleatorio.js';
import { aleatorio } from '../../src/analizador/relaciones/util-numerico.js';
import { pChiCuadrado, cdfNormal } from '../../src/core/stats/numerico.js';

const M32 = 0xFFFFFFFFn;
/** ToUint32 de una semilla, con BigInt: truncada, módulo 2³²; NaN e ±∞ dan 0. @param {number} x */
const u32 = x => (Number.isFinite(x) ? BigInt.asUintN(32, BigInt(Math.trunc(x))) : 0n);
/** @param {bigint} a @param {bigint} b */
const imul = (a, b) => (a * b) & M32;

/** mulberry32 con BigInt (referencia). @param {number} semilla */
function mulberry32Ref(semilla) {
    let s = u32(semilla);
    return () => {
        s = (s + 0x6D2B79F5n) & M32;
        let t = imul(s ^ (s >> 15n), s | 1n);
        t = (t ^ ((t + imul(t ^ (t >> 7n), t | 61n)) & M32)) & M32;
        return Number(t ^ (t >> 14n)) / 4294967296;
    };
}

/** sfc32 sembrado con fmix32, con BigInt (referencia). @param {number} semilla */
function sfc32Ref(semilla) {
    let s = u32(semilla);
    const mezcla = () => {
        s = (s + 0x9e3779b9n) & M32;
        let z = s;
        z = imul(z ^ (z >> 16n), 0x85ebca6bn);
        z = imul(z ^ (z >> 13n), 0xc2b2ae35n);
        return z ^ (z >> 16n);
    };
    let a = mezcla(), b = mezcla(), c = mezcla(), d = mezcla();
    const siguiente = () => {
        let t = (a + b) & M32;
        a = b ^ (b >> 9n);
        b = (c + (c << 3n)) & M32;
        c = ((c << 21n) | (c >> 11n)) & M32;
        d = (d + 1n) & M32;
        t = (t + d) & M32;
        c = (c + t) & M32;
        return Number(t);
    };
    for (let i = 0; i < 12; i++) siguiente();
    return siguiente;
}

// La variante con estado con signo (| 0) que tenían el valor esperado de los grupos y la validación hasta la 2026.12.24
/** @param {number} semilla */
function mulberry32ConSigno(semilla) {
    let s = semilla | 0;
    return () => { s = (s + 0x6D2B79F5) | 0; let x = Math.imul(s ^ (s >>> 15), 1 | s); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}

// La del cribado y el diagnóstico de forma hasta la 2026.12.24 (analizador/relaciones/util-numerico.js), tal cual
/** @param {number} semilla */
const mulberry32Cribado = semilla => { let a = semilla >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

test('mulberry32: la secuencia de la referencia con BigInt para semillas enteras, negativas, fraccionarias, enormes y no numéricas', () => {
    for (const semilla of [0, 1, 2, 7, 2026, 20261225, 0x7FFFFFFF, 0xFFFFFFFF, 2 ** 32, 2 ** 40 + 5, -1, -123456789, 3.7, -2.5, NaN, Infinity, -Infinity]) {
        const a = mulberry32(semilla), b = mulberry32Ref(semilla);
        for (let k = 0; k < 2000; k++) { const x = a(); assert.equal(x, b(), `semilla ${semilla}, número ${k}`); assert.ok(x >= 0 && x < 1); }
    }
    // los primeros enteros de 32 bits con las semillas 1 y 2026, calculados con una tercera implementación (Python)
    for (const [semilla, esperados] of /** @type {[number, number[]][]} */ ([[1, [2693262067, 11749833, 2265367787, 4213581821, 4159151403]], [2026, [1955961175, 1324980858, 2839649622, 2656330836, 654038057]]])) {
        const g = mulberry32(semilla);
        assert.deepEqual(esperados.map(() => g() * 4294967296), esperados, `semilla ${semilla}`);
    }
});

test('mulberry32: las variantes que había (estado sin signo y con signo) y la del cribado de forma dan la misma secuencia', () => {
    for (const semilla of [0, 5, 0x9E3779B9 ^ 700 ^ 148, 0x2545F491 ^ 977, -77, 20261028]) {
        const a = mulberry32(semilla), b = mulberry32ConSigno(semilla), c = mulberry32Cribado(semilla);
        for (let k = 0; k < 3000; k++) { const x = a(); assert.equal(b(), x); assert.equal(c(), x); }
    }
    assert.equal(aleatorio, mulberry32, 'la fachada de las relaciones es la misma función');
});

test('sfc32: la referencia con BigInt; siguiente y entero se derivan de siguiente32; la fachada de la psicometría es la misma función', () => {
    for (const semilla of [2026, 0, 1, 7, 8, 0xFFFFFFFF, -3, 123456789]) {
        const g = sfc32(semilla), r = sfc32Ref(semilla);
        for (let k = 0; k < 2000; k++) assert.equal(g.siguiente32(), r(), `semilla ${semilla}, número ${k}`);
        const g2 = sfc32(semilla), r2 = sfc32Ref(semilla);
        for (let k = 0; k < 500; k++) {
            const v = r2();
            if (k % 2) assert.equal(g2.siguiente(), v / 4294967296); else assert.equal(g2.entero(37), Math.floor((v / 4294967296) * 37));
        }
    }
    assert.equal(crearAleatorio, sfc32);
    const porDefecto = sfc32(), conSemilla = sfc32(2026);
    for (let k = 0; k < 20; k++) assert.equal(porDefecto.siguiente32(), conSemilla.siguiente32(), 'la semilla por defecto es 2026');
});

test('normalBoxMuller: √(−2 ln u₁)·cos(2π u₂) con u₁ y u₂ en ese orden; si u₁ = 0, se saca otra después de u₂', () => {
    /** @param {number[]} valores */
    const guion = valores => { let i = 0; return () => /** @type {number} */ (valores[i++]); };
    assert.equal(normalBoxMuller(guion([0.25, 0.1])), Math.sqrt(-2 * Math.log(0.25)) * Math.cos(2 * Math.PI * 0.1));
    assert.equal(normalBoxMuller(guion([0, 0.3, 0, 0.6])), Math.sqrt(-2 * Math.log(0.6)) * Math.cos(2 * Math.PI * 0.3));
    const pares = generadorNormales(guion([0.25, 0.1, 0, 0.5, 0.7])), m = Math.sqrt(-2 * Math.log(0.25)), t = 2 * Math.PI * 0.1;
    assert.equal(pares(), m * Math.cos(t));
    assert.equal(pares(), m * Math.sin(t), 'el seno del par, en la llamada siguiente');
    assert.equal(pares(), Math.sqrt(-2 * Math.log(0.5)) * Math.cos(2 * Math.PI * 0.7), 'u₁ = 0: se saca otra antes del ángulo');
});

test('las normales del núcleo: media 0, varianza 1 y la distribución normal (Kolmogórov-Smirnov) con 200 000 valores', () => {
    const u1 = mulberry32(31);
    for (const [nombre, z] of /** @type {[string, () => number][]} */ ([['una por llamada', () => normalBoxMuller(u1)], ['por pares', generadorNormales(mulberry32(99))]])) {
        const n = 200000, v = new Float64Array(n);
        for (let i = 0; i < n; i++) v[i] = z();
        let s = 0, s2 = 0; for (const x of v) { s += x; s2 += x * x; }
        const m = s / n, varianza = s2 / n - m * m;
        assert.ok(Math.abs(m) < 0.01 && Math.abs(varianza - 1) < 0.015, `${nombre}: media ${m}, varianza ${varianza}`);
        v.sort();
        let D = 0; for (let i = 0; i < n; i++) { const F = cdfNormal(/** @type {number} */ (v[i])); D = Math.max(D, Math.abs(F - i / n), Math.abs(F - (i + 1) / n)); }
        assert.ok(D < 1.63 / Math.sqrt(n), `${nombre}: D = ${D} (crítico al 1 %: ${1.63 / Math.sqrt(n)})`);
    }
});

test('barajar: una permutación en su sitio, bit a bit como los tres bucles que sustituye, y uniforme (χ² sobre las 24 de 4 elementos)', () => {
    const v = Float64Array.from({ length: 50 }, (_, i) => i * 1.5), u = mulberry32(4), w = Float64Array.from(v), r = mulberry32(4);
    assert.equal(barajar(v, u), v, 'devuelve el mismo arreglo');
    for (let i = w.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = /** @type {number} */ (w[i]); w[i] = /** @type {number} */ (w[j]); w[j] = t; }
    assert.deepEqual(v, w, 'el bucle de la nube y de las pruebas por permutaciones, tal como estaba');
    assert.deepEqual(Array.from(v).sort((a, b) => a - b), Array.from({ length: 50 }, (_, i) => i * 1.5), 'los mismos elementos');
    assert.deepEqual(barajar([], u), []); assert.deepEqual(barajar(['a'], u), ['a']);
    const cuentas = new Map(), g = mulberry32(2025), N = 48000;
    for (let k = 0; k < N; k++) { const p = barajar([0, 1, 2, 3], g).join(''); cuentas.set(p, (cuentas.get(p) || 0) + 1); }
    assert.equal(cuentas.size, 24);
    let chi = 0; for (const c of cuentas.values()) chi += (c - N / 24) ** 2 / (N / 24);
    assert.ok(pChiCuadrado(chi, 23) > 0.001, `χ²(23) = ${chi}`);
});

test('muestraSinReemplazo: k índices distintos de [0, n), k acotado, bit a bit como la del generador y con la misma probabilidad para todos', () => {
    // la del generador del Simulador, tal como estaba hasta la 2026.12.24
    /** @param {number} n @param {number} k @param {() => number} u */
    const antes = (n, k, u) => { const idx = new Int32Array(n); for (let i = 0; i < n; i++) idx[i] = i; const tope = Math.max(0, Math.min(k, n)); for (let j = 0; j < tope; j++) { const r = j + Math.floor(u() * (n - j)); const t = /** @type {number} */ (idx[j]); idx[j] = /** @type {number} */ (idx[r]); idx[r] = t; } return idx.subarray(0, tope); };
    for (const [n, k] of [[200, 20], [10, 10], [10, 15], [5, 0], [5, -2], [1, 1], [0, 3]]) {
        const a = muestraSinReemplazo(/** @type {number} */ (n), /** @type {number} */ (k), mulberry32(n * 7 + k)), b = antes(/** @type {number} */ (n), /** @type {number} */ (k), mulberry32(n * 7 + k));
        assert.deepEqual(a, b, `n = ${n}, k = ${k}`);
        assert.equal(a.length, Math.max(0, Math.min(/** @type {number} */ (k), /** @type {number} */ (n))));
        assert.equal(new Set(a).size, a.length, 'distintos');
        assert.ok(Array.from(a).every(i => i >= 0 && i < /** @type {number} */ (n)));
    }
    // consume exactamente mín(k, n) números del generador (con k > n, ni uno más: el resto de la base no cambia)
    for (const [n, k] of [[10, 15], [10, 4], [3, 3]]) {
        const a = mulberry32(5), b = mulberry32(5);
        muestraSinReemplazo(n, k, a);
        for (let i = 0; i < Math.min(n, k); i++) b();
        assert.equal(a(), b(), `n = ${n}, k = ${k}`);
    }
    const veces = new Float64Array(10), g = mulberry32(17), R = 30000;
    for (let r = 0; r < R; r++) for (const i of muestraSinReemplazo(10, 3, g)) veces[i]++;
    veces.forEach((c, i) => assert.ok(Math.abs(c / R - 0.3) < 0.012, `índice ${i}: ${c / R}`));
});
