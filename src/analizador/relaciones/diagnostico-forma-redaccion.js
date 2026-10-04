// analizador/relaciones/diagnostico-forma-redaccion.js — APA 7 del diagnóstico de forma (sin DOM): tablas, notas, párrafo
// (con el coeficiente que corresponde a la forma), referencias CITADAS y documento Word.
import { REF_NUBE, CABECERA_NUBE, filasNube, notaNube, parrafoNube } from './nube-redaccion.js';
import { REF_CONFIRMACION, CABECERA_CAMBIO, filasCambio, notaCambio, CABECERA_EQUIVALENCIA, filasEquivalencia, notaEquivalencia, parrafoConfirmacion } from './confirmacion-forma-redaccion.js';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f2 = x => (Number.isFinite(x) ? (Math.abs(x) < 0.005 ? 0 : x).toFixed(2).replace(/^(-?)0\./, '$1.') : '—');
const f3 = x => (Number.isFinite(x) ? x.toFixed(3).replace(/^(-?)0\./, '$1.') : '—');
const fnum = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const fp = p => (!Number.isFinite(p) ? '—' : p < 0.001 ? '< .001' : p.toFixed(3).replace(/^0\./, '.'));
const pAPA = p => (!Number.isFinite(p) ? '' : p < 0.001 ? 'p < .001' : `p = ${p.toFixed(3).replace(/^0\./, '.')}`);
const ic = v => `[${f2(v[0])}, ${f2(v[1])}]`;
// p por permutaciones: si ninguna permutación iguala lo observado, p = 1/(B + 1) es solo una cota superior («p ≤ …»)
const esCota = c => Number.isFinite(c.p) && c.p <= 1 / (c.B + 1) + 1e-12;
const fpPerm = c => (esCota(c) ? `≤ ${c.p.toFixed(3).replace(/^0\./, '.')}` : fp(c.p));
const pPermAPA = c => (esCota(c) ? `p ≤ ${c.p.toFixed(3).replace(/^0\./, '.')}` : pAPA(c.p));

export const CABECERA_COEFICIENTES = ['Coeficiente', 'Qué mide', 'Valor', 'IC 95 %', 'p'];
export const filasCoeficientes = d => {
    const c = d.coeficientes;
    return [
        ['r de Pearson', 'Relación recta', f2(c.r.valor), ic(c.r.ic), fp(c.r.p)],
        ['ρ de Spearman', 'Relación monotónica (rangos)', f2(c.rho.valor), ic(c.rho.ic), fp(c.rho.p)],
        ['τ-b de Kendall', 'Relación monotónica (pares)', f2(c.tau.valor), '—', fp(c.tau.p)],
        ['dCor', 'Cualquier dependencia', f2(c.dcor.dcor), '—', fpPerm(c.dcor)],
        ['η por tramos', 'Diferencias entre medias por tramos de X', f2(c.eta.eta), '—', fp(c.eta.p)]
    ];
};
export const notaCoeficientes = d => `n = ${d.n}. IC de r por la transformación de Fisher; el de ρ, con el error típico de Fieller et al. (1957). τ-b con corrección por empates (Kendall, 1945). dCor: correlación de distancias (Székely et al., 2007), p por ${d.coeficientes.dcor.B} permutaciones${d.coeficientes.dcor.nPermutacion < d.n ? ` sobre una submuestra de ${d.coeficientes.dcor.nPermutacion} casos` : ''}${d.coeficientes.dcor.n < d.n ? `; su valor, sobre una submuestra de ${d.coeficientes.dcor.n}` : ''}. η por tramos: ${d.coeficientes.eta.grupos} tramos de X, p del ANOVA de un factor.`;

export const CABECERA_MODELOS = ['Forma', 'k', 'R²', 'AICc', 'ΔAICc', 'Peso'];
export const filasModelos = d => d.modelos.map(m => [m.nombre + (m === d.modeloDescriptivo ? ' *' : ''), String(m.k), f2(m.r2), fnum(m.aicc, 1), fnum(m.delta, 2), f2(m.peso)]);
export const notaModelos = d => `Modelos ajustados por mínimos cuadrados; k = parámetros estimados (incluida la varianza del error). AICc: criterio de Akaike corregido para muestras pequeñas (Hurvich y Tsai, 1989); peso de Akaike: probabilidad relativa de cada forma dentro del conjunto (Burnham y Anderson, 2002). ${d.modelos[0].n < d.n ? `Ajuste sobre una submuestra determinista de ${d.modelos[0].n} casos (X tiene más de 20 000 valores distintos). ` : ''}Si hay relación y si es lineal se decide con dos pruebas por permutaciones que incluyen la búsqueda de umbrales, periodos y curvaturas (B = ${d.pruebas.B}${d.pruebas.submuestra ? `; X tiene más de 2 000 valores distintos, así que se aplican a una submuestra determinista de ${d.pruebas.n} casos y la de relación se combina por Bonferroni con la r de Pearson de la base completa` : ''}): la de relación permuta Y y combina, por el mínimo p (Westfall y Young, 1993), la mejora de la recta y la de la mejor forma sobre el modelo sin relación (p = ${fpPerm({ p: d.pruebas.relacion.p, B: d.pruebas.B })}); la de no linealidad cambia al azar el signo de los residuos de la recta (bootstrap salvaje; Davidson y Flachaire, 2008), válida aunque la dispersión cambie (p = ${fpPerm({ p: d.pruebas.noLineal.p, B: d.pruebas.B })}). * Forma elegida.`;

const REF = {
    ...REF_CONFIRMACION,
    ...REF_NUBE,
    westfall: 'Westfall, P. H. y Young, S. S. (1993). <i>Resampling-based multiple testing: Examples and methods for p-value adjustment</i>. Wiley.',
    davidson: 'Davidson, R. y Flachaire, E. (2008). The wild bootstrap, tamed at last. <i>Journal of Econometrics, 146</i>(1), 162–169. https://doi.org/10.1016/j.jeconom.2008.08.003',
    burnham: 'Burnham, K. P. y Anderson, D. R. (2002). <i>Model selection and multimodel inference: A practical information-theoretic approach</i> (2.ª ed.). Springer. https://doi.org/10.1007/b97636',
    fieller: 'Fieller, E. C., Hartley, H. O. y Pearson, E. S. (1957). Tests for rank correlation coefficients. I. <i>Biometrika, 44</i>(3/4), 470–481. https://doi.org/10.1093/biomet/44.3-4.470',
    hurvich: 'Hurvich, C. M. y Tsai, C.-L. (1989). Regression and time series model selection in small samples. <i>Biometrika, 76</i>(2), 297–307. https://doi.org/10.1093/biomet/76.2.297',
    kendall: 'Kendall, M. G. (1945). The treatment of ties in ranking problems. <i>Biometrika, 33</i>(3), 239–251. https://doi.org/10.1093/biomet/33.3.239',
    szekely: 'Székely, G. J., Rizzo, M. L. y Bakirov, N. K. (2007). Measuring and testing dependence by correlation of distances. <i>The Annals of Statistics, 35</i>(6), 2769–2794. https://doi.org/10.1214/009053607000000505'
};
const plano = s => s.replace(/<[^>]+>/g, '');
export function citada(referencia, texto) {
    const t = plano(referencia), apellido = t.split(',')[0].trim(), anio = (t.match(/\((\d{4})\)/) || [])[1];
    return !!anio && new RegExp(`${apellido}(?: (?:y|et al\\.)[^()]*?)?,? \\(?${anio}`).test(texto);
}

const giroTexto = (g, nx) => `${g.tipo === 'máximo' ? 'un máximo' : 'un mínimo'} hacia ${nx} ≈ ${fnum(g.x, 1)}`;
export function redactarParrafo(d, nx, ny) {
    const c = d.coeficientes, m = d.mejor, lin = d.modelos.find(q => q.id === 'lineal'), cte = d.modelos.find(q => q.id === 'constante'), partes = [];
    partes.push(`Para describir la forma de la relación entre ${nx} y ${ny} (n = ${d.n}) se compararon diez formas candidatas mediante el AICc (Hurvich y Tsai, 1989), con pesos de Akaike (Burnham y Anderson, 2002).`);
    // la prueba de relación, descrita según cómo se calculó (base completa, o submuestra combinada por Bonferroni)
    const pruebaRelacion = d.pruebas.submuestra ? 'prueba por permutaciones con el mínimo p de Westfall y Young, 1993, sobre una submuestra, combinada por Bonferroni con la r de la base completa' : 'prueba por permutaciones con el mínimo p de Westfall y Young, 1993';
    const g = d.descripcion.grupo, coef = d.coefRecomendado, pg = pPermAPA({ p: d.pruebas.relacion.p, B: d.pruebas.B }), pnl = pPermAPA({ p: d.pruebas.noLineal.p, B: d.pruebas.B });
    if (g === 'sin') {
        // (2026.10.30) sin contradecir a la tabla: si la r o la dCor son significativas por sí solas, se dice y se explica
        partes.push(`Ninguna forma, ni siquiera la recta, mejoró al modelo sin relación más de lo esperable por azar (${pruebaRelacion}; ${pg}).`);
        if (c.r.p < 0.05) partes.push(`La r de Pearson, por sí sola, sí fue significativa (r = ${f2(c.r.valor)}, ${pAPA(c.r.p)}), pero al contrastar a la vez la recta y las demás formas la evidencia no alcanzó el nivel de significación: si hay relación, es débil.`);
        partes.push(c.dcor.p < 0.05
            ? `La correlación de distancias, que detecta cualquier tipo de dependencia (Székely et al., 2007), sí fue significativa (dCor = ${f2(c.dcor.dcor)}, ${pPermAPA(c.dcor)}): hay indicios de alguna dependencia que ninguna de las formas candidatas recoge con claridad, y conviene inspeccionar el diagrama de dispersión.`
            : `Tampoco la correlación de distancias, que detecta cualquier tipo de dependencia (Székely et al., 2007), fue significativa (dCor = ${f2(c.dcor.dcor)}, ${pPermAPA(c.dcor)}).${c.r.p < 0.05 ? '' : ' No se halló evidencia de relación.'}`);
    }
    else if (g === 'lineal') {
        const base = `Hay relación (${pruebaRelacion}; ${pg}), pero ninguna forma curva mejoró a la recta más de lo esperable por azar (prueba de no linealidad por bootstrap salvaje de los residuos, ${pnl}; Davidson y Flachaire, 2008), de modo que la relación es lineal`;
        if (coef === 'τ') {
            const ambas = d.categorias.x <= 7 && d.categorias.y <= 7, ordinal = ambas ? 'ambas variables tienen' : `${d.categorias.x <= 7 ? nx : ny} tiene`;
            const cuantas = ambas ? `${d.categorias.x} y ${d.categorias.y}` : String(Math.min(d.categorias.x, d.categorias.y));
            partes.push(`${base}; como ${ordinal} pocas categorías (${cuantas}), se describe con la τ-b de Kendall (Kendall, 1945), que no supone distancias iguales entre ellas: τ-b = ${f2(c.tau.valor)}, ${pAPA(c.tau.p)}; la r de Pearson (r = ${f2(c.r.valor)}) sí las supondría.`);
        } else partes.push(`${base} y se describe con la r de Pearson: r = ${f2(c.r.valor)}, IC 95 % ${ic(c.r.ic)}, ${pAPA(c.r.p)}.`);
    }
    else if (g === 'monotonica') {
        partes.push(`La mejor forma fue la ${m.nombre.toLowerCase()} (R² = ${f2(m.r2)}, peso de Akaike = ${f2(m.peso)}), y las curvas mejoraron a la recta más de lo esperable por azar (prueba de no linealidad por bootstrap salvaje de los residuos, ${pnl}; Davidson y Flachaire, 2008): la relación es ${d.descripcion.nombre}.`);
        partes.push(coef === 'τ'
            ? `Al ser monotónica pero no lineal, y con ${d.n < 30 ? 'una muestra pequeña' : 'una variable de pocas categorías'}, se describe con la τ-b de Kendall (Kendall, 1945): τ-b = ${f2(c.tau.valor)}, ${pAPA(c.tau.p)}; la r de Pearson (r = ${f2(c.r.valor)}) solo capta su parte recta.`
            : `Al ser monotónica pero no lineal, se describe con la correlación por rangos de Spearman: ρ = ${f2(c.rho.valor)}, IC 95 % ${ic(c.rho.ic)}, ${pAPA(c.rho.p)} (Fieller et al., 1957); la r de Pearson (r = ${f2(c.r.valor)}) solo capta su parte recta.`);
    } else {
        const giros = (d.clasificacion.giros || []).map(gi => giroTexto(gi, nx));
        partes.push(`La mejor forma fue la ${m.nombre.toLowerCase()} (R² = ${f2(m.r2)}, peso de Akaike = ${f2(m.peso)}), y las curvas mejoraron a la recta más de lo esperable por azar (prueba de no linealidad por bootstrap salvaje de los residuos, ${pnl}; Davidson y Flachaire, 2008): la relación es ${d.descripcion.nombre}${giros.length ? `, con ${giros.join(' y ')}` : ''}.`);
        partes.push(`Como cambia de sentido, ni la r de Pearson (r = ${f2(c.r.valor)}, ${pAPA(c.r.p)}) ni la ρ de Spearman (ρ = ${f2(c.rho.valor)}, ${pAPA(c.rho.p)}) la describen; la correlación de distancias confirma la dependencia (dCor = ${f2(c.dcor.dcor)}, ${pPermAPA(c.dcor)}; Székely et al., 2007), y la relación se informa con el modelo ajustado (R² = ${f2(m.r2)}).`);
    }
    const confirmacion = parrafoConfirmacion(d.confirmacion, nx);
    if (confirmacion) partes.push(confirmacion);
    return partes.join(' ');
}
// tabla 3 (opcional): confirmación del cambio de sentido o prueba de equivalencia
export const tablaConfirmacion = (d, nx) => !d.confirmacion ? null : d.confirmacion.tipo === 'equivalencia'
    ? { titulo: 'Prueba de equivalencia de la relación lineal', cabecera: CABECERA_EQUIVALENCIA, filas: filasEquivalencia(d.confirmacion), nota: notaEquivalencia(d.confirmacion) }
    : { titulo: 'Confirmación del cambio de sentido', cabecera: CABECERA_CAMBIO, filas: filasCambio(d.confirmacion, nx), nota: notaCambio(d.confirmacion) };
export const referenciasDiagnostico = (d, nx = 'X', ny = 'Y') => {
    const t3 = tablaConfirmacion(d, nx), texto = [redactarParrafo(d, nx, ny), notaCoeficientes(d), notaModelos(d), t3 ? t3.nota : '', d.nube ? parrafoNube(d.nube, nx, ny, d.categoria) + ' ' + notaNube(d.nube) : ''].join(' ');
    return Object.values(REF).filter(r => citada(r, texto)).sort((a, b) => plano(a).localeCompare(plano(b), 'es'));
};

function tablaWord(numero, titulo, cab, filas, nota) {
    const th = cab.map(h => `<td style="border-top:1pt solid black;border-bottom:1pt solid black;padding:3pt 4pt;font-weight:bold;">${esc(h)}</td>`).join('');
    const tr = filas.map((f, i) => '<tr>' + f.map((c, j) => `<td${j > 1 ? ' nowrap' : ''} style="padding:2pt 4pt;${i === filas.length - 1 ? 'border-bottom:1pt solid black;' : ''}">${esc(c)}</td>`).join('') + '</tr>').join('');
    return `<p style="margin:14pt 0 0;line-height:200%;"><b>Tabla ${numero}</b></p><p style="margin:0 0 6pt;line-height:200%;"><i>${esc(titulo)}</i></p>
        <table width="100%" cellspacing="0" style="border-collapse:collapse;font-size:10pt;line-height:115%;"><tr>${th}</tr>${tr}</table>
        <p style="margin:4pt 0 0;font-size:10pt;line-height:150%;"><i>Nota.</i> ${esc(nota)}</p>`;
}
export function documentoWord(d, nx, ny) {
    const cuerpo = `<p style="margin:0 0 8pt;line-height:200%;text-align:center;"><b>Forma de la relación entre ${esc(nx)} y ${esc(ny)}</b></p>
        <p style="margin:0;line-height:200%;text-align:justify;text-indent:0.5in;">${esc(redactarParrafo(d, nx, ny))}</p>
        ${tablaWord(1, `Coeficientes de asociación entre ${nx} y ${ny}`, CABECERA_COEFICIENTES, filasCoeficientes(d), notaCoeficientes(d))}
        ${tablaWord(2, `Comparación de formas de la relación entre ${nx} y ${ny}`, CABECERA_MODELOS, filasModelos(d), notaModelos(d))}
        ${(t3 => (t3 ? tablaWord(3, `${t3.titulo}: ${nx} y ${ny}`, t3.cabecera, t3.filas, t3.nota) : ''))(tablaConfirmacion(d, nx))}
        ${d.nube ? `<p style="margin:12pt 0 0;line-height:200%;text-align:justify;text-indent:0.5in;">${esc(parrafoNube(d.nube, nx, ny, d.categoria))}</p>${tablaWord(tablaConfirmacion(d, nx) ? 4 : 3, `Diagnóstico de la nube de puntos: ${nx} y ${ny}`, CABECERA_NUBE, filasNube(d.nube, nx, ny), notaNube(d.nube))}` : ''}
        <p style="margin:18pt 0 8pt;line-height:200%;text-align:center;"><b>Referencias</b></p>${referenciasDiagnostico(d, nx, ny).map(x => `<p style="margin:0;line-height:200%;padding-left:0.5in;text-indent:-0.5in;">${x}</p>`).join('')}`;
    return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
        <head><meta charset="utf-8"><title>Forma de la relación</title><!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
        <style>body{font-family:"Times New Roman",serif;font-size:12pt;}</style></head><body>${cuerpo}</body></html>`;
}
