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

    // Φ(z): función de distribución normal estándar (aprox. Abramowitz-Stegun).
    _phi(z) {
        const t = 1 / (1 + 0.2316419 * Math.abs(z));
        const d = 0.3989423 * Math.exp(-z * z / 2);
        let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
        return z > 0 ? 1 - p : p;
    },
    // p bilateral aproximado para un r con n casos (transformación z de Fisher).
    _pFisher(r, n) {
        if (!Number.isFinite(r) || n < 4 || Math.abs(r) >= 1) return NaN;
        const z = Math.abs(Math.atanh(r)) * Math.sqrt(n - 3);
        return 2 * (1 - this._phi(z));
    },
    // Potencia post-hoc (1−β) para detectar el r observado con n casos y α dado
    // (aprox. de Fisher; orientativa, como recomienda reportarla).
    _potencia(r, n, alfa = 0.05, bilateral = true) {
        if (!Number.isFinite(r) || n < 4) return NaN;
        const zc = bilateral ? 1.959964 : 1.644854;
        const lambda = Math.abs(Math.atanh(r)) * Math.sqrt(n - 3);
        return this._phi(lambda - zc) + this._phi(-lambda - zc);
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
            // Resumen pedagógico por variable (categoría modal y composición).
            const resumenSocio = [];
            cats.forEach(col => {
                const conteo = new Map();
                datos.forEach(d => { const v = String(d[col] ?? '').trim(); if (v) conteo.set(v, (conteo.get(v) || 0) + 1); });
                const orden = [...conteo.entries()].sort((a, b) => b[1] - a[1]);
                if (!orden.length) return;
                const [c1, f1] = orden[0];
                const pct = x => (x * 100 / datos.length).toFixed(1);
                let s = `en cuanto a ${col.toLowerCase()}, predominó la categoría «${c1}» con ${f1} casos (${pct(f1)} %)`;
                if (orden[1]) s += `, seguida de «${orden[1][0]}» (${orden[1][1]}; ${pct(orden[1][1])} %)`;
                resumenSocio.push(s);
            });
            h += this._tablaAPA(`Distribución de frecuencias de las variables sociodemográficas (N = ${datos.length})`,
                ['Variable', 'Categoría', 'f', '%'], filas,
                'Los porcentajes se calculan sobre los casos con dato válido en cada variable.');
            if (resumenSocio.length) {
                h += this._p(`La tabla anterior describe el perfil de los ${datos.length} participantes del estudio. En una tesis, esta caracterización permite al lector juzgar a quiénes representan los resultados. En síntesis: ${resumenSocio.join('; ')}. Las frecuencias (f) indican el número de casos por categoría y los porcentajes su proporción sobre el total, de modo que categorías con porcentajes altos dominan la composición de la muestra y conviene tenerlas presentes al generalizar los hallazgos.`);
            }
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
                h += this._p(`La tabla precedente clasifica a los ${r.n} participantes en tres niveles (bajo, medio y alto) de ${et} según terciles empíricos, es decir, cortes que dividen a la propia muestra en tres grupos de tamaño similar. La lectura es directa: la columna f indica cuántos participantes caen en cada nivel y el porcentaje su peso relativo; el nivel con mayor frecuencia describe la tendencia predominante de la muestra en esta variable.`);
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
            const de1 = d1.desviacion ?? d1.desviacionEstandar, de2 = d2.desviacion ?? d2.desviacionEstandar;
            h += this._p(`La tabla de estadísticos descriptivos resume el comportamiento de ambas variables en los ${resultado.n} participantes. ${et1} presentó una media de ${fmt(d1.media)} con una desviación estándar de ${fmt(de1)}, lo que indica que los puntajes típicos se ubicaron alrededor de ese promedio con una dispersión de ±${fmt(de1)} puntos, dentro de un rango observado de ${fmt(d1.minimo ?? d1.min)} a ${fmt(d1.maximo ?? d1.max)}. Por su parte, ${et2} obtuvo una media de ${fmt(d2.media)} (DE = ${fmt(de2)}), con puntajes entre ${fmt(d2.minimo ?? d2.min)} y ${fmt(d2.maximo ?? d2.max)}. La asimetría informa hacia dónde se estira la cola de la distribución (valores positivos: cola derecha; negativos: cola izquierda; cercanos a cero: simetría) y la curtosis compara su apuntamiento con el de la curva normal (positiva: más concentrada en el centro y con colas más pesadas; negativa: más plana). Con asimetrías de ${fmt(d1.asimetria)} y ${fmt(d2.asimetria)} y curtosis de ${fmt(d1.curtosis)} y ${fmt(d2.curtosis)}, ambas variables ${Math.abs(d1.asimetria) < 1 && Math.abs(d2.asimetria) < 1 ? 'se mantienen dentro de márgenes razonables de simetría' : 'muestran desviaciones de la simetría que conviene considerar'}, aspecto que se examina formalmente en la prueba de normalidad siguiente.`);
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
        const expHist = (et, d, nn) => this._p(`La figura anterior muestra el histograma de ${et}: cada barra representa cuántos participantes obtuvieron puntajes dentro de ese intervalo, y la curva superpuesta corresponde a la distribución normal teórica con la media y desviación estándar de la muestra. Cuanto más se ajustan las barras a la curva, más plausible es la normalidad. En este caso, la asimetría de ${Number.isFinite(d?.asimetria) ? d.asimetria.toFixed(2) : '—'} ${Number.isFinite(d?.asimetria) ? (Math.abs(d.asimetria) < 0.5 ? 'sugiere una distribución esencialmente simétrica' : d.asimetria > 0 ? 'indica una cola derecha (concentración de puntajes bajos con algunos valores altos)' : 'indica una cola izquierda (concentración de puntajes altos con algunos valores bajos)') : ''} y la curtosis de ${Number.isFinite(d?.curtosis) ? d.curtosis.toFixed(2) : '—'} describe cuán apuntada o achatada es la distribución respecto de la normal, lo que concuerda con la decisión de la prueba de ${nn.prueba} (${nn.normal ? 'normalidad no rechazada' : 'normalidad rechazada'}).`);
        const expQQ = (et, nn) => this._p(`El gráfico Q-Q de ${et} compara los cuantiles observados de la muestra con los que se esperarían bajo una distribución normal perfecta: si los puntos se alinean sobre la diagonal, los datos se comportan como normales; desviaciones sistemáticas en los extremos revelan colas más pesadas o livianas de lo esperado. La inspección visual ${nn.normal ? 'respalda' : 'coincide con'} el resultado de la prueba de ${nn.prueba} (p ${fp(nn.pValor)}), que ${nn.normal ? 'no rechazó' : 'rechazó'} la hipótesis de normalidad, y esta decisión es la que determina el coeficiente de correlación apropiado.`);
        h += this._figura('histVariable1', `Distribución de ${et1} con curva normal teórica superpuesta`, null);
        h += expHist(et1, d1, n1);
        h += this._figura('qqVariable1', `Gráfico Q-Q de ${et1}`, null);
        h += expQQ(et1, n1);
        h += this._figura('histVariable2', `Distribución de ${et2} con curva normal teórica superpuesta`, null);
        h += expHist(et2, d2, n2);
        h += this._figura('qqVariable2', `Gráfico Q-Q de ${et2}`, null);
        h += expQQ(et2, n2);
        h += this._p(`Una aclaración metodológica importante: la impresión visual del histograma puede no coincidir con la decisión de la prueba, y ello no constituye un error. Con muestras grandes (aquí n = ${resultado.n}), las pruebas de normalidad ganan mucha potencia y detectan desviaciones sutiles —especialmente en la curtosis y en las colas— que el ojo no aprecia. De hecho, una distribución apuntada (curtosis positiva) eleva las barras centrales muy cerca del pico de la curva y produce la falsa impresión de un ajuste excelente, mientras que la prueba la rechaza precisamente por ese exceso de concentración central; a la inversa, la irregularidad natural de las barras (ruido muestral) puede parecer «desalineación» sin que la forma global se aparte de la normal. Por ello, la decisión reportada se basa en el contraste formal (${n1.prueba}) y no en la apariencia del gráfico, y el gráfico Q-Q —más sensible a las colas— es la mejor herramienta visual para corroborarla.`);

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
        {
            const rr = resultado.coeficiente, aR = Math.abs(rr);
            const fuerzaTxt = aR < .10 ? 'prácticamente nula' : aR < .30 ? 'débil' : aR < .50 ? 'moderada' : aR < .70 ? 'considerable' : 'fuerte';
            h += this._p(`El diagrama de dispersión anterior es la representación visual más informativa de la relación estudiada y conviene leerlo con detenimiento. Cada punto corresponde a un participante: su posición horizontal indica su puntaje en ${et1} y la vertical su puntaje en ${et2}, de modo que la nube completa retrata simultáneamente a los ${resultado.n} casos. La recta trazada es la de mínimos cuadrados, la línea que mejor resume la tendencia conjunta, y la banda sombreada delimita el intervalo de confianza al 95 % de esa recta: cuanto más angosta, mayor precisión en la estimación de la tendencia.`);
            h += this._p(`En estos datos la nube ${rr >= 0 ? 'asciende de izquierda a derecha, patrón propio de una relación positiva: quienes puntúan alto en ' + et1 + ' tienden también a puntuar alto en ' + et2 : 'desciende de izquierda a derecha, patrón propio de una relación negativa: a mayores puntajes en ' + et1 + ' corresponden, en tendencia, menores puntajes en ' + et2}. La dispersión de los puntos alrededor de la recta expresa la fuerza del vínculo: con un coeficiente de ${rr.toFixed(3)}, la asociación observada es de magnitud ${fuerzaTxt}, ${aR < .30 ? 'por lo que los puntos se apartan bastante de la recta y el conocimiento de una variable permite anticipar solo débilmente la otra' : aR < .50 ? 'con puntos moderadamente próximos a la recta: existe un patrón claro aunque con variabilidad individual apreciable' : 'con puntos notablemente alineados a la recta, señal de un patrón consistente entre ambas variables'}. Conviene además inspeccionar visualmente la linealidad (que la relación no dibuje curvas) y la presencia de casos atípicos alejados de la nube, pues ambos aspectos condicionan la interpretación del coeficiente.`);
        }

        // ---- Contraste de hipótesis y decisión estadística ----
        {
            const alfa = 0.05, bilat = (tipoPrueba || 'bilateral') === 'bilateral';
            const rr = resultado.coeficiente, pv = resultado.pValor;
            const sig = pv < alfa;
            const pot = this._potencia(rr, resultado.n, alfa, bilat);
            const coefTxt = esSp ? 'ρ de Spearman' : 'r de Pearson';
            h += this._seccion('Contraste de hipótesis y decisión estadística');
            if (marco && marco.hipotesis) {
                h += this._p(`El contraste enfrenta la hipótesis nula (H₀: ${marco.hipotesis.hipotesisNula}) con la hipótesis de investigación (H₁: ${marco.hipotesis.hipotesisInvestigador}).`);
            } else {
                h += this._p(`El contraste enfrenta la hipótesis nula H₀ (no existe relación entre ${et1} y ${et2}; el coeficiente poblacional es cero) con la hipótesis alterna H₁ (existe relación entre ambas variables).`);
            }
            h += this._tablaAPA('Resumen del contraste de hipótesis para la relación principal',
                ['Elemento', 'Valor'],
                [['Nivel de significancia (α)', alfa.toFixed(2) + (bilat ? ' (bilateral)' : ' (unilateral)')],
                 ['Estadístico de prueba', `${coefTxt} = ${rr.toFixed(3)}`],
                 ['p-valor', fp(pv)],
                 ['Intervalo de confianza 95%', ic ? `[${ic.inferior.toFixed(3)}, ${ic.superior.toFixed(3)}]` : '—'],
                 ['Potencia post-hoc (1−β)', Number.isFinite(pot) ? (pot >= 0.999 ? '> .999' : pot.toFixed(3).replace(/^0\./, '.')) : '—'],
                 ['Decisión sobre H₀', sig ? 'Se rechaza H₀' : 'No se rechaza H₀']],
                'La potencia post-hoc se estimó mediante la aproximación de Fisher para el coeficiente observado y se reporta con carácter orientativo.');
            h += this._p(`Con un nivel de significancia α = .05 y un contraste ${bilat ? 'bilateral' : 'unilateral'}, el p-valor obtenido (${fp(pv)}) ${sig ? 'es menor que α, por lo que SE RECHAZA la hipótesis nula: existe evidencia estadísticamente significativa de relación entre ' + et1 + ' y ' + et2 : 'no es menor que α, por lo que NO SE RECHAZA la hipótesis nula: los datos no aportan evidencia estadísticamente significativa de relación entre ' + et1 + ' y ' + et2}. En términos prácticos, el p-valor expresa la probabilidad de observar un coeficiente al menos tan extremo como ${rr.toFixed(3)} si en la población la relación fuese nula. ${Number.isFinite(pot) ? 'La potencia estimada de ' + (pot >= 0.999 ? '> .999' : pot.toFixed(3).replace(/^0\./, '.')) + (pot >= 0.8 ? ' supera el umbral convencional de .80, lo que indica una capacidad adecuada del estudio para detectar un efecto de esta magnitud con el tamaño muestral disponible.' : ' se sitúa por debajo del umbral convencional de .80, de modo que un resultado no significativo debe interpretarse con cautela: la muestra podría ser insuficiente para detectar efectos de esta magnitud.') : ''} Debe recordarse que significancia estadística no equivale a relevancia práctica: la magnitud del efecto y su intervalo de confianza completan la valoración.`);
        }

        // ---- Regresión bivariada (solo si el investigador la ejecutó) ----
        if (typeof RegresionMultiple !== 'undefined' && RegresionMultiple._ultimaBivariada) {
            const BV = RegresionMultiple._ultimaBivariada, RMf = RegresionMultiple;
            const Rb = BV.R, c1 = Rb.coefs[1];
            h += this._seccion('Análisis de regresión bivariada');
            h += this._p(`Mientras la correlación cuantifica la asociación de forma simétrica, la regresión es direccional: estima el cambio esperado en ${BV.etY} por cada unidad de ${BV.etX} y permite la predicción. Se ajustó el modelo por mínimos cuadrados y, adicionalmente, se compararon formas funcionales alternativas para verificar que la especificación elegida sea la que mejor describe los datos.`);
            h += this._tablaAPA(`Regresión lineal de ${BV.etY} sobre ${BV.etX}`,
                ['B (pendiente)', 'EE', 't', 'p', 'IC 95%', 'R²', 'F', 'gl', 'p modelo'],
                [[RMf._fx(c1.b), RMf._fx(c1.se), RMf._fx(c1.t, 2), RMf._fp(c1.pValor),
                  `[${RMf._fx(c1.ic[0], 2)}, ${RMf._fx(c1.ic[1], 2)}]`, RMf._fx(Rb.R2), RMf._fx(Rb.F, 2),
                  `(${Rb.glR}, ${Rb.glE})`, RMf._fp(Rb.pF)]],
                `Ecuación ajustada: ŷ = ${RMf._fx(Rb.coefs[0].b)} + ${RMf._fx(c1.b)}·x. n = ${Rb.n} casos completos.`);
            h += this._p(RMf._pedagogiaBivariada(Rb, BV.etX).replace(/<[^>]+>/g, ''));
            if (BV.MM && BV.MM.candidatos) {
                h += this._tablaAPA(`Comparación de formas funcionales para la relación entre ${BV.etX} y ${BV.etY}`,
                    ['Modelo', 'Ecuación ajustada', 'R²', 'AIC', 'ΔAIC'],
                    BV.MM.candidatos.map(c => [c === BV.MM.ganador ? c.nombre + ' (seleccionado)' : c.nombre,
                        c.ec, RMf._fx(c.R2, 3), RMf._fx(c.AIC, 1), RMf._fx(c.dAIC, 1)]),
                    'AIC: criterio de información de Akaike (menor = mejor). Ante ΔAIC < 2 se prefiere el modelo más simple (parsimonia).');
                h += this._p(RMf._justificacionAIC(BV.MM).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
            }
            if (RegresionMultiple._ultimoGrafico) {
                this._png = this._png || {};
                this._png['regBivariada'] = RegresionMultiple._ultimoGrafico;
                h += this._figura('regBivariada',
                    `Diagrama de dispersión de ${BV.etY} según ${BV.etX} con el modelo ${BV.MM ? BV.MM.ganador.nombre.toLowerCase() : 'lineal'} ajustado`,
                    'Los puntos representan a los participantes; la curva corresponde al modelo seleccionado por el criterio de Akaike.');
                h += this._p(`La figura anterior permite valorar visualmente el ajuste: la curva del modelo ${BV.MM ? BV.MM.ganador.nombre.toLowerCase() : 'lineal'} atraviesa la nube de puntos siguiendo su tendencia. ${BV.MM && BV.MM.ganador.nombre !== 'Lineal' ? 'La curvatura visible confirma que la relación no es estrictamente lineal, información que la correlación de Pearson por sí sola no revela.' : 'La tendencia esencialmente rectilínea respalda la lectura lineal de la relación.'}`);
            }
        }

        // ---- Matriz del flujo (3+ variables elegidas por el investigador) ----
        if (typeof RegresionMultiple !== 'undefined' && RegresionMultiple._ultimaMatrizFlujo) {
            const MX = RegresionMultiple._ultimaMatrizFlujo, RMf = RegresionMultiple;
            const idx = (i, j) => MX.pares.find(p => (p.i === i && p.j === j) || (p.i === j && p.j === i));
            h += this._seccion('Matriz de correlaciones entre las variables del estudio');
            h += this._tablaAPA(`Matriz de correlaciones (n = ${MX.n})`,
                ['Variable', ...MX.cols.map((_, i) => String(i + 1))],
                MX.cols.map((c, i) => [`${i + 1}. ${(MX.etiquetas && MX.etiquetas[i]) || c}`,
                    ...MX.cols.map((_, j) => j > i ? '' : (j === i ? '1' : `${RMf._fx(idx(i, j).r, 2)}${idx(i, j).sig ? '*' : ''}`))]),
                'Triángulo inferior. Pearson si ambas variables son normales; Spearman en caso contrario. * p < .05 tras la corrección de Holm.');
        }

        // ---- Regresión múltiple avanzada (si el investigador la ejecutó) ----
        if (typeof RegresionMultiple !== 'undefined' && RegresionMultiple._ultimaMultiple) {
            const RG = RegresionMultiple._ultimaMultiple, RMf = RegresionMultiple;
            h += this._seccion('Análisis de regresión múltiple');
            if (RG.notaFamilia) h += this._p(RG.notaFamilia);
            if (RG.familia === 'ols') {
                h += this._tablaAPA(`Resumen del modelo de regresión múltiple para ${RG.etY}`,
                    ['R²', 'R² ajustado', 'F', 'gl', 'p'],
                    [[RMf._fx(RG.R2), RMf._fx(RG.R2aj), RMf._fx(RG.F, 2), `(${RG.glR}, ${RG.glE})`, RMf._fp(RG.pF)]],
                    `Variable dependiente: ${RG.etY}. Predictores: ${RG.etsX.join(', ')}. n = ${RG.n} casos completos.`);
                h += this._tablaAPA(`Coeficientes del modelo para ${RG.etY}`,
                    ['Término', 'B', 'EE', 'β', 't', 'p', 'IC 95%', 'VIF'],
                    RG.coefs.map((c, j) => [c.nombre, RMf._fx(c.b), RMf._fx(c.se), c.beta === null ? '—' : RMf._fx(c.beta),
                        RMf._fx(c.t, 2), RMf._fp(c.pValor), `[${RMf._fx(c.ic[0], 2)}, ${RMf._fx(c.ic[1], 2)}]`,
                        j === 0 ? '—' : RMf._fx(RG.vifs[j - 1], 2)]),
                    RG.normResid ? `Normalidad de los residuos (${RG.normResid.prueba}): p ${RMf._fp(RG.normResid.pValor)}. VIF > 5 sugiere colinealidad problemática.` : null);
                h += this._p(RMf._pedagogiaMultiple(RG).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/&gt;/g, '>'));
                if (RG.jerarquica) {
                    const J = RG.jerarquica;
                    h += this._tablaAPA(`Regresión jerárquica: aporte de ${J.focal} sobre los controles`,
                        ['Bloque', 'R²', 'ΔR²', 'F del cambio', 'gl', 'p del cambio'],
                        [['1 (controles: ' + J.controles.join(', ') + ')', RMf._fx(J.R2b1), '—', '—', '—', '—'],
                         [`2 (+ ${J.focal})`, RMf._fx(J.R2b2), RMf._fx(J.dR2), RMf._fx(J.Fcambio, 2), `(${J.gl[0]}, ${J.gl[1]})`, RMf._fp(J.pCambio)]],
                        'El bloque 1 introduce los controles; el bloque 2 añade el constructo de interés. El ΔR² cuantifica la varianza explicativa que este aporta por encima de lo ya explicado.');
                    h += this._p(J.pCambio < 0.05
                        ? `El análisis jerárquico muestra que ${J.focal} incrementa significativamente la varianza explicada de ${RG.etY} en un ${(100 * J.dR2).toFixed(1)} % por encima de ${J.controles.join(' y ')} (F del cambio = ${RMf._fx(J.Fcambio, 2)}, p ${RMf._fp(J.pCambio)}), lo que respalda su aporte específico e independiente.`
                        : `El análisis jerárquico indica que, controlados ${J.controles.join(' y ')}, ${J.focal} no añade varianza explicativa significativa (ΔR² = ${RMf._fx(J.dR2)}, p ${RMf._fp(J.pCambio)}).`);
                }
                if (RG.idxInter >= 0) {
                    const c = RG.coefs[RG.idxInter + 1];
                    h += this._p(`Análisis de moderación: el término de interacción (${c.nombre}) resultó ${c.pValor < 0.05 ? `significativo (B = ${RMf._fx(c.b)}, p ${RMf._fp(c.pValor)}), indicando que el efecto de ${RG.etsX[0]} sobre ${RG.etY} varía según el nivel de ${RG.etsX[1]}` : `no significativo (p ${RMf._fp(c.pValor)}), sin evidencia de moderación`}. Los predictores se centraron antes de construir la interacción para reducir la colinealidad.`);
                }
                if (RG.idxCuad >= 0) {
                    const c = RG.coefs[RG.idxCuad + 1];
                    h += this._p(`Efecto curvilíneo: el término cuadrático de ${RG.etsX[0]} fue ${c.pValor < 0.05 ? `significativo (B = ${RMf._fx(c.b)}, p ${RMf._fp(c.pValor)}), evidenciando una relación en forma de ${c.b < 0 ? 'U invertida (nivel óptimo intermedio)' : 'U'}` : `no significativo, sin evidencia de curvatura`}.`);
                }
            } else if (RG.familia === 'logistica') {
                h += this._tablaAPA(`Regresión logística múltiple para ${RG.etY}`,
                    ['Término', 'B', 'EE', 'z', 'p', 'OR', 'IC 95% (OR)'],
                    RG.coefs.map(c => [c.nombre, RMf._fx(c.b), RMf._fx(c.se), RMf._fx(c.z, 2), RMf._fp(c.pValor),
                        RMf._fx(c.OR, 3), `[${RMf._fx(c.ic[0], 2)}, ${RMf._fx(c.ic[1], 2)}]`]),
                    `Pseudo-R² de McFadden = ${RMf._fx(RG.mcFadden, 3)}; AIC = ${RMf._fx(RG.AIC, 1)}. n = ${RG.n}.`);
            } else if (RG.familia === 'poisson') {
                h += this._tablaAPA(`Regresión de Poisson múltiple para ${RG.etY}`,
                    ['Término', 'B', 'EE', 'z', 'p', 'IRR', 'IC 95% (IRR)'],
                    RG.coefs.map(c => [c.nombre, RMf._fx(c.b), RMf._fx(c.se), RMf._fx(c.z, 2), RMf._fp(c.pValor),
                        RMf._fx(c.IRR, 3), `[${RMf._fx(c.ic[0], 2)}, ${RMf._fx(c.ic[1], 2)}]`]),
                    `Dispersión (χ²/gl) = ${RMf._fx(RG.dispersion, 2)}. n = ${RG.n}.`);
            }
            (RG.avisos || []).forEach(a => { h += this._p(`Nota metodológica: ${a}`); });
        }

        // ---- Matriz de correlaciones ----
        if (typeof correlacionPearsonSimple === 'function' && typeof esAproxNormalSimple === 'function') {
            const colsMx = [[var1, et1], [var2, et2]];
            if (criba && criba.seleccionados) {
                const vistos = new Set([var1, var2]);
                criba.seleccionados.forEach(s => {
                    [[s.columnaX, s.etiquetaX], [s.columnaY, s.etiquetaY]].forEach(([c, e]) => {
                        if (c && !vistos.has(c) && datos.length && Number.isFinite(+datos[0][c])) { vistos.add(c); colsMx.push([c, e || c]); }
                    });
                });
            }
            if (colsMx.length >= 2) {
                const vals = colsMx.map(([c]) => datos.map(d => +d[c]).filter(Number.isFinite));
                const normales = vals.map(v => esAproxNormalSimple(v));
                const spearmanOK = typeof correlacionSpearmanSimple === 'function';
                const celda = (i, j) => {
                    if (i === j) return '1';
                    const usarP = normales[i] && normales[j];
                    const r = (usarP || !spearmanOK) ? correlacionPearsonSimple(vals[i], vals[j]) : correlacionSpearmanSimple(vals[i], vals[j]);
                    return Number.isFinite(r) ? r.toFixed(2) : '—';
                };
                h += this._seccion('Matriz de correlaciones');
                h += this._tablaAPA('Matriz de correlaciones entre las variables del estudio',
                    ['Variable', ...colsMx.map(([, e], i) => String(i + 1))],
                    colsMx.map(([, e], i) => [`${i + 1}. ${e}`, ...colsMx.map((_, j) => j <= i ? celda(i, j) : '')]),
                    'Se muestra el triángulo inferior. Para cada par se empleó Pearson cuando ambas variables resultaron aproximadamente normales y Spearman en caso contrario, en coherencia con el criterio del análisis principal.');
                h += this._p(`La matriz de correlaciones ofrece una vista panorámica de todas las asociaciones bivariadas del estudio. Cada celda contiene el coeficiente entre la variable de su fila y la de su columna; la diagonal vale 1 porque toda variable correlaciona perfectamente consigo misma, y solo se presenta el triángulo inferior porque la matriz es simétrica (la correlación de A con B es idéntica a la de B con A). Coeficientes cercanos a ±1 revelan asociaciones intensas y valores próximos a 0, ausencia de relación lineal o monótona; el signo indica la dirección. Esta lectura conjunta permite identificar de un vistazo qué pares concentran las relaciones más sustantivas y anticipa los contrastes que se detallan a continuación.`);
            }
        }

        // ---- Objetivos específicos (criba + Holm) ----
        if (criba && criba.seleccionados && criba.seleccionados.length) {
            const res = criba.seleccionados.map(s => {
                let r = null;
                try { r = A.calcularCorrelacion(s.columnaX, s.columnaY, tipoPrueba); } catch (e) { /* respaldo abajo */ }
                // RESPALDO: si el recálculo no es utilizable (p. ej. columnas de
                // dimensión no presentes en los datos del analizador → 0/NaN),
                // se usa el coeficiente YA calculado por la criba, con p aproximado
                // por la transformación z de Fisher sobre el n del análisis.
                const inutilizable = !r || !Number.isFinite(r.coeficiente)
                    || (r.coeficiente === 0 && Number.isFinite(s.coeficiente) && Math.abs(s.coeficiente) > 0.001);
                if (inutilizable && Number.isFinite(s.coeficiente)) {
                    r = { coeficiente: s.coeficiente,
                          pValor: this._pFisher(s.coeficiente, resultado.n),
                          tipoCorrelacion: s.metodo === 'Spearman' ? 'spearman' : 'pearson',
                          _respaldoCriba: true };
                }
                return { s, r };
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
            h += this._p(`Esta tabla desagrega el análisis en los pares que responden a los objetivos específicos. Para cada par se reporta el coeficiente (ρ de Spearman o r de Pearson, según la normalidad de las variables implicadas), su p-valor individual y el p corregido por el método de Holm, que protege frente al aumento de falsos positivos cuando se realizan varias comparaciones a la vez: al examinar múltiples pares, alguna correlación podría resultar «significativa» por puro azar, y la corrección eleva el listón de exigencia en consecuencia. La columna de decisión, por tanto, debe leerse sobre el p ajustado: solo los pares que lo mantienen por debajo de .05 sostienen una asociación estadísticamente significativa tras el control por multiplicidad.`);
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
                h += this._p(`Para interpretar la tabla anterior conviene recordar que la prueba aplicada depende de la naturaleza de cada variable sociodemográfica: con variables numéricas (como la edad) se examina la correlación con las variables del estudio; con variables categóricas de dos grupos (como el sexo) se comparan las medias mediante t de Student cuando se cumplen sus supuestos, o mediante U de Mann-Whitney en caso contrario. El estadístico cuantifica esa asociación o diferencia, el p-valor su compatibilidad con el azar, y el p de Holm corrige por el número de contrastes realizados simultáneamente. El tamaño del efecto acompaña a cada prueba porque el p-valor, por sí solo, no informa de la magnitud: un efecto pequeño puede ser significativo en muestras grandes y uno grande puede no serlo en muestras pequeñas. En conjunto, las filas marcadas como significativas identifican características de la muestra asociadas a diferencias reales en las variables de estudio, información valiosa para matizar la generalización de los resultados.`);
                h += this._p(CribaSociodemografica.sintetizar(hs));
            }
        }

        // ---- Comparación entre grupos ----
        if (typeof ComparacionGrupos !== 'undefined') {
            const CG = ComparacionGrupos;
            const comparaciones = CG.generarParaWord([[var1, et1], [var2, et2]]);
            if (comparaciones.length) {
                h += this._seccion('Comparación entre grupos');
                h += this._p(`En este apartado se examina si los puntajes de las variables de estudio difieren entre los grupos definidos por las variables categóricas de la muestra. El procedimiento sigue el protocolo estándar: primero se verifican los supuestos (normalidad de cada grupo y homogeneidad de varianzas mediante la prueba de Levene) y, en función de ellos, se selecciona la prueba adecuada: con dos grupos, t de Student cuando ambos supuestos se cumplen, t de Welch si las varianzas difieren, o U de Mann-Whitney cuando falla la normalidad; con tres o más grupos, ANOVA de un factor bajo supuestos cumplidos o Kruskal-Wallis en caso contrario, complementados con comparaciones por pares corregidas por Holm cuando el contraste global resulta significativo. Cada prueba se acompaña de su tamaño del efecto (d de Cohen, r, η² o ε², según corresponda), que expresa la magnitud práctica de la diferencia.`);
                comparaciones.forEach(R => {
                    const P = R.prueba;
                    const glTxt = Array.isArray(P.gl) ? `(${P.gl[0]}, ${P.gl[1]})` : (P.gl != null ? `(${CG._fx(P.gl, 1)})` : '—');
                    h += this._tablaAPA(`${R.etNum} según ${R.etGrupo}: descriptivos y supuestos`,
                        ['Grupo', 'n', 'M', 'DE', 'Mediana', 'Normalidad (p)'],
                        R.grupos.map((g, i) => [g.nombre, g.n, CG._fx(g.media), CG._fx(g.de), CG._fx(g.mediana),
                            `${CG._fp(R.normalidad[i].pValor)} (${R.normalidad[i].normal ? 'normal' : 'no normal'})`]),
                        `Prueba de Levene para homogeneidad de varianzas: F(${R.levene.gl[0]}, ${R.levene.gl[1]}) = ${CG._fx(R.levene.estadistico, 3)}, p ${CG._fp(R.levene.pValor)} (${R.levene.homogeneas ? 'varianzas homogéneas' : 'varianzas no homogéneas'}).`);
                    h += this._tablaAPA(`Contraste de ${R.etNum} según ${R.etGrupo}`,
                        ['Prueba', 'Estadístico', 'gl', 'p', `Efecto (${P.efecto.nombre})`, 'Magnitud', 'Decisión'],
                        [[P.nombre, CG._fx(P.estadistico, 3), glTxt, CG._fp(P.pValor), CG._fx(P.efecto.valor, 3), P.magnitud,
                          P.significativa ? 'Diferencias significativas' : 'Sin diferencias significativas']],
                        `La prueba se eligió porque ${R.razon}.`);
                    if (R.postHoc) {
                        h += this._tablaAPA(`Comparaciones por pares para ${R.etNum} según ${R.etGrupo} (corrección de Holm)`,
                            ['Par', 'Prueba', 'Estadístico', 'p', 'p (Holm)', 'Decisión'],
                            R.postHoc.map(p => [`${p.a} vs ${p.b}`, p.nombre, CG._fx(p.estadistico, 3), CG._fp(p.pValor), CG._fp(p.pHolm),
                                p.sig ? 'Significativa' : 'No significativa']),
                            'La corrección de Holm controla la tasa de falsos positivos al realizar múltiples comparaciones simultáneas.');
                    }
                    h += this._p(CG.interpretar(R));
                });
            }
        }

        // ---- Análisis multivariado (si el investigador lo ejecutó en la app) ----
        if (typeof RegresionMultiple !== 'undefined') {
            const RM = RegresionMultiple;
            const MX = RM._ultimaMatriz, RG = RM._ultimaRegresion;
            if (MX || RG) {
                h += this._seccion('Análisis multivariado');
                h += this._p('Este apartado amplía el análisis bivariado incorporando varias variables de manera simultánea. La matriz de correlaciones ofrece el panorama completo de las asociaciones por pares, mientras que la regresión lineal múltiple estima el aporte de cada predictor a la variable dependiente manteniendo constantes los demás: sus coeficientes B expresan el cambio esperado en la dependiente por cada unidad del predictor con los otros controlados, y los β estandarizados permiten comparar la importancia relativa de predictores medidos en escalas distintas.');
            }
            if (MX && MX.pares) {
                const idx = (i, j) => MX.pares.find(p => (p.i === i && p.j === j) || (p.i === j && p.j === i));
                h += this._tablaAPA(`Matriz de correlaciones entre las variables seleccionadas (n = ${MX.n})`,
                    ['Variable', ...MX.cols.map((_, i) => String(i + 1))],
                    MX.cols.map((c, i) => [`${i + 1}. ${(MX.etiquetas && MX.etiquetas[i]) || c}`,
                        ...MX.cols.map((_, j) => {
                            if (j > i) return '';
                            if (j === i) return '1';
                            const p = idx(i, j);
                            return `${RM._fx(p.r, 2)}${p.sig ? '*' : ''}`;
                        })]),
                    'Se muestra el triángulo inferior. Para cada par se empleó Pearson cuando ambas variables resultaron aproximadamente normales y Spearman en caso contrario. * p < .05 tras la corrección de Holm para comparaciones múltiples.');
            }
            if (RG && RG.coefs) {
                h += this._tablaAPA(`Resumen del modelo de regresión múltiple para ${RG.etY}`,
                    ['R²', 'R² ajustado', 'Error típico', 'F', 'gl', 'p'],
                    [[RM._fx(RG.R2), RM._fx(RG.R2aj), RM._fx(RG.errorTipico, 2), RM._fx(RG.F, 2), `(${RG.glR}, ${RG.glE})`, RM._fp(RG.pF)]],
                    `Variable dependiente: ${RG.etY}. n = ${RG.n} casos completos.`);
                h += this._tablaAPA(`Coeficientes del modelo de regresión múltiple para ${RG.etY}`,
                    ['Predictor', 'B', 'EE', 'β', 't', 'p', 'IC 95%', 'VIF'],
                    RG.coefs.map((c, j) => [c.nombre, RM._fx(c.b), RM._fx(c.se), c.beta === null ? '—' : RM._fx(c.beta),
                        RM._fx(c.t, 2), RM._fp(c.pValor), `[${RM._fx(c.ic[0], 2)}, ${RM._fx(c.ic[1], 2)}]`,
                        j === 0 ? '—' : RM._fx(RG.vifs[j - 1], 2)]),
                    `Normalidad de los residuos (${RG.normResid.prueba}): p ${RM._fp(RG.normResid.pValor)} (${RG.normResid.normal ? 'supuesto satisfecho' : 'supuesto en duda'}). Valores de VIF superiores a 5 sugieren colinealidad problemática.`);
                const cva = RG.k >= 2 ? RM.crudoVsAjustado(RG) : null;
                if (cva) {
                    h += this._tablaAPA(`Efecto crudo y ajustado de ${cva.focal} sobre ${RG.etY}`,
                        ['Modelo', 'B', 'p', 'IC 95%'],
                        [['Crudo (sin controles)', RM._fx(cva.crudo.b), RM._fp(cva.crudo.p), `[${RM._fx(cva.crudo.ic[0], 2)}, ${RM._fx(cva.crudo.ic[1], 2)}]`],
                         [`Ajustado (controlando ${cva.covariables.join(', ')})`, RM._fx(cva.ajustado.b), RM._fp(cva.ajustado.p), `[${RM._fx(cva.ajustado.ic[0], 2)}, ${RM._fx(cva.ajustado.ic[1], 2)}]`]],
                        'La comparación entre el efecto crudo y el ajustado evalúa si la asociación del predictor focal se explica por las covariables incluidas (no espuriedad respecto de ellas).');
                }
                h += this._p(RM.interpretar(RG));
                h += this._p('Precisión conceptual sobre la causalidad: establecer una relación causal exige tres condiciones — asociación estadística, precedencia temporal de la causa y descarte de explicaciones alternativas (no espuriedad). El presente análisis, al basarse en un diseño transversal, satisface la primera y aporta evidencia parcial sobre la tercera mediante el control estadístico de covariables; la precedencia temporal, en cambio, no puede establecerse con mediciones simultáneas. Por ello, los resultados deben interpretarse como asociaciones ajustadas, compatibles con una hipótesis causal pero no demostrativas de ella; su confirmación requeriría diseños longitudinales o experimentales.');
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
