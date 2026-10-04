// version.js — versión única del sitio (controla la caché de los módulos y del Worker) y registro de secciones.
export const VERSION = '2026.11.23';
// Secciones de la cáscara: id (= #hash), título y cargador perezoso. Las que aún son código heredado
// (Analizador, Buscador, Redactor, Explorador) se cargan por sus etiquetas <script defer> de index.html
// hasta que migren (Fases 3–5); cuando migren, su cargador pasa a ser un import() y su etiqueta desaparece.
export const SECCIONES = [
    { id: 'simulador', titulo: 'Simulador', cargar: () => import('./simulador/index.js') },
    { id: 'analizador', titulo: 'Analizador', cargar: () => import('./analizador/index.js') },
    { id: 'buscador', titulo: 'Buscador', cargar: () => import('./buscador/index.js') },
    { id: 'redactor', titulo: 'Redactor', cargar: () => import('./redactor/index.js') },
    { id: 'explorador', titulo: 'Explorador', cargar: () => import('./explorador/index.js') }
];
