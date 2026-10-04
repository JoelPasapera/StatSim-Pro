// simulador/ui/correlaciones.js — tarjeta III (correlaciones).
// Extraído de app.js (Fase 2) sin cambiar comportamiento; importaciones explícitas entre módulos.

import { descargarArchivo } from '../../shared/descargas.js';
import { FORMAS_RELACION, GRUPOS_FORMA, esFormaCompuesta, kappaForma, formaPorId } from '../dominio/formas-relacion.js';
import { NUBES } from '../dominio/nubes-relacion.js';

// (Atlas de relaciones, dimensión A) Tipo de relación de cada fila: «Lineal» (r con signo, como siempre), una forma no
// lineal (el número es la fuerza η = r(B, f(A)); la fila se lee A → B) o «Plana» (r = 0)
const opcionesTipoRelacion = () => '<option value="lineal">Lineal (r con signo)</option>'
    + GRUPOS_FORMA.map(g => `<optgroup label="${g}">${FORMAS_RELACION.filter(f => f.grupo === g).map(f => `<option value="${f.id}">${f.nombre}</option>`).join('')}</optgroup>`).join('');
// (Atlas, dimensión B) la nube de cada fila: cómo se reparte la dispersión de B a lo largo de A
const opcionesNube = () => NUBES.map(n => `<option value="${n.id}">${n.etiqueta}</option>`).join('');
function textoNube(nube, tipo) {
    if (nube === 'abanico-abre') return 'Nube: la dispersión de B crece con A (3:1 entre los extremos de A).';
    if (nube === 'abanico-cierra') return 'Nube: la dispersión de B decrece con A (3:1 entre los extremos de A).';
    if (nube === 'atipico') return tipo === 'lineal' || tipo === 'nula' ? 'Atípicos influyentes: la r de la fila es la de la mayoría y «r con los atípicos», la de la base completa; unos pocos casos alejados la cambian (van al final de la base).' : 'El atípico influyente se genera sobre una relación «Lineal» o «Plana».';
    if (nube === 'triangulo') return tipo === 'lineal' ? 'Nube en triángulo: sin A alta no hay B alta (condición necesaria). El borde inferior queda plano con la fuerza «natural», que depende de la distribución de A (≈ .55 si es normal; ≈ .65 si es uniforme); la validación avisa si te alejas.' : 'El triángulo (condición necesaria) se genera sobre una relación «Lineal».';
    return '';
}
function actualizarTipoFila(fila) {
    const sel = fila.querySelector('[aria-label="Tipo de relación"]'), inp = fila.querySelector('[aria-label="Correlación objetivo"]'), nota = fila.querySelector('.nota-tipo-relacion');
    if (!sel || !inp) return;
    const tipo = sel.value, selN = fila.querySelector('[aria-label="Nube"]'), extra = textoNube(selN ? selN.value : 'homogenea', tipo);
    const campos = fila.querySelector('.campos-atipico'); if (campos) campos.style.display = selN && selN.value === 'atipico' ? 'flex' : 'none';
    actualizarTipoBase(tipo, inp, nota);
    if (nota && extra) nota.textContent = `${nota.textContent} ${extra}`.trim();
}
function actualizarTipoBase(tipo, inp, nota) {
    if (tipo === 'nula') { inp.value = '0'; inp.disabled = true; inp.title = 'Sin relación: r = 0'; if (nota) nota.textContent = 'Sin relación: A y B independientes (r = 0).'; return; }
    inp.disabled = false;
    if (esFormaCompuesta(tipo)) {
        inp.min = '0.05'; inp.max = '0.97'; inp.placeholder = 'Ej: 0.6'; inp.title = 'Fuerza η: correlación entre B y la curva f(A), de 0 a 0.97';
        const eta = parseFloat(inp.value), k = kappaForma(tipo), F = formaPorId(tipo);
        if (nota) nota.textContent = `B = f(A), fuerza η (${F.etiqueta}). ${Number.isFinite(eta) ? `Con η = ${eta} y A normal, la r de Pearson rondará ${(Math.abs(eta * k) < 0.005 ? 0 : eta * k).toFixed(2)}.` : `Con A normal, la r de Pearson rondará ${(Math.abs(k) < 0.005 ? 0 : k).toFixed(2)}·η.`}`;
    } else {
        inp.min = '-0.99'; inp.max = '0.99'; inp.placeholder = 'Ej: 0.5'; inp.title = 'r de Pearson (con signo)';
        if (nota) nota.textContent = '';
    }
}
import { mostrarToast } from '../../shared/toast.js';
import { testsDefinidos } from './pruebas.js';

// Lista de variables que pueden correlacionarse: nombres de las escalas y de
// las sociodemográficas continuas (Normal/Asimétrica).
// { generales: false } omite los puntajes generales derivados (la selección por rango necesita una variable con driver propio)
function obtenerVariablesCorrelacionables({ generales = true } = {}) {
    const nombres = [];
    document.querySelectorAll('#bodyPruebas .fila-prueba').forEach(fila => {
        const inputEscala = fila.querySelector('[aria-label="Nombre de la escala"]');
        const nombre = inputEscala ? inputEscala.value.trim() : '';
        if (nombre) nombres.push(nombre);
    });
    // Puntajes GENERALES derivados (tests con ≥2 dimensiones): correlacionables
    // porque el generador reparte la correlación pedida entre sus dimensiones.
    const filasPorTest = {};
    document.querySelectorAll('#bodyPruebas .fila-prueba').forEach(fila => {
        const sel = fila.querySelector('[aria-label="Nombre de la prueba"]');
        const p = sel ? sel.value.trim() : '';
        if (p) filasPorTest[p] = (filasPorTest[p] || 0) + 1;
    });
    (generales && typeof testsDefinidos === 'function' ? testsDefinidos() : []).forEach(t => {
        if ((filasPorTest[t.prueba] || 0) >= 2)
            nombres.push(t.variable ? `${t.variable} — ${t.prueba}` : `Puntaje general — ${t.prueba}`);
    });
    document.querySelectorAll('#bodySocio .fila-socio').forEach(fila => {
        const select = fila.querySelector('select');
        const dist = select ? select.value : 'normal';
        if (dist === 'normal' || dist === 'asimetrica') {
            const categoria = fila.querySelector('input').value.trim();
            if (categoria) nombres.push(categoria);
        }
    });
    return nombres;
}

function agregarFilaCorrelacion() {
    const nombres = obtenerVariablesCorrelacionables();
    if (nombres.length < 2) {
        mostrarToast('Define al menos 2 variables cuantitativas (escalas o continuas) antes de añadir correlaciones', 'warning');
        return;
    }
    const tbody = document.getElementById('bodyCorrelaciones');
    const fila = document.createElement('tr');
    fila.className = 'fila-correlacion';
    const opciones = nombres.map(n => `<option value="${n}">${n}</option>`).join('');
    fila.innerHTML = `
        <td><select class="input input-sm" aria-label="Variable A"><option value="">Variable A...</option>${opciones}</select></td>
        <td><select class="input input-sm" aria-label="Variable B"><option value="">Variable B...</option>${opciones}</select></td>
        <td><input type="number" class="input input-sm" step="0.05" min="-0.99" max="0.99" placeholder="Ej: 0.5" aria-label="Correlación objetivo"></td>
        <td><select class="input input-sm" aria-label="Tipo de relación">${opcionesTipoRelacion()}</select><div class="nota-tipo-relacion help-text" style="font-size:0.8em;margin-top:2px;max-width:22rem;"></div></td>
        <td><select class="input input-sm" aria-label="Nube" title="Cómo se reparte la dispersión de B a lo largo de A">${opcionesNube()}</select><div class="campos-atipico" style="display:none;gap:0.3rem;margin-top:0.3rem;flex-wrap:wrap;"><label style="display:flex;flex-direction:column;flex:1 1 4.5rem;font-size:0.75em;">r con atípicos<input type="number" class="input input-sm" aria-label="r con los atípicos" title="r de la base completa, con los atípicos" min="-0.95" max="0.95" step="0.01" value="0.50"></label><label style="display:flex;flex-direction:column;flex:0 0 3.5rem;font-size:0.75em;">casos<input type="number" class="input input-sm" aria-label="Casos atípicos" title="Número de casos atípicos (1 a 5)" min="1" max="5" step="1" value="3"></label></div></td>
        <td>
            <button type="button" class="btn-icon btn-delete" title="Eliminar" aria-label="Eliminar fila">
                <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 4H13M5 4V3C5 2.44772 5.44772 2 6 2H10C10.5523 2 11 2.44772 11 3V4M6 7V11M10 7V11M4 4H12L11.5 13C11.5 13.5523 11.0523 14 10.5 14H5.5C4.94772 14 4.5 13.5523 4.5 13L4 4Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
            </button>
        </td>
    `;
    tbody.appendChild(fila);
    fila.querySelector('[aria-label="Tipo de relación"]').addEventListener('change', () => actualizarTipoFila(fila));
    fila.querySelector('[aria-label="Nube"]').addEventListener('change', () => actualizarTipoFila(fila));
    fila.querySelector('[aria-label="Correlación objetivo"]').addEventListener('input', () => actualizarTipoFila(fila));
}

// ============================================================================
// CORRELACIONES: importar / exportar (mismo patrón que Pruebas y Sociodemográficos)
// ============================================================================
function exportarConfigCorrelaciones() {
    try {
        const filas = document.querySelectorAll('#bodyCorrelaciones .fila-correlacion');
        if (filas.length === 0) {
            mostrarToast('No hay correlaciones para exportar', 'warning');
            return;
        }
        descargarArchivo(csvDeCorrelaciones(), 'configuracion_correlaciones.csv', 'text/csv');
        mostrarToast('Correlaciones exportadas exitosamente', 'success');
    } catch (error) {
        mostrarToast('Error al exportar: ' + error.message, 'error');
    }
}

function csvDeCorrelaciones() {
    let csv = 'VariableA,VariableB,Correlacion,Tipo,Nube,RAtipicos,CasosAtipicos\n';
    document.querySelectorAll('#bodyCorrelaciones .fila-correlacion').forEach(fila => {
        const selA = fila.querySelector('[aria-label="Variable A"]');
        const selB = fila.querySelector('[aria-label="Variable B"]');
        const inpR = fila.querySelector('[aria-label="Correlación objetivo"]');
        const esc = v => (String(v).includes(',') ? `"${v}"` : String(v));
        const selT = fila.querySelector('[aria-label="Tipo de relación"]');
        const selN = fila.querySelector('[aria-label="Nube"]');
        const atip = selN && selN.value === 'atipico', rA = fila.querySelector('[aria-label="r con los atípicos"]'), kA = fila.querySelector('[aria-label="Casos atípicos"]');
        csv += `${esc(selA ? selA.value : '')},${esc(selB ? selB.value : '')},${inpR ? inpR.value : ''},${selT ? selT.value : 'lineal'},${selN ? selN.value : 'homogenea'},${atip && rA ? rA.value : ''},${atip && kA ? kA.value : ''}\n`;
    });
    return csv;
}

// Aplica filas de correlación desde texto CSV. Devuelve cuántas entraron.
// Las variables deben EXISTIR ya en las tablas I/II (los <select> se llenan de
// ahí): por eso el maestro importa correlaciones al final.
function aplicarCSVCorrelaciones(csv) {
    const lineas = String(csv || '').trim().split(/\r?\n/).filter(l => l.trim());
    if (lineas.length < 2) return { aplicadas: 0, omitidas: 0 };
    const tbody = document.getElementById('bodyCorrelaciones');
    if (tbody) tbody.innerHTML = '';
    let aplicadas = 0, omitidas = 0;
    for (const linea of lineas.slice(1)) {
        const partes = linea.split(',').map(p => p.trim().replace(/^"|"$/g, ''));
        const [varA, varB, r, tipo, nube, rAtip, kAtip] = partes;   // sin columna Tipo (CSV anteriores): lineal; sin Nube: homogénea
        if (!varA || !varB) { omitidas++; continue; }
        agregarFilaCorrelacion();
        const fila = tbody ? tbody.lastElementChild : null;
        if (!fila) { omitidas++; continue; }
        const selA = fila.querySelector('[aria-label="Variable A"]');
        const selB = fila.querySelector('[aria-label="Variable B"]');
        const inpR = fila.querySelector('[aria-label="Correlación objetivo"]');
        const existe = (sel, val) => sel && Array.from(sel.options).some(o => o.value === val);
        if (!existe(selA, varA) || !existe(selB, varB)) { fila.remove(); omitidas++; continue; }
        selA.value = varA; selB.value = varB;
        if (inpR) inpR.value = (r === undefined || r === '') ? '' : r;
        const selT = fila.querySelector('[aria-label="Tipo de relación"]');
        if (selT && tipo && Array.from(selT.options).some(o => o.value === tipo)) selT.value = tipo;
        const selN = fila.querySelector('[aria-label="Nube"]');
        if (selN && nube && Array.from(selN.options).some(o => o.value === nube)) selN.value = nube;
        const rA = fila.querySelector('[aria-label="r con los atípicos"]'), kA = fila.querySelector('[aria-label="Casos atípicos"]');
        if (rA && rAtip) rA.value = rAtip; if (kA && kAtip) kA.value = kAtip;
        actualizarTipoFila(fila);
        aplicadas++;
    }
    return { aplicadas, omitidas };
}

function importarConfigCorrelaciones(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (event) {
        try {
            const encabezado = String(event.target.result).split(/\r?\n/)[0].toLowerCase();
            if (!encabezado.includes('variablea') || !encabezado.includes('correlacion')) {
                mostrarToast('Formato incorrecto. Encabezados esperados: VariableA,VariableB,Correlacion', 'error');
                return;
            }
            const res = aplicarCSVCorrelaciones(event.target.result);
            if (res.aplicadas === 0) {
                mostrarToast('Ninguna correlación se pudo aplicar: define primero esas variables en las tablas I y II', 'warning');
            } else {
                mostrarToast(`${res.aplicadas} correlación(es) importada(s)` + (res.omitidas ? ` · ${res.omitidas} omitida(s): variables inexistentes` : ''), res.omitidas ? 'warning' : 'success');
            }
        } catch (error) {
            mostrarToast('Error al importar: ' + error.message, 'error');
        }
    };
    reader.readAsText(file);
    e.target.value = '';
}

export { obtenerVariablesCorrelacionables, agregarFilaCorrelacion, exportarConfigCorrelaciones, csvDeCorrelaciones, aplicarCSVCorrelaciones, importarConfigCorrelaciones };
