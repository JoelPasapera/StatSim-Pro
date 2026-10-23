// simulador/ui/motor.js — generación con el Worker de tipo módulo (y respaldo en el hilo principal) y barra de progreso.
// Extraído de app.js (Fase 2) sin cambiar comportamiento; importaciones explícitas entre módulos.

import { BaseColumnar } from '../../core/data/base-columnar.js';
import { GeneradorDatos } from '../dominio/generador.js';
import { mostrarToast } from '../../shared/toast.js';
import { reconciliarEstructurasTodas } from './estructura.js';
import { habilitarDescargaCSV, habilitarUsarGenerados, mostrarAvisosDeValidacion, mostrarDiagnosticoCorrelaciones, mostrarInformePedidoObtenido, mostrarPreview, publicarDatosGenerados } from './resultado.js';

// ========================================
// MOTOR DE GENERACIÓN (B4): Web Worker con respaldo en el hilo principal
// ========================================
// La base se genera en generador-worker.js, fuera del hilo de la interfaz:
// la página sigue respondiendo y muestra el avance. Si el Worker no está
// disponible (archivo no subido, protocolo file://), se genera en el hilo
// principal como antes. El resultado es la misma BaseColumnar en ambos casos.
const MotorGeneracion = (() => {
    // Versión de generador-worker.js: súbela cuando cambie ese archivo (no
    // tiene etiqueta <script> en index.html, así que se declara aquí).
    const VERSION_WORKER = 3;
    let worker = null;
    let contador = 0;

    // ?v= de un módulo tal como lo carga index.html, para que el Worker
    // importe exactamente la misma versión (una sola fuente: index.html).
    const versionDe = (archivo) => {
        const etiqueta = document.querySelector(`script[src^="${archivo}"]`);
        const m = etiqueta && /[?&]v=([^&]+)/.exec(etiqueta.getAttribute('src') || '');
        return m ? m[1] : '1';
    };
    // (F1) Worker de tipo módulo: importa el dominio desde src/simulador/worker/. La versión viene de src/version.js.
    const crearWorker = () => new Worker(`src/simulador/worker/generador.worker.js?v=${encodeURIComponent((window.StatSim && StatSim.version) || VERSION_WORKER)}`, { type: 'module' });

    function generarConWorker(configuracion, alProgresar) {
        return new Promise((resolver, rechazar) => {
            if (typeof Worker === 'undefined') { const e = new Error('Sin Web Workers'); e.esFalloDelWorker = true; rechazar(e); return; }
            if (!worker) worker = crearWorker();
            const id = ++contador;
            const w = worker;
            const limpiar = () => { w.onmessage = null; w.onerror = null; };
            w.onmessage = (evento) => {
                const m = evento.data || {};
                if (m.id !== id) return;
                if (m.tipo === 'progreso') { if (alProgresar) alProgresar(m.fraccion, m.etapa); return; }
                limpiar();
                if (m.tipo === 'error') { rechazar(new Error(m.mensaje)); return; }
                resolver({
                    base: BaseColumnar.desdeSerializado(m.base),
                    informe: m.informe || [],
                    configuracion: m.configuracion,
                    diagnosticoCorrelaciones: m.diagnosticoCorrelaciones,
                    resumenImperfecciones: m.resumenImperfecciones,
                    diferenciasLimitadas: m.diferenciasLimitadas || [],
                    ms: m.ms
                });
            };
            w.onerror = (evento) => {
                // Fallo del propio Worker (archivo no encontrado, error de carga):
                // se descarta y el llamador cae al respaldo en el hilo principal.
                limpiar();
                try { w.terminate(); } catch (e) { /* nada */ }
                worker = null;
                const e = new Error(evento && evento.message ? evento.message : 'El Worker de generación no pudo iniciarse');
                e.esFalloDelWorker = true;
                if (evento && evento.preventDefault) evento.preventDefault();
                rechazar(e);
            };
            w.postMessage({ id, configuracion });
        });
    }

    function generarEnHilo(configuracion, alProgresar) {
        return new Promise((resolver, rechazar) => {
            // setTimeout: deja que la interfaz pinte el estado «generando» antes
            // de bloquear el hilo.
            setTimeout(() => {
                try {
                    // (2027.01.01) en un generador aparte, como el Worker (worker/generador.worker.js): si la generación
                    // falla, el de la página conserva su base y su configuración (antes, generarBaseDatos vaciaba la base
                    // del generador de la página al empezar, y un fallo la dejaba sin base y con la vista previa de la anterior)
                    const generador = new GeneradorDatos();
                    generador.configuracion = configuracion;
                    const inicio = Date.now();
                    const base = generador.generarBaseDatos(alProgresar);
                    resolver({
                        base,
                        informe: generador.informePedidoObtenido(base) || [],
                        configuracion: generador.configuracion,
                        diagnosticoCorrelaciones: generador.diagnosticoCorrelaciones,
                        resumenImperfecciones: generador.resumenImperfecciones,
                        diferenciasLimitadas: generador.diferenciasLimitadas || [],
                        ms: Date.now() - inicio
                    });
                } catch (error) { rechazar(error); }
            }, 50);
        });
    }

    // Genera con la configuración dada (objeto plano). Devuelve una promesa con
    // { base, informe, diagnosticoCorrelaciones, resumenImperfecciones, ... }.
    function generar(configuracion, alProgresar) {
        return generarConWorker(configuracion, alProgresar).catch(error => {
            if (!error || !error.esFalloDelWorker) throw error;
            console.warn('[MotorGeneracion] Worker no disponible, se genera en el hilo principal:', error.message);
            return generarEnHilo(configuracion, alProgresar);
        });
    }

    return { generar };
})();

// Barra de progreso de la generación (marcado en index.html: #progresoGeneracion)
function mostrarProgresoGeneracion(fraccion, etapa) {
    const cont = document.getElementById('progresoGeneracion');
    if (!cont) return;
    const relleno = cont.querySelector('.progreso-generacion__relleno');
    const texto = cont.querySelector('.progreso-generacion__texto');
    const pct = Math.max(0, Math.min(100, Math.round((fraccion || 0) * 100)));
    if (relleno) relleno.style.width = pct + '%';
    if (texto) texto.textContent = `${etapa || 'Generando'}… ${pct} %`;
    cont.setAttribute('aria-valuenow', String(pct));
    cont.hidden = false;
}

function ocultarProgresoGeneracion() {
    const cont = document.getElementById('progresoGeneracion');
    if (cont) cont.hidden = true;
}

/**
 * (2026.12.31) Deja en la página una base generada o restaurada de un proyecto (simulador/ui/proyecto.js): el generador
 * queda con ella, igual que si la hubiera generado él mismo (descargas, etiquetas, Analizador), y se pintan la vista
 * previa, el diagnóstico de correlaciones, el informe «pedido vs. obtenido» y los botones de descarga.
 * @param {{ base: any, informe?: any[], configuracion?: any, diagnosticoCorrelaciones?: any, resumenImperfecciones?: any, diferenciasLimitadas?: any[] }} resultado
 */
function mostrarResultadoGeneracion(resultado) {
    generadorDatos.datosGenerados = resultado.base;
    // (B7) la configuración vuelve EXPANDIDA (ondas T2… como escalas): etiquetas, estructura y descargas la necesitan así.
    if (resultado.configuracion) generadorDatos.configuracion = resultado.configuracion;
    generadorDatos.diagnosticoCorrelaciones = resultado.diagnosticoCorrelaciones;
    generadorDatos.resumenImperfecciones = resultado.resumenImperfecciones;
    generadorDatos.diferenciasLimitadas = resultado.diferenciasLimitadas || [];
    publicarDatosGenerados(resultado.base);
    mostrarPreview(resultado.base);
    mostrarDiagnosticoCorrelaciones();
    mostrarInformePedidoObtenido(resultado.base, resultado.informe);
    habilitarDescargaCSV();
    habilitarUsarGenerados();
}

/**
 * (2027.01.01, revisión) El número de la generación vigente: cada «Generar» toma uno, y abrir un proyecto o importar una
 * configuración completa lo adelanta. Una base que llega cuando su número ya no es el vigente no entra: hasta la revisión,
 * una generación que terminaba después de abrir un proyecto reemplazaba su base y su configuración por las de antes.
 */
let generacionVigente = 0;

/** Descarta la base que se esté generando: lo que llegue después es de la configuración anterior. */
function descartarGeneracionEnCurso() {
    generacionVigente++;
}

function generarBaseDatos() {
    // (2027.01.01) El generador de la página guarda la configuración de la base que está a la vista: la nueva se recolecta
    // y se valida en una copia, y el generador vuelve enseguida a la de la base; la nueva solo entra con la base que genera
    // (mostrarResultadoGeneracion). Hasta la 2026.12.31 se recolectaba sobre la de la base: tras un intento fallido (un
    // error de validación, una tabla incompleta, un fallo al generar) y mientras se generaba, la base seguía siendo la
    // anterior pero su configuración era la nueva, y con ella se etiquetaban sus descargas, se guardaba el proyecto (que
    // ya no regeneraba su base) y se imprimía su encabezado (con otra semilla). recolectarConfiguracion y la validación
    // solo asignan propiedades de primer nivel: la copia superficial basta.
    const deLaBase = generadorDatos.configuracion;
    try {
        if (typeof BaseColumnar === 'undefined') {
            throw new Error('Falta el dominio del Simulador: src/main.js debe cargarse antes de app.js');
        }
        // Recolectar y validar la configuración nueva, en una copia
        reconciliarEstructurasTodas();   // (C1) la matriz sigue a la tabla I
        /** @type {any} */
        let configuracion, validacion;
        generadorDatos.configuracion = { ...deLaBase };
        try {
            configuracion = generadorDatos.recolectarConfiguracion();
            validacion = generadorDatos.validarConfiguracion();
        } finally {
            generadorDatos.configuracion = deLaBase;
        }
        // (2026.12.30) todos, en la tarjeta bajo «Generar»; el aviso emergente, el primero y cuántos más hay
        mostrarAvisosDeValidacion(validacion.errores, validacion.advertencias);
        const mas = (/** @type {string[]} */ l) => (l.length > 1 ? ` (y ${l.length - 1} más, en la lista bajo «Generar»)` : '');
        if (validacion.errores.length > 0) {
            mostrarToast('Error: ' + validacion.errores[0] + mas(validacion.errores), 'error');
            return;
        }
        const nAvisos = validacion.advertencias.length;
        if (nAvisos > 0) {
            console.warn('Advertencias:', validacion.advertencias);
            mostrarToast('⚠ ' + validacion.advertencias[0] + mas(validacion.advertencias), 'warning', 9000);
        }
        // Generar datos (asíncrono: Worker o respaldo en el hilo)
        const boton = document.getElementById('btnGenerar');
        boton.disabled = true; // Evitar doble ejecución mientras se procesa
        mostrarProgresoGeneracion(0, 'Preparando');
        // La configuración viaja tal cual: postMessage la clona (clon estructurado,
        // que conserva NaN y null) y el respaldo en el hilo la usa directamente.
        const esta = ++generacionVigente;
        MotorGeneracion.generar(configuracion, mostrarProgresoGeneracion)
            .then(resultado => {
                if (esta !== generacionVigente) {
                    mostrarToast('Se descartó la base que se estaba generando: mientras tanto se abrió otra configuración. Pulsa «Generar» si quieres una base con la nueva.', 'warning', 9000);
                    return;
                }
                // la base nueva entra con su configuración (la expandida que devuelve el motor o, si no la trae, la recolectada)
                mostrarResultadoGeneracion(resultado.configuracion ? resultado : { ...resultado, configuracion });
                const ri = resultado.resumenImperfecciones || {};
                const partesRi = [];
                if (ri.perdidos) partesRi.push(`${ri.perdidos} valores perdidos`);
                if (ri.descuidados) partesRi.push(`${ri.descuidados} respondientes descuidados`);
                if (ri.digitacion) partesRi.push(`${ri.digitacion} errores de digitación`);
                if (ri.aquiescentes) partesRi.push(`${ri.aquiescentes} aquiescentes`);
                if (ri.extremos) partesRi.push(`${ri.extremos} de respuesta extrema`);
                if (ri.controles) partesRi.push(`${ri.controles} ítem(s) de control (${ri.fallosControl} fallos)`);
                if (ri.tiempo) partesRi.push('tiempo de respuesta');
                const tiempo = resultado.ms >= 1000 ? ` (${(resultado.ms / 1000).toFixed(1)} s)` : '';
                // (2026.12.30) con avisos, el de «generada» los recuerda (antes tapaba el único que se mostraba)
                const conAvisos = nAvisos ? ` · ${nAvisos === 1 ? 'un aviso' : `${nAvisos} avisos`} de la configuración: revísalo${nAvisos === 1 ? '' : 's'} bajo «Generar»` : '';
                mostrarToast(partesRi.length ? `Base generada con imperfecciones realistas: ${partesRi.join(' · ')}${tiempo}${conAvisos}` : `¡Base de datos generada exitosamente!${tiempo}${conAvisos}`, nAvisos ? 'warning' : 'success', partesRi.length || nAvisos ? 9000 : undefined);
            })
            .catch(error => {
                if (esta !== generacionVigente) return;   // (revisión) el fallo de una generación descartada no importa ya
                mostrarToast(error.message, 'error');
                console.error(error);
            })
            .finally(() => {
                boton.disabled = false;
                ocultarProgresoGeneracion();
            });
    } catch (error) {
        generadorDatos.configuracion = deLaBase;
        mostrarToast(error.message, 'error');
        console.error(error);
        const boton = document.getElementById('btnGenerar');
        if (boton) boton.disabled = false;
        ocultarProgresoGeneracion();
    }
}

export { MotorGeneracion, mostrarProgresoGeneracion, ocultarProgresoGeneracion, mostrarResultadoGeneracion, generarBaseDatos, descartarGeneracionEnCurso };
