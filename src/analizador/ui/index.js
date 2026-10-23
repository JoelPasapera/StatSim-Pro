// analizador/ui/index.js — montaje de la interfaz del Analizador.
// Origen: analizador-ui.js (Fase 3), sin cambios de comportamiento; dependencias explícitas.

import { ExportadorWord } from '../exportador-word.js';
import { actualizarTituloRegresion, agregarPredictorExtra, agregarVariableExtra, ejecutarAnalisis } from './analisis.js';
import { actualizarEtiquetasAnalisis, alCambiarHojaXlsx, cargarArchivo, cargarDatosGenerados } from './carga.js';
import './proyecto.js';   // (2026.12.31) lo que el Analizador guarda en un proyecto (se inscribe al importarse)
import { montarImpresionAnalizador } from './impresion.js';
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



// (2027.01.01) Por qué no hay capítulo de Word tras un análisis que no es una correlación de dos variables (el capítulo se
// redacta sobre ella; sus secciones ya comparan esas variables según cada variable sociodemográfica)
const SIN_CAPITULO = {
    comparacion: 'El capítulo de Word se redacta sobre una correlación entre dos variables cuantitativas, y ya incluye su comparación según cada variable sociodemográfica. Esta comparación de grupos está en «Descargar resultados» y en «Imprimir o guardar en PDF».',
    asociacion: 'El capítulo de Word se redacta sobre una correlación entre dos variables cuantitativas. Esta asociación (χ²) está en «Descargar resultados» y en «Imprimir o guardar en PDF».',
    matriz: 'Con tres o más variables el análisis es una matriz de correlaciones, y el capítulo de Word se redacta sobre la correlación de dos: quita las variables adicionales, ejecuta el análisis y vuelve a exportar. La matriz está en «Imprimir o guardar en PDF».'
};

/** «Exportar capítulo a Word»: el de la última correlación, o el motivo por el que el último análisis no lo tiene. */
function exportarCapituloWord() {
    const motivo = !window.ultimoAnalisis && SIN_CAPITULO[window.ultimoTipoAnalisis];
    if (motivo) { mostrarToast(motivo, 'warning', 10000); return; }
    ExportadorWord.descargar(window.ultimoAnalisis);
}

// ========================================
// CONFIGURACIÓN DEL ANALIZADOR
// ========================================
export function montarAnalizador() {
    // Botón usar datos generados
    document.getElementById('btnUsarGenerados').addEventListener('click', cargarDatosGenerados);
    // Input file CSV
    document.getElementById('fileInput').addEventListener('change', cargarArchivo);   // (2026.12.29) un CSV o un .sav; (2026.12.31) o un .xlsx
    const hojaXlsx = document.getElementById('hojaXlsx');   // (2026.12.31) otra hoja del libro de Excel cargado
    if (hojaXlsx) hojaXlsx.addEventListener('change', alCambiarHojaXlsx);
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
    if (btnWord) btnWord.addEventListener('click', exportarCapituloWord);
    montarImpresionAnalizador();   // (2027.01.01) «Imprimir o guardar en PDF» y el encabezado de lo impreso
}
