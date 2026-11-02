// @ts-check
// analizador/perdidos/perdidos-redaccion.js — (2027.01.18) lo que se escribe de los datos perdidos: los perdidos por variable
// (con las medias de los casos disponibles y las del EM), los patrones de pérdida, la prueba MCAR de Little, la recomendación
// (eliminar casos solo si son pocos y compatibles con MCAR; si no, imputación múltiple o FIML), la redacción APA 7, las
// estimaciones combinadas de la imputación múltiple (medias y correlaciones con las reglas de Rubin), las bases imputadas
// apiladas (CSV y .sav, con la variable Imputation_ de SPSS) y el Word. Sin DOM.
import { numeroConMenos, pConSigno } from '../../shared/formato-numero.js';
import { referenciasDe } from '../informe/referencias-apa.js';
import { tituloWord, subtituloWord, parrafoWord, tablaWord, referenciasWord, documentoWord } from '../informe/word-apa.js';
import { listaY } from '../../shared/texto-es.js';
import { celdaCSVEs as celda } from '../../shared/csv.js';
import { esPerdido, aNumero } from '../../core/data/celdas.js';

/**
 * @typedef {{ variables: string[], P: ReturnType<typeof import('../../core/stats/perdidos.js').patronesPerdidos>,
 *   disponibles: { n: number, media: number, de: number }[], em: ReturnType<typeof import('../../core/stats/perdidos.js').emNormal>,
 *   little: ReturnType<typeof import('../../core/stats/perdidos.js').pruebaMcarLittle> }} DiagnosticoPerdidos
 *   variables: los nombres (etiquetas) de las columnas, en su orden
 * @typedef {{ descripcion: string, alfa: number }} ContextoPerdidos
 * @typedef {{ metodo: 'pmm' | 'norm', m: number, iteraciones: number, donantes: number, semilla: number, imputadas: number[],
 *   medias: ReturnType<typeof import('../../core/stats/imputacion.js').mediaCombinada>[],
 *   correlaciones: (ReturnType<typeof import('../../core/stats/imputacion.js').correlacionCombinada> | null)[][] | null }} ResultadoImputacion
 *   correlaciones: la matriz de las combinadas (null en la diagonal), solo con 12 variables o menos
 */

/** Las correlaciones combinadas se muestran hasta con estas variables (más no caben en una tabla legible). */
export const MAX_MATRIZ = 12;

/** @param {number} v @param {number} [d] */
const fx = (v, d = 2) => numeroConMenos(v, d);
/** Un porcentaje con un decimal. @param {number} parte @param {number} total */
const pct = (parte, total) => (total ? (100 * parte / total).toFixed(1) : '0.0');
/** Un coeficiente sin el cero inicial (APA: los que no pasan de 1). @param {number} v @param {number} [d] */
const sinCero = (v, d = 2) => fx(v, d).replace(/^(−?)0\./, '$1.');

/** El total de celdas y el porcentaje que falta. @param {DiagnosticoPerdidos} D */
export function porcentajePerdido(D) { return 100 * D.P.celdasPerdidas / Math.max(1, D.P.n * D.P.k); }

/** La prueba de Little en el texto. @param {NonNullable<DiagnosticoPerdidos['little']>} L @param {number} alfa */
export const textoLittle = (L, alfa) => `χ²(${L.gl}) = ${fx(L.chi2)}, p ${pConSigno(L.pValor, { alfa })}`;

/**
 * Qué hacer con los perdidos: nada si no hay; eliminar los casos si son pocos (5 % o menos de los casos) y la prueba de
 * Little no rechaza MCAR (Schafer y Graham, 2002; Enders, 2022); si no, imputación múltiple (o FIML).
 * @param {DiagnosticoPerdidos} D
 * @param {number} alfa
 * @returns {{ clave: 'sinPerdidos' | 'lista' | 'imputar', texto: string }}
 */
export function recomendacion(D, alfa) {
    const P = D.P, incompletos = P.n - P.completos;
    if (!P.celdasPerdidas) return { clave: 'sinPerdidos', texto: 'No falta ningún valor en estas variables: no hay perdidos que tratar.' };
    const pocos = incompletos / P.n <= 0.05, mcar = !!D.little && D.little.pValor >= alfa, cuantos = `${incompletos} ${incompletos === 1 ? 'caso' : 'casos'}, el ${pct(incompletos, P.n)} %`;
    const conviene = 'Conviene la imputación múltiple (o la máxima verosimilitud con información completa, FIML, en un SEM), válidas si los datos faltan al azar (MAR; Schafer y Graham, 2002; Enders, 2022).';
    if (pocos && mcar) return { clave: 'lista', texto: `Faltan pocos casos (${cuantos}) y la prueba de Little no rechaza que falten completamente al azar: eliminarlos apenas sesga los resultados (Schafer y Graham, 2002; Enders, 2022). Aun así, la imputación múltiple no pierde ningún caso.` };
    if (pocos) return { clave: 'imputar', texto: `Faltan pocos casos (${cuantos}), pero ${D.little ? 'la prueba de Little rechaza que falten completamente al azar' : 'sin la prueba de Little no se sabe si faltan completamente al azar'}: eliminarlos podría sesgar los resultados. ${conviene}` };
    if (mcar) return { clave: 'imputar', texto: `Faltan ${cuantos}; la prueba de Little no rechaza que falten completamente al azar (lo que no lo prueba), pero eliminarlos reduce la muestra y la potencia. ${conviene}` };
    return { clave: 'imputar', texto: `Faltan ${cuantos}${D.little ? ' y la prueba de Little rechaza que falten completamente al azar' : ''}: eliminarlos reduce la muestra y puede sesgar los resultados. ${conviene}` };
}

/**
 * La tabla de los perdidos por variable.
 * @param {DiagnosticoPerdidos} D
 */
export function tablaPorVariable(D) {
    const P = D.P, em = D.em;
    return {
        titulo: 'Valores perdidos por variable',
        cabecera: ['Variable', 'n válido', 'Perdidos', '%', 'M (casos disponibles)', 'M (EM)', 'DE (EM)'],
        filas: D.variables.map((v, j) => {
            const d = /** @type {{ n: number, media: number, de: number }} */ (D.disponibles[j]), perdidos = /** @type {number} */ (P.perdidosPorVariable[j]);
            return [v, String(d.n), String(perdidos), pct(perdidos, P.n), fx(d.media), em ? fx(/** @type {number} */ (em.medias[j])) : '—', em ? fx(Math.sqrt(/** @type {number} */ (/** @type {number[]} */ (em.cov[j])[j]))) : '—'];
        }),
        nota: `N = ${P.n}; faltan ${P.celdasPerdidas} de ${P.n * P.k} valores (${porcentajePerdido(D).toFixed(1)} %); casos completos: ${P.completos} (${pct(P.completos, P.n)} %)${P.vacios ? `; ${P.vacios} caso(s) sin ningún valor quedan fuera del EM` : ''}. M (casos disponibles): la media de los valores observados de cada variable. EM: las estimaciones de máxima verosimilitud de la normal multivariante con todos los casos${em ? ` (${em.iteraciones} iteraciones${em.convergio ? '' : ', sin converger del todo'})` : ''}; la DE, la de máxima verosimilitud (entre n).`
    };
}

/**
 * La tabla de los patrones de pérdida (los `maximo` más frecuentes; el resto, juntos).
 * @param {DiagnosticoPerdidos} D
 * @param {number} [maximo]
 */
export function tablaPatrones(D, maximo = 10) {
    const P = D.P;
    const describir = (/** @type {boolean[]} */ o) => {
        const faltan = D.variables.filter((_, j) => !o[j]);
        if (!faltan.length) return 'Completo (ningún perdido)';
        if (faltan.length === D.variables.length) return 'Sin ningún valor';
        return `Faltan ${faltan.length === 1 ? '' : `${faltan.length}: `}${faltan.length > 5 ? `${faltan.slice(0, 5).join(', ')} y ${faltan.length - 5} más` : listaY(faltan)}`;
    };
    const filas = P.patrones.slice(0, maximo).map(p => [describir(p.observado), String(p.n), pct(p.n, P.n)]);
    const resto = P.patrones.slice(maximo);
    if (resto.length) { const n = resto.reduce((s, p) => s + p.n, 0); filas.push([`Otros ${resto.length} patrones`, String(n), pct(n, P.n)]); }
    return { titulo: 'Patrones de valores perdidos', cabecera: ['Patrón', 'Casos', '%'], filas, nota: `${P.patrones.length} patrones distintos, del más frecuente al menos frecuente.` };
}

/**
 * El párrafo APA 7 del diagnóstico.
 * @param {DiagnosticoPerdidos} D
 * @param {ContextoPerdidos} ctx
 */
export function redactarPerdidos(D, ctx) {
    const P = D.P;
    let s = `Se examinaron los valores perdidos de ${P.k === 1 ? '1 variable' : `${P.k} variables`} (${ctx.descripcion}) en ${P.n} casos.`;
    if (!P.celdasPerdidas) return `${s} No faltaba ningún valor.`;
    const porc = P.perdidosPorVariable.map(v => 100 * v / P.n), max = Math.max(...porc), min = Math.min(...porc);
    const peores = D.variables.filter((_, j) => porc[j] === max);
    s += ` Faltaba el ${porcentajePerdido(D).toFixed(1)} % de los valores; ${P.completos} casos (${pct(P.completos, P.n)} %) estaban completos, con ${P.patrones.length} patrones de pérdida distintos${P.k > 1 ? `, y el porcentaje de perdidos por variable fue del ${min.toFixed(1)} % al ${max.toFixed(1)} % (el más alto, en ${peores.length > 3 ? `${peores.slice(0, 3).join(', ')} y ${peores.length - 3} más` : listaY(peores)})` : ''}.`;
    if (D.little) {
        const mcar = D.little.pValor >= ctx.alfa;
        s += ` La prueba MCAR de Little (1988) ${mcar ? 'no fue significativa' : 'fue significativa'}, ${textoLittle(D.little, ctx.alfa)}, lo que ${mcar ? 'es compatible con que los datos falten completamente al azar (sin probarlo)' : 'indica que los datos no faltan completamente al azar'}.`;
    }
    if (D.em) s += ` Las medias y las covarianzas se estimaron por máxima verosimilitud con el algoritmo EM (Dempster et al., 1977), que usa todos los casos y es válido si los datos faltan al azar (MAR; Enders, 2022).`;
    return s;
}

/**
 * La tabla de las medias combinadas.
 * @param {ResultadoImputacion} MI
 * @param {DiagnosticoPerdidos} D
 */
export function tablaMediasCombinadas(MI, D) {
    return {
        titulo: `Medias combinadas de las ${MI.m} imputaciones`,
        cabecera: ['Variable', 'M', 'EE', 'IC 95 %', 'DE media', 'FMI'],
        filas: D.variables.map((v, j) => { const r = /** @type {ResultadoImputacion['medias'][number]} */ (MI.medias[j]); return [v, fx(r.estimacion), fx(r.ee, 3), `[${fx(r.inferior)}, ${fx(r.superior)}]`, fx(r.de), sinCero(r.fmi, 3)]; }),
        nota: `Reglas de Rubin (1987): la media de las ${MI.m} estimaciones y su error típico con la varianza dentro y entre imputaciones; IC con los grados de libertad de Barnard y Rubin (1999). DE media: el promedio de las DE de las imputaciones. FMI: la fracción de información perdida por los perdidos (0 en una variable sin perdidos).`
    };
}

/**
 * La tabla de las correlaciones combinadas (triángulo inferior), o null si no hay o son demasiadas variables.
 * @param {ResultadoImputacion} MI
 * @param {DiagnosticoPerdidos} D
 * @param {number} alfa
 */
export function tablaCorrelacionesCombinadas(MI, D, alfa) {
    const C = MI.correlaciones;
    if (!C || D.variables.length < 2) return null;
    const k = D.variables.length;
    return {
        titulo: `Correlaciones de Pearson combinadas de las ${MI.m} imputaciones`,
        cabecera: ['Variable', ...D.variables.map((_, j) => String(j + 1))],
        filas: D.variables.map((v, a) => [`${a + 1}. ${v}`, ...Array.from({ length: k }, (_, b) => {
            if (b === a) return '—';
            if (b > a) return '';
            const c = /** @type {NonNullable<ReturnType<typeof import('../../core/stats/imputacion.js').correlacionCombinada>>} */ (/** @type {any[]} */ (C[a])[b]);
            return `${sinCero(c.r)}${c.pValor < 0.01 ? '**' : c.pValor < alfa ? '*' : ''}`;
        })]),
        nota: `Cada correlación, combinada en la escala z de Fisher con las reglas de Rubin (1987), con sus grados de libertad (la z no tiene los de los datos completos que corrigen Barnard y Rubin, 1999). * p < ${String(alfa).replace(/^0/, '')}; ** p < .01 (bilateral).`
    };
}

/** El nombre del método en el texto. @param {ResultadoImputacion} MI */
const nombreMetodo = MI => (MI.metodo === 'pmm' ? `emparejamiento predictivo de medias (PMM, ${MI.donantes} donantes; van Buuren y Groothuis-Oudshoorn, 2011)` : 'regresión lineal bayesiana (norm; van Buuren y Groothuis-Oudshoorn, 2011)');

/**
 * El párrafo APA 7 de la imputación.
 * @param {ResultadoImputacion} MI
 */
export function redactarImputacion(MI) {
    const fmis = MI.imputadas.map(j => /** @type {ResultadoImputacion['medias'][number]} */ (MI.medias[j]).fmi);
    const rango = fmis.length ? (fmis.length === 1 ? `fue de ${sinCero(/** @type {number} */ (fmis[0]))}` : `osciló entre ${sinCero(Math.min(...fmis))} y ${sinCero(Math.max(...fmis))}`) : '';
    return `Los valores perdidos se imputaron por ecuaciones encadenadas con ${nombreMetodo(MI)}, con todas las variables como predictoras: ${MI.m} imputaciones de ${MI.iteraciones} iteraciones cada una (semilla ${MI.semilla}). Las estimaciones se combinaron con las reglas de Rubin (1987): las medias, con los grados de libertad de Barnard y Rubin (1999), y las correlaciones, en la escala z de Fisher, con los de Rubin${rango ? `; la fracción de información perdida de las medias ${rango}` : ''}.`;
}

/** Las referencias. @param {DiagnosticoPerdidos} D @param {ResultadoImputacion | null} MI */
export function referenciasPerdidos(D, MI) {
    // (2027.01.20, revisión) las que cita la recomendación (si falta algo) y la del EM
    const claves = D.P.celdasPerdidas ? ['enders2022', 'schafer2002'] : [];
    if (D.em) claves.push('enders2022');
    if (D.little) claves.push('little1988');
    if (D.em) claves.push('dempster1977');
    if (MI) claves.push('vanbuuren2011', 'rubin1987', 'barnard1999');
    return referenciasDe(claves);
}


/** @typedef {{ columna: string, items: string[], modo: 'suma' | 'media' }} PuntajePasivo */

/**
 * (2027.01.20, revisión) Los puntajes que se recalculan en cada base imputada (la imputación pasiva): las columnas que no se
 * imputaron y que, en todas las filas (al menos 5) con ellas y los ítems de una escala completos, valen exactamente la suma o la
 * media de esos ítems, si alguno se imputó. Así se reconocen el Total_, la Dimension_ y el General_ del Simulador, y los que
 * la persona calculó con otro nombre. Hasta la 2027.01.19, las bases imputadas los copiaban de la original: vacíos (o viejos)
 * donde faltaba un ítem, y distintos de la suma de sus ítems ya imputados.
 * @param {Record<string, unknown>[]} filas
 * @param {string[]} imputadas
 * @param {{ items: string[] }[]} escalas
 * @returns {PuntajePasivo[]}
 */
export function puntajesPasivos(filas, imputadas, escalas) {
    const conImputadas = new Set(imputadas), todas = filas.length ? Object.keys(/** @type {Record<string, unknown>} */ (filas[0])) : [];
    /** @type {PuntajePasivo[]} */ const salida = [];
    const usadas = new Set();
    for (const e of escalas) {
        if (e.items.length < 2 || !e.items.some(it => conImputadas.has(it))) continue;
        const propios = new Set(e.items);
        for (const c of todas) {
            if (conImputadas.has(c) || propios.has(c) || usadas.has(c)) continue;
            let filasCompletas = 0, suma = true, mediaOk = true;
            for (const f of filas) {
                const v = aNumero(f[c]);
                if (!Number.isFinite(v)) continue;
                let s = 0, completa = true;
                for (const it of e.items) { const x = aNumero(f[it]); if (!Number.isFinite(x)) { completa = false; break; } s += x; }
                if (!completa) continue;
                filasCompletas++;
                const tol = 1e-9 * Math.max(1, Math.abs(v));
                if (Math.abs(v - s) > tol) suma = false;
                if (Math.abs(v - s / e.items.length) > tol) mediaOk = false;
                if (!suma && !mediaOk) break;
            }
            if (filasCompletas >= 5 && (suma || mediaOk)) { salida.push({ columna: c, items: [...e.items], modo: suma ? 'suma' : 'media' }); usadas.add(c); }
        }
    }
    return salida;
}

/**
 * Las bases apiladas: la original (Imputation_ = 0) y cada imputación (1 … m), con las variables imputadas reemplazadas y
 * las demás columnas como estaban, salvo los puntajes pasivos, que se recalculan desde sus ítems (donde estén todos; si no,
 * como estaban). Es la forma que SPSS reconoce como imputación múltiple (y que mice::as.mids lee en R).
 * @param {Record<string, unknown>[]} filas
 * @param {string[]} columnas las columnas imputadas (las del análisis, en el orden de las imputaciones)
 * @param {{ columnas: ArrayLike<number>[] }[]} imputaciones
 * @param {PuntajePasivo[]} [pasivos]
 * @returns {{ nombres: string[], filas: unknown[][] }}
 */
export function basesApiladas(filas, columnas, imputaciones, pasivos = []) {
    const todas = filas.length ? Object.keys(/** @type {Record<string, unknown>} */ (filas[0])) : [];
    const indice = new Map(columnas.map((c, j) => [c, j])), pasivo = new Map(pasivos.map(p => [p.columna, p]));
    /** @type {unknown[][]} */ const salida = [];
    filas.forEach(f => salida.push([0, ...todas.map(c => f[c])]));
    imputaciones.forEach((I, l) => filas.forEach((f, i) => {
        const valor = (/** @type {string} */ c) => { const j = indice.get(c); return j === undefined ? f[c] : /** @type {ArrayLike<number>} */ (I.columnas[j])[i]; };
        salida.push([l + 1, ...todas.map(c => {
            const p = pasivo.get(c);
            if (!p) return valor(c);
            let s = 0;
            for (const it of p.items) { const x = aNumero(valor(it)); if (!Number.isFinite(x)) return f[c]; s += x; }
            return p.modo === 'suma' ? s : s / p.items.length;
        })]);
    }));
    return { nombres: ['Imputation_', ...todas], filas: salida };
}

/** El CSV de las bases apiladas. @param {{ nombres: string[], filas: unknown[][] }} B */
export function csvApiladas(B) {
    return [B.nombres.map(celda).join(';'), ...B.filas.map(f => f.map(celda).join(';'))].join('\r\n') + '\r\n';
}

/**
 * La base apilada para el escritor de .sav: numérica la columna con todos sus valores números; texto, la que no.
 * @param {{ nombres: string[], filas: unknown[][] }} B
 * @param {(c: string) => string} etiquetaDe
 * @returns {import('../../core/data/sav/escritor.js').BaseSav}
 */
export function baseSavApiladas(B, etiquetaDe) {
    return {
        n: B.filas.length,
        etiquetaArchivo: 'StatSim Pro — imputación múltiple (Imputation_ = 0: la base original)',
        variables: B.nombres.map((nombre, c) => {
            const valores = B.filas.map(f => f[c]);
            const numerica = valores.every(v => esPerdido(v) || Number.isFinite(aNumero(v)));
            return numerica
                ? { nombre, etiqueta: c === 0 ? 'Número de imputación (0 = original)' : etiquetaDe(nombre), valores: valores.map(v => (esPerdido(v) ? NaN : aNumero(v))), medida: c === 0 ? /** @type {'nominal'} */ ('nominal') : undefined }
                : { nombre, etiqueta: etiquetaDe(nombre), tipo: /** @type {'texto'} */ ('texto'), valores: valores.map(v => (esPerdido(v) ? '' : String(v))) };
        })
    };
}

/**
 * El documento de Word.
 * @param {DiagnosticoPerdidos} D
 * @param {ContextoPerdidos} ctx
 * @param {ResultadoImputacion | null} MI
 */
export function documentoWordPerdidos(D, ctx, MI) {
    let cuerpo = tituloWord('Análisis de los datos perdidos') + parrafoWord(redactarPerdidos(D, ctx)), n = 0;
    if (MI) cuerpo += parrafoWord(redactarImputacion(MI));
    cuerpo += tablaWord({ numero: ++n, ...tablaPorVariable(D) }) + tablaWord({ numero: ++n, ...tablaPatrones(D) });
    if (D.little) cuerpo += subtituloWord('Prueba MCAR de Little') + parrafoWord(`${textoLittle(D.little, ctx.alfa)} (${D.little.patrones} patrones con algún valor). ${D.little.pValor >= ctx.alfa ? 'No se rechaza' : 'Se rechaza'} que los datos falten completamente al azar (α = ${String(ctx.alfa).replace(/^0/, '')}).`);
    cuerpo += subtituloWord('Recomendación') + parrafoWord(recomendacion(D, ctx.alfa).texto);
    if (MI) {
        cuerpo += tablaWord({ numero: ++n, ...tablaMediasCombinadas(MI, D) });
        const t = tablaCorrelacionesCombinadas(MI, D, ctx.alfa);
        if (t) cuerpo += tablaWord({ numero: ++n, ...t });
    }
    return documentoWord('Análisis de los datos perdidos', cuerpo + referenciasWord(referenciasPerdidos(D, MI)));
}
