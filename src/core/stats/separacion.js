// @ts-check
// core/stats/separacion.js — ¿tiene una regresión logística o de Poisson una estimación finita? (2026.12.23) La prueba exacta
// de la separación por programación lineal (Albert y Anderson, 1984; Konis, 2007, la de detectseparation de R), en lugar de
// deducirla de cómo se comporta el ajuste: un caso influyente cuya respuesta contradice un ajustado de 10⁻¹² (una
// estimación finita que R calcula) hace que los mínimos cuadrados reponderados no lleguen a la precisión pedida, y no por
// eso hay separación. Por el lema de Stiemke, con los vectores vᵢ de cada caso:
//   · logística: vᵢ = (2yᵢ − 1)·xᵢ; la estimación es finita si y solo si existen λᵢ > 0 (todos) con Σ λᵢ·vᵢ = 0. Si no,
//     hay una dirección d ≠ 0 con vᵢᵀd ≥ 0 para todo i (la separación, completa o casi completa);
//   · Poisson: vᵢ = xᵢ; la estimación es finita si y solo si existen λᵢ > 0 en los casos con yᵢ = 0 y λᵢ libres en los
//     demás con Σ λᵢ·vᵢ = 0. Si no, hay una d con xᵢᵀd = 0 donde yᵢ > 0 y xᵢᵀd ≥ 0 (no todas nulas) donde yᵢ = 0.
// La existencia no cambia con una transformación afín de los predictores ni con un factor positivo en cada caso: xᵢ lleva
// la constante y los predictores centrados en su mediana y divididos por una escala robusta, y cada vᵢ se lleva a norma 1,
// de modo que la tolerancia del símplex es la misma para todos (con la media y la DE, un valor de 10¹⁰ —un código de
// perdido— comprimía las diferencias de los demás por debajo de ella, y una base con estimación finita parecía separada).
// Se resuelve la fase 1 del símplex (core/linalg/simplex.js) y el resultado se COMPRUEBA en los datos: la combinación λ, o
// la dirección de separación del certificado de Farkas; si ninguna se comprueba, la respuesta es «no se sabe» (null).
import { fase1 } from '../linalg/simplex.js';
import { mediana, escalaRobusta } from './orden.js';

/** La tolerancia del símplex en los costes reducidos (con columnas de norma 1) y la holgura con que se comprueba el certificado. */
const TOLERANCIA = 1e-9;

/**
 * @param {ArrayLike<number>} y la dependiente: 0 y 1 (logística) o conteos ≥ 0 (Poisson)
 * @param {ArrayLike<number>[]} columnas los predictores (sin la constante), de rango completo con ella
 * @param {'logistica' | 'poisson'} familia
 * @returns {boolean | null} true si la estimación es finita; false si hay separación (con su dirección comprobada); null si
 *   no se pudo decidir
 */
export function hayEstimacionFinita(y, columnas, familia) {
    const n = y.length, p = columnas.length + 1, logistica = familia === 'logistica';
    // las columnas: la constante y los predictores centrados y escalados de forma robusta
    /** @type {Float64Array[]} */ const z = [new Float64Array(n).fill(1)];
    for (const c of columnas) {
        const m = mediana(c), s = escalaRobusta(c, m), zc = new Float64Array(n);
        for (let i = 0; i < n; i++) zc[i] = (/** @type {number} */ (c[i]) - m) / s;
        z.push(zc);
    }
    // cada caso a norma 1 (≥ 1 antes de dividir: la constante vale 1)
    for (let i = 0; i < n; i++) {
        let q = 0; for (let r = 0; r < p; r++) q += /** @type {number} */ (/** @type {Float64Array} */ (z[r])[i]) ** 2;
        q = Math.sqrt(q);
        for (let r = 0; r < p; r++) { const zr = /** @type {Float64Array} */ (z[r]); zr[i] = /** @type {number} */ (zr[i]) / q; }
    }
    // casos estrictos (λ ≥ 1, por escala) y libres (Poisson con y > 0: λ = λ⁺ − λ⁻)
    const estricto = Uint8Array.from({ length: n }, (_, i) => (logistica || /** @type {number} */ (y[i]) === 0 ? 1 : 0));
    const signoCaso = (/** @type {number} */ i) => (logistica ? 2 * /** @type {number} */ (y[i]) - 1 : 1);
    let nEstrictos = 0; for (let i = 0; i < n; i++) nEstrictos += /** @type {number} */ (estricto[i]);
    if (nEstrictos === 0) return true;   // Poisson sin ceros: no hay dirección posible
    const v = (/** @type {number} */ i, /** @type {number} */ r) => signoCaso(i) * /** @type {number} */ (/** @type {Float64Array} */ (z[r])[i]);
    // el sistema: Σ_estrictos μᵢvᵢ + Σ_libres (λ⁺ᵢ − λ⁻ᵢ)vᵢ = −Σ_estrictos vᵢ, con todo ≥ 0 (λᵢ = 1 + μᵢ en los estrictos)
    const nCol = nEstrictos + 2 * (n - nEstrictos), A = new Float64Array(nCol * p), b = new Float64Array(p);
    /** @type {Int32Array} */ const casoDeColumna = new Int32Array(nCol), signoDeColumna = new Int8Array(nCol);
    let j = 0;
    for (let i = 0; i < n; i++) {
        const copias = estricto[i] ? [1] : [1, -1];
        for (const sg of copias) {
            for (let r = 0; r < p; r++) A[j * p + r] = sg * v(i, r);
            casoDeColumna[j] = i; signoDeColumna[j] = sg; j++;
        }
        if (estricto[i]) for (let r = 0; r < p; r++) b[r] = /** @type {number} */ (b[r]) - v(i, r);
    }
    const R = fase1(A, p, nCol, b, { tolerancia: TOLERANCIA, maxIteraciones: 200 * p + 2000 });
    if (!R) return null;
    if (R.factible) {
        // comprobar Σ λᵢvᵢ ≈ 0 con λᵢ = 1 + μᵢ (estrictos) y λ⁺ − λ⁻ (libres)
        const lambda = Float64Array.from(estricto, e => e);
        for (let c = 0; c < nCol; c++) { const i = /** @type {number} */ (casoDeColumna[c]); lambda[i] = /** @type {number} */ (lambda[i]) + /** @type {number} */ (signoDeColumna[c]) * /** @type {number} */ (R.x[c]); }
        let peor = 0, total = 0;
        for (let r = 0; r < p; r++) {
            let s = 0; for (let i = 0; i < n; i++) { s += /** @type {number} */ (lambda[i]) * v(i, r); total += Math.abs(/** @type {number} */ (lambda[i]) * v(i, r)); }
            peor = Math.max(peor, Math.abs(s));
        }
        return peor <= 1e-7 * (total / p + 1) ? true : null;
    }
    // el certificado: d = −y, con vᵢᵀd ≥ 0 en los estrictos (alguno > 0) y vᵢᵀd = 0 en los libres. Cada vᵢᵀd se acepta con
    // la holgura del símplex más el redondeo del producto (relativo a Σ|vᵢᵣdᵣ|, no a ‖d‖: con predictores casi colineales, d
    // tiene una componente enorme en la dirección casi nula del diseño que apenas cambia los vᵢᵀd, y una tolerancia en ‖d‖
    // rechazaba separaciones verdaderas); la separación exige un margen mil veces mayor que esas holguras
    const d = Float64Array.from(R.y, w => -w);
    let positivo = 0, holguraMax = 0;
    for (let i = 0; i < n; i++) {
        let s = 0, magnitud = 0;
        for (let r = 0; r < p; r++) { const t = v(i, r) * /** @type {number} */ (d[r]); s += t; magnitud += Math.abs(t); }
        if (!Number.isFinite(s)) return null;
        const holgura = TOLERANCIA + 8 * p * Number.EPSILON * magnitud;
        holguraMax = Math.max(holguraMax, holgura);
        if (estricto[i] ? s < -holgura : Math.abs(s) > holgura) return null;   // la dirección no separa: no se sabe
        if (estricto[i]) positivo = Math.max(positivo, s);
    }
    return positivo > 1e3 * holguraMax ? false : null;
}
