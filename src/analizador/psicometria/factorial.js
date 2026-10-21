// analizador/psicometria/factorial.js — extracción factorial por ejes principales iterados (el paso 3 del plan, AFE,
// la amplía con más factores y rotación). Aquí sirve al ω ordinal: un factor sobre la matriz policórica.
import { eigenSimetrica } from './algebra.js';
import { COMUNALIDAD_MAXIMA, comunalidadesIniciales, ejesPrincipalesUnFactor, omegaDeCargas } from '../../core/stats/fiabilidad.js';
export { COMUNALIDAD_MAXIMA, comunalidadesIniciales };   // (2026.12.13) del núcleo único (core/stats/fiabilidad.js)



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
    // (2026.12.13) del motor único del núcleo (antes, ejesPrincipales(R, 1) con tope de 1000 iteraciones)
    const ep = ejesPrincipalesUnFactor(R);
    return { omega: omegaDeCargas(ep.cargas, ep.comunalidades), cargas: ep.cargas, heywood: ep.heywood, convergio: ep.convergio, iteraciones: ep.iteraciones };
}

// Misma solución que ejesPrincipales(R, 1) (mismo arranque, tope y criterio), pero el autovector dominante se obtiene
// por potencias sobre R* + I con arranque en el de la iteración anterior: O(k²) por paso en vez de Jacobi O(k³).
// Es la versión que usa el bootstrap, que repite el cálculo cientos de veces.
export function omegaUnFactorRapido(R, opciones = {}) {
    const ep = ejesPrincipalesUnFactor(R, opciones);   // (2026.12.13) el motor único del núcleo es este mismo algoritmo
    return { omega: omegaDeCargas(ep.cargas, ep.comunalidades), cargas: ep.cargas, heywood: ep.heywood, convergio: ep.convergio };
}
