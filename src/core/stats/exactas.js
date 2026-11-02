// @ts-check
// core/stats/exactas.js — (2027.01.17) la prueba exacta de Fisher (1935; Freeman y Halton, 1951, para tablas r × c) de la
// independencia de dos variables categóricas: condicionada a los totales de las filas y las columnas, la probabilidad
// hipergeométrica de cada tabla posible; el p bilateral, la suma de las de las tablas tan probables o menos que la observada
// (con la tolerancia relativa 10⁻⁷ de R, fisher.test, y de SciPy). Hasta la 2027.01.16 la vista del χ² recomendaba la exacta
// cuando había esperadas menores que 5, pero no la calculaba.
//   · las tablas se recorren todas si son pocas (un recorrido en profundidad con las cotas de cada casilla; hasta
//     MAX_TABLAS); si son más, el p se estima por Monte Carlo con B tablas al azar con los mismos totales (barajando la
//     columna de una variable frente a la otra: una permutación al azar da exactamente la distribución condicionada), con
//     p = (1 + nº de tablas tan o menos probables)/(B + 1), el de R con simulate.p.value, y su error típico;
//   · con una tabla 2 × 2, además, los dos p unilaterales y la razón de odds con su intervalo de Woolf (efectos.js).
import { lnGamma } from './especiales.js';
import { barajar } from '../random/permutacion.js';
import { sfc32 } from '../random/sfc32.js';
import { intervaloOddsRatio } from './efectos.js';

/** Hasta cuántas tablas se recorren antes de pasar a Monte Carlo. */
export const MAX_TABLAS = 2_000_000;
/** La tolerancia relativa con que una tabla cuenta como «tan probable» como la observada (la de R y SciPy). */
const TOLERANCIA = 1e-7;

/**
 * Los totales de una tabla.
 * @param {number[][]} tabla
 */
function totales(tabla) {
    const filas = tabla.map(f => f.reduce((a, b) => a + b, 0));
    const columnas = Array.from({ length: /** @type {number[]} */ (tabla[0]).length }, (_, j) => tabla.reduce((s, f) => s + /** @type {number} */ (f[j]), 0));
    return { filas, columnas, n: filas.reduce((a, b) => a + b, 0) };
}

/**
 * ln k! de 0 a n, en una tabla.
 * @param {number} n
 */
function lnFactoriales(n) {
    const t = new Float64Array(n + 1);
    for (let k = 1; k <= n; k++) t[k] = lnGamma(k + 1);
    return t;
}

/**
 * Recorre todas las tablas con los totales dados y suma la probabilidad de las que no son más probables que la observada.
 * null si son más de `maxTablas`.
 * @param {number[]} filas
 * @param {number[]} columnas
 * @param {Float64Array} lnF
 * @param {number} lnUmbral el ln de la probabilidad de la observada, con la tolerancia
 * @param {number} lnConstante Σ ln rᵢ! + Σ ln cⱼ! − ln n!
 * @param {number} maxTablas
 * @returns {{ p: number, tablas: number } | null}
 */
function recorrer(filas, columnas, lnF, lnUmbral, lnConstante, maxTablas) {
    const r = filas.length, c = columnas.length, resto = columnas.slice(), restoFila = filas.slice();
    let p = 0, tablas = 0, demasiadas = false;
    /**
     * @param {number} i la fila
     * @param {number} j la columna
     * @param {number} suma Σ ln nᵢⱼ! de lo ya puesto
     */
    const paso = (i, j, suma) => {
        if (demasiadas) return;
        if (i === r - 1) {
            // la última fila queda fijada por lo que falta de cada columna
            let s = suma;
            for (let k = 0; k < c; k++) s += /** @type {number} */ (lnF[/** @type {number} */ (resto[k])]);
            tablas++;
            if (tablas > maxTablas) { demasiadas = true; return; }
            const ln = lnConstante - s;
            if (ln <= lnUmbral) p += Math.exp(ln);
            return;
        }
        const quedaFila = /** @type {number} */ (restoFila[i]);
        if (j === c - 1) {
            // la última casilla de la fila, fijada
            if (quedaFila > /** @type {number} */ (resto[j])) return;
            resto[j] = /** @type {number} */ (resto[j]) - quedaFila;
            paso(i + 1, 0, suma + /** @type {number} */ (lnF[quedaFila]));
            resto[j] = /** @type {number} */ (resto[j]) + quedaFila;
            return;
        }
        let despues = 0;
        for (let k = j + 1; k < c; k++) despues += /** @type {number} */ (resto[k]);
        const desde = Math.max(0, quedaFila - despues), hasta = Math.min(quedaFila, /** @type {number} */ (resto[j]));
        for (let v = desde; v <= hasta && !demasiadas; v++) {
            resto[j] = /** @type {number} */ (resto[j]) - v; restoFila[i] = quedaFila - v;
            paso(i, j + 1, suma + /** @type {number} */ (lnF[v]));
            resto[j] = /** @type {number} */ (resto[j]) + v; restoFila[i] = quedaFila;
        }
    };
    paso(0, 0, 0);
    return demasiadas ? null : { p: Math.min(1, p), tablas };
}

/**
 * Monte Carlo: B tablas al azar con los mismos totales (la columna de la segunda variable, barajada frente a la primera).
 * @param {number[]} filas
 * @param {number[]} columnas
 * @param {Float64Array} lnF
 * @param {number} lnUmbral
 * @param {number} lnConstante
 * @param {number} B
 * @param {number} semilla
 */
function montecarlo(filas, columnas, lnF, lnUmbral, lnConstante, B, semilla) {
    const r = filas.length, c = columnas.length, n = filas.reduce((a, b) => a + b, 0);
    const deFila = new Int32Array(n), deColumna = new Int32Array(n);
    let k = 0; filas.forEach((f, i) => { for (let t = 0; t < f; t++) deFila[k++] = i; });
    k = 0; columnas.forEach((f, j) => { for (let t = 0; t < f; t++) deColumna[k++] = j; });
    const u = sfc32(semilla).siguiente, cuenta = new Int32Array(r * c);
    let extremas = 0;
    for (let b = 0; b < B; b++) {
        barajar(deColumna, u);
        cuenta.fill(0);
        for (let t = 0; t < n; t++) cuenta[/** @type {number} */ (deFila[t]) * c + /** @type {number} */ (deColumna[t])]++;
        let s = 0;
        for (let t = 0; t < r * c; t++) s += /** @type {number} */ (lnF[/** @type {number} */ (cuenta[t])]);
        if (lnConstante - s <= lnUmbral) extremas++;
    }
    const p = (1 + extremas) / (B + 1);
    return { p, ee: Math.sqrt(p * (1 - p) / B) };
}

/**
 * La prueba exacta de Fisher de una tabla r × c de frecuencias (enteros ≥ 0; las filas y columnas vacías se quitan).
 * @param {number[][]} tabla
 * @param {{ maxTablas?: number, B?: number, semilla?: number }} [opciones] maxTablas: hasta cuántas tablas se recorren
 *   (MAX_TABLAS); B y semilla: las del Monte Carlo si son más (10 000 y 2027)
 * @returns {{ pValor: number, metodo: 'exacta' | 'montecarlo', tablas: number | null, B: number | null, semilla: number | null,
 *   ee: number | null, probabilidadObservada: number, dosPorDos: null | { pMenor: number, pMayor: number, or: number,
 *   inferior: number, superior: number, corregida: boolean } }}
 */
export function fisherExacta(tabla, { maxTablas = MAX_TABLAS, B = 10000, semilla = 2027 } = {}) {
    // sin filas ni columnas vacías (no cambian el p y alargan el recorrido)
    const t0 = totales(tabla);
    const T = tabla.filter((_, i) => /** @type {number} */ (t0.filas[i]) > 0).map(f => f.filter((_, j) => /** @type {number} */ (t0.columnas[j]) > 0));
    const { filas, columnas, n } = totales(T);
    const lnF = lnFactoriales(n);
    const lnConstante = filas.reduce((s, x) => s + /** @type {number} */ (lnF[x]), 0) + columnas.reduce((s, x) => s + /** @type {number} */ (lnF[x]), 0) - /** @type {number} */ (lnF[n]);
    const lnObservada = lnConstante - T.reduce((s, f) => s + f.reduce((q, x) => q + /** @type {number} */ (lnF[x]), 0), 0);
    const lnUmbral = lnObservada + Math.log1p(TOLERANCIA);
    const r = filas.length, c = columnas.length;
    /** @type {ReturnType<typeof fisherExacta>['dosPorDos']} */
    let dosPorDos = null;
    if (tabla.length === 2 && /** @type {number[]} */ (tabla[0]).length === 2) {
        // los unilaterales, por la hipergeométrica de la casilla (1, 1) con los totales fijos
        const [[a, b], [cc, d]] = /** @type {[[number, number], [number, number]]} */ (tabla);
        const r1 = a + b, c1 = a + cc, nn = a + b + cc + d, lnF2 = lnFactoriales(nn);
        const lnP = (/** @type {number} */ x) => /** @type {number} */ (lnF2[r1]) + /** @type {number} */ (lnF2[nn - r1]) + /** @type {number} */ (lnF2[c1]) + /** @type {number} */ (lnF2[nn - c1]) - /** @type {number} */ (lnF2[nn]) - /** @type {number} */ (lnF2[x]) - /** @type {number} */ (lnF2[r1 - x]) - /** @type {number} */ (lnF2[c1 - x]) - /** @type {number} */ (lnF2[nn - r1 - c1 + x]);
        const desde = Math.max(0, r1 + c1 - nn), hasta = Math.min(r1, c1);
        let menor = 0, mayor = 0;
        for (let x = desde; x <= hasta; x++) { const p = Math.exp(lnP(x)); if (x <= a) menor += p; if (x >= a) mayor += p; }
        const or = intervaloOddsRatio(a, b, cc, d);
        dosPorDos = { pMenor: Math.min(1, menor), pMayor: Math.min(1, mayor), or: or.or, inferior: or.inferior, superior: or.superior, corregida: or.corregida };
    }
    if (r < 2 || c < 2) return { pValor: 1, metodo: 'exacta', tablas: 1, B: null, semilla: null, ee: null, probabilidadObservada: 1, dosPorDos };
    const exacta = recorrer(filas, columnas, lnF, lnUmbral, lnConstante, maxTablas);
    if (exacta) return { pValor: exacta.p, metodo: 'exacta', tablas: exacta.tablas, B: null, semilla: null, ee: null, probabilidadObservada: Math.exp(lnObservada), dosPorDos };
    const mc = montecarlo(filas, columnas, lnF, lnUmbral, lnConstante, B, semilla);
    return { pValor: mc.p, metodo: 'montecarlo', tablas: null, B, semilla, ee: mc.ee, probabilidadObservada: Math.exp(lnObservada), dosPorDos };
}

/**
 * Los residuos tipificados corregidos de Haberman (1973) de una tabla: (o − e)/√(e·(1 − rᵢ/n)·(1 − cⱼ/n)), normales
 * estándar bajo la independencia; los de las casillas que más se apartan de ella. NaN donde la esperada es 0.
 * @param {number[][]} observadas
 * @returns {number[][]}
 */
export function residuosCorregidos(observadas) {
    const { filas, columnas, n } = totales(observadas);
    return observadas.map((f, i) => f.map((o, j) => {
        const ri = /** @type {number} */ (filas[i]), cj = /** @type {number} */ (columnas[j]), e = ri * cj / n;
        const v = e * (1 - ri / n) * (1 - cj / n);
        return v > 0 ? (o - e) / Math.sqrt(v) : NaN;
    }));
}

/**
 * (2027.01.20, revisión) La exacta de Fisher solo si sus tablas se pueden enumerar (hasta `maxTablas`; unas decenas de
 * milisegundos), sin Monte Carlo: null si son más. Es la comprobación de la χ² cuando ya es válida (todas las esperadas ≥ 5),
 * que no compensa el Monte Carlo de una tabla grande (de medio segundo a dos).
 * @param {number[][]} tabla
 * @param {number} [maxTablas]
 * @returns {ReturnType<typeof fisherExacta> | null}
 */
export function fisherSiEnumerable(tabla, maxTablas = 200_000) {
    const r = fisherExacta(tabla, { maxTablas, B: 0 });
    return r.metodo === 'exacta' ? r : null;
}
