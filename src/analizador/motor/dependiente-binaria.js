// @ts-check
// analizador/motor/dependiente-binaria.js — (2027.01.01) una variable de dos categorías con nombre (el desenlace binario
// del Simulador, «No» y «Sí»; una columna «Aprobado / Desaprobado» de un CSV) como variable dependiente de la regresión
// logística: el 1 es el evento y el 0, la referencia. Hasta la 2026.12.31 la regresión solo admitía una dependiente
// numérica 0/1, y el desenlace del Simulador, que llega con sus etiquetas, ni aparecía entre las dependientes.
// Qué categoría es el evento:
//   · si se conocen los códigos de la variable (los del Simulador, las etiquetas de valor de un .sav, la hoja «Diccionario»
//     del libro de Excel del Simulador o un proyecto: «0 = No; 1 = Sí»), la de código mayor, como en SPSS;
//   · si no (un CSV, que solo trae los nombres), la que va después en orden alfabético (lo que haría la recodificación
//     automática de SPSS), salvo que esa sea la negativa de la pareja («No», «Sin riesgo», «Ausente»…): entonces, la otra.
// Así, sin códigos, «No / Sí», «Ausente / Presente» y «Riesgo / Sin riesgo» modelan el «Sí», el «Presente» y el «Riesgo».
// Sin DOM.
import { aNumero, esPerdido } from '../../core/data/celdas.js';

/** Las categorías que niegan («No», «Ninguno», «Sin…», «Ausente», «Negativo», «Falso», «Nunca»), sin tildes ni mayúsculas. */
const NEGATIVA = /^(?:(?:no|sin|nunca|ningun[oa]?)\b|ausen|negativ|fals)/;

/** Una categoría sin tildes ni mayúsculas, para reconocer las negativas. @param {string} t */
const plano = t => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * @typedef {Array<[number, string]>} CodigosDeCategorias
 *   los códigos de las categorías de una columna, con sus etiquetas ([código, etiqueta]): los de un .sav, los del Simulador
 */

/**
 * @typedef {{ evento: string, referencia: string, segun: 'codigos' | 'nombres', codigo: (valor: unknown) => number }} CodificacionBinaria
 *   segun: si el evento salió de los códigos de la variable o de los nombres de sus categorías;
 *   codigo: 1 para el evento, 0 para la referencia y NaN para un perdido (o cualquier otro valor)
 */

/**
 * El código de cada etiqueta, si cada una tiene uno solo; null si no hay códigos o si alguna etiqueta tiene dos.
 * @param {CodigosDeCategorias | null | undefined} codigos
 * @returns {Map<string, number> | null}
 */
function codigoPorEtiqueta(codigos) {
    if (!Array.isArray(codigos) || !codigos.length) return null;
    /** @type {Map<string, number>} */
    const mapa = new Map();
    for (const par of codigos) {
        if (!Array.isArray(par) || typeof par[0] !== 'number' || !Number.isFinite(par[0]) || typeof par[1] !== 'string') return null;
        const etiqueta = par[1].trim(), previo = mapa.get(etiqueta);
        if (previo !== undefined && previo !== par[0]) return null;
        mapa.set(etiqueta, par[0]);
    }
    return mapa;
}

/**
 * La codificación 0/1 de una variable con exactamente dos categorías con nombre; null si es numérica (la regresión la usa
 * como viene) o si no tiene dos categorías.
 * @param {ReadonlyArray<unknown>} valores los de la columna, con sus perdidos
 * @param {CodigosDeCategorias | null} [codigos] los códigos de sus categorías, si se conocen
 * @returns {CodificacionBinaria | null}
 */
export function codificacionBinaria(valores, codigos = null) {
    /** @type {Set<string>} */
    const categorias = new Set();
    let numericos = 0;
    for (const v of valores) {
        if (esPerdido(v)) continue;
        if (Number.isFinite(aNumero(v))) { numericos++; continue; }
        categorias.add(String(v).trim());
        if (categorias.size > 2) return null;
    }
    if (numericos > 0 || categorias.size !== 2) return null;
    const [a, b] = /** @type {[string, string]} */ ([...categorias].sort((x, y) => x.localeCompare(y, 'es')));
    const porEtiqueta = codigoPorEtiqueta(codigos);
    const ca = porEtiqueta ? porEtiqueta.get(a) : undefined, cb = porEtiqueta ? porEtiqueta.get(b) : undefined;
    const conCodigos = ca !== undefined && cb !== undefined && ca !== cb;
    const [referencia, evento] = conCodigos
        ? (/** @type {number} */ (ca) < /** @type {number} */ (cb) ? [a, b] : [b, a])
        : (NEGATIVA.test(plano(b)) && !NEGATIVA.test(plano(a)) ? [b, a] : [a, b]);
    return {
        evento, referencia, segun: conCodigos ? 'codigos' : 'nombres',
        codigo: valor => {
            if (esPerdido(valor)) return NaN;
            const t = String(valor).trim();
            return t === evento ? 1 : t === referencia ? 0 : NaN;
        },
    };
}
