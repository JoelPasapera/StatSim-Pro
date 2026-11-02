// grupo-workers.test.js — (2027.01.19) el grupo de Workers (shared/grupo-workers.js) con Workers falsos que calculan en un
// turno aparte: el orden de los resultados, el tope de Workers a la vez, el progreso de cada parte, cancelar una llamada sin
// tocar la otra, el Worker que se rompe (su parte va al hilo principal) y la fábrica sin Workers. Y el reparto del servicio
// psicométrico con el cálculo de verdad: la imputación múltiple y la potencia de la mediación dan, repartidas en partes, lo
// mismo que el núcleo de una vez.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearGrupoWorkers, tamanoGrupo, tramos } from '../../src/shared/grupo-workers.js';

/** Un Worker falso: responde en un turno aparte, con progreso; `fallar` lo rompe al recibir su primer mensaje. */
function fabrica({ demora = 5, fallar = () => false, calcular = (/** @type {any} */ m) => m.opciones.x * 2 } = {}) {
    const estado = { creados: 0, ocupados: 0, maxOcupados: 0, terminados: 0, recibidos: /** @type {number[]} */ ([]) };
    class Falso {
        constructor() { this.numero = ++estado.creados; this.terminado = false; /** @type {any} */ this.onmessage = null; /** @type {any} */ this.onerror = null; }
        postMessage(/** @type {any} */ m) {
            estado.recibidos.push(m.opciones.x); estado.ocupados++; estado.maxOcupados = Math.max(estado.maxOcupados, estado.ocupados);
            setTimeout(() => {
                if (this.terminado) { estado.ocupados--; return; }
                if (fallar(this.numero, m)) { estado.ocupados--; this.onerror({ message: 'roto', preventDefault() {} }); return; }
                this.onmessage({ data: { id: m.id, tipo: 'progreso', hecho: 1, total: 2 } });
                setTimeout(() => {
                    estado.ocupados--;
                    if (this.terminado) return;
                    try { this.onmessage({ data: { id: m.id, tipo: 'fin', res: calcular(m) } }); } catch (e) { this.onmessage({ data: { id: m.id, tipo: 'error', mensaje: /** @type {Error} */ (e).message } }); }
                }, demora);
            }, demora);
        }
        terminate() { if (!this.terminado) { this.terminado = true; estado.terminados++; } }
    }
    return { crear: () => /** @type {Worker} */ (/** @type {unknown} */ (new Falso())), estado };
}
const respaldo = (/** @type {any} */ p, /** @type {(h: number, t: number) => void} */ alProgreso) => { alProgreso(2, 2); return p.opciones.x * 2; };
const partes = (/** @type {number} */ n) => Array.from({ length: n }, (_, k) => ({ tipo: 'doble', grupos: [], opciones: { x: k + 1 } }));

test('los resultados en su orden, con 3 Workers como mucho y reutilizados; el progreso de cada parte', async () => {
    const { crear, estado } = fabrica(), g = crearGrupoWorkers(crear, 3, respaldo);
    /** @type {[number, number, number][]} */ const avisos = [];
    const r = await g.ejecutar(partes(8), (k, h, t) => avisos.push([k, h, t])).promesa;
    assert.deepEqual(r, [2, 4, 6, 8, 10, 12, 14, 16]);
    assert.equal(estado.creados, 3); assert.equal(estado.maxOcupados, 3);
    assert.deepEqual(estado.recibidos, [1, 2, 3, 4, 5, 6, 7, 8], 'en el orden de llegada');
    assert.equal(avisos.length, 8); assert.ok(avisos.every(([, h, t]) => h === 1 && t === 2));
    assert.equal(g.vivos(), 3);
    g.terminar(); assert.equal(g.vivos(), 0);
});

test('cancelar una llamada quita sus partes y sus Workers, sin tocar la otra que comparte el grupo', async () => {
    const { crear, estado } = fabrica({ demora: 10 }), g = crearGrupoWorkers(crear, 2, respaldo);
    const a = g.ejecutar(partes(6)), b = g.ejecutar([{ tipo: 'doble', grupos: [], opciones: { x: 50 } }]);
    setTimeout(() => a.cancelar(), 5);
    await assert.rejects(a.promesa, (/** @type {any} */ e) => e.cancelado === true);
    assert.deepEqual(await b.promesa, [100]);
    assert.ok(estado.recibidos.length < 7, `no se calcularon todas: ${estado.recibidos}`);
    assert.ok(estado.terminados >= 1);
    // el grupo sigue sirviendo
    assert.deepEqual(await g.ejecutar(partes(3)).promesa, [2, 4, 6]);
});

test('un Worker que se rompe: su parte, al hilo principal; el grupo no crea más y termina con los que quedan', async () => {
    const { crear, estado } = fabrica({ fallar: n => n === 2 }), g = crearGrupoWorkers(crear, 3, respaldo);
    const r = await g.ejecutar(partes(7)).promesa;
    assert.deepEqual(r, [2, 4, 6, 8, 10, 12, 14]);
    assert.equal(estado.creados, 3, 'no crea otro tras el fallo');
    assert.equal(g.vivos(), 2);
});

test('sin Workers (la fábrica da null o lanza), todo en el hilo principal, con el mismo resultado', async () => {
    for (const crear of [() => null, () => { throw new Error('sin Worker'); }]) {
        const g = crearGrupoWorkers(crear, 4, respaldo);
        /** @type {number[]} */ const avisos = [];
        assert.deepEqual(await g.ejecutar(partes(5), k => avisos.push(k)).promesa, [2, 4, 6, 8, 10]);
        assert.deepEqual(avisos, [0, 1, 2, 3, 4]);
        assert.deepEqual(await g.ejecutar([]).promesa, []);
    }
});

test('el error de una parte rechaza su llamada y detiene sus otras partes', async () => {
    const { crear } = fabrica({ calcular: m => { if (m.opciones.x === 2) throw new Error('parte mala'); return m.opciones.x; } }), g = crearGrupoWorkers(crear, 2, respaldo);
    await assert.rejects(g.ejecutar(partes(5)).promesa, /parte mala/);
    assert.deepEqual(await g.ejecutar(partes(2).map(p => ({ ...p, opciones: { x: 7 } }))).promesa, [7, 7]);
});

test('el tamaño del grupo y los tramos', () => {
    assert.equal(tamanoGrupo(8), 7); assert.equal(tamanoGrupo(16), 8); assert.equal(tamanoGrupo(3), 2); assert.equal(tamanoGrupo(2), 2); assert.equal(tamanoGrupo(1), 1); assert.equal(tamanoGrupo(undefined), 2);
    assert.deepEqual(tramos(10, 3), [[0, 4], [4, 7], [7, 10]]);
    assert.deepEqual(tramos(2, 5), [[0, 1], [1, 2]]);
    assert.deepEqual(tramos(1000, 1), [[0, 1000]]);
});

test('el reparto del servicio con el cálculo de verdad: la imputación y la potencia de la mediación, iguales que el núcleo', async () => {
    const { procesar } = await import('../../src/analizador/psicometria/tareas-psicometricas.js');
    // Workers falsos que ejecutan las tareas del programa (en un turno aparte, con su progreso)
    class WorkerFalso {
        constructor() { /** @type {any} */ this.onmessage = null; /** @type {any} */ this.onerror = null; }
        postMessage(/** @type {any} */ m) { setTimeout(() => { const res = procesar(m.tipo, m.grupos, m.opciones, (h, t) => this.onmessage({ data: { id: m.id, tipo: 'progreso', hecho: h, total: t } })); this.onmessage({ data: { id: m.id, tipo: 'fin', res } }); }, 1); }
        terminate() {}
    }
    const previo = globalThis.Worker;
    /** @type {any} */ (globalThis).Worker = WorkerFalso;
    try {
        const { imputarRepartido, potenciaMediacionRepartida } = await import('../../src/analizador/psicometria/servicio-psicometrico.js');
        const { imputarPMM } = await import('../../src/core/stats/imputacion.js');
        const { potenciaMediacion, tamanoMuestraMediacion } = await import('../../src/core/stats/potencia-mediacion.js');
        const n = 60, X = [Float64Array.from({ length: n }, (_, i) => (i * 37) % 7), Float64Array.from({ length: n }, (_, i) => (i % 9 === 0 ? NaN : ((i * 11) % 5) + 1)), Float64Array.from({ length: n }, (_, i) => (i % 7 === 3 ? NaN : ((i * 13) % 6) + 2))];
        const opciones = { m: 7, iteraciones: 4, semilla: 99, metodo: /** @type {'pmm'} */ ('pmm') };
        /** @type {number[]} */ const avisos = [];
        const repartida = await imputarRepartido(X, opciones, h => avisos.push(h), { partes: 3 }).promesa, junta = imputarPMM(X, opciones);
        assert.deepEqual(repartida.imputaciones.map((/** @type {any} */ c) => c.cadena), [0, 1, 2, 3, 4, 5, 6]);
        assert.deepEqual(repartida.imputaciones.map((/** @type {any} */ c) => c.columnas.map((/** @type {Float64Array} */ x) => [...x])), junta.imputaciones.map(c => c.columnas.map(x => [...x])));
        assert.deepEqual(repartida.traza, junta.traza);
        assert.equal(repartida.m, 7); assert.deepEqual(repartida.imputadas, junta.imputadas);
        assert.equal(avisos.at(-1), 28, 'el progreso suma las iteraciones de las tres partes');
        const conN = await potenciaMediacionRepartida({ a: 0.39, b: 0.39, cp: 0, n: 50 }, { R: 300, alfa: 0.05, semilla: 2027, potenciaDeseada: 0.8 }, null, { partes: 4 }).promesa;
        assert.deepEqual(conN, potenciaMediacion(0.39, 0.39, 0, 50, { R: 300 }));
        const sinN = await potenciaMediacionRepartida({ a: 0.39, b: 0.39, cp: 0, n: 0 }, { R: 200, alfa: 0.05, semilla: 2027, potenciaDeseada: 0.8 }, null, { partes: 3 }).promesa;
        assert.deepEqual(sinN, tamanoMuestraMediacion(0.39, 0.39, 0, { R: 200 }));
        const imposible = await potenciaMediacionRepartida({ a: 0.39, b: 0, cp: 0.5, n: 0 }, { R: 100, alfa: 0.05, semilla: 1, potenciaDeseada: 0.8 }).promesa;
        assert.equal(imposible, null, 'sin b, no hay mediación');
    } finally { /** @type {any} */ (globalThis).Worker = previo; }
});

test('(2027.01.20) un mensaje que no se puede enviar va al respaldo; terminar() cancela también lo que esperaba en el respaldo', async () => {
    // un Worker cuyo postMessage lanza (unos datos que no se clonan): las partes se calculan en el hilo principal
    class NoClona { constructor() { /** @type {any} */ this.onmessage = null; /** @type {any} */ this.onerror = null; } postMessage() { throw new Error('DataCloneError'); } terminate() {} }
    const g = crearGrupoWorkers(() => /** @type {Worker} */ (/** @type {unknown} */ (new NoClona())), 2, respaldo);
    assert.deepEqual(await g.ejecutar(partes(4)).promesa, [2, 4, 6, 8]);
    // sin Workers, las partes esperan su turno en el respaldo: terminar() las cancela antes de que se calculen
    let calculadas = 0;
    const h = crearGrupoWorkers(() => null, 2, (/** @type {any} */ p) => { calculadas++; return p.opciones.x; });
    const llamada = h.ejecutar(partes(3));
    h.terminar();
    await assert.rejects(llamada.promesa, (/** @type {any} */ e) => e.cancelado === true);
    await new Promise(r => setTimeout(r, 5));
    assert.equal(calculadas, 0, 'nada se calcula después de terminar');
});
