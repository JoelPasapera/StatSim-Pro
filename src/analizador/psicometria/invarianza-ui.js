// analizador/psicometria/invarianza-ui.js — tarjeta «Invarianza de medición» del Analizador (AFC multigrupo por ML).
import { AnalizadorEstadistico } from '../estadistica.js';
import { SEM } from '../sem-motor.js';
import { ejecutarTarea } from './servicio-psicometrico.js';
import { CABECERA_AJUSTE, filasAjuste, notaAjuste, CABECERA_COMPARACIONES, filasComparaciones, notaComparaciones, CABECERA_MEDIAS, filasMedias, notaMedias, redactarParrafo, referenciasInvarianza, documentoWord } from './invarianza-redaccion.js';
import { mostrarToast } from '../../shared/toast.js';
import { descargarBlob } from '../../shared/descargas.js';
import { asegurarHtmlDocx } from '../../shared/vendor.js';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const guia = t => `<div class="orden-guia" role="note" style="margin:0 0 0.6rem;"><span class="orden-guia-titulo">Para qué sirve:</span><span class="orden-nota">${t}</span></div>`;
let contenedor = null, ultimo = null;
function datos() { try { return AnalizadorEstadistico.obtenerDatos() || []; } catch (e) { return []; } }

// Variables de agrupación: columnas con 2 a 8 valores distintos y al menos 10 casos en cada uno
export function variablesDeGrupo(filas, excluir = []) {
    if (!filas.length) return [];
    const columnas = Object.keys(filas[0]), fuera = new Set(excluir), prefijos = new Map();
    for (const c of columnas) { const m = /^(.*?)\d+$/.exec(c); if (m) prefijos.set(m[1], (prefijos.get(m[1]) || 0) + 1); }
    const esItem = c => { const m = /^(.*?)\d+$/.exec(c); return !!m && prefijos.get(m[1]) >= 3; };   // PE1, PE2, PE3… son ítems
    return columnas.filter(c => !fuera.has(c) && !esItem(c)).filter(c => {
        const cuenta = new Map();
        for (const f of filas) { const v = f[c]; if (v === '' || v === null || v === undefined) continue; cuenta.set(String(v), (cuenta.get(String(v)) || 0) + 1); if (cuenta.size > 8) return false; }
        return cuenta.size >= 2 && [...cuenta.values()].every(n => n >= 10);
    });
}

const PLANTILLA = () => `
    <h3 class="card-title">6. Invarianza de medición <span class="help-text" style="display:inline;">— opcional</span></h3>
    <p class="help-text">Comprueba si el instrumento mide lo mismo, y en la misma escala, en distintos grupos (p. ej., mujeres y varones)
        antes de comparar sus medias: AFC multigrupo configural, métrico, escalar y, si se pide, estricto.</p>
    <div class="form-group">
        ${guia('Describir el modelo de medida: qué ítems forman cada factor (el mismo que pondrías a prueba en el AFC).')}
        <label for="invSintaxis">Modelo de medida</label>
        <textarea id="invSintaxis" class="input" rows="4" style="font-family:monospace;" placeholder="Factor1 =~ item1 + item2 + item3&#10;Factor2 =~ item4 + item5 + item6"></textarea>
        <div class="acciones-fila" style="margin-top:0.3rem;"><button type="button" id="invDelSEM" class="btn btn-outline">Usar el modelo escrito en la sección SEM</button></div>
        <span class="help-text">Solo factores (=~) y covarianzas residuales (~~); la primera carga de cada factor se fija en 1.</span>
    </div>
    <div class="rejilla-psico">
        <div class="form-group">
            ${guia('Elegir los grupos que se comparan.')}
            <label for="invGrupo">Variable de agrupación</label>
            <div style="display:flex; gap:0.5rem;"><select id="invGrupo" class="input"><option value="">Carga una base primero</option></select>
                <button type="button" id="invActualizar" class="btn btn-outline" title="Actualizar con la base cargada" aria-label="Actualizar la lista de variables">↻</button></div>
            <span class="help-text">Variables con 2 a 8 grupos y al menos 10 casos por grupo; el primer grupo es la referencia.</span>
        </div>
        <div class="form-group">
            ${guia('Elegir cómo se estima según el tipo de respuesta de los ítems.')}
            <label for="invEstimador">Estimador</label>
            <select id="invEstimador" class="input"><option value="ML">ML (puntuaciones continuas)</option><option value="WLSMV">WLSMV (ítems ordinales, 3 a 10 categorías)</option></select>
            <span class="help-text">WLSMV sigue la secuencia de Wu y Estabrook (2016): configural, umbrales, métrica y escalar; compara niveles con DIFFTEST.</span>
        </div>
        <div class="form-group">
            ${guia('Evitar que una categoría que nadie eligió en algún grupo detenga el análisis ordinal.')}
            <label class="label" style="display:flex;gap:0.5rem;align-items:center;font-weight:normal;"><input type="checkbox" id="invAgrupar" checked disabled> Agrupar las categorías sin respuestas en algún grupo con la contigua (en todos los grupos)</label>
            <span class="help-text">Solo con WLSMV: los umbrales de una categoría vacía no pueden compararse; cada agrupación se informa en los avisos y se declara en el párrafo.</span>
        </div>
        <div class="form-group">
            ${guia('Decidir si también se exige que los errores de medida sean iguales.')}
            <label class="label" style="display:flex;gap:0.5rem;align-items:center;font-weight:normal;"><input type="checkbox" id="invEstricta"> Incluir la invarianza estricta (residuos)</label>
            <span class="help-text">No hace falta para comparar medias latentes; sí para comparar puntuaciones observadas con la misma fiabilidad.</span>
        </div>
    </div>
    <div class="acciones-fila"><button type="button" id="invCalcular" class="btn btn-primary">Evaluar la invarianza</button>
        <button type="button" id="invCancelar" class="btn btn-outline" hidden>Cancelar</button></div>
    <div id="invProgresoFila" hidden><progress id="invProgreso" max="100" value="0" style="width:100%;"></progress><span id="invEstado" class="help-text" role="status"></span></div>
    <div id="invMensajes" role="alert"></div>
    <div id="invResultados" hidden></div>`;

export function actualizarGrupos() {
    if (!contenedor) return;
    let indicadores = [];
    try { indicadores = Object.values(SEM.parsear(contenedor.querySelector('#invSintaxis').value).latentes || {}).flat(); } catch (e) { /* sintaxis aún incompleta */ }
    const sel = contenedor.querySelector('#invGrupo'), previo = sel.value, filas = datos(), vars = variablesDeGrupo(filas, indicadores);
    sel.innerHTML = !filas.length ? '<option value="">Carga una base primero</option>' : vars.length ? vars.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('') : '<option value="">No hay variables de agrupación válidas</option>';
    if ([...sel.options].some(o => o.value === previo)) sel.value = previo;
}

function tablaHTML(cab, filas, nota) {
    return `<div class="table-container"><table class="table"><thead><tr>${cab.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${filas.map(f => `<tr>${f.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="help-text"><em>Nota.</em> ${esc(nota)}</p>`;
}

export function calcular() {
    const msj = contenedor.querySelector('#invMensajes'), zona = contenedor.querySelector('#invResultados'), filas = datos();
    const error = t => { msj.innerHTML = `<div class="aiken-errores"><strong>No se puede evaluar:</strong> ${esc(t)}</div>`; zona.hidden = true; ultimo = null; return null; };
    if (!filas.length) return error('No hay una base cargada en el Analizador.');
    const grupo = contenedor.querySelector('#invGrupo').value;
    if (!grupo) return error('Elige la variable de agrupación.');
    let modelo;
    try { modelo = SEM.parsear(contenedor.querySelector('#invSintaxis').value); } catch (e) { return error(e.message); }
    // El cálculo va al Worker (canal propio): la página no se congela; sin Worker, el mismo cálculo en el hilo principal
    const items = [...new Set(Object.values(modelo.latentes || {}).flat())], columnas = [...items.filter(c => c in filas[0]), grupo];
    const ligeras = filas.map(f => Object.fromEntries(columnas.map(c => [c, f[c]])));
    const q = s => contenedor.querySelector(s);
    q('#invCalcular').disabled = true; q('#invCancelar').hidden = false; q('#invProgresoFila').hidden = false; q('#invProgreso').value = 0; q('#invEstado').textContent = 'Preparando…';
    msj.innerHTML = '';
    const estimador = q('#invEstimador').value, estricta = estimador === 'ML' && q('#invEstricta').checked;
    const nombres = estimador === 'WLSMV' ? ['configural', 'de umbrales', 'métrico', 'escalar'] : ['configural', 'métrico', 'escalar', 'estricto'].slice(0, estricta ? 4 : 3);
    const agrupar = estimador === 'WLSMV' && q('#invAgrupar').checked;
    const tarea = ejecutarTarea('invarianza', [{ clave: 'inv', modelo, filas: ligeras, variableGrupo: grupo }], { estricta, estimador, agrupar }, (k, total) => {
        q('#invProgreso').value = Math.round((100 * k) / total);
        q('#invEstado').textContent = k < total ? `Estimando el modelo ${nombres[k]}… (${k + 1} de ${total})` : 'Terminando…';
    });
    q('#invCancelar').onclick = () => tarea.cancelar();
    const terminar = () => { q('#invCalcular').disabled = false; q('#invCancelar').hidden = true; q('#invProgresoFila').hidden = true; };
    return tarea.promesa.then(lista => { terminar(); return pintar(lista[0].resultado, grupo); }, e => { terminar(); return error(e && e.cancelado ? 'Cálculo cancelado.' : String(e && e.message || e)); });
}

function pintar(r, grupo) {
    const msj = contenedor.querySelector('#invMensajes'), zona = contenedor.querySelector('#invResultados');
    if (r.error) { msj.innerHTML = `<div class="aiken-errores"><strong>No se puede evaluar:</strong> ${esc(r.error)}</div>`; zona.hidden = true; ultimo = null; return null; }
    ultimo = r;
    const avisos = [];
    if (r.excluidos) avisos.push(`${r.excluidos} caso(s) sin grupo o con ítems vacíos se excluyeron (N = ${r.N}).`);
    r.niveles.filter(R => !R.convergio).forEach(R => avisos.push(`El modelo ${R.nombre.toLowerCase()} no convergió: interprétalo con cautela.`));
    r.niveles.filter(R => R.heywood.length).forEach(R => avisos.push(`Modelo ${R.nombre.toLowerCase()}: varianzas negativas (caso Heywood) en ${R.heywood.slice(0, 4).join(', ')}.`));
    if (r.grupos.some(g => g.n < (r.estimador === 'WLSMV' ? 200 : 100))) avisos.push(`Algún grupo tiene menos de ${r.estimador === 'WLSMV' ? 200 : 100} casos: los índices de ajuste pueden ser inestables.`);
    if (r.agrupadas && r.agrupadas.length) avisos.push(`Categorías agrupadas en todos los grupos (sin respuestas en alguno): ${r.agrupadas.map(a => `${a.item} ${a.de}→${a.en}`).join(', ')}.`);
    if (r.tablasCorregidas) avisos.push(`Se sumó 0,5 a la celda vacía de ${r.tablasCorregidas} tabla(s) 2 × 2 de algún grupo, conservando los márgenes (como lavaan por defecto).`);
    msj.innerHTML = avisos.length ? `<div class="aiken-avisos">${avisos.map(esc).join('<br>')}</div>` : '';
    zona.innerHTML = `<h4 class="aiken-subtitulo aiken-titulo">Invarianza según «${esc(grupo)}»</h4>${tablaHTML(CABECERA_AJUSTE, filasAjuste(r), notaAjuste(r))}
        <h5 class="aiken-subtitulo">Comparación entre niveles</h5>${tablaHTML(CABECERA_COMPARACIONES, filasComparaciones(r), notaComparaciones(r))}
        ${r.medias.length ? `<h5 class="aiken-subtitulo">Diferencias de medias latentes</h5>${tablaHTML(CABECERA_MEDIAS, filasMedias(r), notaMedias(r))}` : ''}
        <h5 class="aiken-subtitulo">Redacción para la tesis (APA 7)</h5><p class="aiken-parrafo" id="invParrafo">${esc(redactarParrafo(r))}</p>
        <details class="aiken-referencias"><summary>Referencias citadas</summary>${referenciasInvarianza(r).map(x => `<p>${x}</p>`).join('')}</details>
        <div class="acciones-fila"><button type="button" id="invWord" class="btn btn-primary">Descargar Word (APA 7)</button></div>`;
    zona.hidden = false;
    zona.querySelector('#invWord').addEventListener('click', async () => {
        const doc = documentoWord(r), conv = await asegurarHtmlDocx();
        const [blob, nombre] = conv && conv.asBlob ? [conv.asBlob('<!DOCTYPE html>' + doc), 'invarianza_APA.docx'] : [new Blob(['\ufeff' + doc], { type: 'application/msword' }), 'invarianza_APA.doc'];
        descargarBlob(blob, nombre);
        mostrarToast(nombre.endsWith('.docx') ? 'Invarianza exportada a Word (APA 7)' : 'Exportado en .doc: no se pudo cargar el conversor a .docx', nombre.endsWith('.docx') ? 'success' : 'warning');
    });
    return r;
}

export function montarInvarianza() {
    contenedor = typeof document !== 'undefined' ? document.getElementById('invarianzaContainer') : null;
    if (!contenedor || contenedor.dataset.montado === '1') return;
    contenedor.dataset.montado = '1';
    contenedor.innerHTML = PLANTILLA();
    const sel = contenedor.querySelector('#invGrupo');
    sel.addEventListener('focus', actualizarGrupos);
    contenedor.querySelector('#invActualizar').addEventListener('click', actualizarGrupos);
    // la invarianza estricta (residuos) es de la secuencia ML; con WLSMV la escala de y* se fija por identificación
    const est = contenedor.querySelector('#invEstimador'), chk = contenedor.querySelector('#invEstricta');
    est.addEventListener('change', () => { const w = est.value === 'WLSMV'; chk.disabled = w; if (w) chk.checked = false; contenedor.querySelector('#invAgrupar').disabled = !w; });
    contenedor.querySelector('#invDelSEM').addEventListener('click', () => {
        const sx = (document.getElementById('semSintaxis') || {}).value || '';
        if (!sx.trim()) { mostrarToast('La sección SEM no tiene un modelo escrito', 'warning'); return; }
        contenedor.querySelector('#invSintaxis').value = sx.split(/\r?\n/).filter(l => !l.replace(/=~|~~/g, '').includes('~')).join('\n');   // sin regresiones
    });
    contenedor.querySelector('#invCalcular').addEventListener('click', () => { actualizarGrupos(); calcular(); });
}
export function resultadoInvarianza() { return ultimo; }
