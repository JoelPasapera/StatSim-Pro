// simulador/dominio/generador.js — la clase GeneradorDatos: constructor, generador aleatorio y primitivas
// numéricas, más la composición de los módulos de dominio (una responsabilidad por archivo). (2026.12.25, cierre de
// la fase F6) Las primitivas son envoltorios de una línea del núcleo único (core/): el azar con semilla, la normal, la
// muestra sin reemplazo, Cholesky, la matriz válida más cercana, los mínimos cuadrados y la Pearson; aquí quedan los
// muestreos que solo usa el generador (Poisson, Bernoulli, categoría, log-normal) y sus ejes principales de un factor
// con pasos fijos (ver _pafUnFactor).
// Sin DOM y sin globales: se importa desde la interfaz, el Worker y las pruebas.

import { BaseColumnar } from '../../core/data/base-columnar.js';
import { ReglasCoherencia } from './reglas-coherencia.js';
import { TAMANO_MUESTRAL_MAXIMO, SIGMA_FORMA_ASIMETRICA, ESTILOS_RESPUESTA, NIVELES_DESAJUSTE, PERFILES_HETEROGENEIDAD } from './constantes.js';
import { metodosConfiguracion } from './configuracion.js';
import { metodosValidacion } from './validacion.js';
import { metodosCorrelaciones } from './correlaciones.js';
import { metodosGrupos } from './grupos.js';
import { metodosItems } from './items.js';
import { metodosFlujo } from './flujo.js';
import { metodosImperfecciones } from './imperfecciones.js';
import { metodosInforme } from './informe.js';
import { cdfNormal, cuantilNormal, lnGamma } from '../../core/stats/numerico.js';
import { media as mediaNucleo, centrar, estandarizar } from '../../core/stats/descriptivos.js';
import { correlacion, matrizCorrelaciones } from '../../core/stats/correlacion.js';
import { ajustarMlg } from '../../core/stats/mlg.js';
import { pruebaIndependencia } from '../../core/stats/contingencia.js';
import { choleskyForzado, esDefinidaPositiva, inversaTriangularInferior, productoTriangularTraspuesto, logDeterminanteDeFactor } from '../../core/linalg/cholesky.js';
import { suavizarCorrelacion } from '../../core/linalg/autovalores.js';
import { ajustarMco, proyectorResiduos } from '../../core/stats/mco.js';
import { mulberry32 } from '../../core/random/mulberry32.js';
import { normalBoxMuller } from '../../core/random/normal.js';
import { muestraSinReemplazo } from '../../core/random/permutacion.js';
import { metodosAtipicos } from './atipicos-motor.js';   // (Atlas, dimensión B4)
import { metodosExportacionSpss } from './exportacion-spss.js';   // (2026.12.29) la base como .sav
import { metodosExportacionXlsx } from './exportacion-xlsx.js';   // (2026.12.31) la base como libro de Excel

class GeneradorDatos {
    constructor() {
        this.datosGenerados = null;
        this.configuracion = {
            tamanoMuestra: 100,
            semilla: null,
            pruebas: [],
            sociodemograficos: []
        };
        // Fuente de números aleatorios (reemplazable por un PRNG sembrado)
        this.aleatorio = Math.random;
    }

    // ========================================
    // ALEATORIEDAD (REPRODUCIBLE CON SEMILLA)
    // ========================================
    // Inicializa la fuente de aleatoriedad. Con una semilla numérica usa un
    // PRNG determinista (Mulberry32): la misma semilla produce el mismo
    // conjunto de datos. Sin semilla, usa Math.random.
    // El generador es una clausura sobre su estado: guardarlo/restaurarlo es
    // guardar/restaurar la función (una simulación con semilla propia no altera
    // la secuencia principal).
    _guardarAleatorio() { return this.aleatorio; }

    _restaurarAleatorio(fn) { if (typeof fn === 'function') this.aleatorio = fn; }

    inicializarAleatorio(semilla) {
        if (semilla === null || semilla === undefined || isNaN(semilla)) {
            this.aleatorio = Math.random;
            return;
        }

        this.aleatorio = mulberry32(semilla);   // (2026.12.25) el generador del núcleo único (core/random/mulberry32.js)
    }

    // Valor normal estándar N(0,1) por el método de Box-Muller (core/random/normal.js; si u₁ = 0, se saca otra).
    generarNormalEstandar() { return normalBoxMuller(this.aleatorio); }


    // CDF de la normal estándar Φ(z).
    normalCDF(z) { return cdfNormal(z); }

    // Inversa de la normal estándar Φ⁻¹(p), del núcleo único (core/stats/numerico.js: AS241, error relativo < 1e-16); ±∞ fuera de (0, 1).
    normalInversa(p) { return !(p > 0 && p < 1) ? (p <= 0 ? -Infinity : Infinity) : cuantilNormal(p); }

    generarValorNormal(media, desviacion, z = null) {
        // z permite inyectar un valor normal estándar "driver" (correlaciones).
        const normal = z !== null ? z : this.generarNormalEstandar();
        return media + desviacion * normal;
    }

    // Valor uniforme continuo en [min, max].
    generarUniforme(min, max) {
        return min + this.aleatorio() * (max - min);
    }

    // Valor log-normal (asimetría positiva) calibrado para que su media y su
    // desviación estándar sean aproximadamente las pedidas. Requiere media > 0.
    generarAsimetrico(media, desviacion, z = null) {
        const m = Math.max(1e-6, media);
        const sigma2 = Math.log(1 + (desviacion * desviacion) / (m * m));
        const sigma = Math.sqrt(sigma2);
        const mu = Math.log(m) - sigma2 / 2;
        const normal = z !== null ? z : this.generarNormalEstandar();
        return Math.exp(mu + sigma * normal);
    }

    // Valor de una distribución de Poisson con media lambda (algoritmo de Knuth).
    generarPoisson(lambda) {
        if (!(lambda > 0)) return 0;
        // (Revisión del generador, 2026-09-15) el método de Knuth necesita e^−λ: con
        // λ > 700 se desborda a 0 y el bucle devolvía ≈ 1075 fuera cual fuese λ (una
        // media de 1000 salía 748). Para λ grande, transformación normal con
        // corrección de continuidad (error relativo < 1 % desde λ ≈ 30).
        if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * this.generarNormalEstandar() - 0.5 + this.aleatorio()));
        const limite = Math.exp(-lambda);
        let k = 0;
        let producto = 1;
        do {
            k++;
            producto *= this.aleatorio();
        } while (producto > limite);
        return k - 1;
    }

    // Valor binario (Bernoulli): 1 con probabilidad `proporcion`, 0 si no.
    generarBinaria(proporcion) {
        return this.aleatorio() < proporcion ? 1 : 0;
    }

    // Categoría entera equiprobable en [min, max].
    generarCategoria(min, max) {
        const k = Math.floor(max - min + 1);
        return min + Math.floor(this.aleatorio() * k);
    }

    _lgamma(x) { return lnGamma(x); }

    // Muestra SIN reemplazo de k índices de [0, n): Fisher–Yates parcial (O(n) de memoria, k números del azar).
    // Sustituye a sort(() => aleatorio() − 0.5), que no baraja uniformemente:
    // con n = 200 y k = 20 la fila 1 salía elegida el 25 % de las veces y la
    // 187 el 6 % (lo esperado es 10 % para todas), así que los descuidados se
    // concentraban en los primeros ID. (2026.12.25) La del núcleo único
    // (core/random/permutacion.js), con el azar de la generación.
    _muestraSinReemplazo(n, k) { return muestraSinReemplazo(n, k, this.aleatorio); }

    // ============ INFORME PEDIDO vs OBTENIDO ============
    // Cierra el ciclo «lo que se pide es lo que se entrega»: mide en la base
    // generada cada parámetro solicitado y lo pone al lado del valor real.
    _corr(x, y) { return correlacion(x, y); }   // del núcleo único: NaN si alguna serie es constante, como antes

    // Matriz de correlaciones de columnas (arreglos de igual longitud): la del núcleo
    // único (2026.12.25), la misma del Analizador; 0 con una columna constante.
    _matrizCorrelacion(cols) { return matrizCorrelaciones(cols); }

    // ========================================
    // CORRELACIONES OBJETIVO (CHOLESKY)
    // ========================================
    // Descomposición de Cholesky (L·Lᵀ = A) de una matriz simétrica. Si la
    // matriz no es definida positiva (correlaciones inconsistentes), los
    // elementos diagonales se acotan a un mínimo (10⁻⁹) para no producir NaN y la
    // matriz queda marcada como forzada. (2026.12.25) La factorización forzada del
    // núcleo único (core/linalg/cholesky.js), con la misma aritmética que tenía aquí.
    descomposicionCholesky(A) {
        const r = choleskyForzado(A, 1e-9);
        if (r.forzada) this.matrizForzada = true;   // pedido imposible: se fuerza
        this.matrizNoDefinidaPositiva = r.noDefinidaPositiva;
        return r.L;
    }

    _inversaTriangularInferior(S) { return inversaTriangularInferior(S); }

    // ¿Definida positiva con un margen? (todos los pivotes de Cholesky mayores que 10⁻¹⁰). (2026.12.25) La del núcleo único:
    // con un NaN en la matriz dice que no; la copia de aquí decía que sí (su comparación d ≤ 10⁻¹⁰ es falsa con NaN). Las
    // matrices que recibe no tienen NaN.
    _esDefinidaPositiva(R) { return esDefinidaPositiva(R, { tolerancia: 1e-10, absoluta: true }); }

    // La matriz de correlaciones válida más cercana a una pedida imposible: los autovalores menores que 10⁻³ pasan a
    // 10⁻³ y se reescala a diagonal unitaria. (2026.12.25) El suavizado del núcleo único (core/linalg/autovalores.js),
    // con su Jacobi; el de aquí paraba con un criterio absoluto (10⁻¹⁴ sobre la suma de cuadrados fuera de la diagonal).
    _matrizValidaMasCercana(R) { return suavizarCorrelacion(R, 1e-3).R; }

    _triadasIncompatibles(R, nombres) {
        const out = [], n = R.length;
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
            const a = R[i][j], b = R[i][k], c = R[j][k];
            if (!a || !b || !c) continue;
            const det = 1 + 2 * a * b * c - a * a - b * b - c * c;
            if (det < -1e-9) out.push({ variables: [nombres[i], nombres[j], nombres[k]], correlaciones: [a, b, c], det });
        }
        return out;
    }

    diagnosticarMatriz(R, nombres) {
        if (this._esDefinidaPositiva(R)) return { imposible: false, triadas: [], ajustes: [], R };
        const triadas = this._triadasIncompatibles(R, nombres);
        const Rv = this._matrizValidaMasCercana(R);
        const ajustes = [];
        for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++)
            if (Math.abs(Rv[i][j] - R[i][j]) > 0.005) ajustes.push({ a: nombres[i], b: nombres[j], pedido: R[i][j], ajustado: Rv[i][j] });
        ajustes.sort((x, y) => Math.abs(y.ajustado - y.pedido) - Math.abs(x.ajustado - x.pedido));
        return { imposible: true, triadas, ajustes, R: Rv };
    }

    // Coeficientes de regresión de y (estandarizada) sobre los predictores, estandarizados (si estandarizarX) o solo
    // centrados (para el producto z_X·z_W). null si y o un predictor no varían, o si los predictores son colineales. Solo lo
    // usa el informe. (2026.12.25) Las puntuaciones típicas (con la DE poblacional) y los mínimos cuadrados del núcleo único
    // (core/stats/descriptivos.js y core/stats/mco.js, por la QR; todo centrado: la constante sale 0). Antes, las
    // ecuaciones normales resueltas por Gauss-Jordan, que daban null con un pivote menor que 10⁻¹² (con los predictores
    // estandarizados, un R² con los anteriores mayor que 1 − 10⁻¹²); ahora decide el criterio de colinealidad del núcleo
    // (1 − 10⁻¹⁴, el de lm de R).
    _betasEstandarizadas(y, predictores, estandarizarX = true) {
        const n = y.length, p = predictores.length;
        if (n < p + 3) return null;
        const est = arr => { const e = estandarizar(arr); return e.de > 0 ? e.z : null; };
        const yz = est(y);
        if (!yz) return null;
        const Xs = [];
        for (let j = 0; j < p; j++) {
            const c = estandarizarX ? est(predictores[j]) : centrar(predictores[j]);
            if (!c) return null;
            Xs.push(c);
        }
        const f = ajustarMco(yz, Xs);
        return f ? Array.from(f.beta.subarray(1)) : null;
    }

    // Residualiza `col` contra las columnas X (con intercepto) por mínimos
    // cuadrados; sin efectos secundarios. Devuelve un Float64Array nuevo.
    // (2026.12.25) La proyección del núcleo único (core/stats/mco.js, por la QR: una columna colineal no añade nada y se omite);
    // antes, las ecuaciones normales con el Cholesky forzado.
    _residualizarColumna(col, columnasX) { return proyectorResiduos(columnasX, col.length)(col); }

    // Genera el vector de valores normales correlacionados (uno por variable
    // correlacionable) para un participante: y = L·z con z ~ N(0,1) i.i.d.
    // ================== CORRELACIONES EXACTAS EN LA MUESTRA ==================
    // Sin esto, la correlación OBSERVADA fluctúa alrededor de la pedida por el
    // error de muestreo (con n = 250 y r = 0.40, ±0.05 es lo normal). Aquí se
    // genera la matriz de drivers de TODA la muestra y se «blanquea»:
    //   1. estandarizar columnas → media 0, DE 1
    //   2. Cholesky de la correlación MUESTRAL C = S·Sᵀ  →  W = Z·(S⁻¹)ᵀ
    //      (W queda con correlación muestral EXACTAMENTE identidad)
    //   3. Z* = W·Lᵀ con L = Cholesky de la matriz OBJETIVO
    // Resultado: la correlación muestral de los drivers es exactamente la pedida.
    _estandarizarColumnas(Z) {
        const n = Z.length, m = Z[0].length;
        for (let j = 0; j < m; j++) {
            let s = 0; for (let i = 0; i < n; i++) s += Z[i][j];
            const media = s / n;
            let v = 0; for (let i = 0; i < n; i++) v += (Z[i][j] - media) ** 2;
            const de = Math.sqrt(v / n) || 1e-9;
            for (let i = 0; i < n; i++) Z[i][j] = (Z[i][j] - media) / de;
        }
        return Z;
    }

    _correlacionMuestral(Z) {
        const n = Z.length, m = Z[0].length;
        const C = Array.from({ length: m }, () => new Array(m).fill(0));
        for (let a = 0; a < m; a++) for (let b = 0; b < m; b++) {
            let s = 0; for (let i = 0; i < n; i++) s += Z[i][a] * Z[i][b];
            C[a][b] = s / n;
        }
        return C;
    }

    // GLM (logit o log) con intercepto, para el informe de verificación (el OR o la IRR obtenidos en la base): del núcleo único
    // (core/stats/mlg.js: IRLS sobre la QR ponderada, el de la regresión del Analizador). X: columnas de predictores. Devuelve
    // { beta, ee, avisos } o { error } (separación, colinealidad). (2026.12.22) Antes, un IRLS propio por las ecuaciones normales con
    // un pivote absoluto, que ante una separación devolvía la última iteración (un OR enorme con un EE enorme, que el informe
    // podía dar por bueno). No interviene en la generación: las bases de una semilla no cambian.
    _glm(y, X, familia) {
        const M = ajustarMlg(y, X, { familia: familia === 'logit' ? 'logistica' : 'poisson' });
        return 'error' in M ? { error: M.error } : { beta: Array.from(M.beta), ee: Array.from(M.ee), avisos: M.avisos };
    }

    // Un factor por ejes principales iterados sobre una matriz de correlaciones
    // (misma rutina que usa el ω): devuelve las cargas estandarizadas o null.
    // (2026.12.25) Queda fuera del núcleo a propósito: con pasos fijos (30
    // iteraciones de 60 pasos de potencias, desde el mayor |r| de cada fila) no
    // llega a la solución con 3 o 4 ítems, pero el motor del núcleo, que itera hasta
    // la convergencia, cae a menudo en un caso Heywood con tan pocos ítems y desvía
    // la calibración de μ (que lo usa en la generación: cambiaría las bases de una
    // semilla sin mejorarlas en conjunto). Lo usan esa calibración y el informe.
    _pafUnFactor(R) {
        const k = R.length;
        if (k < 2) return null;
        let h2 = R.map((fila, i) => Math.max(...fila.map((r, j) => i === j ? 0 : Math.abs(r))));
        let cargas = null;
        for (let iter = 0; iter < 30; iter++) {
            const Rr = R.map((fila, i) => fila.map((r, j) => i === j ? h2[i] : r));
            let v = new Array(k).fill(1 / Math.sqrt(k)), lam = 0;
            for (let p = 0; p < 60; p++) {
                const w = Rr.map(fila => fila.reduce((s, r, j) => s + r * v[j], 0));
                const norma = Math.sqrt(w.reduce((s, x) => s + x * x, 0));
                if (!(norma > 0)) return null;
                v = w.map(x => x / norma); lam = norma;
            }
            if (!(lam > 0)) return null;
            const signo = v.reduce((s, x) => s + x, 0) >= 0 ? 1 : -1;
            const nuevas = v.map(x => Math.sqrt(lam) * x * signo);
            const cambio = Math.max(...nuevas.map((c, i) => Math.abs(c * c - h2[i])));
            h2 = nuevas.map(c => Math.min(c * c, 0.999));
            cargas = nuevas;
            if (cambio < 1e-6) break;
        }
        return cargas;
    }

    // KMO global y prueba de Bartlett de una matriz de correlaciones (por Cholesky)
    _kmoBartlett(R, n) {
        const k = R.length;
        try {
            const L = this.descomposicionCholesky(R.map(f => f.slice()));
            const inv = productoTriangularTraspuesto(this._inversaTriangularInferior(L)), logDet = logDeterminanteDeFactor(L);
            let sumR2 = 0, sumP2 = 0;
            for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) { if (i === j) continue; sumR2 += R[i][j] * R[i][j]; const pij = -inv[i][j] / Math.sqrt(inv[i][i] * inv[j][j]); sumP2 += pij * pij; }
            const kmo = sumR2 / (sumR2 + sumP2);
            const chi2 = -(n - 1 - (2 * k + 5) / 6) * logDet;
            const gl = k * (k - 1) / 2;
            return { kmo, chi2, gl, significativo: chi2 > gl + 4 * Math.sqrt(2 * gl) };   // aprox. p < 0.001 con gl grande
        } catch (e) { return null; }
    }

    // V de Cramér entre dos columnas de códigos (casos completos; 0 sin casos o con menos de 2 categorías en alguna): la de
    // la χ² de independencia del núcleo único (core/stats/contingencia.js). (2026.12.24) Antes, una copia propia de la χ²;
    // las categorías siguen el orden en que aparecen, como en ella (la χ² se suma en el mismo orden), y la V difiere a lo
    // sumo en el último bit, porque la división se agrupa de otro modo (el informe la muestra con tres decimales).
    _cramerV(a, b) {
        const filas = new Map(), cols = new Map(), pares = [];
        for (let i = 0; i < a.length; i++) {
            if (!(a[i] === a[i]) || !(b[i] === b[i])) continue;
            if (!filas.has(a[i])) filas.set(a[i], filas.size);
            if (!cols.has(b[i])) cols.set(b[i], cols.size);
            pares.push([filas.get(a[i]), cols.get(b[i])]);
        }
        if (pares.length === 0 || filas.size < 2 || cols.size < 2) return 0;
        const tabla = Array.from({ length: filas.size }, () => new Array(cols.size).fill(0));
        for (const [f, c] of pares) tabla[f][c]++;
        return pruebaIndependencia(tabla).cramerV;
    }

    // (C4) CCI(1) por ANOVA de un factor: (MSB − MSW) / (MSB + (n₀ − 1)·MSW)
    _iccAnova(valores, codigos) {
        const grupos = new Map();
        for (let i = 0; i < valores.length; i++) { const v = valores[i]; if (!(v === v)) continue; if (!grupos.has(codigos[i])) grupos.set(codigos[i], []); grupos.get(codigos[i]).push(v); }
        const K = grupos.size; if (K < 2) return null;
        let N = 0, sumaTotal = 0; grupos.forEach(g => { N += g.length; g.forEach(v => { sumaTotal += v; }); });
        const mediaG = sumaTotal / N;
        let ssb = 0, ssw = 0, sumN2 = 0;
        grupos.forEach(g => { const m = mediaNucleo(g); ssb += g.length * (m - mediaG) ** 2; g.forEach(v => { ssw += (v - m) ** 2; }); sumN2 += g.length * g.length; });
        const msb = ssb / (K - 1), msw = ssw / Math.max(1, N - K);
        const n0 = (N - sumN2 / N) / (K - 1);
        return (msb - msw) / (msb + (n0 - 1) * msw);
    }

    // d marginal observada (pendiente sobre el código / DE agrupada dentro de
    // los grupos de ESA agrupación), como la calcula el informe.
    _dMarginal(valores, codigos) {
        const n = valores.length;
        const porGrupo = new Map();
        for (let i = 0; i < n; i++) { const v = valores[i]; if (!(v === v)) continue; const g = codigos[i]; if (!porGrupo.has(g)) porGrupo.set(g, []); porGrupo.get(g).push(v); }
        if (porGrupo.size < 2) return null;
        let ssIntra = 0, gl = 0;
        porGrupo.forEach(vals => { const mg = mediaNucleo(vals); vals.forEach(v => { ssIntra += (v - mg) ** 2; }); gl += vals.length - 1; });
        const deIntra = Math.sqrt(ssIntra / Math.max(1, gl));
        let mc = 0, mv = 0, k = 0;
        for (let i = 0; i < n; i++) { if (valores[i] === valores[i]) { mc += codigos[i]; mv += valores[i]; k++; } }
        mc /= k; mv /= k;
        let sxy = 0, sxx = 0;
        for (let i = 0; i < n; i++) { if (valores[i] === valores[i]) { sxy += (codigos[i] - mc) * (valores[i] - mv); sxx += (codigos[i] - mc) ** 2; } }
        return (sxx > 0 && deIntra > 0) ? (sxy / sxx) / deIntra : null;
    }

    // (C4) d de interacción observada en un 2×2: [(m11 − m10) − (m01 − m00)] /
    // DE agrupada dentro de las cuatro celdas.
    _dInteraccion(valores, codA, codB) {
        const celdas = [[[], []], [[], []]];
        for (let i = 0; i < valores.length; i++) { const v = valores[i]; if (!(v === v)) continue; const a = codA[i] === 1 ? 1 : 0, b = codB[i] === 1 ? 1 : 0; celdas[a][b].push(v); }
        if (celdas.some(f => f.some(c => c.length < 2))) return null;
        let ss = 0, gl = 0;
        const media = mediaNucleo;   // (2026.12.12) del núcleo único
        celdas.forEach(f => f.forEach(c => { const m = media(c); c.forEach(v => { ss += (v - m) ** 2; }); gl += c.length - 1; }));
        const de = Math.sqrt(ss / Math.max(1, gl));
        if (!(de > 0)) return null;
        return ((media(celdas[1][1]) - media(celdas[1][0])) - (media(celdas[0][1]) - media(celdas[0][0]))) / de;
    }

    // κ de Fleiss (con 2 jueces coincide con el de Cohen salvo por los marginales) y acuerdo medio
    _kappaFleiss(columnas) {
        const n = columnas[0].length, m = columnas.length;
        const categorias = new Map(); let N = 0; let sumaP = 0;
        const filasValidas = [];
        for (let i = 0; i < n; i++) { const vals = columnas.map(c => c[i]); if (vals.some(v => !(v === v))) continue; filasValidas.push(vals); vals.forEach(v => categorias.set(v, (categorias.get(v) || 0) + 1)); N++; }
        if (N < 5) return null;
        filasValidas.forEach(vals => { const cnt = new Map(); vals.forEach(v => cnt.set(v, (cnt.get(v) || 0) + 1)); let s = 0; cnt.forEach(x => { s += x * x; }); sumaP += (s - m) / (m * (m - 1)); });
        const Pbar = sumaP / N;
        let Pe = 0; categorias.forEach(x => { const p = x / (N * m); Pe += p * p; });
        return Pe >= 1 ? null : { kappa: (Pbar - Pe) / (1 - Pe), acuerdo: Pbar };
    }

    // Recuentos exactos por nivel (mayores restos) para n personas
    _recuentosExactos(niveles, n) {
        const exactos = niveles.map(x => x.proporcion * n);
        const base = exactos.map(Math.floor);
        let faltan = n - base.reduce((s, v) => s + v, 0);
        const orden = exactos.map((v, k) => [v - base[k], k]).sort((a, b) => b[0] - a[0]);
        for (let j = 0; faltan > 0 && j < orden.length; j++, faltan--) base[orden[j][1]]++;
        return base;
    }

    // Sorteo de un nivel según sus proporciones (i.i.d.)
    _sortearNivel(niveles) {
        const u = this.aleatorio();
        let acum = 0;
        for (let k = 0; k < niveles.length; k++) { acum += niveles[k].proporcion; if (u < acum) return niveles[k].codigo; }
        return niveles[niveles.length - 1].codigo;
    }

}

// Composición explícita: cada módulo aporta sus métodos al prototipo.
Object.assign(GeneradorDatos.prototype, metodosConfiguracion, metodosValidacion, metodosCorrelaciones, metodosGrupos, metodosItems, metodosFlujo, metodosImperfecciones, metodosInforme, metodosAtipicos, metodosExportacionSpss, metodosExportacionXlsx);

export { GeneradorDatos };
export const Generador = GeneradorDatos;
export { BaseColumnar, ReglasCoherencia, TAMANO_MUESTRAL_MAXIMO, SIGMA_FORMA_ASIMETRICA, ESTILOS_RESPUESTA, NIVELES_DESAJUSTE, PERFILES_HETEROGENEIDAD };
