// @ts-check
// analizador/motor/grupos.js — la comparación de grupos del análisis general (la vista principal, la criba sociodemográfica y
// el Word): el protocolo único de core/stats/protocolo-grupos.js (normalidad de cada grupo y Levene → t de Student, t de
// Welch o U de Mann-Whitney con dos grupos; ANOVA de un factor, ANOVA de Welch o Kruskal-Wallis con tres o más, con el
// post-hoc de Holm), las pruebas sueltas de core/stats/contrastes.js y su formato en esta vista. La pestaña de grupos
// (comparacion-grupos.js) aplica el mismo protocolo con su propio formato. (2026.12.24, fase F6, paso 4) Antes, dentro de
// estadistica.js.
import * as contrastes from '../../core/stats/contrastes.js';
import { protocoloGrupos, postHocHolm, NOMBRE_POSTHOC, ALFA_SUPUESTOS } from '../../core/stats/protocolo-grupos.js';
import { pTBilateral } from '../../core/stats/distribuciones.js';
import { descriptivos } from './descriptivos.js';
import { formatoNormalidad } from './normalidad.js';
import { magnitudD, magnitudR } from './magnitudes.js';
import { rangosPromedio } from '../../core/stats/orden.js';

/**
 * (2026.12.30) El rango medio de cada grupo en la ordenación conjunta (los empates, con su rango promedio): la dirección de
 * una prueba de rangos (Mann-Whitney, Kruskal-Wallis). Antes, los textos la daban por la media, que con valores extremos
 * puede apuntar al lado contrario del que detectó la prueba.
 * @param {number[][]} grupos
 * @returns {number[]}
 */
export function rangosMedios(grupos) {
    const r = rangosPromedio(grupos.flat());
    let k = 0;
    return grupos.map(g => { let s = 0; for (let i = 0; i < g.length; i++) s += /** @type {number} */ (r[k++]); return g.length ? s / g.length : NaN; });
}

/**
 * El grupo con los valores más altos, como lo compara la prueba aplicada: por la media en la rama paramétrica y por el
 * rango medio en la de rangos. Devuelve su índice.
 * @param {{ parametrica: boolean, rangosMedios?: number[], descriptivas?: Array<{ media: number }>, descriptivas1?: { media: number }, descriptivas2?: { media: number } }} r
 * @returns {number}
 */
export function indiceGrupoMayor(r) {
    const valores = !r.parametrica && r.rangosMedios ? r.rangosMedios
        : (r.descriptivas ? r.descriptivas.map(d => d.media) : [/** @type {{ media: number }} */ (r.descriptivas1).media, /** @type {{ media: number }} */ (r.descriptivas2).media]);
    let iMax = 0;
    valores.forEach((v, i) => { if (v > /** @type {number} */ (valores[iMax])) iMax = i; });
    return iMax;
}

/** @typedef {import('./descriptivos.js').Descriptivos} Descriptivos */
/** @typedef {import('./normalidad.js').NormalidadVista} NormalidadVista */
/** @typedef {import('../../core/stats/protocolo-grupos.js').ClavePostHoc} ClavePostHoc */
/** @typedef {{ estadistico: number, df1: number, df2: number, pValor: number, varianzasIguales: boolean, centro: 'media' }} LeveneVista */
/**
 * La prueba global en el formato de esta vista (los campos según la prueba: estadistico y gl en las t; U y z en la de
 * Mann-Whitney; F, glEntre, glDentro y etaCuadrado en los ANOVA; H, gl y epsilonCuadrado en la de Kruskal-Wallis).
 * @typedef {{ prueba: string, pValor: number, estadistico?: number, gl?: number, U?: number, z?: number, F?: number,
 *   glEntre?: number, glDentro?: number, etaCuadrado?: number, H?: number, epsilonCuadrado?: number }} PruebaVista
 */
/**
 * @typedef {{ metodo: string, prueba: string, clave: string, comparaciones: { grupo1: string, grupo2: string,
 *   estadistico: number, gl: number | null, pValor: number, pAjustada: number, significativa: boolean }[] }} PostHocVista
 */
/** @typedef {{ d: number, interpretacion: string }} EfectoD */

/**
 * La Levene del núcleo (centrada en la media, la de SPSS) en el formato de esta vista. Con todas las desviaciones nulas
 * (grupos constantes), F es 0/0: F = 0 con p = 1. (2026.12.20) Con F infinita (dispersión nula dentro de cada grupo, pero
 * distinta entre ellos), p = 0, el del núcleo y el que decide el protocolo.
 * @param {{ F: number, gl1: number, gl2: number, pValor: number }} r
 * @returns {LeveneVista}
 */
export function formatoLevene(r) {
    const F = Number.isNaN(r.F) ? 0 : r.F;
    return { estadistico: F, df1: r.gl1, df2: r.gl2, pValor: r.pValor, varianzasIguales: r.pValor > ALFA_SUPUESTOS, centro: 'media' };
}

/**
 * Una t del núcleo en el formato de esta vista. Con dos grupos constantes e IGUALES, t es 0/0: t = 0 con p = 1 (también en
 * la de Welch, cuyos gl son entonces 0/0). (2026.12.22) Con grupos constantes y DISTINTOS, t = ±∞ con p = 0.
 * @param {string} nombre
 * @param {{ t: number, gl: number }} r
 * @returns {PruebaVista}
 */
export function formatoT(nombre, r) {
    if (Number.isNaN(r.t)) return { prueba: nombre, estadistico: 0, gl: r.gl, pValor: 1 };
    return { prueba: nombre, estadistico: r.t, gl: r.gl, pValor: Number.isFinite(r.t) ? pTBilateral(Math.abs(r.t), r.gl) : 0 };
}

/**
 * La U de Mann-Whitney del núcleo (aproximación normal con corrección por empates, sin corrección por continuidad: la de
 * SPSS) en el formato de esta vista.
 * @param {{ U: number, z: number, pValor: number }} r
 * @returns {PruebaVista}
 */
export function formatoMannWhitney(r) { return { prueba: 'U de Mann-Whitney', U: r.U, z: r.z, pValor: r.pValor }; }

/**
 * Un ANOVA del núcleo en el formato de esta vista. Con grupos constantes e iguales (F = 0/0), F = 0, p = 1 y η² = 0.
 * (2026.12.22) Con grupos constantes y distintos, F = ∞ con p = 0 y η² = 1. El ANOVA de Welch no está definido si algún
 * grupo no varía (sus pesos son n/s²): F = 0 y p = 1 (el protocolo nunca lo elige entonces: un grupo constante no es normal).
 * @param {string} nombre
 * @param {{ F: number, gl1: number, gl2: number, pValor: number, eta2: number }} r
 * @returns {PruebaVista}
 */
export function formatoAnova(nombre, r) {
    const F = Number.isNaN(r.F) ? 0 : r.F;
    return { prueba: nombre, F, glEntre: r.gl1, glDentro: r.gl2, pValor: Number.isNaN(r.F) ? 1 : r.pValor, etaCuadrado: Number.isFinite(r.eta2) ? r.eta2 : 0 };
}

/**
 * La de Kruskal-Wallis del núcleo (con corrección por empates; ε² de Tomczak, 2014) en el formato de esta vista.
 * @param {{ H: number, gl: number, pValor: number, epsilon2: number }} r
 * @returns {PruebaVista}
 */
export function formatoKruskal(r) { return { prueba: 'Kruskal-Wallis', H: r.H, gl: r.gl, pValor: r.pValor, epsilonCuadrado: r.epsilon2 }; }

/**
 * La prueba global que eligió el protocolo, en el formato de esta vista (el nombre del ANOVA clásico es el de SPSS,
 * «ANOVA de un factor»).
 * @param {{ prueba: string, global: any }} P
 * @returns {PruebaVista}
 */
export function formatoPrueba(P) {
    switch (P.prueba) {
        case 'student': return formatoT('t de Student', P.global);
        case 'welch': return formatoT('t de Welch', P.global);
        case 'mann-whitney': return formatoMannWhitney(P.global);
        case 'anova': return formatoAnova('ANOVA de un factor', P.global);
        case 'anova-welch': return formatoAnova('ANOVA de Welch', P.global);
        default: return formatoKruskal(P.global);
    }
}

/**
 * El post-hoc del protocolo en el formato de esta vista.
 * @param {{ metodo: string, nombre: string, ajuste: string, pares: import('../../core/stats/protocolo-grupos.js').ParPostHoc[] }} ph
 * @param {string[]} etiquetas
 * @returns {PostHocVista}
 */
export function formatoPostHoc(ph, etiquetas) {
    return {
        metodo: ph.ajuste, prueba: ph.nombre, clave: ph.metodo,
        comparaciones: ph.pares.map(p => ({
            grupo1: /** @type {string} */ (etiquetas[p.i]), grupo2: /** @type {string} */ (etiquetas[p.j]), estadistico: p.estadistico, gl: p.gl,
            pValor: p.pValor, pAjustada: p.pHolm, significativa: p.significativa
        }))
    };
}

/** @param {number[][]} grupos @returns {LeveneVista} */
export function pruebaLevene(grupos) { return formatoLevene(contrastes.levene(grupos)); }

/** @param {number[]} grupo1 @param {number[]} grupo2 @returns {PruebaVista} t de Student (varianzas iguales) */
export function pruebaTStudent(grupo1, grupo2) { return formatoT('t de Student', contrastes.tStudent(grupo1, grupo2)); }

/** @param {number[]} grupo1 @param {number[]} grupo2 @returns {PruebaVista} t de Welch (gl de Welch-Satterthwaite) */
export function pruebaTWelch(grupo1, grupo2) { return formatoT('t de Welch', contrastes.tWelch(grupo1, grupo2)); }

/** @param {number[]} grupo1 @param {number[]} grupo2 @returns {PruebaVista} */
export function pruebaMannWhitney(grupo1, grupo2) { return formatoMannWhitney(contrastes.mannWhitney(grupo1, grupo2)); }

/**
 * d de Cohen (con la desviación típica combinada) y su magnitud. Con grupos constantes e iguales, d es 0/0: 0.
 * (2026.12.22) Con grupos constantes y distintos, d = ±∞ («grande»).
 * @param {number[]} grupo1
 * @param {number[]} grupo2
 * @returns {EfectoD}
 */
export function efectoD(grupo1, grupo2) {
    const v = contrastes.dCohen(grupo1, grupo2), d = Number.isNaN(v) ? 0 : v;
    return { d, interpretacion: magnitudD(d) };
}

/** @param {number[][]} grupos @returns {PruebaVista} ANOVA de un factor (el nombre de SPSS) */
export function anovaUnFactor(grupos) { return formatoAnova('ANOVA de un factor', contrastes.anova(grupos)); }

/** @param {number[][]} grupos @returns {PruebaVista} ANOVA de Welch (la «prueba robusta» de SPSS; oneway.test de R) */
export function anovaWelch(grupos) { return formatoAnova('ANOVA de Welch', contrastes.anovaWelch(grupos)); }

/** @param {number[][]} grupos @returns {PruebaVista} */
export function kruskalWallis(grupos) { return formatoKruskal(contrastes.kruskal(grupos)); }

/**
 * Comparaciones por pares con la corrección de Holm y el modelo de error de la prueba global: 'mce' (t con la media
 * cuadrática del error de todos los grupos, tras el ANOVA), 'welch' (t de Welch, tras el ANOVA de Welch) o 'dunn' (z de
 * Dunn con los rangos conjuntos, tras Kruskal-Wallis); cada p ajustado se juzga con `alfa`.
 * @param {number[][]} grupos
 * @param {string[]} etiquetas
 * @param {ClavePostHoc} metodo
 * @param {number} alfa
 * @returns {PostHocVista}
 */
export function paresPostHoc(grupos, etiquetas, metodo, alfa) {
    return formatoPostHoc({ metodo, nombre: NOMBRE_POSTHOC[metodo], ajuste: 'Holm', pares: postHocHolm(grupos, metodo, { alfa }) }, etiquetas);
}

/**
 * Dos grupos con el protocolo único: descriptivos, normalidad de cada uno, Levene, la prueba aplicada, la d de Cohen (y,
 * con la prueba no paramétrica, la r de rangos |z|/√N), la decisión con `alfa` y los datos. Lanza un error si algún
 * grupo tiene menos de 3 casos.
 * @param {number[]} grupo1
 * @param {number[]} grupo2
 * @param {string} etiqueta1
 * @param {string} etiqueta2
 * @param {number} alfa
 */
export function compararDosGrupos(grupo1, grupo2, etiqueta1, etiqueta2, alfa) {
    if (grupo1.length < 3 || grupo2.length < 3) {
        throw new Error('Cada grupo necesita al menos 3 observaciones');
    }
    const P = protocoloGrupos([grupo1, grupo2], { alfa });   // (2026.12.20) la regla única de todas las vistas
    const prueba = formatoPrueba(P), parametrica = P.rama === 'parametrica';
    const z = prueba.z;
    return {
        etiqueta1,
        etiqueta2,
        descriptivas1: descriptivos(grupo1),
        descriptivas2: descriptivos(grupo2),
        normalidad1: formatoNormalidad(/** @type {Parameters<typeof formatoNormalidad>[0]} */ (P.normalidad[0])),
        normalidad2: formatoNormalidad(/** @type {Parameters<typeof formatoNormalidad>[0]} */ (P.normalidad[1])),
        levene: formatoLevene(P.levene),
        prueba,
        parametrica,
        tamanoEfecto: efectoD(grupo1, grupo2),
        rangosMedios: rangosMedios([grupo1, grupo2]),
        // el tamaño del efecto de la prueba no paramétrica: r de rangos = |z|/√N (Cohen: .10 pequeño, .30 mediano, .50 grande)
        tamanoEfectoRangos: (!parametrica && typeof z === 'number' && Number.isFinite(z)) ? (() => {
            const r = Math.abs(z) / Math.sqrt(grupo1.length + grupo2.length);
            return { r, interpretacion: magnitudR(r) };
        })() : null,
        alpha: alfa,
        decision: prueba.pValor < alfa ? 'rechazar' : 'no_rechazar',
        etiquetas: [etiqueta1, etiqueta2],
        gruposDatos: [grupo1, grupo2]
    };
}

/**
 * Tres o más grupos con el protocolo único: descriptivos y normalidad de cada uno, Levene, la prueba aplicada, la decisión
 * con `alfa` y, si es significativa, el post-hoc con Holm. Lanza un error si algún grupo tiene menos de 3 casos.
 * @param {number[][]} grupos
 * @param {string[]} etiquetas
 * @param {number} alfa
 */
export function compararVariosGrupos(grupos, etiquetas, alfa) {
    if (grupos.some(g => g.length < 3)) {
        throw new Error('Cada grupo necesita al menos 3 observaciones');
    }
    const P = protocoloGrupos(grupos, { alfa });
    const prueba = formatoPrueba(P);
    const decision = prueba.pValor < alfa ? 'rechazar' : 'no_rechazar';
    return {
        etiquetas,
        descriptivas: grupos.map(g => descriptivos(g)),
        normalidades: P.normalidad.map(r => formatoNormalidad(r)),
        levene: formatoLevene(P.levene),
        prueba,
        parametrica: P.rama === 'parametrica',
        rangosMedios: rangosMedios(grupos),
        decision,
        postHoc: decision === 'rechazar' && P.postHoc ? formatoPostHoc(P.postHoc, etiquetas) : null,
        gruposDatos: grupos
    };
}
