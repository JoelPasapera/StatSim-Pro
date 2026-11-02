// @ts-check
// analizador/psicometria/baremos-ui.js — (2027.01.18) la tarjeta «11. Baremos (normas de interpretación)» del
// Analizador: la escala, los cortes de los niveles y, si se quiere, un grupo para decidir si hacen falta baremos
// diferenciados (por el protocolo de grupos independientes: diferencia significativa y al menos pequeña). Tablas, redacción
// APA, CSV y Word. La zona de resultados (#barResultados) es la que se imprime.
import { AnalizadorEstadistico } from '../estadistica.js';
import { EtiquetasVariables } from '../../shared/etiquetas-variables.js';
import { bus, EVENTOS } from '../../shared/eventos.js';
import { escaparHTML } from '../../shared/html.js';
import { descargarArchivo } from '../../shared/descargas.js';
import { aNumero, esPerdido } from '../../core/data/celdas.js';
import { tablaBaremos, categoriasPorPercentiles } from '../../core/stats/baremos.js';
import { protocoloGrupos, MAX_GRUPOS } from '../../core/stats/protocolo-grupos.js';
import { magnitudD, magnitudR, magnitudEta2 } from '../motor/magnitudes.js';
import { numeroConMenos } from '../../shared/formato-numero.js';
import { columnasCuantitativas } from '../motor/columnas.js';
import { candidatosFactorEntre } from '../relacionadas/deteccion.js';
import { tablasBaremos, redactarBaremos, referenciasBaremos, csvBaremos, documentoWordBaremos } from './baremos-redaccion.js';
import { descargarWord } from '../informe/word-apa.js';
import { sintaxisBaremos, bloqueSintaxis } from '../informe/sintaxis.js';

/** @typedef {import('./baremos-redaccion.js').ResultadoBaremos} ResultadoBaremos */
/** @typedef {import('./baremos-redaccion.js').ContextoBaremos} ContextoBaremos */
/** @type {HTMLElement | null} */ let contenedor = null;
/** @type {{ R: ResultadoBaremos, ctx: ContextoBaremos } | null} */ let ultimo = null;

/** Los esquemas de niveles que se ofrecen: sus percentiles de corte y sus nombres. */
export const ESQUEMAS = Object.freeze({
    '25-75': { cortes: [25, 75], nombres: ['Bajo', 'Medio', 'Alto'] },
    '33-67': { cortes: [33, 67], nombres: ['Bajo', 'Medio', 'Alto'] },
    '25-50-75': { cortes: [25, 50, 75], nombres: ['Bajo', 'Medio bajo', 'Medio alto', 'Alto'] },
    '10-25-75-90': { cortes: [10, 25, 75, 90], nombres: ['Muy bajo', 'Bajo', 'Medio', 'Alto', 'Muy alto'] }
});

const guia = (/** @type {string} */ t) => `<div class="orden-guia" role="note" style="margin:0 0 0.6rem;"><span class="orden-guia-titulo">Para qué sirve:</span><span class="orden-nota">${t}</span></div>`;
/** @returns {Record<string, unknown>[]} */
function datos() { try { return /** @type {Record<string, unknown>[]} */ (AnalizadorEstadistico.obtenerDatos() || []); } catch (e) { return []; } }
const etiqueta = (/** @type {string} */ c) => { try { return EtiquetasVariables.etiqueta(c); } catch (e) { return c; } };
/** @param {string} sel @returns {any} */
const q = sel => /** @type {HTMLElement} */ (contenedor).querySelector(sel);

const PLANTILLA = () => `
    <h3 class="card-title">11. Baremos (normas de interpretación) <span class="help-text" style="display:inline;">— opcional</span></h3>
    <p class="help-text">Convierte cada puntuación directa de una escala en su posición en tu muestra: percentil, puntuación T normalizada, eneatipo y
        decatipo, con niveles (bajo, medio, alto) por percentiles. Si las puntuaciones difieren entre grupos (sexo, edad…), propone baremos para cada uno.</p>
    <div class="rejilla-psico">
        <div class="form-group">
            ${guia('La escala para la que haces las normas: su puntaje total o el de una dimensión.')}
            <label for="barEscala">Escala</label><select id="barEscala" class="input"><option value="">Carga una base primero</option></select>
            <span class="help-text">La muestra de la base es la muestra normativa: tiene que representar a la población a la que se aplicarán.</span>
        </div>
        <div class="form-group">
            ${guia('Cuántos niveles de interpretación quieres y dónde se cortan.')}
            <label for="barEsquema">Niveles</label>
            <select id="barEsquema" class="input"><option value="25-75">3 niveles: percentiles 25 y 75 (recomendado)</option><option value="33-67">3 niveles: terciles (33 y 67)</option><option value="25-50-75">4 niveles: cuartiles</option><option value="10-25-75-90">5 niveles: percentiles 10, 25, 75 y 90</option></select>
            <span class="help-text">Los cortes se traducen a puntuaciones directas de tu muestra.</span>
        </div>
        <div class="form-group">
            ${guia('Si sospechas que un grupo puntúa distinto (y entonces un baremo general lo clasificaría mal).')}
            <label for="barGrupo">Grupo (opcional)</label><select id="barGrupo" class="input"><option value="">Ninguno: un baremo general</option></select>
            <span class="help-text">Se proponen baremos por grupo si la diferencia es significativa y al menos pequeña; cada grupo necesita al menos 30 personas.</span>
        </div>
    </div>
    <div class="acciones-fila"><button type="button" id="barCalcular" class="btn btn-primary">Elaborar los baremos</button>
        <button type="button" id="barActualizar" class="btn btn-outline" title="Actualizar con la base cargada" aria-label="Actualizar las variables">↻</button></div>
    <div id="barMensajes" role="alert"></div>
    <div id="barResultados" hidden></div>`;

/** Rehace los desplegables con la base cargada (las escalas, primero los puntajes General_ y Dimension_). */
export function actualizarVariables() {
    if (!contenedor) return;
    const filas = datos(), cols = columnasCuantitativas(filas).filter(c => c !== 'ID');
    const orden = [...cols.filter(c => /^(General|Dimension|Total)_/i.test(c)), ...cols.filter(c => !/^(General|Dimension|Total)_/i.test(c))];
    const sel = q('#barEscala'), previo = sel.value;
    sel.innerHTML = orden.length ? orden.map(c => `<option value="${escaparHTML(c)}">${escaparHTML(EtiquetasVariables.etiquetaConColumna ? EtiquetasVariables.etiquetaConColumna(c) : c)}</option>`).join('') : '<option value="">Carga una base primero</option>';
    if (orden.includes(previo)) sel.value = previo;
    const g = q('#barGrupo'), previoG = g.value;
    g.innerHTML = '<option value="">Ninguno: un baremo general</option>' + candidatosFactorEntre(filas, cols).map(c => `<option value="${escaparHTML(c.columna)}">${escaparHTML(`${etiqueta(c.columna)} (${c.niveles.length} grupos)`)}</option>`).join('');
    if ([...g.options].some((/** @type {HTMLOptionElement} */ o) => o.value === previoG)) g.value = previoG;
}

/**
 * La comparación de los grupos que decide si hacen falta baremos diferenciados: el protocolo de grupos independientes y su
 * tamaño del efecto; diferenciados si es significativa al α del estudio y el efecto es al menos pequeño.
 * @param {number[][]} grupos
 * @param {number} alfa
 */
export function decidirDiferenciados(grupos, alfa) {
    const P = protocoloGrupos(grupos, { alfa }), g = /** @type {any} */ (P.global);
    const nombre = { student: 't de Student', welch: 't de Welch', 'mann-whitney': 'U de Mann-Whitney', anova: 'ANOVA de un factor', 'anova-welch': 'ANOVA de Welch', 'kruskal-wallis': 'Kruskal-Wallis' }[P.prueba];
    // (2027.01.20, revisión) r, η² y ε², que no pasan de 1, sin el cero inicial (APA); la d, con él
    const sinCero = (/** @type {number} */ v, /** @type {number} */ dd) => numeroConMenos(v, dd).replace(/^(−?)0\./, '$1.');
    const [estadistico, efecto, magnitud] = P.prueba === 'student' || P.prueba === 'welch' ? [`t(${Number.isInteger(g.gl) ? g.gl : g.gl.toFixed(2)}) = ${numeroConMenos(g.t, 2)}`, `d = ${numeroConMenos(g.d, 2)}`, magnitudD(g.d)]
        : P.prueba === 'mann-whitney' ? [`z = ${numeroConMenos(g.z, 2)}`, `r = ${sinCero(g.r, 2)}`, magnitudR(g.r)]
        : P.prueba === 'kruskal-wallis' ? [`H(${g.gl}) = ${numeroConMenos(g.H, 2)}`, `ε² = ${sinCero(g.epsilon2, 3)}`, magnitudEta2(g.epsilon2)]
        : [`F(${g.gl1}, ${Number.isInteger(g.gl2) ? g.gl2 : g.gl2.toFixed(2)}) = ${numeroConMenos(g.F, 2)}`, `η² = ${sinCero(g.eta2, 3)}`, magnitudEta2(g.eta2)];
    const difieren = !!P.significativa && magnitud !== 'trivial';
    return { prueba: /** @type {string} */ (nombre), estadistico, pValor: g.pValor, efecto, magnitud, significativa: !!P.significativa, difieren, diferenciados: difieren, pequenos: /** @type {string[]} */ ([]) };
}

/** Elabora los baremos y los muestra. @returns {ResultadoBaremos | null} */
export function calcular() {
    if (!contenedor) return null;
    const msj = q('#barMensajes'), zona = q('#barResultados'), filas = datos();
    const error = (/** @type {string} */ t) => { msj.innerHTML = `<div class="aiken-errores"><strong>No se pueden elaborar:</strong> ${escaparHTML(t)}</div>`; zona.hidden = true; ultimo = null; return null; };
    if (!filas.length) return error('No hay una base cargada en el Analizador.');
    const escala = q('#barEscala').value, grupo = q('#barGrupo').value || null;
    if (!escala) return error('Elige la escala.');
    const esquema = ESQUEMAS[/** @type {'25-75'} */ (q('#barEsquema').value)] || ESQUEMAS['25-75'];
    const pares = filas.map(f => ({ v: aNumero(f[escala]), g: grupo && !esPerdido(f[grupo]) ? String(f[grupo]).trim() : null })).filter(p => Number.isFinite(p.v) && (!grupo || p.g !== null));
    const valores = pares.map(p => p.v), excluidos = filas.length - valores.length;
    if (valores.length < 30) return error(`Hacen falta al menos 30 puntuaciones para unos baremos (hay ${valores.length}); con pocas, los percentiles extremos no son estables.`);
    /** @type {ResultadoBaremos} */
    const R = { general: { tabla: tablaBaremos(valores), categorias: categoriasPorPercentiles(valores, esquema.cortes, esquema.nombres) }, grupos: [], comparacion: null };
    /** @type {string[]} */ const avisos = [];
    if (grupo) {
        const nombres = [...new Set(pares.map(p => /** @type {string} */ (p.g)))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
        const porGrupo = nombres.map(nm => pares.filter(p => p.g === nm).map(p => p.v));
        if (nombres.length > MAX_GRUPOS) return error(`El grupo tiene demasiadas categorías (${nombres.length}).`);
        const chicos = nombres.filter((_, i) => /** @type {number[]} */ (porGrupo[i]).length < 30);
        if (chicos.length) avisos.push(`Grupos con menos de 30 personas (${chicos.join(', ')}): sus baremos serían inestables; se comparan, pero conviene un baremo general o más muestra.`);
        R.comparacion = decidirDiferenciados(porGrupo, AnalizadorEstadistico.alfaEstudio());
        // (2027.01.20, revisión) si difieren pero algún grupo es pequeño, no hay baremos propios estables: se dice así (antes,
        // el texto decía «no difirieron de forma relevante» con una diferencia significativa y mediana)
        if (chicos.length) { R.comparacion.diferenciados = false; R.comparacion.pequenos = chicos; }
        R.grupos = nombres.map((nombre, i) => ({ nombre, tabla: tablaBaremos(/** @type {number[]} */ (porGrupo[i])), categorias: categoriasPorPercentiles(/** @type {number[]} */ (porGrupo[i]), esquema.cortes, esquema.nombres) }));
    }
    /** @type {ContextoBaremos} */
    const ctx = { escala: etiqueta(escala), grupo: grupo ? etiqueta(grupo) : null, cortes: esquema.cortes, excluidos, alfa: AnalizadorEstadistico.alfaEstudio() };
    ultimo = { R, ctx };
    msj.innerHTML = [...(excluidos ? [`${excluidos} caso(s) sin puntuación${grupo ? ' o sin grupo' : ''} se excluyeron (n = ${valores.length}).`] : []), ...avisos].map(a => `<div class="aiken-avisos">${escaparHTML(a)}</div>`).join('');
    const tabla = (/** @type {{ titulo: string, cabecera: string[], filas: string[][], nota: string }} */ t) => `<h5 class="aiken-subtitulo">${escaparHTML(t.titulo)}</h5><div class="table-container" style="max-height:28rem; overflow:auto;"><table class="table"><thead><tr>${t.cabecera.map(h => `<th>${escaparHTML(h)}</th>`).join('')}</tr></thead><tbody>${t.filas.map(f => `<tr>${f.map(c => `<td>${escaparHTML(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="help-text"><em>Nota.</em> ${escaparHTML(t.nota)}</p>`;
    zona.innerHTML = `<h4 class="aiken-subtitulo aiken-titulo">Resultados: baremos de ${escaparHTML(ctx.escala)}</h4>
        ${R.comparacion ? `<p style="margin:0.2rem 0 0.4rem;"><b>${R.comparacion.diferenciados ? 'Baremos diferenciados' : R.comparacion.difieren ? 'Un baremo general (los grupos difieren, pero alguno es pequeño)' : 'Un baremo general'}.</b> <span class="help-text">${escaparHTML(`${R.comparacion.prueba}: ${R.comparacion.estadistico}; ${R.comparacion.efecto} (${R.comparacion.magnitud}).`)}</span></p>` : ''}
        ${tablasBaremos(R, ctx).map(tabla).join('')}
        <h5 class="aiken-subtitulo">Redacción para la tesis (APA 7)</h5><p class="aiken-parrafo" id="barParrafo">${escaparHTML(redactarBaremos(R, ctx))}</p>
        <details class="aiken-referencias"><summary>Referencias citadas</summary>${referenciasBaremos().map(x => `<p>${x}</p>`).join('')}</details>
        ${bloqueSintaxis(sintaxisBaremos({ escala, grupo, cortes: esquema.cortes }))}
        <div class="acciones-fila"><button type="button" id="barCSV" class="btn btn-outline">Descargar baremos (CSV)</button><button type="button" id="barWord" class="btn btn-primary">Descargar Word (APA 7)</button></div>`;
    zona.hidden = false;
    q('#barCSV').addEventListener('click', () => descargarArchivo('﻿' + csvBaremos(R), 'baremos.csv', 'text/csv'));
    q('#barWord').addEventListener('click', () => { void exportarWord(); });
    return R;
}

/** El Word de los últimos baremos. */
export async function exportarWord() {
    if (!ultimo) return null;
    return descargarWord(documentoWordBaremos(ultimo.R, ultimo.ctx), 'baremos_APA', 'Baremos exportados a Word (APA 7)');
}

/** Con otros datos, los baremos anteriores ya no valen. */
export function olvidarBaremos() {
    ultimo = null;
    if (!contenedor) return;
    q('#barResultados').hidden = true; q('#barResultados').innerHTML = ''; q('#barMensajes').innerHTML = '';
}

/** Monta la tarjeta en #baremosContainer (una vez). */
export function montarBaremos() {
    contenedor = typeof document !== 'undefined' ? document.getElementById('baremosContainer') : null;
    if (!contenedor || contenedor.dataset.montado === '1') return;
    contenedor.dataset.montado = '1';
    bus.on(EVENTOS.DATOS_CARGADOS, () => { olvidarBaremos(); actualizarVariables(); });
    contenedor.innerHTML = PLANTILLA();
    q('#barActualizar').addEventListener('click', actualizarVariables);
    q('#barCalcular').addEventListener('click', () => { calcular(); });
    actualizarVariables();
}

/** El último resultado. */
export function resultadoBaremos() { return ultimo; }
