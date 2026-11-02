// @ts-check
// analizador/informe/sintaxis.js — (2027.01.19) la sintaxis equivalente en R y en SPSS de los análisis de las tarjetas nuevas
// del Analizador: para reproducir el resultado fuera del programa (o para que un revisor o un asesor lo compruebe). Cada
// función recibe los nombres de las columnas y las opciones del análisis y devuelve { r, spss, nota }: R con paquetes de uso
// común (stats, afex, ppcor, lavaan, careless, naniar, mice, pROC, pwr, mirt, MASS, lmerTest, performance) y SPSS con su
// sintaxis (o, si SPSS no lo hace sin extensiones, lo que hay que usar), con los nombres que les da el .sav del programa. Y el
// bloque plegable que las muestra. Sin DOM.
// (2027.01.20, revisión) Para que den lo mismo que el programa: R lee los nombres tal cual (check.names = FALSE) y las celdas
// vacías como perdidas; las medidas repetidas, con los casos completos y la corrección de la esfericidad que aplicó el
// programa (y la fila de SPSS que hay que leer); la McNemar de SPSS, la exacta de CROSSTABS; las semiparciales de ppcor, con
// los controles quitados de la variable que toca; la Spearman parcial de SPSS, con los rangos de los casos completos; la
// moderación, con los coeficientes del modelo centrado y la región de Johnson-Neyman en la escala de W; lavaan, con nombres
// que admite; la depuración, con las columnas de los duplicados y sin contar los identificadores vacíos; los baremos, con la
// T con un decimal y por grupo; la potencia de la regresión con λ = f²·N (la de G*Power: pwr usa otra si no se prueban todos
// los predictores), los procedimientos POWER de SPSS que existen y la mediación con el modelo de Fritz y MacKinnon; la TRI,
// sin las personas sin respuestas, con los errores típicos y el DIF completo (el total con la regla del 80 %, los grupos
// pequeños fuera, los R² de Nagelkerke y Holm); y los módulos de SPSS que hacen falta.
import { escaparHTML } from '../../shared/html.js';
import { nombreVariableSav } from '../../core/data/sav/escritor.js';

/** @typedef {{ r: string, spss: string, nota?: string }} Sintaxis */

/** Un nombre de columna en R: entre acentos graves si no es un nombre sintáctico. @param {string} c */
export const nr = c => (/^[A-Za-z.][A-Za-z0-9._]*$/.test(c) && !/^\.\d/.test(c) ? c : `\`${c.replace(/\\/g, '\\\\').replace(/`/g, '\\`')}\``);
/** Una cadena de R. @param {string} s */
const cr = s => JSON.stringify(s);
/** Un vector de cadenas de R. @param {string[]} cs */
const vr = cs => `c(${cs.map(cr).join(', ')})`;
/** Un nombre de variable en SPSS: el del .sav del programa. @param {string} c */
const ns = c => nombreVariableSav(c);
/** Varios, separados por espacios. @param {string[]} cs */
const nss = cs => cs.map(ns).join(' ');
/** El número con punto y sin ceros de más. @param {number} v */
const num = v => String(Number(v.toFixed(6)));

/** Lo común de R: leer la base, con los nombres tal cual (con espacios o tildes) y las celdas vacías como perdidas. */
const LEER = 'datos <- read.csv2("base.csv", check.names = FALSE, na.strings = c("", "NA"), fileEncoding = "UTF-8-BOM")\n'
    + '# o readxl::read_excel("base.xlsx"); con haven::read_sav("base.sav"), los nombres son los del .sav (los de SPSS)\n';
/** La nota de los nombres de SPSS. */
const NOMBRES_SPSS = 'En SPSS, los nombres de las variables son los del .sav que exporta el programa.';

/**
 * Las muestras relacionadas.
 * @param {{ medidas: string[], grupo?: string | null, prueba: string, correccion?: 'ninguna' | 'gg' | 'hf' }} o prueba: la que
 *   eligió el protocolo ('t-pareada', 'wilcoxon', 'anova-rm', 'friedman', 'mcnemar', 'cochran', 'anova-mixta'); correccion: la
 *   de la esfericidad que aplicó
 * @returns {Sintaxis}
 */
export function sintaxisRelacionadas({ medidas, grupo = null, prueba, correccion = 'ninguna' }) {
    const m = medidas;
    if (prueba === 't-pareada' || prueba === 'wilcoxon') {
        const [a, b] = /** @type {[string, string]} */ (m), da = `datos$${nr(a)}`, db = `datos$${nr(b)}`;
        return {
            r: LEER + (prueba === 't-pareada'
                ? `t.test(${db}, ${da}, paired = TRUE)\nd <- ${db} - ${da}\nmean(d, na.rm = TRUE) / sd(d, na.rm = TRUE)   # dz`
                : `wilcox.test(${db}, ${da}, paired = TRUE, exact = FALSE, correct = FALSE)   # sin corrección por continuidad, como SPSS\neffectsize::rank_biserial(${db}, ${da}, paired = TRUE)`),
            spss: prueba === 't-pareada' ? `T-TEST PAIRS=${ns(b)} WITH ${ns(a)} (PAIRED)\n  /ES DISPLAY(TRUE)\n  /CRITERIA=CI(.95).\n* /ES (la dz con su intervalo), SPSS 27 o posterior.` : `NPAR TESTS /WILCOXON=${ns(b)} WITH ${ns(a)} (PAIRED).`,
            nota: NOMBRES_SPSS
        };
    }
    if (prueba === 'mcnemar') {
        const [a, b] = /** @type {[string, string]} */ (m);
        return {
            r: LEER + `tabla <- table(datos$${nr(a)}, datos$${nr(b)})\nbinom.test(tabla[1, 2], tabla[1, 2] + tabla[2, 1])   # la McNemar exacta (binomial)`,
            spss: `CROSSTABS /TABLES=${ns(a)} BY ${ns(b)}\n  /STATISTICS=MCNEMAR /CELLS=COUNT.\n* En una tabla 2 × 2, CROSSTABS da la p exacta (binomial), la del programa.`,
            nota: NOMBRES_SPSS
        };
    }
    if (prueba === 'cochran') return { r: LEER + `DescTools::CochranQTest(as.matrix(na.omit(datos[${vr(m)}])))`, spss: `NPAR TESTS /COCHRAN=${nss(m)}.`, nota: NOMBRES_SPSS };
    // los casos completos (la eliminación por lista del programa) y la base larga, con un número por persona: así los pares
    // de las comparaciones son siempre las mismas personas
    const largo = `d <- na.omit(datos[${vr(grupo ? [...m, grupo] : m)}]); d$id <- seq_len(nrow(d))   # los casos completos, como el programa\nlargo <- tidyr::pivot_longer(d, cols = ${vr(m)}, names_to = "medida", values_to = "valor")\nlargo$medida <- factor(largo$medida, levels = ${vr(m)})\n`;
    if (prueba === 'friedman') {
        return {
            r: LEER + `${largo}friedman.test(as.matrix(d[${vr(m)}]))\npairwise.wilcox.test(largo$valor, largo$medida, paired = TRUE, p.adjust.method = "holm", exact = FALSE, correct = FALSE)`,
            spss: `NPAR TESTS /FRIEDMAN=${nss(m)}\n  /STATISTICS=DESCRIPTIVES.\n* Los pares contiguos (los demás, igual), con los mismos casos completos y la corrección de Holm a mano.\nNPAR TESTS /WILCOXON=${m.slice(0, -1).map(ns).join(' ')} WITH ${m.slice(1).map(ns).join(' ')} (PAIRED)\n  /MISSING=LISTWISE.`,
            nota: NOMBRES_SPSS
        };
    }
    const mixto = prueba === 'anova-mixta' && !!grupo;
    const correccionR = { ninguna: 'none', gg: 'GG', hf: 'HF' }[correccion] || 'none';
    const filaSPSS = { ninguna: 'Esfericidad asumida', gg: 'Greenhouse-Geisser', hf: 'Huynh-Feldt' }[correccion] || 'Esfericidad asumida';
    return {
        r: LEER + largo + `afex::aov_ez(id = "id", dv = "valor", within = "medida"${mixto ? `, between = ${cr(/** @type {string} */ (grupo))}` : ''}, data = largo,\n  anova_table = list(correction = ${cr(correccionR)}, es = c("pes", "ges")))   # ${correccion === 'ninguna' ? 'sin corrección: Mauchly no rechazó la esfericidad' : 'la corrección de la esfericidad que aplicó el programa'}\npairwise.t.test(largo$valor, largo$medida, paired = TRUE, p.adjust.method = "holm")`,
        spss: `GLM ${nss(m)}${mixto ? ` BY ${ns(/** @type {string} */ (grupo))}` : ''}\n  /WSFACTOR=medida ${m.length} Polynomial\n  /PRINT=DESCRIPTIVE ETASQ${mixto ? ' HOMOGENEITY' : ''}\n  /EMMEANS=TABLES(medida) COMPARE ADJ(BONFERRONI)\n  /WSDESIGN=medida${mixto ? `\n  /DESIGN=${ns(/** @type {string} */ (grupo))}` : ''}.\n* En «Pruebas de efectos dentro de sujetos», la fila «${filaSPSS}»: la corrección que aplicó el programa.`,
        nota: `${mixto ? 'En el ANOVA mixto, la ε de Huynh-Feldt de SPSS no lleva la corrección de Lecoutre (1991) que aplica el programa: puede diferir un poco. ' : ''}SPSS no ofrece Holm en EMMEANS (Bonferroni es más conservador). El GLM de medidas repetidas necesita el módulo Advanced Statistics de SPSS. ${NOMBRES_SPSS}`
    };
}

/**
 * La correlación parcial.
 * @param {{ x: string, y: string, controles: string[], spearman: boolean }} o
 * @returns {Sintaxis}
 */
export function sintaxisParcial({ x, y, controles, spearman }) {
    const metodo = cr(spearman ? 'spearman' : 'pearson'), todas = [x, y, ...controles], z = `d[${vr(controles)}]`;
    // spcor.test(a, b, z) quita z de b (la segunda): la semiparcial de X (sobre Y) es spcor.test(Y, X, z)
    return {
        r: LEER + `d <- na.omit(datos[${vr(todas)}])\nppcor::pcor.test(d$${nr(x)}, d$${nr(y)}, ${z}, method = ${metodo})    # parcial\nppcor::spcor.test(d$${nr(y)}, d$${nr(x)}, ${z}, method = ${metodo})   # semiparcial de la primera (los controles, quitados de ella)\nppcor::spcor.test(d$${nr(x)}, d$${nr(y)}, ${z}, method = ${metodo})   # semiparcial de la segunda`,
        spss: spearman
            ? `* Spearman: la parcial de los rangos de los casos completos (como el programa).\nDATASET COPY completos.\nDATASET ACTIVATE completos.\nSELECT IF (NMISS(${todas.map(ns).join(', ')}) = 0).\nRANK VARIABLES=${nss(todas)} /RANK INTO ${todas.map(c => `R_${ns(c)}`).join(' ')}.\nPARTIAL CORR /VARIABLES=R_${ns(x)} R_${ns(y)} BY ${controles.map(c => `R_${ns(c)}`).join(' ')}\n  /SIGNIFICANCE=TWOTAIL /MISSING=LISTWISE.`
            : `PARTIAL CORR /VARIABLES=${ns(x)} ${ns(y)} BY ${nss(controles)}\n  /SIGNIFICANCE=TWOTAIL /MISSING=LISTWISE.\n* La semiparcial: REGRESSION /STATISTICS=COEFF ZPP con ${ns(y)} como dependiente (la columna «Semiparcial» de ${ns(x)}).`,
        nota: `La p de las semiparciales del programa es la de la parcial (la t del predictor en la regresión, la de SPSS); spcor.test usa otra prueba y su p sale algo distinta. ${NOMBRES_SPSS}`
    };
}

/**
 * La mediación y la moderación (PROCESS).
 * @param {{ modelo: number, x: string, y: string, m: string[], w: string | null, covariables: string[], B: number, semilla: number, centrar: boolean }} o
 * @returns {Sintaxis}
 */
export function sintaxisMediacion({ modelo, x, y, m, w, covariables, B, semilla, centrar }) {
    const conProductos = modelo === 1 || modelo === 7 || modelo === 14, centrado = centrar && conProductos;
    const spss = `* La macro PROCESS de Hayes (processmacro.org), cargada antes.\nprocess y=${ns(y)} /x=${ns(x)}${m.length ? ` /m=${nss(m)}` : ''}${w ? ` /w=${ns(w)}` : ''}${covariables.length ? ` /cov=${nss(covariables)}` : ''} /model=${modelo}${centrado ? ' /center=1' : ''}${modelo === 1 ? ' /jn=1 /plot=1' : ` /boot=${B} /seed=${semilla}`}.`;
    const c = covariables.length ? ` + ${covariables.map(nr).join(' + ')}` : '';
    let r;
    if (modelo === 1) {
        const ww = /** @type {string} */ (w), vars = [x, y, ww, ...covariables], formula = `${nr(y)} ~ ${nr(x)} * ${nr(ww)}${c}`;
        r = LEER + `d <- na.omit(datos[${vr(vars)}])\n` + (centrado
            ? `dc <- d; dc$${nr(x)} <- dc$${nr(x)} - mean(dc$${nr(x)}); dc$${nr(ww)} <- dc$${nr(ww)} - mean(dc$${nr(ww)})   # centradas, como el programa\nsummary(lm(${formula}, data = dc))   # los coeficientes del programa\nmodelo <- lm(${formula}, data = d)   # sin centrar: la región de Johnson-Neyman en la escala de la moderadora`
            : `modelo <- lm(${formula}, data = d)\nsummary(modelo)`)
            + `\ninteractions::johnson_neyman(modelo, pred = ${nr(x)}, modx = ${nr(ww)})`;
    } else if (modelo === 4 && m.length === 1) {
        // lavaan no admite nombres con espacios ni tildes en el modelo: las variables se renombran antes
        const mm = /** @type {string} */ (m[0]), cs = covariables.map((_, k) => `C${k + 1}`), cl = cs.length ? ` + ${cs.join(' + ')}` : '';
        r = LEER + `d <- na.omit(datos[${vr([x, y, mm, ...covariables])}])\nnames(d) <- ${vr(['X', 'Y', 'M', ...cs])}   # nombres que lavaan admite\nmodelo <- '\n  M ~ a * X${cl}\n  Y ~ b * M + cp * X${cl}\n  indirecto := a * b\n  total := cp + a * b\n'\nset.seed(${semilla})\najuste <- lavaan::sem(modelo, data = d, se = "bootstrap", bootstrap = ${B})\nlavaan::parameterEstimates(ajuste, boot.ci.type = "perc")`;
    } else {
        r = `# La versión para R de PROCESS (process.R, de processmacro.org) da lo mismo:\nsource("process.R")\n${LEER}process(data = datos, y = ${cr(y)}, x = ${cr(x)}${m.length ? `, m = ${vr(m)}` : ''}${w ? `, w = ${cr(w)}` : ''}${covariables.length ? `, cov = ${vr(covariables)}` : ''}, model = ${modelo}${centrado ? ', center = 1' : ''}, boot = ${B}, seed = ${semilla})`;
    }
    return {
        r, spss,
        nota: `El bootstrap de R o de PROCESS usa otro generador de números aleatorios: los intervalos difieren en la tercera cifra; con muchas remuestras, muy poco.${centrado ? ' Con /center=1, PROCESS muestra los valores de la moderadora con su media restada; el programa, en su escala original.' : ''} ${NOMBRES_SPSS}`
    };
}

/**
 * La depuración.
 * @param {{ items: string[], minimo: number | null, maximo: number | null, enteros?: boolean, id: string | null, umbrales: { perdidosPorCaso: number, zUnivariado: number, pMahalanobis: number, longstringMinimo: number }, duplicados?: string[] }} o
 *   enteros: si un valor no entero también está fuera de rango; duplicados: las columnas con que se comparan las filas (todas
 *   salvo el identificador y los datos del envío, la marca temporal y el número de fila; sin ellas, los ítems)
 * @returns {Sintaxis}
 */
export function sintaxisDepuracion({ items, minimo, maximo, enteros = false, id, umbrales: U, duplicados = items }) {
    const k = items.length, umbralLs = Math.max(U.longstringMinimo, Math.ceil(k / 2)), soloItems = duplicados.length === items.length && duplicados.every((c, i) => c === items[i]);
    const lineas = [
        `it <- datos[${vr(items)}]`,
        `duplicated(datos[${vr(duplicados)}])   # casos duplicados (${soloItems ? 'en los ítems' : 'en las columnas que comparó el programa'})`,
        ...(id ? [`duplicated(datos$${nr(id)}, incomparables = NA)   # identificadores repetidos (los vacíos no cuentan)`] : []),
        ...(minimo !== null && maximo !== null ? [`rowSums(it < ${num(minimo)} | it > ${num(maximo)}${enteros ? ' | it != round(it)' : ''}, na.rm = TRUE) > 0   # fuera de rango${enteros ? ' (o no enteros)' : ''}`] : []),
        `rowMeans(is.na(it)) > ${num(U.perdidosPorCaso)}   # más del ${Math.round(100 * U.perdidosPorCaso)} % en blanco`,
        ...(k >= U.longstringMinimo ? [`careless::longstring(it) >= ${umbralLs}   # respuestas iguales seguidas`, `rowSums(!is.na(it)) >= ${U.longstringMinimo} & careless::irv(it) == 0   # la misma respuesta en todo (con ${U.longstringMinimo} o más respondidos)`] : []),
        `abs(scale(it)) > ${num(U.zUnivariado)}   # atípicos univariados`,
        'completos <- na.omit(it)',
        'd2 <- mahalanobis(completos, colMeans(completos), cov(completos))',
        `pchisq(d2, df = ncol(completos), lower.tail = FALSE) < ${num(U.pMahalanobis)}   # atípicos multivariados`
    ];
    return {
        r: LEER + lineas.join('\n'),
        spss: `* Atípicos univariados (puntuaciones z) y multivariados (D² de Mahalanobis).\nDESCRIPTIVES VARIABLES=${nss(items)} /SAVE.\nCOMPUTE id_caso = $CASENUM.\nREGRESSION /DEPENDENT=id_caso /METHOD=ENTER ${nss(items)} /SAVE MAHAL(D2).\nCOMPUTE p_D2 = SIG.CHISQ(D2, ${k}).\nCOUNT blancos = ${nss(items)} (MISSING).${minimo !== null && maximo !== null ? `\nCOMPUTE fuera_rango = 0.\nDO REPEAT v = ${nss(items)}.\n  IF (NOT MISSING(v) AND (v < ${num(minimo)} OR v > ${num(maximo)}${enteros ? ' OR v <> RND(v)' : ''})) fuera_rango = fuera_rango + 1.\nEND REPEAT.` : ''}\n* Duplicados: Datos > Identificar casos duplicados, con ${soloItems ? 'los ítems' : 'todas las variables salvo el identificador, la marca temporal y el número de fila'}.${id ? `\n* Identificadores repetidos: lo mismo, con solo ${ns(id)}.` : ''}`,
        nota: `La cadena de respuestas iguales y la variabilidad intraindividual no tienen un procedimiento en SPSS; en R, el paquete careless. ${NOMBRES_SPSS}`
    };
}

/**
 * Los datos perdidos y la imputación múltiple.
 * @param {{ variables: string[], metodo: 'pmm' | 'norm' | null, m: number, iteraciones: number, semilla: number }} o metodo: null
 *   si aún no se imputó
 * @returns {Sintaxis}
 */
export function sintaxisPerdidos({ variables, metodo, m, iteraciones, semilla }) {
    const imputar = metodo
        ? `\nimp <- mice::mice(v, m = ${m}, method = ${cr(metodo)}, maxit = ${iteraciones}, seed = ${semilla})\nsummary(mice::pool(with(imp, lm(${nr(/** @type {string} */ (variables[0]))} ~ 1))))   # la media combinada (o el análisis que sigue)`
        : '';
    return {
        r: LEER + `v <- datos[${vr(variables)}]\nnaniar::miss_var_summary(v)\nmice::md.pattern(v)\nnaniar::mcar_test(v)                             # la prueba de Little${imputar}`,
        spss: `MVA VARIABLES=${nss(variables)}\n  /MPATTERN /EM.\n* La prueba de Little sale bajo la tabla de las medias del EM.${metodo ? `\nSET SEED=${semilla}.\nDATASET DECLARE imputadas.\nMULTIPLE IMPUTATION ${nss(variables)}\n  /IMPUTE METHOD=FCS NIMPUTATIONS=${m} MAXITER=${iteraciones}${metodo === 'pmm' ? ' SCALEMODEL=PMM' : ''}\n  /OUTFILE IMPUTATIONS=imputadas.\n* Con «imputadas» activo, los análisis combinan las imputaciones (Imputation_).` : ''}`,
        nota: `${metodo ? 'Otro generador de números aleatorios da otras imputaciones: las medias combinadas coinciden en las primeras cifras, no en todas. ' : ''}MVA y MULTIPLE IMPUTATION necesitan el módulo Missing Values de SPSS. ${NOMBRES_SPSS}`
    };
}

/**
 * Los baremos.
 * @param {{ escala: string, grupo: string | null, cortes: number[] }} o
 * @returns {Sintaxis}
 */
export function sintaxisBaremos({ escala, grupo, cortes }) {
    const p = cortes.map(c => num(c / 100)).join(', '), x = `datos$${nr(escala)}`;
    const baremo = `baremo <- function(x) {\n  x <- x[!is.na(x)]; f <- table(x); fa <- cumsum(f); pc <- 100 * (fa - f / 2) / length(x)   # el percentil del punto medio\n  data.frame(PD = as.numeric(names(f)), f = as.vector(f), fa = as.vector(fa), Percentil = round(as.vector(pc), 1),\n    T = round(50 + 10 * qnorm(as.vector(pc) / 100), 1))   # la T normalizada\n}\n`;
    const porGrupo = grupo ? `\n# por grupo de ${grupo} (si los baremos se diferencian):\nlapply(split(${x}, datos$${nr(grupo)}), baremo)\nlapply(split(${x}, datos$${nr(grupo)}), quantile, probs = c(${p}), type = 7, na.rm = TRUE)` : '';
    return {
        r: LEER + `${baremo}baremo(${x})\nquantile(${x}, c(${p}), type = 7, na.rm = TRUE)   # los cortes de los niveles${porGrupo}`,
        spss: `RANK VARIABLES=${ns(escala)} (A) /PERCENT INTO PC_${ns(escala)} /TIES=MEAN.\n* SPSS da el rango medio entre n: el punto medio más 50/n, casi igual.\nFREQUENCIES VARIABLES=${ns(escala)} /PERCENTILES=${cortes.join(' ')} /FORMAT=NOTABLE.${grupo ? `\n* Por grupo de ${ns(grupo)} (si los baremos se diferencian):\nRANK VARIABLES=${ns(escala)} (A) BY ${ns(grupo)} /PERCENT INTO PCg_${ns(escala)} /TIES=MEAN.\nSORT CASES BY ${ns(grupo)}.\nSPLIT FILE LAYERED BY ${ns(grupo)}.\nFREQUENCIES VARIABLES=${ns(escala)} /PERCENTILES=${cortes.join(' ')} /FORMAT=NOTABLE.\nSPLIT FILE OFF.` : ''}`,
        nota: `Los percentiles de FREQUENCIES de SPSS son de otra definición (HAVERAGE, el tipo 6 de R): los cortes pueden diferir un poco de los del programa y de R (tipo 7). ${NOMBRES_SPSS}`
    };
}

/**
 * La curva ROC.
 * @param {{ puntuacion: string, criterio: string, positivo: string, sentido: 'mayor' | 'menor' }} o
 * @returns {Sintaxis}
 */
export function sintaxisROC({ puntuacion, criterio, positivo, sentido }) {
    const valorSPSS = /^-?\d+(\.\d+)?$/.test(positivo) ? positivo : `'${positivo.replace(/'/g, "''")}'`;
    return {
        r: LEER + `caso <- datos$${nr(criterio)} == ${cr(positivo)}\ncurva <- pROC::roc(caso, datos$${nr(puntuacion)}, levels = c(FALSE, TRUE), direction = ${cr(sentido === 'mayor' ? '<' : '>')})\npROC::ci.auc(curva, method = "delong")\npROC::coords(curva, "best", best.method = "youden", ret = c("threshold", "sensitivity", "specificity", "ppv", "npv"))`,
        spss: `ROC ${ns(puntuacion)} BY ${ns(criterio)} (${valorSPSS})\n  /PLOT=CURVE(REFERENCE)\n  /PRINT=SE COORDINATES\n  /CRITERIA=CUTOFF(INCLUDE) TESTPOS(${sentido === 'mayor' ? 'LARGE' : 'SMALL'}) DISTRIBUTION(FREE) CI(95).`,
        nota: `pROC da los umbrales como puntos medios entre valores observados; el programa, como el valor observado desde el que se clasifica como caso. ${NOMBRES_SPSS}`
    };
}

/**
 * La potencia.
 * @param {{ modo: string, prueba: string, efecto: number, alfa: number, colas: number, potenciaDeseada: number, razon: number, k: number, gl: number,
 *   predictores: number, probados: number, n: number, n2: number | null, b?: number, cp?: number, R?: number, semilla?: number }} P el
 *   resultado de la tarjeta (con el n hallado o dado)
 * @returns {Sintaxis}
 */
export function sintaxisPotencia(P) {
    const alt = P.colas === 2 ? '"two.sided"' : '"greater"', a = `sig.level = ${num(P.alfa)}`, pot = `power = ${num(P.potenciaDeseada)}`;
    const test = P.colas === 2 ? 'NONDIRECTIONAL' : 'DIRECTIONAL', conN = P.modo === 'muestra' ? 'con el n hallado' : P.modo === 'sensibilidad' ? 'con el efecto hallado' : 'con ese n';
    /** Las tres preguntas con la misma función: el n, la potencia o el efecto. @param {string} f @param {string} ef @param {string} n @param {string} resto */
    const tres = (f, ef, n, resto) => (P.modo === 'muestra' ? `${f}(${ef}, ${pot}, ${a}${resto})   # el n (se redondea hacia arriba)\n${f}(${ef}, ${n}, ${a}${resto})   # la potencia con ese n`
        : P.modo === 'potencia' ? `${f}(${ef}, ${n}, ${a}${resto})` : `${f}(${n}, ${pot}, ${a}${resto})   # el efecto mínimo detectable`);
    let r = '', spss = '', nota = 'pwr y G*Power usan las mismas distribuciones no centrales que el programa.';
    if (P.prueba === 't2') {
        r = P.razon === 1 ? tres('pwr::pwr.t.test', `d = ${num(P.efecto)}`, `n = ${P.n}`, `, type = "two.sample", alternative = ${alt}`)
            : `pwr::pwr.t2n.test(n1 = ${P.n}, n2 = ${P.n2}, ${P.modo === 'sensibilidad' ? pot : `d = ${num(P.efecto)}`}, ${a}, alternative = ${alt})`;
        spss = `* SPSS 27 o posterior (Analizar > Análisis de potencia > Medias > Muestras independientes): la potencia ${conN}.\nPOWER MEANS INDEPENDENT\n  /PARAMETERS TEST=${test} SIGNIFICANCE=${num(P.alfa)} N=${P.n} ${P.n2 ?? Math.ceil(P.razon * P.n)} MEAN=${num(P.efecto)} SD=1.`;
    } else if (P.prueba === 't1') {
        r = tres('pwr::pwr.t.test', `d = ${num(P.efecto)}`, `n = ${P.n}`, `, type = "paired", alternative = ${alt}`);
        spss = '* SPSS 27 o posterior: Analizar > Análisis de potencia > Medias > Muestras relacionadas (POWER MEANS RELATED), con la media de las diferencias igual a dz y su desviación típica, 1.\n* O G*Power 3.1: Pruebas t > Medias: diferencia entre dos medias dependientes.';
    } else if (P.prueba === 'r') {
        r = tres('pwr::pwr.r.test', `r = ${num(P.efecto)}`, `n = ${P.n}`, `, alternative = ${alt}`);
        spss = `* SPSS 27 o posterior (Analizar > Análisis de potencia > Correlaciones > Pearson de una muestra): la potencia ${conN}.\nPOWER PEARSON ONESAMPLE\n  /PARAMETERS TEST=${test} SIGNIFICANCE=${num(P.alfa)} N=${P.n} NULL=0 ALTERNATIVE=${num(P.efecto)}.`;
        nota = 'pwr usa la aproximación de Cohen y SPSS la z de Fisher; el programa, la distribución exacta de r (la de G*Power): el n puede diferir en uno o dos casos.';
    } else if (P.prueba === 'anova') {
        r = tres('pwr::pwr.anova.test', `f = ${num(P.efecto)}`, `n = ${P.n}`, `, k = ${P.k}`) + '   # n de cada grupo';
        spss = '* SPSS 27 o posterior: Analizar > Análisis de potencia > Medias > ANOVA de un factor (POWER ONEWAY ANOVA), con unas medias de grupo y una desviación típica común que den esa f.\n* O G*Power 3.1: Pruebas F > ANOVA: efectos fijos, un factor.';
    } else if (P.prueba === 'chi2') {
        r = tres('pwr::pwr.chisq.test', `w = ${num(P.efecto)}`, `N = ${P.n}`, `, df = ${P.gl}`);
        spss = '* SPSS no calcula esta potencia: G*Power 3.1, Pruebas χ² > Tablas de contingencia (con w y los gl).';
    } else if (P.prueba === 'regresion') {
        const p = P.predictores, q = P.probados;
        if (q === p) r = tres('pwr::pwr.f2.test', `f2 = ${num(P.efecto)}`, `v = ${P.n - p - 1}`, `, u = ${q}`) + `   # N = v + ${p + 1}`;
        else {
            // el incremento de q de p predictores: pwr.f2.test usaría λ = f²·(u + v + 1) = f²·(N − p + q), no f²·N
            const potencia = `f2 <- ${num(P.efecto)}; p <- ${p}; q <- ${q}; alfa <- ${num(P.alfa)}\npotencia <- function(N, f2) { v <- N - p - 1; 1 - pf(qf(1 - alfa, q, v), q, v, ncp = f2 * N) }   # λ = f²·N, la de G*Power y el programa\n`;
            r = potencia + (P.modo === 'muestra' ? `N <- p + 2; while (potencia(N, f2) < ${num(P.potenciaDeseada)}) N <- N + 1\nN   # el N mínimo\npotencia(N, f2)   # la potencia con ese N`
                : P.modo === 'potencia' ? `potencia(${P.n}, f2)`
                : `uniroot(function(f2) potencia(${P.n}, f2) - ${num(P.potenciaDeseada)}, c(1e-6, 10))$root   # el f² mínimo detectable`);
            nota = 'pwr::pwr.f2.test usa λ = f²·(u + v + 1), que es f²·N solo si se prueban todos los predictores: para un incremento, la función de arriba da la potencia de G*Power y del programa.';
        }
        spss = `* SPSS 27 o posterior (Analizar > Análisis de potencia > Regresión > Lineal univariada).\nPOWER UNIVARIATE LINEAR\n  /PARAMETERS SIGNIFICANCE=${num(P.alfa)} ${P.modo === 'muestra' ? `POWER=${num(P.potenciaDeseada)}` : `N=${P.n}`} TOTAL_PREDICTORS=${p} TEST_PREDICTORS=${q} PARTIAL_CORR=${num(Math.sqrt(P.efecto / (1 + P.efecto)))}.\n* PARTIAL_CORR: la correlación parcial (múltiple) de los predictores probados, √(f²/(1 + f²)).`;
    } else if (P.prueba === 'mediacion') {
        r = `# La significación conjunta de a y b por Monte Carlo, como el programa: el modelo de Fritz y MacKinnon (2007), con X y los\n# errores de M y de Y normales de varianza 1 (con otro generador, la potencia difiere un poco)\nset.seed(${P.semilla ?? 2027}); n <- ${P.n}; a <- ${num(P.efecto)}; b <- ${num(P.b ?? 0)}; cp <- ${num(P.cp ?? 0)}\nsignificativas <- replicate(${P.R ?? 1000}, {\n  x <- rnorm(n); m <- a * x + rnorm(n); y <- cp * x + b * m + rnorm(n)\n  pa <- summary(lm(m ~ x))$coefficients[2, 4]; pb <- summary(lm(y ~ x + m))$coefficients[3, 4]\n  pa < ${num(P.alfa)} && pb < ${num(P.alfa)} })\nmean(significativas)   # la potencia con ese n`;
        spss = '* Ni SPSS ni G*Power calculan la potencia de la mediación: la simulación de R de arriba es la equivalente.';
        nota = 'Con otro generador de números aleatorios, la potencia simulada difiere en unas centésimas (con 1000 réplicas, ± .03).';
    }
    return { r, spss, nota };
}

/**
 * La TRI y el DIF.
 * @param {{ items: string[], modelo: 'rasch' | '2pl' | 'grm', grupo: string | null }} o
 * @returns {Sintaxis}
 */
export function sintaxisTRI({ items, modelo, grupo }) {
    const tipo = modelo === 'grm' ? 'graded' : modelo === '2pl' ? '2PL' : 'Rasch';
    const preparar = `it <- datos[${vr(items)}]\nusar <- rowSums(!is.na(it)) > 0   # sin las personas sin ninguna respuesta, como el programa\nit <- it[usar, ]\n`;
    const ajuste = `m <- mirt::mirt(it, 1, itemtype = ${cr(tipo)}, SE = TRUE, SE.type = "crossprod")\nmirt::coef(m, IRTpars = TRUE, printSE = TRUE)   # los parámetros, con sus errores típicos\ntheta <- mirt::fscores(m, method = "EAP", full.scores.SE = TRUE)\nmirt::empirical_rxx(theta)   # la fiabilidad marginal\nplot(m, type = "info")`;
    // el DIF como el programa: el total con la regla del 80 % (con las respuestas tal cual), los grupos de menos de 10 fuera,
    // los tres modelos de cada ítem con sus razones de verosimilitud, el ΔR² de Nagelkerke y la p de Holm entre los ítems
    const dif = !grupo ? '' : `\n# El DIF por regresión logística (ordinal si el ítem tiene más de dos respuestas), con el total como criterio:\ng <- factor(datos$${nr(grupo)}[usar])
J <- ncol(it); respondidos <- rowSums(!is.na(it))
total <- ifelse(respondidos >= 0.8 * J, rowMeans(it, na.rm = TRUE) * J, NA)   # la regla del 80 %
n_g <- table(g[!is.na(total)]); g[g %in% names(n_g)[n_g < 10]] <- NA; g <- droplevels(g)   # los grupos de menos de 10, fuera
ok <- !is.na(total) & !is.na(g); tc <- total - mean(total[ok])
nagelkerke <- function(ll, ll0, n) (1 - exp(2 * (ll0 - ll) / n)) / (1 - exp(2 * ll0 / n))
dif <- t(sapply(names(it), function(j) {
  d <- data.frame(y = factor(it[[j]], ordered = TRUE), tc, g)[ok & !is.na(it[[j]]), ]; d$y <- droplevels(d$y); d$g <- droplevels(d$g)
  ajustar <- function(f) if (nlevels(d$y) == 2) glm(f, family = binomial, data = d) else MASS::polr(f, data = d)
  ll <- sapply(list(y ~ tc, y ~ tc + g, y ~ tc * g), function(f) as.numeric(logLik(ajustar(f))))
  frec <- table(d$y); ll0 <- sum(frec * log(frec / nrow(d)))   # el modelo de solo umbrales
  gl <- nlevels(d$g) - 1; r2 <- nagelkerke(ll, ll0, nrow(d))
  c(chi2_total = 2 * (ll[3] - ll[1]), p = pchisq(2 * (ll[3] - ll[1]), 2 * gl, lower.tail = FALSE),
    chi2_uniforme = 2 * (ll[2] - ll[1]), chi2_no_uniforme = 2 * (ll[3] - ll[2]), deltaR2 = r2[3] - r2[1])
}))
cbind(dif, p_holm = p.adjust(dif[, "p"], method = "holm"))`;
    return {
        r: LEER + preparar + ajuste + dif,
        spss: `* SPSS no estima modelos de TRI sin extensiones (STATS IRT, que usa R por debajo).${grupo ? '\n* El DIF: PLUM (ítems ordinales) o LOGISTIC REGRESSION (dicotómicos) con el total, después el total y el grupo, y por último su interacción, comparando el −2LL de cada paso.' : ''}`,
        nota: `mirt usa la misma cuadratura (61 puntos de −6 a 6) y el mismo algoritmo EM: los parámetros coinciden en las primeras cifras. Sus errores típicos por defecto son los de Oakes; con SE.type = "crossprod", los del programa.${modelo === 'rasch' ? ' En el Rasch de mirt, la discriminación vale 1 y la DE del rasgo es la raíz de COV_11 (en GroupPars).' : ''}`
    };
}

/**
 * El modelo multinivel.
 * @param {{ y: string, predictores: string[], grupo: string, centrado: ('ninguno' | 'gran-media' | 'grupo')[], medias?: string[] }} o
 *   centrado: el de cada predictor; medias: los predictores cuya media de grupo (centrada en la gran media) también entra
 * @returns {Sintaxis}
 */
export function sintaxisMultinivel({ y, predictores, grupo, centrado, medias = [] }) {
    const sufijo = { grupo: '_cg', 'gran-media': '_cm', ninguno: '' };
    const nombres = predictores.map((p, k) => `${p}${sufijo[/** @type {'grupo'} */ (centrado[k])]}`), nombresMedias = medias.map(p => `${p}_mg`), todos = [...nombres, ...nombresMedias];
    const g = nr(grupo), col = (/** @type {string} */ c) => `d$${nr(c)}`;
    const preparar = [
        ...predictores.map((p, k) => (centrado[k] === 'grupo' ? `${col(`${p}_cg`)} <- ${col(p)} - ave(${col(p)}, d$${g})   # centrado en el grupo` : centrado[k] === 'gran-media' ? `${col(`${p}_cm`)} <- ${col(p)} - mean(${col(p)})   # centrado en la gran media` : '')),
        ...medias.map(p => `${col(`${p}_mg`)} <- ave(${col(p)}, d$${g}) - mean(${col(p)})   # la media del grupo, centrada`)
    ].filter(Boolean);
    const conGrupo = new Set([...predictores.filter((_, k) => centrado[k] === 'grupo'), ...medias]), conTodos = new Set([...predictores.filter((_, k) => centrado[k] === 'gran-media'), ...medias]);
    const spssPrevio = [
        ...[...conGrupo].map(p => `AGGREGATE /OUTFILE=* MODE=ADDVARIABLES /BREAK=${ns(grupo)} /mg_${ns(p)}=MEAN(${ns(p)}).`),
        ...[...conTodos].map(p => `AGGREGATE /OUTFILE=* MODE=ADDVARIABLES /m_${ns(p)}=MEAN(${ns(p)}).`),
        ...predictores.map((p, k) => (centrado[k] === 'grupo' ? `COMPUTE ${ns(`${p}_cg`)} = ${ns(p)} - mg_${ns(p)}.` : centrado[k] === 'gran-media' ? `COMPUTE ${ns(`${p}_cm`)} = ${ns(p)} - m_${ns(p)}.` : '')),
        ...medias.map(p => `COMPUTE ${ns(`${p}_mg`)} = mg_${ns(p)} - m_${ns(p)}.`)
    ].filter(Boolean);
    const f = todos.length ? todos.map(nr).join(' + ') : '1';
    return {
        r: LEER + `d <- na.omit(datos[${vr([y, ...predictores, grupo])}])\n${preparar.length ? preparar.join('\n') + '\n' : ''}nulo <- lmerTest::lmer(${nr(y)} ~ 1 + (1 | ${g}), data = d)\nperformance::icc(nulo)                           # la CCI del modelo nulo\nm <- lmerTest::lmer(${nr(y)} ~ ${f} + (1 | ${g}), data = d)   # REML\nsummary(m)                                       # con los gl de Satterthwaite\nperformance::r2_nakagawa(m)\nlmerTest::ranova(m)                              # σ²u = 0 (su p, sin la mezcla de χ²: el doble de la del programa)`,
        spss: `${spssPrevio.length ? '* Antes, selecciona los casos completos (como el programa), para que las medias coincidan.\n' + spssPrevio.join('\n') + '\n' : ''}MIXED ${ns(y)}${todos.length ? ` WITH ${nss(todos)}` : ''}${todos.length ? `\n  /FIXED=${nss(todos)} | SSTYPE(3)` : ''}\n  /METHOD=REML\n  /PRINT=SOLUTION TESTCOV\n  /RANDOM=INTERCEPT | SUBJECT(${ns(grupo)}) COVTYPE(VC).`,
        nota: `SPSS MIXED usa gl de Satterthwaite, como lmerTest y el programa; su prueba de σ²u (la de Wald, en TESTCOV) no es la de razón de verosimilitudes. MIXED necesita el módulo Advanced Statistics de SPSS. ${NOMBRES_SPSS}`
    };
}

/**
 * El bloque plegable con las dos sintaxis (HTML del programa; los nombres de columnas, escapados), cada una con su botón de
 * copiar (lo atiende informe/sintaxis-copiar.js). (2027.01.20, revisión) Cada botón dice qué copia y cada bloque de código se
 * puede recorrer con el teclado.
 * @param {Sintaxis} s
 * @returns {string}
 */
export function bloqueSintaxis(s) {
    const parte = (/** @type {string} */ lenguaje, /** @type {string} */ t) => `<p class="help-text sintaxis-cabeza"><b>${lenguaje}</b> <button type="button" class="btn btn-outline sintaxis-copiar" data-lenguaje="${lenguaje}" aria-label="Copiar la sintaxis de ${lenguaje}">Copiar</button></p><pre class="sintaxis-codigo" tabindex="0" aria-label="Sintaxis de ${lenguaje}"><code>${escaparHTML(t)}</code></pre>`;
    return `<details class="aiken-referencias sintaxis-equivalente"><summary>Sintaxis equivalente en R y SPSS</summary>${parte('R', s.r)}${parte('SPSS', s.spss)}${s.nota ? `<p class="help-text">${escaparHTML(s.nota)}</p>` : ''}</details>`;
}
