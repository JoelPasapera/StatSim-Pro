// @ts-check
// analizador/depuracion/depuracion-redaccion.js — (2027.01.18) lo que se escribe de la depuración de una base: el resumen
// por criterio (su regla y cuántos casos marca), la lista de los casos marcados con sus motivos, la redacción APA 7 del
// procedimiento (qué se buscó, qué se halló y qué se excluyó), el CSV de los casos, el de la base depurada y el Word. Sin DOM.
import { referenciasDe } from '../informe/referencias-apa.js';
import { tituloWord, parrafoWord, tablaWord, referenciasWord, documentoWord } from '../informe/word-apa.js';
import { listaY } from '../../shared/texto-es.js';
import { celdaCSVEs as celda } from '../../shared/csv.js';
import { aNumero } from '../../core/data/celdas.js';

/** @typedef {import('./deteccion-casos.js').Motivo} Motivo */
/** @typedef {ReturnType<typeof import('./deteccion-casos.js').revisarCasos>} ResultadoDepuracion */
/**
 * @typedef {{ variables: string, k: number, minimo: number | null, maximo: number | null, enteros: boolean, id: string | null,
 *   excluir: Motivo[], fueraDeRango: 'perdido' | 'excluir' | 'nada', umbrales: typeof import('./deteccion-casos.js').UMBRALES,
 *   salvo?: string[] }} ContextoDepuracion
 *   salvo: los nombres (con su etiqueta) de las columnas que no cuentan para los duplicados: el identificador y las que no
 *   repiten ningún valor (sin él, los de la revisión)
 */

/** Las columnas que no cuentan para los duplicados. @param {ResultadoDepuracion} R @param {ContextoDepuracion} ctx */
const salvoDe = (R, ctx) => ctx.salvo || [...(ctx.id ? [ctx.id] : []), ...R.duplicados.delEnvio];
/** Unos nombres en el texto, los tres primeros si son muchos. @param {string[]} nombres */
const algunos = nombres => (nombres.length > 4 ? `${nombres.slice(0, 3).join(', ')} y ${nombres.length - 3} más` : listaY(nombres));
/** Las coincidencias esperables, en el texto. @param {number} e */
const cuantas = e => (e >= 10 ? String(Math.round(e)) : e.toFixed(e < 1 ? 2 : 1));

/** El orden de los criterios en las tablas y el texto. @type {readonly Motivo[]} */
export const ORDEN_MOTIVOS = Object.freeze(['duplicado', 'idRepetido', 'fueraDeRango', 'perdidos', 'longstring', 'sinVariabilidad', 'atipicoUnivariado', 'atipicoMultivariado']);

/** El nombre de cada criterio (tablas y casillas). @type {Readonly<Record<Motivo, string>>} */
export const NOMBRE_MOTIVO = Object.freeze({
    duplicado: 'Caso duplicado', idRepetido: 'Identificador repetido', fueraDeRango: 'Valores fuera de rango', perdidos: 'Demasiadas respuestas en blanco',
    longstring: 'Cadena larga de respuestas iguales', sinVariabilidad: 'La misma respuesta en todo', atipicoUnivariado: 'Atípico univariado', atipicoMultivariado: 'Atípico multivariado'
});

/** Cuántos casos de un criterio, en el texto («3 duplicados»). @type {Readonly<Record<Motivo, (n: number) => string>>} */
const CUENTA = Object.freeze({
    duplicado: n => `${n} ${n === 1 ? 'duplicado' : 'duplicados'}`,
    idRepetido: n => `${n} con el identificador repetido`,
    fueraDeRango: n => `${n} con valores fuera de rango`,
    perdidos: n => `${n} con demasiadas respuestas en blanco`,
    longstring: n => `${n} con una cadena larga de respuestas iguales`,
    sinVariabilidad: n => `${n} con la misma respuesta en todos los ítems`,
    atipicoUnivariado: n => `${n} ${n === 1 ? 'atípico univariado' : 'atípicos univariados'}`,
    atipicoMultivariado: n => `${n} ${n === 1 ? 'atípico multivariado' : 'atípicos multivariados'}`
});

/** Un porcentaje con un decimal. @param {number} parte @param {number} total */
const pct = (parte, total) => (total ? (100 * parte / total).toFixed(1) : '0.0');

/**
 * ¿Se revisó el criterio con estos datos? (el rango, solo con mínimo y máximo; las respuestas descuidadas, con 6 ítems o
 * más; Mahalanobis, si se pudo calcular).
 * @param {Motivo} m
 * @param {ResultadoDepuracion} R
 * @param {ContextoDepuracion} ctx
 * @returns {string | null} null si se revisó; si no, por qué no
 */
export function noRevisado(m, R, ctx) {
    if (m === 'idRepetido' && !ctx.id) return 'sin columna de identificador';
    if (m === 'fueraDeRango' && (ctx.minimo === null || ctx.maximo === null)) return 'sin escala de respuesta indicada';
    if ((m === 'longstring' || m === 'sinVariabilidad') && ctx.k < ctx.umbrales.longstringMinimo) return `hacen falta ${ctx.umbrales.longstringMinimo} o más ítems`;
    if (m === 'atipicoMultivariado' && !R.mahalanobisCalculable) return ctx.k < 2 ? 'hace falta más de una variable' : 'no calculable (pocos casos completos o una variable es combinación de otras)';
    return null;
}

/** La regla de cada criterio, en la tabla. @param {Motivo} m @param {ResultadoDepuracion} R @param {ContextoDepuracion} ctx */
function regla(m, R, ctx) {
    const U = ctx.umbrales;
    switch (m) {
        case 'duplicado': { const salvo = salvoDe(R, ctx); return `Fila idéntica a otra anterior en todas las columnas de la base${salvo.length ? ` salvo ${algunos(salvo)}` : ''}`; }
        case 'idRepetido': return `Valor de ${ctx.id} ya visto en una fila anterior`;
        case 'fueraDeRango': return `Algún valor fuera de ${ctx.minimo}–${ctx.maximo}${ctx.enteros ? ' o no entero' : ''}`;
        case 'perdidos': return `Más del ${Math.round(100 * U.perdidosPorCaso)} % de las variables sin respuesta`;
        case 'longstring': return `${R.longstringUmbral} o más respuestas idénticas seguidas (la mitad de los ítems, y al menos ${U.longstringMinimo})`;
        case 'sinVariabilidad': return `Desviación típica intraindividual nula (al menos ${U.longstringMinimo} ítems respondidos)`;
        case 'atipicoUnivariado': return `|z| > ${U.zUnivariado} en alguna variable`;
        default: return `Distancia de Mahalanobis con p < ${String(U.pMahalanobis).replace(/^0/, '')} (χ² con ${ctx.k} gl)`;
    }
}

/**
 * Los casos que salen de la base depurada: los marcados por un criterio de `excluir` (y, si los fuera de rango se excluyen,
 * esos también).
 * @param {ResultadoDepuracion} R
 * @param {ContextoDepuracion} ctx
 * @returns {Set<number>} los números de fila (desde 1)
 */
export function filasExcluidas(R, ctx) {
    /** @type {Set<Motivo>} */ const criterios = new Set(ctx.excluir.filter(m => m !== 'fueraDeRango'));
    if (ctx.fueraDeRango === 'excluir') criterios.add('fueraDeRango');
    return new Set(R.casos.filter(c => c.motivos.some(x => criterios.has(x.motivo))).map(c => c.fila));
}

/**
 * La tabla del resumen.
 * @param {ResultadoDepuracion} R
 * @param {ContextoDepuracion} ctx
 */
export function tablaResumen(R, ctx) {
    const fuera = filasExcluidas(R, ctx);
    return {
        titulo: 'Criterios de depuración y casos marcados',
        cabecera: ['Criterio', 'Regla', 'Casos', '% de la base', 'Tratamiento'],
        filas: ORDEN_MOTIVOS.map(m => {
            const motivo = noRevisado(m, R, ctx);
            if (motivo) return [NOMBRE_MOTIVO[m], regla(m, R, ctx), '—', '—', `No revisado: ${motivo}`];
            const n = R.resumen[m];
            const trato = m === 'fueraDeRango' ? { perdido: 'Valores convertidos en perdidos', excluir: 'Caso excluido', nada: 'Conservado' }[ctx.fueraDeRango]
                : ctx.excluir.includes(m) ? 'Caso excluido' : 'Revisado y conservado';
            return [NOMBRE_MOTIVO[m], regla(m, R, ctx), String(n), pct(n, R.n), n ? trato : '—'];
        }),
        nota: `N = ${R.n}; casos con al menos una señal: ${R.casos.length} (${pct(R.casos.length, R.n)} %); excluidos: ${fuera.size}; base depurada: N = ${R.n - fuera.size}. Un caso puede tener varias señales. Las z, con la media y la desviación típica de cada variable; Mahalanobis, con los casos completos.${R.fueraDeEscala.length ? ` Sin revisar en el rango (más de la mitad de sus valores fuera de ${ctx.minimo}–${ctx.maximo}: no usan esa escala): ${R.fueraDeEscala.join(', ')}.` : ''}`
    };
}

/**
 * La tabla de los casos marcados (una fila por caso, con todos sus motivos).
 * @param {ResultadoDepuracion} R
 * @param {ContextoDepuracion} ctx
 */
export function tablaCasos(R, ctx) {
    const fuera = filasExcluidas(R, ctx);
    return {
        titulo: 'Casos marcados',
        cabecera: ['Fila', ctx.id ? ctx.id : 'Caso', 'Señales', 'En la base depurada'],
        filas: R.casos.map(c => [String(c.fila), c.id, c.motivos.map(x => `${NOMBRE_MOTIVO[x.motivo]}: ${x.detalle}`).join('; '), fuera.has(c.fila) ? 'Excluido' : 'Se conserva']),
        nota: 'Fila: la posición del caso en la base cargada (sin contar los encabezados). Revisa los casos antes de excluirlos: una señal no prueba que el caso sea inválido.'
    };
}

/** El motivo de una exclusión, en el texto («por duplicados»). @type {Readonly<Record<Motivo, string>>} */
const POR = Object.freeze({
    duplicado: 'duplicados', idRepetido: 'identificador repetido', fueraDeRango: 'valores fuera de rango', perdidos: 'demasiadas respuestas en blanco',
    longstring: 'cadenas largas de respuestas iguales', sinVariabilidad: 'la misma respuesta en todo', atipicoUnivariado: 'atípicos univariados', atipicoMultivariado: 'atípicos multivariados'
});

/**
 * El párrafo APA 7 del procedimiento.
 * @param {ResultadoDepuracion} R
 * @param {ContextoDepuracion} ctx
 */
export function redactarDepuracion(R, ctx) {
    const U = ctx.umbrales, revisado = (/** @type {Motivo} */ m) => !noRevisado(m, R, ctx), pM = String(U.pMahalanobis).replace(/^0/, '');
    const salvo = salvoDe(R, ctx);
    /** @type {string[]} */ const buscados = [`casos duplicados (filas idénticas en todas las columnas${salvo.length ? `, salvo ${algunos(salvo)}` : ''})`];
    if (revisado('idRepetido')) buscados.push('identificadores repetidos');
    if (revisado('fueraDeRango')) buscados.push(`valores fuera de la escala de respuesta (${ctx.minimo}–${ctx.maximo}${R.fueraDeEscala.length ? `; salvo en ${listaY(R.fueraDeEscala)}, que usa${R.fueraDeEscala.length === 1 ? '' : 'n'} otra escala` : ''})`);
    buscados.push(`casos con más del ${Math.round(100 * U.perdidosPorCaso)} % de las respuestas en blanco`);
    let s = `Antes de los análisis se depuró la base (N = ${R.n}) revisando ${ctx.k === 1 ? '1 variable' : `${ctx.k} variables`}: ${ctx.variables}. Se buscaron ${listaY(buscados)}.`;
    if (revisado('longstring')) s += ` Las respuestas descuidadas (Curran, 2016) se identificaron por cadenas de ${R.longstringUmbral} o más respuestas idénticas seguidas (longstring; Johnson, 2005) y por la misma respuesta en todos los ítems (variabilidad intraindividual nula; Dunn et al., 2018).`;
    s += revisado('atipicoMultivariado')
        ? ` Los atípicos univariados se definieron como |z| > ${U.zUnivariado}, y los multivariados, por la distancia de Mahalanobis con p < ${pM} (Tabachnick y Fidell, 2019); su tratamiento se fijó antes de analizar los datos (Leys et al., 2019).`
        : ` Los atípicos univariados se definieron como |z| > ${U.zUnivariado} (Tabachnick y Fidell, 2019); su tratamiento se fijó antes de analizar los datos (Leys et al., 2019).`;
    if (!R.casos.length) return `${s} No se identificó ningún caso con estas señales, por lo que se analizaron los ${R.n} casos.`;
    const halladas = ORDEN_MOTIVOS.filter(m => revisado(m) && R.resumen[m] > 0);
    s += ` Se identificaron ${R.casos.length} ${R.casos.length === 1 ? 'caso' : 'casos'} (${pct(R.casos.length, R.n)} %) con al menos una señal: ${listaY(halladas.map(m => CUENTA[m](R.resumen[m])))}.`;
    if (R.resumen.duplicado && R.duplicados.porAzar) s += ` Con tan pocas columnas, y de pocas opciones, dos personas distintas pueden responder exactamente igual (se esperaban unas ${cuantas(R.duplicados.esperables)} coincidencias por azar con columnas independientes, y más con ítems correlacionados)${ctx.excluir.includes('duplicado') ? '' : ', así que los duplicados se revisaron sin excluirlos por ese motivo'}.`;
    const fuera = filasExcluidas(R, ctx);
    const motivosFuera = ORDEN_MOTIVOS.filter(m => (m === 'fueraDeRango' ? ctx.fueraDeRango === 'excluir' : ctx.excluir.includes(m)) && R.resumen[m] > 0);
    if (ctx.fueraDeRango === 'perdido' && R.resumen.fueraDeRango > 0) s += ' Los valores fuera de rango se trataron como perdidos.';
    if (fuera.size) s += ` Se ${fuera.size === 1 ? 'excluyó 1 caso' : `excluyeron ${fuera.size} casos`} (por ${listaY(motivosFuera.map(m => POR[m]))})${fuera.size < R.casos.length ? ' y los demás casos señalados se revisaron y se conservaron' : ''}, con lo que la muestra final quedó en N = ${R.n - fuera.size}.`;
    else s += ` Los casos señalados se revisaron y se conservaron (N = ${R.n}).`;
    return s;
}

/** Las referencias que cita el texto. @param {ResultadoDepuracion} R @param {ContextoDepuracion} ctx */
export function referenciasDepuracion(R, ctx) {
    /** @type {string[]} */ const claves = ['tabachnick2019', 'leys2019'];
    if (!noRevisado('longstring', R, ctx)) claves.push('curran2016', 'johnson2005', 'dunn2018');
    return referenciasDe(claves);
}


/**
 * El CSV de los casos marcados (punto y coma, para Excel en español).
 * @param {ResultadoDepuracion} R
 * @param {ContextoDepuracion} ctx
 */
export function csvCasos(R, ctx) {
    const fuera = filasExcluidas(R, ctx);
    const lineas = [['Fila', ctx.id || 'Caso', ...ORDEN_MOTIVOS.map(m => NOMBRE_MOTIVO[m]), 'Detalle', 'En la base depurada'].map(celda).join(';')];
    for (const c of R.casos) {
        const tiene = new Set(c.motivos.map(x => x.motivo));
        lineas.push([c.fila, c.id, ...ORDEN_MOTIVOS.map(m => (tiene.has(m) ? 1 : 0)), c.motivos.map(x => `${NOMBRE_MOTIVO[x.motivo]}: ${x.detalle}`).join(' | '), fuera.has(c.fila) ? 'Excluido' : 'Se conserva'].map(celda).join(';'));
    }
    return lineas.join('\r\n') + '\r\n';
}

/**
 * Las filas de la base depurada: sin las excluidas y, si se pidió, con los valores fuera de rango de las variables revisadas
 * convertidos en perdidos (celda vacía). No modifica las filas originales.
 * @param {Record<string, unknown>[]} filas
 * @param {string[]} items
 * @param {ResultadoDepuracion} R
 * @param {ContextoDepuracion} ctx
 */
export function baseDepurada(filas, items, R, ctx) {
    const fuera = filasExcluidas(R, ctx), convertir = ctx.fueraDeRango === 'perdido' && ctx.minimo !== null && ctx.maximo !== null;
    const enEscala = items.filter(c => !R.fueraDeEscala.includes(c));
    const { minimo, maximo, enteros } = ctx;
    return filas.filter((_, i) => !fuera.has(i + 1)).map(f => {
        if (!convertir) return { ...f };
        const g = { ...f };
        for (const c of enEscala) {
            const x = aNumero(f[c]);
            if (Number.isFinite(x) && (x < /** @type {number} */ (minimo) || x > /** @type {number} */ (maximo) || (enteros && !Number.isInteger(x)))) g[c] = '';
        }
        return g;
    });
}

/**
 * El CSV de unas filas (todas sus columnas, en el orden de la primera), en español.
 * @param {Record<string, unknown>[]} filas
 */
export function csvBase(filas) {
    if (!filas.length) return '';
    const cols = Object.keys(/** @type {Record<string, unknown>} */ (filas[0]));
    return [cols.map(celda).join(';'), ...filas.map(f => cols.map(c => celda(f[c])).join(';'))].join('\r\n') + '\r\n';
}

/**
 * El documento de Word.
 * @param {ResultadoDepuracion} R
 * @param {ContextoDepuracion} ctx
 */
export function documentoWordDepuracion(R, ctx) {
    let cuerpo = tituloWord('Depuración de la base') + parrafoWord(redactarDepuracion(R, ctx));
    cuerpo += tablaWord({ numero: 1, ...tablaResumen(R, ctx) });
    if (R.casos.length) cuerpo += tablaWord({ numero: 2, ...tablaCasos(R, ctx) });
    return documentoWord('Depuración de la base', cuerpo + referenciasWord(referenciasDepuracion(R, ctx)));
}
