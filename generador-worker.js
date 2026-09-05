/**
 * generador-worker.js — Web Worker de generación (B4).
 *
 * Ejecuta GeneradorDatos fuera del hilo de la interfaz: la página sigue viva
 * mientras se generan 100 000 participantes, y recibe el avance por mensajes.
 * Al terminar, la base columnar viaja por TRANSFERENCIA de sus ArrayBuffer
 * (sin copia) junto con el informe pedido/obtenido y los diagnósticos.
 *
 * Carga sus dependencias con la misma versión (?v=) que index.html usa para
 * la página, que app.js le pasa en la URL del Worker:
 *     new Worker('generador-worker.js?v=1&b=1&g=11')
 *        b → base-columnar.js?v=b      g → generador-datos.js?v=g
 *
 * Protocolo (mensajes hacia el Worker):
 *     { id, configuracion }              → genera con esa configuración
 * Mensajes desde el Worker:
 *     { id, tipo: 'progreso', fraccion, etapa }
 *     { id, tipo: 'listo', base, informe, diagnosticoCorrelaciones,
 *                          resumenImperfecciones, diferenciasLimitadas, ms }
 *     { id, tipo: 'error', mensaje }
 */
(function () {
    const parametros = new URLSearchParams(self.location.search);
    const version = (clave) => encodeURIComponent(parametros.get(clave) || '1');
    importScripts(`base-columnar.js?v=${version('b')}`, `generador-datos.js?v=${version('g')}`);

    self.onmessage = function (evento) {
        const mensaje = evento.data || {};
        const id = mensaje.id;
        const inicio = Date.now();
        try {
            const generador = new GeneradorDatos();
            generador.configuracion = mensaje.configuracion;
            let ultimoAviso = 0;
            const base = generador.generarBaseDatos((fraccion, etapa) => {
                // Como mucho un aviso cada 60 ms: la interfaz no necesita más.
                const ahora = Date.now();
                if (fraccion >= 1 || ahora - ultimoAviso >= 60) {
                    ultimoAviso = ahora;
                    self.postMessage({ id, tipo: 'progreso', fraccion, etapa });
                }
            });
            self.postMessage({ id, tipo: 'progreso', fraccion: 0.97, etapa: 'Comprobando pedido vs. obtenido' });
            const informe = generador.informePedidoObtenido(base);
            const serial = base.serializar();
            self.postMessage({
                id,
                tipo: 'listo',
                base: { n: serial.n, columnas: serial.columnas },
                informe,
                diagnosticoCorrelaciones: generador.diagnosticoCorrelaciones,
                resumenImperfecciones: generador.resumenImperfecciones,
                diferenciasLimitadas: generador.diferenciasLimitadas || [],
                ms: Date.now() - inicio
            }, serial.transferibles);
        } catch (error) {
            self.postMessage({ id, tipo: 'error', mensaje: (error && error.message) ? error.message : String(error) });
        }
    };
})();
