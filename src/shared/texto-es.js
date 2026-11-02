// @ts-check
// shared/texto-es.js — (2027.01.17) dos detalles del castellano en las redacciones: la conjunción «y», que pasa a «e» ante una
// palabra que empieza por el sonido /i/ («i», «hi», salvo los diptongos «ie», «hie»: «hielo»), y una lista con ella («A, B y C»;
// «Ansiedad e Ira»). La regla es la de InterpretacionesEstadisticas._conj, que la redacción de la correlación usa desde antes.
// Sin dependencias.

/**
 * «y» o «e», según la palabra que sigue.
 * @param {string} siguiente
 * @returns {'y' | 'e'}
 */
export function conjuncionY(siguiente) {
    return /^h?[ií](?![eé])/iu.test(String(siguiente).trim()) ? 'e' : 'y';   // (2027.01.20) también ante «Í» («e Índice»)
}

/**
 * Una lista en castellano: «A», «A y B», «A, B y C» (con «e» si el último empieza por /i/).
 * @param {string[]} elementos
 * @returns {string}
 */
export function listaY(elementos) {
    if (elementos.length <= 1) return elementos.join('');
    const ultimo = /** @type {string} */ (elementos[elementos.length - 1]);
    return `${elementos.slice(0, -1).join(', ')} ${conjuncionY(ultimo)} ${ultimo}`;
}
