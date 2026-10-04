#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""forma_oraculo.py — referencia independiente del diagnóstico de forma (Analizador): r de Pearson, ρ de Spearman y τ-b de
Kendall (scipy.stats, con p asintótica), IC de Fisher (y de Fieller para ρ), correlación de distancias por su definición
matricial (NumPy), η por tramos, y el mínimo de la suma de cuadrados de cada modelo de forma buscado con los optimizadores
de SciPy (varios arranques). Escribe forma_fixture.json; lo compara tests/unit/diagnostico-forma.test.js."""
import json
import numpy as np
from scipy import stats, optimize

rng = np.random.default_rng(20261028)
def dataset(nombre, n, f, ruido, entero=False):
    z = np.clip(rng.normal(size=n), -3.2, 3.2); x = 20 + 5 * z; y = f(z) + ruido * rng.normal(size=n)
    if entero: x, y = np.round(x), np.round(3 + 2 * y)
    return nombre, x, y
datos = [dataset('lineal', 300, lambda z: z, 0.8), dataset('u_invertida', 400, lambda z: -z * z, 0.6), dataset('logaritmica', 350, lambda z: np.log(z + 3.5), 0.15),
         dataset('sigmoide', 300, lambda z: 1 / (1 + np.exp(-4 * z)), 0.12), dataset('ciclica', 400, lambda z: np.cos(2.2 * z), 0.4), dataset('empates', 250, lambda z: np.exp(0.8 * z), 0.6, True)]

def fisher(r, n, factor=1.0):
    z, ee = np.arctanh(r), np.sqrt(factor / (n - 3)); return [float(np.tanh(z - 1.959963984540054 * ee)), float(np.tanh(z + 1.959963984540054 * ee))]
def dcor(x, y):
    a = np.abs(x[:, None] - x[None, :]); b = np.abs(y[:, None] - y[None, :])
    A = a - a.mean(0) - a.mean(1)[:, None] + a.mean(); B = b - b.mean(0) - b.mean(1)[:, None] + b.mean()
    return float(np.sqrt((A * B).mean() / np.sqrt((A * A).mean() * (B * B).mean())))
def eta_tramos(x, y):
    u = np.unique(x)
    if len(u) <= 10: grupos = [y[x == v] for v in u]
    else:
        k = min(10, max(3, len(x) // 30)); r = stats.rankdata(x); idx = np.minimum(k - 1, np.floor((r - 0.5) / len(x) * k)).astype(int)
        grupos = [y[idx == g] for g in range(k) if (idx == g).any()]
    my = y.mean(); sst = ((y - my) ** 2).sum(); ssb = sum(len(g) * (g.mean() - my) ** 2 for g in grupos)
    return float(np.sqrt(ssb / sst))
def rss_lineal(cols, y):
    X = np.column_stack([np.ones_like(y)] + cols); beta, *_ = np.linalg.lstsq(X, y, rcond=None); return float(((y - X @ beta) ** 2).sum())
def modelos(x, y):
    z = (x - x.mean()) / x.std(); zmin, rango = z.min(), z.max() - z.min(); q10, q90 = np.quantile(z, [0.1, 0.9]); out = {}
    out['constante'] = float(((y - y.mean()) ** 2).sum())
    for nombre, g in [('lineal', 1), ('cuadratica', 2), ('cubica', 3)]: out[nombre] = rss_lineal([z ** k for k in range(1, g + 1)], y)
    def pot(p):
        lam, lc = p; c = np.exp(lc); u = z - zmin + c
        return rss_lineal([np.log(u) if abs(lam) < 1e-9 else (u ** lam - 1) / lam], y) if -2 <= lam <= 3 and 0.01 * rango <= c <= 2 * rango else 1e300
    out['potencia'] = min(optimize.minimize(pot, [l0, np.log(c0)], method='Nelder-Mead', options={'xatol': 1e-10, 'fatol': 1e-12, 'maxiter': 4000}).fun for l0 in (-1.5, -0.5, 0.0, 0.5, 1.5, 2.5) for c0 in (0.02 * rango, 0.2 * rango, 1.5 * rango))
    out['exponencial'] = min(optimize.minimize_scalar(lambda k: rss_lineal([np.exp(k * z)], y), bounds=b, method='bounded', options={'xatol': 1e-10}).fun for b in ((-4, -0.05), (0.05, 4)))
    def sig(p):
        k, z0 = p; return rss_lineal([1 / (1 + np.exp(-k * (z - z0)))], y) if 0.5 <= k <= 30 and q10 <= z0 <= q90 else 1e300
    out['sigmoide'] = min(optimize.minimize(sig, [k0, z0], method='Nelder-Mead', options={'xatol': 1e-10, 'fatol': 1e-12, 'maxiter': 4000}).fun for k0 in (0.7, 2, 6, 15) for z0 in np.linspace(q10, q90, 7))
    cs = np.unique(z[(z >= q10) & (z <= q90)])
    out['escalon'] = min(rss_lineal([(z >= c).astype(float)], y) for c in cs)
    fina = np.linspace(q10, q90, 2000)
    seg = min(fina, key=lambda c: rss_lineal([z, np.maximum(z - c, 0)], y))
    out['segmentada'] = float(optimize.minimize_scalar(lambda c: rss_lineal([z, np.maximum(z - c, 0)], y), bounds=(max(q10, seg - 0.01), min(q90, seg + 0.01)), method='bounded').fun)
    Ts = np.exp(np.linspace(np.log(rango / 4), np.log(2 * rango), 3000))
    T0 = min(Ts, key=lambda T: rss_lineal([np.cos(2 * np.pi * z / T), np.sin(2 * np.pi * z / T)], y))
    out['ciclica'] = float(optimize.minimize_scalar(lambda T: rss_lineal([np.cos(2 * np.pi * z / T), np.sin(2 * np.pi * z / T)], y), bounds=(T0 * 0.995, T0 * 1.005), method='bounded').fun)
    return out
fixture = []
for nombre, x, y in datos:
    n = len(x); pr, sr, kt = stats.pearsonr(x, y), stats.spearmanr(x, y), stats.kendalltau(x, y, method='asymptotic')
    fixture.append({'nombre': nombre, 'x': x.tolist(), 'y': y.tolist(), 'r': float(pr[0]), 'p_r': float(pr[1]), 'ic_r': fisher(pr[0], n), 'rho': float(sr[0]), 'p_rho': float(sr[1]), 'ic_rho': fisher(sr[0], n, 1.06),
                    'tau': float(kt[0]), 'p_tau': float(kt[1]), 'dcor': dcor(x, y), 'eta': eta_tramos(x, y), 'rss': modelos(x, y)})
json.dump(fixture, open('forma_fixture.json', 'w'))
print('forma_fixture.json escrito: ' + ' · '.join(f"{d['nombre']} r {d['r']:.3f} dCor {d['dcor']:.3f}" for d in fixture))
