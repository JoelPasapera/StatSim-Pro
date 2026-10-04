// analizador/psicometria/afe-ui.js — tarjeta «Análisis factorial exploratorio (AFE)» del Analizador. Solo interfaz: los
// ítems salen de la base cargada (escalas detectadas o lista propia), el cálculo va al Worker (servicio-psicometrico.js)
// y la redacción a afe-redaccion.js.
import { AnalizadorEstadistico } from '../estadistica.js';
import { Fiabilidad } from '../fiabilidad.js';
import { ejecutarTarea } from './servicio-psicometrico.js';
import { ROTACIONES, interpretarKMO } from './afe.js';
import { tablaAutovalores, tablaCargas, tablaPhi, redactarParrafo, referenciasAFE, documentoWord, csvCargas, esPrincipal, f2, fp } from './afe-redaccion.js';
import { mostrarToast } from '../../shared/toast.js';
import { descargarArchivo, descargarBlob } from '../../shared/descargas.js';
import { asegurarHtmlDocx } from '../../shared/vendor.js';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const guia = t => `<div class="orden-guia" role="note" style="margin:0 0 0.6rem;"><span class="orden-guia-titulo">Para qué sirve:</span><span class="orden-nota">${t}</span></div>`;
const selector = (id, opciones, actual) => `<select id="${id}" class="input">${opciones.map(([v, t]) => `<option value="${v}"${String(v) === String(actual) ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
let contenedor = null, ultimo = null, tarea = null, grupos = [];   // grupos: escalas detectadas en la base actual

const PLANTILLA = () => `
    <h3 class="card-title">4. Análisis factorial exploratorio (AFE) <span class="help-text" style="display:inline;">— opcional</span></h3>
    <p class="help-text">Examina cuántas dimensiones tiene un instrumento y qué ítems forman cada una, con la base cargada en el Analizador.
        Es la evidencia de validez de estructura interna que se reporta junto a la fiabilidad.</p>
    <div class="orden-guia" role="note" aria-label="Orden para el AFE">
        <span class="orden-guia-titulo">Completa en este orden:</span>
        <span class="orden-paso"><span class="orden-num">1</span> Ítems</span><span class="orden-flecha" aria-hidden="true">→</span>
        <span class="orden-paso"><span class="orden-num">2</span> Correlación</span><span class="orden-flecha" aria-hidden="true">→</span>
        <span class="orden-paso"><span class="orden-num">3</span> Número de factores</span><span class="orden-flecha" aria-hidden="true">→</span>
        <span class="orden-paso"><span class="orden-num">4</span> Rotación</span><span class="orden-flecha" aria-hidden="true">→</span>
        <span class="orden-paso"><span class="orden-num">5</span> Calcular</span>
        <span class="orden-nota">Lo habitual: todos los ítems de un instrumento, correlación automática, número de factores por análisis paralelo y rotación oblimin.</span>
    </div>
    <div class="rejilla-psico">
        <div class="form-group">
            ${guia('Qué ítems se analizan juntos: normalmente todos los de un instrumento (su «Escala total»), para ver si se agrupan en las dimensiones esperadas.')}
            <label for="afeConjunto">Ítems a analizar</label>
            <div style="display:flex; gap:0.5rem;">${selector('afeConjunto', [['', 'Carga una base primero']], '')}
                <button type="button" id="afeActualizar" class="btn btn-outline" title="Actualizar la lista con la base cargada" aria-label="Actualizar la lista de escalas">↻</button></div>
            <span class="help-text">Las escalas se detectan en la base cargada; «Lista propia» permite escribir los ítems.</span>
            <textarea id="afeItems" class="input" rows="2" hidden aria-label="Ítems separados por comas" placeholder="Ej: PE1, PE2, PE3, CE1, CE2, CE3"></textarea>
        </div>
        <div class="form-group">
            ${guia('Qué correlación resume la relación entre ítems. Con respuestas Likert o sí/no conviene la policórica.')}
            <label for="afeCorrelacion">Correlación</label>
            ${selector('afeCorrelacion', [['auto', 'Automática (recomendada)'], ['policorica', 'Policórica / tetracórica'], ['pearson', 'Pearson']], 'auto')}
            <span class="help-text">Automática: policórica con ítems enteros de hasta 7 categorías; Pearson con puntuaciones continuas.</span>
        </div>
        <div class="form-group">
            ${guia('Cuántas dimensiones se extraen. El análisis paralelo las decide comparando con datos sin estructura; fíjalas solo si la teoría lo exige.')}
            <label for="afeFactores">Número de factores</label>
            ${selector('afeFactores', [['paralelo', 'Análisis paralelo (recomendado)'], ...[1, 2, 3, 4, 5, 6, 7, 8].map(v => [v, `${v} ${v === 1 ? 'factor' : 'factores'}`])], 'paralelo')}
            <span class="help-text">Percentil 95 de autovalores de datos permutados (Horn, 1965; Glorfeld, 1995). El criterio de Kaiser se informa, pero sobrestima.</span>
        </div>
        <div class="form-group">
            ${guia('Cómo se orientan los factores para que cada ítem cargue sobre todo en uno. En psicología las dimensiones suelen correlacionar: oblimin.')}
            <label for="afeRotacion">Rotación</label>
            ${selector('afeRotacion', Object.entries(ROTACIONES), 'oblimin')}
            <span class="help-text">Oblimin y promax son oblicuas (permiten correlación entre factores); varimax es ortogonal.</span>
        </div>
        <div class="form-group">
            ${guia('Cuántas matrices sin estructura se generan para el análisis paralelo.')}
            <label for="afeB">Réplicas del análisis paralelo</label>
            ${selector('afeB', [[100, '100 (rápido)'], [200, '200 (recomendado)'], [500, '500 (más estable)']], 200)}
            <span class="help-text">Con correlaciones policóricas cada réplica cuesta más: con muchos ítems, 100 basta.</span>
        </div>
        <div class="form-group">
            ${guia('Hace reproducible el análisis paralelo: la misma semilla da siempre la misma decisión.')}
            <label for="afeSemilla">Semilla</label>
            <input id="afeSemilla" type="number" class="input" min="1" step="1" value="2026">
            <span class="help-text">Anótala en el informe.</span>
        </div>
    </div>
    <div class="acciones-fila">
        <button type="button" id="afeCalcular" class="btn btn-primary">Calcular AFE</button>
        <button type="button" id="afeCancelar" class="btn btn-outline" hidden>Cancelar</button>
    </div>
    <div id="afeProgresoFila" class="boot-progreso" hidden><progress id="afeProgreso" max="100" value="0" aria-label="Progreso del análisis paralelo"></progress> <span id="afeEstado" class="help-text" aria-live="polite"></span></div>
    <div id="afeMensajes" role="alert"></div>
    <div id="afeResultados" hidden></div>`;

function datosCargados() { try { return AnalizadorEstadistico.obtenerDatos() || []; } catch (e) { return []; } }

export function actualizarConjuntos() {
    if (!contenedor) return;
    const sel = contenedor.querySelector('#afeConjunto'), previo = sel.value, datos = datosCargados();
    if (!datos.length) { sel.innerHTML = '<option value="">Carga una base primero</option>'; return; }
    grupos = Fiabilidad.detectarGrupos(datos).filter(g => g.items.length >= 3)
        .sort((a, b) => (b.particion ? 1 : 0) - (a.particion ? 1 : 0) || b.items.length - a.items.length);
    // el valor es la etiqueta de la escala: al recargar la base, la elección se conserva si la escala sigue ahí
    sel.innerHTML = grupos.map(g => `<option value="${esc(g.etiqueta)}">${esc(g.etiqueta)} · ${g.items.length} ítems</option>`).join('') + '<option value="propia">Lista propia de ítems…</option>';
    if ([...sel.options].some(o => o.value === previo)) sel.value = previo;
    contenedor.querySelector('#afeItems').hidden = sel.value !== 'propia';
}

function itemsElegidos() {
    const sel = contenedor.querySelector('#afeConjunto');
    if (sel.value === 'propia') {
        const nombres = contenedor.querySelector('#afeItems').value.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
        return { etiqueta: 'Ítems seleccionados', de: 'de los ítems seleccionados', items: [...new Set(nombres)] };
    }
    const g = grupos.find(x => x.etiqueta === sel.value);
    if (!g) return null;
    const total = /^Escala total \((.+)\)$/.exec(g.etiqueta);   // «Escala total (TMMS24)» → «del TMMS24»; una dimensión → «de la escala …»
    return { etiqueta: total ? `${total[1]} (escala total)` : g.etiqueta, de: total ? `del ${total[1]}` : `de la escala ${g.etiqueta}`, items: g.items };
}

function mensajes(errores, avisos) {
    const caja = contenedor.querySelector('#afeMensajes');
    const bloque = (clase, titulo, xs) => (xs.length ? `<div class="${clase}"><strong>${titulo}</strong><ul>${xs.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '');
    caja.innerHTML = bloque('aiken-errores', 'No se puede calcular:', errores) + bloque('aiken-avisos', 'Ten en cuenta:', avisos);
}

export function calcular() {
    const eleccion = itemsElegidos(), datos = datosCargados();
    const errores = [];
    if (!datos.length) errores.push('No hay una base cargada en el Analizador.');
    if (!eleccion || eleccion.items.length < 3) errores.push('Elige al menos 3 ítems.');
    const faltan = eleccion ? eleccion.items.filter(it => !(it in (datos[0] || {}))) : [];
    if (faltan.length) errores.push(`No están en la base: ${faltan.join(', ')}.`);
    if (errores.length) { mensajes(errores, []); return null; }
    const filas = datos.map(f => eleccion.items.map(it => parseFloat(f[it]))).filter(v => v.every(Number.isFinite));
    const cols = eleccion.items.map((_, j) => filas.map(f => f[j]));
    const avisos = datos.length > filas.length ? [`${datos.length - filas.length} caso(s) con datos incompletos en estos ítems se excluyeron (n = ${filas.length}).`] : [];
    const opciones = { correlacion: contenedor.querySelector('#afeCorrelacion').value, factores: contenedor.querySelector('#afeFactores').value, rotacion: contenedor.querySelector('#afeRotacion').value,
        B: Number(contenedor.querySelector('#afeB').value), semilla: Math.max(1, Math.floor(Number(contenedor.querySelector('#afeSemilla').value) || 2026)) };
    const q = s => contenedor.querySelector(s), inicio = Date.now();
    q('#afeCalcular').disabled = true; q('#afeCancelar').hidden = false; q('#afeProgresoFila').hidden = false; q('#afeEstado').textContent = 'Preparando…';
    mensajes([], avisos);
    tarea = ejecutarTarea('afe', [{ clave: 'afe', cols, nombres: eleccion.items }], opciones, (h, t) => {
        q('#afeProgreso').value = Math.round((100 * h) / t);
        q('#afeEstado').textContent = `Análisis paralelo: ${h} de ${t} réplicas · ${((Date.now() - inicio) / 1000).toFixed(0)} s`;
    });
    q('#afeCancelar').onclick = () => tarea && tarea.cancelar();
    const terminar = () => { q('#afeCalcular').disabled = false; q('#afeCancelar').hidden = true; q('#afeProgresoFila').hidden = true; tarea = null; };
    return tarea.promesa.then(lista => {
        terminar();
        const r = lista[0].resultado;
        if (r.error) { ultimo = null; mensajes([r.error], avisos); q('#afeResultados').hidden = true; return null; }
        ultimo = { r, etiqueta: eleccion.etiqueta, de: eleccion.de };
        mensajes([], [...avisos, ...r.avisos]);
        pintar(r, eleccion.etiqueta, eleccion.de);
        return r;
    }).catch(e => { terminar(); q('#afeEstado').textContent = ''; mensajes(e.cancelado ? [] : [`No se pudo calcular: ${e.message}`], e.cancelado ? ['Cálculo cancelado.'] : []); return null; });
}

function tablaHTML(t, negrita) {
    const filas = t.pie ? [...t.filas, t.pie] : t.filas;
    return `<div class="table-container"><table class="table"><thead><tr>${t.cabecera.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${filas.map((f, i) => `<tr${t.pie && i === filas.length - 1 ? ' class="fila-pie"' : ''}>${f.map((c, j) => `<td>${negrita && negrita(i, j) ? `<strong>${esc(c)}</strong>` : esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        <p class="help-text"><em>Nota.</em> ${esc(t.nota)}</p>`;
}

function pintar(r, etiqueta, de) {
    const k = r.adecuacion.kmo, b = r.adecuacion.bartlett, phi = tablaPhi(r);
    const marcas = r.items.filter(it => it.bajaCarga || it.cruzada || it.bajaComunalidad || (it.msa !== null && it.msa < 0.5));
    const partes = [`<h4 class="aiken-subtitulo aiken-titulo">Resultados: ${esc(etiqueta)}</h4>
        <p class="help-text">${r.p} ítems · n = ${r.n} · correlación ${r.tipo === 'policorica' ? 'policórica' : 'de Pearson'} ·
        ${k ? `KMO = ${f2(k.kmo)} (${interpretarKMO(k.kmo)})` : 'KMO no calculable'} · ${b ? `Bartlett χ²(${b.gl}) = ${b.chi2.toFixed(2)}, p ${b.p < 0.001 ? '< .001' : '= ' + fp(b.p)}` : ''} ·
        <strong>${r.m} ${r.m === 1 ? 'factor' : 'factores'}</strong> (paralelo: ${r.sugeridos}; Kaiser: ${r.kaiser}) · ${esc(r.rotacion.nombre)}</p>`];
    partes.push('<h5 class="aiken-subtitulo">Autovalores y análisis paralelo</h5>' + tablaHTML(tablaAutovalores(r)));
    partes.push('<h5 class="aiken-subtitulo">Cargas factoriales</h5>' + tablaHTML(tablaCargas(r), (i, j) => esPrincipal(r, i, j)));
    if (phi) partes.push('<h5 class="aiken-subtitulo">Correlaciones entre factores</h5>' + tablaHTML(phi));
    if (marcas.length) partes.push(`<div class="aiken-avisos"><strong>Ítems a revisar</strong><ul>${marcas.map(it => `<li>${esc(it.nombre)}: ${[it.bajaCarga && 'carga principal < .40', it.cruzada && 'carga cruzada ≥ .30', it.bajaComunalidad && 'comunalidad < .30', it.msa !== null && it.msa < 0.5 && 'MSA < .50'].filter(Boolean).join('; ')}</li>`).join('')}</ul></div>`);
    partes.push(`<h5 class="aiken-subtitulo">Redacción para la tesis (APA 7)</h5><p class="aiken-parrafo" id="afeParrafo">${esc(redactarParrafo(r, de))}</p>
        <details class="aiken-referencias"><summary>Referencias citadas</summary>${referenciasAFE(r).map(x => `<p>${x}</p>`).join('')}</details>
        <div class="acciones-fila"><button type="button" id="afeCSV" class="btn btn-outline">Descargar cargas (CSV)</button><button type="button" id="afeWord" class="btn btn-primary">Descargar Word (APA 7)</button></div>`);
    const zona = contenedor.querySelector('#afeResultados');
    zona.innerHTML = partes.join(''); zona.hidden = false;
    zona.querySelector('#afeCSV').addEventListener('click', () => descargarArchivo('\ufeff' + csvCargas(r), 'afe_cargas.csv', 'text/csv'));
    zona.querySelector('#afeWord').addEventListener('click', async () => {
        const doc = documentoWord(r, etiqueta, de), conv = await asegurarHtmlDocx();
        const [blob, nombre] = conv && conv.asBlob ? [conv.asBlob('<!DOCTYPE html>' + doc), 'afe_APA.docx'] : [new Blob(['\ufeff' + doc], { type: 'application/msword' }), 'afe_APA.doc'];
        descargarBlob(blob, nombre);
        mostrarToast(nombre.endsWith('.docx') ? 'AFE exportado a Word (APA 7)' : 'Exportado en .doc: no se pudo cargar el conversor a .docx', nombre.endsWith('.docx') ? 'success' : 'warning');
    });
}

export function montarAFE() {
    contenedor = typeof document !== 'undefined' ? document.getElementById('afeContainer') : null;
    if (!contenedor || contenedor.dataset.montado === '1') return;
    contenedor.dataset.montado = '1';
    contenedor.innerHTML = PLANTILLA();
    const sel = contenedor.querySelector('#afeConjunto');
    sel.addEventListener('focus', actualizarConjuntos);
    sel.addEventListener('change', () => { contenedor.querySelector('#afeItems').hidden = sel.value !== 'propia'; });
    contenedor.querySelector('#afeActualizar').addEventListener('click', actualizarConjuntos);
    contenedor.querySelector('#afeCalcular').addEventListener('click', () => { actualizarConjuntos(); calcular(); });   // siempre con la base cargada ahora
}
export function resultadoAFE() { return ultimo; }
