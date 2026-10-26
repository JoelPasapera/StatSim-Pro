// @ts-check
// tests/integration/buscador-sciencedirect.test.js — (2026.12.27) la fuente ScienceDirect sin red: fetch simulado con
// respuestas con la forma que documenta Elsevier para la ScienceDirect Search API (dev.elsevier.com: la interfaz GET, que
// responde como la v1 —search-results con opensearch:totalResults y entry—, con los campos de la vista STANDARD de
// sd_search_views: link ref=self/scidir, prism:url, dc:identifier, openaccess, dc:title, prism:publicationName,
// prism:volume, prism:startingPage, prism:endingPage, prism:coverDate, dc:creator, authors/author, prism:doi y pii; y la v2,
// {resultsFound, results}) y la que lee pybliometrics de la API real (authors.author como lista de {"$": nombre}). No son
// respuestas grabadas de la API real: este entorno no llega a Elsevier.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ScienceDirectDirecto as SD } from '../../src/buscador/fuentes/sciencedirect.js';
import { CLAVES_ELSEVIER, RotacionClaves } from '../../src/buscador/fuentes/claves-elsevier.js';
import { ScopusDirecto } from '../../src/buscador/fuentes/scopus.js';
import { ProxiesCORS } from '../../src/shared/proxies.js';

/** Un registro con la forma de la interfaz GET. @param {number} i @param {object} [extra] */
const entrada = (i, extra = {}) => {
    const n = String(i).padStart(5, '0'), pii = `S01650327240${n}`;
    return {
        '@_fa': 'true', 'load-date': '2024-03-01T00:00:00.000Z',
        link: [{ '@_fa': 'true', '@ref': 'self', '@href': `https://api.elsevier.com/content/article/pii/${pii}` },
            { '@_fa': 'true', '@ref': 'scidir', '@href': `https://www.sciencedirect.com/science/article/pii/${pii}?dgcid=api_sd_search-api-endpoint` }],
        'dc:identifier': `DOI:10.1016/j.jad.2024.${n}`, 'prism:url': `https://api.elsevier.com/content/article/pii/${pii}`,
        'dc:title': `Academic stress and sleep quality in university students, study ${i}`, 'dc:creator': 'María Quispe',
        'prism:publicationName': 'Journal of Affective Disorders', 'prism:volume': '348', 'prism:coverDate': '2024-03-01',
        'prism:startingPage': `${100 + i}`, 'prism:endingPage': `${110 + i}`, openaccess: false, pii,
        'prism:doi': `10.1016/j.jad.2024.${n}`, authors: { author: [{ $: 'María Quispe' }, { $: 'Luis Torres' }] }, ...extra
    };
};
/** @param {number} total @param {any[]} entradas @param {number} [inicio] */
const lista = (total, entradas, inicio = 0) => JSON.stringify({ 'search-results': {
    'opensearch:totalResults': String(total), 'opensearch:startIndex': String(inicio), 'opensearch:itemsPerPage': String(entradas.length),
    'opensearch:Query': { '@role': 'request', '@searchTerms': 'x', '@startPage': String(inicio) }, link: [], entry: entradas } });
const VACIA = JSON.stringify({ 'search-results': { 'opensearch:totalResults': '0', 'opensearch:startIndex': '0', 'opensearch:itemsPerPage': '0',
    entry: [{ '@_fa': 'true', error: 'Result set was empty' }] } });

/** @type {string[]} */
let peticiones = [];
/**
 * fetch simulado: cada petición la responde la función (con el número de la petición y la URL).
 * @param {(n: number, url: URL) => Response | Promise<Response>} responder
 */
function instalar(responder) {
    peticiones = [];
    globalThis.fetch = /** @type {any} */ (async (/** @type {string} */ url, /** @type {any} */ op = {}) => {
        assert.equal(op.headers, undefined, 'sin cabeceras propias: el navegador la manda sin comprobación previa CORS');
        peticiones.push(String(url));
        return responder(peticiones.length, new URL(String(url)));
    });
}
/** @param {string} cuerpo @param {number} [status] @param {Record<string, string>} [cabeceras] */
const resp = (cuerpo, status = 200, cabeceras = {}) => new Response(cuerpo, { status, headers: { 'Content-Type': 'application/json', ...cabeceras } });
/** @param {URL} u @param {string} k */
const num = (u, k) => +(u.searchParams.get(k) || 0);
/** Los registros de una página de un conjunto de «total». @param {URL} u @param {number} total */
const tramo = (u, total) => { const s = num(u, 'start'), c = num(u, 'count'); return lista(total, Array.from({ length: Math.max(0, Math.min(c, total - s)) }, (_, k) => entrada(s + k)), s); };

const carreraOriginal = ProxiesCORS.carrera;
beforeEach(() => {
    SD._reiniciar(); SD.INTERVALO_MS = 0; SD.ESPERA_REINTENTO_MS = 5; SD.VENTANA = 4; SD.TIMEOUT_DIRECTO_MS = 9000; SD.TIMEOUT_PROXY_MS = 20000; SD.PAUSA_LIMITE_MS = 30000;
    SD._rotacion = new RotacionClaves(CLAVES_ELSEVIER, { inicio: 0 });   // en el sitio, el turno empieza en una clave al azar
});
afterEach(() => { ProxiesCORS.carrera = carreraOriginal; });

test('la consulta: los términos separados por espacios (AND implícito, sin «not»), hasta 250 caracteres, y el rango de años', () => {
    assert.equal(SD.ecuacion('¿Existe relación entre el estrés académico y la calidad del sueño?'), 'existe relacion estres academico calidad sueno');
    assert.equal(SD.ecuacion('anxiety NOT depression OR and'), 'anxiety depression', 'NOT, OR y AND no entran como palabras');
    assert.equal(SD.ecuacion('de la y en'), '', 'sin términos, sin consulta');
    const largos = Array.from({ length: 30 }, (_, i) => `termino${String(i).padStart(3, '0')}`).join(' ');
    const { ecuacion, omitidos } = SD._armar(largos);
    assert.equal(ecuacion.split(' ').length, 22, 'sin conectores caben 22 términos de 10 letras (con « AND », 16)');
    assert.ok(ecuacion.length <= 250 && ecuacion.length > 238, `${ecuacion.length} caracteres`);
    assert.equal(omitidos, 8, 'los que no caben se cuentan');
    assert.equal(SD._armar(`${'x'.repeat(300)} burnout`).ecuacion, 'burnout', 'un término que no cabe se salta');
    const fin = new Date().getFullYear() + 1;
    assert.equal(SD.rangoAnios({ desde: '2021' }), `2021-${fin}`);
    assert.equal(SD.rangoAnios({ desde: 3000 }), `${fin}-${fin}`, 'un año de inicio futuro se acota');
    assert.equal(SD.rangoAnios({ desde: 'abc' }), ''); assert.equal(SD.rangoAnios({}), ''); assert.equal(SD.rangoAnios({ desde: 99 }), '');
});

test('la URL: la ScienceDirect Search API por GET (query, date, JSON, start y count), sin la clave; y la búsqueda web', () => {
    const fin = new Date().getFullYear() + 1;
    const u = new URL(SD.construirURL('estrés académico', { desde: 2020 }));
    assert.equal(u.origin + u.pathname, 'https://api.elsevier.com/content/search/sciencedirect');
    assert.equal(u.searchParams.get('query'), 'estres academico'); assert.equal(u.searchParams.get('date'), `2020-${fin}`);
    assert.equal(u.searchParams.get('httpAccept'), 'application/json'); assert.equal(u.searchParams.get('start'), '0');
    assert.equal(u.searchParams.get('count'), '50', 'por omisión, 50 (una petición)');
    assert.equal(u.searchParams.get('apiKey'), null, 'la clave se añade al pedir cada página');
    assert.match(SD.construirURL('estrés académico', {}), /query=estres%20academico&httpAccept=/, 'espacios como %20 y sin date si no hay año');
    assert.equal(SD.urlPublica('burnout docente', { desde: 2022 }), `https://www.sciencedirect.com/search?qs=burnout%20docente&date=2022-${fin}`);
    assert.equal(SD.urlPublica('de la', {}), 'https://www.sciencedirect.com/search?qs=de%20la', 'sin términos, la consulta tal cual');
});

test('un registro de la interfaz GET se normaliza al formato común: autores, año, DOI, revista, volumen, páginas y la base', () => {
    const o = SD.normalizar(entrada(7));
    assert.equal(o.titulo, 'Academic stress and sleep quality in university students, study 7');
    assert.deepEqual(o.autores, ['María Quispe', 'Luis Torres']); assert.equal(o.anio, '2024');
    assert.equal(o.doi, 'https://doi.org/10.1016/j.jad.2024.00007'); assert.equal(o.link, o.doi, 'con DOI, el enlace es el DOI');
    assert.equal(o.fuente, 'Journal of Affective Disorders'); assert.equal(o.volumen, '348'); assert.equal(o.numero, ''); assert.equal(o.paginas, '107-117');
    assert.equal(o.citas, 0, 'la API no trae citas'); assert.equal(o.resumen, '', 'ni resumen'); assert.equal(o.issn, '');
    assert.deepEqual(o.fuentesAPI, ['ScienceDirect']);
    // el registro de la documentación de pybliometrics (la API real): sin página final ni volumen
    const pyb = SD.normalizar({ authors: { author: [{ $: 'Dong He' }, { $: 'Wenhua Qian' }, { $: 'Jinde Cao' }] }, 'dc:creator': 'Dong He', 'prism:doi': '10.1016/j.cag.2025.104181',
        'dc:title': 'GEAST-RF: Geometry Enhanced 3D Arbitrary Style Transfer Via Neural Radiance Fields', link: [{ '@ref': 'scidir', '@href': 'https://www.sciencedirect.com/science/article/pii/S0097849325000202?dgcid=api_sd_search-api-endpoint' }],
        'load-date': '2025-02-16T00:00:00.000Z', openaccess: false, pii: 'S0097849325000202', 'prism:coverDate': '2025-02-16', 'prism:endingPage': null,
        'prism:publicationName': 'Computers & Graphics', 'prism:startingPage': '104181', 'prism:url': 'https://api.elsevier.com/content/article/pii/S0097849325000202', 'prism:volume': null });
    assert.deepEqual(pyb.autores, ['Dong He', 'Wenhua Qian', 'Jinde Cao']); assert.equal(pyb.anio, '2025');
    assert.equal(pyb.paginas, 'Artículo 104181', 'el número de artículo, como lo pide la referencia APA');
    assert.equal(pyb.volumen, ''); assert.equal(pyb.fuente, 'Computers & Graphics');
    /** @param {string} ini @param {string | null} fin */
    const pag = (ini, fin) => SD.normalizar(entrada(1, { 'prism:startingPage': ini, 'prism:endingPage': fin })).paginas;
    assert.equal(pag('e12345', null), 'Artículo e12345'); assert.equal(pag('104181', '104181'), 'Artículo 104181', 'la misma página de inicio y de fin');
    assert.equal(pag('1234', null), '1234', 'cuatro cifras: una página'); assert.equal(pag('12345', null), 'Artículo 12345', 'cinco cifras: artículo'); assert.equal(pag('10234', '10240'), '10234-10240', 'con página final, páginas');
    assert.equal(pag('S12', null), 'S12');
});

test('las formas que varían: valores envueltos, un solo autor, el DOI en dc:identifier, sin DOI (el enlace al artículo) y la v2', () => {
    const envuelta = SD.normalizar(entrada(1, { 'prism:coverDate': [{ '@_fa': 'true', $: '2019-06-30' }], 'prism:doi': undefined, authors: { author: 'Ana Huamán' },
        'prism:volume': { $: '12' }, 'prism:issueIdentifier': { '#text': '3' }, 'prism:startingPage': '45', 'prism:endingPage': '45' }));
    assert.equal(envuelta.anio, '2019'); assert.equal(envuelta.doi, 'https://doi.org/10.1016/j.jad.2024.00001', 'de dc:identifier «DOI:…»');
    assert.deepEqual(envuelta.autores, ['Ana Huamán']); assert.equal(envuelta.volumen, '12'); assert.equal(envuelta.numero, '3', 'también «#text»');
    assert.equal(envuelta.paginas, '45', 'una sola página');
    const sinDoi = SD.normalizar(entrada(2, { 'prism:doi': '', 'dc:identifier': '', authors: null }));
    assert.equal(sinDoi.doi, ''); assert.equal(sinDoi.link, 'https://www.sciencedirect.com/science/article/pii/S0165032724000002', 'el artículo, por su PII (sin el rastreador)');
    assert.deepEqual(sinDoi.autores, ['María Quispe'], 'sin lista, el primer autor');
    const sinPii = SD.normalizar(entrada(3, { 'prism:doi': '', 'dc:identifier': '', pii: '' }));
    assert.match(sinPii.link, /^https:\/\/www\.sciencedirect\.com\/science\/article\/pii\/S0165032724000003\?dgcid=/, 'sin PII, el enlace scidir');
    const v2 = SD.normalizar({ authors: [{ order: 2, name: 'Luis Torres' }, { order: 1, name: 'María Quispe' }], doi: '10.1016/j.infsof.2018.07.010', loadDate: '2018-07-24T00:00:00.000Z',
        openAccess: false, pages: { first: '37', last: '52' }, pii: 'S0950584918301563', publicationDate: '2018-07-17', sourceTitle: 'Information and Software Technology',
        title: 'A v2 result', uri: 'https://www.sciencedirect.com/science/article/pii/S0950584918301563', volumeIssue: 'Volume 104, Issue 2, December 2018' });
    assert.deepEqual(v2.autores, ['María Quispe', 'Luis Torres'], 'por su «order»'); assert.equal(v2.anio, '2018'); assert.equal(v2.paginas, '37-52');
    assert.equal(v2.volumen, '104'); assert.equal(v2.numero, '2'); assert.equal(v2.fuente, 'Information and Software Technology');
    assert.equal(v2.doi, 'https://doi.org/10.1016/j.infsof.2018.07.010');
    const viejo = SD.normalizar({ 'dc:title': 'v1', authors: { author: [{ 'given-name': 'Lars', surname: 'Smith' }, { 'given-name': 'Ana', surname: 'Ríos' }] } });
    assert.deepEqual(viejo.autores, ['Lars Smith', 'Ana Ríos'], 'nombre y apellido por separado (la v1)');
    const repetidos = SD.normalizar(entrada(4, { authors: { author: [{ $: 'Dong He' }, { $: 'Wenhua Qian' }, { $: 'Dong He' }] } }));
    assert.deepEqual(repetidos.autores, ['Dong He', 'Wenhua Qian'], 'sin repetir (como pybliometrics)');
    const portada = SD.normalizar(entrada(5, { 'prism:coverDate': '', 'prism:coverDisplayDate': '1 March 2021' }));
    assert.equal(portada.anio, '2021', 'el año de la fecha de portada escrita');
    for (const forma of ['https://doi.org/10.1016/J.JAD.2024.00006', 'http://dx.doi.org/10.1016/J.JAD.2024.00006', 'doi: 10.1016/J.JAD.2024.00006'])
        assert.equal(SD.normalizar(entrada(6, { 'prism:doi': forma })).doi, 'https://doi.org/10.1016/J.JAD.2024.00006', `el DOI sin su resolvedor ni prefijo: ${forma}`);
    assert.equal(SD.normalizar({}).titulo, '(sin título)'); assert.equal(SD.normalizar({}).anio, 's. f.');
});

test('lo hostil no entra: etiquetas y entidades fuera del texto, ni DOI con comillas ni enlaces que no sean de ScienceDirect', () => {
    const raro = SD.normalizar({ 'dc:title': 'Effects of <i>in vivo</i> exposure &amp; anxiety (p < .05 and q > .01)', 'prism:publicationName': 'Health &amp; <b>Care</b>',
        'prism:doi': '10.1000/abc"onmouseover="x', pii: '"><script>', link: [{ '@ref': 'scidir', '@href': 'javascript:alert(1)' }], uri: 'https://evil.example/x',
        authors: { author: [{ $: '<img src=x onerror=alert(1)>Quispe' }] } });
    assert.equal(raro.titulo, 'Effects of in vivo exposure & anxiety (p < .05 and q > .01)', 'se quitan las etiquetas, no los signos');
    assert.equal(raro.fuente, 'Health & Care'); assert.deepEqual(raro.autores, ['Quispe']);
    assert.equal(raro.doi, ''); assert.equal(raro.link, '', 'ni «javascript:», ni otro sitio, ni un PII con signos');
});

test('buscar (directo): la clave en la URL por turno, páginas de 100 de cuatro en cuatro hasta lo pedido, en orden y sin repetir', async () => {
    let enVuelo = 0, maxEnVuelo = 0;
    instalar(async (n, u) => {
        enVuelo++; maxEnVuelo = Math.max(maxEnVuelo, enVuelo);
        try {
            // las páginas responden desordenadas: el ensamblado respeta el orden de relevancia
            await new Promise(r => setTimeout(r, num(u, 'start') === 100 ? 40 : 10));
            if (num(u, 'start') === 500) return resp(lista(560, [entrada(500), ...Array.from({ length: 59 }, (_, k) => entrada(501 + k)), entrada(0)], 500));
            return resp(tramo(u, 560));
        } finally { enVuelo--; }
    });
    const r = await SD.buscar('estrés académico sueño', { desde: 2020, maxResultados: 1000 });
    assert.equal(peticiones.length, 6, 'seis páginas de 100 para 560 resultados');
    assert.equal(maxEnVuelo, 4, 'tras la primera, cuatro a la vez (VENTANA)');
    const urls = peticiones.map(p => new URL(p));
    assert.deepEqual(urls.map(u => num(u, 'start')).sort((a, b) => a - b), [0, 100, 200, 300, 400, 500]);
    assert.ok(urls.every(u => u.searchParams.get('count') === '100' && u.searchParams.get('query') === 'estres academico sueno' && /^2020-/.test(u.searchParams.get('date') || '')));
    const claves = urls.map(u => u.searchParams.get('apiKey'));
    assert.equal(new Set(claves).size, 6, 'cada página con una clave'); assert.ok(claves.every(k => CLAVES_ELSEVIER.includes(String(k))));
    assert.equal(r.obras.length, 560, 'el registro repetido de la última página no se duplica'); assert.equal(r.total, 560);
    assert.deepEqual(r.obras.slice(98, 102).map(o => o.titulo.replace(/.*study /, '')), ['98', '99', '100', '101'], 'en el orden de las páginas');
    assert.equal(r.paginas, 6); assert.equal(r.parcial, ''); assert.equal(r.via, 'directo'); assert.equal(r.descartados, 0); assert.equal(r.omitidos, 0);
    assert.equal(r.ecuacion, 'estres academico sueno');
});

test('buscar: pide solo lo necesario (el menor «count» que alcanza), recorta a lo pedido y se detiene en una página corta', async () => {
    instalar((n, u) => resp(tramo(u, 5000)));
    let r = await SD.buscar('burnout docente', { maxResultados: 30 });
    assert.equal(peticiones.length, 1); assert.equal(new URL(peticiones[0]).searchParams.get('count'), '50'); assert.equal(r.obras.length, 30);
    peticiones = []; r = await SD.buscar('burnout docente', { maxResultados: 10 });
    assert.equal(new URL(peticiones[0]).searchParams.get('count'), '10'); assert.equal(r.obras.length, 10);
    peticiones = []; r = await SD.buscar('burnout docente', {});
    assert.equal(peticiones.length, 1, 'por omisión, 50 = una petición'); assert.equal(r.obras.length, 50);
    peticiones = []; r = await SD.buscar('burnout docente', { maxResultados: 250 });
    assert.equal(peticiones.length, 3); assert.equal(r.obras.length, 250);
    instalar((n, u) => resp(num(u, 'start') === 100 ? lista(5000, [entrada(100), entrada(101)], 100) : tramo(u, 5000)));
    r = await SD.buscar('burnout docente', { maxResultados: 300 });
    assert.equal(r.obras.length, 102, 'la página corta es el final real'); assert.equal(r.parcial, '');
    SD.VENTANA = 1;
    instalar((n, u) => resp(num(u, 'start') === 100 ? lista(5000, [entrada(100), entrada(101)], 100) : tramo(u, 5000)));
    await SD.buscar('burnout docente', { maxResultados: 500 });
    assert.deepEqual(peticiones.map(p => num(new URL(p), 'start')), [0, 100], 'tras la página corta, ninguna más');
});

test('buscar: el techo de la API (6000: start ≤ 6000 − count) y el total real mandan sobre lo pedido', async () => {
    instalar((n, u) => resp(tramo(u, 1e6)));
    const r = await SD.buscar('ansiedad', { maxResultados: 99999 });
    assert.equal(r.obras.length, 6000); assert.equal(peticiones.length, 60);
    assert.equal(Math.max(...peticiones.map(p => num(new URL(p), 'start'))), 5900);
    instalar((n, u) => { const s = num(u, 'start'); return resp(lista(1e6, Array.from({ length: 25 }, (_, k) => entrada(s + k)), s)); });
    const r25 = await SD.buscar('ansiedad', { maxResultados: 99999 });
    assert.equal(Math.max(...peticiones.map(p => num(new URL(p), 'start'))), 5900, 'con páginas de 25 y count=100, el último start sigue siendo 6000 − 100');
    assert.equal(r25.obras.length, 5925);
    instalar((n, u) => resp(tramo(u, 120)));
    const r2 = await SD.buscar('ansiedad', { maxResultados: 1000 });
    assert.equal(peticiones.length, 2, '120 resultados: dos páginas'); assert.equal(r2.obras.length, 120);
});

test('una primera página anómala (menos registros que la página más pequeña, con más por traer) no se pagina: se dice', async () => {
    instalar((n, u) => { const s = num(u, 'start'); return resp(lista(500, [entrada(s), entrada(s + 1), entrada(s + 2)], s)); });
    const r = await SD.buscar('estrés', { maxResultados: 6000 });
    assert.equal(peticiones.length, 1, 'no cientos de peticiones de la cuota compartida'); assert.equal(r.obras.length, 3);
    assert.match(r.parcial, /la API entregó solo 3 registro\(s\) de 500/);
    instalar((n, u) => { const s = num(u, 'start'); return resp(lista(500, Array.from({ length: 9 }, (_, k) => entrada(s + k)), s)); });
    await SD.buscar('estrés', { maxResultados: 100 });
    assert.equal(peticiones.length, 1, 'nueve registros: anómala');
    instalar((n, u) => { const s = num(u, 'start'); return resp(lista(500, Array.from({ length: 10 }, (_, k) => entrada(s + k)), s)); });
    await SD.buscar('estrés', { maxResultados: 100 });
    assert.equal(peticiones.length, 10, 'diez, la página más pequeña de la API: se pagina con ella');
    instalar(() => resp(lista(50, [], 0)));
    const vacia = await SD.buscar('estrés', { maxResultados: 100 });
    assert.equal(peticiones.length, 1, 'una primera página vacía tampoco se pagina'); assert.deepEqual(vacia.obras, []);
});

test('sin coincidencias: una lista vacía (un cero es un cero), con la forma de la v1 y con la de la v2', async () => {
    instalar(() => resp(VACIA));
    let r = await SD.buscar('zzzz qqqq', {});
    assert.deepEqual(r.obras, []); assert.equal(r.total, 0); assert.equal(peticiones.length, 1);
    instalar(() => resp(JSON.stringify({ resultsFound: 0, results: [] })));
    r = await SD.buscar('zzzz qqqq', {});
    assert.deepEqual(r.obras, []); assert.equal(r.total, 0);
    instalar(() => resp(JSON.stringify({ resultsFound: 2, results: [{ title: 'Uno', doi: '10.1016/j.x.2020.1', publicationDate: '2020-01-01' }, { title: 'Dos', pii: 'S0000000000000002' }] })));
    r = await SD.buscar('algo', {});
    assert.deepEqual(r.obras.map(o => o.titulo), ['Uno', 'Dos'], 'la respuesta de la v2 también se lee');
});

test('sin términos no se gasta ninguna petición', async () => {
    instalar(() => resp(VACIA));
    await assert.rejects(SD.buscar('de la y', {}), e => e.sciencedirect === true && e.sinTerminos === true);
    assert.equal(peticiones.length, 0);
});

test('la API entrega menos registros por página de los pedidos: se pagina con los que entrega de verdad', async () => {
    instalar((n, u) => { const s = num(u, 'start'); return resp(lista(130, Array.from({ length: Math.min(25, 130 - s) }, (_, k) => entrada(s + k)), s)); });
    const r = await SD.buscar('estrés', { maxResultados: 100 });
    assert.deepEqual(peticiones.map(p => num(new URL(p), 'start')).sort((a, b) => a - b), [0, 25, 50, 75]);
    assert.ok(peticiones.every(p => new URL(p).searchParams.get('count') === '100'), 'se sigue pidiendo lo mismo');
    assert.equal(r.obras.length, 100); assert.equal(r.obras[99].titulo.replace(/.*study /, ''), '99');
});

test('si la API rechaza las páginas de 100 (HTTP 400), se piden de 25 y se recuerda en la sesión', async () => {
    instalar((n, u) => (num(u, 'count') > 25 ? resp('{"service-error":{"status":{"statusCode":"INVALID_INPUT","statusText":"Invalid count"}}}', 400) : resp(tramo(u, 60))));
    const r = await SD.buscar('estrés', { maxResultados: 60 });
    assert.equal(r.obras.length, 60); assert.equal(peticiones.length, 1 + 3, 'la de 100 rechazada y tres de 25');
    assert.equal(SD._tamanoMax, 25);
    instalar((n, u) => resp(tramo(u, 60)));
    await SD.buscar('ansiedad', { maxResultados: 60 });
    assert.ok(peticiones.every(p => new URL(p).searchParams.get('count') === '25'), 'ya no se pide de 100');
});

test('400 por la consulta: se dice con el detalle de Elsevier y no se rota la clave', async () => {
    instalar(() => resp('{"service-error":{"status":{"statusCode":"INVALID_INPUT","statusText":"Invalid query syntax"}}}', 400));
    await assert.rejects(SD.buscar('estrés', { maxResultados: 10 }), e => e.consulta === true && /rechazó la consulta \(HTTP 400: INVALID_INPUT — Invalid query syntax\)/.test(e.message));
    assert.equal(peticiones.length, 1, 'con 10 por página no hay nada que reducir'); assert.equal(SD.disponible(), true);
    instalar(() => resp('<service-error><status><statusCode>INVALID_INPUT</statusCode><statusText>Bad query</statusText></status></service-error>', 400, { 'Content-Type': 'text/xml' }));
    await assert.rejects(SD.buscar('estrés', { maxResultados: 10 }), e => /HTTP 400: INVALID_INPUT Bad query/.test(e.message), 'también el error en XML');
});

test('401/403: la clave rechazada queda fuera el resto de la sesión y la página sale con la siguiente', async () => {
    const mala = CLAVES_ELSEVIER[0];
    instalar((n, u) => (u.searchParams.get('apiKey') === mala ? resp('{"service-error":{"status":{"statusCode":"AUTHENTICATION_ERROR","statusText":"Invalid API Key"}}}', 401) : resp(tramo(u, 3))));
    const r = await SD.buscar('estrés', {});
    assert.equal(r.obras.length, 3); assert.equal(peticiones.length, 2);
    assert.equal(new URL(peticiones[0]).searchParams.get('apiKey'), mala); assert.notEqual(new URL(peticiones[1]).searchParams.get('apiKey'), mala);
    assert.equal(/** @type {any} */ (SD._rotacion)._pausas.get(mala).hasta, Infinity, 'el resto de la sesión');
    peticiones = [];
    for (let i = 0; i < 10; i++) await SD.buscar('estrés', {});
    assert.equal(peticiones.length, 10); assert.ok(peticiones.every(p => new URL(p).searchParams.get('apiKey') !== mala), 'no se vuelve a gastar en ella');
});

test('todas las claves rechazadas: el motivo que dio Elsevier, y la fuente ya no gasta peticiones (disponible() lo dice antes de buscar)', async () => {
    // (2026.12.28) lo que respondió la API real a las claves del sitio: la clave vale (Scopus Search responde), pero
    // Elsevier no le tiene habilitada la ScienceDirect Search API
    const NO_HABILITADA = '{"service-error":{"status":{"statusCode":"AUTHORIZATION_ERROR","statusText":"The requestor is not authorized to access the requested view or fields of the resource"}}}';
    instalar(() => resp(NO_HABILITADA, 401));
    await assert.rejects(SD.buscar('estrés', {}), e => e.auth === true
        && /^Elsevier no ha habilitado la ScienceDirect Search API para las claves del sitio \(HTTP 401: AUTHORIZATION_ERROR — The requestor is not authorized to access the requested view or fields of the resource\): el acceso a esta API hay que pedírselo a Elsevier$/.test(e.message));
    assert.equal(peticiones.length, CLAVES_ELSEVIER.length, 'una vez cada clave');
    assert.equal(SD.disponible(), false); assert.match(SD.motivoNoDisponible(), /^Elsevier no ha habilitado la ScienceDirect Search API para las claves del sitio \(HTTP 401: AUTHORIZATION_ERROR/);
    instalar(() => resp(VACIA));
    await assert.rejects(SD.buscar('ansiedad', {}), e => e.auth === true);
    assert.equal(peticiones.length, 0, 'la segunda búsqueda no llega a la red');
    // una clave inválida es otra cosa: el motivo tal cual, sin hablar de habilitar la API
    SD._reiniciar(); assert.equal(SD._rechazo, '', 'reiniciar olvida el motivo');
    instalar(() => resp('{"service-error":{"status":{"statusCode":"AUTHENTICATION_ERROR","statusText":"Invalid API Key"}}}', 401));
    await assert.rejects(SD.buscar('estrés', {}), e => e.auth === true && /^Elsevier rechazó todas las claves del sitio para ScienceDirect \(HTTP 401: AUTHENTICATION_ERROR — Invalid API Key\)$/.test(e.message));
    // por los proxies, el error llega en el cuerpo, sin el código HTTP: el motivo, igual
    SD._reiniciar(); SD._directoOK = false;
    ProxiesCORS.carrera = /** @type {any} */ (async (/** @type {string} */ url, /** @type {(t: string) => any} */ validar) => { validar(NO_HABILITADA); throw new Error('ningún proxy respondió'); });
    await assert.rejects(SD.buscar('estrés', {}), e => e.auth === true
        && /^Elsevier no ha habilitado la ScienceDirect Search API para las claves del sitio \(AUTHORIZATION_ERROR — The requestor is not authorized/.test(e.message));
    // y un 403 de Elsevier sin cuerpo legible: el código, al menos
    SD._reiniciar(); SD._directoOK = null;
    instalar(() => resp('', 403));
    await assert.rejects(SD.buscar('estrés', {}), e => /^Elsevier rechazó todas las claves del sitio para ScienceDirect \(HTTP 403\)$/.test(e.message));
    // sin ningún motivo guardado (claves apartadas sin pasar por una respuesta): el genérico
    SD._reiniciar();
    for (const k of CLAVES_ELSEVIER) SD._rotacion.pausar(k, Infinity, 'auth');
    assert.match(SD.motivoNoDisponible(), /^Elsevier rechazó todas las claves del sitio para ScienceDirect \(HTTP 401\/403\)$/);
});

test('un 403 con una página HTML (un cortafuegos de la red, no Elsevier): no aparta ninguna clave; en directo, la petición sigue por los proxies', async () => {
    const html = '<!DOCTYPE html><html><body>Access denied by your network administrator</body></html>';
    instalar(() => resp(html, 403, { 'Content-Type': 'text/html' }));
    let n = 0;
    ProxiesCORS.carrera = /** @type {any} */ (async (/** @type {string} */ url, /** @type {(t: string) => any} */ validar) => { n++; return { obras: validar(lista(1, [entrada(1)])), proxy: 'simulado' }; });
    const r = await SD.buscar('estrés', {});
    assert.equal(r.obras.length, 1); assert.equal(r.via, 'proxy', 'los proxies no están detrás de ese cortafuegos');
    assert.equal(peticiones.length, 1); assert.equal(n, 1); assert.equal(SD._rotacion.libres(), CLAVES_ELSEVIER.length);
    // por los proxies: el arsenal deja ver el 403 del destino y el validador vio la página HTML
    SD._reiniciar(); SD._directoOK = false; n = 0;
    ProxiesCORS.carrera = /** @type {any} */ (async (/** @type {string} */ url, /** @type {(t: string) => any} */ validar) => {
        n++; validar(html); throw Object.assign(new Error('destino HTTP403 — el problema está en la fuente'), { destino: true, destinoStatus: 403 });
    });
    await assert.rejects(SD.buscar('estrés', {}), e => !e.auth && /algo entre el navegador y Elsevier rechazó la petición \(HTTP 403/.test(e.message));
    assert.equal(n, 1, 'sin recorrer las ocho claves'); assert.equal(SD._rotacion.libres(), CLAVES_ELSEVIER.length);
    // en cambio, el 403 de Elsevier (su JSON) por los proxies sí aparta la clave
    SD._reiniciar(); SD._directoOK = false;
    ProxiesCORS.carrera = /** @type {any} */ (async (/** @type {string} */ url, /** @type {(t: string) => any} */ validar) => {
        validar('{"service-error":{"status":{"statusCode":"AUTHORIZATION_ERROR","statusText":"Not entitled"}}}');
        throw Object.assign(new Error('destino HTTP403'), { destino: true, destinoStatus: 403 });
    });
    await assert.rejects(SD.buscar('estrés', {}), e => e.auth === true);
    assert.equal(SD._rotacion.motivos().auth, CLAVES_ELSEVIER.length);
});

test('429 con la cuota de la semana agotada (X-ELS-Status QUOTA_EXCEEDED, «quedan 0», o Reset sin Remaining si las cabeceras se leen): la clave descansa hasta el reinicio', async () => {
    const [primera, segunda, tercera, cuarta] = CLAVES_ELSEVIER;
    const reinicio = String(Math.floor(Date.now() / 1000) + 3600);
    /** @param {string | null} k */
    const responder = k => {
        if (k === primera) return resp('', 429, { 'X-ELS-Status': 'QUOTA_EXCEEDED - Quota Exceeded', 'X-RateLimit-Reset': reinicio });
        if (k === segunda) return resp('', 429, { 'X-RateLimit-Reset': reinicio });   // la cabecera de estado no se ve, y falta Remaining
        if (k === tercera) return resp('{"error-response":{"error-code":"TOO_MANY_REQUESTS","error-message":"Rate limit"}}', 429);   // el ritmo
        if (k === cuarta) return resp('', 429, { 'X-RateLimit-Remaining': '0' });   // «quedan 0»
        return resp(lista(5, [1, 2, 3, 4, 5].map(i => entrada(i))), 200, { 'X-RateLimit-Remaining': '19870', 'X-RateLimit-Reset': reinicio });
    };
    instalar((n, u) => responder(u.searchParams.get('apiKey')));
    const r = await SD.buscar('estrés', {});
    assert.equal(r.obras.length, 5); assert.equal(peticiones.length, 5);
    assert.deepEqual(SD._rotacion.motivos(), { auth: 0, cuota: 2, limite: 2 }, 'sin haber leído antes Remaining, «Reset sin Remaining» es un frenazo');
    const pausas = /** @type {any} */ (SD._rotacion)._pausas;
    const p = pausas.get(primera).hasta - Date.now(); assert.ok(p > 3500e3 && p <= 3600e3, 'hasta el reinicio: ' + p);
    assert.equal(pausas.get(cuarta).hasta, Infinity, '«quedan 0» sin reinicio legible: el resto de la sesión');
    const pl = pausas.get(tercera).hasta - Date.now(); assert.ok(pl > 25e3 && pl <= SD.PAUSA_LIMITE_MS, 'el frenazo, un rato: ' + pl);
    assert.equal(SD._cabecerasLegibles, true, 'la respuesta correcta dejó ver X-RateLimit-Remaining');
    const legibles = SD._cabecerasLegibles; SD._reiniciar(); assert.equal(SD._cabecerasLegibles, false, 'reiniciar olvida lo aprendido'); SD._cabecerasLegibles = legibles;
    // ya se sabe que las cabeceras se leen: «Reset sin Remaining» es la cuota
    SD._rotacion = new RotacionClaves(CLAVES_ELSEVIER, { inicio: 1 });
    peticiones = [];
    await SD.buscar('estrés', {});
    assert.equal(new URL(peticiones[0]).searchParams.get('apiKey'), segunda);
    assert.deepEqual(SD._rotacion.motivos(), { auth: 0, cuota: 2, limite: 1 }, 'ahora «Reset sin Remaining» (la segunda) es la cuota, como «quedan 0» (la cuarta)');
    // un reinicio a un mes vista no aparta la clave más de una semana; sin reinicio legible, el resto de la sesión
    SD._rotacion = new RotacionClaves(CLAVES_ELSEVIER, { inicio: 0 }); SD._reiniciar();
    const pausas2 = /** @type {any} */ (SD._rotacion)._pausas;
    instalar((n, u) => (u.searchParams.get('apiKey') === primera ? resp('', 429, { 'X-ELS-Status': 'QUOTA_EXCEEDED', 'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 30 * 86400) })
        : u.searchParams.get('apiKey') === segunda ? resp('', 429, { 'X-ELS-Status': 'QUOTA_EXCEEDED - Quota Exceeded' }) : resp(tramo(u, 1))));
    await SD.buscar('estrés', {});
    const p1 = pausas2.get(primera).hasta - Date.now();
    assert.ok(p1 <= SD.PAUSA_CUOTA_MAX_MS && p1 > SD.PAUSA_CUOTA_MAX_MS - 5000, 'como mucho una semana: ' + p1);
    assert.equal(pausas2.get(segunda).hasta, Infinity);
    // el código de la cuota en el cuerpo de un 429 directo, sin cabeceras a la vista
    SD._reiniciar();
    instalar((n, u) => (u.searchParams.get('apiKey') === primera ? resp('{"service-error":{"status":{"statusCode":"QUOTA_EXCEEDED","statusText":"Quota Exceeded"}}}', 429) : resp(tramo(u, 1))));
    await SD.buscar('estrés', {});
    assert.equal(pausas2.get(primera).hasta, Infinity); assert.equal(SD._rotacion.motivos().cuota, 1);
});

test('un 429 sin más (el ritmo): la clave descansa 30 s, más si se repite sin una respuesta correcta entre medias (30 s, 10 min, 1 h); nunca se da por agotada', async () => {
    let ahora = 1e6;
    const [k1, k2] = ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'];
    SD._rotacion = new RotacionClaves([k1, k2], { inicio: 0, reloj: () => ahora });
    let k1frena = true;
    instalar((n, u) => (u.searchParams.get('apiKey') === k1 && k1frena ? resp('{"error-response":{"error-code":"TOO_MANY_REQUESTS"}}', 429) : resp(lista(1, [entrada(1)]))));
    const pausaDe = () => /** @type {any} */ (SD._rotacion)._pausas.get(k1).hasta - ahora;
    await SD.buscar('uno', {});
    assert.equal(pausaDe(), 30000); assert.deepEqual(SD._rotacion.motivos(), { auth: 0, cuota: 0, limite: 1 });
    ahora += 30001;
    await SD.buscar('dos', {});
    assert.equal(pausaDe(), 600000, 'el segundo seguido: 10 min');
    ahora += 600001;
    await SD.buscar('tres', {});
    assert.equal(pausaDe(), 3600000, 'el tercero: 1 h'); assert.equal(SD._rotacion.motivos().cuota, 0, 'sin darla por agotada: eso solo lo dice Elsevier');
    ahora += 3600001; k1frena = false;
    peticiones = [];
    await SD.buscar('cuatro', {});
    assert.equal(new URL(peticiones[0]).searchParams.get('apiKey'), k1, 'vuelve a usarse'); k1frena = true;
    await SD.buscar('cinco', {}); await SD.buscar('seis', {});
    assert.equal(pausaDe(), 30000, 'tras una respuesta correcta, la cuenta vuelve a empezar');
});

test('una ráfaga de 429 con más páginas a la vez que claves libres: ninguna página sale con una clave que ya frenaron, y cada clave cuenta un frenazo', async () => {
    SD.INTERVALO_MS = 50;
    const [kA, kB] = ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'];
    SD._rotacion = new RotacionClaves([kA, kB], { inicio: 0 });
    /** @type {string[]} */
    const conPausa = [];
    instalar((n, u) => {
        const k = u.searchParams.get('apiKey') || '';
        if (num(u, 'start') === 0) return resp(tramo(u, 500));
        if (SD._rotacion.enPausa(k)) conPausa.push(`${k[0]}@${num(u, 'start')}`);
        return resp('{"error-response":{"error-code":"TOO_MANY_REQUESTS"}}', 429);
    });
    const r = await SD.buscar('estrés', { maxResultados: 500 });
    assert.equal(r.obras.length, 100); assert.match(r.parcial, /vuelve a intentarlo en un minuto\)$/);
    assert.deepEqual(conPausa, [], 'la clave frenada mientras otra página esperaba su turno no sale');
    // (2027.01.14, revisión) la primera página y una por clave; con la máquina cargada, una más puede salir con una clave cuyo 429
    // aún no se ha leído (el turno de 50 ms vence antes): es de la misma ráfaga. Hasta la 2027.01.13 se pedían 3 justas, y la
    // pausa, de más de 25 s (con 5 s de margen): en una batería completa falló una vez de cada varias.
    assert.ok(peticiones.length >= 3 && peticiones.length <= 1 + SD.VENTANA, `la primera página y una por clave (como mucho, una por página a la vez): ${peticiones.length}`);
    const rot = /** @type {any} */ (SD._rotacion);
    for (const k of [kA, kB]) {
        assert.equal(rot._frenazos.get(k), 1);
        const p = rot._pausas.get(k).hasta - Date.now(); assert.ok(p > 0 && p <= 30e3, 'una ráfaga: 30 s, no 10 min ni 1 h: ' + p);
    }
});

test('los 429 de las páginas que ya iban en vuelo cuando llegó el primero son la misma ráfaga: la clave no escala', async () => {
    SD.INTERVALO_MS = 20;
    const [kA, kB] = ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'];
    SD._rotacion = new RotacionClaves([kA, kB], { inicio: 0 });
    instalar(async (n, u) => {
        if (num(u, 'start') === 0) return resp(tramo(u, 500));
        await new Promise(r => setTimeout(r, 150));   // Elsevier tarda: las otras páginas salen antes de que llegue el primer 429
        return resp('{"error-response":{"error-code":"TOO_MANY_REQUESTS"}}', 429);
    });
    await SD.buscar('estrés', { maxResultados: 500 });
    const rot = /** @type {any} */ (SD._rotacion);
    assert.ok(peticiones.length > 3, 'hubo peticiones en vuelo con la misma clave: ' + peticiones.length);
    for (const k of [kA, kB]) {
        assert.equal(rot._frenazos.get(k), 1, 'una ráfaga, un frenazo');
        const p = rot._pausas.get(k).hasta - Date.now(); assert.ok(p > 25e3 && p <= 30e3, 'y descansa desde su último 429: ' + p);
    }
});

test('todas las claves sin cuota: el motivo, sin esperar; todas frenadas: cuándo volver a intentarlo', async () => {
    instalar(() => resp('', 429, { 'X-ELS-Status': 'QUOTA_EXCEEDED - Quota Exceeded' }));
    const t0 = Date.now();
    await assert.rejects(SD.buscar('estrés', {}), e => e.cuota === true && /agotaron su cuota semanal de ScienceDirect/.test(e.message));
    assert.ok(Date.now() - t0 < 2000); assert.equal(SD.disponible(), false); assert.equal(peticiones.length, CLAVES_ELSEVIER.length);
    SD._reiniciar();
    instalar(() => resp('{"error-response":{"error-code":"TOO_MANY_REQUESTS"}}', 429));
    await assert.rejects(SD.buscar('estrés', {}), e => e.limitado === true && /frenando las peticiones .*vuelve a intentarlo en un minuto$/.test(e.message));
    // con los frenazos ya escalados, el aviso dice cuánto falta de verdad
    let ahora = 1e9;
    SD._rotacion = new RotacionClaves(CLAVES_ELSEVIER, { inicio: 0, reloj: () => ahora });
    for (const k of CLAVES_ELSEVIER) { SD._rotacion.frenar(k, 30000); SD._rotacion.frenar(k, 30000); if (k !== CLAVES_ELSEVIER[3]) SD._rotacion.frenar(k, 30000); }
    ahora += 60000;
    assert.match(SD.motivoNoDisponible(), /vuelve a intentarlo dentro de 9 min$/, 'la que antes queda libre (10 min menos uno), no las de 1 h');
    ahora += 48000;
    assert.match(SD.motivoNoDisponible(), /vuelve a intentarlo dentro de 9 min$/, 'los minutos empezados cuentan enteros (8 min 12 s: 9 min)');
    for (const k of CLAVES_ELSEVIER) SD._rotacion.pausar(k, Infinity, 'limite');
    assert.match(SD.motivoNoDisponible(), /vuelve a intentarlo más tarde$/);
    // la cuota agotada: si Elsevier dijo cuándo se renueva (X-RateLimit-Reset), el aviso lo dice; si no, solo el motivo
    SD._rotacion = new RotacionClaves(CLAVES_ELSEVIER, { inicio: 0, reloj: () => ahora });
    for (const k of CLAVES_ELSEVIER) SD._rotacion.pausar(k, k === CLAVES_ELSEVIER[2] ? 90 * 60000 : 3 * 3600000, 'cuota');
    assert.match(SD.motivoNoDisponible(), /agotaron su cuota semanal de ScienceDirect \(20 000 peticiones por clave\); la primera se renueva dentro de 90 min$/);
    SD._rotacion = new RotacionClaves(CLAVES_ELSEVIER, { inicio: 0, reloj: () => ahora });
    for (const k of CLAVES_ELSEVIER) SD._rotacion.pausar(k, 132 * 60000, 'cuota');
    assert.match(SD.motivoNoDisponible(), /; la primera se renueva dentro de 3 h$/, 'pasadas dos horas, en horas (2 h 12 min: 3 h)');
    for (const k of CLAVES_ELSEVIER) SD._rotacion.pausar(k, 30 * 3600000, 'cuota');
    assert.match(SD.motivoNoDisponible(), /; la primera se renueva dentro de 30 h$/, 'hasta dos días, en horas');
    SD._rotacion.pausar(CLAVES_ELSEVIER[0], Infinity, 'auth');
    for (const k of CLAVES_ELSEVIER.slice(1)) SD._rotacion.pausar(k, 6.2 * 86400000, 'cuota');
    assert.match(SD.motivoNoDisponible(), /; la primera se renueva dentro de 7 días$/, 'las rechazadas no cuentan para cuándo; los días empezados, enteros');
    for (const k of CLAVES_ELSEVIER) SD._rotacion.pausar(k, Infinity, 'cuota');
    assert.match(SD.motivoNoDisponible(), /agotaron su cuota semanal de ScienceDirect \(20 000 peticiones por clave\)$/, 'sin reinicio legible, sin fecha');
    // y en la búsqueda, con el reinicio que manda Elsevier
    SD._reiniciar(); SD._rotacion = new RotacionClaves(CLAVES_ELSEVIER, { inicio: 0 });
    const reinicio = String(Math.floor(Date.now() / 1000) + 2 * 3600);
    instalar(() => resp('', 429, { 'X-ELS-Status': 'QUOTA_EXCEEDED - Quota Exceeded', 'X-RateLimit-Reset': reinicio }));
    await assert.rejects(SD.buscar('estrés', {}), e => e.cuota === true && /; la primera se renueva dentro de 120 min$/.test(e.message));
});

test('un 5xx o una respuesta rara se reintentan una vez; dos seguidos, el error', async () => {
    instalar(n => (n === 1 ? resp('upstream error', 503) : resp(lista(1, [entrada(1)]))));
    assert.equal((await SD.buscar('estrés', {})).obras.length, 1); assert.equal(peticiones.length, 2);
    instalar(n => (n === 1 ? resp('<html>gateway</html>') : resp(lista(1, [entrada(1)]))));
    assert.equal((await SD.buscar('estrés', {})).obras.length, 1); assert.equal(peticiones.length, 2);
    instalar(() => resp('caído', 502));
    await assert.rejects(SD.buscar('estrés', {}), e => e.reintentable === true && /HTTP 502: caído/.test(e.message));
    assert.equal(peticiones.length, 2);
    instalar(() => resp(JSON.stringify({ algo: 'otra cosa' })));
    await assert.rejects(SD.buscar('estrés', {}), e => /respuesta inesperada/.test(e.message), 'JSON válido sin la lista de registros');
});

test('el error dentro de una respuesta 200: una clave rechazada se rota; una consulta inválida, no; la cuota agotada aparta la clave', async () => {
    instalar(n => (n === 1 ? resp('{"service-error":{"status":{"statusCode":"AUTHENTICATION_ERROR","statusText":"The provided API key is invalid"}}}') : resp(lista(1, [entrada(1)]))));
    assert.equal((await SD.buscar('estrés', {})).obras.length, 1); assert.equal(peticiones.length, 2);
    assert.equal(SD._rotacion.libres(), CLAVES_ELSEVIER.length - 1, 'la rechazada, en pausa');
    instalar(n => (n === 1 ? resp('{"error-response":{"error-code":"AUTHORIZATION_ERROR","error-message":"Not authorized"}}') : resp(lista(1, [entrada(1)]))));
    assert.equal((await SD.buscar('estrés', {})).obras.length, 1); assert.equal(SD._rotacion.motivos().auth, 2, 'también con «error-response»');
    instalar(n => (n === 1 ? resp('{"service-error":{"status":{"statusCode":"QUOTA_EXCEEDED","statusText":"Quota Exceeded"}}}') : resp(lista(1, [entrada(1)]))));
    assert.equal((await SD.buscar('estrés', {})).obras.length, 1); assert.equal(SD._rotacion.motivos().cuota, 1, 'el código de la cuota en el cuerpo (lo único que llega por un proxy)');
    const libres = SD._rotacion.libres();
    instalar(() => resp(JSON.stringify({ 'search-results': { 'opensearch:totalResults': '0', entry: [{ '@_fa': 'true', error: 'Invalid query' }] } })));
    await assert.rejects(SD.buscar('estrés', {}), e => e.consulta === true && /Invalid query/.test(e.message));
    assert.deepEqual(peticiones.map(p => new URL(p).searchParams.get('count')), ['50', '25'], 'sin rotar por la clave: solo se prueba la página de 25');
    assert.equal(SD._tamanoMax, 100, 'si con 25 tampoco vale, el tamaño no se rebaja'); assert.equal(SD._rotacion.libres(), libres, 'ninguna clave más en pausa');
    instalar(() => resp(JSON.stringify({ message: 'Invalid value for show' })));
    await assert.rejects(SD.buscar('estrés', { maxResultados: 10 }), e => e.consulta === true && /Invalid value for show/.test(e.message), 'el error de la v2, {message}');
});

test('una página que no es la primera falla: se devuelven las anteriores, contiguas, y se dice en «parcial»', async () => {
    SD.VENTANA = 1;
    instalar((n, u) => (num(u, 'start') === 200 ? resp('{"service-error":{"status":{"statusCode":"GENERAL_SYSTEM_ERROR"}}}', 500) : resp(tramo(u, 500))));
    const r = await SD.buscar('estrés', { maxResultados: 500 });
    assert.equal(r.obras.length, 200); assert.equal(r.paginas, 2);
    assert.match(r.parcial, /^2\/5 páginas \(Elsevier no respondió bien \(HTTP 500: GENERAL_SYSTEM_ERROR\)\)$/);
    assert.deepEqual(peticiones.map(p => num(new URL(p), 'start')), [0, 100, 200, 200], 'la página fallida con su reintento; las siguientes ya no se piden');
});

test('con páginas en paralelo, las que llegaron después de un hueco no se pegan: el orden de relevancia manda', async () => {
    instalar((n, u) => (num(u, 'start') === 200 ? resp('caído', 503) : resp(tramo(u, 500))));
    const r = await SD.buscar('estrés', { maxResultados: 500 });
    assert.equal(r.obras.length, 200); assert.match(r.parcial, /^2\/5 páginas/);
    assert.ok(peticiones.some(p => num(new URL(p), 'start') === 300), 'la página 4 sí se pidió (iba en la misma tanda)');
});

test('registros ilegibles, o sin título, DOI ni PII (una forma que no se conoce), se saltan y se cuentan, sin tirar la búsqueda', async () => {
    instalar(() => resp(lista(7, [entrada(1), null, 'texto', [1, 2], entrada(2), { otra: 'forma', titulo: 'x' }, { pii: 'S0165032724099999' }])));
    const original = SD.normalizar;
    SD.normalizar = function (/** @type {any} */ e) { if (e.pii === entrada(2).pii) throw new TypeError('forma inesperada'); return original.call(this, e); };
    try {
        const r = await SD.buscar('estrés', {});
        assert.deepEqual(r.obras.map(o => o.titulo.replace(/.*study /, '')), ['1', '(sin título)'], 'con su PII, la obra se queda (se puede abrir)');
        assert.equal(r.descartados, 5);
    } finally { SD.normalizar = original; }
});

test('sin DOI, la obra se reconoce por su PII: no se repite, y dos obras distintas con el mismo título no se funden', async () => {
    const sinDoi = (/** @type {number} */ i, /** @type {string} */ titulo) => entrada(i, { 'prism:doi': '', 'dc:identifier': '', 'dc:title': titulo });
    instalar(() => resp(lista(3, [sinDoi(1, 'Editorial'), sinDoi(2, 'Editorial'), sinDoi(1, 'Editorial (repetida)')])));
    const r = await SD.buscar('estrés', {});
    assert.deepEqual(r.obras.map(o => o.titulo), ['Editorial', 'Editorial']);
    assert.deepEqual(r.obras.map(o => o.link.slice(-6)), ['000001', '000002']);
});

test('el navegador bloquea la llamada directa (CORS): esa y las siguientes van por el arsenal de proxies, con la clave en la URL', async () => {
    instalar(() => { throw new TypeError('Failed to fetch'); });
    /** @type {string[]} */ const proxificadas = [];
    ProxiesCORS.carrera = /** @type {any} */ (async (/** @type {string} */ url, /** @type {(t: string) => any} */ validar) => {
        proxificadas.push(url);
        const obras = validar(tramo(new URL(url), 150));
        if (!obras) throw new Error('vacío');
        return { obras, proxy: 'simulado' };
    });
    const frenada = CLAVES_ELSEVIER[1];
    SD._rotacion.frenar(frenada, 0);   // un frenazo anterior (pausa ya vencida): una respuesta correcta por los proxies lo olvida
    const r = await SD.buscar('estrés', { maxResultados: 150 });
    assert.equal(r.obras.length, 150); assert.equal(r.via, 'proxy');
    assert.equal(peticiones.length, 1, 'directo solo la primera vez'); assert.equal(SD._directoOK, false);
    assert.equal(/** @type {any} */ (SD._rotacion)._frenazos.has(frenada), false, 'el éxito por los proxies también cuenta');
    assert.equal(proxificadas.length, 2); assert.ok(proxificadas.every(u => /^https:\/\/api\.elsevier\.com\/content\/search\/sciencedirect\?query=estres&httpAccept=application%2Fjson&start=\d+&count=100&apiKey=[0-9a-f]{32}$/.test(u)), proxificadas.join(' | '));
    await SD.buscar('ansiedad', {});
    assert.equal(peticiones.length, 1, 'la sesión ya no insiste en directo'); assert.equal(proxificadas.length, 3);
});

test('por los proxies: el error de Elsevier que trae el cuerpo manda; el código del proxy no se toma por el de Elsevier; sin respuesta, un mensaje claro y sin reintento', async () => {
    SD._directoOK = false;
    let n = 0;
    ProxiesCORS.carrera = /** @type {any} */ (async (/** @type {string} */ url, /** @type {(t: string) => any} */ validar) => {
        n++;
        const obras = validar(n === 1 ? '{"service-error":{"status":{"statusCode":"AUTHENTICATION_ERROR","statusText":"Invalid API Key"}}}' : lista(1, [entrada(1)]));
        if (!obras) throw new Error('ningún proxy respondió · codetabs:vacío');   // el arsenal no deja ver el código: solo el cuerpo lo dice
        return { obras, proxy: 'simulado' };
    });
    const r = await SD.buscar('estrés', {});
    assert.equal(r.obras.length, 1); assert.equal(n, 2); assert.equal(SD._rotacion.motivos().auth, 1);
    // un proxy roto que devuelve una página de error: no se toma por la respuesta de Elsevier
    n = 0;
    ProxiesCORS.carrera = /** @type {any} */ (async (/** @type {string} */ url, /** @type {(t: string) => any} */ validar) => { n++; validar('<html>proxy error</html>'); throw new Error('ningún proxy respondió · codetabs:vacío'); });
    await assert.rejects(SD.buscar('estrés', {}), e => /y los proxies tampoco respondieron \(ningún proxy respondió · codetabs:vacío\)$/.test(e.message));
    assert.equal(n, 1, 'sin reintento: el arsenal ya hizo su ronda de gracia');
    ProxiesCORS.carrera = /** @type {any} */ (async () => { throw new Error('arsenal completo probado y salud reiniciada — reintenta en unos minutos · codetabs:HTTP502 · corsproxy:timeout'); });
    await assert.rejects(SD.buscar('estrés', {}), e => !e.reintentable
        && /^el navegador bloquea la llamada directa a Elsevier, y los proxies tampoco respondieron \(codetabs:HTTP502 · corsproxy:timeout\)$/.test(e.message));
    ProxiesCORS.carrera = /** @type {any} */ (async () => { throw Object.assign(new Error('destino HTTP429 — el problema está en la fuente'), { destino: true, destinoStatus: 429 }); });
    SD._reiniciar(); SD._directoOK = false;
    await assert.rejects(SD.buscar('estrés', {}), e => e.limitado === true, 'el código del destino que distingue el arsenal sí cuenta');
    // los 401 o 429 del mensaje del arsenal son de los proxies (el límite de AllOrigins, por ejemplo): ni se aparta ninguna
    // clave ni se recorren las ocho
    SD._reiniciar(); SD._directoOK = false; n = 0;
    ProxiesCORS.carrera = /** @type {any} */ (async () => { n++; throw new Error('arsenal completo probado y salud reiniciada — reintenta en unos minutos · allorigins-raw:HTTP429 · allorigins-get:HTTP429 · allorigins-hexlet:HTTP429'); });
    await assert.rejects(SD.buscar('estrés', {}), e => !e.limitado && !e.auth && /los proxies tampoco respondieron \(allorigins-raw:HTTP429/.test(e.message));
    assert.equal(n, 1); assert.deepEqual(SD._rotacion.motivos(), { auth: 0, cuota: 0, limite: 0 });
});

test('por los proxies: el error de Elsevier se queda aunque después llegue la página de error de otro proxy', async () => {
    SD._directoOK = false;
    const primera = CLAVES_ELSEVIER[0];
    ProxiesCORS.carrera = /** @type {any} */ (async (/** @type {string} */ url, /** @type {(t: string) => any} */ validar) => {
        if (new URL(url).searchParams.get('apiKey') !== primera) return { obras: validar(lista(1, [entrada(1)])), proxy: 'simulado' };
        assert.equal(validar('{"service-error":{"status":{"statusCode":"QUOTA_EXCEEDED","statusText":"Quota Exceeded"}}}'), null);
        assert.equal(validar('<html><body>502 Bad Gateway</body></html>'), null);   // la página de otro proxy, después
        throw Object.assign(new Error('destino HTTP429 — el problema está en la fuente'), { destino: true, destinoStatus: 429 });
    });
    const r = await SD.buscar('estrés', {});
    assert.equal(r.obras.length, 1);
    assert.deepEqual(SD._rotacion.motivos(), { auth: 0, cuota: 1, limite: 0 }, 'la cuota agotada, no un frenazo de 30 s');
    assert.equal(/** @type {any} */ (SD._rotacion)._pausas.get(primera).hasta, Infinity);
    // al revés (primero la página rota, luego el error de Elsevier), también manda el de Elsevier
    SD._reiniciar(); SD._directoOK = false;
    ProxiesCORS.carrera = /** @type {any} */ (async (/** @type {string} */ url, /** @type {(t: string) => any} */ validar) => {
        if (new URL(url).searchParams.get('apiKey') !== primera) return { obras: validar(lista(1, [entrada(1)])), proxy: 'simulado' };
        validar('<html><body>502 Bad Gateway</body></html>');
        validar('{"service-error":{"status":{"statusCode":"AUTHENTICATION_ERROR","statusText":"Invalid API Key"}}}');
        throw new Error('ningún proxy respondió');
    });
    await SD.buscar('estrés', {});
    assert.deepEqual(SD._rotacion.motivos(), { auth: 1, cuota: 0, limite: 0 });
});

test('por el arsenal real: un 403 con una página HTML (el borde de Elsevier bloquea la IP de ESE proxy) no para la carrera; el JSON de Elsevier, sí', async () => {
    const PX = ProxiesCORS;
    const antes = { mem: PX._mem, sondeada: PX._sondeada };
    PX._mem = {}; PX._cache.clear(); PX._sondeada = true;   // sin historial ni caché, y sin la sonda de fondo (pediría otra URL)
    try {
        SD._directoOK = false;
        const HTML = '<!DOCTYPE html><html><head><title>Access Denied</title></head><body>Access Denied. Reference #18.abc</body></html>';
        const JSON403 = '{"service-error":{"status":{"statusCode":"AUTHORIZATION_ERROR","statusText":"The requestor is not authorized"}}}';
        const BUENA = lista(3, [entrada(1), entrada(2), entrada(3)]);
        /** @type {string[]} */
        const pedidas = [];
        /** AllOrigins (api.allorigins.win) recibe el 403 de Elsevier: su /raw lo reenvía, su /get lo da como http_code; los demás pasan. @param {string} cuerpo */
        const arsenal = cuerpo => /** @type {any} */ (async (/** @type {string} */ url) => {
            const u = new URL(String(url)), via = u.host + u.pathname;
            pedidas.push(via);
            if (via === 'api.allorigins.win/get') return new Response(JSON.stringify({ contents: cuerpo, status: { http_code: 403 } }), { status: 200 });
            if (u.host === 'api.allorigins.win') return new Response(cuerpo, { status: 403 });
            return new Response(BUENA, { status: 200 });
        });
        globalThis.fetch = arsenal(HTML);
        const r = await SD.buscar('estrés', {});
        assert.equal(r.obras.length, 3); assert.equal(r.via, 'proxy');
        assert.ok(pedidas.includes('api.allorigins.win/get') && pedidas.length >= 3, 'el bloqueado respondió, y la carrera siguió: ' + pedidas.join(', '));
        assert.deepEqual(SD._rotacion.motivos(), { auth: 0, cuota: 0, limite: 0 });
        // las demás fuentes no piden la opción: el 4xx del destino para la carrera, como siempre
        PX._mem = {}; pedidas.length = 0;
        await assert.rejects(PX.carrera('https://api.elsevier.com/content/x?a=1', t => (/Access Denied/.test(t) ? null : [t])), e => e.destino === true && e.destinoStatus === 403);
        assert.deepEqual(pedidas, ['api.allorigins.win/raw', 'api.allorigins.win/get']);
        // con la opción, el 403 de Elsevier (su JSON: el veredicto sobre la clave) también la para, y la clave queda fuera
        PX._mem = {}; pedidas.length = 0;
        globalThis.fetch = arsenal(JSON403);
        await assert.rejects(PX.carrera('https://api.elsevier.com/content/x?a=2', t => (/service-error/.test(t) ? null : [t]), { sigueAnte403HTML: true }), e => e.destino === true && e.destinoStatus === 403);
        assert.deepEqual(pedidas, ['api.allorigins.win/raw', 'api.allorigins.win/get']);
        SD._reiniciar(); SD._directoOK = false; PX._mem = {}; PX._cache.clear();
        SD._rotacion = new RotacionClaves([CLAVES_ELSEVIER[0]], { inicio: 0 });
        await assert.rejects(SD.buscar('estrés', {}), e => e.auth === true);
        assert.equal(SD._rotacion.motivos().auth, 1);
    } finally { PX._mem = antes.mem; PX._cache.clear(); PX._sondeada = antes.sondeada; }
});

test('por el arsenal real: el 403 de un cortafuegos se juzga con SU cuerpo, aunque después otro proxy traiga una respuesta vacía', async () => {
    const PX = ProxiesCORS;
    const antes = { mem: PX._mem, sondeada: PX._sondeada };
    PX._mem = {}; PX._cache.clear(); PX._sondeada = true;
    try {
        SD._directoOK = false;
        SD._rotacion = new RotacionClaves([CLAVES_ELSEVIER[0]], { inicio: 0 });
        const HTML = '<!DOCTYPE html><html><head><title>Access Denied</title></head><body>Access Denied. Reference #18.abc</body></html>';
        /** @type {string[]} */
        const vistos = [];
        // AllOrigins: bloqueado por el cortafuegos (su /get da el 403 con la página); el de hexlet no llega a Elsevier y
        // responde, más tarde, «contents: null» (como hace AllOrigins sin destino); los demás, sin red. Nadie trae a Elsevier.
        globalThis.fetch = /** @type {any} */ (async (/** @type {string} */ url) => {
            const u = new URL(String(url)), via = u.host + u.pathname;
            vistos.push(via + (u.searchParams.has('charset') ? '?charset' : ''));
            if (via === 'api.allorigins.win/get' && !u.searchParams.has('charset')) return new Response(JSON.stringify({ contents: HTML, status: { http_code: 403 } }), { status: 200 });
            if (via === 'api.allorigins.win/raw') return new Response(HTML, { status: 403 });
            if (via === 'allorigins.hexlet.app/get') return new Response(JSON.stringify({ contents: null, status: { http_code: null, error: { code: 'ECONNRESET' } } }), { status: 200 });
            throw new TypeError('fetch failed');
        });
        await assert.rejects(SD.buscar('estrés', {}), e => !e.auth && e.rescatable === true && /^algo entre el navegador y Elsevier rechazó la petición \(HTTP 403: Access Denied/.test(e.message));
        assert.ok(vistos.indexOf('allorigins.hexlet.app/get') > vistos.indexOf('api.allorigins.win/get'), 'la respuesta vacía llegó después: ' + vistos.join(', '));
        assert.deepEqual(SD._rotacion.motivos(), { auth: 0, cuota: 0, limite: 0 }, 'no es un rechazo de la clave');
        assert.equal(SD.disponible(), true, 'ScienceDirect sigue disponible en la sesión');
    } finally { PX._mem = antes.mem; PX._cache.clear(); PX._sondeada = antes.sondeada; }
});

test('el directo, bloqueado a mitad de la búsqueda: las páginas siguientes van por los proxies y la búsqueda dice «vía proxy»', async () => {
    globalThis.fetch = /** @type {any} */ (async (/** @type {string} */ url) => {
        const u = new URL(url);
        if (num(u, 'start') === 0) return resp(tramo(u, 150));
        throw new TypeError('Failed to fetch');
    });
    ProxiesCORS.carrera = /** @type {any} */ (async (/** @type {string} */ url, /** @type {(t: string) => any} */ validar) => ({ obras: validar(tramo(new URL(url), 150)), proxy: 'simulado' }));
    const r = await SD.buscar('estrés', { maxResultados: 150 });
    assert.equal(r.obras.length, 150); assert.equal(r.via, 'proxy'); assert.equal(SD._directoOK, false);
});

test('un tiempo agotado con el directo ya probado: es de Elsevier, no del navegador; se reintenta directo una vez, con el plazo largo, sin los proxies', async () => {
    SD.TIMEOUT_DIRECTO_MS = 30; SD.TIMEOUT_PROXY_MS = 1500;
    let proxificadas = 0;
    ProxiesCORS.carrera = /** @type {any} */ (async () => { proxificadas++; throw new Error('no debería llamarse'); });
    /** @type {number[]} */ const esperas = [];
    globalThis.fetch = /** @type {any} */ ((/** @type {string} */ url, /** @type {any} */ op) => {
        peticiones.push(url);
        const u = new URL(url);
        if (num(u, 'start') === 0) return Promise.resolve(resp(tramo(u, 150)));
        const t0 = Date.now();
        return new Promise((_, rechazar) => op.signal.addEventListener('abort', () => { esperas.push(Date.now() - t0); rechazar(Object.assign(new Error('aborted'), { name: 'AbortError' })); }));
    });
    peticiones = [];
    const r = await SD.buscar('estrés', { maxResultados: 150 });
    assert.equal(r.obras.length, 100); assert.match(r.parcial, /^1\/2 páginas \(Elsevier tardó más de 2 s en responder\)$/, 'el reintento esperó el plazo de los proxies');
    assert.equal(proxificadas, 0); assert.equal(peticiones.filter(p => num(new URL(p), 'start') === 100).length, 2, 'la página, con su único reintento');
    assert.ok(esperas[0] < 1000 && esperas[1] >= 1400, 'primero el plazo corto, luego el largo: ' + esperas.join(', '));
    assert.equal(SD._directoOK, true, 'el directo sigue abierto');
});

test('un tiempo agotado leyendo el cuerpo (la cabecera llegó a tiempo) también es Elsevier lento: se reintenta directo, con el plazo largo', async () => {
    SD.TIMEOUT_DIRECTO_MS = 40; SD.TIMEOUT_PROXY_MS = 1500;
    let proxificadas = 0;
    ProxiesCORS.carrera = /** @type {any} */ (async () => { proxificadas++; throw new Error('no debería llamarse'); });
    /** @type {Map<number, number>} */
    const vistas = new Map();
    globalThis.fetch = /** @type {any} */ ((/** @type {string} */ url, /** @type {any} */ op) => {
        peticiones.push(url);
        const u = new URL(url), s = num(u, 'start'), vez = (vistas.get(s) || 0) + 1;
        vistas.set(s, vez);
        // la cabecera, enseguida; el cuerpo, la primera vez nunca (hasta que el plazo corta la lectura) y la segunda a los 200 ms
        const cuerpo = new ReadableStream({
            start(ctrl) {
                const t = vez > 1 ? setTimeout(() => { ctrl.enqueue(new TextEncoder().encode(tramo(u, 150))); ctrl.close(); }, 200) : null;
                op.signal.addEventListener('abort', () => { if (t) clearTimeout(t); try { ctrl.error(Object.assign(new Error('aborted'), { name: 'AbortError' })); } catch (e) { /* ya cerrado */ } });
            }
        });
        return Promise.resolve(new Response(cuerpo, { status: 200, headers: { 'Content-Type': 'application/json' } }));
    });
    peticiones = [];
    const r = await SD.buscar('estrés', { maxResultados: 150 });
    assert.equal(r.obras.length, 150, 'el reintento esperó el plazo largo: 200 ms caben en él'); assert.equal(r.parcial, '');
    assert.equal(r.via, 'directo'); assert.equal(proxificadas, 0, 'los proxies llamarían al mismo Elsevier lento');
    assert.deepEqual([...vistas.entries()], [[0, 2], [100, 2]], 'cada página, con su único reintento (también la primera: la puerta CORS ya estaba probada)');
    // si tampoco llega con el plazo largo: el mensaje del tiempo agotado, no el de una respuesta cortada
    SD._reiniciar(); SD.TIMEOUT_PROXY_MS = 100;
    vistas.clear();
    await assert.rejects(SD.buscar('estrés', {}), e => e.tiempo === true && /^Elsevier tardó más de 0 s en responder$/.test(e.message));
    assert.equal(vistas.get(0), 2);
});

test('un tiempo agotado en directo no condena al directo: esa petición va por los proxies y la siguiente vuelve a probar', async () => {
    SD.TIMEOUT_DIRECTO_MS = 30;
    globalThis.fetch = /** @type {any} */ ((/** @type {string} */ url, /** @type {any} */ op) => { peticiones.push(url); return new Promise((_, rechazar) => op.signal.addEventListener('abort', () => rechazar(Object.assign(new Error('aborted'), { name: 'AbortError' })))); });
    peticiones = [];
    ProxiesCORS.carrera = /** @type {any} */ (async (/** @type {string} */ url, /** @type {(t: string) => any} */ validar) => ({ obras: validar(lista(1, [entrada(1)])), proxy: 'simulado' }));
    const r = await SD.buscar('estrés', {});
    assert.equal(r.via, 'proxy'); assert.notEqual(SD._directoOK, false, 'no se marca como bloqueado');
    instalar(() => resp(lista(1, [entrada(1)])));
    assert.equal((await SD.buscar('estrés', {})).via, 'directo');
});

test('sin red: el mensaje propio, sin pasar por los proxies', async () => {
    const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
    let proxificadas = 0;
    ProxiesCORS.carrera = /** @type {any} */ (async () => { proxificadas++; throw new Error('no'); });
    try {
        instalar(() => { throw new TypeError('Failed to fetch'); });
        await assert.rejects(SD.buscar('estrés', {}), e => e.red === true && /sin conexión a internet/.test(e.message));
        assert.equal(proxificadas, 0); assert.notEqual(SD._directoOK, false);
    } finally { if (nav) Object.defineProperty(globalThis, 'navigator', nav); else delete (/** @type {any} */ (globalThis)).navigator; }
});

test('el ritmo: cada clave, una petición cada INTERVALO_MS (dos por segundo como mucho); claves distintas no se esperan', async () => {
    SD.INTERVALO_MS = 40;
    SD._rotacion = new RotacionClaves(['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'], { inicio: 0 });
    /** @type {number[]} */
    const tiempos = [];
    instalar(() => { tiempos.push(Date.now()); return resp(lista(1, [entrada(1)])); });
    const inicio = Date.now();
    await Promise.all([SD.buscar('uno', {}), SD.buscar('dos', {}), SD.buscar('tres', {})]);
    tiempos.sort((a, b) => a - b);
    assert.ok(tiempos[1] - inicio >= 39 && tiempos[2] - inicio >= 79, 'turnos de una sola clave: ' + tiempos.map(t => t - inicio).join(', '));
    // con tres claves y un ritmo de 20 s por clave, ninguna espera: si el turno fuera común, tardaría 40 s
    SD.INTERVALO_MS = 20000;
    SD._rotacion = new RotacionClaves(['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'cccccccccccccccccccccccccccccccc'], { inicio: 0 });
    SD._turnos.clear();
    const t0 = Date.now();
    await Promise.all([SD.buscar('uno', {}), SD.buscar('dos', {}), SD.buscar('tres', {})]);
    assert.ok(Date.now() - t0 < 10000, 'tres claves, sin esperas: ' + (Date.now() - t0) + ' ms');
});

test('las claves de Elsevier: una sola lista, congelada, que comparten Scopus y ScienceDirect con turnos y pausas independientes', async () => {
    assert.equal(ScopusDirecto.API_KEYS, CLAVES_ELSEVIER); assert.equal(CLAVES_ELSEVIER.length, 8); assert.ok(Object.isFrozen(CLAVES_ELSEVIER));
    assert.ok(CLAVES_ELSEVIER.every(k => /^[0-9a-f]{32}$/.test(k)));
    instalar(() => resp('{"service-error":{"status":{"statusCode":"AUTHENTICATION_ERROR"}}}', 401));
    await assert.rejects(SD.buscar('estrés', {}));
    assert.deepEqual(ScopusDirecto._keyEstado, {}, 'lo que ScienceDirect aprende de sus claves no toca a Scopus');
});

test('la rotación: por turno (desde una clave al azar), salta las pausadas, olvida las vencidas, se queda con la pausa más larga, cuenta los motivos y escala los frenazos', () => {
    let ahora = 1000;
    const rot = new RotacionClaves(['a', 'b', 'c'], { reloj: () => ahora, inicio: 0 });
    assert.deepEqual([rot.siguiente(), rot.siguiente(), rot.siguiente(), rot.siguiente()], ['a', 'b', 'c', 'a']);
    rot.pausar('b', 500, 'limite');
    assert.deepEqual([rot.siguiente(), rot.siguiente(), rot.siguiente()], ['c', 'a', 'c'], 'sin «b» mientras descansa');
    assert.equal(rot.libres(), 2); assert.deepEqual(rot.motivos(), { auth: 0, cuota: 0, limite: 1 });
    rot.pausar('b', 100, 'limite');
    ahora += 200; assert.equal(rot.enPausa('b'), true, 'una pausa más corta no acorta la que había');
    ahora += 400; assert.equal(rot.enPausa('b'), false, 'vencida'); assert.equal(rot.libres(), 3);
    rot.pausar('a', Infinity, 'auth'); rot.pausar('b', Infinity, 'cuota'); rot.pausar('c', 10, 'limite');
    assert.deepEqual(rot.motivos(), { auth: 1, cuota: 1, limite: 1 }); assert.equal(rot.siguiente(), '');
    ahora += 1e12; assert.equal(rot.siguiente(), 'c', 'las de la sesión no vencen nunca');
    rot.reiniciar(); assert.equal(rot.libres(), 3); assert.equal(rot.total, 3); assert.equal(rot.siguiente(), 'a', 'reiniciar vuelve al primer turno');
    // los frenazos: 1, 20 y 120 veces la pausa pedida mientras sigan; una respuesta correcta los olvida; reiniciar, también
    assert.equal(rot.frenar('a', 300), 300); ahora += 301;
    assert.equal(rot.frenar('a', 300), 6000); ahora += 6001;
    assert.equal(rot.frenar('a', 300), 36000); assert.equal(rot.frenar('a', 300), 36000, 'no crece más');
    assert.equal(rot.motivos().cuota, 0, 'un frenazo nunca se da por cuota');
    assert.equal(rot.frenar('b', 300), 300, 'cada clave cuenta los suyos');
    rot.exito('a'); assert.equal(rot.frenar('a', 300), 300, 'tras una respuesta correcta, de cero');
    rot.frenar('c', 300); rot.reiniciar(); assert.equal(rot.frenar('c', 300), 300, 'reiniciar olvida los frenazos');
    // el primer turno: el que se pida, o uno al azar
    assert.equal(new RotacionClaves(['a', 'b', 'c'], { inicio: 2 }).siguiente(), 'c');
    assert.equal(new RotacionClaves(['a', 'b', 'c'], { inicio: 7 }).siguiente(), 'b', 'el turno pedido, dentro de la lista');
    const desdeB = new RotacionClaves(['a', 'b', 'c'], { inicio: 1 });
    desdeB.siguiente(); desdeB.siguiente(); desdeB.reiniciar(); assert.equal(desdeB.siguiente(), 'b', 'reiniciar vuelve a SU primer turno');
    const azar = Math.random;
    try {
        Math.random = () => 0.99; assert.equal(new RotacionClaves(['a', 'b', 'c']).siguiente(), 'c');
        Math.random = () => 0; assert.equal(new RotacionClaves(['a', 'b', 'c']).siguiente(), 'a');
    } finally { Math.random = azar; }
    assert.equal(new RotacionClaves([]).siguiente(), '', 'sin claves, ninguna');
});

test('la rotación: los 429 de una misma ráfaga (peticiones que ya iban en vuelo) cuentan como un frenazo, y la clave descansa desde el último', () => {
    let ahora = 5000;
    const rot = new RotacionClaves(['a', 'b'], { reloj: () => ahora, inicio: 0 });
    assert.equal(rot.ahora(), 5000, 'la hora de envío, en el reloj de la rotación');
    const [e1, e2] = [rot.ahora(), rot.ahora()];   // dos peticiones con «a», en vuelo a la vez
    ahora += 50; assert.equal(rot.frenar('a', 300, e1), 300);
    ahora += 20; assert.equal(rot.frenar('a', 300, e2), 300, 'la que ya iba en vuelo no escala');
    const pausas = /** @type {any} */ (rot)._pausas;
    assert.equal(pausas.get('a').hasta, ahora + 300, 'descansa desde el último 429');
    ahora += 301;
    const e3 = rot.ahora(); ahora += 10;
    assert.equal(rot.frenar('a', 300, e3), 6000, 'la que salió después del frenazo sí es otro');
    const e4 = rot.ahora(); ahora += 5;
    assert.equal(rot.frenar('a', 300, e4), 6000, 'en vuelo durante el segundo: tampoco escala');
    assert.equal(rot.frenar('a', 300, rot.ahora()), 6000, 'la que salió en el mismo milisegundo del frenazo, tampoco (salió sin saberlo)');
    // sin hora de envío, cada 429 cuenta (como antes)
    assert.equal(rot.frenar('b', 300), 300); assert.equal(rot.frenar('b', 300), 6000);
    // una respuesta correcta deja la cuenta a cero; un 429 rezagado de antes del frenazo, a 30 s
    rot.exito('a'); assert.equal(rot.frenar('a', 300, e1), 300);
});

test('el resumen de las obras de Elsevier (Abstract Retrieval API): vista META_ABS, el DOI con sus barras y un reparto de claves propio', async () => {
    const S = ScopusDirecto;
    const rotacion = S._rotacionResumen, keyEstado = S._keyEstado;
    S._rotacionResumen = new RotacionClaves(CLAVES_ELSEVIER, { inicio: 0 }); S._keyEstado = {};
    try {
        const resumen = 'Academic stress predicted poorer sleep quality in a three-wave study of 350 university students in Lima.';
        const mala = CLAVES_ELSEVIER[0];
        instalar((n, u) => (u.searchParams.get('apiKey') === mala ? resp('{"service-error":{"status":{"statusCode":"AUTHENTICATION_ERROR"}}}', 401)
            : resp(JSON.stringify({ 'abstracts-retrieval-response': { coredata: { 'dc:description': resumen } } }))));
        assert.equal(await S.abstractPorDoi('https://doi.org/10.1016/j.jad.2024.00001'), resumen);
        const u = new URL(peticiones[1]);
        assert.equal(u.origin + u.pathname, 'https://api.elsevier.com/content/abstract/doi/10.1016/j.jad.2024.00001', 'la barra del DOI, tal cual');
        assert.equal(u.searchParams.get('view'), 'META_ABS', 'la vista que trae el resumen sin suscripción'); assert.equal(u.searchParams.get('httpAccept'), 'application/json');
        assert.deepEqual(S._keyEstado, {}, 'un rechazo aquí no aparta la clave de las búsquedas de Scopus');
        assert.equal(S._rotacionResumen.motivos().auth, 1, 'sino de este reparto');
        // un DOI con signos: cada tramo codificado, las barras no
        peticiones = [];
        await S.abstractPorDoi('10.1002/(SICI)1097-4679(199901)55:1<1::AID-JCLP1>3.0.CO;2-H');
        assert.match(peticiones[0], /\/doi\/10\.1002\/\(SICI\)1097-4679\(199901\)55%3A1%3C1%3A%3AAID-JCLP1%3E3\.0\.CO%3B2-H\?/);
        // sin red (o bloqueada por el navegador): un intento, no uno por clave
        instalar(() => { throw new TypeError('Failed to fetch'); });
        assert.equal(await S.abstractPorDoi('10.1016/j.jad.2024.00002'), ''); assert.equal(peticiones.length, 1);
        // un 429: la clave descansa (frenazo); con todas en pausa no se pide nada
        instalar(() => resp('', 429));
        assert.equal(await S.abstractPorDoi('10.1016/j.jad.2024.00003'), ''); assert.equal(peticiones.length, 4, 'como mucho cuatro claves por obra');
        assert.equal(S._rotacionResumen.motivos().limite, 4);
        for (const k of CLAVES_ELSEVIER) S._rotacionResumen.pausar(k, Infinity, 'cuota');
        peticiones = [];
        assert.equal(await S.abstractPorDoi('10.1016/j.jad.2024.00004'), ''); assert.equal(peticiones.length, 0, 'sin claves libres, ninguna petición');
        // una respuesta correcta olvida los frenazos de la clave: el siguiente 429 vuelve a ser de 30 s
        let ahora = 1e9, frena = true;
        S._rotacionResumen = new RotacionClaves(['kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk'], { inicio: 0, reloj: () => ahora });
        instalar(() => (frena ? resp('', 429) : resp(JSON.stringify({ 'abstracts-retrieval-response': { coredata: { 'dc:description': resumen } } }))));
        await S.abstractPorDoi('10.1016/j.jad.2024.00005'); ahora += 30001; frena = false;
        assert.equal(await S.abstractPorDoi('10.1016/j.jad.2024.00005'), resumen); frena = true;
        await S.abstractPorDoi('10.1016/j.jad.2024.00006');
        assert.equal(/** @type {any} */ (S._rotacionResumen)._pausas.get('kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk').hasta - ahora, 30000);
        // un 404 (el DOI no está en Scopus) también es una respuesta de la clave: sus frenazos ya no cuentan
        let estado = 429;
        S._rotacionResumen = new RotacionClaves(['kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk'], { inicio: 0, reloj: () => ahora });
        instalar(() => resp(estado === 404 ? '{"service-error":{"status":{"statusCode":"RESOURCE_NOT_FOUND"}}}' : '', estado));
        await S.abstractPorDoi('10.1016/j.jad.2024.00007'); ahora += 30001; estado = 404;
        assert.equal(await S.abstractPorDoi('10.1016/j.jad.2024.00008'), ''); estado = 429;
        await S.abstractPorDoi('10.1016/j.jad.2024.00009');
        assert.equal(/** @type {any} */ (S._rotacionResumen)._pausas.get('kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk').hasta - ahora, 30000, 'tras el 404, de cero');
        // los resúmenes van de cinco en cinco: los 429 de las peticiones que ya iban en vuelo son una sola ráfaga
        S._rotacionResumen = new RotacionClaves(['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'], { inicio: 0, reloj: () => ahora });
        instalar(async () => { await new Promise(r => setTimeout(r, 20)); ahora += 1; return resp('', 429); });
        await Promise.all([1, 2, 3, 4].map(i => S.abstractPorDoi(`10.1016/j.jad.2024.0001${i}`)));
        assert.ok(peticiones.length >= 4, 'cuatro a la vez, dos por clave (y quizá otra con la segunda antes de su 429)');
        const rot = /** @type {any} */ (S._rotacionResumen);
        for (const k of ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb']) {
            assert.equal(rot._frenazos.get(k), 1, 'una ráfaga, un frenazo'); assert.ok(rot._pausas.get(k).hasta - ahora <= 30000);
        }
    } finally { S._rotacionResumen = rotacion; S._keyEstado = keyEstado; }
});
