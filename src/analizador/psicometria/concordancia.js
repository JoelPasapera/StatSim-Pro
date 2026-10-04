// analizador/psicometria/concordancia.js — concordancia entre evaluadores (sin DOM):
//   · κ de Cohen (1960) para dos evaluadores y κ ponderado lineal o cuadrático (Cohen, 1968) para categorías ordenadas;
//   · κ de Fleiss (1971) para tres o más evaluadores;
//   · coeficientes de correlación intraclase (CCI) de Shrout y Fleiss (1979) — uno o dos factores, acuerdo absoluto o
//     consistencia, medida individual o promedio — con intervalos de confianza exactos por la F (McGraw y Wong, 1996).
// Los intervalos de κ son bootstrap percentil con semilla (motor de bootstrap.js).
import { cuantilF } from './numerico.js';
import { bootstrap, intervaloPercentil } from './bootstrap.js';

// categorías: números en orden numérico; etiquetas de texto (p. ej., «Bajo», «Alto») en orden de aparición
const categoriasDe = cols => { const u = [...new Set(cols.flat())]; return u.every(v => typeof v === 'number') ? u.sort((a, b) => a - b) : u; };

// κ de Cohen (pesos: 'ninguno' | 'lineal' | 'cuadratico') sobre los casos indicados (índices)
export function kappaCohen(x, y, pesos = 'ninguno', cats = categoriasDe([x, y]), idx = null) {
    const c = cats.length, pos = new Map(cats.map((v, i) => [v, i])), O = Array.from({ length: c }, () => new Float64Array(c));
    const casos = idx || x.map((_, i) => i);
    for (const i of casos) O[pos.get(x[i])][pos.get(y[i])]++;
    const n = casos.length, fila = O.map(f => f.reduce((s, v) => s + v, 0)), col = cats.map((_, j) => O.reduce((s, f) => s + f[j], 0));
    const w = (i, j) => (pesos === 'lineal' ? 1 - Math.abs(i - j) / (c - 1) : pesos === 'cuadratico' ? 1 - ((i - j) / (c - 1)) ** 2 : i === j ? 1 : 0);
    let po = 0, pe = 0;
    for (let i = 0; i < c; i++) for (let j = 0; j < c; j++) { po += (w(i, j) * O[i][j]) / n; pe += (w(i, j) * fila[i] * col[j]) / (n * n); }
    return { kappa: pe < 1 ? (po - pe) / (1 - pe) : NaN, po, pe, n };
}

// κ de Fleiss: cols = evaluaciones de cada evaluador (m columnas × n sujetos)
export function kappaFleiss(cols, cats = categoriasDe(cols), idx = null) {
    const m = cols.length, pos = new Map(cats.map((v, i) => [v, i])), casos = idx || cols[0].map((_, i) => i), n = casos.length;
    const pj = new Float64Array(cats.length);
    let Pbar = 0;
    for (const i of casos) {
        const cuenta = new Float64Array(cats.length);
        for (let r = 0; r < m; r++) cuenta[pos.get(cols[r][i])]++;
        let s = 0;
        cuenta.forEach((v, j) => { s += v * v; pj[j] += v; });
        Pbar += (s - m) / (m * (m - 1));
    }
    Pbar /= n;
    let Pe = 0;
    pj.forEach(v => { const p = v / (n * m); Pe += p * p; });
    return { kappa: Pe < 1 ? (Pbar - Pe) / (1 - Pe) : NaN, Pbar, Pe, n, m };
}

// Intervalo bootstrap percentil de cualquier κ (remuestreo de sujetos con semilla)
export function intervaloKappa(fn, n, { B = 1000, semilla = 2026, nivel = 0.95 } = {}) {
    const { reps } = bootstrap(n, idx => ({ k: fn(Array.from(idx)) }), { B, semilla });
    return reps.k && reps.k.length >= 0.5 * B ? intervaloPercentil(reps.k, nivel) : null;
}

// Los seis CCI de Shrout y Fleiss (1979) con sus IC (McGraw y Wong, 1996); cols = k evaluadores × n sujetos, completos
export function cci(cols, nivel = 0.95) {
    const k = cols.length, n = cols[0].length;
    let total = 0;
    cols.forEach(c => c.forEach(v => { total += v; }));
    const gm = total / (n * k);
    const medF = Array.from({ length: n }, (_, i) => cols.reduce((s, c) => s + c[i], 0) / k), medC = cols.map(c => c.reduce((s, v) => s + v, 0) / n);
    let SST = 0;
    cols.forEach(c => c.forEach(v => { SST += (v - gm) ** 2; }));
    const SSR = k * medF.reduce((s, m) => s + (m - gm) ** 2, 0), SSC = n * medC.reduce((s, m) => s + (m - gm) ** 2, 0);
    const SSE = SST - SSR - SSC, SSW = SST - SSR;
    const MSR = SSR / (n - 1), MSC = SSC / (k - 1), MSE = SSE / ((n - 1) * (k - 1)), MSW = SSW / (n * (k - 1));
    const q = 1 - (1 - nivel) / 2;
    if (!(MSE > 0) || !(MSW > 0)) {   // (2026.10.17) acuerdo perfecto entre evaluadores: los CCI son 1 y no hay variación que estimar
        const uno = (clave, modelo, tipo, medida, recomendado) => ({ clave, modelo, tipo, medida, valor: MSR > 0 ? 1 : NaN, ic: MSR > 0 ? [1, 1] : [NaN, NaN], recomendado });
        return { n, k, medias: { MSR, MSC, MSE, MSW }, perfecto: true, formas: [uno('CCI(1,1)', 'Un factor, efectos aleatorios', 'Acuerdo absoluto', 'Individual'), uno('CCI(2,1)', 'Dos factores, efectos aleatorios', 'Acuerdo absoluto', 'Individual', true), uno('CCI(3,1)', 'Dos factores, efectos mixtos', 'Consistencia', 'Individual'), uno(`CCI(1,${k})`, 'Un factor, efectos aleatorios', 'Acuerdo absoluto', `Promedio de ${k}`), uno(`CCI(2,${k})`, 'Dos factores, efectos aleatorios', 'Acuerdo absoluto', `Promedio de ${k}`), uno(`CCI(3,${k})`, 'Dos factores, efectos mixtos', 'Consistencia', `Promedio de ${k}`)] };
    }
    const conF = (F, d1, d2, individual) => {   // IC de los CCI de uno o dos factores mixtos (ICC1, ICC3)
        const FL = F / cuantilF(q, d1, d2), FU = F * cuantilF(q, d2, d1);
        return individual ? [(FL - 1) / (FL + k - 1), (FU - 1) / (FU + k - 1)] : [1 - 1 / FL, 1 - 1 / FU];
    };
    const icc1 = (MSR - MSW) / (MSR + (k - 1) * MSW), icc3 = (MSR - MSE) / (MSR + (k - 1) * MSE);
    const icc2 = (MSR - MSE) / (MSR + (k - 1) * MSE + (k * (MSC - MSE)) / n);
    // IC del CCI(2,1) con los gl de Satterthwaite (McGraw y Wong, 1996, caso 2A)
    const a = (k * icc2) / (n * (1 - icc2)), b = 1 + (k * icc2 * (n - 1)) / (n * (1 - icc2));
    const v = (a * MSC + b * MSE) ** 2 / ((a * MSC) ** 2 / (k - 1) + (b * MSE) ** 2 / ((n - 1) * (k - 1)));
    const FL2 = cuantilF(q, n - 1, v), FU2 = cuantilF(q, v, n - 1);
    const lo2 = (n * (MSR - FL2 * MSE)) / (FL2 * (k * MSC + (k * n - k - n) * MSE) + n * MSR);
    const hi2 = (n * (FU2 * MSR - MSE)) / (k * MSC + (k * n - k - n) * MSE + n * FU2 * MSR);
    const promedio = x => (k * x) / (1 + (k - 1) * x);   // Spearman–Brown: de la medida individual al promedio de k
    return {
        n, k, medias: { MSR, MSC, MSE, MSW },
        formas: [
            { clave: 'CCI(1,1)', modelo: 'Un factor, efectos aleatorios', tipo: 'Acuerdo absoluto', medida: 'Individual', valor: icc1, ic: conF(MSR / MSW, n - 1, n * (k - 1), true) },
            { clave: 'CCI(2,1)', modelo: 'Dos factores, efectos aleatorios', tipo: 'Acuerdo absoluto', medida: 'Individual', valor: icc2, ic: [lo2, hi2], recomendado: true },
            { clave: 'CCI(3,1)', modelo: 'Dos factores, efectos mixtos', tipo: 'Consistencia', medida: 'Individual', valor: icc3, ic: conF(MSR / MSE, n - 1, (n - 1) * (k - 1), true) },
            { clave: `CCI(1,${k})`, modelo: 'Un factor, efectos aleatorios', tipo: 'Acuerdo absoluto', medida: `Promedio de ${k}`, valor: (MSR - MSW) / MSR, ic: conF(MSR / MSW, n - 1, n * (k - 1), false) },
            { clave: `CCI(2,${k})`, modelo: 'Dos factores, efectos aleatorios', tipo: 'Acuerdo absoluto', medida: `Promedio de ${k}`, valor: (MSR - MSE) / (MSR + (MSC - MSE) / n), ic: [promedio(lo2), promedio(hi2)] },
            { clave: `CCI(3,${k})`, modelo: 'Dos factores, efectos mixtos', tipo: 'Consistencia', medida: `Promedio de ${k}`, valor: (MSR - MSE) / MSR, ic: conF(MSR / MSE, n - 1, (n - 1) * (k - 1), false) }
        ]
    };
}

export const interpretarKappa = k => (k < 0 ? 'pobre' : k <= 0.2 ? 'leve' : k <= 0.4 ? 'aceptable' : k <= 0.6 ? 'moderada' : k <= 0.8 ? 'considerable' : 'casi perfecta');   // Landis y Koch (1977)
export const interpretarCCI = v => (v < 0.5 ? 'pobre' : v < 0.75 ? 'moderada' : v < 0.9 ? 'buena' : 'excelente');   // Koo y Li (2016)
