// analizador/psicometria/psicometria.worker.js — Worker de módulo: calcula las tareas pesadas de la psicometría fuera
// del hilo principal y avisa el progreso. Se cancela terminándolo (servicio-psicometrico.js crea otro a la siguiente).
import { procesar } from './tareas-psicometricas.js';

self.onmessage = ({ data }) => {
    const { id, tipo, grupos, opciones } = data;
    try {
        let ultimo = 0;
        const res = procesar(tipo, grupos, opciones, (hecho, total) => {
            const ahora = Date.now();
            if (ahora - ultimo > 120 || hecho >= total) { ultimo = ahora; self.postMessage({ id, tipo: 'progreso', hecho, total }); }
        });
        self.postMessage({ id, tipo: 'fin', res });
    } catch (e) {
        self.postMessage({ id, tipo: 'error', mensaje: e && e.message ? e.message : String(e) });
    }
};
