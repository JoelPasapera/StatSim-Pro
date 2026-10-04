// simulador/ui/diferencias.js — tarjeta IV (diferencias por grupo, interacción, anidamiento).
// Extraído de app.js (Fase 2) sin cambiar comportamiento; importaciones explícitas entre módulos.

import { parsearLineaCSV } from '../../shared/csv.js';
import { mostrarToast } from '../../shared/toast.js';
import { obtenerVariablesCorrelacionables } from './correlaciones.js';

// Variables que pueden usarse como agrupación: sociodemográficas Binaria o
// Categórica.
function obtenerVariablesAgrupacion() {
    const nombres = [];
    document.querySelectorAll('#bodySocio .fila-socio').forEach(fila => {
        const select = fila.querySelector('select');
        const dist = select ? select.value : 'normal';
        if (dist === 'binaria' || dist === 'categorica') {
            const categoria = fila.querySelector('input').value.trim();
            if (categoria) nombres.push(categoria);
        }
    });
    return nombres;
}

// ---- (B7) Tabla VI: medidas repetidas ----
// Una fila = una escala medida en 2–4 ondas: estabilidad test-retest (r entre
// ondas consecutivas), d de cambio de T1 a la última onda (global, o del grupo 0
// si hay agrupación binaria) y d de cambio del grupo 1.
function obtenerVariablesBinarias() {
    const nombres = [];
    document.querySelectorAll('#bodySocio .fila-socio').forEach(fila => {
        const select = fila.querySelector('select');
        if (select && select.value === 'binaria') {
            const categoria = fila.querySelector('input').value.trim();
            if (categoria) nombres.push(categoria);
        }
    });
    return nombres;
}

// (C4) Ajusta una fila de la tabla IV a su tipo de efecto
function actualizarFilaDiferencia(fila) {
    if (!fila) return;
    const tipo = (fila.querySelector('[aria-label="Tipo de efecto"]') || {}).value || 'd';
    const sel2 = fila.querySelector('[aria-label="Segunda agrupación"]');
    const inp = fila.querySelector('[aria-label="d de Cohen"]');
    if (sel2) { sel2.disabled = tipo !== 'interaccion'; if (tipo !== 'interaccion') sel2.value = ''; }
    if (inp) { inp.placeholder = tipo === 'icc' ? 'CCI, ej: 0.15' : (tipo === 'interaccion' ? 'd de interacción, ej: 0.5' : 'Ej: 0.5'); inp.step = tipo === 'icc' ? '0.01' : '0.1'; inp.title = tipo === 'icc' ? 'Coeficiente de correlación intraclase (0.01–0.90)' : (tipo === 'interaccion' ? 'Diferencia de diferencias en DE intra-celda' : 'd de Cohen'); }
}

function agregarFilaDiferencia() {
    const cuantitativas = obtenerVariablesCorrelacionables();
    const agrupaciones = obtenerVariablesAgrupacion();
    if (cuantitativas.length === 0 || agrupaciones.length === 0) {
        mostrarToast('Necesitas al menos una variable cuantitativa y una de agrupación (Binaria o Categórica)', 'warning');
        return;
    }
    const tbody = document.getElementById('bodyDiferencias');
    const fila = document.createElement('tr');
    fila.className = 'fila-diferencia';
    const opcionesCuant = cuantitativas.map(n => `<option value="${n}">${n}</option>`).join('');
    const opcionesGrupo = agrupaciones.map(n => `<option value="${n}">${n}</option>`).join('');
    fila.innerHTML = `
        <td><select class="input input-sm" aria-label="Tipo de efecto"><option value="d">Diferencia (d)</option><option value="interaccion">Interacción A × B</option><option value="icc">Anidamiento (CCI)</option></select></td>
        <td><select class="input input-sm" aria-label="Variable cuantitativa"><option value="">Variable...</option>${opcionesCuant}</select></td>
        <td><select class="input input-sm" aria-label="Variable de agrupación"><option value="">Agrupación...</option>${opcionesGrupo}</select></td>
        <td><select class="input input-sm" aria-label="Segunda agrupación" disabled><option value="">—</option>${opcionesGrupo}</select></td>
        <td><input type="number" class="input input-sm" step="0.1" placeholder="Ej: 0.5" aria-label="d de Cohen"></td>
        <td>
            <button type="button" class="btn-icon btn-delete" title="Eliminar" aria-label="Eliminar fila">
                <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 4H13M5 4V3C5 2.44772 5.44772 2 6 2H10C10.5523 2 11 2.44772 11 3V4M6 7V11M10 7V11M4 4H12L11.5 13C11.5 13.5523 11.0523 14 10.5 14H5.5C4.94772 14 4.5 13.5523 4.5 13L4 4Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
            </button>
        </td>
    `;
    tbody.appendChild(fila);
}

// CSV de la tabla IV (diferencias por grupo): antes no viajaba en el archivo maestro
function csvDeDiferencias() {
    let csv = 'Cuantitativa,Agrupacion,d,Tipo,Agrupacion2\n';
    const esc = v => (String(v).includes(',') ? `"${v}"` : String(v));
    document.querySelectorAll('#bodyDiferencias .fila-diferencia').forEach(fila => {
        const v = et => { const el = fila.querySelector(`[aria-label="${et}"]`); return el ? el.value : ''; };
        csv += `${esc(v('Variable cuantitativa'))},${esc(v('Variable de agrupación'))},${v('d de Cohen')},${v('Tipo de efecto') || 'd'},${esc(v('Segunda agrupación'))}\n`;
    });
    return csv;
}

function aplicarCSVDiferencias(csv) {
    const lineas = String(csv || '').trim().split(/\r?\n/).filter(l => l.trim());
    if (lineas.length < 2) return { aplicadas: 0, omitidas: 0 };
    const tbody = document.getElementById('bodyDiferencias');
    if (tbody) tbody.innerHTML = '';
    let aplicadas = 0, omitidas = 0;
    for (const linea of lineas.slice(1)) {
        const [cuant, agrup, d, tipo, agrup2] = parsearLineaCSV(linea.trim()).map(p => String(p).trim().replace(/^"|"$/g, ''));
        if (!cuant || !agrup) { omitidas++; continue; }
        const antes = tbody ? tbody.children.length : 0;
        agregarFilaDiferencia();
        const fila = tbody && tbody.children.length > antes ? tbody.lastElementChild : null;
        if (!fila) { omitidas++; continue; }
        const q = et => fila.querySelector(`[aria-label="${et}"]`);
        const existe = (sel, val) => sel && Array.from(sel.options).some(o => o.value === val);
        if (!existe(q('Variable cuantitativa'), cuant) || !existe(q('Variable de agrupación'), agrup)) { fila.remove(); omitidas++; continue; }
        q('Tipo de efecto').value = ['interaccion', 'icc'].includes(tipo) ? tipo : 'd';
        actualizarFilaDiferencia(fila);
        q('Variable cuantitativa').value = cuant; q('Variable de agrupación').value = agrup;
        if (tipo === 'interaccion' && agrup2 && existe(q('Segunda agrupación'), agrup2)) q('Segunda agrupación').value = agrup2;
        if (q('d de Cohen')) q('d de Cohen').value = d === undefined ? '' : d;
        aplicadas++;
    }
    return { aplicadas, omitidas };
}

export { obtenerVariablesAgrupacion, obtenerVariablesBinarias, actualizarFilaDiferencia, agregarFilaDiferencia, csvDeDiferencias, aplicarCSVDiferencias };
