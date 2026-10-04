// tests/integration/nube.test.js — diagnóstico de la nube de extremo a extremo (2026.10.31): cada patrón se reconoce y el
// texto dice lo correcto; en particular, una correlación corriente NO se interpreta como condición necesaria.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagnosticarForma } from '../../src/analizador/relaciones/diagnostico-forma.js';
import { parrafoNube } from '../../src/analizador/relaciones/nube-redaccion.js';

let a = 3131 >>> 0;
const u01 = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const nrm = () => Math.sqrt(-2 * Math.log(u01() || 1e-12)) * Math.cos(2 * Math.PI * u01());
const base = (n, gen) => { const x = [], y = []; for (let i = 0; i < n; i++) { const [p, q] = gen(); x.push(p); y.push(q); } return [x, y]; };

test('triángulo (sin X alta no hay Y alta): techo, condición necesaria y su párrafo', () => {
    const [x, y] = base(300, () => { const v = u01(); return [10 * v, 10 * v * u01()]; }), d = diagnosticarForma(x, y, { B: 19, Bnube: 199 });
    assert.equal(d.nube.patron.patron, 'techo'); assert.equal(d.nube.necesaria, true);
    assert.ok(parrafoNube(d.nube, 'X', 'Y').includes('sin valores altos de X no se observan valores altos de Y'));
});

test('correlación corriente (r ≈ .5): la esquina vacía NO se interpreta como condición necesaria, y el texto lo advierte', () => {
    const [x, y] = base(300, () => { const z = nrm(); return [z, 0.5 * z + 0.87 * nrm()]; }), d = diagnosticarForma(x, y, { B: 19, Bnube: 199 });
    assert.equal(d.nube.necesaria, false);
    if (d.nube.necesidad.p < 0.05 && d.nube.necesidad.d >= 0.1) assert.ok(parrafoNube(d.nube, 'X', 'Y').includes('no indica una condición necesaria'));
});

test('abanico simétrico: dispersión que crece y bordes que se separan', () => {
    const [x, y] = base(300, () => { const z = nrm(); return [z, (0.3 + 0.3 * (z + 3)) * nrm()]; }), d = diagnosticarForma(x, y, { B: 19, Bnube: 199 });
    assert.equal(d.nube.heterocedasticidad.hay, true); assert.equal(d.nube.heterocedasticidad.bp.sube, true); assert.equal(d.nube.patron.patron, 'abanico');
    assert.ok(parrafoNube(d.nube, 'X', 'Y').includes('es un abanico'));
});

test('un atípico que arrastra la recta: se detecta, se da su fila original y la r se muestra sensible', () => {
    const x = [], y = []; for (let i = 0; i < 80; i++) { const z = nrm(); x.push(z); y.push(0.15 * z + nrm()); }
    x.push(''); y.push(3); x.push(7); y.push(9);   // la fila 81 queda incompleta; el atípico es la fila 82
    const d = diagnosticarForma(x, y, { B: 19, Bnube: 99 }), inf = d.nube.influencia;
    assert.ok(inf.nMuyInfluyentes >= 1 && inf.sensible, JSON.stringify({ muy: inf.nMuyInfluyentes, r: inf.rTodos, sin: inf.rSin }));
    assert.equal(inf.principales[0].fila, 82);
    assert.ok(parrafoNube(d.nube, 'X', 'Y').includes('fila 82'), parrafoNube(d.nube, 'X', 'Y'));
});

test('efecto techo de la medida: casos amontonados en el máximo de Y (> 15 %)', () => {
    const [x, y] = base(300, () => { const z = nrm(); return [Math.round(30 + 6 * z), Math.min(20, Math.round(16 + 3 * z + 2 * nrm()))]; }), d = diagnosticarForma(x, y, { B: 19, Bnube: 99 });
    assert.ok(d.nube.techoSuelo.y.techo, `${d.nube.techoSuelo.y.pMax}`);
    assert.ok(parrafoNube(d.nube, 'X', 'Y').includes('valor máximo observado de Y'));
});

test('revisión 2026.11.01: con Y de pocas categorías (ítem Likert) no se evalúan bordes, NCA ni techo o suelo (antes, «efecto techo» en 29 de 30 bases)', async () => {
    const { diagnosticarNube } = await import('../../src/analizador/relaciones/nube.js');
    const n = 300, x = new Float64Array(n), y = new Float64Array(n);
    for (let i = 0; i < n; i++) { const z = nrm(); x[i] = Math.round(30 + 6 * z); y[i] = Math.min(5, Math.max(1, Math.round(3.6 + 0.6 * z + 0.9 * nrm()))); }
    const d = diagnosticarForma(Array.from(x), Array.from(y), { B: 19, Bnube: 99 }), nb = d.nube;
    assert.deepEqual([nb.patron.patron, !!nb.necesidad.noAplica, !!nb.techoSuelo.y.noAplica, nb.necesaria], ['no-aplica', true, true, false]);
    assert.equal(nb.techoSuelo.x.noAplica, undefined, 'X (puntaje total) sí se evalúa');
    assert.ok(parrafoNube(nb, 'X', 'Ítem', d.categoria).includes('no se evaluaron los bordes de la nube'));
});

test('revisión 2026.11.01: sin atípicos, «la r depende de pocos casos» ya no salta por azar en muestras pequeñas (antes, 31 % con n = 30)', async () => {
    const { influenciaLineal } = await import('../../src/analizador/relaciones/nube.js');
    let sensibles = 0; const R = 200;
    for (let k = 0; k < R; k++) { const x = new Float64Array(30), y = new Float64Array(30); for (let i = 0; i < 30; i++) { x[i] = nrm(); y[i] = 0.4 * x[i] + nrm(); } if (influenciaLineal(x, y).sensible) sensibles++; }
    assert.ok(sensibles <= 16, `${sensibles} de ${R}`);
});

test('revisión 2026.11.01: el párrafo informa el NCA cuando hay techo sin necesidad, y reconcilia «sin relación» con una condición necesaria', () => {
    const base = { heterocedasticidad: { bp: { lm: 20, p: 0.001, sube: true }, white: { lm: 21, p: 0.001 }, hay: true }, cuantiles: { pendientes: [0.02, 0.4, 0.9], diferencia: { valor: 0.88, ic: [0.5, 1.2] }, B: 200, n: 40, nRemuestreo: 40 },
        patron: { patron: 'techo', direccion: 1 }, necesidad: { direccion: 1, d: 0.08, p: 0.2, B: 199, tamano: 'pequeño' }, necesaria: false,
        techoSuelo: { x: { pMax: 0.02, pMin: 0.02 }, y: { pMax: 0.02, pMin: 0.02 } }, influencia: { n: 40, maxD: 0.1, nMuyInfluyentes: 0, nAtipicos: 0, nInfluyentes: 2, rTodos: 0.5, rSin: 0.52, cambio: 0.02, fMediana: 0.7, principales: [], filasMuyInfluyentes: [], filasAtipicas: [] } };
    assert.ok(parrafoNube(base, 'X', 'Y').includes('no la respalda (d = .08, p = .200; Dul et al., 2020): el efecto es pequeño'));
    const con = { ...base, necesaria: true, necesidad: { ...base.necesidad, d: 0.35, p: 0.001, tamano: 'grande' } };
    assert.ok(parrafoNube(con, 'X', 'Y', 'sin-relacion').includes('no contradice este resultado'));
});
