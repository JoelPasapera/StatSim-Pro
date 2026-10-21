// tests/unit/redactor-fuentes.test.js — (2026.12.30) las fuentes del Redactor: la matriz del Buscador (antes, con una obra
// marcada, _fuentes() lanzaba «ReferenceError: iRel is not defined» y el Redactor no redactaba con ella) y una matriz
// importada con su relevancia (antes no se copiaba y el filtro «≥ 4» las dejaba pasar todas «sin dato»). Reproducido por
// la auditoría del 2026-10-16.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estado, CLAVES } from '../../src/shared/estado.js';
import { RedactorTeorico } from '../../src/redactor/redactor/index.js';

const servicio = obras => ({ obtenerFuentesRedaccion: () => obras, citaAPA: o => `Quispe, M. (2021). ${o.titulo}.`, autorAPA: n => n, autoresAPA: a => a.join(', '), recuperarDatos: async () => null, umbralRelevancia: 0, relevanciaAplicada: false });

test('la matriz del Buscador: sus obras, con la nota de relevancia del análisis (0 = sin evaluar)', () => {
    const obras = [
        { titulo: 'Estrés académico y sueño', autores: ['Quispe, M.'], anio: '2021', resumen: 'Un resumen de prueba suficientemente largo.', _relevancia: 5 },
        { titulo: 'Procrastinación y redes sociales', autores: ['Rojas, K.'], anio: '2022', resumen: 'Otro resumen de prueba suficientemente largo.', _relevancia: 2 },
        { titulo: 'Bienestar y rendimiento', autores: ['Pérez, J.'], anio: '2020', resumen: 'Un tercer resumen de prueba bastante largo.' }
    ];
    estado.set(CLAVES.FUENTES_BUSCADOR, servicio(obras));
    RedactorTeorico._fuentesImportadas = null; RedactorTeorico._filtroRel = 0;
    const f = RedactorTeorico._fuentes();
    assert.deepEqual(f.map(x => x.titulo), obras.map(o => o.titulo));
    assert.deepEqual(f.map(x => x.relevancia), ['5', '2', '']);
    RedactorTeorico._filtroRel = 4;
    assert.deepEqual(RedactorTeorico._fuentes().map(x => x.titulo), ['Estrés académico y sueño', 'Bienestar y rendimiento'], 'la sin evaluar pasa: nada se pierde en silencio');
    RedactorTeorico._filtroRel = 0;
});

test('una matriz importada conserva la relevancia y el filtro «≥ 4» la aplica', () => {
    const cols = ['Relevancia', 'Título', 'Autor', 'Año', 'Referencia (APA)', 'Link/DOI'];
    const filas = [['2 (poco pertinente)', 'Título A', 'Pérez, J.', '2020', 'Pérez, J. (2020). Título A. Revista.', ''],
        ['5 (muy pertinente)', 'Título B', 'Rojas, K.', '2022', 'Rojas, K. (2022). Título B. Revista.', ''],
        ['', 'Título C', 'Soto, L.', '2019', 'Soto, L. (2019). Título C. Revista.', '']];
    RedactorTeorico._fuentesImportadas = RedactorTeorico._filasAFuentes(cols, filas);
    assert.deepEqual(RedactorTeorico._fuentesImportadas.map(f => f.relevancia), ['2 (poco pertinente)', '5 (muy pertinente)', '']);
    RedactorTeorico._filtroRel = 4;
    assert.deepEqual(RedactorTeorico._fuentes().map(f => f.titulo), ['Título B', 'Título C']);
    RedactorTeorico._filtroRel = 0; RedactorTeorico._fuentesImportadas = null;
});
