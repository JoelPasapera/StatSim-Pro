// @ts-check
// tests/integration/buscador-wos.test.js — (2026.12.26) la fuente Web of Science sin red: fetch simulado con respuestas
// con la forma que documenta la Web of Science Starter API (developer.clarivate.com/apis/wos-starter/swagger: metadata
// {total, page, limit} y hits con uid, title, source, names.authors, links.record, citations [{db, count}],
// identifiers y keywords). No son respuestas grabadas de la API real: este entorno no llega a Clarivate.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { WebOfScienceDirecto as W, nombreRevista } from '../../src/buscador/fuentes/wos.js';

const CLAVE = 'abcdef0123456789abcdef0123456789abcdef01';
const almacen = new Map();
/** @type {any} */ (globalThis).localStorage = { getItem: (/** @type {string} */ k) => (almacen.has(k) ? almacen.get(k) : null), setItem: (/** @type {string} */ k, /** @type {string} */ v) => { almacen.set(k, String(v)); }, removeItem: (/** @type {string} */ k) => { almacen.delete(k); } };

/** Un registro con la forma de la API. @param {number} i @param {object} [extra] */
const registro = (i, extra = {}) => ({
    uid: `WOS:0009${String(i).padStart(8, '0')}`, title: `Academic stress and sleep quality, study ${i}`, types: ['Article'], sourceTypes: ['Article'],
    source: { sourceTitle: 'JOURNAL OF AFFECTIVE DISORDERS', publishYear: 2022, publishMonth: 'MAR', volume: '301', issue: '2', pages: { range: `${100 + i}-${110 + i}`, begin: `${100 + i}`, end: `${110 + i}`, count: 11 } },
    names: { authors: [{ displayName: 'Quispe, Maria', wosStandard: 'Quispe, M', researcherId: 'A-1' }, { displayName: 'Torres, Luis', wosStandard: 'Torres, L' }] },
    links: { record: `https://www.webofscience.com/api/gateway?GWVersion=2&SrcApp=Publons&DestLinkType=FullRecord&DestApp=WOS_CPL&KeyUT=WOS:0009${String(i).padStart(8, '0')}` },
    citations: [{ db: 'WOS', count: i }], identifiers: { doi: `10.1016/j.jad.2022.${String(i).padStart(4, '0')}`, issn: '0165-0327', eissn: '1573-2517' },
    keywords: { authorKeywords: ['academic stress', 'sleep'] }, ...extra
});
/** @param {number} total @param {any[]} hits @param {number} [pagina] */
const lista = (total, hits, pagina = 1) => JSON.stringify({ metadata: { total, page: pagina, limit: 50 }, hits });

/** @type {{ url: string, cabeceras: Record<string, string> }[]} */
let peticiones = [];
/**
 * fetch simulado: cada petición la responde la función (con el número de la petición y la URL).
 * @param {(n: number, url: string) => Response | Promise<Response>} responder
 */
function instalar(responder) {
    peticiones = [];
    globalThis.fetch = /** @type {any} */ (async (/** @type {string} */ url, /** @type {any} */ op = {}) => {
        peticiones.push({ url: String(url), cabeceras: { ...(op.headers || {}) } });
        return responder(peticiones.length, String(url));
    });
}
/** @param {string} cuerpo @param {number} [status] @param {Record<string, string>} [cabeceras] */
const resp = (cuerpo, status = 200, cabeceras = {}) => new Response(cuerpo, { status, headers: { 'Content-Type': 'application/json', ...cabeceras } });
/** @param {string} url */
const paginaDe = url => +(new URL(url).searchParams.get('page') || 0);

beforeEach(() => {
    almacen.clear();
    W.RELEVO_URL = ''; W._claveMemoria = ''; W._agotada = ''; W._proximoTurno = 0;
    W.INTERVALO_MS = 0; W.ESPERA_REINTENTO_MS = 5; W.ESPERA_MAX_MS = 20;
});

test('la ecuación: los términos en TS unidos por AND, sin los operadores de Web of Science, y el rango de años', () => {
    const fin = new Date().getFullYear() + 1;
    assert.equal(W.ecuacion('¿Existe relación entre el estrés académico y la calidad del sueño?', { desde: '2021' }),
        `TS=(existe AND relacion AND estres AND academico AND calidad AND sueno) AND PY=(2021-${fin})`);
    assert.equal(W.ecuacion('anxiety NOT depression NEAR same OR and', {}), 'TS=(anxiety AND depression)', 'AND, OR, NOT, NEAR y SAME no entran como palabras');
    assert.equal(W.ecuacion('de la y en', { desde: 2020 }), '', 'sin términos, sin ecuación');
    assert.equal(W.ecuacion('burnout', { desde: 3000 }), `TS=(burnout) AND PY=(${fin}-${fin})`, 'un año de inicio futuro se acota');
    assert.equal(W.ecuacion('burnout', { desde: 'abc' }), 'TS=(burnout)', 'sin año válido, sin filtro de años');
});

test('la URL: la Starter API v1 (o el relevo), Colección Principal, por relevancia, con todo codificado', () => {
    const u = new URL(W.construirURL('estrés académico', { desde: 2020 }));
    assert.equal(u.origin + u.pathname, 'https://api.clarivate.com/apis/wos-starter/v1/documents');
    assert.equal(u.searchParams.get('db'), 'WOS'); assert.equal(u.searchParams.get('limit'), '50'); assert.equal(u.searchParams.get('page'), '1');
    assert.equal(u.searchParams.get('sortField'), 'RS+D');
    assert.match(W.construirURL('estrés', {}), /sortField=RS%2BD/, 'el «+» viaja como %2B');
    assert.match(W.construirURL('estrés académico', {}), /q=TS%3D\(estres%20AND%20academico\)/, 'los espacios como %20, nunca como «+»');
    W.RELEVO_URL = 'https://wos.ejemplo.workers.dev/';
    assert.ok(W.construirURL('estrés', {}).startsWith('https://wos.ejemplo.workers.dev/documents?db=WOS&q='), 'con relevo, la misma ruta en el relevo');
});

test('el nombre de la revista: de mayúsculas a mayúsculas iniciales (siglas, romanos y cifras, tal cual)', () => {
    const casos = {
        'FRONTIERS IN PSYCHOLOGY': 'Frontiers in Psychology', 'BMC PSYCHIATRY': 'BMC Psychiatry', 'JMIR MENTAL HEALTH': 'JMIR Mental Health',
        'INTERNATIONAL JOURNAL OF ENVIRONMENTAL RESEARCH AND PUBLIC HEALTH': 'International Journal of Environmental Research and Public Health',
        'REVISTA DE PSICOLOGIA DEL TRABAJO Y DE LAS ORGANIZACIONES': 'Revista de Psicologia del Trabajo y de las Organizaciones',
        'EDUCACION XX1': 'Educacion XX1', 'ADHD-ATTENTION DEFICIT AND HYPERACTIVITY DISORDERS': 'ADHD-Attention Deficit and Hyperactivity Disorders',
        'THE JOURNAL OF PSYCHOLOGY': 'The Journal of Psychology', 'PSYCHOLOGY: RESEARCH AND REVIEW': 'Psychology: Research and Review',
        "CHILDREN'S HEALTH CARE": "Children's Health Care", 'PSICOLOGIA EDUCATIVA (MADRID)': 'Psicologia Educativa (Madrid)',
        'EUROPEAN CHILD & ADOLESCENT PSYCHIATRY': 'European Child & Adolescent Psychiatry', 'Frontiers in Psychology': 'Frontiers in Psychology', '': '',
        'PLoS ONE': 'PLoS ONE', 'npj Science of Learning': 'npj Science of Learning',   // con alguna minúscula: tal cual
        // una letra de serie al final o pegada a un guion no es una conjunción
        'PHYSICAL REVIEW E': 'Physical Review E', 'PROCEEDINGS OF THE ROYAL SOCIETY B-BIOLOGICAL SCIENCES': 'Proceedings of the Royal Society B-Biological Sciences',
        'JOURNAL OF PHYSICS A-MATHEMATICAL AND THEORETICAL': 'Journal of Physics A-Mathematical and Theoretical', 'ACTA PSYCHOLOGICA PART A': 'Acta Psychologica Part A',
        'SALUD Y DROGAS': 'Salud y Drogas'
    };
    for (const [entra, sale] of Object.entries(casos)) assert.equal(nombreRevista(entra), sale, entra);
});

test('un registro se normaliza al formato común: autores, año, DOI, revista, páginas, citas, ISSN y la base', () => {
    const o = W.normalizar(registro(7));
    assert.equal(o.titulo, 'Academic stress and sleep quality, study 7');
    assert.deepEqual(o.autores, ['Quispe, Maria', 'Torres, Luis']); assert.equal(o.anio, '2022');
    assert.equal(o.doi, 'https://doi.org/10.1016/j.jad.2022.0007'); assert.equal(o.link, o.doi, 'con DOI, el enlace es el DOI');
    assert.equal(o.fuente, 'Journal of Affective Disorders'); assert.equal(o._revistaProvisional, true);
    assert.equal(o.volumen, '301'); assert.equal(o.numero, '2'); assert.equal(o.paginas, '107-117');
    assert.equal(o.citas, 7); assert.equal(o.issn, '0165-0327'); assert.equal(o.keywords, 'academic stress; sleep');
    assert.equal(W.normalizar(registro(7, { citations: [{ db: 'BCI', count: 30 }, { db: 'WOS', count: 7 }, { db: 'MEDLINE', count: 12 }] })).citas, 7, 'las de la Colección Principal, no la mayor');
    assert.deepEqual(o.fuentesAPI, ['Web of Science']); assert.equal(o.resumen, '', 'la API no trae resumen');
});

test('casos límite de la normalización: sin DOI, número de artículo, autor corporativo, citas de otra base, texto con etiquetas', () => {
    const sinDoi = W.normalizar(registro(1, { identifiers: { issn: '', eissn: '1664-1078' }, source: { sourceTitle: 'Frontiers in Psychology', publishYear: '2021', articleNumber: '845123' }, citations: [{ db: 'BCI', count: '4' }] }));
    assert.equal(sinDoi.doi, ''); assert.match(sinDoi.link, /^https:\/\/www\.webofscience\.com\/api\/gateway\?/, 'sin DOI, el enlace al registro');
    assert.equal(sinDoi.paginas, 'Artículo 845123'); assert.equal(sinDoi.issn, '1664-1078'); assert.equal(sinDoi.citas, 4, 'sin la entrada WOS, la mayor');
    assert.equal(sinDoi.fuente, 'Frontiers in Psychology'); assert.equal(sinDoi._revistaProvisional, false, 'ya traía minúsculas');
    const raro = W.normalizar({ uid: 'WOS:1"><script>', title: 'Effects of <i>in vivo</i> exposure (p < .05 and q > .01)', source: {}, names: { corp: [{ displayName: 'World Health Organization' }] }, identifiers: { doi: '10.1000/abc"onmouseover="x' }, links: { record: 'javascript:alert(1)' } });
    assert.equal(raro.titulo, 'Effects of in vivo exposure (p < .05 and q > .01)', 'se quitan las etiquetas, no los signos');
    assert.deepEqual(raro.autores, ['World Health Organization'], 'sin personas, el autor corporativo');
    assert.equal(raro.doi, '', 'un DOI con comillas no entra en un href'); assert.equal(raro.link, '', 'ni un enlace que no sea https ni un uid con signos');
    assert.equal(raro.anio, 's. f.'); assert.equal(raro.citas, 0); assert.equal(raro.fuente, '');
    assert.equal(W.normalizar({}).titulo, '(sin título)');
    const sici = W.normalizar(registro(2, { identifiers: { doi: '10.1002/(SICI)1097-4679(199901)55:1<1::AID-JCLP1>3.0.CO;2-H' } }));
    assert.equal(sici.doi, 'https://doi.org/10.1002/(SICI)1097-4679(199901)55:1<1::AID-JCLP1>3.0.CO;2-H', 'los DOI SICI llevan ángulos (al pintarse se escapan)');
    assert.equal(W.normalizar(registro(3, { keywords: { authorKeywords: 'una sola' } })).keywords, '', 'palabras clave que no son una lista: sin romper');
});

test('buscar (directo): la clave en la cabecera X-ApiKey, páginas de 50 seguidas hasta lo pedido y sin repetir registros', async () => {
    W.guardarClave(CLAVE);
    const todos = Array.from({ length: 120 }, (_, i) => registro(i + 1));
    instalar((n, url) => { const p = paginaDe(url); return resp(lista(120, p === 3 ? [...todos.slice(100, 120), todos[0]] : todos.slice((p - 1) * 50, p * 50), p)); });
    const r = await W.buscar('estrés académico sueño', { desde: 2020, maxResultados: 130 });
    assert.equal(peticiones.length, 3, 'tres páginas de 50 para 120 resultados');
    assert.deepEqual(peticiones.map(p => paginaDe(p.url)), [1, 2, 3]);
    for (const p of peticiones) { assert.equal(p.cabeceras['X-ApiKey'], CLAVE); assert.ok(!p.url.includes(CLAVE), 'la clave nunca va en la URL'); }
    assert.equal(r.obras.length, 120, 'el registro repetido de la página 3 no se duplica'); assert.equal(r.total, 120);
    assert.equal(r.paginas, 3); assert.equal(r.parcial, ''); assert.equal(r.conCitas, true); assert.equal(r.via, 'directo');
    assert.match(r.ecuacion, /^TS=\(estres AND academico AND sueno\) AND PY=\(2020-/);
});

test('buscar: pide solo lo necesario (límite de la página = lo pedido si es menos de 50) y se detiene en una página corta', async () => {
    W.guardarClave(CLAVE);
    instalar(() => resp(lista(500, Array.from({ length: 20 }, (_, i) => registro(i)))));
    const r = await W.buscar('burnout docente', { maxResultados: 20 });
    assert.equal(peticiones.length, 1); assert.equal(new URL(peticiones[0].url).searchParams.get('limit'), '20'); assert.equal(r.obras.length, 20);
    instalar((n, url) => resp(lista(500, paginaDe(url) === 1 ? Array.from({ length: 50 }, (_, i) => registro(i)) : [registro(60), registro(61)])));
    const r2 = await W.buscar('burnout docente', { maxResultados: 1000 });
    assert.equal(peticiones.length, 2, 'la página 2 vino corta: no se piden más'); assert.equal(r2.obras.length, 52);
});

test('buscar: con un número de resultados que no es múltiplo de 50, se recorta exactamente a lo pedido', async () => {
    W.guardarClave(CLAVE);
    instalar((n, url) => { const p = paginaDe(url); return resp(lista(400, Array.from({ length: 50 }, (_, i) => registro((p - 1) * 50 + i)), p)); });
    const r = await W.buscar('estrés', { maxResultados: 70 });
    assert.equal(peticiones.length, 2); assert.equal(r.obras.length, 70); assert.equal(r.obras[69].titulo, 'Academic stress and sleep quality, study 69');
});

test('buscar: un registro que no se puede normalizar se salta sin tirar la búsqueda', async () => {
    W.guardarClave(CLAVE);
    instalar(() => resp(lista(3, [registro(1), registro(2), registro(3)])));
    const original = W.normalizar;
    W.normalizar = function (/** @type {any} */ h) { if (h.uid === registro(2).uid) throw new TypeError('forma inesperada'); return original.call(this, h); };
    try {
        const r = await W.buscar('estrés', {});
        assert.deepEqual(r.obras.map(o => o.titulo), ['Academic stress and sleep quality, study 1', 'Academic stress and sleep quality, study 3']);
        assert.equal(r.descartados, 1, 'y se cuenta');
    } finally { W.normalizar = original; }
});

test('buscar: sin coincidencias devuelve una lista vacía (un cero es un cero) y sin citas no se afirma el plan', async () => {
    W.guardarClave(CLAVE);
    instalar(() => resp(lista(0, [])));
    const r = await W.buscar('zzzz qqqq', {});
    assert.deepEqual(r.obras, []); assert.equal(r.total, 0); assert.equal(peticiones.length, 1); assert.equal(r.conCitas, false);
});

test('sin clave ni relevo, o sin términos, no se gasta ninguna petición', async () => {
    instalar(() => resp(lista(0, [])));
    await assert.rejects(W.buscar('estrés', {}), e => e.wos === true && e.sinConfigurar === true);
    W.guardarClave(CLAVE);
    await assert.rejects(W.buscar('de la y', {}), e => e.sinTerminos === true);
    assert.equal(peticiones.length, 0);
});

test('401: clave rechazada, sin reintento y con el motivo de Clarivate', async () => {
    W.guardarClave(CLAVE);
    instalar(() => resp(JSON.stringify({ error: 'invalid_client', error_description: 'Invalid ApiKey' }), 401));
    await assert.rejects(W.buscar('estrés', {}), e => e.auth === true && /rechazó la clave \(HTTP 401: Invalid ApiKey\)/.test(e.message));
    assert.equal(peticiones.length, 1);
});

test('429 pasajero (el límite por segundo): espera y reintenta una vez; un 5xx, igual', async () => {
    W.guardarClave(CLAVE);
    instalar(n => (n === 1 ? resp('{"error":"Too Many Requests"}', 429, { 'Retry-After': '0' }) : resp(lista(1, [registro(1)]))));
    assert.equal((await W.buscar('estrés', {})).obras.length, 1); assert.equal(peticiones.length, 2);
    instalar(n => (n === 1 ? resp('upstream error', 503) : resp(lista(1, [registro(2)]))));
    assert.equal((await W.buscar('estrés', {})).obras.length, 1); assert.equal(peticiones.length, 2);
});

test('un 503 seguido de un 429 no es la cuota del día; un 429 que pide esperar una hora, sí (sin esperar)', async () => {
    W.guardarClave(CLAVE);
    instalar(n => (n === 1 ? resp('caído', 503) : resp('{"error":"Too Many Requests"}', 429)));
    await assert.rejects(W.buscar('estrés', {}), e => e.limitado === true && !e.cuota && /HTTP 429/.test(e.message));
    assert.equal(W.cuotaAgotada(), false); assert.equal(peticiones.length, 2);
    const t0 = Date.now();
    instalar(() => resp('{"error":"quota"}', 429, { 'Retry-After': '3600' }));
    await assert.rejects(W.buscar('estrés', {}), e => e.cuota === true);
    assert.equal(peticiones.length, 1, 'no se reintenta lo que pide esperar una hora'); assert.ok(Date.now() - t0 < 1000);
    assert.equal(W.cuotaAgotada(), true);
});

test('la cuota se agota a mitad de la paginación: se devuelven las páginas anteriores y la credencial queda marcada', async () => {
    W.guardarClave(CLAVE);
    instalar((n, url) => (paginaDe(url) === 1 ? resp(lista(300, Array.from({ length: 50 }, (_, i) => registro(i)))) : resp('{"error":"quota"}', 429)));
    const r = await W.buscar('estrés', { maxResultados: 150 });
    assert.equal(r.obras.length, 50); assert.match(r.parcial, /^1\/3 páginas \(tu clave agotó su cuota de hoy/);
    assert.equal(W.cuotaAgotada(), true);
});

test('429 dos veces: la cuota del día; la credencial queda marcada y no se gastan más peticiones hasta cambiar de clave', async () => {
    W.guardarClave(CLAVE);
    instalar(() => resp('{"error":"Too Many Requests"}', 429));
    await assert.rejects(W.buscar('estrés', {}), e => e.cuota === true && /tu clave agotó su cuota de hoy/.test(e.message));
    assert.equal(peticiones.length, 2); assert.equal(W.cuotaAgotada(), true);
    await assert.rejects(W.buscar('ansiedad', {}), e => e.cuota === true);
    assert.equal(peticiones.length, 2, 'la segunda búsqueda no llega a la red');
    W.guardarClave('ffffffffffffffff0000000000000000');
    assert.equal(W.cuotaAgotada(), false, 'otra clave, otra cuota');
});

test('una página que no es la primera falla: se devuelven las anteriores, contiguas, y se dice en «parcial»', async () => {
    W.guardarClave(CLAVE);
    instalar((n, url) => (paginaDe(url) === 2 ? resp('{"error":{"status":500,"title":"Internal"}}', 500) : resp(lista(150, Array.from({ length: 50 }, (_, i) => registro(i))))));
    const r = await W.buscar('estrés', { maxResultados: 150 });
    assert.equal(r.obras.length, 50); assert.equal(r.paginas, 1); assert.match(r.parcial, /^1\/3 páginas \(Clarivate no respondió bien \(HTTP 500: Internal\)\)$/);
    assert.equal(peticiones.length, 3, 'la página 2 con su reintento; la 3 no se pide');
});

test('sin respuesta: en directo es el bloqueo CORS (sin reintento); por el relevo, un fallo de red con un reintento', async () => {
    W.guardarClave(CLAVE);
    instalar(() => { throw new TypeError('Failed to fetch'); });
    await assert.rejects(W.buscar('estrés', {}), e => e.cors === true && /CORS/.test(e.message) && /relevo/.test(e.message));
    assert.equal(peticiones.length, 1);
    W.olvidarClave(); W.RELEVO_URL = 'https://wos.ejemplo.workers.dev';
    instalar(() => { throw new TypeError('Failed to fetch'); });
    await assert.rejects(W.buscar('estrés', {}), e => e.red === true && /relevo/.test(e.message));
    assert.equal(peticiones.length, 2);
});

test('por el relevo: sin clave propia no se envía X-ApiKey; con ella, sí; y sus códigos de error se explican', async () => {
    W.RELEVO_URL = 'https://wos.ejemplo.workers.dev';
    instalar(() => resp(lista(1, [registro(3)])));
    const r = await W.buscar('estrés', {});
    assert.equal(r.via, 'relevo'); assert.ok(peticiones[0].url.startsWith('https://wos.ejemplo.workers.dev/documents?'));
    assert.equal(peticiones[0].cabeceras['X-ApiKey'], undefined, 'las claves las pone el relevo');
    W.guardarClave(CLAVE);
    instalar(() => resp(lista(1, [registro(3)])));
    await W.buscar('estrés', {}); assert.equal(peticiones[0].cabeceras['X-ApiKey'], CLAVE, 'la clave del usuario viaja al relevo');
    W.olvidarClave();
    instalar(() => resp(JSON.stringify({ error: 'origen no autorizado', codigo: 'ORIGEN' }), 403));
    await assert.rejects(W.buscar('estrés', {}), e => e.auth === true && /ORIGENES/.test(e.message));
    instalar(() => resp(JSON.stringify({ error: 'el relevo no tiene claves', codigo: 'SIN_CLAVES' }), 503));
    await assert.rejects(W.buscar('estrés', {}), e => /WOS_KEY_1/.test(e.message));
    instalar(() => resp(JSON.stringify({ error: 'demasiadas búsquedas desde esta red en poco tiempo', codigo: 'IP_RATE' }), 429, { 'Retry-After': '0' }));
    await assert.rejects(W.buscar('estrés', {}), e => /desde esta red/.test(e.message) && !e.cuota);
    assert.equal(peticiones.length, 1, 'el límite del relevo no se reintenta'); assert.equal(W.cuotaAgotada(), false, 'ni se toma por la cuota de Clarivate');
    instalar(() => resp(JSON.stringify({ error: 'limit debe ser un entero entre 1 y 50', codigo: 'PARAMETROS' }), 400));
    await assert.rejects(W.buscar('estrés', {}), e => /el relevo rechazó la petición \(limit debe ser/.test(e.message));
    W.RELEVO_URL = '';
});

test('sin red y tiempo agotado: mensajes propios (el tiempo agotado se reintenta una vez)', async () => {
    W.guardarClave(CLAVE);
    const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
    try {
        instalar(() => { throw new TypeError('Failed to fetch'); });
        await assert.rejects(W.buscar('estrés', {}), e => e.red === true && /sin conexión a internet/.test(e.message));
    } finally { if (nav) Object.defineProperty(globalThis, 'navigator', nav); else delete (/** @type {any} */ (globalThis)).navigator; }
    W.TIMEOUT_MS = 30;
    try {
        globalThis.fetch = /** @type {any} */ ((/** @type {string} */ url, /** @type {any} */ op) => { peticiones.push({ url, cabeceras: {} }); return new Promise((_, rechazar) => op.signal.addEventListener('abort', () => rechazar(Object.assign(new Error('aborted'), { name: 'AbortError' })))); });
        peticiones = [];
        await assert.rejects(W.buscar('estrés', {}), e => e.timeout === true && /tardó más de/.test(e.message));
        assert.equal(peticiones.length, 2);
    } finally { W.TIMEOUT_MS = 20000; }
});

test('400: la ecuación rechazada, con el detalle y sin reintento', async () => {
    W.guardarClave(CLAVE);
    instalar(() => resp(JSON.stringify({ error: { status: 400, title: 'Bad request', details: 'Search query syntax error' } }), 400));
    await assert.rejects(W.buscar('estrés', {}), e => e.consulta === true && /HTTP 400: Search query syntax error/.test(e.message));
    assert.equal(peticiones.length, 1);
});

test('respuesta ilegible o sin la lista de registros: un reintento y luego el error', async () => {
    W.guardarClave(CLAVE);
    instalar(() => resp('<html>gateway</html>', 200));
    await assert.rejects(W.buscar('estrés', {}), e => /respuesta inesperada/.test(e.message));
    assert.equal(peticiones.length, 2);
    instalar(() => resp(JSON.stringify({ metadata: { total: 3 } }), 200));
    await assert.rejects(W.buscar('estrés', {}), e => /respuesta inesperada/.test(e.message), 'JSON válido pero sin «hits»');
});

test('el ritmo: una petición cada INTERVALO_MS, también entre búsquedas simultáneas', async () => {
    W.guardarClave(CLAVE); W.INTERVALO_MS = 40;
    /** @type {number[]} */
    const tiempos = [];
    instalar(() => { tiempos.push(Date.now()); return resp(lista(1, [registro(1)])); });
    const inicio = Date.now();
    await Promise.all([W.buscar('uno', {}), W.buscar('dos', {}), W.buscar('tres', {})]);
    tiempos.sort((a, b) => a - b);
    // cada petición sale en su turno o después (la carga del equipo solo puede retrasarlas, nunca adelantarlas)
    assert.ok(tiempos[1] - inicio >= 39 && tiempos[2] - inicio >= 79, 'turnos: ' + tiempos.map(t => t - inicio).join(', '));
});

test('probar(): una petición mínima; dice el camino y si el plan trae citas, y limpia una cuota marcada', async () => {
    W.guardarClave(CLAVE); W._agotada = W._credencial();
    instalar(() => resp(lista(1234567, [registro(1, { citations: undefined })])));
    const r = await W.probar();
    assert.deepEqual(r, { via: 'directo', total: 1234567, conCitas: false });
    const u = new URL(peticiones[0].url); assert.equal(u.searchParams.get('q'), 'TS=(psychology)'); assert.equal(u.searchParams.get('limit'), '1');
    assert.equal(W.cuotaAgotada(), false);
});

test('la clave: se valida, se guarda en este navegador, se muestra abreviada y se olvida; sin almacenamiento, vale en la sesión', () => {
    assert.throws(() => W.guardarClave('con espacios dentro de la clave'), /no parece válida/);
    assert.throws(() => W.guardarClave('corta'), /no parece válida/);
    assert.throws(() => W.guardarClave(CLAVE + '\r\nX-Otra: 1'), /no parece válida/, 'nada de inyectar cabeceras');
    assert.equal(W.guardarClave('  ' + CLAVE + '  '), true); assert.equal(almacen.get('statsim_wos_clave'), CLAVE);
    assert.equal(W.claveVisible(), '…ef01'); assert.equal(W.modo(), 'directo'); assert.equal(W.configurada(), true);
    assert.equal(W.claveRecordada(), true);
    W.olvidarClave(); assert.equal(W.clave(), ''); assert.equal(almacen.has('statsim_wos_clave'), false); assert.equal(W.modo(), '');
    W.guardarClave(CLAVE); assert.equal(W.guardarClave(CLAVE, { recordar: false }), false, 'sin recordar no se guarda');
    assert.equal(almacen.has('statsim_wos_clave'), false, 'y se borra la que había'); assert.equal(W.clave(), CLAVE); assert.equal(W.claveRecordada(), false);
    W.olvidarClave();
    const original = /** @type {any} */ (globalThis).localStorage;
    /** @type {any} */ (globalThis).localStorage = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); }, removeItem() { throw new Error('bloqueado'); } };
    try {
        assert.equal(W.guardarClave(CLAVE), false, 'no se pudo guardar'); assert.equal(W.clave(), CLAVE, 'pero vale en la sesión');
        W.olvidarClave(); assert.equal(W.clave(), '');
    } finally { /** @type {any} */ (globalThis).localStorage = original; }
});
