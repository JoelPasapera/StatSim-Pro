// wasm-frente-a-js.mjs — (2027.01.19) la medición de docs/EVALUACION-WASM.md: el paso E de la TRI (el núcleo que más tiempo
// pide de core/stats/tri.js) en JavaScript, en WebAssembly (kernel-tri.cpp compilado con clang --target=wasm32) y en código
// nativo (el mismo C++ con g++ y clang a -O2), con los mismos datos (un GRM simulado con los generadores del programa y la
// cuadratura y las probabilidades de tri.js), y si dan lo mismo. Y, como referencia, una iteración completa del EM del
// programa (pasos E y M). No es parte de la batería: necesita clang con el destino wasm32 y g++.
//   node tests/rendimiento/wasm-frente-a-js.mjs [n] [ítems]
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sfc32 } from '../../src/core/random/sfc32.js';
import { generadorNormales } from '../../src/core/random/normal.js';
import { cuadratura, categorias, ajustarTRI } from '../../src/core/stats/tri.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const n = Number(process.argv[2]) || 2000, J = Number(process.argv[3]) || 20, K = 5, REPS = 60;

// ---------- los datos: un GRM de J ítems Likert de 5 opciones, 5 % de perdidos ----------
const g = sfc32(2027), normal = generadorNormales(g.siguiente);
const items = Array.from({ length: J }, (_, j) => ({ a: 0.8 + 1.4 * ((j * 7) % 10) / 10, d: [2.2, 0.8, -0.6, -2.0].map(v => v + 0.3 * Math.sin(j)) }));
const z = Array.from({ length: n }, () => normal());
const X = new Int8Array(J * n);
items.forEach((it, j) => { for (let i = 0; i < n; i++) { const u = g.siguiente(); let c = 0; for (const dk of it.d) if (u < 1 / (1 + Math.exp(-(it.a * /** @type {number} */ (z[i]) + dk)))) c++; X[j * n + i] = g.siguiente() < 0.05 ? -1 : c; } });
const { nodos, pesos } = cuadratura(), Q = nodos.length;
const logPesos = Float64Array.from(pesos, Math.log), logP = new Float64Array(J * Q * K);
items.forEach((it, j) => nodos.forEach((zq, q) => categorias(it.a, it.d, zq).P.forEach((p, c) => { logP[(j * Q + q) * K + c] = Math.log(p); })));

// ---------- el núcleo en JavaScript: las mismas operaciones, en el mismo orden, que kernel-tri.cpp ----------
function pasoE(logL, w, r) {
    logL.fill(0);
    for (let j = 0; j < J; j++) {
        const ox = j * n, oT = j * Q * K;
        for (let i = 0; i < n; i++) {
            const c = X[ox + i];
            if (c < 0) continue;
            const oL = i * Q;
            for (let q = 0; q < Q; q++) logL[oL + q] += logP[oT + q * K + c];
        }
    }
    let total = 0;
    for (let i = 0; i < n; i++) {
        const o = i * Q;
        let m = -1e300;
        for (let q = 0; q < Q; q++) { const v = logL[o + q] + logPesos[q]; if (v > m) m = v; }
        let s = 0;
        for (let q = 0; q < Q; q++) { const e = Math.exp(logL[o + q] + logPesos[q] - m); w[o + q] = e; s += e; }
        for (let q = 0; q < Q; q++) w[o + q] = w[o + q] / s;
        total += m + Math.log(s);
    }
    r.fill(0);
    for (let j = 0; j < J; j++) {
        const ox = j * n, oR = j * K * Q;
        for (let i = 0; i < n; i++) {
            const c = X[ox + i];
            if (c < 0) continue;
            const oRc = oR + c * Q, oW = i * Q;
            for (let q = 0; q < Q; q++) r[oRc + q] += w[oW + q];
        }
    }
    return total;
}

/** La mediana y el mínimo de REPS repeticiones (tras 3 de calentamiento). @param {() => void} f */
function medir(f) {
    const t = [];
    for (let k = 0; k < REPS + 3; k++) { const t0 = performance.now(); f(); const t1 = performance.now(); if (k >= 3) t.push(t1 - t0); }
    t.sort((a, b) => a - b);
    return { mediana: /** @type {number} */ (t[t.length >> 1]), minimo: /** @type {number} */ (t[0]) };
}
/** La mayor diferencia y si son iguales bit a bit. @param {Float64Array} a @param {Float64Array} b */
function comparar(a, b) { let d = 0, iguales = true; for (let k = 0; k < a.length; k++) { const x = Math.abs(/** @type {number} */ (a[k]) - /** @type {number} */ (b[k])); if (x > d) d = x; if (!Object.is(a[k], b[k])) iguales = false; } return { maxima: d, iguales }; }

const js = { logL: new Float64Array(n * Q), w: new Float64Array(n * Q), r: new Float64Array(J * K * Q), total: 0 };
const tJs = medir(() => { js.total = pasoE(js.logL, js.w, js.r); });
const filas = [{ que: 'JavaScript (V8, Float64Array)', ...tJs, total: js.total, w: 'referencia', r: 'referencia' }];

const tmp = mkdtempSync(path.join(tmpdir(), 'statsim-wasm-'));
try {
    // ---------- WebAssembly: el mismo C++, con -O2 y con -O3 y las instrucciones SIMD de 128 bits ----------
    for (const [banderas, que] of /** @type {[string[], string][]} */ ([[['-O2'], 'WebAssembly (clang -O2, exp y log de Math)'], [['-O3', '-msimd128'], 'WebAssembly (clang -O3 -msimd128)']])) {
        const wasm = path.join(tmp, `kernel-tri${banderas.join('')}.wasm`);
        execFileSync('clang++', ['--target=wasm32', ...banderas, '-mbulk-memory', '-nostdlib', '-fno-exceptions', '-fno-rtti', '-Wl,--no-entry', '-Wl,--export=paso_e', '-Wl,--export=reservar', '-o', wasm, path.join(aqui, 'kernel-tri.cpp')]);
        const { instance } = await WebAssembly.instantiate(readFileSync(wasm), { env: { exp: Math.exp, log: Math.log } });
        const e = /** @type {any} */ (instance.exports);
        const pX = e.reservar(X.length), pP = e.reservar(logP.byteLength), pW8 = e.reservar(logPesos.byteLength), pL = e.reservar(n * Q * 8), pw = e.reservar(n * Q * 8), pr = e.reservar(J * K * Q * 8);
        const mem = () => /** @type {WebAssembly.Memory} */ (e.memory).buffer;
        new Int8Array(mem(), pX, X.length).set(X); new Float64Array(mem(), pP, logP.length).set(logP); new Float64Array(mem(), pW8, Q).set(logPesos);
        let totalW = 0;
        const tW = medir(() => { totalW = e.paso_e(n, J, Q, K, pX, pP, pW8, pL, pw, pr); });
        const cw = comparar(js.w, new Float64Array(mem(), pw, n * Q)), cr = comparar(js.r, new Float64Array(mem(), pr, J * K * Q));
        filas.push({ que: `${que} (${readFileSync(wasm).length} B)`, ...tW, total: totalW, w: cw.iguales ? 'igual bit a bit' : `Δ ≤ ${cw.maxima.toExponential(1)}`, r: cr.iguales ? 'igual bit a bit' : `Δ ≤ ${cr.maxima.toExponential(1)}` });
    }
    // ---------- nativo ----------
    const entrada = path.join(tmp, 'entrada.bin');
    const cab = new Int32Array([n, J, Q, K, REPS]);
    writeFileSync(entrada, Buffer.concat([Buffer.from(cab.buffer), Buffer.from(X.buffer), Buffer.from(logP.buffer), Buffer.from(logPesos.buffer)]));
    for (const [compilador, banderas, que] of /** @type {[string, string[], string][]} */ ([['g++', ['-O2'], 'nativo (g++ -O2, libm)'], ['clang++', ['-O2'], 'nativo (clang -O2, libm)'], ['g++', ['-O3', '-march=native'], 'nativo (g++ -O3 -march=native)']])) {
        const exe = path.join(tmp, `nativo-${compilador}-${banderas.join('')}`), salida = path.join(tmp, 'salida.bin');
        try { execFileSync(compilador, ['-std=c++17', ...banderas, '-o', exe, path.join(aqui, 'kernel-tri-nativo.cpp')]); } catch (err) { filas.push({ que: `${que}: no se pudo compilar`, mediana: NaN, minimo: NaN, total: NaN, w: '—', r: '—' }); continue; }
        const t = JSON.parse(execFileSync(exe, [entrada, salida]).toString());
        const b = readFileSync(salida), f64 = new Float64Array(b.buffer, b.byteOffset, b.length / 8);
        const cw = comparar(js.w, f64.subarray(1, 1 + n * Q)), cr = comparar(js.r, f64.subarray(1 + n * Q));
        filas.push({ que, ...t, total: /** @type {number} */ (f64[0]), w: cw.iguales ? 'igual bit a bit' : `Δ ≤ ${cw.maxima.toExponential(1)}`, r: cr.iguales ? 'igual bit a bit' : `Δ ≤ ${cr.maxima.toExponential(1)}` });
    }
} finally { rmSync(tmp, { recursive: true, force: true }); }

// ---------- la referencia: una iteración del EM del programa (pasos E y M, con sus tablas de objetos) ----------
// (la diferencia entre 20 y 10 iteraciones, así no cuentan el arranque ni los errores típicos del final)
const Xp = Array.from({ length: J }, (_, j) => X.slice(j * n, (j + 1) * n));
const duracion = (/** @type {number} */ it) => { const t0 = performance.now(); ajustarTRI(Xp, { modelo: 'grm', tolerancia: 0, maxIteraciones: it }); return performance.now() - t0; };
duracion(3);
const porIteracion = (duracion(20) - duracion(10)) / 10;

const nativo = filas.find(f => f.que.startsWith('nativo (g++ -O2'));
console.log(`Paso E de la TRI: n = ${n}, ${J} ítems de ${K} categorías, ${Q} nodos (${REPS} repeticiones; ${process.version}, ${process.platform}/${process.arch})\n`);
console.log('| Implementación | Mediana (ms) | Mínimo (ms) | × nativo | Log-verosimilitud | Posterior | Recuentos |');
console.log('|---|---:|---:|---:|---:|---|---|');
for (const f of filas) console.log(`| ${f.que} | ${f.mediana.toFixed(2)} | ${f.minimo.toFixed(2)} | ${nativo ? (f.mediana / nativo.mediana).toFixed(2) : '—'} | ${f.total.toFixed(6)} | ${f.w} | ${f.r} |`);
console.log(`\nUna iteración completa del EM del programa (core/stats/tri.js, pasos E y M): ${porIteracion.toFixed(1)} ms.`);
