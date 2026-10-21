// @ts-check
// tests/integration/modo-no-exacto.test.js — el informe en modo no exacto (2026.12.02): tolerancias de muestreo (sin falsas
// alarmas y sin perder potencia) y el fallo de la matriz intermedia con los efectos de conglomerado que destaparon.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GeneradorDatos } from '../../src/simulador/dominio/generador.js';

/** @param {object} cfg @param {boolean} exactas */
function generador(cfg, exactas) {
    const g = /** @type {any} */ (new GeneradorDatos());
    g.configuracion = JSON.parse(JSON.stringify(cfg)); g.configuracion.correlacionesExactas = exactas;
    g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas);
    return g;
}
/** @param {string} nombre @param {string} corto */
const esc = (nombre, corto) => ({ nombre, nombreCorto: corto, prueba: 'T', tipo: 'dimension', numItems: 10, media: 30, desviacion: 6, minimo: 1, maximo: 5, alfa: 0.8, distribucion: 'normal', invertidos: 0 });
/** @param {number} semilla @param {number} r */
const simple = (semilla, r) => ({ tamanoMuestra: 200, semilla, generarPercentiles: false, indiceFiabilidad: 'alfa', heterogeneidadItems: 'leve', variablesPorTest: { T: { variable: 'R', rIntra: 0 } },
    pruebas: [esc('Estrés', 'ES'), esc('Sueño', 'SU')], sociodemograficos: [], correlaciones: [{ a: 'Estrés', b: 'Sueño', r }], diferenciasGrupo: [], modelos: [], medidasRepetidas: [], niveles: [], paneles: [], histeresis: [], estructuras: [], desenlaces: [], cortes: [], concordancias: [], realismo: {} });

test('sin falsas alarmas: 20 semillas en modo no exacto (n = 200) dan como mucho una base con alguna ✗ (antes, la mitad)', () => {
    let conX = 0;
    for (let s = 1; s <= 20; s++) { const g = generador(simple(300 + s, 0.4), false); if (g.informePedidoObtenido(g.generarBaseDatos()).some((/** @type {any} */ f) => f.ok === false)) conX++; }
    assert.ok(conX <= 1, `${conX} bases con alguna ✗`);
});

test('sin perder potencia: datos con r = 0,1 comparados con una r pedida de 0,5 salen ✗', () => {
    const g = generador(Object.assign(simple(41, 0.1), { tamanoMuestra: 300 }), false), b = g.generarBaseDatos();
    g.configuracion.correlaciones[0].r = 0.5;
    const fila = g.informePedidoObtenido(b).find((/** @type {any} */ f) => f.tipo === 'r' && /Estrés ↔ Sueño/.test(f.variable));
    assert.equal(fila.ok, false);
});

test('el fallo de la matriz intermedia: con una CCI por un Aula de 12 niveles, la r de los latentes entre ondas ya no sale negativa', () => {
    const cfg = JSON.parse(fs.readFileSync(new URL('./datos-cfg-icc-ondas.json', import.meta.url), 'utf8'));
    cfg.niveles = [];
    for (const exactas of [false, true]) {
        const g = generador(cfg, exactas);
        assert.deepEqual(g.validarConfiguracion().errores, []);
        const inf = g.informePedidoObtenido(g.generarBaseDatos());
        const vars = g.correlVariables, L = g.correlL, i1 = vars.findIndex((/** @type {any} */ v) => v.nombre === 'Depresión'), i2 = vars.findIndex((/** @type {any} */ v) => /Depresión \(T2\)/.test(v.nombre));
        let rho = 0; for (let k = 0; k < L[i1].length; k++) rho += L[i1][k] * (L[i2][k] || 0);
        // la r dentro de las aulas que pide el total es (0,36 − b)/(s·s) ≈ 0,244 (2026.12.02: antes, −0,49 por la covarianza de la CCI);
        // como Depresión es de acierto/error con 4 ítems (un total de 5 valores), la matriz la lleva a la escala de los latentes
        // compensando la discretización (2026.12.03): 0,2591
        assert.ok(Math.abs(rho - 0.2591) < 0.003, `ρ de los latentes ${rho}`);
        const rtt = inf.filter((/** @type {any} */ f) => f.tipo === 'r_tt' && /Depresión/.test(f.variable));
        assert.ok(rtt.length === 2 && rtt.every((/** @type {any} */ f) => f.ok === true), `${exactas ? 'exacto' : 'no exacto'}: ${rtt.map((/** @type {any} */ f) => f.obtenido).join(', ')}`);
    }
});

test('muestras pequeñas (2026.12.04): con n = 40 y una escala asimétrica en modo no exacto, la media, la DE y la fiabilidad casi nunca salen ✗ (antes, 9 de cada 100 α)', () => {
    let conX = 0;
    for (let s = 1; s <= 30; s++) {
        const cfg = Object.assign(simple(500 + s, 0.3), { tamanoMuestra: 40 });
        cfg.pruebas[1].distribucion = 'asimetrica';
        const g = generador(cfg, false);
        if (g.informePedidoObtenido(g.generarBaseDatos()).some((/** @type {any} */ f) => f.ok === false && ['Media', 'DE', 'α'].includes(f.tipo))) conX++;
    }
    assert.ok(conX <= 1, `${conX} bases con alguna ✗`);
});

