// tests/integration/informe-imperfecciones.test.js — el informe con imperfecciones (revisión 2026.11.13). El informe verifica
// el GENERADOR sobre la base limpia (calculada en el flujo antes de contaminarla) y anota aparte el valor de la base final. Antes
// comparaba la base final: con n = 60 y un 10 % de descuidados, el α salía .624 para .85 sin que el generador fallara.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeneradorDatos } from '../../src/simulador/dominio/generador.js';

const esc = (nombre, corto, extra = {}) => ({ nombre, nombreCorto: corto, prueba: 'T', tipo: 'dimension', numItems: 10, media: 30, desviacion: 6, minimo: 1, maximo: 5, alfa: 0.85, distribucion: 'normal', invertidos: 0, ...extra });
function generar({ realismo = {}, n = 60, semilla = 5 } = {}) {
    const g = new GeneradorDatos();
    g.configuracion = { tamanoMuestra: n, semilla, generarPercentiles: false, correlacionesExactas: true, indiceFiabilidad: 'alfa', heterogeneidadItems: 'leve', variablesPorTest: { T: { variable: 'R', rIntra: 0 } },
        pruebas: [esc('Estrés', 'ES'), esc('Apoyo', 'AP', { invertidos: 2 }), esc('Calma', 'CA')], sociodemograficos: [], correlaciones: [{ a: 'Estrés', b: 'Apoyo', r: 0.5 }],
        diferenciasGrupo: [], modelos: [], medidasRepetidas: [], estructuras: [], desenlaces: [], cortes: [], concordancias: [], realismo };
    g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas);
    const b = g.generarBaseDatos(); return { g, b, informe: g.informePedidoObtenido(b) };
}
const IMPERFECCIONES = { pctPerdidos: 10, mecanismoPerdidos: 'MCAR', pctDescuidados: 10, tipoDescuidado: 'aleatorio' };

test('sin imperfecciones, el informe no cambia: ni fila explicativa ni valores anotados', () => {
    const r = generar();
    assert.ok(!r.informe.some(f => f.tipo === 'imperfecciones' || f.conImperfecciones !== undefined));
    assert.deepEqual(r.informe.filter(f => f.ok === false).map(f => f.variable), []);
});

test('con imperfecciones (n = 60, 10 % de perdidos y de descuidados): se verifica la base limpia, sin ✗; el valor final se anota aparte', () => {
    const r = generar({ realismo: IMPERFECCIONES });
    assert.deepEqual(r.informe.filter(f => f.ok === false).map(f => `${f.tipo} ${f.variable} ${f.pedido}→${f.obtenido}`), []);
    assert.equal(r.informe[0].tipo, 'imperfecciones');
    const alfa = r.informe.find(f => f.tipo === 'α' && f.variable === 'Calma');
    assert.ok(alfa.ok === true && alfa.conImperfecciones !== undefined, JSON.stringify(alfa));
    assert.ok(parseFloat(alfa.conImperfecciones) < parseFloat(alfa.obtenido), 'la base final, con descuidados, es menos fiable');
    assert.equal(parseFloat(r.informe.find(f => f.tipo === 'α' && f.variable === 'Estrés').conImperfecciones), 0.624, 'el α que antes salía ✗ ahora es la anotación de la base final');
});

test('la base que recibe el usuario sigue teniendo sus imperfecciones: el informe limpio no la altera', () => {
    const r = generar({ realismo: IMPERFECCIONES }), y = Array.from(r.b.columna('Dimension_AP').datos);
    assert.ok(y.filter(v => !Number.isFinite(v)).length > 0, 'hay perdidos en la base final');
});

test('la combinación conserva las filas que solo existen al final (niveles por puntos de corte, que se calculan sobre los totales finales)', () => {
    const g = new GeneradorDatos();
    const limpias = [{ tipo: 'Media', variable: 'X', pedido: '30.00', obtenido: '30.02', ok: true }];
    const finales = [{ tipo: 'Media', variable: 'X', pedido: '30.00', obtenido: '29.10', ok: false }, { tipo: '%', variable: 'Niveles de X', pedido: '20 %', obtenido: '19 %', ok: true }];
    const c = g._combinarConImperfecciones(limpias, finales);
    assert.deepEqual(c.map(f => [f.tipo, f.ok, f.conImperfecciones]), [['imperfecciones', null, undefined], ['Media', true, '29.10'], ['%', true, undefined]]);
});

test('revisión 2026.11.14: las etiquetas identifican y no miden; con selección e imperfecciones, ninguna fila final sin pareja limpia (antes, Thorndike salía dos veces)', () => {
    const g = new GeneradorDatos();
    g.configuracion = { tamanoMuestra: 120, semilla: 5, generarPercentiles: false, correlacionesExactas: true, indiceFiabilidad: 'alfa', heterogeneidadItems: 'leve', variablesPorTest: { T: { variable: 'R', rIntra: 0 } },
        pruebas: [esc('Estrés', 'ES'), esc('Apoyo', 'AP'), esc('Calma', 'CA')], sociodemograficos: [], correlaciones: [{ a: 'Estrés', b: 'Apoyo', r: 0.5 }, { a: 'Estrés', b: 'Calma', r: 0.3 }], seleccion: { variable: 'Estrés', lado: 'superior', proporcion: 0.3 },
        diferenciasGrupo: [], modelos: [], medidasRepetidas: [], estructuras: [], desenlaces: [], cortes: [], concordancias: [], realismo: IMPERFECCIONES };
    g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas);
    const b = g.generarBaseDatos(), comb = g.informePedidoObtenido(b), thorndike = comb.filter(f => f.tipo === 'ρ corregida');
    assert.equal(thorndike.length, 2, 'una fila por par, sin duplicados');
    assert.ok(thorndike.every(f => !/\d\.\d{3}/.test(f.variable) && /\(r = [-\d.]+, u = [\d.]+\)/.test(f.obtenido)), JSON.stringify(thorndike.map(f => [f.variable, f.obtenido])));
    const limpias = new Set(g._informeLimpio.filas.map(f => `${f.tipo}|${f.variable}`)), guardado = g._informeLimpio; g._informeLimpio = null;
    const finales = g.informePedidoObtenido(b); g._informeLimpio = guardado;
    assert.deepEqual(finales.filter(f => !limpias.has(`${f.tipo}|${f.variable}`)).map(f => f.variable), []);
});

test('revisión 2026.11.14: unos puntos de corte sin cortes numéricos dan un error de validación, no una excepción', () => {
    const g = new GeneradorDatos();
    g.configuracion = { tamanoMuestra: 60, semilla: 5, generarPercentiles: false, correlacionesExactas: true, indiceFiabilidad: 'alfa', heterogeneidadItems: 'leve', variablesPorTest: { T: { variable: 'R', rIntra: 0 } },
        pruebas: [esc('Estrés', 'ES'), esc('Apoyo', 'AP')], sociodemograficos: [], correlaciones: [], diferenciasGrupo: [], modelos: [], medidasRepetidas: [], estructuras: [], desenlaces: [], cortes: [{ variable: 'Estrés', etiquetas: ['Bajo', 'Medio', 'Alto'] }], concordancias: [], realismo: {} };
    g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas);
    assert.ok(g.validarConfiguracion().errores.some(e => /faltan los puntos de corte/.test(e)));
});

