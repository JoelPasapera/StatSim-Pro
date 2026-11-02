# roc_oraculo.py — oráculo de la curva ROC (2027.01.18), escrito aparte de core/stats/roc.js, en NumPy y SciPy:
#   · el AUC como U/(n₁n₀) con scipy.stats.mannwhitneyu (y su p asintótica sin corrección de continuidad, con empates);
#   · el error típico de DeLong por la matriz completa ψ(caso i, no caso j) de los componentes estructurales (O(n₁n₀), sin los
#     rangos del programa);
#   · cada punto de corte contando a mano, el óptimo por el mayor índice de Youden (a igualdad, el más cercano a (0, 1)) y los
#     intervalos de Wilson por su fórmula.
# Cuatro bases: puntuaciones enteras con muchos empates, una con las puntuaciones bajas como indicio del caso, una pequeña y
# una continua. Escribe roc_fixture.json; lo compara tests/unit/roc.test.js.
import json, math, os
import numpy as np
from scipy import stats

rng = np.random.default_rng(20270118)
bases = {
    'enteros': (np.round(rng.normal(26, 6, 60)), np.round(rng.normal(20, 5, 140))),
    'inverso': (np.round(rng.normal(12, 4, 45)), np.round(rng.normal(17, 4, 90))),
    'pequena': (np.array([7., 9, 9, 12, 14, 15]), np.array([3., 5, 7, 7, 8, 9, 10, 11])),
    'continua': (rng.normal(1.1, 1, 80), rng.normal(0, 1, 120)),
}

def wilson(x, n, z=stats.norm.ppf(0.975)):
    p = x / n; den = 1 + z * z / n
    c = (p + z * z / (2 * n)) / den; m = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return [max(0.0, c - m), min(1.0, c + m)]

salida = {}
for nombre, (casos, no) in bases.items():
    invertido = False
    u1 = stats.mannwhitneyu(casos, no, alternative='two-sided', method='asymptotic', use_continuity=False)
    auc = u1.statistic / (len(casos) * len(no))
    if auc < 0.5: invertido = True
    c, d = (-casos, -no) if invertido else (casos, no)
    psi = (c[:, None] > d[None, :]) + 0.5 * (c[:, None] == d[None, :])
    v10, v01 = psi.mean(axis=1), psi.mean(axis=0)
    auc = psi.mean()
    ee = math.sqrt(v10.var(ddof=1) / len(c) + v01.var(ddof=1) / len(d))
    z = stats.norm.ppf(0.975)
    distintos = sorted(set(casos.tolist()) | set(no.tolist()), reverse=not invertido)
    cortes = []
    for k in distintos:
        pos_c = (casos <= k) if invertido else (casos >= k); pos_n = (no <= k) if invertido else (no >= k)
        vp, fp = int(pos_c.sum()), int(pos_n.sum()); fn, vn = len(casos) - vp, len(no) - fp
        sens, esp = vp / len(casos), vn / len(no)
        cortes.append({'corte': k, 'vp': vp, 'fp': fp, 'fn': fn, 'vn': vn, 'sensibilidad': sens, 'especificidad': esp, 'youden': sens + esp - 1,
                       'vpp': vp / (vp + fp) if vp + fp else None, 'vpn': vn / (vn + fn) if vn + fn else None})
    mejor = cortes[0]
    dist = lambda q: (1 - q['sensibilidad']) ** 2 + (1 - q['especificidad']) ** 2
    for q in cortes:
        if q['youden'] > mejor['youden'] + 1e-12 or (abs(q['youden'] - mejor['youden']) <= 1e-12 and dist(q) < dist(mejor) - 1e-12): mejor = q
    salida[nombre] = {'casos': casos.tolist(), 'noCasos': no.tolist(), 'invertido': invertido, 'auc': auc, 'ee': ee,
                      'inferior': max(0.0, auc - z * ee), 'superior': min(1.0, auc + z * ee), 'U': float(min(u1.statistic, len(casos) * len(no) - u1.statistic)), 'pValor': float(u1.pvalue),
                      'cortes': cortes, 'optimo': {**mejor, 'icSensibilidad': wilson(mejor['vp'], len(casos)), 'icEspecificidad': wilson(mejor['vn'], len(no)),
                                                   'icVpp': wilson(mejor['vp'], mejor['vp'] + mejor['fp']), 'icVpn': wilson(mejor['vn'], mejor['vn'] + mejor['fn'])}}
ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'roc_fixture.json')
with open(ruta, 'w', encoding='utf-8', newline='\n') as f: json.dump(salida, f)
print('roc_fixture.json escrito: ' + '; '.join(f"{k}: AUC {v['auc']:.3f} [{v['inferior']:.3f}, {v['superior']:.3f}]{' (invertida)' if v['invertido'] else ''}, corte {v['optimo']['corte']:g} (J = {v['optimo']['youden']:.3f})" for k, v in salida.items()))
