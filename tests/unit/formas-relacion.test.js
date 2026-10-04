// tests/unit/formas-relacion.test.js — cada forma del atlas es matemáticamente lo que dice su nombre (malla de 200 001
// puntos sobre u ∈ [0, 1]): monotonía, curvatura, giros e inflexiones en su sitio, salto del escalón, meseta, y la cúbica
// es un polinomio de tercer grado (la ecuación del atlas). Además, κ, la ventana y el diagnóstico de recorte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeneradorDatos } from '../../src/simulador/dominio/generador.js';
import { FORMAS_RELACION, formaPorId, aplicarForma, ventanaForma, kappaForma, recorteEsperado, etaMaximaSinRecorte } from '../../src/simulador/dominio/formas-relacion.js';

const N = 200000, malla = id => Array.from({ length: N + 1 }, (_, k) => formaPorId(id).f(k / N));
function propiedades(v) {
    let sube = 0, baja = 0, conv = 0, conc = 0, prev = 0; const giros = [], saltos = [];
    for (let k = 0; k < N; k++) {
        const d = v[k + 1] - v[k];
        if (d > 1e-15) sube++; else if (d < -1e-15) baja++;
        if (Math.abs(d) > 0.1) saltos.push(k / N);
        const s = Math.sign(d); if (s && prev && s !== prev) giros.push([s < 0 ? 'máx' : 'mín', k / N]); if (s) prev = s;
        if (k > 0) { const c = v[k + 1] - 2 * v[k] + v[k - 1]; if (c > 1e-13) conv++; else if (c < -1e-13) conc++; }
    }
    return { sube, baja, conv, conc, giros, saltos };
}
const cerca = (a, b, t, q) => assert.ok(Math.abs(a - b) <= t, `${q}: ${a} vs ${b}`);

test('monotónicas: crecientes o decrecientes en todo [0, 1], con la curvatura de su familia', () => {
    const esperado = { logaritmica: ['+', 'cóncava'], potencia: ['+', 'cóncava'], asintotica: ['+', 'cóncava'], 'hiperbolica-sat': ['+', 'cóncava'], exponencial: ['+', 'convexa'], 'potencia-exp': ['+', 'convexa'], decaimiento: ['−', 'convexa'], 'potencia-dec': ['−', 'convexa'], 'hiperbolica-dec': ['−', 'convexa'] };
    for (const [id, [sentido, curva]] of Object.entries(esperado)) {
        const p = propiedades(malla(id));
        // nunca cambia de sentido; «sube» (o «baja») en prácticamente toda la malla: junto a 0, u^3.2 es tan plana que sus
        // diferencias caen bajo el umbral numérico de 10⁻¹⁵
        assert.ok(sentido === '+' ? !p.baja && p.sube > 0.999 * N : !p.sube && p.baja > 0.999 * N, `${id}: monótona ${sentido}`);
        assert.ok(curva === 'convexa' ? p.conv > 0 && !p.conc : p.conc > 0 && !p.conv, `${id}: ${curva}`);
    }
});

test('sigmoide (inflexión en ½), escalón (salto en ½), meseta (recta hasta 0.45 y plana después)', () => {
    const s = malla('sigmoide'), p = propiedades(s);
    assert.ok(p.sube === N && !p.baja);
    let k0 = 1; for (let k = 1; k < N; k++) { const c = s[k + 1] - 2 * s[k] + s[k - 1]; if (c < 0) { k0 = k; break; } }
    cerca(k0 / N, 0.5, 1e-4, 'inflexión de la sigmoide');
    const e = propiedades(malla('escalon'));
    assert.deepEqual(e.saltos.map(u => +u.toFixed(4)), [0.5]); assert.equal(e.baja, 0);
    const m = formaPorId('meseta').f;
    for (const u of [0.1, 0.2, 0.3, 0.4]) cerca(m(u) / u, 1 / 0.45, 1e-12, 'pendiente constante antes del quiebre');
    for (const u of [0.45, 0.6, 0.8, 1]) cerca(m(u), 1, 1e-15, 'meseta');
});

test('no monotónicas: giros exactos (U, U invertida, J, cúbica, cíclica); la cúbica es un polinomio de grado 3', () => {
    const giros = id => propiedades(malla(id)).giros.map(([t, u]) => `${t} ${u.toFixed(3)}`);
    assert.deepEqual(giros('u-invertida'), ['máx 0.500']); assert.deepEqual(giros('u'), ['mín 0.500']); assert.deepEqual(giros('j'), ['mín 0.250']);
    assert.deepEqual(giros('cubica'), ['máx 0.250', 'mín 0.750']); assert.deepEqual(giros('ciclica'), ['máx 0.250', 'mín 0.500', 'máx 0.750']);
    // cuarta diferencia finita nula ⇔ polinomio de grado ≤ 3; tercera no nula ⇒ grado exactamente 3
    const f = formaPorId('cubica').f, h = 0.01;
    for (const u of [0.1, 0.37, 0.5, 0.81]) {
        cerca(f(u + 2 * h) - 4 * f(u + h) + 6 * f(u) - 4 * f(u - h) + f(u - 2 * h), 0, 1e-12, 'Δ⁴ de la cúbica');
        assert.ok(Math.abs(f(u + 1.5 * h) - 3 * f(u + 0.5 * h) + 3 * f(u - 0.5 * h) - f(u - 1.5 * h)) > 1e-7, 'Δ³ ≠ 0');
    }
});

test('ventana robusta (mediana ± percentiles 1–99), κ = r(f(X), X) y diagnóstico de recorte con η máxima', () => {
    const x = Array.from({ length: 1001 }, (_, i) => i);   // 0…1000: mediana 500, percentiles 1 y 99 en 10 y 990
    assert.deepEqual(ventanaForma(x), [10, 990]);
    const fx = aplicarForma('u', x);
    assert.equal(fx[500], 0); assert.equal(fx[0], 1); assert.equal(fx[1000], 1);   // vértice en la mediana; fuera de la ventana, recortado
    cerca(kappaForma('u'), 0, 1e-9, 'κ de la U'); cerca(kappaForma('ciclica'), 0, 1e-9, 'κ de la cíclica'); assert.equal(kappaForma('lineal'), 1);
    const g = new GeneradorDatos(), Phi = z => g.normalCDF(z);   // la misma Φ que usa la validación
    const id = z => z, lim = [-3.2, 3.2];
    assert.ok(recorteEsperado('potencia-dec', 0.9, id, ...lim, Phi) > 0.01, 'la potencia decreciente con η = .9 se recorta (más del 1 %)');
    assert.ok(recorteEsperado('potencia-dec', 0.5, id, ...lim, Phi) < 0.01, 'con η = .5 no');
    const eMax = etaMaximaSinRecorte('potencia-dec', id, ...lim, Phi);
    assert.ok(eMax < 0.9 && Math.abs(recorteEsperado('potencia-dec', eMax, id, ...lim, Phi) - 0.01) < 1e-6, `η máxima ${eMax}`);
    assert.equal(etaMaximaSinRecorte('sigmoide', id, ...lim, Phi), 0.97, 'la sigmoide no se recorta nunca');
});

test('revisión 2026.10.26: la ρ esperada reproduce la fórmula de Pearson (1907) en el caso normal lineal y trata bien los empates', async () => {
    const { rhoEsperadaForma, spearman } = await import('../../src/simulador/dominio/formas-relacion.js');
    let a = 7 >>> 0; const u01 = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const nrm = () => Math.sqrt(-2 * Math.log(u01() || 1e-12)) * Math.cos(2 * Math.PI * u01());
    for (const r of [0.3, 0.6, 0.9]) {
        const x = Array.from({ length: 5000 }, nrm), y = Array.from({ length: 5000 }, nrm), e = rhoEsperadaForma(x, x, y, r, { exacto: false, reps: 60 });
        cerca(e.media, (6 / Math.PI) * Math.asin(r / 2), 3 * e.de / Math.sqrt(60) + 0.004, `ρ esperada con r = ${r}`);
    }
    cerca(spearman([1, 2, 2, 3], [1, 3, 2, 4]), 0.9486832980505138, 1e-12, 'ρ con empates');
    const x = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3], y = x.map(v => 2 * v + 1);
    assert.deepEqual(rhoEsperadaForma(x, x, y, 0.5), rhoEsperadaForma(x, x, y, 0.5), 'misma semilla, mismo resultado');
});
