# multinivel_oraculo.py — oráculo del modelo de intercepto aleatorio (2027.01.19), escrito aparte de
# core/stats/multinivel.js, con NumPy y SciPy y las matrices completas (sin la forma cerrada de Sherman–Morrison del programa):
#   · la REML de V = σ²_u·ZZᵀ + σ²_e·I maximizada con scipy.optimize.minimize sobre (log σ²_u, log σ²_e), con la
#     log-verosimilitud escrita con np.linalg.slogdet y solve, y (2027.01.20) refinada con el método de Newton con el gradiente
#     y el hessiano exactos (con X sin centrar, la REML calculada así tiene un ruido de 10⁻¹⁰ que no deja converger a
#     Nelder-Mead ni a BFGS con tolerancias más finas); β por mínimos cuadrados generalizados; la ML aparte;
#   · los gl de Satterthwaite de cada coeficiente (la fórmula de lmerTest), (2027.01.20) con el hessiano EXACTO de la REML,
#     ½tr(PV_aPV_b) − yᵀPV_aPV_bPy, y el gradiente exacto de la varianza de β, ∂C/∂θ_a = C·XᵀV⁻¹V_aV⁻¹X·C (V_a = ZZᵀ o I),
#     en lugar de las diferencias centrales del programa; la CCI, el efecto de diseño, la razón de verosimilitudes de σ²_u = 0
#     con su mezcla de χ² y los R² de Nakagawa y Schielzeth (con la varianza muestral de la parte fija, la de performance y
#     MuMIn).
# Cuatro bases con un predictor de cada nivel y grupos desiguales: 30 grupos con mucha varianza entre ellos, 15 grupos con
# poca, 15 grupos sin ella (la REML en el borde, σ²_u = 0: el modelo lineal, sus gl y una razón de verosimilitudes nula) y,
# (2027.01.20) 20 colegios con notas vigesimales, el año de nacimiento SIN centrar (2008 ± 1) y un predictor de colegio de
# media 50: X sin centrar, como la da el usuario (con el núcleo de la 2027.01.19, los gl del predictor de colegio salían
# cinco veces mayores).
# Escribe multinivel_fixture.json; lo compara tests/unit/multinivel.test.js.
import json, math, os
import numpy as np
from scipy import optimize, stats

rng = np.random.default_rng(20270119)

def base(G, s2u, s2e, rng):
    y, x, w, g = [], [], [], []
    for j in range(G):
        uj, wj, nj = rng.normal(0, math.sqrt(s2u)), rng.normal(), int(rng.integers(4, 20))
        for _ in range(nj):
            xi = rng.normal(); y.append(10 + 1.5 * xi + 0.8 * wj + uj + rng.normal(0, math.sqrt(s2e))); x.append(xi); w.append(wj); g.append(j)
    return np.array(y), np.array(x), np.array(w), np.array(g)

def piezas(y, X, Z, s2u, s2e):
    V = s2u * Z @ Z.T + s2e * np.eye(len(y))
    Vi = np.linalg.inv(V)
    XtViX = X.T @ Vi @ X
    beta = np.linalg.solve(XtViX, X.T @ Vi @ y)
    r = y - X @ beta
    return V, Vi, XtViX, beta, r

def reml(lv, y, X, Z):
    s2u, s2e = math.exp(lv[0]), math.exp(lv[1])
    V, Vi, XtViX, beta, r = piezas(y, X, Z, s2u, s2e)
    n, p = X.shape
    return -0.5 * (np.linalg.slogdet(V)[1] + np.linalg.slogdet(XtViX)[1] + r @ Vi @ r + (n - p) * math.log(2 * math.pi))

def ml(lv, y, X, Z):
    s2u, s2e = math.exp(lv[0]), math.exp(lv[1])
    V, Vi, XtViX, beta, r = piezas(y, X, Z, s2u, s2e)
    return -0.5 * (np.linalg.slogdet(V)[1] + r @ Vi @ r + len(y) * math.log(2 * math.pi))

def hessiano_exacto(y, X, Z, s2u, s2e):
    # el de la REML en (σ²_u, σ²_e): V es lineal en los dos (V_a = ZZᵀ, I), así que ∂²ℓ/∂θ_a∂θ_b = ½tr(PV_aPV_b) − yᵀPV_aPV_bPy
    V, Vi, XtViX, beta, r = piezas(y, X, Z, s2u, s2e)
    ViX = Vi @ X
    P = Vi - ViX @ np.linalg.solve(XtViX, ViX.T)
    Vd = [Z @ Z.T, np.eye(len(y))]
    Py = P @ y
    H = np.zeros((2, 2))
    for a in range(2):
        for b in range(2):
            H[a, b] = 0.5 * np.trace(P @ Vd[a] @ P @ Vd[b]) - Py @ Vd[a] @ P @ Vd[b] @ Py
    return H

def gradiente_exacto(y, X, Z, s2u, s2e):
    # el de la REML en (σ²_u, σ²_e): −½tr(PV_a) + ½yᵀPV_aPy
    V, Vi, XtViX, beta, r = piezas(y, X, Z, s2u, s2e)
    ViX = Vi @ X
    P = Vi - ViX @ np.linalg.solve(XtViX, ViX.T)
    Py = P @ y
    return np.array([-0.5 * np.trace(P @ Vd) + 0.5 * Py @ Vd @ Py for Vd in (Z @ Z.T, np.eye(len(y)))])

def newton(y, X, Z, th):
    # el máximo de la REML en (σ²_u, σ²_e) desde un punto cercano: pasos de Newton con el gradiente y el hessiano exactos,
    # acortados a la mitad si salen de las varianzas positivas o bajan la REML
    th = np.array(th, dtype=float)
    for _ in range(50):
        paso = -np.linalg.solve(hessiano_exacto(y, X, Z, *th), gradiente_exacto(y, X, Z, *th))
        t, actual = 1.0, reml(np.log(th), y, X, Z)
        while t > 1e-10:
            nuevo = th + t * paso
            if nuevo.min() > 0 and reml(np.log(nuevo), y, X, Z) >= actual - 1e-9: break
            t /= 2
        th = nuevo
        if np.max(np.abs(t * paso) / th) < 1e-14: break
    return th

def gradiente_C(y, X, Z, s2u, s2e):
    # ∂C/∂θ_a = C·XᵀV⁻¹·V_a·V⁻¹X·C, con C = (XᵀV⁻¹X)⁻¹
    V, Vi, XtViX, beta, r = piezas(y, X, Z, s2u, s2e)
    C = np.linalg.inv(XtViX); ViX = Vi @ X
    return [C @ (ViX.T @ Vd @ ViX) @ C for Vd in (Z @ Z.T, np.eye(len(y)))]

def resolver(y, x, w, g):
    n = len(y); G = g.max() + 1
    X = np.column_stack([np.ones(n), x, w]); Z = np.zeros((n, G)); Z[np.arange(n), g] = 1
    # las verosimilitudes y su maximización, con los predictores centrados (|XᵀV⁻¹X| y los residuos no cambian, y sin centrar el
    # año, su log-determinante tiene un ruido de 10⁻¹⁰); β, C y su gradiente, con X tal cual. Nelder-Mead se acerca (con unas
    # tolerancias por encima del redondeo de una log-verosimilitud de ~10³: con 10⁻¹³ no termina) y Newton afina
    Xc = np.column_stack([np.ones(n), x - x.mean(), w - w.mean()])
    r = optimize.minimize(lambda lv: -reml(lv, y, Xc, Z), [0.0, math.log(np.var(y))], method='Nelder-Mead', options={'xatol': 1e-8, 'fatol': 1e-10, 'maxiter': 5000})
    s2u, s2e = math.exp(r.x[0]), math.exp(r.x[1])
    if s2u > 1e-6 * s2e:
        s2u, s2e = newton(y, Xc, Z, [s2u, s2e])
        r.x = np.log([s2u, s2e]); r.fun = -reml(r.x, y, Xc, Z)
    p = X.shape[1]
    # σ²_u = 0: el modelo lineal con la misma parte fija (su REML)
    beta0 = np.linalg.lstsq(X, y, rcond=None)[0]; r0 = y - X @ beta0; s0 = r0 @ r0 / (n - p)
    reml0 = -0.5 * ((n - p) * math.log(s0) + np.linalg.slogdet(Xc.T @ Xc)[1] + (n - p) * (1 + math.log(2 * math.pi)))
    if s2u < 1e-6 * s2e or -r.fun <= reml0:   # el máximo, en el borde
        C = np.linalg.inv(X.T @ X) * s0
        coefs = [{'b': beta0[k], 'ee': math.sqrt(C[k, k]), 't': beta0[k] / math.sqrt(C[k, k]), 'gl': n - p, 'pValor': float(2 * stats.t.sf(abs(beta0[k] / math.sqrt(C[k, k])), n - p))} for k in range(p)]
        mlv = optimize.minimize(lambda lv: -ml(lv, y, Xc, Z), [math.log(1e-3 * s0), math.log(s0)], method='Nelder-Mead', options={'xatol': 1e-8, 'fatol': 1e-10, 'maxiter': 5000})
        ml0 = -0.5 * (n * math.log(r0 @ r0 / n) + n * (1 + math.log(2 * math.pi)))
        s2f = np.var(X @ beta0, ddof=1)
        return {'y': y.tolist(), 'x': x.tolist(), 'w': w.tolist(), 'g': g.tolist(), 's2u': 0.0, 's2e': s0, 'icc': 0.0, 'efectoDiseno': 1.0,
                'coeficientes': coefs, 'reml': reml0, 'ml': max(ml0, -mlv.fun), 'lrt': 0.0, 'pLrt': 1.0, 'satterthwaite': False,
                'r2Marginal': s2f / (s2f + s0), 'r2Condicional': s2f / (s2f + s0)}
    V, Vi, XtViX, beta, res = piezas(y, X, Z, s2u, s2e)
    C = np.linalg.inv(XtViX)
    # Satterthwaite: A = (−H)⁻¹ en (σ²_u, σ²_e); g = ∂C_kk/∂θ, los dos exactos
    A = np.linalg.inv(-hessiano_exacto(y, Xc, Z, s2u, s2e))
    dC = gradiente_C(y, X, Z, s2u, s2e)
    coefs = []
    for k in range(X.shape[1]):
        grad = np.array([dC[0][k, k], dC[1][k, k]])
        gl = 2 * C[k, k] ** 2 / (grad @ A @ grad)
        t = beta[k] / math.sqrt(C[k, k])
        coefs.append({'b': beta[k], 'ee': math.sqrt(C[k, k]), 't': t, 'gl': gl, 'pValor': float(2 * stats.t.sf(abs(t), gl))})
    lrt = max(0.0, 2 * (-r.fun - reml0))
    mlv = optimize.minimize(lambda lv: -ml(lv, y, Xc, Z), r.x, method='Nelder-Mead', options={'xatol': 1e-8, 'fatol': 1e-10, 'maxiter': 5000})
    s2f = np.var(X @ beta, ddof=1)   # la de performance::r2_nakagawa (var de R)
    icc = s2u / (s2u + s2e)
    return {'y': y.tolist(), 'x': x.tolist(), 'w': w.tolist(), 'g': g.tolist(), 's2u': s2u, 's2e': s2e, 'icc': icc, 'efectoDiseno': 1 + (n / G - 1) * icc,
            'coeficientes': coefs, 'reml': -r.fun, 'ml': -mlv.fun, 'lrt': lrt, 'pLrt': 0.5 * float(stats.chi2.sf(lrt, 1)), 'satterthwaite': True,
            'r2Marginal': s2f / (s2f + s2u + s2e), 'r2Condicional': (s2f + s2u) / (s2f + s2u + s2e)}

def notas(G, rng):
    # notas de 0 a 20 (redondeadas), el año de nacimiento sin centrar y un predictor de colegio de media 50
    y, x, w, g = [], [], [], []
    for j in range(G):
        uj, wj, nj = rng.normal(0, 0.8), 50 + 10 * rng.normal(), int(rng.integers(8, 33))
        for _ in range(nj):
            xi = 2008 + round(1.2 * rng.normal())
            y.append(min(20, max(0, round(14 - 0.3 * (xi - 2008) + 0.03 * (wj - 50) + uj + 2.3 * rng.normal())))); x.append(xi); w.append(wj); g.append(j)
    return np.array(y, dtype=float), np.array(x, dtype=float), np.array(w), np.array(g)

salida = {'grande': resolver(*base(30, 4.0, 9.0, rng)), 'pequena': resolver(*base(15, 1.5, 9.0, rng)), 'borde': resolver(*base(15, 0.0, 9.0, rng))}
salida['notas'] = resolver(*notas(20, rng))
ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'multinivel_fixture.json')
with open(ruta, 'w', encoding='utf-8', newline='\n') as f: json.dump(salida, f)
print('multinivel_fixture.json escrito: ' + '; '.join(f"{k}: CCI {v['icc']:.3f}, gl de Satterthwaite " + ', '.join(f"{c['gl']:.1f}" for c in v['coeficientes']) + f", LRT {v['lrt']:.2f}" for k, v in salida.items()))
