// @ts-check
// analizador/tri/tri-ui.js — (2027.01.19) la tarjeta «14. Teoría de respuesta al ítem (TRI) y DIF» del Analizador: los
// ítems (una escala detectada o una lista propia), el modelo (automático: GRM con algún ítem de más de dos categorías, 2PL si
// todos son dicotómicos; o Rasch) y, si se quiere, un grupo para el DIF. El ajuste corre en el Worker psicométrico (canal
// «tri»), con progreso y cancelación. Muestra los parámetros, el ajuste, la información del test, el DIF, la redacción APA y
// la sintaxis de R; descarga las puntuaciones (CSV) y el Word, y puede añadir θ y su error típico a la base. La zona de
// resultados (#triResultados) es la que se imprime.
import { AnalizadorEstadistico } from '../estadistica.js';
import { EtiquetasVariables } from '../../shared/etiquetas-variables.js';
import { bus, EVENTOS } from '../../shared/eventos.js';
import { escaparHTML } from '../../shared/html.js';
import { descargarArchivo } from '../../shared/descargas.js';
import { mostrarToast } from '../../shared/toast.js';
import { aNumero, esPerdido } from '../../core/data/celdas.js';
import { prepararRespuestas, informacion } from '../../core/stats/tri.js';
import { MINIMO_GRUPO_DIF } from '../../core/stats/dif.js';
import { conjuntosDe, opcionesHTML, variablesDe } from '../ui/conjuntos-variables.js';
import { candidatosFactorEntre } from '../relacionadas/deteccion.js';
import { ejecutarTarea as ejecutarSinTipos } from '../psicometria/servicio-psicometrico.js';
import { graficoLineas } from '../informe/grafico-lineas.js';
import { rasterizarSVG } from '../../shared/rasterizar.js';
import { ANCHO_FIGURA } from '../graficos-en-papel.js';
import { numeroFijo } from '../../shared/formato-numero.js';
import { reemplazarFilas } from '../ui/carga.js';
import { tablaParametros, tablaAjuste, tablaDIF, redactarTRI, referenciasTRI, csvPuntuaciones, documentoWordTRI, NOMBRE_MODELO } from './tri-redaccion.js';
import { sintaxisTRI, bloqueSintaxis } from '../informe/sintaxis.js';
import { descargarWord } from '../informe/word-apa.js';

/** @typedef {import('./tri-redaccion.js').ResultadoTRI} ResultadoTRI */
/** @typedef {import('./tri-redaccion.js').ResultadoDIF} ResultadoDIF */
/** @typedef {import('./tri-redaccion.js').ContextoTRI} ContextoTRI */
/** @typedef {{ R: ResultadoTRI, D: ResultadoDIF | null, ctx: ContextoTRI, filas: number[], columnas: string[], grupo: string | null, raiz: string }} UltimoTRI
 *   raiz: de qué se nombran las columnas de θ (la escala o, con una lista propia, su primer y su último ítem) */
const ejecutarTarea = /** @type {(tipo: string, grupos: object[], opciones: object, alProgreso: (hecho: number, total: number) => void) => { promesa: Promise<any>, cancelar: () => void }} */ (/** @type {unknown} */ (ejecutarSinTipos));

/** @type {HTMLElement | null} */ let contenedor = null;
/** @type {ReturnType<typeof conjuntosDe>} */ let conjuntos = { escalas: [], numericas: [] };
/** @type {UltimoTRI | null} */ let ultimo = null;
/** @type {{ cancelar: () => void } | null} */ let tarea = null;
let aplicando = false;

/** Lo que admite la tarjeta: de 3 a 100 ítems con hasta 10 categorías, y al menos 100 personas. */
export const LIMITES_TRI = Object.freeze({ minItems: 3, maxItems: 100, maxCategorias: 10, minCasos: 100 });
/** El máximo de iteraciones del EM. */
const MAX_ITERACIONES = 500;

const guia = (/** @type {string} */ t) => `<div class="orden-guia" role="note" style="margin:0 0 0.6rem;"><span class="orden-guia-titulo">Para qué sirve:</span><span class="orden-nota">${t}</span></div>`;
/** @returns {Record<string, unknown>[]} */
function datos() { try { return /** @type {Record<string, unknown>[]} */ (AnalizadorEstadistico.obtenerDatos() || []); } catch (e) { return []; } }
const etiqueta = (/** @type {string} */ c) => { try { return EtiquetasVariables.etiqueta(c); } catch (e) { return c; } };
/** @param {string} sel @returns {any} */
const q = sel => /** @type {HTMLElement} */ (contenedor).querySelector(sel);

const PLANTILLA = () => `
    <h3 class="card-title">14. Teoría de respuesta al ítem (TRI) y DIF <span class="help-text" style="display:inline;">— opcional</span></h3>
    <p class="help-text">Estima cuánto discrimina cada ítem y en qué nivel del rasgo informa (a diferencia del α, que da una sola fiabilidad para
        todos), con el modelo de respuesta graduada (Likert), el 2PL o el de Rasch (sí/no); y si algún ítem funciona distinto en dos o más grupos con
        el mismo nivel del rasgo (DIF), una evidencia de la equidad del instrumento. Supone un solo rasgo: compruébalo antes con el AFE (tarjeta 4).</p>
    <div class="rejilla-psico">
        <div class="form-group">
            ${guia('Los ítems de un instrumento unidimensional (o de una de sus dimensiones).')}
            <label for="triConjunto">Ítems</label>
            <select id="triConjunto" class="input"><option value="">Carga una base primero</option></select>
            <textarea id="triItems" class="input" rows="2" hidden aria-label="Ítems separados por comas" placeholder="Ej: P1, P2, P3, P4"></textarea>
            <span class="help-text">De ${LIMITES_TRI.minItems} a ${LIMITES_TRI.maxItems} ítems con respuestas enteras; si el instrumento tiene varias dimensiones, una a la vez.</span>
        </div>
        <div class="form-group">
            ${guia('El modelo: el de respuesta graduada para opciones ordenadas (Likert); con respuestas sí/no o correcto/incorrecto, el 2PL o el de Rasch.')}
            <label for="triModelo">Modelo</label>
            <select id="triModelo" class="input"><option value="auto">Automático (recomendado)</option><option value="grm">Respuesta graduada (GRM)</option><option value="2pl">Logístico de dos parámetros (2PL)</option><option value="rasch">Rasch (una discriminación común)</option></select>
            <span class="help-text">Automático: el GRM si algún ítem tiene más de dos opciones; si no, el 2PL.</span>
        </div>
        <div class="form-group">
            ${guia('Si quieres saber si algún ítem favorece a un grupo (sexo, colegio…) a igual nivel del rasgo.')}
            <label for="triGrupo">Grupo para el DIF (opcional)</label>
            <select id="triGrupo" class="input"><option value="">Sin DIF</option></select>
            <span class="help-text">Regresión logística (ordinal con ítems Likert) con el puntaje total como criterio; p ajustadas por Holm.</span>
        </div>
    </div>
    <div class="acciones-fila"><button type="button" id="triCalcular" class="btn btn-primary">Estimar el modelo</button>
        <button type="button" id="triActualizar" class="btn btn-outline" title="Actualizar con la base cargada" aria-label="Actualizar las variables">↻</button></div>
    <div id="triProgresoFila" class="boot-progreso" hidden><progress id="triProgreso" max="100" value="0" aria-label="Progreso de la estimación"></progress> <span id="triEstado" class="help-text" aria-live="polite"></span>
        <button type="button" id="triCancelar" class="btn btn-outline">Cancelar</button></div>
    <div id="triMensajes" role="alert"></div>
    <div id="triResultados" hidden></div>`;

/** Rehace los desplegables con la base cargada. */
export function actualizarVariables() {
    if (!contenedor) return;
    const filas = datos(), sel = q('#triConjunto'), previo = sel.value, g = q('#triGrupo'), previoG = g.value;
    if (!filas.length) { sel.innerHTML = '<option value="">Carga una base primero</option>'; g.innerHTML = '<option value="">Sin DIF</option>'; return; }
    conjuntos = conjuntosDe(filas, LIMITES_TRI.minItems);
    sel.innerHTML = opcionesHTML({ escalas: conjuntos.escalas, numericas: [] });
    if ([...sel.options].some((/** @type {HTMLOptionElement} */ o) => o.value === previo)) sel.value = previo;
    q('#triItems').hidden = sel.value !== 'propia';
    // (2027.01.20, revisión) los grupos: las columnas de texto o de enteros con 2 a 10 valores que no son ítems de una escala
    // ni puntajes (antes, solo las de texto: un sexo codificado 1/2 no se ofrecía)
    const noGrupos = [...conjuntos.escalas.flatMap(e => e.items), ...Object.keys(/** @type {Record<string, unknown>} */ (filas[0])).filter(c => /^(General|Dimension|Total)_/i.test(c))];
    g.innerHTML = '<option value="">Sin DIF</option>' + candidatosFactorEntre(filas, noGrupos).map(c => `<option value="${escaparHTML(c.columna)}">${escaparHTML(`${etiqueta(c.columna)} (${c.niveles.length} grupos)`)}</option>`).join('');
    if ([...g.options].some((/** @type {HTMLOptionElement} */ o) => o.value === previoG)) g.value = previoG;
}

/** @param {string[]} errores @param {string[]} [avisos] */
function mensajes(errores, avisos = []) {
    const bloque = (/** @type {string} */ clase, /** @type {string} */ titulo, /** @type {string[]} */ xs) => (xs.length ? `<div class="${clase}"><strong>${titulo}</strong><ul>${xs.map(x => `<li>${escaparHTML(x)}</li>`).join('')}</ul></div>` : '');
    q('#triMensajes').innerHTML = bloque('aiken-errores', 'No se puede estimar:', errores) + bloque('aiken-avisos', 'Ten en cuenta:', avisos);
}

/**
 * La curva de información del test (θ de −4 a 4 DE del rasgo).
 * @param {ResultadoTRI} R
 * @param {string} escala
 * @param {boolean} [papel]
 */
export function graficoInformacion(R, escala, papel = false) {
    const de = R.deRasgo ? R.deRasgo.valor : 1, thetas = Array.from({ length: 81 }, (_, k) => (-4 + k * 0.1) * de);
    const I = informacion(R, thetas);
    let imax = 0;
    I.test.forEach((v, k) => { if (v > /** @type {number} */ (I.test[imax])) imax = k; });
    const tmax = /** @type {number} */ (thetas[imax]), vmax = /** @type {number} */ (I.test[imax]);
    return graficoLineas({
        series: [{ etiqueta: 'Información del test', puntos: thetas.map((t, k) => { const v = /** @type {number} */ (I.test[k]); return { x: t, y: v, descripcion: `θ = ${numeroFijo(t, 1)}: información ${numeroFijo(v, 2)}, error típico ${numeroFijo(1 / Math.sqrt(v), 2)}` }; }) }],
        ejeX: { titulo: `Nivel del rasgo (θ${R.deRasgo ? ', en logits' : ''})`, min: /** @type {number} */ (thetas[0]), max: /** @type {number} */ (thetas[thetas.length - 1]) }, ejeY: { titulo: 'Información', min: 0 },
        destacados: [{ x: tmax, y: vmax, etiqueta: `máxima en θ = ${numeroFijo(tmax, 1)}: ${numeroFijo(vmax, 1)} (EE = ${numeroFijo(1 / Math.sqrt(vmax), 2)})`, lado: tmax < 0 ? 'derecha' : 'izquierda', vertical: 'arriba' }],
        descripcion: `Función de información del test de ${escala}: cuánto informa en cada nivel del rasgo; el error típico de medida es 1/√I`, papel
    });
}

/** Quita el resultado anterior (con otros ítems u otro grupo ya no vale). */
function ocultarResultado() {
    ultimo = null;
    if (!contenedor) return;
    q('#triResultados').hidden = true; q('#triResultados').innerHTML = '';
}

/** Estima el modelo (y el DIF, después, en el mismo Worker) y lo muestra. @returns {Promise<ResultadoTRI | null>} */
export function calcular() {
    if (!contenedor) return Promise.resolve(null);
    if (tarea) { tarea.cancelar(); tarea = null; }
    // (2027.01.20, revisión) un error o una estimación nueva quitan el resultado anterior: antes seguía a la vista, y su Word y
    // su «Añadir θ», activos, con otros ítems elegidos
    const fallo = (/** @type {string} */ t) => { mensajes([t]); ocultarResultado(); return Promise.resolve(null); };
    const filas = datos();
    if (!filas.length) return fallo('No hay una base cargada en el Analizador.');
    /** @type {{ items: string[], descripcion: string } | null} */ let elegidas;
    try { elegidas = variablesDe(q('#triConjunto').value, q('#triItems').value, filas, conjuntos); } catch (e) { return fallo(/** @type {Error} */ (e).message); }
    if (!elegidas || elegidas.items.length < LIMITES_TRI.minItems) return fallo(`Elige al menos ${LIMITES_TRI.minItems} ítems.`);
    if (elegidas.items.length > LIMITES_TRI.maxItems) return fallo(`Como mucho ${LIMITES_TRI.maxItems} ítems.`);
    const columnas = elegidas.items, grupo = q('#triGrupo').value || null;
    if (grupo && columnas.includes(grupo)) return fallo('El grupo del DIF no puede ser uno de los ítems.');
    // las respuestas: enteras; las personas sin ninguna respuesta quedan fuera
    const noEnteras = columnas.filter(c => filas.some(f => !esPerdido(f[c]) && !Number.isInteger(aNumero(f[c]))));
    if (noEnteras.length) return fallo(`La TRI necesita respuestas enteras (categorías): no lo son las de ${noEnteras.map(etiqueta).join(', ')}.`);
    const usadas = filas.map((f, i) => (columnas.some(c => Number.isFinite(aNumero(f[c]))) ? i : -1)).filter(i => i >= 0);
    if (usadas.length < LIMITES_TRI.minCasos) return fallo(`Hacen falta al menos ${LIMITES_TRI.minCasos} personas con respuestas (hay ${usadas.length}): la TRI necesita muestras grandes (de 200 a 500 para el GRM).`);
    const { X, categorias } = prepararRespuestas(columnas.map(c => Float64Array.from(usadas, i => aNumero(/** @type {Record<string, unknown>} */ (filas[i])[c]))));
    const unaCategoria = columnas.filter((_, j) => /** @type {number[]} */ (categorias[j]).length < 2), muchas = columnas.filter((_, j) => /** @type {number[]} */ (categorias[j]).length > LIMITES_TRI.maxCategorias);
    if (unaCategoria.length) return fallo(`Con una sola respuesta observada no se puede estimar: ${unaCategoria.map(etiqueta).join(', ')}.`);
    if (muchas.length) return fallo(`Más de ${LIMITES_TRI.maxCategorias} categorías en ${muchas.map(etiqueta).join(', ')} (¿es un puntaje y no un ítem?).`);
    const politomicos = categorias.some(c => c.length > 2);
    const modelo = /** @type {'rasch' | '2pl' | 'grm'} */ (q('#triModelo').value === 'auto' ? (politomicos ? 'grm' : '2pl') : q('#triModelo').value);
    if (modelo !== 'grm' && politomicos) return fallo(`El ${NOMBRE_MODELO[modelo]} es para ítems dicotómicos: con ítems de más de dos opciones, usa el GRM.`);
    ocultarResultado();
    /** @type {string[]} */ const avisos = [];
    if (filas.length > usadas.length) avisos.push(`${filas.length - usadas.length} caso(s) sin ninguna respuesta quedan fuera (N = ${usadas.length}).`);
    if (usadas.length < 200) avisos.push(`Con ${usadas.length} personas, los parámetros son inestables (se recomiendan de 200 a 500 para el GRM).`);
    const huecos = columnas.filter((_, j) => { const c = /** @type {number[]} */ (categorias[j]); return c.some((v, k) => k > 0 && v - /** @type {number} */ (c[k - 1]) > 1); });
    if (huecos.length) avisos.push(`${huecos.map(etiqueta).join(', ')}: no se usaron todas las opciones de la escala; se estiman los umbrales de las observadas.`);
    const alfa = AnalizadorEstadistico.alfaEstudio(), inicio = Date.now();
    q('#triCalcular').disabled = true; q('#triProgresoFila').hidden = false; q('#triProgreso').value = 0; q('#triEstado').textContent = 'Estimando…';
    mensajes([], avisos);
    const actual = ejecutarTarea('tri', [{ clave: 'tri', X }], { modelo, maxIteraciones: MAX_ITERACIONES }, h => {
        q('#triProgreso').value = Math.min(95, Math.round(100 * (1 - Math.exp(-h / 25))));
        q('#triEstado').textContent = `Iteración ${h} del algoritmo EM · ${((Date.now() - inicio) / 1000).toFixed(0)} s`;
    });
    /** @type {{ cancelar: () => void }} */ let enCurso = actual;
    tarea = actual;
    q('#triCancelar').onclick = () => enCurso.cancelar();
    const terminar = () => { q('#triCalcular').disabled = false; q('#triProgresoFila').hidden = true; if (tarea === enCurso) tarea = null; };
    // los grupos del DIF: sus valores, ordenados, y el de cada persona (−1 sin grupo)
    const todos = grupo ? [...new Set(usadas.map(i => /** @type {Record<string, unknown>} */ (filas[i])[grupo]).filter(v => !esPerdido(v)).map(v => String(v).trim()))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true })) : [];
    return actual.promesa.then(lista => {
        /** @type {ResultadoTRI} */ const R = lista[0].resultado;
        if (!grupo) return { R, D: /** @type {ResultadoDIF | null} */ (null), errorDIF: '' };
        // (2027.01.20) el DIF, en el mismo Worker (tres regresiones por ítem: con muchos ítems y personas, segundos), con el
        // total sumado con los valores de las respuestas
        const codigo = Int32Array.from(usadas, i => { const v = /** @type {Record<string, unknown>} */ (filas[i])[grupo]; return esPerdido(v) ? -1 : todos.indexOf(String(v).trim()); });
        q('#triProgreso').value = 0; q('#triEstado').textContent = 'Evaluando el DIF…';
        const dif = ejecutarTarea('dif', [{ clave: 'dif', X, grupo: codigo, categorias }], { alfa }, (h, t) => {
            q('#triProgreso').value = Math.round(100 * h / t);
            q('#triEstado').textContent = `DIF: ítem ${h} de ${t} · ${((Date.now() - inicio) / 1000).toFixed(0)} s`;
        });
        enCurso = dif; tarea = dif;
        return dif.promesa.then(l => ({ R, D: /** @type {ResultadoDIF | null} */ (l[0].resultado), errorDIF: '' }), e => {
            if (e && e.cancelado) throw e;
            return { R, D: /** @type {ResultadoDIF | null} */ (null), errorDIF: String(e && e.message ? e.message : e) };
        });
    }).then(({ R, D, errorDIF }) => {
        terminar();
        /** @type {string[]} */ let niveles = [];
        if (errorDIF) avisos.push(`No se pudo evaluar el DIF: ${errorDIF}.`);
        if (D) {
            niveles = D.grupos.map(c => /** @type {string} */ (todos[c]));
            if (D.excluidos.length) avisos.push(`${D.excluidos.length === 1 ? 'Un grupo tiene' : `${D.excluidos.length} grupos tienen`} menos de ${MINIMO_GRUPO_DIF} personas y ${D.excluidos.length === 1 ? 'queda' : 'quedan'} fuera del DIF: ${D.excluidos.map(e => `${todos[e.grupo]} (${e.n})`).join(', ')}.`);
            const chicos = niveles.filter((_, k) => /** @type {number} */ (/** @type {ResultadoDIF} */ (D).tamanos[k]) < 100);
            if (chicos.length) avisos.push(`Grupos con menos de 100 personas en el DIF (${chicos.join(', ')}): la regresión logística tiene poca potencia para detectarlo.`);
        }
        // los ítems raros: discriminación negativa (¿un ítem inverso sin recodificar?) o desmesurada
        if (R.modelo !== 'rasch') {
            const negativas = R.items.map((it, j) => (it.a <= 0 ? etiqueta(/** @type {string} */ (columnas[j])) : null)).filter(x => x !== null);
            const enormes = R.items.map((it, j) => (it.a > 4 ? etiqueta(/** @type {string} */ (columnas[j])) : null)).filter(x => x !== null);
            if (negativas.length) avisos.push(`Discriminación negativa o nula en ${negativas.join(', ')}: ¿${negativas.length === 1 ? 'es un ítem inverso' : 'son ítems inversos'} sin recodificar? Recodifícalos o quítalos y vuelve a estimar.`);
            if (enormes.length) avisos.push(`Discriminación muy alta (a > 4) en ${enormes.join(', ')}: puede ser un ítem casi redundante con otro o un problema de estimación.`);
        }
        if (!R.convergio) avisos.push(`El algoritmo EM no convergió en ${MAX_ITERACIONES} iteraciones: los parámetros son aproximados.`);
        mensajes([], avisos);
        // (2027.01.20, revisión) con una lista propia, la escala se nombra por sus ítems (antes, «las variables elegidas», que
        // daba «para los 6 ítems de las variables elegidas» y una columna «las_variables_elegidas_theta»)
        const propia = q('#triConjunto').value === 'propia', primero = /** @type {string} */ (columnas[0]), ultimoItem = /** @type {string} */ (columnas[columnas.length - 1]);
        const escala = propia ? `la lista propia (${etiqueta(primero)} a ${etiqueta(ultimoItem)})` : /** @type {{ descripcion: string }} */ (elegidas).descripcion.replace(/^los ítems de /, '');
        /** @type {ContextoTRI} */
        const ctx = { escala, items: columnas.map(etiqueta), grupo: grupo && D ? etiqueta(grupo) : null, niveles, excluidos: filas.length - usadas.length, alfa };
        ultimo = { R, D, ctx, filas: usadas, columnas, grupo: D ? grupo : null, raiz: propia ? `${primero}_${ultimoItem}` : escala };
        pintar();
        return R;
    }).catch(err => {
        terminar();
        mensajes(err && err.cancelado ? [] : [`No se pudo estimar: ${err && err.message ? err.message : err}`], err && err.cancelado ? ['Estimación cancelada.'] : []);
        return null;
    });
}

/** Una tabla en HTML. @param {{ titulo: string, cabecera: string[], filas: string[][], nota: string }} t @param {boolean} [larga] */
const tabla = (t, larga = false) => `<h5 class="aiken-subtitulo">${escaparHTML(t.titulo)}</h5><div class="table-container"${larga ? ' style="max-height:26rem; overflow:auto;"' : ''}><table class="table"><thead><tr>${t.cabecera.map(h => `<th>${escaparHTML(h)}</th>`).join('')}</tr></thead><tbody>${t.filas.map(f => `<tr>${f.map(c => `<td>${escaparHTML(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="help-text"><em>Nota.</em> ${escaparHTML(t.nota)}</p>`;

/** Pinta el último resultado. */
function pintar() {
    if (!contenedor || !ultimo) return;
    const { R, D, ctx, columnas, grupo } = ultimo, zona = q('#triResultados');
    zona.innerHTML = `<h4 class="aiken-subtitulo aiken-titulo">Resultados: ${escaparHTML(NOMBRE_MODELO[R.modelo])} de ${escaparHTML(ctx.escala)}</h4>
        ${tabla(tablaParametros(R, ctx), true)}${tabla(tablaAjuste(R))}
        <h5 class="aiken-subtitulo">Información del test</h5><div style="max-width:640px;">${graficoInformacion(R, ctx.escala, false).svg}</div>
        <p class="help-text" style="margin:0.2rem 0 0;">Donde la curva es alta, el instrumento mide con precisión (error típico pequeño); donde cae, distingue mal entre personas. Pasa el ratón por la curva para ver cada valor.</p>
        ${D ? tabla(tablaDIF(D, ctx), true) : ''}
        <h5 class="aiken-subtitulo">Redacción para la tesis (APA 7)</h5><p class="aiken-parrafo" id="triParrafo">${escaparHTML(redactarTRI(R, ctx, D))}</p>
        <details class="aiken-referencias"><summary>Referencias citadas</summary>${referenciasTRI(R, D).map(x => `<p>${x}</p>`).join('')}</details>
        ${bloqueSintaxis(sintaxisTRI({ items: columnas, modelo: R.modelo, grupo }))}
        <div class="acciones-fila"><button type="button" id="triCSV" class="btn btn-outline">Descargar las puntuaciones θ (CSV)</button><button type="button" id="triAgregar" class="btn btn-outline">Añadir θ a la base</button><button type="button" id="triWord" class="btn btn-primary">Descargar Word (APA 7)</button></div>`;
    zona.hidden = false;
    q('#triCSV').addEventListener('click', () => { if (ultimo) descargarArchivo('﻿' + csvPuntuaciones(ultimo.R, ultimo.filas, datos().length), 'puntuaciones_theta.csv', 'text/csv'); });
    q('#triAgregar').addEventListener('click', agregarTheta);
    q('#triWord').addEventListener('click', () => { void exportarWord(); });
}

/**
 * Los nombres de las columnas de θ y de su error típico: «<escala>_theta» y «<escala>_theta_EE» (terminan en letras, así la
 * detección de escalas no los toma por ítems numerados).
 * @param {string} escala
 */
export function nombresTheta(escala) {
    const raiz = String(escala).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'TRI';
    return { theta: `${raiz}_theta`, ee: `${raiz}_theta_EE` };
}

/** Añade θ y su error típico a la base del Analizador (si ya están, de una estimación anterior, los reemplaza). @returns {string | null} */
export function agregarTheta() {
    if (!ultimo) return null;
    const { R, filas: usadas, raiz } = ultimo, filas = datos(), { theta, ee } = nombresTheta(raiz);
    const yaEstaban = filas.length > 0 && theta in /** @type {Record<string, unknown>} */ (filas[0]);
    const indice = new Map(usadas.map((f, i) => [f, i]));
    const nuevas = filas.map((f, i) => { const k = indice.get(i); return { ...f, [theta]: k === undefined ? '' : Number(/** @type {number} */ (R.eap[k]).toFixed(4)), [ee]: k === undefined ? '' : Number(/** @type {number} */ (R.dePosterior[k]).toFixed(4)) }; });
    aplicando = true;
    try { reemplazarFilas(nuevas); } finally { aplicando = false; }
    // (2027.01.20, revisión) la base cambia: las demás tarjetas olvidan sus resultados (se calcularon con la anterior)
    mostrarToast(`${yaEstaban ? 'Actualizadas' : 'Añadidas'} en la base: ${theta} y ${ee}. Los resultados de las demás tarjetas se borraron (eran de la base anterior): vuelve a calcular los que necesites.`, 'success', 7000);
    return theta;
}

/** El Word del último ajuste. */
export async function exportarWord() {
    if (!ultimo) return null;
    const g = graficoInformacion(ultimo.R, ultimo.ctx.escala, true);
    const png = await rasterizarSVG(g.svg, ANCHO_FIGURA, Math.round(ANCHO_FIGURA * g.alto / g.ancho));
    return descargarWord(documentoWordTRI(ultimo.R, ultimo.ctx, ultimo.D, png), 'TRI_APA', 'TRI exportada a Word (APA 7)');
}

/** Con otros datos, el ajuste anterior ya no vale (salvo si la base nueva es la misma con θ añadida). */
export function olvidarTRI() {
    if (aplicando) return;
    if (tarea) { tarea.cancelar(); tarea = null; }
    ultimo = null;
    if (!contenedor) return;
    q('#triResultados').hidden = true; q('#triResultados').innerHTML = ''; q('#triMensajes').innerHTML = '';
}

/** Monta la tarjeta en #triContainer (una vez). */
export function montarTRI() {
    contenedor = typeof document !== 'undefined' ? document.getElementById('triContainer') : null;
    if (!contenedor || contenedor.dataset.montado === '1') return;
    contenedor.dataset.montado = '1';
    bus.on(EVENTOS.DATOS_CARGADOS, () => { olvidarTRI(); actualizarVariables(); });
    contenedor.innerHTML = PLANTILLA();
    q('#triConjunto').addEventListener('change', () => { q('#triItems').hidden = q('#triConjunto').value !== 'propia'; });
    q('#triActualizar').addEventListener('click', actualizarVariables);
    q('#triCalcular').addEventListener('click', () => { void calcular(); });
    actualizarVariables();
}

/** El último resultado. */
export function resultadoTRI() { return ultimo; }
