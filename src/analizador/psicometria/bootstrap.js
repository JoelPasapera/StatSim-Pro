// analizador/psicometria/bootstrap.js — intervalos de confianza por bootstrap no paramétrico (Efron y Tibshirani, 1993)
// para α, ω y sus versiones ordinales: remuestras de casos con reposición a partir de una semilla (reproducibles),
// intervalo percentil o BCa (sesgo corregido y acelerado, con la aceleración por jackknife). Sin DOM: lo ejecuta el
// Worker (psicometria.worker.js) o, si no hay Worker, el hilo principal.
import { crearAleatorio } from './aleatorio.js';
import { cdfNormal, cuantilNormal } from './numerico.js';
import { coeficientesClasicos } from './clasica.js';
import { tipoDeItems, fiabilidadOrdinal, coeficientesOrdinalesRapidos } from './ordinal.js';
import { policoricaDesde } from './policorica.js';

export const METODOS = { percentil: 'percentil', bca: 'BCa' };

// Cuantil con interpolación lineal (tipo 7 de Hyndman y Fan, 1996: el de R y NumPy por defecto) sobre datos ordenados
export function cuantilLineal(o, p) {
    const n = o.length;
    if (!n) return NaN;
    const h = (n - 1) * Math.min(1, Math.max(0, p)), lo = Math.floor(h), hi = Math.min(n - 1, lo + 1);
    return o[lo] + (h - lo) * (o[hi] - o[lo]);
}
const ordenar = v => Float64Array.from(v).sort();

export function intervaloPercentil(replicas, nivel = 0.95) {
    const o = ordenar(replicas), a = (1 - nivel) / 2;
    return { inferior: cuantilLineal(o, a), superior: cuantilLineal(o, 1 - a) };
}

// BCa: z₀ por la proporción de réplicas bajo el estimado (empates a medias) y aceleración por jackknife
export function intervaloBCa(replicas, estimado, jack, nivel = 0.95) {
    const o = ordenar(replicas), B = o.length;
    let menores = 0, iguales = 0;
    for (const v of o) { if (v < estimado) menores++; else if (v === estimado) iguales++; }
    const p0 = (menores + 0.5 * iguales) / B;
    if (!(p0 > 0 && p0 < 1) || !jack || jack.length < 3) return null;
    const z0 = cuantilNormal(p0);
    const m = jack.reduce((s, v) => s + v, 0) / jack.length;
    let num = 0, den = 0;
    for (const v of jack) { const d = m - v; num += d * d * d; den += d * d; }
    const a = den > 0 ? num / (6 * Math.pow(den, 1.5)) : 0;
    const za = cuantilNormal((1 - nivel) / 2);
    const ajustar = z => cdfNormal(z0 + (z0 + z) / (1 - a * (z0 + z)));
    return { inferior: cuantilLineal(o, ajustar(za)), superior: cuantilLineal(o, ajustar(-za)), z0, aceleracion: a };
}

// Motor: B remuestras de n índices con reposición; el estadístico devuelve { clave: valor } (no finito = réplica inválida)
export function bootstrap(n, estadistico, { B = 1000, semilla = 2026, alProgreso = null, cada = 10 } = {}) {
    const rng = crearAleatorio(semilla), idx = new Int32Array(n), reps = {}, invalidas = {};
    for (let b = 0; b < B; b++) {
        for (let i = 0; i < n; i++) idx[i] = rng.entero(n);
        const v = estadistico(idx);
        for (const c of Object.keys(v)) {
            if (!reps[c]) { reps[c] = []; invalidas[c] = 0; }
            if (Number.isFinite(v[c])) reps[c].push(v[c]); else invalidas[c]++;
        }
        if (alProgreso && ((b + 1) % cada === 0 || b === B - 1)) alProgreso(b + 1, B);
    }
    return { reps, invalidas };
}

// Jackknife (uno fuera), para la aceleración del BCa
export function jackknife(n, estadistico, alProgreso = null) {
    const idx = new Int32Array(n - 1), vals = {};
    for (let q = 0; q < n; q++) {
        if (alProgreso && (q % 10 === 0)) alProgreso(q, n);
        let t = 0;
        for (let i = 0; i < n; i++) if (i !== q) idx[t++] = i;
        const v = estadistico(idx);
        for (const c of Object.keys(v)) (vals[c] = vals[c] || []).push(v[c]);
    }
    return vals;
}

// Estadístico de fiabilidad de un grupo de ítems (columnas completas) sobre unos índices de casos
export function estadisticoFiabilidad(cols, { ordinal = true, rhoInicial = null } = {}) {
    const k = cols.length;
    const conOrdinal = ordinal && tipoDeItems(cols).tipo !== 'continuo';
    return idx => {
        const c = cols.map(col => { const v = new Float64Array(idx.length); for (let i = 0; i < idx.length; i++) v[i] = col[idx[i]]; return v; });
        const constante = c.some(v => { for (let i = 1; i < v.length; i++) if (v[i] !== v[0]) return false; return true; });
        const fuera = { alfa: NaN, omega: NaN, ...(conOrdinal ? { alfaOrdinal: NaN, omegaOrdinal: NaN } : {}) };
        if (constante) return fuera;   // un ítem sin variación en la remuestra: réplica inválida (cambiaría el instrumento)
        const cl = coeficientesClasicos(c);
        const salida = { alfa: cl.alfa ?? NaN, omega: cl.omega ?? NaN };
        if (conOrdinal) {
            const R = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => (i === j ? 1 : 0)));
            let valida = true;
            for (let i = 0; i < k && valida; i++) for (let j = i + 1; j < k; j++) {
                const p = policoricaDesde(c[i], c[j], rhoInicial ? rhoInicial[i][j] : 0);
                if (!Number.isFinite(p.rho)) { valida = false; break; }
                R[i][j] = R[j][i] = p.rho;
            }
            const co = valida ? coeficientesOrdinalesRapidos(R) : { alfa: NaN, omega: NaN };
            salida.alfaOrdinal = co.alfa; salida.omegaOrdinal = co.omega ?? NaN;
        }
        return salida;
    };
}

/**
 * Intervalos bootstrap de un grupo. opciones: { B, semilla, nivel, metodo: 'percentil' | 'bca', ordinal }
 * → { estimados, intervalos: { clave: { inferior, superior, validas } | null }, invalidas, B, semilla, nivel, metodo }
 */
export function bootstrapGrupo(cols, { B = 1000, semilla = 2026, nivel = 0.95, metodo = 'percentil', ordinal = true } = {}, { alProgreso = null } = {}) {
    const n = cols[0].length;
    const cl = coeficientesClasicos(cols);
    const ord = ordinal ? fiabilidadOrdinal(cols) : null;
    const puntoOrdinal = ord && !ord.error ? ord : null;
    const estimados = { alfa: cl.alfa, omega: cl.omega, ...(puntoOrdinal ? { alfaOrdinal: puntoOrdinal.alfa, omegaOrdinal: puntoOrdinal.omega } : {}) };
    const est = estadisticoFiabilidad(cols, { ordinal: !!puntoOrdinal, rhoInicial: puntoOrdinal ? puntoOrdinal.R : null });
    // progreso en «unidades»: B remuestras más, con BCa, n recálculos del jackknife
    const unidades = B + (metodo === 'bca' ? n : 0);
    const { reps, invalidas } = bootstrap(n, est, { B, semilla, alProgreso: alProgreso ? h => alProgreso(h, unidades) : null });
    const jack = metodo === 'bca' ? jackknife(n, est, alProgreso ? q => alProgreso(B + q, unidades) : null) : null;
    if (alProgreso) alProgreso(unidades, unidades);
    const intervalos = {};
    for (const c of Object.keys(estimados)) {
        const r = reps[c] || [];
        if (!Number.isFinite(estimados[c]) || r.length < Math.max(20, 0.5 * B)) { intervalos[c] = null; continue; }   // sin estimado o con demasiadas réplicas inválidas
        const iv = metodo === 'bca' ? intervaloBCa(r, estimados[c], jack[c].filter(Number.isFinite), nivel) : intervaloPercentil(r, nivel);
        intervalos[c] = iv ? { ...iv, validas: r.length } : null;
    }
    return { estimados, intervalos, invalidas, B, semilla, nivel, metodo, n };
}
