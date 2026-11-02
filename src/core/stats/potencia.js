// @ts-check
// core/stats/potencia.js — (2027.01.18) la potencia estadística a priori y el tamaño de muestra, con las distribuciones
// EXACTAS de cada prueba bajo la hipótesis alternativa (las de G*Power 3.1; Faul et al., 2007, 2009), no con aproximaciones
// normales:
//   · t de dos grupos independientes (d de Cohen, con la razón n₂/n₁): t no central con δ = d·√(n₁n₂/(n₁ + n₂));
//   · t de una muestra o de muestras relacionadas (dz): δ = dz·√n, n − 1 gl;
//   · correlación de Pearson (ρ frente a 0): la densidad exacta de r con normalidad bivariada (Hotelling, 1953), integrada
//     fuera del r crítico de la prueba t con n − 2 gl (el «modelo normal bivariado» de G*Power);
//   · ANOVA de un factor (f de Cohen, k grupos): F no central con λ = f²·N;
//   · χ² de independencia o de bondad de ajuste (w de Cohen, gl): χ² no central con λ = w²·N;
//   · regresión lineal múltiple (f², el R² del modelo o el incremento de q predictores de p): F no central con λ = f²·N.
// El tamaño de muestra es el menor n entero con la potencia pedida (se resuelve en continuo con Brent y se ajusta en los
// enteros vecinos), y el efecto detectable, el que da esa potencia con el n dado. Sin DOM.
import { cuantilT, cuantilF, cuantilChi2, cdfChi2NoCentral } from './distribuciones.js';
import { cdfTNoCentral, colaSuperiorFNoCentral } from './no-centrales.js';
import { lnGamma } from './especiales.js';
import { raizBrent } from './optimizacion.js';
import { integrar } from './integracion.js';

/** @typedef {'t2' | 't1' | 'r' | 'anova' | 'chi2' | 'regresion'} PruebaPotencia */
/**
 * @typedef {{ alfa?: number, colas?: 1 | 2, razon?: number, k?: number, gl?: number, predictores?: number, probados?: number }} OpcionesPotencia
 *   razon: n₂/n₁ (t2); k: grupos (anova); gl: los de la χ²; predictores: p del modelo (regresion); probados: q, los
 *   predictores cuyo incremento se prueba (regresion; por defecto, todos: el R² del modelo)
 */

/** El ₂F₁(½, ½; c; z) por su serie (converge con |z| < 1). @param {number} c @param {number} z */
function hipergeometricaMedios(c, z) {
    let termino = 1, suma = 1;
    for (let k = 0; k < 100000; k++) {
        termino *= (k + 0.5) * (k + 0.5) / ((c + k) * (k + 1)) * z;
        suma += termino;
        if (termino < 1e-17 * suma) break;
    }
    return suma;
}

/**
 * La densidad exacta del coeficiente de correlación muestral r con n casos de una normal bivariada con correlación ρ
 * (Hotelling, 1953), con la serie hipergeométrica.
 * @param {number} r
 * @param {number} rho
 * @param {number} n
 */
export function densidadR(r, rho, n) {
    if (!(r > -1 && r < 1)) return 0;
    const lc = Math.log(n - 2) + lnGamma(n - 1) - 0.5 * Math.log(2 * Math.PI) - lnGamma(n - 0.5) + (n - 1) / 2 * Math.log1p(-rho * rho);
    return Math.exp(lc + (n - 4) / 2 * Math.log1p(-r * r) - (n - 1.5) * Math.log1p(-rho * r)) * hipergeometricaMedios(n - 0.5, (1 + rho * r) / 2);
}

/**
 * La potencia de una prueba con un n dado (en t2, n es n₁; n₂ = razón·n₁).
 * @param {PruebaPotencia} prueba
 * @param {number} efecto d, dz, ρ, f, w o f²
 * @param {number} n n₁ (t2), los casos (t1 y r) o el total N (anova, chi2 y regresion); puede no ser entero
 * @param {OpcionesPotencia} [opciones]
 * @returns {number} NaN si el diseño no es posible con ese n
 */
export function potencia(prueba, efecto, n, { alfa = 0.05, colas = 2, razon = 1, k = 2, gl = 1, predictores = 1, probados } = {}) {
    const a = colas === 2 ? alfa / 2 : alfa;
    if (prueba === 't2' || prueba === 't1') {
        const n2 = razon * n, df = prueba === 't2' ? n + n2 - 2 : n - 1;
        if (!(df > 0)) return NaN;
        const delta = prueba === 't2' ? efecto * Math.sqrt(n * n2 / (n + n2)) : efecto * Math.sqrt(n);
        const tc = cuantilT(1 - a, df);
        // unilateral: en la dirección del efecto (el signo de d)
        const arriba = 1 - cdfTNoCentral(tc, df, Math.abs(delta));
        return colas === 2 ? arriba + cdfTNoCentral(-tc, df, Math.abs(delta)) : arriba;
    }
    if (prueba === 'r') {
        if (!(n > 4) || !(Math.abs(efecto) < 1)) return NaN;
        const tc = cuantilT(1 - a, n - 2), rc = tc / Math.sqrt(tc * tc + n - 2), rho = Math.abs(efecto);
        const f = (/** @type {number} */ x) => densidadR(x, rho, n);
        const cola = integrar(f, rc, 1).valor;
        return Math.min(1, colas === 2 ? cola + integrar(f, -1, -rc).valor : cola);
    }
    if (prueba === 'anova') {
        const d1 = k - 1, d2 = n - k;
        if (!(d1 > 0 && d2 > 0)) return NaN;
        return colaSuperiorFNoCentral(cuantilF(1 - alfa, d1, d2), d1, d2, efecto * efecto * n);
    }
    if (prueba === 'chi2') {
        if (!(n > 0 && gl > 0)) return NaN;
        return 1 - cdfChi2NoCentral(cuantilChi2(1 - alfa, gl), gl, efecto * efecto * n);
    }
    const q = probados || predictores, d2 = n - predictores - 1;
    if (!(d2 > 0) || !(q > 0)) return NaN;
    return colaSuperiorFNoCentral(cuantilF(1 - alfa, q, d2), q, d2, efecto * n);
}

/**
 * La unidad del tamaño de muestra de cada prueba: n₁ en t2 (n₂ = ⌈razón·n₁⌉), los casos de CADA grupo en el ANOVA (los grupos,
 * iguales: N = k·n, como G*Power) y el total en las demás; con su mínimo y la potencia de una unidad dada (real o entera).
 * @param {PruebaPotencia} prueba
 * @param {OpcionesPotencia} o
 */
function unidad(prueba, o) {
    const razon = o.razon || 1, k = o.k || 2;
    const minimo = prueba === 't2' || prueba === 't1' ? 2 : prueba === 'r' ? 5 : prueba === 'anova' ? 2 : prueba === 'chi2' ? 1 : (o.predictores || 1) + 2;
    /** la potencia con n unidades (con los enteros reales del diseño si `entero`) @param {number} efecto @param {number} n @param {boolean} entero */
    const pot = (efecto, n, entero) => {
        if (prueba === 't2') return potencia(prueba, efecto, n, { ...o, razon: entero ? Math.ceil(razon * n) / n : razon });
        if (prueba === 'anova') return potencia(prueba, efecto, k * n, o);
        return potencia(prueba, efecto, n, o);
    };
    /** el diseño de n unidades @param {number} n */
    const diseno = n => (prueba === 't2' ? { n, n2: Math.ceil(razon * n), total: n + Math.ceil(razon * n) } : prueba === 'anova' ? { n, n2: null, total: k * n } : { n, n2: null, total: n });
    return { minimo, pot, diseno };
}

/**
 * El tamaño de muestra: el menor número entero de unidades (n₁ en t2, los de cada grupo en el ANOVA, el total en las demás)
 * con potencia ≥ la pedida.
 * @param {PruebaPotencia} prueba
 * @param {number} efecto
 * @param {OpcionesPotencia & { potenciaDeseada?: number, maximo?: number }} [opciones]
 * @returns {{ n: number, n2: number | null, total: number, potenciaReal: number } | null} null si ni con `maximo` se llega
 */
export function tamanoMuestra(prueba, efecto, opciones = {}) {
    const { potenciaDeseada = 0.8, maximo = 1e7, ...o } = opciones;
    if (!(efecto !== 0) || !Number.isFinite(efecto)) return null;
    const U = unidad(prueba, o), pot = (/** @type {number} */ n, /** @type {boolean} */ entero) => U.pot(efecto, n, entero);
    const resultado = (/** @type {number} */ n) => ({ ...U.diseno(n), potenciaReal: pot(n, true) });
    let lo = U.minimo;
    if (pot(lo, true) >= potenciaDeseada) return resultado(lo);
    let hi = lo * 2;
    while (!(pot(hi, false) >= potenciaDeseada)) { lo = hi; hi *= 2; if (hi > maximo) return null; }
    const r = raizBrent(n => pot(n, false) - potenciaDeseada, lo, hi, 1e-9);
    let n = Math.max(U.minimo, Math.ceil(r ? r.x - 1e-7 : hi));
    while (n > U.minimo && pot(n - 1, true) >= potenciaDeseada) n--;
    while (pot(n, true) < potenciaDeseada) n++;
    return resultado(n);
}

/**
 * El efecto mínimo detectable (sensibilidad): el que da la potencia pedida con n unidades (las de tamanoMuestra).
 * @param {PruebaPotencia} prueba
 * @param {number} n
 * @param {OpcionesPotencia & { potenciaDeseada?: number }} [opciones]
 * @returns {number | null}
 */
export function efectoDetectable(prueba, n, opciones = {}) {
    const { potenciaDeseada = 0.8, ...o } = opciones, U = unidad(prueba, o);
    const g = (/** @type {number} */ e) => U.pot(e, n, true) - potenciaDeseada;
    let hi = prueba === 'r' ? 0.99 : 1;
    if (!(Number.isFinite(g(1e-9)))) return null;
    if (prueba !== 'r') while (g(hi) < 0) { hi *= 2; if (hi > 1e4) return null; }
    else if (!(g(hi) >= 0)) return null;
    const r = raizBrent(g, 1e-9, hi, 1e-12);
    return r ? r.x : null;
}

/**
 * La curva de potencia: la potencia en una rejilla de n, en las unidades de tamanoMuestra (para dibujarla).
 * @param {PruebaPotencia} prueba
 * @param {number} efecto
 * @param {number} desde
 * @param {number} hasta
 * @param {OpcionesPotencia & { puntos?: number }} [opciones]
 * @returns {{ n: number, potencia: number }[]}
 */
export function curvaPotencia(prueba, efecto, desde, hasta, opciones = {}) {
    const { puntos = 60, ...o } = opciones, paso = Math.max(1, Math.round((hasta - desde) / (puntos - 1)));
    /** @type {{ n: number, potencia: number }[]} */ const curva = [];
    const U = unidad(prueba, o);
    for (let n = Math.max(U.minimo, Math.round(desde)); n <= hasta; n += paso) curva.push({ n, potencia: U.pot(efecto, n, true) });
    return curva;
}
