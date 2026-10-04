// redactor/redactor/plan.js — RedactorTeorico: variables del estudio y plan de secciones.
// Origen: redactor/redactor.js (Fase 6: partición por responsabilidad, sin cambios de comportamiento).

import { IAAsistente } from '../../shared/ia-asistente.js';

export const metodosRedactorTeoricoPlan = {
    // ---- Identificar variables con IA (editables por el usuario) ----
    async _onIdentificarVariables() {
        const problema = (document.getElementById('antQuery') || {}).value || '';
        const caja = document.getElementById('redVariables');
        const estado = document.getElementById('redEstado');
        const btn = document.getElementById('redIdentificar');
        if (problema.trim().length < 15) {
            if (estado) estado.textContent = '⚠️ Escribe primero el problema de investigación (arriba, en «Búsqueda intensiva»).';
            const p = document.getElementById('antQuery'); if (p) p.focus();
            return;
        }
        if (caja && caja.value.trim().length > 5) {
            if (!confirm('Ya tienes variables escritas. ¿Reemplazarlas por una nueva propuesta de la IA?')) return;
        }
        const t = btn ? btn.textContent : '';
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Identificando…'; }
        if (estado) estado.textContent = 'La IA está identificando las variables de estudio…';
        try {
            if (typeof IAAsistente === 'undefined') throw new Error('El asistente de IA no está cargado.');
            const vars = await IAAsistente.extraerVariables(problema);
            if (caja) caja.value = vars.map(v => `${v.nombre} — ${v.definicion}`).join('\n');
            const hintIns = document.getElementById('redHintInstrumento');
            if (!hintIns && caja && caja.parentElement) {
                caja.insertAdjacentHTML('afterend', '<p id="redHintInstrumento" class="help-text" style="margin:0.3rem 0 0;font-size:0.85em;">💡 Opcional pero recomendado: añade al final de cada línea « — Instrumento: [nombre del test o inventario]». El redactor lo usará para <b>delimitar el modelo teórico</b> que adopta tu investigación (p. ej., habilidad vs. rasgo) anclándolo a cómo medirás la variable.</p>');
            }
            if (estado) estado.textContent = `✓ ${vars.length} variable(s) identificada(s). Revísalas y edítalas a tu criterio.`;
        } catch (e) {
            if (estado) estado.textContent = '❌ ' + (e.message || 'No se pudieron identificar las variables.');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = t; }
        }
    },

    _normTexto(s) {
        return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    },

    // Variables desde el textarea: [{nombre, definicion, instrumento}]
    _leerVariables() {
        const t = (document.getElementById('redVariables') || {}).value || '';
        return t.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
            // Separador flexible: raya larga/media en cualquier posición; el guion
            // corto SOLO rodeado de espacios — nombres como «auto-eficacia» o
            // «socio-emocional» no deben partirse jamás (bug G2 del plan).
            let partes = l.split(/\s*[—–]\s*/);
            if (partes.length === 1) partes = l.split(/\s+-\s+/);
            const nombre = partes[0];
            let definicion = partes.slice(1).join(' — ').trim(), instrumento = '';
            const mi = definicion.match(/\s*[—-]\s*Instrumento\s*:\s*(.+)$/i);
            if (mi) { instrumento = mi[1].trim(); definicion = definicion.slice(0, mi.index).trim(); }
            return { nombre: (nombre || '').trim(), definicion, instrumento };
        }).filter(v => v.nombre);
    },

    // Plan de secciones (dinámico según las variables). partes:'auto' = la
    // sección se divide en ceil(fuentes/MAX) partes: reparto EQUITATIVO del
    // corpus completo con cada llamada dentro de su zona de calidad.
    _construirPlanSecciones(variables) {
        const plan = [];
        plan.push({ titulo: 'Planteamiento del problema', capitulo: 'I', afinidad: '', partes: 1,
            instrucciones: 'Redacta el planteamiento del problema: describe el fenómeno (con cifras de las fuentes '
                + 'solo si aparecen en los resúmenes), el contexto y las consecuencias. REGLA DE COHERENCIA DEL '
                + 'VACÍO: como la investigación es de tipo correlacional, el vacío que identifiques DEBE ser '
                + 'coherente con esa pregunta — controversia o desacuerdo teórico sobre la relación (o independencia) '
                + 'entre los constructos, hallazgos inconsistentes entre estudios previos, o ausencia de evidencia '
                + 'sobre esa relación en la población y contexto del estudio. PROHIBIDO justificar el estudio por '
                + 'falta de datos de prevalencia o epidemiológicos: ese es un vacío descriptivo de salud pública, '
                + 'discordante con una pregunta correlacional. Cierra formulando la pregunta general en forma '
                + 'correlacional (¿Existe relación entre X e Y en [población]?).' });
        plan.push({ titulo: 'Justificación', capitulo: 'I', afinidad: '', partes: 1,
            instrucciones: 'Redacta la justificación del estudio en sus formas pertinentes (teórica, práctica, '
                + 'metodológica y/o social), cada argumento sustentado con citas de las fuentes.' });
        plan.push({ titulo: 'Estado de la cuestión', capitulo: 'II', afinidad: '', partes: 1,
            instrucciones: 'Sintetiza qué se sabe actualmente sobre el tema, ORGANIZADO POR CONCEPTOS (no '
                + 'estudio por estudio): agrupa hallazgos convergentes y señala discrepancias y vacíos. '
                + 'Responde implícitamente, en este orden: dónde COINCIDEN los estudios, dónde DISCREPAN, y '
                + 'POR QUÉ podrían discrepar (medidas distintas, poblaciones, diseños); el lector debe llegar '
                + 'al final sintiendo que la investigación propuesta es la consecuencia lógica del recorrido. '
                + 'Si la evidencia es heterogénea (positiva, negativa y nula), conviértelo en argumento de defensa: '
                + 'la falta de homogeneidad JUSTIFICA contrastar empíricamente la relación en la población específica.' });
        plan.push({ titulo: 'Antecedentes', capitulo: 'II', afinidad: '', partes: 'auto',
            instrucciones: 'Redacta los antecedentes como una SÍNTESIS POR EJES TEMÁTICOS, no como un desfile '
                + 'de estudios. Agrupa las fuentes según lo que sus hallazgos evidencian (relaciones halladas, '
                + 'resultados divergentes, poblaciones o niveles de análisis, aproximaciones metodológicas) y '
                + 'desarrolla cada eje integrando VARIOS estudios por párrafo, con sus citas agrupadas. Haz que '
                + 'los estudios DIALOGUEN: convergencias, divergencias y qué sugiere cada contraste — y cierra '
                + 'el recorrido dejando claro qué se sabe ESPECÍFICAMENTE de la población del problema y qué no. Los datos '
                + 'de muestra, contexto o diseño solo se mencionan cuando son el argumento (p. ej., para explicar '
                + 'una discrepancia entre estudios). Cubre TODAS las fuentes de la lista, repartidas dentro de '
                + 'los ejes, y cierra cada eje con lo que el conjunto de la evidencia permite concluir.' });
        for (const v of variables) {
            plan.push({ titulo: `Bases teóricas: ${v.nombre}`, capitulo: 'II', afinidad: v.nombre + ' ' + v.definicion, partes: 1,
                instrucciones: `Desarrolla con profundidad la variable «${v.nombre}»: definiciones de distintos `
                    + `autores (cada una con su cita), evolución del concepto y componentes o dimensiones — `
                    + `contrastando las definiciones entre sí (en qué coinciden y en qué difieren), no como un `
                    + `listado. DELIMITACIÓN CONCEPTUAL OBLIGATORIA: si en las fuentes coexisten aproximaciones u `
                    + `operacionalizaciones rivales del constructo, preséntalas Y declara explícitamente cuál `
                    + `adopta esta investigación, justificando la elección`
                    + (v.instrumento ? ` por su correspondencia con el instrumento previsto («${v.instrumento}»)` : ` por su correspondencia con el instrumento de medición que la operacionalizará`)
                    + `; mantén esa adopción de forma consistente en el resto del texto.` });
        }
        for (const v of variables) {
            plan.push({ titulo: `Modelos teóricos de ${v.nombre}`, capitulo: 'II', afinidad: v.nombre + ' modelo teoría enfoque', partes: 1,
                instrucciones: `Expón los modelos o teorías que explican «${v.nombre}» SEGÚN LAS FUENTES: nombre `
                    + `del modelo, autores (con cita) y postulados centrales; señala convergencias y diferencias. `
                    + `Si los modelos son rivales o parten de perspectivas opuestas, CIERRA declarando cuál adopta `
                    + `esta investigación y por qué`
                    + (v.instrumento ? ` (el instrumento previsto, «${v.instrumento}», operacionaliza esa perspectiva)` : ` (anclando la elección al instrumento de medición previsto)`)
                    + `.` });
        }
        plan.push({ titulo: 'Definición conceptual de las variables', capitulo: 'II', afinidad: variables.map(v => v.nombre).join(' '), partes: 1,
            instrucciones: 'CIERRA el marco explicitando la CADENA completa por variable: definición → modelo '
                + 'adoptado → dimensiones → instrumento (de la FICHA, con su familia) → conexión explícita con '
                + 'el objetivo y las hipótesis. Para CADA variable de estudio, presenta su definición conceptual formal con la cita '
                + 'del autor correspondiente (una definición principal y, si las fuentes lo permiten, una alternativa). '
                + 'La definición final de cada variable debe corresponder EXACTAMENTE al modelo o aproximación '
                + 'adoptado en las bases teóricas (coherencia de delimitación conceptual).' });
        return plan;
    },
};
