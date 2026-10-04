#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ordinal_oraculo.py — valores de referencia del paso 2 (ítems ordinales y dicotómicos) con NumPy/SciPy, sin usar
nada del sitio: Φ (scipy), Φ₂ por integración adaptativa (y verificada contra la fórmula de Owen con owens_t),
correlaciones policóricas/tetracóricas por la ecuación de puntuación (brentq), suavizado por autovalores (eigh),
ejes principales de un factor y α/ω ordinales. Escribe ordinal_fixture.json; lo compara tests/unit/ordinal.test.js."""
import json
from math import inf, sqrt
import numpy as np
from scipy.stats import norm
from scipy.integrate import quad
from scipy.optimize import brentq, minimize_scalar
from scipy.special import owens_t

def Phi2(h, k, r):
    if h == -inf or k == -inf: return 0.0
    if h == inf: return float(norm.cdf(k))
    if k == inf: return float(norm.cdf(h))
    s = sqrt(1 - r * r)
    val, _ = quad(lambda x: norm.pdf(x) * norm.cdf((k - r * x) / s), -inf, h, epsabs=1e-15, epsrel=1e-13, limit=400)
    return val

def Phi2_owen(h, k, r):   # Owen (1956); solo h, k ≠ 0
    s = sqrt(1 - r * r)
    beta = 0.0 if h * k > 0 else 0.5
    return 0.5 * norm.cdf(h) + 0.5 * norm.cdf(k) - owens_t(h, (k - r * h) / (h * s)) - owens_t(k, (h - r * k) / (k * s)) - beta

def Phi2_rapida(h, k, r):
    # para la estimación: fórmula de Owen (1956) con owens_t (precisión de doble); la integración adaptativa solo si
    # un argumento es 0, donde la fórmula no está definida. Método independiente del algoritmo del sitio.
    if h == -inf or k == -inf: return 0.0
    if h == inf: return float(norm.cdf(k))
    if k == inf: return float(norm.cdf(h))
    if h == 0 or k == 0: return Phi2(h, k, r)
    return float(Phi2_owen(h, k, r))

def phi2(h, k, r):
    if not (np.isfinite(h) and np.isfinite(k)): return 0.0
    s = 1 - r * r
    return float(np.exp(-(h * h - 2 * r * h * k + k * k) / (2 * s)) / (2 * np.pi * sqrt(s)))

def umbrales(frec):
    t = float(sum(frec)); acum = np.cumsum(frec)[:-1] / t
    return [-inf] + [float(norm.ppf(p)) for p in acum] + [inf]

def tabla(x, y):
    cx, cy = sorted(set(x)), sorted(set(y)); ix = {v: i for i, v in enumerate(cx)}; iy = {v: j for j, v in enumerate(cy)}
    n = np.zeros((len(cx), len(cy)))
    for a, b in zip(x, y): n[ix[a], iy[b]] += 1
    return n

def puntuacion(n, a, b, r):
    I, J = len(a), len(b); G = np.zeros((I, J)); D = np.zeros((I, J))
    for i in range(1, I):
        for j in range(1, J):
            if i == I - 1: G[i, j] = norm.cdf(b[j])
            elif j == J - 1: G[i, j] = norm.cdf(a[i])
            else: G[i, j] = Phi2_rapida(a[i], b[j], r); D[i, j] = phi2(a[i], b[j], r)
    s = 0.0
    for i in range(I - 1):
        for j in range(J - 1):
            if n[i, j] == 0: continue
            p = G[i + 1, j + 1] - G[i, j + 1] - G[i + 1, j] + G[i, j]
            dp = D[i + 1, j + 1] - D[i, j + 1] - D[i + 1, j] + D[i, j]
            s += n[i, j] * dp / max(p, 1e-300)
    return s

R_MAX = 0.9999
def logver(n, a, b, r):
    I, J = len(a), len(b); L = 0.0
    for i in range(I - 1):
        for j in range(J - 1):
            if n[i, j] == 0: continue
            p = Phi2_rapida(a[i + 1], b[j + 1], r) - Phi2_rapida(a[i], b[j + 1], r) - Phi2_rapida(a[i + 1], b[j], r) + Phi2_rapida(a[i], b[j], r)
            L += n[i, j] * np.log(max(p, 1e-300))
    return L

def policorica(x, y):
    n = tabla(x, y); a = umbrales(n.sum(axis=1)); b = umbrales(n.sum(axis=0))
    if n.shape == (2, 2):   # tetracórica: Φ₂(a₁, b₁; ρ) = n₁₁/N, monótona en ρ
        if n[0, 1] == 0 or n[1, 0] == 0: return R_MAX       # celda vacía: la MV está en el límite
        if n[0, 0] == 0 or n[1, 1] == 0: return -R_MAX
        g = lambda r: Phi2_rapida(a[1], b[1], r) - n[0, 0] / n.sum()
        return brentq(g, -R_MAX, R_MAX, xtol=1e-15, rtol=8.9e-16, maxiter=300)
    x0 = minimize_scalar(lambda r: -logver(n, a, b, r), bounds=(-R_MAX, R_MAX), method='bounded', options={'xatol': 1e-10}).x
    lo, hi = max(-R_MAX, x0 - 1e-3), min(R_MAX, x0 + 1e-3)
    if puntuacion(n, a, b, lo) > 0 and puntuacion(n, a, b, hi) < 0:
        return brentq(lambda r: puntuacion(n, a, b, r), lo, hi, xtol=1e-15, rtol=8.9e-16, maxiter=300)
    return x0

def suavizar(R, minimo=1e-6):
    w, V = np.linalg.eigh(R)
    if w.min() >= minimo: return R.copy(), False
    S = V @ np.diag(np.maximum(w, minimo)) @ V.T; d = np.sqrt(np.diag(S)); S = S / np.outer(d, d); np.fill_diagonal(S, 1.0)
    return S, True

def ejes_principales_1(R, maxit=1000, tol=1e-10):
    k = len(R)
    try:
        np.linalg.cholesky(R); h2 = np.clip(1 - 1 / np.diag(np.linalg.inv(R)), 0.005, 0.999)
    except np.linalg.LinAlgError:
        h2 = np.clip(np.array([np.max(np.abs(np.delete(R[i], i))) for i in range(k)]), 0.005, 0.999)
    heywood = False
    for _ in range(maxit):
        Rr = R.copy(); np.fill_diagonal(Rr, h2)
        w, V = np.linalg.eigh(Rr); i = int(np.argmax(w)); lam = V[:, i] * sqrt(max(w[i], 0.0))
        nuevo = lam ** 2
        if (nuevo > 0.999).any(): heywood = True
        nuevo = np.minimum(nuevo, 0.999); cambio = np.max(np.abs(nuevo - h2)); h2 = nuevo
        if cambio < tol: break
    if lam.sum() < 0: lam = -lam
    return lam, h2, heywood

def ordinal(cols):
    k = len(cols); R = np.eye(k)
    for i in range(k):
        for j in range(i + 1, k): R[i, j] = R[j, i] = policorica(cols[i], cols[j])
    rbar = R[np.triu_indices(k, 1)].mean(); alfa = k * rbar / (1 + (k - 1) * rbar)
    S, suav = suavizar(R); lam, h2, hey = ejes_principales_1(S); s = lam.sum()
    return {'R': R.tolist(), 'alfa': float(alfa), 'omega': float(s * s / (s * s + (1 - h2).sum())), 'cargas': lam.tolist(), 'suavizada': bool(suav), 'heywood': bool(hey)}

rng = np.random.default_rng(20261007)
def simular(n, cargas, cortes_por_item):
    f = rng.standard_normal(n); cols = []
    for lam, cortes in zip(cargas, cortes_por_item):
        z = lam * f + sqrt(1 - lam * lam) * rng.standard_normal(n)
        cols.append([int(v) for v in np.searchsorted(np.array(cortes), z) + 1])
    return cols

conjuntos = {
    'likert5': simular(300, [0.8, 0.7, 0.6, 0.55, 0.75], [[-1.5, -0.5, 0.4, 1.3], [-1.2, -0.2, 0.6, 1.5], [-0.3, 0.5, 1.2, 2.0], [-2.0, -1.0, 0.0, 1.0], [-1.0, -0.3, 0.3, 1.0]]),
    'dicotomicos': simular(400, [0.7, 0.6, 0.8, 0.5, 0.65, 0.75], [[-0.5], [0.3], [0.0], [1.0], [-1.2], [0.6]]),
    'tres_categorias': simular(150, [0.6, 0.5, 0.7, 0.45], [[-0.8, 0.5], [-0.2, 1.0], [-1.0, 0.2], [0.0, 1.3]])
}
def pares(t):   # tabla de contingencia → pares (x, y)
    x, y = [], []
    for i, fila in enumerate(t):
        for j, c in enumerate(fila): x += [i + 1] * c; y += [j + 1] * c
    return x, y
tablas = [[[40, 10], [10, 40]], [[30, 5, 1], [10, 20, 8], [2, 9, 25]], [[12, 0, 0, 3], [5, 18, 2, 0], [0, 7, 21, 9]], [[3, 1], [0, 46]], [[5, 10, 20], [20, 10, 5]]]
casos_poli = [{'tabla': t, 'rho': float(policorica(*pares(t)))} for t in tablas]

hs = [-3.0, -1.2, -0.3, 0.5, 1.7, 3.1]; rs = [-0.97, -0.6, -0.2, 0.1, 0.45, 0.8, 0.93, 0.999]
phi2_puntos = []
for h in hs:
    for k in hs:
        for r in rs:
            v = Phi2(h, k, r); ow = Phi2_owen(h, k, r)
            assert abs(v - ow) < 5e-12, (h, k, r, v, ow)
            phi2_puntos.append({'h': h, 'k': k, 'r': r, 'p': v})
xs = [-38.0, -20.0, -8.0, -5.7, -3.0, -1.0, -0.6, -1e-9, 0.0, 0.3, 0.67, 1.96, 4.0, 6.0, 8.2, 12.0]
try:
    import mpmath
except ImportError:   # sin mpmath no se puede fijar Φ a 40 dígitos: se conserva el fixture actual
    print('mpmath no disponible: se conserva ordinal_fixture.json (instálalo con «pip install mpmath» para regenerarlo)')
    raise SystemExit(0)
mpmath.mp.dps = 40   # Φ de referencia con 40 dígitos (Cephes pierde algunos en la cola extrema)
phi_ref = lambda x: (float(mpmath.ncdf(x)), float(mpmath.ncdf(-x)))
noPD = np.array([[1, .9, -.9], [.9, 1, .9], [-.9, .9, 1]]); S, _ = suavizar(noPD)
lam_ex = [0.8, 0.7, 0.6, 0.5]
fixture = {
    'phi': [{'x': x, 'p': phi_ref(x)[0], 'q': phi_ref(x)[1]} for x in xs],
    'phi2': phi2_puntos,
    'policoricas': casos_poli,
    'conjuntos': {nombre: {'cols': cols, **ordinal(cols)} for nombre, cols in conjuntos.items()},
    'suavizado': {'R': noPD.tolist(), 'S': S.tolist()}
}
with open('ordinal_fixture.json', 'w', encoding='utf-8') as fh: json.dump(fixture, fh)
print(f'ordinal_fixture.json escrito: {len(xs)} Φ, {len(phi2_puntos)} Φ₂ (verificados con Owen), {len(casos_poli)} tablas y {len(conjuntos)} conjuntos de ítems')
