// @ts-check
// tests/unit/nucleo-sin-copias.test.js — (2026.12.25, cierre de la fase F6) «una primitiva numérica, una sola
// implementación» (regla 7 de docs/ARQUITECTURA.md), vigilada sobre el código: la huella de cada primitiva unificada (una
// constante o una expresión típica de su algoritmo) se busca en todo src/, sin los comentarios (las cabeceras cuentan la
// historia de las copias, a veces con sus fórmulas), y solo puede estar en su módulo del núcleo o en las excepciones de la
// lista, cada una con su razón y con las veces que aparece (una copia nueva en un archivo exceptuado también falla). Es una
// red, no una demostración: reconoce, literalmente, las copias que había hasta la 2026.12.24 que se citan en `antes` (la
// última prueba lo comprueba con su código tal cual), no una copia escrita de otra forma (con otros nombres, con un bucle
// en lugar de reduce) ni las sumas que forman parte de otro algoritmo (las de un ANOVA o de unos residuos).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/** @type {string[]} */ const archivos = [];
(function recorrer(/** @type {string} */ dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) recorrer(p); else if (e.name.endsWith('.js')) archivos.push(p);
    }
})(path.join(raiz, 'src'));
/** El código sin comentarios de bloque ni de línea (respeta «://» de las URL). @param {string} t */
const sinComentarios = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
const codigo = new Map(archivos.map(a => [path.relative(raiz, a).split(path.sep).join('/'), sinComentarios(fs.readFileSync(a, 'utf8'))]));

/**
 * @typedef {{ que: string, huella: RegExp, nucleo: string, excepciones?: Record<string, [string, number]>, antes: string[] }} Primitiva
 *   nucleo: el módulo donde vive (debe contener la huella; '' si su código no la lleva y la huella es la de las copias);
 *   excepciones: archivo → [por qué puede contenerla, cuántas veces]; antes: líneas literales de las copias que había hasta
 *   la 2026.12.24
 */
/** @type {Primitiva[]} */
const PRIMITIVAS = [
    { que: 'mulberry32 (la constante de su paso)', huella: /0x6d2b79f5/i, nucleo: 'src/core/random/mulberry32.js', antes: [
        'estado = (estado + 0x6D2B79F5) >>> 0;',
        'const u = () => { semilla = (semilla + 0x6D2B79F5) | 0; let x = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);'] },
    { que: 'sfc32 (la mezcla fmix32 de su siembra)', huella: /0x85ebca6b|0xc2b2ae35/i, nucleo: 'src/core/random/sfc32.js', antes: [
        'z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;'] },
    { que: 'Box-Muller', huella: /Math\.sqrt\(\s*-\s*2(?:\.0*)?\s*\*\s*Math\.log/, nucleo: 'src/core/random/normal.js', antes: [
        'return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);',
        'const r = Math.sqrt(-2 * Math.log(u01() || 1e-300)), a = 2 * Math.PI * u01();',
        'const normal = () => { const u1 = Math.max(1e-12, u()), u2 = u(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); };'] },
    { que: 'el barajado de Fisher–Yates', huella: /Math\.floor\([^;]*\*\s*\(\s*\w+\s*\+\s*1\s*\)\s*\)|\.entero\(\s*\w+\s*\+\s*1\s*\)/, nucleo: 'src/core/random/permutacion.js', antes: [
        'for (let i = m - 1; i > 0; i--) { const j = Math.floor(u01() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }',
        'for (const v of perm) for (let i = n - 1; i > 0; i--) { const r = rng.entero(i + 1), t = v[i]; v[i] = v[r]; v[r] = t; }',
        'for (let r = 0; r < R; r++) { for (let i = n - 1; i > 0; i--) { const j = Math.floor(aleat() * (i + 1)); const t = yp[i]; yp[i] = yp[j]; yp[j] = t; }'] },
    { que: 'la muestra sin reemplazo (Fisher–Yates parcial)', huella: /(\w+)\s*\+\s*Math\.floor\([^;]*\*\s*\(\s*\w+\s*-\s*\1\s*\)\s*\)/, nucleo: 'src/core/random/permutacion.js', antes: [
        'const r = j + Math.floor(this.aleatorio() * (n - j));'] },
    { que: 'la rotación de Jacobi', huella: /theta\s*\*\s*theta\s*\+\s*1/, nucleo: 'src/core/linalg/autovalores.js', antes: [
        'const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));',
        'const tt = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));'] },
    { que: 'Gauss-Jordan (la matriz aumentada [A | I])', huella: /<\s*2\s*\*\s*\w+\s*;/, nucleo: 'src/core/linalg/gauss.js', antes: [
        'for (let j = 0; j < 2 * n; j++) M[c][j] /= d;',
        'for (let j = 0; j < 2 * nn; j++) A[c][j] /= d;',
        'for (let j = 0; j < 2 * m; j++) fp[j] = /** @type {number} */ (fp[j]) / d;'] },
    {
        que: 'el producto escalar de Cholesky', huella: /(\w+)\[i\]\[(\w+)\]\s*\*\s*\1\[j\]\[\2\]|suma\s*\+=\s*\(?\s*Li\[k\]\s*\)?\s*\*\s*\(?\s*Lj\[k\]/, nucleo: 'src/core/linalg/cholesky.js',
        excepciones: { 'src/simulador/dominio/seleccion.js': ['reconstruye R = L·Lᵀ a partir de las cargas de los drivers: un producto, no una factorización', 1] },
        antes: [
            'for (let k = 0; k < j; k++) suma += L[i][k] * L[j][k];',
            'let s = A[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];',
            'let s = R(orden[i], orden[j]); for (let t = 0; t < j; t++) s -= Lp[i][t] * Lp[j][t];']
    },
    { que: 'la sección áurea', huella: /Math\.sqrt\(\s*5\s*\)\s*-\s*1|0\.6180339/, nucleo: 'src/core/stats/optimizacion.js', antes: [
        'const M = 100 * Math.sqrt(syy / (sxx || 1)) + 1, g = (Math.sqrt(5) - 1) / 2;'] },
    {
        que: 'la bisección', huella: /\(\s*lo\s*\+\s*hi\s*\)\s*\/\s*2|0\.5\s*\*\s*\(\s*lo\s*\+\s*hi\s*\)/, nucleo: 'src/core/stats/optimizacion.js', excepciones: {
            'src/core/stats/distribuciones.js': ['el cuantil de la χ² no central: para por tolerancia, no por número de pasos', 2],
            'src/simulador/dominio/items.js': ['las calibraciones por simulación de las cargas y de la fiabilidad: cambian el estado y se cortan si una réplica falla', 4],
            'src/simulador/dominio/formas-relacion.js': ['la η máxima sin recorte: devuelve el extremo factible, no el punto medio', 1],
        },
        antes: [
            'for (let it = 0; it < 60; it++) { const mid = (lo + hi) / 2; if (rDeCoeficientes(c1, c2, mid) < r) lo = mid; else hi = mid; }',
            'for (let it = 0; it < 50; it++) { const b0 = (lo + hi) / 2; let s = 0; for (let i = 0; i < n; i++) s += Math.exp(b0 + eta[i]); if (s / n < d.media) lo = b0; else hi = b0; }']
    },
    { que: 'la búsqueda binaria y la selección (el punto medio entero)', huella: /\(\s*lo\s*\+\s*hi\s*\)\s*>>\s*1/, nucleo: 'src/core/stats/orden.js', antes: [
        'while (lo < hi) { const mid = (lo + hi) >> 1; if (valores[mid] < v) lo = mid + 1; else hi = mid; }',
        'while (lo < hi) { const piv = v[(lo + hi) >> 1]; let i = lo, j = hi;'] },
    { que: 'la densidad normal escrita a mano (√(2π))', huella: /Math\.sqrt\(\s*2\s*\*\s*Math\.PI\s*\)|RAIZ_2PI/, nucleo: '', antes: [
        'const RAIZ_2PI = Math.sqrt(2 * Math.PI);',
        'const pdf = (x, s) => Math.exp(-0.5 * ((x - s.mu) / s.sigma) ** 2) / (s.sigma * Math.sqrt(2 * Math.PI));'] },
    { que: 'lnΓ (los coeficientes de Lanczos)', huella: /676\.5203681218851/, nucleo: 'src/core/stats/especiales.js', antes: [] },
    { que: 'la inversa de Φ (AS241)', huella: /2509\.0809287301226727/, nucleo: 'src/core/stats/normal.js', antes: [] },
    { que: 'Φ (Cody)', huella: /0\.67448975/, nucleo: 'src/core/stats/normal.js', antes: [] },
    {
        que: 'la matriz de Pearson con otras aritméticas', huella: /\/\s*Math\.sqrt\(\s*vars?\[|\(\s*s\s*\/\s*\(\s*n\s*-\s*1\s*\)\s*\)\s*\/\s*\(?\s*(?:Math\.sqrt|des)|s\s*\/\s*n\s*\/\s*\(\s*des\[/, nucleo: '', antes: [
            'R[i][j] = R[j][i] = (vars[i] > 0 && vars[j] > 0) ? (s / (n - 1)) / Math.sqrt(vars[i] * vars[j]) : 0;',
            'R[a][b] = R[b][a] = (s / (n - 1)) / (des[a] * des[b]);',
            'C[a][b] = C[b][a] = s / n / (des[a] * des[b]);']
    },
    {
        que: 'las puntuaciones típicas, z = (x − media)/DE', huella: /=>\s*\(\s*\w+\s*-\s*\w+\s*\)\s*\/\s*\w+\s*\)/, nucleo: 'src/core/stats/descriptivos.js',
        excepciones: { 'src/analizador/relaciones/mcd.js': ['la tipificación robusta del MCD, con la mediana y la MAD de cada variable: otra estadística', 2] },
        antes: ['const est = arr => { const mu = arr.reduce((s, v) => s + v, 0) / n; const sd = Math.sqrt(arr.reduce((s, v) => s + (v - mu) ** 2, 0) / n); return sd > 0 ? arr.map(v => (v - mu) / sd) : null; };',
            'const est = col => { let mu = 0; for (let i = 0; i < n; i++) mu += col[i]; mu /= n; let v = 0; for (let i = 0; i < n; i++) v += (col[i] - mu) ** 2; const sd = Math.sqrt(v / n); return sd > 1e-9 ? Float64Array.from(col, x => (x - mu) / sd) : null; };',
            'const n = x.length, mx = media(x), sx = Math.sqrt(x.reduce((s, v) => s + (v - mx) ** 2, 0) / n) || 1, z = Float64Array.from(x, v => (v - mx) / sx);']
    },
    { que: 'la desviación típica escrita a mano con reduce', huella: /Math\.sqrt\(\s*\w+\.reduce\(\(\s*\w+\s*,\s*\w+\s*\)\s*=>\s*\w+\s*\+\s*\(\s*\w+\s*-\s*\w+\s*\)\s*\*\*\s*2\s*,\s*0\s*\)\s*\//, nucleo: '', antes: [
        'const de = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));',
        'return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));'] },
    {
        que: 'la media escrita a mano con reduce', huella: /\.reduce\(\(\s*(\w+)\s*,\s*(\w+)\s*\)\s*=>\s*\1\s*\+\s*\2\s*,\s*0\s*\)\s*\/\s*[\w.]+/, nucleo: '',
        excepciones: { 'src/simulador/dominio/autotest.js': ['el autotest del Simulador: comprueba al generador con cálculos propios, independientes por diseño', 5] },
        antes: ['resumen: { vMedia: vs.reduce((s, v) => s + v, 0) / vs.length, vMin: Math.min(...vs), vMax: Math.max(...vs),', 'const m = jack.reduce((s, v) => s + v, 0) / jack.length;']
    },
    {
        que: 'la r de Pearson escrita a mano', huella: /\b\w+\s*\/\s*Math\.sqrt\(\s*\w+\s*\*\s*\w+\s*\)/, nucleo: 'src/core/stats/correlacion.js', excepciones: {
            'src/simulador/dominio/autotest.js': ['el autotest del Simulador: su Pearson es independiente por diseño', 1],
            'src/simulador/dominio/formas-relacion.js': ['la κ de una forma: una correlación ponderada con los pesos de cuadratura de la curva teórica', 1],
            'src/simulador/dominio/informe.js': ['la correlación dentro de las personas de los niveles: la de los residuos de un ANOVA de dos factores, de sus sumas', 1],
        },
        antes: ['const r = (u, v) => { const k = u.length, mu = u.reduce((s, x) => s + x, 0) / k, mv = v.reduce((s, x) => s + x, 0) / k; let a = 0, b = 0, c = 0; for (let i = 0; i < k; i++) { a += (u[i] - mu) * (v[i] - mv); b += (u[i] - mu) ** 2; c += (v[i] - mv) ** 2; } return a / Math.sqrt(b * c); };',
            'const r = (u, v) => { let su = 0, sv = 0, k = 0; for (let i = 0; i < u.length; i++) { su += u[i]; sv += v[i]; k++; } const mu = su / k, mv = sv / k; let suv = 0, suu = 0, svv = 0; for (let i = 0; i < u.length; i++) { const du = u[i] - mu, dv = v[i] - mv; suv += du * dv; suu += du * du; svv += dv * dv; } return suv / Math.sqrt(suu * svv); };']
    },
    {
        que: 'la matriz de covarianzas', huella: /\(\s*\w+\[i\]\s*-\s*\w+\[i\]\s*\)\s*\*\s*\(\s*\w+\[j\]\s*-\s*\w+\[j\]\s*\)/, nucleo: '', antes: [
            'const S = items.map((_, i) => items.map((_, j) => X.reduce((s, x) => s + (x[i] - media[i]) * (x[j] - media[j]), 0) / n));',
            'filas.forEach(f => { for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) S_obs[i][j] += (f[i] - medias[i]) * (f[j] - medias[j]); });']
    },
];

for (const p of PRIMITIVAS) {
    test(`una sola implementación: ${p.que}`, () => {
        const global = new RegExp(p.huella.source, p.huella.flags + 'g');
        const con = [...codigo].filter(([, t]) => p.huella.test(t)).map(([a]) => a);
        if (p.nucleo) assert.ok(con.includes(p.nucleo), `la huella ya no está en ${p.nucleo}: actualice esta prueba`);
        const excepciones = p.excepciones || {};
        const fuera = con.filter(a => a !== p.nucleo && !(a in excepciones));
        assert.deepEqual(fuera, [], `${p.que}: copias fuera del núcleo en ${fuera.join(', ')}`);
        for (const [archivo, [razon, veces]] of Object.entries(excepciones)) {
            const n = (/** @type {string} */ (codigo.get(archivo) || '').match(global) || []).length;
            assert.equal(n, veces, `${p.que}: ${archivo} (${razon}) la contiene ${n} veces, no ${veces}: ¿una copia nueva, o una que se fue?`);
        }
    });
}

test('las huellas reconocen, literalmente, las copias que había hasta la 2026.12.24', () => {
    for (const p of PRIMITIVAS) for (const linea of p.antes) assert.ok(p.huella.test(linea), `${p.que}: no reconoce «${linea}»`);
    assert.equal(sinComentarios('const a = 1; // (s / (n - 1)) / Math.sqrt(vars[i])\nconst u = "https://x";'), 'const a = 1; \nconst u = "https://x";');
});
