// tests/integration/simulador-techo.test.js — fase B2 del Atlas en el Simulador (2026.11.06): techo y suelo de una escala.
// La latente se infla para que, tras el recorte del instrumento, la media y la DE sean las pedidas; las correlaciones con
// una variable censurada se hacen exactas con la serie de Hermite; la F3 del Analizador lo reconoce en círculo cerrado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeneradorDatos } from '../../src/simulador/dominio/generador.js';
import { diagnosticarForma } from '../../src/analizador/relaciones/diagnostico-forma.js';
import { parametrosCensura, formaCensurada, rHermite, distanciaTecho, Phi, deParaProporcion } from '../../src/simulador/dominio/censura.js';

const esc = (nombre, corto, extra = {}) => ({ nombre, nombreCorto: corto, prueba: 'T', tipo: 'dimension', numItems: 10, media: 30, desviacion: 6, minimo: 1, maximo: 5, alfa: 0.85, distribucion: 'normal', invertidos: 0, ...extra });
const pear = (a, b) => { const n = a.length; let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n; let ab = 0, aa = 0, bb = 0; for (let i = 0; i < n; i++) { ab += (a[i] - ma) * (b[i] - mb); aa += (a[i] - ma) ** 2; bb += (b[i] - mb) ** 2; } return ab / Math.sqrt(aa * bb); };
function generar({ X = {}, Y = {}, correlaciones = [], modelos = [], medidasRepetidas = [], sociodemograficos = [], diferenciasGrupo = [], n = 800, semilla = 3 } = {}) {
    const g = new GeneradorDatos();
    g.configuracion = { tamanoMuestra: n, semilla, generarPercentiles: false, correlacionesExactas: true, indiceFiabilidad: 'alfa', heterogeneidadItems: 'leve', variablesPorTest: { T: { variable: 'R', rIntra: 0 } },
        pruebas: [esc('Estrés', 'ES', X), esc('Apoyo', 'AP', Y)], sociodemograficos, correlaciones, diferenciasGrupo, modelos, medidasRepetidas, estructuras: [], desenlaces: [], cortes: [], concordancias: [], realismo: {} };
    g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas);
    const v = g.validarConfiguracion();
    if (v.errores.length) return { g, v };
    const b = g.generarBaseDatos(), col = c => Array.from(b.columna(c).datos);
    return { g, v, b, informe: g.informePedidoObtenido(b), col };
}
let estado = 11 >>> 0;
const u01 = () => { estado = (estado + 0x6D2B79F5) >>> 0; let t = estado; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const normal = () => Math.sqrt(-2 * Math.log(u01() || 1e-12)) * Math.cos(2 * Math.PI * u01());
const TECHO = { distribucion: 'techo', media: 40, desviacion: 8.74 }, SUELO = { distribucion: 'suelo', media: 20, desviacion: 8.74 };

test('la censura: H creciente; la media, la DE y la proporción en el límite salen las pedidas', () => {
    let previo = 0; for (let c = -3.5; c <= 6; c += 0.05) { const h = distanciaTecho(c); assert.ok(h > previo, `H no crece en c = ${c}`); previo = h; }
    for (const [lado, M, DE] of [['techo', 40, 7], ['techo', 44, 6], ['suelo', 16, 6]]) {
        const par = parametrosCensura(lado, M, DE, 10, 50), f = formaCensurada(par), n = 200000; let s = 0, s2 = 0, enLimite = 0;
        for (let i = 0; i < n; i++) { const y = M + DE * f(normal()); s += y; s2 += y * y; if (Math.abs(y - par.limite) < 1e-9) enLimite++; }
        const m = s / n, de = Math.sqrt(s2 / n - m * m);
        assert.ok(Math.abs(m - M) < 0.05 && Math.abs(de - DE) < 0.05 && Math.abs(enLimite / n - par.p) < 0.004, `${lado} ${M}/${DE}: ${m}, ${de}, ${enLimite / n} frente a ${par.p}`);
    }
    assert.ok(Math.abs(deParaProporcion(0.2, 'techo', 40, 10, 50) - 8.74) < 0.01);
});

test('serie de Hermite: la correlación entre formas censuradas y el resto coincide con Monte Carlo', () => {
    const pT = parametrosCensura('techo', 40, 7, 10, 50), pS = parametrosCensura('suelo', 16, 6, 10, 50);
    const F = { T: [{ forma: 'censurada', lado: 'techo', c: pT.c }, formaCensurada(pT)], S: [{ forma: 'censurada', lado: 'suelo', c: pS.c }, formaCensurada(pS)], N: [{ forma: 'normal' }, z => z], U: [{ forma: 'uniforme' }, Phi], L: [{ forma: 'lognormal', sigma: 0.5 }, z => Math.exp(0.5 * z)] };
    for (const [a, b] of [['T', 'N'], ['T', 'T'], ['T', 'U'], ['T', 'L'], ['S', 'T']]) for (const rho of [0.6, -0.4]) {
        const n = 150000, x = new Float64Array(n), y = new Float64Array(n);
        for (let i = 0; i < n; i++) { const z1 = normal(), z2 = rho * z1 + Math.sqrt(1 - rho * rho) * normal(); x[i] = F[a][1](z1); y[i] = F[b][1](z2); }
        const h = rHermite(F[a][0], F[b][0], rho), mc = pear(x, y);
        assert.ok(Math.abs(h - mc) < 0.008, `${a}–${b}, ρ = ${rho}: Hermite ${h} frente a ${mc}`);
    }
});

test('círculo cerrado: techo y suelo en Y o en X, r exacta pese a la censura, proporción en el límite y la F3 lo detecta', () => {
    for (const [nombre, op, r, detecta] of [['techo en Y', { Y: TECHO }, 0.5, ts => ts.y.techo], ['suelo en Y', { Y: SUELO }, 0.5, ts => ts.y.suelo], ['techo en X', { X: TECHO }, -0.4, ts => ts.x.techo]]) {
        const g = generar({ ...op, correlaciones: [{ a: 'Estrés', b: 'Apoyo', r }] }), x = g.col('Dimension_ES'), y = g.col('Dimension_AP');
        assert.deepEqual(g.informe.filter(f => f.ok === false).map(f => f.variable), [], nombre);
        assert.equal(g.informe.filter(f => f.tipo === 'límite').length, 1, `${nombre}: fila de casos en el límite`);
        assert.ok(Math.abs(pear(x, y) - r) < 0.005, `${nombre}: r = ${pear(x, y)}`);
        assert.ok(detecta(diagnosticarForma(x, y, { B: 19, Bnube: 99 }).nube.techoSuelo), `${nombre}: la F3 lo detecta`);
    }
});

test('techo en la Y de una relación con forma y en ondas de medidas repetidas: cada onda con su propia latente', () => {
    const f = generar({ Y: TECHO, modelos: [{ tipo: 'forma', forma: 'u-invertida', x: 'Estrés', y: 'Apoyo', eta: 0.5 }] });
    assert.deepEqual(f.informe.filter(r => r.ok === false).map(r => r.variable), []);
    const o = generar({ Y: { ...TECHO, alfa: 0.93 }, medidasRepetidas: [{ variable: 'Apoyo', ondas: 2, estabilidad: 0.6, cambio: 0.5, agrupacion: '', cambioGrupo: null }] });
    const ondas = o.g.configuracion.pruebas.filter(p => /Apoyo/.test(p.nombre));
    assert.equal(ondas.length, 2);
    assert.ok(ondas.every(p => p.formaTotal && p.formaTotal.censura), 'ninguna onda recibe una beta-binomial');
    const [t1, t2] = ondas.map(p => o.col(o.g.columnaDeEscala(p)));
    assert.ok(t2.filter(v => v === 50).length > 2 * t1.filter(v => v === 50).length, 'con la media desplazada, más casos en el techo');
    assert.ok(Math.abs(pear(t1, t2) - 0.6) < 0.005, `estabilidad ${pear(t1, t2)}`);
});

test('validación: dicotómica o con diferencias por grupo → error; poca proporción → aviso con la DE sugerida; α inalcanzable → aviso con su mínimo', () => {
    assert.ok(generar({ Y: { distribucion: 'techo', minimo: 0, maximo: 1, numItems: 20, media: 14, desviacion: 3 } }).v.errores.some(e => /no a ítems de acierto\/error/.test(e)));
    const sexo = [{ categoria: 'Sexo', distribucion: 'binaria', promedio: 0.5, desviacion: 0.5, minimo: 0, maximo: 1, decimales: 0, opciones: ['F', 'M'] }];
    assert.ok(generar({ Y: TECHO, sociodemograficos: sexo, diferenciasGrupo: [{ cuantitativa: 'Apoyo', agrupacion: 'Sexo', d: 0.5, tipo: 'd' }] }).v.errores.some(e => /aún no se combina con diferencias por grupo/.test(e)));
    assert.ok(generar({ Y: { distribucion: 'techo', media: 40, desviacion: 5 } }).v.advertencias.some(a => /usa una DE ≈ 8\.74/.test(a)));
    assert.ok(generar({ Y: { distribucion: 'techo', media: 40, desviacion: 12.4, alfa: 0.85 } }).v.advertencias.some(a => /no podrá bajar de ≈ 0\.9/.test(a)));
    assert.ok(!generar({ Y: TECHO }).v.advertencias.some(a => /no podrá bajar/.test(a)), 'con un α alcanzable, sin aviso');
});

test('revisión 2026.11.07: DE imposible (Bhatia–Davis) y escala sin rango → error; criterio de una moderación → aviso; la mediación sigue exacta', () => {
    assert.ok(generar({ Y: { distribucion: 'techo', media: 48, desviacion: 9 } }).v.errores.some(e => /ninguna distribución en ese rango supera una DE de 8\.72/.test(e)));
    assert.ok(generar({ Y: { distribucion: 'techo', media: 40, desviacion: 8, minimo: null, maximo: null } }).v.errores.some(e => /necesita el rango de la escala/.test(e)));
    const pruebas3 = (() => { const g = new GeneradorDatos(); g.configuracion = { tamanoMuestra: 400, semilla: 3, generarPercentiles: false, correlacionesExactas: true, indiceFiabilidad: 'alfa', heterogeneidadItems: 'leve', variablesPorTest: { T: { variable: 'R', rIntra: 0 } },
        pruebas: [esc('Estrés', 'ES'), esc('Apoyo', 'AP', TECHO), esc('Calma', 'CA')], sociodemograficos: [], correlaciones: [], diferenciasGrupo: [], modelos: [{ tipo: 'moderacion', x: 'Estrés', m: 'Calma', y: 'Apoyo', c1: 0.3, c2: 0.2, c3: 0.15 }], medidasRepetidas: [], estructuras: [], desenlaces: [], cortes: [], concordancias: [], realismo: {} };
        g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas); return g.validarConfiguracion(); })();
    assert.ok(pruebas3.advertencias.some(a => /es el criterio de una moderación; el techo aplana la relación/.test(a)), 'la moderación con criterio censurado se anuncia');
    const g = new GeneradorDatos(); g.configuracion = { tamanoMuestra: 1500, semilla: 3, generarPercentiles: false, correlacionesExactas: true, indiceFiabilidad: 'alfa', heterogeneidadItems: 'leve', variablesPorTest: { T: { variable: 'R', rIntra: 0 } },
        pruebas: [esc('Estrés', 'ES'), esc('Apoyo', 'AP'), esc('Calma', 'CA', TECHO)], sociodemograficos: [], correlaciones: [], diferenciasGrupo: [], modelos: [{ tipo: 'mediacion', x: 'Estrés', m: 'Calma', y: 'Apoyo', c1: 0.5, c2: 0.4, c3: 0.1 }], medidasRepetidas: [], estructuras: [], desenlaces: [], cortes: [], concordancias: [], realismo: {} };
    g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas);
    const inf = g.informePedidoObtenido(g.generarBaseDatos()).filter(f => /Mediación/.test(f.variable));
    assert.ok(inf.length >= 4 && inf.every(f => f.ok !== false), 'mediación con el mediador censurado: ' + inf.map(f => `${f.tipo} ${f.pedido}→${f.obtenido}`).join(' | '));
});

test('calibración del α con techo: 1000 casos simulados (con 400, .656 para .70 pedido)', () => {
    const g = generar({ Y: { distribucion: 'techo', media: 40, desviacion: 6.9, alfa: 0.7 }, semilla: 4 }), fa = g.informe.find(f => f.tipo === 'α' && f.variable.includes('Apoyo'));
    assert.ok(Math.abs(parseFloat(fa.obtenido) - 0.7) < 0.03, `α ${fa.obtenido}`);
});
