// citas-redacciones.test.js — (2027.01.20) las citas frente a las referencias en el Word de cada rama de las redacciones de
// las tarjetas de las fases A, B y C (medidas repetidas, correlación parcial, datos perdidos, potencia): cada cita tiene su
// referencia y cada referencia se cita (tests/ui/citas.js). Las pruebas de interfaz lo comprueban en sus Word; aquí, en las
// ramas que ellas no recorren: las seis pruebas de las relacionadas con y sin corrección de la esfericidad, la Spearman parcial,
// los perdidos sin imputar y cada prueba de la potencia.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { problemasDeCitas } from '../ui/citas.js';
import { sfc32 } from '../../src/core/random/sfc32.js';
import { generadorNormales } from '../../src/core/random/normal.js';
import { protocoloRelacionadas } from '../../src/core/stats/protocolo-relacionadas.js';
import { documentoWordRelacionadas, tablaParesGrupos, redactar } from '../../src/analizador/relacionadas/redaccion.js';

const PNG = { url: 'data:image/png;base64,', w: 1, h: 1 };
const limpio = { sinReferencia: [], sinCita: [] };

/** Una matriz de n personas × k medidas. @param {number} semilla @param {number} n @param {(z: () => number, i: number, u: () => number) => number[]} fila */
function matriz(semilla, n, fila) { const g = sfc32(semilla), z = generadorNormales(g.siguiente); return Array.from({ length: n }, (_, i) => fila(z, i, g.siguiente)); }

/**
 * Unas medidas con errores AR(1) (las cercanas se parecen más: la esfericidad no se cumple), normales.
 * @param {number} semilla @param {number} n @param {number} k @param {number} rho @param {(i: number, j: number) => number} media
 */
function ar1(semilla, n, k, rho, media) {
    return matriz(semilla, n, (z, i) => { const b = z(); let e = z(); const f = [media(i, 0) + 5 * b + 3 * e]; for (let j = 1; j < k; j++) { e = rho * e + Math.sqrt(1 - rho * rho) * z(); f.push(media(i, j) + 5 * b + 3 * e); } return f; });
}

test('las medidas repetidas: cada prueba del protocolo, con y sin corrección, cita lo que referencia', () => {
    const casos = /** @type {[string, number[][], number[] | null, string, string?][]} */ ([
        ['t-pareada', matriz(1, 40, z => { const s = z(); return [50 + 5 * s + 2 * z(), 52 + 5 * s + 2 * z()]; }), null, 't-pareada'],
        ['wilcoxon', matriz(2, 40, z => { const s = 50 + 5 * z(); return [s, s + Math.exp(1.2 * z())]; }), null, 'wilcoxon'],
        ['anova-rm', matriz(3, 40, z => { const s = z(); return [0, 1, 2].map(j => 50 + 5 * s + 1.5 * j + 3 * z()); }), null, 'anova-rm'],
        ['anova-rm con Greenhouse-Geisser', ar1(1, 40, 5, 0.95, (i, j) => 50 + 0.6 * j), null, 'anova-rm', 'gg'],
        ['anova-rm con Huynh-Feldt', ar1(2, 40, 5, 0.5, (i, j) => 50 + 0.6 * j), null, 'anova-rm', 'hf'],
        ['friedman', matriz(5, 40, z => { const s = z(); return [0, 1, 2].map(j => 50 + 3 * s + Math.exp(1.5 * z()) + j); }), null, 'friedman'],
        ['mcnemar', matriz(6, 60, (z, i) => [i % 3 === 0 ? 1 : 0, i % 2 === 0 ? 1 : 0]), null, 'mcnemar'],
        ['cochran', matriz(7, 60, (z, i) => [i % 3 === 0 ? 1 : 0, i % 2 === 0 ? 1 : 0, i % 5 < 3 ? 1 : 0]), null, 'cochran'],
        ['mixto con interacción', matriz(8, 40, (z, i) => { const s = z(), g = i % 2; return [0, 1, 2].map(j => 50 + 5 * s + (g ? 3 * j : 0) + 2 * z()); }), Array.from({ length: 40 }, (_, i) => i % 2), 'anova-mixta'],
        ['mixto sin interacción, con pares de medidas y de grupos', matriz(9, 60, (z, i) => { const s = z(); return [0, 1, 2].map(j => 50 + 4 * (i % 3) + 5 * s + 2 * j + 2 * z()); }), Array.from({ length: 60 }, (_, i) => i % 3), 'anova-mixta'],
        ['mixto con la esfericidad corregida', ar1(10, 60, 5, 0.9, (i, j) => 50 + (i % 3) * j), Array.from({ length: 60 }, (_, i) => i % 3), 'anova-mixta']
    ]);
    const vistas = new Set();
    for (const [nombre, Y, grupos, prueba, correccion] of casos) {
        const P = /** @type {any} */ (protocoloRelacionadas(Y, { alfa: 0.05, grupos }));
        assert.equal(P.prueba, prueba, `${nombre}: la prueba esperada`);
        if (correccion) assert.equal(P.correccion, correccion, `${nombre}: la corrección esperada`);
        vistas.add(`${P.prueba}/${P.correccion || '-'}`);
        const ctx = { que: 'la ansiedad', nombres: Y[0].map((_, j) => `T${j + 1}`), factor: grupos ? 'Grupo' : null, niveles: grupos ? ['Control', 'Experimental', 'Lista de espera'] : [], excluidos: 0 };
        if (P.postHocGrupos) vistas.add('pares de grupos');
        if (P.simples) vistas.add('efectos simples');
        assert.deepEqual(problemasDeCitas(documentoWordRelacionadas(P, /** @type {any} */ (ctx), PNG)), limpio, `${nombre} (${P.prueba}, corrección ${P.correccion}, pares ${P.postHoc && P.postHoc.metodo}, simples ${!!P.simples})`);
        // sin la figura (si no se pudo rasterizar), las medidas dicotómicas no citan el intervalo de Cousineau y Morey
        assert.deepEqual(problemasDeCitas(documentoWordRelacionadas(P, /** @type {any} */ (ctx), null)), limpio, `${nombre}, sin la figura`);
    }
    for (const v of ['anova-rm/gg', 'anova-rm/hf', 'anova-mixta/gg', 'pares de grupos', 'efectos simples']) assert.ok(vistas.has(v), `se recorre ${v}: ${[...vistas]}`);
});

test('el diseño mixto informa las comparaciones por pares entre los grupos (sin interacción, tres grupos)', () => {
    const Y = matriz(9, 60, (z, i) => { const s = z(); return [0, 1, 2].map(j => 50 + 4 * (i % 3) + 5 * s + 2 * j + 2 * z()); });
    const P = /** @type {any} */ (protocoloRelacionadas(Y, { alfa: 0.05, grupos: Array.from({ length: 60 }, (_, i) => i % 3) }));
    assert.ok(P.postHocGrupos && !P.efectos.interaccion.significativa);
    const ctx = { que: 'la ansiedad', nombres: ['T1', 'T2', 'T3'], factor: 'Grupo', niveles: ['Control', 'Experimental', 'Intervención'], excluidos: 0 };
    const T = tablaParesGrupos(P, /** @type {any} */ (ctx));
    assert.ok(T);
    assert.equal(T.filas.length, 3);
    assert.deepEqual(T.filas.map(f => f[0]), ['Control − Experimental', 'Control − Intervención', 'Experimental − Intervención']);
    // la diferencia de medias, con el signo de la t (la media de las medidas de cada grupo)
    for (const f of T.filas) assert.equal(Math.sign(Number(String(f[1]).replace('−', '-'))), Math.sign(Number(String(f[2]).replace('−', '-'))));
    assert.match(T.nota, /\(57 gl\)/);
    const texto = redactar(P, /** @type {any} */ (ctx));
    assert.match(texto, /Las comparaciones por pares entre los grupos \(la media de las medidas de cada persona, corrección de Holm\) sitúan las diferencias entre /);
    assert.match(texto, /Control e Intervención|Experimental e Intervención/, 'la «e» ante /i/');
});

test('la correlación parcial, de Pearson y de Spearman, cita lo que referencia', async () => {
    const { correlacionParcial } = await import('../../src/core/stats/correlacion-parcial.js');
    const { documentoWordParcial } = await import('../../src/analizador/relaciones/correlacion-parcial-redaccion.js');
    const Y = matriz(11, 80, z => { const c = z(), x = 0.6 * c + z(); return [x, 0.5 * c + 0.3 * x + z(), c]; });
    const col = (/** @type {number} */ j) => Y.map(f => /** @type {number} */ (f[j]));
    for (const spearman of [false, true]) {
        const r = /** @type {any} */ (correlacionParcial(col(0), col(1), [col(2)], { spearman }));
        const ctx = { x: 'Estrés', y: 'Ansiedad', controles: ['Edad'], motivo: 'porque los datos se ajustan a la normal', excluidos: 0 };
        assert.deepEqual(problemasDeCitas(documentoWordParcial(r, /** @type {any} */ (ctx), 0.05)), limpio, spearman ? 'Spearman' : 'Pearson');
    }
});

test('los datos perdidos, sin perdidos, con pocos al azar y con muchos, citan lo que referencian', async () => {
    const { patronesPerdidos, emNormal, pruebaMcarLittle } = await import('../../src/core/stats/perdidos.js');
    const { documentoWordPerdidos } = await import('../../src/analizador/perdidos/perdidos-redaccion.js');
    const base = matriz(12, 200, z => { const c = z(); return [c + z(), c + z(), c + z()]; });
    const casos = /** @type {[string, (i: number, j: number) => boolean][]} */ ([
        ['sin perdidos', () => false], ['pocos, al azar', (i, j) => j === 0 && i % 40 === 3], ['muchos', (i, j) => (i * 7 + j * 3) % 5 === 0]
    ]);
    for (const [nombre, falta] of casos) {
        const X = [0, 1, 2].map(j => Float64Array.from(base, (f, i) => (falta(i, j) ? NaN : /** @type {number} */ (f[j]))));
        const P = patronesPerdidos(X), em = P.celdasPerdidas ? emNormal(X) : null, little = em ? pruebaMcarLittle(X, em) : null;
        const disponibles = X.map(c => { const v = Array.from(c).filter(Number.isFinite), m = v.reduce((s, x) => s + x, 0) / v.length; return { n: v.length, media: m, de: Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)) }; });
        const D = /** @type {any} */ ({ variables: ['A', 'B', 'C'], P, disponibles, em, little });
        assert.deepEqual(problemasDeCitas(documentoWordPerdidos(D, { descripcion: 'las tres escalas', alfa: 0.05 }, null)), limpio, nombre);
    }
});

test('la potencia: cada prueba, en cada modo, cita lo que referencia', async () => {
    const { documentoWordPotencia, PRUEBAS } = await import('../../src/analizador/potencia/potencia-redaccion.js');
    for (const prueba of Object.keys(PRUEBAS)) {
        for (const modo of prueba === 'mediacion' ? ['muestra', 'potencia'] : ['muestra', 'potencia', 'sensibilidad']) {
            const R = /** @type {any} */ ({ modo, prueba, efecto: prueba === 'r' ? 0.3 : 0.39, alfa: 0.05, colas: 2, potenciaDeseada: 0.8, razon: 1, k: 3, gl: 1, predictores: 3, probados: 1,
                b: 0.39, cp: 0, R: 1000, semilla: 2027, n: 60, n2: prueba === 't2' ? 60 : null, total: prueba === 't2' ? 120 : prueba === 'anova' ? 180 : 60, potencia: 0.81, ee: prueba === 'mediacion' ? 0.012 : null,
                alternativos: [{ nombre: 'Pequeño', efecto: 0.1, n: 300, total: 600 }, { nombre: 'Mediano', efecto: 0.3, n: 40, total: 80 }] });
            assert.deepEqual(problemasDeCitas(documentoWordPotencia(R, PNG)), limpio, `${prueba}, ${modo}`);
        }
    }
});
