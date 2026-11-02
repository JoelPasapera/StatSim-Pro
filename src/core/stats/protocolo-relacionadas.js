// @ts-check
// core/stats/protocolo-relacionadas.js — (2027.01.17) EL protocolo de las muestras relacionadas: las mismas personas medidas
// dos o más veces (o en dos o más condiciones), con o sin un factor entre sujetos. Como el de los grupos independientes
// (protocolo-grupos.js), contrasta los supuestos, elige la prueba, la ejecuta y, si la global es significativa, compara por
// pares con Holm:
//   · dos medidas: la t para muestras relacionadas si las diferencias son normales; si no, Wilcoxon;
//   · tres o más: el ANOVA de medidas repetidas si sus residuos son normales (con la corrección de la esfericidad cuando
//     Mauchly la rechaza: Huynh-Feldt si la ε de Greenhouse-Geisser pasa de .75 y Greenhouse-Geisser si no; Girden, 1992); si
//     no, Friedman;
//   · medidas dicotómicas (dos valores en todas): McNemar (dos) o la Q de Cochran (tres o más);
//   · con un factor entre sujetos: el ANOVA mixto (con la misma regla de la esfericidad, Levene en cada medida y la M de Box),
//     y, si la interacción es significativa, sus efectos simples.
// Con dos medidas, el cambio es el de la primera a la segunda (segunda − primera: positivo si aumenta), como en cada par.
// Las comparaciones por pares son la prueba de dos medidas sobre cada par (t pareada, Wilcoxon o McNemar), que no supone la
// esfericidad (Maxwell y Delaney, 2004) ni depende de las demás medidas (Benavoli et al., 2016). Junto a la prueba elegida
// se calcula la de la otra rama (la no paramétrica de una paramétrica y al revés), para ver si la conclusión depende de la
// elección. La normalidad es la del núcleo (Shapiro-Wilk con n < 50 y Lilliefors con n ≥ 50) y los supuestos se contrastan
// a .05 (ALFA_SUPUESTOS), con independencia del α del estudio.
import { media, desviacion } from './descriptivos.js';
import { mediana, cuantilOrdenado } from './orden.js';
import { cuantilT } from './distribuciones.js';
import { pruebaNormalidad } from './normalidad.js';
import { ALFA_SUPUESTOS, protocoloGrupos, postHocHolm } from './protocolo-grupos.js';
import { tPareada, wilcoxon, anovaMedidasRepetidas, friedman, mcnemar, cochranQ, anovaMixta, paresRelacionadosHolm } from './relacionadas.js';
import { intervaloDz, intervaloEta2 } from './efectos.js';
import { cuantilNormal } from './normal.js';
import { ajustarHolm } from './multiples.js';

/** Máximo de medidas: con más, el ANOVA de medidas repetidas pasaría de 45 pares y la esfericidad necesitaría mucha muestra. */
export const MAX_MEDIDAS = 10;
/** Mínimo de casos completos (y de casos por grupo en el diseño mixto). */
export const MIN_CASOS = 3;

/** @typedef {'t-pareada' | 'wilcoxon' | 'anova-rm' | 'friedman' | 'mcnemar' | 'cochran' | 'anova-mixta'} ClavePruebaRelacionadas */

/** El nombre de cada prueba, el mismo en la tarjeta, el Word y la redacción. */
export const NOMBRE_PRUEBA = Object.freeze({
    't-pareada': 't de Student para muestras relacionadas', wilcoxon: 'prueba de los rangos con signo de Wilcoxon',
    'anova-rm': 'ANOVA de medidas repetidas', friedman: 'prueba de Friedman', mcnemar: 'prueba de McNemar',
    cochran: 'prueba Q de Cochran', 'anova-mixta': 'ANOVA mixto'
});
/** El de cada comparación por pares. */
export const NOMBRE_PARES = Object.freeze({ tpareada: 't para muestras relacionadas', wilcoxon: 'Wilcoxon', mcnemar: 'McNemar (binomial exacta)' });

/**
 * La corrección de la esfericidad que se aplica: ninguna si Mauchly no la rechaza (p > .05); si la rechaza (o no se puede
 * contrastar, con menos casos que medidas), Huynh-Feldt con ε_GG > .75 y Greenhouse-Geisser si no (Girden, 1992). Con dos
 * medidas no hace falta.
 * @param {ReturnType<typeof anovaMedidasRepetidas>['esfericidad']} esf
 * @returns {'ninguna' | 'gg' | 'hf'}
 */
export function elegirCorreccion(esf) {
    if (!esf) return 'ninguna';
    if (Number.isFinite(esf.pValor) && esf.pValor > ALFA_SUPUESTOS) return 'ninguna';
    return esf.gg > 0.75 && Number.isFinite(esf.hf) ? 'hf' : 'gg';
}

/**
 * Los residuos del modelo aditivo de medidas repetidas: yᵢⱼ − ȳᵢ· − ȳ·ⱼ + ȳ·· (con grupos, las medias de las medidas y la
 * media total son las del grupo de cada caso). Son lo que el ANOVA supone normal.
 * @param {number[][]} Y
 * @param {number[] | null} grupos
 * @returns {number[]}
 */
export function residuosAditivos(Y, grupos = null) {
    const k = /** @type {number[]} */ (Y[0]).length, g = grupos ? Math.max(...grupos) + 1 : 1;
    const de = (/** @type {number} */ i) => (grupos ? /** @type {number} */ (grupos[i]) : 0);
    const mCol = Array.from({ length: g }, (_, a) => Array.from({ length: k }, (_, j) => media(Y.filter((_, i) => de(i) === a).map(f => /** @type {number} */ (f[j])))));
    const mTot = mCol.map(m => media(m));
    /** @type {number[]} */ const r = [];
    Y.forEach((f, i) => { const a = de(i), mf = media(f); f.forEach((y, j) => r.push(y - mf - /** @type {number} */ (/** @type {number[]} */ (mCol[a])[j]) + /** @type {number} */ (mTot[a]))); });
    return r;
}

/**
 * Los intervalos de confianza de las medias de las medidas para un gráfico de perfil, los «intra sujetos» de Cousineau (2005)
 * con la corrección de Morey (2008): sin la variación entre personas, que no cuenta en la comparación de las medidas (con
 * grupos, dentro de cada grupo). Su semiamplitud: t(n − 1)·DE(yᵢⱼ − ȳᵢ· + ȳ··)/√n·√(k/(k − 1)).
 * @param {number[][]} Y
 * @param {number} [nivel]
 * @returns {{ media: number, inferior: number, superior: number }[]}
 */
export function intervalosIntraSujetos(Y, nivel = 0.95) {
    const n = Y.length, k = /** @type {number[]} */ (Y[0]).length, mTot = media(Y.map(f => media(f)));
    const norm = Y.map(f => { const mf = media(f); return f.map(y => y - mf + mTot); });
    const t = n > 1 ? cuantilT(1 - (1 - nivel) / 2, n - 1) : NaN, morey = Math.sqrt(k / (k - 1));
    return Array.from({ length: k }, (_, j) => {
        const col = Y.map(f => /** @type {number} */ (f[j])), m = media(col);
        const se = desviacion(norm.map(f => /** @type {number} */ (f[j]))) / Math.sqrt(n) * morey;
        return { media: m, inferior: m - t * se, superior: m + t * se };
    });
}

/**
 * Los descriptivos de cada medida: n, media, DE, mediana, cuartiles, mínimo y máximo.
 * @param {number[][]} Y
 */
export function descriptivosMedidas(Y) {
    const k = /** @type {number[]} */ (Y[0]).length;
    return Array.from({ length: k }, (_, j) => {
        const v = Y.map(f => /** @type {number} */ (f[j])), o = Float64Array.from(v).sort();
        return { n: v.length, media: media(v), de: v.length > 1 ? desviacion(v) : NaN, mediana: mediana(v), q1: cuantilOrdenado(o, 0.25), q3: cuantilOrdenado(o, 0.75), min: /** @type {number} */ (o[0]), max: /** @type {number} */ (o[o.length - 1]) };
    });
}

/**
 * ¿Son dicotómicas las medidas? Dos valores distintos en total (0/1, 1/2, sí/no ya codificado): el menor pasa a 0 y el mayor
 * a 1. null si no.
 * @param {number[][]} Y
 * @returns {{ cero: number, uno: number } | null}
 */
export function detectarDicotomicas(Y) {
    const vistos = new Set();
    for (const f of Y) for (const y of f) { vistos.add(y); if (vistos.size > 2) return null; }
    if (vistos.size !== 2) return null;
    const [a, b] = [...vistos].sort((x, y) => x - y);
    return { cero: /** @type {number} */ (a), uno: /** @type {number} */ (b) };
}

/**
 * El intervalo de la biserial de rangos de Wilcoxon por la transformación z de Fisher con su error típico bajo la hipótesis
 * nula, √(n(n + 1)(2n + 1)/6)/(n(n + 1)/2) (el de effectsize de R). Con todas las diferencias del mismo signo (r = ±1) no se
 * puede estimar: null.
 * @param {number} r
 * @param {number} n las diferencias no nulas
 * @param {number} [nivel]
 * @returns {{ inferior: number, superior: number } | null}
 */
export function intervaloBiserialRangos(r, n, nivel = 0.95) {
    if (!(n > 0) || !(Math.abs(r) < 1)) return null;
    const ee = Math.sqrt(n * (n + 1) * (2 * n + 1) / 6) / (n * (n + 1) / 2), z = cuantilNormal(1 - (1 - nivel) / 2), c = Math.atanh(r);
    return { inferior: Math.tanh(c - z * ee), superior: Math.tanh(c + z * ee) };
}

/**
 * La F, los gl y el p de un efecto intra sujetos con la corrección elegida.
 * @param {{ F: number, gl1: number, gl2: number, pValor: number, correcciones: Record<string, { epsilon: number, gl1: number, gl2: number, pValor: number }> | null }} efecto
 * @param {'ninguna' | 'gg' | 'hf'} correccion
 */
function conCorreccion(efecto, correccion) {
    const c = correccion !== 'ninguna' && efecto.correcciones ? efecto.correcciones[correccion] : null;
    return c ? { F: efecto.F, gl1: c.gl1, gl2: c.gl2, pValor: c.pValor, epsilon: c.epsilon } : { F: efecto.F, gl1: efecto.gl1, gl2: efecto.gl2, pValor: efecto.pValor, epsilon: 1 };
}

/**
 * El tamaño del efecto η² parcial de un efecto con su intervalo (por la F no central con los gl de la prueba informada).
 * @param {number} eta2p
 * @param {{ F: number, gl1: number, gl2: number }} prueba
 * @param {number} nivel
 */
function eta2pConIntervalo(eta2p, prueba, nivel) {
    const ic = Number.isFinite(prueba.F) ? intervaloEta2(prueba.F, prueba.gl1, prueba.gl2, nivel) : { inferior: NaN, superior: NaN };
    return { clave: 'eta2p', valor: eta2p, inferior: ic.inferior, superior: ic.superior, nivel };
}

/**
 * (2027.01.20, revisión) Sin error intra sujetos (la SC del error es 0: todas las personas cambian exactamente lo mismo entre
 * las medidas, o ninguna cambia), el ANOVA no tiene con qué contrastar y la normalidad de unos residuos nulos no dice nada:
 * se para con lo que pasa (antes, una F del redondeo de 10¹⁶, o «F(NaN, NaN)»).
 * @param {number} scError
 * @param {number} scEfectos la SC de las medidas (y de la interacción)
 * @param {boolean} [conGrupos] el diseño mixto (el cambio es el mismo dentro de cada grupo)
 */
function sinErrorIntra(scError, scEfectos, conGrupos = false) {
    if (scError > 0) return;
    if (!(scEfectos > 0)) throw new Error('Ninguna persona cambia entre las medidas: cada una puntúa igual en todas, y no hay diferencias que contrastar.');
    throw new Error(`${conGrupos ? 'Dentro de cada grupo, todas' : 'Todas'} las personas cambian exactamente lo mismo entre las medidas: sin variación en el cambio, la prueba no tiene error con el que contrastar (la diferencia es perfecta). ¿Alguna medida se calculó a partir de otra?`);
}

/**
 * (2027.01.20, revisión) Los avisos de la esfericidad que no se pudo contrastar: por los pocos casos (la W de Mauchly es 0 por
 * construcción) o por una matriz singular (alguna diferencia entre medidas no varía o es combinación exacta de otras). Antes,
 * los dos decían «con menos personas que medidas».
 * @param {ReturnType<typeof anovaMedidasRepetidas>['esfericidad']} esf
 * @param {string[]} avisos
 * @param {string} pocos la frase de los pocos casos
 */
function avisosEsfericidad(esf, avisos, pocos) {
    if (!esf) return;
    if (esf.singular) avisos.push('Alguna diferencia entre las medidas no varía (o es una combinación exacta de otras): la matriz de covarianzas es singular, la esfericidad no se cumple (W = 0) y se aplica la corrección. Conviene revisar los datos (¿una medida calculada a partir de otras?).');
    else if (!Number.isFinite(esf.pValor)) avisos.push(`${pocos}, la esfericidad no se puede contrastar (la W de Mauchly es 0 por construcción): se aplica la corrección por si acaso.`);
}

/**
 * El protocolo completo de un conjunto de medidas relacionadas, sobre los casos completos.
 * @param {number[][]} Y n casos × k medidas (sin perdidos; k de 2 a MAX_MEDIDAS)
 * @param {{ alfa?: number, nivel?: number, grupos?: number[] | null }} [opciones] alfa: el del estudio (0.05); nivel: el de
 *   los intervalos (0.95); grupos: el grupo de cada caso, de 0 a g − 1, para el diseño mixto
 */
export function protocoloRelacionadas(Y, { alfa = 0.05, nivel = 0.95, grupos = null } = {}) {
    const n = Y.length, k = n ? /** @type {number[]} */ (Y[0]).length : 0;
    if (k < 2) throw new Error('Hacen falta al menos dos medidas de las mismas personas.');
    if (k > MAX_MEDIDAS) throw new Error(`Se analizan hasta ${MAX_MEDIDAS} medidas a la vez.`);
    if (n < MIN_CASOS) throw new Error(`Hacen falta al menos ${MIN_CASOS} personas con todas las medidas.`);
    /** @type {string[]} */ const avisos = [];
    const col = (/** @type {number} */ j) => Y.map(f => /** @type {number} */ (f[j]));
    const descriptivos = descriptivosMedidas(Y);
    const perfil = intervalosIntraSujetos(Y, nivel);

    // ---- diseño mixto: un factor entre sujetos ----
    if (grupos) {
        const g = Math.max(...grupos) + 1, ns = Array.from({ length: g }, (_, a) => grupos.filter(x => x === a).length);
        if (g < 2) throw new Error('El factor entre sujetos necesita al menos dos grupos con casos.');
        if (ns.some(x => x < MIN_CASOS)) throw new Error(`Cada grupo necesita al menos ${MIN_CASOS} personas con todas las medidas.`);
        const R = anovaMixta(Y, grupos);
        sinErrorIntra(R.error.intra, R.medidas.sc + R.interaccion.sc, true);
        const normalidad = pruebaNormalidad(residuosAditivos(Y, grupos));
        const correccion = elegirCorreccion(R.esfericidad);
        avisosEsfericidad(R.esfericidad, avisos, `Con ${n} personas en ${g} grupos (N − g = ${n - g}, menos que las ${k - 1} diferencias entre medidas)`);
        const medidas = conCorreccion(R.medidas, correccion), interaccion = conCorreccion(R.interaccion, correccion);
        const sigInter = interaccion.pValor < alfa, sigMedidas = medidas.pValor < alfa, sigGrupo = R.grupo.pValor < alfa;
        const porGrupo = Array.from({ length: g }, (_, a) => Y.filter((_, i) => grupos[i] === a));
        if (detectarDicotomicas(Y)) avisos.push('Las medidas son dicotómicas: el ANOVA mixto sobre 0 y 1 es solo una aproximación (lo indicado sería un modelo logístico de efectos mixtos).');
        if (!normalidad.normal) avisos.push('Los residuos no siguen una distribución normal: el ANOVA mixto es robusto con grupos de tamaño parecido y n moderado, pero conviene leer los p con cautela.');
        if (R.box && R.box.pValor < 0.001) avisos.push('La M de Box rechaza la igualdad de las matrices de covarianzas (p < .001, el criterio habitual por su sensibilidad): con grupos de tamaños distintos, las pruebas de la interacción pueden perder calibración.');
        if (R.leveneMedidas.some(l => l.pValor <= ALFA_SUPUESTOS)) avisos.push('Levene rechaza la igualdad de varianzas entre los grupos en alguna medida: el efecto del grupo y los efectos simples entre grupos deben leerse con cautela.');
        /** @type {any} */ let simples = null;
        if (sigInter) {
            // las medidas dentro de cada grupo (su propio ANOVA de medidas repetidas, con su corrección) y los grupos en cada
            // medida (el protocolo de grupos independientes), con Holm en cada familia
            const dentro = porGrupo.map(Yg => { const r = anovaMedidasRepetidas(Yg), c = elegirCorreccion(r.esfericidad); return { r, correccion: c, prueba: conCorreccion(r, c) }; });
            const holmD = ajustarHolm(dentro.map(d => d.prueba.pValor));
            const entre = Array.from({ length: k }, (_, j) => protocoloGrupos(porGrupo.map(Yg => Yg.map(f => /** @type {number} */ (f[j]))), { alfa }));
            const holmE = ajustarHolm(entre.map(e => e.global.pValor));
            simples = {
                medidasEnGrupos: dentro.map((d, a) => ({ ...d, pHolm: /** @type {number} */ (holmD[a]), significativa: /** @type {number} */ (holmD[a]) < alfa })),
                gruposEnMedidas: entre.map((e, j) => ({ protocolo: e, pHolm: /** @type {number} */ (holmE[j]), significativa: /** @type {number} */ (holmE[j]) < alfa }))
            };
        }
        return {
            diseno: /** @type {const} */ ('mixto'), prueba: /** @type {ClavePruebaRelacionadas} */ ('anova-mixta'), rama: /** @type {const} */ ('parametrica'),
            n, k, g, ns, dicotomica: null, normalidad, sobre: 'residuos', global: R, correccion, esfericidad: R.esfericidad,
            efectos: {
                grupo: { prueba: { F: R.grupo.F, gl1: R.grupo.gl1, gl2: R.grupo.gl2, pValor: R.grupo.pValor, epsilon: 1 }, significativa: sigGrupo, eta2p: eta2pConIntervalo(R.grupo.eta2p, R.grupo, nivel), eta2G: R.grupo.eta2G },
                medidas: { prueba: medidas, significativa: sigMedidas, eta2p: eta2pConIntervalo(R.medidas.eta2p, medidas, nivel), eta2G: R.medidas.eta2G },
                interaccion: { prueba: interaccion, significativa: sigInter, eta2p: eta2pConIntervalo(R.interaccion.eta2p, interaccion, nivel), eta2G: R.interaccion.eta2G }
            },
            significativa: sigInter || sigMedidas || sigGrupo,
            // sin interacción: los pares de las medidas (con todos los casos) y, con tres o más grupos, los de los grupos
            postHoc: !sigInter && sigMedidas && k >= 3 ? { metodo: 'tpareada', nombre: NOMBRE_PARES.tpareada, ajuste: 'Holm', pares: paresRelacionadosHolm(Y, 'tpareada', { alfa }) } : null,
            postHocGrupos: !sigInter && sigGrupo && g >= 3 ? { metodo: 'mce', ajuste: 'Holm', pares: postHocHolm(porGrupo.map(Yg => Yg.map(f => media(f))), 'mce', { alfa }) } : null,
            simples, descriptivos, descriptivosPorGrupo: porGrupo.map(Yg => descriptivosMedidas(Yg)),
            perfil, perfilPorGrupo: porGrupo.map(Yg => intervalosIntraSujetos(Yg, nivel)), avisos, alfa, nivel
        };
    }

    // ---- medidas dicotómicas ----
    const dic = detectarDicotomicas(Y);
    if (dic) {
        const B = Y.map(f => f.map(y => (y === dic.uno ? 1 : 0)));
        if (k === 2) {
            // n10: los que pasan de 0 a 1 (la segunda en 1 y la primera en 0); la razón de odds, la de pasar a 1 frente a pasar a 0
            const r = mcnemar(B.map(f => /** @type {number} */ (f[1])), B.map(f => /** @type {number} */ (f[0])), { nivel });
            if (r.discordantes === 0) avisos.push('Nadie cambió de una medida a la otra: McNemar no tiene con qué contrastar (p = 1).');
            return {
                diseno: /** @type {const} */ ('dos'), prueba: /** @type {ClavePruebaRelacionadas} */ ('mcnemar'), rama: /** @type {const} */ ('dicotomica'), n, k, dicotomica: dic,
                normalidad: null, global: r, sensibilidad: null, significativa: r.pValor < alfa,
                efecto: { clave: 'or', valor: r.oddsRatio, inferior: r.icOddsRatio[0], superior: r.icOddsRatio[1], nivel, g: r.gCohen },
                postHoc: null, descriptivos, perfil, proporciones: [media(B.map(f => /** @type {number} */ (f[0]))), media(B.map(f => /** @type {number} */ (f[1])))], avisos, alfa, nivel
            };
        }
        const r = cochranQ(B), sig = r.pValor < alfa;
        if (!(r.denominador > 0)) avisos.push('Nadie cambió entre las medidas: la Q de Cochran no tiene con qué contrastar (p = 1).');
        return {
            diseno: /** @type {const} */ ('varias'), prueba: /** @type {ClavePruebaRelacionadas} */ ('cochran'), rama: /** @type {const} */ ('dicotomica'), n, k, dicotomica: dic,
            normalidad: null, global: r, sensibilidad: null, significativa: sig, efecto: { clave: 'eta2Q', valor: r.eta2Q, inferior: NaN, superior: NaN, nivel },
            postHoc: sig ? { metodo: 'mcnemar', nombre: NOMBRE_PARES.mcnemar, ajuste: 'Holm', pares: paresRelacionadosHolm(B, 'mcnemar', { alfa }) } : null,
            descriptivos, perfil, proporciones: r.proporciones, avisos, alfa, nivel
        };
    }

    // ---- dos medidas ----
    if (k === 2) {
        // el cambio de la primera medida a la segunda: diferencias segunda − primera (positivas si aumenta)
        const a = col(0), b = col(1), d = b.map((x, i) => x - /** @type {number} */ (a[i]));
        const normalidad = pruebaNormalidad(d), t = tPareada(b, a, { nivel }), w = wilcoxon(b, a);
        const icDz = Number.isFinite(t.t) ? intervaloDz(t.t, n, nivel) : { inferior: NaN, superior: NaN };
        const icRbc = intervaloBiserialRangos(w.rbc, w.n, nivel);
        // la d_av de Lakens (2013): la diferencia de medias entre la media de las dos DE, comparable con la d de dos grupos
        const sdMedia = (desviacion(a) + desviacion(b)) / 2;
        const efectoT = { clave: 'dz', valor: t.dz, inferior: icDz.inferior, superior: icDz.superior, nivel, dav: sdMedia > 0 ? t.mediaDiferencia / sdMedia : NaN };
        const efectoW = { clave: 'rbc', valor: w.rbc, inferior: icRbc ? icRbc.inferior : NaN, superior: icRbc ? icRbc.superior : NaN, nivel };
        const param = normalidad.normal;
        if (!(t.deDiferencia > 0)) avisos.push(t.mediaDiferencia === 0 ? 'Las dos medidas son iguales en todas las personas: no hay diferencia que contrastar.' : 'Todas las personas cambian exactamente lo mismo: la diferencia es perfecta (t infinita).');
        if (w.empates) avisos.push(`${w.empates} persona(s) con la misma puntuación en las dos medidas: Wilcoxon las deja fuera (n = ${w.n}), como SPSS.`);
        return {
            diseno: /** @type {const} */ ('dos'), prueba: /** @type {ClavePruebaRelacionadas} */ (param ? 't-pareada' : 'wilcoxon'), rama: /** @type {'parametrica' | 'noparametrica'} */ (param ? 'parametrica' : 'noparametrica'),
            n, k, dicotomica: null, normalidad, sobre: 'diferencias',
            global: param ? t : w, sensibilidad: param ? { prueba: 'wilcoxon', resultado: w, efecto: efectoW } : { prueba: 't-pareada', resultado: t, efecto: efectoT },
            significativa: (param ? t.pValor : w.pValor) < alfa, efecto: param ? efectoT : efectoW,
            postHoc: null, descriptivos, perfil, avisos, alfa, nivel
        };
    }

    // ---- tres o más medidas ----
    const rm = anovaMedidasRepetidas(Y);
    sinErrorIntra(rm.sc.error, rm.sc.medidas);
    const fr = friedman(Y), normalidad = pruebaNormalidad(residuosAditivos(Y));
    const correccion = elegirCorreccion(rm.esfericidad), prueba = conCorreccion(rm, correccion);
    const param = normalidad.normal;
    const efectoRM = { ...eta2pConIntervalo(rm.eta2p, prueba, nivel), eta2G: rm.eta2G };
    const efectoFr = { clave: 'W', valor: fr.W, inferior: NaN, superior: NaN, nivel };
    const pGlobal = param ? prueba.pValor : fr.pValor, sig = pGlobal < alfa;
    avisosEsfericidad(rm.esfericidad, avisos, `Con menos personas (${n}) que medidas (${k})`);
    return {
        diseno: /** @type {const} */ ('varias'), prueba: /** @type {ClavePruebaRelacionadas} */ (param ? 'anova-rm' : 'friedman'), rama: /** @type {'parametrica' | 'noparametrica'} */ (param ? 'parametrica' : 'noparametrica'),
        n, k, dicotomica: null, normalidad, sobre: 'residuos', esfericidad: rm.esfericidad, correccion,
        global: param ? { ...rm, prueba } : fr,
        sensibilidad: param ? { prueba: 'friedman', resultado: fr, efecto: efectoFr } : { prueba: 'anova-rm', resultado: { ...rm, prueba }, efecto: efectoRM },
        significativa: sig, efecto: param ? efectoRM : efectoFr,
        postHoc: sig ? (param ? { metodo: 'tpareada', nombre: NOMBRE_PARES.tpareada, ajuste: 'Holm', pares: paresRelacionadosHolm(Y, 'tpareada', { alfa }) }
            : { metodo: 'wilcoxon', nombre: NOMBRE_PARES.wilcoxon, ajuste: 'Holm', pares: paresRelacionadosHolm(Y, 'wilcoxon', { alfa }) }) : null,
        descriptivos, perfil, avisos, alfa, nivel
    };
}
