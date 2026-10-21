// @ts-check
// shared/temporizador.js — temporizadores cosméticos: ocultar un aviso, liberar la URL de una descarga, restaurar el texto de un
// botón. En el navegador es un setTimeout de siempre; fuera de él (Node, en las pruebas) no retiene el proceso, porque su único
// efecto es visual. Antes, cada aviso dejaba vivo 3 s el proceso de su archivo de pruebas: la batería esperaba ≈ 60 s sin hacer nada.

/**
 * Programa una acción cosmética que no debe impedir que un proceso termine.
 * @param {() => void} accion acción visual (ocultar, liberar, restaurar)
 * @param {number} ms espera en milisegundos
 * @returns {number | object} el identificador de setTimeout (número en el navegador, objeto en Node), para clearTimeout
 */
export function temporizadorCosmetico(accion, ms) {
    const id = /** @type {any} */ (setTimeout(accion, ms));
    // en Node, setTimeout devuelve un objeto con unref(); en el navegador, un número y la llamada no ocurre
    if (id !== null && typeof id === 'object' && typeof id.unref === 'function') id.unref();
    return id;
}
