// @ts-check
// analizador/relacionadas/redaccion.js — (2027.01.17) lo que se escribe de un análisis de medidas repetidas: las tablas (los
// descriptivos, los supuestos, la prueba, las comparaciones por pares y los efectos simples), la redacción APA 7 para la
// tesis, los porqués del protocolo, las referencias y el documento de Word. Sobre el resultado de
// core/stats/protocolo-relacionadas.js; sin DOM (el Word se arma aquí y lo descarga la tarjeta).
import { NOMBRE_PRUEBA, NOMBRE_PARES } from '../../core/stats/protocolo-relacionadas.js';
import { formatoP, pConSigno, numeroConMenos, formatoMitades } from '../../shared/formato-numero.js';
import { magnitudD, magnitudR, magnitudEta2, magnitudGCohen } from '../motor/magnitudes.js';
import { referenciasDe } from '../informe/referencias-apa.js';
import { tituloWord, subtituloWord, parrafoWord, tablaWord, figuraWord, referenciasWord, documentoWord as envolverDocumento } from '../informe/word-apa.js';
import { listaY, conjuncionY } from '../../shared/texto-es.js';

/** @typedef {ReturnType<typeof import('../../core/stats/protocolo-relacionadas.js').protocoloRelacionadas>} ResultadoRelacionadas */
/** @typedef {{ que: string, nombres: string[], factor?: string | null, niveles?: string[], excluidos?: number }} Contexto */
/** @typedef {{ titulo: string, cabecera: string[], filas: string[][], nota: string, negritas?: Set<number> }} Tabla */

// ---------- formatos ----------
/** Un número con el signo menos tipográfico. @param {number} v @param {number} [d] */
const fx = (v, d = 2) => numeroConMenos(v, d);
/** Un coeficiente acotado (η², W, r, g) sin el cero inicial, como pide APA: «.45», «−.30». @param {number} v @param {number} [d] */
const fc = (v, d = 2) => (Number.isFinite(v) ? numeroConMenos(v, d).replace(/^(−?)0\./, '$1.') : '—');
/** Un intervalo «[a, b]». @param {number} a @param {number} b @param {(v: number) => string} f */
const ic = (a, b, f) => (Number.isFinite(a) && Number.isFinite(b) ? `[${f(a)}, ${f(b)}]` : '—');
/** Unos grados de libertad: enteros tal cual, fraccionarios (corregidos) con dos decimales. @param {number} g */
const fgl = g => (Number.isInteger(g) ? String(g) : g.toFixed(2));
/** Un porcentaje con un decimal. @param {number} p */
const pct = p => `${(100 * p).toFixed(1)} %`;
/** El nivel de confianza en texto: «95 %». @param {number} nivel */
const nivelTxt = nivel => `${Math.round(100 * nivel)} %`;
/** El α en texto, sin el cero: «.05». @param {number} a */
const alfaTxt = a => String(a).replace(/^0\./, '.');

/** El nombre de cada corrección de la esfericidad. */
const NOMBRE_CORRECCION = Object.freeze({ ninguna: 'Esfericidad asumida', gg: 'Greenhouse-Geisser', hf: 'Huynh-Feldt', lb: 'Límite inferior' });
/** El nombre de cada prueba de grupos independientes (los efectos simples entre grupos). */
const NOMBRE_GRUPOS = Object.freeze({ student: 't de Student', welch: 't de Welch', 'mann-whitney': 'U de Mann-Whitney', anova: 'ANOVA de un factor', 'anova-welch': 'ANOVA de Welch', 'kruskal-wallis': 'Kruskal-Wallis' });

/**
 * La magnitud del tamaño del efecto de la prueba elegida (Cohen, 1988): d para la dz; r para la biserial de rangos, la W de
 * Kendall y la η²_Q (la W de unas medidas dicotómicas); η² para la parcial; la g de Cohen de McNemar con .05, .15 y .25.
 * @param {string} clave
 * @param {number} v
 */
export function magnitudDe(clave, v) {
    if (clave === 'dz') return magnitudD(v);
    if (clave === 'eta2p') return magnitudEta2(v);
    if (clave === 'g') return magnitudGCohen(v);
    return magnitudR(v);
}

/**
 * (2027.01.20, revisión) La prueba de Mauchly en una frase: «W = .812, χ²(2) = 4.10, p = .129»; con la matriz singular (alguna
 * diferencia entre medidas no varía), «W = 0 (la matriz de covarianzas de las diferencias es singular), p < .001».
 * @param {any} E
 */
const mauchlyTxt = E => (E.singular ? `W = 0 (la matriz de covarianzas de las diferencias es singular), p ${pConSigno(E.pValor)}` : `W = ${fc(E.W, 3)}, χ²(${fgl(E.gl)}) = ${fx(E.chi2)}, p ${pConSigno(E.pValor)}`);

/** El nombre del par «T1 → T2». @param {string[]} nombres @param {{ i: number, j: number }} p */
const nombrePar = (nombres, p) => `${nombres[p.i]} → ${nombres[p.j]}`;

// ---------- tablas ----------
/**
 * Los descriptivos de cada medida (y de cada grupo): n, M, DE, Mdn y el intervalo intra sujetos de la media; con medidas
 * dicotómicas, la proporción de unos; con Friedman, el rango medio.
 * @param {ResultadoRelacionadas} P
 * @param {Contexto} ctx
 * @returns {Tabla}
 */
export function tablaDescriptivos(P, ctx) {
    const R = /** @type {any} */ (P), niv = nivelTxt(P.nivel);
    if (R.dicotomica) {
        const uno = R.dicotomica.uno;
        return {
            titulo: `Proporción de ${ctx.que} = ${uno} en cada medida`, cabecera: ['Medida', 'n', `Proporción de ${uno}`],
            filas: ctx.nombres.map((nom, j) => [nom, String(P.n), pct(/** @type {number} */ (R.proporciones[j]))]),
            nota: `Las medidas tienen dos valores: ${R.dicotomica.cero} (0) ${conjuncionY(uno)} ${uno} (1).`
        };
    }
    if (R.diseno === 'mixto') {
        const niveles = ctx.niveles || [];
        return {
            titulo: `Descriptivos de ${ctx.que} por grupo y medida`, cabecera: [ctx.factor || 'Grupo', 'Medida', 'n', 'M', 'DE', `IC ${niv} intra sujetos`],
            filas: R.descriptivosPorGrupo.flatMap((/** @type {any[]} */ ds, /** @type {number} */ a) => ds.map((d, j) => [j === 0 ? (niveles[a] || `Grupo ${a + 1}`) : '', /** @type {string} */ (ctx.nombres[j]), String(d.n), fx(d.media), fx(d.de), ic(R.perfilPorGrupo[a][j].inferior, R.perfilPorGrupo[a][j].superior, v => fx(v))])),
            nota: `IC intra sujetos: el de Cousineau (2005) con la corrección de Morey (2008), dentro de cada grupo; sirve para comparar las medidas entre sí, no los grupos.`
        };
    }
    const conRangos = R.prueba === 'friedman' || (R.sensibilidad && R.sensibilidad.prueba === 'friedman');
    const rangos = conRangos ? (R.prueba === 'friedman' ? R.global : R.sensibilidad.resultado).rangosMedios : null;
    return {
        titulo: `Descriptivos de ${ctx.que} en cada medida`,
        cabecera: ['Medida', 'n', 'M', 'DE', 'Mdn', 'RIC', `IC ${niv} intra sujetos`, ...(rangos ? ['Rango medio'] : [])],
        filas: R.descriptivos.map((/** @type {any} */ d, /** @type {number} */ j) => [/** @type {string} */ (ctx.nombres[j]), String(d.n), fx(d.media), fx(d.de), fx(d.mediana), fx(d.q3 - d.q1), ic(R.perfil[j].inferior, R.perfil[j].superior, v => fx(v)), ...(rangos ? [fx(rangos[j])] : [])]),
        nota: `RIC: rango intercuartílico. IC intra sujetos: el de Cousineau (2005) con la corrección de Morey (2008), sin la variación entre personas; es el que sirve para comparar las medidas entre sí.${rangos ? ' Rango medio: el de cada medida dentro de cada persona (Friedman).' : ''}`
    };
}

/**
 * Los supuestos que se contrastaron y lo que se decidió con cada uno.
 * @param {ResultadoRelacionadas} P
 * @param {Contexto} ctx
 * @returns {Tabla | null} null con medidas dicotómicas (sus pruebas no tienen supuestos de forma)
 */
export function tablaSupuestos(P, ctx) {
    const R = /** @type {any} */ (P);
    if (R.dicotomica || !R.normalidad) return null;
    /** @type {string[][]} */ const filas = [];
    const N = R.normalidad, sobre = R.sobre === 'diferencias' ? `Normalidad de las diferencias (${ctx.nombres[1]} − ${ctx.nombres[0]})` : 'Normalidad de los residuos del modelo';
    const decisionNormal = R.diseno === 'mixto' ? (N.normal ? 'Se cumple' : 'No se cumple: leer con cautela') : (N.normal ? 'Se cumple: prueba paramétrica' : 'No se cumple: prueba no paramétrica');
    filas.push([sobre, N.abreviatura, `${N.abreviatura === 'Shapiro-Wilk' ? 'W' : 'D'} = ${fc(N.estadistico, 3)}`, formatoP(N.pValor), decisionNormal]);
    const E = R.esfericidad;
    if (E) {
        const cumple = Number.isFinite(E.pValor) && E.pValor > 0.05;
        const enComprobacion = R.prueba === 'friedman' ? ' (en el ANOVA de comprobación)' : '';
        const decision = !Number.isFinite(E.pValor) ? `No se puede contrastar: corrección de ${NOMBRE_CORRECCION[/** @type {'gg'} */ (R.correccion)]}${enComprobacion}`
            : cumple ? `Se cumple: sin corrección${enComprobacion}` : `No se cumple: corrección de ${NOMBRE_CORRECCION[/** @type {'gg'} */ (R.correccion)]}${enComprobacion}`;
        filas.push(['Esfericidad', 'W de Mauchly', E.singular ? 'W = 0 (matriz singular)' : Number.isFinite(E.chi2) ? `W = ${fc(E.W, 3)}, χ²(${fgl(E.gl)}) = ${fx(E.chi2)}` : `W = ${fc(E.W, 3)}`, formatoP(E.pValor), decision]);
    }
    if (R.diseno === 'mixto') {
        R.global.leveneMedidas.forEach((/** @type {any} */ l, /** @type {number} */ j) => filas.push([`Igualdad de varianzas entre grupos en ${ctx.nombres[j]}`, 'Levene', `F(${fgl(l.gl1)}, ${fgl(l.gl2)}) = ${fx(l.F)}`, formatoP(l.pValor), l.pValor > 0.05 ? 'Se cumple' : 'No se cumple']));
        const B = R.global.box;
        filas.push(['Igualdad de las matrices de covarianzas', 'M de Box', B ? `M = ${fx(B.M)}, F(${fgl(B.gl1)}, ${fgl(B.gl2)}) = ${fx(B.F)}` : 'No se puede calcular', B ? formatoP(B.pValor) : '—', B ? (B.pValor >= 0.001 ? 'Se cumple (criterio p < .001)' : 'No se cumple (p < .001)') : 'Algún grupo tiene tantos casos como medidas o menos']);
    }
    // (2027.01.20, revisión) cada prueba con su cita (la de la normalidad, la que se usó), y Lecoutre solo con varios grupos
    const mixto = R.diseno === 'mixto';
    const normalidad = N.abreviatura === 'Shapiro-Wilk'
        ? 'La normalidad, con la prueba de Shapiro y Wilk (1965), la que se usa con menos de 50 valores (con 50 o más, la de Kolmogorov-Smirnov con la corrección de Lilliefors), a .05.'
        : 'La normalidad, con la prueba de Kolmogorov-Smirnov con la corrección de Lilliefors (1967), la que se usa con 50 valores o más (con menos, la de Shapiro-Wilk), a .05.';
    const ε = E ? ` ε de Greenhouse y Geisser (1959) = ${fc(E.gg, 3)}; de Huynh y Feldt (1976) = ${Number.isFinite(E.hf) ? fc(E.hf, 3) : '—'}${mixto ? ' (con la corrección de Lecoutre, 1991, para varios grupos)' : ''}; límite inferior = ${fc(E.lb, 3)}. La corrección se aplica si la prueba de Mauchly (1940) rechaza la esfericidad: la de Huynh-Feldt con ε de Greenhouse-Geisser > .75 y la de Greenhouse-Geisser si no (Girden, 1992).` : '';
    const homogeneidad = mixto ? ' La igualdad de varianzas entre los grupos, con la prueba de Levene (1960) en cada medida; la de las matrices de covarianzas, con la M de Box (1949), que se juzga a .001 por su sensibilidad a la falta de normalidad.' : '';
    return {
        titulo: 'Contraste de los supuestos', cabecera: ['Supuesto', 'Prueba', 'Estadístico', 'p', 'Decisión'], filas,
        nota: `${normalidad}${ε}${homogeneidad}`
    };
}

/**
 * La tabla de la prueba elegida.
 * @param {ResultadoRelacionadas} P
 * @param {Contexto} ctx
 * @returns {Tabla}
 */
export function tablaPrueba(P, ctx) {
    const R = /** @type {any} */ (P), G = R.global, niv = nivelTxt(R.nivel), e = R.efecto, [n1, n2] = ctx.nombres;
    switch (R.prueba) {
        case 't-pareada': {
            const W = R.sensibilidad.resultado;
            return {
                titulo: `${NOMBRE_PRUEBA['t-pareada']}: ${ctx.que}, ${n2} − ${n1}`, cabecera: ['M dif.', 'DE dif.', `IC ${niv}`, 't', 'gl', 'p', `dz [IC ${niv}]`],
                filas: [[fx(G.mediaDiferencia), fx(G.deDiferencia), ic(G.ic[0], G.ic[1], v => fx(v)), fx(G.t), String(G.gl), formatoP(G.pValor, { alfa: R.alfa }), `${fx(e.valor)} ${ic(e.inferior, e.superior, v => fx(v))}`]],
                nota: `M dif.: la media del cambio de ${n1} a ${n2} (positiva si aumenta). dz: la media de las diferencias entre su DE; intervalo por la t no central (Steiger y Fouladi, 1997). d_av = ${fx(e.dav)} (Lakens, 2013), comparable con la d de dos grupos. Sensibilidad: la prueba de Wilcoxon (1945), z = ${fx(W.z)}, p ${pConSigno(W.pValor, { alfa: R.alfa })}.`
            };
        }
        case 'wilcoxon': {
            const T = R.sensibilidad.resultado;
            return {
                titulo: `${NOMBRE_PRUEBA.wilcoxon}: ${ctx.que}, ${n2} − ${n1}`, cabecera: ['Aumentan', 'Disminuyen', 'Empates', 'T₊', 'T₋', 'z', 'p', `r_rb [IC ${niv}]`],
                filas: [[String(G.positivos), String(G.negativos), String(G.empates), formatoMitades(G.Tmas), formatoMitades(G.Tmenos), fx(G.z), formatoP(G.pValor, { alfa: R.alfa }), `${fc(e.valor)} ${Number.isFinite(e.inferior) ? ic(e.inferior, e.superior, v => fc(v)) : '[no estimable]'}`]],
                nota: `Sin las personas con la misma puntuación en las dos medidas (empates), como SPSS; aproximación normal con la corrección de empates. r_rb: la correlación biserial de rangos para muestras relacionadas (Kerby, 2014), positiva si aumenta; intervalo por la z de Fisher (el de effectsize de R)${Number.isFinite(e.inferior) ? '' : ', no estimable con todas las diferencias del mismo signo'}. Sensibilidad: t(${T.gl}) = ${fx(T.t)}, p ${pConSigno(T.pValor, { alfa: R.alfa })}.`
            };
        }
        case 'anova-rm': {
            /** @type {[string, { epsilon: number, gl1: number, gl2: number, pValor: number }][]} */
            const filas = [['ninguna', { epsilon: 1, gl1: G.gl1, gl2: G.gl2, pValor: G.pValor }]], rm = G;
            if (rm.correcciones) for (const c of ['gg', 'hf', 'lb']) filas.push([c, rm.correcciones[c]]);
            const elegida = filas.findIndex(([c]) => c === R.correccion);
            return {
                titulo: `${NOMBRE_PRUEBA['anova-rm']}: ${ctx.que}`, cabecera: ['Corrección', 'ε', 'gl', 'gl error', 'F', 'p'],
                filas: filas.map(([c, x]) => [NOMBRE_CORRECCION[/** @type {'gg'} */ (c)], Number.isFinite(x.epsilon) ? fc(x.epsilon, 3) : '—', Number.isFinite(x.gl1) ? fgl(x.gl1) : '—', Number.isFinite(x.gl2) ? fgl(x.gl2) : '—', fx(rm.F), formatoP(x.pValor, { alfa: R.alfa })]),
                negritas: new Set([elegida]),
                nota: `En negrita, la que se informa. SC de las medidas = ${fx(rm.sc.medidas)}; SC del error = ${fx(rm.sc.error)}; SC de los sujetos = ${fx(rm.sc.sujetos)}. η²p = ${fc(e.valor)}, IC ${niv} ${ic(e.inferior, e.superior, v => fc(v))} (por la F no central con los gl informados; Steiger, 2004); η²G = ${fc(e.eta2G)} (Olejnik y Algina, 2003; Bakeman, 2005), la que se compara entre diseños. Sensibilidad: la prueba de Friedman (1937), χ²(${R.sensibilidad.resultado.gl}) = ${fx(R.sensibilidad.resultado.chi2)}, p ${pConSigno(R.sensibilidad.resultado.pValor, { alfa: R.alfa })}.`
            };
        }
        case 'friedman': {
            const rm = R.sensibilidad.resultado;
            return {
                titulo: `${NOMBRE_PRUEBA.friedman}: ${ctx.que}`, cabecera: ['χ²', 'gl', 'p', 'W de Kendall'],
                filas: [[fx(G.chi2), String(G.gl), formatoP(G.pValor, { alfa: R.alfa }), fc(G.W)]],
                nota: `Con la corrección de empates. W de Kendall (Kendall y Babington Smith, 1939) = χ²/(n(k − 1)), de 0 (ningún acuerdo en el orden de las medidas) a 1. Sensibilidad: ANOVA de medidas repetidas, F(${fgl(rm.prueba.gl1)}, ${fgl(rm.prueba.gl2)}) = ${fx(rm.F)}, p ${pConSigno(rm.prueba.pValor, { alfa: R.alfa })}.`
            };
        }
        case 'mcnemar': {
            const { cero, uno } = R.dicotomica;
            return {
                titulo: `${NOMBRE_PRUEBA.mcnemar}: ${ctx.que}, de ${n1} a ${n2}`, cabecera: [`${n1} \\ ${n2}`, String(cero), String(uno)],
                filas: [[String(cero), String(G.n00), String(G.n10)], [String(uno), String(G.n01), String(G.n11)]],
                nota: `Cambian ${G.discordantes}: ${G.n10} de ${cero} a ${uno} y ${G.n01} de ${uno} a ${cero}. p exacto (binomial) ${pConSigno(G.pValor, { alfa: R.alfa })}; χ² de McNemar con la corrección de Edwards = ${fx(G.chi2)}. Razón de odds del cambio (de ${cero} a ${uno} frente a de ${uno} a ${cero}) = ${fx(e.valor)}, IC ${niv} ${ic(e.inferior, e.superior, v => fx(v))} (exacto, de Clopper y Pearson, 1934); g de Cohen = ${fc(e.g)}.`
            };
        }
        case 'cochran':
            return {
                titulo: `${NOMBRE_PRUEBA.cochran}: ${ctx.que}`, cabecera: ['Q', 'gl', 'p', 'η²_Q'],
                filas: [[fx(G.Q), String(G.gl), formatoP(G.pValor, { alfa: R.alfa }), fc(G.eta2Q)]],
                nota: 'η²_Q = Q/(n(k − 1)) (Serlin et al., 1982): la W de Kendall de unas medidas dicotómicas.'
            };
        default: {
            const g = R.global, ef = R.efectos, mc = (/** @type {number} */ sc, /** @type {number} */ gl) => fx(sc / gl);
            const corr = R.correccion !== 'ninguna' ? ` (${NOMBRE_CORRECCION[/** @type {'gg'} */ (R.correccion)]})` : '';
            const fila = (/** @type {string} */ fuente, /** @type {number} */ sc, /** @type {any} */ x) => [fuente, fx(sc), fgl(x.prueba.gl1), mc(sc, x.prueba.gl1), fx(x.prueba.F), formatoP(x.prueba.pValor, { alfa: R.alfa }), `${fc(x.eta2p.valor)} ${ic(x.eta2p.inferior, x.eta2p.superior, v => fc(v))}`, fc(x.eta2G)];
            const glE = ef.medidas.prueba.gl2;
            return {
                titulo: `${NOMBRE_PRUEBA['anova-mixta']}: ${ctx.que} según ${ctx.factor || 'el grupo'} y la medida`,
                cabecera: ['Fuente', 'SC', 'gl', 'MC', 'F', 'p', `η²p [IC ${niv}]`, 'η²G'],
                filas: [
                    fila(ctx.factor || 'Grupo', g.grupo.sc, ef.grupo),
                    ['Error entre (sujetos en los grupos)', fx(g.error.sujetosEnGrupos), String(g.error.glSujetos), mc(g.error.sujetosEnGrupos, g.error.glSujetos), '', '', '', ''],
                    fila(`Medidas${corr}`, g.medidas.sc, ef.medidas),
                    fila(`Medidas × ${ctx.factor || 'grupo'}${corr}`, g.interaccion.sc, ef.interaccion),
                    [`Error intra${corr}`, fx(g.error.intra), fgl(glE), mc(g.error.intra, glE), '', '', '', '']
                ],
                nota: `Sumas de cuadrados de tipo III (las de SPSS). ${R.correccion !== 'ninguna' ? `Los gl de los efectos intra sujetos, con la corrección de ${NOMBRE_CORRECCION[/** @type {'gg'} */ (R.correccion)]} (ε = ${fc(ef.medidas.prueba.epsilon, 3)}). ` : ''}η²p con su intervalo por la F no central (Steiger, 2004); η²G, la generalizada (Olejnik y Algina, 2003; Bakeman, 2005), la que se compara entre diseños.`
            };
        }
    }
}

/** (2027.01.20, revisión) Lo que se hace con cada par, según la prueba (y lo que se cita de cada una). */
const PRUEBA_DE_CADA_PAR = Object.freeze({
    tpareada: 'Cada par, con su propia t para muestras relacionadas (con su propio error): no supone la esfericidad (Maxwell y Delaney, 2004).',
    wilcoxon: 'Cada par, con su propia prueba de Wilcoxon (1945): no depende de las demás medidas, como sí la comparación de los rangos medios de Friedman (Benavoli et al., 2016).',
    mcnemar: 'Cada par, con su propia prueba de McNemar (1947), por la binomial exacta: no depende de las demás medidas.'
});

/**
 * Las comparaciones por pares (Holm).
 * @param {ResultadoRelacionadas} P
 * @param {Contexto} ctx
 * @returns {Tabla | null}
 */
export function tablaPares(P, ctx) {
    const R = /** @type {any} */ (P), ph = R.postHoc;
    if (!ph) return null;
    const decision = (/** @type {any} */ p) => (p.significativa ? 'Significativa' : 'No significativa');
    const fp = (/** @type {number} */ p) => formatoP(p, { alfa: R.alfa });
    /** @type {[string[], (p: any) => string[]]} */
    const [cabecera, fila] = ph.metodo === 'tpareada' ? [['Par', 't', 'gl', 'p', 'p (Holm)', 'dz', 'Decisión'], p => [nombrePar(ctx.nombres, p), fx(p.estadistico), String(p.gl), fp(p.pValor), fp(p.pHolm), fx(p.efecto), decision(p)]]
        : ph.metodo === 'wilcoxon' ? [['Par', 'z', 'p', 'p (Holm)', 'r_rb', 'Decisión'], p => [nombrePar(ctx.nombres, p), fx(p.estadistico), fp(p.pValor), fp(p.pHolm), fc(p.efecto), decision(p)]]
        : [['Par', 'Δ proporción', 'p (exacto)', 'p (Holm)', 'Decisión'], p => [nombrePar(ctx.nombres, p), fc(p.efecto), fp(p.pValor), fp(p.pHolm), decision(p)]];
    return {
        titulo: `Comparaciones por pares de ${ctx.que} (${ph.nombre}, corrección de Holm)`, cabecera, filas: ph.pares.map(fila),
        nota: `${PRUEBA_DE_CADA_PAR[/** @type {'tpareada'} */ (ph.metodo)]} «A → B»: el cambio de A a B (el efecto es positivo si aumenta). Holm (1979) controla la probabilidad de algún falso positivo entre todos los pares.`
    };
}

/** El nombre de un grupo del factor entre sujetos. @param {Contexto} ctx @param {number} a */
const nombreGrupo = (ctx, a) => (ctx.niveles || [])[a] || `Grupo ${a + 1}`;

/**
 * (2027.01.20, revisión) Las comparaciones por pares entre los grupos del diseño mixto (sin interacción, con el efecto del
 * grupo significativo y tres o más grupos): la media de las medidas de cada persona, con la t del error entre sujetos del
 * ANOVA mixto y Holm. Antes se calculaban y no se informaban.
 * @param {ResultadoRelacionadas} P
 * @param {Contexto} ctx
 * @returns {Tabla | null}
 */
export function tablaParesGrupos(P, ctx) {
    const R = /** @type {any} */ (P), ph = R.postHocGrupos;
    if (!ph) return null;
    const media = (/** @type {number} */ a) => R.descriptivosPorGrupo[a].reduce((/** @type {number} */ s, /** @type {any} */ d) => s + d.media, 0) / R.k;
    const fp = (/** @type {number} */ p) => formatoP(p, { alfa: R.alfa });
    const gl = ph.pares.length ? ph.pares[0].gl : R.n - R.g;
    return {
        titulo: `Comparaciones por pares entre los grupos de ${ctx.factor || 'grupo'} (la media de las medidas, corrección de Holm)`,
        cabecera: ['Par', 'Dif. de medias', 't', 'gl', 'p', 'p (Holm)', 'Decisión'],
        filas: ph.pares.map((/** @type {any} */ p) => [`${nombreGrupo(ctx, p.i)} − ${nombreGrupo(ctx, p.j)}`, fx(media(p.i) - media(p.j)), fx(p.estadistico), String(p.gl), fp(p.pValor), fp(p.pHolm), p.significativa ? 'Significativa' : 'No significativa']),
        nota: `Sin interacción, el efecto de ${ctx.factor || 'el grupo'} es el mismo en todas las medidas: se compara la media de las ${R.k} medidas de cada persona, con la t del error entre sujetos del ANOVA mixto (${gl} gl). Holm (1979) controla la probabilidad de algún falso positivo entre todos los pares.`
    };
}

/**
 * Los pares de grupos significativos en una frase.
 * @param {any} R
 * @param {Contexto} ctx
 */
function fraseParesGrupos(R, ctx) {
    const ph = R.postHocGrupos;
    if (!ph) return '';
    const sig = ph.pares.filter((/** @type {any} */ p) => p.significativa);
    if (!sig.length) return ' Entre los grupos, ninguna comparación por pares resultó significativa tras la corrección de Holm.';
    const par = (/** @type {any} */ p) => { const b = nombreGrupo(ctx, p.j); return `${nombreGrupo(ctx, p.i)} ${conjuncionY(b)} ${b} (t(${p.gl}) = ${fx(p.estadistico)}, p de Holm ${pConSigno(p.pHolm, { alfa: R.alfa })})`; };
    return ` Las comparaciones por pares entre los grupos (la media de las medidas de cada persona, corrección de Holm) sitúan las diferencias entre ${sig.map(par).join('; ')}.`;
}

/**
 * El estadístico, los gl y el efecto de una comparación de grupos independientes (los efectos simples entre grupos).
 * @param {any} pr el resultado de protocoloGrupos
 * @returns {[string, string, string]}
 */
function resumenGrupos(pr) {
    const g = pr.global;
    switch (pr.prueba) {
        case 'student': case 'welch': return [`t = ${fx(g.t)}`, fgl(g.gl), `d = ${fx(g.d)}`];
        case 'mann-whitney': return [`z = ${fx(g.z)}`, '—', `r = ${fc(g.r)}`];
        case 'anova': case 'anova-welch': return [`F = ${fx(g.F)}`, `${fgl(g.gl1)}, ${fgl(g.gl2)}`, `η² = ${fc(g.eta2)}`];
        default: return [`H = ${fx(g.H)}`, String(g.gl), `ε² = ${fc(g.epsilon2)}`];
    }
}

/**
 * Los efectos simples del diseño mixto (con la interacción significativa): las medidas dentro de cada grupo y los grupos en
 * cada medida, con Holm en cada familia.
 * @param {ResultadoRelacionadas} P
 * @param {Contexto} ctx
 * @returns {Tabla[]}
 */
export function tablasSimples(P, ctx) {
    const R = /** @type {any} */ (P), S = R.simples;
    if (!S) return [];
    const niveles = ctx.niveles || [];
    return [{
        titulo: `Efectos simples: el cambio entre las medidas dentro de cada grupo de ${ctx.factor || 'grupo'}`,
        cabecera: [ctx.factor || 'Grupo', 'Corrección', 'F', 'gl', 'p', 'p (Holm)', 'η²p', 'Decisión'],
        filas: S.medidasEnGrupos.map((/** @type {any} */ d, /** @type {number} */ a) => [niveles[a] || `Grupo ${a + 1}`, NOMBRE_CORRECCION[/** @type {'gg'} */ (d.correccion)], fx(d.r.F), `${fgl(d.prueba.gl1)}, ${fgl(d.prueba.gl2)}`, formatoP(d.prueba.pValor, { alfa: R.alfa }), formatoP(d.pHolm, { alfa: R.alfa }), fc(d.r.eta2p), d.significativa ? 'Significativo' : 'No significativo']),
        nota: 'Un ANOVA de medidas repetidas en cada grupo, con su propio error y su propia corrección de la esfericidad. p (Holm): con la corrección de Holm (1979) en cada familia de efectos simples.'
    }, {
        titulo: `Efectos simples: la diferencia entre los grupos de ${ctx.factor || 'grupo'} en cada medida`,
        cabecera: ['Medida', 'Prueba', 'Estadístico', 'gl', 'p', 'p (Holm)', 'Efecto', 'Decisión'],
        filas: S.gruposEnMedidas.map((/** @type {any} */ e, /** @type {number} */ j) => { const [est, gl, ef] = resumenGrupos(e.protocolo); return [/** @type {string} */ (ctx.nombres[j]), NOMBRE_GRUPOS[/** @type {'anova'} */ (e.protocolo.prueba)], est, gl, formatoP(e.protocolo.global.pValor, { alfa: R.alfa }), formatoP(e.pHolm, { alfa: R.alfa }), ef, e.significativa ? 'Significativa' : 'No significativa']; }),
        nota: 'Con el protocolo de los grupos independientes del programa en cada medida (normalidad por grupo y Levene: t de Student, t de Welch o U de Mann-Whitney; ANOVA, ANOVA de Welch o Kruskal-Wallis).'
    }];
}

// ---------- redacción APA ----------
/**
 * Las medias (o medianas) de las medidas en una frase: «T1 (M = 20.10, DE = 3.20) y T2 (M = 22.40, DE = 3.50)».
 * @param {any} R
 * @param {string[]} nombres
 * @param {boolean} medianas
 */
function listaMedidas(R, nombres, medianas) {
    return listaY(R.descriptivos.map((/** @type {any} */ d, /** @type {number} */ j) => medianas ? `${nombres[j]} (Mdn = ${fx(d.mediana)}, RIC = ${fx(d.q3 - d.q1)})` : `${nombres[j]} (M = ${fx(d.media)}, DE = ${fx(d.de)})`));
}

/**
 * Lo que dice la prueba de la otra rama, en una frase.
 * @param {any} R
 */
function fraseSensibilidad(R) {
    const s = R.sensibilidad;
    if (!s) return '';
    const pOtra = s.prueba === 'anova-rm' ? s.resultado.prueba.pValor : s.resultado.pValor, misma = (pOtra < R.alfa) === R.significativa;
    const est = s.prueba === 'wilcoxon' ? `z = ${fx(s.resultado.z)}` : s.prueba === 't-pareada' ? `t(${s.resultado.gl}) = ${fx(s.resultado.t)}` : s.prueba === 'friedman' ? `χ²(${s.resultado.gl}) = ${fx(s.resultado.chi2)}` : `F(${fgl(s.resultado.prueba.gl1)}, ${fgl(s.resultado.prueba.gl2)}) = ${fx(s.resultado.F)}`;
    const nombre = s.prueba === 'wilcoxon' ? 'la prueba de Wilcoxon, que no supone la normalidad,' : s.prueba === 'friedman' ? 'la prueba de Friedman, que no supone la normalidad,' : s.prueba === 't-pareada' ? 'la t para muestras relacionadas' : 'el ANOVA de medidas repetidas';
    return misma ? ` Como comprobación, ${nombre} llega a la misma conclusión (${est}, p ${pConSigno(pOtra, { alfa: R.alfa })}).`
        : ` Como comprobación, ${nombre} llega a una conclusión distinta (${est}, p ${pConSigno(pOtra, { alfa: R.alfa })}): la decisión depende de la prueba, y conviene informarlo.`;
}

/**
 * Los pares significativos en una frase.
 * @param {any} R
 * @param {string[]} nombres
 */
function frasePares(R, nombres) {
    const ph = R.postHoc;
    if (!ph) return '';
    const sig = ph.pares.filter((/** @type {any} */ p) => p.significativa);
    if (!sig.length) return ` Sin embargo, tras la corrección de Holm, ninguna comparación por pares (${ph.nombre}) resultó significativa: la diferencia global es difusa, no un salto concreto entre dos medidas.`;
    const ef = ph.metodo === 'tpareada' ? 'dz' : ph.metodo === 'wilcoxon' ? 'r_rb' : 'Δ';
    return ` Las comparaciones por pares (${ph.nombre}, corrección de Holm) sitúan las diferencias en ${sig.map((/** @type {any} */ p) => `${nombrePar(nombres, p)} (p de Holm ${pConSigno(p.pHolm, { alfa: R.alfa })}, ${ef} = ${ph.metodo === 'tpareada' ? fx(p.efecto) : fc(p.efecto)})`).join('; ')}.`;
}

/**
 * El párrafo APA 7 del análisis, para la tesis.
 * @param {ResultadoRelacionadas} P
 * @param {Contexto} ctx
 * @returns {string}
 */
export function redactar(P, ctx) {
    const R = /** @type {any} */ (P), G = R.global, e = R.efecto, a = alfaTxt(R.alfa), niv = nivelTxt(R.nivel), [n1, n2] = ctx.nombres;
    const sig = R.significativa ? 'fue estadísticamente significativa' : 'no fue estadísticamente significativa';
    const N = R.normalidad, normal = N ? `${N.abreviatura}, p ${pConSigno(N.pValor)}` : '';
    const excl = ctx.excluidos ? ` (${ctx.excluidos === 1 ? 'un caso sin todas las medidas se excluyó' : `${ctx.excluidos} casos sin todas las medidas se excluyeron`})` : '';
    /** «ninguna persona aumentó», «una persona aumentó», «12 personas aumentaron» @param {number} k @param {string} singular @param {string} plural */
    const personas = (k, singular, plural) => (k === 0 ? `ninguna persona ${singular}` : k === 1 ? `una persona ${singular}` : `${k} personas ${plural}`);
    switch (R.prueba) {
        case 't-pareada': {
            const sentido = G.mediaDiferencia > 0 ? 'aumentó' : G.mediaDiferencia < 0 ? 'disminuyó' : 'no cambió';
            return `Se comparó ${ctx.que} en las mismas ${R.n} personas${excl} entre ${listaMedidas(R, ctx.nombres, false)}. Las diferencias se ajustaron a la distribución normal (${normal}), por lo que se aplicó la ${NOMBRE_PRUEBA['t-pareada']}. De ${n1} a ${n2}, ${G.mediaDiferencia === 0 ? `la diferencia media fue ${fx(0)}, IC ${niv} ${ic(G.ic[0], G.ic[1], v => fx(v))},` : `${ctx.que} ${sentido} en promedio ${fx(Math.abs(G.mediaDiferencia))} puntos (diferencia media = ${fx(G.mediaDiferencia)}, IC ${niv} ${ic(G.ic[0], G.ic[1], v => fx(v))}),`} y la diferencia ${sig}, t(${G.gl}) = ${fx(G.t)}, p ${pConSigno(G.pValor, { alfa: R.alfa })} (α = ${a}), con un tamaño del efecto ${magnitudDe('dz', e.valor)} (Cohen, 1988), dz = ${fx(e.valor)}, IC ${niv} ${ic(e.inferior, e.superior, v => fx(v))} (d_av = ${fx(e.dav)}; Lakens, 2013).${fraseSensibilidad(R)}`;
        }
        case 'wilcoxon': {
            const [m1, m2] = R.descriptivos;
            return `Se comparó ${ctx.que} en las mismas ${R.n} personas${excl} entre ${n1} (Mdn = ${fx(m1.mediana)}) ${conjuncionY(n2)} ${n2} (Mdn = ${fx(m2.mediana)}). Las diferencias no se ajustaron a la distribución normal (${normal}), por lo que se aplicó la ${NOMBRE_PRUEBA.wilcoxon} (Wilcoxon, 1945). De ${n1} a ${n2}, ${personas(G.positivos, 'aumentó', 'aumentaron')}, ${personas(G.negativos, 'disminuyó', 'disminuyeron')}${G.empates ? ` y ${personas(G.empates, 'no cambió', 'no cambiaron')} (fuera de la prueba)` : ''}; la diferencia ${sig}, z = ${fx(G.z)}, p ${pConSigno(G.pValor, { alfa: R.alfa })} (α = ${a}), con un tamaño del efecto ${magnitudDe('rbc', e.valor)} (Cohen, 1988), r_rb = ${fc(e.valor)}${Number.isFinite(e.inferior) ? `, IC ${niv} ${ic(e.inferior, e.superior, v => fc(v))}` : ''} (correlación biserial de rangos; Kerby, 2014).${fraseSensibilidad(R)}`;
        }
        case 'anova-rm': {
            const E = R.esfericidad, pr = G.prueba;
            const esf = !E ? '' : !Number.isFinite(E.pValor) ? ` Con menos personas que medidas, la esfericidad no se pudo contrastar (Mauchly, 1940), y se aplicó la corrección de ${NOMBRE_CORRECCION[/** @type {'gg'} */ (R.correccion)]} (ε = ${fc(pr.epsilon, 3)}).`
                : E.pValor > 0.05 ? ` La prueba de Mauchly (1940) no rechazó la esfericidad, ${mauchlyTxt(E)}, por lo que se informa la F sin corregir.`
                : ` La prueba de Mauchly (1940) rechazó la esfericidad, ${mauchlyTxt(E)}, por lo que se aplicó la corrección de ${R.correccion === 'hf' ? 'Huynh y Feldt (1976)' : 'Greenhouse y Geisser (1959)'} (ε = ${fc(pr.epsilon, 3)}; Girden, 1992).`;
            return `Se comparó ${ctx.que} en las mismas ${R.n} personas${excl} a lo largo de las ${R.k} medidas: ${listaMedidas(R, ctx.nombres, false)}. Los residuos del modelo se ajustaron a la distribución normal (${normal}), por lo que se aplicó un ${NOMBRE_PRUEBA['anova-rm']}.${esf} La diferencia entre las medidas ${sig}, F(${fgl(pr.gl1)}, ${fgl(pr.gl2)}) = ${fx(G.F)}, p ${pConSigno(pr.pValor, { alfa: R.alfa })} (α = ${a}), con un tamaño del efecto ${magnitudDe('eta2p', e.valor)} (Cohen, 1988), η²p = ${fc(e.valor)}, IC ${niv} ${ic(e.inferior, e.superior, v => fc(v))}, η²G = ${fc(e.eta2G)} (Olejnik y Algina, 2003; Bakeman, 2005).${frasePares(R, ctx.nombres)}${fraseSensibilidad(R)}`;
        }
        case 'friedman':
            return `Se comparó ${ctx.que} en las mismas ${R.n} personas${excl} a lo largo de las ${R.k} medidas: ${listaMedidas(R, ctx.nombres, true)}. Los residuos del modelo no se ajustaron a la distribución normal (${normal}), por lo que se aplicó la ${NOMBRE_PRUEBA.friedman} (Friedman, 1937). La diferencia entre las medidas ${sig}, χ²(${G.gl}) = ${fx(G.chi2)}, p ${pConSigno(G.pValor, { alfa: R.alfa })} (α = ${a}), con un tamaño del efecto ${magnitudDe('W', G.W)} (Cohen, 1988), W de Kendall = ${fc(G.W)}.${frasePares(R, ctx.nombres)}${fraseSensibilidad(R)}`;
        case 'mcnemar': {
            const { cero, uno } = R.dicotomica;
            return `Se comparó la proporción de ${ctx.que} = ${uno} en las mismas ${R.n} personas${excl} entre ${n1} (${pct(R.proporciones[0])}) ${conjuncionY(n2)} ${n2} (${pct(R.proporciones[1])}). ${G.discordantes === 1 ? 'Cambió una persona' : `Cambiaron ${G.discordantes} personas`}: ${G.n10} de ${cero} a ${uno} y ${G.n01} de ${uno} a ${cero}. La ${NOMBRE_PRUEBA.mcnemar} (McNemar, 1947), por la binomial exacta, ${R.significativa ? 'fue estadísticamente significativa' : 'no fue estadísticamente significativa'}, p ${pConSigno(G.pValor, { alfa: R.alfa })} (α = ${a}); la razón de odds del cambio fue OR = ${fx(e.valor)}, IC ${niv} ${ic(e.inferior, e.superior, v => fx(v))}, con un tamaño del efecto ${magnitudDe('g', e.g)} (g de Cohen = ${fc(e.g)}; Cohen, 1988).`;
        }
        case 'cochran': {
            const { uno } = R.dicotomica;
            const props = ctx.nombres.map((nom, j) => `${nom} (${pct(R.proporciones[j])})`);
            return `Se comparó la proporción de ${ctx.que} = ${uno} en las mismas ${R.n} personas${excl} a lo largo de las ${R.k} medidas: ${listaY(props)}. La ${NOMBRE_PRUEBA.cochran} (Cochran, 1950) ${sig}, Q(${G.gl}) = ${fx(G.Q)}, p ${pConSigno(G.pValor, { alfa: R.alfa })} (α = ${a}), η²_Q = ${fc(G.eta2Q)}.${frasePares(R, ctx.nombres)}`;
        }
        default: {
            const ef = R.efectos, fct = ctx.factor || 'el grupo', niveles = ctx.niveles || [];
            const f = (/** @type {any} */ x) => `F(${fgl(x.prueba.gl1)}, ${fgl(x.prueba.gl2)}) = ${fx(x.prueba.F)}, p ${pConSigno(x.prueba.pValor, { alfa: R.alfa })}, η²p = ${fc(x.eta2p.valor)}, IC ${niv} ${ic(x.eta2p.inferior, x.eta2p.superior, v => fc(v))}, η²G = ${fc(x.eta2G)}`;
            const E = R.esfericidad;
            const esf = !E ? '' : !Number.isFinite(E.pValor) ? ` La esfericidad no se pudo contrastar (con N − g = ${R.n - R.g}, menos que las ${R.k - 1} diferencias entre medidas) y se aplicó la corrección de ${NOMBRE_CORRECCION[/** @type {'gg'} */ (R.correccion)]}.`
                : E.pValor > 0.05 ? ` La prueba de Mauchly (1940) no rechazó la esfericidad, ${mauchlyTxt(E)}.`
                : ` La prueba de Mauchly (1940) rechazó la esfericidad, ${mauchlyTxt(E)}, por lo que los efectos intra sujetos se corrigieron con la ε de ${R.correccion === 'hf' ? 'Huynh y Feldt (1976), con la corrección de Lecoutre (1991) para varios grupos' : 'Greenhouse y Geisser (1959)'}: ε = ${fc(ef.medidas.prueba.epsilon, 3)}.`;
            let s = `Se analizó ${ctx.que} con un ${NOMBRE_PRUEBA['anova-mixta']} ${R.g} × ${R.k}, con ${fct} entre sujetos (${niveles.map((nv, i) => `${nv}, n = ${R.ns[i]}`).join('; ')}) y las ${R.k} medidas intra sujetos (${ctx.nombres.join(', ')})${excl}.${esf} La interacción entre las medidas ${conjuncionY(fct)} ${fct} ${ef.interaccion.significativa ? 'fue estadísticamente significativa' : 'no fue estadísticamente significativa'}, ${f(ef.interaccion)}`;
            s += ef.interaccion.significativa ? ': el cambio entre las medidas no fue el mismo en todos los grupos.' : '.';
            s += ` El efecto principal de las medidas ${ef.medidas.significativa ? 'fue significativo' : 'no fue significativo'}, ${f(ef.medidas)}, y el de ${fct} ${ef.grupo.significativa ? 'fue significativo' : 'no fue significativo'}, ${f(ef.grupo)} (α = ${a}).`;
            if (R.simples) {
                const dentro = R.simples.medidasEnGrupos.map((/** @type {any} */ d, /** @type {number} */ i) => `${niveles[i] || `grupo ${i + 1}`}: F(${fgl(d.prueba.gl1)}, ${fgl(d.prueba.gl2)}) = ${fx(d.r.F)}, p de Holm ${pConSigno(d.pHolm, { alfa: R.alfa })}`).join('; ');
                const medidasDistintas = R.simples.gruposEnMedidas.map((/** @type {any} */ x, /** @type {number} */ j) => (x.significativa ? ctx.nombres[j] : null)).filter(Boolean);
                s += ` Los efectos simples (corrección de Holm) muestran el cambio entre las medidas en cada grupo (${dentro})${medidasDistintas.length ? `, y que los grupos difieren en ${medidasDistintas.join(', ')}` : ', sin diferencias entre los grupos en ninguna medida tomada por separado'}.`;
            }
            if (R.postHoc) s += frasePares(R, ctx.nombres);
            if (R.postHocGrupos) s += fraseParesGrupos(R, ctx);
            return s;
        }
    }
}

/**
 * Los porqués del protocolo, para la tarjeta: por qué esta prueba y no otra, en lenguaje llano.
 * @param {ResultadoRelacionadas} P
 * @returns {string[]} párrafos con <b> (HTML propio del programa)
 */
export function porques(P) {
    const R = /** @type {any} */ (P), h = [];
    h.push('<b>¿Por qué una prueba para muestras relacionadas?</b> Porque son las mismas personas: cada una es su propio control. Lo que se analiza es el <i>cambio</i> de cada persona, y la variación entre personas (unas puntúan alto en todas las medidas, otras bajo) sale del error. Por eso estas pruebas detectan con la misma muestra diferencias que una comparación de grupos independientes no vería.');
    if (R.diseno === 'dos' && !R.dicotomica) h.push('<b>¿Por qué se mira la normalidad de las diferencias y no la de cada medida?</b> Porque la t para muestras relacionadas es, en el fondo, una t de una sola muestra sobre las diferencias: lo que supone normal es el cambio de cada persona. Si no lo es, Wilcoxon ordena los cambios por su tamaño y compara la suma de los rangos de los que suben con la de los que bajan.');
    if (R.diseno !== 'dos' && !R.dicotomica) h.push('<b>¿Qué es la esfericidad y por qué se corrige?</b> El ANOVA de medidas repetidas supone que las diferencias entre cada par de medidas tienen la misma varianza. Con datos de varias ondas casi nunca es así (las medidas cercanas en el tiempo se parecen más), y entonces la F rechaza de más. La ε mide cuánto se aleja (1 es la esfericidad perfecta) y la corrección multiplica los grados de libertad por ella: la misma F, juzgada con más exigencia.');
    if (R.prueba === 'friedman') h.push('<b>¿Por qué Friedman?</b> Porque los residuos no son normales: Friedman ordena las medidas dentro de cada persona (1.ª, 2.ª, 3.ª…) y compara los rangos medios. No le afectan los atípicos ni la forma de la distribución, y sus comparaciones por pares son Wilcoxon de cada par, que no dependen de las demás medidas.');
    if (R.dicotomica) h.push('<b>¿Por qué McNemar o Cochran?</b> Con respuestas sí/no, la información está en quienes <i>cambian</i>: los que siguen igual no dicen nada sobre si la proporción cambió. McNemar compara los que pasan de 0 a 1 con los que pasan de 1 a 0 (con la binomial exacta, válida con cualquier n); la Q de Cochran lo generaliza a tres o más medidas.');
    if (R.diseno === 'mixto') h.push('<b>¿Por qué un ANOVA mixto?</b> Porque hay dos preguntas a la vez: si las personas cambian entre las medidas (intra sujetos) y si el cambio es distinto según el grupo (la interacción). La interacción es la pregunta de un diseño con grupo de control: el efecto de una intervención es que el grupo experimental cambie <i>más</i> que el de control. Si la interacción es significativa, los efectos principales se leen con cuidado y mandan los efectos simples.');
    h.push('<b>¿Por qué el tamaño del efecto con su intervalo?</b> Porque el p dice si hay diferencia, no cuánta; y el intervalo dice cuánta precisión hay en esa estimación. APA 7 pide los dos. η²G, además, se puede comparar con la de un diseño de grupos independientes, cosa que la η² parcial no permite.');
    return h;
}

/**
 * Las referencias que cita lo que se informó: (2027.01.20, revisión) exactamente las que se citan en el texto, las tablas y la
 * figura de cada prueba (antes, la lista era la de todas las ramas del protocolo; tests/unit/citas-redacciones.test.js).
 * @param {ResultadoRelacionadas} P
 * @param {boolean} [conFigura] si va la figura de perfil (la que cita a Cousineau y Morey con medidas dicotómicas)
 * @returns {string[]}
 */
export function referenciasRelacionadas(P, conFigura = true) {
    const R = /** @type {any} */ (P), ph = R.postHoc, mixto = R.diseno === 'mixto', c = [];
    if (!R.dicotomica || conFigura) c.push('cousineau2005', 'morey2008');
    if (!mixto && R.prueba !== 'cochran') c.push('cohen1988');
    if (R.normalidad) c.push(R.normalidad.abreviatura === 'Shapiro-Wilk' ? 'shapiro1965' : 'lilliefors1967');
    if (R.prueba === 't-pareada') c.push('wilcoxon1945', 'lakens2013', 'steiger1997');
    if (R.prueba === 'wilcoxon') c.push('wilcoxon1945', 'kerby2014');
    if (R.esfericidad) c.push('mauchly1940', 'greenhouse1959', 'huynh1976', 'girden1992');
    if (mixto && R.esfericidad) c.push('lecoutre1991');
    if (R.prueba === 'anova-rm' || mixto) c.push('olejnik2003', 'bakeman2005', 'steiger2004');
    if (R.prueba === 'anova-rm' || R.prueba === 'friedman') c.push('friedman1937');
    if (R.prueba === 'friedman') c.push('kendall1939');
    if (ph || R.simples || R.postHocGrupos) c.push('holm1979');
    if (ph && ph.metodo === 'tpareada') c.push('maxwell2004');
    if (ph && ph.metodo === 'wilcoxon') c.push('wilcoxon1945', 'benavoli2016');
    if (R.prueba === 'mcnemar' || (ph && ph.metodo === 'mcnemar')) c.push('mcnemar1947');
    if (R.prueba === 'mcnemar') c.push('clopper1934');
    if (R.prueba === 'cochran') c.push('cochran1950', 'serlin1982');
    if (mixto) c.push('levene1960', 'box1949');
    return referenciasDe(c);
}

/**
 * Todas las tablas del análisis, en su orden.
 * @param {ResultadoRelacionadas} P
 * @param {Contexto} ctx
 * @returns {Tabla[]}
 */
export function tablasRelacionadas(P, ctx) {
    return /** @type {Tabla[]} */ ([tablaDescriptivos(P, ctx), tablaSupuestos(P, ctx), tablaPrueba(P, ctx), tablaPares(P, ctx), tablaParesGrupos(P, ctx), ...tablasSimples(P, ctx)].filter(Boolean));
}

/**
 * El documento de Word (APA 7): el título, la redacción, las tablas, la figura de perfil y las referencias.
 * @param {ResultadoRelacionadas} P
 * @param {Contexto} ctx
 * @param {{ url: string, w: number, h: number } | null} png la figura de perfil, ya en PNG (o null)
 * @returns {string}
 */
export function documentoWordRelacionadas(P, ctx, png) {
    const R = /** @type {any} */ (P);
    let cuerpo = tituloWord(`${R.diseno === 'mixto' ? 'Medidas repetidas por grupo' : 'Medidas repetidas'}: ${ctx.que}`) + parrafoWord(redactar(P, ctx));
    tablasRelacionadas(P, ctx).forEach((t, i) => { cuerpo += tablaWord({ numero: i + 1, titulo: t.titulo, cabecera: t.cabecera, filas: t.filas, nota: t.nota, negritas: t.negritas }); });
    if (png) cuerpo += subtituloWord('Gráfico de perfil') + figuraWord({ numero: 1, titulo: `Media de ${ctx.que} en cada medida${R.diseno === 'mixto' ? ` según ${ctx.factor || 'el grupo'}` : ''}`, png, nota: `Las barras son el intervalo de confianza del ${nivelTxt(R.nivel)} intra sujetos (Cousineau, 2005; Morey, 2008).` });
    cuerpo += referenciasWord(referenciasRelacionadas(P, !!png));
    return envolverDocumento(`Medidas repetidas: ${ctx.que}`, cuerpo);
}
