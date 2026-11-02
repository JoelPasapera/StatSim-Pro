# tri_oraculo.py — oráculo de la teoría de respuesta al ítem y del DIF (2027.01.19), escrito aparte de core/stats/tri.js,
# logit-ordinal.js y dif.js, en NumPy y SciPy:
#   · el máximo de la verosimilitud marginal de Rasch, 2PL y GRM con la misma cuadratura (61 puntos de −6 a 6 con los pesos
#     de la normal), maximizada DIRECTAMENTE con scipy.optimize.minimize (L-BFGS-B con el gradiente analítico por la
#     identidad de Fisher), no por EM como el programa: el máximo es el mismo; los errores típicos por el producto cruzado de
#     los gradientes de cada persona en ese máximo; las EAP, su DE posterior, la fiabilidad marginal y −2LL;
#   · la regresión logística ordinal de odds proporcionales maximizada con BFGS, y el DIF con sus tres razones de
#     verosimilitud y el ΔR² de Nagelkerke; (2027.01.20) y un segundo DIF como el de una base real: cuatro grupos (uno de 6
#     personas, que queda fuera, y unas pocas sin grupo), un 6 % de respuestas perdidas (el total, con la regla del 80 %),
#     las respuestas de 1 a 5 (con un ítem sin el 3) sumadas tal cual y la p de Holm entre los ítems.
# Escribe tri_fixture.json; lo compara tests/unit/tri.test.js.
import json, math, os
import numpy as np
from scipy import optimize, stats

rng = np.random.default_rng(20270119)
Z = np.linspace(-6, 6, 61); PI = np.exp(-0.5 * Z * Z); PI /= PI.sum()

def sig(x): return 1 / (1 + np.exp(-x))

def probs(a, d, z):
    """Las probabilidades de cada categoría (len(d) + 1) en cada nodo z, y sus derivadas respecto de (a, d)."""
    K = len(d) + 1
    Pe = np.ones((K + 1, len(z))); Pe[K] = 0
    for k in range(1, K): Pe[k] = sig(a * z + d[k - 1])
    W = Pe * (1 - Pe)
    P = np.maximum(Pe[:-1] - Pe[1:], 1e-300)
    dP = np.zeros((K, K, len(z)))   # dP[c, u, q]
    for c in range(K):
        dP[c, 0] = z * (W[c] - W[c + 1])
        if c >= 1: dP[c, c] += W[c]
        if c + 1 <= K - 1: dP[c, c + 1] -= W[c + 1]
    return P, dP

def simular(n, items, rng):
    z = rng.standard_normal(n)
    X = []
    for a, d in items:
        v = rng.random(n); c = np.zeros(n, dtype=int)
        for dk in d: c += (v < sig(a * z + dk)).astype(int)
        X.append(c)
    X = np.array(X)
    perdidos = rng.random(X.shape) < 0.03
    X[perdidos] = -1
    return X

def desempacar(th, K, modelo):
    J = len(K)
    if modelo == 'rasch': return [th[0]] * J, [[th[1 + j]] for j in range(J)]
    a, d, o = [], [], 0
    for j in range(J): a.append(th[o]); d.append(list(th[o + 1:o + K[j]])); o += K[j]
    return a, d

def verosimilitud(th, X, K, modelo, con_gradiente=True):
    J, n = X.shape
    a, d = desempacar(th, K, modelo)
    logL = np.zeros((n, len(Z))); tablas = []
    for j in range(J):
        P, dP = probs(a[j], d[j], Z); tablas.append((P, dP))
        ok = X[j] >= 0
        logL[ok] += np.log(P[X[j][ok]])
    m = logL.max(axis=1, keepdims=True)
    L = np.exp(logL - m) * PI
    s = L.sum(axis=1, keepdims=True)
    ll = float((m[:, 0] + np.log(s[:, 0])).sum())
    if not con_gradiente: return ll
    w = L / s
    G = np.zeros((n, len(th)))
    o = 0
    for j in range(J):
        P, dP = tablas[j]; ok = np.where(X[j] >= 0)[0]
        c = X[j][ok]
        contrib = dP[c] / P[c][:, None, :]   # (m, K, Q)
        gj = np.einsum('mq,mkq->mk', w[ok], contrib)
        if modelo == 'rasch': G[ok, 0] += gj[:, 0]; G[ok, 1 + j] += gj[:, 1]
        else: G[ok, o:o + K[j]] += gj; o += K[j]
    return ll, G, w

def ajustar(X, K, modelo):
    J = X.shape[0]
    th0 = []
    for j in range(J):
        x = X[j][X[j] >= 0]; dj = []
        for k in range(1, K[j]):
            p = np.clip((x >= k).mean(), 0.005, 0.995); dj.append(math.log(p / (1 - p)))
        th0 += ([1.0] if modelo != 'rasch' else []) + dj
    if modelo == 'rasch': th0 = [1.0] + th0
    f = lambda th: tuple(-v if i == 0 else -v.sum(axis=0) for i, v in enumerate(verosimilitud(th, X, K, modelo)[:2]))
    r = optimize.minimize(lambda th: f(th), np.array(th0), jac=True, method='L-BFGS-B', options={'maxiter': 5000, 'ftol': 1e-15, 'gtol': 1e-9})
    th = r.x
    ll, G, w = verosimilitud(th, X, K, modelo)
    cov = np.linalg.inv(G.T @ G)
    a, d = desempacar(th, K, modelo)
    items = []
    for j in range(J):
        if modelo == 'rasch':
            items.append({'a': 1.0, 'd': d[j], 'b': [-d[j][0]], 'eeB': [math.sqrt(cov[1 + j, 1 + j])]}); continue
        o = sum(K[:j]); ee_b = []
        for k, dk in enumerate(d[j]):
            ga, gd = dk / a[j] ** 2, -1 / a[j]
            ee_b.append(math.sqrt(ga * ga * cov[o, o] + gd * gd * cov[o + 1 + k, o + 1 + k] + 2 * ga * gd * cov[o, o + 1 + k]))
        items.append({'a': a[j], 'eeA': math.sqrt(cov[o, o]), 'd': d[j], 'b': [-dk / a[j] for dk in d[j]], 'eeB': ee_b})
    escala = a[0] if modelo == 'rasch' else 1.0
    eap = escala * (w @ Z); psd = escala * np.sqrt(np.maximum(0, w @ (Z * Z) - (w @ Z) ** 2))
    rel = eap.var(ddof=1) / (eap.var(ddof=1) + (psd ** 2).mean())
    return {'items': items, 'menos2LL': -2 * ll, 'eap': eap[:25].tolist(), 'dePosterior': psd[:25].tolist(), 'fiabilidadMarginal': rel,
            'deRasgo': {'valor': a[0], 'ee': math.sqrt(cov[0, 0])} if modelo == 'rasch' else None, 'gradienteMaximo': float(np.abs(G.sum(axis=0)).max())}

items_grm = [(1.2, [1.5, 0.3, -1.0]), (0.8, [1.0, -0.5, -2.0]), (2.0, [2.0, 0.0, -1.5]), (1.5, [0.5, -0.8, -2.5]), (1.0, [2.5, 1.0, -0.2]), (0.6, [1.2, 0.1, -1.1]), (1.7, [0.8, -1.2])]
X = simular(600, items_grm, rng)
Xd = np.where(X < 0, -1, (X >= 1).astype(int))
K = [int(x.max()) + 1 for x in X]; Kd = [2] * X.shape[0]
modelos = {'grm': ajustar(X, K, 'grm'), '2pl': ajustar(Xd, Kd, '2pl'), 'rasch': ajustar(Xd, Kd, 'rasch')}

# ---------- el DIF ----------
def logit_ordinal(y, cols):
    y = np.asarray(y); K = int(y.max()) + 1; Xc = np.column_stack(cols) if cols else np.zeros((len(y), 0))
    def nll(th):
        al, be = th[:K - 1], th[K - 1:]
        if np.any(np.diff(al) <= 0): return 1e300
        eta = Xc @ be
        Pe = np.ones((K + 1, len(y))); Pe[K] = 0
        for k in range(1, K): Pe[k] = sig(eta - al[k - 1])
        P = np.maximum(Pe[:-1] - Pe[1:], 1e-300)
        return -np.log(P[y, np.arange(len(y))]).sum()
    acum = np.cumsum(np.bincount(y, minlength=K))[:-1] / len(y)
    th0 = np.concatenate([np.log(acum / (1 - acum)), np.zeros(Xc.shape[1])])
    r = optimize.minimize(nll, th0, method='BFGS', options={'gtol': 1e-9, 'maxiter': 10000})
    return -r.fun

def nagelkerke(ll, ll0, n): return (1 - math.exp(2 * (ll0 - ll) / n)) / (1 - math.exp(2 * ll0 / n))

n = 700; grupo = np.arange(n) % 2
z = rng.standard_normal(n)
items_dif = [(1.2, [1.5, 0.3, -1.0], 0, 1), (0.9, [1.0, -0.5, -2.0], 0, 1), (1.6, [2.0, 0.0, -1.5], -0.9, 1), (1.4, [0.5, -0.8, -2.5], 0, 1), (1.1, [2.5, 1.0, -0.2], 0, 0.3), (1.3, [0.9, -1.0], 0, 1)]
XD = []
for a, d, sesgo, fa in items_dif:
    v = rng.random(n); c = np.zeros(n, dtype=int)
    for dk in d: c += (v < sig(np.where(grupo == 1, a * fa, a) * z + dk + np.where(grupo == 1, sesgo, 0))).astype(int)
    XD.append(c)
XD = np.array(XD)
total = XD.sum(axis=0); tc = total - total.mean()
dif = []
for j in range(XD.shape[0]):
    y = XD[j]; K = int(y.max()) + 1
    ll0 = float(sum(c * math.log(c / n) for c in np.bincount(y, minlength=K) if c > 0))
    l1, l2, l3 = logit_ordinal(y, [tc]), logit_ordinal(y, [tc, grupo.astype(float)]), logit_ordinal(y, [tc, grupo.astype(float), grupo * tc])
    r2 = [nagelkerke(l, ll0, n) for l in (l1, l2, l3)]
    dif.append({'logVerosimilitud': [l1, l2, l3], 'chi2Total': 2 * (l3 - l1), 'chi2Uniforme': 2 * (l2 - l1), 'chi2NoUniforme': 2 * (l3 - l2),
                'pTotal': float(stats.chi2.sf(2 * (l3 - l1), 2)), 'r2': r2, 'deltaR2': r2[2] - r2[0]})

# ---------- el segundo DIF: grupos desiguales, perdidos y respuestas tal cual ----------
def holm(p):
    p = np.asarray(p); orden = np.argsort(p, kind='stable'); m = len(p); ajustadas = np.empty(m); maximo = 0.0
    for i, k in enumerate(orden):
        maximo = max(maximo, min(1.0, (m - i) * p[k])); ajustadas[k] = maximo
    return ajustadas.tolist()

n2 = 580
grupo2 = np.where(np.arange(n2) < 6, 3, np.arange(n2) % 3)          # el grupo 3, de 6 personas
grupo2[[10, 11, 12, 13]] = -1                                         # sin grupo
z2 = rng.standard_normal(n2) + 0.3 * (grupo2 == 1)
items2 = [(1.3, [1.8, 0.6, -0.6, -1.8], 0, 1, None), (1.0, [1.5, 0.3, -1.0, -2.2], 0.7, 1, None), (1.5, [2.0, 0.8, -0.5, -1.6], 0, 0.4, None),
          (1.2, [1.6, -0.1, -1.7], 0, 1, [1, 2, 4, 5]), (0.9, [2.2, 1.0, -0.4, -1.5], 0, 1, None), (1.1, [1.2, 0.0, -1.2, -2.4], -0.5, 1, None)]
crudo = []
for a, d, sesgo, fa, valores in items2:
    v = rng.random(n2); c = np.zeros(n2, dtype=int)
    for dk in d: c += (v < sig(np.where(grupo2 == 2, a * fa, a) * z2 + dk + np.where(grupo2 == 2, sesgo, 0))).astype(int)
    crudo.append(np.array([float(valores[k]) if valores else float(k + 1) for k in c]))
crudo = np.array(crudo)
crudo[rng.random(crudo.shape) < 0.06] = np.nan
J2 = crudo.shape[0]
respondidos = (~np.isnan(crudo)).sum(axis=0)
total2 = np.where(respondidos >= 0.8 * J2, np.nansum(crudo, axis=0) / np.maximum(respondidos, 1) * J2, np.nan)
validas = ~np.isnan(total2) & (grupo2 >= 0)
cuenta2 = {int(g): int(((grupo2 == g) & validas).sum()) for g in np.unique(grupo2[validas])}
excluidos2 = [{'grupo': g, 'n': m} for g, m in sorted(cuenta2.items()) if m < 10]
usa = validas & ~np.isin(grupo2, [e['grupo'] for e in excluidos2])
niveles2 = sorted(int(g) for g in np.unique(grupo2[usa]))
mt2 = total2[usa].mean()
dif2 = []
for j in range(J2):
    sel = usa & ~np.isnan(crudo[j])
    presentes = sorted(set(crudo[j][sel].tolist())); y = np.array([presentes.index(v) for v in crudo[j][sel]]); N = int(sel.sum()); K = len(presentes)
    tc = total2[sel] - mt2
    ind = [(grupo2[sel] == g).astype(float) for g in niveles2[1:]]
    ll0 = float(sum(c * math.log(c / N) for c in np.bincount(y, minlength=K) if c > 0))
    l1, l2, l3 = logit_ordinal(y, [tc]), logit_ordinal(y, [tc, *ind]), logit_ordinal(y, [tc, *ind, *[i * tc for i in ind]])
    r2 = [nagelkerke(l, ll0, N) for l in (l1, l2, l3)]
    gl = len(niveles2) - 1
    dif2.append({'n': N, 'K': K, 'logVerosimilitud': [l1, l2, l3], 'chi2Total': 2 * (l3 - l1), 'chi2Uniforme': 2 * (l2 - l1), 'chi2NoUniforme': 2 * (l3 - l2),
                 'pTotal': float(stats.chi2.sf(2 * (l3 - l1), 2 * gl)), 'pUniforme': float(stats.chi2.sf(2 * (l2 - l1), gl)), 'pNoUniforme': float(stats.chi2.sf(2 * (l3 - l2), gl)),
                 'r2': r2, 'deltaR2': r2[2] - r2[0]})
for d, ph in zip(dif2, holm([d['pTotal'] for d in dif2])): d['pHolm'] = ph
dif2_salida = {'crudo': [[None if math.isnan(v) else v for v in fila] for fila in crudo.tolist()], 'grupo': grupo2.tolist(), 'n': int(usa.sum()),
               'grupos': niveles2, 'tamanos': [int(((grupo2 == g) & usa).sum()) for g in niveles2], 'excluidos': excluidos2, 'items': dif2}

salida = {'X': X.tolist(), 'Xd': Xd.tolist(), 'modelos': modelos, 'dif': {'X': XD.tolist(), 'grupo': grupo.tolist(), 'items': dif}, 'dif2': dif2_salida}
ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tri_fixture.json')
with open(ruta, 'w', encoding='utf-8', newline='\n') as f: json.dump(salida, f)
print('tri_fixture.json escrito: ' + '; '.join(f"{m}: −2LL = {r['menos2LL']:.3f}, fiabilidad {r['fiabilidadMarginal']:.3f} (|gradiente| ≤ {r['gradienteMaximo']:.1e})" for m, r in modelos.items())
      + f"; DIF de {len(dif)} ítems: χ² totales " + ', '.join(f"{d['chi2Total']:.2f}" for d in dif)
      + f"; con grupos desiguales y perdidos (n = {dif2_salida['n']}, grupos {dif2_salida['tamanos']}, fuera {dif2_salida['excluidos']}): " + ', '.join(f"{d['chi2Total']:.2f}" for d in dif2))
