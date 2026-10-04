// analizador/psicometria/ordinal.js — fiabilidad para ítems ordinales (Likert) y dicotómicos: α y ω calculados sobre
// la matriz de correlaciones policóricas (tetracóricas si los ítems son 0/1), que no subestima la relación entre
// ítems con pocas categorías como sí hace Pearson (Zumbo, Gadermann y Zeisser, 2007; Gadermann, Guhn y Zumbo, 2012).
//   α ordinal = k·r̄ / [1 + (k − 1)·r̄], con r̄ la correlación policórica media (sobre la matriz tal como se estima)
//   ω ordinal = (Σλ)² / [(Σλ)² + Σ(1 − λ²)], un factor por ejes principales sobre la matriz (suavizada si hace falta)
import { policorica } from './policorica.js';
import { suavizarCorrelacion, definidaPositivaCon } from './algebra.js';
import { omegaUnFactor, omegaUnFactorRapido } from './factorial.js';

export const MAX_CATEGORIAS_ORDINALES = 7;

// continuo (decimales o más de 7 categorías) · dicotómico (todos los ítems con 2 categorías) · ordinal
export function tipoDeItems(cols, maxCategorias = MAX_CATEGORIAS_ORDINALES) {
    const categorias = cols.map(c => new Set(c).size);
    if (!cols.every(c => c.every(Number.isInteger)) || categorias.some(n => n > maxCategorias)) return { tipo: 'continuo', categorias };
    return { tipo: categorias.every(n => n === 2) ? 'dicotomico' : 'ordinal', categorias };
}

export function matrizPolicorica(cols) {
    const k = cols.length;
    const R = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => (i === j ? 1 : 0)));
    let enElLimite = 0;
    const errores = [];
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
        const p = policorica(cols[i], cols[j]);
        if (!Number.isFinite(p.rho)) { errores.push(`ítems ${i + 1} y ${j + 1}: ${p.error}`); continue; }
        R[i][j] = R[j][i] = p.rho;
        if (p.enElLimite) enElLimite++;
    }
    return { R, enElLimite, errores };
}

// α y ω a partir de una matriz policórica ya estimada (α sobre la matriz tal cual; ω sobre la suavizada si hace falta)
export function coeficientesOrdinales(R) {
    const k = R.length;
    let suma = 0;
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) suma += R[i][j];
    const rMedia = suma / (k * (k - 1) / 2);
    const alfa = (k * rMedia) / (1 + (k - 1) * rMedia);
    // con 2 ítems el modelo de un factor no está identificado: sin ω (como el ω clásico, que exige 3 ítems)
    if (k < 3) return { alfa, omega: null, cargas: null, rMedia, suavizada: false, minAutovalor: null, heywood: false };
    const sv = suavizarCorrelacion(R), om = omegaUnFactor(sv.R);
    return { alfa, omega: om.omega, cargas: om.cargas, rMedia, suavizada: sv.suavizada, minAutovalor: sv.minAutovalor, heywood: om.heywood };
}

// Recodificar un ítem ordinal invierte el orden de sus categorías: su correlación policórica con los demás cambia de signo
export function invertirSignos(R, indices) {
    const s = R.map((_, i) => (indices.includes(i) ? -1 : 1));
    return R.map((f, i) => f.map((v, j) => (i === j ? 1 : v * s[i] * s[j])));
}

export function fiabilidadOrdinal(cols, { maxCategorias = MAX_CATEGORIAS_ORDINALES } = {}) {
    const clase = tipoDeItems(cols, maxCategorias);
    if (clase.tipo === 'continuo' || cols.length < 2) return null;
    const k = cols.length;
    const { R, enElLimite, errores } = matrizPolicorica(cols);
    if (errores.length) return { error: 'No se pudo estimar la matriz policórica: ' + errores.join('; '), tipo: clase.tipo };
    const c = coeficientesOrdinales(R), sv = { suavizada: c.suavizada, minAutovalor: c.minAutovalor }, om = { heywood: c.heywood };
    const { alfa, rMedia } = c;
    const nombre = clase.tipo === 'dicotomico' ? 'tetracórica' : 'policórica';
    const avisos = [];
    if (enElLimite) avisos.push(`${enElLimite} correlación(es) ${nombre}(s) quedaron en el límite (|ρ| ≈ 1): tablas sin casos discordantes, habituales con muestras pequeñas o ítems muy extremos.`);
    if (sv.suavizada) avisos.push(`La matriz ${nombre} no era definida positiva (autovalor mínimo ${sv.minAutovalor.toFixed(3)}); para el ω se suavizó por autovalores.`);
    if (om.heywood) avisos.push('La solución factorial del ω ordinal presentó un caso Heywood (comunalidad ≥ 1, acotada en .999): interprétese con cautela.');
    return { tipo: clase.tipo, correlacion: nombre, categorias: clase.categorias, k, alfa, omega: c.omega, cargas: c.cargas, rMedia, R,
        suavizada: sv.suavizada, heywood: om.heywood, avisos };
}

// α y ω ordinales para el bootstrap: mismos valores que coeficientesOrdinales (el suavizado solo se calcula si la
// matriz no es definida positiva, comprobado con un Cholesky) con el ω de un factor por potencias
export function coeficientesOrdinalesRapidos(R) {
    const k = R.length;
    let suma = 0;
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) suma += R[i][j];
    const rMedia = suma / (k * (k - 1) / 2), alfa = (k * rMedia) / (1 + (k - 1) * rMedia);
    if (k < 3) return { alfa, omega: null };
    const M = definidaPositivaCon(R, 1e-6) ? R : suavizarCorrelacion(R).R;
    return { alfa, omega: omegaUnFactorRapido(M).omega };
}
