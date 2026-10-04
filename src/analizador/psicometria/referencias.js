// analizador/psicometria/referencias.js — referencias APA 7 de los análisis psicométricos del Analizador, en un solo
// lugar: las usan el capítulo en Word (exportador-word.js) y la lista de referencias en pantalla (ui/sociodemografica.js).
export const REFERENCIAS_ORDINALES = [
    'Gadermann, A. M., Guhn, M. y Zumbo, B. D. (2012). Estimating ordinal reliability for Likert-type and ordinal item response data: A conceptual, empirical, and practical guide. <i>Practical Assessment, Research, and Evaluation, 17</i>(3). https://doi.org/10.7275/n560-j767',
    'Olsson, U. (1979). Maximum likelihood estimation of the polychoric correlation coefficient. <i>Psychometrika, 44</i>(4), 443–460. https://doi.org/10.1007/BF02296207',
    'Zumbo, B. D., Gadermann, A. M. y Zeisser, C. (2007). Ordinal versions of coefficients alpha and theta for Likert rating scales. <i>Journal of Modern Applied Statistical Methods, 6</i>(1), 21–29. https://doi.org/10.22237/jmasm/1177992180'
];
export const REFERENCIA_KR20 = 'Kuder, G. F. y Richardson, M. W. (1937). The theory of the estimation of test reliability. <i>Psychometrika, 2</i>(3), 151–160. https://doi.org/10.1007/BF02288391';

export const REFERENCIAS_WLSMV = [
    'Asparouhov, T. y Muthén, B. (2010). <i>Simple second order chi-square correction</i> [Informe técnico]. Muthén & Muthén. https://www.statmodel.com/download/WLSMV_new_chi21.pdf',
    'Muthén, B. (1984). A general structural equation model with dichotomous, ordered categorical, and continuous latent variable indicators. <i>Psychometrika, 49</i>(1), 115–132. https://doi.org/10.1007/BF02294210'
];
export const REFERENCIA_BOOTSTRAP = 'Efron, B. y Tibshirani, R. J. (1993). <i>An introduction to the bootstrap</i>. Chapman & Hall. https://doi.org/10.1201/9780429246593';

// Referencias que exige lo que se reportó en la fiabilidad (escalas válidas de un análisis; ¿hubo bootstrap?)
export function referenciasDeFiabilidad(validos, conBootstrap = false) {
    const r = [];
    if (conBootstrap) r.push(REFERENCIA_BOOTSTRAP);
    if ((validos || []).some(x => x.ordinal)) r.push(...REFERENCIAS_ORDINALES);
    if ((validos || []).some(x => x.dicotomico)) r.push(REFERENCIA_KR20);
    return r;
}
