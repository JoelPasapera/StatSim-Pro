// tests/unit/ordinal.test.js — paso 2: base numérica, policóricas/tetracóricas y α/ω ordinales contra el oráculo de
// SciPy (tests/oracle/ordinal_fixture.json), más soluciones exactas conocidas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cdfNormal, cdfNormalBivariada, raizBrent } from '../../src/analizador/psicometria/numerico.js';
import { eigenSimetrica, suavizarCorrelacion, inversaDefinidaPositiva } from '../../src/analizador/psicometria/algebra.js';
import { omegaUnFactor } from '../../src/analizador/psicometria/factorial.js';
import { policorica } from '../../src/analizador/psicometria/policorica.js';
import { fiabilidadOrdinal, tipoDeItems } from '../../src/analizador/psicometria/ordinal.js';

const fx = JSON.parse(fs.readFileSync(new URL('../oracle/ordinal_fixture.json', import.meta.url), 'utf8'));
const cerca = (a, b, tol, que) => assert.ok(Math.abs(a - b) <= tol, `${que}: ${a} vs ${b} (dif ${Math.abs(a - b)})`);
const pares = t => { const x = [], y = []; t.forEach((f, i) => f.forEach((c, j) => { for (let q = 0; q < c; q++) { x.push(i + 1); y.push(j + 1); } })); return [x, y]; };

test('Φ (Cody) igual a SciPy en todo el rango, colas incluidas', () => {
    fx.phi.forEach(({ x, p, q }) => {
        const rel = (a, b) => (b === 0 ? Math.abs(a) : Math.abs(a - b) / b);
        assert.ok(rel(cdfNormal(x), p) < 1e-14 || Math.abs(cdfNormal(x) - p) < 1e-300, `Φ(${x}): ${cdfNormal(x)} vs ${p}`);
        assert.ok(rel(1 - cdfNormal(x), q) < 1e-12 || x > 5 || q === 0, `1 − Φ(${x})`);
    });
});

test('Φ₂ (Drezner–Wesolowsky–Genz) igual a la integración de SciPy en 288 puntos, |ρ| hasta .999', () => {
    fx.phi2.forEach(({ h, k, r, p }) => cerca(cdfNormalBivariada(h, k, r), p, 2e-13, `Φ₂(${h}, ${k}; ${r})`));
    for (const r of [0.3, 0.8, 0.95, -0.97]) cerca(cdfNormalBivariada(0, 0, r), 0.25 + Math.asin(r) / (2 * Math.PI), 1e-15, 'Φ₂(0, 0; ρ) exacta');
    cerca(cdfNormalBivariada(0.7, -1.2, 0), cdfNormal(0.7) * cdfNormal(-1.2), 1e-16, 'independencia');
});

test('policóricas y tetracóricas iguales al oráculo; la tetracórica simétrica coincide con su fórmula cerrada', () => {
    fx.policoricas.forEach(({ tabla, rho }, i) => cerca(policorica(...pares(tabla)).rho, rho, 1e-10, `tabla ${i}`));
    cerca(policorica(...pares([[40, 10], [10, 40]])).rho, Math.sin(2 * Math.PI * 0.15), 1e-13, 'ρ = sen(2π(p₁₁ − ¼))');
    assert.equal(policorica(...pares([[40, 10], [10, 40]])).tipo, 'tetracórica');
    const lim = policorica(...pares([[30, 0], [0, 30]]));
    assert.ok(lim.enElLimite && lim.rho > 0.999, 'tabla sin discordancias: ρ en el límite y señalado');
    assert.ok(policorica(...pares([[3, 1], [0, 46]])).enElLimite, 'una celda vacía en 2 × 2: MV en el límite');
    assert.ok(Number.isNaN(policorica([1, 1, 1, 1], [1, 2, 1, 2]).rho), 'una variable constante no tiene correlación');
});

test('α y ω ordinales iguales al oráculo en tres conjuntos (Likert 5, dicotómicos, 3 categorías)', () => {
    for (const [nombre, c] of Object.entries(fx.conjuntos)) {
        const r = fiabilidadOrdinal(c.cols);
        c.R.forEach((fila, i) => fila.forEach((v, j) => cerca(r.R[i][j], v, 1e-9, `${nombre} R[${i}][${j}]`)));
        cerca(r.alfa, c.alfa, 1e-9, `${nombre} α ordinal`);
        cerca(r.omega, c.omega, 1e-7, `${nombre} ω ordinal`);
        assert.equal(r.suavizada, c.suavizada); assert.equal(r.heywood, c.heywood);
    }
    assert.equal(fiabilidadOrdinal(fx.conjuntos.dicotomicos.cols).correlacion, 'tetracórica');
    assert.equal(fiabilidadOrdinal(fx.conjuntos.likert5.cols).correlacion, 'policórica');
});

test('álgebra: autovalores, inversa, suavizado de una matriz no definida positiva y ω de un factor exacto', () => {
    const { valores } = eigenSimetrica([[2, 1, 0], [1, 2, 1], [0, 1, 2]]);
    [2 + Math.SQRT2, 2, 2 - Math.SQRT2].forEach((v, i) => cerca(valores[i], v, 1e-13, 'autovalor ' + i));
    const inv = inversaDefinidaPositiva([[4, 2], [2, 3]]);
    [[0.375, -0.25], [-0.25, 0.5]].forEach((f, i) => f.forEach((v, j) => cerca(inv[i][j], v, 1e-15, 'inversa')));
    assert.equal(inversaDefinidaPositiva([[1, 2], [2, 1]]), null);
    const s = suavizarCorrelacion(fx.suavizado.R);
    assert.ok(s.suavizada); s.R.forEach((f, i) => f.forEach((v, j) => cerca(v, fx.suavizado.S[i][j], 1e-10, 'suavizado')));
    const lam = [0.8, 0.7, 0.6, 0.5], R = lam.map((a, i) => lam.map((b, j) => (i === j ? 1 : a * b)));
    const o = omegaUnFactor(R);
    cerca(o.omega, 6.76 / (6.76 + lam.reduce((q, l) => q + 1 - l * l, 0)), 1e-10, 'ω exacto'); o.cargas.forEach((v, i) => cerca(v, lam[i], 1e-8, 'carga ' + i));
    cerca(raizBrent(x => x * x - 2, 0, 2).x, Math.SQRT2, 1e-15, 'raíz de Brent–Dekker');
});

test('clasificación de ítems: continuo, dicotómico u ordinal (hasta 7 categorías)', () => {
    assert.equal(tipoDeItems([[0, 1, 1], [1, 0, 1]]).tipo, 'dicotomico');
    assert.equal(tipoDeItems([[1, 2, 5], [3, 4, 1]]).tipo, 'ordinal');
    assert.equal(tipoDeItems([[1.5, 2, 3], [1, 2, 3]]).tipo, 'continuo');
    assert.equal(tipoDeItems([[1, 2, 3, 4, 5, 6, 7, 8], [1, 2, 3, 4, 5, 6, 7, 8]]).tipo, 'continuo');
    assert.equal(fiabilidadOrdinal([[1.5, 2.2, 3.1], [1, 2, 3]]), null);
});

test('revisión 2026.10.08: ω ordinal solo con 3+ ítems, límite práctico y recodificación con 2 ítems sin fallo', async () => {
    const { Fiabilidad } = await import('../../src/analizador/fiabilidad.js');
    const dos = fiabilidadOrdinal([[1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 3, 3], [1, 2, 3, 5, 4, 2, 1, 3, 4, 5, 3, 2]]);
    assert.ok(Number.isFinite(dos.alfa) && dos.omega === null, 'con 2 ítems: α ordinal sí, ω ordinal no');
    assert.ok(policorica(...pares([[10, 0, 0], [0, 10, 0], [0, 0, 10]])).enElLimite, 'tabla 3 × 3 sin discordancias: en el límite');
    const filas = Array.from({ length: 40 }, (_, i) => { const a = (i % 5) + 1; return { A1: a, A2: Math.min(5, Math.max(1, 6 - a + ((i % 3) - 1))) }; });   // opuestos con ruido
    const r = Fiabilidad.analizarGrupo(filas, { nombre: 'A', etiqueta: 'Dos ítems', origen: 'manual', items: ['A1', 'A2'], invertidos: [] });
    assert.ok(!r.error, 'dos ítems opuestos no rompen el análisis: ' + (r.error || ''));
    assert.ok(r.ordinal && r.ordinal.omega === null && r.avisos.some(a => /Tras recodificar/.test(a) && !/ω ordinal/.test(a)), 'aviso de recodificación sin ω: ' + r.avisos.join(' | '));
});
