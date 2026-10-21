// @ts-check
// tests/unit/correlacion-inferencia.test.js — la inferencia de la correlación del núcleo único (core/stats/correlacion.js,
// 2026.12.17) y de TODAS las vistas que la usan, contra tests/oracle/inferencia_fixture.json (correlacionInferencia, que
// escribe inferencia_oraculo.py): p bilateral y unilateral de scipy.stats, IC de r de scipy.stats y de ρ con el error típico
// de Bonett y Wright (2000), potencia de Cohen (1988; la de pwr.r.test) contrastada con la exacta, Holm y la matriz por
// pares. Hasta la 2026.12.16 había siete copias con convenciones distintas, y ni el IC ni la potencia de la vista principal
// tenían prueba.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pCorrelacion, icCorrelacion, potenciaCorrelacion, paresCompletos, correlacion, spearman } from '../../src/core/stats/correlacion.js';
import { ajustarHolm } from '../../src/core/stats/multiples.js';

const { datos: D, esperado: E } = JSON.parse(fs.readFileSync(new URL('../oracle/inferencia_fixture.json', import.meta.url), 'utf8'));
const C = E.correlacionInferencia;
C.casos.forEach((/** @type {any} */ c, /** @type {number} */ k) => Object.assign(c, D.correlacion[k]));   // los datos de cada caso, del bloque 'datos'
/** @param {number} x @param {number} ref @param {number} tol @param {string} que */
const cerca = (x, ref, tol, que) => assert.ok(Math.abs(x - ref) <= tol, `${que}: ${x} frente a ${ref} (tolerancia ${tol})`);
/** @param {number} ref */
const tolP = ref => 1e-14 + 1e-9 * ref;

test('núcleo: p bilateral y unilateral, IC de r y de ρ y potencia, iguales a las referencias independientes', () => {
    for (const c of C.casos) {
        const n = c.n, q = `n = ${n}`, r = correlacion(c.x, c.y), rho = spearman(c.x, c.y);
        cerca(r, c.r, 1e-12, `${q}: r`); cerca(rho, c.rho, 1e-12, `${q}: ρ`);
        cerca(pCorrelacion(r, n), c.pBilateral, tolP(c.pBilateral), `${q}: p bilateral de r (scipy.stats.pearsonr)`);
        cerca(pCorrelacion(r, n, { bilateral: false }), c.pUnilateral, tolP(c.pUnilateral), `${q}: p unilateral de r (alternative en el signo observado)`);
        cerca(pCorrelacion(rho, n), c.pRho, tolP(c.pRho), `${q}: p bilateral de ρ (scipy.stats.spearmanr)`);
        cerca(pCorrelacion(rho, n, { bilateral: false }), c.pRhoUnilateral, tolP(c.pRhoUnilateral), `${q}: p unilateral de ρ`);
        const ic = /** @type {any} */ (icCorrelacion(r, n)), icS = /** @type {any} */ (icCorrelacion(rho, n, { spearman: true }));
        cerca(ic.inferior, c.icR[0], 1e-12, `${q}: IC de r, inferior (scipy.stats)`); cerca(ic.superior, c.icR[1], 1e-12, `${q}: IC de r, superior`);
        cerca(icS.inferior, c.icRho[0], 1e-12, `${q}: IC de ρ, inferior (Bonett y Wright)`); cerca(icS.superior, c.icRho[1], 1e-12, `${q}: IC de ρ, superior`);
        assert.equal(ic.nivel, 0.95);
        cerca(potenciaCorrelacion(r, n), c.potenciaR[0], 1e-10, `${q}: potencia bilateral`);
        cerca(potenciaCorrelacion(r, n, { bilateral: false }), c.potenciaR[1], 1e-10, `${q}: potencia unilateral`);
    }
    for (const [r, n, alfa, bilateral, pot, exacta] of C.potencias) {
        const p = potenciaCorrelacion(r, n, { alfa, bilateral }), q = `r = ${r}, n = ${n}, α = ${alfa}, ${bilateral ? 'bilateral' : 'unilateral'}`;
        cerca(p, pot, 1e-10, `${q}: potencia de Cohen (pwr.r.test)`);
        cerca(p, exacta, 0.005, `${q}: frente a la potencia exacta de la prueba t`);
    }
});

test('núcleo: casos límite y propiedades (simetría, unilateral = mitad, la unilateral no suma la cola contraria)', () => {
    assert.equal(pCorrelacion(0.5, 2), 1, 'n ≤ 2: sin grados de libertad');
    assert.equal(pCorrelacion(1, 10), 0); assert.equal(pCorrelacion(-1, 10), 0); assert.ok(Number.isNaN(pCorrelacion(NaN, 10)));
    assert.equal(icCorrelacion(0.5, 3), null); assert.equal(icCorrelacion(1, 30), null); assert.equal(icCorrelacion(NaN, 30), null);
    assert.ok(Number.isNaN(potenciaCorrelacion(1, 30))); assert.ok(Number.isNaN(potenciaCorrelacion(0.3, 3))); assert.ok(Number.isNaN(potenciaCorrelacion(NaN, 30)));
    for (const [r, n] of [[0.27, 40], [0.6, 15], [0.04, 500]]) {
        assert.equal(pCorrelacion(-r, n), pCorrelacion(r, n), 'el signo no cambia el p');
        cerca(pCorrelacion(r, n, { bilateral: false }), pCorrelacion(r, n) / 2, 1e-17, 'unilateral = mitad del bilateral (SPSS)');
        const a = /** @type {any} */ (icCorrelacion(r, n)), b = /** @type {any} */ (icCorrelacion(-r, n));
        cerca(b.inferior, -a.superior, 1e-15, 'el IC se refleja'); cerca(b.superior, -a.inferior, 1e-15, 'el IC se refleja');
        assert.equal(potenciaCorrelacion(-r, n), potenciaCorrelacion(r, n), 'el signo no cambia la potencia');
        assert.ok(potenciaCorrelacion(r, n, { bilateral: false }) > potenciaCorrelacion(r, n), 'la unilateral, con el mismo α, es más potente');
    }
    // con un efecto nulo, la potencia es el α (bilateral: las dos colas; unilateral: una): la cola contraria no se suma
    cerca(potenciaCorrelacion(0, 80, { alfa: 0.05, bilateral: false }), 0.05, 2e-3, 'potencia unilateral con r = 0');
    cerca(potenciaCorrelacion(0, 80, { alfa: 0.05 }), 0.05, 2e-3, 'potencia bilateral con r = 0');
    // el α se respeta fuera de .10, .05 y .01 (la pantalla usaba entonces la z de .05)
    assert.ok(potenciaCorrelacion(0.45, 40, { alfa: 0.025 }) < potenciaCorrelacion(0.45, 40, { alfa: 0.05 }));
    const { x, y } = paresCompletos([1, NaN, 3, 4, NaN, 6], [2, 3, NaN, 5, 6, 7]);
    assert.deepEqual([...x], [1, 4, 6]); assert.deepEqual([...y], [2, 5, 7]);
});

test('Holm del núcleo: igual a la referencia; un p no finito cuenta como 1 y los empates reciben el mismo ajustado', () => {
    const ps = C.holm.p.map((/** @type {number | null} */ p) => (p === null ? NaN : p));
    const aj = ajustarHolm(ps);
    aj.forEach((v, k) => cerca(v, C.holm.ajustados[k], 1e-15, `Holm ${k}`));
    assert.equal(aj[4], 1, 'el p no finito'); assert.equal(aj[1], aj[5], 'empate (0,04 y 0,04)');
    assert.deepEqual(ajustarHolm([]), []);
});

test('todas las vistas, una sola convención: vista principal (p, IC y potencia con su lateralidad), mapa, diagnóstico y matriz', async () => {
    const { AnalizadorEstadistico: A } = await import('../../src/analizador/estadistica.js');
    const SC = /** @type {any} */ ((await import('../../src/analizador/graficas.js')).ScientificCharts.prototype);
    const { pDeCorrelacion, icFisher } = await import('../../src/analizador/relaciones/diagnostico-forma.js');
    const { RegresionMultiple: RM } = await import('../../src/analizador/regresion.js');
    const metodos = new Set();
    for (const c of C.casos) {
        const q = `n = ${c.n}`;
        A.cargarDatos(c.x.map((/** @type {number} */ x, /** @type {number} */ i) => ({ x, y: c.y[i] })));
        for (const tipo of ['bilateral', 'unilateral']) {
            const R = A.calcularCorrelacion('x', 'y', tipo), esS = R.tipoCorrelacion.includes('Spearman'), k = tipo === 'bilateral' ? 0 : 1;
            metodos.add(R.tipoCorrelacion);
            // (2026.12.30) el IC con el nivel de la prueba: el del 95 % (el del fixture) con la bilateral y el del 90 % (1 − 2α) con
            // la unilateral, el que excluye el cero cuando la prueba unilateral rechaza; el del 90 %, con la z de Fisher y el error
            // típico de Pearson o el de Bonett y Wright (2000) para ρ, las mismas fórmulas que reproducen el del 95 % del fixture
            const z90 = 1.6448536269514722, coef = esS ? c.rho : c.r, se = esS ? Math.sqrt((1 + c.rho * c.rho / 2) / (c.n - 3)) : 1 / Math.sqrt(c.n - 3);
            const ic90 = [Math.tanh(Math.atanh(coef) - z90 * se), Math.tanh(Math.atanh(coef) + z90 * se)];
            const pRef = esS ? [c.pRho, c.pRhoUnilateral][k] : [c.pBilateral, c.pUnilateral][k], icRef = k === 0 ? (esS ? c.icRho : c.icR) : ic90, potRef = (esS ? c.potenciaRho : c.potenciaR)[k];
            assert.equal(R.intervaloConfianza.nivel, k === 0 ? 0.95 : 0.9, `${q}: el nivel del IC (${tipo})`);
            cerca(R.pValor, pRef, tolP(pRef), `${q}, vista principal (${R.tipoCorrelacion}, ${tipo}): p`);
            cerca(R.intervaloConfianza.inferior, icRef[0], 1e-12, `${q}, vista principal: IC inferior`); cerca(R.intervaloConfianza.superior, icRef[1], 1e-12, `${q}, vista principal: IC superior`);
            cerca(R.poder, potRef, 1e-10, `${q}, vista principal (${tipo}): potencia con la lateralidad del p (antes, siempre bilateral)`);
            const H = A.pruebaHipotesis(R); assert.equal(H.decision, R.pValor < H.alpha ? 'rechazar' : 'no_rechazar');
        }
        cerca(SC._pCorrelacion.call(SC, c.r, c.n), c.pBilateral, tolP(c.pBilateral), `${q}, mapa: p`);
        const icM = SC._icFisher.call(SC, c.rho, c.n, true), icMr = SC._icFisher.call(SC, c.r, c.n);
        cerca(icM[0], c.icRho[0], 1e-12, `${q}, mapa: IC de ρ (antes, el de Pearson y z = 1,96)`); cerca(icM[1], c.icRho[1], 1e-12, `${q}, mapa: IC de ρ`);
        cerca(icMr[0], c.icR[0], 1e-12, `${q}, mapa: IC de r`); cerca(icMr[1], c.icR[1], 1e-12, `${q}, mapa: IC de r`);
        cerca(pDeCorrelacion(c.rho, c.n), c.pRho, tolP(c.pRho), `${q}, diagnóstico de forma: p de ρ`);
        icFisher(c.rho, c.n, true).forEach((v, j) => cerca(v, c.icRho[j], 1e-12, `${q}, diagnóstico de forma: IC de ρ (antes, Fieller)`));
        const M = RM.matrizCorrelaciones(['x', 'y'], ['x', 'y']), par = M.pares[0];
        cerca(par.pValor, par.metodo === 'Pearson' ? c.pBilateral : c.pRho, tolP(par.metodo === 'Pearson' ? c.pBilateral : c.pRho), `${q}, matriz de correlaciones: p`);
    }
    assert.deepEqual([...metodos].sort(), ['Pearson', 'Spearman (Rho)'], 'los casos recorren las dos ramas de la vista principal');
});

test('el tooltip del mapa de correlaciones: p e IC con el coeficiente exacto, el n de la celda y el error típico de su método', async () => {
    const SC = /** @type {any} */ ((await import('../../src/analizador/graficas.js')).ScientificCharts.prototype);
    const exacta = 0.3349, opciones = { normalesPorVariable: [false, true], coeficientesExactos: [[1, exacta], [exacta, 1]], nPorPar: [[30, 28], [28, 31]] };
    const html = SC._htmlTooltipCorrelacion.call(SC, { i: 0, j: 1, value: 0.33 }, ['A', 'B'], opciones);
    const ic = /** @type {any} */ (icCorrelacion(exacta, 28, { spearman: true })), f2 = (/** @type {number} */ v) => (v < 0 ? '-' : '') + Math.abs(v).toFixed(2).replace(/^0/, '');
    assert.ok(html.includes("Spearman's ρ = .33"), html);
    assert.ok(html.includes(`p ≈ ${pCorrelacion(exacta, 28).toFixed(3).replace(/^0/, '')}`), `p del coeficiente exacto con n = 28: ${html}`);
    assert.ok(html.includes('N = 28') && html.includes(`IC 95% [${f2(ic.inferior)}, ${f2(ic.superior)}]`), html);
    assert.ok(SC._htmlTooltipCorrelacion.call(SC, { i: 1, j: 1, value: 1 }, ['A', 'B'], opciones).includes('consigo misma'));
    assert.ok(!SC._htmlTooltipCorrelacion.call(SC, { i: 0, j: 1, value: 0.33 }, ['A', 'B'], {}).includes('N ='), 'sin el n de la celda, ni N ni p');
});

test('matriz por pares (mapa de los gráficos y Word): con perdidos, cada celda usa los casos que tienen las dos variables', async () => {
    const { matrizPorPares, correlacionPearsonSimple } = await import('../../src/analizador/correlaciones-por-pares.js');
    const { AnalizadorEstadistico: A } = await import('../../src/analizador/estadistica.js');
    const c = C.casos[4];   // n = 25, ρ ≈ .9: desalinear los pares destruye la correlación
    const perdidosX = new Set([3, 7]), perdidosY = new Set([5, 11]);
    // perdidos como llegan al Analizador: '' (celda vacía de un CSV), NaN (Simulador), null y texto
    const filas = c.x.map((/** @type {number} */ x, /** @type {number} */ i) => ({ a: i === 3 ? '' : i === 7 ? NaN : x, b: i === 5 ? null : i === 11 ? 'NA' : c.y[i] }));
    const M = matrizPorPares(filas, ['a', 'b']);
    const sigue = (/** @type {number} */ i) => !perdidosX.has(i) && !perdidosY.has(i);
    const xs = c.x.filter((/** @type {number} */ _, /** @type {number} */ i) => sigue(i)), ys = c.y.filter((/** @type {number} */ _, /** @type {number} */ i) => sigue(i));
    assert.equal(M.n[0][1], 21, 'pares completos'); assert.deepEqual([M.n[0][0], M.n[1][1]], [23, 23], 'valores de cada variable');
    cerca(M.r[0][1], M.pearson[0][1] ? correlacion(xs, ys) : spearman(xs, ys), 1e-15, 'coeficiente por pares');
    A.cargarDatos(filas);
    const R = A.calcularCorrelacion('a', 'b');
    assert.equal(R.n, 21, 'la vista principal usa los mismos pares');
    if (M.pearson[0][1] === (R.tipoCorrelacion === 'Pearson')) cerca(M.r[0][1], R.coeficiente, 1e-15, 'misma celda que la vista principal');
    // la forma de antes (cada columna filtrada por separado, +valor y emparejadas por posición) daba otra cosa
    const antesX = filas.map(f => +f.a).filter(Number.isFinite), antesY = filas.map(f => +(/** @type {any} */ (f.b))).filter(Number.isFinite);
    assert.ok(Math.abs(correlacionPearsonSimple(antesX, antesY) - M.r[0][1]) > 0.1, `antes: ${correlacionPearsonSimple(antesX, antesY)} frente a ${M.r[0][1]}`);
});
