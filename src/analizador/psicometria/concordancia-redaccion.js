// analizador/psicometria/concordancia-redaccion.js — APA 7 de la concordancia entre evaluadores (sin DOM): párrafo,
// tablas para pantalla y Word, documento Word y referencias citadas.
import { interpretarKappa, interpretarCCI } from './concordancia.js';
import { REFERENCIA_BOOTSTRAP } from './referencias.js';

export const f2 = x => (Number.isFinite(x) ? x.toFixed(2).replace(/^(-?)0\./, '$1.') : '—');
const ic = v => (v ? `[${f2(v.inferior ?? v[0])}, ${f2(v.superior ?? v[1])}]` : '—');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const REF = {
    cohen60: 'Cohen, J. (1960). A coefficient of agreement for nominal scales. <i>Educational and Psychological Measurement, 20</i>(1), 37–46. https://doi.org/10.1177/001316446002000104',
    cohen68: 'Cohen, J. (1968). Weighted kappa: Nominal scale agreement provision for scaled disagreement or partial credit. <i>Psychological Bulletin, 70</i>(4), 213–220. https://doi.org/10.1037/h0026256',
    fleiss: 'Fleiss, J. L. (1971). Measuring nominal scale agreement among many raters. <i>Psychological Bulletin, 76</i>(5), 378–382. https://doi.org/10.1037/h0031619',
    koo: 'Koo, T. K. y Li, M. Y. (2016). A guideline of selecting and reporting intraclass correlation coefficients for reliability research. <i>Journal of Chiropractic Medicine, 15</i>(2), 155–163. https://doi.org/10.1016/j.jcm.2016.02.012',
    landis: 'Landis, J. R. y Koch, G. G. (1977). The measurement of observer agreement for categorical data. <i>Biometrics, 33</i>(1), 159–174. https://doi.org/10.2307/2529310',
    mcgraw: 'McGraw, K. O. y Wong, S. P. (1996). Forming inferences about some intraclass correlation coefficients. <i>Psychological Methods, 1</i>(1), 30–46. https://doi.org/10.1037/1082-989X.1.1.30',
    shrout: 'Shrout, P. E. y Fleiss, J. L. (1979). Intraclass correlations: Uses in assessing rater reliability. <i>Psychological Bulletin, 86</i>(2), 420–428. https://doi.org/10.1037/0033-2909.86.2.420'
};
export function referenciasConcordancia(r) {
    const c = [];
    if (r.kappa) { c.push('landis'); c.push(r.kappa.tipo === 'fleiss' ? 'fleiss' : 'cohen60'); if (r.kappa.ponderados) c.push('cohen68'); }
    if (r.cci) c.push('shrout', 'mcgraw', 'koo');
    const refs = c.map(k => REF[k]);
    if (r.kappa) refs.push(REFERENCIA_BOOTSTRAP);
    return refs.sort((a, b) => a.replace(/<[^>]+>/g, '').localeCompare(b.replace(/<[^>]+>/g, ''), 'es'));
}

export function tablaKappa(r) {
    const K = r.kappa, filas = [[K.tipo === 'fleiss' ? 'κ de Fleiss' : 'κ de Cohen', f2(K.valor), ic(K.ic), interpretarKappa(K.valor)]];
    if (K.ponderados) for (const [nombre, v] of [['κ ponderado lineal', K.ponderados.lineal], ['κ ponderado cuadrático', K.ponderados.cuadratico]]) filas.push([nombre, f2(v.valor), ic(v.ic), interpretarKappa(v.valor)]);
    return { cabecera: ['Coeficiente', 'Valor', 'IC 95 %', 'Concordancia'], filas,
        nota: `n = ${r.n} sujetos; ${r.evaluadores} evaluadores; ${r.categorias} categorías. IC bootstrap percentil (B = ${K.B}; semilla ${K.semilla}). Interpretación de Landis y Koch (1977).` };
}
export function tablaCCI(r) {
    return { cabecera: ['Forma', 'Modelo', 'Tipo', 'Medida', 'CCI', 'IC 95 %', 'Fiabilidad'],
        filas: r.cci.formas.map(f => [f.clave + (f.recomendado ? ' *' : ''), f.modelo, f.tipo, f.medida, f2(f.valor), ic(f.ic), interpretarCCI(f.valor)]),
        nota: `n = ${r.n} sujetos; ${r.evaluadores} evaluadores. Formas de Shrout y Fleiss (1979) con IC exactos por la distribución F (McGraw y Wong, 1996). * Recomendada cuando los evaluadores representan a otros posibles (Koo y Li, 2016). Interpretación de Koo y Li (2016).` };
}

export function redactarParrafo(r, que) {
    const partes = [];
    if (r.kappa) {
        const K = r.kappa;
        partes.push(`La concordancia entre ${r.evaluadores === 2 ? 'los dos evaluadores' : `los ${r.evaluadores} evaluadores`} en ${que} se estimó con el coeficiente κ de ${K.tipo === 'fleiss' ? 'Fleiss (1971)' : 'Cohen (1960)'}: κ = ${f2(K.valor)}, IC 95 % ${ic(K.ic)} (bootstrap percentil, B = ${K.B}; Efron y Tibshirani, 1993), lo que corresponde a una concordancia ${interpretarKappa(K.valor)} (Landis y Koch, 1977).`);
        if (K.ponderados) partes.push(`Al tratarse de categorías ordenadas, se estimó además el κ ponderado (Cohen, 1968): lineal, κ = ${f2(K.ponderados.lineal.valor)} ${ic(K.ponderados.lineal.ic)}; cuadrático, κ = ${f2(K.ponderados.cuadratico.valor)} ${ic(K.ponderados.cuadratico.ic)}.`);
    }
    if (r.cci) {
        const f2a = r.cci.formas[1], f2k = r.cci.formas[4];
        partes.push(`La fiabilidad entre evaluadores${r.kappa ? '' : ` en ${que}`} se estimó con el coeficiente de correlación intraclase de dos factores, efectos aleatorios y acuerdo absoluto (Shrout y Fleiss, 1979; McGraw y Wong, 1996): CCI(2,1) = ${f2(f2a.valor)}, IC 95 % ${ic(f2a.ic)}, para un evaluador, y ${f2k.clave} = ${f2(f2k.valor)}, IC 95 % ${ic(f2k.ic)}, para el promedio de los ${r.evaluadores}, lo que indica una fiabilidad ${interpretarCCI(f2a.valor)} para las puntuaciones de un evaluador y ${interpretarCCI(f2k.valor)} para su promedio (Koo y Li, 2016).`);
    }
    return partes.join(' ');
}

function tablaWord(numero, titulo, t) {
    const th = t.cabecera.map(h => `<td style="border-top:1pt solid black;border-bottom:1pt solid black;padding:3pt 4pt;font-weight:bold;">${esc(h)}</td>`).join('');
    const tr = t.filas.map((f, i) => '<tr>' + f.map(c => `<td style="padding:2pt 4pt;${i === t.filas.length - 1 ? 'border-bottom:1pt solid black;' : ''}">${esc(c)}</td>`).join('') + '</tr>').join('');
    return `<p style="margin:14pt 0 0;line-height:200%;"><b>Tabla ${numero}</b></p><p style="margin:0 0 6pt;line-height:200%;"><i>${esc(titulo)}</i></p>
        <table width="100%" cellspacing="0" style="border-collapse:collapse;font-size:11pt;line-height:115%;"><tr>${th}</tr>${tr}</table>
        <p style="margin:4pt 0 0;font-size:11pt;line-height:150%;"><i>Nota.</i> ${esc(t.nota)}</p>`;
}
export function documentoWord(r, que) {
    let n = 0, cuerpo = `<p style="margin:0 0 8pt;line-height:200%;text-align:center;"><b>Concordancia entre evaluadores: ${esc(que)}</b></p>
        <p style="margin:0;line-height:200%;text-align:justify;text-indent:0.5in;">${esc(redactarParrafo(r, que))}</p>`;
    if (r.kappa) cuerpo += tablaWord(++n, `Concordancia entre evaluadores (${que})`, tablaKappa(r));
    if (r.cci) cuerpo += tablaWord(++n, `Coeficientes de correlación intraclase (${que})`, tablaCCI(r));
    cuerpo += '<p style="margin:18pt 0 8pt;line-height:200%;text-align:center;"><b>Referencias</b></p>' + referenciasConcordancia(r).map(x => `<p style="margin:0;line-height:200%;padding-left:0.5in;text-indent:-0.5in;">${x}</p>`).join('');
    return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
        <head><meta charset="utf-8"><title>Concordancia entre evaluadores</title><!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
        <style>body{font-family:"Times New Roman",serif;font-size:12pt;}</style></head><body>${cuerpo}</body></html>`;
}
