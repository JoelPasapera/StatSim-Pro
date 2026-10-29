// @ts-check
// tests/navegador/graficos-medidas.mjs — (2027.01.12, revisión) Lo que se mide de los gráficos del Analizador en Chromium, para
// tests/navegador/graficos-en-papel.mjs (con los casos de ejemplos/) y tests/navegador/graficos-extremos.mjs (con datos y
// nombres extremos): si caben en su lienzo, su título en el centro, su tamaño y su proporción, si su marco crece con ellos,
// los textos que se montan o que quedan tapados, el contraste de sus textos en papel y la tinta de su dibujo.
// (2027.01.13, revisión) Un texto tapado, en varios puntos de él (solo su centro: uno tapado al 40 % pasaba); el dibujo de cada
// gráfico, el de sus marcas de datos (`data-marca`: sus barras, sus puntos, sus curvas…), con cualquier tinta que se vea (un
// histograma sin barras o una dispersión sin puntos pasaban con la tinta de su curva o de su recta, y las barras y los puntos,
// al 0,55 de opacidad, no contaban); y sus líneas de datos, a 3:1 o más del papel (las series claras al imprimir pasaban).

/**
 * Los gráficos (no los iconos) a la vista dentro de un selector, cada uno con su nombre (el id de su contenedor), en la página.
 * Se usa dentro de pagina.evaluate: no puede cerrar sobre nada.
 */
export const GRAFICOS_EN_LA_PAGINA = `(raizSel) => [...document.querySelectorAll(raizSel + ' svg[viewBox]')]
    .filter(s => s.getClientRects().length && s.viewBox.baseVal.width > 40)
    .map(s => { let el = s.parentElement; while (el && !el.id) el = el.parentElement; return { s, nombre: el ? '#' + el.id : 'un gráfico' }; })`;

/**
 * @typedef {{ nombre: string, lienzo: number[], pantalla: number[], disponible: number, lineasDelTitulo: number, nombresDeEjes: string[] }} Medidas
 * @typedef {{ fuera: string[], apartados: string[], proporcion: string[], dispersion: string, envueltos: string[], medidas: Medidas[] }} Lienzos
 */

/**
 * De cada gráfico a la vista: lo que se sale de su lienzo (más de 1), cuánto se aparta su título del centro (más de 2), si su
 * tamaño en la pantalla tiene otra proporción que su lienzo (más de un 1 %), de la dispersión si es más pequeña que su tamaño o
 * su caja, y (2027.01.12, revisión) si su marco crece con él (un marco sin ancho propio: el gráfico no puede crecer del ancho
 * con que se dibujó primero). Y sus medidas: su lienzo, su tamaño, el ancho de su recuadro, las líneas de su título y los
 * nombres de sus ejes (con su tamaño de letra).
 * @param {any} pagina
 * @param {string} [raizSel]
 * @returns {Promise<Lienzos>}
 */
export const medirLienzos = (pagina, raizSel = '#analizador') => pagina.evaluate(({ raizSel, graficos }) => {
    /** @type {Lienzos} */
    const r = { fuera: [], apartados: [], proporcion: [], dispersion: '', envueltos: [], medidas: [] };
    for (const { s, nombre } of /** @type {Array<{ s: SVGSVGElement, nombre: string }>} */ ((0, eval)(graficos)(raizSel))) {
        const vb = s.viewBox.baseVal, b = s.getBBox();
        const lados = { izquierda: vb.x - b.x, derecha: b.x + b.width - (vb.x + vb.width), arriba: vb.y - b.y, abajo: b.y + b.height - (vb.y + vb.height) };
        const malos = Object.entries(lados).filter(([, v]) => v > 1).map(([k, v]) => `${k} ${v.toFixed(0)}`);
        if (malos.length) r.fuera.push(`${nombre}: ${malos.join(', ')}`);
        const t = /** @type {SVGTextElement | null} */ (s.querySelector('.titulo-grafico'));
        if (t && (t.textContent || '').trim()) {
            const tb = t.getBBox(), aparte = tb.x + tb.width / 2 - (vb.x + vb.width / 2);
            if (Math.abs(aparte) > 2) r.apartados.push(`${nombre}: ${aparte.toFixed(0)} de un ancho de ${vb.width.toFixed(0)}`);
        }
        const caja = s.getBoundingClientRect();
        const otra = (caja.width / caja.height) / (vb.width / vb.height);
        if (Math.abs(otra - 1) > 0.01) r.proporcion.push(`${nombre}: ${caja.width.toFixed(0)} × ${caja.height.toFixed(0)} con un lienzo de ${vb.width.toFixed(0)} × ${vb.height.toFixed(0)}`);
        const recuadro = /** @type {HTMLElement} */ (s.closest('.result-box') || s.parentElement), cs = getComputedStyle(recuadro);
        const disponible = recuadro.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        if (nombre === '#graficoDispersion') {
            const debe = Math.min(vb.width, disponible);
            if (caja.width < debe - 1) r.dispersion = `${caja.width.toFixed(0)} de ancho, y su tamaño (o su caja) es de ${debe.toFixed(0)}`;
        }
        // ¿crece su marco si el gráfico crece? (un momento, 200 más ancho)
        const marco = /** @type {HTMLElement} */ (s.parentElement), antes = marco.clientWidth, estilo = s.style.width;
        s.style.width = `${Math.round(caja.width) + 200}px`;
        const crece = marco.clientWidth !== antes;
        s.style.width = estilo;
        if (crece) r.envueltos.push(`${nombre}: ${antes} de ancho, y ${antes + 200} con el gráfico más ancho`);
        r.medidas.push({
            nombre, lienzo: [vb.x, vb.y, vb.width, vb.height].map(v => Math.round(v)), pantalla: [Math.round(caja.width), Math.round(caja.height)], disponible: Math.round(disponible),
            lineasDelTitulo: t && (t.textContent || '').trim() ? Math.max(1, t.querySelectorAll('tspan').length) : 0,
            nombresDeEjes: [...s.querySelectorAll('.nombre-eje-x, .nombre-eje-y')].map(n => `${n.getAttribute('class')}: «${(n.firstChild && n.firstChild.nodeValue) || ''}» a ${n.getAttribute('font-size')}`),
        });
    }
    return r;
}, { raizSel, graficos: GRAFICOS_EN_LA_PAGINA });

/**
 * (2027.01.12, revisión) Los textos de cada gráfico que se montan con otro: sus rectángulos en la pantalla (girados, si el texto
 * lo está: las etiquetas en diagonal) se cruzan más de 2 px, salvo los valores de un mismo eje entre sí (d3 los reparte). Por
 * gráfico, los tres primeros. En la 2027.01.11, el nombre del eje Y de la dispersión con sus valores de 7 cifras, y con un
 * título en dos líneas.
 * @param {any} pagina
 * @param {string} raizSel
 * @returns {Promise<string[]>}
 */
export const textosMontados = (pagina, raizSel) => pagina.evaluate(({ raizSel, graficos }) => {
    /** @typedef {{ x: number, y: number }} Punto */
    /** Lo que se lee de un texto (sin su <title>). @param {Element} t */
    const leido = t => [...t.childNodes].filter(n => n.nodeName.toLowerCase() !== 'title').map(n => n.textContent || '').join('').trim();
    /** Las esquinas de un texto en la pantalla (con su giro). @param {SVGTextElement} t @returns {Punto[] | null} */
    const esquinas = t => {
        const b = t.getBBox(), m = t.getScreenCTM();
        if (!m || !(b.width > 0)) return null;
        return [[b.x, b.y], [b.x + b.width, b.y], [b.x + b.width, b.y + b.height], [b.x, b.y + b.height]].map(([x, y]) => new DOMPoint(x, y).matrixTransform(m));
    };
    /** Cuánto se cruzan dos rectángulos (ejes separadores): lo menos que se solapan sus proyecciones; 0 o menos, nada. @param {Punto[]} P @param {Punto[]} Q */
    const cruce = (P, Q) => {
        let menor = Infinity;
        for (const pol of [P, Q]) {
            for (let i = 0; i < pol.length; i++) {
                const a = pol[i], b = pol[(i + 1) % pol.length], nx = a.y - b.y, ny = b.x - a.x, l = Math.hypot(nx, ny) || 1;
                const p = P.map(q => (q.x * nx + q.y * ny) / l), q = Q.map(r => (r.x * nx + r.y * ny) / l);
                menor = Math.min(menor, Math.min(Math.max(...p), Math.max(...q)) - Math.max(Math.min(...p), Math.min(...q)));
            }
        }
        return menor;
    };
    /** @type {string[]} */
    const out = [];
    for (const { s, nombre } of /** @type {Array<{ s: SVGSVGElement, nombre: string }>} */ ((0, eval)(graficos)(raizSel))) {
        const textos = /** @type {SVGTextElement[]} */ ([...s.querySelectorAll('text')].filter(t => leido(t) && t.getClientRects().length));
        const formas = textos.map(esquinas);
        const eje = (/** @type {Element} */ t) => { const tick = t.closest('.tick'); return tick ? tick.parentNode : null; };
        /** @type {string[]} */
        const mal = [];
        for (let i = 0; i < textos.length; i++) {
            for (let j = i + 1; j < textos.length; j++) {
                const a = textos[i], b = textos[j], A = formas[i], B = formas[j];
                if (!A || !B || (eje(a) && eje(a) === eje(b))) continue;
                const c = cruce(A, B);
                if (c > 2) mal.push(`«${leido(a).slice(0, 30)}» con «${leido(b).slice(0, 30)}» (${c.toFixed(0)} px)`);
            }
        }
        if (mal.length) out.push(`${nombre}: ${mal.slice(0, 3).join('; ')}`);
    }
    return out;
}, { raizSel, graficos: GRAFICOS_EN_LA_PAGINA });

/**
 * (2027.01.14, revisión) Dónde se mira si un texto está tapado: a lo ancho y a lo alto de su caja, en estas fracciones (con su
 * giro). En la 2027.01.13, al 15, al 50 y al 85 % de su ancho y al 35 y al 65 % de su alto: una primera o una última letra
 * tapadas (el 12 % de su caja), o una banda del 40 al 60 % de su alto, pasaban.
 */
export const PUNTOS_DE_UN_TEXTO = { x: [0.03, 0.15, 0.3, 0.5, 0.7, 0.85, 0.97], y: [0.2, 0.35, 0.5, 0.65, 0.8] };

/**
 * (2027.01.12, revisión) Los textos de cada gráfico tapados por una forma con relleno pintada después (encima). Por gráfico, los
 * tres primeros. Hasta la 2027.01.11, en el diagrama de rutas del SEM, la elipse de la mediadora tapaba el coeficiente del
 * efecto directo. (2027.01.13, revisión) En varios puntos de cada texto, con su giro (PUNTOS_DE_UN_TEXTO): mirando solo su
 * centro, uno tapado al 40 % pasaba.
 * @param {any} pagina
 * @param {string} raizSel
 * @returns {Promise<string[]>}
 */
export const textosTapados = (pagina, raizSel) => pagina.evaluate(({ raizSel, graficos, fracciones }) => {
    /** @param {Element} el @param {Element} svg */
    const opacidad = (el, svg) => { let o = 1; for (let n = /** @type {Node | null} */ (el); n && n !== svg.parentNode; n = n.parentNode) if (n.nodeType === 1) o *= Number(getComputedStyle(/** @type {Element} */ (n)).opacity || 1); return o; };
    /** @type {string[]} */
    const out = [];
    for (const { s, nombre } of /** @type {Array<{ s: SVGSVGElement, nombre: string }>} */ ((0, eval)(graficos)(raizSel))) {
        const formas = /** @type {SVGGeometryElement[]} */ ([...s.querySelectorAll('rect, path, circle, ellipse, polygon')].filter(f => f.getClientRects().length && typeof (/** @type {any} */ (f)).isPointInFill === 'function'));
        /** @type {string[]} */
        const mal = [];
        for (const t of /** @type {NodeListOf<SVGTextElement>} */ (s.querySelectorAll('text'))) {
            const texto = (t.textContent || '').trim(), mt = t.getScreenCTM();
            if (!texto || !t.getClientRects().length || !mt) continue;
            const b = t.getBBox(), rt = t.getBoundingClientRect();
            // sus puntos, en la pantalla
            const puntos = fracciones.x.flatMap((/** @type {number} */ fx) => fracciones.y.map((/** @type {number} */ fy) => new DOMPoint(b.x + fx * b.width, b.y + fy * b.height).matrixTransform(mt)));
            const encima = formas.find(forma => {
                if (!(t.compareDocumentPosition(forma) & Node.DOCUMENT_POSITION_FOLLOWING) || t.contains(forma)) return false;   // pintada antes: debajo
                const rf = forma.getBoundingClientRect();
                if (rf.right < rt.left || rf.left > rt.right || rf.bottom < rt.top || rf.top > rt.bottom) return false;   // lejos
                const cs = getComputedStyle(forma), m = forma.getScreenCTM();
                if (!m || cs.fill === 'none' || Number(cs.fillOpacity || 1) * opacidad(forma, s) < 0.5) return false;
                const inversa = m.inverse();
                return puntos.some(q => {
                    const p = q.matrixTransform(inversa), punto = s.createSVGPoint();
                    punto.x = p.x;
                    punto.y = p.y;
                    return forma.isPointInFill(punto);
                });
            });
            if (encima) mal.push(`«${texto.slice(0, 30)}», bajo un ${encima.tagName}`);
        }
        if (mal.length) out.push(`${nombre}: ${mal.slice(0, 3).join('; ')}`);
    }
    return out;
}, { raizSel, graficos: GRAFICOS_EN_LA_PAGINA, fracciones: PUNTOS_DE_UN_TEXTO });

/**
 * Los textos de los gráficos con poco contraste en papel: con lo que tienen detrás (las formas del mismo gráfico pintadas antes
 * bajo su centro, compuestas sobre el blanco del papel), menos de `minimo`; y los claros (media de sus RGB de más de 200, salvo
 * el blanco: para un texto blanco sobre una celda de color, cuenta el contraste). Por gráfico, con el primero de cada uno.
 * @param {any} pagina
 * @param {string} raizSel
 * @param {number} minimo
 * @returns {Promise<{ bajos: string[], claros: string[] }>}
 */
export const contrastesEnPapel = (pagina, raizSel, minimo) => pagina.evaluate(({ raizSel, graficos, minimo }) => {
    /** @typedef {{ r: number, g: number, b: number, a: number }} Color */
    /** @param {string} c @returns {Color | null} */
    const rgba = c => { const m = /rgba?\(([^)]+)\)/.exec(c || ''); if (!m) return null; const p = m[1].split(',').map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    /** @param {Color} arriba @param {Color} abajo @returns {Color} */
    const sobre = (arriba, abajo) => ({ r: arriba.r * arriba.a + abajo.r * (1 - arriba.a), g: arriba.g * arriba.a + abajo.g * (1 - arriba.a), b: arriba.b * arriba.a + abajo.b * (1 - arriba.a), a: 1 });
    /** @param {Color} c */
    const luminancia = c => { const f = (/** @type {number} */ v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    /** @param {Color} a @param {Color} b */
    const razon = (a, b) => { const x = luminancia(a), y = luminancia(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    /** @param {Element} el @param {Element} svg */
    const opacidad = (el, svg) => { let o = 1; for (let n = /** @type {Node | null} */ (el); n && n !== svg.parentNode; n = n.parentNode) if (n.nodeType === 1) o *= Number(getComputedStyle(/** @type {Element} */ (n)).opacity || 1); return o; };
    const papel = { r: 255, g: 255, b: 255, a: 1 };
    /** @type {Record<string, string>} */
    const bajos = {}, claros = {};
    for (const { s, nombre } of /** @type {Array<{ s: SVGSVGElement, nombre: string }>} */ ((0, eval)(graficos)(raizSel))) {
        const formas = /** @type {SVGGeometryElement[]} */ ([...s.querySelectorAll('rect, path, circle, ellipse, polygon')].filter(f => f.getClientRects().length && typeof (/** @type {any} */ (f)).isPointInFill === 'function'));
        for (const t of s.querySelectorAll('text')) {
            const texto = (t.textContent || '').trim();
            if (!texto || !t.getClientRects().length) continue;
            const ft = rgba(getComputedStyle(t).fill);
            if (!ft) continue;
            if (!(ft.r === 255 && ft.g === 255 && ft.b === 255) && (ft.r + ft.g + ft.b) / 3 > 200 && !claros[nombre]) claros[nombre] = `«${texto.slice(0, 40)}» (${getComputedStyle(t).fill})`;
            const caja = t.getBoundingClientRect(), cx = caja.left + caja.width / 2, cy = caja.top + caja.height / 2;
            let fondo = papel;
            for (const forma of formas) {
                if (!(forma.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;   // pintada después: encima
                const cs = getComputedStyle(forma), f = rgba(cs.fill), m = forma.getScreenCTM();
                if (!f || !m) continue;
                const p = new DOMPoint(cx, cy).matrixTransform(m.inverse()), punto = s.createSVGPoint();
                punto.x = p.x;
                punto.y = p.y;
                if (!forma.isPointInFill(punto)) continue;
                fondo = sobre({ ...f, a: f.a * Number(cs.fillOpacity || 1) * opacidad(forma, s) }, fondo);
            }
            const c = razon(sobre(ft, fondo), fondo);
            if (c < minimo && !bajos[nombre]) bajos[nombre] = `«${texto.slice(0, 40)}» ${c.toFixed(2)}:1`;
        }
    }
    return { bajos: Object.entries(bajos).map(([k, v]) => `${k}: ${v}`), claros: Object.entries(claros).map(([k, v]) => `${k}: ${v}`) };
}, { raizSel, graficos: GRAFICOS_EN_LA_PAGINA, minimo });

/**
 * La parte de una imagen (PNG en base64) con tinta: píxeles con una luminancia de menos de la mitad, sobre blanco.
 * @param {any} pagina
 * @param {string} base64
 * @returns {Promise<number>}
 */
export const conTinta = (pagina, base64) => pagina.evaluate(async (/** @type {string} */ b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const x = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, c.width, c.height);
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let tinta = 0;
    for (let i = 0; i < d.length; i += 4) if (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2] < 128) tinta++;
    return tinta / (d.length / 4);
}, base64);

/** La tinta mínima de un gráfico (o de su dibujo) en papel. */
export const TINTA_MINIMA = 0.003;

/**
 * Los píxeles de una imagen (PNG en base64) que se ven sobre el blanco: con una luminancia de menos de 235 (cualquier tinta,
 * también la de un relleno translúcido).
 * @param {any} pagina
 * @param {string} base64
 * @returns {Promise<number>}
 */
export const pixelesConTinta = (pagina, base64) => pagina.evaluate(async (/** @type {string} */ b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const x = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, c.width, c.height);
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2] < 235) n++;
    return n;
}, base64);

/** (2027.01.13, revisión) Los píxeles que deben verse de las marcas de datos de un gráfico (unos pocos puntos de 4 de radio). */
export const PIXELES_DE_DIBUJO = 20;
/**
 * (2027.01.14, revisión) Y la parte de ellas que debe verse en el gráfico como sale (en los de la página, del 83 al 96 %; un
 * histograma tapado por un rectángulo blanco, el 1 %).
 */
export const PARTE_VISIBLE_DEL_DIBUJO = 0.25;
/**
 * (2027.01.16, revisión) Y la parte de su tinta (lo que cambian la luminancia, sumado) que debe verse en el gráfico como sale:
 * un velo blanco translúcido pintado encima deja el 40 % con el 60 % de opacidad y el 30 % con el 70 %, pero cambia lo bastante
 * casi todos sus píxeles, así que contándolos no se veía.
 */
export const PARTE_DE_LA_TINTA = 0.5;

/**
 * (2027.01.14, revisión) Los píxeles en que difieren dos capturas del mismo tamaño (con una luminancia que cambia en más de
 * 20): los de lo que se ve de las marcas de datos, entre el gráfico como sale y el mismo sin ellas; y (2027.01.16, revisión) lo
 * que cambia la luminancia, sumado en todos (`suma`, la tinta de lo que difiere). -1 en los dos si no miden lo mismo.
 * @param {any} pagina @param {string} a @param {string} b en base64
 * @returns {Promise<{ n: number, suma: number }>}
 */
const pixelesDistintos = (pagina, a, b) => pagina.evaluate(async (/** @type {{ a: string, b: string }} */ { a, b }) => {
    /** @param {string} b64 */
    const leer = async b64 => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const x = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
        x.fillStyle = '#ffffff';
        x.fillRect(0, 0, c.width, c.height);
        x.drawImage(img, 0, 0);
        return x.getImageData(0, 0, c.width, c.height).data;
    };
    const [da, db] = await Promise.all([leer(a), leer(b)]);
    if (da.length !== db.length) return { n: -1, suma: -1 };
    let n = 0, suma = 0;
    for (let i = 0; i < da.length; i += 4) {
        const d = Math.abs((0.2126 * da[i] + 0.7152 * da[i + 1] + 0.0722 * da[i + 2]) - (0.2126 * db[i] + 0.7152 * db[i + 1] + 0.0722 * db[i + 2]));
        suma += d;
        if (d > 20) n++;
    }
    return { n, suma };
}, { a, b });

/**
 * La tinta de cada gráfico a la vista, como sale (al imprimir: con la página en modo de impresión). (2027.01.13, revisión) De
 * los que dibuja ScientificCharts (con área de datos, .chart-content), la de sus marcas de datos (`data-marca`) solas, con
 * cualquier tinta que se vea: hasta la 2027.01.12 se medía la de su área de datos sin sus textos ni sus ejes, y con una
 * luminancia de menos de la mitad, así que un histograma sin barras o una dispersión sin puntos pasaban con su curva o su
 * recta, y las barras y los puntos, translúcidos, nunca contaban; uno sin marcas, o con menos de PIXELES_DE_DIBUJO a la vista,
 * no tiene dibujo. (2027.01.14, revisión) Y en el gráfico como sale, lo que se ve de ellas (lo que cambia sin ellas), también
 * PIXELES_DE_DIBUJO o más: midiéndolas solas, algo opaco pintado encima (un rectángulo blanco sobre el histograma) no contaba.
 * De los demás (el diagrama de rutas del SEM), la del gráfico entero, TINTA_MINIMA o más. Los que no la tienen (o no se ven),
 * con la que tienen.
 * @param {any} pagina
 * @param {string} raizSel
 * @returns {Promise<string[]>}
 */
export async function graficosSinTinta(pagina, raizSel) {
    const lista = await pagina.evaluate(({ raizSel, graficos }) => (0, eval)(graficos)(raizSel).map((/** @type {any} */ x, /** @type {number} */ i) => {
        x.s.setAttribute('data-tinta', String(i));
        const area = x.s.querySelector(':scope > .chart-content');
        return { i, nombre: x.nombre, area: !!area, marcas: x.s.querySelectorAll('[data-marca]').length, seVe: !area || area.getClientRects().length > 0 };
    }), { raizSel, graficos: GRAFICOS_EN_LA_PAGINA });
    // (solo las marcas: lo demás de su área de datos, invisible; las marcas, visibles aunque lo que las contiene no lo sea; o
    // (2027.01.14, revisión) todo menos las marcas, para ver qué cambia sin ellas en el gráfico como sale)
    const ESTILOS = {
        soloMarcas: 'svg[data-tinta] > .chart-content * { visibility: hidden !important; } svg[data-tinta] > .chart-content [data-marca], svg[data-tinta] > .chart-content [data-marca] * { visibility: visible !important; }',
        nada: 'svg[data-tinta] > .chart-content * { visibility: hidden !important; }',
        sinMarcas: 'svg[data-tinta] > .chart-content [data-marca], svg[data-tinta] > .chart-content [data-marca] * { visibility: hidden !important; }',
    };
    /** @param {string} css */
    const conEstilo = css => pagina.evaluate((/** @type {string} */ css) => {
        document.getElementById('tintaSinTextos')?.remove();
        if (!css) return;
        const e = document.createElement('style');
        e.id = 'tintaSinTextos';
        e.textContent = css;
        document.head.appendChild(e);
    }, css);
    /** @type {string[]} */
    const blancos = [];
    try {
        for (const g of lista) {
            if (!g.seVe) { blancos.push(`${g.nombre} (su dibujo no se ve)`); continue; }
            if (g.area && !g.marcas) { blancos.push(`${g.nombre} (sin marcas de datos)`); continue; }
            const zona = pagina.locator(g.area ? `svg[data-tinta="${g.i}"] > .chart-content` : `svg[data-tinta="${g.i}"]`);
            // (2027.01.14, revisión) uno oculto con visibility: hidden tiene caja, pero no se ve (ni se puede capturar)
            await conEstilo('');
            if (!(await zona.isVisible())) { blancos.push(`${g.nombre} (su dibujo no se ve)`); continue; }
            if (g.area) {
                await conEstilo(ESTILOS.soloMarcas);
                const solas = (await zona.screenshot()).toString('base64'), n = await pixelesConTinta(pagina, solas);
                if (n < PIXELES_DE_DIBUJO) { blancos.push(`${g.nombre} (sus ${g.marcas} marcas de datos: ${n} píxeles a la vista)`); continue; }
                // (2027.01.14, revisión) y en el gráfico como sale, sus marcas se ven: lo que cambia sin ellas, frente a lo que ocupan
                // (lo que cambian solas, sobre nada). Midiendo las marcas solas, algo opaco pintado encima de ellas (un rectángulo
                // blanco sobre el histograma) no contaba
                await conEstilo(ESTILOS.nada);
                const solasSobreNada = await pixelesDistintos(pagina, solas, (await zona.screenshot()).toString('base64'));
                await conEstilo('');
                const entero = (await zona.screenshot()).toString('base64');
                await conEstilo(ESTILOS.sinMarcas);
                const aLaVista = await pixelesDistintos(pagina, entero, (await zona.screenshot()).toString('base64'));
                const ocupan = solasSobreNada.n, visibles = aLaVista.n;
                if (visibles < Math.max(PIXELES_DE_DIBUJO, PARTE_VISIBLE_DEL_DIBUJO * ocupan)) blancos.push(`${g.nombre} (sus marcas de datos, tapadas: se ven ${Math.max(0, visibles)} de sus ${ocupan} píxeles)`);
                // (2027.01.16, revisión) y con su tinta: bajo un velo blanco translúcido se ven casi todos sus píxeles, desvaídos
                else if (aLaVista.suma < PARTE_DE_LA_TINTA * solasSobreNada.suma) blancos.push(`${g.nombre} (sus marcas de datos, tapadas por un velo: se ve el ${(100 * Math.max(0, aLaVista.suma) / solasSobreNada.suma).toFixed(0)} % de su tinta)`);
            } else {
                await conEstilo('');
                const tinta = await conTinta(pagina, (await zona.screenshot()).toString('base64'));
                if (tinta < TINTA_MINIMA) blancos.push(`${g.nombre} (${(100 * tinta).toFixed(2)} %)`);
            }
        }
    } finally {
        await pagina.evaluate(() => { document.getElementById('tintaSinTextos')?.remove(); document.querySelectorAll('svg[data-tinta]').forEach(s => s.removeAttribute('data-tinta')); });
    }
    return blancos;
}

/** (2027.01.13, revisión) El contraste mínimo de una línea de datos con el papel (el de WCAG para lo que no es texto). */
export const CONTRASTE_DE_LAS_LINEAS = 3;

/**
 * (2027.01.13, revisión) Las líneas de datos claras (con la página como esté: al imprimir, impresa): las marcas de datos
 * (`data-marca`) que son líneas (un trazo sin relleno: las curvas del gráfico de las distribuciones), con su color y su
 * opacidad sobre el blanco a menos de CONTRASTE_DE_LAS_LINEAS de él. Por gráfico, la primera. En la 2027.01.11, impresas, las
 * curvas de colores claros quedaban a 1,7–2,6:1 (el ámbar casi no se veía); la tinta del gráfico no lo veía.
 * @param {any} pagina
 * @param {string} raizSel
 * @returns {Promise<string[]>}
 */
export const lineasClaras = (pagina, raizSel) => pagina.evaluate(({ raizSel, graficos, minimo }) => {
    /** @param {string} c */
    const rgb = c => { const m = /rgba?\(([^)]+)\)/.exec(c || ''); if (!m) return null; const p = m[1].split(',').map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    /** @param {{ r: number, g: number, b: number }} c */
    const luminancia = c => { const f = (/** @type {number} */ v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    /** @param {Element} el @param {Element} svg */
    const opacidad = (el, svg) => { let o = 1; for (let n = /** @type {Node | null} */ (el); n && n !== svg.parentNode; n = n.parentNode) if (n.nodeType === 1) o *= Number(getComputedStyle(/** @type {Element} */ (n)).opacity || 1); return o; };
    /** @type {string[]} */
    const out = [];
    for (const { s, nombre } of /** @type {Array<{ s: SVGSVGElement, nombre: string }>} */ ((0, eval)(graficos)(raizSel))) {
        for (const m of s.querySelectorAll('[data-marca]')) {
            const cs = getComputedStyle(m), trazo = rgb(cs.stroke);
            if (!trazo || cs.fill !== 'none' || !m.getClientRects().length) continue;
            const a = trazo.a * Number(cs.strokeOpacity || 1) * opacidad(m, s);
            const sobre = { r: trazo.r * a + 255 * (1 - a), g: trazo.g * a + 255 * (1 - a), b: trazo.b * a + 255 * (1 - a) };
            const c = 1.05 / (luminancia(sobre) + 0.05);
            if (c < minimo) { out.push(`${nombre}: una línea ${cs.stroke}${a < 1 ? ` al ${a.toFixed(2)}` : ''} (${c.toFixed(2)}:1)`); break; }
        }
    }
    return out;
}, { raizSel, graficos: GRAFICOS_EN_LA_PAGINA, minimo: CONTRASTE_DE_LAS_LINEAS });
