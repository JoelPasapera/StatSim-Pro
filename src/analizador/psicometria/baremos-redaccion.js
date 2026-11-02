// @ts-check
// analizador/psicometria/baremos-redaccion.js — (2027.01.18) lo que se escribe de unos baremos: la tabla de baremos
// (puntuación directa → percentil, T normalizada, eneatipo y decatipo), las categorías con sus puntos de corte, la comparación
// de grupos que decide si hacen falta baremos diferenciados, la redacción APA 7, el CSV y el Word. Sin DOM.
import { numeroConMenos, pConSigno } from '../../shared/formato-numero.js';
import { referenciasDe } from '../informe/referencias-apa.js';
import { tituloWord, subtituloWord, parrafoWord, tablaWord, referenciasWord, documentoWord } from '../informe/word-apa.js';
import { listaY } from '../../shared/texto-es.js';

/** @typedef {ReturnType<typeof import('../../core/stats/baremos.js').tablaBaremos>} TablaBaremos */
/** @typedef {ReturnType<typeof import('../../core/stats/baremos.js').categoriasPorPercentiles>} Categorias */
/** @typedef {{ escala: string, grupo: string | null, cortes: number[], excluidos: number, alfa: number }} ContextoBaremos */
/**
 * @typedef {{ general: { tabla: TablaBaremos, categorias: Categorias }, grupos: { nombre: string, tabla: TablaBaremos, categorias: Categorias }[],
 *   comparacion: { prueba: string, estadistico: string, pValor: number, efecto: string, magnitud: string, significativa: boolean,
 *     difieren: boolean, diferenciados: boolean, pequenos: string[] } | null }} ResultadoBaremos
 *   difieren: la diferencia es significativa y al menos pequeña; diferenciados: además, todos los grupos tienen 30 personas o
 *   más (pequenos: los que no)
 */

/** @param {number} v @param {number} [d] */
const fx = (v, d = 2) => numeroConMenos(v, d);
/** «de» y el nombre de la escala, con «del» si empieza por el artículo «el». @param {string} escala */
const deLa = escala => (/^el\s/i.test(escala) ? `del ${escala.slice(3)}` : `de ${escala}`);
/** Un número entero o con sus decimales, como la puntuación directa. @param {number} v */
const fpd = v => (Number.isInteger(v) ? String(v) : fx(v, 2));

/**
 * La tabla de baremos.
 * @param {TablaBaremos} t
 * @param {string} titulo
 */
export function tablaDeBaremos(t, titulo) {
    return {
        titulo, cabecera: ['PD', 'f', 'fa', 'Percentil', 'T', 'Eneatipo', 'Decatipo'],
        filas: t.filas.map(f => [fpd(f.pd), String(f.f), String(f.fa), fx(f.pc, 1), fx(f.t, 1), String(f.eneatipo), String(f.decatipo)]),
        nota: `n = ${t.n}; M = ${fx(t.media)}, DE = ${fx(t.de)}. PD: puntuación directa; fa: frecuencia acumulada. Percentil por el punto medio (el porcentaje de casos por debajo más la mitad de los que la tienen). T: la normalizada (M = 50, DE = 10, desde el percentil por la normal), que no supone una distribución normal de las puntuaciones. Eneatipos con sus cortes convencionales (el 4, 11, 23, 40, 60, 77, 89 y 96 % acumulados: 4, 7, 12, 17, 20, 17, 12, 7 y 4 % en cada uno); decatipos, en medias desviaciones típicas (Canfield, 1951).`
    };
}

/**
 * (2027.01.20, revisión) Los tamaños nominales de los niveles, los que dan los percentiles de corte (25 y 75: 25, 50 y 25 %).
 * @param {number[]} cortes
 */
const nominales = cortes => cortes.map((c, i) => c - (i ? /** @type {number} */ (cortes[i - 1]) : 0)).concat(100 - /** @type {number} */ (cortes[cortes.length - 1]));

/**
 * (2027.01.20, revisión) Si las puntuaciones repetidas alejan algún nivel de su tamaño nominal (más de 5 puntos), o dejan uno
 * vacío (dos cortes en la misma puntuación: «0 < PD ≤ 0»), la frase que lo explica; si no, ''.
 * @param {Categorias} c
 * @param {number[]} cortes
 */
export function avisoEmpates(c, cortes) {
    const nom = nominales(cortes);
    if (!c.some((k, i) => Math.abs(k.porcentaje - /** @type {number} */ (nom[i])) > 5)) return '';
    const vacios = c.filter((k, i) => i > 0 && i < c.length - 1 && !(k.hasta > k.desde)).map(k => k.nombre.toLowerCase());
    return ` Por las puntuaciones repetidas, los niveles no tienen el tamaño que dan los percentiles (${listaY(nom.map(p => `${fx(p, 0)} %`))}): una puntuación igual a un corte va entera al nivel de abajo${vacios.length ? `, y ${vacios.length === 1 ? `el nivel ${vacios[0]} queda vacío` : `los niveles ${listaY(vacios)} quedan vacíos`} (sus dos cortes caen en la misma puntuación)` : ''}.`;
}

/** Las puntuaciones directas de un nivel, o que está vacío. @param {Categorias} c @param {number} i */
const intervaloDe = (c, i) => {
    const k = /** @type {Categorias[number]} */ (c[i]);
    if (i === 0) return `≤ ${fpd(k.hasta)}`;
    if (i === c.length - 1) return `> ${fpd(k.desde)}`;
    return k.hasta > k.desde ? `> ${fpd(k.desde)} y ≤ ${fpd(k.hasta)}` : `ninguna (los cortes coinciden en ${fpd(k.desde)})`;
};

/**
 * La tabla de las categorías.
 * @param {Categorias} c
 * @param {number[]} cortes
 * @param {string} titulo
 */
export function tablaDeCategorias(c, cortes, titulo) {
    return {
        titulo, cabecera: ['Nivel', 'Puntuaciones directas', 'Percentiles', 'n', '%'],
        filas: c.map((k, i) => [k.nombre, intervaloDe(c, i), i === 0 ? `≤ ${cortes[0]}` : i === c.length - 1 ? `> ${cortes[cortes.length - 1]}` : `${cortes[i - 1]}–${cortes[i]}`, String(k.n), fx(k.porcentaje, 1)]),
        nota: `Los puntos de corte, las puntuaciones directas de los percentiles de corte (cuantil de tipo 7, el de R y NumPy; con puntuaciones enteras, el entero de abajo, que clasifica igual); una puntuación igual al corte va al nivel de abajo.${avisoEmpates(c, cortes)}`
    };
}

/**
 * El párrafo APA 7.
 * @param {ResultadoBaremos} R
 * @param {ContextoBaremos} ctx
 */
export function redactarBaremos(R, ctx) {
    const g = R.general, t = g.tabla, c = g.categorias;
    const niveles = listaY(c.map((k, i) => `${k.nombre.toLowerCase()} (${i === 0 ? `PD ≤ ${fpd(k.hasta)}` : i === c.length - 1 ? `PD > ${fpd(k.desde)}` : k.hasta > k.desde ? `${fpd(k.desde)} < PD ≤ ${fpd(k.hasta)}` : 'ninguna puntuación'}; ${fx(k.porcentaje, 1)} %)`));
    let s = `Se elaboraron los baremos ${deLa(ctx.escala)} con una muestra normativa (AERA et al., 2014) de ${t.n} personas${ctx.excluidos ? ` (${ctx.excluidos} sin puntuación, fuera)` : ''} (M = ${fx(t.media)}, DE = ${fx(t.de)}). Las puntuaciones directas se transformaron en percentiles (por el punto medio), en puntuaciones T normalizadas (M = 50, DE = 10), en eneatipos y en decatipos (Angoff, 1971; Canfield, 1951). Para la interpretación se establecieron ${c.length} niveles por los percentiles ${listaY(ctx.cortes.map(String))}: ${niveles}.${avisoEmpates(c, ctx.cortes)}`;
    const C = R.comparacion;
    if (C) {
        const datos = `${C.prueba}, ${C.estadistico}, p ${pConSigno(C.pValor, { alfa: ctx.alfa })}; ${C.efecto}, efecto ${C.magnitud}`;
        const pocos = C.pequenos || [];
        if (C.diferenciados) s += ` Las puntuaciones difirieron según ${ctx.grupo} (${datos}), por lo que se presentan baremos diferenciados para ${listaY(R.grupos.map(x => x.nombre))}.`;
        else if (C.difieren) s += pocos.length
            ? ` Las puntuaciones difirieron según ${ctx.grupo} (${datos}), pero ${pocos.length === 1 ? `el grupo ${pocos[0]} tiene` : `los grupos ${listaY(pocos)} tienen`} menos de 30 personas, demasiado pocas para un baremo propio estable: se presenta el baremo general, y conviene ampliar la muestra de ${pocos.length === 1 ? 'ese grupo' : 'esos grupos'} antes de usar baremos diferenciados.`
            : ` Las puntuaciones difirieron según ${ctx.grupo} (${datos}); aun así, se presenta un baremo general.`;
        else if (C.significativa) s += ` Aunque las puntuaciones difirieron según ${ctx.grupo} (${datos}), el efecto es trivial, por lo que basta un baremo general.`;
        else s += ` Las puntuaciones no difirieron significativamente según ${ctx.grupo} (${datos}), por lo que basta un baremo general.`;
    }
    return s;
}

/** Las referencias. */
export function referenciasBaremos() { return referenciasDe(['angoff1971', 'canfield1951', 'aera2014']); }

/**
 * El CSV de los baremos (con punto y coma y coma decimal, el de Excel en español): una fila por puntuación (y grupo).
 * @param {ResultadoBaremos} R
 */
export function csvBaremos(R) {
    const fila = (/** @type {string} */ grupo, /** @type {TablaBaremos['filas'][number]} */ f) => [grupo, f.pd, f.f, f.fa, f.pc.toFixed(2), f.t.toFixed(2), f.eneatipo, f.decatipo].map(v => String(v).replace('.', ',')).join(';');
    const lineas = ['Grupo;PD;f;fa;Percentil;T;Eneatipo;Decatipo', ...R.general.tabla.filas.map(f => fila('General', f))];
    for (const g of R.grupos) lineas.push(...g.tabla.filas.map(f => fila(g.nombre.replace(/[;\r\n]/g, ' '), f)));
    return lineas.join('\r\n') + '\r\n';
}

/**
 * Todas las tablas, en su orden.
 * @param {ResultadoBaremos} R
 * @param {ContextoBaremos} ctx
 */
export function tablasBaremos(R, ctx) {
    const t = [tablaDeBaremos(R.general.tabla, `Baremos de ${ctx.escala}${R.grupos.length ? ' (general)' : ''}`), tablaDeCategorias(R.general.categorias, ctx.cortes, `Niveles de ${ctx.escala}${R.grupos.length ? ' (general)' : ''}`)];
    if (R.comparacion && R.comparacion.diferenciados) for (const g of R.grupos) t.push(tablaDeBaremos(g.tabla, `Baremos de ${ctx.escala}: ${g.nombre}`), tablaDeCategorias(g.categorias, ctx.cortes, `Niveles de ${ctx.escala}: ${g.nombre}`));
    return t;
}

/**
 * El documento de Word.
 * @param {ResultadoBaremos} R
 * @param {ContextoBaremos} ctx
 */
export function documentoWordBaremos(R, ctx) {
    let cuerpo = tituloWord(`Baremos de ${ctx.escala}`) + parrafoWord(redactarBaremos(R, ctx)), n = 0;
    for (const t of tablasBaremos(R, ctx)) cuerpo += tablaWord({ numero: ++n, ...t });
    if (R.comparacion) cuerpo += subtituloWord('¿Un baremo general o diferenciado?') + parrafoWord(`${R.comparacion.prueba}: ${R.comparacion.estadistico}, p ${pConSigno(R.comparacion.pValor, { alfa: ctx.alfa })}; ${R.comparacion.efecto} (${R.comparacion.magnitud}). Se proponen baremos diferenciados si la diferencia es significativa y al menos pequeña.`);
    return documentoWord(`Baremos de ${ctx.escala}`, cuerpo + referenciasWord(referenciasBaremos()));
}
