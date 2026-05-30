// ========================================
// MÓDULO DE INTERPRETACIONES ESTADÍSTICAS
// Sistema de interpretación dinámica basada en resultados
// ========================================

const InterpretacionesEstadisticas = {

    // ========================================
    // INTERPRETACIONES DE NORMALIDAD
    // ========================================

    generarInterpretacionNormalidad(var1, var2, resultado) {
        const n = resultado.n;
        const norm1 = resultado.normalidad1;
        const norm2 = resultado.normalidad2;

        let interpretacion = '';

        // Determinar qué prueba se usó
        const prueba = norm1.prueba; // Ambas deberían usar la misma prueba
        const razonPrueba = n >= 50 ? 'n ≥ 50' : 'n < 50';

        // Símbolo del estadístico según la prueba: W para Shapiro-Wilk,
        // D para Kolmogorov-Smirnov.
        const simbolo = norm => (norm.prueba && norm.prueba.includes('Shapiro')) ? 'W' : 'D';

        // Introducción metodológica
        interpretacion += `Se evaluó el supuesto de normalidad mediante ${prueba} (${razonPrueba}) para ${var1} y ${var2}. `;

        // Evaluar cada variable
        if (!norm1.normal && !norm2.normal) {
            // Ambas no normales
            interpretacion += `Ambas variables presentaron distribuciones no normales (${var1}: ${simbolo(norm1)}=${norm1.estadistico.toFixed(4)}, p=${norm1.pValor.toFixed(3)}; ${var2}: ${simbolo(norm2)}=${norm2.estadistico.toFixed(4)}, p=${norm2.pValor.toFixed(3)}), incumpliendo el supuesto para estadística paramétrica. `;
            interpretacion += `Por tanto, se empleó el coeficiente de correlación de Spearman (ρ) como método robusto no paramétrico. `;
            interpretacion += `Según Hernández-Sampieri y Mendoza (2023), cuando los datos no cumplen con el criterio de normalidad, los métodos no paramétricos son más apropiados para evitar conclusiones erróneas.`;
        } else if (!norm1.normal || !norm2.normal) {
            // Solo una no normal
            const varNoNormal = !norm1.normal ? var1 : var2;
            const normData = !norm1.normal ? norm1 : norm2;
            const varNormal = norm1.normal ? var1 : var2;

            interpretacion += `${varNoNormal} presentó distribución no normal (${simbolo(normData)}=${normData.estadistico.toFixed(4)}, p=${normData.pValor.toFixed(3)}), mientras que ${varNormal} cumplió con el supuesto de normalidad. `;
            interpretacion += `Dado que al menos una variable no cumple el supuesto de normalidad, se optó por el coeficiente de correlación de Spearman (ρ), `;
            interpretacion += `garantizando así la robustez del análisis ante desviaciones de la normalidad (Cohen, 2013).`;
        } else {
            // Ambas normales
            interpretacion += `Ambas variables cumplieron con el supuesto de normalidad (${var1}: p=${norm1.pValor.toFixed(3)}; ${var2}: p=${norm2.pValor.toFixed(3)}), `;
            interpretacion += `lo cual justifica el uso de estadística paramétrica mediante el coeficiente de correlación de Pearson (r). `;
            interpretacion += `Este método es óptimo cuando se satisfacen los supuestos de normalidad, ofreciendo mayor potencia estadística (Taherdoost, 2022).`;
        }

        return interpretacion;
    },

    // ========================================
    // INTERPRETACIONES DE CORRELACIÓN
    // ========================================

    generarInterpretacionCorrelacion(var1, var2, resultado) {
        const coef = resultado.coeficiente;
        const pValor = resultado.pValor;
        const n = resultado.n;
        const tipoCoef = resultado.tipoCorrelacion === 'Pearson' ? 'r' : 'ρ';
        const fuerza = resultado.interpretacion.fuerza;
        const direccion = resultado.interpretacion.direccion;

        let interpretacion = '';

        // Presentación de resultados
        interpretacion += `Se evaluó la correlación entre ${var1} y ${var2} (N=${n}). `;

        // Mención del método usado
        if (resultado.tipoCorrelacion === 'Spearman') {
            interpretacion += `El sistema detectó que al menos una variable no cumple con la normalidad, ejecutando Spearman como corresponde metodológicamente. `;
        } else {
            interpretacion += `Ambas variables cumplieron con el supuesto de normalidad, por lo que se aplicó el coeficiente de Pearson. `;
        }

        // Interpretación del coeficiente
        const coefAbs = Math.abs(coef);

        if (coefAbs < 0.1) {
            interpretacion += `El coeficiente ${tipoCoef} = ${coef.toFixed(4)} denota una asociación ${direccion} mínima (prácticamente nula), `;
        } else if (coefAbs < 0.3) {
            interpretacion += `El coeficiente ${tipoCoef} = ${coef.toFixed(4)} indica una correlación ${fuerza} de dirección ${direccion}, `;
        } else if (coefAbs < 0.5) {
            interpretacion += `El coeficiente ${tipoCoef} = ${coef.toFixed(4)} revela una asociación ${fuerza} de carácter ${direccion}, `;
        } else if (coefAbs < 0.7) {
            interpretacion += `El coeficiente ${tipoCoef} = ${coef.toFixed(4)} evidencia una correlación ${fuerza} y ${direccion}, `;
        } else {
            interpretacion += `El coeficiente ${tipoCoef} = ${coef.toFixed(4)} demuestra una asociación ${fuerza} muy marcada de tipo ${direccion}, `;
        }

        // Interpretación del p-valor
        if (pValor >= 0.05) {
            interpretacion += `y el p-valor = ${pValor.toFixed(4)} (≥ 0.05) confirma que esta relación no es estadísticamente significativa. `;
            interpretacion += `Por tanto, se concluye que no existe evidencia de correlación sistemática entre ${var1} y ${var2} en la población estudiada. `;
            interpretacion += `Este resultado sugiere que las variaciones en una variable no predicen cambios en la otra de manera confiable.`;
        } else if (pValor >= 0.01) {
            interpretacion += `siendo el p-valor = ${pValor.toFixed(4)} (< 0.05) estadísticamente significativo al nivel convencional. `;
            interpretacion += `Esto implica que existe evidencia moderada de una relación sistemática entre ${var1} y ${var2}. `;

            if (direccion === 'positiva') {
                interpretacion += `La dirección positiva indica que incrementos en ${var1} tienden a asociarse con incrementos en ${var2}.`;
            } else {
                interpretacion += `La dirección negativa sugiere que incrementos en ${var1} se asocian con decrementos en ${var2}.`;
            }
        } else {
            interpretacion += `con un p-valor = ${pValor.toFixed(4)} (< 0.01) altamente significativo. `;
            interpretacion += `Existe evidencia sólida de una relación estadísticamente significativa entre ${var1} y ${var2}. `;

            if (direccion === 'positiva') {
                interpretacion += `La correlación positiva indica que ambas variables varían en la misma dirección: cuando una aumenta, la otra tiende a aumentar proporcionalmente.`;
            } else {
                interpretacion += `La correlación negativa indica una relación inversa: cuando ${var1} aumenta, ${var2} tiende a disminuir de forma sistemática.`;
            }
        }

        // Tamaño del efecto (interpretación práctica)
        interpretacion += ` En términos del tamaño del efecto según Cohen (2013), esta correlación se clasifica como ${fuerza}, `;

        if (coefAbs < 0.1) {
            interpretacion += `sugiriendo que el vínculo entre las variables tiene escasa relevancia práctica para predicción o intervención.`;
        } else if (coefAbs < 0.3) {
            interpretacion += `lo que implica que aproximadamente ${(coefAbs * coefAbs * 100).toFixed(1)}% de la varianza en ${var2} puede explicarse por ${var1}.`;
        } else if (coefAbs < 0.5) {
            interpretacion += `explicando aproximadamente ${(coefAbs * coefAbs * 100).toFixed(1)}% de la varianza compartida, lo que tiene implicaciones prácticas moderadas.`;
        } else {
            interpretacion += `indicando que ${(coefAbs * coefAbs * 100).toFixed(1)}% de la variabilidad en ${var2} se asocia con ${var1}, lo cual tiene sustancial relevancia práctica.`;
        }

        return interpretacion;
    },

    // ========================================
    // INTERPRETACIONES DE PRUEBA DE HIPÓTESIS
    // ========================================

    generarInterpretacionHipotesis(var1, var2, resultado, prueba) {
        const coef = resultado.coeficiente; // Coeficiente de correlación
        const pValor = resultado.pValor; // Valor p obtenido
        const alpha = prueba.alpha; // Nivel de significancia
        const n = resultado.n; // Tamaño de la muestra
        const tipoCoef = resultado.tipoCorrelacion === 'Pearson' ? 'r' : 'ρ'; // Tipo de coeficiente

        let interpretacion = '';

        // Marco de la prueba de hipótesis
        interpretacion += `En el marco de la prueba de hipótesis, se planteó H₀: ${tipoCoef} = 0 (no existe correlación) versus H₁: ${tipoCoef} ≠ 0 (existe correlación) `;
        interpretacion += `con un nivel de significancia α = ${alpha}. `;

        // Presentación del estadístico y decisión
        interpretacion += `Con ${tipoCoef} = ${coef.toFixed(4)} y p = ${pValor.toFixed(4)}, `;

        if (prueba.decision === 'rechazar') {
            // Rechazar H0
            interpretacion += `la comparación ${pValor.toFixed(4)} < ${alpha} conduce a rechazar H₀. `;
            interpretacion += `Formalmente, se concluye que existe evidencia estadísticamente suficiente para afirmar que la correlación entre ${var1} y ${var2} `;
            interpretacion += `en la población es significativamente diferente de cero. `;
            // Este procedimiento 
            interpretacion += `Esta decisión, reportada con el estadístico (${tipoCoef} = ${coef.toFixed(4)}), p-valor (p = ${pValor.toFixed(4)}) y comparación (p < α), `;
            interpretacion += `cumple con los estándares de la metodología de la investigación propuestos por Hernández Sampieri y colaboradores. `;

            // Advertencia sobre causalidad
            interpretacion += `Es fundamental destacar que correlación no implica causalidad; este hallazgo indica asociación sistemática, pero no establece dirección causal sin un diseño experimental apropiado.`;

        } else {
            // No rechazar H0
            interpretacion += `la comparación ${pValor.toFixed(4)} ≥ ${alpha} conduce a NO rechazar H₀. `;
            interpretacion += `Formalmente, se concluye que no existe evidencia suficiente para afirmar que la correlación entre ${var1} y ${var2} `;
            interpretacion += `en la población sea diferente de cero. `;

            interpretacion += `Esta decisión, reportada con el estadístico (${tipoCoef} = ${coef.toFixed(4)}), p-valor (p = ${pValor.toFixed(4)}) y comparación (p ≥ α), `;
            interpretacion += `cumple con los estándares de la metodología de la investigación propuestos por Hernández Sampieri y colaboradores. `;

            // Interpretación de "no significativo"
            const coefAbs = Math.abs(coef);
            if (coefAbs < 0.1) {
                interpretacion += `El coeficiente cercano a cero sugiere ausencia práctica de relación lineal o monotónica entre las variables.`;
            } else {
                interpretacion += `Aunque se observa una tendencia (${tipoCoef} = ${coef.toFixed(4)}), la variabilidad muestral no permite generalizar esta asociación a la población con confianza.`;
            }
        }

        // Recomendaciones metodológicas
        interpretacion += ` Para futuras investigaciones, se recomienda `;

        // Recomendaciones basadas en el tamaño de la muestra (N)
        if (n < 30) {
            interpretacion += `aumentar el tamaño muestral (N actual = ${n}), ya que muestras pequeñas tienen menor poder estadístico para detectar efectos reales. `;
        } else if (n < 100) {
            interpretacion += `considerar incrementar el tamaño muestral para mayor precisión en la estimación del parámetro poblacional. `;
        } else if (n < 200) {
            // Muestra adecuada: Suficiente, pero se podría mejorar
            interpretacion += `considerar incrementar más el tamaño muestral para modelos multivariados más complejos. `;
        } else if (n < 500) {
            // Muestra grande: Generalmente robusta
            interpretacion += `el uso de análisis avanzados ya que el tamaño muestral (N = ${n}) proporciona un excelente poder estadístico y estabilidad en las estimaciones. `;
        } else {
            // Muestra muy grande: Excelente poder, atención a la eficiencia
            interpretacion += `prestar atención al ejecutar pruebas más complejas, el tamaño muestral (N = ${n}) es muy grande y esto garantiza un poder estadístico óptimo. `;
        }

        if (prueba.decision !== 'rechazar' && Math.abs(coef) > 0.2) {
            interpretacion += `Dado que el coeficiente observado sugiere una tendencia, un estudio con mayor potencia estadística podría revelar significancia. `;
        }

        interpretacion += `Asimismo, se sugiere complementar con análisis de regresión, explorar posibles variables mediadoras o moderadoras, `;
        interpretacion += `y triangular estos hallazgos cuantitativos con métodos cualitativos para una comprensión más holística del problema.`;

        return interpretacion;
    }
};

// Exportar para uso global
if (typeof window !== 'undefined') {
    window.InterpretacionesEstadisticas = InterpretacionesEstadisticas;
}
