// redactor/redactor/exportacion.js — RedactorTeorico: copiar, PDF y Word.
// Origen: redactor/redactor.js (Fase 6: partición por responsabilidad, sin cambios de comportamiento).

export const metodosRedactorTeoricoExportacion = {
    // Copia al portapapeles el documento mostrado (con fallback clásico).
    async _onCopiar() {
        const res = document.getElementById('redResultado');
        const btn = document.getElementById('redCopiar');
        const texto = res ? res.textContent : '';
        if (!texto) return;
        let ok = false;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(texto);
                ok = true;
            }
        } catch (e) { /* probar fallback */ }
        if (!ok) {
            try {
                const ta = document.createElement('textarea');
                ta.value = texto;
                ta.style.position = 'fixed'; ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                ok = document.execCommand('copy');
                document.body.removeChild(ta);
            } catch (e) { ok = false; }
        }
        if (btn) {
            const t = btn.textContent;
            btn.textContent = ok ? '✓ Copiado' : '❌ No se pudo copiar';
            setTimeout(() => { btn.textContent = t; }, 2000);
        }
    },

    // ============ PDF: mismo documento, jsPDF bajo demanda (patrón ExcelJS) ============
    // jsPDF con fuentes core = WinAnsi/Latin-1: ı, ć, α, β, guiones tipográficos…
    // producen glifos rotos y LÍNEAS DECAPITADAS. Transliteración fiel solo-PDF
    // (el Word conserva todo perfecto).
    _paraPDF(s) {
        return String(s == null ? '' : s)
            .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, '-')
            .replace(/[\u2018\u2019\u201A]/g, "'").replace(/[\u201C\u201D\u201E]/g, '"')
            .replace(/\u2026/g, '...').replace(/[\u00A0\u202F\u2009]/g, ' ')
            .replace(/ı/g, 'i').replace(/İ/g, 'I')
            .replace(/[ćč]/g, 'c').replace(/[ĆČ]/g, 'C')
            .replace(/[şș]/g, 's').replace(/[ŞȘ]/g, 'S')
            .replace(/[ğ]/g, 'g').replace(/[łŀ]/g, 'l').replace(/[ŁĿ]/g, 'L')
            .replace(/[đ]/g, 'd').replace(/[Đ]/g, 'D').replace(/[ž]/g, 'z').replace(/[Ž]/g, 'Z')
            .replace(/α/g, 'alfa').replace(/β/g, 'beta').replace(/λ/g, 'lambda').replace(/χ/g, 'chi')
            .replace(/≈/g, '~').replace(/≤/g, '<=').replace(/≥/g, '>=')
            .replace(/[→↔]/g, '-').replace(/[«»]/g, '"')
            .replace(/[^\u0000-\u00FF]/g, '');
    },

    _cargarJsPDF() {
        if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
        const urls = [
            'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
            'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js'
        ];
        return urls.reduce((p, u) => p.catch(() => new Promise((res, rej) => {
            const sc = document.createElement('script');
            sc.src = u; sc.onload = res; sc.onerror = rej; document.head.appendChild(sc);
        })), Promise.reject());
    },

    async _onDescargarPDF() {
        if (!this._documento) return;
        const estado = document.getElementById('redEstado');
        try { await this._cargarJsPDF(); } catch (e) {
            if (estado) estado.textContent = '❌ No se pudo cargar el generador de PDF (¿CDN bloqueado?). Usa Descargar Word.';
            return;
        }
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ unit: 'pt', format: 'letter' });
        const M = 72, ANCHO = 612 - M * 2, PIE = 720, LINEA = 23;
        let y = M;
        const salto = (n = LINEA) => { y += n; if (y > PIE) { pdf.addPage(); y = M; } };
        const parrafo = (texto, francesa = false, sangriaInicial = false) => {
            const limpio = this._paraPDF(texto);
            let lineas;
            if (sangriaInicial) {
                // Sangría APA de 1ª línea (0.5in): la primera se parte a ancho reducido
                // y el resto refluye a ancho completo.
                const primera = pdf.splitTextToSize(limpio, ANCHO - 36)[0] || '';
                const resto = limpio.slice(primera.length).trim();
                lineas = [{ tx: primera, x: M + 36 }, ...pdf.splitTextToSize(resto, ANCHO).map(tx => ({ tx, x: M }))];
            } else {
                lineas = pdf.splitTextToSize(limpio, ANCHO - (francesa ? 36 : 0)).map((tx, i) => ({ tx, x: M + (francesa && i > 0 ? 36 : 0) }));
            }
            for (const ln of lineas) {
                if (y > PIE) { pdf.addPage(); y = M; }
                if (ln.tx) pdf.text(ln.tx, ln.x, y);
                y += LINEA;
            }
        };
        pdf.setFontSize(12);
        const d = this._documento;
        let capAct = '';
        for (const s of d.secciones) {
            if ((s.capitulo || 'II') !== capAct) {
                capAct = s.capitulo || 'II';
                if (y > PIE - 60) { pdf.addPage(); y = M; }   // encabezado jamás huérfano al pie
                pdf.setFont('times', 'bold');
                pdf.text(capAct === 'I' ? 'CAPÍTULO I: INTRODUCCIÓN' : 'CAPÍTULO II: MARCO TEÓRICO', 306, y, { align: 'center' });
                salto(LINEA * 1.4);
            }
            if (y > PIE - 60) { pdf.addPage(); y = M; }
            pdf.setFont('times', 'bold');
            pdf.text(this._paraPDF(String(s.titulo || '').toUpperCase()), 306, y, { align: 'center' });
            salto(LINEA * 1.2);
            pdf.setFont('times', 'normal');
            for (const par of String(s.texto || '').split(/\n{2,}/)) { parrafo(par.trim(), false, true); salto(6); }
            salto(10);
        }
        pdf.addPage(); y = M;
        pdf.setFont('times', 'bold');
        pdf.text('REFERENCIAS', 306, y, { align: 'center' }); salto(LINEA * 1.3);
        pdf.setFont('times', 'normal');
        const refs = d.citadas.slice().sort((a, b) => String(a.ref).localeCompare(String(b.ref), 'es'));
        for (const f of refs) { parrafo(String(f.ref), true); salto(4); }
        // Números de página (APA: esquina superior derecha)
        const nPag = pdf.internal.getNumberOfPages();
        for (let p = 1; p <= nPag; p++) { pdf.setPage(p); pdf.setFont('times', 'normal'); pdf.setFontSize(11); pdf.text(String(p), 612 - M, 40, { align: 'right' }); pdf.setFontSize(12); }
        pdf.save('marco_teorico_APA.pdf');
    },

    _onDescargarWord() {
        if (!this._documento) return;
        const html = this._htmlAPA(this._documento);
        let blob, nombre;
        if (typeof htmlDocx !== 'undefined' && htmlDocx.asBlob) {
            blob = htmlDocx.asBlob('<!DOCTYPE html>' + html);
            nombre = 'marco_teorico_APA.docx';
        } else {
            blob = new Blob(['\ufeff' + html], { type: 'application/msword' });
            nombre = 'marco_teorico_APA.doc';
        }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = nombre;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    },
};
