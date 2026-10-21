// simulador/ui/estructura.js — tarjeta VII (estructura factorial: matriz de cargas y panel).
// Extraído de app.js (Fase 2) sin cambiar comportamiento; importaciones explícitas entre módulos.

import { campoCSV, escapeAttr, parsearLineaCSV } from '../../shared/csv.js';
import { mostrarToast } from '../../shared/toast.js';
import { barajar } from '../../core/random/permutacion.js';
import { excesoDeJson } from '../../core/data/json-acotado.js';

// ---- (C1) Tarjeta VII: estructura factorial de cada test ----
// Estado por test: { modo, factores, cargas: { <dimensión>: [[λ por factor] por ítem] }, metodo: {carga}|null, desajuste }.
// Se persiste como JSON en #estructurasJSON, que es lo que lee el generador (recolectarEstructuras).
// (2026.12.31, cuarta revisión) sin prototipo: un test llamado «constructor» o «__proto__» (de un maestro ajeno) no tiene
// una estructura heredada (la tarjeta lo marcaba con ✓ y «Generar» fallaba con un error de JavaScript)
const estructurasUI = Object.create(null);

/**
 * Lo más que trae la estructura de un test en el maestro (un JSON por línea): sus factores y la carga de cada ítem, con
 * holgura; medida antes de leerla (core/data/json-acotado.js), porque el maestro puede ser de otra persona.
 * @type {import('../../core/data/json-acotado.js').TopesJson}
 */
const TOPES_JSON_ESTRUCTURA = { profundidad: 8, contenedores: 100000, elementos: 1000000 };

function testsConItems() {
    const porTest = new Map();
    document.querySelectorAll('#bodyPruebas .fila-prueba').forEach(f => {
        const v = et => { const el = f.querySelector(`[aria-label="${et}"]`); return el ? el.value : ''; };
        const prueba = v('Nombre de la prueba').trim(), nombre = v('Nombre de la escala').trim();
        const k = parseInt(v('Número de ítems'), 10);
        if (!prueba || !nombre || !(k >= 2)) return;
        // (C5) las dicotómicas no entran en la matriz de cargas (correlaciones tetracóricas)
        if (isFinite(parseFloat(v('Mínimo por ítem'))) && isFinite(parseFloat(v('Máximo por ítem'))) && parseFloat(v('Máximo por ítem')) - parseFloat(v('Mínimo por ítem')) === 1) return;
        if (!porTest.has(prueba)) porTest.set(prueba, []);
        porTest.get(prueba).push({ nombre, numItems: k, invertidos: parseInt(v('Ítems invertidos'), 10) || 0, alfa: parseFloat(v('Alfa de Cronbach objetivo')), minimo: parseFloat(v('Mínimo por ítem')), maximo: parseFloat(v('Máximo por ítem')), desviacion: parseFloat(v('Desviación estándar (DE)')) });
    });
    return Array.from(porTest, ([prueba, dims]) => ({ prueba, dims }));
}

function poblarSelectorEstructura() {
    const sel = document.getElementById('selectorTestEstructura');
    if (!sel) return;
    const actual = sel.value;
    const tests = testsConItems();
    sel.innerHTML = '<option value="">Elige un test de la tabla I…</option>' + tests.map(t => `<option value="${escapeAttr(t.prueba)}"${t.prueba === actual ? ' selected' : ''}>${escapeAttr(t.prueba)}${estructurasUI[t.prueba] ? ' ✓' : ''}</option>`).join('');
    if (actual && !tests.some(t => t.prueba === actual)) sel.value = '';
}

// Carga propia propuesta para una dimensión a partir de su α (u ω): media λ tal
// que α = kλ²/(1 + (k − 1)λ²), con la dispersión de la heterogeneidad elegida.
function cargasPropuestas(dim) {
    const k = dim.numItems;
    const alfa = (dim.alfa > 0 && dim.alfa < 1) ? dim.alfa : 0.80;
    const l2 = alfa / (k - alfa * (k - 1));
    const media = Math.max(0.3, Math.min(0.9, Math.sqrt(Math.max(0.05, l2))));
    const het = (document.getElementById('heterogeneidadItems') || {}).value || 'leve';
    const disp = { ninguna: 0, leve: 0.05, moderada: 0.10, alta: 0.15 }[het] || 0.05;
    // (2026.12.25) un barajado uniforme (el del núcleo); ordenar con un comparador aleatorio no lo es
    const orden = barajar(Array.from({ length: k }, (_, i) => i), Math.random);
    return Array.from({ length: k }, (_, i) => +Math.max(0.15, Math.min(0.95, media + disp * (k > 1 ? (2 * orden[i] / (k - 1) - 1) : 0))).toFixed(2));
}

// Reconcilia la estructura guardada de un test con la tabla I (dimensiones,
// ítems, orden) conservando lo ya escrito; crea la estructura si no existe.
function estructuraReconciliada(prueba) {
    const test = testsConItems().find(t => t.prueba === prueba);
    if (!test) return null;
    const previa = estructurasUI[prueba] || { modo: 'cargas', metodo: null, desajuste: 'ninguno', cargas: {} };
    const factores = test.dims.map(d => d.nombre);
    // (cuarta revisión) por dimensión, sin heredar: una dimensión «constructor» no tiene la función del prototipo por cargas
    const cargas = Object.create(null);
    test.dims.forEach((d, di) => {
        const antes = (previa.cargas && Object.prototype.hasOwnProperty.call(previa.cargas, d.nombre) && previa.cargas[d.nombre]) || [];
        const propuesta = cargasPropuestas(d);
        const filas = [];
        for (let i = 0; i < d.numItems; i++) {
            const fila = new Array(factores.length).fill(0);
            factores.forEach((f, fi) => {
                const viejaCol = (previa.factores || []).indexOf(f);
                let v = (antes[i] && viejaCol >= 0 && antes[i][viejaCol] !== undefined) ? +antes[i][viejaCol] : (fi === di ? propuesta[i] : 0);
                if (!isFinite(v)) v = fi === di ? propuesta[i] : 0;
                fila[fi] = v;
            });
            if (!(fila[di] > 0)) fila[di] = propuesta[i];
            filas.push(fila);
        }
        cargas[d.nombre] = filas;
    });
    return { prueba, modo: previa.modo || 'cargas', factores, cargas, metodo: previa.metodo || null, desajuste: previa.desajuste || 'ninguno' };
}

function renderMatrizCargas(prueba) {
    const head = document.getElementById('headCargas'), body = document.getElementById('bodyCargas'), panel = document.getElementById('panelEstructura');
    if (!head || !body) return;
    if (!prueba) { head.innerHTML = '<tr><th>Ítem</th></tr>'; body.innerHTML = ''; if (panel) panel.textContent = 'Elige un test para ver o construir su matriz de cargas.'; return; }
    const est = estructuraReconciliada(prueba);
    if (!est) { head.innerHTML = '<tr><th>Ítem</th></tr>'; body.innerHTML = ''; if (panel) panel.textContent = 'Ese test ya no tiene dimensiones con ítems en la tabla I.'; return; }
    estructurasUI[prueba] = est;
    const test = testsConItems().find(t => t.prueba === prueba);
    head.innerHTML = '<tr><th>Ítem</th>' + est.factores.map(f => `<th>${escapeAttr(f)}</th>`).join('') + '</tr>';
    let html = '';
    test.dims.forEach((d, di) => {
        const sigla = (d.nombre || '').slice(0, 3).toUpperCase();
        est.cargas[d.nombre].forEach((fila, i) => {
            const inv = i >= d.numItems - (d.invertidos || 0);
            html += `<tr class="fila-carga"><td>${escapeAttr(d.nombre)} ${i + 1}${inv ? ' <span title="ítem invertido">INV</span>' : ''}</td>` + est.factores.map((f, fi) => `<td><input type="number" class="input input-sm" step="0.05" min="${fi === di ? 0.1 : -0.6}" max="${fi === di ? 0.95 : 0.6}" value="${fila[fi]}" data-dim="${escapeAttr(d.nombre)}" data-item="${i}" data-factor="${fi}" aria-label="Carga del ítem ${i + 1} de ${escapeAttr(d.nombre)} sobre ${escapeAttr(f)}"${fi === di ? ' style="font-weight:600;"' : ''}></td>`).join('') + '</tr>';
        });
    });
    body.innerHTML = html;
    const modo = document.getElementById('modoEstructura'), met = document.getElementById('metodoCarga'), des = document.getElementById('desajusteEstructura');
    if (modo) modo.value = est.modo; if (met) met.value = est.metodo ? est.metodo.carga : 0; if (des) des.value = est.desajuste;
    actualizarPanelEstructura();
    guardarEstructurasJSON();
    poblarSelectorEstructura();
}

function leerMatrizDesdeDOM() {
    const prueba = (document.getElementById('selectorTestEstructura') || {}).value;
    const est = prueba && estructurasUI[prueba];
    if (!est) return;
    document.querySelectorAll('#bodyCargas input[data-dim]').forEach(inp => {
        const dim = inp.dataset.dim, i = +inp.dataset.item, fi = +inp.dataset.factor;
        if (est.cargas[dim] && est.cargas[dim][i]) { const v = parseFloat(inp.value); est.cargas[dim][i][fi] = isFinite(v) ? v : 0; }
    });
}

function leerOpcionesEstructura() {
    const prueba = (document.getElementById('selectorTestEstructura') || {}).value;
    const est = prueba && estructurasUI[prueba];
    if (!est) return;
    est.modo = ((document.getElementById('modoEstructura') || {}).value) === 'alfa' ? 'alfa' : 'cargas';
    const carga = parseFloat((document.getElementById('metodoCarga') || {}).value);
    est.metodo = (isFinite(carga) && carga > 0) ? { carga: Math.min(0.6, carga) } : null;
    est.desajuste = (document.getElementById('desajusteEstructura') || {}).value || 'ninguno';
}

// Panel en vivo: fiabilidad implícita por dimensión, DE de ítem frente al rango y avisos
function actualizarPanelEstructura() {
    const panel = document.getElementById('panelEstructura');
    const prueba = (document.getElementById('selectorTestEstructura') || {}).value;
    const est = prueba && estructurasUI[prueba];
    if (!panel || !est) return;
    const test = testsConItems().find(t => t.prueba === prueba);
    if (!test) return;
    const indice = ((document.getElementById('indiceFiabilidad') || {}).value) === 'omega' ? 'omega' : 'alfa';
    const partes = [], avisos = [];
    test.dims.forEach((d, di) => {
        const filas = est.cargas[d.nombre] || [];
        let propias = filas.map(f => Math.max(0.05, Math.min(0.95, +f[di] || 0)));
        // (2026.12.25) las cargas con la fiabilidad pedida, de la misma función que usa el generador (antes, una copia aquí)
        if (est.modo === 'alfa' && d.alfa > 0 && d.alfa < 1 && typeof generadorDatos !== 'undefined') propias = generadorDatos._cargasConFiabilidad(propias, d.alfa, indice);
        const fi = (typeof generadorDatos !== 'undefined') ? generadorDatos._fiabilidadImplicita(propias) : { alfa: NaN, omega: NaN };
        const sumaL = propias.reduce((s, l) => s + l, 0), mediaL = sumaL / Math.max(1, propias.length);
        const sigmaItem = isFinite(d.desviacion) && sumaL > 0 ? d.desviacion / sumaL : NaN;
        const likert = Number.isFinite(d.minimo) && Number.isFinite(d.maximo);   // (2026.12.30) null no es 0: una continua no es Likert
        let nota = '';
        if (likert && isFinite(sigmaItem)) {
            const ruido = sigmaItem * sigmaItem * (1 - mediaL * mediaL);
            if (sigmaItem > (d.maximo - d.minimo) / 2) { nota = ' · ⚠ las cargas son demasiado bajas para esa DE: los ítems no caben en el rango'; avisos.push(d.nombre); }
            else if (ruido < 0.16) { nota = ' · ⚠ ruido propio menor que el redondeo: sube la DE del total o baja las cargas'; avisos.push(d.nombre); }
            else if (ruido < 0.25) nota = ' · atención: poco ruido propio frente al redondeo';
        }
        const comunalidadMax = Math.max(...filas.map((f, i) => f.reduce((s, c, j) => s + (j === di ? propias[i] * propias[i] : (+c || 0) ** 2), 0)));
        if (comunalidadMax > 0.95) { nota += ' · ⚠ alguna comunalidad supera 0.95'; avisos.push(d.nombre); }
        const alfaTabla = (d.alfa > 0 && d.alfa < 1) ? d.alfa : null;
        const dif = alfaTabla !== null && est.modo !== 'alfa' && Math.abs(fi[indice] - alfaTabla) > 0.03 ? ` (la tabla I pide ${alfaTabla})` : '';
        partes.push(`<strong>${escapeAttr(d.nombre)}</strong>: carga media ${mediaL.toFixed(2)}${est.modo === 'alfa' ? ' (reescalada al α de la tabla I)' : ''}; ${indice === 'omega' ? 'ω' : 'α'} implícito ${isFinite(fi[indice]) ? fi[indice].toFixed(2) : '—'}${dif}; DE de ítem ${isFinite(sigmaItem) ? sigmaItem.toFixed(2) : '—'}${likert ? ` en ${d.minimo}–${d.maximo}` : ''}${nota}`);
    });
    panel.innerHTML = partes.join('<br>') + (est.metodo ? `<br>Factor de método ${est.metodo.carga} en los ítems invertidos` : '') + (est.desajuste !== 'ninguno' ? ` · desajuste ${est.desajuste}` : '');
}

function proponerCargas() {
    const prueba = (document.getElementById('selectorTestEstructura') || {}).value;
    if (!prueba) { mostrarToast('Elige primero un test', 'warning'); return; }
    const test = testsConItems().find(t => t.prueba === prueba);
    if (!test) return;
    const est = estructurasUI[prueba] || estructuraReconciliada(prueba);
    test.dims.forEach((d, di) => { const prop = cargasPropuestas(d); est.cargas[d.nombre] = est.cargas[d.nombre].map((fila, i) => fila.map((c, fi) => fi === di ? prop[i] : 0)); });
    estructurasUI[prueba] = est;
    renderMatrizCargas(prueba);
    mostrarToast('Cargas propuestas desde el α de la tabla I (cruzadas en 0)', 'success');
}

function quitarEstructura() {
    const sel = document.getElementById('selectorTestEstructura');
    const prueba = sel ? sel.value : '';
    if (!prueba || !estructurasUI[prueba]) { mostrarToast('Ese test no tiene estructura', 'warning'); return; }
    delete estructurasUI[prueba];
    guardarEstructurasJSON();
    sel.value = '';
    renderMatrizCargas('');
    poblarSelectorEstructura();
    mostrarToast(`Estructura de «${prueba}» eliminada: sus ítems usarán el perfil automático`, 'success');
}

function guardarEstructurasJSON() {
    const el = document.getElementById('estructurasJSON');
    if (el) el.value = JSON.stringify(Object.values(estructurasUI));
}

// Antes de generar o exportar: cada estructura se reconcilia con la tabla I
// (ítems añadidos o quitados, dimensiones renombradas) y las de tests que ya no
// existen se descartan avisando.
function reconciliarEstructurasTodas(avisar = true) {
    const huerfanas = [];
    Object.keys(estructurasUI).forEach(prueba => {
        const est = estructuraReconciliada(prueba);
        if (est) estructurasUI[prueba] = est; else { huerfanas.push(prueba); delete estructurasUI[prueba]; }
    });
    guardarEstructurasJSON();
    const sel = document.getElementById('selectorTestEstructura');
    if (sel && sel.value && estructurasUI[sel.value]) renderMatrizCargas(sel.value);
    if (avisar && huerfanas.length) mostrarToast(`Estructura factorial descartada: «${huerfanas.join('», «')}» ya no está en la tabla I`, 'warning');
    return huerfanas;
}

function cargarEstructurasDesdeJSON(texto) {
    Object.keys(estructurasUI).forEach(k => delete estructurasUI[k]);
    try { JSON.parse(texto || '[]').forEach(e => { if (e && e.prueba && e.cargas) estructurasUI[e.prueba] = e; }); } catch (e) { /* ignorar */ }
    guardarEstructurasJSON();
    poblarSelectorEstructura();
}

// Renombrado de una dimensión (o cambio de test) desde la tabla I → claves de la matriz
function renombrarEnEstructuras(viejo, nuevo) {
    if (!viejo || !nuevo || viejo === nuevo) return;
    Object.values(estructurasUI).forEach(est => {
        // (quinta revisión) rehechas sin prototipo: las de una estructura leída del maestro son un objeto normal, y renombrar
        // una dimensión a «__proto__» le cambiaba el prototipo en vez de crear la clave (y sus cargas se perdían)
        if (Object.prototype.hasOwnProperty.call(est.cargas, viejo)) {
            const cargas = Object.create(null);
            for (const [k, v] of Object.entries(est.cargas)) if (k !== viejo) cargas[k] = v;
            cargas[nuevo] = est.cargas[viejo];
            est.cargas = cargas;
        }
        if (Array.isArray(est.factores)) est.factores = est.factores.map(f => f === viejo ? nuevo : f);
    });
    guardarEstructurasJSON();
}

// CSV del archivo maestro: una fila por test con la estructura en JSON
// (revisión 2026.12.30) con campoCSV, como los demás bloques: el nombre del test sin fórmulas («=HYPERLINK(…)» se ejecutaba
// al abrir el maestro en Excel) y con las comillas dobladas
function csvDeEstructuras() {
    let csv = 'Prueba,EstructuraJSON\n';
    Object.values(estructurasUI).forEach(est => { csv += `${campoCSV(est.prueba)},${campoCSV(JSON.stringify(est))}\n`; });
    return csv;
}

/** La estructura de una línea del bloque: por los campos del CSV y, si no se lee así (un maestro antiguo con comillas sueltas en el nombre), por el JSON entre comillas que la cierra. @param {string} linea */
function estructuraDeLinea(linea) {
    /** @param {string} json */
    const leer = json => (excesoDeJson(json, TOPES_JSON_ESTRUCTURA) ? null : JSON.parse(json));
    try { const json = parsearLineaCSV(linea)[1]; if (json) return leer(json); } catch (e) { /* se prueba la lectura antigua */ }
    const i = linea.indexOf(',"');
    if (i < 0) return null;
    try { return leer(linea.slice(i + 2, linea.length - 1).replace(/""/g, '"')); } catch (e) { return null; }
}

function aplicarCSVEstructuras(csv) {
    const lineas = String(csv || '').trim().split(/\r?\n/).filter(l => l.trim());
    Object.keys(estructurasUI).forEach(k => delete estructurasUI[k]);
    let aplicadas = 0;
    for (const linea of lineas.slice(1)) {
        const est = estructuraDeLinea(linea);
        if (est && est.prueba && est.cargas) { estructurasUI[est.prueba] = est; aplicadas++; }
    }
    guardarEstructurasJSON();
    poblarSelectorEstructura();
    return aplicadas;
}

export { estructurasUI, testsConItems, poblarSelectorEstructura, cargasPropuestas, estructuraReconciliada, renderMatrizCargas, leerMatrizDesdeDOM, leerOpcionesEstructura, actualizarPanelEstructura, proponerCargas, quitarEstructura, guardarEstructurasJSON, reconciliarEstructurasTodas, cargarEstructurasDesdeJSON, renombrarEnEstructuras, csvDeEstructuras, aplicarCSVEstructuras };
