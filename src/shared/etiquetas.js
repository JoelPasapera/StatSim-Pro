// shared/etiquetas.js — etiqueta humana de columnas y opciones (la usan el Simulador y el Analizador).
// Extraído de app.js (Fase 2) sin cambiar comportamiento; importaciones explícitas entre módulos.

import { EtiquetasVariables } from './etiquetas-variables.js';
// Etiqueta humana GLOBAL: la consumen la regresión, la comparación de grupos,
// ANCOVA/MANOVA y la matriz de flujo para sus textos. Antes no existía y todos
// los módulos caían silenciosamente al nombre técnico de la columna.
function obtenerEtiqueta(columna) {
    return (typeof EtiquetasVariables !== 'undefined') ? EtiquetasVariables.etiqueta(columna) : columna;
}

// Variante para selects: "Etiqueta (Columna_tecnica)".
function obtenerEtiquetaOpcion(columna) {
    return (typeof EtiquetasVariables !== 'undefined') ? EtiquetasVariables.etiquetaConColumna(columna) : columna;
}

export { obtenerEtiqueta, obtenerEtiquetaOpcion };
