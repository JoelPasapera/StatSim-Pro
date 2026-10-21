// @ts-check
// analizador/motor/marco.js — el marco de la investigación del análisis general (el tipo de estudio y el nivel de
// significación) y las dimensiones de sus variables escritas como texto (2026.12.24, fase F6, paso 4; antes, dentro de
// estadistica.js, que guarda el estado y usa estas reglas).

/** @typedef {{ tipoEstudio: string, nivelSignificancia: number, [clave: string]: unknown }} MarcoInvestigacion */
/** @typedef {Record<string, string[]>} Dimensiones  nombre de cada dimensión → sus ítems (columnas de la base) */

/**
 * El marco con que empieza el Analizador: un estudio correlacional con α = .05.
 * @returns {MarcoInvestigacion}
 */
export function marcoInicial() {
    return { tipoEstudio: 'correlacional', nivelSignificancia: 0.05 };
}

/**
 * (2026.12.22) El nivel de significación del estudio, validado (0 < α < 1; si no, .05): el de las decisiones de la vista
 * principal, de la pestaña de grupos, de la criba sociodemográfica y de los objetivos específicos (en pantalla y en el Word).
 * @param {{ nivelSignificancia?: unknown } | null | undefined} marco
 * @returns {number}
 */
export function alfaDelMarco(marco) {
    const a = marco ? marco.nivelSignificancia : NaN;
    return typeof a === 'number' && Number.isFinite(a) && a > 0 && a < 1 ? a : 0.05;
}

/**
 * Dimensiones escritas como «Dimensión1:Ítem1,Ítem2;Dimensión2:Ítem3,Ítem4»: se ignoran los espacios alrededor, los
 * segmentos sin «:» o con más de uno y las dimensiones sin ítems.
 * @param {string} texto
 * @returns {Dimensiones}
 */
export function parsearDimensiones(texto) {
    /** @type {Dimensiones} */
    const dimensiones = {};
    texto.split(';').map(d => d.trim()).filter(d => d).forEach(segmento => {
        const partes = segmento.split(':');
        if (partes.length !== 2) return;
        const nombre = /** @type {string} */ (partes[0]).trim();
        const items = /** @type {string} */ (partes[1]).split(',').map(i => i.trim()).filter(i => i);
        if (nombre && items.length > 0) dimensiones[nombre] = items;
    });
    return dimensiones;
}

/**
 * Los ítems de unas dimensiones que no son columnas de la base (en el orden en que aparecen).
 * @param {Dimensiones} dimensiones
 * @param {string[]} columnas
 * @returns {string[]}
 */
export function itemsAusentes(dimensiones, columnas) {
    return Object.values(dimensiones).flat().filter(item => !columnas.includes(item));
}
