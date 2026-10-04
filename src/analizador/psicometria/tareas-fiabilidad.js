// analizador/psicometria/tareas-fiabilidad.js — las dos tareas pesadas de la fiabilidad, sin DOM: la ejecutan igual el
// Worker (fiabilidad.worker.js) y, si el navegador no tiene Workers, el hilo principal (servicio-fiabilidad.js).
//   · 'ordinal'   → α y ω ordinales de cada grupo (matrices policóricas/tetracóricas)
//   · 'bootstrap' → intervalos de confianza de α, ω y los ordinales
import { fiabilidadOrdinal } from './ordinal.js';
import { bootstrapGrupo } from './bootstrap.js';

export function procesar(tipo, grupos, opciones = {}, alProgreso = null) {
    if (tipo === 'ordinal') return grupos.map(g => ({ clave: g.clave, ordinal: fiabilidadOrdinal(g.cols) }));
    if (tipo === 'bootstrap') {
        // progreso exacto: cada grupo aporta B remuestras y, con BCa, tantos recálculos de jackknife como casos
        const B = opciones.B || 1000, unidadesDe = g => B + (opciones.metodo === 'bca' ? g.cols[0].length : 0);
        const total = grupos.reduce((s, g) => s + unidadesDe(g), 0);
        let hechos = 0;
        return grupos.map(g => {
            const r = bootstrapGrupo(g.cols, opciones, { alProgreso: alProgreso ? h => alProgreso(hechos + h, total) : null });
            hechos += unidadesDe(g);
            return { clave: g.clave, ...r };
        });
    }
    throw new Error('Tarea desconocida: ' + tipo);
}
