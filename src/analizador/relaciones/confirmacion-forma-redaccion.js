// analizador/relaciones/confirmacion-forma-redaccion.js — APA 7 de las confirmaciones de la forma (sin DOM): tabla, nota
// y párrafo de la prueba de las dos rectas y de Lind–Mehlum con el vértice de Fieller (relaciones en U), o de la prueba
// de equivalencia (sin relación). Las referencias se listan solo si el texto las cita.
const f2 = x => (Number.isFinite(x) ? (Math.abs(x) < 0.005 ? 0 : x).toFixed(2).replace(/^(-?)0\./, '$1.') : '—');
const fx = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const fp = p => (!Number.isFinite(p) ? '—' : p < 0.001 ? '< .001' : p.toFixed(3).replace(/^0\./, '.'));
const pAPA = p => (!Number.isFinite(p) ? '' : p < 0.001 ? 'p < .001' : `p = ${p.toFixed(3).replace(/^0\./, '.')}`);
const fb = x => (Number.isFinite(x) ? (Math.abs(x) >= 0.1 ? x.toFixed(2) : x.toFixed(3)) : '—');

export const REF_CONFIRMACION = {
    craven: 'Craven, P. y Wahba, G. (1979). Smoothing noisy data with spline functions. <i>Numerische Mathematik, 31</i>(4), 377–403. https://doi.org/10.1007/BF01404567',
    eilers: 'Eilers, P. H. C. y Marx, B. D. (1996). Flexible smoothing with B-splines and penalties. <i>Statistical Science, 11</i>(2), 89–121. https://doi.org/10.1214/ss/1038425655',
    fieller54: 'Fieller, E. C. (1954). Some problems in interval estimation. <i>Journal of the Royal Statistical Society: Series B (Methodological), 16</i>(2), 175–185. https://doi.org/10.1111/j.2517-6161.1954.tb00159.x',
    lakens: 'Lakens, D. (2017). Equivalence tests: A practical primer for <i>t</i> tests, correlations, and meta-analyses. <i>Social Psychological and Personality Science, 8</i>(4), 355–362. https://doi.org/10.1177/1948550617697177',
    lind: 'Lind, J. T. y Mehlum, H. (2010). With or without U? The appropriate test for a U-shaped relationship. <i>Oxford Bulletin of Economics and Statistics, 72</i>(1), 109–118. https://doi.org/10.1111/j.1468-0084.2009.00569.x',
    mackinnon: 'MacKinnon, J. G. y White, H. (1985). Some heteroskedasticity-consistent covariance matrix estimators with improved finite sample properties. <i>Journal of Econometrics, 29</i>(3), 305–325. https://doi.org/10.1016/0304-4076(85)90158-7',
    sasabuchi: 'Sasabuchi, S. (1980). A test of a multivariate normal mean with composite hypotheses determined by linear inequalities. <i>Biometrika, 67</i>(2), 429–439. https://doi.org/10.1093/biomet/67.2.429',
    simonsohn: 'Simonsohn, U. (2018). Two lines: A valid alternative to the invalid testing of U-shaped relationships with quadratic regressions. <i>Advances in Methods and Practices in Psychological Science, 1</i>(4), 538–555. https://doi.org/10.1177/2515245918805755'
};

export const CABECERA_CAMBIO = ['Prueba', 'Qué se contrasta', 'Estimación', 'EE', 't', 'p'];
export function filasCambio(conf, nx) {
    const dr = conf.dosRectas, lm = conf.lindMehlum, filas = [];
    if (dr.noAplicable) filas.push(['Dos rectas', 'Sin dos tramos: el extremo está en un borde', '—', '—', '—', '—']);
    else if (!dr.error) filas.push(['Dos rectas', `Pendiente con ${nx} ≤ ${fx(dr.corte)}`, fb(dr.bajo.b), fb(dr.bajo.ee), fx(dr.bajo.t), fp(dr.bajo.p)], ['', `Pendiente con ${nx} > ${fx(dr.corte)}`, fb(dr.alto.b), fb(dr.alto.ee), fx(dr.alto.t), fp(dr.alto.p)]);
    else filas.push(['Dos rectas', dr.error, '—', '—', '—', '—']);
    if (!lm.error) filas.push(['Lind y Mehlum', `Pendiente en ${nx} = ${fx(lm.izquierda.x)}`, fb(lm.izquierda.s), fb(lm.izquierda.ee), fx(lm.izquierda.t), '—'], ['', `Pendiente en ${nx} = ${fx(lm.derecha.x)}`, fb(lm.derecha.s), fb(lm.derecha.ee), fx(lm.derecha.t), '—'],
        ['', 'Ambos extremos a la vez', '—', '—', fx(lm.t), fp(lm.p)], ['Vértice cuadrático', lm.acotado ? `IC 95 % [${fx(lm.ic[0])}, ${fx(lm.ic[1])}]` : 'IC 95 % no acotado', fx(lm.vertice), '—', '—', '—']);
    return filas;
}
export const notaCambio = conf => {
    const dr = conf.dosRectas, lm = conf.lindMehlum;
    return `Dos rectas (Simonsohn, 2018): regresión interrumpida con el corte elegido por el algoritmo Robin Hood sobre un spline cúbico penalizado (Eilers y Marx, 1996; suavizado por validación cruzada generalizada, Craven y Wahba, 1979) y errores típicos robustos HC3 (MacKinnon y White, 1985)${dr.error ? '' : `; gl = ${dr.gl}`}. La forma se confirma si ambas pendientes son significativas y de signo opuesto. Lind y Mehlum (2010): pendientes del modelo cuadrático en los extremos de los datos, contrastadas a la vez (Sasabuchi, 1980; p unilateral${lm.error ? '' : `, gl = ${lm.gl}`}); supone la forma cuadrática. Vértice: IC por el método de Fieller (1954).`;
};

export const CABECERA_EQUIVALENCIA = ['Límite de equivalencia', 'r', 'IC 90 %', 'p (TOST)', 'Conclusión', 'Se descarta'];
export const filasEquivalencia = conf => {
    const e = conf.tost;
    return e.error ? [['—', '—', '—', '—', e.error, '—']] : [[`|r| < ${f2(e.limite)}`, f2(e.r), `[${f2(e.ic[0])}, ${f2(e.ic[1])}]`, fp(e.p), e.equivalente ? 'Relación lineal despreciable' : 'No se puede afirmar', `|r| ≥ ${f2(e.limiteMinimo)}`]];
};
export const notaEquivalencia = conf => `Prueba de equivalencia por dos pruebas unilaterales (TOST; Lakens, 2017) con la transformación de Fisher; α = ${conf.tost.alfa ?? 0.05} en cada una, de ahí el IC al 90 %. «Se descarta»: el menor límite que estos datos permitirían declarar equivalente. Solo concierne a la relación lineal; la correlación de distancias cubre las demás formas.`;

const sentido = b => (b > 0 ? 'positiva' : 'negativa');
export function parrafoConfirmacion(conf, nx) {
    if (!conf) return '';
    if (conf.tipo === 'equivalencia') {
        const e = conf.tost;
        if (e.error) return '';
        return `Con un límite de equivalencia de |r| = ${f2(e.limite)} (Lakens, 2017), la prueba de equivalencia ${e.equivalente
            ? `confirmó que la relación lineal es despreciable (${pAPA(e.p)}; IC 90 % de r [${f2(e.ic[0])}, ${f2(e.ic[1])}])`
            : `no permitió afirmar que la relación lineal sea despreciable (${pAPA(e.p)}; IC 90 % de r [${f2(e.ic[0])}, ${f2(e.ic[1])}]): con estos datos solo se descarta |r| ≥ ${f2(e.limiteMinimo)}`}.`;
    }
    const dr = conf.dosRectas, lm = conf.lindMehlum, partes = [];
    if (dr.error) partes.push(`La prueba de las dos rectas (Simonsohn, 2018) no pudo aplicarse: ${dr.error.charAt(0).toLowerCase() + dr.error.slice(1)}`);
    else if (dr.noAplicable) partes.push(`La prueba de las dos rectas (Simonsohn, 2018) no confirmó el cambio de sentido: ${dr.noAplicable}.`);
    else if (dr.confirmada) partes.push(`La prueba de las dos rectas (Simonsohn, 2018), con el corte en ${nx} = ${fx(dr.corte)} elegido por el algoritmo Robin Hood y errores típicos robustos HC3 (MacKinnon y White, 1985), confirmó el cambio de sentido: la pendiente fue ${sentido(dr.bajo.b)} hasta el corte (b = ${fb(dr.bajo.b)}, ${pAPA(dr.bajo.p)}) y ${sentido(dr.alto.b)} después (b = ${fb(dr.alto.b)}, ${pAPA(dr.alto.p)}).`);
    else {
        const esperado = dr.extremo === 'mínimo' ? [-1, 1] : [1, -1], fallo = [['antes', dr.bajo, esperado[0]], ['después', dr.alto, esperado[1]]].find(([, l, s]) => !(l.p < 0.05 && Math.sign(l.b) === s)) || ['después', dr.alto, esperado[1]];
        const motivo = Math.sign(fallo[1].b) !== fallo[2] ? `no fue ${fallo[2] > 0 ? 'positiva' : 'negativa'} como exige la forma` : 'no fue significativa';
        const lmSig = !lm.error && lm.p < 0.05;
        partes.push(`La prueba de las dos rectas (Simonsohn, 2018), que no supone una forma concreta, no confirmó el cambio de sentido: la pendiente ${fallo[0]} del corte (${nx} = ${fx(dr.corte)}) ${motivo} (b = ${fb(fallo[1].b)}, ${pAPA(fallo[1].p)})${lmSig
            ? `; la prueba de Lind y Mehlum (2010), que sí supone una forma cuadrática, fue significativa (t = ${fx(lm.t)}, ${pAPA(lm.p)}), de modo que el cambio de sentido depende de aceptar esa forma`
            : lm.error ? '' : `, y tampoco lo respaldó la prueba de Lind y Mehlum (2010; ${pAPA(lm.p)}): no hay evidencia suficiente de una forma en U, y la relación podría ser monotónica`}.`);
    }
    if (!lm.error && (dr.confirmada || lm.p < 0.05)) partes.push(lm.acotado ? `El vértice del modelo cuadrático se situó en ${nx} = ${fx(lm.vertice)}, IC 95 % [${fx(lm.ic[0])}, ${fx(lm.ic[1])}] (Fieller, 1954).` : 'El IC de Fieller (1954) del vértice no está acotado: su ubicación no se puede precisar con estos datos.');
    return partes.join(' ');
}
