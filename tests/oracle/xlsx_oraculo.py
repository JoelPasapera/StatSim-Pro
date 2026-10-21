#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""xlsx_oraculo.py — (2026.12.31) referencia independiente del lector y del escritor de Excel propios
(core/data/xlsx/lector.js y escritor.js): openpyxl lee los libros de prueba de xlsx/ (escritos por openpyxl, XlsxWriter,
LibreOffice y a mano: xlsx/generar.py) y los que escribe el escritor propio con los casos de xlsx_casos.js (los escribe
xlsx_escribir.mjs, con Node), y guarda lo que leyó en xlsx_fixture.json. La prueba de Node (tests/integration/xlsx.test.js)
comprueba con ese fixture que el lector propio lee lo mismo que openpyxl y que el escritor sigue produciendo exactamente
los bytes que openpyxl leyó bien.

Lo que se compara, celda por celda, con las mismas convenciones que documenta el lector (docs/LIMITACIONES.md):
  · las fechas como «AAAA-MM-DD», «AAAA-MM-DD HH:MM:SS» o «HH:MM:SS» (al segundo); las duraciones, como los días que guardan;
  · los errores de Excel y las fórmulas sin resultado guardado, celdas vacías (contadas); en un libro que pide recalcular
    al abrirse, una fórmula con 0 como resultado guardado también (es el provisional que escriben los programas);
  · los textos vacíos, celdas vacías;
  · los escapes _xHHHH_ de ECMA-376 (§22.4.2.4), aplicados en una pasada: openpyxl no los aplica (solo quita «x005F_»),
    así que aquí se le enseña a hacerlo, antes de esa sustitución.
Los libros que openpyxl no sabe leer (la variante «strict» y uno con las partes nombradas con otras mayúsculas) son
copias de a_mano_prefijos.xlsx con lo mismo dentro: se comparan con lo que openpyxl leyó de ese.

Uso: python3 xlsx_oraculo.py   (hace falta openpyxl, y Node para el escritor propio)
"""
import datetime as dt
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import warnings
import zipfile

import openpyxl
import openpyxl.reader.excel as lector_excel
from openpyxl.cell.text import Text
from openpyxl.worksheet._reader import VALUE_TAG, WorkSheetParser
from openpyxl.xml.constants import SHEET_MAIN_NS
from openpyxl.xml.functions import iterparse

AQUI = os.path.dirname(os.path.abspath(__file__))
warnings.filterwarnings('ignore', category=UserWarning, module='openpyxl')   # «no default style» de los libros escritos a mano
ESCAPE = re.compile(r'_x([0-9A-Fa-f]{4})_')


def sin_escapes(s):
    return ESCAPE.sub(lambda m: chr(int(m.group(1), 16)), s)


def leer_cadenas(fuente):
    """Las cadenas compartidas, con los escapes de ECMA-376 aplicados (en lugar del «replace('x005F_', '')» de openpyxl)."""
    cadenas = []
    etiqueta = '{%s}si' % SHEET_MAIN_NS
    for _, nodo in iterparse(fuente):
        if nodo.tag == etiqueta:
            cadenas.append(sin_escapes(Text.from_tree(nodo).content))
            nodo.clear()
    return cadenas


lector_excel.read_string_table = leer_cadenas
_celda_original = WorkSheetParser.parse_cell


def leer_celda(self, elemento):
    """Las cadenas en línea y los resultados de texto de las fórmulas, también con los escapes aplicados; y las duraciones
    como el número que guarda la celda (openpyxl las pasa por un timedelta, que redondea al microsegundo)."""
    celda = _celda_original(self, elemento)
    if elemento.get('t') in ('inlineStr', 'str') and isinstance(celda['value'], str):
        celda['value'] = sin_escapes(celda['value'])
    if isinstance(celda['value'], dt.timedelta):
        celda['value'] = float(elemento.findtext(VALUE_TAG))
        celda['data_type'] = 'n'
    return celda


WorkSheetParser.parse_cell = leer_celda


def como_texto_de_fecha(v):
    dos = lambda x: '%02d' % x
    if isinstance(v, dt.datetime):
        total = round((v - dt.datetime(v.year, v.month, v.day)).total_seconds())
        dia = dt.date(v.year, v.month, v.day)
        if total >= 86400:
            dia, total = dia + dt.timedelta(days=1), total - 86400
        fecha = '%04d-%s-%s' % (dia.year, dos(dia.month), dos(dia.day))
        return fecha if total == 0 else '%s %s:%s:%s' % (fecha, dos(total // 3600), dos(total // 60 % 60), dos(total % 60))
    if isinstance(v, dt.time):
        total = min(86399, round(v.hour * 3600 + v.minute * 60 + v.second + v.microsecond / 1e6))
        return '%s:%s:%s' % (dos(total // 3600), dos(total // 60 % 60), dos(total % 60))
    raise TypeError(v)


def pide_recalcular(ruta):
    """¿Pide el libro recalcular al abrirse (<calcPr fullCalcOnLoad="1"/>)? Del XML del libro, no de openpyxl: su
    CalcProperties da True cuando el atributo falta, y en ECMA-376 su valor por omisión es false."""
    with zipfile.ZipFile(ruta) as z:
        nombres = {n.lower(): n for n in z.namelist()}
        libro = z.read(nombres.get('xl/workbook.xml', 'xl/workbook.xml')).decode('utf-8')
    m = re.search(r'<(?:\w+:)?calcPr\b[^>]*\bfullCalcOnLoad\s*=\s*["\'](1|true)["\']', libro)
    return m is not None


def leer_libro(ruta):
    con_valores = openpyxl.load_workbook(ruta, data_only=True)
    con_formulas = openpyxl.load_workbook(ruta, data_only=False)
    recalcular = pide_recalcular(ruta)
    hojas = []
    for ws in con_valores.worksheets:
        wf = con_formulas[ws.title]
        valores = {}
        errores = formulas_sin_valor = fechas = 0
        for (r, c), celda in sorted(ws._cells.items()):
            v = celda.value
            formula = wf._cells.get((r, c))
            es_formula = formula is not None and formula.data_type == 'f'
            if es_formula and v is None:
                formulas_sin_valor += 1
                continue
            if es_formula and recalcular and isinstance(v, (int, float)) and not isinstance(v, bool) and v == 0:
                formulas_sin_valor += 1
                continue
            if v is None:
                continue
            if celda.data_type == 'e':
                errores += 1
                continue
            if isinstance(v, bool):
                pass
            elif isinstance(v, (dt.datetime, dt.time)):
                v = como_texto_de_fecha(v)
                fechas += 1
            elif isinstance(v, dt.date):
                v = como_texto_de_fecha(dt.datetime(v.year, v.month, v.day))
                fechas += 1
            elif isinstance(v, dt.timedelta):
                v = v.total_seconds() / 86400
            elif isinstance(v, str):
                if v == '':
                    continue
            elif isinstance(v, (int, float)):
                v = float(v) if isinstance(v, float) else int(v)
            else:
                raise TypeError('%s!%s: %r' % (ws.title, celda.coordinate, v))
            valores[(r, c)] = v
        n_filas = max((r for r, _ in valores), default=0)
        filas = [None] * n_filas
        for (r, c), v in valores.items():
            fila = filas[r - 1]
            if fila is None:
                fila = filas[r - 1] = []
            while len(fila) < c:
                fila.append(None)
            fila[c - 1] = v
        hojas.append({'nombre': ws.title, 'oculta': ws.sheet_state != 'visible', 'filas': filas,
                      'columnas': max((len(f) for f in filas if f), default=0), 'celdas': len(valores),
                      'errores': errores, 'formulasSinValor': formulas_sin_valor, 'fechas': fechas})
    return {'fecha1904': con_valores.epoch == openpyxl.utils.datetime.CALENDAR_MAC_1904, 'recalcular': recalcular, 'hojas': hojas}


IGUAL_QUE = {'a_mano_estricto.xlsx': 'a_mano_prefijos.xlsx', 'a_mano_mayusculas.xlsx': 'a_mano_prefijos.xlsx'}


def main():
    carpeta = os.path.join(AQUI, 'xlsx')
    reales = []
    for archivo in sorted(f for f in os.listdir(carpeta) if f.endswith('.xlsx')):
        bytes_ = open(os.path.join(carpeta, archivo), 'rb').read()
        if archivo.startswith('cifrado'):
            continue   # no es un ZIP: el lector lo rechaza con su mensaje (la prueba de Node lo comprueba)
        origen = IGUAL_QUE.get(archivo, archivo)
        libro = leer_libro(os.path.join(carpeta, origen))
        reales.append({'archivo': archivo, 'sha256': hashlib.sha256(bytes_).hexdigest(), 'igualQue': origen if origen != archivo else None, 'openpyxl': libro})
    escritos = []
    temporal = tempfile.mkdtemp(prefix='statsim-xlsx-')
    try:
        salida = subprocess.run(['node', os.path.join(AQUI, 'xlsx_escribir.mjs'), temporal], check=True, capture_output=True, text=True).stdout
        for caso in json.loads(salida):
            ruta = os.path.join(temporal, caso['archivo'])
            caso['openpyxl'] = leer_libro(ruta)
            escritos.append(caso)
    finally:
        for f in os.listdir(temporal):
            os.remove(os.path.join(temporal, f))
        os.rmdir(temporal)
    destino = os.path.join(AQUI, 'xlsx_fixture.json')
    temporal_fixture = destino + '.tmp'
    with open(temporal_fixture, 'w', encoding='utf-8') as f:
        json.dump({'descripcion': 'Lo que lee openpyxl %s de los libros de prueba de xlsx/ y de los que escribe core/data/xlsx/escritor.js (xlsx_casos.js). Generado por xlsx_oraculo.py.' % openpyxl.__version__,
                   'reales': reales, 'escritos': escritos}, f, ensure_ascii=False, allow_nan=False)
        f.write('\n')
    os.replace(temporal_fixture, destino)   # de una vez: la prueba de Node, si corre a la vez, nunca lo lee a medias
    celdas = sum(h['celdas'] for r in reales for h in r['openpyxl']['hojas'])
    print('xlsx_fixture.json: %d libros reales (%d celdas) y %d escritos por el escritor propio, leídos por openpyxl %s' % (len(reales), celdas, len(escritos), openpyxl.__version__))


if __name__ == '__main__':
    sys.exit(main())
