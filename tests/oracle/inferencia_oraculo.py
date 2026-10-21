# inferencia_oraculo.py — oráculo de la inferencia del Analizador (2026.12.10): la comparación de grupos, la regresión (MCO,
# logística, Poisson, ANCOVA, MANOVA), la matriz de correlaciones, el metaanálisis y las funciones del informe y las gráficas.
# Hasta la 2026.12.10 ninguna prueba ejercitaba estos valores p (lo mostró una ejecución en sombra de la batería). Referencias
# con SciPy y con implementaciones propias independientes (Newton-Raphson, IRLS, Wilks, DerSimonian-Laird). Escribe
# inferencia_fixture.json con los datos y los valores esperados; la prueba de JavaScript lee los datos del fixture.
import json, os
import numpy as np
from scipy import stats

rng = np.random.default_rng(20261210)
a = np.round(50 + 10 * rng.standard_normal(25), 1); b = np.round(55 + 12 * rng.standard_normal(30)); c = np.round(48 + 9 * rng.standard_normal(20))
n = 60; x1 = rng.standard_normal(n); x2 = rng.standard_normal(n); y = 2 + 0.5 * x1 - 0.3 * x2 + rng.standard_normal(n)
y01 = (rng.random(n) < 1 / (1 + np.exp(-(-0.3 + 0.9 * x1 - 0.5 * x2)))).astype(int)
cuenta = rng.poisson(np.exp(0.2 + 0.4 * x1 - 0.2 * x2)); grupo = 1 + np.arange(n) % 3; y2 = 0.6 * y + 0.4 * grupo + rng.standard_normal(n)
z1, z2 = rng.standard_normal(n), rng.standard_normal(n)   # (2026.12.12) dos variables lognormales: la rama Spearman de la matriz
sk1 = np.exp(1.2 * z1); sk2 = np.exp(0.8 * (0.5 * z1 + 0.87 * z2))
fs = rng.standard_normal(300); us = rng.standard_normal(300)   # SEM: 4 indicadores, los dos primeros con una covarianza residual real
sem = {f'i{j + 1}': (0.7 * fs + (0.15 * us if j < 2 else 0) + 0.6 * rng.standard_normal(300)).tolist() for j in range(4)}
fi = rng.standard_normal(120)   # fiabilidad: 5 ítems Likert de un mismo factor
items = {f'i{j + 1}': np.clip(np.round(3 + 0.9 * fi + 0.8 * rng.standard_normal(120)), 1, 5).tolist() for j in range(5)}
estudios = [{'etiqueta': f'E{i + 1}', 'r': r, 'n': m} for i, (r, m) in enumerate([(0.32, 120), (0.18, 85), (0.45, 60), (0.27, 200), (0.11, 150), (0.38, 95)])]
E = {}
r = stats.ttest_ind(a, b, equal_var=True); E['tStudent'] = {'t': r.statistic, 'gl': len(a) + len(b) - 2, 'p': r.pvalue}
r = stats.ttest_ind(a, b, equal_var=False); v1, v2 = a.var(ddof=1) / len(a), b.var(ddof=1) / len(b)
E['tWelch'] = {'t': r.statistic, 'gl': (v1 + v2) ** 2 / (v1 ** 2 / (len(a) - 1) + v2 ** 2 / (len(b) - 1)), 'p': r.pvalue}
r = stats.mannwhitneyu(a, b, alternative='two-sided', use_continuity=False, method='asymptotic'); E['mannWhitney'] = {'U': min(r.statistic, len(a) * len(b) - r.statistic), 'p': r.pvalue}
r = stats.f_oneway(a, b, c); E['anova'] = {'F': r.statistic, 'gl1': 2, 'gl2': len(a) + len(b) + len(c) - 3, 'p': r.pvalue}
r = stats.kruskal(a, b, c); E['kruskal'] = {'H': r.statistic, 'gl': 2, 'p': r.pvalue}
X = np.column_stack([np.ones(n), x1, x2]); beta = np.linalg.lstsq(X, y, rcond=None)[0]; res = y - X @ beta; glE = n - 3; s2 = res @ res / glE
se = np.sqrt(np.diag(s2 * np.linalg.inv(X.T @ X))); tc = stats.t.ppf(0.975, glE); sst = (y - y.mean()) @ (y - y.mean()); F = ((sst - res @ res) / 2) / s2
E['ols'] = {'b': beta.tolist(), 'se': se.tolist(), 'p': (2 * stats.t.sf(np.abs(beta / se), glE)).tolist(), 'ic': [[bb - tc * s, bb + tc * s] for bb, s in zip(beta, se)], 'R2': 1 - (res @ res) / sst, 'F': F, 'pF': stats.f.sf(F, 2, glE)}
zc = stats.norm.ppf(0.975)
def newton(M, yy, enlace):
    bb = np.zeros(M.shape[1])
    for _ in range(200):
        eta = M @ bb; mu = 1 / (1 + np.exp(-eta)) if enlace == 'logit' else np.exp(eta); w = mu * (1 - mu) if enlace == 'logit' else mu
        paso = np.linalg.solve(M.T @ (M * w[:, None]), M.T @ (yy - mu)); bb = bb + paso
        if np.max(np.abs(paso)) < 1e-13: break
    eta = M @ bb; mu = 1 / (1 + np.exp(-eta)) if enlace == 'logit' else np.exp(eta); w = mu * (1 - mu) if enlace == 'logit' else mu
    s = np.sqrt(np.diag(np.linalg.inv(M.T @ (M * w[:, None])))); return bb, s
bb, s = newton(np.column_stack([np.ones(n), x1]), y01, 'logit'); E['logistica'] = {'b0': bb[0], 'b1': bb[1], 'se': s[1], 'z': bb[1] / s[1], 'p': 2 * stats.norm.sf(abs(bb[1] / s[1]))}
for clave, yy, enlace in [('logisticaK', y01, 'logit'), ('poissonK', cuenta, 'log')]:
    bb, s = newton(X, yy, enlace); E[clave] = {'b': bb.tolist(), 'se': s.tolist(), 'p': (2 * stats.norm.sf(np.abs(bb / s))).tolist(), 'ic': [[float(np.exp(u - zc * v)), float(np.exp(u + zc * v))] for u, v in zip(bb, s)]}   # en la escala de la OR o la razón de tasas, como el informe
pares = [(y, x1), (y, x2), (x1, x2)]; rr = [stats.pearsonr(u, v) for u, v in pares]; ps = np.array([q.pvalue for q in rr]); orden = np.argsort(ps); holm = np.empty(3); acum = 0
for rango, i in enumerate(orden): acum = max(acum, min(1, (3 - rango) * ps[i])); holm[i] = acum
E['matriz'] = {'r': [q.statistic for q in rr], 'p': ps.tolist(), 'pHolm': holm.tolist()}
G = np.column_stack([(grupo == k).astype(float) for k in (2, 3)]); sse = lambda M: float((lambda e: e @ e)(y - M @ np.linalg.lstsq(M, y, rcond=None)[0]))
M1 = np.column_stack([np.ones(n), G, x1]); glA = n - 4; mse = sse(M1) / glA
pend = np.column_stack([M1, G * x1[:, None]]); Fp = ((sse(M1) - sse(pend)) / 2) / (sse(pend) / (n - 6))
E['ancova'] = {'pFactor': stats.f.sf(((sse(np.column_stack([np.ones(n), x1])) - sse(M1)) / 2) / mse, 2, glA), 'pCov': stats.f.sf((sse(np.column_stack([np.ones(n), G])) - sse(M1)) / mse, 1, glA), 'pPendientes': stats.f.sf(Fp, 2, n - 6)}
Y = np.column_stack([y, y2]); W = sum(((Y[grupo == k] - Y[grupo == k].mean(0)).T @ (Y[grupo == k] - Y[grupo == k].mean(0))) for k in (1, 2, 3)); T = (Y - Y.mean(0)).T @ (Y - Y.mean(0))
L = np.linalg.det(W) / np.linalg.det(T); p_, q_ = 2, 2; t_ = np.sqrt((p_**2 * q_**2 - 4) / (p_**2 + q_**2 - 5)); df1 = p_ * q_; df2 = (n - 1 - (p_ + q_ + 1) / 2) * t_ - df1 / 2 + 1
E['manova'] = {'lambda': L, 'p': stats.f.sf((1 - L ** (1 / t_)) / L ** (1 / t_) * df2 / df1, df1, df2)}
z = np.arctanh([e['r'] for e in estudios]); v = 1 / (np.array([e['n'] for e in estudios]) - 3); w = 1 / v; zf = (w @ z) / w.sum(); Q = w @ (z - zf) ** 2; k = len(z)
tau2 = max(0, (Q - (k - 1)) / (w.sum() - (w @ w) / w.sum())); wr = 1 / (v + tau2); zr = (wr @ z) / wr.sum()
E['meta'] = {'Q': Q, 'tau2': tau2, 'I2': max(0, (Q - (k - 1)) / Q * 100), 'rComb': np.tanh(zr), 'p': 2 * stats.norm.sf(abs(zr) * np.sqrt(wr.sum()))}
Mi = np.column_stack([items[f'i{j + 1}'] for j in range(5)]); ni, ki = Mi.shape; alfa = ki / (ki - 1) * (1 - Mi.var(0, ddof=1).sum() / Mi.sum(1).var(ddof=1))
E['fiabilidad'] = {'alfa': alfa, 'inferior': 1 - (1 - alfa) * stats.f.ppf(0.975, ni - 1, (ni - 1) * (ki - 1)), 'superior': 1 - (1 - alfa) * stats.f.ppf(0.025, ni - 1, (ni - 1) * (ki - 1))}
pares_sp = [(sk1, sk2), (sk1, y), (sk2, y)]; rs = [stats.spearmanr(u, v) for u, v in pares_sp]; ps2 = np.array([q.pvalue for q in rs]); orden2 = np.argsort(ps2); holm2 = np.empty(3); acum = 0
for rango, i in enumerate(orden2): acum = max(acum, min(1, (3 - rango) * ps2[i])); holm2[i] = acum
E['matrizSpearman'] = {'r': [q.statistic for q in rs], 'p': ps2.tolist(), 'pHolm': holm2.tolist()}
E['descriptivosGrupos'] = {nombre: {'media': float(np.mean(v)), 'de': float(np.std(v, ddof=1)), 'mediana': float(np.median(v))} for nombre, v in (('A', a), ('B', b), ('C', c))}
# (2026.12.15) una sola convención en todo el programa, la de SPSS: Levene centrada en la media y Mann-Whitney sin corrección
# por continuidad, también en la cola profunda (grupos separados: la normal aproximada de antes erraba un 0,2 %); ε² de
# Kruskal-Wallis = H/(n − 1) (Tomczak). Hasta la 2026.12.14 la vista principal centraba la Levene en la mediana
# (Brown-Forsythe) y la pestaña de grupos aplicaba la continuidad.
sep1, sep2 = np.arange(1.0, 21.0), np.arange(21.0, 41.0)
E['convenciones'] = {
    'leveneMedia2': stats.levene(a, b, center='mean').pvalue, 'leveneMedia3': stats.levene(a, b, c, center='mean').pvalue,
    'mwSinContinuidad': stats.mannwhitneyu(a, b, use_continuity=False, method='asymptotic').pvalue,
    'mwColaSinContinuidad': stats.mannwhitneyu(sep1, sep2, use_continuity=False, method='asymptotic').pvalue,
    'epsilon2Kruskal': stats.kruskal(a, b, c).statistic / (len(a) + len(b) + len(c) - 1),
    'dCohen': (a.mean() - b.mean()) / np.sqrt(((len(a) - 1) * a.var(ddof=1) + (len(b) - 1) * b.var(ddof=1)) / (len(a) + len(b) - 2)),
    'eta2Anova': (lambda g: sum(len(x) * (x.mean() - np.concatenate(g).mean()) ** 2 for x in g) / ((np.concatenate(g) - np.concatenate(g).mean()) ** 2).sum())([a, b, c])}
E['pCorrelacion'] = [[r_, m, 2 * stats.t.sf(abs(r_) * np.sqrt((m - 2) / (1 - r_ * r_)), m - 2)] for r_, m in [(0.35, 30), (0.6, 10), (-0.2, 100)]]

# (2026.12.17) la inferencia de la correlación del núcleo único (core/stats/correlacion.js), que usan la vista principal, el
# Word, el mapa de correlaciones, la matriz, el diagnóstico de forma y el cribado. Referencias independientes: el p y el IC
# de r de scipy.stats.pearsonr (la distribución exacta de r bajo H0 y la z de Fisher), el p de ρ de scipy.stats.spearmanr,
# el IC de ρ con el error típico de Bonett y Wright (2000) y la potencia por la aproximación de Cohen (1988), la de
# pwr.r.test (z de Fisher con corrección de sesgo frente al r crítico de la t; unilateral: una sola cola), contrastada con
# la potencia EXACTA de la prueba t, integrando la densidad de r con normalidad bivariada (Hotelling, 1953; comprobada por
# Monte Carlo en la revisión). Sustituye a 'pFisher' (el respaldo del Word, que usaba la normal) y a 'potencia' (que
# reproducía la fórmula del Word: z de Fisher simple, que subestima, y en la unilateral también la cola contraria).
# Generador propio: no altera los datos de arriba.
from scipy import special, integrate
def ic_bonett_wright(rho, m, nivel=0.95):
    z, ee, c = np.arctanh(rho), np.sqrt((1 + rho * rho / 2) / (m - 3)), stats.norm.ppf(0.5 + nivel / 2)
    return [float(np.tanh(z - c * ee)), float(np.tanh(z + c * ee))]
def potencia_cohen(r_, m, alfa, bilateral):   # pwr.r.test (Champely), Cohen (1988, cap. 3)
    a_ = abs(r_); tc = stats.t.ppf(1 - alfa / 2 if bilateral else 1 - alfa, m - 2); zc = np.arctanh(np.sqrt(tc ** 2 / (tc ** 2 + m - 2)))
    z = np.arctanh(a_) + a_ / (2 * (m - 1)); raiz = np.sqrt(m - 3)
    return float(stats.norm.cdf((z - zc) * raiz) + (stats.norm.cdf((-z - zc) * raiz) if bilateral else 0.0))
def densidad_r(r_, rho, m):   # densidad exacta de r (Hotelling, 1953)
    lc = np.log(m - 2) + special.gammaln(m - 1) - 0.5 * np.log(2 * np.pi) - special.gammaln(m - 0.5) + (m - 1) / 2 * np.log1p(-rho * rho)
    return np.exp(lc + (m - 4) / 2 * np.log1p(-r_ * r_) - (m - 1.5) * np.log1p(-rho * r_)) * special.hyp2f1(0.5, 0.5, m - 0.5, (1 + rho * r_) / 2)
def potencia_exacta(rho, m, alfa, bilateral):   # P(rechazar con la t de n − 2 gl | ρ), en la dirección de ρ si es unilateral
    tc = stats.t.ppf(1 - alfa / 2 if bilateral else 1 - alfa, m - 2); rc = tc / np.sqrt(tc * tc + m - 2); a_ = abs(rho)
    cola = integrate.quad(lambda u: densidad_r(u, a_, m), rc, 1, epsabs=1e-13, epsrel=1e-11)[0]
    return cola + (integrate.quad(lambda u: densidad_r(u, a_, m), -1, -rc, epsabs=1e-13, epsrel=1e-11)[0] if bilateral else 0.0)
for m in (12, 50):   # la densidad integra 1 y, con ρ = 0, la potencia exacta es α: la referencia está bien construida
    assert abs(integrate.quad(lambda u: densidad_r(u, 0.6, m), -1, 1, epsabs=1e-13)[0] - 1) < 1e-9
    assert abs(potencia_exacta(0.0, m, 0.05, True) - 0.05) < 1e-9 and abs(potencia_exacta(0.0, m, 0.05, False) - 0.05) < 1e-9
rng2 = np.random.default_rng(20261217)
casos_r, datos_r = [], []   # los datos van a 'datos' (el recuento de valores de referencia no los cuenta)
for m, rho, lognormal in [(12, 0.5, False), (30, 0.35, False), (80, -0.2, False), (200, 0.08, False), (25, 0.9, False), (60, 0.5, True), (35, -0.45, True)]:
    Z = rng2.standard_normal((m, 2)); xx = Z[:, 0]; yy = rho * Z[:, 0] + np.sqrt(1 - rho * rho) * Z[:, 1]
    if lognormal: xx = np.exp(1.1 * xx)   # X muy asimétrica: la vista principal elige Spearman
    pr, sr = stats.pearsonr(xx, yy), stats.spearmanr(xx, yy); ci = pr.confidence_interval(0.95)
    r_, s_ = float(pr.statistic), float(sr.statistic)
    datos_r.append({'x': xx.tolist(), 'y': yy.tolist()})
    casos_r.append({'n': m, 'r': r_, 'pBilateral': float(pr.pvalue),
        'pUnilateral': float(stats.pearsonr(xx, yy, alternative='greater' if r_ > 0 else 'less').pvalue), 'icR': [float(ci.low), float(ci.high)],
        'rho': s_, 'pRho': float(sr.pvalue), 'pRhoUnilateral': float(sr.pvalue) / 2, 'icRho': ic_bonett_wright(s_, m),
        'potenciaR': [potencia_cohen(r_, m, 0.05, True), potencia_cohen(r_, m, 0.05, False)], 'potenciaRho': [potencia_cohen(s_, m, 0.05, True), potencia_cohen(s_, m, 0.05, False)]})
potencias = []
for r_, m, alfa, bil in [(0.3, 50, 0.05, True), (0.3, 50, 0.05, False), (0.3, 50, 0.01, True), (0.2, 120, 0.10, False), (0.05, 50, 0.05, False), (0.45, 40, 0.025, True),
                         (-0.25, 90, 0.05, False), (0.5, 12, 0.05, True), (0.35, 30, 0.05, True), (0.7, 20, 0.05, False)]:
    aprox, exacta = potencia_cohen(r_, m, alfa, bil), potencia_exacta(r_, m, alfa, bil)
    assert abs(aprox - exacta) < 0.005, (r_, m, alfa, bil, aprox, exacta)   # en estos casos (en la revisión, con una malla: ≤ 0,003 con n ≥ 30; ≤ 0,013 con n de 12 a 29)
    potencias.append([r_, m, alfa, bil, aprox, exacta])
E['correlacionInferencia'] = {'casos': casos_r, 'potencias': potencias,
    'holm': {'p': [0.01, 0.04, 0.03, 0.005, float('nan'), 0.04], 'ajustados': None}}
ph = E['correlacionInferencia']['holm']; pp = np.array([1.0 if not np.isfinite(v) else v for v in ph['p']]); o = np.argsort(pp, kind='stable'); aj = np.empty(len(pp)); acum = 0.0
for k, i in enumerate(o): acum = max(acum, min(1.0, (len(pp) - k) * pp[i])); aj[i] = acum
ph['ajustados'] = aj.tolist(); ph['p'] = [None if not np.isfinite(v) else v for v in ph['p']]
# (2026.12.19) asimetría y curtosis ajustadas (G1 y G2: scipy.stats.skew y kurtosis con bias=False, las de SPSS), que usan
# la tabla de descriptivos y la lectura de los gráficos (que hasta entonces usaba los momentos sin ajustar), y la recta del
# diagrama de dispersión: pendiente, intercepto, R², p (scipy.stats.linregress), error típico de estimación y la banda de
# confianza al 95 % con la t exacta de n − 2 gl (antes, el gráfico la aproximaba con 1,96 + 2,4/gl).
rng3 = np.random.default_rng(20261219)
series_d = [rng3.normal(50, 10, 30), np.exp(rng3.normal(0, 0.8, 50)), rng3.uniform(1, 5, 12), np.round(rng3.normal(3, 1, 20))]
E['descriptivos'] = [{'media': float(np.mean(v)), 'de': float(np.std(v, ddof=1)), 'asimetria': float(stats.skew(v, bias=False)), 'curtosis': float(stats.kurtosis(v, bias=False)),
    'g1': float(stats.skew(v)), 'g2': float(stats.kurtosis(v))} for v in series_d]
rectas_d, rectas_e = [], []
for m, b1 in ((8, 0.8), (30, -0.4), (120, 0.15)):
    xx = rng3.normal(10, 3, m); yy = 5 + b1 * xx + rng3.normal(0, 2, m); lr = stats.linregress(xx, yy)
    res = yy - (lr.intercept + lr.slope * xx); see = np.sqrt((res ** 2).sum() / (m - 2)); sxx = ((xx - xx.mean()) ** 2).sum()
    malla = np.linspace(xx.min(), xx.max(), 5); tc = stats.t.ppf(0.975, m - 2); medio = tc * see * np.sqrt(1 / m + (malla - xx.mean()) ** 2 / sxx)
    rectas_d.append({'x': xx.tolist(), 'y': yy.tolist(), 'malla': malla.tolist()})
    rectas_e.append({'pendiente': lr.slope, 'intercepto': lr.intercept, 'r2': lr.rvalue ** 2, 'p': lr.pvalue, 'eePendiente': lr.stderr, 'see': float(see),
        'inferior': (lr.intercept + lr.slope * malla - medio).tolist(), 'superior': (lr.intercept + lr.slope * malla + medio).tolist(), 'tAproximadaAntes': 1.96 + 2.4 / (m - 2), 't': float(tc)})
E['rectas'] = rectas_e
# (2026.12.20) el protocolo único de comparación de grupos (core/stats/protocolo-grupos.js), el de la vista principal, la
# pestaña de grupos, el Word y la criba sociodemográfica. El ANOVA de Welch, por la forma general de Welch-James (Johansen,
# 1980: (Cx̄)ᵀ(CVCᵀ)⁻¹(Cx̄) con una matriz de contrastes y su corrección por trazas; con un factor se reduce a la de Welch),
# contrastado con dos identidades y con salidas publicadas de R: con dos grupos, F = t² de la t de Welch de scipy y gl₂ = su
# gl; oneway.test(extra ~ group, sleep) (F = 3.4626, gl₂ = 17.776, p = .07939, los de t.test) y oneway.test(count ~ spray,
# InsectSprays) (F = 36.065, gl₂ = 30.043, p = 7.999e-12), con aov (F = 34.70) y kruskal.test (H = 54.691, p = 1.511e-10)
# para los mismos datos. Los post-hoc: la t con la MCE del ANOVA (por los residuos de la regresión con una variable ficticia
# por grupo), la t de Welch de scipy por par y la z de Dunn (rangos conjuntos de scipy.stats.rankdata y empates de
# numpy.unique; con dos grupos coincide con la U de Mann-Whitney sin continuidad de scipy), con Holm. Y la decisión del
# protocolo en siete conjuntos de datos, uno por rama más uno sin diferencias, con Shapiro-Wilk de scipy y la Levene centrada
# en la media lejos de sus umbrales. Generador propio: no altera los datos de arriba.
rng4 = np.random.default_rng(20261220)

def welch_james(grupos):
    k = len(grupos); medias = np.array([np.mean(g) for g in grupos]); ns = np.array([len(g) for g in grupos], float)
    V = np.diag([np.var(g, ddof=1) / len(g) for g in grupos]); Cc = np.hstack([np.eye(k - 1), -np.ones((k - 1, 1))])   # cada grupo frente al último
    Minv = np.linalg.inv(Cc @ V @ Cc.T); dif = Cc @ medias; T = float(dif @ Minv @ dif); Pm = V @ Cc.T @ Minv @ Cc; A_ = 0.0
    for j in range(k):
        Q = np.zeros((k, k)); Q[j, j] = 1.0; PQ = Pm @ Q; A_ += (np.trace(PQ @ PQ) + np.trace(PQ) ** 2) / (ns[j] - 1)
    A_ /= 2; r_ = k - 1; c_ = r_ + 2 * A_ - 6 * A_ / (r_ + 2); F = T / c_; gl2 = r_ * (r_ + 2) / (3 * A_)
    return {'F': F, 'gl1': r_, 'gl2': gl2, 'p': float(stats.f.sf(F, r_, gl2))}

def eta2(grupos):
    todo = np.concatenate(grupos); return float(sum(len(g) * (np.mean(g) - todo.mean()) ** 2 for g in grupos) / ((todo - todo.mean()) ** 2).sum())

def holm_lista(ps):
    ps = np.array([1.0 if not np.isfinite(v) else v for v in ps], float); o = np.argsort(ps, kind='stable'); aj = np.empty(len(ps)); acum = 0.0
    for kk, i in enumerate(o): acum = max(acum, min(1.0, (len(ps) - kk) * ps[i])); aj[i] = acum
    return aj.tolist()

def pares_mce(grupos):
    k = len(grupos); yv = np.concatenate(grupos); X_ = np.zeros((len(yv), k)); fila = 0
    for j, g in enumerate(grupos): X_[fila:fila + len(g), j] = 1.0; fila += len(g)   # una ficticia por grupo, sin intercepto: b = medias
    b_ = np.linalg.lstsq(X_, yv, rcond=None)[0]; e_ = yv - X_ @ b_; gl = len(yv) - k; mce = float(e_ @ e_) / gl; salida = []
    for i in range(k):
        for j in range(i + 1, k):
            t = (b_[i] - b_[j]) / np.sqrt(mce * (1 / len(grupos[i]) + 1 / len(grupos[j]))); salida.append({'estadistico': float(t), 'gl': gl, 'p': float(2 * stats.t.sf(abs(t), gl))})
    return salida

def pares_welch(grupos):
    salida = []
    for i in range(len(grupos)):
        for j in range(i + 1, len(grupos)):
            r = stats.ttest_ind(grupos[i], grupos[j], equal_var=False); salida.append({'estadistico': float(r.statistic), 'gl': float(r.df), 'p': float(r.pvalue)})
    return salida

def pares_dunn(grupos):
    todo = np.concatenate(grupos); N = len(todo); rk = stats.rankdata(todo); _, cuentas = np.unique(todo, return_counts=True)
    s2 = N * (N + 1) / 12 - float(np.sum(cuentas.astype(float) ** 3 - cuentas)) / (12 * (N - 1)); cortes = np.cumsum([0] + [len(g) for g in grupos])
    rm = [rk[cortes[j]:cortes[j + 1]].mean() for j in range(len(grupos))]; salida = []
    for i in range(len(grupos)):
        for j in range(i + 1, len(grupos)):
            z = (rm[i] - rm[j]) / np.sqrt(s2 * (1 / len(grupos[i]) + 1 / len(grupos[j]))); salida.append({'estadistico': float(z), 'gl': None, 'p': float(2 * stats.norm.sf(abs(z)))})
    return salida

# las identidades y las salidas publicadas de R
sleep = [[0.7, -1.6, -0.2, -1.2, -0.1, 3.4, 3.7, 0.8, 0.0, 2.0], [1.9, 0.8, 1.1, 0.1, -0.1, 4.4, 5.5, 1.6, 4.6, 3.4]]
insect = [[10, 7, 20, 14, 14, 12, 10, 23, 17, 20, 14, 13], [11, 17, 21, 11, 16, 14, 17, 17, 19, 21, 7, 13], [0, 1, 7, 2, 3, 1, 2, 1, 3, 0, 1, 4],
          [3, 5, 12, 6, 4, 3, 5, 5, 5, 5, 2, 4], [3, 5, 3, 5, 3, 6, 1, 1, 3, 2, 6, 4], [11, 9, 15, 22, 15, 16, 13, 10, 26, 26, 24, 13]]
ws = welch_james([np.array(g, float) for g in sleep]); tw = stats.ttest_ind(sleep[0], sleep[1], equal_var=False)
assert abs(ws['F'] / tw.statistic ** 2 - 1) < 1e-12 and abs(ws['gl2'] / tw.df - 1) < 1e-12, (ws, tw)
assert abs(ws['F'] - 3.4626) < 5e-5 and abs(ws['gl2'] - 17.776) < 5e-4 and abs(ws['p'] - 0.07939) < 5e-6, ws
wi = welch_james([np.array(g, float) for g in insect]); ai = stats.f_oneway(*insect); ki = stats.kruskal(*insect)
assert abs(wi['F'] - 36.065) < 5e-4 and abs(wi['gl2'] - 30.043) < 5e-4 and abs(wi['p'] / 7.999e-12 - 1) < 2e-4, wi
assert abs(ai.statistic - 34.70) < 5e-3 and abs(ki.statistic - 54.691) < 5e-4 and abs(ki.pvalue / 1.511e-10 - 1) < 5e-4, (ai, ki)
d2 = [np.round(rng4.normal(3, 1, 15)), np.round(rng4.normal(3.6, 1, 18))]   # Dunn con dos grupos y empates = Mann-Whitney sin continuidad
mw2 = stats.mannwhitneyu(d2[0], d2[1], use_continuity=False, method='asymptotic'); dz2 = pares_dunn(d2)[0]
assert abs(dz2['p'] - mw2.pvalue) < 1e-12, (dz2, mw2)
E['gruposR'] = {'sleep': {'F': 3.4626, 'gl2': 17.776, 'p': 0.07939, 'welchJames': ws}, 'insect': {'F': 36.065, 'gl2': 30.043, 'p': 7.999e-12, 'welchJames': wi,
    'anovaF': 34.70, 'kruskalH': 54.691, 'kruskalP': 1.511e-10}, 'dunnDos': {'p': float(mw2.pvalue), 'pDunn': dz2['p']}}

# la decisión del protocolo: un conjunto por rama, lejos de los umbrales (Shapiro-Wilk de scipy, el algoritmo de Royston)
def normales(g): return stats.shapiro(g).pvalue
def protocolo(grupos):
    k = len(grupos); pn = [float(normales(g)) for g in grupos]; pl = float(stats.levene(*grupos, center='mean').pvalue)
    todas, homog = all(p > 0.05 for p in pn), pl > 0.05
    clave = ('mann-whitney' if k == 2 else 'kruskal-wallis') if not todas else (('student' if k == 2 else 'anova') if homog else ('welch' if k == 2 else 'anova-welch'))
    if clave == 'student': r = stats.ttest_ind(*grupos); g = {'estadistico': float(r.statistic), 'gl': float(r.df), 'p': float(r.pvalue)}
    elif clave == 'welch': r = stats.ttest_ind(*grupos, equal_var=False); g = {'estadistico': float(r.statistic), 'gl': float(r.df), 'p': float(r.pvalue)}
    elif clave == 'mann-whitney':
        r = stats.mannwhitneyu(*grupos, use_continuity=False, method='asymptotic'); g = {'estadistico': float(min(r.statistic, len(grupos[0]) * len(grupos[1]) - r.statistic)), 'gl': None, 'p': float(r.pvalue)}
    elif clave == 'anova': r = stats.f_oneway(*grupos); g = {'estadistico': float(r.statistic), 'gl': [k - 1, sum(map(len, grupos)) - k], 'p': float(r.pvalue), 'eta2': eta2(grupos)}
    elif clave == 'anova-welch': r = welch_james(grupos); g = {'estadistico': r['F'], 'gl': [k - 1, r['gl2']], 'p': r['p'], 'eta2': eta2(grupos)}
    else: r = stats.kruskal(*grupos); g = {'estadistico': float(r.statistic), 'gl': k - 1, 'p': float(r.pvalue), 'epsilon2': float(r.statistic) / (sum(map(len, grupos)) - 1)}
    ph = None
    if k >= 3 and g['p'] < 0.05:
        metodo = {'anova': 'mce', 'anova-welch': 'welch', 'kruskal-wallis': 'dunn'}[clave]; pares = {'mce': pares_mce, 'welch': pares_welch, 'dunn': pares_dunn}[metodo](grupos)
        aj = holm_lista([q['p'] for q in pares]); ph = {'metodo': metodo, 'pares': [dict(q, pHolm=a) for q, a in zip(pares, aj)]}
    return {'normalidad': pn, 'levene': pl, 'prueba': clave, 'global': g, 'significativa': g['p'] < 0.05, 'postHoc': ph}
def lejos(res, pide):   # los supuestos y la prueba global lejos de .05: la decisión no depende de diferencias de 1e-7 entre programas
    if any(0.01 < p < 0.20 for p in res['normalidad']) or 0.01 < res['levene'] < 0.20 or 0.01 < res['global']['p'] < 0.20: return False
    return res['prueba'] == pide['prueba'] and res['significativa'] == pide['significativa']
casos_def = [   # nombre, rama pedida, significativa, tamaños, generador por grupo (i, n)
    ('student', 'student', True, (18, 24), lambda i, m: np.round(rng4.normal(50 + 6 * i, 5, m), 2)),
    ('welch', 'welch', True, (15, 30), lambda i, m: np.round(rng4.normal(50 + 5 * i, 2 + 6 * i, m), 2)),
    ('mannWhitney', 'mann-whitney', True, (20, 25), lambda i, m: np.round(rng4.normal(50, 5, m), 2) if i == 0 else np.round(np.exp(rng4.normal(4.05, 0.6, m)), 2)),
    ('anova', 'anova', True, (14, 20, 26), lambda i, m: np.round(rng4.normal((50, 53, 58)[i], 5, m), 2)),
    ('anovaWelch', 'anova-welch', True, (10, 16, 22, 30), lambda i, m: np.round(rng4.normal((56, 50, 47, 49)[i], (9, 5, 3, 1.5)[i], m), 2)),
    ('kruskal', 'kruskal-wallis', True, (12, 18, 22, 15), lambda i, m: np.clip(np.round(3 + 0.55 * i + rng4.normal(0, 1, m)), 1, 5)),
    ('sinDiferencias', 'anova', False, (16, 16, 21), lambda i, m: np.round(rng4.normal(50, 5, m), 2))]
datos_grupos, casos_grupos = {}, {}
for nombre, rama, sig, tams, gen in casos_def:
    for intento in range(2000):
        gs = [gen(i, m) for i, m in enumerate(tams)]; res = protocolo(gs)
        if lejos(res, {'prueba': rama, 'significativa': sig}): break
    else: raise SystemExit(f'no se encontró un conjunto para {nombre}')
    datos_grupos[nombre] = [g.tolist() for g in gs]; casos_grupos[nombre] = res
    if len(gs) >= 3:   # los tres post-hoc con todos los conjuntos de tres o más grupos, no solo el de su rama
        res['paresTodos'] = {m: [dict(q, pHolm=a) for q, a in zip(pares, holm_lista([q['p'] for q in pares]))]
                             for m, pares in (('mce', pares_mce(gs)), ('welch', pares_welch(gs)), ('dunn', pares_dunn(gs)))}
E['protocoloGrupos'] = casos_grupos
# (2026.12.21) los mínimos cuadrados del núcleo único (core/stats/mco.js, por la QR de Householder de core/linalg/qr.js), los
# de la regresión múltiple, la avanzada, el ANCOVA, el mejor modelo, la nube y las formas. Referencias independientes de la
# QR: la solución EXACTA en aritmética racional (fractions: las ecuaciones normales resueltas sin redondeo, y con ellas
# (X'X)⁻¹, los VIF por las regresiones auxiliares de cada predictor —no por la identidad que usa el núcleo— y lo demás);
# numpy.linalg.lstsq (SVD de LAPACK) no sirve de referencia con diseños mal condicionados o de escalas muy distintas: en
# estos diseños se aparta de la exacta hasta 7·10⁻⁸ en los ajustados, la QR menos de 4·10⁻¹¹. Y la salida publicada de R
# para summary(lm(mpg ~ wt + hp, data = mtcars)) (b = 37.22727, −3.87783, −0.03177; EE = 1.59879, 0.63273, 0.00903;
# R² = .8268; F(2, 29) = 69.21, p = 9.109e-12). Diseños: bien condicionados, con predictores en escalas de 10⁻⁴ a 10⁵ (el
# criterio de colinealidad no debe depender de las unidades), mal condicionados (una cúbica de ingresos, κ(X) ≈ 3·10¹²; una
# cuadrática de años), ponderados, y colineales (exactos, escalados por 10⁶, combinación de dos, constante, la cúbica de un
# año), que el núcleo debe rechazar. Generador propio: no altera los datos de arriba.
from fractions import Fraction
rng5 = np.random.default_rng(20261221)
def resolver_exacto(G, c):   # eliminación de Gauss-Jordan en racionales: la solución y la inversa exactas
    m_ = len(G); M = [[Fraction(v) for v in fila] + [Fraction(c[a])] + [Fraction(int(a == j)) for j in range(m_)] for a, fila in enumerate(G)]
    for k_ in range(m_):
        piv = next(r for r in range(k_, m_) if M[r][k_] != 0); M[k_], M[piv] = M[piv], M[k_]
        pk = M[k_][k_]; M[k_] = [v / pk for v in M[k_]]
        for r in range(m_):
            if r != k_ and M[r][k_] != 0:
                f_ = M[r][k_]; M[r] = [a_ - f_ * b_ for a_, b_ in zip(M[r], M[k_])]
    return [M[a][m_] for a in range(m_)], [[M[a][m_ + 1 + j] for j in range(m_)] for a in range(m_)]
def mco_exacto(yv, cols, w=None):
    n_ = len(yv); Y = [Fraction(float(v)) for v in yv]; C = [[Fraction(float(v)) for v in c] for c in cols]; W = [Fraction(float(v)) for v in w] if w is not None else [Fraction(1)] * n_
    X = [[Fraction(1)] + [c[i] for c in C] for i in range(n_)]; p_ = len(cols) + 1
    G = [[sum(W[i] * X[i][a] * X[i][b_] for i in range(n_)) for b_ in range(p_)] for a in range(p_)]; c_ = [sum(W[i] * X[i][a] * Y[i] for i in range(n_)) for a in range(p_)]
    beta, inv = resolver_exacto(G, c_); aj = [sum(X[i][j] * beta[j] for j in range(p_)) for i in range(n_)]
    return Y, C, X, W, beta, inv, aj, sum(W[i] * (Y[i] - aj[i]) ** 2 for i in range(n_))
def mco_ref(yv, cols, w=None):
    Y, C, X, W, beta, inv, aj, sce = mco_exacto(yv, cols, w); n_, p_ = len(Y), len(beta)
    Xf = np.column_stack([np.ones(n_)] + [np.asarray(c, float) for c in cols]); sv = np.linalg.svd(Xf * (np.sqrt(np.asarray(w, float))[:, None] if w is not None else 1), compute_uv=False)
    salida = {'beta': [float(v) for v in beta], 'ajustados': [float(v) for v in aj], 'sce': float(sce), 'diagInversa': [float(inv[j][j]) for j in range(p_)], 'cond': float(sv[0] / sv[-1])}
    if w is None:
        gl = n_ - p_; s2 = sce / gl; my_ = sum(Y) / n_; sct = sum((v - my_) ** 2 for v in Y); k_ = p_ - 1
        ee = [float(np.sqrt(float(s2 * inv[j][j]))) for j in range(p_)]; b_ = [float(v) for v in beta]; t_ = [b_[j] / ee[j] for j in range(p_)]; tc = stats.t.ppf(0.975, gl)
        r2 = 1 - sce / sct; F_ = ((sct - sce) / k_) / s2
        vif = []
        for j in range(k_):   # el VIF por las regresiones auxiliares exactas, no por la identidad del núcleo
            otros = [cols[m] for m in range(k_) if m != j]
            if not otros: vif.append(1.0); continue
            _, Cj, _, _, _, _, _, scej = mco_exacto(cols[j], otros); xj = [Fraction(float(v)) for v in cols[j]]; mj = sum(xj) / n_
            vif.append(float(min(Fraction(10) ** 9, sum((v - mj) ** 2 for v in xj) / scej)))
        de = lambda v: float(np.std(np.asarray(v, float), ddof=1))
        salida.update({'gl': gl, 'ee': ee, 't': t_, 'p': [float(2 * stats.t.sf(abs(v), gl)) for v in t_],
            'ic': [[b_[j] - tc * ee[j], b_[j] + tc * ee[j]] for j in range(p_)], 'sct': float(sct), 'r2': float(r2), 'r2aj': float(1 - (1 - r2) * (n_ - 1) / gl),
            'F': float(F_), 'pF': float(stats.f.sf(float(F_), k_, gl)), 'errorTipico': float(np.sqrt(float(s2))),
            'betaEstandarizado': [b_[j + 1] * de(cols[j]) / de(yv) for j in range(k_)], 'vif': vif if k_ >= 2 else [1.0] * k_})
    return salida
mtcars = {'mpg': [21.0, 21.0, 22.8, 21.4, 18.7, 18.1, 14.3, 24.4, 22.8, 19.2, 17.8, 16.4, 17.3, 15.2, 10.4, 10.4, 14.7, 32.4, 30.4, 33.9, 21.5, 15.5, 15.2, 13.3, 19.2, 27.3, 26.0, 30.4, 15.8, 19.7, 15.0, 21.4],
          'wt': [2.620, 2.875, 2.320, 3.215, 3.440, 3.460, 3.570, 3.190, 3.150, 3.440, 3.440, 4.070, 3.730, 3.780, 5.250, 5.424, 5.345, 2.200, 1.615, 1.835, 2.465, 3.520, 3.435, 3.840, 3.845, 1.935, 2.140, 1.513, 3.170, 2.770, 3.570, 2.780],
          'hp': [110, 110, 93, 110, 175, 105, 245, 62, 95, 123, 123, 180, 180, 180, 205, 215, 230, 66, 52, 65, 97, 150, 150, 245, 175, 66, 91, 113, 264, 175, 335, 109]}
rm = mco_ref(mtcars['mpg'], [mtcars['wt'], mtcars['hp']])
assert max(abs(a - b) for a, b in zip(rm['beta'], [37.22727, -3.87783, -0.03177])) < 5e-6 and max(abs(a - b) for a, b in zip(rm['ee'], [1.59879, 0.63273, 0.00903])) < 5e-6, rm
assert abs(rm['r2'] - 0.8268) < 5e-5 and abs(rm['F'] - 69.21) < 5e-3 and abs(rm['pF'] / 9.109e-12 - 1) < 1e-4 and abs(rm['errorTipico'] - 2.593) < 5e-4, rm
disenos_d, disenos_e = {}, {}
def agregar_diseno(nombre, yv, cols, w=None):
    disenos_d[nombre] = {'y': [float(v) for v in yv], 'cols': [[float(v) for v in c] for c in cols], 'pesos': None if w is None else [float(v) for v in w]}
    disenos_e[nombre] = mco_ref(yv, cols, w)
agregar_diseno('mtcars', mtcars['mpg'], [mtcars['wt'], mtcars['hp']])
zz = rng5.standard_normal((80, 4)); m1 = 50 + 10 * zz[:, 0]; m2 = 30 + 6 * (0.5 * zz[:, 0] + 0.87 * zz[:, 1]); m3 = 10 + 2 * (0.3 * zz[:, 1] + 0.95 * zz[:, 2])   # m1..m3: x1 y x2 son datos de arriba
agregar_diseno('normal', np.round(5 + 0.3 * m1 - 0.2 * m2 + 0.5 * m3 + 3 * zz[:, 3], 2), [np.round(m1, 2), np.round(m2, 2), np.round(m3, 2)])
ze = rng5.standard_normal((60, 4)); a1, a2, a3 = 1e-4 * (5 + ze[:, 0]), 50 + 10 * ze[:, 1], 1e5 * (3 + 0.5 * (0.6 * ze[:, 1] + 0.8 * ze[:, 2]))
agregar_diseno('escalas', 2 + 3e4 * a1 + 0.1 * a2 + 2e-5 * a3 + ze[:, 3], [a1, a2, a3])
xi = rng5.uniform(1000, 9000, 120); agregar_diseno('cubicaIngresos', 3 + 0.001 * xi + rng5.standard_normal(120), [xi, xi ** 2, xi ** 3])
xa = np.round(rng5.uniform(1990, 2024, 100), 1); agregar_diseno('cuadraticaAnio', 0.05 * (xa - 2005) ** 2 + rng5.standard_normal(100), [xa, xa ** 2])
xc = rng5.standard_normal(70); xcc = xc + 1e-5 * rng5.standard_normal(70)   # casi colineales (parte propia relativa ≈ 10⁻⁵ > 10⁻⁷): se estima
agregar_diseno('casiColineal', 1 + xc + rng5.standard_normal(70), [xc, xcc])
xw = rng5.uniform(0, 10, 50); ww = rng5.uniform(0.5, 4, 50); agregar_diseno('ponderada', 2 + 0.7 * xw + rng5.standard_normal(50) / np.sqrt(ww), [xw, np.sqrt(xw)], ww)
for nombre, e_ in disenos_e.items():
    if nombre != 'ponderada': assert e_['gl'] > 0
colineales = {}
xr = rng5.standard_normal(40); yr = rng5.standard_normal(40); xg = 1e6 * (3 + xr); xan = np.round(rng5.uniform(1990, 2024, 60), 1)
for nombre, yv, cols in (('duplicada', yr, [xr, xr.copy()]), ('escaladaMillon', yr, [xg, 2 * xg + 3e6]), ('suma', yr, [xr, xr ** 2, xr + xr ** 2]),
                         ('constante', yr, [xr, np.full(40, 7.0)])):
    X = np.column_stack([np.ones(len(yv))] + list(cols)); assert np.linalg.matrix_rank(X) < X.shape[1], nombre   # rango deficiente para la SVD de NumPy
    colineales[nombre] = {'y': [float(v) for v in yv], 'cols': [[float(v) for v in c] for c in cols]}
# la cúbica de un año EN CRUDO (x, x², x³): X es singular en doble precisión sin centrar (κ ≈ 10¹⁷), pero el núcleo centra
# cada predictor antes de la QR y la estima con la precisión de la exacta
ya_ = rng5.standard_normal(60); agregar_diseno('cubicaAnioCruda', ya_, [xan, xan ** 2, xan ** 3])
E['mco'] = disenos_e
# la selección del mejor modelo con X = años: los polinomios centrados (bien condicionados) dan la SCE exacta de cada grado
xcen = xan - xan.mean()
E['mcoAnio'] = {nombre: mco_ref(ya_, [xcen ** (j + 1) for j in range(g)])['sce'] for nombre, g in (('Lineal', 1), ('Cuadrática', 2), ('Cúbica', 3))}
E['mcoAnio']['sct'] = float(((ya_ - ya_.mean()) ** 2).sum())
# (2026.12.22) los modelos lineales generalizados del núcleo único (core/stats/mlg.js: IRLS sobre la QR ponderada, el
# algoritmo de glm de R), los de la logística simple del mejor modelo y la logística múltiple y Poisson de la regresión
# avanzada. Referencia independiente del IRLS, de la QR y de la doble precisión: el método de Newton con paso amortiguado en
# aritmética DECIMAL de 50 cifras (exp, ln y raíz de decimal; el sistema de cada paso y la inversa de la información por
# Gauss-Jordan en decimal), sobre los mismos valores binarios de los datos (Decimal(float) es exacto). Y la salida publicada
# de R para glm(am ~ wt, binomial, mtcars) y glm(count ~ spray, poisson, InsectSprays). Diseños: bien condicionados, con
# predictores de escalas 10⁻⁴ y 10⁵ y con una fecha AAAAMMDD (donde el Newton de las copias anteriores no convergía o daba
# errores típicos erróneos), eventos raros y un efecto fuerte sin separación. Generador propio: no altera los datos de arriba.
from decimal import Decimal, getcontext
getcontext().prec = 50
rng6 = np.random.default_rng(20261222)
def resolver_decimal(G, c):   # Gauss-Jordan con pivoteo parcial en decimal: la solución y la inversa
    m_ = len(G); M = [[Decimal(v) for v in fila] + [Decimal(c[a])] + [Decimal(int(a == j)) for j in range(m_)] for a, fila in enumerate(G)]
    for k_ in range(m_):
        piv = max(range(k_, m_), key=lambda r_: abs(M[r_][k_])); M[k_], M[piv] = M[piv], M[k_]
        pk = M[k_][k_]; M[k_] = [v / pk for v in M[k_]]
        for r_ in range(m_):
            if r_ != k_ and M[r_][k_] != 0:
                f_ = M[r_][k_]; M[r_] = [a_ - f_ * b_ for a_, b_ in zip(M[r_], M[k_])]
    return [M[a][m_] for a in range(m_)], [[M[a][m_ + 1 + j] for j in range(m_)] for a in range(m_)]
PI_DECIMAL = Decimal('3.14159265358979323846264338327950288419716939937510582097494')
BERNOULLI_PARES = [Fraction(1, 6), Fraction(-1, 30), Fraction(1, 42), Fraction(-1, 30), Fraction(5, 66), Fraction(-691, 2730),
                   Fraction(7, 6), Fraction(-3617, 510), Fraction(43867, 798), Fraction(-174611, 330)]   # B₂ … B₂₀
def lnfact_decimal(v):   # ln v!: la suma de logaritmos hasta 40 y, desde ahí, la serie de Stirling (error < 10⁻³⁰)
    if v < 40: return sum((Decimal(q).ln() for q in range(2, v + 1)), Decimal(0))
    z = Decimal(v + 1); s = (z - Decimal('0.5')) * z.ln() - z + (2 * PI_DECIMAL).ln() / 2
    for k_, b_ in enumerate(BERNOULLI_PARES, 1): s += Decimal(b_.numerator) / Decimal(b_.denominator) / (2 * k_ * (2 * k_ - 1) * z ** (2 * k_ - 1))
    return s
def mlg_decimal(yv, cols, familia):
    n_, p_, logit = len(yv), len(cols) + 1, familia == 'logistica'
    Y = [Decimal(int(v)) for v in yv]; X = [[Decimal(1)] + [Decimal(float(c[i])) for c in cols] for i in range(n_)]
    lnfact = [lnfact_decimal(int(v)) for v in yv]   # ln y!
    eta_de = lambda bb: [sum(X[i][j] * bb[j] for j in range(p_)) for i in range(n_)]
    mu_de = lambda e: 1 / (1 + (-e).exp()) if logit else e.exp()
    def llf(bb):
        return sum(((Y[i] * e - (1 + e.exp()).ln()) if logit else (Y[i] * e - e.exp() - lnfact[i])) for i, e in enumerate(eta_de(bb)))
    ybar = sum(Y) / n_; bb = [Decimal(0)] * p_
    if not logit: bb[0] = ybar.ln()
    ll = llf(bb)
    for _ in range(300):
        mus = [mu_de(e) for e in eta_de(bb)]; w = [m * (1 - m) if logit else m for m in mus]
        U = [sum(X[i][a] * (Y[i] - mus[i]) for i in range(n_)) for a in range(p_)]
        I_ = [[sum(w[i] * X[i][a] * X[i][b_] for i in range(n_)) for b_ in range(p_)] for a in range(p_)]
        paso, _ = resolver_decimal(I_, U); t_ = Decimal(1)
        while True:   # paso amortiguado: la log-verosimilitud no baja (salvo el redondeo de la cifra 50)
            nuevo = [bb[j] + t_ * paso[j] for j in range(p_)]; lln = llf(nuevo)
            if lln >= ll - abs(ll) * Decimal('1e-45') or t_ < Decimal('1e-30'): break
            t_ /= 2
        bb, ll = nuevo, lln
        if max(abs(t_ * v) / max(Decimal(1), abs(bb[j])) for j, v in enumerate(paso)) < Decimal('1e-40'): break
    else: raise SystemExit(f'el Newton decimal no convergió ({familia})')
    mus = [mu_de(e) for e in eta_de(bb)]; w = [m * (1 - m) if logit else m for m in mus]
    _, inv = resolver_decimal([[sum(w[i] * X[i][a] * X[i][b_] for i in range(n_)) for b_ in range(p_)] for a in range(p_)], [Decimal(0)] * p_)
    ee = [inv[j][j].sqrt() for j in range(p_)]; z_ = [bb[j] / ee[j] for j in range(p_)]
    ll0 = (n_ * (ybar * ybar.ln() + (1 - ybar) * (1 - ybar).ln())) if logit else sum(Y[i] * ybar.ln() - ybar - lnfact[i] for i in range(n_))
    sat = Decimal(0) if logit else sum((Y[i] * Y[i].ln() - Y[i] if Y[i] > 0 else Decimal(0)) - lnfact[i] for i in range(n_))
    chi2 = sum((Y[i] - mus[i]) ** 2 / (mus[i] * (1 - mus[i]) if logit else mus[i]) for i in range(n_))
    zc_ = stats.norm.ppf(0.975); bf = [float(v) for v in bb]; ef = [float(v) for v in ee]
    return {'beta': bf, 'ee': ef, 'z': [float(v) for v in z_], 'p': [float(2 * stats.norm.sf(abs(float(v)))) for v in z_],
            'ic': [[bf[j] - zc_ * ef[j], bf[j] + zc_ * ef[j]] for j in range(p_)], 'll': float(ll), 'll0': float(ll0),
            'dev': float(2 * (sat - ll)), 'dev0': float(2 * (sat - ll0)), 'aic': float(-2 * ll + 2 * p_), 'mcFadden': float(1 - ll / ll0),
            'dispersion': float(chi2 / (n_ - p_)), 'mu': [float(m) for m in mus]}
mlg_d, mlg_e = {}, {}
def agregar_mlg(nombre, familia, yv, cols):
    mlg_d[nombre] = {'familia': familia, 'y': [int(v) for v in yv], 'cols': [[float(v) for v in c] for c in cols]}
    mlg_e[nombre] = mlg_decimal(yv, cols, familia)
am = [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1]
insect = [[10, 7, 20, 14, 14, 12, 10, 23, 17, 20, 14, 13], [11, 17, 21, 11, 16, 14, 17, 17, 19, 21, 7, 13], [0, 1, 7, 2, 3, 1, 2, 1, 3, 0, 1, 4],
          [3, 5, 12, 6, 4, 3, 5, 5, 5, 5, 2, 4], [3, 5, 3, 5, 3, 6, 1, 1, 3, 2, 6, 4], [11, 9, 15, 22, 15, 16, 13, 10, 26, 26, 24, 13]]
agregar_mlg('mtcars', 'logistica', am, [mtcars['wt']])
agregar_mlg('insect', 'poisson', [v for g in insect for v in g], [[float(i == g) for i, grupo_ in enumerate(insect) for _ in grupo_] for g in range(1, 6)])
# la salida publicada de R (summary(glm(...)), tal como se imprime): el oráculo decimal debe reproducirla en las cifras
# impresas (media unidad de la última), y la prueba de JavaScript compara el núcleo con ella con la misma regla
R_mlg = {'mtcars': {'b': ['12.040', '-4.024'], 'ee': ['4.510', '1.437'], 'z': ['2.670', '-2.801'], 'p': ['0.00759', '0.00509'], 'dev': '19.176', 'dev0': '43.230', 'aic': '23.176'},
         'insect': {'b': ['2.67415', '0.05588', '-1.94018', '-1.08152', '-1.42139', '0.13926'], 'ee': ['0.07581', '0.10574', '0.21389', '0.15065', '0.17192', '0.10367'],
                    'z': ['35.274', '0.528', '-9.071', '-7.179', '-8.268', '1.343'], 'p': [None, '0.597', None, '7.03e-13', None, '0.179'], 'dev': '98.329', 'dev0': '409.041', 'aic': '376.59'}}
def cifra_impresa(s_):   # media unidad de la última cifra impresa de un número escrito como lo imprime R
    mant = s_.lower().split('e')[0]; dec = len(mant.split('.')[1]) if '.' in mant else 0
    return 0.5 * 10 ** (-dec) * (10 ** int(s_.lower().split('e')[1]) if 'e' in s_.lower() else 1) * (1 + 1e-9)
for nombre_, ref_ in R_mlg.items():
    got = mlg_e[nombre_]
    for clave_, salida_ in (('b', 'beta'), ('ee', 'ee'), ('z', 'z'), ('p', 'p')):
        for g_, r_ in zip(got[salida_], ref_[clave_]):
            assert r_ is None or abs(g_ - float(r_)) <= cifra_impresa(r_), (nombre_, clave_, g_, r_)
    for clave_ in ('dev', 'dev0', 'aic'): assert abs(got[clave_] - float(ref_[clave_])) <= cifra_impresa(ref_[clave_]), (nombre_, clave_, got[clave_])
E['mlgR'] = R_mlg
zg = rng6.standard_normal((150, 3)); g1, g2 = zg[:, 0], 0.5 * zg[:, 0] + 0.87 * zg[:, 1]
agregar_mlg('logisticaDos', 'logistica', (rng6.random(150) < 1 / (1 + np.exp(-(-0.4 + 0.8 * g1 - 0.6 * g2)))).astype(int), [np.round(g1, 3), np.round(g2, 3)])
zs = rng6.standard_normal((200, 4)); s1, s2, s3 = 1e-4 * (5 + zs[:, 0]), 1e5 * (3 + 0.5 * zs[:, 1]), np.round(20240101 + 3 * zs[:, 2], 0)
agregar_mlg('logisticaEscalas', 'logistica', (rng6.random(200) < 1 / (1 + np.exp(-(0.3 + 0.7 * zs[:, 0] - 0.5 * zs[:, 1] + 0.4 * zs[:, 2])))).astype(int), [s1, s2, s3])
zr = rng6.standard_normal(400); yr = np.zeros(400, int); yr[np.argsort(-(zr + 1.5 * rng6.standard_normal(400)))[:5]] = 1   # 5 eventos de 400
agregar_mlg('logisticaRara', 'logistica', yr, [np.round(zr, 4)])
zf = np.round(rng6.standard_normal(120), 3)   # un efecto fuerte (OR ≈ e⁴ por DE) sin separación: la estimación es finita
yf = (rng6.random(120) < 1 / (1 + np.exp(-4 * zf))).astype(int)
agregar_mlg('logisticaFuerte', 'logistica', yf, [zf])
zp = rng6.standard_normal((200, 2)); h1, h2 = np.round(zp[:, 0], 3), np.round(0.4 * zp[:, 0] + 0.9 * zp[:, 1], 3)
agregar_mlg('poissonDos', 'poisson', rng6.poisson(np.exp(0.5 + 0.4 * h1 - 0.3 * h2)), [h1, h2])
zd = rng6.standard_normal(150); fd = np.round(1e6 + zd, 4)
agregar_mlg('poissonDesplazado', 'poisson', rng6.poisson(np.exp(1.2 + 0.5 * zd)), [fd])
E['mlg'] = mlg_e
# (2026.12.23) Poisson con conteos de 10³ a 10⁵ en 6 u 8 casos: cerca de la convergencia, el redondeo de la
# devianza (≈ ε·|μ − y|·ln y, con la forma directa ε·y·ln y) supera lo que cambia en un paso, y la reducción del paso lo
# tomaría por un aumento («ningún paso mejora el ajuste») sin la forma estable y su cota; la referencia, el mismo Newton
# decimal
mlgc_d, mlgc_e = {}, {}
for nombre_, yv_, cols_ in (('conteos2397', [37, 1, 5, 0, 0, 0, 0, 2397], [[2, 4, 1, 3, 4, 4, 4, 1], [2, 2, 4, 4, 4, 2, 3, 2], [2, 3, 3, 2, 2, 1, 3, 3]]),
                            ('conteos45829', [45, 1, 0, 0, 0, 1, 45829, 7], [[1, 0, 0, 0, 0, 0, 1, 0], [1, 0, 0, 1, 1, 0, 0, 1], [1, 1, 1, 1, 1, 1, 0, 0]]),
                            # conteos de 10⁵ bien ajustados (devianza 0,28): el redondeo de la devianza, aun con la forma
                            # estable, supera 10⁻¹²·devianza; el ajuste necesita además su cota de redondeo
                            ('conteos283279', [189648, 231478, 283279, 283238, 77162, 189593], [[4, 4, 4, 4, 1, 4], [2, 3, 4, 4, 2, 2]])):
    mlgc_d[nombre_] = {'familia': 'poisson', 'y': yv_, 'cols': [[float(v) for v in c] for c in cols_]}
    mlgc_e[nombre_] = mlg_decimal(yv_, cols_, 'poisson')
E['mlgConteos'] = mlgc_e
# (2026.12.23) estimaciones finitas con casos en el borde: una edad de 240 (las demás, de 13 a 24) con 3 eventos donde la
# tasa ajustada es e⁻⁸⁰; x = −15 con y = 1 entre 300 casos normales (p̂ = 3·10⁻¹³); una ficticia de dos casos casi separada
# por el otro predictor (EE de 4 601); y un código 99999999 con y = 1 entre puntuaciones Likert (p̂ = 1 en doble precisión:
# su contribución exacta a la verosimilitud y a la información es e^(−4·10⁷) = 0, así que la referencia es el ajuste sin
# él). La 2026.12.22 rechazaba la edad, la ficticia y el código como «separación»; con los pesos recortados de glm de R,
# los errores típicos del código salen un 3 % menores
mlgp_d, mlgp_e = {}, {}
def agregar_palanca(nombre, familia, yv, cols, sin_ultimo=False):
    yv = [int(v) for v in yv]; cols = [[float(v) for v in c] for c in cols]
    mlgp_d[nombre] = {'familia': familia, 'y': yv, 'cols': cols}
    mlgp_e[nombre] = mlg_decimal(yv[:-1], [c[:-1] for c in cols], familia) if sin_ultimo else mlg_decimal(yv, cols, familia)
agregar_palanca('poissonEdad240', 'poisson', [3, 3, 72, 33, 28, 6, 418, 19, 1, 7, 18, 10, 32, 8, 32, 14, 17, 30, 13],
                [[22, 240, 17, 19, 19, 21, 13, 20, 24, 22, 20, 20, 19, 21, 19, 21, 20, 19, 20]])
rng8 = np.random.default_rng(15)
xp = np.round(rng8.standard_normal(300), 2); xp[0] = -15
yp = (rng8.random(300) < 1 / (1 + np.exp(-(0.25 + 2.8 * xp)))).astype(int); yp[0] = 1
agregar_palanca('logisticaPalanca', 'logistica', yp, [xp])
agregar_palanca('logisticaFicticiaDebil', 'logistica', [0, 1, 1, 0, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 0, 0, 1, 0, 0, 0],
                [[0.06, 0.05, 0.97, -0.35, 0.12, 1.04, 0.68, -1.02, -1.06, -1.58, 0.79, 0.77, 1.49, 0.03, -1.25, -0.7, 1.86, -0.84, -0.48, -0.81],
                 [0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]])
# un paso completo que empeora la devianza (en la novena iteración): se reduce a la mitad y el ajuste sigue
agregar_palanca('logisticaPasoReducido', 'logistica', [1, 0, 0, 1, 1, 1, 0, 1, 0, 0],
                [[-0.22, 2.21, -1.51, -1.52, 0.46, -0.09, 1.34, -0.12, 0.65, -1.84], [0.76, -4.71, -0.41, 1.08, 0.51, 0.03, 0.91, 1.66, -0.73, -1.04],
                 [-0.04, -0.58, -8.2, 0.03, 0.62, -0.51, -0.59, 0.96, 3.97, -0.2]])
xl = rng8.integers(1, 6, 99).astype(float)
yl = (rng8.random(99) < 1 / (1 + np.exp(-(-2 + 0.6 * xl)))).astype(int)
agregar_palanca('logisticaCodigo', 'logistica', list(yl) + [1], [list(xl) + [99999999.0]], sin_ultimo=True)
# el primer paso (desde el inicio de glm) extrapola el predictor lineal de un caso de palanca con un conteo 0 a 10² o más:
# un código de perdido 999 no declarado en un predictor con un efecto fuerte (la tasa, × e² por DE) y un grupo con una
# tendencia empinada (conteos de e a e⁹) con un caso lejano (x = 50). Con una tasa de 10⁶⁰ y un peso que dejaba a los demás
# casos por debajo del redondeo, el motor decía «no convergió en 100 iteraciones», «casi colineales» o «ningún paso mejora
# el ajuste» (glm de R: «no valid set of coefficients» o la falta de convergencia); ahora parte del modelo nulo
for semilla_ in (8, 14):
    rng_ = np.random.default_rng(semilla_)
    xc_ = np.round(40 + 10 * rng_.standard_normal(60), 1); xc2_ = np.round(rng_.standard_normal(60), 2)
    yc_ = rng_.poisson(np.exp(np.minimum(1.5 + 2 * (xc_ - 40) / 10 + 0.3 * xc2_, 9))); xc_[0] = 999.0; yc_[0] = 0
    agregar_palanca(f'poissonCodigo999s{semilla_}', 'poisson', yc_, [xc_, xc2_])
xe_ = [i / 19 for i in range(20)] + [50.0]
agregar_palanca('poissonExtrapolado', 'poisson', [int(np.round(np.exp(1 + 8 * v))) for v in xe_[:20]] + [0], [xe_])
E['mlgPalanca'] = mlgp_e
# (2026.12.24) la χ² de independencia del núcleo (core/stats/contingencia.js; hasta la 2026.12.23, dentro de
# analizador/estadistica.js): chi2_contingency de SciPy sin corrección por continuidad, con la V de Cramér y cuántas
# esperadas son menores que 5, en tablas de 2×2 a 5×5: con ceros observados, esperadas bajas, asociación perfecta e
# independencia exacta (χ² = 0, p = 1)
rng9 = np.random.default_rng(20261224)
tablas_c = [[[30, 20], [15, 55]], [[12, 5, 9], [7, 14, 3]], [[2, 0, 5, 1], [3, 4, 0, 2], [1, 6, 2, 7]], [[10, 0], [0, 10]],
            [[10, 20], [5, 10]], rng9.multinomial(400, np.full(25, 1 / 25)).reshape(5, 5).tolist()]
cont_e = []
for t_ in tablas_c:
    ta_ = np.array(t_, float); r_ = stats.chi2_contingency(ta_, correction=False)
    cont_e.append({'chi2': float(r_[0]), 'p': float(r_[1]), 'gl': int(r_[2]), 'esperadas': r_[3].tolist(),
                   'v': float(np.sqrt(r_[0] / (ta_.sum() * (min(ta_.shape) - 1)))), 'bajas': int((r_[3] < 5).sum())})
E['contingencia'] = cont_e
print('potencia de Cohen frente a la exacta: diferencia máxima ' + f"{max(abs(q[4] - q[5]) for q in potencias):.4f}" + ' · ' + ', '.join(f"r = {q[0]}, n = {q[1]}, {'bil.' if q[3] else 'unil.'}: {q[4]:.4f} / {q[5]:.4f}" for q in potencias))
datos = {'a': a.tolist(), 'b': b.tolist(), 'c': c.tolist(), 'x1': x1.tolist(), 'x2': x2.tolist(), 'y': y.tolist(), 'y01': y01.tolist(), 'cuenta': cuenta.tolist(), 'grupo': grupo.tolist(), 'y2': y2.tolist(), 'estudios': estudios, 'sem': sem, 'items': items, 'sk1': sk1.tolist(), 'sk2': sk2.tolist(), 'correlacion': datos_r, 'descriptivos': [v.tolist() for v in series_d], 'rectas': rectas_d,
    'gruposR': {'sleep': sleep, 'insect': insect, 'dunnDos': [g.tolist() for g in d2]}, 'protocoloGrupos': datos_grupos,
    'mco': {'disenos': disenos_d, 'colineales': colineales}, 'mlg': mlg_d, 'mlgConteos': mlgc_d, 'mlgPalanca': mlgp_d,
    'contingencia': [[[int(v) for v in fila] for fila in t_] for t_ in tablas_c]}
conv = lambda o: o.item() if isinstance(o, np.generic) else o
destino = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'inferencia_fixture.json')
with open(destino, 'w', encoding='utf-8') as f: json.dump({'datos': datos, 'esperado': json.loads(json.dumps(E, default=conv))}, f, default=conv)
nvals = sum(len(json.dumps(v).split(',')) for v in E.values())
import scipy
print(f'inferencia_fixture.json escrito: {len(E)} análisis, ≈ {nvals} valores de referencia (SciPy {scipy.__version__} y estimaciones propias)')
