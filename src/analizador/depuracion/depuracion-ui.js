// @ts-check
// analizador/depuracion/depuracion-ui.js — (2027.01.18) la tarjeta «Antes de analizar: depuración de la base» del Analizador: qué
// variables se revisan (una escala detectada, todas las numéricas o una lista propia), su escala de respuesta, el
// identificador y qué criterios excluyen un caso. Muestra el resumen por criterio, los casos marcados con sus motivos y la
// redacción APA; descarga los casos (CSV), la base depurada (CSV) y el Word, y puede poner la base depurada en el Analizador
// (con vuelta atrás a la original). La zona de resultados (#depResultados) es la que se imprime.
// (2027.01.20, revisión) Si con las columnas de la base dos personas pueden coincidir por azar (pocos ítems de pocas opciones),
// los duplicados se muestran pero no se excluyen por defecto, y se avisa; y cambiar un criterio después de revisar vuelve a
// revisar (antes, «Usar la base depurada» aplicaba los criterios de la revisión anterior aunque las casillas dijeran otra cosa).
import { AnalizadorEstadistico } from '../estadistica.js';
import { EtiquetasVariables } from '../../shared/etiquetas-variables.js';
import { bus, EVENTOS } from '../../shared/eventos.js';
import { escaparHTML } from '../../shared/html.js';
import { descargarArchivo } from '../../shared/descargas.js';
import { mostrarToast } from '../../shared/toast.js';
import { aNumero } from '../../core/data/celdas.js';
import { conjuntosDe, opcionesHTML, variablesDe } from '../ui/conjuntos-variables.js';
import { revisarCasos, UMBRALES } from './deteccion-casos.js';
import { ORDEN_MOTIVOS, NOMBRE_MOTIVO, tablaResumen, tablaCasos, redactarDepuracion, referenciasDepuracion, csvCasos, csvBase, baseDepurada, filasExcluidas, documentoWordDepuracion } from './depuracion-redaccion.js';
import { descargarWord } from '../informe/word-apa.js';
import { sintaxisDepuracion, bloqueSintaxis } from '../informe/sintaxis.js';
import { reemplazarFilas } from '../ui/carga.js';

/** @typedef {import('./deteccion-casos.js').Motivo} Motivo */
/** @typedef {import('./depuracion-redaccion.js').ContextoDepuracion} ContextoDepuracion */
/** @typedef {import('./depuracion-redaccion.js').ResultadoDepuracion} ResultadoDepuracion */

/** @type {HTMLElement | null} */ let contenedor = null;
/** @type {{ R: ResultadoDepuracion, ctx: ContextoDepuracion, items: string[], filas: Record<string, unknown>[] } | null} */ let ultimo = null;
/** @type {ReturnType<typeof conjuntosDe>} */ let conjuntos = { escalas: [], numericas: [] };
/** La base que había antes de poner la depurada (para volver a ella), y si el aviso de datos cargados es el nuestro. */
/** @type {Record<string, unknown>[] | null} */ let original = null;
let aplicando = false;
/** ¿Marcó o desmarcó quien analiza la casilla de los duplicados? (entonces se respeta, aunque se esperen coincidencias por azar) */
let duplicadosElegidos = false;

/** Los criterios que excluyen un caso por defecto: los que casi nunca se discuten (las respuestas descuidadas y los atípicos
 * los decide quien analiza). @type {readonly Motivo[]} */
export const EXCLUIR_POR_DEFECTO = Object.freeze(['duplicado', 'perdidos']);

const guia = (/** @type {string} */ t) => `<div class="orden-guia" role="note" style="margin:0 0 0.6rem;"><span class="orden-guia-titulo">Para qué sirve:</span><span class="orden-nota">${t}</span></div>`;
/** @returns {Record<string, unknown>[]} */
function datos() { try { return /** @type {Record<string, unknown>[]} */ (AnalizadorEstadistico.obtenerDatos() || []); } catch (e) { return []; } }
const etiqueta = (/** @type {string} */ c) => { try { return EtiquetasVariables.etiqueta(c); } catch (e) { return c; } };
/** @param {string} sel @returns {any} */
const q = sel => /** @type {HTMLElement} */ (contenedor).querySelector(sel);

const PLANTILLA = () => `
    <h3 class="card-title">Antes de analizar: depuración de la base <span class="help-text" style="display:inline;">— recomendada</span></h3>
    <p class="help-text">Busca los casos que conviene revisar antes de analizar: duplicados, valores imposibles, demasiadas respuestas en blanco,
        respuestas descuidadas (la misma opción en todo) y atípicos. Muestra cada caso con su motivo; tú decides cuáles salen de la base.</p>
    <div class="rejilla-psico">
        <div class="form-group">
            ${guia('Qué variables se revisan: normalmente los ítems de tu instrumento (su «Escala total»).')}
            <label for="depConjunto">Variables a revisar</label>
            <select id="depConjunto" class="input"><option value="">Carga una base primero</option></select>
            <textarea id="depItems" class="input" rows="2" hidden aria-label="Variables separadas por comas" placeholder="Ej: P1, P2, P3, P4"></textarea>
            <span class="help-text">Las respuestas descuidadas se buscan con 6 ítems o más, en las respuestas tal como se marcaron: si ya invertiste los ítems inversos, una cadena de respuestas iguales puede ser coherente.</span>
        </div>
        <div class="form-group">
            ${guia('Los valores posibles de las respuestas: con ellos se detectan los imposibles (un 7 en una escala de 1 a 5).')}
            <span class="label" id="depRangoEtiqueta">Escala de respuesta</span>
            <div style="display:flex; gap:0.5rem; align-items:center;" role="group" aria-labelledby="depRangoEtiqueta">
                <input id="depMinimo" class="input" type="number" step="any" aria-label="Valor mínimo" placeholder="Mínimo" style="min-width:0;">
                <span aria-hidden="true">a</span>
                <input id="depMaximo" class="input" type="number" step="any" aria-label="Valor máximo" placeholder="Máximo" style="min-width:0;"></div>
            <label style="display:block;margin-top:0.4rem;cursor:pointer;"><input type="checkbox" id="depEnteros" checked style="margin-right:0.4rem;">Solo valores enteros</label>
            <span class="help-text" id="depRangoAyuda">En blanco, no se revisa el rango.</span>
        </div>
        <div class="form-group">
            ${guia('Qué hacer con los valores fuera de la escala de respuesta (suelen ser errores de digitación).')}
            <label for="depFuera">Valores fuera de rango</label>
            <select id="depFuera" class="input"><option value="perdido">Convertirlos en perdidos (recomendado)</option><option value="excluir">Excluir el caso</option><option value="nada">Dejarlos como están</option></select>
            <span class="help-text">Mejor aún: corrígelos en el archivo original si tienes los cuestionarios.</span>
        </div>
        <div class="form-group">
            ${guia('La columna que identifica a cada persona: para hallar identificadores repetidos y citar cada caso.')}
            <label for="depId">Identificador (opcional)</label>
            <select id="depId" class="input"><option value="">Ninguno</option></select>
            <span class="help-text">Sin identificador, cada caso se cita por su fila.</span>
        </div>
    </div>
    <div class="form-group">
        ${guia('Qué señales sacan un caso de la base depurada. Las demás se muestran para que las revises, pero el caso se conserva.')}
        <span class="label" id="depExcluirEtiqueta">Excluir de la base depurada los casos con</span>
        <div id="depExcluir" role="group" aria-labelledby="depExcluirEtiqueta" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(15rem, 1fr)); gap:0.15rem 1rem;">
            ${ORDEN_MOTIVOS.filter(m => m !== 'fueraDeRango').map(m => `<label style="cursor:pointer;"><input type="checkbox" value="${m}"${EXCLUIR_POR_DEFECTO.includes(m) ? ' checked' : ''} style="margin-right:0.4rem;">${escaparHTML(NOMBRE_MOTIVO[m])}</label>`).join('')}
        </div>
        <span class="help-text">Por defecto, solo los duplicados (si con las columnas de tu base no se esperan coincidencias por azar) y los casos con más del 20 % en blanco. La misma respuesta en todo es descuido si la escala tiene ítems inversos (sin invertir); con ítems todos directos, puede ser real. Excluir atípicos cambia los resultados: decídelo antes de analizar y repórtalo (Leys et al., 2019).</span>
    </div>
    <div class="acciones-fila"><button type="button" id="depCalcular" class="btn btn-primary">Revisar la base</button>
        <button type="button" id="depActualizar" class="btn btn-outline" title="Actualizar con la base cargada" aria-label="Actualizar las variables">↻</button></div>
    <div id="depEstado"></div>
    <div id="depMensajes" role="alert"></div>
    <div id="depResultados" hidden></div>`;

/** Rehace los desplegables con la base cargada. */
export function actualizarVariables() {
    if (!contenedor) return;
    const filas = datos(), sel = q('#depConjunto'), previo = sel.value;
    if (!filas.length) { sel.innerHTML = '<option value="">Carga una base primero</option>'; q('#depId').innerHTML = '<option value="">Ninguno</option>'; return; }
    conjuntos = conjuntosDe(filas);
    sel.innerHTML = opcionesHTML(conjuntos);
    if ([...sel.options].some((/** @type {HTMLOptionElement} */ o) => o.value === previo)) sel.value = previo;
    q('#depItems').hidden = sel.value !== 'propia';
    const idSel = q('#depId'), previoId = idSel.value, columnas = Object.keys(/** @type {Record<string, unknown>} */ (filas[0]));
    idSel.innerHTML = '<option value="">Ninguno</option>' + columnas.map(c => `<option value="${escaparHTML(c)}">${escaparHTML(etiqueta(c))}</option>`).join('');
    idSel.value = columnas.includes(previoId) ? previoId : columnas.find(c => /^id$/i.test(c)) || '';
    ayudaRango();
}

/** Las variables elegidas (lanza si la lista propia nombra columnas que no están). @returns {{ items: string[], descripcion: string } | null} */
function variablesElegidas() { return variablesDe(q('#depConjunto').value, q('#depItems').value, datos(), conjuntos); }

/** La ayuda del rango: los valores mínimo y máximo observados en las variables elegidas. */
function ayudaRango() {
    if (!contenedor) return;
    let texto = 'En blanco, no se revisa el rango.';
    try {
        const elegidas = variablesElegidas(), filas = datos();
        if (elegidas && elegidas.items.length) {
            let min = Infinity, max = -Infinity;
            for (const f of filas) for (const c of elegidas.items) { const x = aNumero(f[c]); if (Number.isFinite(x)) { if (x < min) min = x; if (x > max) max = x; } }
            if (Number.isFinite(min)) texto = `Valores observados: de ${min} a ${max}. En blanco, no se revisa el rango.`;
        }
    } catch (e) { /* lista propia a medio escribir */ }
    q('#depRangoAyuda').textContent = texto;
}

/** Un número de un campo, o null si está vacío. @param {string} id */
function numeroDe(id) { const t = String(q(id).value).trim(); return t === '' ? null : aNumero(t); }

/** Revisa la base y muestra los resultados. @returns {ResultadoDepuracion | null} */
export function calcular() {
    if (!contenedor) return null;
    const msj = q('#depMensajes'), zona = q('#depResultados'), filas = datos();
    const error = (/** @type {string} */ t) => { msj.innerHTML = `<div class="aiken-errores"><strong>No se puede revisar:</strong> ${escaparHTML(t)}</div>`; zona.hidden = true; ultimo = null; return null; };
    if (!filas.length) return error('No hay una base cargada en el Analizador.');
    /** @type {{ items: string[], descripcion: string } | null} */ let elegidas;
    try { elegidas = variablesElegidas(); } catch (e) { return error(/** @type {Error} */ (e).message); }
    if (!elegidas || !elegidas.items.length) return error('Elige las variables a revisar.');
    const minimo = numeroDe('#depMinimo'), maximo = numeroDe('#depMaximo');
    if ((minimo === null) !== (maximo === null)) return error('Indica el mínimo y el máximo de la escala de respuesta (o deja los dos en blanco).');
    if (minimo !== null && maximo !== null && !(Number.isFinite(minimo) && Number.isFinite(maximo) && minimo < maximo)) return error('El mínimo de la escala de respuesta debe ser un número menor que el máximo.');
    const id = q('#depId').value || null;
    const R = revisarCasos(filas, { items: elegidas.items, id, minimo, maximo, enteros: !!q('#depEnteros').checked });
    // con coincidencias por azar esperables, los duplicados no se excluyen por defecto (si quien analiza no eligió otra cosa)
    const casillaDuplicados = /** @type {HTMLInputElement | null} */ (q('#depExcluir input[value="duplicado"]'));
    if (casillaDuplicados && R.duplicados.porAzar && R.resumen.duplicado && casillaDuplicados.checked && !duplicadosElegidos) casillaDuplicados.checked = false;
    const excluir = /** @type {Motivo[]} */ ([...contenedor.querySelectorAll('#depExcluir input:checked')].map(e => /** @type {HTMLInputElement} */ (e).value));
    /** @type {ContextoDepuracion} */
    const ctx = { variables: elegidas.descripcion, k: elegidas.items.length, minimo, maximo, enteros: !!q('#depEnteros').checked, id: id ? etiqueta(id) : null, excluir,
        fueraDeRango: /** @type {'perdido' | 'excluir' | 'nada'} */ (minimo === null ? 'nada' : q('#depFuera').value), umbrales: { ...UMBRALES },
        salvo: [...(id ? [etiqueta(id)] : []), ...R.duplicados.delEnvio.map(etiqueta)] };
    ultimo = { R, ctx, items: elegidas.items, filas };
    /** @type {string[]} */ const avisos = [];
    if (R.fueraDeEscala.length) avisos.push(`${R.fueraDeEscala.join(', ')}: más de la mitad de sus valores está fuera de ${minimo}–${maximo}, así que no ${R.fueraDeEscala.length === 1 ? 'usa' : 'usan'} esa escala (¿un puntaje total, la edad?) y no se ${R.fueraDeEscala.length === 1 ? 'revisó' : 'revisaron'} en el rango. Para revisarlas, elige solo los ítems.`);
    if (R.duplicados.porAzar && R.resumen.duplicado) {
        const e = R.duplicados.esperables, cuantas = e >= 10 ? String(Math.round(e)) : e.toFixed(e < 1 ? 2 : 1);
        avisos.push(`Hay ${R.resumen.duplicado} fila(s) idéntica(s) a otra, pero con tan pocas columnas, y de pocas opciones, dos personas distintas pueden responder igual: por azar se esperaban unas ${cuantas} coincidencias (y más con ítems correlacionados). ${ctx.excluir.includes('duplicado') ? 'Se excluyen porque marcaste «Caso duplicado».' : 'Por eso no se excluyen: márcalo en «Excluir…» solo si sabes que hay filas repetidas (un formulario enviado dos veces).'}`);
    }
    msj.innerHTML = avisos.map(t => `<div class="aiken-avisos">${escaparHTML(t)}</div>`).join('');
    const tabla = (/** @type {{ titulo: string, cabecera: string[], filas: string[][], nota: string }} */ t, /** @type {boolean} */ larga) => `<h5 class="aiken-subtitulo">${escaparHTML(t.titulo)}</h5><div class="table-container"${larga ? ' style="max-height:24rem; overflow:auto;"' : ''}><table class="table"><thead><tr>${t.cabecera.map(h => `<th>${escaparHTML(h)}</th>`).join('')}</tr></thead><tbody>${t.filas.map(f => `<tr>${f.map(c => `<td>${escaparHTML(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="help-text"><em>Nota.</em> ${escaparHTML(t.nota)}</p>`;
    const fuera = filasExcluidas(R, ctx);
    zona.innerHTML = `<h4 class="aiken-subtitulo aiken-titulo">Resultados: depuración de ${escaparHTML(elegidas.descripcion)}</h4>
        <p style="margin:0.2rem 0 0.4rem;"><b>${R.casos.length ? `${R.casos.length} caso(s) con alguna señal; ${fuera.size} saldrían de la base depurada (N = ${R.n - fuera.size} de ${R.n}).` : `Ningún caso con señales: la base está lista (N = ${R.n}).`}</b></p>
        ${tabla(tablaResumen(R, ctx), false)}
        ${R.casos.length ? tabla(tablaCasos(R, ctx), true) : ''}
        <h5 class="aiken-subtitulo">Redacción para la tesis (APA 7)</h5><p class="aiken-parrafo" id="depParrafo">${escaparHTML(redactarDepuracion(R, ctx))}</p>
        <details class="aiken-referencias"><summary>Referencias citadas</summary>${referenciasDepuracion(R, ctx).map(x => `<p>${x}</p>`).join('')}</details>
        ${bloqueSintaxis(sintaxisDepuracion({ items: elegidas.items, minimo, maximo, enteros: ctx.enteros, id, umbrales: ctx.umbrales, duplicados: R.duplicados.columnas }))}
        <div class="acciones-fila">${R.casos.length ? '<button type="button" id="depCSVCasos" class="btn btn-outline">Descargar los casos marcados (CSV)</button>' : ''}
            <button type="button" id="depCSVBase" class="btn btn-outline">Descargar la base depurada (CSV)</button>
            <button type="button" id="depAplicar" class="btn btn-outline"${fuera.size || (ctx.fueraDeRango === 'perdido' && R.resumen.fueraDeRango) ? '' : ' disabled'}>Usar la base depurada en el Analizador</button>
            <button type="button" id="depWord" class="btn btn-primary">Descargar Word (APA 7)</button></div>`;
    zona.hidden = false;
    if (R.casos.length) q('#depCSVCasos').addEventListener('click', () => descargarArchivo('﻿' + csvCasos(R, ctx), 'casos_marcados.csv', 'text/csv'));
    q('#depCSVBase').addEventListener('click', () => descargarArchivo('﻿' + csvBase(baseDepurada(filas, elegidas.items, R, ctx)), 'base_depurada.csv', 'text/csv'));
    q('#depAplicar').addEventListener('click', aplicarDepuracion);
    q('#depWord').addEventListener('click', () => { void exportarWord(); });
    return R;
}

/** Pone la base depurada en el Analizador (guardando la original para volver a ella). */
export function aplicarDepuracion() {
    if (!ultimo) return false;
    const { R, ctx, items, filas } = ultimo, depuradas = baseDepurada(filas, items, R, ctx);
    if (!depuradas.length) { mostrarToast('La base depurada quedaría sin casos.', 'error'); return false; }
    const previa = original || filas;
    aplicando = true;
    try { reemplazarFilas(depuradas); } finally { aplicando = false; }
    original = previa;
    ultimo = null;
    q('#depResultados').hidden = true; q('#depResultados').innerHTML = '';
    mostrarEstado(`Base depurada en uso: N = ${depuradas.length} de ${previa.length} (${previa.length - depuradas.length} caso(s) fuera${ctx.fueraDeRango === 'perdido' && R.resumen.fueraDeRango ? '; los valores fuera de rango, como perdidos' : ''}). Los análisis usan ahora esta base.`);
    mostrarToast(`Base depurada en el Analizador: ${depuradas.length} casos.`, 'success', 5000);
    return true;
}

/** Vuelve a la base que había antes de depurar. */
export function restaurarOriginal() {
    if (!original) return false;
    const filas = original;
    aplicando = true;
    try { reemplazarFilas(filas); } finally { aplicando = false; }
    original = null;
    mostrarEstado('');
    mostrarToast(`Base original restaurada: ${filas.length} casos.`, 'success', 5000);
    return true;
}

/** El aviso de que la base en uso es la depurada (con su botón para volver). @param {string} texto */
function mostrarEstado(texto) {
    const caja = q('#depEstado');
    caja.innerHTML = texto ? `<div class="aiken-avisos">${escaparHTML(texto)} <button type="button" id="depRestaurar" class="btn btn-outline" style="margin-left:0.5rem;">Restaurar la base original</button></div>` : '';
    if (texto) q('#depRestaurar').addEventListener('click', restaurarOriginal);
}

/** El Word de la última revisión. */
export async function exportarWord() {
    if (!ultimo) return null;
    return descargarWord(documentoWordDepuracion(ultimo.R, ultimo.ctx), 'depuracion_APA', 'Depuración exportada a Word (APA 7)');
}

/** Con otros datos, la revisión anterior ya no vale (y, si la base nueva no es la nuestra, tampoco la original guardada). */
export function olvidarDepuracion() {
    ultimo = null;
    if (!aplicando) { original = null; if (contenedor) mostrarEstado(''); }
    if (!contenedor) return;
    q('#depResultados').hidden = true; q('#depResultados').innerHTML = ''; q('#depMensajes').innerHTML = '';
}

/** Monta la tarjeta en #depuracionContainer (una vez). */
export function montarDepuracion() {
    contenedor = typeof document !== 'undefined' ? document.getElementById('depuracionContainer') : null;
    if (!contenedor || contenedor.dataset.montado === '1') return;
    contenedor.dataset.montado = '1';
    bus.on(EVENTOS.DATOS_CARGADOS, () => { if (!aplicando) duplicadosElegidos = false; olvidarDepuracion(); actualizarVariables(); });
    contenedor.innerHTML = PLANTILLA();
    q('#depConjunto').addEventListener('change', () => { q('#depItems').hidden = q('#depConjunto').value !== 'propia'; ayudaRango(); });
    q('#depItems').addEventListener('change', ayudaRango);
    q('#depActualizar').addEventListener('click', actualizarVariables);
    q('#depCalcular').addEventListener('click', () => { calcular(); });
    // cambiar un criterio con una revisión a la vista la rehace: lo mostrado y lo que se aplica, siempre con las casillas actuales
    const rehacer = () => { if (ultimo) calcular(); };
    for (const sel of ['#depFuera', '#depMinimo', '#depMaximo', '#depEnteros', '#depId', '#depConjunto', '#depItems']) q(sel).addEventListener('change', rehacer);
    contenedor.querySelectorAll('#depExcluir input').forEach(e => e.addEventListener('change', () => { if (/** @type {HTMLInputElement} */ (e).value === 'duplicado') duplicadosElegidos = true; rehacer(); }));
    actualizarVariables();
}

/** El último resultado (y si hay una base original guardada). */
export function resultadoDepuracion() { return ultimo ? { ...ultimo, hayOriginal: !!original } : null; }
/** ¿La base en uso es una depurada? */
export function hayBaseOriginal() { return !!original; }
