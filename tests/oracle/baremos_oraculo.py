# baremos_oraculo.py — oráculo de los baremos (2027.01.18), escrito aparte de core/stats/baremos.js: el percentil
# por el punto medio con scipy.stats.percentileofscore(kind='mean'), la z normalizada con scipy.stats.norm.ppf, los
# eneatipos con numpy.digitize sobre los cortes de Canfield, los decatipos con numpy.floor(2z + 6) (2z + 5,5 redondeado con
# los medios hacia arriba) y los puntos de corte de las categorías con numpy.quantile (tipo 7; con enteros, el de abajo). Escribe baremos_fixture.json;
# lo compara tests/unit/baremos.test.js.
import json, os
import numpy as np
from scipy import stats
import scipy

rng = np.random.default_rng(20270120)
muestras = {
    'likert_total': np.clip(np.round(rng.normal(60, 12, 300)), 20, 100).tolist(),   # un total Likert con empates
    'asimetrica': np.round(np.exp(rng.normal(2, 0.5, 150)), 1).tolist(),
    'pequena': [3.0, 5.0, 5.0, 7.0, 8.0, 8.0, 8.0, 10.0, 12.0, 15.0]
}
esperado = {}
for clave, v in muestras.items():
    x = np.asarray(v, float); distintos = np.unique(x)
    pc = np.array([stats.percentileofscore(x, d, kind='mean') for d in distintos]); z = stats.norm.ppf(pc / 100)
    m, de = x.mean(), x.std(ddof=1)
    esperado[clave] = {
        'media': m, 'de': de, 'pd': distintos.tolist(), 'f': [int((x == d).sum()) for d in distintos], 'pc': pc.tolist(), 'z': z.tolist(),
        'eneatipo': (np.digitize(pc, [4, 11, 23, 40, 60, 77, 89, 96], right=False) + 1).tolist(),
        'decatipo': np.clip(np.floor(2 * z + 6), 1, 10).astype(int).tolist(),
        'zTipica': ((distintos - m) / de).tolist(),
        # con puntuaciones enteras, el corte es el entero de abajo (clasifica igual: x ≤ 22,25 es x ≤ 22)
        'cortes': [float(np.floor(np.quantile(x, q)) if np.all(x == np.round(x)) else np.quantile(x, q)) for q in (0.25, 0.75)],
        'cuentas': [int((x <= np.quantile(x, 0.25)).sum()), int(((x > np.quantile(x, 0.25)) & (x <= np.quantile(x, 0.75))).sum()), int((x > np.quantile(x, 0.75)).sum())]
    }
destino = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'baremos_fixture.json')
with open(destino, 'w', encoding='utf-8') as f: json.dump({'muestras': muestras, 'esperado': esperado}, f)
print(f'baremos_fixture.json escrito: {len(muestras)} muestras, {sum(len(e["pd"]) for e in esperado.values())} puntuaciones distintas (SciPy {scipy.__version__})')
