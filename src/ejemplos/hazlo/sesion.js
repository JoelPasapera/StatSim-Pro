// @ts-check
// ejemplos/hazlo/sesion.js — (2027.01.03) «Muéstrame», «Hazlo por mí» y «Hazlo todo por mí» en la guía de un caso: qué se
// hace de cada paso (su guion, con los planes de planes.js, que conductor.js hace o señala en la página), en qué orden, lo
// que dice la guía mientras tanto, y «Detener» (o la tecla Esc). Solo se repite lo que el proyecto no trae: los análisis de
// los pasos que hay que repetir. Lo demás es de la persona y solo se señala: las descargas de lo que quedó en la página (que
// quedan señaladas al terminar, hasta que pulse fuera de la guía) y «Guardar proyecto». Mientras trabaja, la guía se pliega
// para no tapar la página; al terminar de hacer sigue plegada (lo que importa es el resultado) y al terminar de mostrar, o
// si se detiene o algo falla, vuelve como estaba. No pinta la guía: le pide a su vista (guia.js) que diga, que se pliegue,
// que marque un paso o que ocupe sus botones. Las funciones de arriba (qué ofrece cada paso, qué descargas valen, lo que se
// dice) no tocan el DOM. (2027.01.07) Lo que dice de las descargas supone un caso que cumple las reglas de reglas.js (cada
// tarjeta una vez, el SEM en un paso, las descargas del análisis al final de su paso y tras su análisis…): la página no lee
// los guiones de uno que no las cumpla (catalogo.js), y el generador de los ejemplos no lo escribe.

import { accionEjecutable, descargasDelAnalisis, descargasQueLleva, loQueBorraOtroAnalisis, planDe, queBorraOtroAnalisis, senalesDe } from './planes.js';
import { Detenido, ejecutarPlan, mostrarPlan, seccionFinal } from './conductor.js';
import { dejarSenalados, quitarSenalado } from './resaltado.js';
import { estadoDelPaso, pasosEnPalabras } from '../catalogo.js';

/**
 * @typedef {import('../catalogo.js').Ejemplo} Ejemplo
 * @typedef {import('./planes.js').AccionDelGuion} AccionDelGuion
 * @typedef {import('./planes.js').Op} Op
 * @typedef {import('./planes.js').DescargaDelAnalisis} DescargaDelAnalisis
 */

/** ¿Trae el caso el guion de cada paso? (Unos ejemplos de la 2027.01.02 no lo traen: su guía no ofrece nada de esto.) @param {Ejemplo} e */
export const conGuiones = e => Array.isArray(e.guiones) && e.guiones.length === e.pasos.length;

/** El guion del paso n (desde 1); vacío si no lo hay. @param {Ejemplo} e @param {number} n @returns {AccionDelGuion[]} */
export const guionDe = (e, n) => (conGuiones(e) && /** @type {AccionDelGuion[][]} */ (e.guiones)[n - 1]) || [];

/** ¿Ofrece «Hazlo por mí» el paso n? Si hay que repetirlo y su guion hace algo (no solo descargas). @param {Ejemplo} e @param {number} n */
export const seHace = (e, n) => estadoDelPaso(n, e.repetir) === 'repetir' && guionDe(e, n).some(accionEjecutable);

/** ¿Ofrece «Muéstrame» el paso n? Si tiene guion. @param {Ejemplo} e @param {number} n */
export const seMuestra = (e, n) => guionDe(e, n).length > 0;

/** Los pasos que hace «Hazlo todo por mí», en orden. @param {Ejemplo} e */
export const pasosQueSeHacen = e => e.pasos.map((_, i) => i + 1).filter(n => seHace(e, n));

/**
 * Las descargas que valen tras hacer unos pasos (en orden), y los pasos cuyas descargas ya no están. Las de un análisis de
 * la vista principal valen hasta que otro análisis lo reemplaza; las de una tarjeta (la V de Aiken, el AFE, la invarianza),
 * hasta que esa tarjeta calcula otra vez. Tras el último de los pasos que se repiten, también las de los pasos opcionales
 * de después: son del último análisis. (2027.01.07, revisión) Las de un mismo análisis en dos pasos (el último que se repite
 * y uno opcional) valen las dos: hasta la 2027.01.06 se daban por perdidas las del primero. Y un paso cuyas descargas del
 * análisis ya no están es de los perdidos aunque sigan las de su tarjeta: hasta la 2027.01.06 no lo era, y «Hazlo todo por
 * mí» no decía que esas ya no estaban.
 * @param {Ejemplo} e
 * @param {number[]} pasos
 * @returns {{ vigentes: Array<{ n: number, ops: Op[], clave: string }>, perdidos: number[] }} vigentes: por paso y por cosa, lo
 *   que se señala (clave: 'analisis', las del análisis de la vista principal, o la acción de la tarjeta), en el orden de los pasos
 */
export function descargasTras(e, pasos) {
    /** @type {Array<{ n: number, a: AccionDelGuion }>} */
    const acciones = pasos.flatMap(n => guionDe(e, n).map(a => ({ n, a })));
    const ultimo = pasos[pasos.length - 1];
    if (ultimo === e.repetir.hasta) {
        for (let k = ultimo + 1; k <= e.pasos.length; k++) acciones.push(...guionDe(e, k).filter(a => a.accion === 'exportarAnalisis').map(a => ({ n: k, a })));
    }
    /** @type {Array<{ n: number, ops: Op[], clave: string }>} lo que vale: de cada paso, de cada cosa ('analisis', la vista principal, o la tarjeta) */
    let vigentes = [];
    /** @type {Set<number>} */
    const perdidos = new Set();
    /** Las descargas de una cosa ya no están (salvo las del paso «salvo»). @param {string} clave @param {number} [salvo] */
    const perder = (clave, salvo = 0) => {
        vigentes = vigentes.filter(v => (v.clave !== clave || v.n === salvo ? true : (perdidos.add(v.n), false)));
    };
    for (const { n, a } of acciones) {
        if (a.accion === 'analizar') { perder('analisis'); continue; }
        const ops = senalesDe(planDe(a).ops);
        if (!ops.length) continue;
        const clave = a.accion === 'exportarAnalisis' ? 'analisis' : a.accion;
        // una tarjeta que calcula otra vez: las suyas de otro paso ya no están (lo que solo se señala, como «Guardar proyecto», no calcula)
        if (accionEjecutable(a)) perder(clave, n);
        const delPaso = vigentes.find(v => v.clave === clave && v.n === n);   // (dos descargas del mismo paso: las dos)
        if (delPaso) delPaso.ops = [...delPaso.ops, ...ops]; else vigentes.push({ n, ops, clave });
    }
    return { vigentes: vigentes.sort((x, y) => x.n - y.n), perdidos: [...perdidos].sort((x, y) => x - y) };
}

/** El orden en que se nombran las descargas del análisis. @type {DescargaDelAnalisis[]} */
const DESCARGAS = ['word', 'texto', 'pdf'];

/**
 * (2027.01.07) Lo que deja una acción en las descargas del análisis si después se hacen otras (tras): lo que lleva (planes.js,
 * descargasQueLleva: lo impreso, todas las tarjetas; el Word, el SEM y la ANCOVA o el MANOVA de la comparación de grupos; el
 * texto, ninguna), salvo lo que se lleva un «Ejecutar análisis» posterior (loQueBorraOtroAnalisis: esa ANCOVA y ese MANOVA
 * salen del Word).
 * @param {AccionDelGuion} a
 * @param {AccionDelGuion[]} tras
 * @returns {DescargaDelAnalisis[]}
 */
function loQueDejaLaAccion(a, tras) {
    const borra = tras.some(b => b.accion === 'analizar') ? loQueBorraOtroAnalisis(a) : [];
    return descargasQueLleva(a).filter(d => !borra.includes(d));
}

/** Lo que hace el paso n antes de sus descargas del análisis (sin ellas, todo él). @param {Ejemplo} e @param {number} n */
function antesDeSusDescargas(e, n) {
    const g = guionDe(e, n), i = g.findIndex(a => a.accion === 'exportarAnalisis');
    return i < 0 ? g : g.slice(0, i);
}

/**
 * (2027.01.06) Cuáles de unas descargas llevan lo que deja el paso k si después se hacen unas acciones (luego) y se bajan: lo
 * que deja cada una de sus acciones (loQueDejaLaAccion), con lo que la sigue en su paso y luego. En el orden de descargas.
 * (2027.01.07, revisión) Sin mirar ya si una tarjeta vuelve a calcular después (reemplazaA, de la 2027.01.06): en un caso que
 * cumple las reglas (reglas.js), cada una calcula una vez.
 * @param {Ejemplo} e
 * @param {number} k
 * @param {AccionDelGuion[]} luego
 * @param {DescargaDelAnalisis[]} descargas
 * @returns {DescargaDelAnalisis[]}
 */
function loQueDejaCon(e, k, luego, descargas) {
    const deK = guionDe(e, k);
    /** @type {Set<DescargaDelAnalisis>} */
    const deja = new Set();
    deK.forEach((a, i) => { if (accionEjecutable(a)) loQueDejaLaAccion(a, [...deK.slice(i + 1), ...luego]).forEach(d => deja.add(d)); });
    return descargas.filter(d => deja.has(d));
}

/**
 * (2027.01.05, revisión) Cuáles de unas descargas del análisis del paso n llevan lo que deja en su tarjeta el paso k, si se
 * hace k, después unos pasos (entre) y después n (loQueDejaCon, con lo que hacen ellos y el paso n antes de sus descargas;
 * (2027.01.06) si el paso n no las tiene, son las de los pasos opcionales que lo siguen: todo él, con su propio análisis).
 * (Sustituye a llevanLoDe de la 2027.01.04, que no miraba el orden.)
 * @param {Ejemplo} e
 * @param {number} k
 * @param {number[]} entre
 * @param {number} n
 * @param {DescargaDelAnalisis[]} descargas
 * @returns {DescargaDelAnalisis[]}
 */
export function loQueDejaEn(e, k, entre, n, descargas) {
    return loQueDejaCon(e, k, [...entre.flatMap(j => guionDe(e, j)), ...antesDeSusDescargas(e, n)], descargas);
}

/**
 * (2027.01.07, revisión) Lo que dejaría de más el paso k en unas descargas del análisis del paso n si se hace ahora, después
 * de n, y no antes, como en el caso: acción por acción, lo que deja con lo que la sigue en su paso y no dejó en el caso, con lo
 * que la siguió hasta las descargas de n (entre: los pasos de en medio). Es lo que un análisis posterior quitó del Word (la
 * ANCOVA o el MANOVA de la comparación de grupos), y «que» dice qué es, en palabras (planes.js, queBorraOtroAnalisis). Hasta la 2027.01.06
 * se miraba por descarga, con todo el paso junto: con el SEM en el Word, la ANCOVA del mismo paso no contaba como de más, y
 * hecho así el Word la llevaba.
 * @param {Ejemplo} e
 * @param {number} k
 * @param {number[]} entre
 * @param {number} n
 * @param {DescargaDelAnalisis[]} descargas
 * @returns {{ ds: DescargaDelAnalisis[], que: string }}
 */
export function loQueDejaDeMas(e, k, entre, n, descargas) {
    const deK = guionDe(e, k), enElCaso = [...entre.flatMap(j => guionDe(e, j)), ...antesDeSusDescargas(e, n)];
    /** @type {Set<DescargaDelAnalisis>} */
    const deMas = new Set();
    /** @type {string[]} */
    const que = [];
    deK.forEach((a, i) => {
        if (!accionEjecutable(a)) return;
        const tras = deK.slice(i + 1), enElCasoDeja = loQueDejaLaAccion(a, [...tras, ...enElCaso]);
        const suyas = loQueDejaLaAccion(a, tras).filter(d => descargas.includes(d) && !enElCasoDeja.includes(d));
        if (!suyas.length) return;
        suyas.forEach(d => deMas.add(d));
        const nombre = queBorraOtroAnalisis(a);
        if (nombre) que.push(nombre);
    });
    return { ds: descargas.filter(d => deMas.has(d)), que: unir(que) };
}

/**
 * (2027.01.04) Los pasos de una tarjeta (la V de Aiken, el AFE, el SEM, la invarianza, la comparación de grupos), de los que
 * se repiten, cuyo resultado va en las descargas del análisis del paso n: se queda en la página, y lo recogen lo impreso
 * (todas) y el Word (el SEM y (2027.01.05) la ANCOVA o el MANOVA). Todo vacío si el paso n no deja las descargas del
 * análisis (las de una tarjeta son solo suyas).
 * - antes: los anteriores. En el caso ya estaban: si no se hicieron, esas descargas no son las del caso. (Revisión)
 *   conAnalisis: de ellos, los que hacen también su propio análisis, que reemplaza al del paso n: si se hacen ahora, el
 *   paso n hay que repetirlo después.
 * - despues: (revisión) los posteriores. En el caso aún no estaban: si ya se hicieron, sobran.
 * - descargas: (revisión) las del análisis del paso n (el Word, si lo hay; el texto; el PDF).
 * - lleva: (2027.01.05, revisión) de cada uno de esos pasos, cuáles de ellas lo llevan (loQueDejaEn): uno de antes, con los
 *   del caso entre medias; uno de después, hecho antes que el paso n (ahora). (2027.01.07) Sin mirar ya lo que se hizo tras
 *   él (los «hechos» de la 2027.01.06): en un caso que cumple las reglas (reglas.js), lo que deja no depende de eso.
 * - deMas: (2027.01.06, revisión) de los de antes que no hacen su propio análisis, en cuáles de ellas dejaría de más,
 *   hecho ahora (tras el paso n), lo que en el caso se llevó un análisis posterior (la ANCOVA o el MANOVA, del Word): para
 *   que sean las del caso, el paso n hay que repetirlo después, como con conAnalisis. (2027.01.07, revisión) Acción por
 *   acción (loQueDejaDeMas); y queDeja: qué es, en palabras («la ANCOVA»).
 * @param {Ejemplo} e
 * @param {number} n
 * @returns {{ antes: number[], conAnalisis: number[], despues: number[], descargas: DescargaDelAnalisis[], lleva: Record<number, DescargaDelAnalisis[]>, deMas: Record<number, DescargaDelAnalisis[]>, queDeja: Record<number, string> }}
 */
export function tarjetasQueLleva(e, n) {
    // (2027.01.07) las del análisis del paso n: las suyas y, si es el último que se repite, las de los opcionales de después
    const descargas = descargasDelAnalisis(descargasTras(e, [n]).vigentes.filter(v => v.clave === 'analisis').flatMap(v => v.ops));
    /** Los pasos del caso entre el k y el n. @param {number} k */
    const entre = k => e.pasos.map((_, i) => i + 1).filter(j => j > k && j < n);
    /** @type {Record<number, DescargaDelAnalisis[]>} */
    const lleva = {};
    for (const k of descargas.length ? pasosQueSeHacen(e) : []) {
        if (k === n) continue;
        const ds = loQueDejaEn(e, k, k < n ? entre(k) : [], n, descargas);
        if (ds.length) lleva[k] = ds;
    }
    const conTarjeta = Object.keys(lleva).map(Number).sort((x, y) => x - y);
    const antes = conTarjeta.filter(k => k < n);
    const conAnalisis = antes.filter(k => guionDe(e, k).some(a => a.accion === 'analizar'));
    /** @type {Record<number, DescargaDelAnalisis[]>} */
    const deMas = {};
    /** @type {Record<number, string>} */
    const queDeja = {};
    for (const k of antes.filter(x => !conAnalisis.includes(x))) {
        const { ds, que } = loQueDejaDeMas(e, k, entre(k), n, descargas);
        if (ds.length) { deMas[k] = ds; queDeja[k] = que; }
    }
    return { antes, conAnalisis, despues: conTarjeta.filter(k => k > n), descargas, lleva, deMas, queDeja };
}

/**
 * (2027.01.05) Cuáles de unos pasos lleva cada descarga (tarjetasQueLleva: lleva), en orden.
 * @param {number[]} pasos (en orden)
 * @param {Record<number, DescargaDelAnalisis[]>} lleva
 * @returns {Partial<Record<DescargaDelAnalisis, number[]>>}
 */
export function porDescarga(pasos, lleva) {
    /** @type {Partial<Record<DescargaDelAnalisis, number[]>>} */
    const r = {};
    for (const k of pasos) for (const d of lleva[k] || []) (r[d] = r[d] || []).push(k);
    return r;
}

/**
 * (Revisión de la 2027.01.04) Tras «Hazlo todo por mí», lo que darían repetidos ahora los pasos cuyas descargas ya no están:
 * de cada uno, los posteriores (de los que hizo) cuya tarjeta llevarían sus descargas (despuesDe) y (2027.01.05) cuáles de
 * ellos lleva cada una (enDespuesDe; (2027.01.08) de cada paso, no de todos juntos), con lo que se hizo después de cada uno
 * (un análisis posterior se lleva del Word la ANCOVA). Para finDeTodo.
 * @param {Ejemplo} e
 * @param {number[]} pasos los que hizo, en orden
 * @param {number[]} perdidos
 * @returns {{ despuesDe: Record<number, number[]>, enDespuesDe: Record<number, Partial<Record<DescargaDelAnalisis, number[]>>> }}
 */
export function loDeDespues(e, pasos, perdidos) {
    /** @type {Record<number, number[]>} */
    const despuesDe = {};
    /** @type {Record<number, Partial<Record<DescargaDelAnalisis, number[]>>>} */
    const enDespuesDe = {};
    for (const p of perdidos) {
        const t = tarjetasQueLleva(e, p);
        despuesDe[p] = t.despues.filter(k => pasos.includes(k));
        enDespuesDe[p] = porDescarga(despuesDe[p], t.lleva);
    }
    return { despuesDe, enDespuesDe };
}

/**
 * (2027.01.07, revisión) Tras «Hazlo todo por mí», de las descargas del análisis que siguen (las de un paso sin otro análisis
 * después), las que llevan ya lo de los pasos que hizo después de él (una tarjeta: en el caso aún no estaba): de cada uno, esos
 * pasos (despuesDe) y cuáles lleva cada una de sus descargas (enDespues). Para finDeTodo: hasta la 2027.01.06 las señalaba como
 * si fueran las del caso (con las descargas de un capítulo en el paso 2 y un AFE en el 3, lo impreso del 2 llevaba el AFE).
 * @param {Ejemplo} e
 * @param {number[]} pasos los que hizo, en orden
 * @param {Array<{ n: number, ops: Op[], clave: string }>} vigentes las que siguen (descargasTras)
 * @returns {{ despuesDe: Record<number, number[]>, enDespues: Partial<Record<DescargaDelAnalisis, number[]>> }}
 */
export function loQueYaLlevan(e, pasos, vigentes) {
    /** @type {Record<number, number[]>} */
    const despuesDe = {};
    /** @type {Partial<Record<DescargaDelAnalisis, number[]>>} */
    const enDespues = {};
    for (const v of vigentes) {
        // (las de una tarjeta no son descargas del análisis: con ellas, descargasDelAnalisis no da ninguna, y no llevan nada)
        const descargas = descargasDelAnalisis(v.ops), luego = pasos.filter(k => k > v.n);
        /** @type {Record<number, DescargaDelAnalisis[]>} */
        const lleva = {};
        luego.forEach((k, i) => {
            const ds = loQueDejaCon(e, k, luego.slice(i + 1).flatMap(j => guionDe(e, j)), descargas);
            if (ds.length) lleva[k] = ds;
        });
        const conAlgo = luego.filter(k => lleva[k]);
        if (!conAlgo.length) continue;
        despuesDe[v.n] = conAlgo;
        for (const d of DESCARGAS) {
            const ks = porDescarga(conAlgo, lleva)[d];
            if (ks) enDespues[d] = [...new Set([...(enDespues[d] || []), ...ks])].sort((x, y) => x - y);
        }
    }
    return { despuesDe, enDespues };
}

/** Unos textos, en una frase: «a», «a y b», «a, b y c». @param {string[]} xs */
const unir = xs => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`);
/** Con minúscula inicial (un título dentro de una frase). @param {string} t */
const minuscula = t => t.charAt(0).toLowerCase() + t.slice(1);
/** Con mayúscula inicial (un mensaje al empezar una frase). @param {string} t */
const capital = t => t.charAt(0).toUpperCase() + t.slice(1);
/** «el paso 2» → «del paso 2»; «los pasos 2 y 3» → «de los pasos 2 y 3». @param {string} t */
const de = t => (t.startsWith('el ') ? `del ${t.slice(3)}` : `de ${t}`);

/** Cómo se nombra cada descarga del análisis en una frase. @type {Record<DescargaDelAnalisis, string>} */
const NOMBRE_DE_LA_DESCARGA = { word: 'el Word', texto: 'el texto', pdf: 'lo impreso (el PDF)' };

/**
 * (2027.01.04, revisión) Unas descargas del análisis como sujeto de una frase, con las palabras que concuerdan con él: «lo
 * impreso (el PDF)» (el, lo), «el Word y lo impreso (el PDF)» (los, los); sin decir cuáles, «sus descargas» (las, las).
 * @param {DescargaDelAnalisis[]} ds
 */
function comoSujeto(ds) {
    if (!ds.length) return { sujeto: 'sus descargas', plural: true, el: 'las', lo: 'las' };
    const plural = ds.length > 1;
    return { sujeto: unir(ds.map(d => NOMBRE_DE_LA_DESCARGA[d])), plural, el: plural ? 'los' : 'el', lo: plural ? 'los' : 'lo' };
}

/**
 * (2027.01.05, revisión) Las descargas que llevan lo de unos pasos, en grupos de las que llevan lo mismo, de menos pasos a
 * más (lo impreso, que lleva todas las tarjetas, al final), y todas ellas; sin decir cuáles, un grupo con todos los pasos
 * («sus descargas»). Hasta la 2027.01.04 iban todas juntas: «el Word y lo impreso (el PDF) llevan también lo de los pasos 2
 * a 5», en el caso 4, cuando el Word solo lleva el SEM del 4.
 * @param {Partial<Record<DescargaDelAnalisis, number[]>>} porDescarga los pasos que lleva cada una (en orden)
 * @param {number[]} pasos todos ellos
 * @returns {{ grupos: Array<{ ds: DescargaDelAnalisis[], pasos: number[] }>, ds: DescargaDelAnalisis[] }}
 */
function enGrupos(porDescarga, pasos) {
    /** @type {Array<{ ds: DescargaDelAnalisis[], pasos: number[] }>} */
    const grupos = [];
    for (const d of DESCARGAS) {
        const ks = porDescarga[d];
        if (!ks || !ks.length) continue;
        const igual = grupos.find(g => g.pasos.join() === ks.join());
        if (igual) igual.ds.push(d); else grupos.push({ ds: [d], pasos: ks });
    }
    grupos.sort((x, y) => x.pasos.length - y.pasos.length);
    return grupos.length ? { grupos, ds: DESCARGAS.filter(d => grupos.some(g => g.ds.includes(d))) } : { grupos: [{ ds: [], pasos }], ds: [] };
}

/**
 * (2027.01.05) «el Word lleva también lo del paso 4, y lo impreso (el PDF), lo de los pasos 2 a 5»; con un grupo, «lo impreso
 * (el PDF) lleva también lo del paso 3»; (2027.01.06) con tres, separados por punto y coma (cada uno lleva ya su coma):
 * «el texto lleva también lo del paso 2; el Word, lo de los pasos 2 y 3; y lo impreso (el PDF), lo de los pasos 2 a 4».
 * @param {Array<{ ds: DescargaDelAnalisis[], pasos: number[] }>} grupos (enGrupos)
 */
function llevanTambien(grupos) {
    const [primero, ...resto] = grupos;
    const s = comoSujeto(primero.ds), sep = resto.length > 1 ? ';' : ',';
    return `${s.sujeto} ${s.plural ? 'llevan' : 'lleva'} también lo ${de(listaDePasos(primero.pasos))}`
        + resto.map((g, i) => `${sep} ${i === resto.length - 1 ? 'y ' : ''}${comoSujeto(g.ds).sujeto}, lo ${de(listaDePasos(g.pasos))}`).join('');
}

/**
 * Unos pasos, en palabras: los seguidos, como el README («los pasos 2 a 4»); si no, uno por uno («los pasos 2, 3 y 5»).
 * @param {number[]} pasos (en orden)
 */
export function listaDePasos(pasos) {
    const seguidos = pasos.every((n, i) => i === 0 || n === pasos[i - 1] + 1);
    if (pasos.length && seguidos) return pasosEnPalabras({ desde: pasos[0], hasta: pasos[pasos.length - 1] });
    return `los pasos ${unir(pasos.map(String))}`;
}

/**
 * Lo que dice la guía al terminar de mostrar el paso n.
 * @param {Ejemplo} e
 * @param {number} n
 * @param {number} senalados cuántos controles se señalaron
 */
export function finDeMostrar(e, n, senalados) {
    if (!senalados) return `Paso ${n}: sus controles aún no están a la vista (salen al hacer el paso anterior).`;
    const estado = estadoDelPaso(n, e.repetir);
    if (estado === 'hecho') return `Paso ${n}: eso es lo que se hizo. Ya lo trajo el proyecto: no hace falta repetirlo.`;
    if (estado === 'opcional') return `Paso ${n}: eso es tuyo (las descargas, «Guardar proyecto»): pulsa lo que quieras guardar.`;
    return seHace(e, n) ? `Paso ${n}: eso es lo que se toca. «Hazlo por mí» lo hace por ti, a la vista.` : `Paso ${n}: eso es lo que se toca.`;
}

/**
 * Lo que dice de las descargas al terminar: si las dejó señaladas, o por qué no.
 * @param {boolean} senaladas
 * @param {string} sinSenalar por qué no se señalaron (vacío: no había nada que señalar)
 */
const deLasDescargas = (senaladas, sinSenalar) => (senaladas ? ' Sus descargas son tuyas: te las dejo señaladas.'
    : sinSenalar ? ` No te señalé sus descargas: ${minuscula(sinSenalar.replace(/\.$/, ''))}.` : '');

/**
 * Lo que dice la guía al terminar «Hazlo por mí» del paso n.
 * @param {number} n
 * @param {string[]} hechas los títulos de las acciones que hizo
 * @param {boolean} senaladas si dejó señaladas sus descargas
 * @param {{ sinSenalar?: string, sinHacer?: number[], conAnalisis?: number[], enSinHacer?: Partial<Record<DescargaDelAnalisis, number[]>>, deMas?: Partial<Record<DescargaDelAnalisis, number[]>>, queDeja?: Record<number, string>, sobran?: number[], enSobran?: Partial<Record<DescargaDelAnalisis, number[]>>, plegada?: boolean }} [opciones]
 *   sinSenalar: por qué no las señaló, si las había; (2027.01.04) sinHacer: los pasos de antes que sus descargas llevan
 *   (tarjetasQueLleva) y no están marcados; (revisión) conAnalisis: de esos, los que hacen su propio análisis (si se hacen
 *   ahora, este hay que repetirlo después); (2027.01.06) deMas: de esos, en cuáles de sus descargas dejaría cada uno, hecho
 *   ahora, lo que el análisis de este se llevó en el caso (tarjetasQueLleva, porDescarga: este también hay que repetirlo
 *   después); (2027.01.07) queDeja: de cada uno, qué es («la ANCOVA»; sin decirlo, «lo que deja»); sobran: los pasos de
 *   después que sus descargas llevan y ya están marcados (en el caso aún no estaban); enSinHacer y enSobran: (2027.01.05)
 *   cuáles de unos y otros lleva cada una de sus descargas (porDescarga; sin decirlo, «sus descargas»); plegada: si la guía
 *   quedó plegada (si no, no hace falta pedir que se despliegue)
 */
export function finDelPaso(n, hechas, senaladas, { sinSenalar = '', sinHacer = [], conAnalisis = [], enSinHacer = {}, deMas = {}, queDeja = {}, sobran = [], enSobran = {}, plegada = true } = {}) {
    /** @type {string[]} */
    const ojo = [];
    if (sinHacer.length) {
        const uno = sinHacer.length === 1, g = enGrupos(enSinHacer, sinHacer), d = comoSujeto(g.ds);
        // (revisión) un paso que hace también su propio análisis reemplaza al de este: hecho después, este se repite; y
        // (2027.01.06) uno que dejaría de más lo que en el caso se llevó el análisis de este (la ANCOVA, del Word), también;
        // (2027.01.07) diciendo qué («quita del Word la ANCOVA del paso 2»: el paso 2 puede dejar en él también su SEM)
        const quitan = sinHacer.filter(k => !conAnalisis.includes(k) && DESCARGAS.some(x => (deMas[x] || []).includes(k)));
        const quitaDe = DESCARGAS.filter(x => (deMas[x] || []).some(k => quitan.includes(k)));
        const loQueQuita = quitan.every(k => queDeja[k])
            ? unir(quitan.map(k => `${queDeja[k]} ${de(`el paso ${k}`)}`))
            : `lo que ${quitan.length === 1 ? 'deja' : 'dejan'} ${listaDePasos(quitan)}`;
        const porque = [
            ...(conAnalisis.length ? [`${listaDePasos(conAnalisis)} ${conAnalisis.length === 1 ? 'hace' : 'hacen'} su propio análisis, que reemplaza al de este`] : []),
            ...(quitan.length ? [`el análisis de este quita ${de(comoSujeto(quitaDe).sujeto)} ${loQueQuita}`] : []),
        ];
        const remedio = porque.length
            ? `${uno ? 'hazlo' : 'hazlos'} y después repite este (${porque.join('; y ')})`
            : `${uno ? 'hazlo' : 'hazlos'} antes de descargar${d.lo}`;
        ojo.push(`${llevanTambien(g.grupos)}, que no ${uno ? 'está marcado como hecho' : 'están marcados como hechos'}; si no ${uno ? 'lo' : 'los'} hiciste, ${remedio}, o no ${d.plural ? 'serán' : 'será'} ${d.el} del caso («Hazlo todo por mí» hace todos los pasos en orden).`);
    }
    if (sobran.length) {
        // (revisión) lo de un paso posterior que ya se hizo también va en ellas: en el caso aún no estaba
        const uno = sobran.length === 1, g = enGrupos(enSobran, sobran), d = comoSujeto(g.ds);
        ojo.push(`${ojo.length ? 'Y ' : ''}${llevanTambien(g.grupos)}, que ${uno ? 'está marcado como hecho' : 'están marcados como hechos'} y en el caso ${uno ? 'viene' : 'vienen'} después: no ${d.plural ? 'serán' : 'será'} ${d.el} del caso (${d.el} del caso ${d.plural ? 'están' : 'está'} en la pestaña «Ejemplos»; o vuelve a abrir el caso y haz este paso antes que ${uno ? `el ${sobran[0]}` : 'esos'}).`);
    }
    const faltan = ojo.length ? ` Ojo: ${ojo.join(' ')}` : '';
    return `Listo: paso ${n} hecho (${unir(hechas.map(minuscula))}).${deLasDescargas(senaladas, sinSenalar)}${faltan}${plegada ? ' Despliega la guía (▴) para seguir.' : ''}`;
}

/**
 * Lo que dice la guía al terminar «Hazlo todo por mí»: lo que hizo, las descargas que dejó señaladas (las de lo que quedó en
 * la página) y las que ya no están (otro análisis las reemplazó: se rehacen repitiendo su paso, o están hechas en la
 * pestaña «Ejemplos»; (2027.01.07) «las del análisis»: las de la tarjeta de ese paso pueden seguir). (Revisión) Y lo que,
 * repetido ahora, saldría con lo de la tarjeta de un paso posterior (que en el caso aún no estaba): eso, solo hecho.
 * (2027.01.07, revisión) Y de las que siguen, las que llevan ya lo de un paso que hizo después (yaLlevan): esas, tampoco.
 * @param {number[]} pasos los que hizo
 * @param {{ vigentes: number[], perdidos: number[], senaladas: boolean, sinSenalar?: string, despuesDe?: Record<number, number[]>, enDespuesDe?: Record<number, Partial<Record<DescargaDelAnalisis, number[]>>>, yaLlevan?: { despuesDe: Record<number, number[]>, enDespues: Partial<Record<DescargaDelAnalisis, number[]>> } }} descargas
 *   despuesDe: por paso perdido, los posteriores (hechos) cuya tarjeta llevarían sus descargas (tarjetasQueLleva); enDespuesDe:
 *   (2027.01.05) de cada uno, cuáles de ellos lleva cada una de sus descargas (porDescarga; sin decirlo, «sus descargas»);
 *   yaLlevan: lo mismo de las que siguen (loQueYaLlevan), que son de un solo paso
 */
export function finDeTodo(pasos, { vigentes, perdidos, senaladas, sinSenalar = '', despuesDe = {}, enDespuesDe = {}, yaLlevan = { despuesDe: {}, enDespues: {} } }) {
    const hechas = `Listo: se ${pasos.length === 1 ? 'repitió' : 'repitieron'} ${listaDePasos(pasos)}, como en el caso.`;
    const tuyas = senaladas ? (perdidos.length ? ` Te dejo señaladas las descargas de lo que ves (las ${de(listaDePasos(vigentes))}).` : ' Te dejo señaladas sus descargas.')
        : sinSenalar && vigentes.length ? ` No te señalé sus descargas: ${minuscula(sinSenalar.replace(/\.$/, ''))}.` : '';
    const conLoDeOtros = Object.keys(yaLlevan.despuesDe).map(Number).filter(v => yaLlevan.despuesDe[v].length).sort((x, y) => x - y);
    let ya = '';
    if (conLoDeOtros.length) {
        const posteriores = [...new Set(conLoDeOtros.flatMap(v => yaLlevan.despuesDe[v]))].sort((x, y) => x - y);
        const g = enGrupos(yaLlevan.enDespues, posteriores), d = comoSujeto(g.ds);
        ya = ` De las ${de(listaDePasos(conLoDeOtros))}, ${llevanTambien(g.grupos)}, que en el caso ${posteriores.length === 1 ? 'viene' : 'vienen'} después: no ${d.plural ? 'serán' : 'será'} ${d.el} del caso (${d.el} del caso ${d.plural ? 'están' : 'está'} en la pestaña «Ejemplos»).`;
    }
    const perdidas = perdidos.length
        ? ` Cada análisis reemplaza al anterior en la página: ya no están las descargas del análisis ${de(listaDePasos(perdidos))}; ${perdidos.length === 1 ? 'repítelo' : 'repítelos'} con su «Hazlo por mí» o bájalas hechas en la pestaña «Ejemplos».`
        : '';
    const conOtros = perdidos.filter(p => (despuesDe[p] || []).length);
    let salvo = '';
    if (conOtros.length) {
        const posteriores = [...new Set(conOtros.flatMap(p => despuesDe[p]))].sort((x, y) => x - y);
        // (2027.01.05) cada descarga con lo suyo («el Word con lo del paso 4 y lo impreso (el PDF) con lo de los pasos 3 y 4»), y
        // «el del caso está en…», como al terminar un paso (hasta la 2027.01.04, «ese, bájalo hecho en…»); (2027.01.08, revisión)
        // y cada paso con lo suyo, juntos los que darían lo mismo («el paso 2 daría lo impreso (el PDF) con lo de los pasos 3 y
        // 4; y el 3, lo impreso (el PDF) con lo del paso 4»): hasta la 2027.01.07 iban todos juntos, y del paso 3 se decía que lo
        // suyo venía después
        const conLoDe = (/** @type {number} */ p) => unir(enGrupos(enDespuesDe[p] || {}, despuesDe[p]).grupos.map(x => `${comoSujeto(x.ds).sujeto} con lo ${de(listaDePasos(x.pasos))}`));
        /** @type {Array<{ pasos: number[], texto: string }>} */
        const iguales = [];
        for (const p of conOtros) {
            const texto = conLoDe(p), igual = iguales.find(x => x.texto === texto);
            if (igual) igual.pasos.push(p); else iguales.push({ pasos: [p], texto });
        }
        const cada = iguales.map((x, i) => (i === 0
            ? `${listaDePasos(x.pasos)} ${x.pasos.length === 1 ? 'daría' : 'darían'} ${x.texto}`
            : `${listaDePasos(x.pasos).replace(/^(el|los) pasos? /, '$1 ')}, ${x.texto}`));   // («y el 3», «y los 3 a 5»)
        const ds = DESCARGAS.filter(d => conOtros.some(p => (enDespuesDe[p] || {})[d]));
        const d = comoSujeto(ds), varios = d.plural || conOtros.length > 1, el = ds.length && varios ? 'los' : d.el;
        // (2027.01.09, revisión) con varios, los de después de todos aparte: tras el último («…y el 3, lo impreso (el PDF) con lo
        // del paso 4, que en el caso vienen después») no concordaba
        const despues = `${posteriores.length === 1 ? 'viene' : 'vienen'} después`;
        const lista = cada.length === 1 ? `${cada[0]}, que en el caso ${despues}` : `${cada.slice(0, -1).join('; ')}; y ${cada[cada.length - 1]} (en el caso, ${listaDePasos(posteriores)} ${despues})`;
        salvo = ` ${conOtros.length === 1 ? 'Repetido' : 'Repetidos'} ahora, ${lista}: ${el} del caso ${varios ? 'están' : 'está'} en la pestaña «Ejemplos».`;
    }
    return hechas + tuyas + ya + perdidas + salvo;
}

/**
 * Lo que dice la guía si se detuvo o algo falló.
 * @param {number} n el paso en que estaba
 * @param {unknown} error
 * @param {boolean} mostrando si estaba mostrando (y no haciendo)
 */
export function finConProblema(n, error, mostrando) {
    if (error instanceof Detenido) {
        return mostrando ? `Detenido en el paso ${n}.` : `Detenido en el paso ${n}. Lo que ya se hizo se queda; si un cálculo había empezado, termina solo.`;
    }
    const mensaje = capital((error instanceof Error ? error.message : String(error)).trim().replace(/\.$/, ''));
    return mostrando ? `No se pudo mostrar el paso ${n}. ${mensaje}.`
        : `No se pudo hacer el paso ${n}. ${mensaje}. Puedes seguir a mano: «Muéstrame» te señala dónde está cada cosa.`;
}

/**
 * @typedef {object} VistaDeLaGuia lo que la sesión le pide a la guía (guia.js)
 * @property {(texto: string, tipo?: 'info' | 'error') => void} decir su línea de estado (a la vista aunque esté plegada)
 * @property {(ocupada: boolean) => void} ocupar sus botones «Muéstrame» y «Hazlo…», ocupados; «Detener», a la vista
 * @property {(n: number | null) => void} enCurso el paso en que trabaja (null: ninguno)
 * @property {(n: number) => void} marcar el paso n, hecho
 * @property {(n: number) => boolean} marcado (2027.01.04) si el paso n está marcado como hecho (por la guía o por la persona)
 * @property {(plegada: boolean) => void} plegar
 * @property {() => boolean} plegada
 * @property {(nodo: EventTarget | null) => boolean} contiene si algo es de la guía (un clic en ella no quita lo señalado)
 */

/**
 * @typedef {object} SesionDeLaGuia
 * @property {(n: number) => Promise<boolean>} mostrar «Muéstrame» del paso n (false: no lo ofrece, había otra cosa en marcha, se detuvo o falló)
 * @property {(n: number) => Promise<boolean>} hacer «Hazlo por mí» del paso n
 * @property {() => Promise<boolean>} hacerTodo «Hazlo todo por mí»
 * @property {() => void} detener
 * @property {() => boolean} ocupada si hay algo en marcha
 */

/**
 * La sesión de «Hazlo por mí» de la guía de un caso: una cosa a la vez.
 * @param {Ejemplo} e
 * @param {VistaDeLaGuia} vista
 * @param {{ archivo?: import('./conductor.js').ArchivoDelCaso }} [opciones] archivo: los del caso que se suben, por su ruta
 * @returns {SesionDeLaGuia}
 */
export function crearSesion(e, vista, { archivo } = {}) {
    /** @type {AbortController | null} */
    let enMarcha = null;
    /** El paso en que trabaja (para decir dónde se detuvo). */
    let paso = 0;
    /** La sección en que quedó lo último que hizo: si la persona se va de ella, lo siguiente no se hace (conductor.js). */
    let donde = '';

    /** Lo que va haciendo en el paso n, en la línea de estado. @param {number} n @param {string} [antes] */
    const contar = (n, antes = '') => (/** @type {string} */ texto) => {
        vista.decir(`Paso ${n} · ${antes}${antes ? minuscula(texto) : texto}`);
    };

    /**
     * Una cosa en marcha: la guía plegada y ocupada, Esc para detenerla, y al final cómo terminó.
     * @param {(senal: AbortSignal) => Promise<void>} trabajo
     * @param {{ mostrando: boolean }} como mostrando: al terminar bien, la guía vuelve como estaba
     */
    async function correr(trabajo, { mostrando }) {
        if (enMarcha) return false;
        const control = new AbortController();
        enMarcha = control;
        paso = 0;
        donde = '';
        const estabaPlegada = vista.plegada();
        // (2027.01.04) en la ventana, después de todos los de la página: un Esc que ya usó otra cosa (cerrar la ayuda de un
        // gráfico, que lo marca con preventDefault) no detiene la guía
        /** @param {KeyboardEvent} ev */
        const alTeclear = ev => { if (ev.key === 'Escape' && !ev.defaultPrevented) control.abort(); };
        window.addEventListener('keydown', alTeclear);
        quitarSenalado();
        vista.ocupar(true);
        vista.plegar(true);
        let bien = false;
        try {
            await trabajo(control.signal);
            bien = true;
        } catch (err) {
            if (!(err instanceof Detenido)) console.warn('[StatSim] «Hazlo por mí»:', err);
            vista.decir(finConProblema(paso, err, mostrando), err instanceof Detenido ? 'info' : 'error');
        } finally {
            window.removeEventListener('keydown', alTeclear);
            enMarcha = null;
            vista.enCurso(null);
            if (!bien || mostrando) vista.plegar(estabaPlegada);
            vista.ocupar(false);
        }
        return bien;
    }

    /** Empieza el paso n. @param {number} n */
    const empezar = n => { paso = n; vista.enCurso(n); };

    /**
     * Hace lo que «Hazlo por mí» hace del paso n (sus análisis) y lo marca. Devuelve los títulos de lo que hizo.
     * @param {number} n @param {AbortSignal} senal
     */
    async function hacerPaso(n, senal) {
        empezar(n);
        /** @type {string[]} */
        const hechas = [];
        for (const a of guionDe(e, n)) {
            if (!accionEjecutable(a)) continue;
            const plan = planDe(a);
            await ejecutarPlan(plan.ops, { senal, archivo, alAvanzar: contar(n), desde: donde });
            donde = seccionFinal(plan.ops) || donde;
            hechas.push(plan.titulo);
        }
        vista.marcar(n);
        return hechas;
    }

    /**
     * Las descargas que valen tras hacer unos pasos, señaladas una tras otra y dejadas señaladas. Señalarlas es un extra: si
     * no se puede (la persona se fue a otra pestaña), los pasos ya están hechos y se dice por qué no se señalaron.
     * (2027.01.07) Cada botón, una vez: las de un mismo análisis en dos pasos (el último que se repite y uno opcional) son
     * los mismos botones.
     * @param {Array<{ n: number, ops: Op[] }>} vigentes
     * @param {AbortSignal} senal
     * @returns {Promise<{ senaladas: boolean, sinSenalar: string }>}
     */
    async function senalarLoTuyo(vigentes, senal) {
        if (!vigentes.length) return { senaladas: false, sinSenalar: '' };
        try {
            /** @type {Element[]} */
            const vistos = [];
            /** @type {Set<string>} */
            const yaSenalados = new Set();
            for (const { n, ops } of vigentes) {
                const nuevas = ops.filter(o => o.op !== 'senalar' || !yaSenalados.has(o.selector));
                nuevas.forEach(o => { if (o.op === 'senalar') yaSenalados.add(o.selector); });
                if (nuevas.some(o => o.op === 'senalar')) vistos.push(...await mostrarPlan(nuevas, { senal, alAvanzar: contar(n, 'Esto es tuyo: '), desde: donde }));
            }
            dejarSenalados(vistos, { ignorar: vista.contiene });
            return { senaladas: vistos.length > 0, sinSenalar: vistos.length ? '' : 'aún no están a la vista' };
        } catch (err) {
            // (2027.01.04) detenido mientras las señalaba: lo hecho, hecho está; solo faltó señalarlas (hasta la 2027.01.03 decía
            // «Detenido en el paso n» con el paso ya hecho y marcado)
            if (err instanceof Detenido) return { senaladas: false, sinSenalar: 'Lo detuviste' };
            console.warn('[StatSim] «Hazlo por mí», al señalar las descargas:', err);
            return { senaladas: false, sinSenalar: err instanceof Error ? err.message : String(err) };
        }
    }

    return {
        mostrar: async n => (seMuestra(e, n) ? correr(async senal => {
            empezar(n);
            const vistos = await mostrarPlan(guionDe(e, n).flatMap(a => planDe(a).ops), { senal, alAvanzar: contar(n) });
            vista.decir(finDeMostrar(e, n, vistos.length));
        }, { mostrando: true }) : false),
        hacer: async n => (seHace(e, n) ? correr(async senal => {
            const hechas = await hacerPaso(n, senal);
            const { senaladas, sinSenalar } = await senalarLoTuyo(descargasTras(e, [n]).vigentes, senal);
            const { antes, conAnalisis, despues, lleva, deMas, queDeja } = tarjetasQueLleva(e, n);
            const sinHacer = antes.filter(k => !vista.marcado(k)), sobran = despues.filter(k => vista.marcado(k));
            vista.decir(finDelPaso(n, hechas, senaladas, {
                sinSenalar, sinHacer, conAnalisis: conAnalisis.filter(k => sinHacer.includes(k)), enSinHacer: porDescarga(sinHacer, lleva),
                deMas: porDescarga(sinHacer, deMas), queDeja, sobran, enSobran: porDescarga(sobran, lleva), plegada: vista.plegada(),
            }));
        }, { mostrando: false }) : false),
        hacerTodo: async () => {
            const pasos = pasosQueSeHacen(e);
            if (!pasos.length) return false;
            return correr(async senal => {
                for (const n of pasos) await hacerPaso(n, senal);
                const { vigentes, perdidos } = descargasTras(e, pasos);
                const { senaladas, sinSenalar } = await senalarLoTuyo(vigentes, senal);
                // (2027.01.07) cada paso una vez (uno puede tener las de su tarjeta y las de su análisis), y lo que llevan ya las que siguen
                vista.decir(finDeTodo(pasos, { vigentes: [...new Set(vigentes.map(v => v.n))], perdidos, senaladas, sinSenalar, ...loDeDespues(e, pasos, perdidos), yaLlevan: loQueYaLlevan(e, pasos, vigentes) }));
            }, { mostrando: false });
        },
        detener: () => { if (enMarcha) enMarcha.abort(); },
        ocupada: () => !!enMarcha,
    };
}
