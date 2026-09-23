#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""oraculo.py — F2 de la revisión transversal.
Lee ref/<id>.csv, ref/<id>.esquema.json y ref/<id>.informe.json y recalcula, con
NumPy y sin nada del generador, el valor «obtenido» de cada fila del informe.
Un desacuerdo (mismo dato, mismo estimador) es un hallazgo de estimador."""
import csv, json, math, re, sys, glob, os
import numpy as np

TOL_DEFECTO = 0.006

# ----------------------------------------------------------------- lectura
def leer_csv(ruta):
    with open(ruta, encoding='utf-8') as f:
        lector = csv.reader(f, delimiter=';')
        cab = next(lector)
        filas = list(lector)
    cols = {}
    for j, nombre in enumerate(cab):
        vals = [fila[j] if j < len(fila) else '' for fila in filas]
        num = np.full(len(vals), np.nan)
        texto = [None] * len(vals)
        for i, v in enumerate(vals):
            if v == '':
                continue
            try:
                num[i] = float(v.replace(',', '.'))   # CSV «internacional»: coma decimal
            except ValueError:
                texto[i] = v
        cols[nombre] = {'num': num, 'texto': texto, 'es_texto': any(t is not None for t in texto)}
    return cols

def numerica(cols, nombre, etiquetas=None):
    """Columna numérica; si es de texto (etiquetas), la traduce a códigos con el mapa dado."""
    c = cols[nombre]
    if not c['es_texto']:
        return c['num'].copy()
    if etiquetas is None:
        raise KeyError(f'columna de texto sin etiquetas: {nombre}')
    inv = {v: float(k) for k, v in etiquetas.items()}
    out = np.full(len(c['texto']), np.nan)
    for i, t in enumerate(c['texto']):
        if t is not None:
            out[i] = inv[t]
        elif not np.isnan(c['num'][i]):
            out[i] = c['num'][i]
    return out

# ----------------------------------------------------------------- estimadores
def sd(x):
    x = x[np.isfinite(x)]
    return float(np.std(x, ddof=1)) if len(x) > 1 else float('nan')

def pearson(x, y):
    m = np.isfinite(x) & np.isfinite(y)
    if m.sum() < 3:
        return float('nan')
    return float(np.corrcoef(x[m], y[m])[0, 1])

def d_marginal(valores, codigos):
    """Pendiente sobre el código dividida por la DE agrupada dentro de los grupos."""
    m = np.isfinite(valores) & np.isfinite(codigos)
    v, c = valores[m], codigos[m]
    grupos = np.unique(c)
    if len(grupos) < 2:
        return float('nan')
    ss = 0.0; gl = 0
    for gval in grupos:
        vg = v[c == gval]
        if len(vg) > 1:
            ss += float(((vg - vg.mean()) ** 2).sum()); gl += len(vg) - 1
    de = math.sqrt(ss / gl) if gl > 0 else float('nan')
    if len(grupos) == 2:
        return (v[c == grupos[1]].mean() - v[c == grupos[0]].mean()) / de
    cc = c - c.mean()
    pend = float((cc * (v - v.mean())).sum() / (cc ** 2).sum())
    return pend / de

def d_interaccion(valores, ca, cb):
    m = np.isfinite(valores) & np.isfinite(ca) & np.isfinite(cb)
    v, a, b = valores[m], ca[m] == 1, cb[m] == 1
    celdas = [[v[(a == i) & (b == j)] for j in (0, 1)] for i in (0, 1)]
    ss = 0.0; gl = 0
    for fila in celdas:
        for cel in fila:
            ss += float(((cel - cel.mean()) ** 2).sum()); gl += len(cel) - 1
    de = math.sqrt(ss / gl)
    return ((celdas[1][1].mean() - celdas[1][0].mean()) - (celdas[0][1].mean() - celdas[0][0].mean())) / de

def alfa(items):
    X = np.column_stack(items)
    X = X[np.isfinite(X).all(axis=1)]
    k = X.shape[1]
    return k / (k - 1) * (1 - X.var(axis=0, ddof=1).sum() / X.sum(axis=1).var(ddof=1))

def paf_un_factor(R, iteraciones=30):
    k = R.shape[0]
    h2 = np.array([max(abs(R[i, j]) for j in range(k) if j != i) for i in range(k)])
    cargas = None
    for _ in range(iteraciones):
        Rr = R.copy(); np.fill_diagonal(Rr, h2)
        w, V = np.linalg.eigh(Rr)
        lam, v = w[-1], V[:, -1]
        if v.sum() < 0:
            v = -v
        nuevas = math.sqrt(max(lam, 0)) * v
        cambio = np.abs(nuevas ** 2 - h2).max()
        h2 = np.minimum(nuevas ** 2, 0.999)
        cargas = nuevas
        if cambio < 1e-6:
            break
    return cargas

def omega(items):
    X = np.column_stack(items); X = X[np.isfinite(X).all(axis=1)]
    R = np.corrcoef(X, rowvar=False)
    l = paf_un_factor(R)
    sdev = X.std(axis=0, ddof=1)
    lam = l * sdev  # cargas no estandarizadas
    return (lam.sum() ** 2) / X.sum(axis=1).var(ddof=1)

def item_resto(items):
    X = np.column_stack(items); X = X[np.isfinite(X).all(axis=1)]
    out = []
    for j in range(X.shape[1]):
        resto = X.sum(axis=1) - X[:, j]
        out.append(float(np.corrcoef(X[:, j], resto)[0, 1]))
    return out

def betas_estandarizados(y, Xcols, estandarizar_x=True):
    """Coeficientes de la regresión de y (estandarizada) sobre las columnas (centradas)."""
    m = np.isfinite(y)
    for c in Xcols:
        m &= np.isfinite(c)
    y = y[m]; Xc = [c[m] for c in Xcols]
    yz = (y - y.mean()) / y.std(ddof=0)
    X = np.column_stack([np.ones(len(y))] + [(c - c.mean()) for c in Xc])
    b = np.linalg.lstsq(X, yz, rcond=None)[0]
    return b[1:]

def estandariza(x):
    return (x - np.nanmean(x)) / np.nanstd(x, ddof=0)

def glm(y, Xcols, familia, iters=40):
    m = np.isfinite(y)
    for c in Xcols:
        m &= np.isfinite(c)
    y = y[m]
    X = np.column_stack([np.ones(m.sum())] + [(c[m] - c[m].mean()) / c[m].std(ddof=1) for c in Xcols])
    beta = np.zeros(X.shape[1])
    mu0 = y.mean()
    beta[0] = math.log(mu0 / (1 - mu0)) if familia == 'logit' else math.log(mu0)
    for _ in range(iters):
        eta = X @ beta
        if familia == 'logit':
            mu = 1 / (1 + np.exp(-eta)); w = mu * (1 - mu)
        else:
            mu = np.exp(np.minimum(eta, 30)); w = mu
        z = eta + (y - mu) / np.maximum(w, 1e-9)
        W = np.diag(w)
        nuevo = np.linalg.solve(X.T @ W @ X, X.T @ (w * z))
        if np.abs(nuevo - beta).max() < 1e-8:
            beta = nuevo; break
        beta = nuevo
    return beta

def icc_anova(valores, codigos):
    m = np.isfinite(valores) & np.isfinite(codigos)
    v, c = valores[m], codigos[m]
    grupos = np.unique(c)
    K = len(grupos); N = len(v); mg = v.mean()
    ssb = sum(len(v[c == g]) * (v[c == g].mean() - mg) ** 2 for g in grupos)
    ssw = sum(((v[c == g] - v[c == g].mean()) ** 2).sum() for g in grupos)
    msb = ssb / (K - 1); msw = ssw / (N - K)
    n0 = (N - sum(len(v[c == g]) ** 2 for g in grupos) / N) / (K - 1)
    return (msb - msw) / (msb + (n0 - 1) * msw)

def kappa_fleiss(cols):
    M = np.column_stack(cols); M = M[np.isfinite(M).all(axis=1)]
    N, m = M.shape
    cats = np.unique(M)
    cuenta = np.array([[np.sum(fila == c) for c in cats] for fila in M])
    P = ((cuenta ** 2).sum(axis=1) - m) / (m * (m - 1))
    Pbar = P.mean()
    p = cuenta.sum(axis=0) / (N * m)
    Pe = (p ** 2).sum()
    return (Pbar - Pe) / (1 - Pe), Pbar

def cramer_v(a, b):
    m = np.isfinite(a) & np.isfinite(b)
    a, b = a[m], b[m]
    ca, cb = np.unique(a), np.unique(b)
    tabla = np.array([[np.sum((a == x) & (b == y)) for y in cb] for x in ca], dtype=float)
    n = tabla.sum(); fe = tabla.sum(axis=1, keepdims=True) @ tabla.sum(axis=0, keepdims=True) / n
    chi2 = ((tabla - fe) ** 2 / fe).sum()
    return math.sqrt(chi2 / n / min(len(ca) - 1, len(cb) - 1))

def kmo(R):
    inv = np.linalg.inv(R)
    d = np.sqrt(np.outer(np.diag(inv), np.diag(inv)))
    P = -inv / d
    k = R.shape[0]
    off = ~np.eye(k, dtype=bool)
    return (R[off] ** 2).sum() / ((R[off] ** 2).sum() + (P[off] ** 2).sum())

# ----------------------------------------------------------------- utilidades
def recodificar(items, esquema_prueba, cols, n):
    """Ítems de la escala recodificados (los invertidos, reflejados)."""
    out = []
    k = esquema_prueba['numItems']; inv = esquema_prueba['invertidos']; mn, mx = esquema_prueba['minimo'], esquema_prueba['maximo']
    for j, nombre in enumerate(esquema_prueba['items']):
        x = cols[nombre]['num'].copy()
        if inv and j >= k - inv and mn is not None and mx is not None:
            x = mn + mx - x
        out.append(x)
    return out

def num_obtenido(texto):
    m = re.match(r'\s*(-?[0-9]+(?:\.[0-9]+)?)', str(texto).replace(',', '.'))
    return float(m.group(1)) if m else None

def parse_pct_lista(texto):
    return [float(v) / 100 for v in re.findall(r'(-?[0-9]+(?:\.[0-9]+)?)%', texto)]

# ----------------------------------------------------------------- comparación de una base
def comparar_base(id_):
    cols = leer_csv(f'ref/{id_}.csv')
    esq = json.load(open(f'ref/{id_}.esquema.json', encoding='utf-8'))
    inf = json.load(open(f'ref/{id_}.informe.json', encoding='utf-8'))
    n = esq['n']
    pruebas = {p['nombre']: p for p in esq['pruebas']}
    socios = {s['categoria']: s for s in esq['socios']}
    colde = esq['columnaDe']
    etiquetas_de = {}   # columna → {codigo: etiqueta}
    for s in esq['socios']:
        if s['niveles'] and any(x.get('etiqueta') for x in s['niveles']):
            etiquetas_de[s['columna']] = {str(x['codigo']): x['etiqueta'] for x in s['niveles']}
    for d in esq['desenlaces']:
        if d['tipo'] == 'binario' and d.get('etiquetas'):
            etiquetas_de[d['nombre']] = {'0': d['etiquetas'][0], '1': d['etiquetas'][1]}
        if d['tipo'] == 'ordinal' and d.get('niveles'):
            etiquetas_de[d['nombre']] = {str(x['codigo']): x['etiqueta'] for x in d['niveles']}
    for c in esq['cortes']:
        etiquetas_de[c['columna']] = {str(k + 1): e for k, e in enumerate(c['etiquetas'])}
    for j in esq['jueces']:
        if j['tipo'] == 'jueces':
            for col in j['columnas']:
                etiquetas_de[col] = etiquetas_de.get(j['columnaVerdad'], None)

    def col(nombre_var):
        c = colde.get(nombre_var, nombre_var)
        return numerica(cols, c, etiquetas_de.get(c))

    resultados = []
    def registrar(fila, oraculo, tol=TOL_DEFECTO, nota=''):
        obt = num_obtenido(fila['obtenido'])
        if obt is None or oraculo is None or (isinstance(oraculo, float) and math.isnan(oraculo)):
            resultados.append((fila['tipo'], fila['variable'][:60], fila['obtenido'], oraculo, 'SIN COMPARAR', nota)); return
        dif = abs(obt - oraculo)
        # el informe redondea: la tolerancia mínima es media unidad del último decimal mostrado
        dec = len(str(fila['obtenido']).split('→')[-1].strip().split(' ')[0].split('.')[-1]) if '.' in str(fila['obtenido']).split(' ')[0] else 0
        tol_eff = max(tol, 0.5 * 10 ** (-dec) + 1e-9)
        resultados.append((fila['tipo'], fila['variable'][:60], fila['obtenido'], round(oraculo, 4), 'OK' if dif <= tol_eff else f'DIF {dif:.4f}', nota))

    for f in inf:
        t, v = f['tipo'], f['variable']
        try:
            if t in ('Media', 'DE'):
                x = col(v)
                registrar(f, float(np.nanmean(x)) if t == 'Media' else sd(x))
            elif t == 'r':
                a, b = v.split(' ↔ ')
                registrar(f, pearson(col(a), col(b)))
            elif t == 'd':
                m = re.match(r'(.*) por (.*)$', v)
                registrar(f, d_marginal(col(m.group(1)), col(m.group(2))))
            elif t in ('α', 'ω', 'KR-20'):
                nombre = re.sub(r' \((ítems dicotómicos|implícito por las cargas)\)$', '', v)
                p = pruebas[nombre]
                items = recodificar(p, p, cols, n)
                registrar(f, alfa(items) if t != 'ω' else omega(items), tol=0.006)
            elif t == 'p':
                p = pruebas[v.split(':')[0]]
                items = recodificar(p, p, cols, n)
                X = np.column_stack(items); mn = p['minimo']
                pobs = np.nanmean(X, axis=0) - mn
                registrar(f, float(pobs.mean()), nota=f'mín–máx oráculo {pobs.min():.2f}–{pobs.max():.2f}')
            elif t == 'disc':
                p = pruebas[v.split(':')[0]]
                ir = item_resto(recodificar(p, p, cols, n))
                registrar(f, float(np.mean(ir)), nota=f'mín oráculo {min(ir):.2f}')
            elif t == 'λ':
                p = pruebas[v.split(':')[0]]
                X = np.column_stack(recodificar(p, p, cols, n)); X = X[np.isfinite(X).all(axis=1)]
                l = paf_un_factor(np.corrcoef(X, rowvar=False))
                registrar(f, float(l.mean()), tol=0.012)
            elif t == 'λ×':
                m = re.match(r'(.*) ítem (\d+): carga cruzada sobre (.*)$', v)
                p = pruebas[m.group(1)]; otra = pruebas[m.group(3)]
                item = recodificar(p, p, cols, n)[int(m.group(2)) - 1]
                b = betas_estandarizados(item, [estandariza(col(p['nombre'])), estandariza(col(otra['nombre']))])
                registrar(f, float(b[1]), tol=0.012)
            elif t == 'KMO':
                test = v.split(':')[0]
                items = []
                for p in esq['pruebas']:
                    if p['estructura'] and p['base'] is None and p['nombre'] in [q['nombre'] for q in esq['pruebas']]:
                        items += recodificar(p, p, cols, n)
                X = np.column_stack(items); X = X[np.isfinite(X).all(axis=1)]
                registrar(f, kmo(np.corrcoef(X, rowvar=False)), tol=0.006)
            elif t in ('a', 'b', 'c′', 'a·b'):
                m = re.match(r'Mediación (.*) → (.*) → (.*): ', v)
                x, med, y = col(m.group(1)), col(m.group(2)), col(m.group(3))
                # casos completos de X, M e Y para todos los coeficientes (listwise, como el informe y como PROCESS)
                mk = np.isfinite(x) & np.isfinite(med) & np.isfinite(y)
                x, med, y = np.where(mk, x, np.nan), np.where(mk, med, np.nan), np.where(mk, y, np.nan)
                a_ = betas_estandarizados(med, [estandariza(x)])[0]
                by = betas_estandarizados(y, [estandariza(x), estandariza(med)])
                registrar(f, {'a': a_, 'b': by[1], 'c′': by[0], 'a·b': a_ * by[1]}[t], tol=0.002)
            elif t in ('β₁', 'β₂', 'β₃'):
                if v.startswith('Curvilínea'):
                    m = re.match(r'Curvilínea (.*) → (.*): ', v)
                    zx = estandariza(col(m.group(1))); y = col(m.group(2))
                    q = zx * zx
                    b = betas_estandarizados(y, [zx, q])
                    registrar(f, float(b[0] if t == 'β₁' else b[1]), tol=0.002)
                else:
                    m = re.match(r'Moderación (.*) × (.*) → (.*): ', v)
                    zx, zw, y = estandariza(col(m.group(1))), estandariza(col(m.group(2))), col(m.group(3))
                    b = betas_estandarizados(y, [zx, zw, zx * zw])
                    registrar(f, float({'β₁': b[0], 'β₂': b[1], 'β₃': b[2]}[t]), tol=0.002)
            elif t == 'prevalencia':
                y = col(v.split(' (')[0]); registrar(f, float(np.nanmean(y)) * 100, tol=0.06)
            elif t == 'media':
                y = col(v.split(' (')[0]); registrar(f, float(np.nanmean(y)))
            elif t in ('OR', 'IRR'):
                m = re.match(r'(.*) ~ (.*) \(', v)
                d = next(x for x in esq['desenlaces'] if x['nombre'] == m.group(1))
                y = col(d['nombre'])
                preds = [col(pr['variable']) for pr in d['predictores']]
                if d['tipo'] == 'ordinal':
                    lab = re.search(r'dicotomía «> (.*)»', v).group(1)
                    corte = [x['codigo'] for x in d['niveles'] if x['etiqueta'] == lab][0]
                    y = (y > corte).astype(float); y[np.isnan(col(d['nombre']))] = np.nan
                beta = glm(y, preds, 'logit' if t == 'OR' else 'log')
                j = [pr['variable'] for pr in d['predictores']].index(m.group(2))
                registrar(f, float(math.exp(beta[j + 1])), tol=0.006)
            elif t == '%':
                nombre = v.split(' (')[0]
                x = col(nombre)
                if nombre in socios:
                    niveles = [s['codigo'] for s in socios[nombre]['niveles']]
                else:
                    d = next(d for d in esq['desenlaces'] if d['nombre'] == nombre); niveles = [s['codigo'] for s in d['niveles']]
                fin = x[np.isfinite(x)]
                props = [float(np.mean(fin == c)) for c in niveles]
                registrar(f, props[0] * 100, tol=0.06, nota='primera categoría; oráculo ' + ' / '.join(f'{p*100:.1f}%' for p in props))
            elif t == 'V':
                m = re.match(r'(.*) según (.*) \(', v)
                registrar(f, cramer_v(col(m.group(2)), col(m.group(1))))
            elif t == 'd×':
                m = re.match(r'(.*): interacción (.*) × (.*) \(', v)
                registrar(f, d_interaccion(col(m.group(1)), col(m.group(2)), col(m.group(3))))
            elif t == 'CCI':
                m = re.match(r'(.*): coeficiente de correlación intraclase por (.*) \(', v)
                registrar(f, icc_anova(col(m.group(1)), col(m.group(2))))
            elif t == 'κ':
                nombre = v.split(':')[0]
                j = next(j for j in esq['jueces'] if j['variable'] == nombre and j['tipo'] == 'jueces')
                k_, pbar = kappa_fleiss([col(c) for c in j['columnas']])
                registrar(f, k_, nota=f'acuerdo oráculo {pbar*100:.0f} %')
            elif t == 'CCI jueces':
                nombre = v.split(':')[0]
                j = next(j for j in esq['jueces'] if j['variable'] == nombre and j['tipo'] == 'juecesContinuo')
                vals = []; codes = []
                for c in j['columnas']:
                    x = col(c); vals.append(x); codes.append(np.arange(n, dtype=float))
                registrar(f, icc_anova(np.concatenate(vals), np.concatenate(codes)))
            elif t == 'r_tt':
                m = re.match(r'(.*): T1 → T(\d) estabilidad', v)
                base = pruebas[m.group(1)]; onda = next(p for p in esq['pruebas'] if p['base'] == m.group(1) and p['onda'] == int(m.group(2)))
                registrar(f, pearson(col(base['nombre']), col(onda['nombre'])))
            elif t == 'd cambio':
                m = re.match(r'(.*): T1 → T(\d) cambio(?: en (.*) = (\d))?', v)
                base = pruebas[m.group(1)]; onda = next(p for p in esq['pruebas'] if p['base'] == m.group(1) and p['onda'] == int(m.group(2)))
                x1, x2 = col(base['nombre']), col(onda['nombre'])
                mask = np.isfinite(x1) & np.isfinite(x2)
                if m.group(3):
                    mask &= (col(m.group(3)) == float(m.group(4)))
                registrar(f, float((x2[mask].mean() - x1[mask].mean()) / sd(x1)), tol=0.012, nota='DE de T1 en toda la muestra')
            elif t == 'interacción':
                m = re.match(r'(.*): T1 → T(\d) tiempo × (.*) \(', v)
                base = pruebas[m.group(1)]; onda = next(p for p in esq['pruebas'] if p['base'] == m.group(1) and p['onda'] == int(m.group(2)))
                x1, x2, g = col(base['nombre']), col(onda['nombre']), col(m.group(3))
                mask = np.isfinite(x1) & np.isfinite(x2)
                c1 = (x2[mask & (g == 1)].mean() - x1[mask & (g == 1)].mean()); c0 = (x2[mask & (g == 0)].mean() - x1[mask & (g == 0)].mean())
                registrar(f, float((c1 - c0) / sd(x1)), tol=0.012)
            elif t == 'r inf':
                m = re.match(r'(.*): concordancia autoinforme ↔ (.*)$', v)
                base = pruebas[m.group(1)]; inf_ = next(p for p in esq['pruebas'] if p['base'] == m.group(1) and p['informante'] == m.group(2))
                registrar(f, pearson(col(base['nombre']), col(inf_['nombre'])))
            elif t == 'd sesgo':
                m = re.match(r'(.*): sesgo de (.*) \(', v)
                base = pruebas[m.group(1)]; inf_ = next(p for p in esq['pruebas'] if p['base'] == m.group(1) and p['informante'] == m.group(2))
                x1, x2 = col(base['nombre']), col(inf_['nombre'])
                mask = np.isfinite(x1) & np.isfinite(x2)
                registrar(f, float((x2[mask].mean() - x1[mask].mean()) / sd(x1[mask])))
            elif t == 'niveles':
                colN = v.split(' (')[0]
                x = col(colN); fin = x[np.isfinite(x)]
                props = [float(np.mean(fin == k + 1)) for k in range(len(etiquetas_de[colN]))]
                registrar(f, props[0] * 100, tol=0.06, nota='primera categoría; oráculo ' + ' / '.join(f'{p*100:.1f}%' for p in props))
            else:
                resultados.append((t, v[:60], f['obtenido'], None, 'NO CUBIERTO', ''))
        except Exception as e:  # noqa
            resultados.append((t, v[:60], f['obtenido'], None, 'ERROR ' + repr(e)[:80], ''))
    return resultados

if __name__ == '__main__':
    ids = sys.argv[1:] or sorted(set(os.path.basename(p).split('.')[0] for p in glob.glob('ref/*.csv')), key=lambda s: int(s[1:]))
    total = {'OK': 0, 'DIF': 0, 'SIN': 0, 'NO': 0, 'ERR': 0}
    for id_ in ids:
        res = comparar_base(id_)
        difs = [r for r in res if r[4].startswith('DIF') or r[4].startswith('ERROR')]
        for r in res:
            k = 'OK' if r[4] == 'OK' else ('DIF' if r[4].startswith('DIF') else ('SIN' if r[4].startswith('SIN') else ('NO' if r[4].startswith('NO') else 'ERR')))
            total[k] += 1
        print(f'== {id_}: {len(res)} filas · OK {sum(1 for r in res if r[4]=="OK")} · DIF {sum(1 for r in res if r[4].startswith("DIF"))} · no cubierto {sum(1 for r in res if r[4].startswith("NO"))} · sin comparar {sum(1 for r in res if r[4].startswith("SIN"))} · errores {sum(1 for r in res if r[4].startswith("ERROR"))}')
        for r in difs:
            print(f'   {r[4]:<12} [{r[0]}] {r[1]} | informe {r[2]} | oráculo {r[3]} {r[5]}')
    print('TOTAL', total)
