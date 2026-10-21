// @ts-check
// tests/integration/simulador-riclpm.test.js — el RI-CLPM en el motor (2026.12.07): generación, informe y validación.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeneradorDatos } from '../../src/simulador/dominio/generador.js';
import { estructuraPanel, clpmIngenuo } from '../../src/simulador/dominio/paneles.js';

/** @param {string} nombre @param {string} corto */
const esc = (nombre, corto) => ({ nombre, nombreCorto: corto, prueba: 'T', tipo: 'dimension', numItems: 10, media: 30, desviacion: 6, minimo: 1, maximo: 5, alfa: 0.85, distribucion: 'normal', invertidos: 0 });
/** @param {string} variable @param {number} estabilidad */
const rep = (variable, estabilidad) => ({ variable, ondas: 4, estabilidad, cambio: 0, agrupacion: '', cambioGrupo: null, modelo: 'ar1', dePendientes: 0, rInterceptoPendiente: 0 });
/** @param {object} pn @param {object} [extra] */
function generador(pn, extra = {}) {
    const g = /** @type {any} */ (new GeneradorDatos());
    g.configuracion = Object.assign({ tamanoMuestra: 1500, semilla: 8, generarPercentiles: false, correlacionesExactas: true, indiceFiabilidad: 'alfa', heterogeneidadItems: 'leve', variablesPorTest: { T: { variable: 'R', rIntra: 0 } },
        pruebas: [esc('Uso', 'US'), esc('Ánimo', 'AN'), esc('Edad', 'ED')], sociodemograficos: [], correlaciones: [], diferenciasGrupo: [], modelos: [], medidasRepetidas: [rep('Uso', 0.6), rep('Ánimo', 0.6)], niveles: [],
        paneles: [Object.assign({ tipo: 'reciproca', x: 'Uso', y: 'Ánimo', r: 0.1, cXY: 0, cYX: 0, iccX: 0.5, iccY: 0.5, rRI: 0.6 }, pn)], histeresis: [], estructuras: [], desenlaces: [], cortes: [], concordancias: [], realismo: {} }, extra);
    g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas);
    return g;
}

test('sin efecto cruzado dentro de la persona y con rasgos relacionados: el panel clásico lo ve (≈ 0,11), y el informe lo verifica sin ✗', () => {
    for (const exactas of [true, false]) {
        const g = generador({}, { correlacionesExactas: exactas });
        assert.deepEqual(g.validarConfiguracion().errores, []);
        const inf = g.informePedidoObtenido(g.generarBaseDatos()), filas = inf.filter((/** @type {any} */ f) => /Relación en el tiempo/.test(f.variable));
        assert.deepEqual(inf.filter((/** @type {any} */ f) => f.ok === false).map((/** @type {any} */ f) => `${f.tipo} ${f.variable}`), [], exactas ? 'exacto' : 'no exacto');
        const esperado = clpmIngenuo(estructuraPanel({ estabX: 0.6, estabY: 0.6, r: 0.1, cXY: 0, cYX: 0, iccX: 0.5, iccY: 0.5, rRI: 0.6 })).cXY;
        const cruzado = filas.find((/** @type {any} */ f) => f.tipo === 'β cruzado' && /X de una onda → Y/.test(f.variable));
        assert.ok(esperado > 0.08 && Math.abs(parseFloat(cruzado.obtenido) - esperado) < (exactas ? 0.01 : 0.06), `${cruzado.obtenido} frente a ${esperado}`);
        assert.equal(filas.filter((/** @type {any} */ f) => /primera y la última onda/.test(f.variable)).length, 2);
        assert.match(filas.find((/** @type {any} */ f) => f.tipo === 'fenómeno').obtenido, /dentro de la persona es de 0\.00/);
    }
});

test('validación: ICC fuera de rango, estabilidad incompatible con la ICC y relaciones con otras variables', () => {
    const errores = (/** @type {any} */ g) => g.validarConfiguracion().errores.join(' | ');
    assert.match(errores(generador({ iccX: 0.95 })), /entre 0 y 0,9/);
    assert.match(errores(generador({ rRI: 0.99 })), /entre −0,95 y 0,95/);
    assert.match(errores(generador({ iccX: 0.85 }, { medidasRepetidas: [rep('Uso', 0.1), rep('Ánimo', 0.6)] })), /estabilidad observada de «Uso»/);
    assert.match(errores(generador({}, { correlaciones: [{ a: 'Uso', b: 'Edad', r: 0.3 }] })), /no se relacionan con otras variables \(Uso ↔ Edad\)/);
    assert.deepEqual(errores(generador({ iccX: 0, iccY: 0, rRI: 0 }, { correlaciones: [{ a: 'Uso', b: 'Edad', r: 0.3 }] })), '', 'sin interceptos, el panel de siempre las admite');
});

test('revisión de la 2026.12.08: los avisos dicen la r que manda (la observada) y que una r entre interceptos sin ICC no se usa', () => {
    const avisos = (/** @type {any} */ g) => g.validarConfiguracion().advertencias.join(' | ');
    assert.match(avisos(generador({}, { correlaciones: [{ a: 'Uso', b: 'Ánimo', r: 0.2 }] })), /se sustituye por la observada que implica el modelo \(≈ 0\.35: la de dentro de la persona, 0\.1, más la de los rasgos estables\)/);
    assert.match(avisos(generador({ iccX: 0, iccY: 0, rRI: 0.5 })), /la r entre interceptos \(0\.5\) no se usa sin ICC/);
});

test('revisión de la 2026.12.08: en la recíproca, el veredicto habla también de Y → X', () => {
    const g = generador({ cXY: 0.15, cYX: -0.1, iccY: 0.3 });
    const f = g.informePedidoObtenido(g.generarBaseDatos()).find((/** @type {any} */ x) => x.tipo === 'fenómeno' && /Relación en el tiempo/.test(x.variable));
    assert.match(f.obtenido, /efecto Y → X de .*dentro de la persona es de -0\.10/);
});

