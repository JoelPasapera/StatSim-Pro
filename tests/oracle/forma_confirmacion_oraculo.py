#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""forma_confirmacion_oraculo.py — referencia independiente de las confirmaciones de la forma (Analizador): P-spline con
la base B-spline de scipy.interpolate y GCV, algoritmo Robin Hood y regresión interrumpida con HC3 (NumPy), prueba de
Lind y Mehlum con IC de Fieller y TOST de la correlación (scipy.stats). Escribe forma_confirmacion_fixture.json."""
import json
import numpy as np
from scipy import stats
from scipy.interpolate import BSpline

rng = np.random.default_rng(20261029)
def datos(n, f, ruido=0.8):
    z = rng.normal(size=n); return 30 + 6 * z, f(z) + ruido * rng.normal(size=n)

def pspline(x, y, nseg=20):
    lo, hi = x.min(), x.max(); hi = hi + 1e-9 * (hi - lo or 1); h = (hi - lo) / nseg
    t = lo + (np.arange(nseg + 7) - 3) * h; K = nseg + 3
    B = BSpline.design_matrix(x, t, 3).toarray(); P = np.diff(np.eye(K), 2, axis=0); P = P.T @ P
    BtB, Bty = B.T @ B, B.T @ y; mejor = None
    for lam in 10.0 ** (-3 + np.arange(41) / 4):
        Mi = np.linalg.inv(BtB + lam * P); beta = Mi @ Bty; aj = B @ beta; rss = ((y - aj) ** 2).sum(); edf = np.trace(Mi @ BtB)
        gcv = len(y) * rss / (len(y) - edf) ** 2
        if mejor is None or gcv < mejor[0]: mejor = (gcv, lam, Mi, aj, rss, edf)
    gcv, lam, Mi, aj, rss, edf = mejor; s2 = rss / (len(y) - edf)
    return aj, np.sqrt(s2 * np.einsum('ij,jk,ik->i', B, Mi, B)), lam, edf

def interrumpida(x, y, c):
    low = x <= c; X = np.column_stack([np.ones_like(x), np.where(low, x - c, 0), np.where(low, 0, x - c), (~low).astype(float)])
    XtXi = np.linalg.inv(X.T @ X); beta = XtXi @ X.T @ y; e = y - X @ beta; hii = np.einsum('ij,jk,ik->i', X, XtXi, X)
    V = XtXi @ (X.T * (e ** 2 / (1 - hii) ** 2)) @ X @ XtXi; gl = len(y) - 4
    lado = lambda k: {'b': float(beta[k]), 'ee': float(np.sqrt(V[k, k])), 't': float(beta[k] / np.sqrt(V[k, k])), 'p': float(2 * stats.t.sf(abs(beta[k] / np.sqrt(V[k, k])), gl))}
    return {'bajo': lado(1), 'alto': lado(2)}

def dos_rectas(x, y, extremo):
    aj, ee, lam, edf = pspline(x, y); interior = (x != x.min()) & (x != x.max()); s = -1 if extremo == 'mínimo' else 1
    idx = np.where(interior)[0]; iext = idx[np.argmax(s * aj[idx])]
    plana = np.sort(x[np.abs(aj - aj[iext]) <= ee[iext]]); c1 = float(np.quantile(plana, 0.5)); r1 = interrumpida(x, y, c1)
    t1, t2 = abs(r1['bajo']['t']), abs(r1['alto']['t']); q = t2 / (t1 + t2); c = float(np.quantile(plana, q)); r = interrumpida(x, y, c)
    esp = (-1, 1) if extremo == 'mínimo' else (1, -1)
    conf = r['bajo']['p'] < .05 and r['alto']['p'] < .05 and np.sign(r['bajo']['b']) == esp[0] and np.sign(r['alto']['b']) == esp[1]
    return {'lambda': float(lam), 'edf': float(edf), 'xExtremo': float(x[iext]), 'corteInicial': c1, 'corte': c, **r, 'confirmada': bool(conf)}

def lind_mehlum(x, y, extremo):
    m = x.mean(); u = x - m; X = np.column_stack([np.ones_like(u), u, u * u]); XtXi = np.linalg.inv(X.T @ X); beta = XtXi @ X.T @ y
    gl = len(y) - 3; s2 = ((y - X @ beta) ** 2).sum() / gl; V = s2 * XtXi; b, c = beta[1], beta[2]
    def pend(uu):
        s = b + 2 * c * uu; ee = np.sqrt(V[1, 1] + 4 * uu * uu * V[2, 2] + 4 * uu * V[1, 2]); return {'s': float(s), 'ee': float(ee), 't': float(s / ee)}
    izq, der = pend(u.min()), pend(u.max())
    T = min(-izq['t'], der['t']) if extremo == 'mínimo' else min(izq['t'], -der['t'])
    tc = stats.t.ppf(0.975, gl); A = 4 * c * c - 4 * tc * tc * V[2, 2]; B = 4 * b * c - 4 * tc * tc * V[1, 2]; C = b * b - tc * tc * V[1, 1]; disc = B * B - 4 * A * C
    ic = [float(m + (-B - np.sqrt(disc)) / (2 * A)), float(m + (-B + np.sqrt(disc)) / (2 * A))] if A > 0 and disc >= 0 else None
    return {'izquierda': izq, 'derecha': der, 't': float(T), 'p': float(stats.t.sf(T, gl)), 'vertice': float(m - b / (2 * c)), 'ic': ic}

def tost(r, n, lim=0.1, alfa=0.05):
    z, ee, zl = np.arctanh(r), 1 / np.sqrt(n - 3), np.arctanh(lim); zc = stats.norm.ppf(1 - alfa)
    p = max(stats.norm.sf((z + zl) / ee), stats.norm.cdf((z - zl) / ee))
    return {'p': float(p), 'ic': [float(np.tanh(z - zc * ee)), float(np.tanh(z + zc * ee))], 'limiteMinimo': float(np.tanh(abs(z) + zc * ee)), 'equivalente': bool(p < alfa)}

casos = [('u_invertida', 400, lambda z: -z * z, 'máximo'), ('u', 350, lambda z: z * z, 'mínimo'), ('logaritmica', 300, lambda z: 2.2 * np.log(z + 3.6), 'máximo'), ('j', 450, lambda z: 0.6 * (z + 1.2) ** 2, 'mínimo')]
fixture = {'forma': [], 'tost': []}
for nombre, n, f, ext in casos:
    x, y = datos(n, f); fixture['forma'].append({'nombre': nombre, 'extremo': ext, 'x': x.tolist(), 'y': y.tolist(), 'dosRectas': dos_rectas(x, y, ext), 'lindMehlum': lind_mehlum(x, y, ext)})
for n, lim in ((1500, 0.1), (300, 0.1), (800, 0.05)):
    x, y = rng.normal(size=n), rng.normal(size=n); r = float(stats.pearsonr(x, y)[0]); fixture['tost'].append({'r': r, 'n': n, 'limite': lim, **tost(r, n, lim)})
json.dump(fixture, open('forma_confirmacion_fixture.json', 'w'))
print('forma_confirmacion_fixture.json escrito: ' + ' · '.join(f"{d['nombre']} corte {d['dosRectas']['corte']:.2f} {'confirma' if d['dosRectas']['confirmada'] else 'no confirma'}" for d in fixture['forma']))
