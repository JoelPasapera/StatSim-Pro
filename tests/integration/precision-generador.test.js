// @ts-check
// tests/integration/precision-generador.test.js — precisión del generador (2026.12.03): la calibración de la fiabilidad ya no
// arrastra su ruido a cada base, y la matriz compensa la discretización de las escalas de acierto/error con pocos ítems.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeneradorDatos } from '../../src/simulador/dominio/generador.js';

/** @param {object} p @param {object} extra */
function generador(p, extra) {
    const g = /** @type {any} */ (new GeneradorDatos());
    g.configuracion = Object.assign({ generarPercentiles: false, indiceFiabilidad: 'alfa', heterogeneidadItems: 'ninguna', variablesPorTest: { R: { variable: 'Q', rIntra: 0 } },
        pruebas: [p], sociodemograficos: [], correlaciones: [], diferenciasGrupo: [], modelos: [], medidasRepetidas: [], niveles: [], paneles: [], histeresis: [], estructuras: [], desenlaces: [], cortes: [], concordancias: [], realismo: {} }, extra);
    g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas);
    return g;
}

test('la calibración de la fiabilidad: con 4 ítems y n = 1500, el α realizado varía entre semillas como su error de muestreo (antes, 2,3 veces más)', () => {
    const p = { nombre: 'Calma', nombreCorto: 'CA', prueba: 'R', tipo: 'dimension', numItems: 4, media: 12, desviacion: 2.7, minimo: 1, maximo: 5, alfa: 0.66, distribucion: 'normal', invertidos: 0 };
    const v = [];
    for (let s = 1; s <= 8; s++) { const g = generador(JSON.parse(JSON.stringify(p)), { tamanoMuestra: 1500, semilla: 70 + s, correlacionesExactas: true }); v.push(parseFloat(g.informePedidoObtenido(g.generarBaseDatos()).find((/** @type {any} */ f) => f.tipo === 'α').obtenido)); }
    const m = v.reduce((a, b) => a + b, 0) / v.length, de = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)), feldt = 0.34 * Math.sqrt(8 / (3 * 1500));
    assert.ok(de < 1.6 * feldt, `DE entre semillas ${de.toFixed(4)} (Feldt ${feldt.toFixed(4)})`);
    assert.ok(Math.abs(m - 0.66) < 0.02, `media ${m}`);
});

test('una escala de acierto/error de 4 ítems (un total de 5 valores): su estabilidad de 0,76 se cumple también en modo no exacto (antes, 0,69)', () => {
    const p = { nombre: 'Lectura', nombreCorto: 'LE', prueba: 'R', tipo: 'dimension', numItems: 4, media: 2, desviacion: 1, minimo: 0, maximo: 1, alfa: 0.7, distribucion: 'normal', invertidos: 0, dificultades: [0.35, 0.45, 0.55, 0.65] };
    for (const semilla of [3, 4]) {
        const g = generador(JSON.parse(JSON.stringify(p)), { tamanoMuestra: 1500, semilla, correlacionesExactas: false, medidasRepetidas: [{ variable: 'Lectura', ondas: 2, estabilidad: 0.76, cambio: 0, agrupacion: '', cambioGrupo: null, modelo: 'ar1', dePendientes: 0, rInterceptoPendiente: 0 }] });
        assert.deepEqual(g.validarConfiguracion().errores, []);
        const f = g.informePedidoObtenido(g.generarBaseDatos()).find((/** @type {any} */ x) => x.tipo === 'r_tt');
        assert.ok(Math.abs(parseFloat(f.obtenido) - 0.76) < 0.04, `estabilidad ${f.obtenido}`);
    }
});

test('una escala asimétrica cerca del máximo (2026.12.04): su DE se cumple en los dos modos (antes, un 14 % por debajo)', () => {
    const p = { nombre: 'Autoestima', nombreCorto: 'AU', prueba: 'R', tipo: 'dimension', numItems: 9, media: 24.2, desviacion: 4.99, minimo: 0, maximo: 4, alfa: 0.8, distribucion: 'asimetrica', invertidos: 0 };
    for (const exactas of [false, true]) {
        const des = [3, 4].map(semilla => { const g = generador(JSON.parse(JSON.stringify(p)), { tamanoMuestra: 1500, semilla, correlacionesExactas: exactas }); return parseFloat(g.informePedidoObtenido(g.generarBaseDatos()).find((/** @type {any} */ f) => f.tipo === 'DE').obtenido); });
        const media = (des[0] + des[1]) / 2;
        assert.ok(Math.abs(media / 4.99 - 1) < 0.06, `${exactas ? 'exacto' : 'no exacto'}: DE ${des.join(' / ')}`);
    }
});

test('revisión de la 2026.12.06: con una DE no positiva (una escala a medio configurar), la transformación de la escala no da NaN', () => {
    const p = { nombre: 'Borrador', nombreCorto: 'BO', prueba: 'R', tipo: 'dimension', numItems: 5, media: 15, desviacion: 0, minimo: 1, maximo: 5, alfa: 0.8, distribucion: 'normal', invertidos: 0 };
    const g = generador(p, { tamanoMuestra: 10, semilla: 1, correlacionesExactas: true });
    assert.ok([-2, 0, 2].every(z => Number.isFinite(g._txDe('Borrador').tx(z))));
});

