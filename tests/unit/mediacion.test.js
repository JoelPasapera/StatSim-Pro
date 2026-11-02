// @ts-check
// Pruebas de la mediación y la moderación (analizador/relaciones/mediacion.js, 2027.01.17) contra el oráculo
// mediacion_oraculo.py: las ecuaciones de los modelos 1, 4, 6, 7 y 14 (numpy.linalg.lstsq), los efectos condicionales de la
// moderación con su error típico, la región de Johnson-Neyman (buscada por rejilla y brentq, no por la fórmula del programa),
// la ΔR² de la interacción, los indirectos, la z de Sobel y el bootstrap percentil con el mismo generador (sfc32): las
// mismas remuestras dan los mismos intervalos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { analizarProceso, estimarProceso, caminosEnSerie, valoresDeW, MODELOS } from '../../src/analizador/relaciones/mediacion.js';

const CASOS = JSON.parse(fs.readFileSync(new URL('../oracle/mediacion_fixture.json', import.meta.url), 'utf8'));
/** @param {number} x @param {number} ref @param {number} rel @param {string} que */
const cerca = (x, ref, rel, que) => assert.ok(Math.abs(x - ref) <= rel * Math.max(Math.abs(ref), 1e-12), `${que}: ${x} frente a ${ref} (oráculo)`);

test('las ecuaciones de cada modelo: coeficientes, errores típicos, p y R², iguales a lstsq', () => {
    for (const c of CASOS) {
        const r = estimarProceso(c.pedido);
        assert.equal(r.ecuaciones.length, c.ecuaciones.length, `modelo ${c.pedido.modelo}`);
        r.ecuaciones.forEach((/** @type {any} */ e, /** @type {number} */ i) => {
            const o = c.ecuaciones[i];
            assert.equal(e.dependiente, o.dependiente);
            e.beta.forEach((/** @type {number} */ b, /** @type {number} */ j) => cerca(b, o.beta[j], 1e-10, `b${j} ${o.dependiente} (modelo ${c.pedido.modelo})`));
            e.ee.forEach((/** @type {number} */ s, /** @type {number} */ j) => cerca(s, o.ee[j], 1e-10, `ee${j} ${o.dependiente}`));
            e.pValores.forEach((/** @type {number} */ p, /** @type {number} */ j) => cerca(p, o.p[j], 1e-8, `p${j} ${o.dependiente}`));
            cerca(e.r2, o.r2, 1e-11, `R² ${o.dependiente}`);
        });
        r.valoresW.forEach((/** @type {number} */ w, /** @type {number} */ i) => cerca(w, c.valoresW[i], 1e-12, 'valor de W'));
        for (const [k, v] of Object.entries(c.puntuales)) cerca(r.puntuales[k], /** @type {number} */ (v), 1e-10, `${k} (modelo ${c.pedido.modelo})`);
    }
});

test('moderación: efectos condicionales con su error típico, Johnson-Neyman y ΔR², con y sin centrar (el efecto condicional no cambia)', () => {
    const [cent, sinCentrar] = CASOS.filter((/** @type {any} */ c) => c.pedido.modelo === 1);
    for (const c of [cent, sinCentrar]) {
        const r = estimarProceso(c.pedido);
        r.condicionales.forEach((/** @type {any} */ x, /** @type {number} */ i) => {
            const o = c.condicionales[i];
            cerca(x.w, o.w, 1e-12, 'w'); cerca(x.efecto, o.efecto, 1e-10, 'θ(w)'); cerca(x.ee, o.ee, 1e-10, 'ee'); cerca(x.pValor, o.p, 1e-8, 'p');
        });
        assert.equal(r.johnsonNeyman.puntos.length, c.johnsonNeyman.length, 'los mismos puntos de Johnson-Neyman');
        r.johnsonNeyman.puntos.forEach((/** @type {number} */ w, /** @type {number} */ i) => cerca(w, c.johnsonNeyman[i], 1e-8, 'punto de Johnson-Neyman'));
        cerca(r.interaccion.deltaR2, c.deltaR2, 1e-10, 'ΔR²');
    }
    // centrar cambia b₁ (el efecto de X en la media de W) pero no los efectos condicionales en los mismos valores de W
    const a = estimarProceso(cent.pedido), b = estimarProceso(sinCentrar.pedido);
    a.condicionales.forEach((/** @type {any} */ x, /** @type {number} */ i) => cerca(x.efecto, b.condicionales[i].efecto, 1e-10, 'mismo efecto condicional'));
});

test('el bootstrap: las mismas remuestras (sfc32) dan los mismos intervalos percentil y errores típicos', () => {
    for (const c of CASOS.filter((/** @type {any} */ c) => c.bootstrap)) {
        const r = analizarProceso(c.pedido, { B: c.B, semilla: c.semilla });
        for (const [k, o] of Object.entries(c.bootstrap)) {
            const e = r.bootstrap.efectos[k];
            assert.ok(e, `${k} (modelo ${c.pedido.modelo})`);
            cerca(e.inferior, /** @type {any} */ (o).inferior, 1e-9, `IC inf ${k} (modelo ${c.pedido.modelo})`);
            cerca(e.superior, /** @type {any} */ (o).superior, 1e-9, `IC sup ${k} (modelo ${c.pedido.modelo})`);
            cerca(e.ee, /** @type {any} */ (o).ee, 1e-9, `EE ${k}`);
        }
        assert.equal(r.bootstrap.invalidas, 0);
    }
});

test('la z de Sobel del modelo 4, los caminos en serie y los valores de W', () => {
    for (const c of CASOS.filter((/** @type {any} */ c) => c.sobel)) {
        const r = estimarProceso(c.pedido);
        r.sobel.forEach((/** @type {any} */ s, /** @type {number} */ j) => { cerca(s.z, c.sobel[j].z, 1e-10, 'z de Sobel'); cerca(s.pValor, c.sobel[j].p, 1e-9, 'p de Sobel'); });
    }
    assert.deepEqual(caminosEnSerie(2), [[0], [1], [0, 1]]);
    assert.deepEqual(caminosEnSerie(3), [[0], [1], [2], [0, 1], [0, 2], [1, 2], [0, 1, 2]]);
    assert.deepEqual(valoresDeW(Float64Array.from([0, 1, 1, 0, 1])), [0, 1], 'dicotómica: sus dos valores');
    assert.equal(valoresDeW(Float64Array.from({ length: 101 }, (_, i) => i)).join(','), '16,50,84', 'continua: los percentiles 16, 50 y 84');
    assert.deepEqual(Object.keys(MODELOS), ['1', '4', '6', '7', '14']);
});

test('(2027.01.20) la redacción juzga cada indirecto por su intervalo y escribe «predijo» solo si el camino es significativo', async () => {
    const { redactarMediacion, referenciasMediacion } = await import('../../src/analizador/relaciones/mediacion-redaccion.js');
    const { sfc32 } = await import('../../src/core/random/sfc32.js');
    const { generadorNormales } = await import('../../src/core/random/normal.js');
    const base = (/** @type {number} */ semilla, /** @type {number} */ n, /** @type {number[]} */ [a1, a2, b1, b2, cp]) => {
        const g = sfc32(semilla), z = generadorNormales(g.siguiente), x = [], m1 = [], m2 = [], y = [];
        for (let i = 0; i < n; i++) { const X = z(), M1 = a1 * X + z(), M2 = a2 * X + z(); x.push(X); m1.push(M1); m2.push(M2); y.push(cp * X + b1 * M1 + b2 * M2 + z()); }
        return { x, m1, m2, y };
    };
    const ctx = (/** @type {string[]} */ m) => ({ x: 'Estrés', y: 'Ira', m, w: null, covariables: [], excluidos: 0, alfa: 0.05 });
    const ex = (/** @type {any} */ e) => e.inferior > 0 || e.superior < 0;
    // la semilla 3 de la revisión: ningún indirecto específico excluye el 0 y el total sí
    const d = base(3, 150, [0.22, 0.22, 0.22, 0.22, 0]);
    const R = analizarProceso({ modelo: 4, x: d.x, y: d.y, m: [d.m1, d.m2], w: null, covariables: [] }, { B: 400, semilla: 7 });
    const B = R.bootstrap.efectos;
    assert.ok(!ex(B.ind_M1) && !ex(B.ind_M2) && ex(B.ind_total), 'el caso de la revisión');
    const s = redactarMediacion(R, ctx(['Rumiación', 'Insomnio']));
    assert.match(s, /Los dos intervalos incluyen el 0: ningún mediador, por separado, transmite el efecto de Estrés\./);
    assert.match(s, /El indirecto total fue ab = 0\.076, IC 95 % \[0\.022, 0\.135\], que no incluye el 0: en conjunto, los mediadores transmiten/);
    assert.doesNotMatch(s, /\[0\.022, 0\.135\], que incluye el 0/, 'antes: «IC [0.022, 0.135], que incluye el 0»');
    assert.match(s, /IC 95 % \[−0\.000\d+, 0\.092\]/, 'el límite que redondea a cero, con sus cifras');
    assert.match(s, /controlando Estrés, Rumiación predijo a Ira \(b1 = 0\.171, p = \.044\), e Insomnio no predijo significativamente a Ira \(b2 = 0\.140, p = \.073\)/);
    assert.match(s, /Siguiendo a Zhao et al\. \(2010\)/); assert.match(s, /Preacher y Hayes, 2008/);
    // a no significativa: «no predijo significativamente»
    const d1 = base(4, 120, [0.05, 0, 0.5, 0, 0.3]);
    const R1 = analizarProceso({ modelo: 4, x: d1.x, y: d1.y, m: [d1.m1], w: null, covariables: [] }, { B: 500 });
    const s1 = redactarMediacion(R1, ctx(['Rumiación']));
    assert.equal(R1.ecuaciones[0].pValores[1] < 0.05, false);
    assert.match(s1, /Estrés no predijo significativamente a Rumiación \(a = /);
    assert.doesNotMatch(s1, /Estrés predijo a Rumiación/);
    // las referencias, solo las citadas
    const refs = referenciasMediacion(R).join(' ');
    assert.match(refs, /Preacher/); assert.match(refs, /Zhao/); assert.doesNotMatch(refs, /Aiken|Johnson, P\. O\./);
});
