// @ts-check
// analizador/relaciones/mediacion-ui.js — (2027.01.17) la tarjeta «10. Mediación y moderación (PROCESS)» del Analizador: el
// modelo (1, 4, 6, 7 o 14 de Hayes), las variables, las covariables y el bootstrap; calcula en el Worker de la psicometría
// (con progreso y cancelación) y muestra las ecuaciones, los efectos, el diagrama de rutas, las pendientes simples, la
// redacción APA y el Word. La zona de resultados (#medResultados) es la que se imprime.
import { AnalizadorEstadistico } from '../estadistica.js';
import { EtiquetasVariables } from '../../shared/etiquetas-variables.js';
import { bus, EVENTOS } from '../../shared/eventos.js';
import { escaparHTML } from '../../shared/html.js';
import { aNumero } from '../../core/data/celdas.js';
import { media, desviacion } from '../../core/stats/descriptivos.js';
import { rasterizarSVG } from '../../shared/rasterizar.js';
import { ANCHO_FIGURA } from '../graficos-en-papel.js';
import { ejecutarTarea as ejecutarSinTipos } from '../psicometria/servicio-psicometrico.js';

/** La puerta a las tareas del Worker (servicio-psicometrico.js, sin @ts-check), con sus tipos. */
const ejecutarTarea = /** @type {(tipo: string, grupos: object[], opciones: object, alProgreso: (hecho: number, total: number) => void) => { promesa: Promise<any>, cancelar: () => void }} */ (/** @type {unknown} */ (ejecutarSinTipos));
import { columnasCuantitativas } from '../motor/columnas.js';
import { MODELOS } from './mediacion.js';
import { tablasEcuaciones, tablaEfectos, redactarMediacion, referenciasMediacion, documentoWordMediacion } from './mediacion-redaccion.js';
import { diagramaRutas, graficoPendientes } from './mediacion-graficos.js';
import { descargarWord } from '../informe/word-apa.js';
import { sintaxisMediacion, bloqueSintaxis } from '../informe/sintaxis.js';

/** @typedef {import('./mediacion-redaccion.js').ContextoMediacion} ContextoMediacion */
/** @type {HTMLElement | null} */ let contenedor = null;
/** @type {{ R: any, ctx: ContextoMediacion, pedido: import('./mediacion.js').PedidoProceso } | null} */ let ultimo = null;
/** @type {{ promesa: Promise<any>, cancelar: () => void } | null} */ let tarea = null;

const MAX_MEDIADORES_UI = 4;
const guia = (/** @type {string} */ t) => `<div class="orden-guia" role="note" style="margin:0 0 0.6rem;"><span class="orden-guia-titulo">Para qué sirve:</span><span class="orden-nota">${t}</span></div>`;
/** @returns {Record<string, unknown>[]} */
function datos() { try { return /** @type {Record<string, unknown>[]} */ (AnalizadorEstadistico.obtenerDatos() || []); } catch (e) { return []; } }
const etiqueta = (/** @type {string} */ c) => { try { return EtiquetasVariables.etiqueta(c); } catch (e) { return c; } };
/** @param {string} sel @returns {any} */
const q = sel => /** @type {HTMLElement} */ (contenedor).querySelector(sel);

const PLANTILLA = () => `
    <h3 class="card-title">10. Mediación y moderación (PROCESS) <span class="help-text" style="display:inline;">— opcional</span></h3>
    <p class="help-text">¿Por qué X influye en Y (a través de qué mediadores)? ¿Cuándo o para quiénes (según qué moderador)? Los modelos de PROCESS
        de Hayes (2022) por regresión: la moderación (1), la mediación simple o en paralelo (4), en serie (6) y la mediación moderada (7 y 14), con
        los efectos indirectos por bootstrap.</p>
    <div class="rejilla-psico">
        <div class="form-group">
            ${guia('Qué pregunta responde el análisis: moderación (cuándo influye X), mediación (por qué influye) o las dos a la vez.')}
            <label for="medModelo">Modelo</label>
            <select id="medModelo" class="input">${Object.entries(MODELOS).map(([k, m]) => `<option value="${k}"${k === '4' ? ' selected' : ''}>${escaparHTML(m.nombre)}</option>`).join('')}</select>
            <span class="help-text" id="medDescripcion"></span>
        </div>
        <div class="form-group">
            ${guia('X es la variable que influye (el predictor); Y, la que recibe la influencia (el resultado).')}
            <label for="medX">X (predictor)</label><select id="medX" class="input"></select>
            <label for="medY" style="margin-top:0.5rem;">Y (resultado)</label><select id="medY" class="input"></select>
            <span class="help-text">Variables cuantitativas (una X dicotómica 0/1 también sirve).</span>
        </div>
        <div class="form-group" id="medGrupoM">
            ${guia('Los mediadores: las variables por las que pasa el efecto de X sobre Y. En serie, en el orden de la cadena (M1 → M2 → M3).')}
            ${Array.from({ length: MAX_MEDIADORES_UI }, (_, j) => `<label for="medM${j + 1}" style="${j ? 'margin-top:0.4rem;' : ''}">Mediador ${j + 1}</label><select id="medM${j + 1}" class="input" data-mediador="${j}"></select>`).join('')}
            <span class="help-text" id="medAyudaM"></span>
        </div>
        <div class="form-group" id="medGrupoW">
            ${guia('El moderador: la variable de la que depende la fuerza (o el signo) del efecto.')}
            <label for="medW">W (moderador)</label><select id="medW" class="input"></select>
            <label style="display:block; margin-top:0.5rem; font-weight:normal;"><input type="checkbox" id="medCentrar" checked style="margin-right:0.4rem;">Centrar las variables del producto en su media (recomendado)</label>
            <span class="help-text">Los efectos condicionales se calculan en sus valores 16, 50 y 84 (percentiles) o, si es dicotómica, en sus dos valores.</span>
        </div>
        <div class="form-group">
            ${guia('Variables que se controlan en todas las ecuaciones (la edad, el sexo codificado 0/1…).')}
            <span class="label" id="medCovEtiqueta">Covariables (opcional)</span>
            <div id="medCovariables" role="group" aria-labelledby="medCovEtiqueta" style="max-height:8rem; overflow:auto; border:1px solid var(--border-soft); border-radius:0.4rem; padding:0.4rem 0.6rem;"></div>
        </div>
        <div class="form-group" id="medGrupoB">
            ${guia('El bootstrap da el intervalo de los efectos indirectos sin suponer que son normales: más remuestras, más precisión.')}
            <label for="medB">Remuestras bootstrap</label>
            <select id="medB" class="input"><option value="1000">1 000 (rápido)</option><option value="5000" selected>5 000 (PROCESS, recomendado)</option><option value="10000">10 000</option></select>
            <label for="medSemilla" style="margin-top:0.5rem;">Semilla</label><input type="number" id="medSemilla" class="input" value="2027" min="1" step="1">
            <span class="help-text">Con la misma semilla, los mismos intervalos: anótala en el informe.</span>
        </div>
    </div>
    <div class="acciones-fila"><button type="button" id="medCalcular" class="btn btn-primary">Estimar el modelo</button>
        <button type="button" id="medCancelar" class="btn btn-outline" hidden>Cancelar</button>
        <button type="button" id="medActualizar" class="btn btn-outline" title="Actualizar con la base cargada" aria-label="Actualizar las variables">↻</button></div>
    <div id="medProgresoFila" class="boot-progreso" hidden><progress id="medProgreso" max="100" value="0" aria-label="Progreso del bootstrap"></progress> <span id="medEstado" class="help-text" aria-live="polite"></span></div>
    <div id="medMensajes" role="alert"></div>
    <div id="medResultados" hidden></div>`;

const DESCRIPCION = Object.freeze({
    1: '¿Depende el efecto de X sobre Y de W? Y = b₀ + b₁X + b₂W + b₃XW.',
    4: '¿Pasa el efecto de X sobre Y por uno o más mediadores (en paralelo)? Hasta 4 mediadores.',
    6: '¿Pasa el efecto por una cadena de mediadores (X → M1 → M2 → Y)? 2 o 3 mediadores, en orden.',
    7: '¿Depende de W el camino de X al mediador (primera etapa)? Un mediador.',
    14: '¿Depende de W el camino del mediador a Y (segunda etapa)? Un mediador.'
});

/** Muestra u oculta los campos que usa cada modelo. */
function ajustarAlModelo() {
    const modelo = /** @type {1 | 4 | 6 | 7 | 14} */ (Number(q('#medModelo').value)), def = MODELOS[modelo];
    q('#medDescripcion').textContent = DESCRIPCION[modelo];
    q('#medGrupoM').hidden = def.mediadores[1] === 0;
    for (let j = 0; j < MAX_MEDIADORES_UI; j++) {
        const visible = j < Math.min(def.mediadores[1], MAX_MEDIADORES_UI);
        q(`#medM${j + 1}`).hidden = !visible; q(`label[for="medM${j + 1}"]`).hidden = !visible;
    }
    q('#medAyudaM').textContent = modelo === 4 ? 'De 1 a 4 mediadores en paralelo; deja en «—» los que no uses.' : modelo === 6 ? 'De 2 a 3 mediadores, en el orden de la cadena.' : 'Un mediador.';
    q('#medGrupoW').hidden = !def.moderador;
    q('#medGrupoB').hidden = modelo === 1;
}

/** Rehace los desplegables con la base cargada. */
export function actualizarVariables() {
    if (!contenedor) return;
    const cols = columnasCuantitativas(datos()).filter(c => c !== 'ID');
    const opcion = (/** @type {string} */ c) => `<option value="${escaparHTML(c)}">${escaparHTML(EtiquetasVariables.etiquetaConColumna ? EtiquetasVariables.etiquetaConColumna(c) : c)}</option>`;
    const llenar = (/** @type {string} */ id, /** @type {boolean} */ conVacio) => {
        const sel = q(id), previo = sel.value;
        sel.innerHTML = (conVacio ? '<option value="">—</option>' : '') + (cols.length ? cols.map(opcion).join('') : (conVacio ? '' : '<option value="">Carga una base primero</option>'));
        if ([...sel.options].some(o => o.value === previo)) sel.value = previo;
    };
    llenar('#medX', false); llenar('#medY', false); llenar('#medW', false);
    for (let j = 0; j < MAX_MEDIADORES_UI; j++) llenar(`#medM${j + 1}`, true);
    if (cols.length > 1 && q('#medX').value === q('#medY').value) q('#medY').value = cols[cols.length - 1];
    const marcadas = new Set([...document.querySelectorAll('#medCovariables input:checked')].map(x => /** @type {HTMLInputElement} */ (x).value));
    q('#medCovariables').innerHTML = cols.length ? cols.map(c => `<label style="display:block;margin:0.15rem 0;cursor:pointer;"><input type="checkbox" value="${escaparHTML(c)}"${marcadas.has(c) ? ' checked' : ''} style="margin-right:0.4rem;">${escaparHTML(etiqueta(c))}</label>`).join('') : '<span class="help-text">Carga una base para ver las variables.</span>';
}

/** @param {string[]} errores @param {string[]} avisos */
function mensajes(errores, avisos) {
    q('#medMensajes').innerHTML = (errores.length ? `<div class="aiken-errores"><strong>No se puede estimar:</strong> ${errores.map(escaparHTML).join(' ')}</div>` : '') + (avisos.length ? `<div class="aiken-avisos">${avisos.map(escaparHTML).join('<br>')}</div>` : '');
}

/** Lo elegido en la tarjeta, validado. @returns {{ errores: string[], modelo: 1 | 4 | 6 | 7 | 14, x: string, y: string, m: string[], w: string | null, cov: string[] }} */
function eleccion() {
    const modelo = /** @type {1 | 4 | 6 | 7 | 14} */ (Number(q('#medModelo').value)), def = MODELOS[modelo];
    const x = q('#medX').value, y = q('#medY').value, w = def.moderador ? q('#medW').value : null;
    const m = Array.from({ length: Math.min(def.mediadores[1], MAX_MEDIADORES_UI) }, (_, j) => q(`#medM${j + 1}`).value).filter(Boolean);
    const cov = [...document.querySelectorAll('#medCovariables input:checked')].map(e => /** @type {HTMLInputElement} */ (e).value).filter(c => c !== x && c !== y && c !== w && !m.includes(c));
    /** @type {string[]} */ const errores = [];
    if (!x || !y) errores.push('Elige X e Y.');
    else if (x === y) errores.push('X e Y deben ser variables distintas.');
    if (m.length < def.mediadores[0]) errores.push(modelo === 6 ? 'La mediación en serie necesita al menos 2 mediadores.' : 'Elige el mediador.');
    if (new Set(m).size !== m.length) errores.push('Un mediador está repetido.');
    if (m.includes(x) || m.includes(y)) errores.push('Un mediador no puede ser X ni Y.');
    if (def.moderador && (!w || w === x || w === y || m.includes(/** @type {string} */ (w)))) errores.push('Elige un moderador W distinto de X, de Y y de los mediadores.');
    return { errores, modelo, x, y, m, w, cov };
}

/** Estima el modelo elegido (en el Worker) y muestra el resultado. @returns {Promise<any>} */
export function calcular() {
    if (!contenedor) return Promise.resolve(null);
    if (tarea) tarea.cancelar();
    // (2027.01.20, revisión) un error que impide estimar quita también el resultado anterior (y su Word): antes, con pocos
    // casos, seguía a la vista el de otras variables
    const fallo = (/** @type {string[]} */ errores) => { mensajes(errores, []); q('#medResultados').hidden = true; ultimo = null; return Promise.resolve(null); };
    const filas = datos();
    if (!filas.length) return fallo(['No hay una base cargada en el Analizador.']);
    const e = eleccion();
    if (e.errores.length) return fallo(e.errores);
    const columnas = [e.x, e.y, ...e.m, ...(e.w ? [e.w] : []), ...e.cov];
    const completas = filas.map(f => columnas.map(c => aNumero(f[c]))).filter(v => v.every(Number.isFinite));
    const n = completas.length, excluidos = filas.length - n, k = columnas.length;
    if (n < k + 10) return fallo([`Hacen falta al menos ${k + 10} casos con todas las variables (hay ${n}).`]);
    const col = (/** @type {number} */ j) => completas.map(v => /** @type {number} */ (v[j]));
    const pedido = { modelo: e.modelo, x: col(0), y: col(1), m: e.m.map((_, j) => col(2 + j)), w: e.w ? col(2 + e.m.length) : null, covariables: e.cov.map((_, j) => col(2 + e.m.length + (e.w ? 1 : 0) + j)), centrar: !!q('#medCentrar').checked };
    const alfa = AnalizadorEstadistico.alfaEstudio();
    /** @type {ContextoMediacion} */
    const ctx = { x: etiqueta(e.x), y: etiqueta(e.y), m: e.m.map(etiqueta), w: e.w ? etiqueta(e.w) : null, covariables: e.cov.map(etiqueta), excluidos, alfa };
    const B = Number(q('#medB').value) || 5000, semilla = Math.max(1, Math.floor(Number(q('#medSemilla').value) || 2027)), inicio = Date.now();
    q('#medCalcular').disabled = true; q('#medCancelar').hidden = e.modelo === 1; q('#medProgresoFila').hidden = e.modelo === 1; q('#medEstado').textContent = 'Preparando…';
    mensajes([], excluidos ? [`${excluidos} caso(s) con algún perdido se excluyeron (n = ${n}).`] : []);
    const actual = ejecutarTarea('mediacion', [{ clave: 'mediacion', pedido }], { B, semilla }, (h, t) => {
        q('#medProgreso').value = Math.round((100 * h) / t);
        q('#medEstado').textContent = `Bootstrap: ${h.toLocaleString('es')} de ${t.toLocaleString('es')} remuestras · ${((Date.now() - inicio) / 1000).toFixed(0)} s`;
    });
    tarea = actual;
    q('#medCancelar').onclick = () => actual.cancelar();
    const terminar = () => { q('#medCalcular').disabled = false; q('#medCancelar').hidden = true; q('#medProgresoFila').hidden = true; if (tarea === actual) tarea = null; };
    return actual.promesa.then(lista => {
        terminar();
        const R = lista[0].resultado;
        ultimo = { R, ctx, pedido };
        pintar(R, ctx, pedido, sintaxisMediacion({ modelo: e.modelo, x: e.x, y: e.y, m: e.m, w: e.w, covariables: e.cov, B, semilla, centrar: pedido.centrar }));
        return R;
    }).catch(err => {
        terminar();
        mensajes(err && err.cancelado ? [] : [`No se pudo estimar: ${err && err.message ? err.message : err}`], err && err.cancelado ? ['Cálculo cancelado.'] : []);
        if (!(err && err.cancelado)) { q('#medResultados').hidden = true; ultimo = null; }
        return null;
    });
}

/**
 * Las pendientes simples de una moderación, para su gráfico.
 * @param {any} R
 * @param {import('./mediacion.js').PedidoProceso} pedido
 */
function datosPendientes(R, pedido) {
    const e = R.ecuaciones[0], b = (/** @type {string} */ t) => e.beta[e.predictores.indexOf(t)];
    let cov = 0;
    pedido.covariables.forEach((c, j) => { cov += b(`C${j + 1}`) * media(c); });
    return { coef: { b0: b('constante'), b1: b('X'), b2: b('W'), b3: b('X·W'), cov }, escala: { mediaX: media(pedido.x), deX: desviacion(pedido.x), centroX: R.centros.x, centroW: R.centros.w, valoresW: R.valoresW } };
}

/** @param {any} R @param {ContextoMediacion} ctx @param {import('./mediacion.js').PedidoProceso} pedido @param {import('../informe/sintaxis.js').Sintaxis} sintaxis */
function pintar(R, ctx, pedido, sintaxis) {
    const tabla = (/** @type {import('./mediacion-redaccion.js').Tabla} */ t) => `<h5 class="aiken-subtitulo">${escaparHTML(t.titulo)}</h5><div class="table-container"><table class="table"><thead><tr>${t.cabecera.map(h => `<th>${escaparHTML(h)}</th>`).join('')}</tr></thead><tbody>${t.filas.map(f => `<tr>${f.map(c => `<td>${escaparHTML(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="help-text"><em>Nota.</em> ${escaparHTML(t.nota)}</p>`;
    const nombres = { x: ctx.x, y: ctx.y, m: ctx.m, w: ctx.w };
    const diagrama = diagramaRutas(R, nombres, { alfa: ctx.alfa }).svg;
    let pendientes = '';
    if (R.modelo === 1) { const d = datosPendientes(R, pedido); pendientes = `<h5 class="aiken-subtitulo">Pendientes simples</h5><div style="max-width:640px;">${graficoPendientes(d.coef, d.escala, { x: ctx.x, y: ctx.y, w: /** @type {string} */ (ctx.w) }).svg}</div>`; }
    const zona = q('#medResultados');
    zona.innerHTML = `<h4 class="aiken-subtitulo aiken-titulo">Resultados: ${escaparHTML(MODELOS[/** @type {1} */ (R.modelo)].nombre)}</h4>
        ${tablasEcuaciones(R, ctx).map(tabla).join('')}${tabla(tablaEfectos(R, ctx))}
        <h5 class="aiken-subtitulo">Diagrama de rutas</h5><div style="max-width:640px;">${diagrama}</div>${pendientes}
        <h5 class="aiken-subtitulo">Redacción para la tesis (APA 7)</h5><p class="aiken-parrafo" id="medParrafo">${escaparHTML(redactarMediacion(R, ctx))}</p>
        <details class="aiken-referencias"><summary>Referencias citadas</summary>${referenciasMediacion(R).map(x => `<p>${x}</p>`).join('')}</details>
        ${bloqueSintaxis(sintaxis)}
        <div class="acciones-fila"><button type="button" id="medWord" class="btn btn-primary">Descargar Word (APA 7)</button></div>`;
    zona.hidden = false;
    q('#medWord').addEventListener('click', () => { void exportarWord(); });
}

/** El Word del último modelo, con sus figuras en PNG (en los colores del papel). */
export async function exportarWord() {
    if (!ultimo) return null;
    const { R, ctx, pedido } = ultimo;
    const png = async (/** @type {{ svg: string, ancho: number, alto: number }} */ g) => rasterizarSVG(g.svg, ANCHO_FIGURA, Math.round(ANCHO_FIGURA * g.alto / g.ancho));
    const diagrama = await png(diagramaRutas(R, { x: ctx.x, y: ctx.y, m: ctx.m, w: ctx.w }, { alfa: ctx.alfa, papel: true }));
    let pendientes = null;
    if (R.modelo === 1) { const d = datosPendientes(R, pedido); pendientes = await png(graficoPendientes(d.coef, d.escala, { x: ctx.x, y: ctx.y, w: /** @type {string} */ (ctx.w) }, { papel: true })); }
    return descargarWord(documentoWordMediacion(R, ctx, { diagrama, pendientes }), R.modelo === 1 ? 'moderacion_APA' : 'mediacion_APA', 'Mediación y moderación exportadas a Word (APA 7)');
}

/** Con otros datos, el resultado anterior ya no vale (y un cálculo en curso se descarta). */
export function olvidarMediacion() {
    if (tarea) tarea.cancelar();
    ultimo = null;
    if (!contenedor) return;
    q('#medResultados').hidden = true; q('#medResultados').innerHTML = ''; q('#medMensajes').innerHTML = '';
}

/** Monta la tarjeta en #mediacionContainer (una vez). */
export function montarMediacion() {
    contenedor = typeof document !== 'undefined' ? document.getElementById('mediacionContainer') : null;
    if (!contenedor || contenedor.dataset.montado === '1') return;
    contenedor.dataset.montado = '1';
    bus.on(EVENTOS.DATOS_CARGADOS, () => { olvidarMediacion(); actualizarVariables(); });
    contenedor.innerHTML = PLANTILLA();
    q('#medModelo').addEventListener('change', ajustarAlModelo);
    q('#medActualizar').addEventListener('click', actualizarVariables);
    q('#medCalcular').addEventListener('click', () => { void calcular(); });
    ajustarAlModelo();
    actualizarVariables();
}

/** El último resultado. */
export function resultadoMediacion() { return ultimo; }
