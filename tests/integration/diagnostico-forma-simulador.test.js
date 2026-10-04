// tests/integration/diagnostico-forma-simulador.test.js — círculo cerrado: el Simulador genera cada tipo de relación del
// atlas y el diagnóstico de forma del Analizador reconoce su categoría y recomienda el coeficiente adecuado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeneradorDatos } from '../../src/simulador/dominio/generador.js';
import { diagnosticarForma } from '../../src/analizador/relaciones/diagnostico-forma.js';

const esc = (nombre, corto, dist = 'normal') => ({ nombre, nombreCorto: corto, prueba: 'T', tipo: 'dimension', numItems: 10, media: 30, desviacion: 6, minimo: 1, maximo: 5, alfa: 0.85, distribucion: dist, invertidos: 0 });
function base(forma, eta, { distX = 'uniforme', n = 800, semilla = 41 } = {}) {
    const g = new GeneradorDatos(), modelos = forma === 'lineal' || forma === 'nula' ? [] : [{ tipo: 'forma', forma, x: 'Estrés', y: 'Apoyo', eta }];
    g.configuracion = { tamanoMuestra: n, semilla, generarPercentiles: false, correlacionesExactas: true, indiceFiabilidad: 'alfa', heterogeneidadItems: 'leve', variablesPorTest: { T: { variable: 'R', rIntra: 0 } },
        pruebas: [esc('Estrés', 'ES', distX), esc('Apoyo', 'AP')], sociodemograficos: [], correlaciones: forma === 'lineal' ? [{ a: 'Estrés', b: 'Apoyo', r: eta }] : forma === 'nula' ? [{ a: 'Estrés', b: 'Apoyo', r: 0 }] : [], diferenciasGrupo: [], modelos,
        medidasRepetidas: [], estructuras: [], desenlaces: [], cortes: [], concordancias: [], realismo: {} };
    g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas);
    const b = g.generarBaseDatos();
    return [Array.from(b.columna('Dimension_ES').datos), Array.from(b.columna('Dimension_AP').datos)];
}
const ESPERADO = {
    lineal: ['lineal'], nula: ['sin-relacion'],
    logaritmica: ['creciente-frena'], potencia: ['creciente-frena'], asintotica: ['creciente-frena'], 'hiperbolica-sat': ['creciente-frena'], meseta: ['meseta', 'creciente-frena'],
    exponencial: ['creciente-acelera'], 'potencia-exp': ['creciente-acelera'], sigmoide: ['sigmoide'], escalon: ['escalon', 'sigmoide'],
    decaimiento: ['decreciente-frena'], 'potencia-dec': ['decreciente-frena'], 'hiperbolica-dec': ['decreciente-frena'],
    'u-invertida': ['u-invertida'], u: ['u'], j: ['j'], cubica: ['cubica'], ciclica: ['ciclica']
};
const COEF = { lineal: 'r', nula: 'ninguno' };

test('el Analizador reconoce las 17 curvas del Simulador, la recta y la ausencia de relación (X uniforme, η = .75)', () => {
    const fallos = [];
    for (const [forma, validas] of Object.entries(ESPERADO)) {
        // la recta y la ausencia de relación, con X normal: con X uniforme e Y normal, una r pedida no puede ser una recta
        // exacta (el Simulador conserva ambas distribuciones y la relación sale monotónica en S suave)
        const [x, y] = base(forma, 0.75, forma === 'lineal' || forma === 'nula' ? { distX: 'normal' } : {}), d = diagnosticarForma(x, y, { B: 49 });
        if (!validas.includes(d.categoria)) fallos.push(`${forma} → ${d.categoria} (mejor modelo ${d.mejor.id})`);
        const coef = COEF[forma] || (validas[0].match(/^(u|u-invertida|j|cubica|ciclica)$/) ? 'modelo' : 'ρ');
        if (d.coefRecomendado !== coef) fallos.push(`${forma}: recomienda ${d.coefRecomendado} en lugar de ${coef}`);
    }
    assert.deepEqual(fallos, []);
});

test('con X normal, las no monotónicas también se reconocen (r y ρ fallan, el modelo y dCor no)', () => {
    for (const forma of ['u-invertida', 'u', 'cubica', 'ciclica']) {
        const [x, y] = base(forma, 0.7, { distX: 'normal', n: 600 }), d = diagnosticarForma(x, y, { B: 49 });
        assert.equal(d.categoria, forma, `${forma} → ${d.categoria}`);
        assert.ok(d.coeficientes.dcor.p < 0.05 && d.mejor.r2 > 0.4, `${forma}: dCor p ${d.coeficientes.dcor.p}, R² ${d.mejor.r2}`);
    }
});

test('confirmaciones (2026.10.29): las dos rectas confirman la U y la ∩ del Simulador y no convierten en U una curva monotónica', async () => {
    const { pruebaDosRectas } = await import('../../src/analizador/relaciones/confirmacion-forma.js');
    for (const forma of ['u-invertida', 'u']) {
        const [x, y] = base(forma, 0.7, { n: 600 }), d = diagnosticarForma(x, y, { B: 19 });
        assert.equal(d.confirmacion.tipo, 'cambio-sentido');
        assert.equal(d.confirmacion.dosRectas.confirmada, true, `${forma}: ` + JSON.stringify(d.confirmacion.dosRectas.bajo) + JSON.stringify(d.confirmacion.dosRectas.alto));
        assert.ok(d.confirmacion.lindMehlum.acotado && d.confirmacion.lindMehlum.dentro, `${forma}: vértice acotado y dentro del rango`);
    }
    // el falso positivo de la cuadrática (Simonsohn, 2018): una curva que solo se frena NO se confirma como ∩
    for (const forma of ['logaritmica', 'asintotica']) {
        const [x, y] = base(forma, 0.7, { n: 600 });
        assert.equal(pruebaDosRectas(x, y, 'máximo').confirmada, false, forma);
    }
});

test('confirmaciones (2026.10.29): sin relación, la prueba de equivalencia lo confirma con n grande y no con n pequeña', () => {
    const [x, y] = base('nula', 0, { distX: 'normal', n: 2000 }), d = diagnosticarForma(x, y, { B: 19, limiteEquivalencia: 0.1 });
    assert.equal(d.categoria, 'sin-relacion');
    assert.equal(d.confirmacion.tost.equivalente, true, `p = ${d.confirmacion.tost.p}`);
    const [x2, y2] = base('nula', 0, { distX: 'normal', n: 60, semilla: 7 }), d2 = diagnosticarForma(x2, y2, { B: 19, limiteEquivalencia: 0.1 });
    if (d2.categoria === 'sin-relacion') assert.equal(d2.confirmacion.tost.equivalente, false, 'con n = 60 no se puede afirmar |r| < .10');
});
