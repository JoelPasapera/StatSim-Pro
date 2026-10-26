// @ts-check
// tests/navegador/graficos-extremos.mjs — (2027.01.12, revisión) Los gráficos del Analizador con datos y nombres extremos, en
// Chromium, dibujados aparte en marcos como los de la página (marcoDeGrafico, de ui/resultados.js, el de la dispersión y la
// caja por grupos; y las cards de la rejilla), a 1280 y a 360 de ancho:
// - ningún texto se monta con otro (valores del eje Y de 7 cifras, milésimas, nombres largos con un título en dos líneas) ni
//   queda tapado: en la 2027.01.11, el nombre del eje Y de la dispersión con sus valores de 7 cifras y con el título;
// - cada uno cabe en su lienzo, con su título en el centro, a su tamaño (o al de su caja) y con la proporción de su lienzo, y su
//   marco no crece con él: en la 2027.01.11, la dispersión con un título largo sin espacios no crecía del ancho con que se dibujó
//   primero (×0,80), y la caja por grupos, fuera de la rejilla, salía a 1,83 veces su tamaño;
// - dibujado oculto y mostrado después, igual que dibujado a la vista: su lienzo, su tamaño, las líneas de su título y los
//   nombres de sus ejes (en la 2027.01.11, un título de casi el ancho del gráfico quedaba en otro número de líneas);
// - oculto (o fuera de la página, como al vaciar los resultados), no trabaja: en la 2027.01.11, unas 240 llamadas por segundo a
//   _ajustarTamanoCSS, para siempre;
// - y en un teléfono, las cards de la rejilla (la matriz, el diagrama de caja), a todo su ancho: en la 2027.01.11, al 0,82, con
//   textos de unos 3 px;
// - (2027.01.13, revisión) los histogramas y los Q-Q de la correlación, dentro de su recuadro (panelDeNormalidad): a 360, con
//   320 de ancho fijo, se salían 40 de él;
// - (2027.01.14, revisión) la figura de la regresión bivariada, en un teléfono de 480 de ancho como poco (se veía de 242, con
//   textos de 4,2 px), y la tarjeta del SEM sin ensanchar la página (su tabla de parámetros la hacía de 515 a 360).
//
//     node tests/navegador/graficos-extremos.mjs
//
// Necesita Playwright con Chromium (como tests/navegador/ejemplos.mjs); sin él, dice cómo y termina sin error.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirPagina, prepararChromium } from './entorno.mjs';
import { medirLienzos, textosMontados, textosTapados } from './graficos-medidas.mjs';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/** Las llamadas por segundo a _ajustarTamanoCSS que se toleran con los gráficos ocultos o fuera de la página. */
const LLAMADAS_OCULTO = 5;
/** Donde se dibujan. */
const LUGAR = '#graficosExtremos';
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
 * Dibuja los gráficos extremos en el Analizador, cada uno en un marco como el de la página, dos veces: a la vista y oculto (su
 * marco, mostrado después: .extremo-oculto); y uno más, oculto y sacado de la página. Cuenta las llamadas a _ajustarTamanoCSS
 * de los gráficos que no se ven (window.__ajustesSinVerse). Devuelve sus ids.
 * @param {any} pagina
 * @returns {Promise<string[]>}
 */
const dibujarExtremos = pagina => pagina.evaluate(async (/** @type {string} */ lugarSel) => {
    const { ScientificCharts } = await import('./src/analizador/graficas.js');
    const { marcoDeGrafico } = await import('./src/analizador/ui/resultados.js');
    const w = /** @type {any} */ (window), P = /** @type {any} */ (ScientificCharts.prototype);
    if (w.__ajustesSinVerse === undefined) {
        w.__ajustesSinVerse = 0;
        const original = P._ajustarTamanoCSS;
        P._ajustarTamanoCSS = function (/** @type {any[]} */ ...a) { if (!this.container || !this.container.getClientRects().length) w.__ajustesSinVerse++; return original.apply(this, a); };
    }
    // datos deterministas: N valores entre a y b, con algo de ruido
    const N = 120;
    const serie = (/** @type {number} */ a, /** @type {number} */ b, /** @type {(i: number) => number} */ f) => Array.from({ length: N }, (_, i) => a + (b - a) * (((i * 37) % N) / N) + f(i));
    const anot = ['r = 0.512  (p < .001)', 'R² = 0.262   n = 120', 'IC 95% [0.370, 0.630]'];
    const edad = serie(10, 50, i => i % 7);
    /** @type {Array<{ id: string, ancho: number, alto: number, dibujar: (ch: any) => void }>} */
    const graficos = [
        { id: 'extDispMillones', ancho: 520, alto: 380, dibujar: ch => ch.createScatterPlotPro(edad, serie(1200000, 9800000, i => 1000 * (i % 9)), { title: 'Edad vs Ingreso familiar anual', xLabel: 'Edad', yLabel: 'Ingreso familiar anual', annotationLines: anot }) },
        { id: 'extDispMilesimas', ancho: 520, alto: 380, dibujar: ch => ch.createScatterPlotPro(edad, serie(-0.0031, 0.0029, i => 0.00001 * (i % 9)), { title: 'Edad vs Diferencia de tiempos', xLabel: 'Edad', yLabel: 'Diferencia de tiempos (s)', annotationLines: anot }) },
        {
            id: 'extDispLargas', ancho: 520, alto: 380, dibujar: ch => ch.createScatterPlotPro(edad, serie(5, 30, i => i % 5), {
                title: 'Puntaje total de la Escala de Adicción a las Redes Sociales (ARS-34) vs Puntaje total de la Escala de Procrastinación Académica (EPA)',
                xLabel: 'Puntaje total de la Escala de Adicción a las Redes Sociales (ARS-34)', yLabel: 'Puntaje total de la Escala de Procrastinación Académica (EPA)', annotationLines: anot,
            }),
        },
        { id: 'extDispSinEspacios', ancho: 520, alto: 380, dibujar: ch => ch.createScatterPlotPro(edad, serie(5, 30, i => i % 5), { title: 'Puntaje_total_escala_de_adiccion_a_las_redes_sociales_ARS34_version_adaptada vs Edad', xLabel: 'X', yLabel: 'Y', annotationLines: anot }) },
        { id: 'extHistLargo', ancho: 640, alto: 400, dibujar: ch => ch.createHistogramNormal(edad, { title: 'Distribución: Puntaje total de la Escala de Procrastinación Académica (EPA, 2026)', xLabel: 'Puntaje total de la Escala de Procrastinación Académica (EPA, 2026)' }) },
        { id: 'extQQLargo', ancho: 640, alto: 400, dibujar: ch => ch.createQQPlot(edad, { title: 'Q-Q: Puntaje total de la Escala de Adicción a las Redes Sociales — versión adaptada (ARS-34)' }) },
        {
            id: 'extCajaGrupos', ancho: 520, alto: 360, dibujar: ch => ch.createBoxPlot([serie(10, 30, i => i % 3), serie(12, 34, i => i % 4), serie(8, 28, i => i % 5), serie(15, 35, i => i % 2)],
                ['Primero de secundaria', 'Segundo de secundaria', 'Tercero de secundaria', 'Cuarto de secundaria'], { title: 'Distribución por grupo', yLabel: 'Valor' }),
        },
    ];
    const lugar = document.createElement('div');
    lugar.id = lugarSel.slice(1);
    /** @type {HTMLElement} */ (document.getElementById('analizador')).prepend(lugar);
    /** Un marco como el de la página (y, oculto, dentro de uno que no se ve). @param {string} id @param {boolean} oculto */
    const marco = (id, oculto) => {
        const div = document.createElement('div');
        if (oculto) { div.className = 'extremo-oculto'; div.style.display = 'none'; }
        div.innerHTML = marcoDeGrafico(id);
        lugar.appendChild(div);
        return div;
    };
    for (const g of graficos) {
        for (const [id, oculto] of /** @type {Array<[string, boolean]>} */ ([[g.id, false], [`${g.id}-oculto`, true]])) {
            marco(id, oculto);
            g.dibujar(new ScientificCharts(id, { width: g.ancho, height: g.alto, primaryColor: '#2E5BBA' }));
        }
    }
    // uno dibujado oculto y sacado de la página (como al vaciar los resultados con el Analizador oculto)
    const fuera = marco('extFuera', true);
    graficos[0].dibujar(new ScientificCharts('extFuera', { width: 520, height: 380, primaryColor: '#2E5BBA' }));
    fuera.remove();
    return graficos.map(g => g.id);
}, LUGAR);

/**
 * Las llamadas a _ajustarTamanoCSS de los gráficos que no se ven, en un segundo.
 * @param {any} pagina
 */
async function llamadasSinVerse(pagina) {
    const antes = await pagina.evaluate(() => /** @type {any} */ (window).__ajustesSinVerse);
    await pagina.waitForTimeout(1000);
    return (await pagina.evaluate(() => /** @type {any} */ (window).__ajustesSinVerse)) - antes;
}

/**
 * Lo que debe cumplir cada gráfico a la vista dentro de un selector: cabe en su lienzo, con su título en el centro y su
 * proporción, su marco no crece con él, va a su tamaño (o al de su caja: `aSuTamano`), y ningún texto se monta ni queda tapado.
 * @param {any} pagina
 * @param {string} raizSel
 * @param {string} donde
 * @param {boolean} aSuTamano
 */
async function revisarGraficos(pagina, raizSel, donde, aSuTamano) {
    const L = await medirLienzos(pagina, raizSel);
    comprobar(L.medidas.length > 0, `${donde}: ${L.medidas.length} gráficos a la vista`);
    comprobar(!L.fuera.length && !L.apartados.length && !L.proporcion.length, `${donde}: cada uno cabe en su lienzo, con su título en el centro y su proporción${L.fuera.length ? ` (se salen: ${L.fuera.join('; ')})` : ''}${L.apartados.length ? ` (títulos apartados: ${L.apartados.join('; ')})` : ''}${L.proporcion.length ? ` (otra proporción: ${L.proporcion.join('; ')})` : ''}`);
    comprobar(!L.envueltos.length, `${donde}: el marco de cada uno, con su ancho (no crece con el gráfico)${L.envueltos.length ? ` (crecen: ${L.envueltos.join('; ')})` : ''}`);
    if (aSuTamano) {
        const otros = L.medidas.filter(m => Math.abs(m.pantalla[0] - Math.min(m.lienzo[2], m.disponible)) > 1).map(m => `${m.nombre}: ${m.pantalla[0]} de ancho, con un lienzo de ${m.lienzo[2]} y ${m.disponible} libres`);
        comprobar(!otros.length, `${donde}: cada uno, a su tamaño (o al de su caja: ni más grande ni más pequeño)${otros.length ? ` (${otros.join('; ')})` : ''}`);
    }
    const montados = await textosMontados(pagina, raizSel), tapados = await textosTapados(pagina, raizSel);
    comprobar(!montados.length, `${donde}: ningún texto se monta con otro${montados.length ? ` (${montados.join(' | ')})` : ''}`);
    comprobar(!tapados.length, `${donde}: ningún texto queda tapado${tapados.length ? ` (${tapados.join(' | ')})` : ''}`);
    return L;
}

/**
 * Los gráficos extremos en una pantalla de este ancho: dibujados, oculto lo de los ocultos (y lo sacado de la página) sin
 * trabajar, y a la vista; los ocultos, mostrados, iguales que los de a la vista.
 * @param {number} ancho
 */
async function enUnaPantalla(ancho) {
    const { pagina, errores, cerrar } = await abrirPagina({ raiz, ancho, alto: 900 });
    try {
        await pagina.evaluate(() => { location.hash = '#analizador'; });
        await pagina.waitForFunction(() => document.getElementById('analizador')?.classList.contains('active'));
        const ids = await dibujarExtremos(pagina);
        await pagina.waitForTimeout(300);
        const sinVerse = await llamadasSinVerse(pagina);
        comprobar(sinVerse < LLAMADAS_OCULTO, `a ${ancho}: los gráficos dibujados ocultos (y uno sacado ya de la página) no trabajan en cada cuadro (${sinVerse} llamadas en un segundo a _ajustarTamanoCSS)`);
        await pagina.evaluate(() => document.querySelectorAll('.extremo-oculto').forEach(d => { /** @type {HTMLElement} */ (d).style.display = ''; }));
        await pagina.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 300)))));
        const L = await revisarGraficos(pagina, LUGAR, `a ${ancho}, con datos y nombres extremos`, true);
        const de = (/** @type {string} */ id) => L.medidas.find(m => m.nombre === `#${id}`);
        // la dispersión con un título largo sin espacios: su lienzo, más ancho que el gráfico; y a su tamaño (arriba)
        const sinEspacios = de('extDispSinEspacios');
        comprobar(!!sinEspacios && sinEspacios.lienzo[2] > 520, `a ${ancho}: con un título sin espacios, el lienzo de la dispersión se ensancha (${sinEspacios ? sinEspacios.lienzo[2] : '—'}) y ella, con él (${sinEspacios ? sinEspacios.pantalla[0] : '—'})`);
        // dibujados ocultos y mostrados después: como los de a la vista
        const distintos = ids.flatMap(id => {
            const a = de(id), b = de(`${id}-oculto`);
            if (!a || !b) return [`#${id}: no se ve`];
            const iguales = a.lienzo.every((v, i) => Math.abs(v - b.lienzo[i]) <= 1) && a.pantalla.every((v, i) => Math.abs(v - b.pantalla[i]) <= 1) && a.lineasDelTitulo === b.lineasDelTitulo && a.nombresDeEjes.join('|') === b.nombresDeEjes.join('|');
            return iguales ? [] : [`#${id}: a la vista ${a.lienzo.join(' ')} (${a.pantalla.join(' × ')}), título en ${a.lineasDelTitulo} línea(s), ${a.nombresDeEjes.join(', ')}; oculto ${b.lienzo.join(' ')} (${b.pantalla.join(' × ')}), en ${b.lineasDelTitulo}, ${b.nombresDeEjes.join(', ')}`];
        });
        comprobar(!distintos.length, `a ${ancho}: cada gráfico dibujado oculto, al verse, igual que dibujado a la vista (lienzo, tamaño, título y nombres de sus ejes)${distintos.length ? ` (${distintos.join(' | ')})` : ''}`);
        const despues = await llamadasSinVerse(pagina);
        comprobar(despues < LLAMADAS_OCULTO, `a ${ancho}: y ya a la vista, quietos (${despues} llamadas en un segundo)`);
        // los histogramas y los Q-Q de la correlación, en su recuadro como en la página (panelDeNormalidad)
        const normalidad = await pagina.evaluate(async (/** @type {string} */ lugarSel) => {
            const { ScientificCharts } = await import('./src/analizador/graficas.js');
            const { panelDeNormalidad } = await import('./src/analizador/ui/resultados.js');
            const div = document.createElement('div');
            div.innerHTML = panelDeNormalidad();
            /** @type {HTMLElement} */ (document.querySelector(lugarSel)).appendChild(div);
            const valores = Array.from({ length: 120 }, (_, i) => 20 + ((i * 37) % 120) / 4);
            for (const [hist, qq] of [['histVariable1', 'qqVariable1'], ['histVariable2', 'qqVariable2']]) {
                new ScientificCharts(hist, { width: 640, height: 400, primaryColor: '#2E5BBA' }).createHistogramNormal(valores, { title: 'Distribución: Puntaje', xLabel: 'Puntaje' });
                new ScientificCharts(qq, { width: 640, height: 400, primaryColor: '#2E5BBA' }).createQQPlot(valores, { title: 'Q-Q: Puntaje' });
            }
            await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
            const caja = /** @type {HTMLElement} */ (div.querySelector('.result-box')), cs = getComputedStyle(caja), r = caja.getBoundingClientRect();
            const izquierda = r.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft), derecha = r.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight);
            return ['histVariable1', 'qqVariable1', 'histVariable2', 'qqVariable2'].map(id => {
                const m = /** @type {HTMLElement} */ (document.getElementById(id)).getBoundingClientRect();
                return { id, ancho: Math.round(m.width), fuera: Math.round(Math.max(izquierda - m.left, m.right - derecha)) };
            });
        }, LUGAR);
        comprobar(normalidad.every(n => n.fuera <= 1), `a ${ancho}: los histogramas y los Q-Q, dentro de su recuadro (${normalidad.map(n => `#${n.id}: ${n.ancho} de ancho${n.fuera > 1 ? `, ${n.fuera} fuera` : ''}`).join('; ')})`);
        // las cards de la rejilla: la matriz y el diagrama de caja, en la página (como los dibuja ui/graficos.js)
        const cards = await pagina.evaluate(async () => {
            const { ScientificCharts } = await import('./src/analizador/graficas.js');
            /** @type {HTMLElement} */ (document.getElementById('contenedorGraficos')).classList.add('show');
            // ocho variables con nombres largos (las etiquetas de las columnas, en diagonal, como en el caso 1)
            const nombres = ['Procrastinación académica', 'Adicción a redes sociales', 'Autoeficacia académica', 'Apoyo social percibido', 'Rendimiento académico', 'Estrés académico — EEA', 'Bienestar psicológico — Ryff', 'Reacciones psicológicas'];
            const r = nombres.map((_, i) => nombres.map((__, j) => (i === j ? 1 : Math.round(45 * Math.cos(i + j)) / 100)));
            new ScientificCharts('matriz-correlacion', { width: 900, height: 620, primaryColor: '#2E5BBA' }).createCorrelationMatrix(r, nombres, { title: '' });
            const cajas = nombres.map((_, k) => Array.from({ length: 60 }, (__, i) => 20 + 10 * k + ((i * 7) % 23)));
            new ScientificCharts('diagrama-caja', { width: 900, height: 460, primaryColor: '#2E5BBA' }).createBoxPlot(cajas, nombres, { title: '' });
            await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
            return ['matriz-correlacion', 'diagrama-caja'].map(id => {
                const c = /** @type {HTMLElement} */ (document.getElementById(id)), s = /** @type {SVGSVGElement} */ (c.querySelector('svg'));
                return { id, card: c.clientWidth, grafico: Math.round(s.getBoundingClientRect().width) };
            });
        });
        const esperado = (/** @type {number} */ card) => (card < 640 ? card : 0.82 * card);
        const malCards = cards.filter(c => c.grafico > c.card + 1 || (ancho < 640 && Math.abs(c.grafico - esperado(c.card)) > 1));
        comprobar(!malCards.length, `a ${ancho}: las cards de la rejilla, ${ancho < 640 ? 'a todo su ancho (en un teléfono)' : 'dentro de su card'} (${cards.map(c => `#${c.id}: ${c.grafico} de ${c.card}`).join('; ')})`);
        await revisarGraficos(pagina, '#contenedorGraficos', `a ${ancho}, las cards de la rejilla`, false);
        // (2027.01.14, revisión) la figura de la regresión bivariada, a su tamaño (640) o, en un teléfono, de 480 como poco (sus
        // textos de 11 px, de 8 o más), desplazable dentro de su recuadro; y la tarjeta del SEM, con sus tablas, sin ensanchar la
        // página. A 360, hasta la 2027.01.13, la figura se veía de 242 de ancho (textos de 4,2 px) y la tabla de parámetros hacía
        // la página de 515
        const enLaPagina = await pagina.evaluate(async (/** @type {string} */ lugarSel) => {
            const { AnalizadorEstadistico } = await import('./src/analizador/estadistica.js');
            const { RegresionMultiple } = await import('./src/analizador/regresion.js');
            const { SEMUI } = await import('./src/analizador/sem-ui.js');
            let s = 7;
            const u = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
            const nrm = () => Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u());
            const item = (/** @type {number} */ x) => Math.min(5, Math.max(1, Math.round(3 + 0.9 * x + 0.6 * nrm())));
            AnalizadorEstadistico.cargarDatos(Array.from({ length: 300 }, () => {
                const f = nrm(), g = 0.5 * f + 0.87 * nrm();
                return { Apoyo_social_1: item(f), Apoyo_social_2: item(f), Apoyo_social_3: item(f), Apoyo_social_4: item(f), Autoeficacia_1: item(g), Autoeficacia_2: item(g), Autoeficacia_3: item(g), Autoeficacia_4: item(g), Ingreso: Math.round(1479000 + 900000 * u()) };
            }));
            const div = document.createElement('div');
            div.className = 'card';
            div.innerHTML = /** @type {any} */ (RegresionMultiple).renderRegresionBivariada('Apoyo_social_1', 'Ingreso', 'Apoyo social', 'Ingreso del hogar').html;
            /** @type {HTMLElement} */ (document.querySelector(lugarSel)).appendChild(div);
            for (let el = document.getElementById('semCard'); el && el !== document.body; el = el.parentElement) if (!el.getClientRects().length || getComputedStyle(el).display === 'none') el.style.display = 'block';
            /** @type {HTMLTextAreaElement} */ (document.getElementById('semSintaxis')).value = 'Apoyo =~ Apoyo_social_1 + Apoyo_social_2 + Apoyo_social_3 + Apoyo_social_4\nAutoeficacia =~ Autoeficacia_1 + Autoeficacia_2 + Autoeficacia_3 + Autoeficacia_4\nAutoeficacia ~ Apoyo';
            /** @type {any} */ (SEMUI)._onAjustar();
            await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
            const img = div.querySelector('img');
            return { figura: img ? Math.round(img.getBoundingClientRect().width) : 0, pagina: document.documentElement.scrollWidth, ventana: innerWidth, tablas: document.querySelectorAll('#semOut .tabla-ancha > table').length };
        }, LUGAR);
        comprobar(ancho < 640 ? enLaPagina.figura >= 480 : enLaPagina.figura === 640, `a ${ancho}: la figura de la regresión bivariada, de ${enLaPagina.figura} de ancho (${ancho < 640 ? '480 o más en un teléfono' : 'a su tamaño, 640'})`);
        comprobar(enLaPagina.tablas >= 2 && enLaPagina.pagina <= enLaPagina.ventana, `a ${ancho}: con ella y con las ${enLaPagina.tablas} tablas del SEM, la página, de ${enLaPagina.pagina} de ancho (sin pasar del de la ventana, ${enLaPagina.ventana})`);
        comprobar(errores.length === 0, `a ${ancho}: sin errores en la página${errores.length ? `: ${errores.slice(0, 3).join(' | ')}` : ''}`);
    } finally {
        await cerrar();
    }
}

async function principal() {
    const { pw, motivo } = await prepararChromium();
    if (!pw) { console.log(`Se omiten los gráficos extremos en el navegador: ${motivo}.`); return; }
    for (const ancho of [1280, 360]) {
        try { await enUnaPantalla(ancho); } catch (err) { comprobar(false, `a ${ancho}: ${err instanceof Error ? err.message.split('\n')[0] : err}`); }
    }
    if (!hechas) { console.error('No se comprobó nada.'); process.exit(2); }
    if (fallos.length) { console.log(`\n${fallos.length} fallo(s)`); process.exit(1); }
}

principal().catch(e => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
