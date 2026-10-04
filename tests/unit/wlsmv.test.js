// tests/unit/wlsmv.test.js — paso 4B (WLSMV), comprobaciones deterministas. La validación estadística de Γ, los EE robustos
// y el χ² corregido es por Monte Carlo (tests/montecarlo/wlsmv.mjs, en `npm run test:completo`).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { estadisticosOrdinales, ajustarDWLS, inferenciaWLSMV } from '../../src/analizador/psicometria/wlsmv.js';
import { crearAleatorio } from '../../src/analizador/psicometria/aleatorio.js';

const cerca = (a, b, tol, que) => assert.ok(Math.abs(a - b) <= tol, `${que}: ${a} vs ${b}`);
let SEM, AnalizadorEstadistico;
const rng = crearAleatorio(4242);
const normal = () => { let u = 0; while (u === 0) u = rng.siguiente(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng.siguiente()); };
const simular = (lam, n, cortes = [-1.2, -0.4, 0.4, 1.2]) => { const cols = lam.map(() => new Array(n)); for (let i = 0; i < n; i++) { const f = normal(); lam.forEach((l, j) => { const z = l * f + Math.sqrt(1 - l * l) * normal(); cols[j][i] = 1 + cortes.filter(c => z > c).length; }); } return cols; };

before(async () => {
    ({ SEM } = await import('../../src/analizador/sem-motor.js'));
    ({ AnalizadorEstadistico } = await import('../../src/analizador/estadistica.js'));
});

test('modelo exactamente identificado (1 factor, 3 ítems): ajuste perfecto y λⱼλₗ = ρⱼₗ', () => {
    const cols = simular([0.8, 0.7, 0.6], 800), sm = estadisticosOrdinales(cols);
    const est = SEM._construir(SEM.parsear('F =~ A + B + C'), sm.R, ['A', 'B', 'C']), fit = ajustarDWLS(est, sm), inf = inferenciaWLSMV(sm, fit);
    assert.ok(fit.opt.convergio); assert.equal(inf.gl, 0); cerca(inf.T, 0, 1e-8, 'T');
    const phi = fit.theta[fit.libres.find(k => est.libres[k].nombre === 'var (F)')], l = [1, ...fit.libres.filter(k => est.libres[k].mat === 'A').map(k => fit.theta[k])].map(v => v * Math.sqrt(phi));
    cerca(l[0] * l[1], sm.R[0][1], 1e-6, 'ρ12'); cerca(l[0] * l[2], sm.R[0][2], 1e-6, 'ρ13'); cerca(l[1] * l[2], sm.R[1][2], 1e-6, 'ρ23');
});

test('χ² corregido: si Γ fuera diagonal (= W⁻¹), U·Γ es una proyección (a = b = gl) y la corrección no cambia nada', () => {
    const cols = simular([0.8, 0.7, 0.6, 0.7, 0.5], 600), sm = estadisticosOrdinales(cols);
    sm.Gamma = sm.Gamma.map((f, r) => f.map((v, s) => (r === s ? v : 0)));
    const est = SEM._construir(SEM.parsear('F =~ A + B + C + D + E'), sm.R, ['A', 'B', 'C', 'D', 'E']), fit = ajustarDWLS(est, sm), inf = inferenciaWLSMV(sm, fit);
    cerca(inf.correccion.a, inf.gl, 1e-8, 'a = tr(UΓ)'); cerca(inf.correccion.b, inf.gl, 1e-8, 'b = tr((UΓ)²)'); cerca(inf.chi2, inf.T, 1e-8, 'T corregido = T');
});

test('Γ: simétrica, con diagonal positiva, y las funciones de influencia centradas (τ̂ y ρ̂ anulan sus ecuaciones)', () => {
    const sm = estadisticosOrdinales(simular([0.8, 0.6, 0.7, 0.5], 500));
    sm.Gamma.forEach((f, r) => { assert.ok(f[r] > 0); f.forEach((v, s) => cerca(v, sm.Gamma[s][r], 1e-15, 'simetría')); });
    assert.equal(sm.pares.length, 6);
});

test('motor: SEM.ajustar con estimador WLSMV (2 factores, 8 ítems) — convergencia, índices y EE robustos; errores útiles', () => {
    const cols = [...simular([0.8, 0.7, 0.7, 0.6], 500), ...simular([0.7, 0.6, 0.8, 0.7], 500)];
    const nombres = ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4'];
    AnalizadorEstadistico.cargarDatos(cols[0].map((_, i) => Object.fromEntries(nombres.map((nm, j) => [nm, cols[j][i]]))));
    const R = SEM.ajustar('FA =~ A1 + A2 + A3 + A4\nFB =~ B1 + B2 + B3 + B4', null, 'dos', { estimador: 'WLSMV' });
    assert.ok(!R.error && R.convergio && R.estimador === 'WLSMV' && R.gl === 28 - 9, R.error || JSON.stringify(R.optimizacion));
    assert.ok(R.CFI > 0.95 && R.RMSEA < 0.06 && R.SRMR < 0.06 && R.parametros.every(p => p.se > 0), `CFI ${R.CFI} RMSEA ${R.RMSEA}`);
    assert.ok(Math.abs(R.parametros.find(p => p.nombre === 'FA ~~ FB').estimado) < 0.15, 'factores simulados independientes');
    assert.match(SEM.ajustar('FA =~ A1 + A2 + A3\nA4 ~ FA', null, 'x', { estimador: 'WLSMV' }).error, /toda variable observada debe ser indicador/);
    AnalizadorEstadistico.cargarDatos(cols[0].map((_, i) => ({ A1: cols[0][i] + 0.5, A2: cols[1][i], A3: cols[2][i] })));
    assert.match(SEM.ajustar('FA =~ A1 + A2 + A3', null, 'x', { estimador: 'WLSMV' }).error, /ítems ordinales.*A1/);
});

test('revisión 2026.10.17: a = tr(UΓ) y b = tr((UΓ)²) sin formar U coinciden con el cálculo directo', async () => {
    const { multiplicar, traspuesta, inversaDefinidaPositiva } = await import('../../src/analizador/psicometria/algebra.js');
    const cols = simular([0.8, 0.7, 0.6, 0.7, 0.5, 0.6], 500), nm = ['A', 'B', 'C', 'D', 'E', 'F'], sm = estadisticosOrdinales(cols);
    const est = SEM._construir(SEM.parsear('G =~ ' + nm.join(' + ')), sm.R, nm), fit = ajustarDWLS(est, sm), inf = inferenciaWLSMV(sm, fit);
    const W = fit.w, D = fit.Delta, P = W.length, WD = D.map((f, r) => f.map(v => v * W[r])), Hi = inversaDefinidaPositiva(multiplicar(traspuesta(D), WD)), WDHi = multiplicar(WD, Hi);
    const U = Array.from({ length: P }, (_, r) => Array.from({ length: P }, (_, s) => (r === s ? W[r] : 0) - WDHi[r].reduce((t, v, q) => t + v * WD[s][q], 0)));
    const UG = multiplicar(U, sm.Gamma.map(f => Array.from(f)));
    let a = 0, b = 0;
    for (let r = 0; r < P; r++) { a += UG[r][r]; for (let s = 0; s < P; s++) b += UG[r][s] * UG[s][r]; }
    cerca(inf.correccion.a, a, 1e-10 * a, 'a'); cerca(inf.correccion.b, b, 1e-10 * b, 'b');
});

test('revisión 2026.10.17: WLSMV con 40 ítems (780 correlaciones) en tiempo razonable', () => {
    const lam = Array.from({ length: 40 }, (_, j) => 0.5 + 0.3 * ((j * 7) % 10) / 10), cols = simular(lam, 600), nm = lam.map((_, j) => 'I' + (j + 1));
    const t0 = Date.now(), sm = estadisticosOrdinales(cols), est = SEM._construir(SEM.parsear('G =~ ' + nm.join(' + ')), sm.R, nm), fit = ajustarDWLS(est, sm), inf = inferenciaWLSMV(sm, fit);
    assert.ok(fit.opt.convergio && Number.isFinite(inf.chi2) && inf.gl === 780 - 40);
    assert.ok(Date.now() - t0 < 60000, 'antes, solo U·Γ costaba 780³ ≈ 5·10⁸ operaciones');
});

test('revisión 2026.10.18: tabla 2 × 2 con celda vacía — corrección de lavaan con márgenes intactos, solo en WLSMV, y aviso si no informa', async () => {
    const { policorica, umbralesDe } = await import('../../src/analizador/psicometria/policorica.js');
    const { cdfNormalBivariada } = await import('../../src/analizador/psicometria/numerico.js');
    const x = [], y = [];
    for (let i = 0; i < 300; i++) { const a = i < 90 ? 0 : 1; x.push(a); y.push(a === 0 ? 0 : (i % 3 === 0 ? 0 : 1)); }
    assert.equal(policorica(x, y).rho, 0.9999, 'sin la opción (fiabilidad) sigue en el límite');
    const pc = policorica(x, y, { corregirCeros: true }), fa = [90, 210], fb = [90 + 70, 140];
    const a1 = umbralesDe(fa).filter(Number.isFinite)[0], b1 = umbralesDe(fb).filter(Number.isFinite)[0];
    cerca(cdfNormalBivariada(a1, b1, pc.rho), (90 - 0.5) / 300, 1e-12, 'Φ₂ reproduce la celda corregida con los umbrales originales');
    cerca(pc.esperada, (90 * 140) / 300, 1e-12, 'frecuencia esperada de la celda vacía');
    const filas = Array.from({ length: 300 }, (_, i) => { const f = normal(), z = k => (0.8 * f + 0.6 * normal() > k ? 1 : 0); const A = i < 8 ? 0 : 1, B = A ? z(1.6) : 0; return { A, B, C: z(0), D: z(0.3), E: z(-0.4) }; });
    AnalizadorEstadistico.cargarDatos(filas);
    const R = SEM.ajustar('F =~ A + B + C + D + E', null, 'x', { estimador: 'WLSMV' });
    assert.ok(!R.error && R.convergio && R.tablasCorregidas >= 1, R.error);
    assert.ok(R.avisos.some(a => /A–B la celda vacía es esperable/.test(a)) && R.avisos.some(a => /como hace lavaan por defecto/.test(a)));
});
