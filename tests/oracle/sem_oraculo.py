#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""sem_oraculo.py — referencia independiente del paso 4A: AFC de 3 factores por máxima verosimilitud en la forma
LISREL (Σ = ΛΦΛᵀ + Θ; el sitio usa la forma RAM), minimizada con scipy (BFGS con gradiente NUMÉRICO), errores estándar
por la información esperada con ∂Σ/∂θ por diferencias finitas, índices de ajuste y el IC 90 % del RMSEA con la χ² no
central de SciPy. Escribe sem_fixture.json; lo compara tests/unit/sem-ml.test.js."""
import json
import numpy as np
from scipy.optimize import minimize, brentq
from scipy.stats import chi2, ncx2

fx = json.load(open('afe_fixture.json', encoding='utf-8'))
X = np.array(fx['cols'], dtype=float).T                     # los 12 ítems del oráculo del AFE (3 factores)
n, p = X.shape
S = np.cov(X, rowvar=False, ddof=1)
bloques = [[0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11]]
nombresX = [f'X{j + 1}' for j in range(p)]
# parámetros con los mismos nombres que el motor: cargas (sin el marcador), varianzas residuales, varianzas y covarianzas de factores
libres = []
for f, b in enumerate(bloques):
    for j in b[1:]: libres.append(('L', j, f, f'F{f + 1} =~ X{j + 1}'))
for j in range(p): libres.append(('T', j, j, f'var residual (X{j + 1})'))
for f in range(3): libres.append(('P', f, f, f'var (F{f + 1})'))
for a in range(3):
    for b in range(a + 1, 3): libres.append(('P', a, b, f'F{a + 1} ~~ F{b + 1}'))

def sigma(t):
    L = np.zeros((p, 3)); T = np.zeros((p, p)); P = np.zeros((3, 3))
    for f, b in enumerate(bloques): L[b[0], f] = 1.0
    for v, (m, i, j, _) in zip(t, libres):
        if m == 'L': L[i, j] = v
        elif m == 'T': T[i, i] = v
        else: P[i, j] = P[j, i] = v
    return L @ P @ L.T + T

logdetS = np.linalg.slogdet(S)[1]
def fml(t):
    Sg = sigma(t); s, ld = np.linalg.slogdet(Sg)
    if s <= 0: return 1e10
    return ld + np.trace(S @ np.linalg.inv(Sg)) - logdetS - p
t0 = np.array([0.7 if m == 'L' else (S[i, i] * 0.5 if m == 'T' else (0.5 if i == j else 0.2)) for (m, i, j, _) in libres])
res = minimize(fml, t0, method='BFGS', options={'gtol': 1e-10, 'maxiter': 20000})
res = minimize(fml, res.x, method='BFGS', options={'gtol': 1e-11, 'maxiter': 20000})
th = res.x; F = float(res.fun); q = len(th); gl = p * (p + 1) // 2 - q
Sg = sigma(th); Si = np.linalg.inv(Sg)
D = []
for k in range(q):
    h = 1e-6 * max(1, abs(th[k])); a = th.copy(); b = th.copy(); a[k] += h; b[k] -= h
    D.append((sigma(a) - sigma(b)) / (2 * h))
I = np.array([[(n - 1) / 2 * np.trace(Si @ D[a] @ Si @ D[b]) for b in range(q)] for a in range(q)])
se = np.sqrt(np.diag(np.linalg.inv(I)))
x2 = (n - 1) * F; Fb = np.log(np.diag(S)).sum() - logdetS; x2b = (n - 1) * Fb; glb = p * (p - 1) // 2
cfi = 1 - max(x2 - gl, 0) / max(x2b - glb, x2 - gl, 1e-12); tli = ((x2b / glb) - (x2 / gl)) / ((x2b / glb) - 1)
rmsea = np.sqrt(max(x2 - gl, 0) / (gl * (n - 1)))
ncp_hi = brentq(lambda l: ncx2.cdf(x2, gl, l) - 0.05, 1e-9, 10 * x2 + 100)
ncp_lo = 0.0 if chi2.cdf(x2, gl) < 0.95 else brentq(lambda l: ncx2.cdf(x2, gl, l) - 0.95, 1e-9, 10 * x2 + 100)
d = np.sqrt(np.diag(S)); dm = np.sqrt(np.diag(Sg)); Ro = S / np.outer(d, d); Rm = Sg / np.outer(dm, dm)
il = np.tril_indices(p); srmr = float(np.sqrt(((Ro - Rm)[il] ** 2).mean()))
salida = {'n': n, 'parametros': {nm: [float(v), float(e)] for (_, _, _, nm), v, e in zip(libres, th, se)}, 'F': F, 'chi2': float(x2), 'gl': gl,
          'pChi2': float(chi2.sf(x2, gl)), 'CFI': float(cfi), 'TLI': float(tli), 'RMSEA': float(rmsea),
          'rmseaIC': [float(np.sqrt(ncp_lo / (gl * (n - 1)))), float(np.sqrt(ncp_hi / (gl * (n - 1))))], 'SRMR': srmr}
# validez convergente y discriminante (solución estandarizada implicada; HTMT con la matriz de correlaciones muestral)
Lf = np.zeros((p, 3)); Tf = np.zeros(p); Pf = np.zeros((3, 3))
for f, b in enumerate(bloques): Lf[b[0], f] = 1.0
for v, (m, i, j, _) in zip(th, libres):
    if m == 'L': Lf[i, j] = v
    elif m == 'T': Tf[i] = v
    else: Pf[i, j] = Pf[j, i] = v
val = {}
for f, b in enumerate(bloques):
    lam = np.array([Lf[j, f] * np.sqrt(Pf[f, f]) / np.sqrt(Sg[j, j]) for j in b]); te = np.array([Tf[j] / Sg[j, j] for j in b])
    val[f'F{f + 1}'] = {'CR': float(lam.sum() ** 2 / (lam.sum() ** 2 + te.sum())), 'AVE': float((lam ** 2).sum() / ((lam ** 2).sum() + te.sum()))}
phic = Pf / np.sqrt(np.outer(np.diag(Pf), np.diag(Pf)))
Rm = S / np.outer(np.sqrt(np.diag(S)), np.sqrt(np.diag(S)))
def htmt(a, b):
    het = np.mean([Rm[i, j] for i in bloques[a] for j in bloques[b]])
    mono = lambda B: np.mean([Rm[B[x], B[y]] for x in range(len(B)) for y in range(x + 1, len(B))])
    return float(het / np.sqrt(mono(bloques[a]) * mono(bloques[b])))
salida['validez'] = {'factores': val, 'correlaciones': phic.tolist(), 'htmt': {f'F{a + 1}-F{b + 1}': htmt(a, b) for a in range(3) for b in range(a + 1, 3)}}
json.dump(salida, open('sem_fixture.json', 'w', encoding='utf-8'))
print(f'sem_fixture.json escrito: AFC 3 factores × 12 ítems, {q} parámetros, F = {F:.10f}, χ²({gl}) = {x2:.3f}')
