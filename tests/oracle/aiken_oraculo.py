#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""aiken_oraculo.py — valores de referencia de la V de Aiken calculados con NumPy/SciPy, sin usar nada del sitio:
V, intervalo score (Penfield y Giacobbi, 2004), p exacta de cola derecha (Aiken, 1985) por convolución y, para n
pequeño, también por enumeración exhaustiva (que valida la convolución) y cuantiles de la normal.
Escribe aiken_fixture.json; tests/unit/aiken.test.js los compara. Ejecutar desde tests/oracle."""
import itertools, json
import numpy as np
from scipy.stats import norm

def v_aiken(x, lo, hi):
    x = [v for v in x if v is not None]; n = len(x); k = hi - lo; S = sum(v - lo for v in x)
    return n, S, S / (n * k)

def ic_score(V, n, k, conf):
    z = norm.ppf(1 - (1 - conf) / 2); nk = n * k
    a = 2 * nk * V + z * z; b = z * np.sqrt(4 * nk * V * (1 - V) + z * z); d = 2 * (nk + z * z)
    return max(0.0, (a - b) / d), min(1.0, (a + b) / d)

def p_conv(S, n, k):
    dist = np.array([1.0])
    for _ in range(n): dist = np.convolve(dist, np.full(k + 1, 1.0 / (k + 1)))
    return float(dist[int(np.ceil(S - 1e-9)):].sum())

def p_enum(S, n, k):
    total = cuenta = 0
    for combo in itertools.product(range(k + 1), repeat=n):
        total += 1; cuenta += sum(combo) >= S
    return cuenta / total

rng = np.random.default_rng(20261004)
casos = []
for (lo, hi, n, conf) in [(1, 4, 5, 0.95), (0, 1, 7, 0.95), (1, 5, 8, 0.90), (1, 4, 3, 0.99), (0, 3, 10, 0.975), (1, 7, 6, 0.999), (1, 4, 12, 0.95)]:
    for _ in range(4):
        sesgo = rng.uniform(0.2, 1.0)
        x = [int(v) for v in np.clip(np.round(lo + (hi - lo) * rng.beta(1 + 4 * sesgo, 1.5, n)), lo, hi)]
        if rng.random() < 0.3: x[int(rng.integers(0, n))] = None   # un juez que no valoró el ítem
        n_, S, V = v_aiken(x, lo, hi); L, U = ic_score(V, n_, hi - lo, conf)
        p = p_conv(S, n_, hi - lo)
        caso = {'valoraciones': x, 'minimo': lo, 'maximo': hi, 'confianza': conf, 'n': n_, 'S': S, 'V': V, 'inferior': L, 'superior': U, 'p': p}
        if (hi - lo + 1) ** n_ <= 300000: caso['p_enumeracion'] = p_enum(S, n_, hi - lo)
        casos.append(caso)
ps = [1e-10, 1e-5, 0.001, 0.025, 0.05, 0.1, 0.3, 0.5, 0.7, 0.9, 0.95, 0.975, 0.99, 0.999, 1 - 1e-5, 1 - 1e-10]
fixture = {'casos': casos, 'cuantiles': [{'p': p, 'z': float(norm.ppf(p))} for p in ps]}
with open('aiken_fixture.json', 'w', encoding='utf-8') as fh: json.dump(fixture, fh, ensure_ascii=False, indent=1)
en = [c for c in casos if 'p_enumeracion' in c]
assert all(abs(c['p'] - c['p_enumeracion']) < 1e-12 for c in en), 'la convolución no coincide con la enumeración'
print(f'aiken_fixture.json escrito: {len(casos)} casos ({len(en)} verificados por enumeración) y {len(ps)} cuantiles')
