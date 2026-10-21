// @ts-check
// (2026.12.10) Una escala uniforme correlacionada con una asimétrica: la rama «uniforme–lognormal» de la correlación
// intermedia, que usa la inversa de la normal del generador. Hasta esta versión ninguna prueba la recorría.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeneradorDatos } from '../../src/simulador/dominio/generador.js';

/** @param {boolean} exactas @param {number} n @param {number} semilla */
function generar(exactas, n, semilla) {
    const esc = (/** @type {string} */ nombre, /** @type {string} */ corto, /** @type {string} */ dist) => ({ nombre, nombreCorto: corto, prueba: 'T', tipo: 'dimension', numItems: 10, media: 30, desviacion: 6, minimo: 1, maximo: 5, alfa: 0.85, distribucion: dist, invertidos: 0 });
    const g = new GeneradorDatos();
    g.configuracion = { tamanoMuestra: n, semilla, generarPercentiles: false, correlacionesExactas: exactas, indiceFiabilidad: 'alfa', heterogeneidadItems: 'leve', variablesPorTest: { T: { variable: 'R', rIntra: 0 } },
        pruebas: [esc('Unif', 'UN', 'uniforme'), esc('Asim', 'AS', 'asimetrica')], sociodemograficos: [], correlaciones: [{ a: 'Unif', b: 'Asim', r: 0.4 }], diferenciasGrupo: [], modelos: [], medidasRepetidas: [], niveles: [], paneles: [], histeresis: [], estructuras: [], desenlaces: [], cortes: [], concordancias: [], realismo: {} };
    g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas);
    assert.deepEqual(g.validarConfiguracion().errores, []);
    const b = g.generarBaseDatos();
    return { g, b, fila: g.informePedidoObtenido(b).find((/** @type {any} */ f) => f.tipo === 'r' && /Unif ↔ Asim/.test(f.variable)) };
}

test('uniforme ↔ asimétrica: la r pedida se obtiene (exacta, y sin modo exacto dentro de su error de muestreo)', () => {
    const exacta = generar(true, 400, 77);
    assert.ok(exacta.fila && exacta.fila.ok !== false, `modo exacto: ${exacta.fila && exacta.fila.obtenido}`);
    // sin modo exacto la r depende de la correlación intermedia: si la inversa de la normal fallara, se alejaría de 0,40
    const rs = [11, 12, 13].map(s => parseFloat(String(generar(false, 3000, s).fila.obtenido).replace(',', '.')));
    const media = rs.reduce((x, y) => x + y, 0) / rs.length;
    assert.ok(Math.abs(media - 0.4) < 0.03, `r media sin modo exacto ${media.toFixed(3)} (pedida 0,40; ${rs.join(', ')})`);
});
