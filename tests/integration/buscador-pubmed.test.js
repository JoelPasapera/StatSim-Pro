// tests/integration/buscador-pubmed.test.js — la fuente PubMed con respuestas grabadas (sin red):
// fetch simulado por patrón de URL para esearch → esummary → efetch, y el flujo completo de PubMedDirecto.buscar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PubMedDirecto } from '../../src/buscador/fuentes/pubmed.js';

const GRABADAS = {
    esearch: JSON.stringify({ esearchresult: { count: '2', idlist: ['31000001', '31000002'] } }),
    esummary: JSON.stringify({ result: { uids: ['31000001', '31000002'],
        31000001: { uid: '31000001', title: 'Academic stress and sleep quality in university students.', fulljournalname: 'Journal of Educational Psychology', pubdate: '2021 Mar', authors: [{ name: 'García A' }, { name: 'Pérez B' }], articleids: [{ idtype: 'doi', value: '10.1000/js.2021.001' }] },
        31000002: { uid: '31000002', title: 'Emotional intelligence as a predictor of burnout.', fulljournalname: 'Frontiers in Psychology', pubdate: '2019', authors: [{ name: 'Rojas C' }], articleids: [{ idtype: 'pubmed', value: '31000002' }] } } }),
    efetch: '<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID Version="1">31000001</PMID><Article><Abstract><AbstractText>Higher academic stress predicted poorer sleep quality.</AbstractText></Abstract></Article></MedlineCitation></PubmedArticle><PubmedArticle><MedlineCitation><PMID Version="1">31000002</PMID><Article><Abstract><AbstractText>Emotional intelligence buffered burnout.</AbstractText></Abstract></Article></MedlineCitation></PubmedArticle></PubmedArticleSet>',
    vacio: JSON.stringify({ esearchresult: { count: '0', idlist: [] } })
};
const respuesta = texto => ({ ok: true, status: 200, text: async () => texto, json: async () => JSON.parse(texto) });
let peticiones = [];
function instalarFetch(modo = 'normal') {
    peticiones = [];
    globalThis.fetch = async url => {
        const u = String(url); peticiones.push(u);
        if (/esearch\.fcgi/.test(u)) return respuesta(modo === 'vacio' ? GRABADAS.vacio : GRABADAS.esearch);
        if (/esummary\.fcgi/.test(u)) return respuesta(GRABADAS.esummary);
        if (/efetch\.fcgi/.test(u)) return respuesta(GRABADAS.efetch);
        throw new Error('URL no grabada: ' + u);
    };
}

test('PubMedDirecto.buscar: esearch → esummary → efetch y obras normalizadas', async () => {
    instalarFetch();
    const r = await PubMedDirecto.buscar('estrés académico sueño', { maxResultados: 10 });
    assert.equal(r.total, 2); assert.equal(r.obras.length, 2); assert.equal(r.via, 'directo');
    assert.ok(peticiones.some(u => /esearch/.test(u)) && peticiones.some(u => /esummary/.test(u)) && peticiones.some(u => /efetch/.test(u)), 'las tres llamadas: ' + peticiones.join(' | '));
    const o = r.obras[0];
    assert.match(o.titulo || o.title || '', /Academic stress/);
    assert.ok((o.autores || o.authors || []).length >= 2, 'autores normalizados');
    assert.ok(String(o.anio || o.year || o.fecha || '').includes('2021'), 'año');
    assert.ok(/doi\.org\/10\.1000/.test(o.doiURL || o.doi || o.url || ''), 'DOI resuelto');
    assert.match(o.resumen || o.abstract || '', /sleep quality/, 'el abstract del efetch se fusiona por PMID');
});

test('PubMedDirecto.buscar: sin coincidencias lanza un error marcado como vacío', async () => {
    instalarFetch('vacio');
    await assert.rejects(PubMedDirecto.buscar('zzzz qqqq', { maxResultados: 5 }), e => e.pubmed === true && e.vacio === true);
});
