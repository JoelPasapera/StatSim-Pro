// simulador/ui/repetidas.js — tarjeta VI (medidas repetidas).
// Extraído de app.js (Fase 2) sin cambiar comportamiento; importaciones explícitas entre módulos.

import { parsearLineaCSV } from '../../shared/csv.js';
import { mostrarToast } from '../../shared/toast.js';
import { obtenerVariablesBinarias } from './diferencias.js';

function agregarFilaRepetida(datos = null) {
    // Solo dimensiones: una Escala general (una sola columna) no se repite
    const escalas = [];
    document.querySelectorAll('#bodyPruebas .fila-prueba').forEach(fila => {
        const inputEscala = fila.querySelector('[aria-label="Nombre de la escala"]');
        const selTipo = fila.querySelector('[aria-label="Tipo de escala"]');
        const nombre = inputEscala ? inputEscala.value.trim() : '';
        if (nombre && !(selTipo && selTipo.value === 'general')) escalas.push(nombre);
    });
    if (!escalas.length) {
        mostrarToast('Define al menos una escala de tipo dimensión en la tabla I antes de añadir medidas repetidas', 'warning');
        return null;
    }
    const tbody = document.getElementById('bodyRepetidas');
    if (!tbody) return null;
    const fila = document.createElement('tr');
    fila.className = 'fila-repetida';
    const opciones = escalas.map(n => `<option value="${n}">${n}</option>`).join('');
    const binarias = obtenerVariablesBinarias().map(n => `<option value="${n}">${n}</option>`).join('');
    fila.innerHTML = `
        <td><select class="input input-sm" aria-label="Escala repetida"><option value="">Escala...</option>${opciones}</select></td>
        <td><input type="number" class="input input-sm" min="2" max="4" step="1" value="2" aria-label="Número de ondas"></td>
        <td><input type="number" class="input input-sm" step="0.05" min="0" max="0.99" placeholder="Ej: 0.70" aria-label="Estabilidad test-retest"></td>
        <td><input type="number" class="input input-sm" step="0.1" placeholder="Ej: 0.5" aria-label="d de cambio"></td>
        <td><select class="input input-sm" aria-label="Agrupación del cambio"><option value="">Ninguna (cambio global)</option>${binarias}</select></td>
        <td><input type="number" class="input input-sm" step="0.1" placeholder="Ej: 0.8" aria-label="d de cambio del grupo 1" disabled></td>
        <td><select class="input input-sm" aria-label="Modelo longitudinal"><option value="ar1">AR(1): estabilidad</option><option value="crecimiento">Crecimiento (pendientes)</option><option value="intercepto">Interceptos aleatorios (ICC)</option></select></td>
        <td><input type="number" class="input input-sm" step="0.05" min="0" max="1.5" placeholder="Ej: 0.5" aria-label="DE de las pendientes" disabled></td>
        <td><input type="number" class="input input-sm" step="0.05" min="-0.95" max="0.95" placeholder="Ej: -0.2" aria-label="Correlación intercepto-pendiente" disabled></td>
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
        const poner = (etiqueta, valor) => { const el = fila.querySelector(`[aria-label="${etiqueta}"]`); if (el && valor !== undefined && valor !== null) el.value = valor; };
        poner('Escala repetida', datos.variable); poner('Número de ondas', datos.ondas); poner('Estabilidad test-retest', datos.estabilidad);
        poner('d de cambio', datos.cambio); poner('Agrupación del cambio', datos.agrupacion || ''); poner('d de cambio del grupo 1', datos.cambioGrupo);
        poner('Modelo longitudinal', ['crecimiento', 'intercepto'].includes(datos.modelo) ? datos.modelo : 'ar1'); poner('DE de las pendientes', datos.dePendientes); poner('Correlación intercepto-pendiente', datos.rInterceptoPendiente);
    }
    actualizarFilaRepetida(fila);
    return fila;
}

function actualizarFilaRepetida(fila) {
    if (!fila) return;
    const agrup = fila.querySelector('[aria-label="Agrupación del cambio"]');
    const cambio = fila.querySelector('[aria-label="d de cambio"]');
    const cambioG1 = fila.querySelector('[aria-label="d de cambio del grupo 1"]');
    const conGrupo = !!(agrup && agrup.value);
    if (cambio) { cambio.placeholder = conGrupo ? 'grupo 0 (control)' : 'Ej: 0.5'; cambio.title = conGrupo ? 'd de cambio del grupo 0 (control) de T1 a la última onda' : 'd de cambio global de T1 a la última onda, en DE de T1'; }
    if (cambioG1) { cambioG1.disabled = !conGrupo; cambioG1.placeholder = conGrupo ? 'grupo 1 (experimental)' : '—'; if (!conGrupo) cambioG1.value = ''; }
    // (C4) parámetros del crecimiento solo con ese modelo
    const modelo = fila.querySelector('[aria-label="Modelo longitudinal"]');
    const crec = !!(modelo && modelo.value === 'crecimiento');
    ['DE de las pendientes', 'Correlación intercepto-pendiente'].forEach(et => { const el = fila.querySelector(`[aria-label="${et}"]`); if (el) { el.disabled = !crec; if (!crec) el.value = ''; } });
}

// (B7) CSV de la tabla VI (medidas repetidas)
function csvDeRepetidas() {
    let csv = 'Escala,Ondas,Estabilidad,Cambio,Agrupacion,CambioGrupo1,Modelo,DEPendientes,rInterceptoPendiente\n';
    const esc = v => (String(v).includes(',') ? `"${v}"` : String(v));
    document.querySelectorAll('#bodyRepetidas .fila-repetida').forEach(fila => {
        const v = etiqueta => { const el = fila.querySelector(`[aria-label="${etiqueta}"]`); return el ? el.value : ''; };
        csv += `${esc(v('Escala repetida'))},${v('Número de ondas')},${v('Estabilidad test-retest')},${v('d de cambio')},${esc(v('Agrupación del cambio'))},${v('d de cambio del grupo 1')},${v('Modelo longitudinal') || 'ar1'},${v('DE de las pendientes')},${v('Correlación intercepto-pendiente')}\n`;
    });
    return csv;
}

function aplicarCSVRepetidas(csv) {
    const lineas = String(csv || '').trim().split(/\r?\n/).filter(l => l.trim());
    if (lineas.length < 2) return { aplicadas: 0, omitidas: 0 };
    const tbody = document.getElementById('bodyRepetidas');
    if (tbody) tbody.innerHTML = '';
    let aplicadas = 0, omitidas = 0;
    for (const linea of lineas.slice(1)) {
        const [variable, ondas, estabilidad, cambio, agrupacion, cambioGrupo, modelo, dePendientes, rInterceptoPendiente] = parsearLineaCSV(linea.trim()).map(p => String(p).trim().replace(/^"|"$/g, ''));
        if (!variable) { omitidas++; continue; }
        const fila = agregarFilaRepetida({ variable, ondas, estabilidad, cambio, agrupacion, cambioGrupo, modelo, dePendientes, rInterceptoPendiente });
        if (!fila) { omitidas++; continue; }
        const sel = fila.querySelector('[aria-label="Escala repetida"]');
        if (!sel || sel.value === '') { fila.remove(); omitidas++; continue; }
        aplicadas++;
    }
    return { aplicadas, omitidas };
}

export { agregarFilaRepetida, actualizarFilaRepetida, csvDeRepetidas, aplicarCSVRepetidas };
