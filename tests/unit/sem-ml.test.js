// tests/unit/sem-ml.test.js — paso 4A: el motor SEM por máxima verosimilitud contra un oráculo independiente (forma
// LISREL, SciPy con gradiente numérico), gradiente analítico del modelo RAM frente a diferencias finitas (también con
// rutas estructurales) y convergencia real en un AFC grande.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gradienteFML } from '../../src/analizador/psicometria/ram.js';
import { bfgs } from '../../src/analizador/psicometria/optimizacion.js';

const afe = JSON.parse(fs.readFileSync(new URL('../oracle/afe_fixture.json', import.meta.url), 'utf8'));
const or = JSON.parse(fs.readFileSync(new URL('../oracle/sem_fixture.json', import.meta.url), 'utf8'));
const cerca = (a, b, tol, que) => assert.ok(Math.abs(a - b) <= tol, `${que}: ${a} vs ${b}`);
let SEM, AnalizadorEstadistico;
const nombres = afe.cols.map((_, j) => 'X' + (j + 1));
const MODELO = 'F1 =~ X1 + X2 + X3 + X4\nF2 =~ X5 + X6 + X7 + X8\nF3 =~ X9 + X10 + X11 + X12';

before(async () => {
    ({ SEM } = await import('../../src/analizador/sem-motor.js'));
    ({ AnalizadorEstadistico } = await import('../../src/analizador/estadistica.js'));
    AnalizadorEstadistico.cargarDatos(afe.cols[0].map((_, i) => Object.fromEntries(nombres.map((nm, j) => [nm, afe.cols[j][i]]))));
});

test('AFC por ML igual al oráculo: estimaciones, errores estándar, χ², CFI, TLI, RMSEA con su IC y SRMR', () => {
    const R = SEM.ajustar(MODELO, null, 'AFC');
    assert.ok(R.convergio && R.optimizacion.metodo === 'BFGS' && R.optimizacion.gradienteMax < 1e-6, JSON.stringify(R.optimizacion));
    cerca(R.Fmin, or.F, 1e-10, 'F_ML'); cerca(R.chi2, or.chi2, 1e-7, 'χ²'); assert.equal(R.gl, or.gl);
    cerca(R.pChi2, or.pChi2, 1e-6, 'p'); cerca(R.CFI, or.CFI, 1e-8, 'CFI'); cerca(R.TLI, or.TLI, 1e-8, 'TLI'); cerca(R.RMSEA, or.RMSEA, 1e-8, 'RMSEA');
    cerca(R.rmseaIC[0], or.rmseaIC[0], 1e-4, 'RMSEA IC inf'); cerca(R.rmseaIC[1], or.rmseaIC[1], 1e-4, 'RMSEA IC sup'); cerca(R.SRMR, or.SRMR, 1e-8, 'SRMR');
    assert.equal(R.parametros.length, Object.keys(or.parametros).length);
    for (const p of R.parametros) {
        const [v, se] = or.parametros[p.nombre];
        cerca(p.estimado, v, 2e-6 * Math.max(1, Math.abs(v)), p.nombre); cerca(p.se, se, 1e-5 * Math.max(1, se), 'EE ' + p.nombre);
    }
});

test('gradiente analítico de F_ML igual a diferencias centrales, también con rutas entre factores y covarianzas residuales', () => {
    const modelo = SEM.parsear('F1 =~ X1 + X2 + X3 + X4\nF2 =~ X5 + X6 + X7 + X8\nF3 =~ X9 + X10 + X11 + X12\nF3 ~ F1 + F2\nX1 ~~ X5');
    const n = afe.cols[0].length, filas = afe.cols[0].map((_, i) => nombres.map((_, j) => afe.cols[j][i]));
    const med = nombres.map((_, j) => filas.reduce((s, f) => s + f[j], 0) / n);
    const S = nombres.map((_, a) => nombres.map((_, b) => filas.reduce((s, f) => s + (f[a] - med[a]) * (f[b] - med[b]), 0) / (n - 1)));
    const est = SEM._construir(modelo, S, nombres), ld = SEM._invLogDet(S).logDet;
    const th = est.libres.map((pl, k) => pl.ini * (1 + 0.15 * Math.cos(k)) + (pl.mat === 'A' && pl.ini === 0 ? 0.2 : 0));
    const ga = gradienteFML(est, th, S);
    th.forEach((_, k) => {
        const h = 1e-6, a = th.slice(), b = th.slice(); a[k] += h; b[k] -= h;
        const gn = (SEM._fml(est, a, S, ld) - SEM._fml(est, b, S, ld)) / (2 * h);
        cerca(ga[k], gn, 1e-6 * Math.max(1, Math.abs(gn)), est.libres[k].nombre);
    });
});

test('BFGS: mínimo de la función de Rosenbrock y respeto de la región no admisible', () => {
    const f = x => (1 - x[0]) ** 2 + 100 * (x[1] - x[0] ** 2) ** 2;
    const g = x => [-2 * (1 - x[0]) - 400 * x[0] * (x[1] - x[0] ** 2), 200 * (x[1] - x[0] ** 2)];
    const r = bfgs(f, g, [-1.2, 1], { tolGrad: 1e-10 });
    assert.ok(r.convergio); cerca(r.x[0], 1, 1e-8, 'x'); cerca(r.x[1], 1, 1e-8, 'y');
    const pen = x => (x[0] < 0.5 ? 1e10 : (x[0] - 0.7) ** 2), gp = x => [2 * (x[0] - 0.7)];
    const r2 = bfgs(pen, gp, [3]);
    assert.ok(r2.convergio && Math.abs(r2.x[0] - 0.7) < 1e-7, 'no cruza a la región penalizada');
});

test('AFC de 24 ítems y 3 factores (51 parámetros): converge de verdad y rápido', () => {
    let s = 17; const u = () => (s = (s * 16807) % 2147483647) / 2147483647; const nrm = () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
    const nm = Array.from({ length: 24 }, (_, j) => 'I' + (j + 1)), datos = [];
    for (let i = 0; i < 400; i++) {
        const g = nrm(), F = [0, 1, 2].map(() => 0.6 * g + 0.8 * nrm()), fila = {};
        nm.forEach((v, j) => { const z = 0.7 * F[Math.floor(j / 8)] + 0.714 * nrm(); fila[v] = z < -1 ? 1 : z < -0.3 ? 2 : z < 0.4 ? 3 : z < 1.2 ? 4 : 5; });
        datos.push(fila);
    }
    AnalizadorEstadistico.cargarDatos(datos);
    const R = SEM.ajustar([0, 1, 2].map(f => `F${f + 1} =~ ` + nm.slice(8 * f, 8 * f + 8).join(' + ')).join('\n'), null, 'AFC 24');
    assert.ok(R.convergio && R.q === 51 && R.optimizacion.gradienteMax < 1e-6, JSON.stringify(R.optimizacion));
    assert.ok(R.optimizacion.iteraciones < 500, 'converge en pocas iteraciones: ' + R.optimizacion.iteraciones);   // no se mide el tiempo: dependería de la máquina
    assert.ok(R.CFI > 0.95 && R.RMSEA < 0.06, 'la estructura simulada ajusta: CFI ' + R.CFI.toFixed(3));
});

test('revisión 2026.10.14: caso Heywood señalado (varianza residual negativa) y solución marcada como no admisible', () => {
    // r12 = r13 = .8, r23 = .5 con un factor: λ₁² = .8·.8/.5 = 1.28 > 1, así que la varianza residual de V1 es negativa
    const L = [[1, 0, 0], [0.8, 0.6, 0], [0.8, (0.5 - 0.64) / 0.6, 0]];
    L[2][2] = Math.sqrt(1 - L[2][0] ** 2 - L[2][1] ** 2);
    let s = 23; const u = () => (s = (s * 16807) % 2147483647) / 2147483647; const nrm = () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
    AnalizadorEstadistico.cargarDatos(Array.from({ length: 3000 }, () => { const z = [nrm(), nrm(), nrm()]; return Object.fromEntries([0, 1, 2].map(i => ['V' + (i + 1), L[i].reduce((a, l, k) => a + l * z[k], 0)])); }));
    const R = SEM.ajustar('F =~ V1 + V2 + V3', null, 'Heywood');
    assert.ok(R.convergio && R.admisible === false, JSON.stringify(R.optimizacion));
    assert.ok(R.avisos.some(a => /Varianza negativa en «var residual \(V1\)»/.test(a)), R.avisos.join(' | '));
});

test('revisión 2026.10.14: modelo de rutas con variables de varianza grande → mismas pendientes que MCO (convergencia escalada)', () => {
    let s = 29; const u = () => (s = (s * 16807) % 2147483647) / 2147483647; const nrm = () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
    const datos = Array.from({ length: 500 }, () => { const x = nrm(), m = 0.5 * x + nrm(), y = 0.4 * m + 0.2 * x + nrm(); return { X: 100 * x, M: 100 * m, Y: 100 * y }; });
    AnalizadorEstadistico.cargarDatos(datos);
    const R = SEM.ajustar('M ~ X\nY ~ M + X', null, 'Rutas');
    assert.ok(R.convergio && R.gl === 0, JSON.stringify(R.optimizacion));
    const med = k => datos.reduce((a, d) => a + d[k], 0) / datos.length, cov = (a, b) => { const ma = med(a), mb = med(b); return datos.reduce((t, d) => t + (d[a] - ma) * (d[b] - mb), 0) / (datos.length - 1); };
    const bMX = cov('X', 'M') / cov('X', 'X');
    const det = cov('M', 'M') * cov('X', 'X') - cov('M', 'X') ** 2;
    const bYM = (cov('Y', 'M') * cov('X', 'X') - cov('Y', 'X') * cov('M', 'X')) / det, bYX = (cov('Y', 'X') * cov('M', 'M') - cov('Y', 'M') * cov('M', 'X')) / det;
    const est = nombre => R.parametros.find(p => p.nombre === nombre).estimado;
    cerca(est('M ~ X'), bMX, 1e-6, 'M ~ X'); cerca(est('Y ~ M'), bYM, 1e-6, 'Y ~ M'); cerca(est('Y ~ X'), bYX, 1e-6, 'Y ~ X');
});

test('(paso 5) validez convergente y discriminante iguales al oráculo: CR, AVE, correlaciones entre factores y HTMT', () => {
    AnalizadorEstadistico.cargarDatos(afe.cols[0].map((_, i) => Object.fromEntries(nombres.map((nm, j) => [nm, afe.cols[j][i]]))));
    const R = SEM.ajustar(MODELO, null, 'AFC'), v = R.validez, o = or.validez;
    v.porFactor.forEach((f, i) => {
        cerca(f.CR, o.factores[f.nombre].CR, 1e-6, f.nombre + ' CR'); cerca(f.AVE, o.factores[f.nombre].AVE, 1e-6, f.nombre + ' AVE');
        cerca(f.raizAVE, Math.sqrt(o.factores[f.nombre].AVE), 1e-6, '√AVE');
        const maxR = Math.max(...o.correlaciones[i].filter((_, j) => j !== i).map(Math.abs));
        cerca(f.maxR, maxR, 1e-6, f.nombre + ' máx r'); assert.equal(f.fornellLarcker, f.raizAVE > maxR);
    });
    for (const [par, h] of Object.entries(o.htmt)) { const [a, b] = par.split('-').map(s => Number(s.slice(1)) - 1); cerca(v.htmt[a][b], h, 1e-12, 'HTMT ' + par); }
});

test('revisión 2026.10.18: estandarización con una latente endógena (antes, ruta estandarizada 1,315 y carga .43)', async () => {
    const { SEMUI } = await import('../../src/analizador/sem-ui.js');
    const { crearAleatorio } = await import('../../src/analizador/psicometria/aleatorio.js');
    const rng = crearAleatorio(77), nrm = () => { let u = 0; while (u === 0) u = rng.siguiente(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng.siguiente()); };
    const filas = Array.from({ length: 800 }, () => { const f1 = nrm(), f2 = 0.8 * f1 + 0.6 * nrm(), o = {}; ['a', 'b', 'c'].forEach(k => { o[k] = 0.8 * f1 + 0.6 * nrm(); }); ['d', 'e', 'f'].forEach(k => { o[k] = 0.7 * f2 + 0.714 * nrm(); }); return o; });
    const sx = 'F1 =~ a + b + c\nF2 =~ d + e + f\nF2 ~ F1';
    for (const [estimador, datos] of [['ML', filas], ['WLSMV', filas.map(o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, 1 + [-1, -0.3, 0.3, 1].filter(c => v > c).length])))]]) {
        AnalizadorEstadistico.cargarDatos(datos);
        const R = SEM.ajustar(sx, null, 'x', { estimador }), std = n => SEMUI._std(R, n, R.parametros.find(p => p.nombre === n).estimado);
        assert.ok(Math.abs(std('F2 ~ F1') - 0.8) < 0.06, `${estimador}: ruta ${std('F2 ~ F1')}`);
        assert.ok(Math.abs(std('F2 =~ e') - 0.7) < 0.06, `${estimador}: carga ${std('F2 =~ e')}`);
    }
});

test('revisión 2026.10.18: WLSMV avisa de modelo no identificado antes de ajustar (antes, «Δᵀ·W·Δ no invertible»)', () => {
    AnalizadorEstadistico.cargarDatos(Array.from({ length: 200 }, (_, i) => ({ a: 1 + (i % 3), b: 1 + ((i * 7) % 3), c: 1 + ((i * 5) % 4), d: 1 + ((i * 3) % 4) })));
    assert.match(SEM.ajustar('F1 =~ a + b\nF2 =~ c + d\na ~~ c\nb ~~ d\na ~~ d\nb ~~ c', null, 'x', { estimador: 'WLSMV' }).error, /Modelo no identificado: 9 parámetros frente a 6/);
});
