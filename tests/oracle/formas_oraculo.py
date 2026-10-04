#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""formas_oraculo.py — verificación INDEPENDIENTE de las relaciones con forma del Simulador (dimensión A del atlas).
Lee la malla que genera formas_generar.mjs y comprueba con NumPy/SciPy, con las 18 funciones reescritas desde las
ecuaciones del atlas: fuerza η = r(Y, f(X)); identidad r(X, Y) = η·r(f(X), X) (residuo ortogonal a X y a f(X));
identificación (con η = .9, la forma verdadera es la de mayor correlación con signo entre las 18, salvo parecidos que el
atlas advierte); y, en las bases sin aviso de la validación, Media, DE, α y la tercera correlación. Sale con código 1 si
algo falla."""
import json, os, sys, tempfile
import numpy as np
F = {
  'logaritmica': lambda u: np.log1p(14 * u) / np.log(15), 'potencia': lambda u: u ** 0.38, 'asintotica': lambda u: 1 - np.exp(-3.2 * u),
  'hiperbolica-sat': lambda u: u / (0.22 + u), 'meseta': lambda u: np.minimum(u / 0.45, 1), 'exponencial': lambda u: (np.exp(3.4 * u) - 1) / (np.exp(3.4) - 1),
  'potencia-exp': lambda u: u ** 3.2, 'sigmoide': lambda u: 1 / (1 + np.exp(-14 * (u - 0.5))), 'escalon': lambda u: (u >= 0.5).astype(float),
  'decaimiento': lambda u: np.exp(-4 * u), 'potencia-dec': lambda u: (1 + 12 * u) ** -0.9, 'hiperbolica-dec': lambda u: 1 / (1 + 9 * u),
  'u-invertida': lambda u: 1 - (2 * u - 1) ** 2, 'u': lambda u: (2 * u - 1) ** 2, 'j': lambda u: (u - 0.25) ** 2,
  'cubica': lambda u: (2 * u - 1) ** 3 - 0.75 * (2 * u - 1), 'ciclica': lambda u: -np.cos(4 * np.pi * u)}
PARECIDAS = [{'logaritmica', 'potencia', 'asintotica', 'hiperbolica-sat'}, {'exponencial', 'potencia-exp', 'j'}, {'decaimiento', 'potencia-dec', 'hiperbolica-dec'}]
def fX(forma, x):
    q01, med, q99 = np.quantile(x, [0.01, 0.5, 0.99]); h = max(med - q01, q99 - med)
    lo, hi = (med - h, med + h) if h > 0 else (x.min(), x.max())
    return F[forma](np.clip((x - lo) / (hi - lo), 0, 1))
r = lambda a, b: np.corrcoef(a, b)[0, 1]
def alfa(items):
    it = np.array(items, float); k = it.shape[0]; return k / (k - 1) * (1 - it.var(axis=1, ddof=1).sum() / it.sum(axis=0).var(ddof=1))
bases = json.load(open(os.path.join(tempfile.gettempdir(), 'statsim_formas_bases.json')))
fallos, peor = [], {'eta': 0, 'ident': 0, 'media': 0, 'de': 0, 'r3': 0, 'alfa': 0}
for B in bases:
    x, y, z = (np.array(B[k], float) for k in 'xyz'); forma, eta = B['forma'], B['eta']; et = f"{forma}/{B['dist']}/η {eta}"
    fx = fX(forma, x)
    if eta == 0.9:
        rs = {s: r(fX(s, x), y) for s in F}; mejor = max(rs, key=rs.get)
        if mejor != forma and not any(forma in g and mejor in g for g in PARECIDAS): fallos.append(f'{et}: la forma que mejor ajusta es {mejor}')
    if B['aviso']: continue   # la validación avisó de que no todo es alcanzable (recorte o cota de correlación)
    e = abs(r(fx, y) - eta); peor['eta'] = max(peor['eta'], e)
    if e > 0.01: fallos.append(f'{et}: η obtenida {r(fx, y):.4f}')
    d = abs(r(x, y) - eta * r(fx, x)); peor['ident'] = max(peor['ident'], d)
    if d > 0.02: fallos.append(f'{et}: identidad de r desviada {d:.4f}')
    for clave, valor, obj, tol in [('media', y.mean(), 24, 0.1), ('de', y.std(ddof=1), 5, 0.1), ('r3', r(y, z), 0.35, 0.03), ('alfa', alfa(B['items']), 0.85, 0.04)]:
        peor[clave] = max(peor[clave], abs(valor - obj))
        if abs(valor - obj) > tol: fallos.append(f'{et}: {clave} {valor:.3f} (pedida {obj})')
print(f"formas: {len(bases)} bases ({sum(b['aviso'] for b in bases)} con aviso) · peores desvíos: " + ', '.join(f'{k} {v:.4f}' for k, v in peor.items()))
if fallos: print('FALLOS:', ' | '.join(fallos[:12])); sys.exit(1)
