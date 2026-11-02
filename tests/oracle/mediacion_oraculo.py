# mediacion_oraculo.py — oráculo de la mediación y la moderación (modelos 1, 4, 6, 7 y 14 de PROCESS; 2027.01.17), escrito
# aparte de analizador/relaciones/mediacion.js:
#   · cada ecuación por mínimos cuadrados con numpy.linalg.lstsq y su inferencia clásica (σ²(X'X)⁻¹ con np.linalg.inv);
#   · los efectos condicionales de la moderación con su error típico por la matriz de covarianzas, y la región de
#     Johnson-Neyman buscando con brentq los cambios de signo de |θ(w)|/ee − t crítico en una rejilla fina (no por la fórmula
#     cuadrática del programa);
#   · los efectos indirectos (los productos de los caminos) y el bootstrap con EL MISMO generador (sfc32 sembrado con fmix32,
#     el de bootstrap_oraculo.py) y las mismas remuestras: los intervalos percentil, con np.quantile (tipo 7), deben coincidir
#     con los del programa en todas sus cifras;
#   · la z de Sobel.
# Escribe mediacion_fixture.json; lo compara tests/unit/mediacion.test.js.
import json, math, os
import numpy as np
from scipy import stats, optimize
import scipy

M32 = 0xFFFFFFFF
class Aleatorio:
    """sfc32 con la siembra fmix32 (la de core/random/sfc32.js)."""
    def __init__(self, semilla):
        self.s = semilla & M32
        self.a, self.b, self.c, self.d = (self._mezcla() for _ in range(4))
        for _ in range(12): self.siguiente32()
    def _mezcla(self):
        self.s = (self.s + 0x9e3779b9) & M32; z = self.s
        z = ((z ^ (z >> 16)) * 0x85ebca6b) & M32; z = ((z ^ (z >> 13)) * 0xc2b2ae35) & M32
        return (z ^ (z >> 16)) & M32
    def siguiente32(self):
        t = (self.a + self.b) & M32; self.a = (self.b ^ (self.b >> 9)) & M32; self.b = (self.c + (self.c << 3)) & M32
        self.c = ((self.c << 21) | (self.c >> 11)) & M32; self.d = (self.d + 1) & M32; t = (t + self.d) & M32
        self.c = (self.c + t) & M32; return t
    def entero(self, n): return (self.siguiente32() * n) >> 32

def ols(y, cols):
    X = np.column_stack([np.ones(len(y))] + cols); b, *_ = np.linalg.lstsq(X, y, rcond=None); e = y - X @ b
    gl = len(y) - X.shape[1]; s2 = e @ e / gl; V = s2 * np.linalg.inv(X.T @ X); ee = np.sqrt(np.diag(V)); t = b / ee
    r2 = 1 - (e @ e) / np.sum((y - y.mean()) ** 2)
    return {'beta': b, 'ee': ee, 't': t, 'p': 2 * stats.t.sf(np.abs(t), gl), 'V': V, 'gl': gl, 'r2': r2}

def ecuaciones(modelo, X, Y, M, W, C):
    if modelo == 1: return [('Y', Y, [('X', X), ('W', W), ('X·W', X * W)] + C)]
    if modelo == 4: return [(f'M{j+1}', m, [('X', X)] + C) for j, m in enumerate(M)] + [('Y', Y, [('X', X)] + [(f'M{j+1}', m) for j, m in enumerate(M)] + C), ('Y (total)', Y, [('X', X)] + C)]
    if modelo == 6: return [(f'M{j+1}', m, [('X', X)] + [(f'M{i+1}', M[i]) for i in range(j)] + C) for j, m in enumerate(M)] + [('Y', Y, [('X', X)] + [(f'M{j+1}', m) for j, m in enumerate(M)] + C), ('Y (total)', Y, [('X', X)] + C)]
    if modelo == 7: return [('M1', M[0], [('X', X), ('W', W), ('X·W', X * W)] + C), ('Y', Y, [('X', X), ('M1', M[0])] + C)]
    return [('M1', M[0], [('X', X)] + C), ('Y', Y, [('X', X), ('M1', M[0]), ('W', W), ('M·W', M[0] * W)] + C)]

def coef(ec, beta, nombre): return beta[[c[0] for c in ec[2]].index(nombre) + 1]

def caminos(k):
    cs = [[j for j in range(k) if m & (1 << j)] for m in range(1, 1 << k)]
    return sorted(cs, key=lambda c: (len(c), c[0]))

def efectos(modelo, ecs, betas, ws, deX, deY):
    r = {}; iY = [e[0] for e in ecs].index('Y'); eY, bY = ecs[iY], betas[iY]
    if modelo == 4:
        k = len(ecs) - 2; tot = 0
        for j in range(k):
            ind = coef(ecs[j], betas[j], 'X') * coef(eY, bY, f'M{j+1}'); r[f'ind_M{j+1}'] = ind; r[f'std_M{j+1}'] = ind * deX / deY; tot += ind
        r['ind_total'] = tot; r['std_total'] = tot * deX / deY
        for i in range(k):
            for j in range(i + 1, k): r[f'contraste_M{i+1}_M{j+1}'] = r[f'ind_M{i+1}'] - r[f'ind_M{j+1}']
    elif modelo == 6:
        k = len(ecs) - 2; tot = 0
        for c in caminos(k):
            v = coef(ecs[c[0]], betas[c[0]], 'X')
            for s in range(1, len(c)): v *= coef(ecs[c[s]], betas[c[s]], f'M{c[s-1]+1}')
            v *= coef(eY, bY, f'M{c[-1]+1}'); clave = '_'.join(f'M{j+1}' for j in c)
            r[f'ind_{clave}'] = v; r[f'std_{clave}'] = v * deX / deY; tot += v
        r['ind_total'] = tot; r['std_total'] = tot * deX / deY
    elif modelo == 7:
        a1, a3, b = coef(ecs[0], betas[0], 'X'), coef(ecs[0], betas[0], 'X·W'), coef(eY, bY, 'M1'); r['indice'] = a3 * b
        for i, w in enumerate(ws): r[f'cond_{i}'] = (a1 + a3 * w) * b
    elif modelo == 14:
        a, b1, b3 = coef(ecs[0], betas[0], 'X'), coef(eY, bY, 'M1'), coef(eY, bY, 'M·W'); r['indice'] = a * b3
        for i, w in enumerate(ws): r[f'cond_{i}'] = a * (b1 + b3 * w)
    return r

def valores_w(W):
    d = sorted(set(W.tolist()))
    return d if len(d) == 2 else [float(np.quantile(W, q)) for q in (0.16, 0.5, 0.84)]

def caso(modelo, x, y, m, w, cov, centrar=True, B=600, semilla=2027):
    x, y = np.asarray(x, float), np.asarray(y, float); m = [np.asarray(c, float) for c in m]; w = None if w is None else np.asarray(w, float)
    C = [(f'C{j+1}', np.asarray(c, float)) for j, c in enumerate(cov)]
    cen = centrar and modelo not in (4, 6)
    cx = x.mean() if cen and modelo in (1, 7) else 0.0; cw = w.mean() if cen and w is not None else 0.0
    cm = [c.mean() if cen and modelo == 14 else 0.0 for c in m]
    X, W, M = x - cx, (None if w is None else w - cw), [c - k for c, k in zip(m, cm)]
    ecs = ecuaciones(modelo, X, y, M, W, C)
    fits = [ols(e[1], [c[1] for c in e[2]]) for e in ecs]
    ws = valores_w(W) if W is not None else []
    out = {'pedido': {'modelo': modelo, 'x': x.tolist(), 'y': y.tolist(), 'm': [c.tolist() for c in m], 'w': None if w is None else w.tolist(), 'covariables': [np.asarray(c, float).tolist() for c in cov], 'centrar': centrar},
           'B': B, 'semilla': semilla, 'valoresW': [v + cw for v in ws],
           'ecuaciones': [{'dependiente': e[0], 'beta': f['beta'].tolist(), 'ee': f['ee'].tolist(), 'p': f['p'].tolist(), 'r2': f['r2']} for e, f in zip(ecs, fits)]}
    out['puntuales'] = efectos(modelo, ecs, [f['beta'] for f in fits], ws, X.std(ddof=1), y.std(ddof=1))
    if modelo == 1:
        f = fits[0]; b1, b3 = f['beta'][1], f['beta'][3]; V = f['V']; tc = stats.t.ppf(0.975, f['gl'])
        th = lambda u: b1 + b3 * u; se = lambda u: math.sqrt(V[1, 1] + 2 * u * V[1, 3] + u * u * V[3, 3])
        out['condicionales'] = [{'w': u + cw, 'efecto': th(u), 'ee': se(u), 'p': float(2 * stats.t.sf(abs(th(u) / se(u)), f['gl']))} for u in ws]
        g = lambda u: abs(th(u)) / se(u) - tc; rejilla = np.linspace(W.min(), W.max(), 4001); vals = np.array([g(u) for u in rejilla])
        puntos = [optimize.brentq(g, rejilla[i], rejilla[i + 1], xtol=1e-12) + cw for i in range(len(rejilla) - 1) if vals[i] * vals[i + 1] < 0]
        out['johnsonNeyman'] = puntos
        sin = ols(y, [X, W] + [c[1] for c in C]); out['deltaR2'] = f['r2'] - sin['r2']
    if modelo == 4:
        iY = [e[0] for e in ecs].index('Y'); sob = []
        for j in range(len(m)):
            a, sa = fits[j]['beta'][1], fits[j]['ee'][1]; ib = [c[0] for c in ecs[iY][2]].index(f'M{j+1}') + 1
            b, sb = fits[iY]['beta'][ib], fits[iY]['ee'][ib]; z = a * b / math.sqrt(b * b * sa * sa + a * a * sb * sb)
            sob.append({'z': z, 'p': float(2 * stats.norm.sf(abs(z)))})
        out['sobel'] = sob
    if modelo != 1:
        rng = Aleatorio(semilla); n = len(y); reps = {k: [] for k in out['puntuales']}
        for _ in range(B):
            idx = np.array([rng.entero(n) for _ in range(n)])
            betas = [np.linalg.lstsq(np.column_stack([np.ones(n)] + [c[1][idx] for c in e[2]]), e[1][idx], rcond=None)[0] for e in ecs]
            r = efectos(modelo, ecs, betas, ws, X[idx].std(ddof=1), y[idx].std(ddof=1))
            for k, v in r.items(): reps[k].append(v)
        out['bootstrap'] = {k: {'inferior': float(np.quantile(v, 0.025)), 'superior': float(np.quantile(v, 0.975)), 'ee': float(np.std(v, ddof=1))} for k, v in reps.items()}
    return out

rng = np.random.default_rng(20270119)
n = 120
x = rng.normal(0, 1, n); w = rng.normal(5, 2, n); c1 = rng.normal(0, 1, n)
y1 = 1 + 0.3 * x + 0.2 * w + 0.25 * x * (w - 5) + 0.3 * c1 + rng.normal(0, 1, n)
m1 = 0.5 * x + rng.normal(0, 1, n); m2 = 0.3 * x + 0.4 * m1 + rng.normal(0, 1, n); m3 = 0.2 * x + rng.normal(0, 1, n)
y4 = 0.2 * x + 0.4 * m1 + 0.3 * m3 + rng.normal(0, 1, n)
y6 = 0.1 * x + 0.3 * m1 + 0.5 * m2 + rng.normal(0, 1, n)
g = (rng.random(n) < 0.5).astype(float)   # un moderador dicotómico
m7 = 0.3 * x + 0.4 * x * g + 0.2 * g + rng.normal(0, 1, n); y7 = 0.2 * x + 0.5 * m7 + rng.normal(0, 1, n)
y14 = 0.2 * x + 0.3 * m1 + 0.2 * w + 0.15 * (m1 * (w - 5)) + rng.normal(0, 1, n)
casos = [caso(1, x, y1, [], w, [c1]), caso(1, x, y1, [], w, [c1], centrar=False), caso(4, x, y4, [m1], None, []), caso(4, x, y4, [m1, m3], None, [c1]),
         caso(6, x, y6, [m1, m2], None, []), caso(7, x, y7, [m7], g, []), caso(14, x, y14, [m1], w, [c1])]
destino = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mediacion_fixture.json')
with open(destino, 'w', encoding='utf-8') as f: json.dump(casos, f)
print(f'mediacion_fixture.json escrito: {len(casos)} modelos (1, 1 sin centrar, 4, 4 en paralelo, 6, 7 y 14), '
      f'{sum(c["B"] for c in casos if "bootstrap" in c)} remuestras con el sfc32 del programa (NumPy {np.__version__}, SciPy {scipy.__version__})')
