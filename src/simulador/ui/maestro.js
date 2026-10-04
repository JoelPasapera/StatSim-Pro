// simulador/ui/maestro.js — archivo maestro: exportar e importar toda la configuración.
// Extraído de app.js (Fase 2) sin cambiar comportamiento; importaciones explícitas entre módulos.

import { descargarArchivo } from '../../shared/descargas.js';
import { mostrarToast } from '../../shared/toast.js';
import { aplicarCSVConcordancia, csvDeConcordancia } from './concordancia.js';
import { aplicarCSVCorrelaciones, csvDeCorrelaciones } from './correlaciones.js';
import { aplicarCSVCortes, aplicarCSVDesenlaces, csvDeCortes, csvDeDesenlaces } from './cortes-desenlaces.js';
import { aplicarCSVDiferencias, csvDeDiferencias } from './diferencias.js';
import { aplicarCSVEstructuras, cargarEstructurasDesdeJSON, csvDeEstructuras, reconciliarEstructurasTodas } from './estructura.js';
import { aplicarCSVModelos, csvDeModelos } from './modelos.js';
import { aplicarCSVPruebas, aplicarCSVTests, csvDeTabla, csvDeTests, sincronizarDimensionesDesdeTests } from './pruebas.js';
import { aplicarCSVRepetidas, csvDeRepetidas } from './repetidas.js';
import { aplicarCSVSocio, poblarReferenciaMAR } from './sociodemograficos.js';
import { aplicarCSVNiveles, csvDeNiveles } from './niveles.js';
import { aplicarCSVPaneles, csvDePaneles } from './paneles.js';
import { aplicarCSVHisteresis, csvDeHisteresis } from './histeresis.js';

// ============================================================================
// MAESTRO: las TRES configuraciones en un solo archivo
// Formato: bloques separados por marcadores ###SECCION### — legible, editable
// a mano y compatible con los CSV sueltos de cada tabla.
// ============================================================================
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
    { id: 'referenciaMAR', clave: 'ReferenciaMAR' },
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
        csv += `${c.clave},${v}\n`;
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
        const [clave, ...resto] = linea.split(',');
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

function exportarConfigTodo() {
    try {
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
        if (nFilas(csvP) === 0 && nFilas(csvS) === 0 && nFilas(csvC) === 0 && nFilas(csvD) === 0 && nFilas(csvM) === 0 && nFilas(csvR) === 0) {
            mostrarToast('No hay nada configurado para exportar', 'warning');
            return;
        }
        partes.push(MARCA_TODO.general, csvG.trim(), '', MARCA_TODO.tests, csvT.trim(), '', MARCA_TODO.pruebas, csvP.trim(), '', MARCA_TODO.socio, csvS.trim(), '', MARCA_TODO.corr, csvC.trim(), '', MARCA_TODO.dif, csvD.trim(), '', MARCA_TODO.modelos, csvM.trim(), '', MARCA_TODO.repetidas, csvR.trim(), '', MARCA_TODO.niveles, csvN.trim(), '', MARCA_TODO.paneles, csvPa.trim(), '', MARCA_TODO.histeresis, csvHi.trim(), '', MARCA_TODO.estructura, csvE.trim(), '', MARCA_TODO.cortes, csvCo.trim(), '', MARCA_TODO.desenlaces, csvDe.trim(), '', MARCA_TODO.concordancia, csvK.trim(), '');
        descargarArchivo(partes.join('\n'), 'configuracion_completa_simulador.csv', 'text/csv');
        mostrarToast(`Configuración completa exportada: general + ${nFilas(csvP)} prueba(s), ${nFilas(csvS)} variable(s), ${nFilas(csvC)} correlación(es), ${nFilas(csvD)} diferencia(s), ${nFilas(csvM)} modelo(s), ${nFilas(csvR)} medida(s) repetida(s)`, 'success');
    } catch (error) {
        mostrarToast('Error al exportar: ' + error.message, 'error');
    }
}

function importarConfigTodo(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (event) {
        try {
            const texto = String(event.target.result);
            if (!texto.includes(MARCA_TODO.pruebas)) {
                mostrarToast('Este archivo no es una configuración completa. Usa el botón «Importar CSV» de cada tabla, o exporta primero con «Exportar TODO».', 'error');
                return;
            }
            const bloque = (ini, fin) => {
                const a = texto.indexOf(ini);
                if (a < 0) return '';
                const desde = a + ini.length;
                const b = fin ? texto.indexOf(fin, desde) : -1;
                return texto.slice(desde, b < 0 ? undefined : b).trim();
            };
            // Archivos antiguos SIN ###GENERAL### siguen funcionando: el bloque sale vacío.
            const csvG = bloque(MARCA_TODO.general, texto.includes(MARCA_TODO.tests) ? MARCA_TODO.tests : MARCA_TODO.pruebas);
            const csvT = bloque(MARCA_TODO.tests, MARCA_TODO.pruebas);
            const csvP = bloque(MARCA_TODO.pruebas, MARCA_TODO.socio);
            const csvS = bloque(MARCA_TODO.socio, MARCA_TODO.corr);
            // Cada bloque termina en la siguiente marca ###…### (o al final):
            // así los archivos antiguos, sin DIFERENCIAS/MODELOS, siguen funcionando.
            const bloqueHastaSiguiente = (ini) => {
                const a = texto.indexOf(ini);
                if (a < 0) return '';
                const desde = a + ini.length;
                const re = /###[A-Z]+###/g;
                re.lastIndex = desde;
                const sig = re.exec(texto);
                return texto.slice(desde, sig ? sig.index : undefined).trim();
            };
            const csvC = bloqueHastaSiguiente(MARCA_TODO.corr);
            const csvD = bloqueHastaSiguiente(MARCA_TODO.dif);
            const csvM = bloqueHastaSiguiente(MARCA_TODO.modelos);
            const csvR = bloqueHastaSiguiente(MARCA_TODO.repetidas), csvN = bloqueHastaSiguiente(MARCA_TODO.niveles), csvPa = bloqueHastaSiguiente(MARCA_TODO.paneles), csvHi = bloqueHastaSiguiente(MARCA_TODO.histeresis);
            const csvE = bloqueHastaSiguiente(MARCA_TODO.estructura);
            const csvCo = bloqueHastaSiguiente(MARCA_TODO.cortes), csvDe = bloqueHastaSiguiente(MARCA_TODO.desenlaces), csvK = bloqueHastaSiguiente(MARCA_TODO.concordancia);
            // ORDEN OBLIGATORIO: primero I y II (definen las variables), luego III
            // (sus desplegables se llenan a partir de las anteriores).
            const rG = csvG ? aplicarCSVGeneral(csvG) : 0;
            const rT = csvT ? aplicarCSVTests(csvT) : 0;   // los tests van ANTES que las escalas
            const rP = csvP ? aplicarCSVPruebas(csvP) : 0;
            sincronizarDimensionesDesdeTests(true);
            const rS = csvS ? aplicarCSVSocio(csvS) : 0;
            // (F2) un maestro es la configuración COMPLETA: las secciones que no trae vacían su tabla
            //      (antes, un maestro antiguo sin MODELOS dejaba los modelos del estudio anterior)
            for (const [csvX, id] of [[csvC, 'bodyCorrelaciones'], [csvD, 'bodyDiferencias'], [csvM, 'bodyModelos'], [csvR, 'bodyRepetidas'], [csvN, 'bodyNiveles'], [csvPa, 'bodyPaneles'], [csvHi, 'bodyHisteresis']]) if (!csvX) { const b = document.getElementById(id); if (b) b.innerHTML = ''; }
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
            mostrarToast(`Configuración completa importada: ${rG ? 'general + ' : ''}${rP} prueba(s), ${rS} variable(s), ${rC.aplicadas} correlación(es), ${rD.aplicadas} diferencia(s), ${rM.aplicadas} modelo(s), ${rR.aplicadas} medida(s) repetida(s)` + (rE ? `, ${rE} estructura(s) factorial(es)` : '') + (rCo ? `, ${rCo} corte(s)` : '') + (rDe ? `, ${rDe} desenlace(s)` : '') + (rK ? `, ${rK} fila(s) de concordancia` : '') + (omitidas ? ` · ${omitidas} fila(s) omitida(s) por variables inexistentes` : ''), 'success');
        } catch (error) {
            mostrarToast('Error al importar: ' + error.message, 'error');
        }
    };
    reader.readAsText(file);
    e.target.value = '';
}

export { MARCA_TODO, CAMPOS_GENERAL, csvDeGeneral, aplicarCSVGeneral, exportarConfigTodo, importarConfigTodo };
