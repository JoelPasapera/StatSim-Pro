#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""invarianza_oraculo.py — referencia independiente del paso 6A: AFC multigrupo por ML con estructura de medias,
programado desde cero con NumPy y minimizado con SciPy (L-BFGS-B con gradiente numérico), en los niveles configural,
métrico, escalar y estricto. Calcula χ², gl, CFI, TLI, RMSEA con la corrección multigrupo (√G) y su IC con la χ² no
central de SciPy, SRMR con medias, medias latentes con EE por hessiana numérica, y la CDF de la χ² no central (también
con ncp grande). Escribe invarianza_fixture.json; lo compara tests/unit/invarianza.test.js."""
import json
import numpy as np
from scipy.optimize import minimize
from scipy.stats import ncx2, chi2 as chi2d
from scipy.optimize import brentq

rng = np.random.default_rng(20261019)
F_ITEMS = [[0, 1, 2], [3, 4, 5]]; p, m = 6, 2
LAM = [1, 0.8, 0.9, 1, 0.7, 0.85]

def simular(grupos):
    X, gv = [], []
    for nombre, n, media, sesgo in grupos:
        f1 = media + rng.normal(size=n); f2 = media + 0.5 * f1 + rng.normal(size=n)
        for i in range(n):
            fila = [3 + LAM[j] * (f1[i] if j < 3 else f2[i]) + 0.7 * rng.normal() + (sesgo if j == 4 else 0) for j in range(p)]
            X.append(fila); gv.append(nombre)
    return np.array(X), gv

def estadisticos(X, gv):
    out = []
    nombres = sorted(set(gv))
    for nm in nombres:
        Xg = X[[i for i, g in enumerate(gv) if g == nm]]; n = len(Xg)
        mu = Xg.mean(0); S = (Xg - mu).T @ (Xg - mu) / n
        out.append({'nombre': nm, 'n': n, 'media': mu, 'S': S, 'logdet': np.linalg.slogdet(S)[1]})
    return out

def construir(nivel, G):
    """Tabla de parámetros: (grupo o None, tipo, i, j) → índice; igualdades por nivel."""
    cargas, inter, resid = nivel in ('metrica', 'escalar', 'estricta'), nivel in ('escalar', 'estricta'), nivel == 'estricta'
    idx = {}
    def k(clave):
        if clave not in idx: idx[clave] = len(idx)
        return idx[clave]
    mapa = []
    for g in range(G):
        e = {'L': {}, 'F': {}, 'T': {}, 'N': {}, 'K': {}}
        for f, its in enumerate(F_ITEMS):
            for r, i in enumerate(its):
                if r > 0: e['L'][(i, f)] = k(('L', i, f) if cargas else (g, 'L', i, f))
        for a in range(m):
            for b in range(a, m): e['F'][(a, b)] = k((g, 'F', a, b))
        for i in range(p): e['T'][i] = k(('T', i) if resid else (g, 'T', i))
        for i in range(p): e['N'][i] = k(('N', i) if inter else (g, 'N', i))
        if inter and g > 0:
            for a in range(m): e['K'][a] = k((g, 'K', a))
        mapa.append(e)
    return mapa, len(idx), idx

def modelo(th, e):
    L = np.zeros((p, m)); Phi = np.zeros((m, m)); Th = np.zeros((p, p)); nu = np.zeros(p); ka = np.zeros(m)
    for f, its in enumerate(F_ITEMS): L[its[0], f] = 1
    for (i, f), kk in e['L'].items(): L[i, f] = th[kk]
    for (a, b), kk in e['F'].items(): Phi[a, b] = Phi[b, a] = th[kk]
    for i, kk in e['T'].items(): Th[i, i] = th[kk]
    for i, kk in e['N'].items(): nu[i] = th[kk]
    for a, kk in e['K'].items(): ka[a] = th[kk]
    return L @ Phi @ L.T + Th, nu + L @ ka

def F(th, mapa, D, N):
    tot = 0.0
    for e, d in zip(mapa, D):
        Sg, mu = modelo(th, e)
        s, ld = np.linalg.slogdet(Sg)
        if s <= 0: return 1e10
        A = np.linalg.inv(Sg); r = d['media'] - mu
        tot += d['n'] / N * (ld + np.trace(d['S'] @ A) + r @ A @ r - d['logdet'] - p)
    return tot

def ajustar(D, nivel):
    G = len(D); N = sum(d['n'] for d in D); mapa, q, idx = construir(nivel, G)
    x0 = np.zeros(q)
    for clave, kk in idx.items():
        t = clave[1] if isinstance(clave[0], int) else clave[0]
        gs = [clave[0]] if isinstance(clave[0], int) else list(range(G))
        if t == 'L': x0[kk] = 1
        elif t == 'F': a, b = clave[-2], clave[-1]; x0[kk] = 0.5 * np.mean([D[g]['S'][F_ITEMS[a][0], F_ITEMS[a][0]] for g in gs]) if a == b else 0
        elif t == 'T': x0[kk] = 0.5 * np.mean([D[g]['S'][clave[-1], clave[-1]] for g in gs])
        elif t == 'N': x0[kk] = np.mean([D[g]['media'][clave[-1]] for g in gs])
    res = minimize(F, x0, args=(mapa, D, N), method='L-BFGS-B', options={'ftol': 1e-16, 'gtol': 1e-11, 'maxiter': 20000, 'maxfun': 10**6})
    res = minimize(F, res.x, args=(mapa, D, N), method='BFGS', options={'gtol': 1e-10, 'maxiter': 20000})
    th = res.x; chi2 = N * res.fun; gl = G * (p * (p + 1) / 2 + p) - q
    chi2b = sum(d['n'] * (np.sum(np.log(np.diag(d['S']))) - d['logdet']) for d in D); glb = G * p * (p - 1) / 2
    CFI = 1 - max(chi2 - gl, 0) / max(chi2b - glb, chi2 - gl, 1e-12); TLI = (chi2b / glb - chi2 / gl) / (chi2b / glb - 1)
    rm = lambda nc: np.sqrt(max(nc, 0) / (N * gl)) * np.sqrt(G)
    def ncp(obj):
        if chi2d.cdf(chi2, gl) <= obj: return 0.0
        return brentq(lambda l: ncx2.cdf(chi2, gl, l) - obj, 1e-12, max(chi2 * 5, 100))
    srmr = 0.0
    for e, d in zip(mapa, D):
        Sg, mu = modelo(th, e); sd = np.sqrt(np.diag(d['S'])); s = 0.0
        for i in range(p):
            for j in range(i + 1): s += ((d['S'][i, j] - Sg[i, j]) / (sd[i] * sd[j])) ** 2
            s += ((d['media'][i] - mu[i]) / sd[i]) ** 2
        srmr += d['n'] / N * np.sqrt(s / (p * (p + 1) / 2 + p))
    salida = {'chi2': chi2, 'gl': gl, 'CFI': CFI, 'TLI': TLI, 'RMSEA': rm(chi2 - gl), 'RMSEAic': [rm(ncp(0.95)), rm(ncp(0.05))], 'SRMR': srmr}
    if nivel == 'escalar' and G > 1:
        # EE de las medias latentes: hessiana numérica de N·F/2 (−log L) por diferencias centrales de segundo orden
        h = 1e-4; H = np.zeros((q, q)); f0 = F(th, mapa, D, N)
        for a in range(q):
            for b in range(a, q):
                ea = np.zeros(q); eb = np.zeros(q); ea[a] = h; eb[b] = h
                H[a, b] = H[b, a] = (F(th + ea + eb, mapa, D, N) - F(th + ea - eb, mapa, D, N) - F(th - ea + eb, mapa, D, N) + F(th - ea - eb, mapa, D, N)) / (4 * h * h)
        cov = np.linalg.inv(H) * 2 / N
        salida['medias'] = [{'grupo': D[c[0]]['nombre'], 'factor': c[2], 'kappa': th[kk], 'se': float(np.sqrt(cov[kk, kk])),
                             'd': th[kk] / np.sqrt(th[idx[(0, 'F', c[2], c[2])]])} for c, kk in idx.items() if isinstance(c[0], int) and c[1] == 'K']
    return salida

conjuntos = {}
for nombre, grupos in [('no_invariante', [('F', 300, 0.4, 0.6), ('M', 350, 0.0, 0.0)]), ('invariante', [('A', 260, 0.0, 0.0), ('B', 240, 0.3, 0.0), ('C', 280, -0.2, 0.0)])]:
    X, gv = simular(grupos); D = estadisticos(X, gv)
    conjuntos[nombre] = {'datos': [dict(g=g, **{f'i{j + 1}': float(v) for j, v in enumerate(fila)}) for fila, g in zip(X.tolist(), gv)],
                         'niveles': {nv: ajustar(D, nv) for nv in ('configural', 'metrica', 'escalar', 'estricta')}}
nc = [{'x': x, 'df': df, 'ncp': l, 'cdf': float(ncx2.cdf(x, df, l))} for x, df, l in [(82.6, 51, 10), (30, 24, 0.5), (3100, 2400, 650), (5200, 300, 4700), (12, 16, 30)]]
json.dump({'conjuntos': conjuntos, 'noCentral': nc}, open('invarianza_fixture.json', 'w', encoding='utf-8'), default=float)
for nombre, c in conjuntos.items():
    print(nombre + ': ' + ' · '.join(f"{k} χ²({v['gl']:.0f}) = {v['chi2']:.3f}" for k, v in c['niveles'].items()))
print('invarianza_fixture.json escrito')
