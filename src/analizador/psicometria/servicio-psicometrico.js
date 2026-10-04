// analizador/psicometria/servicio-psicometrico.js — puerta única del hilo principal a las tareas pesadas de la psicometría.
// Con Worker: se ejecutan en segundo plano, con progreso y cancelación (terminar el Worker es inmediato). Sin Worker
// (navegadores muy antiguos, pruebas en Node): el mismo cálculo en el hilo principal, en un turno aparte.
import { procesar } from './tareas-psicometricas.js';

// Un Worker por canal: el AFE no espera a que termine un bootstrap de la fiabilidad (ni al revés) y cancelar uno no
// corta el otro. sinWorker: un Worker falló una vez; desde entonces todo va al hilo principal.
const workers = new Map(), tareas = new Map();
let secuencia = 0, sinWorker = false;
const canalDe = tipo => (['afe', 'invarianza', 'forma'].includes(tipo) ? tipo : 'fiabilidad');   // (2026.10.19) canal propio para la invarianza

function crearWorker(canal) {
    if (typeof Worker === 'undefined' || typeof URL === 'undefined') return null;
    try {
        const w = new Worker(new URL('./psicometria.worker.js', import.meta.url), { type: 'module', name: 'psicometria-' + canal });
        w.onmessage = ({ data }) => {
            const t = tareas.get(data.id);
            if (!t || t.canal !== canal) return;
            if (data.tipo === 'progreso') { if (t.alProgreso) t.alProgreso(data.hecho, data.total); return; }
            tareas.delete(data.id);
            if (data.tipo === 'fin') t.resolver(data.res); else t.rechazar(new Error(data.mensaje));
        };
        w.onerror = e => {
            // el Worker no pudo cargarse o se rompió: sus tareas se terminan en el hilo principal, sin perder el trabajo
            sinWorker = true;
            console.warn('Cálculo en segundo plano no disponible; se usa el hilo principal:', (e && e.message) || e);
            for (const [id, t] of tareas) {
                if (t.canal !== canal) continue;
                tareas.delete(id);
                setTimeout(() => { try { t.resolver(procesar(t.tipo, t.grupos, t.opciones, t.alProgreso)); } catch (err) { t.rechazar(err); } }, 0);
            }
            try { w.terminate(); } catch (_) { /* ya terminado */ }
            if (workers.get(canal) === w) workers.delete(canal);
        };
        return w;
    } catch (e) { return null; }
}

function workerDe(canal) {
    if (sinWorker) return null;
    if (!workers.has(canal)) { const w = crearWorker(canal); if (!w) return null; workers.set(canal, w); }
    return workers.get(canal);
}
export function hayWorker(canal = 'fiabilidad') { return !!workerDe(canal); }

const cancelacion = () => Object.assign(new Error('Cálculo cancelado'), { cancelado: true });

// → { promesa, cancelar }
export function ejecutarTarea(tipo, grupos, opciones = {}, alProgreso = null) {
    const id = ++secuencia, canal = canalDe(tipo), w = workerDe(canal);
    if (w) {
        let cancelar = () => {};
        const promesa = new Promise((resolver, rechazar) => {
            tareas.set(id, { resolver, rechazar, alProgreso, tipo, grupos, opciones, canal });
            w.postMessage({ id, tipo, grupos, opciones });
            cancelar = () => {
                if (!tareas.has(id)) return;
                for (const [otra, t] of tareas) if (t.canal === canal) { tareas.delete(otra); if (otra !== id) t.rechazar(cancelacion()); }   // solo las de su canal
                w.terminate(); workers.delete(canal);
                rechazar(cancelacion());
            };
        });
        return { promesa, cancelar };
    }
    let cancelado = false;
    const promesa = new Promise((resolver, rechazar) => setTimeout(() => {
        if (cancelado) { rechazar(cancelacion()); return; }
        try { resolver(procesar(tipo, grupos, opciones, alProgreso)); } catch (e) { rechazar(e); }
    }, 0));
    return { promesa, cancelar: () => { cancelado = true; } };
}
