// analizador/psicometria/tareas-psicometricas.js — las tareas pesadas de la psicometría, sin DOM: la ejecutan igual el
// Worker (psicometria.worker.js) y, si el navegador no tiene Workers, el hilo principal (servicio-psicometrico.js).
//   · 'ordinal'   → α y ω ordinales de cada grupo (matrices policóricas/tetracóricas)
//   · 'bootstrap' → intervalos de confianza de α, ω y los ordinales
import { fiabilidadOrdinal } from './ordinal.js';
import { bootstrapGrupo } from './bootstrap.js';
import { analizarAFE } from './afe.js';
import { analizarInvarianza } from './invarianza.js';
import { analizarInvarianzaOrdinal } from './invarianza-ordinal.js';
import { diagnosticarForma } from '../relaciones/diagnostico-forma.js';

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
    if (tipo === 'afe') return grupos.map(g => ({ clave: g.clave, resultado: analizarAFE(g.cols, g.nombres, opciones, alProgreso) }));
    if (tipo === 'forma') return grupos.map(g => ({ clave: g.clave, resultado: diagnosticarForma(g.x, g.y, opciones) }));
    if (tipo === 'invarianza') {
        const analizar = opciones.estimador === 'WLSMV' ? analizarInvarianzaOrdinal : analizarInvarianza;
        return grupos.map(g => ({ clave: g.clave, resultado: analizar(g.modelo, g.filas, g.variableGrupo, opciones, alProgreso) }));
    }
    throw new Error('Tarea desconocida: ' + tipo);
}
