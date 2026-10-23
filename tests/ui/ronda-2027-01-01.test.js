// @ts-check
// tests/ui/ronda-2027-01-01.test.js — (2027.01.01) lo nuevo y lo corregido de la 2027.01.01 en la interfaz, sobre
// index.html real: imprimir o guardar en PDF (los botones, el encabezado de lo impreso y los estilos de impresión), el
// maestro escrito a mano sin las tablas vacías (el de los ejemplos), la configuración de la base tras un intento fallido de
// generar, el botón del Word tras un análisis que no tiene capítulo y la regresión logística con una dependiente de dos
// categorías con nombre (el desenlace «No / Sí» del Simulador). Y lo que encontró su revisión independiente: los códigos de
// las categorías (el evento es el de código mayor, como en SPSS), lo que el PDF no imprimía (los avisos de las tarjetas, lo
// plegado, el resumen de la fiabilidad cortado, los controles del bootstrap), el capítulo de Word que arrastraba una regresión
// de otro análisis, la regresión bivariada con una dependiente binaria y la configuración durante la generación.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';
import { MAESTRO as MAESTRO_COMPARATIVO } from '../navegador/recetas/02-comparativo.mjs';

const raiz = new URL('../../', import.meta.url);
/** @type {any} */ let env;
/** @type {Record<string, any>} */ const ui = {};
/** @type {any} */ const G = globalThis;
const q = (/** @type {string} */ sel) => env.document.querySelector(sel);
const qa = (/** @type {string} */ sel) => env.document.querySelectorAll(sel);
const toast = () => { const t = env.document.getElementById('toast'); return t ? t.textContent.trim() : ''; };
/** @param {() => any} cond */
const esperar = async (cond, ms = 20000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error('tiempo de espera agotado'); await new Promise(r => setTimeout(r, 25)); } };
let impresiones = 0;

/** La sección a la vista (la que se imprime). @param {string} id */
function activar(id) {
    for (const s of qa('main .section')) s.classList.toggle('active', s.id === id);
}
/** Lo que dice el encabezado de lo impreso: su título y sus líneas. */
function encabezadoImpreso() {
    const e = qa('.encabezado-impresion');
    if (!e.length) return null;
    assert.equal(e.length, 1, 'un solo encabezado');
    return { seccion: e[0].closest('.section').id, titulo: e[0].querySelector('h1').textContent, lineas: e[0].querySelectorAll('p').map((/** @type {any} */ p) => p.textContent) };
}
const imprimir = () => G.dispatchEvent(new G.Event('beforeprint'));
const terminarDeImprimir = () => G.dispatchEvent(new G.Event('afterprint'));
async function generarYEsperar() {
    G.generadorDatos.datosGenerados = null;
    ui.motor.generarBaseDatos();
    await esperar(() => !q('#btnGenerar').disabled && G.generadorDatos.datosGenerados && G.generadorDatos.datosGenerados.n > 0);
    await new Promise(r => setTimeout(r, 60));
}
/**
 * Ejecuta un análisis del Analizador con sus variables (y las adicionales de la correlación).
 * @param {string} tipo @param {string} var1 @param {string} var2 @param {string[]} [extra]
 */
async function analizar(tipo, var1, var2, extra = []) {
    for (const r of qa('input[name="tipoAnalisis"]')) r.checked = r.value === tipo;
    env.disparar(q(`input[name="tipoAnalisis"][value="${tipo}"]`), 'change');
    q('#varsExtraCont').innerHTML = '';
    for (const v of extra) { q('#btnAgregarVariable').click(); const s = qa('#varsExtraCont select').pop(); s.value = v; }
    q('#variable1').value = var1; q('#variable2').value = var2;
    assert.equal(q('#variable1').value, var1, `«${var1}» está entre las opciones de la variable 1`);
    assert.equal(q('#variable2').value, var2, `«${var2}» está entre las opciones de la variable 2`);
    ui.analisis.ejecutarAnalisis();
    await esperar(() => !q('#btnAnalizar').disabled);
}

before(async () => {
    env = crearEntorno(fs.readFileSync(new URL('index.html', raiz), 'utf8'));
    env.document.readyState = 'interactive';
    G.fetch = () => Promise.reject(new Error('sin red en las pruebas'));
    G.print = () => { impresiones++; };
    await import(new URL('src/main.js', raiz).href);
    await new Promise(r => setTimeout(r, 0));
    env.document.readyState = 'complete';
    env.disparar(env.document, 'DOMContentLoaded', { bubbles: false });
    for (const m of ['maestro', 'motor']) ui[m] = await import(new URL(`src/simulador/ui/${m}.js`, raiz).href);
    for (const m of ['analisis', 'carga']) ui[m] = await import(new URL(`src/analizador/ui/${m}.js`, raiz).href);
    ui.guardada = await import(new URL('src/simulador/dominio/generacion-guardada.js', raiz).href);
    ({ AnalizadorEstadistico: ui.A } = await import(new URL('src/analizador/estadistica.js', raiz).href));
    ({ VERSION: ui.VERSION } = await import(new URL('src/version.js', raiz).href));
});

// ---- El maestro escrito a mano

test('un maestro sin las tablas vacías ni la de correlaciones, con los bloques en otro orden, se importa entero', () => {
    // el del caso 2 de ejemplos/, sin su bloque de correlaciones y con los cortes antes que las diferencias: hasta la
    // 2026.12.31, los sociodemográficos terminaban en ###CORRELACIONES### y se tragaban lo que seguía («Categoría
    // "Cuantitativa": falta el promedio», al generar)
    const sinCorrelaciones = MAESTRO_COMPARATIVO.replace(/###CORRELACIONES###[\s\S]*?(?=###DIFERENCIAS###)/, '');
    const diferencias = /###DIFERENCIAS###[\s\S]*?(?=###CORTES###)/.exec(sinCorrelaciones);
    assert.ok(diferencias && !sinCorrelaciones.includes('###CORRELACIONES###'));
    const texto = sinCorrelaciones.replace(diferencias[0], '') + '\n' + diferencias[0];
    const { mensaje } = ui.maestro.aplicarMaestro(texto);
    assert.match(mensaje, /2 prueba\(s\), 4 variable\(s\), 0 correlación\(es\), 2 diferencia\(s\)/);
    assert.match(mensaje, /, 1 corte\(s\)/);
    assert.equal(qa('#bodySocio tr').length, 4);
    const g = G.generadorDatos;
    g.recolectarConfiguracion();
    assert.deepEqual(g.validarConfiguracion().errores, []);
    assert.deepEqual(g.configuracion.sociodemograficos.map((/** @type {any} */ s) => s.categoria), ['Sexo', 'Grado', 'Gestión', 'Promedio de notas']);
    assert.equal(g.configuracion.diferenciasGrupo.length, 2);
    assert.equal(g.configuracion.cortes.length, 1);
});

test('(revisión) el maestro que exporta la página, aplicado sobre la configuración de otro estudio, la reemplaza entera', async () => {
    const casos = ['01-correlacional', '02-comparativo', '03-predictivo', '04-instrumental', '05-estructural'];
    const recetas = await Promise.all(casos.map(c => import(new URL(`tests/navegador/recetas/${c}.mjs`, raiz).href)));
    // lo que exporta «Exportar TODO» con cada uno (con las tablas vacías: su encabezado solo)
    const exportados = recetas.map(r => { ui.maestro.aplicarMaestro(r.MAESTRO); return ui.maestro.textoMaestro().texto; });
    assert.ok(exportados.every(t => /###DIFERENCIAS###\nCuantitativa[^\n]*\n\n/.test(t) || /###MODELOS###\n[^\n]*\n\n/.test(t)), 'hay tablas vacías');
    for (const [i, texto] of exportados.entries()) {
        for (const [j, otro] of exportados.entries()) {
            if (i === j) continue;
            ui.maestro.aplicarMaestro(otro);
            ui.maestro.aplicarMaestro(texto);
            // hasta la revisión, las tablas que el maestro trae vacías conservaban las filas del otro estudio
            assert.equal(ui.maestro.textoMaestro().texto, texto, `el de ${casos[i]} sobre el de ${casos[j]}`);
        }
    }
});

test('el maestro del caso 2, tal cual, también: sus seis bloques', () => {
    const { mensaje } = ui.maestro.aplicarMaestro(MAESTRO_COMPARATIVO);
    assert.match(mensaje, /general \+ 2 prueba\(s\), 4 variable\(s\), 1 correlación\(es\), 2 diferencia\(s\).*, 1 corte\(s\)/);
});

// ---- La configuración de la base, tras un intento fallido de generar

test('un intento de generar que falla deja la configuración de la base que está a la vista (descargas, proyecto, impresión)', async () => {
    ui.maestro.aplicarMaestro(MAESTRO_COMPARATIVO);
    await generarYEsperar();
    const g = G.generadorDatos, base = g.datosGenerados;
    assert.equal(g.configuracion.semilla, 3030);
    // otra semilla y un promedio de notas fuera de su rango: la validación lo rechaza y la base sigue siendo la de la semilla 3030
    q('#semilla').value = '999';
    const notas = qa('#bodySocio tr').find((/** @type {any} */ f) => f.querySelector('[aria-label="Categoría"]').value === 'Promedio de notas');
    const media = notas.querySelector('[aria-label="Promedio"]'), mediaOriginal = media.value;
    media.value = '25';
    ui.motor.generarBaseDatos();
    assert.match(toast(), /^Error: .*la media 25 está fuera del rango 0–20/);
    assert.equal(g.datosGenerados, base, 'la base no cambió');
    assert.equal(g.configuracion.semilla, 3030, 'y su configuración tampoco (hasta la 2026.12.31, la semilla 999)');
    assert.equal(g.configuracion.sociodemograficos.find((/** @type {any} */ s) => s.categoria === 'Promedio de notas').promedio, Number(mediaOriginal));
    assert.equal(/** @type {any} */ (ui.guardada.generacionParaGuardar(g, [])).configuracion.semilla, 3030, 'el proyecto guarda la de la base');
    media.value = mediaOriginal;
    // una correlación imposible lanza al recolectar, después de leer la semilla: tampoco la cambia
    const r = qa('#bodyCorrelaciones .fila-correlacion')[0].querySelector('[aria-label="Correlación objetivo"]');
    const rOriginal = r.value;
    r.value = '1.5';
    ui.motor.generarBaseDatos();
    assert.match(toast(), /r debe estar entre -1 y 1/);
    assert.equal(g.configuracion.semilla, 3030);
    assert.equal(g.datosGenerados, base);
    r.value = rOriginal;
    q('#semilla').value = '3030';
});

test('(revisión) mientras se genera, la configuración es la de la base a la vista; la nueva entra con su base', async () => {
    ui.maestro.aplicarMaestro(MAESTRO_COMPARATIVO);
    await generarYEsperar();
    const g = G.generadorDatos, base = g.datosGenerados;
    q('#semilla').value = '999';
    ui.motor.generarBaseDatos();
    // el respaldo en el hilo espera 50 ms antes de generar: ese es el «durante»
    assert.ok(q('#btnGenerar').disabled, 'generando');
    assert.equal(g.configuracion.semilla, 3030, 'durante la generación, la de la base que se ve (hasta la revisión, la nueva)');
    assert.equal(g.datosGenerados, base);
    await esperar(() => !q('#btnGenerar').disabled && g.datosGenerados !== base);
    assert.equal(g.configuracion.semilla, 999, 'con la base nueva, su configuración');
    q('#semilla').value = '3030';
});

test('(revisión) si la generación falla (en el hilo), el generador de la página conserva su base y su configuración', async () => {
    ui.maestro.aplicarMaestro(MAESTRO_COMPARATIVO);
    await generarYEsperar();
    const g = G.generadorDatos, base = g.datosGenerados;
    const { GeneradorDatos } = await import(new URL('src/simulador/dominio/generador.js', raiz).href);
    // (segunda revisión) a mitad de la generación, después de que el generador que genera vacíe su base (flujo.js): si el
    // respaldo generara con el de la página, la de la página se perdería
    const original = GeneradorDatos.prototype.prepararDiferenciasGrupo;
    GeneradorDatos.prototype.prepararDiferenciasGrupo = function () { throw new Error('fallo de prueba al generar'); };
    try {
        q('#semilla').value = '999';
        ui.motor.generarBaseDatos();
        await esperar(() => !q('#btnGenerar').disabled);
        assert.match(toast(), /fallo de prueba al generar/);
        assert.equal(g.datosGenerados, base, 'la base sigue ahí (hasta la revisión, el respaldo la vaciaba)');
        assert.equal(g.configuracion.semilla, 3030);
    } finally {
        GeneradorDatos.prototype.prepararDiferenciasGrupo = original;
        q('#semilla').value = '3030';
    }
});

test('(segunda revisión) una base que termina de generarse después de abrir un proyecto no reemplaza lo que se restauró', async () => {
    const proyecto = await import(new URL('src/simulador/ui/proyecto.js', raiz).href);
    ui.maestro.aplicarMaestro(MAESTRO_COMPARATIVO);
    q('#semilla').value = '3030';
    await generarYEsperar();
    const g = G.generadorDatos;
    const parte = proyecto.capturarSimuladorParaProyecto();
    const archivos = new Map(Object.entries(parte.archivos).map(([k, v]) => [k, typeof v === 'string' ? new TextEncoder().encode(v) : v]));
    q('#semilla').value = '999';
    ui.motor.generarBaseDatos();   // el respaldo en el hilo empieza a los 50 ms
    assert.ok(q('#btnGenerar').disabled, 'generando');
    proyecto.restaurarSimuladorDeProyecto(archivos);
    const restaurada = g.datosGenerados;
    assert.equal(g.configuracion.semilla, 3030);
    await esperar(() => !q('#btnGenerar').disabled);
    assert.equal(g.datosGenerados, restaurada, 'la base del proyecto sigue ahí (hasta la revisión, la reemplazaba la de la semilla 999)');
    assert.equal(g.configuracion.semilla, 3030, 'con su configuración');
    assert.equal(q('#semilla').value, '3030', 'y la tabla, la del proyecto');
    assert.match(toast(), /Se descartó la base que se estaba generando/);
    // y una generación sin nada de por medio entra como siempre
    q('#semilla').value = '999';
    await generarYEsperar();
    assert.equal(g.configuracion.semilla, 999);
    q('#semilla').value = '3030';
    await generarYEsperar();
});

// ---- Imprimir o guardar en PDF

test('los botones «Imprimir o guardar en PDF» abren el diálogo de impresión del navegador', () => {
    const antes = impresiones;
    for (const id of ['btnImprimirSimulador', 'btnImprimirAnalizador']) {
        assert.match(q('#' + id).textContent, /Imprimir o guardar en PDF/);
        q('#' + id).click();
    }
    assert.equal(impresiones - antes, 2);
});

test('al imprimir el Simulador, el encabezado dice qué base es (casos, columnas y semilla) y se va al terminar', () => {
    activar('simulador');
    const base = G.generadorDatos.datosGenerados;
    imprimir();
    const e = encabezadoImpreso();
    assert.ok(e);
    assert.equal(e.seccion, 'simulador');
    assert.equal(e.titulo, 'Verificación de la base simulada');
    assert.equal(e.lineas[0], `Base: ${base.n} casos y ${base.columnas.length} columnas · semilla 3030 (la misma configuración y semilla dan la misma base)`);
    assert.match(e.lineas[1], new RegExp(`^StatSim Pro ${ui.VERSION.replace(/\./g, '\\.')} · \\d{1,2} de [a-z]+ de \\d{4}$`));
    imprimir();
    assert.ok(encabezadoImpreso(), 'imprimir otra vez no lo duplica');
    terminarDeImprimir();
    assert.equal(encabezadoImpreso(), null);
});

test('al imprimir el Analizador, el encabezado lleva el título, la unidad y el lugar, y de dónde son los datos, como texto', () => {
    ui.carga.cargarDatosGenerados();
    const datos = ui.A.obtenerDatos();
    activar('analizador');
    q('#tituloTesis').value = 'Ansiedad ante los exámenes <img src=x onerror="alert(1)">';
    q('#unidadAnalisis').value = 'escolares'; q('#lugarContexto').value = ' Lima ';
    imprimir();
    const e = encabezadoImpreso();
    assert.ok(e);
    assert.equal(e.seccion, 'analizador');
    assert.equal(e.titulo, 'Resultados del Analizador');
    assert.equal(e.lineas[0], 'Ansiedad ante los exámenes <img src=x onerror="alert(1)">', 'el título, como texto');
    assert.equal(q('.encabezado-impresion img'), null, 'nada se interpreta como HTML');
    assert.equal(e.lineas[1], 'escolares · Lima');
    assert.equal(datos.length, 300);
    assert.equal(e.lineas[2], `Datos: 300 casos y ${Object.keys(datos[0]).length} variables, generados en el Simulador`);
    terminarDeImprimir();
    // sin unidad ni lugar, esa línea no sale
    q('#unidadAnalisis').value = ''; q('#lugarContexto').value = '';
    imprimir();
    assert.equal(/** @type {any} */ (encabezadoImpreso()).lineas.length, 3);
    terminarDeImprimir();
});

test('(revisión) al imprimir se abre lo plegado de la sección, y se vuelve a plegar al terminar', () => {
    activar('analizador');
    const plegado = env.document.createElement('details'), abierto = env.document.createElement('details');
    abierto.setAttribute('open', '');
    for (const d of [plegado, abierto]) { d.innerHTML = '<summary>Interpretación profesional</summary><p>Texto</p>'; q('#analizador').appendChild(d); }
    const fuera = env.document.createElement('details');
    q('#simulador').appendChild(fuera);
    imprimir();
    assert.equal(plegado.open, true, 'lo plegado, abierto para el papel');
    assert.equal(fuera.open, undefined, 'lo de otra sección, no');
    terminarDeImprimir();
    assert.equal(plegado.open, false, 'y vuelto a plegar');
    assert.ok(abierto.hasAttribute('open'), 'lo que estaba abierto sigue abierto');
    for (const d of [plegado, abierto, fuera]) d.remove();
});

test('(revisión) el papel lleva los avisos de las tarjetas, las tablas que en pantalla se desplazan y no los controles del bootstrap', () => {
    const css = fs.readFileSync(new URL('assets/css/componentes/impresion.css', raiz), 'utf8');
    assert.match(css, /> :not\(\.card-title\):not\(\[id\$="Resultados"\]\):not\(\[id\$="Mensajes"\]\) \{ display: none !important; \}/, 'los «…Mensajes» de las tarjetas no se ocultan');
    assert.match(css, /#analizador \[style\*="overflow"\] \{ overflow: visible !important;/, 'lo que lleva el desplazamiento en su estilo, entero');
    assert.match(css, /#bootstrapFiabilidad:has\(#bootResultados:empty\) \{ display: none !important; \}/);
    assert.match(css, /#bootstrapFiabilidad \.rejilla-psico \{ display: none !important; \}/);
    // y que esos elementos existen: los avisos de las tarjetas son hijos directos de la tarjeta, junto a sus resultados
    const fuentes = ['afe-ui.js', 'aiken-ui.js', 'invarianza-ui.js', 'concordancia-ui.js'].map(f => fs.readFileSync(new URL(`src/analizador/psicometria/${f}`, raiz), 'utf8')).join('\n');
    for (const id of ['afeMensajes', 'aikenMensajes', 'invMensajes', 'concMensajes']) assert.ok(fuentes.includes(`id="${id}"`), `#${id}`);
    assert.match(fs.readFileSync(new URL('src/analizador/fiabilidad.js', raiz), 'utf8'), /<div class="result-box" style="overflow-x: auto;">/, 'el resumen de la fiabilidad, con su desplazamiento en el estilo');
});

test('el origen de los datos, en palabras', async () => {
    const { origenEnPalabras } = await import(new URL('src/analizador/ui/impresion.js', raiz).href);
    assert.equal(origenEnPalabras({ tipo: 'simulador' }), 'generados en el Simulador');
    assert.equal(origenEnPalabras({ tipo: 'csv', archivo: 'base.csv' }), 'del archivo «base.csv»');
    assert.equal(origenEnPalabras({ tipo: 'csv' }), 'de un archivo CSV');
    assert.equal(origenEnPalabras({ tipo: 'sav', archivo: 'tesis.sav' }), 'del archivo de SPSS «tesis.sav»');
    assert.equal(origenEnPalabras({ tipo: 'xlsx', archivo: 'libro.xlsx', hoja: 'Datos' }), 'de la hoja «Datos» del libro de Excel «libro.xlsx»');
    assert.equal(origenEnPalabras({ tipo: 'xlsx' }), 'de un libro de Excel');
    assert.equal(origenEnPalabras(undefined), '');
});

test('los estilos de impresión no tocan la pantalla: todo dentro de @media print (y el encabezado, oculto en pantalla)', () => {
    const css = fs.readFileSync(new URL('assets/css/componentes/impresion.css', raiz), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    /** @type {string[]} */
    const bloques = [];
    let prof = 0, inicio = 0;
    for (let i = 0; i < css.length; i++) {
        if (css[i] === '{') { if (prof === 0) bloques.push(css.slice(inicio, i).trim()); prof++; }
        else if (css[i] === '}') { prof--; if (prof === 0) inicio = i + 1; }
    }
    assert.equal(prof, 0, 'llaves equilibradas');
    assert.ok(bloques.length >= 2);
    for (const b of bloques) assert.match(b, /^@media (print|screen)$/, `«${b}» fuera de @media print`);
    assert.match(css, /@media screen\s*\{\s*\.encabezado-impresion\s*\{\s*display:\s*none;?\s*\}\s*\}/);
    const estilos = fs.readFileSync(new URL('assets/css/styles.css', raiz), 'utf8');
    const importes = estilos.match(/@import url\("[^"]+"\);/g) || [];
    assert.equal(importes[importes.length - 1], '@import url("componentes/impresion.css");', 'el último: gana a los demás');
});

test('cada #id de los estilos de impresión existe en la página (index.html o el código que crea la tarjeta)', () => {
    const css = fs.readFileSync(new URL('assets/css/componentes/impresion.css', raiz), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const html = fs.readFileSync(new URL('index.html', raiz), 'utf8');
    const ids = new Set();
    for (const m of css.matchAll(/([^{};]+)\{/g)) {
        const preludio = m[1].trim();
        if (preludio.startsWith('@')) continue;
        for (const id of preludio.replace(/"[^"]*"|'[^']*'/g, '').matchAll(/#([A-Za-z][\w-]*)/g)) ids.add(id[1]);
    }
    assert.ok(ids.size >= 5);
    const codigo = (/** @type {URL} */ dir) => fs.readdirSync(dir, { withFileTypes: true, recursive: true }).filter(e => e.isFile() && e.name.endsWith('.js')).map(e => fs.readFileSync(`${e.parentPath || e.path}/${e.name}`, 'utf8')).join('\n');
    const fuentes = codigo(new URL('src/', raiz));
    for (const id of ids) {
        const declarado = html.includes(`id="${id}"`) || fuentes.includes(`id="${id}"`) || new RegExp(`\\.id = '${id}'`).test(fuentes);
        assert.ok(declarado, `#${id}: ningún elemento de la página lo tiene`);
    }
});

// ---- El botón del Word, tras un análisis sin capítulo

test('el Word es el de la última correlación de dos variables: tras una comparación, una asociación o una matriz, lo dice', async () => {
    activar('analizador');
    ui.carga.poblarSelectsVariables(ui.A.obtenerDatos());
    await analizar('correlacion', 'General_I', 'Promedio de notas');
    assert.equal(G.ultimoTipoAnalisis, 'correlacion');
    assert.ok(G.ultimoAnalisis && G.ultimoAnalisis.resultado, 'la correlación tiene su capítulo');
    const casos = [
        ['comparacion', 'General_I', 'Sexo', [], /ya incluye su comparación según cada variable sociodemográfica/],
        ['asociacion', 'Nivel_I', 'Sexo', [], /Esta asociación \(χ²\) está en «Descargar resultados»/],
        ['correlacion', 'General_I', 'Promedio de notas', ['Dimension_P'], /quita las variables adicionales/],
    ];
    for (const [tipo, v1, v2, extra, aviso] of /** @type {Array<[string, string, string, string[], RegExp]>} */ (casos)) {
        await analizar(tipo, v1, v2, extra);
        assert.equal(G.ultimoTipoAnalisis, extra.length ? 'matriz' : tipo);
        assert.equal(G.ultimoAnalisis, null, `${tipo}: el capítulo de la correlación anterior ya no vale`);
        const descargas = env.descargas.length;
        q('#btnExportarWord').click();
        assert.match(toast(), aviso);
        assert.equal(env.descargas.length, descargas, `${tipo}: no descarga el capítulo anterior`);
    }
    q('#varsExtraCont').innerHTML = '';
});

// ---- La dependiente de dos categorías con nombre

test('la regresión ofrece como dependiente las variables de dos categorías con nombre, con su codificación', () => {
    ui.carga.poblarSelectsVariables(ui.A.obtenerDatos());
    const opciones = (/** @type {string} */ id) => new Map(q('#' + id).options.map((/** @type {any} */ o) => [o.value, o.textContent]));
    const dep = opciones('regDep'), ind = opciones('regInd');
    // (revisión) con los códigos del Simulador («Mujer, Hombre»: 0 = Mujer, 1 = Hombre), no por el orden alfabético
    assert.match(dep.get('Sexo') || '', /\(dos categorías: Mujer = 0, Hombre = 1\)$/);
    assert.match(dep.get('Gestión') || '', /\(dos categorías: Pública = 0, Privada = 1\)$/);
    assert.deepEqual(ui.A.codigosDe('Sexo'), [[0, 'Mujer'], [1, 'Hombre']], 'los códigos llegan con la base del Simulador');
    assert.ok(!dep.has('Grado') && !dep.has('Nivel_I'), 'las de tres categorías, no');
    assert.ok(dep.has('General_I') && dep.has('Promedio de notas'), 'las numéricas, como antes');
    assert.ok(!ind.has('Sexo'), 'como predictor, no (el de la bivariada es numérico)');
});

test('la logística con una dependiente «No / Sí» es la misma que con 0/1, y dice qué categoría modela', async () => {
    const { AnalizadorEstadistico: A } = await import(new URL('src/analizador/estadistica.js', raiz).href);
    const { RegresionMultiple: RM } = await import(new URL('src/analizador/regresion.js', raiz).href);
    let s = 20270101 >>> 0;
    const u = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const nrm = () => Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u());
    const filas = Array.from({ length: 240 }, (_, i) => {
        const x1 = +(10 + 2 * nrm()).toFixed(2), x2 = +(5 + nrm()).toFixed(2);
        const y = u() < 1 / (1 + Math.exp(-(-0.4 + 0.6 * (x1 - 10) - 0.5 * (x2 - 5)))) ? 1 : 0;
        const perdido = i % 37 === 5;
        return { x1, x2, y01: perdido ? '' : y, yNoSi: perdido ? '' : (y ? 'Sí' : 'No'), yRiesgo: perdido ? NaN : (y ? 'Riesgo' : 'Sin riesgo'), yHtml: perdido ? '' : (y ? '<b>Sí</b>' : 'No') };
    });
    A.cargarDatos(filas);
    const ajustar = (/** @type {string} */ y) => RM.regresionAvanzada(y, ['x1', 'x2'], y, ['x1', 'x2'], {});
    const R0 = ajustar('y01'), R1 = ajustar('yNoSi'), R2 = ajustar('yRiesgo'), R3 = ajustar('yHtml');
    assert.equal(R0.familia, 'logistica');
    assert.equal(R0.n, 240 - 7, 'los perdidos fuera');
    for (const R of [R1, R2, R3]) {
        assert.equal(R.familia, 'logistica'); assert.equal(R.n, R0.n);
        assert.deepEqual(R.coefs.map((/** @type {any} */ k) => k.b), R0.coefs.map((/** @type {any} */ k) => k.b), 'los mismos coeficientes que con 0/1');
    }
    assert.equal(R0.eventoY, null);
    assert.deepEqual(R1.eventoY, { evento: 'Sí', referencia: 'No', segun: 'nombres' });
    assert.deepEqual(R2.eventoY, { evento: 'Riesgo', referencia: 'Sin riesgo', segun: 'nombres' });
    assert.match(R1.notaFamilia, /Se modela la probabilidad de «Sí» \(codificada 1\) frente a «No» \(0\) en yNoSi, según los nombres de sus categorías/);
    assert.ok(R3.notaFamilia.includes('«&lt;b&gt;Sí&lt;/b&gt;»') && !R3.notaFamilia.includes('<b>'), 'las categorías, escapadas');
    // (revisión) con los códigos de la variable, manda el código mayor aunque el nombre diga otra cosa
    const filasPermanencia = filas.map(f => ({ ...f, yDeserta: f.yNoSi === '' ? '' : (f.y01 === 1 ? 'Deserta' : 'Permanece') }));
    A.cargarDatos(filasPermanencia, { codigosDeCategorias: { yDeserta: [[0, 'Permanece'], [1, 'Deserta']] } });
    const R4 = ajustar('yDeserta');
    assert.deepEqual(R4.eventoY, { evento: 'Deserta', referencia: 'Permanece', segun: 'codigos' });
    assert.deepEqual(R4.coefs.map((/** @type {any} */ k) => k.b), R0.coefs.map((/** @type {any} */ k) => k.b), 'el 1 es «Deserta», como en el Simulador');
    assert.match(R4.notaFamilia, /según los códigos de la variable \(la de código mayor, como en SPSS\)/);
    A.cargarDatos(filasPermanencia);
    assert.equal(ajustar('yDeserta').eventoY.evento, 'Permanece', 'sin códigos (un CSV), por los nombres: el orden alfabético');
    // (revisión) la interacción, el término cuadrático y Poisson no se aplican a la logística: se dice
    A.cargarDatos(filas);
    const R5 = RM.regresionAvanzada('yNoSi', ['x1', 'x2'], 'yNoSi', ['x1', 'x2'], { interaccion: true, cuadratico: true });
    assert.ok(R5.avisos.some((/** @type {string} */ a) => /la interacción y el término cuadrático no se aplican a esta familia/.test(a)), R5.avisos.join(' | '));
});

test('(revisión) cambiar el tipo de análisis no borra la regresión elegida', () => {
    activar('analizador');
    ui.carga.cargarDatosGenerados();
    q('#regDep').value = 'Promedio de notas'; q('#regInd').value = 'General_I';
    for (const tipo of ['comparacion', 'correlacion']) {
        for (const r of qa('input[name="tipoAnalisis"]')) r.checked = r.value === tipo;
        env.disparar(q(`input[name="tipoAnalisis"][value="${tipo}"]`), 'change');
    }
    assert.equal(q('#regDep').value, 'Promedio de notas', 'hasta la revisión, la lista se volvía a poblar en blanco');
    assert.equal(q('#regInd').value, 'General_I');
    q('#regDep').value = ''; q('#regInd').value = '';
});

test('(revisión) la regresión bivariada con una dependiente binaria es solo la logística, en la pantalla y en el Word', async () => {
    const { RegresionMultiple: RM } = await import(new URL('src/analizador/regresion.js', raiz).href);
    const { ExportadorWord } = await import(new URL('src/analizador/exportador-word.js', raiz).href);
    activar('analizador');
    ui.carga.cargarDatosGenerados();
    q('#regDep').value = 'Sexo'; q('#regInd').value = 'General_I';
    await analizar('correlacion', 'General_I', 'Promedio de notas');
    const html = q('#anclaRegBiv').parentElement.innerHTML;   // la regresión va justo después de la correlación
    assert.match(html, /Regresión Bivariada/);
    assert.ok(!/Modelo lineal \(mínimos cuadrados\)/.test(html), 'sin la recta');
    assert.ok(!/aumenta en promedio/.test(html), 'ni su lectura en «puntos»');
    assert.match(html, /el modelo es la regresión logística/);
    assert.equal(RM._ultimaBivariada.binaria, true);
    const capitulo = ExportadorWord.generarCapitulo(G.ultimoAnalisis);
    // la etiqueta de Sexo en el Analizador dice su codificación: «Sexo (binaria: 0 = Mujer, 1 = Hombre)»
    assert.match(capitulo, /Regresión logística de Sexo \(binaria: 0 = Mujer, 1 = Hombre\) sobre /, 'el Word, igual');
    assert.ok(!/Regresión lineal de Sexo/.test(capitulo) && !/se compararon formas funcionales/.test(capitulo));
    assert.match(capitulo, /Se modela la probabilidad de «Hombre» \(codificada 1\) frente a «Mujer» \(0\) en Sexo \(binaria: 0 = Mujer, 1 = Hombre\), según los códigos de la variable/,
        'el evento, por los códigos del Simulador (hasta la revisión, «Mujer», contra la etiqueta)');
    assert.match(capitulo, /logit\(p\) = −?\d+\.\d{3} [+−] \d+\.\d{3}·x/, 'la ecuación, con su signo');
    assert.ok(!/\+ -\d/.test(capitulo) && !/logit\(p\) = -/.test(capitulo), 'sin «+ -» ni un «-» distinto de los demás');
    // (revisión) el título de la portada, como texto (lo escribió quien investiga; la prueba de la impresión le puso marcado)
    assert.ok(!capitulo.includes('<img src=x'), 'el título, escapado');
    q('#regDep').value = ''; q('#regInd').value = '';
});

test('(revisión) el capítulo de Word no arrastra la regresión de un análisis anterior ni repite la bivariada como «múltiple»', async () => {
    activar('analizador');
    ui.carga.cargarDatosGenerados();
    ui.carga.poblarSelectsVariables(ui.A.obtenerDatos());
    const { ExportadorWord } = await import(new URL('src/analizador/exportador-word.js', raiz).href);
    // una correlación con una regresión bivariada (un predictor)
    q('#regDep').value = 'Promedio de notas'; q('#regInd').value = 'General_I';
    await analizar('correlacion', 'General_I', 'Promedio de notas');
    let capitulo = ExportadorWord.generarCapitulo(G.ultimoAnalisis);
    assert.match(capitulo, /Análisis de regresión bivariada/);
    assert.ok(!/Análisis multivariado/.test(capitulo), 'la bivariada no reaparece como «regresión múltiple» (hasta la revisión, sí)');
    // y después, la misma correlación sin regresión
    q('#regDep').value = ''; q('#regInd').value = '';
    await analizar('correlacion', 'General_I', 'Promedio de notas');
    capitulo = ExportadorWord.generarCapitulo(G.ultimoAnalisis);
    assert.ok(!/Análisis multivariado|Análisis de regresión bivariada/.test(capitulo), 'ni la del análisis anterior');
});

test('(segunda revisión) si la logística de la bivariada no se puede estimar (una separación), el Word dice por qué', async () => {
    const { ExportadorWord } = await import(new URL('src/analizador/exportador-word.js', raiz).href);
    activar('analizador');
    const filas = Array.from({ length: 60 }, (_, i) => ({ X: i + 1, Z: +((i + 1) * 0.5 + ((i * 7) % 5)).toFixed(1), Y: i + 1 < 30 ? 'No' : 'Sí' }));
    ui.carga.restaurarDatos({ filas, etiquetas: {}, estructura: [], origen: { tipo: 'csv' } });
    q('#regDep').value = 'Y'; q('#regInd').value = 'X';
    assert.equal(q('#regDep').value, 'Y', 'la binaria con nombre, entre las dependientes');
    await analizar('correlacion', 'X', 'Z');
    assert.match(q('#anclaRegBiv').parentElement.innerHTML, /Separación perfecta/, 'la pantalla lo dice');
    const capitulo = ExportadorWord.generarCapitulo(G.ultimoAnalisis);
    assert.match(capitulo, /Nota metodológica: la regresión logística no se pudo estimar\. Separación perfecta/, 'y el Word también (hasta la revisión, la sección quedaba vacía)');
    q('#regDep').value = ''; q('#regInd').value = '';
});

test('(segunda revisión) cargar otros datos olvida el análisis anterior, lo de cada tarjeta y los modelos del SEM', async () => {
    const { SEM } = await import(new URL('src/analizador/sem-motor.js', raiz).href);
    const { ComparacionGrupos } = await import(new URL('src/analizador/comparacion-grupos.js', raiz).href);
    activar('analizador');
    const antes = Array.from({ length: 60 }, (_, i) => ({ P: i + 1, Q: +((i + 1) * 0.4 + ((i * 11) % 9)).toFixed(1) }));
    ui.carga.restaurarDatos({ filas: antes, etiquetas: {}, estructura: [], origen: { tipo: 'csv' } });
    await analizar('correlacion', 'P', 'Q');
    assert.ok(G.ultimoAnalisis && G.ultimoAnalisis.resultado.n === 60, 'hay un capítulo, de 60 casos');
    // lo que habría dejado cada tarjeta
    SEM._ultimos.push(/** @type {any} */ ({ etiquetaModelo: 'De la base anterior' }));
    SEM._ultimoDiagramaPNG = { url: 'data:image/png;base64,', w: 1, h: 1 };
    q('#semOut').innerHTML = '<p>modelo de la base anterior</p>';
    ComparacionGrupos._ultimo = { de: 'la base anterior' };
    q('#cgResultado').innerHTML = '<p>comparación de la base anterior</p>';
    for (const id of ['afe', 'inv', 'conc', 'df']) { q(`#${id}Resultados`).hidden = false; q(`#${id}Mensajes`).innerHTML = '<p>aviso de la base anterior</p>'; }
    q('#dfCalcular').disabled = true;
    // otros datos
    const filas = Array.from({ length: 25 }, (_, i) => ({ A: i, B: (i * 3) % 7 }));
    ui.carga.restaurarDatos({ filas, etiquetas: {}, estructura: [], origen: { tipo: 'csv' } });
    assert.equal(G.ultimoAnalisis, null, 'el capítulo era de la base anterior (hasta la revisión, el Word mezclaba las dos)');
    const descargas = env.descargas.length;
    q('#btnExportarWord').click();
    assert.match(toast(), /Primero ejecuta un análisis/);
    assert.equal(env.descargas.length, descargas);
    assert.equal(q('#resultadosCorrelacion').innerHTML, '', 'los resultados de la pantalla, fuera');
    assert.equal(SEM._ultimos.length, 0, 'los modelos del SEM, fuera (el Word los incluía)');
    assert.equal(SEM._ultimoDiagramaPNG, null);
    assert.equal(q('#semOut').innerHTML, '');
    assert.equal(ComparacionGrupos._ultimo, null);
    assert.equal(q('#cgResultado').innerHTML, '');
    for (const id of ['afe', 'inv', 'conc', 'df']) { assert.equal(q(`#${id}Resultados`).hidden, true, `#${id}Resultados`); assert.equal(q(`#${id}Mensajes`).innerHTML, '', `#${id}Mensajes`); }
    assert.equal(q('#dfCalcular').disabled, false, 'el diagnóstico de forma, disponible otra vez');
    if (G.generadorDatos.datosGenerados) ui.carga.cargarDatosGenerados();
});

test('(segunda revisión) con un predictor, el término cuadrático y Poisson se aplican (antes se ignoraban sin decirlo)', async () => {
    const { RegresionMultiple: RM } = await import(new URL('src/analizador/regresion.js', raiz).href);
    activar('analizador');
    let s = 7;
    const u = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const filas = Array.from({ length: 120 }, (_, i) => { const x = +(1 + 4 * u()).toFixed(2); let k = 0, p = Math.exp(-Math.exp(0.2 + 0.4 * x)), F = p; const v = u(); while (v > F && k < 60) { k++; p *= Math.exp(0.2 + 0.4 * x) / k; F += p; } return { x, z: +(x + u()).toFixed(2), conteo: k }; });
    ui.carga.restaurarDatos({ filas, etiquetas: {}, estructura: [], origen: { tipo: 'csv' } });
    const correr = async (/** @type {{ cuadratico?: boolean, poisson?: boolean }} */ op) => {
        q('#regDep').value = 'conteo'; q('#regInd').value = 'x';
        q('#regCuad').checked = !!op.cuadratico; q('#regPoisson').checked = !!op.poisson;
        await analizar('correlacion', 'x', 'z');
    };
    await correr({ poisson: true });
    assert.equal(RM._ultimaMultiple && RM._ultimaMultiple.familia, 'poisson', 'Poisson con un predictor');
    assert.equal(RM._ultimaBivariada, null);
    await correr({ cuadratico: true });
    assert.ok(RM._ultimaMultiple && RM._ultimaMultiple.idxCuad >= 0, 'con el cuadrado del predictor');
    await correr({});
    assert.ok(RM._ultimaBivariada && !RM._ultimaMultiple, 'sin opciones, la bivariada de siempre');
    q('#regCuad').checked = false; q('#regPoisson').checked = false; q('#regDep').value = ''; q('#regInd').value = '';
    if (G.generadorDatos.datosGenerados) ui.carga.cargarDatosGenerados();
});

test('(revisión) los códigos de las categorías viajan en el proyecto', async () => {
    const proyecto = await import(new URL('src/analizador/ui/proyecto.js', raiz).href);
    ui.carga.cargarDatosGenerados();
    const parte = /** @type {any} */ (proyecto.capturarAnalizadorParaProyecto());
    const meta = JSON.parse(parte.archivos['etiquetas.json']);
    assert.deepEqual(meta.codigosDeCategorias.Sexo, [[0, 'Mujer'], [1, 'Hombre']]);
    const archivos = new Map(Object.entries(parte.archivos).map(([k, v]) => [k, new TextEncoder().encode(/** @type {string} */ (v))]));
    ui.A.cargarDatos([{ x: 1 }]);
    assert.equal(ui.A.codigosDe('Sexo'), null);
    proyecto.restaurarAnalizadorDeProyecto(archivos);
    assert.deepEqual(ui.A.codigosDe('Sexo'), [[0, 'Mujer'], [1, 'Hombre']], 'de vuelta con los datos');
    // uno ajeno con los códigos mal formados, rechazado
    const malos = new Map(archivos);
    malos.set('etiquetas.json', new TextEncoder().encode(JSON.stringify({ ...meta, codigosDeCategorias: { Sexo: [['0', 'Mujer']] } })));
    assert.throws(() => proyecto.restaurarAnalizadorDeProyecto(malos), /los códigos de las categorías guardados/);
});
