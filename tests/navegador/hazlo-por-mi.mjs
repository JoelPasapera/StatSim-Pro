// @ts-check
// tests/navegador/hazlo-por-mi.mjs — (2027.01.03) «Hazlo por mí» en Chromium, como lo usaría una persona: cada caso de
// ejemplos/ se abre desde la pestaña «Ejemplos» con «Abrir en StatSim» y sus pasos se repiten con los botones de su guía
// (el «Hazlo por mí» de cada paso en los casos 1 a 4; «Hazlo todo por mí» en el 5). Tras cada paso, lo que se descarga es,
// byte a byte, lo de la carpeta del caso (los resultados en texto, los capítulos en Word, las tablas de la V de Aiken y del
// AFE, sus Word y el de la invarianza) y los modelos del SEM son los del caso: la guía deja la página como la dejó el caso.
// (Revisión) Aunque antes se haya calculado otro AFE (sus resultados a la vista no cuentan como los del paso), y con
// «Hazlo todo por mí» en el caso 2: señala las descargas de lo que quedó en la página y dice cuáles ya no están.
// Y «Muéstrame»: el control que señala queda a la vista, sin la guía encima, en el escritorio y en un teléfono de 360 px;
// con el teclado, el foco pasa a «Detener» y vuelve al botón. Sin errores en la página.
//
//     node tests/navegador/hazlo-por-mi.mjs [caso…]      (o «muestrame»: solo lo de «Muéstrame»)
//
// Necesita Playwright con Chromium (como tests/navegador/ejemplos.mjs); sin él, dice cómo y termina sin error.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirPagina, prepararChromium } from './entorno.mjs';
import { descargarCon } from './acciones.mjs';
import { accionEjecutable, planDe, senalesDe } from '../../src/ejemplos/hazlo/planes.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/** @type {string[]} */
const fallos = [];
/** Lo comprobado: ✓ o ✗ y por qué. @param {boolean} ok @param {string} que */
function comprobar(ok, que) {
    console.log(`${ok ? '✓' : '✗'} ${que}`);
    if (!ok) fallos.push(que);
}

/** @typedef {import('../../src/ejemplos/catalogo.js').Ejemplo} Ejemplo */

/** Un archivo del caso. @param {Ejemplo} e @param {string} ruta */
const delCaso = (e, ruta) => fs.readFileSync(path.join(raiz, 'ejemplos', e.carpeta, ...ruta.split('/')));
/** La verificación del caso (lo que dio la página al hacerlo). @param {Ejemplo} e */
const verificacionDe = e => JSON.parse(delCaso(e, 'verificacion.json').toString('utf8'));

/**
 * Abre un caso como una persona: la portada lleva a «Ejemplos» y su tarjeta, a «Abrir en StatSim» (la confirmación la
 * acepta entorno.mjs). Con el ritmo de la guía que se pida (en ms; sin él, el de la página).
 * @param {any} pagina
 * @param {Ejemplo} e
 * @param {{ hacer?: number, mostrar?: number }} [ritmo]
 */
async function abrirCaso(pagina, e, ritmo) {
    await pagina.click('#heroPortada a[data-ir-a="ejemplos"]');
    await pagina.click(`.ejemplo-tarjeta [data-accion-ejemplo="abrir"][data-carpeta="${e.carpeta}"]`);
    await pagina.waitForSelector('#guiaEjemplo', { timeout: 60000 });
    await pagina.waitForFunction(() => document.getElementById('analizador')?.classList.contains('active'));
    if (ritmo) await pagina.evaluate((/** @type {any} */ r) => import('./src/ejemplos/hazlo/conductor.js').then(m => { Object.assign(m.RITMO, r); }), ritmo);
}

/** Despliega la guía, si está plegada (sus botones de los pasos están en su cuerpo). @param {any} pagina */
async function desplegar(pagina) {
    if (await pagina.evaluate(() => document.getElementById('guiaEjemplo')?.classList.contains('plegada'))) await pagina.click('#guiaEjemplo [data-accion-guia="plegar"]');
}

/** Lo que dice la línea de estado de la guía. @param {any} pagina @returns {Promise<string>} */
const estadoDeLaGuia = pagina => pagina.evaluate(() => document.getElementById('guiaEjemploEstado')?.textContent || '');

/**
 * Pulsa un botón de la guía y espera a que termine lo que puso en marcha (la invarianza tarda minutos). Su línea de estado.
 * @param {any} pagina
 * @param {string} selector
 */
async function pulsarYEsperar(pagina, selector) {
    await desplegar(pagina);
    await pagina.click(selector);
    await pagina.waitForFunction(() => { const d = /** @type {HTMLElement | null} */ (document.querySelector('#guiaEjemplo [data-accion-guia="detener"]')); return !!d && d.hidden; }, null, { timeout: 40 * 60000, polling: 250 });
    return estadoDeLaGuia(pagina);
}

/**
 * Lo que se descarga con un botón, comparado con el archivo del caso.
 * @param {any} pagina
 * @param {Ejemplo} e
 * @param {string} selector
 * @param {(nombre: string) => string | null} rutaDe la ruta del archivo del caso con que se compara, por el nombre que propone la página
 */
async function compararDescarga(pagina, e, selector, rutaDe) {
    const { nombre, bytes } = await descargarCon(pagina, selector);
    const ruta = rutaDe(nombre);
    if (!ruta) { comprobar(false, `${e.carpeta}: «${nombre}» (${selector}) no es ningún archivo del caso`); return; }
    const esperado = delCaso(e, ruta);
    comprobar(bytes.equals(esperado), `${e.carpeta}: ${ruta}, el del caso byte a byte${bytes.equals(esperado) ? '' : ` (sale de ${bytes.length} bytes; el del caso, ${esperado.length})`}`);
}

/** El archivo del caso con un nombre (el único que lo tiene), para las descargas de las tarjetas. @param {Ejemplo} e */
const porNombre = e => (/** @type {string} */ nombre) => {
    const xs = e.archivos.filter(a => a.ruta.split('/').pop() === nombre);
    return xs.length === 1 ? xs[0].ruta : null;
};

/**
 * Los modelos del SEM de la página, comparados con los del caso (los de su verificación, por su nombre y su sintaxis).
 * @param {any} pagina
 * @param {Ejemplo} e
 * @param {Array<Record<string, any>>} modelos los ajustarSEM del guion
 */
async function compararSEM(pagina, e, modelos) {
    const ajustes = await pagina.evaluate(() => import('./src/analizador/sem-motor.js').then(m => m.SEM._ultimos.map((/** @type {any} */ M) => ({ etiqueta: M.etiquetaModelo, sintaxis: M.sintaxis, n: M.n, chi2: M.chi2, gl: M.gl, CFI: M.CFI, RMSEA: M.RMSEA, SRMR: M.SRMR }))));
    const sem = verificacionDe(e).comprobaciones.filter((/** @type {any} */ c) => c.tipo === 'sem');
    for (const m of modelos) {
        const visto = [...ajustes].reverse().find((/** @type {any} */ a) => a.etiqueta === (m.etiqueta || 'Modelo inicial'));
        const caso = sem.find((/** @type {any} */ c) => c.entrada.sintaxis === m.sintaxis && c.entrada.etiqueta === m.etiqueta);
        const difs = visto && caso ? ['n', 'chi2', 'gl', 'CFI', 'RMSEA', 'SRMR'].filter(k => Math.abs(visto[k] - caso.resultado[k]) > 1e-9 * Math.max(1, Math.abs(caso.resultado[k]))) : ['falta'];
        comprobar(difs.length === 0, `${e.carpeta}: el SEM «${m.etiqueta}», el del caso (χ², gl, CFI, RMSEA, SRMR)${difs.length ? ` (difieren: ${difs.join(', ')})` : ''}`);
    }
}

/**
 * Lo que dejó un paso, comparado con el caso: las descargas de sus análisis (las del propio paso y, en el último que se
 * repite, las de los pasos opcionales de después), las de sus tarjetas y sus modelos del SEM.
 * @param {any} pagina
 * @param {Ejemplo} e
 * @param {number} n
 */
async function compararPaso(pagina, e, n) {
    const guiones = /** @type {import('../../src/ejemplos/hazlo/planes.js').AccionDelGuion[][]} */ (e.guiones);
    const acciones = [...guiones[n - 1], ...(n === e.repetir.hasta ? guiones.slice(n).flat().filter(a => a.accion === 'exportarAnalisis') : [])];
    for (const a of acciones) {
        if (a.accion === 'exportarAnalisis') {
            const carpeta = `analizador/${a.datos.carpeta}`;
            if (a.datos.word !== false) await compararDescarga(pagina, e, '#btnExportarWord', nombre => `${carpeta}/${nombre}`);
            await compararDescarga(pagina, e, '#btnDescargarResultados', nombre => `${carpeta}/${nombre}`);
        } else if (accionEjecutable(a)) {
            for (const o of senalesDe(planDe(a).ops)) if (o.op === 'senalar') await compararDescarga(pagina, e, o.selector, porNombre(e));
        }
    }
    const modelos = guiones[n - 1].filter(a => a.accion === 'ajustarSEM').map(a => a.datos);
    if (modelos.length) await compararSEM(pagina, e, modelos);
}

/**
 * (Revisión) Un AFE distinto del del caso (con varimax), con sus resultados a la vista: el de «Hazlo por mí» no debe darse por
 * hecho con ellos.
 * @param {any} pagina
 */
async function otroAFE(pagina) {
    await pagina.click('#afeActualizar');
    await pagina.selectOption('#afeRotacion', 'varimax');
    await pagina.click('#afeCalcular');
    await pagina.waitForFunction(() => {
        const r = document.getElementById('afeResultados'), b = /** @type {HTMLButtonElement | null} */ (document.getElementById('afeCalcular'));
        return !!r && !r.hidden && (r.textContent || '').trim().length > 0 && !!b && !b.disabled;
    }, null, { timeout: 15 * 60000, polling: 250 });
}

/**
 * Un caso, repetido con la guía: paso a paso (o con «Hazlo todo por mí»), comparando lo que deja cada uno.
 * @param {Ejemplo} e
 * @param {{ todo?: boolean, ritmo?: { hacer?: number, mostrar?: number } }} como
 */
async function repetirCaso(e, { todo = false, ritmo = { hacer: 0, mostrar: 0 } }) {
    const t0 = Date.now();
    const { pagina, errores, cerrar } = await abrirPagina({ raiz });
    try {
        await abrirCaso(pagina, e, ritmo);
        const pasos = await pagina.$$eval('#guiaEjemplo [data-accion-guia="hacer"]', (/** @type {Element[]} */ bs) => bs.map(b => Number(b.getAttribute('data-paso'))));
        const esperados = e.pasos.map((_, i) => i + 1).filter(k => k >= e.repetir.desde && k <= e.repetir.hasta);
        comprobar(JSON.stringify(pasos) === JSON.stringify(esperados), `${e.carpeta}: «Hazlo por mí» en ${pasos.length ? `los pasos ${pasos.join(', ')}` : 'ningún paso'} (los que hay que repetir)`);
        if (todo) {
            const estado = await pulsarYEsperar(pagina, '#guiaEjemplo [data-accion-guia="hacerTodo"]');
            const bien = /^Listo: se repitieron /.test(estado);
            comprobar(bien, `${e.carpeta}: «Hazlo todo por mí» termina: «${estado.slice(0, 160)}»`);
            if (bien) for (const n of pasos) await compararPaso(pagina, e, n);
        } else {
            for (const n of pasos) {
                const afe = /** @type {any[][]} */ (e.guiones)[n - 1].some(a => a.accion === 'calcularAFE');
                if (afe) await otroAFE(pagina);
                const estado = await pulsarYEsperar(pagina, `#guiaEjemplo [data-accion-guia="hacer"][data-paso="${n}"]`);
                if (afe) comprobar(true, `${e.carpeta}: «Hazlo por mí» del paso ${n}, con otro AFE (varimax) a la vista antes`);
                const bien = estado.startsWith(`Listo: paso ${n} hecho`);
                comprobar(bien, `${e.carpeta}: «Hazlo por mí» del paso ${n} termina: «${estado.slice(0, 160)}»`);
                if (!bien) return;   // (los pasos que siguen parten de este)
                await compararPaso(pagina, e, n);
            }
        }
        const casillas = await pagina.$$eval('#guiaEjemplo .guia-casilla', (/** @type {HTMLInputElement[]} */ cs) => cs.map(c => c.checked));
        comprobar(casillas.every((c, i) => c === (i + 1 <= e.repetir.hasta)), `${e.carpeta}: la guía marca hechos los pasos 1 a ${e.repetir.hasta}`);
        comprobar(errores.length === 0, `${e.carpeta}: sin errores en la página${errores.length ? `: ${errores.slice(0, 3).join(' | ')}` : ''} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    } finally {
        await cerrar();
    }
}

/**
 * «Muéstrame»: mientras señala, el control queda a la vista (bajo la cabecera fija, dentro de la pantalla) y sin la guía
 * encima (plegada mientras trabaja), al ancho que se pida; «Detener» lo para y la guía vuelve como estaba.
 * @param {Ejemplo} e
 * @param {number} ancho
 * @param {number} alto
 */
async function mostrarALaVista(e, ancho, alto) {
    const { pagina, errores, cerrar } = await abrirPagina({ raiz, ancho, alto });
    try {
        await abrirCaso(pagina, e, { mostrar: 4000 });
        const plegadaAntes = await pagina.evaluate(() => document.getElementById('guiaEjemplo')?.classList.contains('plegada'));
        await desplegar(pagina);
        // el aviso de «Proyecto abierto» no tapa la guía (sale a su lado o encima), y «Detener» no se ve sin nada en marcha
        await pagina.waitForTimeout(900);   // (lo que tarda el aviso en subir)
        const alAbrir = await pagina.evaluate(() => {
            const t = /** @type {HTMLElement} */ (document.getElementById('toast')), g = /** @type {HTMLElement} */ (document.getElementById('guiaEjemplo'));
            const a = t.getBoundingClientRect(), b = g.getBoundingClientRect();
            const detener = /** @type {HTMLElement} */ (g.querySelector('[data-accion-guia="detener"]'));
            return { aviso: t.classList.contains('show') && a.height > 0, encima: a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top, detener: detener.getClientRects().length > 0 };
        });
        comprobar(alAbrir.aviso && !alAbrir.encima && !alAbrir.detener, `${e.carpeta} a ${ancho} px: el aviso de «Proyecto abierto» no tapa la guía y «Detener» no se ve sin nada en marcha (${JSON.stringify(alAbrir)})`);
        const muestrame = `#guiaEjemplo [data-accion-guia="mostrar"][data-paso="${e.repetir.desde}"]`;
        await pagina.focus(muestrame);
        await pagina.keyboard.press('Enter');
        comprobar(await pagina.evaluate(() => { const d = document.querySelector('#guiaEjemplo [data-accion-guia="detener"]'); return !!d && d.getClientRects().length !== 0 && document.activeElement === d; }),
            `${e.carpeta} a ${ancho} px: en marcha, «Detener» se ve y tiene el foco (el botón pulsado queda en la guía plegada)`);
        const vistos = [];
        /** Dónde está un elemento en la pantalla. @param {string} id */
        const arriba = id => pagina.evaluate((/** @type {string} */ i) => Math.round(/** @type {HTMLElement} */ (document.getElementById(i)).getBoundingClientRect().top), id);
        for (const id of ['variable1', 'variable2', 'btnAnalizar']) {
            await pagina.waitForFunction((/** @type {string} */ i) => document.getElementById(i)?.classList.contains('guia-resaltado'), id, { timeout: 60000 });
            // (hasta que termine el desplazamiento suave: dos medidas seguidas iguales)
            for (let k = 0, antes = NaN; k < 30; k++) { await pagina.waitForTimeout(100); const ahora = await arriba(id); if (ahora === antes) break; antes = ahora; }
            vistos.push(await pagina.evaluate((/** @type {string} */ i) => {
                const el = /** @type {HTMLElement} */ (document.getElementById(i)), r = el.getBoundingClientRect();
                const cabecera = document.querySelector('.header')?.getBoundingClientRect();
                const g = document.getElementById('guiaEjemplo')?.getBoundingClientRect();
                const encima = !!g && r.left < g.right && r.right > g.left && r.top < g.bottom && r.bottom > g.top;
                const dentro = r.top >= (cabecera ? cabecera.bottom : 0) - 1 && r.bottom <= innerHeight + 1 && r.left >= -1 && r.right <= innerWidth + 1;
                return dentro && !encima ? '' : `${i}: ${dentro ? 'tapado por la guía' : 'fuera de la vista'} (${Math.round(r.top)}–${Math.round(r.bottom)} de ${innerHeight}${g ? `; la guía, ${Math.round(g.top)}–${Math.round(g.bottom)}` : ''})`;
            }, id));
        }
        const malos = vistos.filter(Boolean);
        comprobar(malos.length === 0, `${e.carpeta} a ${ancho} px: «Muéstrame» deja cada control a la vista y sin la guía encima${malos.length ? `: ${malos.join('; ')}` : ''}`);
        await pagina.keyboard.press('Enter');   // (en «Detener», que tiene el foco)
        await pagina.waitForFunction(() => /** @type {HTMLElement} */ (document.querySelector('#guiaEjemplo [data-accion-guia="detener"]')).hidden);
        comprobar(await pagina.evaluate((/** @type {string} */ s) => document.activeElement === document.querySelector(s), muestrame), `${e.carpeta} a ${ancho} px: detenido, el foco vuelve a «Muéstrame»`);
        const fin = await pagina.evaluate(() => ({ resaltados: document.querySelectorAll('.guia-resaltado').length, plegada: document.getElementById('guiaEjemplo')?.classList.contains('plegada'), estado: document.getElementById('guiaEjemploEstado')?.textContent }));
        comprobar(fin.resaltados === 0 && fin.plegada === false && fin.estado === `Detenido en el paso ${e.repetir.desde}.`,
            `${e.carpeta} a ${ancho} px: «Detener» lo para, sin nada resaltado y con la guía como estaba (${JSON.stringify(fin)}; antes, ${plegadaAntes ? 'plegada' : 'desplegada'})`);
        comprobar(errores.length === 0, `${e.carpeta} a ${ancho} px: sin errores en la página${errores.length ? `: ${errores.slice(0, 3).join(' | ')}` : ''}`);
    } finally {
        await cerrar();
    }
}

/**
 * (Revisión) «Hazlo todo por mí» en un caso cuyos análisis se reemplazan unos a otros (el 2): deja señaladas las descargas de
 * lo que quedó en la página (las de su último paso, que es una χ²: sin el Word del capítulo) y dice cuáles ya no están; las
 * que señala son las del caso, byte a byte.
 * @param {Ejemplo} e
 */
async function todoConDescargas(e) {
    const { pagina, errores, cerrar } = await abrirPagina({ raiz });
    try {
        await abrirCaso(pagina, e, { hacer: 0, mostrar: 0 });
        const estado = await pulsarYEsperar(pagina, '#guiaEjemplo [data-accion-guia="hacerTodo"]');
        comprobar(/^Listo: se repitieron los pasos 2 a 4, como en el caso\. Te dejo señaladas las descargas de lo que ves \(las del paso 4\)\. Cada análisis reemplaza al anterior en la página: las descargas de los pasos 2 y 3 ya no están; repítelos con su «Hazlo por mí» o bájalas hechas en la pestaña «Ejemplos»\.$/.test(estado),
            `${e.carpeta}: «Hazlo todo por mí» dice qué descargas siguen y cuáles ya no («${estado.slice(0, 120)}…»)`);
        const senaladas = await pagina.$$eval('.guia-senalado', (/** @type {Element[]} */ xs) => xs.map(x => x.id));
        comprobar(JSON.stringify(senaladas) === JSON.stringify(['btnDescargarResultados', 'btnImprimirAnalizador']), `${e.carpeta}: señaladas, las del último análisis (${senaladas.join(', ')})`);
        await compararPaso(pagina, e, 4);
        comprobar(errores.length === 0, `${e.carpeta}: «Hazlo todo por mí» sin errores en la página${errores.length ? `: ${errores.slice(0, 3).join(' | ')}` : ''}`);
    } finally {
        await cerrar();
    }
}

async function principal() {
    const { pw, motivo } = await prepararChromium();
    if (!pw) { console.log(`Se omite «Hazlo por mí» en el navegador: ${motivo}.`); return; }
    const catalogo = JSON.parse(fs.readFileSync(path.join(raiz, 'ejemplos', 'indice.json'), 'utf8'));
    /** @type {Ejemplo[]} */
    const casos = catalogo.casos;
    const soloMostrar = process.argv.includes('muestrame');
    const nombres = process.argv.slice(2).filter(n => n !== 'muestrame');
    for (const n of nombres) if (!casos.some(e => e.carpeta === n)) { console.error(`No hay un caso «${n}»`); process.exit(2); }
    const elegidos = nombres.length ? casos.filter(e => nombres.includes(e.carpeta)) : casos;
    /** Una comprobación entera, sin que su fallo impida las demás. @param {string} que @param {() => Promise<void>} hacer */
    const aparte = async (que, hacer) => {
        try { await hacer(); } catch (err) { comprobar(false, `${que}: ${err instanceof Error ? err.message.split('\n')[0] : err}`); }
    };
    for (const e of soloMostrar ? [] : elegidos) {
        if (!Array.isArray(e.guiones)) { comprobar(false, `${e.carpeta}: el catálogo no trae sus guiones`); continue; }
        // el caso 1, con el ritmo de la página (lo que ve una persona); el último, con «Hazlo todo por mí»
        await aparte(e.carpeta, () => repetirCaso(e, { todo: e === casos[casos.length - 1], ritmo: e === casos[0] ? {} : { hacer: 0, mostrar: 0 } }));
    }
    if (!nombres.length) {
        const comparativo = casos.find(e => e.carpeta === '02-comparativo');
        if (comparativo) await aparte('«Hazlo todo por mí» en el caso 2', () => todoConDescargas(comparativo));
        await aparte('«Muéstrame» a 1280 px', () => mostrarALaVista(casos[0], 1280, 900));
        await aparte('«Muéstrame» a 1000 px', () => mostrarALaVista(casos[0], 1000, 800));
        await aparte('«Muéstrame» a 360 px', () => mostrarALaVista(casos[0], 360, 740));
    }
    if (fallos.length) { console.log(`\n${fallos.length} fallo(s)`); process.exit(1); }
}

principal().catch(e => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
