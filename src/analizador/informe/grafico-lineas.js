// @ts-check
// analizador/informe/grafico-lineas.js — (2027.01.18) un gráfico de líneas de x e y (la curva de potencia, la curva ROC):
// una o más series con la paleta categórica validada de graficos-en-papel.js en su orden fijo, líneas de referencia
// discontinuas (la potencia deseada, la diagonal del azar), puntos destacados con su etiqueta directa y la descripción de
// cada punto en su <title> (la ventana que sale al pasar el ratón). Con dos o más series, leyenda arriba y la identidad
// también por la forma del marcador de sus puntos destacados. Para la pantalla oscura o para el papel (el Word): en la
// pantalla, sin ancho ni alto escritos (la página invierte los SVG del Analizador que los llevan). Sin DOM: devuelve el SVG.
import { CATEGORICA, TINTA, TRAZO_CLARO, TRAZO_EN_PAPEL } from '../graficos-en-papel.js';
import { marcasEje, marcador, separarEtiquetas } from '../relacionadas/grafico.js';
import { escaparHTML } from '../../shared/html.js';
import { numeroFijo } from '../../shared/formato-numero.js';

/** El texto claro de la pantalla (impresion.css lo pasa a tinta al imprimir). */
const TEXTO_PANTALLA = '#cbd5e1';

/**
 * @typedef {{ etiqueta: string, puntos: { x: number, y: number, descripcion?: string }[], escalonada?: boolean }} SerieLineas
 * @typedef {{ tipo: 'h' | 'v' | 'diagonal', valor?: number, etiqueta?: string }} Referencia
 * @typedef {{ x: number, y: number, etiqueta: string, serie?: number, lado?: 'derecha' | 'izquierda', vertical?: 'arriba' | 'abajo' }} Destacado
 *   lado y vertical: dónde va su etiqueta respecto del punto (por defecto, hacia el centro del dibujo y arriba): donde la curva no pasa
 * @typedef {{ titulo: string, min?: number, max?: number, decimales?: number }} Eje
 */

/**
 * El gráfico.
 * @param {{ series: SerieLineas[], ejeX: Eje, ejeY: Eje, referencias?: Referencia[], destacados?: Destacado[], descripcion: string,
 *   papel?: boolean, cuadrado?: boolean }} opciones cuadrado: el área del dibujo, cuadrada (la curva ROC)
 * @returns {{ svg: string, ancho: number, alto: number }}
 */
export function graficoLineas({ series, ejeX, ejeY, referencias = [], destacados = [], descripcion, papel = false, cuadrado = false }) {
    const S = series.length, conLeyenda = S >= 2;
    const margen = { l: 64, r: 28, t: conLeyenda ? 40 : 20, b: 52 };
    const W = cuadrado ? 480 : 640, H = cuadrado ? 480 - margen.l - margen.r + margen.t + margen.b : 380;
    const tinta = papel ? TINTA : TEXTO_PANTALLA, rejilla = papel ? TRAZO_EN_PAPEL : TRAZO_CLARO, superficie = papel ? '#ffffff' : '#131c2e';
    const color = (/** @type {number} */ s) => { const c = /** @type {{ pantalla: string, papel: string }} */ (CATEGORICA[s % CATEGORICA.length]); return papel ? c.papel : c.pantalla; };
    const xs = series.flatMap(s => s.puntos.map(p => p.x)), ys = series.flatMap(s => s.puntos.map(p => p.y));
    const mx = marcasEje(ejeX.min ?? Math.min(...xs), ejeX.max ?? Math.max(...xs)), my = marcasEje(ejeY.min ?? Math.min(...ys), ejeY.max ?? Math.max(...ys));
    const x0 = ejeX.min ?? /** @type {number} */ (mx[0]), x1 = ejeX.max ?? /** @type {number} */ (mx[mx.length - 1]);
    const y0 = ejeY.min ?? /** @type {number} */ (my[0]), y1 = ejeY.max ?? /** @type {number} */ (my[my.length - 1]);
    const sx = (/** @type {number} */ v) => margen.l + (v - x0) / (x1 - x0) * (W - margen.l - margen.r);
    const sy = (/** @type {number} */ v) => H - margen.b - (v - y0) / (y1 - y0) * (H - margen.t - margen.b);
    const dentro = (/** @type {number} */ v, /** @type {number} */ a, /** @type {number} */ b) => v >= a - 1e-9 && v <= b + 1e-9;
    const fx = (/** @type {number} */ v) => numeroFijo(v, ejeX.decimales ?? Math.max(0, -Math.floor(Math.log10(Math.abs(/** @type {number} */ (mx[1]) - /** @type {number} */ (mx[0])) || 1))));
    const fy = (/** @type {number} */ v) => numeroFijo(v, ejeY.decimales ?? Math.max(0, -Math.floor(Math.log10(Math.abs(/** @type {number} */ (my[1]) - /** @type {number} */ (my[0])) || 1))));
    let cuerpo = '';
    // rejilla y ejes (recesivos)
    cuerpo += my.filter(v => dentro(v, y0, y1)).map(v => `<line x1="${margen.l}" y1="${sy(v).toFixed(1)}" x2="${W - margen.r}" y2="${sy(v).toFixed(1)}" stroke="${rejilla}" stroke-opacity="${papel ? 0.45 : 0.14}" stroke-width="1"/><text x="${margen.l - 8}" y="${(sy(v) + 4).toFixed(1)}" text-anchor="end" fill="${tinta}">${escaparHTML(fy(v))}</text>`).join('');
    cuerpo += mx.filter(v => dentro(v, x0, x1)).map(v => `<line x1="${sx(v).toFixed(1)}" y1="${H - margen.b}" x2="${sx(v).toFixed(1)}" y2="${H - margen.b + 5}" stroke="${rejilla}" stroke-width="1"/><text x="${sx(v).toFixed(1)}" y="${H - margen.b + 19}" text-anchor="middle" fill="${tinta}">${escaparHTML(fx(v))}</text>`).join('');
    cuerpo += `<line x1="${margen.l}" y1="${H - margen.b}" x2="${W - margen.r}" y2="${H - margen.b}" stroke="${rejilla}" stroke-width="1"/>`;
    cuerpo += `<text x="${((margen.l + W - margen.r) / 2).toFixed(1)}" y="${H - 10}" text-anchor="middle" fill="${tinta}" font-weight="600">${escaparHTML(ejeX.titulo)}</text>`;
    cuerpo += `<text transform="translate(16 ${((margen.t + H - margen.b) / 2).toFixed(1)}) rotate(-90)" text-anchor="middle" fill="${tinta}" font-weight="600">${escaparHTML(ejeY.titulo)}</text>`;
    // las referencias, discontinuas y en gris
    for (const r of referencias) {
        const trazo = `stroke="${rejilla}" stroke-width="1.5" stroke-dasharray="5 4"`;
        if (r.tipo === 'diagonal') cuerpo += `<line x1="${sx(x0).toFixed(1)}" y1="${sy(y0).toFixed(1)}" x2="${sx(x1).toFixed(1)}" y2="${sy(y1).toFixed(1)}" ${trazo}/>`;
        else if (r.tipo === 'h' && r.valor !== undefined) cuerpo += `<line x1="${margen.l}" y1="${sy(r.valor).toFixed(1)}" x2="${W - margen.r}" y2="${sy(r.valor).toFixed(1)}" ${trazo}/>${r.etiqueta ? `<text x="${W - margen.r - 4}" y="${(sy(r.valor) - 6).toFixed(1)}" text-anchor="end" fill="${tinta}">${escaparHTML(r.etiqueta)}</text>` : ''}`;
        else if (r.tipo === 'v' && r.valor !== undefined) cuerpo += `<line x1="${sx(r.valor).toFixed(1)}" y1="${margen.t}" x2="${sx(r.valor).toFixed(1)}" y2="${H - margen.b}" ${trazo}/>${r.etiqueta ? `<text x="${(sx(r.valor) + 5).toFixed(1)}" y="${margen.t + 12}" fill="${tinta}">${escaparHTML(r.etiqueta)}</text>` : ''}`;
    }
    // las series: la línea (2 px) y, por cada punto, su descripción en un blanco mayor que el trazo
    series.forEach((s, si) => {
        const c = color(si);
        let d = '';
        s.puntos.forEach((p, j) => {
            const X = sx(p.x).toFixed(1), Y = sy(p.y).toFixed(1);
            if (!j) d = `M${X},${Y}`;
            else d += s.escalonada ? `H${X}V${Y}` : `L${X},${Y}`;
        });
        const blancos = s.puntos.filter(p => p.descripcion).map(p => `<circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="7" fill="transparent"><title>${escaparHTML(/** @type {string} */ (p.descripcion))}</title></circle>`).join('');
        cuerpo += `<g aria-label="${escaparHTML(s.etiqueta)}"><path d="${d}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round"/>${blancos}</g>`;
    });
    // los destacados: el marcador de su serie (con un anillo de la superficie) y su etiqueta, sin pisarse
    if (destacados.length) {
        const deseadas = destacados.map(p => (p.vertical === 'abajo' ? sy(p.y) + 18 : sy(p.y) - 10));
        const posiciones = separarEtiquetas(deseadas, 15, margen.t + 10, H - margen.b - 6);
        destacados.forEach((p, i) => {
            const X = sx(p.x), Y = sy(p.y), derecha = p.lado ? p.lado === 'derecha' : X < (margen.l + W - margen.r) / 2;
            cuerpo += `${marcador(p.serie ?? 0, X, Y, color(p.serie ?? 0), superficie)}<text x="${(X + (derecha ? 9 : -9)).toFixed(1)}" y="${(/** @type {number} */ (posiciones[i])).toFixed(1)}" text-anchor="${derecha ? 'start' : 'end'}" fill="${tinta}">${escaparHTML(p.etiqueta)}</text>`;
        });
    }
    if (conLeyenda) {
        let x = margen.l;
        series.forEach((s, si) => { cuerpo += `<line x1="${x}" y1="18" x2="${x + 16}" y2="18" stroke="${color(si)}" stroke-width="2"/><text x="${x + 21}" y="22" fill="${tinta}">${escaparHTML(s.etiqueta)}</text>`; x += 40 + 6.6 * s.etiqueta.length; });
    }
    const tamano = papel ? `width="${W}" height="${H}"` : `style="width:100%;max-width:${W}px;height:auto;"`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" ${tamano} role="img" aria-label="${escaparHTML(descripcion)}" font-family="Inter, Segoe UI, system-ui, sans-serif" font-size="12" fill="${tinta}"><rect x="0" y="0" width="${W}" height="${H}" fill="${papel ? '#ffffff' : 'none'}"/>${cuerpo}</svg>`;
    return { svg, ancho: W, alto: H };
}
