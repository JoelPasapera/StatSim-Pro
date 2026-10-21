// tests/ui/correlacion-word.test.js — (2026.12.17) la inferencia de la correlación de extremo a extremo, sobre index.html:
// con una prueba UNILATERAL y valores perdidos en filas distintas de cada variable, la potencia, el α y la decisión del
// capítulo de Word son los de la pantalla (antes, el Word recalculaba la potencia y fijaba α = .05; la pantalla daba la
// potencia bilateral), y la matriz de correlaciones del Word y el mapa de los gráficos usan los casos que tienen las DOS
// variables (antes, cada columna se filtraba por separado y los pares se desalineaban desde el primer perdido; en el Word,
// además, la celda vacía de un CSV contaba como 0).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';

const raiz = new URL('../../', import.meta.url);
let env, A, filas, doc;
const q = sel => globalThis.document.querySelector(sel);
const esperar = async (cond, ms = 20000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error('tiempo de espera agotado'); await new Promise(r => setTimeout(r, 25)); } };
const fp3 = v => (v >= 0.999 ? '> .999' : v.toFixed(3).replace(/^0\./, '.'));

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
    let s = 1217 >>> 0; const u = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const nrm = () => Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u());
    filas = Array.from({ length: 120 }, () => { const z1 = nrm(), z2 = nrm(), z3 = nrm(); return { General_A: +(50 + 10 * z1).toFixed(2), General_B: +(40 + 8 * (0.22 * z1 + 0.975 * z2)).toFixed(2), General_C: +(30 + 5 * (0.5 * z2 + 0.87 * z3)).toFixed(2) }; });
    [2, 9, 31, 64].forEach(i => { filas[i].General_A = ''; });   // celda vacía de un CSV
    [0, 5, 17].forEach(i => { filas[i].General_B = NaN; });     // perdido del Simulador (y en el primer participante)
    filas[0].General_C = NaN; filas[40].General_C = '';          // una tercera variable con un perdido en el primer caso (NaN: +NaN no es finito)
    const carga = await import(new URL('src/analizador/ui/carga.js', raiz));
    A.cargarDatos(filas); carga.mostrarDatosCargados(filas); carga.poblarSelectsVariables(filas);
    q('#variable1').value = 'General_A'; q('#variable2').value = 'General_B';
    q('input[name="tipoAnalisis"][value="correlacion"]').checked = true;
    q('input[name="tipoPrueba"][value="bilateral"]').checked = false; q('input[name="tipoPrueba"][value="unilateral"]').checked = true;
    analisis.ejecutarAnalisis();
    await esperar(() => /Pearson|Spearman/i.test((q('#resultadosCorrelacion') || { textContent: '' }).textContent) && globalThis.ultimoAnalisis && globalThis.ultimoAnalisis.resultado);
    const { ExportadorWord } = await import(new URL('src/analizador/exportador-word.js', raiz));
    ExportadorWord._png = ExportadorWord._png || {};
    doc = ExportadorWord.generarCapitulo(globalThis.ultimoAnalisis);
});

test('la pantalla calcula la potencia con la lateralidad del p (unilateral) y el α del motor', async () => {
    const R = globalThis.ultimoAnalisis.resultado, { potenciaCorrelacion } = await import(new URL('src/core/stats/correlacion.js', raiz));
    assert.equal(R.tipoPrueba, 'unilateral'); assert.equal(R.n, 113, 'pares completos: 120 − 4 − 3');
    assert.equal(R.poder, potenciaCorrelacion(R.coeficiente, R.n, { alfa: 0.05, bilateral: false }));
    assert.ok(R.poder > potenciaCorrelacion(R.coeficiente, R.n, { alfa: 0.05 }), 'la unilateral es mayor que la bilateral de antes');
    assert.match(q('#resultadosDecision').textContent, new RegExp(`${(R.poder * 100).toFixed(1)}%`), 'la potencia que muestra la pantalla');
});

test('el Word informa la MISMA potencia, el α del motor, el contraste unilateral y la decisión de la pantalla', () => {
    const R = globalThis.ultimoAnalisis.resultado, H = A.pruebaHipotesis(R);
    assert.ok(doc.includes(`Potencia post-hoc (1−β)</td><td style="padding:2pt 4pt;">${fp3(R.poder)}</td>`), `potencia ${fp3(R.poder)} en la tabla del contraste`);
    assert.ok(doc.includes(`La potencia estimada de ${fp3(R.poder)}`), 'y en el párrafo');
    assert.ok(doc.includes('α = .05 y un contraste unilateral'), 'α y lateralidad en el texto');
    assert.ok(doc.includes(H.decision === 'rechazar' ? 'SE RECHAZA la hipótesis nula' : 'NO SE RECHAZA la hipótesis nula'), 'la decisión de la pantalla');
});

test('la matriz del Word usa los pares completos: su celda coincide con la correlación principal y la nota da su n', async () => {
    // sin objetivos específicos, la matriz es la de las dos variables del análisis (con objetivos: la última prueba)
    const { ExportadorWord } = await import(new URL('src/analizador/exportador-word.js', raiz));
    const R = globalThis.ultimoAnalisis.resultado, d = ExportadorWord.generarCapitulo({ ...globalThis.ultimoAnalisis, criba: null });
    const i = d.indexOf('Matriz de correlaciones entre las variables del estudio'), tabla = d.slice(i, d.indexOf('</table>', i));
    assert.ok(i > 0, 'matriz en el Word');
    assert.ok(tabla.includes(`>${R.coeficiente.toFixed(2)}</td>`), `la celda vale ${R.coeficiente.toFixed(2)} como la correlación principal`);
    assert.match(d.slice(d.indexOf('</table>', i), d.indexOf('</table>', i) + 900), /n = 113\./, 'el n de sus pares completos');
});

test('el mapa de los gráficos: coeficiente exacto y n de los pares completos de cada celda', async () => {
    const { prepararDatosParaGraficos } = await import(new URL('src/analizador/ui/graficos.js', raiz));
    const R = globalThis.ultimoAnalisis.resultado, G = prepararDatosParaGraficos(filas);
    const i = G.labels.findIndex(l => /General_A/.test(l)), j = G.labels.findIndex(l => /General_B/.test(l));
    assert.ok(i >= 0 && j >= 0, `etiquetas ${G.labels}`);
    assert.equal(G.nPares[i][j], 113); assert.deepEqual([G.nPares[i][i], G.nPares[j][j]], [116, 117]);
    if (G.normales[i] && G.normales[j]) assert.equal(G.correlacionesExactas[i][j], R.coeficiente, 'Pearson: la misma r que la vista principal');
    assert.equal(G.correlaciones[i][j], Math.round(G.correlacionesExactas[i][j] * 100) / 100, 'la celda muestra el valor redondeado');
});

test('objetivos específicos en el Word: el p del respaldo lleva la lateralidad del análisis y una columna con un perdido en el primer caso entra en la matriz', async () => {
    const { ExportadorWord } = await import(new URL('src/analizador/exportador-word.js', raiz));
    const { pCorrelacion } = await import(new URL('src/core/stats/correlacion.js', raiz));
    const R = globalThis.ultimoAnalisis.resultado, sel = (x, coef) => ({ columnaX: x, columnaY: 'General_B', etiquetaX: x, etiquetaY: 'General_B', coeficiente: coef, metodo: 'Pearson', superaUmbral: true });
    const criba = { evaluados: [{ valido: true }, { valido: true }], seleccionados: [sel('General_C', 0.4), sel('Dimension_X', 0.12)], umbral: 0.1 };
    const d = ExportadorWord.generarCapitulo({ ...globalThis.ultimoAnalisis, criba });
    const respaldo = ExportadorWord._respaldoCriba(sel('Dimension_X', 0.12), R);
    assert.equal(respaldo.pValor, pCorrelacion(0.12, R.n, { bilateral: false }), 'el respaldo: t con n − 2 gl y unilateral (antes, la normal de Fisher, bilateral)');
    const i = d.indexOf('Correlaciones correspondientes a los objetivos específicos'), tabla = d.slice(i, d.indexOf('</table>', i));
    assert.ok(tabla.includes(`>${respaldo.pValor.toFixed(3).replace(/^0\./, '.')}</td>`), `la tabla de objetivos muestra p = ${respaldo.pValor.toFixed(3)}`);
    const j = d.indexOf('Matriz de correlaciones entre las variables del estudio'), matriz = d.slice(j, d.indexOf('</table>', j));
    assert.ok(matriz.includes('3. General_C'), 'General_C entra en la matriz aunque su primer caso esté vacío (antes se miraba solo la primera fila)');
    // A–B: 113 pares; A–C: 114 (perdidos en filas distintas); B–C: 116 (comparten el perdido del primer caso)
    assert.match(d.slice(d.indexOf('</table>', j), d.indexOf('</table>', j) + 900), /Casos por par: de 113 a 116 \(eliminación por pares/, 'con perdidos distintos, los casos por par');
});

test('(2026.12.22) los objetivos específicos deciden con el α del estudio tras Holm, en el Word y en pantalla (antes, .05 fijo)', async () => {
    const { ExportadorWord } = await import(new URL('src/analizador/exportador-word.js', raiz));
    const { AnalisisDimensiones } = await import(new URL('src/analizador/analisis-dimensiones.js', raiz));
    const sel = (x, coef) => ({ columnaX: x, columnaY: 'General_B', etiquetaX: x, etiquetaY: 'General_B', coeficiente: coef, metodo: 'Pearson', superaUmbral: true });
    const criba = { evaluados: [{ valido: true }, { valido: true }], seleccionados: [sel('General_C', 0.4), sel('General_A', 0.2)], umbral: 0.1 };
    const decisiones = () => {
        const d = ExportadorWord.generarCapitulo({ ...globalThis.ultimoAnalisis, criba });
        const i = d.indexOf('Correlaciones correspondientes a los objetivos específicos'), tabla = d.slice(i, d.indexOf('</table>', i));
        return { tabla: (tabla.match(/>(Significativa|No significativa)</g) || []).map(s => s.slice(1, -1)), resumen: (d.match(/De los 2 objetivos específicos evaluados, (\d+)/) || [])[1] };
    };
    const original = A.configuracionInvestigacion.nivelSignificancia;
    try {
        const conCinco = decisiones();
        assert.equal(conCinco.tabla.length, 2);
        A.configurarMarcoInvestigacion({ nivelSignificancia: 1e-300 });
        const conNada = decisiones();
        assert.deepEqual(conNada.tabla, ['No significativa', 'No significativa'], 'con α ínfimo, ningún objetivo es significativo');
        assert.equal(conNada.resumen, '0', 'y el resumen del capítulo cuenta 0');
        A.configurarMarcoInvestigacion({ nivelSignificancia: 0.999 });
        assert.deepEqual(decisiones().tabla, ['Significativa', 'Significativa'], 'con α = .999, los dos');
        // en pantalla: la tabla de cada objetivo (si la criba de los datos los encuentra)
        const html = AnalisisDimensiones.generarContenido('General_A', 'General_B', 'unilateral');
        const pantalla = (html.match(/(✅ Significativa|➖ No significativa)<\/td>/g) || []);
        A.configurarMarcoInvestigacion({ nivelSignificancia: 1e-300 });
        const pantallaNada = (AnalisisDimensiones.generarContenido('General_A', 'General_B', 'unilateral').match(/(✅ Significativa|➖ No significativa)<\/td>/g) || []);
        assert.equal(pantalla.length, pantallaNada.length);
        assert.ok(pantallaNada.every(s => s.startsWith('➖')), 'en pantalla, con α ínfimo, ninguno');
        assert.ok(pantalla.length > 0, "la criba de los datos encuentra objetivos"); assert.ok(pantalla.every(s => s.startsWith("✅")), "en pantalla, con α = .999, todos");
    } finally { A.configurarMarcoInvestigacion({ nivelSignificancia: original }); }
});

test('(2026.12.24) el diagrama de dispersión del Word nombra la fuerza con su banda única y elige la frase por ella', async () => {
    const { ExportadorWord } = await import(new URL('src/analizador/exportador-word.js', raiz));
    const { fuerzaCorrelacionDispersion } = await import(new URL('src/analizador/motor/magnitudes.js', raiz));
    const U = globalThis.ultimoAnalisis, frases = ['por lo que los puntos se apartan bastante de la recta', 'con puntos moderadamente próximos a la recta', 'con puntos notablemente alineados a la recta'];
    for (const [r, banda, frase] of [[0.05, 'prácticamente nula', 0], [-0.2, 'débil', 0], [0.2999, 'débil', 0], [0.3, 'moderada', 1], [-0.45, 'moderada', 1], [0.6, 'considerable', 2], [0.85, 'fuerte', 2]]) {
        const d = ExportadorWord.generarCapitulo({ ...U, criba: null, resultado: { ...U.resultado, coeficiente: r } });
        assert.equal(fuerzaCorrelacionDispersion(r), banda);
        assert.ok(d.includes(`con un coeficiente de ${r.toFixed(3)}, la asociación observada es de magnitud ${banda}, ${frases[frase]}`), `r = ${r}: «${banda}» y su frase`);
    }
});
