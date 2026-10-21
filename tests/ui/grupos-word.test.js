// tests/ui/grupos-word.test.js — (2026.12.20) el protocolo único de comparación de grupos de extremo a extremo, sobre
// index.html: con tres o más grupos normales de varianzas desiguales, la vista principal y el capítulo de Word aplican el
// ANOVA de Welch (antes, el ANOVA clásico en la pantalla y Kruskal-Wallis en el Word) y sus post-hoc con Holm, los mismos;
// el Word muestra la tabla de comparaciones por pares y la interpretación de cada comparación (antes estaban en una
// función que nunca se invocaba) y la criba sociodemográfica prueba las variables de tres o más grupos (antes,
// «próximamente»).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';

const raiz = new URL('../../', import.meta.url);
const { datos: D } = JSON.parse(fs.readFileSync(new URL('../oracle/inferencia_fixture.json', import.meta.url), 'utf8'));
let env, A, CG, doc, pantalla;
const q = sel => globalThis.document.querySelector(sel);
const esperar = async (cond, ms = 20000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error('tiempo de espera agotado'); await new Promise(r => setTimeout(r, 25)); } };
const CARRERAS = ['Psicología', 'Derecho', 'Medicina', 'Educación'];

before(async () => {
    env = crearEntorno(fs.readFileSync(new URL('index.html', raiz), 'utf8'));
    env.document.readyState = 'interactive';
    globalThis.fetch = () => Promise.reject(new Error('sin red'));
    await import(new URL('src/main.js', raiz));
    await new Promise(r => setTimeout(r, 0));
    env.document.readyState = 'complete';
    env.disparar(env.document, 'DOMContentLoaded', { bubbles: false });
    const analisis = await import(new URL('src/analizador/ui/analisis.js', raiz));
    ({ AnalizadorEstadistico: A } = await import(new URL('src/analizador/estadistica.js', raiz)));
    ({ ComparacionGrupos: CG } = await import(new URL('src/analizador/comparacion-grupos.js', raiz)));
    // General_A: el conjunto «anovaWelch» del oráculo (4 grupos normales, varianzas muy desiguales, diferencias claras)
    let s = 1220 >>> 0; const u = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const nrm = () => Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u());
    const filas = D.protocoloGrupos.anovaWelch.flatMap((g, i) => g.map(v => ({ Carrera: CARRERAS[i], General_A: v, General_B: +(0.3 * v + 8 * nrm()).toFixed(2) })))
        .map((f, k) => ({ ID: k + 1, Sexo: k % 2 ? 'Femenino' : 'Masculino', ...f }));
    const carga = await import(new URL('src/analizador/ui/carga.js', raiz));
    A.cargarDatos(filas); carga.mostrarDatosCargados(filas); carga.poblarSelectsVariables(filas);
    // la vista principal: General_A según Carrera. Con datos que no vienen del Simulador (como un CSV), el cambio de tipo de
    // análisis repuebla los desplegables con las columnas cargadas: hasta la 2026.12.19, Carrera no aparecía
    q('input[name="tipoAnalisis"][value="correlacion"]').checked = false;   // el minidom no desmarca los demás botones del grupo
    const radio = q('input[name="tipoAnalisis"][value="comparacion"]'); radio.checked = true; env.disparar(radio, 'change');
    assert.ok([...q('#variable2').querySelectorAll('option')].some(o => o.value === 'Carrera'), 'Carrera se ofrece como variable de agrupación');
    q('#variable1').value = 'General_A'; q('#variable2').value = 'Carrera';
    analisis.ejecutarAnalisis();
    await esperar(() => /Comparación de Grupos/.test((q('#resultadosComparacion') || { textContent: '' }).textContent));
    pantalla = q('#resultadosComparacion').textContent;
    // el capítulo de Word de una correlación con esa base (su sección de comparación de grupos recorre Carrera y Sexo)
    radio.checked = false; q('input[name="tipoAnalisis"][value="correlacion"]').checked = true;
    q('#variable1').value = 'General_A'; q('#variable2').value = 'General_B';
    globalThis.ultimoAnalisis = null;
    analisis.ejecutarAnalisis();
    await esperar(() => globalThis.ultimoAnalisis && globalThis.ultimoAnalisis.resultado);
    const { ExportadorWord } = await import(new URL('src/analizador/exportador-word.js', raiz));
    ExportadorWord._png = ExportadorWord._png || {};
    doc = ExportadorWord.generarCapitulo(globalThis.ultimoAnalisis);
});

test('la vista principal: ANOVA de Welch con su frase APA, la regla en el subtítulo y el post-hoc con t de Welch y Holm', () => {
    assert.match(pantalla, /Prueba aplicada:\s*ANOVA de Welch/);
    assert.match(pantalla, /ANOVA de Welch si son normales con varianzas desiguales/, 'el subtítulo explica la regla');
    assert.match(pantalla, /F\(3, \d+\.\d\d\) = \d+\.\d{3}/, 'gl del error fraccionarios, con dos decimales');
    assert.match(pantalla, /Un ANOVA de Welch comparó General_A entre los grupos de Carrera: F\(3, \d+\.\d\d\) = \d+\.\d\d, p [<=] \.?\d/, 'la frase APA (2026.12.22: «un ANOVA», masculino)');
    assert.match(pantalla, /Comparaciones por pares \(post-hoc: t de Welch; corrección de Holm\)/);
    assert.ok(!/Bonferroni/.test(pantalla), 'sin Bonferroni');
});

test('el Word: la regla del protocolo, la tabla de comparaciones por pares (antes nunca aparecía) y la interpretación de cada comparación', () => {
    assert.ok(doc.includes('ANOVA de Welch si los grupos son normales pero sus varianzas difieren'), 'la regla en el párrafo del protocolo');
    assert.ok(doc.includes('Comparaciones por pares para General_A según Carrera (corrección de Holm)'), 'la tabla del post-hoc');
    assert.ok(doc.includes('Cada par se contrasta con la t de Welch'), 'su nota');
    assert.match(doc, /Se comparó General_A entre los 4 grupos de Carrera: .*?se aplicó la prueba ANOVA de Welch, que resultó estadísticamente significativa \(p [<=] [^;]+; α = \.05\)/, 'la interpretación');
    assert.ok(doc.includes('se comparó General_A') || doc.includes('Se comparó General_A entre los 2 grupos de Sexo'), 'también la comparación por Sexo');
});

test('la pantalla, la pestaña y el Word dan la MISMA prueba, el mismo p y los mismos pares significativos', () => {
    const T = CG.analizar('Carrera', 'General_A', 'Carrera', 'General_A');
    assert.equal(T.prueba.nombre, 'ANOVA de Welch'); assert.equal(T.metodoPostHoc, 'welch');
    const grupos = CARRERAS.map(c => A.obtenerDatos().filter(f => f.Carrera === c).map(f => f.General_A));
    const M = A.compararVariosGrupos(grupos, CARRERAS.map(c => `Carrera = ${c}`));
    assert.ok(Math.abs(M.prueba.pValor - T.prueba.pValor) <= 1e-12 * T.prueba.pValor, 'p global de la vista principal = el de la pestaña');
    const sigM = M.postHoc.comparaciones.filter(c => c.significativa).map(c => [c.grupo1, c.grupo2].map(x => x.replace('Carrera = ', '')).sort().join('|')).sort();
    const sigT = T.postHoc.filter(p => p.sig).map(p => [p.a, p.b].sort().join('|')).sort();
    assert.deepEqual(sigM, sigT, 'los mismos pares significativos');
    assert.ok(sigT.length >= 1, 'al menos un par difiere');
    for (const p of T.postHoc) assert.ok(doc.includes(`${p.a} vs ${p.b}</td>`) && doc.includes(CG._fp(p.pHolm)), `el par ${p.a} vs ${p.b} y su p de Holm en el Word`);
    assert.ok(doc.includes(`>(3, ${T.prueba.gl[1].toFixed(2)})</td>`), 'los gl del ANOVA de Welch en la tabla del Word, con dos decimales');
    assert.match(pantalla, new RegExp(`F\\(3, ${M.prueba.glDentro.toFixed(2).replace('.', '\\.')}\\)`), 'los gl del error en pantalla');
});

test('la criba sociodemográfica del Word prueba Carrera (4 grupos) con el protocolo, en lugar de «próximamente»', () => {
    assert.ok(!doc.includes('próximamente'), 'sin filas pendientes');
    const fila = doc.split('<tr').find(t => t.includes('>Carrera</td>') && t.includes('>General_A</td>'));
    assert.ok(fila, 'la fila Carrera × General_A');
    assert.match(fila, /ANOVA de Welch/); assert.match(fila, /η² = \d\.\d\d/); assert.match(fila, /media más alta: /);
});

test('(2026.12.22) el ANOVA clásico se llama igual en la pantalla, su frase APA, la pestaña y el Word: «ANOVA de un factor» (antes, «de una vía» en la pantalla)', async () => {
    const { mostrarComparacionVarios } = await import(new URL('src/analizador/ui/resultados.js', raiz));
    const grupos = D.protocoloGrupos.anova, etiquetas = grupos.map((_, i) => `G${i + 1}`);
    const M = A.compararVariosGrupos(grupos, etiquetas);
    assert.equal(M.prueba.prueba, 'ANOVA de un factor');
    mostrarComparacionVarios('Puntaje', 'Grupo', M);
    const txt = q('#resultadosComparacion').textContent;
    assert.match(txt, /Prueba aplicada:\s*ANOVA de un factor/);
    assert.match(txt, /Se usa ANOVA de un factor si todos los grupos son normales con varianzas homogéneas/);
    const N = grupos.reduce((s, g) => s + g.length, 0);
    assert.match(txt, new RegExp(`Un ANOVA de un factor comparó Puntaje entre los grupos de Grupo: F\\(${grupos.length - 1}, ${N - grupos.length}\\) = \\d+\\.\\d\\d, p [<=] `));
    assert.ok(!/una vía|Una ANOVA/.test(txt), 'sin el nombre anterior');
    assert.equal(CG._fmtPrueba({ prueba: 'anova', global: { F: 1, gl1: 2, gl2: 9, pValor: 0.4, eta2: 0.1 } }).nombre, M.prueba.prueba, 'el de la pestaña y el Word');
});

test('(2026.12.22) grupos constantes y distintos: la diferencia es perfecta, d = −∞ («grande»), no 0,000 («trivial»); t y F infinitos en la frase APA y en la pestaña', async () => {
    const { mostrarComparacion } = await import(new URL('src/analizador/ui/resultados.js', raiz));
    const { lineaApaComparacion } = await import(new URL('src/analizador/ui/analisis.js', raiz));
    const k5 = [5, 5, 5, 5], k7 = [7, 7, 7, 7];
    const R = A.compararGrupos(k5, k7, 'A', 'B');
    mostrarComparacion('Puntaje', 'Grupo', R);
    const txt = q('#resultadosComparacion').textContent;
    assert.match(txt, /Tamaño del efecto \(d de Cohen\):\s*−∞ \(grande\)/);
    assert.ok(!/Infinity|NaN/.test(txt), 'sin «Infinity» ni «NaN» en la pantalla');
    const t = A.pruebaTStudent(k5, k7);
    assert.equal(lineaApaComparacion('Puntaje', 'Grupo', { prueba: t, tamanoEfecto: A.calcularCohenD(k5, k7), tamanoEfectoRangos: null }),
        'Se comparó Puntaje entre los grupos de Grupo mediante la t de Student: t(6) = −∞, p < .001, d de Cohen = −∞.');
    const F = A.anovaUnaVia([k5, k7, [9, 9, 9, 9]]);
    assert.match(lineaApaComparacion('Puntaje', 'Grupo', { prueba: F }), /^Un ANOVA de un factor comparó Puntaje entre los grupos de Grupo: F\(2, 9\) = ∞, p < \.001, η² = 1\.00\.$/);
    assert.equal(CG._fx(-Infinity, 3), '−∞'); assert.equal(CG._fx(Infinity), '∞'); assert.equal(CG._fx(NaN), '—'); assert.equal(CG._fx(1.23456, 3), '1.235');
});

test('(2026.12.23) grupos constantes con n ≥ 50: la normalidad (Kolmogórov-Smirnov) da «no normal» con p = 0, no «NaN»; Levene de grupos todos constantes, F = 0 en la pestaña y el Word', async () => {
    const { mostrarComparacion } = await import(new URL('src/analizador/ui/resultados.js', raiz));
    // 42,1 o 0,1 repetidos: su media redondeada difería en la última cifra, y la d salía de 10¹³ («−31098713539227.324»),
    // la t de 10¹⁴ y la F de Levene ∞ («no homogéneas»), en lugar de −∞, −∞ y 0 como con 5 y 7
    for (const [a, b, n] of [[5, 7, 60], [42.1, 43.3, 60], [0.1, 0.7, 50], [3.3, 2.2, 55]]) {
        const R = A.compararGrupos(Array(n).fill(a), Array(n).fill(b), 'A', 'B');
        assert.equal(R.normalidad1.estadistico, 0.5); assert.equal(R.normalidad1.normal, false);
        assert.equal(R.tamanoEfecto.d, a < b ? -Infinity : Infinity, `d con ${a} y ${b}`);
        assert.equal(R.levene.estadistico, 0); assert.equal(R.levene.pValor, 1);
        assert.equal(A.pruebaTStudent(Array(n).fill(a), Array(n).fill(b)).estadistico, a < b ? -Infinity : Infinity);
        mostrarComparacion('Puntaje', 'Grupo', R);
        const txt = q('#resultadosComparacion').textContent;
        // (2026.12.30) el p de la normalidad en APA, como en las demás tablas: «< .001» (antes, «0.000»)
        assert.equal((txt.match(/< \.001 \(no normal\)/g) || []).length, 2, `las dos filas de normalidad con ${a} y ${b}`);
        assert.match(txt, a < b ? /Tamaño del efecto \(d de Cohen\):\s*−∞ \(grande\)/ : /Tamaño del efecto \(d de Cohen\):\s*∞ \(grande\)/);
        assert.match(txt, /Levene \(centrada en la media\):F\(1, \d+\) = 0\.000, p = 1\.000 \(varianzas iguales\)/);
        assert.ok(!/NaN|Infinity|undefined|\d{8,}\.\d/.test(txt), `sin «NaN» ni cifras de ruido con ${a} y ${b}`);
    }
    const { levene } = await import(new URL('src/core/stats/contrastes.js', raiz));
    const L = CG._fmtLevene(levene([[5, 5, 5], [5, 5, 5, 5]]));
    assert.equal(L.estadistico, 0); assert.equal(L.pValor, 1); assert.equal(L.homogeneas, true);
    assert.equal(CG._fx(L.estadistico, 3), '0.000', 'en el Word: F = 0.000 (antes, «—»), como la vista principal');
    // (2026.12.24) el formato de la vista principal vive en analizador/motor/grupos.js
    const { formatoLevene } = await import(new URL('src/analizador/motor/grupos.js', raiz));
    assert.equal(formatoLevene(levene([[5, 5, 5], [5, 5, 5, 5]])).estadistico, 0);
    assert.equal(A.pruebaLevene([[5, 5, 5], [5, 5, 5, 5]]).estadistico, 0);
});

test('(2026.12.22) la criba sociodemográfica decide con el α del estudio tras Holm (antes, .05 fijo)', async () => {
    const { CribaSociodemografica } = await import(new URL('src/analizador/criba-sociodemografica.js', raiz));
    const original = A.configuracionInvestigacion.nivelSignificancia;
    try {
        const base = CribaSociodemografica.analizar('General_A', 'General_B', 'General_A', 'General_B');
        const conP = base.filas.filter((/** @type {any} */ f) => Number.isFinite(f.pHolm));
        assert.ok(conP.some((/** @type {any} */ f) => f.sig), 'con α = .05, algo significativo (Carrera)');
        for (const alfa of [1e-300, 0.999]) {
            A.configurarMarcoInvestigacion({ nivelSignificancia: alfa });
            const R = CribaSociodemografica.analizar('General_A', 'General_B', 'General_A', 'General_B');
            R.filas.filter((/** @type {any} */ f) => Number.isFinite(f.pHolm)).forEach((/** @type {any} */ f) => assert.equal(f.sig, f.pHolm < alfa, `${f.socio} ↔ ${f.variable} con α = ${alfa}`));
        }
        A.configurarMarcoInvestigacion({ nivelSignificancia: 1e-300 });
        assert.ok(CribaSociodemografica.analizar('General_A', 'General_B', 'General_A', 'General_B').filas.every((/** @type {any} */ f) => !f.sig), 'con α ínfimo, nada');
        A.configurarMarcoInvestigacion({ nivelSignificancia: 7 });
        assert.equal(A.alfaEstudio(), 0.05, 'un α inválido vale .05');
    } finally { A.configurarMarcoInvestigacion({ nivelSignificancia: original }); }
});
