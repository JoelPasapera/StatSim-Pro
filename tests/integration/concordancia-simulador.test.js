// tests/integration/concordancia-simulador.test.js — el círculo cerrado: el Simulador genera jueces con un κ y un CCI
// objetivo y el Analizador (paso 5B) los recupera de la base.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeneradorDatos } from '../../src/simulador/dominio/generador.js';
import { detectarEvaluadores, analizarConcordancia } from '../../src/analizador/psicometria/concordancia-ui.js';

test('jueces del Simulador (κ = .60 con 3 jueces; CCI = .80 con 2) recuperados por el Analizador', () => {
    const esc = (nombre, corto) => ({ nombre, nombreCorto: corto, prueba: 'T', tipo: 'dimension', numItems: 8, media: 24, desviacion: 5, minimo: 1, maximo: 5, alfa: 0.85, distribucion: 'normal', invertidos: 0 });
    const g = new GeneradorDatos();
    g.configuracion = { tamanoMuestra: 2000, semilla: 12, generarPercentiles: false, correlacionesExactas: true, indiceFiabilidad: 'alfa', heterogeneidadItems: 'leve', variablesPorTest: { T: { variable: 'Rasgo', rIntra: 0.4 } },
        pruebas: [esc('Estrés', 'ES'), esc('Percepción', 'PE')], sociodemograficos: [], correlaciones: [], diferenciasGrupo: [], modelos: [], medidasRepetidas: [], estructuras: [], desenlaces: [],
        cortes: [{ variable: 'Estrés', etiquetas: ['Bajo', 'Medio', 'Alto'], cortes: [20, 28], porPercentil: false }],
        concordancias: [{ tipo: 'jueces', variable: 'Estrés', jueces: 3, kappa: 0.6 }, { tipo: 'juecesContinuo', variable: 'Percepción', jueces: 2, icc: 0.8 }], realismo: {} };
    g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas);
    const filas = g.generarBaseDatos().aObjetos();
    const conjuntos = detectarEvaluadores(filas);
    assert.ok(conjuntos.length >= 2, 'detecta los dos conjuntos: ' + conjuntos.map(c => c.etiqueta).join(' | '));
    const cat = conjuntos.find(c => c.columnas.length === 3), con = conjuntos.find(c => c.columnas.length === 2);
    const rk = analizarConcordancia(filas, cat.columnas, 'auto', { B: 200 }), ri = analizarConcordancia(filas, con.columnas, 'auto');
    assert.equal(rk.kappa.tipo, 'fleiss'); assert.ok(Math.abs(rk.kappa.valor - 0.6) < 0.06, 'κ recuperado: ' + rk.kappa.valor.toFixed(3));
    const icc = Math.max(...ri.cci.formas.slice(0, 3).map(f => f.valor));
    assert.ok(ri.cci && Math.abs(ri.cci.formas[2].valor - 0.8) < 0.05, 'CCI recuperado: ' + ri.cci.formas.map(f => f.clave + ' ' + f.valor.toFixed(3)).join(' '));
    assert.ok(icc <= 1);
});
