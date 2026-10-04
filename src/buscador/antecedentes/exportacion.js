// buscador/antecedentes/exportacion.js — Antecedentes: copia de referencias y exportación a XLSX/CSV (ExcelJS a demanda).
// Origen: buscador/antecedentes.js (Fase 6: partición por responsabilidad, sin cambios de comportamiento).

import { asegurarExcelJS } from './base.js';

export const metodosAntecedentesExportacion = {

    // Copia las referencias al portapapeles CON FORMATO (cursivas reales).
    async _copiarReferencias(refs) {
        const estado = document.getElementById('antEstado');
        const html = refs.map(r => `<p style="margin:0 0 10pt 36pt; text-indent:-36pt;">${r}</p>`).join('');
        const plano = refs.map(r => r.replace(/<\/?i>/g, '')).join('\n\n');
        try {
            if (navigator.clipboard && window.ClipboardItem) {
                await navigator.clipboard.write([new ClipboardItem({
                    'text/html': new Blob([html], { type: 'text/html' }),
                    'text/plain': new Blob([plano], { type: 'text/plain' })
                })]);
            } else {
                await navigator.clipboard.writeText(plano);
            }
            if (estado) estado.textContent = `${refs.length} referencias copiadas con formato. Pégalas en Word.`;
        } catch (e) {
            if (estado) estado.textContent = 'No se pudo copiar automáticamente; selecciona y copia manualmente.';
        }
    },


    _construirLibroXLSX(cols, filas) {
        if (typeof ExcelJS === 'undefined') throw new Error('La librería de Excel no está cargada.');
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Matriz de revisión');

        // Anchos: Excel mide en "caracteres" del tipo por defecto; la conversión
        // estándar desde píxeles es (px - 5) / 7.
        ws.columns = cols.map(c => ({
            width: Math.round(((this._ANCHOS_PX_MATRIZ[c] || 100) - 5) / 7 * 100) / 100
        }));

        const fuente = { name: 'Times New Roman', size: 12 };
        const alineado = { vertical: 'middle', horizontal: 'left', wrapText: true };
        // "Todos los bordes": línea fina en los cuatro lados de cada celda.
        const lado = { style: 'thin', color: { argb: 'FF000000' } };
        const bordes = { top: lado, left: lado, bottom: lado, right: lado };

        // Encabezado (fila 1): negrita, fondo gris claro y bordes.
        const filaEnc = ws.addRow(cols);
        filaEnc.eachCell(cell => {
            cell.font = { ...fuente, bold: true };
            cell.alignment = alineado;
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
            cell.border = bordes;
        });

        // Cuerpo: valores planos (sin HTML), con el formato pedido y bordes.
        for (const f of filas) {
            const fila = ws.addRow(f.planas);
            fila.eachCell({ includeEmpty: true }, cell => {
                cell.font = fuente;
                cell.alignment = alineado;
                cell.border = bordes;
            });
        }
        return wb;
    },


    async _exportarXLSX(cols, filas) {
        try {
            await asegurarExcelJS();
            const wb = this._construirLibroXLSX(cols, filas);
            const buffer = await wb.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'matriz_revision_bibliografica.xlsx';
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        } catch (e) {
            alert('No se pudo generar el Excel: ' + e.message);
        }
    },


    // Exporta la matriz COMPLETA a CSV (UTF-8 con BOM para Excel).
    // sep=';' → Excel en español (abre en columnas con doble clic).
    // sep=',' → estándar internacional (Google Sheets, Excel en inglés).
    _exportarCSV(cols, filas, SEP = ';') {
        const esc = v => {
            const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
            // Se entrecomilla si el campo contiene el separador, comillas o saltos.
            return new RegExp('["\\n' + (SEP === ';' ? ';' : ',') + ']').test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        // Solo el formato español lleva la pista "sep=;" (Excel-ES la respeta);
        // el internacional se mantiene como CSV puro, que Sheets/Excel-EN ya leen.
        const lineas = SEP === ';' ? ['sep=;'] : [];
        lineas.push(cols.map(esc).join(SEP));
        filas.forEach(f => lineas.push(f.planas.map(esc).join(SEP)));
        const blob = new Blob(['\ufeff' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = SEP === ';' ? 'matriz_revision_es.csv' : 'matriz_revision_intl.csv';
        a.click();
        URL.revokeObjectURL(a.href);
        const estado = document.getElementById('antEstado');
        if (estado) estado.textContent = `Matriz exportada (${filas.length} artículos) en CSV.`;
    },
};
