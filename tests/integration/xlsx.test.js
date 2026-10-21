// tests/integration/xlsx.test.js — (2026.12.31) el puente con Excel (core/data/xlsx/): el lector y el escritor propios
// contra openpyxl, con el fixture que generó tests/oracle/xlsx_oraculo.py:
//   · el lector lee de los libros de prueba (tests/oracle/xlsx/: escritos por openpyxl, XlsxWriter, LibreOffice y a mano,
//     con cadenas compartidas y en línea, fórmulas con y sin resultado, errores, fechas de los sistemas de 1900 y 1904 y
//     en ISO, duraciones, hojas ocultas y dispersas, prefijos de espacio de nombres, la variante «strict», ZIP64 y
//     descriptores de datos) exactamente lo que lee openpyxl, con el descompresor del entorno y con el propio;
//   · los formatos que no son .xlsx (.xls, .ods, .xlsb, un libro cifrado, un documento de Word, un CSV) y los libros
//     dañados dan un error que dice qué hacer;
//   · el escritor sigue escribiendo las partes que openpyxl leyó bien, y el lector lee de ellas lo mismo que openpyxl;
//   · ida y vuelta escritor → lector con tablas al azar, y una hoja grande en un tiempo razonable;
//   · el Simulador descarga su base como libro (Datos, Diccionario, Informe) y el Analizador la recibe como la del CSV,
//     con las etiquetas del diccionario (analizador/motor/datos-xlsx.js), también desde los libros de otros programas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { leerXlsx } from '../../src/core/data/xlsx/lector.js';
import { escribirXlsx } from '../../src/core/data/xlsx/escritor.js';
import { unirTrozos } from '../../src/core/data/zip/escritor.js';
import { baseDesdeXlsx, hojaPorOmision, hojasConDatos } from '../../src/analizador/motor/datos-xlsx.js';
import { leerCSVDetallado } from '../../src/analizador/motor/datos.js';
import { VERSION } from '../../src/version.js';
import { casosEscritor, generadorDePrueba, huellasDePartes, FECHA_CASOS } from '../oracle/xlsx_casos.js';

const dir = new URL('../oracle/xlsx/', import.meta.url);
const fixture = JSON.parse(fs.readFileSync(new URL('../oracle/xlsx_fixture.json', import.meta.url), 'utf8'));
const leerArchivo = nombre => new Uint8Array(fs.readFileSync(new URL(nombre, dir)));

/** Las diferencias entre lo que leyó el lector propio y lo que leyó openpyxl (los números, con una tolerancia relativa). */
function diferencias(libro, ref, tolerancia = 0) {
    const dif = [];
    const igual = (que, a, b) => { if (!isDeepStrictEqual(a, b)) dif.push(`${que}: lector ${JSON.stringify(a)} ≠ openpyxl ${JSON.stringify(b)}`); };
    igual('sistema de 1904', libro.fecha1904, ref.fecha1904);
    igual('recalcular', libro.recalcular, ref.recalcular);
    igual('hojas', libro.hojas.map(h => h.nombre), ref.hojas.map(h => h.nombre));
    libro.hojas.forEach((h, k) => {
        const r = ref.hojas[k];
        if (!r) return;
        for (const campo of ['oculta', 'columnas', 'celdas', 'errores', 'formulasSinValor', 'fechas']) igual(`${h.nombre}: ${campo}`, h[campo], r[campo]);
        igual(`${h.nombre}: filas`, h.filas.length, r.filas.length);
        for (let i = 0; i < Math.max(h.filas.length, r.filas.length) && dif.length < 30; i++) {
            const a = h.filas[i] ?? null, b = r.filas[i] ?? null;
            if (isDeepStrictEqual(a, b)) continue;
            for (let j = 0; j < Math.max(a ? a.length : 0, b ? b.length : 0); j++) {
                const x = a ? (a[j] ?? null) : null, y = b ? (b[j] ?? null) : null;
                const cerca = typeof x === 'number' && typeof y === 'number' && Math.abs(x - y) <= tolerancia * Math.max(1, Math.abs(y));
                if (!Object.is(x, y) && !cerca) dif.push(`${h.nombre}!fila ${i + 1}, columna ${j + 1}: lector ${JSON.stringify(x)} ≠ openpyxl ${JSON.stringify(y)}`);
            }
        }
    });
    return dif;
}

test('el lector lee de los libros de openpyxl, XlsxWriter, LibreOffice y escritos a mano lo mismo que openpyxl', async () => {
    assert.ok(fixture.reales.length >= 11);
    for (const real of fixture.reales) {
        const bytes = leerArchivo(real.archivo);
        for (const nativo of [true, false]) {
            const libro = await leerXlsx(bytes, { nativo });
            const dif = diferencias(libro, real.openpyxl);
            assert.deepEqual(dif, [], `${real.archivo}${nativo ? '' : ' (con el descompresor propio)'}${real.igualQue ? ` (lo mismo que ${real.igualQue})` : ''}:\n${dif.join('\n')}`);
        }
    }
});

test('lo que hay en los libros de prueba: tipos, fórmulas, errores, fechas, hojas ocultas y la variante «strict»', async () => {
    const tipos = await leerXlsx(leerArchivo('openpyxl_tipos.xlsx'));
    const t = tipos.hojas[0];
    assert.deepEqual(t.filas[1].slice(0, 7), [1, 0.1, 'Ñandú ✓ 🎉', true, '2024-05-01', '2024-05-01 13:30:15', '13:30:00']);
    assert.deepEqual(t.filas[4].slice(4, 5), ['1900-03-01'], 'después del 29 de febrero que no existió');
    assert.equal(t.filas[1][9], 1.5, 'una duración ([h]:mm:ss) es el número de días que guarda');
    assert.equal(t.errores, 6);
    assert.equal(t.formulasSinValor, 5, 'openpyxl no guarda el resultado de las fórmulas');
    assert.deepEqual(tipos.hojas.map(h => [h.nombre, h.oculta]), [['Tipos', false], ['Oculta', true], ['MuyOculta', true], ['Dispersa', false], ['Vacia', false], ['Titulo', false]]);
    const lo = await leerXlsx(leerArchivo('libreoffice.xlsx'));
    assert.deepEqual(lo.hojas[0].filas[1], ['P01', 23, 'Málaga', 1500.5, '2024-01-11', '09:05:01', 46, 1523.5, 'menor', null, false, 0.1, '2023-03-16'], 'las fórmulas de LibreOffice, con su resultado');
    const xw = await leerXlsx(leerArchivo('xlsxwriter_compartidas.xlsx'));
    assert.equal(xw.recalcular, true);
    assert.equal(xw.hojas[0].formulasSinValor, 8, 'XlsxWriter guarda 0 como resultado provisional y pide recalcular: no es un dato');
    assert.deepEqual(xw.hojas.map(h => h.nombre), ['Datos', 'Segunda', 'Escondida'], 'la hoja de gráfico no tiene celdas');
    const estricto = await leerXlsx(leerArchivo('a_mano_estricto.xlsx'));
    assert.equal(estricto.hojas[0].nombre, 'Prefijos & más');
    assert.deepEqual(estricto.hojas[0].filas[3].slice(0, 2), ['uno\rdos', true]);
});

test('lo que no es un .xlsx, o está dañado, da un error que dice qué hacer', async () => {
    const casos = [
        ['cifrado.xlsx', /^Error: El libro de Excel está protegido con contraseña de apertura: ábrelo en Excel, quítale la contraseña/],
        ['libreoffice.xls', /^Error: Es un libro de Excel 97-2003 \(\.xls\), un formato binario que no se lee aquí: ábrelo en Excel o en LibreOffice y guárdalo como «Libro de Excel \(\.xlsx\)», o como CSV$/],
        ['libreoffice.ods', /^Error: Es una hoja de cálculo de OpenDocument \(\.ods/],
        ['xlsb_falso.xlsb', /^Error: Es un libro binario de Excel \(\.xlsb\)/],
        ['documento_word.docx', /^Error: Es un documento de Word, no un libro de Excel$/]
    ];
    for (const [archivo, mensaje] of casos) await assert.rejects(leerXlsx(leerArchivo(archivo)), mensaje, archivo);
    await assert.rejects(leerXlsx(new TextEncoder().encode('ID;Edad\n1;20\n')), /^Error: No es un libro de Excel \(\.xlsx\): su contenido no es el de un archivo de Office$/);
    await assert.rejects(leerXlsx(new Uint8Array(0)), /No es un libro de Excel/);
    const bueno = leerArchivo('openpyxl_tipos.xlsx');
    await assert.rejects(leerXlsx(bueno.subarray(0, 3000)), /^Error: El libro de Excel está dañado o incompleto: le falta el directorio central del ZIP\. Vuelve a guardarlo en Excel, o a descargarlo si te lo enviaron$/);
    const danado = bueno.slice();
    danado[2300] ^= 0xFF;   // dentro de xl/worksheets/sheet1.xml
    for (const nativo of [true, false]) await assert.rejects(leerXlsx(danado, { nativo }), /^Error: El libro de Excel está dañado o incompleto: la entrada «xl\/worksheets\/sheet1\.xml» no se puede descomprimir/);
    // un ZIP cualquiera, sin libro
    const zip = unirTrozos((await escribirXlsx([{ nombre: 'x', filas: [[1]] }])).trozos);
    const sinLibro = zip.slice();
    const i = Buffer.from(sinLibro).indexOf('xl/workbook.xml');
    sinLibro.set(new TextEncoder().encode('xl/workbook.xmx'), i);   // la cabecera local
    const j = Buffer.from(sinLibro).indexOf('xl/workbook.xml', i + 1);
    sinLibro.set(new TextEncoder().encode('xl/workbook.xmx'), j);   // y el directorio central
    await assert.rejects(leerXlsx(sinLibro), /le falta la parte del libro/);
    // una hoja que dice ocupar 600 MB sin comprimir: el error, antes de descomprimir nada
    const grande = zip.slice();
    const nombreHoja = new TextEncoder().encode('xl/worksheets/sheet1.xml');
    let central = -1;
    for (let k = Buffer.from(grande).indexOf(Buffer.from(nombreHoja)); k >= 0; k = Buffer.from(grande).indexOf(Buffer.from(nombreHoja), k + 1)) central = k;
    new DataView(grande.buffer).setUint32(central - 46 + 24, 600 * 1024 * 1024, true);   // el tamaño sin comprimir del directorio central
    await assert.rejects(leerXlsx(grande), /^Error: El libro de Excel es demasiado grande para leerlo aquí: «xl\/worksheets\/sheet1\.xml» ocupa 600 MB sin comprimir/);
});

test('el escritor sigue escribiendo las partes que openpyxl leyó bien, y el lector lee de ellas lo mismo que openpyxl', async () => {
    const casos = casosEscritor();
    assert.deepEqual(casos.map(c => c.nombre), fixture.escritos.map(e => e.caso));
    for (const [k, caso] of casos.entries()) {
        const ref = fixture.escritos[k];
        const { trozos, avisos } = await caso.escribir();
        const bytes = unirTrozos(trozos);
        assert.deepEqual(avisos, ref.avisos, `${caso.nombre}: avisos`);
        const partes = await huellasDePartes(bytes);
        assert.deepEqual(Object.keys(partes), Object.keys(ref.partes), `${caso.nombre}: las partes del libro`);
        if (caso.determinista) {
            assert.deepEqual(partes, ref.partes, `${caso.nombre}: el escritor ya no escribe las partes que validó openpyxl; si el cambio es a propósito, regenera el fixture con tests/oracle/xlsx_oraculo.py`);
        }
        const libro = await leerXlsx(bytes);
        const openpyxl = structuredClone(ref.openpyxl);
        // la versión del programa, en el informe del Simulador, cambia con cada entrega
        const informe = openpyxl.hojas.find(h => h.nombre === 'Informe');
        if (informe) { assert.equal(informe.filas[1][0], 'Versión'); informe.filas[1][1] = VERSION; }
        const dif = diferencias(libro, openpyxl, caso.determinista ? 0 : 1e-12);
        assert.deepEqual(dif, [], `${caso.nombre}:\n${dif.join('\n')}`);
    }
});

test('ida y vuelta: tablas al azar escritas por el escritor vuelven iguales del lector', async () => {
    let s = 20261020;
    const u = () => (s = (s * 48271) % 2147483647) / 2147483647;
    const textos = ['', ' ', 'a', 'Ñ', '🎉', '_x0041_', '&<>', '\r\n', '\t', '\u0007', '0', '3,5', 'VERDADERO', 'x'.repeat(300)];
    for (let ronda = 0; ronda < 25; ronda++) {
        const filas = Array.from({ length: 1 + Math.floor(u() * 40) }, () => Array.from({ length: Math.floor(u() * 8) }, () => {
            const t = u();
            if (t < 0.15) return null;
            if (t < 0.45) return Math.round((u() - 0.5) * 1e6) / (u() < 0.5 ? 1 : 1000);
            if (t < 0.55) return u() < 0.5;
            if (t < 0.6) return [Number.MAX_VALUE, Number.MIN_VALUE, -0, 1e21, 1 / 3][Math.floor(u() * 5)];
            return textos[Math.floor(u() * textos.length)] + (u() < 0.5 ? String(Math.floor(u() * 100)) : '');
        }));
        const { trozos } = await escribirXlsx([{ nombre: 'R', filas }], { comprimir: ronda % 2 === 0 });
        const leido = (await leerXlsx(unirTrozos(trozos))).hojas[0];
        // lo esperado: sin celdas vacías al final de cada fila ni filas vacías al final; −0 es 0
        const esperado = filas.map(f => {
            const g = f.map(v => (v === '' || v === null ? null : v === 0 ? 0 : v));
            while (g.length && g[g.length - 1] === null) g.pop();
            return g.length ? g : null;
        });
        while (esperado.length && esperado[esperado.length - 1] === null) esperado.pop();
        assert.deepEqual(leido.filas, esperado, `ronda ${ronda}`);
    }
});

test('una hoja grande (20 000 filas y 21 columnas) se escribe y se lee en un tiempo razonable', async () => {
    const n = 20000;
    const inicio = performance.now();
    const { trozos } = await escribirXlsx([{ nombre: 'Datos', encabezado: Array.from({ length: 21 }, (_, j) => `V${j}`), filas: { n, fila: i => [...Array.from({ length: 20 }, (_, j) => (i * 7 + j * 3) % 5 + 1), i % 2 ? 'A' : 'B'] } }]);
    const libro = await leerXlsx(unirTrozos(trozos));
    const ms = performance.now() - inicio;
    assert.equal(libro.hojas[0].filas.length, n + 1);
    assert.equal(libro.hojas[0].celdas, (n + 1) * 21);
    assert.ok(ms < 20000, `${ms.toFixed(0)} ms`);
});

test('el Simulador: su base como libro de Excel (Datos como el CSV, Diccionario e Informe) y de vuelta en el Analizador', async () => {
    const g = generadorDePrueba();
    assert.deepEqual(g.validarConfiguracion().errores, []);
    const datos = g.generarBaseDatos();
    const informe = g.informePedidoObtenido(datos);
    const { trozos, avisos } = await g.exportarXlsx({ fecha: FECHA_CASOS, informe });
    assert.deepEqual(avisos, []);
    const libro = await leerXlsx(unirTrozos(trozos));
    assert.deepEqual(libro.hojas.map(h => h.nombre), ['Datos', 'Diccionario', 'Informe']);
    const [hojaDatos, diccionario, hojaInforme] = libro.hojas;
    const base = g.datosGenerados;
    assert.deepEqual(hojaDatos.filas[0], base.columnas.map(c => c.nombre));
    assert.equal(hojaDatos.filas.length, base.n + 1);
    // cada celda, como la presenta la base (las categorías con su etiqueta; las fechas, AAAA-MM-DD); los perdidos, vacíos
    for (let i = 0; i < base.n; i++) {
        base.columnas.forEach((c, j) => {
            const v = base.presentar(c, i);
            const esperado = typeof v === 'number' && !(v === v) ? null : v;
            assert.equal(hojaDatos.filas[i + 1]?.[j] ?? null, esperado, `${c.nombre}, fila ${i + 1}`);
        });
    }
    assert.ok(hojaDatos.fechas > 0, 'las fechas de nacimiento, como fechas de Excel');
    // el diccionario: etiqueta, nivel de medida, tipo y códigos
    const fila = nombre => diccionario.filas.find(f => f && f[0] === nombre);
    assert.deepEqual(diccionario.filas[0], ['Variable', 'Etiqueta', 'Nivel de medida', 'Tipo', 'Valores']);
    assert.deepEqual(fila('Sexo').slice(2), ['nominal', 'categoría (sus etiquetas, en Datos)', '0 = Femenino; 1 = Masculino']);
    assert.deepEqual(fila('Grado').slice(2), ['ordinal', 'categoría (sus etiquetas, en Datos)', '1 = Primero; 2 = Segundo; 3 = Tercero']);
    assert.equal(fila('AS1')[2], 'ordinal');
    assert.equal(fila('FechaNac_E')[3], 'fecha');
    assert.equal(fila('Dimension_AS')[2], 'escala');
    assert.equal(fila('Sexo')[1], g.obtenerEtiquetas().Sexo);
    // el informe: la versión, la fecha, n, la semilla y el pedido vs. obtenido
    assert.deepEqual(hojaInforme.filas.slice(0, 6), [['StatSim Pro — base simulada'], ['Versión', VERSION], ['Generada', '2026-10-20 09:30'], ['Casos (n)', base.n], ['Variables', base.columnas.length], ['Semilla', 31]]);
    assert.deepEqual(hojaInforme.filas[7], ['Parámetro', 'Variable', 'Pedido', 'Obtenido', 'Estado', 'Con imperfecciones']);
    assert.equal(hojaInforme.filas.length, 8 + informe.length);

    // el Analizador: la hoja Datos, con las etiquetas del diccionario, y los mismos casos que el CSV del Simulador
    assert.equal(hojaPorOmision(libro).nombre, 'Datos');
    const enAnalizador = baseDesdeXlsx(libro, 0);
    assert.equal(enAnalizador.delSimulador, true);
    assert.deepEqual(enAnalizador.avisos, []);
    assert.deepEqual(enAnalizador.fechas, ['FechaNac_E']);
    assert.equal(enAnalizador.etiquetas.AS1, g.obtenerEtiquetas().AS1);
    const csv = leerCSVDetallado(g.exportarCSV(';'));
    assert.deepEqual(enAnalizador.filas, csv.filas.map(f => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === '' ? null : v]))));
});

test('el Analizador con los libros de otros programas: títulos sobre la tabla, columnas sin nombre, fórmulas y errores', async () => {
    const tipos = await leerXlsx(leerArchivo('openpyxl_tipos.xlsx'));
    assert.deepEqual(hojasConDatos(tipos).map(h => h.nombre), ['Tipos', 'Dispersa', 'Titulo', 'Oculta', 'MuyOculta'], 'las ocultas, al final; la vacía, no');
    const titulo = baseDesdeXlsx(tipos, 5);
    assert.deepEqual(titulo.columnas, ['ID', 'Edad', 'Sexo', 'Satisfaccion']);
    assert.deepEqual(titulo.filas[2], { ID: 3, Edad: null, Sexo: 'Mujer', Satisfaccion: 3 });
    assert.deepEqual(titulo.avisos, ['se saltó la fila 1 («Encuesta de satisfacción 2024»), que parece un título: los encabezados son los de la fila 3']);
    const disp = baseDesdeXlsx(tipos, 3);
    assert.deepEqual(disp.columnas, ['a', 'Columna_C', 'Columna_Z', '27'], 'las columnas sin encabezado pero con datos, por su letra; las vacías, fuera');
    const principal = baseDesdeXlsx(tipos, 0);
    assert.equal(principal.filas.length, 6);
    assert.deepEqual(principal.filas[0].Booleano, 'VERDADERO');
    assert.equal(principal.filas[0].Fecha, '2024-05-01');
    assert.equal(principal.filas[0].Formula, null);
    assert.deepEqual(principal.fechas, ['Fecha', 'FechaHora', 'Hora', 'MesAnio']);
    assert.ok(principal.avisos.includes('6 celda(s) con un error de Excel (#N/A, #DIV/0!…) quedan vacías'));
    assert.ok(principal.avisos.some(a => /^5 fórmula\(s\) sin su resultado guardado quedan vacías/.test(a)));
    // LibreOffice: fórmulas con resultado; una columna de errores (#DIV/0!), vacía
    const lo = await leerXlsx(leerArchivo('libreoffice.xlsx'));
    const hoja1 = baseDesdeXlsx(lo, 0);
    assert.deepEqual(hoja1.filas[0], { Participante: 'P01', Edad: 23, Ciudad: 'Málaga', Ingreso: 1500.5, Fecha: '2024-01-11', Hora: '09:05:01', Doble: 46, Suma: 1523.5, Mayor: 'menor', Division: null, Logico: 'FALSO', Porcentaje: 0.1, FechaCalc: '2023-03-16' });
    // números guardados como texto, nombres repetidos, con «<» y vacíos, y filas vacías en medio
    const { trozos } = await escribirXlsx([{ nombre: 'H', filas: [['Edad', 'Edad', '<b>Nota</b>', null, 'Grupo'], ['20', 1, '3,5', null, 'A'], [], [21, 2, 4, 'x', 'B']] }]);
    const raro = baseDesdeXlsx(await leerXlsx(unirTrozos(trozos)), 0);
    assert.deepEqual(raro.columnas, ['Edad', 'Edad (2)', '‹b›Nota‹/b›', 'Columna_D', 'Grupo']);
    assert.deepEqual(raro.filas, [{ Edad: 20, 'Edad (2)': 1, '‹b›Nota‹/b›': 3.5, Columna_D: null, Grupo: 'A' }, { Edad: null, 'Edad (2)': null, '‹b›Nota‹/b›': null, Columna_D: null, Grupo: null }, { Edad: 21, 'Edad (2)': 2, '‹b›Nota‹/b›': 4, Columna_D: 'x', Grupo: 'B' }]);
    assert.deepEqual(raro.avisos, [
        '1 fila(s) vacías entre los datos se conservan como casos con todos sus valores perdidos',
        'la columna D no tiene nombre: se llama «Columna_D»',
        'la columna «Edad» se llama «Edad (2)» (el nombre estaba repetido)',
        'la columna «‹b›Nota‹/b›» se llama «‹b›Nota‹/b›» (sin < ni >)',
        'en «Edad» y «‹b›Nota‹/b›», números guardados como texto en Excel se leyeron como números'
    ]);
    await assert.rejects(async () => baseDesdeXlsx(tipos, 4), /La hoja «Vacia» está vacía/);
    // un encabezado «__proto__» es una columna más: no cambia el prototipo de las filas
    const proto = baseDesdeXlsx(await leerXlsx(unirTrozos((await escribirXlsx([{ nombre: 'P', filas: [['__proto__', 'x'], ['a', 1]] }])).trozos)), 0);
    assert.deepEqual(proto.columnas, ['__proto__', 'x']);
    assert.equal(Object.getPrototypeOf(proto.filas[0]), Object.prototype);
    assert.deepEqual(Object.keys(proto.filas[0]), ['__proto__', 'x']);
    assert.equal(proto.filas[0]['__proto__'], 'a');
});
