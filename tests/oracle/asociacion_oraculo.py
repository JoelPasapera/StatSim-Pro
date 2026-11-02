# asociacion_oraculo.py — oráculo de los tamaños del efecto con intervalo, la exacta de Fisher, los residuos corregidos y la
# correlación parcial (2027.01.17), con implementaciones independientes de las de core/stats (efectos.js, no-centrales.js,
# exactas.js y correlacion-parcial.js):
#   · los intervalos por no centralidad, con las distribuciones no centrales de SciPy (nct, ncf, ncx2) y brentq: d y g de dos
#     grupos, η² (también la parcial), V de Cramér; ω² por su fórmula; la razón de odds con el de Woolf;
#   · Fisher 2 × 2 con scipy.stats.fisher_exact (bilateral y las dos colas); r × c enumerando TODAS las tablas con los
#     totales fijos con itertools (otro algoritmo que el recorrido con cotas del programa), y la estimación de Monte Carlo
#     dentro de su error;
#   · los residuos tipificados corregidos de Haberman, con las esperadas de scipy.stats.contingency.expected_freq;
#   · la correlación parcial por la inversa de la matriz de covarianzas de [X, Y, Z] (no por residuos, como el programa), la
#     semiparcial por la t de X en la regresión de Y sobre X y Z (sr = t·√((1 − R²)/gl)), Spearman sobre los rangos de SciPy,
#     y la matriz de parciales por regresiones de cada par sobre el resto.
# Escribe asociacion_fixture.json; lo compara tests/unit/asociacion.test.js.
import itertools, json, math, os
import numpy as np
from scipy import stats, optimize
from scipy.stats import contingency
import scipy

rng = np.random.default_rng(20270118)

def raiz_creciente(g, a, b):
    """brentq sobre [a, b], ampliando b mientras g no cambie de signo."""
    while g(a) * g(b) > 0: b = b * 2 + 1
    return optimize.brentq(g, a, b, xtol=1e-12)

# ---------- intervalos por no centralidad ----------
def ic_nct(t, gl, nivel=0.95):
    a = (1 - nivel) / 2
    def raiz(q):
        g = lambda d: stats.nct.cdf(t, gl, d) - q; paso = 1.0
        while not (g(t - paso) > 0 > g(t + paso)): paso *= 1.5
        return optimize.brentq(g, t - paso, t + paso, xtol=1e-13)
    return raiz(1 - a), raiz(a)

def ic_ncf(F, d1, d2, nivel=0.95):
    a = (1 - nivel) / 2
    def lam(q):
        if stats.f.cdf(F, d1, d2) <= q: return 0.0
        return raiz_creciente(lambda l: stats.ncf.cdf(F, d1, d2, l) - q if l > 0 else stats.f.cdf(F, d1, d2) - q, 0.0, max(10.0, 2 * F * d1))
    return lam(1 - a), lam(a)

def ic_ncx2(x, gl, nivel=0.95):
    a = (1 - nivel) / 2
    def lam(q):
        if stats.chi2.cdf(x, gl) <= q: return 0.0
        return raiz_creciente(lambda l: (stats.ncx2.cdf(x, gl, l) if l > 0 else stats.chi2.cdf(x, gl)) - q, 0.0, max(10.0, 2 * x))
    return lam(1 - a), lam(a)

efectos = {'d': [], 'eta2': [], 'cramer': [], 'or': []}
for n1, n2, dif in [(12, 15, 0.6), (40, 35, 0.2), (8, 9, 1.4), (60, 60, -0.35)]:
    a, b = rng.normal(dif, 1, n1), rng.normal(0, 1, n2)
    t = float(stats.ttest_ind(a, b).statistic); f = math.sqrt(1 / n1 + 1 / n2); gl = n1 + n2 - 2
    J = math.exp(math.lgamma(gl / 2) - 0.5 * math.log(gl / 2) - math.lgamma((gl - 1) / 2))
    lo, hi = ic_nct(t, gl)
    efectos['d'].append({'t': t, 'n1': n1, 'n2': n2, 'd': t * f, 'inferior': lo * f, 'superior': hi * f, 'g': t * f * J, 'gInferior': lo * f * J, 'gSuperior': hi * f * J})
for F, d1, d2 in [(5.3, 2, 57), (0.4, 3, 40), (12.5, 1, 30), (2.1, 4, 95), (35.0, 2, 116)]:
    lo, hi = ic_ncf(F, d1, d2); N = d1 + d2 + 1
    om = max(0.0, d1 * (F - 1) / (d1 * (F - 1) + N))
    efectos['eta2'].append({'F': F, 'gl1': d1, 'gl2': d2, 'inferior': lo / (lo + N), 'superior': hi / (hi + N), 'omega2': om})
for chi2, gl, n, m in [(9.5, 2, 120, 2), (2.0, 4, 80, 3), (25.0, 1, 60, 2), (0.3, 1, 50, 2)]:
    lo, hi = ic_ncx2(chi2, gl); den = n * (m - 1)
    efectos['cramer'].append({'chi2': chi2, 'gl': gl, 'n': n, 'm': m, 'V': math.sqrt(chi2 / den), 'inferior': min(1, math.sqrt(lo / den)), 'superior': min(1, math.sqrt(hi / den))})
for a, b, c, d in [(12, 5, 7, 15), (0, 6, 9, 4), (20, 20, 20, 20), (3, 1, 1, 3)]:
    z = stats.norm.ppf(0.975); cor = 0 in (a, b, c, d); A, B, C, D = [x + (0.5 if cor else 0) for x in (a, b, c, d)]
    lor = math.log(A * D / (B * C)); ee = math.sqrt(1 / A + 1 / B + 1 / C + 1 / D)
    efectos['or'].append({'tabla': [a, b, c, d], 'or': math.exp(lor), 'inferior': math.exp(lor - z * ee), 'superior': math.exp(lor + z * ee), 'corregida': cor})

# ---------- Fisher ----------
def tablas_con_totales(filas, columnas):
    """Todas las tablas r × c con esos totales: cada fila, una composición de su total; se quedan las que cuadran por columnas."""
    def composiciones(total, partes, topes):
        if partes == 1:
            if total <= topes[0]: yield (total,)
            return
        for v in range(min(total, topes[0]) + 1):
            for resto in composiciones(total - v, partes - 1, topes[1:]): yield (v,) + resto
    def rec(i, restantes):
        if i == len(filas):
            if all(x == 0 for x in restantes): yield ()
            return
        for fila in composiciones(filas[i], len(columnas), restantes):
            for resto in rec(i + 1, tuple(r - v for r, v in zip(restantes, fila))): yield (fila,) + resto
    yield from rec(0, tuple(columnas))

def fisher_rxc(tabla):
    T = np.asarray(tabla); filas, columnas, n = T.sum(axis=1).tolist(), T.sum(axis=0).tolist(), int(T.sum())
    lnc = sum(math.lgamma(x + 1) for x in filas) + sum(math.lgamma(x + 1) for x in columnas) - math.lgamma(n + 1)
    lnp = lambda t: lnc - sum(math.lgamma(v + 1) for fila in t for v in fila)
    obs = lnp(T.tolist()); p = 0.0; cuantas = 0
    for t in tablas_con_totales(filas, columnas):
        cuantas += 1
        if lnp(t) <= obs + math.log1p(1e-7): p += math.exp(lnp(t))
    return min(1.0, p), cuantas

fisher = {'dos': [], 'rxc': []}
for t in [[[3, 1], [1, 3]], [[10, 2], [3, 15]], [[0, 5], [6, 1]], [[25, 30], [28, 22]], [[1, 0], [0, 1]], [[7, 7], [7, 7]]]:
    r2 = stats.fisher_exact(t); rl = stats.fisher_exact(t, alternative='less'); rg = stats.fisher_exact(t, alternative='greater')
    fisher['dos'].append({'tabla': t, 'p': float(r2.pvalue), 'pMenor': float(rl.pvalue), 'pMayor': float(rg.pvalue)})
for t in [[[3, 1, 2], [1, 4, 0], [2, 2, 5]], [[5, 0, 1, 2], [0, 4, 3, 1]], [[2, 3], [4, 1], [0, 5]], [[8, 2, 1], [1, 7, 2], [2, 1, 6]], [[4, 4, 4], [4, 4, 4]]]:
    p, cuantas = fisher_rxc(t)
    fisher['rxc'].append({'tabla': t, 'p': p, 'tablas': cuantas})
# una tabla grande, para Monte Carlo (n = 160 en 4 × 4: millones de tablas); su p «verdadero», con muchas tablas de SciPy
grande = [[12, 8, 6, 14], [9, 11, 10, 10], [5, 9, 14, 12], [11, 10, 9, 10]]
ref = stats.fisher_exact(np.asarray(grande), method=stats.MonteCarloMethod(n_resamples=200000, rng=np.random.default_rng(3)))
fisher['grande'] = {'tabla': grande, 'pReferencia': float(ref.pvalue)}

# ---------- residuos corregidos ----------
residuos = []
for t in [[[20, 15, 5], [10, 25, 25]], [[3, 1, 2], [1, 4, 0], [2, 2, 5]], [[30, 10], [10, 30]]]:
    O = np.asarray(t, float); E = contingency.expected_freq(O); n = O.sum(); rf = O.sum(axis=1, keepdims=True) / n; cf = O.sum(axis=0, keepdims=True) / n
    residuos.append({'tabla': t, 'residuos': ((O - E) / np.sqrt(E * (1 - rf) * (1 - cf))).tolist()})

# ---------- correlación parcial ----------
def parcial_precision(x, y, Z):
    M = np.column_stack([x, y] + list(Z)); P = np.linalg.inv(np.cov(M, rowvar=False))
    return -P[0, 1] / math.sqrt(P[0, 0] * P[1, 1])
def semiparcial_regresion(y, x, Z):
    X = np.column_stack([np.ones(len(y)), x] + list(Z)); b, *_ = np.linalg.lstsq(X, y, rcond=None); e = y - X @ b
    gl = len(y) - X.shape[1]; s2 = e @ e / gl; V = s2 * np.linalg.inv(X.T @ X); t = b[1] / math.sqrt(V[1, 1])
    R2 = 1 - (e @ e) / np.sum((y - y.mean()) ** 2)
    return t * math.sqrt((1 - R2) / gl), t
parciales = []
for n, q, spearman in [(80, 1, False), (45, 2, False), (120, 3, True), (30, 1, True)]:
    Zs = [rng.normal(0, 1, n) for _ in range(q)]
    x = 0.5 * sum(Zs) + rng.normal(0, 1, n); y = 0.4 * x + 0.6 * Zs[0] + rng.normal(0, 1, n)
    if spearman: x = np.exp(x); y = y ** 3
    X, Y, ZZ = (stats.rankdata(x), stats.rankdata(y), [stats.rankdata(z) for z in Zs]) if spearman else (x, y, Zs)
    r = parcial_precision(X, Y, ZZ); gl = n - 2 - q; t = r * math.sqrt(gl / (1 - r * r)); zc = stats.norm.ppf(0.975)
    ee = math.sqrt((1 + r * r / 2) / (n - 3 - q)) if spearman else 1 / math.sqrt(n - 3 - q)
    srx, tx = semiparcial_regresion(Y, X, ZZ); sry, _ = semiparcial_regresion(X, Y, ZZ)
    assert abs(tx - t) < 1e-9 * abs(t), (tx, t)   # la t de la parcial es la del coeficiente de X en la regresión
    parciales.append({'x': x.tolist(), 'y': y.tolist(), 'Z': [z.tolist() for z in Zs], 'spearman': spearman, 'parcial': r, 't': t, 'p': float(2 * stats.t.sf(abs(t), gl)),
                      'ic': [math.tanh(math.atanh(r) - zc * ee), math.tanh(math.atanh(r) + zc * ee)], 'semiparcialX': srx, 'semiparcialY': sry,
                      'ordenCero': float(stats.spearmanr(x, y).statistic if spearman else np.corrcoef(x, y)[0, 1])})
# la matriz de parciales: cada par por regresión sobre los demás (correlación de los residuos)
cols = [rng.normal(0, 1, 70) for _ in range(4)]; cols[1] = cols[1] + 0.5 * cols[0]; cols[3] = cols[3] + 0.4 * cols[2] - 0.3 * cols[0]
k = len(cols); M = np.zeros((k, k))
for i in range(k):
    for j in range(k):
        if i == j: M[i, j] = 1; continue
        resto = [cols[m] for m in range(k) if m not in (i, j)]; Xr = np.column_stack([np.ones(70)] + resto)
        ei = cols[i] - Xr @ np.linalg.lstsq(Xr, cols[i], rcond=None)[0]; ej = cols[j] - Xr @ np.linalg.lstsq(Xr, cols[j], rcond=None)[0]
        M[i, j] = np.corrcoef(ei, ej)[0, 1]
matriz = {'columnas': [c.tolist() for c in cols], 'parciales': M.tolist()}

destino = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'asociacion_fixture.json')
with open(destino, 'w', encoding='utf-8') as f:
    json.dump({'efectos': efectos, 'fisher': fisher, 'residuos': residuos, 'parciales': parciales, 'matriz': matriz}, f)
print(f'asociacion_fixture.json escrito: {sum(len(v) for v in efectos.values())} intervalos por no centralidad (nct, ncf, ncx2), '
      f'{len(fisher["dos"])} Fisher 2 × 2 y {len(fisher["rxc"])} r × c por enumeración ({sum(x["tablas"] for x in fisher["rxc"])} tablas), '
      f'{len(residuos)} tablas de residuos y {len(parciales)} correlaciones parciales (SciPy {scipy.__version__})')
