// tests/integration/sav.test.js — (2026.12.29) el puente SPSS (core/data/sav/): el lector y el escritor propios contra
// ReadStat (la biblioteca de haven y pyreadstat), con el fixture que generó tests/oracle/sav_oraculo.mjs:
//   · el lector lee de los once archivos reales de SPSS (tests/oracle/sav/: comprimidos, sin comprimir, .zsav, con
//     perdidos declarados, respuestas múltiples, cadenas muy largas, hebreo, telugu, windows-1252 y UTF-8) exactamente lo
//     que lee ReadStat;
//   · el escritor sigue produciendo, byte a byte, los archivos que ReadStat leyó bien, y lo que ReadStat leyó es lo que se
//     pidió escribir;
//   · lo que escribe el escritor lo lee el lector (ida y vuelta), también con la base del Simulador;
//   · los archivos dañados dan un error claro, nunca una excepción sin mensaje ni una reserva de memoria desmedida;
//   · el Analizador recibe la base como la espera (motor/datos-spss.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { leerSav, esPerdidoSav } from '../../src/core/data/sav/lector.js';
import { escribirSav } from '../../src/core/data/sav/escritor.js';
import { EPOCA_SPSS, LOWEST, segundosAFecha, diasASegundos, etiquetaCodificacion, utf8Recortado } from '../../src/core/data/sav/formato.js';
import { baseDesdeSav } from '../../src/analizador/motor/datos-spss.js';
import { GeneradorDatos } from '../../src/simulador/dominio/generador.js';
import { VERSION } from '../../src/version.js';
import { casosEscritor, sinMarcaDeTiempo } from '../oracle/sav_casos.js';

const dirSav = new URL('../oracle/sav/', import.meta.url);
const fixture = JSON.parse(fs.readFileSync(new URL('../oracle/sav_fixture.json', import.meta.url), 'utf8'));
const sha256 = b => createHash('sha256').update(b).digest('hex');
const leerReal = archivo => fs.readFileSync(new URL(archivo, dirSav));
const MEDIDAS = { nominal: 'nominal', ordinal: 'ordinal', escala: 'scale' };
const ALINEACIONES = { izquierda: 'left', derecha: 'right', centro: 'center' };
const ordenar = l => [...l].sort((a, b) => (typeof a[0] === 'number' ? a[0] - b[0] : String(a[0]).localeCompare(String(b[0]))));
const conjuntosDe = ref => { const m = new Map(); ref.value_labels.forEach(([c, v, e]) => { if (!m.has(c)) m.set(c, []); m.get(c).push([v, e]); }); return m; };

/** Las diferencias entre lo que leyó el lector propio y lo que leyó ReadStat. */
function diferencias(mio, ref) {
    const dif = [];
    const igual = (que, a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) dif.push(`${que}: lector ${JSON.stringify(a).slice(0, 160)} ≠ ReadStat ${JSON.stringify(b).slice(0, 160)}`); };
    igual('casos', mio.n, ref.rows);
    igual('variables', mio.variables.length, ref.variables.length);
    igual('codificación', mio.codificacion.toLowerCase(), String(ref.encoding).toLowerCase());
    igual('etiqueta del archivo', mio.etiquetaArchivo, ref.label);
    igual('documentos', mio.documentos, ref.notes);
    igual('compresión', mio.compresion, { none: 0, rows: 1, binary: 2 }[ref.compression]);
    igual('orden de bytes', mio.granEndian, ref.endianness === 'big');
    const conjuntos = conjuntosDe(ref);
    mio.variables.forEach((v, k) => {
        const r = ref.variables[k];
        if (!r) return;
        const q = `${r.name}`;
        igual(`${q}: nombre`, v.nombre, r.name);
        igual(`${q}: etiqueta`, v.etiqueta, r.label);
        igual(`${q}: tipo`, v.tipo === 'texto' ? 'string' : 'numeric', r.type);
        igual(`${q}: formato`, String(v.formato).replace(/\.0$/, ''), String(r.format).replace(/\.0$/, ''));
        igual(`${q}: medida`, v.medida ? MEDIDAS[v.medida] : 'unknown', r.measure);
        igual(`${q}: alineación`, v.alineacion ? ALINEACIONES[v.alineacion] : 'unknown', r.alignment);
        if (v.columnas !== null) igual(`${q}: columnas`, v.columnas, r.display_width);
        if (v.tipo === 'texto') igual(`${q}: ancho`, v.ancho, r.storage_width);
        const perdidos = [...(v.perdidos.rango ? [v.perdidos.rango] : []), ...v.perdidos.valores.map(x => [x, x])];
        igual(`${q}: perdidos`, ordenar(perdidos), ordenar(r.missing));
        igual(`${q}: etiquetas de valor`, ordenar(v.etiquetasValor), ordenar(conjuntos.get(r.labels) || []));
    });
    for (let i = 0; i < Math.min(mio.n, ref.rows) && dif.length < 20; i++) {
        const fila = mio.variables.map((v, k) => { const x = mio.datos[k][i]; return typeof x === 'number' && Number.isNaN(x) ? null : x; });
        const filaRef = (ref.data[i] || []).map(x => (x && typeof x === 'object' ? x.user_missing : x));
        igual(`caso ${i}`, fila, filaRef);
    }
    return dif;
}

test('el lector lee de los once archivos reales de SPSS lo mismo que ReadStat', async () => {
    assert.equal(fixture.reales.length, 13, 'los once de SPSS y los dos que escribe ReadStat (cadenas muy largas, perdidos)');
    for (const real of fixture.reales) {
        const bytes = leerReal(real.archivo);
        assert.equal(sha256(bytes), real.sha256, `${real.archivo}: el archivo no es el que leyó ReadStat`);
        const mio = await leerSav(bytes);
        assert.deepEqual(diferencias(mio, real.readstat), [], real.archivo);
    }
});

test('el lector, en detalle: perdidos declarados, rangos, fechas, cadenas muy largas y .zsav', async () => {
    const m = await leerSav(leerReal('sample_missing.sav'));
    const mynum = m.variables.find(v => v.nombre === 'mynum'), k = m.variables.indexOf(mynum);
    assert.deepEqual(mynum.perdidos, { valores: [-1], rango: [2000, 3000] });
    assert.deepEqual(Array.from(m.datos[k]).map(x => (Number.isNaN(x) ? null : x)), [1.1, 1.2, -1000.3, -1.4, 1000.3, -1, 2500, null].slice(0, m.n));
    assert.equal(esPerdidoSav(mynum, -1), true);
    assert.equal(esPerdidoSav(mynum, 2500), true, 'dentro del rango');
    assert.equal(esPerdidoSav(mynum, 2000), true, 'el rango incluye sus extremos');
    assert.equal(esPerdidoSav(mynum, 3000), true);
    assert.equal(esPerdidoSav(mynum, 1999.99), false);
    assert.equal(esPerdidoSav(mynum, 1000.3), false);
    assert.equal(esPerdidoSav(mynum, NaN), true, 'el perdido del sistema');
    const mydate = m.variables.find(v => v.nombre === 'mydate');
    assert.equal(mydate.fecha, true); assert.equal(mydate.conHora, false); assert.equal(mydate.formato, 'EDATE10.0');
    assert.equal(segundosAFecha(m.datos[m.variables.indexOf(mydate)][0]), '2018-05-06');
    const dtime = m.variables.find(v => v.nombre === 'dtime');
    assert.equal(dtime.conHora, true);
    assert.equal(segundosAFecha(m.datos[m.variables.indexOf(dtime)][0], true), '2018-05-06 10:10:10');
    const mytime = m.variables.find(v => v.nombre === 'mytime');
    assert.equal(mytime.fecha, false, 'TIME es una duración, no una fecha');
    // cadena de caracteres: el perdido declarado
    const c = await leerSav(leerReal('missing_char.sav'));
    assert.equal(esPerdidoSav(c.variables[0], 'Z'), true);
    assert.equal(esPerdidoSav(c.variables[0], 'a'), false);
    assert.equal(esPerdidoSav(c.variables[0], ''), true, 'la cadena vacía');
    // .zsav: lo mismo que el .sav
    const s = await leerSav(leerReal('sample.sav')), z = await leerSav(leerReal('sample.zsav'));
    assert.equal(z.compresion, 2);
    assert.deepEqual(z.datos.map(col => Array.from(col)), s.datos.map(col => Array.from(col)));
    // cadenas muy largas escritas por ReadStat: 255, 256, 509 y 600 bytes (tres segmentos), con caracteres de 2, 3 y 4 bytes
    const v = await leerSav(leerReal('readstat_vls.sav'));
    const largo = v.datos[v.variables.findIndex(x => x.nombre === 'comentario_largo')];
    assert.deepEqual(largo.map(x => new TextEncoder().encode(x).length), [600, 255, 256, 509, 600, 597, 3, 0]);
    assert.equal(largo[3], '😀'.repeat(127) + 'x', 'los emoji (4 bytes) cruzan los cortes de los segmentos enteros');
    assert.equal(largo[5], 'ñ€'.repeat(119) + 'ñ', 'caracteres de 2 y 3 bytes que cruzan el corte entre segmentos');
    // una cadena UTF-8 con bytes nulos dentro (algunos programas rellenan con ellos): se saltan, como en ReadStat
    const conNulos = Buffer.from(escribirSav({ variables: [{ nombre: 't', tipo: 'texto', valores: ['a  b', 'xyz'] }] }, { comprimir: false }).bytes);
    const p = conNulos.indexOf('a  b');
    conNulos[p + 1] = 0; conNulos[p + 2] = 0;
    assert.deepEqual((await leerSav(conNulos)).datos[0], ['ab', 'xyz']);
    // windows-1252 con la tabla propia: un «€» (0x80) en los documentos de un archivo de SPSS en windows-1252
    const ansi = Buffer.from(leerReal('sample.sav'));
    ansi[ansi.indexOf('some test text')] = 0x80;
    const docs = (await leerSav(ansi)).documentos;
    assert.equal(docs[0].slice(0, 14), '€ome test text');
    // cadena muy larga (más de 255 bytes, en segmentos) en telugu
    const t = await leerSav(leerReal('tegulu.sav'));
    assert.ok(t.variables.some(v => v.tipo === 'texto' && v.ancho > 255), 'una cadena muy larga');
    assert.ok(t.datos.some(col => Array.isArray(col) && col.some(x => /[ఀ-౿]/.test(x))), 'texto en telugu');
    assert.ok(t.datos.every(col => !Array.isArray(col) || col.every(x => !x.includes('�'))), 'sin caracteres rotos');
});

test('el escritor produce byte a byte los archivos que ReadStat leyó bien (fuera de la fecha de creación)', () => {
    const casos = casosEscritor();
    assert.equal(casos.length, fixture.escritos.length);
    casos.forEach((caso, k) => {
        const ref = fixture.escritos[k];
        assert.equal(ref.caso, caso.nombre);
        const { bytes, avisos, nombres } = escribirSav(caso.base, caso.opciones || {});
        assert.deepEqual(avisos, ref.avisos, `${caso.nombre}: avisos`);
        assert.deepEqual(nombres, ref.nombres, `${caso.nombre}: nombres ajustados`);
        assert.equal(bytes.length, ref.bytes, `${caso.nombre}: tamaño`);
        assert.equal(sha256(sinMarcaDeTiempo(bytes)), ref.sha256,
            `${caso.nombre}: el escritor ya no escribe los bytes que validó ReadStat; si el cambio es a propósito, regenera el fixture con tests/oracle/sav_oraculo.mjs`);
    });
});

test('lo que ReadStat leyó de cada archivo escrito es lo que se pidió escribir (nombres, etiquetas, medida, formatos, datos)', () => {
    const recortar = (t, max) => new TextDecoder().decode(utf8Recortado(t, max).bytes);
    casosEscritor().forEach((caso, k) => {
        const ref = fixture.escritos[k].readstat;
        const vars = caso.base.variables;
        const n = caso.base.n ?? Math.max(...vars.map(v => v.valores.length));
        assert.equal(ref.error, '', caso.nombre);
        assert.equal(ref.rows, n);
        assert.equal(ref.encoding, 'UTF-8');
        assert.equal(ref.compression, caso.opciones && caso.opciones.comprimir === false ? 'none' : 'rows');
        assert.equal(ref.endianness, caso.opciones && caso.opciones.granEndian ? 'big' : 'little');
        if (caso.base.etiquetaArchivo) assert.equal(ref.label.trimEnd(), caso.base.etiquetaArchivo);
        if (caso.base.documentos) assert.deepEqual(ref.notes, caso.base.documentos);
        const renombre = new Map(fixture.escritos[k].nombres);
        const conjuntos = conjuntosDe(ref);
        vars.forEach((v, j) => {
            const r = ref.variables[j], nombre = renombre.get(v.nombre) || v.nombre;
            assert.equal(r.name, nombre);
            assert.equal(r.label, recortar(v.etiqueta || '', 256), `${nombre}: etiqueta`);
            assert.equal(r.type, v.tipo === 'texto' ? 'string' : 'numeric');
            assert.equal(r.measure, MEDIDAS[v.medida || (v.tipo === 'texto' || v.etiquetasValor ? 'nominal' : 'escala')], `${nombre}: medida`);
            if (v.fecha) assert.equal(r.format, 'DATE11');
            const esperadas = (Array.isArray(v.etiquetasValor) ? v.etiquetasValor : Object.entries(v.etiquetasValor || {}))
                .map(([a, b]) => [v.tipo === 'texto' ? String(a) : Number(a), recortar(String(b), 120)]);
            assert.deepEqual(conjuntos.get(r.labels) || [], esperadas, `${nombre}: etiquetas de valor`);
            for (let i = 0; i < n; i++) {
                const x = v.valores[i];
                let esperado;
                if (v.tipo === 'texto') esperado = recortar(x === null || x === undefined ? '' : String(x), 255).replace(/ +$/, '');
                else if (typeof x !== 'number' || !Number.isFinite(x)) esperado = null;
                else esperado = v.fecha ? x * 86400 + EPOCA_SPSS : x;
                if (JSON.stringify(ref.data[i][j]) !== JSON.stringify(esperado)) assert.fail(`${caso.nombre} · ${nombre}[${i}]: se pidió ${JSON.stringify(esperado)} y ReadStat leyó ${JSON.stringify(ref.data[i][j])}`);
            }
        });
    });
});

test('ida y vuelta: el lector lee de cada archivo escrito lo mismo que ReadStat', async () => {
    for (const [k, caso] of casosEscritor().entries()) {
        const { bytes } = escribirSav(caso.base, caso.opciones || {});
        const mio = await leerSav(bytes);
        assert.deepEqual(diferencias(mio, fixture.escritos[k].readstat), [], caso.nombre);
    }
});

test('el escritor: nombres que SPSS no admite, recortes con aviso y errores', () => {
    const { nombres, avisos } = escribirSav({ variables: [
        { nombre: 'edad', valores: [1] }, { nombre: 'EDAD', valores: [2] }, { nombre: 'with', valores: [3] }, { nombre: '_x', valores: [4] },
        { nombre: 'a b-c', valores: [5] }, { nombre: '#total', valores: [6] }, { nombre: 'fin.', valores: [7] }, { nombre: '', valores: [8] }
    ] });
    assert.deepEqual(nombres, [['EDAD', 'EDAD_2'], ['with', 'with_'], ['_x', 'V_x'], ['a b-c', 'a_b_c'], ['#total', 'V#total'], ['fin.', 'fin'], ['', 'V']]);
    assert.equal(avisos.length, nombres.length);
    assert.throws(() => escribirSav({ variables: [] }), /No hay variables/);
    // un archivo sin casos y una cadena vacía en todas las filas también son archivos válidos
    assert.ok(escribirSav({ n: 0, variables: [{ nombre: 'x', valores: [] }] }).bytes.length > 176);
});

test('.zsav: el descompresor propio lee lo mismo que el del navegador, y un bloque que declara lo imposible o más de lo que da se rechaza', async () => {
    // (2026.12.31, revisión) sin DecompressionStream (navegadores de antes de 2023), con el DEFLATE propio y el Adler-32
    for (const nombre of ['sample.zsav', 'readstat_vls.zsav']) {
        const bytes = leerReal(nombre);
        const nativo = await leerSav(bytes), propio = await leerSav(bytes, { nativo: false });
        assert.equal(propio.compresion, 2);
        assert.deepEqual(propio.datos.map(col => Array.from(col)), nativo.datos.map(col => Array.from(col)), nombre);
    }
    // el índice de los bloques: tras la cabecera de los datos zlib, que empieza con su propio desplazamiento
    const z = Buffer.from(leerReal('sample.zsav'));
    let cabecera = -1;
    for (let p = 176; p + 24 <= z.length; p++) if (Number(z.readBigInt64LE(p)) === p) { cabecera = p; break; }
    assert.ok(cabecera > 0, 'la cabecera de los datos zlib');
    const indice = Number(z.readBigInt64LE(cabecera + 8));
    const declarado = z.readInt32LE(indice + 24 + 16), comprimido = z.readInt32LE(indice + 24 + 20);
    assert.ok(declarado > 0 && comprimido > 0);
    for (const nativo of [true, false]) {
        // 600 MB para unos pocos bytes: imposible con zlib, y sin reservar los 600 MB
        const imposible = Buffer.from(z); imposible.writeInt32LE(600 * 1024 * 1024, indice + 24 + 16);
        const t0 = Date.now();
        await assert.rejects(leerSav(imposible, { nativo }), /^Error: Archivo de SPSS no válido: un bloque zlib dice un tamaño imposible$/);
        assert.ok(Date.now() - t0 < 1000);
        // un bloque que da más de lo que declara: se detiene ahí
        const corto = Buffer.from(z); corto.writeInt32LE(declarado - 7, indice + 24 + 16);
        await assert.rejects(leerSav(corto, { nativo }), nativo ? /^Error: Archivo de SPSS no válido: un bloque de datos comprimidos \(zlib\) es más largo de lo que declara$/ : /^Error: Archivo de SPSS no válido: un bloque de datos comprimidos \(zlib\) está dañado$/);
    }
    // el Adler-32 del final del bloque, comprobado por el descompresor propio
    const adler = Buffer.from(z); const finBloque = Number(z.readBigInt64LE(indice + 24 + 8)) + comprimido; adler[finBloque - 1] ^= 0xFF;
    await assert.rejects(leerSav(adler, { nativo: false }), /un bloque de datos comprimidos \(zlib\) está dañado/);
});

test('archivos dañados: un error claro («Archivo de SPSS no válido…»), sin excepciones mudas ni memoria desmedida', async () => {
    await assert.rejects(leerSav(new Uint8Array(10)), /demasiado corto/);
    await assert.rejects(leerSav(new TextEncoder().encode('ID,Edad\n1,20\n'.repeat(20))), /no empieza como un archivo de datos de SPSS/);
    const base = leerReal('sample.sav');
    await assert.rejects(leerSav(base.subarray(0, 300)), /termina antes de tiempo/);
    // truncado en los datos: los casos completos, con aviso
    const parcial = await leerSav(base.subarray(0, base.length - 20));
    assert.ok(parcial.n < 5 && parcial.avisos.some(a => /anuncia 5 casos/.test(a)), JSON.stringify(parcial.avisos));
    // una cabecera que anuncia dos mil millones de casos no reserva memoria para ellos
    const enorme = Buffer.from(base); enorme.writeInt32LE(2000000000, 80);
    const e = await leerSav(enorme);
    assert.equal(e.n, 5);
    assert.ok(e.avisos.some(a => /2000000000/.test(a)));
    // bytes al azar: siempre un Error con mensaje (los bloques zlib dañados incluidos)
    let s = 20261016; const azar = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    const archivos = ['sample.sav', 'sample.zsav', 'tegulu.sav', 'simple_alltypes.sav', 'sample_missing.sav'].map(leerReal);
    for (let k = 0; k < 400; k++) {
        const b = Buffer.from(archivos[k % archivos.length]);
        for (let j = 0; j < 1 + Math.floor(azar() * 3); j++) { const p = Math.floor(azar() * b.length); b[p] = Math.floor(azar() * 256); }
        try { await leerSav(b); } catch (err) { assert.match(String(err && err.message), /^Archivo de SPSS no válido: ./, `caso ${k}: ${err && err.stack}`); }
    }
});

test('formato: fechas, codificaciones y recortes en UTF-8', () => {
    assert.equal(segundosAFecha(EPOCA_SPSS), '1970-01-01');
    assert.equal(segundosAFecha(0), '1582-10-14');
    assert.equal(segundosAFecha(diasASegundos(19723)), '2024-01-01');
    assert.equal(segundosAFecha(diasASegundos(19723) + 3661.5, true), '2024-01-01 01:01:01.500');
    assert.equal(segundosAFecha(NaN), '');
    assert.equal(etiquetaCodificacion('UTF-8', 0), 'utf-8');
    assert.equal(etiquetaCodificacion('CP1252', 0), 'windows-1252');
    assert.equal(etiquetaCodificacion('', 65001), 'utf-8');
    assert.equal(etiquetaCodificacion('', 1255), 'windows-1255');
    assert.equal(etiquetaCodificacion('no-existe', 0), 'windows-1252');
    assert.deepEqual(utf8Recortado('añó', 3), { bytes: new TextEncoder().encode('añ'), recortado: true }, 'justo en el borde de la ó');
    assert.deepEqual(utf8Recortado('añó', 2), { bytes: new TextEncoder().encode('a'), recortado: true }, 'sin partir la ñ');
    assert.deepEqual(utf8Recortado('😀x', 3), { bytes: new Uint8Array(0), recortado: true }, 'sin partir un emoji de 4 bytes');
    assert.ok(LOWEST > -Number.MAX_VALUE && LOWEST < -1e307);
});

/** Un generador con un test de dos dimensiones, sociodemográficos con etiquetas y una fecha de nacimiento. */
function generadorDePrueba() {
    const g = new GeneradorDatos();
    const dim = (nombre, corto) => ({ nombre, nombreCorto: corto, prueba: 'Autoestima', tipo: 'dimension', numItems: 4, media: 12, desviacion: 3, minimo: 1, maximo: 5, alfa: 0.8, distribucion: 'normal', invertidos: 0 });
    const socio = (categoria, corta, distribucion, extra) => ({ categoria, categoriaCorta: corta, distribucion, promedio: 0, desviacion: 1, minimo: null, maximo: null, decimales: 0, niveles: null, ordinal: false, fechaNacimiento: null, dependeDe: '', fuerza: 0.4, ...extra });
    g.configuracion = {
        tamanoMuestra: 60, semilla: 11, generarPercentiles: false, correlacionesExactas: false, indiceFiabilidad: 'alfa', heterogeneidadItems: 'leve',
        variablesPorTest: { Autoestima: { variable: 'Autoestima', rIntra: 0.4 } }, pruebas: [dim('Autoestima social', 'AS'), dim('Autoestima académica', 'AA')],
        sociodemograficos: [
            socio('Sexo', 'S', 'binaria', { promedio: 0.45, niveles: [{ codigo: 0, etiqueta: 'Femenino', proporcion: 0.55 }, { codigo: 1, etiqueta: 'Masculino', proporcion: 0.45 }] }),
            socio('Grado', 'G', 'categorica', { minimo: 1, maximo: 3, ordinal: true, niveles: [{ codigo: 1, etiqueta: 'Primero', proporcion: 0.4 }, { codigo: 2, etiqueta: 'Segundo', proporcion: 0.35 }, { codigo: 3, etiqueta: 'Tercero', proporcion: 0.25 }] }),
            socio('Edad', 'E', 'normal', { promedio: 20, desviacion: 2, minimo: 16, maximo: 30, fechaNacimiento: '2026-06-30' })
        ],
        correlaciones: [], diferenciasGrupo: [], modelos: [], medidasRepetidas: [], niveles: [], estructuras: [], cortes: [], concordancias: [], realismo: {},
        desenlaces: [{ nombre: 'Deserción', tipo: 'binario', prevalencia: 0.3, media: null, niveles: null, etiquetas: ['No', 'Sí'], predictores: [{ variable: 'Autoestima social', efecto: 1.2 }] }]
    };
    g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas);
    return g;
}

test('el Simulador: la base generada como .sav, con sus etiquetas, niveles de medida, categorías y fechas', async () => {
    const g = generadorDePrueba();
    assert.deepEqual(g.validarConfiguracion().errores, []);
    const base = g.generarBaseDatos();
    const fecha = new Date(2026, 9, 16, 9, 30);
    const { bytes, avisos } = g.exportarSav({ fecha });
    assert.deepEqual(avisos, [], 'los nombres del Simulador son válidos en SPSS');
    const leido = await leerSav(bytes);
    assert.equal(leido.n, base.n);
    assert.deepEqual(leido.variables.map(v => v.nombre), base.nombres());
    assert.equal(leido.codificacion, 'utf-8');
    assert.equal(leido.etiquetaArchivo.trimEnd(), `StatSim Pro — base simulada (n = ${base.n})`);
    assert.equal(leido.documentos[0], `Base simulada con StatSim Pro ${VERSION} el 2026-10-16 09:30.`);
    assert.match(leido.documentos[1], /Semilla: 11/);
    const etiquetas = g.obtenerEtiquetas(), medidas = g.nivelesDeMedida();
    assert.equal(medidas.ID, 'nominal');
    // los niveles de medida, uno a uno (no solo coherentes con nivelesDeMedida)
    const medidaDe = nombre => leido.variables.find(x => x.nombre === nombre).medida;
    assert.deepEqual(['ID', 'Sexo', 'Grado', 'Edad', 'FechaNac_E', 'AS1', 'Dimension_AS', 'Deserción'].map(medidaDe),
        ['nominal', 'nominal', 'ordinal', 'escala', 'escala', 'ordinal', 'escala', 'nominal']);
    base.columnas.forEach((c, k) => {
        const v = leido.variables[k];
        assert.equal(v.etiqueta, etiquetas[c.nombre] || '', `${c.nombre}: etiqueta`);
        if (medidas[c.nombre]) assert.equal(v.medida, medidas[c.nombre], `${c.nombre}: medida`);
        assert.deepEqual(v.etiquetasValor, Object.entries(c.etiquetas || {}).map(([a, b]) => [Number(a), b]), `${c.nombre}: etiquetas de valor`);
        assert.equal(v.fecha, c.formato === 'fecha', `${c.nombre}: fecha`);
        const esperados = Array.from(c.datos, x => (Number.isNaN(x) ? null : (c.formato === 'fecha' ? diasASegundos(x) : x)));
        assert.deepEqual(Array.from(leido.datos[k], x => (Number.isNaN(x) ? null : x)), esperados, `${c.nombre}: datos`);
    });
    // lo que se ve en SPSS es lo que el CSV del Simulador escribe: la categoría y la fecha como texto
    const sexo = base.columnas.find(c => c.nombre === 'Sexo');
    assert.ok(sexo && sexo.etiquetas, 'precondición: Sexo con etiquetas de valor');
    assert.equal(leido.variables[base.columnas.indexOf(sexo)].medida, 'nominal');
    const fn = base.columnas.find(c => c.formato === 'fecha');
    assert.ok(fn, 'precondición: una fecha de nacimiento');
    const kf = base.columnas.indexOf(fn);
    for (let i = 0; i < base.n; i++) if (!Number.isNaN(fn.datos[i])) assert.equal(segundosAFecha(leido.datos[kf][i]), base.presentar(fn, i));
    // los ítems, ordinales; los puntajes, escala
    assert.ok(leido.variables.some(v => /^AS\d/.test(v.nombre) && v.medida === 'ordinal'), 'ítems ordinales');
    assert.ok(leido.variables.some(v => /^Dimension_AS$/.test(v.nombre) && v.medida === 'escala'), 'puntaje de escala');
    // (revisión de la 2026.12.29) la firma del Simulador en la cabecera: el Analizador lee como categoría toda numérica con
    // etiquetas de valor (sus ítems no las llevan), como en su CSV
    assert.equal(leido.producto, '@(#) SPSS DATA FILE - StatSim Pro - Simulador');
    // los ítems de una escala continua (sin mínimo ni máximo por ítem) son de escala, no ordinales
    const continua = generadorDePrueba();
    continua.configuracion.pruebas.forEach(p => { p.minimo = null; p.maximo = null; });
    const medidasContinua = continua.nivelesDeMedida();
    assert.equal(medidasContinua.AS1, 'escala'); assert.equal(medidasContinua.AA4, 'escala');
});

test('el Analizador recibe la base de un .sav como la espera: perdidos vacíos, categorías, ítems numéricos, fechas, etiquetas', async () => {
    // archivo real: perdidos declarados (−1 y el rango 2000–3000) → vacíos; la ordinal con todas sus etiquetas → categorías
    const m = baseDesdeSav(await leerSav(leerReal('sample_missing.sav')));
    assert.deepEqual(m.categoricas, ['myord']);
    assert.deepEqual(m.fechas, ['mydate', 'dtime']);
    assert.deepEqual(m.textos, ['mychar']);
    assert.deepEqual(m.filas.map(f => f.mynum), [1.1, 1.2, -1000.3, -1.4, 1000.3, null, null, null].slice(0, m.filas.length));
    assert.deepEqual(m.filas.map(f => f.myord).slice(0, 5), ['low', 'medium', 'high', 'low', 'low']);
    assert.equal(m.filas[5].myord, null, '−1, perdido declarado');
    assert.equal(m.filas[0].mylabl, 1, 'de escala: sigue siendo número aunque tenga etiquetas');
    assert.equal(m.filas[0].mydate, '2018-05-06');
    assert.equal(m.filas[0].dtime, '2018-05-06 10:10:10');
    assert.equal(m.filas[0].mytime, 36610, 'TIME: segundos');
    assert.equal(m.etiquetas.myord, 'ordinal');
    // una cadena con etiqueta de valor muestra la etiqueta; el perdido declarado, vacío
    const c = baseDesdeSav(await leerSav(leerReal('missing_char.sav')));
    assert.deepEqual(c.filas.map(f => f.mychar), [null, 'labeled']);
    // un valor observado sin etiqueta (el 9 de x) deja la variable como número
    const t = baseDesdeSav(await leerSav(leerReal('simple_alltypes.sav')));
    assert.ok(t.numericas.includes('x'));
    // la base de prueba del escritor: los ítems que comparten anclas (tres o más) siguen siendo números
    const completo = casosEscritor()[0];
    const b = baseDesdeSav(await leerSav(escribirSav(completo.base).bytes));
    for (const item of ['Item_Likert_1', 'Item_Likert_2', 'Item_Likert_3']) assert.ok(b.numericas.includes(item), item);
    assert.ok(b.categoricas.includes('Sexo') && b.categoricas.includes('Nivel_socioeconómico'));
    assert.deepEqual([...new Set(b.filas.map(f => f.Sexo))].sort(), ['Femenino', 'Masculino']);
    assert.deepEqual([...new Set(b.filas.map(f => f.Grupo))].sort(), ['Grupo A', 'Grupo B', 'Grupo C con tilde']);
    assert.equal(b.filas[1].FechaNacimiento, segundosAFecha(diasASegundos(-4000 + 37)));
    assert.equal(b.filas[0].FechaNacimiento, null);
    assert.equal(b.etiquetas.Item_Likert_1, 'Ítem 1 — Me siento tranquilo');
    assert.equal(b.etiquetas.ID, 'Identificador');
    assert.ok(!('Item_Likert_2' in b.etiquetas), 'sin etiqueta: no se inventa');
    // una etiqueta igual al nombre no es una etiqueta; las de valor y las de variable, sin «<» ni «>»
    const raras = baseDesdeSav(await leerSav(escribirSav({ variables: [
        { nombre: 'Edad', valores: [20, 21], etiqueta: 'Edad' },
        { nombre: 'Grupo', valores: [1, 2], etiquetasValor: { 1: '<b>Control</b>', 2: 'Experimental' }, etiqueta: 'Grupo <asignado>' }
    ] }).bytes));
    assert.ok(!('Edad' in raras.etiquetas));
    assert.equal(raras.etiquetas.Grupo, 'Grupo ‹asignado›');
    assert.deepEqual(raras.filas.map(f => f.Grupo), ['‹b›Control‹/b›', 'Experimental']);
    // dos variables con el mismo nombre (un archivo dañado o hecho a mano): la segunda pasa a «A (2)»
    const dos = Buffer.from(escribirSav({ variables: [{ nombre: 'A', valores: [1, 2] }, { nombre: 'B', valores: [3, 4] }] }).bytes);
    const marca = dos.indexOf('B=B'); assert.ok(marca > 0, 'el registro de nombres largos');
    dos.write('B=A', marca, 'latin1');
    const d2 = baseDesdeSav(await leerSav(dos));
    assert.deepEqual(d2.filas, [{ A: 1, 'A (2)': 3 }, { A: 2, 'A (2)': 4 }]);
    assert.ok(d2.avisos.some(a => /«A» se llama «A \(2\)»/.test(a)), JSON.stringify(d2.avisos));
    // la ponderación no se aplica, y se avisa
    const ponderado = Buffer.from(escribirSav(completo.base).bytes);
    ponderado.writeInt32LE(7, 76);   // el 7.º elemento: «Enteros»
    const p = baseDesdeSav(await leerSav(ponderado));
    assert.ok(p.avisos.some(a => /pondera los casos por «Enteros»/.test(a)), JSON.stringify(p.avisos));
});
