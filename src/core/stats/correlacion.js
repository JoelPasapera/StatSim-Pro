// @ts-check
// core/stats/correlacion.js — r de Pearson y ρ de Spearman, sus pares completos y su inferencia: el p del contraste, el
// intervalo por la z de Fisher y la potencia, y la matriz de correlaciones. (2026.12.12) Antes, Pearson en diez sitios
// (y, hasta la 2026.12.25, la matriz en cinco más, con otras tres aritméticas). (2026.12.17) La inferencia
// estaba repetida en siete módulos con convenciones distintas: el valor crítico del intervalo (1,96, 1,959964 o el exacto),
// el error típico de ρ (Bonett y Wright en la vista principal; Fieller, Hartley y Pearson en el diagnóstico de forma; el de
// Pearson en el mapa de correlaciones), el p (la t de Student en todas partes salvo el respaldo del Word, con la normal) y
// la potencia (bilateral siempre en pantalla aunque la prueba fuera unilateral; en el Word, con la lateralidad, pero
// contando en la unilateral también la cola contraria; en los dos, la aproximación de Fisher simple, que la subestimaba).
// Aquí, una sola convención para todo el programa.
import { media } from './descriptivos.js';
import { rangosPromedio } from './orden.js';
import { pTBilateral, cuantilT } from './distribuciones.js';
import { cdfNormal, zBilateral } from './normal.js';

/**
 * r de Pearson en dos pasadas. NaN si alguna serie es constante (la correlación no está definida) o tiene NaN: quien
 * necesite otro valor en ese caso (la fiabilidad y la criba usan 0) lo decide explícitamente en su envoltorio.
 * @param {ArrayLike<number>} a
 * @param {ArrayLike<number>} b
 * @returns {number}
 */
export function correlacion(a, b) {
    const n = a.length, ma = media(a), mb = media(b);
    let ab = 0, aa = 0, bb = 0;
    for (let i = 0; i < n; i++) { const da = /** @type {number} */ (a[i]) - ma, db = /** @type {number} */ (b[i]) - mb; ab += da * db; aa += da * da; bb += db * db; }
    return aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : NaN;
}

/**
 * ρ de Spearman: Pearson sobre los rangos con empates promediados.
 * @param {ArrayLike<number>} a
 * @param {ArrayLike<number>} b
 * @returns {number}
 */
export function spearman(a, b) { return correlacion(rangosPromedio(a), rangosPromedio(b)); }

/**
 * Matriz de correlaciones de Pearson de unas columnas de la misma longitud, con la aritmética de `correlacion` (donde la
 * correlación está definida, cada elemento es idéntico bit a bit a correlacion(columnas[i], columnas[j])), las medias y
 * las sumas de cuadrados una vez por columna. Diagonal 1; 0 donde no está definida (una columna constante o con NaN, en
 * las que `correlacion` da NaN): así la necesitan la fiabilidad, el AFE y el Simulador, que factorizan la matriz.
 * (2026.12.25, cierre de la fase F6) Había cinco copias con otras tres aritméticas (que diferían en el último bit): dos en
 * la psicometría (el α y la ω clásicos, su bootstrap y el AFE) y tres en el Simulador (la calibración de las cargas y de la
 * ω, su informe y la de las correlaciones exactas), que con una columna constante daban un residuo de redondeo en vez de 0.
 * @param {ArrayLike<number>[]} columnas
 * @returns {number[][]}
 */
export function matrizCorrelaciones(columnas) {
    const k = columnas.length, medias = columnas.map(c => media(c));
    const sc = columnas.map((c, j) => {
        const m = /** @type {number} */ (medias[j]);
        let s = 0;
        for (let i = 0; i < c.length; i++) { const d = /** @type {number} */ (c[i]) - m; s += d * d; }
        return s;
    });
    const R = Array.from({ length: k }, () => new Array(k).fill(1));
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
        const a = /** @type {ArrayLike<number>} */ (columnas[i]), b = /** @type {ArrayLike<number>} */ (columnas[j]);
        const ma = /** @type {number} */ (medias[i]), mb = /** @type {number} */ (medias[j]), si = /** @type {number} */ (sc[i]), sj = /** @type {number} */ (sc[j]);
        let ab = 0;
        for (let t = 0; t < a.length; t++) ab += (/** @type {number} */ (a[t]) - ma) * (/** @type {number} */ (b[t]) - mb);
        /** @type {number[]} */ (R[i])[j] = /** @type {number[]} */ (R[j])[i] = si > 0 && sj > 0 ? ab / Math.sqrt(si * sj) : 0;
    }
    return R;
}

/**
 * Pares completos de dos series alineadas por fila: las filas en que AMBAS son números finitos (eliminación por pares, la
 * de SPSS por defecto). Filtrar cada serie por separado desalinearía los pares: un perdido en una sola variable
 * emparejaría, a partir de él, el valor de un participante con el del siguiente.
 * @param {ArrayLike<number>} a
 * @param {ArrayLike<number>} b
 * @returns {{ x: Float64Array, y: Float64Array }}
 */
export function paresCompletos(a, b) {
    const n = Math.min(a.length, b.length), x = new Float64Array(n), y = new Float64Array(n);
    let k = 0;
    for (let i = 0; i < n; i++) {
        const u = /** @type {number} */ (a[i]), v = /** @type {number} */ (b[i]);
        if (Number.isFinite(u) && Number.isFinite(v)) { x[k] = u; y[k] = v; k++; }
    }
    return { x: x.subarray(0, k), y: y.subarray(0, k) };
}

/**
 * p del contraste H₀: ρ = 0 por la t de Student con n − 2 gl, t = r·√((n − 2)/(1 − r²)): la prueba de SPSS y de R
 * (cor.test), que vale igual para la ρ de Spearman (su aproximación asintótica). El unilateral es la mitad del bilateral,
 * como en SPSS: supone que el signo observado es el de la hipótesis. Con n ≤ 2 no hay grados de libertad: 1; con |r| = 1,
 * 0; NaN si r no es finito.
 * @param {number} r
 * @param {number} n
 * @param {{ bilateral?: boolean }} [opciones]
 * @returns {number}
 */
export function pCorrelacion(r, n, { bilateral = true } = {}) {
    if (n <= 2) return 1;
    if (Math.abs(r) >= 1) return 0;
    const t = r * Math.sqrt((n - 2) / (1 - r * r)), p = pTBilateral(Math.abs(t), n - 2);
    return Math.min(1, Math.max(0, bilateral ? p : p / 2));
}

/**
 * Intervalo de confianza de una correlación por la transformación z de Fisher, con el valor crítico exacto de la normal.
 * Error típico de z: 1/√(n − 3) para la r de Pearson y √((1 + ρ²/2)/(n − 3)) para la ρ de Spearman (Bonett y Wright,
 * 2000; con |ρ| alto cubre mejor que el √(1,06/(n − 3)) de Fieller, Hartley y Pearson, 1957). null si n ≤ 3, |r| ≥ 1 o r
 * no es finito: ahí la transformación no está definida.
 * @param {number} r
 * @param {number} n
 * @param {{ spearman?: boolean, nivel?: number }} [opciones]
 * @returns {{ inferior: number, superior: number, nivel: number } | null}
 */
export function icCorrelacion(r, n, { spearman = false, nivel = 0.95 } = {}) {
    if (!(n > 3) || !(Math.abs(r) < 1)) return null;
    const z = Math.atanh(r), ee = spearman ? Math.sqrt((1 + (r * r) / 2) / (n - 3)) : 1 / Math.sqrt(n - 3), c = zBilateral(nivel) * ee;
    return { inferior: Math.tanh(z - c), superior: Math.tanh(z + c), nivel };
}

/**
 * Potencia a posteriori del contraste de una correlación para el coeficiente observado, por la aproximación de Cohen
 * (1988, cap. 3), la de pwr.r.test en R: la z de Fisher del coeficiente con su corrección de sesgo, z = atanh|r| +
 * |r|/(2(n − 1)), frente a la del valor crítico de r que fija la t de la prueba (n − 2 gl), z_c = atanh(t_c/√(t_c² + n − 2)):
 * bilateral, Φ((z − z_c)√(n − 3)) + Φ((−z − z_c)√(n − 3)); unilateral, en la dirección observada (la del p), solo el primer
 * término: esa prueba no rechaza en la cola contraria. Frente a la potencia exacta de la prueba t (la densidad de r de
 * Hotelling, 1953, que integra el oráculo), con α de .01 a .10 y cualquier lateralidad, difiere a lo sumo en 0,003 con
 * n ≥ 30 y 0,013 con n de 12 a 29; la z de Fisher simple que se usaba hasta la 2026.12.16 (sin la corrección ni la t), en
 * 0,015 y 0,042. Con menos de 10 casos ninguna aproximación es fiable (errores de hasta 0,1). NaN si n ≤ 3, |r| ≥ 1 o r no
 * es finito.
 * @param {number} r
 * @param {number} n
 * @param {{ alfa?: number, bilateral?: boolean }} [opciones]
 * @returns {number}
 */
export function potenciaCorrelacion(r, n, { alfa = 0.05, bilateral = true } = {}) {
    if (!(n > 3) || !(Math.abs(r) < 1)) return NaN;
    const a = Math.abs(r), tc = cuantilT(bilateral ? 1 - alfa / 2 : 1 - alfa, n - 2), zc = Math.atanh(tc / Math.sqrt(tc * tc + n - 2));
    const z = Math.atanh(a) + a / (2 * (n - 1)), raiz = Math.sqrt(n - 3);
    const potencia = cdfNormal((z - zc) * raiz) + (bilateral ? cdfNormal((-z - zc) * raiz) : 0);
    return Math.min(1, Math.max(0, potencia));
}
