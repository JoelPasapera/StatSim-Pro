// simulador/dominio/seleccion.js — restricción de rango por selección de la muestra (Atlas de relaciones, dimensión B3;
// sin DOM). La base contiene solo a los seleccionados por su puntuación en X (el p superior o inferior de la población).
// La selección directa sobre X reduce su DE (u = DE seleccionada / DE poblacional) y atenúa sus correlaciones SIN cambiar
// la recta de regresión de Y sobre X (Thorndike, 1949, Caso II):
//   r = ρ·u / √(1 − ρ² + ρ²u²)      ρ = (r/u) / √(1 − r² + r²/u²)
// Lo esperado tras la selección se calcula con el propio modelo generador: drivers con la matriz intermedia (su
// factorización), selección por el driver de X y la forma de cada variable, en una simulación determinista; vale para
// cualquier forma marginal y, con formas normales, coincide con las fórmulas cerradas de Pearson y Lawley.
export const atenuarThorndike = (rho, u) => (rho * u) / Math.sqrt(1 - rho * rho + rho * rho * u * u);
export const corregirThorndike = (r, u) => (r / u) / Math.sqrt(1 - r * r + (r * r) / (u * u));
// fiabilidad tras la selección con la varianza de error constante: 1 − (1 − α)·σ²_pob/σ²_sel
export const alfaTrasSeleccion = (alfa, razonVarianzas) => 1 - (1 - alfa) / razonVarianzas;
// casos de la población que hay que generar para quedarse con n seleccionados
export const tamanoPoblacion = (n, p) => Math.ceil(n / p);

const RAIZ_2PI = Math.sqrt(2 * Math.PI);
// inversa de la normal (Acklam; error relativo < 1,2·10⁻⁹)
function normalInversa(q) {
    const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
    const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
    const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    if (q < 0.02425) { const t = Math.sqrt(-2 * Math.log(q)); return (((((c[0] * t + c[1]) * t + c[2]) * t + c[3]) * t + c[4]) * t + c[5]) / ((((d[0] * t + d[1]) * t + d[2]) * t + d[3]) * t + 1); }
    if (q > 1 - 0.02425) return -normalInversa(1 - q);
    const t = q - 0.5, r = t * t;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * t / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}
// u con X normal (fórmula cerrada de la normal truncada): la usa la nota de la interfaz
export function uSeleccionNormal(p) {
    const c = normalInversa(1 - p), lambda = Math.exp(-0.5 * c * c) / RAIZ_2PI / p;
    return Math.sqrt(Math.max(0, 1 + c * lambda - lambda * lambda));
}
// índices (en orden de generación) de los n casos con los valores más altos (o más bajos) de la variable de selección
export function indicesSeleccionados(valores, n, lado) {
    const idx = Array.from({ length: valores.length }, (_, i) => i);
    idx.sort((a, b) => (lado === 'inferior' ? valores[a] - valores[b] : valores[b] - valores[a]) || a - b);
    return idx.slice(0, n).sort((a, b) => a - b);
}
// Lo esperado tras la selección, en unidades estandarizadas de cada variable (media 0 y DE 1 en la población): medias, DE y
// correlaciones de las formas transformadas. R* = L·Lᵀ se reordena con X delante: su factorización da Z_X = ε₀ y el resto
// condicionado a ε₀, así que la cola seleccionada se muestrea DIRECTAMENTE, sin rechazo, con cuantiles estratificados de
// la normal truncada (los momentos de X salen casi exactos y el coste no depende de p); solo los residuos son aleatorios.
// Con k = 100 000, el error de Monte Carlo de una r entre variables no seleccionadas es ≈ (1 − r²)/√k ≈ .003
export const K_ESPERADO = 100000;
export function esperadoTrasSeleccion({ L, iSeleccion, lado, p, transformaciones, k = K_ESPERADO, semilla = 20261108 }) {
    const m = L.length, orden = [iSeleccion, ...Array.from({ length: m }, (_, i) => i).filter(i => i !== iSeleccion)];
    const R = (i, j) => { let s = 0; for (let t = 0; t <= Math.min(i, j); t++) s += L[i][t] * L[j][t]; return s; };
    const Lp = orden.map(() => new Float64Array(m));
    for (let i = 0; i < m; i++) for (let j = 0; j <= i; j++) {
        let s = R(orden[i], orden[j]); for (let t = 0; t < j; t++) s -= Lp[i][t] * Lp[j][t];
        Lp[i][j] = i === j ? Math.sqrt(Math.max(1e-12, s)) : s / Lp[j][j];
    }
    let estado = semilla >>> 0;
    const u01 = () => { estado = (estado + 0x6D2B79F5) >>> 0; let t = estado; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    let reserva = null;
    const normal = () => { if (reserva !== null) { const v = reserva; reserva = null; return v; } const r = Math.sqrt(-2 * Math.log(u01() || 1e-300)), a = 2 * Math.PI * u01(); reserva = r * Math.sin(a); return r * Math.cos(a); };
    // se guardan los valores (k × m) para los momentos de cuarto orden: la cola seleccionada es asimétrica (tiende a una
    // exponencial cuanto más extrema) y sus estadísticos varían más que en una normal (revisión 2026.11.09: con errores
    // típicos de la normal, 2 de 20 informes daban una falsa alarma con el 20 % inferior)
    const valores = new Float64Array(k * m), z = new Float64Array(m), s1 = new Float64Array(m);
    for (let c = 0; c < k; c++) {
        const q = (c + 0.5) / k;
        z[0] = lado === 'inferior' ? normalInversa(p * q) : normalInversa(1 - p + p * q);
        for (let i = 1; i < m; i++) z[i] = normal();
        for (let i = 0; i < m; i++) { let s = 0; for (let j = 0; j <= i; j++) s += Lp[i][j] * z[j]; const t = transformaciones[orden[i]](s); valores[c * m + orden[i]] = t; s1[orden[i]] += t; }
    }
    const medias = Array.from(s1, s => s / k), c2 = new Float64Array(m * m);
    for (let c = 0; c < k; c++) for (let i = 0; i < m; i++) { const di = valores[c * m + i] - medias[i]; for (let j = 0; j <= i; j++) c2[i * m + j] += di * (valores[c * m + j] - medias[j]); }
    const cov = (i, j) => c2[Math.max(i, j) * m + Math.min(i, j)] / k, des = medias.map((_, i) => Math.sqrt(Math.max(0, cov(i, i))));
    const corr = medias.map((_, i) => medias.map((__, j) => (i === j ? 1 : cov(i, j) / (des[i] * des[j] || 1))));
    // momentos de las variables ESTANDARIZADAS: curtosis κ de cada una y, por pareja, el factor de la varianza asintótica de r
    // con datos no normales: (1 + r²/2)·μ22 − r·(μ31 + μ13) + (r²/4)·(μ40 + μ04), que con normales es (1 − r²)²
    const m4 = new Float64Array(m), m22 = new Float64Array(m * m), m31 = new Float64Array(m * m);
    for (let c = 0; c < k; c++) for (let i = 0; i < m; i++) {
        const xi = (valores[c * m + i] - medias[i]) / (des[i] || 1), xi2 = xi * xi;
        m4[i] += xi2 * xi2;
        for (let j = 0; j < m; j++) { if (j === i) continue; const xj = (valores[c * m + j] - medias[j]) / (des[j] || 1); m22[i * m + j] += xi2 * xj * xj; m31[i * m + j] += xi2 * xi * xj; }
    }
    const curtosis = Array.from(m4, s => s / k);
    const factorR = (i, j) => { const r = corr[i][j], u22 = m22[i * m + j] / k, u31 = m31[i * m + j] / k, u13 = m31[j * m + i] / k; return Math.max(1e-6, (1 + r * r / 2) * u22 - r * (u31 + u13) + (r * r / 4) * (curtosis[i] + curtosis[j])); };
    return {
        medias, des, corr, k, curtosis,
        // errores típicos de muestreo con n casos (en unidades estandarizadas de la variable para la DE)
        eeDE: (i, n) => des[i] * Math.sqrt(Math.max(0, curtosis[i] - 1) / (4 * n)),
        eeR: (i, j, n) => Math.sqrt(factorR(i, j) / n)
    };
}
