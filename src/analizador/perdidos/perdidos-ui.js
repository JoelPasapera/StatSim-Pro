// @ts-check
// analizador/perdidos/perdidos-ui.js — (2027.01.18) la tarjeta «Antes de analizar: datos perdidos» del Analizador: elige
// las variables (una escala detectada, todas las numéricas o una lista propia) y muestra cuántos valores faltan y dónde, sus
// patrones, la prueba MCAR de Little, las estimaciones del EM y la recomendación; con la imputación múltiple (en un Worker,
// con progreso y cancelación), las medias y correlaciones combinadas por las reglas de Rubin y las bases imputadas apiladas
// (CSV y .sav, con la variable Imputation_ que SPSS reconoce). La zona de resultados (#perResultados) es la que se imprime.
import { AnalizadorEstadistico } from '../estadistica.js';
import { EtiquetasVariables } from '../../shared/etiquetas-variables.js';
import { bus, EVENTOS } from '../../shared/eventos.js';
import { escaparHTML } from '../../shared/html.js';
import { descargarArchivo, descargarBlob } from '../../shared/descargas.js';
import { aNumero } from '../../core/data/celdas.js';
import { media, desviacion } from '../../core/stats/descriptivos.js';
import { patronesPerdidos, emNormal, pruebaMcarLittle } from '../../core/stats/perdidos.js';
import { mediaCombinada, correlacionCombinada } from '../../core/stats/imputacion.js';
import { escribirSav } from '../../core/data/sav/escritor.js';
import { conjuntosDe, opcionesHTML, variablesDe } from '../ui/conjuntos-variables.js';
import { imputarRepartido as imputarSinTipos } from '../psicometria/servicio-psicometrico.js';
import { tablaPorVariable, tablaPatrones, recomendacion, redactarPerdidos, redactarImputacion, tablaMediasCombinadas, tablaCorrelacionesCombinadas,
    referenciasPerdidos, basesApiladas, puntajesPasivos, csvApiladas, baseSavApiladas, documentoWordPerdidos, textoLittle, MAX_MATRIZ } from './perdidos-redaccion.js';
import { descargarWord } from '../informe/word-apa.js';
import { sintaxisPerdidos, bloqueSintaxis } from '../informe/sintaxis.js';

/** @typedef {import('./perdidos-redaccion.js').DiagnosticoPerdidos} DiagnosticoPerdidos */
/** @typedef {import('./perdidos-redaccion.js').ContextoPerdidos} ContextoPerdidos */
/** @typedef {import('./perdidos-redaccion.js').ResultadoImputacion} ResultadoImputacion */
// (2027.01.19) las cadenas de la imputación, repartidas entre varios Workers (el mismo resultado que en uno)
const imputarRepartido = /** @type {(X: ArrayLike<number>[], opciones: object, alProgreso: (hecho: number, total: number) => void) => { promesa: Promise<any>, cancelar: () => void }} */ (/** @type {unknown} */ (imputarSinTipos));

/** @type {HTMLElement | null} */ let contenedor = null;
/** @type {ReturnType<typeof conjuntosDe>} */ let conjuntos = { escalas: [], numericas: [] };
/**
 * @type {{ D: DiagnosticoPerdidos, ctx: ContextoPerdidos, columnas: string[], filas: Record<string, unknown>[], X: Float64Array[],
 *   MI: ResultadoImputacion | null, imputaciones: { columnas: Float64Array[] }[] | null } | null}
 */
let ultimo = null;
/** @type {{ cancelar: () => void } | null} */ let tarea = null;

const guia = (/** @type {string} */ t) => `<div class="orden-guia" role="note" style="margin:0 0 0.6rem;"><span class="orden-guia-titulo">Para qué sirve:</span><span class="orden-nota">${t}</span></div>`;
/** @returns {Record<string, unknown>[]} */
function datos() { try { return /** @type {Record<string, unknown>[]} */ (AnalizadorEstadistico.obtenerDatos() || []); } catch (e) { return []; } }
const etiqueta = (/** @type {string} */ c) => { try { return EtiquetasVariables.etiqueta(c); } catch (e) { return c; } };
/** @param {string} sel @returns {any} */
const q = sel => /** @type {HTMLElement} */ (contenedor).querySelector(sel);

const PLANTILLA = () => `
    <h3 class="card-title">Antes de analizar: datos perdidos <span class="help-text" style="display:inline;">— si a tu base le faltan respuestas</span></h3>
    <p class="help-text">Describe los valores perdidos (cuántos, en qué variables y con qué patrón), contrasta si faltan completamente al azar
        (prueba de Little) y, si hace falta, los imputa: la imputación múltiple, combinada con las reglas de Rubin, es lo recomendado frente a eliminar casos.</p>
    <div class="rejilla-psico">
        <div class="form-group">
            ${guia('Qué variables se examinan: normalmente los ítems de tu instrumento, o las variables que vas a analizar juntas.')}
            <label for="perConjunto">Variables</label>
            <select id="perConjunto" class="input"><option value="">Carga una base primero</option></select>
            <textarea id="perItems" class="input" rows="2" hidden aria-label="Variables separadas por comas" placeholder="Ej: P1, P2, P3, P4"></textarea>
            <span class="help-text">Variables numéricas; las que no tienen al menos dos valores observados distintos se dejan fuera.</span>
        </div>
        <div class="form-group">
            ${guia('Cómo se rellenan los perdidos en cada imputación.')}
            <label for="perMetodo">Método de imputación</label>
            <select id="perMetodo" class="input"><option value="pmm">Emparejamiento predictivo de medias, PMM (recomendado)</option><option value="norm">Regresión normal bayesiana (norm)</option></select>
            <span class="help-text">PMM imputa valores que sí se observaron (enteros en un ítem Likert); norm, valores continuos (para puntuaciones, cuando faltan muchos en un extremo).</span>
        </div>
        <div class="form-group">
            ${guia('Cuántas bases completas se generan: más imputaciones, resultados más estables.')}
            <label for="perM">Imputaciones</label>
            <select id="perM" class="input"><option value="5">5</option><option value="10">10</option><option value="20" selected>20 (recomendado)</option><option value="50">50 (si faltan muchos)</option></select>
            <span class="help-text">Una regla útil: al menos tantas como el porcentaje de casos incompletos (White et al., 2011).</span>
        </div>
        <div class="form-group">
            ${guia('El punto de partida de los sorteos: con la misma semilla, las mismas imputaciones.')}
            <label for="perSemilla">Semilla</label>
            <input id="perSemilla" class="input" type="number" min="1" step="1" value="2027">
            <span class="help-text">Anótala en el método para que se pueda reproducir.</span>
        </div>
    </div>
    <div class="acciones-fila"><button type="button" id="perCalcular" class="btn btn-primary">Examinar los perdidos</button>
        <button type="button" id="perActualizar" class="btn btn-outline" title="Actualizar con la base cargada" aria-label="Actualizar las variables">↻</button></div>
    <div id="perMensajes" role="alert"></div>
    <div id="perResultados" hidden></div>`;

/** Rehace el desplegable con la base cargada. */
export function actualizarVariables() {
    if (!contenedor) return;
    const filas = datos(), sel = q('#perConjunto'), previo = sel.value;
    if (!filas.length) { sel.innerHTML = '<option value="">Carga una base primero</option>'; return; }
    conjuntos = conjuntosDe(filas);
    sel.innerHTML = opcionesHTML(conjuntos);
    if ([...sel.options].some((/** @type {HTMLOptionElement} */ o) => o.value === previo)) sel.value = previo;
    q('#perItems').hidden = sel.value !== 'propia';
}

/** @param {string} t @param {string} [clase] */
const aviso = (t, clase = 'aiken-avisos') => `<div class="${clase}">${escaparHTML(t)}</div>`;

/** Examina los perdidos y muestra el diagnóstico. @returns {DiagnosticoPerdidos | null} */
export function calcular() {
    if (!contenedor) return null;
    if (tarea) { tarea.cancelar(); tarea = null; }
    const msj = q('#perMensajes'), zona = q('#perResultados'), filas = datos();
    const error = (/** @type {string} */ t) => { msj.innerHTML = `<div class="aiken-errores"><strong>No se puede examinar:</strong> ${escaparHTML(t)}</div>`; zona.hidden = true; ultimo = null; return null; };
    if (!filas.length) return error('No hay una base cargada en el Analizador.');
    /** @type {{ items: string[], descripcion: string } | null} */ let elegidas;
    try { elegidas = variablesDe(q('#perConjunto').value, q('#perItems').value, filas, conjuntos); } catch (e) { return error(/** @type {Error} */ (e).message); }
    if (!elegidas || !elegidas.items.length) return error('Elige las variables.');
    // fuera las que no tienen dos valores observados distintos (no se pueden estimar ni imputar)
    const todas = elegidas.items.map(c => ({ c, v: Float64Array.from(filas, f => aNumero(f[c])) }));
    const fuera = todas.filter(x => new Set(Array.from(x.v).filter(Number.isFinite)).size < 2).map(x => x.c);
    const usadas = todas.filter(x => !fuera.includes(x.c));
    if (!usadas.length) return error('Ninguna de las variables tiene al menos dos valores observados distintos.');
    const X = usadas.map(x => x.v), columnas = usadas.map(x => x.c);
    const P = patronesPerdidos(X);
    const disponibles = X.map(c => { const v = Array.from(c).filter(Number.isFinite); return { n: v.length, media: media(v), de: v.length > 1 ? desviacion(v) : NaN }; });
    const em = P.celdasPerdidas ? emNormal(X) : null;
    const little = em ? pruebaMcarLittle(X, em) : null;
    /** @type {DiagnosticoPerdidos} */
    const D = { variables: columnas.map(etiqueta), P, disponibles, em, little };
    /** @type {ContextoPerdidos} */
    const ctx = { descripcion: elegidas.descripcion, alfa: AnalizadorEstadistico.alfaEstudio() };
    ultimo = { D, ctx, columnas, filas, X, MI: null, imputaciones: null };
    /** @type {string[]} */ const avisos = [];
    if (fuera.length) avisos.push(`Sin al menos dos valores observados distintos, quedan fuera: ${fuera.map(etiqueta).join(', ')}.`);
    if (P.celdasPerdidas && !em) avisos.push('El algoritmo EM no pudo estimar la covarianza (hay variables que son combinación exacta de otras, o muy pocos casos): no hay prueba de Little ni estimaciones EM.');
    if (em && !em.convergio) avisos.push(`El EM no convergió del todo en ${em.iteraciones} iteraciones: sus estimaciones son aproximadas.`);
    if (P.celdasPerdidas && em && !little) avisos.push('Con un solo patrón de pérdida, la prueba de Little no se puede calcular.');
    msj.innerHTML = avisos.map(a => aviso(a)).join('');
    pintar();
    return D;
}

/** La tabla en HTML. @param {{ titulo: string, cabecera: string[], filas: string[][], nota: string }} t @param {boolean} [larga] */
const tabla = (t, larga = false) => `<h5 class="aiken-subtitulo">${escaparHTML(t.titulo)}</h5><div class="table-container"${larga ? ' style="max-height:24rem; overflow:auto;"' : ''}><table class="table"><thead><tr>${t.cabecera.map(h => `<th>${escaparHTML(h)}</th>`).join('')}</tr></thead><tbody>${t.filas.map(f => `<tr>${f.map(c => `<td>${escaparHTML(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="help-text"><em>Nota.</em> ${escaparHTML(t.nota)}</p>`;

/** Pinta el diagnóstico (y la imputación, si ya se hizo). */
function pintar() {
    if (!contenedor || !ultimo) return;
    const { D, ctx, MI, columnas } = ultimo, zona = q('#perResultados'), P = D.P, rec = recomendacion(D, ctx.alfa);
    if (!P.celdasPerdidas) {
        zona.innerHTML = `<h4 class="aiken-subtitulo aiken-titulo">Resultados: datos perdidos de ${escaparHTML(ctx.descripcion)}</h4><p><b>${escaparHTML(rec.texto)}</b></p><p class="aiken-parrafo" id="perParrafo">${escaparHTML(redactarPerdidos(D, ctx))}</p>`;
        zona.hidden = false;
        return;
    }
    const tm = MI ? tablaCorrelacionesCombinadas(MI, D, ctx.alfa) : null;
    zona.innerHTML = `<h4 class="aiken-subtitulo aiken-titulo">Resultados: datos perdidos de ${escaparHTML(ctx.descripcion)}</h4>
        <p style="margin:0.2rem 0 0.4rem;"><b>${escaparHTML(rec.texto)}</b></p>
        ${tabla(tablaPorVariable(D), true)}${tabla(tablaPatrones(D))}
        ${D.little ? `<h5 class="aiken-subtitulo">Prueba MCAR de Little</h5><p>${escaparHTML(textoLittle(D.little, ctx.alfa))}: ${D.little.pValor >= ctx.alfa ? 'no se rechaza que los datos falten completamente al azar (lo que no lo prueba: puede faltar potencia).' : 'los datos no faltan completamente al azar; eliminar los casos incompletos sesgaría los resultados.'}</p>` : ''}
        ${MI ? `${tabla(tablaMediasCombinadas(MI, D), true)}${tm ? tabla(tm, true) : ''}` : ''}
        <h5 class="aiken-subtitulo">Redacción para la tesis (APA 7)</h5><p class="aiken-parrafo" id="perParrafo">${escaparHTML(redactarPerdidos(D, ctx))}${MI ? ` ${escaparHTML(redactarImputacion(MI))}` : ''}</p>
        <details class="aiken-referencias"><summary>Referencias citadas</summary>${referenciasPerdidos(D, MI).map(x => `<p>${x}</p>`).join('')}</details>
        ${bloqueSintaxis(sintaxisPerdidos({ variables: columnas, metodo: MI ? MI.metodo : null, m: MI ? MI.m : 20, iteraciones: MI ? MI.iteraciones : 10, semilla: MI ? MI.semilla : 2027 }))}
        <div id="perProgresoFila" class="boot-progreso" hidden><progress id="perProgreso" max="100" value="0" aria-label="Progreso de la imputación"></progress> <span id="perEstado" class="help-text" aria-live="polite"></span>
            <button type="button" id="perCancelar" class="btn btn-outline">Cancelar</button></div>
        <div class="acciones-fila"><button type="button" id="perImputar" class="btn btn-outline">${MI ? 'Volver a imputar' : 'Imputar (imputación múltiple)'}</button>
            ${MI ? '<button type="button" id="perCSV" class="btn btn-outline">Bases imputadas (CSV)</button><button type="button" id="perSav" class="btn btn-outline">Bases imputadas (SPSS .sav)</button>' : ''}
            <button type="button" id="perWord" class="btn btn-primary">Descargar Word (APA 7)</button></div>
        ${MI ? `<p class="help-text">Las bases van apiladas: Imputation_ = 0 es la original, con sus perdidos, y 1, 2, … cada imputación. En SPSS, «Datos › Segmentar archivo» por Imputation_ da los resultados combinados; en R, mice::as.mids(datos, .imp = "Imputation_").${escaparHTML(textoPasivos(pasivos()))}</p>` : ''}`;
    zona.hidden = false;
    q('#perImputar').addEventListener('click', () => { void imputar(); });
    q('#perWord').addEventListener('click', () => { void exportarWord(); });
    if (MI) {
        q('#perCSV').addEventListener('click', descargarCSV);
        q('#perSav').addEventListener('click', descargarSav);
    }
}

/** Imputa en el Worker y añade los resultados combinados. @returns {Promise<ResultadoImputacion | null>} */
export function imputar() {
    if (!contenedor || !ultimo) return Promise.resolve(null);
    const actualUltimo = ultimo, { X } = actualUltimo;
    const metodo = /** @type {'pmm' | 'norm'} */ (q('#perMetodo').value === 'norm' ? 'norm' : 'pmm');
    const m = Number(q('#perM').value) || 20, semilla = Math.max(1, Math.floor(Number(q('#perSemilla').value) || 2027)), iteraciones = 10, inicio = Date.now();
    q('#perImputar').disabled = true; q('#perProgresoFila').hidden = false; q('#perEstado').textContent = 'Preparando…';
    const actual = imputarRepartido(X, { m, iteraciones, semilla, metodo }, (h, t) => {
        q('#perProgreso').value = Math.round((100 * h) / t);
        q('#perEstado').textContent = `Imputación: ${h} de ${t} iteraciones · ${((Date.now() - inicio) / 1000).toFixed(0)} s`;
    });
    tarea = actual;
    q('#perCancelar').onclick = () => actual.cancelar();
    const terminar = () => { if (tarea === actual) tarea = null; };
    return actual.promesa.then(R => {
        terminar();
        if (ultimo !== actualUltimo) return null;
        const imputaciones = R.imputaciones;
        const k = X.length;
        /** @type {ResultadoImputacion} */
        const MI = { metodo, m: R.m, iteraciones: R.iteraciones, donantes: R.donantes, semilla: R.semilla, imputadas: R.imputadas,
            medias: Array.from({ length: k }, (_, j) => mediaCombinada(imputaciones, j)),
            correlaciones: k <= MAX_MATRIZ ? Array.from({ length: k }, (_, a) => Array.from({ length: k }, (_, b) => (a === b ? null : correlacionCombinada(imputaciones, a, b)))) : null };
        actualUltimo.MI = MI; actualUltimo.imputaciones = imputaciones;
        pintar();
        if (k > MAX_MATRIZ) q('#perMensajes').insertAdjacentHTML('beforeend', aviso(`Con más de ${MAX_MATRIZ} variables, la matriz de correlaciones combinadas no se muestra (no cabe en una tabla legible); las bases imputadas sí la permiten calcular.`));
        return MI;
    }).catch(err => {
        terminar();
        if (ultimo !== actualUltimo) return null;
        q('#perImputar').disabled = false; q('#perProgresoFila').hidden = true;
        q('#perMensajes').insertAdjacentHTML('beforeend', err && err.cancelado ? aviso('Imputación cancelada.') : aviso(`No se pudo imputar: ${err && err.message ? err.message : err}`, 'aiken-errores'));
        return null;
    });
}

/** Los puntajes que se recalculan en cada base imputada (imputación pasiva). */
function pasivos() { return ultimo ? puntajesPasivos(ultimo.filas, ultimo.columnas, conjuntos.escalas) : []; }

/** Lo que se dice de ellos junto a las bases. @param {import('./perdidos-redaccion.js').PuntajePasivo[]} p */
const textoPasivos = p => (p.length ? ` En cada base imputada, ${p.length === 1 ? `el puntaje ${p[0].columna} se recalcula` : `los puntajes ${p.map(x => x.columna).join(', ')} se recalculan`} desde sus ítems imputados (imputación pasiva: ${p.length === 1 ? 'su suma o su media, la misma regla' : 'la misma regla'} que en la base original).` : '');

/** Las bases apiladas de la última imputación. */
function apiladas() {
    if (!ultimo || !ultimo.imputaciones) return null;
    return basesApiladas(ultimo.filas, ultimo.columnas, ultimo.imputaciones, pasivos());
}

/** Descarga las bases imputadas como CSV. */
export function descargarCSV() {
    const B = apiladas();
    if (B) descargarArchivo('﻿' + csvApiladas(B), 'bases_imputadas.csv', 'text/csv');
    return !!B;
}

/** Descarga las bases imputadas como .sav. */
export function descargarSav() {
    const B = apiladas();
    if (!B) return [];
    const { bytes, avisos } = escribirSav(baseSavApiladas(B, etiqueta));
    descargarBlob(new Blob([/** @type {BlobPart} */ (/** @type {unknown} */ (bytes))], { type: 'application/x-spss-sav' }), 'bases_imputadas.sav');
    return avisos;
}

/** El Word del último análisis. */
export async function exportarWord() {
    if (!ultimo) return null;
    return descargarWord(documentoWordPerdidos(ultimo.D, ultimo.ctx, ultimo.MI), 'datos_perdidos_APA', 'Datos perdidos exportados a Word (APA 7)');
}

/** Con otros datos, lo anterior ya no vale (y una imputación en curso se cancela). */
export function olvidarPerdidos() {
    ultimo = null;
    if (tarea) { tarea.cancelar(); tarea = null; }
    if (!contenedor) return;
    q('#perResultados').hidden = true; q('#perResultados').innerHTML = ''; q('#perMensajes').innerHTML = '';
}

/** Monta la tarjeta en #perdidosContainer (una vez). */
export function montarPerdidos() {
    contenedor = typeof document !== 'undefined' ? document.getElementById('perdidosContainer') : null;
    if (!contenedor || contenedor.dataset.montado === '1') return;
    contenedor.dataset.montado = '1';
    bus.on(EVENTOS.DATOS_CARGADOS, () => { olvidarPerdidos(); actualizarVariables(); });
    contenedor.innerHTML = PLANTILLA();
    q('#perConjunto').addEventListener('change', () => { q('#perItems').hidden = q('#perConjunto').value !== 'propia'; });
    q('#perActualizar').addEventListener('click', actualizarVariables);
    q('#perCalcular').addEventListener('click', () => { calcular(); });
    actualizarVariables();
}

/** El último resultado. */
export function resultadoPerdidos() { return ultimo; }
