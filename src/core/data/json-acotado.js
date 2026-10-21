// @ts-check
// core/data/json-acotado.js — (2026.12.31, cuarta revisión) un JSON que llega de un archivo ajeno (un proyecto), medido
// antes de leerlo. JSON.parse construye todo lo que el texto describe antes de que nada lo compruebe: unos KB comprimidos
// de «{}» repetidos eran decenas de millones de objetos (segundos de pestaña congelada y gigas de memoria), y unos de listas
// anidadas («[[[[…]]]]», sin una sola coma) la tumbaban. Una pasada lineal cuenta, fuera de las cadenas, las comas, las
// listas y los objetos y la profundidad, sin construir nada; quien lee cada archivo la compara con lo que admite su forma.
// Sin DOM.

/**
 * @typedef {{ comas: number, contenedores: number, profundidad: number }} MedidaJson
 *   comas: las «,» fuera de las cadenas; contenedores: las listas y los objetos («[» y «{»); profundidad: los niveles de
 *   anidamiento (Infinity si se dejó de medir al pasar del tope)
 * @typedef {{ elementos: number, contenedores: number, profundidad: number }} TopesJson
 *   elementos: las comas y los contenedores, más uno (una cota de los valores que construiría JSON.parse)
 */

/**
 * Las comas, los contenedores y la profundidad de un texto JSON, en una pasada (las cadenas, saltadas con indexOf). Deja de
 * medir en cuanto la profundidad pasa de `maximaProfundidad`. No comprueba que sea JSON válido: eso lo hace JSON.parse.
 * @param {string} texto
 * @param {number} [maximaProfundidad]
 * @returns {MedidaJson}
 */
export function medirJson(texto, maximaProfundidad = Infinity) {
    let comas = 0, contenedores = 0, nivel = 0, profundidad = 0;
    for (let i = 0; i < texto.length; i++) {
        const c = texto.charCodeAt(i);
        if (c === 34) {   // «"»: hasta la comilla que la cierra (la que no lleva delante un número impar de «\»)
            let q = i;
            for (;;) {
                q = texto.indexOf('"', q + 1);
                if (q < 0) return { comas, contenedores, profundidad };   // sin cerrar: JSON.parse dirá que no es JSON
                let barras = 0;
                while (texto.charCodeAt(q - 1 - barras) === 92) barras++;
                if (barras % 2 === 0) break;
            }
            i = q;
        } else if (c === 44) comas++;
        else if (c === 91 || c === 123) {
            contenedores++;
            if (++nivel > profundidad) {
                profundidad = nivel;
                if (profundidad > maximaProfundidad) return { comas, contenedores, profundidad: Infinity };
            }
        } else if (c === 93 || c === 125) nivel--;
    }
    return { comas, contenedores, profundidad };
}

/**
 * Lo que un texto JSON excede de unos topes, sin leerlo: 'profundidad', 'contenedores' o 'elementos' (en ese orden), o
 * null si cabe.
 * @param {string} texto
 * @param {TopesJson} topes
 * @returns {'profundidad' | 'contenedores' | 'elementos' | null}
 */
export function excesoDeJson(texto, topes) {
    const m = medirJson(texto, topes.profundidad);
    if (m.profundidad > topes.profundidad) return 'profundidad';
    if (m.contenedores > topes.contenedores) return 'contenedores';
    if (m.comas + m.contenedores + 1 > topes.elementos) return 'elementos';
    return null;
}

/**
 * El valor de un texto JSON que cabe en unos topes; si no cabe o no es JSON, un error con `forma` («las etiquetas guardadas
 * («etiquetas.json») no tienen la forma esperada») o `invalido` («… no son JSON válido»).
 * @param {string} texto
 * @param {TopesJson} topes
 * @param {{ forma: string, invalido: string }} mensajes
 * @param {(texto: string) => unknown} [leer] JSON.parse, o el lector de un JSON propio (core/data/json-fiel.js)
 * @returns {any}
 */
export function leerJsonAcotado(texto, topes, mensajes, leer = JSON.parse) {
    if (excesoDeJson(texto, topes)) throw new Error(mensajes.forma);
    try { return leer(texto); } catch (e) { throw new Error(mensajes.invalido); }
}
