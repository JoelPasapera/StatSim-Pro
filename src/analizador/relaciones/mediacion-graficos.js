// @ts-check
// analizador/relaciones/mediacion-graficos.js — (2027.01.17) los dos dibujos de la mediación y la moderación: el diagrama de
// rutas del modelo con sus coeficientes (X abajo a la izquierda, Y abajo a la derecha, los mediadores arriba —en columna si
// van en paralelo, en fila si van en serie— y el moderador con su flecha hacia el camino que modera) y, en la moderación, el
// gráfico de las pendientes simples (Y predicha frente a X en los valores de W). En la paleta categórica validada de
// graficos-en-papel.js y en los colores de la pantalla oscura o del papel. Sin DOM: devuelven el SVG.
import { CATEGORICA, TINTA, TRAZO_CLARO, TRAZO_EN_PAPEL } from '../graficos-en-papel.js';
import { escaparHTML } from '../../shared/html.js';
import { numeroFijo, numeroConMenos } from '../../shared/formato-numero.js';
import { marcasEje, marcador, separarEtiquetas } from '../relacionadas/grafico.js';

const TEXTO_PANTALLA = '#cbd5e1';
/** @param {boolean} papel */
const colores = papel => ({ tinta: papel ? TINTA : TEXTO_PANTALLA, rejilla: papel ? TRAZO_EN_PAPEL : TRAZO_CLARO, superficie: papel ? '#ffffff' : '#131c2e' });
/** El atributo de tamaño: en la pantalla sin ancho escrito (la página invierte los SVG del Analizador que lo llevan). @param {boolean} papel @param {number} W @param {number} H */
const tamano = (papel, W, H) => (papel ? `width="${W}" height="${H}"` : `style="width:100%;max-width:${W}px;height:auto;"`);
/** Un texto recortado a n caracteres. @param {string} t @param {number} n */
const corto = (t, n) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/**
 * Una flecha de (x1, y1) a (x2, y2), con su etiqueta a un lado de la línea (sin pisarla): a la izquierda según se avanza (por
 * encima de una flecha que va hacia la derecha), en la fracción t del recorrido.
 * @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2
 * @param {string} etiqueta
 * @param {{ tinta: string, superficie: string }} c
 * @param {number} [desplazamiento] cuánto se aparta la etiqueta de la línea (negativo: al otro lado)
 * @param {number} [t] dónde va la etiqueta (0, el origen; 1, la punta)
 */
function flecha(x1, y1, x2, y2, etiqueta, c, desplazamiento = 10, t = 0.5) {
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    const px = x2 - ux * 9, py = y2 - uy * 9, nx = -uy * 4.5, ny = ux * 4.5;
    // la normal (uy, −ux) («arriba» de una flecha hacia la derecha), con el signo del desplazamiento; el texto crece hacia ese
    // lado (alineado por su final si la normal apunta a la izquierda, por su principio si a la derecha): así no pisa la línea
    const s = Math.sign(desplazamiento) || 1, nX = uy * s, nY = -ux * s, d = Math.abs(desplazamiento);
    const mx = x1 + dx * t + nX * d, my = y1 + dy * t + nY * d;
    const ancla = nX < -0.3 ? 'end' : nX > 0.3 ? 'start' : 'middle', bajo = nY > 0.3 ? 10 : nY < -0.3 ? -2 : 4;
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${px.toFixed(1)}" y2="${py.toFixed(1)}" stroke="${c.tinta}" stroke-width="1.6"/>`
        + `<polygon points="${x2.toFixed(1)},${y2.toFixed(1)} ${(px + nx).toFixed(1)},${(py + ny).toFixed(1)} ${(px - nx).toFixed(1)},${(py - ny).toFixed(1)}" fill="${c.tinta}"/>`
        + (etiqueta ? `<text x="${mx.toFixed(1)}" y="${(my + bajo).toFixed(1)}" text-anchor="${ancla}" fill="${c.tinta}" stroke="${c.superficie}" stroke-width="4" paint-order="stroke">${escaparHTML(etiqueta)}</text>` : '');
}

/**
 * El punto del borde de una caja (centro cx, cy; medio ancho a, medio alto b) en la dirección de (tx, ty).
 * @param {number} cx @param {number} cy @param {number} a @param {number} b @param {number} tx @param {number} ty
 */
function borde(cx, cy, a, b, tx, ty) {
    const dx = tx - cx, dy = ty - cy;
    if (dx === 0 && dy === 0) return [cx, cy];
    const s = Math.min(Math.abs(dx) > 0 ? a / Math.abs(dx) : Infinity, Math.abs(dy) > 0 ? b / Math.abs(dy) : Infinity);
    return [cx + dx * s, cy + dy * s];
}

/**
 * El diagrama de rutas de un modelo con sus coeficientes no estandarizados (con * si su p es menor que α).
 * @param {any} R el resultado de analizarProceso
 * @param {{ x: string, y: string, m: string[], w: string | null }} nombres
 * @param {{ papel?: boolean, alfa?: number }} [opciones]
 * @returns {{ svg: string, ancho: number, alto: number }}
 */
export function diagramaRutas(R, nombres, { papel = false, alfa = 0.05 } = {}) {
    const c = colores(papel), W = 640, k = nombres.m.length, serie = R.modelo === 6;
    const cajaA = 74, cajaB = 20;
    const H = 300;
    const X = { x: 90, y: H - 50 }, Y = { x: W - 90, y: H - 50 };
    // los mediadores, en una fila arriba (en paralelo y en serie): con cuatro, a lo ancho de todo el dibujo
    /** @type {{ x: number, y: number }[]} */
    const Ms = nombres.m.map((_, j) => ({ x: k === 1 ? W / 2 : W * (j + 0.5) / k, y: serie && k > 2 ? 90 : 70 }));
    const Wp = R.modelo === 1 ? { x: W / 2, y: 60 } : R.modelo === 7 ? { x: 100, y: 50 } : { x: W - 100, y: 50 };
    /** el coeficiente de un predictor en una ecuación, con su asterisco @param {string} dep @param {string} pred */
    const b = (dep, pred) => {
        const e = R.ecuaciones.find((/** @type {any} */ q) => q.dependiente === dep), i = e ? e.predictores.indexOf(pred) : -1;
        return i < 0 ? '' : `${numeroConMenos(e.beta[i], 2)}${e.pValores[i] < alfa ? '*' : ''}`;
    };
    let cuerpo = '';
    const caja = (/** @type {{ x: number, y: number }} */ p, /** @type {string} */ t, /** @type {string} */ rol, /** @type {number} */ s) => {
        const col = /** @type {{ pantalla: string, papel: string }} */ (CATEGORICA[s % CATEGORICA.length]);
        return `<g><rect x="${p.x - cajaA}" y="${p.y - cajaB}" width="${2 * cajaA}" height="${2 * cajaB}" rx="6" fill="${c.superficie}" stroke="${papel ? col.papel : col.pantalla}" stroke-width="2"/>`
            + `<text x="${p.x}" y="${p.y - 3}" text-anchor="middle" fill="${c.tinta}" font-weight="600">${escaparHTML(corto(t, 22))}</text><text x="${p.x}" y="${p.y + 12}" text-anchor="middle" fill="${c.tinta}" font-size="10">${rol}</text></g>`;
    };
    const conecta = (/** @type {{ x: number, y: number }} */ p, /** @type {{ x: number, y: number }} */ q, /** @type {string} */ et, /** @type {number} */ d = 10, /** @type {number} */ t = 0.5) => {
        const [x1, y1] = borde(p.x, p.y, cajaA, cajaB, q.x, q.y), [x2, y2] = borde(q.x, q.y, cajaA, cajaB, p.x, p.y);
        return flecha(x1, y1, x2, y2, et, c, d, t);
    };
    if (R.modelo === 1) {
        const [x1, y1] = borde(X.x, X.y, cajaA, cajaB, Y.x, Y.y), [x2, y2] = borde(Y.x, Y.y, cajaA, cajaB, X.x, X.y);
        cuerpo += flecha(x1, y1, x2, y2, `b1 = ${b('Y', 'X')}`, c, 12, 0.3);
        const mid = { x: (X.x + Y.x) / 2, y: X.y };
        cuerpo += flecha(Wp.x, Wp.y + cajaB, mid.x, mid.y - 3, `b3 = ${b('Y', 'X·W')} (interacción)`, c, -12, 0.55);
        cuerpo += `<text x="${Wp.x + cajaA + 10}" y="${Wp.y + 4}" fill="${c.tinta}">${escaparHTML(`b2 = ${b('Y', 'W')} (efecto de W)`)}</text>`;
        cuerpo += caja(X, nombres.x, 'X', 0) + caja(Y, nombres.y, 'Y', 1) + caja(Wp, /** @type {string} */ (nombres.w), 'W (moderador)', 2);
    } else {
        // los caminos a (X → M), d (entre mediadores, en serie) y b (M → Y), y el directo c′
        // las etiquetas de a, cerca de X, y las de b, cerca de Y: lejos de los cruces (en el centro) y de la flecha del moderador
        Ms.forEach((m, j) => {
            cuerpo += conecta(X, m, `a${k > 1 ? j + 1 : ''} = ${b(`M${j + 1}`, 'X')}`, 8, R.modelo === 7 ? 0.25 : 0.35);
            cuerpo += conecta(m, Y, `b${k > 1 ? j + 1 : ''} = ${b('Y', `M${j + 1}`)}`, 8, R.modelo === 14 ? 0.78 : 0.65);
        });
        if (serie) for (let j = 1; j < k; j++) for (let i = 0; i < j; i++) {
            const p = /** @type {{ x: number, y: number }} */ (Ms[i]), qd = /** @type {{ x: number, y: number }} */ (Ms[j]);
            cuerpo += j - i === 1 ? conecta(p, qd, `d${j + 1}${i + 1} = ${b(`M${j + 1}`, `M${i + 1}`)}`, 12)
                : `<path d="M${p.x},${p.y - cajaB} C${p.x},${p.y - 60} ${qd.x},${qd.y - 60} ${qd.x},${qd.y - cajaB - 8}" fill="none" stroke="${c.tinta}" stroke-width="1.6"/><polygon points="${qd.x},${qd.y - cajaB} ${qd.x - 4.5},${qd.y - cajaB - 9} ${qd.x + 4.5},${qd.y - cajaB - 9}" fill="${c.tinta}"/><text x="${(p.x + qd.x) / 2}" y="${p.y - 50}" text-anchor="middle" fill="${c.tinta}">${escaparHTML(`d${j + 1}${i + 1} = ${b(`M${j + 1}`, `M${i + 1}`)}`)}</text>`;
        }
        cuerpo += conecta(X, Y, `c′ = ${b('Y', 'X')}`, 12);
        if (R.modelo === 7 || R.modelo === 14) {
            // el moderador apunta al camino que modera (X → M en el 7; M → Y en el 14), con el coeficiente de la interacción
            const m = /** @type {{ x: number, y: number }} */ (Ms[0]), destino = R.modelo === 7 ? X : Y;
            const mid = { x: (m.x + destino.x) / 2, y: (m.y + destino.y) / 2 };
            cuerpo += flecha(Wp.x, Wp.y + cajaB, mid.x, mid.y, R.modelo === 7 ? `a3 = ${b('M1', 'X·W')}` : `b3 = ${b('Y', 'M·W')}`, c, R.modelo === 7 ? -8 : 8, 0.45);
            cuerpo += caja(Wp, /** @type {string} */ (nombres.w), 'W (moderador)', 2 + k);
        }
        cuerpo += caja(X, nombres.x, 'X', 0) + caja(Y, nombres.y, 'Y', 1) + Ms.map((m, j) => caja(m, /** @type {string} */ (nombres.m[j]), `M${k > 1 ? j + 1 : ''} (mediador)`, 2 + j)).join('');
    }
    const etiqueta = `Diagrama de rutas del ${R.modelo === 1 ? 'modelo de moderación' : `modelo ${R.modelo}`} con sus coeficientes no estandarizados`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" ${tamano(papel, W, H)} role="img" aria-label="${escaparHTML(etiqueta)}" font-family="Inter, Segoe UI, system-ui, sans-serif" font-size="12" fill="${c.tinta}"><rect x="0" y="0" width="${W}" height="${H}" fill="${papel ? '#ffffff' : 'none'}"/>${cuerpo}<text x="${W - 8}" y="${H - 6}" text-anchor="end" font-size="10" fill="${c.tinta}">* p &lt; ${String(alfa).replace(/^0\./, '.')}</text></svg>`;
    return { svg, ancho: W, alto: H };
}

/**
 * Las pendientes simples de una moderación: la Y predicha frente a X (de su media − 1 DE a su media + 1 DE) en cada valor de W,
 * con las covariables en su media.
 * @param {{ b0: number, b1: number, b2: number, b3: number, cov: number }} coef la constante, los coeficientes de X, W y X·W, y
 *   la contribución de las covariables en su media (en la escala del modelo)
 * @param {{ mediaX: number, deX: number, centroX: number, centroW: number, valoresW: number[] }} escala
 * @param {{ x: string, y: string, w: string }} nombres
 * @param {{ papel?: boolean }} [opciones]
 * @returns {{ svg: string, ancho: number, alto: number }}
 */
export function graficoPendientes(coef, escala, nombres, { papel = false } = {}) {
    const c = colores(papel), W = 640, H = 360, m = { l: 64, r: 150, t: 22, b: 50 };
    const xs = [escala.mediaX - escala.deX, escala.mediaX + escala.deX];
    const pred = (/** @type {number} */ x, /** @type {number} */ w) => { const xm = x - escala.centroX, wm = w - escala.centroW; return coef.b0 + coef.b1 * xm + coef.b2 * wm + coef.b3 * xm * wm + coef.cov; };
    const lineas = escala.valoresW.map(w => xs.map(x => pred(x, w)));
    const todos = lineas.flat(), marcas = marcasEje(Math.min(...todos), Math.max(...todos));
    const y0 = /** @type {number} */ (marcas[0]), y1 = /** @type {number} */ (marcas[marcas.length - 1]);
    const sy = (/** @type {number} */ v) => H - m.b - (v - y0) / (y1 - y0) * (H - m.t - m.b);
    const sx = (/** @type {number} */ x) => m.l + (x - /** @type {number} */ (xs[0])) / (/** @type {number} */ (xs[1]) - /** @type {number} */ (xs[0])) * (W - m.l - m.r);
    const dec = Math.max(0, -Math.floor(Math.log10(/** @type {number} */ (marcas[1]) - y0)));
    let cuerpo = marcas.map(v => `<line x1="${m.l}" y1="${sy(v).toFixed(1)}" x2="${W - m.r}" y2="${sy(v).toFixed(1)}" stroke="${c.rejilla}" stroke-opacity="${papel ? 0.45 : 0.14}"/><text x="${m.l - 8}" y="${(sy(v) + 4).toFixed(1)}" text-anchor="end" fill="${c.tinta}">${numeroFijo(v, dec)}</text>`).join('');
    cuerpo += xs.map((x, i) => `<text x="${sx(x).toFixed(1)}" y="${H - m.b + 18}" text-anchor="${i ? 'end' : 'start'}" fill="${c.tinta}">${i ? 'M + 1 DE' : 'M − 1 DE'} (${numeroConMenos(x, 2)})</text>`).join('');
    cuerpo += `<text x="${(m.l + W - m.r) / 2}" y="${H - 10}" text-anchor="middle" fill="${c.tinta}" font-weight="600">${escaparHTML(nombres.x)}</text>`;
    cuerpo += `<text transform="translate(16 ${((m.t + H - m.b) / 2).toFixed(1)}) rotate(-90)" text-anchor="middle" fill="${c.tinta}" font-weight="600">${escaparHTML(`${nombres.y} (predicha)`)}</text>`;
    const finales = lineas.map(l => sy(/** @type {number} */ (l[1])));
    const ys = separarEtiquetas(finales, 15, m.t + 6, H - m.b - 4);
    lineas.forEach((l, s) => {
        const col = /** @type {{ pantalla: string, papel: string }} */ (CATEGORICA[s % CATEGORICA.length]), color = papel ? col.papel : col.pantalla;
        const [a, b] = l.map(v => sy(/** @type {number} */ (v)));
        cuerpo += `<line x1="${sx(/** @type {number} */ (xs[0])).toFixed(1)}" y1="${/** @type {number} */ (a).toFixed(1)}" x2="${sx(/** @type {number} */ (xs[1])).toFixed(1)}" y2="${/** @type {number} */ (b).toFixed(1)}" stroke="${color}" stroke-width="2"/>`;
        cuerpo += marcador(s, sx(/** @type {number} */ (xs[0])), /** @type {number} */ (a), color, c.superficie) + marcador(s, sx(/** @type {number} */ (xs[1])), /** @type {number} */ (b), color, c.superficie);
        // la etiqueta directa: el valor de W (con su percentil si son los de PROCESS); el nombre de W va encima, una vez
        const valor = numeroConMenos(/** @type {number} */ (escala.valoresW[s]), 2), et = escala.valoresW.length === 3 ? `P${[16, 50, 84][s]}: ${valor}` : valor;
        cuerpo += `${marcador(s, W - m.r + 14, /** @type {number} */ (ys[s]), color, c.superficie)}<text x="${W - m.r + 24}" y="${(/** @type {number} */ (ys[s]) + 4).toFixed(1)}" fill="${c.tinta}">${escaparHTML(et)}</text>`;
    });
    cuerpo += `<text x="${W - m.r + 8}" y="${m.t - 6}" fill="${c.tinta}" font-weight="600">${escaparHTML(corto(nombres.w, 22))}</text>`;
    const etiqueta = `Pendientes simples: ${nombres.y} predicha frente a ${nombres.x} en ${escala.valoresW.length} valores de ${nombres.w}`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" ${tamano(papel, W, H)} role="img" aria-label="${escaparHTML(etiqueta)}" font-family="Inter, Segoe UI, system-ui, sans-serif" font-size="12" fill="${c.tinta}"><rect x="0" y="0" width="${W}" height="${H}" fill="${papel ? '#ffffff' : 'none'}"/>${cuerpo}</svg>`;
    return { svg, ancho: W, alto: H };
}
