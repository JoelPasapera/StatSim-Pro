// analizador/psicometria/bootstrap-ui.js — bloque «Intervalos de confianza por bootstrap» de la sección de fiabilidad:
// controles (B, método, nivel, semilla), progreso y cancelación, tabla de resultados, y los textos para la redacción y
// el Word. El cálculo va al Worker a través de servicio-psicometrico.js.
import { ejecutarTarea } from './servicio-psicometrico.js';

const f3 = x => (Number.isFinite(x) ? x.toFixed(3).replace(/^(-?)0\./, '$1.') : '—');
const pct = c => `${String(Math.round(c * 1000) / 10).replace('.', ',')} %`;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const COEFICIENTES_BOOTSTRAP = [['alfa', 'α'], ['omega', 'ω'], ['alfaOrdinal', 'α ordinal'], ['omegaOrdinal', 'ω ordinal']];
export const OPCIONES_BOOTSTRAP = { B: 1000, metodo: 'percentil', nivel: 0.95, semilla: 2026 };
export const CABECERA_BOOTSTRAP = ['Escala', 'α [IC]', 'ω [IC]', 'α ordinal [IC]', 'ω ordinal [IC]', 'Réplicas válidas'];

const intervalo = iv => (iv ? `[${f3(iv.inferior)}, ${f3(iv.superior)}]` : '');

// Filas [escala, α, ω, α ord, ω ord, réplicas] de los grupos que tienen resultado
export function filasBootstrap(grupos, resultados) {
    if (!resultados) return [];
    return grupos.map(g => {
        const r = resultados.get(g.clave);
        if (!r) return null;
        const celda = c => (Number.isFinite(r.estimados[c]) ? `${f3(r.estimados[c])} ${intervalo(r.intervalos[c]) || '(sin IC)'}` : '—');
        const validas = COEFICIENTES_BOOTSTRAP.map(([c]) => r.intervalos[c]).filter(Boolean).map(iv => iv.validas);
        return [g.etiqueta, ...COEFICIENTES_BOOTSTRAP.map(([c]) => celda(c)), validas.length ? `${Math.min(...validas)} / ${r.B}` : '—'];
    }).filter(Boolean);
}

export function notaBootstrap(op) {
    return `Intervalos de confianza al ${pct(op.nivel)} por bootstrap ${op.metodo === 'bca' ? 'BCa (con corrección de sesgo y aceleración estimada por jackknife)' : 'percentil'} con ${op.B} remuestras de los participantes con reposición (semilla ${op.semilla}; Efron y Tibshirani, 1993). Réplicas válidas: remuestras en las que ningún ítem quedó sin variación; — = coeficiente no aplicable a la escala; «sin IC» = el intervalo no se pudo estimar (con BCa, todas las réplicas quedaron a un lado del estimado; o menos de la mitad de las réplicas fueron válidas).`;
}

// Frase para la redacción: ω (y ω ordinal si lo hay) de cada escala con su intervalo
export function fraseBootstrap(grupos, resultados, op) {
    if (!resultados) return '';
    const partes = grupos.map(g => {
        const r = resultados.get(g.clave);
        if (!r) return null;
        const trozos = [['omega', 'ω'], ['omegaOrdinal', 'ω ordinal'], ['alfa', 'α']]
            .filter(([c]) => r.intervalos[c] && Number.isFinite(r.estimados[c]))
            .slice(0, 2).map(([c, t]) => `${t} = ${f3(r.estimados[c])} ${intervalo(r.intervalos[c])}`);
        return trozos.length ? `${g.etiqueta}, ${trozos.join(' y ')}` : null;
    }).filter(Boolean);
    if (!partes.length) return '';
    return `Los intervalos de confianza al ${pct(op.nivel)} obtenidos por bootstrap ${op.metodo === 'bca' ? 'BCa' : 'percentil'} (B = ${op.B}; Efron y Tibshirani, 1993) fueron: ${partes.join('; ')}.`;
}

const guia = t => `<div class="orden-guia" role="note" style="margin:0 0 0.6rem;"><span class="orden-guia-titulo">Para qué sirve:</span><span class="orden-nota">${t}</span></div>`;
const selector = (id, opciones, actual) => `<select id="${id}" class="input">${opciones.map(([v, t]) => `<option value="${v}"${String(v) === String(actual) ? ' selected' : ''}>${t}</option>`).join('')}</select>`;

function tablaResultados(grupos, resultados, op) {
    const filas = filasBootstrap(grupos, resultados);
    if (!filas.length) return '';
    return `<table class="result-table"><tr>${CABECERA_BOOTSTRAP.map(h => `<th>${h}</th>`).join('')}</tr>${filas.map(f => `<tr>${f.map((c, i) => (i === 0 ? `<td><strong>${esc(c)}</strong></td>` : `<td>${esc(c)}</td>`)).join('')}</tr>`).join('')}</table>
        <p class="help-text"><em>Nota.</em> ${esc(notaBootstrap(op))}</p>`;
}

/**
 * Monta el bloque en `zona`. grupos: [{ clave, etiqueta, cols }]; resultados: Map(clave → resultado) o null;
 * esperando: los coeficientes ordinales aún se calculan (el botón espera); alTerminar(opciones, Map) guarda y repinta.
 */
export function montarBloqueBootstrap(zona, { grupos, opciones, resultados, esperando, alTerminar }) {
    if (!zona) return;
    const op = { ...OPCIONES_BOOTSTRAP, ...(opciones || {}) };
    zona.innerHTML = `
        <h5 style="margin-bottom:0.5rem; font-weight:600;">Intervalos de confianza por bootstrap</h5>
        ${guia('Acota cada coeficiente con un intervalo de confianza: se remuestrean los participantes con reposición y en cada remuestra se recalculan α, ω y los coeficientes ordinales. La semilla hace el resultado reproducible: la misma semilla da siempre el mismo intervalo.')}
        <div class="rejilla-psico">
            <div class="form-group"><label for="bootB">Remuestras (B)</label>${selector('bootB', [[500, '500 (rápido)'], [1000, '1000 (recomendado)'], [2000, '2000 (más estable)']], op.B)}
                <span class="help-text">Más remuestras estabilizan los límites; el tiempo crece en proporción.</span></div>
            <div class="form-group"><label for="bootMetodo">Método</label>${selector('bootMetodo', [['percentil', 'Percentil'], ['bca', 'BCa (corrige sesgo y asimetría)']], op.metodo)}
                <span class="help-text">BCa es más exacto con coeficientes cerca de 1, pero añade un jackknife: tarda más.</span></div>
            <div class="form-group"><label for="bootNivel">Nivel de confianza</label>${selector('bootNivel', [[0.9, '90 %'], [0.95, '95 %'], [0.99, '99 %']], op.nivel)}
                <span class="help-text">El 95 % es el estándar en tesis.</span></div>
            <div class="form-group"><label for="bootSemilla">Semilla</label><input id="bootSemilla" type="number" class="input" min="1" step="1" value="${op.semilla}">
                <span class="help-text">Anótala en el informe para que el cálculo sea replicable.</span></div>
        </div>
        <div class="acciones-fila">
            <button type="button" id="bootCalcular" class="btn btn-primary"${esperando || !grupos.length ? ' disabled' : ''}>${esperando ? 'Esperando los coeficientes ordinales…' : 'Calcular intervalos'}</button>
            <button type="button" id="bootCancelar" class="btn btn-outline" hidden>Cancelar</button>
        </div>
        <div id="bootProgresoFila" class="boot-progreso" hidden><progress id="bootProgreso" max="100" value="0" aria-label="Progreso del bootstrap"></progress> <span id="bootEstado" class="help-text" aria-live="polite"></span></div>
        <div id="bootResultados">${tablaResultados(grupos, resultados, op)}</div>`;
    const q = s => zona.querySelector(s);
    q('#bootCalcular').addEventListener('click', () => {
        const nuevas = { B: Number(q('#bootB').value), metodo: q('#bootMetodo').value, nivel: Number(q('#bootNivel').value), semilla: Math.max(1, Math.floor(Number(q('#bootSemilla').value) || OPCIONES_BOOTSTRAP.semilla)), ordinal: true };
        const inicio = Date.now();
        q('#bootCalcular').disabled = true; q('#bootCancelar').hidden = false; q('#bootProgresoFila').hidden = false;
        q('#bootEstado').textContent = 'Preparando…';
        const tarea = ejecutarTarea('bootstrap', grupos.map(g => ({ clave: g.clave, cols: g.cols })), nuevas, (hecho, total) => {
            q('#bootProgreso').value = Math.round((100 * hecho) / total);
            const s = (Date.now() - inicio) / 1000, restante = hecho > 0 ? (s * (total - hecho)) / hecho : 0;
            q('#bootEstado').textContent = `${Math.round((100 * hecho) / total)} % · ${s.toFixed(0)} s${hecho < total ? (hecho / total >= 0.05 ? ` · faltan ~${Math.ceil(restante)} s` : ' · estimando el tiempo…') : ''}`;   // la estimación solo con ≥ 5 % hecho
        });
        q('#bootCancelar').onclick = () => tarea.cancelar();
        tarea.promesa.then(lista => {
            alTerminar(nuevas, new Map(lista.map(r => [r.clave, r])));
        }).catch(e => {
            q('#bootCalcular').disabled = false; q('#bootCancelar').hidden = true;
            q('#bootEstado').textContent = e.cancelado ? 'Cálculo cancelado.' : `No se pudo calcular: ${e.message}`;
        });
    });
}
