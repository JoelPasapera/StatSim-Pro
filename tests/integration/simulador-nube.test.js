// tests/integration/simulador-nube.test.js — fase B del Atlas en el Simulador (2026.11.04): la nube de una relación.
// El informe verifica cada nube y, en círculo cerrado, la F3 del Analizador reconoce lo generado sin saber qué se pidió.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeneradorDatos } from '../../src/simulador/dominio/generador.js';
import { diagnosticarForma } from '../../src/analizador/relaciones/diagnostico-forma.js';

const esc = (nombre, corto, dist = 'normal') => ({ nombre, nombreCorto: corto, prueba: 'T', tipo: 'dimension', numItems: 10, media: 30, desviacion: 6, minimo: 1, maximo: 5, alfa: 0.85, distribucion: dist, invertidos: 0 });
const pear = (a, b) => { const n = a.length, ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n; let ab = 0, aa = 0, bb = 0; for (let i = 0; i < n; i++) { ab += (a[i] - ma) * (b[i] - mb); aa += (a[i] - ma) ** 2; bb += (b[i] - mb) ** 2; } return ab / Math.sqrt(aa * bb); };
function generar(modelo, { distX = 'normal', n = 600, semilla = 11, tercera = null, exacto = true } = {}) {
    const g = new GeneradorDatos();
    g.configuracion = { tamanoMuestra: n, semilla, generarPercentiles: false, correlacionesExactas: exacto, indiceFiabilidad: 'alfa', heterogeneidadItems: 'leve', variablesPorTest: { T: { variable: 'R', rIntra: 0 } },
        pruebas: [esc('Estrés', 'ES', distX), esc('Apoyo', 'AP'), esc('Calma', 'CA')], sociodemograficos: [], correlaciones: tercera ? [{ a: 'Apoyo', b: 'Calma', r: tercera }] : [], diferenciasGrupo: [], modelos: [modelo],
        medidasRepetidas: [], estructuras: [], desenlaces: [], cortes: [], concordancias: [], realismo: {} };
    g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas);
    const v = g.validarConfiguracion(), b = g.generarBaseDatos(), col = c => Array.from(b.columna(c).datos);
    return { v, filas: g.informePedidoObtenido(b).filter(f => f.variable.includes('Estrés → Apoyo')), x: col('Dimension_ES'), y: col('Dimension_AP'), c: col('Dimension_CA') };
}
const recta = (eta, nube, extra = {}) => ({ tipo: 'forma', forma: eta < 0 ? 'recta-dec' : 'recta', x: 'Estrés', y: 'Apoyo', eta: Math.abs(eta), nube, desdeLineal: true, ...extra });

test('cada nube: el informe verifica la fuerza exacta, la ρ con el residuo de la nube y la propia nube', () => {
    for (const [nombre, modelo, op] of [['abanico que se abre', recta(0.5, 'abanico-abre'), {}], ['triángulo', recta(0.65, 'triangulo'), { distX: 'uniforme' }], ['triángulo decreciente', recta(-0.6, 'triangulo'), { distX: 'uniforme' }],
        ['U con abanico que se cierra', { tipo: 'forma', forma: 'u', x: 'Estrés', y: 'Apoyo', eta: 0.5, nube: 'abanico-cierra' }, {}], ['abanico sin relación en la media', recta(0, 'abanico-abre'), {}]]) {
        const r = generar(modelo, op);
        assert.deepEqual(r.v.errores, [], nombre);
        assert.deepEqual(r.filas.map(f => [f.tipo, f.ok]), [['η', true], ['r', true], ['ρ', true], ['nube', true]], `${nombre}: ` + r.filas.map(f => `${f.tipo} ${f.pedido}→${f.obtenido}`).join(' | '));
    }
});

test('círculo cerrado con la F3 del Analizador: reconoce el abanico, el triángulo (con su condición necesaria) y la U con abanico', () => {
    const ab = generar(recta(0.5, 'abanico-abre')), dAb = diagnosticarForma(ab.x, ab.y, { B: 49, Bnube: 199 }).nube;
    assert.ok(dAb.heterocedasticidad.hay && dAb.heterocedasticidad.bp.sube && dAb.patron.patron === 'abanico', JSON.stringify(dAb.patron));
    for (const eta of [0.65, -0.6]) {
        const tr = generar(recta(eta, 'triangulo'), { distX: 'uniforme' }), dTr = diagnosticarForma(tr.x, tr.y, { B: 49, Bnube: 199 }).nube;
        assert.ok(dTr.patron.patron === 'techo' && dTr.necesaria && dTr.necesidad.direccion === Math.sign(eta), `triángulo con r = ${eta}: ${JSON.stringify(dTr.patron)}, necesaria ${dTr.necesaria}`);
    }
    const u = generar({ tipo: 'forma', forma: 'u', x: 'Estrés', y: 'Apoyo', eta: 0.6, nube: 'abanico-cierra' }), dU = diagnosticarForma(u.x, u.y, { B: 49, Bnube: 199 });
    assert.equal(dU.descripcion.grupo, 'no-monotonica');
    assert.ok(dU.nube.heterocedasticidad.hay && !dU.nube.heterocedasticidad.bp.sube, 'la dispersión decrece');
    assert.deepEqual([dU.nube.patron.patron, dU.nube.patron.motivo], ['no-aplica', 'no-monotona'], 'con una U, los bordes rectos no se evalúan');
});

test('la nube conserva las correlaciones de Y con terceras variables (compensación κ)', () => {
    for (const [modelo, op] of [[recta(0.5, 'abanico-abre'), {}], [recta(0.6, 'triangulo'), { distX: 'uniforme' }]]) {
        const r = generar(modelo, { ...op, tercera: 0.4 });
        assert.ok(Math.abs(pear(r.y, r.c) - 0.4) < 0.02, `${modelo.nube}: r(Apoyo, Calma) = ${pear(r.y, r.c)}`);
    }
});

test('validación del triángulo: exige una relación lineal no nula y avisa si la fuerza se aleja de la natural', () => {
    assert.ok(generar({ tipo: 'forma', forma: 'u', x: 'Estrés', y: 'Apoyo', eta: 0.5, nube: 'triangulo' }).v.errores.some(e => /se genera sobre una relación lineal/.test(e)));
    assert.ok(generar(recta(0, 'triangulo'), { distX: 'uniforme' }).v.errores.some(e => /necesita una relación/.test(e)));
    // el aviso sigue a la inclinación PREVISTA del borde inferior (|b10/b90| > .25), la misma que compara el informe
    assert.ok(generar(recta(0.25, 'triangulo'), { distX: 'uniforme' }).v.advertencias.some(a => /su borde inferior bajará/.test(a)));
    assert.ok(generar(recta(0.8, 'triangulo')).v.advertencias.some(a => /su borde inferior subirá \(su pendiente será ≈ 44 %/.test(a)), 'X normal y |r| = .80');
    assert.ok(!generar(recta(0.65, 'triangulo'), { distX: 'uniforme' }).v.advertencias.some(a => /su borde inferior/.test(a)), 'con la fuerza natural, sin aviso');
});

test('modo no exacto: la nube también se genera (normalización teórica de g·φ)', () => {
    const r = generar(recta(0.5, 'abanico-abre'), { exacto: false, n: 2000 });
    assert.ok(r.filas.find(f => f.tipo === 'nube').ok, JSON.stringify(r.filas.find(f => f.tipo === 'nube')));
    assert.ok(Math.abs(pear(r.x, r.y) - 0.5) < 0.06);
});

test('revisión 2026.11.05: el recorte esperado tiene en cuenta la nube (antes suponía una nube homogénea: 2,7 % frente a 5,4 % reales en un triángulo)', async () => {
    const { recorteEsperado, aplicarForma, uVentana } = await import('../../src/simulador/dominio/formas-relacion.js');
    const { gNube, momentosNube, nubePorId } = await import('../../src/simulador/dominio/nubes-relacion.js');
    const g = new GeneradorDatos(), Phi = z => g.normalCDF(z), tx = z => g.transformarFormaZ(z, 'uniforme'), eta = 0.55;
    let a = 7 >>> 0; const u01 = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const nrm = () => Math.sqrt(-2 * Math.log(u01() || 1e-12)) * Math.cos(2 * Math.PI * u01());
    const sinNube = recorteEsperado('recta', eta, tx, -2.5, 2, Phi);
    for (const nube of ['abanico-abre', 'triangulo']) {
        const N = nubePorId(nube), mom = momentosNube(nube, 'recta', tx, null, 1), est = recorteEsperado('recta', eta, tx, -2.5, 2, Phi, { g: u => gNube(nube, u, 1), norma: mom.norma, acotada: !!N.acotada });
        const n = 150000, x = Float64Array.from({ length: n }, () => tx(nrm())), u = uVentana(x), fx = aplicarForma('recta', x);
        let mf = 0; for (const v of fx) mf += v; mf /= n; let vf = 0; for (const v of fx) vf += (v - mf) ** 2; const sf = Math.sqrt(vf / n); let fuera = 0;
        for (let i = 0; i < n; i++) { const e = nrm(), y = eta * (fx[i] - mf) / sf + Math.sqrt(1 - eta * eta) * (N.acotada ? Phi(e) - 0.5 : e) * gNube(nube, u[i], 1) / mom.norma; if (y < -2.5 || y > 2) fuera++; }
        assert.ok(Math.abs(est - fuera / n) < 0.003, `${nube}: estimado ${est} frente a ${fuera / n}`);
        assert.ok(est > sinNube + 0.005, `${nube}: la nube aumenta el recorte (${est} frente a ${sinNube})`);
    }
});

test('revisión 2026.11.05: robustez entre semillas — informe completo ✓ y la F3 reconoce la nube en casi todas', () => {
    for (const [modelo, op, reconocida] of [[recta(0.5, 'abanico-abre'), {}, d => d.nube.heterocedasticidad.hay && d.nube.patron.patron === 'abanico'], [recta(0.65, 'triangulo'), { distX: 'uniforme' }, d => d.nube.patron.patron === 'techo' && d.nube.necesaria]]) {
        let informeOk = 0, bien = 0;
        for (let s = 0; s < 8; s++) {
            const r = generar(modelo, { ...op, n: 400, semilla: 300 + s });
            if (r.filas.every(f => f.ok !== false)) informeOk++;
            if (reconocida(diagnosticarForma(r.x, r.y, { B: 19, Bnube: 99 }))) bien++;
        }
        assert.equal(informeOk, 8, `${modelo.nube}: informe completo en ${informeOk} de 8`);
        assert.ok(bien >= 7, `${modelo.nube}: la F3 la reconoce en ${bien} de 8`);
    }
});
