# perdidos_oraculo.py — oráculo de los datos perdidos (2027.01.18), con implementaciones independientes de las de
# src/core/stats/perdidos.js, en NumPy y SciPy:
#   · los patrones de pérdida con np.unique sobre la matriz de observados;
#   · el máximo de la verosimilitud de lo observado de la normal multivariante: por EM escrito con np.linalg.solve y, aparte,
#     maximizando la log-verosimilitud con scipy.optimize.minimize (L-BFGS-B sobre las medias y el factor de Cholesky de la
#     covarianza); el oráculo exige que los dos coincidan antes de escribir nada;
#   · la prueba MCAR de Little (1988) con esas estimaciones y scipy.stats.chi2.sf;
#   · las reglas de Rubin con los gl de Barnard y Rubin (1999) y la fracción de información perdida de mice::pool, con
#     scipy.stats.t.
# Dos bases de 250 casos y 4 variables normales correlacionadas: una con perdidos MCAR y otra MAR (los perdidos de X2 y X4
# dependen de X1), con un caso sin ningún valor. Escribe perdidos_fixture.json; lo compara tests/unit/perdidos.test.js.
import json, math, os
import numpy as np
from scipy import stats, optimize

rng = np.random.default_rng(20270118)
k, n = 4, 250
mu0 = np.array([10.0, 20.0, 30.0, 40.0])
R0 = np.array([[1, .5, .4, .3], [.5, 1, .45, .35], [.4, .45, 1, .5], [.3, .35, .5, 1]])
de0 = np.array([2.0, 3.0, 4.0, 5.0])
S0 = R0 * np.outer(de0, de0)

def base(tipo):
    Z = rng.multivariate_normal(mu0, S0, n)
    X = Z.copy()
    if tipo == 'mcar':
        for j, p in [(1, .15), (2, .10), (3, .20)]: X[rng.random(n) < p, j] = np.nan
    else:
        z1 = (Z[:, 0] - mu0[0]) / de0[0]
        X[rng.random(n) < 1 / (1 + np.exp(-(-1.6 + 1.2 * z1))), 1] = np.nan
        X[rng.random(n) < 0.08, 2] = np.nan
        X[rng.random(n) < 1 / (1 + np.exp(-(-2.0 - 1.0 * z1))), 3] = np.nan
    X[7, :] = np.nan   # un caso sin ningún valor: no aporta
    return X

def grupos(X):
    """Los casos con algún valor, agrupados por su patrón de observados (np.unique)."""
    Y = X[~np.isnan(X).all(axis=1)]
    obs = ~np.isnan(Y)
    pats, inv = np.unique(obs, axis=0, return_inverse=True)
    return Y, [(pt, Y[inv.ravel() == p]) for p, pt in enumerate(pats)]

def em(X, tol=1e-13, maxit=20000):
    Y, G = grupos(X)
    mu = np.nanmean(Y, axis=0); S = np.diag(np.nanvar(Y, axis=0))
    for it in range(maxit):
        T1 = np.zeros(k); T2 = np.zeros((k, k))
        for o, Yp in G:
            m = ~o; Z = Yp.copy()
            if m.any():
                B = np.linalg.solve(S[np.ix_(o, o)], S[np.ix_(o, m)]).T
                Z[:, m] = mu[m] + (Yp[:, o] - mu[o]) @ B.T
                C = np.zeros((k, k)); C[np.ix_(m, m)] = S[np.ix_(m, m)] - B @ S[np.ix_(o, m)]
                T2 += len(Yp) * C
            T1 += Z.sum(axis=0); T2 += Z.T @ Z
        mu2 = T1 / len(Y); S2 = T2 / len(Y) - np.outer(mu2, mu2)
        cambio = max(np.max(np.abs(mu2 - mu) / np.maximum(1, np.abs(mu2))), np.max(np.abs(S2 - S) / np.maximum(1, np.abs(S2))))
        mu, S = mu2, S2
        if cambio < tol: break
    return mu, S, it + 1, len(Y)

def logvero(X, mu, S):
    _, G = grupos(X)
    return sum(stats.multivariate_normal.logpdf(Yp[:, o], mu[o], S[np.ix_(o, o)]).sum() for o, Yp in G)

def maximo_directo(X, mu_ini, S_ini):
    idx = np.tril_indices(k)
    def desempacar(t):
        L = np.zeros((k, k)); L[idx] = t[k:]
        L[np.diag_indices(k)] = np.exp(np.diag(L))
        return t[:k], L @ L.T
    L0 = np.linalg.cholesky(S_ini); L0[np.diag_indices(k)] = np.log(np.diag(L0))
    t0 = np.concatenate([mu_ini, L0[idx]])
    r = optimize.minimize(lambda t: -logvero(X, *desempacar(t)), t0, method='L-BFGS-B', options={'ftol': 1e-15, 'gtol': 1e-10, 'maxiter': 5000})
    return desempacar(r.x), -r.fun

def little(X, mu, S):
    _, G = grupos(X)
    d2, kj = 0.0, 0
    for o, Yp in G:
        d = Yp[:, o].mean(axis=0) - mu[o]
        d2 += len(Yp) * d @ np.linalg.solve(S[np.ix_(o, o)], d)
        kj += o.sum()
    gl = int(kj - k)
    return d2, gl, float(stats.chi2.sf(d2, gl)), len(G)

bases = {}
for tipo in ('mcar', 'mar'):
    X = base(tipo)
    mu, S, it, nUsados = em(X)
    (muD, SD), lD = maximo_directo(X, mu * 0.98, S * 1.1)
    l = logvero(X, mu, S)
    assert abs(l - lD) < 1e-6 and np.max(np.abs(mu - muD)) < 1e-4 and np.max(np.abs(S - SD)) < 1e-3, (tipo, l, lD, mu - muD)
    obs = ~np.isnan(X)
    pats, cuentas = np.unique(obs, axis=0, return_counts=True)
    d2, gl, p, npat = little(X, mu, S)
    bases[tipo] = {'X': [[None if np.isnan(v) else float(v) for v in col] for col in X.T], 'medias': mu.tolist(), 'cov': S.tolist(), 'logVerosimilitud': l,
                   'logVerosimilitudDirecta': lD, 'n': nUsados, 'perdidosPorVariable': (~obs).sum(axis=0).tolist(), 'completos': int(obs.all(axis=1).sum()),
                   'vacios': int((~obs).all(axis=1).sum()), 'patrones': sorted([[int(c), ''.join('1' if o else '0' for o in pt)] for pt, c in zip(pats, cuentas)], key=lambda x: (-x[0], x[1].count('0'))),
                   'little': {'chi2': d2, 'gl': gl, 'pValor': p, 'patrones': npat}, 'iteracionesEM': it}

def rubin(Q, U, gl_com=math.inf, nivel=0.95):
    Q, U = np.asarray(Q, float), np.asarray(U, float); m = len(Q)
    qb, ub, b = Q.mean(), U.mean(), Q.var(ddof=1)
    t = ub + (1 + 1 / m) * b
    r = (1 + 1 / m) * b / ub; lam = (1 + 1 / m) * b / t
    nu_old = (m - 1) / lam ** 2
    if math.isfinite(gl_com):
        nu_obs = (gl_com + 1) / (gl_com + 3) * gl_com * (1 - lam)
        nu = nu_old * nu_obs / (nu_old + nu_obs)
    else: nu = nu_old
    fmi = (r + 2 / (nu + 3)) / (1 + r)
    q = stats.t.ppf(1 - (1 - nivel) / 2, nu)
    tt = qb / math.sqrt(t)
    return {'estimacion': qb, 'dentro': ub, 'entre': b, 'total': t, 'r': r, 'lambda': lam, 'gl': nu, 'fmi': fmi, 'inferior': qb - q * math.sqrt(t), 'superior': qb + q * math.sqrt(t), 't': tt, 'pValor': 2 * stats.t.sf(abs(tt), nu)}

rubins = []
for m, gl_com in [(5, 99), (20, 249), (10, math.inf), (50, 30)]:
    Q = rng.normal(0.4, 0.05, m).tolist(); U = (rng.uniform(0.8, 1.2, m) * 0.01).tolist()
    rubins.append({'Q': Q, 'U': U, 'glCompletos': None if not math.isfinite(gl_com) else gl_com, 'esperado': rubin(Q, U, gl_com)})

ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'perdidos_fixture.json')
with open(ruta, 'w', encoding='utf-8', newline='\n') as f: json.dump({'bases': bases, 'rubin': rubins}, f)
print('perdidos_fixture.json escrito: ' + '; '.join(f"{t}: {b['completos']} completos de 250, {len(b['patrones'])} patrones, EM en {b['iteracionesEM']} iteraciones (= máximo directo, Δl = {abs(b['logVerosimilitud'] - b['logVerosimilitudDirecta']):.1e}), Little χ²({b['little']['gl']}) = {b['little']['chi2']:.2f}, p = {b['little']['pValor']:.4f}" for t, b in bases.items()) + f'; {len(rubins)} combinaciones de Rubin')
