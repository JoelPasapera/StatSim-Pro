import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeneradorDatos } from '../../src/simulador/dominio/generador.js';

test('el generador aleatorio es reproducible por semilla y sus distribuciones tienen la media esperada', () => {
    const g = new GeneradorDatos(); g.inicializarAleatorio(7);
    const a = Array.from({ length: 5 }, () => g.aleatorio());
    g.inicializarAleatorio(7);
    const b = Array.from({ length: 5 }, () => g.aleatorio());
    assert.deepEqual(a, b);
    let s = 0; for (let i = 0; i < 20000; i++) s += g.generarPoisson(150);
    assert.ok(Math.abs(s / 20000 - 150) < 1, 'Poisson λ = 150');
    let z = 0, z2 = 0; for (let i = 0; i < 20000; i++) { const v = g.generarNormalEstandar(); z += v; z2 += v * v; }
    assert.ok(Math.abs(z / 20000) < 0.03 && Math.abs(z2 / 20000 - 1) < 0.05, 'normal estándar');
});

test('la validación es autosuficiente: rechaza entradas imposibles sin la interfaz', () => {
    const g = new GeneradorDatos();
    g.configuracion = { tamanoMuestra: 5000000, semilla: 1, pruebas: [{ nombre: 'A', nombreCorto: 'A', prueba: 'T', tipo: 'dimension', numItems: 5, media: 15, desviacion: 3, alfa: 1.2, minimo: 1, maximo: 5, distribucion: 'normal', invertidos: 9 }], sociodemograficos: [], correlaciones: [{ a: 'A', b: 'A', r: 1.5 }], diferenciasGrupo: [], modelos: [], medidasRepetidas: [], estructuras: [], desenlaces: [], cortes: [], concordancias: [], gruposPruebas: [], realismo: {} };
    g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas);
    const v = g.validarConfiguracion();
    for (const patron of [/máximo es 1 000 000/, /entre 0 y 1/, /invertidos/, /consigo misma/]) assert.ok(v.errores.some(e => patron.test(e)), 'falta el error ' + patron);
});
