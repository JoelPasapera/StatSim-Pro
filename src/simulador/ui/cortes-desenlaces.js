// simulador/ui/cortes-desenlaces.js — tarjeta VIII (puntos de corte y desenlaces).
// Extraído de app.js (Fase 2) sin cambiar comportamiento; importaciones explícitas entre módulos.

import { escapeAttr, parsearLineaCSV } from '../../shared/csv.js';
import { obtenerVariablesCorrelacionables } from './correlaciones.js';
import { nombresGeneralesDerivados } from './pruebas.js';

// ---- (C2/C3) Tarjeta VIII: puntos de corte y desenlaces ----
// Rellena un desplegable con variables: 'escalas' (escalas y puntajes generales)
// o 'cuantitativas' (además, sociodemográficas continuas), conservando el valor.
function poblarSelectVariables(sel, tipo) {
    const actual = sel.value;
    let nombres;
    if (tipo === 'escalas') {
        nombres = [];
        document.querySelectorAll('#bodyPruebas .fila-prueba [aria-label="Nombre de la escala"]').forEach(inp => { const n = inp.value.trim(); if (n) nombres.push(n); });
        nombres = nombres.concat(nombresGeneralesDerivados());
    } else nombres = obtenerVariablesCorrelacionables();
    sel.innerHTML = `<option value="">${tipo === 'escalas' ? 'Escala...' : 'Ninguno'}</option>` + nombres.map(n => `<option value="${escapeAttr(n)}"${n === actual ? ' selected' : ''}>${escapeAttr(n)}</option>`).join('');
    if (actual && !nombres.includes(actual)) sel.value = '';
}

function agregarFilaCorte(datos = null) {
    const tbody = document.getElementById('bodyCortes');
    if (!tbody) return null;
    const fila = document.createElement('tr');
    fila.className = 'fila-corte';
    fila.innerHTML = `
        <td><select class="input input-sm" aria-label="Escala a cortar" data-poblar="escalas"><option value="">Escala...</option></select></td>
        <td><input type="text" class="input input-sm" placeholder="Ej: Bajo, Medio, Alto @ 20, 30  ·  o  @ P25, P75" maxlength="300" aria-label="Categorías y cortes"></td>
        <td>
            <button type="button" class="btn-icon btn-delete" title="Eliminar" aria-label="Eliminar fila">
                <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 4H13M5 4V3C5 2.44772 5.44772 2 6 2H10C10.5523 2 11 2.44772 11 3V4M6 7V11M10 7V11M4 4H12L11.5 13C11.5 13.5523 11.0523 14 10.5 14H5.5C4.94772 14 4.5 13.5523 4.5 13L4 4Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
            </button>
        </td>
    `;
    tbody.appendChild(fila);
    const sel = fila.querySelector('[aria-label="Escala a cortar"]');
    poblarSelectVariables(sel, 'escalas');
    if (datos) { sel.value = datos.variable || ''; fila.querySelector('[aria-label="Categorías y cortes"]').value = datos.texto || ''; }
    return fila;
}

function agregarFilaDesenlace(datos = null) {
    const tbody = document.getElementById('bodyDesenlaces');
    if (!tbody) return null;
    const fila = document.createElement('tr');
    fila.className = 'fila-desenlace';
    const pred = j => `<td><select class="input input-sm" aria-label="Predictor ${j}" data-poblar="cuantitativas"><option value="">Ninguno</option></select><input type="number" class="input input-sm" style="margin-top:0.3rem;" step="0.1" min="0.1" max="10" placeholder="OR/IRR por DE" aria-label="Efecto del predictor ${j}"></td>`;
    fila.innerHTML = `
        <td><input type="text" class="input input-sm" placeholder="Ej: Deserción" maxlength="60" aria-label="Nombre del desenlace"></td>
        <td><select class="input input-sm" aria-label="Tipo de desenlace"><option value="binario">Binario (sí/no)</option><option value="conteo">Conteo</option><option value="ordinal">Ordinal</option></select></td>
        <td><input type="text" class="input input-sm" placeholder="Ej: No, Sí: 25 %" maxlength="300" aria-label="Parámetro del desenlace"></td>
        ${pred(1)}${pred(2)}${pred(3)}
        <td>
            <button type="button" class="btn-icon btn-delete" title="Eliminar" aria-label="Eliminar fila">
                <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 4H13M5 4V3C5 2.44772 5.44772 2 6 2H10C10.5523 2 11 2.44772 11 3V4M6 7V11M10 7V11M4 4H12L11.5 13C11.5 13.5523 11.0523 14 10.5 14H5.5C4.94772 14 4.5 13.5523 4.5 13L4 4Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
            </button>
        </td>
    `;
    tbody.appendChild(fila);
    fila.querySelectorAll('select[data-poblar]').forEach(s => poblarSelectVariables(s, 'cuantitativas'));
    if (datos) {
        const poner = (et, v) => { const el = fila.querySelector(`[aria-label="${et}"]`); if (el && v !== undefined && v !== null) el.value = v; };
        poner('Nombre del desenlace', datos.nombre); poner('Tipo de desenlace', datos.tipo); poner('Parámetro del desenlace', datos.parametro);
        (datos.predictores || []).forEach((p, j) => { poner(`Predictor ${j + 1}`, p.variable); poner(`Efecto del predictor ${j + 1}`, p.efecto); });
    }
    actualizarFilaDesenlace(fila);
    return fila;
}

function actualizarFilaDesenlace(fila) {
    if (!fila) return;
    const tipo = (fila.querySelector('[aria-label="Tipo de desenlace"]') || {}).value;
    const par = fila.querySelector('[aria-label="Parámetro del desenlace"]');
    if (par) par.placeholder = tipo === 'conteo' ? 'Media, ej: 2.5' : (tipo === 'ordinal' ? 'Ej: Bajo:50, Medio:30, Alto:20' : 'Ej: No, Sí: 25 %');
    fila.querySelectorAll('[aria-label^="Efecto del predictor"]').forEach(inp => { inp.placeholder = tipo === 'conteo' ? 'IRR por DE' : 'OR por DE'; });
}

function csvDeCortes() {
    let csv = 'Variable,CategoriasCortes\n';
    const esc = v => (String(v).includes(',') || String(v).includes('"') ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    document.querySelectorAll('#bodyCortes .fila-corte').forEach(f => { csv += `${esc((f.querySelector('select') || {}).value || '')},${esc((f.querySelector('input') || {}).value || '')}\n`; });
    return csv;
}

function aplicarCSVCortes(csv) {
    const lineas = String(csv || '').trim().split(/\r?\n/).filter(l => l.trim());
    const tbody = document.getElementById('bodyCortes'); if (tbody) tbody.innerHTML = '';
    let aplicadas = 0;
    for (const linea of lineas.slice(1)) {
        const [variable, texto] = parsearLineaCSV(linea.trim()).map(p => String(p).trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
        if (!variable) continue;
        const fila = agregarFilaCorte({ variable, texto });
        if (fila && fila.querySelector('select').value === '') { fila.remove(); continue; }
        aplicadas++;
    }
    return aplicadas;
}

function csvDeDesenlaces() {
    let csv = 'Nombre,Tipo,Parametro,Predictor1,Efecto1,Predictor2,Efecto2,Predictor3,Efecto3\n';
    const esc = v => (String(v).includes(',') || String(v).includes('"') ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    document.querySelectorAll('#bodyDesenlaces .fila-desenlace').forEach(f => {
        const v = et => { const el = f.querySelector(`[aria-label="${et}"]`); return el ? el.value : ''; };
        csv += [v('Nombre del desenlace'), v('Tipo de desenlace'), v('Parámetro del desenlace'), v('Predictor 1'), v('Efecto del predictor 1'), v('Predictor 2'), v('Efecto del predictor 2'), v('Predictor 3'), v('Efecto del predictor 3')].map(esc).join(',') + '\n';
    });
    return csv;
}

function aplicarCSVDesenlaces(csv) {
    const lineas = String(csv || '').trim().split(/\r?\n/).filter(l => l.trim());
    const tbody = document.getElementById('bodyDesenlaces'); if (tbody) tbody.innerHTML = '';
    let aplicadas = 0;
    for (const linea of lineas.slice(1)) {
        const v = parsearLineaCSV(linea.trim()).map(p => String(p).trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
        if (!v[0]) continue;
        const predictores = [];
        for (let j = 0; j < 3; j++) if (v[3 + 2 * j]) predictores.push({ variable: v[3 + 2 * j], efecto: v[4 + 2 * j] });
        agregarFilaDesenlace({ nombre: v[0], tipo: v[1] || 'binario', parametro: v[2] || '', predictores });
        aplicadas++;
    }
    return aplicadas;
}

export { poblarSelectVariables, agregarFilaCorte, agregarFilaDesenlace, actualizarFilaDesenlace, csvDeCortes, aplicarCSVCortes, csvDeDesenlaces, aplicarCSVDesenlaces };
