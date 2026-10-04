// simulador/ui/sociodemograficos.js — tarjeta II (sociodemográficas): filas, «Depende de», referencia del MAR, CSV.
// Extraído de app.js (Fase 2) sin cambiar comportamiento; importaciones explícitas entre módulos.

import { actualizarBloqueoSocio } from './guia-coherencia.js';
import { escapeAttr, parsearLineaCSV } from '../../shared/csv.js';
import { descargarArchivo } from '../../shared/descargas.js';
import { mostrarToast } from '../../shared/toast.js';
import { csvDeTabla } from './pruebas.js';

function agregarFilaSocio() {
    const tbody = document.getElementById('bodySocio');
    const nuevaFila = tbody.querySelector('.fila-socio').cloneNode(true);
    // Limpiar valores
    nuevaFila.querySelectorAll('input').forEach(input => {
        input.value = '';
    });
    // (B9) la fila nueva no hereda la dependencia de la fila clonada
    nuevaFila.querySelectorAll('[aria-label="Depende de"]').forEach(sel => { sel.innerHTML = '<option value="">Ninguna</option>'; sel.value = ''; });
    tbody.appendChild(nuevaFila);
    actualizarBloqueoSocio(nuevaFila);
    mostrarToast('Variable agregada', 'success');
}

function eliminarFilaSocio(fila) {
    const tbody = document.getElementById('bodySocio');
    const filas = tbody.querySelectorAll('.fila-socio');
    if (filas.length <= 1) {
        mostrarToast('Debe haber al menos una variable sociodemográfica', 'warning');
        return;
    }
    fila.remove();
    mostrarToast('Variable eliminada', 'success');
}

// (B9) Variables binarias o categóricas de las que puede depender la fila dada
function poblarDependeDe(sel) {
    const fila = sel.closest('.fila-socio');
    const actual = sel.value;
    const nombres = [];
    document.querySelectorAll('#bodySocio .fila-socio').forEach(f => {
        if (f === fila) return;
        const dist = (f.querySelector('select') || {}).value;
        const nombre = (f.querySelector('input') || {}).value || '';
        if ((dist === 'binaria' || dist === 'categorica') && nombre.trim()) nombres.push(nombre.trim());
    });
    sel.innerHTML = '<option value="">Ninguna</option>' + nombres.map(n => `<option value="${escapeAttr(n)}"${n === actual ? ' selected' : ''}>${escapeAttr(n)}</option>`).join('');
    if (actual && !nombres.includes(actual)) sel.value = '';
}

// (B9) Referencia del MAR: sociodemográficas numéricas u ordinales y escalas
function poblarReferenciaMAR() {
    const sel = document.getElementById('referenciaMAR');
    if (!sel) return;
    const actual = sel.value;
    const nombres = [];
    document.querySelectorAll('#bodySocio .fila-socio').forEach(f => {
        const dist = (f.querySelector('select') || {}).value;
        const nombre = ((f.querySelector('input') || {}).value || '').trim();
        const opciones = (f.querySelector('[aria-label="Categorías u opciones"]') || {}).value || '';
        if (!nombre) return;
        if (dist === 'normal' || dist === 'asimetrica' || dist === 'uniforme' || dist === 'conteo') nombres.push(nombre);
        else if (dist === 'categorica' && opciones.includes('<')) nombres.push(nombre);   // ordinal
    });
    document.querySelectorAll('#bodyPruebas .fila-prueba [aria-label="Nombre de la escala"]').forEach(inp => { const n = inp.value.trim(); if (n) nombres.push(n); });
    sel.innerHTML = '<option value="">Referencia automática</option>' + nombres.map(n => `<option value="${escapeAttr(n)}"${n === actual ? ' selected' : ''}>${escapeAttr(n)}</option>`).join('');
    if (actual && !nombres.includes(actual)) sel.value = '';
}

function agregarFilaSocioConDatos(datos) {
    const tbody = document.getElementById('bodySocio');
    const nuevaFila = document.createElement('tr');
    nuevaFila.className = 'fila-socio';
    const dist = datos.distribucion || 'normal';
    const opcion = (valor, etiqueta) => `<option value="${valor}"${dist === valor ? ' selected' : ''}>${etiqueta}</option>`;
    nuevaFila.innerHTML = `
        <td><input type="text" class="input input-sm" placeholder="Ej: Edad" value="${datos.categoria}" aria-label="Categoría"></td>
        <td>
            <select class="input input-sm" aria-label="Distribución">
                ${opcion('normal', 'Normal')}${opcion('uniforme', 'Uniforme')}${opcion('asimetrica', 'Asimétrica')}${opcion('conteo', 'Conteo (Poisson)')}${opcion('binaria', 'Binaria (0/1)')}${opcion('categorica', 'Categórica')}
            </select>
        </td>
        <td><input type="number" class="input input-sm" placeholder="Ej: 20" step="0.01" value="${datos.promedio}" aria-label="Promedio"></td>
        <td><input type="number" class="input input-sm" placeholder="Ej: 2.5" step="0.01" min="0.01" value="${datos.de}" aria-label="Desviación estándar"></td>
        <td><input type="number" class="input input-sm" placeholder="Ej: 15" step="0.01" value="${datos.min}" aria-label="Mínimo"></td>
        <td><input type="number" class="input input-sm" placeholder="Ej: 25" step="0.01" value="${datos.max}" aria-label="Máximo"></td>
        <td><input type="number" class="input input-sm" placeholder="Ej: 2" min="0" max="4" value="${datos.decimales}" aria-label="Número de decimales"></td>
        <td><input type="text" class="input input-sm" placeholder="Ej: Femenino, Masculino" maxlength="400" value="${escapeAttr(datos.opciones || '')}" aria-label="Categorías u opciones" title="Binaria/categórica: «Femenino, Masculino», «Soltero:60, Casado:40» (proporciones) o «Primaria < Secundaria < Superior» (ordinal). Continua (edad): «fecha» o «fecha:AAAA-MM-DD» para añadir la fecha de nacimiento."></td>
        <td>
            <select class="input input-sm" aria-label="Depende de" title="Otra variable binaria o categórica de la que depende esta (asociación)."><option value="">Ninguna</option>${datos.dependeDe ? `<option value="${escapeAttr(datos.dependeDe)}" selected>${escapeAttr(datos.dependeDe)}</option>` : ''}</select>
            <input type="number" class="input input-sm" style="margin-top:0.3rem;" step="0.05" min="0" max="0.95" value="${datos.fuerza !== undefined && datos.fuerza !== '' ? datos.fuerza : '0.4'}" placeholder="fuerza 0–0.95" aria-label="Fuerza de la asociación" title="Fuerza de la asociación (r latente): 0.2 leve, 0.4 moderada, 0.6 fuerte.">
        </td>
        <td>
            <button type="button" class="btn-icon btn-delete" title="Eliminar" aria-label="Eliminar fila">
                <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 4H13M5 4V3C5 2.44772 5.44772 2 6 2H10C10.5523 2 11 2.44772 11 3V4M6 7V11M10 7V11M4 4H12L11.5 13C11.5 13.5523 11.0523 14 10.5 14H5.5C4.94772 14 4.5 13.5523 4.5 13L4 4Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
            </button>
        </td>
    `;
    tbody.appendChild(nuevaFila);
    actualizarBloqueoSocio(nuevaFila);
}

// Aplica un CSV de SOCIODEMOGRÁFICOS a la tabla II. Devuelve nº de filas.
function aplicarCSVSocio(csv) {
    const lineas = String(csv || '').trim().split(/\r?\n/).filter(l => l.trim());
    if (lineas.length < 2) return 0;
    const tieneDistribucion = lineas[0].toLowerCase().includes('distribucion');
    const tbody = document.getElementById('bodySocio');
    if (tbody) tbody.innerHTML = '';
    let n = 0;
    for (const linea of lineas.slice(1)) {
        const v = parsearLineaCSV(linea.trim());
        if (v.length < 3) continue;
        const d = tieneDistribucion ? 1 : 0;
        agregarFilaSocioConDatos({
            categoria: v[0] || '', distribucion: tieneDistribucion ? (v[1] || 'normal') : 'normal',
            promedio: v[1 + d] || '', de: v[2 + d] || '', min: v[3 + d] || '', max: v[4 + d] || '', decimales: v[5 + d] || '2',
            opciones: v[6 + d] || '', dependeDe: v[7 + d] || '', fuerza: v[8 + d] !== undefined && v[8 + d] !== '' ? v[8 + d] : '0.4'
        });
        n++;
    }
    return n;
}

// SOCIODEMOGRÁFICOS
function exportarConfigSocio() {
    try {
        const filas = document.querySelectorAll('#bodySocio .fila-socio');
        if (filas.length === 0) {
            mostrarToast('No hay variables sociodemográficas para exportar', 'warning');
            return;
        }
        // Mismo formato que el archivo maestro (con Opciones, DependeDe y Fuerza)
        descargarArchivo(csvDeTabla('#bodySocio .fila-socio', 'socio'), 'configuracion_sociodemograficos.csv', 'text/csv');
        mostrarToast('Configuración de sociodemográficos exportada exitosamente', 'success');
    } catch (error) {
        mostrarToast('Error al exportar: ' + error.message, 'error');
    }
}

function importarConfigSocio(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (event) {
        try {
            const csv = event.target.result;
            const enc = String(csv).trim().split(/\r?\n/)[0].toLowerCase();
            if (!enc.includes('categoria') || !enc.includes('promedio')) {
                mostrarToast('El archivo CSV no tiene el formato correcto. Encabezados esperados: Categoria,Distribucion,Promedio,DE,Minimo,Maximo,Decimales,Opciones,DependeDe,Fuerza', 'error');
                return;
            }
            const n = aplicarCSVSocio(csv);   // misma compatibilidad de formatos que el archivo maestro
            mostrarToast(`Configuración importada: ${n} variables`, 'success');
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

export { agregarFilaSocio, eliminarFilaSocio, poblarDependeDe, poblarReferenciaMAR, agregarFilaSocioConDatos, aplicarCSVSocio, exportarConfigSocio, importarConfigSocio };
