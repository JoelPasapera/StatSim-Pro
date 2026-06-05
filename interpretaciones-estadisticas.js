// ========================================
// MÓDULO DE INTERPRETACIONES ESTADÍSTICAS
// Sistema de interpretación dinámica basada en resultados
// Redacción de nivel profesional: terminología precisa (lineal vs. monotónica),
// reporte estilo APA, tamaño del efecto, IC 95%, potencia y salvaguardas.
// ========================================

const InterpretacionesEstadisticas = {

    // ----------------------------------------
    // Utilidades internas de formato
    // ----------------------------------------

    // ¿El coeficiente usado es Spearman? (el analizador guarda 'Spearman (Rho)')
    _esSpearman(tipoCorrelacion) {
        return typeof tipoCorrelacion === 'string' && tipoCorrelacion.includes('Spearman');
    },

    // p-valor con criterio profesional: nunca reportar p = 0.000
    _fmtP(p) {
        if (!Number.isFinite(p)) return 'p no disponible';
        return p < 0.001 ? 'p < 0.001' : `p = ${p.toFixed(3)}`;
    },

    _fmtNum(x, dec = 3) {
        return Number.isFinite(x) ? x.toFixed(dec) : '—';
    },

    // Conjunción española correcta: "y" → "e" ante palabras que inician con i/hi
    _conj(siguientePalabra) {
        return /^h?i(?![eé])/i.test(String(siguientePalabra).trim()) ? 'e' : 'y';
    },

    // Punto de corte de Cohen (1988) para correlaciones: .10 / .30 / .50
    _benchmarkCohen(rAbs) {
        if (rAbs < 0.1) return 'inferior al umbral de efecto pequeño';
        if (rAbs < 0.3) return 'pequeño';
        if (rAbs < 0.5) return 'mediano';
        return 'grande';
    },

    // ========================================
    // INTERPRETACIONES DE NORMALIDAD
    // ========================================

    generarInterpretacionNormalidad(var1, var2, resultado) {
        const n = resultado.n;
        const norm1 = resultado.normalidad1;
        const norm2 = resultado.normalidad2;

        // Símbolo del estadístico según la prueba: W para Shapiro-Wilk,
        // D para Kolmogorov-Smirnov (Lilliefors).
        const simbolo = norm => (norm.prueba && norm.prueba.includes('Shapiro')) ? 'W' : 'D';
        const prueba = norm1.prueba; // Ambas variables usan la misma prueba (mismo n)
        const esShapiro = prueba && prueba.includes('Shapiro');

        // Reporte breve por variable, estilo APA
        const rep = (nombre, norm) =>
            `${nombre}: ${simbolo(norm)} = ${this._fmtNum(norm.estadistico)}, ${this._fmtP(norm.pValor)}`;

        let texto = '';

        // 1) Método y justificación de su elección
        texto += `Se evaluó el supuesto de normalidad de ${var1} y ${var2} mediante la prueba de ${prueba}, `;
        texto += esShapiro
            ? `seleccionada por tratarse de una muestra pequeña (n = ${n} < 50), contexto en el que Shapiro-Wilk presenta la mayor potencia estadística para detectar desviaciones de la normalidad (Razali y Wah, 2011). `
            : `seleccionada por el tamaño de la muestra (n = ${n} ≥ 50), rango en el que Kolmogorov-Smirnov con la corrección de Lilliefors es el procedimiento de referencia. `;
        texto += `El criterio de decisión fue: p > 0.05 indica que la distribución no se desvía significativamente de la normal. `;

        // 2) Resultados por variable y 3) consecuencia metodológica
        if (norm1.normal && norm2.normal) {
            texto += `Los resultados mostraron que ambas variables cumplieron el supuesto (${rep(var1, norm1)}; ${rep(var2, norm2)}); en ambos casos p > 0.05, por lo que se retiene la hipótesis de normalidad. `;
            texto += `En consecuencia, corresponde el uso de estadística paramétrica: se aplicó el coeficiente de correlación de Pearson (r), que cuantifica la relación LINEAL entre las variables y constituye el estimador de mayor potencia cuando la normalidad se satisface (Hernández-Sampieri y Mendoza, 2018). `;
        } else if (!norm1.normal && !norm2.normal) {
            texto += `Los resultados mostraron que ambas variables se desviaron significativamente de la normalidad (${rep(var1, norm1)}; ${rep(var2, norm2)}); en ambos casos p ≤ 0.05, incumpliéndose el supuesto exigido por la estadística paramétrica. `;
            texto += `En consecuencia, se empleó el coeficiente de correlación de Spearman (ρ), un método no paramétrico basado en rangos que no requiere normalidad y cuantifica la relación MONOTÓNICA entre las variables, evitando así conclusiones distorsionadas por la forma de las distribuciones (Hernández-Sampieri y Mendoza, 2018). `;
        } else {
            const varNoNormal = !norm1.normal ? var1 : var2;
            const normNoNormal = !norm1.normal ? norm1 : norm2;
            const varNormal = norm1.normal ? var1 : var2;
            const normNormal = norm1.normal ? norm1 : norm2;

            texto += `Los resultados fueron mixtos: ${varNoNormal} se desvió significativamente de la normalidad (${rep(varNoNormal, normNoNormal)}, p ≤ 0.05), mientras que ${varNormal} sí cumplió el supuesto (${rep(varNormal, normNormal)}, p > 0.05). `;
            texto += `Dado que el coeficiente de Pearson exige normalidad en AMBAS variables, basta con que una la incumpla para que el procedimiento paramétrico deje de ser apropiado. `;
            texto += `Por ello se optó por el coeficiente de correlación de Spearman (ρ), que al operar sobre rangos es robusto frente a desviaciones de la normalidad y a valores extremos. `;
        }

        // 4) Recomendación de corroboración visual
        texto += `Se recomienda corroborar esta decisión inspeccionando los gráficos Q-Q: si los puntos se alinean sobre la recta de referencia, la conclusión de la prueba queda visualmente respaldada.`;

        return texto;
    },

    // ========================================
    // INTERPRETACIONES DE CORRELACIÓN
    // ========================================

    generarInterpretacionCorrelacion(var1, var2, resultado) {
        const coef = resultado.coeficiente;
        const pValor = resultado.pValor;
        const n = resultado.n;
        const gl = Number.isFinite(resultado.gl) ? resultado.gl : (n - 2);
        const esSpearman = this._esSpearman(resultado.tipoCorrelacion);
        const tipoCoef = esSpearman ? 'ρ' : 'r';
        const tipoRelacion = esSpearman ? 'monotónica' : 'lineal';
        const fuerza = (resultado.interpretacion && resultado.interpretacion.fuerza) || 'indeterminada';
        const direccion = (resultado.interpretacion && resultado.interpretacion.direccion) || (coef >= 0 ? 'positiva' : 'negativa');
        const coefAbs = Math.abs(coef);
        const r2 = Number.isFinite(resultado.r2) ? resultado.r2 : coef * coef;
        const ic = resultado.intervaloConfianza || null;
        const poder = Number.isFinite(resultado.poder) ? resultado.poder : null;

        let texto = '';

        // 1) Método aplicado (corregido: reconoce 'Spearman (Rho)')
        if (esSpearman) {
            texto += `Dado que al menos una de las variables incumplió el supuesto de normalidad, se calculó el coeficiente de correlación de Spearman (ρ), que evalúa la relación monotónica entre ${var1} y ${var2} a partir de sus rangos. `;
        } else {
            texto += `Dado que ambas variables cumplieron el supuesto de normalidad, se calculó el coeficiente de correlación de Pearson (r), que evalúa la relación lineal entre ${var1} y ${var2}. `;
        }

        // 2) Reporte del resultado (estilo APA, con IC si está disponible)
        texto += `El análisis arrojó ${tipoCoef}(${gl}) = ${this._fmtNum(coef)}, ${this._fmtP(pValor)} (N = ${n})`;
        if (ic && Number.isFinite(ic.inferior) && Number.isFinite(ic.superior)) {
            const nivelIC = Math.round((ic.nivel || 0.95) * 100);
            texto += `, IC ${nivelIC}% [${this._fmtNum(ic.inferior)}, ${this._fmtNum(ic.superior)}]`;
        }
        texto += `. `;

        // 3) Dirección y magnitud
        if (coefAbs < 0.1) {
            texto += `El coeficiente es prácticamente nulo: no se aprecia una asociación ${tipoRelacion} apreciable entre las variables. `;
        } else {
            texto += `La magnitud corresponde a una correlación ${fuerza} de dirección ${direccion}. `;
            if (direccion === 'positiva') {
                texto += `En términos sustantivos, las personas con puntuaciones más altas en ${var1} tienden a presentar también puntuaciones más altas en ${var2} (y viceversa). `;
            } else {
                texto += `En términos sustantivos, las personas con puntuaciones más altas en ${var1} tienden a presentar puntuaciones más bajas en ${var2}: una relación inversa. `;
            }
        }

        // 4) Significancia estadística
        if (pValor < 0.05) {
            texto += pValor < 0.01
                ? `El resultado es estadísticamente significativo incluso bajo el criterio exigente de 0.01 (${this._fmtP(pValor)}), lo que aporta evidencia sólida de que la asociación observada no se debe al azar muestral. `
                : `El resultado es estadísticamente significativo al nivel convencional de 0.05 (${this._fmtP(pValor)}), lo que indica que la asociación observada difícilmente se explica por el azar muestral. `;
        } else {
            texto += `El resultado NO alcanzó significancia estadística (${this._fmtP(pValor)} ≥ 0.05): los datos no aportan evidencia suficiente de una asociación ${tipoRelacion} en la población. `;
            texto += `Cabe precisar la lectura correcta de este hallazgo: la ausencia de evidencia de asociación no equivale a evidencia de ausencia de asociación. `;
        }

        // 5) Tamaño del efecto (Cohen, 1988) y varianza compartida
        texto += `En cuanto al tamaño del efecto, |${tipoCoef}| = ${this._fmtNum(coefAbs, 2)} se clasifica como ${this._benchmarkCohen(coefAbs)} según los puntos de corte de Cohen (1988: 0.10 pequeño, 0.30 mediano, 0.50 grande). `;
        if (esSpearman) {
            texto += `Asimismo, ρ² = ${this._fmtNum(r2, 3)} indica que las variables comparten aproximadamente el ${(r2 * 100).toFixed(1)}% de la varianza de sus RANGOS (al ser un índice basado en rangos, no debe leerse como varianza explicada en sentido lineal estricto). `;
        } else {
            texto += `Asimismo, el coeficiente de determinación r² = ${this._fmtNum(r2, 3)} indica que ${var1} y ${var2} comparten aproximadamente el ${(r2 * 100).toFixed(1)}% de su varianza; el ${(100 - r2 * 100).toFixed(1)}% restante obedece a otros factores no contemplados en este análisis bivariado. `;
        }

        // 6) Intervalo de confianza: precisión y coherencia con la decisión
        if (ic && Number.isFinite(ic.inferior) && Number.isFinite(ic.superior)) {
            const cruzaCero = ic.inferior <= 0 && ic.superior >= 0;
            if (cruzaCero) {
                texto += `El intervalo de confianza incluye el valor cero, lo que es coherente con la falta de significancia: no puede descartarse que la correlación poblacional sea nula. `;
            } else {
                texto += `El intervalo de confianza excluye el cero, de modo que incluso el escenario más conservador del intervalo sigue indicando una asociación ${direccion} en la población. `;
            }
        }

        // 7) Potencia post-hoc, especialmente informativa cuando no hay significancia
        if (poder !== null) {
            if (pValor >= 0.05 && poder < 0.8) {
                texto += `Adicionalmente, la potencia post-hoc estimada fue de ${(poder * 100).toFixed(0)}% (< 80%), por lo que no puede descartarse un error de Tipo II: con este tamaño muestral, un efecto real de esta magnitud podría haber pasado inadvertido.`;
            } else if (pValor >= 0.05) {
                texto += `Adicionalmente, la potencia post-hoc estimada fue de ${(poder * 100).toFixed(0)}%, de modo que el estudio tenía capacidad razonable para detectar el efecto si existiera; la no significancia resulta, por tanto, informativa.`;
            } else {
                texto += `La potencia post-hoc estimada fue de ${(poder * 100).toFixed(0)}%, lo que respalda la estabilidad del hallazgo.`;
            }
        }

        return texto;
    },

    // ========================================
    // INTERPRETACIONES DE PRUEBA DE HIPÓTESIS
    // ========================================

    generarInterpretacionHipotesis(var1, var2, resultado, prueba) {
        const coef = resultado.coeficiente;
        const pValor = resultado.pValor;
        const alpha = prueba.alpha;
        const n = resultado.n;
        const gl = Number.isFinite(resultado.gl) ? resultado.gl : (n - 2);
        const esSpearman = this._esSpearman(resultado.tipoCorrelacion);
        // Distinción muestral/poblacional: r y ρ estiman el parámetro poblacional
        const simboloPob = esSpearman ? 'ρₛ' : 'ρ';
        const simboloMuestral = esSpearman ? 'ρ' : 'r';
        const esBilateral = resultado.tipoPrueba !== 'unilateral';
        const coefAbs = Math.abs(coef);
        const poder = Number.isFinite(resultado.poder) ? resultado.poder : null;

        let texto = '';

        // 1) Planteamiento formal
        texto += `En el marco de la prueba de hipótesis se contrastó H₀: ${simboloPob} = 0 (la correlación poblacional entre ${var1} y ${var2} es nula) `;
        texto += esBilateral
            ? `frente a H₁: ${simboloPob} ≠ 0 (existe correlación, en cualquier dirección), mediante una prueba bilateral `
            : `frente a H₁ direccional (${simboloPob} ${coef >= 0 ? '>' : '<'} 0), mediante una prueba unilateral `;
        texto += `con un nivel de significancia α = ${alpha}. `;
        texto += `La regla de decisión fue: rechazar H₀ si p < α. `;

        // 2) Evidencia y decisión
        texto += `Con ${simboloMuestral}(${gl}) = ${this._fmtNum(coef)} y ${this._fmtP(pValor)}, `;

        if (prueba.decision === 'rechazar') {
            texto += `el p-valor resulta inferior al nivel de significancia (${this._fmtP(pValor)}, frente a α = ${alpha}), por lo que SE RECHAZA H₀. `;
            texto += `Se concluye que existe evidencia estadísticamente suficiente para afirmar que la correlación entre ${var1} y ${var2} en la población es distinta de cero. `;
            // Salvaguardas profesionales
            texto += `Dos precisiones son obligadas en un reporte riguroso. Primera: significancia estadística no equivale a relevancia práctica; la importancia del hallazgo debe juzgarse por el tamaño del efecto (|${simboloMuestral}| = ${this._fmtNum(coefAbs, 2)}) y no por el p-valor. `;
            texto += `Segunda: correlación no implica causalidad; este resultado documenta covariación sistemática, pero la dirección causal solo podría establecerse con un diseño experimental o longitudinal apropiado. `;
        } else {
            texto += `el p-valor no es inferior al nivel de significancia (${this._fmtP(pValor)}, frente a α = ${alpha}), por lo que NO SE RECHAZA H₀. `;
            texto += `Se concluye que no existe evidencia suficiente para afirmar que la correlación poblacional entre ${var1} y ${var2} sea distinta de cero. `;
            texto += `Conviene subrayar que esta decisión NO equivale a "aceptar" H₀: la prueba no demuestra que la correlación sea exactamente nula, solo que los datos no permiten descartarlo. `;

            if (coefAbs < 0.1) {
                texto += `De hecho, el coeficiente observado es prácticamente nulo, lo que sugiere ausencia de relación apreciable también en el plano descriptivo. `;
            } else {
                texto += `No obstante, el coeficiente observado (${simboloMuestral} = ${this._fmtNum(coef)}) describe una tendencia que la variabilidad muestral no permite generalizar; `;
                texto += poder !== null && poder < 0.8
                    ? `dado que la potencia post-hoc fue limitada (${(poder * 100).toFixed(0)}%), un estudio con mayor tamaño muestral podría esclarecer si esta tendencia constituye un efecto real (posible error de Tipo II). `
                    : `un estudio de replicación permitiría esclarecer si esta tendencia constituye un efecto real. `;
            }
        }

        // 3) Recomendaciones metodológicas según el tamaño muestral
        texto += `Para futuras investigaciones se recomienda `;
        if (n < 30) {
            texto += `aumentar el tamaño muestral (N actual = ${n}): por debajo de 30 casos el poder estadístico es reducido y las estimaciones del coeficiente resultan inestables. `;
        } else if (n < 100) {
            texto += `incrementar el tamaño muestral (N actual = ${n}) para ganar precisión en la estimación del parámetro poblacional y estrechar el intervalo de confianza. `;
        } else if (n < 200) {
            texto += `mantener o ampliar el tamaño muestral (N = ${n}), ya adecuado para análisis bivariados, si se planea escalar hacia modelos multivariados más exigentes. `;
        } else {
            texto += `aprovechar el tamaño muestral disponible (N = ${n}), que ofrece un poder estadístico excelente, para análisis más avanzados; con muestras grandes conviene además recordar que efectos diminutos pueden resultar significativos, por lo que el tamaño del efecto debe guiar la interpretación. `;
        }

        // 4) Líneas de profundización
        texto += esSpearman
            ? `Asimismo, se sugiere explorar posibles variables mediadoras o moderadoras, considerar transformaciones o métodos robustos si se desea modelar la relación, y triangular estos hallazgos cuantitativos con evidencia cualitativa para una comprensión más completa del fenómeno (Hernández-Sampieri y Mendoza, 2018).`
            : `Asimismo, se sugiere complementar con un análisis de regresión lineal (viable al cumplirse la normalidad), explorar posibles variables mediadoras o moderadoras, y triangular estos hallazgos cuantitativos con evidencia cualitativa para una comprensión más completa del fenómeno (Hernández-Sampieri y Mendoza, 2018).`;

        return texto;
    },

    // ========================================
    // MARCO METODOLÓGICO (prosa de investigación)
    // Movido desde el analizador: el analizador CALCULA, este módulo REDACTA.
    // Reciben todo por parámetro (sin estado), para poder usarse desde
    // cualquier parte y probarse de forma aislada.
    // ========================================

    generarPreguntaInvestigacion(var1, var2, unidadAnalisis, lugarContexto) {
        if (!unidadAnalisis || !lugarContexto) {
            return `¿Cuál es la relación entre ${var1} ${this._conj(var2)} ${var2}?`;
        }
        return `¿Cuál es la relación entre ${var1} ${this._conj(var2)} ${var2} en ${unidadAnalisis} de ${lugarContexto}?`;
    },

    generarObjetivoGeneral(var1, var2, unidadAnalisis, lugarContexto) {
        if (!unidadAnalisis || !lugarContexto) {
            return `Determinar la relación entre ${var1} ${this._conj(var2)} ${var2}.`;
        }
        return `Determinar la relación entre ${var1} ${this._conj(var2)} ${var2} en ${unidadAnalisis} de ${lugarContexto}.`;
    },

    // dimensiones1/dimensiones2: objetos {nombreDimension: ...} o arreglos de
    // nombres, o null. opciones (opcional): { unidadAnalisis, lugarContexto,
    // sociodemograficos: ['Sexo', 'Grado académico', ...] }.
    // Redacción profesional: verbos académicos rotativos (taxonomía de objetivos),
    // correlacionales (dimensión ↔ variable general, en ambas direcciones) y
    // comparativos según variables sociodemográficas.
    _VERBOS_CORRELACIONALES: ['Identificar', 'Establecer', 'Precisar', 'Determinar', 'Indicar', 'Examinar'],

    _nombresDe(dimensiones) {
        if (!dimensiones) return [];
        return Array.isArray(dimensiones) ? dimensiones.slice() : Object.keys(dimensiones);
    },

    generarObjetivosEspecificos(var1, var2, dimensiones1, dimensiones2, opciones = {}) {
        const dims1 = this._nombresDe(dimensiones1);
        const dims2 = this._nombresDe(dimensiones2);
        const contexto = (opciones.unidadAnalisis && opciones.lugarContexto)
            ? ` en ${opciones.unidadAnalisis} de ${opciones.lugarContexto}`
            : '';
        const objetivos = [];
        let v = 0;
        const verbo = () => this._VERBOS_CORRELACIONALES[(v++) % this._VERBOS_CORRELACIONALES.length];

        // 1) Correlacionales: cada dimensión de una variable con la OTRA variable
        //    (estructura estándar de tesis: dimensión → constructo general).
        dims1.forEach(d => {
            objetivos.push(`${verbo()} la relación entre la dimensión ${d} de ${var1} ${this._conj(var2)} ${var2}${contexto}.`);
        });
        dims2.forEach(d => {
            objetivos.push(`${verbo()} la relación entre la dimensión ${d} de ${var2} ${this._conj(var1)} ${var1}${contexto}.`);
        });
        if (dims1.length === 0 && dims2.length === 0) {
            objetivos.push(`Establecer el vínculo entre ${var1} ${this._conj(var2)} ${var2}${contexto}.`);
        }

        // 2) Comparativos: diferencias según variables sociodemográficas.
        const socios = (opciones.sociodemograficos || []).filter(s => !!s);
        socios.forEach((s, i) => {
            const verboComp = i % 2 === 0 ? 'Analizar las diferencias' : 'Comparar los niveles';
            objetivos.push(`${verboComp} de ${var1} ${this._conj(var2)} ${var2} según ${s.toLowerCase()}${contexto}.`);
        });

        return objetivos;
    },

    // Resumen profesional del proceso de criba (selección de objetivos por datos).
    // criba: salida de CribaCorrelaciones.cribar.
    generarResumenCriba(criba) {
        const validos = criba.evaluados.filter(e => e.valido);
        const superan = validos.filter(e => e.superaUmbral);
        const sel = criba.seleccionados;
        let t = `Se evaluaron ${validos.length} pares candidatos. `;
        if (superan.length === 0) {
            t += `Ninguno alcanzó el umbral mínimo de |r| ≥ ${criba.umbral.toFixed(2)} (Cohen, 1988), por lo que no se formularon objetivos específicos correlacionales: con estos datos, las dimensiones no muestran asociaciones de magnitud reportable con la variable de contraste.`;
            return t;
        }
        t += `${superan.length} superaron el umbral de |r| ≥ ${criba.umbral.toFixed(2)} (Cohen, 1988)`;
        if (superan.length > sel.length) {
            t += ` y, por el criterio de parsimonia configurado (máximo ${criba.maximo}), se priorizaron los ${sel.length} de mayor magnitud absoluta`;
        }
        t += `: ${sel.map(s => `${s.etiquetaX} ↔ ${s.etiquetaY} (${this._esSpearman(s.metodo) ? 'ρ' : 'r'} = ${s.coeficiente.toFixed(3)})`).join('; ')}. `;
        t += `El signo del coeficiente indica la dirección (positiva = directa; negativa = inversa); la selección se hizo por magnitud absoluta, de modo que las relaciones inversas compiten en igualdad de condiciones.`;
        return t;
    },

    // Resumen profesional del análisis por dimensiones: cuántos objetivos
    // específicos correlacionales se confirmaron, rango de coeficientes y
    // dimensión con la asociación más fuerte.
    // filas: [{ etiquetaDimension, coeficiente, pValor, significativa, fuerza, tipoCorrelacion }]
    generarResumenDimensiones(etiquetaObjetivo, filas) {
        if (!filas || filas.length === 0) return '';
        const sig = filas.filter(f => f.significativa);
        const abs = filas.map(f => Math.abs(f.coeficiente));
        const minC = Math.min(...abs), maxC = Math.max(...abs);
        const masFuerte = filas.reduce((a, b) => Math.abs(b.coeficiente) > Math.abs(a.coeficiente) ? b : a);

        let t = `En síntesis, de las ${filas.length} dimensiones analizadas en relación con ${etiquetaObjetivo}, `;
        if (sig.length === filas.length) {
            t += `TODAS presentaron una correlación estadísticamente significativa, `;
        } else if (sig.length === 0) {
            t += `NINGUNA alcanzó significancia estadística, `;
        } else {
            t += `${sig.length} presentaron una correlación estadísticamente significativa y ${filas.length - sig.length} no, `;
        }
        t += `con coeficientes cuya magnitud absoluta osciló entre ${minC.toFixed(3)} y ${maxC.toFixed(3)}. `;
        t += `La asociación más fuerte correspondió a la dimensión ${masFuerte.etiquetaDimension} `;
        t += `(${this._esSpearman(masFuerte.tipoCorrelacion) ? 'ρ' : 'r'} = ${masFuerte.coeficiente.toFixed(3)}, ${this._fmtP(masFuerte.pValor)}, magnitud ${masFuerte.fuerza}). `;
        if (sig.length > 0 && sig.length < filas.length) {
            t += `Este patrón diferencial es informativo en sí mismo: sugiere que la relación con ${etiquetaObjetivo} no es homogénea entre los componentes del constructo, lo que conviene retomar en la discusión. `;
        }
        t += `Cada resultado responde a su objetivo específico correspondiente y debe reportarse con su tabla y su interpretación individual.`;
        return t;
    },

    generarHipotesis(var1, var2, unidadAnalisis, lugarContexto) {
        let contexto = '';
        if (unidadAnalisis && lugarContexto) {
            contexto = ` en ${unidadAnalisis} de ${lugarContexto}`;
        }
        return {
            hipotesisInvestigador: `Existe una relación estadísticamente significativa entre ${var1} ${this._conj(var2)} ${var2}${contexto}.`,
            hipotesisNula: `No existe una relación estadísticamente significativa entre ${var1} ${this._conj(var2)} ${var2}${contexto}.`,
            hipotesisAlterna: `Sí existe una relación estadísticamente significativa entre ${var1} ${this._conj(var2)} ${var2}${contexto}.`
        };
    },

    // opciones: { dimensiones1, dimensiones2, configuracion }
    generarMarcoMetodologico(var1, var2, unidadAnalisis, lugarContexto, opciones = {}) {
        return {
            preguntaInvestigacion: this.generarPreguntaInvestigacion(var1, var2, unidadAnalisis, lugarContexto),
            objetivoGeneral: this.generarObjetivoGeneral(var1, var2, unidadAnalisis, lugarContexto),
            objetivosEspecificos: this.generarObjetivosEspecificos(
                var1, var2,
                opciones.dimensiones1 || null,
                opciones.dimensiones2 || null,
                { unidadAnalisis, lugarContexto, sociodemograficos: opciones.sociodemograficos || [] }
            ),
            hipotesis: this.generarHipotesis(var1, var2, unidadAnalisis, lugarContexto),
            configuracion: opciones.configuracion || null
        };
    },

    // ========================================
    // DISCUSIÓN PROFESIONAL (plantilla para tesis)
    // resultado: salida de calcularCorrelacion; pruebaHip: salida de pruebaHipotesis.
    // ========================================

    generarDiscusion(var1, var2, resultado, pruebaHip, unidadAnalisis, lugarContexto, opciones = {}) {
        // Si el llamador ya construyó el marco (p. ej. con dimensiones reales y
        // objetivos comparativos), se reutiliza para mantener UNA sola versión.
        const marco = opciones.marco || this.generarMarcoMetodologico(var1, var2, unidadAnalisis, lugarContexto, opciones);
        const esSpearman = this._esSpearman(resultado.tipoCorrelacion);
        const nombreMetodo = esSpearman ? 'Spearman (ρ)' : 'Pearson (r)';
        const simbolo = esSpearman ? 'ρ' : 'r';
        const gl = Number.isFinite(resultado.gl) ? resultado.gl : (resultado.n - 2);
        const coefAbs = Math.abs(resultado.coeficiente);
        const r2 = Number.isFinite(resultado.r2) ? resultado.r2 : resultado.coeficiente * resultado.coeficiente;
        const ic = resultado.intervaloConfianza || null;
        const poder = Number.isFinite(resultado.poder) ? resultado.poder : null;
        const n1 = resultado.normalidad1, n2 = resultado.normalidad2;
        const simNorm = norm => (norm.prueba && norm.prueba.includes('Shapiro')) ? 'W' : 'D';

        let contexto = '';
        if (unidadAnalisis && lugarContexto) {
            contexto = ` en ${unidadAnalisis} de ${lugarContexto}`;
        }

        let d = '';

        // Sección 1: Marco de la investigación
        d += `**MARCO DE INVESTIGACIÓN**\n\n`;
        d += `**Pregunta de Investigación:**\n${marco.preguntaInvestigacion}\n\n`;
        d += `**Objetivo General:**\n${marco.objetivoGeneral}\n\n`;
        if (marco.objetivosEspecificos.length > 0) {
            d += `**Objetivos Específicos:**\n`;
            marco.objetivosEspecificos.forEach((obj, idx) => { d += `${idx + 1}. ${obj}\n`; });
            d += '\n';
        }
        d += `**Hipótesis de Investigación:**\n${marco.hipotesis.hipotesisInvestigador}\n\n`;
        d += `**Hipótesis Nula (H₀):**\n${marco.hipotesis.hipotesisNula}\n\n`;
        d += `**Hipótesis Alterna (H₁):**\n${marco.hipotesis.hipotesisAlterna}\n\n`;

        // Sección 2: Metodología
        d += `---\n\n**METODOLOGÍA ESTADÍSTICA**\n\n`;
        d += `El análisis correlacional se realizó mediante el coeficiente de ${nombreMetodo}, seleccionado a partir de las pruebas de normalidad. `;
        if (n1.normal && n2.normal) {
            d += `Ambas variables cumplieron el supuesto de normalidad (${var1}: ${simNorm(n1)} = ${this._fmtNum(n1.estadistico)}, ${this._fmtP(n1.pValor)}; ${var2}: ${simNorm(n2)} = ${this._fmtNum(n2.estadistico)}, ${this._fmtP(n2.pValor)}; criterio p > 0.05), lo que habilita la estadística paramétrica y el análisis de la relación LINEAL entre las variables.\n\n`;
        } else {
            d += `Al menos una variable se desvió significativamente de la normalidad (${var1}: ${this._fmtP(n1.pValor)}; ${var2}: ${this._fmtP(n2.pValor)}; criterio p > 0.05), por lo que se optó por el método no paramétrico basado en rangos, que evalúa la relación MONOTÓNICA entre las variables.\n\n`;
        }
        d += `Se estableció un nivel de significancia de α = ${pruebaHip.alpha}, mediante una prueba ${resultado.tipoPrueba === 'unilateral' ? 'unilateral' : 'bilateral'}.\n\n`;

        // Sección 3: Resultados
        d += `---\n\n**RESULTADOS**\n\n`;
        d += `El análisis arrojó ${simbolo}(${gl}) = ${this._fmtNum(resultado.coeficiente)}, ${this._fmtP(resultado.pValor)} (N = ${resultado.n})`;
        if (ic && Number.isFinite(ic.inferior) && Number.isFinite(ic.superior)) {
            d += `, IC ${Math.round((ic.nivel || 0.95) * 100)}% [${this._fmtNum(ic.inferior)}, ${this._fmtNum(ic.superior)}]`;
        }
        d += `. `;

        if (pruebaHip.decision === 'rechazar') {
            d += `Dado que el p-valor es inferior a α (${this._fmtP(resultado.pValor)} frente a α = ${pruebaHip.alpha}), se rechaza la hipótesis nula: **existe una relación estadísticamente significativa** entre ${var1} y ${var2}${contexto}.\n\n`;
            d += `La magnitud corresponde a una correlación **${resultado.interpretacion.fuerza}** de dirección **${resultado.interpretacion.direccion}** (tamaño del efecto ${this._benchmarkCohen(coefAbs)} según Cohen, 1988), lo que indica que ${resultado.interpretacion.direccion === 'positiva'
                ? 'a medida que aumenta una variable, la otra tiende a aumentar'
                : 'a medida que aumenta una variable, la otra tiende a disminuir'}. `;
            d += esSpearman
                ? `El coeficiente al cuadrado (ρ² = ${this._fmtNum(r2)}) indica que las variables comparten aproximadamente el ${(r2 * 100).toFixed(1)}% de la varianza de sus rangos.\n\n`
                : `El coeficiente de determinación (r² = ${this._fmtNum(r2)}) indica que las variables comparten aproximadamente el ${(r2 * 100).toFixed(1)}% de su varianza.\n\n`;
        } else {
            d += `Dado que el p-valor no es inferior a α (${this._fmtP(resultado.pValor)} frente a α = ${pruebaHip.alpha}), no se rechaza la hipótesis nula: **no existe evidencia suficiente** de una relación estadísticamente significativa entre ${var1} y ${var2}${contexto}. `;
            d += `Cabe recordar que no rechazar H₀ no equivale a demostrar que la correlación poblacional sea nula`;
            d += (poder !== null && poder < 0.8)
                ? `; de hecho, la potencia post-hoc estimada fue de ${(poder * 100).toFixed(0)}% (< 80%), por lo que no puede descartarse un error de Tipo II.\n\n`
                : `.\n\n`;
        }

        // Sección 4: Interpretación y Discusión (plantilla con espacios para el marco teórico)
        d += `---\n\n**DISCUSIÓN E INTERPRETACIÓN**\n\n`;
        if (pruebaHip.decision === 'rechazar') {
            d += `Los hallazgos confirman la hipótesis de investigación planteada. `;
            d += `Este resultado puede interpretarse en el contexto de [MARCO TEÓRICO]. `;
            d += `Según [AUTOR] ([AÑO]), [CONCEPTO TEÓRICO RELACIONADO].\n\n`;
            d += `La relación ${resultado.interpretacion.direccion} observada sugiere que [INTERPRETACIÓN TEÓRICA]. `;
            d += `Esto coincide con lo reportado por [AUTOR] ([AÑO]), quien encontró [HALLAZGO SIMILAR]. `;
            d += `Conviene recordar que, al tratarse de un diseño correlacional, la covariación documentada no permite establecer relaciones de causalidad.\n\n`;
        } else {
            d += `La ausencia de una relación estadísticamente significativa puede explicarse por diversos factores, incluyendo [POSIBLES EXPLICACIONES]. `;
            d += `Este resultado contrasta con [AUTOR] ([AÑO]), quien reportó [HALLAZGO DIFERENTE]. `;
            d += `Las diferencias metodológicas, contextuales o muestrales podrían explicar esta discrepancia.\n\n`;
        }

        d += `**Implicaciones:**\n- [IMPLICACIÓN TEÓRICA]\n- [IMPLICACIÓN PRÁCTICA]\n- [IMPLICACIÓN METODOLÓGICA]\n\n`;
        d += `**Limitaciones del estudio:**\n- [LIMITACIÓN MUESTRAL/METODOLÓGICA]\n- [LIMITACIÓN DE GENERALIZACIÓN]\n- El diseño correlacional de corte transversal no permite inferencias causales.\n\n`;
        d += `**Recomendaciones para futuras investigaciones:**\n- [RECOMENDACIÓN 1]\n- [RECOMENDACIÓN 2]\n`;

        return d;
    },

    // ========================================
    // COMPARACIÓN DE GRUPOS (movido desde app.js)
    // resultado: salida de la comparación (descriptivas1/2, etiquetas, prueba,
    // tamanoEfecto, decision).
    // ========================================

    generarInterpretacionComparacion(varCuantitativa, varAgrupacion, resultado) {
        const significativa = resultado.decision === 'rechazar';
        const d1 = resultado.descriptivas1;
        const d2 = resultado.descriptivas2;
        const grupoMayor = d1.media >= d2.media ? resultado.etiqueta1 : resultado.etiqueta2;
        const prueba = resultado.prueba;
        const ef = resultado.tamanoEfecto;
        const pTexto = this._fmtP(prueba.pValor);

        if (significativa) {
            return `Existe una diferencia estadísticamente significativa en ${varCuantitativa} entre los grupos de ${varAgrupacion} (${prueba.prueba}, ${pTexto}). El grupo "${grupoMayor}" presenta la media más alta. La magnitud de la diferencia es de tamaño ${ef.interpretacion} (d de Cohen = ${ef.d.toFixed(2)}). Una diferencia significativa no implica causalidad cuando los grupos no se asignaron al azar.`;
        }
        return `No se hallaron diferencias estadísticamente significativas en ${varCuantitativa} entre los grupos de ${varAgrupacion} (${prueba.prueba}, ${pTexto}); el tamaño del efecto es ${ef.interpretacion} (d de Cohen = ${ef.d.toFixed(2)}). Un resultado no significativo no demuestra la igualdad de los grupos: podría deberse a un tamaño muestral insuficiente para detectar la diferencia.`;
    }
};

// Exportar para uso global
if (typeof window !== 'undefined') {
    window.InterpretacionesEstadisticas = InterpretacionesEstadisticas;
}
