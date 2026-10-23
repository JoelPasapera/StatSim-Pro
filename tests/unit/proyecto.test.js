// tests/unit/proyecto.test.js — (2026.12.31) las piezas del archivo de proyecto que no dependen de la página: el JSON que
// conserva NaN, infinitos, −0, undefined, fechas, Map, Set y arreglos tipados (core/data/json-fiel.js); la base del
// Simulador como archivos, bit a bit (core/data/base-archivos.js); los datos del Analizador por columnas
// (analizador/motor/datos-proyecto.js); el paquete .statsim (proyecto/paquete.js), con sus comprobaciones; y el registro de
// secciones (shared/proyecto.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aJsonFiel, deJsonFiel } from '../../src/core/data/json-fiel.js';
import { baseAArchivos, baseDesdeArchivos } from '../../src/core/data/base-archivos.js';
import { BaseColumnar } from '../../src/core/data/base-columnar.js';
import { celdaAJson, celdaDeJson, codigosValidos, columnasAFilas, columnasAJson, datosDeJson, estructuraValida, etiquetasValidas, filasAColumnas, LARGO_COLUMNA_ESTRUCTURA, LARGO_SIGLA_ESTRUCTURA, MAXIMO_CASOS_ANALIZADOR, MAXIMO_CELDAS_ANALIZADOR, MAXIMO_CODIGOS_CATEGORIAS, MAXIMO_DIMENSIONES_ESTRUCTURA, MAXIMO_PRUEBAS_ESTRUCTURA, TOPES_JSON_ETIQUETAS } from '../../src/analizador/motor/datos-proyecto.js';
import { excesoDeJson, leerJsonAcotado, medirJson } from '../../src/core/data/json-acotado.js';
import { escaparRegExp, sinMarcadoEnTodo } from '../../src/core/data/texto.js';
import { prefijoYNumero } from '../../src/analizador/motor/nombres-items.js';
import { escribirProyecto, leerProyecto, FORMATO_PROYECTO, VERSION_FORMATO } from '../../src/proyecto/paquete.js';
import { escribirZip, unirTrozos } from '../../src/core/data/zip/escritor.js';
import { inscribirEnProyecto, participantesDelProyecto } from '../../src/shared/proyecto.js';

test('JSON fiel: la ida y vuelta conserva lo que JSON pierde', () => {
    const valor = {
        nan: NaN, inf: Infinity, menosInf: -Infinity, menosCero: -0, cero: 0, nulo: null, indefinido: undefined,
        lista: [1, NaN, undefined, null, 'a', -0, [Infinity]], texto: 'ñ "comillas" \u0000 🎉', logico: false,
        fecha: new Date(Date.UTC(2026, 9, 20, 9, 30)),
        mapa: new Map([['a', 1], [2, { b: NaN }]]), conjunto: new Set([1, 'dos', NaN]),
        f64: Float64Array.from([1.5, NaN, -0, Infinity, 1e-310]), f32: Float32Array.from([0.1, -2]), u8: Uint8Array.from([0, 255]), i32: Int32Array.from([-1, 2 ** 31 - 1]),
        trampa: { $statsim: 'NaN', otra: 1 }, anidado: { $statsim: { $statsim: 'objeto' } }
    };
    const vuelta = deJsonFiel(aJsonFiel(valor));
    assert.deepStrictEqual(vuelta, valor);
    assert.ok(Object.is(vuelta.menosCero, -0) && Object.is(vuelta.lista[5], -0) && Object.is(vuelta.f64[2], -0));
    assert.equal('indefinido' in vuelta, true, 'las propiedades undefined se conservan, como en el clon estructurado');
    assert.ok(Number.isNaN(deJsonFiel(aJsonFiel(new Date(NaN))).getTime()), 'una fecha inválida sigue siéndolo');
    assert.equal(vuelta.f64.constructor, Float64Array);
    // es JSON de verdad
    assert.doesNotThrow(() => JSON.parse(aJsonFiel(valor)));
    // un arreglo tipado grande (base64 por tramos)
    const grande = Float64Array.from({ length: 300000 }, (_, i) => Math.sin(i));
    assert.deepStrictEqual(deJsonFiel(aJsonFiel(grande)), grande);
    // lo que no se puede guardar, o una marca desconocida
    assert.throws(() => aJsonFiel({ f: () => 1 }), /no se puede guardar un valor de tipo function/);
    assert.throws(() => aJsonFiel(new DataView(new ArrayBuffer(2))), /no se puede guardar/);
    assert.throws(() => deJsonFiel('{"$statsim":"raro"}'), /una marca desconocida/);
    assert.throws(() => deJsonFiel('{"$statsim":"tipado","tipo":"Function","base64":""}'), /tipo desconocido/);
});

test('la base del Simulador como archivos: bit a bit, con sus etiquetas y formatos, y comprobada al volver', () => {
    const base = new BaseColumnar(5);
    const id = base.agregar('ID', true);
    const x = base.agregar('Puntaje', false);
    const sexo = base.agregar('Sexo', true);
    const fecha = base.agregar('FechaNac', true);
    for (let i = 0; i < 5; i++) { id.datos[i] = i + 1; x.datos[i] = i === 2 ? NaN : Math.PI * i - 1e-300; sexo.datos[i] = i % 2; fecha.datos[i] = 19723 + i; }
    x.datos[4] = -0;
    base.etiquetar('Sexo', { 0: 'Femenino', 1: 'Masculino' });
    base.formatear('FechaNac', 'fecha');
    const archivos = baseAArchivos(base, 'base');
    assert.deepEqual(Object.keys(archivos).sort(), ['base.json', 'base/0.bin', 'base/1.bin', 'base/2.bin', 'base/3.bin']);
    assert.equal(/** @type {Uint8Array} */ (archivos['base/1.bin']).length, 5 * 8);
    assert.equal(/** @type {Uint8Array} */ (archivos['base/0.bin']).length, 5 * 4, 'las enteras, en Float32');
    const enMapa = new Map(Object.entries(archivos).map(([k, v]) => [k, typeof v === 'string' ? new TextEncoder().encode(v) : v]));
    const vuelta = baseDesdeArchivos(enMapa, 'base');
    assert.equal(vuelta.n, 5);
    assert.deepEqual(vuelta.nombres(), ['ID', 'Puntaje', 'Sexo', 'FechaNac']);
    assert.deepEqual([...new Uint8Array(vuelta.columna('Puntaje').datos.buffer)], [...new Uint8Array(x.datos.buffer)], 'los bits de cada valor, también NaN y −0');
    assert.equal(vuelta.columna('ID').datos.constructor, Float32Array);
    assert.deepEqual(vuelta.aObjetos(), base.aObjetos(), 'las mismas filas presentadas (etiquetas y fechas)');
    // dañada: cada comprobación, con su mensaje
    const roto = (cambio) => { const m = new Map(enMapa); cambio(m); return () => baseDesdeArchivos(m, 'base'); };
    assert.throws(roto(m => m.delete('base.json')), /falta el índice de la base/);
    assert.throws(roto(m => m.set('base.json', new TextEncoder().encode('{'))), /no es JSON válido/);
    assert.throws(roto(m => m.set('base.json', new TextEncoder().encode('{"formato":2,"n":5,"columnas":[]}'))), /no tiene la forma esperada/);
    assert.throws(roto(m => m.delete('base/2.bin')), /faltan los valores de la columna «Sexo»/);
    assert.throws(roto(m => m.set('base/1.bin', new Uint8Array(39))), /la columna «Puntaje» no tiene 5 valores/);
    const indice = JSON.parse(/** @type {string} */ (archivos['base.json']));
    const conIndice = (f) => roto(m => { const i = structuredClone(indice); f(i); m.set('base.json', new TextEncoder().encode(JSON.stringify(i))); });
    assert.throws(conIndice(i => { i.columnas[1].nombre = 'ID'; }), /sin nombre o repetida/);
    assert.throws(conIndice(i => { i.columnas[2].etiquetas = { 0: 5 }; }), /etiquetas de valor de «Sexo» no tienen la forma esperada/);
    assert.throws(conIndice(i => { i.columnas[3].formato = 'hora'; }), /formato desconocido/);
    // (2026.12.31, quinta revisión) dos columnas sobre el mismo archivo de valores (cada una se llevaba su copia: un proyecto
    // de 13 KB pedía 3 GB)
    assert.throws(conIndice(i => { i.columnas[1].archivo = i.columnas[0].archivo; i.columnas[1].entera = true; }), /^Error: la base trae dos columnas con el mismo archivo de valores \(«base\/0\.bin»\)$/);
    // (2026.12.31, segunda revisión) más filas de las que admite quien la abre: antes de leer ninguna columna
    assert.equal(baseDesdeArchivos(enMapa, 'base', { maximoFilas: 5 }).n, 5);
    assert.throws(() => baseDesdeArchivos(enMapa, 'base', { maximoFilas: 4 }), /^Error: la base guardada tiene 5 filas, más de las 4 que admite$/);
});

test('los datos del Analizador por columnas, y de vuelta (con su comprobación)', () => {
    const filas = [{ ID: 1, Grupo: 'A', X: 3.5 }, { ID: 2, Grupo: null, X: NaN }, { ID: 3, Grupo: 'B', X: '', Extra: 'solo aquí' }];
    const porColumnas = filasAColumnas(filas);
    assert.deepEqual(porColumnas.columnas, ['ID', 'Grupo', 'X', 'Extra']);
    assert.deepEqual(porColumnas.valores[3], [null, null, 'solo aquí']);
    const vuelta = datosDeJson(columnasAJson(porColumnas));
    assert.deepEqual(vuelta, [{ ID: 1, Grupo: 'A', X: 3.5, Extra: null }, { ID: 2, Grupo: null, X: NaN, Extra: null }, { ID: 3, Grupo: 'B', X: '', Extra: 'solo aquí' }]);
    // (2026.12.31, cuarta revisión) «datos.json» es JSON simple: los números que JSON no tiene, como textos marcados (antes,
    // con el JSON fiel, un objeto por celda), y un texto que empiece por la marca, con otra delante
    const raras = [NaN, Infinity, -Infinity, -0, 0, 1.5, '\u0000NaN', '\u0000', '\u0000\u0000x', 'NaN', '', null];
    const texto = columnasAJson({ columnas: ['v'], valores: [raras] });
    assert.equal(medirJson(texto).contenedores, 4, 'sin un objeto por celda');
    const leidas = /** @type {any[]} */ (datosDeJson(texto)).map(f => f.v);
    raras.forEach((v, i) => assert.ok(Object.is(leidas[i], v), `${String(v)} → ${String(leidas[i])}`));
    assert.equal(celdaDeJson(celdaAJson('\u0000Infinity')), '\u0000Infinity');
    assert.equal(celdaDeJson('\u0000otra'), undefined, 'una marca que no se conoce');
    assert.throws(() => datosDeJson('{"columnas":["a"],"valores":[["\\u0000otra"]]}'), /tiene un valor que no es un número ni un texto/);
    assert.deepEqual(columnasAFilas({ columnas: [], valores: [] }), []);
    assert.throws(() => columnasAFilas({ columnas: ['a'], valores: [] }), /no tienen la forma esperada/);
    assert.throws(() => columnasAFilas({ columnas: ['a', 'a'], valores: [[1], [2]] }), /sin nombre o repetida/);
    assert.throws(() => columnasAFilas({ columnas: ['a', 'b'], valores: [[1], [2, 3]] }), /la columna «b» de los datos del Analizador no tiene 1 valores/);
    assert.throws(() => columnasAFilas({ columnas: ['a'], valores: [[{ x: 1 }]] }), /no es un número ni un texto/);
});

test('el paquete .statsim: ida y vuelta, y lo que no es un proyecto o está dañado', async () => {
    const fecha = new Date(Date.UTC(2026, 9, 20, 9, 30));
    const partes = [
        { seccion: 'simulador', titulo: 'el Simulador', resumen: 'la configuración', archivos: { 'configuracion.csv': '###PRUEBAS###\nÑ', 'base/0.bin': new Uint8Array([1, 2, 3]) } },
        { seccion: 'analizador', titulo: 'el Analizador', resumen: 'los datos', archivos: { 'datos.json': '{}' } }
    ];
    for (const comprimir of [true, false]) {
        const bytes = unirTrozos(await escribirProyecto(partes, { version: '2026.12.31', fecha, comprimir }));
        const { manifiesto, partes: leidas } = await leerProyecto(bytes);
        assert.equal(manifiesto.formato, FORMATO_PROYECTO);
        assert.equal(manifiesto.versionFormato, VERSION_FORMATO);
        assert.equal(manifiesto.version, '2026.12.31');
        assert.equal(manifiesto.guardado, '2026-10-20T09:30:00.000Z');
        assert.deepEqual(leidas.map(p => [p.seccion, p.titulo, p.resumen, [...p.archivos.keys()]]), [['simulador', 'el Simulador', 'la configuración', ['configuracion.csv', 'base/0.bin']], ['analizador', 'el Analizador', 'los datos', ['datos.json']]]);
        assert.equal(new TextDecoder().decode(leidas[0].archivos.get('configuracion.csv')), '###PRUEBAS###\nÑ');
        assert.deepEqual([...leidas[0].archivos.get('base/0.bin')], [1, 2, 3]);
    }
    await assert.rejects(escribirProyecto([{ seccion: 'Malo', titulo: '', resumen: '', archivos: {} }], { version: 'x' }), /no es un nombre de sección válido/);
    await assert.rejects(escribirProyecto([{ seccion: 'a', titulo: '', resumen: '', archivos: { '../fuera.txt': 'x' } }], { version: 'x' }), /no es una ruta válida/);
    // lo que no es un proyecto
    const zip = async entradas => unirTrozos(await escribirZip(entradas));
    const NO_ES = /^Error: No es un proyecto de StatSim Pro \(\.statsim\)/;
    await assert.rejects(leerProyecto(new TextEncoder().encode('hola')), NO_ES);
    await assert.rejects(leerProyecto(await zip([{ nombre: 'otra.txt', contenido: 'x' }])), NO_ES);
    await assert.rejects(leerProyecto(await zip([{ nombre: 'proyecto.json', contenido: '{"formato":"otro"}' }])), NO_ES);
    await assert.rejects(leerProyecto(await zip([{ nombre: 'proyecto.json', contenido: 'no es json' }])), NO_ES);
    const manifiesto = (cambios, extra = []) => zip([{ nombre: 'proyecto.json', contenido: JSON.stringify({ formato: FORMATO_PROYECTO, versionFormato: 1, programa: 'StatSim Pro', version: 'v', guardado: '', secciones: [{ seccion: 'a', titulo: 'A', resumen: '', archivos: ['x.txt'] }], ...cambios }) }, ...extra]);
    await assert.rejects(leerProyecto(await manifiesto({ versionFormato: 2, version: '2027.01.01' })), /lo guardó una versión más nueva de StatSim Pro \(2027\.01\.01\)/);
    await assert.rejects(leerProyecto(await manifiesto({})), /El proyecto está incompleto: le falta «a\/x\.txt»/);
    await assert.rejects(leerProyecto(await manifiesto({ secciones: [{ seccion: 'a', archivos: ['../x'] }] })), /nombra una ruta que no es válida/);
    await assert.rejects(leerProyecto(await manifiesto({ secciones: [{ seccion: 'A B', archivos: [] }] })), /su manifiesto no tiene la forma esperada/);
    const bueno = await manifiesto({}, [{ nombre: 'a/x.txt', contenido: 'hola '.repeat(100) }]);
    assert.equal((await leerProyecto(bueno)).partes[0].archivos.size, 1);
    await assert.rejects(leerProyecto(bueno.subarray(0, bueno.length - 30)), /El proyecto está dañado o incompleto/);
});

test('el registro de secciones: en su orden de restauración, y con nombres válidos', () => {
    const antes = participantesDelProyecto().length;
    inscribirEnProyecto({ seccion: 'prueba-b', titulo: 'B', orden: 99, capturar: () => null, restaurar: () => '' });
    inscribirEnProyecto({ seccion: 'prueba-a', titulo: 'A', orden: 98, capturar: () => null, restaurar: () => '' });
    inscribirEnProyecto({ seccion: 'prueba-a', titulo: 'A2', orden: 97, capturar: () => null, restaurar: () => '' });
    const lista = participantesDelProyecto();
    assert.equal(lista.length, antes + 2, 'inscribirse otra vez reemplaza');
    assert.deepEqual(lista.slice(-2).map(p => p.titulo), ['A2', 'B']);
    assert.throws(() => inscribirEnProyecto({ seccion: '../x', titulo: '', orden: 0, capturar: () => null, restaurar: () => '' }), /no es un nombre de sección válido/);
});

test('las claves «__proto__» son propiedades propias: no cambian el prototipo ni se pierden', async () => {
    const decodificado = deJsonFiel('{"__proto__": {"inyectado": 1}, "a": {"__proto__": null}}');
    assert.equal(Object.getPrototypeOf(decodificado), Object.prototype);
    assert.equal(decodificado.inyectado, undefined, 'nada heredado');
    assert.deepEqual(Object.keys(decodificado), ['__proto__', 'a']);
    assert.equal(Object.getPrototypeOf(decodificado.a), Object.prototype);
    assert.equal(aJsonFiel(decodificado), '{"__proto__":{"inyectado":1},"a":{"__proto__":null}}', 'y de vuelta, igual');
    const filas = columnasAFilas({ columnas: ['__proto__', 'x'], valores: [[null, 'a'], [1, 2]] });
    assert.equal(Object.getPrototypeOf(filas[0]), Object.prototype);
    assert.deepEqual(Object.keys(filas[0]), ['__proto__', 'x']);
    assert.equal(filas[1]['__proto__'], 'a');
    // (2026.12.31, segunda revisión) y al quitar el marcado (lo que hace el Analizador con lo que llega de un archivo): una
    // celda null en una columna «__proto__» le quitaba el prototipo a la fila, y su valor se perdía
    const limpia = sinMarcadoEnTodo(JSON.parse('{"__proto__": null, "<x>": 1, "a": "<b>"}'));
    assert.equal(Object.getPrototypeOf(limpia), Object.prototype);
    assert.deepEqual(Object.keys(limpia), ['__proto__', '‹x›', 'a']);
    assert.equal(Object.getOwnPropertyDescriptor(limpia, '__proto__').value, null);
    assert.equal(limpia.a, '‹b›');
});

test('lo que un proyecto ajeno no puede hacer con el Analizador: datos desmedidos, etiquetas o estructura de otra forma, expresiones regulares', () => {
    // (2026.12.31, segunda revisión) los topes, antes de construir las filas
    assert.equal(MAXIMO_CASOS_ANALIZADOR, 2000000);
    assert.equal(MAXIMO_CELDAS_ANALIZADOR, 20000000);
    // (2026.12.31, cuarta revisión) un JSON se mide antes de leerlo: sus comas, sus listas y objetos, y su profundidad
    assert.deepEqual(medirJson('{"columnas":["a","b"],"valores":[[1,2,3],[4,5,6]]}'), { comas: 7, contenedores: 5, profundidad: 3 }, 'sus 6 celdas: las comas menos las listas, más cuatro');
    assert.deepEqual(medirJson('["a,b", "c\\"[,{", "\\\\", [1, {"x": ","}]]'), { comas: 4, contenedores: 3, profundidad: 3 }, 'lo que hay en las cadenas no cuenta');
    assert.deepEqual(medirJson('[]'), { comas: 0, contenedores: 1, profundidad: 1 });
    assert.equal(medirJson('['.repeat(1000000), 32).profundidad, Infinity, 'deja de medir al pasar del tope');
    const topes = { profundidad: 3, contenedores: 10, elementos: 20 };
    assert.equal(excesoDeJson('[[[]]]', topes), null);
    assert.equal(excesoDeJson('[[[[]]]]', topes), 'profundidad');
    assert.equal(excesoDeJson('[' + '[],'.repeat(10) + '[]]', topes), 'contenedores');
    assert.equal(excesoDeJson('[' + '1,'.repeat(20) + '1]', topes), 'elementos');
    assert.throws(() => leerJsonAcotado('[[[[]]]]', topes, { forma: 'sin forma', invalido: 'no es JSON' }), /^Error: sin forma$/);
    assert.throws(() => leerJsonAcotado('[1,', topes, { forma: 'sin forma', invalido: 'no es JSON' }), /^Error: no es JSON$/);
    assert.deepEqual(leerJsonAcotado('[1,[2]]', topes, { forma: '', invalido: '' }), [1, [2]]);
    // «datos.json»: tres niveles; sus celdas, por sus comas, antes de leerlo (unos KB comprimidos eran millones de valores,
    // y unas listas anidadas, sin una coma, tumbaban la pestaña)
    let t0 = Date.now();
    assert.throws(() => datosDeJson('{"columnas":["a"],"valores":[' + '['.repeat(2000000) + ']'.repeat(2000000) + ']}'), /^Error: los datos guardados \(«datos\.json»\) no tienen la forma esperada$/);
    assert.throws(() => datosDeJson('{"columnas":["a"],"valores":[[[[1]]]]}'), /^Error: los datos guardados \(«datos\.json»\) no tienen la forma esperada$/, 'más de tres niveles, aunque sean pocos');
    assert.throws(() => datosDeJson('{"columnas":[],"valores":[' + '[],'.repeat(1000001) + '[]]}'), /traen más de 1\.000\.000 variables/);
    assert.throws(() => datosDeJson('{"columnas":["a"],"valores":[[' + '0,'.repeat(12) + '0]]}', { celdas: 12 }), /^Error: los datos guardados \(«datos\.json»\) traen más de 12 valores: más de lo que el Analizador abre aquí/);
    assert.equal(datosDeJson('{"columnas":["a"],"valores":[[' + '0,'.repeat(11) + '0]]}', { celdas: 12 }).length, 12, 'justo en el tope: sus celdas, contadas por sus comas');
    assert.equal(datosDeJson('{"columnas":["a","b,c"],"valores":[["x,y",1],["z",2]]}').length, 2, 'las comas de los textos no cuentan');
    assert.throws(() => datosDeJson('{"columnas":'), /no son JSON válido/);
    assert.ok(Date.now() - t0 < 3000, `${Date.now() - t0} ms`);
    // «etiquetas.json»: lo más que puede traer, también antes de leerlo (25 millones de dimensiones vacías: ni se construyen).
    // (2027.01.01) Con los códigos de las categorías, el tope de contenedores sube (cada lista de códigos y cada par lo son):
    // una lista de dimensiones más larga que todo lo admitido junto sigue sin leerse
    const estructuraEnorme = '{"etiquetas":{},"estructura":[{"dimensiones":[' + '{},'.repeat(TOPES_JSON_ETIQUETAS.contenedores) + '{}]}]}';
    t0 = Date.now();
    assert.equal(excesoDeJson(estructuraEnorme, TOPES_JSON_ETIQUETAS), 'contenedores');
    assert.equal(excesoDeJson('{"etiquetas":' + '['.repeat(100) + ']'.repeat(100) + '}', TOPES_JSON_ETIQUETAS), 'profundidad');
    assert.ok(Date.now() - t0 < 1000, `${Date.now() - t0} ms`);
    const legitima = JSON.stringify({ etiquetas: Object.fromEntries(Array.from({ length: 200000 }, (_, i) => [`c${i}`, `Etiqueta, ${i}`])),
        estructura: Array.from({ length: 5000 }, (_, i) => ({ prueba: `P${i}`, variable: 'V', columnaGeneral: `General_P${i}`, etiquetaGeneral: 'G', siglaGeneral: null, unidimensional: false, dimensiones: [{ columna: `Dimension_D${i}`, etiqueta: 'D', sigla: `D${i}` }] })),
        origen: { tipo: 'simulador' },
        // (2027.01.01) y lo más que admite codigosValidos: todos los códigos, de dos en dos
        codigosDeCategorias: Object.fromEntries(Array.from({ length: MAXIMO_CODIGOS_CATEGORIAS / 2 }, (_, i) => [`c${i}`, [[0, `No, ${i}`], [1, 'Sí']]])) });
    assert.ok(codigosValidos(JSON.parse(legitima).codigosDeCategorias));
    assert.equal(excesoDeJson(legitima, TOPES_JSON_ETIQUETAS), null, 'lo más que admiten etiquetasValidas, estructuraValida y codigosValidos cabe');
    const base = { columnas: ['a', 'b', 'c'], valores: [[1, 2, 3, 4], [1, 2, 3, 4], [1, 2, 3, 4]] };
    assert.equal(columnasAFilas(base, { celdas: 12 }).length, 4);
    assert.throws(() => columnasAFilas(base, { celdas: 11 }), /^Error: los datos guardados \(4 casos y 3 variables\) son más de lo que el Analizador abre aquí/);
    assert.throws(() => columnasAFilas(base, { casos: 3 }), /son más de lo que el Analizador abre aquí/);
    // la estructura y las etiquetas, con la forma que se guarda
    const estructura = [{ prueba: 'EAR', variable: 'Autoestima', columnaGeneral: 'General_E', etiquetaGeneral: 'Autoestima', siglaGeneral: null, unidimensional: false, dimensiones: [{ columna: 'Dimension_S', etiqueta: 'Social', sigla: 'S' }] }];
    assert.equal(estructuraValida(estructura), true);
    assert.equal(estructuraValida([]), true);
    for (const mala of [null, {}, [1], [{ dimensiones: 'S' }], [{ dimensiones: [{ sigla: 7 }] }], [{ unidimensional: 'sí', dimensiones: [] }], [{ prueba: 'x'.repeat(1001), dimensiones: [] }]]) assert.equal(estructuraValida(mala), false, JSON.stringify(mala).slice(0, 60));
    // (2026.12.31, tercera revisión) las dimensiones, acotadas entre todas las pruebas (antes, cada lista: 5000 × 5000), y
    // siempre en una lista (sin ella, el análisis por dimensiones fallaba con un error de JavaScript)
    assert.deepEqual([MAXIMO_PRUEBAS_ESTRUCTURA, MAXIMO_DIMENSIONES_ESTRUCTURA], [5000, 5000]);
    const dimension = { columna: 'Dimension_S', etiqueta: 'Social', sigla: 'S' };
    const pruebas = (/** @type {number} */ n, /** @type {number} */ dims) => Array.from({ length: n }, (_, i) => ({ prueba: `P${i}`, dimensiones: Array.from({ length: dims }, () => dimension) }));
    assert.equal(estructuraValida(pruebas(2, 2500)), true, 'justo en el tope');
    assert.equal(estructuraValida(pruebas(2, 2501)), false);
    assert.equal(estructuraValida(pruebas(5000, 1)), true);
    assert.equal(estructuraValida(pruebas(5001, 0)), false);
    assert.equal(estructuraValida([{ prueba: 'P', dimensiones: new Array(5001).fill(dimension) }]), false, 'una sola prueba con más');
    const muchas = new Array(5000).fill(dimension);
    const t1 = Date.now();
    assert.equal(estructuraValida(Array.from({ length: 5000 }, () => ({ dimensiones: muchas }))), false, '25 millones: no se recorren');
    assert.ok(Date.now() - t1 < 200, `${Date.now() - t1} ms`);
    assert.equal(estructuraValida([{ prueba: 'P' }]), false, 'sin la lista de dimensiones');
    // (cuarta revisión) las siglas y las columnas, del largo de las del Simulador (con 1000 caracteres, las siglas encadenadas
    // «T», «T1», «T11»… hacían que cada una recorriera las columnas de las demás)
    assert.deepEqual([LARGO_SIGLA_ESTRUCTURA, LARGO_COLUMNA_ESTRUCTURA], [32, 64]);
    const conDimension = (/** @type {object} */ d, /** @type {object} */ p = {}) => [{ prueba: 'P', ...p, dimensiones: [{ columna: 'Dimension_S', etiqueta: 'S', sigla: 'S', ...d }] }];
    assert.equal(estructuraValida(conDimension({ sigla: 'S'.repeat(32), columna: 'D'.repeat(64) }, { siglaGeneral: 'G'.repeat(32), columnaGeneral: 'C'.repeat(64) })), true);
    for (const [d, p] of [[{ sigla: 'S'.repeat(33) }, {}], [{ columna: 'D'.repeat(65) }, {}], [{}, { siglaGeneral: 'G'.repeat(33) }], [{}, { columnaGeneral: 'C'.repeat(65) }]]) assert.equal(estructuraValida(conDimension(d, p)), false, JSON.stringify([d, p]).slice(0, 80));
    assert.equal(etiquetasValidas({ a: 'A', b: 'B' }), true);
    for (const mala of [null, [], { a: 1 }, { a: { b: 'c' } }, { a: 'x'.repeat(10001) }]) assert.equal(etiquetasValidas(mala), false, JSON.stringify(mala).slice(0, 60));
    // un texto ajeno como literal de una expresión regular: se encuentra a sí mismo, y nada lo hace retroceder sin fin
    const raros = ['(a+)+', '.*', '[x]{2}', 'a|b', '^$', '\\d+', 'Total (2)', 'á.é?', '((((a*)*)*)*)'];
    for (const r of raros) {
        const re = new RegExp('^' + escaparRegExp(r) + '\\d+$', 'i');
        assert.equal(re.test(r + '12'), true, r);
        const t0 = Date.now();
        assert.equal(re.test('a'.repeat(5000) + '!'), false);
        assert.ok(Date.now() - t0 < 100, r);
    }
    // el prefijo y el número de un nombre de ítem: lo mismo que la expresión que se usaba, en tiempo lineal
    const expresion = /^(.+?)[_\-]?(\d+)$/;
    let s = 11;
    const azar = () => (s = (s * 48271) % 2147483647) / 2147483647;
    const piezas = ['a', 'B', '1', '2', '0', '_', '-', 'x', '9', '__', '--', 'é', '\n', '\r', ' ', ' '];
    for (let k = 0; k < 20000; k++) {
        const nombre = Array.from({ length: 1 + Math.floor(azar() * 8) }, () => piezas[Math.floor(azar() * piezas.length)]).join('');
        const m = nombre.match(expresion), r = prefijoYNumero(nombre);
        assert.deepEqual(r ? [r.prefijo, r.numero] : null, m ? [m[1], m[2]] : null, JSON.stringify(nombre));
    }
    t0 = Date.now();
    assert.equal(prefijoYNumero('1'.repeat(200000) + 'x'), null);
    assert.equal(/** @type {{ numero: string }} */ (prefijoYNumero('PE_' + '7'.repeat(200000))).numero.length, 200000);
    assert.ok(Date.now() - t0 < 200, `${Date.now() - t0} ms`);
});
