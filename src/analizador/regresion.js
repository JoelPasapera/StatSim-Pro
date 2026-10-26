// analizador/regresion.js — regresión múltiple y sus diagnósticos.
// Origen: regresion-multiple.js (Fase 3), sin cambios de comportamiento; dependencias explícitas.

import { AnalizadorEstadistico } from './estadistica.js';
import { obtenerColumnasNumericas } from './ui/carga.js';
import { EtiquetasVariables } from '../shared/etiquetas-variables.js';
import { escaparHTML } from '../shared/html.js';
import { pTBilateral, colaSuperiorF, cuantilT } from '../core/stats/numerico.js';
import { media, desviacion, centrar } from '../core/stats/descriptivos.js';
import { rangosPromedio } from '../core/stats/orden.js';
import { correlacion, spearman, pCorrelacion } from '../core/stats/correlacion.js';
import { pruebaNormalidad } from '../core/stats/normalidad.js';
import { aNumero, esPerdido } from '../core/data/celdas.js';
import { ajustarMco, regresionMco } from '../core/stats/mco.js';
import { determinante } from '../core/linalg/gauss.js';
import { ajustarMlg } from '../core/stats/mlg.js';
import { formatoP, numeroConMenos, pConSigno, terminoConSigno } from '../shared/formato-numero.js';
import { codificacionBinaria } from './motor/dependiente-binaria.js';

// ========================================
// ANÁLISIS MULTIVARIADO — StatSim Pro
// (1) Matriz de correlaciones para 2+ variables (Pearson/Spearman por par
//     según normalidad, con p y corrección de Holm).
// (2) Regresión lineal múltiple OLS: B, SE, β, t, p, IC 95%, R², R² ajustado,
//     F del modelo, VIF por predictor y normalidad de los residuos.
// (3) "De la correlación al control estadístico": efecto crudo vs ajustado del
//     predictor focal, con lectura causal honesta (datos transversales).
// Las distribuciones, del núcleo único (core/stats/numerico.js; antes las pedía a ComparacionGrupos, en un ciclo de importaciones).
// ========================================

/**
 * (2027.01.14, revisión) El ancho mínimo, en la pantalla, de la figura de la regresión bivariada (de 640): en un teléfono, sus
 * textos de 11 px quedan de 8 o más, y se desplaza dentro de su recuadro.
 */
const FIGURA_EN_UN_TELEFONO = 480;

const RegresionMultiple = {

    _ultimaRegresion: null,
    _ultimaMatriz: null,

    // ---------- Utilidades numéricas ----------
    // (2026.12.21) Una dependiente constante: la regresión no tiene nada que explicar (antes daba una F negativa y valores p
    // salidos del redondeo; el núcleo devuelve null y aquí se dice por qué).
    _SIN_VARIACION: 'La variable dependiente no varía (todos sus valores son iguales): no hay nada que explicar.',
    _esConstante(v) { for (let i = 1; i < v.length; i++) if (v[i] !== v[0]) return false; return true; },
    _media(v) { return media(v); },
    _de(v) { return desviacion(v); },
    _pT(t, df) { return pTBilateral(t, df); },   // p BILATERAL
    _pF(F, d1, d2) { return F > 0 ? colaSuperiorF(F, d1, d2) : 1; },   // cola SUPERIOR (el valor p)
    // t crítica bilateral (para el IC del {1 − alfa}), del núcleo único (core/stats/numerico.js); antes, una búsqueda topada en t = 100 que fallaba
    // con 1 o 2 gl y alfa pequeño (con 1 gl y alfa = 0,001 daba 100 en lugar de 636,6).
    _tCrit(df, alfa = 0.05) { return cuantilT(1 - alfa / 2, df); },

    // (2026.12.22) Ya no hay inversas de matrices aquí: los mínimos cuadrados resuelven por la QR del núcleo
    // (core/stats/mco.js) y la logística y Poisson por IRLS sobre esa misma QR (core/stats/mlg.js).

    // ---------- Correlación por par (criterio coherente con la app) ----------
    _pearson(x, y) { return correlacion(x, y); },
    _rangos(v) { return rangosPromedio(v); },
    _spearman(x, y) { return spearman(x, y); },   // del núcleo único
    _esNormal(v) { return pruebaNormalidad(v).normal; },   // (2026.12.16) la prueba y la regla del núcleo único

    // ---------- (1) Matriz de correlaciones multi-variable ----------
    matrizCorrelaciones(cols, etiquetas) {
        const A = (typeof AnalizadorEstadistico !== 'undefined') ? AnalizadorEstadistico : null;
        const datos = A ? (A.obtenerDatos() || []) : [];
        if (datos.length < 4 || cols.length < 2) return { error: 'Se necesitan al menos 2 variables y 4 casos.' };
        // Casos completos en TODAS las columnas (listwise), como SPSS.
        const filas = datos.map(d => cols.map(c => aNumero(d[c]))).filter(f => f.every(Number.isFinite));
        const n = filas.length;
        if (n < 4) return { error: 'Muy pocos casos completos en las variables elegidas.' };
        const series = cols.map((_, j) => filas.map(f => f[j]));
        const normal = series.map(s => this._esNormal(s));
        const pares = [];
        for (let i = 0; i < cols.length; i++) for (let j = i + 1; j < cols.length; j++) {
            const usarP = normal[i] && normal[j];
            const r = usarP ? this._pearson(series[i], series[j]) : this._spearman(series[i], series[j]);
            pares.push({ i, j, metodo: usarP ? 'Pearson' : 'Spearman', r, pValor: pCorrelacion(r, n) });   // (2026.12.17) la prueba del núcleo
        }
        const holm = (A && A.ajustarPValoresHolm) ? A.ajustarPValoresHolm(pares.map(p => p.pValor)) : pares.map(p => p.pValor);
        pares.forEach((p, k) => { p.pHolm = holm[k]; p.sig = p.pHolm < 0.05; });
        const R = { n, cols, etiquetas: etiquetas || cols, normal, pares };
        return R;
    },

    // (2027.01.01) Cómo se lee la variable dependiente: como número o, si es de dos categorías con nombre («No» y «Sí», el
    // desenlace binario del Simulador), como 0/1 con el evento en el 1 (motor/dependiente-binaria.js). Lo usan las cuatro
    // regresiones que leen Y, para que la vista, el Word y el gráfico hablen del mismo evento.
    _lectorY(datos, colY) {
        // con los códigos de sus categorías, si la base los trae (del Simulador, de un .sav): el 1 es la de código mayor
        const codigos = typeof AnalizadorEstadistico !== 'undefined' && AnalizadorEstadistico.codigosDe ? AnalizadorEstadistico.codigosDe(colY) : null;
        const binaria = codificacionBinaria(datos.map(d => d[colY]), codigos);
        return { leer: binaria ? binaria.codigo : aNumero, binaria: binaria ? { evento: binaria.evento, referencia: binaria.referencia, segun: binaria.segun } : null };
    },

    // La frase que dice qué se modela con una dependiente de dos categorías con nombre (HTML: las categorías, escapadas) y de
    // dónde salió qué categoría es el 1: de los códigos de la variable o, en un CSV, de los nombres (y cómo cambiarlo).
    _fraseEvento(evento, etY) {
        if (!evento) return '';
        const base = `Se modela la probabilidad de «${escaparHTML(evento.evento)}» (codificada 1) frente a «${escaparHTML(evento.referencia)}» (0) en ${escaparHTML(etY)}`;
        if (evento.segun === 'codigos') return `${base}, según los códigos de la variable (la de código mayor, como en SPSS).`;
        if (evento.segun === 'nombres') return `${base}, según los nombres de sus categorías (para modelar la otra, codifícala como 0 y 1 en el archivo).`;
        return `${base}.`;
    },

    // ---------- (2) Regresión lineal múltiple (OLS) ----------
    regresion(colY, colsX, etY, etsX) {
        const A = (typeof AnalizadorEstadistico !== 'undefined') ? AnalizadorEstadistico : null;
        const datos = A ? (A.obtenerDatos() || []) : [];
        if (!datos.length) return { error: 'No hay datos cargados.' };
        if (!colY || !colsX || !colsX.length) return { error: 'Elige la variable dependiente y al menos un predictor.' };
        if (colsX.includes(colY)) return { error: 'La variable dependiente no puede ser también predictor.' };
        // Casos completos (listwise).
        const LY = this._lectorY(datos, colY);
        const filas = datos.map(d => [ LY.leer(d[colY]), ...colsX.map(c => aNumero(d[c])) ]).filter(f => f.every(Number.isFinite));
        const n = filas.length, k = colsX.length;
        if (n < k + 3) return { error: `Casos insuficientes: se requieren al menos ${k + 3} completos (hay ${n}).` };

        // (2026.12.21) Mínimos cuadrados del núcleo único (core/stats/mco.js, por la QR de X): coeficientes con su error típico,
        // t, p e IC 95 %, β estandarizados, R², R² ajustado, F y el VIF de cada predictor (por la identidad con (X'X)⁻¹, sin
        // las k regresiones auxiliares). Hasta la 2026.12.20, X'X invertida por Gauss-Jordan con un pivote mínimo absoluto.
        const y = filas.map(f => f[0]);
        if (this._esConstante(y)) return { error: this._SIN_VARIACION };
        const M = regresionMco(y, colsX.map((_, j) => filas.map(f => f[j + 1])));
        if (!M) return { error: 'Predictores perfectamente colineales: el modelo no puede estimarse. Retira alguno.' };
        const coefs = this._coeficientesMco(M, j => (etsX && etsX[j]) || colsX[j]);
        const R2 = M.r2, R2aj = M.r2aj, F = M.F, glR = k, glE = M.gl, pF = M.pF, sigma2 = M.sigma2;
        const vifs = Array.from(M.vif), resid = Array.from(M.residuos);

        // Normalidad de los residuos (supuesto clave del modelo), con la prueba y la regla del núcleo único.
        const rNorm = pruebaNormalidad(resid);
        const normResid = { prueba: rNorm.abreviatura, pValor: rNorm.pValor, normal: rNorm.normal };

        const R = {
            n, k, etY: etY || colY, colY, colsX, etsX: etsX || colsX, eventoY: LY.binaria,
            coefs, R2, R2aj, F, glR, glE, pF, errorTipico: Math.sqrt(sigma2),
            vifs, normResid, significativo: pF < 0.05
        };
        // (2027.01.01) sin dejar rastro: _ultimaRegresion es el modelo que el investigador ajustó en la tarjeta de regresión
        // (_onRegresion), el que el capítulo de Word presenta como «Análisis multivariado». Lo fijaba cualquier llamada (la
        // regresión bivariada, el efecto crudo), y el capítulo repetía como «regresión múltiple» el modelo bivariado, o el de
        // un análisis anterior
        return R;
    },

    // Los coeficientes de un ajuste del núcleo (regresionMco) en el formato de las tablas: nombre, b, EE, t, p, β e IC 95 %.
    _coeficientesMco(M, nombreDe) {
        return Array.from(M.beta, (b, j) => ({
            nombre: j === 0 ? '(Constante)' : nombreDe(j - 1), b, se: M.ee[j], t: M.t[j], pValor: M.pValores[j],
            beta: j === 0 ? null : M.betaEstandarizado[j - 1], ic: M.ic[j]
        }));
    },

    // ---------- (3) Efecto crudo vs ajustado (lectura causal honesta) ----------
    crudoVsAjustado(R) {
        if (!R || R.error || !R.colsX.length) return null;
        const focal = R.colsX[0], etFocal = R.etsX[0];
        const crudo = this.regresion(R.colY, [focal], R.etY, [etFocal]);   // (2026.12.21) sin la comprobación de regresionInterna, que se retiró (el VIF sale del ajuste)
        if (!crudo || crudo.error) return null;
        const bC = crudo.coefs[1], bA = R.coefs[1];
        return {
            focal: etFocal, etY: R.etY, covariables: R.etsX.slice(1),
            crudo: { b: bC.b, p: bC.pValor, ic: bC.ic },
            ajustado: { b: bA.b, p: bA.pValor, ic: bA.ic },
            sobrevive: bA.pValor < 0.05,
            cambioPct: Math.abs(bC.b) > 1e-12 ? 100 * (bA.b - bC.b) / Math.abs(bC.b) : NaN
        };
    },

    // ---------- Selección automática del mejor modelo (2 variables) ----------
    // Y CONTINUA: compite formas funcionales (lineal, cuadrática, cúbica,
    // logarítmica, exponencial) por AIC con regla de parsimonia (ΔAIC < 2 →
    // gana la más simple). Y BINARIA: regresión logística (Newton-Raphson).
    _aicGauss(SSE, n, k) { return n * Math.log(Math.max(SSE, 1e-300) / n) + 2 * (k + 1); },

    _olsXY(y, Xcols) { // OLS mínimo del núcleo único (core/stats/mco.js): devuelve {B, yHat, SSE, R2}; null si es colineal
        const f = ajustarMco(y, Xcols);
        if (!f) return null;
        const my = this._media(y);
        let SST = 0; for (let i = 0; i < y.length; i++) SST += (y[i] - my) ** 2;
        return { B: Array.from(f.beta), yHat: Array.from(f.ajustados), SSE: f.sce, R2: SST > 0 ? 1 - f.sce / SST : 0 };
    },

    mejorModelo(colX, colY, etX, etY) {
        const A = (typeof AnalizadorEstadistico !== 'undefined') ? AnalizadorEstadistico : null;
        const datos = A ? (A.obtenerDatos() || []) : [];
        const LY = this._lectorY(datos, colY);
        const filas = datos.map(d => [aNumero(d[colX]), LY.leer(d[colY])]).filter(f => f.every(Number.isFinite));
        const n = filas.length;
        if (n < 10) return { error: 'Se requieren al menos 10 casos completos.' };
        if (this._esConstante(filas.map(f => f[1]))) return { error: this._SIN_VARIACION };
        const x = filas.map(f => f[0]), y = filas.map(f => f[1]);

        // ¿Y binaria? → logística.
        const unicos = [...new Set(y)];
        if (unicos.length === 2) {
            const lo = Math.min(...unicos);
            const y01 = y.map(v => v === lo ? 0 : 1);
            const log = this._logistica(x, y01);
            if (log.error) return log;
            return { tipoY: 'binaria', etX: etX || colX, etY: etY || colY, n, eventoY: LY.binaria,
                     ganador: { nombre: 'Regresión logística', ...log }, candidatos: null };
        }

        // Y continua: concurso de formas funcionales.
        const cands = [];
        const addOLS = (nombre, ec, Xcols, k) => {
            const r = this._olsXY(y, Xcols);
            if (r) cands.push({ nombre, ec: ec(r.B), R2: r.R2, k, AIC: this._aicGauss(r.SSE, n, k), B: r.B });
        };
        // (2026.12.21) Los polinomios se ajustan sobre x CENTRADA y sus coeficientes se pasan a x para la ecuación: las
        // potencias de una x lejos del cero (un año, una puntuación de 100 a 200) son casi colineales, y con la cúbica de un
        // año X es singular en doble precisión (antes, X'X invertida daba allí un ajuste erróneo sin avisar). El R², la SCE y
        // el AIC no dependen del centrado; la curva se evalúa centrada (Bc, centro).
        const mx = this._media(x), xc = x.map(v => v - mx);
        const addPolinomio = (nombre, grado, ec) => {
            const r = this._olsXY(y, Array.from({ length: grado }, (_, g) => xc.map(v => v ** (g + 1))));
            if (!r) return;
            const B = this._polinomioCrudo(r.B, mx);
            cands.push({ nombre, ec: ec(B), R2: r.R2, k: grado, AIC: this._aicGauss(r.SSE, n, grado), B, Bc: r.B, centro: mx });
        };
        const f3 = v => this._fx(v, 3);
        // (2027.01.01) cada término con su signo («− 0.114·x», no «+ -0.114·x»), y el primero con el mismo «−»
        const t3 = (v, sufijo) => terminoConSigno(v, sufijo, 3), c3 = v => numeroConMenos(v, 3);
        addPolinomio('Lineal', 1, B => `ŷ = ${c3(B[0])} ${t3(B[1], '·x')}`);
        addPolinomio('Cuadrática', 2, B => `ŷ = ${c3(B[0])} ${t3(B[1], '·x')} ${t3(B[2], '·x²')}`);
        addPolinomio('Cúbica', 3, B => `ŷ = ${c3(B[0])} ${t3(B[1], '·x')} ${t3(B[2], '·x²')} ${t3(B[3], '·x³')}`);
        if (Math.min(...x) > 0) {
            addOLS('Logarítmica', B => `ŷ = ${c3(B[0])} ${t3(B[1], '·ln(x)')}`, [x.map(Math.log)], 1);
        }
        if (Math.min(...y) > 0) {
            // Exponencial: ln(y) = a + b·x; R² y AIC evaluados EN LA ESCALA ORIGINAL
            // para que la comparación con los demás modelos sea justa.
            const rl = this._olsXY(y.map(Math.log), [x]);
            if (rl) {
                const yHat = x.map(v => Math.exp(rl.B[0] + rl.B[1] * v));
                const my = this._media(y);
                let SSE = 0, SST = 0;
                y.forEach((v, i) => { SSE += (v - yHat[i]) ** 2; SST += (v - my) ** 2; });
                cands.push({ nombre: 'Exponencial', ec: `ŷ = ${f3(Math.exp(rl.B[0]))}·e^(${c3(rl.B[1])}·x)`,
                    R2: SST > 0 ? 1 - SSE / SST : 0, k: 1, AIC: this._aicGauss(SSE, n, 1), B: rl.B });
            }
        }
        if (!cands.length) return { error: 'No fue posible ajustar ningún modelo.' };
        cands.sort((a, b) => a.AIC - b.AIC);
        const mejorAIC = cands[0].AIC;
        cands.forEach(c => { c.dAIC = c.AIC - mejorAIC; });
        // Parsimonia: entre los prácticamente empatados (ΔAIC < 2), la recta si está entre ellos y, si no, el más simple.
        // (2026.12.30) Antes solo desempataba el número de parámetros, y la logarítmica y la exponencial tienen los de la
        // recta: con datos lineales, una de ellas ganaba por azar en la mitad de las bases (101 de 200 en la auditoría, 75
        // con la recta a ΔAIC < 2) y el texto concluía que la relación «presenta curvatura». Ahora una forma curva solo gana
        // si la recta queda a ΔAIC ≥ 2.
        const empatados = cands.filter(c => c.dAIC < 2);
        empatados.sort((a, b) => (b.nombre === 'Lineal') - (a.nombre === 'Lineal') || a.k - b.k || a.AIC - b.AIC);
        const ganador = empatados[0];
        const R = { tipoY: 'continua', etX: etX || colX, etY: etY || colY, n, candidatos: cands, ganador,
                    parsimonia: ganador !== cands[0] };
        this._ultimoMejorModelo = R;
        return R;
    },

    // Regresión logística simple, del núcleo único (core/stats/mlg.js: IRLS sobre la QR ponderada, el algoritmo de glm de
    // R). (2026.12.22) Antes, Newton con la inversa 2 × 2 en forma cerrada, que si no convergía en 60 iteraciones devolvía
    // la última sin avisar.
    _logistica(x, y01) {
        const M = ajustarMlg(y01, [x], { familia: 'logistica' });
        if ('error' in M) return { error: M.error };
        const b0 = M.beta[0], b1 = M.beta[1];
        return { b0, b1, se: M.ee[1], z: M.z[1], pValor: M.pValores[1], OR: Math.exp(b1),
                 mcFadden: M.mcFadden, AIC: M.aic, avisos: M.avisos,
                 ec: `logit(p) = ${numeroConMenos(b0, 3)} ${terminoConSigno(b1, '·x', 3)}` };
    },

    // ================= ANCOVA Y MANOVA =================
    // Determinante por eliminación gaussiana con pivoteo (para Wilks' Λ); (2026.12.25) del núcleo único (core/linalg/gauss.js).
    _det(M) { return determinante(M); },

    // ---------- ANCOVA: factor (grupos) + covariable, vía modelo lineal ----------
    // Pregunta que responde: ¿difieren los grupos en Y una vez IGUALADOS
    // estadísticamente en la covariable?
    ancova(colGrupo, colY, colCov, ets = {}) {
        const A = (typeof AnalizadorEstadistico !== 'undefined') ? AnalizadorEstadistico : null;
        const datos = A ? (A.obtenerDatos() || []) : [];
        const filas = datos.map(d => ({ g: d[colGrupo], y: aNumero(d[colY]), c: aNumero(d[colCov]) }))
            .filter(f => !esPerdido(f.g) && Number.isFinite(f.y) && Number.isFinite(f.c));   // (2026.12.18) un grupo NaN no es un grupo
        const niveles = [...new Set(filas.map(f => String(f.g)))].sort();
        const k = niveles.length, n = filas.length;
        if (k < 2) return { error: 'La variable de agrupación necesita al menos 2 grupos.' };
        if (k > 8) return { error: 'Demasiados grupos (máximo 8) para el ANCOVA.' };
        if (n < k + 4) return { error: 'Casos insuficientes para el ANCOVA.' };

        const y = filas.map(f => f.y);
        if (this._esConstante(y)) return { error: this._SIN_VARIACION };
        const cov = filas.map(f => f.c);
        const mCov = this._media(cov);
        // Dummies (referencia: primer nivel) y columnas de los tres modelos.
        const dummies = niveles.slice(1).map(nv => filas.map(f => String(f.g) === nv ? 1 : 0));
        const M_cov = this._olsFull(y, [cov], ['Cov']);                          // solo covariable
        const M_full = this._olsFull(y, [cov, ...dummies], ['Cov', ...niveles.slice(1)]); // covariable + grupos
        if (M_cov.error || M_full.error) return { error: 'No fue posible estimar el modelo (¿colinealidad?).' };

        // F del factor AJUSTADO por la covariable: cambio entre modelos anidados.
        const q = k - 1;
        const Ffactor = ((M_cov.SSE - M_full.SSE) / q) / (M_full.SSE / M_full.glE);
        const pFactor = this._pF(Ffactor, q, M_full.glE);

        // F de la covariable dentro del modelo completo (su t²).
        const tCov = M_full.coefs[1].t;
        const Fcov = tCov * tCov, pCov = M_full.coefs[1].pValor;

        // Supuesto de PENDIENTES PARALELAS: añadir interacciones grupo×covariable
        // y comprobar que no mejoran el modelo (homogeneidad de la regresión).
        const inter = dummies.map(dm => dm.map((v, i) => v * (cov[i] - mCov)));
        const M_int = this._olsFull(y, [cov, ...dummies, ...inter], ['Cov', ...niveles.slice(1), ...niveles.slice(1).map(nv => nv + '×Cov')]);
        let pendientes = null;
        if (!M_int.error) {
            const Fint = ((M_full.SSE - M_int.SSE) / q) / (M_int.SSE / M_int.glE);
            pendientes = { F: Fint, gl: [q, M_int.glE], pValor: this._pF(Fint, q, M_int.glE) };
            pendientes.paralelas = pendientes.pValor > 0.05;
        }

        // Medias ajustadas: predicción de cada grupo con la covariable en su media.
        const B = M_full.coefs.map(c => c.b);
        const mediasAjustadas = niveles.map((nv, i) => {
            let pred = B[0] + B[1] * mCov;
            if (i > 0) pred += B[1 + i];
            const obs = filas.filter(f => String(f.g) === nv);
            return { grupo: nv, n: obs.length,
                     mediaCruda: this._media(obs.map(o => o.y)),
                     mediaAjustada: pred };
        });

        // Eta² parcial del factor.
        const eta2p = (M_cov.SSE - M_full.SSE) / M_cov.SSE;
        // (2026.12.30) La diferencia SIN ajustar (el ANOVA de un factor: el modelo con solo los grupos) y la de la covariable
        // entre los grupos: con el factor ajustado no significativo, el texto atribuía a la covariable una diferencia cruda
        // que podía no ser significativa (bastaba que las medias crudas difirieran en más de 0,01).
        const anova = (/** @type {number[]} */ v) => {
            const M = this._olsFull(v, dummies, niveles.slice(1));
            return M.error ? null : { F: M.F, gl: [M.glR, M.glE], pValor: M.pF };
        };
        const R = { etGrupo: ets.grupo || colGrupo, etY: ets.y || colY, etCov: ets.cov || colCov,
                    n, k, niveles, Ffactor, gl: [q, M_full.glE], pFactor, eta2p,
                    Fcov, pCov, pendientes, mediasAjustadas, mCov,
                    cruda: anova(y), covEntreGrupos: anova(cov),
                    significativo: pFactor < 0.05 };
        this._ultimaAncova = R;
        return R;
    },

    // ---------- MANOVA: un factor, varias variables dependientes ----------
    // Pregunta que responde: ¿difieren los grupos en el CONJUNTO de resultados,
    // considerados simultáneamente (con sus correlaciones)?
    manova(colGrupo, colsY, ets = {}) {
        const A = (typeof AnalizadorEstadistico !== 'undefined') ? AnalizadorEstadistico : null;
        const datos = A ? (A.obtenerDatos() || []) : [];
        const p = colsY.length;
        if (p < 1) return { error: 'Elige al menos una variable dependiente.' };
        const filas = datos.map(d => ({ g: d[colGrupo], ys: colsY.map(c => aNumero(d[c])) }))
            .filter(f => !esPerdido(f.g) && f.ys.every(Number.isFinite));
        const niveles = [...new Set(filas.map(f => String(f.g)))].sort();
        const k = niveles.length, n = filas.length;
        if (k < 2) return { error: 'Se necesitan al menos 2 grupos.' };
        if (n < k + p + 2) return { error: 'Casos insuficientes para el MANOVA.' };

        // Medias globales y por grupo.
        const mediaG = colsY.map((_, j) => this._media(filas.map(f => f.ys[j])));
        const porGrupo = niveles.map(nv => {
            const obs = filas.filter(f => String(f.g) === nv);
            return { nv, n: obs.length, medias: colsY.map((_, j) => this._media(obs.map(o => o.ys[j]))), obs };
        });

        // Matrices SSCP: H (entre grupos) y E (dentro de grupos).
        const H = Array.from({ length: p }, () => new Array(p).fill(0));
        const E = Array.from({ length: p }, () => new Array(p).fill(0));
        porGrupo.forEach(G => {
            for (let a = 0; a < p; a++) for (let b = 0; b < p; b++)
                H[a][b] += G.n * (G.medias[a] - mediaG[a]) * (G.medias[b] - mediaG[b]);
            G.obs.forEach(o => {
                for (let a = 0; a < p; a++) for (let b = 0; b < p; b++)
                    E[a][b] += (o.ys[a] - G.medias[a]) * (o.ys[b] - G.medias[b]);
            });
        });
        const HE = H.map((f, i) => f.map((v, j) => v + E[i][j]));
        const detE = this._det(E), detHE = this._det(HE);
        if (!(detHE > 0)) return { error: 'Matrices singulares: revisa que las variables no sean redundantes.' };
        const lambda = detE / detHE; // Wilks' Λ

        // Aproximación F de Rao.
        const q = k - 1;
        let t = 1;
        const den = p * p + q * q - 5;
        if (den > 0) t = Math.sqrt((p * p * q * q - 4) / den);
        const m = (n - 1) - (p + k) / 2;
        const df1 = p * q;
        const df2 = m * t - df1 / 2 + 1;
        const L1t = Math.pow(lambda, 1 / t);
        const F = ((1 - L1t) / L1t) * (df2 / df1);
        const pValor = this._pF(F, df1, df2);
        const eta2p = 1 - L1t; // parcial multivariado (aprox. 1 − Λ^(1/t))

        const R = { etGrupo: ets.grupo || colGrupo, colsY, etsY: ets.ys || colsY,
                    n, k, p, niveles, lambda, F, df1, df2, pValor, eta2p,
                    porGrupo: porGrupo.map(G => ({ grupo: G.nv, n: G.n, medias: G.medias })),
                    significativo: pValor < 0.05 };
        this._ultimaManova = R;
        return R;
    },

    // (2026.12.30) El ANCOVA sin efecto del factor ajustado, en la vista y en el Word: si sin ajustar los grupos SÍ diferían,
    // esa diferencia era atribuible, al menos en parte, a la covariable; si tampoco diferían, no había nada que explicar.
    // Hasta la 2026.12.29 se atribuía a la covariable cualquier diferencia de medias crudas mayor que 0,01.
    _textoAncovaSinEfecto(R) {
        const C = R.cruda, D = R.covEntreGrupos;
        const ajustado = `F(${R.gl[0]}, ${R.gl[1]}) = ${this._fx(R.Ffactor, 2)}, p ${this._pTxt(R.pFactor)}`;
        if (!C) return `Una vez igualados en ${R.etCov}, los grupos no difieren significativamente en ${R.etY} (${ajustado}).`;
        const crudo = `F(${C.gl[0]}, ${C.gl[1]}) = ${this._fx(C.F, 2)}, p ${this._pTxt(C.pValor)}`;
        if (C.pValor < 0.05) {
            const inicio = `Sin ajustar, los grupos difieren en ${R.etY} (${crudo}), pero una vez igualados en ${R.etCov} ya no difieren significativamente (${ajustado})`;
            // (revisión 2026.12.30) si los grupos no difieren en la covariable, no se puede afirmar que partían con niveles
            // distintos de ella (la frase lo afirmaba y, entre paréntesis, decía lo contrario)
            if (D && !(D.pValor < 0.05)) {
                return `${inicio}. Como los grupos no difieren significativamente en ${R.etCov} (p ${this._pTxt(D.pValor)}), la diferencia cruda no puede atribuirse con seguridad a la covariable: la pequeña diferencia de ${R.etCov} entre los grupos basta para restarle la significación, así que conviene interpretar este resultado con cautela.`;
            }
            const enCov = D ? ` (los grupos sí difieren en ${R.etCov}: p ${this._pTxt(D.pValor)})` : '';
            return `${inicio}: la diferencia cruda era atribuible, al menos en parte, a que los grupos partían con distintos niveles de ${R.etCov}${enCov}.`;
        }
        return `Los grupos no difieren significativamente en ${R.etY} ni sin ajustar (${crudo}) ni una vez igualados en ${R.etCov} (${ajustado}): no había una diferencia de partida que la covariable explicara.`;
    },

    _htmlAncova(R) {
        let h = `<h4 style="margin:0.8rem 0 0.2rem;">⚖️➕ ANCOVA: comparar igualando estadísticamente en ${R.etCov}</h4>
        <p class="help-text" style="margin:0 0 0.4rem;font-size:0.9em;">Pregunta que responde: <b>¿difieren los grupos en ${R.etY} una vez igualados en ${R.etCov}?</b> El ANCOVA descuenta primero el efecto de la covariable y compara lo que queda — es como preguntar qué pasaría si todos los grupos tuvieran el mismo nivel de ${R.etCov} (fijado en su media global, ${this._fx(R.mCov, 2)}).</p>`;
        h += this._tab(this._tr(['Grupo', 'n', 'Media cruda', 'Media ajustada'], true)
            + R.mediasAjustadas.map(g => this._tr([g.grupo, g.n, this._fx(g.mediaCruda, 2), `<b>${this._fx(g.mediaAjustada, 2)}</b>`])).join(''));
        h += this._tab(this._tr(['Efecto', 'F', 'gl', 'p', 'η² parcial'], true)
            + this._tr([`${R.etGrupo} (ajustado)`, this._fx(R.Ffactor, 2), `(${R.gl[0]}, ${R.gl[1]})`, this._fp(R.pFactor), this._fx(R.eta2p, 3)])
            + this._tr([`${R.etCov} (covariable)`, this._fx(R.Fcov, 2), `(1, ${R.gl[1]})`, this._fp(R.pCov), '—']));
        h += `<p style="margin:0.3rem 0 0;">${R.significativo
            ? `Aun igualados en ${R.etCov}, los grupos difieren en ${R.etY} (p ${this._pTxt(R.pFactor)}): la diferencia <b>no</b> se explica por la covariable.`
            : this._textoAncovaSinEfecto(R)} Compara las columnas de medias: la <i>cruda</i> es lo observado; la <i>ajustada</i>, lo esperable con todos al mismo nivel de ${R.etCov}.</p>`;
        if (R.pendientes) {
            h += R.pendientes.paralelas
                ? `<p class="help-text" style="font-size:0.85em;margin-top:0.3rem;">Supuesto de pendientes paralelas: satisfecho (F(${R.pendientes.gl[0]}, ${R.pendientes.gl[1]}) = ${this._fx(R.pendientes.F, 2)}, p ${this._pTxt(R.pendientes.pValor)}). ¿Por qué importa? El ajuste solo tiene sentido si la relación entre ${R.etCov} y ${R.etY} es la misma en todos los grupos; si cada grupo tuviera su propia pendiente, no existiría UNA respuesta ajustada válida para todos los niveles de la covariable.</p>`
                : `<p style="margin:0.4rem 0 0;padding:0.5rem 0.7rem;background:#fff8e1;border-left:3px solid #f0ad4e;border-radius:0.3rem;font-size:0.88em;">⚠️ <b>Supuesto de pendientes paralelas violado</b> (p ${this._pTxt(R.pendientes.pValor)}): la relación entre ${R.etCov} y ${R.etY} difiere entre grupos, así que las medias ajustadas deben tomarse con cautela — la diferencia entre grupos <i>depende</i> del nivel de la covariable (una interacción, no un efecto uniforme). Interpreta la moderación en lugar del ANCOVA clásico.</p>`;
        }
        return h;
    },

    _htmlManova(M) {
        let h = `<h4 style="margin:0.8rem 0 0.2rem;">⚖️✳️ MANOVA: ${M.etsY.join(', ')} analizadas en conjunto</h4>
        <p class="help-text" style="margin:0 0 0.4rem;font-size:0.9em;"><b>¿Por qué no ${M.p} ANOVAs separados?</b> Por dos razones. Primera: cada prueba al 5 % acumula riesgo — con ${M.p} pruebas, la probabilidad de al menos un falso hallazgo sube a ≈ ${(100 * (1 - Math.pow(0.95, M.p))).toFixed(0)} %. Segunda: las variables de resultado suelen correlacionar, y el MANOVA aprovecha ese patrón conjunto — puede detectar una separación entre grupos que ninguna variable muestra con claridad por sí sola.</p>`;
        h += this._tab(this._tr(['Λ de Wilks', 'F', 'gl', 'p', 'η² parcial'], true)
            + this._tr([this._fx(M.lambda, 3), this._fx(M.F, 2), `(${M.df1}, ${this._fx(M.df2, 1)})`, this._fp(M.pValor), this._fx(M.eta2p, 3)]));
        h += this._tab(this._tr(['Grupo', 'n', ...M.etsY.map(e => `M(${e})`)], true)
            + M.porGrupo.map(g => this._tr([g.grupo, g.n, ...g.medias.map(m => this._fx(m, 2))])).join(''));
        h += `<p style="margin:0.3rem 0 0;">La <b>Λ de Wilks</b> se lee al revés que un R²: es la proporción de variabilidad <i>no explicada</i> por los grupos (menor = grupos más separados). ${M.significativo
            ? `Aquí Λ = ${this._fx(M.lambda, 3)} con p ${this._pTxt(M.pValor)}: los grupos difieren en el <b>perfil conjunto</b> de ${M.etsY.join(', ')}. El paso siguiente del protocolo es examinar cada variable por separado (los ANOVAs de seguimiento de arriba) para localizar dónde vive la diferencia.`
            : `Aquí p ${this._pTxt(M.pValor)}: no hay evidencia de que los grupos difieran en el perfil conjunto — y este resultado global protege contra falsos hallazgos que ${M.p} pruebas sueltas podrían producir por azar.`}</p>`;
        return h;
    },

    // ---------- Formato ----------
    _fp(p) { return formatoP(p); },
    // «= .023» o «< .001», para escribir «p = .023» y «p < .001» (2026.12.30: hasta entonces, «p .023», sin el signo).
    _pTxt(p) { return pConSigno(p); },
    _fx(x, d = 3) { return Number.isFinite(x) ? x.toFixed(d) : '—'; },

    // ---------- UI ----------
    // La tarjeta propia se retiró: la matriz y la regresión viven ahora en el
    // flujo principal de «Análisis Estadístico» (fusión multivariada).
    montar() { /* intencionalmente vacío */ },

    actualizarSelects() {
        const A = (typeof AnalizadorEstadistico !== 'undefined') ? AnalizadorEstadistico : null;
        const datos = A ? (A.obtenerDatos() || []) : [];
        const nums = (typeof obtenerColumnasNumericas === 'function' && datos.length) ? obtenerColumnasNumericas(datos) : [];
        // (2026.12.29) nombres y etiquetas escapados: llegan de un CSV o de un .sav ajeno
        const et = c => escaparHTML((typeof EtiquetasVariables !== 'undefined') ? EtiquetasVariables.etiquetaConColumna(c) : c);
        const dep = document.getElementById('rmDep');
        if (dep) dep.innerHTML = nums.map(c => `<option value="${escaparHTML(c)}">${et(c)}</option>`).join('');
        const caja = c => `<label style="display:block;margin:0.15rem 0;cursor:pointer;"><input type="checkbox" value="${escaparHTML(c)}" style="margin-right:0.4rem;">${et(c)}</label>`;
        ['rmMatVars', 'rmPred'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = nums.length ? nums.map(caja).join('') : '<span class="help-text">Sin variables numéricas.</span>';
        });
        const estado = document.getElementById('rmEstado');
        if (estado) estado.textContent = nums.length ? '' : 'Genera o carga una base de datos para habilitar el análisis.';
    },

    _sel(id) {
        const el = document.getElementById(id);
        if (!el) return [];
        return [...el.querySelectorAll('input[type=checkbox]:checked')].map(c => c.value);
    },
    // (2027.01.14, revisión) desplazable dentro de su recuadro (en un teléfono, hacía la página más ancha que la pantalla)
    _tab(rows) { return `<div class="tabla-ancha"><table style="border-collapse:collapse;margin:0.4rem 0 0.8rem;font-size:0.92em;">${rows}</table></div>`; },
    _tr(cells, th) { return `<tr>${cells.map(c => th ? `<th style="border:1px solid #ddd;padding:0.35rem 0.5rem;background:#f5f5f5;">${c}</th>` : `<td style="border:1px solid #ddd;padding:0.35rem 0.5rem;">${c}</td>`).join('')}</tr>`; },

    _onMatriz() {
        const cols = this._sel('rmMatVars');
        const out = document.getElementById('rmMatOut');
        if (cols.length < 2) { if (out) out.innerHTML = '<p class="help-text">⚠️ Selecciona al menos 2 variables (Ctrl/Cmd + clic).</p>'; return; }
        const M = this.matrizCorrelaciones(cols);
        if (M.error) { if (out) out.innerHTML = `<p class="help-text">⚠️ ${M.error}</p>`; return; }
        this._ultimaMatriz = M;   // (2027.01.01) la de la tarjeta, para el Word (matrizCorrelaciones ya no la fija)
        const idx = (i, j) => M.pares.find(p => (p.i === i && p.j === j) || (p.i === j && p.j === i));
        let html = this._tab(
            this._tr(['Variable', ...M.cols.map((_, i) => String(i + 1))], true)
            + M.cols.map((c, i) => this._tr([`${i + 1}. ${c}`, ...M.cols.map((_, j) => {
                if (j > i) return '';
                if (j === i) return '1';
                const p = idx(i, j);
                return `${this._fx(p.r, 2)}${p.sig ? ' *' : ''}`;
            })])).join(''));
        html += `<p class="help-text" style="font-size:0.85em;">n = ${M.n} (casos completos). * p Holm &lt; .05. Método por par: Pearson si ambas variables son normales; Spearman en caso contrario. Diagonal = 1; se muestra el triángulo inferior (la matriz es simétrica).</p>`;
        const sig = M.pares.filter(p => p.sig);
        html += `<p style="margin:0.3rem 0 0;">${sig.length
            ? `Correlaciones significativas tras Holm: ${sig.map(p => `${M.cols[p.i]}–${M.cols[p.j]} (${p.metodo[0] === 'P' ? 'r' : 'ρ'} = ${this._fx(p.r, 2)}, p ${this._pTxt(p.pHolm)})`).join('; ')}.`
            : 'Ningún par mantiene la significancia tras la corrección de Holm.'}</p>`;
        if (out) out.innerHTML = html;
    },

    _onRegresion() {
        const dep = (document.getElementById('rmDep') || {}).value;
        const preds = this._sel('rmPred');
        const out = document.getElementById('rmRegOut');
        const estado = document.getElementById('rmEstado');
        const R = this.regresion(dep, preds);
        if (R.error) { if (estado) estado.textContent = '⚠️ ' + R.error; if (out) out.innerHTML = ''; return; }
        if (estado) estado.textContent = '';
        this._ultimaRegresion = R;   // (2027.01.01) el de la tarjeta, para el Word (regresion() ya no lo fija)

        let html = `<h4 style="margin:0.4rem 0 0.2rem;">Resumen del modelo</h4>`
            + this._tab(this._tr(['R²', 'R² ajustado', 'Error típico', `F(${R.glR}, ${R.glE})`, 'p', 'Decisión'], true)
                + this._tr([this._fx(R.R2), this._fx(R.R2aj), this._fx(R.errorTipico, 2), this._fx(R.F, 2), this._fp(R.pF),
                    R.significativo ? '<b>Modelo significativo</b>' : 'Modelo no significativo']));

        html += `<h4 style="margin:0.6rem 0 0.2rem;">Coeficientes</h4>`
            + this._tab(this._tr(['Predictor', 'B', 'EE', 'β', 't', 'p', 'IC 95%', 'VIF'], true)
                + R.coefs.map((c, j) => this._tr([c.nombre, this._fx(c.b), this._fx(c.se), c.beta === null ? '—' : this._fx(c.beta),
                    this._fx(c.t, 2), this._fp(c.pValor), `[${this._fx(c.ic[0], 2)}, ${this._fx(c.ic[1], 2)}]`,
                    j === 0 ? '—' : this._fx(R.vifs[j - 1], 2)])).join(''));

        html += `<p class="help-text" style="font-size:0.85em;">Normalidad de los residuos (${R.normResid.prueba}): p ${this._pTxt(R.normResid.pValor)} → ${R.normResid.normal ? 'supuesto satisfecho' : 'supuesto en duda: interpreta con cautela'}. VIF &gt; 5 sugiere colinealidad problemática entre predictores.</p>`;

        const cva = this.crudoVsAjustado(R);
        if (cva && R.k >= 2) {
            html += `<h4 style="margin:0.6rem 0 0.2rem;">De la correlación al control estadístico</h4>`
                + this._tab(this._tr(['Efecto de ' + cva.focal, 'B', 'p', 'IC 95%'], true)
                    + this._tr(['Crudo (sin controles)', this._fx(cva.crudo.b), this._fp(cva.crudo.p), `[${this._fx(cva.crudo.ic[0], 2)}, ${this._fx(cva.crudo.ic[1], 2)}]`])
                    + this._tr([`Ajustado (controlando ${cva.covariables.join(', ')})`, this._fx(cva.ajustado.b), this._fp(cva.ajustado.p), `[${this._fx(cva.ajustado.ic[0], 2)}, ${this._fx(cva.ajustado.ic[1], 2)}]`]));
        }
        html += `<p style="margin:0.4rem 0 0;">${this.interpretar(R)}</p>`;
        if (out) out.innerHTML = html;
    },

    // Coeficientes en x de un polinomio dado en (x − m): bᵣ = Σⱼ≥ᵣ cⱼ·C(j, r)·(−m)^(j−r).
    _polinomioCrudo(c, m) {
        const binomial = (a, b) => { let r = 1; for (let i = 1; i <= b; i++) r = r * (a - b + i) / i; return r; };
        return c.map((_, r) => { let s = 0; for (let j = r; j < c.length; j++) s += c[j] * binomial(j, r) * (-m) ** (j - r); return s; });
    },

    // Evalúa el modelo ganador en un valor x (para dibujar la curva).
    _evalModelo(c, xv) {
        const B = c.B;
        if (c.Bc && /^(Lineal|Cuadrática|Cúbica)$/.test(c.nombre)) {   // (2026.12.21) los polinomios, en su forma centrada
            const u = xv - c.centro; let s = 0;
            for (let j = c.Bc.length - 1; j >= 0; j--) s = s * u + c.Bc[j];   // Horner
            return s;
        }
        switch (c.nombre) {
            case 'Lineal': return B[0] + B[1] * xv;
            case 'Cuadrática': return B[0] + B[1] * xv + B[2] * xv * xv;
            case 'Cúbica': return B[0] + B[1] * xv + B[2] * xv * xv + B[3] * xv * xv * xv;
            case 'Logarítmica': return xv > 0 ? B[0] + B[1] * Math.log(xv) : NaN;
            case 'Exponencial': return Math.exp(B[0] + B[1] * xv);
            default: return NaN;
        }
    },

    // Dibuja dispersión + curva del modelo elegido en un canvas y devuelve
    // {url (PNG dataURL), w, h}. Guarda el resultado en _ultimoGrafico.
    // (2027.01.13, revisión) El margen izquierdo, a la medida de los valores del eje Y (con 60 fijo, uno de 7 cifras salía
    // cortado, «0530356.7» por «10530356.7», y montado con el nombre del eje), y los nombres de los ejes, más pequeños (hasta 9
    // px) o cortados con «…» si no caben a lo largo de su eje: lo mismo que se corrigió en la dispersión en la 2027.01.12.
    // (2027.01.14, revisión) Y los márgenes de los lados, a la medida del primer y del último valor del eje X, centrados en su
    // marca: con 20 fijo a la derecha, uno de 10 cifras salía cortado («2456500000.0» se leía «24565000», cien veces menos).
    graficoModelo(x, y, MM, etX, etY) {
        const W = 640, H = 400, mT = 40, mB = 50;
        const cv = document.createElement('canvas');
        cv.width = W; cv.height = H;
        const g = cv.getContext('2d');
        if (!g) return null;
        g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
        const xmin = Math.min(...x), xmax = Math.max(...x);
        const esLog = MM.tipoY === 'binaria';
        const yv = esLog ? [0, 1] : y;
        let ymin = Math.min(...yv), ymax = Math.max(...yv);
        if (ymax === ymin) { ymax += 1; ymin -= 1; }
        const padY = (ymax - ymin) * 0.06; ymin -= padY; ymax += padY;
        // (el nombre del eje Y, girado, ocupa hasta x = 21: los valores, a su derecha, terminan 7 antes del eje)
        g.font = '11px sans-serif';
        const valoresY = [0, 1, 2, 3, 4, 5].map(i => (ymin + (ymax - ymin) * i / 5).toFixed(1));
        const valoresX = [0, 1, 2, 3, 4, 5].map(i => (xmin + (xmax - xmin) * i / 5).toFixed(1));
        const mitadX = (/** @type {string} */ v) => Math.ceil(g.measureText(v).width / 2) + 6;
        const mL = Math.max(60, Math.ceil(Math.max(...valoresY.map(v => g.measureText(v).width))) + 30, mitadX(valoresX[0]));
        const mR = Math.max(20, mitadX(valoresX[5]));
        /** El texto en 11 px, o más pequeño (hasta 9) o cortado con «…» para que quepa en `maximo`; deja puesta su letra. */
        const aCaber = (texto, maximo) => {
            for (let px = 11; px >= 9; px--) { g.font = `${px}px sans-serif`; if (g.measureText(texto).width <= maximo) return texto; }
            let t = String(texto);
            while (t.length > 1 && g.measureText(t + '…').width > maximo) t = t.slice(0, -1);
            return t + '…';
        };
        const sx = v => mL + (v - xmin) / (xmax - xmin || 1) * (W - mL - mR);
        const sy = v => H - mB - (v - ymin) / (ymax - ymin) * (H - mT - mB);
        // (2027.01.14, revisión) cada valor del eje X, escrito si no se monta con el anterior escrito ni con el último (el primero
        // y el último van siempre): con 13 cifras o más se montaban unos con otros
        const anchosX = valoresX.map(v => g.measureText(v).width), enX = valoresX.map((_, i) => sx(xmin + (xmax - xmin) * i / 5));
        let hastaX = -Infinity;
        const seEscribeX = valoresX.map((_, i) => {
            const desde = enX[i] - anchosX[i] / 2, fin = enX[i] + anchosX[i] / 2;
            const cabe = i === 0 || i === 5 || (desde >= hastaX + 6 && fin <= enX[5] - anchosX[5] / 2 - 6);
            if (cabe) hastaX = fin;
            return cabe;
        });
        // Ejes y ticks
        g.strokeStyle = '#444'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(mL, mT); g.lineTo(mL, H - mB); g.lineTo(W - mR, H - mB); g.stroke();
        g.fillStyle = '#333'; g.font = '11px sans-serif'; g.textAlign = 'center';
        for (let i = 0; i <= 5; i++) {
            const vx = xmin + (xmax - xmin) * i / 5, px = sx(vx);
            g.beginPath(); g.moveTo(px, H - mB); g.lineTo(px, H - mB + 4); g.stroke();
            if (seEscribeX[i]) g.fillText(valoresX[i], px, H - mB + 16);
            const vy = ymin + (ymax - ymin) * i / 5, py = sy(vy);
            g.beginPath(); g.moveTo(mL - 4, py); g.lineTo(mL, py); g.stroke();
            g.textAlign = 'right'; g.fillText(valoresY[i], mL - 7, py + 3); g.textAlign = 'center';
        }
        g.fillText(aCaber(etX || 'X', W - mL - mR), (mL + W - mR) / 2, H - 12);
        const nombreY = aCaber(etY || 'Y', H - mT - mB);
        g.save(); g.translate(14, (mT + H - mB) / 2); g.rotate(-Math.PI / 2);
        g.fillText(nombreY, 0, 0); g.restore();
        g.font = '11px sans-serif';
        // Puntos
        g.fillStyle = 'rgba(46,91,186,0.55)';
        for (let i = 0; i < x.length; i++) {
            g.beginPath(); g.arc(sx(x[i]), sy(esLog ? y[i] : y[i]), 3, 0, 2 * Math.PI); g.fill();
        }
        // Curva del modelo (malla de 120 puntos)
        g.strokeStyle = '#c0392b'; g.lineWidth = 2.2; g.beginPath();
        let primero = true;
        for (let i = 0; i <= 120; i++) {
            const vx = xmin + (xmax - xmin) * i / 120;
            const vy = esLog
                ? 1 / (1 + Math.exp(-(MM.ganador.b0 + MM.ganador.b1 * vx)))
                : this._evalModelo(MM.ganador, vx);
            if (!Number.isFinite(vy)) { primero = true; continue; }
            const py = Math.max(mT, Math.min(H - mB, sy(vy)));
            if (primero) { g.moveTo(sx(vx), py); primero = false; } else g.lineTo(sx(vx), py);
        }
        g.stroke();
        // Título/leyenda
        g.fillStyle = '#222'; g.font = 'bold 13px sans-serif';
        g.fillText(`Modelo ajustado: ${MM.ganador.nombre}`, W / 2, 22);
        const out = { url: cv.toDataURL('image/png'), w: W, h: H };
        this._ultimoGrafico = out;
        return out;
    },

    // Sección completa de REGRESIÓN BIVARIADA (Y ~ X): modelo OLS + concurso
    // de formas + gráfico del ganador. Guarda el estado para el Word.
    renderRegresionBivariada(colY, colX, etY, etX) {
        const R = this.regresion(colY, [colX], etY, [etX]);
        if (R.error) return { error: R.error };
        const MM = this.mejorModelo(colX, colY, etX, etY);
        // Datos para el gráfico (mismos casos completos del concurso).
        const A = (typeof AnalizadorEstadistico !== 'undefined') ? AnalizadorEstadistico : null;
        const datosG = A ? (A.obtenerDatos() || []) : [], LY = this._lectorY(datosG, colY);
        const filas = datosG.map(d => [aNumero(d[colX]), LY.leer(d[colY])]).filter(f => f.every(Number.isFinite));
        const x = filas.map(f => f[0]), y = filas.map(f => f[1]);
        let img = null;
        // (2027.01.01) con una dependiente de dos categorías con nombre, el eje dice cuál es el 1
        const etYGrafico = !MM.error && MM.eventoY ? `${etY || colY} (1 = ${MM.eventoY.evento})` : (etY || colY);
        if (!MM.error) { try { img = this.graficoModelo(x, y, MM, etX || colX, etYGrafico); } catch (e) { img = null; } }
        // (2027.01.01) ¿dependiente binaria (dos valores, con nombre o 0/1)? Su modelo es la logística (mejorModelo): sin la
        // recta de mínimos cuadrados, que la describía en «puntos» («Sexo aumenta en promedio 0.03 puntos»)
        const binaria = new Set(y).size === 2;
        // (revisión) sin modelo, su motivo (una separación en la logística): el Word lo dice, como la pantalla
        this._ultimaBivariada = { R, MM: MM.error ? null : MM, errorModelo: MM.error || null, etX: etX || colX, etY: etY || colY, binaria };

        const c1 = R.coefs[1];
        let html = `<div class="result-section">
          <h3 class="section-title">Regresión Bivariada</h3>
          <p class="result-subtitle">Modelo de <strong>${R.etY}</strong> según <strong>${etX || colX}</strong>. A diferencia de la correlación (simétrica), la regresión es <b>direccional</b>: ${binaria
              ? `con una variable dependiente de dos valores, el modelo es la regresión logística, que estima cómo cambia la probabilidad del evento por cada unidad de la independiente.</p>`
              : `estima cuánto cambia la variable dependiente por cada unidad de la independiente y permite predecir.</p>`}`;
        if (!binaria) html += `<div class="result-box">`
            + `<h5 style="margin-bottom: 0.5rem; font-weight: 600;">Modelo lineal (mínimos cuadrados)</h5>`
            + this._tab(this._tr(['B (pendiente)', 'EE', 't', 'p', 'IC 95%', 'R²', `F(${R.glR}, ${R.glE})`, 'p modelo'], true)
                + this._tr([this._fx(c1.b), this._fx(c1.se), this._fx(c1.t, 2), this._fp(c1.pValor),
                    `[${this._fx(c1.ic[0], 2)}, ${this._fx(c1.ic[1], 2)}]`, this._fx(R.R2), this._fx(R.F, 2), this._fp(R.pF)]))
            + `<p class="help-text" style="font-size:0.85em;">Ecuación: ŷ = ${numeroConMenos(R.coefs[0].b)} ${terminoConSigno(c1.b, '·x')}.</p>`
            + `</div>`
            + `<div class="result-box interpretation-box interpretation-box--correlacion">
                <h5 class="interpretation-title">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" focusable="false"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z"/></svg>
                    Interpretación Estadística
                </h5>
                <div class="interpretation-text">` + this._pedagogiaBivariada(R, etX || colX) + `</div></div>`;
        if (!MM.error) html += `<div class="result-box">` + this._htmlMejorModelo(MM) + `</div>`;
        // (2026.12.22) sin modelo (una separación en la logística, pocos casos): el motivo, en lugar de omitir la sección
        else html += `<div class="result-box"><h4 style="margin:0.6rem 0 0.2rem;">🔍 ¿Qué modelo explica mejor esta relación?</h4>`
            + `<p style="margin:0.5rem 0 0;padding:0.5rem 0.7rem;background:#fff8e1;border-left:3px solid #f0ad4e;border-radius:0.3rem;font-size:0.88em;">⚠️ ${MM.error}</p></div>`;
        // (2027.01.14, revisión) en un teléfono, de 480 de ancho como poco, desplazable dentro de su recuadro (como el diagrama
        // del SEM): a lo ancho de una caja de 242, sus textos de 11 px quedaban de 4,2
        if (img) html += `<div class="result-box" style="overflow-x:auto;"><img src="${img.url}" style="display:block;margin:0 auto;width:100%;max-width:${img.w}px;min-width:${FIGURA_EN_UN_TELEFONO}px;border-radius:0.4rem;" alt="Modelo ajustado"></div>`;
        html += `</div>`;
        return { html };
    },

    // ================= MOTOR MULTIVARIADO AVANZADO =================
    // OLS completo sobre matrices ya construidas (permite términos derivados:
    // interacción centrada, cuadrático). Devuelve coeficientes con SE/t/p/IC.
    // (2026.12.21) del núcleo único (core/stats/mco.js, por la QR de X); antes, X'X invertida por Gauss-Jordan. Incluye el
    // VIF de cada término (por la identidad con (X'X)⁻¹).
    _olsFull(y, Xcols, nombres) {
        if (this._esConstante(y)) return { error: this._SIN_VARIACION };
        const M = regresionMco(y, Xcols);
        if (!M) return { error: 'Predictores perfectamente colineales.' };
        return { familia: 'ols', n: M.n, k: M.k, coefs: this._coeficientesMco(M, j => nombres[j]), R2: M.r2, R2aj: M.r2aj,
                 F: M.F, glR: M.k, glE: M.gl, pF: M.pF, SSE: M.sce, resid: Array.from(M.residuos), yHat: Array.from(M.ajustados),
                 errorTipico: M.errorTipico, vif: Array.from(M.vif) };
    },

    // Logística multivariada, del núcleo único (core/stats/mlg.js; 2026.12.22: antes, Newton con la información invertida
    // por Gauss-Jordan). OR = e^b, con el IC de Wald exponenciado.
    _logisticaK(y01, Xcols, nombres) {
        const M = ajustarMlg(y01, Xcols, { familia: 'logistica' });
        if ('error' in M) return { error: M.error };
        const coefs = Array.from(M.beta, (b, j) => ({ nombre: j === 0 ? '(Constante)' : nombres[j - 1], b, se: M.ee[j], z: M.z[j], pValor: M.pValores[j],
            OR: Math.exp(b), ic: [Math.exp(M.ic[j][0]), Math.exp(M.ic[j][1])] }));
        return { familia: 'logistica', n: M.n, k: M.k, coefs, mcFadden: M.mcFadden, AIC: M.aic, converge: true,
                 devianza: M.devianza, devianzaNula: M.devianzaNula, avisosAjuste: M.avisos };
    },

    // Poisson multivariada, del núcleo único (core/stats/mlg.js; 2026.12.22: antes, Newton con la información invertida por
    // Gauss-Jordan) + la dispersión de Pearson (χ²/gl) para la sobredispersión. IRR = e^b, con el IC de Wald exponenciado.
    _poissonK(y, Xcols, nombres) {
        const M = ajustarMlg(y, Xcols, { familia: 'poisson' });
        if ('error' in M) return { error: M.error };
        const coefs = Array.from(M.beta, (b, j) => ({ nombre: j === 0 ? '(Constante)' : nombres[j - 1], b, se: M.ee[j], z: M.z[j], pValor: M.pValores[j],
            IRR: Math.exp(b), ic: [Math.exp(M.ic[j][0]), Math.exp(M.ic[j][1])] }));
        return { familia: 'poisson', n: M.n, k: M.k, coefs, dispersion: M.dispersion, sobredispersion: M.dispersion > 1.5, converge: true,
                 AIC: M.aic, devianza: M.devianza, devianzaNula: M.devianzaNula, avisosAjuste: M.avisos };
    },

    // Análisis multivariado COMPLETO con opciones psicológicas:
    // opciones = { interaccion:bool, cuadratico:bool, poisson:bool }
    // El PRIMER predictor es el focal (constructo de interés); el resto, controles.
    regresionAvanzada(colY, colsX, etY, etsX, opciones = {}) {
        const A = (typeof AnalizadorEstadistico !== 'undefined') ? AnalizadorEstadistico : null;
        const datos = A ? (A.obtenerDatos() || []) : [];
        if (!colY || !colsX || !colsX.length) return { error: 'Elige la dependiente y al menos un predictor.' };
        if (colsX.includes(colY)) return { error: 'La dependiente no puede ser también predictor.' };
        const LY = this._lectorY(datos, colY);
        const filas = datos.map(d => [LY.leer(d[colY]), ...colsX.map(c => aNumero(d[c]))]).filter(f => f.every(Number.isFinite));
        const n = filas.length, k0 = colsX.length;
        if (n < k0 + 5) return { error: `Casos insuficientes (${n}) para ${k0} predictores.` };
        const y = filas.map(f => f[0]);
        const ets = colsX.map((c, i) => (etsX && etsX[i]) || c);
        const avisos = [];

        // --- Familia por naturaleza de Y ---
        const unicos = [...new Set(y)];
        if (unicos.length === 2) {
            const lo = Math.min(...unicos);
            const R = this._logisticaK(y.map(v => v === lo ? 0 : 1), colsX.map((_, j) => filas.map(f => f[j + 1])), ets);
            if (R.error) return R;
            // (2027.01.01) lo que se pidió y esta familia no aplica, dicho (antes se ignoraba en silencio)
            const sinAplicar = [opciones.interaccion && 'la interacción', opciones.cuadratico && 'el término cuadrático', opciones.poisson && 'el modelo de Poisson'].filter(Boolean);
            if (sinAplicar.length) avisos.push(`Con una variable dependiente de dos valores se ajustó la regresión logística con los efectos principales: ${sinAplicar.length > 1 ? `${sinAplicar.slice(0, -1).join(', ')} y ${sinAplicar[sinAplicar.length - 1]}` : sinAplicar[0]} no se ${sinAplicar.length > 1 ? 'aplican' : 'aplica'} a esta familia.`);
            R.etY = etY || colY; R.etsX = ets; R.avisos = [...avisos, ...(R.avisosAjuste || [])];   // (2026.12.22) con los del ajuste (separación casi completa)
            R.notaFamilia = 'La variable dependiente es binaria: se ajustó una regresión logística múltiple (los coeficientes se interpretan como razones de probabilidades, OR).'
                + (LY.binaria ? ' ' + this._fraseEvento(LY.binaria, etY || colY) : '');
            R.eventoY = LY.binaria;
            this._ultimaMultiple = R;
            return R;
        }
        if (unicos.length >= 3 && unicos.length <= 6 && y.every(v => Number.isInteger(v)) && !opciones.poisson) {
            avisos.push(`La dependiente tiene ${unicos.length} categorías enteras: si representan grupos (no un puntaje), el modelo apropiado es la regresión logística multinomial (categorías sin orden) u ordinal (con orden), disponibles en software especializado (R: nnet/MASS; SPSS: NOMREG/PLUM). Aquí se ajustó el modelo para Y continua a título exploratorio.`);
        }
        if (opciones.poisson) {
            const R = this._poissonK(y, colsX.map((_, j) => filas.map(f => f[j + 1])), ets);
            if (R.error) return R;
            // (2027.01.11, revisión) lo que se pidió y el modelo de Poisson no aplica, dicho como en la logística (hasta la
            // 2027.01.10, la interacción y el término cuadrático se dejaban fuera sin decirlo)
            const sinAplicar = [opciones.interaccion && k0 >= 2 && 'la interacción', opciones.cuadratico && 'el término cuadrático'].filter(Boolean);
            if (sinAplicar.length) avisos.push(`Con el modelo de Poisson se ajustaron los efectos principales: ${sinAplicar.join(' y ')} no se ${sinAplicar.length > 1 ? 'aplican' : 'aplica'} a este modelo.`);
            R.etY = etY || colY; R.etsX = ets; R.avisos = [...avisos, ...(R.avisosAjuste || [])];
            R.notaFamilia = 'Modelo de Poisson (declarado por el investigador como conteo de eventos): los coeficientes exponenciados (IRR) indican por cuánto se multiplica la tasa esperada por cada unidad del predictor.';
            if (R.sobredispersion) R.avisos.push(`Sobredispersión detectada (χ²/gl = ${this._fx(R.dispersion, 2)} > 1.5): la varianza excede a la media, patrón típico de conductas agrupadas. El modelo recomendado es la regresión binomial negativa (R: MASS::glm.nb; SPSS: GENLIN), pues Poisson subestima los errores estándar en este escenario.`);
            this._ultimaMultiple = R;
            return R;
        }

        // --- OLS con términos psicológicos: centrado, interacción, cuadrático ---
        const Xbase = colsX.map((_, j) => filas.map(f => f[j + 1]));
        const Xc = Xbase.map(v => Array.from(centrar(v))); // centrado para interacción/cuadrático (reduce colinealidad); (2026.12.25) del núcleo único
        const cols = [...Xbase], nombres = [...ets];
        let idxInter = -1, idxCuad = -1;
        if (opciones.interaccion && k0 >= 2) {
            cols.push(Xc[0].map((v, i) => v * Xc[1][i]));
            nombres.push(`${ets[0]} × ${ets[1]} (interacción, centrada)`);
            idxInter = cols.length - 1;
        }
        if (opciones.cuadratico) {
            cols.push(Xc[0].map(v => v * v));
            nombres.push(`${ets[0]}² (efecto curvilíneo, centrado)`);
            idxCuad = cols.length - 1;
        }
        const R = this._olsFull(y, cols, nombres);
        if (R.error) return R;
        R.etY = etY || colY; R.etsX = ets; R.idxInter = idxInter; R.idxCuad = idxCuad;
        R.notaFamilia = null;

        // VIF por término (del ajuste del núcleo: la identidad con (X'X)⁻¹ en lugar de una regresión auxiliar por término)
        R.vifs = R.vif;

        // --- Regresión JERÁRQUICA por bloques (k0 ≥ 2): Bloque 1 = controles
        // (predictores 2..k), Bloque 2 = + focal (y sus términos derivados). ---
        if (k0 >= 2) {
            const idxControles = colsX.map((_, j) => j).slice(1);
            const colsB1 = idxControles.map(j => Xbase[j]);
            const R1 = this._olsFull(y, colsB1, idxControles.map(j => ets[j]));
            if (!R1.error) {
                const q = R.k - R1.k; // términos añadidos en el bloque 2
                const dR2 = R.R2 - R1.R2;
                const Fcambio = (dR2 / q) / ((1 - R.R2) / R.glE);
                R.jerarquica = {
                    focal: ets[0], controles: idxControles.map(j => ets[j]),
                    R2b1: R1.R2, R2b2: R.R2, dR2, q,
                    Fcambio, gl: [q, R.glE], pCambio: this._pF(Fcambio, q, R.glE)
                };
            }
        }

        // Aviso de atípicos severos → regresión robusta
        const sdE = Math.sqrt(R.SSE / R.glE);
        const extremos = R.resid.filter(e => Math.abs(e / sdE) > 3).length;
        if (extremos / n > 0.02) {
            avisos.push(`Se detectaron ${extremos} residuos estandarizados con |z| > 3 (${(100 * extremos / n).toFixed(1)} % de los casos): con atípicos severos, la regresión robusta (estimadores M; R: MASS::rlm) protege las estimaciones mejor que los mínimos cuadrados clásicos.`);
        }
        // Normalidad de residuos (prueba y regla del núcleo único)
        const normRes = pruebaNormalidad(R.resid);
        R.normResid = { prueba: normRes.abreviatura, pValor: normRes.pValor, normal: normRes.normal };
        R.avisos = avisos;
        this._ultimaMultiple = R;
        return R;
    },

    // Explicación exhaustiva del modelo lineal bivariado, con los valores reales.
    _pedagogiaBivariada(R, etX) {
        const c1 = R.coefs[1], c0 = R.coefs[0];
        const sig = c1.pValor < 0.05;
        return `<p style="margin:0.5rem 0 0;">Cómo leer este modelo, pieza por pieza. La <b>pendiente</b> (B = ${this._fx(c1.b)}) es el corazón de la regresión: indica que, por cada punto adicional en ${etX}, ${R.etY} ${c1.b >= 0 ? 'aumenta' : 'disminuye'} en promedio ${this._fx(Math.abs(c1.b), 2)} puntos. Su <b>error estándar</b> (${this._fx(c1.se)}) mide la incertidumbre de esa estimación, y el <b>intervalo de confianza al 95 %</b> [${this._fx(c1.ic[0], 2)}, ${this._fx(c1.ic[1], 2)}] delimita el rango plausible de la pendiente en la población: ${c1.ic[0] > 0 || c1.ic[1] < 0 ? 'como no incluye el cero, el efecto es estadísticamente distinguible de la ausencia de relación' : 'como incluye el cero, no puede descartarse la ausencia de efecto'}. La <b>constante</b> (${this._fx(c0.b)}) es el valor esperado de ${R.etY} cuando ${etX} vale cero (a veces un punto solo teórico).</p>
        <p style="margin:0.4rem 0 0;">El <b>R² = ${this._fx(R.R2)}</b> cuantifica la capacidad explicativa: el ${(100 * R.R2).toFixed(1)} % de las diferencias entre participantes en ${R.etY} queda explicado por ${etX}; el ${(100 * (1 - R.R2)).toFixed(1)} % restante obedece a otros factores no incluidos (otras variables, medición, azar). El <b>error típico</b> (${this._fx(R.errorTipico, 2)}) expresa cuánto se desvían, en promedio, las predicciones de los valores reales — la precisión práctica del modelo. Finalmente, la prueba <b>F(${R.glR}, ${R.glE}) = ${this._fx(R.F, 2)}</b> (p ${this._pTxt(R.pF)}) evalúa el modelo en conjunto: ${sig ? 'el modelo predice significativamente mejor que usar la simple media de ' + R.etY : 'el modelo no mejora significativamente a la simple media de ' + R.etY}.</p>
        <p style="margin:0.4rem 0 0;"><b>¿Por qué una correlación significativa puede convivir con un R² pequeño?</b> Porque la p y el R² responden preguntas distintas: la p pregunta <i>«¿existe el efecto?»</i> y el R² pregunta <i>«¿cuánto importa?»</i>. La significancia depende del tamaño muestral — el error estándar se encoge en proporción a √n, de modo que con muestras grandes hasta efectos diminutos se vuelven detectables —, mientras que el R² mide magnitud y no mejora por tener más casos. Además, r y R² se relacionan <i>cuadráticamente</i>: una correlación de .30, considerada moderada, explica apenas el 9 % de la variabilidad (.30² = .09)${R.R2 < 0.25 && R.pF < 0.05 ? ` — exactamente el fenómeno de estos datos: el efecto es real (p ${this._pTxt(R.pF)}) y a la vez modesto en magnitud (R² = ${this._fx(R.R2)})` : ''}. Un resultado puede ser estadísticamente innegable y prácticamente humilde; reportar ambos números evita confundir certeza con importancia.</p>`;
    },

    // Lectura pedagógica del modelo múltiple (B vs β, R² ajustado, VIF, síntesis).
    _pedagogiaMultiple(R) {
        const preds = R.coefs.slice(1);
        const sig = preds.filter(c => c.pValor < 0.05 && c.beta !== null).sort((a, b) => Math.abs(b.beta) - Math.abs(a.beta));
        let h = `<p style="margin:0.5rem 0 0;">Cómo leer los coeficientes. Cada <b>B</b> indica el cambio esperado en ${R.etY} por cada unidad del predictor <i>manteniendo constantes los demás</i> — esa cláusula es la esencia de la regresión múltiple: aísla el aporte propio de cada variable descontando lo que comparte con las otras. Como los B dependen de las unidades de medida de cada predictor, no sirven para compararlos entre sí; para eso están los <b>β estandarizados</b>, que expresan todos los efectos en la misma moneda (desviaciones estándar) y permiten ordenar la importancia relativa.</p>`;
        h += `<p style="margin:0.4rem 0 0;"><b>¿Por qué controlar variables?</b> Porque en datos no experimentales acecha la <i>tercera variable</i>: si un predictor se asocia con la dependiente solo porque ambos dependen de algo más (edad, nivel socioeconómico…), la asociación cruda le atribuye un crédito que no le pertenece. Al incluir esa tercera variable en el modelo, la regresión reparte el crédito: cada B queda depurado de lo que se explica por las demás. Controlar es, en esencia, comparar personas <i>estadísticamente equiparadas</i> en las covariables.</p>`;
        h += `<p style="margin:0.4rem 0 0;"><b>¿Y los residuos?</b> Son la parte de ${R.etY} que el modelo no logra explicar — la distancia entre lo observado y lo predicho — y funcionan como la radiografía del modelo: si se distribuyen de forma aproximadamente normal y sin patrones, el modelo capturó la estructura y dejó solo ruido; ese supuesto importa porque las pruebas t y F que validan los coeficientes se derivan matemáticamente asumiendo residuos normales — con residuos patológicos, los p-valores pierden su garantía.</p>`;
        h += `<p style="margin:0.4rem 0 0;">El <b>R² = ${this._fx(R.R2)}</b> indica que el conjunto de predictores explica el ${(100 * R.R2).toFixed(1)} % de la variabilidad de ${R.etY}; el <b>R² ajustado = ${this._fx(R.R2aj)}</b> corrige ese valor penalizando cada predictor añadido, porque el R² bruto sube mecánicamente con cualquier variable extra aunque no aporte — por eso el ajustado es el honesto para comparar modelos de distinto tamaño. El <b>VIF</b> vigila la colinealidad: cuando dos predictores comparten mucha información, sus errores estándar se inflan y los aportes individuales se vuelven borrosos (su mecánica: el VIF de cada predictor equivale a 1/(1−R²) de regresarlo sobre los demás, de modo que mide cuánta información suya ya está contenida en el resto; cuando dos predictores comparten mucha información, el modelo no puede decidir a quién atribuir el efecto común, la incertidumbre de ambos coeficientes crece y efectos reales pueden aparecer como no significativos. Valores &gt; 5 encienden la alerta${Number.isFinite(Math.max(...(R.vifs || [1]))) && Math.max(...R.vifs) > 5 ? ' — como ocurre aquí' : '; aquí están en zona segura'}).</p>`;
        h += `<p style="margin:0.4rem 0 0;"><b>Síntesis:</b> ${sig.length
            ? `contribuyen de forma independiente ${sig.map(c => `${c.nombre} (β = ${this._fx(c.beta, 2)}, p ${this._pTxt(c.pValor)})`).join('; ')}${sig.length > 1 ? ` — siendo ${sig[0].nombre} el de mayor peso relativo` : ''}. Los predictores no significativos no aportan poder explicativo propio una vez considerados los demás (lo que no niega que se relacionen con ${R.etY} de forma cruda).`
            : `ningún predictor alcanza significancia individual una vez controlados los demás: el modelo${R.significativo === false || R.pF >= 0.05 ? ' tampoco es significativo en conjunto' : ' puede ser significativo en conjunto por efectos repartidos, pero sin un responsable claro'}.`}</p>`;
        return h;
    },

    _htmlMejorModelo(MM) {
        let h = `<h4 style="margin:0.6rem 0 0.2rem;">🔍 ¿Qué modelo explica mejor esta relación?</h4>`;
        if (MM.tipoY === 'binaria') {
            const g = MM.ganador;
            if (MM.eventoY) h += `<p class="help-text" style="font-size:0.88em;">${this._fraseEvento(MM.eventoY, MM.etY)}</p>`;   // (2027.01.01) las categorías, 1 y 0
            h += `<p class="help-text" style="font-size:0.88em;">La variable dependiente es <b>binaria</b> (dos valores), por lo que el modelo apropiado no es la recta sino la <b>regresión logística</b> (probit es su gemela; en psicología se reporta logística).</p>`
                + this._tab(this._tr(['Modelo', 'Ecuación', 'OR (e^b)', 'z', 'p', 'Pseudo-R² (McFadden)'], true)
                + this._tr([g.nombre, g.ec, this._fx(g.OR, 3), this._fx(g.z, 2), this._fp(g.pValor), this._fx(g.mcFadden, 3)]))
                + `<p style="margin:0.2rem 0 0;">Lectura: por cada unidad adicional de ${MM.etX}, la <i>razón de probabilidades</i> de ${MM.etY} se multiplica por ${this._fx(g.OR, 2)} (${g.OR > 1 ? 'aumenta' : 'disminuye'} la probabilidad del evento)${g.pValor < 0.05 ? ', efecto estadísticamente significativo' : ', sin alcanzar significancia'}.</p>`;
            // (2026.12.22) los avisos del ajuste (separación casi completa), como en la regresión avanzada
            (g.avisos || []).forEach(a => {
                h += `<p style="margin:0.5rem 0 0;padding:0.5rem 0.7rem;background:#fff8e1;border-left:3px solid #f0ad4e;border-radius:0.3rem;font-size:0.88em;">⚠️ ${a}</p>`;
            });
            return h;
        }
        h += this._tab(this._tr(['Modelo', 'Ecuación ajustada', 'R²', 'AIC', 'ΔAIC'], true)
            + MM.candidatos.map(c => this._tr([c === MM.ganador ? `<b>${c.nombre} ✔</b>` : c.nombre, c.ec,
                this._fx(c.R2, 3), this._fx(c.AIC, 1), this._fx(c.dAIC, 1)])).join(''));
        h += this._justificacionAIC(MM);
        return h;
    },

    // Matriz de correlaciones para el flujo principal (3+ variables elegidas).
    renderMatrizFlujo(cols, ets) {
        const M = this.matrizCorrelaciones(cols, ets);
        if (M.error) return { error: M.error };
        this._ultimaMatrizFlujo = M;
        const idx = (i, j) => M.pares.find(p => (p.i === i && p.j === j) || (p.i === j && p.j === i));
        let html = `<div class="card" style="padding:1.25rem;">
          <h3 style="margin:0 0 0.3rem;">🔗 Matriz de correlaciones (${M.cols.length} variables)</h3>
          <p class="help-text" style="margin:0 0 0.6rem;">Con más de dos variables, el análisis presenta todas las asociaciones por pares. Para cada par se usa Pearson o Spearman según su normalidad, con p corregido por Holm.</p>`
          + this._tab(this._tr(['Variable', ...M.cols.map((_, i) => String(i + 1))], true)
            + M.cols.map((c, i) => this._tr([`${i + 1}. ${(M.etiquetas && M.etiquetas[i]) || c}`,
                ...M.cols.map((_, j) => j > i ? '' : (j === i ? '1' : `${this._fx(idx(i, j).r, 2)}${idx(i, j).sig ? ' *' : ''}`))])).join(''))
          + `<p class="help-text" style="font-size:0.85em;">n = ${M.n} casos completos. * p Holm &lt; .05. Triángulo inferior (matriz simétrica).</p>`;
        const sig = M.pares.filter(p => p.sig);
        html += `<p style="margin:0.3rem 0 0;">${sig.length
            ? `Pares significativos tras Holm: ${sig.map(p => `${(M.etiquetas || M.cols)[p.i]}–${(M.etiquetas || M.cols)[p.j]} (${p.metodo[0] === 'P' ? 'r' : 'ρ'} = ${this._fx(p.r, 2)}, p ${this._pTxt(p.pHolm)})`).join('; ')}.`
            : 'Ningún par mantiene la significancia tras la corrección de Holm.'}</p></div>`;
        return { html };
    },

    // Render del modelo múltiple avanzado (OLS/logística/Poisson) para la web.
    renderMultiple(R) {
        if (R.error) return { error: R.error };
        let h = `<div class="card" style="padding:1.25rem;margin-top:1rem;">
          <h3 style="margin:0 0 0.3rem;">📐 Regresión múltiple: ${R.etY} según ${R.etsX.join(', ')}</h3>`;
        if (R.notaFamilia) h += `<p class="help-text" style="margin:0 0 0.5rem;">${R.notaFamilia}</p>`;
        if (R.familia === 'ols') {
            h += `<h4 style="margin:0.4rem 0 0.2rem;">Resumen del modelo</h4>`
                + this._tab(this._tr(['R²', 'R² ajustado', `F(${R.glR}, ${R.glE})`, 'p'], true)
                    + this._tr([this._fx(R.R2), this._fx(R.R2aj), this._fx(R.F, 2), this._fp(R.pF)]))
                + `<h4 style="margin:0.5rem 0 0.2rem;">Coeficientes</h4>`
                + this._tab(this._tr(['Término', 'B', 'EE', 'β', 't', 'p', 'IC 95%', 'VIF'], true)
                    + R.coefs.map((c, j) => this._tr([c.nombre, this._fx(c.b), this._fx(c.se),
                        c.beta === null ? '—' : this._fx(c.beta), this._fx(c.t, 2), this._fp(c.pValor),
                        `[${this._fx(c.ic[0], 2)}, ${this._fx(c.ic[1], 2)}]`,
                        j === 0 ? '—' : this._fx(R.vifs[j - 1], 2)])).join(''));
            h += this._pedagogiaMultiple(R);
            if (R.jerarquica) {
                const J = R.jerarquica;
                h += `<h4 style="margin:0.6rem 0 0.2rem;">Análisis jerárquico por bloques</h4>
                  <p class="help-text" style="margin:0 0 0.3rem;font-size:0.88em;">Bloque 1: controles (${J.controles.join(', ')}). Bloque 2: se añade ${J.focal}${R.idxInter >= 0 || R.idxCuad >= 0 ? ' y sus términos derivados' : ''}. El ΔR² responde: ¿aporta el constructo de interés varianza explicativa <i>por encima</i> de los controles?</p>`
                  + this._tab(this._tr(['Bloque', 'R²', 'ΔR²', 'F del cambio', 'gl', 'p del cambio'], true)
                    + this._tr(['1 (controles)', this._fx(J.R2b1), '—', '—', '—', '—'])
                    + this._tr([`2 (+ ${J.focal})`, this._fx(J.R2b2), this._fx(J.dR2), this._fx(J.Fcambio, 2), `(${J.gl[0]}, ${J.gl[1]})`, this._fp(J.pCambio)]))
                  + `<p style="margin:0.2rem 0 0;">${J.pCambio < 0.05
                        ? `${J.focal} añade un ${(100 * J.dR2).toFixed(1)} % de varianza explicada por encima de los controles (cambio significativo): su aporte no se reduce a lo que ya explicaban ${J.controles.join(' y ')}.`
                        : `Una vez considerados los controles, ${J.focal} no añade varianza explicativa significativa (ΔR² = ${this._fx(J.dR2)}, p ${this._pTxt(J.pCambio)}).`}</p>`;
            }
            if (R.idxInter >= 0) {
                const c = R.coefs[R.idxInter + 1];
                h += `<p style="margin:0.4rem 0 0;"><b>Moderación:</b> el término de interacción ${c.nombre} resultó ${c.pValor < 0.05
                    ? `significativo (B = ${this._fx(c.b)}, p ${this._pTxt(c.pValor)}): el efecto de ${R.etsX[0]} sobre ${R.etY} <i>cambia según el nivel</i> de ${R.etsX[1]}.`
                    : `no significativo (p ${this._pTxt(c.pValor)}): no hay evidencia de que ${R.etsX[1]} modere el efecto de ${R.etsX[0]}.`}</p>`;
            }
            if (R.idxCuad >= 0) {
                const c = R.coefs[R.idxCuad + 1];
                h += `<p style="margin:0.3rem 0 0;"><b>Efecto curvilíneo:</b> ${c.pValor < 0.05
                    ? `el término cuadrático es significativo (B = ${this._fx(c.b)}, p ${this._pTxt(c.pValor)}): la relación tiene forma de curva (${c.b < 0 ? 'U invertida — típico patrón de nivel óptimo' : 'U'}), no de recta.`
                    : `el término cuadrático no alcanza significancia: no hay evidencia de curvatura.`}</p>`;
            }
            if (R.normResid) h += `<p class="help-text" style="font-size:0.85em;margin-top:0.4rem;">Normalidad de los residuos (${R.normResid.prueba}): p ${this._pTxt(R.normResid.pValor)} → ${R.normResid.normal ? 'supuesto satisfecho' : 'en duda: interpreta con cautela'}.</p>`;
        } else if (R.familia === 'logistica') {
            h += `<h4 style="margin:0.4rem 0 0.2rem;">Coeficientes (regresión logística múltiple)</h4>`
                + this._tab(this._tr(['Término', 'B', 'EE', 'z', 'p', 'OR', 'IC 95% (OR)'], true)
                    + R.coefs.map(c => this._tr([c.nombre, this._fx(c.b), this._fx(c.se), this._fx(c.z, 2),
                        this._fp(c.pValor), this._fx(c.OR, 3), `[${this._fx(c.ic[0], 2)}, ${this._fx(c.ic[1], 2)}]`])).join(''))
                + `<p class="help-text" style="font-size:0.85em;">Pseudo-R² de McFadden = ${this._fx(R.mcFadden, 3)}; AIC = ${this._fx(R.AIC, 1)}. Cada OR indica por cuánto se multiplican las probabilidades relativas del evento por unidad del predictor, con los demás constantes.</p>`;
        } else if (R.familia === 'poisson') {
            h += `<h4 style="margin:0.4rem 0 0.2rem;">Coeficientes (regresión de Poisson múltiple)</h4>`
                + this._tab(this._tr(['Término', 'B', 'EE', 'z', 'p', 'IRR', 'IC 95% (IRR)'], true)
                    + R.coefs.map(c => this._tr([c.nombre, this._fx(c.b), this._fx(c.se), this._fx(c.z, 2),
                        this._fp(c.pValor), this._fx(c.IRR, 3), `[${this._fx(c.ic[0], 2)}, ${this._fx(c.ic[1], 2)}]`])).join(''))
                + `<p class="help-text" style="font-size:0.85em;">Dispersión (χ²/gl) = ${this._fx(R.dispersion, 2)}${R.sobredispersion ? ' — <b>sobredispersión</b>' : ' (adecuada)'}; AIC = ${this._fx(R.AIC, 1)}. Cada IRR indica por cuánto se multiplica la tasa esperada de eventos por unidad del predictor.</p>`;
        }
        (R.avisos || []).forEach(a => {
            h += `<p style="margin:0.5rem 0 0;padding:0.5rem 0.7rem;background:#fff8e1;border-left:3px solid #f0ad4e;border-radius:0.3rem;font-size:0.88em;">⚠️ ${a}</p>`;
        });
        h += `</div>`;
        return { html: h };
    },

    // Justificación detallada de la selección de modelo (Burnham & Anderson).
    _justificacionAIC(MM) {
        const g = MM.ganador;
        const orden = [...MM.candidatos].sort((a, b) => a.AIC - b.AIC);
        const rival = orden.find(c => c !== g) || orden[1];
        // (revisión 2026.12.30) con las bandas de Burnham y Anderson que cita el texto, y las intermedias: antes, todo ΔAIC entre
        // 2 y 7 era «considerablemente menos apoyo», también el 3.0 de una recta que, dos frases después, «conserva parte del apoyo»
        const zona = d => d < 2 ? 'apoyo prácticamente equivalente' : d < 4 ? 'algo menos de apoyo, aunque todavía apreciable'
            : d <= 7 ? 'considerablemente menos apoyo empírico' : d <= 10 ? 'muy poco apoyo empírico' : 'apoyo esencialmente nulo';
        let h = `<p style="margin:0.4rem 0 0;"><b>El problema de fondo: el sobreajuste.</b> Toda muestra contiene dos ingredientes mezclados: la <i>señal</i> (la relación real que también existirá en otras muestras) y el <i>ruido</i> (las fluctuaciones aleatorias propias de estos participantes concretos). Un modelo sobreajustado es el que, en su afán de ceñirse a los datos, aprende también el ruido — como un estudiante que memoriza las respuestas del examen de práctica en lugar de entender la materia: brilla en esa prueba y fracasa en la siguiente. Por eso un modelo puede explicar casi perfectamente <i>esta</i> muestra y desplomarse en otra: la parte del ajuste que perseguía ruido no se replica, porque el ruido nuevo es distinto.</p>
        <p style="margin:0.4rem 0 0;"><b>¿Por qué el modelo cúbico casi siempre gana en R²?</b> Por construcción matemática, no por mérito: el cúbico contiene al cuadrático y al lineal como casos particulares (basta fijar en cero sus términos extra), así que su ajuste nunca puede ser peor — cada parámetro adicional es un grado de libertad más para doblarse hacia los puntos, y la suma de errores solo puede bajar o quedar igual. De ahí que <b>elegir por mayor R² sería un criterio trampa</b>: coronaría siempre al modelo más complejo, garantizando el sobreajuste que queremos evitar.</p>
        <p style="margin:0.4rem 0 0;"><b>La solución del AIC.</b> El criterio de información de Akaike trata cada parámetro como una <i>licencia para perseguir ruido</i> y le cobra un precio: premia la verosimilitud del ajuste pero descuenta 2 puntos por parámetro, de modo que un término extra solo compensa si mejora el ajuste más de lo que cuesta. <b>Menor AIC = mejor compromiso</b> entre fidelidad a los datos y capacidad de generalizar. Las diferencias (ΔAIC) se leen con las convenciones de Burnham y Anderson: Δ &lt; 2, modelos prácticamente equivalentes; entre 2 y 4, el rival conserva parte del apoyo; entre 4 y 7, pierde apoyo considerable; Δ &gt; 10, queda sin apoyo empírico.</p>`;
        if (rival) {
            const d = rival.AIC - g.AIC;
            h += `<p style="margin:0.4rem 0 0;">En estos datos, <b>${g.nombre}</b> ${MM.parsimonia
                ? `empata en la práctica con otras formas (Δ &lt; 2) y se impone por <b>parsimonia</b>: cuando la evidencia no distingue entre una forma simple y otra más compleja o curva, la ciencia elige la simple, porque cada parámetro o curvatura que no gana apoyo real solo añade riesgo de sobreajuste`
                : `presenta el menor AIC; su rival más cercano (${rival.nombre}) queda a ΔAIC = ${this._fx(d, 1)}, es decir, con ${zona(d)}`}. En términos de ajuste, el ganador explica el ${(100 * g.R2).toFixed(1)} % de la variabilidad de ${MM.etY} (R² = ${this._fx(g.R2, 3)})${Math.abs(g.R2 - rival.R2) < 0.01 ? `, prácticamente lo mismo que ${rival.nombre} (R² = ${this._fx(rival.R2, 3)}) — otra señal de que la complejidad extra no compra ajuste real` : ` frente al ${(100 * rival.R2).toFixed(1)} % de ${rival.nombre}`}.</p>`;
        }
        h += `<p style="margin:0.4rem 0 0;"><b>Implicación práctica:</b> ${g.nombre === 'Lineal'
            ? `la relación entre ${MM.etX} y ${MM.etY} se describe adecuadamente con una recta, lo que valida el uso del coeficiente de correlación lineal como resumen fiel de la asociación.`
            : this._implicacionCurva(MM)}</p>`;
        return h;
    },

    // (2026.12.30) La implicación de una forma curva, según lo lejos que quede la recta: a ΔAIC entre 2 y 4 conserva parte
    // del apoyo (Burnham y Anderson), así que son indicios por confirmar; desde 4, curvatura.
    _implicacionCurva(MM) {
        const g = MM.ganador, l = MM.candidatos.find(c => c.nombre === 'Lineal');
        if (l && l.dAIC < 4) return `la relación entre ${MM.etX} y ${MM.etY} muestra indicios de curvatura (forma ${g.nombre.toLowerCase()}), aunque la recta, a ΔAIC = ${this._fx(l.dAIC, 1)}, conserva parte del apoyo: conviene confirmarla (por ejemplo, con el diagnóstico de la forma de la relación) antes de apoyar en ella las conclusiones; mientras tanto, el coeficiente de correlación lineal sigue siendo un resumen razonable.`;
        return `la relación entre ${MM.etX} y ${MM.etY} presenta curvatura (forma ${g.nombre.toLowerCase()})${l ? `, y la recta queda a ΔAIC = ${this._fx(l.dAIC, 1)} de ella` : ''}: el coeficiente de correlación lineal subestima la intensidad real del vínculo, y las conclusiones deben apoyarse en esta forma funcional.`;
    },

    // Interpretación en lenguaje llano (compartida con el Word).
    interpretar(R) {
        const preds = R.coefs.slice(1);
        const sig = preds.filter(c => c.pValor < 0.05);
        let s = `El modelo de regresión múltiple explica el ${(100 * R.R2).toFixed(1)}\u2009% de la variabilidad de ${R.etY} `
            + `(R² = ${this._fx(R.R2)}, R² ajustado = ${this._fx(R.R2aj)}) y resulta ${R.significativo ? '' : 'no '}significativo en conjunto, `
            + `F(${R.glR}, ${R.glE}) = ${this._fx(R.F, 2)}, p ${this._pTxt(R.pF)}. `;
        s += sig.length
            ? `Contribuyen de forma independiente: ${sig.map(c => `${c.nombre} (β = ${this._fx(c.beta, 2)}, p ${this._pTxt(c.pValor)})`).join('; ')} — cada β expresa cuántas desviaciones estándar cambia ${R.etY} por cada desviación estándar del predictor, manteniendo constantes los demás. `
            : `Ningún predictor alcanza significancia individual una vez controlados los demás. `;
        const maxVif = Math.max(...R.vifs);
        if (Number.isFinite(maxVif) && maxVif > 5) s += `Atención: hay colinealidad apreciable (VIF máximo = ${this._fx(maxVif, 1)}), lo que infla los errores estándar y dificulta separar los aportes individuales. `;
        const cva = R.k >= 2 ? this.crudoVsAjustado(R) : null;
        if (cva) {
            s += cva.sobrevive
                ? `El efecto de ${cva.focal} sobre ${R.etY} se mantiene significativo tras controlar ${cva.covariables.join(', ')} (B pasa de ${this._fx(cva.crudo.b, 2)} a ${this._fx(cva.ajustado.b, 2)}): la asociación no se explica por esas covariables, condición necesaria —aunque no suficiente— para una interpretación causal. `
                : `El efecto de ${cva.focal} deja de ser significativo al controlar ${cva.covariables.join(', ')}: la asociación cruda podría ser atribuible, al menos en parte, a esas covariables. `;
        }
        s += `Debe recordarse que, con un diseño transversal, la regresión estima asociación con control estadístico, no causalidad: establecer causa requeriría además precedencia temporal (diseños longitudinales) o manipulación experimental.`;
        return s;
    }
};

if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', () => RegresionMultiple.montar());
    } else {
        queueMicrotask(() => RegresionMultiple.montar());   // (F5) tras evaluar todo el grafo de módulos (hay ciclos)
    }
}

export { RegresionMultiple };
