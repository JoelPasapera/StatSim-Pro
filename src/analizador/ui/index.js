// analizador/ui/index.js — montaje de la interfaz del Analizador.
// Origen: analizador-ui.js (Fase 3), sin cambios de comportamiento; dependencias explícitas.

import { ExportadorWord } from '../exportador-word.js';
import { actualizarTituloRegresion, agregarPredictorExtra, agregarVariableExtra, ejecutarAnalisis } from './analisis.js';
import { actualizarEtiquetasAnalisis, cargarArchivoCSV, cargarDatosGenerados } from './carga.js';
import { descargarResultados } from './sociodemografica.js';
import { parsearLineaCSV } from '../../shared/csv.js';
import { EtiquetasVariables } from '../../shared/etiquetas-variables.js';
import { obtenerEtiqueta } from '../../shared/etiquetas.js';
import { mostrarToast } from '../../shared/toast.js';

// ============================================================================

// analizador-ui.js — interfaz del Analizador (heredado, script clásico con defer) hasta la Fase 3.

// Sale de app.js en la Fase 2 sin cambios; usa las funciones compartidas que src/simulador/ui/index.js

// expone en window (mostrarToast, obtenerEtiqueta, parsearLineaCSV, …).

// ============================================================================



// ========================================
// CONFIGURACIÓN DEL ANALIZADOR
// ========================================
export function montarAnalizador() {
    // Botón usar datos generados
    document.getElementById('btnUsarGenerados').addEventListener('click', cargarDatosGenerados);
    // Input file CSV
    document.getElementById('fileInput').addEventListener('change', cargarArchivoCSV);
    // Editor de etiquetas SIEMPRE visible: antes de cargar datos muestra su
    // versión de espera para que la función sea descubrible.
    if (typeof EtiquetasVariables !== 'undefined' && EtiquetasVariables.mostrarVacio) {
        EtiquetasVariables.mostrarVacio('editorEtiquetas');
    }
    // Botón analizar (ejecutarAnalisis ya inicializa los gráficos al final)
    document.getElementById('btnAnalizar').addEventListener('click', ejecutarAnalisis);
    // Cambio de tipo de análisis: actualizar las etiquetas de los selectores
    const bAV = document.getElementById('btnAgregarVariable');
    if (bAV) bAV.addEventListener('click', agregarVariableExtra);
    const bAP = document.getElementById('btnAgregarPredictor');
    if (bAP) bAP.addEventListener('click', agregarPredictorExtra);
    actualizarTituloRegresion();
    try { actualizarEtiquetasAnalisis(); } catch (e) {}
    document.querySelectorAll('input[name="tipoAnalisis"]').forEach(radio => {
        radio.addEventListener('change', actualizarEtiquetasAnalisis);
    });
    // Botón descargar resultados
    document.getElementById('btnDescargarResultados').addEventListener('click', descargarResultados);
    const btnWord = document.getElementById('btnExportarWord');
    if (btnWord) btnWord.addEventListener('click', () => ExportadorWord.descargar(window.ultimoAnalisis));
}
