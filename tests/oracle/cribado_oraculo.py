#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""cribado_oraculo.py — referencia independiente del cribado de forma (F4): RESET de Y sobre X con X² y X³ (X
estandarizada), estadístico de Wald con errores típicos HC3, p asintótica F (scipy.stats.f), coeficientes, giros de la
cúbica entre los percentiles 5 y 95, y el ajuste de Holm. Escribe cribado_fixture.json."""
import json
import numpy as np
from scipy import stats

rng = np.random.default_rng(20261102)
def reset(x, y):
    n = len(x); z = (x - x.mean()) / x.std(); grado = 3 if len(np.unique(x)) >= 4 else 2
    X = np.column_stack([z ** k for k in range(grado + 1)]); Ai = np.linalg.inv(X.T @ X); beta = Ai @ X.T @ y; e = y - X @ beta
    h = np.einsum('ij,jk,ik->i', X, Ai, X); V = Ai @ (X.T * (e ** 2 / (1 - h) ** 2)) @ X @ Ai
    idx = list(range(2, grado + 1)); b = beta[idx]; W = float(b @ np.linalg.solve(V[np.ix_(idx, idx)], b)); q = len(idx)
    lo, hi = np.quantile(z, [0.05, 0.95]); c1, c2 = beta[1], beta[2]; c3 = beta[3] if grado == 3 else 0.0
    raices = np.roots([3 * c3, 2 * c2, c1]) if abs(c3) > 1e-12 else np.array([-c1 / (2 * c2)])
    giros = sorted(float(x.mean() + r.real * x.std()) for r in raices if abs(r.imag) < 1e-12 and lo < r.real < hi)
    return {'W': W, 'pAsintotica': float(stats.f.sf(W / q, q, n - grado - 1)), 'beta': beta.tolist(), 'giros': giros}
def holm(ps):
    m = len(ps); orden = np.argsort(ps); ajust = np.empty(m); maximo = 0.0
    for k, i in enumerate(orden): maximo = max(maximo, min(1.0, (m - k) * ps[i])); ajust[i] = maximo
    return ajust.tolist()
casos = []
for nombre, n, gen in [('recta', 200, lambda z: 0.5 * z), ('u', 250, lambda z: 0.4 * (z * z - 1)), ('satura', 300, lambda z: 3 * (1 - np.exp(-1.2 * (z + 2.5)))), ('ciclica', 220, lambda z: np.cos(2 * z))]:
    z = rng.normal(size=n); x = np.round(30 + 6 * z) if nombre != 'ciclica' else 30 + 6 * z; y = gen((x - 30) / 6) + rng.normal(size=n)
    casos.append({'nombre': nombre, 'x': x.tolist(), 'y': y.tolist(), **reset(x, y)})
ps = [0.0004, 0.03, 0.2, 0.001, 0.5, 0.011]
json.dump({'casos': casos, 'holm': {'p': ps, 'ajustadas': holm(np.array(ps))}}, open('cribado_fixture.json', 'w'))
print('cribado_fixture.json escrito: ' + ' · '.join(f"{c['nombre']} W {c['W']:.2f} p {c['pAsintotica']:.3g} giros {len(c['giros'])}" for c in casos))
