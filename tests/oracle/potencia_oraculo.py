# potencia_oraculo.py — oráculo de la potencia y el tamaño de muestra (2027.01.18), escrito aparte de core/stats/potencia.js
# y potencia-mediacion.js:
#   · la potencia de cada prueba con las no centrales de SciPy (nct, ncf, ncx2) y la de la correlación integrando con quad la
#     densidad exacta de r (Hotelling, 1953) con scipy.special.hyp2f1; el tamaño de muestra, recorriendo los n enteros uno a
#     uno (otro algoritmo que la raíz de Brent del programa); el efecto detectable con brentq;
#   · la mediación simple por Monte Carlo reproduciendo bit a bit los generadores del programa (sfc32 con la semilla de cada
#     réplica y las normales de Box-Muller por pares) y la significación conjunta con np.linalg.lstsq: las mismas bases, las
#     mismas decisiones, la misma potencia; y la búsqueda del tamaño de muestra con la misma regla.
# Escribe potencia_fixture.json; lo compara tests/unit/potencia.test.js.
import json, math, os
import numpy as np
from scipy import stats, special, integrate, optimize

M32 = 0xFFFFFFFF

def potencia(prueba, efecto, n, alfa=0.05, colas=2, razon=1, k=2, gl=1, predictores=1, probados=None):
    a = alfa / 2 if colas == 2 else alfa
    if prueba in ('t2', 't1'):
        n2 = razon * n; df = n + n2 - 2 if prueba == 't2' else n - 1
        delta = abs(efecto) * (math.sqrt(n * n2 / (n + n2)) if prueba == 't2' else math.sqrt(n))
        tc = stats.t.ppf(1 - a, df)
        p = stats.nct.sf(tc, df, delta)
        # la cola contraria, P(T' < −t_c) = P(T' > t_c | −δ): la cdf de SciPy da NaN lejos del centro (es despreciable ahí)
        contraria = stats.nct.sf(tc, df, -delta) if colas == 2 else 0.0
        return p + (contraria if math.isfinite(contraria) else 0.0)
    if prueba == 'r':
        tc = stats.t.ppf(1 - a, n - 2); rc = tc / math.sqrt(tc * tc + n - 2); rho = abs(efecto)
        lc = math.log(n - 2) + special.gammaln(n - 1) - 0.5 * math.log(2 * math.pi) - special.gammaln(n - 0.5) + (n - 1) / 2 * math.log1p(-rho * rho)
        dens = lambda u: math.exp(lc + (n - 4) / 2 * math.log1p(-u * u) - (n - 1.5) * math.log1p(-rho * u)) * special.hyp2f1(0.5, 0.5, n - 0.5, (1 + rho * u) / 2)
        cola = integrate.quad(dens, rc, 1, epsabs=1e-14, epsrel=1e-12, limit=200)[0]
        return min(1.0, cola + (integrate.quad(dens, -1, -rc, epsabs=1e-14, epsrel=1e-12, limit=200)[0] if colas == 2 else 0.0))
    if prueba == 'anova':
        d1, d2 = k - 1, n - k
        return stats.ncf.sf(stats.f.ppf(1 - alfa, d1, d2), d1, d2, efecto ** 2 * n)
    if prueba == 'chi2':
        return stats.ncx2.sf(stats.chi2.ppf(1 - alfa, gl), gl, efecto ** 2 * n)
    q = probados or predictores; d2 = n - predictores - 1
    return stats.ncf.sf(stats.f.ppf(1 - alfa, q, d2), q, d2, efecto * n)

def tamano(prueba, efecto, potencia_deseada=0.8, **o):
    """El menor número de unidades (n₁ en t2, por grupo en el ANOVA, el total en las demás), uno a uno."""
    k, razon = o.get('k', 2), o.get('razon', 1)
    n = {'t2': 2, 't1': 2, 'r': 5, 'anova': 2, 'chi2': 1, 'regresion': o.get('predictores', 1) + 2}[prueba]
    while True:
        if prueba == 't2': p = potencia(prueba, efecto, n, **{**o, 'razon': math.ceil(razon * n) / n})
        elif prueba == 'anova': p = potencia(prueba, efecto, k * n, **o)
        else: p = potencia(prueba, efecto, n, **o)
        if p >= potencia_deseada: return n, p
        n += 1

casos = [('t2', 0.5, {}), ('t2', 0.2, {}), ('t2', 0.8, {}), ('t2', 0.5, {'colas': 1}), ('t2', 0.5, {'razon': 2}), ('t2', 0.35, {'alfa': 0.01}),
         ('t1', 0.5, {}), ('t1', 0.3, {'colas': 1}), ('r', 0.3, {}), ('r', 0.1, {}), ('r', 0.5, {'colas': 1}),
         ('anova', 0.25, {'k': 3}), ('anova', 0.25, {'k': 4}), ('anova', 0.4, {'k': 3}), ('anova', 0.1, {'k': 5}),
         ('chi2', 0.3, {'gl': 1}), ('chi2', 0.3, {'gl': 2}), ('chi2', 0.1, {'gl': 4}),
         ('regresion', 0.15, {'predictores': 3}), ('regresion', 0.15, {'predictores': 5}), ('regresion', 0.02, {'predictores': 3}), ('regresion', 0.05, {'predictores': 6, 'probados': 2})]
tamanos = []
for prueba, efecto, o in casos:
    n, p = tamano(prueba, efecto, **o)
    tamanos.append({'prueba': prueba, 'efecto': efecto, 'opciones': o, 'n': n, 'potenciaReal': p})
potencias = []
for prueba, efecto, n, o in [('t2', 0.5, 20, {}), ('t2', 0.5, 20.5, {'razon': 1.5}), ('t1', 0.2, 100, {}), ('r', 0.25, 60, {}), ('r', 0.6, 12, {'colas': 1}), ('r', 0.0, 30, {}),
                             ('anova', 0.3, 90, {'k': 3}), ('chi2', 0.2, 150, {'gl': 3}), ('regresion', 0.1, 80, {'predictores': 4}), ('t2', 1.2, 4, {})]:
    potencias.append({'prueba': prueba, 'efecto': efecto, 'n': n, 'opciones': o, 'potencia': float(potencia(prueba, efecto, n, **o))})
detectables = []
for prueba, n, o in [('t2', 64, {}), ('r', 84, {}), ('anova', 53, {'k': 3}), ('chi2', 88, {'gl': 1}), ('regresion', 77, {'predictores': 3}), ('t1', 34, {})]:
    unidades = (lambda e: potencia(prueba, e, o.get('k', 2) * n, **o)) if prueba == 'anova' else (lambda e: potencia(prueba, e, n, **o))
    detectables.append({'prueba': prueba, 'n': n, 'opciones': o, 'efecto': optimize.brentq(lambda e: unidades(e) - 0.8, 1e-6, 0.99 if prueba == 'r' else 2, xtol=1e-13)})

# ---------- la mediación por Monte Carlo, con los generadores del programa ----------
class Sfc32:
    def __init__(self, semilla):
        self.s = semilla & M32
        self.a, self.b, self.c, self.d = (self._mezcla() for _ in range(4))
        for _ in range(12): self.siguiente32()
    def _mezcla(self):
        self.s = (self.s + 0x9e3779b9) & M32; z = self.s
        z = ((z ^ (z >> 16)) * 0x85ebca6b) & M32; z = ((z ^ (z >> 13)) * 0xc2b2ae35) & M32
        return (z ^ (z >> 16)) & M32
    def siguiente32(self):
        t = (self.a + self.b) & M32
        self.a = (self.b ^ (self.b >> 9)) & M32; self.b = (self.c + (self.c << 3)) & M32
        self.c = ((self.c << 21) | (self.c >> 11)) & M32; self.d = (self.d + 1) & M32
        t = (t + self.d) & M32; self.c = (self.c + t) & M32
        return t
    def siguiente(self): return self.siguiente32() / 4294967296

def normales(g):
    while True:
        v = 0.0
        while v == 0.0: v = g.siguiente()
        m = math.sqrt(-2 * math.log(v)); t = 2 * math.pi * g.siguiente()
        yield m * math.cos(t); yield m * math.sin(t)

def semilla_cadena(semilla, l): return (semilla + (((l + 1) * 0x9e3779b1) & M32)) & M32

def potencia_mediacion(a, b, cp, n, R, semilla=2027, alfa=0.05):
    # (2027.01.20) el modelo de Fritz y MacKinnon (2007): los errores de M y de Y, N(0, 1)
    tc1, tc2 = stats.t.ppf(1 - alfa / 2, n - 2), stats.t.ppf(1 - alfa / 2, n - 3)
    sM, sY = 1.0, 1.0
    si = 0
    for r in range(R):
        z = normales(Sfc32(semilla_cadena(semilla, r)))
        X = np.empty(n); Mm = np.empty(n); Y = np.empty(n)
        for i in range(n):
            x = next(z); m = a * x + sM * next(z); X[i] = x; Mm[i] = m; Y[i] = cp * x + b * m + sY * next(z)
        def t_de(y, cols, j):
            A = np.column_stack([np.ones(n)] + cols); beta = np.linalg.lstsq(A, y, rcond=None)[0]
            e = y - A @ beta; s2 = e @ e / (n - A.shape[1]); V = s2 * np.linalg.inv(A.T @ A)
            return beta[j] / math.sqrt(V[j, j])
        if abs(t_de(Mm, [X], 1)) > tc1 and abs(t_de(Y, [X, Mm], 2)) > tc2: si += 1
    return si / R

def tamano_mediacion(a, b, cp, R, objetivo=0.8):
    pot = lambda n: potencia_mediacion(a, b, cp, n, R)
    lo, hi = 4, 16
    while pot(hi) < objetivo: lo, hi = hi, hi * 2
    it = math.ceil(math.log2(hi - lo)) + 2
    x_lo, x_hi = float(lo), float(hi)
    for _ in range(it):   # la bisección del núcleo (biseccion de optimizacion.js), sobre n redondeado como Math.round
        medio = (x_lo + x_hi) / 2
        if pot(math.floor(medio + 0.5)) < objetivo: x_lo = medio
        else: x_hi = medio
    n = math.ceil((x_lo + x_hi) / 2)
    while n > 4 and pot(n - 1) >= objetivo: n -= 1
    while pot(n) < objetivo: n += 1
    return n, pot(n)

def potencia_fm(a, b, cp, n, R, rng, alfa=0.05):
    # (2027.01.20) la potencia del modelo de Fritz y MacKinnon con OTRO generador (el de NumPy) y muchas réplicas, vectorizada:
    # lo que se compara con su Tabla 3 (74 personas para a = b = .39 y 36 para .59, con c′ = 0)
    X = rng.standard_normal((R, n)); M = a * X + rng.standard_normal((R, n)); Y = cp * X + b * M + rng.standard_normal((R, n))
    Xc, Mc, Yc = (V - V.mean(1, keepdims=True) for V in (X, M, Y))
    sxx = (Xc * Xc).sum(1); ba = (Xc * Mc).sum(1) / sxx; ra = Mc - ba[:, None] * Xc
    ta = ba / np.sqrt((ra * ra).sum(1) / (n - 2) / sxx)
    smm, sxm, sxy, smy = (Mc * Mc).sum(1), (Xc * Mc).sum(1), (Xc * Yc).sum(1), (Mc * Yc).sum(1)
    det = sxx * smm - sxm ** 2; bx = (smm * sxy - sxm * smy) / det; bm = (sxx * smy - sxm * sxy) / det
    rb = Yc - bx[:, None] * Xc - bm[:, None] * Mc; tb = bm / np.sqrt((rb * rb).sum(1) / (n - 3) * sxx / det)
    return float(np.mean((np.abs(ta) > stats.t.ppf(1 - alfa / 2, n - 2)) & (np.abs(tb) > stats.t.ppf(1 - alfa / 2, n - 3))))

rng_fm = np.random.default_rng(20270120)
fritz = [{'a': a, 'b': a, 'cp': 0.0, 'nTabla3': n, 'potencia': potencia_fm(a, a, 0.0, n, 40000, rng_fm), 'potenciaMenos': potencia_fm(a, a, 0.0, n - 1, 40000, rng_fm)} for a, n in [(0.39, 74), (0.59, 36)]]

R = 200
mediacion = [{'a': a, 'b': b, 'cp': cp, 'n': n, 'R': R, 'potencia': potencia_mediacion(a, b, cp, n, R)} for a, b, cp, n in [(0.39, 0.39, 0.0, 60), (0.26, 0.39, 0.2, 80), (0.14, 0.59, -0.1, 150), (0.0, 0.39, 0.0, 50)]]
nMed, pMed = tamano_mediacion(0.39, 0.39, 0.0, R)
salida = {'tamanos': tamanos, 'potencias': potencias, 'detectables': detectables, 'mediacion': mediacion, 'tamanoMediacion': {'a': 0.39, 'b': 0.39, 'cp': 0.0, 'R': R, 'n': nMed, 'potencia': pMed}, 'fritz': fritz}
ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'potencia_fixture.json')
with open(ruta, 'w', encoding='utf-8', newline='\n') as f: json.dump(salida, f)
print(f"potencia_fixture.json escrito: {len(tamanos)} tamaños de muestra (d = .5 → {tamanos[0]['n']} por grupo, r = .3 → {tamanos[8]['n']}, f = .25 con 3 grupos → {tamanos[11]['n']} por grupo, w = .3 → {tamanos[15]['n']}, f² = .15 con 3 predictores → {tamanos[18]['n']}), {len(potencias)} potencias, {len(detectables)} efectos detectables; mediación por Monte Carlo con los generadores del programa ({R} réplicas): n = {nMed} para a = b = .39")
