// @ts-check
// tests/ui/ronda-2027-01-04.test.js — (2027.01.04) lo que encontró la revisión de la 2027.01.03 en lo que ya venía de antes,
// sobre index.html real y la base del caso 1 de ejemplos/: el párrafo repetido de «Los porqués detrás de estos números», la
// plantilla de la discusión con su Markdown a la vista (los «**» y los «---», todo en un párrafo, y el intervalo de confianza
// resaltado como un hueco por llenar), «Descargar resultados» con los controles y los ejes de los gráficos dentro, el
// atributo hidden, que una regla con display dejaba sin efecto (los «Cancelar» y las barras de progreso a la vista), los
// intervalos del bootstrap que sobrevivían a cargar los datos de nuevo y el Esc de la ayuda de un gráfico.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { analizadorConElCaso1 } from './con-el-caso-1.js';

const raiz = new URL('../../', import.meta.url);
/** @type {any} */ let env;
/** @type {Record<string, any>} */ let ui = {};
const q = (/** @type {string} */ sel) => env.document.querySelector(sel);
const qa = (/** @type {string} */ sel) => env.document.querySelectorAll(sel);
/** @param {() => any} cond */
const esperar = async (cond, ms = 20000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error('tiempo de espera agotado'); await new Promise(r => setTimeout(r, 25)); } };

// la base del caso 1 y su correlación, como en el caso (paso 3: General_EE y General_EB): (2027.01.05) en con-el-caso-1.js
before(async () => { ({ env, ui } = await analizadorConElCaso1()); });

test('«Los porqués detrás de estos números»: cada explicación, una sola vez', () => {
    const titulo = qa('h5').find((/** @type {any} */ h) => /Los porqués detrás de estos números/.test(h.textContent));
    assert.ok(titulo, 'el recuadro está');
    const parrafos = titulo.parentElement.querySelectorAll('p').map((/** @type {any} */ p) => p.querySelector('b').textContent);
    assert.ok(parrafos.length >= 2);
    assert.equal(new Set(parrafos).size, parrafos.length, `sin preguntas repetidas: ${parrafos.join(' | ')}`);
});

test('la plantilla de la discusión, con la forma de su Markdown: negritas, listas y rayas; sin «**» ni «---» a la vista', () => {
    const caja = q('#resultadosDiscusion .discussion-box');
    const html = caja.innerHTML, texto = caja.textContent;
    assert.ok(!texto.includes('**') && !/(^|\s)---(\s|$)/.test(texto), 'sin las marcas del Markdown');
    assert.ok(caja.querySelectorAll('strong').some((/** @type {any} */ s) => s.textContent === 'MARCO DE INVESTIGACIÓN'), 'los títulos de los apartados, en negrita');
    assert.ok(caja.querySelectorAll('hr').length >= 3, 'las rayas entre los apartados');
    assert.ok(caja.querySelectorAll('ol li').length >= 1 && caja.querySelectorAll('ul li').length >= 6, 'los objetivos, las implicaciones, las limitaciones y las recomendaciones, en listas');
    assert.ok(caja.querySelectorAll('p').length >= 8, `en párrafos (${caja.querySelectorAll('p').length})`);
    // solo los huecos por llenar, resaltados: no el intervalo de confianza
    const resaltados = caja.querySelectorAll('.highlight').map((/** @type {any} */ s) => s.textContent);
    assert.ok(resaltados.includes('[AUTOR]') && resaltados.includes('[AÑO]') && resaltados.includes('[RECOMENDACIÓN 1]'), resaltados.join(' '));
    assert.ok(resaltados.every((/** @type {string} */ r) => /^\[[A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ0-9 /.,-]*\]$/.test(r)), `solo huecos: ${resaltados.join(' ')}`);
    assert.match(texto, /IC 95% \[-?0\.\d+, -?0\.\d+\]/, 'el intervalo de confianza sigue en el texto');
    assert.ok(!/<span class="highlight">\[-?\d/.test(html), 'pero sin resaltar');
});

test('la plantilla de la discusión escapa lo que viene de la base (el nombre de una variable no es HTML)', () => {
    const html = ui.resultados.plantillaDiscusionHtml('**Hipótesis:** la relación entre <img src=x onerror="alert(1)"> y [AUTOR] ([AÑO]), IC [0.10, 0.20].');
    assert.ok(!html.includes('<img'), html);
    assert.match(html, /&lt;img src=x onerror=(&quot;|")alert\(1\)(&quot;|")&gt;/);
    assert.match(html, /<strong>Hipótesis:<\/strong>/);
    assert.match(html, /<span class="highlight">\[AUTOR\]<\/span> \(<span class="highlight">\[AÑO\]<\/span>\)/, 'el «[AUTOR] ([AÑO])» no es un enlace');
    assert.ok(html.includes('IC [0.10, 0.20]') && !html.includes('highlight">[0.10'), 'el intervalo, sin resaltar');
});

test('«Descargar resultados»: el texto, sin los controles ni los gráficos', async () => {
    const antes = env.descargas.length;
    ui.sociodemografica.descargarResultados();
    assert.equal(env.descargas.length, antes + 1, 'se descargó');
    const texto = await env.descargas[env.descargas.length - 1].text();
    assert.match(texto, /^RESULTADOS DEL ANÁLISIS ESTADÍSTICO/);
    assert.match(texto, /ANÁLISIS DE CORRELACIÓN/);
    assert.match(texto, /ANÁLISIS DE FIABILIDAD/);
    assert.match(texto, /Se halló una correlación negativa estadísticamente significativa/, 'la frase APA (lo que acompaña a «Copiar»)');
    // los controles del bootstrap (están en la página: sus opciones no son resultados) y los botones
    assert.ok(q('#bootCalcular') && q('#bootB'), 'el panel del bootstrap está en la página');
    // (sin intervalos calculados, tampoco el título de su bloque)
    for (const control of ['Intervalos de confianza por bootstrap', 'Calcular intervalos', 'Remuestras (B)', '1000 (recomendado)', 'BCa (corrige sesgo y asimetría)', 'Anótala en el informe', 'Cancelar', 'Copiar']) {
        assert.ok(!texto.includes(control), `sin «${control}»`);
    }
    // los textos de los gráficos (sus ejes), si los hay en la página
    const ejes = qa('svg text').map((/** @type {any} */ t) => t.textContent.trim()).filter((/** @type {string} */ t) => /[A-Za-zÁÉÍÓÚáéíóú]{6,}/.test(t));
    for (const eje of new Set(ejes)) assert.ok(!texto.includes(`\n${eje}\n`) && !texto.includes(eje + 'Cuantiles'), `sin el texto del gráfico «${eje}»`);
    assert.ok(!texto.includes('Cuantiles observados'), 'sin los ejes del Q-Q');
});

test('textoParaExportar: sin controles, gráficos ni lo marcado; una celda con <br> en una línea; las listas con su marca; el original, intacto', () => {
    const caja = env.document.createElement('div');
    caja.innerHTML = '<p>Resultado</p><button type="button">Copiar</button><label for="x">Remuestras</label><select id="x"><option>500</option></select>'
        + '<input type="number" value="7"><progress max="100"></progress><svg><text>Frecuencia</text></svg><canvas>sin lienzo</canvas>'
        + '<table><tr><td>0.849<br>[0.822, 0.873]</td><th>α<br>IC</th></tr></table><div data-no-exportar>Para qué sirve</div>'
        + '<ol start="3"><li>tres</li><li>cuatro</li></ol><ul><li>uno</li><li>otro</li></ul><p>línea<br>nueva</p>';
    env.document.body.appendChild(caja);
    const antes = caja.innerHTML, hijos = env.document.body.childNodes.length;
    const t = ui.textoParaExportar(caja);
    for (const dentro of ['Resultado', '0.849 [0.822, 0.873]', 'α IC', '3. tres', '4. cuatro', '- uno', '- otro']) assert.ok(t.includes(dentro), `con «${dentro}»: ${t}`);
    for (const fuera of ['Copiar', 'Remuestras', '500', 'Frecuencia', 'sin lienzo', 'Para qué sirve']) assert.ok(!t.includes(fuera), `sin «${fuera}»: ${t}`);
    assert.ok(!t.includes('línea nueva'), 'fuera de una tabla, un <br> sigue siendo un salto');
    assert.equal(caja.innerHTML, antes, 'el original, intacto');
    assert.equal(env.document.body.childNodes.length, hijos, 'sin la copia en la página');
    caja.remove();
    // un elemento suelto (sin padre): su texto, igual de limpio
    const suelto = env.document.createElement('div');
    suelto.innerHTML = '<p>R</p><button>Copiar</button>';
    assert.equal(ui.textoParaExportar(suelto).trim(), 'R');
});

test('el atributo hidden oculta siempre: la regla de la base le gana a cualquier display', () => {
    const base = fs.readFileSync(new URL('assets/css/base.css', raiz), 'utf8');
    assert.match(base, /\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/);
    // y los botones y las filas de progreso que nacen ocultos lo están en el marcado (la regla hace el resto)
    for (const id of ['#afeCancelar', '#invCancelar', '#bootCancelar', '#afeProgresoFila', '#bootProgresoFila', '#invProgresoFila']) {
        const el = q(id);
        if (el) assert.ok(el.hidden, `${id}, oculto mientras no hay un cálculo en marcha`);
    }
});

test('(revisión) los intervalos del bootstrap se olvidan al cargar datos de nuevo (también al volver a abrir el mismo caso)', async () => {
    const { Fiabilidad } = await import(new URL('src/analizador/fiabilidad.js', raiz).href);
    Fiabilidad._bootstrap = { opciones: { B: 500, metodo: 'percentil', nivel: 0.95, semilla: 7 }, porClave: new Map([['huella', { inferior: 0.8, superior: 0.9 }]]) };
    assert.ok(Fiabilidad._datosMostrados, 'la fiabilidad está a la vista');
    ui.carga.cargarDatosGenerados();   // los mismos datos, otra vez (como al volver a abrir el caso)
    assert.equal(Fiabilidad._bootstrap, null, 'sin los intervalos de antes');
    assert.equal(Fiabilidad._datosMostrados, null, 'y lo que estaba a la vista ya no lo está (un cálculo que termine después no lo pinta)');
});

test('(revisión) la ayuda de un gráfico se cierra con Esc solo si está abierta, y marca ese Esc como usado (la guía de un ejemplo no se detiene por él)', () => {
    const modal = q('#modalAyudaGrafico');
    assert.ok(modal, 'la ventana de ayuda de los gráficos existe tras el análisis');
    /** Un Esc en la página (como el de minidom: lo que el navegador le pasa a sus oyentes). */
    const pulsar = () => { const ev = { type: 'keydown', key: 'Escape', bubbles: true, cancelable: true, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, stopImmediatePropagation() {} }; env.document.dispatchEvent(ev); return ev; };
    modal.style.display = 'flex';
    const abierta = pulsar();
    assert.equal(modal.style.display, 'none', 'se cierra');
    assert.equal(abierta.defaultPrevented, true, 'y lo marca como usado');
    const cerrada = pulsar();
    assert.equal(cerrada.defaultPrevented, false, 'cerrada, no lo toca');
});

test('(revisión) un bootstrap que termina después de cargar otros datos no deja sus intervalos ni vuelve a pintar la tarjeta', async () => {
    const { Fiabilidad } = await import(new URL('src/analizador/fiabilidad.js', raiz).href);
    const { bus, EVENTOS } = await import(new URL('src/shared/eventos.js', raiz).href);
    // unos datos pequeños y continuos (sin coeficientes ordinales): el bootstrap tarda poco
    let s = 42;
    const azar = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const filas = Array.from({ length: 40 }, () => {
        const f = azar(), g = azar();
        return Object.fromEntries([1, 2, 3, 4].flatMap(k => [[`A${k}`, f + azar() * 0.6], [`B${k}`, g + azar() * 0.6]]));
    });
    /** Pide el bootstrap en la tarjeta; con «recargar», carga otros datos en el mismo instante. @param {boolean} recargar */
    const pedir = recargar => {
        Fiabilidad._bootstrap = null;
        Fiabilidad.mostrar('resultadosFiabilidad', filas);
        const boton = q('#resultadosFiabilidad #bootCalcular');
        assert.ok(boton && !boton.disabled, 'se puede calcular');
        q('#bootB').value = '500';
        boton.click();
        if (recargar) bus.emit(EVENTOS.DATOS_CARGADOS);
    };
    const t0 = Date.now();
    pedir(false);
    await esperar(() => Fiabilidad._bootstrap !== null, 60000);
    const tarda = Date.now() - t0;
    assert.ok(q('#resultadosFiabilidad #bootResultados table'), 'sin cargar otros datos, sus intervalos quedan en la tarjeta');
    // con intervalos, el bloque pasa al texto de «Descargar resultados»: su título y su tabla, sin sus opciones ni sus botones
    const texto = ui.textoParaExportar(q('#resultadosFiabilidad'));
    assert.ok(texto.includes('Intervalos de confianza por bootstrap'), 'el título del bloque, con sus intervalos');
    for (const control of ['Remuestras (B)', '1000 (recomendado)', 'Más remuestras estabilizan', 'BCa es más exacto', 'El 95 % es el estándar en tesis', 'Anótala en el informe', 'Calcular intervalos', 'Para qué sirve']) {
        assert.ok(!texto.includes(control), `sin «${control}»`);
    }
    pedir(true);
    const boton = q('#resultadosFiabilidad #bootCalcular');
    await new Promise(r => setTimeout(r, 2 * tarda + 300));
    // (cuarta revisión) desde la tercera, cargar otros datos lo cancela: ni llega a calcularse (que unos intervalos que
    // terminen igual, sin poder cancelarse, se descarten lo prueba tests/ui/fiabilidad-en-curso.test.js, con un Worker que falla)
    assert.equal(q('#resultadosFiabilidad #bootEstado').textContent, 'Cálculo cancelado.', 'cancelado');
    assert.equal(Fiabilidad._bootstrap, null, 'con otros datos cargados mientras tanto, sus intervalos se descartan');
    assert.equal(q('#resultadosFiabilidad #bootCalcular'), boton, 'y la tarjeta no se vuelve a pintar (su botón es el mismo)');
    assert.equal(q('#resultadosFiabilidad #bootResultados table'), null, 'sin intervalos en ella');
});
