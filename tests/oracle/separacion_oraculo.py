"""Oráculo de la existencia de la estimación de la logística y de Poisson (2026.12.23): ¿hay separación?

La decide la programación lineal de SciPy (HiGHS), independiente del símplex propio de core/linalg/simplex.js, con la
formulación directa de la dirección de separación (Albert y Anderson, 1984; Konis, 2007): sobre la constante y los
predictores tipificados zᵢ,
  · logística: max Σ sᵢ·zᵢᵀd con sᵢ·zᵢᵀd ≥ 0 para todo i (sᵢ = 2yᵢ − 1) y −1 ≤ d ≤ 1;
  · Poisson: max −Σ_{yᵢ=0} zᵢᵀd con zᵢᵀd ≤ 0 donde yᵢ = 0, zᵢᵀd = 0 donde yᵢ > 0 y −1 ≤ d ≤ 1.
La estimación es finita si y solo si el máximo es 0 (no hay dirección que separe). Se guardan solo los casos con una
respuesta clara (máximo < 10⁻⁹ o > 10⁻⁴): la prueba exige que core/stats/separacion.js decida TODOS. Diseños: predictores
continuos, ordinales tipo Likert, ficticias raras, mixtos, separaciones construidas por una combinación de predictores,
separaciones casi completas (empates en el umbral), ceros de Poisson en un grupo y casos de palanca.
Uso: python3 separacion_oraculo.py  →  separacion_fixture.json
"""
import json
import os
import numpy as np
from scipy.optimize import linprog

rng = np.random.default_rng(20261222)
TIPOS = ['continuo', 'likert', 'ficticias', 'mixto', 'combinacion', 'casi', 'palanca', 'ceros']


def tipificado(cols, n):
    X = np.column_stack(cols)
    s = X.std(0, ddof=1)
    s[s == 0] = 1
    return np.column_stack([np.ones(n), (X - X.mean(0)) / s])


def margen(y, cols, familia):
    """El máximo del programa lineal: 0 si la estimación es finita, > 0 si hay una dirección de separación."""
    y = np.asarray(y, float)
    Z = tipificado(cols, len(y))
    p = Z.shape[1]
    if familia == 'logistica':
        V = (2 * y - 1)[:, None] * Z
        r = linprog(-V.sum(0), A_ub=-V, b_ub=np.zeros(len(y)), bounds=[(-1, 1)] * p, method='highs')
    else:
        cero = y == 0
        if not cero.any():
            return 0.0
        pos = ~cero
        r = linprog(Z[cero].sum(0), A_ub=Z[cero], b_ub=np.zeros(cero.sum()),
                    A_eq=Z[pos] if pos.any() else None, b_eq=np.zeros(pos.sum()) if pos.any() else None,
                    bounds=[(-1, 1)] * p, method='highs')
    if r.status != 0:
        return float('nan')
    return -r.fun


def expit(e):
    return 0.5 * (1 + np.tanh(e / 2))


def generar(i):
    familia = 'logistica' if i % 5 < 3 else 'poisson'
    tipo = TIPOS[i % len(TIPOS)]
    n = int(rng.choice([8, 12, 20, 30, 50]))
    k = int(rng.integers(1, 4))
    X = rng.standard_normal((n, k))
    if tipo == 'likert':
        X = rng.integers(1, 6, (n, k)).astype(float)
    elif tipo == 'ficticias':
        X = (rng.random((n, k)) < rng.uniform(0.1, 0.5, k)).astype(float)
    elif tipo == 'mixto' and k > 1:
        X[:, 1:] = (rng.random((n, k - 1)) < 0.25).astype(float)
    elif tipo == 'palanca':
        X[0, 0] = rng.choice([-1, 1]) * 10 ** rng.uniform(1, 3)
    elif tipo == 'casi':
        X[:, 0] = np.round(X[:, 0] * 1.5)
    s = X.std(0)
    s[s == 0] = 1
    Zs = (X - X.mean(0)) / s
    if tipo == 'combinacion':   # separación (completa) por una combinación de todos los predictores
        d = rng.standard_normal(k)
        u = Zs @ d
        corte = np.quantile(u, rng.uniform(0.25, 0.75))
        y = (u > corte).astype(int) if familia == 'logistica' else np.where(u > corte, rng.poisson(2.5, n), 0)
    elif tipo == 'casi':   # separación casi completa: empates en el umbral
        c = np.median(X[:, 0])
        if familia == 'logistica':
            y = (X[:, 0] > c).astype(int)
            empate = X[:, 0] == c
            y[empate] = (rng.random(empate.sum()) < 0.5)
        else:
            y = np.where(X[:, 0] >= c, rng.poisson(2, n), 0)
    elif tipo == 'ceros' and familia == 'poisson':   # todos los conteos 0 en el grupo de una ficticia
        g = (rng.random(n) < rng.uniform(0.15, 0.4)).astype(float)
        X[:, 0] = g
        y = rng.poisson(1.5, n)
        y[g == 1] = 0 if rng.random() < 0.7 else y[g == 1]
    else:
        b = rng.choice([-1, 1], k) * rng.uniform(0.5, 6 if familia == 'logistica' else 2.5, k)
        eta = rng.normal(0, 1) + Zs @ b if familia == 'logistica' else rng.uniform(-1.5, 1) + Zs @ b
        y = (rng.random(n) < expit(eta)).astype(int) if familia == 'logistica' else rng.poisson(np.exp(np.minimum(eta, 8)))
    cols = [np.round(X[:, j], 6) for j in range(k)]
    return familia, tipo, np.asarray(y, int), cols


casos = []
cuenta = {}
i = 0
while len(casos) < 320:
    familia, tipo, y, cols = generar(i)
    i += 1
    n = len(y)
    if y.min() == y.max() or (familia == 'poisson' and y.max() == 0):
        continue
    Z = tipificado(cols, n)
    sv = np.linalg.svd(Z, compute_uv=False)
    if n <= Z.shape[1] or (sv > sv[0] * 1e-9).sum() < Z.shape[1]:
        continue
    m = margen(y, cols, familia)
    if not np.isfinite(m) or 1e-9 <= m <= 1e-4:
        continue   # sin una respuesta clara
    finita = bool(m < 1e-9)
    clave = f'{familia}/{tipo}/{"finita" if finita else "separada"}'
    cuenta[clave] = cuenta.get(clave, 0) + 1
    casos.append({'familia': familia, 'tipo': tipo, 'y': y.tolist(), 'cols': [c.tolist() for c in cols], 'finita': finita})

destino = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'separacion_fixture.json')
with open(destino, 'w', encoding='utf-8') as f:
    json.dump({'casos': casos}, f, separators=(',', ':'))
print(f'separacion_fixture.json escrito: {len(casos)} casos (de {i} generados)')
for clave in sorted(cuenta):
    print(f'  {clave}: {cuenta[clave]}')
