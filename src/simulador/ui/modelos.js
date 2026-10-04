// simulador/ui/modelos.js — tarjeta V (mediación, moderación, curvilínea).
// Extraído de app.js (Fase 2) sin cambiar comportamiento; importaciones explícitas entre módulos.

import { parsearLineaCSV } from '../../shared/csv.js';
import { mostrarToast } from '../../shared/toast.js';
import { obtenerVariablesCorrelacionables } from './correlaciones.js';
import { nombresGeneralesDerivados } from './pruebas.js';
import { esTerceraVariable } from '../dominio/terceras.js';

// ---- (B6) Tabla V: modelos estructurales ----
// Una fila = un modelo. Mediación: a (X→M), b (M→Y con X), c′ (X→Y directo).
// Moderación: β₁ (X), β₂ (W), β₃ (X×W). Coeficientes estandarizados.
function agregarFilaModelo(datos = null) {
    const nombres = obtenerVariablesCorrelacionables();
    if (nombres.length < 3) {
        mostrarToast('Define al menos 3 variables cuantitativas (escalas o continuas) antes de añadir un modelo', 'warning');
        return null;
    }
    const tbody = document.getElementById('bodyModelos');
    if (!tbody) return null;
    const fila = document.createElement('tr');
    fila.className = 'fila-modelo';
    const opciones = nombres.map(n => `<option value="${n}">${n}</option>`).join('');
    const coef = (n) => `<input type="number" class="input input-sm" step="0.05" min="-0.99" max="0.99" aria-label="Coeficiente ${n}">`;
    fila.innerHTML = `
        <td><select class="input input-sm" aria-label="Tipo de modelo"><option value="mediacion">Mediación (X → M → Y)</option><option value="moderacion">Moderación (X × W → Y)</option><option value="curvilinea">Curvilínea (X² → Y)</option><option value="confusion">Confusión (Z causa X e Y)</option><option value="supresion">Supresión (Z oculta X → Y)</option><option value="colisionador">Colisionador (X e Y causan Z)</option></select></td>
        <td><select class="input input-sm" aria-label="Variable X"><option value="">X (predictora)...</option>${opciones}</select></td>
        <td><select class="input input-sm" aria-label="Mediador o moderador"><option value="">Mediador M...</option>${opciones}</select></td>
        <td><select class="input input-sm" aria-label="Variable Y"><option value="">Y (criterio)...</option>${opciones}</select></td>
        <td>${coef(1)}</td>
        <td>${coef(2)}</td>
        <td>${coef(3)}</td>
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
        const poner = (etiqueta, valor) => { const el = fila.querySelector(`[aria-label="${etiqueta}"]`); if (el && valor !== undefined) el.value = valor; };
        poner('Tipo de modelo', ['moderacion', 'curvilinea'].includes(datos.tipo) || esTerceraVariable(datos.tipo) ? datos.tipo : 'mediacion');
        poner('Variable X', datos.x); poner('Mediador o moderador', datos.m); poner('Variable Y', datos.y);
        poner('Coeficiente 1', datos.c1); poner('Coeficiente 2', datos.c2); poner('Coeficiente 3', datos.c3);
    }
    actualizarEtiquetasModelo(fila);
    return fila;
}

function actualizarEtiquetasModelo(fila) {
    if (!fila) return;
    const tipo = (fila.querySelector('[aria-label="Tipo de modelo"]') || {}).value;
    const c = n => fila.querySelector(`[aria-label="Coeficiente ${n}"]`);
    const selM = fila.querySelector('[aria-label="Mediador o moderador"]');
    // (Atlas, fase C) terceras variables: r(Z,X), r(Z,Y) y la relación VERDADERA de X con Y (la parcial, o la de orden cero en
    // el colisionador, porque controlar un efecto común crea una relación que no existe)
    const etiquetas = esTerceraVariable(tipo)
        ? [['r(Z,X)', 'Correlación de la tercera variable Z con X'], ['r(Z,Y)', 'Correlación de la tercera variable Z con Y'],
            tipo === 'colisionador' ? ['r(X,Y) verdadera', 'Relación verdadera de X con Y, SIN controlar Z: X e Y causan Z, y controlar ese efecto común crea una relación que no existe'] : ['r parcial X–Y', `Relación verdadera de X con Y, CONTROLANDO Z${tipo === 'confusion' ? ' (0 = la relación de orden cero es espuria, se debe toda a Z)' : ' (en la supresión es mayor que la de orden cero)'}`]]
        : tipo === 'moderacion'
        ? [['β₁ (X)', 'β₁: efecto estandarizado de X sobre Y'], ['β₂ (W)', 'β₂: efecto estandarizado del moderador W sobre Y'], ['β₃ (X×W)', 'β₃: efecto de la interacción X×W (X y W estandarizadas)']]
        : (tipo === 'curvilinea'
            ? [['β₁ (lineal)', 'β₁: efecto lineal estandarizado de X sobre Y'], ['β₂ (cuadrático)', 'β₂: efecto de X² (X estandarizada, X² centrada); negativo = U invertida, positivo = U'], ['—', 'No se usa en la relación curvilínea']]
            : [['a (X→M)', 'a: efecto estandarizado de X sobre el mediador M'], ['b (M→Y)', 'b: efecto estandarizado de M sobre Y, controlando X'], ['c′ (X→Y)', 'c′: efecto directo estandarizado de X sobre Y, controlando M']]);
    etiquetas.forEach(([ph, tt], k) => { const el = c(k + 1); if (el) { el.placeholder = ph; el.title = tt; } });
    // (C6) curvilínea: sin mediador/moderador ni tercer coeficiente
    const curv = tipo === 'curvilinea';
    if (selM) { selM.disabled = curv; if (curv) selM.value = ''; }
    if (c(3)) { c(3).disabled = curv; if (curv) c(3).value = ''; }
    if (selM && selM.options.length) selM.options[0].textContent = esTerceraVariable(tipo) ? 'Tercera variable Z...' : tipo === 'moderacion' ? 'Moderador W...' : (curv ? '— (X²)' : 'Mediador M...');
    // Un puntaje general derivado no puede entrar en una moderación (no tiene
    // driver propio): sus opciones se deshabilitan en ese tipo.
    const generales = new Set(nombresGeneralesDerivados());
    ['Variable X', 'Mediador o moderador', 'Variable Y'].forEach(etiqueta => {
        const sel = fila.querySelector(`[aria-label="${etiqueta}"]`);
        if (!sel) return;
        Array.from(sel.options).forEach(op => { if (generales.has(op.value)) op.disabled = (tipo === 'moderacion'); });
        if (tipo === 'moderacion' && generales.has(sel.value)) sel.value = '';
    });
}

// (B6) CSV de la tabla V (modelos estructurales)
function csvDeModelos() {
    let csv = 'Tipo,X,MediadorModerador,Y,Coef1,Coef2,Coef3\n';
    const esc = v => (String(v).includes(',') ? `"${v}"` : String(v));
    document.querySelectorAll('#bodyModelos .fila-modelo').forEach(fila => {
        const v = etiqueta => { const el = fila.querySelector(`[aria-label="${etiqueta}"]`); return el ? el.value : ''; };
        csv += `${v('Tipo de modelo')},${esc(v('Variable X'))},${esc(v('Mediador o moderador'))},${esc(v('Variable Y'))},${v('Coeficiente 1')},${v('Coeficiente 2')},${v('Coeficiente 3')}\n`;
    });
    return csv;
}

function aplicarCSVModelos(csv) {
    const lineas = String(csv || '').trim().split(/\r?\n/).filter(l => l.trim());
    if (lineas.length < 2) return { aplicadas: 0, omitidas: 0 };
    const tbody = document.getElementById('bodyModelos');
    if (tbody) tbody.innerHTML = '';
    let aplicadas = 0, omitidas = 0;
    for (const linea of lineas.slice(1)) {
        const [tipo, x, m, y, c1, c2, c3] = parsearLineaCSV(linea.trim()).map(p => String(p).trim().replace(/^"|"$/g, ''));
        if (!x || !y || (!m && tipo !== 'curvilinea')) { omitidas++; continue; }   // (F2) la curvilínea no lleva mediador
        const fila = agregarFilaModelo({ tipo, x, m, y, c1, c2, c3 });
        if (!fila) { omitidas++; continue; }
        const existe = etiqueta => { const sel = fila.querySelector(`[aria-label="${etiqueta}"]`); return sel && sel.value !== ''; };
        if (!existe('Variable X') || (tipo !== 'curvilinea' && !existe('Mediador o moderador')) || !existe('Variable Y')) { fila.remove(); omitidas++; continue; }
        aplicadas++;
    }
    return { aplicadas, omitidas };
}

export { agregarFilaModelo, actualizarEtiquetasModelo, csvDeModelos, aplicarCSVModelos };
