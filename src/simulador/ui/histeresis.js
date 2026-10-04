// simulador/ui/histeresis.js — estados con histéresis (Atlas de relaciones, fase E2), dentro de la tarjeta VI. Cada fila crea un
// estado de dos valores por onda que depende del camino de una escala repetida: se entra por encima del umbral de entrada y se sale
// por debajo del de salida; entre los dos se conserva el estado anterior.

import { parsearLineaCSV } from '../../shared/csv.js';
import { mostrarToast } from '../../shared/toast.js';

const escapar = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function escalasRepetidas() {
    return Array.from(document.querySelectorAll('#bodyRepetidas .fila-repetida [aria-label="Escala repetida"]')).map(s => s.value).filter(Boolean);
}

function agregarFilaHisteresis(datos = null) {
    const escalas = [...new Set(escalasRepetidas().concat(datos && datos.x ? [datos.x] : []))];
    if (!escalas.length) {
        mostrarToast('Repite primero en la tabla VI la escala cuyo camino decide el estado', 'warning');
        return null;
    }
    const tbody = document.getElementById('bodyHisteresis');
    if (!tbody) return null;
    const opciones = escalas.map(n => `<option value="${escapar(n)}">${escapar(n)}</option>`).join('');
    const fila = document.createElement('tr');
    fila.className = 'fila-histeresis';
    fila.innerHTML = `
        <td><select class="input input-sm" aria-label="Escala con histéresis"><option value="">Escala...</option>${opciones}</select></td>
        <td><input type="text" class="input input-sm" placeholder="Ej: Ansiedad clínica" aria-label="Nombre del estado"></td>
        <td><input type="text" class="input input-sm" value="No" aria-label="Etiqueta del estado bajo" title="Etiqueta del estado bajo (código 0)"></td>
        <td><input type="text" class="input input-sm" value="Sí" aria-label="Etiqueta del estado alto" title="Etiqueta del estado alto (código 1)"></td>
        <td><input type="number" class="input input-sm" step="5" min="1" max="99" value="80" aria-label="Umbral de entrada (percentil)" title="Percentil de la escala en T1 por encima del cual se entra en el estado alto"></td>
        <td><input type="number" class="input input-sm" step="5" min="1" max="99" value="40" aria-label="Umbral de salida (percentil)" title="Percentil de la escala en T1 por debajo del cual se sale del estado alto (menor que el de entrada)"></td>
        <td><input type="number" class="input input-sm" step="1" min="0" max="49" value="5" aria-label="Nitidez (% fuera de la regla)" title="Porcentaje de observaciones en que el estado no sigue la regla, como en datos reales; con 0 la separación es perfecta y la regresión logística no converge"></td>
        <td><button type="button" class="btn-icon btn-delete" title="Eliminar" aria-label="Eliminar fila">
            <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 4H13M5 4V3C5 2.44772 5.44772 2 6 2H10C10.5523 2 11 2.44772 11 3V4M6 7V11M10 7V11M4 4H12L11.5 13C11.5 13.5523 11.0523 14 10.5 14H5.5C4.94772 14 4.5 13.5523 4.5 13L4 4Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button></td>`;
    tbody.appendChild(fila);
    if (datos) {
        const poner = (etiqueta, valor) => { const el = fila.querySelector(`[aria-label="${etiqueta}"]`); if (el && valor !== undefined && valor !== null && valor !== '') el.value = valor; };
        poner('Escala con histéresis', datos.x); poner('Nombre del estado', datos.nombre);
        if (Array.isArray(datos.etiquetas)) { poner('Etiqueta del estado bajo', datos.etiquetas[0]); poner('Etiqueta del estado alto', datos.etiquetas[1]); }
        poner('Umbral de entrada (percentil)', datos.pEntrada); poner('Umbral de salida (percentil)', datos.pSalida); poner('Nitidez (% fuera de la regla)', datos.ruido);
    }
    return fila;
}

// CSV de la tabla (lo usa el maestro)
function csvDeHisteresis() {
    const esc = v => (/[",]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    let csv = 'Escala,Estado,EtiquetaBaja,EtiquetaAlta,PercentilEntrada,PercentilSalida,Nitidez\n';
    document.querySelectorAll('#bodyHisteresis .fila-histeresis').forEach(fila => {
        const v = et => { const el = fila.querySelector(`[aria-label="${et}"]`); return el ? el.value : ''; };
        csv += ['Escala con histéresis', 'Nombre del estado', 'Etiqueta del estado bajo', 'Etiqueta del estado alto', 'Umbral de entrada (percentil)', 'Umbral de salida (percentil)', 'Nitidez (% fuera de la regla)'].map(et => esc(v(et))).join(',') + '\n';
    });
    return csv;
}

function aplicarCSVHisteresis(csv) {
    const lineas = String(csv || '').trim().split(/\r?\n/).filter(l => l.trim());
    const tbody = document.getElementById('bodyHisteresis');
    if (tbody) tbody.innerHTML = '';
    let aplicadas = 0, omitidas = 0;
    for (const linea of lineas.slice(1)) {
        const [x, nombre, bajo, alto, pEntrada, pSalida, ruido] = parsearLineaCSV(linea.trim()).map(p => String(p).trim());
        if (!x) { omitidas++; continue; }
        const fila = agregarFilaHisteresis({ x, nombre, etiquetas: [bajo, alto], pEntrada, pSalida, ruido });
        if (fila) aplicadas++; else omitidas++;
    }
    return { aplicadas, omitidas };
}

function montarHisteresis() {
    const boton = document.getElementById('btnAgregarHisteresis'), cuerpo = document.getElementById('bodyHisteresis');
    if (boton) boton.addEventListener('click', () => agregarFilaHisteresis());
    if (cuerpo) cuerpo.addEventListener('click', e => { const b = e.target.closest('.btn-delete'); if (b) { const tr = b.closest('tr'); if (tr) tr.remove(); } });
}

export { agregarFilaHisteresis, csvDeHisteresis, aplicarCSVHisteresis, montarHisteresis };
