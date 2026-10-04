// analizador/psicometria/concordancia-ui.js — tarjeta «Concordancia entre evaluadores (κ y CCI)» del Analizador.
// Detecta los conjuntos de evaluadores de la base (Juez1_X, Juez2_X… como los genera el Simulador) o usa una lista propia.
import { AnalizadorEstadistico } from '../estadistica.js';
import { EtiquetasVariables } from '../../shared/etiquetas-variables.js';
import { kappaCohen, kappaFleiss, cci, intervaloKappa } from './concordancia.js';
import { tablaKappa, tablaCCI, redactarParrafo, referenciasConcordancia, documentoWord } from './concordancia-redaccion.js';
import { mostrarToast } from '../../shared/toast.js';
import { descargarBlob } from '../../shared/descargas.js';
import { asegurarHtmlDocx } from '../../shared/vendor.js';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const guia = t => `<div class="orden-guia" role="note" style="margin:0 0 0.6rem;"><span class="orden-guia-titulo">Para qué sirve:</span><span class="orden-nota">${t}</span></div>`;
let contenedor = null, conjuntos = [], ultimo = null;

function datos() { try { return AnalizadorEstadistico.obtenerDatos() || []; } catch (e) { return []; } }

export function detectarEvaluadores(filas) {
    if (!filas.length) return [];
    const grupos = new Map();
    for (const c of Object.keys(filas[0])) { const m = /^Juez(\d+)_(.+)$/.exec(c); if (m) (grupos.get(m[2]) || grupos.set(m[2], []).get(m[2])).push([Number(m[1]), c]); }
    // nombre legible de lo evaluado: la etiqueta de la escala de esa sigla, si la base viene del Simulador («Estrés» en vez de «ES»)
    const nombre = suf => { for (const c of [`Dimension_${suf}`, `General_${suf}`, suf]) { const e = EtiquetasVariables.tieneEtiquetas && EtiquetasVariables.tieneEtiquetas() ? EtiquetasVariables.etiqueta(c) : null; if (e && e !== c) return e; } return suf; };
    return [...grupos.entries()].filter(([, cs]) => cs.length >= 2).map(([suf, cs]) => ({ etiqueta: `${nombre(suf)} (${cs.length} evaluadores)`, que: nombre(suf), clave: suf, columnas: cs.sort((a, b) => a[0] - b[0]).map(x => x[1]) }));
}

// Análisis completo de unas columnas de evaluadores (casos completos). tipo: 'auto' | 'categorica' | 'continua'
export function analizarConcordancia(filas, columnas, tipo = 'auto', { B = 1000, semilla = 2026 } = {}) {
    // Valores tal cual: números o etiquetas de texto (las categorías del Simulador llegan con su etiqueta: «Bajo»…)
    const valor = v => { if (v === null || v === undefined || v === '') return null; if (typeof v === 'number') return Number.isFinite(v) ? v : null; const s = String(v).trim(), x = Number(s.replace(',', '.')); return s === '' ? null : Number.isFinite(x) ? x : s; };
    const completas = filas.map(f => columnas.map(c => valor(f[c]))).filter(v => v.every(x => x !== null));
    if (completas.length < 3) return { error: 'Hacen falta al menos 3 sujetos con todas las evaluaciones.' };
    const cols = columnas.map((_, j) => completas.map(f => f[j])), k = cols.length, n = completas.length;
    const numericas = cols.every(c => c.every(v => typeof v === 'number'));
    const unicos = [...new Set(cols.flat())], cats = numericas ? unicos.sort((a, b) => a - b) : unicos;
    if (tipo === 'continua' && !numericas) return { error: 'El CCI necesita puntuaciones numéricas; estas evaluaciones son categorías de texto.' };
    const categorica = !numericas || tipo === 'categorica' || (tipo === 'auto' && cols.every(c => c.every(Number.isInteger)) && cats.length <= 10);
    const r = { n, evaluadores: k, categorias: cats.length, excluidos: filas.length - n };
    if (categorica) {
        if (cats.length < 2) return { error: 'Todas las evaluaciones son iguales: la concordancia no está definida.' };
        const opc = { B, semilla };
        if (k === 2) {
            const [a, b] = cols, fn = p => idx => kappaCohen(a, b, p, cats, idx).kappa;
            r.kappa = { tipo: 'cohen', valor: kappaCohen(a, b, 'ninguno', cats).kappa, ic: intervaloKappa(fn('ninguno'), n, opc), B, semilla };
            if (numericas && cats.length >= 3) r.kappa.ponderados = Object.fromEntries(['lineal', 'cuadratico'].map(p => [p, { valor: kappaCohen(a, b, p, cats).kappa, ic: intervaloKappa(fn(p), n, opc) }]));
        } else {
            r.kappa = { tipo: 'fleiss', valor: kappaFleiss(cols, cats).kappa, ic: intervaloKappa(idx => kappaFleiss(cols, cats, idx).kappa, n, opc), B, semilla };
        }
    } else r.cci = cci(cols);
    return r;
}

const PLANTILLA = () => `
    <h3 class="card-title">5. Concordancia entre evaluadores (κ y CCI) <span class="help-text" style="display:inline;">— opcional</span></h3>
    <p class="help-text">Mide cuánto coinciden dos o más evaluadores (jueces, observadores, informantes) que califican a los mismos sujetos.
        Categorías: κ de Cohen o de Fleiss; puntuaciones continuas: coeficiente de correlación intraclase (CCI).</p>
    <div class="rejilla-psico">
        <div class="form-group">
            ${guia('Qué columnas son los evaluadores: una columna por evaluador y una fila por sujeto. Las columnas Juez1_X, Juez2_X… (como las del Simulador) se agrupan solas.')}
            <label for="concConjunto">Evaluadores</label>
            <div style="display:flex; gap:0.5rem;"><select id="concConjunto" class="input"><option value="">Carga una base primero</option></select>
                <button type="button" id="concActualizar" class="btn btn-outline" title="Actualizar con la base cargada" aria-label="Actualizar la lista de evaluadores">↻</button></div>
            <textarea id="concColumnas" class="input" rows="2" hidden aria-label="Columnas de los evaluadores separadas por comas" placeholder="Ej: Juez1_ST, Juez2_ST, Juez3_ST (separadas por comas)"></textarea>
            <span class="help-text">«Lista propia» permite escribir las columnas; se usan los sujetos con todas las evaluaciones.</span>
        </div>
        <div class="form-group">
            ${guia('Qué tipo de calificación dieron: categorías (sí/no, niveles…) o puntuaciones.')}
            <label for="concTipo">Tipo de evaluación</label>
            <select id="concTipo" class="input"><option value="auto">Automático (recomendado)</option><option value="categorica">Categorías: κ</option><option value="continua">Puntuaciones: CCI</option></select>
            <span class="help-text">Automático: κ con valores enteros de hasta 10 categorías; CCI en otro caso.</span>
        </div>
    </div>
    <div class="acciones-fila"><button type="button" id="concCalcular" class="btn btn-primary">Calcular concordancia</button></div>
    <div id="concMensajes" role="alert"></div>
    <div id="concResultados" hidden></div>`;

export function actualizarConjuntos() {
    if (!contenedor) return;
    const sel = contenedor.querySelector('#concConjunto'), previo = sel.value, filas = datos();
    conjuntos = detectarEvaluadores(filas);
    sel.innerHTML = filas.length ? conjuntos.map(c => `<option value="${esc(c.clave)}">${esc(c.etiqueta)}</option>`).join('') + '<option value="propia">Lista propia de columnas…</option>' : '<option value="">Carga una base primero</option>';
    if ([...sel.options].some(o => o.value === previo)) sel.value = previo;
    contenedor.querySelector('#concColumnas').hidden = sel.value !== 'propia';
}

function tablaHTML(t) {
    return `<div class="table-container"><table class="table"><thead><tr>${t.cabecera.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.filas.map(f => `<tr>${f.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="help-text"><em>Nota.</em> ${esc(t.nota)}</p>`;
}

export function calcular() {
    const sel = contenedor.querySelector('#concConjunto'), filas = datos(), msj = contenedor.querySelector('#concMensajes'), zona = contenedor.querySelector('#concResultados');
    const error = t => { msj.innerHTML = `<div class="aiken-errores"><strong>No se puede calcular:</strong> ${esc(t)}</div>`; zona.hidden = true; ultimo = null; return null; };
    if (!filas.length) return error('No hay una base cargada en el Analizador.');
    let columnas, que;   // lista propia: separada por comas, punto y coma o saltos de línea (los nombres pueden llevar espacios)
    if (sel.value === 'propia') { columnas = [...new Set(contenedor.querySelector('#concColumnas').value.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean))]; que = 'las columnas seleccionadas'; }
    else { const c = conjuntos.find(x => x.clave === sel.value); if (!c) return error('Elige un conjunto de evaluadores.'); columnas = c.columnas; que = c.que; }
    if (columnas.length < 2) return error('Hacen falta al menos 2 evaluadores.');
    const faltan = columnas.filter(c => !(c in filas[0]));
    if (faltan.length) return error(`No están en la base: ${faltan.join(', ')}.`);
    const r = analizarConcordancia(filas, columnas, contenedor.querySelector('#concTipo').value);
    if (r.error) return error(r.error);
    ultimo = { r, que };
    msj.innerHTML = r.excluidos ? `<div class="aiken-avisos">${r.excluidos} sujeto(s) sin todas las evaluaciones se excluyeron (n = ${r.n}).</div>` : '';
    zona.innerHTML = `<h4 class="aiken-subtitulo aiken-titulo">Resultados: ${esc(que)}</h4>${r.kappa ? tablaHTML(tablaKappa(r)) : ''}${r.cci ? tablaHTML(tablaCCI(r)) : ''}
        <h5 class="aiken-subtitulo">Redacción para la tesis (APA 7)</h5><p class="aiken-parrafo" id="concParrafo">${esc(redactarParrafo(r, que))}</p>
        <details class="aiken-referencias"><summary>Referencias citadas</summary>${referenciasConcordancia(r).map(x => `<p>${x}</p>`).join('')}</details>
        <div class="acciones-fila"><button type="button" id="concWord" class="btn btn-primary">Descargar Word (APA 7)</button></div>`;
    zona.hidden = false;
    zona.querySelector('#concWord').addEventListener('click', async () => {
        const doc = documentoWord(r, que), conv = await asegurarHtmlDocx();
        const [blob, nombre] = conv && conv.asBlob ? [conv.asBlob('<!DOCTYPE html>' + doc), 'concordancia_APA.docx'] : [new Blob(['\ufeff' + doc], { type: 'application/msword' }), 'concordancia_APA.doc'];
        descargarBlob(blob, nombre);
        mostrarToast(nombre.endsWith('.docx') ? 'Concordancia exportada a Word (APA 7)' : 'Exportado en .doc: no se pudo cargar el conversor a .docx', nombre.endsWith('.docx') ? 'success' : 'warning');
    });
    return r;
}

export function montarConcordancia() {
    contenedor = typeof document !== 'undefined' ? document.getElementById('concordanciaContainer') : null;
    if (!contenedor || contenedor.dataset.montado === '1') return;
    contenedor.dataset.montado = '1';
    contenedor.innerHTML = PLANTILLA();
    const sel = contenedor.querySelector('#concConjunto');
    sel.addEventListener('focus', actualizarConjuntos);
    sel.addEventListener('change', () => { contenedor.querySelector('#concColumnas').hidden = sel.value !== 'propia'; });
    contenedor.querySelector('#concActualizar').addEventListener('click', actualizarConjuntos);
    contenedor.querySelector('#concCalcular').addEventListener('click', () => { actualizarConjuntos(); calcular(); });
}
export function resultadoConcordancia() { return ultimo; }
