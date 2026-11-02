// @ts-check
// analizador/tri/tri-redaccion.js — (2027.01.19) lo que se escribe de un modelo de TRI: la tabla de los parámetros de cada
// ítem con sus errores típicos (y la banda de su discriminación según Baker, 2001), el ajuste (−2LL, AIC, BIC, la fiabilidad
// marginal), la tabla del DIF con su clasificación de Jodoin y Gierl (2001), la redacción APA 7, el CSV de las puntuaciones y
// el Word. Sin DOM.
// (2027.01.20, revisión) Un DIF cuyas partes no son significativas por separado se dice como tal (antes, «uniforme»), y la
// dirección del grupo, solo si el efecto uniforme lo es; los ítems no calculables, con su motivo; Holm (1979), Nagelkerke
// (1991) y McCullagh (1980), citados con su año, y las puntuaciones EAP (Embretson y Reise, 2000); las referencias, solo las
// citadas (Chalmers, 2012, la de mirt, ya no: el programa no usa mirt).
import { numeroConMenos, pConSigno } from '../../shared/formato-numero.js';
import { referenciasDe } from '../informe/referencias-apa.js';
import { tituloWord, parrafoWord, tablaWord, figuraWord, referenciasWord, documentoWord } from '../informe/word-apa.js';
import { listaY } from '../../shared/texto-es.js';
import { celdaCSVEs } from '../../shared/csv.js';

/** @typedef {ReturnType<typeof import('../../core/stats/tri.js').ajustarTRI>} ResultadoTRI */
/** @typedef {ReturnType<typeof import('../../core/stats/dif.js').difRegresionLogistica>} ResultadoDIF */
/** @typedef {Extract<ResultadoDIF['items'][number], { valido: true }>} ItemDIFValido */
/**
 * @typedef {{ escala: string, items: string[], grupo: string | null, niveles: string[], excluidos: number, alfa: number }} ContextoTRI
 *   niveles: el nombre de cada grupo del DIF, en el orden de sus códigos (el primero, el de referencia)
 */

/** El nombre de cada modelo. */
export const NOMBRE_MODELO = Object.freeze({ rasch: 'modelo de Rasch', '2pl': 'modelo logístico de dos parámetros (2PL)', grm: 'modelo de respuesta graduada (GRM)' });

/** El modelo con su cita, para la primera mención en el texto. */
const CON_CITA = Object.freeze({ rasch: 'el modelo de Rasch (Rasch, 1960)', '2pl': 'el modelo logístico de dos parámetros (2PL; Birnbaum, 1968)', grm: 'el modelo de respuesta graduada (GRM; Samejima, 1969)' });

/**
 * La banda de una discriminación (en la métrica logística, sin D = 1,7; Baker, 2001).
 * @param {number} a
 * @returns {'nula o negativa' | 'muy baja' | 'baja' | 'moderada' | 'alta' | 'muy alta'}
 */
export function bandaDiscriminacion(a) {
    return !(a > 0) ? 'nula o negativa' : a < 0.35 ? 'muy baja' : a < 0.65 ? 'baja' : a < 1.35 ? 'moderada' : a < 1.7 ? 'alta' : 'muy alta';
}

/** La clasificación del DIF en palabras. @type {Readonly<Record<string, string>>} */
export const CLASE_DIF = Object.freeze({ A: 'insignificante', B: 'moderado', C: 'grande' });

/** @param {number} v @param {number} [d] */
const fx = (v, d = 2) => numeroConMenos(v, d);
/** Un coeficiente sin el cero inicial. @param {number} v @param {number} [d] */
const sinCero = (v, d = 2) => fx(v, d).replace(/^(−?)0\./, '$1.');
/** Un p de tabla («.034», «< .001»). @param {number} p @param {number} alfa */
const pTabla = (p, alfa) => pConSigno(p, { alfa }).replace(/^= /, '');

/**
 * El DIF de un ítem en palabras: su tipo y, con dos grupos y DIF uniforme, qué grupo puntúa más alto a igual nivel del rasgo.
 * @param {ItemDIFValido} it
 * @param {ContextoTRI} ctx
 */
function queDIF(it, ctx) {
    if (it.tipo === 'no determinado') return 'sin que el uniforme ni el no uniforme sean significativos por separado';
    const favor = (it.tipo === 'uniforme' || it.tipo === 'mixto') && ctx.niveles.length === 2 && Number.isFinite(it.efectoGrupo[0])
        ? `, más alto en ${/** @type {number} */ (it.efectoGrupo[0]) > 0 ? ctx.niveles[1] : ctx.niveles[0]} a igual puntaje` : '';
    return `${it.tipo === 'mixto' ? 'uniforme y no uniforme' : it.tipo}${favor}`;
}

/**
 * La tabla de los parámetros.
 * @param {ResultadoTRI} R
 * @param {ContextoTRI} ctx
 */
export function tablaParametros(R, ctx) {
    if (R.modelo === 'rasch') {
        const de = /** @type {{ valor: number, ee: number }} */ (R.deRasgo);
        return {
            titulo: `Parámetros del ${NOMBRE_MODELO.rasch} (${ctx.escala})`, cabecera: ['Ítem', 'b', 'EE'],
            filas: R.items.map((it, j) => [/** @type {string} */ (ctx.items[j]), fx(/** @type {number} */ (it.b[0])), fx(/** @type {number} */ (it.eeB[0]), 3)]),
            nota: `b: la dificultad en logits (la escala del rasgo, de media 0 y DE ${fx(de.valor)}, EE = ${fx(de.ee, 3)}): el nivel del rasgo con un 50 % de acertar o estar de acuerdo. Errores típicos por el producto cruzado de los gradientes.`
        };
    }
    let Kmax = 2;
    for (const k of R.K) if (k > Kmax) Kmax = k;
    const umbrales = Array.from({ length: Kmax - 1 }, (_, k) => (Kmax > 2 ? `b${k + 1}` : 'b'));
    return {
        titulo: `Parámetros del ${NOMBRE_MODELO[R.modelo]} (${ctx.escala})`,
        cabecera: ['Ítem', 'a (EE)', ...umbrales.map(b => `${b} (EE)`), 'Discriminación'],
        filas: R.items.map((it, j) => [/** @type {string} */ (ctx.items[j]), `${fx(it.a)} (${fx(it.eeA)})`, ...umbrales.map((_, k) => (k < it.b.length ? `${fx(/** @type {number} */ (it.b[k]))} (${fx(/** @type {number} */ (it.eeB[k]))})` : '—')), bandaDiscriminacion(it.a)]),
        nota: `a: la discriminación; ${R.modelo === 'grm' ? 'b1, b2…: los umbrales (el nivel del rasgo con un 50 % de responder por encima de cada categoría)' : 'b: la dificultad (el nivel del rasgo con un 50 % de acertar o estar de acuerdo)'}, en la escala del rasgo (media 0, DE 1). Errores típicos por el producto cruzado de los gradientes; discriminación según Baker (2001), en la métrica logística.`
    };
}

/**
 * La tabla del ajuste.
 * @param {ResultadoTRI} R
 */
export function tablaAjuste(R) {
    return {
        titulo: 'Ajuste y fiabilidad', cabecera: ['N', 'Ítems', 'Parámetros', '−2LL', 'AIC', 'BIC', 'Fiabilidad marginal', 'Iteraciones'],
        filas: [[String(R.n), String(R.J), String(R.parametros), fx(R.menos2LL), fx(R.aic), fx(R.bic), sinCero(R.fiabilidadMarginal, 3), `${R.iteraciones}${R.convergio ? '' : ' (sin converger)'}`]],
        nota: 'Máxima verosimilitud marginal con el algoritmo EM (61 puntos de cuadratura de −6 a 6). La fiabilidad marginal, la empírica: la varianza de las EAP entre ella más la media de sus varianzas posteriores. AIC y BIC sirven para comparar modelos con los mismos datos (menor, mejor).'
    };
}

/**
 * La tabla del DIF.
 * @param {ResultadoDIF} D
 * @param {ContextoTRI} ctx
 */
export function tablaDIF(D, ctx) {
    const gl = D.G - 1;
    return {
        titulo: `Funcionamiento diferencial de los ítems según ${ctx.grupo}`,
        cabecera: ['Ítem', 'n', `χ²(${2 * gl}) total`, 'p', 'p de Holm', `χ²(${gl}) uniforme`, `χ²(${gl}) no uniforme`, 'ΔR²', 'DIF'],
        filas: D.items.map(it => {
            const nombre = /** @type {string} */ (ctx.items[it.item]);
            if (!it.valido) return [nombre, String(it.n), '—', '—', '—', '—', '—', '—', `no calculable (${it.motivo})`];
            return [nombre, String(it.n), fx(it.chi2Total), pTabla(it.pTotal, ctx.alfa), pTabla(it.pHolm, ctx.alfa), fx(it.chi2Uniforme), fx(it.chi2NoUniforme), sinCero(it.deltaR2, 3), `${it.clasificacion} (${CLASE_DIF[it.clasificacion]})${it.convergio ? '' : ' *'}`];
        }),
        nota: `Regresión logística ${D.items.some(it => it.K > 2) ? 'ordinal ' : ''}con el puntaje total como criterio (N = ${D.n}: ${ctx.niveles.map((g, k) => `${g}, n = ${D.tamanos[k]}`).join('; ')}): total, M3 frente a M1; uniforme, M2 frente a M1; no uniforme, M3 frente a M2. ΔR²: el de Nagelkerke (1991) de M1 a M3. p de Holm (1979): la del DIF total, ajustada entre los ítems.${D.excluidos.length ? ` ${D.excluidos.length === 1 ? 'Un grupo' : `${D.excluidos.length} grupos`} con menos de 10 personas, fuera del análisis.` : ''} DIF según Jodoin y Gierl (2001): A, insignificante (no significativo tras Holm o ΔR² < .035); B, moderado (de .035 a .070); C, grande (desde .070).${D.items.some(it => it.valido && !it.convergio) ? ' *: alguna regresión no convergió (casi separación: una categoría que un grupo nunca elige); su χ² es aproximada.' : ''}`
    };
}

/**
 * El párrafo APA 7.
 * @param {ResultadoTRI} R
 * @param {ContextoTRI} ctx
 * @param {ResultadoDIF | null} D
 */
export function redactarTRI(R, ctx, D) {
    let s = `Se estimó ${CON_CITA[R.modelo]} para los ${R.J} ítems de ${ctx.escala} (N = ${R.n}${ctx.excluidos ? `; se excluyeron ${ctx.excluidos} casos sin ninguna respuesta` : ''}) por máxima verosimilitud marginal con el algoritmo EM (Bock y Aitkin, 1981).`;
    if (R.modelo === 'rasch') {
        const bs = R.items.map(it => /** @type {number} */ (it.b[0]));
        s += ` Las dificultades fueron de ${fx(Math.min(...bs))} a ${fx(Math.max(...bs))} logits, con una DE del rasgo de ${fx(/** @type {{ valor: number }} */ (R.deRasgo).valor)}.`;
    } else {
        const as = R.items.map(it => it.a), bs = R.items.flatMap(it => it.b);
        // las bandas en plural, con «de … a …» si son dos («de bajas a altas»; antes, «baja a alta»)
        const plural = (/** @type {string} */ b) => b.split(' ').map(p => (p === 'o' || p === 'muy' ? p : `${p}s`)).join(' ');
        const bandas = [...new Set([bandaDiscriminacion(Math.min(...as)), bandaDiscriminacion(Math.max(...as))])].map(plural);
        s += ` Las discriminaciones fueron de ${fx(Math.min(...as))} a ${fx(Math.max(...as))} (${bandas.length === 2 ? `de ${bandas[0]} a ${bandas[1]}` : bandas[0]}, según Baker, 2001) y ${R.modelo === 'grm' ? 'los umbrales' : 'las dificultades'}, de ${fx(Math.min(...bs))} a ${fx(Math.max(...bs))}.`;
        const bajas = R.items.map((it, j) => (it.a < 0.65 ? /** @type {string} */ (ctx.items[j]) : null)).filter(x => x !== null);
        if (bajas.length) s += ` ${bajas.length === 1 ? 'El ítem' : 'Los ítems'} ${listaY(/** @type {string[]} */ (bajas))} ${bajas.length === 1 ? 'discrimina' : 'discriminan'} poco (a < 0.65).`;
    }
    s += ` La fiabilidad marginal fue de ${sinCero(R.fiabilidadMarginal, 3)}${R.convergio ? '' : ', aunque el algoritmo no convergió del todo'}; las puntuaciones del rasgo de cada persona se estimaron por EAP, la media de su distribución a posteriori (Embretson y Reise, 2000).`;
    if (D) {
        const con = /** @type {ItemDIFValido[]} */ (D.items.filter(it => it.valido && it.pHolm < ctx.alfa));
        s += ` El funcionamiento diferencial según ${ctx.grupo} se evaluó por regresión logística${D.items.some(it => it.K > 2) ? ' ordinal (McCullagh, 1980)' : ''} con el puntaje total como criterio (Swaminathan y Rogers, 1990; Zumbo, 1999), con el ΔR² de Nagelkerke (1991) como tamaño y las p ajustadas por el método de Holm (1979): `;
        if (!con.length) s += 'ningún ítem mostró DIF significativo.';
        else {
            s += `${con.length === 1 ? 'mostró DIF el ítem' : 'mostraron DIF los ítems'} ${listaY(con.map(it => `${ctx.items[it.item]} (${queDIF(it, ctx)}; ΔR² = ${sinCero(it.deltaR2, 3)}, ${CLASE_DIF[it.clasificacion]})`))}`;
            s += con.every(it => it.clasificacion === 'A') ? `, aunque de tamaño insignificante según los criterios de Jodoin y Gierl (2001).` : `, con el tamaño según los criterios de Jodoin y Gierl (2001).`;
        }
    }
    return s;
}

/** Las referencias. @param {ResultadoTRI} R @param {ResultadoDIF | null} D */
export function referenciasTRI(R, D) {
    const claves = ['bock1981', R.modelo === 'rasch' ? 'rasch1960' : R.modelo === '2pl' ? 'birnbaum1968' : 'samejima1969', 'embretson2000'];
    if (R.modelo !== 'rasch') claves.push('baker2001');
    if (D) claves.push('swaminathan1990', 'zumbo1999', 'jodoin2001', 'holm1979', 'nagelkerke1991', ...(D.items.some(it => it.K > 2) ? ['mccullagh1980'] : []));
    return referenciasDe(claves);
}

/**
 * El CSV de las puntuaciones (en el orden de las filas de la base; los casos sin respuestas, vacíos).
 * @param {ResultadoTRI} R
 * @param {number[]} filas el número de fila (desde 0) de cada persona del ajuste
 * @param {number} total las filas de la base
 */
export function csvPuntuaciones(R, filas, total) {
    /** @type {(number | null)[]} */ const theta = new Array(total).fill(null), ee = new Array(total).fill(null);
    filas.forEach((f, i) => { theta[f] = Number(/** @type {number} */ (R.eap[i]).toFixed(4)); ee[f] = Number(/** @type {number} */ (R.dePosterior[i]).toFixed(4)); });
    return ['Fila;Theta_EAP;EE', ...theta.map((t, f) => `${f + 1};${celdaCSVEs(t)};${celdaCSVEs(ee[f])}`)].join('\r\n') + '\r\n';
}

/**
 * El documento de Word.
 * @param {ResultadoTRI} R
 * @param {ContextoTRI} ctx
 * @param {ResultadoDIF | null} D
 * @param {{ url: string, w: number, h: number } | null} png la curva de información
 */
export function documentoWordTRI(R, ctx, D, png) {
    let cuerpo = tituloWord(`Teoría de respuesta al ítem: ${ctx.escala}`) + parrafoWord(redactarTRI(R, ctx, D)), n = 0;
    cuerpo += tablaWord({ numero: ++n, ...tablaParametros(R, ctx) }) + tablaWord({ numero: ++n, ...tablaAjuste(R) });
    if (D) cuerpo += tablaWord({ numero: ++n, ...tablaDIF(D, ctx) });
    cuerpo += figuraWord({ numero: 1, titulo: `Función de información del test (${ctx.escala})`, png, nota: 'El error típico de medida en cada nivel del rasgo es 1/√I(θ).' });
    return documentoWord(`Teoría de respuesta al ítem: ${ctx.escala}`, cuerpo + referenciasWord(referenciasTRI(R, D)));
}
