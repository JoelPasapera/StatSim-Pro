// tests/unit/avisos-extremos.test.js — el fuzz reconoce las configuraciones extremas por la redacción de sus avisos: si un
// aviso se reescribe y deja de coincidir, esta prueba lo dice (antes, un fallo críptico del fuzz meses después).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeneradorDatos } from '../../src/simulador/dominio/generador.js';
import { AVISO_EXTREMO } from '../fuzz/avisos-extremos.js';

const avisos = prueba => {
    const g = new GeneradorDatos();
    g.configuracion = { tamanoMuestra: 600, semilla: 1, generarPercentiles: false, correlacionesExactas: true, indiceFiabilidad: 'alfa', heterogeneidadItems: 'moderada', variablesPorTest: { T: { variable: 'R', rIntra: 0.4 } },
        pruebas: [{ nombre: 'Escala', nombreCorto: 'ES', prueba: 'T', tipo: 'dimension', distribucion: 'normal', invertidos: 0, ...prueba }], sociodemograficos: [], correlaciones: [], diferenciasGrupo: [], modelos: [], medidasRepetidas: [], estructuras: [], desenlaces: [], cortes: [], concordancias: [], realismo: {} };
    g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas);
    return g.validarConfiguracion().advertencias;
};

test('la fiabilidad inalcanzable (4 ítems de 1 a 4 con DE 0,97 y α .88, la iteración 21 del fuzz) se reconoce como extrema', () => {
    assert.ok(avisos({ numItems: 4, media: 8.3, desviacion: 0.97, alfa: 0.88, minimo: 1, maximo: 4 }).some(a => AVISO_EXTREMO.test(a)));
});

test('una DE demasiado grande para la media (recorte contra los topes) se reconoce como extrema', () => {
    assert.ok(avisos({ numItems: 10, media: 45, desviacion: 8, alfa: 0.8, minimo: 1, maximo: 5 }).some(a => AVISO_EXTREMO.test(a)));
});

test('una configuración corriente no se toma por extrema', () => {
    assert.ok(!avisos({ numItems: 20, media: 60, desviacion: 12, alfa: 0.85, minimo: 1, maximo: 5 }).some(a => AVISO_EXTREMO.test(a)));
});
