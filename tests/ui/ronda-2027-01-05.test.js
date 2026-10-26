// @ts-check
// tests/ui/ronda-2027-01-05.test.js — (2027.01.05) lo que halló la revisión posterior a la entrega de la 2027.01.04, sobre
// index.html real y la base del caso 1 de ejemplos/ (con-el-caso-1.js): la lista de referencias no traía las del α y el ω
// ordinales, que llegan del Worker después de pintarla (el texto y el PDF citaban «Gadermann et al., 2012» sin su
// referencia); otro análisis tras la correlación dejaba a la vista, y en lo impreso, lo que solo es de ella (la matriz de
// consistencia, la tabla sociodemográfica, los niveles, los hallazgos sociodemográficos y los gráficos); y un bootstrap en
// marcha seguía con otro análisis y, al terminar, pintaba la tarjeta de fiabilidad dentro de él (y unos coeficientes ordinales
// que llegaran con la tarjeta ya vaciada, antes de un análisis que fallara sin volver a mostrarla, también la pintaban).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { analizadorConElCaso1, elegirAnalisis, esperar } from './con-el-caso-1.js';

const raiz = new URL('../../', import.meta.url);
/** @type {any} */ const G = globalThis;
/** @type {any} */ let env;
/** @type {Record<string, any>} */ let ui = {};
/** @type {any} */ let Fiabilidad;
/** @type {any} */ let bus;
/** @type {any} */ let EVENTOS;
const q = (/** @type {string} */ sel) => env.document.querySelector(sel);
const qa = (/** @type {string} */ sel) => env.document.querySelectorAll(sel);
/** Lo que solo es de la correlación de dos variables, por sus contenedores (los llena ejecutarCorrelacion). */
const DE_LA_CORRELACION = ['resultadosMatrizConsistencia', 'resultadosSociodemografica', 'resultadosNiveles', 'resultadosHallazgosSocio'];
/** ¿Está a la vista y con algo dentro? @param {string} id */
const aLaVista = id => { const el = q(`#${id}`); return !!el && el.style.display !== 'none' && el.innerHTML.trim() !== ''; };
/** «Ejecutar análisis» y su espera (el análisis va 300 ms después, en un turno aparte). @param {string} id el contenedor que llena */
const analizar = async id => {
    ui.analisis.ejecutarAnalisis();
    assert.equal(q('#btnAnalizar').disabled, true, 'en marcha');
    await esperar(() => !q('#btnAnalizar').disabled && aLaVista(id));
};
/** La tarjeta de fiabilidad, sin nada por llegar del Worker y con «Calcular intervalos» a mano. */
const listaLaTarjeta = () => !q('#resultadosFiabilidad td.calculando') && q('#bootCalcular') && !q('#bootCalcular').disabled;

/**
 * Un Worker como el del navegador, para la psicometría: una tarea detrás de otra; el bootstrap no termina solo, y mientras
 * «retener» esté puesto, ninguna (como un Worker ocupado): las suelta soltarTodo().
 */
class WorkerDePrueba {
    /** @type {WorkerDePrueba[]} */
    static creados = [];
    static retener = false;
    static soltarTodo() { WorkerDePrueba.retener = false; WorkerDePrueba.creados.forEach(w => w.siguiente()); }
    /** @param {URL} _url @param {{ name?: string }} [op] */
    constructor(_url, op) {
        this.nombre = op && op.name;
        this.terminado = false;
        this.ocupado = false;
        /** @type {any[]} */ this.cola = [];
        /** @type {((e: { data: any }) => void) | null} */ this.onmessage = null;
        /** @type {((e: any) => void) | null} */ this.onerror = null;
        WorkerDePrueba.creados.push(this);
    }
    /** @param {any} m */
    postMessage(m) { this.cola.push(m); this.siguiente(); }
    async siguiente() {
        const m = this.cola[0];
        if (!m || this.terminado || this.ocupado || WorkerDePrueba.retener || m.tipo === 'bootstrap') return;
        this.ocupado = true;
        const { procesar } = await import(new URL('src/analizador/psicometria/tareas-psicometricas.js', raiz).href);
        setTimeout(() => {
            this.ocupado = false;
            if (this.terminado) return;
            const res = procesar(m.tipo, m.grupos, m.opciones, null);
            this.cola.shift();
            if (this.onmessage) this.onmessage({ data: { id: m.id, tipo: 'fin', res } });
            this.siguiente();
        }, 10);
    }
    terminate() { this.terminado = true; }
}
/** El Worker de la fiabilidad que está en uso. */
const delaFiabilidad = () => /** @type {WorkerDePrueba} */ (WorkerDePrueba.creados.filter(x => x.nombre === 'psicometria-fiabilidad' && !x.terminado).pop());

before(async () => {
    ({ env, ui } = await analizadorConElCaso1());
    ({ Fiabilidad } = await import(new URL('src/analizador/fiabilidad.js', raiz).href));
    ({ bus, EVENTOS } = await import(new URL('src/shared/eventos.js', raiz).href));
});

test('(revisión) un bootstrap que termina con su bloque ya fuera de la página (la tarjeta se vació) no la vuelve a pintar', async () => {
    const { montarBloqueBootstrap } = await import(new URL('src/analizador/psicometria/bootstrap-ui.js', raiz).href);
    let s = 11;
    const azar = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const cols = [0, 1, 2, 3].map(() => /** @type {number[]} */ ([]));
    for (let i = 0; i < 40; i++) { const f = azar(); cols.forEach(c => c.push(f + azar() * 0.6)); }
    const grupos = [{ clave: 'escala-de-prueba', etiqueta: 'Escala', cols }];
    assert.equal(typeof G.Worker, 'undefined', 'sin Worker: en el hilo principal (por eso va primero)');
    /** Pide el bootstrap en un bloque; con «quitar», el bloque sale de la página en ese mismo instante. @param {boolean} quitar */
    const pedir = async quitar => {
        const zona = env.document.createElement('div');
        env.document.body.appendChild(zona);
        let pintadas = 0;
        montarBloqueBootstrap(zona, { grupos, opciones: { B: 500 }, resultados: null, esperando: false, alTerminar: () => { pintadas++; } });
        zona.querySelector('#bootCalcular').click();
        if (quitar) zona.remove();
        // sin Worker, en el hilo principal: no se puede cancelar una vez empezado; termina (su avance llega al 100 %)
        await esperar(() => Number(zona.querySelector('#bootProgreso').value) === 100, 60000);
        await new Promise(r => setTimeout(r, 20));
        if (!quitar) zona.remove();
        return pintadas;
    };
    assert.equal(await pedir(false), 1, 'con su bloque en la página, sus intervalos se guardan y la tarjeta se pinta');
    assert.equal(await pedir(true), 0, 'sin él, no');
});

test('(revisión) la lista de referencias trae las del α y el ω ordinales, que llegan del Worker después de pintarla', async () => {
    // desde aquí, la psicometría va a un Worker de prueba (sin Worker, los coeficientes ordinales se calculan en el acto)
    G.Worker = WorkerDePrueba;
    Fiabilidad._ordinalCache.clear();   // que vuelvan a llegar del Worker
    WorkerDePrueba.retener = true;
    try {
        elegirAnalisis(env, 'correlacion', 'General_EE', 'General_EB');
        await analizar('resultadosCorrelacion');
        assert.ok(q('#resultadosFiabilidad td.calculando'), 'los coeficientes ordinales, aún en el Worker');
        const lista = () => q('#resultadosContainer .references-container');
        assert.ok(lista() && !lista().textContent.includes('Gadermann'), 'la lista, pintada sin ellos');
    } finally {
        WorkerDePrueba.soltarTodo();
    }
    await esperar(listaLaTarjeta);
    assert.match(q('#resultadosFiabilidad').textContent, /α ordinal/, 'llegan los coeficientes ordinales');
    const lista = q('#resultadosContainer .references-container');
    assert.ok(lista, 'la lista de referencias, a la vista');
    for (const r of ['Gadermann, A. M., Guhn, M. y Zumbo, B. D. (2012)', 'Olsson, U. (1979)', 'Zumbo, B. D., Gadermann, A. M. y Zeisser, C. (2007)']) {
        assert.ok(lista.textContent.includes(r), `y con ellos, en la lista, «${r}»`);
    }
    // (y la lista solo se rehace si es lo que hay en su contenedor: el de la matriz de correlaciones es el mismo)
    const contenedor = q('#resultadosContainer');
    const antes = contenedor.innerHTML;
    contenedor.innerHTML = '<div class="matriz-flujo">la matriz de correlaciones</div>';
    bus.emit(EVENTOS.FIABILIDAD_ACTUALIZADA, { ordinal: true });
    assert.equal(contenedor.innerHTML, '<div class="matriz-flujo">la matriz de correlaciones</div>', 'la matriz no se cambia por la lista');
    contenedor.innerHTML = antes;
});

test('(revisión) otro análisis tras la correlación no deja a la vista lo que solo es de ella: la matriz de consistencia, lo sociodemográfico, los niveles, los hallazgos y los gráficos', async () => {
    const llenos = DE_LA_CORRELACION.filter(aLaVista);
    assert.deepEqual(llenos, DE_LA_CORRELACION, 'tras la correlación, a la vista');
    assert.ok(q('#contenedorGraficos').classList.contains('show') && q('#selectorVarsGraficos') && q('#diagrama-caja').innerHTML, 'y sus gráficos');
    elegirAnalisis(env, 'comparacion', 'General_EE', 'Sexo');
    await analizar('resultadosComparacion');
    for (const id of DE_LA_CORRELACION) {
        assert.equal(q(`#${id}`).innerHTML, '', `${id}, vacío`);
        assert.equal(q(`#${id}`).style.display, 'none', `${id}, oculto`);
    }
    assert.equal(q('#contenedorGraficos').classList.contains('show'), false, 'los gráficos, ocultos');
    for (const id of ['distribucion-gaussiana', 'matriz-correlacion', 'diagrama-caja']) assert.equal(q(`#${id}`).innerHTML, '', `${id}, vacío`);
    assert.equal(qa('#contenedorGraficos .analisis-grafico').length, 0, 'sin el análisis de debajo de cada gráfico');
    assert.equal(q('#selectorVarsGraficos'), null, 'sin su selector de variables');
    assert.equal(q('#resultadosFiabilidad').innerHTML, '', 'ni la fiabilidad');
    // con la asociación, igual; y de vuelta a la correlación, todo otra vez
    elegirAnalisis(env, 'asociacion', 'Sexo', 'Universidad');
    await analizar('resultadosChiCuadrado');
    assert.deepEqual(DE_LA_CORRELACION.filter(aLaVista), [], 'tras la asociación, nada de la correlación');
    assert.equal(q('#contenedorGraficos').classList.contains('show'), false);
    elegirAnalisis(env, 'correlacion', 'General_EE', 'General_EB');
    await analizar('resultadosCorrelacion');
    assert.deepEqual(DE_LA_CORRELACION.filter(aLaVista), DE_LA_CORRELACION, 'otra correlación: todo de nuevo');
    assert.ok(q('#contenedorGraficos').classList.contains('show') && q('#selectorVarsGraficos') && q('#diagrama-caja').innerHTML);
    assert.equal(qa('#selectorVarsGraficos').length, 1, 'un selector, no dos');
});

test('(revisión) un bootstrap en marcha se cancela con otro tipo de análisis (la comparación, la asociación), y la tarjeta de fiabilidad no vuelve dentro de él; con otra correlación de lo mismo, sigue; y unos coeficientes ordinales que llegan con la tarjeta vaciada no la pintan', async () => {
    for (const [tipo, v1, v2, id] of [['asociacion', 'Sexo', 'Universidad', 'resultadosChiCuadrado'], ['comparacion', 'General_EB', 'Universidad', 'resultadosComparacion']]) {
        elegirAnalisis(env, 'correlacion', 'General_EE', 'General_EB');
        await analizar('resultadosCorrelacion');
        await esperar(listaLaTarjeta);
        q('#bootB').value = '2000'; q('#bootMetodo').value = 'bca';
        q('#bootCalcular').click();
        const w = delaFiabilidad();
        assert.ok(w && w.cola.length && w.cola[0].tipo === 'bootstrap', 'el bootstrap, en el Worker de la fiabilidad');
        elegirAnalisis(env, tipo, v1, v2);
        await analizar(id);
        assert.ok(w.terminado, `${tipo}: el bootstrap se cancela (su Worker se termina)`);
        assert.equal(Fiabilidad._datosMostrados, null, `${tipo}: la fiabilidad ya no está a la vista (lo que termine después no la pinta)`);
        await new Promise(r => setTimeout(r, 50));
        assert.equal(q('#resultadosFiabilidad').innerHTML, '', `${tipo}: sin la tarjeta de fiabilidad`);
    }
    // con otra correlación de los mismos datos y las mismas dimensiones, en cambio, sigue: el bloque nuevo lo muestra (la
    // cuarta revisión de la 2027.01.04), con su avance y su «Cancelar»
    elegirAnalisis(env, 'correlacion', 'General_EE', 'General_EB');
    await analizar('resultadosCorrelacion');
    await esperar(listaLaTarjeta);
    q('#bootCalcular').click();
    const w = delaFiabilidad();
    assert.ok(w && w.cola.length && w.cola[0].tipo === 'bootstrap');
    await analizar('resultadosCorrelacion');
    assert.equal(w.terminado, false, 'otra correlación con lo mismo: el bootstrap sigue');
    assert.ok(Fiabilidad._datosMostrados, 'y la fiabilidad, a la vista');
    assert.equal(q('#bootCancelar').hidden, false, 'el bloque nuevo lo muestra, con su «Cancelar»');
    q('#bootCancelar').click();
    assert.ok(w.terminado, 'que lo cancela');
    // unos coeficientes ordinales que llegan con la tarjeta ya vaciada (antes de un análisis que falla sin volver a
    // mostrarla) no la pintan
    let s = 5;
    const azar = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const filas = Array.from({ length: 60 }, () => { const f = azar(); return Object.fromEntries([1, 2, 3, 4].map(k => [`OR${k}`, 1 + Math.min(4, Math.floor((f + azar()) * 2.5))])); });
    const guardados = Fiabilidad._ordinalCache.size;
    Fiabilidad.mostrar('resultadosFiabilidad', filas);
    assert.ok(q('#resultadosFiabilidad td.calculando'), 'los coeficientes ordinales, en el Worker');
    ui.carga.limpiarResultados();
    await esperar(() => Fiabilidad._ordinalCache.size === guardados + 1, 10000);
    await new Promise(r => setTimeout(r, 30));
    assert.equal(q('#resultadosFiabilidad').innerHTML, '', 'llegaron, y la tarjeta sigue vacía');
    // con ella a la vista, sí (lo de siempre)
    Fiabilidad.mostrar('resultadosFiabilidad', filas.map(f => ({ ...f, OR5: f.OR1 })));
    await esperar(listaLaTarjeta, 10000);
    assert.match(q('#resultadosFiabilidad').textContent, /OR5/);
});
