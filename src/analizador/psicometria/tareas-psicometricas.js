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
import { analizarProceso } from '../relaciones/mediacion.js';
import { imputarPMM } from '../../core/stats/imputacion.js';
import { exitosMediacion } from '../../core/stats/potencia-mediacion.js';
import { ajustarTRI } from '../../core/stats/tri.js';
import { difRegresionLogistica } from '../../core/stats/dif.js';

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
    // (2027.01.17) la mediación y la moderación (modelos de PROCESS) con su bootstrap de casos
    if (tipo === 'mediacion') return grupos.map(g => ({ clave: g.clave, resultado: analizarProceso(g.pedido, opciones, alProgreso) }));
    // (2027.01.18) la imputación múltiple por ecuaciones encadenadas (sus m cadenas, o las que se pidan: (2027.01.19) el grupo
    // de Workers reparte las cadenas, servicio-psicometrico.js)
    if (tipo === 'imputacion') return grupos.map(g => ({ clave: g.clave, resultado: imputarPMM(g.columnas, { ...opciones, alProgreso }) }));
    // (2027.01.18) la potencia de la mediación simple por Monte Carlo; (2027.01.19) por tramos de réplicas, que reparte el
    // grupo de Workers (servicio-psicometrico.js): cuántas dan significativos a y b
    if (tipo === 'exitos-mediacion') return grupos.map(g => ({ clave: g.clave, resultado: exitosMediacion(g.a, g.b, g.cp, g.n, { ...opciones, alProgreso }) }));
    // (2027.01.19) la teoría de respuesta al ítem: Rasch, 2PL o GRM por máxima verosimilitud marginal (EM)
    if (tipo === 'tri') return grupos.map(g => ({ clave: g.clave, resultado: ajustarTRI(g.X, { ...opciones, alProgreso }) }));
    // (2027.01.20) el DIF por regresión logística (tres modelos por ítem), con el progreso por ítem
    if (tipo === 'dif') return grupos.map(g => ({ clave: g.clave, resultado: difRegresionLogistica(g.X, g.grupo, { ...opciones, categorias: g.categorias, alProgreso }) }));
    if (tipo === 'invarianza') {
        const analizar = opciones.estimador === 'WLSMV' ? analizarInvarianzaOrdinal : analizarInvarianza;
        return grupos.map(g => ({ clave: g.clave, resultado: analizar(g.modelo, g.filas, g.variableGrupo, opciones, alProgreso) }));
    }
    throw new Error('Tarea desconocida: ' + tipo);
}
