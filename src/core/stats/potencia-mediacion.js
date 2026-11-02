// @ts-check
// core/stats/potencia-mediacion.js — (2027.01.18) la potencia de la mediación simple (X → M → Y) por simulación de Monte
// Carlo, con la prueba de significación conjunta (Cohen y Cohen, 1983; la que recomiendan Fritz y MacKinnon, 2007, por su
// potencia, comparable al bootstrap con corrección de sesgo, y su error de tipo I correcto): el efecto indirecto es
// significativo si lo son a (en M ~ X) y b (en Y ~ X + M). (2027.01.20, revisión) Las rutas, como en Fritz y MacKinnon: X ~ N(0, 1),
// M = aX + e e Y = c′X + bM + e con errores N(0, 1), de modo que .14, .39 y .59 explican el 2, el 13 y el 26 % de la varianza
// (los efectos pequeño, mediano y grande de Cohen) y el tamaño de muestra es el de su Tabla 3 (74 con a = b = .39 y c′ = 0; 36
// con .59). Hasta la 2027.01.19 se generaban estandarizadas (var(e) = 1 − a², …), con las que .39 explica el 15 %, y salían
// 68 y 32: unos coeficientes mayores que los de sus tablas con el mismo nombre. Cada réplica
// tiene su generador (sfc32 con la semilla y su número) y genera sus casos en orden, de modo que la base de n casos es el
// comienzo de la de n + 1: la potencia crece con n sin el ruido de bases distintas, y el tamaño de muestra se busca sobre ella.
// (2027.01.19) Y como cada réplica es independiente, un tramo de réplicas da lo mismo en un Worker que en otro: el servicio
// psicométrico las reparte entre varios (exitosMediacion) y la búsqueda del tamaño de muestra espera cada potencia
// (tamanoMuestraMediacionAsincrono), con la misma búsqueda (busquedaTamano) y los mismos resultados. Sin DOM.
import { sfc32, semillaCadena } from '../random/sfc32.js';
import { generadorNormales } from '../random/normal.js';
import { ajustarMco } from './mco.js';
import { cuantilT } from './distribuciones.js';
import { pasosBiseccion } from './optimizacion.js';

/**
 * ¿Son posibles unas rutas? Con los errores de varianza 1 (no la que queda tras las rutas), cualquier valor finito lo es.
 * @param {number} a
 * @param {number} b
 * @param {number} cp
 */
export function rutasValidas(a, b, cp) { return [a, b, cp].every(Number.isFinite); }

/**
 * La proporción de la varianza de M que explica X con una ruta a (y la de Y que explica M, a igual X, con b): a²/(a² + 1).
 * @param {number} ruta
 */
export function varianzaExplicada(ruta) { return ruta * ruta / (ruta * ruta + 1); }

/**
 * Una réplica: los n primeros casos de su generador, y si a y b son significativos.
 * @param {number} a @param {number} b @param {number} cp @param {number} n @param {number} semilla @param {number} r @param {number} tc1 @param {number} tc2
 */
function replica(a, b, cp, n, semilla, r, tc1, tc2) {
    const g = sfc32(semillaCadena(semilla, r)), normal = generadorNormales(g.siguiente);
    const X = new Float64Array(n), M = new Float64Array(n), Y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const x = normal(), m = a * x + normal();
        X[i] = x; M[i] = m; Y[i] = cp * x + b * m + normal();
    }
    const fa = ajustarMco(M, [X]), fb = ajustarMco(Y, [X, M]);
    if (!fa || !fb) return false;
    const ta = /** @type {number} */ (fa.beta[1]) / Math.sqrt(fa.sce / (n - 2) * /** @type {number} */ (fa.diagInversa[1]));
    const tb = /** @type {number} */ (fb.beta[2]) / Math.sqrt(fb.sce / (n - 3) * /** @type {number} */ (fb.diagInversa[2]));
    return Math.abs(ta) > tc1 && Math.abs(tb) > tc2;
}

/**
 * (2027.01.19) Cuántas réplicas de un tramo [desde, hasta) dan significativos a y b con n casos: la pieza que se reparte.
 * @param {number} a
 * @param {number} b
 * @param {number} cp
 * @param {number} n
 * @param {{ desde?: number, hasta?: number, alfa?: number, semilla?: number, alProgreso?: ((hechas: number, total: number) => void) | null }} [opciones]
 * @returns {number} NaN si las rutas o n no son posibles
 */
export function exitosMediacion(a, b, cp, n, { desde = 0, hasta = 1000, alfa = 0.05, semilla = 2027, alProgreso = null } = {}) {
    if (!rutasValidas(a, b, cp) || !(n >= 4)) return NaN;
    const tc1 = cuantilT(1 - alfa / 2, n - 2), tc2 = cuantilT(1 - alfa / 2, n - 3), total = hasta - desde;
    let si = 0;
    for (let r = desde; r < hasta; r++) {
        if (replica(a, b, cp, n, semilla, r, tc1, tc2)) si++;
        if (alProgreso && (r + 1 - desde) % 50 === 0) alProgreso(r + 1 - desde, total);
    }
    return si;
}

/**
 * La potencia (con su error típico de Monte Carlo) de unos éxitos entre R réplicas.
 * @param {number} si
 * @param {number} R
 * @returns {{ potencia: number, ee: number, R: number }}
 */
export function potenciaDeExitos(si, R) {
    const p = si / R;
    return { potencia: p, ee: Math.sqrt(p * (1 - p) / R), R };
}

/**
 * La potencia de la significación conjunta con n casos.
 * @param {number} a
 * @param {number} b
 * @param {number} cp c′, el efecto directo
 * @param {number} n
 * @param {{ R?: number, alfa?: number, semilla?: number, alProgreso?: ((hechas: number, total: number) => void) | null }} [opciones]
 * @returns {{ potencia: number, ee: number, R: number }}
 */
export function potenciaMediacion(a, b, cp, n, { R = 1000, alfa = 0.05, semilla = 2027, alProgreso = null } = {}) {
    return potenciaDeExitos(exitosMediacion(a, b, cp, n, { desde: 0, hasta: R, alfa, semilla, alProgreso }), R);
}

/**
 * (2027.01.19) La búsqueda del tamaño de muestra como generador: entrega cada n cuya potencia hace falta y la recibe
 * (`next(potencia)`); devuelve el menor n con la potencia pedida, o null si ni con `maximo` se llega. Primero duplica
 * desde 16 hasta pasarse; después, la bisección del núcleo sobre n redondeado, y por último los vecinos enteros. En
 * `estado.total`, cuántas potencias pedirá en total (una estimación hasta terminar de duplicar), para el progreso.
 * @param {number} potenciaDeseada
 * @param {number} maximo
 * @param {{ total: number }} estado
 * @returns {Generator<number, number | null, number>}
 */
export function* busquedaTamano(potenciaDeseada, maximo, estado) {
    // (2027.01.20) sin pasarse de `maximo`: antes, de 16 384 a 32 768 se pasaba de 20 000 sin probarlo
    let lo = 4, hi = Math.min(16, maximo), pedidas = 1;
    while ((yield hi) < potenciaDeseada) { if (hi >= maximo) return null; lo = hi; hi = Math.min(2 * hi, maximo); pedidas++; }
    const pasos = Math.ceil(Math.log2(hi - lo)) + 2;
    estado.total = pedidas + pasos + 3;
    const biseccion = pasosBiseccion(potenciaDeseada, lo, hi, pasos);
    let r = biseccion.next();
    while (!r.done) r = biseccion.next(yield Math.round(r.value));
    let n = Math.ceil(r.value);
    while (n > 4 && (yield n - 1) >= potenciaDeseada) n--;
    while ((yield n) < potenciaDeseada) n++;
    return n;
}

/**
 * El tamaño de muestra de la mediación simple: el menor n con la potencia estimada pedida, buscado sobre las mismas réplicas.
 * @param {number} a
 * @param {number} b
 * @param {number} cp
 * @param {{ R?: number, alfa?: number, semilla?: number, potenciaDeseada?: number, maximo?: number,
 *   alProgreso?: ((hechas: number, total: number) => void) | null }} [opciones] alProgreso: tras cada n probado (el total es
 *   una estimación que se corrige al terminar la fase de duplicar)
 * @returns {{ n: number, potencia: number, ee: number, R: number } | null} null si ni con `maximo` se llega
 */
export function tamanoMuestraMediacion(a, b, cp, { R = 1000, alfa = 0.05, semilla = 2027, potenciaDeseada = 0.8, maximo = 20000, alProgreso = null } = {}) {
    if (!rutasValidas(a, b, cp) || !(a !== 0 && b !== 0)) return null;
    /** @type {Map<number, { potencia: number, ee: number, R: number }>} */ const hechas = new Map();
    const estado = { total: 16 }, busqueda = busquedaTamano(potenciaDeseada, maximo, estado);
    let pasos = 0, r = busqueda.next();
    while (!r.done) {
        const n = r.value;
        if (!hechas.has(n)) hechas.set(n, potenciaMediacion(a, b, cp, n, { R, alfa, semilla }));
        pasos++;
        if (alProgreso) alProgreso(pasos, Math.max(estado.total, pasos + 1));
        r = busqueda.next(/** @type {{ potencia: number }} */ (hechas.get(n)).potencia);
    }
    return r.value === null ? null : { n: r.value, .../** @type {{ potencia: number, ee: number, R: number }} */ (hechas.get(r.value)) };
}

/**
 * (2027.01.19) La misma búsqueda con una potencia que se espera (la de varios Workers a la vez): `potenciaEn(n)` devuelve
 * una promesa con { potencia, ee, R }. Da el mismo n y la misma potencia que tamanoMuestraMediacion.
 * @param {number} a
 * @param {number} b
 * @param {number} cp
 * @param {(n: number) => Promise<{ potencia: number, ee: number, R: number }>} potenciaEn
 * @param {{ potenciaDeseada?: number, maximo?: number, alProgreso?: ((hechas: number, total: number) => void) | null }} [opciones]
 * @returns {Promise<{ n: number, potencia: number, ee: number, R: number } | null>}
 */
export async function tamanoMuestraMediacionAsincrono(a, b, cp, potenciaEn, { potenciaDeseada = 0.8, maximo = 20000, alProgreso = null } = {}) {
    if (!rutasValidas(a, b, cp) || !(a !== 0 && b !== 0)) return null;
    /** @type {Map<number, { potencia: number, ee: number, R: number }>} */ const hechas = new Map();
    const estado = { total: 16 }, busqueda = busquedaTamano(potenciaDeseada, maximo, estado);
    let pasos = 0, r = busqueda.next();
    while (!r.done) {
        const n = r.value;
        if (!hechas.has(n)) hechas.set(n, await potenciaEn(n));
        pasos++;
        if (alProgreso) alProgreso(pasos, Math.max(estado.total, pasos + 1));
        r = busqueda.next(/** @type {{ potencia: number }} */ (hechas.get(n)).potencia);
    }
    return r.value === null ? null : { n: r.value, .../** @type {{ potencia: number, ee: number, R: number }} */ (hechas.get(r.value)) };
}
