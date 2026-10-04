#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""afe_oraculo.py — referencia independiente del paso 3 (AFE) con NumPy/SciPy: KMO y MSA, Bartlett (chi2.sf),
autovalores (eigh), análisis paralelo por permutaciones con el mismo generador sfc32 (reescrito aquí), ejes
principales iterados, rotaciones por gradiente proyectado (fórmulas de GPArotation: oblimin γ = 0 y varimax, con
normalización de Kaiser; factor polar por SVD) y promax como stats::promax de R. Escribe afe_fixture.json."""
import json
import numpy as np
from scipy.stats import chi2

M32 = 0xFFFFFFFF
class Aleatorio:
    def __init__(self, s):
        self.s = s & M32; self.a, self.b, self.c, self.d = (self._m() for _ in range(4))
        for _ in range(12): self.u32()
    def _m(self):
        self.s = (self.s + 0x9e3779b9) & M32; z = self.s
        z = ((z ^ (z >> 16)) * 0x85ebca6b) & M32; z = ((z ^ (z >> 13)) * 0xc2b2ae35) & M32
        return (z ^ (z >> 16)) & M32
    def u32(self):
        t = (self.a + self.b) & M32; self.a = (self.b ^ (self.b >> 9)) & M32; self.b = (self.c + (self.c << 3)) & M32
        self.c = ((self.c << 21) | (self.c >> 11)) & M32; self.d = (self.d + 1) & M32; t = (t + self.d) & M32; self.c = (self.c + t) & M32
        return t
    def entero(self, n): return (self.u32() * n) >> 32

def kmo(R):
    inv = np.linalg.inv(R); d = np.sqrt(np.diag(inv)); P = -inv / np.outer(d, d)
    np.fill_diagonal(P, 0); R0 = R - np.eye(len(R)); r2, a2 = (R0 ** 2).sum(axis=1), (P ** 2).sum(axis=1)
    return float(r2.sum() / (r2.sum() + a2.sum())), (r2 / (r2 + a2)).tolist()

def bartlett(R, n):
    p = len(R); sign, lndet = np.linalg.slogdet(R); x2 = -(n - 1 - (2 * p + 5) / 6) * lndet; gl = p * (p - 1) / 2
    return float(x2), gl, float(chi2.sf(x2, gl))

def paralelo(X, B, semilla):
    g = Aleatorio(semilla); P = X.copy().astype(float); n, p = P.shape; vals = []
    for _ in range(B):
        for j in range(p):
            v = P[:, j]
            for i in range(n - 1, 0, -1):
                r = g.entero(i + 1); v[i], v[r] = v[r], v[i]
        vals.append(np.sort(np.linalg.eigvalsh(np.corrcoef(P, rowvar=False)))[::-1])
    V = np.array(vals); return V.mean(axis=0).tolist(), np.quantile(V, 0.95, axis=0).tolist()

def ejes_principales(R, m, maxit=1000, tol=1e-10):
    p = len(R)
    try: np.linalg.cholesky(R); h2 = np.clip(1 - 1 / np.diag(np.linalg.inv(R)), 0.005, 0.999)
    except np.linalg.LinAlgError: h2 = np.clip([np.max(np.abs(np.delete(R[i], i))) for i in range(p)], 0.005, 0.999)
    for _ in range(maxit):
        Rr = R.copy(); np.fill_diagonal(Rr, h2); w, V = np.linalg.eigh(Rr); idx = np.argsort(w)[::-1][:m]
        A = V[:, idx] * np.sqrt(np.maximum(w[idx], 0)); nuevo = np.minimum((A ** 2).sum(axis=1), 0.999)
        cambio = np.max(np.abs(nuevo - h2)); h2 = nuevo
        if cambio < tol: break
    A = A * np.where(A.sum(axis=0) < 0, -1, 1); return A, h2

def vgq_quartimin(L):
    L2 = L ** 2; X = L2 @ (np.ones((L.shape[1],) * 2) - np.eye(L.shape[1])); return (L2 * X).sum() / 4, L * X
def vgq_varimax(L):
    QL = L ** 2 - (L ** 2).mean(axis=0); return -(QL ** 2).sum() / 4, -L * QL

def gp_oblicua(A, vgq, eps=1e-6, maxit=5000):
    m = A.shape[1]; T = np.eye(m); al = 1.0; L = A @ np.linalg.inv(T).T; f, Gq = vgq(L); G = -(L.T @ Gq @ np.linalg.inv(T)).T
    for _ in range(maxit + 1):
        Gp = G - T @ np.diag((T * G).sum(axis=0)); s = np.sqrt((Gp ** 2).sum())
        if s < eps: break
        al *= 2
        for _ in range(11):
            X = T - al * Gp; Tt = X / np.sqrt((X ** 2).sum(axis=0)); L = A @ np.linalg.inv(Tt).T; ft, Gqt = vgq(L)
            if f - ft > 0.5 * s * s * al: break
            al /= 2
        T, f = Tt, ft; G = -(L.T @ Gqt @ np.linalg.inv(T)).T
    return L, T.T @ T

def gp_ortogonal(A, vgq, eps=1e-6, maxit=5000):
    m = A.shape[1]; T = np.eye(m); al = 1.0; L = A @ T; f, Gq = vgq(L); G = A.T @ Gq
    for _ in range(maxit + 1):
        Mx = T.T @ G; S = (Mx + Mx.T) / 2; Gp = G - T @ S; s = np.sqrt((Gp ** 2).sum())
        if s < eps: break
        al *= 2
        for _ in range(11):
            U, _, Vt = np.linalg.svd(T - al * Gp); Tt = U @ Vt; L = A @ Tt; ft, Gqt = vgq(L)
            if ft < f - 0.5 * s * s * al: break
            al /= 2
        T, f = Tt, ft; G = A.T @ Gqt
    return L, T

def kaiser(A, rot):
    w = np.sqrt((A ** 2).sum(axis=1)); res = rot(A / w[:, None]); return (res[0] * w[:, None],) + tuple(res[1:])

def promax(A):
    x, Tv = kaiser(A, lambda X: gp_ortogonal(X, vgq_varimax)); Q = x * np.abs(x) ** 3
    U = np.linalg.lstsq(x, Q, rcond=None)[0]; d = np.diag(np.linalg.inv(U.T @ U)); U = U * np.sqrt(d)
    Ut = Tv @ U; Ui = np.linalg.inv(Ut); return x @ U, Ui @ Ui.T

def ordenar(L, Phi):
    ss = (L ** 2).sum(axis=0); o = np.argsort(-ss, kind='stable'); L2, Ph = L[:, o], Phi[np.ix_(o, o)]
    sg = np.where(L2.sum(axis=0) < 0, -1.0, 1.0); return L2 * sg, Ph * np.outer(sg, sg)

rng = np.random.default_rng(20261010)
n = 400; cargas = np.array([.75, .7, .65, .6, .7, .65, .6, .55, .8, .7, .6, .5]); fac = np.repeat([0, 1, 2], 4)
gen = rng.standard_normal(n); F = 0.55 * gen[:, None] + 0.835 * rng.standard_normal((n, 3))
Z = cargas * F[:, fac] + np.sqrt(1 - cargas ** 2) * rng.standard_normal((n, 12))
X = np.searchsorted(np.array([-1.0, -0.3, 0.4, 1.2]), Z) + 1
R = np.corrcoef(X, rowvar=False)
k, msa = kmo(R); x2, gl, pb = bartlett(R, n); media, p95 = paralelo(X, 100, 7)
aut = np.sort(np.linalg.eigvalsh(R))[::-1]; m = 0
while m < len(aut) and aut[m] > p95[m]: m += 1
A, h2 = ejes_principales(R, m)
Lo, Po = ordenar(*kaiser(A, lambda M: gp_oblicua(M, vgq_quartimin)))
Lv, Tv = kaiser(A, lambda M: gp_ortogonal(M, vgq_varimax)); Lv, Pv = ordenar(Lv, np.eye(m))
Lp, Pp = ordenar(*promax(A))
fixture = {'cols': X.T.tolist(), 'kmo': k, 'msa': msa, 'bartlett': [x2, gl, pb], 'autovalores': aut.tolist(), 'paraleloMedia': media, 'paraleloP95': p95,
           'm': m, 'cargasSinRotar': A.tolist(), 'comunalidades': h2.tolist(), 'oblimin': {'L': Lo.tolist(), 'Phi': Po.tolist()},
           'varimax': {'L': Lv.tolist()}, 'promax': {'L': Lp.tolist(), 'Phi': Pp.tolist()}}
with open('afe_fixture.json', 'w', encoding='utf-8') as fh: json.dump(fixture, fh)
print(f'afe_fixture.json escrito: 12 ítems, n = {n}, KMO = {k:.3f}, paralelo (B = 100) → {m} factores, oblimin, varimax y promax')
