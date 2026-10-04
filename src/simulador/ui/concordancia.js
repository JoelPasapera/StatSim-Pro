// simulador/ui/concordancia.js — tarjeta IX (informantes y jueces).
// Extraído de app.js (Fase 2) sin cambiar comportamiento; importaciones explícitas entre módulos.

import { escapeAttr, parsearLineaCSV } from '../../shared/csv.js';

// ---- (C7) Tarjeta IX: concordancia ----
// Variables según el tipo: informante y jueces con puntuación → escalas (sin generales);
// jueces categóricos → escalas con corte, sociodemográficas binarias/categóricas y desenlaces binarios/ordinales.
function poblarVariableConcordancia(sel) {
    const fila = sel.closest('.fila-concordancia');
    const tipo = (fila.querySelector('[aria-label="Tipo de concordancia"]') || {}).value || 'informante';
    const actual = sel.value;
    let nombres = [];
    if (tipo === 'jueces') {
        document.querySelectorAll('#bodyCortes .fila-corte select').forEach(s => { if (s.value) nombres.push(s.value); });
        document.querySelectorAll('#bodySocio .fila-socio').forEach(f => { const dist = (f.querySelector('select') || {}).value; const nombre = ((f.querySelector('input') || {}).value || '').trim(); if (nombre && (dist === 'binaria' || dist === 'categorica')) nombres.push(nombre); });
        document.querySelectorAll('#bodyDesenlaces .fila-desenlace').forEach(f => { const nombre = ((f.querySelector('[aria-label="Nombre del desenlace"]') || {}).value || '').trim(); const t = (f.querySelector('[aria-label="Tipo de desenlace"]') || {}).value; if (nombre && t !== 'conteo') nombres.push(nombre); });
    } else {
        document.querySelectorAll('#bodyPruebas .fila-prueba [aria-label="Nombre de la escala"]').forEach(inp => { const n = inp.value.trim(); if (n) nombres.push(n); });
        if (tipo === 'juecesContinuo') document.querySelectorAll('#bodySocio .fila-socio').forEach(f => { const dist = (f.querySelector('select') || {}).value; const nombre = ((f.querySelector('input') || {}).value || '').trim(); if (nombre && ['normal', 'asimetrica', 'uniforme'].includes(dist)) nombres.push(nombre); });
    }
    nombres = nombres.filter((v, i, arr) => arr.indexOf(v) === i);
    sel.innerHTML = '<option value="">Variable...</option>' + nombres.map(n => `<option value="${escapeAttr(n)}"${n === actual ? ' selected' : ''}>${escapeAttr(n)}</option>`).join('');
    if (actual && !nombres.includes(actual)) sel.value = '';
}

function agregarFilaConcordancia(datos = null) {
    const tbody = document.getElementById('bodyConcordancia');
    if (!tbody) return null;
    const fila = document.createElement('tr');
    fila.className = 'fila-concordancia';
    fila.innerHTML = `
        <td><select class="input input-sm" aria-label="Tipo de concordancia"><option value="informante">Informante / forma paralela</option><option value="jueces">Jueces: categoría (κ)</option><option value="juecesContinuo">Jueces: puntuación (CCI)</option></select></td>
        <td><select class="input input-sm" aria-label="Variable de concordancia"><option value="">Variable...</option></select></td>
        <td><input type="text" class="input input-sm" placeholder="Ej: madre" maxlength="30" aria-label="Etiqueta o número de jueces"></td>
        <td><input type="number" class="input input-sm" step="0.05" min="0.01" max="0.98" placeholder="Ej: 0.60" aria-label="Concordancia"></td>
        <td><input type="number" class="input input-sm" step="0.1" min="-2" max="2" placeholder="Ej: -0.3" aria-label="Sesgo del informante"></td>
        <td>
            <button type="button" class="btn-icon btn-delete" title="Eliminar" aria-label="Eliminar fila">
                <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 4H13M5 4V3C5 2.44772 5.44772 2 6 2H10C10.5523 2 11 2.44772 11 3V4M6 7V11M10 7V11M4 4H12L11.5 13C11.5 13.5523 11.0523 14 10.5 14H5.5C4.94772 14 4.5 13.5523 4.5 13L4 4Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
            </button>
        </td>
    `;
    tbody.appendChild(fila);
    if (datos) {
        const poner = (et, v) => { const el = fila.querySelector(`[aria-label="${et}"]`); if (el && v !== undefined && v !== null) el.value = v; };
        poner('Tipo de concordancia', datos.tipo || 'informante');
        poblarVariableConcordancia(fila.querySelector('[aria-label="Variable de concordancia"]'));
        poner('Variable de concordancia', datos.variable); poner('Etiqueta o número de jueces', datos.etiqueta); poner('Concordancia', datos.concordancia); poner('Sesgo del informante', datos.sesgo);
    } else poblarVariableConcordancia(fila.querySelector('[aria-label="Variable de concordancia"]'));
    actualizarFilaConcordancia(fila);
    return fila;
}

function actualizarFilaConcordancia(fila) {
    if (!fila) return;
    const tipo = (fila.querySelector('[aria-label="Tipo de concordancia"]') || {}).value || 'informante';
    const et = fila.querySelector('[aria-label="Etiqueta o número de jueces"]'), con = fila.querySelector('[aria-label="Concordancia"]'), ses = fila.querySelector('[aria-label="Sesgo del informante"]');
    if (et) { et.placeholder = tipo === 'informante' ? 'Ej: madre' : 'N.º de jueces, ej: 3'; et.type = tipo === 'informante' ? 'text' : 'number'; if (tipo !== 'informante') { et.min = '2'; et.max = '6'; et.step = '1'; } }
    if (con) con.placeholder = tipo === 'informante' ? 'r, ej: 0.60' : (tipo === 'jueces' ? 'κ, ej: 0.70' : 'CCI, ej: 0.80');
    if (ses) { ses.disabled = tipo !== 'informante'; if (tipo !== 'informante') ses.value = ''; }
    const sel = fila.querySelector('[aria-label="Variable de concordancia"]');
    if (sel) poblarVariableConcordancia(sel);
}

function csvDeConcordancia() {
    let csv = 'Tipo,Variable,EtiquetaOJueces,Concordancia,Sesgo\n';
    const esc = v => (String(v).includes(',') ? `"${v}"` : String(v));
    document.querySelectorAll('#bodyConcordancia .fila-concordancia').forEach(f => {
        const v = et => { const el = f.querySelector(`[aria-label="${et}"]`); return el ? el.value : ''; };
        csv += `${v('Tipo de concordancia')},${esc(v('Variable de concordancia'))},${esc(v('Etiqueta o número de jueces'))},${v('Concordancia')},${v('Sesgo del informante')}\n`;
    });
    return csv;
}

function aplicarCSVConcordancia(csv) {
    const lineas = String(csv || '').trim().split(/\r?\n/).filter(l => l.trim());
    const tbody = document.getElementById('bodyConcordancia'); if (tbody) tbody.innerHTML = '';
    let aplicadas = 0;
    for (const linea of lineas.slice(1)) {
        const [tipo, variable, etiqueta, concordancia, sesgo] = parsearLineaCSV(linea.trim()).map(p => String(p).trim().replace(/^"|"$/g, ''));
        if (!variable) continue;
        const fila = agregarFilaConcordancia({ tipo, variable, etiqueta, concordancia, sesgo });
        if (fila && fila.querySelector('[aria-label="Variable de concordancia"]').value === '') { fila.remove(); continue; }
        aplicadas++;
    }
    return aplicadas;
}

export { poblarVariableConcordancia, agregarFilaConcordancia, actualizarFilaConcordancia, csvDeConcordancia, aplicarCSVConcordancia };
