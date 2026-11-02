// @ts-check
// analizador/relaciones/mediacion-redaccion.js — (2027.01.17) lo que se escribe de una mediación o una moderación (modelos de
// PROCESS): las tablas de cada ecuación, la de los efectos (condicionales, directos, totales e indirectos con su intervalo
// bootstrap), la región de Johnson-Neyman, la redacción APA 7, las referencias y el documento de Word. Sin DOM.
// (2027.01.20, revisión) La redacción de la mediación en paralelo juzga por separado los indirectos específicos y el total (decía
// «el indirecto total, IC [0.022, 0.135], que incluye el 0» porque miraba solo los específicos) y escribe «predijo» solo si el
// camino es significativo («Estrés predijo a Rumiación (a = 0.013, p = .878)»); R² y ΔR², sin el cero inicial; un límite de
// intervalo que redondea a cero, con sus cifras («−0.00041», no «0.000»); «e» ante /i/, «del camino», «Zhao et al.», y las
// referencias, solo las citadas.
import { formatoP, pConSigno, numeroConMenos, limiteIntervalo } from '../../shared/formato-numero.js';
import { referenciasDe } from '../informe/referencias-apa.js';
import { tituloWord, subtituloWord, parrafoWord, tablaWord, figuraWord, referenciasWord, documentoWord } from '../informe/word-apa.js';
import { listaY, conjuncionY } from '../../shared/texto-es.js';
import { caminosEnSerie, MODELOS } from './mediacion.js';

/** @typedef {{ x: string, y: string, m: string[], w: string | null, covariables: string[], excluidos: number, alfa: number }} ContextoMediacion */
/** @typedef {{ titulo: string, cabecera: string[], filas: string[][], nota: string }} Tabla */

/** @param {number} v @param {number} [d] */
const fx = (v, d = 3) => numeroConMenos(v, d);
/** Una proporción (R², ΔR²), sin el cero inicial. @param {number} v */
const sinCero = v => fx(v).replace(/^(−?)0\./, '$1.');
/** Un intervalo «[a, b]». @param {number} a @param {number} b */
const ic = (a, b) => (Number.isFinite(a) && Number.isFinite(b) ? `[${limiteIntervalo(a)}, ${limiteIntervalo(b)}]` : '—');
/** ¿Excluye el 0 un intervalo? @param {{ inferior: number, superior: number }} e */
const excluyeCero = e => e.inferior > 0 || e.superior < 0;
/** @param {number} a */
const alfaTxt = a => String(a).replace(/^0\./, '.');

/**
 * El nombre de cada término del modelo, con las etiquetas de las variables.
 * @param {ContextoMediacion} ctx
 * @param {string} t
 */
export function nombreTermino(ctx, t) {
    if (t === 'constante') return 'Constante';
    if (t === 'X') return ctx.x;
    if (t === 'W') return /** @type {string} */ (ctx.w);
    if (t === 'X·W') return `${ctx.x} × ${ctx.w}`;
    if (t === 'M·W') return `${ctx.m[0]} × ${ctx.w}`;
    if (t === 'Y' || t === 'Y (total)') return t === 'Y' ? ctx.y : `${ctx.y} (efecto total)`;
    const m = /^M(\d+)$/.exec(t);
    if (m) return /** @type {string} */ (ctx.m[Number(m[1]) - 1]);
    const c = /^C(\d+)$/.exec(t);
    return c ? /** @type {string} */ (ctx.covariables[Number(c[1]) - 1]) : t;
}

/** El nombre de un efecto bootstrap. @param {ContextoMediacion} ctx @param {string} clave @param {any} R */
function nombreEfecto(ctx, clave, R) {
    if (clave === 'ind_total') return 'Indirecto total';
    if (clave === 'std_total') return 'Indirecto total, completamente estandarizado';
    if (clave === 'indice') return 'Índice de mediación moderada';
    const cond = /^cond_(\d+)$/.exec(clave);
    if (cond) return `Indirecto condicional, ${ctx.w} = ${fx(R.valoresW[Number(cond[1])], 2)}`;
    const con = /^contraste_M(\d+)_M(\d+)$/.exec(clave);
    if (con) return `Contraste: por ${ctx.m[Number(con[1]) - 1]} − por ${ctx.m[Number(con[2]) - 1]}`;
    const ind = /^(ind|std)_(.+)$/.exec(clave);
    if (ind) {
        const ruta = /** @type {string} */ (ind[2]).split('_').map(t => nombreTermino(ctx, t)).join(' → ');
        return `Indirecto por ${ruta}${ind[1] === 'std' ? ', completamente estandarizado' : ''}`;
    }
    return clave;
}

/**
 * Las tablas de las ecuaciones (una por dependiente).
 * @param {any} R
 * @param {ContextoMediacion} ctx
 * @returns {Tabla[]}
 */
export function tablasEcuaciones(R, ctx) {
    const niv = `${Math.round(100 * R.nivel)} %`;
    return R.ecuaciones.map((/** @type {any} */ e) => ({
        titulo: `Modelo de regresión para ${nombreTermino(ctx, e.dependiente)}`,
        cabecera: ['Predictor', 'b', 'EE', 't', 'p', `IC ${niv}`],
        filas: e.predictores.map((/** @type {string} */ p, /** @type {number} */ i) => [nombreTermino(ctx, p), fx(e.beta[i]), fx(e.ee[i]), numeroConMenos(e.t[i], 2), formatoP(e.pValores[i], { alfa: ctx.alfa }), ic(e.ic[i][0], e.ic[i][1])]),
        nota: `R² = ${sinCero(e.r2)}, F(${e.gl1}, ${e.gl2}) = ${numeroConMenos(e.F, 2)}, p ${pConSigno(e.pF, { alfa: ctx.alfa })}. Coeficientes no estandarizados (b), por mínimos cuadrados.${R.centrado && e.predictores.some((/** @type {string} */ p) => p.includes('·')) ? ' Las variables del producto, centradas en su media (Aiken y West, 1991): el coeficiente de cada una es su efecto en la media de la otra.' : ''}`
    }));
}

/**
 * La tabla de los efectos del modelo.
 * @param {any} R
 * @param {ContextoMediacion} ctx
 * @returns {Tabla}
 */
export function tablaEfectos(R, ctx) {
    const niv = `${Math.round(100 * R.nivel)} %`;
    if (R.modelo === 1) return {
        titulo: `Efecto condicional de ${ctx.x} sobre ${ctx.y} en valores de ${ctx.w}`,
        cabecera: [String(ctx.w), 'Efecto', 'EE', 't', 'p', `IC ${niv}`],
        filas: R.condicionales.map((/** @type {any} */ c) => [fx(c.w, 2), fx(c.efecto), fx(c.ee), numeroConMenos(c.t, 2), formatoP(c.pValor, { alfa: ctx.alfa }), ic(c.ic[0], c.ic[1])]),
        nota: `Los valores de ${ctx.w}: ${R.valoresW.length === 2 ? 'sus dos valores (dicotómica)' : 'sus percentiles 16, 50 y 84 (los de PROCESS)'}. Error típico por la matriz de covarianzas de los coeficientes. ${textoJohnsonNeyman(R, ctx)}`
    };
    const B = R.bootstrap, fila = (/** @type {string} */ nombre, /** @type {any} */ e) => [nombre, fx(e.estimado), fx(e.ee), '—', ic(e.inferior, e.superior)];
    /** @type {string[][]} */ const filas = [];
    const ecY = R.ecuaciones.find((/** @type {any} */ e) => e.dependiente === 'Y'), ecT = R.ecuaciones.find((/** @type {any} */ e) => e.dependiente === 'Y (total)');
    if (ecT) filas.push(['Total (c)', fx(ecT.beta[1]), fx(ecT.ee[1]), formatoP(ecT.pValores[1], { alfa: ctx.alfa }), ic(ecT.ic[1][0], ecT.ic[1][1])]);
    filas.push(['Directo (c′)', fx(ecY.beta[1]), fx(ecY.ee[1]), formatoP(ecY.pValores[1], { alfa: ctx.alfa }), ic(ecY.ic[1][0], ecY.ic[1][1])]);
    for (const [clave, e] of Object.entries(B.efectos)) filas.push(fila(nombreEfecto(ctx, clave, R), e));
    return {
        titulo: R.modelo === 7 || R.modelo === 14 ? `Efecto directo, efectos indirectos condicionales e índice de mediación moderada de ${ctx.x} sobre ${ctx.y}` : `Efectos total, directo e indirectos de ${ctx.x} sobre ${ctx.y}`,
        cabecera: ['Efecto', 'Estimación', 'EE', 'p', `IC ${niv}`],
        filas,
        nota: `Los efectos total y directo, con su inferencia por mínimos cuadrados. Los indirectos (productos de caminos), con el error típico y el intervalo percentil de un bootstrap de casos (B = ${B.B.toLocaleString('es')}, semilla ${B.semilla}; Efron y Tibshirani, 1993): un intervalo que no incluye el 0 indica un efecto distinto de 0 (no se informa p). Completamente estandarizado: el indirecto en DE de ${ctx.y} por DE de ${ctx.x}.${R.modelo === 7 || R.modelo === 14 ? ` Los valores de ${ctx.w}: ${R.valoresW.length === 2 ? 'sus dos valores' : 'sus percentiles 16, 50 y 84'}. El índice de mediación moderada (Hayes, 2015) es la pendiente del indirecto según ${ctx.w}: si su intervalo excluye el 0, el efecto indirecto depende de ${ctx.w}.` : ''}${R.sobel ? ` Como referencia, la z de Sobel (1982), que supone normal el producto: ${R.sobel.map((/** @type {any} */ s, /** @type {number} */ j) => `por ${ctx.m[j]}, z = ${numeroConMenos(s.z, 2)}, p ${pConSigno(s.pValor, { alfa: ctx.alfa })}`).join('; ')}.` : ''}${B.invalidas ? ` ${B.invalidas} remuestra(s) no se pudieron estimar (colinealidad) y no cuentan.` : ''}`
    };
}

/**
 * La región de Johnson-Neyman en una frase.
 * @param {any} R
 * @param {ContextoMediacion} ctx
 */
export function textoJohnsonNeyman(R, ctx) {
    const J = R.johnsonNeyman;
    if (!J || R.valoresW.length === 2) return '';
    const sig = J.tramos.filter((/** @type {any} */ t) => t.significativo);
    if (!sig.length) return `Región de Johnson-Neyman (Johnson y Neyman, 1936): el efecto de ${ctx.x} no es significativo en ningún valor observado de ${ctx.w} (de ${fx(J.minimo, 2)} a ${fx(J.maximo, 2)}).`;
    if (sig.length === J.tramos.length) return `Región de Johnson-Neyman (Johnson y Neyman, 1936): el efecto de ${ctx.x} es significativo en todo el recorrido observado de ${ctx.w} (de ${fx(J.minimo, 2)} a ${fx(J.maximo, 2)}).`;
    const partes = sig.map((/** @type {any} */ t) => (t.desde === J.minimo ? `${ctx.w} ≤ ${fx(t.hasta, 2)}` : t.hasta === J.maximo ? `${ctx.w} ≥ ${fx(t.desde, 2)}` : `${ctx.w} entre ${fx(t.desde, 2)} y ${fx(t.hasta, 2)}`) + ` (${t.signo > 0 ? 'positivo' : 'negativo'})`);
    return `Región de Johnson-Neyman (Johnson y Neyman, 1936): el efecto de ${ctx.x} es significativo cuando ${partes.join(' o cuando ')}.`;
}

/**
 * El coeficiente de un predictor en una ecuación: su texto («a1 = 0.241, p = .001») y si es significativo.
 * @param {any} R
 * @param {string} dep
 * @param {string} pred
 * @param {string} sim
 * @param {number} alfa
 * @returns {{ texto: string, sig: boolean }}
 */
function coeficiente(R, dep, pred, sim, alfa) {
    const e = R.ecuaciones.find((/** @type {any} */ q) => q.dependiente === dep), i = e.predictores.indexOf(pred);
    return { texto: `${sim} = ${fx(e.beta[i])}, p ${pConSigno(e.pValores[i], { alfa })}`, sig: e.pValores[i] < alfa };
}

/** @typedef {{ nombre: string, texto: string, sig: boolean }} Camino */

/**
 * Los caminos a de una mediación, con el verbo de cada uno según su p: «X predijo a A y B (…) y no predijo
 * significativamente a C (…)».
 * @param {string} x
 * @param {Camino[]} caminos
 */
export function fraseCaminosA(x, caminos) {
    const si = caminos.filter(c => c.sig), no = caminos.filter(c => !c.sig);
    const parte = (/** @type {Camino[]} */ cs) => `a ${listaY(cs.map(c => c.nombre))} (${cs.map(c => c.texto).join('; ')})`;
    if (!no.length) return `${x} predijo ${parte(si)}`;
    if (!si.length) return `${x} no predijo significativamente ${parte(no)}`;
    return `${x} predijo ${parte(si)} y no predijo significativamente ${parte(no)}`;
}

/**
 * Los caminos b, controlando X: «controlando X, A predijo a Y (…), y B no predijo significativamente a Y (…)».
 * @param {string} x
 * @param {string} y
 * @param {Camino[]} caminos
 */
export function fraseCaminosB(x, y, caminos) {
    const si = caminos.filter(c => c.sig), no = caminos.filter(c => !c.sig);
    const parte = (/** @type {Camino[]} */ cs, /** @type {boolean} */ sig) => `${listaY(cs.map(c => c.nombre))} ${sig ? '' : 'no '}${cs.length > 1 ? 'predijeron' : 'predijo'}${sig ? '' : ' significativamente'} a ${y} (${cs.map(c => c.texto).join('; ')})`;
    if (!no.length) return `controlando ${x}, ${parte(si, true)}`;
    if (!si.length) return `controlando ${x}, ${parte(no, false)}`;
    return `controlando ${x}, ${parte(si, true)}, ${conjuncionY(/** @type {Camino} */ (no[0]).nombre)} ${parte(no, false)}`;
}

/**
 * Los indirectos de la mediación simple o en paralelo, cada uno juzgado por su propio intervalo: los específicos y el total.
 * @param {any} R
 * @param {ContextoMediacion} ctx
 * @param {(clave: string, sim: string) => string} efTxt
 */
function textoIndirectosParalelo(R, ctx, efTxt) {
    const B = R.bootstrap.efectos, k = ctx.m.length;
    if (k === 1) {
        return `El efecto indirecto fue ${efTxt('ind_M1', 'ab')}: ${excluyeCero(B.ind_M1) ? `el intervalo no incluye el 0, de modo que ${ctx.x} influye en ${ctx.y} a través de ${ctx.m[0]}` : 'el intervalo incluye el 0, así que no hay evidencia de mediación'}.`;
    }
    const especificos = ctx.m.map((m, j) => ({ m, clave: `ind_M${j + 1}`, e: B[`ind_M${j + 1}`] }));
    const si = especificos.filter(c => excluyeCero(c.e)), no = especificos.filter(c => !excluyeCero(c.e));
    let s = `Los efectos indirectos específicos fueron: ${especificos.map((c, j) => `por ${c.m}, ${efTxt(c.clave, `a${j + 1}b${j + 1}`)}`).join('; ')}. `;
    const nombres = (/** @type {typeof especificos} */ cs) => listaY(cs.map(c => c.m));
    if (!no.length) s += `${k === 2 ? 'Los dos intervalos excluyen' : 'Todos los intervalos excluyen'} el 0: ${ctx.x} influye en ${ctx.y} a través de ${nombres(si)}. `;
    else if (!si.length) s += `${k === 2 ? 'Los dos intervalos incluyen' : 'Todos los intervalos incluyen'} el 0: ningún mediador, por separado, transmite el efecto de ${ctx.x}. `;
    else s += `${si.length > 1 ? `Los de ${nombres(si)} excluyen` : `El de ${nombres(si)} excluye`} el 0 (${ctx.x} influye en ${ctx.y} a través de ${nombres(si)}); ${no.length > 1 ? `los de ${nombres(no)} lo incluyen` : `el de ${nombres(no)} lo incluye`}. `;
    const total = excluyeCero(B.ind_total);
    const opuestos = especificos.some(c => c.e.estimado > 0) && especificos.some(c => c.e.estimado < 0);
    s += `El indirecto total fue ${efTxt('ind_total', 'ab')}, ${total
        ? (si.length ? 'también distinto de 0' : `que no incluye el 0: en conjunto, los mediadores transmiten un efecto de ${ctx.x} sobre ${ctx.y} que ninguno muestra por separado`)
        : (si.length ? `que incluye el 0${opuestos ? ': los indirectos específicos, de signo contrario, se compensan' : ''}` : 'que también incluye el 0: no hay evidencia de mediación')}.`;
    return s;
}

/**
 * El párrafo APA 7.
 * @param {any} R
 * @param {ContextoMediacion} ctx
 * @returns {string}
 */
export function redactarMediacion(R, ctx) {
    const a = ctx.alfa, cov = ctx.covariables.length ? `, controlando ${listaY(ctx.covariables)}` : '';
    const coefTxt = (/** @type {string} */ dep, /** @type {string} */ pred, /** @type {string} */ sim) => coeficiente(R, dep, pred, sim, a).texto;
    const intro = `Se aplicó el modelo ${R.modelo} de PROCESS (Hayes, 2022), ${MODELOS[/** @type {1} */ (R.modelo)].nombre.toLowerCase().replace(/ \(modelo \d+\)$/, '')}, por mínimos cuadrados (n = ${R.n}${ctx.excluidos ? `; ${ctx.excluidos} caso${ctx.excluidos === 1 ? '' : 's'} con algún perdido, fuera` : ''})${cov}`;
    if (R.modelo === 1) {
        const I = R.interaccion;
        const sig = I.pValor < a;
        const cond = R.condicionales.map((/** @type {any} */ c) => `${ctx.w} = ${fx(c.w, 2)}: ${fx(c.efecto)}, p ${pConSigno(c.pValor, { alfa: a })}`).join('; ');
        return `${intro}, con ${ctx.x} como predictor, ${ctx.w} como moderador${R.centrado ? ' (las dos, centradas en su media; Aiken y West, 1991)' : ''} ${conjuncionY(ctx.y)} ${ctx.y} como criterio. La interacción ${ctx.x} × ${ctx.w} ${sig ? 'fue estadísticamente significativa' : 'no fue estadísticamente significativa'}, ${coefTxt('Y', 'X·W', 'b₃')}, ΔR² = ${sinCero(I.deltaR2)}, F(1, ${I.gl2}) = ${numeroConMenos(I.F, 2)} (α = ${alfaTxt(a)})${sig ? `: el efecto de ${ctx.x} sobre ${ctx.y} depende de ${ctx.w}` : `: no hay evidencia de que el efecto de ${ctx.x} sobre ${ctx.y} cambie con ${ctx.w}`}. Los efectos condicionales de ${ctx.x} fueron: ${cond}. ${textoJohnsonNeyman(R, ctx)}`.trim();
    }
    const B = R.bootstrap.efectos, niv = `${Math.round(100 * R.nivel)} %`;
    const boot = `con ${R.bootstrap.B.toLocaleString('es')} remuestras bootstrap (intervalos percentil del ${niv}${R.modelo === 4 ? '; Preacher y Hayes, 2008' : ''})`;
    const efTxt = (/** @type {string} */ clave, /** @type {string} */ sim) => { const e = B[clave]; return `${sim} = ${fx(e.estimado)}, IC ${niv} ${ic(e.inferior, e.superior)}`; };
    const directo = `El efecto directo de ${ctx.x} sobre ${ctx.y} ${coeficiente(R, 'Y', 'X', 'c′', a).sig ? 'fue significativo' : 'no fue significativo'}, ${coefTxt('Y', 'X', 'c′')}`;
    if (R.modelo === 4) {
        const k = ctx.m.length, sub = (/** @type {number} */ j) => (k > 1 ? String(j + 1) : '');
        const as = ctx.m.map((m, j) => ({ nombre: m, ...coeficiente(R, `M${j + 1}`, 'X', `a${sub(j)}`, a) }));
        const bs = ctx.m.map((m, j) => ({ nombre: m, ...coeficiente(R, 'Y', `M${j + 1}`, `b${sub(j)}`, a) }));
        let s = `${intro}, ${boot}, para probar si ${listaY(ctx.m)} ${k > 1 ? 'median' : 'media'} la relación entre ${ctx.x} ${conjuncionY(ctx.y)} ${ctx.y}. ${fraseCaminosA(ctx.x, as)}; ${fraseCaminosB(ctx.x, ctx.y, bs)}. `;
        s += `${textoIndirectosParalelo(R, ctx, efTxt)} `;
        s += `${directo}; el efecto total, ${coefTxt('Y (total)', 'X', 'c')}. El indirecto ${k > 1 ? 'total ' : ''}completamente estandarizado fue ${efTxt('std_total', 'ab_cs')}.`;
        const contrastes = Object.keys(B).filter(c => c.startsWith('contraste_') && excluyeCero(B[c]));
        if (k > 1) s += contrastes.length ? ` Los indirectos difieren entre sí en: ${contrastes.map(c => `${nombreEfecto(ctx, c, R).replace('Contraste: ', '')} (${efTxt(c, 'Δ')})`).join('; ')}.` : ' Ningún par de indirectos difirió entre sí (todos los intervalos de los contrastes incluyen el 0).';
        return `${s} Siguiendo a Zhao et al. (2010), la mediación se juzga por el efecto indirecto, no por la significación de los demás caminos.`;
    }
    if (R.modelo === 6) {
        const caminos = caminosEnSerie(ctx.m.length).map(c => `ind_${c.map(j => `M${j + 1}`).join('_')}`);
        const porCamino = caminos.map(c => `${nombreEfecto(ctx, c, R).replace('Indirecto ', '')}: ${efTxt(c, 'ab')}${excluyeCero(B[c]) ? '' : ' (no significativo)'}`).join('; ');
        const serie = caminos[caminos.length - 1] || '';
        return `${intro}, ${boot}, para probar si ${listaY(ctx.m)} median en serie (en ese orden) la relación entre ${ctx.x} ${conjuncionY(ctx.y)} ${ctx.y}. Los efectos indirectos fueron ${porCamino}; el total, ${efTxt('ind_total', 'ab')}. ${excluyeCero(B[serie]) ? `El camino en serie completo es distinto de 0: ${ctx.x} influye en ${ctx.y} a través de ${ctx.m.join(' y luego de ')}.` : 'El camino en serie completo incluye el 0: no hay evidencia de la secuencia completa.'} ${directo}. Siguiendo a Zhao et al. (2010), la mediación se juzga por los efectos indirectos.`;
    }
    // modelos 7 y 14: la mediación moderada
    const etapa = R.modelo === 7 ? `la primera etapa, el camino de ${ctx.x} a ${ctx.m[0]}` : `la segunda etapa, el camino de ${ctx.m[0]} a ${ctx.y}`;
    const ind = B.indice, sigIndice = excluyeCero(ind);
    const conds = R.valoresW.map((/** @type {number} */ w, /** @type {number} */ i) => `${ctx.w} = ${fx(w, 2)}, ${efTxt(`cond_${i}`, 'θ')}`).join('; ');
    const inter = R.interaccion;
    return `${intro}, ${boot}, con ${ctx.m[0]} como mediador ${conjuncionY(/** @type {string} */ (ctx.w))} ${ctx.w} como moderador de ${etapa}${R.centrado ? ' (las variables del producto, centradas en su media; Aiken y West, 1991)' : ''}. La interacción ${nombreTermino(ctx, inter.termino)} ${inter.pValor < a ? 'fue significativa' : 'no fue significativa'}, ${coefTxt(inter.ecuacion, inter.termino, R.modelo === 7 ? 'a₃' : 'b₃')}, ΔR² = ${sinCero(inter.deltaR2)}. El índice de mediación moderada (Hayes, 2015) fue de ${fx(ind.estimado)}, IC ${niv} ${ic(ind.inferior, ind.superior)}: ${sigIndice ? `el efecto indirecto de ${ctx.x} sobre ${ctx.y} a través de ${ctx.m[0]} depende de ${ctx.w}` : `no hay evidencia de que el efecto indirecto dependa de ${ctx.w}`}. Los efectos indirectos condicionales fueron: ${conds}. ${directo}.`;
}

/**
 * Las referencias que cita lo que se informó (la redacción y las notas de las tablas y las figuras).
 * @param {any} R
 */
export function referenciasMediacion(R) {
    const c = ['hayes2022'];
    if (R.modelo !== 1) c.push('efron1993');
    if (R.centrado && (R.modelo === 1 || R.modelo === 7 || R.modelo === 14)) c.push('aiken1991');
    if (R.modelo === 1 && R.johnsonNeyman && R.valoresW.length !== 2) c.push('johnson1936');
    if (R.modelo === 4) c.push('preacher2008', 'zhao2010');
    if (R.modelo === 4 && R.sobel) c.push('sobel1982');
    if (R.modelo === 6) c.push('zhao2010');
    if (R.modelo === 7 || R.modelo === 14) c.push('hayes2015');
    return referenciasDe(c);
}

/**
 * El documento de Word: título, redacción, tablas, figuras y referencias.
 * @param {any} R
 * @param {ContextoMediacion} ctx
 * @param {{ diagrama: { url: string, w: number, h: number } | null, pendientes: { url: string, w: number, h: number } | null }} figuras
 */
export function documentoWordMediacion(R, ctx, figuras) {
    const titulo = R.modelo === 1 ? `Moderación: ${ctx.x}, ${ctx.w} ${conjuncionY(ctx.y)} ${ctx.y}` : `${MODELOS[/** @type {1} */ (R.modelo)].nombre}: ${ctx.x} ${conjuncionY(ctx.y)} ${ctx.y}`;
    let cuerpo = tituloWord(titulo) + parrafoWord(redactarMediacion(R, ctx)), n = 0, f = 0;
    for (const t of tablasEcuaciones(R, ctx)) cuerpo += tablaWord({ numero: ++n, ...t });
    cuerpo += tablaWord({ numero: ++n, ...tablaEfectos(R, ctx) });
    if (figuras.diagrama) cuerpo += subtituloWord('Diagrama de rutas') + figuraWord({ numero: ++f, titulo: `Diagrama de rutas del modelo ${R.modelo}`, png: figuras.diagrama, nota: 'Coeficientes no estandarizados; * p < α.' });
    if (figuras.pendientes) cuerpo += subtituloWord('Pendientes simples') + figuraWord({ numero: ++f, titulo: `${ctx.y} predicha según ${ctx.x} en valores de ${ctx.w}`, png: figuras.pendientes, nota: `Las covariables, en su media. ${textoJohnsonNeyman(R, ctx)}` });
    cuerpo += referenciasWord(referenciasMediacion(R));
    return documentoWord(titulo, cuerpo);
}
