// analizador/psicometria/invarianza-redaccion.js — APA 7 de la invarianza de medición (sin DOM): tabla de niveles con
// sus cambios, tabla de medias latentes, párrafo, referencias citadas y documento Word.
import { CRITERIOS_CHEN } from './invarianza.js';
import { REFERENCIAS_WLSMV } from './referencias.js';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const f2 = x => (Number.isFinite(x) ? x.toFixed(2) : '—');
export const f3 = x => (Number.isFinite(x) ? (Math.abs(x) < 5e-4 ? 0 : x).toFixed(3).replace(/^(-?)0\./, '$1.') : '—');
const fp = p => (!Number.isFinite(p) ? '—' : p < 0.001 ? '< .001' : p.toFixed(3).replace(/^0\./, '.'));
const pAPA = p => (!Number.isFinite(p) ? '' : p < 0.001 ? 'p < .001' : `p = ${p.toFixed(3).replace(/^0\./, '.')}`);
const lista = xs => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`);
export const ROTULO_NIVEL = { configural: 'Configural', metrica: 'Métrica (cargas)', escalar: 'Escalar (interceptos)', estricta: 'Estricta (residuos)' };
const ROTULO_ORDINAL = { configural: 'Configural', umbrales: 'Umbrales', metrica: 'Métrica (umbrales y cargas)', escalar: 'Escalar (umbrales, cargas e interceptos)' };
const esW = r => r.estimador === 'WLSMV';
const rotulo = (r, nivel) => (esW(r) ? ROTULO_ORDINAL : ROTULO_NIVEL)[nivel];

// Dos tablas (como en APA): ajuste de cada modelo y comparaciones entre niveles; en vertical, 14 columnas no caben
const ROTULO_CORTO = { configural: 'Configural', umbrales: 'Umbrales', metrica: 'Métrica', escalar: 'Escalar', estricta: 'Estricta' };
export const CABECERA_AJUSTE = ['Modelo', 'χ²', 'gl', 'p', 'CFI', 'TLI', 'RMSEA', 'IC 90 %', 'SRMR'];
export const filasAjuste = r => r.niveles.map(R => [rotulo(r, R.nivel), f2(R.chi2), String(R.gl), fp(R.p), f3(R.CFI), f3(R.TLI), f3(R.RMSEA), `[${f3(R.RMSEAic[0])}, ${f3(R.RMSEAic[1])}]`, f3(R.srmr)]);
export const notaAjuste = r => `N = ${r.N} (${r.grupos.map(g => `${g.nombre}: n = ${g.n}`).join('; ')}). ${esW(r) ? 'WLSMV: DWLS sobre los umbrales y las correlaciones policóricas de cada grupo (Muthén, 1984), con χ² corregido en media y varianza (Asparouhov y Muthén, 2010); parametrización delta con la identificación de Wu y Estabrook (2016); primera carga de cada factor fija en 1. RMSEA con la corrección multigrupo de Steiger (1998); SRMR de las correlaciones policóricas.' : 'Máxima verosimilitud con estructura de medias; primera carga de cada factor fija en 1. RMSEA con la corrección multigrupo de Steiger (1998); SRMR con los residuos de covarianzas y medias.'}${r.niveles[0].saturado ? ' El modelo configural está saturado (gl = 0): reproduce los datos exactamente.' : ''}`;
export const CABECERA_COMPARACIONES = ['Comparación', 'Δχ²', 'Δgl', 'p', 'ΔCFI', 'ΔRMSEA', 'ΔSRMR', 'Decisión'];
export const filasComparaciones = r => r.niveles.slice(1).map((R, k) => [`${ROTULO_CORTO[R.nivel]} vs. ${ROTULO_CORTO[r.niveles[k].nivel].toLowerCase()}`,
    R.delta.equivalente ? '—' : f2(R.delta.chi2), String(R.delta.gl), R.delta.equivalente ? '—' : fp(R.delta.p), f3(R.delta.CFI), f3(R.delta.RMSEA), f3(R.delta.SRMR),
    R.decision.charAt(0).toUpperCase() + R.decision.slice(1) + (R.delta.estricto ? ' †' : '')]);
export const notaComparaciones = r => `${esW(r) ? `Δχ²: prueba DIFFTEST de la diferencia de χ² con corrección en media y varianza (Asparouhov y Muthén, 2006); es el contraste formal, porque los criterios de Chen (2007) se derivaron con máxima verosimilitud y datos continuos y con WLSMV se aplican por convención. ${r.niveles.some(R => R.delta && R.delta.equivalente) ? 'Equivalente: con ítems de tres categorías, el modelo de umbrales es un modelo equivalente al configural (Wu y Estabrook, 2016) y no se contrasta. ' : ''}` : ''}La invarianza no se sostiene si el CFI cae .010 o más y, además, el RMSEA sube .015 o más o el SRMR sube .030 (cargas) o .010 (interceptos y residuos) o más (Chen, 2007). El Δχ² es muy sensible al tamaño de la muestra (Cheung y Rensvold, 2002).${r.grupoPequeno ? ' Con grupos de menos de 300 casos, Chen (2007) sugiere además un criterio más estricto (ΔCFI ≤ −.005 con ΔRMSEA ≥ .010); † marca los niveles que no lo cumplirían.' : ''}`;

export const CABECERA_MEDIAS = ['Factor', 'Grupo', 'Diferencia (κ)', 'EE', 'z', 'p', 'd latente'];
export const filasMedias = r => r.medias.map(m => [m.factor, `${m.grupo} − ${m.referencia}`, f3(m.kappa), f3(m.se), f2(m.z), fp(m.p), f2(m.d)]);
export const notaMedias = r => `Modelo escalar; el grupo «${r.grupos[0].nombre}» es la referencia (media latente fija en 0). d latente = κ / √φ del grupo de referencia.`;

const REF = {
    chen: 'Chen, F. F. (2007). Sensitivity of goodness of fit indexes to lack of measurement invariance. <i>Structural Equation Modeling, 14</i>(3), 464–504. https://doi.org/10.1080/10705510701301834',
    cheung: 'Cheung, G. W. y Rensvold, R. B. (2002). Evaluating goodness-of-fit indexes for testing measurement invariance. <i>Structural Equation Modeling, 9</i>(2), 233–255. https://doi.org/10.1207/S15328007SEM0902_5',
    meredith: 'Meredith, W. (1993). Measurement invariance, factor analysis and factorial invariance. <i>Psychometrika, 58</i>(4), 525–543. https://doi.org/10.1007/BF02294825',
    steiger: 'Steiger, J. H. (1998). A note on multiple sample extensions of the RMSEA fit index. <i>Structural Equation Modeling, 5</i>(4), 411–419. https://doi.org/10.1080/10705519809540115',
    vandenberg: 'Vandenberg, R. J. y Lance, C. E. (2000). A review and synthesis of the measurement invariance literature: Suggestions, practices, and recommendations for organizational research. <i>Organizational Research Methods, 3</i>(1), 4–70. https://doi.org/10.1177/109442810031002'
};
REF.wu = 'Wu, H. y Estabrook, R. (2016). Identification of confirmatory factor analysis models of different levels of invariance for ordered categorical outcomes. <i>Psychometrika, 81</i>(4), 1014–1045. https://doi.org/10.1007/s11336-016-9506-0';
REF.difftest = 'Asparouhov, T. y Muthén, B. (2006). <i>Robust chi square difference testing with mean and variance adjusted test statistics</i> (Mplus Web Notes No. 10). Muthén & Muthén. https://www.statmodel.com/download/webnotes/webnote10.pdf';
const plano = s => s.replace(/<[^>]+>/g, '');
// Una referencia está citada si el texto contiene «Apellido (año)», «(Apellido, año», «Apellido y Otro, año» o similar
export function citada(referencia, texto) {
    const t = plano(referencia), apellido = t.split(',')[0].trim(), anio = (t.match(/\((\d{4})\)/) || [])[1];
    return !!anio && new RegExp(`${apellido}(?: (?:y|et al\\.)[^()]*?)?,? \\(?${anio}`).test(texto);
}
export const referenciasInvarianza = (r = {}) => {
    const texto = r.niveles ? [redactarParrafo(r), notaAjuste(r), notaComparaciones(r), r.medias && r.medias.length ? notaMedias(r) : ''].join(' ') : '';
    return [...Object.values(REF), ...REFERENCIAS_WLSMV].filter(ref => citada(ref, texto)).sort((a, b) => plano(a).localeCompare(plano(b), 'es'));
};

export function redactarParrafo(r) {
    const N = r.niveles, conf = N[0], partes = [];
    partes.push(esW(r)
        ? `Para evaluar la invarianza de medición entre los grupos de «${r.variableGrupo}» (${r.grupos.map(g => `${g.nombre}, n = ${g.n}`).join('; ')}) se estimaron modelos factoriales confirmatorios multigrupo para ítems ordinales por WLSMV sobre los umbrales y las correlaciones policóricas, siguiendo la secuencia de identificación de Wu y Estabrook (2016): configural, umbrales, métrica y escalar (Meredith, 1993; Vandenberg y Lance, 2000).`
        : `Para evaluar la invarianza de medición entre los grupos de «${r.variableGrupo}» (${r.grupos.map(g => `${g.nombre}, n = ${g.n}`).join('; ')}) se estimaron modelos factoriales confirmatorios multigrupo anidados por máxima verosimilitud con estructura de medias (Meredith, 1993; Vandenberg y Lance, 2000).`);
    if (r.agrupadas && r.agrupadas.length) partes.push(`Para que los umbrales fueran comparables, las categorías sin respuestas en algún grupo se agruparon con la contigua en todos los grupos (${r.agrupadas.map(a => `${a.item}: ${a.de} con ${a.en}`).join('; ')}).`);
    if (conf.saturado) partes.push('El modelo configural está saturado (gl = 0): reproduce exactamente las medias y covarianzas de cada grupo, de modo que la evaluación descansa en los niveles restringidos.');
    else partes.push(`El modelo configural ${conf.CFI >= 0.95 && conf.RMSEA <= 0.08 ? 'mostró un ajuste adecuado' : 'mostró un ajuste limitado, lo que obliga a interpretar con cautela los niveles siguientes'}, χ²(${conf.gl}) = ${f2(conf.chi2)}, ${pAPA(conf.p)}, CFI = ${f3(conf.CFI)}, RMSEA = ${f3(conf.RMSEA)} [${f3(conf.RMSEAic[0])}, ${f3(conf.RMSEAic[1])}], SRMR = ${f3(conf.srmr)}.`);
    const nombre = { umbrales: 'de umbrales', metrica: 'métrica', escalar: 'escalar', estricta: 'estricta' };
    const que = esW(r) ? { umbrales: 'umbrales iguales', metrica: 'umbrales y cargas iguales', escalar: 'umbrales, cargas e interceptos iguales' }
        : { metrica: 'cargas iguales', escalar: 'cargas e interceptos iguales', estricta: 'cargas, interceptos y varianzas residuales iguales' };
    const deltas = R => `ΔCFI = ${f3(R.delta.CFI)}, ΔRMSEA = ${f3(R.delta.RMSEA)}, ΔSRMR = ${f3(R.delta.SRMR)}; ${esW(r) ? 'DIFFTEST ' : ''}Δχ²(${R.delta.gl}) = ${f2(R.delta.chi2)}, ${pAPA(R.delta.p)}`;
    if (N.some(R => R.decision === 'equivalente')) partes.push('Con ítems de tres categorías, el modelo de umbrales iguales es equivalente al configural (Wu y Estabrook, 2016), de modo que ese paso no se contrasta.');
    const si = N.slice(1).filter(R => R.decision === 'se sostiene'), falla = N.find(R => R.decision === 'no se sostiene');
    if (si.length) partes.push(`Según los criterios de Chen (2007), se sostuvo la invarianza ${si.map((R, k) => `${k === 0 ? '' : k === si.length - 1 ? 'y la ' : 'la '}${nombre[R.nivel]}, con ${que[R.nivel]} (${deltas(R)})`).join('; ')}.`);
    const dudosos = si.filter(R => R.delta.estricto);
    if (dudosos.length) partes.push(`Con grupos de menos de 300 casos, el criterio más estricto de Chen (2007) (ΔCFI ≤ −.005 con ΔRMSEA ≥ .010) no respaldaría la invarianza ${lista(dudosos.map(R => nombre[R.nivel]))}, por lo que conviene interpretarla con cautela.`);
    if (falla) partes.push(`En cambio, no se sostuvo la invarianza ${nombre[falla.nivel]}, con ${que[falla.nivel]} (${deltas(falla)})${falla.nivel === 'umbrales' ? ': los umbrales de al menos un ítem difieren entre los grupos más allá de un cambio de origen y escala, de modo que sus categorías de respuesta no significan lo mismo en todos ellos' : falla.nivel === 'escalar' ? ': al menos un ítem tiene un intercepto distinto entre los grupos, de modo que las diferencias en las puntuaciones observadas no reflejan solo diferencias en el constructo y las medias no deberían compararse directamente' : falla.nivel === 'metrica' ? ': las cargas difieren entre los grupos, así que el constructo no se mide en la misma métrica y no procede comparar relaciones ni medias' : ''}.`);
    if (r.medias.length) {
        // solo se afirma una diferencia cuando es estadísticamente significativa
        const frase = m => (m.p < 0.05
            ? `en ${m.factor}, el grupo ${m.grupo} ${m.kappa >= 0 ? 'superó al' : 'quedó por debajo del'} grupo ${m.referencia} en ${f2(Math.abs(m.d))} DE latentes`
            : `en ${m.factor}, el grupo ${m.grupo} no difirió significativamente del grupo ${m.referencia}`) + ` (${m.p < 0.05 ? '' : `d = ${f2(m.d)}; `}κ = ${f3(m.kappa)}, EE = ${f3(m.se)}, z = ${f2(m.z)}, ${pAPA(m.p)})`;
        partes.push(`Con la invarianza escalar sostenida, las medias latentes pueden compararse: ${r.medias.map(frase).join('; ')}.`);
    }
    return partes.join(' ');
}

function tablaWord(numero, titulo, cab, filas, nota) {
    const th = cab.map(h => `<td style="border-top:1pt solid black;border-bottom:1pt solid black;padding:3pt 3pt;font-weight:bold;">${esc(h)}</td>`).join('');
    // las celdas numéricas no se parten (un intervalo cortado a mitad de número es ilegible)
    const tr = filas.map((f, i) => '<tr>' + f.map((c, j) => `<td${j > 0 ? ' nowrap' : ''} style="padding:2pt 3pt;${j > 0 ? 'white-space:nowrap;' : ''}${i === filas.length - 1 ? 'border-bottom:1pt solid black;' : ''}">${esc(c)}</td>`).join('') + '</tr>').join('');
    return `<p style="margin:14pt 0 0;line-height:200%;"><b>Tabla ${numero}</b></p><p style="margin:0 0 6pt;line-height:200%;"><i>${esc(titulo)}</i></p>
        <table width="100%" cellspacing="0" style="border-collapse:collapse;font-size:10pt;line-height:115%;"><tr>${th}</tr>${tr}</table>
        <p style="margin:4pt 0 0;font-size:10pt;line-height:150%;"><i>Nota.</i> ${esc(nota)}</p>`;
}
export function documentoWord(r) {
    let cuerpo = `<p style="margin:0 0 8pt;line-height:200%;text-align:center;"><b>Invarianza de medición según «${esc(r.variableGrupo)}»</b></p>
        <p style="margin:0;line-height:200%;text-align:justify;text-indent:0.5in;">${esc(redactarParrafo(r))}</p>`;
    cuerpo += tablaWord(1, `Ajuste de los modelos de invarianza según ${r.variableGrupo}`, CABECERA_AJUSTE, filasAjuste(r), notaAjuste(r));
    cuerpo += tablaWord(2, `Comparación entre niveles de invarianza según ${r.variableGrupo}`, CABECERA_COMPARACIONES, filasComparaciones(r), notaComparaciones(r));
    if (r.medias.length) cuerpo += tablaWord(3, 'Diferencias de medias latentes (modelo escalar)', CABECERA_MEDIAS, filasMedias(r), notaMedias(r));
    cuerpo += '<p style="margin:18pt 0 8pt;line-height:200%;text-align:center;"><b>Referencias</b></p>' + referenciasInvarianza(r).map(x => `<p style="margin:0;line-height:200%;padding-left:0.5in;text-indent:-0.5in;">${x}</p>`).join('');
    return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
        <head><meta charset="utf-8"><title>Invarianza de medición</title><!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
        <style>body{font-family:"Times New Roman",serif;font-size:12pt;}</style></head><body>${cuerpo}</body></html>`;
}
export { CRITERIOS_CHEN };
