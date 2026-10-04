// analizador/psicometria/aiken-ui.js — tarjeta «Validez de contenido por juicio de expertos (V de Aiken)» del Analizador.
// Solo interfaz: lee la tabla con aiken-entrada.js, calcula con aiken.js y redacta con aiken-redaccion.js.
import { analizarValidezContenido, CRITERIOS_V0, NIVELES_CONFIANZA } from './aiken.js';
import { parsearMatriz } from './aiken-entrada.js';
import { redactarParrafo, referencias, filasCriterio, CABECERA_CRITERIO, notaCriterio, documentoWord, csvResultados, f2, ROTULO_DECISION } from './aiken-redaccion.js';
import { EJEMPLO_AIKEN } from './aiken-ejemplo.js';
import { mostrarToast } from '../../shared/toast.js';
import { descargarArchivo, descargarBlob } from '../../shared/descargas.js';
import { asegurarHtmlDocx } from '../../shared/vendor.js';

const CLAVE_GUARDADO = 'statsim.aiken.v1';
const CRITERIOS_INICIALES = ['Pertinencia', 'Relevancia', 'Claridad'];
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const guia = (texto) => `<div class="orden-guia" role="note" style="margin:0 0 0.6rem;"><span class="orden-guia-titulo">Para qué sirve:</span><span class="orden-nota">${texto}</span></div>`;
const pctTexto = c => `${String(Math.round(c * 1000) / 10).replace('.', ',')} %`;

let contenedor = null;
let ultimoResultado = null;

const PLANTILLA = () => `
    <h3 class="card-title">3. Validez de contenido por juicio de expertos (V de Aiken) <span class="help-text" style="display:inline;">— opcional</span></h3>
    <p class="help-text">Cuantifica el acuerdo de los jueces sobre cada ítem del instrumento: cuánto lo consideran pertinente, relevante o claro.
        Es independiente de la base de datos cargada: aquí se trabaja con las valoraciones de los expertos.</p>
    <div class="orden-guia" role="note" aria-label="Orden para calcular la V de Aiken">
        <span class="orden-guia-titulo">Completa en este orden:</span>
        <span class="orden-paso"><span class="orden-num">1</span> Escala de valoración</span><span class="orden-flecha" aria-hidden="true">→</span>
        <span class="orden-paso"><span class="orden-num">2</span> Criterio de decisión</span><span class="orden-flecha" aria-hidden="true">→</span>
        <span class="orden-paso"><span class="orden-num">3</span> Valoraciones por criterio</span><span class="orden-flecha" aria-hidden="true">→</span>
        <span class="orden-paso"><span class="orden-num">4</span> Calcular</span>
        <span class="orden-nota">Cada criterio (pertinencia, relevancia, claridad…) se pega como una tabla: una fila por ítem y una columna por juez.
            ¿Primera vez? Pulsa «Cargar ejemplo» para ver el formato.</span>
    </div>
    <div class="aiken-rejilla">
        <div class="form-group">
            ${guia('Los valores que usaron los jueces al calificar, por ejemplo de 1 a 4 (1 = no cumple, 4 = alto nivel) o de 0 a 1 (no / sí).')}
            <label for="aikenMinimo">Valor mínimo de la escala</label>
            <input type="number" id="aikenMinimo" class="input" step="1" value="1">
            <span class="help-text">La V reescala la media de los jueces a 0–1: V = (M − mínimo) / (máximo − mínimo).</span>
        </div>
        <div class="form-group">
            ${guia('El valor más alto que podía dar un juez (4 en una escala de 1 a 4).')}
            <label for="aikenMaximo">Valor máximo de la escala</label>
            <input type="number" id="aikenMaximo" class="input" step="1" value="4">
            <span class="help-text">Solo valoraciones enteras dentro de la escala; una celda vacía es un juez que no valoró ese ítem.</span>
        </div>
        <div class="form-group">
            ${guia('Cuánta seguridad quieres al acotar la V de cada ítem. El 95 % es el estándar en tesis.')}
            <label for="aikenConfianza">Nivel de confianza del intervalo</label>
            <select id="aikenConfianza" class="input">${NIVELES_CONFIANZA.map(c => `<option value="${c}"${c === 0.95 ? ' selected' : ''}>${pctTexto(c)}</option>`).join('')}</select>
            <span class="help-text">Intervalo score de Penfield y Giacobbi (2004): asimétrico, correcto aunque la V esté cerca de 1.</span>
        </div>
        <div class="form-group">
            ${guia('Qué tan exigente es la decisión. Un ítem es válido si el límite inferior de su intervalo alcanza este valor, no solo su V: con pocos jueces, la V sola engaña.')}
            <label for="aikenV0">Criterio de validez (V₀)</label>
            <select id="aikenV0" class="input">${CRITERIOS_V0.map(c => `<option value="${c.valor}"${c.valor === 0.70 ? ' selected' : ''}>${f2(c.valor)} · ${c.nombre}</option>`).join('')}</select>
            <span class="help-text">.50 liberal (Cicchetti, 1994), .70 recomendado (Charter, 2003), .80 estricto. Decisión por el límite inferior (Merino-Soto y Livia, 2009): válido si el límite ≥ V₀; revisar si la V ≥ V₀ pero el límite no; no válido si la V &lt; V₀.</span>
        </div>
    </div>
    ${guia('Pega aquí, para cada criterio, el rango copiado de Excel: una fila por ítem y una columna por juez. Pueden venir los nombres de los ítems en la primera columna y los de los jueces en la primera fila; se detectan solos.')}
    <div id="aikenCriterios"></div>
    <div class="acciones-fila">
        <button type="button" id="aikenAgregarCriterio" class="btn btn-outline">+ Agregar criterio</button>
        <button type="button" id="aikenEjemplo" class="btn btn-outline">Cargar ejemplo</button>
        <button type="button" id="aikenVaciar" class="btn btn-outline">Vaciar</button>
        <button type="button" id="aikenCalcular" class="btn btn-primary">Calcular V de Aiken</button>
    </div>
    <div id="aikenMensajes" role="alert"></div>
    <div id="aikenResultados" hidden></div>`;

const plantillaCriterio = (nombre) => `
    <div class="criterio-aiken-cabecera">
        <input type="text" class="input" maxlength="60" value="${esc(nombre)}" aria-label="Nombre del criterio" placeholder="Ej: Claridad">
        <button type="button" class="btn btn-outline" data-accion="cargar-csv">Cargar CSV</button>
        <input type="file" accept=".csv,.txt,.tsv" aria-label="Cargar CSV del criterio" hidden>
        <button type="button" class="btn-icon btn-delete" title="Quitar criterio" aria-label="Quitar criterio">✕</button>
    </div>
    <textarea class="input" rows="8" spellcheck="false" aria-label="Valoraciones del criterio" placeholder="Ítem&#9;Juez 1&#9;Juez 2&#9;Juez 3&#10;Ítem 1&#9;4&#9;4&#9;3&#10;Ítem 2&#9;3&#9;4&#9;4"></textarea>
    <small class="campo-hint aiken-lectura" aria-live="polite"></small>`;

// ---------------------------------------------------------------- estado de la tarjeta
function leerConfiguracion() {
    const num = id => Number((contenedor.querySelector('#' + id) || {}).value);
    return { minimo: num('aikenMinimo'), maximo: num('aikenMaximo'), confianza: num('aikenConfianza'), v0: num('aikenV0') };
}
function bloquesCriterio() { return Array.from(contenedor.querySelectorAll('.criterio-aiken')); }
function leerCriterios() {
    return bloquesCriterio().map(b => ({ nombre: b.querySelector('[aria-label="Nombre del criterio"]').value.trim(), texto: b.querySelector('textarea').value }));
}
function guardar() {
    try { localStorage.setItem(CLAVE_GUARDADO, JSON.stringify({ ...leerConfiguracion(), criterios: leerCriterios() })); } catch (e) { /* sin almacenamiento */ }
}
function restaurar() {
    try { const s = localStorage.getItem(CLAVE_GUARDADO); return s ? JSON.parse(s) : null; } catch (e) { return null; }
}
function aplicarEstado(estado) {
    contenedor.querySelector('#aikenMinimo').value = String(estado.minimo);
    contenedor.querySelector('#aikenMaximo').value = String(estado.maximo);
    contenedor.querySelector('#aikenConfianza').value = String(estado.confianza);
    contenedor.querySelector('#aikenV0').value = String(estado.v0);
    contenedor.querySelector('#aikenCriterios').innerHTML = '';
    (estado.criterios && estado.criterios.length ? estado.criterios : CRITERIOS_INICIALES.map(n => ({ nombre: n, texto: '' })))
        .forEach(c => agregarCriterio(c.nombre, c.texto));
}

// ---------------------------------------------------------------- bloques de criterio
function actualizarLectura(bloque) {
    const texto = bloque.querySelector('textarea').value, hint = bloque.querySelector('.aiken-lectura');
    hint.classList.remove('invalido', 'aviso');
    if (!texto.trim()) { hint.textContent = ''; hint.hidden = true; return; }
    const m = parsearMatriz(texto);
    hint.hidden = false;
    if (m.errores.length) { hint.classList.add('invalido'); hint.textContent = m.errores.slice(0, 3).join(' ') + (m.errores.length > 3 ? ` (y ${m.errores.length - 3} más)` : ''); return; }
    const sep = { '\t': 'tabulador', ';': 'punto y coma', ',': 'coma', espacios: 'espacios' }[m.formato.separador];
    hint.textContent = `Leídos: ${m.valoraciones.length} ítems × ${m.jueces.length} jueces · separador ${sep}` +
        `${m.formato.conEncabezado ? ' · con fila de jueces' : ''}${m.formato.conEtiquetas ? ' · con nombres de ítems' : ''}.` + (m.avisos.length ? ' ' + m.avisos.join(' ') : '');
    if (m.avisos.length) hint.classList.add('aviso');
}
function agregarCriterio(nombre = '', texto = '') {
    const bloque = document.createElement('div');
    bloque.className = 'criterio-aiken';
    bloque.innerHTML = plantillaCriterio(nombre);
    contenedor.querySelector('#aikenCriterios').appendChild(bloque);
    const area = bloque.querySelector('textarea');
    area.value = texto;   // explícito: no depender del contenido inicial del textarea
    area.addEventListener('input', () => { actualizarLectura(bloque); guardar(); });
    bloque.querySelector('[aria-label="Nombre del criterio"]').addEventListener('input', guardar);
    bloque.querySelector('.btn-delete').addEventListener('click', () => {
        if (bloquesCriterio().length <= 1) { mostrarToast('Debe quedar al menos un criterio', 'warning'); return; }
        bloque.remove(); guardar();
    });
    const archivo = bloque.querySelector('input[type="file"]');
    bloque.querySelector('[data-accion="cargar-csv"]').addEventListener('click', () => archivo.click());   // botón enfocable con teclado
    archivo.addEventListener('change', () => {
        const f = archivo.files && archivo.files[0];
        if (!f || typeof FileReader === 'undefined') return;
        const lector = new FileReader();
        lector.onload = () => { area.value = String(lector.result || '').replace(/^\ufeff/, ''); actualizarLectura(bloque); guardar(); mostrarToast(`«${f.name}» cargado`, 'success'); };
        lector.onerror = () => mostrarToast('No se pudo leer el archivo', 'error');
        lector.readAsText(f, 'utf-8');
        archivo.value = '';
    });
    actualizarLectura(bloque);
    return bloque;
}

// ---------------------------------------------------------------- cálculo y resultados
function mostrarMensajes(errores, avisos) {
    const caja = contenedor.querySelector('#aikenMensajes');
    const bloque = (clase, titulo, xs) => xs.length ? `<div class="${clase}"><strong>${titulo}</strong><ul>${xs.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';
    caja.innerHTML = bloque('aiken-errores', 'Corrige antes de calcular:', errores) + bloque('aiken-avisos', 'Ten en cuenta:', avisos);
}
export function calcular() {
    const cfg = leerConfiguracion();
    const leidos = leerCriterios().filter(c => c.texto.trim());
    const errores = [];
    if (leidos.length === 0) errores.push('Pega las valoraciones de al menos un criterio.');
    const criterios = leidos.map((c, i) => {
        const m = parsearMatriz(c.texto);
        m.errores.forEach(e => errores.push(`«${c.nombre || `Criterio ${i + 1}`}»: ${e}`));
        return { nombre: c.nombre || `Criterio ${i + 1}`, jueces: m.jueces, valoraciones: m.valoraciones, etiquetas: m.etiquetas };
    });
    let res = null;
    if (!errores.length) {
        res = analizarValidezContenido({ ...cfg, items: criterios[0].etiquetas, criterios });
        if (!res.ok) errores.push(...res.errores);
        else if (criterios.some(c => c.etiquetas.join('|') !== criterios[0].etiquetas.join('|'))) res.avisos.push('Los nombres de los ítems no coinciden entre criterios: se usan los del primero. Revisa que las filas estén en el mismo orden.');
    }
    if (errores.length) {
        ultimoResultado = null;
        mostrarMensajes(errores, []);
        contenedor.querySelector('#aikenResultados').hidden = true;
        mostrarToast('Revisa las valoraciones: hay datos que corregir', 'error');
        return null;
    }
    ultimoResultado = res;
    mostrarMensajes([], res.avisos);
    pintarResultados(res);
    return res;
}

function tablaHTML(cabecera, filas, decisiones) {
    return `<div class="table-container"><table class="table"><thead><tr>${cabecera.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>` +
        filas.map((f, i) => `<tr>${f.map((c, j) => j === f.length - 1 && decisiones ? `<td><span class="insignia insignia-${decisiones[i]}">${esc(c)}</span></td>` : `<td>${esc(c)}</td>`).join('')}</tr>`).join('') +
        '</tbody></table></div>';
}
function pintarResultados(res) {
    const cfg = res.configuracion, r = res.resumen;
    const partes = [];
    const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
    partes.push(`<h4 class="aiken-subtitulo aiken-titulo">Resultados</h4>
        <p class="help-text">${plural(cfg.nItems, 'ítem', 'ítems')} · ${plural(r.nJueces, 'juez', 'jueces')} · ${plural(res.criterios.length, 'criterio', 'criterios')} · IC al ${pctTexto(cfg.confianza)} · V₀ = ${f2(cfg.v0)} ·
        <span class="insignia insignia-valido">${plural(r.validos, 'válido', 'válidos')}</span> <span class="insignia insignia-revisar">${r.revisar} a revisar</span> <span class="insignia insignia-no_valido">${plural(r.noValidos, 'no válido', 'no válidos')}</span>
        ${res.criterios.length > 1 ? '(decisión global: la más exigente de los criterios)' : ''}</p>`);
    res.criterios.forEach(c => {
        partes.push(`<h5 class="aiken-subtitulo">${esc(c.nombre)} <span class="help-text" style="display:inline;">— ${c.nJueces} jueces · V media ${f2(c.resumen.vMedia)} (${f2(c.resumen.vMin)}–${f2(c.resumen.vMax)})</span></h5>`);
        partes.push(tablaHTML(CABECERA_CRITERIO, filasCriterio(c), c.items.map(x => x.decision)));
    });
    partes.push(`<p class="help-text"><em>Nota.</em> ${esc(notaCriterio(cfg))}</p>`);
    if (res.criterios.length > 1) {
        partes.push('<h5 class="aiken-subtitulo">Resumen por ítem</h5>');
        partes.push(tablaHTML(['Ítem', ...cfg.criterios, 'V promedio', 'Decisión'], res.porItem.map(x => [x.etiqueta, ...x.porCriterio.map(f2), f2(x.V), ROTULO_DECISION[x.decision]]), res.porItem.map(x => x.decision)));
    }
    partes.push(`<h5 class="aiken-subtitulo">Redacción para la tesis (APA 7)</h5><p class="aiken-parrafo" id="aikenParrafo">${esc(redactarParrafo(res))}</p>
        <details class="aiken-referencias"><summary>Referencias citadas</summary>${referencias(cfg.v0).map(x => `<p>${x}</p>`).join('')}</details>
        <div class="acciones-fila">
            <button type="button" id="aikenCopiar" class="btn btn-outline">Copiar párrafo</button>
            <button type="button" id="aikenCSV" class="btn btn-outline">Descargar CSV</button>
            <button type="button" id="aikenWord" class="btn btn-primary">Descargar Word (APA 7)</button>
        </div>`);
    const zona = contenedor.querySelector('#aikenResultados');
    zona.innerHTML = partes.join('');
    zona.hidden = false;
    zona.querySelector('#aikenCopiar').addEventListener('click', copiarParrafo);
    zona.querySelector('#aikenCSV').addEventListener('click', () => descargarArchivo('\ufeff' + csvResultados(res), 'validez_contenido_aiken.csv', 'text/csv'));
    zona.querySelector('#aikenWord').addEventListener('click', descargarWord);
}

async function copiarParrafo() {
    if (!ultimoResultado) return;
    const texto = redactarParrafo(ultimoResultado);
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(texto); mostrarToast('Párrafo copiado', 'success'); return; }
    } catch (e) { /* permiso denegado: se cae al método clásico */ }
    const area = document.createElement('textarea');
    area.value = texto; document.body.appendChild(area); area.select();
    try { document.execCommand('copy'); mostrarToast('Párrafo copiado', 'success'); } catch (e) { mostrarToast('No se pudo copiar: selecciona el texto a mano', 'warning'); }
    area.remove();
}

async function descargarWord() {
    if (!ultimoResultado) return;
    const doc = documentoWord(ultimoResultado);
    const conversor = await asegurarHtmlDocx();
    const [blob, nombre] = conversor && conversor.asBlob
        ? [conversor.asBlob('<!DOCTYPE html>' + doc), 'validez_contenido_aiken.docx']
        : [new Blob(['\ufeff' + doc], { type: 'application/msword' }), 'validez_contenido_aiken.doc'];
    descargarBlob(blob, nombre);
    mostrarToast(nombre.endsWith('.docx') ? 'Validez de contenido exportada a Word (APA 7)' : 'Exportado en .doc: no se pudo cargar el conversor a .docx', nombre.endsWith('.docx') ? 'success' : 'warning');
}

// ---------------------------------------------------------------- montaje
export function montarValidezContenido() {
    contenedor = document.getElementById('validezContenidoContainer');
    if (!contenedor || contenedor.dataset.montado === '1') return;
    contenedor.dataset.montado = '1';
    contenedor.innerHTML = PLANTILLA();
    const guardado = restaurar();
    const valido = e => e && [e.minimo, e.maximo, e.confianza, e.v0].every(Number.isFinite) && Array.isArray(e.criterios);
    aplicarEstado(valido(guardado) ? guardado : { minimo: 1, maximo: 4, confianza: 0.95, v0: 0.70, criterios: null });
    ['aikenMinimo', 'aikenMaximo', 'aikenConfianza', 'aikenV0'].forEach(id => contenedor.querySelector('#' + id).addEventListener('change', () => {
        guardar();
        if (ultimoResultado) calcular();   // con resultados a la vista, se recalculan con la nueva configuración
    }));
    contenedor.querySelector('#aikenAgregarCriterio').addEventListener('click', () => { agregarCriterio('', ''); guardar(); });
    contenedor.querySelector('#aikenEjemplo').addEventListener('click', () => { aplicarEstado(EJEMPLO_AIKEN); guardar(); calcular(); mostrarToast('Ejemplo cargado: 10 ítems, 5 jueces, 3 criterios', 'success'); });
    contenedor.querySelector('#aikenVaciar').addEventListener('click', () => {
        const hayDatos = leerCriterios().some(c => c.texto.trim());
        if (hayDatos && typeof confirm === 'function' && !confirm('¿Vaciar la escala y todas las valoraciones pegadas? No se puede deshacer.')) return;
        aplicarEstado({ minimo: 1, maximo: 4, confianza: 0.95, v0: 0.70, criterios: null });
        ultimoResultado = null; contenedor.querySelector('#aikenResultados').hidden = true; mostrarMensajes([], []); guardar();
    });
    contenedor.querySelector('#aikenCalcular').addEventListener('click', calcular);
}

export function resultadoActual() { return ultimoResultado; }
