// analizador/sem-motor.js — motor de ecuaciones estructurales (SEM).
// Origen: sem-motor.js (Fase 3), sin cambios de comportamiento; dependencias explícitas.

import { AnalizadorEstadistico } from './estadistica.js';
import { bfgs } from './psicometria/optimizacion.js';
import { gradienteFML, inferenciaInformacion, implicada, aplicarTheta } from './psicometria/ram.js';
import { validezConstructo } from './psicometria/validez.js';
import { inversaYLogDet } from '../core/linalg/cholesky.js';
import { ceros, identidad, multiplicar, traspuesta } from '../core/linalg/matrices.js';
import { gaussJordan } from '../core/linalg/gauss.js';
import { cdfChi2NoCentral, ncpParaProbabilidad } from '../core/stats/numerico.js';
import { estadisticosOrdinales, ajustarDWLS, inferenciaWLSMV, parametrosWLSMV } from './psicometria/wlsmv.js';
import { pChiCuadrado, colaSuperiorNormal } from '../core/stats/numerico.js';
import { aNumero } from '../core/data/celdas.js';
import { matrizCovarianzas } from '../core/stats/descriptivos.js';

// ============================================================================
// SEM — MOTOR DE ECUACIONES ESTRUCTURALES · StatSim Pro
// ----------------------------------------------------------------------------
// Fase 1: núcleo matemático. Implementa CFA, análisis de rutas (path analysis),
// mediación y SEM completo bajo una única formulación unificada: el modelo RAM
// (Reticular Action Model; McArdle & McDonald, 1984), en el que TODA la
// estructura se expresa con tres matrices:
//
//     Σ(θ) = F · (I − A)⁻¹ · S · (I − A)⁻ᵀ · Fᵀ
//
//   · A  (asimétrica): efectos direccionales — cargas factoriales (=~) y
//         regresiones (~). A[i][j] = coeficiente de la flecha j → i.
//   · S  (simétrica) : varianzas y covarianzas — residuales, de exógenas y
//         las covarianzas libres declaradas con ~~.
//   · F  (filtro)    : selecciona las variables observadas (las latentes
//         existen en el modelo pero no en los datos).
//
// Estimación: máxima verosimilitud bajo normalidad multivariante, minimizando
//     F_ML(θ) = log|Σ(θ)| + tr(S·Σ(θ)⁻¹) − log|S| − p        (Bollen, 1989, ec. 4.60)
// (2026.10.13) por BFGS con el gradiente analítico del modelo RAM (psicometria/ram.js); el simplex de Nelder-Mead
// (Nelder & Mead, 1965) queda como respaldo. Errores estándar por la información esperada (analítica); antes, por
// información observada: Cov(θ̂) ≈ H⁻¹, con H el hessiano numérico de
// (n−1)/2 · F_ML (Bollen, 1989, cap. 4).
//
// Índices de ajuste (con su fuente):
//   · χ² = (n−1)·F_ML                        (Bollen, 1989)
//   · CFI                                    (Bentler, 1990)
//   · TLI / NNFI                             (Tucker & Lewis, 1973)
//   · RMSEA + IC 90 % vía χ² no central      (Steiger, 1990; Browne & Cudeck, 1993)
//   · SRMR                                   (convención de Hu & Bentler, 1999)
// Identificación de escala de latentes: método del marcador (primera carga
// fijada a 1), el mismo criterio por defecto de lavaan (Rosseel, 2012).
//
// Sintaxis de modelo (subconjunto lavaan):
//   IE =~ ie1 + ie2 + ie3        // medición: latente =~ indicadores
//   rendimiento ~ IE + edad      // estructural: y ~ predictores
//   ie1 ~~ ie2                   // covarianza libre entre errores
// ============================================================================

const SEM = {

    _ultimos: [],          // historial de modelos ajustados (para comparación): uno por papel (_recordar; en la página, tres: el inicial, el alternativo y el final), cinco como mucho

    /**
     * (2027.01.06) Guarda un modelo ajustado en el historial de la comparación de modelos (la de la tarjeta y la del capítulo
     * de Word), en lugar del de su mismo papel (su etiqueta: «Modelo inicial», «Modelo alternativo» o «Modelo final»), que
     * sale de él: volver a ajustar un papel lo reemplaza. Va al final: es el último ajustado, el que muestran la tarjeta y el
     * capítulo. Hasta la 2027.01.05 se sumaba: repetir un paso del SEM de un ejemplo (o «Ajustar modelo» con el mismo papel)
     * dejaba dos «Modelo final» en la comparación y en el capítulo.
     * @param {{ etiquetaModelo: string }} R el modelo ajustado
     */
    _recordar(R) {
        const i = this._ultimos.findIndex(M => M.etiquetaModelo === R.etiquetaModelo);
        if (i >= 0) this._ultimos.splice(i, 1);
        this._ultimos.push(R);
        if (this._ultimos.length > 5) this._ultimos.shift();
    },

    // ═════════════════ ÁLGEBRA MATRICIAL BÁSICA ═════════════════
    // (2026.12.25) Del núcleo único (core/linalg/): envoltorios de una línea con los nombres de siempre.
    _zeros(r, c) { return ceros(r, c); },
    _eye(nn) { return identidad(nn); },
    _mult(X, Y) { return multiplicar(X, Y); },
    _traspuesta(X) { return traspuesta(X); },

    // Inversa y log-determinante SIMULTÁNEOS por eliminación de Gauss-Jordan con
    // pivoteo parcial. Devuelve null si la matriz no es definida (|piv| < 10⁻¹² o
    // determinante negativo) — señal que la optimización usa como penalización de
    // región inadmisible.
    _invLogDet(M) {
        const r = gaussJordan(M, 1e-12);
        return r && r.signo > 0 ? { inv: r.inversa, logDet: r.logDetAbs } : null;
    },

    // ═════════════════ PARSER DE SINTAXIS (subconjunto lavaan) ═════════════════
    // Devuelve { latentes:{F1:[ind…]}, regresiones:[{y, xs:[…]}], covars:[[a,b]…], repetidos:[…] }
    // (2027.01.13, revisión) Dos líneas «=~» de un mismo factor se suman, como en lavaan (la segunda reemplazaba a la primera,
    // y los indicadores de esta salían del modelo sin decirlo); y un indicador escrito dos veces en un factor cuenta una vez, y
    // se dice (repetidos): hasta la 2027.01.12, el primero (el marcador, fijado en 1) escrito otra vez se liberaba como un
    // parámetro más, y el modelo quedaba sin identificar (errores estándar de 10⁶) sin ningún aviso.
    parsear(sintaxis) {
        const modelo = { latentes: {}, regresiones: [], covars: [], repetidos: [] };
        const lineas = String(sintaxis || '').split(/\n|;/).map(l => l.replace(/#.*$/, '').trim()).filter(Boolean);
        for (const l of lineas) {
            let m;
            if ((m = l.match(/^(\S+)\s*=~\s*(.+)$/))) {
                const inds = modelo.latentes[m[1]] || (modelo.latentes[m[1]] = []);
                for (const ind of m[2].split('+').map(s => s.trim()).filter(Boolean)) {
                    if (inds.includes(ind)) modelo.repetidos.push(`La sintaxis escribe dos veces «${m[1]} =~ ${ind}»: cuenta una sola vez (si querías otro indicador, corrígela).`);
                    else inds.push(ind);
                }
            } else if ((m = l.match(/^(\S+)\s*~~\s*(\S+)$/))) {
                modelo.covars.push([m[1], m[2]]);
            } else if ((m = l.match(/^(\S+)\s*~\s*(.+)$/))) {
                modelo.regresiones.push({ y: m[1], xs: m[2].split('+').map(s => s.trim()).filter(Boolean) });
            } else {
                return { error: `Línea no reconocida en la sintaxis del modelo: «${l}»` };
            }
        }
        return modelo;
    },

    // ═════════════════ CONSTRUCCIÓN DEL MODELO RAM ═════════════════
    // Traduce el modelo parseado a: lista de variables (observadas + latentes),
    // plantillas de A y S con celdas fijas/libres, y el vector inicial θ₀.
    _construir(modelo, S_obs, nombresObs) {
        const latentes = Object.keys(modelo.latentes);
        const vars = [...nombresObs, ...latentes];
        const idx = Object.fromEntries(vars.map((v, i) => [v, i]));
        const nv = vars.length;
        const A = this._zeros(nv, nv);       // valores actuales
        const S = this._zeros(nv, nv);
        const libres = [];                    // [{mat:'A'|'S', i, j, nombre, ini}]
        // (2027.01.12) Cada celda libre, una sola vez: una covarianza que el modelo ya estima (entre latentes exógenas, o entre
        // observadas exógenas del bloque estructural) escrita también en la sintaxis (`F1 ~~ F2`, como en lavaan), la misma
        // escrita dos veces (o al revés), o una varianza escrita como `F1 ~~ F1`, entraban como un parámetro más sobre la misma
        // celda: los grados de libertad bajaban en uno por cada una (y con ellos la p del χ², el CFI, el TLI y el RMSEA), la
        // matriz de información quedaba singular (todos los EE, NaN) y la tabla repetía el parámetro con otro valor. Se queda el
        // primero (el que el modelo ya estimaba): en lavaan, escribir una covarianza que estima por omisión tampoco añade otra.
        // (2027.01.13, revisión) La celda del marcador (fijada en 1) también está ocupada: una regresión escrita sobre ella
        // (`x1 ~ F1` con `F1 =~ x1 + …`) la liberaba. Y si las dos son de la sintaxis (no una que el modelo estima por omisión),
        // se dice: «x1 ~ F1» es la misma flecha que «F1 =~ x1», `b ~~ a` la misma covarianza que `a ~~ b`.
        const ocupadas = new Map(), repetidos = [];
        const celdaDe = p => (p.mat === 'A' ? `A${p.i},${p.j}` : `S${Math.min(p.i, p.j)},${Math.max(p.i, p.j)}`);
        const libre = (p, escrito = false) => {
            const celda = celdaDe(p), previo = ocupadas.get(celda);
            if (previo) {
                if (escrito && previo.escrito) repetidos.push(previo.nombre === p.nombre
                    ? `La sintaxis escribe dos veces «${p.nombre}»: cuenta una sola vez.`
                    : `«${p.nombre}» es ${p.mat === 'A' ? 'la misma flecha' : 'la misma covarianza'} que «${previo.nombre}»: cuenta una sola vez.`);
                return;
            }
            ocupadas.set(celda, { nombre: p.nombre, escrito });
            libres.push(p);
        };
        const varMedia = nombresObs.map((_, j) => S_obs[j][j]);

        // Endógenas: las que reciben alguna flecha (indicadores o 'y' de ~).
        const endogenas = new Set();

        // 1) Medición: latente → indicadores. Primera carga fijada a 1 (marcador).
        for (const [F, inds] of Object.entries(modelo.latentes)) {
            inds.forEach((ind, k) => {
                if (!(ind in idx)) throw new Error(`El indicador «${ind}» no existe en los datos.`);
                endogenas.add(ind);
                if (k === 0) { A[idx[ind]][idx[F]] = 1; ocupadas.set(`A${idx[ind]},${idx[F]}`, { nombre: `${F} =~ ${ind}`, escrito: true }); } // marcador (Rosseel, 2012)
                else libre({ mat: 'A', i: idx[ind], j: idx[F], nombre: `${F} =~ ${ind}`, ini: 0.7 }, true);
            });
        }
        // 2) Estructural: y ~ x1 + x2…
        for (const r of modelo.regresiones) {
            if (!(r.y in idx)) throw new Error(`La variable «${r.y}» no existe.`);
            endogenas.add(r.y);
            for (const x of r.xs) {
                if (!(x in idx)) throw new Error(`El predictor «${x}» no existe.`);
                libre({ mat: 'A', i: idx[r.y], j: idx[x], nombre: `${r.y} ~ ${x}`, ini: 0 }, true);
            }
        }
        // 3) S: varianzas — residual si endógena, total si exógena. Latentes
        //    exógenas: varianza libre; latentes endógenas: residual libre.
        vars.forEach((v, i) => {
            const esLat = i >= nombresObs.length;
            const base = esLat ? 0.5 : varMedia[i];
            const ini = endogenas.has(v) ? base * 0.5 : base;
            libre({ mat: 'S', i, j: i, nombre: endogenas.has(v) ? `var residual (${v})` : `var (${v})`, ini: Math.max(ini, 0.05) });
        });
        // 4) Covarianzas libres declaradas (~~) + covarianzas entre exógenas
        //    observadas del bloque estructural (convención lavaan: exógenas
        //    correlacionan libremente).
        const exogObs = new Set();
        modelo.regresiones.forEach(r => r.xs.forEach(x => { if (idx[x] < nombresObs.length && !endogenas.has(x)) exogObs.add(x); }));
        const exo = [...exogObs];
        for (let a = 0; a < exo.length; a++) for (let b = a + 1; b < exo.length; b++) {
            libre({ mat: 'S', i: idx[exo[a]], j: idx[exo[b]], nombre: `${exo[a]} ~~ ${exo[b]}`, ini: S_obs[idx[exo[a]]][idx[exo[b]]] });
        }
        // Latentes exógenas múltiples: correlación libre entre factores (CFA estándar).
        const latExo = latentes.filter(F => !endogenas.has(F));
        for (let a = 0; a < latExo.length; a++) for (let b = a + 1; b < latExo.length; b++) {
            libre({ mat: 'S', i: idx[latExo[a]], j: idx[latExo[b]], nombre: `${latExo[a]} ~~ ${latExo[b]}`, ini: 0.2 });
        }
        for (const [a, b] of modelo.covars) {
            if (!(a in idx) || !(b in idx)) throw new Error(`Covarianza ~~ con variable inexistente (${a}, ${b}).`);
            libre({ mat: 'S', i: idx[a], j: idx[b], nombre: `${a} ~~ ${b}`, ini: 0.1 }, true);
        }
        return { vars, idx, nObs: nombresObs.length, A, S, libres, latentes, repetidos: [...new Set(repetidos)] };
    },

    // Σ(θ) del modelo RAM (las observadas, primeras por construcción), con la condición de admisibilidad del objetivo: null si
    // det(I − A) ≤ 0 o si un pivote de (I − A)⁻¹ es menor que 10⁻¹². (2026.12.25) La de psicometria/ram.js, la misma que dan
    // la solución estandarizada y el gradiente; antes, una copia aquí.
    _sigma(est, theta) { const m = implicada(est, theta, { admisible: true }); return m ? m.Sigma : null; },

    // F_ML(θ) — discrepancia de máxima verosimilitud (Bollen, 1989, ec. 4.60).
    _fml(est, theta, S_obs, logDetS) {
        const Sig = this._sigma(est, theta);
        if (!Sig) return 1e10;
        // (2026.10.13) Σ debe ser definida positiva (Cholesky): con un Σ indefinido la verosimilitud no existe, aunque
        // |det| permita calcular un número; antes se aceptaba y el optimizador podía detenerse ahí (gradiente no finito)
        const il = inversaYLogDet(Sig);   // una sola factorización de Cholesky: inversa y ln|Σ|
        if (!il) return 1e10;
        let tr = 0;
        const p = est.nObs;
        for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) tr += S_obs[i][j] * il.inv[j][i];
        const f = il.logDet + tr - logDetS - p;
        return Number.isFinite(f) ? Math.max(f, 0) : 1e10;
    },

    // ═════════════════ OPTIMIZADOR: NELDER-MEAD ═════════════════
    // (Nelder & Mead, 1965) con reinicio del simplex. Sin gradientes: robusto
    // ante las penalizaciones de región no admisible de F_ML.
    _nelderMead(f, x0, opciones = {}) {
        const maxIter = opciones.maxIter || 4000, tol = opciones.tol || 1e-10;
        const n = x0.length;
        let simplex = [x0.slice()];
        for (let i = 0; i < n; i++) {
            const x = x0.slice();
            x[i] += (Math.abs(x[i]) > 0.1 ? 0.1 * Math.abs(x[i]) : 0.1);
            simplex.push(x);
        }
        let fx = simplex.map(f);
        const orden = () => {
            const ix = fx.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]).map(p => p[1]);
            simplex = ix.map(i => simplex[i]); fx = ix.map(i => fx[i]);
        };
        for (let it = 0; it < maxIter; it++) {
            orden();
            if (Math.abs(fx[n] - fx[0]) < tol * (Math.abs(fx[0]) + tol)) {
                if (opciones._reiniciado) break;
                // Reinicio: nuevo simplex alrededor del mejor punto (escapa mesetas).
                const mejor = simplex[0].slice();
                simplex = [mejor];
                for (let i = 0; i < n; i++) { const x = mejor.slice(); x[i] += 0.02 * (Math.abs(x[i]) + 0.1); simplex.push(x); }
                fx = simplex.map(f);
                opciones._reiniciado = true;
                continue;
            }
            const centro = new Array(n).fill(0);
            for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) centro[k] += simplex[i][k] / n;
            const refl = centro.map((c, k) => c + (c - simplex[n][k]));
            const fr = f(refl);
            if (fr < fx[0]) {
                const exp = centro.map((c, k) => c + 2 * (c - simplex[n][k]));
                const fe = f(exp);
                if (fe < fr) { simplex[n] = exp; fx[n] = fe; } else { simplex[n] = refl; fx[n] = fr; }
            } else if (fr < fx[n - 1]) {
                simplex[n] = refl; fx[n] = fr;
            } else {
                const con = centro.map((c, k) => c + 0.5 * (simplex[n][k] - c));
                const fc = f(con);
                if (fc < fx[n]) { simplex[n] = con; fx[n] = fc; }
                else for (let i = 1; i <= n; i++) { simplex[i] = simplex[i].map((v, k) => simplex[0][k] + 0.5 * (v - simplex[0][k])); fx[i] = f(simplex[i]); }
            }
        }
        orden();
        return { x: simplex[0], f: fx[0] };
    },

    // ═════════════════ INFERENCIA: SE, χ², ÍNDICES ═════════════════
    // Hessiano numérico (diferencias centrales) de L(θ) = (n−1)/2 · F_ML.
    _errores(est, theta, S_obs, logDetS, n) {
        const k = theta.length;
        const L = t => ((n - 1) / 2) * this._fml(est, t, S_obs, logDetS);
        const h = theta.map(t => Math.max(1e-4, 1e-3 * Math.abs(t)));
        const H = this._zeros(k, k);
        const L0 = L(theta);
        for (let i = 0; i < k; i++) for (let j = i; j < k; j++) {
            const tpp = theta.slice(), tpm = theta.slice(), tmp = theta.slice(), tmm = theta.slice();
            tpp[i] += h[i]; tpp[j] += h[j];
            tpm[i] += h[i]; tpm[j] -= h[j];
            tmp[i] -= h[i]; tmp[j] += h[j];
            tmm[i] -= h[i]; tmm[j] -= h[j];
            H[i][j] = H[j][i] = (L(tpp) - L(tpm) - L(tmp) + L(tmm)) / (4 * h[i] * h[j]);
        }
        const il = this._invLogDet(H);
        if (!il) return theta.map(() => NaN);
        return theta.map((_, i) => il.inv[i][i] > 0 ? Math.sqrt(il.inv[i][i]) : NaN);
    },

    // CDF de χ² no central por mezcla de Poisson (Johnson, Kotz & Balakrishnan,
    // 1995) — para el IC 90 % del RMSEA (Browne & Cudeck, 1993).
    // (2026.10.19) delega en numerico.js: pesos de Poisson en escala logarítmica (antes, e^(−ncp/2) se anulaba con ncp > ~1400)
    _pChi2NC(x, df, ncp) { return cdfChi2NoCentral(x, df, ncp); },
    // Búsqueda del ncp tal que P(χ²_nc(df,ncp) ≤ chi2) = objetivo.
    _ncpPara(chi2, df, objetivo) { return ncpParaProbabilidad(chi2, df, objetivo); },

    // ═════════════════ VALIDEZ CONVERGENTE Y DISCRIMINANTE (2026.10.16) ═════════════════
    // Solución completamente estandarizada a partir de la matriz implicada E (observadas y latentes): λ* = λ·√φ/√σ_jj y
    // θ* = θ/σ_jj; con WLSMV, σ_jj = 1 (escala de y*) y θ* = 1 − comunalidad. Rcorr: correlaciones entre ítems (Pearson o
    // policóricas) para el HTMT.
    // (2027.01.12) Solo los factores de primer orden (con todos sus indicadores observados): uno de segundo orden no tiene ítems
    // para el HTMT, y lo rompía.
    _validez(modelo, est, theta, E, Rcorr, esWLSMV) {
        const { A, S } = aplicarTheta(est, theta), idx = Object.fromEntries(est.vars.map((v, i) => [v, i]));
        const factores = Object.entries(modelo.latentes).filter(([, inds]) => inds.length >= 2 && inds.every(it => idx[it] < est.nObs)).map(([F, inds]) => {
            const f = idx[F];
            return { nombre: F, items: inds, lambdas: inds.map(it => A[idx[it]][f] * Math.sqrt(E[f][f]) / (esWLSMV ? 1 : Math.sqrt(E[idx[it]][idx[it]]))),
                     thetas: inds.map(it => (esWLSMV ? 1 - E[idx[it]][idx[it]] : S[idx[it]][idx[it]] / E[idx[it]][idx[it]])) };
        });
        if (!factores.length) return null;
        const corr = factores.map(F => factores.map(G => E[idx[F.nombre]][idx[G.nombre]] / Math.sqrt(E[idx[F.nombre]][idx[F.nombre]] * E[idx[G.nombre]][idx[G.nombre]])));
        return validezConstructo(factores, corr, Rcorr, est.vars.slice(0, est.nObs));
    },

    /**
     * (2027.01.13, revisión) Los avisos de la especificación: lo que la sintaxis repite (cuenta una vez) y, con la información
     * (o la Δᵀ·W·Δ del WLSMV) singular o casi, que el modelo no parece identificado. Hasta la 2027.01.12, un modelo así
     * (un marcador escrito dos veces, un factor de segundo orden de dos factores) daba sus errores estándar (de 26 a 10⁶) y
     * sus p sin aviso. (2027.01.14, revisión) Con su causa probable (`_causaDeLaSingularidad`): hasta la 2027.01.13 daba
     * siempre las de las latentes, también en un modelo de rutas sin latentes con dos predictores casi iguales.
     * @param {{ latentes: Record<string, string[]>, regresiones: Array<{ y: string, xs: string[] }>, repetidos?: string[] }} modelo
     * @param {{ repetidos: string[] }} est
     * @param {boolean} singular @param {number[][]} R las correlaciones de las observadas (con WLSMV, las policóricas)
     * @param {string[]} nombres las observadas
     * @returns {string[]}
     */
    _avisosDeLaSintaxis(modelo, est, singular, R, nombres) {
        const avisos = [...new Set([...(modelo.repetidos || []), ...est.repetidos])];
        if (singular) avisos.push(`El modelo no parece identificado: su matriz de información es singular (o casi), así que hay parámetros que los datos no determinan, y sus errores estándar, sus z y sus p no son fiables. ${this._causaDeLaSingularidad(modelo, R, nombres)}`);
        return avisos;
    },

    /**
     * (2027.01.14, revisión) La causa probable de una información singular: dos observadas casi perfectamente correlacionadas
     * (|r| > 0,999, como un total y su media redondeada) o una casi combinación lineal de las demás (R² > 0,999 con ellas), que
     * el modelo no puede separar aunque esté identificado; si no, lo que tiene el modelo que suele dejarlo sin identificar
     * (_causasDeLaEspecificacion).
     * @param {{ latentes: Record<string, string[]>, regresiones: Array<{ y: string, xs: string[] }> }} modelo
     * @param {number[][]} R @param {string[]} nombres
     * @returns {string}
     */
    _causaDeLaSingularidad(modelo, R, nombres) {
        const p = nombres.length;
        // la observada mejor explicada por las demás: R²ⱼ = 1 − 1/(R⁻¹)ⱼⱼ, solo con R definida positiva (2027.01.16, revisión:
        // una policórica con dos autovalores negativos tiene determinante positivo y daba un R² de 4,48); sin ella, una pareja
        const ri = p > 1 ? inversaYLogDet(R) : null;
        let j = -1, R2 = 1;
        if (ri) for (let k = 0; k < p; k++) { const r2 = 1 - 1 / ri.inv[k][k]; if (j < 0 || r2 > R2) { j = k; R2 = r2; } }
        let a = -1, b = -1, r = 0;
        for (let x = 0; x < p; x++) for (let y = x + 1; y < p; y++) if ((j < 0 || x === j || y === j) && Math.abs(R[x][y]) > Math.abs(r)) { a = x; b = y; r = R[x][y]; }
        if (a >= 0 && Math.abs(r) > 0.999) return `«${nombres[a]}» y «${nombres[b]}» están casi perfectamente correlacionadas (r = ${r.toFixed(4)}): el modelo no puede separar lo que aporta cada una (como un total y su media). Deja solo una.`;
        if (j >= 0 && R2 > 0.999) return `«${nombres[j]}» es casi una combinación lineal de otras variables del modelo (R² = ${R2.toFixed(4)} con ellas): el modelo no puede separar lo que aporta cada una. Quita alguna.`;
        return this._causasDeLaEspecificacion(modelo);
    },

    /**
     * (2027.01.16, revisión) Lo que tiene el modelo que suele dejarlo sin identificar, con sus nombres: unas rutas recíprocas
     * (un bucle de regresiones), un factor de solo dos indicadores, un factor de segundo orden de solo dos factores; sin nada
     * de eso, una frase neutra con las tres. Hasta la 2027.01.15, con alguna latente daba siempre las dos de las latentes
     * (también con un factor de cuatro ítems y unas rutas recíprocas entre observadas), y sin latentes, las rutas recíprocas.
     * @param {{ latentes: Record<string, string[]>, regresiones: Array<{ y: string, xs: string[] }> }} modelo
     * @returns {string}
     */
    _causasDeLaEspecificacion(modelo) {
        const latentes = modelo.latentes, nombres = Object.keys(latentes);
        /** @type {string[]} */
        const causas = [];
        const bucle = this._bucleDeRegresiones(modelo.regresiones || []);
        if (bucle) causas.push(`unas rutas recíprocas (${bucle.length === 2 ? `«${bucle[0]}» ⇄ «${bucle[1]}»` : [...bucle, bucle[0]].map(v => `«${v}»`).join(' → ')}) sin variables que las identifiquen`);
        const deDos = nombres.filter(F => latentes[F].length === 2 && !latentes[F].some(v => v in latentes));
        if (deDos.length) causas.push(`un factor de solo dos indicadores (${deDos.map(F => `«${F}»`).join(', ')}), que solo se identifica si se relaciona con otro`);
        const segundo = nombres.filter(G => latentes[G].length === 2 && latentes[G].every(v => v in latentes));
        if (segundo.length) causas.push(`un factor de segundo orden con solo dos factores (${segundo.map(G => `«${G}»`).join(', ')})`);
        if (!causas.length) return 'Revisa la especificación: hay parámetros que el modelo no puede separar (suele deberse a un factor de solo dos indicadores que no se relaciona con nada más, a un factor de segundo orden con solo dos factores o a unas rutas recíprocas sin variables que las identifiquen).';
        const lista = causas.length === 1 ? causas[0] : `${causas.slice(0, -1).join(', ')} o ${causas[causas.length - 1]}`;
        return `Suele deberse a ${lista}; revisa la especificación.`;
    },

    /**
     * (2027.01.16, revisión) Un bucle de regresiones (rutas recíprocas: «y1 ~ y2» y «y2 ~ y1», o uno más largo), con sus
     * variables en orden, o null. Búsqueda en profundidad sobre el grafo de las regresiones (de cada predictora a su variable).
     * @param {Array<{ y: string, xs: string[] }>} regresiones
     * @returns {string[] | null}
     */
    _bucleDeRegresiones(regresiones) {
        /** @type {Map<string, string[]>} */
        const sale = new Map();
        for (const r of regresiones) for (const x of r.xs) sale.set(x, [...(sale.get(x) || []), r.y]);
        /** @type {Map<string, number>} 1: en el camino; 2: terminada */
        const estado = new Map();
        /** @type {string[]} */
        const camino = [];
        /** @param {string} v @returns {string[] | null} */
        const visitar = v => {
            estado.set(v, 1); camino.push(v);
            for (const w of sale.get(v) || []) {
                if (estado.get(w) === 1) return camino.slice(camino.indexOf(w));
                if (!estado.has(w)) { const b = visitar(w); if (b) return b; }
            }
            estado.set(v, 2); camino.pop();
            return null;
        };
        for (const v of sale.keys()) if (!estado.has(v)) { const b = visitar(v); if (b) return b; }
        return null;
    },

    // ═════════════════ WLSMV (ítems ordinales; 2026.10.15) ═════════════════
    // DWLS sobre las correlaciones policóricas con W = diag(Γ)⁻¹, errores estándar robustos y χ² corregido en media y
    // varianza (psicometria/wlsmv.js). En esta versión, toda variable observada debe ser indicador de un factor.
    _ajustarWLSMV(modelo, sintaxis, etiquetaModelo, nombresObs, filas) {
        const n = filas.length, p = nombresObs.length;
        const indicadores = new Set(Object.values(modelo.latentes).flat());
        const noIndicador = nombresObs.filter(v => !indicadores.has(v));
        if (noIndicador.length) return { error: `WLSMV: toda variable observada debe ser indicador de un factor; no lo son: ${noIndicador.join(', ')}. Para rutas con variables observadas usa ML.` };
        const cols = nombresObs.map((_, j) => filas.map(f => f[j]));
        const noOrdinal = nombresObs.filter((v, j) => !cols[j].every(Number.isInteger) || new Set(cols[j]).size > 10);
        if (noOrdinal.length) return { error: `WLSMV es para ítems ordinales (enteros, hasta 10 categorías); no lo son: ${noOrdinal.join(', ')}. Usa ML.` };
        const sm = estadisticosOrdinales(cols);
        if (sm.error) return { error: 'WLSMV: ' + sm.error };
        let est;
        try { est = this._construir(modelo, sm.R, nombresObs); }
        catch (e) { return { error: e.message }; }
        const qW = parametrosWLSMV(est).length;
        if (qW > sm.pares.length) return { error: `Modelo no identificado: ${qW} parámetros frente a ${sm.pares.length} correlaciones policóricas.` };
        const fit = ajustarDWLS(est, sm);
        const inf = inferenciaWLSMV(sm, fit);
        if (inf.error) return { error: inf.error };
        const { chi2, gl, CFI, TLI, RMSEA, SRMR } = inf, q = fit.libres.length;
        const pChi2 = gl > 0 ? pChiCuadrado(Math.max(chi2, 0), gl) : NaN;   // χ² ≤ 0 (ajuste perfecto con redondeo): p = 1, como antes
        let rmseaIC = [NaN, NaN];
        if (gl > 0) {
            const hi = this._ncpPara(chi2, gl, 0.05), lo = this._pChi2NC(chi2, gl, 0) < 0.95 ? 0 : this._ncpPara(chi2, gl, 0.95);
            rmseaIC = [Math.sqrt(lo / (gl * n)), Math.sqrt(hi / (gl * n))];
        }
        const parametros = fit.libres.map((k, a) => {
            const pl = est.libres[k], estimado = fit.theta[k], se = inf.se[a], z = estimado / se;
            return { nombre: pl.nombre, tipo: pl.mat === 'A' ? 'coeficiente' : 'var/cov', estimado, se, z,
                     pValor: Number.isFinite(z) ? 2 * colaSuperiorNormal(Math.abs(z)) : NaN };
        });
        // Admisibilidad: comunalidad de cada ítem ≤ 1 (varianza residual de y* = 1 − comunalidad) y correlaciones latentes ≤ 1
        const avisos = [];
        for (let j = 0; j < p; j++) if (fit.E[j][j] > 1) avisos.push(`La comunalidad de «${nombresObs[j]}» es ${fit.E[j][j].toFixed(3)} (> 1): su varianza residual sería negativa (caso Heywood); la solución no es admisible.`);
        for (let i = est.nObs; i < est.vars.length; i++) for (let j = i + 1; j < est.vars.length; j++) {
            const r = fit.E[i][j] / Math.sqrt(fit.E[i][i] * fit.E[j][j]);
            if (Math.abs(r) > 1) avisos.push(`La correlación implicada entre «${est.vars[i]}» y «${est.vars[j]}» es ${r.toFixed(3)}: solución no admisible.`);
        }
        const admisible = avisos.length === 0;
        avisos.push(...this._avisosDeLaSintaxis(modelo, est, inf.singular, sm.R, nombresObs));
        const pobres = sm.corregidas.filter(c => c[2] < 0.5);
        if (pobres.length) avisos.push(`En ${pobres.length === 1 ? 'la pareja' : `${pobres.length} parejas`} ${pobres.slice(0, 4).map(([a, b]) => `${nombresObs[a]}–${nombresObs[b]}`).join(', ')}${pobres.length > 4 ? '…' : ''} la celda vacía es esperable incluso sin relación entre los ítems (una categoría con muy pocos casos): su correlación tetracórica apenas está determinada por los datos. Revisa esos ítems (p. ej., uno que casi todos aciertan o fallan) y considera excluirlos.`);
        if (sm.corregidas.length) avisos.push(`Se sumó 0,5 a la celda vacía de ${sm.corregidas.length === 1 ? 'una tabla' : `${sm.corregidas.length} tablas`} 2 × 2 (${sm.corregidas.slice(0, 4).map(([a, b]) => `${nombresObs[a]}–${nombresObs[b]}`).join(', ')}${sm.corregidas.length > 4 ? '…' : ''}), conservando los márgenes, como hace lavaan por defecto: sin esa corrección la correlación tetracórica queda en ±1 y el WLSMV no puede estimarse.`);
        const validez = this._validez(modelo, est, fit.theta, fit.E, sm.R, true);
        const R = { sintaxis, etiquetaModelo, n, p, q, gl, Fmin: fit.Fmin, chi2, pChi2, avisos, admisible, validez, tablasCorregidas: sm.corregidas.length,
                    chi2b: inf.chi2b, glb: inf.glb, CFI, TLI, RMSEA, rmseaIC, SRMR, parametros, vars: est.vars, latentes: est.latentes,
                    convergio: fit.opt.convergio, S_obs: sm.R, nombresObs, estimador: 'WLSMV',
                    desviaciones: Object.fromEntries(est.vars.map((v, i) => [v, i < est.nObs ? 1 : Math.sqrt(fit.E[i][i])])),   // y* con varianza 1
                    // (2027.01.13, revisión) la varianza residual de cada ítem (1 − su comunalidad), que no es un parámetro: con ella, el
                    // diagrama da la correlación de una covarianza entre dos ítems
                    varianzasResiduales: Object.fromEntries(nombresObs.map((v, j) => [v, 1 - fit.E[j][j]])),
                    chi2DWLS: inf.T, correccion: inf.correccion,   // (2027.01.04) estaban dentro del comentario de arriba: la página decía «DWLS sin corregir: NaN»
                    optimizacion: { metodo: 'BFGS', iteraciones: fit.opt.iteraciones, gradienteMax: fit.opt.gradienteMax, estado: fit.opt.estado } };
        this._recordar(R);
        return R;
    },

    // ═════════════════ API PRINCIPAL ═════════════════
    /**
     * Ajusta un modelo SEM/CFA/path por máxima verosimilitud.
     * @param {string} sintaxis  Modelo en sintaxis estilo lavaan.
     * @param {string[]} columnas  Variables observadas a usar (o null → inferir).
     * @param {string} etiquetaModelo  Nombre para el historial de comparación.
     */
    ajustar(sintaxis, columnas = null, etiquetaModelo = 'Modelo', opciones = {}) {
        const A = (typeof AnalizadorEstadistico !== 'undefined') ? AnalizadorEstadistico : null;
        const datos = A ? (A.obtenerDatos() || []) : [];
        const modelo = this.parsear(sintaxis);
        if (modelo.error) return modelo;

        // Variables observadas del modelo (todas las mencionadas que no sean latentes).
        const latentes = new Set(Object.keys(modelo.latentes));
        const mencionadas = new Set();
        // (2027.01.12) un indicador que es una latente (un factor de segundo orden: G =~ F1 + F2) no es una columna de los datos:
        // hasta la 2027.01.11 se buscaba como tal, y el modelo fallaba con «Casos insuficientes (0)»
        Object.values(modelo.latentes).forEach(inds => inds.forEach(i => { if (!latentes.has(i)) mencionadas.add(i); }));
        modelo.regresiones.forEach(r => { if (!latentes.has(r.y)) mencionadas.add(r.y); r.xs.forEach(x => { if (!latentes.has(x)) mencionadas.add(x); }); });
        modelo.covars.forEach(([a, b]) => { if (!latentes.has(a)) mencionadas.add(a); if (!latentes.has(b)) mencionadas.add(b); });
        const nombresObs = columnas || [...mencionadas];
        if (!nombresObs.length) return { error: 'El modelo no menciona ninguna variable observada.' };

        // Casos completos y matriz de covarianzas muestral (divisor n−1; Bollen, 1989).
        const filas = datos.map(d => nombresObs.map(c => aNumero(d[c]))).filter(f => f.every(Number.isFinite));   // (2026.12.18) antes +valor: la celda vacía contaba como 0
        const n = filas.length, p = nombresObs.length;
        if (n < p + 5) return { error: `Casos insuficientes (${n}) para ${p} variables observadas.` };
        if (opciones.estimador === 'WLSMV') return this._ajustarWLSMV(modelo, sintaxis, etiquetaModelo, nombresObs, filas);
        const S_obs = matrizCovarianzas(nombresObs.map((_, j) => filas.map(f => f[j])));   // (2026.12.25) la del núcleo único
        const ilS = this._invLogDet(S_obs);
        if (!ilS) return { error: 'La matriz de covarianzas muestral es singular: hay variables redundantes.' };

        // Construcción RAM, identificación mínima y optimización.
        let est;
        try { est = this._construir(modelo, S_obs, nombresObs); }
        catch (e) { return { error: e.message }; }
        const q = est.libres.length;
        const gl = p * (p + 1) / 2 - q;
        if (gl < 0) return { error: `Modelo no identificado: ${q} parámetros libres frente a ${p * (p + 1) / 2} momentos muestrales (gl = ${gl}). Simplifica el modelo o añade indicadores.` };

        // (2026.10.13) BFGS con el gradiente analítico del modelo RAM (psicometria/ram.js); Nelder–Mead queda solo como
        // respaldo si BFGS no converge (p. ej., un arranque muy lejano): se relanza BFGS desde el punto del simplex.
        const f = t => this._fml(est, t, S_obs, ilS.logDet);
        const g = t => gradienteFML(est, t, S_obs);
        const theta0 = est.libres.map(pl => pl.ini);
        let opt = bfgs(f, g, theta0, { maxIter: 3000, tolGrad: 1e-7 });
        if (!opt.convergio) {
            const nm = this._nelderMead(f, opt.f < 1e9 ? opt.x : theta0, { maxIter: 6000 });
            const opt2 = bfgs(f, g, nm.x, { maxIter: 3000, tolGrad: 1e-7 });
            if (opt2.convergio || opt2.f < opt.f) opt = { ...opt2, respaldo: true };
        }
        const theta = opt.x, Fmin = opt.f;

        // χ², p, índices — con el modelo de independencia como línea base.
        const chi2 = (n - 1) * Fmin;
        const pChi2 = gl > 0 ? pChiCuadrado(Math.max(chi2, 0), gl) : NaN;   // χ² ≤ 0 (ajuste perfecto con redondeo): p = 1, como antes
        // Línea base: solo varianzas (F_b tiene forma cerrada: log|diag(S)|−log|S|).
        let logDiag = 0;
        for (let i = 0; i < p; i++) logDiag += Math.log(S_obs[i][i]);
        const Fb = logDiag - ilS.logDet;
        const chi2b = (n - 1) * Fb, glb = p * (p - 1) / 2;
        const CFI = 1 - Math.max(chi2 - gl, 0) / Math.max(chi2b - glb, chi2 - gl, 1e-12);
        const TLI = glb > 0 && gl > 0 ? ((chi2b / glb) - (chi2 / gl)) / ((chi2b / glb) - 1) : NaN;
        const RMSEA = gl > 0 ? Math.sqrt(Math.max(chi2 - gl, 0) / (gl * (n - 1))) : 0;
        // IC 90 % del RMSEA (Browne & Cudeck, 1993): ncp tal que la CDF no
        // central deje 0.95 / 0.05 a la izquierda del χ² observado.
        let rmseaIC = [NaN, NaN];
        if (gl > 0) {
            const ncpHi = this._ncpPara(chi2, gl, 0.05);
            const ncpLo = this._pChi2NC(chi2, gl, 0) < 0.95 ? 0 : this._ncpPara(chi2, gl, 0.95);
            rmseaIC = [Math.sqrt(ncpLo / (gl * (n - 1))), Math.sqrt(ncpHi / (gl * (n - 1)))];
        }
        // SRMR: raíz del promedio de residuos de correlación al cuadrado (Hu & Bentler, 1999).
        const SigF = this._sigma(est, theta);
        let srmrSum = 0, srmrK = 0;
        for (let i = 0; i < p; i++) for (let j = 0; j <= i; j++) {
            const rObs = S_obs[i][j] / Math.sqrt(S_obs[i][i] * S_obs[j][j]);
            const rMod = SigF[i][j] / Math.sqrt(SigF[i][i] * SigF[j][j]);
            srmrSum += (rObs - rMod) ** 2; srmrK++;
        }
        const SRMR = Math.sqrt(srmrSum / srmrK);

        // Errores estándar, z y p por parámetro.
        // Errores estándar por la información esperada (analítica); si no es invertible, hessiano numérico como respaldo
        const info = inferenciaInformacion(est, theta, n);
        const se = info.se || this._errores(est, theta, S_obs, ilS.logDet, n);
        const parametros = est.libres.map((pl, k) => {
            const z = theta[k] / se[k];
            return { nombre: pl.nombre, tipo: pl.mat === 'A' ? 'coeficiente' : 'var/cov',
                     estimado: theta[k], se: se[k], z,
                     pValor: Number.isFinite(z)
                         ? 2 * colaSuperiorNormal(Math.abs(z)) : NaN };
        });

        // (2026.10.14) Soluciones no admisibles (casos Heywood): varianzas negativas o correlaciones entre latentes > 1
        const avisos = [];
        est.libres.forEach((pl, k) => {
            if (pl.mat === 'S' && pl.i === pl.j && theta[k] < 0) avisos.push(`Varianza negativa en «${pl.nombre}» (${theta[k].toFixed(3)}): caso Heywood. Suele indicar un factor con pocos indicadores, una carga próxima a 1 o un modelo mal especificado; la solución no es admisible.`);
        });
        const mImp = implicada(est, theta);
        if (mImp) for (let i = est.nObs; i < est.vars.length; i++) for (let j = i + 1; j < est.vars.length; j++) {
            const r = mImp.E[i][j] / Math.sqrt(mImp.E[i][i] * mImp.E[j][j]);
            if (Math.abs(r) > 1) avisos.push(`La correlación implicada entre «${est.vars[i]}» y «${est.vars[j]}» es ${r.toFixed(3)} (mayor que 1 en valor absoluto): solución no admisible; los factores podrían no distinguirse.`);
        }
        const Rcorr = S_obs.map((f, i) => f.map((v, j) => v / Math.sqrt(S_obs[i][i] * S_obs[j][j])));
        const validez = mImp ? this._validez(modelo, est, theta, mImp.E, Rcorr, false) : null;
        // (2026.10.18) desviaciones típicas implicadas: la de una latente endógena incluye la varianza explicada, no solo la perturbación
        const desviaciones = mImp ? Object.fromEntries(est.vars.map((v, i) => [v, Math.sqrt(mImp.E[i][i])])) : null;
        const admisible = avisos.length === 0;
        avisos.push(...this._avisosDeLaSintaxis(modelo, est, info.singular, Rcorr, nombresObs));
        const R = { sintaxis, etiquetaModelo, n, p, q, gl, Fmin, chi2, pChi2, avisos, admisible, validez, desviaciones,
                    chi2b, glb, CFI, TLI, RMSEA, rmseaIC, SRMR,
                    parametros, vars: est.vars, latentes: est.latentes,
                    convergio: opt.convergio && Fmin < 1e9, S_obs, nombresObs,
                    estimador: 'ML', optimizacion: { metodo: opt.respaldo ? 'BFGS (tras Nelder–Mead)' : 'BFGS', iteraciones: opt.iteraciones, gradienteMax: opt.gradienteMax, estado: opt.estado } };
        this._recordar(R);
        return R;
    }
};

export { SEM };
