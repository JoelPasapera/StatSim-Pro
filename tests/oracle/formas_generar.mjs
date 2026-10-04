// tests/oracle/formas_generar.mjs — genera con el Simulador una malla de bases con relaciones con forma (las 17 curvas
// no lineales del atlas, X normal y uniforme, η .6 y .9, n 500) y la guarda en el directorio temporal para formas_oraculo.py, que la
// analiza de forma INDEPENDIENTE (NumPy/SciPy, funciones reescritas desde las ecuaciones del atlas).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GeneradorDatos } from '../../src/simulador/dominio/generador.js';
import { FORMAS_RELACION, esFormaCompuesta } from '../../src/simulador/dominio/formas-relacion.js';

const esc = (nombre, corto, dist = 'normal') => ({ nombre, nombreCorto: corto, prueba: 'T', tipo: 'dimension', numItems: 8, media: 24, desviacion: 5, minimo: 1, maximo: 5, alfa: 0.85, distribucion: dist, invertidos: 0 });
const bases = [];
let semilla = 500;
for (const forma of FORMAS_RELACION.filter(f => esFormaCompuesta(f.id)).map(f => f.id)) for (const dist of ['normal', 'uniforme']) for (const eta of [0.6, 0.9]) {
    const g = new GeneradorDatos();
    g.configuracion = { tamanoMuestra: 500, semilla: semilla++, generarPercentiles: false, correlacionesExactas: true, indiceFiabilidad: 'alfa', heterogeneidadItems: 'leve', variablesPorTest: { T: { variable: 'R', rIntra: 0.3 } },
        pruebas: [esc('Estrés', 'ES', dist), esc('Apoyo', 'AP'), esc('Calma', 'CA')], sociodemograficos: [], correlaciones: [{ a: 'Apoyo', b: 'Calma', r: 0.35 }], diferenciasGrupo: [],
        modelos: [{ tipo: 'forma', forma, x: 'Estrés', y: 'Apoyo', eta }], medidasRepetidas: [], estructuras: [], desenlaces: [], cortes: [], concordancias: [], realismo: {} };
    g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas);
    const v = g.validarConfiguracion();
    if (v.errores.length) { console.error('ERROR de validación', forma, dist, eta, v.errores); process.exitCode = 1; continue; }
    const b = g.generarBaseDatos(), c = k => Array.from(b.columna(k).datos);
    bases.push({ forma, dist, eta, aviso: v.advertencias.some(a => /caerían fuera del rango|solo puede estar entre|cerca del límite alcanzable/.test(a)),
        x: c('Dimension_ES'), y: c('Dimension_AP'), z: c('Dimension_CA'), items: Array.from({ length: 8 }, (_, j) => c('AP' + (j + 1))) });
}
fs.writeFileSync(path.join(os.tmpdir(), 'statsim_formas_bases.json'), JSON.stringify(bases));
console.log(`${bases.length} bases generadas`);
