// tests/unit/invarianza-ordinal.test.js — paso 6B, comprobaciones deterministas. La validación estadística (tasas de
// rechazo de DIFFTEST, calibración de los EE, potencia) es por Monte Carlo: tests/montecarlo/invarianza-ordinal.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as I from '../../src/analizador/psicometria/invarianza-ordinal.js';
import { estadisticosOrdinales, ajustarDWLS } from '../../src/analizador/psicometria/wlsmv.js';
import { SEM } from '../../src/analizador/sem-motor.js';
import { crearAleatorio } from '../../src/analizador/psicometria/aleatorio.js';

const cerca = (a, b, tol, que) => assert.ok(Math.abs(a - b) <= tol, `${que}: ${a} vs ${b}`);
const rng = crearAleatorio(8), nrm = () => { let u = 0; while (u === 0) u = rng.siguiente(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng.siguiente()); };
const lam = [0.8, 0.7, 0.6, 0.7, 0.5, 0.6], nm = lam.map((_, j) => 'y' + (j + 1)), MODELO = { latentes: { F: nm }, covars: [] };
const simular = (cortes, desplazamiento = 0) => [['A', 400, 0, 1], ['B', 400, 0.4, 1.3]].flatMap(([g, n, mu, v]) => Array.from({ length: n }, () => {
    const f = mu + Math.sqrt(v) * nrm(), o = { g };
    lam.forEach((l, j) => { o[nm[j]] = 1 + cortes.filter(c => l * f + Math.sqrt(1 - l * l) * nrm() - (g === 'B' && j === 3 ? desplazamiento : 0) > c).length; });
    return o;
}));
const d5 = simular([-1.2, -0.4, 0.4, 1.2]), r5 = I.analizarInvarianzaOrdinal(MODELO, d5, 'g');

test('configural = suma de los WLSMV de un solo grupo del paso 4B (χ² DWLS idéntico)', () => {
    let suma = 0;
    for (const g of ['A', 'B']) {
        const sm = estadisticosOrdinales(nm.map(c => d5.filter(f => f.g === g).map(f => f[c])));
        suma += sm.n * ajustarDWLS(SEM._construir(SEM.parsear('F =~ ' + nm.join(' + ')), sm.R, nm), sm).Fmin;
    }
    cerca(r5.niveles[0].T, suma, 1e-7, 'T configural');
    assert.deepEqual(r5.niveles.map(R => R.nivel), ['configural', 'umbrales', 'metrica', 'escalar']);
});

test('con ítems de 3 categorías, el modelo de umbrales es equivalente al configural (Wu y Estabrook, 2016)', () => {
    const r = I.analizarInvarianzaOrdinal(MODELO, simular([-0.5, 0.6]), 'g');
    cerca(r.niveles[1].T, r.niveles[0].T, 1e-7, 'T'); assert.equal(r.niveles[1].gl, r.niveles[0].gl);
    assert.ok(r.niveles[1].delta.equivalente && r.niveles[1].decision === 'equivalente');
});

test('gradiente analítico igual a diferencias centrales en los cuatro niveles', () => {
    const est = I.estadisticosOrdinalesPorGrupo(d5, nm, 'g');
    for (const nv of I.NIVELES_ORDINALES) {
        const esp = I.especificarOrdinal(MODELO, nm, est.cats, 2, nv), x = esp.libres.map((pl, k) => ({ carga: 0.9, escala: 1.1, varLatente: 0.5, umbral: -0.5 + 0.25 * (k % 5), intercepto: 0.1, mediaLatente: 0.2 })[pl.tipo] ?? 0.05);
        const ga = I.evaluarOrdinal(esp, est.grupos, est.N, x).grad;
        x.forEach((_, k) => { const h = 1e-6, a = x.slice(), b = x.slice(); a[k] += h; b[k] -= h; cerca(ga[k], (I.evaluarOrdinal(esp, est.grupos, est.N, a, false).f - I.evaluarOrdinal(esp, est.grupos, est.N, b, false).f) / (2 * h), 1e-7, `${nv.clave} ∂F/∂θ${k}`); });
    }
});

// Con Γ = W⁻¹, tr(U_kΓ) = D − q_k es exacto en cada modelo (a = Δgl exacto); b = Δgl solo lo es si ambas jacobianas se
// evalúan en un mismo punto: DIFFTEST (como en Mplus) evalúa cada modelo en sus estimaciones, así que la igualdad es
// asintótica (diferencia ~10⁻⁵ aquí). La calibración real la comprueba el Monte Carlo.
test('DIFFTEST: si Γ fuera diagonal (= W⁻¹), U₀ − U₁ es casi una proyección de rango Δgl y la corrección casi no cambia nada', () => {
    const est = I.estadisticosOrdinalesPorGrupo(d5, nm, 'g');
    est.grupos.forEach(D => { D.Gamma = D.Gamma.map((f, a) => f.map((v, b) => (a === b ? v : 0))); });
    const R1 = I.ajustarNivelOrdinal(MODELO, nm, est.cats, est.grupos, I.NIVELES_ORDINALES[2]), R0 = I.ajustarNivelOrdinal(MODELO, nm, est.cats, est.grupos, I.NIVELES_ORDINALES[3]);
    const dt = I.difftest(R0, R1);
    cerca(dt.a, dt.gl, 1e-6, 'a = Δgl (exacto)'); cerca(dt.b, dt.gl, 1e-3 * dt.gl, 'b ≈ Δgl'); cerca(dt.chi2, dt.bruto, 1e-3 * Math.max(1, dt.bruto), 'T corregido ≈ T');
});

test('interceptos no invariantes (un ítem desplazado en un grupo): el paso escalar no se sostiene', () => {
    const r = I.analizarInvarianzaOrdinal(MODELO, simular([-1.2, -0.4, 0.4, 1.2], 0.8), 'g');
    assert.deepEqual(r.niveles.map(R => R.decision), ['base', 'se sostiene', 'se sostiene', 'no se sostiene']);
    assert.ok(r.niveles[3].delta.p < 0.001 && r.medias.length === 0);
    assert.deepEqual(r5.niveles.map(R => R.decision), ['base', 'se sostiene', 'se sostiene', 'se sostiene']);
    assert.ok(Math.abs(r5.medias[0].d - 0.4) < 0.12, `d latente ${r5.medias[0].d}`);
});

test('errores útiles: dicotómicos, categoría ausente en un grupo, grupo pequeño, valores no ordinales', () => {
    assert.match(I.analizarInvarianzaOrdinal(MODELO, simular([0]), 'g').error, /menos de 3 categorías/);
    const sinCat = d5.map(f => (f.g === 'B' && f.y2 === 5 ? { ...f, y2: 4 } : f));
    assert.match(I.analizarInvarianzaOrdinal(MODELO, sinCat, 'g').error, /grupo «B», el ítem «y2» no tiene respuestas en la categoría 5/);
    assert.match(I.analizarInvarianzaOrdinal(MODELO, d5.filter((f, i) => f.g === 'A' || i % 10 === 0), 'g').error, /casos completos; con WLSMV hacen falta al menos 50/);
    assert.match(I.analizarInvarianzaOrdinal(MODELO, d5.map(f => ({ ...f, y1: f.y1 + 0.5 })), 'g').error, /ítems ordinales/);
});

test('categoría vacía en un grupo: error por defecto; con «agrupar», se une a la contigua en todos los grupos y se declara', async () => {
    const { redactarParrafo } = await import('../../src/analizador/psicometria/invarianza-redaccion.js');
    const sinCat = d5.map(f => (f.g === 'B' && f.y2 === 5 ? { ...f, y2: 4 } : f));
    assert.match(I.analizarInvarianzaOrdinal(MODELO, sinCat, 'g').error, /no tiene respuestas en la categoría 5/);
    const r = I.analizarInvarianzaOrdinal(MODELO, sinCat, 'g', { agrupar: true });
    assert.ok(!r.error, r.error);
    assert.deepEqual(r.agrupadas, [{ item: 'y2', de: 5, en: 4 }]);
    assert.match(redactarParrafo(r), /se agruparon con la contigua en todos los grupos \(y2: 5 con 4\)/);
    // agrupar no cambia nada cuando no hay categorías vacías
    assert.deepEqual(I.analizarInvarianzaOrdinal(MODELO, d5, 'g', { agrupar: true }).agrupadas, []);
});

test('revisión 2026.10.22: la lista de referencias coincide con las citas del párrafo y las notas (ML y WLSMV)', async () => {
    const fs = await import('node:fs');
    const Rd = await import('../../src/analizador/psicometria/invarianza-redaccion.js');
    const { analizarInvarianza } = await import('../../src/analizador/psicometria/invarianza.js');
    const fx = JSON.parse(fs.readFileSync(new URL('../oracle/invarianza_fixture.json', import.meta.url), 'utf8'));
    const ml = analizarInvarianza({ latentes: { F1: ['i1', 'i2', 'i3'], F2: ['i4', 'i5', 'i6'] }, covars: [] }, fx.conjuntos.invariante.datos, 'g');
    for (const r of [r5, ml]) {
        const texto = [Rd.redactarParrafo(r), Rd.notaAjuste(r), Rd.notaComparaciones(r), r.medias.length ? Rd.notaMedias(r) : ''].join(' ');
        const citas = new Set((texto.match(/[A-ZÁÉÍÓÚ][a-záéíóúñ]+(?: y [A-ZÁÉÍÓÚ][a-záéíóúñ]+)?,? \(?\d{4}/g) || []).map(c => c.split(/[ ,(]/)[0] + ' ' + c.match(/\d{4}/)[0]));
        const refs = new Set(Rd.referenciasInvarianza(r).map(x => { const t = x.replace(/<[^>]+>/g, ''); return t.split(',')[0] + ' ' + t.match(/\((\d{4})\)/)[1]; }));
        assert.deepEqual([...refs].sort(), [...citas].sort(), r.estimador || 'ML');
    }
});
