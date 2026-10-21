// simulador/ui/paneles.js — relaciones en el tiempo: rezagada y recíproca, el panel cruzado (Atlas de relaciones, fase E1),
// dentro de la tarjeta VI. Cada fila relaciona dos escalas repetidas con AR(1): la r en la misma onda y los efectos cruzados.

import { campoCSV, parsearLineaCSV } from '../../shared/csv.js';
import { mostrarToast } from '../../shared/toast.js';

const escapar = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function escalasRepetidas() {
    return Array.from(document.querySelectorAll('#bodyRepetidas .fila-repetida [aria-label="Escala repetida"]')).map(s => s.value).filter(Boolean);
}

// En la rezagada solo X predice a Y: el efecto Y → X no se pide
function actualizarFilaPanel(fila) {
    const tipo = fila.querySelector('[aria-label="Tipo de relación en el tiempo"]'), yx = fila.querySelector('[aria-label="Efecto Y → X"]');
    if (!tipo || !yx) return;
    const reciproca = tipo.value === 'reciproca';
    yx.disabled = !reciproca;
    if (!reciproca) yx.value = '';
    yx.placeholder = reciproca ? 'Ej: 0.10' : '— (0)';
}

function agregarFilaPanel(datos = null) {
    const escalas = [...new Set(escalasRepetidas().concat(datos ? [datos.x, datos.y].filter(Boolean) : []))];
    if (escalas.length < 2) {
        mostrarToast('Repite al menos dos escalas en la tabla VI, con el modelo AR(1), antes de relacionarlas en el tiempo', 'warning');
        return null;
    }
    const tbody = document.getElementById('bodyPaneles');
    if (!tbody) return null;
    const opciones = escalas.map(n => `<option value="${escapar(n)}">${escapar(n)}</option>`).join('');
    const fila = document.createElement('tr');
    fila.className = 'fila-panel';
    fila.innerHTML = `
        <td><select class="input input-sm" aria-label="Tipo de relación en el tiempo"><option value="rezagada">Rezagada (X → Y)</option><option value="reciproca">Recíproca (X ⇄ Y)</option></select></td>
        <td><select class="input input-sm" aria-label="Escala X (tiempo)"><option value="">Escala X...</option>${opciones}</select></td>
        <td><select class="input input-sm" aria-label="Escala Y (tiempo)"><option value="">Escala Y...</option>${opciones}</select></td>
        <td><input type="number" class="input input-sm" step="0.05" min="-0.95" max="0.95" placeholder="Ej: 0.30" aria-label="r en la misma onda" title="Correlación de X e Y medidas en la misma onda (la misma en todas)"></td>
        <td><input type="number" class="input input-sm" step="0.05" min="-0.95" max="0.95" placeholder="Ej: 0.25" aria-label="Efecto X → Y" title="β tipificado de X en una onda sobre Y en la siguiente, controlando la Y anterior"></td>
        <td><input type="number" class="input input-sm" step="0.05" min="-0.95" max="0.95" placeholder="— (0)" aria-label="Efecto Y → X" title="β tipificado de Y en una onda sobre X en la siguiente, controlando la X anterior (solo en la recíproca)" disabled></td>
        <td><input type="number" class="input input-sm" step="0.05" min="0" max="0.9" placeholder="— (0)" aria-label="ICC de X" title="(RI-CLPM) Parte de la varianza de X que es nivel estable de la persona (su rasgo); vacía, 0: el panel clásico"></td>
        <td><input type="number" class="input input-sm" step="0.05" min="0" max="0.9" placeholder="— (0)" aria-label="ICC de Y" title="(RI-CLPM) Parte de la varianza de Y que es nivel estable de la persona (su rasgo); vacía, 0: el panel clásico"></td>
        <td><input type="number" class="input input-sm" step="0.05" min="-0.95" max="0.95" placeholder="— (0)" aria-label="r entre interceptos" title="(RI-CLPM) Correlación entre los niveles estables de X e Y (los rasgos): con ella, el panel clásico ve efectos cruzados que dentro de la persona no existen"></td>
        <td><button type="button" class="btn-icon btn-delete" title="Eliminar" aria-label="Eliminar fila">
            <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 4H13M5 4V3C5 2.44772 5.44772 2 6 2H10C10.5523 2 11 2.44772 11 3V4M6 7V11M10 7V11M4 4H12L11.5 13C11.5 13.5523 11.0523 14 10.5 14H5.5C4.94772 14 4.5 13.5523 4.5 13L4 4Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button></td>`;
    tbody.appendChild(fila);
    if (datos) {
        const poner = (etiqueta, valor) => { const el = fila.querySelector(`[aria-label="${etiqueta}"]`); if (el && valor !== undefined && valor !== null && valor !== '') el.value = valor; };
        poner('Tipo de relación en el tiempo', datos.tipo === 'reciproca' ? 'reciproca' : 'rezagada');
        poner('Escala X (tiempo)', datos.x); poner('Escala Y (tiempo)', datos.y); poner('r en la misma onda', datos.r); poner('Efecto X → Y', datos.cXY);
        actualizarFilaPanel(fila);
        if (datos.tipo === 'reciproca') poner('Efecto Y → X', datos.cYX);
        poner('ICC de X', datos.iccX); poner('ICC de Y', datos.iccY); poner('r entre interceptos', datos.rRI);   // (RI-CLPM, 2026.12.07)
    }
    actualizarFilaPanel(fila);
    return fila;
}

// CSV de la tabla (lo usa el maestro)
function csvDePaneles() {
    const esc = campoCSV;   // (2026.12.30) RFC 4180: comillas dobladas y también saltos de línea
    let csv = 'Tipo,X,Y,rMismaOnda,EfectoXY,EfectoYX,ICCX,ICCY,rInterceptos\n';   // (RI-CLPM, 2026.12.07) tres columnas más
    document.querySelectorAll('#bodyPaneles .fila-panel').forEach(fila => {
        const v = et => { const el = fila.querySelector(`[aria-label="${et}"]`); return el ? el.value : ''; };
        csv += `${v('Tipo de relación en el tiempo')},${esc(v('Escala X (tiempo)'))},${esc(v('Escala Y (tiempo)'))},${v('r en la misma onda')},${v('Efecto X → Y')},${v('Efecto Y → X')},${v('ICC de X')},${v('ICC de Y')},${v('r entre interceptos')}\n`;
    });
    return csv;
}

function aplicarCSVPaneles(csv) {
    const lineas = String(csv || '').trim().split(/\r?\n/).filter(l => l.trim());
    const tbody = document.getElementById('bodyPaneles');
    if (tbody) tbody.innerHTML = '';
    let aplicadas = 0, omitidas = 0;
    for (const linea of lineas.slice(1)) {
        // un CSV anterior (seis columnas) sigue cargándose: las del RI-CLPM quedan vacías (el panel clásico)
        // (revisión 2026.12.30) sin quitar más comillas: parsearLineaCSV ya las quita y las desdobla (un nombre que
        // termina en comilla, «Bienestar "subjetivo"», perdía la última y su fila no encontraba la variable)
        const [tipo, x, y, r, cXY, cYX, iccX, iccY, rRI] = parsearLineaCSV(linea.trim()).map(p => String(p).trim());
        if (!x || !y) { omitidas++; continue; }
        const fila = agregarFilaPanel({ tipo, x, y, r, cXY, cYX, iccX, iccY, rRI });
        if (fila) aplicadas++; else omitidas++;
    }
    return { aplicadas, omitidas };
}

// Botón de la tarjeta, cambio de tipo y borrado de filas (delegados en el cuerpo de la tabla)
function montarPaneles() {
    const boton = document.getElementById('btnAgregarPanel'), cuerpo = document.getElementById('bodyPaneles');
    if (boton) boton.addEventListener('click', () => agregarFilaPanel());
    if (!cuerpo) return;
    cuerpo.addEventListener('click', e => { const b = e.target.closest('.btn-delete'); if (b) { const tr = b.closest('tr'); if (tr) tr.remove(); } });
    cuerpo.addEventListener('change', e => { if (e.target.matches('[aria-label="Tipo de relación en el tiempo"]')) actualizarFilaPanel(e.target.closest('tr')); });
}

export { agregarFilaPanel, actualizarFilaPanel, csvDePaneles, aplicarCSVPaneles, montarPaneles };
