// @ts-check
// tests/ui/ronda-2026-12-30.test.js — (2026.12.30) lo que corrigió la segunda auditoría en el Buscador, el Explorador y la
// cáscara, montado sobre index.html real (sin red): el ranking que desaparecía en la 2.ª visita, ExcelJS y html-docx a
// demanda, la relevancia que caía sobre una búsqueda nueva, la ficha del protocolo y el PRISMA coherentes al repetir una
// búsqueda, los duplicados con y sin DOI, las fórmulas en los CSV, el motivo del PRISMA en líneas, la sección en la
// dirección, el aviso de «Restablecer», el panorama sin pedir un archivo que no existe, la escala de colores y el
// antimeridiano del mapa, y la inyección por los titulares del Explorador.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';

const raiz = new URL('../../', import.meta.url);
/** @type {any} */ let env;
/** @type {any} */ let B;
/** @type {string[]} */ let pedidas = [];
const $ = (/** @type {string} */ id) => env.document.getElementById(id);
const sinRed = () => { globalThis.fetch = /** @type {any} */ (async (/** @type {string} */ u) => { pedidas.push(String(u)); throw new Error('sin red en las pruebas'); }); };

before(async () => {
    env = crearEntorno(fs.readFileSync(new URL('index.html', raiz), 'utf8'));
    env.document.readyState = 'interactive';
    sinRed();
    await import(new URL('src/main.js', raiz).href);
    await new Promise(r => setTimeout(r, 0));
    env.document.readyState = 'complete';
    env.disparar(env.document, 'DOMContentLoaded', { bubbles: false });
    B = await import(new URL('src/buscador/index.js', raiz).href);
    await new Promise(r => setTimeout(r, 0));
});
beforeEach(() => { sinRed(); pedidas = []; });

test('el ranking pintado desde la caché sobrevive al montaje del Buscador (antes, la 2.ª visita lo borraba)', () => {
    const R = B.RankingRevistas, A = B.Antecedentes;
    R._datos = { t: Date.now(), filas: [{ titulo: 'Revista Alfa', citeScore: 9.1, cuartil: 'Q1', percentil: 97, areas: ['Clinical Psychology'], tipo: 'Journal', editorial: 'E', oa: false, issn: '', linkScopus: '', linkScimago: '' }], total: 1, parcial: false, excluidas: 0 };
    R._render();
    assert.ok($('rankingRevistas'), 'pintado');
    A.montar();
    const ranking = $('rankingRevistas');
    assert.ok(ranking, 'sigue ahí tras montar el Buscador');
    // (comparar nodos con assert.equal haría que, si falla, assert intente mostrar dos árboles enteros)
    assert.ok(ranking.parentElement === $('seccionAntecedentes'), 'en la sección del Buscador');
    assert.ok($('seccionAntecedentes').children[0] === ranking, 'al inicio de la sección');
    assert.ok($('antBuscar'), 'y el formulario se montó');
    // los encabezados ordenables, con un botón y aria-sort
    const th = ranking.querySelector('th[data-orden]');
    assert.ok(th && th.querySelector('button.ranking-orden'), 'botón dentro del encabezado');
    assert.match(th.getAttribute('aria-sort') || '', /^(ascending|descending|none)$/);
    for (const id of ['rankingArea', 'rankingTipo', 'rankingTop', 'rankingFiltro']) assert.ok(($(id).getAttribute('aria-label') || '').length > 3, `${id}: nombre accesible`);
});

test('ExcelJS a demanda desde la copia local (el Ranking ya no exige que esté cargada); y el error, legible', async () => {
    const { asegurarExcelJS } = await import(new URL('src/shared/vendor.js', raiz).href);
    delete (/** @type {any} */ (globalThis)).ExcelJS;
    const p = asegurarExcelJS();
    const script = [...env.document.head.querySelectorAll('script')].find(s => /assets\/vendor\/exceljs\.min\.js$/.test(s.src || s.getAttribute('src') || ''));
    assert.ok(script, 'se inyecta la copia local');
    /** @type {any} */ (globalThis).ExcelJS = { Workbook: class {} };
    script.onload();
    await p;
    assert.equal(await asegurarExcelJS(), undefined, 'ya cargada: no se vuelve a pedir');
    delete (/** @type {any} */ (globalThis)).ExcelJS;
});

test('la relevancia se queda en la lista que evaluó: una búsqueda nueva a media evaluación no recibe sus notas', async () => {
    const A = B.Antecedentes;
    const viejas = [{ titulo: 'Estudio 1', resumen: 'x'.repeat(50) }, { titulo: 'Estudio 2', resumen: 'y'.repeat(50) }];
    A._obras = viejas;
    $('antCriterios').value = 'CRITERIOS DE INCLUSIÓN:\n- Universitarios.\nCRITERIOS DE EXCLUSIÓN:\n- Sin datos.';
    /** @type {(v: any) => void} */ let soltar = () => {};
    const ia = globalThis.StatSim.api.shared && globalThis.StatSim.api.shared.IAAsistente;
    const IA = ia || (await import(new URL('src/shared/ia-asistente.js', raiz).href)).IAAsistente;
    const original = { disponible: IA.disponible, numClaves: IA.numClaves, evaluar: IA.evaluarLoteRelevancia };
    IA.disponible = () => true; IA.numClaves = async () => 1;
    IA.evaluarLoteRelevancia = () => new Promise(r => { soltar = r; });
    A._ENFRIAMIENTO_RELEVANCIA_MS = 0;
    const tarea = A._onAnalizarRelevancia();
    await new Promise(r => setTimeout(r, 5));
    const nuevas = [{ titulo: 'Trabajo nuevo 1' }, { titulo: 'Trabajo nuevo 2' }];
    A._obras = nuevas;   // llega una búsqueda nueva
    soltar([{ idx: 0, puntua: 5, motivo: 'm0' }, { idx: 1, puntua: 2, motivo: 'm1' }]);
    await tarea;
    assert.deepEqual(nuevas.map(o => /** @type {any} */ (o)._relevancia), [undefined, undefined], 'las obras nuevas no reciben notas ajenas');
    assert.deepEqual(viejas.map(o => /** @type {any} */ (o)._relevancia), [5, 2], 'las notas, en las obras evaluadas');
    assert.match($('antRelevanciaEstado').textContent, /búsqueda nueva mientras se evaluaba/);
    assert.equal($('antAnalizarRelevancia').disabled, false);
    Object.assign(IA, { disponible: original.disponible, numClaves: original.numClaves, evaluarLoteRelevancia: original.evaluar });
});

test('la ficha del protocolo y el PRISMA, coherentes: repetir la búsqueda no suma de nuevo; otros filtros, otra fila', () => {
    const P = B.ProtocoloBusqueda, D = B.PrismaDiagrama;
    P.limpiar(); D.reiniciar();
    const buscar = (filtros, n) => {
        P.registrar({ fuente: 'Scopus', ecuacion: 'burnout docente', filtros });
        P.actualizarResultados('Scopus', 'burnout docente', n, filtros);
        D.registrar('identificados', { fuente: 'Scopus', n, consulta: P.claveConsulta('Scopus', 'burnout docente', filtros) });
        D.registrar('duplicados', { n: 2, consulta: `búsqueda|${filtros}` });
    };
    buscar('Desde 2021', 10); buscar('Desde 2021', 10);
    assert.equal(P.resumen().totalIdentificados, 10); assert.equal(D._completo().tot, 10, 'el PRISMA no lo cuenta dos veces (antes, 20)');
    assert.equal(D._completo().duplicados, 2, 'ni sus duplicados');
    buscar('Desde 2015', 4);
    const filas = JSON.parse(P.exportarJSON()).consultas;
    assert.deepEqual(filas.map(c => [c.filtros, c.resultados, c.veces]), [['Desde 2021', 10, 2], ['Desde 2015', 4, 1]], 'otra fila con sus filtros (antes, la anterior con los filtros viejos)');
    assert.equal(D._completo().tot, 14); assert.equal(P.resumen().totalIdentificados, 14);
    assert.match(P.parrafoMetodologico(), /mediante 1 ecuación de búsqueda, aplicada en 2 consultas/);
    // lo escrito a mano manda y ya no se descuenta
    D._datos.identificados = { 'Bases de datos': 50 }; D._datos.porConsulta = {};
    buscar('Desde 2021', 10);
    assert.equal(D._completo().tot, 60);
    // el motivo de exclusión, en líneas enteras y escapado después de partirlo
    D.registrar('excluidos', { n: 3, motivo: 'relevancia < 4 según los criterios de inclusión/exclusión del protocolo de la revisión' });
    const svg = D._svg();
    assert.ok(svg.includes('Motivo: relevancia &lt; 4 según los'), 'la entidad, entera'); assert.ok(!/&l(?!t;)|&lt(?!;)/.test(svg));
    assert.deepEqual(D._partirEnLineas('Motivo: ' + 'a'.repeat(80), 34, 2), ['Motivo:', 'a'.repeat(33) + '…']);
    P.limpiar(); D.reiniciar();
});

test('duplicados: el DOI sin el resolvedor, y la misma obra con y sin DOI, son una sola fila', () => {
    const A = B.Antecedentes;
    assert.equal(A._doiNorm('https://doi.org/10.1234/ABC.1.'), '10.1234/abc.1'); assert.equal(A._doiNorm('doi: 10.1/x'), '10.1/x'); assert.equal(A._doiNorm('http://dx.doi.org/10.1/X'), '10.1/x');
    const titulo = 'Inteligencia emocional y rendimiento académico en universitarios de Lima';
    const indice = new Map(), acumuladas = /** @type {any[]} */ ([]);
    assert.equal(A._incorporarObras(indice, acumuladas, [{ titulo, doi: 'https://doi.org/10.1234/abc.2023.1', anio: 2023, fuentesAPI: ['Scopus'] }]), 1);
    assert.equal(A._incorporarObras(indice, acumuladas, [{ titulo: titulo + '.', doi: '', anio: 2023, fuentesAPI: ['Scholar'] }]), 0, 'sin DOI, por el título');
    assert.equal(A._incorporarObras(indice, acumuladas, [{ titulo, doi: '10.1234/abc.2023.1', anio: 2023, fuentesAPI: ['OMS'] }]), 0, 'el mismo DOI sin resolvedor');
    assert.equal(acumuladas.length, 1); assert.deepEqual(acumuladas[0].fuentesAPI, ['Scopus', 'OMS']);
    // la que llega con el DOI que le faltaba a la reunida se lo da
    const i2 = new Map(), a2 = /** @type {any[]} */ ([]);
    A._incorporarObras(i2, a2, [{ titulo, doi: '', anio: 2023, fuentesAPI: ['Scholar'] }]);
    assert.equal(A._incorporarObras(i2, a2, [{ titulo, doi: '10.1234/abc.2023.1', anio: 2024, fuentesAPI: ['Scopus'] }]), 0);
    assert.equal(a2[0].doi, '10.1234/abc.2023.1'); assert.deepEqual(a2[0].fuentesAPI, ['Scholar', 'Scopus']);
    // títulos cortos («Editorial»), años lejanos o dos DOI distintos: obras distintas
    const i3 = new Map(), a3 = /** @type {any[]} */ ([]);
    A._incorporarObras(i3, a3, [{ titulo: 'Editorial', doi: '', fuentesAPI: ['Scholar'] }, { titulo: 'Editorial', doi: '10.1/e', fuentesAPI: ['Scopus'] }]);
    A._incorporarObras(i3, a3, [{ titulo, doi: '', anio: 2015, fuentesAPI: ['Scholar'] }, { titulo, doi: '10.1/z', anio: 2023, fuentesAPI: ['Scopus'] }]);
    A._incorporarObras(i3, a3, [{ titulo: 'Burnout docente en el Perú: un estudio', doi: '10.1/a', fuentesAPI: ['Scopus'] }, { titulo: 'Burnout docente en el Perú: un estudio', doi: '10.1/b', fuentesAPI: ['PubMed'] }]);
    assert.equal(a3.length, 6);
});

test('los CSV que llevan datos ajenos no ejecutan fórmulas: «=», «+», «-», «@» al principio, con apóstrofo (los números, no)', async () => {
    const { sinFormula } = await import(new URL('src/shared/csv.js', raiz).href);
    assert.equal(sinFormula('=HYPERLINK("https://x","y")'), `'=HYPERLINK("https://x","y")`);
    assert.equal(sinFormula('@SUM(1+1)'), "'@SUM(1+1)"); assert.equal(sinFormula('+cmd'), "'+cmd"); assert.equal(sinFormula('-x'), "'-x");
    for (const n of ['-0.5', '+51', '-3,5', '1e3', '12%', 'Título normal', '']) assert.equal(sinFormula(n), n, n);
});

test('la sección en la dirección: el menú la escribe, «Atrás» vuelve, un enlace a otra sección la muestra', async () => {
    const nav = await import(new URL('src/shared/navegacion.js', raiz).href);
    assert.equal(nav.seccionDe('#buscador'), 'buscador'); assert.equal(nav.seccionDe('#nada'), null); assert.equal(nav.seccionDe(''), null);
    /** @type {string[]} */ const historial = [];
    const loc = env.document.location, hist = /** @type {any} */ (globalThis).history;
    const pushOriginal = hist.pushState;
    hist.pushState = (/** @type {any} */ _e, /** @type {any} */ _t, /** @type {string} */ url) => { historial.push(url); loc.hash = url; };
    const enlace = [...env.document.querySelectorAll('.nav-link')].find(l => l.getAttribute('href') === '#analizador');
    enlace.click();
    assert.deepEqual(historial, ['#analizador']); assert.ok($('analizador').classList.contains('active'));
    assert.equal(enlace.getAttribute('aria-current'), 'page');
    // «Atrás» hasta el Buscador
    loc.hash = '#buscador';
    env.disparar(globalThis, 'popstate', { bubbles: false });
    assert.ok($('buscador').classList.contains('active')); assert.ok(!$('analizador').classList.contains('active'));
    assert.deepEqual(historial, ['#analizador'], 'volver no añade otra entrada');
    // (revisión) «Atrás» hasta la entrada inicial, sin «#»: muestra la sección de arranque SIN escribir «#simulador» (eso
    // borraba «Adelante» y atrapaba al usuario: cada «Atrás» volvía a añadirla)
    loc.hash = '';
    env.disparar(globalThis, 'popstate', { bubbles: false });
    assert.ok($('simulador').classList.contains('active'), 'la sección de arranque');
    assert.deepEqual(historial, ['#analizador'], 'sin entradas nuevas al volver a la entrada inicial');
    env.disparar(globalThis, 'hashchange', { bubbles: false });
    assert.deepEqual(historial, ['#analizador']);
    // y el clic del menú sigue escribiendo la dirección
    enlace.click();
    assert.deepEqual(historial, ['#analizador', '#analizador']);
    hist.pushState = pushOriginal; loc.hash = '';
    // (revisión) una dirección mal codificada («#100%», «#%E1lisis») no es una sección, y no lanza (dejaba la página sin
    // montar el Simulador ni el Analizador)
    assert.equal(nav.seccionDe('#100%'), null);
    assert.equal(nav.seccionDe('#%E1lisis'), null);
});

test('«Restablecer y recargar» nombra lo que de verdad se borrará (la última redacción del Redactor, la V de Aiken…)', async () => {
    const { textoConfirmacion } = await import(new URL('src/shared/mantenimiento.js', raiz).href);
    const almacen = () => ({ _m: new Map(), getItem(k) { return this._m.has(k) ? this._m.get(k) : null; }, setItem(k, v) { this._m.set(k, String(v)); }, removeItem(k) { this._m.delete(k); }, clear() { this._m.clear(); } });
    const sinSesion = typeof globalThis.sessionStorage === 'undefined';
    if (sinSesion) /** @type {any} */ (globalThis).sessionStorage = almacen();
    globalThis.localStorage.clear(); globalThis.sessionStorage.clear();
    assert.match(textoConfirmacion(), /ahora no guarda nada tuyo/);
    globalThis.localStorage.setItem('statsim_redactor_ultimo', '{}'); globalThis.localStorage.setItem('statsim.aiken.v1', '{}');
    globalThis.sessionStorage.setItem('statsim_prisma_flujo_v1', '{}');
    const t = textoConfirmacion();
    assert.match(t, /la última redacción del Redactor/); assert.match(t, /la tabla de valoraciones de la V de Aiken/); assert.match(t, /el flujo PRISMA de esta sesión/);
    assert.ok(!/Web of Science/.test(t), 'lo que no está guardado no se nombra');
    globalThis.localStorage.clear(); globalThis.sessionStorage.clear();
    if (sinSesion) delete (/** @type {any} */ (globalThis)).sessionStorage;
});

test('el panorama no pide gbd-datos.json si index.html no lo declara (antes, un 404 en cada visita)', async () => {
    const { PanoramaMundial } = await import(new URL('src/explorador/index.js', raiz).href);
    await PanoramaMundial._cargarGBD();
    assert.ok(!pedidas.some(u => /gbd/.test(u)), JSON.stringify(pedidas));
    const meta = env.document.createElement('meta'); meta.setAttribute('name', 'statsim-gbd'); meta.setAttribute('content', 'gbd-datos.json');
    env.document.head.appendChild(meta);
    await PanoramaMundial._cargarGBD();
    assert.ok(pedidas.some(u => /gbd-datos\.json$/.test(u)), 'declarado: sí se pide');
    meta.remove();
});

test('el mapa: la escala de colores interpola (antes, «#1e3a5fNaN»: países en negro) y el antimeridiano no cruza el mapa', async () => {
    const { d3 } = await import(new URL('src/shared/statviz.js', raiz).href);
    const s = d3.scaleLinear().domain([0, 50, 100]).range(['#1e3a5f', '#fbbf24', '#ef4444']);
    assert.equal(s(0), 'rgb(30, 58, 95)'); assert.equal(s(50), 'rgb(251, 191, 36)'); assert.equal(s(100), 'rgb(239, 68, 68)');
    assert.equal(s(25), 'rgb(141, 125, 66)'); assert.equal(s(75), 'rgb(245, 130, 52)', 'el segundo tramo');
    assert.equal(d3.scaleLinear().domain([0, 10]).range([0, 100])(2.5), 25, 'los números, como siempre');
    const camino = d3.geoPath();
    const fiyi = camino({ type: 'Polygon', coordinates: [[[170, -16], [-178, -16], [-178, -18], [170, -18], [170, -16]]] });
    assert.equal((fiyi.match(/M/g) || []).length, 2, 'dos trozos, uno a cada lado');
    const saltos = [...fiyi.matchAll(/([ML])(-?[\d.]+),(-?[\d.]+)/g)].map(m => [m[1], +m[2]]);
    for (let i = 1; i < saltos.length; i++) if (saltos[i][0] === 'L') assert.ok(Math.abs(saltos[i][1] - saltos[i - 1][1]) <= 180, `sin raya de lado a lado: ${fiyi}`);
    const antartida = camino({ type: 'Polygon', coordinates: [[[-180, -80], [-90, -82], [0, -80], [90, -82], [179.9, -80], [-180, -80]]] });
    assert.match(antartida, /-90\.00Z$/, 'el anillo que rodea el polo se cierra por el polo');
});

test('el Explorador escapa los titulares: comillas, «javascript:» y entidades partidas no llegan al HTML', async () => {
    const { Explorar } = await import(new URL('src/explorador/index.js', raiz).href);
    const html = Explorar._filaHTML({ icono: '🔥', tema: 'Tema "x"<b>', noticias: 3, academicos: 5, indice: 0.5, urlFuentes: 'javascript:alert(1)', aprox: false,
        titulares: [{ u: 'https://ok.example/a" onmouseover="alert(1)', t: '&'.repeat(89) + '<script>', d: '2026' }, { u: 'javascript:alert(2)', t: 'malo', d: 'x' }] }, 0);
    assert.ok(!/javascript:/i.test(html), 'sin enlaces javascript:'); assert.ok(!/ onmouseover="/.test(html), 'las comillas de la dirección no abren atributos');
    assert.ok(!/<script>|<b>/.test(html)); assert.ok(html.includes('Tema &quot;x&quot;&lt;b&gt;'));
    assert.ok(!/&am(?!p;)|&a(?!mp;)/.test(html.replace(/&(amp|lt|gt|quot|#39);/g, '')), 'ninguna entidad partida');
});
