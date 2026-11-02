// tests/ui/relacionadas.test.js — (2027.01.17) la tarjeta 8 (medidas repetidas y muestras relacionadas) sobre index.html real:
// reconoce las ondas del Simulador y los antes y después, ofrece los factores entre sujetos, aplica el protocolo con los mismos
// números que el núcleo (verificado contra el oráculo de SciPy en tests/unit/relacionadas.test.js), escribe las tablas, el
// gráfico de perfil y la redacción sin huecos, descarga el Word y lo olvida todo con otros datos. Y la detección, la matriz
// de casos completos y la redacción de cada rama, sin la página.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';
import { problemasDeCitas } from './citas.js';

const raiz = new URL('../../', import.meta.url);
const { datos: D } = JSON.parse(fs.readFileSync(new URL('../oracle/relacionadas_fixture.json', import.meta.url), 'utf8'));
let env, ui, q, nucleo, AE;

/** Una base con tres ondas (las del Simulador: General_ST, _T2, _T3), un antes y después, un ítem 0/1 en dos ondas y un grupo. */
function base() {
    const Y = D.mixto_2x3.Y, g = D.mixto_2x3.g;
    return Y.map((f, i) => ({
        ID: i + 1, Grupo: g[i] ? 'Experimental' : 'Control', General_ST: f[0], General_ST_T2: f[1], General_ST_T3: f[2],
        Estres_pre: D.pares_normal[0][i], Estres_post: D.pares_normal[1][i], ST1: D.cochran3[i][0], ST1_T2: D.cochran3[i][2]
    }));
}

before(async () => {
    env = crearEntorno(fs.readFileSync(new URL('index.html', raiz), 'utf8'));
    env.document.readyState = 'interactive';
    globalThis.fetch = () => Promise.reject(new Error('sin red'));
    await import(new URL('src/main.js', raiz));
    await new Promise(r => setTimeout(r, 0));
    env.document.readyState = 'complete';
    env.disparar(env.document, 'DOMContentLoaded', { bubbles: false });
    q = s => document.querySelector(s);
    ({ AnalizadorEstadistico: AE } = await import(new URL('src/analizador/estadistica.js', raiz)));
    AE.cargarDatos(base());
    ui = await import(new URL('src/analizador/relacionadas/relacionadas-ui.js', raiz));
    nucleo = await import(new URL('src/core/stats/relacionadas.js', raiz));
});

test('la tarjeta 8 reconoce las ondas, los antes y después y los ítems, y ofrece el factor entre sujetos', () => {
    assert.match(q('#relacionadasContainer .card-title').textContent, /8\. Medidas repetidas y muestras relacionadas/);
    env.disparar(q('#rmActualizar'), 'click');
    const ops = [...document.querySelectorAll('#rmConjunto option')].map(o => `${o.value}=${o.textContent}`);
    assert.ok(ops.includes('ondas:General_ST=General_ST (T1, T2, T3)'), ops.join(' | '));
    assert.ok(ops.includes('prepost:Estres=Estres (Pre, Post)') && ops.includes('ondas:ST1=ST1 (T1, T2)') && ops.at(-1) === 'propia=Lista propia de columnas…', ops.join(' | '));
    assert.equal(document.querySelectorAll('#rmConjunto optgroup').length, 3, 'puntajes, otras variables e ítems, por separado');
    const factores = [...document.querySelectorAll('#rmFactor option')].map(o => o.value);
    assert.deepEqual(factores.filter(Boolean), ['Grupo'], 'el grupo es candidato; el identificador y las medidas (también las de los otros conjuntos: el ítem 0/1 de dos ondas), no');
    // la zona de resultados es la que se imprime (impresion.css: las tarjetas con un hijo «…Resultados»)
    assert.ok(q('#relacionadasContainer > #rmResultados') && q('#relacionadasContainer > #rmMensajes'));
});

test('tres ondas → el ANOVA de medidas repetidas del núcleo (o Friedman), con sus tablas, el gráfico y la redacción sin huecos', () => {
    const sel = q('#rmConjunto'); sel.value = 'ondas:General_ST'; env.disparar(sel, 'change');
    q('#rmFactor').value = '';
    const P = ui.calcular();
    assert.ok(P && P.diseno === 'varias');
    const rm = nucleo.anovaMedidasRepetidas(D.mixto_2x3.Y);
    if (P.prueba === 'anova-rm') assert.equal(P.global.F, rm.F); else assert.equal(P.prueba, 'friedman');
    const zona = q('#rmResultados');
    assert.equal(zona.hidden, false);
    assert.match(zona.textContent, /Prueba aplicada: (ANOVA de medidas repetidas|prueba de Friedman)/);
    assert.ok(zona.querySelector('svg[role="img"]'), 'el gráfico de perfil');
    assert.equal(zona.querySelector('svg').getAttribute('width'), null, 'sin ancho escrito: la página no le invierte los colores');
    const parrafo = q('#rmParrafo').textContent;
    assert.match(parrafo, /^Se comparó General_ST en las mismas 30 personas a lo largo de las 3 medidas/);
    assert.doesNotMatch(zona.innerHTML, /undefined|NaN|\[object/);
});

test('con el grupo → el ANOVA mixto, con la interacción y sus efectos simples; el Word se descarga con su figura', async () => {
    q('#rmFactor').value = 'Grupo';
    const P = ui.calcular();
    assert.equal(P.prueba, 'anova-mixta');
    const mx = nucleo.anovaMixta(D.mixto_2x3.Y, D.mixto_2x3.g);
    assert.equal(P.global.interaccion.F, mx.interaccion.F, 'la F de la interacción, la del núcleo');
    assert.ok(P.simples, 'en estos datos la interacción es significativa: efectos simples');
    const texto = q('#rmResultados').textContent;
    assert.match(texto, /Efectos simples: el cambio entre las medidas dentro de cada grupo de Grupo/);
    assert.match(q('#rmParrafo').textContent, /ANOVA mixto 2 × 3, con Grupo entre sujetos \(Control, n = 15; Experimental, n = 15\)/);
    const antes = env.descargas.length;
    globalThis.htmlDocx = { asBlob: html => new Blob([html], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }) };   // el conversor, ya cargado
    const nombre = await ui.exportarWord();
    assert.match(nombre, /^medidas_repetidas_APA\.docx?$/);
    const doc = await env.descargas[antes].text();
    assert.match(doc, /<b>Tabla 1<\/b>/); assert.match(doc, /Referencias/); assert.match(doc, /Olejnik, S\. y Algina, J\. \(2003\)/);
    assert.doesNotMatch(doc, /undefined|NaN|\[object/);
    assert.deepEqual(problemasDeCitas(doc), { sinReferencia: [], sinCita: [] }, 'las citas del Word, frente a sus referencias');
});

test('antes y después dicotómico → McNemar; la lista propia; los errores se explican; otros datos lo olvidan', async () => {
    const sel = q('#rmConjunto'); sel.value = 'ondas:ST1'; env.disparar(sel, 'change'); q('#rmFactor').value = '';
    assert.equal(ui.calcular().prueba, 'mcnemar');
    sel.value = 'propia'; env.disparar(sel, 'change');
    assert.equal(q('#rmColumnas').hidden, false);
    q('#rmColumnas').value = 'Estres_pre, Estres_post';
    const P = ui.calcular();
    assert.equal(P.diseno, 'dos');
    assert.match(q('#rmParrafo').textContent, /^Se comparó Estres en las mismas 30 personas entre Estres_pre/);
    q('#rmColumnas').value = 'Estres_pre';
    assert.equal(ui.calcular(), null);
    assert.match(q('#rmMensajes').textContent, /al menos dos columnas/);
    q('#rmColumnas').value = 'Estres_pre, Grupo';
    assert.equal(ui.calcular(), null);
    assert.match(q('#rmMensajes').textContent, /no son numéricas: Grupo/);
    // otros datos: lo calculado ya no vale
    q('#rmColumnas').value = 'Estres_pre, Estres_post';
    ui.calcular();
    const { bus, EVENTOS } = await import(new URL('src/shared/eventos.js', raiz));
    bus.emit(EVENTOS.DATOS_CARGADOS);
    assert.equal(q('#rmResultados').hidden, true);
    assert.equal(ui.resultadoRelacionadas(), null);
});

test('la detección: ondas con separador (no «ST12»), antes y después al final o al principio, y la matriz de casos completos', async () => {
    const { detectarConjuntosMedidas, candidatosFactorEntre, extraerMatriz } = await import(new URL('src/analizador/relacionadas/deteccion.js', raiz));
    const c = detectarConjuntosMedidas(['General_ST', 'General_ST_T2', 'ST12', 'ST1', 'S', 'Compre', 'Com', 'Pre_Estres', 'Post_Estres', 'Seguimiento_Estres', 'Animo_T1', 'Animo_T3', 'Animo_T2']);
    assert.deepEqual(c.map(x => [x.clave, x.columnas.join(','), x.nombres.join(',')]), [
        ['ondas:General_ST', 'General_ST,General_ST_T2', 'T1,T2'], ['ondas:Animo', 'Animo_T1,Animo_T2,Animo_T3', 'T1,T2,T3'],
        ['prepost:Estres', 'Pre_Estres,Post_Estres,Seguimiento_Estres', 'Pre,Post,Seguimiento']]);
    const filas = [{ ID: 1, G: 'b', X: 1, Y: 2 }, { ID: 2, G: 'a', X: '', Y: 3 }, { ID: 3, G: 'a', X: '2,5', Y: 4 }, { ID: 4, G: '', X: 3, Y: 5 }];
    assert.deepEqual(candidatosFactorEntre(filas, ['X', 'Y']).map(x => x.columna), ['G']);
    const m = extraerMatriz(filas, ['X', 'Y'], 'G');
    assert.deepEqual(m.Y, [[1, 2], [2.5, 4]]); assert.deepEqual(m.grupos, [1, 0]); assert.deepEqual(m.niveles, ['a', 'b']); assert.equal(m.excluidos, 2);
});

test('la redacción de cada rama, sin huecos, y las referencias del catálogo en orden alfabético', async () => {
    const { protocoloRelacionadas } = await import(new URL('src/core/stats/protocolo-relacionadas.js', raiz));
    const red = await import(new URL('src/analizador/relacionadas/redaccion.js', raiz));
    const casos = [
        [D.pares_normal[0].map((x, i) => [x, D.pares_normal[1][i]]), null, ['Pre', 'Post']],
        [D.pares_todos_positivos[0].map((x, i) => [x, D.pares_todos_positivos[1][i]]), null, ['A', 'B']],
        [Array.from({ length: 30 }, (_, i) => [10 + (i % 7), 10 + (i % 7) + (i < 26 ? 0.2 * (i % 3) : 15 + i)]), null, ['Antes', 'Después']],
        [D.rm4_ar, null, ['T1', 'T2', 'T3', 'T4']], [D.friedman_empates, null, ['T1', 'T2', 'T3', 'T4']],
        [Array.from({ length: 40 }, (_, i) => { const b = (i * 37) % 11; return [b, b + 1 + (i % 5 === 0 ? 30 : 0), b + 2 + (i % 4 === 0 ? 25 : 0)]; }), null, ['T1', 'T2', 'T3']], [D.rm6_n4, null, ['A', 'B', 'C', 'D', 'E', 'F']],
        [D.cochran3, null, ['T1', 'T2', 'T3']], [D.cochran4.map(f => [f[0], f[1]]), null, ['T1', 'T2']],
        [D.mixto_3x4.Y, D.mixto_3x4.g, ['T1', 'T2', 'T3', 'T4']], [D.mixto_2x2.Y, D.mixto_2x2.g, ['T1', 'T2']]
    ];
    const pruebas = new Set();
    for (const [Y, g, nombres] of casos) {
        const P = protocoloRelacionadas(Y, { grupos: g });
        pruebas.add(P.prueba);
        const ctx = { que: 'la ansiedad', nombres, factor: g ? 'Condición' : null, niveles: g ? ['A', 'B', 'C'].slice(0, Math.max(...g) + 1) : [], excluidos: 1 };
        const todo = red.redactar(P, ctx) + JSON.stringify(red.tablasRelacionadas(P, ctx)) + red.documentoWordRelacionadas(P, ctx, null) + red.porques(P).join('');
        assert.doesNotMatch(todo, /undefined|NaN|\[object|null/, `${P.prueba}: ${todo.match(/.{30}(undefined|NaN|\[object|null).{10}/)}`);
        const refs = red.referenciasRelacionadas(P), planas = refs.map(r => r.replace(/<[^>]+>/g, ''));
        assert.deepEqual(planas, [...planas].sort((a, b) => a.localeCompare(b, 'es')), 'en orden alfabético');
        assert.equal(new Set(refs).size, refs.length, 'sin repetir');
    }
    for (const p of ['t-pareada', 'wilcoxon', 'anova-rm', 'friedman', 'cochran', 'mcnemar', 'anova-mixta']) assert.ok(pruebas.has(p), `la rama ${p} se redactó`);
});
