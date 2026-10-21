# normalidad_oraculo.py — oráculo de las pruebas de normalidad (2026.12.16): Shapiro-Wilk contra scipy.stats.shapiro (el
# mismo algoritmo de Royston que R y SPSS) en todas sus ramas (n = 3, exacta; de 4 a 11; 12 o más; asimétrica, con empates y
# en la cola profunda) y Kolmogórov-Smirnov con Lilliefors: el estadístico D contra scipy.stats.kstest (con la media y la DE
# de la muestra) y su p contra una transcripción de nortest::lillie.test de R (Dallal-Wilkinson en la cola; la aproximación
# polinómica de nortest en el centro; la corrección para n > 100). Hasta esa versión, con n = 3 Shapiro-Wilk daba NaN y
# ninguna prueba comprobaba Kolmogórov-Smirnov. Escribe normalidad_fixture.json; lo compara tests/unit/normalidad-nucleo.test.js.
import json, math, os
import numpy as np
from scipy import stats
import scipy

rng = np.random.default_rng(20261216)
sw = {'n3': [2.1, 3.4, 7.9], 'n7': [4.0, 4.5, 5.1, 5.2, 6.8, 7.0, 9.9], 'n25': np.round(rng.normal(10, 2, 25), 2).tolist(),
      'n49_asimetrica': np.round(np.exp(rng.normal(0, 0.8, 49)), 3).tolist(), 'n30_empates': np.round(rng.normal(3, 1, 30)).tolist()}
ks = {'n80_centro': np.round(rng.normal(50, 10, 80), 4).tolist(), 'n120_cola': np.round(np.exp(rng.normal(0, 0.6, 120)), 4).tolist(),
      'n300_centro': np.round(rng.normal(0, 1, 300), 4).tolist()}

def lillie_test_R(x):
    """Transcripción de nortest::lillie.test (R): D = máx(D⁺, D⁻) con la media y la DE de la muestra, y su p."""
    x = np.sort(np.asarray(x, float)); n = len(x); p = stats.norm.cdf((x - x.mean()) / x.std(ddof=1))
    K = max(np.max(np.arange(1, n + 1) / n - p), np.max(p - np.arange(0, n) / n))
    Kd, nd = (K, n) if n <= 100 else (K * (n / 100) ** 0.49, 100)
    pv = math.exp(-7.01256 * Kd ** 2 * (nd + 2.78019) + 2.99587 * Kd * math.sqrt(nd + 2.78019) - 0.122119 + 0.974598 / math.sqrt(nd) + 1.67997 / nd)
    if pv > 0.1:
        KK = (math.sqrt(n) - 0.01 + 0.85 / math.sqrt(n)) * K
        if KK <= 0.302: pv = 1.0
        elif KK <= 0.5: pv = 2.76773 - 19.828315 * KK + 80.709644 * KK ** 2 - 138.55152 * KK ** 3 + 81.218052 * KK ** 4
        elif KK <= 0.9: pv = -4.901232 + 40.662806 * KK - 97.490286 * KK ** 2 + 94.029866 * KK ** 3 - 32.355711 * KK ** 4
        elif KK <= 1.31: pv = 6.198765 - 19.558097 * KK + 23.186922 * KK ** 2 - 12.234627 * KK ** 3 + 2.423045 * KK ** 4
        else: pv = 0.0
    return float(K), float(pv)

def rama_lillie(x):
    """Qué tramo de la fórmula de nortest usa la muestra: la cola de Dallal-Wilkinson o un tramo del centro."""
    x = np.sort(np.asarray(x, float)); n = len(x); p = stats.norm.cdf((x - x.mean()) / x.std(ddof=1))
    K = max(np.max(np.arange(1, n + 1) / n - p), np.max(p - np.arange(0, n) / n))
    Kd, nd = (K, n) if n <= 100 else (K * (n / 100) ** 0.49, 100)
    if math.exp(-7.01256 * Kd ** 2 * (nd + 2.78019) + 2.99587 * Kd * math.sqrt(nd + 2.78019) - 0.122119 + 0.974598 / math.sqrt(nd) + 1.67997 / nd) <= 0.1: return 'cola'
    KK = (math.sqrt(n) - 0.01 + 0.85 / math.sqrt(n)) * K
    return 'p1' if KK <= 0.302 else 'centro05' if KK <= 0.5 else 'centro09' if KK <= 0.9 else 'centro131'

# los dos tramos del centro que las muestras de arriba no alcanzan (p = 1 y el de 0,302 a 0,5), buscados para que sigan
# cubiertos aunque cambie el generador; el de 0,9 a 1,31 no se alcanza nunca (con ese estadístico, Dallal-Wilkinson ya da
# p ≤ 0,1 y manda la cola): es código muerto de la fórmula original
busqueda = np.random.default_rng(424242)
for intento in range(200000):
    n = int(busqueda.integers(55, 95)); v = np.round(busqueda.normal(0, 1, n), 4)
    r = rama_lillie(v)
    if r in ('p1', 'centro05') and f'n{n}_{r}' not in ks and not any(k.endswith(r) for k in ks): ks[f'n{n}_{r}'] = v.tolist()
    if any(k.endswith('p1') for k in ks) and any(k.endswith('centro05') for k in ks): break
ramas = sorted({rama_lillie(v) for v in ks.values()})
assert ramas == ['centro05', 'centro09', 'cola', 'p1'], ramas

esperado = {'shapiro': {}, 'lilliefors': {}}
for k, v in sw.items():
    r = stats.shapiro(v); esperado['shapiro'][k] = {'W': float(r.statistic), 'p': float(r.pvalue)}
for k, v in ks.items():
    x = np.asarray(v, float); D = stats.kstest((x - x.mean()) / x.std(ddof=1), 'norm').statistic; K, p = lillie_test_R(v)
    assert abs(D - K) < 1e-12, (k, D, K)   # el D de SciPy y el de la transcripción de R coinciden
    esperado['lilliefors'][k] = {'D': float(D), 'p': p}
# Lo que las vistas hacen con la normalidad (ninguna prueba lo vigilaba): los residuos de la regresión (n = 30, Shapiro-Wilk;
# n = 60, Lilliefors), la normalidad por grupo con la que la comparación de grupos elige la rama, y la de los gráficos.
def normalidad_programa(v):
    v = np.asarray(v, float)
    if len(v) < 50:
        r = stats.shapiro(v); return {'prueba': 'Shapiro-Wilk', 'p': float(r.pvalue), 'normal': bool(r.pvalue > 0.05)}
    _, p = lillie_test_R(v); return {'prueba': 'K-S (Lilliefors)', 'p': p, 'normal': bool(p > 0.05)}
vistas = {'regresion': [], 'grupos': None, 'graficos': {}}
for n in (30, 60):
    x1, x2 = rng.normal(0, 1, n), rng.normal(0, 1, n); y = 1 + 0.5 * x1 - 0.3 * x2 + np.exp(rng.normal(0, 1, n))   # errores asimétricos
    X = np.column_stack([np.ones(n), x1, x2]); e = y - X @ np.linalg.lstsq(X, y, rcond=None)[0]
    vistas['regresion'].append({'filas': [{'y': float(a), 'x1': float(b), 'x2': float(c)} for a, b, c in zip(y, x1, x2)], 'residuos': normalidad_programa(e)})
gA, gB = np.round(rng.normal(20, 4, 25), 2), np.round(np.exp(rng.normal(2.5, 0.9, 30)), 2)
vistas['grupos'] = {'filas': [{'g': 'A', 'v': float(x)} for x in gA] + [{'g': 'B', 'v': float(x)} for x in gB], 'A': normalidad_programa(gA), 'B': normalidad_programa(gB)}
cuantiles = stats.norm.ppf((np.arange(1, 41) - 0.5) / 40)
vistas['graficos'] = {'normal': cuantiles.tolist(), 'normalEsperado': normalidad_programa(cuantiles)['normal'],
                      'asimetrica': np.exp(rng.normal(0, 1, 60)).tolist()}
vistas['graficos']['asimetricaEsperado'] = normalidad_programa(vistas['graficos']['asimetrica'])['normal']
assert [r['residuos']['normal'] for r in vistas['regresion']] == [False, False] and not vistas['grupos']['B']['normal'] and vistas['grupos']['A']['normal']
assert vistas['graficos']['normalEsperado'] and not vistas['graficos']['asimetricaEsperado']
esperado['vistas'] = vistas

destino = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'normalidad_fixture.json')
with open(destino, 'w', encoding='utf-8') as f: json.dump({'datos': {'shapiro': sw, 'lilliefors': ks}, 'esperado': esperado}, f)
print(f'normalidad_fixture.json escrito: {len(sw)} casos de Shapiro-Wilk y {len(ks)} de Lilliefors, en los tramos {", ".join(ramas)} (SciPy {scipy.__version__} y nortest::lillie.test transcrito)')
