// @ts-check
// analizador/roc/roc-ui.js — (2027.01.18) la tarjeta «12. Validez de criterio: curva ROC» del Analizador: la puntuación de un
// test (primero los puntajes General_, Dimension_ y Total_), el criterio dicotómico (un diagnóstico, un grupo conocido) y su
// valor que indica el caso, y el sentido. Muestra el área bajo la curva, la curva, el punto de corte óptimo con sus
// intervalos, la tabla de cortes, la redacción APA, el CSV y el Word. La zona de resultados (#rocResultados) es la que se
// imprime.
import { AnalizadorEstadistico } from '../estadistica.js';
import { EtiquetasVariables } from '../../shared/etiquetas-variables.js';
import { bus, EVENTOS } from '../../shared/eventos.js';
import { escaparHTML } from '../../shared/html.js';
import { descargarArchivo } from '../../shared/descargas.js';
import { aNumero, esPerdido } from '../../core/data/celdas.js';
import { curvaROC } from '../../core/stats/roc.js';
import { columnasCuantitativas } from '../motor/columnas.js';
import { candidatosFactorEntre } from '../relacionadas/deteccion.js';
import { graficoLineas } from '../informe/grafico-lineas.js';
import { rasterizarSVG } from '../../shared/rasterizar.js';
import { ANCHO_FIGURA } from '../graficos-en-papel.js';
import { numeroFijo } from '../../shared/formato-numero.js';
import { tablaAUC, tablaOptimo, tablaCortes, redactarROC, referenciasROC, csvROC, documentoWordROC, regla, alReves } from './roc-redaccion.js';
import { descargarWord } from '../informe/word-apa.js';
import { sintaxisROC, bloqueSintaxis } from '../informe/sintaxis.js';

/** @typedef {import('./roc-redaccion.js').ResultadoROC} ResultadoROC */
/** @typedef {import('./roc-redaccion.js').ContextoROC} ContextoROC */

/** @type {HTMLElement | null} */ let contenedor = null;
/** @type {{ R: ResultadoROC, ctx: ContextoROC } | null} */ let ultimo = null;
/** @type {{ columna: string, niveles: string[] }[]} */ let criterios = [];

const guia = (/** @type {string} */ t) => `<div class="orden-guia" role="note" style="margin:0 0 0.6rem;"><span class="orden-guia-titulo">Para qué sirve:</span><span class="orden-nota">${t}</span></div>`;
/** @returns {Record<string, unknown>[]} */
function datos() { try { return /** @type {Record<string, unknown>[]} */ (AnalizadorEstadistico.obtenerDatos() || []); } catch (e) { return []; } }
const etiqueta = (/** @type {string} */ c) => { try { return EtiquetasVariables.etiqueta(c); } catch (e) { return c; } };
/** @param {string} sel @returns {any} */
const q = sel => /** @type {HTMLElement} */ (contenedor).querySelector(sel);

const PLANTILLA = () => `
    <h3 class="card-title">12. Validez de criterio: curva ROC <span class="help-text" style="display:inline;">— opcional</span></h3>
    <p class="help-text">¿Distingue el test a quienes tienen la condición (según un criterio externo: un diagnóstico, una entrevista clínica, un grupo
        conocido) de quienes no? El área bajo la curva resume la discriminación, y el punto de corte óptimo dice desde qué puntuación clasificar como caso.</p>
    <div class="rejilla-psico">
        <div class="form-group">
            ${guia('La puntuación del test cuya validez evalúas.')}
            <label for="rocPuntuacion">Puntuación</label><select id="rocPuntuacion" class="input"><option value="">Carga una base primero</option></select>
            <span class="help-text">Una variable cuantitativa: el puntaje total o de una dimensión.</span>
        </div>
        <div class="form-group">
            ${guia('El criterio externo que dice quién tiene la condición (el «patrón de oro»).')}
            <label for="rocCriterio">Criterio</label><select id="rocCriterio" class="input"><option value="">Carga una base primero</option></select>
            <span class="help-text">Una variable con exactamente dos valores (sí/no, con/sin diagnóstico).</span>
        </div>
        <div class="form-group">
            ${guia('Cuál de los dos valores del criterio es el «caso» (la condición que el test debe detectar).')}
            <label for="rocPositivo">Valor que indica el caso</label><select id="rocPositivo" class="input"><option value="">Elige el criterio</option></select>
            <span class="help-text">Por ejemplo, «Con depresión» o 1.</span>
        </div>
        <div class="form-group">
            ${guia('Si las puntuaciones altas o las bajas indican la condición.')}
            <label for="rocSentido">Sentido</label>
            <select id="rocSentido" class="input"><option value="auto">Automático (recomendado)</option><option value="mayor">Las puntuaciones altas indican el caso</option><option value="menor">Las puntuaciones bajas indican el caso</option></select>
            <span class="help-text">Automático: el que da un área mayor que .5 (y lo dice).</span>
        </div>
    </div>
    <div class="acciones-fila"><button type="button" id="rocCalcular" class="btn btn-primary">Calcular la curva ROC</button>
        <button type="button" id="rocActualizar" class="btn btn-outline" title="Actualizar con la base cargada" aria-label="Actualizar las variables">↻</button></div>
    <div id="rocMensajes" role="alert"></div>
    <div id="rocResultados" hidden></div>`;

/** Los valores que nombran la presencia o la ausencia de la condición (una palabra entera: «Sin» no es «Sí»). */
const POSITIVO = /^(s[ií]|con|caso|presencia|presente|positivo|positiva|1)(?![\p{L}\p{N}])/iu;
const NEGATIVO = /^(no|sin|ausencia|ausente|negativo|negativa|normal|sano|sana|control|0)(?![\p{L}\p{N}])/iu;

/** Rehace los valores del criterio elegido. */
function actualizarPositivo() {
    const c = criterios.find(x => x.columna === q('#rocCriterio').value), sel = q('#rocPositivo'), previo = sel.value;
    sel.innerHTML = c ? c.niveles.map(v => `<option value="${escaparHTML(v)}">${escaparHTML(v)}</option>`).join('') : '<option value="">Elige el criterio</option>';
    if (c && c.niveles.includes(previo)) sel.value = previo;
    else if (c) {
        // el caso: el valor que lo nombra («Sí», «Con …», «Caso», 1) o el contrario del que nombra su ausencia («No», «Sin …»,
        // «Control», 0); si ninguno lo dice, el último
        const negativo = c.niveles.find(v => NEGATIVO.test(v.trim())), positivo = c.niveles.find(v => POSITIVO.test(v.trim()) && v !== negativo);
        sel.value = /** @type {string} */ (positivo ?? (negativo !== undefined ? c.niveles.find(v => v !== negativo) : c.niveles[c.niveles.length - 1]));
    }
}

/** Rehace los desplegables con la base cargada. */
export function actualizarVariables() {
    if (!contenedor) return;
    const filas = datos(), cols = columnasCuantitativas(filas).filter(c => c !== 'ID');
    const orden = [...cols.filter(c => /^(General|Dimension|Total)_/i.test(c)), ...cols.filter(c => !/^(General|Dimension|Total)_/i.test(c))];
    const sel = q('#rocPuntuacion'), previo = sel.value;
    sel.innerHTML = orden.length ? orden.map(c => `<option value="${escaparHTML(c)}">${escaparHTML(EtiquetasVariables.etiquetaConColumna ? EtiquetasVariables.etiquetaConColumna(c) : c)}</option>`).join('') : '<option value="">Carga una base primero</option>';
    if (orden.includes(previo)) sel.value = previo;
    criterios = candidatosFactorEntre(filas).filter(c => c.niveles.length === 2);
    const cr = q('#rocCriterio'), previoC = cr.value;
    cr.innerHTML = criterios.length ? criterios.map(c => `<option value="${escaparHTML(c.columna)}">${escaparHTML(etiqueta(c.columna))}</option>`).join('') : '<option value="">Ninguna variable con dos valores</option>';
    if (criterios.some(c => c.columna === previoC)) cr.value = previoC;
    actualizarPositivo();
}

/** La curva ROC del resultado. @param {ResultadoROC} R @param {ContextoROC} ctx @param {boolean} papel */
export function graficoROC(R, ctx, papel = false) {
    const o = R.optimo, f = (/** @type {number} */ v) => numeroFijo(v, 2);
    return graficoLineas({
        series: [{ etiqueta: ctx.puntuacion, puntos: R.curva.map(p => ({ x: p.fpr, y: p.tpr, descripcion: p.corte === null ? 'Nadie positivo' : `${ctx.puntuacion} ${regla(R, p.corte)}: sensibilidad ${f(p.tpr)}, especificidad ${f(1 - p.fpr)}` })) }],
        ejeX: { titulo: '1 − especificidad', min: 0, max: 1, decimales: 1 }, ejeY: { titulo: 'Sensibilidad', min: 0, max: 1, decimales: 1 },
        referencias: [{ tipo: 'diagonal' }],
        // la etiqueta, abajo y a la derecha del punto: entre la curva y la diagonal no pasa nada
        // (2027.01.20) por debajo de la diagonal (el sentido, al revés), sin corte óptimo que marcar
        destacados: alReves(R) ? [] : [{ x: 1 - o.especificidad, y: o.sensibilidad, etiqueta: `${regla(R, o.corte)}: S = ${f(o.sensibilidad)}, E = ${f(o.especificidad)}`, lado: 'derecha', vertical: 'abajo' }],
        descripcion: `Curva ROC de ${ctx.puntuacion} para identificar ${ctx.criterio} = ${ctx.positivo}: área bajo la curva ${numeroFijo(R.auc, 3)}${alReves(R) ? ', por debajo de la diagonal (el sentido elegido, al revés)' : '; el punto marca el corte óptimo'}`,
        papel, cuadrado: true
    });
}

/** Calcula y muestra la curva ROC. @returns {ResultadoROC | null} */
export function calcular() {
    if (!contenedor) return null;
    const msj = q('#rocMensajes'), zona = q('#rocResultados'), filas = datos();
    const error = (/** @type {string} */ t) => { msj.innerHTML = `<div class="aiken-errores"><strong>No se puede calcular:</strong> ${escaparHTML(t)}</div>`; zona.hidden = true; ultimo = null; return null; };
    if (!filas.length) return error('No hay una base cargada en el Analizador.');
    const x = q('#rocPuntuacion').value, c = q('#rocCriterio').value, positivo = q('#rocPositivo').value;
    if (!x) return error('Elige la puntuación.');
    if (!c) return error('Elige el criterio: una variable con exactamente dos valores.');
    if (x === c) return error('La puntuación y el criterio deben ser variables distintas.');
    const nivelesC = /** @type {{ niveles: string[] }} */ (criterios.find(k => k.columna === c) || { niveles: [] }).niveles;
    if (!nivelesC.includes(positivo)) return error('Elige el valor del criterio que indica el caso.');
    const negativo = /** @type {string} */ (nivelesC.find(v => v !== positivo));
    const pares = filas.map(f => ({ v: aNumero(f[x]), g: esPerdido(f[c]) ? null : String(f[c]).trim() })).filter(p => Number.isFinite(p.v) && p.g !== null);
    const excluidos = filas.length - pares.length;
    const n1 = pares.filter(p => p.g === positivo).length, n0 = pares.length - n1;
    if (n1 < 5 || n0 < 5) return error(`Hacen falta al menos 5 casos y 5 no casos con puntuación (hay ${n1} y ${n0}).`);
    const R = curvaROC(pares.map(p => p.v), pares.map(p => p.g === positivo), { sentido: /** @type {'auto' | 'mayor' | 'menor'} */ (q('#rocSentido').value) });
    if (!R) return error('Falta alguno de los dos grupos del criterio.');
    /** @type {ContextoROC} */
    const ctx = { puntuacion: etiqueta(x), criterio: etiqueta(c), positivo, negativo, excluidos, alfa: AnalizadorEstadistico.alfaEstudio() };
    ultimo = { R, ctx };
    /** @type {string[]} */ const avisos = [];
    if (excluidos) avisos.push(`${excluidos} caso(s) sin puntuación o sin criterio se excluyeron (n = ${pares.length}).`);
    if (R.invertido) avisos.push('Las puntuaciones bajas indican el caso: el sentido automático lo eligió así (con el contrario, el área quedaba por debajo de .5). Revisa que sea lo esperado.');
    if (n1 < 30 || n0 < 30) avisos.push('Con menos de 30 casos o no casos, los intervalos son anchos y el corte óptimo, inestable: repórtalo como provisional.');
    if (alReves(R)) avisos.push(`Con el sentido elegido, el área queda por debajo de .5 (${R.auc.toFixed(3).replace(/^0/, '')}): las puntuaciones ${R.sentido === 'mayor' ? 'bajas' : 'altas'} son las que indican el caso. Elige el otro sentido (o el automático); con este no se propone ningún corte.`);
    msj.innerHTML = avisos.map(a => `<div class="aiken-avisos">${escaparHTML(a)}</div>`).join('');
    const tabla = (/** @type {{ titulo: string, cabecera: string[], filas: string[][], nota: string }} */ t, /** @type {boolean} */ larga) => `<h5 class="aiken-subtitulo">${escaparHTML(t.titulo)}</h5><div class="table-container"${larga ? ' style="max-height:24rem; overflow:auto;"' : ''}><table class="table"><thead><tr>${t.cabecera.map(h => `<th>${escaparHTML(h)}</th>`).join('')}</tr></thead><tbody>${t.filas.map(f => `<tr>${f.map(v => `<td>${escaparHTML(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="help-text"><em>Nota.</em> ${escaparHTML(t.nota)}</p>`;
    zona.innerHTML = `<h4 class="aiken-subtitulo aiken-titulo">Resultados: curva ROC de ${escaparHTML(ctx.puntuacion)}</h4>
        ${tabla(tablaAUC(R, ctx), false)}
        <h5 class="aiken-subtitulo">Curva ROC</h5><div style="max-width:480px;">${graficoROC(R, ctx, false).svg}</div>
        ${alReves(R) ? '' : tabla(tablaOptimo(R, ctx), false)}${tabla(tablaCortes(R, ctx), true)}
        <h5 class="aiken-subtitulo">Redacción para la tesis (APA 7)</h5><p class="aiken-parrafo" id="rocParrafo">${escaparHTML(redactarROC(R, ctx))}</p>
        <details class="aiken-referencias"><summary>Referencias citadas</summary>${referenciasROC(R, ctx).map(r => `<p>${r}</p>`).join('')}</details>
        ${bloqueSintaxis(sintaxisROC({ puntuacion: x, criterio: c, positivo, sentido: R.sentido }))}
        <div class="acciones-fila"><button type="button" id="rocCSV" class="btn btn-outline">Descargar los cortes (CSV)</button><button type="button" id="rocWord" class="btn btn-primary">Descargar Word (APA 7)</button></div>`;
    zona.hidden = false;
    q('#rocCSV').addEventListener('click', () => descargarArchivo('﻿' + csvROC(R, ctx), 'curva_roc.csv', 'text/csv'));
    q('#rocWord').addEventListener('click', () => { void exportarWord(); });
    return R;
}

/** El Word de la última curva. */
export async function exportarWord() {
    if (!ultimo) return null;
    const g = graficoROC(ultimo.R, ultimo.ctx, true);
    const png = await rasterizarSVG(g.svg, Math.round(ANCHO_FIGURA * 0.8), Math.round(ANCHO_FIGURA * 0.8 * g.alto / g.ancho));
    return descargarWord(documentoWordROC(ultimo.R, ultimo.ctx, png), 'curva_ROC_APA', 'Curva ROC exportada a Word (APA 7)');
}

/** Con otros datos, la curva anterior ya no vale. */
export function olvidarROC() {
    ultimo = null;
    if (!contenedor) return;
    q('#rocResultados').hidden = true; q('#rocResultados').innerHTML = ''; q('#rocMensajes').innerHTML = '';
}

/** Monta la tarjeta en #rocContainer (una vez). */
export function montarROC() {
    contenedor = typeof document !== 'undefined' ? document.getElementById('rocContainer') : null;
    if (!contenedor || contenedor.dataset.montado === '1') return;
    contenedor.dataset.montado = '1';
    bus.on(EVENTOS.DATOS_CARGADOS, () => { olvidarROC(); actualizarVariables(); });
    contenedor.innerHTML = PLANTILLA();
    q('#rocCriterio').addEventListener('change', actualizarPositivo);
    q('#rocActualizar').addEventListener('click', actualizarVariables);
    q('#rocCalcular').addEventListener('click', () => { calcular(); });
    actualizarVariables();
}

/** El último resultado. */
export function resultadoROC() { return ultimo; }
