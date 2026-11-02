// @ts-check
// analizador/relacionadas/relacionadas-ui.js — (2027.01.17) la tarjeta «8. Medidas repetidas y muestras relacionadas» del
// Analizador: elige las medidas (las ondas del Simulador y los antes y después se reconocen solos; también una lista propia)
// y, si se quiere, un factor entre sujetos; aplica el protocolo (core/stats/protocolo-relacionadas.js) y muestra las tablas,
// el gráfico de perfil, los porqués, la redacción APA y el Word. La zona de resultados (#rmResultados) es la que se imprime.
import { AnalizadorEstadistico } from '../estadistica.js';
import { EtiquetasVariables } from '../../shared/etiquetas-variables.js';
import { bus, EVENTOS } from '../../shared/eventos.js';
import { escaparHTML } from '../../shared/html.js';
import { pConSigno } from '../../shared/formato-numero.js';
import { rasterizarSVG } from '../../shared/rasterizar.js';
import { ANCHO_FIGURA } from '../graficos-en-papel.js';
import { protocoloRelacionadas, NOMBRE_PRUEBA, MAX_MEDIDAS, MIN_CASOS } from '../../core/stats/protocolo-relacionadas.js';
import { detectarConjuntosMedidas, candidatosFactorEntre, extraerMatriz } from './deteccion.js';
import { tablasRelacionadas, redactar, porques, referenciasRelacionadas, documentoWordRelacionadas } from './redaccion.js';
import { graficoPerfil } from './grafico.js';
import { descargarWord } from '../informe/word-apa.js';
import { sintaxisRelacionadas, bloqueSintaxis } from '../informe/sintaxis.js';
import { conjuncionY } from '../../shared/texto-es.js';

/** @typedef {import('./deteccion.js').ConjuntoMedidas} ConjuntoMedidas */
/** @typedef {ReturnType<typeof protocoloRelacionadas>} ResultadoRelacionadas */
/** @typedef {import('./redaccion.js').Contexto} Contexto */

/** @type {HTMLElement | null} */ let contenedor = null;
/** @type {ConjuntoMedidas[]} */ let conjuntos = [];
/** @type {{ P: ResultadoRelacionadas, ctx: Contexto } | null} */ let ultimo = null;

const guia = (/** @type {string} */ t) => `<div class="orden-guia" role="note" style="margin:0 0 0.6rem;"><span class="orden-guia-titulo">Para qué sirve:</span><span class="orden-nota">${t}</span></div>`;
/** @returns {Record<string, unknown>[]} */
function datos() { try { return /** @type {Record<string, unknown>[]} */ (AnalizadorEstadistico.obtenerDatos() || []); } catch (e) { return []; } }
/** La etiqueta de una columna (la del Simulador o la del editor), o su nombre. @param {string} c */
const etiqueta = c => { try { return EtiquetasVariables.etiqueta(c); } catch (e) { return c; } };
/** @param {string} sel @returns {any} */
const q = sel => /** @type {HTMLElement} */ (contenedor).querySelector(sel);

const PLANTILLA = () => `
    <h3 class="card-title">8. Medidas repetidas y muestras relacionadas <span class="help-text" style="display:inline;">— opcional</span></h3>
    <p class="help-text">Compara a las mismas personas medidas dos o más veces (antes y después, varias ondas) o en dos o más condiciones. La app
        contrasta los supuestos y elige la prueba: t para muestras relacionadas o Wilcoxon (dos medidas); ANOVA de medidas repetidas, con la
        corrección de la esfericidad si hace falta, o Friedman (tres o más); McNemar o Q de Cochran (respuestas sí/no); y el ANOVA mixto si
        añades un factor entre sujetos (por ejemplo, grupo experimental y de control).</p>
    <div class="rejilla-psico">
        <div class="form-group">
            ${guia('Qué columnas son las medidas repetidas: una columna por momento o condición, en su orden. Las ondas del Simulador (General_X, General_X_T2…), las columnas con _T1, _T2… y las de antes y después (_pre, _post) se agrupan automáticamente.')}
            <label for="rmConjunto">Medidas</label>
            <div style="display:flex; gap:0.5rem;"><select id="rmConjunto" class="input"><option value="">Carga una base primero</option></select>
                <button type="button" id="rmActualizar" class="btn btn-outline" title="Actualizar con la base cargada" aria-label="Actualizar la lista de medidas">↻</button></div>
            <textarea id="rmColumnas" class="input" rows="2" hidden aria-label="Columnas de las medidas separadas por comas, en su orden" placeholder="Ej: Ansiedad_inicio, Ansiedad_mitad, Ansiedad_final (en su orden, separadas por comas)"></textarea>
            <span class="help-text">«Lista propia» permite escribir las columnas (de 2 a ${MAX_MEDIDAS}). Se usan las personas con todas las medidas.</span>
        </div>
        <div class="form-group">
            ${guia('Si quieres saber si el cambio es distinto según un grupo (experimental y control, hombres y mujeres): con un factor, el análisis es un ANOVA mixto y su interacción responde a esa pregunta.')}
            <label for="rmFactor">Factor entre sujetos</label>
            <select id="rmFactor" class="input"><option value="">Ninguno: solo las medidas</option></select>
            <span class="help-text">Columnas de 2 a 10 grupos; cada grupo necesita al menos ${MIN_CASOS} personas con todas las medidas.</span>
        </div>
    </div>
    <div class="acciones-fila"><button type="button" id="rmCalcular" class="btn btn-primary">Analizar las medidas</button></div>
    <div id="rmMensajes" role="alert"></div>
    <div id="rmResultados" hidden></div>`;

/** Rehace la lista de conjuntos de medidas con la base cargada (conserva la elección si sigue). */
export function actualizarConjuntos() {
    if (!contenedor) return;
    const sel = q('#rmConjunto'), previo = sel.value, filas = datos();
    conjuntos = filas.length ? detectarConjuntosMedidas(Object.keys(/** @type {Record<string, unknown>} */ (filas[0]))) : [];
    const grupo = (/** @type {string} */ tipo, /** @type {string} */ titulo) => {
        const cs = conjuntos.filter(c => c.tipo === tipo);
        return cs.length ? `<optgroup label="${titulo}">${cs.map(c => `<option value="${escaparHTML(c.clave)}">${escaparHTML(`${etiqueta(c.base)} (${c.nombres.join(', ')})`)}</option>`).join('')}</optgroup>` : '';
    };
    sel.innerHTML = filas.length ? grupo('puntaje', 'Puntajes') + grupo('otra', 'Otras variables') + grupo('item', 'Ítems') + '<option value="propia">Lista propia de columnas…</option>' : '<option value="">Carga una base primero</option>';
    if ([...sel.options].some(o => o.value === previo)) sel.value = previo;
    q('#rmColumnas').hidden = sel.value !== 'propia';
    actualizarFactores();
}

/** Las columnas de las medidas elegidas (o las de la lista propia). @returns {string[]} */
function columnasElegidas() {
    const sel = q('#rmConjunto');
    if (sel.value === 'propia') return [...new Set(String(q('#rmColumnas').value).split(/[,;\n]+/).map(s => s.trim()).filter(Boolean))];
    const c = conjuntos.find(x => x.clave === sel.value);
    return c ? c.columnas : [];
}

/** Rehace la lista de factores: sin las columnas de las medidas elegidas ni las de los demás conjuntos (cambian con el tiempo). */
function actualizarFactores() {
    if (!contenedor) return;
    const sel = q('#rmFactor'), previo = sel.value, filas = datos();
    const cands = candidatosFactorEntre(filas, [...columnasElegidas(), ...conjuntos.flatMap(c => c.columnas)]);
    sel.innerHTML = '<option value="">Ninguno: solo las medidas</option>' + cands.map(c => `<option value="${escaparHTML(c.columna)}">${escaparHTML(`${etiqueta(c.columna)} (${c.niveles.length} grupos)`)}</option>`).join('');
    if ([...sel.options].some(o => o.value === previo)) sel.value = previo;
}

/**
 * Lo que se mide, para la redacción: la etiqueta de la base de un conjunto detectado, o el principio común de los nombres de
 * una lista propia («Ansiedad» de «Ansiedad_inicio», «Ansiedad_final»), o «la puntuación».
 * @param {string[]} columnas
 */
function queSeMide(columnas) {
    const sel = q('#rmConjunto'), c = conjuntos.find(x => x.clave === sel.value);
    if (c) return etiqueta(c.base);
    const nombres = columnas.map(etiqueta), separador = /[\s_\-.(]/;
    let prefijo = /** @type {string} */ (nombres[0]);
    for (const n of nombres) while (!n.startsWith(prefijo)) prefijo = prefijo.slice(0, -1);
    // sin cortar una palabra: de «Estres_pre» y «Estres_post», «Estres» (no «Estres_p»)
    if (!nombres.every(n => n.length === prefijo.length || separador.test(/** @type {string} */ (n[prefijo.length])))) {
        let k = prefijo.length - 1;
        while (k >= 0 && !separador.test(/** @type {string} */ (prefijo[k]))) k--;
        prefijo = k > 0 ? prefijo.slice(0, k) : '';
    }
    prefijo = prefijo.replace(/[\s_\-.(]+$/, '');
    return prefijo.length >= 3 ? prefijo : 'la puntuación';
}

/** Los nombres de los grupos: las etiquetas de sus códigos si la base las trae (un .sav, el Simulador). @param {string} factor @param {string[]} niveles */
function nombresDeGrupos(factor, niveles) {
    let codigos = null;
    try { codigos = AnalizadorEstadistico.codigosDe(factor); } catch (e) { codigos = null; }
    if (!codigos) return niveles;
    const mapa = new Map(codigos.map(([v, e]) => [String(v), e]));
    return niveles.map(n => mapa.get(n) || n);
}

/** Una tabla en la página. @param {import('./redaccion.js').Tabla} t */
function tablaHTML(t) {
    const fila = (/** @type {string[]} */ f, /** @type {number} */ i) => `<tr${t.negritas && t.negritas.has(i) ? ' style="font-weight:700;"' : ''}>${f.map(c => `<td>${escaparHTML(c)}</td>`).join('')}</tr>`;
    return `<h5 class="aiken-subtitulo">${escaparHTML(t.titulo)}</h5><div class="table-container"><table class="table"><thead><tr>${t.cabecera.map(h => `<th>${escaparHTML(h)}</th>`).join('')}</tr></thead><tbody>${t.filas.map(fila).join('')}</tbody></table></div><p class="help-text"><em>Nota.</em> ${escaparHTML(t.nota)}</p>`;
}

/**
 * Por qué se eligió la prueba, en una frase.
 * @param {ResultadoRelacionadas} P
 * @param {string | null} factor
 */
function razon(P, factor) {
    const R = /** @type {any} */ (P), N = R.normalidad;
    if (R.diseno === 'mixto') return `además de las medidas hay un factor entre sujetos (${etiqueta(/** @type {string} */ (factor))}): el ANOVA mixto contrasta si el cambio es el mismo en todos los grupos`;
    if (R.dicotomica) return `las medidas son dicotómicas (dos valores: ${R.dicotomica.cero} ${conjuncionY(R.dicotomica.uno)} ${R.dicotomica.uno})`;
    const sobre = R.sobre === 'diferencias' ? 'las diferencias entre las dos medidas' : 'los residuos del modelo';
    return `${sobre} ${N.normal ? 'se ajustan' : 'no se ajustan'} a la normal (${N.abreviatura}, p ${pConSigno(N.pValor)})`;
}

/** Analiza las medidas elegidas y muestra el resultado. @returns {ResultadoRelacionadas | null} */
export function calcular() {
    if (!contenedor) return null;
    const msj = q('#rmMensajes'), zona = q('#rmResultados'), filas = datos();
    const error = (/** @type {string} */ t) => { msj.innerHTML = `<div class="aiken-errores"><strong>No se puede analizar:</strong> ${escaparHTML(t)}</div>`; zona.hidden = true; ultimo = null; return null; };
    if (!filas.length) return error('No hay una base cargada en el Analizador.');
    const columnas = columnasElegidas();
    if (columnas.length < 2) return error('Elige un conjunto de medidas o escribe al menos dos columnas.');
    if (columnas.length > MAX_MEDIDAS) return error(`Se analizan hasta ${MAX_MEDIDAS} medidas a la vez.`);
    const faltan = columnas.filter(c => !(c in /** @type {Record<string, unknown>} */ (filas[0])));
    if (faltan.length) return error(`No están en la base: ${faltan.join(', ')}.`);
    const factor = q('#rmFactor').value || null;
    if (factor && columnas.includes(factor)) return error('El factor entre sujetos no puede ser una de las medidas.');
    const M = extraerMatriz(filas, columnas, factor);
    if (M.noNumericas.length) return error(`Estas columnas no son numéricas: ${M.noNumericas.map(etiqueta).join(', ')}.`);
    let P;
    try { P = protocoloRelacionadas(M.Y, { alfa: AnalizadorEstadistico.alfaEstudio(), grupos: M.grupos }); }
    catch (e) { return error(e instanceof Error ? e.message : String(e)); }
    const conjunto = conjuntos.find(x => x.clave === q('#rmConjunto').value);
    /** @type {Contexto} */
    const ctx = { que: queSeMide(columnas), nombres: conjunto ? conjunto.nombres : columnas.map(etiqueta), factor: factor ? etiqueta(factor) : null, niveles: factor ? nombresDeGrupos(factor, M.niveles) : [], excluidos: M.excluidos };
    ultimo = { P, ctx };
    const avisos = [...(M.excluidos ? [`${M.excluidos} caso(s) sin todas las medidas${factor ? ' o sin grupo' : ''} se excluyeron (n = ${P.n}).`] : []), ...P.avisos];
    msj.innerHTML = avisos.length ? `<div class="aiken-avisos">${avisos.map(escaparHTML).join('<br>')}</div>` : '';
    const series = P.diseno === 'mixto'
        ? /** @type {any} */ (P).perfilPorGrupo.map((/** @type {any} */ puntos, /** @type {number} */ a) => ({ etiqueta: /** @type {string[]} */ (ctx.niveles)[a] || `Grupo ${a + 1}`, puntos }))
        : [{ etiqueta: ctx.que, puntos: P.perfil }];
    const grafico = graficoPerfil({ nombres: ctx.nombres, series, ejeY: ctx.que, nivel: P.nivel }).svg;
    zona.innerHTML = `<h4 class="aiken-subtitulo aiken-titulo">Resultados: ${escaparHTML(ctx.que)} (${escaparHTML(ctx.nombres.join(', '))})</h4>
        <p style="margin:0.2rem 0 0.4rem;"><b>Prueba aplicada:</b> ${escaparHTML(NOMBRE_PRUEBA[P.prueba])}. <span class="help-text">Elegida porque ${escaparHTML(razon(P, factor))}.</span></p>
        ${tablasRelacionadas(P, ctx).map(tablaHTML).join('')}
        <h5 class="aiken-subtitulo">Gráfico de perfil</h5><div class="rm-grafico" style="max-width:640px;">${grafico}</div>
        <p class="help-text" style="margin:0.2rem 0 0;">Las barras son el intervalo de confianza del ${Math.round(100 * P.nivel)} % intra sujetos (Cousineau-Morey): sin la variación entre personas, el que sirve para comparar las medidas entre sí. Pasa el ratón por un punto para ver su valor.</p>
        <div style="margin:0.8rem 0 0; padding:0.5rem 0.7rem; background:rgba(46,91,186,0.08); border-left:3px solid #2E5BBA; border-radius:0.3rem; font-size:0.9em;"><b>💡 Los porqués del protocolo.</b> ${porques(P).join(' ')}</div>
        <h5 class="aiken-subtitulo">Redacción para la tesis (APA 7)</h5><p class="aiken-parrafo" id="rmParrafo">${escaparHTML(redactar(P, ctx))}</p>
        <details class="aiken-referencias"><summary>Referencias citadas</summary>${referenciasRelacionadas(P).map(x => `<p>${x}</p>`).join('')}</details>
        ${bloqueSintaxis(sintaxisRelacionadas({ medidas: columnas, grupo: factor, prueba: P.prueba, correccion: /** @type {any} */ (P).correccion || 'ninguna' }))}
        <div class="acciones-fila"><button type="button" id="rmWord" class="btn btn-primary">Descargar Word (APA 7)</button></div>`;
    zona.hidden = false;
    q('#rmWord').addEventListener('click', () => { void exportarWord(); });
    return P;
}

/** El Word del último análisis, con la figura de perfil en PNG (en los colores del papel). */
export async function exportarWord() {
    if (!ultimo) return null;
    const { P, ctx } = ultimo;
    const series = P.diseno === 'mixto'
        ? /** @type {any} */ (P).perfilPorGrupo.map((/** @type {any} */ puntos, /** @type {number} */ a) => ({ etiqueta: /** @type {string[]} */ (ctx.niveles)[a] || `Grupo ${a + 1}`, puntos }))
        : [{ etiqueta: ctx.que, puntos: P.perfil }];
    const g = graficoPerfil({ nombres: ctx.nombres, series, ejeY: ctx.que, nivel: P.nivel, papel: true });
    const alto = Math.round(ANCHO_FIGURA * g.alto / g.ancho);
    const png = await rasterizarSVG(g.svg, ANCHO_FIGURA, alto);
    return descargarWord(documentoWordRelacionadas(P, ctx, png), 'medidas_repetidas_APA', 'Medidas repetidas exportadas a Word (APA 7)');
}

/** Con otros datos en el Analizador, el resultado anterior era de los de antes: se olvida (y con él, su Word y lo impreso). */
export function olvidarRelacionadas() {
    ultimo = null;
    if (!contenedor) return;
    q('#rmResultados').hidden = true;
    q('#rmResultados').innerHTML = '';
    q('#rmMensajes').innerHTML = '';
}

/** Monta la tarjeta en #relacionadasContainer (una vez). */
export function montarRelacionadas() {
    contenedor = typeof document !== 'undefined' ? document.getElementById('relacionadasContainer') : null;
    if (!contenedor || contenedor.dataset.montado === '1') return;
    contenedor.dataset.montado = '1';
    bus.on(EVENTOS.DATOS_CARGADOS, () => { olvidarRelacionadas(); actualizarConjuntos(); });
    contenedor.innerHTML = PLANTILLA();
    const sel = q('#rmConjunto');
    sel.addEventListener('focus', actualizarConjuntos);
    sel.addEventListener('change', () => { q('#rmColumnas').hidden = sel.value !== 'propia'; actualizarFactores(); });
    q('#rmColumnas').addEventListener('change', actualizarFactores);
    q('#rmActualizar').addEventListener('click', actualizarConjuntos);
    q('#rmCalcular').addEventListener('click', () => { calcular(); });
    actualizarConjuntos();
}

/** El último resultado (para las pruebas y el proyecto). */
export function resultadoRelacionadas() { return ultimo; }
