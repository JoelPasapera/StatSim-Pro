// @ts-check
// tests/navegador/graficos-en-papel.mjs — (2027.01.10, revisión) Los gráficos del Analizador en la pantalla, en papel y en el
// Word, en Chromium, con los casos de ejemplos/ que los tienen (el 1, el 3 y el 5), repetidos con «Hazlo todo por mí»:
// - cada gráfico cabe en su lienzo (viewBox), en la pantalla y al imprimir: nada de lo que dibuja (el título, las etiquetas en
//   diagonal, una leyenda) queda fuera. Hasta la 2027.01.09 el título y las etiquetas del diagrama de caja, la leyenda de las
//   curvas normales y el título largo de una dispersión se salían, y al imprimir salían cortados;
// - su título, en el centro de su lienzo; (2027.01.11, revisión) también con el lienzo ampliado por un solo lado;
// - (2027.01.11, revisión) su tamaño en la pantalla, con la proporción de su lienzo (en la 2027.01.10 la caja por grupos y la
//   matriz quedaban con otra), y la dispersión a su tamaño (o al de su caja): en la 2027.01.10, con un título largo, se
//   achicaba a la cuarta parte de su área;
// - al imprimir, cada gráfico con tinta (no en blanco), ningún texto claro y (2027.01.11, revisión) ninguno con menos de 3:1 de
//   contraste con lo que tiene detrás: en la 2027.01.10 el recuadro de la dispersión (r o ρ, p, n, IC) quedaba en tinta sobre
//   su caja oscura (1,07:1), y la prueba solo buscaba los textos claros;
// - las figuras del Word (exportador-word.js, con graficoEnPapel): lo mismo, y (2027.01.11, revisión) con la proporción de su
//   lienzo (hasta la 2027.01.10, siempre de 520 × 380: estiradas);
// - la cruz que sigue al ratón, bajo el puntero, con un diagrama de caja de una etiqueta larga, que amplía su lienzo por la
//   izquierda (con su título, también, en el centro), y (2027.01.11) con un tamaño en la pantalla de otra proporción que su
//   lienzo (en la 2027.01.10, en la caja por grupos, a 35–42 px del puntero);
// - (2027.01.11) la dispersión, con sus ejes y sus valores (hasta la 2027.01.10, solo su rejilla);
// - (2027.01.11, revisión) y en el caso 3, el análisis rehecho con otra pestaña a la vista mientras se dibuja: al volver, cada
//   gráfico cabe en su lienzo (en la 2027.01.10, uno dibujado oculto quedaba cortado);
// - (2027.01.12, revisión) el marco de cada gráfico no crece con él (en la 2027.01.11, el de la dispersión: el gráfico no podía
//   crecer del ancho con que se dibujó primero); ningún texto se monta con otro ni queda tapado por lo que se pinta encima (en
//   la 2027.01.11, en el diagrama de rutas del SEM, la elipse de la mediadora tapaba el coeficiente del efecto directo); al
//   imprimir, la tinta, la del dibujo de cada gráfico, sin sus textos ni sus ejes (la del gráfico entero la daba el título solo);
//   la figura del diagrama de rutas del Word (caso 5), a lo ancho de la página, con su proporción, sus textos de 8 puntos o
//   más y con tinta (en la 2027.01.11, de 450 × 63, con textos de unos 3 puntos); y en el caso 3, mientras el Analizador está
//   oculto, los gráficos no trabajan en cada cuadro (en la 2027.01.11, unas 240 veces por segundo).
// - (2027.01.13, revisión) la tinta del dibujo, la de sus marcas de datos solas (en la 2027.01.12, un histograma sin barras o
//   una dispersión sin puntos pasaban con su curva o su recta); impresas y en las figuras del Word, sus líneas de datos a 3:1 o
//   más del papel (las series de colores claros pasaban); un texto tapado, en seis puntos de él (no solo en su centro); y la
//   figura del diagrama de rutas, a lo ancho de la página o a lo alto de ella, sin pasar de ninguno.
// - (2027.01.14, revisión) las marcas de datos, a la vista también en el gráfico como sale (un rectángulo blanco pintado sobre el
//   histograma pasaba: se medían solas); un texto tapado, también en su primera o su última letra o en una banda (se miraban seis
//   puntos, lejos de sus bordes); y un diagrama de rutas más alto que ancho: su figura del Word, a lo alto de la página, y en lo
//   impreso, de 245 mm como mucho (ninguna prueba lo veía: el del caso 5 es más ancho que alto).
// Con datos y nombres extremos, en marcos como los de la página, lo comprueba tests/navegador/graficos-extremos.mjs.
//
//     node tests/navegador/graficos-en-papel.mjs [caso…]
//
// Necesita Playwright con Chromium (como tests/navegador/ejemplos.mjs); sin él, dice cómo y termina sin error.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirPagina, prepararChromium } from './entorno.mjs';
import { GRAFICOS_EN_LA_PAGINA, conTinta, contrastesEnPapel, graficosSinTinta, lineasClaras, medirLienzos, textosMontados, textosTapados, TINTA_MINIMA, CONTRASTE_DE_LAS_LINEAS } from './graficos-medidas.mjs';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/** Los casos con gráficos en su último análisis (el 2 acaba en una asociación, y el 4 los tiene como el 1). */
const CASOS = ['01-correlacional', '03-predictivo', '05-estructural'];
/** El caso en que se rehace el análisis con otra pestaña a la vista (el de la dispersión con un título largo). */
const CASO_OCULTO = '03-predictivo';
/** (2027.01.12, revisión) Los casos con un modelo de ecuaciones estructurales (con su diagrama de rutas). */
const CASOS_CON_SEM = ['05-estructural'];
/** Las figuras que lleva el capítulo de Word (exportador-word.js). */
const FIGURAS_DEL_WORD = ['histVariable1', 'qqVariable1', 'histVariable2', 'qqVariable2', 'graficoDispersion'];
/** El contraste mínimo de un texto con lo que tiene detrás, en papel (el de WCAG para textos grandes y gráficos). */
const CONTRASTE_MINIMO = 3;
/**
 * (2027.01.12, revisión) La figura del diagrama de rutas del SEM en el Word: a lo ancho de la página y (2027.01.13, revisión)
 * sin pasar de su alto (un diagrama en columna puede ser más alto que ancho); y el tamaño mínimo de sus textos allí.
 */
const ANCHO_FIGURA_SEM = 600;
const ALTO_FIGURA_SEM = 680;
/** (2027.01.14, revisión) El alto del diagrama de rutas impreso, como mucho (en milímetros: el de impresion.css). */
const ALTO_IMPRESO_SEM = 245;
const PUNTOS_MINIMOS = 8;
/** (2027.01.12, revisión) Las llamadas por segundo a _ajustarTamanoCSS que se toleran con el Analizador oculto (la 2027.01.11, unas 240). */
const LLAMADAS_OCULTO = 5;
/** @type {string[]} */
const fallos = [];
let hechas = 0;
/** Lo comprobado: ✓ o ✗ y por qué. @param {boolean} ok @param {string} que */
function comprobar(ok, que) {
    hechas++;
    console.log(`${ok ? '✓' : '✗'} ${que}`);
    if (!ok) fallos.push(que);
}

/**
 * (2027.01.10, revisión) La cruz que sigue al ratón, con el lienzo ampliado por la izquierda: un diagrama de caja con una
 * etiqueta larga (que se sale por ahí, y _lienzoAlContenido mueve el origen del lienzo), dibujado aparte en el Analizador; el
 * puntero, en el centro de su área de datos, y la cruz, bajo él. (2027.01.11) Y su título, en el centro del lienzo ampliado.
 * @param {any} pagina
 * @param {string} carpeta
 */
async function cajaConEtiquetaLarga(pagina, carpeta) {
    const origen = await pagina.evaluate(async () => {
        const { ScientificCharts } = await import('./src/analizador/graficas.js');
        const div = document.createElement('div');
        div.id = 'cajaConEtiquetaLarga';
        div.style.width = '900px';
        /** @type {HTMLElement} */ (document.getElementById('analizador')).appendChild(div);
        const a = Array.from({ length: 40 }, (_, i) => 10 + ((i * 7) % 23)), b = Array.from({ length: 40 }, (_, i) => 15 + ((i * 5) % 19));
        new ScientificCharts('cajaConEtiquetaLarga', { width: 900, height: 460, primaryColor: '#2E5BBA' })
            .createBoxPlot([a, b], ['Una variable con un nombre muy largo, que se sale por la izquierda', 'Otra'], { title: '' });
        return /** @type {SVGSVGElement} */ (div.querySelector('svg')).viewBox.baseVal.x;
    });
    await pagina.locator('#cajaConEtiquetaLarga svg').scrollIntoViewIfNeeded();
    const { apartados } = await medirLienzos(pagina, '#cajaConEtiquetaLarga');
    /** Dónde queda la cruz respecto del puntero, en el centro del área de datos (o null si no se ve). */
    const cruzEnElCentro = async () => {
        const centro = await pagina.evaluate(() => {
            const s = /** @type {SVGSVGElement} */ (document.querySelector('#cajaConEtiquetaLarga svg')), capa = /** @type {SVGGElement} */ (s.querySelector('.crosshair-capa'));
            const W = Number(capa.querySelector('.ch-h')?.getAttribute('x2')), H = Number(capa.querySelector('.ch-v')?.getAttribute('y2'));
            const p = s.createSVGPoint();
            p.x = W / 2;
            p.y = H / 2;
            const q = p.matrixTransform(/** @type {DOMMatrix} */ (/** @type {SVGGElement} */ (capa.parentNode).getScreenCTM()));
            return { x: q.x, y: q.y };
        });
        await pagina.mouse.move(centro.x, centro.y);
        const cruz = await pagina.evaluate((/** @type {{ x: number, y: number }} */ c) => {
            const s = /** @type {SVGSVGElement} */ (document.querySelector('#cajaConEtiquetaLarga svg')), capa = /** @type {SVGGElement} */ (s.querySelector('.crosshair-capa'));
            if (getComputedStyle(capa).display === 'none') return null;
            const v = /** @type {SVGLineElement} */ (capa.querySelector('.ch-v')), h = /** @type {SVGLineElement} */ (capa.querySelector('.ch-h'));
            const p = s.createSVGPoint();
            p.x = Number(v.getAttribute('x1'));
            p.y = Number(h.getAttribute('y1'));
            const q = p.matrixTransform(/** @type {DOMMatrix} */ (capa.getScreenCTM()));
            return { dx: q.x - c.x, dy: q.y - c.y };
        }, centro);
        await pagina.mouse.move(0, 0);
        return cruz;
    };
    const bajo = (/** @type {{ dx: number, dy: number } | null} */ c) => !!c && Math.abs(c.dx) < 1.5 && Math.abs(c.dy) < 1.5;
    const enPx = (/** @type {{ dx: number, dy: number } | null} */ c) => (c ? `la cruz, a ${c.dx.toFixed(1)} y ${c.dy.toFixed(1)} px` : 'la cruz no se ve');
    const cruz = await cruzEnElCentro();
    comprobar(origen < 0 && bajo(cruz), `${carpeta}: la cruz del ratón, bajo el puntero, con el lienzo ampliado por la izquierda (su origen, en ${origen.toFixed(0)}; ${enPx(cruz)})`);
    comprobar(!apartados.length, `${carpeta}: y su título, en el centro del lienzo ampliado${apartados.length ? ` (se aparta: ${apartados.join('; ')})` : ''}`);
    // (2027.01.11, revisión) y con un tamaño en la pantalla de otra proporción que su lienzo (lo dibuja centrado, con margen)
    await pagina.evaluate(() => { const s = /** @type {SVGSVGElement} */ (document.querySelector('#cajaConEtiquetaLarga svg')); s.style.width = '900px'; s.style.height = '260px'; });
    await pagina.locator('#cajaConEtiquetaLarga svg').scrollIntoViewIfNeeded();
    const conMargen = await cruzEnElCentro();
    comprobar(bajo(conMargen), `${carpeta}: la cruz del ratón, bajo el puntero, con un tamaño en la pantalla de otra proporción que el lienzo (${enPx(conMargen)})`);
    await pagina.evaluate(() => document.getElementById('cajaConEtiquetaLarga')?.remove());
}

/**
 * (2027.01.11, revisión) El análisis rehecho con otra pestaña a la vista mientras se dibuja (la página analiza 300 ms después del
 * clic): al volver, cada gráfico cabe en su lienzo, con el título en el centro. En la 2027.01.10 quedaban cortados.
 * @param {any} pagina
 * @param {string} carpeta
 */
async function dibujadoOculto(pagina, carpeta) {
    await pagina.evaluate(async () => {
        // (2027.01.12, revisión) las llamadas a _ajustarTamanoCSS, contadas
        const { ScientificCharts } = await import('./src/analizador/graficas.js');
        const P = /** @type {any} */ (ScientificCharts.prototype), w = /** @type {any} */ (window);
        if (!w.__ajustes) {
            w.__ajustes = 0;
            const original = P._ajustarTamanoCSS;
            P._ajustarTamanoCSS = function (/** @type {any[]} */ ...a) { w.__ajustes++; return original.apply(this, a); };
        }
        document.querySelectorAll('#analizador svg[viewBox]').forEach(s => s.setAttribute('data-de-antes', ''));
        /** @type {HTMLElement} */ (document.getElementById('btnAnalizar')).click();
        location.hash = '#simulador';
    });
    await pagina.waitForFunction(() => document.getElementById('simulador')?.classList.contains('active'));
    // dibujados otra vez (los nuevos no llevan la marca) y quietos un momento
    await pagina.waitForFunction(() => {
        const s = document.querySelector('#graficoDispersion svg[viewBox]');
        return !!s && !s.hasAttribute('data-de-antes') && !document.querySelector('#distribucion-gaussiana svg[data-de-antes]');
    }, null, { timeout: 120000, polling: 100 });
    await pagina.waitForTimeout(500);
    const oculto = await pagina.evaluate(() => !(/** @type {HTMLElement} */ (document.getElementById('analizador')).getClientRects().length));
    // (2027.01.12, revisión) y mientras sigue oculto, un segundo: los gráficos no trabajan en cada cuadro
    const antes = await pagina.evaluate(() => /** @type {any} */ (window).__ajustes);
    await pagina.waitForTimeout(1000);
    const porSegundo = (await pagina.evaluate(() => /** @type {any} */ (window).__ajustes)) - antes;
    comprobar(oculto && porSegundo < LLAMADAS_OCULTO, `${carpeta}: con el Analizador oculto, los gráficos no trabajan en cada cuadro (${porSegundo} llamadas en un segundo a _ajustarTamanoCSS)${oculto ? '' : ' (el Analizador no llegó a ocultarse: no se comprobó)'}`);
    await pagina.evaluate(() => { location.hash = '#analizador'; });
    await pagina.waitForFunction(() => document.getElementById('analizador')?.classList.contains('active'));
    await pagina.waitForTimeout(300);
    const { fuera, apartados, proporcion } = await medirLienzos(pagina);
    comprobar(oculto && !fuera.length && !apartados.length && !proporcion.length,
        `${carpeta}: el análisis rehecho con otra pestaña a la vista: al volver, cada gráfico cabe en su lienzo, con su título en el centro y su proporción${oculto ? '' : ' (el Analizador no llegó a ocultarse: no se comprobó)'}${fuera.length ? ` (se salen: ${fuera.join('; ')})` : ''}${apartados.length ? ` (títulos apartados: ${apartados.join('; ')})` : ''}${proporcion.length ? ` (otra proporción: ${proporcion.join('; ')})` : ''}`);
}

/**
 * (2027.01.12, revisión) La figura del diagrama de rutas del SEM en el Word (la imagen que guarda sem-ui.js): a lo ancho de la
 * página (ANCHO_FIGURA_SEM), con la proporción del diagrama, sus textos de PUNTOS_MINIMOS o más allí y con tinta. En la
 * 2027.01.11 salía de 450 × 63, con textos de unos 3 puntos. En los casos con un modelo de ecuaciones estructurales.
 * @param {any} pagina
 * @param {string} carpeta
 */
async function figuraDelSEM(pagina, carpeta) {
    if (!CASOS_CON_SEM.includes(carpeta)) return;
    const sem = await pagina.evaluate(async () => {
        const svg = /** @type {SVGSVGElement | null} */ (document.querySelector('#semOut svg[viewBox]'));
        if (!svg) return null;
        const { SEM } = await import('./src/analizador/sem-motor.js');
        const S = /** @type {any} */ (SEM);
        for (let i = 0; i < 100 && !S._ultimoDiagramaPNG; i++) await new Promise(r => setTimeout(r, 100));
        const png = S._ultimoDiagramaPNG, vb = svg.viewBox.baseVal;
        const letra = Math.min(...[...svg.querySelectorAll('text')].map(t => Number(t.getAttribute('font-size')) || 16));
        return { png: png ? String(png.url).split(',')[1] : '', w: png ? png.w : 0, h: png ? png.h : 0, ancho: vb.width, alto: vb.height, letra };
    });
    if (!sem) { comprobar(false, `${carpeta}: el diagrama de rutas del SEM no está en la página`); return; }
    const proporcion = Math.abs(sem.h - sem.w * sem.alto / sem.ancho) <= 1;
    const llena = (sem.w === ANCHO_FIGURA_SEM && sem.h <= ALTO_FIGURA_SEM) || (sem.h === ALTO_FIGURA_SEM && sem.w <= ANCHO_FIGURA_SEM);
    comprobar(llena && proporcion, `${carpeta}: la figura del diagrama de rutas del Word, de ${sem.w} × ${sem.h} (a lo ancho de la página, ${ANCHO_FIGURA_SEM}, o a lo alto, ${ALTO_FIGURA_SEM}, sin pasar de ninguno, y con la proporción del diagrama, ${sem.ancho} × ${sem.alto})`);
    const puntos = sem.letra * (sem.w / sem.ancho) * 72 / 96;
    comprobar(puntos >= PUNTOS_MINIMOS, `${carpeta}: en ella, los textos del diagrama, de ${puntos.toFixed(1)} puntos (${PUNTOS_MINIMOS} o más)`);
    const tinta = sem.png ? await conTinta(pagina, sem.png) : 0;
    comprobar(tinta >= TINTA_MINIMA, `${carpeta}: y con tinta (${(100 * tinta).toFixed(2)} %)`);
}

/**
 * (2027.01.14, revisión) Un diagrama de rutas más alto que ancho (tres latentes de 15 indicadores, en columna): su figura del
 * Word, a lo alto de la página (ALTO_FIGURA_SEM) y con su proporción, y en lo impreso, de ALTO_IMPRESO_SEM como mucho. Ninguna
 * prueba lo veía: la del caso 5 es más ancha que alta (cualquier figura de 600 de ancho la pasaba). Dibujado aparte, en la
 * tarjeta del SEM del caso.
 * @param {any} pagina
 * @param {string} carpeta
 */
async function diagramaAlto(pagina, carpeta) {
    if (!CASOS_CON_SEM.includes(carpeta)) return;
    const sem = await pagina.evaluate(async () => {
        const D = await import('./src/analizador/sem-diagrama.js');
        const { SEM } = await import('./src/analizador/sem-motor.js');
        const { SEMUI } = await import('./src/analizador/sem-ui.js');
        const S = /** @type {any} */ (SEM), U = /** @type {any} */ (SEMUI);
        /** @type {Record<string, string[]>} */
        const latentes = Object.fromEntries(['F1', 'F2', 'F3'].map(F => [F, Array.from({ length: 15 }, (_, i) => `${F}_${i + 1}`)]));
        /** @type {any[]} */
        const rutas = Object.entries(latentes).flatMap(([F, is]) => is.map((a, i) => ({ de: F, a, tipo: 'carga', texto: (0.6 + (i % 4) / 20).toFixed(2) })));
        rutas.push({ de: 'F1', a: 'F2', tipo: 'regresion', texto: '0.40' }, { de: 'F2', a: 'F3', tipo: 'regresion', texto: '0.35' });
        const disp = D.disposicionDelDiagrama({ latentes: Object.keys(latentes), indicadoresDe: latentes, observadas: Object.values(latentes).flat(), rutas });
        const svg = D.svgDelDiagrama(disp), antes = S._ultimoDiagramaPNG;
        S._ultimoDiagramaPNG = null;
        U._rasterizar(svg);
        for (let i = 0; i < 100 && !S._ultimoDiagramaPNG; i++) await new Promise(r => setTimeout(r, 100));
        const png = S._ultimoDiagramaPNG;
        S._ultimoDiagramaPNG = antes;
        const caja = document.createElement('div');
        caja.id = 'semAltoDePrueba';
        caja.innerHTML = svg;
        /** @type {HTMLElement} */ (document.getElementById('semOut')).appendChild(caja);
        return { w: png ? png.w : 0, h: png ? png.h : 0, ancho: disp.ancho, alto: disp.alto };
    });
    const proporcion = Math.abs(sem.w - sem.h * sem.ancho / sem.alto) <= 1;
    comprobar(sem.alto > 1.4 * sem.ancho && sem.h === ALTO_FIGURA_SEM && sem.w < ANCHO_FIGURA_SEM && proporcion,
        `${carpeta}: la figura del diagrama de rutas del Word, con uno más alto que ancho (${sem.ancho} × ${sem.alto}): de ${sem.w} × ${sem.h} (a lo alto de la página, ${ALTO_FIGURA_SEM}, con su proporción)`);
    await pagina.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await pagina.emulateMedia({ media: 'print' });
    try {
        const mm = await pagina.evaluate(() => { const s = document.querySelector('#semAltoDePrueba svg'); return s ? s.getBoundingClientRect().height * 25.4 / 96 : 0; });
        comprobar(mm > 100 && mm <= ALTO_IMPRESO_SEM + 0.5, `${carpeta}: y en lo impreso, de ${mm.toFixed(0)} mm de alto (${ALTO_IMPRESO_SEM} como mucho)`);
    } finally {
        await pagina.emulateMedia({ media: 'screen' });
        await pagina.evaluate(() => { window.dispatchEvent(new Event('afterprint')); document.getElementById('semAltoDePrueba')?.remove(); });
    }
}

/**
 * Un caso, repetido con «Hazlo todo por mí», y sus gráficos en la pantalla, impresos y en las figuras del Word.
 * @param {string} carpeta
 */
async function revisarCaso(carpeta) {
    const { pagina, errores, cerrar } = await abrirPagina({ raiz });
    try {
        await pagina.click('#heroPortada a[data-ir-a="ejemplos"]');
        await pagina.click(`.ejemplo-tarjeta [data-accion-ejemplo="abrir"][data-carpeta="${carpeta}"]`);
        await pagina.waitForSelector('#guiaEjemplo', { timeout: 60000 });
        await pagina.evaluate(() => import('./src/ejemplos/hazlo/conductor.js').then(m => { Object.assign(m.RITMO, { hacer: 0, mostrar: 0 }); }));
        if (await pagina.evaluate(() => document.getElementById('guiaEjemplo')?.classList.contains('plegada'))) await pagina.click('#guiaEjemplo [data-accion-guia="plegar"]');
        await pagina.click('#guiaEjemplo [data-accion-guia="hacerTodo"]');
        await pagina.waitForFunction(() => { const d = /** @type {HTMLElement | null} */ (document.querySelector('#guiaEjemplo [data-accion-guia="detener"]')); return !!d && d.hidden; }, null, { timeout: 40 * 60000, polling: 250 });
        await pagina.evaluate(() => { location.hash = '#analizador'; });
        await pagina.waitForFunction(() => document.getElementById('analizador')?.classList.contains('active'));
        await pagina.waitForTimeout(300);
        // en la pantalla
        const graficos = await pagina.evaluate((/** @type {string} */ g) => (0, eval)(g)('#analizador').length, GRAFICOS_EN_LA_PAGINA);
        comprobar(graficos >= 5, `${carpeta}: ${graficos} gráficos a la vista`);
        const pantalla = await medirLienzos(pagina);
        comprobar(!pantalla.fuera.length, `${carpeta}: en la pantalla, cada gráfico cabe en su lienzo${pantalla.fuera.length ? ` (se salen: ${pantalla.fuera.join('; ')})` : ''}`);
        comprobar(!pantalla.apartados.length, `${carpeta}: el título de cada gráfico, en el centro de su lienzo${pantalla.apartados.length ? ` (se apartan: ${pantalla.apartados.join('; ')})` : ''}`);
        comprobar(!pantalla.proporcion.length, `${carpeta}: cada gráfico, en la pantalla con la proporción de su lienzo${pantalla.proporcion.length ? ` (otra: ${pantalla.proporcion.join('; ')})` : ''}`);
        comprobar(!pantalla.dispersion, `${carpeta}: la dispersión, a su tamaño o al de su caja${pantalla.dispersion ? ` (${pantalla.dispersion})` : ''}`);
        comprobar(!pantalla.envueltos.length, `${carpeta}: el marco de cada gráfico, con su ancho (no crece con el gráfico)${pantalla.envueltos.length ? ` (crecen: ${pantalla.envueltos.join('; ')})` : ''}`);
        const montados = await textosMontados(pagina, '#analizador'), tapados = await textosTapados(pagina, '#analizador');
        comprobar(!montados.length, `${carpeta}: en cada gráfico, ningún texto se monta con otro${montados.length ? ` (${montados.join(' | ')})` : ''}`);
        comprobar(!tapados.length, `${carpeta}: en cada gráfico, ningún texto queda tapado por lo que se pinta encima${tapados.length ? ` (${tapados.join(' | ')})` : ''}`);
        const ejes = await pagina.evaluate(() => ['.eje-x', '.eje-y'].map(e => [...document.querySelectorAll(`#graficoDispersion ${e} .tick text`)].filter(t => (t.textContent || '').trim()).length));
        comprobar(ejes.every(n => n >= 3), `${carpeta}: la dispersión, con sus ejes y sus valores (${ejes[0]} en el horizontal y ${ejes[1]} en el vertical)`);
        // al imprimir
        await pagina.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
        await pagina.emulateMedia({ media: 'print' });
        try {
            const impresos = await medirLienzos(pagina), { bajos, claros } = await contrastesEnPapel(pagina, '#analizador', CONTRASTE_MINIMO);
            comprobar(!impresos.fuera.length, `${carpeta}: al imprimir, cada gráfico cabe en su lienzo${impresos.fuera.length ? ` (se salen: ${impresos.fuera.join('; ')})` : ''}`);
            comprobar(!claros.length, `${carpeta}: al imprimir, ningún texto de un gráfico sale claro${claros.length ? ` (claros: ${claros.join('; ')})` : ''}`);
            comprobar(!bajos.length, `${carpeta}: al imprimir, cada texto de un gráfico se lee sobre lo que tiene detrás (${CONTRASTE_MINIMO}:1 o más)${bajos.length ? ` (no: ${bajos.join('; ')})` : ''}`);
            // y cada uno con tinta: una captura de cómo sale su dibujo, sin sus textos ni sus ejes (un gráfico oculto, en blanco o
            // sin dibujo no la tendría; (2027.01.12, revisión) la del gráfico entero la daba el título solo; (2027.01.13,
            // revisión) la de sus marcas de datos, solas); y sus líneas de datos, oscuras
            const blancos = await graficosSinTinta(pagina, '#analizador'), claras = await lineasClaras(pagina, '#analizador');
            comprobar(!blancos.length, `${carpeta}: al imprimir, el dibujo de cada gráfico con tinta${blancos.length ? ` (en blanco: ${blancos.join('; ')})` : ''}`);
            comprobar(!claras.length, `${carpeta}: al imprimir, las líneas de datos de cada gráfico, a ${CONTRASTE_DE_LAS_LINEAS}:1 del papel o más${claras.length ? ` (claras: ${claras.join('; ')})` : ''}`);
        } finally {
            await pagina.emulateMedia({ media: 'screen' });
            await pagina.evaluate(() => window.dispatchEvent(new Event('afterprint')));
        }
        // las figuras del Word: lo que captura su exportador, con la proporción de su lienzo; en papel (ningún lienzo ni texto
        // claro, y cada texto, legible: la copia, sobre blanco en la página) y con tinta (su PNG)
        const figuras = await pagina.evaluate(async (/** @type {string[]} */ ids) => {
            const { ExportadorWord } = await import('./src/analizador/exportador-word.js');
            const { RELLENOS_CLAROS } = await import('./src/analizador/graficos-en-papel.js');
            /** @type {Array<{ id: string, claros: number, proporcion: string, png: string }>} */
            const out = [];
            for (const id of ids) {
                const cap = /** @type {any} */ (ExportadorWord)._capturarSVG(id);
                if (!cap) continue;
                const svg = new DOMParser().parseFromString(cap.svg, 'image/svg+xml').documentElement;
                const claros = [svg, ...svg.querySelectorAll('text, tspan')].filter(el => RELLENOS_CLAROS.includes((el.getAttribute('fill') || '').toLowerCase())).length;
                const vb = /** @type {SVGSVGElement} */ (/** @type {unknown} */ (svg)).viewBox.baseVal;
                const escrito = `${svg.getAttribute('width')} × ${svg.getAttribute('height')}`;
                const proporcion = Math.abs((cap.w / cap.h) / (vb.width / vb.height) - 1) > 0.01 || escrito !== `${cap.w} × ${cap.h}` ? `${cap.w} × ${cap.h} (escrito: ${escrito}) con un lienzo de ${vb.width} × ${vb.height}` : '';
                const png = await /** @type {any} */ (ExportadorWord)._rasterizar(cap.svg, cap.w, cap.h);
                const caja = document.createElement('div');
                caja.id = `papelWord-${id}`;
                caja.style.cssText = 'background:#fff;width:900px;';
                caja.innerHTML = cap.svg;
                /** @type {HTMLElement} */ (document.getElementById('analizador')).appendChild(caja);
                out.push({ id, claros, proporcion, png: png ? String(png.url).split(',')[1] : '' });
            }
            return out;
        }, FIGURAS_DEL_WORD);
        const { bajos } = await contrastesEnPapel(pagina, '[id^="papelWord-"]', CONTRASTE_MINIMO);
        // (2027.01.13, revisión) y sus marcas de datos, con tinta, y sus líneas de datos, oscuras
        const sinDibujo = await graficosSinTinta(pagina, '[id^="papelWord-"]'), lineasDelWord = await lineasClaras(pagina, '[id^="papelWord-"]');
        await pagina.evaluate(() => document.querySelectorAll('[id^="papelWord-"]').forEach(c => c.remove()));
        const claras = figuras.filter(f => f.claros).map(f => `#${f.id}: ${f.claros}`), deformes = figuras.filter(f => f.proporcion).map(f => `#${f.id}: ${f.proporcion}`);
        /** @type {string[]} */
        const sinTinta = [];
        for (const f of figuras) {
            const tinta = f.png ? await conTinta(pagina, f.png) : 0;
            if (tinta < TINTA_MINIMA) sinTinta.push(`#${f.id} (${(100 * tinta).toFixed(2)} %)`);
        }
        comprobar(figuras.length >= 3 && !claras.length, `${carpeta}: las ${figuras.length} figuras del Word, en papel (ningún texto ni lienzo claro)${claras.length ? `: ${claras.join('; ')}` : ''}`);
        comprobar(!bajos.length, `${carpeta}: en las figuras del Word, cada texto se lee sobre lo que tiene detrás (${CONTRASTE_MINIMO}:1 o más)${bajos.length ? ` (no: ${bajos.join('; ')})` : ''}`);
        comprobar(!deformes.length, `${carpeta}: las figuras del Word, con la proporción de su lienzo${deformes.length ? ` (otra: ${deformes.join('; ')})` : ''}`);
        comprobar(!sinTinta.length && !sinDibujo.length, `${carpeta}: las figuras del Word, con tinta y con el dibujo de sus datos${sinTinta.length || sinDibujo.length ? ` (en blanco: ${[...sinTinta, ...sinDibujo].join('; ')})` : ''}`);
        comprobar(!lineasDelWord.length, `${carpeta}: en las figuras del Word, las líneas de datos, a ${CONTRASTE_DE_LAS_LINEAS}:1 del papel o más${lineasDelWord.length ? ` (claras: ${lineasDelWord.join('; ')})` : ''}`);
        await figuraDelSEM(pagina, carpeta);
        await diagramaAlto(pagina, carpeta);
        await cajaConEtiquetaLarga(pagina, carpeta);
        if (carpeta === CASO_OCULTO) await dibujadoOculto(pagina, carpeta);
        comprobar(errores.length === 0, `${carpeta}: sin errores en la página${errores.length ? `: ${errores.slice(0, 3).join(' | ')}` : ''}`);
    } finally {
        await cerrar();
    }
}

async function principal() {
    const { pw, motivo } = await prepararChromium();
    if (!pw) { console.log(`Se omiten los gráficos en papel en el navegador: ${motivo}.`); return; }
    const catalogo = JSON.parse(fs.readFileSync(path.join(raiz, 'ejemplos', 'indice.json'), 'utf8'));
    const nombres = process.argv.slice(2);
    for (const n of nombres) if (!CASOS.includes(n)) { console.error(`«${n}» no es uno de los casos con gráficos (${CASOS.join(', ')})`); process.exit(2); }
    for (const carpeta of nombres.length ? nombres : CASOS) {
        if (!catalogo.casos.some((/** @type {any} */ e) => e.carpeta === carpeta)) { comprobar(false, `${carpeta}: no está en ejemplos/`); continue; }
        try { await revisarCaso(carpeta); } catch (err) { comprobar(false, `${carpeta}: ${err instanceof Error ? err.message.split('\n')[0] : err}`); }
    }
    if (!hechas) { console.error('No se comprobó nada.'); process.exit(2); }
    if (fallos.length) { console.log(`\n${fallos.length} fallo(s)`); process.exit(1); }
}

principal().catch(e => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
