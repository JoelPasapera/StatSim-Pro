#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""bootstrap_oraculo.py — referencia independiente del paso 2B: el generador sfc32 (sembrado con fmix32) reescrito en
Python con máscaras de 32 bits, las remuestras que produce, el cuantil tipo 7 de NumPy y los intervalos percentil y
BCa (z0 con empates a medias y aceleración por jackknife, como scipy.stats.bootstrap) para la media y el α de
Cronbach. Escribe bootstrap_fixture.json; lo compara tests/unit/bootstrap.test.js."""
import json
import numpy as np
from scipy.stats import norm

M = 0xFFFFFFFF
class Aleatorio:
    def __init__(self, semilla):
        self.s = semilla & M
        self.a, self.b, self.c, self.d = (self._mezcla() for _ in range(4))
        for _ in range(12): self.siguiente32()
    def _mezcla(self):
        self.s = (self.s + 0x9e3779b9) & M
        z = self.s
        z = ((z ^ (z >> 16)) * 0x85ebca6b) & M
        z = ((z ^ (z >> 13)) * 0xc2b2ae35) & M
        return (z ^ (z >> 16)) & M
    def siguiente32(self):
        t = (self.a + self.b) & M
        self.a = (self.b ^ (self.b >> 9)) & M
        self.b = (self.c + (self.c << 3)) & M
        self.c = ((self.c << 21) | (self.c >> 11)) & M
        self.d = (self.d + 1) & M
        t = (t + self.d) & M
        self.c = (self.c + t) & M
        return t
    def entero(self, n): return (self.siguiente32() * n) >> 32

def alfa(X):
    k = X.shape[1]; return k / (k - 1) * (1 - X.var(axis=0, ddof=1).sum() / X.sum(axis=1).var(ddof=1))

def intervalos(reps, estimado, jack, nivel):
    reps = np.asarray(reps); a = (1 - nivel) / 2
    perc = [float(np.quantile(reps, a)), float(np.quantile(reps, 1 - a))]
    p0 = ((reps < estimado).sum() + (reps <= estimado).sum()) / (2 * len(reps)); z0 = norm.ppf(p0)
    d = jack.mean() - jack; acel = (d ** 3).sum() / (6 * ((d ** 2).sum()) ** 1.5)
    za = norm.ppf(a)
    aj = lambda z: norm.cdf(z0 + (z0 + z) / (1 - acel * (z0 + z)))
    bca = [float(np.quantile(reps, aj(za))), float(np.quantile(reps, aj(-za)))]
    return perc, bca, float(z0), float(acel)

rng_datos = np.random.default_rng(20261009)
x = np.round(rng_datos.gamma(2.0, 1.5, 40), 3)                       # asimétrica: BCa ≠ percentil
f = rng_datos.standard_normal(60)
X = np.clip(np.round(3 + 0.9 * f[:, None] + rng_datos.standard_normal((60, 5))), 1, 5)
casos = []
for nombre, datos, est in [('media', x, lambda idx: float(x[idx].mean())), ('alfa', X, lambda idx: float(alfa(X[idx])))]:
    n = len(datos); B = 300; semilla = 2026; g = Aleatorio(semilla); reps = []
    for _ in range(B): reps.append(est(np.array([g.entero(n) for _ in range(n)])))
    jack = np.array([est(np.delete(np.arange(n), q)) for q in range(n)])
    perc, bca, z0, acel = intervalos(reps, est(np.arange(n)), jack, 0.95)
    casos.append({'estadistico': nombre, 'datos': datos.tolist(), 'B': B, 'semilla': semilla, 'replicas': reps, 'percentil': perc, 'bca': bca, 'z0': z0, 'aceleracion': acel})
secuencias = {str(s): [Aleatorio(s).siguiente32() for _ in range(1)] for s in (1, 2026, 4294967295)}
for s in (1, 2026, 4294967295):
    g = Aleatorio(s); secuencias[str(s)] = [g.siguiente32() for _ in range(20)]
with open('bootstrap_fixture.json', 'w', encoding='utf-8') as fh: json.dump({'secuencias': secuencias, 'casos': casos}, fh)
print(f'bootstrap_fixture.json escrito: 3 secuencias sfc32 y {len(casos)} estadísticos con B = 300 (percentil y BCa)')
