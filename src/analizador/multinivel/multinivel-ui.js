// @ts-check
// analizador/multinivel/multinivel-ui.js — (2027.01.19) la tarjeta «15. Modelos multinivel (intercepto aleatorio)» del
// Analizador: una variable dependiente, la agrupación (el colegio, el aula, el hospital…) y, si se quiere, predictores de
// nivel 1 (de la persona) y de nivel 2 (del grupo, que se reconocen solos: constantes dentro de cada grupo), con su centrado.
// Ajusta el modelo nulo (la CCI y el efecto de diseño: ¿hace falta el modelo multinivel?) y el de los predictores, y muestra
// los efectos fijos, las varianzas, la redacción APA, la sintaxis de R y SPSS y el Word. La zona de resultados
// (#mnResultados) es la que se imprime. El cálculo es rápido (una sola dimensión que optimizar): en el hilo principal.
import { AnalizadorEstadistico } from '../estadistica.js';
import { EtiquetasVariables } from '../../shared/etiquetas-variables.js';
import { bus, EVENTOS } from '../../shared/eventos.js';
import { escaparHTML } from '../../shared/html.js';
import { listaY } from '../../shared/texto-es.js';
import { aNumero, esPerdido } from '../../core/data/celdas.js';
import { columnasCuantitativas } from '../motor/columnas.js';
import { ajustarInterceptoAleatorio } from '../../core/stats/multinivel.js';
import { pChiCuadrado } from '../../core/stats/distribuciones.js';
import { tablaEfectosFijos, tablaVarianzas, redactarMultinivel, referenciasMultinivel, documentoWordMultinivel, nombrePredictor, GRUPOS_RECOMENDADOS } from './multinivel-redaccion.js';
import { sintaxisMultinivel, bloqueSintaxis } from '../informe/sintaxis.js';
import { descargarWord } from '../informe/word-apa.js';

/** @typedef {import('./multinivel-redaccion.js').AjusteMultinivel} AjusteMultinivel */
/** @typedef {import('./multinivel-redaccion.js').ContextoMultinivel} ContextoMultinivel */
/** @typedef {import('./multinivel-redaccion.js').Predictor} Predictor */
/** @typedef {import('./multinivel-redaccion.js').Centrado} Centrado */

/** @type {HTMLElement | null} */ let contenedor = null;
/** @type {{ A: AjusteMultinivel, ctx: ContextoMultinivel } | null} */ let ultimo = null;

/** Lo que admite la tarjeta: los grupos (con códigos de texto; con códigos numéricos, al menos 10, para no ofrecer los ítems de una escala), los predictores. */
export const LIMITES_MULTINIVEL = Object.freeze({ minGrupos: 3, minGruposNumericos: 10, maxPredictores: 12 });

const guia = (/** @type {string} */ t) => `<div class="orden-guia" role="note" style="margin:0 0 0.6rem;"><span class="orden-guia-titulo">Para qué sirve:</span><span class="orden-nota">${t}</span></div>`;
/** @returns {Record<string, unknown>[]} */
function datos() { try { return /** @type {Record<string, unknown>[]} */ (AnalizadorEstadistico.obtenerDatos() || []); } catch (e) { return []; } }
const etiqueta = (/** @type {string} */ c) => { try { return EtiquetasVariables.etiqueta(c); } catch (e) { return c; } };
/** @param {string} sel @returns {any} */
const q = sel => /** @type {HTMLElement} */ (contenedor).querySelector(sel);

const PLANTILLA = () => `
    <h3 class="card-title">15. Modelos multinivel (intercepto aleatorio) <span class="help-text" style="display:inline;">— opcional</span></h3>
    <p class="help-text">Cuando las personas están agrupadas (estudiantes en aulas, pacientes en hospitales, trabajadores en empresas), las de un mismo
        grupo se parecen entre sí y los errores típicos de una regresión común salen demasiado pequeños. El modelo multinivel separa la variación
        entre grupos de la variación dentro de ellos y da los efectos de los predictores con sus errores correctos.</p>
    <div class="rejilla-psico">
        <div class="form-group">
            ${guia('Lo que quieres explicar: una variable numérica de cada persona (un puntaje, el rendimiento…).')}
            <label for="mnY">Variable dependiente</label>
            <select id="mnY" class="input"><option value="">Carga una base primero</option></select>
            <span class="help-text">Numérica; los casos sin ella, o sin algún predictor o grupo, quedan fuera.</span>
        </div>
        <div class="form-group">
            ${guia('La variable que dice a qué grupo pertenece cada persona (el código del aula o del colegio).')}
            <label for="mnGrupo">Agrupación (nivel 2)</label>
            <select id="mnGrupo" class="input"><option value="">Carga una base primero</option></select>
            <span class="help-text">Mejor más de ${GRUPOS_RECOMENDADOS} grupos: con menos, los errores típicos de nivel 2 se subestiman (Maas y Hox, 2005). Una agrupación con códigos numéricos se ofrece si tiene al menos 10 grupos (con menos, suele ser una escala o un ítem).</span>
        </div>
        <div class="form-group">
            ${guia('Las variables con las que explicas la dependiente; sin ninguna, solo el modelo nulo (la CCI).')}
            <span class="label" id="mnPredEtiqueta">Predictores (opcional)</span>
            <div id="mnPredictores" role="group" aria-labelledby="mnPredEtiqueta" style="max-height:8rem; overflow:auto; border:1px solid var(--border-soft); border-radius:0.4rem; padding:0.4rem 0.6rem;"></div>
            <span class="help-text">Los que no cambian dentro de un grupo (el tamaño del colegio, su tipo) se reconocen como de nivel 2.</span>
        </div>
        <div class="form-group">
            ${guia('Cómo centrar los predictores de la persona: en la media de su grupo separa su efecto dentro del grupo del efecto del grupo.')}
            <label for="mnCentrado">Centrado de los predictores de nivel 1</label>
            <select id="mnCentrado" class="input"><option value="grupo">En su grupo (recomendado)</option><option value="gran-media">En la gran media</option><option value="ninguno">Sin centrar</option></select>
            <label style="display:block; margin-top:0.5rem; font-weight:normal;"><input type="checkbox" id="mnMedias" checked style="margin-right:0.4rem;">Añadir la media de cada grupo (el efecto entre grupos)</label>
            <span class="help-text">Los de nivel 2 se centran en la gran media (salvo «sin centrar»). Enders y Tofighi (2007).</span>
        </div>
    </div>
    <div class="acciones-fila"><button type="button" id="mnCalcular" class="btn btn-primary">Ajustar el modelo</button>
        <button type="button" id="mnActualizar" class="btn btn-outline" title="Actualizar con la base cargada" aria-label="Actualizar las variables">↻</button></div>
    <div id="mnMensajes" role="alert"></div>
    <div id="mnResultados" hidden></div>`;

/**
 * Las columnas que pueden agrupar: de texto, con al menos 3 grupos, o enteras, con al menos 10 (con menos, son más bien las
 * respuestas a un ítem); y una media de al menos 2 personas por grupo. Primero las de texto y, en cada clase, las de más grupos.
 * @param {Record<string, unknown>[]} filas
 * @param {string[]} [excluir]
 * @returns {{ columna: string, grupos: number, porGrupo: number }[]}
 */
export function candidatosAgrupacion(filas, excluir = []) {
    if (!filas.length) return [];
    /** @type {{ columna: string, grupos: number, porGrupo: number, texto: boolean }[]} */ const salida = [];
    for (const c of Object.keys(/** @type {Record<string, unknown>} */ (filas[0]))) {
        if (c === 'ID' || excluir.includes(c)) continue;
        /** @type {Set<string>} */ const vistos = new Set();
        let validos = 0, texto = false, sirve = true;
        for (const f of filas) {
            const v = f[c];
            if (esPerdido(v)) continue;
            validos++;
            const x = aNumero(v);
            if (Number.isFinite(x)) { if (!Number.isInteger(x)) { sirve = false; break; } } else texto = true;
            vistos.add(String(v).trim());
        }
        if (sirve && vistos.size >= (texto ? LIMITES_MULTINIVEL.minGrupos : LIMITES_MULTINIVEL.minGruposNumericos) && vistos.size <= validos / 2) salida.push({ columna: c, grupos: vistos.size, porGrupo: validos / vistos.size, texto });
    }
    return salida.sort((a, b) => Number(b.texto) - Number(a.texto) || b.grupos - a.grupos).map(({ columna, grupos, porGrupo }) => ({ columna, grupos, porGrupo }));
}

/** Rehace los desplegables y la lista de predictores con la base cargada. */
export function actualizarVariables() {
    if (!contenedor) return;
    const filas = datos(), selY = q('#mnY'), selG = q('#mnGrupo'), previoY = selY.value, previoG = selG.value;
    if (!filas.length) { selY.innerHTML = '<option value="">Carga una base primero</option>'; selG.innerHTML = selY.innerHTML; q('#mnPredictores').innerHTML = '<span class="help-text">Carga una base para ver las variables.</span>'; return; }
    const numericas = columnasCuantitativas(filas).filter(c => c !== 'ID'), grupos = candidatosAgrupacion(filas);
    selY.innerHTML = numericas.length ? numericas.map(c => `<option value="${escaparHTML(c)}">${escaparHTML(etiqueta(c))}</option>`).join('') : '<option value="">No hay variables numéricas</option>';
    if ([...selY.options].some((/** @type {HTMLOptionElement} */ o) => o.value === previoY)) selY.value = previoY;
    selG.innerHTML = grupos.length ? grupos.map(g => `<option value="${escaparHTML(g.columna)}" title="${escaparHTML(`${g.porGrupo.toFixed(1)} personas por grupo de media`)}">${escaparHTML(`${etiqueta(g.columna)} · ${g.grupos} grupos`)}</option>`).join('') : '<option value="">Ninguna variable agrupa a los casos</option>';
    if ([...selG.options].some((/** @type {HTMLOptionElement} */ o) => o.value === previoG)) selG.value = previoG;
    const marcadas = new Set([...q('#mnPredictores').querySelectorAll('input:checked')].map((/** @type {HTMLInputElement} */ x) => x.value));
    q('#mnPredictores').innerHTML = numericas.length ? numericas.map(c => `<label style="display:block;margin:0.15rem 0;cursor:pointer;"><input type="checkbox" value="${escaparHTML(c)}"${marcadas.has(c) ? ' checked' : ''} style="margin-right:0.4rem;">${escaparHTML(etiqueta(c))}</label>`).join('') : '<span class="help-text">No hay variables numéricas.</span>';
}

/** @param {string[]} errores @param {string[]} [avisos] */
function mensajes(errores, avisos = []) {
    const bloque = (/** @type {string} */ clase, /** @type {string} */ titulo, /** @type {string[]} */ xs) => (xs.length ? `<div class="${clase}"><strong>${titulo}</strong><ul>${xs.map(x => `<li>${escaparHTML(x)}</li>`).join('')}</ul></div>` : '');
    q('#mnMensajes').innerHTML = bloque('aiken-errores', 'No se puede ajustar:', errores) + bloque('aiken-avisos', 'Ten en cuenta:', avisos);
}

/**
 * Las columnas de los predictores, centradas, con su nivel; y la media de grupo de los de nivel 1, si se pide.
 * @param {Float64Array[]} columnas
 * @param {Int32Array} grupo el índice del grupo de cada caso
 * @param {number} G
 * @param {{ nombre: string, columna: string }[]} elegidos
 * @param {Centrado} centrado
 * @param {boolean} medias
 * @returns {{ valores: Float64Array[], predictores: Predictor[] }}
 */
export function prepararPredictores(columnas, grupo, G, elegidos, centrado, medias) {
    const n = grupo.length, cuenta = new Float64Array(G);
    for (let i = 0; i < n; i++) cuenta[/** @type {number} */ (grupo[i])] = /** @type {number} */ (cuenta[/** @type {number} */ (grupo[i])]) + 1;
    const mediaGlobal = (/** @type {Float64Array} */ x) => { let s = 0; for (const v of x) s += v; return s / x.length; };
    /** @type {Float64Array[]} */ const valores = [];
    /** @type {Predictor[]} */ const predictores = [];
    /** @type {Predictor[]} */ const deGrupo = [];
    /** @type {Float64Array[]} */ const valoresDeGrupo = [];
    columnas.forEach((x, k) => {
        const e = /** @type {{ nombre: string, columna: string }} */ (elegidos[k]);
        const suma = new Float64Array(G), min = new Float64Array(G).fill(Infinity), max = new Float64Array(G).fill(-Infinity);
        for (let i = 0; i < n; i++) { const g = /** @type {number} */ (grupo[i]), v = /** @type {number} */ (x[i]); suma[g] = /** @type {number} */ (suma[g]) + v; if (v < /** @type {number} */ (min[g])) min[g] = v; if (v > /** @type {number} */ (max[g])) max[g] = v; }
        let nivel2 = true;
        for (let g = 0; g < G; g++) if (/** @type {number} */ (max[g]) - /** @type {number} */ (min[g]) > 1e-12 * Math.max(1, Math.abs(/** @type {number} */ (max[g])))) { nivel2 = false; break; }
        const mg = Float64Array.from(suma, (s, g) => s / /** @type {number} */ (cuenta[g])), m = mediaGlobal(x);
        if (nivel2) {
            const c = centrado === 'ninguno' ? 'ninguno' : 'gran-media';
            valores.push(c === 'ninguno' ? Float64Array.from(x) : Float64Array.from(x, v => v - m));
            predictores.push({ nombre: e.nombre, columna: e.columna, centrado: c, nivel: 2 });
            return;
        }
        valores.push(centrado === 'grupo' ? Float64Array.from(x, (v, i) => v - /** @type {number} */ (mg[/** @type {number} */ (grupo[i])])) : centrado === 'gran-media' ? Float64Array.from(x, v => v - m) : Float64Array.from(x));
        predictores.push({ nombre: e.nombre, columna: e.columna, centrado, nivel: 1 });
        if (medias && centrado === 'grupo') {
            valoresDeGrupo.push(Float64Array.from(grupo, g => /** @type {number} */ (mg[g]) - m));
            deGrupo.push({ nombre: e.nombre, columna: e.columna, centrado: /** @type {Centrado} */ ('gran-media'), nivel: /** @type {2} */ (2), mediaDeGrupo: true });
        }
    });
    return { valores: [...valores, ...valoresDeGrupo], predictores: [...predictores, ...deGrupo] };
}

/** Ajusta el modelo nulo y el de los predictores y los muestra. @returns {AjusteMultinivel | null} */
export function calcular() {
    if (!contenedor) return null;
    const filas = datos(), zona = q('#mnResultados');
    const error = (/** @type {string} */ t) => { mensajes([t]); zona.hidden = true; ultimo = null; return null; };
    if (!filas.length) return error('No hay una base cargada en el Analizador.');
    const y = q('#mnY').value, grupo = q('#mnGrupo').value;
    if (!y) return error('Elige la variable dependiente.');
    if (!grupo) return error('Elige la variable de agrupación.');
    if (y === grupo) return error('La dependiente y la agrupación deben ser variables distintas.');
    const elegidas = [...q('#mnPredictores').querySelectorAll('input:checked')].map((/** @type {HTMLInputElement} */ x) => x.value).filter(c => c !== y && c !== grupo);
    if (elegidas.length > LIMITES_MULTINIVEL.maxPredictores) return error(`Como mucho ${LIMITES_MULTINIVEL.maxPredictores} predictores.`);
    // los casos completos (listwise) en la dependiente, los predictores y el grupo
    const usadas = filas.filter(f => Number.isFinite(aNumero(f[y])) && !esPerdido(f[grupo]) && elegidas.every(c => Number.isFinite(aNumero(f[c]))));
    const excluidos = filas.length - usadas.length;
    /** @type {Map<string, number>} */ const codigos = new Map();
    const indice = Int32Array.from(usadas, f => { const k = String(f[grupo]).trim(); if (!codigos.has(k)) codigos.set(k, codigos.size); return /** @type {number} */ (codigos.get(k)); });
    const G = codigos.size;
    if (G < LIMITES_MULTINIVEL.minGrupos) return error(`Hacen falta al menos ${LIMITES_MULTINIVEL.minGrupos} grupos con casos (hay ${G}).`);
    if (usadas.length < G + elegidas.length + 3) return error(`Muy pocos casos (${usadas.length}) para ${G} grupos y ${elegidas.length} predictores.`);
    const Y = Float64Array.from(usadas, f => aNumero(f[y]));
    const centrado = /** @type {Centrado} */ (q('#mnCentrado').value), medias = !!q('#mnMedias').checked;
    const { valores, predictores } = prepararPredictores(elegidas.map(c => Float64Array.from(usadas, f => aNumero(f[c]))), indice, G, elegidas.map(c => ({ nombre: etiqueta(c), columna: c })), centrado, medias);
    const sinVariacion = predictores.filter((p, k) => { const v = /** @type {Float64Array} */ (valores[k]); let mn = Infinity, mx = -Infinity; for (const x of v) { if (x < mn) mn = x; if (x > mx) mx = x; } return !(mx - mn > 1e-12); });
    if (sinVariacion.length) return error(`Sin variación: ${sinVariacion.map(nombrePredictor).join(', ')}.`);
    // (2027.01.20) lo que no se puede ajustar lo dice el núcleo: los predictores colineales, ningún grupo con dos casos, la
    // dependiente sin variación dentro de los grupos
    const nulo = ajustarInterceptoAleatorio(Y, [], indice);
    if ('error' in nulo) return error(`El modelo no se pudo ajustar. ${nulo.error}`);
    const completo = valores.length ? ajustarInterceptoAleatorio(Y, valores, indice) : null;
    if (completo && 'error' in completo) return error(`El modelo con los predictores no se pudo ajustar. ${completo.error}`);
    const comparacion = completo ? (() => { const chi2 = Math.max(0, 2 * (completo.ml - nulo.ml)), gl = completo.p - nulo.p; return { chi2, gl, pValor: pChiCuadrado(chi2, gl) }; })() : null;
    /** @type {AjusteMultinivel} */ const A = { nulo, completo, comparacion };
    /** @type {ContextoMultinivel} */
    const ctx = { y: etiqueta(y), grupo: etiqueta(grupo), predictores, excluidos, alfa: AnalizadorEstadistico.alfaEstudio(), nivel: 0.95 };
    ultimo = { A, ctx };
    /** @type {string[]} */ const avisos = [];
    if (excluidos) avisos.push(`${excluidos} caso(s) sin la dependiente, sin grupo o sin algún predictor quedan fuera (N = ${usadas.length}).`);
    if (G <= GRUPOS_RECOMENDADOS) avisos.push(`Con ${G} grupos (${GRUPOS_RECOMENDADOS} o menos), los errores típicos de nivel 2 pueden estar subestimados (Maas y Hox, 2005): interpreta con cautela los efectos de nivel 2 y la varianza entre grupos.`);
    if (!(nulo.s2u > 0)) avisos.push('La varianza entre grupos es cero en el modelo nulo: los grupos no se diferencian y una regresión común da lo mismo.');
    const deNivel2 = predictores.filter(p => p.nivel === 2 && !p.mediaDeGrupo);
    if (deNivel2.length && centrado === 'grupo') avisos.push(deNivel2.length === 1 ? `${deNivel2[0].nombre} es de nivel 2 (constante en cada grupo): se centró en la gran media, no en su grupo.` : `${listaY(deNivel2.map(p => p.nombre))} son de nivel 2 (constantes en cada grupo): se centraron en la gran media, no en su grupo.`);
    mensajes([], avisos.filter(Boolean));
    pintar(y, grupo);
    return A;
}

/** Una tabla en HTML. @param {{ titulo: string, cabecera: string[], filas: string[][], nota: string }} t */
const tabla = t => `<h5 class="aiken-subtitulo">${escaparHTML(t.titulo)}</h5><div class="table-container"><table class="table"><thead><tr>${t.cabecera.map(h => `<th>${escaparHTML(h)}</th>`).join('')}</tr></thead><tbody>${t.filas.map(f => `<tr>${f.map(c => `<td>${escaparHTML(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="help-text"><em>Nota.</em> ${escaparHTML(t.nota)}</p>`;

/** Pinta el último resultado. @param {string} y la columna dependiente @param {string} grupo la de agrupación */
function pintar(y, grupo) {
    if (!contenedor || !ultimo) return;
    const { A, ctx } = ultimo, zona = q('#mnResultados');
    const propios = ctx.predictores.filter(p => !p.mediaDeGrupo);
    zona.innerHTML = `<h4 class="aiken-subtitulo aiken-titulo">Resultados: ${escaparHTML(ctx.y)} en ${A.nulo.G} grupos de ${escaparHTML(ctx.grupo)}</h4>
        <p style="margin:0.2rem 0 0.4rem;"><b>CCI = ${escaparHTML(A.nulo.icc.toFixed(3).replace(/^0\./, '.'))}; efecto de diseño = ${escaparHTML(A.nulo.efectoDiseno.toFixed(2))}.</b> <span class="help-text">El ${escaparHTML((100 * A.nulo.icc).toFixed(1))} % de la varianza está entre los grupos.</span></p>
        ${A.completo ? tabla(tablaEfectosFijos(A.completo, ctx)) : ''}${tabla(tablaVarianzas(A, ctx))}
        <h5 class="aiken-subtitulo">Redacción para la tesis (APA 7)</h5><p class="aiken-parrafo" id="mnParrafo">${escaparHTML(redactarMultinivel(A, ctx))}</p>
        <details class="aiken-referencias"><summary>Referencias citadas</summary>${referenciasMultinivel(A, ctx).map(x => `<p>${x}</p>`).join('')}</details>
        ${bloqueSintaxis(sintaxisMultinivel({ y, grupo, predictores: propios.map(p => p.columna), centrado: propios.map(p => p.centrado), medias: ctx.predictores.filter(p => p.mediaDeGrupo).map(p => p.columna) }))}
        <div class="acciones-fila"><button type="button" id="mnWord" class="btn btn-primary">Descargar Word (APA 7)</button></div>`;
    zona.hidden = false;
    q('#mnWord').addEventListener('click', () => { void exportarWord(); });
}

/** El Word del último ajuste. */
export async function exportarWord() {
    if (!ultimo) return null;
    return descargarWord(documentoWordMultinivel(ultimo.A, ultimo.ctx), 'multinivel_APA', 'Modelo multinivel exportado a Word (APA 7)');
}

/** Con otros datos, el ajuste anterior ya no vale. */
export function olvidarMultinivel() {
    ultimo = null;
    if (!contenedor) return;
    q('#mnResultados').hidden = true; q('#mnResultados').innerHTML = ''; q('#mnMensajes').innerHTML = '';
}

/** Monta la tarjeta en #multinivelContainer (una vez). */
export function montarMultinivel() {
    contenedor = typeof document !== 'undefined' ? document.getElementById('multinivelContainer') : null;
    if (!contenedor || contenedor.dataset.montado === '1') return;
    contenedor.dataset.montado = '1';
    bus.on(EVENTOS.DATOS_CARGADOS, () => { olvidarMultinivel(); actualizarVariables(); });
    contenedor.innerHTML = PLANTILLA();
    q('#mnCentrado').addEventListener('change', () => { q('#mnMedias').disabled = q('#mnCentrado').value !== 'grupo'; });
    q('#mnActualizar').addEventListener('click', actualizarVariables);
    q('#mnCalcular').addEventListener('click', () => { calcular(); });
    actualizarVariables();
}

/** El último resultado. */
export function resultadoMultinivel() { return ultimo; }
