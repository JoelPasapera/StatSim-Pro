// @ts-check
// analizador/relaciones/correlacion-parcial-ui.js — (2027.01.17) la tarjeta «9. Correlación parcial y semiparcial» del
// Analizador: la relación de X e Y descontando una o más variables de control (¿se debe la relación a una tercera?), con la
// regla de la vista principal (Pearson si las dos son normales; Spearman si no), su intervalo, las semiparciales, la
// redacción APA y el Word. La zona de resultados (#cpResultados) es la que se imprime.
import { AnalizadorEstadistico } from '../estadistica.js';
import { EtiquetasVariables } from '../../shared/etiquetas-variables.js';
import { bus, EVENTOS } from '../../shared/eventos.js';
import { escaparHTML } from '../../shared/html.js';
import { pConSigno } from '../../shared/formato-numero.js';
import { aNumero } from '../../core/data/celdas.js';
import { pruebaNormalidad } from '../../core/stats/normalidad.js';
import { correlacionParcial } from '../../core/stats/correlacion-parcial.js';
import { columnasCuantitativas } from '../motor/columnas.js';
import { tablaParcial, redactarParcial, referenciasParcial, documentoWordParcial } from './correlacion-parcial-redaccion.js';
import { descargarWord } from '../informe/word-apa.js';
import { sintaxisParcial, bloqueSintaxis } from '../informe/sintaxis.js';
import { conjuncionY } from '../../shared/texto-es.js';

/** @type {HTMLElement | null} */ let contenedor = null;
/** @type {{ r: NonNullable<ReturnType<typeof correlacionParcial>>, ctx: import('./correlacion-parcial-redaccion.js').ContextoParcial, alfa: number } | null} */ let ultimo = null;

const guia = (/** @type {string} */ t) => `<div class="orden-guia" role="note" style="margin:0 0 0.6rem;"><span class="orden-guia-titulo">Para qué sirve:</span><span class="orden-nota">${t}</span></div>`;
/** @returns {Record<string, unknown>[]} */
function datos() { try { return /** @type {Record<string, unknown>[]} */ (AnalizadorEstadistico.obtenerDatos() || []); } catch (e) { return []; } }
const etiqueta = (/** @type {string} */ c) => { try { return EtiquetasVariables.etiqueta(c); } catch (e) { return c; } };
/** @param {string} sel @returns {any} */
const q = sel => /** @type {HTMLElement} */ (contenedor).querySelector(sel);

const PLANTILLA = () => `
    <h3 class="card-title">9. Correlación parcial y semiparcial <span class="help-text" style="display:inline;">— opcional</span></h3>
    <p class="help-text">La relación entre dos variables descontando una o más de control: ¿se debe la relación a una tercera variable (la edad,
        el nivel socioeconómico)? La parcial correlaciona lo que de X y de Y no explican las de control; la semiparcial, cuánto aporta X por sí
        sola a Y.</p>
    <div class="rejilla-psico">
        <div class="form-group">
            ${guia('Las dos variables cuya relación quieres estudiar.')}
            <label for="cpX">Variable X</label><select id="cpX" class="input"><option value="">Carga una base primero</option></select>
            <label for="cpY" style="margin-top:0.5rem;">Variable Y</label><select id="cpY" class="input"><option value="">Carga una base primero</option></select>
            <span class="help-text">Variables cuantitativas (al menos tres valores distintos).</span>
        </div>
        <div class="form-group">
            ${guia('Las variables que podrían explicar la relación entre X e Y (las que se «descuentan»).')}
            <span class="label" id="cpControlesEtiqueta">Variables de control</span>
            <div id="cpControles" role="group" aria-labelledby="cpControlesEtiqueta" style="max-height:9rem; overflow:auto; border:1px solid var(--border-soft); border-radius:0.4rem; padding:0.4rem 0.6rem;"><span class="help-text">Carga una base para ver las variables.</span></div>
            <span class="help-text">Una o más. Se usan los casos con todas las variables.</span>
        </div>
        <div class="form-group">
            ${guia('Qué coeficiente usar: el de Pearson supone relaciones lineales y variables normales; el de Spearman trabaja con los rangos.')}
            <label for="cpMetodo">Coeficiente</label>
            <select id="cpMetodo" class="input"><option value="auto">Automático (recomendado)</option><option value="pearson">Pearson</option><option value="spearman">Spearman (rangos)</option></select>
            <span class="help-text">Automático: Pearson si X e Y son normales; Spearman si no (la regla de la vista principal).</span>
        </div>
    </div>
    <div class="acciones-fila"><button type="button" id="cpCalcular" class="btn btn-primary">Calcular la correlación parcial</button>
        <button type="button" id="cpActualizar" class="btn btn-outline" title="Actualizar con la base cargada" aria-label="Actualizar las variables">↻</button></div>
    <div id="cpMensajes" role="alert"></div>
    <div id="cpResultados" hidden></div>`;

/** Rehace los desplegables y la lista de control con la base cargada. */
export function actualizarVariables() {
    if (!contenedor) return;
    const cols = columnasCuantitativas(datos()).filter(c => c !== 'ID');
    const opciones = cols.map(c => `<option value="${escaparHTML(c)}">${escaparHTML(EtiquetasVariables.etiquetaConColumna ? EtiquetasVariables.etiquetaConColumna(c) : c)}</option>`).join('');
    for (const id of ['#cpX', '#cpY']) {
        const sel = q(id), previo = sel.value;
        sel.innerHTML = cols.length ? opciones : '<option value="">Carga una base primero</option>';
        if (cols.includes(previo)) sel.value = previo;
    }
    if (cols.length > 1 && q('#cpX').value === q('#cpY').value) q('#cpY').value = cols[1];
    const marcadas = new Set([...document.querySelectorAll('#cpControles input:checked')].map(x => /** @type {HTMLInputElement} */ (x).value));
    q('#cpControles').innerHTML = cols.length ? cols.map(c => `<label style="display:block;margin:0.15rem 0;cursor:pointer;"><input type="checkbox" value="${escaparHTML(c)}"${marcadas.has(c) ? ' checked' : ''} style="margin-right:0.4rem;">${escaparHTML(etiqueta(c))}</label>`).join('') : '<span class="help-text">Carga una base para ver las variables.</span>';
}

/** Calcula y muestra la correlación parcial. */
export function calcular() {
    if (!contenedor) return null;
    const msj = q('#cpMensajes'), zona = q('#cpResultados'), filas = datos();
    const error = (/** @type {string} */ t) => { msj.innerHTML = `<div class="aiken-errores"><strong>No se puede calcular:</strong> ${escaparHTML(t)}</div>`; zona.hidden = true; ultimo = null; return null; };
    if (!filas.length) return error('No hay una base cargada en el Analizador.');
    const x = q('#cpX').value, y = q('#cpY').value;
    if (!x || !y) return error('Elige las dos variables.');
    if (x === y) return error('X e Y deben ser variables distintas.');
    const controles = [...contenedor.querySelectorAll('#cpControles input:checked')].map(e => /** @type {HTMLInputElement} */ (e).value).filter(c => c !== x && c !== y);
    if (!controles.length) return error('Marca al menos una variable de control (distinta de X e Y).');
    const columnas = [x, y, ...controles];
    const completas = filas.map(f => columnas.map(c => aNumero(f[c]))).filter(v => v.every(Number.isFinite));
    const n = completas.length, excluidos = filas.length - n;
    if (n < controles.length + 4) return error(`Hacen falta al menos ${controles.length + 4} casos con todas las variables (hay ${n}).`);
    const col = (/** @type {number} */ j) => completas.map(v => /** @type {number} */ (v[j]));
    const metodo = q('#cpMetodo').value;
    const nx = pruebaNormalidad(col(0)), ny = pruebaNormalidad(col(1));
    const spearman = metodo === 'spearman' || (metodo === 'auto' && !(nx.normal && ny.normal));
    const motivo = metodo === 'auto'
        ? (spearman ? `con el coeficiente de Spearman porque ${!nx.normal ? etiqueta(x) : etiqueta(y)} no se ajusta a la normal (${(!nx.normal ? nx : ny).abreviatura}, p ${pConSigno((!nx.normal ? nx : ny).pValor)})` : `con el coeficiente de Pearson porque las dos variables se ajustan a la normal (${nx.abreviatura}, p ${pConSigno(nx.pValor)} y p ${pConSigno(ny.pValor)})`)
        : `con el coeficiente de ${spearman ? 'Spearman' : 'Pearson'} (elegido por quien analiza)`;
    const r = correlacionParcial(col(0), col(1), controles.map((_, i) => col(i + 2)), { spearman });
    if (!r) return error('Las variables de control explican del todo a X o a Y (o falta variación): no queda nada que correlacionar.');
    const alfa = AnalizadorEstadistico.alfaEstudio();
    const ctx = { x: etiqueta(x), y: etiqueta(y), controles: controles.map(etiqueta), excluidos, motivo };
    ultimo = { r, ctx, alfa };
    msj.innerHTML = excluidos ? `<div class="aiken-avisos">${excluidos} caso(s) con algún perdido se excluyeron (n = ${n}).</div>` : '';
    const t = tablaParcial(r, ctx, alfa);
    zona.innerHTML = `<h4 class="aiken-subtitulo aiken-titulo">Resultados: ${escaparHTML(ctx.x)} ${conjuncionY(ctx.y)} ${escaparHTML(ctx.y)}</h4>
        <h5 class="aiken-subtitulo">${escaparHTML(t.titulo)}</h5><div class="table-container"><table class="table"><thead><tr>${t.cabecera.map(h => `<th>${escaparHTML(h)}</th>`).join('')}</tr></thead><tbody>${t.filas.map((f, i) => `<tr${i === 1 ? ' style="font-weight:700;"' : ''}>${f.map(c => `<td>${escaparHTML(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        <p class="help-text"><em>Nota.</em> ${escaparHTML(t.nota)}</p>
        <h5 class="aiken-subtitulo">Redacción para la tesis (APA 7)</h5><p class="aiken-parrafo" id="cpParrafo">${escaparHTML(redactarParcial(r, ctx, alfa))}</p>
        <details class="aiken-referencias"><summary>Referencias citadas</summary>${referenciasParcial(r).map(x => `<p>${x}</p>`).join('')}</details>
        ${bloqueSintaxis(sintaxisParcial({ x, y, controles, spearman }))}
        <div class="acciones-fila"><button type="button" id="cpWord" class="btn btn-primary">Descargar Word (APA 7)</button></div>`;
    zona.hidden = false;
    q('#cpWord').addEventListener('click', () => { void exportarWord(); });
    return r;
}

/** El Word del último cálculo. */
export async function exportarWord() {
    if (!ultimo) return null;
    return descargarWord(documentoWordParcial(ultimo.r, ultimo.ctx, ultimo.alfa), 'correlacion_parcial_APA', 'Correlación parcial exportada a Word (APA 7)');
}

/** Con otros datos, el resultado anterior ya no vale. */
export function olvidarParcial() {
    ultimo = null;
    if (!contenedor) return;
    q('#cpResultados').hidden = true; q('#cpResultados').innerHTML = ''; q('#cpMensajes').innerHTML = '';
}

/** Monta la tarjeta en #parcialContainer (una vez). */
export function montarParcial() {
    contenedor = typeof document !== 'undefined' ? document.getElementById('parcialContainer') : null;
    if (!contenedor || contenedor.dataset.montado === '1') return;
    contenedor.dataset.montado = '1';
    bus.on(EVENTOS.DATOS_CARGADOS, () => { olvidarParcial(); actualizarVariables(); });
    contenedor.innerHTML = PLANTILLA();
    for (const id of ['#cpX', '#cpY']) q(id).addEventListener('focus', () => { if (q(id).options.length <= 1) actualizarVariables(); });
    q('#cpActualizar').addEventListener('click', actualizarVariables);
    q('#cpCalcular').addEventListener('click', () => { calcular(); });
    actualizarVariables();
}

/** El último resultado. */
export function resultadoParcial() { return ultimo; }
