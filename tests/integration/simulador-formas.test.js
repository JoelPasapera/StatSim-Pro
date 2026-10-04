// tests/integration/simulador-formas.test.js — tipos de relación del Simulador (dimensión A del «Atlas de relaciones
// entre variables»): cada forma entrega la fuerza η pedida (r entre Y y la curva) sobre los valores finales, la r de
// Pearson que implica la forma (≈ 0 en una U), la Media y la DE de Y, y respeta las demás correlaciones pedidas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeneradorDatos } from '../../src/simulador/dominio/generador.js';
import { FORMAS_RELACION, esFormaCompuesta, aplicarForma, kappaForma } from '../../src/simulador/dominio/formas-relacion.js';

const esc = (nombre, corto, dist = 'normal') => ({ nombre, nombreCorto: corto, prueba: 'T', tipo: 'dimension', numItems: 8, media: 24, desviacion: 5, minimo: 1, maximo: 5, alfa: 0.85, distribucion: dist, invertidos: 0 });
const pear = (a, b) => { const n = a.length, ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n; let ab = 0, aa = 0, bb = 0; for (let i = 0; i < n; i++) { ab += (a[i] - ma) * (b[i] - mb); aa += (a[i] - ma) ** 2; bb += (b[i] - mb) ** 2; } return ab / Math.sqrt(aa * bb); };
function generar(modelos, { n = 500, semilla = 5, distX = 'normal', correlaciones = [{ a: 'Apoyo', b: 'Calma', r: 0.35 }] } = {}) {
    const g = new GeneradorDatos();
    g.configuracion = { tamanoMuestra: n, semilla, generarPercentiles: false, correlacionesExactas: true, indiceFiabilidad: 'alfa', heterogeneidadItems: 'leve', variablesPorTest: { T: { variable: 'Rasgo', rIntra: 0.3 } },
        pruebas: [esc('Estrés', 'ES', distX), esc('Apoyo', 'AP'), esc('Calma', 'CA')], sociodemograficos: [], correlaciones, diferenciasGrupo: [], modelos,
        medidasRepetidas: [], estructuras: [], desenlaces: [], cortes: [], concordancias: [], realismo: {} };
    g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas);
    return g;
}
const col = (base, c) => Array.from(base.columna(c).datos);

test('las 17 curvas no lineales del atlas: η exacta sobre los valores finales, Media y DE de Y intactas, tercera correlación respetada', () => {
    for (const F of FORMAS_RELACION.filter(f => esFormaCompuesta(f.id))) {
        const g = generar([{ tipo: 'forma', forma: F.id, x: 'Estrés', y: 'Apoyo', eta: 0.6 }]);
        const v = g.validarConfiguracion();
        assert.deepEqual(v.errores || [], [], F.id);
        const base = g.generarBaseDatos(), x = col(base, 'Dimension_ES'), y = col(base, 'Dimension_AP');
        assert.ok(Math.abs(pear(Array.from(aplicarForma(F.id, x)), y) - 0.6) < 0.005, `${F.id}: η`);
        const my = y.reduce((s, t) => s + t, 0) / y.length, sy = Math.sqrt(y.reduce((s, t) => s + (t - my) ** 2, 0) / (y.length - 1));
        // Formas de cola larga (casi toda la subida en pocos casos): la escala acotada (8–40) recorta a esos pocos y la DE
        // de Y puede bajar hasta ≈ 3 % (límite documentado en LIMITACIONES.md); en las demás, exacta
        const colaLarga = ['potencia-dec', 'hiperbolica-dec', 'decaimiento', 'exponencial', 'potencia-exp'].includes(F.id);
        assert.ok(Math.abs(my - 24) < 0.1 && Math.abs(sy - 5) < (colaLarga ? 0.2 : 0.1), `${F.id}: Media ${my} y DE ${sy} de Y`);
        assert.ok(Math.abs(pear(y, col(base, 'Dimension_CA')) - 0.35) < 0.01, `${F.id}: r(Apoyo, Calma)`);
        assert.ok(Math.abs(pear(x, y) - 0.6 * kappaForma(F.id)) < 0.1, `${F.id}: r de Pearson ≈ η·κ`);
    }
});

test('la lección del atlas: una U fuerte (η = .7) da una r de Pearson cercana a 0; una curva monotónica, ρ y r altas', () => {
    for (const forma of ['u', 'u-invertida', 'ciclica']) {
        const base = generar([{ tipo: 'forma', forma, x: 'Estrés', y: 'Apoyo', eta: 0.7 }], { n: 800 }).generarBaseDatos();
        const x = col(base, 'Dimension_ES'), y = col(base, 'Dimension_AP');
        assert.ok(Math.abs(pear(x, y)) < 0.1 && Math.abs(pear(Array.from(aplicarForma(forma, x)), y) - 0.7) < 0.005, forma);
    }
    const base = generar([{ tipo: 'forma', forma: 'logaritmica', x: 'Estrés', y: 'Apoyo', eta: 0.7 }], { distX: 'uniforme' }).generarBaseDatos();
    assert.ok(pear(col(base, 'Dimension_ES'), col(base, 'Dimension_AP')) > 0.55);
});

test('X uniforme y asimétrica, n pequeño y fuerza alta: la fuerza sigue siendo la pedida (punto fijo sobre los valores finales)', () => {
    for (const [distX, eta, n] of [['uniforme', 0.5, 200], ['asimetrica', 0.9, 1000]]) for (const forma of ['potencia-dec', 'hiperbolica-dec', 'exponencial', 'escalon']) {
        const base = generar([{ tipo: 'forma', forma, x: 'Estrés', y: 'Apoyo', eta }], { n, distX }).generarBaseDatos();
        assert.ok(Math.abs(pear(Array.from(aplicarForma(forma, col(base, 'Dimension_ES'))), col(base, 'Dimension_AP')) - eta) < 0.005, `${forma}/${distX}`);
    }
});

test('validación e informe: errores útiles y filas «pedido vs. obtenido» (η, la identidad de r y la ρ esperada, todas verificadas)', () => {
    const errores = m => generar(m).validarConfiguracion().errores.join(' | ');
    assert.match(errores([{ tipo: 'forma', forma: 'u', x: 'Estrés', y: 'Apoyo', eta: 0.99 }]), /fuerza η debe estar entre 0 y 0.97/);
    assert.match(errores([{ tipo: 'forma', forma: 'u', x: 'Estrés', y: 'Estrés', eta: 0.5 }]), /deben ser distintas/);
    assert.match(errores([{ tipo: 'forma', forma: 'u', x: 'Estrés', y: 'Apoyo', eta: 0.5 }, { tipo: 'forma', forma: 'logaritmica', x: 'Calma', y: 'Apoyo', eta: 0.4 }]), /ya es criterio de otro modelo/);
    assert.match(errores([{ tipo: 'forma', forma: 'rara', x: 'Estrés', y: 'Apoyo', eta: 0.5 }]), /tipo de relación desconocido/);
    const g = generar([{ tipo: 'forma', forma: 'sigmoide', x: 'Estrés', y: 'Apoyo', eta: 0.6 }]), base = g.generarBaseDatos();
    const filas = g.informePedidoObtenido(base).filter(f => /Relación sigmoide/.test(f.variable));
    assert.deepEqual(filas.map(f => [f.tipo, f.ok === null ? 'informativa' : f.ok]), [['η', true], ['r', true], ['ρ', true]]);   // r = η·r(f(X), X); ρ contra su distribución simulada
    assert.ok(filas[0].ok && Math.abs(parseFloat(filas[0].obtenido) - 0.6) < 0.005);
});

test('revisión 2026.10.24: modo NO exacto — la forma se genera (antes se perdía: una U salía con η ≈ 0)', () => {
    for (const [forma, eta] of [['u-invertida', 0.6], ['logaritmica', 0.6], ['escalon', 0.5]]) {
        const g = generar([{ tipo: 'forma', forma, x: 'Estrés', y: 'Apoyo', eta }], { n: 1500 });
        g.configuracion.correlacionesExactas = false;
        const base = g.generarBaseDatos(), x = col(base, 'Dimension_ES'), y = col(base, 'Dimension_AP');
        assert.ok(Math.abs(pear(Array.from(aplicarForma(forma, x)), y) - eta) < 0.08, `${forma}: η aproximada en modo no exacto`);
    }
});

test('revisión 2026.10.24: Y con diferencias por grupo — aviso de η máxima y la obtenida cerca de ese máximo; par repetido, error', () => {
    const sexo = { categoria: 'Sexo', categoriaCorta: 'Sx', distribucion: 'binaria', promedio: 0.5, desviacion: 0, minimo: 0, maximo: 1, decimales: 0, opciones: ['F', 'M'] };
    const g = generar([{ tipo: 'forma', forma: 'u-invertida', x: 'Estrés', y: 'Apoyo', eta: 0.95 }], { n: 800 });
    Object.assign(g.configuracion, { sociodemograficos: [sexo], diferenciasGrupo: [{ cuantitativa: 'Apoyo', agrupacion: 'Sexo', d: 0.8 }] });
    const v = g.validarConfiguracion();
    assert.ok(v.advertencias.some(a => /fuerza η alcanzable ronda 0\.9\d/.test(a)), v.advertencias.join(' | '));
    const base = g.generarBaseDatos();
    assert.ok(pear(Array.from(aplicarForma('u-invertida', col(base, 'Dimension_ES'))), col(base, 'Dimension_AP')) > 0.9);
    const dup = generar([{ tipo: 'forma', forma: 'u', x: 'Estrés', y: 'Apoyo', eta: 0.5 }], { correlaciones: [{ a: 'Apoyo', b: 'Estrés', r: 0.3 }] }).validarConfiguracion();
    assert.ok(dup.errores.some(e => /aparece dos veces en la tabla III/.test(e)), dup.errores.join(' | '));
});

test('revisión 2026.10.26: la ρ de Spearman se verifica — calibrada en bases correctas y con potencia ante una Y que perdió la relación', async () => {
    const { rhoEsperadaForma, spearman } = await import('../../src/simulador/dominio/formas-relacion.js');
    let filasRho = 0;
    for (const F of FORMAS_RELACION.filter(f => esFormaCompuesta(f.id))) for (const [distX, eta] of [['normal', 0.3], ['uniforme', 0.6]]) {
        const g = generar([{ tipo: 'forma', forma: F.id, x: 'Estrés', y: 'Apoyo', eta }], { n: 400, distX, correlaciones: [] });
        const base = g.generarBaseDatos(), fila = g.informePedidoObtenido(base).find(f => f.tipo === 'ρ' && f.variable.includes('Estrés → Apoyo'));
        assert.equal(fila.ok, true, `${F.id}/${distX}/η ${eta}: ρ ${fila.obtenido} frente a ${fila.pedido}`);
        filasRho++;
    }
    assert.equal(filasRho, 34);
    // control negativo: misma X, Y permutada (sin relación) → la ρ obtenida queda fuera de lo esperado
    const base = generar([{ tipo: 'forma', forma: 'logaritmica', x: 'Estrés', y: 'Apoyo', eta: 0.6 }], { n: 400 }).generarBaseDatos();
    const x = col(base, 'Dimension_ES'), y = col(base, 'Dimension_AP'), yPerm = y.map((_, i) => y[(i * 7919) % y.length]);
    const esp = rhoEsperadaForma(x, Array.from(aplicarForma('logaritmica', x)), yPerm, 0.6);
    assert.ok(Math.abs(spearman(x, yPerm) - esp.media) > Math.max(0.02, 3 * esp.de), 'sin relación, la ρ se desvía de lo esperado');
});

test('revisión 2026.10.27: modo NO exacto con X uniforme y asimétrica — la fuerza y la DE de Y son las pedidas (antes, η ≈ .44 y DE ≈ 4.5)', () => {
    for (const distX of ['uniforme', 'asimetrica']) for (const forma of ['logaritmica', 'u', 'exponencial']) {
        const g = generar([{ tipo: 'forma', forma, x: 'Estrés', y: 'Apoyo', eta: 0.6 }], { n: 3000, distX, correlaciones: [] });
        g.configuracion.correlacionesExactas = false;
        const base = g.generarBaseDatos(), filas = g.informePedidoObtenido(base).filter(f => f.variable.includes('Estrés → Apoyo'));
        const y = col(base, 'Dimension_AP'), m = y.reduce((s, t) => s + t, 0) / y.length, sd = Math.sqrt(y.reduce((s, t) => s + (t - m) ** 2, 0) / (y.length - 1));
        assert.ok(Math.abs(sd - 5) < 0.3, `${forma}/${distX}: DE ${sd}`);
        assert.deepEqual(filas.map(f => [f.tipo, f.ok]), [['η', true], ['r', true], ['ρ', true]], `${forma}/${distX}: ` + filas.map(f => f.tipo + ' ' + f.pedido + '→' + f.obtenido).join(' | '));
    }
});

test('revisión 2026.10.27: con más de 20 000 casos, la ρ esperada usa una submuestra determinista (el informe no bloquea la página)', async () => {
    const { rhoEsperadaForma, MAXIMO_RHO_ESPERADA } = await import('../../src/simulador/dominio/formas-relacion.js');
    const n = 50000, x = Array.from({ length: n }, (_, i) => (i * 7919) % 97), y = x.map((v, i) => v + ((i * 104729) % 13)), fx = x.map(v => v * v);
    const paso = n / MAXIMO_RHO_ESPERADA, sel = Array.from({ length: MAXIMO_RHO_ESPERADA }, (_, k) => Math.floor(k * paso));
    assert.deepEqual(rhoEsperadaForma(x, fx, y, 0.5, { reps: 5 }), rhoEsperadaForma(sel.map(i => x[i]), sel.map(i => fx[i]), sel.map(i => y[i]), 0.5, { reps: 5 }));
});
