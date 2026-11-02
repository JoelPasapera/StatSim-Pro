// tests/ui/multinivel.test.js — (2027.01.19) la tarjeta «15. Modelos multinivel (intercepto aleatorio)» sobre index.html
// real: ofrece las agrupaciones (de texto primero) y los predictores, reconoce los de nivel 2, centra como se pide, da los
// números del núcleo (verificados contra el oráculo en tests/unit/multinivel.test.js), redacta sin huecos, muestra la
// sintaxis de lmerTest y MIXED, descarga el Word y explica lo que no puede ajustar.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';
import { problemasDeCitas } from './citas.js';

const raiz = new URL('../../', import.meta.url);
const O = JSON.parse(fs.readFileSync(new URL('../oracle/multinivel_fixture.json', import.meta.url), 'utf8'));
let env, ui, q;

before(async () => {
    env = crearEntorno(fs.readFileSync(new URL('index.html', raiz), 'utf8'));
    env.document.readyState = 'interactive';
    globalThis.fetch = () => Promise.reject(new Error('sin red'));
    await import(new URL('src/main.js', raiz));
    await new Promise(r => setTimeout(r, 0));
    env.document.readyState = 'complete';
    env.disparar(env.document, 'DOMContentLoaded', { bubbles: false });
    q = s => document.querySelector(s);
    ui = await import(new URL('src/analizador/multinivel/multinivel-ui.js', raiz));
    globalThis.htmlDocx = { asBlob: html => new Blob([html]) };
    const E = O.grande;
    // ClimaEscala, la misma variable de nivel 2 en otra escala (colineal con Clima)
    const filas = E.y.map((/** @type {number} */ y, /** @type {number} */ i) => ({ ID: i + 1, Rendimiento: y, Horas: E.x[i], Clima: E.w[i], ClimaEscala: 10 * E.w[i] + 50, Colegio: `Colegio ${E.g[i] + 1}`, Turno: i % 2 ? 'Tarde' : 'Mañana' }));
    filas[3].Horas = '';   // un perdido
    const { reemplazarFilas } = await import(new URL('src/analizador/ui/carga.js', raiz));
    reemplazarFilas(filas);
});

/** Marca los predictores. @param {string[]} cols */
const marcar = cols => document.querySelectorAll('#mnPredictores input').forEach(e => { e.checked = cols.includes(e.value); });

test('la tarjeta 15 ajusta el modelo nulo y el de los predictores con los números del núcleo', async () => {
    assert.match(q('#multinivelContainer .card-title').textContent, /^15\. Modelos multinivel \(intercepto aleatorio\)/);
    env.disparar(q('#mnActualizar'), 'click');
    const grupos = [...document.querySelectorAll('#mnGrupo option')].map(o => o.value);
    assert.equal(grupos[0], 'Colegio', 'la de texto con más grupos, primero');
    assert.ok(!grupos.includes('ID') && !grupos.includes('Turno'), `ni el identificador ni la de dos valores: ${grupos.join(', ')}`);
    q('#mnY').value = 'Rendimiento'; q('#mnGrupo').value = 'Colegio';
    marcar(['Horas', 'Clima']);
    q('#mnCentrado').value = 'ninguno';
    const A = ui.calcular();
    assert.ok(A, q('#mnMensajes').textContent);
    const { ajustarInterceptoAleatorio } = await import(new URL('src/core/stats/multinivel.js', raiz));
    const E = O.grande, uso = E.y.map((_, i) => i).filter(i => i !== 3);
    const R = ajustarInterceptoAleatorio(Float64Array.from(uso, i => E.y[i]), [Float64Array.from(uso, i => E.x[i]), Float64Array.from(uso, i => E.w[i])], uso.map(i => E.g[i]));
    assert.deepEqual(A.completo.coeficientes.map(c => c.b), R.coeficientes.map(c => c.b));
    assert.equal(A.completo.s2u, R.s2u);
    const { ctx } = ui.resultadoMultinivel();
    assert.deepEqual(ctx.predictores.map(p => [p.columna, p.nivel, p.centrado]), [['Horas', 1, 'ninguno'], ['Clima', 2, 'ninguno']], 'Clima, de nivel 2');
    assert.match(q('#mnMensajes').textContent, /1 caso\(s\) sin la dependiente, sin grupo o sin algún predictor quedan fuera \(N = 334\)/);
    const res = q('#mnResultados');
    assert.equal(res.hidden, false);
    assert.doesNotMatch(res.innerHTML, /undefined|NaN|\[object/);
    assert.equal(res.querySelectorAll('table').length, 2);
    const p = q('#mnParrafo').textContent;
    assert.match(p, /^Se estimó un modelo multinivel de intercepto aleatorio con las 334 personas con datos completos \(se excluyó 1\) anidadas en 30 grupos de Colegio/);
    assert.match(p, /la correlación intraclase de Rendimiento fue de \.\d{3}: el \d+\.\d % de su varianza está entre los grupos, una varianza significativa/);
    assert.match(p, /mayor que 2: ignorar el anidamiento sesgaría los errores típicos \(Muthén y Satorra, 1995\)/);
    assert.match(p, /Se asociaron con Rendimiento: Horas, b = \d\.\d{2}, EE = \d\.\d{2}, t\(\d+\.\d\) = \d+\.\d{2}, p < \.001/);
    assert.match(p, /Los grados de libertad son los de Satterthwaite \(1946\), como en lmerTest \(Kuznetsova et al\., 2017\)\./);
    assert.match(p, /Con 30 grupos \(50 o menos\), los errores típicos de nivel 2 pueden estar subestimados \(Maas y Hox, 2005\)\.$/);
    const s = res.querySelector('.sintaxis-equivalente').textContent;
    assert.match(s, /lmerTest::lmer\(Rendimiento ~ Horas \+ Clima \+ \(1 \| Colegio\), data = d\)/);
    assert.match(s, /MIXED Rendimiento WITH Horas Clima\s+\/FIXED=Horas Clima \| SSTYPE\(3\)/);
    assert.equal(await ui.exportarWord(), 'multinivel_APA.docx');
    assert.deepEqual(problemasDeCitas(await env.descargas.at(-1).text()), { sinReferencia: [], sinCita: [] }, 'las citas del Word, frente a sus referencias');
    assert.match(await env.descargas.at(-1).text(), /Tabla 1[\s\S]*Tabla 2[\s\S]*Raudenbush, S\. W\./);
});

test('centrado en el grupo con las medias de grupo: tres predictores, el de nivel 2 en la gran media; la sintaxis los centra igual', () => {
    q('#mnCentrado').value = 'grupo'; q('#mnMedias').checked = true;
    marcar(['Horas', 'Clima']);
    const A = ui.calcular();
    assert.ok(A);
    const { ctx } = ui.resultadoMultinivel();
    assert.deepEqual(ctx.predictores.map(p => [p.columna, p.nivel, p.centrado, !!p.mediaDeGrupo]), [['Horas', 1, 'grupo', false], ['Clima', 2, 'gran-media', false], ['Horas', 2, 'gran-media', true]]);
    assert.equal(A.completo.coeficientes.length, 4);
    assert.match(q('#mnParrafo').textContent, /Los predictores de nivel 1 se centraron en la media de su grupo \(Enders y Tofighi, 2007\)\./);
    assert.match(q('#mnResultados').textContent, /Horas \(centrado en el grupo\)[\s\S]*Horas \(media del grupo\)/);
    const s = q('#mnResultados .sintaxis-equivalente').textContent;
    assert.match(s, /d\$Horas_cg <- d\$Horas - ave\(d\$Horas, d\$Colegio\)/);
    assert.match(s, /d\$Horas_mg <- ave\(d\$Horas, d\$Colegio\) - mean\(d\$Horas\)/);
    assert.match(s, /lmer\(Rendimiento ~ Horas_cg \+ Clima_cm \+ Horas_mg \+ \(1 \| Colegio\)/);
});

test('(2027.01.20) dos predictores colineales: el mensaje del núcleo, sin resultados', () => {
    q('#mnCentrado').value = 'ninguno'; q('#mnMedias').checked = false;
    marcar(['Horas', 'Clima', 'ClimaEscala']);
    assert.equal(ui.calcular(), null);
    assert.match(q('#mnMensajes').textContent, /El modelo con los predictores no se pudo ajustar\. Los predictores son colineales: alguno es una combinación exacta de otros/);
    assert.equal(q('#mnResultados').hidden, true);
    assert.equal(ui.resultadoMultinivel(), null);
});

test('sin predictores, solo el modelo nulo; los errores se explican', () => {
    marcar([]);
    const A = ui.calcular();
    assert.ok(A && A.completo === null);
    assert.equal(q('#mnResultados').querySelectorAll('table').length, 1);
    q('#mnGrupo').innerHTML = '<option value="Rendimiento">Rendimiento</option><option value="Turno">Turno</option>';
    q('#mnGrupo').value = 'Rendimiento';
    assert.equal(ui.calcular(), null);
    assert.match(q('#mnMensajes').textContent, /La dependiente y la agrupación deben ser variables distintas/);
    q('#mnGrupo').value = 'Turno';
    assert.equal(ui.calcular(), null);
    assert.match(q('#mnMensajes').textContent, /Hacen falta al menos 3 grupos con casos \(hay 2\)/);
    q('#mnGrupo').innerHTML = '';
    assert.equal(ui.calcular(), null);
    assert.match(q('#mnMensajes').textContent, /Elige la variable de agrupación/);
    assert.equal(q('#mnResultados').hidden, true);
});

test('los botones «Copiar» de la sintaxis: al portapapeles, o la sintaxis seleccionada para copiarla a mano', async () => {
    env.disparar(q('#mnActualizar'), 'click');
    q('#mnY').value = 'Rendimiento'; q('#mnGrupo').value = 'Colegio';
    marcar(['Horas']);
    assert.ok(ui.calcular());
    let copiado = null;
    Object.defineProperty(globalThis.navigator, 'clipboard', { value: { writeText: async t => { copiado = t; } }, configurable: true });
    const [botonR, botonSPSS] = document.querySelectorAll('#mnResultados .sintaxis-copiar');
    env.disparar(botonR, 'click');
    await new Promise(r => setTimeout(r, 0));
    assert.equal(copiado, document.querySelectorAll('#mnResultados .sintaxis-codigo')[0].textContent);
    assert.match(copiado, /^datos <- read\.csv2/);
    assert.match(q('#toast').textContent, /Sintaxis de R copiada/);
    Object.defineProperty(globalThis.navigator, 'clipboard', { value: undefined, configurable: true });
    env.disparar(botonSPSS, 'click');
    assert.match(q('#toast').textContent, /la sintaxis de SPSS quedó seleccionada para copiarla/);
});
