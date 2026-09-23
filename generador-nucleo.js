// ========================================
// GENERADOR DE BASE DE DATOS SIMULADA
// ========================================

// Tope superior del tamaño muestral para evitar congelar el navegador.
const TAMANO_MUESTRAL_MAXIMO = 100000;

// σ de la forma «asimétrica» de las ESCALAS: log-normal estandarizada que
// transformarFormaZ aplica al driver normal. FUENTE ÚNICA: la corrección de
// correlación intermedia (_rhoIntermedia) debe usar exactamente este valor.
const SIGMA_FORMA_ASIMETRICA = 0.6;

// (B5) Heterogeneidad de los ítems de cada escala. Cada nivel fija:
//  · medias: amplitud de las medias de ítem como fracción del espacio libre
//    (Likert: distancia de la media de ítem al tope más cercano; continua:
//    la DE de un ítem), repartidas en escalera y barajadas por la semilla;
//  · cargas: dispersión de los pesos con que cada ítem participa del total
//    (1 ± cargas), es decir, cargas factoriales desiguales (modelo congenérico);
//  · cruzadas / proporcionCruzadas: carga cruzada estandarizada que reciben
//    algunos ítems (esa proporción de los de la escala) desde OTRA dimensión
//    del mismo test.
// «ninguna» reproduce el comportamiento anterior: ítems paralelos (en modo ω
// se mantiene el modelo congenérico de siempre, con dispersión 0.45).
// (B8) Estilos de respuesta: intensidad por persona (× U(0.7, 1.3)).
//  · aquiescencia: puntos que se suman a la respuesta BRUTA de cada ítem (los
//    invertidos se guardan reflejados, así que el sesgo va en la misma dirección
//    en todos y, tras recodificar, empuja en contra a los invertidos: es lo que
//    la delata en un análisis real);
//  · extrema: probabilidad de que cada respuesta salte al extremo de su lado
//    (y, si está justo en el punto medio, a un extremo cualquiera). Un factor
//    multiplicativo v' = m + s·(v − m) dejaba sin efecto las escalas de 4
//    puntos con intensidad leve o moderada; el salto probabilístico no.
const ESTILOS_RESPUESTA = {
    leve:     { aquiescencia: 0.6, extrema: 0.30 },
    moderada: { aquiescencia: 1.0, extrema: 0.50 },
    alta:     { aquiescencia: 1.5, extrema: 0.75 }
};
// (C1) Desajuste controlado de la estructura factorial: proporción de ítems del
// test emparejados con un residuo común y correlación residual de cada par.
const NIVELES_DESAJUSTE = {
    ninguno:  { proporcion: 0,    rho: 0 },
    leve:     { proporcion: 0.30, rho: 0.20 },
    moderado: { proporcion: 0.50, rho: 0.35 },
    alto:     { proporcion: 0.80, rho: 0.50 }
};
const PERFILES_HETEROGENEIDAD = {
    ninguna:  { medias: 0,   cargas: 0,   cruzadas: 0,    proporcionCruzadas: 0 },
    leve:     { medias: 0.3, cargas: 0.3, cruzadas: 0.15, proporcionCruzadas: 0.20 },
    moderada: { medias: 0.5, cargas: 0.5, cruzadas: 0.25, proporcionCruzadas: 0.25 },
    alta:     { medias: 0.7, cargas: 0.7, cruzadas: 0.35, proporcionCruzadas: 0.34 }
};

// ========================================
// REGLAS DE COHERENCIA (fuente única)
// Las usan la guía en vivo de la interfaz (guia-coherencia.js) y el respaldo
// de validación del generador. Si una regla cambia, se cambia SOLO aquí.
// ========================================
const ReglasCoherencia = {
    // Rango permitido de la Media de un puntaje que es suma de k ítems en [min, max]
    rangoMedia(k, min, max) {
        return { minimo: Math.ceil(k * min), maximo: Math.floor(k * max) };
    },

    // DE máxima sin recorte: la distribución (±3·DE) debe caber hasta el tope más cercano
    deMaxima(media, totalMin, totalMax) {
        return Math.min(media - totalMin, totalMax - media) / 3;
    },

    // DE mínima recomendada para que un total ENTERO no salga "escalonado" y pueda
    // pasar la prueba de normalidad. Calibrada empíricamente: ≈ 1.1·√N.
    deMinimaNormal(n) {
        return (Number.isFinite(n) && n >= 2) ? Math.ceil(1.1 * Math.sqrt(n)) : 0;
    }
};
if (typeof window !== 'undefined') {
    window.ReglasCoherencia = ReglasCoherencia;
}

// ============================================================================
// generador-nucleo.js — clase, constantes, generador aleatorio y primitivas numéricas (álgebra, estimadores)
// El resto de la clase se añade por módulos (ver generador-manifiesto.js).
// ============================================================================
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

        let estado = Math.trunc(semilla) >>> 0;
        this.aleatorio = function () {
            estado = (estado + 0x6D2B79F5) >>> 0;
            let t = estado;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // Valor normal estándar N(0,1) por el método de Box-Muller.
    generarNormalEstandar() {
        let u1 = this.aleatorio();
        let u2 = this.aleatorio();
        while (u1 === 0) u1 = this.aleatorio(); // Evitar log(0)
        return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    }

    // Función de error (Abramowitz & Stegun 7.1.26), error < 1.5e-7.
    erf(x) {
        const signo = x < 0 ? -1 : 1;
        x = Math.abs(x);
        const t = 1 / (1 + 0.3275911 * x);
        const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
        return signo * y;
    }

    // CDF de la normal estándar Φ(z).
    normalCDF(z) {
        return 0.5 * (1 + this.erf(z / Math.SQRT2));
    }

    // Inversa de la normal estándar Φ⁻¹(p): algoritmo de Acklam (error relativo
    // < 1.2·10⁻⁹ en todo el dominio).
    normalInversa(p) {
        if (!(p > 0 && p < 1)) return p <= 0 ? -Infinity : Infinity;
        const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
        const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
        const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
        const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
        const pBajo = 0.02425;
        if (p < pBajo) {
            const q = Math.sqrt(-2 * Math.log(p));
            return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
        }
        if (p > 1 - pBajo) {
            const q = Math.sqrt(-2 * Math.log(1 - p));
            return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
        }
        const q = p - 0.5, r = q * q;
        return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    }

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

    _lgamma(x) {
        // Lanczos (g = 7, n = 9)
        const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
        if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - this._lgamma(1 - x);
        x -= 1; let a = c[0]; const tt = x + 7.5;
        for (let i = 1; i < 9; i++) a += c[i] / (x + i);
        return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(tt) - tt + Math.log(a);
    }

    // Muestra SIN reemplazo de k índices de [0, n): Fisher–Yates parcial, O(k).
    // Sustituye a sort(() => aleatorio() − 0.5), que no baraja uniformemente:
    // con n = 200 y k = 20 la fila 1 salía elegida el 25 % de las veces y la
    // 187 el 6 % (lo esperado es 10 % para todas), así que los descuidados se
    // concentraban en los primeros ID.
    _muestraSinReemplazo(n, k) {
        const idx = new Int32Array(n);
        for (let i = 0; i < n; i++) idx[i] = i;
        const tope = Math.max(0, Math.min(k, n));
        for (let j = 0; j < tope; j++) {
            const r = j + Math.floor(this.aleatorio() * (n - j));
            const t = idx[j]; idx[j] = idx[r]; idx[r] = t;
        }
        return idx.subarray(0, tope);
    }

    // ============ INFORME PEDIDO vs OBTENIDO ============
    // Cierra el ciclo «lo que se pide es lo que se entrega»: mide en la base
    // generada cada parámetro solicitado y lo pone al lado del valor real.
    _corr(x, y) {
        const n = x.length; let mx = 0, my = 0;
        for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
        mx /= n; my /= n;
        let sxy = 0, sxx = 0, syy = 0;
        for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
        return (sxx > 0 && syy > 0) ? sxy / Math.sqrt(sxx * syy) : NaN;
    }

    // Matriz de correlaciones de columnas (arreglos de igual longitud)
    _matrizCorrelacion(cols) {
        const k = cols.length, n = cols[0].length;
        const medias = cols.map(c => c.reduce((s, v) => s + v, 0) / n);
        const des = cols.map((c, j) => Math.sqrt(c.reduce((s, v) => s + (v - medias[j]) ** 2, 0) / (n - 1)) || 1e-9);
        const R = Array.from({ length: k }, () => new Array(k).fill(1));
        for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) {
            let s = 0; for (let i = 0; i < n; i++) s += (cols[a][i] - medias[a]) * (cols[b][i] - medias[b]);
            R[a][b] = R[b][a] = (s / (n - 1)) / (des[a] * des[b]);
        }
        return R;
    }

    // ========================================
    // CORRELACIONES OBJETIVO (CHOLESKY)
    // ========================================
    // Descomposición de Cholesky (L·Lᵀ = A) de una matriz simétrica. Si la
    // matriz no es definida positiva (correlaciones inconsistentes), los
    // elementos diagonales se acotan a un mínimo para no producir NaN.
    descomposicionCholesky(A) {
        const n = A.length;
        const L = Array.from({ length: n }, () => new Array(n).fill(0));
        let noDefinidaPositiva = false;

        for (let i = 0; i < n; i++) {
            for (let j = 0; j <= i; j++) {
                let suma = 0;
                for (let k = 0; k < j; k++) suma += L[i][k] * L[j][k];

                if (i === j) {
                    const d = A[i][i] - suma;
                    if (d <= 0) noDefinidaPositiva = true;
                    if (d < 1e-9) this.matrizForzada = true;   // pedido imposible: se fuerza
                    L[i][j] = Math.sqrt(Math.max(d, 1e-9));
                } else {
                    L[i][j] = (A[i][j] - suma) / (L[j][j] || 1e-9);
                }
            }
        }

        this.matrizNoDefinidaPositiva = noDefinidaPositiva;
        return L;
    }

    _inversaTriangularInferior(S) {
        const m = S.length;
        const inv = Array.from({ length: m }, () => new Array(m).fill(0));
        for (let i = 0; i < m; i++) {
            inv[i][i] = 1 / (S[i][i] || 1e-9);
            for (let j = 0; j < i; j++) {
                let s = 0;
                for (let k = j; k < i; k++) s += S[i][k] * inv[k][j];
                inv[i][j] = -s / (S[i][i] || 1e-9);
            }
        }
        return inv;
    }

    _esDefinidaPositiva(R) {
        const n = R.length, L = Array.from({ length: n }, () => new Array(n).fill(0));
        for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
            let s = 0;
            for (let k = 0; k < j; k++) s += L[i][k] * L[j][k];
            if (i === j) { const d = R[i][i] - s; if (d <= 1e-10) return false; L[i][i] = Math.sqrt(d); }
            else L[i][j] = (R[i][j] - s) / L[j][j];
        }
        return true;
    }

    // Autovalores/autovectores de una matriz simétrica (Jacobi cíclico).
    _jacobi(A) {
        const n = A.length, M = A.map(f => f.slice()), V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
        for (let sweep = 0; sweep < 60; sweep++) {
            let off = 0;
            for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += M[p][q] * M[p][q];
            if (off < 1e-14) break;
            for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
                if (Math.abs(M[p][q]) < 1e-14) continue;
                const theta = (M[q][q] - M[p][p]) / (2 * M[p][q]);
                const tt = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
                const c = 1 / Math.sqrt(tt * tt + 1), s = tt * c;
                for (let k = 0; k < n; k++) { const mkp = M[k][p], mkq = M[k][q]; M[k][p] = c * mkp - s * mkq; M[k][q] = s * mkp + c * mkq; }
                for (let k = 0; k < n; k++) { const mpk = M[p][k], mqk = M[q][k]; M[p][k] = c * mpk - s * mqk; M[q][k] = s * mpk + c * mqk; }
                for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
            }
        }
        return { valores: M.map((f, i) => f[i]), vectores: V };
    }

    _matrizValidaMasCercana(R) {
        const n = R.length, { valores, vectores } = this._jacobi(R);
        const piso = 1e-3;
        const S = Array.from({ length: n }, () => new Array(n).fill(0));
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
            let s = 0;
            for (let k = 0; k < n; k++) s += vectores[i][k] * Math.max(valores[k], piso) * vectores[j][k];
            S[i][j] = s;
        }
        const d = S.map((f, i) => Math.sqrt(f[i]));
        return S.map((f, i) => f.map((x, j) => (i === j ? 1 : x / (d[i] * d[j]))));
    }

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

    // Coeficientes de regresión de y sobre los predictores, con y estandarizada
    // y (si estandarizarX) cada predictor estandarizado; si no, los predictores
    // entran tal cual (para el producto z_X·z_W). Mínimos cuadrados por
    // eliminación gaussiana (p pequeño). null si el sistema es singular.
    _betasEstandarizadas(y, predictores, estandarizarX = true) {
        const n = y.length, p = predictores.length;
        if (n < p + 3) return null;
        const est = arr => { const mu = arr.reduce((s, v) => s + v, 0) / n; const sd = Math.sqrt(arr.reduce((s, v) => s + (v - mu) ** 2, 0) / n); return sd > 0 ? arr.map(v => (v - mu) / sd) : null; };
        const yz = est(y);
        if (!yz) return null;
        const Xs = [];
        for (let j = 0; j < p; j++) {
            const c = estandarizarX ? est(predictores[j]) : (() => { const mu = predictores[j].reduce((s, v) => s + v, 0) / n; return predictores[j].map(v => v - mu); })();
            if (!c) return null;
            Xs.push(c);
        }
        // Ecuaciones normales A·β = g (todo centrado: sin intercepto)
        const A = Array.from({ length: p }, () => new Array(p + 1).fill(0));
        for (let j = 0; j < p; j++) {
            for (let k = j; k < p; k++) { let s = 0; for (let i = 0; i < n; i++) s += Xs[j][i] * Xs[k][i]; A[j][k] = s / n; A[k][j] = s / n; }
            let s = 0; for (let i = 0; i < n; i++) s += Xs[j][i] * yz[i]; A[j][p] = s / n;
        }
        for (let col = 0; col < p; col++) {
            let piv = col;
            for (let r = col + 1; r < p; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
            if (Math.abs(A[piv][col]) < 1e-12) return null;
            if (piv !== col) { const t = A[piv]; A[piv] = A[col]; A[col] = t; }
            for (let r = 0; r < p; r++) {
                if (r === col) continue;
                const f = A[r][col] / A[col][col];
                for (let c = col; c <= p; c++) A[r][c] -= f * A[col][c];
            }
        }
        return A.map((f, j) => f[p] / f[j]);
    }

    // Residualiza `col` contra las columnas X (con intercepto) por mínimos
    // cuadrados; sin efectos secundarios. Devuelve un Float64Array nuevo.
    _residualizarColumna(col, columnasX) {
        const n = col.length, q = columnasX.length + 1;
        const x = j => (j === 0 ? null : columnasX[j - 1]);
        const G = Array.from({ length: q }, () => new Array(q).fill(0)), g = new Array(q).fill(0);
        for (let a = 0; a < q; a++) {
            const ca = x(a);
            for (let b = a; b < q; b++) { const cb = x(b); let s = 0; for (let i = 0; i < n; i++) s += (ca ? ca[i] : 1) * (cb ? cb[i] : 1); G[a][b] = G[b][a] = s; }
            let s = 0; for (let i = 0; i < n; i++) s += (ca ? ca[i] : 1) * col[i]; g[a] = s;
        }
        const L = this.descomposicionCholesky(G), Linv = this._inversaTriangularInferior(L);
        const beta = new Array(q).fill(0);
        for (let a = 0; a < q; a++) { let s = 0; for (let k = 0; k < q; k++) { let gik = 0; for (let r = 0; r < q; r++) gik += Linv[r][a] * Linv[r][k]; s += gik * g[k]; } beta[a] = s; }
        const out = new Float64Array(n);
        for (let i = 0; i < n; i++) { let s = beta[0]; for (let a = 1; a < q; a++) s += columnasX[a - 1][i] * beta[a]; out[i] = col[i] - s; }
        return out;
    }

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

    // GLM por mínimos cuadrados reponderados (logit o log), con intercepto.
    // X: columnas de predictores (arreglos). Devuelve { beta, ee } o null.
    _glm(y, X, familia) {
        const n = y.length, p = X.length + 1;
        let beta = new Array(p).fill(0);
        if (familia === 'logit') { const m = y.reduce((s, v) => s + v, 0) / n; beta[0] = Math.log(Math.max(1e-6, m) / Math.max(1e-6, 1 - m)); }
        else { const m = y.reduce((s, v) => s + v, 0) / n; beta[0] = Math.log(Math.max(1e-6, m)); }
        const fila = i => { const x = new Array(p); x[0] = 1; for (let j = 1; j < p; j++) x[j] = X[j - 1][i]; return x; };
        let info = null;
        for (let it = 0; it < 30; it++) {
            const A = Array.from({ length: p }, () => new Array(p + 1).fill(0));
            for (let i = 0; i < n; i++) {
                const x = fila(i); let eta = 0; for (let j = 0; j < p; j++) eta += beta[j] * x[j];
                let mu, w;
                if (familia === 'logit') { mu = 1 / (1 + Math.exp(-eta)); w = mu * (1 - mu); }
                else { mu = Math.exp(Math.min(30, eta)); w = mu; }
                if (!(w > 1e-9)) continue;
                const z = eta + (y[i] - mu) / w;
                for (let a = 0; a < p; a++) { for (let b = 0; b < p; b++) A[a][b] += w * x[a] * x[b]; A[a][p] += w * x[a] * z; }
            }
            info = A.map(f => f.slice(0, p));
            for (let c = 0; c < p; c++) {
                let piv = c; for (let r = c + 1; r < p; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
                if (Math.abs(A[piv][c]) < 1e-12) return null;
                if (piv !== c) { const tmp = A[piv]; A[piv] = A[c]; A[c] = tmp; }
                for (let r = 0; r < p; r++) { if (r === c) continue; const f = A[r][c] / A[c][c]; for (let k = c; k <= p; k++) A[r][k] -= f * A[c][k]; }
            }
            const nuevo = A.map((f, j) => f[p] / f[j]);
            const cambio = Math.max(...nuevo.map((b, j) => Math.abs(b - beta[j])));
            beta = nuevo;
            if (cambio < 1e-7) break;
        }
        // errores estándar: diagonal de la inversa de la información
        let ee = new Array(p).fill(NaN);
        try {
            const L = this.descomposicionCholesky(info.map(f => f.slice()));
            const Linv = this._inversaTriangularInferior(L);
            ee = Array.from({ length: p }, (_, j) => { let s = 0; for (let r = 0; r < p; r++) s += Linv[r][j] * Linv[r][j]; return Math.sqrt(s); });
        } catch (e) { /* singular: sin EE */ }
        return { beta, ee };
    }

    // Un factor por ejes principales iterados sobre una matriz de correlaciones
    // (misma rutina que usa el ω): devuelve las cargas estandarizadas o null.
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
            const Linv = this._inversaTriangularInferior(L);
            const inv = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => { let s = 0; for (let r = 0; r < k; r++) s += Linv[r][i] * Linv[r][j]; return s; }));
            let sumR2 = 0, sumP2 = 0, logDet = 0;
            for (let i = 0; i < k; i++) { logDet += 2 * Math.log(L[i][i]); for (let j = 0; j < k; j++) { if (i === j) continue; sumR2 += R[i][j] * R[i][j]; const pij = -inv[i][j] / Math.sqrt(inv[i][i] * inv[j][j]); sumP2 += pij * pij; } }
            const kmo = sumR2 / (sumR2 + sumP2);
            const chi2 = -(n - 1 - (2 * k + 5) / 6) * logDet;
            const gl = k * (k - 1) / 2;
            return { kmo, chi2, gl, significativo: chi2 > gl + 4 * Math.sqrt(2 * gl) };   // aprox. p < 0.001 con gl grande
        } catch (e) { return null; }
    }

    // V de Cramér entre dos columnas de códigos (casos completos)
    _cramerV(a, b) {
        const tabla = new Map(); const filas = new Set(), cols = new Set(); let n = 0;
        for (let i = 0; i < a.length; i++) { if (!(a[i] === a[i]) || !(b[i] === b[i])) continue; const k = `${a[i]}|${b[i]}`; tabla.set(k, (tabla.get(k) || 0) + 1); filas.add(a[i]); cols.add(b[i]); n++; }
        if (n === 0 || filas.size < 2 || cols.size < 2) return 0;
        const mf = new Map(), mc = new Map();
        tabla.forEach((v, k) => { const [f, c] = k.split('|'); mf.set(f, (mf.get(f) || 0) + v); mc.set(c, (mc.get(c) || 0) + v); });
        let chi2 = 0;
        mf.forEach((nf, f) => mc.forEach((nc, c) => { const e = nf * nc / n; const o = tabla.get(`${f}|${c}`) || 0; chi2 += (o - e) * (o - e) / e; }));
        return Math.sqrt(chi2 / n / Math.min(filas.size - 1, cols.size - 1));
    }

    // (C4) CCI(1) por ANOVA de un factor: (MSB − MSW) / (MSB + (n₀ − 1)·MSW)
    _iccAnova(valores, codigos) {
        const grupos = new Map();
        for (let i = 0; i < valores.length; i++) { const v = valores[i]; if (!(v === v)) continue; if (!grupos.has(codigos[i])) grupos.set(codigos[i], []); grupos.get(codigos[i]).push(v); }
        const K = grupos.size; if (K < 2) return null;
        let N = 0, sumaTotal = 0; grupos.forEach(g => { N += g.length; g.forEach(v => { sumaTotal += v; }); });
        const mediaG = sumaTotal / N;
        let ssb = 0, ssw = 0, sumN2 = 0;
        grupos.forEach(g => { const m = g.reduce((s, v) => s + v, 0) / g.length; ssb += g.length * (m - mediaG) ** 2; g.forEach(v => { ssw += (v - m) ** 2; }); sumN2 += g.length * g.length; });
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
        porGrupo.forEach(vals => { const mg = vals.reduce((a, b) => a + b, 0) / vals.length; vals.forEach(v => { ssIntra += (v - mg) ** 2; }); gl += vals.length - 1; });
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
        const media = c => c.reduce((s, v) => s + v, 0) / c.length;
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
if (typeof window !== 'undefined') window.GeneradorDatos = GeneradorDatos;
