// simulador/ui/index.js — montaje de la interfaz del Simulador (enlaza botones y tablas).
// Extraído de app.js (Fase 2) sin cambiar comportamiento; importaciones explícitas entre módulos.

import { actualizarBloqueoSocio, actualizarLimitesPrueba, actualizarTodasLasPruebas, actualizarTodosSocio, ajustarPruebaEnCambio } from './guia-coherencia.js';
import { mostrarToast } from '../../shared/toast.js';
import { actualizarFilaConcordancia, agregarFilaConcordancia, poblarVariableConcordancia } from './concordancia.js';
import { agregarFilaCorrelacion, exportarConfigCorrelaciones, importarConfigCorrelaciones } from './correlaciones.js';
import { actualizarFilaDesenlace, agregarFilaCorte, agregarFilaDesenlace, poblarSelectVariables } from './cortes-desenlaces.js';
import { actualizarFilaDiferencia, agregarFilaDiferencia } from './diferencias.js';
import { actualizarPanelEstructura, guardarEstructurasJSON, leerMatrizDesdeDOM, leerOpcionesEstructura, poblarSelectorEstructura, proponerCargas, quitarEstructura, renderMatrizCargas } from './estructura.js';
import { exportarConfigTodo, importarConfigTodo } from './maestro.js';
import { actualizarEtiquetasModelo, agregarFilaModelo } from './modelos.js';
import { generarBaseDatos } from './motor.js';
import { FILA_PRUEBA_VACIA, actualizarDicotomicaFila, agregarFilaPrueba, agregarFilaPruebaConDatos, agregarFilaTest, agregarFilaTestConDatos, eliminarFilaPrueba, exportarConfigPruebas, importarConfigPruebas, reconstruirTablaDesdeTests, reflejarFilaEnTests, refrescarSelectoresDePrueba, renombrarVariableEnTablas } from './pruebas.js';
import { actualizarFilaRepetida, agregarFilaRepetida } from './repetidas.js';
import { descargarCSV, descargarCSVInternacional } from './resultado.js';
import { agregarFilaSocio, eliminarFilaSocio, exportarConfigSocio, importarConfigSocio, poblarDependeDe, poblarReferenciaMAR } from './sociodemograficos.js';
import * as _toast from '../../shared/toast.js';
import * as _descargas from '../../shared/descargas.js';
import * as _csv from '../../shared/csv.js';
import * as _etiquetas from '../../shared/etiquetas.js';
import * as _tablaDatos from '../../shared/tabla-datos.js';
import { montarSeleccion } from './seleccion.js';
import { montarNiveles } from './niveles.js';
import { montarPaneles } from './paneles.js';
import { montarHisteresis } from './histeresis.js';

// ========================================
// CONFIGURACIÓN DEL GENERADOR
// ========================================
export function montarInterfazSimulador() {
    montarSeleccion();   // (Atlas, dimensión B3) selección de la muestra por rango
    // Botón agregar prueba
    const _btnTest = document.getElementById('btnAgregarTest');
    if (_btnTest) _btnTest.addEventListener('click', agregarFilaTest);
    // Fila inicial del cuadro de tests + delegación para borrar.
    const _bodyTests = document.getElementById('bodyTests');
    if (_bodyTests) {
        if (!_bodyTests.querySelector('.fila-test')) agregarFilaTestConDatos({});
        _bodyTests.addEventListener('click', ev => {
            const btn = ev.target.closest('.btn-delete');
            if (!btn) return;
            btn.closest('tr').remove();
            refrescarSelectoresDePrueba();
        });
    }
    document.getElementById('btnAgregarPrueba').addEventListener('click', agregarFilaPrueba);
    // Fila inicial de la tabla de escalas: la misma función que todas las demás
    // (la antigua fila estática del HTML llevaba un input de texto y una columna
    // Tipo que ya no existen: desalineaba la tabla y el generador la ignoraba).
    const _bodyPruebas = document.getElementById('bodyPruebas');
    if (_bodyPruebas && !_bodyPruebas.querySelector('.fila-prueba')) agregarFilaPruebaConDatos(FILA_PRUEBA_VACIA);
    const _btnActualizar = document.getElementById('btnActualizarDesdeTests');
    if (_btnActualizar) _btnActualizar.addEventListener('click', reconstruirTablaDesdeTests);
    // Lo que se escribe a mano en la tabla de escalas se anota arriba: el
    // nombre anterior se guarda al entrar en el campo para detectar renombrados.
    if (_bodyPruebas) {
        _bodyPruebas.addEventListener('focusin', e => {
            if (e.target.matches && (e.target.matches('[aria-label="Nombre de la escala"]') || e.target.matches('[aria-label="Nombre de la prueba"]'))) e.target.dataset.anterior = e.target.value.trim();
        });
        _bodyPruebas.addEventListener('change', e => {
            if (!e.target.matches) return;
            if (e.target.matches('[aria-label="Nombre de la escala"]') || e.target.matches('[aria-label="Nombre de la prueba"]')) reflejarFilaEnTests(e.target.closest('.fila-prueba'));
        });
    }
    // Botón agregar sociodemográfico
    document.getElementById('btnAgregarSocio').addEventListener('click', agregarFilaSocio);
    // Botón generar base de datos
    document.getElementById('btnGenerar').addEventListener('click', generarBaseDatos);
    // Botón descargar CSV
    document.getElementById('btnDescargarCSV').addEventListener('click', descargarCSV);
    const btnIntl = document.getElementById('btnDescargarCSVIntl');
    if (btnIntl) btnIntl.addEventListener('click', descargarCSVInternacional);
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
    // Correlaciones (tabla III) y maestros: mismo patrón que las tablas I y II.
    const _bIC = document.getElementById('btnImportarCorrelaciones');
    if (_bIC) _bIC.addEventListener('click', () => document.getElementById('importCorrelacionesInput').click());
    const _bEC = document.getElementById('btnExportarCorrelaciones');
    if (_bEC) _bEC.addEventListener('click', exportarConfigCorrelaciones);
    const _iC = document.getElementById('importCorrelacionesInput');
    if (_iC) _iC.addEventListener('change', importarConfigCorrelaciones);
    // La etiqueta de la columna objetivo sigue al índice elegido (α ↔ ω).
    const _selIF = document.getElementById('indiceFiabilidad');
    const _sincronizarEtiquetaFiabilidad = () => {
        const simbolo = (_selIF && _selIF.value === 'omega') ? 'ω' : 'α';
        const th = document.getElementById('thFiabilidad');
        if (th) th.firstChild ? th.firstChild.nodeValue = simbolo + ' objetivo' : th.textContent = simbolo + ' objetivo';
        document.querySelectorAll('.etiquetaFiabilidad').forEach(el => { el.textContent = simbolo; });
    };
    if (_selIF) { _selIF.addEventListener('change', _sincronizarEtiquetaFiabilidad); _sincronizarEtiquetaFiabilidad(); }
    const _bIT = document.getElementById('btnImportarTodo');
    if (_bIT) _bIT.addEventListener('click', () => document.getElementById('importTodoInput').click());
    const _bET = document.getElementById('btnExportarTodo');
    if (_bET) _bET.addEventListener('click', exportarConfigTodo);
    const _iT = document.getElementById('importTodoInput');
    if (_iT) _iT.addEventListener('change', importarConfigTodo);
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
        if (fila) { actualizarLimitesPrueba(fila); actualizarDicotomicaFila(fila); }
    });
    tbodyPruebas.addEventListener('change', ajustarPruebaEnCambio);
    actualizarTodasLasPruebas(); // pase inicial sobre la fila de ejemplo
    // El límite inferior de DE (anti-escalera) depende de N: recalcular al cambiarlo.
    const inputN = document.getElementById('tamanoMuestra');
    if (inputN) inputN.addEventListener('input', actualizarTodasLasPruebas);
    // (B9) «Depende de»: se puebla al enfocar con las otras binarias/categóricas
    document.getElementById('bodySocio').addEventListener('focusin', function (e) {
        if (e.target.matches && e.target.matches('[aria-label="Depende de"]')) poblarDependeDe(e.target);
        // (F5) el nombre anterior de la variable, para propagar un renombrado a las demás tablas
        const filaS = e.target.closest ? e.target.closest('.fila-socio') : null;
        if (filaS && filaS.querySelector('input') === e.target) e.target.dataset.anterior = e.target.value.trim();
    });
    document.getElementById('bodySocio').addEventListener('change', function (e) {
        const fila = e.target.closest ? e.target.closest('.fila-socio') : null;
        if (!fila || fila.querySelector('input') !== e.target) return;
        const anterior = (e.target.dataset.anterior || '').trim(), nuevo = e.target.value.trim();
        if (anterior && nuevo && anterior !== nuevo) renombrarVariableEnTablas(anterior, nuevo);
        e.target.dataset.anterior = nuevo;
    });
    const _refMAR = document.getElementById('referenciaMAR');
    if (_refMAR) _refMAR.addEventListener('focusin', () => poblarReferenciaMAR());
    // Al elegir MNAR, el caso típico es que omitan quienes puntúan ALTO en la escala:
    // si el sentido sigue en su valor por defecto, se cambia (el usuario puede volver a «bajos»).
    const _mecMAR = document.getElementById('mecanismoPerdidos'), _sentMAR = document.getElementById('sentidoMAR');
    if (_mecMAR && _sentMAR) _mecMAR.addEventListener('change', () => { if (_mecMAR.value === 'MNAR' && !_sentMAR.dataset.tocado) _sentMAR.value = 'altos'; });
    if (_sentMAR) _sentMAR.addEventListener('change', () => { _sentMAR.dataset.tocado = '1'; });
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
        // (C4) el tipo de efecto decide si hay segunda agrupación y qué pide la casilla de valor
        bodyDiferencias.addEventListener('change', function (e) {
            if (e.target.matches && e.target.matches('[aria-label="Tipo de efecto"]')) actualizarFilaDiferencia(e.target.closest('tr'));
        });
    }
    // (B6) Modelos estructurales: mediación y moderación
    const btnModelo = document.getElementById('btnAgregarModelo');
    if (btnModelo) {
        btnModelo.addEventListener('click', () => agregarFilaModelo());
    }
    const bodyModelos = document.getElementById('bodyModelos');
    if (bodyModelos) {
        bodyModelos.addEventListener('click', function (e) {
            if (e.target.closest('.btn-delete')) {
                e.target.closest('tr').remove();
            }
        });
        // al cambiar el tipo, las tres casillas de coeficientes cambian de significado
        bodyModelos.addEventListener('change', function (e) {
            if (e.target.matches('[aria-label="Tipo de modelo"]')) actualizarEtiquetasModelo(e.target.closest('tr'));
        });
    }
    // (C1) Estructura factorial
    const _selEst = document.getElementById('selectorTestEstructura');
    if (_selEst) {
        _selEst.addEventListener('focusin', poblarSelectorEstructura);
        _selEst.addEventListener('change', () => renderMatrizCargas(_selEst.value));
        ['modoEstructura', 'metodoCarga', 'desajusteEstructura'].forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener('change', () => { leerOpcionesEstructura(); actualizarPanelEstructura(); guardarEstructurasJSON(); }); });
        const bodyC = document.getElementById('bodyCargas');
        if (bodyC) bodyC.addEventListener('input', e => { if (e.target.matches && e.target.matches('input[data-dim]')) { leerMatrizDesdeDOM(); actualizarPanelEstructura(); guardarEstructurasJSON(); } });
        const bP = document.getElementById('btnProponerCargas'); if (bP) bP.addEventListener('click', () => proponerCargas());
        const bA = document.getElementById('btnActualizarEstructura'); if (bA) bA.addEventListener('click', () => { const t = _selEst.value; if (t) { renderMatrizCargas(t); mostrarToast('Matriz reconciliada con la tabla I', 'success'); } });
        const bQ = document.getElementById('btnQuitarEstructura'); if (bQ) bQ.addEventListener('click', () => quitarEstructura());
    }
    // (C7) Concordancia
    const _bK = document.getElementById('btnAgregarConcordancia'); if (_bK) _bK.addEventListener('click', () => agregarFilaConcordancia());
    const _bKb = document.getElementById('bodyConcordancia');
    if (_bKb) {
        _bKb.addEventListener('click', e => { if (e.target.closest('.btn-delete')) e.target.closest('tr').remove(); });
        _bKb.addEventListener('focusin', e => { if (e.target.matches && e.target.matches('[aria-label="Variable de concordancia"]')) poblarVariableConcordancia(e.target); });
        _bKb.addEventListener('change', e => { if (e.target.matches && e.target.matches('[aria-label="Tipo de concordancia"]')) actualizarFilaConcordancia(e.target.closest('tr')); });
    }
    // (C2/C3) Desenlaces y puntos de corte
    const _bC = document.getElementById('btnAgregarCorte'); if (_bC) _bC.addEventListener('click', () => agregarFilaCorte());
    const _bD = document.getElementById('btnAgregarDesenlace'); if (_bD) _bD.addEventListener('click', () => agregarFilaDesenlace());
    ['bodyCortes', 'bodyDesenlaces'].forEach(id => { const b = document.getElementById(id); if (b) { b.addEventListener('click', e => { if (e.target.closest('.btn-delete')) e.target.closest('tr').remove(); }); b.addEventListener('focusin', e => { if (e.target.matches && e.target.matches('select[data-poblar]')) poblarSelectVariables(e.target, e.target.dataset.poblar); }); } });
    const _bDs = document.getElementById('bodyDesenlaces'); if (_bDs) _bDs.addEventListener('change', e => { if (e.target.matches && e.target.matches('[aria-label="Tipo de desenlace"]')) actualizarFilaDesenlace(e.target.closest('tr')); });
    // (B7) Medidas repetidas
    const btnRepetida = document.getElementById('btnAgregarRepetida');
    if (btnRepetida) {
        btnRepetida.addEventListener('click', () => agregarFilaRepetida());
        montarNiveles();   // (fase D) relación entre personas y dentro de la persona
        montarPaneles();   // (fase E1) relación en el tiempo (panel cruzado)
        montarHisteresis();   // (fase E2) estados con histéresis
    }
    const bodyRepetidas = document.getElementById('bodyRepetidas');
    if (bodyRepetidas) {
        bodyRepetidas.addEventListener('click', function (e) {
            if (e.target.closest('.btn-delete')) {
                e.target.closest('tr').remove();
            }
        });
        // sin agrupación, la d del grupo 1 no aplica
        bodyRepetidas.addEventListener('change', function (e) {
            if (e.target.matches('[aria-label="Agrupación del cambio"]') || e.target.matches('[aria-label="Modelo longitudinal"]')) actualizarFilaRepetida(e.target.closest('tr'));
        });
    }
}
