/**
 * AnalisisGraficos - Análisis automáticos personalizados bajo cada gráfico
 * ------------------------------------------------------------------------
 * Genera, con los DATOS reales de cada visualización, un párrafo de análisis
 * con redacción científica publicable (estilo capítulo de resultados) y lo
 * inserta bajo el gráfico correspondiente.
 *
 * Arquitectura modular y extensible: cada gráfico tiene un generador
 * registrado por el id de su contenedor. Para añadir el análisis de un nuevo
 * gráfico basta con registrar su generador:
 *
 *     AnalisisGraficos.registrar('mi-grafico', datos => '<p>…</p>');
 *
 * Módulo autocontenido: no depende de d3/statviz ni de otros módulos.
 */
(function () {
    'use strict';

    // ------------------------- utilidades estadísticas -------------------------

    function cuantil(ordenados, p) {
        const h = (ordenados.length - 1) * p;
        const lo = Math.floor(h), hi = Math.ceil(h);
        return ordenados[lo] + (h - lo) * (ordenados[hi] - ordenados[lo]);
    }

    function stats(valores) {
        const v = valores.filter(Number.isFinite).slice().sort((a, b) => a - b);
        const n = v.length;
        if (n === 0) return null;
        const media = v.reduce((s, x) => s + x, 0) / n;
        const m2 = v.reduce((s, x) => s + (x - media) ** 2, 0) / n;
        const de = Math.sqrt(m2 * n / Math.max(1, n - 1));
        const m3 = v.reduce((s, x) => s + (x - media) ** 3, 0) / n;
        const m4 = v.reduce((s, x) => s + (x - media) ** 4, 0) / n;
        return {
            n, media, de,
            mediana: cuantil(v, 0.5),
            q1: cuantil(v, 0.25),
            q3: cuantil(v, 0.75),
            ric: cuantil(v, 0.75) - cuantil(v, 0.25),
            min: v[0], max: v[n - 1],
            asimetria: m2 > 0 ? m3 / Math.pow(m2, 1.5) : 0,
            curtosis: m2 > 0 ? m4 / (m2 * m2) - 3 : 0
        };
    }

    // Formato APA de un coeficiente: sin cero inicial, dos decimales.
    const fr = x => (x < 0 ? '\u2212' : '') + Math.abs(x).toFixed(2).replace(/^0/, '');
    const f1 = x => (Math.round(x * 10) / 10).toFixed(1);

    function bandaFuerza(r) {
        const a = Math.abs(r);
        return a < 0.1 ? 'despreciable' : a < 0.3 ? 'd\u00e9bil' : a < 0.5 ? 'moderada' : 'fuerte';
    }

    function listaNatural(items) {
        if (items.length <= 1) return items.join('');
        return items.slice(0, -1).join(', ') + ' y ' + items[items.length - 1];
    }

    // ------------------------------ generadores -------------------------------

    // Distribución de puntajes (teórica vs. empírica)
    function analisisDistribucion(d) {
        if (!d || !Array.isArray(d.cajas) || d.cajas.length === 0) return '';
        const series = d.cajas.map((v, i) => ({ label: d.labels[i] || 'Variable ' + (i + 1), s: stats(v) }))
            .filter(x => x.s && x.s.n >= 3);
        if (!series.length) return '';
        const porMedia = series.slice().sort((a, b) => a.s.media - b.s.media);
        const conCV = series.filter(x => x.s.media > 0);
        const masDispersa = (conCV.length ? conCV : series).slice()
            .sort((a, b) => (conCV.length ? b.s.de / b.s.media - a.s.de / a.s.media : b.s.de - a.s.de))[0];
        const desviadas = series.filter(x => Math.abs(x.s.asimetria) > 1 || Math.abs(x.s.curtosis) > 2);
        const compatibles = series.filter(x => !desviadas.includes(x));

        let p = '';
        if (series.length === 1) {
            const u = series[0];
            p += `La variable ${u.label} presenta una media de ${f1(u.s.media)} (\u03c3 = ${f1(u.s.de)}, N = ${u.s.n}). `;
        } else {
            const a = porMedia[0], b = porMedia[porMedia.length - 1];
            p += `Las medias de las ${series.length} variables analizadas oscilaron entre M = ${f1(a.s.media)} (${a.label}) y M = ${f1(b.s.media)} (${b.label}). `;
            if (conCV.length) {
                p += `La mayor dispersi\u00f3n relativa correspondi\u00f3 a ${masDispersa.label} (\u03c3 = ${f1(masDispersa.s.de)}; CV = ${f1(100 * masDispersa.s.de / masDispersa.s.media)} %). `;
            } else {
                p += `La mayor dispersi\u00f3n correspondi\u00f3 a ${masDispersa.label} (\u03c3 = ${f1(masDispersa.s.de)}). `;
            }
        }
        if (desviadas.length === 0) {
            p += `El contraste entre las densidades emp\u00edricas y sus modelos normales te\u00f3ricos sugiere, en t\u00e9rminos visuales, un ajuste adecuado en ${series.length === 1 ? 'la variable analizada' : 'todas las variables'}, apreciaci\u00f3n que deber\u00e1 corroborarse mediante las pruebas formales de normalidad.`;
        } else {
            const desc = desviadas.map(x => {
                const razones = [];
                if (Math.abs(x.s.asimetria) > 1) razones.push(`asimetr\u00eda ${x.s.asimetria > 0 ? 'positiva' : 'negativa'} (\u03b3\u2081 = ${x.s.asimetria.toFixed(2)})`);
                if (Math.abs(x.s.curtosis) > 2) razones.push(`${x.s.curtosis > 0 ? 'exceso de curtosis' : 'marcada platicurtosis'} (\u03b3\u2082 = ${x.s.curtosis.toFixed(2)})`);
                return `${x.label} \u2014 ${razones.join(' y ')}`;
            });
            if (compatibles.length) {
                p += `El contraste visual entre las densidades emp\u00edricas y te\u00f3ricas sugiere un ajuste razonable al modelo normal en ${listaNatural(compatibles.map(x => x.label))}; en cambio, ${listaNatural(desc)} se apartan de dicho modelo. `;
            } else {
                p += `El contraste visual indica desviaciones del modelo normal en ${listaNatural(desc)}. `;
            }
            p += `Estas desviaciones deber\u00e1n corroborarse mediante las pruebas formales de normalidad, y respaldan el empleo de estad\u00edsticos robustos (p. ej., \u03c1 de Spearman) donde corresponda.`;
        }
        return p;
    }

    // Matriz de correlaciones
    function analisisMatriz(d) {
        if (!d || !Array.isArray(d.correlaciones) || d.correlaciones.length < 2) return '';
        const n = d.correlaciones.length;
        const pares = [];
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                pares.push({ a: d.labels[i], b: d.labels[j], r: d.correlaciones[i][j] });
            }
        }
        if (!pares.length) return '';
        const maxPos = pares.slice().sort((x, y) => y.r - x.r)[0];
        const minNeg = pares.slice().sort((x, y) => x.r - y.r)[0];
        const mediaAbs = pares.reduce((s, x) => s + Math.abs(x.r), 0) / pares.length;
        const fuertes = pares.filter(x => Math.abs(x.r) >= 0.5).length;
        const moderadas = pares.filter(x => Math.abs(x.r) >= 0.3 && Math.abs(x.r) < 0.5).length;

        let p = `De los ${pares.length} pares de variables examinados, `;
        if (maxPos.r > 0) {
            p += `la asociaci\u00f3n positiva de mayor magnitud se observ\u00f3 entre ${maxPos.a} y ${maxPos.b} (${fr(maxPos.r)}; ${bandaFuerza(maxPos.r)})`;
            p += (minNeg.r < 0)
                ? `, mientras que la relaci\u00f3n inversa m\u00e1s marcada correspondi\u00f3 a ${minNeg.a} y ${minNeg.b} (${fr(minNeg.r)}; ${bandaFuerza(minNeg.r)}). `
                : `; no se registraron asociaciones negativas. `;
        } else {
            p += `todas las asociaciones resultaron negativas o nulas, con la m\u00e1s marcada entre ${minNeg.a} y ${minNeg.b} (${fr(minNeg.r)}). `;
        }
        p += `En conjunto, la magnitud promedio de las correlaciones fue |r\u0304| = ${fr(mediaAbs)}; `;
        p += `${fuertes} ${fuertes === 1 ? 'par alcanz\u00f3 una magnitud fuerte' : 'pares alcanzaron magnitudes fuertes'} (|r| \u2265 .50) y ${moderadas} ${moderadas === 1 ? 'una moderada' : 'moderadas'} (.30 \u2264 |r| < .50). `;
        if (d.metodoCorrelacion) {
            p += `${d.metodoCorrelacion.replace('Coeficiente:', 'El coeficiente empleado fue')}${d.metodoCorrelacion.includes('por par') ? '' : ' en todos los pares'}, en coherencia con la evaluaci\u00f3n de normalidad del an\u00e1lisis principal. `;
        }
        p += `Cabe recordar que la correlaci\u00f3n no implica causalidad.`;
        return p;
    }

    // Diagrama de caja
    function analisisBoxplot(d) {
        if (!d || !Array.isArray(d.cajas) || d.cajas.length === 0) return '';
        const series = d.cajas.map((v, i) => ({ label: d.labels[i] || 'Variable ' + (i + 1), s: stats(v) }))
            .filter(x => x.s && x.s.n >= 3);
        if (!series.length) return '';
        series.forEach(x => {
            const li = x.s.q1 - 1.5 * x.s.ric, ls = x.s.q3 + 1.5 * x.s.ric;
            x.outliers = d.cajas[series.indexOf(x)] ? 0 : 0;
        });
        // Conteo de atípicos por el criterio de Tukey, serie a serie.
        d.cajas.forEach((v, i) => {
            const x = series.find(s => s.label === (d.labels[i] || 'Variable ' + (i + 1)));
            if (!x) return;
            const li = x.s.q1 - 1.5 * x.s.ric, ls = x.s.q3 + 1.5 * x.s.ric;
            x.outliers = v.filter(Number.isFinite).filter(y => y < li || y > ls).length;
        });
        const porMdn = series.slice().sort((a, b) => b.s.mediana - a.s.mediana);
        const alta = porMdn[0], baja = porMdn[porMdn.length - 1];
        const masHeterogenea = series.slice().sort((a, b) => b.s.ric - a.s.ric)[0];
        const totalOut = series.reduce((s, x) => s + x.outliers, 0);
        const conOut = series.filter(x => x.outliers > 0).sort((a, b) => b.outliers - a.outliers);
        const asimetricas = series.filter(x => x.s.ric > 0 && Math.abs((x.s.mediana - (x.s.q1 + x.s.q3) / 2) / x.s.ric) > 0.2);

        let p = '';
        if (series.length === 1) {
            const u = series[0];
            p += `La variable ${u.label} presenta una mediana de ${f1(u.s.mediana)} (RIC = ${f1(u.s.ric)}; rango ${f1(u.s.min)}\u2013${f1(u.s.max)}; N = ${u.s.n}). `;
        } else {
            p += `Los diagramas de caja evidencian que ${alta.label} concentr\u00f3 los puntajes m\u00e1s elevados (Mdn = ${f1(alta.s.mediana)}), en tanto que ${baja.label} registr\u00f3 los m\u00e1s bajos (Mdn = ${f1(baja.s.mediana)}). `;
            p += `La mayor heterogeneidad correspondi\u00f3 a ${masHeterogenea.label} (RIC = ${f1(masHeterogenea.s.ric)}). `;
        }
        if (totalOut > 0) {
            const detalle = conOut.slice(0, 3).map(x => `${x.label} (${x.outliers})`);
            p += `Se identificaron ${totalOut} ${totalOut === 1 ? 'observaci\u00f3n at\u00edpica' : 'observaciones at\u00edpicas'} seg\u00fan el criterio de Tukey (1.5 \u00d7 RIC), localizada${totalOut === 1 ? '' : 's'} en ${listaNatural(detalle)}, cuya revisi\u00f3n se recomienda antes de los an\u00e1lisis inferenciales. `;
        } else {
            p += `No se identificaron observaciones at\u00edpicas seg\u00fan el criterio de Tukey (1.5 \u00d7 RIC). `;
        }
        p += asimetricas.length
            ? `La posici\u00f3n desplazada de la mediana dentro de su caja sugiere asimetr\u00eda en ${listaNatural(asimetricas.map(x => x.label))}.`
            : `La posici\u00f3n de las medianas dentro de sus cajas sugiere distribuciones aproximadamente sim\u00e9tricas.`;
        return p;
    }

    // ------------------------------- API pública -------------------------------

    const generadores = {
        'distribucion-gaussiana': analisisDistribucion,
        'matriz-correlacion': analisisMatriz,
        'diagrama-caja': analisisBoxplot
    };

    const AnalisisGraficos = {
        /** Registra (o reemplaza) el generador de análisis de un gráfico. */
        registrar(idContenedor, fn) { generadores[idContenedor] = fn; },

        /** Devuelve el texto de análisis (string, puede ser '') de un gráfico. */
        generar(idContenedor, datosParaGraficos) {
            const fn = generadores[idContenedor];
            if (!fn) return '';
            try { return fn(datosParaGraficos) || ''; }
            catch (e) { console.error('AnalisisGraficos[' + idContenedor + ']:', e); return ''; }
        },

        /**
         * Inserta (o actualiza) el bloque de análisis bajo cada gráfico
         * registrado presente en el DOM. Idempotente: en cada re-render
         * reemplaza el contenido con los datos vigentes.
         */
        insertarTodos(datosParaGraficos) {
            Object.keys(generadores).forEach(id => {
                const wrapper = document.getElementById(id);
                if (!wrapper) return;
                const texto = this.generar(id, datosParaGraficos);
                const card = wrapper.closest('.chart-container') || wrapper.parentElement;
                let bloque = card ? card.querySelector('.analisis-grafico') : null;
                if (!texto) { if (bloque) bloque.remove(); return; }
                if (!bloque) {
                    bloque = document.createElement('div');
                    bloque.className = 'analisis-grafico';
                    bloque.style.cssText = 'margin-top:0.85rem; padding-top:0.7rem; border-top:1px solid #334155;';
                    wrapper.insertAdjacentElement('afterend', bloque);
                }
                bloque.innerHTML = '<h5 style="margin:0 0 0.35rem; font-size:0.78rem; letter-spacing:0.06em; text-transform:uppercase; color:#fbbf24;">An\u00e1lisis</h5>'
                    + '<p style="margin:0; color:#cbd5e1; font-size:0.92rem; line-height:1.6; text-align:justify;">' + texto + '</p>';
            });
        }
    };

    if (typeof window !== 'undefined') window.AnalisisGraficos = AnalisisGraficos;
    if (typeof module !== 'undefined' && module.exports) module.exports = AnalisisGraficos;
})();
