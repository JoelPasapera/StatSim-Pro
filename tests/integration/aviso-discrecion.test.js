// tests/integration/aviso-discrecion.test.js — avisos de la validación sobre la discreción de los totales enteros (revisión
// 2026.11.17): dicen el mecanismo y la consecuencia en cifras, y ya no avisan «probablemente NO pasará» con un riesgo pequeño.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeneradorDatos } from '../../src/simulador/dominio/generador.js';

function avisos(N, k, M, DE) {
    const g = new GeneradorDatos();
    g.configuracion = { tamanoMuestra: N, semilla: 1, generarPercentiles: false, correlacionesExactas: true, indiceFiabilidad: 'alfa', heterogeneidadItems: 'leve', variablesPorTest: { T: { variable: 'R', rIntra: 0 } },
        pruebas: [{ nombre: 'Escala', nombreCorto: 'ES', prueba: 'T', tipo: 'dimension', numItems: k, media: M, desviacion: DE, minimo: 1, maximo: 5, alfa: 0.85, distribucion: 'normal', invertidos: 0 }],
        sociodemograficos: [], correlaciones: [], diferenciasGrupo: [], modelos: [], medidasRepetidas: [], estructuras: [], desenlaces: [], cortes: [], concordancias: [], realismo: {} };
    g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas);
    return g.validarConfiguracion().advertencias.filter(a => /Kolmogorov|escalonad/.test(a));
}

test('sin salida (10 ítems, DE 6, N = 300): el aviso dice el mecanismo, la prueba y ≈ 79 %', () => {
    const a = avisos(300, 10, 30, 6);
    assert.equal(a.length, 1);
    assert.match(a[0], /escalonado incluso con la DE máxima posible.*Kolmogorov–Smirnov.*≈ 79 %.*Shapiro–Wilk es mucho menos sensible/);
    assert.doesNotMatch(a[0], /demasiado estrecho para un total normal/);
});

test('riesgo pequeño (20 ítems, DE 10, N = 100: ≈ 15 %): ya no avisa; riesgo real (30 ítems, DE 8, N = 300): avisa con su cifra', () => {
    assert.deepEqual(avisos(100, 20, 60, 10), []);
    const a = avisos(300, 30, 90, 8);
    assert.equal(a.length, 1);
    assert.match(a[0], /rechazará su normalidad en ≈ 5\d % .*Con DE ≥ 20 bajaría a ≈ 13 %/);
});

test('con N < 50 (se usa Shapiro–Wilk) no hay aviso de discreción', () => {
    assert.deepEqual(avisos(40, 10, 30, 3), []);
});
