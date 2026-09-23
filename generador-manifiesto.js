// ============================================================================
// generador-manifiesto.js — lista ordenada de los módulos del generador y su versión.
// La usan index.html (etiquetas <script>), el Worker (importScripts) y las pruebas.
// Sube GENERADOR_VERSION cuando cambie cualquiera de ellos.
// ============================================================================
const GENERADOR_VERSION = '1';
const GENERADOR_MODULOS = [
    "generador-nucleo.js",
    "generador-configuracion.js",
    "generador-validacion.js",
    "generador-correlaciones.js",
    "generador-grupos.js",
    "generador-items.js",
    "generador-flujo.js",
    "generador-imperfecciones.js",
    "generador-informe.js",
    "generador-instancia.js"
];
if (typeof window !== 'undefined') { window.GENERADOR_VERSION = GENERADOR_VERSION; window.GENERADOR_MODULOS = GENERADOR_MODULOS; }
if (typeof self !== 'undefined' && typeof window === 'undefined') { self.GENERADOR_VERSION = GENERADOR_VERSION; self.GENERADOR_MODULOS = GENERADOR_MODULOS; }
