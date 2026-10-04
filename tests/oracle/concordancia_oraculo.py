#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""concordancia_oraculo.py — referencia independiente del paso 5B: κ de Cohen simple, lineal y cuadrático con
scikit-learn (cohen_kappa_score), κ de Fleiss con NumPy, los seis CCI por ANOVA de dos factores con NumPy y sus IC con
la F de SciPy, y cuantiles de F. Escribe concordancia_fixture.json; lo compara tests/unit/concordancia.test.js."""
import json
import numpy as np
from scipy.stats import f as fdist
from sklearn.metrics import cohen_kappa_score

rng = np.random.default_rng(20261016)
n = 150
verdad = rng.integers(1, 6, n)
j1 = np.clip(verdad + rng.choice([-1, 0, 0, 0, 1], n), 1, 5); j2 = np.clip(verdad + rng.choice([-1, 0, 0, 1], n), 1, 5)
j3 = np.clip(verdad + rng.choice([-2, -1, 0, 0, 1], n), 1, 5)
cohen = {p: float(cohen_kappa_score(j1, j2, weights=None if p == 'ninguno' else ('linear' if p == 'lineal' else 'quadratic'))) for p in ('ninguno', 'lineal', 'cuadratico')}
M = np.vstack([j1, j2, j3]).T; cats = np.unique(M)
cuentas = np.array([[np.sum(fila == c) for c in cats] for fila in M]); m = M.shape[1]
Pi = ((cuentas ** 2).sum(axis=1) - m) / (m * (m - 1)); pj = cuentas.sum(axis=0) / (n * m)
fleiss = float((Pi.mean() - (pj ** 2).sum()) / (1 - (pj ** 2).sum()))
# CCI con puntuaciones continuas de 4 jueces
X = rng.normal(50, 10, (40, 1)) + rng.normal(0, 4, (40, 4)) + np.array([0, 1.5, -1, 2.5])
nn, k = X.shape; gm = X.mean()
SSR = k * ((X.mean(axis=1) - gm) ** 2).sum(); SSC = nn * ((X.mean(axis=0) - gm) ** 2).sum(); SST = ((X - gm) ** 2).sum()
SSE = SST - SSR - SSC; SSW = SST - SSR
MSR, MSC, MSE, MSW = SSR / (nn - 1), SSC / (k - 1), SSE / ((nn - 1) * (k - 1)), SSW / (nn * (k - 1))
q = 0.975
def ic(F, d1, d2, ind):
    FL, FU = F / fdist.ppf(q, d1, d2), F * fdist.ppf(q, d2, d1)
    return [(FL - 1) / (FL + k - 1), (FU - 1) / (FU + k - 1)] if ind else [1 - 1 / FL, 1 - 1 / FU]
icc2 = (MSR - MSE) / (MSR + (k - 1) * MSE + k * (MSC - MSE) / nn)
a = k * icc2 / (nn * (1 - icc2)); b = 1 + k * icc2 * (nn - 1) / (nn * (1 - icc2))
v = (a * MSC + b * MSE) ** 2 / ((a * MSC) ** 2 / (k - 1) + (b * MSE) ** 2 / ((nn - 1) * (k - 1)))
FL2, FU2 = fdist.ppf(q, nn - 1, v), fdist.ppf(q, v, nn - 1)
lo2 = nn * (MSR - FL2 * MSE) / (FL2 * (k * MSC + (k * nn - k - nn) * MSE) + nn * MSR); hi2 = nn * (FU2 * MSR - MSE) / (k * MSC + (k * nn - k - nn) * MSE + nn * FU2 * MSR)
sb = lambda x: k * x / (1 + (k - 1) * x)
formas = [[(MSR - MSW) / (MSR + (k - 1) * MSW), ic(MSR / MSW, nn - 1, nn * (k - 1), True)], [icc2, [lo2, hi2]], [(MSR - MSE) / (MSR + (k - 1) * MSE), ic(MSR / MSE, nn - 1, (nn - 1) * (k - 1), True)],
          [(MSR - MSW) / MSR, ic(MSR / MSW, nn - 1, nn * (k - 1), False)], [(MSR - MSE) / (MSR + (MSC - MSE) / nn), [sb(lo2), sb(hi2)]], [(MSR - MSE) / MSR, ic(MSR / MSE, nn - 1, (nn - 1) * (k - 1), False)]]
cuantiles = [{'p': p, 'd1': d1, 'd2': d2, 'q': float(fdist.ppf(p, d1, d2))} for p, d1, d2 in [(0.975, 5, 20), (0.95, 1, 30), (0.99, 39, 117), (0.025, 12, 3.7), (0.5, 2, 2)]]
json.dump({'jueces': [j1.tolist(), j2.tolist(), j3.tolist()], 'cohen': cohen, 'fleiss': fleiss, 'continuo': X.T.tolist(),
           'cci': [[float(v), [float(x) for x in c]] for v, c in formas], 'cuantilesF': cuantiles}, open('concordancia_fixture.json', 'w', encoding='utf-8'))
print(f'concordancia_fixture.json escrito: κ de Cohen (sklearn) {cohen["ninguno"]:.3f}, κ de Fleiss {fleiss:.3f}, CCI(2,1) {icc2:.3f}')
