#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""analizador_oraculo.py — valores de referencia para el Analizador, calculados con NumPy/SciPy sin usar nada
del sitio. Escribe analizador_fixture.json; tests/integration/analizador-oraculo.test.js los compara.
Ejecutar desde tests/oracle:  python3 analizador_oraculo.py"""
import json
import numpy as np
from scipy import stats

rng = np.random.default_rng(20260928)
n = 120
x = rng.normal(24, 5, n).round(2)
y = (0.55 * (x - 24) + rng.normal(0, 4, n) + 30).round(2)
z = rng.gamma(2.0, 3.0, n).round(2)                    # asimétrica
g2 = rng.integers(0, 2, n)                              # dos grupos
g3 = rng.integers(1, 4, n)                              # tres grupos
y_g = (y + 2.5 * g2).round(2)                           # diferencia por grupo
items = np.clip(np.round(rng.normal(3, 0.9, (n, 6)) + 0.6 * rng.normal(0, 1, (n, 1))), 1, 5)   # 6 ítems Likert congenéricos
tabla = np.array([[30, 20], [15, 55]])                   # tabla 2×2 para chi cuadrado

def descriptivas(v):
    v = np.asarray(v, float)
    return {'n': int(v.size), 'media': float(v.mean()), 'desviacion': float(v.std(ddof=1)), 'mediana': float(np.median(v)),
            'asimetria': float(stats.skew(v, bias=False)), 'curtosis': float(stats.kurtosis(v, bias=False))}

a, b = y_g[g2 == 0], y_g[g2 == 1]
t_eq = stats.ttest_ind(a, b, equal_var=True); t_w = stats.ttest_ind(a, b, equal_var=False)
u = stats.mannwhitneyu(a, b, alternative='two-sided')
lev = stats.levene(a, b, center='median')   # el Analizador usa la variante de Brown–Forsythe (mediana), la más robusta y la predeterminada de SciPy
grupos3 = [y[g3 == k] for k in (1, 2, 3)]
f = stats.f_oneway(*grupos3); kw = stats.kruskal(*grupos3)
sw = stats.shapiro(z); pr = stats.pearsonr(x, y); sp = stats.spearmanr(x, y); reg = stats.linregress(x, y)
chi = stats.chi2_contingency(tabla, correction=False)
d_pooled = float((b.mean() - a.mean()) / np.sqrt(((a.size - 1) * a.var(ddof=1) + (b.size - 1) * b.var(ddof=1)) / (a.size + b.size - 2)))
k = items.shape[1]; alfa = float(k / (k - 1) * (1 - items.var(axis=0, ddof=1).sum() / items.sum(axis=1).var(ddof=1)))

fixture = {
    'datos': {'x': x.tolist(), 'y': y.tolist(), 'z': z.tolist(), 'g2': g2.tolist(), 'g3': g3.tolist(), 'y_g': y_g.tolist(), 'items': items.tolist(), 'tabla': tabla.tolist()},
    'referencia': {
        'descriptivas_x': descriptivas(x), 'descriptivas_z': descriptivas(z),
        'pearson': {'r': float(pr[0]), 'p': float(pr[1])}, 'spearman': {'rho': float(sp[0]), 'p': float(sp[1])},
        'shapiro_z': {'W': float(sw[0]), 'p': float(sw[1])},
        't_student': {'t': float(t_eq.statistic), 'gl': int(a.size + b.size - 2), 'p': float(t_eq.pvalue)},
        't_welch': {'t': float(t_w.statistic), 'p': float(t_w.pvalue)},
        'mann_whitney': {'U': float(min(u.statistic, a.size * b.size - u.statistic)), 'p': float(u.pvalue)},
        'levene': {'F': float(lev.statistic), 'p': float(lev.pvalue)},
        'anova': {'F': float(f.statistic), 'p': float(f.pvalue)}, 'kruskal': {'H': float(kw.statistic), 'p': float(kw.pvalue)},
        'regresion': {'pendiente': float(reg.slope), 'intercepto': float(reg.intercept), 'r2': float(reg.rvalue ** 2), 'p': float(reg.pvalue)},
        'cohen_d': d_pooled, 'alfa_cronbach': alfa,
        'chi2': {'chi2': float(chi[0]), 'gl': int(chi[2]), 'p': float(chi[1])}
    }
}
with open('analizador_fixture.json', 'w', encoding='utf-8') as fh:
    json.dump(fixture, fh, ensure_ascii=False, indent=1)
print('analizador_fixture.json escrito:', len(fixture['referencia']), 'bloques de referencia')
