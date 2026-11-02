// @ts-check
// analizador/relaciones/correlacion-parcial-redaccion.js — (2027.01.17) lo que se escribe de una correlación parcial: la
// tabla (orden cero, parcial con su intervalo, semiparciales y su cuadrado), la redacción APA 7, las referencias y el Word.
// Sin DOM.
import { formatoP, pConSigno, numeroConMenos } from '../../shared/formato-numero.js';
import { magnitudR } from '../motor/magnitudes.js';
import { referenciasDe } from '../informe/referencias-apa.js';
import { tituloWord, parrafoWord, tablaWord, referenciasWord, documentoWord } from '../informe/word-apa.js';
import { conjuncionY, listaY as lista } from '../../shared/texto-es.js';

/** @typedef {NonNullable<ReturnType<typeof import('../../core/stats/correlacion-parcial.js').correlacionParcial>>} ResultadoParcial */
/** @typedef {{ x: string, y: string, controles: string[], excluidos: number, motivo: string }} ContextoParcial */

/** Un coeficiente sin el cero inicial: «.45», «−.30». @param {number} v @param {number} [d] */
const fc = (v, d = 2) => (Number.isFinite(v) ? numeroConMenos(v, d).replace(/^(−?)0\./, '$1.') : '—');

/**
 * La tabla de la correlación parcial.
 * @param {ResultadoParcial} r
 * @param {ContextoParcial} ctx
 * @param {number} alfa
 */
export function tablaParcial(r, ctx, alfa) {
    const s = r.spearman ? 'ρ' : 'r', niv = `${Math.round(100 * r.nivel)} %`;
    return {
        titulo: `Correlación ${r.spearman ? 'de Spearman ' : ''}de ${ctx.x} ${conjuncionY(ctx.y)} ${ctx.y}, controlando ${lista(ctx.controles)}`,
        cabecera: ['Coeficiente', 'Valor', `IC ${niv}`, 'Cuadrado', 't', 'gl', 'p'],
        filas: [
            ['De orden cero (sin controlar)', fc(r.ordenCero, 3), '—', fc(r.ordenCero * r.ordenCero, 3), '—', '—', '—'],
            ['Parcial', fc(r.parcial, 3), r.ic ? `[${fc(r.ic.inferior, 3)}, ${fc(r.ic.superior, 3)}]` : '—', fc(r.parcial * r.parcial, 3), numeroConMenos(r.t, 2), String(r.gl), formatoP(r.pValor, { alfa })],
            [`Semiparcial de ${ctx.x} (sobre ${ctx.y})`, fc(r.semiparcialX, 3), '—', fc(r.semiparcialX * r.semiparcialX, 3), numeroConMenos(r.t, 2), String(r.gl), formatoP(r.pValor, { alfa })],
            [`Semiparcial de ${ctx.y} (sobre ${ctx.x})`, fc(r.semiparcialY, 3), '—', fc(r.semiparcialY * r.semiparcialY, 3), numeroConMenos(r.t, 2), String(r.gl), formatoP(r.pValor, { alfa })]
        ],
        nota: `n = ${r.n}${ctx.excluidos ? ` (${ctx.excluidos} caso${ctx.excluidos === 1 ? '' : 's'} con algún perdido, fuera)` : ''}. ${r.spearman ? 'Sobre los rangos (Spearman). ' : ''}La parcial (${s}) correlaciona lo que de ${ctx.x} y de ${ctx.y} no explican las de control; la semiparcial de ${ctx.x}, ${ctx.y} entera con lo que de ${ctx.x} no explican ellas: su cuadrado es la parte de la varianza de ${ctx.y} que solo ${ctx.x} explica. Las tres se contrastan con la misma t (la del coeficiente de ${ctx.x} en la regresión de ${ctx.y} sobre ${ctx.x} y las de control). Intervalo por la z de Fisher (1921)${r.spearman ? ', con el error típico de Bonett y Wright (2000)' : ''}.`
    };
}

/**
 * El párrafo APA 7.
 * @param {ResultadoParcial} r
 * @param {ContextoParcial} ctx
 * @param {number} alfa
 */
export function redactarParcial(r, ctx, alfa) {
    const s = r.spearman ? 'ρ' : 'r', sig = r.pValor < alfa, niv = `${Math.round(100 * r.nivel)} %`;
    const cambio = Math.abs(r.parcial) < Math.abs(r.ordenCero) - 0.05 ? `más débil que la de orden cero (${s} = ${fc(r.ordenCero)}): parte de la relación se debe a ${lista(ctx.controles)}`
        : Math.abs(r.parcial) > Math.abs(r.ordenCero) + 0.05 ? `más fuerte que la de orden cero (${s} = ${fc(r.ordenCero)}): ${lista(ctx.controles)} la ${ctx.controles.length > 1 ? 'ocultaban' : 'ocultaba'} en parte (supresión)`
            : `parecida a la de orden cero (${s} = ${fc(r.ordenCero)}): ${lista(ctx.controles)} apenas la ${ctx.controles.length > 1 ? 'explican' : 'explica'}`;
    return `Se estimó la correlación ${r.spearman ? 'de Spearman ' : ''}parcial entre ${ctx.x} ${conjuncionY(ctx.y)} ${ctx.y} controlando ${lista(ctx.controles)}, ${ctx.motivo}. La correlación parcial ${sig ? 'fue estadísticamente significativa' : 'no fue estadísticamente significativa'}, ${s}(${r.gl}) = ${fc(r.parcial)}, IC ${niv} ${r.ic ? `[${fc(r.ic.inferior)}, ${fc(r.ic.superior)}]` : 'no estimable'}, p ${pConSigno(r.pValor, { alfa })} (α = ${String(alfa).replace(/^0\./, '.')}), con un tamaño del efecto ${magnitudR(r.parcial)} (Cohen, 1988), y fue ${cambio}. La semiparcial de ${ctx.x} (${fc(r.semiparcialX)}) indica que ${ctx.x} explica por sí sola un ${(100 * r.semiparcialX * r.semiparcialX).toFixed(1)} % de la varianza de ${ctx.y}, más allá de ${lista(ctx.controles)}.`;
}

/** Las referencias. @param {ResultadoParcial} r */
export function referenciasParcial(r) { return referenciasDe(r.spearman ? ['cohen1988', 'bonett2000', 'fisher1921'] : ['cohen1988', 'fisher1921']); }

/**
 * El documento de Word.
 * @param {ResultadoParcial} r
 * @param {ContextoParcial} ctx
 * @param {number} alfa
 */
export function documentoWordParcial(r, ctx, alfa) {
    const t = tablaParcial(r, ctx, alfa);
    const titulo = `Correlación parcial: ${ctx.x} ${conjuncionY(ctx.y)} ${ctx.y}`;
    return documentoWord(titulo, tituloWord(titulo) + parrafoWord(redactarParcial(r, ctx, alfa))
        + tablaWord({ numero: 1, titulo: t.titulo, cabecera: t.cabecera, filas: t.filas, nota: t.nota }) + referenciasWord(referenciasParcial(r)));
}
