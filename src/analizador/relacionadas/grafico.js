// @ts-check
// analizador/relacionadas/grafico.js — (2027.01.17) el gráfico de perfil de unas medidas repetidas: la media de cada medida
// con su intervalo de confianza intra sujetos (Cousineau-Morey), unidas por una línea; con un factor entre sujetos, una línea
// por grupo, separadas un poco en horizontal para que sus barras no se tapen. Identidad de cada grupo por su tono (la paleta
// categórica validada de graficos-en-papel.js, en su orden fijo), su forma de marcador y una etiqueta directa al final de su
// línea; con dos o más grupos, también la leyenda. Cada punto lleva su descripción (la ventana que sale al pasar el ratón).
// Para la pantalla oscura o para el papel (el Word): el mismo dibujo con los pasos de cada modo. Sin DOM: devuelve el SVG.
import { CATEGORICA, TINTA, TRAZO_CLARO, TRAZO_EN_PAPEL } from '../graficos-en-papel.js';
import { escaparHTML } from '../../shared/html.js';
import { numeroFijo } from '../../shared/formato-numero.js';

/** @typedef {{ media: number, inferior: number, superior: number }} PuntoPerfil */
/** @typedef {{ etiqueta: string, puntos: PuntoPerfil[] }} SeriePerfil */

/** El texto claro de la pantalla (impresion.css lo pasa a tinta al imprimir, como el de los demás gráficos). */
const TEXTO_PANTALLA = '#cbd5e1';

/**
 * Marcas «redondas» de un eje: de 4 a 7, en pasos de 1, 2 o 5 por una potencia de 10.
 * @param {number} min
 * @param {number} max
 * @returns {number[]}
 */
export function marcasEje(min, max) {
    if (!(max > min)) { const c = Number.isFinite(min) ? min : 0; return [c - 1, c, c + 1]; }
    const bruto = (max - min) / 5, potencia = 10 ** Math.floor(Math.log10(bruto)), r = bruto / potencia;
    const paso = (r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10) * potencia;
    const desde = Math.floor(min / paso) * paso, hasta = Math.ceil(max / paso) * paso;
    /** @type {number[]} */ const marcas = [];
    for (let v = desde; v <= hasta + paso / 2; v += paso) marcas.push(Math.abs(v) < paso / 1e6 ? 0 : v);
    return marcas;
}

/**
 * Un marcador de la forma de cada serie (círculo, cuadrado, triángulo, rombo, triángulo invertido, cruz, pentágono, estrella),
 * centrado en (x, y) y de unos 9 px.
 * @param {number} s el número de la serie
 * @param {number} x
 * @param {number} y
 * @param {string} color
 * @param {string} borde el color del anillo que lo separa de lo que tapa (el de la superficie)
 * @returns {string}
 */
export function marcador(s, x, y, color, borde) {
    const r = 4.6, a = `fill="${color}" stroke="${borde}" stroke-width="1.5"`;
    const pol = (/** @type {number[][]} */ p) => `<polygon points="${p.map(([u, v]) => `${(x + /** @type {number} */ (u)).toFixed(1)},${(y + /** @type {number} */ (v)).toFixed(1)}`).join(' ')}" ${a}/>`;
    switch (s % 8) {
        case 0: return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" ${a}/>`;
        case 1: return `<rect x="${(x - r).toFixed(1)}" y="${(y - r).toFixed(1)}" width="${2 * r}" height="${2 * r}" ${a}/>`;
        case 2: return pol([[0, -r - 1], [r + 0.8, r], [-r - 0.8, r]]);
        case 3: return pol([[0, -r - 1], [r + 1, 0], [0, r + 1], [-r - 1, 0]]);
        case 4: return pol([[0, r + 1], [r + 0.8, -r], [-r - 0.8, -r]]);
        case 5: return pol([[-r, -r / 2.5], [-r / 2.5, -r / 2.5], [-r / 2.5, -r], [r / 2.5, -r], [r / 2.5, -r / 2.5], [r, -r / 2.5], [r, r / 2.5], [r / 2.5, r / 2.5], [r / 2.5, r], [-r / 2.5, r], [-r / 2.5, r / 2.5], [-r, r / 2.5]]);
        case 6: return pol(Array.from({ length: 5 }, (_, i) => { const t = -Math.PI / 2 + i * 2 * Math.PI / 5; return [(r + 0.6) * Math.cos(t), (r + 0.6) * Math.sin(t)]; }));
        default: return pol(Array.from({ length: 10 }, (_, i) => { const t = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.5 : r + 1.2; return [q * Math.cos(t), q * Math.sin(t)]; }));
    }
}

/**
 * Las posiciones verticales de unas etiquetas que no se pisan: cada una en su y deseada si cabe, y si no, empujadas lo justo
 * (al menos `separacion` entre dos vecinas), dentro de [arriba, abajo].
 * @param {number[]} deseadas
 * @param {number} separacion
 * @param {number} arriba
 * @param {number} abajo
 * @returns {number[]}
 */
export function separarEtiquetas(deseadas, separacion, arriba, abajo) {
    const orden = deseadas.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
    const ys = orden.map(o => Math.min(abajo, Math.max(arriba, o.y)));
    for (let a = 1; a < ys.length; a++) ys[a] = Math.max(/** @type {number} */ (ys[a]), /** @type {number} */ (ys[a - 1]) + separacion);
    // si se salieron por abajo, se suben desde el final
    for (let a = ys.length - 1; a >= 0; a--) { const tope = a === ys.length - 1 ? abajo : /** @type {number} */ (ys[a + 1]) - separacion; ys[a] = Math.min(/** @type {number} */ (ys[a]), tope); }
    /** @type {number[]} */ const salida = new Array(deseadas.length);
    orden.forEach((o, a) => { salida[o.i] = /** @type {number} */ (ys[a]); });
    return salida;
}

/**
 * El gráfico de perfil.
 * @param {{ nombres: string[], series: SeriePerfil[], ejeY: string, nivel?: number, papel?: boolean, decimales?: number }} opciones
 *   nombres: el de cada medida (el eje horizontal); series: una (sin factor) o una por grupo; ejeY: lo que se mide; papel: los
 *   colores del papel (el Word) en lugar de los de la pantalla oscura
 * @returns {{ svg: string, ancho: number, alto: number }}
 */
export function graficoPerfil({ nombres, series, ejeY, nivel = 0.95, papel = false, decimales = 2 }) {
    const k = nombres.length, S = series.length, conLeyenda = S >= 2, conEtiquetas = S >= 2 && S <= 4;
    const etiquetaMasLarga = Math.max(0, ...series.map(s => s.etiqueta.length));
    const W = 640, margen = { l: 64, r: conEtiquetas ? Math.min(170, 26 + 6.6 * etiquetaMasLarga) : 24, t: conLeyenda ? 40 : 18, b: 50 }, H = 380;
    const tinta = papel ? TINTA : TEXTO_PANTALLA, rejilla = papel ? TRAZO_EN_PAPEL : TRAZO_CLARO, superficie = papel ? '#ffffff' : '#131c2e';
    const color = (/** @type {number} */ s) => { const c = /** @type {{ pantalla: string, papel: string }} */ (CATEGORICA[s % CATEGORICA.length]); return papel ? c.papel : c.pantalla; };
    // la escala vertical: de los límites de los intervalos, con un margen y en marcas redondas
    const valores = series.flatMap(s => s.puntos.flatMap(p => [p.inferior, p.superior, p.media])).filter(Number.isFinite);
    const lo = valores.length ? Math.min(...valores) : 0, hi = valores.length ? Math.max(...valores) : 1, holgura = (hi - lo || Math.abs(hi) || 1) * 0.08;
    const marcas = marcasEje(lo - holgura, hi + holgura), y0 = /** @type {number} */ (marcas[0]), y1 = /** @type {number} */ (marcas[marcas.length - 1]);
    const sy = (/** @type {number} */ v) => H - margen.b - (v - y0) / (y1 - y0) * (H - margen.t - margen.b);
    const ancho = W - margen.l - margen.r, paso = ancho / k, desplazamiento = Math.min(12, paso * 0.09);
    const sx = (/** @type {number} */ j, /** @type {number} */ s) => margen.l + paso * (j + 0.5) + (s - (S - 1) / 2) * desplazamiento;
    const fmt = (/** @type {number} */ v) => numeroFijo(v, decimales);
    const nivelTxt = `${Math.round(nivel * 100)} %`;
    let cuerpo = '';
    // rejilla y eje vertical (recesivos)
    cuerpo += marcas.map(v => `<line x1="${margen.l}" y1="${sy(v).toFixed(1)}" x2="${W - margen.r}" y2="${sy(v).toFixed(1)}" stroke="${rejilla}" stroke-opacity="${papel ? 0.45 : 0.14}" stroke-width="1"/>`
        + `<text x="${margen.l - 8}" y="${(sy(v) + 4).toFixed(1)}" text-anchor="end" fill="${tinta}">${escaparHTML(numeroFijo(v, Math.max(0, -Math.floor(Math.log10(/** @type {number} */ (marcas[1]) - y0)))))}</text>`).join('');
    cuerpo += nombres.map((nom, j) => `<text x="${(margen.l + paso * (j + 0.5)).toFixed(1)}" y="${H - margen.b + 20}" text-anchor="middle" fill="${tinta}">${escaparHTML(nom)}</text>`).join('');
    cuerpo += `<text x="${(margen.l + (W - margen.r)) / 2}" y="${H - 10}" text-anchor="middle" fill="${tinta}" font-weight="600">Medida</text>`;
    cuerpo += `<text transform="translate(16 ${((margen.t + H - margen.b) / 2).toFixed(1)}) rotate(-90)" text-anchor="middle" fill="${tinta}" font-weight="600">${escaparHTML(ejeY)}</text>`;
    // cada serie: sus intervalos, su línea, sus marcadores (con un anillo del color de la superficie) y su descripción
    series.forEach((s, si) => {
        const c = color(si), pts = s.puntos.map((p, j) => ({ ...p, x: sx(j, si) }));
        let barras = '', puntos = '';
        pts.forEach((p, j) => {
            if (Number.isFinite(p.inferior) && Number.isFinite(p.superior)) {
                const a = sy(p.superior), b = sy(p.inferior);
                barras += `<line x1="${p.x.toFixed(1)}" y1="${a.toFixed(1)}" x2="${p.x.toFixed(1)}" y2="${b.toFixed(1)}" stroke="${c}" stroke-width="1.5"/>`
                    + `<line x1="${(p.x - 4).toFixed(1)}" y1="${a.toFixed(1)}" x2="${(p.x + 4).toFixed(1)}" y2="${a.toFixed(1)}" stroke="${c}" stroke-width="1.5"/>`
                    + `<line x1="${(p.x - 4).toFixed(1)}" y1="${b.toFixed(1)}" x2="${(p.x + 4).toFixed(1)}" y2="${b.toFixed(1)}" stroke="${c}" stroke-width="1.5"/>`;
            }
            const desc = `${S > 1 ? `${s.etiqueta} · ` : ''}${nombres[j]}: M = ${fmt(p.media)}, IC ${nivelTxt} [${fmt(p.inferior)}, ${fmt(p.superior)}]`;
            puntos += `<g class="perfil-punto">${marcador(si, p.x, sy(p.media), c, superficie)}<circle cx="${p.x.toFixed(1)}" cy="${sy(p.media).toFixed(1)}" r="13" fill="transparent"><title>${escaparHTML(desc)}</title></circle></g>`;
        });
        const linea = pts.map((p, j) => `${j ? 'L' : 'M'}${p.x.toFixed(1)},${sy(p.media).toFixed(1)}`).join('');
        cuerpo += `<g aria-label="${escaparHTML(s.etiqueta)}">${barras}<path d="${linea}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round"/>${puntos}</g>`;
    });
    // etiquetas directas al final de cada línea (en tinta, con su marcador), sin pisarse
    if (conEtiquetas) {
        const finales = series.map(s => sy(/** @type {PuntoPerfil} */ (s.puntos[s.puntos.length - 1]).media));
        const ys = separarEtiquetas(finales, 15, margen.t + 6, H - margen.b - 4), x = W - margen.r + 14;
        series.forEach((s, si) => { cuerpo += `${marcador(si, x, /** @type {number} */ (ys[si]), color(si), superficie)}<text x="${x + 10}" y="${(/** @type {number} */ (ys[si]) + 4).toFixed(1)}" fill="${tinta}">${escaparHTML(s.etiqueta)}</text>`; });
    }
    // la leyenda, arriba (con dos o más grupos)
    if (conLeyenda) {
        let x = margen.l;
        series.forEach((s, si) => { cuerpo += `${marcador(si, x + 5, 18, color(si), superficie)}<text x="${x + 15}" y="22" fill="${tinta}">${escaparHTML(s.etiqueta)}</text>`; x += 34 + 6.6 * s.etiqueta.length; });
    }
    const etiqueta = `Gráfico de perfil de ${ejeY}: la media de cada medida con su intervalo de confianza del ${nivelTxt} intra sujetos${S > 1 ? `, una línea por grupo (${series.map(s => s.etiqueta).join(', ')})` : ''}`;
    // en la pantalla, sin ancho ni alto escritos: la página invierte los colores de los SVG del Analizador que los llevan (los
    // de d3, dibujados para el papel; footer-toast.css), y este ya trae los suyos para el fondo oscuro. En papel (para pasarlo a
    // PNG), con su tamaño
    const tamano = papel ? `width="${W}" height="${H}"` : `style="width:100%;max-width:${W}px;height:auto;"`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" ${tamano} role="img" aria-label="${escaparHTML(etiqueta)}" font-family="Inter, Segoe UI, system-ui, sans-serif" font-size="12" fill="${tinta}"><rect x="0" y="0" width="${W}" height="${H}" fill="${papel ? '#ffffff' : 'none'}"/>${cuerpo}</svg>`;
    return { svg, ancho: W, alto: H };
}
