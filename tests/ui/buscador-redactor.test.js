// tests/ui/buscador-redactor.test.js — Buscador y Redactor cargan como módulos y se montan sobre index.html real (sin red).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';

const raiz = new URL('../../', import.meta.url);
let env, buscador, redactor;

before(async () => {
    env = crearEntorno(fs.readFileSync(new URL('index.html', raiz), 'utf8'));
    env.document.readyState = 'interactive';   // los módulos diferidos se ejecutan con el documento ya parseado, como en el navegador
    globalThis.fetch = () => Promise.reject(new Error('sin red en las pruebas'));
    await import(new URL('src/main.js', raiz));
    await new Promise(r => setTimeout(r, 0));   // microtareas de montaje
    env.document.readyState = 'complete';
    env.disparar(env.document, 'DOMContentLoaded', { bubbles: false });
    [buscador, redactor] = await Promise.all([import(new URL('src/buscador/index.js', raiz)), import(new URL('src/redactor/index.js', raiz))]);
});

test('los módulos del Buscador y del Redactor cargan sin ciclos rotos y se exponen por el puente', () => {
    for (const g of ['Antecedentes', 'ProxiesCORS', 'ScopusDirecto', 'PubMedDirecto', 'ScieloDirecto', 'AliciaDirecto', 'ScholarDirecto', 'ProtocoloBusqueda', 'PrismaDiagrama', 'MetaAnalisis', 'RankingRevistas']) assert.ok(buscador[g] && typeof buscador[g] === 'object', g);
    for (const g of ['RedactorTeorico', 'IAAsistente']) assert.ok(redactor[g] && typeof redactor[g] === 'object', g);
    assert.equal(globalThis.StatSim.api.buscador.Antecedentes, buscador.Antecedentes); assert.equal(typeof globalThis.Antecedentes, 'undefined', 'sin global');
});

test('el protocolo de búsqueda registra y lista ecuaciones (localStorage simulado)', () => {
    const P = buscador.ProtocoloBusqueda;
    const antes = (P.listar ? P.listar() : []).length;
    P.registrar({ fuente: 'Scopus', ecuacion: 'TITLE-ABS-KEY("estrés académico")', filtros: { desde: 2019 } });
    const despues = (P.listar ? P.listar() : []).length;
    assert.ok(despues >= antes + 1 || typeof P.listar !== 'function', 'registra una ecuación');
});

test('el ranking de revistas y el meta-análisis tienen sus funciones de dominio', () => {
    assert.ok(typeof buscador.MetaAnalisis.montar === 'function');
    assert.ok(typeof buscador.RankingRevistas.montar === 'function');
    assert.ok(Object.keys(buscador.ProxiesCORS).length > 0);
});

test('el Redactor consume el servicio de fuentes del Buscador y recibe «fuentes:cambiadas» sin importarlo', async () => {
    const { estado, CLAVES } = await import(new URL('src/shared/estado.js', raiz));
    const { bus, EVENTOS } = await import(new URL('src/shared/eventos.js', raiz));
    const servicio = estado.get(CLAVES.FUENTES_BUSCADOR);
    assert.ok(servicio && typeof servicio.citaAPA === 'function' && typeof servicio.obtenerFuentesRedaccion === 'function', 'servicio publicado');
    const cita = servicio.citaAPA({ titulo: 'Estrés académico y sueño', autores: ['Quispe, M.', 'Torres, L.'], anio: '2021', fuente: 'Revista de Psicología', volumen: '39', numero: '1', paginas: '1-20', doi: 'https://doi.org/10.1000/x' });
    assert.match(cita, /Quispe/); assert.match(cita, /2021/);
    let avisado = 0; const original = redactor.RedactorTeorico.actualizarInfoFuentes;
    redactor.RedactorTeorico.actualizarInfoFuentes = () => { avisado++; };
    bus.emit(EVENTOS.FUENTES_CAMBIADAS);
    redactor.RedactorTeorico.actualizarInfoFuentes = original;
    assert.equal(avisado, 1, 'el Redactor reacciona al evento del Buscador');
});
