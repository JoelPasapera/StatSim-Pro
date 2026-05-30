// ========================================
// APP PRINCIPAL - COORDINADOR DE INTERFAZ
// ========================================

// ========================================
// NAVEGACIÓN
// ========================================

document.addEventListener('DOMContentLoaded', function () {
    inicializarApp();
});

function inicializarApp() {
    configurarNavegacion();
    configurarGenerador();
    configurarAnalizador();
}

function configurarNavegacion() {
    const navLinks = document.querySelectorAll('.nav-link');

    navLinks.forEach(link => {
        link.addEventListener('click', function (e) {
            e.preventDefault();

            const targetId = this.getAttribute('href').substring(1);

            // Actualizar navegación activa
            navLinks.forEach(l => {
                l.classList.remove('active');
                l.removeAttribute('aria-current');
            });
            this.classList.add('active');
            this.setAttribute('aria-current', 'page');

            // Mostrar sección correspondiente
            document.querySelectorAll('.section').forEach(section => {
                section.classList.remove('active');
            });
            document.getElementById(targetId).classList.add('active');
        });
    });
}

// ========================================
// CONFIGURACIÓN DEL GENERADOR
// ========================================

function configurarGenerador() {
    // Botón agregar prueba
    document.getElementById('btnAgregarPrueba').addEventListener('click', agregarFilaPrueba);

    // Botón agregar sociodemográfico
    document.getElementById('btnAgregarSocio').addEventListener('click', agregarFilaSocio);

    // Botón generar base de datos
    document.getElementById('btnGenerar').addEventListener('click', generarBaseDatos);

    // Botón descargar CSV
    document.getElementById('btnDescargarCSV').addEventListener('click', descargarCSV);

    // Botones importar/exportar pruebas
    document.getElementById('btnImportarPruebas').addEventListener('click', () => {
        document.getElementById('importPruebasInput').click();
    });
    document.getElementById('btnExportarPruebas').addEventListener('click', exportarConfigPruebas);
    document.getElementById('importPruebasInput').addEventListener('change', importarConfigPruebas);

    // Botones importar/exportar sociodemográficos
    document.getElementById('btnImportarSocio').addEventListener('click', () => {
        document.getElementById('importSocioInput').click();
    });
    document.getElementById('btnExportarSocio').addEventListener('click', exportarConfigSocio);
    document.getElementById('importSocioInput').addEventListener('change', importarConfigSocio);

    // Delegación de eventos para botones de eliminar
    document.getElementById('bodyPruebas').addEventListener('click', function (e) {
        if (e.target.closest('.btn-delete')) {
            eliminarFilaPrueba(e.target.closest('tr'));
        }
    });

    document.getElementById('bodySocio').addEventListener('click', function (e) {
        if (e.target.closest('.btn-delete')) {
            eliminarFilaSocio(e.target.closest('tr'));
        }
    });
}

function agregarFilaPrueba() {
    const tbody = document.getElementById('bodyPruebas');
    const nuevaFila = tbody.querySelector('.fila-prueba').cloneNode(true);

    // Limpiar valores
    nuevaFila.querySelectorAll('input').forEach(input => {
        input.value = '';
    });

    tbody.appendChild(nuevaFila);
    mostrarToast('Fila agregada', 'success');
}

function eliminarFilaPrueba(fila) {
    const tbody = document.getElementById('bodyPruebas');
    const filas = tbody.querySelectorAll('.fila-prueba');

    if (filas.length <= 1) {
        mostrarToast('Debe haber al menos una prueba', 'warning');
        return;
    }

    fila.remove();
    mostrarToast('Fila eliminada', 'success');
}

function agregarFilaSocio() {
    const tbody = document.getElementById('bodySocio');
    const nuevaFila = tbody.querySelector('.fila-socio').cloneNode(true);

    // Limpiar valores
    nuevaFila.querySelectorAll('input').forEach(input => {
        input.value = '';
    });

    tbody.appendChild(nuevaFila);
    mostrarToast('Variable agregada', 'success');
}

function eliminarFilaSocio(fila) {
    const tbody = document.getElementById('bodySocio');
    const filas = tbody.querySelectorAll('.fila-socio');

    if (filas.length <= 1) {
        mostrarToast('Debe haber al menos una variable sociodemográfica', 'warning');
        return;
    }

    fila.remove();
    mostrarToast('Variable eliminada', 'success');
}

function generarBaseDatos() {
    try {
        // Recolectar configuración
        generadorDatos.recolectarConfiguracion();

        // Validar
        const validacion = generadorDatos.validarConfiguracion();

        if (validacion.errores.length > 0) {
            mostrarToast('Error: ' + validacion.errores[0], 'error');
            return;
        }

        if (validacion.advertencias.length > 0) {
            console.warn('Advertencias:', validacion.advertencias);
        }

        // Generar datos
        mostrarToast('Generando base de datos...', 'success');
        const boton = document.getElementById('btnGenerar');
        boton.disabled = true; // Evitar doble ejecución mientras se procesa

        setTimeout(() => {
            // try/catch dentro del setTimeout: los errores de la generación se
            // lanzan de forma asíncrona y el catch externo no los capturaría.
            try {
                const datos = generadorDatos.generarBaseDatos();
                // Almacenar datos generados globalmente para los gráficos
                window.datosGenerados = datos;
                mostrarPreview(datos);
                habilitarDescargaCSV();
                habilitarUsarGenerados();
                mostrarToast('¡Base de datos generada exitosamente!', 'success');
            } catch (error) {
                mostrarToast(error.message, 'error');
                console.error(error);
            } finally {
                boton.disabled = false;
            }
        }, 300);

    } catch (error) {
        mostrarToast(error.message, 'error');
        console.error(error);
    }
}

function mostrarPreview(datos) {
    const container = document.getElementById('previewContainer');
    const config = generadorDatos.obtenerConfiguracion();

    // Actualizar estadísticas
    document.getElementById('statParticipantes').textContent = datos.length;
    document.getElementById('statVariables').textContent = Object.keys(datos[0]).length;
    document.getElementById('statPruebas').textContent = config.pruebas.length;

    // Crear tabla preview (solo primeras 10 filas)
    renderizarTablaDatos(
        document.getElementById('previewHead'),
        document.getElementById('previewBody'),
        datos
    );

    // Mostrar container
    container.style.display = 'block';

    // Scroll suave hacia el preview
    desplazarHacia(container);
}

function habilitarDescargaCSV() {
    const btn = document.getElementById('btnDescargarCSV');
    btn.disabled = false;
}

function descargarCSV() {
    try {
        generadorDatos.descargarCSV();
        mostrarToast('CSV descargado exitosamente', 'success');
    } catch (error) {
        mostrarToast(error.message, 'error');
    }
}

function habilitarUsarGenerados() {
    const btn = document.getElementById('btnUsarGenerados');
    btn.disabled = false;
}

// ========================================
// CONFIGURACIÓN DEL ANALIZADOR
// ========================================

function configurarAnalizador() {
    // Botón usar datos generados
    document.getElementById('btnUsarGenerados').addEventListener('click', cargarDatosGenerados);

    // Input file CSV
    document.getElementById('fileInput').addEventListener('change', cargarArchivoCSV);

    // Botón analizar (ejecutarAnalisis ya inicializa los gráficos al final)
    document.getElementById('btnAnalizar').addEventListener('click', ejecutarAnalisis);

    // Botón descargar resultados
    document.getElementById('btnDescargarResultados').addEventListener('click', descargarResultados);
}

function cargarDatosGenerados() {
    try {
        // Verificar que AnalizadorEstadistico esté disponible
        //if (typeof AnalizadorEstadistico === 'undefined') {
        //    mostrarToast('Error: El analizador estadístico no está cargado. Recarga la página.', 'error');
        //    return;
        //}

        const datos = generadorDatos.obtenerDatosGenerados();
        if (!datos || datos.length === 0) {
            mostrarToast('No hay datos generados. Genera una base de datos primero.', 'warning');
            return;
        }

        if (typeof window.AnalizadorEstadistico === 'undefined') {
            mostrarToast('Error: AnalizadorEstadistico indefinido', 'error');
            return;
        }
        window.AnalizadorEstadistico.cargarDatos(datos);

        mostrarDatosCargados(datos);
        mostrarToast('Datos cargados exitosamente', 'success');

        // Almacenar datos generados globalmente para los gráficos
        window.datosGenerados = datos;
    } catch (error) {
        mostrarToast(error.message, 'error');
    }
}

function cargarArchivoCSV(e) {
    const file = e.target.files[0];

    if (!file) return;

    if (!file.name.endsWith('.csv')) {
        mostrarToast('Por favor selecciona un archivo CSV', 'error');
        return;
    }

    const reader = new FileReader();

    reader.onload = function (event) {
        try {
            const csvText = event.target.result;
            AnalizadorEstadistico.cargarDesdeCSV(csvText);
            mostrarDatosCargados(AnalizadorEstadistico.obtenerDatos());
            mostrarToast('Archivo CSV cargado exitosamente', 'success');
        } catch (error) {
            mostrarToast(error.message, 'error');
        }
    };

    reader.onerror = function () {
        mostrarToast('No se pudo leer el archivo', 'error');
    };

    reader.readAsText(file);
}

function mostrarDatosCargados(datos) {
    const container = document.getElementById('datosContainer');
    const seleccionContainer = document.getElementById('seleccionContainer');

    // Actualizar estadísticas
    document.getElementById('analisisN').textContent = datos.length;
    document.getElementById('analisisVars').textContent = Object.keys(datos[0]).length;

    // Crear tabla (primeras 10 filas)
    const columnas = renderizarTablaDatos(
        document.getElementById('analisisHead'),
        document.getElementById('analisisBody'),
        datos
    );

    // Poblar selectores de variables: solo columnas numéricas y excluyendo el
    // identificador (ID no es una variable de análisis).
    const columnasNumericas = columnas.filter(col => {
        if (col === 'ID') return false;
        return typeof datos[0][col] === 'number' || !isNaN(parseFloat(datos[0][col]));
    });

    const select1 = document.getElementById('variable1');
    const select2 = document.getElementById('variable2');

    select1.innerHTML = '<option value="">Seleccionar variable...</option>';
    select2.innerHTML = '<option value="">Seleccionar variable...</option>';

    columnasNumericas.forEach(col => {
        const nombre = col.trim();

        const option1 = document.createElement('option');
        option1.value = nombre;
        option1.textContent = nombre;
        select1.appendChild(option1);

        const option2 = document.createElement('option');
        option2.value = nombre;
        option2.textContent = nombre;
        select2.appendChild(option2);
    });

    // Mostrar containers
    container.style.display = 'block';
    seleccionContainer.style.display = 'block';

    // Scroll
    desplazarHacia(container);
}

function ejecutarAnalisis() {
    const boton = document.getElementById('btnAnalizar');
    const var1 = document.getElementById('variable1').value;
    const var2 = document.getElementById('variable2').value;
    const tipoPruebaSeleccionado = document.querySelector('input[name="tipoPrueba"]:checked');
    const tipoPrueba = tipoPruebaSeleccionado ? tipoPruebaSeleccionado.value : 'bilateral';

    if (!var1 || !var2) {
        mostrarToast('Por favor selecciona ambas variables', 'warning');
        return;
    }

    if (var1 === var2) {
        mostrarToast('Las variables deben ser diferentes', 'warning');
        return;
    }

    mostrarToast('Ejecutando análisis...', 'success');
    // Evitar doble ejecución mientras se procesa
    boton.disabled = true;

    setTimeout(() => {
        // El try/catch va DENTRO del setTimeout: los errores del cálculo (p. ej.
        // una variable constante) se lanzan aquí, de forma asíncrona, así que el
        // catch externo no los vería y el toast nunca aparecería.
        try {
            // Contexto de investigación
            const unidadAnalisis = document.getElementById('unidadAnalisis').value;
            const lugarContexto = document.getElementById('lugarContexto').value;

            // Marco metodológico
            const marco = AnalizadorEstadistico.generarMarcoMetodologico(var1, var2, unidadAnalisis, lugarContexto);

            // Calcular correlación
            const resultado = AnalizadorEstadistico.calcularCorrelacion(var1, var2, tipoPrueba);

            // Generar todas las secciones dinámicamente
            mostrarMarcoMetodologico(marco);
            mostrarDescriptivas(var1, var2, resultado);
            mostrarPruebasNormalidad(var1, var2, resultado);
            mostrarCorrelacion(var1, var2, resultado);
            mostrarRegresion(var1, var2, resultado);
            mostrarDispersion(var1, var2, resultado);
            mostrarDecision(var1, var2, resultado);
            mostrarReporteAPA(var1, var2, resultado);
            mostrarDimensionesSiAplica(var1, var2, tipoPrueba);
            mostrarDiscusion(var1, var2, resultado, unidadAnalisis, lugarContexto);

            // Mostrar referencias bibliográficas
            mostrarReferencias(var1, var2, resultado);

            // Inicializar los gráficos solo cuando el análisis se completó
            inicializarGraficos();

            mostrarToast('Análisis completado exitosamente', 'success');
        } catch (error) {
            mostrarToast(error.message, 'error');
            console.error(error);
        } finally {
            boton.disabled = false;
        }
    }, 300);
}

function mostrarMarcoMetodologico(marco) {
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
            </div>
            
            <div class="result-box">
                <h4 class="result-subtitle">💡 Hipótesis de Investigación (H₁)</h4>
                <p class="marco-text">${marco.hipotesis.hipotesisInvestigador}</p>
            </div>
            
            <div class="result-box">
                <h4 class="result-subtitle">❌ Hipótesis Nula (H₀)</h4>
                <p class="marco-text">${marco.hipotesis.hipotesisNula}</p>
            </div>
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
                        <td>${resultado.normalidad1.pValor.toFixed(4)}</td>
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
                        <td>${resultado.normalidad2.pValor.toFixed(4)}</td>
                    </tr>
                    <tr>
                        <td>Decisión:</td>
                        <td><strong>${resultado.normalidad2.decision}</strong></td>
                    </tr>
                </table>
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
        
    `;

    container.innerHTML = html;
    container.style.display = 'block';
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
                        <td><strong>${resultado.pValor.toFixed(4)}</strong></td>
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
                        <td><strong>${resultado.pValor.toFixed(4)}</strong></td>
                    </tr>
                    <tr>
                        <td>Comparación:</td>
                        <td>${resultado.pValor.toFixed(4)} ${prueba.decision === 'rechazar' ? '<' : '≥'} ${prueba.alpha}</td>
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
                </table>
                
                <div style="margin-top: 1rem; padding: 1rem; background-color: #f9f9f9; border-radius: 6px;">
                    <p style="margin: 0; font-size: 0.9rem; line-height: 1.6;">
                        ${prueba.conclusionH0}
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

function mostrarDiscusion(var1, var2, resultado, unidadAnalisis, lugarContexto) {
    const container = document.getElementById('resultadosDiscusion');
    if (!container) return;

    const discusion = AnalizadorEstadistico.generarDiscusion(var1, var2, resultado, unidadAnalisis, lugarContexto);

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
        chart.createScatterPlot(pares.x, pares.y, {
            title: `${var1} vs ${var2}`,
            xLabel: var1,
            yLabel: var2
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

function mostrarDescriptivas(var1, var2, resultado) {
    const container = document.getElementById('resultadosDescriptivas');
    if (!container) return;

    const d1 = resultado.descriptivas1;
    const d2 = resultado.descriptivas2;

    // Fila de la tabla; `decimales` controla el formato de los valores numéricos.
    const fila = (etiqueta, v1, v2, decimales = 2) => `
        <tr>
            <td>${etiqueta}</td>
            <td>${typeof v1 === 'number' ? v1.toFixed(decimales) : v1}</td>
            <td>${typeof v2 === 'number' ? v2.toFixed(decimales) : v2}</td>
        </tr>`;

    container.innerHTML = `
        <div class="result-section">
            <h3 class="section-title">Estadísticos Descriptivos</h3>
            <p class="result-subtitle">Resumen numérico de cada variable, base para interpretar la correlación. La asimetría y la curtosis describen la forma de la distribución: valores próximos a 0 sugieren simetría y una forma mesocúrtica (cercana a la normal).</p>
            <div class="result-box">
                <table class="result-table">
                    <tr><th>Estadístico</th><th>${var1}</th><th>${var2}</th></tr>
                    ${fila('N', d1.n, d2.n, 0)}
                    ${fila('Media (M)', d1.media, d2.media)}
                    ${fila('Desviación estándar (DE)', d1.desviacion, d2.desviacion)}
                    ${fila('Error estándar', d1.errorEstandar, d2.errorEstandar)}
                    ${fila('Mínimo', d1.min, d2.min)}
                    ${fila('Máximo', d1.max, d2.max)}
                    ${fila('Mediana', d1.mediana, d2.mediana)}
                    ${fila('Q1 / Q3', `${d1.q1.toFixed(2)} / ${d1.q3.toFixed(2)}`, `${d2.q1.toFixed(2)} / ${d2.q3.toFixed(2)}`)}
                    ${fila('Asimetría', d1.asimetria, d2.asimetria)}
                    ${fila('Curtosis', d1.curtosis, d2.curtosis)}
                </table>
            </div>
        </div>`;
    container.style.display = 'block';
}

// Formatea un coeficiente al estilo APA: sin cero a la izquierda y 2 decimales.
function formatearRApa(r) {
    if (typeof r !== 'number' || isNaN(r)) return '—';
    const signo = r < 0 ? '-' : '';
    return signo + Math.abs(r).toFixed(2).replace(/^0/, '');
}

// Formatea el p-valor al estilo APA (p < .001 para valores muy pequeños).
function formatearPApa(p) {
    if (typeof p !== 'number' || isNaN(p)) return 'p = —';
    if (p < 0.001) return 'p < .001';
    return 'p = ' + p.toFixed(3).replace(/^0/, '');
}

// Construye la frase de resultados en formato APA 7.
function construirLineaAPA(var1, var2, resultado) {
    const simbolo = resultado.tipoCorrelacion === 'Pearson' ? 'r' : 'rₛ';
    const ic = resultado.intervaloConfianza;
    const icTexto = ic
        ? `, IC 95% [${formatearRApa(ic.inferior)}, ${formatearRApa(ic.superior)}]`
        : '';
    const significativa = resultado.pValor < 0.05;
    const relacion = significativa
        ? `una correlación ${resultado.interpretacion.direccion} estadísticamente significativa`
        : `una correlación ${resultado.interpretacion.direccion} no significativa`;
    return `Se halló ${relacion} entre ${var1} y ${var2}, ${simbolo}(${resultado.gl}) = ${formatearRApa(resultado.coeficiente)}, ${formatearPApa(resultado.pValor)}${icTexto}; r² = ${formatearRApa(resultado.r2)}.`;
}

function mostrarReporteAPA(var1, var2, resultado) {
    const container = document.getElementById('resultadosReporteAPA');
    if (!container) return;

    const linea = construirLineaAPA(var1, var2, resultado);

    container.innerHTML = `
        <div class="result-section">
            <h3 class="section-title">Reporte en formato APA</h3>
            <p class="result-subtitle">Frase lista para pegar en la sección de resultados de tu tesis o artículo (estilo APA 7).</p>
            <div class="result-box apa-box">
                <p id="apaTexto" class="apa-text">${linea}</p>
                <button type="button" id="btnCopiarAPA" class="btn btn-outline">Copiar</button>
            </div>
        </div>`;
    container.style.display = 'block';

    const btn = document.getElementById('btnCopiarAPA');
    if (btn) {
        btn.addEventListener('click', () => copiarTexto(linea));
    }
}

// Copia un texto al portapapeles y avisa por toast.
function copiarTexto(texto) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(texto)
            .then(() => mostrarToast('Reporte copiado al portapapeles', 'success'))
            .catch(() => mostrarToast('No se pudo copiar el reporte', 'error'));
    } else {
        mostrarToast('El navegador no permite copiar automáticamente', 'warning');
    }
}

// Análisis por dimensiones: solo se ejecuta si el usuario configuró
// dimensiones para AMBAS variables. Es opcional y no debe interrumpir el
// análisis principal, por lo que cualquier error se reporta por toast.
function mostrarDimensionesSiAplica(var1, var2, tipoPrueba) {
    const container = document.getElementById('resultadosDimensiones');
    if (!container) return;

    const dim1 = document.getElementById('dimensionesVar1').value.trim();
    const dim2 = document.getElementById('dimensionesVar2').value.trim();

    // Si no hay dimensiones para ambas variables, ocultar la sección
    if (!dim1 || !dim2) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    try {
        AnalizadorEstadistico.parsearDimensionesDesdeString(var1, dim1);
        AnalizadorEstadistico.parsearDimensionesDesdeString(var2, dim2);
        const resultados = AnalizadorEstadistico.calcularCorrelacionPorDimensiones(var1, var2, tipoPrueba);
        mostrarTablaDimensiones(container, var1, var2, resultados);
    } catch (error) {
        container.style.display = 'none';
        container.innerHTML = '';
        mostrarToast('Dimensiones: ' + error.message, 'warning');
    }
}

function mostrarTablaDimensiones(container, var1, var2, resultados) {
    const filas = resultados.map(r => `
                    <tr>
                        <td>${r.dimension1}</td>
                        <td>${r.dimension2}</td>
                        <td><strong>${r.tipoCorrelacion}</strong></td>
                        <td>${r.coeficiente.toFixed(4)}</td>
                        <td>${r.pValor.toFixed(4)}</td>
                        <td>${r.pValor < 0.05 ? 'Significativa (p < .05)' : 'No significativa (p ≥ .05)'}</td>
                    </tr>`).join('');

    container.innerHTML = `
        <div class="result-section">
            <h3 class="section-title">Análisis por Dimensiones</h3>
            <p class="result-subtitle">Correlación entre cada dimensión de ${var1} y cada dimensión de ${var2}. Para cada par de dimensiones, el coeficiente (Pearson o Spearman) se elige según el cumplimiento del supuesto de normalidad, con el mismo criterio que el análisis global.</p>
            <div class="result-box">
                <table class="result-table">
                    <tr>
                        <th>Dimensión (${var1})</th>
                        <th>Dimensión (${var2})</th>
                        <th>Coeficiente</th>
                        <th>Valor</th>
                        <th>p</th>
                        <th>Significancia (α = .05)</th>
                    </tr>
                    ${filas}
                </table>
            </div>
        </div>
    `;
    container.style.display = 'block';
}

function mostrarReferencias(var1, var2, resultado) {
    // ✅ DECLARA EL CONTENEDOR PRINCIPAL
    const container = document.getElementById('resultadosContainer');
    if (!container) {
        console.error("No se encontró el contenedor #resultadosContainer");
        return;
    }

    const html = `
        <div class="references-container">
            <h4 class="result-title">Referencias bibliográficas</h4>
            <div class="reference-card">
                <p class="reference-text">1. Hernández-Sampieri, R., & Mendoza, C. (2023). Metodología de la investigación: las rutas cuantitativa, cualitativa y mixta. <a href="https://apiperiodico.jalisco.gob.mx/api/sites/periodicooficial.jalisco.gob.mx/files/metodologia_de_la_investigacion_-_roberto_hernandez_sampieri.pdf" target="_blank">https://apiperiodico.jalisco.gob.mx/api/sites/periodicooficial.jalisco.gob.mx/files/metodologia_de_la_investigacion_-_roberto_hernandez_sampieri.pdf</a></p>
            </div>

            <div class="reference-card">
                <p class="reference-text">2. Hernández, D., Fernández, C., & Baptista, M. D. P. (2010). Metodologia de la investigacion 5ta Edicion Sampieri. <a href="https://www.academia.edu/download/46694261/Metodologia_de_la_investigacion_5ta_Edicion_Sampieri___Dulce_Hernandez_-_Academia.edu.pdf" target="_blank">https://www.academia.edu/download/46694261/Metodologia_de_la_investigacion_5ta_Edicion_Sampieri___Dulce_Hernandez_-_Academia.edu.pdf</a></p>
            </div>

            <div class="reference-card">
                <p class="reference-text">3. Taherdoost, H. (2022). What are different research approaches? Comprehensive review of qualitative, quantitative, and mixed method research, their applications, types, and limitations. Journal of Management Science & Engineering Research, 5(1), 53-63. <a href="https://hal.science/hal-03741840/document" target="_blank">https://hal.science/hal-03741840/document</a></p>
            </div>

            <div class="reference-card">
                <p class="reference-text">4. Cohen, J. (2013). Statistical power analysis for the behavioral sciences. routledge. <a href="https://www.taylorfrancis.com/books/mono/10.4324/9780203771587/statistical-power-analysis-behavioral-sciences-jacob-cohen" target="_blank">https://www.taylorfrancis.com/books/mono/10.4324/9780203771587/statistical-power-analysis-behavioral-sciences-jacob-cohen</a></p>
            </div>
        </div>
    `;

    container.innerHTML = html;
    container.style.display = 'block';
}

function descargarResultados() {
    // Obtener el contenido de resultados (texto de cada contenedor, vacío si no existe)
    const textoContenedor = id => {
        const elem = document.getElementById(id);
        return elem ? elem.innerText.trim() : '';
    };

    // El contenedor de normalidad es 'pruebasNormalidadContainer' (no 'resultadosNormalidad').
    // Las secciones opcionales (descriptivos, APA, dimensiones) se filtran si están vacías.
    const secciones = [
        ['ESTADÍSTICOS DESCRIPTIVOS', textoContenedor('resultadosDescriptivas')],
        ['PRUEBA DE NORMALIDAD', textoContenedor('pruebasNormalidadContainer')],
        ['ANÁLISIS DE CORRELACIÓN', textoContenedor('resultadosCorrelacion')],
        ['REGRESIÓN LINEAL SIMPLE', textoContenedor('resultadosRegresion')],
        ['PRUEBA DE HIPÓTESIS', textoContenedor('resultadosDecision')],
        ['REPORTE EN FORMATO APA', textoContenedor('resultadosReporteAPA')],
        ['ANÁLISIS POR DIMENSIONES', textoContenedor('resultadosDimensiones')],
        ['DISCUSIÓN (PLANTILLA)', textoContenedor('resultadosDiscusion')]
    ].filter(([, texto]) => texto);

    // Evitar descargar un archivo vacío si aún no se ejecutó el análisis
    if (secciones.length === 0) {
        mostrarToast('Primero ejecuta un análisis para descargar resultados', 'warning');
        return;
    }

    const cuerpo = secciones
        .map(([titulo, texto], i) => `${i + 1}. ${titulo}\n${texto}`)
        .join('\n\n');

    const contenido = `RESULTADOS DEL ANÁLISIS ESTADÍSTICO
====================================

${cuerpo}

----
Generado por StatSim Pro
Fecha: ${new Date().toLocaleDateString()}
`;

    descargarArchivo(contenido, 'resultados_analisis.txt', 'text/plain');
    mostrarToast('Resultados descargados', 'success');
}

// ========================================
// UTILIDADES
// ========================================

// Renderiza encabezados y las primeras `maxFilas` filas de una base de datos
// en una tabla (thead/tbody). Devuelve la lista de columnas.
function renderizarTablaDatos(thead, tbody, datos, maxFilas = 10) {
    thead.innerHTML = '';
    tbody.innerHTML = '';

    const columnas = Object.keys(datos[0]);

    const filaEncabezados = document.createElement('tr');
    columnas.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col;
        filaEncabezados.appendChild(th);
    });
    thead.appendChild(filaEncabezados);

    const limite = Math.min(maxFilas, datos.length);
    for (let i = 0; i < limite; i++) {
        const fila = document.createElement('tr');
        columnas.forEach(col => {
            const td = document.createElement('td');
            const valor = datos[i][col];
            td.textContent = typeof valor === 'number' ? valor.toFixed(2) : valor;
            fila.appendChild(td);
        });
        tbody.appendChild(fila);
    }

    return columnas;
}

// Desplaza la vista hacia un elemento respetando la preferencia de movimiento
// reducido del sistema (accesibilidad).
function desplazarHacia(elemento) {
    const movimientoReducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    elemento.scrollIntoView({ behavior: movimientoReducido ? 'auto' : 'smooth', block: 'nearest' });
}

let temporizadorToast = null;

function mostrarToast(mensaje, tipo = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = mensaje;
    toast.className = `toast ${tipo}`;
    toast.classList.add('show');

    // Cancelar el temporizador previo para que un toast nuevo no se oculte
    // antes de tiempo por el setTimeout de uno anterior.
    if (temporizadorToast) {
        clearTimeout(temporizadorToast);
    }
    temporizadorToast = setTimeout(() => {
        toast.classList.remove('show');
        temporizadorToast = null;
    }, 3000);
}

// ========================================
// IMPORTAR/EXPORTAR CONFIGURACIONES
// ========================================

// PRUEBAS APLICADAS
function exportarConfigPruebas() {
    try {
        const filas = document.querySelectorAll('#bodyPruebas .fila-prueba');

        if (filas.length === 0) {
            mostrarToast('No hay pruebas para exportar', 'warning');
            return;
        }

        // Crear CSV con encabezados
        let csv = 'Nombre,NumItems,Media,DE,MinItem,MaxItem\n';

        filas.forEach(fila => {
            const inputs = fila.querySelectorAll('input');
            const nombre = inputs[0].value.trim() || '';
            const numItems = inputs[1].value || '';
            const media = inputs[2].value || '';
            const de = inputs[3].value || '';
            const min = inputs[4].value || '';
            const max = inputs[5].value || '';

            // Escapar valores con comas
            const nombreEscapado = nombre.includes(',') ? `"${nombre}"` : nombre;
            csv += `${nombreEscapado},${numItems},${media},${de},${min},${max}\n`;
        });

        // Descargar archivo
        descargarArchivo(csv, 'configuracion_pruebas.csv', 'text/csv');
        mostrarToast('Configuración de pruebas exportada exitosamente', 'success');

    } catch (error) {
        mostrarToast('Error al exportar: ' + error.message, 'error');
    }
}

function importarConfigPruebas(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (event) {
        try {
            const csv = event.target.result;
            const lineas = csv.trim().split('\n');

            if (lineas.length < 2) {
                mostrarToast('El archivo CSV está vacío o no tiene datos', 'error');
                return;
            }

            // Verificar encabezados
            const encabezados = lineas[0].toLowerCase();
            if (!encabezados.includes('nombre') || !encabezados.includes('numitems')) {
                mostrarToast('El archivo CSV no tiene el formato correcto. Encabezados esperados: Nombre,NumItems,Media,DE,MinItem,MaxItem', 'error');
                return;
            }

            // Limpiar tabla actual
            const tbody = document.getElementById('bodyPruebas');
            tbody.innerHTML = '';

            // Procesar cada línea (saltar encabezados)
            for (let i = 1; i < lineas.length; i++) {
                const linea = lineas[i].trim();
                if (!linea) continue;

                const valores = parsearLineaCSV(linea);

                if (valores.length >= 4) {
                    agregarFilaPruebaConDatos({
                        nombre: valores[0] || '',
                        numItems: valores[1] || '',
                        media: valores[2] || '',
                        de: valores[3] || '',
                        min: valores[4] || '',
                        max: valores[5] || ''
                    });
                }
            }

            mostrarToast(`Configuración importada: ${lineas.length - 1} pruebas`, 'success');

        } catch (error) {
            mostrarToast('Error al importar: ' + error.message, 'error');
        }
    };

    reader.onerror = function () {
        mostrarToast('No se pudo leer el archivo', 'error');
    };

    reader.readAsText(file);
    e.target.value = ''; // Limpiar input
}

function agregarFilaPruebaConDatos(datos) {
    const tbody = document.getElementById('bodyPruebas');
    const nuevaFila = document.createElement('tr');
    nuevaFila.className = 'fila-prueba';

    nuevaFila.innerHTML = `
        <td><input type="text" class="input input-sm" placeholder="Ej: WAIS-IV" maxlength="100" value="${datos.nombre}" aria-label="Nombre de la prueba"></td>
        <td><input type="number" class="input input-sm" placeholder="Ej: 60" min="1" value="${datos.numItems}" aria-label="Número de ítems"></td>
        <td><input type="number" class="input input-sm" placeholder="Ej: 100" step="0.01" value="${datos.media}" aria-label="Media (M)"></td>
        <td><input type="number" class="input input-sm" placeholder="Ej: 15" step="0.01" min="0.01" value="${datos.de}" aria-label="Desviación estándar (DE)"></td>
        <td><input type="number" class="input input-sm" placeholder="Ej: 0" step="1" value="${datos.min}" aria-label="Mínimo por ítem"></td>
        <td><input type="number" class="input input-sm" placeholder="Ej: 5" step="1" value="${datos.max}" aria-label="Máximo por ítem"></td>
        <td>
            <button type="button" class="btn-icon btn-delete" title="Eliminar" aria-label="Eliminar fila">
                <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 4H13M5 4V3C5 2.44772 5.44772 2 6 2H10C10.5523 2 11 2.44772 11 3V4M6 7V11M10 7V11M4 4H12L11.5 13C11.5 13.5523 11.0523 14 10.5 14H5.5C4.94772 14 4.5 13.5523 4.5 13L4 4Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
            </button>
        </td>
    `;

    tbody.appendChild(nuevaFila);
}

// SOCIODEMOGRÁFICOS
function exportarConfigSocio() {
    try {
        const filas = document.querySelectorAll('#bodySocio .fila-socio');

        if (filas.length === 0) {
            mostrarToast('No hay variables sociodemográficas para exportar', 'warning');
            return;
        }

        // Crear CSV con encabezados
        let csv = 'Categoria,Promedio,DE,Minimo,Maximo,Decimales\n';

        filas.forEach(fila => {
            const inputs = fila.querySelectorAll('input');
            const categoria = inputs[0].value.trim() || '';
            const promedio = inputs[1].value || '';
            const de = inputs[2].value || '';
            const min = inputs[3].value || '';
            const max = inputs[4].value || '';
            const decimales = inputs[5].value || '';

            // Escapar valores con comas
            const categoriaEscapada = categoria.includes(',') ? `"${categoria}"` : categoria;
            csv += `${categoriaEscapada},${promedio},${de},${min},${max},${decimales}\n`;
        });

        // Descargar archivo
        descargarArchivo(csv, 'configuracion_sociodemograficos.csv', 'text/csv');
        mostrarToast('Configuración de sociodemográficos exportada exitosamente', 'success');

    } catch (error) {
        mostrarToast('Error al exportar: ' + error.message, 'error');
    }
}

function importarConfigSocio(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (event) {
        try {
            const csv = event.target.result;
            const lineas = csv.trim().split('\n');

            if (lineas.length < 2) {
                mostrarToast('El archivo CSV está vacío o no tiene datos', 'error');
                return;
            }

            // Verificar encabezados
            const encabezados = lineas[0].toLowerCase();
            if (!encabezados.includes('categoria') || !encabezados.includes('promedio')) {
                mostrarToast('El archivo CSV no tiene el formato correcto. Encabezados esperados: Categoria,Promedio,DE,Minimo,Maximo,Decimales', 'error');
                return;
            }

            // Limpiar tabla actual
            const tbody = document.getElementById('bodySocio');
            tbody.innerHTML = '';

            // Procesar cada línea (saltar encabezados)
            for (let i = 1; i < lineas.length; i++) {
                const linea = lineas[i].trim();
                if (!linea) continue;

                const valores = parsearLineaCSV(linea);

                if (valores.length >= 3) {
                    agregarFilaSocioConDatos({
                        categoria: valores[0] || '',
                        promedio: valores[1] || '',
                        de: valores[2] || '',
                        min: valores[3] || '',
                        max: valores[4] || '',
                        decimales: valores[5] || '2'
                    });
                }
            }

            mostrarToast(`Configuración importada: ${lineas.length - 1} variables`, 'success');

        } catch (error) {
            mostrarToast('Error al importar: ' + error.message, 'error');
        }
    };

    reader.onerror = function () {
        mostrarToast('No se pudo leer el archivo', 'error');
    };

    reader.readAsText(file);
    e.target.value = ''; // Limpiar input
}

function agregarFilaSocioConDatos(datos) {
    const tbody = document.getElementById('bodySocio');
    const nuevaFila = document.createElement('tr');
    nuevaFila.className = 'fila-socio';

    nuevaFila.innerHTML = `
        <td><input type="text" class="input input-sm" placeholder="Ej: Edad" value="${datos.categoria}" aria-label="Categoría"></td>
        <td><input type="number" class="input input-sm" placeholder="Ej: 20" step="0.01" value="${datos.promedio}" aria-label="Promedio"></td>
        <td><input type="number" class="input input-sm" placeholder="Ej: 2.5" step="0.01" min="0.01" value="${datos.de}" aria-label="Desviación estándar"></td>
        <td><input type="number" class="input input-sm" placeholder="Ej: 15" step="0.01" value="${datos.min}" aria-label="Mínimo"></td>
        <td><input type="number" class="input input-sm" placeholder="Ej: 25" step="0.01" value="${datos.max}" aria-label="Máximo"></td>
        <td><input type="number" class="input input-sm" placeholder="Ej: 2" min="0" max="4" value="${datos.decimales}" aria-label="Número de decimales"></td>
        <td>
            <button type="button" class="btn-icon btn-delete" title="Eliminar" aria-label="Eliminar fila">
                <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 4H13M5 4V3C5 2.44772 5.44772 2 6 2H10C10.5523 2 11 2.44772 11 3V4M6 7V11M10 7V11M4 4H12L11.5 13C11.5 13.5523 11.0523 14 10.5 14H5.5C4.94772 14 4.5 13.5523 4.5 13L4 4Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
            </button>
        </td>
    `;

    tbody.appendChild(nuevaFila);
}

// ========================================
// CONFIGURACIÓN DE GRÁFICOS CIENTÍFICOS
// ========================================

function inicializarGraficos() {
    // Usar los datos realmente cargados en el analizador (sirve tanto para
    // datos generados como para un CSV subido); con respaldo al generador.
    const datos = (window.AnalizadorEstadistico && window.AnalizadorEstadistico.obtenerDatos())
        || window.datosGenerados
        || generadorDatos.obtenerDatosGenerados();

    // Verificar que existan los datos
    if (!datos || datos.length === 0) {
        console.warn('No hay datos para mostrar gráficos');
        return;
    }

    // Verificar que los contenedores existan
    const contenedores = [
        'distribucion-gaussiana',
        'matriz-correlacion',
        'diagrama-caja',
        'diagrama-violin'
    ];

    // Filtrar contenedores que existen en el DOM
    const contenedoresValidos = contenedores.filter(id => {
        const elem = document.getElementById(id);
        return elem !== null;
    });

    if (contenedoresValidos.length === 0) {
        console.warn('No se encontraron contenedores para gráficos');
        return;
    }

    try {
        // Limpiar contenedores previos
        contenedoresValidos.forEach(id => {
            const container = document.getElementById(id);
            if (container) {
                container.innerHTML = '';
            }
        });

        // Preparar datos para gráficos a partir de los datos cargados
        const datosParaGraficos = prepararDatosParaGraficos(datos);
        if (!datosParaGraficos) {
            console.warn('No hay columnas numéricas para graficar');
            return;
        }

        // Crear gráfico de distribución gaussiana
        if (contenedoresValidos.includes('distribucion-gaussiana')) {
            const chartGauss = new ScientificCharts('distribucion-gaussiana', {
                width: 400,
                height: 300,
                primaryColor: '#2E5BBA'
            });
            chartGauss.createGaussianDistribution(datosParaGraficos.distribucion, null, null, {
                title: 'Distribución Normal de Puntajes',
                xLabel: 'Puntaje',
                yLabel: 'Densidad'
            });
        }

        // Crear matriz de correlación
        if (contenedoresValidos.includes('matriz-correlacion')) {
            const chartCorr = new ScientificCharts('matriz-correlacion', {
                width: 400,
                height: 300,
                primaryColor: '#2E5BBA'
            });
            chartCorr.createCorrelationMatrix(datosParaGraficos.correlaciones, datosParaGraficos.labels, {
                title: 'Matriz de Correlaciones'
            });
        }

        // Crear diagrama de caja
        if (contenedoresValidos.includes('diagrama-caja')) {
            const chartBox = new ScientificCharts('diagrama-caja', {
                width: 400,
                height: 300,
                primaryColor: '#2E5BBA'
            });
            chartBox.createBoxPlot(datosParaGraficos.cajas, datosParaGraficos.labels, {
                title: 'Distribución de Puntajes por Prueba'
            });
        }

        // Crear diagrama de violín
        if (contenedoresValidos.includes('diagrama-violin')) {
            const chartViolin = new ScientificCharts('diagrama-violin', {
                width: 400,
                height: 300,
                primaryColor: '#2E5BBA'
            });
            chartViolin.createViolinPlot(datosParaGraficos.violin, datosParaGraficos.labelsViolin, {
                title: 'Densidad de Distribución por Prueba'
            });
        }

        // Mostrar la rejilla de gráficos (oculta por defecto con .chart-grid)
        const grid = document.getElementById('contenedorGraficos');
        if (grid) {
            grid.classList.add('show');
        }

    } catch (error) {
        console.error('Error al inicializar gráficos:', error);
    }
}

// Número máximo de columnas a graficar (legibilidad de matriz/diagramas)
const MAX_COLUMNAS_GRAFICOS = 8;

// Selecciona columnas numéricas significativas para los gráficos: prioriza los
// puntajes totales (Total_*); si no hay al menos dos, usa el resto de columnas
// numéricas. Excluye el identificador (ID) y limita la cantidad por legibilidad.
function seleccionarColumnasGraficos(datos) {
    if (!datos || datos.length === 0) return [];

    const primera = datos[0];
    const numericas = Object.keys(primera).filter(key => {
        if (key === 'ID') return false;
        return typeof primera[key] === 'number' || !isNaN(parseFloat(primera[key]));
    });

    const totales = numericas.filter(key => key.startsWith('Total_'));
    const base = totales.length >= 2 ? totales : numericas;

    return base.slice(0, MAX_COLUMNAS_GRAFICOS);
}

// Coeficiente de correlación de Pearson; devuelve 0 si alguna variable es
// constante (varianza nula) o no hay pares suficientes.
function correlacionPearsonSimple(a, b) {
    const n = Math.min(a.length, b.length);
    if (n < 2) return 0;

    let sumaX = 0, sumaY = 0;
    for (let i = 0; i < n; i++) {
        sumaX += a[i];
        sumaY += b[i];
    }
    const mediaX = sumaX / n;
    const mediaY = sumaY / n;

    let numerador = 0, varX = 0, varY = 0;
    for (let i = 0; i < n; i++) {
        const dx = a[i] - mediaX;
        const dy = b[i] - mediaY;
        numerador += dx * dy;
        varX += dx * dx;
        varY += dy * dy;
    }

    if (varX === 0 || varY === 0) return 0;
    return numerador / Math.sqrt(varX * varY);
}

// Prepara los datos para los gráficos a partir de la base cargada/generada.
// Devuelve null si no hay columnas numéricas que graficar.
function prepararDatosParaGraficos(datos) {
    const columnas = seleccionarColumnasGraficos(datos);
    if (columnas.length === 0) return null;

    // Valores numéricos por columna (descartando no numéricos)
    const valoresPorColumna = columnas.map(col =>
        datos.map(fila => parseFloat(fila[col])).filter(valor => !isNaN(valor))
    );

    // Distribución gaussiana: valores de la primera columna seleccionada
    const distribucion = valoresPorColumna[0];

    // Matriz de correlaciones REAL (Pearson) entre las columnas seleccionadas
    const correlaciones = columnas.map((_, i) =>
        columnas.map((__, j) =>
            i === j
                ? 1
                : Math.round(correlacionPearsonSimple(valoresPorColumna[i], valoresPorColumna[j]) * 100) / 100
        )
    );

    const labels = columnas.slice();

    return {
        distribucion,
        correlaciones,
        cajas: valoresPorColumna,
        labels,
        // El violín usa solo las dos primeras columnas: sus etiquetas deben
        // coincidir con esas dos series, no con todas las columnas.
        violin: valoresPorColumna.slice(0, 2),
        labelsViolin: labels.slice(0, 2)
    };
}

// ========================================
// UTILIDADES PARA CSV
// ========================================

function parsearLineaCSV(linea) {
    const resultado = [];
    let dentroComillas = false;
    let valorActual = '';

    for (let i = 0; i < linea.length; i++) {
        const char = linea[i];

        if (char === '"') {
            dentroComillas = !dentroComillas;
        } else if (char === ',' && !dentroComillas) {
            resultado.push(valorActual.trim());
            valorActual = '';
        } else {
            valorActual += char;
        }
    }
    resultado.push(valorActual.trim());

    return resultado;
}

function descargarArchivo(contenido, nombreArchivo, tipoMime) {
    const blob = new Blob([contenido], { type: tipoMime + ';charset=utf-8;' });
    const link = document.createElement('a');

    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', nombreArchivo);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
}