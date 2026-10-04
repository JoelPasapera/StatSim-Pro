// analizador/psicometria/clasica.js — α de Cronbach y ω de McDonald clásicos (correlaciones de Pearson), con la misma
// aritmética que la tabla de fiabilidad: fiabilidad.js los usa desde aquí y el Worker del bootstrap también, así el
// intervalo de confianza se calcula sobre exactamente el mismo estadístico que se reporta.

export const media = v => v.reduce((s, x) => s + x, 0) / v.length;
export function varianza(v) {   // muestral (n − 1)
    const m = media(v);
    return v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1);
}
export function covarianza(a, b) {
    const ma = media(a), mb = media(b);
    let s = 0;
    for (let i = 0; i < a.length; i++) s += (a[i] - ma) * (b[i] - mb);
    return s / (a.length - 1);
}
export function correlacion(a, b) {
    const c = covarianza(a, b), va = varianza(a), vb = varianza(b);
    return (va > 0 && vb > 0) ? c / Math.sqrt(va * vb) : 0;
}

// ω unifactorial por ejes principales (autovector dominante por potencias) sobre la matriz de correlaciones
export function omegaUnifactorial(R, k) {
    if (k < 3) return { ok: false, motivo: null }; // k=2: se reporta Spearman-Brown
    // comunalidades iniciales: máxima |r| de cada fila
    let h2 = R.map((fila, i) => Math.max(...fila.map((r, j) => i === j ? 0 : Math.abs(r))));
    let cargas = null;
    for (let iter = 0; iter < 50; iter++) {
        const Rr = R.map((fila, i) => fila.map((r, j) => i === j ? h2[i] : r));
        // autovector dominante por el método de las potencias
        let v = new Array(k).fill(1 / Math.sqrt(k)), lambda = 0;
        for (let p = 0; p < 100; p++) {
            const w = Rr.map(fila => fila.reduce((s, r, j) => s + r * v[j], 0));
            const norma = Math.sqrt(w.reduce((s, x) => s + x * x, 0));
            if (!(norma > 0)) return { ok: false, motivo: 'El ω no se reporta: la solución factorial no es estimable con estos datos.' };
            const vNuevo = w.map(x => x / norma);
            lambda = norma;
            v = vNuevo;
        }
        if (!(lambda > 0)) return { ok: false, motivo: 'El ω no se reporta: la solución factorial no es estimable con estos datos.' };
        // Signo global alineado (convención: suma positiva); el signo
        // INDIVIDUAL de cada carga se conserva para detectar ítems inversos.
        const signoGlobal = v.reduce((s, x) => s + x, 0) >= 0 ? 1 : -1;
        const nuevas = v.map(x => Math.sqrt(lambda) * x * signoGlobal);
        if (nuevas.some(l => l < -0.05)) {
            return { ok: false, motivo: 'El ω no se reporta: existen cargas factoriales de signo mixto. Examine el origen de las correlaciones negativas señaladas (formulación inversa, redacción deficiente, multidimensionalidad, errores de captura o constructo distinto) antes de cualquier recodificación.' };
        }
        const cambio = Math.max(...nuevas.map((c, i) => Math.abs(c * c - h2[i])));
        h2 = nuevas.map(c => Math.min(c * c, 0.999));
        cargas = nuevas;
        if (cambio < 1e-6) break;
    }
    const heywood = cargas.some(l => l * l >= 0.999);
    const sumaCargas = cargas.reduce((s, l) => s + Math.max(l, 0), 0);
    const sumaUnicidades = cargas.reduce((s, l) => s + (1 - Math.min(l * l, 0.999)), 0);
    const om = (sumaCargas ** 2) / ((sumaCargas ** 2) + sumaUnicidades);
    if (!(om > 0 && om <= 1)) return { ok: false, motivo: 'El ω no se reporta: la solución factorial produjo un valor fuera de rango.' };
    return { ok: true, valor: om, cargas, motivo: heywood ? 'La solución del ω presenta un caso Heywood (comunalidad en el límite); el valor debe tomarse como orientativo.' : null };
}

// ω en la métrica de la puntuación total observada: cargas y unicidades reescaladas por las DE de los ítems
export function omegaObservado(om, vars) {
    if (!(om && om.ok)) return { omega: null, omegaStd: null };
    const des = vars.map(vv => Math.sqrt(vv));
    const lCov = om.cargas.map((l, i) => Math.max(l, 0) * des[i]);
    const thCov = om.cargas.map((l, i) => (1 - Math.min(l * l, 0.999)) * vars[i]);
    const sl = lCov.reduce((s, x) => s + x, 0);
    const st = thCov.reduce((s, x) => s + x, 0);
    const oc = (sl * sl) / ((sl * sl) + st);
    return { omega: (oc > 0 && oc <= 1) ? oc : om.valor, omegaStd: om.valor };
}

// α y ω de un conjunto de columnas completas (sin excluir ítems: el llamador decide qué hacer con los constantes)
export function coeficientesClasicos(cols) {
    const k = cols.length, n = cols[0].length;
    const vars = cols.map(c => varianza(c));
    const total = new Array(n).fill(0);
    for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < k; j++) s += cols[j][i]; total[i] = s; }
    const varTotal = varianza(total);
    if (!(varTotal > 0)) return { alfa: null, omega: null, omegaStd: null };
    // misma aritmética que correlacion(), con medias y varianzas calculadas una sola vez por ítem (resultado idéntico
    // bit a bit y la mitad de trabajo: el bootstrap repite esto cientos de veces)
    const medias = cols.map(c => media(c)), R = Array.from({ length: k }, () => new Array(k).fill(1));
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
        const a = cols[i], bb = cols[j], ma = medias[i], mb = medias[j];
        let s = 0;
        for (let t = 0; t < n; t++) s += (a[t] - ma) * (bb[t] - mb);
        const c = s / (n - 1);
        R[i][j] = R[j][i] = (vars[i] > 0 && vars[j] > 0) ? c / Math.sqrt(vars[i] * vars[j]) : 0;
    }
    const alfa = (k / (k - 1)) * (1 - vars.reduce((s, v) => s + v, 0) / varTotal);
    return { alfa, ...omegaObservado(omegaUnifactorial(R, k), vars) };
}

// Matriz de correlaciones de Pearson de unas columnas completas (misma aritmética que coeficientesClasicos)
export function matrizCorrelaciones(cols) {
    const k = cols.length, n = cols[0].length;
    const medias = cols.map(c => media(c)), vars = cols.map(c => varianza(c));
    const R = Array.from({ length: k }, () => new Array(k).fill(1));
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
        const a = cols[i], b = cols[j], ma = medias[i], mb = medias[j];
        let s = 0;
        for (let t = 0; t < n; t++) s += (a[t] - ma) * (b[t] - mb);
        R[i][j] = R[j][i] = (vars[i] > 0 && vars[j] > 0) ? (s / (n - 1)) / Math.sqrt(vars[i] * vars[j]) : 0;
    }
    return R;
}
