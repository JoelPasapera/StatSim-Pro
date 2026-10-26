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
        const [v, se, pOr] = or.parametros[p.nombre];
        // (2026.12.10) también su valor p (z de Wald, bilateral), en escala logarítmica: ninguna prueba lo comprobaba
        assert.ok(Math.abs(Math.log(p.pValor) - Math.log(pOr)) < 0.01, `p ${p.nombre}: ${p.pValor} frente a ${pOr} (oráculo)`);
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

test('revisión de la 2026.12.09: con WLSMV, el valor p de la χ² es finito y es la cola de la χ² (ninguna prueba lo comprobaba: roto, siempre NaN, nada avisaba)', async () => {
    const { pChiCuadrado } = await import('../../src/core/stats/numerico.js');
    let s = 12345 >>> 0;
    const u = () => { s = (s + 0x6D2B79F5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
    const nrm = () => Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u());
    const cat = z => (z < -1.2 ? 1 : z < -0.4 ? 2 : z < 0.4 ? 3 : z < 1.2 ? 4 : 5);
    AnalizadorEstadistico.cargarDatos(Array.from({ length: 300 }, () => { const f = nrm(), it = () => cat(0.75 * f + 0.66 * nrm()); return { a: it(), b: it(), c: it(), d: it() }; }));
    const R = SEM.ajustar('F1 =~ a + b + c + d', null, 'x', { estimador: 'WLSMV' });
    assert.ok(!R.error, R.error);
    assert.ok(R.gl > 0 && Number.isFinite(R.pChi2) && R.pChi2 > 0 && R.pChi2 <= 1, `p ${R.pChi2} con χ²(${R.gl}) = ${R.chi2}`);
    cerca(R.pChi2, pChiCuadrado(R.chi2, R.gl), 1e-12, 'p de la χ² (WLSMV)');
});


test('(2027.01.06, revisión) la comparación de modelos, uno por papel: volver a ajustar uno con la misma etiqueta lo reemplaza (al final, el último); los de otro papel se suman', () => {
    AnalizadorEstadistico.cargarDatos(afe.cols[0].map((_, i) => Object.fromEntries(nombres.map((nm, j) => [nm, afe.cols[j][i]]))));   // (otras pruebas cargan otros)
    SEM._ultimos.length = 0;
    const papeles = () => SEM._ultimos.map(M => M.etiquetaModelo);
    const uno = 'F1 =~ X1 + X2 + X3 + X4', tres = MODELO;
    SEM.ajustar(uno, null, 'Modelo alternativo');
    SEM.ajustar(tres, null, 'Modelo final');
    assert.deepEqual(papeles(), ['Modelo alternativo', 'Modelo final']);
    // repetir los dos (como «Hazlo por mí» del paso del SEM de un ejemplo, otra vez): la misma comparación, no cuatro modelos
    const otraVez = [SEM.ajustar(uno, null, 'Modelo alternativo'), SEM.ajustar(tres, null, 'Modelo final')];
    assert.deepEqual(papeles(), ['Modelo alternativo', 'Modelo final']);
    assert.ok(SEM._ultimos[0] === otraVez[0] && SEM._ultimos[1] === otraVez[1], 'los de ahora (no los de antes)');
    // otro papel se suma; el que se vuelve a ajustar pasa al final (es el que muestran la tarjeta y el capítulo de Word)
    SEM.ajustar(uno, null, 'Modelo inicial');
    SEM.ajustar(uno, null, 'Modelo alternativo');
    assert.deepEqual(papeles(), ['Modelo final', 'Modelo inicial', 'Modelo alternativo']);
    // (los cinco últimos, como antes, con papeles distintos)
    for (const p of ['A', 'B', 'C']) SEM.ajustar(uno, null, p);
    assert.deepEqual(papeles(), ['Modelo inicial', 'Modelo alternativo', 'A', 'B', 'C']);
    SEM._ultimos.length = 0;
});

test('(2027.01.12) una covarianza que el modelo ya estima, escrita también en la sintaxis (F1 ~~ F2 entre factores exógenos, como en lavaan; dos veces o al revés; entre predictores observados), o una varianza escrita como F1 ~~ F1: un solo parámetro, con ML y con WLSMV (antes, uno más sobre la misma celda: un grado de libertad menos, con él la p, el CFI, el TLI y el RMSEA, y todos los EE, NaN)', () => {
    AnalizadorEstadistico.cargarDatos(afe.cols[0].map((_, i) => Object.fromEntries(nombres.map((nm, j) => [nm, afe.cols[j][i]]))));   // (otras pruebas cargan otros)
    /** El mismo ajuste que sin lo añadido: grados de libertad, índices, parámetros (uno por celda) y sus EE. */
    const igual = (/** @type {string} */ sx, /** @type {string} */ extra, /** @type {object} */ op = {}) => {
        const a = SEM.ajustar(sx, null, 'x', op), b = SEM.ajustar(sx + extra, null, 'x', op);
        assert.ok(!a.error && !b.error, `${a.error || ''} ${b.error || ''}`);
        assert.equal(b.gl, a.gl, `gl con «${extra.trim()}»`);
        for (const k of ['chi2', 'pChi2', 'CFI', 'TLI', 'RMSEA']) cerca(b[k], a[k], 1e-6 * Math.max(1, Math.abs(a[k])), `${k} con «${extra.trim()}»`);
        assert.deepEqual(b.parametros.map((/** @type {any} */ p) => p.nombre), a.parametros.map((/** @type {any} */ p) => p.nombre), `los mismos parámetros, una vez cada uno, con «${extra.trim()}»`);
        b.parametros.forEach((/** @type {any} */ p, /** @type {number} */ k) => {
            cerca(p.estimado, a.parametros[k].estimado, 1e-6, `${p.nombre} con «${extra.trim()}»`);
            assert.ok(Number.isFinite(p.se), `EE de ${p.nombre} con «${extra.trim()}»: ${p.se}`);
        });
    };
    for (const extra of ['\nF1 ~~ F2', '\nF2 ~~ F1\nF1 ~~ F2', '\nF1 ~~ F1', '\nF3 ~~ F1\nF2 ~~ F3\nX1 ~~ X1']) igual(MODELO, extra);
    igual('X12 ~ X1 + X2 + X3\nX11 ~ X12', '\nX1 ~~ X2\nX3 ~~ X1');   // (con grados de libertad: X11 solo por X12)
    // con WLSMV (ítems de cinco categorías), igual
    let s = 2027 >>> 0;
    const u = () => { s = (s + 0x6D2B79F5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
    const nrm = () => Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u());
    const cat = (/** @type {number} */ z) => (z < -1.2 ? 1 : z < -0.4 ? 2 : z < 0.4 ? 3 : z < 1.2 ? 4 : 5);
    AnalizadorEstadistico.cargarDatos(Array.from({ length: 400 }, () => { const f = nrm(), g = 0.5 * f + 0.87 * nrm(), it = (/** @type {number} */ x) => cat(0.75 * x + 0.66 * nrm()); return { a: it(f), b: it(f), c: it(f), d: it(g), e: it(g), f: it(g) }; }));
    igual('F1 =~ a + b + c\nF2 =~ d + e + f', '\nF1 ~~ F2', { estimador: 'WLSMV' });
});

test('(2027.01.12) el diagrama de rutas dibuja todas las covarianzas que estima el modelo (también las que no escribe la sintaxis: entre factores exógenos), con su correlación; las escritas, una vez', async () => {
    const { SEMUI } = await import('../../src/analizador/sem-ui.js');
    AnalizadorEstadistico.cargarDatos(afe.cols[0].map((_, i) => Object.fromEntries(nombres.map((nm, j) => [nm, afe.cols[j][i]]))));   // (otras pruebas cargan otros)
    for (const sx of [MODELO, MODELO + '\nF2 ~~ F1']) {
        const R = SEM.ajustar(sx, null, 'x');
        const svg = SEMUI.diagramaSVG(R);
        assert.equal((svg.match(/stroke-dasharray="5,4"/g) || []).length, 3, `tres covarianzas entre los factores, con «${sx.split('\n').pop()}»`);
        const varDe = (/** @type {string} */ F) => R.parametros.find((/** @type {any} */ p) => p.nombre === `var (${F})`).estimado;
        for (const [a, b] of [['F1', 'F2'], ['F1', 'F3'], ['F2', 'F3']]) {
            const cov = R.parametros.find((/** @type {any} */ p) => p.nombre === `${a} ~~ ${b}`).estimado, r = cov / Math.sqrt(varDe(a) * varDe(b));
            assert.ok(r > 0 && r < 1 && svg.includes(`>${r.toFixed(2)}</text>`), `${a} ~~ ${b}: su correlación (${r.toFixed(2)}) en el diagrama`);
        }
    }
});

test('(2027.01.12) un factor de segundo orden (G =~ F1 + F2 + F3): se estima (hasta la 2027.01.11, sus factores se buscaban como columnas de los datos: «Casos insuficientes (0)»), con el mismo ajuste que los tres factores correlacionados (es equivalente), la validez de los de primer orden y el «¿es adecuado?» con sus casos', async () => {
    const { SEMUI } = await import('../../src/analizador/sem-ui.js');
    AnalizadorEstadistico.cargarDatos(afe.cols[0].map((_, i) => Object.fromEntries(nombres.map((nm, j) => [nm, afe.cols[j][i]]))));   // (otras pruebas cargan otros)
    const primero = SEM.ajustar(MODELO, null, 'x'), segundo = SEM.ajustar(MODELO + '\nG =~ F1 + F2 + F3', null, 'x');
    assert.ok(!segundo.error, segundo.error);
    assert.deepEqual([segundo.nombresObs.length, segundo.gl], [12, primero.gl], 'doce observadas (no quince), y los grados de libertad del modelo de primer orden');
    for (const k of ['chi2', 'CFI', 'TLI', 'RMSEA', 'SRMR']) cerca(segundo[k], primero[k], 1e-5 * Math.max(1, Math.abs(primero[k])), k);
    assert.ok(segundo.convergio && segundo.parametros.every((/** @type {any} */ p) => Number.isFinite(p.se)), 'converge, con sus errores estándar');
    assert.deepEqual(segundo.validez.porFactor.map((/** @type {any} */ f) => f.nombre), ['F1', 'F2', 'F3'], 'la validez, de los factores de primer orden');
    const v = SEMUI.evaluarViabilidad(MODELO + '\nG =~ F1 + F2 + F3');
    assert.deepEqual([v.n, v.p], [afe.cols[0].length, 12], 'sus casos y sus doce observadas (no n = 0)');
    // y el diagrama: G, con sus cargas en F1, F2 y F3, con su coeficiente en medio de cada una
    const svg = SEMUI.diagramaSVG(segundo);
    assert.equal((svg.match(/<ellipse/g) || []).length, 4);
});

test('(2027.01.13, revisión) un indicador escrito dos veces en su factor (también el primero, el marcador) y una regresión sobre la flecha de una carga cuentan una vez, y se dice; dos líneas «=~» de un factor se suman (hasta la 2027.01.12, el marcador repetido se liberaba: errores estándar de 10⁶, sin aviso; y la segunda línea reemplazaba a la primera)', async () => {
    const { SEMUI } = await import('../../src/analizador/sem-ui.js');
    AnalizadorEstadistico.cargarDatos(afe.cols[0].map((_, i) => Object.fromEntries(nombres.map((nm, j) => [nm, afe.cols[j][i]]))));   // (otras pruebas cargan otros)
    const base = SEM.ajustar(MODELO, null, 'x');
    assert.deepEqual(base.avisos, [], 'sin avisos, el modelo de siempre');
    const flechasDe = (/** @type {any} */ R) => (SEMUI.diagramaSVG(R).match(/marker-end=/g) || []).length;
    /** La validez (CR, AVE, HTMT…) con 10 cifras, para compararla. @param {any} v */
    const comoTexto = v => JSON.stringify(v, (_, x) => (typeof x === 'number' ? Number(x.toPrecision(10)) : x));
    /** @type {Array<[string, RegExp | null]>} */
    const casos = [
        [MODELO.replace('X3 + X4', 'X3 + X4 + X1'), /dos veces «F1 =~ X1»/],
        [MODELO.replace('X3 + X4', 'X3 + X4 + X3'), /dos veces «F1 =~ X3»/],
        [MODELO.replace('F1 =~ X1 + X2 + X3 + X4', 'F1 =~ X1 + X2\nF1 =~ X3 + X4'), null],
        [MODELO + '\nX2 ~ F1', /«X2 ~ F1» es la misma flecha que «F1 =~ X2»/],
        [MODELO + '\nX1 ~ F1', /«X1 ~ F1» es la misma flecha que «F1 =~ X1»/],
        [MODELO + '\nX5 ~~ X6\nX6 ~~ X5', /«X6 ~~ X5» es la misma covarianza que «X5 ~~ X6»/],
    ];
    for (const [sx, aviso] of casos) {
        const R = SEM.ajustar(sx, null, 'x'), que = sx.replace(/\n/g, ' ; ');
        const otro = sx.includes('X5 ~~ X6') ? SEM.ajustar(MODELO + '\nX5 ~~ X6', null, 'x') : base;
        assert.equal(R.gl, otro.gl, `gl con «${que}»`);
        cerca(R.chi2, otro.chi2, 1e-6 * otro.chi2, `χ² con «${que}»`);
        assert.deepEqual(R.parametros.map((/** @type {any} */ p) => p.nombre), otro.parametros.map((/** @type {any} */ p) => p.nombre), `los mismos parámetros con «${que}»`);
        assert.ok(R.parametros.every((/** @type {any} */ p, /** @type {number} */ k) => Math.abs(p.se - otro.parametros[k].se) < 1e-6), `los mismos errores estándar con «${que}»`);
        if (aviso) assert.ok(R.avisos.some((/** @type {string} */ a) => aviso.test(a)), `«${que}»: ${JSON.stringify(R.avisos)}`);
        else assert.deepEqual(R.avisos, [], que);
        assert.ok(!R.avisos.some((/** @type {string} */ a) => /no parece identificado/.test(a)), `«${que}», identificado`);
        assert.equal(flechasDe(R), flechasDe(otro), `«${que}»: las mismas flechas en el diagrama (sin otra con «0.00»)`);
        // (un indicador escrito dos veces que solo se descartara al construir el modelo seguiría dos veces entre los de su factor:
        // en su CR, su AVE y su HTMT)
        assert.ok(R.validez && comoTexto(R.validez) === comoTexto(otro.validez), `«${que}»: la misma validez convergente y discriminante`);
    }
});

test('(2027.01.13, revisión) un modelo sin identificar (un factor de segundo orden de dos factores; un factor de dos indicadores que no se relaciona con nada) lo dice, con ML y con WLSMV; uno identificado, no', () => {
    AnalizadorEstadistico.cargarDatos(afe.cols[0].map((_, i) => Object.fromEntries(nombres.map((nm, j) => [nm, afe.cols[j][i]]))));   // (otras pruebas cargan otros)
    const noIdentificado = (/** @type {any} */ R) => R.avisos.some((/** @type {string} */ a) => /no parece identificado/.test(a));
    for (const sx of ['F1 =~ X1 + X2 + X3 + X4\nF2 =~ X5 + X6 + X7 + X8\nG =~ F1 + F2', 'F1 =~ X1 + X2\nX12 ~ X11']) {
        const R = SEM.ajustar(sx, null, 'x');
        assert.ok(!R.error && noIdentificado(R), `«${sx.replace(/\n/g, ' ; ')}»: ${JSON.stringify(R.avisos)}`);
    }
    for (const sx of [MODELO, MODELO + '\nG =~ F1 + F2 + F3', 'X12 ~ X1 + X2 + X3\nX11 ~ X12', 'F1 =~ X1 + X2\nF2 =~ X3 + X4'])
        assert.ok(!noIdentificado(SEM.ajustar(sx, null, 'x')), `«${sx.replace(/\n/g, ' ; ')}», identificado`);
    let s = 2027 >>> 0;
    const u = () => { s = (s + 0x6D2B79F5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
    const nrm = () => Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u());
    const cat = (/** @type {number} */ z) => (z < -1.2 ? 1 : z < -0.4 ? 2 : z < 0.4 ? 3 : z < 1.2 ? 4 : 5);
    AnalizadorEstadistico.cargarDatos(Array.from({ length: 400 }, () => { const f = nrm(), g = 0.5 * f + 0.87 * nrm(), it = (/** @type {number} */ x) => cat(0.75 * x + 0.66 * nrm()); return { a: it(f), b: it(f), c: it(f), d: it(g), e: it(g), f: it(g) }; }));
    // (con WLSMV, si Δᵀ·W·Δ no llega a invertirse, ya era un error que lo decía; si se invierte por poco, el aviso)
    const W = SEM.ajustar('F1 =~ a + b + c\nF2 =~ d + e + f\nG =~ F1 + F2', null, 'x', { estimador: 'WLSMV' });
    assert.ok(W.error ? /no está identificado/.test(W.error) : noIdentificado(W), `WLSMV, segundo orden de dos factores: ${W.error || JSON.stringify(W.avisos)}`);
    assert.ok(!noIdentificado(SEM.ajustar('F1 =~ a + b + c\nF2 =~ d + e + f', null, 'x', { estimador: 'WLSMV' })), 'WLSMV, dos factores: identificado');
    // un factor de dos ítems casi sin relación con el otro (r = 0,02 en la población): con estos datos, su solución se va al borde
    // (errores estándar de 10⁸ con WLSMV y de 10⁶ con ML) y Δᵀ·W·Δ (la información, con ML) se invierte por poco: el aviso, con
    // los dos
    s = 99 >>> 0;
    const filas = (/** @type {number} */ rho) => Array.from({ length: 500 }, () => { const f = nrm(), g = rho * f + Math.sqrt(1 - rho * rho) * nrm(), it = (/** @type {number} */ x) => cat(0.75 * x + 0.66 * nrm()); return { a: it(f), b: it(f), c: it(g), d: it(g), e: it(g), f: it(g) }; });
    filas(0);
    AnalizadorEstadistico.cargarDatos(filas(0.02));
    for (const estimador of ['WLSMV', 'ML']) {
        const R = SEM.ajustar('F1 =~ a + b\nF2 =~ c + d + e + f', null, 'x', { estimador });
        assert.ok(!R.error && noIdentificado(R), `${estimador}, un factor de dos ítems sin relación con el otro: ${R.error || JSON.stringify(R.avisos)}`);
    }
});

test('(2027.01.14, revisión) el aviso de identificación, con su causa: dos predictores casi iguales (un total y su media con dos decimales) lo dicen, sin hablar de factores; uno que es casi una combinación lineal de otros, con su R²; un segundo orden de dos factores, de factores; unas rutas recíprocas sin variables que las identifiquen, de rutas; y una información que no se calcula cuenta como singular', async () => {
    const { inferenciaInformacion } = await import('../../src/analizador/psicometria/ram.js');
    // el total de seis ítems y su media guardada con dos decimales: r = 0,99999… (hasta la 2027.01.13, el aviso decía «un factor
    // de solo dos indicadores… o un factor de segundo orden» en un modelo sin latentes)
    AnalizadorEstadistico.cargarDatos(afe.cols[0].map((_, i) => {
        const fila = Object.fromEntries(nombres.map((nm, j) => [nm, afe.cols[j][i]]));
        const T = [0, 1, 2, 3, 4, 5].reduce((s, j) => s + afe.cols[j][i], 0);
        return { ...fila, T, M: Number((T / 6).toFixed(2)), M3: Number(((afe.cols[0][i] + afe.cols[1][i] + afe.cols[2][i]) / 3).toFixed(2)) };
    }));
    const aviso = (/** @type {any} */ R) => R.avisos.find((/** @type {string} */ a) => /no parece identificado/.test(a)) || '';
    const colineal = SEM.ajustar('X12 ~ T + M + X11', null, 'x');
    assert.match(aviso(colineal), /«T» y «M» están casi perfectamente correlacionadas \(r = 1\.0000\)/, JSON.stringify(colineal.avisos));
    assert.doesNotMatch(aviso(colineal), /factor/, 'sin latentes, no habla de factores');
    assert.equal(aviso(SEM.ajustar('X12 ~ T + X11', null, 'x')), '', 'con solo uno de los dos, identificado');
    // la media de tres ítems (con dos decimales) junto a los tres: ninguna pareja casi igual, pero ella es casi una combinación
    // lineal de ellos
    const combinacion = SEM.ajustar('X12 ~ M3 + X1 + X2 + X3', null, 'x');
    assert.match(aviso(combinacion), /«M3» es casi una combinación lineal de otras variables del modelo \(R² = 1\.0000 con ellas\)/, JSON.stringify(combinacion.avisos));
    assert.doesNotMatch(aviso(combinacion), /casi perfectamente correlacionadas|factor/);
    assert.equal(aviso(SEM.ajustar('X12 ~ M3 + X1 + X2', null, 'x')), '', 'con dos de los tres, identificado');
    assert.match(aviso(SEM.ajustar('F1 =~ X1 + X2 + X3 + X4\nF2 =~ X5 + X6 + X7 + X8\nG =~ F1 + F2', null, 'x')), /factor de segundo orden con solo dos factores/);
    // sin latentes ni variables casi iguales: dos rutas recíprocas cuyas ecuaciones tienen las mismas exógenas (ninguna las
    // identifica); con una exógena propia en cada una, identificado
    const reciprocas = aviso(SEM.ajustar('X1 ~ X2 + X5 + X6\nX2 ~ X1 + X5 + X6\nX3 ~ X5', null, 'x'));
    assert.match(reciprocas, /en un modelo de rutas, suele deberse a unas rutas recíprocas sin variables que las identifiquen/);
    assert.doesNotMatch(reciprocas, /factor/);
    assert.equal(aviso(SEM.ajustar('X1 ~ X2 + X5\nX2 ~ X1 + X6\nX3 ~ X5', null, 'x')), '', 'cada una con su exógena, identificado');
    // una información que no se puede calcular (con θ = 0, la Σ implicada es nula: no se invierte), singular: sus errores estándar
    // no son fiables (hasta la 2027.01.13 lo decidía aparte el motor, y ninguna prueba lo veía)
    const est = SEM._construir(SEM.parsear('F1 =~ X1 + X2 + X3'), [[1, 0.5, 0.5], [0.5, 1, 0.5], [0.5, 0.5, 1]], ['X1', 'X2', 'X3']);
    assert.deepEqual(inferenciaInformacion(est, est.libres.map(() => 0), 400), { se: null, singular: true });
});

test('(2027.01.13, revisión) el diagrama: con WLSMV, una covarianza entre dos ítems con su correlación (con la varianza residual de cada uno, 1 − su comunalidad; salía «↔»), y nada con «-0.00»', async () => {
    const { SEMUI } = await import('../../src/analizador/sem-ui.js');
    let s = 2027 >>> 0;
    const u = () => { s = (s + 0x6D2B79F5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
    const nrm = () => Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u());
    const cat = (/** @type {number} */ z) => (z < -1.2 ? 1 : z < -0.4 ? 2 : z < 0.4 ? 3 : z < 1.2 ? 4 : 5);
    AnalizadorEstadistico.cargarDatos(Array.from({ length: 400 }, () => { const f = nrm(), g = 0.5 * f + 0.87 * nrm(), e = nrm(), it = (/** @type {number} */ x, k = 0) => cat(0.7 * x + 0.3 * k * e + 0.62 * nrm()); return { a: it(f, 1), b: it(f, 1), c: it(f), d: it(g), e: it(g), f: it(g) }; }));
    const R = SEM.ajustar('F1 =~ a + b + c\nF2 =~ d + e + f\na ~~ b', null, 'x', { estimador: 'WLSMV' });
    assert.ok(!R.error, R.error);
    const valor = (/** @type {string} */ n) => R.parametros.find((/** @type {any} */ p) => p.nombre === n).estimado;
    // las varianzas residuales de a y b (en la escala de y*, de varianza 1): 1 − λ²·var(F1), con λ = 1 la de a (el marcador)
    const thetaA = 1 - valor('var (F1)'), thetaB = 1 - valor('F1 =~ b') ** 2 * valor('var (F1)'), r = valor('a ~~ b') / Math.sqrt(thetaA * thetaB);
    const svg = SEMUI.diagramaSVG(R);
    assert.ok(Math.abs(r) > 0.05 && svg.includes(`>${r.toFixed(2)}</text>`) && !svg.includes('>↔</text>'), `a ~~ b: ${r.toFixed(2)} en el diagrama`);
    // un coeficiente y una correlación que redondean a cero, sin signo
    const casiCero = { sintaxis: 'y ~ x1 + x2', estimador: 'ML', latentes: [], nombresObs: ['y', 'x1', 'x2'], desviaciones: { y: 1, x1: 1, x2: 1 },
        parametros: [['y ~ x1', 0.5], ['y ~ x2', -0.0004], ['var (x1)', 1], ['var (x2)', 1], ['x1 ~~ x2', -0.0013], ['var residual (y)', 0.75]].map(([nombre, estimado]) => ({ nombre, estimado, tipo: /~~|var/.test(String(nombre)) ? 'var/cov' : 'coeficiente' })) };
    const svg0 = SEMUI.diagramaSVG(casiCero);
    assert.ok(!svg0.includes('-0.00') && (svg0.match(/>0\.00<\/text>/g) || []).length === 2, 'sin «-0.00»: «0.00» en y ~ x2 y en x1 ~~ x2');
});
