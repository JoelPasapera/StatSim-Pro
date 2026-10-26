// @ts-check
// tests/unit/graficos-en-papel.test.js — (2027.01.10, revisión) Los gráficos del Analizador en papel blanco y su histograma con
// la curva normal:
// - graficoEnPapel (src/analizador/graficos-en-papel.js), lo que hace con las figuras del Word: los textos claros de la pantalla
//   oscura (escritos en ellos o heredados del lienzo) en tinta, las líneas claras en gris, y lo demás igual; el original, sin
//   tocar. Lo mismo hace impresion.css al imprimir, con los mismos colores (aquí se comprueba que los nombra). Hasta la
//   2027.01.09, en el Word y en el papel el título, los ejes y las leyendas salían casi blancos;
// - el histograma con su curva normal (graficas.js, _histogramaConNormal): la curva, con el ancho de las barras enteras.
//   Hasta la 2027.01.09 tomaba el de la primera, que d3 corta en el mínimo de los datos, y con un mínimo que no caía en una
//   marca la curva salía más baja que las barras, en la proporción de la primera a las demás (en el caso estructural, a la
//   mitad);
// - el lienzo de cada gráfico, ampliado a lo que dibujó (graficas.js, _lienzoAlContenido): solo por el lado que se sale, con
//   el título en su centro, y si aún no se puede medir, cuando se vea (ResizeObserver; sin él, en el cuadro siguiente, una
//   sola vez). Hasta la 2027.01.09, lo que se salía no se imprimía;
// - (2027.01.11, revisión) los recuadros oscuros (las anotaciones de la dispersión), blancos en papel: en la 2027.01.10 su texto
//   quedaba en tinta sobre la caja oscura; el tamaño en la pantalla (_ajustarTamanoCSS), que ya no se achica a cada ajuste ni
//   vuelve a las medidas de antes de ampliar el lienzo; y un título largo, en dos líneas (_partirTitulo);
// - (2027.01.12, revisión) un gráfico dibujado sin verse lo rehace cuando se vea, una sola vez (en la 2027.01.11 lo volvía a
//   pedir en cada cuadro, para siempre), con su título y los nombres de sus ejes decididos otra vez con lo que miden; la card
//   a lo ancho de la fila, solo de la rejilla (la caja por grupos salía a 1,83 veces su tamaño), y en un teléfono a todo su
//   ancho; y el nombre de un eje que no cabe, más pequeño o cortado, y el del eje Y a la izquierda de los valores de su eje.
// En Chromium, con los casos de ejemplos/, lo comprueba tests/navegador/graficos-en-papel.mjs; con datos y nombres extremos,
// tests/navegador/graficos-extremos.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from '../ui/minidom.js';
import { PAPEL, RELLENOS_CLAROS, SERIES_EN_PAPEL, TINTA, TRAZO_CLARO, TRAZO_EN_PAPEL, graficoEnPapel } from '../../src/analizador/graficos-en-papel.js';
import { densidadNormal } from '../../src/core/stats/numerico.js';

/** Los métodos de ScientificCharts (sin construir uno: sin DOM). */
const metodos = async () => /** @type {any} */ ((await import('../../src/analizador/graficas.js')).ScientificCharts.prototype);

/**
 * Un gráfico de mentira en un marco: su ancho (o una función que lo da), su alto según el del gráfico (un marco que crece con
 * él, o uno de alto propio) y, si se da, sus clases (una card de la rejilla: chart-wrapper).
 * @param {any} SC
 * @param {{ viewBox: string, ancho: number | (() => number), alto: (altoGrafico: number) => number, clases?: string[] }} m
 */
function enMarco(SC, { viewBox, ancho, alto, clases = [] }) {
    /** @type {Record<string, string>} */
    const estilo = { width: '', height: '', display: '' };
    /** @type {Record<string, string>} */
    const estiloDelMarco = {};
    const attrs = { viewBox };
    const g = Object.create(SC);
    g.config = { width: 640, height: 400 };
    g.svg = {
        node: () => ({ style: estilo }),
        attr(/** @type {string} */ k, /** @type {string | undefined} */ v) { if (v === undefined) return /** @type {any} */ (attrs)[k]; /** @type {any} */ (attrs)[k] = v; return this; },
        style(/** @type {string} */ k, /** @type {string} */ v) { estilo[k] = v; return this; },
    };
    g.container = {
        classList: { contains: (/** @type {string} */ c) => clases.includes(c) },
        style: estiloDelMarco,
        get clientWidth() { return typeof ancho === 'function' ? ancho() : ancho; },
        get clientHeight() { return alto(parseFloat(estilo.height) || 0); },
    };
    return { g, estilo, estiloDelMarco, attrs, tam: () => `${estilo.width} × ${estilo.height}` };
}

/** Cambia requestAnimationFrame y ResizeObserver por los de mentira mientras corre fn (cuadros: los pedidos, por correr). @param {(cuadros: (() => void)[]) => void | Promise<void>} fn */
async function conCuadros(fn) {
    /** @type {(() => void)[]} */
    const cuadros = [];
    const g = /** @type {any} */ (globalThis), antes = [g.requestAnimationFrame, g.ResizeObserver];
    g.requestAnimationFrame = (/** @type {() => void} */ f) => { cuadros.push(f); return cuadros.length; };
    g.ResizeObserver = undefined;
    try { await fn(cuadros); } finally { [g.requestAnimationFrame, g.ResizeObserver] = antes; }
}

test('graficoEnPapel: los textos claros (escritos o heredados del lienzo), en tinta; las líneas claras, en gris; lo demás y el original, igual', () => {
    const env = crearEntorno('<html><body></body></html>');
    env.document.body.innerHTML = '<svg fill="#e2e8f0" viewBox="0 0 10 10"><text class="t">título</text><g><text fill="#cbd5e1">0,5</text><text fill="#94A3B8">eje</text>'
        + '<text fill="#ffffff">celda</text><text fill="#b91c1c">— Normal teórica</text><text>x<tspan fill="#e2e8f0">2</tspan></text></g>'
        + '<line stroke="#e2e8f0"></line><line stroke="#94a3b8"></line><rect fill="#2E5BBA"></rect>'
        + '<g><rect class="recuadro" fill="rgba(15, 23, 42, 0.92)" stroke="#475569" opacity="0.8"></rect><text fill="#e2e8f0">ρ = 0.327</text></g>'
        + '<g class="crosshair-capa"><line></line><rect class="recuadro"></rect><text fill="#e2e8f0">(1, 2)</text></g></svg>';
    const svg = /** @type {any} */ (env.document.querySelector('svg'));
    const papel = graficoEnPapel(svg);
    assert.equal(papel.getAttribute('fill'), TINTA, 'el lienzo: lo heredan los textos sin color propio (el título, los ejes)');
    assert.deepEqual(papel.querySelectorAll('text').map((/** @type {any} */ t) => t.getAttribute('fill')), [null, TINTA, TINTA, '#ffffff', '#b91c1c', null, TINTA], 'los claros, en tinta; el blanco de una celda y el de una serie, igual');
    assert.equal(papel.querySelector('tspan').getAttribute('fill'), TINTA);
    assert.deepEqual(papel.querySelectorAll('line').map((/** @type {any} */ l) => l.getAttribute('stroke')), [TRAZO_EN_PAPEL, '#94a3b8']);
    assert.equal(papel.querySelector('rect').getAttribute('fill'), '#2E5BBA');
    // (2027.01.11, revisión) el recuadro de las anotaciones, blanco con su borde gris (su texto, en tinta, se lee); la cruz, fuera
    const r = papel.querySelector('.recuadro');
    assert.deepEqual([r.getAttribute('fill'), r.getAttribute('stroke'), r.getAttribute('opacity')], [PAPEL, TRAZO_EN_PAPEL, null], 'el recuadro, en papel');
    assert.equal(papel.querySelectorAll('.crosshair-capa').length, 0, 'sin la cruz del ratón');
    assert.equal(svg.getAttribute('fill'), '#e2e8f0', 'el original, sin tocar (es el de la pantalla)');
    assert.equal(svg.querySelectorAll('text')[1].getAttribute('fill'), '#cbd5e1');
    assert.deepEqual([svg.querySelector('.recuadro').getAttribute('fill'), svg.querySelectorAll('.crosshair-capa').length], ['rgba(15, 23, 42, 0.92)', 1]);
    // y al imprimir, los mismos colores (impresion.css): de cada relleno claro, la raíz, los textos y los tspan
    const css = fs.readFileSync(new URL('../../assets/css/componentes/impresion.css', import.meta.url), 'utf8');
    for (const c of RELLENOS_CLAROS) for (const sel of [`svg[fill="${c}"]`, `svg text[fill="${c}"]`, `svg tspan[fill="${c}"]`]) assert.ok(css.includes(sel), `impresion.css: ${sel}`);
    assert.ok(css.includes(`fill: ${TINTA} !important`) && css.includes(`svg [stroke="${TRAZO_CLARO}"] { stroke: ${TRAZO_EN_PAPEL} !important; }`), 'impresion.css: la misma tinta y el mismo gris');
    assert.ok(css.includes(`svg .recuadro { fill: ${PAPEL} !important;`) && css.includes(`stroke: ${TRAZO_EN_PAPEL} !important; }`) && css.includes('svg .crosshair-capa { display: none !important; }'), 'impresion.css: los recuadros y la cruz, igual');
    for (const [c, p] of Object.entries(SERIES_EN_PAPEL)) for (const a of ['stroke', 'fill']) assert.ok(css.includes(`svg [${a}="${c}"] { ${a}: ${p} !important; }`), `impresion.css: la serie ${c} (${a}), en ${p}`);
});

test('(2027.01.12, revisión) las series claras (las curvas del gráfico de las distribuciones), más oscuras en papel: legibles sobre el blanco (4,5:1 o más)', async () => {
    /** El contraste de un color con el blanco. @param {string} c */
    const conElBlanco = c => {
        const [r, g, b] = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
        return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05);
    };
    for (const [c, p] of Object.entries(SERIES_EN_PAPEL)) {
        assert.ok(conElBlanco(c) < 3, `${c}, claro: ${conElBlanco(c).toFixed(1)}:1 (por eso se cambia)`);
        assert.ok(conElBlanco(p) >= 4.5, `${p}, en papel: ${conElBlanco(p).toFixed(1)}:1`);
    }
    // graficas.js los toma de aquí (la paleta de sus curvas, la de SERIES_EN_PAPEL)
    const fuente = fs.readFileSync(new URL('../../src/analizador/graficas.js', import.meta.url), 'utf8');
    assert.match(fuente, /const PALETA = Object\.keys\(SERIES_EN_PAPEL\);/);
    const env = crearEntorno('<html><body></body></html>');
    env.document.body.innerHTML = '<svg viewBox="0 0 10 10"><path stroke="#FBBF24" fill="#fbbf24" fill-opacity="0.12"></path><line stroke="#2E5BBA"></line></svg>';
    const papel = graficoEnPapel(/** @type {any} */ (env.document.querySelector('svg')));
    assert.deepEqual([papel.querySelector('path').getAttribute('stroke'), papel.querySelector('path').getAttribute('fill'), papel.querySelector('path').getAttribute('fill-opacity'), papel.querySelector('line').getAttribute('stroke')], ['#a16207', '#a16207', '0.12', '#2E5BBA']);
});

test('el histograma con su curva normal: la curva, con el ancho de las barras enteras (no el de la primera, cortada en el mínimo)', async () => {
    const SC = /** @type {any} */ ((await import('../../src/analizador/graficas.js')).ScientificCharts.prototype);
    // una campana de puntajes enteros de 11 a 41, como la del apoyo social del caso estructural: su mínimo, 11, no cae en una
    // marca (las barras van de 2 en 2, por los pares), y d3 corta la primera en él
    const datos = [11];
    for (let v = 12; v <= 41; v++) for (let k = 0; k < Math.round(380 * densidadNormal((v - 27) / 4.8) / 4.8); k++) datos.push(v);
    const H = SC._histogramaConNormal.call(SC, datos);
    assert.deepEqual([H.bins[0].x0, H.bins[0].x1, H.bins[1].x1 - H.bins[1].x0], [11, 12, 2], 'la primera barra, cortada; las de dentro, de 2');
    assert.equal(H.anchoBin, 2, 'la curva, con el de las enteras (la 2027.01.09 tomaba 1: la mitad de su altura)');
    const cima = H.n * H.anchoBin * H.pdf(H.media), barra = Math.max(...H.bins.map((/** @type {any} */ b) => b.length));
    assert.ok(Math.abs(cima - barra) / barra < 0.1, `la cima de la curva (${cima.toFixed(1)}) junto a la de las barras (${barra})`);
    // con todas enteras, igual que antes
    const pares = datos.filter(v => v >= 12);
    assert.equal(SC._histogramaConNormal.call(SC, pares).anchoBin, 2);
});

test('el lienzo de un gráfico, ampliado a lo que dibujó: solo por el lado que se sale (con 4 de margen), con el título en su centro; sin poder medirlo, cuando se vea', async () => {
    const SC = /** @type {any} */ ((await import('../../src/analizador/graficas.js')).ScientificCharts.prototype);
    /**
     * Un gráfico de mentira: su viewBox, lo que mide su dibujo en cada llamada (null: no se puede medir y lanza, como Firefox con
     * uno que no se dibuja) y los tamaños que pide.
     * @param {string | null} viewBox @param {({ x: number, y: number, width: number, height: number } | null)[]} cajas
     */
    const grafico = (viewBox, cajas) => {
        /** @type {Record<string, string | null>} */
        const attrs = { viewBox };
        /** @type {number[][]} */
        const tamanos = [];
        let i = 0;
        const nodo = { getBBox() { const c = cajas[Math.min(i++, cajas.length - 1)]; if (c === null) throw new Error('sin dibujar'); return c; } };
        // el título (d3), con sus líneas: dónde queda centrado (y sin nombre del eje Y)
        const titulo = { x: /** @type {unknown} */ (null), lineas: /** @type {unknown[]} */ ([null, null]) };
        const seleccion = {
            empty: () => false,
            attr(/** @type {string} */ k, /** @type {unknown} */ v) { titulo.x = v; return this; },
            selectAll: () => ({ attr(/** @type {string} */ k, /** @type {unknown} */ v) { titulo.lineas = titulo.lineas.map(() => v); return this; } }),
        };
        const g = Object.create(SC);
        g.config = { width: 520, height: 380 };
        g.svg = {
            node: () => nodo,
            select: (/** @type {string} */ s) => (s === '.titulo-grafico' ? seleccion : { empty: () => true }),
            selectAll: () => ({ nodes: () => [] }),
            attr(/** @type {string} */ k, /** @type {string | undefined} */ v) { if (v === undefined) return attrs[k]; attrs[k] = v; return this; },
        };
        g._ajustarTamanoCSS = (/** @type {number} */ w, /** @type {number} */ h) => { tamanos.push([w, h]); };
        return { g, attrs, tamanos, titulo, medidas: () => i };
    };
    /** @type {(() => void)[]} */
    const cuadros = [];
    const antes = /** @type {any} */ (globalThis).requestAnimationFrame;
    /** @type {any} */ (globalThis).requestAnimationFrame = (/** @type {() => void} */ f) => { cuadros.push(f); return cuadros.length; };
    try {
        // dentro (o fuera por menos de medio punto): igual
        for (const b of [{ x: 10, y: 8, width: 500, height: 360 }, { x: -0.4, y: 0, width: 520.4, height: 380.3 }]) {
            const { g, attrs, tamanos } = grafico('0 0 520 380', [b]);
            g._lienzoAlContenido();
            assert.deepEqual([attrs.viewBox, tamanos], ['0 0 520 380', []], JSON.stringify(b));
        }
        // fuera por la izquierda y por abajo (las etiquetas en diagonal de un eje): solo esos lados, con su margen
        let x = grafico('0 0 520 380', [{ x: -7.3, y: 5, width: 520, height: 387.2 }]);
        assert.equal(x.g._lienzoAlContenido(), true, 'dice que cambió');
        assert.deepEqual([x.attrs.viewBox, x.tamanos], ['-12 0 532 397', [[532, 397]]]);
        assert.deepEqual([x.titulo.x, x.titulo.lineas], [254, [254, 254]], 'el título (y sus líneas), en el centro del lienzo ampliado: -12 + 532 / 2');
        // por arriba y por la derecha (un título largo), con un viewBox con comas; sin viewBox, el del tamaño del gráfico
        x = grafico('0,0,300,200', [{ x: 0, y: -20.5, width: 310.2, height: 150 }]);
        x.g._lienzoAlContenido();
        assert.equal(x.attrs.viewBox, '0 -25 315 225');
        x = grafico(null, [{ x: 0, y: 0, width: 530, height: 100 }]);
        x.g._lienzoAlContenido();
        assert.equal(x.attrs.viewBox, '0 0 534 380');
        assert.equal(cuadros.length, 0, 'lo que se pudo medir, sin esperar');
        // dentro, también lo centra (el diagrama de caja ajusta su lienzo a sus cajas después de poner el título)
        x = grafico('0 0 440 460', [{ x: 10, y: 8, width: 400, height: 440 }]);
        assert.equal(x.g._lienzoAlContenido(), false);
        assert.equal(x.titulo.x, 220);
        // sin poder medirlo (aún no se dibuja) ni ResizeObserver: otra vez en el cuadro siguiente, y entonces sí
        const vacia = { x: 0, y: 0, width: 0, height: 0 };
        x = grafico('0 0 520 380', [vacia, vacia, { x: -10, y: 0, width: 530, height: 380 }]);
        x.g._lienzoAlContenido();
        x.g._lienzoAlContenido();
        assert.deepEqual([x.attrs.viewBox, cuadros.length], ['0 0 520 380', 1], 'una espera, aunque se pida dos veces');
        /** @type {() => void} */ (cuadros.shift())();
        assert.deepEqual([x.attrs.viewBox, x.tamanos], ['-14 0 534 380', [[534, 380]]]);
        // y si tampoco (o lanza), lo deja (con el tamaño de su lienzo): una sola vez más
        x = grafico('0 0 520 380', [null]);
        x.g._lienzoAlContenido();
        assert.equal(cuadros.length, 1);
        /** @type {() => void} */ (cuadros.shift())();
        assert.deepEqual([x.attrs.viewBox, x.tamanos, cuadros.length, x.medidas()], ['0 0 520 380', [[520, 380]], 0, 2]);
        // (2027.01.11, revisión) con ResizeObserver: cuando el lienzo tome tamaño en la pantalla (un gráfico dibujado con su
        // sección oculta, que se muestra después); mientras siga sin él, nada, y después ya no observa
        /** @type {any[]} */
        const observadores = [];
        /** @type {any} */ (globalThis).ResizeObserver = class {
            constructor(/** @type {(e: any[]) => void} */ f) { this.f = f; this.observado = /** @type {unknown} */ (null); this.desconectado = false; observadores.push(this); }
            observe(/** @type {unknown} */ n) { this.observado = n; }
            disconnect() { this.desconectado = true; }
        };
        x = grafico('0 0 520 380', [vacia, vacia, { x: 0, y: -9, width: 520, height: 389 }]);
        x.g._lienzoAlContenido();
        x.g._lienzoAlContenido();
        assert.deepEqual([observadores.length, cuadros.length, observadores[0].observado === x.g.svg.node()], [1, 0, true], 'un observador del lienzo, no un cuadro');
        observadores[0].f([{ contentRect: { width: 0, height: 0 } }]);
        assert.deepEqual([x.attrs.viewBox, observadores[0].desconectado], ['0 0 520 380', false], 'aún oculto: espera');
        observadores[0].f([{ contentRect: { width: 520, height: 380 } }]);
        assert.deepEqual([x.attrs.viewBox, x.tamanos, observadores[0].desconectado], ['0 -13 520 393', [[520, 393]], true], 'a la vista: amplía el lienzo, y ya no observa');
        // sin cuadros ni ResizeObserver (fuera de un navegador), nada
        /** @type {any} */ (globalThis).ResizeObserver = undefined;
        /** @type {any} */ (globalThis).requestAnimationFrame = undefined;
        x = grafico('0 0 520 380', [null]);
        x.g._lienzoAlContenido();
        assert.deepEqual([x.attrs.viewBox, x.tamanos], ['0 0 520 380', []]);
    } finally {
        /** @type {any} */ (globalThis).requestAnimationFrame = antes;
        /** @type {any} */ (globalThis).ResizeObserver = undefined;
    }
});

test('(2027.01.11, revisión) el tamaño en la pantalla: el alto que limita, solo el de una card con alto propio; a cada ajuste, el mismo; y el que se aplaza, con el lienzo de entonces', async () => {
    const SC = await metodos();
    // un marco que crece con el gráfico (los histogramas, la dispersión): a su tamaño, o al ancho del marco; y otra vez, igual
    let x = enMarco(SC, { viewBox: '0 0 640 400', ancho: 574, alto: h => h + 12 });
    x.g._ajustarTamanoCSS(640, 400);
    assert.equal(x.tam(), '574px × 359px');
    x.g._ajustarTamanoCSS(640, 400);
    x.g._ajustarTamanoCSS(640, 400);
    assert.equal(x.tam(), '574px × 359px', 'hasta la 2027.01.10, cada ajuste lo achicaba 34 px de alto');
    assert.equal(x.estilo.height, '359px', 'y la prueba del marco no deja rastro');
    x = enMarco(SC, { viewBox: '0 0 520 380', ancho: 900, alto: h => h });
    x.g._ajustarTamanoCSS(520, 380);
    assert.equal(x.tam(), '520px × 380px', 'en un marco ancho, a su tamaño (no más)');
    // una card con alto propio: no la sobrepasa (deja 34 px para su pie)
    x = enMarco(SC, { viewBox: '0 0 640 400', ancho: 574, alto: () => 320 });
    x.g._ajustarTamanoCSS(640, 400);
    assert.equal(x.tam(), '458px × 286px');
    // sin ancho aún: en el cuadro siguiente, con el lienzo de entonces (no con las medidas de la llamada)
    await conCuadros(cuadros => {
        let ancho = 0;
        const y = enMarco(SC, { viewBox: '0 0 520 380', ancho: () => ancho, alto: h => h });
        y.g._ajustarTamanoCSS(520, 380);
        assert.deepEqual([y.tam(), cuadros.length], ['520px × 380px', 1]);
        y.attrs.viewBox = '-76 0 672 380';   // lo amplió _lienzoAlContenido
        ancho = 520;
        /** @type {() => void} */ (cuadros.shift())();
        assert.equal(y.tam(), '520px × 294px', 'con la proporción del lienzo ampliado (la 2027.01.10 volvía a 520 × 380 con el lienzo de 672)');
    });
});

test('(2027.01.12, revisión) sin ancho aún, lo rehace cuando se vea, una sola vez: no lo vuelve a pedir en cada cuadro mientras siga sin él', async () => {
    const SC = await metodos();
    await conCuadros(cuadros => {
        const x = enMarco(SC, { viewBox: '0 0 520 380', ancho: 0, alto: h => h });
        x.g._ajustarTamanoCSS(520, 380);
        x.g._ajustarTamanoCSS(520, 380);
        assert.equal(cuadros.length, 1, 'una espera, aunque se pida dos veces');
        /** @type {() => void} */ (cuadros.shift())();
        assert.deepEqual([x.tam(), cuadros.length], ['520px × 380px', 0], 'y, aún sin ancho (oculto, o fuera de la página), ya no pide más: la 2027.01.11 lo pedía en cada cuadro, para siempre');
        x.g._ajustarTamanoCSS(520, 380);
        assert.equal(cuadros.length, 1, 'otro dibujo (otra llamada) sí espera otra vez');
    });
});

test('(2027.01.12, revisión) la card a lo ancho de la fila: solo una de la rejilla (.chart-wrapper); y en una pantalla estrecha, a todo su ancho', async () => {
    const SC = await metodos();
    // la caja por grupos (fuera de la rejilla): a su tamaño, como cualquier otro gráfico en un marco que crece con él
    let x = enMarco(SC, { viewBox: '0 0 440 360', ancho: 1168, alto: h => h });
    x.g._expandirCard();
    assert.deepEqual([x.g._cardExpandida, x.estiloDelMarco.gridColumn, x.tam()], [undefined, undefined, ' × '], 'ni la expande ni la toca (la 2027.01.11: 807 × 660)');
    x.g._ajustarTamanoCSS(440, 360);
    assert.equal(x.tam(), '440px × 360px');
    // una card de la rejilla: a lo ancho de la fila (0,82 de ella, hasta 1,9 veces su lienzo y 660 de alto)
    x = enMarco(SC, { viewBox: '0 0 996 503', ancho: 1000, alto: h => h, clases: ['chart-wrapper'] });
    x.g._expandirCard();
    assert.deepEqual([x.g._cardExpandida, x.estiloDelMarco.gridColumn, x.tam()], [true, '1 / -1', '820px × 414px']);
    // en un teléfono (menos de 640), a todo su ancho: la 2027.01.11, al 0,82 (la matriz de 987, de 235 × 228)
    x = enMarco(SC, { viewBox: '0 0 987 959', ancho: 288, alto: h => h, clases: ['chart-wrapper'] });
    x.g._expandirCard();
    assert.equal(x.tam(), '288px × 280px');
});

test('(2027.01.12, revisión) el nombre de un eje que no cabe: más pequeño y, si aún no, cortado (entero, en su <title>); estimado sin medidas, y medido otra vez cuando se vea', async () => {
    const SC = await metodos();
    /** Un texto (d3) de mentira: lo que mide a 12 (0: sin medidas) y lo que queda. @param {number} mide */
    const texto = mide => {
        /** @type {{ attrs: Record<string, unknown>, texto: string, titulo: string | null }} */
        const r = { attrs: {}, texto: '', titulo: null };
        const t = {
            node: () => ({ getComputedTextLength: () => mide * (Number(r.attrs['font-size']) || 12) / 12 }),
            attr(/** @type {string} */ k, /** @type {unknown} */ v) { r.attrs[k] = v; return this; },
            text(/** @type {string} */ v) { r.texto = v; return this; },
            append: () => ({ text(/** @type {string} */ v) { r.titulo = v; return this; } }),
        };
        return { t, r };
    };
    const g = Object.create(SC);
    g.config = { fontSize: 12 };
    const nombre = 'Puntaje total de la Escala de Procrastinación Académica (EPA)';
    // cabe: igual
    let x = texto(250);
    g._nombreDelEjeACaber(x.t, nombre, 280);
    assert.deepEqual([x.r.attrs, x.r.texto, x.r.titulo], [{}, '', null]);
    // un poco largo: más pequeño (12 · 280 / 330 → 10), entero
    x = texto(330);
    g._nombreDelEjeACaber(x.t, nombre, 280);
    assert.deepEqual([x.r.attrs['font-size'], x.r.texto, x.r.titulo], [10, '', null]);
    // muy largo: a 9, y cortado con «…», entero en su <title>
    x = texto(560);
    g._nombreDelEjeACaber(x.t, nombre, 280);
    assert.equal(x.r.attrs['font-size'], 9);
    assert.ok(x.r.texto.endsWith('…') && nombre.startsWith(x.r.texto.slice(0, -1)) && x.r.texto.length < nombre.length, x.r.texto);
    assert.equal(x.r.titulo, nombre);
    assert.equal(g._nombresEstimados, undefined, 'medido: no hay que rehacerlo');
    // sin medidas (oculto): lo estima, y lo deja anotado para cuando se vea
    x = texto(0);
    g._nombreDelEjeACaber(x.t, nombre, 280);
    assert.deepEqual([g._nombresEstimados, x.r.attrs['data-nombre'], x.r.attrs['data-maximo']], [true, nombre, 280]);
    // cuando se vea: otra vez, entero y medido (aquí, en el DOM mínimo, mide 50: cabe)
    const env = crearEntorno('<html><body></body></html>');
    env.document.body.innerHTML = `<svg><g class="chart-content"><text class="nombre-eje-y" font-size="9" data-nombre="${nombre}" data-maximo="280">Puntaje total…<title>${nombre}</title></text></g></svg>`;
    const nodo = /** @type {any} */ (env.document.querySelector('text'));
    g.svg = { selectAll: (/** @type {string} */ s) => ({ nodes: () => [...env.document.querySelectorAll(s)] }) };
    g._rehacerNombresDeEjes();
    assert.deepEqual([nodo.textContent, nodo.getAttribute('font-size'), nodo.getAttribute('data-nombre'), nodo.querySelectorAll('title').length, g._nombresEstimados], [nombre, '12', null, 0, false]);
});

test('(2027.01.12, revisión) el nombre del eje Y, a la izquierda de los valores de su eje (los de 7 cifras se montaban con él); los demás ejes no cuentan', async () => {
    const SC = await metodos();
    /**
     * Un eje de mentira: sus marcas (su transform), lo que mide y dónde está.
     * @param {string[]} marcas @param {number} x lo que empieza a la izquierda de su origen @param {number} [e] su traslado en x
     */
    const eje = (marcas, x, e = 0) => ({
        children: marcas.map(t => ({ classList: { contains: (/** @type {string} */ c) => c === 'tick' }, getAttribute: () => t })),
        getBBox: () => ({ x, y: 0, width: -x + 6, height: 300 }),
        transform: { baseVal: e ? { numberOfItems: 1, consolidate: () => ({ matrix: { e } }) } : { numberOfItems: 0 } },
    });
    /** El nombre del eje Y tras _apartarNombreDelEjeY, con estos ejes. @param {any[]} ejes */
    const yDelNombre = ejes => {
        const attrs = /** @type {Record<string, unknown>} */ ({ 'font-size': '12', y: -60 });
        const g = Object.create(SC);
        g.config = { fontSize: 12, margin: { left: 60 } };
        g.svg = {
            select: () => ({ empty: () => false, attr(/** @type {string} */ k, /** @type {unknown} */ v) { if (v === undefined) return attrs[k]; attrs[k] = v; return this; } }),
            selectAll: () => ({ nodes: () => ejes }),
        };
        g._apartarNombreDelEjeY();
        return attrs.y;
    };
    const izquierdo = ['translate(0,300)', 'translate(0,150)', 'translate(0,0)'];
    assert.equal(yDelNombre([eje(izquierdo, -58)]), -77, 'valores de 7 cifras (58 de ancho): a su izquierda, con 4 de aire');
    assert.equal(yDelNombre([eje(izquierdo, -30)]), -60, 'valores cortos: donde iba (el margen)');
    assert.equal(yDelNombre([eje(['translate(37,0)', 'translate(120,0)'], -90), eje(izquierdo, -30)]), -60, 'el eje X no cuenta');
    assert.equal(yDelNombre([eje(izquierdo, -90, 460), eje(izquierdo, -30)]), -60, 'un eje a la derecha (trasladado a su ancho) no cuenta');
});

test('(2027.01.12, revisión) un título partido sin medidas (oculto), otra vez cuando se vea: como si se hubiera dibujado a la vista', async () => {
    const SC = await metodos();
    const largo = 'Distribución: Puntaje total de la Escala de Procrastinación (EPA)';
    /** El título de mentira: lo que mide (0: oculto) y lo que queda. @param {{ mide: number }} medida */
    const titulo = medida => {
        /** @type {{ texto: string | null, lineas: string[] }} */
        const r = { texto: null, lineas: [] };
        const t = {
            empty: () => false,
            node: () => ({ getComputedTextLength: () => medida.mide }),
            attr: (/** @type {string} */ k) => (k === 'x' ? 320 : null),
            text(/** @type {string | null} */ v) { if (v === undefined) return r.texto; r.texto = v; if (v !== null) r.lineas = []; return this; },
            append() { const l = { texto: '' }; r.lineas.push(l.texto); const i = r.lineas.length - 1; return { attr() { return this; }, text(/** @type {string} */ v) { r.lineas[i] = v; return this; } }; },
        };
        return { t, r };
    };
    const g = Object.create(SC);
    g.config = { width: 640, titleFontSize: 16 };
    const medida = { mide: 0 }, x = titulo(medida);
    g.svg = { select: () => x.t, attr: (/** @type {string} */ k) => (k === 'aria-label' ? largo : null) };
    // oculto: lo estima (66 letras · 16 · 0,55 = 581: cabe en 624) y queda en una línea, anotado para cuando se vea
    x.t.text(largo);
    g._partirTitulo(x.t, largo);
    assert.deepEqual([x.r.texto, x.r.lineas.length, g._tituloEstimado], [largo, 0, true]);
    // a la vista mide 660: en dos líneas, como si se hubiera dibujado a la vista
    medida.mide = 660;
    g._rehacerTitulo();
    assert.deepEqual([x.r.texto, x.r.lineas.length, g._tituloEstimado], [null, 2, false]);
    assert.equal(x.r.lineas.join(' '), largo);
});

test('(2027.01.11, revisión) un título más ancho que el gráfico, en dos líneas: tras « vs » si así caben, o por el espacio que mejor las iguala', async () => {
    const SC = /** @type {any} */ ((await import('../../src/analizador/graficas.js')).ScientificCharts.prototype);
    /** El título (d3) de mentira: lo que mide y lo que queda. @param {number} mide */
    const titulo = mide => {
        /** @type {{ texto: string | null, lineas: Array<Record<string, unknown>> }} */
        const r = { texto: 'sin tocar', lineas: [] };
        const t = {
            node: () => ({ getComputedTextLength: () => mide }),
            attr: (/** @type {string} */ k) => (k === 'x' ? 260 : null),
            text(/** @type {string | null} */ v) { r.texto = v; return this; },
            append() { const l = /** @type {Record<string, unknown>} */ ({}); r.lineas.push(l); return { attr(/** @type {string} */ k, /** @type {unknown} */ v) { l[k] = v; return this; }, text(/** @type {string} */ v) { l.texto = v; return this; } }; },
        };
        return { t, r };
    };
    const g = Object.create(SC);
    g.config = { width: 520, titleFontSize: 16 };
    const largo = 'Procrastinación académica vs Promedio ponderado (sociodemográfica continua, 0–20)';
    let x = titulo(664);
    g._partirTitulo(x.t, largo);
    assert.deepEqual(x.r.lineas, [{ x: 260, dy: -19, texto: 'Procrastinación académica vs' }, { x: 260, dy: 19, texto: 'Promedio ponderado (sociodemográfica continua, 0–20)' }], 'la segunda, donde iba el título; la primera, encima');
    assert.equal(x.r.texto, null);
    // oculto (no se puede medir): lo estima por sus letras
    x = titulo(0);
    g._partirTitulo(x.t, largo);
    assert.equal(x.r.lineas.length, 2);
    // sin « vs », o con una segunda parte que no cabría: por el espacio que mejor las iguala
    x = titulo(700);
    g._partirTitulo(x.t, 'Distribución de la procrastinación académica en estudiantes universitarios de Lima');
    assert.deepEqual(x.r.lineas.map(l => l.texto), ['Distribución de la procrastinación académica', 'en estudiantes universitarios de Lima']);
    x = titulo(900);
    g._partirTitulo(x.t, 'Edad vs Una variable con un nombre larguísimo que no cabría entera en una línea del gráfico');
    assert.deepEqual(x.r.lineas.map(l => l.texto), ['Edad vs Una variable con un nombre larguísimo', 'que no cabría entera en una línea del gráfico']);
    // uno que cabe, o sin espacios, igual
    for (const [mide, t] of /** @type {Array<[number, string]>} */ ([[480, largo], [700, 'Unasolapalabralarguísima']])) {
        x = titulo(mide);
        g._partirTitulo(x.t, t);
        assert.deepEqual([x.r.texto, x.r.lineas.length], ['sin tocar', 0]);
    }
});
