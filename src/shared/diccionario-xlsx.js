// @ts-check
// shared/diccionario-xlsx.js — (2026.12.31) cómo se llaman las hojas del libro de Excel que descarga el Simulador
// (simulador/dominio/exportacion-xlsx.js) y cómo empieza su hoja de diccionario: el Analizador
// (analizador/motor/datos-xlsx.js) reconoce así un libro del Simulador y toma de él las etiquetas de variable, sin que
// un módulo importe al otro.

/** Las hojas del libro: la base, su diccionario y el informe de cómo se generó. */
export const HOJAS_LIBRO = Object.freeze({ DATOS: 'Datos', DICCIONARIO: 'Diccionario', INFORME: 'Informe' });

/** Los encabezados de la hoja de diccionario (las dos primeras columnas bastan para reconocerla). */
export const ENCABEZADO_DICCIONARIO = Object.freeze(['Variable', 'Etiqueta', 'Nivel de medida', 'Tipo', 'Valores']);
