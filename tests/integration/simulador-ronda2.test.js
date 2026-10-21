// @ts-check
// tests/integration/simulador-ronda2.test.js — (2026.12.30) lo que corrigió la segunda auditoría en el dominio del
// Simulador: el modo exacto sin estructura de correlación, las sociodemográficas con un solo límite, la uniforme, la
// respuesta extrema sola, las escalas de un ítem en las imperfecciones, los jueces con puntuación dentro del rango, los
// rangos negativos, los cortes mezclados, los invertidos de una escala continua en el diccionario y los avisos de la
// validación que sobraban o faltaban.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeneradorDatos } from '../../src/simulador/dominio/generador.js';

/** @param {string} nombre @param {string} corto @param {string} prueba @param {number} k @param {number} media @param {number} de @param {number} alfa @param {object} [extra] */
const escala = (nombre, corto, prueba, k, media, de, alfa, extra = {}) => ({ nombre, nombreCorto: corto, prueba, tipo: 'dimension', numItems: k, media, desviacion: de, alfa, minimo: 1, maximo: 5, distribucion: 'normal', invertidos: 0, ...extra });
/** @param {string} categoria @param {string} corta @param {number} media @param {number} de @param {number | null} min @param {number | null} max @param {object} [extra] */
const socioN = (categoria, corta, media, de, min, max, extra = {}) => ({ categoria, categoriaCorta: corta, distribucion: 'normal', promedio: media, desviacion: de, minimo: min, maximo: max, decimales: 0, niveles: null, ordinal: false, fechaNacimiento: null, dependeDe: '', fuerza: 0.4, ...extra });
/** @param {string} categoria @param {string} corta @param {number} p */
const socioB = (categoria, corta, p) => ({ categoria, categoriaCorta: corta, distribucion: 'binaria', promedio: p, desviacion: 1, minimo: null, maximo: null, decimales: 0, niveles: null, ordinal: false, fechaNacimiento: null, dependeDe: '', fuerza: 0.4 });
/** @param {string} categoria @param {string} corta @param {number} K */
const socioC = (categoria, corta, K) => ({ categoria, categoriaCorta: corta, distribucion: 'categorica', promedio: 0, desviacion: 1, minimo: 1, maximo: K, decimales: 0, niveles: null, ordinal: false, fechaNacimiento: null, dependeDe: '', fuerza: 0.4 });
/** @param {number} n @param {object} [extra] */
const base = (n, extra = {}) => Object.assign({
    tamanoMuestra: n, semilla: 7, generarPercentiles: false, correlacionesExactas: true, indiceFiabilidad: 'alfa', heterogeneidadItems: 'leve',
    variablesPorTest: {}, pruebas: [], sociodemograficos: [socioB('Sexo', 'S', 0.5)],
    correlaciones: [], diferenciasGrupo: [], modelos: [], medidasRepetidas: [], estructuras: [], desenlaces: [], cortes: [], concordancias: [], realismo: {}
}, extra);
/** @param {object} cfg */
function generador(cfg) {
    const g = /** @type {any} */ (new GeneradorDatos());
    g.configuracion = JSON.parse(JSON.stringify(cfg));
    g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas);
    return g;
}
/** @param {object} cfg */
function generar(cfg) {
    const g = generador(cfg);
    const v = g.validarConfiguracion();
    if (v.errores.length) return { g, v, b: null, inf: null };
    const b = g.generarBaseDatos();
    return { g, v, b, inf: g.informePedidoObtenido(b) };
}
/** @param {ArrayLike<number>} a */ const media = a => Array.from(a).reduce((s, x) => s + x, 0) / a.length;
/** @param {ArrayLike<number>} a */ const de = a => { const m = media(a); return Math.sqrt(Array.from(a).reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
/** @param {any} b @param {string} c @returns {number[]} */ const col = (b, c) => Array.from(b.columna(c).datos);

test('modo exacto sin nada que correlacionar: la media y la DE de una escala sola salen exactas (antes, por muestreo y con ✗)', () => {
    const BAI = [escala('Ansiedad', 'AN', 'BAI', 20, 60, 10, 0.9)];
    for (let semilla = 1; semilla <= 15; semilla++) {
        const { g, inf, b } = generar(base(100, { semilla, pruebas: BAI }));
        const p = g.configuracion.pruebas[0];
        for (const tipo of ['Media', 'DE']) assert.equal(inf.find((/** @type {any} */ f) => f.tipo === tipo && f.variable === p.nombre).ok, true, `semilla ${semilla}: ${tipo}`);
        const t = col(b, g.columnaDeEscala(p));
        assert.ok(Math.abs(media(t) - 60) < 0.25 && Math.abs(de(t) - 10) < 0.4, `semilla ${semilla}: M ${media(t)}, DE ${de(t)}`);
    }
});

test('sociodemográfica continua con un solo límite: se respeta (antes se ignoraba) y la validación avisa del recorte', () => {
    const pruebas = [escala('Ansiedad', 'AN', 'BAI', 20, 60, 10, 0.9)];
    for (const [min, max] of [[18, null], [null, 25]]) {
        const s = socioN('Edad', 'E', 21, 3, min, max);
        const { b, v } = generar(base(500, { pruebas, sociodemograficos: [socioB('Sexo', 'S', 0.5), s], correlaciones: [{ a: 'Ansiedad', b: 'Edad', r: 0.2 }] }));
        assert.ok(b, JSON.stringify(v.errores));
        const x = col(b, 'Edad');
        if (min !== null) assert.equal(x.filter(t => t < min).length, 0, 'nadie por debajo del mínimo');
        if (max !== null) assert.equal(x.filter(t => t > max).length, 0, 'nadie por encima del máximo');
        assert.ok(v.advertencias.some((/** @type {string} */ a) => /«Edad»: con media 21 y DE 3, ≈ \d+ % de los casos caería fuera del rango \([≥≤] \d+\) y se recortará al límite/.test(a)), JSON.stringify(v.advertencias));
    }
});

test('uniforme: la validación avisa de que el promedio pedido no se usa (la media es el centro del rango)', () => {
    const s = { ...socioN('Horas', 'H', 5, 1, 1, 15, { decimales: 1 }), distribucion: 'uniforme' };
    const { b, v } = generar(base(500, { pruebas: [escala('Ansiedad', 'AN', 'BAI', 20, 60, 10, 0.9)], sociodemograficos: [socioB('Sexo', 'S', 0.5), s] }));
    assert.ok(v.advertencias.some((/** @type {string} */ a) => /«Horas»: en una uniforme la media es el centro del rango \(8\) y la DE, 4\.04: el promedio pedido \(5\) no se usa/.test(a)));
    assert.ok(Math.abs(media(col(b, 'Horas')) - 8) < 0.6);
    // y sin los dos límites, un error
    const sinMax = { ...s, maximo: null };
    assert.ok(generador(base(100, { pruebas: [escala('Ansiedad', 'AN', 'BAI', 20, 60, 10, 0.9)], sociodemograficos: [sinMax] })).validarConfiguracion().errores.some((/** @type {string} */ e) => /una uniforme necesita el mínimo y el máximo/.test(e)));
});

test('solo respuesta extrema: el informe se calcula sobre la base limpia, como con cualquier otra imperfección', () => {
    const pruebas = [escala('Ansiedad', 'AN', 'T', 10, 30, 6, 0.85), escala('Apoyo', 'AP', 'U', 10, 30, 6, 0.80)];
    const { g, inf } = generar(base(400, { pruebas, correlaciones: [{ a: 'Ansiedad', b: 'Apoyo', r: -0.40 }], realismo: { pctExtrema: 30, intensidadEstilos: 'alta' } }));
    assert.ok(g._informeLimpio, 'informe de la base limpia');
    assert.ok(g.resumenImperfecciones.extremos > 0);
    assert.ok(inf.some((/** @type {any} */ f) => f.tipo === 'imperfecciones'));
    assert.ok(inf.filter((/** @type {any} */ f) => ['Media', 'DE', 'α', 'r'].includes(f.tipo)).every((/** @type {any} */ f) => f.ok === true));
    // con selección por rango, el aviso de que los estilos se aplican después también con la respuesta extrema
    const { v } = generar(base(300, { pruebas, correlaciones: [{ a: 'Ansiedad', b: 'Apoyo', r: -0.40 }], seleccion: { variable: 'Ansiedad', lado: 'superior', proporcion: 0.3 }, realismo: { pctExtrema: 20 } }));
    assert.equal(v.advertencias.filter((/** @type {string} */ a) => /se aplican después de la selección/.test(a)).length, 1);
});

test('imperfecciones también en las escalas de un solo ítem (perdidos, descuidados y digitación)', () => {
    const { g, b } = generar(base(1000, {
        pruebas: [escala('Satisfacción global', 'SG', 'SG', 1, 6, 2, 0, { minimo: 1, maximo: 10 }), escala('Ansiedad', 'AN', 'BAI', 10, 30, 6, 0.85)],
        realismo: { pctPerdidos: 10, mecanismoPerdidos: 'MCAR', pctDescuidados: 10, tipoDescuidado: 'aleatorio', marcarDescuidados: true, pctDigitacion: 5 }
    }));
    const sg = col(b, 'SG1');
    const perdidos = sg.filter(x => !Number.isFinite(x)).length / sg.length;
    assert.ok(perdidos > 0.06 && perdidos < 0.14, `perdidos en el ítem único: ${perdidos}`);
    assert.ok(g.resumenImperfecciones.descuidados === 100 && g.resumenImperfecciones.digitacion === 50);
});

test('jueces con puntuación (CCI) sobre un total Likert: enteros y dentro del rango posible del total', () => {
    const { b, inf } = generar(base(500, { pruebas: [escala('Estrés', 'ST', 'PSS', 10, 12, 5, 0.85, { minimo: 0, maximo: 4 })], concordancias: [{ tipo: 'juecesContinuo', variable: 'Estrés', jueces: 3, kappa: null, icc: 0.6 }] }));
    for (const c of ['Juez1_ST', 'Juez2_ST', 'Juez3_ST']) {
        const x = col(b, c);
        assert.equal(x.filter(t => t < 0 || t > 40).length, 0, `${c}: fuera de 0–40`);
        assert.equal(x.filter(t => t !== Math.round(t)).length, 0, `${c}: no enteras`);
    }
    const cci = inf.find((/** @type {any} */ f) => /CCI/.test(f.tipo));
    assert.ok(cci && cci.ok === true, JSON.stringify(cci));
});

test('ítems de rango negativo: una media negativa es válida y la digitación no convierte un −2 en un perdido', () => {
    assert.deepEqual(generador(base(300, { pruebas: [escala('Actitud', 'AC', 'DS', 5, -4, 3, 0.8, { minimo: -3, maximo: 3 })] })).validarConfiguracion().errores, []);
    assert.ok(generador(base(300, { pruebas: [escala('Actitud', 'AC', 'DS', 5, -4, 3, 0.8)] })).validarConfiguracion().errores.some((/** @type {string} */ e) => /La media no puede ser negativa/.test(e)), 'con ítems de 1 a 5, sigue siendo un error');
    const { b, g } = generar(base(2000, { semilla: 3, pruebas: [escala('Actitud', 'AC', 'DS', 5, 0, 3, 0.8, { minimo: -3, maximo: 3 })], realismo: { pctDigitacion: 10 } }));
    const items = g._itemsDe(g.configuracion.pruebas[0]).flatMap((/** @type {string} */ c) => col(b, c));
    assert.equal(items.filter(x => !Number.isFinite(x)).length, 0, 'sin perdidos de más');
    assert.ok(items.some(x => x <= -11), 'hay errores «−22» por «−2» (o «−33» por «−3»)');
});

test('puntos de corte: «@ P25, 30» (percentil y puntaje mezclados) es un error, no unos cortes fijos 25 y 30 en silencio', () => {
    const g = generador(base(300, { pruebas: [escala('Estrés', 'ST', 'PSS', 10, 30, 6, 0.85)] }));
    assert.throws(() => g._parsearCortes('Estrés', 'Bajo, Medio, Alto @ P25, 30'), /o todos los cortes son percentiles .* o todos son puntajes .*no una mezcla/);
    assert.deepEqual(g._parsearCortes('Estrés', 'Bajo, Medio, Alto @ P25, P75'), { variable: 'Estrés', etiquetas: ['Bajo', 'Medio', 'Alto'], cortes: [25, 75], porPercentil: true });
    assert.deepEqual(g._parsearCortes('Estrés', 'Bajo, Medio, Alto @ 20, 30'), { variable: 'Estrés', etiquetas: ['Bajo', 'Medio', 'Alto'], cortes: [20, 30], porPercentil: false });
});

test('diccionario: los invertidos con su recodificación, también en una escala continua (constante de reflexión 2·M/k)', () => {
    const { g, b } = generar(base(300, { pruebas: [escala('Percepción', 'PE', 'EQ', 6, 20, 4, 0.8, { invertidos: 2 }), escala('Tiempo de reacción', 'TR', 'RT', 4, 2000, 300, 0.7, { minimo: null, maximo: null, invertidos: 1 })] }));
    g.datosGenerados = b;
    const et = g.obtenerEtiquetas();
    assert.match(et.PE6, /\(INVERTIDO: recodificar como 6 − valor\)/);
    assert.doesNotMatch(et.PE1, /INVERTIDO/);
    assert.match(et.TR4, /\(INVERTIDO: recodificar como 1000 − valor\)/);
    // la constante del diccionario es la que reconstruye el total: TR1 + TR2 + TR3 + (1000 − TR4), y 6 − valor en el Likert
    const tr = [1, 2, 3, 4].map(k => col(b, `TR${k}`)), totalTR = col(b, g.columnaDeEscala(g.configuracion.pruebas[1]));
    const pe = [1, 2, 3, 4, 5, 6].map(k => col(b, `PE${k}`)), totalPE = col(b, g.columnaDeEscala(g.configuracion.pruebas[0]));
    for (let i = 0; i < b.n; i++) {
        assert.ok(Math.abs(tr[0][i] + tr[1][i] + tr[2][i] + (1000 - tr[3][i]) - totalTR[i]) < 1e-9, `fila ${i + 1}: total de la continua`);
        assert.equal(pe[0][i] + pe[1][i] + pe[2][i] + pe[3][i] + (6 - pe[4][i]) + (6 - pe[5][i]), totalPE[i], `fila ${i + 1}: total del Likert`);
    }
    // y el invertido, tal como está en la base, correlaciona en negativo con el total
    const r = (() => { const x = tr[3], mx = media(x), my = media(totalTR); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (totalTR[i] - my); sxx += (x[i] - mx) ** 2; syy += (totalTR[i] - my) ** 2; } return sxy / Math.sqrt(sxx * syy); })();
    assert.ok(r < -0.3, `r del invertido con el total: ${r}`);
});

test('todos los ítems invertidos: se generan todos invertidos y el diccionario lo dice en cada uno', () => {
    const { g, b, v } = generar(base(300, { pruebas: [escala('Afecto negativo', 'AN', 'NEG', 5, 15, 3, 0.8, { invertidos: 5 })] }));
    assert.deepEqual(v.errores, []);
    g.datosGenerados = b;
    const et = g.obtenerEtiquetas();
    for (let j = 1; j <= 5; j++) assert.match(et[`AN${j}`], /INVERTIDO: recodificar como 6 − valor/, `AN${j}`);
    // recodificados, suman el total pedido
    const recod = Array.from({ length: b.n }, (_, i) => [1, 2, 3, 4, 5].reduce((s, j) => s + (6 - col(b, `AN${j}`)[i]), 0));
    assert.ok(Math.abs(media(recod) - 15) < 0.3, `total recodificado: ${media(recod)}`);
    assert.ok(generador(base(300, { pruebas: [escala('Afecto negativo', 'AN', 'NEG', 5, 15, 3, 0.8, { invertidos: 6 })] })).validarConfiguracion().errores.some((/** @type {string} */ e) => /más ítems invertidos \(6\) que ítems \(5\)/.test(e)));
});

test('avisos de la validación: una escala con un solo límite por ítem; sin los avisos falsos de las binarias y las categóricas', () => {
    const v1 = generador(base(300, { pruebas: [escala('Ansiedad', 'AN', 'BAI', 10, 30, 6, 0.85, { minimo: 1, maximo: null })] })).validarConfiguracion();
    assert.ok(v1.advertencias.some((/** @type {string} */ a) => /Escala "Ansiedad": tiene mínimo por ítem \(1\) pero no máximo: sin los dos límites se genera como escala continua/.test(a)), JSON.stringify(v1.advertencias));
    const v2 = generador(base(300, { pruebas: [escala('Ansiedad', 'AN', 'BAI', 10, 30, 6, 0.85, { minimo: null, maximo: 5 })] })).validarConfiguracion();
    assert.ok(v2.advertencias.some((/** @type {string} */ a) => /tiene máximo por ítem \(5\) pero no mínimo/.test(a)));
    const v3 = generador(base(300, { pruebas: [escala('Ansiedad', 'AN', 'BAI', 10, 30, 6, 0.85, { minimo: null, maximo: null })] })).validarConfiguracion();
    assert.ok(!v3.advertencias.some((/** @type {string} */ a) => /por ítem \(\d+\) pero no/.test(a)), 'una continua sin límites, sin aviso');
    // las binarias, las categóricas y los conteos no tienen «media fuera del rango» ni «DE muy alta»
    const socios = [socioB('Sexo', 'S', 0.45), socioC('Grado', 'G', 3), socioC('Aula', 'A', 8), { ...socioN('Faltas', 'F', 2.5, 1, null, null), distribucion: 'conteo' }];
    const v4 = generador(base(300, { pruebas: [escala('Ansiedad', 'AN', 'BAI', 10, 30, 6, 0.85)], sociodemograficos: socios })).validarConfiguracion();
    assert.deepEqual(v4.advertencias.filter((/** @type {string} */ a) => /Sexo|Grado|Aula|Faltas/.test(a)), []);
    // una continua sin mínimo que daría negativos, sí
    const v5 = generador(base(300, { pruebas: [escala('Ansiedad', 'AN', 'BAI', 10, 30, 6, 0.85)], sociodemograficos: [socioN('Horas', 'H', 2, 2, null, null), socioN('Edad', 'E', 20, 3, null, null)] })).validarConfiguracion();
    assert.ok(v5.advertencias.some((/** @type {string} */ a) => /«Horas»: con media 2, DE 2 y sin mínimo, ≈ 16 % de los casos tendría un valor negativo/.test(a)));
    assert.ok(!v5.advertencias.some((/** @type {string} */ a) => /«Edad»/.test(a)), 'la Edad (20 ± 3) no daría negativos');
});

// ---- Lo que encontró la revisión independiente de la 2026.12.30 ----

test('(revisión) la asimétrica es log-normal: sin avisos de negativos ni de recortes que no ocurren, y con media > 0', () => {
    const pruebas = [escala('Ansiedad', 'AN', 'BAI', 10, 30, 6, 0.85)];
    const asim = (/** @type {object} */ extra) => ({ ...socioN('Horas', 'H', 2, 2, null, null, { decimales: 2 }), distribucion: 'asimetrica', ...extra });
    for (const s of [asim({}), asim({ minimo: 0 })]) {
        const { v, b } = generar(base(2000, { pruebas, sociodemograficos: [socioB('Sexo', 'S', 0.5), s] }));
        assert.deepEqual(v.advertencias.filter((/** @type {string} */ a) => /«Horas»/.test(a)), [], JSON.stringify(s));
        const x = col(b, 'Horas');
        assert.equal(x.filter(t => t <= 0).length, 0, 'ningún valor en 0 ni negativo');
    }
    // con un máximo sí se recorta, y el aviso da la parte de la log-normal (≈ 11 % por encima de 4)
    const { v, b } = generar(base(4000, { pruebas, sociodemograficos: [socioB('Sexo', 'S', 0.5), asim({ maximo: 4 })] }));
    assert.ok(v.advertencias.some((/** @type {string} */ a) => /«Horas»: con media 2 y DE 2, ≈ 11 % de los casos caería fuera del rango \(≤ 4\)/.test(a)), JSON.stringify(v.advertencias));
    const enTope = col(b, 'Horas').filter(t => t === 4).length / b.n;
    assert.ok(Math.abs(enTope - 0.106) < 0.03, `en el tope: ${enTope}`);
    // la normal, en cambio, sí avisa de los negativos
    const vn = generador(base(300, { pruebas, sociodemograficos: [socioN('Horas', 'H', 2, 2, null, null)] })).validarConfiguracion();
    assert.ok(vn.advertencias.some((/** @type {string} */ a) => /«Horas»: con media 2, DE 2 y sin mínimo, ≈ 16 % de los casos tendría un valor negativo/.test(a)));
    // y una asimétrica con media 0 es un error
    assert.ok(generador(base(300, { pruebas, sociodemograficos: [asim({ promedio: 0 })] })).validarConfiguracion().errores.some((/** @type {string} */ e) => /la distribución asimétrica \(log-normal\) necesita una media mayor que 0/.test(e)));
});

test('(revisión) modo exacto con muy pocos casos para las variables: por muestreo y con aviso, sin columnas constantes', () => {
    const nombres = ['Ansiedad', 'Depresión', 'Estrés', 'Apoyo', 'Bienestar', 'Resiliencia'];
    const pruebas = nombres.map((nm, i) => escala(nm, 'E' + String.fromCharCode(65 + i), 'T' + i, 5, 15, 3, 0.8));
    const { g, v, b } = generar(base(5, { pruebas, sociodemograficos: [socioB('Sexo', 'S', 0.5), socioN('Edad', 'ED', 20, 2, null, null, { decimales: 1 })] }));
    assert.ok(v.advertencias.some((/** @type {string} */ a) => /Con N=5 y 7 variables continuas, la media, la DE y las correlaciones no pueden hacerse exactas \(hacen falta al menos 8 casos\)/.test(a)), JSON.stringify(v.advertencias));
    for (const p of g.configuracion.pruebas) {
        const t = col(b, g.columnaDeEscala(p));
        assert.ok(new Set(t).size > 1, `${p.nombre}: total constante ${t.join('/')}`);
    }
    assert.equal(g.exactitudPorMuestreo, true);
    // (segunda revisión) con n = m + 1 la matriz ya es de rango completo: exacta, como antes, y sin aviso
    const socios = [socioB('Sexo', 'S', 0.5), socioN('Edad', 'ED', 20, 2, null, null, { decimales: 1 })];
    const ocho = generar(base(8, { pruebas, sociodemograficos: socios }));
    assert.equal(ocho.g.exactitudPorMuestreo, false);
    assert.ok(!ocho.v.advertencias.some((/** @type {string} */ a) => /no pueden hacerse exactas/.test(a)));
    // y las ondas de una medida repetida cuentan como variables (2 escalas con 3 ondas: 6), las uniformes no
    const dos = pruebas.slice(0, 2);
    const conOndas = generador(base(6, { pruebas: dos, sociodemograficos: [socioB('Sexo', 'S', 0.5), { ...socioN('Horas', 'H', 8, 1, 1, 15), distribucion: 'uniforme' }],
        medidasRepetidas: dos.map(p => ({ variable: p.nombre, ondas: 3, estabilidad: 0.6, cambio: 0, agrupacion: '', cambioGrupo: null, modelo: 'ar1' })) })).validarConfiguracion();
    assert.ok(conOndas.advertencias.some((/** @type {string} */ a) => /Con N=6 y 6 variables continuas/.test(a)), JSON.stringify(conOndas.advertencias));
});

test('(segunda revisión) por muestreo, el informe juzga todo con las tolerancias del muestreo: sin ✗ falsas en la r ni en la α', () => {
    const cont = (/** @type {string} */ nombre, /** @type {string} */ corto) => escala(nombre, corto, 'T' + corto, 4, 40, 8, 0.8, { minimo: null, maximo: null });
    for (const n of [3, 4]) {
        const { g, inf } = generar(base(n, { semilla: 11, sociodemograficos: [], pruebas: [cont('A', 'A'), cont('B', 'B'), cont('C', 'C'), cont('D', 'D')], correlaciones: [{ a: 'A', b: 'B', r: 0.5 }] }));
        assert.equal(g.exactitudPorMuestreo, true, `n = ${n}`);
        assert.deepEqual(inf.filter((/** @type {any} */ f) => f.ok === false).map((/** @type {any} */ f) => `${f.tipo} ${f.variable}`), [], `n = ${n}`);
    }
});

test('(revisión) una escala continua cuya media está cerca del 0 avisa de los totales y los ítems negativos', () => {
    const tr = escala('Tiempo de reacción', 'TR', 'TR', 5, 10, 8, 0.8, { minimo: null, maximo: null });
    const v = generador(base(1000, { pruebas: [tr] })).validarConfiguracion();
    assert.ok(v.advertencias.some((/** @type {string} */ a) => /Escala "Tiempo de reacción": es continua \(sin rango por ítem\) y, con media 10 y DE 8, ≈ 11 % de los totales y ≈ 18 % de las puntuaciones de los ítems serían negativos/.test(a)), JSON.stringify(v.advertencias));
    const lejos = generador(base(1000, { pruebas: [escala('Tiempo de reacción', 'TR', 'TR', 4, 2000, 300, 0.7, { minimo: null, maximo: null })] })).validarConfiguracion();
    assert.ok(!lejos.advertencias.some((/** @type {string} */ a) => /serían negativos/.test(a)), 'lejos del 0, sin aviso');
});

test('(revisión) el CSV de la base no deja fórmulas: los nombres y las etiquetas que empiezan por «=», «+», «-» o «@» llevan un apóstrofo', () => {
    const s = { ...socioC('=2+3', 'F', 2), niveles: [{ codigo: 1, etiqueta: '=1+1', proporcion: 0.5 }, { codigo: 2, etiqueta: '@SUM(1+1)', proporcion: 0.5 }] };
    const { g, b } = generar(base(40, { pruebas: [escala('Ansiedad', 'A', 'T', 8, 24, 5, 0.8)], sociodemograficos: [s] }));
    g.datosGenerados = b;
    for (const sep of [';', ',']) {
        const lineas = g.exportarCSV(sep).split('\n');
        assert.ok(lineas[0].split(sep).includes("'=2+3"), lineas[0]);
        assert.ok(lineas.slice(1).every(l => !l || /^\d+[;,]'(=1\+1|@SUM\(1\+1\))[;,]/.test(l)), lineas.slice(1, 4).join(' | '));
    }
});

