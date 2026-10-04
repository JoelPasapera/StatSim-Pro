// tests/integration/influencia-grupo.test.js — «la r depende de pocos casos» en la F3 (revisión 2026.11.12): caso a caso y en
// grupo (MCD), calibrados con las mismas remuestras de la nula (cópula gaussiana con las marginales observadas), cada prueba
// al 2,5 % (Bonferroni). Antes, con marginales asimétricas y n = 30, la regla caso a caso saltaba en el 30–35 % de las muestras;
// y un grupo de atípicos juntos (fase B4 del Simulador) se enmascaraba.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { influenciaLineal } from '../../src/analizador/relaciones/nube.js';
import { calibrarInfluencia } from '../../src/analizador/relaciones/mcd.js';
import { GeneradorDatos } from '../../src/simulador/dominio/generador.js';
import { parrafoNube } from '../../src/analizador/relaciones/nube-redaccion.js';
import { diagnosticarForma } from '../../src/analizador/relaciones/diagnostico-forma.js';

let a = 29 >>> 0; const u = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const nrm = () => Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u());
const muestra = (n, r, tr) => { const x = new Float64Array(n), y = new Float64Array(n); for (let i = 0; i < n; i++) { const z1 = nrm(), z2 = r * z1 + Math.sqrt(1 - r * r) * nrm(); x[i] = Math.round(tr(z1)); y[i] = Math.round(tr(z2)); } return [x, y]; };
const esc = (nombre, corto) => ({ nombre, nombreCorto: corto, prueba: 'T', tipo: 'dimension', numItems: 10, media: 30, desviacion: 6, minimo: 1, maximo: 5, alfa: 0.85, distribucion: 'normal', invertidos: 0 });
function simulador(rMay, rCon, k, n, semilla) {
    const g = new GeneradorDatos(); g.configuracion = { tamanoMuestra: n, semilla, generarPercentiles: false, correlacionesExactas: true, indiceFiabilidad: 'alfa', heterogeneidadItems: 'leve', variablesPorTest: { T: { variable: 'R', rIntra: 0 } }, pruebas: [esc('Estrés', 'ES'), esc('Apoyo', 'AP')], sociodemograficos: [], correlaciones: [{ a: 'Estrés', b: 'Apoyo', r: rMay }], atipicos: [{ x: 'Estrés', y: 'Apoyo', rMayoria: rMay, rCon, casos: k }], diferenciasGrupo: [], modelos: [], medidasRepetidas: [], estructuras: [], desenlaces: [], cortes: [], concordancias: [], realismo: {} };
    g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas);
    const b = g.generarBaseDatos(); return [Float64Array.from(b.columna('Dimension_ES').datos), Float64Array.from(b.columna('Dimension_AP').datos)];
}

test('falsas alarmas controladas también con marginales asimétricas (antes, 30–35 % con n = 30)', () => {
    for (const [nombre, tr] of [['asimétrica', z => 12 + 6 * Math.exp(0.6 * z)], ['normal', z => 30 + 6 * z]]) {
        let alarmas = 0; const R = 80;
        for (let i = 0; i < R; i++) { const [x, y] = muestra(30, 0.3, tr); if (influenciaLineal(x, y).sensible) alarmas++; }
        assert.ok(alarmas / R <= 0.1, `${nombre}: ${alarmas} de ${R}`);
    }
});

test('los grupos de atípicos del Simulador: se detectan y las filas plantadas están, las primeras, entre las del grupo', () => {
    for (const [rMay, rCon, k] of [[0.05, 0.5, 5], [0.5, 0.05, 3]]) {
        let detectados = 0;
        for (let s = 0; s < 8; s++) {
            const [x, y] = simulador(rMay, rCon, k, 60, 40 + s), inf = influenciaLineal(x, y), plantadas = Array.from({ length: k }, (_, j) => 60 - k + j + 1);
            if (inf.sensible) detectados++;
            assert.deepEqual([...inf.grupo.filas.slice(0, k)].sort((p, q) => p - q), plantadas, `las plantadas, las más alejadas: ${inf.grupo.filas}`);
        }
        assert.ok(detectados >= 6, `${rMay} → ${rCon}: detectados ${detectados} de 8`);
    }
});

test('sin influencia práctica no se remuestrea; fuera de 20–5000 casos no aplica; el enmascaramiento se explica en el texto', () => {
    const [x, y] = muestra(100, 0.4, z => 30 + 6 * z), c = calibrarInfluencia(x, y, { casoACaso: () => 0 });
    assert.ok(c.grupo.delta < 0.1 ? c.grupo.p === null : true);
    assert.equal(calibrarInfluencia(x.slice(0, 15), y.slice(0, 15)).grupo.aplica, false);
    const [xs, ys] = simulador(0.05, 0.5, 5, 60, 41), d = diagnosticarForma(Array.from(xs), Array.from(ys), { B: 49, Bnube: 99 });
    assert.ok(d.nube.influencia.enmascarados, 'enmascarado caso a caso');
    assert.match(parrafoNube(d.nube, 'Estrés', 'Apoyo'), /Sin embargo, un grupo de \d+ casos fuera de la elipse de la mayoría \(filas 5\d.*de más a menos alejados\).*enmascaramiento.*Rousseeuw, 1984.*Hubert et al\., 2012/);
});
