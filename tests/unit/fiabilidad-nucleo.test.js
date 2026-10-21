// @ts-check
// Motor ÚNICO de fiabilidad (core/stats/fiabilidad.js, 2026.12.13): ejes principales de un factor hasta la convergencia.
// Antes, la fiabilidad del Analizador paraba en 50 iteraciones (y su réplica del Simulador en 25) cuando las comunalidades
// cambiaban menos de 1e−6, y en los casos lentos (3 o 4 ítems con cargas desiguales) la ω salía hasta 0,02 por debajo de la
// solución; ninguna prueba lo veía porque en todas los datos convergían deprisa. Este caso real necesita unas 2400
// iteraciones; su solución exacta, con k = 3, es cerrada: λ₁ = √(r₁₂·r₁₃/r₂₃) y análogas (calculada en Python).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ejesPrincipalesUnFactor, omegaDeCargas, omegaCovarianzas, alfaCronbach } from '../../src/core/stats/fiabilidad.js';
import { omegaUnifactorial, coeficientesClasicos } from '../../src/analizador/psicometria/clasica.js';
import { omegaUnFactor } from '../../src/analizador/psicometria/factorial.js';
import { GeneradorDatos } from '../../src/simulador/dominio/generador.js';

const R = [[1.0, 0.5685740273609335, 0.14418356549134612], [0.5685740273609334, 1.0, 0.08720665345926087], [0.14418356549134612, 0.08720665345926087, 0.9999999999999998]];
const VARIANZAS = [1.276933759200111, 1.2874323010692956, 1.3263366199139008];
const OMEGA_EXACTA = 0.6317465332158004, OMEGA_COV_EXACTA = 0.6273053827288806;

test('caso lento (k = 3): el motor converge a la solución exacta; con el tope antiguo, no', () => {
    const ep = ejesPrincipalesUnFactor(R);
    assert.ok(ep.estimable && ep.convergio, 'converge'); assert.ok(ep.iteraciones > 1000, `sigue siendo un caso lento (${ep.iteraciones} iteraciones)`);
    assert.ok(Math.abs(omegaDeCargas(ep.cargas, ep.comunalidades) - OMEGA_EXACTA) < 1e-7, 'ω estandarizada exacta');
    assert.ok(Math.abs(omegaCovarianzas(ep.cargas, VARIANZAS) - OMEGA_COV_EXACTA) < 1e-7, 'ω en covarianzas exacta');
    const corto = ejesPrincipalesUnFactor(R, { maxIter: 50 });
    assert.ok(!corto.convergio && Math.abs(omegaDeCargas(corto.cargas, corto.comunalidades) - OMEGA_EXACTA) > 0.005, 'con 50 iteraciones la ω queda lejos (el error de antes)');
});

test('todos los consumidores dan la misma ω: la fiabilidad del Analizador, el AFE y la ω ordinal', () => {
    const om = omegaUnifactorial(R, 3);
    assert.ok(om.ok && Math.abs(/** @type {number} */ (om.valor) - OMEGA_EXACTA) < 1e-7, `fiabilidad del Analizador (${om.valor})`);
    assert.ok(Math.abs(omegaUnFactor(R).omega - OMEGA_EXACTA) < 1e-7, 'AFE y ω ordinal');
});

test('el Simulador calibra contra la MISMA ω que muestra el Analizador (antes, una réplica que podía diferir en 0,027)', () => {
    const g = new GeneradorDatos();
    let s = 7 >>> 0; const u = () => { s = (s + 0x6D2B79F5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
    const nrm = () => Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u());
    for (const [k, cargas] of [[3, [0.95, 0.55, 0.2]], [4, [0.3, 0.8, 0.25, 0.6]], [6, [0.7, 0.7, 0.6, 0.5, 0.4, 0.3]]]) {
        const cols = Array.from({ length: /** @type {number} */ (k) }, () => /** @type {number[]} */ ([]));
        for (let i = 0; i < 300; i++) { const f = nrm(); /** @type {number[]} */ (cargas).forEach((l, j) => /** @type {number[]} */ (cols[j]).push(Math.max(1, Math.min(5, Math.round(3 + 1.2 * (l * f + Math.sqrt(1 - l * l) * nrm())))))); }
        // el mismo motor, la misma fórmula y (2026.12.25) la misma matriz R, la del núcleo (antes, la del Simulador se formaba
        // con √vᵢ·√vⱼ en vez de √(vᵢ·vⱼ) y difería en el redondeo): ahora, idénticas bit a bit
        const om = coeficientesClasicos(cols), omS = g._indiceObservado(cols, 'omega'), alS = g._indiceObservado(cols, 'alfa');
        assert.equal(omS, om.omega, `k = ${k}: ω de la calibración ${omS} frente a ${om.omega}`);
        assert.equal(alS, om.alfa, `k = ${k}: α de la calibración ${alS} frente a ${om.alfa}`);
    }
});

test('(2026.12.25) un ítem constante en la muestra no aporta a la ω por covarianzas: la misma que sin él (en la matriz, su fila es 0, no NaN)', () => {
    let s = 7;
    const u = () => { s = (s + 0x6D2B79F5) | 0; let x = Math.imul(s ^ (s >>> 15), 1 | s); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
    const n = 120, f = Array.from({ length: n }, () => u() * 2 - 1);
    const item = (/** @type {number} */ l) => f.map(v => Math.round(3 + 1.5 * (l * v + (u() - 0.5))));
    const cols = [item(0.8), item(0.7), item(0.6)];
    const sin = coeficientesClasicos(cols), con = coeficientesClasicos([...cols, new Array(n).fill(4)]);
    assert.ok(sin.omega !== null && sin.omega > 0.7, `ω sin el ítem constante: ${sin.omega}`);
    assert.equal(con.omega, sin.omega, 'el ítem constante tiene carga 0 y no cambia la varianza del total');
    assert.ok(Number.isFinite(/** @type {number} */ (con.alfa)) && Number.isFinite(/** @type {number} */ (con.omegaStd)));
});

test('α de Cronbach: k/(k − 1)·(1 − Σ varianzas / varianza del total)', () => {
    assert.equal(alfaCronbach([1, 1, 1], 6), 0.75);
    assert.ok(Math.abs(alfaCronbach([2.5, 3.1, 1.9, 2.2], 25.3) - (4 / 3) * (1 - 9.7 / 25.3)) < 1e-15);
});

test('caso Heywood: la comunalidad queda topada en 0,999, se marca y la ω es la del punto fijo con el tope (Python)', () => {
    const H = [[1, 0.95, 0.9], [0.95, 1, 0.8], [0.9, 0.8, 1]], ep = ejesPrincipalesUnFactor(H);
    assert.ok(ep.heywood && ep.comunalidades[0] === 0.999, `tope (${ep.comunalidades[0]})`);
    assert.ok(Math.abs(omegaDeCargas(ep.cargas, ep.comunalidades) - 0.9554052020253109) < 1e-8, 'ω con el tope');
    const om = omegaUnifactorial(H, 3);
    assert.ok(om.ok && /Heywood/.test(String(om.motivo)) && Math.abs(/** @type {number} */ (om.valor) - 0.9554052020253109) < 1e-8, 'el Analizador la da con su aviso');
});

test('una carga ligeramente negativa (entre −0,05 y 0) no anula la ω, pero no suma en ella (parte positiva)', () => {
    const N = [[1, 0.5, 0.45, -0.02], [0.5, 1, 0.55, -0.01], [0.45, 0.55, 1, -0.03], [-0.02, -0.01, -0.03, 1]], ep = ejesPrincipalesUnFactor(N);
    assert.ok(/** @type {number} */ (ep.cargas[3]) < 0 && /** @type {number} */ (ep.cargas[3]) > -0.05, `carga ${ep.cargas[3]}`);
    assert.ok(Math.abs(omegaCovarianzas(ep.cargas, [1.2, 0.9, 1.5, 1.1]) - 0.6455331800034156) < 1e-8, 'ω en covarianzas con la parte positiva');
    assert.ok(omegaUnifactorial(N, 4).ok, 'no es «signo mixto»');
});

test('una carga claramente negativa (ítem invertido sin recodificar): el Analizador no da la ω y explica por qué', () => {
    const M = [[1, 0.5, 0.45, -0.35], [0.5, 1, 0.55, -0.3], [0.45, 0.55, 1, -0.4], [-0.35, -0.3, -0.4, 1]];
    const om = omegaUnifactorial(M, 4);
    assert.ok(!om.ok && /signo mixto/.test(String(om.motivo)), `rechazo por signo mixto (${om.motivo})`);
});

