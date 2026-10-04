// analizador/ui/carga.js — carga de datos (CSV o base generada), columnas y desplegables.
// Origen: analizador-ui.js (Fase 3), sin cambios de comportamiento; dependencias explícitas.

import { estado, CLAVES } from '../../shared/estado.js';
import { ComparacionGrupos } from '../comparacion-grupos.js';
import { AnalizadorEstadistico } from '../estadistica.js';
import { Fiabilidad } from '../fiabilidad.js';
import { RegresionMultiple } from '../regresion.js';
import { ejecutarAnalisis } from './analisis.js';
import { EtiquetasVariables } from '../../shared/etiquetas-variables.js';
import { obtenerEtiquetaOpcion } from '../../shared/etiquetas.js';
import { desplazarHacia, renderizarTablaDatos } from '../../shared/tabla-datos.js';
import { mostrarToast } from '../../shared/toast.js';

// Ajusta las etiquetas de los selectores según el tipo de análisis elegido.
function actualizarEtiquetasAnalisis() {
    const seleccionado = document.querySelector('input[name="tipoAnalisis"]:checked');
    const tipo = seleccionado ? seleccionado.value : 'correlacion';
    if (window.datosGenerados && window.datosGenerados.length) poblarSelectsVariables(window.datosGenerados);   // (F3) las opciones dependen del tipo
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
    const hintTA = document.getElementById('hintTipoAnalisis');
    if (hintTA) {
        const textos = {
            correlacion: 'Finalidad: medir si dos variables cuantitativas se mueven juntas — la dirección (positiva/negativa) y la fuerza de esa asociación. Responde a preguntas como «¿a mayor inteligencia emocional, mayor rendimiento?» (asociación, no causa).',
            comparacion: 'Finalidad: comprobar si los grupos de una variable categórica difieren en una variable numérica (p. ej., ¿difiere el puntaje entre hombres y mujeres, o entre carreras?).',
            asociacion: 'Finalidad: evaluar si dos variables categóricas están relacionadas entre sí (p. ej., ¿el sexo se asocia con la elección de carrera?).'
        };
        hintTA.textContent = textos[tipo] || '';
    }
}

function cargarDatosGenerados() {
    try {
        // Verificar que AnalizadorEstadistico esté disponible
        //if (typeof AnalizadorEstadistico === 'undefined') {
        //    mostrarToast('Error: El analizador estadístico no está cargado. Recarga la página.', 'error');
        //    return;
        //}
        const paquete = estado.get(CLAVES.BASE_SIMULADOR);   // publicado por el Simulador al generar (sin importarlo)
        const datos = paquete ? paquete.datos : null;
        if (!datos || datos.length === 0) {
            mostrarToast('No hay datos generados. Genera una base de datos primero.', 'warning');
            return;
        }
        if (typeof AnalizadorEstadistico === 'undefined') {
            mostrarToast('Error: AnalizadorEstadistico indefinido', 'error');
            return;
        }
        AnalizadorEstadistico.cargarDatos(datos);
        // Registrar etiquetas humanas y estructura de pruebas (estilo SPSS):
        // la interfaz mostrará "Inteligencia Cognitiva" en vez de "Total_IC".
        // Con datos del simulador NO se ofrece el editor: las etiquetas son las
        // configuradas en la sección Simulador.
        if (typeof EtiquetasVariables !== 'undefined' && paquete) {
            EtiquetasVariables.fijar(
                paquete.etiquetas,
                paquete.estructura
            );
            if (EtiquetasVariables.mostrarVacio) {
                EtiquetasVariables.mostrarVacio('editorEtiquetas', '🧪 Datos del Simulador: las etiquetas ya vienen configuradas desde la sección Simulador, así que aquí no hay nada que renombrar. Este editor se activa al subir un CSV externo.');
            } else {
                EtiquetasVariables.ocultarEditor('editorEtiquetas');
            }
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
                // Columnas totalmente vacías: el editor avisará si alguna es de puntaje.
                const _numericas = obtenerColumnasNumericas(datos);
                EtiquetasVariables._columnasVacias = Object.keys(datos[0] || {}).filter(c =>
                    c !== 'ID' && !_numericas.includes(c) &&
                    datos.every(f => f[c] === '' || f[c] === null || f[c] === undefined || (typeof f[c] === 'number' && isNaN(f[c])))
                );
                EtiquetasVariables.mostrarEditor('editorEtiquetas', _numericas, function () {
                    poblarSelectsVariables(AnalizadorEstadistico.obtenerDatos());
                    // Si ya hay un análisis en pantalla y las dos variables siguen
                    // seleccionadas, se regenera solo con los nuevos nombres.
                    const marcoVisible = document.getElementById('marcoMetodologicoContainer');
                    const v1 = document.getElementById('variable1').value;
                    const v2 = document.getElementById('variable2').value;
                    if (marcoVisible && marcoVisible.style.display !== 'none' && v1 && v2) {
                        ejecutarAnalisis();
                        mostrarToast('Etiquetas aplicadas: el reporte se regeneró con los nuevos nombres', 'success');
                    } else {
                        mostrarToast('Etiquetas aplicadas: los textos del análisis usarán los nuevos nombres', 'success');
                    }
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
    // Configurador de dimensiones: detección automática editable
    if (typeof Fiabilidad !== 'undefined' && Fiabilidad.mostrarConfigurador) {
        Fiabilidad.mostrarConfigurador('configuradorDimensiones', datos);
    }
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
    try { window.__numsDisponibles = (typeof obtenerColumnasNumericas === 'function') ? obtenerColumnasNumericas(datos) : []; } catch (e) { window.__numsDisponibles = []; }
    const bAV = document.getElementById('btnAgregarVariable');
    if (bAV) bAV.style.display = (window.__numsDisponibles.length >= 3) ? '' : 'none';
    document.querySelectorAll('#varsExtraCont select, #regPredsCont select').forEach(s => {
        const val = s.value;
        s.innerHTML = '<option value="">Seleccionar variable…</option>' + window.__numsDisponibles.map(c => `<option value="${c}">${obtenerEtiquetaOpcion(c)}</option>`).join('');
        
        s.value = val;
    });
    if (typeof ComparacionGrupos !== 'undefined') ComparacionGrupos.actualizarSelects();
    if (typeof RegresionMultiple !== 'undefined') RegresionMultiple.actualizarSelects();
    // Selects opcionales de la regresión bivariada (con opción en blanco).
    try {
        const nums = (typeof obtenerColumnasNumericas === 'function') ? obtenerColumnasNumericas(datos) : [];
        ['regDep', 'regInd'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '<option value="">Seleccionar variable…</option>'
                + nums.map(c => `<option value="${c}">${obtenerEtiquetaOpcion(c)}</option>`).join('');
        });
    } catch (e) { /* opcional */ }
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
    // (F3) Las categóricas con etiquetas de texto (Sexo: Femenino/Masculino, niveles, desenlaces) solo
    // entran donde tienen sentido: como agrupación en la comparación y en ambas variables de la asociación.
    // Antes, con las etiquetas de texto que el Simulador escribe desde B9, «Sexo» no aparecía en el desplegable.
    const tipoActual = (document.querySelector('input[name="tipoAnalisis"]:checked') || { value: 'correlacion' }).value;
    if (tipoActual !== 'correlacion') {
        const categoricas = Object.keys(datos[0] || {}).filter(col => col !== 'ID' && !columnasNumericas.includes(col) && typeof datos[0][col] === 'string');
        categoricas.forEach(col => {
            const texto = (typeof EtiquetasVariables !== 'undefined') ? EtiquetasVariables.etiquetaConColumna(col) : col;
            const op2 = document.createElement('option'); op2.value = col; op2.textContent = texto; select2.appendChild(op2);
            if (tipoActual === 'asociacion') { const op1 = document.createElement('option'); op1.value = col; op1.textContent = texto; select1.appendChild(op1); }
        });
    }
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

export { actualizarEtiquetasAnalisis, cargarDatosGenerados, cargarArchivoCSV, mostrarDatosCargados, obtenerColumnasNumericas, poblarSelectsVariables, limpiarResultados, obtenerColumnasCategoricas };
