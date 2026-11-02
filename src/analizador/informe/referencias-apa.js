// @ts-check
// analizador/informe/referencias-apa.js — (2027.01.17) el catálogo de las referencias APA 7 (en castellano: «y» entre los
// dos últimos autores, «2.ª ed.», «En … (Eds.)») de los análisis nuevos del Analizador, una sola vez cada una: las tarjetas
// piden las que citan por su clave y las reciben en orden alfabético y sin repetir. HTML propio del programa (las cursivas
// de los títulos y volúmenes), nunca del usuario.

/** @type {Readonly<Record<string, string>>} */
export const REFERENCIAS = Object.freeze({
    aera2014: 'American Educational Research Association, American Psychological Association y National Council on Measurement in Education. (2014). <i>Standards for educational and psychological testing</i>. American Educational Research Association.',
    aiken1991: 'Aiken, L. S. y West, S. G. (1991). <i>Multiple regression: Testing and interpreting interactions</i>. Sage.',
    angoff1971: 'Angoff, W. H. (1971). Scales, norms, and equivalent scores. En R. L. Thorndike (Ed.), <i>Educational measurement</i> (2.ª ed., pp. 508–600). American Council on Education.',
    bakeman2005: 'Bakeman, R. (2005). Recommended effect size statistics for repeated measures designs. <i>Behavior Research Methods, 37</i>(3), 379–384. https://doi.org/10.3758/BF03192707',
    baker2001: 'Baker, F. B. (2001). <i>The basics of item response theory</i> (2.ª ed.). ERIC Clearinghouse on Assessment and Evaluation.',
    barnard1999: 'Barnard, J. y Rubin, D. B. (1999). Small-sample degrees of freedom with multiple imputation. <i>Biometrika, 86</i>(4), 948–955. https://doi.org/10.1093/biomet/86.4.948',
    benavoli2016: 'Benavoli, A., Corani, G. y Mangili, F. (2016). Should we really use post-hoc tests based on mean-ranks? <i>Journal of Machine Learning Research, 17</i>(5), 1–10. https://jmlr.org/papers/v17/benavoli16a.html',
    birnbaum1968: 'Birnbaum, A. (1968). Some latent trait models and their use in inferring an examinee\'s ability. En F. M. Lord y M. R. Novick (Eds.), <i>Statistical theories of mental test scores</i> (pp. 397–479). Addison-Wesley.',
    bock1981: 'Bock, R. D. y Aitkin, M. (1981). Marginal maximum likelihood estimation of item parameters: Application of an EM algorithm. <i>Psychometrika, 46</i>(4), 443–459. https://doi.org/10.1007/BF02293801',
    bonett2000: 'Bonett, D. G. y Wright, T. A. (2000). Sample size requirements for estimating Pearson, Kendall and Spearman correlations. <i>Psychometrika, 65</i>(1), 23–28. https://doi.org/10.1007/BF02294183',
    box1949: 'Box, G. E. P. (1949). A general distribution theory for a class of likelihood criteria. <i>Biometrika, 36</i>(3/4), 317–346. https://doi.org/10.2307/2332671',
    canfield1951: 'Canfield, A. A. (1951). The «sten» scale: A modified C-scale. <i>Educational and Psychological Measurement, 11</i>(2), 295–297. https://doi.org/10.1177/001316445101100213',
    chalmers2012: 'Chalmers, R. P. (2012). mirt: A multidimensional item response theory package for the R environment. <i>Journal of Statistical Software, 48</i>(6), 1–29. https://doi.org/10.18637/jss.v048.i06',
    clopper1934: 'Clopper, C. J. y Pearson, E. S. (1934). The use of confidence or fiducial limits illustrated in the case of the binomial. <i>Biometrika, 26</i>(4), 404–413. https://doi.org/10.1093/biomet/26.4.404',
    cochran1950: 'Cochran, W. G. (1950). The comparison of percentages in matched samples. <i>Biometrika, 37</i>(3/4), 256–266. https://doi.org/10.2307/2332378',
    cochran1954: 'Cochran, W. G. (1954). Some methods for strengthening the common χ² tests. <i>Biometrics, 10</i>(4), 417–451. https://doi.org/10.2307/3001616',
    cohen1988: 'Cohen, J. (1988). <i>Statistical power analysis for the behavioral sciences</i> (2.ª ed.). Lawrence Erlbaum Associates.',
    cousineau2005: 'Cousineau, D. (2005). Confidence intervals in within-subject designs: A simpler solution to Loftus and Masson’s method. <i>Tutorials in Quantitative Methods for Psychology, 1</i>(1), 42–45. https://doi.org/10.20982/tqmp.01.1.p042',
    curran2016: 'Curran, P. G. (2016). Methods for the detection of carelessly invalid responses in survey data. <i>Journal of Experimental Social Psychology, 66</i>, 4–19. https://doi.org/10.1016/j.jesp.2015.07.006',
    delong1988: 'DeLong, E. R., DeLong, D. M. y Clarke-Pearson, D. L. (1988). Comparing the areas under two or more correlated receiver operating characteristic curves: A nonparametric approach. <i>Biometrics, 44</i>(3), 837–845. https://doi.org/10.2307/2531595',
    dempster1977: 'Dempster, A. P., Laird, N. M. y Rubin, D. B. (1977). Maximum likelihood from incomplete data via the EM algorithm. <i>Journal of the Royal Statistical Society: Series B (Methodological), 39</i>(1), 1–22. https://doi.org/10.1111/j.2517-6161.1977.tb01600.x',
    dunn2018: 'Dunn, A. M., Heggestad, E. D., Shanock, L. R. y Theilgard, N. (2018). Intra-individual response variability as an indicator of insufficient effort responding: Comparison to other indicators and relationships with individual differences. <i>Journal of Business and Psychology, 33</i>(1), 105–121. https://doi.org/10.1007/s10869-016-9479-0',
    efron1993: 'Efron, B. y Tibshirani, R. J. (1993). <i>An introduction to the bootstrap</i>. Chapman & Hall. https://doi.org/10.1201/9780429246593',
    embretson2000: 'Embretson, S. E. y Reise, S. P. (2000). <i>Item response theory for psychologists</i>. Lawrence Erlbaum Associates.',
    enders2007: 'Enders, C. K. y Tofighi, D. (2007). Centering predictor variables in cross-sectional multilevel models: A new look at an old issue. <i>Psychological Methods, 12</i>(2), 121–138. https://doi.org/10.1037/1082-989X.12.2.121',
    enders2022: 'Enders, C. K. (2022). <i>Applied missing data analysis</i> (2.ª ed.). Guilford Press.',
    faul2007: 'Faul, F., Erdfelder, E., Lang, A.-G. y Buchner, A. (2007). G*Power 3: A flexible statistical power analysis program for the social, behavioral, and biomedical sciences. <i>Behavior Research Methods, 39</i>(2), 175–191. https://doi.org/10.3758/BF03193146',
    faul2009: 'Faul, F., Erdfelder, E., Buchner, A. y Lang, A.-G. (2009). Statistical power analyses using G*Power 3.1: Tests for correlation and regression analyses. <i>Behavior Research Methods, 41</i>(4), 1149–1160. https://doi.org/10.3758/BRM.41.4.1149',
    fisher1921: 'Fisher, R. A. (1921). On the «probable error» of a coefficient of correlation deduced from a small sample. <i>Metron, 1</i>, 3–32.',
    fisher1935: 'Fisher, R. A. (1935). The logic of inductive inference. <i>Journal of the Royal Statistical Society, 98</i>(1), 39–82. https://doi.org/10.2307/2342435',
    freeman1951: 'Freeman, G. H. y Halton, J. H. (1951). Note on an exact treatment of contingency, goodness of fit and other problems of significance. <i>Biometrika, 38</i>(1/2), 141–149. https://doi.org/10.2307/2332323',
    fritz2007: 'Fritz, M. S. y MacKinnon, D. P. (2007). Required sample size to detect the mediated effect. <i>Psychological Science, 18</i>(3), 233–239. https://doi.org/10.1111/j.1467-9280.2007.01882.x',
    friedman1937: 'Friedman, M. (1937). The use of ranks to avoid the assumption of normality implicit in the analysis of variance. <i>Journal of the American Statistical Association, 32</i>(200), 675–701. https://doi.org/10.1080/01621459.1937.10503522',
    girden1992: 'Girden, E. R. (1992). <i>ANOVA: Repeated measures</i>. Sage.',
    greenhouse1959: 'Greenhouse, S. W. y Geisser, S. (1959). On methods in the analysis of profile data. <i>Psychometrika, 24</i>(2), 95–112. https://doi.org/10.1007/BF02289823',
    haberman1973: 'Haberman, S. J. (1973). The analysis of residuals in cross-classified tables. <i>Biometrics, 29</i>(1), 205–220. https://doi.org/10.2307/2529686',
    hanley1982: 'Hanley, J. A. y McNeil, B. J. (1982). The meaning and use of the area under a receiver operating characteristic (ROC) curve. <i>Radiology, 143</i>(1), 29–36. https://doi.org/10.1148/radiology.143.1.7063747',
    hayes2015: 'Hayes, A. F. (2015). An index and test of linear moderated mediation. <i>Multivariate Behavioral Research, 50</i>(1), 1–22. https://doi.org/10.1080/00273171.2014.962683',
    hayes2022: 'Hayes, A. F. (2022). <i>Introduction to mediation, moderation, and conditional process analysis: A regression-based approach</i> (3.ª ed.). Guilford Press.',
    holm1979: 'Holm, S. (1979). A simple sequentially rejective multiple test procedure. <i>Scandinavian Journal of Statistics, 6</i>(2), 65–70.',
    hosmer2013: 'Hosmer, D. W., Lemeshow, S. y Sturdivant, R. X. (2013). <i>Applied logistic regression</i> (3.ª ed.). Wiley. https://doi.org/10.1002/9781118548387',
    hotelling1953: 'Hotelling, H. (1953). New light on the correlation coefficient and its transforms. <i>Journal of the Royal Statistical Society: Series B (Methodological), 15</i>(2), 193–232. https://doi.org/10.1111/j.2517-6161.1953.tb00135.x',
    huynh1976: 'Huynh, H. y Feldt, L. S. (1976). Estimation of the Box correction for degrees of freedom from sample data in randomized block and split-plot designs. <i>Journal of Educational Statistics, 1</i>(1), 69–82. https://doi.org/10.3102/10769986001001069',
    jodoin2001: 'Jodoin, M. G. y Gierl, M. J. (2001). Evaluating type I error and power rates using an effect size measure with the logistic regression procedure for DIF detection. <i>Applied Measurement in Education, 14</i>(4), 329–349. https://doi.org/10.1207/S15324818AME1404_2',
    johnson1936: 'Johnson, P. O. y Neyman, J. (1936). Tests of certain linear hypotheses and their application to some educational problems. <i>Statistical Research Memoirs, 1</i>, 57–93.',
    johnson2005: 'Johnson, J. A. (2005). Ascertaining the validity of individual protocols from Web-based personality inventories. <i>Journal of Research in Personality, 39</i>(1), 103–129. https://doi.org/10.1016/j.jrp.2004.09.009',
    kendall1939: 'Kendall, M. G. y Babington Smith, B. (1939). The problem of <i>m</i> rankings. <i>The Annals of Mathematical Statistics, 10</i>(3), 275–287. https://doi.org/10.1214/aoms/1177732186',
    kerby2014: 'Kerby, D. S. (2014). The simple difference formula: An approach to teaching nonparametric correlation. <i>Comprehensive Psychology, 3</i>, Artículo 1. https://doi.org/10.2466/11.IT.3.1',
    kish1965: 'Kish, L. (1965). <i>Survey sampling</i>. Wiley.',
    kuznetsova2017: 'Kuznetsova, A., Brockhoff, P. B. y Christensen, R. H. B. (2017). lmerTest package: Tests in linear mixed effects models. <i>Journal of Statistical Software, 82</i>(13), 1–26. https://doi.org/10.18637/jss.v082.i13',
    lakens2013: 'Lakens, D. (2013). Calculating and reporting effect sizes to facilitate cumulative science: A practical primer for <i>t</i>-tests and ANOVAs. <i>Frontiers in Psychology, 4</i>, Artículo 863. https://doi.org/10.3389/fpsyg.2013.00863',
    lakens2022: 'Lakens, D. (2022). Sample size justification. <i>Collabra: Psychology, 8</i>(1), Artículo 33267. https://doi.org/10.1525/collabra.33267',
    lecoutre1991: 'Lecoutre, B. (1991). A correction for the ε̃ approximate test in repeated measures designs with two or more independent groups. <i>Journal of Educational Statistics, 16</i>(4), 371–372. https://doi.org/10.3102/10769986016004371',
    levene1960: 'Levene, H. (1960). Robust tests for equality of variances. En I. Olkin (Ed.), <i>Contributions to probability and statistics: Essays in honor of Harold Hotelling</i> (pp. 278–292). Stanford University Press.',
    leys2019: 'Leys, C., Delacre, M., Mora, Y. L., Lakens, D. y Ley, C. (2019). How to classify, detect, and manage univariate and multivariate outliers, with emphasis on pre-registration. <i>International Review of Social Psychology, 32</i>(1), Artículo 5. https://doi.org/10.5334/irsp.289',
    little1988: 'Little, R. J. A. (1988). A test of missing completely at random for multivariate data with missing values. <i>Journal of the American Statistical Association, 83</i>(404), 1198–1202. https://doi.org/10.1080/01621459.1988.10478722',
    lilliefors1967: 'Lilliefors, H. W. (1967). On the Kolmogorov-Smirnov test for normality with mean and variance unknown. <i>Journal of the American Statistical Association, 62</i>(318), 399–402. https://doi.org/10.1080/01621459.1967.10482916',
    maas2005: 'Maas, C. J. M. y Hox, J. J. (2005). Sufficient sample sizes for multilevel modeling. <i>Methodology, 1</i>(3), 86–92. https://doi.org/10.1027/1614-2241.1.3.86',
    mauchly1940: 'Mauchly, J. W. (1940). Significance test for sphericity of a normal <i>n</i>-variate distribution. <i>The Annals of Mathematical Statistics, 11</i>(2), 204–209. https://doi.org/10.1214/aoms/1177731915',
    maxwell2004: 'Maxwell, S. E. y Delaney, H. D. (2004). <i>Designing experiments and analyzing data: A model comparison perspective</i> (2.ª ed.). Lawrence Erlbaum Associates.',
    mccullagh1980: 'McCullagh, P. (1980). Regression models for ordinal data. <i>Journal of the Royal Statistical Society: Series B (Methodological), 42</i>(2), 109–142. https://doi.org/10.1111/j.2517-6161.1980.tb01109.x',
    mcnemar1947: 'McNemar, Q. (1947). Note on the sampling error of the difference between correlated proportions or percentages. <i>Psychometrika, 12</i>(2), 153–157. https://doi.org/10.1007/BF02295996',
    morey2008: 'Morey, R. D. (2008). Confidence intervals from normalized data: A correction to Cousineau (2005). <i>Tutorials in Quantitative Methods for Psychology, 4</i>(2), 61–64. https://doi.org/10.20982/tqmp.04.2.p061',
    muthen1995: 'Muthén, B. O. y Satorra, A. (1995). Complex sample data in structural equation modeling. <i>Sociological Methodology, 25</i>, 267–316. https://doi.org/10.2307/271070',
    nagelkerke1991: 'Nagelkerke, N. J. D. (1991). A note on a general definition of the coefficient of determination. <i>Biometrika, 78</i>(3), 691–692. https://doi.org/10.1093/biomet/78.3.691',
    nakagawa2013: 'Nakagawa, S. y Schielzeth, H. (2013). A general and simple method for obtaining R² from generalized linear mixed-effects models. <i>Methods in Ecology and Evolution, 4</i>(2), 133–142. https://doi.org/10.1111/j.2041-210x.2012.00261.x',
    olejnik2003: 'Olejnik, S. y Algina, J. (2003). Generalized eta and omega squared statistics: Measures of effect size for some common research designs. <i>Psychological Methods, 8</i>(4), 434–447. https://doi.org/10.1037/1082-989X.8.4.434',
    preacher2008: 'Preacher, K. J. y Hayes, A. F. (2008). Asymptotic and resampling strategies for assessing and comparing indirect effects in multiple mediator models. <i>Behavior Research Methods, 40</i>(3), 879–891. https://doi.org/10.3758/BRM.40.3.879',
    rasch1960: 'Rasch, G. (1960). <i>Probabilistic models for some intelligence and attainment tests</i>. Danmarks Paedagogiske Institut.',
    raudenbush2002: 'Raudenbush, S. W. y Bryk, A. S. (2002). <i>Hierarchical linear models: Applications and data analysis methods</i> (2.ª ed.). Sage.',
    rubin1987: 'Rubin, D. B. (1987). <i>Multiple imputation for nonresponse in surveys</i>. Wiley. https://doi.org/10.1002/9780470316696',
    samejima1969: 'Samejima, F. (1969). Estimation of latent ability using a response pattern of graded scores. <i>Psychometrika, 34</i>(S1), 1–97. https://doi.org/10.1007/BF03372160',
    satterthwaite1946: 'Satterthwaite, F. E. (1946). An approximate distribution of estimates of variance components. <i>Biometrics Bulletin, 2</i>(6), 110–114. https://doi.org/10.2307/3002019',
    schafer2002: 'Schafer, J. L. y Graham, J. W. (2002). Missing data: Our view of the state of the art. <i>Psychological Methods, 7</i>(2), 147–177. https://doi.org/10.1037/1082-989X.7.2.147',
    self1987: 'Self, S. G. y Liang, K.-Y. (1987). Asymptotic properties of maximum likelihood estimators and likelihood ratio tests under nonstandard conditions. <i>Journal of the American Statistical Association, 82</i>(398), 605–610. https://doi.org/10.1080/01621459.1987.10478472',
    serlin1982: 'Serlin, R. C., Carr, J. y Marascuilo, L. A. (1982). A measure of association for selected nonparametric procedures. <i>Psychological Bulletin, 92</i>(3), 786–790. https://doi.org/10.1037/0033-2909.92.3.786',
    shapiro1965: 'Shapiro, S. S. y Wilk, M. B. (1965). An analysis of variance test for normality (complete samples). <i>Biometrika, 52</i>(3/4), 591–611. https://doi.org/10.1093/biomet/52.3-4.591',
    snijders2012: 'Snijders, T. A. B. y Bosker, R. J. (2012). <i>Multilevel analysis: An introduction to basic and advanced multilevel modeling</i> (2.ª ed.). Sage.',
    sobel1982: 'Sobel, M. E. (1982). Asymptotic confidence intervals for indirect effects in structural equation models. <i>Sociological Methodology, 13</i>, 290–312. https://doi.org/10.2307/270723',
    steiger1997: 'Steiger, J. H. y Fouladi, R. T. (1997). Noncentrality interval estimation and the evaluation of statistical models. En L. L. Harlow, S. A. Mulaik y J. H. Steiger (Eds.), <i>What if there were no significance tests?</i> (pp. 221–257). Lawrence Erlbaum Associates.',
    steiger2004: 'Steiger, J. H. (2004). Beyond the <i>F</i> test: Effect size confidence intervals and tests of close fit in the analysis of variance and contrast analysis. <i>Psychological Methods, 9</i>(2), 164–182. https://doi.org/10.1037/1082-989X.9.2.164',
    swaminathan1990: 'Swaminathan, H. y Rogers, H. J. (1990). Detecting differential item functioning using logistic regression procedures. <i>Journal of Educational Measurement, 27</i>(4), 361–370. https://doi.org/10.1111/j.1745-3984.1990.tb00754.x',
    tabachnick2019: 'Tabachnick, B. G. y Fidell, L. S. (2019). <i>Using multivariate statistics</i> (7.ª ed.). Pearson.',
    vanbuuren2011: 'van Buuren, S. y Groothuis-Oudshoorn, K. (2011). mice: Multivariate imputation by chained equations in R. <i>Journal of Statistical Software, 45</i>(3), 1–67. https://doi.org/10.18637/jss.v045.i03',
    wilcoxon1945: 'Wilcoxon, F. (1945). Individual comparisons by ranking methods. <i>Biometrics Bulletin, 1</i>(6), 80–83. https://doi.org/10.2307/3001968',
    wilson1927: 'Wilson, E. B. (1927). Probable inference, the law of succession, and statistical inference. <i>Journal of the American Statistical Association, 22</i>(158), 209–212. https://doi.org/10.1080/01621459.1927.10502953',
    youden1950: 'Youden, W. J. (1950). Index for rating diagnostic tests. <i>Cancer, 3</i>(1), 32–35. https://doi.org/10.1002/1097-0142(1950)3:1&lt;32::AID-CNCR2820030106&gt;3.0.CO;2-3',
    zhao2010: 'Zhao, X., Lynch, J. G. y Chen, Q. (2010). Reconsidering Baron and Kenny: Myths and truths about mediation analysis. <i>Journal of Consumer Research, 37</i>(2), 197–206. https://doi.org/10.1086/651257',
    zumbo1999: 'Zumbo, B. D. (1999). <i>A handbook on the theory and methods of differential item functioning (DIF): Logistic regression modeling as a unitary framework for binary and Likert-type (ordinal) item scores</i>. Directorate of Human Resources Research and Evaluation, Department of National Defense.'
});

/**
 * Las referencias de unas claves, sin repetir y en orden alfabético (el de APA, por el primer autor). Una clave que no está en
 * el catálogo es un error de programación: se lanza.
 * @param {Iterable<string>} claves
 * @returns {string[]}
 */
export function referenciasDe(claves) {
    const unicas = [...new Set(claves)];
    const faltan = unicas.filter(c => !Object.prototype.hasOwnProperty.call(REFERENCIAS, c));
    if (faltan.length) throw new Error(`Referencias sin catalogar: ${faltan.join(', ')}`);
    const sinMarcas = (/** @type {string} */ r) => r.replace(/<[^>]+>/g, '');
    return unicas.map(c => /** @type {string} */ (REFERENCIAS[c])).sort((a, b) => sinMarcas(a).localeCompare(sinMarcas(b), 'es'));
}
