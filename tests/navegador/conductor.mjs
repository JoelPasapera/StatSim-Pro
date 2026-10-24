// @ts-check
// tests/navegador/conductor.mjs — (2027.01.03) los planes de src/ejemplos/hazlo/planes.js en Chromium, con Playwright: las
// mismas operaciones que hace «Hazlo por mí» en la página (src/ejemplos/hazlo/conductor.js), con las acciones de una persona
// (pulsar, elegir una opción, escribir, el diálogo de archivos). Los ejemplos se hacen con estos planes (pasos.mjs): la guía
// repite exactamente lo que hizo cada caso. Cada espera falla diciendo qué esperaba y qué había.
import { CONDICIONES, VEREDICTO } from '../../src/ejemplos/hazlo/condiciones.js';
import { irA } from './acciones.mjs';

/**
 * Elige un archivo en el diálogo que abre un botón (como «Importar» o «Cargar CSV»).
 * @param {any} pagina
 * @param {() => Promise<unknown>} pulsar
 * @param {{ nombre: string, bytes: Buffer | string, tipo?: string }} archivo
 */
export async function elegirArchivo(pagina, pulsar, { nombre, bytes, tipo = 'text/csv' }) {
    const [dialogo] = await Promise.all([pagina.waitForEvent('filechooser', { timeout: 30000 }), pulsar()]);
    await dialogo.setFiles({ name: nombre, mimeType: tipo, buffer: typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : bytes });
}

/**
 * Pone el valor de un campo de texto o de un desplegable y avisa a la página (los eventos input y change).
 * @param {any} pagina
 * @param {string} selector
 * @param {string} valor
 */
export async function poner(pagina, selector, valor) {
    const etiqueta = await pagina.$eval(selector, /** @param {Element} el */ el => el.tagName);
    if (etiqueta === 'SELECT') {
        const elegidos = await pagina.selectOption(selector, String(valor));
        if (!elegidos.includes(String(valor))) throw new Error(`${selector}: no tiene la opción «${valor}»`);
    } else {
        await pagina.fill(selector, String(valor));
    }
}

/** El texto de un elemento de la página, por su id. @param {any} pagina @param {string} id @returns {Promise<string>} */
const textoDe = (pagina, id) => pagina.evaluate(/** @param {string} i */ i => (document.getElementById(i) || {}).textContent || '', id);

/**
 * Espera una condición del plan y, cumplida, la juzga (VEREDICTO, en la página: el mismo juicio que «Hazlo por mí»). Devuelve
 * lo que dijo la página (el aviso, la salida del SEM o el texto del elemento que se esperaba).
 * @param {any} pagina
 * @param {Extract<import('../../src/ejemplos/hazlo/planes.js').Op, { op: 'esperar' }>} o
 * @returns {Promise<string>}
 */
async function esperar(pagina, o) {
    try {
        await pagina.waitForFunction(CONDICIONES[o.condicion], o.arg, { timeout: o.ms });
    } catch (e) {
        const visto = await textoDe(pagina, 'toast');
        throw new Error(`${o.nombre} no terminó (${o.condicion} ${JSON.stringify(o.arg)}; el último aviso: «${visto.slice(0, 200)}»)`);
    }
    const { dicho, error } = await pagina.evaluate(VEREDICTO, { condicion: o.condicion, arg: o.arg, exito: o.exito, fallo: o.fallo });
    if (error) throw new Error(error);
    return dicho;
}

/**
 * Ejecuta las operaciones de un plan en la página de Playwright. Devuelve lo último que dijo la página en una espera (el
 * aviso de un análisis, la salida del SEM, el texto de una tarjeta).
 * @param {any} pagina
 * @param {import('../../src/ejemplos/hazlo/planes.js').Op[]} ops
 * @param {{ archivo?: (ruta: string) => { nombre: string, bytes: Buffer | string } }} [opciones] los archivos del caso que
 *   se suben (la V de Aiken), por su ruta
 * @returns {Promise<string>}
 */
export async function ejecutarPlan(pagina, ops, { archivo } = {}) {
    let ultimo = '';
    for (const o of ops) {
        switch (o.op) {
            case 'ir': await irA(pagina, o.seccion); break;
            case 'marcar':
                if (o.siVisible && !(await pagina.isVisible(o.selector))) {
                    if (o.valor) throw new Error(`${o.selector} no está a la vista: la regresión no admite esa opción con estos predictores`);
                    break;
                }
                await pagina.setChecked(o.selector, o.valor);
                break;
            case 'marcarSolo': {
                const casillas = pagina.locator(`${o.contenedor} input[type="checkbox"]`);
                const valores = await casillas.evaluateAll(/** @param {HTMLInputElement[]} cs */ cs => cs.map(c => c.value));
                const falta = o.valores.find(v => !valores.includes(v));
                if (falta !== undefined) throw new Error(`${o.nombre}: la lista no tiene «${falta}»`);
                for (let k = 0; k < valores.length; k++) await casillas.nth(k).setChecked(o.valores.includes(valores[k]));
                break;
            }
            case 'poner': await poner(pagina, o.selector, o.valor); break;
            case 'ponerOpcion': {
                const valor = await pagina.$eval(o.selector, /** @param {any} sel @param {string} texto */ (sel, texto) => {
                    const op = Array.from(sel.options).find(/** @param {any} x */ x => x.value === texto || x.textContent.trim() === texto || x.textContent.startsWith(texto));
                    return op ? op.value : null;
                }, o.texto);
                if (valor === null) throw new Error(`${o.selector}: no tiene «${o.texto}» (tiene: ${await pagina.$eval(o.selector, /** @param {any} s */ s => Array.from(s.options).map(/** @param {any} x */ x => x.textContent).join(' | '))})`);
                await poner(pagina, o.selector, valor);
                break;
            }
            case 'quitarTodos':
                for (let vueltas = 0, hay = await pagina.locator(o.selector).count(); hay > 0; vueltas++) {
                    if (vueltas > 50) throw new Error(`${o.nombre}: no se pudieron quitar`);
                    await pagina.locator(o.selector).first().click();
                    const quedan = await pagina.locator(o.selector).count();
                    if (quedan >= hay) throw new Error(`${o.nombre}: la página no quitó el que se pulsó`);
                    hay = quedan;
                }
                break;
            case 'limpiarAviso': await pagina.evaluate(() => { const t = document.getElementById('toast'); if (t) t.textContent = ''; }); break;
            case 'pulsar':
                if (o.vaciar) await pagina.evaluate(/** @param {string} s */ s => { const c = document.querySelector(s); if (c) c.innerHTML = ''; }, o.vaciar);
                await pagina.click(o.selector);
                break;
            case 'senalar': break;   // (lo de la persona: la guía lo señala; las descargas de los ejemplos las hace pasos.mjs)
            case 'bloques':
                for (;;) {
                    const hay = await pagina.locator(o.bloques).count();
                    if (hay < o.n) { await pagina.click(o.agregar); continue; }
                    if (hay > o.n) { await pagina.locator(`${o.bloques} ${o.quitar}`).last().click(); continue; }
                    break;
                }
                break;
            case 'ponerEnBloque': await pagina.locator(o.bloques).nth(o.indice).locator(o.selector).fill(o.valor); break;
            case 'subirEnBloque': {
                if (!archivo) throw new Error(`no hay de dónde sacar «${o.archivo}»`);
                const boton = pagina.locator(o.bloques).nth(o.indice).locator(o.boton);
                await elegirArchivo(pagina, () => boton.click(), archivo(o.archivo));
                break;
            }
            case 'esperar': { const dicho = await esperar(pagina, o); if (dicho) ultimo = dicho; break; }
            default: throw new Error(`operación desconocida: ${JSON.stringify(o)}`);
        }
    }
    return ultimo;
}
