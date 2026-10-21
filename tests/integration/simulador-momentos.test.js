// @ts-check
// tests/integration/simulador-momentos.test.js — (2026.12.25, cierre de la fase F6) lo que el Simulador calcula con las
// puntuaciones típicas, la media y la DE del núcleo único, comprobado sobre lo que entrega. El análisis de mutaciones del
// cierre encontró que ninguna prueba vigilaba las filas β de una moderación, la DE exacta de una escala con forma no normal,
// la media de las cargas que calibra el generador, el efecto de conglomerado de un CCI ni las pendientes de los bordes de una
// nube: cambiarlos no hacía fallar nada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeneradorDatos } from '../../src/simulador/dominio/generador.js';
import { bordesPorTramos } from '../../src/simulador/dominio/nubes-relacion.js';
import { media, desviacion } from '../../src/core/stats/descriptivos.js';

/** @param {string} nombre @param {string} corto @param {object} [extra] */
const esc = (nombre, corto, extra = {}) => ({ nombre, nombreCorto: corto, prueba: 'T', tipo: 'dimension', numItems: 10, media: 30, desviacion: 6, minimo: 1, maximo: 5, alfa: 0.85, distribucion: 'normal', invertidos: 0, ...extra });
/** @param {object} cfg */
function generar(cfg) {
    const g = new GeneradorDatos();
    g.configuracion = /** @type {any} */ ({ tamanoMuestra: 600, semilla: 7, generarPercentiles: false, correlacionesExactas: true, indiceFiabilidad: 'alfa', heterogeneidadItems: 'leve', variablesPorTest: { T: { variable: 'R', rIntra: 0 } },
        sociodemograficos: [], correlaciones: [], diferenciasGrupo: [], modelos: [], medidasRepetidas: [], niveles: [], paneles: [], histeresis: [], estructuras: [], desenlaces: [], cortes: [], concordancias: [], realismo: {}, ...cfg });
    g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas);
    assert.deepEqual(g.validarConfiguracion().errores, []);
    const b = g.generarBaseDatos();
    return { g, b, informe: /** @type {any[]} */ (g.informePedidoObtenido(b)) };
}

test('moderación: β₁, β₂ y β₃ (con X y W tipificadas en la muestra) son los pedidos, con W en su escala de 10 a 50', () => {
    const { informe } = generar({ pruebas: [esc('Estrés', 'ES'), esc('Calma', 'CA'), esc('Apoyo', 'AP')], modelos: [{ tipo: 'moderacion', x: 'Estrés', m: 'Calma', y: 'Apoyo', c1: 0.3, c2: 0.2, c3: 0.15 }] });
    const filas = informe.filter(f => /^Moderación/.test(f.variable));
    assert.equal(filas.length, 3, 'las tres filas β');
    for (const f of filas) assert.ok(f.ok === true && Math.abs(parseFloat(String(f.obtenido).replace(',', '.')) - parseFloat(String(f.pedido).replace(',', '.'))) < 0.03, `${f.tipo}: ${f.pedido} → ${f.obtenido}`);
});

test('con correlaciones exactas, la media y la DE de una escala continua con forma no normal salen las pedidas (la DE muestral, n − 1)', () => {
    const { b } = generar({ tamanoMuestra: 150, semilla: 5, pruebas: [esc('Unif', 'UN', { distribucion: 'uniforme', minimo: null, maximo: null }), esc('Asim', 'AS', { distribucion: 'asimetrica', minimo: null, maximo: null })], correlaciones: [{ a: 'Unif', b: 'Asim', r: 0.4 }] });
    for (const nombre of ['Dimension_UN', 'Dimension_AS']) {
        const v = b.columna(nombre).datos;
        assert.ok(Math.abs(media(v) - 30) < 0.005 && Math.abs(desviacion(v) - 6) < 0.005, `${nombre}: media ${media(v)}, DE ${desviacion(v)} (pedidas 30 y 6)`);
    }
});

test('la estructura factorial con cargas distintas: el generador calibra la carga MEDIA pedida (la fila λ media del informe)', () => {
    const cargas = [0.4, 0.5, 0.6, 0.7, 0.5, 0.6];
    const { informe } = generar({ tamanoMuestra: 800, semilla: 11, pruebas: [esc('Bienestar', 'BI', { numItems: 6, media: 18, desviacion: 4, alfa: 0.8 })],
        estructuras: [{ prueba: 'T', modo: 'cargas', factores: ['Bienestar'], cargas: { Bienestar: cargas.map(c => [c]) }, metodo: null, desajuste: 'ninguno' }] });
    const fila = informe.find(f => f.tipo === 'λ' && /^Bienestar: cargas propias/.test(f.variable));
    assert.ok(fila, 'la fila de las cargas propias: ' + informe.map(f => f.tipo).join(', '));
    const obtenida = parseFloat(String(fila.obtenido).replace(',', '.'));
    assert.ok(Math.abs(obtenida - media(cargas)) < 0.04, `carga media ${obtenida} (pedida ${media(cargas)})`);
});

test('el efecto de conglomerado de un CCI entra tipificado (media 0 y DE 1 exactas en la muestra): así la varianza entre aulas es la pedida sin calibrar', () => {
    const aula = { categoria: 'Aula', categoriaCorta: 'Au', distribucion: 'categorica', promedio: 0, desviacion: 1, minimo: 1, maximo: 20, decimales: 0, niveles: null, ordinal: false, fechaNacimiento: null, dependeDe: '', fuerza: 0 };
    const { g, b, informe } = generar({ pruebas: [esc('Percepción', 'PE')], sociodemograficos: [aula], diferenciasGrupo: [{ tipo: 'icc', cuantitativa: 'Percepción', agrupacion: 'Aula', d: 0.2 }] });
    const parte = /** @type {any} */ (g)._partesDesplazamiento(b, 'Percepción', 6).partes.find((/** @type {any} */ p) => p.tipo === 'icc');
    assert.ok(parte, 'la parte del CCI');
    assert.ok(Math.abs(media(parte.c)) < 1e-12 && Math.abs(desviacion(parte.c) - 1) < 1e-12, `media ${media(parte.c)}, DE ${desviacion(parte.c)}`);
    assert.ok(informe.some(f => f.tipo === 'CCI' && f.ok === true), 'la fila del CCI');
});

test('las pendientes de los bordes de una nube (cuantiles .10 y .90 por tramos): las de una recta de pendiente 2', () => {
    const n = 500, x = Float64Array.from({ length: n }, (_, i) => i), y = Float64Array.from(x, (v, i) => 2 * v + ((i * 37) % 11) - 5);
    const { b10, b90 } = bordesPorTramos(x, y);
    assert.ok(Math.abs(b10 - 2) < 0.05 && Math.abs(b90 - 2) < 0.05, `b10 ${b10}, b90 ${b90}`);
    const constante = bordesPorTramos(new Float64Array(n).fill(3), y);
    assert.deepEqual([constante.b10, constante.b90], [0, 0], 'X sin varianza: sin pendiente');
});
