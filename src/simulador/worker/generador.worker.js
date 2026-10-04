// simulador/worker/generador.worker.js — Worker de tipo módulo: genera la base fuera del hilo principal.
// Mensajes:  { id, configuracion }  →  { id, tipo: 'progreso', fraccion, etapa }*  →  { id, tipo: 'listo', base, informe,
//            configuracion (expandida, sin funciones), diagnosticoCorrelaciones, resumenImperfecciones, diferenciasLimitadas, ms }
//            o { id, tipo: 'error', mensaje }.  La base viaja serializada con sus buffers transferidos.
import { GeneradorDatos } from '../dominio/generador.js';

export function manejarMensaje(mensaje, postMessage) {
    const id = mensaje.id, inicio = Date.now();
    try {
        const generador = new GeneradorDatos();
        generador.configuracion = mensaje.configuracion;
        let ultimoAviso = 0;
        const base = generador.generarBaseDatos((fraccion, etapa) => {
            const ahora = Date.now();
            if (ahora - ultimoAviso >= 80 || fraccion >= 1) { ultimoAviso = ahora; postMessage({ id, tipo: 'progreso', fraccion, etapa }); }
        });
        postMessage({ id, tipo: 'progreso', fraccion: 0.97, etapa: 'Comprobando pedido vs. obtenido' });
        const informe = generador.informePedidoObtenido(base);
        const serial = base.serializar();
        postMessage({
            id, tipo: 'listo',
            base: { n: serial.n, columnas: serial.columnas },
            informe,
            // sin funciones: la forma beta-binomial de las dicotómicas es una clausura y no se puede clonar
            configuracion: JSON.parse(JSON.stringify(generador.configuracion, (k, v) => (typeof v === 'function' ? undefined : v))),
            diagnosticoCorrelaciones: generador.diagnosticoCorrelaciones,
            resumenImperfecciones: generador.resumenImperfecciones,
            diferenciasLimitadas: generador.diferenciasLimitadas || [],
            ms: Date.now() - inicio
        }, serial.transferibles);
    } catch (error) {
        postMessage({ id, tipo: 'error', mensaje: (error && error.message) ? error.message : String(error) });
    }
}

if (typeof self !== 'undefined' && typeof self.postMessage === 'function' && typeof window === 'undefined') {
    self.onmessage = evento => manejarMensaje(evento.data || {}, (m, t) => self.postMessage(m, t));
}
