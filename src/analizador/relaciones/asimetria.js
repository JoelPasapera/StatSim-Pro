// @ts-check
// analizador/relaciones/asimetria.js — asimetría robusta: el medcouple (Brys, Hubert y Struyf, 2004) y los límites del boxplot
// ajustado (Hubert y Vandervieren, 2008), que se abren hacia la cola larga en vez de suponer simetría. Los usa la prueba de
// influencia en grupo para no tomar la cola legítima de una marginal asimétrica por casos groseramente alejados.
import { cuantilOrdenado, mediana as medianaNucleo } from '../../core/stats/orden.js';

/**
 * Mediana de un vector (copia ordenada).
 * @param {Float64Array} v
 * @returns {number}
 */
function mediana(v) { return medianaNucleo(v); }   // del núcleo único

/**
 * Cuantil con interpolación lineal (tipo 7) de un vector ya ordenado.
 * @param {Float64Array} s
 * @param {number} p
 * @returns {number}
 */
function cuantil(s, p) { return cuantilOrdenado(s, p); }   // tipo 7, del núcleo único

/**
 * Medcouple: asimetría robusta en [−1, 1] (0 si la distribución es simétrica; positiva con la cola a la derecha). Es la mediana
 * del núcleo h(zᵢ, zⱼ) = (zᵢ + zⱼ)/(zᵢ − zⱼ) sobre los pares con zᵢ ≥ 0 ≥ zⱼ (z = x − mediana); los empates con la mediana usan
 * el núcleo especial de la definición (−1, 0 o +1 según sus posiciones). Cálculo directo O(m²): con más de `maximo` valores se
 * usan `maximo` cuantiles equiespaciados de la muestra, que bastan para fijar unos límites.
 * @param {ArrayLike<number>} valores
 * @param {number} [maximo=1000]
 * @returns {number}
 */
export function medcouple(valores, maximo = 1000) {
    const s = Float64Array.from(Array.from(valores).filter(Number.isFinite)).sort();
    if (s.length < 3) return 0;
    let x = s;
    if (s.length > maximo) { x = new Float64Array(maximo); for (let i = 0; i < maximo; i++) x[i] = s[Math.round(i * (s.length - 1) / (maximo - 1))]; }
    const med = mediana(x), mas = [], menos = [];
    for (let i = x.length - 1; i >= 0; i--) if (x[i] >= med) mas.push(x[i] - med);   // de mayor a menor (los ceros, al final)
    for (let i = 0; i < x.length; i++) if (x[i] <= med) menos.push(x[i] - med);      // de menor a mayor (los ceros, al final)
    const k = x.filter(v => v === med).length, ceroMas = mas.length - k, ceroMenos = menos.length - k;
    const h = new Float64Array(mas.length * menos.length);
    let c = 0;
    for (let i = 0; i < mas.length; i++) for (let j = 0; j < menos.length; j++) {
        const zi = mas[i], zj = menos[j];
        // empates con la mediana: −1 por encima de la antidiagonal del bloque k×k, 0 en ella y +1 por debajo (lo que cuenta para
        // la mediana es cuántos hay de cada uno: k(k−1)/2, k y k(k−1)/2)
        if (zi === 0 && zj === 0) { const rc = (i - ceroMas) + (j - ceroMenos); h[c++] = rc < k - 1 ? -1 : rc === k - 1 ? 0 : 1; }
        else h[c++] = (zi + zj) / (zi - zj);
    }
    return mediana(h);
}

/**
 * Límites del boxplot ajustado: [Q1 − 1,5·e^(−4·MC)·RIC, Q3 + 1,5·e^(3·MC)·RIC] con MC ≥ 0 (con MC < 0, los exponentes −3 y 4).
 * Con RIC = 0 (casi todos los valores iguales) no hay límites: [−∞, ∞].
 * @param {ArrayLike<number>} valores
 * @returns {{ bajo: number, alto: number, mc: number }}
 */
export function limitesAjustados(valores) {
    const s = Float64Array.from(Array.from(valores).filter(Number.isFinite)).sort();
    if (s.length < 4) return { bajo: -Infinity, alto: Infinity, mc: 0 };
    const q1 = cuantil(s, 0.25), q3 = cuantil(s, 0.75), ric = q3 - q1, mc = medcouple(s);
    if (!(ric > 0)) return { bajo: -Infinity, alto: Infinity, mc };
    const [eb, ea] = mc >= 0 ? [-4, 3] : [-3, 4];
    return { bajo: q1 - 1.5 * Math.exp(eb * mc) * ric, alto: q3 + 1.5 * Math.exp(ea * mc) * ric, mc };
}
