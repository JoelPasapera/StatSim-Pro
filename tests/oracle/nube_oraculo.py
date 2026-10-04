#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""nube_oraculo.py — referencia independiente del diagnóstico de la nube (Analizador): Breusch–Pagan de Koenker y White
(NumPy + scipy.stats.chi2), regresión de cuantiles como programación lineal exacta (scipy.optimize.linprog, HiGHS), NCA
(CE-FDH, esquinas, CR-FDH con integración numérica fina), techo o suelo e influencia (Cook, residuos estudentizados
eliminados con Bonferroni, r sin los casos con D > 4/n). Escribe nube_fixture.json."""
import json
import numpy as np
from scipy import stats, optimize

rng = np.random.default_rng(20261031)
def cuantil_lp(x, y, tau):
    n = len(x); c = np.concatenate([[0, 0], tau * np.ones(n), (1 - tau) * np.ones(n)])
    A = np.hstack([np.ones((n, 1)), x[:, None], np.eye(n), -np.eye(n)])
    r = optimize.linprog(c, A_eq=A, b_eq=y, bounds=[(None, None)] * 2 + [(0, None)] * (2 * n), method='highs')
    return {'a': float(r.x[0]), 'b': float(r.x[1]), 'perdida': float(r.fun)}
def bp(e, cols):
    Z = np.column_stack([np.ones_like(e)] + cols); e2 = e ** 2; beta, *_ = np.linalg.lstsq(Z, e2, rcond=None)
    r2 = 1 - ((e2 - Z @ beta) ** 2).sum() / ((e2 - e2.mean()) ** 2).sum(); lm = len(e) * r2
    return {'lm': float(lm), 'p': float(stats.chi2.sf(lm, len(cols)))}
def nca(x, y, direccion=1):
    xs = x if direccion > 0 else -x; u = np.unique(xs); M = np.array([y[xs == v].max() for v in u]); R = np.maximum.accumulate(M)
    ymin, ymax = y.min(), y.max(); alcance = (u[-1] - u[0]) * (ymax - ymin); zona = ((ymax - R[:-1]) * np.diff(u)).sum()
    esquinas = [(u[0], R[0])] + [(u[j], R[j]) for j in range(1, len(u)) if R[j] > R[j - 1]]
    # con una sola esquina la recta CR-FDH no está definida (Dul, 2016): polyfit devolvería un ajuste degenerado
    if len(esquinas) < 2: return {'d': float(zona / alcance), 'dCR': None, 'esquinas': len(esquinas)}
    ex, ey = np.array([p[0] for p in esquinas]), np.array([p[1] for p in esquinas]); b, a = np.polyfit(ex, ey, 1)
    malla = np.linspace(u[0], u[-1], 2_000_001); zonaCR = np.trapezoid(ymax - np.clip(a + b * malla, ymin, ymax), malla)
    return {'d': float(zona / alcance), 'dCR': float(zonaCR / alcance), 'esquinas': len(esquinas)}
def influencia(x, y):
    n = len(x); X = np.column_stack([np.ones(n), x]); XtXi = np.linalg.inv(X.T @ X); beta = XtXi @ X.T @ y; e = y - X @ beta
    h = np.einsum('ij,jk,ik->i', X, XtXi, X); s2 = (e ** 2).sum() / (n - 2); D = e ** 2 * h / (2 * s2 * (1 - h) ** 2)
    s2i = ((n - 2) * s2 - e ** 2 / (1 - h)) / (n - 3); t = e / np.sqrt(s2i * (1 - h)); pB = np.minimum(1, n * 2 * stats.t.sf(np.abs(t), n - 3))
    resto = D <= 4 / n; fmed = stats.f.ppf(0.5, 2, n - 2)
    return {'maxD': float(D.max()), 'nInfluyentes': int((D > 4 / n).sum()), 'nMuyInfluyentes': int((D > fmed).sum()), 'nAtipicos': int((pB < .05).sum()),
            'rTodos': float(np.corrcoef(x, y)[0, 1]), 'rSin': float(np.corrcoef(x[resto], y[resto])[0, 1]), 'Dprincipal': float(np.sort(D)[::-1][0]), 'tPrincipal': float(t[np.argmax(D)])}
casos = []
for nombre, n, gen in [('recta', 200, lambda: (lambda z: (z, 0.5 * z + 0.87 * rng.normal()))(rng.normal())),
                       ('abanico', 250, lambda: (lambda z: (z, (0.3 + 0.3 * (z + 3)) * rng.normal()))(rng.normal())),
                       ('triangulo', 220, lambda: (lambda x: (x, x * rng.uniform()))(rng.uniform())),
                       ('entera_atipico', 120, lambda: (lambda z: (round(30 + 6 * z), round(0.3 * z + rng.normal(), 1)))(rng.normal()))]:
    xy = np.array([gen() for _ in range(n)], float); x, y = xy[:, 0], xy[:, 1]
    if nombre == 'entera_atipico': x[0], y[0] = 52.0, 9.0
    b, a = np.polyfit(x, y, 1); e = y - a - b * x
    casos.append({'nombre': nombre, 'x': x.tolist(), 'y': y.tolist(), 'e': e.tolist(), 'bp': bp(e, [x]), 'white': bp(e, [x, x * x]),
                  'cuantiles': [cuantil_lp(x, y, t) for t in (0.1, 0.5, 0.9)], 'nca': nca(x, y, 1), 'ncaNeg': nca(x, y, -1),
                  'techoY': {'pMax': float((y == y.max()).mean()), 'pMin': float((y == y.min()).mean())}, 'influencia': influencia(x, y)})
json.dump(casos, open('nube_fixture.json', 'w'))
print('nube_fixture.json escrito: ' + ' · '.join(f"{c['nombre']} NCA d {c['nca']['d']:.3f} BP p {c['bp']['p']:.3g}" for c in casos))
