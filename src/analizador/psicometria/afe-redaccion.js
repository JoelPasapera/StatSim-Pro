// analizador/psicometria/afe-redaccion.js — textos y tablas APA 7 del análisis factorial exploratorio (sin DOM):
// párrafo para la tesis, tablas para pantalla y Word, documento Word, CSV de cargas y referencias citadas.
import { interpretarKMO } from './afe.js';

export const f2 = x => (Number.isFinite(x) ? x.toFixed(2).replace(/^(-?)0\./, '$1.') : '—');
const f2c = x => (Number.isFinite(x) ? x.toFixed(2) : '—');   // χ² y porcentajes (pueden superar 1)
export const fp = p => (!Number.isFinite(p) ? '—' : p < 0.001 ? '< .001' : p.toFixed(3).replace(/^0\./, '.'));
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const lista = xs => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`);
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
export const nombreFactor = j => `F${j + 1}`;
const NOMBRE_CORRELACION = { pearson: 'de Pearson', policorica: 'policóricas' };

const REFERENCIAS = {
    bartlett: 'Bartlett, M. S. (1950). Tests of significance in factor analysis. <i>British Journal of Statistical Psychology, 3</i>(2), 77–85. https://doi.org/10.1111/j.2044-8317.1950.tb00285.x',
    bernaards: 'Bernaards, C. A. y Jennrich, R. I. (2005). Gradient projection algorithms and software for arbitrary rotation criteria in factor analysis. <i>Educational and Psychological Measurement, 65</i>(5), 676–696. https://doi.org/10.1177/0013164404272507',
    buja: 'Buja, A. y Eyuboglu, N. (1992). Remarks on parallel analysis. <i>Multivariate Behavioral Research, 27</i>(4), 509–540. https://doi.org/10.1207/s15327906mbr2704_2',
    glorfeld: 'Glorfeld, L. W. (1995). An improvement on Horn\'s parallel analysis methodology for selecting the correct number of factors to retain. <i>Educational and Psychological Measurement, 55</i>(3), 377–393. https://doi.org/10.1177/0013164495055003002',
    hendrickson: 'Hendrickson, A. E. y White, P. O. (1964). Promax: A quick method for rotation to oblique simple structure. <i>British Journal of Statistical Psychology, 17</i>(1), 65–70. https://doi.org/10.1111/j.2044-8317.1964.tb00244.x',
    horn: 'Horn, J. L. (1965). A rationale and test for the number of factors in factor analysis. <i>Psychometrika, 30</i>(2), 179–185. https://doi.org/10.1007/BF02289447',
    kaiser1958: 'Kaiser, H. F. (1958). The varimax criterion for analytic rotation in factor analysis. <i>Psychometrika, 23</i>(3), 187–200. https://doi.org/10.1007/BF02289233',
    kaiser1974: 'Kaiser, H. F. (1974). An index of factorial simplicity. <i>Psychometrika, 39</i>(1), 31–36. https://doi.org/10.1007/BF02291575',
    lloret: 'Lloret-Segura, S., Ferreres-Traver, A., Hernández-Baeza, A. y Tomás-Marco, I. (2014). El análisis factorial exploratorio de los ítems: Una guía práctica, revisada y actualizada. <i>Anales de Psicología, 30</i>(3), 1151–1169. https://doi.org/10.6018/analesps.30.3.199361',
    olsson: 'Olsson, U. (1979). Maximum likelihood estimation of the polychoric correlation coefficient. <i>Psychometrika, 44</i>(4), 443–460. https://doi.org/10.1007/BF02296207'
};
export function referenciasAFE(r) {
    const claves = ['buja', 'glorfeld', 'horn', 'lloret'];
    if (r.adecuacion.kmo && r.adecuacion.bartlett) claves.push('bartlett', 'kaiser1974');   // solo si el texto los cita
    if (r.m > 1 && r.rotacion.metodo !== 'ninguna') claves.push('bernaards');
    if (r.rotacion.metodo === 'promax') claves.push('hendrickson');
    if (r.rotacion.metodo === 'varimax' || r.rotacion.metodo === 'promax') claves.push('kaiser1958');
    if (r.tipo === 'policorica') claves.push('olsson');
    return claves.map(c => REFERENCIAS[c]).sort((a, b) => a.localeCompare(b, 'es'));
}

// ---------------------------------------------------------------- tablas (texto plano; quien las pinta decide el formato)
export function tablaAutovalores(r) {
    const filas = [];
    const hasta = Math.min(r.p, Math.max(r.m, r.sugeridos) + 3);
    for (let i = 0; i < hasta; i++) {
        filas.push([`${i + 1}`, f2c(r.autovalores[i]), `${f2c((100 * r.autovalores[i]) / r.p)} %`, f2c(r.paralelo[i].media), f2c(r.paralelo[i].percentil), r.autovalores[i] > r.paralelo[i].percentil && i < r.sugeridos ? 'Retener' : '—']);
    }
    return { cabecera: ['Factor', 'Autovalor', '% de varianza', 'Paralelo (media)', 'Paralelo (P95)', 'Según el paralelo'], filas,
        nota: `Autovalores (de componentes principales) de la matriz de correlaciones ${NOMBRE_CORRELACION[r.tipo]} frente a los de ${r.B} matrices de datos permutados (análisis paralelo; semilla ${r.semilla}). El paralelo sugiere retener, en orden, los factores cuyo autovalor supera el percentil 95.${r.fijado ? ` Se extrajeron ${r.m} por decisión del investigador.` : ''}` };
}
export function tablaCargas(r) {
    const m = r.m, filas = r.items.map(it => [it.nombre, ...it.cargas.map(f2), f2(it.comunalidad)]);
    const ss = r.ssRotadas.map(f2c);
    return { cabecera: ['Ítem', ...Array.from({ length: m }, (_, j) => nombreFactor(j)), 'h²'], filas, pie: ['Suma de cargas²', ...ss, ''],
        nota: `Cargas ${r.rotacion.oblicua ? 'del patrón ' : ''}tras ${r.rotacion.metodo === 'ninguna' ? 'la extracción (sin rotación)' : `rotación ${r.rotacion.nombre.toLowerCase()} con normalización de Kaiser`}; extracción por ejes principales sobre correlaciones ${NOMBRE_CORRELACION[r.tipo]}. h² = comunalidad. En negrita, la carga principal de cada ítem (≥ .40).` };
}
export function tablaPhi(r) {
    if (!r.rotacion.oblicua || r.m < 2) return null;
    return { cabecera: ['Factor', ...Array.from({ length: r.m }, (_, j) => nombreFactor(j))],
        filas: r.phi.map((f, i) => [nombreFactor(i), ...f.map((v, j) => (j > i ? '' : j === i ? '—' : f2(v)))]), nota: 'Correlaciones entre factores tras la rotación oblicua.' };
}

// ---------------------------------------------------------------- redacción
// `de` es la expresión con preposición que nombra lo analizado: «del TMMS24», «de la escala Regulación (TMMS24)»…
export function redactarParrafo(r, de) {
    const partes = [];
    const k = r.adecuacion.kmo, b = r.adecuacion.bartlett;
    partes.push(`Para examinar la estructura interna ${de} se realizó un análisis factorial exploratorio sobre la matriz de correlaciones ${NOMBRE_CORRELACION[r.tipo]} de los ${r.p} ítems (n = ${r.n}).`);
    if (k && b) {
        partes.push(`El índice de adecuación muestral fue ${interpretarKMO(k.kmo)} (KMO = ${f2(k.kmo)}; Kaiser, 1974) y la prueba de esfericidad de Bartlett ${b.p < 0.05 ? 'resultó significativa' : 'no resultó significativa'}, χ²(${b.gl}) = ${f2c(b.chi2)}, p ${b.p < 0.001 ? '< .001' : '= ' + fp(b.p)} (Bartlett, 1950)${b.p < 0.05 && k.kmo >= 0.6 ? ', lo que indica que la matriz es factorizable' : ', por lo que la factorización de la matriz es dudosa'}.`);
    }
    partes.push(`El análisis paralelo por permutaciones (B = ${r.B}; percentil 95; Horn, 1965; Buja y Eyuboglu, 1992; Glorfeld, 1995) sugirió retener ${plural(r.sugeridos, 'factor', 'factores')}${r.kaiser !== r.sugeridos ? `, mientras que el criterio de Kaiser (autovalor > 1), que tiende a sobrestimar su número, habría retenido ${r.kaiser}` : ''}.`);
    const rot = r.m === 1 || r.rotacion.metodo === 'ninguna' ? '' : r.rotacion.metodo === 'oblimin' ? ', y se rotaron con oblimin directo (γ = 0), que permite que los factores se correlacionen (Bernaards y Jennrich, 2005)'
        : r.rotacion.metodo === 'promax' ? ', y se rotaron con promax (κ = 4; Hendrickson y White, 1964), que permite que los factores se correlacionen' : ', y se rotaron con varimax (Kaiser, 1958), que los supone independientes';
    const pct = r.extraccion.porcentaje.reduce((s, v) => s + v, 0);
    partes.push(`Se ${r.m === 1 ? 'extrajo un factor' : `extrajeron ${r.m} factores`}${r.fijado ? `, número fijado según la estructura teórica del instrumento,` : ''} por ejes principales (Lloret-Segura et al., 2014), que ${r.m === 1 ? 'explicó' : 'explicaron en conjunto'} el ${f2c(pct)} % de la varianza de los ítems${rot}.`);
    const principales = r.items.map(it => Math.abs(it.cargas[it.factor]));
    partes.push(`Las cargas principales oscilaron entre ${f2(Math.min(...principales))} y ${f2(Math.max(...principales))}.`);
    const bajas = r.items.filter(it => it.bajaCarga).map(it => it.nombre), cruzadas = r.items.filter(it => it.cruzada).map(it => it.nombre);
    if (bajas.length) partes.push(`${bajas.length === 1 ? 'El ítem' : 'Los ítems'} ${lista(bajas)} ${bajas.length === 1 ? 'presentó una carga principal inferior' : 'presentaron cargas principales inferiores'} a .40.`);
    if (cruzadas.length) partes.push(`${cruzadas.length === 1 ? 'El ítem' : 'Los ítems'} ${lista(cruzadas)} ${cruzadas.length === 1 ? 'mostró una carga cruzada' : 'mostraron cargas cruzadas'} de .30 o más.`);
    if (r.rotacion.oblicua && r.m > 1) {
        const phis = [];
        for (let i = 0; i < r.m; i++) for (let j = 0; j < i; j++) phis.push(r.phi[i][j]);
        partes.push(`Las correlaciones entre factores oscilaron entre ${f2(Math.min(...phis))} y ${f2(Math.max(...phis))}.`);
    }
    const comun = r.items.filter(it => it.bajaComunalidad).map(it => it.nombre);
    if (comun.length) partes.push(`${comun.length === 1 ? 'El ítem' : 'Los ítems'} ${lista(comun)} ${comun.length === 1 ? 'tuvo una comunalidad inferior' : 'tuvieron comunalidades inferiores'} a .30.`);
    if (bajas.length || cruzadas.length || comun.length) partes.push('Los ítems señalados deben revisarse antes de interpretar la estructura.');
    return partes.join(' ');
}

// ---------------------------------------------------------------- Word y CSV
function tablaWord(numero, titulo, t, negritas = null) {
    const th = t.cabecera.map(h => `<td style="border-top:1pt solid black;border-bottom:1pt solid black;padding:3pt 4pt;font-weight:bold;">${esc(h)}</td>`).join('');
    const filas = t.pie ? [...t.filas, t.pie] : t.filas;
    const tr = filas.map((f, i) => '<tr>' + f.map((c, j) => {
        const neg = negritas && negritas(i, j);
        return `<td style="padding:2pt 4pt;${i === filas.length - 1 ? 'border-bottom:1pt solid black;' : ''}${t.pie && i === filas.length - 1 ? 'border-top:0.5pt solid black;' : ''}">${neg ? `<b>${esc(c)}</b>` : esc(c)}</td>`;
    }).join('') + '</tr>').join('');
    return `<p style="margin:14pt 0 0;line-height:200%;"><b>Tabla ${numero}</b></p>
        <p style="margin:0 0 6pt;line-height:200%;"><i>${esc(titulo)}</i></p>
        <table width="100%" cellspacing="0" style="border-collapse:collapse;font-size:11pt;line-height:115%;"><tr>${th}</tr>${tr}</table>
        <p style="margin:4pt 0 0;font-size:11pt;line-height:150%;"><i>Nota.</i> ${esc(t.nota)}</p>`;
}
export const esPrincipal = (r, i, j) => i < r.items.length && j >= 1 && j <= r.m && r.items[i].factor === j - 1 && Math.abs(r.items[i].cargas[j - 1]) >= 0.40;

export function documentoWord(r, etiqueta, de) {
    let n = 0;
    let cuerpo = `<p style="margin:0 0 8pt;line-height:200%;text-align:center;"><b>Análisis factorial exploratorio: ${esc(etiqueta)}</b></p>
        <p style="margin:0;line-height:200%;text-align:justify;text-indent:0.5in;">${esc(redactarParrafo(r, de))}</p>`;
    cuerpo += tablaWord(++n, `Autovalores observados y del análisis paralelo (${etiqueta})`, tablaAutovalores(r));
    cuerpo += tablaWord(++n, `Cargas factoriales y comunalidades (${etiqueta})`, tablaCargas(r), (i, j) => esPrincipal(r, i, j));
    const phi = tablaPhi(r);
    if (phi) cuerpo += tablaWord(++n, `Correlaciones entre factores (${etiqueta})`, phi);
    cuerpo += '<p style="margin:18pt 0 8pt;line-height:200%;text-align:center;"><b>Referencias</b></p>' +
        referenciasAFE(r).map(x => `<p style="margin:0;line-height:200%;padding-left:0.5in;text-indent:-0.5in;">${x}</p>`).join('');
    return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
        <head><meta charset="utf-8"><title>Análisis factorial exploratorio</title>
        <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
        <style>body{font-family:"Times New Roman",serif;font-size:12pt;}</style></head><body>${cuerpo}</body></html>`;
}

export function csvCargas(r) {
    const dec = x => (Number.isFinite(x) ? x.toFixed(4).replace('.', ',') : '');
    const seguro = s => (/^[=+\-@]/.test(String(s)) ? `'${s}` : s);
    const cab = ['Ítem', ...Array.from({ length: r.m }, (_, j) => nombreFactor(j)), 'h2', 'Factor principal', 'MSA'];
    return [cab.join(';'), ...r.items.map(it => [seguro(it.nombre), ...it.cargas.map(dec), dec(it.comunalidad), nombreFactor(it.factor), dec(it.msa)].join(';'))].join('\r\n');
}
