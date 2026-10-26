// @ts-check
// tests/unit/modelo-de-la-pagina.js — (2027.01.07) Lo que deja en la página cada acción de un guion, y lo que llevan entonces
// las descargas del análisis, escrito aparte de la guía (src/ejemplos/hazlo/sesion.js y planes.js) leyendo el código de la
// página: es el oráculo de ejemplos-guia-modelo.test.js, que compara con él lo que la guía dice de las descargas. Lo empezó la
// revisión independiente de la 2027.01.06 (su «modelo de la página»), que encontró con él los casos en que la guía aconsejaba
// mal. Lo que hace cada acción:
//  - «Ejecutar análisis» (analizar): reemplaza el análisis, y quita del Word la ANCOVA y el MANOVA (ui/analisis.js,
//    olvidarAnalisisAnterior);
//  - la comparación de grupos: reemplaza su tarjeta; con covariable (que no sea la variable que compara) o con más variables,
//    su ANCOVA o su MANOVA van al Word (comparacion-grupos.js, exportador-word.js) hasta el siguiente análisis;
//  - el SEM: uno por papel (sem-motor.js, _recordar): el que se ajusta otra vez sale de donde estaba y va al final; el Word y
//    lo impreso llevan la comparación, en ese orden, y el último ajustado;
//  - el AFE, la V de Aiken y la invarianza: reemplazan su tarjeta, que solo va en lo impreso;
//  - los datos y la configuración de la investigación: en las tres descargas.
// Cada cosa se anota con el paso y la acción que la dejó («2.1»: la segunda acción del paso 2). Sin DOM.

/**
 * @typedef {{ accion: string, datos: Record<string, any> }} Accion
 * @typedef {{ pasos: unknown[], repetir: { desde: number, hasta: number }, guiones: Accion[][] }} Caso
 * @typedef {{ cfg: string, an: string | null, anc: string | null, cg: string | null, afe: string | null, aik: string | null, inv: string | null, sem: Array<{ papel: string, id: string }> }} Estado
 * @typedef {{ word: string[], texto: string[], pdf: string[] }} Descargas  lo que lleva cada una, en fichas «cosa:id»
 */

/** Las acciones que la guía hace (las demás, las descargas y guardar el proyecto, solo se señalan). */
const QUE_SE_HACEN = new Set(['usarBaseDelSimulador', 'describirInvestigacion', 'analizar', 'compararGrupos', 'ajustarSEM', 'calcularAFE', 'calcularAiken', 'evaluarInvarianza']);
/** @param {Accion} a */
export const seHace = a => QUE_SE_HACEN.has(a.accion);
/** El papel de un modelo del SEM: su etiqueta o, sin ella, el que la tarjeta trae elegido. @param {Record<string, any>} d */
const papel = d => d.etiqueta || 'Modelo inicial';
/** ¿Lleva la comparación de grupos su ANCOVA o su MANOVA al Word? @param {Record<string, any>} d */
const alWord = d => (!!d.covariable && d.covariable !== d.numerica) || (d.adicionales || []).some((/** @type {string} */ c) => c !== d.numerica);

/** La página tras abrir el caso: los datos y la configuración que trae el proyecto. @returns {Estado} */
export const inicial = () => ({ cfg: 'proyecto', an: null, anc: null, cg: null, afe: null, aik: null, inv: null, sem: [] });

/** Una copia del estado. @param {Estado} st @returns {Estado} */
export const copia = st => ({ ...st, sem: st.sem.map(m => ({ ...m })) });

/**
 * Lo que hace una acción en la página.
 * @param {Estado} st
 * @param {Accion} a
 * @param {string} id
 */
export function aplicar(st, a, id) {
    switch (a.accion) {
        case 'analizar': st.an = id; st.anc = null; break;
        case 'compararGrupos': st.cg = id; st.anc = alWord(a.datos) ? id : null; break;
        case 'ajustarSEM': st.sem = [...st.sem.filter(m => m.papel !== papel(a.datos)), { papel: papel(a.datos), id }]; break;
        case 'calcularAFE': st.afe = id; break;
        case 'calcularAiken': st.aik = id; break;
        case 'evaluarInvarianza': st.inv = id; break;
        case 'describirInvestigacion': st.cfg = id; break;
        case 'usarBaseDelSimulador': Object.assign(st, inicial(), { cfg: st.cfg }); break;   // otra base: lo calculado ya no está
        default: break;
    }
}

/**
 * Lo que llevan las descargas del análisis con la página así (sin un análisis, nada que bajar).
 * @param {Estado} st
 * @returns {Descargas}
 */
export function descargas(st) {
    if (!st.an) return { word: ['sin análisis'], texto: ['sin análisis'], pdf: ['sin análisis'] };
    const f = (/** @type {string} */ k, /** @type {string | null} */ x) => (x ? [`${k}:${x}`] : []);
    const sem = [...st.sem.map((m, i) => `sem${i}:${m.id}`), ...(st.sem.length ? [`semUltimo:${st.sem[st.sem.length - 1].id}`] : [])];
    return {
        word: [`cfg:${st.cfg}`, `an:${st.an}`, ...f('anc', st.anc), ...sem].sort(),
        texto: [`cfg:${st.cfg}`, `an:${st.an}`].sort(),
        pdf: [`cfg:${st.cfg}`, `an:${st.an}`, ...f('cg', st.cg), ...f('afe', st.afe), ...f('aik', st.aik), ...f('inv', st.inv), ...sem].sort(),
    };
}

/** El paso de una ficha («an:3.0» → 3; las del proyecto, 0). @param {string} ficha */
export const pasoDe = ficha => Number((ficha.split(':')[1] || '').split('.')[0]) || 0;

/**
 * Hace lo que la guía hace de un paso (sus acciones, en orden; hasta la i-ésima sin incluirla, si se da).
 * @param {Estado} st
 * @param {Caso} e
 * @param {number} n
 * @param {number} [hasta]
 */
export function hacerPaso(st, e, n, hasta = Infinity) {
    (e.guiones[n - 1] || []).forEach((a, i) => { if (i < hasta && seHace(a)) aplicar(st, a, `${n}.${i}`); });
}

/**
 * Las descargas del análisis del paso n en el caso: lo que dejaron, en orden, los pasos que se repiten de antes y el paso n
 * hasta sus descargas (o, sin ellas, entero: las de los opcionales de después son del último que se repite).
 * @param {Caso} e
 * @param {number} n
 * @returns {Descargas}
 */
export function delCaso(e, n) {
    const st = inicial();
    for (let k = e.repetir.desde; k < n; k++) hacerPaso(st, e, k);
    const g = e.guiones[n - 1] || [], i = g.findIndex(a => a.accion === 'exportarAnalisis');
    hacerPaso(st, e, n, i < 0 ? Infinity : i);
    return descargas(st);
}
