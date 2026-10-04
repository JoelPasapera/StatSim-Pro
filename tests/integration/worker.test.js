import { test } from 'node:test';
import assert from 'node:assert/strict';
import { manejarMensaje } from '../../src/simulador/worker/generador.worker.js';
import { BaseColumnar } from '../../src/core/data/base-columnar.js';

const escala = (nombre, corto, prueba, k, media, de, alfa, extra = {}) => ({ nombre, nombreCorto: corto, prueba, tipo: 'dimension', numItems: k, media, desviacion: de, alfa, minimo: 1, maximo: 5, distribucion: 'normal', invertidos: 0, ...extra });
const configuracion = { tamanoMuestra: 800, semilla: 11, generarPercentiles: true, correlacionesExactas: true, indiceFiabilidad: 'alfa', heterogeneidadItems: 'leve', variablesPorTest: { 'EQ-i': { variable: 'IE', rIntra: 0.4 } },
    pruebas: [escala('Percepción', 'PE', 'EQ-i', 8, 24, 4, 0.8), escala('Comprensión', 'CE', 'EQ-i', 8, 24, 4, 0.85, { invertidos: 3 }), escala('Estrés', 'ST', 'PSS', 10, 30, 6, 0.8), { nombre: 'Aptitud', nombreCorto: 'AP', prueba: 'Examen', tipo: 'dimension', numItems: 10, media: 6, desviacion: 1, alfa: 0.75, minimo: 0, maximo: 1, distribucion: 'normal', invertidos: 0, dificultades: null }],
    sociodemograficos: [{ categoria: 'Edad', categoriaCorta: 'E', distribucion: 'normal', promedio: 20, desviacion: 3, minimo: 15, maximo: 30, decimales: 0 }, { categoria: 'Sexo', categoriaCorta: 'S', distribucion: 'binaria', promedio: 0.4, niveles: [{ codigo: 0, etiqueta: 'Femenino', proporcion: 0.6 }, { codigo: 1, etiqueta: 'Masculino', proporcion: 0.4 }] }],
    correlaciones: [{ a: 'Percepción', b: 'Estrés', r: -0.4 }], diferenciasGrupo: [{ tipo: 'd', cuantitativa: 'Estrés', agrupacion: 'Sexo', d: 0.6 }], modelos: [], medidasRepetidas: [{ variable: 'Estrés', ondas: 2, estabilidad: 0.7, cambio: 0.3, agrupacion: '', cambioGrupo: null, modelo: 'ar1' }], estructuras: [], desenlaces: [], cortes: [{ variable: 'Estrés', etiquetas: ['Bajo', 'Alto'], cortes: [32], porPercentil: false }], concordancias: [{ tipo: 'jueces', variable: 'Estrés', jueces: 2, kappa: 0.7, icc: null }], gruposPruebas: [], realismo: { pctPerdidos: 3, mecanismoPerdidos: 'MCAR', pctDescuidados: 2, tipoDescuidado: 'mixto', marcarDescuidados: true, pctDigitacion: 1 } };

test('el Worker genera, informa y su mensaje se puede clonar (con una escala dicotómica)', () => {
    const mensajes = [];
    manejarMensaje({ id: 1, configuracion }, (m, transfer) => { structuredClone(m); mensajes.push({ m, transfer }); });
    const error = mensajes.find(x => x.m.tipo === 'error');
    assert.equal(error, undefined, error && error.m.mensaje);
    const listo = mensajes.find(x => x.m.tipo === 'listo');
    const base = BaseColumnar.desdeSerializado(listo.m.base);
    assert.equal(base.n, 800);
    for (const c of ['General_ST_T2', 'Juez1_ST', 'AP1', 'Nivel_ST']) assert.ok(base.nombres().includes(c), 'falta ' + c);
    assert.equal(typeof base.fila(0).Sexo, 'string');
    assert.ok(listo.m.informe.length > 10);
    assert.ok(mensajes.filter(x => x.m.tipo === 'progreso').length > 0);
});
