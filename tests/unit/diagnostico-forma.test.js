// tests/unit/diagnostico-forma.test.js — diagnóstico de forma (Analizador) contra el oráculo independiente de SciPy
// (tests/oracle/forma_oraculo.py): coeficientes con sus p e IC, dCor, η y el mínimo de cada modelo de forma.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { diagnosticarForma, ajustarModelos, kendallTauB, correlacionDistancias, etaPorTramos, pearson, rangosMedios, pDeCorrelacion, icFisher } from '../../src/analizador/relaciones/diagnostico-forma.js';

const fx = JSON.parse(fs.readFileSync(new URL('../oracle/forma_fixture.json', import.meta.url), 'utf8'));
const cerca = (a, b, t, q) => assert.ok(Math.abs(a - b) <= t, `${q}: ${a} vs ${b}`);

test('r, ρ y τ-b con sus p (asintóticas) e IC iguales a scipy.stats; dCor y η iguales a su definición', () => {
    for (const d of fx) {
        const x = Float64Array.from(d.x), y = Float64Array.from(d.y), n = x.length, r = pearson(x, y), rho = pearson(rangosMedios(x), rangosMedios(y)), kt = kendallTauB(x, y);
        cerca(r, d.r, 1e-12, d.nombre + ' r'); cerca(pDeCorrelacion(r, n), d.p_r, 1e-10 + 1e-8 * d.p_r, d.nombre + ' p(r)');
        icFisher(r, n).forEach((v, k) => cerca(v, d.ic_r[k], 1e-12, d.nombre + ' IC r'));
        cerca(rho, d.rho, 1e-12, d.nombre + ' ρ'); cerca(pDeCorrelacion(rho, n), d.p_rho, 1e-10 + 1e-8 * d.p_rho, d.nombre + ' p(ρ)');
        icFisher(rho, n, 1.06).forEach((v, k) => cerca(v, d.ic_rho[k], 1e-12, d.nombre + ' IC ρ'));
        cerca(kt.tau, d.tau, 1e-12, d.nombre + ' τ-b'); cerca(kt.p, d.p_tau, 1e-9 + 1e-7 * d.p_tau, d.nombre + ' p(τ)');
        cerca(correlacionDistancias(x, y, { B: 9 }).dcor, d.dcor, 1e-10, d.nombre + ' dCor');
        cerca(etaPorTramos(x, y).eta, d.eta, 1e-12, d.nombre + ' η');
    }
});

test('cada modelo de forma alcanza el mínimo de la suma de cuadrados que encuentra SciPy (lineales: exacto; no lineales: ±0,5 %)', () => {
    for (const d of fx) {
        const mods = ajustarModelos(Float64Array.from(d.x), Float64Array.from(d.y));
        for (const [id, rssPy] of Object.entries(d.rss)) {
            const m = mods.find(q => q.id === id), exacto = ['constante', 'lineal', 'cuadratica', 'cubica'].includes(id);
            assert.ok(m, `${d.nombre}: falta el modelo ${id}`);
            if (exacto) cerca(m.rss, rssPy, 1e-8 * rssPy, `${d.nombre}/${id}`);
            else assert.ok(m.rss <= rssPy * 1.005, `${d.nombre}/${id}: RSS ${m.rss} frente al mínimo de SciPy ${rssPy}`);
        }
    }
});

test('clasificación y recomendación en los conjuntos del oráculo', () => {
    const esperado = { lineal: ['lineal', 'r'], u_invertida: ['u-invertida', 'modelo'], logaritmica: ['creciente-frena', 'ρ'], sigmoide: ['sigmoide', 'ρ'], ciclica: ['ciclica', 'modelo'], empates: ['creciente-acelera', 'ρ'] };
    for (const d of fx) {
        const r = diagnosticarForma(d.x, d.y, { B: 49 });
        assert.deepEqual([r.categoria, r.coefRecomendado], esperado[d.nombre], d.nombre);
    }
});

test('τ-b en lugar de ρ con pocas categorías (ítem Likert de 5 puntos) o con n < 30; ρ con puntajes totales', () => {
    const x = Array.from({ length: 300 }, (_, i) => 10 + (i % 31)), yLikert = x.map((v, i) => Math.min(5, Math.max(1, Math.round(1 + Math.log(v - 9) + ((i * 7919) % 5) / 5 - 0.5))));
    const d = diagnosticarForma(x, yLikert, { B: 19 });
    assert.equal(d.categoriasMin, 5);
    if (d.descripcion.coeficiente === 'ρ') assert.equal(d.coefRecomendado, 'τ');
    const pequeña = diagnosticarForma(x.slice(0, 25), x.slice(0, 25).map(v => Math.log(v - 9) + ((v * 13) % 7) / 20), { B: 19 });
    if (pequeña.descripcion.coeficiente === 'ρ') assert.equal(pequeña.coefRecomendado, 'τ');
});
