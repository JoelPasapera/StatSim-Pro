// @ts-check
// core/stats/mlg.js — EL motor de los modelos lineales generalizados del programa (2026.12.22): la regresión logística
// (binomial con enlace logit) y la de Poisson (enlace log), con constante, por mínimos cuadrados iterativamente
// reponderados (IRLS, el algoritmo de glm de R): cada paso es un ajuste ponderado por la QR de core/stats/mco.js. Con
// enlaces canónicos, IRLS da los mismos pasos que el método de Newton, de modo que la estimación es la de siempre; lo que
// cambia es cómo se resuelve cada paso (sin invertir la matriz de información) y que el criterio de colinealidad es el de
// los mínimos cuadrados. (2026.12.23) Si un paso empeora la devianza se reduce a la mitad (como glm2; glm de R solo lo hace
// si la devianza se desborda), si el primero empeora la del modelo nulo el ajuste parte de este, y si la estimación no es
// finita (una separación) lo decide la prueba exacta de core/stats/separacion.js, no el comportamiento del ajuste: la
// 2026.12.22 lo deducía de él y rechazaba estimaciones finitas (un caso influyente cuya respuesta contradice un ajustado de
// 10⁻¹² frena la convergencia sin que haya separación). Hasta la 2026.12.21 había cuatro copias: tres en
// analizador/regresion.js, la logística simple (Newton con la inversa 2 × 2 en forma cerrada, que si no convergía en 60
// iteraciones devolvía la última sin avisar), la múltiple y Poisson (Newton con la información invertida por Gauss-Jordan
// y un pivote mínimo absoluto de 10⁻¹²), y el IRLS del informe de verificación del Simulador
// (simulador/dominio/generador.js, _glm: el OR y la IRR obtenidos en la base; no interviene en la generación, de modo que
// las bases de una semilla no cambian).
import { ajustarMco } from './mco.js';
import { colaSuperiorNormal, cuantilNormal } from './normal.js';
import { lnGamma } from './especiales.js';
import { desviacion } from './descriptivos.js';
import { hayEstimacionFinita } from './separacion.js';

/** @typedef {'logistica' | 'poisson'} FamiliaMlg */

/**
 * El resultado de un ajuste: los coeficientes en la escala del predictor lineal (b, su error típico de Wald, z, p bilateral
 * e IC de Wald, que la vista exponencia en OR o razones de tasas), la log-verosimilitud del modelo y la del modelo nulo
 * (solo la constante), las devianzas, el AIC, el pseudo-R² de McFadden, la dispersión de Pearson (χ²/(n − p)) y los
 * valores ajustados en la escala de la respuesta (probabilidades o tasas).
 * @typedef {{ familia: FamiliaMlg, n: number, k: number, beta: Float64Array, ee: Float64Array, z: Float64Array,
 *   pValores: Float64Array, ic: Array<[number, number]>, logVerosimilitud: number, logVerosimilitudNula: number,
 *   devianza: number, devianzaNula: number, aic: number, mcFadden: number, dispersion: number, iteraciones: number,
 *   ajustados: Float64Array, avisos: string[] }} ResultadoMlg
 */

/**
 * Los avisos de glm de R: «fitted probabilities numerically 0 or 1 occurred» (en la logística R recorta el predictor lineal
 * en |η| = 30, de modo que avisa desde ahí) y «fitted rates numerically 0 occurred» (una tasa menor que 10 veces el
 * épsilon de la máquina, 2,2·10⁻¹⁵).
 */
const ETA_AVISO_LOGIT = 30, EPS_AJUSTADO = 10 * Number.EPSILON;

/**
 * Un ajustado a menos de 10⁻¹⁰ del borde (|η| > 23 en la logística; una tasa menor en Poisson) en alguna iteración: solo
 * decide el mensaje de un ajuste que falla cuando la prueba exacta de la separación no puede decidir.
 */
const BORDE_SEPARACION = 1e-10;

/** La convergencia: el cambio relativo de los coeficientes (≤ 10⁻¹⁰); o, con la devianza plana (≤ 10⁻¹³ relativo, más su
 * error de redondeo), un cambio de 10⁻¹⁰ errores típicos (un coeficiente casi sin información); o, si el redondeo no deja
 * llegar ahí, tres iteraciones seguidas con la devianza plana y un cambio ≤ 10⁻⁴ (en miles de bases, el redondeo dejó
 * cambios de 10⁻¹⁰ a 10⁻⁵, y una separación o un caso que se satura, de 10⁻² o más).
 * Una devianza plana no basta: con una separación los coeficientes siguen creciendo (un 1 % o más por iteración) y el
 * ajuste llega al máximo de iteraciones (la separación la decide la prueba exacta), y una estimación finita que solo se
 * alcanza cuando un caso extremo se satura (un código de perdido de 10¹⁴ con su respuesta) avanza con la devianza casi
 * plana: parar ahí daba una pendiente de 10⁻¹³ en lugar de 0,19. */
const TOL_COEFICIENTES = 1e-10, TOL_PLANA = 1e-4, TOL_DEVIANZA = 1e-13, ITERACIONES_PLANAS = 3;

/**
 * ln(1 + eˣ), sin desbordes ni pérdida de precisión.
 * @param {number} x
 * @returns {number}
 */
function softplus(x) { return x > 0 ? x + Math.log1p(Math.exp(-x)) : Math.log1p(Math.exp(x)); }

/**
 * Ajuste de un modelo lineal generalizado con constante por IRLS.
 * @param {ArrayLike<number>} y la dependiente: 0 y 1 (logística) o conteos enteros ≥ 0 (Poisson)
 * @param {ArrayLike<number>[]} columnas los k predictores (la constante la añade la función)
 * @param {{ familia: FamiliaMlg, nivel?: number, maxIteraciones?: number }} opciones nivel del IC de Wald (0.95)
 * @returns {ResultadoMlg | { error: string }}
 */
export function ajustarMlg(y, columnas, { familia, nivel = 0.95, maxIteraciones = 100 }) {
    const n = y.length, k = columnas.length, p = k + 1, logistica = familia === 'logistica';
    if (familia !== 'logistica' && familia !== 'poisson') throw new Error(`Familia desconocida: «${familia}» (se esperaba 'logistica' o 'poisson').`);
    if (columnas.some(c => c.length !== n)) throw new Error('Los predictores deben tener tantos valores como la dependiente.');
    if (n <= p) return { error: `Casos insuficientes (${n}) para ${k} predictores.` };
    for (const c of columnas) for (let i = 0; i < n; i++) if (!Number.isFinite(c[i])) return { error: 'Los predictores tienen valores perdidos o no numéricos (se esperan casos completos).' };
    let suma = 0;
    for (let i = 0; i < n; i++) {
        const v = /** @type {number} */ (y[i]);
        if (logistica ? !(v === 0 || v === 1) : !(Number.isInteger(v) && v >= 0)) {
            return { error: logistica ? 'La logística requiere una dependiente con los valores 0 y 1.' : 'Poisson requiere una variable dependiente de conteo (enteros ≥ 0).' };
        }
        suma += v;
    }
    if (suma === 0 || (logistica && suma === n)) return { error: 'La variable dependiente no varía (todos sus valores son iguales): no hay nada que explicar.' };
    const inversa = logistica ? (/** @type {number} */ eta) => 1 / (1 + Math.exp(-eta)) : (/** @type {number} */ eta) => Math.exp(Math.min(eta, 700));
    const derivada = logistica ? (/** @type {number} */ mu) => mu * (1 - mu) : (/** @type {number} */ mu) => mu;   // dμ/dη = V(μ): los pesos de IRLS
    // la devianza de un predictor lineal y una cota de su error de redondeo, para no tomar el redondeo por un cambio del
    // ajuste. Sus términos son ≥ 0 y se suman con la suma compensada de Neumaier (el error no crece con n). Logística,
    // ln(1 + e^(∓η)), con pocos ε de error relativo. Poisson, y·ln(y/μ) − (y − μ), escrito y·(eʳ − 1 − r) con r = η − ln y
    // (μ = y·eʳ) para no restar cantidades del orden de y·ln y; aun así, el redondeo de ln y por la sensibilidad μ − y del
    // término deja un error de ε·|μ − y|·|ln y|: con conteos de 10⁵ mal ajustados, 10⁻¹¹, más que lo que cambia la
    // devianza cerca de la convergencia (sin la cota, el ajuste creía que ningún paso la mejoraba)
    const devianza = (/** @type {Float64Array} */ e) => {
        let s = 0, comp = 0, cota = 0;
        for (let i = 0; i < n; i++) {
            const v = /** @type {number} */ (y[i]), ei = /** @type {number} */ (e[i]);
            let t;
            if (logistica) t = softplus(v === 1 ? -ei : ei);
            else if (v > 0) {
                const lv = Math.log(v), r = Math.min(ei, 700) - lv, em = Math.expm1(r);
                t = v * (em - r);
                cota += v * Math.abs(em) * (Math.abs(lv) + Math.abs(r) + 2);
            } else t = Math.exp(Math.min(ei, 700));
            const nuevo = s + t;
            comp += Math.abs(s) >= Math.abs(t) ? (s - nuevo) + t : (t - nuevo) + s;
            s = nuevo;
        }
        const valor = 2 * (s + comp);
        return { valor, ruido: Number.EPSILON * (2 * cota + 4 * valor) };
    };
    // el inicio de glm: μ = (y + ½)/2 en la logística, y + 0,1 en Poisson
    const mu = new Float64Array(n);
    /** @type {Float64Array} */ let eta = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const v = /** @type {number} */ (y[i]), m = logistica ? (v + 0.5) / 2 : v + 0.1;
        mu[i] = m; eta[i] = logistica ? Math.log(m / (1 - m)) : Math.log(m);
    }
    /** @type {Float64Array | null} */ let beta = null;
    // el cambio de cada coeficiente, relativo a su tamaño o a su unidad natural si es menor (1 en la constante; en una
    // pendiente, 1/DE del predictor: un logit, o un logaritmo de la tasa, por desviación típica), para que el criterio no
    // dependa de las unidades. (2026.12.23) La DE, no una escala robusta: con un código de perdido de 10¹⁴ cuya respuesta
    // confirma la tendencia, el ajuste avanza durante unas 35 iteraciones con pasos de 10⁻¹⁴ en la pendiente (el caso se
    // satura un logit por iteración) antes de saltar a la estimación, y solo la DE, que el código multiplica, mide esos
    // pasos como lo que son, un 3 % de la pendiente; con una escala robusta el ajuste se daba por convergido a mitad
    const unidad = [1, ...columnas.map(c => { const d = desviacion(c); return d > 0 ? 1 / d : Infinity; })];
    // los pesos y la respuesta de trabajo en el η actual, con los recortes de glm de R: en la logística, μ y dμ/dη se
    // detienen en |η| = 30 (dμ/dη ≥ ε); en Poisson, μ ≥ ε. Sin ellos, un caso cuya respuesta contradice un ajustado de 10⁻³⁵
    // (un conteo de 3 donde la tasa ajustada es e⁻⁸⁰) daba una respuesta de trabajo de 10³⁵ y los mínimos cuadrados perdían
    // toda precisión; con ellos, el paso es el mismo salvo en esos casos, cuya contribución a la estimación es despreciable.
    // El recorte solo sirve para que la respuesta de trabajo no se desborde: un caso recortado que su respuesta confirma
    // (y = 1 con η > 30, y = 0 con η < −30, y = 0 con μ < ε) lleva su peso exacto, μ(1 − μ) o μ, ≈ 0. Con el de R, ε, aportaba
    // a la ecuación de la estimación un residuo falso, ε·x, y a la información ε·x²: con un predictor de 10⁸ o 10⁹ (un
    // código de perdido no declarado) la estimación se desplazaba (10⁻⁷ relativo) o el ajuste no convergía. Con exactos =
    // true (la información de la estimación final, de la que salen los errores típicos), todos los casos recortados llevan
    // el peso exacto: con el de R, ese mismo código con su probabilidad ajustada numéricamente 1 daba errores típicos un
    // 3 % menores; SPSS, como aquí, usa los exactos
    const pasoIrls = (exactos = false) => {
        const w = new Float64Array(n), z = new Float64Array(n), E = Number.EPSILON;
        for (let i = 0; i < n; i++) {
            const e = /** @type {number} */ (eta[i]), v = /** @type {number} */ (y[i]);
            if (logistica) {
                const recorte = e > 30 || e < -30, m = e > 30 ? 1 / (1 + E) : e < -30 ? E / (1 + E) : 1 / (1 + Math.exp(-e)), d = recorte ? E : m * (1 - m);
                const a = Math.exp(-Math.abs(e)), confirma = (e > 30 && v === 1) || (e < -30 && v === 0);
                w[i] = recorte && (exactos || confirma) ? a / ((1 + a) * (1 + a)) : d * d / (m * (1 - m)); z[i] = e + (v - m) / d;
            } else {
                const mu = Math.exp(Math.min(e, 700)), m = Math.max(mu, E);
                w[i] = exactos || v === 0 ? mu : m; z[i] = e + (v - m) / m;
            }
        }
        return ajustarMco(z, columnas, { pesos: w });
    };
    const enBorde = logistica ? (/** @type {number} */ m) => m < BORDE_SEPARACION || m > 1 - BORDE_SEPARACION : (/** @type {number} */ m) => m < BORDE_SEPARACION;
    // el modelo nulo (solo la constante) y su devianza: si el primer paso, desde el inicio de glm, la empeora, el ajuste
    // parte de él (ver más abajo)
    const media = suma / n, bNulo = new Float64Array(p);
    bNulo[0] = logistica ? Math.log(media / (1 - media)) : Math.log(media);
    const etaNulo = new Float64Array(n).fill(/** @type {number} */ (bNulo[0])), devNulo = devianza(etaNulo);
    let { valor: dev, ruido: ruidoDev } = devNulo, bordeVisto = false, planas = 0, iteraciones = 0;
    /** @type {'converge' | 'plana' | 'singular' | 'estancado' | 'max'} */ let estado = 'max';
    while (iteraciones < maxIteraciones) {
        iteraciones++;
        const f = pasoIrls();
        if (!f) { estado = 'singular'; break; }
        let bN = f.beta, eN = f.ajustados, D = devianza(eN);
        // un paso no empeora la devianza (un aumento del orden del redondeo de las dos devianzas se acepta)
        const tolerable = (/** @type {{ valor: number, ruido: number }} */ d) => Number.isFinite(d.valor + d.ruido) && d.valor <= dev + 1e-12 * (dev + 0.1) + ruidoDev + d.ruido;
        if (beta) {
            // si el paso empeora la devianza (o la desborda), se reduce a la mitad (glm de R solo lo hace si la desborda;
            // glm2, también si la empeora)
            let mitades = 0;
            while (!tolerable(D) && mitades < 30) {
                const bAnt = beta, eAnt = eta;
                bN = Float64Array.from(bN, (b, j) => (b + /** @type {number} */ (bAnt[j])) / 2);
                eN = Float64Array.from(eN, (e, i) => (e + /** @type {number} */ (eAnt[i])) / 2);
                D = devianza(eN); mitades++;
            }
            if (!tolerable(D)) { estado = 'estancado'; break; }
        } else if (!tolerable(D)) {
            // (2026.12.23) el primer paso empeora el modelo nulo: un caso de palanca con un conteo 0 (un código de perdido
            // de 999 en un predictor con efecto) recibe el predictor lineal que el paso extrapola de los demás, de 10² o
            // más; su tasa, de 10⁶⁰, y su peso, de 10⁶⁰, dejaban a los demás casos por debajo del redondeo de los mínimos
            // cuadrados (con R, «no valid set of coefficients» o la falta de convergencia). Se descarta y el ajuste parte del
            // modelo nulo: desde ahí la devianza no aumenta, y con ella ninguna tasa ni ningún peso crece sin límite
            bN = bNulo; eN = etaNulo; D = devNulo;
        }
        // el cambio de los coeficientes en sus unidades (cambio) y frente a su error típico en el paso (cambioEE)
        let cambio = 0, cambioEE = 0;
        for (let j = 0; j < p; j++) {
            const b = /** @type {number} */ (bN[j]);
            if (!beta) continue;
            const d = Math.abs(b - /** @type {number} */ (beta[j])), ee = Math.sqrt(/** @type {number} */ (f.diagInversa[j]));
            cambio = Math.max(cambio, d / Math.max(/** @type {number} */ (unidad[j]), Math.abs(b)));
            cambioEE = Math.max(cambioEE, ee > 0 ? d / ee : Infinity);
        }
        const devPlana = Math.abs(dev - D.valor) <= TOL_DEVIANZA * (D.valor + 0.1) + ruidoDev + D.ruido;
        beta = bN; eta = eN; dev = D.valor; ruidoDev = D.ruido;
        for (let i = 0; i < n; i++) mu[i] = inversa(/** @type {number} */ (eta[i]));
        if (!bordeVisto) bordeVisto = mu.some(enBorde);
        if (iteraciones > 1 && cambio <= TOL_COEFICIENTES) { estado = 'converge'; break; }
        // un coeficiente casi sin información (los casos que lo determinan, saturados: un error típico de 10²⁰ o más) avanza
        // un logit por iteración sin que la devianza cambie en doble precisión; con un cambio despreciable frente a su error
        // típico, la estimación es esa (glm de R la da con su aviso; antes, el ajuste agotaba las iteraciones)
        if (iteraciones > 1 && devPlana && cambioEE <= TOL_COEFICIENTES) { estado = 'plana'; break; }
        planas = iteraciones > 1 && devPlana && cambio <= TOL_PLANA ? planas + 1 : 0;
        if (planas >= ITERACIONES_PLANAS) { estado = 'plana'; break; }
    }
    // sin estimación finita: lo decide la prueba exacta (true: finita; false: separación; null: no se pudo decidir)
    const separacion = logistica
        ? 'Separación perfecta o casi perfecta: algún predictor (o una combinación) separa los dos valores de la dependiente, y la logística no tiene una estimación finita (los coeficientes crecen sin límite). Revisa el predictor o agrupa sus valores.'
        : 'Separación en Poisson: en una parte de los datos todos los conteos son 0 y algún predictor (o una combinación) la separa, de modo que no hay una estimación finita (los coeficientes tienden a −∞). Revisa el predictor o agrupa sus valores.';
    const modelo = logistica ? 'La logística' : 'Poisson';
    const casiColineales = `Predictores casi colineales: con los pesos del ajuste, algún predictor es casi una combinación lineal de los demás y ${logistica ? 'la logística' : 'Poisson'} no puede estimarse de forma estable. Revisa los predictores muy correlacionados.`;
    if (estado === 'singular' && iteraciones === 1) return { error: 'Predictores perfectamente colineales.' };
    if (estado !== 'converge' && estado !== 'plana') {
        const finita = hayEstimacionFinita(y, columnas, familia);
        if (finita === false || (finita === null && bordeVisto)) return { error: separacion };
        return { error: estado === 'max' ? `${modelo} no convergió en ${maxIteraciones} ${maxIteraciones === 1 ? 'iteración' : 'iteraciones'}.`
            : estado === 'estancado' ? `${modelo} no convergió: ningún paso mejora el ajuste (dificultades numéricas, por predictores muy correlacionados o con valores extremos).`
            : casiColineales };
    }
    if (!beta) return { error: casiColineales };
    // la covarianza de Wald con la información en la estimación final: (X'WX)⁻¹ con los pesos exactos del μ ajustado
    const final = pasoIrls(true);
    const avisos = [];
    // log-verosimilitudes (sin desbordes: logística, Σ yη − ln(1 + eη); Poisson, Σ yη − eη − ln y!), devianzas y dispersión
    let ll = 0, ll0 = 0, chi2 = 0, extremos = 0;   // extremos: ajustados numéricamente en el borde (los avisos de R)
    for (let i = 0; i < n; i++) {
        const v = /** @type {number} */ (y[i]), e = /** @type {number} */ (eta[i]), m = /** @type {number} */ (mu[i]);
        if (logistica) {
            ll += v * e - softplus(e); ll0 += v * Math.log(media) + (1 - v) * Math.log(1 - media);
            if (Math.abs(e) > ETA_AVISO_LOGIT) extremos++;
        } else {
            const lnFact = lnGamma(v + 1);
            ll += v * e - m - lnFact; ll0 += v * Math.log(media) - media - lnFact;
            if (m < EPS_AJUSTADO) extremos++;
        }
        chi2 += (v - m) ** 2 / Math.max(derivada(m), 1e-300);
    }
    // con ajustados en el borde, una parada por la devianza o una información singular, la prueba exacta descarta la
    // separación (con ella el ajuste se detiene donde los pesos de los casos separados se anulan, con coeficientes enormes)
    if (extremos || estado === 'plana' || !final) {
        const finita = hayEstimacionFinita(y, columnas, familia);
        if (finita === false || (finita === null && !final && bordeVisto)) return { error: separacion };
    }
    if (!final) return { error: `${modelo}: la información del ajuste es casi singular (hay casos con ajustados numéricamente en el borde) y los errores típicos no pueden calcularse de forma estable.` };
    if (extremos) avisos.push(logistica
        ? `${extremos} ${extremos === 1 ? 'probabilidad ajustada es' : 'probabilidades ajustadas son'} numéricamente 0 o 1 (por un valor extremo de algún predictor o por una separación casi completa en una parte de los datos): los errores típicos de Wald pueden no ser fiables.`
        : `${extremos} ${extremos === 1 ? 'tasa ajustada es' : 'tasas ajustadas son'} numéricamente 0 (por un valor extremo de algún predictor o porque en una parte de los datos casi todos los conteos son 0): los errores típicos de Wald pueden no ser fiables.`);
    const zc = cuantilNormal(1 - (1 - nivel) / 2);
    const ee = Float64Array.from(final.diagInversa, d => Math.sqrt(d)), z = Float64Array.from(beta, (b, j) => b / /** @type {number} */ (ee[j]));
    // las devianzas de Poisson, término a término con la forma estable, como glm de R (como 2·(ℓ saturada − ℓ) restaban
    // cantidades del orden de y·ln y: con conteos de 10⁵, un error de 10⁻⁹ relativo)
    return {
        familia, n, k, beta, ee, z, pValores: Float64Array.from(z, v => Math.min(1, 2 * colaSuperiorNormal(Math.abs(v)))),
        ic: Array.from(beta, (b, j) => /** @type {[number, number]} */ ([b - zc * /** @type {number} */ (ee[j]), b + zc * /** @type {number} */ (ee[j])])),
        logVerosimilitud: ll, logVerosimilitudNula: ll0,
        devianza: logistica ? -2 * ll : devianza(eta).valor, devianzaNula: logistica ? -2 * ll0 : devNulo.valor,
        aic: -2 * ll + 2 * p, mcFadden: 1 - ll / ll0, dispersion: chi2 / (n - p), iteraciones, ajustados: mu, avisos
    };
}
