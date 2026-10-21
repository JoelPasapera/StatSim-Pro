// tests/unit/csv-lector.test.js — (2026.12.29) el lector de CSV del Analizador (motor/datos.js, leerCSVDetallado) con los
// archivos que fallaban (auditoría del Analizador, 2026-10-16) y la decodificación de los bytes (core/data/codificacion.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerCSV, leerCSVDetallado } from '../../src/analizador/motor/datos.js';
import { analizarUtf8, avisoDeCodificacion, decodificarTexto, decodificarWindows1252, decodificadorPara } from '../../src/core/data/codificacion.js';
import { sinMarcado } from '../../src/core/data/texto.js';

test('una celda entrecomillada con saltos de línea (Google Forms) no parte la fila', () => {
    const r = leerCSVDetallado('ID,Comentario,Puntaje\n1,bien,30\n2,"no sé\nsueño poco, me canso, como mal",12\n3,ok,25\n');
    assert.deepEqual(r.filas.map(f => f.Puntaje), [30, 12, 25]);
    assert.equal(r.filas[1].Comentario, 'no sé\nsueño poco, me canso, como mal');
    assert.deepEqual(r.descartadas, []);
    assert.deepEqual(r.avisos, []);
    // también con CRLF dentro de las comillas y entre registros
    assert.deepEqual(leerCSV('a;b\r\n"x\r\ny";2\r\n3;4\r\n'), [{ a: 'x\r\ny', b: 2 }, { a: 3, b: 4 }]);
});

test('el encabezado se lee con comillas (write.csv de R, preguntas de Google Forms con comas)', () => {
    const r = leerCSVDetallado('"","ID","P1"\n"1",1,3\n"2",2,4\n');
    assert.deepEqual(r.columnas, ['Columna_1', 'ID', 'P1']);
    assert.deepEqual(r.filas[0], { Columna_1: 1, ID: 1, P1: 3 });
    assert.match(r.avisos.join(' '), /una columna sin nombre se llama «Columna_1»/);
    const g = leerCSVDetallado('Marca temporal,"¿Cuántas horas, al día, duermes?",Edad\n2024/05/01,7,20\n2024/05/02,8,21\n');
    assert.deepEqual(g.columnas, ['Marca temporal', '¿Cuántas horas, al día, duermes?', 'Edad']);
    assert.deepEqual(g.filas.map(f => f['¿Cuántas horas, al día, duermes?']), [7, 8]);
});

test('el delimitador: el que da a las filas los campos del encabezado; «sep=;»; tabulador; «;» con comas en los nombres', () => {
    assert.equal(leerCSVDetallado('ID;Edad, años;Puntaje\n1;20;3,5\n2;21;4\n').delimitador, ';');
    assert.equal(leerCSVDetallado('ID,Comentario,Puntaje\n1,"bien; muy bien",5\n2,"sí; no",4\n').delimitador, ',');
    // «;» da más campos al encabezado (3 frente a 2), pero no a las filas: gana «,», el que es consistente
    assert.equal(leerCSVDetallado('Pregunta 1; sí/no; otro,Edad\nx,20\ny,21\n').delimitador, ',');
    // «;» parte el encabezado en dos, pero no las filas: gana «,»
    assert.deepEqual(leerCSV('Nombre,Edad; años,Peso\nAna,20,55\nLuis,21,60\n'), [{ Nombre: 'Ana', 'Edad; años': 20, Peso: 55 }, { Nombre: 'Luis', 'Edad; años': 21, Peso: 60 }]);
    assert.equal(leerCSVDetallado('a\tb\tc\n1\t2\t3\n').delimitador, '\t');
    assert.equal(leerCSVDetallado('a|b\n1|2\n').delimitador, '|');
    const s = leerCSVDetallado('sep=;\na;b\n1;2,5\n');
    assert.equal(s.delimitador, ';');
    assert.deepEqual(s.filas, [{ a: 1, b: 2.5 }]);
    // una sola columna
    assert.deepEqual(leerCSV('Puntaje\n1\n2\n'), [{ Puntaje: 1 }, { Puntaje: 2 }]);
});

test('fines de línea de Mac (solo CR), BOM, líneas en blanco y «;;;» de más al final', () => {
    assert.deepEqual(leerCSV('a,b\r1,2\r3,4\r'), [{ a: 1, b: 2 }, { a: 3, b: 4 }]);
    assert.deepEqual(leerCSV('﻿ID;X\n1;2\n'), [{ ID: 1, X: 2 }]);
    assert.deepEqual(leerCSV('a,b\n\n1,2\n   \n3,4\n\n'), [{ a: 1, b: 2 }, { a: 3, b: 4 }]);
    const r = leerCSVDetallado('a;b;;\n1;2;;\n3;4;;\n');
    assert.deepEqual(r.columnas, ['a', 'b']);
    assert.deepEqual(r.filas, [{ a: 1, b: 2 }, { a: 3, b: 4 }]);
    // un campo vacío de más al final de UNA fila no la descarta
    assert.deepEqual(leerCSV('a,b\n1,2,\n3,4\n'), [{ a: 1, b: 2 }, { a: 3, b: 4 }]);
});

test('las filas con otro número de campos se descartan y se avisa con su línea', () => {
    const r = leerCSVDetallado('a;b;c\n1;2;3\nincompleta;1\n4;5;6\n7;8;9;10\n');
    assert.deepEqual(r.filas.length, 2);
    assert.deepEqual(r.descartadas, [3, 5]);
    assert.match(r.avisos[0], /se descartaron 2 fila\(s\) con otro número de campos que el encabezado \(3, separados por punto y coma\): línea\(s\) 3 y 5/);
    // la línea cuenta los saltos dentro de las comillas
    assert.deepEqual(leerCSVDetallado('a,b\n"x\ny",1\nmal\n').descartadas, [4]);
});

test('nombres repetidos: el segundo pasa a «X (2)», sin perder sus datos', () => {
    const r = leerCSVDetallado('ID;Me siento tranquilo;Me siento tranquilo;Me siento tranquilo\n1;4;3;5\n2;3;5;1\n');
    assert.deepEqual(r.columnas, ['ID', 'Me siento tranquilo', 'Me siento tranquilo (2)', 'Me siento tranquilo (3)']);
    assert.deepEqual(r.filas[0], { ID: 1, 'Me siento tranquilo': 4, 'Me siento tranquilo (2)': 3, 'Me siento tranquilo (3)': 5 });
    assert.equal(r.renombradas.length, 2);
});

test('comillas: dobladas dentro de un campo, una comilla suelta en medio y una sin cerrar', () => {
    assert.equal(leerCSV('a,b\n"Él dijo ""hola""",2\n')[0].a, 'Él dijo "hola"');
    assert.equal(leerCSV('a,b\n5" pulgadas,2\n')[0].a, '5" pulgadas');
    const r = leerCSVDetallado('a,b\n1,"hola\n2,3\n4,5\n');
    assert.equal(r.filas.length, 3, 'leído línea a línea');
    assert.match(r.avisos.join(' '), /una comilla de la línea 2 no se cierra/);
});

test('separador de miles en un CSV con «;»: convertido si la columna lo confirma; si es dudoso, se avisa', () => {
    const r = leerCSVDetallado('ID;Ingreso;Nota\n1;1.500;3,5\n2;800;4\n3;2.300;2,5\n4;1.800,50;3\n');
    assert.deepEqual(r.filas.map(f => f.Ingreso), [1500, 800, 2300, 1800.5]);
    assert.deepEqual(r.filas.map(f => f.Nota), [3.5, 4, 2.5, 3]);
    assert.match(r.avisos.join(' '), /en «Ingreso», el punto separa los miles/);
    // 1.234.567: confirmado por los grupos
    assert.deepEqual(leerCSV('ID;Pob\n1;1.234.567\n2;800\n').map(f => f.Pob), [1234567, 800]);
    // solo «1.500» y «2.300»: ¿miles o decimales? se lee como antes (1,5) y se avisa
    const d = leerCSVDetallado('ID;Ingreso\n1;1.500\n2;800\n3;2.300\n');
    assert.deepEqual(d.filas.map(f => f.Ingreso), [1.5, 800, 2.3]);
    assert.match(d.avisos.join(' '), /valores como «1.500» se leyeron con el punto como decimal/);
    // con un decimal de punto en la columna («3.14»), el punto es decimal y no hay aviso
    const p = leerCSVDetallado('ID;T\n1;1.205\n2;3.14\n');
    assert.deepEqual(p.filas.map(f => f.T), [1.205, 3.14]);
    assert.deepEqual(p.avisos, []);
    // «0.512» nunca es un número con miles
    assert.deepEqual(leerCSV('ID;RT\n1;0.512\n2;0.634\n').map(f => f.RT), [0.512, 0.634]);
    // con «,» de delimitador, nada cambia: ni se convierte ni se avisa
    const c = leerCSVDetallado('ID,X,Y\n1,1.500,"1.800,50"\n');
    assert.deepEqual(c.filas, [{ ID: 1, X: 1.5, Y: '1.800,50' }]);
    assert.deepEqual(c.avisos, []);
});

test('sin «<» ni «>» en los nombres y en los textos (no pueden abrir una etiqueta HTML en los informes)', () => {
    const r = leerCSVDetallado('<img src=x onerror=alert(1)>,Grupo,Edad <18\n1,<b>negrita</b>,1\n');
    assert.deepEqual(r.columnas, ['‹img src=x onerror=alert(1)›', 'Grupo', 'Edad ‹18']);
    assert.equal(r.filas[0].Grupo, '‹b›negrita‹/b›');
    assert.match(r.avisos.join(' '), /sin < ni >/);
    assert.equal(sinMarcado('a < b > c'), 'a ‹ b › c');
    assert.equal(sinMarcado(null), '');
});

test('los errores de siempre: sin filas de datos, o ninguna con los campos del encabezado', () => {
    assert.throws(() => leerCSV(''), /al menos encabezados y una fila/);
    assert.throws(() => leerCSV('a,b\n'), /al menos encabezados y una fila/);
    assert.throws(() => leerCSV('a,b\n\n\n'), /al menos encabezados y una fila/);
    assert.throws(() => leerCSV('a,b\n1,2,3'), /Ninguna fila coincide/);
});

test('los bytes: UTF-8 (con y sin BOM), UTF-16 con BOM y el ANSI de Excel en español (windows-1252)', () => {
    const texto = 'Niño;Año;Opinión\nSí;2024;Señal\n';
    assert.deepEqual(decodificarTexto(new TextEncoder().encode(texto)), { texto, codificacion: 'utf-8', invalidos: 0 });
    assert.deepEqual(decodificarTexto(new Uint8Array([0xEF, 0xBB, 0xBF, ...new TextEncoder().encode(texto)])), { texto, codificacion: 'utf-8', invalidos: 0 });
    // windows-1252: cada carácter acentuado es un byte (ñ = 0xF1, á = 0xE1…), que no es UTF-8 válido
    const ansi = Uint8Array.from([...texto].map(c => c.charCodeAt(0)));
    assert.deepEqual(decodificarTexto(ansi), { texto, codificacion: 'windows-1252', invalidos: 0 });
    // la tabla propia (el TextDecoder de Node lee 0x80–0x9F como latin-1): comprobada byte a byte con el cp1252 de Python
    assert.equal(decodificarTexto(Uint8Array.from([0x80, 0x93, 0x94, 0x96, 0x9F, 0xBF, 0xF1])).texto, '€“”–Ÿ¿ñ');
    assert.equal(decodificarWindows1252(Uint8Array.from([0x81, 0x8D, 0x8F, 0x90, 0x9D])), '\u0081\u008D\u008F\u0090\u009D', 'los cinco sin asignar, como en el WHATWG');
    assert.equal(decodificadorPara('iso-8859-1').decode(Uint8Array.from([0x80])), '€', 'los alias de windows-1252, con la misma tabla');
    assert.equal(decodificadorPara('utf-8').decode(new TextEncoder().encode('ñ')), 'ñ');
    const u16 = new Uint8Array(2 + texto.length * 2); u16[0] = 0xFF; u16[1] = 0xFE;
    for (let i = 0; i < texto.length; i++) { u16[2 + 2 * i] = texto.charCodeAt(i) & 0xFF; u16[3 + 2 * i] = texto.charCodeAt(i) >> 8; }
    assert.deepEqual(decodificarTexto(u16), { texto, codificacion: 'utf-16le', invalidos: 0 });
    const be = new Uint8Array(u16.length); be[0] = 0xFE; be[1] = 0xFF;
    for (let i = 2; i < u16.length; i += 2) { be[i] = u16[i + 1]; be[i + 1] = u16[i]; }
    assert.deepEqual(decodificarTexto(be), { texto, codificacion: 'utf-16be', invalidos: 0 });
    assert.deepEqual(decodificarTexto(new ArrayBuffer(0)), { texto: '', codificacion: 'utf-8', invalidos: 0 });
});

test('(revisión de la 2026.12.29) un UTF-8 con un byte dañado o cortado al final sigue siendo UTF-8, con «�» y el aviso', () => {
    const utf8 = s => new TextEncoder().encode(s);
    const unir = (...p) => { const o = new Uint8Array(p.reduce((s, x) => s + x.length, 0)); let k = 0; for (const x of p) { o.set(x, k); k += x.length; } return o; };
    // 200 filas en UTF-8 con tildes y UNA «é» en ANSI (0xE9): hasta la revisión, el archivo entero se leía como windows-1252
    const filas = ['ID;Opinión'];
    for (let i = 1; i <= 200; i++) filas.push(`${i};Sí, señor`);
    const mixto = unir(utf8(filas.join('\n') + '\n201;caf'), Uint8Array.of(0xE9), utf8('\n'));
    const r = decodificarTexto(mixto);
    assert.equal(r.codificacion, 'utf-8'); assert.equal(r.invalidos, 1);
    assert.ok(r.texto.startsWith('ID;Opinión\n1;Sí, señor'), 'las tildes del resto, bien'); assert.ok(r.texto.endsWith('201;caf\uFFFD\n'));
    assert.match(avisoDeCodificacion(r), /un carácter estaba dañado y se muestra como «�»/);
    // cortado a media letra al final (una descarga interrumpida): UTF-8, con el último carácter como «�»
    const entero = utf8('ID;Opinión\n1;Opinó'), cortado = decodificarTexto(entero.subarray(0, entero.length - 1));
    assert.deepEqual(cortado, { texto: 'ID;Opinión\n1;Opin\uFFFD', codificacion: 'utf-8', invalidos: 1 });
    assert.equal(decodificarTexto(utf8('ñ').subarray(0, 1)).codificacion, 'utf-8', 'aun con un solo carácter, cortado');
    // un ANSI de verdad, con alguna pareja de bytes que por casualidad es UTF-8 válido («Ã©»), sigue siendo windows-1252
    const ansi = Uint8Array.from([...'Opinión;Señal;Año;Niño;café;Ã©'].map(ch => ch.charCodeAt(0)));
    assert.deepEqual(decodificarTexto(ansi), { texto: 'Opinión;Señal;Año;Niño;café;Ã©', codificacion: 'windows-1252', invalidos: 0 });
    assert.match(avisoDeCodificacion({ codificacion: 'windows-1252' }), /se leyó como ANSI de Windows/);
    assert.equal(avisoDeCodificacion({ codificacion: 'utf-8', invalidos: 0 }), '');
    // el recuento, el de TextDecoder: un «�» por cada tramo inválido más largo posible
    for (const bytes of [[0xC3], [0xE2, 0x82], [0xF0, 0x9F, 0x98], [0xC0, 0xAF], [0xED, 0xA0, 0x80], [0xF4, 0x90, 0x80, 0x80], [0x80, 0x80], [0xE2, 0x41], [0x61, 0xFF, 0x62]]) {
        const b = Uint8Array.from(bytes), esperado = new TextDecoder().decode(b).split('\uFFFD').length - 1;
        assert.equal(analizarUtf8(b).invalidos, esperado, `${bytes.map(x => x.toString(16)).join(' ')}`);
    }
});

test('(revisión de la 2026.12.29) las filas sin ningún dato son casos perdidos; las del final, no; y la comilla sin cerrar no cambia el delimitador', () => {
    // una columna: la celda vacía de Excel es una línea en blanco
    assert.deepEqual(leerCSV('Puntaje\n10\n\n12\n\n15\n\n\n'), [{ Puntaje: 10 }, { Puntaje: '' }, { Puntaje: 12 }, { Puntaje: '' }, { Puntaje: 15 }]);
    // varias columnas: «;;» y « ; » son casos con todo perdido; las líneas en blanco de en medio y las filas vacías del final, no
    const r = leerCSVDetallado('P1;P2;P3\n1;2;3\n;;\n\n4;5;6\n ; ; \n;;\n\n');
    assert.deepEqual(r.filas, [{ P1: 1, P2: 2, P3: 3 }, { P1: '', P2: '', P3: '' }, { P1: 4, P2: 5, P3: 6 }]);
    assert.ok(r.avisos.includes('1 fila(s) sin ningún dato se conservan como casos con todos sus valores perdidos'), r.avisos.join(' | '));
    assert.deepEqual(leerCSV('P1,P2\n1,2\n,\n3,4'), [{ P1: 1, P2: 2 }, { P1: '', P2: '' }, { P1: 3, P2: 4 }]);
    assert.deepEqual(leerCSV('\n\nP1;P2\n1;2'), [{ P1: 1, P2: 2 }], 'las líneas en blanco antes del encabezado');
    // el encabezado tiene más comas que «;» y una comilla no se cierra: el delimitador sigue siendo «;» (se lee línea a línea)
    const q = leerCSVDetallado('¿Cuántas horas, al día, duermes?;Edad\n"7;20\n8;21\n6;22\n');
    assert.equal(q.delimitador, ';');
    assert.deepEqual(q.filas, [{ '¿Cuántas horas, al día, duermes?': 8, Edad: 21 }, { '¿Cuántas horas, al día, duermes?': 6, Edad: 22 }]);
    assert.match(q.avisos[0], /una comilla de la línea 2 no se cierra/);
});

test('(revisión 2026.12.30) sin el apóstrofo con que las exportaciones neutralizan las fórmulas, y solo ese', async () => {
    const { sinFormula, conFormulaOriginal, campoCSV, parsearLineaCSV } = await import('../../src/shared/csv.js');
    const r = leerCSVDetallado("ID;'=Grupo;Edad\n1;'- de 18;'-5\n2;'+ de 60;20\n3;''-literal;21\n");
    assert.deepEqual(r.columnas, ['ID', '=Grupo', 'Edad']);
    assert.deepEqual(r.filas.map(f => f['=Grupo']), ['- de 18', '+ de 60', "'-literal"]);
    assert.equal(r.filas[0].Edad, "'-5", 'un número con apóstrofo no lo puso sinFormula: queda como texto');
    // la codificación es biyectiva: lo que sale de sinFormula vuelve igual, y nunca empieza por una fórmula
    let semilla = 12345; const u = () => (semilla = (semilla * 48271) % 2147483647) / 2147483647;
    const alfabeto = ["'", '=', '+', '-', '@', '1', '5', '.', ',', '%', 'a', 'E', ' ', '"'];
    for (let i = 0; i < 20000; i++) {
        let t = ''; for (let k = 1 + Math.floor(u() * 6); k > 0; k--) t += alfabeto[Math.floor(u() * alfabeto.length)];
        const e = sinFormula(t);
        assert.equal(conFormulaOriginal(e), t, JSON.stringify(t));
        assert.ok(!/^[=+\-@]/.test(e) || /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?%?$/.test(e), JSON.stringify(e));
        if (t === t.trim()) assert.equal(parsearLineaCSV(campoCSV(t))[0], t, JSON.stringify(t));
    }
});

