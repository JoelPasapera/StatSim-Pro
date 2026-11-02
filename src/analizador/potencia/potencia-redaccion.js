// @ts-check
// analizador/potencia/potencia-redaccion.js — (2027.01.18) lo que se escribe de un análisis de potencia: las pruebas que se
// ofrecen con su tamaño del efecto y las convenciones de Cohen (1988), el resultado en una frase (el tamaño de muestra, la
// potencia con un n dado o el efecto mínimo detectable), la tabla con los demás efectos convencionales, la redacción APA 7
// (a priori, a posteriori con la muestra disponible o de sensibilidad; Lakens, 2022) y el Word. Sin DOM.
// (2027.01.20, revisión) Las rutas de la mediación, en la métrica de Fritz y MacKinnon (2007), con su cero inicial (no son
// correlaciones); Hotelling (1953) y Cohen (1988), citados donde se usan; el Word, sin la tabla vacía de la mediación ni una
// nota que hable de otra línea que la dibujada.
import { numeroConMenos } from '../../shared/formato-numero.js';
import { referenciasDe } from '../informe/referencias-apa.js';
import { tituloWord, parrafoWord, tablaWord, figuraWord, referenciasWord, documentoWord } from '../informe/word-apa.js';
import { magnitudD, magnitudR, magnitudF, magnitudW, magnitudF2 } from '../motor/magnitudes.js';

/** @typedef {import('../../core/stats/potencia.js').PruebaPotencia | 'mediacion'} PruebaTarjeta */
/** @typedef {'muestra' | 'potencia' | 'sensibilidad'} ModoPotencia */
/**
 * @typedef {{ modo: ModoPotencia, prueba: PruebaTarjeta, efecto: number, alfa: number, colas: 1 | 2, potenciaDeseada: number,
 *   razon: number, k: number, gl: number, predictores: number, probados: number, b: number, cp: number, R: number, semilla: number,
 *   n: number, n2: number | null, total: number, potencia: number, ee: number | null,
 *   alternativos: { nombre: string, efecto: number, n: number | null, total: number | null }[] }} ResultadoPotencia
 *   efecto: el del cálculo (en sensibilidad, el detectable; en mediación, a); n: las unidades de la prueba (n₁ en t2, por grupo
 *   en el ANOVA, el total en las demás); potencia: la real o la estimada; ee: el error típico de Monte Carlo (mediación)
 */

/**
 * Cada prueba: su nombre, el símbolo de su efecto, sus convenciones (pequeño, mediano y grande) y su banda.
 * @type {Readonly<Record<PruebaTarjeta, { nombre: string, simbolo: string, convenciones: [number, number, number], magnitud: (v: number) => string, unidad: string | null, cita: string, masculino?: boolean }>>}
 */
export const PRUEBAS = Object.freeze({
    t2: { nombre: 'prueba t de Student para dos grupos independientes', simbolo: 'd', convenciones: [0.2, 0.5, 0.8], magnitud: magnitudD, unidad: 'por grupo', cita: 'Cohen, 1988' },
    t1: { nombre: 'prueba t para muestras relacionadas', simbolo: 'dz', convenciones: [0.2, 0.5, 0.8], magnitud: magnitudD, unidad: null, cita: 'Cohen, 1988' },
    r: { nombre: 'prueba de la correlación de Pearson (frente a ρ = 0)', simbolo: 'ρ', convenciones: [0.1, 0.3, 0.5], magnitud: magnitudR, unidad: null, cita: 'Cohen, 1988' },
    anova: { nombre: 'ANOVA de un factor de efectos fijos', simbolo: 'f', convenciones: [0.1, 0.25, 0.4], magnitud: magnitudF, unidad: 'por grupo', cita: 'Cohen, 1988', masculino: true },
    chi2: { nombre: 'prueba χ² de independencia', simbolo: 'w', convenciones: [0.1, 0.3, 0.5], magnitud: magnitudW, unidad: null, cita: 'Cohen, 1988' },
    regresion: { nombre: 'regresión lineal múltiple', simbolo: 'f²', convenciones: [0.02, 0.15, 0.35], magnitud: magnitudF2, unidad: null, cita: 'Cohen, 1988' },
    mediacion: { nombre: 'mediación simple con la prueba de significación conjunta', simbolo: 'a', convenciones: [0.14, 0.39, 0.59], magnitud: magnitudR, unidad: null, cita: 'Fritz y MacKinnon, 2007' }
});

/** @param {number} v @param {number} [d] */
const fx = (v, d = 2) => numeroConMenos(v, d);
/** Una probabilidad sin el cero inicial («.801»). @param {number} v @param {number} [d] */
const prob = (v, d = 3) => fx(v, d).replace(/^0\./, '.');
/** α en APA. @param {number} a */
const alfaTxt = a => String(a).replace(/^0\./, '.');
/** El efecto con su símbolo («d = 0.50»; las rutas de la mediación, «a = .39»). @param {ResultadoPotencia} R @param {number} [efecto] */
const efectoTxt = (R, efecto = R.efecto) => (R.prueba === 'mediacion' ? `a = ${fx(efecto, 2)}, b = ${fx(R.b, 2)} y c′ = ${fx(R.cp, 2)}` : `${PRUEBAS[R.prueba].simbolo} = ${R.prueba === 'r' ? prob(efecto, 2) : fx(efecto, 2)}`);

/** La potencia que marca la línea de la curva: la deseada, salvo con un n dado (entonces, la convención de .80). @param {ResultadoPotencia} R */
export const potenciaDeReferencia = R => (R.modo === 'potencia' ? 0.8 : R.potenciaDeseada);

/**
 * Los detalles de la prueba entre paréntesis («(bilateral; razón n₂/n₁ = 2.00)», «(3 grupos)», «(incremento de 2 de 6
 * predictores)»), o nada.
 * @param {ResultadoPotencia} R
 */
function detalles(R) {
    /** @type {string[]} */ const d = [];
    if (R.prueba === 't2' || R.prueba === 't1' || R.prueba === 'r') d.push(R.colas === 2 ? 'bilateral' : 'unilateral');
    if (R.prueba === 't2' && R.razon !== 1) d.push(`razón n₂/n₁ = ${fx(R.razon, 2)}`);
    if (R.prueba === 'anova') d.push(`${R.k} grupos`);
    if (R.prueba === 'chi2') d.push(`${R.gl} ${R.gl === 1 ? 'grado' : 'grados'} de libertad`);
    if (R.prueba === 'regresion') d.push(R.probados < R.predictores ? `incremento de ${R.probados} de ${R.predictores} predictores` : `${R.predictores} ${R.predictores === 1 ? 'predictor' : 'predictores'}`);
    return d.length ? ` (${d.join('; ')})` : '';
}

/** La magnitud en plural («medianos»; las rutas, «medianas»). @param {string} m @param {boolean} [femenino] */
const plural = (m, femenino = false) => (m === 'trivial' ? 'triviales' : m === 'grande' ? 'grandes' : `${femenino ? m.slice(0, -1) + 'a' : m}s`);

/** La magnitud del efecto del resultado («mediano»; en la mediación, la de a y b si coinciden: «rutas medianas»). @param {ResultadoPotencia} R */
function magnitudTxt(R) {
    const P = PRUEBAS[R.prueba];
    if (R.prueba !== 'mediacion') return P.magnitud(R.efecto);
    const ma = P.magnitud(R.efecto), mb = P.magnitud(R.b);
    return ma === mb ? `rutas ${plural(ma, true)}` : `a ${ma}, b ${mb}`;
}

/** Los artículos de cada prueba («una prueba», «un ANOVA»; «la prueba», «el ANOVA»; «de la», «del»). @param {ResultadoPotencia} R */
const art = R => (PRUEBAS[R.prueba].masculino ? { un: 'un', el: 'el', del: 'del' } : { un: 'una', el: 'la', del: 'de la' });

/** El tamaño de la muestra dentro de un paréntesis («n = 30 por grupo, N = 120»). @param {ResultadoPotencia} R */
function muestraPlana(R) {
    if (R.prueba === 't2') return R.n2 !== null && R.n2 !== R.n ? `n₁ = ${R.n}, n₂ = ${R.n2}, N = ${R.total}` : `n = ${R.n} por grupo, N = ${R.total}`;
    if (R.prueba === 'anova') return `n = ${R.n} por grupo, N = ${R.total}`;
    return `N = ${R.total}`;
}

/** El tamaño de la muestra en el texto («64 por grupo (N = 128)», «N = 84»). @param {ResultadoPotencia} R @param {number} [n] @param {number | null} [total] @param {number | null} [n2] */
export function muestraTxt(R, n = R.n, total = R.total, n2 = R.n2) {
    if (R.prueba === 't2') return n2 !== null && n2 !== n ? `n₁ = ${n} y n₂ = ${n2} (N = ${total})` : `${n} por grupo (N = ${total})`;
    if (R.prueba === 'anova') return `${n} por grupo (N = ${total})`;
    return `N = ${total}`;
}

/**
 * Los participantes en el texto APA («64 participantes por grupo (N = 128; potencia real = .801)»; sin potencia, «80
 * participantes»).
 * @param {ResultadoPotencia} R
 * @param {string} [potenciaTxt]
 */
function requeridos(R, potenciaTxt = '') {
    const y = potenciaTxt ? `; ${potenciaTxt}` : '';
    if (R.prueba === 't2') return R.n2 !== null && R.n2 !== R.n ? `n₁ = ${R.n} y n₂ = ${R.n2} participantes (N = ${R.total}${y})` : `${R.n} participantes por grupo (N = ${R.total}${y})`;
    if (R.prueba === 'anova') return `${R.n} participantes por grupo (N = ${R.total}${y})`;
    return `${R.total} participantes${potenciaTxt ? ` (${potenciaTxt})` : ''}`;
}

/** Las colas en las condiciones del resumen, si importan. @param {ResultadoPotencia} R */
const colasTxt = R => (R.prueba === 't2' || R.prueba === 't1' || R.prueba === 'r' ? (R.colas === 2 ? ', bilateral' : ', unilateral') : '');

/**
 * El resultado en una frase.
 * @param {ResultadoPotencia} R
 */
export function resumenPotencia(R) {
    const P = PRUEBAS[R.prueba], condiciones = `α = ${alfaTxt(R.alfa)}${colasTxt(R)}`;
    const mc = R.ee !== null ? ` (estimada con ${R.R.toLocaleString('es')} réplicas; EE = ${prob(R.ee)})` : '';
    if (R.modo === 'muestra') return `Hacen falta ${muestraTxt(R)} para detectar ${efectoTxt(R)} (${magnitudTxt(R)}) con una potencia de ${prob(R.potenciaDeseada, 2)} (${condiciones}). Con esa muestra, la potencia es de ${prob(R.potencia)}${mc}.`;
    if (R.modo === 'potencia') return `Con ${muestraTxt(R)}, ${efectoTxt(R)} y ${condiciones}, la potencia es de ${prob(R.potencia)}${mc}: un ${fx(100 * R.potencia, 1)} % de probabilidad de detectar el efecto si existe.`;
    return `Con ${muestraTxt(R)} y ${condiciones}, el menor efecto que se detecta con una potencia de ${prob(R.potenciaDeseada, 2)} es ${efectoTxt(R)} (${magnitudTxt(R)}).`;
}

/**
 * La tabla de los efectos convencionales: el tamaño de muestra de cada uno (o la potencia, con el n dado).
 * @param {ResultadoPotencia} R
 */
export function tablaAlternativos(R) {
    const P = PRUEBAS[R.prueba];
    const porPotencia = R.modo !== 'muestra';
    return {
        titulo: porPotencia ? 'Potencia para los efectos convencionales' : 'Tamaño de muestra para los efectos convencionales',
        cabecera: ['Efecto', P.simbolo, porPotencia ? 'Potencia' : (P.unidad ? `n ${P.unidad}` : 'N'), ...(porPotencia || !P.unidad ? [] : ['N total'])],
        filas: R.alternativos.map(a => porPotencia
            ? [a.nombre, R.prueba === 'r' ? prob(a.efecto, 2) : fx(a.efecto, 2), a.n === null ? '—' : prob(a.n)]
            : [a.nombre, R.prueba === 'r' ? prob(a.efecto, 2) : fx(a.efecto, 2), a.n === null ? 'más de 10⁷' : String(a.n), ...(P.unidad ? [a.total === null ? '—' : String(a.total)] : [])]),
        nota: `${R.prueba === 'mediacion' ? `Rutas a = b de Fritz y MacKinnon (2007), con c′ = ${fx(R.cp, 2)}; potencia estimada por Monte Carlo (${R.R.toLocaleString('es')} réplicas).` : `Convenciones de Cohen (1988) para ${P.simbolo}.`} α = ${alfaTxt(R.alfa)}${colasTxt(R)}${porPotencia ? `; ${muestraTxt(R)}` : `; potencia de ${prob(R.potenciaDeseada, 2)}`}.`
    };
}

/**
 * El párrafo APA 7.
 * @param {ResultadoPotencia} R
 */
export function redactarPotencia(R) {
    const P = PRUEBAS[R.prueba], condiciones = `α = ${alfaTxt(R.alfa)}${colasTxt(R)}`;
    if (R.prueba === 'mediacion') {
        const sim = `por simulación de Monte Carlo (${R.R.toLocaleString('es')} réplicas, semilla ${R.semilla}) con la prueba de significación conjunta (Fritz y MacKinnon, 2007), para rutas ${efectoTxt(R)} (${magnitudTxt(R)}, según Cohen, 1988; con X y los errores de varianza 1, como en Fritz y MacKinnon), con ${condiciones}`;
        if (R.modo === 'muestra') return `El tamaño de la muestra para la mediación simple se estimó a priori ${sim}: para una potencia de ${prob(R.potenciaDeseada, 2)} se requieren ${requeridos(R, `potencia estimada = ${prob(R.potencia)}, EE = ${prob(/** @type {number} */ (R.ee))}`)}.`;
        return `La potencia de la mediación simple con la muestra disponible (${muestraPlana(R)}) se estimó ${sim}: ${prob(R.potencia)} (EE = ${prob(/** @type {number} */ (R.ee))}).`;
    }
    const exactas = R.prueba === 'r' ? 'con la distribución exacta de r (Hotelling, 1953), como G*Power 3.1 (Faul et al., 2007, 2009)' : 'con las distribuciones no centrales exactas, como G*Power 3.1 (Faul et al., 2007, 2009)';
    if (R.modo === 'muestra') return `El tamaño de la muestra se determinó a priori para ${art(R).un} ${P.nombre}${detalles(R)}, con un tamaño del efecto ${P.magnitud(R.efecto)} (${efectoTxt(R)}; ${P.cita}), α = ${alfaTxt(R.alfa)} y una potencia de ${prob(R.potenciaDeseada, 2)}, ${exactas}: se requieren ${requeridos(R, `potencia real = ${prob(R.potencia)}`)}.`;
    if (R.modo === 'potencia') return `Con la muestra disponible (${muestraPlana(R)}), la potencia ${art(R).del} ${P.nombre}${detalles(R)} para detectar un efecto ${P.magnitud(R.efecto)} (${efectoTxt(R)}; ${P.cita}) con α = ${alfaTxt(R.alfa)} fue de ${prob(R.potencia)}, calculada ${exactas}.`;
    return `Un análisis de sensibilidad (Lakens, 2022), ${exactas}, indicó que, con ${requeridos(R)} y α = ${alfaTxt(R.alfa)}, ${art(R).el} ${P.nombre}${detalles(R)} tiene una potencia de ${prob(R.potenciaDeseada, 2)} para detectar efectos de ${efectoTxt(R)} o mayores (${plural(P.magnitud(R.efecto))}; ${P.cita}).`;
}

/** Las referencias. @param {ResultadoPotencia} R */
export function referenciasPotencia(R) {
    if (R.prueba === 'mediacion') return referenciasDe(['fritz2007', 'cohen1988']);
    return referenciasDe(['cohen1988', 'faul2007', 'faul2009', ...(R.modo === 'sensibilidad' ? ['lakens2022'] : []), ...(R.prueba === 'r' ? ['hotelling1953'] : [])]);
}

/**
 * El documento de Word (con la curva de potencia, si se pudo pasar a imagen).
 * @param {ResultadoPotencia} R
 * @param {{ url: string, w: number, h: number } | null} png
 */
export function documentoWordPotencia(R, png) {
    const t = tablaAlternativos(R);
    const cuerpo = tituloWord('Análisis de potencia') + parrafoWord(redactarPotencia(R)) + (R.alternativos.length ? tablaWord({ numero: 1, ...t }) : '')
        + (R.prueba === 'mediacion' ? '' : figuraWord({ numero: 1, titulo: 'Curva de potencia', png, nota: `La potencia según el tamaño de la muestra para ${efectoTxt(R)} (α = ${alfaTxt(R.alfa)}${colasTxt(R)}); la línea discontinua marca la potencia de ${prob(potenciaDeReferencia(R), 2)}.` }));
    return documentoWord('Análisis de potencia', cuerpo + referenciasWord(referenciasPotencia(R)));
}
