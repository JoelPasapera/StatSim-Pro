// @ts-check
// analizador/motor/columnas.js — (2027.01.17) qué columnas de una base son cuantitativas para las tarjetas que relacionan
// variables: al menos el 80 % de sus valores no perdidos son números y hay al menos 3 distintos (una dicotómica o una
// constante no lo son). Era una función local de la tarjeta del diagnóstico de forma; ahora la usa también la de la
// correlación parcial. Los perdidos y la conversión, los del núcleo (core/data/celdas.js). Sin DOM.
import { aNumero, esPerdido } from '../../core/data/celdas.js';

/**
 * @param {Record<string, unknown>[]} filas
 * @returns {string[]}
 */
export function columnasCuantitativas(filas) {
    if (!filas.length) return [];
    return Object.keys(/** @type {Record<string, unknown>} */ (filas[0])).filter(c => {
        let num = 0, total = 0; const vistos = new Set();
        for (const f of filas) { const v = f[c]; if (esPerdido(v)) continue; total++; const x = aNumero(v); if (Number.isFinite(x)) { num++; if (vistos.size < 3) vistos.add(x); } }
        return total > 0 && num / total >= 0.8 && vistos.size >= 3;
    });
}
