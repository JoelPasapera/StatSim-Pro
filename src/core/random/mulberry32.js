// @ts-check
// core/random/mulberry32.js — el generador pseudoaleatorio con semilla del programa (mulberry32, de Tommy Ettinger): 32
// bits de estado, aritmética entera de 32 bits y un número en [0, 1) por llamada; la misma semilla da la misma secuencia en
// cualquier navegador. (2026.12.25, cierre de la fase F6) Había siete copias, con la misma secuencia: la del Simulador
// (generador.js) y sus fuentes propias en la validación, la selección, las formas de relación y el informe, y la de las
// pruebas de la forma de una relación (relaciones/util-numerico.js). Sin dependencias.

/**
 * Generador mulberry32: una función que devuelve el siguiente número de [0, 1). La semilla se lleva a un entero de 32
 * bits sin signo (truncada; NaN e ±∞ dan 0).
 * @param {number} semilla
 * @returns {() => number}
 */
export function mulberry32(semilla) {
    let estado = semilla >>> 0;
    return () => {
        estado = (estado + 0x6D2B79F5) >>> 0;
        let t = estado;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
