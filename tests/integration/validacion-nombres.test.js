// tests/integration/validacion-nombres.test.js — (revisión 2026.11.14) dos siglas que darían columnas con el mismo nombre se
// detectan en la VALIDACIÓN, antes de generar (antes solo al generar, ya dentro del Worker; el escenario S7 lo provoca).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeneradorDatos } from '../../src/simulador/dominio/generador.js';

const esc = (nombre, corto, prueba) => ({ nombre, nombreCorto: corto, prueba, tipo: 'dimension', numItems: 5, media: 15, desviacion: 3, minimo: 1, maximo: 5, alfa: 0.8, distribucion: 'normal', invertidos: 0 });
test('siglas que chocan: error de validación con el mensaje claro; sin choque, ninguno', () => {
    const conf = pruebas => { const g = new GeneradorDatos(); g.configuracion = { tamanoMuestra: 100, semilla: 1, generarPercentiles: false, correlacionesExactas: true, indiceFiabilidad: 'alfa', heterogeneidadItems: 'leve', variablesPorTest: {}, pruebas, sociodemograficos: [], correlaciones: [], diferenciasGrupo: [], modelos: [], medidasRepetidas: [], estructuras: [], desenlaces: [], cortes: [], concordancias: [], realismo: {} }; g.configuracion.gruposPruebas = g.agruparPruebas(pruebas); return g.validarConfiguracion(); };
    assert.ok(conf([esc('Ansiedad', 'A', 'STAI'), esc('A', 'A', 'Otro')]).errores.some(e => /Dos columnas se llamarían «A1»/.test(e)));
    assert.ok(!conf([esc('Ansiedad', 'AN', 'STAI'), esc('A', 'A', 'Otro')]).errores.some(e => /Dos columnas se llamarían/.test(e)));
});
