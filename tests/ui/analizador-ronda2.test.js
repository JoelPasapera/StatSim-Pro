// @ts-check
// tests/ui/analizador-ronda2.test.js — (2026.12.30) lo que corrigió la segunda auditoría en los textos del Analizador,
// montado sobre index.html real (sin red): el «mejor modelo» que veía curvatura en datos lineales, la criba que tomaba los
// ítems «AE_1» por datos sociodemográficos, la dirección de la U de Mann-Whitney, los objetivos que se redactaban sin Holm,
// los porcentajes del párrafo sociodemográfico del Word, la frase de los Q-Q, el alfa y el omega de la fiabilidad, el ANCOVA
// sin efecto, el p que el redondeo llevaba a .050, la frase de error tipo II tras rechazar H0 y la U semientera.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';

const raiz = new URL('../../', import.meta.url);
/** @type {any} */ let env;
/** @type {any} */ let ctx;
const q = (/** @type {string} */ sel) => env.document.querySelector(sel);
// (solo las etiquetas de verdad: «p < .001» va tal cual en el HTML, y el navegador lo pinta como texto)
const texto = (/** @type {string} */ html) => String(html).replace(/<\/?[a-zA-Z][^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ');
const m = (/** @type {string} */ p) => import(new URL('src/' + p, raiz).href);
/** @param {() => any} cond */
const esperar = async (cond, ms = 20000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error('tiempo de espera agotado'); await new Promise(r => setTimeout(r, 25)); } };
/** Generador congruencial (el de las auditorías) y normales de Box-Muller. @param {number} semilla */
function azar(semilla) {
    let s = semilla;
    const u = () => (s = (s * 48271) % 2147483647) / 2147483647;
    return { u, nor: () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u()) };
}

before(async () => {
    env = crearEntorno(fs.readFileSync(new URL('index.html', raiz), 'utf8'));
    env.document.readyState = 'interactive';
    globalThis.fetch = /** @type {any} */ (() => Promise.reject(new Error('sin red en las pruebas')));
    await import(new URL('src/main.js', raiz).href);
    await new Promise(r => setTimeout(r, 0));
    env.document.readyState = 'complete';
    env.disparar(env.document, 'DOMContentLoaded', { bubbles: false });
    ctx = {
        analisis: await m('analizador/ui/analisis.js'),
        carga: await m('analizador/ui/carga.js'),
        A: (await m('analizador/estadistica.js')).AnalizadorEstadistico,
        Word: (await m('analizador/exportador-word.js')).ExportadorWord,
        RM: (await m('analizador/regresion.js')).RegresionMultiple,
        I: (await m('analizador/interpretaciones.js')).InterpretacionesEstadisticas,
        cuantilNormal: (await m('core/stats/normal.js')).cuantilNormal,
    };
    await new Promise(r => setTimeout(r, 0));
});

/**
 * Carga un CSV como el botón (cargarDesdeCSV + mostrarDatosCargados) y ejecuta una correlación desde la vista principal.
 * @param {string} csv @param {string} v1 @param {string} v2 @param {string} [tipoPrueba]
 */
async function correlacionDesdeCSV(csv, v1, v2, tipoPrueba = 'bilateral') {
    const { analisis, carga, A } = ctx;
    A.cargarDesdeCSV(csv);
    const datos = A.obtenerDatos();
    carga.mostrarDatosCargados(datos); carga.poblarSelectsVariables(datos);
    for (const r of env.document.querySelectorAll('input[name="tipoAnalisis"]')) r.checked = r.value === 'correlacion';
    for (const r of env.document.querySelectorAll('input[name="tipoPrueba"]')) r.checked = r.value === tipoPrueba;
    q('#variable1').value = v1; q('#variable2').value = v2;
    /** @type {any} */ (globalThis).ultimoAnalisis = null;
    analisis.ejecutarAnalisis();
    await esperar(() => /** @type {any} */ (globalThis).ultimoAnalisis && /** @type {any} */ (globalThis).ultimoAnalisis.resultado);
    await new Promise(r => setTimeout(r, 50));
    return /** @type {any} */ (globalThis).ultimoAnalisis;
}

/**
 * Dos variables con una correlación de Pearson EXACTA `r` (cuantiles normales y un residuo ortogonal): el p queda donde
 * se quiere.
 * @param {number} n @param {number} r @param {number} [decimales]
 */
function csvConCorrelacion(n, r, decimales = 6) {
    const { cuantilNormal } = ctx;
    const z = Array.from({ length: n }, (_, i) => cuantilNormal((i + 0.5) / n)), e0 = z.map((_, i) => z[(i * 7) % n]);
    const pp = (/** @type {number[]} */ a, /** @type {number[]} */ b) => a.reduce((s, x, i) => s + x * b[i], 0);
    const c = pp(e0, z) / pp(z, z), e = e0.map((x, i) => x - c * z[i]);
    const sz = Math.sqrt(pp(z, z) / (n - 1)), se = Math.sqrt(pp(e, e) / (n - 1));
    let csv = 'ID,X,Y\r\n';
    z.forEach((v, i) => { csv += `${i + 1},${(50 + 10 * v / sz).toFixed(decimales)},${(30 + 5 * (r * v / sz + Math.sqrt(1 - r * r) * e[i] / se)).toFixed(decimales)}\r\n`; });
    return csv;
}

test('mejor modelo: con datos lineales, una forma curva ya no gana con la recta a ΔAIC < 2 (parsimonia a favor de la recta)', () => {
    const { A, RM } = ctx;
    const { nor } = azar(4242);
    let porParsimonia = 0;
    for (let b = 0; b < 60; b++) {
        const filas = Array.from({ length: 120 }, (_, i) => { const x = Math.round(40 + 8 * nor()); return { ID: i + 1, X: x, Y: +(10 + 0.5 * x + 4 * nor()).toFixed(2) }; });
        A.cargarDatos(filas);
        const MM = RM.mejorModelo('X', 'Y', 'Apoyo social', 'Bienestar');
        const lin = MM.candidatos.find((/** @type {any} */ c) => c.nombre === 'Lineal');
        if (MM.ganador.nombre !== 'Lineal') assert.ok(lin.dAIC >= 2, `base ${b}: gana ${MM.ganador.nombre} con la recta a ΔAIC = ${lin.dAIC}`);
        if (MM.candidatos[0].nombre !== 'Lineal' && lin.dAIC < 2) {
            porParsimonia++;
            assert.equal(MM.ganador.nombre, 'Lineal');
            assert.equal(MM.parsimonia, true);
            const t = texto(RM._justificacionAIC(MM));
            assert.match(t, /Lineal empata en la práctica con otras formas/);
            assert.match(t, /se describe adecuadamente con una recta/);
            assert.doesNotMatch(t, /presenta curvatura/);
        }
    }
    assert.ok(porParsimonia >= 3, `hubo bases en las que una curva de un parámetro empataba con la recta (${porParsimonia})`);
    // Una curva de verdad sigue ganando (y = ln x con poco ruido).
    const { nor: nor2 } = azar(99);
    A.cargarDatos(Array.from({ length: 120 }, (_, i) => { const x = 1 + i / 4; return { ID: i + 1, X: x, Y: +(10 * Math.log(x) + 0.3 * nor2()).toFixed(3) }; }));
    const curva = RM.mejorModelo('X', 'Y', 'X', 'Y');
    assert.notEqual(curva.ganador.nombre, 'Lineal');
    assert.match(texto(RM._justificacionAIC(curva)), /presenta curvatura/);
    // Con la recta entre ΔAIC 2 y 4, «indicios» que conviene confirmar, no una conclusión.
    const MM = { etX: 'X', etY: 'Y', ganador: { nombre: 'Logarítmica' }, candidatos: [{ nombre: 'Logarítmica', dAIC: 0 }, { nombre: 'Lineal', dAIC: 3.1 }] };
    const indicio = RM._implicacionCurva(MM);
    assert.match(indicio, /indicios de curvatura \(forma logarítmica\)/);
    assert.match(indicio, /ΔAIC = 3\.1/);
    assert.doesNotMatch(indicio, /subestima/);
    MM.candidatos[1].dAIC = 6;
    assert.match(RM._implicacionCurva(MM), /presenta curvatura .*subestima la intensidad real/);
});

test('criba sociodemográfica: los ítems «AE_1» de una escala no entran como datos sociodemográficos ni engordan la familia de Holm', async () => {
    const { CribaSociodemografica } = await m('analizador/criba-sociodemografica.js');
    /** @param {(p: string, j: number) => string} nombreItem */
    const csv = nombreItem => {
        const { u, nor } = azar(777);
        let t = ['ID', 'Sexo', 'Edad', ...[1, 2, 3, 4, 5, 6].map(j => nombreItem('AE', j)), ...[1, 2, 3, 4, 5, 6].map(j => nombreItem('RS', j)), 'Total_AE', 'Total_RS'].join(';') + '\r\n';
        for (let i = 1; i <= 150; i++) {
            const sexo = u() < 0.5 ? 'Femenino' : 'Masculino', f = nor() + (sexo === 'Femenino' ? 0.6 : 0), g = 0.4 * f + 0.9 * nor();
            const a = Array.from({ length: 6 }, () => Math.max(1, Math.min(5, Math.round(3 + 0.8 * f + 0.8 * nor()))));
            const r = Array.from({ length: 6 }, () => Math.max(1, Math.min(5, Math.round(3 + 0.8 * g + 0.8 * nor()))));
            t += [i, sexo, 16 + Math.floor(u() * 5), ...a, ...r, a.reduce((x, y) => x + y), r.reduce((x, y) => x + y)].join(';') + '\r\n';
        }
        return t;
    };
    /** @type {any[]} */ const resultados = [];
    for (const nombre of [(/** @type {string} */ p, /** @type {number} */ j) => p + j, (/** @type {string} */ p, /** @type {number} */ j) => `${p}_${j}`]) {
        await correlacionDesdeCSV(csv(nombre), 'Total_AE', 'Total_RS');
        const res = CribaSociodemografica.analizar('Total_AE', 'Total_RS', 'Autoestima', 'Resiliencia');
        assert.deepEqual([...new Set(res.filas.map((/** @type {any} */ f) => f.socio))].sort(), ['Edad', 'Sexo'], 'solo los sociodemográficos');
        assert.equal(res.totalPruebas, 4);
        resultados.push(res.filas.map((/** @type {any} */ f) => [f.socio, f.variable, f.pHolm.toFixed(6), f.sig]));
    }
    assert.deepEqual(resultados[1], resultados[0], '«AE_1» y «AE1» dan la misma criba');
});

test('U de Mann-Whitney: la interpretación nombra al grupo de rango medio más alto, no al de mayor media', async () => {
    const { A, I } = ctx;
    const { lineaApaComparacion } = ctx.analisis;
    const g1 = [12, 13, 13, 14, 14, 15, 15, 16, 16, 17, 17, 18];   // casi todas por encima
    const g2 = [5, 6, 7, 7, 8, 9, 9, 10, 11, 12, 80, 95];          // casi todos por debajo, con dos atípicos que suben la media
    const R = A.compararGrupos(g1, g2, 'Sexo = Mujer', 'Sexo = Varón');
    assert.match(R.prueba.prueba, /Mann-Whitney/);
    assert.ok(R.descriptivas2.media > R.descriptivas1.media, 'la media engaña');
    const t = I.generarInterpretacionComparacion('Autoestima', 'Sexo', R);
    assert.match(t, /El grupo "Sexo = Mujer" presenta los valores más altos \(rango medio 16\.5 frente a 8\.5\)/);
    // y la frase APA, con la U semientera tal cual (antes, «U = 25»)
    assert.equal(R.prueba.U, 24.5);
    assert.match(lineaApaComparacion('Autoestima', 'Sexo', R), /U = 24\.5, Z = -2\.75, p = \.006\./);
});

test('objetivos específicos: la interpretación usa el p de Holm de la tabla (antes, «significativo» bajo una fila «No significativa»)', async () => {
    const { A, cuantilNormal } = ctx;
    const { AnalisisDimensiones } = await m('analizador/analisis-dimensiones.js');
    const n = 40;
    const z = Array.from({ length: n }, (_, i) => cuantilNormal((i + 0.5) / n));
    const perm = (/** @type {number} */ p) => Array.from({ length: n }, (_, i) => z[(i * p) % n]);
    const centrar = (/** @type {number[]} */ v) => { const mm = v.reduce((a, b) => a + b) / n; return v.map(x => x - mm); };
    const pp = (/** @type {number[]} */ a, /** @type {number[]} */ b) => a.reduce((s, x, i) => s + x * b[i], 0);
    /** @type {number[][]} */ const orto = [];
    [z, perm(7), perm(11), perm(13), perm(17), perm(19)].map(centrar).forEach(v => {
        let w = v.slice();
        orto.forEach(o => { const c = pp(w, o) / pp(o, o); w = w.map((x, i) => x - c * o[i]); });
        const nn = Math.sqrt(pp(w, w) / (n - 1)); orto.push(w.map(x => x / nn));
    });
    const [GA, e1, e2, e3, GB] = orto;
    const mezcla = (/** @type {number} */ r, /** @type {number[]} */ a, /** @type {number[]} */ b) => a.map((x, i) => r * x + Math.sqrt(1 - r * r) * b[i]);
    const D1 = mezcla(0.36, GA, e1), D2 = mezcla(0.30, GA, e2), D3 = mezcla(0.28, GA, e3);
    A.cargarDatos(GA.map((_, i) => ({ ID: i + 1, General_A: +(50 + 10 * GA[i]).toFixed(3), General_B: +(30 + 6 * GB[i]).toFixed(3),
        Dimension_A1: +(20 + 4 * D1[i]).toFixed(3), Dimension_A2: +(20 + 4 * D2[i]).toFixed(3), Dimension_A3: +(20 + 4 * D3[i]).toFixed(3) })));
    const t = texto(AnalisisDimensiones.generarContenido('General_A', 'General_B', 'bilateral', '', ''));
    const bloques = t.split(/Objetivo específico \d+:/).slice(1);
    assert.ok(bloques.length >= 3, 'hay objetivos');
    let noSigConPCrudoBajo = 0;
    for (const b of bloques) {
        const decision = (b.match(/✅ Significativa|➖ No significativa/) || [''])[0];
        if (decision.includes('No')) {
            assert.doesNotMatch(b, /El resultado es estadísticamente significativo/, 'sin «significativo» bajo una fila no significativa');
            if (/Tras la corrección de Holm por los \d+ contrastes, el resultado NO es estadísticamente significativo \(p ajustado [^)]*; sin ajustar, p = /.test(b)) noSigConPCrudoBajo++;
        } else if (decision) {
            assert.match(b, /significativo también tras la corrección de Holm/);
        }
    }
    assert.ok(noSigConPCrudoBajo >= 1, 'el caso que antes se contradecía: p < .05 sin ajustar, no significativo con Holm');
});

test('Word: el párrafo sociodemográfico da los porcentajes de la tabla (sobre los casos con dato, no sobre el N total)', async () => {
    let csv = 'ID;Sexo;Ansiedad;Estres\r\n';
    for (let i = 1; i <= 40; i++) {
        const sexo = i <= 10 ? '' : (i % 3 === 0 ? 'Masculino' : 'Femenino');
        csv += `${i};${sexo};${20 + ((i * 37) % 17) + (i % 5)};${15 + ((i * 53) % 19) + 0.5 * (i % 7)}\r\n`;
    }
    const U = await correlacionDesdeCSV(csv, 'Ansiedad', 'Estres');
    ctx.Word._png = {};
    const doc = texto(ctx.Word.generarCapitulo(U));
    const tabla = (doc.match(/Distribución de frecuencias de las variables sociodemográficas.*?Nota\./) || [''])[0];
    assert.match(tabla, /Femenino 20 66\.7% Masculino 10 33\.3%/);
    assert.match(doc, /en cuanto a sexo, predominó la categoría «Femenino» con 20 casos \(66\.7 %\), seguida de «Masculino» \(10; 33\.3 %\)/);
});

test('normalidad: con las dos variables no normales, la frase de los Q-Q describe la desviación (antes, «los puntos se alinean»)', async () => {
    const { analizarCorrelacion } = await m('analizador/motor/correlacion.js');
    const x = Array.from({ length: 40 }, (_, i) => +Math.exp(i / 8).toFixed(3));
    const y = x.map((v, i) => +(v * 0.5 + ((i * 7) % 11)).toFixed(3));
    const R = analizarCorrelacion(x, y, { tipoPrueba: 'bilateral', alfa: 0.05, nombreX: 'X', nombreY: 'Y' });
    assert.equal(R.normalidad1.normal, false); assert.equal(R.normalidad2.normal, false);
    const t = ctx.I.generarInterpretacionNormalidad('X', 'Y', R);
    assert.doesNotMatch(t, /La inspección de los gráficos Q-Q respalda/);
    assert.match(t, /la desviación que detectó la prueba en X y en Y se aprecia como puntos que se apartan de ella/);
    // y con datos normales, la frase de siempre
    const zx = Array.from({ length: 40 }, (_, i) => ctx.cuantilNormal((i + 0.5) / 40));
    const R2 = analizarCorrelacion(zx, zx.map((v, i) => v + 0.5 * zx[(i * 7) % 40]), { tipoPrueba: 'bilateral', alfa: 0.05, nombreX: 'X', nombreY: 'Y' });
    if (R2.normalidad1.normal && R2.normalidad2.normal) assert.match(ctx.I.generarInterpretacionNormalidad('X', 'Y', R2), /La inspección de los gráficos Q-Q respalda visualmente esta decisión/);
});

// 150 casos × 6 ítems (1 a 5; «.» = perdido) de la referencia de NumPy de la tabla de fiabilidad (α = .691, ω = .710).
const FIABILIDAD = '332333235324423214222323224233......44322454455524243444214234214333223223332222323342433134333521111233.243112333121312113323313332223324332544433333433225111123222313242453333245121211324433322134322232443443343313224431434542222131444243332243341233232114324453435453212314433333332234122242545434444233212131234222343342322153444352222442335142534235322123332335432322324333112233231221333222434243444244221233213443343141113124432123334234554342343413221243233134344334445543343423334123324443434223233233222455334323321142444342334333342235434533333255442434331323331545321112324233121112233214333323124223423433545451223341322321323335323224214333334333333425422332223224423242332221122212443242124342434543334313334342343335233423111123123131455343121324434434113322433352321421445344333333212324555343552344333434132432322134323223544342323233353542232321213223211111534243334332444451343231';

test('fiabilidad: cada coeficiente con su banda, y la frase alfa-omega solo con un omega y según lo que se parezcan', async () => {
    const { Fiabilidad } = await m('analizador/fiabilidad.js');
    const { nivelFiabilidad } = await m('analizador/motor/magnitudes.js');
    /** @type {Record<string, number | string>[]} */ const filas = [];
    for (let i = 0; i < FIABILIDAD.length / 6; i++) {
        /** @type {Record<string, number | string>} */ const o = { ID: i + 1 };
        for (let j = 0; j < 6; j++) { const c = FIABILIDAD[6 * i + j]; o['P' + (j + 1)] = c === '.' ? '' : Number(c); }
        filas.push(o);
    }
    const r = Fiabilidad.analizarGrupo(filas, { nombre: 'P', etiqueta: 'Escala P', items: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'], origen: 'prefijo' }, { ordinal: false });
    assert.equal(r.alfa.toFixed(3), '0.691'); assert.equal(r.omega.toFixed(3), '0.710');
    assert.notEqual(nivelFiabilidad(r.alfa), nivelFiabilidad(r.omega), 'el alfa y el omega caen en bandas distintas');
    const t = Fiabilidad._interpretarItems(r);
    assert.match(t, new RegExp(`alfa de \\.691 de la escala, de interpretación ${nivelFiabilidad(r.alfa)} \\(con el omega de \\.710, ${nivelFiabilidad(r.omega)}\\)`));
    assert.match(Fiabilidad.redactarInterpretacion([r]), /La convergencia entre el alfa y el omega respalda/);
    // con 2 ítems no hay omega: sin frase alfa-omega
    const r2 = Fiabilidad.analizarGrupo(filas, { nombre: 'Q', etiqueta: 'Escala Q', items: ['P1', 'P6'], origen: 'manual' }, { ordinal: false });
    assert.equal(r2.omega ?? null, null);
    assert.doesNotMatch(Fiabilidad.redactarInterpretacion([r2]), /convergencia|difieren/);
    // un omega lejos del alfa: la frase lo dice, no habla de convergencia
    const lejos = { ...r, omega: r.alfa + 0.12 };
    const tl = Fiabilidad.redactarInterpretacion([lejos]);
    assert.doesNotMatch(tl, /La convergencia entre el alfa y el omega/);
    assert.match(tl, /El alfa y el omega difieren en hasta/);
});

test('ANCOVA sin efecto del factor ajustado: la frase distingue «no había diferencia» de «la explicaba la covariable»', () => {
    const { A, RM } = ctx;
    /** @type {Record<string, string>} */ const frases = {};
    for (const [nombre, dif, difCov] of /** @type {[string, number, number][]} */ ([['sin diferencias', 0, 0], ['confundida con la edad', 0, 3], ['efecto real', 4, 0]])) {
        const { nor } = azar(99 + dif * 10 + difCov);
        A.cargarDatos(Array.from({ length: 100 }, (_, i) => {
            const g = i % 2, edad = +(20 + difCov * g + 2 * nor()).toFixed(1);
            return { ID: i + 1, Turno: g ? 'Mañana' : 'Tarde', Edad: edad, Estres: +(30 + dif * g + 1.5 * (edad - 20) + 3 * nor()).toFixed(2) };
        }));
        const R = RM.ancova('Turno', 'Estres', 'Edad', { grupo: 'Turno', y: 'Estrés', cov: 'Edad' });
        frases[nombre] = texto(RM._htmlAncova(R));
        if (nombre !== 'efecto real') assert.equal(texto(RM._textoAncovaSinEfecto(R)).trim().slice(0, 30), (frases[nombre].match(/(Los grupos no difieren|Sin ajustar, los grupos)[^]{0,30}/) || [''])[0].slice(0, 30), 'la misma frase que el Word');
    }
    assert.match(frases['sin diferencias'], /Los grupos no difieren significativamente en Estrés ni sin ajustar \(F\(1, 98\) = [\d.]+, p = \.\d{3}\) ni una vez igualados en Edad/);
    assert.match(frases['confundida con la edad'], /Sin ajustar, los grupos difieren en Estrés \(F\(1, 98\) = [\d.]+, p [<=] \.\d{3}\), pero una vez igualados en Edad ya no difieren significativamente/);
    assert.match(frases['confundida con la edad'], /los grupos sí difieren en Edad: p [<=] \.\d{3}/);
    assert.match(frases['efecto real'], /Aun igualados en Edad, los grupos difieren en Estrés/);
});

test('p justo por debajo de α: «.0499 < α», no «.050 < α», en la decisión, la interpretación y la frase APA', async () => {
    const { pCorrelacion } = await m('core/stats/correlacion.js');
    let r = 0.3605; while (pCorrelacion(r, 30) >= 0.0499) r += 0.00001;
    const U = await correlacionDesdeCSV(csvConCorrelacion(30, r), 'X', 'Y');
    assert.ok(U.resultado.pValor < 0.05 && U.resultado.pValor >= 0.0495, `p = ${U.resultado.pValor}`);
    const dec = texto(q('#resultadosDecision').innerHTML);
    assert.match(dec, /Comparación: p = \.0499 < α = 0\.05/);
    assert.match(dec, /SE RECHAZA H₀/);
    assert.doesNotMatch(dec, /\.050 </);
    assert.match(texto(q('#resultadosCorrelacion').innerHTML), /El resultado es estadísticamente significativo al nivel α = 0\.05 del estudio \(p = 0\.0499\)/);
    assert.match(texto(q('#resultadosReporteAPA').innerHTML), /r\(28\) = \.36, p = \.0499/);
});

test('potencia baja tras rechazar H0: sin la frase del error tipo II (que es de un resultado NO significativo)', async () => {
    const U = await correlacionDesdeCSV(csvConCorrelacion(40, 0.36, 4), 'X', 'Y');
    assert.ok(U.resultado.pValor < 0.05 && U.resultado.poder < 0.8, `p = ${U.resultado.pValor}, potencia = ${U.resultado.poder}`);
    const dec = texto(q('#resultadosDecision').innerHTML);
    assert.match(dec, /SE RECHAZA H₀/);
    assert.doesNotMatch(dec, /error tipo II/);
    // con un resultado no significativo y poca potencia, la advertencia sigue
    await correlacionDesdeCSV(csvConCorrelacion(40, 0.2, 4), 'X', 'Y');
    assert.match(texto(q('#resultadosDecision').innerHTML), /riesgo de error tipo II/);
});

test('APA: los p de la regresión bivariada se escriben «p = .xxx» o «p < .001», nunca «p .xxx»', async () => {
    const { nor } = azar(4242);
    let csv = 'ID;X;Y\r\n';
    for (let i = 1; i <= 40; i++) { const x = 40 + 8 * nor(); csv += `${i};${x.toFixed(2).replace('.', ',')};${(10 + 0.2 * x + 6 * nor()).toFixed(2).replace('.', ',')}\r\n`; }
    const { A, carga, analisis } = ctx;
    A.cargarDesdeCSV(csv); const d = A.obtenerDatos(); carga.mostrarDatosCargados(d); carga.poblarSelectsVariables(d);
    for (const r of env.document.querySelectorAll('input[name="tipoAnalisis"]')) r.checked = r.value === 'correlacion';
    q('#variable1').value = 'X'; q('#variable2').value = 'Y'; q('#regDep').value = 'Y'; q('#regInd').value = 'X';
    /** @type {any} */ (globalThis).ultimoAnalisis = null; analisis.ejecutarAnalisis();
    await esperar(() => /** @type {any} */ (globalThis).ultimoAnalisis && /Regresión Bivariada/.test(q('#resultadosCorrelacion').textContent));
    const pantalla = texto(q('#resultadosCorrelacion').innerHTML);
    ctx.Word._png = {};
    const doc = texto(ctx.Word.generarCapitulo(/** @type {any} */ (globalThis).ultimoAnalisis));
    for (const [donde, t] of [['pantalla', pantalla], ['Word', doc]]) {
        assert.deepEqual([...t.matchAll(/.{0,40}\bp \.\d{3}.{0,10}/g)].map(x => x[0]), [], `${donde}: sin «p .xxx»`);
        assert.match(t, /\bp [=<] \.\d{3}/, `${donde}: con p`);
    }
});

// ---- Lo que encontró la revisión independiente de la 2026.12.30 ----

test('(revisión) el Word con una regresión bivariada de Y binaria: la logística, sin el fallo que impedía descargarlo', async () => {
    const { nor } = azar(17);
    let csv = 'ID;X;Aprobado\r\n';
    for (let i = 1; i <= 80; i++) { const x = 50 + 10 * nor(); csv += `${i};${x.toFixed(2).replace('.', ',')};${(x + 8 * nor()) > 50 ? 1 : 0}\r\n`; }
    const { A, carga, analisis, RM } = ctx;
    A.cargarDesdeCSV(csv); const d = A.obtenerDatos(); carga.mostrarDatosCargados(d); carga.poblarSelectsVariables(d);
    for (const r of env.document.querySelectorAll('input[name="tipoAnalisis"]')) r.checked = r.value === 'correlacion';
    q('#variable1').value = 'X'; q('#variable2').value = 'Aprobado'; q('#regDep').value = 'Aprobado'; q('#regInd').value = 'X';
    /** @type {any} */ (globalThis).ultimoAnalisis = null; analisis.ejecutarAnalisis();
    await esperar(() => /** @type {any} */ (globalThis).ultimoAnalisis && RM._ultimaBivariada);
    await new Promise(r => setTimeout(r, 50));
    assert.equal(RM._ultimaBivariada.MM.tipoY, 'binaria');
    RM._ultimoGrafico = { url: 'data:image/png;base64,iVBORw0KGgo=', w: 10, h: 10 };   // lo que deja el canvas del navegador
    ctx.Word._png = {};
    const doc = texto(ctx.Word.generarCapitulo(/** @type {any} */ (globalThis).ultimoAnalisis));
    assert.match(doc, /Regresión logística de Aprobado sobre X Ecuación OR \(e\^b\) z p Pseudo-R² \(McFadden\) logit\(p\)/);
    assert.match(doc, /la curva logística da, para cada valor de X, la probabilidad estimada de Aprobado/);
    assert.doesNotMatch(doc, /seleccionado por el criterio de Akaike/);
    delete RM._ultimoGrafico;
});

test('(revisión) con una prueba unilateral, la frase APA y el diagrama dicen «IC 90%», el nivel del intervalo', async () => {
    const U = await correlacionDesdeCSV(csvConCorrelacion(40, 0.11, 4), 'X', 'Y', 'unilateral');
    assert.equal(U.resultado.intervaloConfianza.nivel.toFixed(2), '0.90');
    const apa = texto(q('#resultadosReporteAPA').innerHTML);
    assert.match(apa, /IC 90% \[/);
    assert.doesNotMatch(apa, /IC 95%/);
});

test('(revisión) el rival del mejor modelo, con las bandas de Burnham y Anderson: a ΔAIC 3, «algo menos de apoyo»', () => {
    const { RM } = ctx;
    const MM = (/** @type {number} */ d) => {
        const cubica = { nombre: 'Cúbica', R2: 0.53, AIC: 100, dAIC: 0, k: 3 };
        return { etX: 'X', etY: 'Y', parsimonia: false, ganador: cubica, candidatos: [cubica, { nombre: 'Lineal', R2: 0.48, AIC: 100 + d, dAIC: d, k: 1 }] };
    };
    const frase = (/** @type {number} */ d) => (texto(RM._justificacionAIC(MM(d))).match(/queda a ΔAIC = [\d.]+, es decir, con ([^.]+)\./) || [])[1];
    assert.equal(frase(3), 'algo menos de apoyo, aunque todavía apreciable');
    assert.equal(frase(5), 'considerablemente menos apoyo empírico');
    assert.equal(frase(8.5), 'muy poco apoyo empírico');
    assert.equal(frase(12), 'apoyo esencialmente nulo');
    assert.match(texto(RM._justificacionAIC(MM(3))), /entre 2 y 4, el rival conserva parte del apoyo/);
});

test('(revisión) ANCOVA: si los grupos no difieren en la covariable, no se afirma que partían con niveles distintos', () => {
    const { RM } = ctx;
    const R = { etY: 'Estrés', etCov: 'Edad', gl: [1, 77], Ffactor: 2.68, pFactor: 0.106, cruda: { gl: [1, 78], F: 6.15, pValor: 0.015 }, covEntreGrupos: { pValor: 0.053 } };
    const t = RM._textoAncovaSinEfecto(R);
    assert.match(t, /Como los grupos no difieren significativamente en Edad \(p = \.053\), la diferencia cruda no puede atribuirse con seguridad a la covariable/);
    assert.doesNotMatch(t, /partían con distintos niveles/);
    const Rsi = { ...R, covEntreGrupos: { pValor: 0.001 } };
    assert.match(RM._textoAncovaSinEfecto(Rsi), /partían con distintos niveles de Edad \(los grupos sí difieren en Edad: p = \.001\)/);
});

test('(revisión) Word sociodemográfico: la frase final también habla de los casos con dato, no del total', async () => {
    let csv = 'ID;Sexo;Ansiedad;Estres\r\n';
    for (let i = 1; i <= 40; i++) csv += `${i};${i <= 10 ? '' : (i % 3 === 0 ? 'Masculino' : 'Femenino')};${20 + ((i * 37) % 17) + (i % 5)};${15 + ((i * 53) % 19) + 0.5 * (i % 7)}\r\n`;
    const U = await correlacionDesdeCSV(csv, 'Ansiedad', 'Estres');
    ctx.Word._png = {};
    const doc = texto(ctx.Word.generarCapitulo(U));
    assert.match(doc, /los porcentajes su proporción respecto de los casos con dato en cada variable/);
    assert.doesNotMatch(doc, /su proporción respecto del total/);
});

