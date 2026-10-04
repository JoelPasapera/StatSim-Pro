// analizador/relaciones/nube-redaccion.js — APA 7 del diagnóstico de la nube (sin DOM): tabla, nota, párrafo y
// referencias. Advierte expresamente cuando la esquina vacía se debe solo a la correlación (bordes paralelos), para que
// el análisis de condición necesaria no se interprete como necesidad sin serlo.
const f2 = x => (Number.isFinite(x) ? (Math.abs(x) < 0.005 ? 0 : x).toFixed(2).replace(/^(-?)0\./, '$1.') : '—');
const fx = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const fp = p => (!Number.isFinite(p) ? '—' : p < 0.001 ? '< .001' : p.toFixed(3).replace(/^0\./, '.'));
const pAPA = p => (!Number.isFinite(p) ? '' : p < 0.001 ? 'p < .001' : `p = ${p.toFixed(3).replace(/^0\./, '.')}`);
const esCota = c => Number.isFinite(c.p) && c.p <= 1 / (c.B + 1) + 1e-12;
const fpPerm = c => (esCota(c) ? `≤ ${c.p.toFixed(3).replace(/^0\./, '.')}` : fp(c.p));
const pPermAPA = c => (esCota(c) ? `p ≤ ${c.p.toFixed(3).replace(/^0\./, '.')}` : pAPA(c.p));
const pct = v => `${(100 * v).toFixed(1).replace(/\.0$/, '')} %`;

export const REF_NUBE = {
    cook: 'Cook, R. D. (1977). Detection of influential observation in linear regression. <i>Technometrics, 19</i>(1), 15–18. https://doi.org/10.1080/00401706.1977.10489493',
    cookw: 'Cook, R. D. y Weisberg, S. (1982). <i>Residuals and influence in regression</i>. Chapman and Hall.',
    // (revisión 2026.11.12) influencia en grupo: el MCD y su versión determinista
    rousseeuw84: 'Rousseeuw, P. J. (1984). Least median of squares regression. <i>Journal of the American Statistical Association, 79</i>(388), 871–880. https://doi.org/10.1080/01621459.1984.10477105',
    rvd99: 'Rousseeuw, P. J. y Van Driessen, K. (1999). A fast algorithm for the minimum covariance determinant estimator. <i>Technometrics, 41</i>(3), 212–223. https://doi.org/10.1080/00401706.1999.10485670',
    hubert12: 'Hubert, M., Rousseeuw, P. J. y Verdonck, T. (2012). A deterministic algorithm for robust location and scatter. <i>Journal of Computational and Graphical Statistics, 21</i>(3), 618–637. https://doi.org/10.1080/10618600.2012.672100',
    dul16: 'Dul, J. (2016). Necessary condition analysis (NCA): Logic and methodology of “necessary but not sufficient” causality. <i>Organizational Research Methods, 19</i>(1), 10–52. https://doi.org/10.1177/1094428115584005',
    dul20: 'Dul, J., van der Laan, E. y Kuik, R. (2020). A statistical significance test for necessary condition analysis. <i>Organizational Research Methods, 23</i>(2), 385–395. https://doi.org/10.1177/1094428118795272',
    koenker81: 'Koenker, R. (1981). A note on studentizing a test for heteroscedasticity. <i>Journal of Econometrics, 17</i>(1), 107–112. https://doi.org/10.1016/0304-4076(81)90062-2',
    koenker78: 'Koenker, R. y Bassett, G., Jr. (1978). Regression quantiles. <i>Econometrica, 46</i>(1), 33–50. https://doi.org/10.2307/1913643',
    terwee: 'Terwee, C. B., Bot, S. D. M., de Boer, M. R., van der Windt, D. A. W. M., Knol, D. L., Dekker, J., Bouter, L. M. y de Vet, H. C. W. (2007). Quality criteria were proposed for measurement properties of health status questionnaires. <i>Journal of Clinical Epidemiology, 60</i>(1), 34–42. https://doi.org/10.1016/j.jclinepi.2006.03.012',
    white80: 'White, H. (1980). A heteroskedasticity-consistent covariance matrix estimator and a direct test for heteroskedasticity. <i>Econometrica, 48</i>(4), 817–838. https://doi.org/10.2307/1912934'
};
const NOMBRE_PATRON = { paralela: 'Bordes paralelos', abanico: 'Abanico', techo: 'Triángulo con techo', suelo: 'Triángulo con suelo' };

export const CABECERA_NUBE = ['Aspecto', 'Prueba o índice', 'Resultado', 'p', 'Conclusión'];
const listaFilas = (filas, total) => `${filas.length === 1 ? 'fila' : 'filas'} ${filas.join(', ')}${total > filas.length ? ', entre otras' : ''}`;
export function filasNube(nb, nx, ny) {
    const h = nb.heterocedasticidad, q = nb.cuantiles, nc = nb.necesidad, inf = nb.influencia, ts = nb.techoSuelo, filas = [];
    filas.push(['Dispersión', 'Breusch–Pagan (Koenker), con X', h.bp.error ? '—' : `χ²(1) = ${fx(h.bp.lm)}`, fp(h.bp.p), h.bp.error ? h.bp.error : h.hay ? `Cambia: ${h.bp.sube ? 'crece' : 'decrece'} con ${nx}` : 'Homogénea'],
        ['', 'White, con X y X²', h.white.error ? '—' : `χ²(2) = ${fx(h.white.lm)}`, fp(h.white.p), '']);
    const noAplica = o => (o.motivo === 'no-monotona' ? 'No aplica: la tendencia cambia de sentido' : `No aplica: ${ny} tiene ${o.valoresY} valores distintos`);
    if (nb.patron.patron === 'no-aplica') filas.push(['Bordes de la nube', 'Regresión de cuantiles', noAplica(nb.patron), '—', '—']);
    else filas.push(['Bordes de la nube', 'Pendientes de cuantil τ = .10 / .50 / .90', q.pendientes.map(v => fx(v, 3)).join(' / '), '—', NOMBRE_PATRON[nb.patron.patron]],
        ['', 'Diferencia de pendientes (.90 − .10)', `${fx(q.diferencia.valor, 3)} [${fx(q.diferencia.ic[0], 3)}, ${fx(q.diferencia.ic[1], 3)}]`, '—', '']);
    if (nc.noAplica) filas.push(['Condición necesaria', 'NCA', noAplica(nc), '—', '—']);
    else if (nc.error) filas.push(['Condición necesaria', 'NCA', nc.error, '—', '—']);
    else filas.push(['Condición necesaria', `NCA, techo CE-FDH (${nc.direccion > 0 ? `${nx} alta` : `${nx} baja`} para ${ny} alta)`, `d = ${f2(nc.d)} (${nc.tamano})`, fpPerm(nc), nb.necesaria ? 'Condición necesaria' : nc.p < 0.05 && nc.d >= 0.1 ? (nb.patron.patron === 'techo' ? 'No respaldada' : 'Vacío explicado por la relación') : 'Sin evidencia'],
        ['', 'NCA, techo CR-FDH', Number.isFinite(nc.dCR) ? `d = ${f2(nc.dCR)}` : 'No definido (una esquina)', '—', '']);
    const marcas = [], resultado = [];
    for (const [t, nombre] of [[ts.y, ny], [ts.x, nx]]) {
        if (t.noAplica) { resultado.push(`${nombre}: no aplica (${t.valores} valores)`); continue; }
        resultado.push(`${nombre}: ${pct(t.pMax)} y ${pct(t.pMin)}`);
        if (t.techo) marcas.push(`${pct(t.pMax)} en el máximo de ${nombre}`); if (t.suelo) marcas.push(`${pct(t.pMin)} en el mínimo de ${nombre}`);
    }
    filas.push(['Techo o suelo de la medida', 'Casos en el valor máximo y en el mínimo observados', resultado.join('; '), '—', marcas.length ? marcas.join('; ') : ts.x.noAplica && ts.y.noAplica ? 'No aplica' : 'Sin efecto (≤ 15 %)']);
    if (inf.error) filas.push(['Atípicos influyentes', 'Distancia de Cook', inf.error, '—', '—']);
    else filas.push(['Atípicos influyentes', 'Distancia de Cook y residuos estudentizados', `D máx. = ${fx(inf.maxD, 3)}; ${inf.nMuyInfluyentes} con D > ${fx(inf.fMediana, 2)}; ${inf.nAtipicos} atípico(s)`, '—', inf.nMuyInfluyentes || inf.nAtipicos ? 'Hay casos que revisar' : 'Ninguno destacado'],
        ['', `Sensibilidad de r (sin los ${inf.nInfluyentes} casos con D > 4/n)`, `r = ${f2(inf.rTodos)} → ${f2(inf.rSin)}`, '—', inf.sensible ? 'La r depende de pocos casos' : Math.abs(inf.cambio) >= 0.1 ? 'Cambia, pero ningún caso destaca' : 'Estable']);
    // (revisión 2026.11.12) influencia en grupo: un grupo de casos juntos se enmascara en el análisis caso a caso
    if (!inf.error && inf.grupo) {
        const g = inf.grupo, motivo = g.motivo === 'pocos-casos' ? 'menos de 20 casos' : 'más de 5000 casos: unos pocos no mueven la r';
        filas.push(['', 'Influencia en grupo (MCD reponderado; p por remuestreo)', g.aplica === false ? `No aplica (${motivo})` : `r = ${f2(inf.rTodos)} → ${f2(g.rMayoria)} sin ${g.nFuera} caso${g.nFuera === 1 ? '' : 's'}`, g.aplica === false || g.p === null ? '—' : fp(g.p), inf.porGrupo ? (inf.enmascarados ? 'Un grupo mueve la r (enmascarado caso a caso)' : 'Un grupo de casos mueve la r') : '—']);
    }
    return filas;
}
export const notaNube = nb => `Breusch–Pagan en la versión de Koenker (1981), robusta a la falta de normalidad, sobre los residuos de la forma elegida; la versión con X y X² equivale a la prueba de White (1980). ${nb.cuantiles ? `Bordes: regresión de cuantiles (Koenker y Bassett, 1978) con IC al 95 % por remuestreo de pares (B = ${nb.cuantiles.B}${nb.cuantiles.nRemuestreo < nb.cuantiles.n ? `, sobre ${nb.cuantiles.nRemuestreo} casos` : ''}); un borde se considera plano si su pendiente es menor que la cuarta parte de la del otro. NCA: análisis de condición necesaria (Dul, 2016), p por ${nb.necesidad.B || 0} permutaciones (Dul et al., 2020); como esa prueba contrasta la independencia, solo se interpreta como necesidad con un techo triangular, dispersión que cambia y d ≥ .10. ` : ''}Con menos de 8 valores distintos no se evalúan los bordes ni la condición necesaria (si se trata de Y) ni el techo o suelo de esa variable: sus cuantiles avanzan a saltos y amontonarse en la categoría extrema es lo habitual. Techo o suelo: más del 15 % de los casos en el valor extremo observado (Terwee et al., 2007). Influencia en la recta de Y sobre X: distancia de Cook (1977), destacada si supera la mediana de F(2, n − 2) (Cook y Weisberg, 1982), y residuos estudentizados eliminados con corrección de Bonferroni; la r se declara dependiente de pocos casos solo si alguno destaca y retirarlos la cambia en .10 o más.`;

export function parrafoNube(nb, nx, ny, categoria = null) {
    const h = nb.heterocedasticidad, q = nb.cuantiles, nc = nb.necesidad, inf = nb.influencia, ts = nb.techoSuelo, p = [], pt = nb.patron.patron;
    if (h.bp.error) p.push('La homogeneidad de la dispersión no pudo contrastarse.');
    else if (h.hay) p.push(`La dispersión de ${ny} ${h.bp.sube ? 'crece' : 'decrece'} con ${nx} (Breusch–Pagan en la versión de Koenker, 1981: χ²(1) = ${fx(h.bp.lm)}, ${pAPA(h.bp.p)}), por lo que conviene informar errores típicos robustos (HC3; MacKinnon y White, 1985).`);
    else p.push(`La dispersión de ${ny} fue homogénea a lo largo de ${nx} (Breusch–Pagan en la versión de Koenker, 1981: χ²(1) = ${fx(h.bp.lm)}, ${pAPA(h.bp.p)}).`);
    if (pt === 'no-aplica') p.push(nb.patron.motivo === 'no-monotona' ? 'Como la tendencia cambia de sentido, no se evaluaron los bordes rectos de la nube ni la condición necesaria: no describirían una nube curva.' : `Como ${ny} solo tiene ${nb.patron.valoresY} valores distintos, no se evaluaron los bordes de la nube ni la condición necesaria: sus cuantiles avanzan a saltos.`);
    const b = q ? `b.10 = ${fx(q.pendientes[0], 3)}, b.90 = ${fx(q.pendientes[2], 3)}` : '';
    if (pt === 'techo') p.push(`Los bordes de la nube, estimados por regresión de cuantiles (Koenker y Bassett, 1978), dibujan un triángulo: el borde superior ${q.pendientes[2] > 0 ? 'sube' : 'baja'} mientras el inferior apenas cambia (${b}).`);
    else if (pt === 'suelo') p.push(`Los bordes de la nube, estimados por regresión de cuantiles (Koenker y Bassett, 1978), dibujan un triángulo invertido: el borde inferior ${q.pendientes[0] > 0 ? 'sube' : 'baja'} mientras el superior apenas cambia (${b}), de modo que ${nx} marca un mínimo de ${ny} más que un máximo.`);
    else if (pt === 'abanico') p.push(`Los bordes de la nube, estimados por regresión de cuantiles (Koenker y Bassett, 1978), se ${q.diferencia.valor > 0 ? 'separan' : 'juntan'} (${b}): es un abanico, no una recta con dispersión constante.`);
    if (!nc.error && !nc.noAplica) {
        if (nb.necesaria) {
            p.push(`El análisis de condición necesaria (Dul, 2016) indica que sin ${nc.direccion > 0 ? 'valores altos' : 'valores bajos'} de ${nx} no se observan valores altos de ${ny}: d = ${f2(nc.d)}, efecto ${nc.tamano}, ${pPermAPA(nc)} (Dul et al., 2020).`);
            if (categoria === 'sin-relacion') p.push('La falta de una tendencia clara en la media no contradice este resultado: la condición necesaria afecta al borde superior de la nube, no a su centro.');
        } else if (pt === 'techo') p.push(`Sin embargo, el análisis de condición necesaria (Dul, 2016) no la respalda (d = ${f2(nc.d)}, ${pPermAPA(nc)}; Dul et al., 2020)${nc.d < 0.1 ? ': el efecto es pequeño' : ''}.`);
        else if (nc.p < 0.05 && nc.d >= 0.1) p.push(`La esquina superior ${nc.direccion > 0 ? 'izquierda' : 'derecha'} de la nube está vacía (análisis de condición necesaria, d = ${f2(nc.d)}, ${pPermAPA(nc)}; Dul, 2016), pero ${pt === 'paralela' ? 'los bordes son paralelos' : 'la nube no es un triángulo con techo'}: ese vacío se debe a la propia relación y no indica una condición necesaria (Dul et al., 2020).`);
    }
    const extremos = [];
    for (const [t, nombre] of [[ts.y, ny], [ts.x, nx]]) { if (t.noAplica) continue; if (t.techo) extremos.push(`el ${pct(t.pMax)} de los casos está en el valor máximo observado de ${nombre}`); if (t.suelo) extremos.push(`el ${pct(t.pMin)} está en el mínimo observado de ${nombre}`); }
    if (extremos.length) p.push(`Además, ${extremos.join(' y ')} (más del 15 %: efecto techo o suelo; Terwee et al., 2007), lo que puede atenuar la relación.`);
    if (!inf.error) {
        const cambio = `sin los ${inf.nInfluyentes} casos con D > 4/n, r pasa de ${f2(inf.rTodos)} a ${f2(inf.rSin)}`;
        if (inf.nMuyInfluyentes || inf.nAtipicos) {
            const partes = [];
            if (inf.nMuyInfluyentes) partes.push(`${inf.nMuyInfluyentes === 1 ? 'un caso' : `${inf.nMuyInfluyentes} casos`} con una distancia de Cook mayor que la mediana de F (Cook, 1977; Cook y Weisberg, 1982; ${listaFilas(inf.filasMuyInfluyentes, inf.nMuyInfluyentes)})`);
            if (inf.nAtipicos) partes.push(`${inf.nAtipicos === 1 ? 'un atípico' : `${inf.nAtipicos} atípicos`} según los residuos estudentizados con Bonferroni (${listaFilas(inf.filasAtipicas, inf.nAtipicos)})`);
            p.push(`En la recta de ${ny} sobre ${nx} hay ${partes.join(' y ')}; ${cambio}${inf.sensible ? ', así que el resultado depende de pocos casos y conviene revisarlos' : ''}.`);
        } else p.push(`Ningún caso influye por sí solo de forma desproporcionada en la recta (distancia de Cook, 1977: D máx. = ${fx(inf.maxD, 3)}; ningún atípico según Bonferroni)${Math.abs(inf.cambio) >= 0.1 ? `, aunque ${cambio}: ninguno destaca por sí solo, pero en conjunto pesan` : `, y r apenas cambia sin los casos más influyentes (${f2(inf.rTodos)} frente a ${f2(inf.rSin)})`}.`);
        // (revisión 2026.11.12) el grupo: si estaba enmascarado caso a caso, se dice por qué no se veía
        if (inf.porGrupo) { const g = inf.grupo; p.push(`${inf.enmascarados ? 'Sin embargo, un' : 'Además, un'} grupo de ${g.nFuera === 1 ? 'un caso' : `${g.nFuera} casos`} fuera de la elipse de la mayoría (${listaFilas(g.filas, g.nFuera)}, de más a menos alejados) mueve la r de ${f2(inf.rTodos)} a ${f2(g.rMayoria)} (${pAPA(g.p)} por remuestreo)${inf.enmascarados ? ', aunque el análisis caso a caso no lo detecta porque esos casos se ocultan entre sí (enmascaramiento)' : ''}; la mayoría se identificó con el determinante de covarianza mínima (Rousseeuw, 1984) en su versión determinista (Hubert et al., 2012; Rousseeuw y Van Driessen, 1999).`); }
    }
    return p.join(' ');
}
