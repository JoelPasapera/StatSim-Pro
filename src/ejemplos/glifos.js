// @ts-check
// ejemplos/glifos.js — (2027.01.02) el dibujo pequeño de cada diseño de investigación en las tarjetas de la pestaña
// «Ejemplos», como los diagramas de rutas de un capítulo de resultados: dos variables unidas (correlacional), grupos que se
// comparan (comparativo), predictores que apuntan a un desenlace (predictivo), un factor con sus ítems (instrumental) y una
// mediación (explicativo, SEM). Es decoración que informa: se reconoce el diseño de un vistazo; para un lector de pantalla
// lo dice el texto de la tarjeta (aria-hidden). Un diseño que no está aquí, sin dibujo. Sin DOM.

/** Un número con un decimal. @param {number} n */
const f = n => n.toFixed(1);

/** Un nodo (una variable). @param {number} x @param {number} y @param {number} r */
const nodo = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}"/>`;

/**
 * Una flecha del borde de un nodo al de otro, con su punta.
 * @param {number} x1 @param {number} y1 @param {number} r1 el nodo de salida
 * @param {number} x2 @param {number} y2 @param {number} r2 el de llegada
 */
function flecha(x1, y1, r1, x2, y2, r2) {
    const l = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / l, uy = (y2 - y1) / l;
    const px = x2 - ux * r2, py = y2 - uy * r2;   // la punta, en el borde del de llegada
    const bx = px - ux * 4.5, by = py - uy * 4.5;   // donde empieza la punta
    return `<line x1="${f(x1 + ux * r1)}" y1="${f(y1 + uy * r1)}" x2="${f(bx)}" y2="${f(by)}"/>`
        + `<polygon points="${f(px)},${f(py)} ${f(bx - uy * 2.4)},${f(by + ux * 2.4)} ${f(bx + uy * 2.4)},${f(by - ux * 2.4)}"/>`;
}

/** Los dibujos, por el diseño que nombra la tarjeta (el primero que encaja). @type {Array<[RegExp, string]>} */
const DIBUJOS = [
    [/correlacional/i, `<line x1="17" y1="20" x2="47" y2="20"/>${nodo(11, 20, 6)}${nodo(53, 20, 6)}`],
    [/comparativo/i, '<rect x="10" y="20" width="11" height="16" rx="2"/><rect x="26.5" y="8" width="11" height="28" rx="2"/><rect x="43" y="15" width="11" height="21" rx="2"/>'],
    [/predictivo/i, `${flecha(10, 10, 5, 53, 20, 6)}${flecha(10, 30, 5, 53, 20, 6)}${nodo(10, 10, 5)}${nodo(10, 30, 5)}${nodo(53, 20, 6)}`],
    [/instrumental|psicom/i, `${[9, 24, 39, 54].map(x => flecha(32, 9, 7, x, 31, 4.6)).join('')}${nodo(32, 9, 7)}${[9, 24, 39, 54].map(x => `<rect x="${x - 4}" y="27" width="8" height="8" rx="1.5"/>`).join('')}`],
    [/explicativo|estructural|\bsem\b/i, `${flecha(10, 30, 5.5, 32, 10, 5.5)}${flecha(32, 10, 5.5, 54, 30, 5.5)}${flecha(10, 30, 5.5, 54, 30, 5.5)}${nodo(10, 30, 5.5)}${nodo(32, 10, 5.5)}${nodo(54, 30, 5.5)}`],
];

/**
 * El dibujo de un diseño, en SVG ('' si no hay uno para él).
 * @param {string} diseno el de la tarjeta («Correlacional», «Explicativo (SEM)»…)
 * @returns {string}
 */
export function glifoDelDiseno(diseno) {
    const d = DIBUJOS.find(([re]) => re.test(diseno));
    return d ? `<svg class="ejemplo-glifo" viewBox="0 0 64 40" width="64" height="40" aria-hidden="true" focusable="false">${d[1]}</svg>` : '';
}
