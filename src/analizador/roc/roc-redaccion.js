// @ts-check
// analizador/roc/roc-redaccion.js — (2027.01.18) lo que se escribe de una curva ROC: el área bajo la curva con su intervalo
// de DeLong y la prueba frente al azar, el punto de corte óptimo (Youden) con la sensibilidad, la especificidad y los valores
// predictivos con sus intervalos de Wilson, la tabla de los puntos de corte, la redacción APA 7, el CSV de todos los cortes y
// el Word. Sin DOM.
import { numeroConMenos, pConSigno } from '../../shared/formato-numero.js';
import { referenciasDe } from '../informe/referencias-apa.js';
import { tituloWord, parrafoWord, tablaWord, figuraWord, referenciasWord, documentoWord } from '../informe/word-apa.js';
import { discriminacionAUC } from '../motor/magnitudes.js';
import { celdaCSVEs } from '../../shared/csv.js';

/** @typedef {NonNullable<ReturnType<typeof import('../../core/stats/roc.js').curvaROC>>} ResultadoROC */
/** @typedef {{ puntuacion: string, criterio: string, positivo: string, negativo: string, excluidos: number, alfa: number }} ContextoROC */

/** Las filas de la tabla de cortes: hasta este número (si hay más, se eligen repartidas, con el óptimo siempre). */
export const MAX_CORTES = 25;

/** @param {number} v @param {number} [d] */
const fx = (v, d = 2) => numeroConMenos(v, d);
/** Una proporción sin el cero inicial (APA). @param {number} v @param {number} [d] */
const prop = (v, d = 2) => (Number.isFinite(v) ? fx(v, d).replace(/^0\./, '.') : '—');
/** Un intervalo de proporciones. @param {[number, number]} c */
const ic = c => `[${prop(c[0])}, ${prop(c[1])}]`;
/** Un número de corte (entero tal cual; si no, con dos decimales). @param {number} c */
const fc = c => (Number.isInteger(c) ? String(c) : fx(c, 2));
/** La regla del corte («≥ 25»; con el sentido invertido, «≤ 14»). @param {ResultadoROC} R @param {number} c */
export const regla = (R, c) => `${R.sentido === 'mayor' ? '≥' : '≤'} ${fc(c)}`;
/** Una razón de verosimilitud. @param {number} v */
const rv = v => (Number.isFinite(v) ? fx(v, 2) : '∞');

/**
 * La tabla del área bajo la curva.
 * @param {ResultadoROC} R
 * @param {ContextoROC} ctx
 */
export function tablaAUC(R, ctx) {
    return {
        titulo: `Área bajo la curva ROC de ${ctx.puntuacion}`,
        cabecera: ['AUC', 'EE', `IC ${Math.round(100 * R.nivel)} %`, 'U', 'z', 'p', 'Discriminación'],
        filas: [[prop(R.auc, 3), fx(R.ee, 3), `[${prop(R.inferior, 3)}, ${prop(R.superior, 3)}]`, fx(R.mannWhitney.U, 1), fx(Math.abs(R.mannWhitney.z), 2), pConSigno(R.mannWhitney.pValor, { alfa: ctx.alfa }).replace(/^= /, ''), discriminacionAUC(R.auc)]],
        nota: `Casos: ${ctx.criterio} = ${ctx.positivo} (n = ${R.n1}); no casos: ${ctx.negativo} (n = ${R.n0}). EE e IC de DeLong et al. (1988); la p, de la U de Mann-Whitney (el AUC es U/(n₁n₀), la probabilidad de que un caso puntúe más que un no caso: Hanley y McNeil, 1982; AUC = .5, discriminación al azar). Discriminación según Hosmer et al. (2013). ${R.sentido === 'mayor' ? 'Las puntuaciones altas indican el caso.' : 'Las puntuaciones bajas indican el caso.'}${R.invertido ? ' (El sentido se eligió automáticamente: con el contrario, el AUC quedaba por debajo de .5.)' : ''}`
    };
}

/**
 * La tabla del punto de corte óptimo.
 * @param {ResultadoROC} R
 * @param {ContextoROC} ctx
 */
export function tablaOptimo(R, ctx) {
    const o = R.optimo;
    return {
        titulo: 'Punto de corte óptimo (índice de Youden)',
        cabecera: ['Corte', 'Sensibilidad', 'Especificidad', 'J', 'VPP', 'VPN', 'RV+', 'RV−'],
        filas: [[regla(R, o.corte), `${prop(o.sensibilidad)} ${ic(o.icSensibilidad)}`, `${prop(o.especificidad)} ${ic(o.icEspecificidad)}`, prop(o.youden), `${prop(o.vpp)} ${ic(o.icVpp)}`, `${prop(o.vpn)} ${ic(o.icVpn)}`, rv(o.rvPositiva), rv(o.rvNegativa)]],
        nota: `Positivo: ${ctx.puntuacion} ${regla(R, o.corte)}. Entre corchetes, los IC del ${Math.round(100 * R.nivel)} % de Wilson. VPP y VPN con la prevalencia de la muestra (${fx(100 * R.prevalencia, 1)} %): con otra prevalencia cambian. RV: razones de verosimilitud. ${o.vp} verdaderos positivos, ${o.fn} falsos negativos, ${o.fp} falsos positivos y ${o.vn} verdaderos negativos.`
    };
}

/**
 * Los cortes que se muestran: todos si son pocos; si no, repartidos (y el óptimo).
 * @param {ResultadoROC} R
 */
export function cortesMostrados(R) {
    if (R.cortes.length <= MAX_CORTES) return R.cortes;
    const paso = (R.cortes.length - 1) / (MAX_CORTES - 1), elegidos = new Set(Array.from({ length: MAX_CORTES }, (_, i) => Math.round(i * paso)));
    elegidos.add(R.cortes.findIndex(k => k.corte === R.optimo.corte));
    return [...elegidos].sort((a, b) => a - b).map(i => /** @type {ResultadoROC['cortes'][number]} */ (R.cortes[i]));
}

/**
 * La tabla de los puntos de corte.
 * @param {ResultadoROC} R
 * @param {ContextoROC} ctx
 */
export function tablaCortes(R, ctx) {
    const mostrados = cortesMostrados(R);
    return {
        titulo: 'Sensibilidad y especificidad de cada punto de corte',
        cabecera: ['Corte', 'Sensibilidad', 'Especificidad', 'J', 'VPP', 'VPN'],
        filas: mostrados.map(k => [regla(R, k.corte) + (k.corte === R.optimo.corte ? ' (óptimo)' : ''), prop(k.sensibilidad), prop(k.especificidad), prop(k.youden), prop(k.vpp), prop(k.vpn)]),
        nota: `${mostrados.length < R.cortes.length ? `${mostrados.length} de los ${R.cortes.length} cortes posibles, repartidos (el CSV los trae todos). ` : ''}Positivo: ${ctx.puntuacion} ${R.sentido === 'mayor' ? 'mayor o igual que' : 'menor o igual que'} el corte.`
    };
}

/**
 * El párrafo APA 7.
 * @param {ResultadoROC} R
 * @param {ContextoROC} ctx
 */
export function redactarROC(R, ctx) {
    const o = R.optimo, d = discriminacionAUC(R.auc), significativa = R.mannWhitney.pValor < ctx.alfa;
    // (2027.01.20, revisión) con el sentido forzado y un área por debajo de .5, la puntuación clasifica al revés: antes decía
    // «mayor que la del azar» con AUC = .047 y proponía un corte con J = .00
    if (alReves(R)) {
        return `Se evaluó la validez de criterio de ${ctx.puntuacion} para identificar ${ctx.criterio} = ${ctx.positivo} (n = ${R.n1}) frente a ${ctx.negativo} (n = ${R.n0}) con una curva ROC${ctx.excluidos ? ` (${ctx.excluidos === 1 ? 'un caso sin puntuación o sin criterio quedó fuera' : `${ctx.excluidos} casos sin puntuación o sin criterio quedaron fuera`})` : ''}, tomando las puntuaciones ${R.sentido === 'mayor' ? 'altas' : 'bajas'} como indicio del caso. El área bajo la curva fue de ${prop(R.auc, 3)}, IC ${Math.round(100 * R.nivel)} % [${prop(R.inferior, 3)}, ${prop(R.superior, 3)}] (DeLong et al., 1988), por debajo de .5: en ese sentido, ${ctx.puntuacion} clasifica peor que el azar${significativa ? ` (U = ${fx(R.mannWhitney.U, 1)}, z = ${fx(Math.abs(R.mannWhitney.z), 2)}, p ${pConSigno(R.mannWhitney.pValor, { alfa: ctx.alfa })})` : ''}, y en el contrario el área sería de ${prop(1 - R.auc, 3)}. El sentido elegido parece invertido; con él, ningún punto de corte es recomendable.`;
    }
    let s = `Se evaluó la validez de criterio de ${ctx.puntuacion} para identificar ${ctx.criterio} = ${ctx.positivo} (n = ${R.n1}) frente a ${ctx.negativo} (n = ${R.n0}) con una curva ROC${ctx.excluidos ? ` (${ctx.excluidos === 1 ? 'un caso sin puntuación o sin criterio quedó fuera' : `${ctx.excluidos} casos sin puntuación o sin criterio quedaron fuera`})` : ''}. El área bajo la curva fue de ${prop(R.auc, 3)}, IC ${Math.round(100 * R.nivel)} % [${prop(R.inferior, 3)}, ${prop(R.superior, 3)}] (DeLong et al., 1988), ${significativa ? 'mayor que la del azar' : 'sin diferir de la del azar'} (U = ${fx(R.mannWhitney.U, 1)}, z = ${fx(Math.abs(R.mannWhitney.z), 2)}, p ${pConSigno(R.mannWhitney.pValor, { alfa: ctx.alfa })}): una discriminación ${d} (Hosmer et al., 2013).`;
    if (!significativa) return `${s} Con esa discriminación, ningún punto de corte es recomendable.`;
    s += ` El punto de corte óptimo según el índice de Youden (1950) fue ${regla(R, o.corte)} (J = ${prop(o.youden)}), con una sensibilidad de ${prop(o.sensibilidad)}, IC ${Math.round(100 * R.nivel)} % ${ic(o.icSensibilidad)}, y una especificidad de ${prop(o.especificidad)}, IC ${Math.round(100 * R.nivel)} % ${ic(o.icEspecificidad)} (Wilson, 1927); con la prevalencia de la muestra (${fx(100 * R.prevalencia, 1)} %), el valor predictivo positivo fue de ${prop(o.vpp)} y el negativo, de ${prop(o.vpn)}.`;
    return s;
}

/** ¿Clasifica al revés? (un área por debajo de .5 con el sentido elegido a mano) @param {ResultadoROC} R */
export const alReves = R => R.auc < 0.5;

/** Las referencias (las del texto y las de las notas de las tablas). @param {ResultadoROC} R @param {ContextoROC} ctx */
export function referenciasROC(R, ctx) {
    return referenciasDe(['delong1988', 'hanley1982', 'hosmer2013', ...(R.mannWhitney.pValor < ctx.alfa && !alReves(R) ? ['youden1950', 'wilson1927'] : [])]);
}

/**
 * El CSV de todos los cortes (punto y coma, coma decimal).
 * @param {ResultadoROC} R
 * @param {ContextoROC} ctx
 */
export function csvROC(R, ctx) {
    const cab = ['Corte', 'Regla', 'VP', 'FN', 'FP', 'VN', 'Sensibilidad', 'Especificidad', 'Youden', 'VPP', 'VPN', 'RV+', 'RV-'].join(';');
    const filas = R.cortes.map(k => [k.corte, `${ctx.puntuacion} ${regla(R, k.corte)}`, k.vp, k.fn, k.fp, k.vn, k.sensibilidad, k.especificidad, k.youden, k.vpp, k.vpn, k.rvPositiva, k.rvNegativa].map(celdaCSVEs).join(';'));
    return [cab, ...filas].join('\r\n') + '\r\n';
}

/**
 * El documento de Word.
 * @param {ResultadoROC} R
 * @param {ContextoROC} ctx
 * @param {{ url: string, w: number, h: number } | null} png la curva
 */
export function documentoWordROC(R, ctx, png) {
    let cuerpo = tituloWord(`Validez de criterio de ${ctx.puntuacion}: curva ROC`) + parrafoWord(redactarROC(R, ctx));
    let n = 0;
    cuerpo += tablaWord({ numero: ++n, ...tablaAUC(R, ctx) }) + (alReves(R) ? '' : tablaWord({ numero: ++n, ...tablaOptimo(R, ctx) })) + tablaWord({ numero: ++n, ...tablaCortes(R, ctx) });
    cuerpo += figuraWord({ numero: 1, titulo: `Curva ROC de ${ctx.puntuacion} para identificar ${ctx.criterio} = ${ctx.positivo}`, png, nota: `AUC = ${prop(R.auc, 3)}. La diagonal discontinua es la discriminación al azar${alReves(R) ? '; la curva queda por debajo: en este sentido, la puntuación clasifica al revés' : `; el punto, el corte óptimo (${regla(R, R.optimo.corte)})`}.` });
    return documentoWord(`Validez de criterio de ${ctx.puntuacion}`, cuerpo + referenciasWord(referenciasROC(R, ctx)));
}
