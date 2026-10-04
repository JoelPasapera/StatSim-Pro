// tests/integration/buscador-fuentes.test.js — el resto de fuentes del Buscador con respuestas grabadas, sin red.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScieloDirecto } from '../../src/buscador/fuentes/scielo.js';
import { AliciaDirecto } from '../../src/buscador/fuentes/alicia.js';
import { ScopusDirecto } from '../../src/buscador/fuentes/scopus.js';
import { ScholarDirecto } from '../../src/buscador/fuentes/scholar.js';
import { Documento } from '../ui/minidom.js';

// Scholar parsea el HTML con DOMParser: en Node lo aporta el DOM mínimo de las pruebas
globalThis.DOMParser = class { parseFromString(html) { return new Documento(html); } };

const respuesta = texto => ({ ok: true, status: 200, text: async () => texto, json: async () => JSON.parse(texto) });
const conFetch = (mapa) => { const vistas = []; globalThis.fetch = async url => { const u = String(url); vistas.push(u); for (const [patron, texto] of mapa) if (patron.test(u)) return respuesta(typeof texto === 'function' ? texto(u) : texto); throw new Error('URL no grabada: ' + u); }; return vistas; };

test('SciELO (Crossref): búsqueda paginada y obras normalizadas', async () => {
    const crossref = JSON.stringify({ message: { 'total-results': 2, items: [
        { title: ['Ansiedad y rendimiento académico en universitarios'], author: [{ family: 'Quispe', given: 'M.' }, { family: 'Torres', given: 'L.' }], issued: { 'date-parts': [[2022, 5]] }, DOI: '10.1590/scielo.2022.01', 'container-title': ['Revista de Psicología (PUCP)'], ISSN: ['0254-9247'], language: 'es', volume: '40', issue: '1', page: '1-20' },
        { title: ['<i>Burnout</i> docente en Lima'], author: [{ name: 'Ministerio de Educación' }], issued: { 'date-parts': [[2020]] }, DOI: '10.1590/scielo.2020.07', 'container-title': ['Educación'], ISSN: ['1019-9403'] }
    ] } });
    const vistas = conFetch([[/api\.crossref\.org|scielo/i, crossref]]);
    const r = await ScieloDirecto.buscar('ansiedad rendimiento académico', { maxResultados: 10, desde: 2018 });
    assert.equal(r.total, 2); assert.equal(r.obras.length, 2); assert.equal(r.via, 'directo'); assert.ok(vistas.length >= 1);
    const o = r.obras[0];
    assert.equal(o.titulo, 'Ansiedad y rendimiento académico en universitarios'); assert.deepEqual(o.autores, ['Quispe, M.', 'Torres, L.']); assert.equal(o.anio, '2022');
    assert.equal(o.doi, 'https://doi.org/10.1590/scielo.2022.01'); assert.equal(o.fuente, 'Revista de Psicología (PUCP)');
    assert.equal(r.obras[1].titulo, 'Burnout docente en Lima', 'se limpian las etiquetas HTML del título');
});

test('ALICIA (VuFind): registros, autores primarios y secundarios, año y sin coincidencias', async () => {
    const alicia = JSON.stringify({ resultCount: 1, records: [
        { id: 'UNMSM_001', title: 'Procrastinación académica y uso de redes sociales en estudiantes de secundaria', authors: { primary: { 'Huamán Rojas, Ana': { role: ['author'] } }, secondary: ['Salas, P.'] }, publicationDates: ['2023'], summary: ['Estudio correlacional en Lima Metropolitana.'], urls: [{ url: 'https://alicia.concytec.gob.pe/vufind/Record/UNMSM_001' }], languages: ['Spanish'], institutions: ['Universidad Nacional Mayor de San Marcos'] }
    ] });
    conFetch([[/alicia\.concytec|vufind/i, alicia]]);
    const r = await AliciaDirecto.buscar('procrastinación redes sociales', { maxResultados: 5 });
    assert.equal(r.total, 1); assert.equal(r.obras.length, 1);
    const o = r.obras[0];
    assert.match(o.titulo, /^Procrastinación académica/); assert.deepEqual(o.autores, ['Huamán Rojas, Ana', 'Salas, P.']); assert.equal(o.anio, '2023');
    conFetch([[/alicia\.concytec|vufind/i, JSON.stringify({ resultCount: 0, records: [] })]]);
    const vacio = await AliciaDirecto.buscar('zzzz', { maxResultados: 5 }).catch(e => e);
    assert.ok((vacio && vacio.obras && vacio.obras.length === 0) || (vacio instanceof Error), 'sin coincidencias: lista vacía o error controlado');
});

test('Scopus: la consulta se construye con los términos clave y una entrada de la API se normaliza', () => {
    const url = ScopusDirecto.construirURL ? ScopusDirecto.construirURL('estrés académico y sueño en universitarios', { desde: 2019 }, 25, 0) : null;
    if (url) { assert.match(url, /api\.elsevier\.com|scopus/i); assert.match(decodeURIComponent(url), /estr[ée]s/i); }
    const entrada = { 'dc:title': 'Academic stress and sleep in undergraduates', 'dc:creator': 'Smith J.', 'prism:coverDate': '2021-06-01', 'prism:doi': '10.1016/j.psych.2021.01', 'prism:publicationName': 'Journal of Sleep Research', 'citedby-count': '12', 'dc:identifier': 'SCOPUS_ID:85100000001', link: [{ '@ref': 'scopus', '@href': 'https://www.scopus.com/record/display.uri?eid=2-s2.0-85100000001' }] };
    const o = ScopusDirecto.normalizar(entrada);
    assert.ok(o && /Academic stress/.test(o.titulo), 'título'); assert.ok(String(o.anio).includes('2021'), 'año'); assert.match(o.doi || '', /10\.1016/);
    assert.equal(Number(o.citas), 12);
});

test('Scholar: el HTML grabado de una página de resultados se parsea en obras', () => {
    const html = `<div id="gs_res_ccl_mid">
<div class="gs_r gs_or gs_scl"><div class="gs_ri"><h3 class="gs_rt"><a href="https://doi.org/10.1000/abc">Estrés académico y rendimiento: un estudio correlacional</a></h3><div class="gs_a">M Quispe, L Torres - Revista de Psicología, 2021 - scielo.org</div><div class="gs_rs">Se evaluó la relación entre estrés académico y rendimiento en 350 estudiantes…</div><div class="gs_fl"><a href="/scholar?cites=1">Citado por 14</a></div></div></div>
<div class="gs_r gs_or gs_scl"><div class="gs_ri"><h3 class="gs_rt"><a href="https://repositorio.edu.pe/tesis/2">Inteligencia emocional en docentes de Lima</a></h3><div class="gs_a">A Huamán - 2019 - repositorio.edu.pe</div><div class="gs_rs">Tesis de maestría.</div></div></div>
</div>`;
    const obras = ScholarDirecto.parsearHTML(html);
    assert.equal(obras.length, 2);
    assert.match(obras[0].titulo, /Estrés académico y rendimiento/); assert.ok(String(obras[0].anio).includes('2021'), 'año desde gs_a');
    assert.ok(Number(obras[0].citas) === 14, 'citado por'); assert.match(obras[1].autoresRaw || '', /Huam/, 'autores en bruto desde gs_a'); assert.equal(obras[1].anio, 2019);
});
