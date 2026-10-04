// tests/integration/simulador-atipicos.test.js — fase B4 del Atlas en el Simulador (2026.11.10): el atípico influyente.
// La r de la fila es la de la MAYORÍA (exacta); unas pocas filas finales se reescriben como atípicas para que la r de la base
// completa sea la pedida. El informe verifica las dos; la F3 del Analizador muestra cuánto depende la r de esos casos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeneradorDatos } from '../../src/simulador/dominio/generador.js';
import { influenciaLineal } from '../../src/analizador/relaciones/nube.js';
import { distanciaNecesaria, casosNecesarios, resolverAtipicos } from '../../src/simulador/dominio/atipicos.js';

const esc = (nombre, corto, extra = {}) => ({ nombre, nombreCorto: corto, prueba: 'T', tipo: 'dimension', numItems: 10, media: 30, desviacion: 6, minimo: 1, maximo: 5, alfa: 0.85, distribucion: 'normal', invertidos: 0, ...extra });
const pear = (a, b) => { const n = a.length; let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n; let ab = 0, aa = 0, bb = 0; for (let i = 0; i < n; i++) { ab += (a[i] - ma) * (b[i] - mb); aa += (a[i] - ma) ** 2; bb += (b[i] - mb) ** 2; } return ab / Math.sqrt(aa * bb); };
function generar({ rMay, rCon, k, n = 60, exacto = true, semilla = 5, extra = {} }) {
    const g = new GeneradorDatos();
    g.configuracion = { tamanoMuestra: n, semilla, generarPercentiles: false, correlacionesExactas: exacto, indiceFiabilidad: 'alfa', heterogeneidadItems: 'leve', variablesPorTest: { T: { variable: 'R', rIntra: 0 } },
        pruebas: [esc('Estrés', 'ES'), esc('Apoyo', 'AP', { invertidos: 2 }), esc('Calma', 'CA')], sociodemograficos: [], correlaciones: [{ a: 'Estrés', b: 'Apoyo', r: rMay }], atipicos: [{ x: 'Estrés', y: 'Apoyo', rMayoria: rMay, rCon, casos: k }],
        diferenciasGrupo: [], modelos: [], medidasRepetidas: [], estructuras: [], desenlaces: [], cortes: [], concordancias: [], realismo: {}, ...extra };
    g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas);
    const v = g.validarConfiguracion(); if (v.errores.length) return { v };
    const b = g.generarBaseDatos();
    return { v, g, b, informe: g.informePedidoObtenido(b), x: Array.from(b.columna('Dimension_ES').datos), y: Array.from(b.columna('Dimension_AP').datos) };
}

test('matemática: distancia necesaria (fórmula cerrada), casos necesarios y el resolutor (crear, destruir, invertir; lo imposible, marcado)', () => {
    assert.ok(Math.abs(distanciaNecesaria(0.05, 0.5, 1, 50).d - 6.708) < 0.01 && Math.abs(distanciaNecesaria(0.5, 0.05, 1, 50).d - 4.629) < 0.01);
    assert.equal(casosNecesarios(0.05, 0.5, 50, 3.33), 5);
    const mayoria = (r, n) => { let a = 3 >>> 0; const u = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }, nrm = () => Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u());
        const s = { n: 0, sx: 0, sy: 0, sxx: 0, syy: 0, sxy: 0 }; for (let i = 0; i < n; i++) { const z1 = nrm(), x = Math.round(30 + 6 * z1), y = Math.round(30 + 6 * (r * z1 + Math.sqrt(1 - r * r) * nrm())); s.n++; s.sx += x; s.sy += y; s.sxx += x * x; s.syy += y * y; s.sxy += x * y; } return s; };
    for (const [rMay, rObj, k] of [[0.5, 0.05, 3], [0.5, -0.2, 5], [0, 0.35, 4]]) {
        const sol = resolverAtipicos({ mayoria: mayoria(rMay, 50 - k), k, rObjetivo: rObj, limitesX: [10, 50], limitesY: [10, 50] });
        assert.ok(sol.alcanzable && Math.abs(sol.r - rObj) < 0.006, `${rMay} → ${rObj}: ${sol.r}`);
    }
    assert.equal(resolverAtipicos({ mayoria: mayoria(0.05, 49), k: 1, rObjetivo: 0.9, limitesX: [10, 50], limitesY: [10, 50] }).alcanzable, false);
});

test('en el motor: la mayoría exacta, la base completa en su objetivo, los ítems de las filas atípicas suman su total e informe sin ✗', () => {
    for (const [nombre, op] of [['crear', { rMay: 0.05, rCon: 0.5, k: 5 }], ['destruir', { rMay: 0.5, rCon: 0.05, k: 3 }], ['no exacto', { rMay: 0.5, rCon: 0.05, k: 3, exacto: false, semilla: 9 }]]) {
        const r = generar(op), n = 60, k = op.k, p = r.g.configuracion.pruebas[1];
        assert.deepEqual(r.informe.filter(f => f.ok === false).map(f => `${f.tipo} ${f.variable} ${f.pedido}→${f.obtenido}`), [], nombre);
        if (op.exacto !== false) assert.ok(Math.abs(pear(r.x.slice(0, n - k), r.y.slice(0, n - k)) - op.rMay) < 0.01, `${nombre}: mayoría exacta`);
        assert.ok(Math.abs(pear(r.x, r.y) - op.rCon) < 0.015, `${nombre}: base completa ${pear(r.x, r.y)}`);
        for (let i = n - k; i < n; i++) { let s = 0; for (let q = 1; q <= 10; q++) { const v = r.b.columna('AP' + q).datos[i]; s += r.g._esInvertido(p, q) ? r.g._reflejar(p, v) : v; } assert.equal(s, r.y[i], `${nombre}: ítems de la fila ${i + 1}`); }
        assert.ok(r.informe.some(f => f.tipo === 'r con atípicos' && f.ok === true) && r.informe.some(f => f.tipo === 'ρ' && f.ok === null));
    }
});

test('círculo cerrado con la F3: la r cambia al quitar los casos influyentes; al destruir, los plantados son los de mayor Cook (al crear, el grupo se enmascara)', () => {
    for (const [op, plantadosPrimero] of [[{ rMay: 0.05, rCon: 0.5, k: 5 }, false], [{ rMay: 0.5, rCon: 0.05, k: 3 }, true]]) {
        for (let s = 0; s < 5; s++) {
            const r = generar({ ...op, semilla: 40 + s }), inf = influenciaLineal(Float64Array.from(r.x), Float64Array.from(r.y));
            assert.ok(Math.abs(inf.rSin - inf.rTodos) >= 0.2, `la r cambia sin los casos influyentes: ${inf.rTodos} → ${inf.rSin}`);
            // al destruir, los plantados están entre los 5 casos de mayor Cook que lista la F3 (no siempre son exactamente los k primeros)
            if (plantadosPrimero) { const top = inf.principales.map(c => c.fila); assert.ok(Array.from({ length: op.k }, (_, j) => 60 - op.k + j + 1).every(f => top.includes(f)), `plantados entre los principales: ${top}`); }
        }
    }
});

test('validación: lo imposible (con los casos necesarios), más de una fila, variables con otros usos, casos y r fuera de rango; aviso si no parecerían atípicos', () => {
    const errores = op => generar(op).v.errores.join(' | '), avisos = op => generar(op).v.advertencias.join(' | ');
    assert.match(errores({ rMay: 0.05, rCon: 0.8, k: 1 }), /habría que llevarlo a 15\.0 DE.*solo permite 3\.3 DE\. (Harían falta más de 5 casos: usa|Usa) una muestra menor/);
    assert.match(errores({ rMay: 0.05, rCon: 0.5, k: 3 }), /Usa al menos 5 casos/);
    assert.match(errores({ rMay: 0.5, rCon: 0.05, k: 3, extra: { atipicos: [{ x: 'Estrés', y: 'Apoyo', rMayoria: 0.5, rCon: 0.05, casos: 3 }, { x: 'Calma', y: 'Apoyo', rMayoria: 0.3, rCon: 0, casos: 2 }] } }), /una sola fila/);
    assert.match(errores({ rMay: 0.5, rCon: 0.05, k: 3, extra: { correlaciones: [{ a: 'Estrés', b: 'Apoyo', r: 0.5 }, { a: 'Calma', b: 'Apoyo', r: 0.3 }] } }), /no pueden participar en otras correlaciones/);
    assert.match(errores({ rMay: 0.5, rCon: 0.05, k: 7 }), /de 1 a 5/);
    assert.match(errores({ rMay: 0.5, rCon: 0.45, k: 3 }), /sepáralas al menos \.10/);
    assert.match(avisos({ rMay: 0.3, rCon: 0.15, k: 5, n: 30 }), /no parecerán atípicos/);
    assert.ok(!/sepáralas/.test(errores({ rMay: 0.3, rCon: 0.2, k: 3 })), 'separadas exactamente .10: se admiten (coma flotante)');
});

test('revisión 2026.11.11: el general del test de X o de Y en otra fila → error; una escala sin rango no fija los atípicos en 0; con imperfecciones, aviso y las dos r del par informativas', () => {
    const pr = [esc('Estrés', 'ES'), esc('Apoyo', 'AP'), { ...esc('Motivación', 'MO'), prueba: 'B' }];
    const gen = generar({ rMay: 0.5, rCon: 0.05, k: 3, extra: { pruebas: pr, variablesPorTest: { T: { variable: 'Bienestar', rIntra: 0.3 }, B: { variable: 'M', rIntra: 0 } }, correlaciones: [{ a: 'Estrés', b: 'Apoyo', r: 0.5 }, { a: 'Bienestar — T', b: 'Motivación', r: 0.4 }] } });
    assert.ok(gen.v.errores.some(e => /otras correlaciones de la tabla III \(también las de «Bienestar — T»\)/.test(e)));
    const sinRango = generar({ rMay: 0.5, rCon: 0.05, k: 3, extra: { pruebas: [esc('Estrés', 'ES', { minimo: null, maximo: null }), esc('Apoyo', 'AP'), esc('Calma', 'CA')] } });
    assert.deepEqual(sinRango.informe.filter(f => f.ok === false).map(f => f.variable), []);
    assert.ok(sinRango.x.slice(57).every(v => Math.abs(v - 30) > 12), `atípicos a su distancia real: ${sinRango.x.slice(57)}`);
    const imp = generar({ rMay: 0.5, rCon: 0.05, k: 3, extra: { realismo: { pctPerdidos: 10, mecanismoPerdidos: 'MCAR', pctDescuidados: 10, tipoDescuidado: 'aleatorio' } } });
    assert.ok(imp.v.advertencias.some(a => /también alcanzan a las filas atípicas/.test(a)));
    // (2026.11.13) el informe verifica la base ANTES de las imperfecciones: las dos r del par se verifican
    assert.ok(imp.informe.filter(f => /Estrés ↔ Apoyo/.test(f.variable) && (f.tipo === 'r' || f.tipo === 'r con atípicos')).every(f => f.ok === true));
});

