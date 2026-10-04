// simulador/ui/seleccion.js — selección de la muestra por rango (Atlas de relaciones, dimensión B3). La lista de variables
// cuantitativas se rellena al abrirla (así sigue a las tablas), el lado y el porcentaje solo se muestran con una variable
// elegida, y la nota adelanta el efecto con la fórmula de Thorndike (si la variable es normal).
import { obtenerVariablesCorrelacionables } from './correlaciones.js';
import { atenuarThorndike, uSeleccionNormal } from '../dominio/seleccion.js';

const el = id => document.getElementById(id);
function rellenarVariables() {
    const sel = el('seleccionVariable'); if (!sel) return;
    const actual = sel.value, nombres = obtenerVariablesCorrelacionables({ generales: false });
    // removeChild de la última: «remove(índice)» es propio de HTMLSelectElement y, donde no existe (el remove() genérico de
    // un elemento ignora el índice y quita el propio selector), el bucle no terminaba nunca
    while (sel.options.length > 1) sel.removeChild(sel.options[sel.options.length - 1]);
    // la elegida se conserva aunque ya no esté en las tablas: la validación lo dirá (no se pierde en silencio)
    [...nombres, ...(actual && !nombres.includes(actual) ? [actual] : [])].forEach(n => { const o = document.createElement('option'); o.value = n; o.textContent = n; sel.appendChild(o); });
    sel.value = actual;
}
function actualizarSeleccion() {
    const v = el('seleccionVariable'), lado = el('seleccionLado'), pr = el('seleccionProporcion'), nota = el('notaSeleccion'), campos = el('camposSeleccion');
    if (!v) return;
    const activa = !!v.value;
    if (campos) campos.style.display = activa ? 'flex' : 'none';
    if (!nota) return;
    if (!activa) { nota.textContent = 'Sin selección: la base es una muestra corriente de la población.'; return; }
    const p = (parseFloat(pr && pr.value) || 0) / 100;
    if (!(p >= 0.05 && p <= 0.95)) { nota.textContent = 'El porcentaje seleccionado debe estar entre 5 y 95.'; return; }
    const u = uSeleccionNormal(p), r = atenuarThorndike(0.5, u).toFixed(2).replace(/^0/, '');
    nota.textContent = `Las tablas describen la población; la base guarda solo el ${Math.round(100 * p)} % ${lado && lado.value === 'inferior' ? 'inferior' : 'superior'} de «${v.value}». Si es normal, su DE bajará a ≈ ${Math.round(100 * u)} % de la poblacional y una r de .50 en la población se verá como ≈ ${r}.`;
}
export function montarSeleccion() {
    const v = el('seleccionVariable'); if (!v) return;
    ['focus', 'mousedown'].forEach(evento => v.addEventListener(evento, rellenarVariables));
    [v, el('seleccionLado'), el('seleccionProporcion')].filter(Boolean).forEach(x => { x.addEventListener('change', actualizarSeleccion); x.addEventListener('input', actualizarSeleccion); });
    rellenarVariables();
    actualizarSeleccion();
}
