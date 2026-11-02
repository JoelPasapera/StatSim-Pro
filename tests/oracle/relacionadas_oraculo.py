# relacionadas_oraculo.py — oráculo de las pruebas para muestras relacionadas (2027.01.17), con implementaciones
# independientes de las de core/stats/relacionadas.js:
#   · t pareada: scipy.stats.ttest_rel; su intervalo y la dz, y el intervalo de la dz por la t no central de SciPy (nct);
#   · Wilcoxon: scipy.stats.wilcoxon (sin los ceros, sin corrección por continuidad, con la corrección de empates: la de
#     SPSS) y T₊, T₋ y la biserial de rangos con su intervalo (el de effectsize: Fisher z con EE √(n(n+1)(2n+1)/6)/(n(n+1)/2));
#   · ANOVA de medidas repetidas: mínimos cuadrados del modelo aditivo sujeto + medida en formato largo (np.linalg.lstsq,
#     comparando modelos), la W de Mauchly con OTROS contrastes ortonormales (los polinómicos, por QR), la ε de
#     Greenhouse-Geisser por la fórmula de Box (1954) sobre la matriz de covarianzas de las medidas (no de los contrastes) y
#     la de Huynh-Feldt (con la corrección de Lecoutre, la de car y afex de R); el intervalo de la η² parcial por la F no
#     central de SciPy (ncf);
#   · Friedman: scipy.stats.friedmanchisquare (con la corrección de empates) y la W de Kendall;
#   · McNemar: scipy.stats.binomtest (exacta) y los límites de Clopper-Pearson con scipy.stats.beta;
#   · Q de Cochran: por la forma k(k − 1)Σ(Cⱼ − C̄)²/ΣRᵢ(k − Rᵢ), otra escritura de la fórmula;
#   · ANOVA mixto: tipo III por comparación de modelos sobre las puntuaciones de los contrastes polinómicos (traza de la
#     diferencia de las matrices de error con y sin cada término, con la codificación de efectos), el factor entre sujetos
#     con scipy.stats.f_oneway sobre la media de cada caso, Levene con scipy.stats.levene (centrada en la media, la de SPSS);
#   · la M de Box, con su aproximación F, y una comprobación Monte Carlo de su calibración bajo la hipótesis nula;
#   · las comparaciones por pares (t pareada, Wilcoxon, las de Friedman y Cochran) con Holm.
# Escribe relacionadas_fixture.json; lo compara tests/unit/relacionadas.test.js.
import json, math, os
import numpy as np
from scipy import stats, optimize
import scipy

rng = np.random.default_rng(20270117)

def a_json(x):
    """Lo que JSON no tiene: ±∞ como cadenas, NaN como null."""
    if isinstance(x, dict): return {k: a_json(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)): return [a_json(v) for v in x]
    if isinstance(x, (np.floating, float)):
        x = float(x)
        if math.isnan(x): return None
        if math.isinf(x): return 'inf' if x > 0 else '-inf'
        return x
    if isinstance(x, (np.integer,)): return int(x)
    if isinstance(x, np.ndarray): return a_json(x.tolist())
    return x

def holm(ps):
    ps = np.asarray(ps, float); m = len(ps); orden = np.argsort(ps, kind='stable'); aj = np.empty(m); maximo = 0.0
    for r, i in enumerate(orden):
        maximo = max(maximo, min(1.0, (m - r) * ps[i])); aj[i] = maximo
    return aj.tolist()

def pares(k): return [(i, j) for i in range(k) for j in range(i + 1, k)]

# ---------- intervalos de los tamaños del efecto por no centralidad (SciPy) ----------
def ic_delta(t, gl, nivel=0.95):
    a = (1 - nivel) / 2
    def raiz(q):
        # el intervalo se amplía desde la t observada (la nct de SciPy da NaN con δ muy lejos de t)
        g = lambda d: stats.nct.cdf(t, gl, d) - q; paso = 1.0
        while not (g(t - paso) > 0 > g(t + paso)): paso *= 1.5
        return optimize.brentq(g, t - paso, t + paso, xtol=1e-13)
    return raiz(1 - a), raiz(a)

def ic_lambda_f(F, d1, d2, nivel=0.95):
    a = (1 - nivel) / 2
    def lam(q):
        if stats.f.cdf(F, d1, d2) <= q: return 0.0
        g = lambda l: stats.ncf.cdf(F, d1, d2, l) - q
        b = max(10.0, 2 * F * d1)
        while g(b) > 0: b *= 2
        return optimize.brentq(g, 0, b, xtol=1e-12)
    return lam(1 - a), lam(a)

# ---------- dos medidas ----------
def t_pareada(x, y, nivel=0.95):
    x, y = np.asarray(x, float), np.asarray(y, float); d = x - y; n = len(d)
    r = stats.ttest_rel(x, y); md, sd = d.mean(), d.std(ddof=1); ee = sd / math.sqrt(n); tc = stats.t.ppf(1 - (1 - nivel) / 2, n - 1)
    lo, hi = ic_delta(float(r.statistic), n - 1, nivel)
    return {'t': float(r.statistic), 'gl': n - 1, 'p': float(r.pvalue), 'md': md, 'sd': sd, 'ic': [md - tc * ee, md + tc * ee],
            'dz': md / sd, 'icDz': [lo / math.sqrt(n), hi / math.sqrt(n)]}

def wilcoxon(x, y, nivel=0.95):
    x, y = np.asarray(x, float), np.asarray(y, float); d = x - y; empates = int(np.sum(d == 0)); d = d[d != 0]; n = len(d)
    r = stats.wilcoxon(x, y, zero_method='wilcox', correction=False, method='asymptotic')
    rg = stats.rankdata(np.abs(d)); Tmas, Tmenos = float(rg[d > 0].sum()), float(rg[d < 0].sum())
    S = n * (n + 1) / 2; rbc = (Tmas - Tmenos) / S
    ee = math.sqrt(n * (n + 1) * (2 * n + 1) / 6) / S; z = stats.norm.ppf(1 - (1 - nivel) / 2)
    ic = None if abs(rbc) >= 1 else [math.tanh(math.atanh(rbc) - z * ee), math.tanh(math.atanh(rbc) + z * ee)]
    return {'n': n, 'empates': empates, 'positivos': int(np.sum(d > 0)), 'Tmas': Tmas, 'Tmenos': Tmenos, 'T': float(r.statistic),
            'z': float(r.zstatistic), 'p': float(r.pvalue), 'rbc': rbc, 'icRbc': ic}

# ---------- contrastes polinómicos ortonormales (otros que los de Helmert del programa) ----------
def polinomicos(k):
    V = np.vander(np.arange(1, k + 1, dtype=float), k, increasing=True)
    Q, _ = np.linalg.qr(V)
    return Q[:, 1:]   # sin la columna constante: k × (k − 1), ortonormales y ortogonales a la constante

def epsilon_gg_box(S):
    """Greenhouse-Geisser por la fórmula de Box (1954) sobre la matriz k × k de covarianzas de las medidas."""
    k = S.shape[0]; sd, sb, si = np.mean(np.diag(S)), S.mean(), S.mean(axis=1)
    return k * k * (sd - sb) ** 2 / ((k - 1) * (np.sum(S * S) - 2 * k * np.sum(si * si) + k * k * sb * sb))

def mauchly(S, nu):
    """W de Mauchly y su χ² con los contrastes polinómicos, desde la matriz k × k de covarianzas (con nu gl)."""
    k = S.shape[0]; p = k - 1; C = polinomicos(k); T = C.T @ S @ C
    det = np.linalg.det(T) if nu >= p else 0.0
    W = det / (np.trace(T) / p) ** p
    if not (W > 1e-300): return {'W': 0.0, 'chi2': float('nan'), 'gl': p * (p + 1) / 2 - 1, 'p': float('nan')}
    chi2 = -(nu - (2 * p * p + p + 2) / (6 * p)) * math.log(W); gl = p * (p + 1) / 2 - 1
    return {'W': W, 'chi2': chi2, 'gl': gl, 'p': float(stats.chi2.sf(chi2, gl))}

def epsilon_hf(gg, p, nu):
    num, den = (nu + 1) * p * gg - 2, p * (nu - p * gg)
    return min(1.0, num / den) if den > 0 and num > 0 else float('nan')

def anova_rm(Y, nivel=0.95):
    Y = np.asarray(Y, float); n, k = Y.shape; p = k - 1
    y = Y.reshape(-1); suj = np.repeat(np.arange(n), k); med = np.tile(np.arange(k), n)
    Ds = (suj[:, None] == np.arange(n)[None, :]).astype(float); Dm = (med[:, None] == np.arange(1, k)[None, :]).astype(float)
    rss = lambda X: float(np.sum((y - X @ np.linalg.lstsq(X, y, rcond=None)[0]) ** 2))
    uno = np.ones((n * k, 1))
    rss_full = rss(np.hstack([Ds, Dm])); rss_suj = rss(Ds); rss_med = rss(np.hstack([uno, Dm])); rss_0 = rss(uno)
    sc_med, sc_suj, sc_err = rss_suj - rss_full, rss_med - rss_full, rss_full
    gl1, gl2 = p, p * (n - 1); F = (sc_med / gl1) / (sc_err / gl2)
    out = {'sc': {'medidas': sc_med, 'sujetos': sc_suj, 'error': sc_err, 'total': rss_0}, 'gl1': gl1, 'gl2': gl2, 'F': F,
           'p': float(stats.f.sf(F, gl1, gl2)), 'eta2p': sc_med / (sc_med + sc_err), 'eta2G': sc_med / (sc_med + sc_suj + sc_err)}
    lo, hi = ic_lambda_f(F, gl1, gl2, nivel); N = gl1 + gl2 + 1
    out['icEta2p'] = [lo / (lo + N), hi / (hi + N)]
    if k >= 3:
        S = np.cov(Y, rowvar=False); m = mauchly(S, n - 1); gg = epsilon_gg_box(S); hf = epsilon_hf(gg, p, n - 1)
        out['esfericidad'] = {**m, 'gg': gg, 'hf': hf, 'lb': 1 / p}
        out['pCorr'] = {c: float(stats.f.sf(F, gl1 * e, gl2 * e)) for c, e in (('gg', gg), ('hf', hf), ('lb', 1 / p)) if not math.isnan(e)}
    return out

def friedman(Y):
    Y = np.asarray(Y, float); n, k = Y.shape
    r = stats.friedmanchisquare(*[Y[:, j] for j in range(k)])
    R = np.apply_along_axis(stats.rankdata, 1, Y).mean(axis=0)
    ee = math.sqrt(k * (k + 1) / (6 * n)); zs = [(R[j] - R[i]) / ee for i, j in pares(k)]   # el par (i, j): el cambio de i a j
    ps = [float(2 * stats.norm.sf(abs(z))) for z in zs]
    return {'chi2': float(r.statistic), 'p': float(r.pvalue), 'W': float(r.statistic) / (n * (k - 1)), 'rangos': R.tolist(),
            'pares': {'z': zs, 'p': ps, 'holm': holm(ps)}}

def mcnemar(n10, n01, nivel=0.95):
    m = n10 + n01; a = (1 - nivel) / 2
    p = 1.0 if m == 0 else float(stats.binomtest(min(n10, n01), m, 0.5).pvalue)
    chi2 = (max(0, abs(n10 - n01) - 1)) ** 2 / m if m else 0.0
    lo = 0.0 if n10 == 0 else stats.beta.ppf(a, n10, n01 + 1); hi = 1.0 if n01 == 0 else stats.beta.ppf(1 - a, n10 + 1, n01)
    odds = lambda q: float('inf') if q >= 1 else q / (1 - q)
    return {'p': p, 'chi2': chi2, 'or': (n10 / n01) if n01 else (float('inf') if n10 else float('nan')), 'icOr': [odds(lo), odds(hi)],
            'g': abs(n10 / m - 0.5) if m else 0.0}

def cochran(Y):
    Y = np.asarray(Y, float); n, k = Y.shape; C, R = Y.sum(axis=0), Y.sum(axis=1); N = C.sum()
    den = float(np.sum(R * (k - R))); Q = k * (k - 1) * float(np.sum((C - C.mean()) ** 2)) / den
    ee = math.sqrt(2 * den / (n * n * k * (k - 1)))   # (pᵢ − pⱼ): la varianza de (Cᵢ − Cⱼ) es 2·ΣRᵢ(k − Rᵢ)/(k(k − 1))
    zs = [(C[j] - C[i]) / n / ee for i, j in pares(k)]; ps = [float(2 * stats.norm.sf(abs(z))) for z in zs]
    return {'Q': Q, 'p': float(stats.chi2.sf(Q, k - 1)), 'eta2Q': Q / (n * (k - 1)), 'pares': {'z': zs, 'p': ps, 'holm': holm(ps)}}

def box_m(grupos):
    """M de Box y su aproximación F (Box, 1949), escrita desde la fórmula."""
    g = len(grupos); k = grupos[0].shape[1]; ns = np.array([G.shape[0] for G in grupos]); N = ns.sum()
    Ss = [np.cov(G, rowvar=False) for G in grupos]; Sp = sum((ni - 1) * S for ni, S in zip(ns, Ss)) / (N - g)
    M = (N - g) * np.linalg.slogdet(Sp)[1] - sum((ni - 1) * np.linalg.slogdet(S)[1] for ni, S in zip(ns, Ss))
    A1 = (np.sum(1 / (ns - 1)) - 1 / (N - g)) * (2 * k * k + 3 * k - 1) / (6 * (k + 1) * (g - 1))
    A2 = (np.sum(1 / (ns - 1) ** 2) - 1 / (N - g) ** 2) * (k - 1) * (k + 2) / (6 * (g - 1))
    v1 = k * (k + 1) * (g - 1) / 2
    if A2 - A1 * A1 > 0:
        v2 = (v1 + 2) / (A2 - A1 * A1); F = M * (1 - A1 - v1 / v2) / v1
    else:
        v2 = (v1 + 2) / (A1 * A1 - A2); F = v2 * M / (v1 * (v2 / (1 - A1 + 2 / v2) - M))
    return {'M': float(M), 'F': float(F), 'gl1': v1, 'gl2': float(v2), 'p': float(stats.f.sf(F, v1, v2)),
            'chi2': float(M * (1 - A1)), 'pChi2': float(stats.chi2.sf(M * (1 - A1), v1))}

def anova_mixta(Y, grupos):
    Y = np.asarray(Y, float); gr = np.asarray(grupos); N, k = Y.shape; p = k - 1; g = int(gr.max()) + 1
    efectos = np.column_stack([np.where(gr == j, 1.0, np.where(gr == g - 1, -1.0, 0.0)) for j in range(g - 1)]) if g > 1 else np.zeros((N, 0))
    uno = np.ones((N, 1))
    def E(X, Z):
        B = np.linalg.lstsq(X, Z, rcond=None)[0]; R = Z - X @ B; return R.T @ R
    Z = Y @ polinomicos(k)
    Ef = E(np.hstack([uno, efectos]), Z); sc_err = float(np.trace(Ef))
    sc_med = float(np.trace(E(efectos, Z) - Ef)) if g > 1 else float(np.trace(E(np.zeros((N, 1)), Z) - Ef))
    sc_int = float(np.trace(E(uno, Z) - Ef)) if g > 1 else 0.0
    # entre sujetos: la suma de las medidas / √k; SC de grupo y de los sujetos dentro de los grupos
    s = Y.sum(axis=1) / math.sqrt(k)
    sc_sg = float(sum(np.sum((s[gr == j] - s[gr == j].mean()) ** 2) for j in range(g))); sc_g = float(np.sum((s - s.mean()) ** 2)) - sc_sg
    Fg = stats.f_oneway(*[Y[gr == j].mean(axis=1) for j in range(g)]).statistic if g > 1 else float('nan')
    glE = p * (N - g)
    def fila(sc, gl):
        F = (sc / gl) / (sc_err / glE); return {'sc': sc, 'gl1': gl, 'gl2': glE, 'F': F, 'p': float(stats.f.sf(F, gl, glE)),
                                                 'eta2p': sc / (sc + sc_err), 'eta2G': sc / (sc + sc_sg + sc_err)}
    out = {'grupo': {'sc': sc_g, 'F': float(Fg), 'p': float(stats.f.sf(Fg, g - 1, N - g)), 'eta2p': sc_g / (sc_g + sc_sg), 'eta2G': sc_g / (sc_g + sc_sg + sc_err)},
           'medidas': fila(sc_med, p), 'interaccion': fila(sc_int, p * (g - 1)) if g > 1 else None, 'scSujetosEnGrupos': sc_sg, 'scError': sc_err,
           'levene': [float(stats.levene(*[Y[gr == j, m] for j in range(g)], center='mean').pvalue) for m in range(k)] if g > 1 else None,
           'box': box_m([Y[gr == j] for j in range(g)]) if g > 1 else None}
    if k >= 3:
        # la matriz de covarianzas conjunta de los grupos (la del error del modelo), sobre las medidas originales
        Sp = sum((np.sum(gr == j) - 1) * np.cov(Y[gr == j], rowvar=False) for j in range(g)) / (N - g)
        m = mauchly(Sp, N - g); gg = epsilon_gg_box(Sp); hf = epsilon_hf(gg, p, N - g)
        out['esfericidad'] = {**m, 'gg': gg, 'hf': hf, 'lb': 1 / p}
        for clave in ('medidas', 'interaccion') if g > 1 else ('medidas',):
            f = out[clave]; f['pCorr'] = {c: float(stats.f.sf(f['F'], f['gl1'] * e, f['gl2'] * e)) for c, e in (('gg', gg), ('hf', hf), ('lb', 1 / p)) if not math.isnan(e)}
    return out

# ---------- los datos ----------
def ar1(k, rho, sd=1.0): return sd * sd * rho ** np.abs(np.subtract.outer(np.arange(k), np.arange(k)))
def cs(k, rho, sd=1.0): return sd * sd * (rho + (1 - rho) * np.eye(k))
mvn = lambda mu, S, n: rng.multivariate_normal(mu, S, n)

datos = {}
x = rng.normal(50, 10, 30); datos['pares_normal'] = [np.round(x, 3).tolist(), np.round(x + rng.normal(3, 6, 30), 3).tolist()]
x = np.round(rng.normal(20, 4, 25)); datos['pares_empates'] = [x.tolist(), (x + np.round(rng.normal(1, 2, 25))).tolist()]
datos['pares_pequena'] = [[12.0, 15.5, 9.0, 20.0, 14.0, 11.0, 17.5, 13.0], [10.0, 14.0, 9.0, 16.5, 13.5, 8.0, 15.0, 13.5]]
datos['pares_todos_positivos'] = [[5.0, 7.0, 6.0, 9.0, 8.0, 7.5], [4.0, 5.5, 5.0, 6.0, 7.0, 7.0]]
datos['rm3'] = np.round(mvn([10, 11, 12.5], cs(3, 0.6, 3), 20), 3).tolist()
datos['rm4_ar'] = np.round(mvn([20, 21, 21.5, 23], ar1(4, 0.85, 4), 35), 3).tolist()
datos['rm5_n6'] = np.round(mvn([5, 5.5, 6, 6, 7], cs(5, 0.5, 1.5), 6), 3).tolist()
datos['rm6_n4'] = np.round(mvn([1, 2, 2, 3, 3, 4], cs(6, 0.5, 1), 4), 3).tolist()
datos['friedman_empates'] = np.clip(np.round(mvn([2.5, 3, 3.2, 3.8], cs(4, 0.5, 1.1), 15)), 1, 5).tolist()
datos['cochran3'] = (mvn([0, 0.4, 0.8], cs(3, 0.5), 40) > 0.3).astype(int).tolist()
datos['cochran4'] = (mvn([0, 0.2, 0.6, 0.1], cs(4, 0.4), 25) > 0.2).astype(int).tolist()
datos['mcnemar'] = [[12, 4], [0, 6], [30, 22], [5, 5], [1, 0], [0, 0]]
g2 = np.array([0] * 15 + [1] * 15); Y = np.vstack([mvn([10, 11, 12], cs(3, 0.6, 2.5), 15), mvn([10, 12.5, 14.5], cs(3, 0.6, 2.5), 15)])
datos['mixto_2x3'] = {'Y': np.round(Y, 3).tolist(), 'g': g2.tolist()}
g3 = np.array([0] * 12 + [1] * 18 + [2] * 9)
Y = np.vstack([mvn([30, 31, 31, 32], ar1(4, 0.8, 5), 12), mvn([29, 31, 33, 35], ar1(4, 0.8, 5), 18), mvn([31, 30, 31, 30], ar1(4, 0.8, 7), 9)])
datos['mixto_3x4'] = {'Y': np.round(Y, 3).tolist(), 'g': g3.tolist()}
g22 = np.array([0] * 10 + [1] * 14); Y = np.vstack([mvn([5, 5.5], cs(2, 0.5, 1.2), 10), mvn([5, 6.5], cs(2, 0.5, 1.2), 14)])
datos['mixto_2x2'] = {'Y': np.round(Y, 3).tolist(), 'g': g22.tolist()}

# ---------- lo esperado ----------
esperado = {'tpareada': {}, 'wilcoxon': {}, 'rm': {}, 'friedman': {}, 'mcnemar': [], 'cochran': {}, 'mixta': {}, 'paresRm': {}}
for c in ('pares_normal', 'pares_empates', 'pares_pequena', 'pares_todos_positivos'):
    a, b = datos[c]; esperado['tpareada'][c] = t_pareada(a, b); esperado['wilcoxon'][c] = wilcoxon(a, b)
for c in ('rm3', 'rm4_ar', 'rm5_n6', 'rm6_n4'):
    esperado['rm'][c] = anova_rm(datos[c])
    Y = np.asarray(datos[c], float); k = Y.shape[1]
    pt = [stats.ttest_rel(Y[:, j], Y[:, i]) for i, j in pares(k)]   # el par (i, j): el cambio de la medida i a la j
    pw = [stats.wilcoxon(Y[:, j], Y[:, i], zero_method='wilcox', correction=False, method='asymptotic') for i, j in pares(k)]
    esperado['paresRm'][c] = {'t': [float(r.statistic) for r in pt], 'pt': [float(r.pvalue) for r in pt], 'holmT': holm([r.pvalue for r in pt]),
                              'zw': [float(r.zstatistic) for r in pw], 'pw': [float(r.pvalue) for r in pw], 'holmW': holm([r.pvalue for r in pw])}
for c in ('rm3', 'rm4_ar', 'friedman_empates'): esperado['friedman'][c] = friedman(datos[c])
for b, c in datos['mcnemar']: esperado['mcnemar'].append(mcnemar(b, c))
for c in ('cochran3', 'cochran4'): esperado['cochran'][c] = cochran(datos[c])
for c in ('mixto_2x3', 'mixto_3x4', 'mixto_2x2'): esperado['mixta'][c] = anova_mixta(datos[c]['Y'], datos[c]['g'])

# los residuos del modelo aditivo (sujeto + medida; con grupos, sujeto + grupo × medida), por mínimos cuadrados en formato
# largo, y los intervalos intra sujetos de Cousineau-Morey del gráfico de perfil
def residuos_lstsq(Y, grupos=None):
    Y = np.asarray(Y, float); n, k = Y.shape; gr = np.zeros(n, int) if grupos is None else np.asarray(grupos); g = gr.max() + 1
    y = Y.reshape(-1); suj = np.repeat(np.arange(n), k); med = np.tile(np.arange(k), n); grl = np.repeat(gr, k)
    Ds = (suj[:, None] == np.arange(n)[None, :]).astype(float)
    Dgm = np.column_stack([((grl == a) & (med == j)).astype(float) for a in range(g) for j in range(1, k)])
    X = np.hstack([Ds, Dgm]); return (y - X @ np.linalg.lstsq(X, y, rcond=None)[0]).tolist()
def morey(Y, nivel=0.95):
    Y = np.asarray(Y, float); n, k = Y.shape; Z = Y - Y.mean(axis=1, keepdims=True) + Y.mean()
    se = Z.std(axis=0, ddof=1) / math.sqrt(n) * math.sqrt(k / (k - 1)); t = stats.t.ppf(1 - (1 - nivel) / 2, n - 1); m = Y.mean(axis=0)
    return {'media': m.tolist(), 'inferior': (m - t * se).tolist(), 'superior': (m + t * se).tolist()}
esperado['residuos'] = {'rm3': residuos_lstsq(datos['rm3']), 'mixto_3x4': residuos_lstsq(datos['mixto_3x4']['Y'], datos['mixto_3x4']['g'])}
esperado['perfil'] = {'rm3': morey(datos['rm3']), 'mixto_3x4': [morey(np.asarray(datos['mixto_3x4']['Y'])[np.asarray(datos['mixto_3x4']['g']) == a]) for a in range(3)]}

# comprobaciones internas del oráculo: el RM de un factor es el mixto con un solo grupo, y la esfericidad no depende de los
# contrastes (Mauchly con los de Helmert, igual que con los polinómicos)
for c in ('rm3', 'rm4_ar'):
    Y = np.asarray(datos[c], float); mx = anova_mixta(Y, [0] * len(Y)); rm = esperado['rm'][c]
    assert abs(mx['medidas']['F'] - rm['F']) < 1e-9 * rm['F'] and abs(mx['esfericidad']['W'] - rm['esfericidad']['W']) < 1e-12
    k = Y.shape[1]; H = np.zeros((k, k - 1))
    for m in range(1, k): H[:m, m - 1] = 1 / math.sqrt(m * (m + 1)); H[m, m - 1] = -m / math.sqrt(m * (m + 1))
    T = H.T @ np.cov(Y, rowvar=False) @ H; W = np.linalg.det(T) / (np.trace(T) / (k - 1)) ** (k - 1)
    assert abs(W - rm['esfericidad']['W']) < 1e-12, (W, rm['esfericidad']['W'])
    # y la ε de Greenhouse-Geisser de Box es la de los contrastes: (tr T)²/(p·tr T²)
    assert abs(np.trace(T) ** 2 / ((k - 1) * np.trace(T @ T)) - rm['esfericidad']['gg']) < 1e-12

# Monte Carlo: bajo la hipótesis nula (covarianzas iguales), la F de la M de Box rechaza en torno al 5 %
mc = np.random.default_rng(7); rechazos = 0; R = 4000
for _ in range(R):
    gs = [mc.multivariate_normal(np.zeros(3), cs(3, 0.5), n) for n in (15, 20, 12)]
    rechazos += box_m(gs)['p'] < 0.05
tasa = rechazos / R
assert 0.04 < tasa < 0.06, tasa
esperado['boxMonteCarlo'] = tasa

destino = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'relacionadas_fixture.json')
with open(destino, 'w', encoding='utf-8') as f: json.dump(a_json({'datos': datos, 'esperado': esperado}), f)
print(f'relacionadas_fixture.json escrito: {len(esperado["tpareada"])} pares, {len(esperado["rm"])} ANOVA de medidas repetidas, '
      f'{len(esperado["friedman"])} Friedman, {len(esperado["mcnemar"])} McNemar, {len(esperado["cochran"])} Cochran, '
      f'{len(esperado["mixta"])} ANOVA mixtos; M de Box bajo H0: {100 * tasa:.1f} % de rechazos en {R} réplicas (SciPy {scipy.__version__})')
