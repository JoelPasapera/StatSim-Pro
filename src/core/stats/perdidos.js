// @ts-check
// core/stats/perdidos.js — (2027.01.18) los datos perdidos de una matriz de casos × variables (NaN: perdido): sus patrones;
// las medias y la covarianza de máxima verosimilitud con TODOS los casos por el algoritmo EM de la normal multivariante
// (Dempster, Laird y Rubin, 1977; válidas si los perdidos son MAR); la prueba MCAR de Little (1988), con esas estimaciones
// (como naniar::mcar_test y BaylorEdPsych::LittleMCAR en R), y las reglas de Rubin (1987) para combinar m imputaciones, con
// los grados de libertad para muestras pequeñas de Barnard y Rubin (1999) y la fracción de información perdida que da
// mice::pool. La imputación por ecuaciones encadenadas, en imputacion.js. Sin DOM.
import { media, varianza } from './descriptivos.js';
import { inversaYLogDet } from '../linalg/cholesky.js';
import { pChiCuadrado, cuantilT, pTBilateral } from './distribuciones.js';
import { cuantilNormal, colaSuperiorNormal } from './normal.js';

/** @typedef {ArrayLike<number>[]} Columnas k columnas de la misma longitud, con NaN en los perdidos */

/**
 * Los patrones de pérdida: cuántos casos comparten cada combinación de variables observadas, de más a menos frecuente (a
 * igual frecuencia, el de menos perdidos primero), con los perdidos de cada variable y los casos completos.
 * @param {Columnas} X
 * @returns {{ n: number, k: number, perdidosPorVariable: number[], celdasPerdidas: number, completos: number, vacios: number,
 *   patrones: { observado: boolean[], n: number, filas: number[] }[] }} vacios: los casos sin ningún valor
 */
export function patronesPerdidos(X) {
    const k = X.length, n = k ? /** @type {ArrayLike<number>} */ (X[0]).length : 0;
    const perdidosPorVariable = new Array(k).fill(0);
    /** @type {Map<string, { observado: boolean[], n: number, filas: number[] }>} */ const mapa = new Map();
    let completos = 0, vacios = 0, celdasPerdidas = 0;
    for (let i = 0; i < n; i++) {
        const observado = X.map(c => Number.isFinite(c[i]));
        let perdidos = 0;
        observado.forEach((o, j) => { if (!o) { perdidos++; perdidosPorVariable[j]++; } });
        celdasPerdidas += perdidos;
        if (!perdidos) completos++;
        if (perdidos === k) vacios++;
        const clave = observado.map(o => (o ? '1' : '0')).join('');
        const p = mapa.get(clave);
        if (p) { p.n++; p.filas.push(i); } else mapa.set(clave, { observado, n: 1, filas: [i] });
    }
    const faltan = (/** @type {boolean[]} */ o) => o.filter(x => !x).length;
    const patrones = [...mapa.values()].sort((a, b) => b.n - a.n || faltan(a.observado) - faltan(b.observado));
    return { n, k, perdidosPorVariable, celdasPerdidas, completos, vacios, patrones };
}

/** Los índices de los valores verdaderos. @param {boolean[]} v */
const indices = v => v.flatMap((x, j) => (x ? [j] : []));

/** La submatriz de unas filas y columnas. @param {ArrayLike<ArrayLike<number>>} S @param {number[]} f @param {number[]} c */
const sub = (S, f, c) => f.map(a => c.map(b => /** @type {number} */ (/** @type {ArrayLike<number>} */ (S[a])[b])));

/**
 * El algoritmo EM de la normal multivariante con datos perdidos: las medias y la covarianza (de máxima verosimilitud, entre
 * n) que maximizan la verosimilitud de lo observado. Los casos sin ningún valor no aportan nada y quedan fuera. Arranca de
 * las medias y las varianzas (sin covarianzas) de los casos disponibles; converge cuando ningún parámetro cambia más que
 * `tolerancia` (relativa a su tamaño, y absoluta cerca de 0).
 * @param {Columnas} X
 * @param {{ maxIteraciones?: number, tolerancia?: number }} [opciones]
 * @returns {{ medias: number[], cov: number[][], iteraciones: number, convergio: boolean, logVerosimilitud: number, n: number } | null}
 *   null si alguna variable no tiene dos valores observados distintos o la covarianza deja de ser definida positiva
 */
export function emNormal(X, { maxIteraciones = 2000, tolerancia = 1e-9 } = {}) {
    const P = patronesPerdidos(X), k = P.k;
    const grupos = P.patrones.filter(p => p.observado.some(Boolean)).map(p => ({ O: indices(p.observado), Mi: indices(p.observado.map(o => !o)), filas: p.filas }));
    const n = grupos.reduce((s, g) => s + g.filas.length, 0);
    let mu = X.map(c => { const v = Array.from(c).filter(Number.isFinite); return v.length ? media(v) : NaN; });
    let S = X.map((c, a) => X.map((_, b) => { if (a !== b) return 0; const v = Array.from(c).filter(Number.isFinite); return v.length > 1 ? varianza(v) * (v.length - 1) / v.length : NaN; }));
    if (S.some((f, j) => !(/** @type {number} */ (f[j]) > 0))) return null;
    let iteraciones = 0, convergio = false;
    while (iteraciones < maxIteraciones) {
        iteraciones++;
        const T1 = new Array(k).fill(0), T2 = Array.from({ length: k }, () => new Array(k).fill(0));
        for (const g of grupos) {
            const { O, Mi } = g;
            /** @type {number[][]} */ let B = [];
            /** @type {number[][]} */ let C = [];
            if (Mi.length) {
                const inv = inversaYLogDet(sub(S, O, O));
                if (!inv) return null;
                const Smo = sub(S, Mi, O);
                B = Smo.map(f => O.map((_, b) => f.reduce((s, v, a) => s + v * /** @type {number} */ (/** @type {Float64Array} */ (inv.inv[a])[b]), 0)));
                C = Mi.map((a, r) => Mi.map((b, c) => /** @type {number} */ (/** @type {number[]} */ (S[a])[b]) - /** @type {number[]} */ (B[r]).reduce((s, v, t) => s + v * /** @type {number} */ (/** @type {number[]} */ (Smo[c])[t]), 0)));
            }
            const x = new Array(k);
            for (const i of g.filas) {
                for (const j of O) x[j] = /** @type {ArrayLike<number>} */ (X[j])[i];
                Mi.forEach((j, r) => { let s = /** @type {number} */ (mu[j]); O.forEach((o, t) => { s += /** @type {number} */ (/** @type {number[]} */ (B[r])[t]) * (/** @type {number} */ (x[o]) - /** @type {number} */ (mu[o])); }); x[j] = s; });
                for (let a = 0; a < k; a++) { T1[a] += x[a]; const fa = /** @type {number[]} */ (T2[a]); for (let b = 0; b <= a; b++) fa[b] += x[a] * x[b]; }
                Mi.forEach((a, r) => Mi.forEach((b, c) => { if (b <= a) /** @type {number[]} */ (T2[a])[b] += /** @type {number} */ (/** @type {number[]} */ (C[r])[c]); }));
            }
        }
        const mu2 = T1.map(t => t / n);
        const S2 = Array.from({ length: k }, (_, a) => Array.from({ length: k }, (_, b) => { const [p, q] = a >= b ? [a, b] : [b, a]; return /** @type {number} */ (/** @type {number[]} */ (T2[p])[q]) / n - /** @type {number} */ (mu2[p]) * /** @type {number} */ (mu2[q]); }));
        let cambio = 0;
        for (let a = 0; a < k; a++) {
            cambio = Math.max(cambio, Math.abs(/** @type {number} */ (mu2[a]) - /** @type {number} */ (mu[a])) / Math.max(1, Math.abs(/** @type {number} */ (mu2[a]))));
            for (let b = 0; b < k; b++) cambio = Math.max(cambio, Math.abs(/** @type {number} */ (/** @type {number[]} */ (S2[a])[b]) - /** @type {number} */ (/** @type {number[]} */ (S[a])[b])) / Math.max(1, Math.abs(/** @type {number} */ (/** @type {number[]} */ (S2[a])[b]))));
        }
        mu = mu2; S = S2;
        if (cambio < tolerancia) { convergio = true; break; }
    }
    // la log-verosimilitud de lo observado en las estimaciones finales
    let logVerosimilitud = 0;
    for (const g of grupos) {
        const inv = inversaYLogDet(sub(S, g.O, g.O));
        if (!inv) return null;
        for (const i of g.filas) {
            const d = g.O.map(j => /** @type {number} */ (/** @type {ArrayLike<number>} */ (X[j])[i]) - /** @type {number} */ (mu[j]));
            let q = 0;
            d.forEach((da, a) => d.forEach((db, b) => { q += da * /** @type {number} */ (/** @type {Float64Array} */ (inv.inv[a])[b]) * db; }));
            logVerosimilitud -= 0.5 * (g.O.length * Math.log(2 * Math.PI) + inv.logDet + q);
        }
    }
    return { medias: mu, cov: S, iteraciones, convergio, logVerosimilitud, n };
}

/**
 * La prueba MCAR de Little (1988): d² = Σⱼ nⱼ (ȳⱼ − μⱼ)ᵀ Σⱼ⁻¹ (ȳⱼ − μⱼ) sobre los patrones j (las medias de las variables
 * observadas en cada patrón frente a las del EM, con su covarianza), con Σⱼ kⱼ − k gl. Bajo MCAR, χ².
 * @param {Columnas} X
 * @param {{ medias: number[], cov: number[][] }} em las estimaciones del EM de las mismas columnas
 * @returns {{ chi2: number, gl: number, pValor: number, patrones: number } | null} null si hay un solo patrón (sin perdidos
 *   no hay nada que contrastar)
 */
export function pruebaMcarLittle(X, em) {
    const P = patronesPerdidos(X), grupos = P.patrones.filter(p => p.observado.some(Boolean));
    if (grupos.length < 2) return null;
    let d2 = 0, kj = 0;
    for (const g of grupos) {
        const O = indices(g.observado), inv = inversaYLogDet(sub(em.cov, O, O));
        if (!inv) return null;
        const d = O.map(j => media(g.filas.map(i => /** @type {number} */ (/** @type {ArrayLike<number>} */ (X[j])[i]))) - /** @type {number} */ (em.medias[j]));
        let q = 0;
        d.forEach((da, a) => d.forEach((db, b) => { q += da * /** @type {number} */ (/** @type {Float64Array} */ (inv.inv[a])[b]) * db; }));
        d2 += g.filas.length * q;
        kj += O.length;
    }
    const gl = kj - P.k;
    return { chi2: d2, gl, pValor: gl > 0 ? pChiCuadrado(d2, gl) : NaN, patrones: grupos.length };
}

/**
 * Las reglas de Rubin (1987): la estimación combinada de m imputaciones (la media de las m), su varianza total
 * T = Ū + (1 + 1/m)B (dentro y entre imputaciones), los gl de Barnard y Rubin (1999) si se dan los de los datos completos
 * (si no, los de Rubin, (m − 1)/λ²), la fracción de información perdida (γ = (r + 2/(ν + 3))/(1 + r), la de mice::pool),
 * su intervalo y su prueba frente a `nula`.
 * @param {ArrayLike<number>} Q las m estimaciones
 * @param {ArrayLike<number>} U sus m varianzas (el error típico al cuadrado)
 * @param {{ glCompletos?: number, nivel?: number, nula?: number }} [opciones]
 */
export function reglasRubin(Q, U, { glCompletos = Infinity, nivel = 0.95, nula = 0 } = {}) {
    const m = Q.length, estimacion = media(Q), dentro = media(U), entre = m > 1 ? varianza(Q) : 0;
    const total = dentro + (1 + 1 / m) * entre;
    const r = dentro > 0 ? (1 + 1 / m) * entre / dentro : Infinity, lambda = total > 0 ? (1 + 1 / m) * entre / total : 0;
    const glRubin = lambda > 0 ? (m - 1) / (lambda * lambda) : Infinity;
    let gl = glRubin;
    if (Number.isFinite(glCompletos)) {
        const glObservados = (glCompletos + 1) / (glCompletos + 3) * glCompletos * (1 - lambda);
        gl = Number.isFinite(glRubin) ? glRubin * glObservados / (glRubin + glObservados) : glObservados;
    }
    // (2027.01.20, revisión) sin varianza entre imputaciones (una variable sin perdidos: las m estimaciones son la misma), la
    // fracción de información perdida es 0; la fórmula daría 2/(ν + 3), lo que añade su corrección para muestras pequeñas (y
    // lo que informa mice), no información perdida
    const fmi = !(entre > 0) && dentro > 0 ? 0 : Number.isFinite(r) ? (r + 2 / (gl + 3)) / (1 + r) : 1;
    // con gl infinitos (o enormes), la normal: la t con 10⁷ gl ya no se distingue de ella
    const normal = !(gl < 1e7), ee = Math.sqrt(total), q = normal ? cuantilNormal(1 - (1 - nivel) / 2) : cuantilT(1 - (1 - nivel) / 2, gl);
    const t = (estimacion - nula) / ee;
    return { m, estimacion, dentro, entre, total, ee, r, lambda, gl, fmi, inferior: estimacion - q * ee, superior: estimacion + q * ee, t, pValor: normal ? 2 * colaSuperiorNormal(Math.abs(t)) : pTBilateral(t, gl) };
}
