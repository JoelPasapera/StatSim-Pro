# depuracion_oraculo.py — oráculo de la depuración de una base (2027.01.18), con una implementación independiente de la de
# src/analizador/depuracion/deteccion-casos.js, en NumPy y SciPy:
#   · duplicados por tuplas de los valores (la primera aparición se conserva) e identificadores repetidos;
#   · fuera de rango (y no enteros), perdidos por caso (más del 20 %);
#   · longstring por itertools.groupby (los perdidos cortan la cadena) con el umbral max(6, ⌈k/2⌉), e IRV nula con np.std;
#   · z con la media y la DE muestral (ddof = 1) de cada variable, |z| > 3,29;
#   · Mahalanobis con np.linalg.solve sobre la covarianza muestral de los casos completos y su p con scipy.stats.chi2.sf.
# Una base de 150 personas con 10 ítems Likert de 1 a 5 (un factor común) y casos sembrados con cada problema. Escribe
# depuracion_fixture.json; lo compara tests/unit/depuracion.test.js.
import itertools, json, math, os
import numpy as np
from scipy import stats

rng = np.random.default_rng(20270118)
n, k = 150, 10
items = [f'P{j + 1}' for j in range(k)]
lat = rng.normal(0, 1, n)
X = np.clip(np.rint(3 + 0.9 * lat[:, None] + rng.normal(0, 0.8, (n, k))), 1, 5).astype(object)
# el ítem 9, casi siempre bajo (un 5 en él es un atípico univariado)
X[:, 8] = np.where(rng.random(n) < 0.85, 1, 2).astype(object)
ids = [f'E{i + 1:03d}' for i in range(n)]
# sembrados (filas desde 0)
X[5] = X[2].copy()                                   # duplicado de la fila 3
ids[30] = ids[10]                                    # identificador repetido
X[40, 2] = 7; X[41, 4] = 0; X[42, 1] = 3.5           # fuera de rango y no entero
for j in (0, 3, 6): X[50, j] = ''                    # 3 de 10 en blanco: más del 20 %
for j in (1, 7): X[51, j] = ''                       # 2 de 10: justo el 20 %, no se marca
X[60, :6] = 4; X[60, 6:] = [2, 5, 1, 3]; X[60, 8] = 2 # 6 seguidas: el umbral (max(6, 5))
X[61, :5] = 4; X[61, 5:] = [2, 5, 1, 2, 3]            # 5 seguidas: no llega
X[70, :] = 3                                          # la misma respuesta en todo (IRV = 0)
X[80, 8] = 5                                          # atípico univariado en P9
X[90, :5] = 5; X[90, 5:] = 1; X[90, 8] = 1            # incoherente: atípico multivariado

filas = [{'ID': ids[i], **{c: (X[i, j] if X[i, j] == '' else (int(X[i, j]) if float(X[i, j]).is_integer() else float(X[i, j]))) for j, c in enumerate(items)}} for i in range(n)]
opciones = {'items': items, 'id': 'ID', 'minimo': 1, 'maximo': 5, 'enteros': True}

def num(v):
    return np.nan if v == '' else float(v)

M = np.array([[num(f[c]) for c in items] for f in filas], dtype=float)
marcas = {m: [] for m in ['duplicado', 'idRepetido', 'fueraDeRango', 'perdidos', 'longstring', 'sinVariabilidad', 'atipicoUnivariado', 'atipicoMultivariado']}
vistas, vistos_id = {}, {}
for i, f in enumerate(filas):
    clave = tuple(None if f[c] == '' else str(f[c]) for c in items)
    if clave in vistas: marcas['duplicado'].append(i + 1)
    else: vistas[clave] = i
    if f['ID'] in vistos_id: marcas['idRepetido'].append(i + 1)
    else: vistos_id[f['ID']] = i
umbral = max(6, math.ceil(k / 2))
longstrings = []
for i in range(n):
    v = M[i]
    validos = v[~np.isnan(v)]
    if np.any((validos < 1) | (validos > 5) | (validos != np.floor(validos))): marcas['fueraDeRango'].append(i + 1)
    if np.isnan(v).sum() / k > 0.2: marcas['perdidos'].append(i + 1)
    ls = 0
    for clave, grupo in itertools.groupby(v, key=lambda x: 'nan' if np.isnan(x) else x):
        if clave != 'nan': ls = max(ls, len(list(grupo)))
    longstrings.append(ls)
    if ls >= umbral: marcas['longstring'].append(i + 1)
    if len(validos) >= 6 and np.std(validos) == 0: marcas['sinVariabilidad'].append(i + 1)
uni = set()
for j in range(k):
    col = M[:, j]; ok = ~np.isnan(col)
    m, s = col[ok].mean(), col[ok].std(ddof=1)
    z = (col - m) / s
    uni |= {i + 1 for i in range(n) if ok[i] and abs(z[i]) > 3.29}
marcas['atipicoUnivariado'] = sorted(uni)
completos = np.where(~np.isnan(M).any(axis=1))[0]
C = M[completos]
D = C - C.mean(axis=0)
S = np.cov(C, rowvar=False, ddof=1)
d2 = np.einsum('ij,ij->i', D, np.linalg.solve(S, D.T).T)
p = stats.chi2.sf(d2, k)
marcas['atipicoMultivariado'] = [int(completos[a]) + 1 for a in range(len(completos)) if p[a] < 0.001]
for m in ('duplicado', 'idRepetido', 'fueraDeRango', 'perdidos', 'longstring', 'sinVariabilidad', 'atipicoUnivariado', 'atipicoMultivariado'):
    assert marcas[m], f'el oráculo debe sembrar al menos un caso de {m}'
casos = sorted({f for v in marcas.values() for f in v})

salida = {'filas': filas, 'opciones': opciones, 'umbralLongstring': umbral, 'marcas': marcas, 'casos': casos, 'longstrings': longstrings,
          'completos': [int(i) + 1 for i in completos], 'd2': d2.tolist(), 'p': p.tolist()}
ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'depuracion_fixture.json')
with open(ruta, 'w', encoding='utf-8', newline='\n') as f: json.dump(salida, f, ensure_ascii=False)
print(f'depuracion_fixture.json: {n} casos, {k} ítems; {len(casos)} casos marcados; ' + ', '.join(f'{m} {len(v)}' for m, v in marcas.items()))
