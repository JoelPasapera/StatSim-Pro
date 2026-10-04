// analizador/psicometria/algebra.js — álgebra lineal propia para matrices simétricas (correlaciones de k ítems):
// autovalores por Jacobi cíclico, Cholesky, inversa de una matriz definida positiva y suavizado de una matriz de
// correlaciones que no es definida positiva (lo habitual con correlaciones policóricas estimadas por pares).

// A = V·diag(valores)·Vᵀ, con los autovalores de mayor a menor y `vectores[f]` el autovector del f-ésimo
export function eigenSimetrica(A) {
    const n = A.length;
    const a = A.map(f => Float64Array.from(f));
    const V = Array.from({ length: n }, (_, i) => { const f = new Float64Array(n); f[i] = 1; return f; });
    let norma = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) norma += a[i][j] * a[i][j];
    for (let barrido = 0; barrido < 100; barrido++) {
        let fuera = 0;
        for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) fuera += a[p][q] * a[p][q];
        if (fuera <= 1e-30 * norma || fuera === 0) break;
        for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) {
            const apq = a[p][q];
            if (Math.abs(apq) < 1e-300) continue;
            const theta = (a[q][q] - a[p][p]) / (2 * apq);
            const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
            const c = 1 / Math.sqrt(t * t + 1), s = t * c;
            for (let k = 0; k < n; k++) {
                if (k === p || k === q) continue;
                const akp = a[k][p], akq = a[k][q];
                a[k][p] = a[p][k] = c * akp - s * akq;
                a[k][q] = a[q][k] = s * akp + c * akq;
            }
            a[p][p] -= t * apq; a[q][q] += t * apq; a[p][q] = a[q][p] = 0;
            for (let k = 0; k < n; k++) { const vp = V[k][p], vq = V[k][q]; V[k][p] = c * vp - s * vq; V[k][q] = s * vp + c * vq; }
        }
    }
    const orden = Array.from({ length: n }, (_, i) => i).sort((i, j) => a[j][j] - a[i][i]);
    return { valores: orden.map(i => a[i][i]), vectores: orden.map(i => Float64Array.from(V, fila => fila[i])) };
}

// L tal que A = L·Lᵀ; null si A no es definida positiva
export function cholesky(A) {
    const n = A.length, L = Array.from({ length: n }, () => new Float64Array(n));
    for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
        let s = A[i][j];
        for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
        if (i === j) { if (!(s > 0)) return null; L[i][i] = Math.sqrt(s); } else L[i][j] = s / L[j][j];
    }
    return L;
}

// Inversa de una matriz simétrica definida positiva (por Cholesky); null si no lo es
export function inversaDefinidaPositiva(A) {
    const L = cholesky(A);
    if (!L) return null;
    const n = A.length, inv = Array.from({ length: n }, () => new Float64Array(n));
    for (let col = 0; col < n; col++) {
        const y = new Float64Array(n);
        for (let i = 0; i < n; i++) { let s = i === col ? 1 : 0; for (let k = 0; k < i; k++) s -= L[i][k] * y[k]; y[i] = s / L[i][i]; }
        for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k][i] * inv[k][col]; inv[i][col] = s / L[i][i]; }
    }
    return inv;
}

// Suavizado por autovalores: los menores que `minimo` pasan a `minimo` y la matriz se reescala a diagonal unitaria.
// Si ya es definida positiva (autovalor mínimo ≥ minimo) se devuelve intacta.
export function suavizarCorrelacion(R, minimo = 1e-6) {
    const { valores, vectores } = eigenSimetrica(R);
    const minAutovalor = valores[valores.length - 1];
    if (minAutovalor >= minimo) return { R: R.map(f => Array.from(f)), suavizada: false, minAutovalor };
    const n = R.length, e = valores.map(v => Math.max(v, minimo));
    const S = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => { let s = 0; for (let f = 0; f < n; f++) s += vectores[f][i] * e[f] * vectores[f][j]; return s; }));
    const d = S.map((f, i) => Math.sqrt(f[i]));
    return { R: S.map((f, i) => f.map((v, j) => (i === j ? 1 : v / (d[i] * d[j])))), suavizada: true, minAutovalor };
}

// ¿Es R − margen·I definida positiva? (todos los autovalores > margen) con un Cholesky: mucho más barato que Jacobi
export function definidaPositivaCon(R, margen = 1e-6) {
    return cholesky(R.map((f, i) => Array.from(f, (v, j) => (i === j ? v - margen : v)))) !== null;
}

export const traspuesta = A => A[0].map((_, j) => A.map(f => f[j]));
export const identidad = n => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
export function multiplicar(A, B) {
    const n = A.length, k = B.length, m = B[0].length;
    const C = Array.from({ length: n }, () => new Array(m).fill(0));
    for (let i = 0; i < n; i++) { const Ci = C[i], Ai = A[i]; for (let t = 0; t < k; t++) { const a = Ai[t]; if (a === 0) continue; const Bt = B[t]; for (let j = 0; j < m; j++) Ci[j] += a * Bt[j]; } }
    return C;
}
// Inversa de una matriz cuadrada cualquiera (Gauss–Jordan con pivoteo parcial); null si es singular
export function inversaGeneral(A) {
    const n = A.length, M = A.map((f, i) => [...f, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
    for (let c = 0; c < n; c++) {
        let piv = c;
        for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
        if (Math.abs(M[piv][c]) < 1e-14) return null;
        [M[c], M[piv]] = [M[piv], M[c]];
        const d = M[c][c];
        for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
        for (let r = 0; r < n; r++) if (r !== c && M[r][c] !== 0) { const f = M[r][c]; for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; }
    }
    return M.map(f => f.slice(n));
}
// Factor polar U·Vᵀ de X (la matriz ortogonal más cercana): X·(XᵀX)^(−1/2)
export function factorPolar(X) {
    const { valores, vectores } = eigenSimetrica(multiplicar(traspuesta(X), X));
    const n = X[0].length;
    const raizInv = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => { let s = 0; for (let f = 0; f < n; f++) s += vectores[f][i] * vectores[f][j] / Math.sqrt(valores[f]); return s; }));
    return multiplicar(X, raizInv);
}
// log|A| de una matriz definida positiva (por Cholesky); null si no lo es
export function logDeterminante(A) {
    const L = cholesky(A);
    if (!L) return null;
    let s = 0;
    for (let i = 0; i < A.length; i++) s += 2 * Math.log(L[i][i]);
    return s;
}

// Inversa y log-determinante de una matriz definida positiva con una sola factorización de Cholesky; null si no lo es
export function inversaYLogDet(A) {
    const L = cholesky(A);
    if (!L) return null;
    const n = A.length, inv = Array.from({ length: n }, () => new Float64Array(n));
    let logDet = 0;
    for (let i = 0; i < n; i++) logDet += 2 * Math.log(L[i][i]);
    for (let col = 0; col < n; col++) {
        const y = new Float64Array(n);
        for (let i = 0; i < n; i++) { let s = i === col ? 1 : 0; for (let k = 0; k < i; k++) s -= L[i][k] * y[k]; y[i] = s / L[i][i]; }
        for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k][i] * inv[k][col]; inv[i][col] = s / L[i][i]; }
    }
    return { inv, logDet };
}
