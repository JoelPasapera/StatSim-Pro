// ========================================
// EXPORTADOR DEL CAPÍTULO DE RESULTADOS A WORD (APA 7)
// Genera un documento que Microsoft Word abre nativamente (HTML con el
// espacio de nombres de Office), con: Times New Roman 12, interlineado
// doble en prosa, tablas APA 7 numeradas (sin bordes verticales; filetes
// solo superior, bajo el encabezado e inferior), títulos en cursiva y
// notas de tabla. Consume window.ultimoAnalisis (guardado por app.js) y
// los módulos globales para recalcular tablas — cero duplicación de prosa.
// ========================================

const ExportadorWord = {

    _n: 0, // contador de tablas

    _tablaAPA(titulo, headers, filas, nota) {
        this._n += 1;
        const th = headers.map(h =>
            `<td style="border-top:1pt solid black;border-bottom:1pt solid black;padding:4pt 6pt;font-weight:bold;">${h}</td>`).join('');
        const tr = filas.map((f, i) => '<tr>' + f.map(c =>
            `<td style="padding:3pt 6pt;${i === filas.length - 1 ? 'border-bottom:1pt solid black;' : ''}">${c}</td>`).join('') + '</tr>').join('');
        return `
            <p style="margin:14pt 0 0;line-height:200%;"><b>Tabla ${this._n}</b></p>
            <p style="margin:0 0 6pt;line-height:200%;"><i>${titulo}</i></p>
            <table style="border-collapse:collapse;width:100%;font-size:12pt;line-height:115%;">
                <tr>${th}</tr>${tr}
            </table>
            ${nota ? `<p style="margin:4pt 0 0;font-size:11pt;line-height:150%;"><i>Nota.</i> ${nota}</p>` : ''}`;
    },

    _p(texto) {
        return `<p style="margin:0 0 0;line-height:200%;text-align:justify;text-indent:0.5in;">${texto}</p>`;
    },

    _seccion(titulo) {
        return `<p style="margin:14pt 0 6pt;line-height:200%;"><b>${titulo}</b></p>`;
    },

    generarCapitulo(ctx) {
        this._n = 0;
        const I = InterpretacionesEstadisticas;
        const A = AnalizadorEstadistico;
        const datos = A.obtenerDatos() || [];
        const { var1, var2, et1, et2, resultado, criba, tipoPrueba } = ctx;
        let h = `<h1 style="font-size:14pt;text-align:center;">Resultados</h1>`;

        // ---- Tabla sociodemográfica ----
        const cats = (typeof obtenerColumnasCategoricas === 'function') ? obtenerColumnasCategoricas(6) : [];
        if (cats.length) {
            const filas = [];
            cats.forEach(col => {
                const conteo = new Map();
                datos.forEach(d => { const k = String(d[col] ?? '').trim(); if (k) conteo.set(k, (conteo.get(k) || 0) + 1); });
                const total = [...conteo.values()].reduce((a, b) => a + b, 0);
                [...conteo.entries()].sort((a, b) => b[1] - a[1]).forEach(([cat, f], i) => {
                    filas.push([i === 0 ? `<b>${col}</b>` : '', cat, f, (100 * f / total).toFixed(1) + '%']);
                });
            });
            h += this._seccion('Características sociodemográficas de la muestra');
            h += this._tablaAPA(`Distribución de frecuencias de las variables sociodemográficas (N = ${datos.length})`,
                ['Variable', 'Categoría', 'f', '%'], filas,
                'Los porcentajes se calculan sobre los casos con dato válido en cada variable.');
        }

        // ---- Niveles ----
        if (typeof calcularNivelesDeValores === 'function') {
            [[var1, et1], [var2, et2]].forEach(([col, et]) => {
                const r = calcularNivelesDeValores(datos.map(d => +d[col]));
                if (!r) return;
                h += this._tablaAPA(`Niveles de ${et} (n = ${r.n})`,
                    ['Nivel', 'Rango de puntajes', 'f', '%'],
                    r.niveles.map(o => [o.nivel, o.rango, o.f, o.pct.toFixed(1) + '%']),
                    'Puntos de corte por terciles empíricos de la muestra (percentiles 33.3 y 66.7).');
            });
        }

        // ---- Descriptivos ----
        const d1 = resultado.descriptivas1, d2 = resultado.descriptivas2;
        if (d1 && d2) {
            const fmt = x => Number.isFinite(x) ? x.toFixed(2) : '—';
            h += this._tablaAPA(`Estadísticos descriptivos de ${et1} y ${et2}`,
                ['Estadístico', et1, et2],
                [['N', resultado.n, resultado.n],
                 ['Media (M)', fmt(d1.media), fmt(d2.media)],
                 ['Desviación estándar (DE)', fmt(d1.desviacionEstandar), fmt(d2.desviacionEstandar)],
                 ['Mínimo', fmt(d1.minimo), fmt(d2.minimo)],
                 ['Máximo', fmt(d1.maximo), fmt(d2.maximo)],
                 ['Asimetría', fmt(d1.asimetria), fmt(d2.asimetria)],
                 ['Curtosis', fmt(d1.curtosis), fmt(d2.curtosis)]], null);
        }

        // ---- Normalidad ----
        const n1 = resultado.normalidad1, n2 = resultado.normalidad2;
        const fp = p => p < 0.001 ? '< .001' : p.toFixed(3).replace(/^0\./, '.');
        h += this._seccion('Prueba de normalidad');
        h += this._tablaAPA(`Prueba de normalidad de ${et1} y ${et2}`,
            ['Variable', 'Prueba', 'Estadístico', 'p', 'Decisión'],
            [[et1, n1.prueba, n1.estadistico.toFixed(3), fp(n1.pValor), n1.normal ? 'Normal' : 'No normal'],
             [et2, n2.prueba, n2.estadistico.toFixed(3), fp(n2.pValor), n2.normal ? 'Normal' : 'No normal']],
            'Criterio: p > .05 indica que la distribución no se desvía significativamente de la normal.');
        h += this._p(I.generarInterpretacionNormalidad(et1, et2, resultado));

        // ---- Correlación principal ----
        const esSp = I._esSpearman(resultado.tipoCorrelacion);
        const ic = resultado.intervaloConfianza;
        h += this._seccion(`Análisis correlacional entre ${et1} y ${et2}`);
        h += this._tablaAPA(`Correlación entre ${et1} y ${et2}`,
            ['n', 'Método', 'Coeficiente', 'p', 'IC 95%', 'Magnitud'],
            [[resultado.n, esSp ? 'Spearman (ρ)' : 'Pearson (r)', resultado.coeficiente.toFixed(3), fp(resultado.pValor),
              ic ? `[${ic.inferior.toFixed(3)}, ${ic.superior.toFixed(3)}]` : '—',
              `${resultado.interpretacion.fuerza} (${resultado.interpretacion.direccion})`]],
            null);
        h += this._p(I.generarInterpretacionCorrelacion(et1, et2, resultado));

        // ---- Objetivos específicos (criba + Holm) ----
        if (criba && criba.seleccionados && criba.seleccionados.length) {
            const res = criba.seleccionados.map(s => {
                try { return { s, r: A.calcularCorrelacion(s.columnaX, s.columnaY, tipoPrueba) }; }
                catch (e) { return { s, r: null }; }
            });
            const holm = A.ajustarPValoresHolm(res.map(x => x.r ? x.r.pValor : NaN));
            h += this._seccion('Correlaciones por dimensiones (objetivos específicos)');
            h += this._tablaAPA('Correlaciones correspondientes a los objetivos específicos',
                ['Par', 'Método', 'Coeficiente', 'p', 'p (Holm)', 'Decisión'],
                res.map((x, i) => x.r
                    ? [`${x.s.etiquetaX} – ${x.s.etiquetaY}`, I._esSpearman(x.r.tipoCorrelacion) ? 'ρ' : 'r',
                       x.r.coeficiente.toFixed(3), fp(x.r.pValor), fp(holm[i]),
                       holm[i] < 0.05 ? 'Significativa' : 'No significativa']
                    : [`${x.s.etiquetaX} – ${x.s.etiquetaY}`, '—', '—', '—', '—', 'No calculable']),
                'Los p-valores se ajustaron mediante la corrección de Holm para comparaciones múltiples; la decisión se basa en el p ajustado.');
            h += this._p(I.generarResumenCriba(criba));
        }

        return h;
    },

    descargar(ctx) {
        if (!ctx || !ctx.resultado) {
            mostrarToast('Primero ejecuta un análisis para poder exportar el capítulo', 'error');
            return;
        }
        const cuerpo = this.generarCapitulo(ctx);
        const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
            <head><meta charset="utf-8"><title>Capítulo de Resultados</title>
            <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
            <style>body{font-family:"Times New Roman",serif;font-size:12pt;} table{mso-table-layout-alt:fixed;}</style>
            </head><body>${cuerpo}</body></html>`;
        const blob = new Blob(['\ufeff' + doc], { type: 'application/msword' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'capitulo_resultados_APA.doc';
        a.click();
        URL.revokeObjectURL(a.href);
        mostrarToast('Capítulo exportado en formato Word (APA 7)', 'success');
    }
};

if (typeof window !== 'undefined') {
    window.ExportadorWord = ExportadorWord;
}
