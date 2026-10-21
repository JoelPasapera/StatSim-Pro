// tests/ui/proyecto.test.js — (2026.12.31) el proyecto completo, de extremo a extremo sobre index.html: con la configuración
// y la base del Simulador, los datos del Analizador con sus etiquetas, la V de Aiken, la última redacción y el protocolo
// con su flujo PRISMA, «Guardar proyecto» descarga un .statsim; tras borrarlo todo, «Abrir proyecto» lo devuelve todo a su
// sitio (la base, bit a bit; las tablas, con el mismo maestro). Y lo que no es un proyecto da un error claro sin tocar nada.
// (2026.12.31, revisión) Un proyecto ajeno con HTML en sus textos no lo mete en la página: se pinta como texto; y uno con
// los datos de otro tipo (un contador que no es un número) se rechaza entero, sin cambiar nada.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';

const raiz = new URL('../../', import.meta.url);
let env, pruebas, socios, motor, resultado, maestro, carga, proyecto, paquete, A, EV, Protocolo, Prisma, aiken;
const q = sel => globalThis.document.querySelector(sel);
const qa = sel => globalThis.document.querySelectorAll(sel);
const toast = () => ({ texto: q('#toast').textContent, tipo: q('#toast').className });
const campo = (fila, etiqueta) => fila.querySelector(`[aria-label="${etiqueta}"]`);
const poner = (el, v, tipo = 'input') => { el.value = v; env.disparar(el, tipo); };
const esperar = async (cond, ms = 20000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error('tiempo de espera agotado'); await new Promise(r => setTimeout(r, 25)); } };
const archivo = (nombre, bytes) => ({ name: nombre, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
const REDACCION = { t: Date.now(), problema: '¿Cómo se relaciona la autoestima con el rendimiento?', secciones: [{ titulo: 'Autoestima', capitulo: 'II', texto: 'Texto de prueba (Rosenberg, 1965).' }], fuentes: [{ titulo: 'Society and the adolescent self-image', cita: '(Rosenberg, 1965)', ref: 'Rosenberg, M. (1965).', anio: 1965, autores: ['Rosenberg, M.'] }], citadasIdx: [0] };

before(async () => {
    env = crearEntorno(fs.readFileSync(new URL('index.html', raiz), 'utf8'));
    globalThis.sessionStorage = globalThis.sessionStorage || { _m: new Map(), getItem(k) { return this._m.has(k) ? this._m.get(k) : null; }, setItem(k, v) { this._m.set(k, String(v)); }, removeItem(k) { this._m.delete(k); }, clear() { this._m.clear(); }, get length() { return this._m.size; } };
    env.document.readyState = 'interactive';
    globalThis.fetch = () => Promise.reject(new Error('sin red'));
    await import(new URL('src/main.js', raiz));
    await new Promise(r => setTimeout(r, 0));
    env.document.readyState = 'complete';
    env.disparar(env.document, 'DOMContentLoaded', { bubbles: false });
    [pruebas, socios, motor, resultado, maestro] = await Promise.all(['pruebas', 'sociodemograficos', 'motor', 'resultado', 'maestro'].map(m => import(new URL(`src/simulador/ui/${m}.js`, raiz))));
    carga = await import(new URL('src/analizador/ui/carga.js', raiz));
    proyecto = await import(new URL('src/proyecto/ui.js', raiz));
    paquete = await import(new URL('src/proyecto/paquete.js', raiz));
    aiken = await import(new URL('src/analizador/psicometria/aiken-ui.js', raiz));
    ({ AnalizadorEstadistico: A } = await import(new URL('src/analizador/estadistica.js', raiz)));
    ({ EtiquetasVariables: EV } = await import(new URL('src/shared/etiquetas-variables.js', raiz)));
    ({ ProtocoloBusqueda: Protocolo } = await import(new URL('src/buscador/protocolo.js', raiz)));
    ({ PrismaDiagrama: Prisma } = await import(new URL('src/buscador/prisma.js', raiz)));
});

/** Una configuración pequeña del Simulador, como la escribiría el usuario: un test con dos dimensiones y el sexo. */
function configurarSimulador() {
    q('#tamanoMuestra').value = '120';
    q('#semilla').value = '17';
    pruebas.agregarFilaTestConDatos({ prueba: 'EAR', variable: 'Autoestima', dimensiones: ['Social', 'Académica'], rIntra: '0.4' });
    pruebas.sincronizarDimensionesDesdeTests();
    for (const fila of qa('#bodyPruebas .fila-prueba')) {
        for (const [et, v] of [['Número de ítems', '5'], ['Media (M)', '15'], ['Desviación estándar (DE)', '4'], ['Mínimo por ítem', '1'], ['Máximo por ítem', '5'], ['Alfa de Cronbach objetivo', '0.8'], ['Ítems invertidos', '0']]) poner(campo(fila, et), v);
    }
    socios.agregarFilaSocioConDatos({ categoria: 'Sexo', distribucion: 'binaria', promedio: '0.5', de: '', min: '', max: '', decimales: '0', opciones: 'Femenino, Masculino' });
}

/** Los bits de cada columna de una base. */
const bitsDe = base => base.columnas.map(c => [c.nombre, Buffer.from(c.datos.buffer, c.datos.byteOffset, c.datos.byteLength).toString('base64'), JSON.stringify(c.etiquetas || null), c.formato || null]);

test('guardar el proyecto, borrarlo todo y abrirlo: cada sección vuelve como estaba', async () => {
    // 1) el trabajo: Simulador configurado y generado, sus datos en el Analizador, Aiken, Redactor y Buscador
    configurarSimulador();
    motor.generarBaseDatos();
    await esperar(() => globalThis.generadorDatos.datosGenerados && globalThis.generadorDatos.datosGenerados.n === 120 && !q('#btnGenerar').disabled);
    await new Promise(r => setTimeout(r, 50));
    const g = globalThis.generadorDatos;
    const bitsAntes = bitsDe(g.datosGenerados);
    const maestroAntes = maestro.textoMaestro().texto;
    const informeAntes = JSON.stringify(resultado.ultimoInforme);
    carga.cargarDatosGenerados();
    const datosAntes = structuredClone(A.obtenerDatos());
    const etiquetasAntes = { ...EV._mapa };
    assert.ok(Object.keys(etiquetasAntes).length > 0);
    const textarea = q('#validezContenidoContainer textarea');
    assert.ok(textarea, 'la tarjeta de la V de Aiken está montada');
    textarea.value = '4 3 4\n3 4 4\n4 4 3';
    env.disparar(textarea, 'input');
    localStorage.setItem('statsim_redactor_ultimo', JSON.stringify(REDACCION));
    Protocolo.limpiar(); Prisma.reiniciar();
    Protocolo.registrar({ fuente: 'Scopus', ecuacion: '"self-esteem" AND performance', filtros: 'Años 2020–2025', resultados: 143 });
    Prisma.registrar('identificados', { fuente: 'Scopus', n: 143 });
    Prisma.registrar('incluidos', { n: 12 });

    // 2) guardar
    const antes = env.descargas.length;
    q('#btnGuardarProyecto').click();
    await esperar(() => env.descargas.length > antes && /^Proyecto guardado|No se pudo/.test(toast().texto));
    assert.match(toast().texto, /^Proyecto guardado: la configuración del Simulador \(2 escala\(s\) y \d+ variable\(s\) sociodemográfica\(s\)\) y la base generada \(n = 120, \d+ columnas\), los datos del Analizador \(120 casos y \d+ variables, del Simulador\), la tabla de la V de Aiken \(\d criterio\(s\)\), la última redacción del Redactor \(1 secciones\) y el protocolo de búsqueda \(1 ecuación\(es\)\) y el flujo PRISMA\. Ábrelo otro día con «Abrir proyecto»$/);
    const blob = env.descargas[env.descargas.length - 1];
    assert.equal(blob.type, 'application/zip');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const { manifiesto } = await paquete.leerProyecto(bytes);
    assert.deepEqual(manifiesto.secciones.map(s => s.seccion), ['simulador', 'analizador', 'aiken', 'redactor', 'buscador']);
    assert.ok(!new TextDecoder().decode(bytes).includes('statsim_wos_clave'), 'sin la clave de Web of Science');

    // 3) borrarlo todo
    for (const id of ['bodyTests', 'bodyPruebas', 'bodySocio']) q('#' + id).innerHTML = '';
    g.datosGenerados = null;
    await carga.cargarArchivo({ target: { files: [archivo('otro.csv', new TextEncoder().encode('ID;Z\n1;2\n'))], value: '' } });
    assert.equal(A.obtenerDatos().length, 1);
    q('#validezContenidoContainer textarea').value = '';
    localStorage.removeItem('statsim_redactor_ultimo');
    Protocolo.limpiar(); Prisma.reiniciar();
    assert.equal(maestro.textoMaestro(), null);

    // 4) abrir
    const entrada = q('#archivoProyecto');
    Object.defineProperty(entrada, 'files', { value: [archivo('proyecto_statsim.statsim', bytes)], configurable: true });
    env.disparar(entrada, 'change');
    await esperar(() => /^Proyecto abierto|No se pudo|reemplazará/.test(toast().texto) || toast().tipo.includes('error'));
    assert.match(toast().texto, /^Proyecto abierto: la configuración del Simulador y la base generada \(n = 120\), los datos del Analizador \(120 casos\), la tabla de la V de Aiken \(\d criterio\(s\)\), la última redacción del Redactor \(1 secciones\) y el protocolo de búsqueda y el flujo PRISMA$/);
    assert.match(toast().tipo, /success/);
    // el Simulador: las tablas, con el mismo maestro; la base, bit a bit; el informe y las descargas
    assert.equal(maestro.textoMaestro().texto, maestroAntes);
    assert.deepEqual(bitsDe(g.datosGenerados), bitsAntes);
    assert.equal(JSON.stringify(resultado.ultimoInforme), informeAntes);
    assert.equal(q('#btnDescargarXLSX').disabled, false);
    assert.equal(q('#btnUsarGenerados').disabled, false);
    // el Analizador: los mismos datos y etiquetas, con el editor del Simulador
    assert.deepEqual(A.obtenerDatos(), datosAntes);
    assert.deepEqual(EV._mapa, etiquetasAntes);
    assert.match(q('#editorEtiquetas').textContent, /Datos del Simulador/);
    assert.equal(q('#analisisN').textContent, '120');
    // Aiken, Redactor y Buscador
    assert.equal(q('#validezContenidoContainer textarea').value, '4 3 4\n3 4 4\n4 4 3');
    assert.deepEqual(JSON.parse(localStorage.getItem('statsim_redactor_ultimo')).secciones, REDACCION.secciones);
    assert.match(q('#redResultado') ? q('#redResultado').textContent : 'AUTOESTIMA', /AUTOESTIMA/);
    assert.equal(Protocolo.estadoActual().consultas.length, 1);
    assert.equal(Protocolo.estadoActual().consultas[0].resultados, 143);
    assert.deepEqual(Prisma._datos.identificados, { Scopus: 143 });
    assert.equal(Prisma._datos.incluidos, 12);
});

test('lo que no es un proyecto, o uno de una versión más nueva: un error claro, y nada cambia', async () => {
    const datos = A.obtenerDatos();
    await proyecto.abrirProyecto(archivo('base.csv', new TextEncoder().encode('ID;X\n1;2\n')));
    assert.match(toast().texto, /^No es un proyecto de StatSim Pro \(\.statsim\)/);
    assert.match(toast().tipo, /error/);
    const { escribirZip, unirTrozos } = await import(new URL('src/core/data/zip/escritor.js', raiz));
    const nuevo = unirTrozos(await escribirZip([{ nombre: 'proyecto.json', contenido: JSON.stringify({ formato: paquete.FORMATO_PROYECTO, versionFormato: 9, version: '2030.01.01', secciones: [] }) }]));
    await proyecto.abrirProyecto(archivo('futuro.statsim', nuevo));
    assert.match(toast().texto, /lo guardó una versión más nueva de StatSim Pro \(2030\.01\.01\)/);
    assert.equal(A.obtenerDatos(), datos, 'los datos del Analizador siguen');
    // un proyecto con una sección dañada: las demás se restauran y se avisa
    const partes = [
        { seccion: 'analizador', titulo: 'el Analizador', resumen: '', archivos: { 'datos.json': '{"columnas":["a"],"valores":[[1,2]]}' } },
        { seccion: 'aiken', titulo: 'la V de Aiken', resumen: '', archivos: { 'aiken.json': '{"roto": true}' } },
        { seccion: 'desconocida', titulo: 'algo nuevo', resumen: '', archivos: { 'x.txt': 'x' } }
    ];
    const mixto = unirTrozos(await paquete.escribirProyecto(partes, { version: 'x' }));
    await proyecto.abrirProyecto(archivo('mixto.statsim', mixto));
    assert.match(toast().texto, /^Proyecto abierto: los datos del Analizador \(2 casos\)\. Ten en cuenta: trae «algo nuevo», que esta versión no sabe abrir; la V de Aiken no se pudo restaurar \(la tabla guardada no tiene la forma esperada\)\.$/);
    assert.deepEqual(A.obtenerDatos(), [{ a: 1 }, { a: 2 }]);
    // y si se cancela la confirmación, nada cambia
    const confirmar = globalThis.confirm;
    globalThis.confirm = () => false;
    try {
        await proyecto.abrirProyecto(archivo('mixto.statsim', unirTrozos(await paquete.escribirProyecto([{ seccion: 'analizador', titulo: 'el Analizador', resumen: '', archivos: { 'datos.json': '{"columnas":["b"],"valores":[[9]]}' } }], { version: 'x' }))));
        assert.deepEqual(A.obtenerDatos(), [{ a: 1 }, { a: 2 }]);
    } finally { globalThis.confirm = confirmar; }
});

test('un proyecto ajeno con HTML en el protocolo o en el flujo PRISMA no lo mete en la página', async () => {
    const IMG = '<img src="x" id="inyectada">';
    const consulta = { fuente: 'Scopus' + IMG, ecuacion: '"autoestima" AND PUBYEAR > 2019 ' + IMG, filtros: 'Años ' + IMG, resultados: 5, nota: 'variante ' + IMG, fecha: '2026-10-01T10:00:00Z', veces: 2, extra: IMG };
    const protocolo = { iniciada: '2026-10-01T10:00:00Z', ultimaActividad: '2026-10-02T10:00:00Z', consultas: [consulta] };
    const prisma = { identificados: { ['Scopus' + IMG]: 5, __proto__x: 1 }, duplicados: 1, cribados: 4, excluidos: 1, motivoExclusion: 'relevancia < 3 ' + IMG, incluidos: 3 };
    const proyectoDe = async archivos => unirTrozos(await paquete.escribirProyecto([{ seccion: 'buscador', titulo: 'el Buscador' + IMG, resumen: IMG, archivos }], { version: 'x' }));
    const { unirTrozos } = await import(new URL('src/core/data/zip/escritor.js', raiz));
    await proyecto.abrirProyecto(archivo('compartido.statsim', await proyectoDe({ 'protocolo.json': JSON.stringify(protocolo), 'prisma.json': JSON.stringify(prisma) })));
    assert.equal(toast().texto, 'Proyecto abierto: el protocolo de búsqueda y el flujo PRISMA');
    // el registro, con sus campos y nada más (la ecuación, literal: «>» incluido)
    assert.deepEqual(Protocolo.estadoActual().consultas, [{ fuente: consulta.fuente, ecuacion: consulta.ecuacion.trim(), filtros: consulta.filtros, resultados: 5, nota: consulta.nota, fecha: consulta.fecha, veces: 2 }]);
    // la ficha, el diagrama y el Word: el HTML, como texto
    let caja = q('#antProtocolo');
    if (!caja) { caja = globalThis.document.createElement('div'); caja.id = 'antProtocolo'; globalThis.document.body.appendChild(caja); }
    Protocolo.mostrarFicha('antProtocolo');
    Prisma.mostrar();
    assert.equal(qa('#inyectada').length, 0, 'ninguna etiqueta inyectada');
    assert.ok(caja.textContent.includes('Scopus' + IMG), 'el nombre de la fuente, como texto');
    assert.ok(q('#prismaLienzo').textContent.includes('Scopus' + IMG));
    assert.ok(!Protocolo.wordHTML().includes(IMG) && Protocolo.wordHTML().includes('Scopus&lt;img'));
    // y tras recargar, lo que quedó en la sesión se acepta igual (y se pinta igual de escapado)
    assert.ok(Protocolo.validarEstado(JSON.parse(sessionStorage.getItem('statsim_protocolo_busqueda_v1'))));
    assert.ok(Prisma.validar(JSON.parse(sessionStorage.getItem('statsim_prisma_flujo_v1'))));

    // un contador que no es un número (o un campo de otro tipo): la sección entera se rechaza, y nada cambia
    const antes = JSON.stringify([Protocolo.estadoActual(), Prisma._datos]);
    const malos = [
        { 'protocolo.json': JSON.stringify(protocolo), 'prisma.json': JSON.stringify({ ...prisma, duplicados: IMG }) },
        { 'protocolo.json': JSON.stringify({ ...protocolo, consultas: [{ ...consulta, resultados: IMG }] }), 'prisma.json': JSON.stringify(prisma) },
        { 'protocolo.json': JSON.stringify({ ...protocolo, consultas: [{ ...consulta, veces: '2' }] }) },
        { 'prisma.json': JSON.stringify({ ...prisma, identificados: { Scopus: '5' } }) },
        { 'prisma.json': '{"identificados": ' }
    ];
    const mensajes = [];
    for (const archivos of malos) {
        await proyecto.abrirProyecto(archivo('manipulado.statsim', await proyectoDe(archivos)));
        assert.match(toast().tipo, /error/);
        mensajes.push(toast().texto);
        assert.equal(JSON.stringify([Protocolo.estadoActual(), Prisma._datos]), antes, 'nada cambió');
    }
    // (el título de la sección es el del programa, no el que dice el manifiesto)
    assert.deepEqual(mensajes.map(m => m.replace(/^No se pudo abrir el proyecto: el Buscador no se pudo restaurar \((.*)\)$/, '$1')), [
        'el flujo PRISMA guardado no tiene la forma esperada («prisma.json»)',
        'el protocolo de búsqueda guardado no tiene la forma esperada («protocolo.json»)',
        'el protocolo de búsqueda guardado no tiene la forma esperada («protocolo.json»)',
        'el flujo PRISMA guardado no tiene la forma esperada («prisma.json»)',
        'el flujo PRISMA guardado no es JSON válido («prisma.json»)'
    ]);
    assert.equal(qa('#inyectada').length, 0);

    // un proyecto con el protocolo y sin flujo PRISMA: el flujo queda vacío, como estaba al guardarlo
    await proyecto.abrirProyecto(archivo('solo_protocolo.statsim', await proyectoDe({ 'protocolo.json': JSON.stringify(protocolo) })));
    assert.equal(toast().texto, 'Proyecto abierto: el protocolo de búsqueda');
    assert.deepEqual(Prisma._datos.identificados, {});
    assert.match(q('#prismaLienzo').textContent, /Registros identificados \(n = 0\)/, 'el diagrama a la vista, con los números de ahora');
});

test('el Simulador con una escala de acierto/error se guarda y se abre; un proyecto sin base deja el Simulador sin base', async () => {
    // (2026.12.31, revisión) la configuración expandida de una escala de acierto/error lleva una función (la forma del
    // total): el proyecto no se podía guardar
    const g = globalThis.generadorDatos;
    const sim = await import(new URL('src/simulador/ui/proyecto.js', raiz));
    g.configuracion = {
        tamanoMuestra: 60, semilla: 3, generarPercentiles: false, correlacionesExactas: true, indiceFiabilidad: 'alfa', heterogeneidadItems: 'leve', variablesPorTest: {},
        pruebas: [{ nombre: 'Aptitud', nombreCorto: 'AP', prueba: 'Examen', tipo: 'dimension', numItems: 10, media: 6, desviacion: 1, alfa: 0.75, minimo: 0, maximo: 1, distribucion: 'normal', invertidos: 0, dificultades: null }],
        sociodemograficos: [], correlaciones: [], diferenciasGrupo: [], modelos: [], medidasRepetidas: [], estructuras: [], desenlaces: [], cortes: [], concordancias: [], realismo: {}
    };
    g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas);
    const base = g.generarBaseDatos();
    assert.equal(typeof g.configuracion.pruebas[0].formaTotal, 'function');
    motor.mostrarResultadoGeneracion({ base, informe: g.informePedidoObtenido(base), configuracion: g.configuracion, diagnosticoCorrelaciones: g.diagnosticoCorrelaciones, resumenImperfecciones: g.resumenImperfecciones, diferenciasLimitadas: [] });
    const capturado = sim.capturarSimuladorParaProyecto();
    assert.ok(capturado && capturado.archivos['generacion.json'], 'se guarda');
    const bytes = new Map(Object.entries(capturado.archivos).map(([k, v]) => [k, typeof v === 'string' ? new TextEncoder().encode(v) : v]));
    g.datosGenerados = null;
    assert.match(sim.restaurarSimuladorDeProyecto(bytes), /la base generada \(n = 60\)/);
    assert.equal(g.datosGenerados.n, 60);
    assert.deepEqual(Object.keys(g.obtenerEtiquetas()).filter(c => /^AP\d+$/.test(c)).length, 10);
    assert.equal(q('#btnDescargarXLSX').disabled, false);
    // un proyecto sin base (el Simulador se guardó sin generar): la base anterior ya no está ni se descarga
    assert.equal(sim.restaurarSimuladorDeProyecto(new Map()), 'nada del Simulador');
    assert.equal(g.datosGenerados, null);
    for (const id of ['btnDescargarCSV', 'btnDescargarSAV', 'btnDescargarXLSX', 'btnUsarGenerados']) assert.equal(q('#' + id).disabled, true, id);
    assert.equal(q('#previewContainer').style.display, 'none');
});

test('un proyecto ajeno que haría trabajar sin fin a la página: se rechaza o se abre enseguida', async () => {
    // (2026.12.31, segunda revisión) la sigla de una dimensión entraba sin escapar en una expresión regular: «(a+)+» contra
    // una columna de 40 «a» colgaba la pestaña (retroceso exponencial)
    const { unirTrozos } = await import(new URL('src/core/data/zip/escritor.js', raiz));
    const largo = 'a'.repeat(40);
    const datos = { columnas: ['ID', largo, 'x1', 'x2', 'x3'], valores: [[1, 2, 3], [4, 5, 6], [1, 2, 2], [3, 3, 4], [5, 4, 4]] };
    const estructura = [{ prueba: 'T', variable: 'X', columnaGeneral: 'General_X', etiquetaGeneral: 'X', siglaGeneral: null, unidimensional: false, dimensiones: [{ columna: 'Dimension_X', etiqueta: 'X', sigla: '(a+)+' }] }];
    const proyectoDe = async archivos => unirTrozos(await paquete.escribirProyecto([{ seccion: 'analizador', titulo: 'el Analizador', resumen: '', archivos }], { version: 'x' }));
    let t0 = Date.now();
    await proyecto.abrirProyecto(archivo('redos.statsim', await proyectoDe({ 'datos.json': JSON.stringify(datos), 'etiquetas.json': JSON.stringify({ etiquetas: { x1: 'Ítem 1' }, estructura, origen: { tipo: 'simulador' } }) })));
    assert.equal(toast().texto, 'Proyecto abierto: los datos del Analizador (3 casos)');
    assert.ok(Date.now() - t0 < 5000, `${Date.now() - t0} ms`);
    // una estructura o unas etiquetas que no tienen la forma que se guarda: la sección se rechaza
    for (const [meta, que] of [[{ etiquetas: {}, estructura: [{ dimensiones: [{ sigla: { toString: 1 } }] }] }, 'la estructura de pruebas'], [{ etiquetas: { x1: 7 }, estructura: [] }, 'las etiquetas'], [{ etiquetas: [], estructura: [] }, 'las etiquetas']]) {
        await proyecto.abrirProyecto(archivo('mal.statsim', await proyectoDe({ 'datos.json': JSON.stringify(datos), 'etiquetas.json': JSON.stringify(meta) })));
        assert.match(toast().texto, new RegExp(`^No se pudo abrir el proyecto: el Analizador no se pudo restaurar \\(${que} guardad[ao]s? \\(«etiquetas\\.json»\\) no tiene`));
    }
    // unos pocos KB de ceros comprimidos que dicen ser 21 millones de valores: ni se leen (antes, la pestaña se caía)
    t0 = Date.now();
    const ceros = `{"columnas":["x"],"valores":[[${'0,'.repeat(21000000)}0]]}`;
    const comprimido = await proyectoDe({ 'datos.json': ceros });
    assert.ok(comprimido.length < 200000, `${comprimido.length} bytes`);
    await proyecto.abrirProyecto(archivo('ceros.statsim', comprimido));
    assert.match(toast().texto, /^No se pudo abrir el proyecto: el Analizador no se pudo restaurar \(los datos guardados \(«datos\.json»\) traen más de 20\.000\.000 valores/);
    assert.ok(Date.now() - t0 < 20000, `${Date.now() - t0} ms`);
    // el maestro de un proyecto con más escalas de las que admite una tabla: nada cambia
    const { MAXIMO_FILAS_MAESTRO } = await import(new URL('src/simulador/ui/maestro.js', raiz));
    const antes = qa('#bodyPruebas .fila-prueba').length;
    const enorme = ['###GENERAL###', 'Campo,Valor', '###TESTS###', 'Prueba,Variable,CorrDimensiones,Dimensiones', '###PRUEBAS###', 'Prueba,Escala,NumItems,Distribucion,Media,DE,MinItem,MaxItem,Alfa,Invertidos,Dificultades',
        ...Array.from({ length: MAXIMO_FILAS_MAESTRO + 1 }, (_, k) => `T,Escala ${k},5,normal,15,4,1,5,0.8,0,`)].join('\n');
    const sim = await import(new URL('src/simulador/ui/proyecto.js', raiz));
    assert.throws(() => sim.restaurarSimuladorDeProyecto(new Map([['configuracion.csv', new TextEncoder().encode(enorme)]])), /^Error: La configuración trae 5001 filas de escalas: el Simulador admite hasta 5000 por tabla$/);
    assert.equal(qa('#bodyPruebas .fila-prueba').length, antes, 'las tablas, sin tocar');
});

test('(cuarta revisión) los JSON de un proyecto ajeno, medidos antes de leerlos: anidados o desmedidos, se rechazan enseguida', async () => {
    // antes, JSON.parse construía todo antes de comprobar nada: 10⁸ listas anidadas (190 KB comprimidos) tumbaban la
    // pestaña, y una estructura de 25 millones de dimensiones (98 KB) la congelaba 5 s antes de que la rechazara
    const { unirTrozos, escribirZip } = await import(new URL('src/core/data/zip/escritor.js', raiz));
    const { baseAArchivos } = await import(new URL('src/core/data/base-archivos.js', raiz));
    const { BaseColumnar } = await import(new URL('src/core/data/base-columnar.js', raiz));
    const anidado = '['.repeat(2000000) + ']'.repeat(2000000);
    const de = async (seccion, titulo, archivos) => archivo(`${seccion}.statsim`, unirTrozos(await paquete.escribirProyecto([{ seccion, titulo, resumen: '', archivos }], { version: 'x' })));
    const base = new BaseColumnar(3);
    const x = base.agregar('X', false);
    x.datos.set([1, 2, 3]);
    const conBase = baseAArchivos(base, 'base');
    const casos = [
        ['analizador', 'el Analizador', { 'datos.json': '{"columnas":["x"],"valores":[[1,2]]}', 'etiquetas.json': `{"etiquetas":{},"estructura":${anidado}}` }, 'las etiquetas guardadas («etiquetas.json») no tienen la forma esperada'],
        ['analizador', 'el Analizador', { 'datos.json': '{"columnas":["x"],"valores":[[1,2]]}', 'etiquetas.json': '{"etiquetas":{},"estructura":[{"dimensiones":[' + '{},'.repeat(2000000) + '{}]}]}' }, 'las etiquetas guardadas («etiquetas.json») no tienen la forma esperada'],
        ['analizador', 'el Analizador', { 'datos.json': `{"columnas":["x"],"valores":[${anidado}]}` }, 'los datos guardados («datos.json») no tienen la forma esperada'],
        ['aiken', 'la V de Aiken', { 'aiken.json': anidado }, 'la tabla guardada no tiene la forma esperada'],
        ['redactor', 'el Redactor', { 'redaccion.json': anidado }, 'la redacción guardada no tiene la forma esperada'],
        ['buscador', 'el Buscador', { 'protocolo.json': anidado }, 'el protocolo de búsqueda guardado no tiene la forma esperada («protocolo.json»)'],
        ['simulador', 'el Simulador', { 'base.json': anidado }, 'el índice de la base («base.json») no tiene la forma esperada'],
        ['simulador', 'el Simulador', { ...conBase, 'generacion.json': anidado }, 'la generación guardada no tiene la forma esperada («generacion.json»)']
    ];
    const t0 = Date.now();
    for (const [seccion, titulo, archivos, mensaje] of casos) {
        await proyecto.abrirProyecto(await de(seccion, titulo, archivos));
        assert.equal(toast().texto, `No se pudo abrir el proyecto: ${titulo} no se pudo restaurar (${mensaje})`, `${seccion}: ${Object.keys(archivos).join(', ')}`);
    }
    // y el manifiesto
    await proyecto.abrirProyecto(archivo('manifiesto.statsim', unirTrozos(await escribirZip([{ nombre: 'proyecto.json', contenido: `{"formato":"StatSim Pro — proyecto","secciones":${anidado}}` }]))));
    assert.equal(toast().texto, 'El proyecto está dañado: su manifiesto no tiene la forma esperada');
    assert.ok(Date.now() - t0 < 20000, `${Date.now() - t0} ms`);
});

test('la redacción abierta de un proyecto admite el pase de coherencia (F3), y su botón no queda bloqueado', async () => {
    // (2026.12.31, segunda revisión) la redacción recuperada no tenía «meta» y el pase F3 fallaba en su último paso
    const { unirTrozos } = await import(new URL('src/core/data/zip/escritor.js', raiz));
    const { RedactorTeorico: R } = await import(new URL('src/redactor/redactor/index.js', raiz));
    const tren = 'Pérez (2019) halló una relación positiva entre las variables en universitarios. García (2020) obtuvo resultados similares en adolescentes de Lima. Rojas (2021) confirmó el patrón con una muestra amplia. Torres (2022) replicó el hallazgo en otra región del país.';
    const redaccion = { t: Date.now(), problema: '¿Cómo se relaciona la autoestima con el rendimiento?', secciones: [{ titulo: 'Antecedentes', capitulo: 'II', texto: tren }], fuentes: [], citadasIdx: [] };
    await proyecto.abrirProyecto(archivo('propio.statsim', unirTrozos(await paquete.escribirProyecto([{ seccion: 'redactor', titulo: 'el Redactor', resumen: '', archivos: { 'redaccion.json': JSON.stringify(redaccion) } }], { version: 'x' }))));
    assert.equal(toast().texto, 'Proyecto abierto: la última redacción del Redactor (1 secciones)');
    assert.ok(R._objetivosF3().length > 0, 'hay algo que pulir');
    await R._onPaseF3();   // sin red: el modelo no responde y el pase lo cuenta
    assert.ok(R._documento.meta && R._documento.meta.f3, 'el pase quedó anotado');
    const boton = q('#redPaseF3');
    if (boton) { assert.equal(boton.disabled, false); assert.match(boton.textContent, /Pase de coherencia \(F3\)/); }
    assert.match(q('#redEstado').textContent, /Pase de coherencia F3 completado/);
});

test('guardar sin nada que guardar avisa, y no descarga', async () => {
    // el estado vacío de cada sección
    for (const id of ['bodyTests', 'bodyPruebas', 'bodySocio', 'bodyCorrelaciones']) q('#' + id).innerHTML = '';
    globalThis.generadorDatos.datosGenerados = null;
    A.datos = null;   // el Analizador sin datos, como al abrir la página
    q('#validezContenidoContainer textarea').value = '';
    localStorage.removeItem('statsim_redactor_ultimo');
    const { RedactorTeorico } = await import(new URL('src/redactor/redactor/index.js', raiz));
    RedactorTeorico._documento = null;   // la redacción en pantalla también se guardaría
    Protocolo.limpiar(); Prisma.reiniciar();
    const antes = env.descargas.length;
    await proyecto.guardarProyecto();
    assert.equal(toast().texto, 'Aún no hay nada que guardar: configura el Simulador, genera una base o carga datos en el Analizador');
    assert.equal(env.descargas.length, antes);
});
