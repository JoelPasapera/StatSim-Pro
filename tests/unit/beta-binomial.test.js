// @ts-check
// (2026.12.10) La forma beta-binomial del generador (totales de escalas de acierto/error y sumas discretas): ninguna prueba
// comprobaba su función de probabilidad, que depende de lnGamma (lo mostró el análisis de mutaciones). Referencias con
// scipy.stats.betabinom y scipy.stats.binom, con la misma parametrización por momentos del código.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeneradorDatos } from '../../src/simulador/dominio/generador.js';

const Z = [-2, -1, -0.3, 0, 0.5, 1.2, 2.5];
const CASOS = [
    { k: 10, media: 6, de: 2.2, rama: 'beta-binomial (α 4,71, β 3,14)', esperado: [-2.2727272727272734, -0.9090909090909096, -0.45454545454545503, -4.0371746350005696e-16, 0.4545454545454542, 1.3636363636363633, 1.818181818181818] },
    { k: 10, media: 4, de: 1.5, rama: 'binomial (sin sobredispersión)', esperado: [-1.9364916731037078, -1.2909944487358052, -0.6454972243679026, 0, 0.6454972243679026, 1.2909944487358052, 2.5819888974716103] },
    { k: 20, media: 15, de: 4.0, rama: 'beta-binomial (α 3,61, β 1,20)', esperado: [-2.5, -1, -0.25, 0.25, 0.75, 1, 1.25] },
];

test('forma beta-binomial: cuantiles estandarizados iguales a SciPy en sus dos ramas', () => {
    const g = new GeneradorDatos();
    for (const c of CASOS) {
        const forma = g._formaBetaBinomial(c.k, c.media, c.de);
        Z.forEach((z, i) => assert.ok(Math.abs(forma(z) - c.esperado[i]) < 1e-9, `${c.rama}, k = ${c.k}, z = ${z}: ${forma(z)} frente a ${c.esperado[i]} (SciPy)`));
    }
});
