// simulador/ui/maestro.js — archivo maestro: exportar e importar toda la configuración.
// Extraído de app.js (Fase 2) sin cambiar comportamiento; importaciones explícitas entre módulos.

import { descargarArchivo } from '../../shared/descargas.js';
import { mostrarToast, mostrarToastConAvisos } from '../../shared/toast.js';
import { leerArchivoComoTexto } from '../../shared/archivos.js';
import { campoCSV, parsearLineaCSV, parsearLineaCSVCon } from '../../shared/csv.js';
import { aplicarCSVConcordancia, csvDeConcordancia } from './concordancia.js';
import { aplicarCSVCorrelaciones, csvDeCorrelaciones } from './correlaciones.js';
import { aplicarCSVCortes, aplicarCSVDesenlaces, csvDeCortes, csvDeDesenlaces } from './cortes-desenlaces.js';
import { aplicarCSVDiferencias, csvDeDiferencias } from './diferencias.js';
import { aplicarCSVEstructuras, cargarEstructurasDesdeJSON, csvDeEstructuras, reconciliarEstructurasTodas } from './estructura.js';
import { aplicarCSVModelos, csvDeModelos } from './modelos.js';
import { aplicarCSVPruebas, aplicarCSVTests, csvDeTabla, csvDeTests, refrescarSelectoresDePrueba, sincronizarDimensionesDesdeTests } from './pruebas.js';
import { aplicarCSVRepetidas, csvDeRepetidas } from './repetidas.js';
import { aplicarCSVSocio, poblarReferenciaMAR } from './sociodemograficos.js';
import { aplicarCSVNiveles, csvDeNiveles } from './niveles.js';
import { aplicarCSVPaneles, csvDePaneles } from './paneles.js';
import { aplicarCSVHisteresis, csvDeHisteresis } from './histeresis.js';
import { descartarGeneracionEnCurso } from './motor.js';

// ============================================================================
// MAESTRO: las TRES configuraciones en un solo archivo
// Formato: bloques separados por marcadores ###SECCION### — legible, editable
// a mano y compatible con los CSV sueltos de cada tabla.
// ============================================================================
/** (2026.12.31, revisión) Las filas que admite cada tabla al aplicar un maestro (una configuración real tiene unas decenas). */
const MAXIMO_FILAS_MAESTRO = 5000;

const MARCA_TODO = { general: '###GENERAL###', tests: '###TESTS###', pruebas: '###PRUEBAS###', socio: '###SOCIODEMOGRAFICOS###', corr: '###CORRELACIONES###', dif: '###DIFERENCIAS###', modelos: '###MODELOS###', repetidas: '###REPETIDAS###', niveles: '###NIVELES###', paneles: '###PANELES###', histeresis: '###HISTERESIS###', estructura: '###ESTRUCTURA###', cortes: '###CORTES###', desenlaces: '###DESENLACES###', concordancia: '###CONCORDANCIA###' };

// Campos de la tarjeta «Configuración General» que viajan en el archivo maestro.
const CAMPOS_GENERAL = [
    { id: 'tamanoMuestra', clave: 'TamanoMuestra' },
    { id: 'semilla', clave: 'Semilla' },
    // (Atlas, dimensión B3) selección por rango: la variable puede no tener aún su opción al importar (las tablas llegan después)
    // un archivo maestro describe un proyecto entero: si le falta la selección (archivos anteriores), se reinicia a «Sin
    // selección» en lugar de conservar en silencio la del proyecto abierto
    { id: 'seleccionVariable', clave: 'SeleccionVariable', opcionLibre: true, avisar: true, reiniciarSiFalta: '' },
    { id: 'seleccionLado', clave: 'SeleccionLado', avisar: true },
    { id: 'seleccionProporcion', clave: 'SeleccionProporcion', avisar: true },
    { id: 'generarPercentiles', clave: 'GenerarPercentiles', checkbox: true },
    { id: 'correlacionesExactas', clave: 'CorrelacionesExactas', checkbox: true },
    { id: 'indiceFiabilidad', clave: 'IndiceFiabilidad' },
    { id: 'heterogeneidadItems', clave: 'HeterogeneidadItems' },
    { id: 'pctPerdidos', clave: 'PctPerdidos' },
    { id: 'mecanismoPerdidos', clave: 'MecanismoPerdidos' },
    { id: 'pctDescuidados', clave: 'PctDescuidados' },
    { id: 'tipoDescuidado', clave: 'TipoDescuidado' },
    { id: 'marcarDescuidados', clave: 'MarcarDescuidados', checkbox: true },
    { id: 'pctDigitacion', clave: 'PctDigitacion' },
    // (2026.12.30) con opción libre: el bloque general se aplica antes que las tablas, y en una página nueva la variable de
    // referencia aún no tenía opción (se perdía y la base usaba la referencia automática sin avisar)
    { id: 'referenciaMAR', clave: 'ReferenciaMAR', opcionLibre: true },
    { id: 'sentidoMAR', clave: 'SentidoMAR' },
    // (B8) estilos de respuesta, ítems de control y tiempo
    { id: 'pctAquiescencia', clave: 'PctAquiescencia' },
    { id: 'pctExtrema', clave: 'PctExtrema' },
    { id: 'intensidadEstilos', clave: 'IntensidadEstilos' },
    { id: 'itemsControl', clave: 'ItemsControl' },
    { id: 'tiempoMinutos', clave: 'TiempoMinutos' }
];

function csvDeGeneral() {
    let csv = 'Campo,Valor\n';
    CAMPOS_GENERAL.forEach(c => {
        const el = document.getElementById(c.id);
        const v = el ? (c.checkbox ? (el.checked ? 'si' : 'no') : (el.value || '')) : '';
        csv += `${c.clave},${campoCSV(v)}\n`;
    });
    return csv;
}

// Aplica el bloque general. Devuelve cuántos campos se restauraron.
function aplicarCSVGeneral(csv) {
    const lineas = String(csv || '').trim().split(/\r?\n/).filter(l => l.trim());
    if (lineas.length < 2) return 0;
    let n = 0;
    const aplicados = new Set();
    for (const linea of lineas.slice(1)) {
        // (2026.12.30) con las comillas del CSV (un valor con comas va entre comillas); los maestros anteriores, sin ellas,
        // se leen igual (el valor es todo lo que sigue a la clave)
        const [clave, ...resto] = parsearLineaCSV(linea);
        const valor = resto.join(',').trim();
        const campo = CAMPOS_GENERAL.find(c => c.clave.toLowerCase() === String(clave).trim().toLowerCase());
        if (!campo) continue;
        const el = document.getElementById(campo.id);
        if (!el) continue;
        if (campo.checkbox) el.checked = /^(si|sí|true|1)$/i.test(valor);
        else {
            // un selector sin esa opción ignora el valor en silencio: con «opcionLibre», se crea antes de asignarlo
            if (campo.opcionLibre && valor && el.tagName === 'SELECT' && ![...el.options].some(o => o.value === valor)) { const o = document.createElement('option'); o.value = valor; o.textContent = valor; el.appendChild(o); }
            el.value = valor;
        }
        if (campo.avisar) el.dispatchEvent(new Event('change'));
        aplicados.add(campo.id);
        n++;
    }
    CAMPOS_GENERAL.filter(c => c.reiniciarSiFalta !== undefined && !aplicados.has(c.id)).forEach(c => { const el = document.getElementById(c.id); if (el) { el.value = c.reiniciarSiFalta; el.dispatchEvent(new Event('change')); } });
    return n;
}

/**
 * (2026.12.31) El texto del archivo maestro con lo que hay ahora en las tablas, y cuántas filas tiene cada una; null si no
 * hay nada configurado. Lo usan «Exportar TODO» y el archivo de proyecto (simulador/ui/proyecto.js).
 * @returns {{ texto: string, filas: { pruebas: number, socio: number, correlaciones: number, diferencias: number, modelos: number, repetidas: number } } | null}
 */
function textoMaestro() {
    reconciliarEstructurasTodas(false);
    const partes = [];
    // Se reutilizan los MISMOS generadores de cada tabla (una sola fuente de verdad).
    const csvG = csvDeGeneral();
    const csvT = csvDeTests();
    const csvP = csvDeTabla('#bodyPruebas .fila-prueba', 'pruebas');
    const csvS = csvDeTabla('#bodySocio .fila-socio', 'socio');
    const csvC = csvDeCorrelaciones();
    const csvD = csvDeDiferencias();
    const csvM = csvDeModelos();
    const csvR = csvDeRepetidas(), csvN = csvDeNiveles(), csvPa = csvDePaneles(), csvHi = csvDeHisteresis();
    const csvE = csvDeEstructuras();
    const csvCo = csvDeCortes(), csvDe = csvDeDesenlaces(), csvK = csvDeConcordancia();
    const nFilas = s => Math.max(0, String(s).trim().split(/\r?\n/).length - 1);
    const filas = { pruebas: nFilas(csvP), socio: nFilas(csvS), correlaciones: nFilas(csvC), diferencias: nFilas(csvD), modelos: nFilas(csvM), repetidas: nFilas(csvR) };
    if (Object.values(filas).every(k => k === 0)) return null;
    partes.push(MARCA_TODO.general, csvG.trim(), '', MARCA_TODO.tests, csvT.trim(), '', MARCA_TODO.pruebas, csvP.trim(), '', MARCA_TODO.socio, csvS.trim(), '', MARCA_TODO.corr, csvC.trim(), '', MARCA_TODO.dif, csvD.trim(), '', MARCA_TODO.modelos, csvM.trim(), '', MARCA_TODO.repetidas, csvR.trim(), '', MARCA_TODO.niveles, csvN.trim(), '', MARCA_TODO.paneles, csvPa.trim(), '', MARCA_TODO.histeresis, csvHi.trim(), '', MARCA_TODO.estructura, csvE.trim(), '', MARCA_TODO.cortes, csvCo.trim(), '', MARCA_TODO.desenlaces, csvDe.trim(), '', MARCA_TODO.concordancia, csvK.trim(), '');
    return { texto: partes.join('\n'), filas };
}

function exportarConfigTodo() {
    try {
        const maestro = textoMaestro();
        if (!maestro) {
            mostrarToast('No hay nada configurado para exportar', 'warning');
            return;
        }
        const f = maestro.filas;
        descargarArchivo(maestro.texto, 'configuracion_completa_simulador.csv', 'text/csv');
        mostrarToast(`Configuración completa exportada: general + ${f.pruebas} prueba(s), ${f.socio} variable(s), ${f.correlaciones} correlación(es), ${f.diferencias} diferencia(s), ${f.modelos} modelo(s), ${f.repetidas} medida(s) repetida(s)`, 'success');
    } catch (error) {
        mostrarToast('Error al exportar: ' + error.message, 'error');
    }
}

/**
 * (2026.12.30) El maestro con comas y sin campos vacíos al final de cada línea. Excel en español lo guarda con «;» (antes se
 * importaba vacío con un aviso de éxito y vaciaba las tablas), y Excel en cualquier idioma completa cada línea con
 * delimitadores hasta el ancho de la hoja («###PRUEBAS###;;;;», «Campo,Valor,,,»): sin quitarlos, la marca de cada
 * bloque arrastraba una línea de más. El delimitador es el del encabezado de las escalas.
 * @param {string} texto
 * @returns {string}
 */
function normalizarMaestro(texto) {
    const lineas = String(texto || '').replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);
    const iMarca = lineas.findIndex(l => l.startsWith(MARCA_TODO.pruebas));
    const encabezado = iMarca >= 0 ? (lineas[iMarca + 1] || '') : '';
    const delimitador = (encabezado.match(/;/g) || []).length > (encabezado.match(/,/g) || []).length ? ';' : ',';
    return lineas.map(linea => {
        const campos = parsearLineaCSVCon(linea, delimitador);
        while (campos.length > 1 && campos[campos.length - 1] === '') campos.pop();
        // con «;», Excel también escribe los decimales con coma («0,85»): los campos de la configuración los esperan con punto
        return campos.map(c => campoCSV(delimitador === ';' && /^[-+]?\d*,\d+$/.test(c) ? c.replace(',', '.') : c)).join(',');
    }).join('\n');
}

/**
 * (2026.12.31) Aplica a las tablas el texto de un archivo maestro (lo que hacía «Importar TODO» tras leer el archivo; lo
 * usa también el archivo de proyecto). Lanza un error si el texto no es un maestro.
 * @param {string} original
 * @returns {{ mensaje: string, avisos: string[] }}
 */
function aplicarMaestro(original) {
    const texto = normalizarMaestro(original);
    if (!texto.includes(MARCA_TODO.pruebas)) {
        throw new Error('Este archivo no es una configuración completa. Usa el botón «Importar CSV» de cada tabla, o exporta primero con «Exportar TODO».');
    }
    // Cada bloque termina en la siguiente marca ###…### (o al final): así los archivos antiguos, sin DIFERENCIAS/MODELOS
    // (o sin ###GENERAL###: el bloque sale vacío), siguen funcionando. (2027.01.01) También los cuatro primeros: hasta la
    // 2026.12.31 terminaban en una marca fija (los sociodemográficos, en ###CORRELACIONES###), y un maestro escrito a mano
    // sin las tablas vacías metía en los sociodemográficos todo lo que seguía («Categoría "Cuantitativa": falta el
    // promedio», al generar, por la cabecera de las diferencias).
    const bloqueHastaSiguiente = (ini) => {
        const a = texto.indexOf(ini);
        if (a < 0) return '';
        const desde = a + ini.length;
        const re = /###[A-Z]+###/g;
        re.lastIndex = desde;
        const sig = re.exec(texto);
        return texto.slice(desde, sig ? sig.index : undefined).trim();
    };
    const csvG = bloqueHastaSiguiente(MARCA_TODO.general);
    const csvT = bloqueHastaSiguiente(MARCA_TODO.tests);
    const csvP = bloqueHastaSiguiente(MARCA_TODO.pruebas);
    const csvS = bloqueHastaSiguiente(MARCA_TODO.socio);
    const csvC = bloqueHastaSiguiente(MARCA_TODO.corr);
    const csvD = bloqueHastaSiguiente(MARCA_TODO.dif);
    const csvM = bloqueHastaSiguiente(MARCA_TODO.modelos);
    const csvR = bloqueHastaSiguiente(MARCA_TODO.repetidas), csvN = bloqueHastaSiguiente(MARCA_TODO.niveles), csvPa = bloqueHastaSiguiente(MARCA_TODO.paneles), csvHi = bloqueHastaSiguiente(MARCA_TODO.histeresis);
    const csvE = bloqueHastaSiguiente(MARCA_TODO.estructura);
    const csvCo = bloqueHastaSiguiente(MARCA_TODO.cortes), csvDe = bloqueHastaSiguiente(MARCA_TODO.desenlaces), csvK = bloqueHastaSiguiente(MARCA_TODO.concordancia);
    // (2026.12.31, revisión) antes de tocar las tablas, ninguna con más filas de las que la página dibuja en un momento (una
    // configuración real tiene unas decenas; la de un proyecto ajeno podría traer cientos de miles)
    const bloques = { tests: csvT, escalas: csvP, 'variables sociodemográficas': csvS, correlaciones: csvC, diferencias: csvD, modelos: csvM, 'medidas repetidas': csvR, niveles: csvN, paneles: csvPa, histéresis: csvHi, estructuras: csvE, cortes: csvCo, desenlaces: csvDe, concordancias: csvK };
    for (const [tabla, csv] of Object.entries(bloques)) {
        const filas = csv ? csv.split('\n').length - 1 : 0;
        if (filas > MAXIMO_FILAS_MAESTRO) throw new Error(`La configuración trae ${filas.toLocaleString('es')} filas de ${tabla}: el Simulador admite hasta ${MAXIMO_FILAS_MAESTRO.toLocaleString('es')} por tabla`);
    }
    // (2027.01.01, revisión) Un bloque que está pero no trae filas (solo su encabezado: así escribe «Exportar TODO» una tabla
    // vacía) vacía su tabla. Hasta ahora la conservaba: aplicar un maestro, o abrir un proyecto, sobre la configuración de
    // otro estudio dejaba en las tablas vacías del nuevo las filas del anterior (sus tests, escalas, sociodemográficas,
    // correlaciones, diferencias, modelos o medidas repetidas): al generar, «la variable no existe», o, con los mismos
    // nombres, en la base nueva y sin aviso. Un bloque ausente (un maestro anterior a esa tabla) sigue como antes.
    const sinFilas = (/** @type {string} */ csv) => csv.split('\n').filter(l => l.trim()).length < 2;
    const vaciar = (/** @type {string} */ id) => { const b = document.getElementById(id); if (b) b.innerHTML = ''; };
    const traeSinFilas = (/** @type {string} */ marca, /** @type {string} */ csv) => texto.includes(marca) && sinFilas(csv);
    // ORDEN OBLIGATORIO: primero I y II (definen las variables), luego III
    // (sus desplegables se llenan a partir de las anteriores).
    const rG = csvG ? aplicarCSVGeneral(csvG) : 0;
    if (traeSinFilas(MARCA_TODO.tests, csvT)) { vaciar('bodyTests'); refrescarSelectoresDePrueba(); }
    const rT = csvT ? aplicarCSVTests(csvT) : 0;   // los tests van ANTES que las escalas
    if (traeSinFilas(MARCA_TODO.pruebas, csvP)) vaciar('bodyPruebas');
    const rP = csvP ? aplicarCSVPruebas(csvP) : 0;
    sincronizarDimensionesDesdeTests(true);
    if (traeSinFilas(MARCA_TODO.socio, csvS)) vaciar('bodySocio');
    const rS = csvS ? aplicarCSVSocio(csvS) : 0;
    // (F2) un maestro es la configuración COMPLETA: las secciones que no trae vacían su tabla
    //      (antes, un maestro antiguo sin MODELOS dejaba los modelos del estudio anterior); y las que trae sin filas, también
    for (const [csvX, id] of [[csvC, 'bodyCorrelaciones'], [csvD, 'bodyDiferencias'], [csvM, 'bodyModelos'], [csvR, 'bodyRepetidas'], [csvN, 'bodyNiveles'], [csvPa, 'bodyPaneles'], [csvHi, 'bodyHisteresis']]) if (!csvX || sinFilas(csvX)) vaciar(id);
    const rC = csvC ? aplicarCSVCorrelaciones(csvC) : { aplicadas: 0, omitidas: 0 };
    const rD = csvD ? aplicarCSVDiferencias(csvD) : { aplicadas: 0, omitidas: 0 };
    const rM = csvM ? aplicarCSVModelos(csvM) : { aplicadas: 0, omitidas: 0 };
    const rR = csvR ? aplicarCSVRepetidas(csvR) : { aplicadas: 0, omitidas: 0 };
    if (csvN) aplicarCSVNiveles(csvN);   // (fase D) después de la tabla VI: sus parejas son escalas repetidas
    if (csvPa) aplicarCSVPaneles(csvPa);   // (fase E1) también después de la tabla VI
    if (csvHi) aplicarCSVHisteresis(csvHi);   // (fase E2) también después de la tabla VI
    const rE = csvE ? aplicarCSVEstructuras(csvE) : 0;
    if (!csvE) cargarEstructurasDesdeJSON('[]');
    const rCo = csvCo ? aplicarCSVCortes(csvCo) : 0, rDe = csvDe ? aplicarCSVDesenlaces(csvDe) : 0;
    if (!csvCo) { const b = document.getElementById('bodyCortes'); if (b) b.innerHTML = ''; }
    if (!csvDe) { const b = document.getElementById('bodyDesenlaces'); if (b) b.innerHTML = ''; }
    const rK = csvK ? aplicarCSVConcordancia(csvK) : 0;
    if (!csvK) { const b = document.getElementById('bodyConcordancia'); if (b) b.innerHTML = ''; }
    // (F5) la referencia del MAR que no exista en el estudio importado se descarta (evita un error de validación heredado)
    poblarReferenciaMAR();
    const omitidas = rC.omitidas + rD.omitidas + rM.omitidas + rR.omitidas;
    return {
        mensaje: `Configuración completa importada: ${rG ? 'general + ' : ''}${rP} prueba(s), ${rS} variable(s), ${rC.aplicadas} correlación(es), ${rD.aplicadas} diferencia(s), ${rM.aplicadas} modelo(s), ${rR.aplicadas} medida(s) repetida(s)` + (rE ? `, ${rE} estructura(s) factorial(es)` : '') + (rCo ? `, ${rCo} corte(s)` : '') + (rDe ? `, ${rDe} desenlace(s)` : '') + (rK ? `, ${rK} fila(s) de concordancia` : ''),
        avisos: omitidas ? [`${omitidas} fila(s) omitida(s) por variables inexistentes`] : []
    };
}

function importarConfigTodo(e) {
    const file = e.target.files[0];
    if (!file) return;
    // (2026.12.29) con la codificación del archivo (shared/archivos.js): un maestro guardado por Excel en español perdía las tildes
    leerArchivoComoTexto(file).then(function ({ texto: original, aviso }) {
        try {
            const { mensaje, avisos } = aplicarMaestro(original);
            descartarGeneracionEnCurso();   // (2027.01.01, revisión) lo que se estuviera generando es de la configuración anterior
            mostrarToastConAvisos(mensaje, [...avisos, aviso]);
        } catch (error) {
            mostrarToast(/no es una configuración completa/.test(error.message) ? error.message : 'Error al importar: ' + error.message, 'error');
        }
    }, function () {
        mostrarToast('No se pudo leer el archivo', 'error');
    });
    e.target.value = '';
}

export { MARCA_TODO, MAXIMO_FILAS_MAESTRO, CAMPOS_GENERAL, csvDeGeneral, aplicarCSVGeneral, textoMaestro, aplicarMaestro, exportarConfigTodo, importarConfigTodo };
