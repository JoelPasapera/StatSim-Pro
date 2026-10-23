// @ts-check
// shared/formato-numero.js — (2026.12.22) el valor de un estadístico para mostrar: con sus decimales si es finito, «∞» o
// «−∞» si es infinito y «—» si no está definido. Dos grupos constantes y distintos dan t, F y d infinitos (la diferencia es
// perfecta: p = 0); hasta la 2026.12.21 la vista principal los mostraba como 0, como si no hubiera diferencia, y la pestaña
// de grupos como «—». Sin dependencias ni DOM.
// (2026.12.30) Y el p de una prueba (formatoP, pConSigno, textoP): todas las vistas, el Word y las redacciones lo
// mostraban con su propia copia de «tres decimales, sin el cero inicial, < .001»; ahora, una sola, que además no deja que el
// redondeo contradiga la decisión (véase redondeoP).

/**
 * @param {number} v
 * @param {number} [decimales] 2 por omisión
 * @returns {string}
 */
export function formatoNumero(v, decimales = 2) {
    if (Number.isFinite(v)) return v.toFixed(decimales);
    return v === Infinity ? '∞' : v === -Infinity ? '−∞' : '—';
}

/**
 * (2027.01.01, revisión) Un número con el signo menos tipográfico («−2.700»), el mismo de los términos que siguen
 * (terminoConSigno): el primer término de «ŷ = −2.700 − 0.114·x» (antes, «-2.700 − 0.114·x»). Redondeado a cero, sin signo:
 * «0.000», no «-0.000».
 * @param {number} v
 * @param {number} [decimales] 3 por omisión
 * @returns {string}
 */
export function numeroConMenos(v, decimales = 3) {
    if (!Number.isFinite(v)) return formatoNumero(v, decimales);
    const texto = v.toFixed(decimales);
    return Number(texto) < 0 ? `−${texto.slice(1)}` : texto.replace(/^-/, '');
}

/**
 * (2027.01.01) Un término de una ecuación con su signo delante: «+ 0.114·x», «− 0.114·x». Hasta la 2026.12.31, las
 * ecuaciones de la regresión y del diagrama de dispersión escribían «+ -0.114·x». El signo es el del número ya redondeado:
 * −0.0001 con tres decimales es «+ 0.000·x», no «− 0.000·x».
 * @param {number} v
 * @param {string} [sufijo] lo que sigue al número («·x», «·x²», «·ln(x)», «x»)
 * @param {number} [decimales] 3 por omisión
 * @returns {string}
 */
export function terminoConSigno(v, sufijo = '', decimales = 3) {
    if (!Number.isFinite(v)) return v === -Infinity ? `− ∞${sufijo}` : `+ ${formatoNumero(v, decimales)}${sufijo}`;
    const texto = v.toFixed(decimales), negativo = Number(texto) < 0;
    return `${negativo ? '−' : '+'} ${texto.replace(/^-/, '')}${sufijo}`;
}

/**
 * Un estadístico que es entero o semientero, como la U de Mann-Whitney (con empates, los rangos medios la dejan en x.5):
 * «24» o «24.5», sin perder el medio (2026.12.30: la frase APA escribía «U = 25» con U = 24.5, y la tabla, «24.0» con U = 24).
 * Si no es múltiplo de 0.5, con dos decimales.
 * @param {number} v
 * @returns {string}
 */
export function formatoMitades(v) {
    if (!Number.isFinite(v)) return formatoNumero(v);
    return Number.isInteger(v) ? v.toFixed(0) : Number.isInteger(2 * v) ? v.toFixed(1) : v.toFixed(2);
}

/**
 * Los umbrales con que se lee un p además del α del estudio: el p redondeado que se muestra no debe alcanzar uno que el p
 * no alcanza. Las redacciones que no conocen el α del estudio lo respetan así cuando es uno de estos.
 */
const UMBRALES_P = Object.freeze([0.01, 0.05, 0.1]);

/** Los decimales con que se muestra un p: tres (APA) y, si hacen falta para no cruzar un umbral, hasta seis. */
const DECIMALES_P = 3, DECIMALES_P_MAX = 6;

/**
 * De qué lado de un umbral queda x: −1, 0 (sobre él, salvo el ruido del punto flotante) o 1.
 * @param {number} x @param {number} t
 */
const ladoDe = (x, t) => (Math.abs(x - t) <= 1e-9 * t ? 0 : Math.sign(x - t));

/**
 * El p con tres decimales o, si el redondeo lo lleva hasta un umbral de decisión, con los que hagan falta (hasta seis):
 * p = .0496 con tres decimales se mostraría «.050» junto a «significativo, p < α = .05», y el lector ve un .050 que no es
 * menor que .05; p = .0504, «.050» junto a «normal (p > .05)». Aquí, «.0496» y «.0504»: el número mostrado queda del mismo
 * lado de cada umbral que el p, sea la regla «p < α» (las pruebas) o «p > .05» (la normalidad). Un p a menos de una
 * millonésima del umbral se trunca hacia fuera en el sexto decimal; uno sobre el umbral se muestra tal cual («.050»).
 * @param {number} p finito
 * @param {number} [alfa] el α del estudio, si se conoce
 * @returns {string} con el cero inicial
 */
function redondeoP(p, alfa) {
    const umbrales = typeof alfa === 'number' && alfa > 0 && alfa < 1 ? [alfa, ...UMBRALES_P] : UMBRALES_P;
    const concuerda = (/** @type {number} */ mostrado) => umbrales.every(t => {
        const lado = ladoDe(p, t);
        return lado === 0 || ladoDe(mostrado, t) === lado;
    });
    for (let d = DECIMALES_P; d <= DECIMALES_P_MAX; d++) {
        const texto = p.toFixed(d);
        if (concuerda(Number(texto))) return texto;
    }
    const escala = 10 ** DECIMALES_P_MAX, cercano = umbrales.find(t => Math.abs(p - t) < 1 / escala);
    const haciaFuera = cercano !== undefined && p > cercano ? Math.ceil : Math.floor;
    return (haciaFuera(p * escala) / escala).toFixed(DECIMALES_P_MAX);
}

/** @typedef {{ alfa?: number, ceroInicial?: boolean }} OpcionesP */

/**
 * Un p para una tabla, en APA: «.034», «< .001» por debajo de .001 y «—» si no está definido; con `ceroInicial`, «0.034» y
 * «< 0.001» (las redacciones que escriben «α = 0.05»).
 * @param {number} p
 * @param {OpcionesP} [opciones] `alfa`: el α del estudio (además, se respetan .01, .05 y .10)
 * @returns {string}
 */
export function formatoP(p, opciones = {}) {
    if (!Number.isFinite(p)) return '—';
    const { alfa, ceroInicial = false } = opciones;
    const conCero = (/** @type {string} */ t) => (ceroInicial ? t : t.replace(/^0\./, '.'));
    // por debajo de .001, «< .001», salvo que el α del estudio sea aún menor y p no lo alcance
    if (p < 0.001 && !(typeof alfa === 'number' && p >= alfa)) return `< ${conCero('0.001')}`;
    return conCero(redondeoP(p, alfa));
}

/**
 * El p detrás de «p» en una frase: «= .034» o «< .001» («—» si no está definido). Hasta la 2026.12.29, el Word y las
 * vistas de regresión escribían «p .034», sin el signo.
 * @param {number} p
 * @param {OpcionesP} [opciones]
 * @returns {string}
 */
export function pConSigno(p, opciones = {}) {
    const f = formatoP(p, opciones);
    return f === '—' || f.startsWith('<') ? f : `= ${f}`;
}

/**
 * El p en APA dentro de un texto: «p = .034» o «p < .001»; vacío si no está definido.
 * @param {number} p
 * @param {OpcionesP} [opciones]
 * @returns {string}
 */
export function textoP(p, opciones = {}) {
    return Number.isFinite(p) ? `p ${pConSigno(p, opciones)}` : '';
}
