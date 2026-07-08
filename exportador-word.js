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

    _LOGO_SVG: `<svg width="150" height="150" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
            <polygon points="100,30 185,75 100,120 15,75" fill="#0f172a"/>
            <polygon points="100,42 168,75 100,108 32,75" fill="#1e293b"/>
            <path d="M55 95 L55 130 Q100 155 145 130 L145 95 L100 120 Z" fill="#334155"/>
            <circle cx="100" cy="75" r="6" fill="#f8fafc"/>
            <path d="M100 75 Q150 85 158 135" stroke="#d4af37" stroke-width="5" fill="none"/>
            <circle cx="158" cy="135" r="7" fill="#d4af37"/>
            <rect x="150" y="140" width="16" height="26" rx="3" fill="#f1c40f"/>
            <text x="100" y="190" text-anchor="middle" font-family="Times New Roman" font-size="20" font-weight="bold" fill="#0f172a">StatSim Pro</text>
        </svg>`,

    _n: 0, // contador de tablas
    _f: 0, // contador de figuras

    // Captura el SVG YA RENDERIZADO en la página con sus dimensiones (cero
    // re-cálculo: XMLSerializer no muta el DOM). null si no existe.
    _capturarSVG(idContenedor) {
        if (typeof document === 'undefined' || typeof XMLSerializer === 'undefined') return null;
        const cont = document.getElementById(idContenedor);
        const svg = cont ? cont.querySelector('svg') : null;
        if (!svg) return null;
        const w = +svg.getAttribute('width') || 520;
        const h = +svg.getAttribute('height') || 380;
        return { svg: new XMLSerializer().serializeToString(svg), w, h };
    },

    // Rasteriza un SVG a PNG base64 vía canvas a 2x (nitidez de impresión).
    // Word no renderiza SVG inline en HTML, pero sí <img> con data URI PNG.
    // Devuelve Promise<{url,w,h}|null>; ante cualquier fallo resuelve null
    // (la figura se omite sin romper el documento).
    _rasterizar(svgStr, w, h) {
        return new Promise(resolve => {
            try {
                if (typeof Image === 'undefined' || typeof document === 'undefined') return resolve(null);
                const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const img = new Image();
                img.onload = () => {
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = w * 2; canvas.height = h * 2;
                        const c = canvas.getContext('2d');
                        c.fillStyle = '#ffffff';
                        c.fillRect(0, 0, canvas.width, canvas.height);
                        c.scale(2, 2);
                        c.drawImage(img, 0, 0, w, h);
                        URL.revokeObjectURL(url);
                        resolve({ url: canvas.toDataURL('image/png'), w, h });
                    } catch (e) { URL.revokeObjectURL(url); resolve(null); }
                };
                img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
                img.src = url;
            } catch (e) { resolve(null); }
        });
    },

    // Figura APA 7: "Figura N" en negrita, título en cursiva, gráfico vectorial
    // centrado y Nota opcional. Numeración independiente de las tablas.
    _figura(idContenedor, titulo, nota) {
        const png = this._png && this._png[idContenedor];
        if (!png) return '';
        this._f += 1;
        return `<p style="margin:14pt 0 0;line-height:200%;"><b>Figura ${this._f}</b></p>
            <p style="margin:0 0 6pt;line-height:200%;"><i>${titulo}</i></p>
            <p style="margin:0;text-align:center;"><img src="${png.url}" width="${png.w}" height="${png.h}" style="max-width:100%;"></p>
            ${nota ? `<p style="margin:4pt 0 0;font-size:11pt;line-height:150%;"><i>Nota.</i> ${nota}</p>` : ''}`;
    },

    _tablaAPA(titulo, headers, filas, nota) {
        this._n += 1;
        const th = headers.map(h =>
            `<td style="border-top:1pt solid black;border-bottom:1pt solid black;padding:3pt 4pt;font-weight:bold;">${h}</td>`).join('');
        const tr = filas.map((f, i) => '<tr>' + f.map(c =>
            `<td style="padding:2pt 4pt;${i === filas.length - 1 ? 'border-bottom:1pt solid black;' : ''}">${c}</td>`).join('') + '</tr>').join('');
        return `
            <p style="margin:14pt 0 0;line-height:200%;"><b>Tabla ${this._n}</b></p>
            <p style="margin:0 0 6pt;line-height:200%;"><i>${titulo}</i></p>
            <table width="100%" cellspacing="0" style="border-collapse:collapse;font-size:11pt;line-height:115%;">
                <tr>${th}</tr>${tr}
            </table>
            ${nota ? `<p style="margin:4pt 0 0;font-size:11pt;line-height:150%;"><i>Nota.</i> ${nota}</p>` : ''}`;
    },

    _p(texto) {
        return `<p style="margin:0 0 0;line-height:200%;text-align:justify;text-indent:0.5in;">${texto}</p>`;
    },

    _secciones: [],

    // Encabezado APA nivel 1 (centrado, negrita) con ancla para el índice.
    _h1(titulo) {
        const id = 'sec' + (this._secciones.length + 1);
        this._secciones.push({ id, t: titulo, nivel: 1 });
        return `<p style="margin:18pt 0 8pt;line-height:200%;text-align:center;"><a name="${id}"></a><b>${titulo}</b></p>`;
    },

    // Encabezado APA nivel 2 (izquierda, negrita) con ancla para el índice.
    _seccion(titulo) {
        const id = 'sec' + (this._secciones.length + 1);
        this._secciones.push({ id, t: titulo, nivel: 2 });
        return `<p style="margin:14pt 0 6pt;line-height:200%;"><a name="${id}"></a><b>${titulo}</b></p>`;
    },

    // Índice con hipervínculos internos (clic → salta a la sección).
    _indice() {
        const filas = this._secciones.map(s =>
            `<p style="margin:0;line-height:200%;${s.nivel === 2 ? 'margin-left:0.5in;' : ''}">
                <a href="#${s.id}" style="color:black;">${s.t}</a></p>`).join('');
        return `<p style="margin:0 0 8pt;line-height:200%;text-align:center;"><b>Índice</b></p>${filas}
                <br style="page-break-after:always;">`;
    },

    // Referencias en APA 7: orden alfabético y sangría francesa.
    _referencias() {
        const refs = [
            'Arias, J. L. (2021). <i>Diseño y metodología de la investigación</i>. Enfoques Consulting EIRL. https://repositorio.concytec.gob.pe/handle/20.500.12390/2260',
            'Cohen, J. (1988). <i>Statistical power analysis for the behavioral sciences</i> (2.ª ed.). Lawrence Erlbaum Associates.',
            'Cvetković-Vega, A., Maguiña, J. L., Soto, A., Lama-Valdivia, J., & Correa, L. E. (2021). Estudios transversales. <i>Revista de la Facultad de Medicina Humana, 21</i>(1), 164-170. https://doi.org/10.25176/RFMH.v21i1.3069',
            'Hernández-Sampieri, R., & Mendoza, C. (2023). <i>Metodología de la investigación: Las rutas cuantitativa, cualitativa y mixta</i>. McGraw-Hill.'
        ];
        return refs.map(r =>
            `<p style="margin:0 0 0;line-height:200%;text-indent:-0.5in;margin-left:0.5in;">${r}</p>`).join('');
    },

    // Portada de tesis (una sola hoja): logo, título, autor, lugar y año.
    _portada(ctx) {
        const anio = new Date().getFullYear();
        const logo = (this._png && this._png.__logo)
            ? `<img src="${this._png.__logo.url}" width="150" height="150">`
            : '';
        return `<div style="text-align:center;">
            <p style="margin:60pt 0 30pt;">${logo}</p>
            <p style="margin:0 0 60pt;line-height:200%;font-size:16pt;"><b>${ctx.tituloTesis || 'Título de la investigación'}</b></p>
            <p style="margin:0;line-height:200%;font-size:13pt;"><b>Autor:</b> Joel Pasapera</p>
            <p style="margin:120pt 0 0;line-height:200%;font-size:12pt;">Lima, Perú</p>
            <p style="margin:0;line-height:200%;font-size:12pt;">${anio}</p>
        </div><br style="page-break-after:always;">`;
    },

    // Resumen estructurado (una hoja): Introducción, Objetivo, Métodos,
    // Resultados y Conclusiones, en formato APA compacto.
    _resumen(ctx) {
        const I = InterpretacionesEstadisticas, A = AnalizadorEstadistico;
        const { et1, et2, resultado, criba, marco, tipoPrueba } = ctx;
        const E = (typeof EtiquetasVariables !== 'undefined') ? EtiquetasVariables : null;
        const i1 = E && E.pruebaConGeneral(ctx.var1) ? E.pruebaConGeneral(ctx.var1).prueba : null;
        const i2 = E && E.pruebaConGeneral(ctx.var2) ? E.pruebaConGeneral(ctx.var2).prueba : null;
        const n = resultado.n;
        const esSp = I._esSpearman(resultado.tipoCorrelacion);
        const sim = esSp ? 'ρ' : 'r';
        const fp = p => p < 0.001 ? 'p < .001' : 'p = ' + p.toFixed(3).replace(/^0\./, '.');
        const gl = Number.isFinite(resultado.gl) ? resultado.gl : n - 2;
        const ic = resultado.intervaloConfianza;
        const sig = resultado.pValor < 0.05;

        const intro = `El estudio de la relación entre ${et1} ${I._conj(et2)} ${et2} resulta relevante para la psicología, pues aporta evidencia empírica sobre la asociación entre constructos centrales del funcionamiento psicológico y orienta futuras intervenciones e investigaciones en la población de interés.`;
        const objetivo = marco ? marco.objetivoGeneral : `Determinar la relación entre ${et1} y ${et2}.`;
        const instr = (i1 && i2) ? ` Las variables se midieron mediante ${i1} (${et1}) y ${i2} (${et2}).` : ` Las variables se midieron mediante [INSTRUMENTO DE LA V1 (AUTOR, AÑO); confiabilidad α = __] y [INSTRUMENTO DE LA V2 (AUTOR, AÑO); α = __].`;
        const metodos = `Investigación de tipo básica, enfoque cuantitativo, diseño no experimental, alcance correlacional y corte transversal, con una muestra de ${n} participantes.${instr} El análisis comprendió pruebas de normalidad, el coeficiente de ${esSp ? 'Spearman' : 'Pearson'} y la corrección de Holm para los objetivos específicos.`;

        let resul = `${resultado.normalidad1.normal && resultado.normalidad2.normal ? 'Ambas variables cumplieron el supuesto de normalidad' : 'Al menos una variable se desvió de la normalidad'}, por lo que se aplicó ${esSp ? 'Spearman' : 'Pearson'}. Se obtuvo ${sim}(${gl}) = ${resultado.coeficiente.toFixed(3)}, ${fp(resultado.pValor)}${ic ? `, IC 95% [${ic.inferior.toFixed(2)}, ${ic.superior.toFixed(2)}]` : ''}, correlación ${resultado.interpretacion.fuerza} ${resultado.interpretacion.direccion}.`;
        if (criba && criba.seleccionados && criba.seleccionados.length) {
            const res = criba.seleccionados.map(s => { try { return A.calcularCorrelacion(s.columnaX, s.columnaY, tipoPrueba); } catch (e) { return null; } });
            const holm = A.ajustarPValoresHolm(res.map(r => r ? r.pValor : NaN));
            const m = holm.filter(p => p < 0.05).length;
            resul += ` De los ${criba.seleccionados.length} objetivos específicos evaluados, ${m} ${m === 1 ? 'resultó significativo' : 'resultaron significativos'} tras la corrección de Holm.`;
        }
        const concl = sig
            ? `Existe una relación estadísticamente significativa, de dirección ${resultado.interpretacion.direccion} y magnitud ${resultado.interpretacion.fuerza}, entre ${et1} ${I._conj(et2)} ${et2}; se rechaza la hipótesis nula.`
            : `No se halló evidencia de una relación estadísticamente significativa entre ${et1} ${I._conj(et2)} ${et2}; no se rechaza la hipótesis nula.`;

        const b = (t, x) => `<p style="margin:0 0 6pt;line-height:150%;text-align:justify;"><b>${t}.</b> ${x}</p>`;
        return `<p style="margin:0 0 10pt;line-height:200%;text-align:center;"><a name="resumen"></a><b>Resumen</b></p>`
            + b('Introducción', intro) + b('Objetivo', objetivo) + b('Métodos', metodos)
            + b('Resultados', resul) + b('Conclusiones', concl)
            + `<br style="page-break-after:always;">`;
    },

    // Matriz de consistencia como tabla APA (una fila, cinco columnas-lista,
    // alineación superior, 10pt para caber en página vertical).
    _matrizConsistenciaWord(m) {
        this._n += 1;
        const celda = items => items.map(it => typeof it === 'string'
            ? `<p style="margin:0 0 4pt;line-height:120%;">• ${it}</p>`
            : `<p style="margin:0 0 4pt;line-height:120%;"><b>${it.rotulo}:</b> ${it.texto}</p>`).join('');
        const tdS = 'style="padding:3pt 4pt;vertical-align:top;border-bottom:1pt solid black;"';
        const thS = 'style="border-top:1pt solid black;border-bottom:1pt solid black;padding:3pt 4pt;font-weight:bold;"';
        return `
            <p style="margin:14pt 0 0;line-height:200%;"><b>Tabla ${this._n}</b></p>
            <p style="margin:0 0 6pt;line-height:200%;"><i>Matriz de consistencia del estudio</i></p>
            <table width="100%" cellspacing="0" style="border-collapse:collapse;font-size:10pt;line-height:120%;">
                <tr><td ${thS} width="17%">Problema</td><td ${thS} width="23%">Objetivos</td>
                    <td ${thS} width="25%">Hipótesis</td><td ${thS} width="15%">Variables</td>
                    <td ${thS} width="20%">Metodología</td></tr>
                <tr><td ${tdS}>${celda(m.problema)}</td><td ${tdS}>${celda(m.objetivos)}</td>
                    <td ${tdS}>${celda(m.hipotesis)}</td><td ${tdS}>${celda(m.variables)}</td>
                    <td ${tdS}>${celda(m.metodologia)}</td></tr>
            </table>
            <p style="margin:4pt 0 0;font-size:10pt;line-height:140%;"><i>Nota.</i> Elaboración propia a partir del diseño metodológico del estudio.</p>`;
    },

    generarCapitulo(ctx) {
        this._n = 0;
        this._f = 0;
        this._secciones = [];
        const I = InterpretacionesEstadisticas;
        const A = AnalizadorEstadistico;
        const datos = A.obtenerDatos() || [];
        const { var1, var2, et1, et2, resultado, criba, tipoPrueba, marco } = ctx;
        let h = '';

        // ---- Marco metodológico completo ----
        if (marco) {
            h += this._h1('Marco Metodológico');
            h += this._seccion('Pregunta de investigación');
            h += this._p(marco.preguntaInvestigacion);
            h += this._seccion('Objetivo general');
            h += this._p(marco.objetivoGeneral);
            h += this._seccion('Objetivos específicos');
            (marco.objetivosEspecificos || []).forEach((o, i) => {
                h += `<p style="margin:0;line-height:200%;text-align:justify;margin-left:0.5in;text-indent:-0.25in;">${i + 1}. ${o}</p>`;
            });
            h += this._seccion('Hipótesis de investigación (H₁)');
            h += this._p(marco.hipotesis.hipotesisInvestigador);
            h += this._seccion('Hipótesis nula (H₀)');
            h += this._p(marco.hipotesis.hipotesisNula);
            if (marco.tipoYDiseno) {
                h += this._seccion('Tipo y diseño de estudio');
                marco.tipoYDiseno.split('\n\n').forEach(p => { h += this._p(p); });
            }
            // Matriz de consistencia: consume el MISMO constructor que la web
            if (typeof MatrizConsistencia !== 'undefined') {
                const mx = MatrizConsistencia.construir(ctx);
                if (mx) {
                    h += this._seccion('Matriz de consistencia');
                    h += this._matrizConsistenciaWord(mx);
                }
            }
        }

        // ---- Resultados ----
        h += this._h1('Resultados');
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
                 ['Desviación estándar (DE)', fmt(d1.desviacion ?? d1.desviacionEstandar), fmt(d2.desviacion ?? d2.desviacionEstandar)],
                 ['Mínimo', fmt(d1.minimo ?? d1.min), fmt(d2.minimo ?? d2.min)],
                 ['Máximo', fmt(d1.maximo ?? d1.max), fmt(d2.maximo ?? d2.max)],
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
        h += this._figura('histVariable1', `Distribución de ${et1} con curva normal teórica superpuesta`, null);
        h += this._figura('qqVariable1', `Gráfico Q-Q de ${et1}`, null);
        h += this._figura('histVariable2', `Distribución de ${et2} con curva normal teórica superpuesta`, null);
        h += this._figura('qqVariable2', `Gráfico Q-Q de ${et2}`, null);

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
        h += this._figura('graficoDispersion', `Diagrama de dispersión entre ${et1} y ${et2}`,
            'Incluye la recta de regresión por mínimos cuadrados y la banda de confianza al 95%.');

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


        // ---- Hallazgos según variables sociodemográficas ----
        if (typeof CribaSociodemografica !== 'undefined') {
            const hs = CribaSociodemografica.analizar(var1, var2, et1, et2);
            if (hs && hs.filas.length) {
                const fpH = p => Number.isFinite(p) ? fp(p) : '—';
                h += this._seccion('Hallazgos según variables sociodemográficas');
                h += this._tablaAPA('Pruebas de asociación y comparación según variables sociodemográficas',
                    ['Sociodemográfico', 'Variable', 'Prueba', 'Estadístico', 'p', 'p (Holm)', 'Tamaño del efecto', 'Decisión'],
                    hs.filas.map(f => [f.socio, f.variable, f.prueba, f.valor, fpH(f.p), fpH(f.pHolm), f.efecto,
                        f.tipo === 'pendiente' ? f.detalle : (f.sig ? `Significativa${f.detalle ? ' (' + f.detalle + ')' : ''}` : 'No significativa')]),
                    'Correlaciones para sociodemográficos numéricos; t de Student o U de Mann-Whitney para categóricos de dos grupos. La decisión se basa en el p ajustado mediante la corrección de Holm.');
                h += this._p(CribaSociodemografica.sintetizar(hs));
            }
        }

        // ---- Referencias APA ----
        h += this._h1('Referencias');
        h += this._referencias();

        // El índice se arma al final (ya registradas todas las secciones) y se
        // coloca al inicio, tras la portada.
        // Resumen en el índice (entrada manual, ancla 'resumen')
        this._secciones.unshift({ id: 'resumen', t: 'Resumen', nivel: 1 });
        return this._portada(ctx) + this._resumen(ctx) + this._indice() + h;
    },

    async descargar(ctx) {
        if (!ctx || !ctx.resultado) {
            mostrarToast('Primero ejecuta un análisis para poder exportar el capítulo', 'error');
            return;
        }
        // Pre-rasterización: SVG (DOM vivo) → PNG base64, en paralelo.
        const ids = ['histVariable1', 'qqVariable1', 'histVariable2', 'qqVariable2', 'graficoDispersion'];
        const tareas = ids.map(id => {
            const cap = this._capturarSVG(id);
            return cap ? this._rasterizar(cap.svg, cap.w, cap.h).then(p => [id, p]) : Promise.resolve([id, null]);
        });
        tareas.push(this._rasterizar(this._LOGO_SVG, 200, 200).then(p => ['__logo', p && { url: p.url, w: 150, h: 150 }]));
        this._png = Object.fromEntries((await Promise.all(tareas)).filter(([, p]) => p));

        const cuerpo = this.generarCapitulo(ctx);
        const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
            <head><meta charset="utf-8"><title>Capítulo de Resultados</title>
            <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
            <style>body{font-family:"Times New Roman",serif;font-size:12pt;} </style>
            </head><body>${cuerpo}</body></html>`;
        // .docx REAL si la librería html-docx-js está disponible (CDN); si no,
        // cae al formato .doc clásico (HTML-Word) para no dejar sin exportar.
        // Nota: el .docx generado abre en Microsoft Word (no en LibreOffice/GDocs,
        // que no soportan la técnica altChunk usada para la conversión).
        let blob, nombre;
        if (typeof htmlDocx !== 'undefined' && htmlDocx.asBlob) {
            blob = htmlDocx.asBlob('<!DOCTYPE html>' + doc);
            nombre = 'capitulo_resultados_APA.docx';
        } else {
            blob = new Blob(['\ufeff' + doc], { type: 'application/msword' });
            nombre = 'capitulo_resultados_APA.doc';
        }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = nombre;
        a.click();
        URL.revokeObjectURL(a.href);
        mostrarToast('Capítulo exportado en formato Word (APA 7)', 'success');
    }
};

if (typeof window !== 'undefined') {
    window.ExportadorWord = ExportadorWord;
}
