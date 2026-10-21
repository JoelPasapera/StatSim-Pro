// @ts-check
// buscador/fuentes/terminos.js — los términos clave de una consulta, para las fuentes que buscan palabras sueltas unidas
// con AND (Scopus, Web of Science, PubMed, SciELO, ALICIA y, desde la 2026.12.27, ScienceDirect, con su AND implícito).
// (2026.12.26) Una sola implementación: Scopus, PubMed, SciELO y ALICIA tenían cada una su copia del mismo algoritmo
// (la consulta en minúsculas, sin tildes ni signos, sin palabras vacías y sin términos de una o dos letras, sin repetir);
// solo cambiaban las palabras vacías que cada fuente añade a las comunes. Los términos que devuelven no cambian.

/** Las palabras vacías comunes (español e inglés): estorban la coincidencia en todas las fuentes. @type {ReadonlySet<string>} */
export const PALABRAS_VACIAS = new Set(['entre', 'e', 'y', 'o', 'u', 'de', 'del', 'la', 'el', 'los', 'las', 'en', 'con', 'para', 'por',
    'un', 'una', 'su', 'sus', 'al', 'a', 'the', 'of', 'and', 'or', 'in', 'on', 'for', 'to', 'with', 'between', 'an']);

/**
 * Las palabras vacías comunes más las propias de una fuente (otra lengua, o las palabras que su sintaxis reserva).
 * @param {Iterable<string>} propias
 * @returns {ReadonlySet<string>}
 */
export function conPalabrasVacias(propias) {
    return new Set([...PALABRAS_VACIAS, ...propias]);
}

/**
 * Los términos clave de una consulta, en el orden en que aparecen y sin repetir: en minúsculas, sin tildes (la «ñ» queda
 * en «n»), con los signos convertidos en separadores, sin las palabras vacías y sin los términos de una o dos letras.
 * @param {unknown} consulta
 * @param {ReadonlySet<string>} [vacias] las palabras vacías (por omisión, las comunes)
 * @returns {string[]}
 */
export function terminosClave(consulta, vacias = PALABRAS_VACIAS) {
    const tokens = String(consulta).toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9ñ\s]/g, ' ').split(/\s+/)
        .filter(t => t.length > 2 && !vacias.has(t));
    return [...new Set(tokens)];
}
