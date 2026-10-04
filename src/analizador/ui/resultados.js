// analizador/ui/resultados.js — presentación de resultados: normalidad, correlación, decisión, discusión, fiabilidad, comparación, dispersión, regresión.
// Origen: analizador-ui.js (Fase 3), sin cambios de comportamiento; dependencias explícitas.

import { AnalizadorEstadistico } from '../estadistica.js';
import { Fiabilidad } from '../fiabilidad.js';
import { ScientificCharts } from '../graficas.js';
import { InterpretacionesEstadisticas } from '../interpretaciones.js';
import { bloqueApaComparacionHTML, conectarCopiaComparacion, fmtPApp, interpretarComparacion, interpretarCramerV, lineaApaComparacion } from './analisis.js';
import { desplazarHacia } from '../../shared/tabla-datos.js';
import { mostrarToast } from '../../shared/toast.js';

function mostrarChiCuadrado(var1, var2, resultado) {
    const container = document.getElementById('resultadosChiCuadrado');
    if (!container) return;
    const significativa = resultado.decision === 'rechazar';
    // Tabla de contingencia (frecuencias observadas con totales)
    const encabezado = `<tr><th>${var1} \\ ${var2}</th>${resultado.categorias2.map(c => `<th>${c}</th>`).join('')}<th>Total</th></tr>`;
    const filas = resultado.observadas.map((fila, i) =>
        `<tr><td><strong>${resultado.categorias1[i]}</strong></td>${fila.map(o => `<td>${o}</td>`).join('')}<td><strong>${resultado.totalFila[i]}</strong></td></tr>`
    ).join('');
    const totalFinal = `<tr><td><strong>Total</strong></td>${resultado.totalColumna.map(t => `<td><strong>${t}</strong></td>`).join('')}<td><strong>${resultado.n}</strong></td></tr>`;
    const avisoEsperadas = resultado.esperadasBajas > 0
        ? `<p class="result-subtitle" style="color: #b45309; margin-top: 0.5rem;">⚠️ ${resultado.esperadasBajas} casilla(s) tienen una frecuencia esperada menor que 5; la prueba de chi-cuadrado puede no ser fiable (considera la prueba exacta de Fisher).</p>`
        : '';
    const pTexto = resultado.pValor < 0.001 ? 'p < .001' : 'p = ' + resultado.pValor.toFixed(3).replace(/^0/, '');
    const interpretacion = significativa
        ? `Existe una asociación estadísticamente significativa entre ${var1} y ${var2} (χ²(${resultado.gl}) = ${resultado.chiCuadrado.toFixed(2)}, ${pTexto}). La V de Cramér (${resultado.cramerV.toFixed(3)}) indica una ${interpretarCramerV(resultado.cramerV)}. Las dos variables no son independientes.`
        : `No se halló una asociación estadísticamente significativa entre ${var1} y ${var2} (χ²(${resultado.gl}) = ${resultado.chiCuadrado.toFixed(2)}, ${pTexto}); las variables pueden considerarse independientes.`;
    container.innerHTML = `
        <div class="result-section">
            <h3 class="section-title">Asociación de Variables Categóricas (Chi-cuadrado)</h3>
            <p class="result-subtitle">Prueba de independencia entre <strong>${var1}</strong> y <strong>${var2}</strong>. Evalúa si las dos variables categóricas están asociadas; la V de Cramér mide la fuerza de la asociación.</p>
            <div class="result-box" style="overflow-x: auto;">
                <h5 style="margin-bottom: 0.5rem; font-weight: 600;">Tabla de contingencia (frecuencias observadas)</h5>
                <table class="result-table">
                    ${encabezado}
                    ${filas}
                    ${totalFinal}
                </table>
                ${avisoEsperadas}
            </div>
            <div class="result-box">
                <table class="result-table">
                    <tr><td>Chi-cuadrado de Pearson:</td><td><strong>χ²(${resultado.gl}) = ${resultado.chiCuadrado.toFixed(3)}</strong></td></tr>
                    <tr><td>p-valor:</td><td><strong>${fmtPApp(resultado.pValor)}</strong></td></tr>
                    <tr><td>V de Cramér (tamaño del efecto):</td><td><strong>${resultado.cramerV.toFixed(3)}</strong> (${interpretarCramerV(resultado.cramerV)})</td></tr>
                    <tr><td>N:</td><td>${resultado.n}</td></tr>
                    <tr><td>Decisión sobre H₀:</td><td class="${significativa ? 'decision-reject' : 'decision-accept'}"><strong>${significativa ? 'SE RECHAZA H₀' : 'NO SE RECHAZA H₀'}</strong></td></tr>
                </table>
            </div>
            <div class="result-box interpretation-box interpretation-box--hipotesis">
                <h5 class="interpretation-title">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" focusable="false"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z"/></svg>
                    Interpretación
                </h5>
                <p class="interpretation-text">${interpretacion}</p>
            </div>
        </div>`;
    container.style.display = 'block';
    desplazarHacia(container);
}

function mostrarMarcoMetodologico(marco, analisisDimensionesHTML) {
    const container = document.getElementById('marcoMetodologicoContainer');
    if (!container) {
        console.warn('No existe elemento #marcoMetodologicoContainer en el HTML');
        return;
    }
    let html = `
        <div class="result-section">
            <h3 class="section-title">📋 Marco Metodológico</h3>
            
            <div class="result-box">
                <h4 class="result-subtitle">❓ Pregunta de Investigación</h4>
                <p class="marco-text">${marco.preguntaInvestigacion}</p>
            </div>
            
            <div class="result-box">
                <h4 class="result-subtitle">🎯 Objetivo General</h4>
                <p class="marco-text">${marco.objetivoGeneral}</p>
            </div>
            
            <div class="result-box">
                <h4 class="result-subtitle">📋 Objetivos Específicos</h4>
                <ol class="marco-list">
                    ${marco.objetivosEspecificos.map(obj => `<li>${obj}</li>`).join('')}
                </ol>
                ${analisisDimensionesHTML || ''}
            </div>
            
            <div class="result-box">
                <h4 class="result-subtitle">💡 Hipótesis de Investigación (H₁)</h4>
                <p class="marco-text">${marco.hipotesis.hipotesisInvestigador}</p>
            </div>
            
            <div class="result-box">
                <h4 class="result-subtitle">❌ Hipótesis Nula (H₀)</h4>
                <p class="marco-text">${marco.hipotesis.hipotesisNula}</p>
            </div>
            ${marco.tipoYDiseno ? `
            <div class="result-box">
                <h4 class="result-subtitle">🧭 Tipo y diseño de estudio</h4>
                ${marco.tipoYDiseno.split('\n\n').map(p => `<p class="marco-text" style="text-align: justify;">${p}</p>`).join('')}
            </div>` : ''}
        </div>
    `;
    container.innerHTML = html;
    container.style.display = 'block';
}

function mostrarPruebasNormalidad(var1, var2, resultado) {
    const container = document.getElementById('pruebasNormalidadContainer');
    if (!container) {
        console.warn('No existe elemento #pruebasNormalidadContainer en el HTML');
        return;
    }
    const html = `
        <div class="result-section">
            <h3 class="section-title">Pruebas de normalidad</h3>
            <p class="result-subtitle">Hernández-Sampieri & Mendoza (2023) establecen que el tamaño muestral es el criterio decisivo para elegir la prueba de normalidad adecuada, porque cada una tiene sensibilidad diferente según el volumen de datos. Por un lado, Shapiro-Wilk es la prueba más potente parar muestras pequeñas (menor a 50 datos). Por otro lado, Kolmogorov-Smirnov es recomendable aplicarla con muestras mayores a 50. Es decir, el criterio metodológico en la selección de la prueba depende del cumplimiento del supuesto muestral.</p>
            <div class="result-box" style="margin-bottom: 1rem;">
                <h5 style="margin-bottom: 0.5rem; font-weight: 600;">Variable: ${var1}</h5>
                <table class="result-table">
                    <tr>
                        <td>Prueba utilizada:</td>
                        <td><strong>${resultado.normalidad1.prueba}</strong> (${resultado.normalidad1.razon})</td>
                    </tr>
                    <tr>
                        <td>Estadístico:</td>
                        <td>${resultado.normalidad1.estadistico.toFixed(4)}</td>
                    </tr>
                    <tr>
                        <td>p-valor:</td>
                        <td>${fmtPApp(resultado.normalidad1.pValor)}</td>
                    </tr>
                    <tr>
                        <td>Decisión:</td>
                        <td><strong>${resultado.normalidad1.decision}</strong></td>
                    </tr>
                </table>
            </div>
            
            <div class="result-box">
                <h5 style="margin-bottom: 0.5rem; font-weight: 600;">Variable: ${var2}</h5>
                <table class="result-table">
                    <tr>
                        <td>Prueba utilizada:</td>
                        <td><strong>${resultado.normalidad2.prueba}</strong> (${resultado.normalidad2.razon})</td>
                    </tr>
                    <tr>
                        <td>Estadístico:</td>
                        <td>${resultado.normalidad2.estadistico.toFixed(4)}</td>
                    </tr>
                    <tr>
                        <td>p-valor:</td>
                        <td>${fmtPApp(resultado.normalidad2.pValor)}</td>
                    </tr>
                    <tr>
                        <td>Decisión:</td>
                        <td><strong>${resultado.normalidad2.decision}</strong></td>
                    </tr>
                </table>
            </div>
            <!-- Gráficos Q-Q para evaluar visualmente la normalidad -->
            <div class="result-box">
                <p class="result-subtitle" style="margin-bottom: 0.5rem;">Gráficos Q-Q: si los puntos se alinean con la recta de referencia, la distribución es aproximadamente normal.</p>
                <div style="display: flex; gap: 1rem; flex-wrap: wrap; justify-content: center;">
                    <div id="histVariable1" style="flex: 1 1 46%; min-width: 320px;"></div>
                    <div id="qqVariable1" style="flex: 1 1 46%; min-width: 320px;"></div>
                    <div id="histVariable2" style="flex: 1 1 46%; min-width: 320px;"></div>
                    <div id="qqVariable2" style="flex: 1 1 46%; min-width: 320px;"></div>
                </div>
            </div>
            <!-- Interpretación de Normalidad -->
            <div class="result-box interpretation-box interpretation-box--normalidad">
                <h5 class="interpretation-title">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" focusable="false">
                        <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z"/>
                    </svg>
                    Interpretación Estadística
                </h5>
                <p class="interpretation-text">
                    ${InterpretacionesEstadisticas.generarInterpretacionNormalidad(var1, var2, resultado)}
                </p>
            </div>
        </div>
        <div class="card" style="padding:1rem 1.25rem; margin-top:1rem;">
            <h5 style="margin:0 0 0.4rem;">💡 Los porqués detrás de estos números</h5>
            <p style="margin:0 0 0.4rem;"><b>¿Por qué media y desviación estándar?</b> La media es el centro de gravedad de la distribución — el punto exacto donde los datos se equilibran, y por eso los valores extremos la arrastran hacia sí. La desviación estándar es la <i>distancia típica</i> de una persona a ese centro, la unidad natural de la variable: bajo normalidad, cerca del 68 % de los casos queda a ±1 DE de la media y el 95 % a ±2 DE, de modo que dos números se convierten en un mapa completo de dónde está casi todo el mundo. La asimetría cuenta la historia de las colas (positiva: una cola derecha larga arrastra la media por encima de la mediana) y la curtosis mide la propensión a valores extremos. El detalle crucial: ese mapa de «media ± DE» solo es honesto si la forma es normal — con distribuciones deformadas, los mismos dos números engañan. Por eso la app comprueba la normalidad antes de decidir nada.</p>
            <p style="margin:0;"><b>¿Por qué la normalidad decide el coeficiente?</b> Pearson se construye multiplicando desviaciones — (xᵢ−x̄)(yᵢ−ȳ) — y ahí vive su talón de Aquiles: un solo participante extremo aporta un producto gigantesco que puede dominar toda la suma, y la validez de su p-valor se deriva asumiendo normalidad; además solo captura relaciones lineales. Spearman aplica una cirugía elegante: convierte cada valor en su rango (1.º, 2.º, 3.º…) y calcula sobre esos rangos. Al quedarse solo con el <i>orden</i>, las distancias — donde habitan los atípicos y las deformidades de la distribución — desaparecen: el valor más extremo del mundo pasa a ser simplemente «el último de la fila». Robustez por diseño, no por parche.</p>
            <p style="margin:0;"><b>¿Por qué la normalidad decide el coeficiente?</b> Pearson se construye multiplicando desviaciones — (xᵢ−x̄)(yᵢ−ȳ) — y ahí vive su talón de Aquiles: un solo participante extremo aporta un producto gigantesco que puede dominar toda la suma, y la validez de su p-valor se deriva asumiendo normalidad; además solo captura relaciones lineales. Spearman aplica una cirugía elegante: convierte cada valor en su rango (1.º, 2.º, 3.º…) y calcula sobre esos rangos. Al quedarse solo con el <i>orden</i>, las distancias — donde habitan los atípicos y las deformidades de la distribución — desaparecen: el valor más extremo del mundo pasa a ser simplemente «el último». Robustez por diseño, no por parche.</p>
        </div>
    `;
    container.innerHTML = html;
    container.style.display = 'block';
    // Dibujar los gráficos Q-Q con los valores de cada variable
    dibujarGraficosQQ(var1, var2, resultado);
}

// Dibuja un gráfico Q-Q por cada variable usando sus valores pareados.
function dibujarGraficosQQ(var1, var2, resultado) {
    const pares = resultado.valoresPareados;
    if (!pares) return;
    // Panel visual de normalidad por variable: histograma con la curva normal
    // teórica superpuesta (¿la campana se ajusta a los datos?) y Q-Q plot
    // (¿los cuantiles siguen la diagonal?). Juntos justifican visualmente la
    // elección entre Pearson y Spearman.
    const dibujar = (idHist, idQQ, valores, etiqueta) => {
        if (!Array.isArray(valores) || valores.length < 3) return;
        const cfg = { width: 640, height: 400, primaryColor: '#2E5BBA' };
        try {
            if (document.getElementById(idHist)) {
                new ScientificCharts(idHist, cfg)
                    .createHistogramNormal(valores, { title: `Distribución: ${etiqueta}`, xLabel: etiqueta });
            }
            if (document.getElementById(idQQ)) {
                new ScientificCharts(idQQ, cfg)
                    .createQQPlot(valores, { title: `Q-Q: ${etiqueta}` });
            }
        } catch (error) {
            console.error(`Error en panel de normalidad de ${etiqueta}:`, error);
        }
    };
    dibujar('histVariable1', 'qqVariable1', pares.x, var1);
    dibujar('histVariable2', 'qqVariable2', pares.y, var2);
}

function mostrarCorrelacion(var1, var2, resultado) {
    const container = document.getElementById('resultadosCorrelacion');
    if (!container) return;
    const html = `
        <div class="result-section">
            <h3 class="section-title">Análisis de Correlación</h3>
            <p class="result-subtitle">El análisis de correlación permite medir la fuerza y dirección de la relación entre dos variables cuantitativas. Según Hernández, Fernández & Baptista (2010), el coeficiente de correlación de Pearson es adecuado cuando ambas variables siguen una distribución normal, mientras que el coeficiente de correlación de Spearman es preferible cuando al menos una variable no cumple con la normalidad. Es decir, la elección del coeficiente no es arbitraria, depende estrictamente del cumplimiento del supuesto de normalidad previamente validado. La interpretación del coeficiente varía desde -1 (correlación negativa perfecta) hasta +1 (correlación positiva perfecta), siendo 0 indicativo de ausencia de correlación.</p>
            <div class="result-box">
                <table class="result-table">
                    <tr>
                        <td>Variables:</td>
                        <td><strong>${var1} - ${var2}</strong></td>
                    </tr>
                    <tr>
                        <td>N:</td>
                        <td>${resultado.n}</td>
                    </tr>
                    <tr>
                        <td>Coeficiente utilizado:</td>
                        <td><strong>${resultado.tipoCorrelacion}</strong></td>
                    </tr>
                    <tr>
                        <td>Razón:</td>
                        <td>${resultado.normalidad1.normal && resultado.normalidad2.normal ?
            'Ambas variables siguen una distribución normal' :
            'Al menos una variable no sigue una distribución normal'}</td>
                    </tr>
                    <tr>
                        <td>Coeficiente (${resultado.tipoCorrelacion === 'Pearson' ? 'r' : 'ρ'}):</td>
                        <td><strong style="font-size: 1.1em;">${resultado.coeficiente.toFixed(4)}</strong></td>
                    </tr>
                    <tr>
                        <td>p-valor (${resultado.tipoPrueba}):</td>
                        <td><strong>${fmtPApp(resultado.pValor)}</strong></td>
                    </tr>
                    <tr>
                        <td>IC 95% del coeficiente:</td>
                        <td>${resultado.intervaloConfianza ?
            `[${resultado.intervaloConfianza.inferior.toFixed(3)}, ${resultado.intervaloConfianza.superior.toFixed(3)}]` :
            'No disponible (N ≤ 3)'}</td>
                    </tr>
                    <tr>
                        <td>Tamaño del efecto (r²):</td>
                        <td><strong>${(resultado.r2 * 100).toFixed(1)}%</strong> de varianza compartida</td>
                    </tr>
                    <tr>
                        <td>Interpretación:</td>
                        <td><strong>${resultado.interpretacion.texto}</strong></td>
                    </tr>
                </table>
            </div>
            <!-- Interpretación de Correlación -->
            <div class="result-box interpretation-box interpretation-box--correlacion">
                <h5 class="interpretation-title">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" focusable="false">
                        <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z"/>
                    </svg>
                    Interpretación Estadística
                </h5>
                <p class="interpretation-text">
                    ${InterpretacionesEstadisticas.generarInterpretacionCorrelacion(var1, var2, resultado)}
                </p>
            </div>
        </div>
        
        <div id="anclaRegBiv"></div>
    `;
    container.innerHTML = html;
    container.style.display = 'block';
}

function mostrarDecision(var1, var2, resultado) {
    const container = document.getElementById('resultadosDecision');
    if (!container) return;
    const prueba = AnalizadorEstadistico.pruebaHipotesis(resultado);
    const html = `
        <div class="result-section">
            <h3 class="section-title">Prueba de Hipótesis</h3>
            <p class="result-subtitle">Según Taherdoost (2022), la prueba de hipótesis es un procedimiento estadístico que permite evaluar afirmaciones sobre parámetros poblacionales basándose en datos muestrales. El proceso implica formular una hipótesis nula (H₀) y una hipótesis alternativa (H₁), seleccionar un nivel de significancia (α), calcular un estadístico de prueba y determinar el p-valor asociado. La decisión de rechazar o no rechazar H₀ se basa en la comparación del p-valor con α, proporcionando así una base objetiva para la inferencia estadística.</p>
            <div class="result-box">
                <table class="result-table">
                    <tr>
                        <td>Nivel de significancia (α):</td>
                        <td><strong>${prueba.alpha}</strong></td>
                    </tr>
                    <tr>
                        <td>p-valor:</td>
                        <td><strong>${fmtPApp(resultado.pValor)}</strong></td>
                    </tr>
                    <tr>
                        <td>Comparación:</td>
                        <td>${fmtPApp(resultado.pValor)} ${prueba.decision === 'rechazar' ? '<' : '≥'} α = ${prueba.alpha}</td>
                    </tr>
                    <tr>
                        <td>Decisión sobre H₀:</td>
                        <td class="${prueba.decision === 'rechazar' ? 'decision-reject' : 'decision-accept'}">
                            <strong>${prueba.decision === 'rechazar' ? 'SE RECHAZA H₀' : 'NO SE RECHAZA H₀'}</strong>
                        </td>
                    </tr>
                    <tr>
                        <td>Conclusión:</td>
                        <td><strong>${prueba.conclusionH1}</strong></td>
                    </tr>
                    ${resultado.poder != null ? `
                    <tr>
                        <td>Potencia estadística (1 − β):</td>
                        <td><strong>${(resultado.poder * 100).toFixed(1)}%</strong> ${resultado.poder >= 0.8 ? '(adecuada, ≥ 80%)' : '(insuficiente, &lt; 80%)'}</td>
                    </tr>` : ''}
                </table>
                <div style="margin-top: 1rem; padding: 1rem; background-color: #f9f9f9; border-radius: 6px;">
                    <p style="margin: 0; font-size: 0.9rem; line-height: 1.6;">
                        ${prueba.conclusionH0}${resultado.poder != null && resultado.poder < 0.8 ? ' La potencia es inferior al 80% recomendado por Cohen; un resultado no significativo podría deberse a un tamaño muestral insuficiente (riesgo de error tipo II).' : ''}
                    </p>
                </div>
            </div>
            <!-- Interpretación de Prueba de Hipótesis -->
            <div class="result-box interpretation-box interpretation-box--hipotesis">
                <h5 class="interpretation-title">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" focusable="false">
                        <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z"/>
                    </svg>
                    Interpretación Estadística
                </h5>
                <p class="interpretation-text">
                    ${InterpretacionesEstadisticas.generarInterpretacionHipotesis(var1, var2, resultado, prueba)}
                </p>
            </div>
        </div>
        
    `;
    container.innerHTML = html;
    container.style.display = 'block';
}

function mostrarDiscusion(var1, var2, resultado, unidadAnalisis, lugarContexto, marco) {
    const container = document.getElementById('resultadosDiscusion');
    if (!container) return;
    // Reutilizar el marco ya construido (con dimensiones reales y objetivos
    // comparativos) para que la discusión y la tarjeta de marco digan LO MISMO.
    const discusion = marco
        ? InterpretacionesEstadisticas.generarDiscusion(
            var1, var2, resultado,
            AnalizadorEstadistico.pruebaHipotesis(resultado),
            unidadAnalisis, lugarContexto, { marco })
        : AnalizadorEstadistico.generarDiscusion(var1, var2, resultado, unidadAnalisis, lugarContexto);
    const html = `
        <div class="result-section">
            <h3 class="section-title">Discusión (Plantilla)</h3>
            <div class="discussion-box">
                ${discusion.replace(/\[(.*?)\]/g, '<span class="highlight">[$1]</span>')}
            </div>
        </div>
    `;
    container.innerHTML = html;
    container.style.display = 'block';
}

// Muestra el alfa de Cronbach de las escalas cuyas dimensiones (ítems) haya
// configurado el usuario. Es opcional: si no hay dimensiones, no se muestra.
function mostrarFiabilidad(var1, var2) {
    const container = document.getElementById('resultadosFiabilidad');
    if (!container) return;
    const dim1 = (document.getElementById('dimensionesVar1') || { value: '' }).value.trim();
    const dim2 = (document.getElementById('dimensionesVar2') || { value: '' }).value.trim();
    if (!dim1 && !dim2) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }
    let bloques = '';
    try {
        if (dim1) {
            AnalizadorEstadistico.parsearDimensionesDesdeString(var1, dim1);
            bloques += bloqueFiabilidad(var1, AnalizadorEstadistico.calcularFiabilidadVariable(var1));
        }
        if (dim2) {
            AnalizadorEstadistico.parsearDimensionesDesdeString(var2, dim2);
            bloques += bloqueFiabilidad(var2, AnalizadorEstadistico.calcularFiabilidadVariable(var2));
        }
    } catch (error) {
        container.style.display = 'none';
        container.innerHTML = '';
        mostrarToast('Fiabilidad: ' + error.message, 'warning');
        return;
    }
    if (!bloques) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }
    container.innerHTML = `
        <div class="result-section">
            <h3 class="section-title">Análisis de Fiabilidad (Alfa de Cronbach)</h3>
            <p class="result-subtitle">Consistencia interna de cada escala y sus dimensiones. Según George y Mallery (2003), un α ≥ .70 indica una fiabilidad aceptable; ≥ .80 buena y ≥ .90 excelente.</p>
            ${bloques}
        </div>`;
    container.style.display = 'block';
}

function bloqueFiabilidad(variable, fiab) {
    if (!fiab || !fiab.escala) return '';
    const fila = (etiqueta, f) => f
        ? `<tr><td>${etiqueta}</td><td><strong>${f.alfa.toFixed(3)}</strong></td><td>${f.k}</td><td>${f.interpretacion}</td></tr>`
        : `<tr><td>${etiqueta}</td><td colspan="3">No disponible (se requieren ≥ 2 ítems)</td></tr>`;
    const filasDimensiones = fiab.dimensiones
        .map(d => fila(`Dimensión: ${d.nombre}`, d.fiabilidad))
        .join('');
    return `
        <div class="result-box" style="margin-bottom: 1rem;">
            <h5 style="margin-bottom: 0.5rem; font-weight: 600;">Escala: ${variable}</h5>
            <table class="result-table">
                <tr><th>Componente</th><th>α de Cronbach</th><th>N° ítems</th><th>Interpretación</th></tr>
                ${fila('Escala total', fiab.escala)}
                ${filasDimensiones}
            </table>
        </div>`;
}

// Muestra el reporte de comparación de dos grupos.
function mostrarComparacion(varCuantitativa, varAgrupacion, resultado) {
    const container = document.getElementById('resultadosComparacion');
    if (!container) return;
    const d1 = resultado.descriptivas1;
    const d2 = resultado.descriptivas2;
    const prueba = resultado.prueba;
    const ef = resultado.tamanoEfecto;
    const significativa = resultado.decision === 'rechazar';
    const estadisticoTexto = resultado.parametrica
        ? `t(${prueba.gl.toFixed(2)}) = ${prueba.estadistico.toFixed(3)}`
        : `U = ${prueba.U.toFixed(1)}, z = ${prueba.z.toFixed(3)}`;
    const lineaApa = lineaApaComparacion(varCuantitativa, varAgrupacion, resultado);
    container.innerHTML = `
        <div class="result-section">
            <h3 class="section-title">Comparación de Grupos</h3>
            <p class="result-subtitle">Comparación de <strong>${varCuantitativa}</strong> entre los grupos de <strong>${varAgrupacion}</strong>. La prueba se elige según los supuestos: t de Student o de Welch si ambos grupos son normales (según la prueba de Levene de igualdad de varianzas), o U de Mann-Whitney si alguno no es normal.</p>
            <div class="result-box">
                <h5 style="margin-bottom: 0.5rem; font-weight: 600;">Descriptivos por grupo</h5>
                <table class="result-table">
                    <tr><th>Grupo</th><th>N</th><th>Media</th><th>DE</th><th>Normalidad (p)</th></tr>
                    <tr><td>${resultado.etiqueta1}</td><td>${d1.n}</td><td>${d1.media.toFixed(2)}</td><td>${d1.desviacion.toFixed(2)}</td><td>${resultado.normalidad1.pValor.toFixed(3)} (${resultado.normalidad1.normal ? 'normal' : 'no normal'})</td></tr>
                    <tr><td>${resultado.etiqueta2}</td><td>${d2.n}</td><td>${d2.media.toFixed(2)}</td><td>${d2.desviacion.toFixed(2)}</td><td>${resultado.normalidad2.pValor.toFixed(3)} (${resultado.normalidad2.normal ? 'normal' : 'no normal'})</td></tr>
                </table>
            </div>
            <div class="result-box">
                <table class="result-table">
                    <tr><td>Levene (igualdad de varianzas):</td><td>F(${resultado.levene.df1}, ${resultado.levene.df2}) = ${resultado.levene.estadistico.toFixed(3)}, ${fmtPApp(resultado.levene.pValor) === '< .001' ? 'p < .001' : 'p = ' + fmtPApp(resultado.levene.pValor)} (${resultado.levene.varianzasIguales ? 'varianzas iguales' : 'varianzas desiguales'})</td></tr>
                    <tr><td>Prueba aplicada:</td><td><strong>${prueba.prueba}</strong></td></tr>
                    <tr><td>Estadístico:</td><td>${estadisticoTexto}</td></tr>
                    <tr><td>p-valor (bilateral):</td><td><strong>${fmtPApp(prueba.pValor)}</strong></td></tr>
                    <tr><td>Tamaño del efecto (d de Cohen):</td><td><strong>${ef.d.toFixed(3)}</strong> (${ef.interpretacion})</td></tr>
                    ${resultado.tamanoEfectoRangos ? `<tr><td>Tamaño del efecto (r de rangos):</td><td><strong>${resultado.tamanoEfectoRangos.r.toFixed(3)}</strong> (${resultado.tamanoEfectoRangos.interpretacion}) — apropiado para la prueba no paramétrica</td></tr>` : ''}
                    <tr><td>Decisión sobre H₀:</td><td class="${significativa ? 'decision-reject' : 'decision-accept'}"><strong>${significativa ? 'SE RECHAZA H₀' : 'NO SE RECHAZA H₀'}</strong></td></tr>
                </table>
            </div>
            ${bloqueApaComparacionHTML(lineaApa)}
            <div class="result-box" style="display: flex; justify-content: center;">
                <div id="cajaGrupos"></div>
            </div>
            <div class="result-box interpretation-box interpretation-box--hipotesis">
                <h5 class="interpretation-title">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" focusable="false"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z"/></svg>
                    Interpretación
                </h5>
                <p class="interpretation-text">${interpretarComparacion(varCuantitativa, varAgrupacion, resultado)}</p>
            </div>
        </div>`;
    container.style.display = 'block';
    dibujarCajaGrupos(resultado);
    conectarCopiaComparacion(lineaApa);
    desplazarHacia(container);
}

// Dibuja un diagrama de caja por grupo en el contenedor #cajaGrupos usando los
// datos crudos de cada grupo expuestos en el resultado de la comparación.
function dibujarCajaGrupos(resultado) {
    if (!document.getElementById('cajaGrupos') || !Array.isArray(resultado.gruposDatos)) return;
    // Etiquetas cortas para el eje (solo el valor del grupo, sin el prefijo)
    const etiquetas = resultado.etiquetas.map(e => e.split('=').pop().trim());
    try {
        new ScientificCharts('cajaGrupos', { width: 520, height: 360, primaryColor: '#2E5BBA' })
            .createBoxPlot(resultado.gruposDatos, etiquetas, {
                title: 'Distribución por grupo',
                yLabel: 'Valor'
            });
    } catch (error) {
        console.error('Error al crear el diagrama de caja por grupo:', error);
    }
}

// Muestra el reporte de comparación de 3 o más grupos (ANOVA / Kruskal-Wallis).
function mostrarComparacionVarios(varCuantitativa, varAgrupacion, resultado) {
    const container = document.getElementById('resultadosComparacion');
    if (!container) return;
    const prueba = resultado.prueba;
    const significativa = resultado.decision === 'rechazar';
    const k = resultado.etiquetas.length;
    const filasDesc = resultado.descriptivas.map((d, i) =>
        `<tr><td>${resultado.etiquetas[i]}</td><td>${d.n}</td><td>${d.media.toFixed(2)}</td><td>${d.desviacion.toFixed(2)}</td><td>${resultado.normalidades[i].pValor.toFixed(3)} (${resultado.normalidades[i].normal ? 'normal' : 'no normal'})</td></tr>`
    ).join('');
    const lineaPrueba = resultado.parametrica
        ? `F(${prueba.glEntre}, ${prueba.glDentro}) = ${prueba.F.toFixed(3)}`
        : `H(${prueba.gl}) = ${prueba.H.toFixed(3)}`;
    const efecto = resultado.parametrica
        ? `η² = ${prueba.etaCuadrado.toFixed(3)} (${(prueba.etaCuadrado * 100).toFixed(1)}% de varianza explicada)`
        : `ε² = ${prueba.epsilonCuadrado.toFixed(3)}`;
    let postHocHtml = '';
    if (resultado.postHoc) {
        const filas = resultado.postHoc.comparaciones.map(c =>
            `<tr><td>${c.grupo1}</td><td>${c.grupo2}</td><td>${c.pAjustada.toFixed(4)}</td><td>${c.significativa ? 'Sí' : 'No'}</td></tr>`
        ).join('');
        postHocHtml = `
            <div class="result-box">
                <h5 style="margin-bottom: 0.5rem; font-weight: 600;">Comparaciones por pares (post-hoc, ${resultado.postHoc.metodo})</h5>
                <table class="result-table">
                    <tr><th>Grupo A</th><th>Grupo B</th><th>p ajustada</th><th>Significativa</th></tr>
                    ${filas}
                </table>
            </div>`;
    }
    const pTexto = prueba.pValor < 0.001 ? 'p < .001' : 'p = ' + prueba.pValor.toFixed(3).replace(/^0/, '');
    const interpretacion = significativa
        ? `Existen diferencias estadísticamente significativas en ${varCuantitativa} entre al menos dos de los grupos de ${varAgrupacion} (${prueba.prueba}, ${pTexto}). Las comparaciones por pares (Bonferroni) indican entre qué grupos se encuentran las diferencias.`
        : `No se hallaron diferencias estadísticamente significativas en ${varCuantitativa} entre los grupos de ${varAgrupacion} (${prueba.prueba}, ${pTexto}).`;
    const lineaApa = lineaApaComparacion(varCuantitativa, varAgrupacion, resultado);
    container.innerHTML = `
        <div class="result-section">
            <h3 class="section-title">Comparación de Grupos (${k} grupos)</h3>
            <p class="result-subtitle">Comparación de <strong>${varCuantitativa}</strong> entre los ${k} grupos de <strong>${varAgrupacion}</strong>. Se usa ANOVA de una vía si todos los grupos son normales, o Kruskal-Wallis si alguno no lo es. Si el resultado global es significativo, se muestran comparaciones por pares con corrección de Bonferroni.</p>
            <div class="result-box">
                <h5 style="margin-bottom: 0.5rem; font-weight: 600;">Descriptivos por grupo</h5>
                <table class="result-table">
                    <tr><th>Grupo</th><th>N</th><th>Media</th><th>DE</th><th>Normalidad (p)</th></tr>
                    ${filasDesc}
                </table>
            </div>
            <div class="result-box">
                <table class="result-table">
                    <tr><td>Levene (igualdad de varianzas):</td><td>F(${resultado.levene.df1}, ${resultado.levene.df2}) = ${resultado.levene.estadistico.toFixed(3)}, ${fmtPApp(resultado.levene.pValor) === '< .001' ? 'p < .001' : 'p = ' + fmtPApp(resultado.levene.pValor)}</td></tr>
                    <tr><td>Prueba aplicada:</td><td><strong>${prueba.prueba}</strong></td></tr>
                    <tr><td>Estadístico:</td><td>${lineaPrueba}</td></tr>
                    <tr><td>p-valor:</td><td><strong>${fmtPApp(prueba.pValor)}</strong></td></tr>
                    <tr><td>Tamaño del efecto:</td><td><strong>${efecto}</strong></td></tr>
                    <tr><td>Decisión sobre H₀:</td><td class="${significativa ? 'decision-reject' : 'decision-accept'}"><strong>${significativa ? 'SE RECHAZA H₀' : 'NO SE RECHAZA H₀'}</strong></td></tr>
                </table>
            </div>
            ${postHocHtml}
            ${bloqueApaComparacionHTML(lineaApa)}
            <div class="result-box" style="display: flex; justify-content: center;">
                <div id="cajaGrupos"></div>
            </div>
            <div class="result-box interpretation-box interpretation-box--hipotesis">
                <h5 class="interpretation-title">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" focusable="false"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z"/></svg>
                    Interpretación
                </h5>
                <p class="interpretation-text">${interpretacion}</p>
            </div>
        </div>`;
    container.style.display = 'block';
    dibujarCajaGrupos(resultado);
    conectarCopiaComparacion(lineaApa);
    desplazarHacia(container);
}

function mostrarDispersion(var1, var2, resultado) {
    const container = document.getElementById('resultadosDispersion');
    if (!container) return;
    const pares = resultado.valoresPareados;
    if (!pares || !Array.isArray(pares.x) || pares.x.length < 2) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }
    container.innerHTML = `
        <div class="result-section">
            <h3 class="section-title">Diagrama de Dispersión</h3>
            <p class="result-subtitle">Relación entre ${var1} y ${var2}, con la recta de regresión por mínimos cuadrados y el coeficiente de determinación R². Permite valorar visualmente la forma, dirección y dispersión de la asociación.</p>
            <div class="result-box" style="display: flex; justify-content: center;">
                <div id="graficoDispersion"></div>
            </div>
        </div>`;
    container.style.display = 'block';
    // El gráfico se dibuja con la librería ScientificCharts (D3); si fallara,
    // no debe interrumpir el resto del reporte.
    try {
        const chart = new ScientificCharts('graficoDispersion', {
            width: 520,
            height: 380,
            primaryColor: '#2E5BBA'
        });
        const I = InterpretacionesEstadisticas;
        const esSp = I._esSpearman(resultado.tipoCorrelacion);
        const r2 = Number.isFinite(resultado.r2) ? resultado.r2 : resultado.coeficiente ** 2;
        const anot = [
            `${esSp ? 'ρ' : 'r'} = ${resultado.coeficiente.toFixed(3)}  (${I._fmtP(resultado.pValor)})`,
            `${esSp ? 'ρ²' : 'R²'} = ${r2.toFixed(3)}   n = ${resultado.n}`
        ];
        const ic = resultado.intervaloConfianza;
        if (ic && Number.isFinite(ic.inferior)) {
            anot.push(`IC 95% [${ic.inferior.toFixed(3)}, ${ic.superior.toFixed(3)}]`);
        }
        chart.createScatterPlotPro(pares.x, pares.y, {
            title: `${var1} vs ${var2}`,
            xLabel: var1,
            yLabel: var2,
            annotationLines: anot
        });
    } catch (error) {
        console.error('Error al crear el diagrama de dispersión:', error);
        container.querySelector('#graficoDispersion').textContent =
            'No se pudo generar el diagrama de dispersión.';
    }
}

function mostrarRegresion(var1, var2, resultado) {
    const container = document.getElementById('resultadosRegresion');
    if (!container) return;
    // Solo cuando hay regresión (se cumplió la normalidad → método paramétrico)
    const reg = resultado.regresion;
    if (!reg) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }
    const signo = reg.intercepto >= 0 ? '+' : '−';
    const ecuacion = `${var2} = ${reg.pendiente.toFixed(3)} · ${var1} ${signo} ${Math.abs(reg.intercepto).toFixed(3)}`;
    const sentido = reg.pendiente >= 0 ? 'aumenta' : 'disminuye';
    container.innerHTML = `
        <div class="result-section">
            <h3 class="section-title">Regresión Lineal Simple</h3>
            <p class="result-subtitle">Modelo predictivo por mínimos cuadrados de ${var2} en función de ${var1}. Se reporta porque ambas variables cumplieron el supuesto de normalidad; la ecuación permite estimar ${var2} a partir de ${var1}.</p>
            <div class="result-box">
                <p class="apa-text" style="font-style: normal; font-weight: 600;">${ecuacion}</p>
                <table class="result-table">
                    <tr><td>Pendiente (B):</td><td><strong>${reg.pendiente.toFixed(4)}</strong> (EE = ${reg.errorEstandarPendiente.toFixed(4)})</td></tr>
                    <tr><td>Intercepto (B₀):</td><td>${reg.intercepto.toFixed(4)}</td></tr>
                    <tr><td>t de la pendiente (gl = ${reg.gl}):</td><td>${reg.tPendiente.toFixed(3)}</td></tr>
                    <tr><td>p de la pendiente:</td><td><strong>${reg.pPendiente.toFixed(4)}</strong></td></tr>
                    <tr><td>R² (bondad de ajuste):</td><td><strong>${(reg.r2 * 100).toFixed(1)}%</strong></td></tr>
                    <tr><td>Error estándar de estimación:</td><td>${reg.errorEstandarEstimacion.toFixed(4)}</td></tr>
                </table>
                <p class="marco-text" style="margin-top: 0.75rem;">Por cada unidad que aumenta ${var1}, ${var2} ${sentido} en promedio ${Math.abs(reg.pendiente).toFixed(3)} unidades.</p>
            </div>
        </div>`;
    container.style.display = 'block';
}

export { mostrarChiCuadrado, mostrarMarcoMetodologico, mostrarPruebasNormalidad, dibujarGraficosQQ, mostrarCorrelacion, mostrarDecision, mostrarDiscusion, mostrarFiabilidad, bloqueFiabilidad, mostrarComparacion, dibujarCajaGrupos, mostrarComparacionVarios, mostrarDispersion, mostrarRegresion };
