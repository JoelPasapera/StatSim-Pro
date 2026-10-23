// analizador/ui/carga.js — carga de datos (CSV, libro de Excel .xlsx, base de SPSS .sav o base generada), columnas y
// desplegables.
// Origen: analizador-ui.js (Fase 3), sin cambios de comportamiento; dependencias explícitas.

import { estado, CLAVES } from '../../shared/estado.js';
import { ComparacionGrupos } from '../comparacion-grupos.js';
import { AnalizadorEstadistico } from '../estadistica.js';
import { Fiabilidad } from '../fiabilidad.js';
import { RegresionMultiple } from '../regresion.js';
import { ejecutarAnalisis, olvidarAnalisisAnterior } from './analisis.js';
import { bus, EVENTOS } from '../../shared/eventos.js';
import { EtiquetasVariables } from '../../shared/etiquetas-variables.js';
import { obtenerEtiquetaOpcion } from '../../shared/etiquetas.js';
import { desplazarHacia, renderizarTablaDatos } from '../../shared/tabla-datos.js';
import { codificacionBinaria } from '../motor/dependiente-binaria.js';
import { mostrarToast } from '../../shared/toast.js';
import { esPerdido, esColumnaNumerica, esColumnaTexto } from '../../core/data/celdas.js';
import { leerSav } from '../../core/data/sav/lector.js';
import { baseDesdeSav } from '../motor/datos-spss.js';
import { leerXlsx } from '../../core/data/xlsx/lector.js';
import { baseDesdeXlsx, hojaPorOmision, hojasConDatos } from '../motor/datos-xlsx.js';
import { leerCSVDetallado } from '../motor/datos.js';
import { avisoDeCodificacion, decodificarTexto } from '../../core/data/codificacion.js';
import { leerBytes } from '../../shared/archivos.js';
import { escaparHTML } from '../../shared/html.js';
import { sinMarcadoEnTodo } from '../../core/data/texto.js';

// Ajusta las etiquetas de los selectores según el tipo de análisis elegido.
function actualizarEtiquetasAnalisis() {
    const seleccionado = document.querySelector('input[name="tipoAnalisis"]:checked');
    const tipo = seleccionado ? seleccionado.value : 'correlacion';
    // (F3) las opciones dependen del tipo. (2026.12.20) Y salen de los datos CARGADOS en el Analizador (del Simulador o de un
    // CSV): hasta la 2026.12.19 salían de window.datosGenerados, que solo fija la carga desde el Simulador, de modo que con
    // un CSV, al pasar a «comparación», la variable de agrupación no aparecía (o aparecían las de la base simulada anterior).
    const cargados = AnalizadorEstadistico.obtenerDatos();
    const datosActuales = (cargados && cargados.length) ? cargados : window.datosGenerados;
    if (datosActuales && datosActuales.length) poblarSelectsVariables(datosActuales);
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
        let datos = paquete ? paquete.datos : null;
        if (!datos || datos.length === 0) {
            mostrarToast('No hay datos generados. Genera una base de datos primero.', 'warning');
            return;
        }
        if (typeof AnalizadorEstadistico === 'undefined') {
            mostrarToast('Error: AnalizadorEstadistico indefinido', 'error');
            return;
        }
        // (2026.12.29, revisión) Los nombres de las columnas y las categorías, sin «<» ni «>» (core/data/texto.js), como los de
        // un CSV o un .sav: el Simulador puede traer los de un CSV de configuración ajeno, y el Analizador los pinta en sus
        // informes. Sin copia si no hay nada que cambiar.
        datos = sinMarcadoEnTodo(datos);
        // (2027.01.01) con los códigos de sus categorías (los del Simulador: «0 = No, 1 = Sí»), sin marcado como los datos
        AnalizadorEstadistico.cargarDatos(datos, { codigosDeCategorias: paquete && paquete.codigosDeCategorias ? sinMarcadoEnTodo(paquete.codigosDeCategorias) : null });
        // Registrar etiquetas humanas y estructura de pruebas (estilo SPSS):
        // la interfaz mostrará "Inteligencia Cognitiva" en vez de "Total_IC".
        // Con datos del simulador NO se ofrece el editor: las etiquetas son las
        // configuradas en la sección Simulador.
        if (paquete) mostrarEtiquetasDelSimulador(paquete.etiquetas, paquete.estructura);
        ocultarSelectorDeHojas();
        origenDatos = { tipo: 'simulador' };
        mostrarDatosCargados(datos);
        mostrarToast('Datos cargados exitosamente', 'success');
        // Almacenar datos generados globalmente para los gráficos
        window.datosGenerados = datos;
    } catch (error) {
        mostrarToast(error.message, 'error');
    }
}

// Con datos del Simulador las etiquetas y la estructura de pruebas llegan de él, y el editor no se ofrece.
function mostrarEtiquetasDelSimulador(etiquetas, estructura) {
    if (typeof EtiquetasVariables === 'undefined') return;
    EtiquetasVariables.fijar(etiquetas, estructura);
    if (EtiquetasVariables.mostrarVacio) {
        EtiquetasVariables.mostrarVacio('editorEtiquetas', '🧪 Datos del Simulador: las etiquetas ya vienen configuradas desde la sección Simulador, así que aquí no hay nada que renombrar. Este editor se activa al subir un CSV externo.');
    } else {
        EtiquetasVariables.ocultarEditor('editorEtiquetas');
    }
}

// (2026.12.31) De dónde vienen los datos cargados ({ tipo: 'simulador' | 'csv' | 'sav' | 'xlsx', archivo?, hoja? }): el
// proyecto lo guarda para restaurarlos igual (motor de las etiquetas, el editor y el resumen).
let origenDatos = null;

// (2026.12.29) Qué se puede subir: un CSV (o un texto separado por tabuladores: .tsv, .txt) o una base de SPSS (.sav, y
// .zsav, la comprimida). La extensión, sin distinguir mayúsculas («DATOS.CSV» se rechazaba). (2026.12.31) Y un libro de
// Excel (.xlsx, .xlsm); los .xls, .xlsb y .ods pasan también por su lector, que dice cómo convertirlos.
const TIPOS_DE_ARCHIVO = Object.freeze({ csv: 'csv', tsv: 'csv', txt: 'csv', sav: 'sav', zsav: 'sav', xlsx: 'xlsx', xlsm: 'xlsx', xls: 'xlsx', xlsb: 'xlsx', ods: 'xlsx' });

function tipoDeArchivo(nombre) {
    const m = /\.([a-z0-9]+)$/i.exec(String(nombre || ''));
    return m ? (TIPOS_DE_ARCHIVO[m[1].toLowerCase()] || null) : null;
}

// Tras «Aplicar etiquetas»: los desplegables con los nombres nuevos y, si hay un análisis en pantalla con sus dos
// variables, el reporte de nuevo.
function alAplicarEtiquetas() {
    poblarSelectsVariables(AnalizadorEstadistico.obtenerDatos());
    const marcoVisible = document.getElementById('marcoMetodologicoContainer');
    const v1 = document.getElementById('variable1').value;
    const v2 = document.getElementById('variable2').value;
    if (marcoVisible && marcoVisible.style.display !== 'none' && v1 && v2) {
        ejecutarAnalisis();
        mostrarToast('Etiquetas aplicadas: el reporte se regeneró con los nuevos nombres', 'success');
    } else {
        mostrarToast('Etiquetas aplicadas: los textos del análisis usarán los nuevos nombres', 'success');
    }
}

// Base EXTERNA: las etiquetas anteriores se descartan (las de un .sav llegan en `etiquetas`) y se ofrece el editor para
// renombrar las columnas de puntaje; sin ninguna, `notaSinPuntajes` (si se da) explica la sección en lugar del aviso.
function prepararEditorEtiquetas(datos, etiquetas, notaSinPuntajes) {
    if (typeof EtiquetasVariables === 'undefined') return;
    EtiquetasVariables.limpiar();
    if (etiquetas && Object.keys(etiquetas).length) EtiquetasVariables.fijar(etiquetas, []);
    // Columnas totalmente vacías: el editor avisará si alguna es de puntaje.
    const numericas = obtenerColumnasNumericas(datos);
    EtiquetasVariables._columnasVacias = Object.keys(datos[0] || {}).filter(c =>
        c !== 'ID' && !numericas.includes(c) && datos.every(f => esPerdido(f[c]))
    );
    if (notaSinPuntajes && !EtiquetasVariables.columnasRenombrables(numericas).length && !EtiquetasVariables.columnasRenombrables(EtiquetasVariables._columnasVacias).length) {
        EtiquetasVariables._columnasVacias = [];
        EtiquetasVariables.mostrarVacio('editorEtiquetas', notaSinPuntajes);
        return;
    }
    EtiquetasVariables.mostrarEditor('editorEtiquetas', numericas, alAplicarEtiquetas);
}

// Un CSV: sus bytes como texto (UTF-8, UTF-16 o el ANSI de Excel en español: core/data/codificacion.js) y sus filas
// (motor/datos.js: comillas, delimitador, filas descartadas, nombres repetidos y separadores de miles, con avisos).
// Acepta también el texto ya decodificado.
function cargarTextoCSV(contenido) {
    const lecturaTexto = typeof contenido === 'string' ? { texto: contenido, codificacion: /** @type {const} */ ('utf-8'), invalidos: 0 } : decodificarTexto(contenido);
    const { texto } = lecturaTexto;
    const lectura = leerCSVDetallado(texto);
    AnalizadorEstadistico.cargarDatos(lectura.filas);
    origenDatos = { tipo: 'csv' };
    const datos = AnalizadorEstadistico.obtenerDatos();
    prepararEditorEtiquetas(datos, null, null);
    mostrarDatosCargados(datos);
    const avisos = [...lectura.avisos];
    const avisoTexto = avisoDeCodificacion(lecturaTexto);   // ANSI, o UTF-8 con caracteres dañados
    if (avisoTexto) avisos.unshift(avisoTexto);
    const resumen = `Archivo CSV cargado: ${datos.length} casos y ${lectura.columnas.length} variables`;
    if (avisos.length) mostrarToast(`${resumen}. Ten en cuenta: ${avisos.join('; ')}.`, 'warning', 9000);
    else mostrarToast(resumen, 'success');
}

// Una base de SPSS: los perdidos como celdas vacías, las fechas como fechas, las categorías con etiqueta de valor como
// texto (los ítems de un instrumento siguen siendo números) y las etiquetas de variable del archivo como etiquetas
// (motor/datos-spss.js).
async function cargarBytesSav(bytes) {
    const archivo = await leerSav(bytes);
    if (!archivo.n) throw new Error('El archivo de SPSS no tiene casos: no hay nada que analizar');
    const base = baseDesdeSav(archivo);
    AnalizadorEstadistico.cargarDatos(base.filas, { codigosDeCategorias: base.codigosDeCategorias });   // (2027.01.01) sus etiquetas de valor
    origenDatos = { tipo: 'sav' };
    const datos = AnalizadorEstadistico.obtenerDatos();
    const conEtiqueta = Object.keys(base.etiquetas).length;
    prepararEditorEtiquetas(datos, base.etiquetas, `📊 Archivo de SPSS: ${conEtiqueta ? `las etiquetas de variable vienen del archivo (${conEtiqueta} de ${archivo.variables.length} variables tienen una) y los textos del análisis las usan` : 'el archivo no trae etiquetas de variable, así que los textos del análisis usarán los nombres de las columnas'}. Este editor lista solo las columnas de puntaje (<code>General_</code>, <code>Dimension_</code> o <code>Total_</code>), y tu base no tiene ninguna.`);
    mostrarDatosCargados(datos);
    const partes = [`${archivo.n} casos y ${archivo.variables.length} variables`];
    if (base.categoricas.length) partes.push(`${base.categoricas.length} con etiquetas de valor pasan a categorías`);
    if (base.fechas.length) partes.push(`${base.fechas.length} de fecha`);
    const resumen = `Archivo de SPSS cargado: ${partes.join('; ')}`;
    // un solo aviso (el siguiente taparía al anterior): el resumen y, si los hay, los avisos, con más tiempo para leerlos
    if (base.avisos.length) mostrarToast(`${resumen}. Ten en cuenta: ${base.avisos.join('; ')}.`, 'warning', 9000);
    else mostrarToast(resumen, 'success', 5000);
}

// Carga el archivo elegido en el selector (un CSV, un libro de Excel o un .sav). Se exporta también con su nombre
// anterior, cargarArchivoCSV.
async function cargarArchivo(e) {
    const entrada = e.target;
    const file = entrada && entrada.files ? entrada.files[0] : null;
    if (!file) return;
    // Vaciar el selector: así, elegir de nuevo el mismo archivo (tras corregirlo) vuelve a cargarlo.
    try { entrada.value = ''; } catch (err) { /* algunos navegadores antiguos no lo permiten */ }
    const tipo = tipoDeArchivo(file.name);
    if (!tipo) {
        mostrarToast('Por favor selecciona un archivo CSV, un libro de Excel (.xlsx) o una base de SPSS (.sav)', 'error');
        return;
    }
    let contenido;
    try {
        contenido = await leerBytes(file);
    } catch (error) {
        mostrarToast('No se pudo leer el archivo', 'error');
        return;
    }
    try {
        if (tipo === 'sav') await cargarBytesSav(contenido);
        else if (tipo === 'xlsx') await cargarBytesXlsx(contenido);
        else cargarTextoCSV(contenido);
        if (tipo !== 'xlsx') ocultarSelectorDeHojas();
        if (origenDatos) origenDatos.archivo = sinMarcadoEnTodo(String(file.name || ''));
    } catch (error) {
        mostrarToast(error.message, 'error');
    }
}

// (2026.12.31) El último libro de Excel cargado, para cambiar de hoja sin volver a leerlo.
let libroXlsx = null;

// Un libro de Excel: su hoja de datos (la del Simulador, si es un libro suyo, o la primera visible con datos) y, si tiene
// más hojas con datos, el selector para cambiar de hoja.
// Si esa hoja no sirve (solo tiene encabezados, p. ej.), la siguiente con datos.
async function cargarBytesXlsx(bytes) {
    if (bytes.length > 2e6) mostrarToast('Leyendo el libro de Excel…', 'info', 4000);   // uno grande tarda unos segundos
    const libro = await leerXlsx(bytes);
    const porOmision = hojaPorOmision(libro);
    if (!porOmision) throw new Error('El libro de Excel no tiene datos: todas sus hojas están vacías');
    let primerError = null;
    for (const hoja of [porOmision, ...hojasConDatos(libro).filter(h => h.indice !== porOmision.indice)]) {
        try {
            cargarHojaXlsx(libro, hoja.indice);
            libroXlsx = libro;
            mostrarSelectorDeHojas(libro, hoja.indice);
            return;
        } catch (error) {
            if (!primerError) primerError = error;
        }
    }
    throw primerError;
}

// Una hoja del libro como base del Analizador (motor/datos-xlsx.js). Si la hoja no sirve (vacía, o solo con
// encabezados), un error, y la base anterior sigue cargada.
function cargarHojaXlsx(libro, indice) {
    const base = baseDesdeXlsx(libro, indice);
    const nombre = libro.hojas[indice].nombre;
    if (!base.filas.length) throw new Error(`La hoja «${sinMarcadoEnTodo(nombre)}» tiene encabezados pero ninguna fila de datos`);
    AnalizadorEstadistico.cargarDatos(base.filas, { codigosDeCategorias: base.codigosDeCategorias });   // (2027.01.01) los del diccionario del Simulador
    origenDatos = { tipo: 'xlsx', hoja: sinMarcadoEnTodo(nombre), archivo: origenDatos && origenDatos.tipo === 'xlsx' ? origenDatos.archivo : undefined };
    const datos = AnalizadorEstadistico.obtenerDatos();
    const conEtiqueta = Object.keys(base.etiquetas).length;
    prepararEditorEtiquetas(datos, base.etiquetas, base.delSimulador
        ? `📊 Libro de Excel del Simulador: las etiquetas de variable vienen de su hoja «Diccionario» (${conEtiqueta} de ${base.columnas.length} variables tienen una) y los textos del análisis las usan. Este editor lista solo las columnas de puntaje (<code>General_</code>, <code>Dimension_</code> o <code>Total_</code>), y tu base no tiene ninguna.`
        : null);
    mostrarDatosCargados(datos);
    const partes = [`${datos.length} casos y ${base.columnas.length} variables`];
    if (base.fechas.length) partes.push(`${base.fechas.length} de fecha`);
    if (conEtiqueta) partes.push(`${conEtiqueta} con su etiqueta del diccionario`);
    const hojas = hojasConDatos(libro).length;
    const resumen = `Libro de Excel cargado (hoja «${sinMarcadoEnTodo(nombre)}»${hojas > 1 ? `, una de ${hojas} con datos: elige otra en «Hoja del libro»` : ''}): ${partes.join('; ')}`;
    if (base.avisos.length) mostrarToast(`${resumen}. Ten en cuenta: ${base.avisos.join('; ')}.`, 'warning', 9000);
    else mostrarToast(resumen, 'success', 5000);
}

// El selector de hojas: visible solo si el libro tiene más de una hoja con datos (las ocultas, al final y marcadas).
function mostrarSelectorDeHojas(libro, indice) {
    const cont = document.getElementById('selectorHojaXlsx');
    const select = document.getElementById('hojaXlsx');
    if (!cont || !select) return;
    const opciones = hojasConDatos(libro);
    if (opciones.length < 2) { ocultarSelectorDeHojas(); return; }
    select.innerHTML = opciones.map(h => `<option value="${h.indice}">${escaparHTML(sinMarcadoEnTodo(h.nombre))}${h.oculta ? ' (oculta)' : ''} · ${h.filas} fila(s)</option>`).join('');
    select.value = String(indice);
    select.dataset.cargada = String(indice);
    cont.style.display = '';
}

function ocultarSelectorDeHojas() {
    libroXlsx = null;
    const cont = document.getElementById('selectorHojaXlsx');
    if (cont) cont.style.display = 'none';
}

// Al elegir otra hoja: se carga esa (si no sirve, se avisa y el selector vuelve a la que está cargada).
function alCambiarHojaXlsx(e) {
    if (!libroXlsx) return;
    const select = e.target;
    const indice = Number(select.value);
    const anterior = select.dataset.cargada !== undefined ? Number(select.dataset.cargada) : null;
    try {
        cargarHojaXlsx(libroXlsx, indice);
        select.dataset.cargada = String(indice);
    } catch (error) {
        mostrarToast(error.message, 'error');
        if (anterior !== null) select.value = String(anterior);
    }
}

function mostrarDatosCargados(datos) {
    // (2027.01.01, revisión) otros datos: lo calculado con los anteriores ya no vale. Los resultados de la pantalla, el
    // análisis que lee el Word y lo de cada tarjeta y del SEM (que lo olvidan al oír el aviso) se van; hasta la revisión
    // seguían ahí, y el Word, lo descargado y lo impreso mezclaban la base anterior con la nueva
    limpiarResultados();
    olvidarAnalisisAnterior();
    bus.emit(EVENTOS.DATOS_CARGADOS);
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

// Columnas numéricas analizables del dataset (excluye el identificador). (2026.12.18) El tipo, por el primer valor NO
// perdido y con la conversión del núcleo (core/data/celdas.js): antes, por la primera fila, de modo que una celda vacía en
// el primer participante sacaba la columna de los desplegables, y una fecha («2024-05-01») contaba como número.
function obtenerColumnasNumericas(datos) {
    if (!datos || datos.length === 0) return [];
    return Object.keys(datos[0]).filter(col => col !== 'ID' && esColumnaNumerica(datos, col));
}

// Puebla los selectores de variables del analizador. Reutilizable: se llama al
// cargar datos y también al aplicar nuevas etiquetas (para refrescar los textos).
function poblarSelectsVariables(datos) {
    try { window.__numsDisponibles = (typeof obtenerColumnasNumericas === 'function') ? obtenerColumnasNumericas(datos) : []; } catch (e) { window.__numsDisponibles = []; }
    const bAV = document.getElementById('btnAgregarVariable');
    if (bAV) bAV.style.display = (window.__numsDisponibles.length >= 3) ? '' : 'none';
    document.querySelectorAll('#varsExtraCont select, #regPredsCont select').forEach(s => {
        const val = s.value;
        // (2026.12.29) nombres y etiquetas escapados: llegan de un CSV o de un .sav ajeno
        s.innerHTML = '<option value="">Seleccionar variable…</option>' + window.__numsDisponibles.map(c => `<option value="${escaparHTML(c)}">${escaparHTML(obtenerEtiquetaOpcion(c))}</option>`).join('');
        
        s.value = val;
    });
    if (typeof ComparacionGrupos !== 'undefined') ComparacionGrupos.actualizarSelects();
    if (typeof RegresionMultiple !== 'undefined') RegresionMultiple.actualizarSelects();
    // Selects opcionales de la regresión bivariada (con opción en blanco).
    try {
        const nums = (typeof obtenerColumnasNumericas === 'function') ? obtenerColumnasNumericas(datos) : [];
        // (2027.01.01) la dependiente puede ser también una variable de dos categorías con nombre (el desenlace «No / Sí»
        // del Simulador): la regresión la modela con la logística, con el evento en el 1 (motor/dependiente-binaria.js)
        const enNumeros = new Set(nums);
        const binarias = Object.keys(datos[0] || {}).filter(c => c !== 'ID' && !enNumeros.has(c))
            .map(c => ({ c, b: codificacionBinaria(datos.map(d => d[c]), AnalizadorEstadistico.codigosDe(c)) })).filter(x => x.b);
        ['regDep', 'regInd'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            // (2027.01.01, revisión) la elección se conserva, como la de los predictores adicionales: cambiar el tipo de
            // análisis vuelve a poblar estas listas, y hasta ahora borraba la regresión que ya se había elegido
            const previo = el.value;
            el.innerHTML = '<option value="">Seleccionar variable…</option>'
                + nums.map(c => `<option value="${escaparHTML(c)}">${escaparHTML(obtenerEtiquetaOpcion(c))}</option>`).join('')
                + (id === 'regDep' ? binarias.map(({ c, b }) => `<option value="${escaparHTML(c)}">${escaparHTML(`${obtenerEtiquetaOpcion(c)} (dos categorías: ${b.referencia} = 0, ${b.evento} = 1)`)}</option>`).join('') : '');
            if (previo && [...el.options].some(o => o.value === previo)) el.value = previo;
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
        const categoricas = Object.keys(datos[0] || {}).filter(col => col !== 'ID' && !columnasNumericas.includes(col) && esColumnaTexto(datos, col));
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
        .filter(col => col !== 'ID' && esColumnaTexto(datos, col))   // (2026.12.18) por el primer valor no perdido
        .slice(0, maximo || 4);
}

// (2026.12.31) Para el archivo de proyecto (analizador/ui/proyecto.js): los datos cargados, sus etiquetas, su estructura de
// pruebas, su origen y (2027.01.01) los códigos de sus categorías (null si no hay datos), y su restauración, como los dejó
// la carga.
function estadoDeLosDatos() {
    const filas = AnalizadorEstadistico.obtenerDatos();
    if (!filas || !filas.length) return null;
    const ev = typeof EtiquetasVariables !== 'undefined' ? EtiquetasVariables : null;
    return { filas, etiquetas: ev ? { ...ev._mapa } : {}, estructura: ev ? ev.estructura() : [], origen: origenDatos ? { ...origenDatos } : { tipo: 'csv' }, codigosDeCategorias: AnalizadorEstadistico.todosLosCodigos() };
}

function restaurarDatos({ filas, etiquetas, estructura, origen, codigosDeCategorias = null }) {
    AnalizadorEstadistico.cargarDatos(sinMarcadoEnTodo(filas), { codigosDeCategorias: codigosDeCategorias ? sinMarcadoEnTodo(codigosDeCategorias) : null });
    const datos = AnalizadorEstadistico.obtenerDatos();
    ocultarSelectorDeHojas();
    if (origen && origen.tipo === 'simulador') {
        mostrarEtiquetasDelSimulador(etiquetas, estructura);
        window.datosGenerados = datos;
    } else {
        prepararEditorEtiquetas(datos, etiquetas, null);
    }
    origenDatos = origen ? { ...origen } : { tipo: 'csv' };
    mostrarDatosCargados(datos);
    return datos;
}

export { estadoDeLosDatos, restaurarDatos };
export { actualizarEtiquetasAnalisis, cargarDatosGenerados, cargarArchivo, cargarArchivo as cargarArchivoCSV, cargarBytesSav, cargarBytesXlsx, cargarTextoCSV, alCambiarHojaXlsx, tipoDeArchivo, mostrarDatosCargados, obtenerColumnasNumericas, poblarSelectsVariables, limpiarResultados, obtenerColumnasCategoricas };
