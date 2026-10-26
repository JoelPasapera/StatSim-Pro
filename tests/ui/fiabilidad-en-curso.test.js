// @ts-check
// tests/ui/fiabilidad-en-curso.test.js — (2027.01.04, revisión) con un Worker, como en el navegador: lo que la tarjeta de
// fiabilidad calcula en segundo plano con unos datos (los coeficientes ordinales, el bootstrap) se cancela al cargar otros
// (otra base, un proyecto, otro caso de la pestaña «Ejemplos»). Hasta la revisión, un bootstrap en marcha seguía ocupando el
// Worker de la fiabilidad, que hace una tarea detrás de otra, y los coeficientes ordinales de los datos nuevos lo esperaban:
// sus celdas «…» y «Esperando los coeficientes ordinales…» (con él, «Calcular intervalos») quedaban así hasta que terminaba,
// minutos con B = 2000 y BCa. El Worker de la prueba hace sus tareas de verdad (tareas-psicometricas.js), salvo el bootstrap,
// que no termina solo. (Cuarta revisión) Y al volver a analizar con los mismos datos: con los mismos grupos, el bootstrap
// sigue, a la vista en el bloque nuevo (su avance y su «Cancelar»); con otros (otras dimensiones), se cancela antes de pedir
// los coeficientes ordinales de los nuevos. Y si el Worker falla con el bootstrap dentro (se termina en el hilo principal,
// donde ya no se puede cancelar), sus intervalos, con otros datos cargados mientras tanto, se descartan.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { crearEntorno } from './minidom.js';

const raiz = new URL('../../', import.meta.url);
/** @type {any} */ const G = globalThis;
/** @type {any} */ let Fiabilidad;
/** @type {any} */ let bus;
/** @type {any} */ let EVENTOS;
/** @type {(tipo: string, grupos: any[], opciones: any, alProgreso: any) => any} */ let procesar;
/** Los Worker creados, en orden. @type {WorkerDePrueba[]} */
const creados = [];

/** Un Worker como el del navegador: una tarea detrás de otra, hasta que lo terminan. */
class WorkerDePrueba {
    /** La tarea con la que el Worker falla (como uno que se rompe): el servicio la termina en el hilo principal. @type {string} */
    static fallaCon = '';
    /** @param {URL} _url @param {{ name?: string }} [op] */
    constructor(_url, op) {
        this.nombre = op && op.name;
        this.terminado = false;
        /** @type {any[]} */ this.cola = [];
        /** @type {any} */ this.temporizador = null;
        /** @type {((e: { data: any }) => void) | null} */ this.onmessage = null;
        /** @type {((e: any) => void) | null} */ this.onerror = null;
        creados.push(this);
    }
    /** @param {any} mensaje */
    postMessage(mensaje) {
        if (mensaje.tipo === WorkerDePrueba.fallaCon) { setTimeout(() => { if (this.onerror) this.onerror({ message: 'falla de prueba' }); }, 0); return; }
        this.cola.push(mensaje);
        if (this.cola.length === 1) this.siguiente();
    }
    siguiente() {
        const m = this.cola[0];
        if (!m || this.terminado || m.tipo === 'bootstrap') return;   // el bootstrap no termina solo: el Worker queda ocupado
        this.temporizador = setTimeout(() => {
            if (this.terminado) return;
            const res = procesar(m.tipo, m.grupos, m.opciones, null);
            this.cola.shift();
            if (this.onmessage) this.onmessage({ data: { id: m.id, tipo: 'fin', res } });
            this.siguiente();
        }, 10);
    }
    terminate() { this.terminado = true; clearTimeout(this.temporizador); }
}

const q = (/** @type {string} */ sel) => G.document.querySelector(sel);
/** @param {() => any} cond */
const esperar = async (cond, ms = 10000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error('tiempo de espera agotado'); await new Promise(r => setTimeout(r, 15)); } };
/** Las filas de un conjunto de ordinal_fixture.json, con sus ítems «<prefijo>1», «<prefijo>2», … @param {string} conjunto @param {string} prefijo */
const filasDe = (conjunto, prefijo) => {
    const cols = JSON.parse(fs.readFileSync(new URL('tests/oracle/ordinal_fixture.json', raiz), 'utf8')).conjuntos[conjunto].cols;
    return cols[0].map((/** @type {number} */ _, /** @type {number} */ i) => Object.fromEntries(cols.map((/** @type {number[]} */ c, /** @type {number} */ j) => [`${prefijo}${j + 1}`, c[i]])));
};
const delWorker = () => creados.filter(w => w.nombre === 'psicometria-fiabilidad' && !w.terminado);
const listaLaTarjeta = () => !q('#resultadosFiabilidad td.calculando') && q('#bootCalcular') && !q('#bootCalcular').disabled;

before(async () => {
    crearEntorno(fs.readFileSync(new URL('index.html', raiz), 'utf8'));
    G.Worker = WorkerDePrueba;
    ({ procesar } = await import(new URL('src/analizador/psicometria/tareas-psicometricas.js', raiz).href));
    ({ Fiabilidad } = await import(new URL('src/analizador/fiabilidad.js', raiz).href));
    ({ bus, EVENTOS } = await import(new URL('src/shared/eventos.js', raiz).href));
    G.document.getElementById('configuradorDimensiones').innerHTML = '';
});

test('un bootstrap en marcha se cancela al cargar otros datos, y los coeficientes ordinales de los nuevos no lo esperan', async () => {
    Fiabilidad.mostrar('resultadosFiabilidad', filasDe('likert5', 'LK'));
    assert.ok(q('#resultadosFiabilidad td.calculando'), 'los coeficientes ordinales, en el Worker («…»)');
    assert.match(q('#bootCalcular').textContent, /Esperando los coeficientes ordinales/);
    await esperar(listaLaTarjeta);
    const [w] = delWorker();
    q('#bootB').value = '2000'; q('#bootMetodo').value = 'bca';
    q('#bootCalcular').click();
    assert.equal(w.cola.length && w.cola[0].tipo, 'bootstrap', 'el bootstrap, en el Worker de la fiabilidad');
    bus.emit(EVENTOS.DATOS_CARGADOS);   // otros datos: otra base, un proyecto, otro caso
    assert.ok(w.terminado, 'su Worker se termina: el bootstrap no sigue');
    Fiabilidad.mostrar('resultadosFiabilidad', filasDe('tres_categorias', 'TC'));
    assert.ok(q('#resultadosFiabilidad td.calculando'), 'los coeficientes ordinales de los datos nuevos, en un Worker nuevo');
    await esperar(listaLaTarjeta, 3000);   // sin la cancelación, esperarían al bootstrap (aquí, siempre)
    assert.match(q('#resultadosFiabilidad').textContent, /TC1/, 'la tarjeta es la de los datos nuevos');
    assert.equal(Fiabilidad._bootstrap, null, 'sin intervalos');
});

test('(cuarta revisión) al volver a analizar con los mismos datos: con los mismos grupos, el bootstrap sigue y el bloque nuevo lo muestra; con otros, se cancela', async () => {
    const filas = filasDe('likert5', 'LK');
    Fiabilidad.mostrar('resultadosFiabilidad', filas);
    await esperar(listaLaTarjeta);
    q('#bootB').value = '2000'; q('#bootMetodo').value = 'bca';
    q('#bootCalcular').click();
    const [w] = delWorker();
    assert.equal(w.cola.length && w.cola[0].tipo, 'bootstrap');
    const viejo = q('#bootstrapFiabilidad');
    Fiabilidad.mostrar('resultadosFiabilidad', filas);   // otra vez «Analizar», con lo mismo
    assert.notEqual(q('#bootstrapFiabilidad'), viejo, 'la tarjeta se repintó');
    assert.equal(w.terminado, false, 'el bootstrap sigue');
    assert.equal(q('#bootCalcular').disabled, true, '«Calcular intervalos», desactivado');
    assert.equal(q('#bootCancelar').hidden, false, 'con su «Cancelar»');
    assert.equal(q('#bootProgresoFila').hidden, false, 'y su avance');
    assert.deepEqual([q('#bootB').value, q('#bootMetodo').value], ['2000', 'bca'], 'con sus opciones');
    q('#bootCancelar').click();
    assert.ok(w.terminado, '«Cancelar» del bloque nuevo lo cancela');
    await esperar(() => q('#bootEstado').textContent === 'Cálculo cancelado.');
    assert.equal(q('#bootCalcular').disabled, false);
    // con otras dimensiones (otros grupos, los mismos datos): el de antes se cancela, y los coeficientes ordinales de los
    // nuevos no lo esperan
    q('#bootCalcular').click();
    const [w2] = delWorker();
    assert.equal(w2.cola.length && w2.cola[0].tipo, 'bootstrap');
    const otras = filas.map((/** @type {Record<string, number>} */ f) => { const { LK5, ...resto } = f; return resto; });
    Fiabilidad.mostrar('resultadosFiabilidad', otras);
    assert.ok(w2.terminado, 'el bootstrap de los grupos de antes se cancela');
    await esperar(listaLaTarjeta, 3000);
    assert.equal(q('#bootCancelar').hidden, true, 'y el bloque nuevo no muestra nada en marcha');
    assert.ok(!/LK5/.test(q('#resultadosFiabilidad').textContent), 'la tarjeta es la de los grupos nuevos');
    // y sin escalas que mostrar (la tarjeta se vacía), uno en marcha también se cancela
    q('#bootCalcular').click();
    const [w3] = delWorker();
    assert.equal(w3.cola.length && w3.cola[0].tipo, 'bootstrap');
    Fiabilidad.mostrar('resultadosFiabilidad', otras.map((/** @type {Record<string, number>} */ f) => ({ Edad: f.LK1 })));
    assert.equal(q('#resultadosFiabilidad').innerHTML, '', 'la tarjeta, vacía');
    assert.ok(w3.terminado, 'el bootstrap, cancelado');
});

test('los coeficientes ordinales que se calculaban con unos datos se cancelan al cargar otros: no ocupan el Worker ni quedan guardados', async () => {
    const guardados = Fiabilidad._ordinalCache.size;
    Fiabilidad.mostrar('resultadosFiabilidad', filasDe('dicotomicos', 'DI'));
    const [w] = delWorker();
    assert.equal(w.cola.length && w.cola[0].tipo, 'ordinal', 'en el Worker');
    bus.emit(EVENTOS.DATOS_CARGADOS);
    assert.ok(w.terminado, 'su Worker se termina');
    assert.equal(Fiabilidad._tareaOrdinal, null);
    await new Promise(r => setTimeout(r, 60));
    assert.equal(Fiabilidad._ordinalCache.size, guardados, 'no se calcularon');
    // y con los mismos datos otra vez (el mismo caso, abierto de nuevo), se piden de nuevo y llegan
    Fiabilidad.mostrar('resultadosFiabilidad', filasDe('dicotomicos', 'DI'));
    await esperar(listaLaTarjeta, 3000);
    assert.equal(Fiabilidad._ordinalCache.size, guardados + 1);
    assert.match(q('#resultadosFiabilidad').textContent, /KR-20/);
});

// (la última: tras el fallo, el servicio ya no usa Workers)
test('(cuarta revisión) si el Worker falla con el bootstrap dentro (lo termina el hilo principal, sin cancelarse), sus intervalos, con otros datos cargados mientras tanto, se descartan', async () => {
    let s = 7;
    const azar = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const filas = Array.from({ length: 40 }, () => { const f = azar(), g = azar(); return Object.fromEntries([1, 2, 3, 4].flatMap(k => [[`A${k}`, f + azar() * 0.6], [`B${k}`, g + azar() * 0.6]])); });
    Fiabilidad._bootstrap = null;
    Fiabilidad.mostrar('resultadosFiabilidad', filas);
    await esperar(listaLaTarjeta);
    const boton = q('#resultadosFiabilidad #bootCalcular');
    WorkerDePrueba.fallaCon = 'bootstrap';
    q('#bootB').value = '500';
    boton.click();
    await new Promise(r => setTimeout(r, 0));   // el Worker falla: la tarea pasa al hilo principal
    bus.emit(EVENTOS.DATOS_CARGADOS);           // y ya no se puede cancelar
    await esperar(() => Number(q('#bootProgreso').value) === 100, 30000);
    await new Promise(r => setTimeout(r, 50));
    assert.equal(Fiabilidad._bootstrap, null, 'sus intervalos se descartan');
    assert.equal(q('#resultadosFiabilidad #bootCalcular'), boton, 'y la tarjeta no se vuelve a pintar (su botón es el mismo)');
    assert.equal(q('#resultadosFiabilidad #bootResultados table'), null, 'sin intervalos en ella');
});
