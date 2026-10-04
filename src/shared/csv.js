// shared/csv.js — utilidades de CSV y de atributos HTML.
// Extraído de app.js (Fase 2) sin cambiar comportamiento; importaciones explícitas entre módulos.

// ========================================
// UTILIDADES PARA CSV
// ========================================
function parsearLineaCSV(linea) {
    const resultado = [];
    let dentroComillas = false;
    let valorActual = '';
    for (let i = 0; i < linea.length; i++) {
        const char = linea[i];
        if (char === '"') {
            dentroComillas = !dentroComillas;
        } else if (char === ',' && !dentroComillas) {
            resultado.push(valorActual.trim());
            valorActual = '';
        } else {
            valorActual += char;
        }
    }
    resultado.push(valorActual.trim());
    return resultado;
}

function escapeAttr(v) { return String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

export { parsearLineaCSV, escapeAttr };
