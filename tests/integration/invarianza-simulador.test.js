// tests/integration/invarianza-simulador.test.js — el círculo cerrado del paso 6A: el Simulador genera una diferencia de
// sexo (d = .5) en una escala y ninguna en otra; el Analizador sostiene la invarianza y recupera las medias latentes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeneradorDatos } from '../../src/simulador/dominio/generador.js';
import { analizarInvarianza } from '../../src/analizador/psicometria/invarianza.js';
import { SEM } from '../../src/analizador/sem-motor.js';

test('Simulador (d = .5 en Estrés según Sexo) → invarianza sostenida y d latente recuperada; sin diferencia en Apoyo', () => {
    const esc = (nombre, corto) => ({ nombre, nombreCorto: corto, prueba: 'T', tipo: 'dimension', numItems: 8, media: 24, desviacion: 5, minimo: 1, maximo: 5, alfa: 0.85, distribucion: 'normal', invertidos: 0 });
    const g = new GeneradorDatos();
    g.configuracion = { tamanoMuestra: 800, semilla: 21, generarPercentiles: false, correlacionesExactas: true, indiceFiabilidad: 'alfa', heterogeneidadItems: 'leve', variablesPorTest: { T: { variable: 'Rasgo', rIntra: 0.4 } },
        pruebas: [esc('Estrés', 'ES'), esc('Apoyo', 'AP')], sociodemograficos: [{ categoria: 'Sexo', categoriaCorta: 'Sx', distribucion: 'categorica', promedio: 0, desviacion: 1, minimo: 1, maximo: 2, decimales: 0 }],
        correlaciones: [], diferenciasGrupo: [{ cuantitativa: 'Estrés', agrupacion: 'Sexo', d: 0.5 }], modelos: [], medidasRepetidas: [], estructuras: [], desenlaces: [], cortes: [], concordancias: [], realismo: {} };
    g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas);
    const filas = g.generarBaseDatos().aObjetos();
    const r = analizarInvarianza(SEM.parsear(['ES', 'AP'].map(s => s + ' =~ ' + [1, 2, 3, 4, 5, 6, 7, 8].map(i => s + i).join(' + ')).join('\n')), filas, 'Sexo');
    assert.ok(!r.error, r.error);
    assert.deepEqual(r.niveles.map(R => R.decision), ['base', 'se sostiene', 'se sostiene']);
    const es = r.medias.find(m => m.factor === 'ES'), ap = r.medias.find(m => m.factor === 'AP');
    assert.ok(Math.abs(Math.abs(es.d) - 0.5) < 0.15 && es.p < 0.001, `d latente de Estrés ${es.d}`);
    assert.ok(Math.abs(ap.d) < 0.15 && ap.p > 0.05, `Apoyo sin diferencia: d ${ap.d}`);
});
