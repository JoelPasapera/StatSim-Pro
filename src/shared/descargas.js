// shared/descargas.js — descarga de archivos generados en el navegador.
// Extraído de app.js (Fase 2) sin cambiar comportamiento; importaciones explícitas entre módulos.
import { temporizadorCosmetico } from './temporizador.js';

// (2026.12.29) Con descargarBlob: revocaba la URL en el mismo instante del clic, lo que puede cancelar la descarga en Firefox
// y Safari.
function descargarArchivo(contenido, nombreArchivo, tipoMime) {
    descargarBlob(new Blob([contenido], { type: tipoMime + ';charset=utf-8;' }), nombreArchivo);
}

// Descarga un Blob ya construido (Word, imágenes…). El enlace se añade al documento (Firefox lo exige) y la URL se
// libera después del clic: revocarla en el mismo instante puede cancelar la descarga en Firefox y Safari.
function descargarBlob(blob, nombreArchivo) {
    const enlace = document.createElement('a');
    const url = URL.createObjectURL(blob);
    enlace.href = url; enlace.download = nombreArchivo; enlace.style.display = 'none';
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    temporizadorCosmetico(() => URL.revokeObjectURL(url), 1500);
}

export { descargarArchivo, descargarBlob };
