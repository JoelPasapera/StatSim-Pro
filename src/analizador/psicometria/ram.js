// analizador/psicometria/ram.js — álgebra del modelo RAM (McArdle y McDonald, 1984) para el motor SEM:
//   Σ(θ) = F·B·S·Bᵀ·Fᵀ con B = (I − A)⁻¹;  F_ML = ln|Σ| + tr(S_obs·Σ⁻¹) − ln|S_obs| − p
// Gradiente analítico: con W = Σ⁻¹ − Σ⁻¹·S_obs·Σ⁻¹, G = Fᵀ·W·F y E = B·S·Bᵀ,
//   ∂F/∂A_ij = 2·(Bᵀ·G·E)_ij   y   ∂F/∂S_ij = (Bᵀ·G·B)_ij (×2 fuera de la diagonal, por simetría)
// Información esperada (ML): I_ab = (n − 1)/2 · tr(Σ⁻¹·Δ_a·Σ⁻¹·Δ_b), con Δ_a = ∂Σ/∂θ_a.
import { multiplicar, traspuesta, inversaGeneral, inversaDefinidaPositiva } from './algebra.js';

export function aplicarTheta(est, theta) {
    const A = est.A.map(f => f.slice()), S = est.S.map(f => f.slice());
    est.libres.forEach((p, k) => { if (p.mat === 'A') A[p.i][p.j] = theta[k]; else { S[p.i][p.j] = theta[k]; S[p.j][p.i] = theta[k]; } });
    return { A, S };
}

export function implicada(est, theta) {
    const { A, S } = aplicarTheta(est, theta);
    const B = inversaGeneral(A.map((f, i) => f.map((v, j) => (i === j ? 1 : 0) - v)));
    if (!B) return null;
    const E = multiplicar(multiplicar(B, S), traspuesta(B)), p = est.nObs;
    return { B, E, Sigma: E.slice(0, p).map(f => f.slice(0, p)) };
}

export function gradienteFML(est, theta, S_obs) {
    const m = implicada(est, theta);
    const Si = m && inversaDefinidaPositiva(m.Sigma);
    if (!Si) return est.libres.map(() => NaN);
    const p = est.nObs, nv = m.B.length;
    const SiSSi = multiplicar(multiplicar(Si, S_obs), Si);
    const G = Array.from({ length: nv }, (_, i) => Array.from({ length: nv }, (_, j) => (i < p && j < p ? Si[i][j] - SiSSi[i][j] : 0)));
    const BtG = multiplicar(traspuesta(m.B), G), gA = multiplicar(BtG, m.E), gS = multiplicar(BtG, m.B);
    return est.libres.map(pl => (pl.mat === 'A' ? 2 * gA[pl.i][pl.j] : pl.i === pl.j ? gS[pl.i][pl.i] : 2 * gS[pl.i][pl.j]));
}

// ∂Σ/∂θ_k de cada parámetro libre (matrices p × p)
export function derivadasSigma(est, m) {
    const p = est.nObs;
    return est.libres.map(pl => {
        const D = Array.from({ length: p }, () => new Array(p).fill(0));
        if (pl.mat === 'A') {   // B·J_ij·E + su traspuesta
            for (let r = 0; r < p; r++) { const b = m.B[r][pl.i]; if (b) for (let c = 0; c < p; c++) D[r][c] += b * m.E[pl.j][c]; }
            for (let r = 0; r < p; r++) for (let c = r; c < p; c++) { const v = D[r][c] + D[c][r]; D[r][c] = D[c][r] = v; }
        } else {                // B·(J_ij + J_ji)·Bᵀ (o B·J_ii·Bᵀ)
            for (let r = 0; r < p; r++) for (let c = 0; c < p; c++) D[r][c] = m.B[r][pl.i] * m.B[c][pl.j] + (pl.i !== pl.j ? m.B[r][pl.j] * m.B[c][pl.i] : 0);
        }
        return D;
    });
}

export function informacionEsperada(est, theta, n) {
    const m = implicada(est, theta);
    const Si = m && inversaDefinidaPositiva(m.Sigma);
    if (!Si) return null;
    const SiD = derivadasSigma(est, m).map(D => multiplicar(Si, D)), q = SiD.length, p = est.nObs;
    const I = Array.from({ length: q }, () => new Array(q).fill(0));
    for (let a = 0; a < q; a++) for (let b = a; b < q; b++) {
        let tr = 0;
        const X = SiD[a], Y = SiD[b];
        for (let r = 0; r < p; r++) for (let c = 0; c < p; c++) tr += X[r][c] * Y[c][r];
        I[a][b] = I[b][a] = ((n - 1) / 2) * tr;
    }
    return I;
}

// Errores estándar = √diag(I⁻¹); null si la información no es invertible (modelo no identificado empíricamente)
export function erroresInformacion(est, theta, n) {
    const I = informacionEsperada(est, theta, n), inv = I && inversaDefinidaPositiva(I);
    return inv ? inv.map((f, i) => (f[i] > 0 ? Math.sqrt(f[i]) : NaN)) : null;
}
