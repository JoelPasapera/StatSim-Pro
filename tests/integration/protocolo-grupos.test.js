// @ts-check
// tests/integration/protocolo-grupos.test.js — (2026.12.20) el protocolo único de comparación de grupos
// (core/stats/protocolo-grupos.js), el de la vista principal, la pestaña de grupos, el Word y la criba sociodemográfica.
// Hasta la 2026.12.19, con tres o más grupos normales de varianzas desiguales, la vista principal aplicaba el ANOVA clásico y
// la pestaña Kruskal-Wallis, y sus post-hoc eran t de Student con Bonferroni y t de Welch con Holm. Referencias
// (tests/oracle/inferencia_oraculo.py): el ANOVA de Welch por la forma de Welch-James (Johansen, 1980) y las salidas
// publicadas de R (oneway.test con sleep e InsectSprays; aov y kruskal.test con InsectSprays); los post-hoc por los residuos
// de una regresión con variables ficticias (MCE), la t de Welch de scipy y los rangos de scipy (Dunn); y la decisión del
// protocolo en siete conjuntos de datos, con Shapiro-Wilk y Levene de scipy.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { datos: D, esperado: E } = JSON.parse(fs.readFileSync(new URL('../oracle/inferencia_fixture.json', import.meta.url), 'utf8'));
/** @type {any} */ let A, CG, SD, C, PG;
before(async () => {
    A = (await import('../../src/analizador/estadistica.js')).AnalizadorEstadistico;
    CG = (await import('../../src/analizador/comparacion-grupos.js')).ComparacionGrupos;
    SD = (await import('../../src/analizador/criba-sociodemografica.js')).CribaSociodemografica;
    C = await import('../../src/core/stats/contrastes.js');
    PG = await import('../../src/core/stats/protocolo-grupos.js');
});
/** @param {number} x @param {number} ref @param {number} rel @param {string} que */
const cerca = (x, ref, rel, que) => assert.ok(Math.abs(x - ref) <= rel * Math.abs(ref), `${que}: ${x} frente a ${ref}`);
// generador con semilla (mulberry32) y normales por Box-Muller
/** @param {number} semilla */
function generador(semilla) {
    let s = semilla >>> 0;
    const u = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    return { u, normal: () => Math.sqrt(-2 * Math.log(u() || 1e-300)) * Math.cos(2 * Math.PI * u()) };
}

test('ANOVA de Welch: las salidas publicadas de R (oneway.test con sleep e InsectSprays) y la forma de Welch-James', () => {
    const R = E.gruposR, s = C.anovaWelch(D.gruposR.sleep), i = C.anovaWelch(D.gruposR.insect);
    for (const [que, x, e] of [['sleep', s, R.sleep.welchJames], ['InsectSprays', i, R.insect.welchJames]]) {
        cerca(x.F, e.F, 1e-12, `${que}: F`); assert.equal(x.gl1, e.gl1); cerca(x.gl2, e.gl2, 1e-12, `${que}: gl₂`); cerca(x.pValor, e.p, 1e-9, `${que}: p`);
    }
    // las salidas de R, con las cifras que imprime
    assert.ok(Math.abs(s.F - 3.4626) < 5e-5 && Math.abs(s.gl2 - 17.776) < 5e-4 && Math.abs(s.pValor - 0.07939) < 5e-6, `sleep: ${JSON.stringify(s)}`);
    assert.ok(Math.abs(i.F - 36.065) < 5e-4 && Math.abs(i.gl2 - 30.043) < 5e-4 && Math.abs(i.pValor / 7.999e-12 - 1) < 2e-4, `InsectSprays: ${JSON.stringify(i)}`);
    assert.ok(Math.abs(C.anova(D.gruposR.insect).F - 34.70) < 5e-3, 'aov');
    const k = C.kruskal(D.gruposR.insect);
    assert.ok(Math.abs(k.H - 54.691) < 5e-4 && Math.abs(k.pValor / 1.511e-10 - 1) < 5e-4, `kruskal.test: ${JSON.stringify(k)}`);
    assert.equal(i.eta2, C.anova(D.gruposR.insect).eta2, 'el η² que acompaña al de Welch es el descriptivo del clásico');
});

test('con dos grupos, el ANOVA de Welch es el cuadrado de la t de Welch y su gl₂, el de Satterthwaite', () => {
    for (const [x, y] of [[D.a, D.b], D.protocoloGrupos.welch, D.protocoloGrupos.student, D.gruposR.sleep]) {
        const w = C.anovaWelch([x, y]), t = C.tWelch(x, y);
        cerca(w.F, t.t * t.t, 1e-12, 'F = t²'); cerca(w.gl2, t.gl, 1e-12, 'gl₂'); cerca(w.pValor, t.pValor, 1e-10, 'p');
    }
});

test('los tres post-hoc (t con la MCE, t de Welch, z de Dunn) con Holm, frente a numpy y scipy, en todos los conjuntos de 3 o más grupos', () => {
    let n = 0;
    for (const [nombre, gs] of Object.entries(D.protocoloGrupos)) {
        const todos = E.protocoloGrupos[nombre].paresTodos;
        if (!todos) continue;
        for (const metodo of /** @type {const} */ (['mce', 'welch', 'dunn'])) {
            const pares = PG.postHocHolm(gs, metodo), e = todos[metodo];
            assert.equal(pares.length, e.length, `${nombre}/${metodo}: número de pares`);
            pares.forEach((/** @type {any} */ p, /** @type {number} */ j) => {
                const q = e[j], que = `${nombre}/${metodo} par ${p.i}-${p.j}`;
                cerca(p.estadistico, q.estadistico, 1e-11, `${que}: estadístico`); cerca(p.pValor, q.p, 1e-9, `${que}: p`); cerca(p.pHolm, q.pHolm, 1e-9, `${que}: p de Holm`);
                if (q.gl === null) assert.equal(p.gl, null, que); else cerca(p.gl, q.gl, 1e-12, `${que}: gl`);
                assert.equal(p.significativa, q.pHolm < 0.05, que); n++;
            });
        }
    }
    assert.ok(n >= 3 * (3 + 6 + 6 + 3), `pares comprobados: ${n}`);
});

test('la z de Dunn con dos grupos (y empates) es la U de Mann-Whitney sin corrección por continuidad', () => {
    const [x, y] = D.gruposR.dunnDos, dz = C.comparacionesPorPares([x, y], 'dunn')[0], mw = C.mannWhitney(x, y);
    cerca(dz.pValor, E.gruposR.dunnDos.p, 1e-10, 'frente a scipy'); cerca(dz.pValor, mw.pValor, 1e-12, 'frente a la del núcleo'); cerca(Math.abs(dz.estadistico), Math.abs(mw.z), 1e-12, '|z|');
});

test('el protocolo elige la rama de cada conjunto (siete) con los supuestos, la prueba global y el post-hoc de scipy', () => {
    const vistas = new Set();
    for (const [nombre, gs] of Object.entries(D.protocoloGrupos)) {
        const e = E.protocoloGrupos[nombre], P = PG.protocoloGrupos(gs);
        assert.equal(P.prueba, e.prueba, nombre); vistas.add(P.prueba);
        P.normalidad.forEach((/** @type {any} */ r, /** @type {number} */ i) => cerca(r.pValor, e.normalidad[i], 1e-9, `${nombre}: Shapiro-Wilk del grupo ${i}`));
        cerca(P.levene.pValor, e.levene, 1e-9, `${nombre}: Levene`);
        const g = P.global, eg = e.global, est = g.t ?? g.U ?? g.F ?? g.H;
        cerca(est, eg.estadistico, 1e-10, `${nombre}: estadístico`); cerca(g.pValor, eg.p, 1e-8, `${nombre}: p global`);
        if (Array.isArray(eg.gl)) { assert.equal(g.gl1, eg.gl[0]); cerca(g.gl2, eg.gl[1], 1e-12, `${nombre}: gl₂`); }
        else if (eg.gl !== null) cerca(g.gl, eg.gl, 1e-12, `${nombre}: gl`);
        if (eg.eta2 !== undefined) cerca(g.eta2, eg.eta2, 1e-12, `${nombre}: η²`);
        if (eg.epsilon2 !== undefined) cerca(g.epsilon2, eg.epsilon2, 1e-10, `${nombre}: ε²`);
        assert.equal(P.significativa, e.significativa, nombre); assert.equal(P.rama, P.todasNormales ? 'parametrica' : 'noparametrica');
        if (!e.postHoc) { assert.equal(P.postHoc, null, `${nombre}: sin post-hoc`); continue; }
        assert.equal(P.postHoc.metodo, e.postHoc.metodo, nombre); assert.equal(P.postHoc.nombre, PG.NOMBRE_POSTHOC[e.postHoc.metodo]); assert.equal(P.postHoc.ajuste, 'Holm');
        P.postHoc.pares.forEach((/** @type {any} */ p, /** @type {number} */ j) => cerca(p.pHolm, e.postHoc.pares[j].pHolm, 1e-9, `${nombre}: Holm del par ${j}`));
    }
    assert.deepEqual([...vistas].sort(), ['anova', 'anova-welch', 'kruskal-wallis', 'mann-whitney', 'student', 'welch'], 'las seis ramas');
    // la regla, también por separado, y el post-hoc de cada prueba global
    assert.equal(PG.elegirPrueba(3, true, false), 'anova-welch'); assert.equal(PG.elegirPrueba(2, true, false), 'welch'); assert.equal(PG.elegirPrueba(4, false, true), 'kruskal-wallis');
    assert.deepEqual(['anova', 'anova-welch', 'kruskal-wallis', 'student', 'welch', 'mann-whitney'].map(PG.postHocDe), ['mce', 'welch', 'dunn', null, null, null]);
});

test('las cuatro vistas aplican el MISMO protocolo: vista principal, pestaña de grupos (y su Word) y criba sociodemográfica', () => {
    for (const [nombre, gs] of Object.entries(D.protocoloGrupos)) {
        const P = PG.protocoloGrupos(gs);
        A.cargarDatos(gs.flatMap((/** @type {number[]} */ g, /** @type {number} */ i) => g.map(v => ({ ID: 0, Grupo: `G${i}`, General_V: v, General_W: v % 7 }))));
        // la pestaña (que ordena los grupos por tamaño) y la vista principal con ese mismo orden: bit a bit
        const T = CG.analizar('Grupo', 'General_V', 'Grupo', 'V'), ord = T.grupos.map((/** @type {any} */ g) => +g.nombre.slice(1));
        const gsT = ord.map((/** @type {number} */ i) => gs[i]), etT = ord.map((/** @type {number} */ i) => `G${i}`);
        const M = gs.length === 2 ? A.compararGrupos(gsT[0], gsT[1], etT[0], etT[1]) : A.compararVariosGrupos(gsT, etT);
        cerca(T.prueba.pValor, P.global.pValor, 1e-12, `${nombre}: pestaña frente al núcleo`);
        assert.equal(M.prueba.pValor, T.prueba.pValor, `${nombre}: vista principal = pestaña`);
        assert.equal(M.decision === 'rechazar', T.prueba.significativa, nombre); assert.equal(M.parametrica, T.rama === 'parametrica', nombre);
        assert.equal(T.razon.length > 20, true);
        if (gs.length > 2) {
            assert.equal(!M.postHoc, !T.postHoc, `${nombre}: post-hoc en las dos o en ninguna`);
            if (T.postHoc) {
                assert.equal(M.postHoc.metodo, 'Holm'); assert.equal(M.postHoc.prueba, T.postHoc[0].nombre); assert.equal(M.postHoc.clave, T.metodoPostHoc);
                M.postHoc.comparaciones.forEach((/** @type {any} */ c, /** @type {number} */ j) => {
                    const t = T.postHoc[j];
                    assert.equal(c.grupo1, t.a); assert.equal(c.grupo2, t.b); assert.equal(c.pAjustada, t.pHolm); assert.equal(c.significativa, t.sig);
                });
            }
            // la criba sociodemográfica: «Grupo» es una variable categórica de 3 o 4 grupos (hasta la 2026.12.19, «próximamente»)
            const H = SD.analizar('General_V', 'General_W', 'V', 'W'), fila = H.filas.find((/** @type {any} */ f) => f.socio === 'Grupo' && f.variable === 'V');
            assert.ok(fila && fila.tipo === 'comparacion', `${nombre}: fila de la criba ${JSON.stringify(fila)}`);
            assert.equal(fila.prueba, M.prueba.prueba); cerca(fila.p, M.prueba.pValor, 1e-12, `${nombre}: p de la criba`);
            assert.match(fila.efecto, /^(η²|ε²) = \d\.\d\d \((trivial|pequeño|mediano|grande)\)$/); assert.match(fila.detalle, fila.prueba === 'Kruskal-Wallis' ? /^rango medio más alto: G\d$/ : /^media más alta: G\d$/, `${nombre}: el grupo mayor, por rangos si la prueba es por rangos (2026.12.30)`);
        }
    }
});

test('la criba y la pestaña: los grupos de menos de 3 casos se excluyen y, con más de 10 grupos, no hay prueba', () => {
    const { normal } = generador(1220), filas = [];
    for (const [g, n, m] of [['A', 20, 50], ['B', 25, 55], ['C', 2, 40], ['D', 18, 52]]) for (let i = 0; i < n; i++) filas.push({ ID: filas.length + 1, Carrera: g, Muchos: `N${filas.length % 11}`, General_V: +(m + 5 * normal()).toFixed(2), General_W: +(10 + normal()).toFixed(2) });
    A.cargarDatos(filas);
    const H = SD.analizar('General_V', 'General_W', 'V', 'W'), fila = H.filas.find((/** @type {any} */ f) => f.socio === 'Carrera' && f.variable === 'V');
    assert.ok(fila.detalle.endsWith('excluidos por n < 3: C (n = 2)'), fila.detalle);
    const gr = ['A', 'B', 'D'].map(g => filas.filter(f => f.Carrera === g).map(f => f.General_V));
    cerca(fila.p, A.compararVariosGrupos(gr, ['A', 'B', 'D']).prueba.pValor, 1e-12, 'la prueba, sin el grupo pequeño');
    const nueve = H.filas.find((/** @type {any} */ f) => f.socio === 'Muchos' && f.variable === 'V');
    assert.equal(nueve.tipo, 'omitida'); assert.equal(nueve.p, null); assert.match(nueve.detalle, /más de 10/); assert.equal(nueve.prueba, '11 grupos');
    assert.match(CG.analizar('Muchos', 'General_V').error, /demasiados grupos \(11\)/, 'la pestaña (y el Word) con el mismo máximo que la vista principal');
    assert.ok(!CG.analizar('Carrera', 'General_V').error, 'con 3 grupos comparables (C se excluye), sí');
    assert.equal(H.totalPruebas, H.filas.filter((/** @type {any} */ f) => Number.isFinite(f.p)).length, 'la familia de Holm: solo las pruebas realizadas');
});

test('casos límite: varianza nula (Welch indefinido y la guarda de la vista principal), empates totales, método desconocido y grupos pequeños', () => {
    const w = C.anovaWelch([[5, 5, 5], [1, 2, 3], [4, 6, 8]]);
    assert.ok(Number.isNaN(w.F) && Number.isNaN(w.gl2) && Number.isNaN(w.pValor)); assert.equal(w.gl1, 2);
    const m = A.anovaWelch([[5, 5, 5], [1, 2, 3], [4, 6, 8]]); assert.equal(m.F, 0); assert.equal(m.pValor, 1); assert.equal(m.prueba, 'ANOVA de Welch');
    C.comparacionesPorPares([[3, 3, 3], [3, 3, 3], [3, 3, 3]], 'dunn').forEach((/** @type {any} */ p) => { assert.equal(p.estadistico, 0); assert.equal(p.pValor, 1); });
    assert.throws(() => C.comparacionesPorPares([[1, 2, 3], [4, 5, 6]], /** @type {any} */ ('tukey')), /método desconocido/);
    assert.throws(() => PG.protocoloGrupos([[1, 2, 3], [4, 5]]), /al menos 3 observaciones/);
    assert.throws(() => PG.protocoloGrupos([[1, 2, 3]]), /al menos dos grupos/);
    // un grupo constante no es normal: el protocolo va por rangos y nunca llega al Welch indefinido
    assert.equal(PG.protocoloGrupos([[5, 5, 5, 5], [1, 2, 3, 4.5], [4, 6, 8, 9]]).prueba, 'kruskal-wallis');
    // Levene con F infinita (dispersión nula dentro de cada grupo, distinta entre ellos): p = 0 en el núcleo, el protocolo y la
    // vista principal (hasta la 2026.12.19 esta daba F = 0 y p = 1, «varianzas iguales»)
    const lv = A.pruebaLevene([[1, 3, 1, 3], [2, 6, 2, 6], [0, 10, 0, 10]]);
    assert.equal(lv.estadistico, Infinity); assert.equal(lv.pValor, 0); assert.equal(lv.varianzasIguales, false);
    const cero = A.pruebaLevene([[5, 5, 5, 5], [7, 7, 7, 7]]); assert.equal(cero.estadistico, 0); assert.equal(cero.pValor, 1);   // 0/0: la guarda de siempre
});

test('Monte Carlo: con varianzas desiguales y el grupo más disperso el más pequeño, el ANOVA clásico rechaza de más; el de Welch conserva el 5 %', () => {
    const { normal } = generador(20261220), R = 4000;
    let clasico = 0, welch = 0;
    for (let r = 0; r < R; r++) {
        const gs = [[8, 4], [16, 2], [32, 1]].map(([n, de]) => Array.from({ length: n }, () => de * normal()));
        if (C.anova(gs).pValor < 0.05) clasico++;
        if (C.anovaWelch(gs).pValor < 0.05) welch++;
    }
    assert.ok(welch / R > 0.035 && welch / R < 0.07, `Welch: ${welch / R}`);   // ≈ 0,053 (20 000 réplicas en Python)
    assert.ok(clasico / R > 0.18, `clásico: ${clasico / R}`);                  // ≈ 0,25
});

test('Monte Carlo: sin diferencias entre los grupos, Holm mantiene la tasa de error familiar de los tres post-hoc por debajo del 5 %', () => {
    const { normal, u } = generador(7), R = 3000, fallos = { mce: 0, welch: 0, dunn: 0 }, tam = [10, 15, 20, 25];
    for (let r = 0; r < R; r++) {
        const gs = tam.map(n => Array.from({ length: n }, () => normal())), ge = tam.map(n => Array.from({ length: n }, () => Math.round(-10 * Math.log(1 - u())) / 10));
        for (const [metodo, g] of /** @type {Array<['mce' | 'welch' | 'dunn', number[][]]>} */ ([['mce', gs], ['welch', gs], ['dunn', ge]])) {
            if (PG.postHocHolm(g, metodo).some((/** @type {any} */ p) => p.significativa)) fallos[metodo]++;
        }
    }
    for (const [metodo, f] of Object.entries(fallos)) assert.ok(f / R > 0.025 && f / R < 0.06, `${metodo}: ${f / R}`);   // ≈ 0,04 en los tres (Python, 4 000 réplicas)
});

test('(2027.01.17) el intervalo del tamaño del efecto en cada rama: el de la d (t no central) con la g, el de η² (F no central) con la ω², y ninguno en las de rangos', async () => {
    const { protocoloGrupos, intervaloEfecto } = await import('../../src/core/stats/protocolo-grupos.js');
    const { intervaloDDosGrupos, intervaloEta2, omega2 } = await import('../../src/core/stats/efectos.js');
    const a = [12.1, 13.4, 11.8, 14.2, 12.9, 13.7, 12.2, 13.1, 14.0, 12.6], b = [13.9, 14.8, 15.2, 14.1, 15.9, 14.6, 15.3, 14.0, 16.1, 15.0];
    const P = protocoloGrupos([a, b]);
    assert.equal(P.prueba, 'student');
    const t = P.global.d / Math.sqrt(1 / a.length + 1 / b.length), r = intervaloDDosGrupos(t, a.length, b.length);
    assert.ok(P.efectoIC && P.efectoIC.clave === 'd');
    assert.deepEqual([P.efectoIC.inferior, P.efectoIC.superior, P.efectoIC.g], [r.inferior, r.superior, r.g]);
    assert.ok(P.efectoIC.inferior < P.global.d && P.global.d < P.efectoIC.superior, 'el intervalo contiene la d');
    const c = [16.2, 17.1, 15.8, 16.9, 17.4, 16.0, 16.6, 17.8, 16.3, 17.0], Q = protocoloGrupos([a, b, c]);
    assert.equal(Q.prueba, 'anova');
    const ic = intervaloEta2(Q.global.F, Q.global.gl1, Q.global.gl2);
    assert.ok(Q.efectoIC && Q.efectoIC.clave === 'eta2');
    assert.deepEqual([Q.efectoIC.inferior, Q.efectoIC.superior, Q.efectoIC.omega2], [ic.inferior, ic.superior, omega2(Q.global.F, Q.global.gl1, Q.global.gl2)]);
    assert.equal(intervaloEfecto('mann-whitney', [a, b], P.global), null);
    assert.equal(intervaloEfecto('student', [[1, 1, 1], [2, 2, 2]], { t: Infinity, gl: 4, pValor: 0, d: Infinity }), null, 'grupos constantes y distintos: sin intervalo');
    // y en la pestaña de grupos, la columna del efecto con su intervalo
    assert.match(CG._efectoTxt({ efecto: { valor: P.global.d, ic: P.efectoIC } }), /^-?\d+\.\d{3} \[-?\d+\.\d{2}, -?\d+\.\d{2}\]$/);
    assert.equal(CG._efectoCabecera({ efecto: { nombre: 'd de Cohen', ic: P.efectoIC } }), 'Efecto (d de Cohen) [IC 95 %]');
});

test('(2027.01.20) en la pestaña de grupos, los coeficientes acotados (η², ε², ω², r) sin el cero inicial; la d y la g, con él', () => {
    assert.equal(CG._efectoTxt({ efecto: { nombre: 'η²', valor: 0.1234, ic: { clave: 'eta2', inferior: 0.02, superior: 0.25 } } }), '.123 [.02, .25]');
    assert.equal(CG._efectoTxt({ efecto: { nombre: 'd de Cohen', valor: 0.5123, ic: { clave: 'd', inferior: 0.1, superior: 0.92 } } }), '0.512 [0.10, 0.92]');
    assert.equal(CG._efectoTxt({ efecto: { nombre: 'r', valor: -0.3456, ic: null } }), '-.346');
    assert.equal(CG._efectoTxt({ efecto: { nombre: 'ε²', valor: 1, ic: null } }), '1.000', 'el 1, entero');
    assert.equal(CG._coefTxt('ω²', 0.0412, 3), '.041');
});
