// tests/unit/generacion-guardada.test.js — (2026.12.31, revisión) lo que un proyecto guarda de una generación del Simulador
// y su comprobación al abrirlo (simulador/dominio/generacion-guardada.js): una generación real, con escalas de acierto/error
// y asimétricas (cuya configuración expandida lleva funciones), se guarda y se abre con las mismas etiquetas y estructura;
// una manipulada (un número de ítems desmedido o que no cabe en la base, textos donde van números, listas desmedidas,
// anidamientos sin fin, una configuración sin escalas o con la que las etiquetas fallan) se rechaza con un mensaje,
// enseguida y sin tocar el generador.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeneradorDatos } from '../../src/simulador/dominio/generador.js';
import { aJsonFiel, deJsonFiel } from '../../src/core/data/json-fiel.js';
import { comprobarGeneracionGuardada, generacionParaGuardar, LIMITES_GENERACION_GUARDADA, TOPES_JSON_GENERACION } from '../../src/simulador/dominio/generacion-guardada.js';
import { excesoDeJson, medirJson } from '../../src/core/data/json-acotado.js';

const escala = (nombre, corto, prueba, extra = {}) => ({ nombre, nombreCorto: corto, prueba, tipo: 'dimension', numItems: 6, media: 18, desviacion: 4, alfa: 0.8, minimo: 1, maximo: 5, distribucion: 'normal', invertidos: 1, ...extra });

/** Un generador con una base generada: una escala normal, una asimétrica, una de acierto/error, jueces y un corte. */
function generado() {
    const g = new GeneradorDatos();
    g.configuracion = {
        tamanoMuestra: 80, semilla: 11, generarPercentiles: true, correlacionesExactas: true, indiceFiabilidad: 'alfa', heterogeneidadItems: 'leve',
        variablesPorTest: { T: { variable: 'Bienestar', rIntra: 0.4 } },
        pruebas: [escala('Ánimo', 'AN', 'T'), escala('Calma', 'CA', 'T', { distribucion: 'asimetrica', asimetria: 0.8 }),
            { nombre: 'Aptitud', nombreCorto: 'AP', prueba: 'Examen', tipo: 'dimension', numItems: 10, media: 6, desviacion: 1, alfa: 0.75, minimo: 0, maximo: 1, distribucion: 'normal', invertidos: 0, dificultades: null }],
        sociodemograficos: [{ categoria: 'Sexo', categoriaCorta: 'S', distribucion: 'binaria', promedio: 0.5, desviacion: 1, minimo: null, maximo: null, decimales: 0, niveles: [{ codigo: 0, etiqueta: 'Femenino', proporcion: 0.5 }, { codigo: 1, etiqueta: 'Masculino', proporcion: 0.5 }] }],
        correlaciones: [{ a: 'Ánimo', b: 'Calma', r: 0.3 }], diferenciasGrupo: [], modelos: [], medidasRepetidas: [], estructuras: [], desenlaces: [],
        cortes: [{ variable: 'Ánimo', etiquetas: ['Bajo', 'Alto'], cortes: [18], porPercentil: false }],
        concordancias: [{ tipo: 'jueces', variable: 'Ánimo', jueces: 3, kappa: 0.6, icc: null }], realismo: {}
    };
    g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas);
    const base = g.generarBaseDatos();
    return { g, base, informe: g.informePedidoObtenido(base) };
}

/** ¿Hay alguna función dentro? @param {unknown} v */
function conFunciones(v, vistos = new Set()) {
    if (typeof v === 'function') return true;
    if (!v || typeof v !== 'object' || vistos.has(v)) return false;
    vistos.add(v);
    return Object.values(v).some(x => conFunciones(x, vistos));
}

test('una generación real se guarda sin funciones y se abre con las mismas etiquetas y estructura', () => {
    const { g, base, informe } = generado();
    assert.ok(conFunciones(g.configuracion), 'la configuración expandida lleva la forma del total como función');
    const guardar = generacionParaGuardar(g, informe);
    assert.equal(conFunciones(guardar), false);
    assert.equal(conFunciones(g.configuracion), true, 'la del generador no cambia');
    const abierta = comprobarGeneracionGuardada(deJsonFiel(aJsonFiel(guardar)), new GeneradorDatos(), base.columnas.length);
    const otra = new GeneradorDatos();
    otra.configuracion = abierta.configuracion;
    assert.deepEqual(otra.obtenerEtiquetas(), g.obtenerEtiquetas());
    assert.deepEqual(otra.obtenerEstructuraEscalas(), g.obtenerEstructuraEscalas());
    assert.deepEqual(abierta.informe, informe);
});

test('una generación manipulada se rechaza enseguida, con un mensaje, y el generador no cambia', () => {
    const { g, base, informe } = generado();
    const columnas = base.columnas.length;
    const buena = () => deJsonFiel(aJsonFiel(generacionParaGuardar(g, informe)));
    const pagina = new GeneradorDatos();
    pagina.configuracion = { pruebas: [], tamanoMuestra: 5 };
    const clavesAntes = Object.keys(pagina).sort().join();
    const configuracionAntes = pagina.configuracion;
    const anidado = (n) => { let v = 1; for (let k = 0; k < n; k++) v = [v]; return v; };
    const casos = [
        [x => { x.configuracion.pruebas[0].numItems = 1e9; }, /^Error: la configuración con que se generó la base no tiene la forma esperada \(«generacion\.json»\)$/],
        [x => { x.configuracion.pruebas[0].numItems = '1000000000'; }, /la configuración con que se generó la base no tiene la forma esperada/],
        [x => { x.configuracion.pruebas[0].nombre = { toString: 1 }; }, /la configuración con que se generó la base/],
        [x => { x.configuracion.concordancias[0].jueces = 1e6; }, /la configuración con que se generó la base/],
        [x => { x.configuracion.pruebas = 'muchas'; }, /la configuración con que se generó la base/],
        [x => { x.configuracion.pruebas = Array.from({ length: LIMITES_GENERACION_GUARDADA.escalas + 1 }, (_, k) => escala(`E${k}`, `E${k}`, 'T')); }, /la configuración con que se generó la base/],
        [x => { x.configuracion = null; }, /la configuración con que se generó la base/],
        // sin escalas (la vista previa las cuenta: antes, la base quedaba a medias en la página)
        [x => { delete x.configuracion.pruebas; }, /la configuración con que se generó la base/],
        [x => { x.configuracion = {}; }, /la configuración con que se generó la base/],
        // más ítems, escalas o jueces de los que caben en la base (antes, 300 escalas de 10 000 ítems: 19 s de etiquetas)
        [x => { x.configuracion.pruebas[0].numItems = columnas + 1; }, /la configuración con que se generó la base/],
        [x => { x.configuracion.pruebas = Array.from({ length: 300 }, (_, k) => escala(`E${k}`, `E${k}`, 'T', { numItems: 10000 })); }, /la configuración con que se generó la base/],
        [x => { x.configuracion.concordancias = [{ tipo: 'jueces', variable: 'Ánimo', jueces: 100 }]; }, /la configuración con que se generó la base/],
        // con la que las etiquetas fallan (un desenlace sin predictores): el ensayo lo atrapa
        [x => { x.configuracion.desenlaces = [{ nombre: 'Beca', tipo: 'binario', prevalencia: 0.3 }]; }, /la configuración con que se generó la base/],
        [x => { x.informe = [{ tipo: 'α', variable: { a: 1 }, pedido: 1, obtenido: 1, ok: true }]; }, /^Error: el informe «pedido vs\. obtenido» guardado no tiene la forma esperada \(«generacion\.json»\)$/],
        [x => { x.informe = [{ tipo: 'α', variable: 'X', pedido: 1, obtenido: 1, ok: 'sí' }]; }, /el informe «pedido vs\. obtenido» guardado/],
        [x => { x.informe = 'nada'; }, /el informe «pedido vs\. obtenido» guardado/],
        [x => { x.diagnosticoCorrelaciones = { imposible: true, triadas: [{ variables: ['A', 'B', 'C'], correlaciones: ['<img>'] }] }; }, /^Error: el diagnóstico de correlaciones guardado no tiene la forma esperada/],
        [x => { x.diagnosticoCorrelaciones = { limitadas: [{ a: 'A', b: 'B', pedido: 0.5, alcanzable: '0.3' }] }; }, /el diagnóstico de correlaciones guardado/],
        [x => { x.diagnosticoCorrelaciones = { calibracion: { convergio: false, error: null } }; }, /el diagnóstico de correlaciones guardado/],
        [x => { x.resumenImperfecciones = 7; }, /el resumen de las imperfecciones guardado/],
        [x => { x.diferenciasLimitadas = [1, 2]; }, /la lista de diferencias por grupo limitadas guardada/],
        [x => { x.configuracion.extra = anidado(LIMITES_GENERACION_GUARDADA.profundidad + 5); }, /^Error: la generación guardada no tiene la forma esperada/],
        [x => { x.configuracion.extra = 'x'.repeat(LIMITES_GENERACION_GUARDADA.texto + 1); }, /la generación guardada no tiene la forma esperada/],
        [() => 'no es un objeto', /la generación guardada no tiene la forma esperada/]
    ];
    for (const [cambiar, mensaje] of casos) {
        const x = buena();
        const otra = cambiar(x);
        const t0 = Date.now();
        assert.throws(() => comprobarGeneracionGuardada(otra === undefined ? x : otra, pagina, columnas), mensaje, String(cambiar));
        assert.ok(Date.now() - t0 < 2000, `enseguida: ${cambiar}`);
    }
    assert.equal(pagina.configuracion, configuracionAntes, 'el ensayo no cambia la configuración del generador');
    assert.equal(Object.keys(pagina).sort().join(), clavesAntes, 'ni le añade nada');
    // y la buena, sí
    assert.doesNotThrow(() => comprobarGeneracionGuardada(buena(), pagina, columnas));
    // y con menos columnas de las que tiene su base, no (la configuración no cabría en ella)
    assert.throws(() => comprobarGeneracionGuardada(buena(), pagina, 3), /la configuración con que se generó la base/);
});

test('(quinta revisión) el diagnóstico que se guarda: sin la matriz R y con sus listas acotadas, y una generación real, muy por debajo de los topes', () => {
    // veinte escalas con todas sus correlaciones en −0,6: una matriz imposible con 1140 tríadas en conflicto (con 120, 280 840:
    // el proyecto no se podía volver a abrir) y la matriz R de 20 × 20, que nada usa al abrir (con 3200 escalas, 10 millones
    // de valores)
    const g = new GeneradorDatos();
    const escalas = Array.from({ length: 20 }, (_, k) => escala(`Escala ${k}`, `E${String.fromCharCode(65 + k)}`, `T${k}`, { numItems: 4, media: 12, desviacion: 3, invertidos: 0 }));
    g.configuracion = {
        tamanoMuestra: 40, semilla: 5, generarPercentiles: false, correlacionesExactas: true, indiceFiabilidad: 'alfa', heterogeneidadItems: 'leve', variablesPorTest: {}, pruebas: escalas,
        sociodemograficos: [], correlaciones: escalas.flatMap((a, i) => escalas.slice(i + 1).map(b => ({ a: a.nombre, b: b.nombre, r: -0.6 }))),
        diferenciasGrupo: [], modelos: [], medidasRepetidas: [], estructuras: [], desenlaces: [], cortes: [], concordancias: [], realismo: {}
    };
    g.configuracion.gruposPruebas = g.agruparPruebas(g.configuracion.pruebas);
    const base = g.generarBaseDatos();
    const dg = /** @type {any} */ (g.diagnosticoCorrelaciones);
    assert.ok(dg.imposible && dg.triadas.length === 1140 && Array.isArray(dg.R), 'la generación tiene todo');
    const guardada = /** @type {any} */ (generacionParaGuardar(g, g.informePedidoObtenido(base)));
    assert.equal('R' in guardada.diagnosticoCorrelaciones, false);
    assert.equal(guardada.diagnosticoCorrelaciones.triadas.length, 1000);
    assert.equal(dg.triadas.length, 1140, 'la del generador no cambia');
    const texto = aJsonFiel(guardada);
    assert.equal(excesoDeJson(texto, TOPES_JSON_GENERACION), null);
    assert.doesNotThrow(() => comprobarGeneracionGuardada(deJsonFiel(texto), new GeneradorDatos(), base.columnas.length), 'y se vuelve a abrir');
    // una generación como las de las pruebas: unos pocos contenedores por escala, lejísimos de los topes
    const { g: g2, informe } = generado();
    const m = medirJson(aJsonFiel(generacionParaGuardar(g2, informe)));
    assert.ok(m.contenedores * 100 < TOPES_JSON_GENERACION.contenedores && m.comas * 100 < TOPES_JSON_GENERACION.elementos, JSON.stringify(m));
    // y en el otro sentido: un cuarto de millón de marcas del JSON fiel (cada arreglo tipado, un ArrayBuffer) ni se lee
    // (con los topes de la cuarta revisión, 2 millones cabían: 7 s de pestaña congelada)
    const marca = '{"$statsim":"tipado","tipo":"Uint8Array","base64":"AA=="}';
    assert.equal(excesoDeJson(`{"configuracion":{"pruebas":[],"extra":[${Array.from({ length: 250000 }, () => marca).join(',')}]}}`, TOPES_JSON_GENERACION), 'contenedores');
});
