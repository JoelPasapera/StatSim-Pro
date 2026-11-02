// @ts-check
// analizador/multinivel/multinivel-redaccion.js — (2027.01.19) lo que se escribe de un modelo multinivel de intercepto
// aleatorio: la tabla de los efectos fijos (b, EE, gl de Satterthwaite, t, p, IC), la de los componentes de la varianza y el
// ajuste del modelo nulo y del modelo con los predictores (σ²u, σ²e, CCI, la reducción proporcional de cada varianza, los R²
// de Nakagawa y Schielzeth, −2LL por ML), la redacción APA 7 y el Word. Sin DOM.
// (2027.01.20, revisión) Los grupos que pide Maas y Hox (2005): más de 50 (con 50 o menos, los errores típicos de nivel 2 se
// subestiman; los 30 de antes no eran suyos); el singular cuando es uno («se excluyó 1», «No se asoció»); «no ajustó
// significativamente mejor» (no «igual»); Satterthwaite (1946) citado, y Nakagawa y Schielzeth, siempre (la tabla da los R²).
import { numeroConMenos, pConSigno } from '../../shared/formato-numero.js';
import { referenciasDe } from '../informe/referencias-apa.js';
import { tituloWord, parrafoWord, tablaWord, referenciasWord, documentoWord } from '../informe/word-apa.js';

/** @typedef {import('../../core/stats/multinivel.js').ResultadoMultinivel} ResultadoMultinivel */
/** @typedef {'ninguno' | 'gran-media' | 'grupo'} Centrado */
/**
 * @typedef {{ nombre: string, columna: string, centrado: Centrado, nivel: 1 | 2, mediaDeGrupo?: boolean }} Predictor
 *   mediaDeGrupo: la media de grupo de un predictor de nivel 1 (su efecto entre grupos)
 * @typedef {{ y: string, grupo: string, predictores: Predictor[], excluidos: number, alfa: number, nivel: number }} ContextoMultinivel
 * @typedef {{ nulo: ResultadoMultinivel, completo: ResultadoMultinivel | null, comparacion: { chi2: number, gl: number, pValor: number } | null }} AjusteMultinivel
 */

/** El efecto de diseño desde el que ignorar el anidamiento sesga los errores típicos (Muthén y Satorra, 1995). */
export const DEFF_CRITICO = 2;
/** Los grupos hasta los que los errores típicos de nivel 2 se subestiman (Maas y Hox, 2005): con 50 o menos. */
export const GRUPOS_RECOMENDADOS = 50;

/** @param {number} v @param {number} [d] */
const fx = (v, d = 2) => numeroConMenos(v, d);
/** Sin el cero inicial (las proporciones). @param {number} v @param {number} [d] */
const sinCero = (v, d = 3) => fx(v, d).replace(/^(−?)0\./, '$1.');
/** Los gl (enteros si lo son). @param {number} gl */
const fgl = gl => (Math.abs(gl - Math.round(gl)) < 1e-9 ? String(Math.round(gl)) : fx(gl, 1));
/** El nombre de un predictor con su centrado. @param {Predictor} p */
export const nombrePredictor = p => `${p.nombre}${p.mediaDeGrupo ? ' (media del grupo)' : p.centrado === 'grupo' ? ' (centrado en el grupo)' : p.centrado === 'gran-media' ? ' (centrado en la gran media)' : ''}`;
/** La reducción proporcional de una varianza (Raudenbush y Bryk, 2002): (nulo − completo)/nulo. @param {number} nulo @param {number} completo */
export const reduccion = (nulo, completo) => (nulo > 0 ? (nulo - completo) / nulo : NaN);

/**
 * La tabla de los efectos fijos del modelo con los predictores.
 * @param {ResultadoMultinivel} M
 * @param {ContextoMultinivel} ctx
 */
export function tablaEfectosFijos(M, ctx) {
    const niv = `IC ${Math.round(100 * ctx.nivel)} %`;
    return {
        titulo: `Efectos fijos del modelo multinivel de ${ctx.y}`, cabecera: ['Predictor', 'b', 'EE', 'gl', 't', 'p', niv],
        filas: M.coeficientes.map((c, k) => [k === 0 ? 'Constante' : nombrePredictor(/** @type {Predictor} */ (ctx.predictores[k - 1])), fx(c.b), fx(c.ee), fgl(c.gl), fx(c.t), pConSigno(c.pValor, { alfa: ctx.alfa }).replace(/^= /, ''), `[${fx(c.inferior)}, ${fx(c.superior)}]`]),
        nota: `Estimación por máxima verosimilitud restringida (REML), con ${ctx.grupo} como agrupación (${M.G} grupos, N = ${M.n}). ${M.satterthwaite ? 'Los gl, de Satterthwaite (los de lmerTest y de SPSS MIXED).' : 'Sin varianza entre grupos (σ²u = 0), los gl son los del modelo lineal.'}`
    };
}

/**
 * La tabla de los componentes de la varianza y del ajuste.
 * @param {AjusteMultinivel} A
 * @param {ContextoMultinivel} ctx
 */
export function tablaVarianzas(A, ctx) {
    const { nulo: N, completo: C } = A, dos = !!C;
    const fila = (/** @type {string} */ que, /** @type {(m: ResultadoMultinivel) => string} */ f) => [que, f(N), ...(C ? [f(C)] : [])];
    const filas = [
        fila('Varianza entre grupos (σ²u)', m => fx(m.s2u, 3)), fila('Varianza dentro de los grupos (σ²e)', m => fx(m.s2e, 3)),
        fila('Correlación intraclase (CCI)', m => sinCero(m.icc)), fila('Efecto de diseño', m => fx(m.efectoDiseno)),
        fila('σ²u = 0: razón de verosimilitudes', m => `${fx(m.lrt)} (p ${pConSigno(m.pLrt, { alfa: ctx.alfa })})`),
        ...(C ? [['Reducción de σ²e (nivel 1)', '—', sinCero(reduccion(N.s2e, C.s2e))], ['Reducción de σ²u (nivel 2)', '—', Number.isFinite(reduccion(N.s2u, C.s2u)) ? sinCero(reduccion(N.s2u, C.s2u)) : '—']] : []),
        fila('R² marginal (efectos fijos)', m => sinCero(m.r2Marginal)), fila('R² condicional (fijos y grupos)', m => sinCero(m.r2Condicional)),
        fila('−2LL (ML)', m => fx(-2 * m.ml)), fila('Parámetros', m => String(m.p + 2))
    ];
    return {
        titulo: 'Componentes de la varianza y ajuste', cabecera: ['', 'Modelo nulo', ...(dos ? ['Modelo con predictores'] : [])], filas,
        nota: `${dos ? 'En el modelo con predictores, la CCI y el efecto de diseño son los residuales (los que quedan tras los predictores). ' : ''}La razón de verosimilitudes de σ²u = 0, con la mezcla ½χ²(0) + ½χ²(1) (Self y Liang, 1987). La reducción de cada varianza, la de Raudenbush y Bryk (2002); los R², los de Nakagawa y Schielzeth (2013). −2LL por máxima verosimilitud (ML), la que compara modelos con distintos efectos fijos${A.comparacion ? `: χ²(${A.comparacion.gl}) = ${fx(A.comparacion.chi2)}, p ${pConSigno(A.comparacion.pValor, { alfa: ctx.alfa })}` : ''}.`
    };
}

/**
 * El párrafo APA 7.
 * @param {AjusteMultinivel} A
 * @param {ContextoMultinivel} ctx
 */
export function redactarMultinivel(A, ctx) {
    const { nulo: N, completo: C } = A, a = ctx.alfa;
    let menor = Infinity, mayor = 0;
    for (const t of N.tamanos) { if (t < menor) menor = t; if (t > mayor) mayor = t; }
    let s = `Se estimó un modelo multinivel de intercepto aleatorio con las ${N.n} personas${ctx.excluidos ? ` con datos completos (${ctx.excluidos === 1 ? 'se excluyó 1' : `se excluyeron ${ctx.excluidos}`})` : ''} anidadas en ${N.G} grupos de ${ctx.grupo} (de ${menor} a ${mayor} personas; media de ${fx(N.mediaTamano, 1)}), por máxima verosimilitud restringida (Raudenbush y Bryk, 2002; Snijders y Bosker, 2012).`;
    s += ` En el modelo nulo, la correlación intraclase de ${ctx.y} fue de ${sinCero(N.icc)}: el ${fx(100 * N.icc, 1)} % de su varianza está entre los grupos`;
    s += N.lrt > 0 ? `, una varianza ${N.pLrt < a ? 'significativa' : 'no significativa'} (razón de verosimilitudes = ${fx(N.lrt)}, p ${pConSigno(N.pLrt, { alfa: a })}, con la mezcla de χ² de Self y Liang, 1987)` : ', sin varianza estimable entre ellos';
    s += `, con un efecto de diseño de ${fx(N.efectoDiseno)} (Kish, 1965)${N.efectoDiseno > DEFF_CRITICO ? `, mayor que ${DEFF_CRITICO}: ignorar el anidamiento sesgaría los errores típicos (Muthén y Satorra, 1995)` : `, menor que ${DEFF_CRITICO} (Muthén y Satorra, 1995)`}.`;
    if (C) {
        const cent = ctx.predictores.filter(p => p.nivel === 1 && p.centrado !== 'ninguno' && !p.mediaDeGrupo);
        if (cent.length) s += ` Los predictores de nivel 1 se centraron ${cent.every(p => p.centrado === 'grupo') ? 'en la media de su grupo' : cent.every(p => p.centrado === 'gran-media') ? 'en la gran media' : 'en la media de su grupo o en la gran media'} (Enders y Tofighi, 2007).`;
        const sig = C.coeficientes.slice(1).map((c, k) => ({ c, p: /** @type {Predictor} */ (ctx.predictores[k]) }));
        const frase = (/** @type {{ c: ResultadoMultinivel['coeficientes'][number], p: Predictor }} */ { c, p }) => `${nombrePredictor(p)}, b = ${fx(c.b)}, EE = ${fx(c.ee)}, t(${fgl(c.gl)}) = ${fx(c.t)}, p ${pConSigno(c.pValor, { alfa: a })}, IC ${Math.round(100 * ctx.nivel)} % [${fx(c.inferior)}, ${fx(c.superior)}]`;
        const si = sig.filter(x => x.c.pValor < a), no = sig.filter(x => !(x.c.pValor < a));
        if (si.length) s += ` ${si.length === 1 ? 'Se asoció' : 'Se asociaron'} con ${ctx.y}: ${si.map(frase).join('; ')}.`;
        if (no.length) s += ` ${si.length ? (no.length === 1 ? 'No se asoció' : 'No se asociaron') : no.length === 1 ? 'El predictor no se asoció' : 'Ningún predictor se asoció'} de forma significativa${si.length ? ': ' : ' ('}${no.map(x => `${nombrePredictor(x.p)}, p ${pConSigno(x.c.pValor, { alfa: a })}`).join('; ')}${si.length ? '' : ')'}.`;
        if (C.satterthwaite) s += ' Los grados de libertad son los de Satterthwaite (1946), como en lmerTest (Kuznetsova et al., 2017).';
        s += ` Los efectos fijos explicaron el ${fx(100 * C.r2Marginal, 1)} % de la varianza (R² marginal) y, con los grupos, el ${fx(100 * C.r2Condicional, 1)} % (R² condicional; Nakagawa y Schielzeth, 2013)`;
        s += A.comparacion ? `; el modelo con los predictores ${A.comparacion.pValor < a ? 'ajustó mejor' : 'no ajustó significativamente mejor'} que el nulo, χ²(${A.comparacion.gl}) = ${fx(A.comparacion.chi2)}, p ${pConSigno(A.comparacion.pValor, { alfa: a })}.` : '.';
    }
    if (N.G <= GRUPOS_RECOMENDADOS) s += ` Con ${N.G} grupos (${GRUPOS_RECOMENDADOS} o menos), los errores típicos de nivel 2 pueden estar subestimados (Maas y Hox, 2005).`;
    return s;
}

/** Las referencias. @param {AjusteMultinivel} A @param {ContextoMultinivel} ctx */
export function referenciasMultinivel(A, ctx) {
    const claves = ['raudenbush2002', 'snijders2012', 'self1987', 'kish1965', 'muthen1995', 'nakagawa2013'];
    if (A.completo) {
        if (A.completo.satterthwaite) claves.push('kuznetsova2017', 'satterthwaite1946');
        if (ctx.predictores.some(p => p.nivel === 1 && p.centrado !== 'ninguno')) claves.push('enders2007');
    }
    if (A.nulo.G <= GRUPOS_RECOMENDADOS) claves.push('maas2005');
    return referenciasDe(claves);
}

/**
 * El documento de Word.
 * @param {AjusteMultinivel} A
 * @param {ContextoMultinivel} ctx
 */
export function documentoWordMultinivel(A, ctx) {
    let cuerpo = tituloWord(`Modelo multinivel: ${ctx.y} en ${ctx.grupo}`) + parrafoWord(redactarMultinivel(A, ctx)), n = 0;
    if (A.completo) cuerpo += tablaWord({ numero: ++n, ...tablaEfectosFijos(A.completo, ctx) });
    cuerpo += tablaWord({ numero: ++n, ...tablaVarianzas(A, ctx) });
    return documentoWord(`Modelo multinivel: ${ctx.y}`, cuerpo + referenciasWord(referenciasMultinivel(A, ctx)));
}

