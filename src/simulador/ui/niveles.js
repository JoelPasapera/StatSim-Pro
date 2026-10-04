// simulador/ui/niveles.js — relación entre personas y dentro de la persona (Atlas de relaciones, fase D), dentro de la
// tarjeta VI. Cada fila relaciona dos escalas repetidas (con el modelo «Interceptos aleatorios») en los dos niveles.

import { parsearLineaCSV } from '../../shared/csv.js';
import { mostrarToast } from '../../shared/toast.js';

const escapar = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// escalas que se repiten en la tabla VI: las únicas que pueden formar una pareja
function escalasRepetidas() {
    return Array.from(document.querySelectorAll('#bodyRepetidas .fila-repetida [aria-label="Escala repetida"]')).map(s => s.value).filter(Boolean);
}

function agregarFilaNivel(datos = null) {
    const escalas = [...new Set(escalasRepetidas().concat(datos ? [datos.x, datos.y].filter(Boolean) : []))];
    if (escalas.length < 2) {
        mostrarToast('Repite al menos dos escalas en la tabla VI, con el modelo «Interceptos aleatorios», antes de relacionarlas entre niveles', 'warning');
        return null;
    }
    const tbody = document.getElementById('bodyNiveles');
    if (!tbody) return null;
    const opciones = escalas.map(n => `<option value="${escapar(n)}">${escapar(n)}</option>`).join('');
    const fila = document.createElement('tr');
    fila.className = 'fila-nivel';
    fila.innerHTML = `
        <td><select class="input input-sm" aria-label="Escala X (niveles)"><option value="">Escala X...</option>${opciones}</select></td>
        <td><select class="input input-sm" aria-label="Escala Y (niveles)"><option value="">Escala Y...</option>${opciones}</select></td>
        <td><input type="number" class="input input-sm" step="0.05" min="-0.95" max="0.95" placeholder="Ej: -0.40" aria-label="r entre personas" title="Relación entre los niveles propios de las personas: quien tiene más X, ¿tiene más Y?"></td>
        <td><input type="number" class="input input-sm" step="0.05" min="-0.95" max="0.95" placeholder="Ej: 0.30" aria-label="r dentro de la persona" title="Relación entre las fluctuaciones de cada persona de onda a onda: cuando su X sube, ¿sube su Y?"></td>
        <td><button type="button" class="btn-icon btn-delete" title="Eliminar" aria-label="Eliminar fila">
            <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 4H13M5 4V3C5 2.44772 5.44772 2 6 2H10C10.5523 2 11 2.44772 11 3V4M6 7V11M10 7V11M4 4H12L11.5 13C11.5 13.5523 11.0523 14 10.5 14H5.5C4.94772 14 4.5 13.5523 4.5 13L4 4Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button></td>`;
    tbody.appendChild(fila);
    if (datos) {
        const poner = (etiqueta, valor) => { const el = fila.querySelector(`[aria-label="${etiqueta}"]`); if (el && valor !== undefined && valor !== null) el.value = valor; };
        poner('Escala X (niveles)', datos.x); poner('Escala Y (niveles)', datos.y); poner('r entre personas', datos.rEntre); poner('r dentro de la persona', datos.rDentro);
    }
    return fila;
}

// CSV de la tabla (lo usa el maestro)
function csvDeNiveles() {
    const esc = v => (String(v).includes(',') ? `"${v}"` : String(v));
    let csv = 'X,Y,rEntre,rDentro\n';
    document.querySelectorAll('#bodyNiveles .fila-nivel').forEach(fila => {
        const v = et => { const el = fila.querySelector(`[aria-label="${et}"]`); return el ? el.value : ''; };
        csv += `${esc(v('Escala X (niveles)'))},${esc(v('Escala Y (niveles)'))},${v('r entre personas')},${v('r dentro de la persona')}\n`;
    });
    return csv;
}

function aplicarCSVNiveles(csv) {
    const lineas = String(csv || '').trim().split(/\r?\n/).filter(l => l.trim());
    const tbody = document.getElementById('bodyNiveles');
    if (tbody) tbody.innerHTML = '';
    let aplicadas = 0, omitidas = 0;
    for (const linea of lineas.slice(1)) {
        const [x, y, rEntre, rDentro] = parsearLineaCSV(linea.trim()).map(p => String(p).trim().replace(/^"|"$/g, ''));
        if (!x || !y) { omitidas++; continue; }
        const fila = agregarFilaNivel({ x, y, rEntre, rDentro });
        if (fila) aplicadas++; else omitidas++;
    }
    return { aplicadas, omitidas };
}

// Botón de la tarjeta y borrado de filas (delegado en el cuerpo de la tabla)
function montarNiveles() {
    const boton = document.getElementById('btnAgregarNivel'), cuerpo = document.getElementById('bodyNiveles');
    if (boton) boton.addEventListener('click', () => agregarFilaNivel());
    if (cuerpo) cuerpo.addEventListener('click', e => { const b = e.target.closest('.btn-delete'); if (b) { const tr = b.closest('tr'); if (tr) tr.remove(); } });
}

export { agregarFilaNivel, csvDeNiveles, aplicarCSVNiveles, montarNiveles };
