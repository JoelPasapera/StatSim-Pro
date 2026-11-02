// @ts-check
// analizador/relaciones/mediacion.js — (2027.01.17) la mediación y la moderación con los modelos de PROCESS de Hayes (2022),
// por mínimos cuadrados (el motor único, core/stats/mco.js) y el bootstrap de casos con semilla (psicometria/bootstrap.js):
//   · modelo 1, moderación: Y = b₀ + b₁X + b₂W + b₃XW (+ covariables); el efecto condicional de X en valores de W con su
//     error típico (la varianza de b₁ + b₃w por la matriz de covarianzas), la región de Johnson y Neyman (1936) y la ΔR² de la
//     interacción;
//   · modelo 4, mediación simple o en paralelo: Mⱼ = a₀ⱼ + aⱼX; Y = c′₀ + c′X + Σ bⱼMⱼ; los indirectos aⱼbⱼ, su suma, sus
//     contrastes y el completamente estandarizado, con su intervalo bootstrap percentil (y, como referencia, la z de Sobel);
//   · modelo 6, mediación en serie (2 o 3 mediadores): cada Mⱼ sobre X y los anteriores; todos los caminos indirectos;
//   · modelo 7, mediación moderada en la primera etapa: M = a₀ + a₁X + a₂W + a₃XW; Y = c′₀ + c′X + bM; el indirecto
//     condicional (a₁ + a₃w)b y el índice de mediación moderada a₃b (Hayes, 2015);
//   · modelo 14, en la segunda etapa: M = a₀ + aX; Y = c′₀ + c′X + b₁M + b₂W + b₃MW; el indirecto condicional a(b₁ + b₃w) y
//     el índice ab₃.
// Los valores de W para los efectos condicionales, los de PROCESS: sus dos valores si es dicotómica; si no, sus percentiles
// 16, 50 y 84. Con «centrar», las variables de los productos se centran en su media (en el modelo 14, M y W) antes de todo,
// también del bootstrap. Sin DOM: lo ejecuta el Worker de la psicometría o, sin él, el hilo principal.
import { regresionMco, ajustarMco } from '../../core/stats/mco.js';
import { media, desviacion } from '../../core/stats/descriptivos.js';
import { cuantilOrdenado } from '../../core/stats/orden.js';
import { cuantilT, pTBilateral } from '../../core/stats/distribuciones.js';
import { colaSuperiorNormal } from '../../core/stats/normal.js';
import { bootstrap as bootstrapSinTipos, intervaloPercentil } from '../psicometria/bootstrap.js';

/** El motor del bootstrap de casos (psicometria/bootstrap.js, sin @ts-check), con sus tipos. */
const bootstrap = /** @type {(n: number, estadistico: (idx: Int32Array) => Record<string, number>, opciones: { B: number, semilla: number, alProgreso: ((hecho: number, total: number) => void) | null, cada: number }) => { reps: Record<string, number[]>, invalidas: Record<string, number> }} */ (/** @type {unknown} */ (bootstrapSinTipos));

/** @typedef {1 | 4 | 6 | 7 | 14} ModeloProceso */
/**
 * @typedef {{ modelo: ModeloProceso, x: number[], y: number[], m: number[][], w: number[] | null, covariables: number[][],
 *   centrar?: boolean }} PedidoProceso
 */
/** @typedef {{ nombre: string, valores: Float64Array }} Columna */
/** @typedef {{ dependiente: string, y: Float64Array, columnas: Columna[] }} Ecuacion */

/** Los modelos que se estiman y lo que necesitan. */
export const MODELOS = Object.freeze({
    1: Object.freeze({ nombre: 'Moderación (modelo 1)', mediadores: [0, 0], moderador: true }),
    4: Object.freeze({ nombre: 'Mediación simple o en paralelo (modelo 4)', mediadores: [1, 6], moderador: false }),
    6: Object.freeze({ nombre: 'Mediación en serie (modelo 6)', mediadores: [2, 3], moderador: false }),
    7: Object.freeze({ nombre: 'Mediación moderada en la primera etapa (modelo 7)', mediadores: [1, 1], moderador: true }),
    14: Object.freeze({ nombre: 'Mediación moderada en la segunda etapa (modelo 14)', mediadores: [1, 1], moderador: true })
});

/** @param {ArrayLike<number>} v @param {number} c */
const restar = (v, c) => Float64Array.from(v, x => x - c);
/** @param {ArrayLike<number>} a @param {ArrayLike<number>} b */
const producto = (a, b) => Float64Array.from(a, (x, i) => x * /** @type {number} */ (b[i]));

/**
 * Las variables del modelo, centradas si se pide (las de los productos).
 * @param {PedidoProceso} p
 */
export function prepararVariables(p) {
    const centrar = p.centrar !== false && p.modelo !== 4 && p.modelo !== 6;
    const mx = media(p.x), mw = p.w ? media(p.w) : 0, mm = p.m.map(c => media(c));
    const cx = centrar && (p.modelo === 1 || p.modelo === 7), cm = centrar && p.modelo === 14, cw = centrar && !!p.w;
    return {
        X: cx ? restar(p.x, mx) : Float64Array.from(p.x), Y: Float64Array.from(p.y),
        M: p.m.map((c, j) => (cm ? restar(c, /** @type {number} */ (mm[j])) : Float64Array.from(c))),
        W: p.w ? (cw ? restar(p.w, mw) : Float64Array.from(p.w)) : null,
        C: p.covariables.map(c => Float64Array.from(c)),
        centros: { x: cx ? mx : 0, w: cw ? mw : 0, m: cm ? mm : p.m.map(() => 0) }, centrado: centrar
    };
}

/**
 * Las ecuaciones de cada modelo, en el orden de PROCESS (las de los mediadores, la de Y y, en los modelos 4 y 6, la del
 * efecto total).
 * @param {ModeloProceso} modelo
 * @param {ReturnType<typeof prepararVariables>} v
 * @returns {Ecuacion[]}
 */
export function ecuaciones(modelo, v) {
    const cov = v.C.map((c, j) => ({ nombre: `C${j + 1}`, valores: c }));
    const X = { nombre: 'X', valores: v.X }, M = v.M.map((c, j) => ({ nombre: `M${j + 1}`, valores: c }));
    const W = v.W ? { nombre: 'W', valores: v.W } : null;
    switch (modelo) {
        case 1: return [{ dependiente: 'Y', y: v.Y, columnas: [X, /** @type {Columna} */ (W), { nombre: 'X·W', valores: producto(v.X, /** @type {Float64Array} */ (v.W)) }, ...cov] }];
        case 4: return [...M.map(m => ({ dependiente: m.nombre, y: m.valores, columnas: [X, ...cov] })), { dependiente: 'Y', y: v.Y, columnas: [X, ...M, ...cov] }, { dependiente: 'Y (total)', y: v.Y, columnas: [X, ...cov] }];
        case 6: return [...M.map((m, j) => ({ dependiente: m.nombre, y: m.valores, columnas: [X, ...M.slice(0, j), ...cov] })), { dependiente: 'Y', y: v.Y, columnas: [X, ...M, ...cov] }, { dependiente: 'Y (total)', y: v.Y, columnas: [X, ...cov] }];
        case 7: return [{ dependiente: 'M1', y: /** @type {Float64Array} */ (v.M[0]), columnas: [X, /** @type {Columna} */ (W), { nombre: 'X·W', valores: producto(v.X, /** @type {Float64Array} */ (v.W)) }, ...cov] }, { dependiente: 'Y', y: v.Y, columnas: [X, /** @type {Columna} */ (M[0]), ...cov] }];
        default: return [{ dependiente: 'M1', y: /** @type {Float64Array} */ (v.M[0]), columnas: [X, ...cov] }, { dependiente: 'Y', y: v.Y, columnas: [X, /** @type {Columna} */ (M[0]), /** @type {Columna} */ (W), { nombre: 'M·W', valores: producto(/** @type {Float64Array} */ (v.M[0]), /** @type {Float64Array} */ (v.W)) }, ...cov] }];
    }
}

/**
 * Los valores de W para los efectos condicionales (en la escala del modelo: centrados si W lo está): sus dos valores si es
 * dicotómica; si no, sus percentiles 16, 50 y 84 (los de PROCESS).
 * @param {Float64Array} W
 * @returns {number[]}
 */
export function valoresDeW(W) {
    const distintos = [...new Set(W)].sort((a, b) => a - b);
    if (distintos.length === 2) return distintos;
    const o = Float64Array.from(W).sort();
    return [0.16, 0.5, 0.84].map(p => cuantilOrdenado(o, p));
}

/**
 * El coeficiente de una columna en una ecuación ajustada (beta[0] es la constante).
 * @param {Ecuacion} e
 * @param {ArrayLike<number>} beta
 * @param {string} nombre
 */
const coef = (e, beta, nombre) => /** @type {number} */ (beta[e.columnas.findIndex(c => c.nombre === nombre) + 1]);

/**
 * Los caminos indirectos de una mediación en serie: cada subconjunto no vacío de los mediadores, en su orden.
 * @param {number} k
 * @returns {number[][]}
 */
export function caminosEnSerie(k) {
    /** @type {number[][]} */ const caminos = [];
    for (let mascara = 1; mascara < (1 << k); mascara++) caminos.push(Array.from({ length: k }, (_, j) => j).filter(j => mascara & (1 << j)));
    return caminos.sort((a, b) => a.length - b.length || /** @type {number} */ (a[0]) - /** @type {number} */ (b[0]));
}

/**
 * Los efectos que se infieren por bootstrap, desde los coeficientes de cada ecuación: { clave: valor }.
 * @param {ModeloProceso} modelo
 * @param {Ecuacion[]} ecs
 * @param {ArrayLike<number>[]} betas
 * @param {number[]} ws
 * @param {{ deX: number, deY: number }} escalas para los estandarizados (las de la muestra o de la remuestra)
 * @returns {Record<string, number>}
 */
export function efectosIndirectos(modelo, ecs, betas, ws, escalas) {
    /** @type {Record<string, number>} */ const r = {};
    const ecY = /** @type {Ecuacion} */ (ecs.find(e => e.dependiente === 'Y')), bY = /** @type {ArrayLike<number>} */ (betas[ecs.indexOf(ecY)]);
    if (modelo === 4) {
        const k = ecs.length - 2;
        let total = 0;
        for (let j = 0; j < k; j++) {
            const ind = coef(/** @type {Ecuacion} */ (ecs[j]), /** @type {ArrayLike<number>} */ (betas[j]), 'X') * coef(ecY, bY, `M${j + 1}`);
            r[`ind_M${j + 1}`] = ind; total += ind;
            r[`std_M${j + 1}`] = ind * escalas.deX / escalas.deY;
        }
        r.ind_total = total; r.std_total = total * escalas.deX / escalas.deY;
        for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) r[`contraste_M${i + 1}_M${j + 1}`] = /** @type {number} */ (r[`ind_M${i + 1}`]) - /** @type {number} */ (r[`ind_M${j + 1}`]);
    } else if (modelo === 6) {
        const k = ecs.length - 2;
        let total = 0;
        for (const camino of caminosEnSerie(k)) {
            const primero = /** @type {number} */ (camino[0]), ultimo = /** @type {number} */ (camino[camino.length - 1]);
            let v = coef(/** @type {Ecuacion} */ (ecs[primero]), /** @type {ArrayLike<number>} */ (betas[primero]), 'X');
            for (let s = 1; s < camino.length; s++) { const de = /** @type {number} */ (camino[s - 1]), a = /** @type {number} */ (camino[s]); v *= coef(/** @type {Ecuacion} */ (ecs[a]), /** @type {ArrayLike<number>} */ (betas[a]), `M${de + 1}`); }
            v *= coef(ecY, bY, `M${ultimo + 1}`);
            const clave = camino.map(j => `M${j + 1}`).join('_');
            r[`ind_${clave}`] = v; r[`std_${clave}`] = v * escalas.deX / escalas.deY; total += v;
        }
        r.ind_total = total; r.std_total = total * escalas.deX / escalas.deY;
    } else if (modelo === 7) {
        const eM = /** @type {Ecuacion} */ (ecs[0]), bM = /** @type {ArrayLike<number>} */ (betas[0]), b = coef(ecY, bY, 'M1');
        const a1 = coef(eM, bM, 'X'), a3 = coef(eM, bM, 'X·W');
        r.indice = a3 * b;
        ws.forEach((w, i) => { r[`cond_${i}`] = (a1 + a3 * w) * b; });
    } else if (modelo === 14) {
        const a = coef(/** @type {Ecuacion} */ (ecs[0]), /** @type {ArrayLike<number>} */ (betas[0]), 'X'), b1 = coef(ecY, bY, 'M1'), b3 = coef(ecY, bY, 'M·W');
        r.indice = a * b3;
        ws.forEach((w, i) => { r[`cond_${i}`] = a * (b1 + b3 * w); });
    }
    return r;
}

/**
 * Los efectos condicionales de X en valores de W en una moderación (modelo 1), con su error típico por la matriz de
 * covarianzas: Var(b₁ + b₃w) = V₁₁ + 2wV₁₃ + w²V₃₃; y la región de Johnson-Neyman: los w en que |θ(w)|/ee(θ(w)) = t crítico
 * (las raíces de (b₃² − t²V₃₃)w² + 2(b₁b₃ − t²V₁₃)w + b₁² − t²V₁₁ = 0 dentro del recorrido observado de W).
 * @param {Ecuacion} e
 * @param {ArrayLike<number>} beta
 * @param {Float64Array[]} V la matriz de covarianzas de los coeficientes (σ²(X'X)⁻¹)
 * @param {number} gl
 * @param {number[]} ws
 * @param {Float64Array} W
 * @param {number} nivel
 */
function condicionalesModeracion(e, beta, V, gl, ws, W, nivel) {
    const iX = e.columnas.findIndex(c => c.nombre === 'X') + 1, iXW = e.columnas.findIndex(c => c.nombre === 'X·W') + 1;
    const b1 = /** @type {number} */ (beta[iX]), b3 = /** @type {number} */ (beta[iXW]);
    const v11 = /** @type {number} */ (/** @type {Float64Array} */ (V[iX])[iX]), v33 = /** @type {number} */ (/** @type {Float64Array} */ (V[iXW])[iXW]), v13 = /** @type {number} */ (/** @type {Float64Array} */ (V[iX])[iXW]);
    const tc = cuantilT(1 - (1 - nivel) / 2, gl);
    const efecto = (/** @type {number} */ w) => {
        const th = b1 + b3 * w, ee = Math.sqrt(Math.max(0, v11 + 2 * w * v13 + w * w * v33)), t = th / ee;
        return { w, efecto: th, ee, t, pValor: pTBilateral(t, gl), ic: /** @type {[number, number]} */ ([th - tc * ee, th + tc * ee]) };
    };
    // Johnson-Neyman
    const A = b3 * b3 - tc * tc * v33, B = 2 * (b1 * b3 - tc * tc * v13), C = b1 * b1 - tc * tc * v11;
    /** @type {number[]} */ let raices = [];
    if (Math.abs(A) > 1e-15) { const disc = B * B - 4 * A * C; if (disc >= 0) { const s = Math.sqrt(disc); raices = [(-B - s) / (2 * A), (-B + s) / (2 * A)]; } }
    else if (Math.abs(B) > 1e-15) raices = [-C / B];
    let wmin = Infinity, wmax = -Infinity; for (const w of W) { if (w < wmin) wmin = w; if (w > wmax) wmax = w; }
    const dentro = raices.filter(r => r > wmin && r < wmax).sort((a, b) => a - b);
    // la región: los tramos del recorrido de W (entre sus extremos y las raíces) en que el efecto es significativo
    const cortes = [wmin, ...dentro, wmax];
    const tramos = cortes.slice(0, -1).map((a, i) => { const b = /** @type {number} */ (cortes[i + 1]), m = efecto((a + b) / 2); return { desde: a, hasta: b, significativo: m.pValor < 1 - nivel, signo: Math.sign(m.efecto) }; });
    return { condicionales: ws.map(efecto), johnsonNeyman: { puntos: dentro, tramos, minimo: wmin, maximo: wmax, tCritico: tc } };
}

/**
 * La estimación completa de un modelo, sin el bootstrap: las ecuaciones con su inferencia por mínimos cuadrados, los
 * efectos puntuales y, en la moderación, los condicionales con la región de Johnson-Neyman y la ΔR² de la interacción.
 * @param {PedidoProceso} pedido
 * @param {{ nivel?: number }} [opciones]
 */
export function estimarProceso(pedido, { nivel = 0.95 } = {}) {
    const modelo = pedido.modelo, v = prepararVariables(pedido), ecs = ecuaciones(modelo, v), n = v.Y.length;
    const ajustes = ecs.map(e => regresionMco(e.y, e.columnas.map(c => c.valores), { nivel }));
    if (ajustes.some(a => a === null)) throw new Error('Alguna ecuación no se puede estimar: hay variables colineales (o una dependiente constante).');
    const fits = /** @type {NonNullable<ReturnType<typeof regresionMco>>[]} */ (ajustes);
    const ws = v.W ? valoresDeW(v.W) : [];
    const escalas = { deX: desviacion(v.X), deY: desviacion(v.Y) };
    const puntuales = efectosIndirectos(modelo, ecs, fits.map(f => f.beta), ws, escalas);
    /** @type {any} */ const res = {
        modelo, n, nivel, centrado: v.centrado, centros: v.centros, valoresW: ws.map(w => w + v.centros.w),
        ecuaciones: ecs.map((e, i) => {
            const f = /** @type {NonNullable<ReturnType<typeof regresionMco>>} */ (fits[i]);
            return { dependiente: e.dependiente, predictores: ['constante', ...e.columnas.map(c => c.nombre)], beta: Array.from(f.beta), ee: Array.from(f.ee), t: Array.from(f.t), pValores: Array.from(f.pValores), ic: f.ic, r2: f.r2, F: f.F, pF: f.pF, gl1: e.columnas.length, gl2: f.gl, betaEstandarizado: Array.from(f.betaEstandarizado) };
        }),
        puntuales
    };
    // la interacción: ΔR² al añadirla (la F con 1 y gl del modelo completo es la t² de su coeficiente)
    const conProducto = ecs.findIndex(e => e.columnas.some(c => c.nombre.includes('·')));
    if (conProducto >= 0) {
        const e = /** @type {Ecuacion} */ (ecs[conProducto]), f = /** @type {NonNullable<ReturnType<typeof regresionMco>>} */ (fits[conProducto]);
        const sin = regresionMco(e.y, e.columnas.filter(c => !c.nombre.includes('·')).map(c => c.valores), { nivel });
        const iP = e.columnas.findIndex(c => c.nombre.includes('·')) + 1, t = /** @type {number} */ (f.t[iP]);
        res.interaccion = { ecuacion: e.dependiente, termino: /** @type {Columna} */ (e.columnas[iP - 1]).nombre, deltaR2: sin ? f.r2 - sin.r2 : NaN, F: t * t, gl1: 1, gl2: f.gl, pValor: /** @type {number} */ (f.pValores[iP]) };
    }
    if (modelo === 1) {
        const e = /** @type {Ecuacion} */ (ecs[0]), a = ajustarMco(e.y, e.columnas.map(c => c.valores), { conInversa: true }), f = /** @type {NonNullable<ReturnType<typeof regresionMco>>} */ (fits[0]);
        const V = /** @type {Float64Array[]} */ (/** @type {NonNullable<typeof a>} */ (a).inversa).map(fila => Float64Array.from(fila, x => x * f.sigma2));
        const c = condicionalesModeracion(e, f.beta, V, f.gl, ws, /** @type {Float64Array} */ (v.W), nivel);
        res.condicionales = c.condicionales.map(x => ({ ...x, w: x.w + v.centros.w }));
        res.johnsonNeyman = { ...c.johnsonNeyman, puntos: c.johnsonNeyman.puntos.map(w => w + v.centros.w), tramos: c.johnsonNeyman.tramos.map(t => ({ ...t, desde: t.desde + v.centros.w, hasta: t.hasta + v.centros.w })), minimo: c.johnsonNeyman.minimo + v.centros.w, maximo: c.johnsonNeyman.maximo + v.centros.w };
    }
    // la z de Sobel de cada indirecto simple (modelo 4), solo como referencia: supone normal el producto ab
    if (modelo === 4) {
        const ecY = /** @type {number} */ (ecs.findIndex(e => e.dependiente === 'Y'));
        res.sobel = v.M.map((_, j) => {
            const fa = /** @type {NonNullable<ReturnType<typeof regresionMco>>} */ (fits[j]), fy = /** @type {NonNullable<ReturnType<typeof regresionMco>>} */ (fits[ecY]);
            const iB = /** @type {Ecuacion} */ (ecs[ecY]).columnas.findIndex(c => c.nombre === `M${j + 1}`) + 1;
            const a = /** @type {number} */ (fa.beta[1]), sa = /** @type {number} */ (fa.ee[1]), b = /** @type {number} */ (fy.beta[iB]), sb = /** @type {number} */ (fy.ee[iB]);
            const z = a * b / Math.sqrt(b * b * sa * sa + a * a * sb * sb);
            return { z, pValor: Math.min(1, 2 * colaSuperiorNormal(Math.abs(z))) };
        });
    }
    return res;
}

/**
 * El modelo completo: la estimación y, en los modelos con efectos indirectos (4, 6, 7 y 14), el bootstrap de casos con
 * semilla: B remuestras, en cada una las ecuaciones de nuevo (con las variables ya centradas) y sus efectos; el intervalo
 * percentil (el de PROCESS por defecto) y el error típico bootstrap (la DE de las réplicas).
 * @param {PedidoProceso} pedido
 * @param {{ B?: number, semilla?: number, nivel?: number }} [opciones]
 * @param {((hecho: number, total: number) => void) | null} [alProgreso]
 */
export function analizarProceso(pedido, { B = 5000, semilla = 2027, nivel = 0.95 } = {}, alProgreso = null) {
    const res = estimarProceso(pedido, { nivel });
    if (pedido.modelo === 1) return res;
    const v = prepararVariables(pedido), ecs = ecuaciones(pedido.modelo, v), n = v.Y.length, ws = v.W ? valoresDeW(v.W) : [];
    // las columnas de cada ecuación, una sola vez; en cada remuestra se copian las filas elegidas
    const fuentes = ecs.map(e => ({ y: e.y, cols: e.columnas.map(c => c.valores) }));
    const tomar = (/** @type {Float64Array} */ col, /** @type {Int32Array} */ idx) => { const r = new Float64Array(n); for (let i = 0; i < n; i++) r[i] = /** @type {number} */ (col[/** @type {number} */ (idx[i])]); return r; };
    // una remuestra en que alguna ecuación no se puede estimar (colineal) cuenta como inválida en todos los efectos
    const claves = Object.keys(res.puntuales), invalida = Object.fromEntries(claves.map(c => [c, NaN]));
    const { reps, invalidas } = bootstrap(n, idx => {
        /** @type {Float64Array[]} */ const betas = [];
        for (const f of fuentes) {
            const a = ajustarMco(tomar(f.y, idx), f.cols.map(c => tomar(c, idx)));
            if (!a) return invalida;
            betas.push(a.beta);
        }
        return efectosIndirectos(pedido.modelo, ecs, betas, ws, { deX: desviacion(tomar(v.X, idx)), deY: desviacion(tomar(v.Y, idx)) });
    }, { B, semilla, alProgreso, cada: 50 });
    res.bootstrap = { B, semilla, nivel, invalidas: Math.max(0, ...Object.values(invalidas)), efectos: Object.fromEntries(claves.map(c => {
        const r = reps[c] || [], ic = r.length ? intervaloPercentil(r, nivel) : { inferior: NaN, superior: NaN };
        return [c, { estimado: res.puntuales[c], ee: r.length > 1 ? desviacion(r) : NaN, inferior: ic.inferior, superior: ic.superior, validas: r.length }];
    })) };
    return res;
}
