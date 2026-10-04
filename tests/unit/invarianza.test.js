// tests/unit/invarianza.test.js — paso 6A: invarianza por AFC multigrupo (ML con medias) contra el oráculo independiente
// de NumPy/SciPy (tests/oracle/invarianza_oraculo.py): χ², gl, CFI, TLI, RMSEA con su IC, SRMR, medias latentes con EE,
// decisiones por los criterios de Chen (2007) y la χ² no central.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { analizarInvarianza, especificar, evaluar, estadisticosPorGrupo, NIVELES } from '../../src/analizador/psicometria/invarianza.js';
import { cdfChi2NoCentral } from '../../src/analizador/psicometria/numerico.js';

const fx = JSON.parse(fs.readFileSync(new URL('../oracle/invarianza_fixture.json', import.meta.url), 'utf8'));
const cerca = (a, b, tol, que) => assert.ok(Math.abs(a - b) <= tol, `${que}: ${a} vs ${b}`);
const MODELO = { latentes: { F1: ['i1', 'i2', 'i3'], F2: ['i4', 'i5', 'i6'] }, regresiones: [], covars: [] };
const resultados = Object.fromEntries(Object.entries(fx.conjuntos).map(([k, c]) => [k, analizarInvarianza(MODELO, c.datos, 'g', { estricta: true })]));

test('χ², gl, CFI, TLI, RMSEA con su IC y SRMR de los cuatro niveles iguales al oráculo (dos conjuntos, 2 y 3 grupos)', () => {
    for (const [nombre, r] of Object.entries(resultados)) {
        assert.ok(!r.error, r.error);
        for (const R of r.niveles) {
            const o = fx.conjuntos[nombre].niveles[R.nivel], que = `${nombre}/${R.nivel}`;
            assert.ok(R.convergio, que + ' convergió');
            assert.equal(R.gl, o.gl, que + ' gl');
            cerca(R.chi2, o.chi2, 1e-5 * Math.max(1, o.chi2), que + ' χ²');
            cerca(R.CFI, o.CFI, 1e-7, que + ' CFI'); cerca(R.TLI, o.TLI, 1e-7, que + ' TLI');
            cerca(R.RMSEA, o.RMSEA, 1e-7, que + ' RMSEA'); cerca(R.srmr, o.SRMR, 1e-6, que + ' SRMR');
            cerca(R.RMSEAic[0], o.RMSEAic[0], 1e-5, que + ' IC inf'); cerca(R.RMSEAic[1], o.RMSEAic[1], 1e-5, que + ' IC sup');
        }
    }
});

test('decisiones: el intercepto desplazado rompe la invarianza escalar; el conjunto invariante la sostiene y da medias latentes como el oráculo', () => {
    const ni = resultados.no_invariante.niveles.map(R => R.decision), inv = resultados.invariante;
    assert.deepEqual(ni, ['base', 'se sostiene', 'no se sostiene', 'no interpretable']);
    assert.deepEqual(inv.niveles.map(R => R.decision), ['base', 'se sostiene', 'se sostiene', 'se sostiene']);
    assert.equal(resultados.no_invariante.medias.length, 0, 'sin invarianza escalar no se comparan medias latentes');
    const om = fx.conjuntos.invariante.niveles.escalar.medias;
    assert.equal(inv.medias.length, om.length);
    for (const o of om) {
        const r = inv.medias.find(x => x.grupo === o.grupo && x.factor === 'F' + (o.factor + 1));
        cerca(r.kappa, o.kappa, 1e-4, `κ ${o.grupo}`); cerca(r.se, o.se, 2e-3 * o.se, `EE ${o.grupo}`); cerca(r.d, o.d, 1e-4, `d ${o.grupo}`);
    }
});

test('gradiente analítico igual a diferencias centrales en los cuatro niveles (con covarianza residual y 3 grupos)', () => {
    const datos = fx.conjuntos.invariante.datos, items = ['i1', 'i2', 'i3', 'i4', 'i5', 'i6'], est = estadisticosPorGrupo(datos, items, 'g');
    const modelo = { ...MODELO, covars: [['i1', 'i4']] };
    for (const nv of NIVELES) {
        const esp = especificar(modelo, items, 3, nv), x = esp.libres.map((pl, k) => ({ carga: 0.9, varLatente: 0.8, varResidual: 0.6, intercepto: 3.1 })[pl.tipo] ?? 0.05 * ((k % 5) - 2));
        const ga = evaluar(esp, est.grupos, est.N, x).grad;
        x.forEach((_, k) => { const h = 1e-6, a = x.slice(), b = x.slice(); a[k] += h; b[k] -= h; cerca(ga[k], (evaluar(esp, est.grupos, est.N, a, false).f - evaluar(esp, est.grupos, est.N, b, false).f) / (2 * h), 1e-7, `${nv.clave} ∂F/∂θ${k}`); });
    }
});

test('χ² no central igual a SciPy, también con ncp grande (donde e^(−ncp/2) se anula)', () => {
    fx.noCentral.forEach(({ x, df, ncp, cdf }) => cerca(cdfChi2NoCentral(x, df, ncp), cdf, 1e-9, `ncx2(${x}; ${df}, ${ncp})`));
});

test('errores útiles: regresiones, factor con un ítem, grupos insuficientes, ítem ausente', () => {
    const d = fx.conjuntos.invariante.datos;
    assert.match(analizarInvarianza({ ...MODELO, regresiones: [{ y: 'F2', xs: ['F1'] }] }, d, 'g').error, /modelo de medida/);
    assert.match(analizarInvarianza({ latentes: { F1: ['i1'] }, covars: [] }, d, 'g').error, /al menos 2 ítems/);
    assert.match(analizarInvarianza(MODELO, d.map(f => ({ ...f, g: 'único' })), 'g').error, /al menos 2 grupos/);
    assert.match(analizarInvarianza({ latentes: { F1: ['i1', 'x9'] }, covars: [] }, d, 'g').error, /No están en la base: x9/);
    assert.match(analizarInvarianza(MODELO, d.slice(0, 280).concat(d.slice(-8)), 'g').error, /tiene 8 casos completos/);
});

test('revisión 2026.10.20: modelo no identificado (error antes de ajustar) y configural saturado (RMSEA = 0, TLI = 1, párrafo propio)', async () => {
    const { redactarParrafo } = await import('../../src/analizador/psicometria/invarianza-redaccion.js');
    const d = fx.conjuntos.invariante.datos;
    assert.match(analizarInvarianza({ latentes: { F1: ['i1', 'i2'] }, covars: [] }, d, 'g').error, /no está identificado \(gl = -3/);
    const r = analizarInvarianza({ latentes: { F1: ['i1', 'i2', 'i3'] }, covars: [] }, d, 'g'), c = r.niveles[0];
    assert.ok(c.gl === 0 && c.saturado && c.RMSEA === 0 && c.TLI === 1 && c.CFI === 1 && Number.isFinite(r.niveles[1].delta.RMSEA));
    assert.match(redactarParrafo(r), /El modelo configural está saturado \(gl = 0\)/);
    assert.doesNotMatch(redactarParrafo(r), /ajuste limitado/);
});

test('revisión 2026.10.20: covarianzas repetidas, invertidas o de un ítem consigo mismo no duplican parámetros ni alteran los gl', () => {
    const d = fx.conjuntos.invariante.datos, a = analizarInvarianza({ ...MODELO, covars: [['i1', 'i4']] }, d, 'g');
    const b = analizarInvarianza({ ...MODELO, covars: [['i1', 'i4'], ['i4', 'i1'], ['i2', 'i2'], ['F1', 'F2']] }, d, 'g');
    a.niveles.forEach((R, k) => { assert.equal(b.niveles[k].q, R.q); assert.equal(b.niveles[k].gl, R.gl); cerca(b.niveles[k].chi2, R.chi2, 1e-6, R.nivel); });
});

test('revisión 2026.10.20: medias latentes sin diferencia significativa no se redactan como «superó»; criterio estricto de Chen con grupos pequeños', async () => {
    const { redactarParrafo, filasComparaciones } = await import('../../src/analizador/psicometria/invarianza-redaccion.js');
    const r = resultados.invariante, t = redactarParrafo(r);
    r.medias.filter(m => m.p >= 0.05).forEach(m => assert.match(t, new RegExp(`en ${m.factor}, el grupo ${m.grupo} no difirió significativamente`)));
    r.medias.filter(m => m.p < 0.05).forEach(m => assert.match(t, new RegExp(`en ${m.factor}, el grupo ${m.grupo} (superó|quedó por debajo)`)));
    assert.equal(r.grupoPequeno, true, 'los grupos del conjunto tienen menos de 300 casos');
    // un nivel que pasa el criterio estándar pero no el estricto lleva †
    const copia = { ...r, niveles: r.niveles.map((R, k) => (k === 1 ? { ...R, delta: { ...R.delta, CFI: -0.007, RMSEA: 0.012, estricto: true } } : R)) };
    assert.match(filasComparaciones(copia)[0][7], /Se sostiene †/);
    assert.match(redactarParrafo(copia), /criterio más estricto de Chen \(2007\) .* no respaldaría la invarianza métrica/);
});

test('revisión 2026.10.20: variables de agrupación sin las baterías de ítems ni los indicadores del modelo; valores con coma decimal', async () => {
    const { variablesDeGrupo } = await import('../../src/analizador/psicometria/invarianza-ui.js');
    const filas = Array.from({ length: 300 }, (_, i) => ({ Sexo: i % 2 ? 'Mujer' : 'Varón', Edad: 12 + (i % 6), A1: 1 + (i % 5), A2: 1 + ((i * 3) % 5), A3: 1 + ((i * 7) % 5), Grado: 1 + (i % 5), Turno: 1 + (i % 2) }));
    assert.deepEqual(variablesDeGrupo(filas), ['Sexo', 'Edad', 'Grado', 'Turno']);
    assert.deepEqual(variablesDeGrupo(filas, ['Turno']), ['Sexo', 'Edad', 'Grado']);
    const d = fx.conjuntos.invariante.datos, conComa = d.map(f => ({ ...f, i1: String(f.i1).replace('.', ',') }));
    cerca(analizarInvarianza(MODELO, conComa, 'g').niveles[0].chi2, resultados.invariante.niveles[0].chi2, 1e-6, 'χ² con «3,25»');
});
