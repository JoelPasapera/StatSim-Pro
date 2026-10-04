// analizador/psicometria/aiken-ejemplo.js — datos de ejemplo de la V de Aiken: 10 ítems, 5 jueces, 3 criterios,
// escala 1–4. Incluye a propósito ítems válidos, dudosos y no válidos para que se vean las tres decisiones.
const tabla = filas => ['Ítem\tJuez 1\tJuez 2\tJuez 3\tJuez 4\tJuez 5', ...filas.map((f, i) => `Ítem ${i + 1}\t${f.join('\t')}`)].join('\n');

export const EJEMPLO_AIKEN = {
    minimo: 1, maximo: 4, confianza: 0.95, v0: 0.70,
    criterios: [
        { nombre: 'Pertinencia', texto: tabla([[4, 4, 4, 4, 4], [4, 4, 3, 4, 4], [4, 3, 3, 4, 4], [3, 2, 3, 2, 3], [4, 4, 4, 4, 3], [4, 4, 4, 3, 4], [4, 4, 4, 4, 4], [3, 4, 4, 4, 4], [4, 4, 4, 4, 4], [4, 3, 4, 4, 4]]) },
        { nombre: 'Relevancia', texto: tabla([[4, 4, 4, 4, 4], [4, 4, 4, 4, 3], [4, 3, 4, 3, 4], [3, 3, 2, 2, 3], [4, 4, 4, 4, 4], [4, 3, 4, 4, 4], [4, 4, 4, 4, 4], [4, 4, 4, 3, 4], [4, 4, 4, 4, 4], [4, 4, 3, 4, 4]]) },
        { nombre: 'Claridad', texto: tabla([[4, 4, 4, 4, 4], [4, 3, 4, 4, 4], [3, 4, 4, 3, 4], [2, 3, 3, 2, 2], [4, 4, 4, 4, 4], [3, 4, 3, 4, 4], [4, 4, 4, 4, 3], [4, 4, 4, 4, 4], [4, 4, 3, 4, 4], [4, 4, 4, 4, 4]]) }
    ]
};
