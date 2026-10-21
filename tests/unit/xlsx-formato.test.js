// tests/unit/xlsx-formato.test.js — (2026.12.31) las piezas del puente con Excel que no dependen de un archivo: qué
// formatos de número son de fecha (core/data/xlsx/fechas.js), los números de serie como fechas en los sistemas de 1900 y
// 1904 (con el 29 de febrero de 1900 que Excel cuenta y no existió) y su inversa, las fechas ISO de las celdas de tipo «d»,
// las referencias de celda (core/data/xlsx/referencias.js) y los escapes del texto de una celda (core/data/xlsx/xml.js),
// que el lector deshace exactamente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diasASerie, esFormatoDeFecha, fechaIsoATexto, serieAFecha, FORMATO_FECHA_CORTA } from '../../src/core/data/xlsx/fechas.js';
import { letrasDeColumna, referenciaACelda, MAXIMO_COLUMNAS } from '../../src/core/data/xlsx/referencias.js';
import { escaparTextoCelda, escaparXml, textoXml, atributosXml, prefijoDe, etiquetasXml } from '../../src/core/data/xlsx/xml.js';
import { BaseColumnar } from '../../src/core/data/base-columnar.js';

test('formatos de número: cuáles son de fecha', () => {
    const fechas = ['dd/mm/yyyy', 'DD/MM/YYYY', 'yyyy-mm-dd hh:mm:ss', 'mmm-yy', 'mmmm', 'h:mm AM/PM', 'hh:mm', 'mm:ss', '[$-409]mmmm d, yyyy;@', '[$-F800]dddd, mmmm dd, yyyy', 'd "de" mmmm "de" yyyy', '[Red]dd/mm/yy'];
    const numeros = ['General', '0', '0.00', '0.00%', '#,##0.00\\ "€"', '0.00E+00', '"día "0', '[Red]0.00', '0" mm"', '0\\ \\m', '_(* #,##0_);_(* (#,##0)', '#,##0 [$€-C0A]', '@', '[h]:mm:ss', '[mm]:ss', '[s]', '0;[Red]-0;"cero"'];
    for (const f of fechas) assert.equal(esFormatoDeFecha(164, f), true, f);
    for (const f of numeros) assert.equal(esFormatoDeFecha(164, f), false, f);
    // los integrados: 14–22, 45, 47 (y los de Asia oriental) sí; 46 ([h]:mm:ss, una duración) y los numéricos, no
    for (const id of [14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 36, 45, 47, 50, 58]) assert.equal(esFormatoDeFecha(id, undefined), true, String(id));
    for (const id of [0, 1, 2, 9, 10, 11, 37, 44, 46, 48, 49, 59]) assert.equal(esFormatoDeFecha(id, undefined), false, String(id));
    // un integrado redefinido por el libro manda su código
    assert.equal(esFormatoDeFecha(14, '0.00'), false);
    assert.equal(FORMATO_FECHA_CORTA, 14);
});

test('números de serie como fechas: el sistema de 1900 (con su 29 de febrero), el de 1904, las horas y los bordes', () => {
    const casos1900 = [[1, '1900-01-01'], [59, '1900-02-28'], [60, '1900-02-29'], [61, '1900-03-01'], [25569, '1970-01-01'], [45000, '2023-03-15'],
        [45000.5, '2023-03-15 12:00:00'], [45000.25 + 1 / 86400, '2023-03-15 06:00:01'], [2958465, '9999-12-31'], [0.5, '12:00:00'], [0, '00:00:00'],
        [0.99999999, '23:59:59'], [44999.999999999, '2023-03-15'], [60.5, '1900-02-29 12:00:00']];
    for (const [s, f] of casos1900) assert.equal(serieAFecha(s), f, String(s));
    for (const s of [-1, 2958466, NaN, Infinity]) assert.equal(serieAFecha(s), null, String(s));
    const casos1904 = [[0, '00:00:00'], [1, '1904-01-02'], [1462, '1908-01-02'], [43538, '2023-03-15'], [43538.75, '2023-03-15 18:00:00']];
    for (const [s, f] of casos1904) assert.equal(serieAFecha(s, true), f, `1904: ${s}`);
    assert.equal(serieAFecha(2957003, true), '9999-12-31');
    assert.equal(serieAFecha(2957004, true), null);
});

test('días desde 1970 como número de serie, y de vuelta, en todo el calendario de Excel', () => {
    for (let dias = -25567; dias <= 2932896; dias += 997) {
        const s = diasASerie(dias);
        assert.notEqual(s, null, String(dias));
        assert.equal(serieAFecha(/** @type {number} */ (s)), BaseColumnar.diasAISO(dias), `${dias} días`);
    }
    for (const dias of [-25567, -25509, -25508, 0, 19723, 2932896]) assert.equal(serieAFecha(/** @type {number} */ (diasASerie(dias))), BaseColumnar.diasAISO(dias));
    assert.equal(diasASerie(0), 25569);
    assert.equal(diasASerie(-25568), null, '1899-12-31: antes de las fechas de Excel');
    assert.equal(diasASerie(2932897), null, '10000-01-01');
});

test('fechas ISO de las celdas de tipo «d»', () => {
    const casos = [['2024-05-01T13:30:15', '2024-05-01 13:30:15'], ['2024-05-01T00:00:00', '2024-05-01'], ['2024-05-01', '2024-05-01'], ['2024-05-01T13:30:15.250Z', '2024-05-01 13:30:15'],
        ['2024-05-01T13:30Z', '2024-05-01 13:30:00'], ['2024-05-01T13:30:15+02:00', '2024-05-01 13:30:15'], ['13:30:00', '13:30:00'], ['T08:15', '08:15:00'], ['ayer', 'ayer'], [' 2024-05-01 ', '2024-05-01']];
    for (const [iso, t] of casos) assert.equal(fechaIsoATexto(iso), t, iso);
});

test('referencias de celda: columnas A…XFD y referencias como «AB12»', () => {
    assert.deepEqual([0, 25, 26, 51, 52, 701, 702, 16383].map(letrasDeColumna), ['A', 'Z', 'AA', 'AZ', 'BA', 'ZZ', 'AAA', 'XFD']);
    for (let c = 0; c < MAXIMO_COLUMNAS; c += 37) assert.deepEqual(referenciaACelda(letrasDeColumna(c) + '7'), { fila: 6, columna: c });
    assert.deepEqual(referenciaACelda('ab12'), { fila: 11, columna: 27 });
    assert.deepEqual(referenciaACelda('XFD1048576'), { fila: 1048575, columna: 16383 });
    for (const malo of ['', 'A', '12', 'A0', 'A1B', '$A$1', 'XFE1', 'AAAA1', 'A1048577', 'A-1']) assert.equal(referenciaACelda(malo), null, malo);
});

test('el texto de una celda: los escapes del escritor los deshace el lector, exactamente', () => {
    const textos = ['', 'simple', 'a & b < c > d', 'retorno\r\ny salto\n', '\u0000\u0001\u0008\u000B\u000C\u001F', 'tab\t', '_x000D_', '_x005F_', '__x0041__', '_x00e9_ minúscula',
        '_X0041_', 'casi _x00G1_', 'emoji 🎉 y ñ', '￾￿', 'comillas "y" \'apóstrofos\''];
    const u = (() => { let s = 3; return () => (s = (s * 48271) % 2147483647) / 2147483647; })();
    const piezas = ['_x', '000D_', '_', 'x', 'A', '&', '<', '\r', '\n', '\u0001', 'ñ', '🎉', '005F_', ' '];
    for (let k = 0; k < 2000; k++) textos.push(Array.from({ length: 1 + Math.floor(u() * 12) }, () => piezas[Math.floor(u() * piezas.length)]).join(''));
    for (const t of textos) {
        const escrito = escaparTextoCelda(t);
        assert.doesNotMatch(escrito, /[\u0000-\u0008\u000B-\u001F<>￾￿]/, `sin caracteres que XML no admite ni etiquetas: ${JSON.stringify(t)}`);
        assert.equal(textoXml(escrito, true), t, JSON.stringify(t));
    }
    // los suplentes sueltos no caben en XML: pasan a U+FFFD
    assert.equal(textoXml(escaparTextoCelda('a\uD800b\uDC00c🎉'), true), 'a�b�c🎉');
    // los atributos y el resto de las partes
    assert.equal(escaparXml('Hoja "1" & <2>\u0001'), 'Hoja &quot;1&quot; &amp; &lt;2&gt;');
    assert.deepEqual(atributosXml(` r="A1" x:t='s' s = "3" n="&amp;&#233;&#x1F600;"`), { r: 'A1', 'x:t': 's', t: 's', s: '3', n: '&é😀' });
    assert.equal(prefijoDe('<?xml version="1.0"?><x:worksheet xmlns:x="…">', 'worksheet'), 'x:');
    assert.equal(prefijoDe('<worksheet xmlns="…">', 'worksheet'), '');
    const etiquetas = [...etiquetasXml('<?xml?><!-- <c> --><a b=">"><![CDATA[<d/>]]><c/></a>')].map(e => `${e.tipo}:${e.nombre}${e.vacia ? '/' : ''}`);
    assert.deepEqual(etiquetas, ['abre:a', 'abre:c/', 'cierra:a']);
});
