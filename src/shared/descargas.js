// shared/descargas.js — descarga de archivos generados en el navegador.
// Extraído de app.js (Fase 2) sin cambiar comportamiento; importaciones explícitas entre módulos.

function descargarArchivo(contenido, nombreArchivo, tipoMime) {
    const blob = new Blob([contenido], { type: tipoMime + ';charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', nombreArchivo);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
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
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export { descargarArchivo, descargarBlob };
