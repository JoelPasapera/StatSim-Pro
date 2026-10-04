// buscador/antecedentes/base.js — Antecedentes: helpers compartidos por los módulos de Antecedentes.
// Origen: buscador/antecedentes.js (Fase 6: partición por responsabilidad, sin cambios de comportamiento).

// buscador/antecedentes.js — orquestación del Buscador de antecedentes: consultas, resultados, fichas y exportación (ExcelJS a demanda).
// Origen: antecedentes.js (Fase 4), sin cambios de comportamiento; dependencias explícitas.


// ========================================
// BUSCADOR DE ANTECEDENTES v2 — módulo especializado multi-fuente.
// Consulta EN PARALELO tres APIs académicas abiertas (sin claves, CORS ok):
//   · Semantic Scholar — ranking semántico (lo más cercano a Google Académico)
//   · OpenAlex         — cobertura masiva, filtros de idioma/fecha
//   · Crossref         — metadatos editoriales de revistas
// Luego FUSIONA (deduplicación por DOI/título), RE-RANKEA localmente
// (coincidencias en título ≫ resumen, bonus de frase, idioma y citas) y
// sugiere SINÓNIMOS para términos atípicos. Sin Google Scholar embebido:
// CORS lo impide a nivel de navegador; se ofrece como pestaña externa.
// ========================================

// ---- ExcelJS bajo demanda: se descarga UNA vez, al primer uso (exportar o
// importar .xlsx), en vez de en el arranque de la página (~926 KB ahorrados).
let _excelJSPromesa = null;
function asegurarExcelJS() {
    if (typeof ExcelJS !== 'undefined') return Promise.resolve();
    if (_excelJSPromesa) return _excelJSPromesa;
    _excelJSPromesa = new Promise((listo, falla) => {
        const s = document.createElement('script');
        s.src = 'assets/vendor/exceljs.min.js';
        s.onload = listo;
        s.onerror = () => {
            _excelJSPromesa = null;
            falla(new Error('No se pudo descargar el módulo de Excel. Revisa tu conexión e inténtalo de nuevo.'));
        };
        document.head.appendChild(s);
    });
    return _excelJSPromesa;
}

export { _excelJSPromesa, asegurarExcelJS };
