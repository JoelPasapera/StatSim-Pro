// @ts-check
// tests/ui/buscador-sciencedirect.test.js — (2026.12.27) ScienceDirect en la interfaz del Buscador, montada sobre index.html
// real (sin red): la casilla (marcada: no hay nada que configurar), la cantidad, la tarea de la búsqueda con su protocolo y
// su PRISMA, el mensaje de cada búsqueda, la fuente sin claves libres (no se consulta), la fusión con Scopus por DOI (la
// base suma, la indexación no: ScienceDirect es una plataforma, no un índice), el botón «Abrir en ScienceDirect» y la
// guardia de fuentes.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';

const raiz = new URL('../../', import.meta.url);
/** @type {any} */ let env;
/** @type {any} */ let A;
/** @type {any} */ let SD;
/** @type {any} */ let P;
/** @type {any} */ let PRISMA;
/** @type {string[]} */ let pedidas = [];

const sinRed = () => { globalThis.fetch = /** @type {any} */ (async (/** @type {string} */ u) => { pedidas.push(String(u)); throw new Error('sin red en las pruebas'); }); };
/** @param {string} id */
const $ = id => env.document.getElementById(id);
const SOLO_SD = { usarSciencedirect: true, usarScopus: false, usarWos: false, usarScholar: false, usarAbiertas: false, usarPubmed: false, usarScielo: false, usarAlicia: false, usarOMS: false, usarONU: false };
/** @param {number} i */
const entrada = i => ({ 'dc:title': `Teacher burnout and emotional exhaustion ${i}`, 'dc:creator': 'Ana Huamán', authors: { author: [{ $: 'Ana Huamán' }, { $: 'Carlos Rojas' }] },
    'prism:publicationName': 'Teaching and Teacher Education', 'prism:volume': '120', 'prism:coverDate': '2023-02-01', 'prism:startingPage': '103901',
    'prism:doi': `10.1016/j.tate.2023.10390${i}`, pii: `S0742051X2200${String(i).padStart(4, '0')}`, openaccess: false });
/** @param {number} total @param {any[]} entradas */
const lista = (total, entradas) => JSON.stringify({ 'search-results': { 'opensearch:totalResults': String(total), entry: entradas } });

before(async () => {
    env = crearEntorno(fs.readFileSync(new URL('index.html', raiz), 'utf8'));
    env.document.readyState = 'interactive';
    sinRed();
    await import(new URL('src/main.js', raiz).href);
    await new Promise(r => setTimeout(r, 0));
    env.document.readyState = 'complete';
    env.disparar(env.document, 'DOMContentLoaded', { bubbles: false });
    const b = await import(new URL('src/buscador/index.js', raiz).href);
    await new Promise(r => setTimeout(r, 0));   // la microtarea de montaje
    A = b.Antecedentes; SD = b.ScienceDirectDirecto; P = b.ProtocoloBusqueda; PRISMA = b.PrismaDiagrama;
});

beforeEach(() => {
    sinRed(); pedidas = [];
    SD._reiniciar(); SD.INTERVALO_MS = 0; SD.ESPERA_REINTENTO_MS = 5;
    P.limpiar();
});

test('el formulario trae ScienceDirect: casilla desmarcada (Elsevier aún no habilita su API para las claves del sitio), cantidad, botón web; y la fuente se exporta', () => {
    assert.ok($('antUsarSciencedirect'), 'casilla'); assert.equal($('antUsarSciencedirect').checked, false, '(2026.12.28) desmarcada hasta que Elsevier habilite la API');
    assert.match($('antUsarSciencedirect').parentElement.textContent, /pendiente: Elsevier todavía no habilita su API para las claves del sitio/, 'la casilla dice por qué');
    assert.equal($('antCantidadSciencedirect').value, '50'); assert.equal($('antCantidadSciencedirect').getAttribute('max'), '6000'); assert.equal($('antCantidadSciencedirect').getAttribute('min'), '10');
    assert.ok($('antSciencedirectWeb'), 'botón «Abrir en ScienceDirect»');
    assert.equal(globalThis.StatSim.api.buscador.ScienceDirectDirecto, SD, 'expuesta por el puente de la consola');
    assert.match($('seccionAntecedentes').innerHTML, /Plataforma de una editorial<\/b> \(ScienceDirect, de Elsevier\)/, 'los conceptos clave la explican');
});

test('la búsqueda con ScienceDirect: obras con su base, el mensaje, el protocolo con la consulta literal y el conteo, y el PRISMA', async () => {
    globalThis.fetch = /** @type {any} */ (async (/** @type {string} */ u, /** @type {any} */ op = {}) => {
        pedidas.push(String(u));
        if (!/api\.elsevier\.com\/content\/search\/sciencedirect/.test(String(u))) throw new Error('sin red');
        assert.equal(op.headers, undefined);
        const cuantos = +(new URL(String(u)).searchParams.get('count') || 0);
        return new Response(lista(5321, Array.from({ length: cuantos }, (_, k) => entrada(k + 1))), { status: 200 });
    });
    $('antCantidadSciencedirect').value = '20';
    const r = await A._buscarUnaConsulta('burnout en los docentes', { desde: '2021' }, SOLO_SD);
    assert.equal(r.obras.length, 20, 'lo pedido en el formulario'); assert.deepEqual(r.obras[0].fuentesAPI, ['ScienceDirect']);
    const elsevier = new URL(pedidas.find(u => /sciencedirect\?/.test(u)) || '');
    assert.equal(elsevier.searchParams.get('count'), '25', 'la cantidad del formulario (20) llega a la petición: el menor tamaño que alcanza');
    assert.equal(elsevier.searchParams.get('query'), 'burnout docentes', 'los términos separados por espacios: AND implícito');
    assert.equal(elsevier.searchParams.get('date'), `2021-${new Date().getFullYear() + 1}`);
    assert.match(r.infos, /^ScienceDirect \(20 result\. de 5321\)$/);
    const fuente = P.resumen().fuentes.find((/** @type {any} */ f) => f.nombre === 'ScienceDirect');
    assert.ok(fuente, 'el protocolo registra la fuente'); assert.equal(fuente.totalResultados, 20);
    assert.ok(P.fichaHTML().includes('burnout docentes'), 'con la consulta literal que se envió (sin las palabras vacías), no la escrita');
    assert.ok(PRISMA._datos.identificados['ScienceDirect'] >= 20, 'PRISMA: identificados en ScienceDirect');
});

test('el mensaje dice lo que importa: términos fuera de la consulta, la vía de los proxies y el fallo', async () => {
    const original = SD.buscar;
    SD.buscar = async () => ({ obras: [], total: 0, paginas: 1, parcial: '1/3 páginas (HTTP 500)', descartados: 2, omitidos: 3, ecuacion: 'x', via: 'proxy' });
    try {
        let r = await A._buscarUnaConsulta('burnout', {}, SOLO_SD);
        assert.equal(r.infos, 'ScienceDirect (0 result., 3 término(s) fuera de la consulta: no caben en sus 250 caracteres, parcial: 1/3 páginas (HTTP 500), 2 registro(s) ilegible(s) descartado(s), vía proxy)');
        SD.buscar = async () => { throw new Error('Elsevier rechazó la clave (HTTP 401)'); };
        r = await A._buscarUnaConsulta('burnout', {}, SOLO_SD);
        assert.equal(r.infos, 'ScienceDirect falló (Elsevier rechazó la clave (HTTP 401))');
        const fuente = P.resumen().fuentes.find((/** @type {any} */ f) => f.nombre === 'ScienceDirect');
        assert.ok(fuente, 'el fallo también se registra (la búsqueda se lanzó)');
    } finally { SD.buscar = original; }
});

test('sin claves libres (todas rechazadas o sin cuota en esta sesión), ScienceDirect no se consulta ni entra en el protocolo', async () => {
    for (const k of SD._rotacion._claves) SD._rotacion.pausar(k, Infinity, 'cuota');
    const r = await A._buscarUnaConsulta('burnout', {}, SOLO_SD);
    assert.match(r.infos, /^ScienceDirect no se consultó \(las claves del sitio agotaron su cuota semanal de ScienceDirect/);
    assert.equal(pedidas.length, 0); assert.equal(P.resumen().fuentes.length, 0, 'el protocolo no registra lo que no se buscó');
});

test('una obra que encuentran Scopus y ScienceDirect: una fila con las dos bases; la indexación no nombra a ScienceDirect (no es un índice)', () => {
    const sd = SD.normalizar(entrada(3));
    const scopus = { ...sd, fuentesAPI: ['Scopus'], citas: 12, issn: '0742051X', doi: sd.doi.toUpperCase().replace('HTTPS://DOI.ORG/', 'https://doi.org/') };
    const indice = new Map(), acumuladas = /** @type {any[]} */ ([]);
    A._incorporarObras(indice, acumuladas, [scopus]);
    assert.equal(A._incorporarObras(indice, acumuladas, [sd]), 0, 'la de ScienceDirect no es nueva');
    assert.equal(acumuladas.length, 1); assert.deepEqual(acumuladas[0].fuentesAPI, ['Scopus', 'ScienceDirect']);
    assert.equal(acumuladas[0].citas, 12, 'las citas de Scopus se quedan');
    assert.equal(A._detectarIndexacion(acumuladas[0]), 'Scopus, Crossref');
    assert.equal(A._detectarIndexacion(sd), 'Crossref', 'sola, solo Crossref (por el DOI)');
    A._obras = acumuladas; A._pagina = 0; A._seleccion.clear();
    A._renderResultados(A._obras);
    assert.match($('antResultados').querySelector('tbody').textContent, /Scopus\+ScienceDirect/, 'la columna de la base');
    A._obras = [];
});

test('«Abrir en ScienceDirect»: la misma búsqueda en sciencedirect.com (traducida si English está marcado), con su rango de años', async () => {
    /** @type {any[]} */ const abiertas = [];
    globalThis.open = /** @type {any} */ ((/** @type {any[]} */ ...a) => { abiertas.push(a); return null; });
    globalThis.fetch = /** @type {any} */ (async (/** @type {string} */ u) => {
        if (/mymemory/.test(String(u))) return new Response(JSON.stringify({ responseStatus: 200, responseData: { translatedText: 'teacher burnout' } }), { status: 200 });
        throw new Error('sin red');
    });
    $('antQuery').value = 'burnout docente'; $('antDesde').value = '2022';
    const ingles = env.document.querySelector('#antIdiomas input[value="en"]');
    ingles.checked = true;
    env.disparar($('antSciencedirectWeb'), 'click');
    for (let i = 0; i < 20 && !abiertas.length; i++) await new Promise(r => setTimeout(r, 5));
    const fin = new Date().getFullYear() + 1;
    assert.deepEqual(abiertas, [[`https://www.sciencedirect.com/search?qs=teacher%20burnout&date=2022-${fin}`, '_blank', 'noopener']]);
    abiertas.length = 0; ingles.checked = false;
    env.disparar($('antSciencedirectWeb'), 'click');
    for (let i = 0; i < 20 && !abiertas.length; i++) await new Promise(r => setTimeout(r, 5));
    assert.equal(abiertas[0][0], `https://www.sciencedirect.com/search?qs=burnout%20docente&date=2022-${fin}`, 'sin English, tal cual');
    ingles.checked = true;
});

test('la guardia de fuentes: con solo ScienceDirect marcada, la búsqueda se lanza y el estado la nombra', async () => {
    for (const id of ['antUsarScholar', 'antUsarScopus', 'antUsarWos', 'antUsarPubmed', 'antUsarScielo', 'antUsarAlicia', 'antUsarOMS', 'antUsarONU', 'antUsarAbiertas']) $(id).checked = false;
    $('antUsarSciencedirect').checked = true;
    $('antQuery').value = 'agotamiento emocional docentes';
    env.document.querySelectorAll('#antIdiomas input').forEach((/** @type {any} */ i) => { i.checked = i.value === 'es'; });
    /** @type {string[]} */ const estados = [];
    globalThis.fetch = /** @type {any} */ (async (/** @type {string} */ u) => {
        pedidas.push(String(u)); estados.push($('antEstado').textContent);
        if (/api\.elsevier\.com\/content\/search\/sciencedirect/.test(String(u))) return new Response(lista(1, [entrada(4)]), { status: 200 });
        throw new Error('sin red');
    });
    await A._onBuscar();
    assert.match(estados[0], /— ScienceDirect…$/, 'el estado nombra la fuente: ' + estados[0]);
    assert.match($('antEstado').textContent, /^1 resultados combinados en .* — ScienceDirect \(1 result\.\)\. Marca los pertinentes:/);
    $('antUsarSciencedirect').checked = false;
    await A._onBuscar();
    assert.match($('antEstado').textContent, /Marca al menos una fuente/, 'sin ninguna, se niega');
    $('antUsarSciencedirect').checked = true;
    A._obras = [];
});

test('el enriquecimiento pone el ISSN que ScienceDirect no trae (de OpenAlex, solo de una revista): con él, la revista tiene cuartil', async () => {
    const o = SD.normalizar(entrada(7));
    assert.equal(o.issn, '');
    /** @type {string[]} */ const consultadas = [];
    const { ScopusDirecto: S } = await import(new URL('src/buscador/fuentes/scopus.js', raiz).href);
    const metricas = S.metricasRevista;
    S.metricasRevista = async (/** @type {string} */ issn) => { consultadas.push(issn); return { cuartil: 'Q1', citeScore: '7.2' }; };
    const abstractPorDoi = S.abstractPorDoi;
    S.abstractPorDoi = async () => '';
    let tipo = 'journal', issnL = '0742-051X', revistaOA = 'Teaching and Teacher Education';
    globalThis.fetch = /** @type {any} */ (async (/** @type {string} */ u) => {
        if (/api\.openalex\.org\/works\/doi:10\.1016\/j\.tate\.2023\.10390\d$/.test(String(u)))
            return new Response(JSON.stringify({ publication_year: 2023, primary_location: { source: { display_name: revistaOA, type: tipo, issn_l: issnL, issn: ['0742-051X', '1879-2480'] } } }), { status: 200 });
        throw new Error('sin red');
    });
    try {
        A._obras = [o];
        $('antEstado').textContent = 'Búsqueda hecha';
        await A._enriquecerAutomatico([o]);
        assert.equal(o.issn, '0742-051X', 'el ISSN-L de OpenAlex'); assert.deepEqual(consultadas, ['0742-051X'], 'y con él, las métricas de la revista');
        assert.equal(o._metricas.cuartil, 'Q1');
        assert.equal($('antEstado').textContent, 'Búsqueda hecha · Métricas de revista (cuartil) para 1 obra(s).',
            'el ISSN no cuenta como campo autocompletado (no se ve), ni el enlace al DOI que ya tenía: solo las métricas');
        // solo si OpenAlex habla de la misma revista: «&» y «and» son lo mismo; otra revista, no
        revistaOA = 'Teaching & Teacher Education';
        const igual = SD.normalizar(entrada(5));
        A._obras = [igual]; await A._enriquecerAutomatico([igual]);
        assert.equal(igual.issn, '0742-051X');
        revistaOA = 'The Teaching and Teacher Education';
        const conThe = SD.normalizar(entrada(2));
        A._obras = [conThe]; await A._enriquecerAutomatico([conThe]);
        assert.equal(conThe.issn, '0742-051X', 'tampoco cuenta un «The» delante');
        revistaOA = 'Learning and Instruction';
        const otra = SD.normalizar(entrada(6));
        A._obras = [otra]; await A._enriquecerAutomatico([otra]);
        assert.equal(otra.issn, '', 'si fuera de otra revista, el cuartil sería de otra');
        revistaOA = /** @type {any} */ (undefined);
        const sinNombre = SD.normalizar(entrada(4));
        A._obras = [sinNombre]; await A._enriquecerAutomatico([sinNombre]);
        assert.equal(sinNombre.issn, '', 'si OpenAlex no dice de qué revista es, no se puede comprobar: no se pone');
        revistaOA = 'Teaching and Teacher Education';
        assert.equal((await A._recuperarDatos('https://doi.org/10.1016/j.tate.2023.103907')).issn, '0742-051X');
        // el ISSN que ya traía la obra no se cambia
        const conIssn = { ...SD.normalizar(entrada(8)), issn: '1234-5678' };
        A._obras = [conIssn];
        await A._enriquecerAutomatico([conIssn]);
        assert.equal(conIssn.issn, '1234-5678');
        // la selección también lo completa
        const sel = SD.normalizar(entrada(9));
        A._obras = [sel]; A._seleccion.clear(); A._seleccion.set(A._norm(sel.titulo), sel);
        consultadas.length = 0;
        await A.enriquecerSeleccion();
        assert.equal(sel.issn, '0742-051X', '«✨ Reintentar completar» de la selección también pone el ISSN');
        assert.deepEqual(consultadas, ['0742-051X'], 'y trae el cuartil'); assert.equal(sel._metricas.cuartil, 'Q1');
        A._seleccion.clear();
        issnL = 'no es un ISSN';
        assert.equal((await A._recuperarDatos('10.1016/j.tate.2023.103907')).issn, '0742-051X', 'un ISSN-L ilegible: el primero de la lista');
        tipo = 'repository';
        assert.equal((await A._recuperarDatos('10.1016/j.tate.2023.103907')).issn, '', 'de un repositorio, no');
    } finally { S.metricasRevista = metricas; S.abstractPorDoi = abstractPorDoi; A._obras = []; }
});

test('el enriquecimiento pinta los resúmenes en cuanto llegan, sin esperar a las métricas de las revistas (que van por los proxies)', async () => {
    const o = SD.normalizar(entrada(3));
    const { ScopusDirecto: S } = await import(new URL('src/buscador/fuentes/scopus.js', raiz).href);
    const metricas = S.metricasRevista, abstractPorDoi = S.abstractPorDoi;
    /** @type {(v: any) => void} */ let soltar = () => {};
    S.metricasRevista = () => new Promise(resolver => { soltar = resolver; });
    S.abstractPorDoi = async () => '';
    globalThis.fetch = /** @type {any} */ (async (/** @type {string} */ u) => {
        if (/api\.openalex\.org\/works\/doi:10\.1016\/j\.tate\.2023\.103903$/.test(String(u)))
            return new Response(JSON.stringify({ abstract_inverted_index: { Burnout: [0], predicted: [1], emotional: [2], exhaustion: [3], in: [4], a: [5], 'three-wave': [6], study: [7], of: [8], teachers: [9] },
                primary_location: { source: { display_name: 'Teaching and Teacher Education', type: 'journal', issn_l: '0742-051X' } } }), { status: 200 });
        throw new Error('sin red');
    });
    try {
        A._obras = [o]; $('antEstado').textContent = 'Búsqueda hecha';
        const fin = A._enriquecerAutomatico([o]);
        for (let i = 0; i < 100 && !/Autocompletado/.test($('antEstado').textContent); i++) await new Promise(r => setTimeout(r, 5));
        assert.match($('antEstado').textContent, /Autocompletado: \d+ campos/, 'el resumen se pinta mientras las métricas siguen en camino');
        assert.match(o.resumen, /^Burnout predicted/);
        assert.doesNotMatch($('antEstado').textContent, /Métricas de revista/);
        soltar({ cuartil: 'Q2', citeScore: '3.1' });
        await fin;
        assert.match($('antEstado').textContent, /Métricas de revista \(cuartil\) para 1 obra\(s\)\.$/);
    } finally { S.metricasRevista = metricas; S.abstractPorDoi = abstractPorDoi; A._obras = []; }
});
