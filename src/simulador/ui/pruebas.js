// simulador/ui/pruebas.js — tarjeta I (escalas) y cuadro de tests: filas, sincronización, renombrados, CSV.
// Extraído de app.js (Fase 2) sin cambiar comportamiento; importaciones explícitas entre módulos.

import { actualizarLimitesPrueba, actualizarTodasLasPruebas, pistaPara } from './guia-coherencia.js';
import { escapeAttr, parsearLineaCSV } from '../../shared/csv.js';
import { descargarArchivo } from '../../shared/descargas.js';
import { mostrarToast } from '../../shared/toast.js';
import { renombrarEnEstructuras } from './estructura.js';
import { parametrosCensura } from '../dominio/censura.js';

const FILA_PRUEBA_VACIA = { prueba: '', nombre: '', numItems: '', distribucion: 'normal', media: '', de: '', min: '', max: '', alfa: '', invertidos: '', dificultades: '' };

// (Atlas, dimensión B2) con techo o suelo, la proporción de casos en el límite no se elige: la fijan la media, la DE y el
// rango de la escala. La nota la muestra en vivo (la misma cuenta que usan la validación y el informe)
function actualizarNotaCensura(fila) {
    const sel = fila.querySelector('[aria-label="Distribución"]'), nota = fila.querySelector('.nota-censura');
    if (!sel || !nota) return;
    const lado = sel.value;
    if (lado !== 'techo' && lado !== 'suelo') { nota.textContent = ''; return; }
    const num = et => parseFloat((fila.querySelector(`[aria-label="${et}"]`) || {}).value);
    const k = num('Número de ítems'), M = num('Media (M)'), DE = num('Desviación estándar (DE)'), mn = num('Mínimo por ítem'), mx = num('Máximo por ítem');
    // coherente con la validación: el techo o el suelo no se aplica a escalas de acierto/error (ítems de rango 1)
    if (Number.isFinite(mn) && Number.isFinite(mx) && mx - mn === 1 && k >= 2) { nota.textContent = `El ${lado} no se aplica a escalas de acierto/error.`; return; }
    const par = [k, M, DE, mn, mx].every(Number.isFinite) ? parametrosCensura(lado, M, DE, k * mn, k * mx) : null;
    nota.textContent = par ? `≈ ${(100 * par.pRedondeo).toFixed(0)} % de los casos en el ${lado === 'suelo' ? 'mínimo' : 'máximo'} (${par.limite}); se reconoce un efecto ${lado} con más del 15 %.` : 'Completa la media, la DE, el número de ítems y el rango (la media dentro del rango).';
}

function agregarFilaPrueba() {
    agregarFilaPruebaConDatos(FILA_PRUEBA_VACIA);
    mostrarToast('Fila agregada', 'success');
}

function eliminarFilaPrueba(fila) {
    const tbody = document.getElementById('bodyPruebas');
    const filas = tbody.querySelectorAll('.fila-prueba');
    if (filas.length <= 1) {
        mostrarToast('Debe haber al menos una prueba', 'warning');
        return;
    }
    fila.remove();
    mostrarToast('Fila eliminada', 'success');
}

// (C5) Escala dicotómica (Mín 0, Máx 1): se habilita «Dificultades» y la DE pasa a
// calcularse con el KR-20 y las dificultades (Var = Σp(1−p) / (1 − α·(k−1)/k)).
function actualizarDicotomicaFila(fila) {
    if (!fila) return;
    const q = et => fila.querySelector(`[aria-label="${et}"]`);
    const min = parseFloat((q('Mínimo por ítem') || {}).value), max = parseFloat((q('Máximo por ítem') || {}).value);
    const k = parseInt((q('Número de ítems') || {}).value, 10);
    const inpDif = q('Dificultades de los ítems'), inpDE = q('Desviación estándar (DE)');
    const dicot = isFinite(min) && isFinite(max) && (max - min) === 1 && k >= 2;
    if (inpDif) { inpDif.disabled = !dicot; if (!dicot) { inpDif.value = ''; inpDif.placeholder = '—'; } else inpDif.placeholder = 'Ej: 0.9, 0.7, 0.5…'; }
    if (!inpDE) return;
    // (revisión 2026.11.07) al dejar de ser de acierto/error se restauran la DE (y la media) que el usuario tenía: antes quedaba
    // la DE derivada de la KR-20 (8.74 → 0.86 tras un paso accidental por 0–1) y la escala se generaba casi sin varianza
    if (!dicot) {
        if (inpDE.dataset.dicotomica) {
            inpDE.readOnly = false; inpDE.title = ''; delete inpDE.dataset.dicotomica;
            if (inpDE.dataset.deUsuario !== undefined) { inpDE.value = inpDE.dataset.deUsuario; delete inpDE.dataset.deUsuario; }
            const m = q('Media (M)'); if (m && m.dataset.mediaUsuario !== undefined) { m.value = m.dataset.mediaUsuario; m.title = ''; delete m.dataset.mediaUsuario; }
        }
        return;
    }
    if (!inpDE.dataset.dicotomica) inpDE.dataset.deUsuario = inpDE.value;
    const media = parseFloat((q('Media (M)') || {}).value), alfa = parseFloat((q('Alfa de Cronbach objetivo') || {}).value);
    if (!isFinite(media) || typeof generadorDatos === 'undefined') return;
    let dificultades = null;
    try { dificultades = generadorDatos._parsearDificultades(inpDif ? inpDif.value : '', 'escala'); } catch (e) { dificultades = null; }
    const het = (document.getElementById('heterogeneidadItems') || {}).value || 'leve';
    const imp = generadorDatos._dicotomicaImplicita({ numItems: k, minimo: min, maximo: max, media, alfa: isFinite(alfa) ? alfa : 0.7, dificultades: dificultades && dificultades.length === k ? dificultades : null, tipo: 'dimension' }, het);
    inpDE.value = (Math.round(imp.desviacion * 100) / 100).toString();
    inpDE.readOnly = true; inpDE.dataset.dicotomica = '1';
    inpDE.title = `DE calculada: ítems dicotómicos, KR-20 ${isFinite(alfa) ? alfa : 0.7} y dificultades ${dificultades && dificultades.length === k ? 'dadas' : 'repartidas'}`;
    if (dificultades && dificultades.length === k && q('Media (M)')) { const m = q('Media (M)'); if (Math.abs(parseFloat(m.value) - imp.media) > 0.005) { if (m.dataset.mediaUsuario === undefined) m.dataset.mediaUsuario = m.value; m.value = (Math.round(imp.media * 100) / 100).toString(); m.title = 'Media = suma de las dificultades'; } }
}

function agregarFilaPruebaConDatos(datos) {
    const tbody = document.getElementById('bodyPruebas');
    const nuevaFila = document.createElement('tr');
    nuevaFila.className = 'fila-prueba';
    const dist = datos.distribucion || 'normal';
    const opcion = (valor, etiqueta) => `<option value="${valor}"${dist === valor ? ' selected' : ''}>${etiqueta}</option>`;
    nuevaFila.innerHTML = `
        <td><select class="input input-sm" aria-label="Nombre de la prueba"></select></td>
        <td><input type="text" class="input input-sm" placeholder="Ej: Memoria de trabajo" maxlength="100" value="${datos.nombre}" aria-label="Nombre de la escala"></td>
        <td><input type="number" class="input input-sm" placeholder="Ej: 60" min="1" value="${datos.numItems}" aria-label="Número de ítems"></td>
        <td>
            <select class="input input-sm" aria-label="Distribución">
                ${opcion('normal', 'Normal')}${opcion('uniforme', 'Uniforme')}${opcion('asimetrica', 'Asimétrica')}${opcion('techo', 'Con techo')}${opcion('suelo', 'Con suelo')}
            </select>
            <div class="nota-censura help-text" style="font-size:0.8em;margin-top:2px;max-width:14rem;"></div>
        </td>
        <td><input type="number" class="input input-sm" placeholder="Ej: 100" step="0.01" value="${datos.media}" aria-label="Media (M)"></td>
        <td><input type="number" class="input input-sm" placeholder="Ej: 15" step="0.01" min="0.01" value="${datos.de}" aria-label="Desviación estándar (DE)"></td>
        <td><input type="number" class="input input-sm" placeholder="Ej: 0" step="1" value="${datos.min}" aria-label="Mínimo por ítem"></td>
        <td><input type="number" class="input input-sm" placeholder="Ej: 5" step="1" value="${datos.max}" aria-label="Máximo por ítem"></td>
        <td><input type="number" class="input input-sm" placeholder="Ej: 0.85" step="0.01" min="0" max="0.99" value="${datos.alfa || ''}" aria-label="Alfa de Cronbach objetivo"></td>
        <td><input type="number" class="input input-sm" placeholder="0" step="1" min="0" value="${datos.invertidos || ''}" aria-label="Ítems invertidos" title="Cuántos ítems de esta escala se puntúan al revés (se guardan reflejados, como en una base real: hay que recodificarlos antes de sumar). Son los ÚLTIMOS de la escala."></td>
        <td><input type="text" class="input input-sm" placeholder="—" maxlength="600" value="${escapeAttr(datos.dificultades || '')}" aria-label="Dificultades de los ítems" title="Solo en escalas dicotómicas (Mín 0, Máx 1): proporción de unos por ítem, separadas por coma. Vacío = repartidas alrededor de Media/ítems según la heterogeneidad." disabled></td>
        <td>
            <button type="button" class="btn-icon btn-delete" title="Eliminar" aria-label="Eliminar fila">
                <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 4H13M5 4V3C5 2.44772 5.44772 2 6 2H10C10.5523 2 11 2.44772 11 3V4M6 7V11M10 7V11M4 4H12L11.5 13C11.5 13.5523 11.0523 14 10.5 14H5.5C4.94772 14 4.5 13.5523 4.5 13L4 4Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
            </button>
        </td>
    `;
    // (Atlas, dimensión B2) la nota del techo o el suelo sigue a la media, la DE, el número de ítems y el rango
    nuevaFila.addEventListener('input', () => actualizarNotaCensura(nuevaFila));
    nuevaFila.addEventListener('change', () => actualizarNotaCensura(nuevaFila));
    tbody.appendChild(nuevaFila);
    actualizarNotaCensura(nuevaFila);   // también al crearla con datos (importar un CSV, reconstruir la tabla)
    // El desplegable se puebla con los tests del cuadro superior y se
    // preselecciona el que traiga el dato (importación/restauración).
    refrescarSelectoresDePrueba();
    const sel = nuevaFila.querySelector('[aria-label="Nombre de la prueba"]');
    if (sel && datos.prueba) {
        if (!Array.from(sel.options).some(o => o.value === datos.prueba)) {
            agregarFilaTestConDatos({ prueba: datos.prueba, variable: '' });   // test implícito de un CSV antiguo
            refrescarSelectoresDePrueba();
        }
        sel.value = datos.prueba;
    }
    actualizarLimitesPrueba(nuevaFila);
    actualizarDicotomicaFila(nuevaFila);
    return nuevaFila;
}

// ========================================
// IMPORTAR/EXPORTAR CONFIGURACIONES
// ========================================
// PRUEBAS APLICADAS


// ---- Ayudantes compartidos por los exportadores/importadores (fuente única) ----
// Generan el MISMO CSV que los botones individuales de cada tabla.
function csvDeTabla(selectorFilas, tipo) {
    const esc = v => (String(v).includes(',') ? `"${v}"` : String(v));
    if (tipo === 'pruebas') {
        let csv = 'Prueba,Escala,NumItems,Distribucion,Media,DE,MinItem,MaxItem,Alfa,Invertidos,Dificultades\n';
        document.querySelectorAll(selectorFilas).forEach(fila => {
            const inputs = fila.querySelectorAll('input');
            const selPrueba = fila.querySelector('[aria-label="Nombre de la prueba"]');
            const selectDist = fila.querySelector('[aria-label="Distribución"]');
            const dif = fila.querySelector('[aria-label="Dificultades de los ítems"]');
            csv += `${esc(selPrueba ? selPrueba.value.trim() : '')},${esc(inputs[0].value.trim())},`
                + `${inputs[1].value || ''},${selectDist ? selectDist.value : 'normal'},${inputs[2].value || ''},`
                + `${inputs[3].value || ''},${inputs[4].value || ''},${inputs[5].value || ''},${inputs[6] ? (inputs[6].value || '') : ''},${inputs[7] ? (inputs[7].value || '') : ''},${esc(dif && !dif.disabled ? dif.value.trim() : '')}\n`;
        });
        return csv;
    }
    let csv = 'Categoria,Distribucion,Promedio,DE,Minimo,Maximo,Decimales,Opciones,DependeDe,Fuerza\n';
    document.querySelectorAll(selectorFilas).forEach(fila => {
        const inputs = fila.querySelectorAll('input');
        const select = fila.querySelector('select');
        const depende = fila.querySelector('[aria-label="Depende de"]');
        csv += `${esc(inputs[0].value.trim())},${select ? select.value : 'normal'},${inputs[1].value || ''},`
            + `${inputs[2].value || ''},${inputs[3].value || ''},${inputs[4].value || ''},${inputs[5].value || ''},`
            + `${esc(inputs[6] ? inputs[6].value.trim() : '')},${esc(depende ? depende.value : '')},${inputs[7] ? (inputs[7].value || '') : ''}\n`;
    });
    return csv;
}

// Aplica un CSV de PRUEBAS a la tabla I (misma compatibilidad de formatos que
// el importador individual: nuevo con Tipo, intermedio y antiguo). Devuelve nº de filas.
function aplicarCSVPruebas(csv) {
    const lineas = String(csv || '').trim().split(/\r?\n/).filter(l => l.trim());
    if (lineas.length < 2) return 0;
    const enc = lineas[0].toLowerCase();
    const tienePruebaEscala = enc.includes('escala');
    const tieneTipo = enc.includes('tipo');          // formato antiguo: la columna se ignora
    const tieneDistribucion = enc.includes('distribucion');
    const tbody = document.getElementById('bodyPruebas');
    if (tbody) tbody.innerHTML = '';
    let n = 0;
    for (const linea of lineas.slice(1)) {
        const v = parsearLineaCSV(linea.trim());
        if (v.length < 4) continue;
        if (tienePruebaEscala) {
            const off = tieneTipo ? 1 : 0;
            // Las filas «General» de bases antiguas se descartan: el puntaje
            // general ahora se calcula solo (promedio de las dimensiones).
            if (tieneTipo && String(v[2] || '').toLowerCase() === 'general') continue;
            agregarFilaPruebaConDatos({
                prueba: v[0] || '', nombre: v[1] || '',
                numItems: v[2 + off] || '', distribucion: v[3 + off] || 'normal',
                media: v[4 + off] || '', de: v[5 + off] || '',
                min: v[6 + off] || '', max: v[7 + off] || '', alfa: v[8 + off] || '',
                invertidos: v[9 + off] || '', dificultades: v[10 + off] || ''
            });
        } else if (tieneDistribucion) {
            agregarFilaPruebaConDatos({ prueba: v[0] || '', nombre: v[0] || '', numItems: v[1] || '',
                distribucion: v[2] || 'normal', media: v[3] || '', de: v[4] || '', min: v[5] || '', max: v[6] || '', alfa: v[7] || '' });
        } else {
            agregarFilaPruebaConDatos({ prueba: v[0] || '', nombre: v[0] || '', numItems: v[1] || '',
                distribucion: 'normal', media: v[2] || '', de: v[3] || '', min: v[4] || '', max: v[5] || '', alfa: v[6] || '' });
        }
        n++;
    }
    return n;
}

function exportarConfigPruebas() {
    try {
        const filas = document.querySelectorAll('#bodyPruebas .fila-prueba');
        if (filas.length === 0) {
            mostrarToast('No hay pruebas para exportar', 'warning');
            return;
        }
        // Mismo formato que el archivo maestro (con Invertidos y sin la columna Tipo)
        descargarArchivo(csvDeTabla('#bodyPruebas .fila-prueba', 'pruebas'), 'configuracion_pruebas.csv', 'text/csv');
        mostrarToast('Configuración de pruebas exportada exitosamente', 'success');
    } catch (error) {
        mostrarToast('Error al exportar: ' + error.message, 'error');
    }
}

function importarConfigPruebas(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (event) {
        try {
            const csv = event.target.result;
            if (!String(csv).trim().split(/\r?\n/)[0].toLowerCase().includes('numitems')) {
                mostrarToast('El archivo CSV no tiene el formato correcto. Encabezados esperados: Prueba,Escala,NumItems,Distribucion,Media,DE,MinItem,MaxItem,Alfa,Invertidos', 'error');
                return;
            }
            const n = aplicarCSVPruebas(csv);   // misma compatibilidad de formatos que el archivo maestro
            sincronizarDimensionesDesdeTests(true);
            actualizarTodasLasPruebas();
            mostrarToast(`Configuración importada: ${n} pruebas`, 'success');
        } catch (error) {
            mostrarToast('Error al importar: ' + error.message, 'error');
        }
    };
    reader.onerror = function () {
        mostrarToast('No se pudo leer el archivo', 'error');
    };
    reader.readAsText(file);
    e.target.value = ''; // Limpiar input
}

// ===================== CUADRO DE PRUEBAS (TESTS) =====================
// Define qué tests existen y qué variable psicológica mide cada uno. Alimenta
// el desplegable «Prueba (test)» de la tabla de escalas.
function agregarFilaTestConDatos(datos = {}) {
    const tbody = document.getElementById('bodyTests');
    if (!tbody) return;
    const fila = document.createElement('tr');
    fila.className = 'fila-test';
    fila.innerHTML = `
        <td><input type="text" class="input input-sm" placeholder="Ej: EQ-i:YV" maxlength="100" value="${datos.prueba || ''}" aria-label="Nombre del test"></td>
        <td><input type="text" class="input input-sm" placeholder="Ej: Inteligencia emocional" maxlength="100" value="${datos.variable || ''}" aria-label="Variable psicológica"></td>
        <td><input type="text" class="input input-sm" placeholder="Ej: Intrapersonal, Interpersonal, Adaptabilidad" maxlength="400" value="${(datos.dimensiones || []).join(', ')}" aria-label="Dimensiones del test" title="Separadas por coma. Al salir del campo, la tabla de escalas se completa con una fila por dimensión."></td>
        <td><input type="number" class="input input-sm" step="0.05" min="-0.99" max="0.99" value="${datos.rIntra !== undefined && datos.rIntra !== '' ? datos.rIntra : '0.40'}" aria-label="Correlación entre dimensiones" title="Correlación esperada entre las dimensiones de este test (las subescalas de un mismo instrumento suelen correlacionar entre 0.30 y 0.60). Una pareja fijada en la tabla III prevalece sobre este valor."></td>
        <td>
            <button type="button" class="btn-icon btn-delete" title="Eliminar" aria-label="Eliminar test">
                <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 4H13M5 4V3C5 2.44772 5.44772 2 6 2H10C10.5523 2 11 2.44772 11 3V4M6 7V11M10 7V11M4 4H12L11.5 13C11.5 13.5523 11.0523 14 10.5 14H5.5C4.94772 14 4.5 13.5523 4.5 13L4 4Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
            </button>
        </td>`;
    tbody.appendChild(fila);
    fila.querySelector('[aria-label="Nombre del test"]').addEventListener('input', () => { refrescarSelectoresDePrueba(); actualizarEstadoTest(fila); });
    fila.querySelector('[aria-label="Dimensiones del test"]').addEventListener('change', () => sincronizarDimensionesDesdeTests());
    fila.querySelector('[aria-label="Dimensiones del test"]').addEventListener('input', () => actualizarEstadoTest(fila));
    fila.querySelector('[aria-label="Dimensiones del test"]').dataset.previo = JSON.stringify(datos.dimensiones || []);
    refrescarSelectoresDePrueba();
    actualizarEstadoTest(fila);
}

// (2026.10.03) Lo que significa el número de dimensiones declaradas:
//  · una sola → test unidimensional (p. ej. el Raven): esa escala ES su variable general
//    (columna General_ en la base, suma de sus ítems) y la r entre dimensiones no aplica;
//  · ninguna  → no se crearía ninguna escala: se avisa qué escribir;
//  · dos o más → dimensiones de un test con puntaje General derivado (promedio de ellas).
function actualizarEstadoTest(fila) {
    if (!fila) return;
    const nombre = ((fila.querySelector('[aria-label="Nombre del test"]') || {}).value || '').trim();
    const inpDims = fila.querySelector('[aria-label="Dimensiones del test"]');
    const inpR = fila.querySelector('[aria-label="Correlación entre dimensiones"]');
    if (!inpDims) return;
    const dims = _listaDimensiones(inpDims.value);
    const unidimensional = dims.length === 1;
    if (inpR) { inpR.disabled = unidimensional; inpR.title = unidimensional ? 'No aplica: el test es unidimensional (una sola escala, que es su variable general)' : ''; }
    const pista = pistaPara(inpDims, 'pista-dimensiones');
    pista.classList.toggle('aviso', !!nombre && dims.length === 0);
    if (unidimensional) pista.textContent = `Test unidimensional: «${dims[0]}» es su variable general (columna General_ en la base). La r entre dimensiones no aplica.`;
    else if (nombre && dims.length === 0) pista.textContent = 'Escribe al menos una dimensión. Si el test no tiene dimensiones (p. ej., el Raven), escribe aquí la variable que mide: será su única escala y su variable general.';
    else pista.textContent = '';
    pista.hidden = !pista.textContent;
}

// ---- Sincronización cuadro de tests ⇄ tabla de escalas ----
const _claveEscala = (p, e) => `${String(p).trim().toLowerCase()}|${String(e).trim().toLowerCase()}`;

const _camposFilaPrueba = f => ({ sel: f.querySelector('[aria-label="Nombre de la prueba"]'), inp: f.querySelector('[aria-label="Nombre de la escala"]') });

function _filasPruebaDe(prueba) {
    return Array.from(document.querySelectorAll('#bodyPruebas .fila-prueba')).filter(f => { const { sel } = _camposFilaPrueba(f); return sel && sel.value.trim().toLowerCase() === String(prueba).trim().toLowerCase(); });
}

function _filaPruebaPor(prueba, escala) {
    return _filasPruebaDe(prueba).find(f => { const { inp } = _camposFilaPrueba(f); return inp && inp.value.trim().toLowerCase() === String(escala).trim().toLowerCase(); }) || null;
}

// Una fila tiene datos si alguno de sus campos numéricos está completo.
function _filaPruebaConDatos(f) {
    return ['Número de ítems', 'Media (M)', 'Desviación estándar (DE)', 'Mínimo por ítem', 'Máximo por ítem', 'Alfa de Cronbach objetivo'].some(et => { const el = f.querySelector(`[aria-label="${et}"]`); return el && el.value.trim() !== ''; });
}

// Cambia el nombre de una escala en los desplegables de las tablas III–VI
// (correlaciones, diferencias, modelos, medidas repetidas) sin perder la selección.
function renombrarVariableEnTablas(viejo, nuevo) {
    if (!viejo || !nuevo || viejo === nuevo) return 0;
    let cambios = 0;
    // (Revisión transversal, F5) también las tablas VIII y IX, la referencia del MAR y «Depende de»
    document.querySelectorAll('#bodyCorrelaciones select, #bodyDiferencias select, #bodyModelos select, #bodyRepetidas select, #bodyCortes select, #bodyDesenlaces select, #bodyConcordancia select, #referenciaMAR, #bodySocio select[aria-label="Depende de"]').forEach(sel => {
        Array.from(sel.options).forEach(op => { if (op.value === viejo) { op.value = nuevo; op.textContent = nuevo; cambios++; } });
    });
    return cambios;
}

function _renombrarFilaPrueba(fila, nuevo) {
    const { inp } = _camposFilaPrueba(fila);
    const viejo = inp.value.trim();
    if (viejo === nuevo) return;
    inp.value = nuevo;
    inp.dataset.anterior = nuevo;
    renombrarVariableEnTablas(viejo, nuevo);
    renombrarEnEstructuras(viejo, nuevo);
    if (typeof actualizarLimitesPrueba === 'function') actualizarLimitesPrueba(fila);
}

// Completa la tabla de escalas con una fila (test, dimensión) por cada
// dimensión declarada arriba que aún no exista, y propaga los RENOMBRADOS:
// comparando la lista anterior de cada test con la nueva, un cambio solo de
// mayúsculas o acentos renombra la fila; si desaparece una dimensión y aparece
// otra en la misma posición (o es la única que cambia), también se trata como
// renombrado. Nunca borra filas (eso lo hace «Actualizar desde las pruebas»).
// Reutiliza la fila vacía inicial antes de añadir otras.
function sincronizarDimensionesDesdeTests(silencioso = false) {
    const tbody = document.getElementById('bodyPruebas');
    if (!tbody) return 0;
    let creadas = 0, renombradas = 0;
    document.querySelectorAll('#bodyTests .fila-test').forEach(filaTest => {
        const prueba = (filaTest.querySelector('[aria-label="Nombre del test"]') || {}).value || '';
        const inpDims = filaTest.querySelector('[aria-label="Dimensiones del test"]');
        if (!prueba.trim() || !inpDims) return;
        const nuevas = _listaDimensiones(inpDims.value);
        let previas = [];
        try { previas = JSON.parse(inpDims.dataset.previo || '[]'); } catch (e) { previas = []; }
        const norm = s => String(s).trim().toLowerCase();
        // 1) renombrados solo de forma (mayúsculas/acentos): misma clave normalizada
        const pendientes = [];
        nuevas.forEach((dim, i) => {
            const fila = _filaPruebaPor(prueba, dim);
            if (fila) { if (_camposFilaPrueba(fila).inp.value.trim() !== dim) { _renombrarFilaPrueba(fila, dim); renombradas++; } return; }
            pendientes.push({ dim, i });
        });
        // 2) renombrados de fondo: dimensiones que desaparecieron y cuya fila sigue
        const desaparecidas = previas.filter(p => !nuevas.some(n => norm(n) === norm(p))).map(p => ({ dim: p, i: previas.findIndex(x => norm(x) === norm(p)), fila: _filaPruebaPor(prueba, p) })).filter(d => d.fila);
        pendientes.slice().forEach(pend => {
            let cand = desaparecidas.find(d => d.i === pend.i);
            if (!cand && desaparecidas.length === 1 && pendientes.length === 1) cand = desaparecidas[0];
            if (!cand) return;
            _renombrarFilaPrueba(cand.fila, pend.dim); renombradas++;
            desaparecidas.splice(desaparecidas.indexOf(cand), 1);
            pendientes.splice(pendientes.indexOf(pend), 1);
        });
        // 3) las que quedan son nuevas: fila vacía primero, luego filas nuevas
        pendientes.forEach(({ dim }) => {
            const vacia = Array.from(tbody.querySelectorAll('.fila-prueba')).find(f => { const { sel, inp } = _camposFilaPrueba(f); return sel && inp && !sel.value && !inp.value.trim(); });
            if (vacia) {
                refrescarSelectoresDePrueba();
                const { sel, inp } = _camposFilaPrueba(vacia);
                sel.value = prueba; inp.value = dim;
                if (typeof actualizarLimitesPrueba === 'function') actualizarLimitesPrueba(vacia);
            } else {
                agregarFilaPruebaConDatos(Object.assign({}, FILA_PRUEBA_VACIA, { prueba, nombre: dim }));
            }
            creadas++;
        });
        inpDims.dataset.previo = JSON.stringify(nuevas);
    });
    if ((creadas || renombradas) && typeof actualizarTodasLasPruebas === 'function') actualizarTodasLasPruebas();
    if (!silencioso && (creadas || renombradas)) {
        const partes = [];
        if (creadas) partes.push(`${creadas} fila(s) añadida(s) a la tabla de escalas`);
        if (renombradas) partes.push(`${renombradas} renombrada(s)`);
        mostrarToast(partes.join(' · ') + (creadas ? ': completa ítems, media y DE' : ''), 'success');
    }
    return creadas + renombradas;
}

function _listaDimensiones(texto) {
    const dims = String(texto || '').split(',').map(s => s.trim()).filter(Boolean);
    return dims.filter((d, i) => dims.findIndex(x => x.toLowerCase() === d.toLowerCase()) === i);
}

// «Actualizar desde las pruebas»: la tabla de escalas queda exactamente como
// el cuadro de arriba: mismas filas (creando las que falten, en el mismo
// orden) y sin las que no estén declaradas. Las filas que se quedan
// conservan sus datos; si alguna de las que se eliminan tenía datos, se pide
// confirmación.
function reconstruirTablaDesdeTests() {
    const tbody = document.getElementById('bodyPruebas');
    if (!tbody) return;
    sincronizarDimensionesDesdeTests(true);
    const orden = [];
    testsDefinidos().forEach(t => (t.dimensiones || []).forEach(dim => { const f = _filaPruebaPor(t.prueba, dim); if (f && !orden.includes(f)) orden.push(f); }));
    const sobrantes = Array.from(tbody.querySelectorAll('.fila-prueba')).filter(f => !orden.includes(f));
    const conDatos = sobrantes.filter(_filaPruebaConDatos);
    if (conDatos.length && typeof window !== 'undefined' && typeof window.confirm === 'function') {
        const nombres = conDatos.map(f => _camposFilaPrueba(f).inp.value.trim() || '(sin nombre)').join(', ');
        if (!window.confirm(`Se eliminarán ${sobrantes.length} fila(s) que no figuran en las dimensiones declaradas; ${conDatos.length} de ellas tienen datos: ${nombres}. ¿Continuar?`)) return;
    }
    sobrantes.forEach(f => f.remove());
    orden.forEach(f => tbody.appendChild(f));   // reordena siguiendo el cuadro de arriba
    if (!tbody.querySelector('.fila-prueba')) agregarFilaPruebaConDatos(FILA_PRUEBA_VACIA);
    if (typeof actualizarTodasLasPruebas === 'function') actualizarTodasLasPruebas();
    mostrarToast(`Tabla de escalas actualizada: ${orden.length} fila(s) según las pruebas` + (sobrantes.length ? `, ${sobrantes.length} eliminada(s)` : ''), 'success');
}

// Reflejo hacia arriba: una fila escrita o renombrada a mano en la tabla de
// escalas se anota en las dimensiones de su prueba (y el nombre anterior se
// sustituye donde se use).
function reflejarFilaEnTests(fila) {
    if (!fila) return;
    const { sel, inp } = _camposFilaPrueba(fila);
    if (!sel || !inp) return;
    const prueba = sel.value.trim(), nuevo = inp.value.trim();
    const anterior = (inp.dataset.anterior || '').trim();
    if (anterior && nuevo && anterior !== nuevo) { renombrarVariableEnTablas(anterior, nuevo); renombrarEnEstructuras(anterior, nuevo); }
    inp.dataset.anterior = nuevo;
    // si la fila cambió de prueba, la dimensión deja la lista de la prueba anterior
    // (salvo que otra fila de esa prueba siga usándola)
    const pruebaAnterior = (sel.dataset.anterior || '').trim();
    if (pruebaAnterior && pruebaAnterior !== prueba && nuevo && !_filaPruebaPor(pruebaAnterior, nuevo)) {
        const filaTestAnt = Array.from(document.querySelectorAll('#bodyTests .fila-test')).find(f => ((f.querySelector('[aria-label="Nombre del test"]') || {}).value || '').trim() === pruebaAnterior);
        const inpAnt = filaTestAnt ? filaTestAnt.querySelector('[aria-label="Dimensiones del test"]') : null;
        if (inpAnt) { const l = _listaDimensiones(inpAnt.value).filter(d => d.toLowerCase() !== nuevo.toLowerCase()); inpAnt.value = l.join(', '); inpAnt.dataset.previo = JSON.stringify(l); actualizarEstadoTest(filaTestAnt); }
    }
    sel.dataset.anterior = prueba;
    if (!prueba || !nuevo) return;
    const filaTest = Array.from(document.querySelectorAll('#bodyTests .fila-test')).find(f => ((f.querySelector('[aria-label="Nombre del test"]') || {}).value || '').trim() === prueba);
    if (!filaTest) return;
    const inpDims = filaTest.querySelector('[aria-label="Dimensiones del test"]');
    if (!inpDims) return;
    const lista = _listaDimensiones(inpDims.value);
    const iAnt = anterior ? lista.findIndex(d => d.toLowerCase() === anterior.toLowerCase()) : -1;
    const iNuevo = lista.findIndex(d => d.toLowerCase() === nuevo.toLowerCase());
    if (iNuevo >= 0) { if (lista[iNuevo] !== nuevo) lista[iNuevo] = nuevo; }
    else if (iAnt >= 0 && !_filaPruebaPor(prueba, anterior)) lista[iAnt] = nuevo;   // renombrado: sustituye
    else lista.push(nuevo);                                                          // alta manual: se anota
    inpDims.value = lista.join(', ');
    inpDims.dataset.previo = JSON.stringify(lista);
    actualizarEstadoTest(filaTest);
}

function agregarFilaTest() { agregarFilaTestConDatos({}); }

// Nombres de test definidos arriba (sin vacíos ni repetidos).
function testsDefinidos() {
    const out = [];
    document.querySelectorAll('#bodyTests .fila-test').forEach(f => {
        const nombre = (f.querySelector('[aria-label="Nombre del test"]') || {}).value || '';
        const variable = (f.querySelector('[aria-label="Variable psicológica"]') || {}).value || '';
        const rIntra = (f.querySelector('[aria-label="Correlación entre dimensiones"]') || {}).value || '';
        const dims = ((f.querySelector('[aria-label="Dimensiones del test"]') || {}).value || '').split(',').map(s => s.trim()).filter(Boolean);
        const dimensiones = dims.filter((d, i) => dims.findIndex(x => x.toLowerCase() === d.toLowerCase()) === i);
        if (nombre.trim() && !out.some(x => x.prueba === nombre.trim())) out.push({ prueba: nombre.trim(), variable: variable.trim(), rIntra: rIntra.trim(), dimensiones });
    });
    return out;
}

// Repuebla los desplegables de la tabla de escalas conservando la selección.
function refrescarSelectoresDePrueba() {
    const tests = testsDefinidos();
    document.querySelectorAll('#bodyPruebas .fila-prueba [aria-label="Nombre de la prueba"]').forEach(sel => {
        if (!sel || sel.tagName !== 'SELECT') return;
        const actual = sel.value;
        sel.innerHTML = '<option value="">— elige un test —</option>'
            + tests.map(t => `<option value="${t.prueba}"${t.prueba === actual ? ' selected' : ''}>${t.prueba}</option>`).join('');
        if (actual && !tests.some(t => t.prueba === actual)) sel.value = '';
    });
}

// CSV de correlaciones (reutilizado por el exportador maestro).
function csvDeTests() {
    let csv = 'Prueba,Variable,CorrDimensiones,Dimensiones\n';
    testsDefinidos().forEach(t => {
        const esc = v => (String(v).includes(',') ? `"${v}"` : String(v));
        csv += `${esc(t.prueba)},${esc(t.variable)},${t.rIntra},${esc((t.dimensiones || []).join(', '))}\n`;
    });
    return csv;
}

function aplicarCSVTests(csv) {
    const lineas = String(csv || '').trim().split(/\r?\n/).filter(l => l.trim());
    if (lineas.length < 2) return 0;
    const tbody = document.getElementById('bodyTests');
    if (tbody) tbody.innerHTML = '';
    let n = 0;
    for (const linea of lineas.slice(1)) {
        const v = parsearLineaCSV(linea);
        if (!v[0]) continue;
        agregarFilaTestConDatos({ prueba: v[0], variable: v[1] || '', rIntra: v[2] !== undefined ? v[2] : '', dimensiones: String(v[3] || '').split(',').map(s => s.trim()).filter(Boolean) });
        n++;
    }
    refrescarSelectoresDePrueba();
    return n;
}

// Nombres de los puntajes generales derivados tal como aparecen en los desplegables
function nombresGeneralesDerivados() {
    const filasPorTest = {};
    document.querySelectorAll('#bodyPruebas .fila-prueba').forEach(fila => {
        const sel = fila.querySelector('[aria-label="Nombre de la prueba"]');
        const p = sel ? sel.value.trim() : '';
        if (p) filasPorTest[p] = (filasPorTest[p] || 0) + 1;
    });
    return (typeof testsDefinidos === 'function' ? testsDefinidos() : [])
        .filter(t => (filasPorTest[t.prueba] || 0) >= 2)
        .map(t => (t.variable ? `${t.variable} — ${t.prueba}` : `Puntaje general — ${t.prueba}`));
}

export { FILA_PRUEBA_VACIA, agregarFilaPrueba, eliminarFilaPrueba, actualizarDicotomicaFila, agregarFilaPruebaConDatos, csvDeTabla, aplicarCSVPruebas, exportarConfigPruebas, importarConfigPruebas, agregarFilaTestConDatos, _claveEscala, _camposFilaPrueba, _filasPruebaDe, _filaPruebaPor, _filaPruebaConDatos, renombrarVariableEnTablas, _renombrarFilaPrueba, sincronizarDimensionesDesdeTests, _listaDimensiones, reconstruirTablaDesdeTests, reflejarFilaEnTests, agregarFilaTest, testsDefinidos, refrescarSelectoresDePrueba, csvDeTests, aplicarCSVTests, nombresGeneralesDerivados };
