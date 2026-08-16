/**
 * AnalisisGraficos - Análisis automáticos personalizados bajo cada gráfico
 * ------------------------------------------------------------------------
 * Genera, con los DATOS reales de cada visualización, un análisis con
 * redacción científica publicable (estilo capítulo de resultados). El texto
 * es completamente condicional a los datos: severidad de las desviaciones,
 * dirección de asimetrías y atípicos, estructura correlacional, tamaño
 * muestral y comparabilidad de escalas modulan cada frase.
 *
 * Arquitectura modular y extensible:
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
        const q1 = cuantil(v, 0.25), q3 = cuantil(v, 0.75);
        return {
            n, media, de, q1, q3,
            mediana: cuantil(v, 0.5),
            ric: q3 - q1,
            min: v[0], max: v[n - 1],
            asimetria: m2 > 0 ? m3 / Math.pow(m2, 1.5) : 0,
            curtosis: m2 > 0 ? m4 / (m2 * m2) - 3 : 0
        };
    }

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

    // Severidad del apartamiento de la normalidad por momentos.
    // 0 = satisfactorio · 1 = leve · 2 = marcado
    function severidadNormalidad(s) {
        const a = Math.abs(s.asimetria), c = Math.abs(s.curtosis);
        if (a > 1 || c > 2) return 2;
        if (a > 0.5 || c > 1) return 1;
        return 0;
    }

    function describirDesviacion(x) {
        const razones = [];
        if (Math.abs(x.s.asimetria) > 0.5) {
            razones.push(`asimetr\u00eda ${x.s.asimetria > 0 ? 'positiva (cola hacia los valores altos' : 'negativa (cola hacia los valores bajos'}; \u03b3\u2081 = ${x.s.asimetria.toFixed(2)})`);
        }
        if (Math.abs(x.s.curtosis) > 1) {
            razones.push(x.s.curtosis > 0
                ? `exceso de curtosis (\u03b3\u2082 = ${x.s.curtosis.toFixed(2)}; valores extremos m\u00e1s frecuentes de lo esperado bajo normalidad)`
                : `platicurtosis (\u03b3\u2082 = ${x.s.curtosis.toFixed(2)}; distribuci\u00f3n m\u00e1s plana de lo esperado)`);
        }
        return `${x.label} \u2014 ${razones.join(' y ')}`;
    }

    // Aviso condicional por tamaños muestrales reducidos.
    function notaMuestral(series) {
        const nMin = Math.min(...series.map(x => x.s.n));
        if (nMin >= 30) return '';
        return ` Debe considerarse que ${series.length === 1 ? 'el tama\u00f1o muestral es reducido' : 'al menos una variable presenta un tama\u00f1o muestral reducido'} (N m\u00ednimo = ${nMin}), lo que limita la estabilidad de los estimadores y aconseja cautela en la generalizaci\u00f3n de estos resultados.`;
    }

    // Nota condicional cuando las escalas de medición son muy dispares.
    function notaEscalas(series, referencia) {
        const vals = series.map(x => Math.abs(x.s[referencia])).filter(v => v > 0);
        if (vals.length < 2) return '';
        if (Math.max(...vals) / Math.min(...vals) <= 3) return '';
        return ` Cabe precisar que las variables se representan en sus escalas originales de medici\u00f3n, por lo que las comparaciones directas de posici\u00f3n y amplitud entre curvas deben realizarse con esa salvedad.`;
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
        const ordenCV = (conCV.length >= 2 ? conCV : series).slice()
            .sort((a, b) => (conCV.length >= 2 ? b.s.de / b.s.media - a.s.de / a.s.media : b.s.de - a.s.de));
        const masDispersa = ordenCV[0];
        const masHomogenea = ordenCV[ordenCV.length - 1];

        const g0 = series.filter(x => severidadNormalidad(x.s) === 0);
        const g1 = series.filter(x => severidadNormalidad(x.s) === 1);
        const g2 = series.filter(x => severidadNormalidad(x.s) === 2);

        let p = '';
        // 1) Panorama de posición y dispersión
        if (series.length === 1) {
            const u = series[0];
            p += `La variable ${u.label} presenta una media de ${f1(u.s.media)} (\u03c3 = ${f1(u.s.de)}; N = ${u.s.n}), con puntajes comprendidos entre ${f1(u.s.min)} y ${f1(u.s.max)}. `;
        } else {
            const a = porMedia[0], b = porMedia[porMedia.length - 1];
            p += `Las medias de las ${series.length} variables analizadas oscilaron entre M = ${f1(a.s.media)} (${a.label}) y M = ${f1(b.s.media)} (${b.label}). `;
            if (conCV.length >= 2) {
                p += `En t\u00e9rminos de dispersi\u00f3n relativa, ${masDispersa.label} result\u00f3 la m\u00e1s heterog\u00e9nea (\u03c3 = ${f1(masDispersa.s.de)}; CV = ${f1(100 * masDispersa.s.de / masDispersa.s.media)} %), mientras que ${masHomogenea.label} mostr\u00f3 la mayor homogeneidad (CV = ${f1(100 * masHomogenea.s.de / masHomogenea.s.media)} %). `;
            } else {
                p += `La mayor dispersi\u00f3n correspondi\u00f3 a ${masDispersa.label} (\u03c3 = ${f1(masDispersa.s.de)}). `;
            }
        }
        // 2) Ajuste al modelo normal, graduado por severidad
        if (g2.length === 0 && g1.length === 0) {
            p += `El contraste entre las densidades emp\u00edricas (l\u00ednea punteada) y sus modelos normales te\u00f3ricos (l\u00ednea continua) sugiere un ajuste visual satisfactorio en ${series.length === 1 ? 'la variable analizada' : 'todas las variables'}: los \u00edndices de asimetr\u00eda y curtosis se mantienen dentro de los m\u00e1rgenes habitualmente considerados compatibles con la normalidad (|\u03b3\u2081| \u2264 0.5; |\u03b3\u2082| \u2264 1). `;
            p += `Este panorama respalda, de modo preliminar, el empleo de procedimientos param\u00e9tricos, decisi\u00f3n que deber\u00e1 confirmarse con las pruebas formales de normalidad (Shapiro-Wilk o Kolmogorov-Smirnov, seg\u00fan N).`;
        } else {
            if (g0.length) {
                p += `El contraste emp\u00edrico-te\u00f3rico sugiere un ajuste satisfactorio al modelo normal en ${listaNatural(g0.map(x => x.label))}. `;
            }
            if (g1.length) {
                p += `${g0.length ? 'Por su parte, ' : ''}${listaNatural(g1.map(describirDesviacion))} ${g1.length === 1 ? 'presenta desviaciones leves' : 'presentan desviaciones leves'}, dentro de rangos ante los cuales los procedimientos param\u00e9tricos suelen mostrar robustez razonable cuando el tama\u00f1o muestral es adecuado. `;
            }
            if (g2.length) {
                p += `En cambio, ${listaNatural(g2.map(describirDesviacion))} ${g2.length === 1 ? 'se aparta de manera marcada' : 'se apartan de manera marcada'} del modelo normal. `;
                p += `Estas desviaciones deber\u00e1n corroborarse mediante las pruebas formales de normalidad y justifican el empleo de estad\u00edsticos robustos a la distribuci\u00f3n (p. ej., \u03c1 de Spearman, pruebas no param\u00e9tricas) en los an\u00e1lisis que involucren ${g2.length === 1 ? 'a esta variable' : 'a estas variables'}.`;
            } else {
                p += `Se recomienda contrastar estas apreciaciones visuales con las pruebas formales de normalidad.`;
            }
        }
        p += notaEscalas(series, 'media');
        p += notaMuestral(series);
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
        const positivas = pares.filter(x => x.r >= 0.1);
        const negativas = pares.filter(x => x.r <= -0.1);
        const nulas = pares.length - positivas.length - negativas.length;
        const maxPos = pares.slice().sort((x, y) => y.r - x.r)[0];
        const minNeg = pares.slice().sort((x, y) => x.r - y.r)[0];
        const mediaAbs = pares.reduce((s, x) => s + Math.abs(x.r), 0) / pares.length;
        const fuertes = pares.filter(x => Math.abs(x.r) >= 0.5).length;
        const moderadas = pares.filter(x => Math.abs(x.r) >= 0.3 && Math.abs(x.r) < 0.5).length;
        const debiles = pares.filter(x => Math.abs(x.r) >= 0.1 && Math.abs(x.r) < 0.3).length;

        // 1) Panorama del patrón de signos
        let p = `El examen de los ${pares.length} pares de variables revel\u00f3 ${positivas.length} ${positivas.length === 1 ? 'asociaci\u00f3n positiva' : 'asociaciones positivas'}, ${negativas.length} ${negativas.length === 1 ? 'negativa' : 'negativas'} y ${nulas} de magnitud despreciable (|r| < .10). `;
        // 2) Extremos con lectura direccional y varianza compartida
        if (maxPos.r >= 0.1) {
            p += `La asociaci\u00f3n positiva de mayor magnitud se observ\u00f3 entre ${maxPos.a} y ${maxPos.b} (${fr(maxPos.r)}; ${bandaFuerza(maxPos.r)}; r\u00b2 = ${f1(100 * maxPos.r * maxPos.r)} % de varianza compartida), lo que indica que puntuaciones m\u00e1s elevadas en ${maxPos.a} tienden a acompa\u00f1arse de puntuaciones m\u00e1s elevadas en ${maxPos.b}. `;
        }
        if (minNeg.r <= -0.1) {
            p += `La relaci\u00f3n inversa m\u00e1s marcada correspondi\u00f3 a ${minNeg.a} y ${minNeg.b} (${fr(minNeg.r)}; ${bandaFuerza(minNeg.r)}), de modo que valores m\u00e1s altos en ${minNeg.a} tienden a asociarse con valores m\u00e1s bajos en ${minNeg.b}. `;
        } else if (maxPos.r >= 0.1) {
            p += `No se registraron asociaciones negativas de magnitud relevante. `;
        }
        // 3) Estructura global
        p += `En conjunto, la magnitud promedio fue |r\u0304| = ${fr(mediaAbs)} (${fuertes} ${fuertes === 1 ? 'par fuerte' : 'pares fuertes'}, ${moderadas} ${moderadas === 1 ? 'moderado' : 'moderados'} y ${debiles} ${debiles === 1 ? 'd\u00e9bil' : 'd\u00e9biles'}). `;
        if (mediaAbs >= 0.4) {
            p += `Este patr\u00f3n de interrelaci\u00f3n considerable resulta sugerente de una estructura com\u00fan subyacente entre las variables, hip\u00f3tesis que podr\u00eda explorarse mediante t\u00e9cnicas multivariadas. `;
        } else if (mediaAbs >= 0.2) {
            p += `El patr\u00f3n global evidencia una interrelaci\u00f3n moderada entre las variables del conjunto. `;
        } else {
            p += `El patr\u00f3n global sugiere que las variables operan de forma mayormente independiente entre s\u00ed. `;
        }
        // 4) Método y cautelas condicionales
        if (d.metodoCorrelacion) {
            p += `${d.metodoCorrelacion.replace('Coeficiente:', 'El coeficiente empleado fue')}${d.metodoCorrelacion.includes('por par') ? '' : ' en todos los pares'}, en coherencia con la evaluaci\u00f3n de normalidad del an\u00e1lisis principal. `;
        }
        if (pares.length >= 6) {
            p += `Dado el n\u00famero de comparaciones simult\u00e1neas, conviene interpretar con cautela las correlaciones aisladas de magnitud modesta (posible inflaci\u00f3n del error tipo I). `;
        }
        p += `Finalmente, debe recordarse que la correlaci\u00f3n no implica causalidad.`;
        return p;
    }

    // Diagrama de caja
    function analisisBoxplot(d) {
        if (!d || !Array.isArray(d.cajas) || d.cajas.length === 0) return '';
        const series = d.cajas.map((v, i) => {
            const s = stats(v);
            if (!s || s.n < 3) return null;
            const li = s.q1 - 1.5 * s.ric, ls = s.q3 + 1.5 * s.ric;
            const vals = v.filter(Number.isFinite);
            const outSup = vals.filter(y => y > ls).length;
            const outInf = vals.filter(y => y < li).length;
            const bigoteSup = Math.min(s.max, ls) - s.q3;
            const bigoteInf = s.q1 - Math.max(s.min, li);
            const despl = s.ric > 0 ? (s.mediana - (s.q1 + s.q3) / 2) / s.ric : 0;
            const ratioBigotes = (bigoteInf > 0 && bigoteSup > 0) ? bigoteSup / bigoteInf : 1;
            return { label: d.labels[i] || 'Variable ' + (i + 1), s, outSup, outInf, despl, ratioBigotes };
        }).filter(Boolean);
        if (!series.length) return '';

        const porMdn = series.slice().sort((a, b) => b.s.mediana - a.s.mediana);
        const alta = porMdn[0], baja = porMdn[porMdn.length - 1];
        const porRic = series.slice().sort((a, b) => b.s.ric - a.s.ric);
        const heterogenea = porRic[0], homogenea = porRic[porRic.length - 1];
        const totalSup = series.reduce((s, x) => s + x.outSup, 0);
        const totalInf = series.reduce((s, x) => s + x.outInf, 0);
        const totalOut = totalSup + totalInf;
        const conOut = series.filter(x => x.outSup + x.outInf > 0).sort((a, b) => (b.outSup + b.outInf) - (a.outSup + a.outInf));
        const asimetricas = series.filter(x => Math.abs(x.despl) > 0.2 || x.ratioBigotes > 1.8 || x.ratioBigotes < 1 / 1.8);

        let p = '';
        // 1) Nivel y dispersión
        if (series.length === 1) {
            const u = series[0];
            p += `La variable ${u.label} presenta una mediana de ${f1(u.s.mediana)} (RIC = ${f1(u.s.ric)}; rango ${f1(u.s.min)}\u2013${f1(u.s.max)}; N = ${u.s.n}). `;
        } else {
            p += `Los diagramas de caja evidencian que ${alta.label} concentr\u00f3 los puntajes m\u00e1s elevados (Mdn = ${f1(alta.s.mediana)}), en tanto que ${baja.label} registr\u00f3 los m\u00e1s bajos (Mdn = ${f1(baja.s.mediana)}). `;
            p += `La mayor heterogeneidad interindividual correspondi\u00f3 a ${heterogenea.label} (RIC = ${f1(heterogenea.s.ric)}), y la mayor homogeneidad a ${homogenea.label} (RIC = ${f1(homogenea.s.ric)}): en esta \u00faltima, la mitad central de los participantes se agrupa en un intervalo notablemente m\u00e1s estrecho. `;
        }
        // 2) Atípicos con dirección e implicación
        if (totalOut > 0) {
            const detalle = conOut.slice(0, 3).map(x => `${x.label} (${x.outSup + x.outInf})`);
            p += `Se identificaron ${totalOut} ${totalOut === 1 ? 'observaci\u00f3n at\u00edpica' : 'observaciones at\u00edpicas'} seg\u00fan el criterio de Tukey (1.5 \u00d7 RIC), localizada${totalOut === 1 ? '' : 's'} en ${listaNatural(detalle)}`;
            if (totalSup > 0 && totalInf === 0) {
                p += `, todas por encima del l\u00edmite superior, lo que apunta a casos con puntuaciones excepcionalmente altas. `;
            } else if (totalInf > 0 && totalSup === 0) {
                p += `, todas por debajo del l\u00edmite inferior, lo que apunta a casos con puntuaciones excepcionalmente bajas. `;
            } else {
                p += ` (${totalSup} por encima del l\u00edmite superior y ${totalInf} por debajo del inferior). `;
            }
            p += `Se recomienda examinar estos casos antes de los an\u00e1lisis inferenciales para descartar errores de registro y valorar su influencia sobre medias y correlaciones. `;
        } else {
            p += `No se identificaron observaciones at\u00edpicas seg\u00fan el criterio de Tukey (1.5 \u00d7 RIC), lo que favorece la estabilidad de los estad\u00edsticos basados en la media. `;
        }
        // 3) Simetría (posición de la mediana + longitud de bigotes)
        if (asimetricas.length) {
            const desc = asimetricas.map(x => {
                const dir = (x.despl > 0 || x.ratioBigotes < 1) ? 'hacia los valores bajos (cola inferior)' : 'hacia los valores altos (cola superior)';
                return `${x.label} (${dir})`;
            });
            p += `La posici\u00f3n de las medianas y la longitud desigual de los bigotes sugieren asimetr\u00eda en ${listaNatural(desc)}. `;
        } else {
            p += `La posici\u00f3n centrada de las medianas y el equilibrio de los bigotes sugieren distribuciones aproximadamente sim\u00e9tricas. `;
        }
        // 4) Recomendación descriptiva condicional
        if (asimetricas.length || totalOut > 0) {
            p += `En este escenario, la mediana y el RIC constituyen descriptores m\u00e1s representativos que la media y la desviaci\u00f3n est\u00e1ndar, y conviene considerar procedimientos robustos en los contrastes que involucren a las variables afectadas.`;
        } else {
            p += `Bajo estas condiciones, la media y la desviaci\u00f3n est\u00e1ndar resultan descriptores adecuados del conjunto.`;
        }
        p += notaEscalas(series, 'mediana');
        p += notaMuestral(series);
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
