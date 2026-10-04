// analizador/psicometria/factorial.js — extracción factorial por ejes principales iterados (el paso 3 del plan, AFE,
// la amplía con más factores y rotación). Aquí sirve al ω ordinal: un factor sobre la matriz policórica.
import { eigenSimetrica, inversaDefinidaPositiva } from './algebra.js';

export const COMUNALIDAD_MAXIMA = 0.999;   // tope ante casos Heywood (comunalidad ≥ 1)

// Comunalidades iniciales: correlación múltiple al cuadrado (1 − 1/diag(R⁻¹)); si R no es invertible, el mayor |r| de la fila
export function comunalidadesIniciales(R) {
    const inv = inversaDefinidaPositiva(R);
    if (inv) return R.map((_, i) => Math.min(COMUNALIDAD_MAXIMA, Math.max(0.005, 1 - 1 / inv[i][i])));
    return R.map((f, i) => Math.min(COMUNALIDAD_MAXIMA, Math.max(0.005, ...f.filter((_, j) => j !== i).map(Math.abs))));
}

export function ejesPrincipales(R, m = 1, { maxIter = 1000, tol = 1e-10 } = {}) {
    const k = R.length;
    let h2 = comunalidadesIniciales(R), cargas = null, iter = 0, heywood = false, cambio = Infinity;
    while (iter < maxIter) {
        iter++;
        const Rr = R.map((f, i) => Array.from(f, (v, j) => (i === j ? h2[i] : v)));
        const { valores, vectores } = eigenSimetrica(Rr);
        cargas = Array.from({ length: k }, (_, i) => Array.from({ length: m }, (_, f) => vectores[f][i] * Math.sqrt(Math.max(valores[f], 0))));
        const nuevo = cargas.map(fila => { const s = fila.reduce((acc, l) => acc + l * l, 0); if (s > COMUNALIDAD_MAXIMA) { heywood = true; return COMUNALIDAD_MAXIMA; } return s; });
        cambio = Math.max(...nuevo.map((v, i) => Math.abs(v - h2[i])));
        h2 = nuevo;
        if (cambio < tol) break;
    }
    for (let f = 0; f < m; f++) {   // signo: cada factor con suma de cargas positiva
        if (cargas.reduce((s, fila) => s + fila[f], 0) < 0) cargas.forEach(fila => { fila[f] = -fila[f]; });
    }
    return { cargas, comunalidades: h2, iteraciones: iter, convergio: cambio < tol, heywood };
}

// ω de un factor sobre una matriz de correlaciones: (Σλ)² / [(Σλ)² + Σ(1 − h²)] (McDonald, 1999)
export function omegaUnFactor(R) {
    const ep = ejesPrincipales(R, 1);
    const suma = ep.cargas.reduce((s, fila) => s + fila[0], 0);
    const unicidades = ep.comunalidades.reduce((s, h) => s + (1 - h), 0);
    return { omega: (suma * suma) / (suma * suma + unicidades), cargas: ep.cargas.map(f => f[0]), heywood: ep.heywood, convergio: ep.convergio, iteraciones: ep.iteraciones };
}

// Misma solución que ejesPrincipales(R, 1) (mismo arranque, tope y criterio), pero el autovector dominante se obtiene
// por potencias sobre R* + I con arranque en el de la iteración anterior: O(k²) por paso en vez de Jacobi O(k³).
// Es la versión que usa el bootstrap, que repite el cálculo cientos de veces.
export function omegaUnFactorRapido(R, { maxIter = 1000, tol = 1e-10 } = {}) {
    const k = R.length;
    let h2 = comunalidadesIniciales(R), v = new Float64Array(k).fill(1 / Math.sqrt(k)), lambda = 0, cambio = Infinity, iter = 0, heywood = false;
    let cargas = new Float64Array(k);
    while (iter < maxIter) {
        iter++;
        for (let p = 0; p < 5000; p++) {   // potencias sobre R* + I (autovalores desplazados +1, todos positivos)
            const w = new Float64Array(k);
            for (let i = 0; i < k; i++) { let s = v[i]; const f = R[i]; for (let j = 0; j < k; j++) s += (i === j ? h2[i] : f[j]) * v[j]; w[i] = s; }
            let norma = 0; for (let i = 0; i < k; i++) norma += w[i] * w[i];
            norma = Math.sqrt(norma);
            let dif = 0; for (let i = 0; i < k; i++) { const x = w[i] / norma; dif = Math.max(dif, Math.abs(x - v[i])); v[i] = x; }
            lambda = norma - 1;
            if (dif < 1e-13) break;
        }
        let nuevo = 0;
        for (let i = 0; i < k; i++) {
            cargas[i] = v[i] * Math.sqrt(Math.max(lambda, 0));
            let h = cargas[i] * cargas[i];
            if (h > COMUNALIDAD_MAXIMA) { heywood = true; h = COMUNALIDAD_MAXIMA; }
            nuevo = Math.max(nuevo, Math.abs(h - h2[i]));
            h2[i] = h;
        }
        cambio = nuevo;
        if (cambio < tol) break;
    }
    let suma = 0; for (let i = 0; i < k; i++) suma += cargas[i];
    if (suma < 0) { suma = -suma; for (let i = 0; i < k; i++) cargas[i] = -cargas[i]; }
    const unicidades = h2.reduce((s, h) => s + (1 - h), 0);
    return { omega: (suma * suma) / (suma * suma + unicidades), cargas: Array.from(cargas), heywood, convergio: cambio < tol };
}
