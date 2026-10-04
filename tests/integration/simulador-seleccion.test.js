// tests/integration/simulador-seleccion.test.js — fase B3 del Atlas en el Simulador (2026.11.08): restricción de rango por
// selección de la muestra. Las tablas describen la población; la base guarda solo el p superior o inferior de X; el informe
// compara con lo esperado tras la selección (con el propio modelo generador) y la corrección de Thorndike devuelve la ρ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeneradorDatos } from '../../src/simulador/dominio/generador.js';
import { esperadoTrasSeleccion, atenuarThorndike, corregirThorndike, uSeleccionNormal, indicesSeleccionados } from '../../src/simulador/dominio/seleccion.js';

const esc = (nombre, corto, extra = {}) => ({ nombre, nombreCorto: corto, prueba: 'T', tipo: 'dimension', numItems: 10, media: 30, desviacion: 6, minimo: 1, maximo: 5, alfa: 0.85, distribucion: 'normal', invertidos: 0, ...extra });
const pear = (a, b) => { const n = a.length; let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n; let ab = 0, aa = 0, bb = 0; for (let i = 0; i < n; i++) { ab += (a[i] - ma) * (b[i] - mb); aa += (a[i] - ma) ** 2; bb += (b[i] - mb) ** 2; } return ab / Math.sqrt(aa * bb); };
const SEL = { variable: 'Examen', lado: 'superior', proporcion: 0.3 };
function generar({ seleccion = SEL, X = {}, n = 400, semilla = 3, exacto = true, extra = {} } = {}) {
    const g = new GeneradorDatos();
    g.configuracion = { tamanoMuestra: n, semilla, generarPercentiles: false, correlacionesExactas: exacto, indiceFiabilidad: 'alfa', heterogeneidadItems: 'leve', variablesPorTest: { T: { variable: 'R', rIntra: 0 } },
        pruebas: [esc('Examen', 'EX', X), esc('Rendimiento', 'RE'), esc('Motivación', 'MO')], sociodemograficos: [], seleccion,
        correlaciones: [{ a: 'Examen', b: 'Rendimiento', r: 0.5 }, { a: 'Examen', b: 'Motivación', r: 0.3 }, { a: 'Rendimiento', b: 'Motivación', r: 0.4 }], diferenciasGrupo: [], modelos: [], medidasRepetidas: [], estructuras: [], desenlaces: [], cortes: [], concordancias: [], realismo: {}, ...extra };
    g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas);
    const v = g.validarConfiguracion(); if (v.errores.length) return { v };
    const b = g.generarBaseDatos(), col = c => Array.from(b.columna(c).datos);
    return { v, g, b, informe: g.informePedidoObtenido(b), col };
}

test('fórmulas: Thorndike y su inversa; lo esperado por el modelo generador coincide con Pearson–Lawley (normal)', () => {
    assert.ok(Math.abs(corregirThorndike(atenuarThorndike(0.5, 0.56), 0.56) - 0.5) < 1e-12);
    const R = [[1, 0.5, 0.3], [0.5, 1, 0.4], [0.3, 0.4, 1]], L = R.map(() => [0, 0, 0]);
    for (let i = 0; i < 3; i++) for (let j = 0; j <= i; j++) { let s = R[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k]; L[i][j] = i === j ? Math.sqrt(s) : s / L[j][j]; }
    for (const [lado, p] of [['superior', 0.3], ['inferior', 0.2], ['superior', 0.05]]) {
        const e = esperadoTrasSeleccion({ L, iSeleccion: 0, lado, p, transformaciones: [z => z, z => z, z => z] }), u = uSeleccionNormal(p), v = u * u;
        const pl = (0.4 - 0.5 * 0.3 * (1 - v)) / Math.sqrt((1 - 0.25 * (1 - v)) * (1 - 0.09 * (1 - v)));
        assert.ok(Math.abs(e.des[0] - u) < 1e-3 && Math.abs(e.corr[0][1] - atenuarThorndike(0.5, u)) < 0.006 && Math.abs(e.corr[1][2] - pl) < 0.006, `${lado} ${p}: ${e.des[0]}, ${e.corr[0][1]}, ${e.corr[1][2]}`);
    }
});

test('índices seleccionados: los n mayores (o menores), en el orden de generación', () => {
    assert.deepEqual(indicesSeleccionados([3, 9, 1, 7, 5], 2, 'superior'), [1, 3]);
    assert.deepEqual(indicesSeleccionados([3, 9, 1, 7, 5], 2, 'inferior'), [0, 2]);
});

test('en el motor: base de n casos e informe sin ninguna ✗ (superior, inferior, no exacto, X uniforme); α de la seleccionada informativa', () => {
    for (const [nombre, op] of [['superior', {}], ['inferior', { seleccion: { ...SEL, lado: 'inferior', proporcion: 0.2 } }], ['no exacto', { exacto: false }], ['X uniforme', { X: { distribucion: 'uniforme' } }]]) {
        const r = generar(op);
        assert.equal(r.col('Dimension_EX').length, 400, nombre);
        assert.deepEqual(r.informe.filter(f => f.ok === false).map(f => `${f.tipo} ${f.variable} ${f.pedido}→${f.obtenido}`), [], nombre);
        assert.equal(r.informe.find(f => f.tipo === 'α' && /^Examen/.test(f.variable)).ok, null, `${nombre}: la fórmula clásica no aplica a la seleccionada`);
        assert.ok(r.informe.filter(f => f.tipo === 'α' && /tras la selección/.test(f.variable)).every(f => f.ok === true), `${nombre}: α de las seleccionadas indirectamente, verificado`);
    }
});

test('la corrección de Thorndike devuelve la ρ de la población (n = 3000) y la r observada es la esperada', () => {
    const r = generar({ n: 3000 }), x = r.col('Dimension_EX'), y = r.col('Dimension_RE');
    const u = (() => { const m = x.reduce((s, v) => s + v, 0) / x.length; return Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / (x.length - 1)) / 6; })();
    assert.ok(Math.abs(u - uSeleccionNormal(0.3)) < 0.03, `u ${u}`);
    assert.ok(Math.abs(pear(x, y) - atenuarThorndike(0.5, uSeleccionNormal(0.3))) < 0.04, `r ${pear(x, y)}`);
    assert.ok(Math.abs(corregirThorndike(pear(x, y), u) - 0.5) < 0.06, `ρ corregida ${corregirThorndike(pear(x, y), u)}`);
    assert.ok(r.informe.filter(f => f.tipo === 'ρ corregida').every(f => f.ok === true));
});

test('robustez: en 10 semillas, ningún informe con una ✗', () => {
    for (let s = 0; s < 10; s++) { const r = generar({ semilla: 900 + s }); assert.deepEqual(r.informe.filter(f => f.ok === false).map(f => f.variable), [], `semilla ${900 + s}`); }
});

test('validación: variable inexistente, sin correlaciones, porcentaje fuera de rango, población demasiado grande y funciones aún no combinables', () => {
    const errores = op => generar(op).v.errores.join(' | ');
    assert.match(errores({ seleccion: { ...SEL, variable: 'Nadie' } }), /no existe o no es cuantitativa/);
    assert.match(errores({ extra: { correlaciones: [{ a: 'Rendimiento', b: 'Motivación', r: 0.4 }] } }), /no se relaciona con ninguna otra/);
    assert.match(errores({ seleccion: { ...SEL, proporcion: 0.02 } }), /entre el 5 % y el 95 %/);
    assert.match(errores({ n: 60000, seleccion: { ...SEL, proporcion: 0.05 } }), /más que el máximo/);
    assert.match(errores({ extra: { modelos: [{ tipo: 'forma', forma: 'u', x: 'Examen', y: 'Motivación', eta: 0.5 }] } }), /aún no se combina con modelos o relaciones con forma o nube/);
});

test('revisión 2026.11.09: errores típicos del propio modelo (la cola seleccionada no es normal): 30 semillas del 20 % inferior sin falsas alarmas de DE ni de u', async () => {
    const { esperadoTrasSeleccion } = await import('../../src/simulador/dominio/seleccion.js');
    const e = esperadoTrasSeleccion({ L: [[1, 0], [0.5, Math.sqrt(0.75)]], iSeleccion: 0, lado: 'inferior', p: 0.2, transformaciones: [z => z, z => z] });
    assert.ok(e.curtosis[0] > 4.5, `curtosis de la cola ${e.curtosis[0]}`);
    assert.ok(e.eeDE(0, 400) > 1.3 * (e.des[0] / Math.sqrt(800)), 'el error típico de la DE es mayor que el de la normal');
    let conFallo = 0;
    for (let s = 1; s <= 30; s++) {
        const r = generar({ seleccion: { ...SEL, lado: 'inferior', proporcion: 0.2 }, semilla: 700 + s }), malas = r.informe.filter(f => f.ok === false);
        assert.deepEqual(malas.filter(f => f.tipo === 'DE' || f.tipo === 'u').map(f => f.variable), [], `semilla ${700 + s}`);
        if (malas.length) conFallo++;
    }
    assert.ok(conFallo <= 2, `informes con alguna ✗: ${conFallo} de 30`);
});

test('revisión 2026.11.09: escalas de acierto/error relacionadas → error; un puntaje general → r informativa y Thorndike verificada; imperfecciones → aviso y filas informativas', () => {
    const dic = generar({ extra: { pruebas: [esc('Examen', 'EX'), esc('Razonamiento', 'RZ', { minimo: 0, maximo: 1, numItems: 20, media: 12, desviacion: 3.5, alfa: 0.8 }), esc('Motivación', 'MO')], correlaciones: [{ a: 'Examen', b: 'Razonamiento', r: 0.5 }, { a: 'Examen', b: 'Motivación', r: 0.3 }] } });
    assert.ok(dic.v.errores.some(e => /escalas de acierto\/error relacionadas en la tabla III \(«Razonamiento»\)/.test(e)));
    const pr = [esc('Examen', 'EX'), { ...esc('Lectura', 'LE'), prueba: 'B' }, { ...esc('Escritura', 'ES'), prueba: 'B' }];
    const gen = generar({ extra: { pruebas: pr, variablesPorTest: { T: { variable: 'R', rIntra: 0 }, B: { variable: 'Lengua', rIntra: 0.4 } }, correlaciones: [{ a: 'Examen', b: 'Lengua — B', r: 0.45 }] } });
    const filasGeneral = gen.informe.filter(f => /Lengua — B/.test(f.variable));
    assert.equal(filasGeneral.find(f => f.tipo === 'r').ok, null, 'la r de un general es informativa');
    assert.equal(filasGeneral.find(f => f.tipo === 'ρ corregida').ok, true, 'Thorndike verificada (antes, tolerancia NaN)');
    const imp = generar({ extra: { realismo: { pctPerdidos: 5, mecanismoPerdidos: 'MCAR', pctDescuidados: 5, tipoDescuidado: 'aleatorio' } } });
    assert.ok(imp.v.advertencias.some(a => /se aplican después de la selección/.test(a)));
    assert.deepEqual(imp.informe.filter(f => f.ok === false).map(f => f.variable), []);
    // (2026.11.13) el informe verifica la base ANTES de las imperfecciones: esas filas ya no son informativas, se verifican
    assert.ok(['DE', 'u', 'ρ corregida'].every(t => imp.informe.some(f => f.tipo === t && f.ok === true)));
});

