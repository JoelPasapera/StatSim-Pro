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

    // Límites de Media/DE en vivo: recalcular al escribir en cualquier campo de
    // la prueba, y ajustar al rango permitido al salir de Media/DE.
    const tbodyPruebas = document.getElementById('bodyPruebas');
    tbodyPruebas.addEventListener('input', function (e) {
        const fila = e.target.closest && e.target.closest('.fila-prueba');
        if (fila) actualizarLimitesPrueba(fila);
        if (e.target.getAttribute && e.target.getAttribute('aria-label') === 'Nombre de la prueba') {
            actualizarListaPruebas();
        }
    });
    tbodyPruebas.addEventListener('change', ajustarPruebaEnCambio);
    actualizarTodasLasPruebas(); // pase inicial sobre la fila de ejemplo

    // El límite inferior de DE (anti-escalera) depende de N: recalcular al cambiarlo.
    const inputN = document.getElementById('tamanoMuestra');
    if (inputN) inputN.addEventListener('input', actualizarTodasLasPruebas);

    document.getElementById('bodySocio').addEventListener('click', function (e) {
        if (e.target.closest('.btn-delete')) {
            eliminarFilaSocio(e.target.closest('tr'));
        }
    });

    // Sociodemográficos: los campos se desbloquean al escribir la Categoría
    const tbodySocio = document.getElementById('bodySocio');
    tbodySocio.addEventListener('input', function (e) {
        const fila = e.target.closest && e.target.closest('.fila-socio');
        if (fila) actualizarBloqueoSocio(fila);
    });
    actualizarTodosSocio();

    // Correlaciones objetivo
    const btnCorrelacion = document.getElementById('btnAgregarCorrelacion');
    if (btnCorrelacion) {
        btnCorrelacion.addEventListener('click', agregarFilaCorrelacion);
    }
    const bodyCorrelaciones = document.getElementById('bodyCorrelaciones');
    if (bodyCorrelaciones) {
        bodyCorrelaciones.addEventListener('click', function (e) {
            if (e.target.closest('.btn-delete')) {
                e.target.closest('tr').remove();
            }
        });
    }

    // Diferencias por grupo
    const btnDiferencia = document.getElementById('btnAgregarDiferencia');
    if (btnDiferencia) {
        btnDiferencia.addEventListener('click', agregarFilaDiferencia);
    }
    const bodyDiferencias = document.getElementById('bodyDiferencias');
    if (bodyDiferencias) {
        bodyDiferencias.addEventListener('click', function (e) {
            if (e.target.closest('.btn-delete')) {
                e.target.closest('tr').remove();
            }
        });
    }
}

// Variables que pueden usarse como agrupación: sociodemográficas Binaria o
// Categórica.
function obtenerVariablesAgrupacion() {
    const nombres = [];
    document.querySelectorAll('#bodySocio .fila-socio').forEach(fila => {
        const select = fila.querySelector('select');
        const dist = select ? select.value : 'normal';
        if (dist === 'binaria' || dist === 'categorica') {
            const categoria = fila.querySelector('input').value.trim();
            if (categoria) nombres.push(categoria);
        }
    });
    return nombres;
}

function agregarFilaDiferencia() {
    const cuantitativas = obtenerVariablesCorrelacionables();
    const agrupaciones = obtenerVariablesAgrupacion();
    if (cuantitativas.length === 0 || agrupaciones.length === 0) {
        mostrarToast('Necesitas al menos una variable cuantitativa y una de agrupación (Binaria o Categórica)', 'warning');
        return;
    }

    const tbody = document.getElementById('bodyDiferencias');
    const fila = document.createElement('tr');
    fila.className = 'fila-diferencia';

    const opcionesCuant = cuantitativas.map(n => `<option value="${n}">${n}</option>`).join('');
    const opcionesGrupo = agrupaciones.map(n => `<option value="${n}">${n}</option>`).join('');
    fila.innerHTML = `
        <td><select class="input input-sm" aria-label="Variable cuantitativa"><option value="">Variable...</option>${opcionesCuant}</select></td>
        <td><select class="input input-sm" aria-label="Variable de agrupación"><option value="">Agrupación...</option>${opcionesGrupo}</select></td>
        <td><input type="number" class="input input-sm" step="0.1" placeholder="Ej: 0.5" aria-label="d de Cohen"></td>
        <td>
            <button type="button" class="btn-icon btn-delete" title="Eliminar" aria-label="Eliminar fila">
                <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 4H13M5 4V3C5 2.44772 5.44772 2 6 2H10C10.5523 2 11 2.44772 11 3V4M6 7V11M10 7V11M4 4H12L11.5 13C11.5 13.5523 11.0523 14 10.5 14H5.5C4.94772 14 4.5 13.5523 4.5 13L4 4Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
            </button>
        </td>
    `;
    tbody.appendChild(fila);
}

// Lista de variables que pueden correlacionarse: nombres de las escalas y de
// las sociodemográficas continuas (Normal/Asimétrica).
function obtenerVariablesCorrelacionables() {
    const nombres = [];
    document.querySelectorAll('#bodyPruebas .fila-prueba').forEach(fila => {
        const inputEscala = fila.querySelector('[aria-label="Nombre de la escala"]');
        const nombre = inputEscala ? inputEscala.value.trim() : '';
        if (nombre) nombres.push(nombre);
    });
    document.querySelectorAll('#bodySocio .fila-socio').forEach(fila => {
        const select = fila.querySelector('select');
        const dist = select ? select.value : 'normal';
        if (dist === 'normal' || dist === 'asimetrica') {
            const categoria = fila.querySelector('input').value.trim();
            if (categoria) nombres.push(categoria);
        }
    });
    return nombres;
}

function agregarFilaCorrelacion() {
    const nombres = obtenerVariablesCorrelacionables();
    if (nombres.length < 2) {
        mostrarToast('Define al menos 2 variables cuantitativas (escalas o continuas) antes de añadir correlaciones', 'warning');
        return;
    }

    const tbody = document.getElementById('bodyCorrelaciones');
    const fila = document.createElement('tr');
    fila.className = 'fila-correlacion';

    const opciones = nombres.map(n => `<option value="${n}">${n}</option>`).join('');
    fila.innerHTML = `
        <td><select class="input input-sm" aria-label="Variable A"><option value="">Variable A...</option>${opciones}</select></td>
        <td><select class="input input-sm" aria-label="Variable B"><option value="">Variable B...</option>${opciones}</select></td>
        <td><input type="number" class="input input-sm" step="0.05" min="-0.99" max="0.99" placeholder="Ej: 0.5" aria-label="Correlación objetivo"></td>
        <td>
            <button type="button" class="btn-icon btn-delete" title="Eliminar" aria-label="Eliminar fila">
                <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 4H13M5 4V3C5 2.44772 5.44772 2 6 2H10C10.5523 2 11 2.44772 11 3V4M6 7V11M10 7V11M4 4H12L11.5 13C11.5 13.5523 11.0523 14 10.5 14H5.5C4.94772 14 4.5 13.5523 4.5 13L4 4Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
            </button>
        </td>
    `;
    tbody.appendChild(fila);
}


function agregarFilaPrueba() {
    const tbody = document.getElementById('bodyPruebas');
    const nuevaFila = tbody.querySelector('.fila-prueba').cloneNode(true);

    // Limpiar valores y estado de validación heredado del clon
    nuevaFila.querySelectorAll('input').forEach(input => {
        input.value = '';
        input.classList.remove('invalid');
    });
    // Reset de límites dinámicos solo en Media/DE (los de ítems y α son fijos)
    const ioNueva = inputsPrueba(nuevaFila);
    [ioNueva.media, ioNueva.de].forEach(inp => { if (inp) { inp.removeAttribute('min'); inp.removeAttribute('max'); } });

    tbody.appendChild(nuevaFila);
    actualizarLimitesPrueba(nuevaFila);
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
    actualizarBloqueoSocio(nuevaFila);
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
            // Mostrar la primera advertencia de forma visible (la más relevante
            // suele ser la de factibilidad de la Media/DE frente al rango).
            mostrarToast('⚠ ' + validacion.advertencias[0], 'warning', 9000);
        }

        // Generar datos
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

    // Cambio de tipo de análisis: actualizar las etiquetas de los selectores
    document.querySelectorAll('input[name="tipoAnalisis"]').forEach(radio => {
        radio.addEventListener('change', actualizarEtiquetasAnalisis);
    });

    // Botón descargar resultados
    document.getElementById('btnDescargarResultados').addEventListener('click', descargarResultados);
}

// Ajusta las etiquetas de los selectores según el tipo de análisis elegido.
function actualizarEtiquetasAnalisis() {
    const seleccionado = document.querySelector('input[name="tipoAnalisis"]:checked');
    const tipo = seleccionado ? seleccionado.value : 'correlacion';
    const label1 = document.getElementById('labelVariable1');
    const label2 = document.getElementById('labelVariable2');

    if (tipo === 'comparacion') {
        if (label1) label1.textContent = 'Variable cuantitativa';
        if (label2) label2.textContent = 'Variable de agrupación';
    } else if (tipo === 'asociacion') {
        if (label1) label1.textContent = 'Variable categórica 1';
        if (label2) label2.textContent = 'Variable categórica 2';
    } else {
        if (label1) label1.textContent = 'Variable 1';
        if (label2) label2.textContent = 'Variable 2';
    }
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

        // Registrar etiquetas humanas y estructura de pruebas (estilo SPSS):
        // la interfaz mostrará "Inteligencia Cognitiva" en vez de "Total_IC".
        // Con datos del simulador NO se ofrece el editor: las etiquetas son las
        // configuradas en la sección Simulador.
        if (typeof EtiquetasVariables !== 'undefined' && generadorDatos.obtenerEtiquetas) {
            EtiquetasVariables.fijar(
                generadorDatos.obtenerEtiquetas(),
                generadorDatos.obtenerEstructuraEscalas()
            );
            EtiquetasVariables.ocultarEditor('editorEtiquetas');
        }

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
            const datos = AnalizadorEstadistico.obtenerDatos();

            // Base de datos EXTERNA: no hay etiquetas del simulador. Se limpian
            // las anteriores y se ofrece el editor para renombrar variables.
            if (typeof EtiquetasVariables !== 'undefined') {
                EtiquetasVariables.limpiar();
                EtiquetasVariables.mostrarEditor('editorEtiquetas', obtenerColumnasNumericas(datos), function () {
                    poblarSelectsVariables(AnalizadorEstadistico.obtenerDatos());
                    mostrarToast('Etiquetas aplicadas: los textos del análisis usarán los nuevos nombres', 'success');
                });
            }

            mostrarDatosCargados(datos);
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
    renderizarTablaDatos(
        document.getElementById('analisisHead'),
        document.getElementById('analisisBody'),
        datos
    );

    poblarSelectsVariables(datos);

    // Mostrar containers
    container.style.display = 'block';
    seleccionContainer.style.display = 'block';

    // Scroll
    desplazarHacia(container);
}

// Columnas numéricas analizables del dataset (excluye el identificador).
function obtenerColumnasNumericas(datos) {
    if (!datos || datos.length === 0) return [];
    return Object.keys(datos[0]).filter(col => {
        if (col === 'ID') return false;
        return typeof datos[0][col] === 'number' || !isNaN(parseFloat(datos[0][col]));
    });
}

// Puebla los selectores de variables del analizador. Reutilizable: se llama al
// cargar datos y también al aplicar nuevas etiquetas (para refrescar los textos).
function poblarSelectsVariables(datos) {
    const columnasNumericas = obtenerColumnasNumericas(datos);

    const select1 = document.getElementById('variable1');
    const select2 = document.getElementById('variable2');
    const valor1 = select1.value, valor2 = select2.value; // conservar selección

    select1.innerHTML = '<option value="">Seleccionar variable...</option>';
    select2.innerHTML = '<option value="">Seleccionar variable...</option>';

    columnasNumericas.forEach(col => {
        const nombre = col.trim();
        // Mostrar la etiqueta humana ("Inteligencia Cognitiva (Total_IC)");
        // el value conserva el nombre técnico de la columna.
        const texto = (typeof EtiquetasVariables !== 'undefined')
            ? EtiquetasVariables.etiquetaConColumna(nombre)
            : nombre;

        const option1 = document.createElement('option');
        option1.value = nombre;
        option1.textContent = texto;
        select1.appendChild(option1);

        const option2 = document.createElement('option');
        option2.value = nombre;
        option2.textContent = texto;
        select2.appendChild(option2);
    });

    // Restaurar la selección previa si las columnas siguen existiendo
    if (valor1) select1.value = valor1;
    if (valor2) select2.value = valor2;
}

// Oculta y vacía todos los contenedores de resultados antes de cada análisis,
// para que no se mezclen salidas de correlación y de comparación de grupos.
function limpiarResultados() {
    const ids = [
        'marcoMetodologicoContainer', 'resultadosDescriptivas', 'resultadosFiabilidad',
        'pruebasNormalidadContainer', 'resultadosCorrelacion', 'resultadosRegresion',
        'resultadosDispersion', 'resultadosDecision', 'resultadosReporteAPA',
        'resultadosDimensiones', 'resultadosDiscusion', 'resultadosContainer',
        'resultadosComparacion', 'resultadosChiCuadrado'
    ];
    ids.forEach(id => {
        const elem = document.getElementById(id);
        if (elem) {
            elem.style.display = 'none';
            elem.innerHTML = '';
        }
    });
}

function ejecutarAnalisis() {
    const boton = document.getElementById('btnAnalizar');
    const var1 = document.getElementById('variable1').value;
    const var2 = document.getElementById('variable2').value;
    const tipoAnalisisSeleccionado = document.querySelector('input[name="tipoAnalisis"]:checked');
    const tipoAnalisis = tipoAnalisisSeleccionado ? tipoAnalisisSeleccionado.value : 'correlacion';
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
            limpiarResultados();
            if (tipoAnalisis === 'comparacion') {
                ejecutarComparacion(var1, var2);
            } else if (tipoAnalisis === 'asociacion') {
                ejecutarChiCuadrado(var1, var2);
            } else {
                ejecutarCorrelacion(var1, var2, tipoPrueba);
            }
            mostrarToast('Análisis completado exitosamente', 'success');
        } catch (error) {
            mostrarToast(error.message, 'error');
            console.error(error);
        } finally {
            boton.disabled = false;
        }
    }, 300);
}

// Análisis de correlación entre dos variables cuantitativas.
// var1/var2 son NOMBRES DE COLUMNA (acceso a datos); et1/et2 son las etiquetas
// humanas que se usan en todos los textos visibles.
function ejecutarCorrelacion(var1, var2, tipoPrueba) {
    const unidadAnalisis = document.getElementById('unidadAnalisis').value;
    const lugarContexto = document.getElementById('lugarContexto').value;

    const hayEtiquetas = (typeof EtiquetasVariables !== 'undefined');
    const et1 = hayEtiquetas ? EtiquetasVariables.etiqueta(var1) : var1;
    const et2 = hayEtiquetas ? EtiquetasVariables.etiqueta(var2) : var2;

    // Criba vectorizada de candidatos dimensión↔variable: selecciona los
    // objetivos específicos EN FUNCIÓN DE LOS DATOS (|r| ≥ umbral, top-k).
    // Se ejecuta antes del marco para que ambos cuenten la misma historia.
    const criba = (typeof AnalisisDimensiones !== 'undefined')
        ? AnalisisDimensiones.cribarObjetivos(var1, var2)
        : null;

    const marco = generarMarcoParaAnalisis(var1, var2, et1, et2, unidadAnalisis, lugarContexto, criba);
    const resultado = AnalizadorEstadistico.calcularCorrelacion(var1, var2, tipoPrueba);

    // Análisis de objetivos específicos como HTML, para incrustarlo DENTRO del
    // bloque del marco. El guard (&& generarContenido) evita romper el análisis
    // si el módulo cargado fuera una versión anterior.
    const analisisDimensiones = (typeof AnalisisDimensiones !== 'undefined' && AnalisisDimensiones.generarContenido)
        ? AnalisisDimensiones.generarContenido(var1, var2, tipoPrueba, unidadAnalisis, lugarContexto)
        : '';

    mostrarMarcoMetodologico(marco, analisisDimensiones);
    mostrarDescriptivas(et1, et2, resultado);
    mostrarFiabilidad(var1, var2); // Cronbach accede a las columnas de ítems: nombres técnicos
    mostrarPruebasNormalidad(et1, et2, resultado);
    mostrarCorrelacion(et1, et2, resultado);
    mostrarRegresion(et1, et2, resultado);
    mostrarDispersion(et1, et2, resultado);
    mostrarDecision(et1, et2, resultado);
    mostrarReporteAPA(et1, et2, resultado);
    mostrarDiscusion(et1, et2, resultado, unidadAnalisis, lugarContexto, marco);
    mostrarReferencias(et1, et2, resultado);

    inicializarGraficos();
}

// Construye el marco metodológico con la información más rica disponible:
// con estructura del simulador usa las dimensiones reales (etiquetas) y las
// variables sociodemográficas categóricas para los objetivos comparativos;
// sin estructura, delega en el mecanismo legado del analizador.
function generarMarcoParaAnalisis(var1, var2, et1, et2, unidadAnalisis, lugarContexto, criba) {
    const hayEstructura = (typeof EtiquetasVariables !== 'undefined') && EtiquetasVariables.tieneEtiquetas();
    if (!hayEstructura) {
        return AnalizadorEstadistico.generarMarcoMetodologico(var1, var2, unidadAnalisis, lugarContexto);
    }

    // Objetivos específicos: SI HAY CRIBA, las frases salen directamente de la
    // selección basada en datos (mismo orden y redacción que la sección 🎯);
    // sin criba, todas las dimensiones de la estructura (comportamiento clásico).
    let dims1 = null, dims2 = null, objetivosPersonalizados = null;
    if (criba && criba.seleccionados && criba.seleccionados.length > 0) {
        objetivosPersonalizados = InterpretacionesEstadisticas.generarObjetivosDesdeSeleccion(
            criba.seleccionados, { unidadAnalisis, lugarContexto }
        );
    } else if (!criba) {
        const dimsDe = col => {
            const p = EtiquetasVariables.pruebaConGeneral(col);
            return p ? p.dimensiones.map(d => d.etiqueta) : null;
        };
        dims1 = dimsDe(var1);
        dims2 = dimsDe(var2);
    }

    return InterpretacionesEstadisticas.generarMarcoMetodologico(et1, et2, unidadAnalisis, lugarContexto, {
        dimensiones1: dims1,
        dimensiones2: dims2,
        objetivosPersonalizados: objetivosPersonalizados,
        sociodemograficos: obtenerColumnasCategoricas(4),
        configuracion: AnalizadorEstadistico.obtenerMarcoInvestigacion
            ? AnalizadorEstadistico.obtenerMarcoInvestigacion()
            : null
    });
}

// Columnas categóricas del dataset cargado (texto, sin contar ID), para los
// objetivos comparativos del marco. Limitadas a un máximo razonable.
function obtenerColumnasCategoricas(maximo) {
    const datos = AnalizadorEstadistico.obtenerDatos() || [];
    if (datos.length === 0) return [];
    return Object.keys(datos[0])
        .filter(col => col !== 'ID')
        .filter(col => {
            const v = datos[0][col];
            return typeof v === 'string' && isNaN(parseFloat(v));
        })
        .slice(0, maximo || 4);
}

// Comparación de una variable cuantitativa (var1) entre los grupos definidos
// por una variable de agrupación (var2). Solo admite 2 grupos.
function ejecutarComparacion(varCuantitativa, varAgrupacion) {
    const datos = AnalizadorEstadistico.obtenerDatos() || [];

    // Pares (valor cuantitativo, grupo) con ambos presentes
    const pares = datos
        .map(fila => [parseFloat(fila[varCuantitativa]), fila[varAgrupacion]])
        .filter(([valor, grupo]) => isFinite(valor) && grupo !== undefined && grupo !== null && grupo !== '');

    const gruposDistintos = [...new Set(pares.map(par => String(par[1])))].sort((a, b) => {
        const na = parseFloat(a), nb = parseFloat(b);
        return (isFinite(na) && isFinite(nb)) ? na - nb : a.localeCompare(b);
    });

    if (gruposDistintos.length < 2) {
        throw new Error(`La variable de agrupación "${varAgrupacion}" no tiene al menos 2 grupos distintos.`);
    }
    if (gruposDistintos.length > 10) {
        throw new Error(`La variable de agrupación "${varAgrupacion}" tiene demasiados grupos (${gruposDistintos.length}). Elige una variable categórica (p. ej. Sexo, condición).`);
    }

    const grupos = gruposDistintos.map(valor => pares.filter(par => String(par[1]) === valor).map(par => par[0]));
    const etiquetas = gruposDistintos.map(valor => `${varAgrupacion} = ${valor}`);

    if (gruposDistintos.length === 2) {
        const resultado = AnalizadorEstadistico.compararGrupos(grupos[0], grupos[1], etiquetas[0], etiquetas[1]);
        mostrarComparacion(varCuantitativa, varAgrupacion, resultado);
    } else {
        const resultado = AnalizadorEstadistico.compararVariosGrupos(grupos, etiquetas);
        mostrarComparacionVarios(varCuantitativa, varAgrupacion, resultado);
    }
}

// Prueba de chi-cuadrado de independencia entre dos variables categóricas.
function ejecutarChiCuadrado(var1, var2) {
    const datos = AnalizadorEstadistico.obtenerDatos() || [];
    const valores1 = datos.map(fila => fila[var1]);
    const valores2 = datos.map(fila => fila[var2]);
    const resultado = AnalizadorEstadistico.chiCuadradoIndependencia(valores1, valores2);
    mostrarChiCuadrado(var1, var2, resultado);
}

// Bandas de la V de Cramér (Cohen) para gl* = 1; sirve como guía general.
function interpretarCramerV(v) {
    if (v < 0.1) return 'asociación nula o muy débil';
    if (v < 0.3) return 'asociación débil';
    if (v < 0.5) return 'asociación moderada';
    return 'asociación fuerte';
}

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
                    <tr><td>p-valor:</td><td><strong>${resultado.pValor.toFixed(4)}</strong></td></tr>
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
            <!-- Gráficos Q-Q para evaluar visualmente la normalidad -->
            <div class="result-box">
                <p class="result-subtitle" style="margin-bottom: 0.5rem;">Gráficos Q-Q: si los puntos se alinean con la recta de referencia, la distribución es aproximadamente normal.</p>
                <div style="display: flex; gap: 1rem; flex-wrap: wrap; justify-content: center;">
                    <div id="histVariable1"></div>
                    <div id="qqVariable1"></div>
                    <div id="histVariable2"></div>
                    <div id="qqVariable2"></div>
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
        const cfg = { width: 360, height: 300, primaryColor: '#2E5BBA' };
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

    const dim1 = document.getElementById('dimensionesVar1').value.trim();
    const dim2 = document.getElementById('dimensionesVar2').value.trim();

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
                    <tr><td>Levene (igualdad de varianzas):</td><td>F(${resultado.levene.df1}, ${resultado.levene.df2}) = ${resultado.levene.estadistico.toFixed(3)}, p = ${resultado.levene.pValor.toFixed(4)} (${resultado.levene.varianzasIguales ? 'varianzas iguales' : 'varianzas desiguales'})</td></tr>
                    <tr><td>Prueba aplicada:</td><td><strong>${prueba.prueba}</strong></td></tr>
                    <tr><td>Estadístico:</td><td>${estadisticoTexto}</td></tr>
                    <tr><td>p-valor (bilateral):</td><td><strong>${prueba.pValor.toFixed(4)}</strong></td></tr>
                    <tr><td>Tamaño del efecto (d de Cohen):</td><td><strong>${ef.d.toFixed(3)}</strong> (${ef.interpretacion})</td></tr>
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
                    <tr><td>Levene (igualdad de varianzas):</td><td>F(${resultado.levene.df1}, ${resultado.levene.df2}) = ${resultado.levene.estadistico.toFixed(3)}, p = ${resultado.levene.pValor.toFixed(4)}</td></tr>
                    <tr><td>Prueba aplicada:</td><td><strong>${prueba.prueba}</strong></td></tr>
                    <tr><td>Estadístico:</td><td>${lineaPrueba}</td></tr>
                    <tr><td>p-valor:</td><td><strong>${prueba.pValor.toFixed(4)}</strong></td></tr>
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

// Construye la frase en formato APA de una comparación de grupos.
function lineaApaComparacion(varCuantitativa, varAgrupacion, resultado) {
    const prueba = resultado.prueba;
    const pTexto = formatearPApa(prueba.pValor);

    if (prueba.prueba === 'U de Mann-Whitney') {
        return `Se comparó ${varCuantitativa} entre los grupos de ${varAgrupacion} mediante la U de Mann-Whitney: U = ${prueba.U.toFixed(0)}, Z = ${prueba.z.toFixed(2)}, ${pTexto}.`;
    }
    if (prueba.prueba === 'ANOVA de una vía') {
        return `Una ANOVA de una vía comparó ${varCuantitativa} entre los grupos de ${varAgrupacion}: F(${prueba.glEntre}, ${prueba.glDentro}) = ${prueba.F.toFixed(2)}, ${pTexto}, η² = ${formatearRApa(prueba.etaCuadrado)}.`;
    }
    if (prueba.prueba === 'Kruskal-Wallis') {
        return `La prueba de Kruskal-Wallis comparó ${varCuantitativa} entre los grupos de ${varAgrupacion}: H(${prueba.gl}) = ${prueba.H.toFixed(2)}, ${pTexto}, ε² = ${formatearRApa(prueba.epsilonCuadrado)}.`;
    }
    // t de Student o de Welch
    const decimalesGl = prueba.prueba.includes('Welch') ? 2 : 0;
    const d = resultado.tamanoEfecto ? `, d de Cohen = ${formatearRApa(resultado.tamanoEfecto.d)}` : '';
    return `Se comparó ${varCuantitativa} entre los grupos de ${varAgrupacion} mediante la ${prueba.prueba}: t(${prueba.gl.toFixed(decimalesGl)}) = ${prueba.estadistico.toFixed(2)}, ${pTexto}${d}.`;
}

// HTML de la caja APA (frase citable + botón de copiar) para la comparación.
function bloqueApaComparacionHTML(linea) {
    return `
        <div class="result-box apa-box">
            <p class="apa-text">${linea}</p>
            <button type="button" id="btnCopiarComparacion" class="btn btn-outline">Copiar</button>
        </div>`;
}

// Conecta el botón de copiar de la comparación.
function conectarCopiaComparacion(linea) {
    const btn = document.getElementById('btnCopiarComparacion');
    if (btn) {
        btn.addEventListener('click', () => copiarTexto(linea));
    }
}

// Interpretación en lenguaje natural de la comparación de grupos.
// (delegado) La redacción vive en InterpretacionesEstadisticas.
function interpretarComparacion(varCuantitativa, varAgrupacion, resultado) {
    return InterpretacionesEstadisticas.generarInterpretacionComparacion(varCuantitativa, varAgrupacion, resultado);
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
        ['ANÁLISIS DE FIABILIDAD (ALFA DE CRONBACH)', textoContenedor('resultadosFiabilidad')],
        ['PRUEBA DE NORMALIDAD', textoContenedor('pruebasNormalidadContainer')],
        ['ANÁLISIS DE CORRELACIÓN', textoContenedor('resultadosCorrelacion')],
        ['REGRESIÓN LINEAL SIMPLE', textoContenedor('resultadosRegresion')],
        ['PRUEBA DE HIPÓTESIS', textoContenedor('resultadosDecision')],
        ['REPORTE EN FORMATO APA', textoContenedor('resultadosReporteAPA')],
        ['ANÁLISIS POR DIMENSIONES', textoContenedor('resultadosDimensiones')],
        ['DISCUSIÓN (PLANTILLA)', textoContenedor('resultadosDiscusion')],
        ['COMPARACIÓN DE GRUPOS', textoContenedor('resultadosComparacion')],
        ['ASOCIACIÓN (CHI-CUADRADO)', textoContenedor('resultadosChiCuadrado')]
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

function mostrarToast(mensaje, tipo = 'success', duracion = 3000) {
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
    }, duracion);
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
        let csv = 'Prueba,Escala,Tipo,NumItems,Distribucion,Media,DE,MinItem,MaxItem,Alfa\n';

        filas.forEach(fila => {
            const inputs = fila.querySelectorAll('input');
            const selectTipo = fila.querySelector('[aria-label="Tipo de escala"]');
            const selectDist = fila.querySelector('[aria-label="Distribución"]');
            const tipo = selectTipo ? selectTipo.value : 'dimension';
            const distribucion = selectDist ? selectDist.value : 'normal';
            const prueba = inputs[0].value.trim() || '';
            const escala = inputs[1].value.trim() || '';
            const numItems = inputs[2].value || '';
            const media = inputs[3].value || '';
            const de = inputs[4].value || '';
            const min = inputs[5].value || '';
            const max = inputs[6].value || '';
            const alfa = inputs[7] ? (inputs[7].value || '') : '';

            // Escapar valores con comas
            const esc = v => (v.includes(',') ? `"${v}"` : v);
            csv += `${esc(prueba)},${esc(escala)},${tipo},${numItems},${distribucion},${media},${de},${min},${max},${alfa}\n`;
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
            if (!encabezados.includes('numitems')) {
                mostrarToast('El archivo CSV no tiene el formato correcto. Encabezados esperados: Prueba,Escala,NumItems,Distribucion,Media,DE,MinItem,MaxItem,Alfa', 'error');
                return;
            }

            // Compatibilidad de formatos:
            //  nuevo:      Prueba,Escala,NumItems,Distribucion,Media,DE,MinItem,MaxItem,Alfa
            //  intermedio: Nombre,NumItems,Distribucion,Media,DE,MinItem,MaxItem,Alfa
            //  antiguo:    Nombre,NumItems,Media,DE,MinItem,MaxItem,Alfa
            const tienePruebaEscala = encabezados.includes('escala');
            const tieneTipo = encabezados.includes('tipo');
            const tieneDistribucion = encabezados.includes('distribucion');

            // Limpiar tabla actual
            const tbody = document.getElementById('bodyPruebas');
            tbody.innerHTML = '';

            // Procesar cada línea (saltar encabezados)
            for (let i = 1; i < lineas.length; i++) {
                const linea = lineas[i].trim();
                if (!linea) continue;

                const valores = parsearLineaCSV(linea);
                if (valores.length < 4) continue;

                if (tienePruebaEscala) {
                    const off = tieneTipo ? 1 : 0; // formato nuevo incluye columna Tipo
                    agregarFilaPruebaConDatos({
                        prueba: valores[0] || '',
                        nombre: valores[1] || '',
                        tipo: tieneTipo ? (valores[2] || 'dimension') : 'dimension',
                        numItems: valores[2 + off] || '',
                        distribucion: valores[3 + off] || 'normal',
                        media: valores[4 + off] || '',
                        de: valores[5 + off] || '',
                        min: valores[6 + off] || '',
                        max: valores[7 + off] || '',
                        alfa: valores[8 + off] || ''
                    });
                } else if (tieneDistribucion) {
                    // Formato sin columna Prueba: usar el mismo nombre como prueba y escala
                    agregarFilaPruebaConDatos({
                        prueba: valores[0] || '',
                        nombre: valores[0] || '',
                        numItems: valores[1] || '',
                        distribucion: valores[2] || 'normal',
                        media: valores[3] || '',
                        de: valores[4] || '',
                        min: valores[5] || '',
                        max: valores[6] || '',
                        alfa: valores[7] || ''
                    });
                } else {
                    agregarFilaPruebaConDatos({
                        prueba: valores[0] || '',
                        nombre: valores[0] || '',
                        numItems: valores[1] || '',
                        distribucion: 'normal',
                        media: valores[2] || '',
                        de: valores[3] || '',
                        min: valores[4] || '',
                        max: valores[5] || '',
                        alfa: valores[6] || ''
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

    const dist = datos.distribucion || 'normal';
    const opcion = (valor, etiqueta) => `<option value="${valor}"${dist === valor ? ' selected' : ''}>${etiqueta}</option>`;

    nuevaFila.innerHTML = `
        <td><input type="text" class="input input-sm" placeholder="Ej: WAIS-IV" maxlength="100" value="${datos.prueba || ''}" aria-label="Nombre de la prueba" list="listaPruebas"></td>
        <td><input type="text" class="input input-sm" placeholder="Ej: Memoria de trabajo" maxlength="100" value="${datos.nombre}" aria-label="Nombre de la escala"></td>
        <td>
            <select class="input input-sm" aria-label="Tipo de escala">
                <option value="dimension"${(datos.tipo || 'dimension') === 'dimension' ? ' selected' : ''}>Dimensión</option>
                <option value="general"${datos.tipo === 'general' ? ' selected' : ''}>General</option>
            </select>
        </td>
        <td><input type="number" class="input input-sm" placeholder="Ej: 60" min="1" value="${datos.numItems}" aria-label="Número de ítems"></td>
        <td>
            <select class="input input-sm" aria-label="Distribución">
                ${opcion('normal', 'Normal')}${opcion('uniforme', 'Uniforme')}${opcion('asimetrica', 'Asimétrica')}
            </select>
        </td>
        <td><input type="number" class="input input-sm" placeholder="Ej: 100" step="0.01" value="${datos.media}" aria-label="Media (M)"></td>
        <td><input type="number" class="input input-sm" placeholder="Ej: 15" step="0.01" min="0.01" value="${datos.de}" aria-label="Desviación estándar (DE)"></td>
        <td><input type="number" class="input input-sm" placeholder="Ej: 0" step="1" value="${datos.min}" aria-label="Mínimo por ítem"></td>
        <td><input type="number" class="input input-sm" placeholder="Ej: 5" step="1" value="${datos.max}" aria-label="Máximo por ítem"></td>
        <td><input type="number" class="input input-sm" placeholder="Ej: 0.85" step="0.01" min="0" max="0.99" value="${datos.alfa || ''}" aria-label="Alfa de Cronbach objetivo"></td>
        <td>
            <button type="button" class="btn-icon btn-delete" title="Eliminar" aria-label="Eliminar fila">
                <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 4H13M5 4V3C5 2.44772 5.44772 2 6 2H10C10.5523 2 11 2.44772 11 3V4M6 7V11M10 7V11M4 4H12L11.5 13C11.5 13.5523 11.0523 14 10.5 14H5.5C4.94772 14 4.5 13.5523 4.5 13L4 4Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
            </button>
        </td>
    `;

    tbody.appendChild(nuevaFila);
    actualizarLimitesPrueba(nuevaFila);
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
        let csv = 'Categoria,Distribucion,Promedio,DE,Minimo,Maximo,Decimales\n';

        filas.forEach(fila => {
            const inputs = fila.querySelectorAll('input');
            const select = fila.querySelector('select');
            const categoria = inputs[0].value.trim() || '';
            const distribucion = select ? select.value : 'normal';
            const promedio = inputs[1].value || '';
            const de = inputs[2].value || '';
            const min = inputs[3].value || '';
            const max = inputs[4].value || '';
            const decimales = inputs[5].value || '';

            // Escapar valores con comas
            const categoriaEscapada = categoria.includes(',') ? `"${categoria}"` : categoria;
            csv += `${categoriaEscapada},${distribucion},${promedio},${de},${min},${max},${decimales}\n`;
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

            // El formato nuevo incluye una columna "Distribucion" tras "Categoria";
            // se detecta por el encabezado para mantener compatibilidad con CSV viejos.
            const tieneDistribucion = encabezados.includes('distribucion');

            // Procesar cada línea (saltar encabezados)
            for (let i = 1; i < lineas.length; i++) {
                const linea = lineas[i].trim();
                if (!linea) continue;

                const valores = parsearLineaCSV(linea);

                if (valores.length >= 3) {
                    const desplazamiento = tieneDistribucion ? 1 : 0;
                    agregarFilaSocioConDatos({
                        categoria: valores[0] || '',
                        distribucion: tieneDistribucion ? (valores[1] || 'normal') : 'normal',
                        promedio: valores[1 + desplazamiento] || '',
                        de: valores[2 + desplazamiento] || '',
                        min: valores[3 + desplazamiento] || '',
                        max: valores[4 + desplazamiento] || '',
                        decimales: valores[5 + desplazamiento] || '2'
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

    const dist = datos.distribucion || 'normal';
    const opcion = (valor, etiqueta) => `<option value="${valor}"${dist === valor ? ' selected' : ''}>${etiqueta}</option>`;

    nuevaFila.innerHTML = `
        <td><input type="text" class="input input-sm" placeholder="Ej: Edad" value="${datos.categoria}" aria-label="Categoría"></td>
        <td>
            <select class="input input-sm" aria-label="Distribución">
                ${opcion('normal', 'Normal')}${opcion('uniforme', 'Uniforme')}${opcion('asimetrica', 'Asimétrica')}${opcion('conteo', 'Conteo (Poisson)')}${opcion('binaria', 'Binaria (0/1)')}${opcion('categorica', 'Categórica')}
            </select>
        </td>
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
    actualizarBloqueoSocio(nuevaFila);
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

    const totales = numericas.filter(key => /^(Total|Dimension|General)_/i.test(key));
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
