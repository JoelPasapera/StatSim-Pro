// tests/montecarlo/imputacion.mjs — (2027.01.18) verificación por simulación de Monte Carlo de la imputación múltiple
// (core/stats/imputacion.js), de las reglas de Rubin y del EM (core/stats/perdidos.js): no hay oráculo independiente que
// reproduzca los sorteos de mice, pero la teoría promete lo que se mide aquí. Tres normales correlacionadas (ρ = .5), n = 200,
// perdidos MCAR en X3 (10 %) y MAR en X2 (más probables cuanto mayor es X1), en dos escenarios con R réplicas cada uno:
//   A) MAR fuerte (un 41 % de X2, casi todos en la cola alta de X1): la media de X2 por eliminación por lista está sesgada;
//      la del EM y la de la imputación «norm» no, y los intervalos del 95 % de «norm» (media y correlación X1–X2) cubren
//      cerca del 95 %;
//   B) MAR moderado (un 29 %): la imputación PMM (la de por defecto) tampoco tiene sesgo apreciable y cubre al menos el 90 %
//      (PMM se queda algo corta en muestras pequeñas y cuando los perdidos se concentran en una cola sin donantes cerca: lo
//      conocido de PMM, que docs/LIMITACIONES.md explica).
// Escribe una línea JSON con los resultados y «FALLO: …» por cada criterio que no se cumple.
import { imputarPMM, mediaCombinada, correlacionCombinada } from '../../src/core/stats/imputacion.js';
import { emNormal } from '../../src/core/stats/perdidos.js';
import { sfc32 } from '../../src/core/random/sfc32.js';
import { generadorNormales } from '../../src/core/random/normal.js';
import { media } from '../../src/core/stats/descriptivos.js';

const R = Number(process.argv[2] || 300), n = 200, m = 10, rho = 0.5;
const t0 = Date.now();

/** Un escenario: el sesgo de cada método en la media de X2 y la cobertura de la imputación. */
function escenario(a0, a1, metodo, semilla) {
    const g = sfc32(semilla), u = g.siguiente, normal = generadorNormales(u);
    let lista = 0, em = 0, im = 0, cubreMedia = 0, cubreR = 0, perdidos = 0;
    for (let r = 0; r < R; r++) {
        const X = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
        for (let i = 0; i < n; i++) {
            const z1 = normal(), z2 = rho * z1 + Math.sqrt(1 - rho * rho) * normal(), z3 = rho * z1 + Math.sqrt(1 - rho * rho) * normal();
            X[0][i] = z1; X[1][i] = z2; X[2][i] = z3;
            if (u() < 1 / (1 + Math.exp(-(a0 + a1 * z1)))) { X[1][i] = NaN; perdidos++; }
            if (u() < 0.1) X[2][i] = NaN;
        }
        lista += media(Array.from(X[1]).filter(Number.isFinite));
        const E = emNormal(X);
        em += E ? E.medias[1] : NaN;
        const I = imputarPMM(X, { m, iteraciones: 5, semilla: 1000 + r, metodo });
        const M = mediaCombinada(I.imputaciones, 1), C = correlacionCombinada(I.imputaciones, 0, 1);
        im += M.estimacion;
        if (M.inferior <= 0 && 0 <= M.superior) cubreMedia++;
        if (C.inferior <= rho && rho <= C.superior) cubreR++;
    }
    return { metodo, perdidos: perdidos / (R * n), sesgoLista: lista / R, sesgoEM: em / R, sesgoIM: im / R, coberturaMedia: cubreMedia / R, coberturaR: cubreR / R };
}

const A = escenario(-0.5, 1.5, 'norm', 20270118), B = escenario(-1, 0.8, 'pmm', 20270119);
console.log(JSON.stringify({ R, n, m, A, B, segundos: (Date.now() - t0) / 1000 }));
const ee = Math.sqrt(0.95 * 0.05 / R), fallo = (/** @type {string} */ t) => console.log('FALLO: ' + t);
if (!(A.sesgoLista < -0.15)) fallo(`la eliminación por lista debería estar sesgada hacia abajo (${A.sesgoLista})`);
for (const [que, v] of [['EM (A)', A.sesgoEM], ['norm (A)', A.sesgoIM], ['EM (B)', B.sesgoEM], ['PMM (B)', B.sesgoIM]]) if (!(Math.abs(v) < 0.03)) fallo(`sesgo de la media de X2 con ${que}: ${v}`);
for (const [que, c] of [['media con norm', A.coberturaMedia], ['correlación con norm', A.coberturaR]]) if (!(c > 0.95 - 3.5 * ee && c < 0.95 + 3.5 * ee)) fallo(`cobertura del IC del 95 % de la ${que}: ${c}`);
for (const [que, c] of [['media con PMM', B.coberturaMedia], ['correlación con PMM', B.coberturaR]]) if (!(c >= 0.9 && c < 0.95 + 3.5 * ee)) fallo(`cobertura del IC del 95 % de la ${que}: ${c}`);
